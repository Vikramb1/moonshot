import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* Starfield */}
      <div className="starfield" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-10 text-center px-4">
        {/* Title */}
        <h1
          className="text-4xl md:text-6xl text-retro-white tracking-wider leading-tight"
          style={{
            textShadow:
              '0 0 20px rgba(224, 96, 48, 0.6), 0 4px 0 #b84820',
          }}
        >
          MOONSHOT
        </h1>

        <p className="text-[10px] md:text-xs text-retro-white/60 tracking-widest uppercase">
          Every coin you collect is a real trade
        </p>

        {/* Game selection */}
        <div className="flex flex-col gap-4 w-full max-w-md">
          {/* COIN RUSH — active game */}
          <Link href="/lobby" className="block">
            <div className="pixel-panel p-5 flex flex-col gap-2 hover:border-retro-orange transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <span className="text-xs md:text-sm text-retro-orange uppercase">
                  Game Mode
                </span>
              </div>
              <span className="text-sm md:text-base text-retro-white uppercase">
                Coin Rush
              </span>
              <span className="text-[8px] md:text-[10px] text-retro-white/40 uppercase">
                Fly through the grid, collect coins, place orders
              </span>
            </div>
          </Link>

          {/* SURF SHARK — active game */}
          <Link href="/surf/lobby" className="block">
            <div className="pixel-panel p-5 flex flex-col gap-2 hover:border-ocean-teal transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <span className="text-xs md:text-sm text-ocean-teal uppercase">
                  Game Mode
                </span>
              </div>
              <span className="text-sm md:text-base text-retro-white uppercase">
                Surf Shark
              </span>
              <span className="text-[8px] md:text-[10px] text-retro-white/40 uppercase">
                Ride the price wave, dodge sharks, earn profits
              </span>
            </div>
          </Link>

          {/* DESCRIBE A GAME — coming soon */}
          <div className="pixel-panel p-5 flex flex-col gap-2 opacity-50 cursor-not-allowed">
            <div className="flex items-center justify-between">
              <span className="text-xs md:text-sm text-retro-gray uppercase">
                Custom
              </span>
              <span className="text-[8px] text-retro-yellow border border-retro-yellow px-2 py-0.5 uppercase">
                Soon
              </span>
            </div>
            <span className="text-sm md:text-base text-retro-gray uppercase">
              Describe a Game
            </span>
          </div>
        </div>

        {/* START button */}
        <Link href="/lobby">
          <button className="pixel-btn pixel-btn-green text-base px-12 py-4">
            START
          </button>
        </Link>
      </div>
    </main>
  );
}
