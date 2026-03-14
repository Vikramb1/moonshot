'use client';

/**
 * Lobby page — /lobby
 * Configure game parameters before launching.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLiquid } from '@/lib/useLiquid';
import type { TradingSymbol } from '@/types';

export default function LobbyPage() {
  const router = useRouter();
  const [symbol, setSymbol] = useState<TradingSymbol>('ETH-PERP');
  const { currentPrice, isConnected } = useLiquid(symbol);

  const [duration, setDuration] = useState<30 | 60>(60);
  const [positionSize, setPositionSize] = useState<string>('0.5');
  const [useLive, setUseLive] = useState(false);

  function buildSummary(): string {
    return `Game ends when: ${duration}s elapsed`;
  }

  function handleLaunch() {
    const params = new URLSearchParams();
    params.set('duration', String(duration));
    params.set('symbol', symbol);
    if (useLive) params.set('useLive', '1');
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

          {/* Asset */}
          <div className="flex flex-col gap-2">
            <label className="text-[8px] md:text-[10px] text-retro-white/60 uppercase tracking-wider">
              Asset
            </label>
            <div className="flex gap-3">
              {(['ETH-PERP', 'BTC-PERP', 'SOL-PERP', 'DOGE-PERP'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSymbol(s)}
                  className={`flex-1 pixel-btn text-xs py-2 ${
                    symbol === s ? 'pixel-btn-green' : ''
                  }`}
                >
                  {s.replace('-PERP', '')}
                </button>
              ))}
            </div>
          </div>

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

          {/* Trading Mode */}
          <div className="flex flex-col gap-2">
            <label className="text-[8px] md:text-[10px] text-retro-white/60 uppercase tracking-wider">
              Trading Mode
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setUseLive(false)}
                className={`flex-1 pixel-btn text-xs py-2 ${!useLive ? 'pixel-btn-green' : ''}`}
              >
                PAPER
              </button>
              <button
                onClick={() => setUseLive(true)}
                className={`flex-1 pixel-btn text-xs py-2 ${useLive ? 'pixel-btn-green' : ''}`}
                style={useLive ? { borderColor: '#c03020', background: 'rgba(192, 48, 32, 0.2)' } : {}}
              >
                LIVE
              </button>
            </div>
            {useLive && (
              <p className="text-[7px] text-retro-red">
                REAL MONEY — orders placed on Liquid exchange
              </p>
            )}
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
              {symbol.replace('-PERP', '')}/USD{' '}
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
