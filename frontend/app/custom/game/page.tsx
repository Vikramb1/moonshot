'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getCustomGame } from '@/lib/customGameStorage';
import type { GameParams, GameResult, CustomGameTheme } from '@/types';

const CustomGame = dynamic(() => import('@/components/CustomGame'), { ssr: false });
const CustomRevealScreen = dynamic(() => import('@/components/CustomRevealScreen'), { ssr: false });

function parseGameParams(searchParams: URLSearchParams): GameParams {
  const rawDuration = searchParams.get('duration');
  const duration: 30 | 60 = rawDuration === '30' ? 30 : 60;
  const rawSize = searchParams.get('positionSize');
  const positionSize = rawSize ? Math.max(0.5, parseFloat(rawSize)) : 100;
  return {
    duration,
    profitThreshold: null,
    lossThreshold: null,
    positionSize,
    symbol: 'ETH-PERP',
    useLive: false,
  };
}

function CustomGamePageInner() {
  const searchParams = useSearchParams();
  const gameParams = parseGameParams(searchParams);
  const themeId = searchParams.get('id');

  const [theme, setTheme] = useState<CustomGameTheme | null>(null);
  const [gameStatus, setGameStatus] = useState<'loading' | 'countdown' | 'playing' | 'ended'>('loading');
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [countdownValue, setCountdownValue] = useState<number>(3);

  useEffect(() => {
    if (!themeId) return;
    const saved = getCustomGame(themeId);
    if (saved) {
      setTheme(saved);
      setGameStatus('countdown');
    }
  }, [themeId]);

  useEffect(() => {
    if (gameStatus !== 'countdown') return;

    const interval = setInterval(() => {
      setCountdownValue((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setGameStatus('playing');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gameStatus]);

  if (!themeId || (gameStatus === 'loading' && !theme)) {
    return (
      <div style={{
        minHeight: '100vh', background: '#060e06',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#40a030', fontSize: 14,
      }}>
        Loading theme...
      </div>
    );
  }

  const accent = theme?.colors.accent || '#40a030';

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: theme?.colors.bg || '#060e06' }}>
      {gameStatus === 'playing' && theme && (
        <CustomGame
          params={gameParams}
          theme={theme}
          onGameEnd={(result) => {
            setGameResult(result);
            setGameStatus('ended');
          }}
        />
      )}

      {gameStatus === 'countdown' && theme && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          {/* Dark overlay so countdown is always visible */}
          <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
          }} />
          {/* Theme gradient underneath */}
          <div style={{
            position: 'fixed', inset: 0,
            background: `linear-gradient(180deg, ${theme.colors.bgTop} 0%, ${theme.colors.bg} 100%)`,
            opacity: 0.4,
          }} />
          <div className="relative z-10 flex flex-col items-center gap-4">
            <div style={{
              fontSize: 14, textTransform: 'uppercase', letterSpacing: 6,
              color: `${accent}aa`,
            }}>
              {theme.name}
            </div>
            <span
              style={{
                fontSize: 120,
                fontWeight: 'bold',
                color: '#ffffff',
                textShadow: `0 0 60px ${accent}, 0 0 120px ${accent}80, 0 8px 0 ${accent}`,
                lineHeight: 1,
              }}
            >
              {countdownValue > 0 ? countdownValue : theme.labels.countdownGo}
            </span>
            <div style={{
              fontSize: 11, textTransform: 'uppercase', letterSpacing: 3,
              color: 'rgba(255, 255, 255, 0.4)', marginTop: 8,
            }}>
              W/S or Arrow Keys to move
            </div>
          </div>
        </div>
      )}

      {gameStatus === 'ended' && gameResult && theme && (
        <CustomRevealScreen result={gameResult} theme={theme} />
      )}
    </div>
  );
}

export default function CustomGamePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#060e06' }} />}>
      <CustomGamePageInner />
    </Suspense>
  );
}
