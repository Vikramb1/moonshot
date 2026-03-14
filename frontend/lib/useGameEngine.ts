'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameEndReason, GameParams, GameResult, GameStatus, Order } from '@/types';

export function useGameEngine(params: GameParams) {
  const [gameStatus, setGameStatus] = useState<GameStatus>('idle');
  const [ordersPlaced, setOrdersPlaced] = useState<Order[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number>(params.duration);
  const [totalPnL, setTotalPnL] = useState<number>(0);
  const [health, setHealth] = useState<number>(100);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const ordersRef = useRef<Order[]>([]);
  const endedRef = useRef(false);

  // Refs that mirror state — used by game loop to avoid stale closures
  const healthRef = useRef(100);
  const timeRemainingRef = useRef<number>(params.duration);
  const totalPnLRef = useRef(0);
  const totalZoneEarningsRef = useRef(0);

  const startGame = useCallback(() => {
    endedRef.current = false;
    healthRef.current = 100;
    timeRemainingRef.current = params.duration;
    totalPnLRef.current = 0;
    totalZoneEarningsRef.current = 0;
    ordersRef.current = [];
    setGameStatus('playing');
    setTimeRemaining(params.duration);
    setHealth(100);
    setTotalPnL(0);
    setOrdersPlaced([]);
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        const next = prev <= 1 ? 0 : prev - 1;
        timeRemainingRef.current = next;
        if (next === 0 && timerRef.current) clearInterval(timerRef.current);
        return next;
      });
    }, 1000);
  }, [params.duration]);

  const endGame = useCallback(
    (reason: GameEndReason): GameResult | null => {
      if (endedRef.current) return null;
      endedRef.current = true;
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
        totalPnL: totalPnLRef.current,
        totalZoneEarnings: totalZoneEarningsRef.current,
      };

      setGameResult(result);
      return result;
    },
    [params.duration],
  );

  const addOrder = useCallback((order: Order) => {
    ordersRef.current = [...ordersRef.current, order];
    setOrdersPlaced((prev) => [...prev, order]);
  }, []);

  const takeDamage = useCallback((amount: number) => {
    setHealth((prev) => {
      const next = Math.max(0, prev - amount);
      healthRef.current = next;
      return next;
    });
  }, []);

  const adjustHealth = useCallback((delta: number) => {
    if (delta > 0) return; // health never recovers
    setHealth((prev) => {
      const next = Math.max(0, prev + delta);
      healthRef.current = next;
      return next;
    });
  }, []);

  const addZoneEarnings = useCallback((amount: number) => {
    totalZoneEarningsRef.current += amount;
  }, []);

  const checkGameEndConditions = useCallback(
    (currentPnL: number) => {
      if (endedRef.current) return;
      totalPnLRef.current = currentPnL;
      setTotalPnL(currentPnL);

      if (healthRef.current <= 0) { endGame('health'); return; }
      if (timeRemainingRef.current <= 0) { endGame('time'); return; }
      if (params.profitThreshold !== null && currentPnL >= params.profitThreshold) { endGame('profit'); return; }
      if (params.lossThreshold !== null && currentPnL <= -params.lossThreshold) { endGame('loss'); return; }
    },
    [endGame, params.profitThreshold, params.lossThreshold],
  );

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return {
    gameStatus, ordersPlaced, timeRemaining, totalPnL, health,
    gameResult, startGame, endGame, addOrder, takeDamage, adjustHealth,
    checkGameEndConditions, addZoneEarnings,
    // Refs for direct game loop access (avoids stale closures)
    endedRef, healthRef, timeRemainingRef, ordersRef,
  };
}
