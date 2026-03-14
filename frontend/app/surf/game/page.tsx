'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { GameParams, GameResult } from '@/types';

const SurfGame = dynamic(() => import('@/components/SurfGame'), { ssr: false });
const SurfRevealScreen = dynamic(() => import('@/components/SurfRevealScreen'), { ssr: false });

function parseGameParams(searchParams: URLSearchParams): GameParams {
  const rawDuration = searchParams.get('duration');
  const duration: 30 | 60 = rawDuration === '30' ? 30 : 60;
  const rawProfit = searchParams.get('profitThreshold');
  const profitThreshold = rawProfit ? parseFloat(rawProfit) : null;
  const rawLoss = searchParams.get('lossThreshold');
  const lossThreshold = rawLoss ? parseFloat(rawLoss) : null;
  const rawSize = searchParams.get('positionSize');
  const positionSize = rawSize ? parseFloat(rawSize) : 0.5;
  return { duration, profitThreshold, lossThreshold, positionSize, symbol: 'ETH-PERP' as const, useLive: false };
}

function SurfGamePageInner() {
  const searchParams = useSearchParams();
  const gameParams = parseGameParams(searchParams);

  const [gameStatus, setGameStatus] = useState<'countdown' | 'playing' | 'ended'>('countdown');
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [countdownValue, setCountdownValue] = useState<number>(3);

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

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-ocean-dark">
      {gameStatus === 'playing' && (
        <SurfGame
          params={gameParams}
          onGameEnd={(result) => {
            setGameResult(result);
            setGameStatus('ended');
          }}
        />
      )}

      {gameStatus === 'countdown' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="ocean-bg" />
          <span
            className="relative z-10 text-6xl md:text-8xl text-ocean-foam"
            style={{
              textShadow: '0 0 40px rgba(32, 176, 176, 0.8), 0 4px 0 #188080',
            }}
          >
            {countdownValue > 0 ? countdownValue : 'SURF!'}
          </span>
        </div>
      )}

      {gameStatus === 'ended' && gameResult && (
        <SurfRevealScreen result={gameResult} />
      )}
    </div>
  );
}

export default function SurfGamePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ocean-dark" />}>
      <SurfGamePageInner />
    </Suspense>
  );
}
