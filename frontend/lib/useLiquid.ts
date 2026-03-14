'use client';

/**
 * useLiquid — FULLY IMPLEMENTED
 *
 * Custom React hook that maintains a live WebSocket connection to the backend
 * price proxy (/ws/price/{symbol}) and exposes the latest BTC price state.
 *
 * Architecture note:
 *   Liquid has no WebSocket feed — the backend polls the REST ticker every second
 *   and pushes updates here. This hook only speaks to localhost:8000.
 *
 * Usage:
 *   const { currentPrice, previousPrice, priceDirection, isConnected } = useLiquid('BTC-PERP');
 *
 * @param symbol  Liquid market symbol to subscribe to (default: 'BTC-PERP').
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PriceUpdate } from '@/types';

const BACKEND_WS_BASE = 'ws://localhost:8000/ws/price';
const RECONNECT_DELAY_MS = 2000;

export function useLiquid(symbol: string = 'BTC-PERP') {
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [previousPrice, setPreviousPrice] = useState<number>(0);
  const [priceDirection, setPriceDirection] = useState<PriceUpdate['direction']>('neutral');
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef<boolean>(true);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const url = `${BACKEND_WS_BASE}/${encodeURIComponent(symbol)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const update: PriceUpdate = JSON.parse(event.data as string);
        setCurrentPrice(update.price);
        setPreviousPrice(update.previousPrice);
        setPriceDirection(update.direction);
      } catch {
        // Malformed message — ignore and wait for next tick
      }
    };

    ws.onerror = () => {
      // onclose fires immediately after; let it handle reconnect
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, RECONNECT_DELAY_MS);
    };
  }, [symbol]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current !== null) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { currentPrice, previousPrice, priceDirection, isConnected };
}
