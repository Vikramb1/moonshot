'use client';

/**
 * RevealScreen — post-game results overlay
 *
 * Full-screen overlay displayed when gameStatus === 'ended'.
 * Shows a summary of everything that happened during the session:
 * how it ended, all orders placed, net market direction, and estimated PnL.
 *
 * Props:
 *   result — GameResult assembled by useGameEngine.endGame()
 *
 * Layout (top to bottom):
 *   1. End reason headline (Time's Up / Profit Target Hit / Stop Loss Triggered)
 *   2. Net direction badge (BULLISH / BEARISH / NEUTRAL)
 *   3. Summary stats row (orders, size, PnL)
 *   4. Scrollable orders list
 *   5. CTA buttons (PLAY AGAIN, VIEW ON LIQUID)
 *
 * TODO: add an entrance animation (fade-in + slide-up from bottom)
 * TODO: add confetti particles for 'profit' end reason
 */

import { useRouter } from 'next/navigation';
import type { GameResult } from '@/types';

interface RevealScreenProps {
  result: GameResult;
}

/** Maps GameEndReason to a display headline. */
const END_REASON_LABEL: Record<GameResult['endReason'], string> = {
  time: "Time's Up",
  profit: 'Profit Target Hit',
  loss: 'Stop Loss Triggered',
};

/** Emoji decoration per end reason. */
const END_REASON_EMOJI: Record<GameResult['endReason'], string> = {
  time: '',
  profit: ' 🎯',
  loss: ' 🛡️',
};

/** Color classes for the net direction badge. */
const DIRECTION_COLORS: Record<GameResult['netDirection'], string> = {
  bullish: 'text-green-400 border-green-400',
  bearish: 'text-red-400 border-red-400',
  neutral: 'text-slate-400 border-slate-400',
};

export default function RevealScreen({ result }: RevealScreenProps) {
  const router = useRouter();

  const isPnLPositive = result.totalPnL >= 0;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Format a Unix ms timestamp to a locale time string. */
  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  /** Format a price level with comma separators. */
  function formatPrice(price: number): string {
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 backdrop-blur-sm overflow-y-auto py-8 px-4">
      <div className="w-full max-w-lg flex flex-col gap-6">

        {/* ---------------------------------------------------------------- */}
        {/* End reason headline                                              */}
        {/* ---------------------------------------------------------------- */}
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-white tracking-wide">
            {END_REASON_LABEL[result.endReason]}
            {END_REASON_EMOJI[result.endReason]}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {result.duration}s elapsed
          </p>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Net direction badge                                              */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex justify-center">
          <span
            className={`border rounded-full px-6 py-1 text-sm font-bold tracking-widest uppercase ${DIRECTION_COLORS[result.netDirection]}`}
          >
            {result.netDirection}
          </span>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Summary stats                                                    */}
        {/* ---------------------------------------------------------------- */}
        <div className="grid grid-cols-3 gap-4 border border-slate-700 rounded-lg p-4 bg-slate-900/60">
          <div className="flex flex-col items-center gap-1">
            <span className="text-slate-500 text-xs uppercase tracking-wider">Orders</span>
            <span className="text-white text-xl font-bold">{result.ordersPlaced.length}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-slate-500 text-xs uppercase tracking-wider">Total Size</span>
            <span className="text-white text-xl font-bold">{result.totalSize.toFixed(4)} BTC</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-slate-500 text-xs uppercase tracking-wider">Est. PnL</span>
            <span
              className={`text-xl font-bold ${isPnLPositive ? 'text-green-400' : 'text-red-400'}`}
            >
              {isPnLPositive ? '+' : ''}${result.totalPnL.toFixed(2)}
            </span>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Orders list                                                      */}
        {/* ---------------------------------------------------------------- */}
        {result.ordersPlaced.length > 0 && (
          <div className="border border-slate-700 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-slate-800 text-xs text-slate-400 uppercase tracking-wider grid grid-cols-4 gap-2">
              <span>Side</span>
              <span>Price</span>
              <span>Size</span>
              <span>Time</span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {result.ordersPlaced.map((order) => (
                <div
                  key={order.coinId}
                  className="px-4 py-2 text-xs font-mono grid grid-cols-4 gap-2 border-t border-slate-800 hover:bg-slate-800/40 transition-colors"
                >
                  <span
                    className={
                      order.side === 'buy' ? 'text-cyan-400 uppercase' : 'text-orange-400 uppercase'
                    }
                  >
                    {order.side}
                  </span>
                  <span className="text-slate-300">{formatPrice(order.priceLevel)}</span>
                  <span className="text-slate-400">{order.size} BTC</span>
                  <span className="text-slate-500">{formatTime(order.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.ordersPlaced.length === 0 && (
          <p className="text-center text-slate-600 text-sm italic">No orders placed this session.</p>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* CTA buttons                                                      */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex gap-4">
          <button
            onClick={() => router.push('/lobby')}
            className="flex-1 py-3 text-sm font-bold tracking-widest uppercase rounded border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black transition-colors duration-200"
          >
            PLAY AGAIN
          </button>
          <a
            href="https://app.liquid.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 text-sm font-bold tracking-widest uppercase rounded border border-slate-600 text-slate-400 hover:border-slate-400 hover:text-white transition-colors duration-200 text-center"
          >
            VIEW ON LIQUID
          </a>
        </div>

      </div>
    </div>
  );
}
