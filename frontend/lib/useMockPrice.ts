'use client';

/**
 * useMockPrice — drop-in replacement for useLiquid
 *
 * Generates simulated BTC price data via momentum-based random walk.
 * Creates smooth mountains and valleys for the gameplay chart.
 */

import { useEffect, useRef, useState } from 'react';

const BASE_PRICE = 65000;
const TICK_INTERVAL_MS = 500;
const VOLATILITY = 40;
const MOMENTUM_DECAY = 0.92;
const MOMENTUM_KICK = 25;
const MAX_HISTORY = 120;

export function useMockPrice() {
  const [currentPrice, setCurrentPrice] = useState<number>(BASE_PRICE);
  const [previousPrice, setPreviousPrice] = useState<number>(BASE_PRICE);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'neutral'>('neutral');
  const [isConnected] = useState<boolean>(true);
  const [priceHistory, setPriceHistory] = useState<Array<{ price: number; time: number }>>([
    { price: BASE_PRICE, time: Date.now() },
  ]);

  const priceRef = useRef<number>(BASE_PRICE);
  const momentumRef = useRef<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const prev = priceRef.current;

      // Momentum-based walk: drift creates smooth trends (mountains/valleys)
      momentumRef.current = momentumRef.current * MOMENTUM_DECAY
        + (Math.random() - 0.48) * MOMENTUM_KICK;

      const delta = momentumRef.current + (Math.random() - 0.5) * VOLATILITY;
      const next = Math.max(prev * 0.95, Math.min(prev * 1.05, prev + delta));
      priceRef.current = next;

      setPreviousPrice(prev);
      setCurrentPrice(next);
      setPriceDirection(next > prev ? 'up' : next < prev ? 'down' : 'neutral');
      setPriceHistory((h) => {
        const newEntry = { price: next, time: Date.now() };
        const updated = [...h, newEntry];
        return updated.length > MAX_HISTORY ? updated.slice(-MAX_HISTORY) : updated;
      });
    }, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return { currentPrice, previousPrice, priceDirection, isConnected, priceHistory };
}
