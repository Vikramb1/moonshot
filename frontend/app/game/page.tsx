'use client';

/**
 * Game page — /game
 *
 * Entry point for an active game session.
 * Reads GameParams from URL search params, runs the countdown overlay,
 * renders the Three.js game canvas, and shows RevealScreen when the game ends.
 *
 * URL params:
 *   duration          — 30 or 60 (seconds); defaults to 60 if missing
 *   profitThreshold   — optional number; omitted means no profit limit
 *   lossThreshold     — optional number; omitted means no loss limit
 *
 * Rendering state machine:
 *   gameStatus === 'idle'      → hidden (game not yet started)
 *   gameStatus === 'countdown' → full-screen countdown overlay (3… 2… 1…)
 *   gameStatus === 'playing'   → <Game /> canvas + <HUD /> overlay
 *   gameStatus === 'ended'     → <RevealScreen /> overlay (canvas still underneath)
 *
 * TODO: implement the countdown visual (numbers counting down with animation)
 * TODO: pass gameResult from useGameEngine to RevealScreen once endGame is wired
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { GameParams, GameResult } from '@/types';

// Three.js components must be dynamically imported (no SSR)
const Game = dynamic(() => import('@/components/Game'), { ssr: false });
const RevealScreen = dynamic(() => import('@/components/RevealScreen'), { ssr: false });

// ---------------------------------------------------------------------------
// Param parsing helpers
// ---------------------------------------------------------------------------

function parseGameParams(searchParams: URLSearchParams): GameParams {
  const rawDuration = searchParams.get('duration');
  const duration: 30 | 60 = rawDuration === '30' ? 30 : 60;

  const rawProfit = searchParams.get('profitThreshold');
  const profitThreshold = rawProfit ? parseFloat(rawProfit) : null;

  const rawLoss = searchParams.get('lossThreshold');
  const lossThreshold = rawLoss ? parseFloat(rawLoss) : null;

  return { duration, profitThreshold, lossThreshold };
}

// ---------------------------------------------------------------------------
// Inner component (needs useSearchParams inside Suspense boundary)
// ---------------------------------------------------------------------------

function GamePageInner() {
  const searchParams = useSearchParams();
  const gameParams = parseGameParams(searchParams);

  /**
   * gameStatus mirrors the status inside useGameEngine so this page can swap
   * between the countdown overlay, game canvas, and reveal screen.
   * The Game component drives status changes via callbacks passed as props.
   *
   * TODO: lift useGameEngine here if game status needs to be read at page level,
   *       or keep it inside <Game /> and bubble status changes via onStatusChange.
   */
  const [gameStatus, setGameStatus] = useState<'countdown' | 'playing' | 'ended'>('countdown');
  const [gameResult, setGameResult] = useState<GameResult | null>(null);

  // ---------------------------------------------------------------------------
  // Countdown state (3 → 2 → 1 → launch)
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      {/* ------------------------------------------------------------------ */}
      {/* Three.js game canvas — always mounted so the scene stays warm      */}
      {/* ------------------------------------------------------------------ */}
      {gameStatus !== 'ended' && (
        <Game
          params={gameParams}
          onGameEnd={(result) => {
            setGameResult(result);
            setGameStatus('ended');
          }}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Countdown overlay                                                  */}
      {/* ------------------------------------------------------------------ */}
      {gameStatus === 'countdown' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <span
            className="text-9xl font-extrabold text-white"
            style={{
              textShadow: '0 0 40px rgba(0,200,255,0.9)',
              // TODO: add scale/fade animation triggered by countdownValue change
            }}
          >
            {countdownValue > 0 ? countdownValue : 'LAUNCH'}
          </span>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Reveal screen                                                       */}
      {/* ------------------------------------------------------------------ */}
      {gameStatus === 'ended' && gameResult && (
        <RevealScreen result={gameResult} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export — wrap in Suspense for useSearchParams
// ---------------------------------------------------------------------------

export default function GamePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <GamePageInner />
    </Suspense>
  );
}
