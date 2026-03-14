'use client';

/**
 * Game page — /game
 *
 * Reads GameParams from URL, runs countdown, renders game, shows results.
 * Countdown is owned here; startGame() on engine is called after countdown.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { GameParams, GameResult } from '@/types';

const Game = dynamic(() => import('@/components/Game'), { ssr: false });
const RevealScreen = dynamic(() => import('@/components/RevealScreen'), { ssr: false });

function parseGameParams(searchParams: URLSearchParams): GameParams {
  const rawDuration = searchParams.get('duration');
  const duration: 30 | 60 = rawDuration === '30' ? 30 : 60;
  const rawProfit = searchParams.get('profitThreshold');
  const profitThreshold = rawProfit ? parseFloat(rawProfit) : null;
  const rawLoss = searchParams.get('lossThreshold');
  const lossThreshold = rawLoss ? parseFloat(rawLoss) : null;
  const rawPos = searchParams.get('positionSize');
  const positionSize = rawPos ? Math.max(0.5, parseFloat(rawPos)) : 0.5;
  return { duration, profitThreshold, lossThreshold, positionSize };
}

function GamePageInner() {
  const searchParams = useSearchParams();
  const gameParams = parseGameParams(searchParams);

  const [gameStatus, setGameStatus] = useState<'countdown' | 'playing' | 'ended'>('countdown');
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [countdownValue, setCountdownValue] = useState<number>(3);

  // Countdown timer
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
    <div className="relative w-screen h-screen overflow-hidden bg-space-dark">
      {/* Game canvas — mounted when playing */}
      {gameStatus === 'playing' && (
        <Game
          params={gameParams}
          onGameEnd={(result) => {
            setGameResult(result);
            setGameStatus('ended');
          }}
        />
      )}

      {/* Countdown overlay */}
      {gameStatus === 'countdown' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="starfield" />
          <span
            className="relative z-10 text-6xl md:text-8xl text-retro-white"
            style={{
              textShadow: '0 0 40px rgba(224, 96, 48, 0.8), 0 4px 0 #b84820',
            }}
          >
            {countdownValue > 0 ? countdownValue : 'GO!'}
          </span>
        </div>
      )}

      {/* Reveal screen */}
      {gameStatus === 'ended' && gameResult && (
        <RevealScreen result={gameResult} />
      )}
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-space-dark" />}>
      <GamePageInner />
    </Suspense>
  );
}
