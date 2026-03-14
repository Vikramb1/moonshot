'use client';

/**
 * useLiquid — FULLY IMPLEMENTED
 *
 * Custom React hook that maintains a live WebSocket connection to the backend
 * price proxy (/ws/price/{product_id}) and exposes the latest BTC/USD price
 * state to any component that needs it.
 *
 * Architecture note: the backend proxies Liquid's WebSocket so the frontend
 * never touches Liquid directly. This hook only speaks to localhost:8000.
 *
 * Usage:
 *   const { currentPrice, previousPrice, priceDirection, isConnected } = useLiquid(1);
 *
 * @param productId  Liquid product ID to subscribe to (1 = BTC/USD).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PriceUpdate } from '@/types';

const BACKEND_WS_BASE = 'ws://localhost:8000/ws/price';
const RECONNECT_DELAY_MS = 2000;

export function useLiquid(productId: number = 1) {
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [previousPrice, setPreviousPrice] = useState<number>(0);
  const [priceDirection, setPriceDirection] = useState<PriceUpdate['direction']>('neutral');
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Keep a stable ref to the socket so we can close it on unmount / reconnect
  const wsRef = useRef<WebSocket | null>(null);
  // Ref to the reconnect timer so we can cancel it if the component unmounts
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether the hook is still mounted to prevent state updates after unmount
  const mountedRef = useRef<boolean>(true);

  const connect = useCallback(() => {
    // Clean up any existing socket before opening a new one
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent the old socket from scheduling a reconnect
      wsRef.current.close();
    }

    const url = `${BACKEND_WS_BASE}/${productId}`;
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
        // Malformed message from backend — ignore and wait for the next tick
      }
    };

    ws.onerror = () => {
      // onclose will fire immediately after onerror; let it handle reconnect
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      // Auto-reconnect after RECONNECT_DELAY_MS
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, RECONNECT_DELAY_MS);
    };
  }, [productId]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      // Cleanup: cancel pending reconnect and close socket on unmount
      mountedRef.current = false;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect loop during unmount
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { currentPrice, previousPrice, priceDirection, isConnected };
}
