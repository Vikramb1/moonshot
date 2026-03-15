'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLiquid } from '@/lib/useLiquid';
import { saveCustomGame, getCustomGame } from '@/lib/customGameStorage';
import type { CustomGameTheme, TradingSymbol } from '@/types';

const STEPS = [
  { key: 'send', label: 'Sending descriptions to AI', detail: 'Packaging avatar, world & obstacle info' },
  { key: 'wait', label: 'AI generating visuals', detail: 'Creating draw functions, colors & labels' },
  { key: 'parse', label: 'Building game theme', detail: 'Parsing AI response into game config' },
  { key: 'save', label: 'Saving to browser', detail: 'Storing theme in local storage' },
  { key: 'launch', label: 'Launching game', detail: 'Redirecting to game page' },
];

function CustomCreateInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [symbol, setSymbol] = useState<TradingSymbol>('ETH-PERP');
  const { currentPrice, isConnected } = useLiquid(symbol);

  const replayId = searchParams.get('replay');

  // Step 1 fields
  const [gameName, setGameName] = useState('');
  const [avatarDesc, setAvatarDesc] = useState('');
  const [bgDesc, setBgDesc] = useState('');
  const [obstacleDesc, setObstacleDesc] = useState('');

  // Step 2 fields
  const [duration, setDuration] = useState<30 | 60>(60);
  const [positionSize, setPositionSize] = useState('100');
  const [useLive, setUseLive] = useState(false);

  // Which screen: 1 = describe, 2 = config
  const [screen, setScreen] = useState<1 | 2>(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentStep, setCurrentStep] = useState(-1);
  const [logs, setLogs] = useState<string[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  function addLog(msg: string) {
    const elapsed = startTimeRef.current > 0 ? ((Date.now() - startTimeRef.current) / 1000).toFixed(1) : '0.0';
    setLogs((prev) => [...prev, `[${elapsed}s] ${msg}`]);
  }

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (replayId) {
      const saved = getCustomGame(replayId);
      if (saved) {
        setGameName(saved.name);
        setAvatarDesc(saved.avatarDescription);
        setBgDesc(saved.backgroundDescription);
        setObstacleDesc(saved.obstacleDescription);
      }
    }
  }, [replayId]);

  function handleNextScreen() {
    if (!avatarDesc || !bgDesc || !obstacleDesc) {
      setError('Please fill in avatar, background, and obstacles.');
      return;
    }
    setError('');
    setScreen(2);
  }

  async function handleGenerate() {
    setLoading(true);
    setError('');
    setLogs([]);
    setCurrentStep(0);
    startTimeRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);

    try {
      if (replayId) {
        const saved = getCustomGame(replayId);
        if (saved) {
          setCurrentStep(4);
          addLog('Reusing saved theme');
          const qp = new URLSearchParams();
          qp.set('id', saved.id);
          qp.set('duration', String(duration));
          qp.set('symbol', symbol);
          const ps = parseFloat(positionSize);
          if (ps >= 0.5) qp.set('positionSize', String(ps));
          router.push(`/custom/game?${qp.toString()}`);
          return;
        }
      }

      addLog(`Avatar: "${avatarDesc}"`);
      addLog(`World: "${bgDesc}"`);
      addLog(`Obstacles: "${obstacleDesc}"`);
      addLog('Sending request to backend...');

      setCurrentStep(1);
      addLog('Waiting for AI to generate game visuals...');
      const res = await fetch('http://localhost:8000/api/generate-theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatar_description: avatarDesc,
          background_description: bgDesc,
          obstacle_description: obstacleDesc,
        }),
      });

      const data = await res.json();

      if (data.error) {
        addLog(`Error: ${data.error}`);
        setError(data.error);
        setLoading(false);
        setCurrentStep(-1);
        if (timerRef.current) clearInterval(timerRef.current);
        return;
      }

      addLog('AI response received successfully');

      setCurrentStep(2);
      addLog(`Avatar draw function: ${data.drawAvatar?.length || 0} chars`);
      addLog(`Background draw function: ${data.drawBackground?.length || 0} chars`);
      addLog(`Obstacle draw function: ${data.drawObstacle?.length || 0} chars`);
      if (data.colors) addLog(`Colors: accent=${data.colors.accent}, bg=${data.colors.background}`);
      if (data.labels) addLog(`Labels: health="${data.labels.healthLabel}", damage="${data.labels.damageText}"`);

      const theme: CustomGameTheme = {
        id: crypto.randomUUID(),
        name: gameName || 'Custom Game',
        avatarDescription: avatarDesc,
        backgroundDescription: bgDesc,
        obstacleDescription: obstacleDesc,
        createdAt: Date.now(),
        drawAvatar: data.drawAvatar,
        drawObstacle: data.drawObstacle,
        drawBackground: data.drawBackground,
        colors: data.colors,
        labels: data.labels,
      };

      setCurrentStep(3);
      saveCustomGame(theme);
      addLog('Theme saved to browser storage');

      setCurrentStep(4);
      addLog('Launching game...');
      if (timerRef.current) clearInterval(timerRef.current);
      const qp = new URLSearchParams();
      qp.set('id', theme.id);
      qp.set('duration', String(duration));
      qp.set('symbol', symbol);
      const ps = parseFloat(positionSize);
      if (ps >= 0.5) qp.set('positionSize', String(ps));

      router.push(`/custom/game?${qp.toString()}`);
    } catch (err) {
      addLog(`Failed: ${err}`);
      setError(`Failed to connect to backend: ${err}`);
      setLoading(false);
      setCurrentStep(-1);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }

  const inputStyle = "flex items-center border-4 px-3 py-2 rounded";

  return (
    <main className="relative min-h-screen flex items-center justify-center px-4">
      <div className="forest-bg" />

      <div className="relative z-10 w-full max-w-lg">
        <Link href="/" className="inline-block mb-4">
          <div className="forest-btn text-xs px-3 py-2">
            &larr; BACK
          </div>
        </Link>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center rounded-full text-[10px] font-bold"
              style={{
                width: 24, height: 24,
                background: screen === 1 ? '#40a030' : 'transparent',
                border: '2px solid #40a030',
                color: screen === 1 ? '#000' : '#40a030',
              }}>1</div>
            <span className="text-[10px] uppercase tracking-wider"
              style={{ color: screen === 1 ? '#e0ffe0' : 'rgba(200,255,200,0.4)' }}>
              Describe
            </span>
          </div>
          <span className="text-[10px]" style={{ color: 'rgba(200,255,200,0.3)' }}>&rarr;</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center rounded-full text-[10px] font-bold"
              style={{
                width: 24, height: 24,
                background: screen === 2 ? '#40a030' : 'transparent',
                border: `2px solid ${screen === 2 ? '#40a030' : 'rgba(64,160,48,0.3)'}`,
                color: screen === 2 ? '#000' : 'rgba(200,255,200,0.3)',
              }}>2</div>
            <span className="text-[10px] uppercase tracking-wider"
              style={{ color: screen === 2 ? '#e0ffe0' : 'rgba(200,255,200,0.4)' }}>
              Configure
            </span>
          </div>
        </div>

        {/* ============================================================ */}
        {/* SCREEN 1: Describe your game                                  */}
        {/* ============================================================ */}
        {screen === 1 && (
          <div className="forest-panel p-6 flex flex-col gap-5">
            <h2 className="text-sm md:text-base text-center uppercase tracking-wider" style={{ color: '#e0ffe0' }}>
              Game Studio
            </h2>

            {/* Game Name */}
            <div className="flex flex-col gap-2">
              <label className="text-[8px] md:text-[10px] uppercase tracking-wider" style={{ color: 'rgba(200,255,200,0.6)' }}>
                Game Name
              </label>
              <div className={inputStyle} style={{ borderColor: '#40a030', background: '#081808' }}>
                <input
                  type="text"
                  placeholder="e.g. Rainbow Racer"
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  className="flex-1 bg-transparent outline-none placeholder-white/20 text-xs"
                  style={{ color: '#e0ffe0' }}
                />
              </div>
            </div>

            {/* Avatar */}
            <div className="flex flex-col gap-2">
              <label className="text-[8px] md:text-[10px] uppercase tracking-wider" style={{ color: 'rgba(200,255,200,0.6)' }}>
                Avatar (your character)
              </label>
              <div className={inputStyle} style={{ borderColor: '#40a030', background: '#081808' }}>
                <input
                  type="text"
                  placeholder="e.g. A Mario kart racer with a red cap"
                  value={avatarDesc}
                  onChange={(e) => setAvatarDesc(e.target.value)}
                  className="flex-1 bg-transparent outline-none placeholder-white/20 text-xs"
                  style={{ color: '#e0ffe0' }}
                />
              </div>
            </div>

            {/* Background */}
            <div className="flex flex-col gap-2">
              <label className="text-[8px] md:text-[10px] uppercase tracking-wider" style={{ color: 'rgba(200,255,200,0.6)' }}>
                Background (the world)
              </label>
              <div className={inputStyle} style={{ borderColor: '#40a030', background: '#081808' }}>
                <input
                  type="text"
                  placeholder="e.g. Rainbow Road with stars and galaxies"
                  value={bgDesc}
                  onChange={(e) => setBgDesc(e.target.value)}
                  className="flex-1 bg-transparent outline-none placeholder-white/20 text-xs"
                  style={{ color: '#e0ffe0' }}
                />
              </div>
            </div>

            {/* Obstacles */}
            <div className="flex flex-col gap-2">
              <label className="text-[8px] md:text-[10px] uppercase tracking-wider" style={{ color: 'rgba(200,255,200,0.6)' }}>
                Obstacles (things to dodge)
              </label>
              <div className={inputStyle} style={{ borderColor: '#40a030', background: '#081808' }}>
                <input
                  type="text"
                  placeholder="e.g. Banana peels spinning on the road"
                  value={obstacleDesc}
                  onChange={(e) => setObstacleDesc(e.target.value)}
                  className="flex-1 bg-transparent outline-none placeholder-white/20 text-xs"
                  style={{ color: '#e0ffe0' }}
                />
              </div>
            </div>

            {error && (
              <p className="text-[10px] text-center" style={{ color: '#ff4060' }}>{error}</p>
            )}

            {/* Next button */}
            <button
              onClick={handleNextScreen}
              className="w-full forest-btn forest-btn-green text-sm py-3"
            >
              NEXT &rarr;
            </button>
          </div>
        )}

        {/* ============================================================ */}
        {/* SCREEN 2: Configure trading params                            */}
        {/* ============================================================ */}
        {screen === 2 && (
          <div className="forest-panel p-6 flex flex-col gap-5">
            <h2 className="text-sm md:text-base text-center uppercase tracking-wider" style={{ color: '#e0ffe0' }}>
              Game Studio
            </h2>

            {/* Summary of what was described */}
            <div className="border-4 p-3 rounded" style={{ borderColor: 'rgba(64,160,48,0.2)' }}>
              <p className="text-[8px] leading-relaxed" style={{ color: 'rgba(200,255,200,0.5)' }}>
                <span style={{ color: '#40a030' }}>{gameName || 'Custom Game'}</span>
                {' — '}avatar: {avatarDesc} · world: {bgDesc} · obstacles: {obstacleDesc}
              </p>
            </div>

            {/* Asset */}
            <div className="flex flex-col gap-2">
              <label className="text-[8px] md:text-[10px] uppercase tracking-wider" style={{ color: 'rgba(200,255,200,0.6)' }}>
                Asset
              </label>
              <div className="flex gap-3">
                {(['ETH-PERP', 'BTC-PERP', 'SOL-PERP', 'DOGE-PERP'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSymbol(s)}
                    className={`flex-1 forest-btn text-xs py-2 ${
                      symbol === s ? 'forest-btn-green' : 'forest-btn-dim'
                    }`}
                  >
                    {s.replace('-PERP', '')}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="flex flex-col gap-2">
              <label className="text-[8px] md:text-[10px] uppercase tracking-wider" style={{ color: 'rgba(200,255,200,0.6)' }}>
                Game Duration
              </label>
              <div className="flex gap-3">
                {([30, 60] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`flex-1 forest-btn text-xs py-2 ${
                      duration === d ? 'forest-btn-green' : 'forest-btn-dim'
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            {/* Position Size */}
            <div className="flex flex-col gap-2">
              <label className="text-[8px] md:text-[10px] uppercase tracking-wider" style={{ color: 'rgba(200,255,200,0.6)' }}>
                Position Size (USD)
              </label>
              <div className={inputStyle} style={{ borderColor: '#40a030', background: '#081808' }}>
                <span className="text-xs mr-2" style={{ color: 'rgba(200,255,200,0.6)' }}>$</span>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={positionSize}
                  onChange={(e) => setPositionSize(e.target.value)}
                  className="flex-1 bg-transparent outline-none placeholder-white/20 text-xs"
                  style={{ color: '#e0ffe0' }}
                />
              </div>
              <p className="text-[7px]" style={{ color: 'rgba(200,255,200,0.3)' }}>25x leverage · min $0.50</p>
            </div>

            {/* Trading Mode */}
            <div className="flex flex-col gap-2">
              <label className="text-[8px] md:text-[10px] uppercase tracking-wider" style={{ color: 'rgba(200,255,200,0.6)' }}>
                Trading Mode
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setUseLive(false)}
                  className={`flex-1 forest-btn text-xs py-2 ${!useLive ? 'forest-btn-green' : 'forest-btn-dim'}`}
                >
                  PAPER
                </button>
                <button
                  onClick={() => setUseLive(true)}
                  className={`flex-1 forest-btn text-xs py-2 ${useLive ? 'forest-btn-green' : 'forest-btn-dim'}`}
                  style={useLive ? { borderColor: '#c03020', background: 'rgba(192, 48, 32, 0.2)' } : {}}
                >
                  LIVE
                </button>
              </div>
              {useLive && (
                <p className="text-[7px]" style={{ color: '#c03020' }}>
                  REAL MONEY — orders placed on Liquid exchange
                </p>
              )}
            </div>

            {/* Price + balance */}
            <div className="flex justify-between text-[8px]" style={{ color: 'rgba(200,255,200,0.4)' }}>
              <span>
                {symbol.replace('-PERP', '')}/USD{' '}
                <span className="font-bold" style={{ color: isConnected ? '#40a030' : '#666' }}>
                  {currentPrice > 0 ? `$${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '--'}
                </span>
              </span>
              <span>
                Balance{' '}
                <span className="font-bold" style={{ color: 'rgba(200,255,200,0.7)' }}>$10,000 (mock)</span>
              </span>
            </div>

            {error && (
              <p className="text-[10px] text-center" style={{ color: '#ff4060' }}>{error}</p>
            )}

            {/* Back + Generate buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setScreen(1)}
                className="forest-btn forest-btn-dim text-xs py-3 px-4"
                disabled={loading}
              >
                &larr; BACK
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className={`flex-1 forest-btn text-sm py-3 ${loading ? '' : 'forest-btn-green'}`}
                style={loading ? { background: '#1a3a1a', color: '#60a060', cursor: 'not-allowed', boxShadow: 'none' } : {}}
              >
                {loading ? (replayId ? 'LAUNCHING...' : 'GENERATING...') : (replayId ? 'PLAY AGAIN' : 'GENERATE & PLAY')}
              </button>
            </div>

            {/* Step progress */}
            {loading && currentStep >= 0 && (
              <div className="flex flex-col gap-1">
                <div className="text-[9px] text-right mb-1" style={{ color: 'rgba(200,255,200,0.4)' }}>
                  {(elapsedMs / 1000).toFixed(1)}s elapsed
                </div>
                {STEPS.map((step, i) => {
                  const isDone = i < currentStep;
                  const isActive = i === currentStep;
                  return (
                    <div key={step.key} className="flex items-start gap-2" style={{
                      opacity: i > currentStep ? 0.2 : 1,
                      transition: 'opacity 0.3s ease',
                    }}>
                      <div className="flex items-center justify-center shrink-0 mt-0.5" style={{
                        width: 22, height: 22, borderRadius: '50%',
                        border: `2px solid ${isDone ? '#40a030' : isActive ? '#e0ffe0' : '#333'}`,
                        background: isDone ? '#40a030' : 'transparent',
                        fontSize: 10, color: isDone ? '#000' : '#e0ffe0',
                        fontWeight: 'bold',
                        animation: isActive ? 'stepPulse 1s ease-in-out infinite' : undefined,
                      }}>
                        {isDone ? '✓' : i + 1}
                      </div>
                      <div className="flex flex-col gap-px">
                        <span className="text-[11px]" style={{
                          color: isActive ? '#e0ffe0' : isDone ? '#40a030' : '#555',
                          fontWeight: isActive ? 'bold' : 'normal',
                        }}>
                          {step.label}{isActive && '...'}
                        </span>
                        {(isActive || isDone) && (
                          <span className="text-[8px]" style={{ color: 'rgba(200,255,200,0.35)' }}>
                            {step.detail}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Detail logs */}
            {logs.length > 0 && (
              <div className="rounded overflow-y-auto" style={{
                background: '#040a04', border: '1px solid rgba(64,160,48,0.2)',
                padding: '6px 10px', maxHeight: 100,
                fontFamily: "'Space Mono', monospace", fontSize: 8, lineHeight: 1.5,
              }}>
                {logs.map((log, i) => (
                  <div key={i} style={{ color: log.includes('Error') || log.includes('Failed') ? '#ff4060' : 'rgba(200,255,200,0.5)' }}>
                    {log}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes stepPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(64,160,48,0.4); }
          50% { box-shadow: 0 0 0 6px rgba(64,160,48,0); }
        }
      `}</style>
    </main>
  );
}

export default function CustomCreatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#060e06' }} />}>
      <CustomCreateInner />
    </Suspense>
  );
}
