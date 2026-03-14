/**
 * Landing page — /
 *
 * Full-screen cinematic entry point for MOONSHOT.
 * Pure visual — no game logic, no API calls.
 *
 * Layout:
 *   - Animated starfield background (CSS keyframe approach; swap for canvas later)
 *   - MOONSHOT title centered with text-glow utility
 *   - Tagline beneath the title
 *   - Single LAUNCH button that navigates to /lobby
 *
 * TODO: replace CSS starfield with a proper Three.js or canvas starfield for
 *       a smoother, more cinematic effect once the game canvas is scaffolded.
 */

import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black">
      {/* ------------------------------------------------------------------ */}
      {/* Starfield background                                                */}
      {/* TODO: replace with animated canvas / Three.js Points geometry      */}
      {/* ------------------------------------------------------------------ */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse at center, #0a0a1a 0%, #000000 100%)',
        }}
      >
        {/* Placeholder stars as absolutely-positioned pseudo-elements via inline styles.
            Replace this div with a <canvas> running a particle animation. */}
        <div className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'radial-gradient(1px 1px at 10% 15%, white, transparent),' +
              'radial-gradient(1px 1px at 30% 55%, white, transparent),' +
              'radial-gradient(1px 1px at 50% 25%, white, transparent),' +
              'radial-gradient(1px 1px at 70% 75%, white, transparent),' +
              'radial-gradient(1px 1px at 90% 40%, white, transparent),' +
              'radial-gradient(1px 1px at 20% 80%, white, transparent),' +
              'radial-gradient(1px 1px at 60% 10%, white, transparent),' +
              'radial-gradient(1px 1px at 80% 90%, white, transparent)',
          }}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Hero content                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative z-10 flex flex-col items-center gap-6 text-center px-4">
        {/* Title */}
        <h1
          className="text-7xl font-extrabold tracking-widest text-white uppercase"
          style={{
            textShadow:
              '0 0 20px rgba(0, 200, 255, 0.8), 0 0 60px rgba(0, 200, 255, 0.4)',
            letterSpacing: '0.3em',
          }}
        >
          MOONSHOT
        </h1>

        {/* Tagline */}
        <p className="text-lg text-slate-400 tracking-wide max-w-sm">
          every coin you collect is a real trade
        </p>

        {/* Launch CTA */}
        <Link
          href="/lobby"
          className="mt-6 px-10 py-4 text-sm font-bold tracking-widest uppercase rounded border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black transition-colors duration-200"
          style={{
            boxShadow: '0 0 20px rgba(0, 200, 255, 0.3)',
          }}
        >
          LAUNCH
        </Link>
      </div>
    </main>
  );
}
