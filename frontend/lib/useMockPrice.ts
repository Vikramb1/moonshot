'use client';

/**
 * useMockPrice — drop-in replacement for useLiquid
 *
 * Generates simulated BTC price data via random walk.
 * Same return type as useLiquid so consumers need only swap the import.
 */

import { useEffect, useRef, useState } from 'react';

const BASE_PRICE = 65000;
const TICK_INTERVAL_MS = 500;
const VOLATILITY = 15; // max $ change per tick

export function useMockPrice() {
  const [currentPrice, setCurrentPrice] = useState<number>(BASE_PRICE);
  const [previousPrice, setPreviousPrice] = useState<number>(BASE_PRICE);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'neutral'>('neutral');
  const [isConnected] = useState<boolean>(true);

  const priceRef = useRef<number>(BASE_PRICE);

  useEffect(() => {
    const interval = setInterval(() => {
      const prev = priceRef.current;
      // Random walk with slight upward drift
      const delta = (Math.random() - 0.48) * VOLATILITY;
      const next = Math.max(prev * 0.95, Math.min(prev * 1.05, prev + delta));
      priceRef.current = next;

      setPreviousPrice(prev);
      setCurrentPrice(next);
      setPriceDirection(next > prev ? 'up' : next < prev ? 'down' : 'neutral');
    }, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return { currentPrice, previousPrice, priceDirection, isConnected };
}
