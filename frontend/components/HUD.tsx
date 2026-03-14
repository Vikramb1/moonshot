'use client';

/**
 * HUD — retro pixel-art heads-up display overlay
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
  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatPnL(pnl: number): string {
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}$${pnl.toFixed(2)}`;
  }

  const isLowTime = timeRemaining <= 10;
  const isPnLPositive = estimatedPnL > 0;

  const profitProgress =
    params.profitThreshold !== null && params.profitThreshold > 0
      ? Math.min(100, (Math.max(0, estimatedPnL) / params.profitThreshold) * 100)
      : null;

  const lossProgress =
    params.lossThreshold !== null && params.lossThreshold > 0
      ? Math.min(100, (Math.max(0, -estimatedPnL) / params.lossThreshold) * 100)
      : null;

  // Render blocky progress bar segments
  function PixelBar({ progress, color }: { progress: number; color: string }) {
    const segments = 10;
    const filled = Math.round((progress / 100) * segments);
    return (
      <div className="flex gap-0.5">
        {Array.from({ length: segments }, (_, i) => (
          <div
            key={i}
            className={`w-3 h-2 border border-retro-white/20 ${
              i < filled ? color : 'bg-space-dark/50'
            }`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-10">
      {/* Top-left: BTC price */}
      <div className="absolute top-3 left-3 text-[8px]">
        <span className="text-retro-white/40 mr-1">BTC/USD</span>
        <span className="text-retro-green text-[10px]">
          {currentPrice > 0 ? `$${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '--'}
        </span>
      </div>

      {/* Top-right: timer */}
      <div
        className={`absolute top-3 right-3 text-lg tabular-nums transition-colors ${
          isLowTime ? 'text-retro-red' : 'text-retro-white'
        }`}
        style={isLowTime ? { textShadow: '0 0 10px rgba(192, 48, 32, 0.8)' } : undefined}
      >
        {formatTime(timeRemaining)}
      </div>

      {/* Bottom-left: coins + orders */}
      <div className="absolute bottom-4 left-3 text-[8px] text-retro-white/50">
        <span>{coinsCollected} coins</span>
        <span className="mx-1 text-retro-white/20">|</span>
        <span>{ordersPlaced} orders</span>
      </div>

      {/* Bottom-right: PnL */}
      <div
        className={`absolute bottom-4 right-3 text-sm tabular-nums ${
          isPnLPositive ? 'text-retro-green' : estimatedPnL < 0 ? 'text-retro-red' : 'text-retro-white/50'
        }`}
      >
        {formatPnL(estimatedPnL)}
      </div>

      {/* Progress bars */}
      {(profitProgress !== null || lossProgress !== null) && (
        <div className="absolute bottom-12 left-3 right-3 flex flex-col gap-2">
          {profitProgress !== null && (
            <div className="flex items-center gap-2">
              <span className="text-[7px] text-retro-white/40 w-10 shrink-0 uppercase">Profit</span>
              <PixelBar progress={profitProgress} color="bg-retro-green" />
              <span className="text-[7px] text-retro-white/40 w-12 text-right shrink-0">
                ${params.profitThreshold?.toFixed(2)}
              </span>
            </div>
          )}
          {lossProgress !== null && (
            <div className="flex items-center gap-2">
              <span className="text-[7px] text-retro-white/40 w-10 shrink-0 uppercase">Loss</span>
              <PixelBar progress={lossProgress} color="bg-retro-red" />
              <span className="text-[7px] text-retro-white/40 w-12 text-right shrink-0">
                ${params.lossThreshold?.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
