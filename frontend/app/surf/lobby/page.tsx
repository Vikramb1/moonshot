'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLiquid } from '@/lib/useLiquid';

export default function SurfLobbyPage() {
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
    router.push(`/surf/game?${params.toString()}`);
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center px-4">
      <div className="ocean-bg" />

      <div className="relative z-10 w-full max-w-md">
        <Link href="/" className="inline-block mb-4">
          <div className="wave-btn text-xs px-3 py-2">
            &larr; BACK
          </div>
        </Link>

        <div className="wave-panel p-6 flex flex-col gap-5">
          <h2 className="text-sm md:text-base text-ocean-foam text-center uppercase tracking-wider">
            Surf Config
          </h2>

          {/* Duration */}
          <div className="flex flex-col gap-2">
            <label className="text-[8px] md:text-[10px] text-ocean-foam/60 uppercase tracking-wider">
              Game Duration
            </label>
            <div className="flex gap-3">
              {([30, 60] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`flex-1 wave-btn text-xs py-2 ${
                    duration === d ? 'wave-btn-green' : ''
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          {/* Profit threshold */}
          <div className="flex flex-col gap-2">
            <label className="text-[8px] md:text-[10px] text-ocean-foam/60 uppercase tracking-wider">
              Take Profit At
            </label>
            <div className="flex items-center border-4 border-ocean-teal bg-ocean-dark px-3 py-2 rounded">
              <span className="text-ocean-teal text-xs mr-2">+$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 10.00"
                value={profitInput}
                onChange={(e) => setProfitInput(e.target.value)}
                className="flex-1 bg-transparent text-ocean-foam outline-none placeholder-ocean-foam/20 text-xs"
              />
            </div>
          </div>

          {/* Loss threshold */}
          <div className="flex flex-col gap-2">
            <label className="text-[8px] md:text-[10px] text-ocean-foam/60 uppercase tracking-wider">
              Stop Loss At
            </label>
            <div className="flex items-center border-4 border-ocean-teal bg-ocean-dark px-3 py-2 rounded">
              <span className="text-retro-red text-xs mr-2">-$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 5.00"
                value={lossInput}
                onChange={(e) => setLossInput(e.target.value)}
                className="flex-1 bg-transparent text-ocean-foam outline-none placeholder-ocean-foam/20 text-xs"
              />
            </div>
          </div>

          {/* Position Size */}
          <div className="flex flex-col gap-2">
            <label className="text-[8px] md:text-[10px] text-ocean-foam/60 uppercase tracking-wider">
              Position Size (USD)
            </label>
            <div className="flex items-center border-4 border-ocean-teal bg-ocean-dark px-3 py-2 rounded">
              <span className="text-ocean-foam/60 text-xs mr-2">$</span>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={positionSize}
                onChange={(e) => setPositionSize(e.target.value)}
                className="flex-1 bg-transparent text-ocean-foam outline-none placeholder-ocean-foam/20 text-xs"
              />
            </div>
            <p className="text-[7px] text-ocean-foam/30">25x leverage · min $0.50</p>
          </div>

          {/* Summary */}
          <div className="border-4 border-ocean-teal/20 p-3 rounded">
            <p className="text-[8px] text-ocean-foam/50 leading-relaxed">
              {buildSummary()}
            </p>
          </div>

          {/* Price + balance */}
          <div className="flex justify-between text-[8px] text-ocean-foam/40">
            <span>
              ETH/USD{' '}
              <span className={`font-bold ${isConnected ? 'text-ocean-teal' : 'text-retro-gray'}`}>
                {currentPrice > 0 ? `$${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '--'}
              </span>
            </span>
            <span>
              Balance{' '}
              <span className="font-bold text-ocean-foam/70">$10,000 (mock)</span>
            </span>
          </div>

          {/* Launch */}
          <button
            onClick={handleLaunch}
            className="w-full wave-btn wave-btn-green text-sm py-3"
          >
            PADDLE OUT
          </button>
        </div>
      </div>
    </main>
  );
}
