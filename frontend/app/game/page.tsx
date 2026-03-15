'use client';

/**
 * Game page — /game
 *
 * Reads GameParams from URL, runs countdown, renders game, shows results.
 * WS connection starts immediately so price data is ready when game begins.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useLiquid } from '@/lib/useLiquid';
import type { GameParams, GameResult, TradingSymbol } from '@/types';

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
  const rawSymbol = searchParams.get('symbol');
  const validSymbols: TradingSymbol[] = ['ETH-PERP', 'BTC-PERP', 'SOL-PERP', 'DOGE-PERP'];
  const symbol: TradingSymbol = validSymbols.includes(rawSymbol as TradingSymbol) ? rawSymbol as TradingSymbol : 'ETH-PERP';
  const useLive = searchParams.get('useLive') === '1';
  return { duration, profitThreshold, lossThreshold, positionSize, symbol, useLive };
}

function GamePageInner() {
  const searchParams = useSearchParams();
  const gameParams = parseGameParams(searchParams);

  // Start WS connection immediately — ready before countdown finishes
  const priceData = useLiquid(gameParams.symbol);

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
          priceData={priceData}
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
          {/* Dark overlay for better contrast */}
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative z-10 flex flex-col items-center gap-6">
            <span className="text-[10px] md:text-xs text-retro-white/50 uppercase tracking-[0.3em]">
              {gameParams.symbol.replace('-PERP', '')} · {gameParams.duration}s · Orbit Space
            </span>
            <span
              className="text-7xl md:text-9xl text-retro-white font-bold"
              style={{
                textShadow: '0 0 60px rgba(224, 96, 48, 0.9), 0 0 120px rgba(224, 96, 48, 0.4), 0 6px 0 #b84820',
                animation: 'countdownPulse 1s ease-in-out infinite',
              }}
            >
              {countdownValue > 0 ? countdownValue : 'GO!'}
            </span>
            <div className="flex flex-col items-center gap-2">
              {!priceData.isConnected && (
                <span className="text-xs text-cyan-400/80 bg-black/30 px-3 py-1 rounded">
                  Connecting to {gameParams.symbol.replace('-PERP', '')} price feed...
                </span>
              )}
              {priceData.isConnected && priceData.currentPrice > 0 && (
                <span className="text-xs text-green-400/80 bg-black/30 px-3 py-1 rounded">
                  {gameParams.symbol.replace('-PERP', '')} ${priceData.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </span>
              )}
            </div>
            <span className="text-[8px] text-retro-white/30 uppercase tracking-widest mt-2">
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
