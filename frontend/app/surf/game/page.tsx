'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { GameParams, GameResult, TradingSymbol } from '@/types';

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
  const rawSymbol = searchParams.get('symbol');
  const validSymbols: TradingSymbol[] = ['ETH-PERP', 'BTC-PERP', 'SOL-PERP', 'DOGE-PERP'];
  const symbol: TradingSymbol = validSymbols.includes(rawSymbol as TradingSymbol) ? rawSymbol as TradingSymbol : 'ETH-PERP';
  const useLive = searchParams.get('useLive') === '1';
  return { duration, profitThreshold, lossThreshold, positionSize, symbol, useLive };
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
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative z-10 flex flex-col items-center gap-6">
            <span className="text-[10px] md:text-xs text-ocean-foam/50 uppercase tracking-[0.3em]">
              {gameParams.symbol.replace('-PERP', '')} · {gameParams.duration}s · Surf Shark
            </span>
            <span
              className="text-7xl md:text-9xl text-ocean-foam font-bold"
              style={{
                textShadow: '0 0 60px rgba(32, 176, 176, 0.9), 0 0 120px rgba(32, 176, 176, 0.4), 0 6px 0 #188080',
                animation: 'countdownPulse 1s ease-in-out infinite',
              }}
            >
              {countdownValue > 0 ? countdownValue : 'SURF!'}
            </span>
            <span className="text-[8px] text-ocean-foam/30 uppercase tracking-widest mt-2">
              W/S or Arrow keys to move
            </span>
          </div>
          <style>{`
            @keyframes countdownPulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.06); }
            }
          `}</style>
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
