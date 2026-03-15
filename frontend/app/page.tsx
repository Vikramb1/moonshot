'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listCustomGames, deleteCustomGame } from '@/lib/customGameStorage';
import type { CustomGameTheme } from '@/types';

export default function LandingPage() {
  const [savedGames, setSavedGames] = useState<CustomGameTheme[]>([]);

  useEffect(() => {
    setSavedGames(listCustomGames());
  }, []);

  function handleDelete(id: string) {
    deleteCustomGame(id);
    setSavedGames(listCustomGames());
  }

  const modes = [
    {
      href: '/lobby',
      name: 'Orbit Space',
      desc: 'Fly through the grid, dodge asteroids, place orders',
      color: '#e06030',
    },
    {
      href: '/surf/lobby',
      name: 'Surf Shark',
      desc: 'Ride the price wave, dodge sharks, earn profits',
      color: '#20b0b0',
    },
    {
      href: '/custom/create',
      name: 'Describe a Game',
      desc: 'Describe your avatar, world & obstacles — AI generates it',
      color: '#40a030',
      badge: 'New',
    },
  ];

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      <div className="starfield" />

      <div className="relative z-10 flex flex-col items-center gap-8 text-center px-4">
        <h1
          className="text-4xl md:text-6xl text-retro-white tracking-wider leading-tight"
          style={{ textShadow: '0 0 20px rgba(224, 96, 48, 0.6), 0 4px 0 #b84820' }}
        >
          MOONSHOT
        </h1>

        <p className="text-[10px] md:text-xs text-retro-white/60 tracking-widest uppercase">
          Every coin you collect is a real trade
        </p>

        {/* Game modes */}
        <div className="flex flex-col gap-3 w-full max-w-md">
          {modes.map((mode) => (
            <Link key={mode.href} href={mode.href} className="block">
              <div
                className="pixel-panel p-4 flex flex-col gap-2 transition-colors cursor-pointer"
                style={{ borderColor: '#f8f8f0' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = mode.color)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#f8f8f0')}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold" style={{ color: mode.color }}>
                    {mode.name}
                  </span>
                  {mode.badge && (
                    <span className="text-[8px] px-2 py-0.5 uppercase" style={{ color: mode.color, border: `1px solid ${mode.color}` }}>
                      {mode.badge}
                    </span>
                  )}
                </div>
                <span className="text-[8px] md:text-[10px] text-retro-white/40 uppercase text-left">
                  {mode.desc}
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Saved custom games */}
        {savedGames.length > 0 && (
          <div className="w-full max-w-md">
            <h3 className="text-[10px] text-retro-white/50 uppercase tracking-widest mb-3">
              Your Games
            </h3>
            <div className="flex flex-col gap-2">
              {savedGames.map((game) => (
                <div key={game.id} className="pixel-panel p-3 flex items-center justify-between">
                  <Link href={`/custom/create?replay=${game.id}`} className="flex-1 flex flex-col gap-1">
                    <span className="text-xs text-retro-white uppercase">{game.name}</span>
                    <span className="text-[7px] text-retro-white/30 uppercase">
                      {game.avatarDescription} · {game.backgroundDescription}
                    </span>
                  </Link>
                  <button
                    onClick={(e) => { e.preventDefault(); handleDelete(game.id); }}
                    className="text-[8px] text-retro-white/30 hover:text-retro-red ml-3 uppercase"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <Link href="/lobby">
          <button className="pixel-btn pixel-btn-green text-base px-12 py-4">
            START
          </button>
        </Link>
      </div>
    </main>
  );
}
