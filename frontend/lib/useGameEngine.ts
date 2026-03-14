'use client';

/**
 * useGameEngine
 *
 * Central state manager for a single game session.
 * Owns all mutable game state and exposes functions that Game.tsx calls.
 * Uses mock order recording (no backend fetch).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coin, GameEndReason, GameParams, GameResult, GameStatus, Order } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ORDER_SIZE_USD = 10;
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
  const [totalPnL, setTotalPnL] = useState<number>(0);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const ordersRef = useRef<Order[]>([]);

  // ---------------------------------------------------------------------------
  // startGame — immediately starts playing (countdown owned by game page)
  // ---------------------------------------------------------------------------

  const startGame = useCallback(() => {
    setGameStatus('playing');
    setTimeRemaining(params.duration);
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
  }, [params.duration]);

  // ---------------------------------------------------------------------------
  // endGame
  // ---------------------------------------------------------------------------

  const endGame = useCallback(
    (reason: GameEndReason): GameResult => {
      if (timerRef.current) clearInterval(timerRef.current);
      setGameStatus('ended');

      const elapsed = startTimeRef.current
        ? Math.round((Date.now() - startTimeRef.current) / 1000)
        : params.duration;

      const orders = ordersRef.current;
      const buyCount = orders.filter((o) => o.side === 'buy').length;
      const sellCount = orders.filter((o) => o.side === 'sell').length;
      const netDirection =
        buyCount > sellCount ? 'bullish' : sellCount > buyCount ? 'bearish' : 'neutral';
      const totalSize = orders.reduce((sum, o) => sum + o.size, 0);

      const result: GameResult = {
        ordersPlaced: orders,
        netDirection,
        totalSize,
        duration: elapsed,
        endReason: reason,
        totalPnL,
      };

      setGameResult(result);
      return result;
    },
    [params.duration, totalPnL],
  );

  // ---------------------------------------------------------------------------
  // collectCoin — mock order recording (no backend fetch)
  // ---------------------------------------------------------------------------

  const collectCoin = useCallback((coin: Coin, currentPrice: number) => {
    if (coin.collected) return;

    setCoinsCollected((prev) => [...prev, { ...coin, collected: true }]);

    const side: 'buy' | 'sell' = coin.priceLevel >= currentPrice ? 'buy' : 'sell';

    const order: Order = {
      coinId: coin.id,
      priceLevel: coin.priceLevel,
      size: DEFAULT_ORDER_SIZE_USD,
      side,
      timestamp: Date.now(),
      liquidOrderId: `mock-${Date.now()}`,
    };

    ordersRef.current = [...ordersRef.current, order];
    setOrdersPlaced((prev) => [...prev, order]);
  }, []);

  // ---------------------------------------------------------------------------
  // checkGameEndConditions
  // ---------------------------------------------------------------------------

  const checkGameEndConditions = useCallback(
    (currentPnL: number) => {
      if (gameStatus !== 'playing') return;

      setTotalPnL(currentPnL);

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
    gameStatus,
    coinsCollected,
    ordersPlaced,
    timeRemaining,
    totalPnL,
    gameResult,
    startGame,
    endGame,
    collectCoin,
    checkGameEndConditions,
  };
}
