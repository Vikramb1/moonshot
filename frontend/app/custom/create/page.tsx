'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLiquid } from '@/lib/useLiquid';
import { saveCustomGame, getCustomGame } from '@/lib/customGameStorage';
import type { CustomGameTheme } from '@/types';

const STEPS = [
  { key: 'send', label: 'Sending to AI' },
  { key: 'wait', label: 'Generating visuals' },
  { key: 'parse', label: 'Building theme' },
  { key: 'save', label: 'Saving game' },
  { key: 'launch', label: 'Launching' },
];

function CustomCreateInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentPrice, isConnected } = useLiquid('ETH-PERP');

  const replayId = searchParams.get('replay');

  const [gameName, setGameName] = useState('');
  const [avatarDesc, setAvatarDesc] = useState('');
  const [bgDesc, setBgDesc] = useState('');
  const [obstacleDesc, setObstacleDesc] = useState('');

  const [duration, setDuration] = useState<30 | 60>(60);
  const [positionSize, setPositionSize] = useState('100');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentStep, setCurrentStep] = useState(-1);
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  function addLog(msg: string) {
    setLogs((prev) => [...prev, msg]);
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

  async function handleGenerate() {
    if (!avatarDesc || !bgDesc || !obstacleDesc) {
      setError('Please fill in all three descriptions.');
      return;
    }

    setLoading(true);
    setError('');
    setLogs([]);
    setCurrentStep(0);

    try {
      if (replayId) {
        const saved = getCustomGame(replayId);
        if (saved) {
          setCurrentStep(4);
          addLog('Reusing saved theme');
          const qp = new URLSearchParams();
          qp.set('id', saved.id);
          qp.set('duration', String(duration));
          const ps = parseFloat(positionSize);
          if (ps >= 0.5) qp.set('positionSize', String(ps));
          router.push(`/custom/game?${qp.toString()}`);
          return;
        }
      }

      // Step 0: Send
      addLog(`Avatar: ${avatarDesc}`);
      addLog(`World: ${bgDesc}`);
      addLog(`Obstacles: ${obstacleDesc}`);

      setCurrentStep(1);
      // Step 1: Wait for response
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
        return;
      }

      // Step 2: Parse
      setCurrentStep(2);
      addLog(`Avatar draw: ${data.drawAvatar?.length || 0} chars`);
      addLog(`Background draw: ${data.drawBackground?.length || 0} chars`);
      addLog(`Obstacle draw: ${data.drawObstacle?.length || 0} chars`);

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

      // Step 3: Save
      setCurrentStep(3);
      saveCustomGame(theme);
      addLog('Theme saved to browser');

      // Step 4: Launch
      setCurrentStep(4);
      const qp = new URLSearchParams();
      qp.set('id', theme.id);
      qp.set('duration', String(duration));
      const ps = parseFloat(positionSize);
      if (ps >= 0.5) qp.set('positionSize', String(ps));

      router.push(`/custom/game?${qp.toString()}`);
    } catch (err) {
      addLog(`Failed: ${err}`);
      setError(`Failed to connect to backend: ${err}`);
      setLoading(false);
      setCurrentStep(-1);
    }
  }

  const accent = '#40a030';
  const accentDark = '#308020';

  const inputBox: React.CSSProperties = {
    display: 'flex', alignItems: 'center',
    border: `3px solid ${accent}`, background: '#081808',
    padding: '6px 10px', borderRadius: 4,
  };

  const inputStyle: React.CSSProperties = {
    flex: 1, background: 'transparent', color: '#e0ffe0',
    outline: 'none', fontSize: 12,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 8, color: 'rgba(200,255,200,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em',
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center px-4">
      <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(180deg, #0d1f0d 0%, #060e06 100%)' }} />

      <div className="relative z-10 w-full max-w-md" style={{ paddingTop: 16, paddingBottom: 32 }}>
        <Link href="/" className="inline-block mb-3">
          <div style={{
            padding: '6px 10px', fontWeight: 'bold', textTransform: 'uppercase',
            letterSpacing: '0.05em', fontSize: 10,
            border: `3px solid ${accent}`, background: accentDark, color: '#e0ffe0',
            borderRadius: 4, cursor: 'pointer',
          }}>
            &larr; BACK
          </div>
        </Link>

        <div style={{
          border: `3px solid ${accent}`, background: 'rgba(8, 20, 8, 0.92)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)', borderRadius: 6,
          padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <h2 style={{ fontSize: 13, color: '#e0ffe0', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Describe a Game
          </h2>

          {/* Game Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Game Name</label>
            <div style={inputBox}>
              <input type="text" placeholder="e.g. Rainbow Racer" value={gameName} onChange={(e) => setGameName(e.target.value)}
                style={{ ...inputStyle, width: '100%' }} className="placeholder-white/20" />
            </div>
          </div>

          {/* Descriptions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Avatar (your character)</label>
            <div style={inputBox}>
              <input type="text" placeholder="e.g. A Mario kart racer with a red cap" value={avatarDesc} onChange={(e) => setAvatarDesc(e.target.value)}
                style={{ ...inputStyle, width: '100%' }} className="placeholder-white/20" />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Background (the world)</label>
            <div style={inputBox}>
              <input type="text" placeholder="e.g. Rainbow Road with stars and galaxies" value={bgDesc} onChange={(e) => setBgDesc(e.target.value)}
                style={{ ...inputStyle, width: '100%' }} className="placeholder-white/20" />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Obstacles (things to dodge)</label>
            <div style={inputBox}>
              <input type="text" placeholder="e.g. Banana peels spinning on the road" value={obstacleDesc} onChange={(e) => setObstacleDesc(e.target.value)}
                style={{ ...inputStyle, width: '100%' }} className="placeholder-white/20" />
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${accent}40`, margin: '2px 0' }} />

          {/* Duration + Position Size */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Duration</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {([30, 60] as const).map((d) => (
                  <button key={d} onClick={() => setDuration(d)} style={{
                    flex: 1, padding: '5px 0', fontWeight: 'bold', fontSize: 11,
                    border: `3px solid ${accent}`, borderRadius: 4, cursor: 'pointer',
                    background: duration === d ? accent : 'transparent',
                    color: duration === d ? '#000' : '#e0ffe0',
                  }}>{d}s</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Position Size</label>
              <div style={{ ...inputBox, padding: '5px 8px' }}>
                <span style={{ color: 'rgba(200,255,200,0.5)', fontSize: 11, marginRight: 4 }}>$</span>
                <input type="number" min="0.5" step="0.5" value={positionSize} onChange={(e) => setPositionSize(e.target.value)}
                  style={{ ...inputStyle, fontSize: 11 }} className="placeholder-white/20" />
              </div>
            </div>
          </div>

          {error && (
            <p style={{ fontSize: 10, color: '#ff4060', textAlign: 'center' }}>{error}</p>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{
              width: '100%', padding: '14px 24px', fontWeight: 'bold', textTransform: 'uppercase',
              letterSpacing: '0.05em', fontSize: 14,
              border: `3px solid ${accent}`,
              background: loading ? '#1a3a1a' : accent,
              color: loading ? '#60a060' : '#000',
              borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : `0 4px 0 ${accentDark}, 0 6px 8px rgba(0, 0, 0, 0.3)`,
            }}
          >
            {loading ? (replayId ? 'LAUNCHING...' : 'GENERATING...') : (replayId ? 'PLAY AGAIN' : 'GENERATE & PLAY')}
          </button>

          {/* Step progress */}
          {loading && currentStep >= 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {STEPS.map((step, i) => {
                const isDone = i < currentStep;
                const isActive = i === currentStep;
                return (
                  <div key={step.key} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    opacity: i > currentStep ? 0.25 : 1,
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%',
                      border: `2px solid ${isDone ? accent : isActive ? '#e0ffe0' : '#333'}`,
                      background: isDone ? accent : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: isDone ? '#000' : '#e0ffe0',
                      fontWeight: 'bold',
                      animation: isActive ? 'stepPulse 1s ease-in-out infinite' : undefined,
                    }}>
                      {isDone ? '✓' : i + 1}
                    </div>
                    <span style={{
                      fontSize: 11, color: isActive ? '#e0ffe0' : isDone ? accent : '#555',
                      fontWeight: isActive ? 'bold' : 'normal',
                    }}>
                      {step.label}{isActive && '...'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Detail logs */}
          {logs.length > 0 && (
            <div style={{
              background: '#040a04', border: `1px solid ${accent}30`, borderRadius: 4,
              padding: '6px 10px', maxHeight: 100, overflowY: 'auto',
              fontFamily: "'Space Mono', monospace", fontSize: 8, lineHeight: 1.5,
            }}>
              {logs.map((log, i) => (
                <div key={i} style={{ color: log.startsWith('Error') || log.startsWith('Failed') ? '#ff4060' : 'rgba(200,255,200,0.5)' }}>
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
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
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#060e06' }} />}>
      <CustomCreateInner />
    </Suspense>
  );
}
