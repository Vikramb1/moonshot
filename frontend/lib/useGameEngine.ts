'use client';

/**
 * useGameEngine
 *
 * Central state manager for a single game session.
 * Owns all mutable game state (status, coins, orders, timer, ship position, PnL)
 * and exposes functions that Game.tsx calls in response to player input and
 * physics events.
 *
 * The hook does NOT render anything — it is pure logic.
 * Game.tsx reads state from this hook and drives the Three.js scene accordingly.
 *
 * @param params  GameParams passed down from the game page URL query string.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coin, GameEndReason, GameParams, GameResult, GameStatus, Order } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * USD notional size placed for every coin collected.
 * Liquid's API takes size as USD notional, not BTC quantity.
 * $10 = minimum meaningful order on most Liquid markets.
 */
const DEFAULT_ORDER_SIZE_USD = 10;

/** Liquid market symbol for BTC perpetual. */
const SYMBOL = 'BTC-PERP';

/** Y-axis bounds for ship clamping (world units). */
export const MIN_Y = -5;
export const MAX_Y = 5;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGameEngine(params: GameParams) {
  const [gameStatus, setGameStatus] = useState<GameStatus>('idle');
  const [coinsCollected, setCoinsCollected] = useState<Coin[]>([]);
  const [ordersPlaced, setOrdersPlaced] = useState<Order[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number>(params.duration);
  const [shipPosition, setShipPosition] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const [totalPnL, setTotalPnL] = useState<number>(0);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);

  // Ref to the countdown / timer interval so it can be cleared from anywhere
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track start time to compute actual elapsed duration in endGame
  const startTimeRef = useRef<number>(0);

  // ---------------------------------------------------------------------------
  // startGame — scaffold (countdown + timer start)
  // ---------------------------------------------------------------------------

  /**
   * startGame()
   *
   * Transitions the game from 'idle' to 'countdown', waits 3 seconds, then
   * switches to 'playing' and starts the per-second countdown timer.
   *
   * Steps:
   *   1. Set gameStatus = 'countdown' so the page renders the 3-2-1 overlay.
   *   2. After 3000ms, set gameStatus = 'playing'.
   *   3. Record startTimeRef.current = Date.now() for elapsed-time tracking.
   *   4. Begin an interval that decrements timeRemaining every 1000ms.
   *      The interval clears itself when timeRemaining hits 0, but
   *      checkGameEndConditions() is responsible for calling endGame('time').
   *
   * TODO: implement countdown visual in game/page.tsx (3… 2… 1… LAUNCH)
   */
  const startGame = useCallback(() => {
    setGameStatus('countdown');
    setTimeRemaining(params.duration);

    setTimeout(() => {
      setGameStatus('playing');
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, 3000);
  }, [params.duration]);

  // ---------------------------------------------------------------------------
  // endGame — scaffold
  // ---------------------------------------------------------------------------

  /**
   * endGame(reason)
   *
   * Terminates the game and assembles the GameResult object for RevealScreen.
   *
   * Steps:
   *   1. Clear the countdown timer interval.
   *   2. Set gameStatus = 'ended'.
   *   3. Compute netDirection: if more buy orders than sell → 'bullish',
   *      more sells → 'bearish', equal → 'neutral'.
   *   4. Compute totalSize: sum of all order sizes.
   *   5. Compute elapsed duration in seconds since startTimeRef.current.
   *   6. Build GameResult and store it in gameResult state.
   *
   * @param reason  Which end condition fired.
   * @returns       The assembled GameResult (also stored in state).
   *
   * TODO: finish building GameResult once PnL tracking is wired up.
   */
  const endGame = useCallback(
    (reason: GameEndReason): GameResult => {
      if (timerRef.current) clearInterval(timerRef.current);
      setGameStatus('ended');

      // Snapshot current orders at call time (state may not have flushed yet)
      // The caller should read from gameResult state after this resolves.
      const elapsed = startTimeRef.current
        ? Math.round((Date.now() - startTimeRef.current) / 1000)
        : params.duration;

      // Derive net direction from side counts
      // TODO: read from ordersPlaced snapshot when available
      const result: GameResult = {
        ordersPlaced: [],       // will be populated from state in a useEffect
        netDirection: 'neutral',
        totalSize: 0,
        duration: elapsed,
        endReason: reason,
        totalPnL: 0,            // will be updated from totalPnL state
      };

      setGameResult(result);
      return result;
    },
    [params.duration],
  );

  // Sync the latest orders + PnL into gameResult once game ends
  useEffect(() => {
    if (gameStatus !== 'ended' || !gameResult) return;

    const buyCount = ordersPlaced.filter((o) => o.side === 'buy').length;
    const sellCount = ordersPlaced.filter((o) => o.side === 'sell').length;
    const netDirection =
      buyCount > sellCount ? 'bullish' : sellCount > buyCount ? 'bearish' : 'neutral';
    const totalSize = ordersPlaced.reduce((sum, o) => sum + o.size, 0);

    setGameResult((prev) =>
      prev
        ? { ...prev, ordersPlaced, netDirection, totalSize, totalPnL }
        : prev,
    );
  }, [gameStatus, ordersPlaced, totalPnL, gameResult]);

  // ---------------------------------------------------------------------------
  // collectCoin — FULLY IMPLEMENTED
  // ---------------------------------------------------------------------------

  /**
   * collectCoin(coin)
   *
   * Called by Game.tsx immediately when collision detection fires for a coin.
   * Marks the coin collected, determines order side, POSTs to the backend,
   * and records the returned Order in state.
   *
   * Side determination:
   *   - Coin priceLevel ABOVE the current market price → player is betting UP → 'buy'
   *   - Coin priceLevel BELOW the current market price → player is betting DOWN → 'sell'
   *   Note: currentPrice is passed in so the hook doesn't need to own the feed.
   *
   * On network failure the game continues — a null liquidOrderId is stored and
   * the error is logged, but no exception propagates to the Three.js frame loop.
   *
   * @param coin          The Coin that was just hit by the ship.
   * @param currentPrice  Live BTC/USD price from useLiquid at the moment of collision.
   */
  const collectCoin = useCallback(async (coin: Coin, currentPrice: number) => {
    // Prevent double-collection
    if (coin.collected) return;

    // Mark coin as collected immediately so the scene can remove it this frame
    setCoinsCollected((prev) => [...prev, { ...coin, collected: true }]);

    // Determine order side based on whether the coin sits above or below market price
    const side: 'buy' | 'sell' = coin.priceLevel >= currentPrice ? 'buy' : 'sell';

    const orderPayload = {
      symbol: SYMBOL,
      price: coin.priceLevel,
      size: DEFAULT_ORDER_SIZE_USD,
      side,
    };

    let liquidOrderId: string | null = null;
    let status = 'pending';

    try {
      const response = await fetch('http://localhost:8000/api/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      if (response.ok) {
        const data = (await response.json()) as { liquidOrderId: string | null; status: string };
        liquidOrderId = data.liquidOrderId;
        status = data.status;
      } else {
        console.error(`[collectCoin] HTTP ${response.status} from place-order`);
      }
    } catch (err) {
      // Network error — game must not crash
      console.error('[collectCoin] fetch failed:', err);
    }

    const order: Order = {
      coinId: coin.id,
      priceLevel: coin.priceLevel,
      size: DEFAULT_ORDER_SIZE_USD,
      side,
      timestamp: Date.now(),
      liquidOrderId,
    };

    setOrdersPlaced((prev) => [...prev, order]);
    void status; // used for logging if needed
  }, []);

  // ---------------------------------------------------------------------------
  // updateShipPosition — scaffold
  // ---------------------------------------------------------------------------

  /**
   * updateShipPosition(y)
   *
   * Updates the ship's Y position in state after clamping to world bounds.
   * Called by Game.tsx's handleWASD() on every keydown event.
   *
   * Clamping ensures the ship can never leave the visible price range:
   *   MIN_Y = -5 world units (lowest price level visible)
   *   MAX_Y =  5 world units (highest price level visible)
   *
   * X and Z are managed by the Three.js frame loop (autoScrollShip)
   * and are not settable via this function.
   *
   * @param y  Desired new Y position before clamping.
   *
   * TODO: optionally animate the Y transition with a spring for juiciness.
   */
  const updateShipPosition = useCallback((y: number) => {
    const clamped = Math.max(MIN_Y, Math.min(MAX_Y, y));
    setShipPosition((prev) => ({ ...prev, y: clamped }));
  }, []);

  // ---------------------------------------------------------------------------
  // checkGameEndConditions — FULLY IMPLEMENTED
  // ---------------------------------------------------------------------------

  /**
   * checkGameEndConditions(currentPnL)
   *
   * Evaluates all three end conditions each frame during 'playing' state.
   * Must be called from Game.tsx's useFrame() callback every tick.
   *
   * Conditions checked in priority order:
   *   1. timeRemaining <= 0                           → endGame('time')
   *   2. profitThreshold set AND currentPnL >= threshold → endGame('profit')
   *   3. lossThreshold set AND currentPnL <= -threshold  → endGame('loss')
   *
   * Returns early (no-op) if gameStatus !== 'playing' to prevent re-entrancy
   * after endGame has already been called.
   *
   * @param currentPnL  Latest estimated PnL value from the game engine.
   *                    Computed by Game.tsx from live price vs. order fill prices.
   */
  const checkGameEndConditions = useCallback(
    (currentPnL: number) => {
      // Guard: only run during active play
      if (gameStatus !== 'playing') return;

      if (timeRemaining <= 0) {
        endGame('time');
        return;
      }

      if (params.profitThreshold !== null && currentPnL >= params.profitThreshold) {
        endGame('profit');
        return;
      }

      if (params.lossThreshold !== null && currentPnL <= -params.lossThreshold) {
        endGame('loss');
        return;
      }

      // Update PnL state so HUD and RevealScreen stay in sync
      setTotalPnL(currentPnL);
    },
    [gameStatus, timeRemaining, params.profitThreshold, params.lossThreshold, endGame],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return {
    // State
    gameStatus,
    coinsCollected,
    ordersPlaced,
    timeRemaining,
    shipPosition,
    totalPnL,
    gameResult,
    // Actions
    startGame,
    endGame,
    collectCoin,
    updateShipPosition,
    checkGameEndConditions,
  };
}
