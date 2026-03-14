// =============================================================================
// MOONSHOT — Shared TypeScript types
// All game domain types live here. Import from '@/types' everywhere.
// =============================================================================

/**
 * Parameters selected in the lobby before a game starts.
 *  duration        — how long the game runs in seconds
 *  profitThreshold — auto-end game when totalPnL reaches this value (null = disabled)
 *  lossThreshold   — auto-end game when totalPnL drops to -this value (null = disabled)
 */
export interface GameParams {
  duration: 30 | 60;
  profitThreshold: number | null;
  lossThreshold: number | null;
}

/**
 * Lifecycle states of a single game session.
 *  idle       — no game active (initial state)
 *  countdown  — 3-2-1 countdown is running before play starts
 *  playing    — game is actively running
 *  ended      — game has finished for any reason
 */
export type GameStatus = 'idle' | 'countdown' | 'playing' | 'ended';

/**
 * Reason a game ended. Drives the reveal screen copy.
 *  time   — timer reached zero
 *  profit — totalPnL hit the profitThreshold
 *  loss   — totalPnL fell to -lossThreshold
 */
export type GameEndReason = 'time' | 'profit' | 'loss';

/**
 * A single collectible coin in the game world.
 *  id          — unique identifier (e.g. uuid)
 *  priceLevel  — real Liquid BTC/USD price this coin represents
 *  position    — Three.js world-space coordinates
 *  collected   — true once the ship has collided with this coin
 */
export interface Coin {
  id: string;
  priceLevel: number;
  position: { x: number; y: number; z: number };
  collected: boolean;
}

/**
 * A limit order placed on Liquid when a coin is collected.
 *  coinId         — which Coin triggered this order
 *  priceLevel     — the Liquid limit price
 *  size           — order quantity in BTC
 *  side           — 'buy' if coin above current price, 'sell' if below
 *  timestamp      — ms since epoch when the order was sent
 *  liquidOrderId  — order ID returned by Liquid (null if placement failed)
 */
export interface Order {
  coinId: string;
  priceLevel: number;
  size: number;
  side: 'buy' | 'sell';
  timestamp: number;
  liquidOrderId: string | null;
}

/**
 * A single price tick streamed from the Liquid WebSocket via the backend.
 *  price          — current mid price in USD
 *  previousPrice  — last tick's price (used for direction calc)
 *  direction      — price movement direction this tick
 *  timestamp      — ms since epoch when the tick was received
 */
export interface PriceUpdate {
  price: number;
  previousPrice: number;
  direction: 'up' | 'down' | 'neutral';
  timestamp: number;
}

/**
 * Summary data produced when a game ends, passed to RevealScreen.
 *  ordersPlaced   — every Order placed during the session
 *  netDirection   — aggregate sentiment from collected coins
 *  totalSize      — sum of all order sizes in BTC
 *  duration       — how long the game actually ran (seconds)
 *  endReason      — which condition triggered game end
 *  totalPnL       — estimated profit / loss in USD
 */
export interface GameResult {
  ordersPlaced: Order[];
  netDirection: 'bullish' | 'bearish' | 'neutral';
  totalSize: number;
  duration: number;
  endReason: GameEndReason;
  totalPnL: number;
}
