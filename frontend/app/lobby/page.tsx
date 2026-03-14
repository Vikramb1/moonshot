'use client';

/**
 * Lobby page — /lobby
 *
 * Lets the player configure game parameters before launching.
 * Shows a live summary sentence that updates as inputs change.
 * Displays current BTC price (live via WebSocket) and account balance.
 *
 * On LAUNCH, encodes chosen params into URL search params and
 * navigates to /game so the game page can parse them without shared state.
 *
 * Parameters:
 *   duration         — 30s or 60s toggle (default 60)
 *   profitThreshold  — optional: stop at +$X profit (empty = no limit)
 *   lossThreshold    — optional: stop at -$X loss (empty = no limit)
 *
 * TODO: add form validation (prevent negative thresholds, etc.)
 * TODO: fetch account balance via GET /api/account and display it
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiquid } from '@/lib/useLiquid';
import type { GameParams } from '@/types';

export default function LobbyPage() {
  const router = useRouter();
  const { currentPrice, isConnected } = useLiquid(1);

  // ---------------------------------------------------------------------------
  // Form state
  // ---------------------------------------------------------------------------
  const [duration, setDuration] = useState<30 | 60>(60);
  const [profitInput, setProfitInput] = useState<string>('');
  const [lossInput, setLossInput] = useState<string>('');

  // ---------------------------------------------------------------------------
  // Account balance (placeholder until GET /api/account is integrated)
  // ---------------------------------------------------------------------------
  const [accountBalance, setAccountBalance] = useState<string>('—');

  useEffect(() => {
    /**
     * Fetch account balances from the backend.
     * TODO: map to BTC / USD balances and display them formatted in the UI.
     */
    async function fetchBalance() {
      try {
        const res = await fetch('http://localhost:8000/api/account');
        if (!res.ok) return;
        const data = (await res.json()) as Array<{ currency: string; balance: string }>;
        const usd = data.find((a) => a.currency === 'USD');
        if (usd) setAccountBalance(`$${parseFloat(usd.balance).toFixed(2)}`);
      } catch {
        // Backend not yet running; silently swallow
      }
    }
    void fetchBalance();
  }, []);

  // ---------------------------------------------------------------------------
  // Live summary sentence
  // ---------------------------------------------------------------------------
  function buildSummary(): string {
    const parts: string[] = [`${duration}s elapsed`];
    if (profitInput && parseFloat(profitInput) > 0)
      parts.push(`+$${parseFloat(profitInput).toFixed(2)} profit hit`);
    if (lossInput && parseFloat(lossInput) > 0)
      parts.push(`-$${parseFloat(lossInput).toFixed(2)} loss hit`);
    return `Game ends when: ${parts.join(', or ')}`;
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  function handleLaunch() {
    const params = new URLSearchParams();
    params.set('duration', String(duration));
    if (profitInput && parseFloat(profitInput) > 0)
      params.set('profitThreshold', profitInput);
    if (lossInput && parseFloat(lossInput) > 0)
      params.set('lossThreshold', lossInput);

    router.push(`/game?${params.toString()}`);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md border border-slate-700 rounded-lg p-8 flex flex-col gap-6 bg-slate-900">
        <h2 className="text-2xl font-bold text-white tracking-widest text-center uppercase">
          Mission Config
        </h2>

        {/* ---------------------------------------------------------------- */}
        {/* GAME DURATION                                                    */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-col gap-2">
          <label className="text-slate-400 text-sm uppercase tracking-wider">
            Game Duration
          </label>
          <div className="flex gap-3">
            {([30, 60] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={`flex-1 py-2 rounded border text-sm font-bold tracking-widest transition-colors ${
                  duration === d
                    ? 'border-cyan-400 text-cyan-400 bg-cyan-400/10'
                    : 'border-slate-600 text-slate-400 hover:border-slate-400'
                }`}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* PROFIT THRESHOLD                                                 */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-col gap-2">
          <label className="text-slate-400 text-sm uppercase tracking-wider">
            Take Profit At
          </label>
          <div className="flex items-center border border-slate-600 rounded px-3 py-2 focus-within:border-cyan-400 transition-colors">
            <span className="text-slate-500 mr-1">+$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 10.00"
              value={profitInput}
              onChange={(e) => setProfitInput(e.target.value)}
              className="flex-1 bg-transparent text-white outline-none placeholder-slate-600 text-sm"
            />
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* LOSS THRESHOLD                                                   */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-col gap-2">
          <label className="text-slate-400 text-sm uppercase tracking-wider">
            Stop Loss At
          </label>
          <div className="flex items-center border border-slate-600 rounded px-3 py-2 focus-within:border-orange-400 transition-colors">
            <span className="text-slate-500 mr-1">-$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 5.00"
              value={lossInput}
              onChange={(e) => setLossInput(e.target.value)}
              className="flex-1 bg-transparent text-white outline-none placeholder-slate-600 text-sm"
            />
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Live summary                                                     */}
        {/* ---------------------------------------------------------------- */}
        <p className="text-slate-500 text-xs italic leading-relaxed border border-slate-700 rounded p-3">
          {buildSummary()}
        </p>

        {/* ---------------------------------------------------------------- */}
        {/* Live price + balance footer                                      */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex justify-between text-xs text-slate-500">
          <span>
            BTC/USD{' '}
            <span className={`font-bold ${isConnected ? 'text-cyan-400' : 'text-slate-600'}`}>
              {currentPrice > 0 ? `$${currentPrice.toLocaleString()}` : '—'}
            </span>
          </span>
          <span>
            Balance{' '}
            <span className="font-bold text-slate-300">{accountBalance}</span>
          </span>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* LAUNCH                                                           */}
        {/* ---------------------------------------------------------------- */}
        <button
          onClick={handleLaunch}
          className="w-full py-3 text-sm font-bold tracking-widest uppercase rounded border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black transition-colors duration-200"
          style={{ boxShadow: '0 0 20px rgba(0, 200, 255, 0.2)' }}
        >
          LAUNCH
        </button>
      </div>
    </main>
  );
}
