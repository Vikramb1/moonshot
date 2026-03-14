'use client';

/**
 * HUD — Heads-Up Display overlay
 *
 * Rendered as an absolute-positioned div over the Three.js canvas.
 * Displays live game telemetry so the player can track state at a glance.
 * Pure presentational component — receives all data via props, no internal state.
 *
 * Layout:
 *   top-left     — BTC/USD live price (updates each useLiquid tick)
 *   top-right    — countdown timer (red when under 10 seconds)
 *   bottom-left  — coins collected · orders placed
 *   bottom-right — estimated PnL (green if positive, red if negative)
 *   conditional  — progress bars for profit and/or loss thresholds
 *
 * TODO: animate price change flashes (brief highlight on each tick)
 * TODO: add subtle slide-in animation when HUD first mounts
 */

import type { GameParams } from '@/types';

interface HUDProps {
  currentPrice: number;
  timeRemaining: number;
  coinsCollected: number;
  ordersPlaced: number;
  estimatedPnL: number;
  params: GameParams;
}

export default function HUD({
  currentPrice,
  timeRemaining,
  coinsCollected,
  ordersPlaced,
  estimatedPnL,
  params,
}: HUDProps) {
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Format seconds as MM:SS for the countdown display. */
  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /** Format a USD dollar amount with sign and 2 decimal places. */
  function formatPnL(pnl: number): string {
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}$${pnl.toFixed(2)}`;
  }

  const isLowTime = timeRemaining <= 10;
  const isPnLPositive = estimatedPnL > 0;

  // ---------------------------------------------------------------------------
  // Progress bar helpers
  // ---------------------------------------------------------------------------

  /**
   * Profit progress bar
   * Fills from 0% → 100% as estimatedPnL approaches profitThreshold.
   * Only rendered if params.profitThreshold is non-null.
   *
   * TODO: add a pulsing glow when near the threshold (>80% fill)
   */
  const profitProgress =
    params.profitThreshold !== null && params.profitThreshold > 0
      ? Math.min(100, (Math.max(0, estimatedPnL) / params.profitThreshold) * 100)
      : null;

  /**
   * Loss progress bar
   * Fills from 0% → 100% as estimatedPnL falls toward -lossThreshold.
   * Only rendered if params.lossThreshold is non-null.
   *
   * TODO: add a pulsing red glow when near the threshold (>80% fill)
   */
  const lossProgress =
    params.lossThreshold !== null && params.lossThreshold > 0
      ? Math.min(100, (Math.max(0, -estimatedPnL) / params.lossThreshold) * 100)
      : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-10">
      {/* ------------------------------------------------------------------ */}
      {/* Top-left: live BTC price                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="absolute top-4 left-4 text-sm font-mono text-slate-300">
        <span className="text-slate-500 mr-1">BTC/USD</span>
        <span className="text-cyan-400 font-bold text-base">
          {currentPrice > 0 ? `$${currentPrice.toLocaleString()}` : '—'}
        </span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Top-right: countdown timer                                         */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={`absolute top-4 right-4 text-2xl font-mono font-bold tabular-nums transition-colors ${
          isLowTime ? 'text-red-400' : 'text-white'
        }`}
        style={isLowTime ? { textShadow: '0 0 10px rgba(255,80,80,0.8)' } : undefined}
      >
        {formatTime(timeRemaining)}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom-left: coins + orders                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="absolute bottom-6 left-4 text-xs font-mono text-slate-400">
        <span>{coinsCollected} coins collected</span>
        <span className="mx-2 text-slate-600">·</span>
        <span>{ordersPlaced} orders placed</span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom-right: estimated PnL                                        */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={`absolute bottom-6 right-4 text-lg font-mono font-bold tabular-nums ${
          isPnLPositive ? 'text-green-400' : estimatedPnL < 0 ? 'text-red-400' : 'text-slate-400'
        }`}
      >
        {formatPnL(estimatedPnL)}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Progress bars (only if thresholds are configured)                  */}
      {/* ------------------------------------------------------------------ */}
      {(profitProgress !== null || lossProgress !== null) && (
        <div className="absolute bottom-14 left-4 right-4 flex flex-col gap-2">
          {profitProgress !== null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-16 shrink-0">Profit</span>
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-400 rounded-full transition-all duration-500"
                  style={{ width: `${profitProgress}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 w-16 text-right shrink-0">
                ${params.profitThreshold?.toFixed(2)}
              </span>
            </div>
          )}

          {lossProgress !== null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-16 shrink-0">Loss</span>
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-400 rounded-full transition-all duration-500"
                  style={{ width: `${lossProgress}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 w-16 text-right shrink-0">
                ${params.lossThreshold?.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
