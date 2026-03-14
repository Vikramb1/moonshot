'use client';

/**
 * Lobby page — /lobby
 * Configure game parameters before launching.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLiquid } from '@/lib/useLiquid';

export default function LobbyPage() {
  const router = useRouter();
  const { currentPrice, isConnected } = useLiquid('ETH-PERP');

  const [duration, setDuration] = useState<30 | 60>(60);
  const [profitInput, setProfitInput] = useState<string>('');
  const [lossInput, setLossInput] = useState<string>('');
  const [positionSize, setPositionSize] = useState<string>('0.5');

  function buildSummary(): string {
    const parts: string[] = [`${duration}s elapsed`];
    if (profitInput && parseFloat(profitInput) > 0)
      parts.push(`+$${parseFloat(profitInput).toFixed(2)} profit hit`);
    if (lossInput && parseFloat(lossInput) > 0)
      parts.push(`-$${parseFloat(lossInput).toFixed(2)} loss hit`);
    return `Game ends when: ${parts.join(', or ')}`;
  }

  function handleLaunch() {
    const params = new URLSearchParams();
    params.set('duration', String(duration));
    if (profitInput && parseFloat(profitInput) > 0)
      params.set('profitThreshold', profitInput);
    if (lossInput && parseFloat(lossInput) > 0)
      params.set('lossThreshold', lossInput);
    const ps = parseFloat(positionSize);
    if (ps >= 0.5) params.set('positionSize', String(ps));
    router.push(`/game?${params.toString()}`);
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center px-4">
      {/* Starfield */}
      <div className="starfield" />

      <div className="relative z-10 w-full max-w-md">
        {/* Back button */}
        <Link
          href="/"
          className="inline-block mb-4"
        >
          <div className="pixel-btn text-xs px-3 py-2">
            &larr; BACK
          </div>
        </Link>

        <div className="pixel-panel p-6 flex flex-col gap-5">
          <h2 className="text-sm md:text-base text-retro-white text-center uppercase tracking-wider">
            Mission Config
          </h2>

          {/* Duration */}
          <div className="flex flex-col gap-2">
            <label className="text-[8px] md:text-[10px] text-retro-white/60 uppercase tracking-wider">
              Game Duration
            </label>
            <div className="flex gap-3">
              {([30, 60] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`flex-1 pixel-btn text-xs py-2 ${
                    duration === d ? 'pixel-btn-green' : ''
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          {/* Profit threshold */}
          <div className="flex flex-col gap-2">
            <label className="text-[8px] md:text-[10px] text-retro-white/60 uppercase tracking-wider">
              Take Profit At
            </label>
            <div className="flex items-center border-4 border-retro-border bg-space-deeper px-3 py-2">
              <span className="text-retro-green text-xs mr-2">+$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 10.00"
                value={profitInput}
                onChange={(e) => setProfitInput(e.target.value)}
                className="flex-1 bg-transparent text-retro-white outline-none placeholder-retro-white/20 text-xs"
              />
            </div>
          </div>

          {/* Loss threshold */}
          <div className="flex flex-col gap-2">
            <label className="text-[8px] md:text-[10px] text-retro-white/60 uppercase tracking-wider">
              Stop Loss At
            </label>
            <div className="flex items-center border-4 border-retro-border bg-space-deeper px-3 py-2">
              <span className="text-retro-red text-xs mr-2">-$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 5.00"
                value={lossInput}
                onChange={(e) => setLossInput(e.target.value)}
                className="flex-1 bg-transparent text-retro-white outline-none placeholder-retro-white/20 text-xs"
              />
            </div>
          </div>

          {/* Position Size */}
          <div className="flex flex-col gap-2">
            <label className="text-[8px] md:text-[10px] text-retro-white/60 uppercase tracking-wider">
              Position Size (USD)
            </label>
            <div className="flex items-center border-4 border-retro-border bg-space-deeper px-3 py-2">
              <span className="text-retro-white/60 text-xs mr-2">$</span>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={positionSize}
                onChange={(e) => setPositionSize(e.target.value)}
                className="flex-1 bg-transparent text-retro-white outline-none placeholder-retro-white/20 text-xs"
              />
            </div>
            <p className="text-[7px] text-retro-white/30">25x leverage · min $0.50</p>
          </div>

          {/* Summary */}
          <div className="border-4 border-retro-white/20 p-3">
            <p className="text-[8px] text-retro-white/50 leading-relaxed">
              {buildSummary()}
            </p>
          </div>

          {/* Price + balance */}
          <div className="flex justify-between text-[8px] text-retro-white/40">
            <span>
              ETH/USD{' '}
              <span className={`font-bold ${isConnected ? 'text-retro-green' : 'text-retro-gray'}`}>
                {currentPrice > 0 ? `$${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '--'}
              </span>
            </span>
            <span>
              Balance{' '}
              <span className="font-bold text-retro-white/70">$10,000 (mock)</span>
            </span>
          </div>

          {/* Launch */}
          <button
            onClick={handleLaunch}
            className="w-full pixel-btn pixel-btn-green text-sm py-3"
          >
            LAUNCH
          </button>
        </div>
      </div>
    </main>
  );
}
