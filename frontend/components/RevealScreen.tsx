'use client';

/**
 * RevealScreen — retro pixel-art post-game results overlay
 */

import { useRouter } from 'next/navigation';
import type { GameResult } from '@/types';

interface RevealScreenProps {
  result: GameResult;
}

const END_REASON_LABEL: Record<GameResult['endReason'], string> = {
  time: "TIME'S UP",
  profit: 'PROFIT TARGET HIT',
  loss: 'STOP LOSS TRIGGERED',
};

const DIRECTION_COLORS: Record<GameResult['netDirection'], string> = {
  bullish: 'text-retro-green border-retro-green',
  bearish: 'text-retro-red border-retro-red',
  neutral: 'text-retro-white/60 border-retro-white/40',
};

export default function RevealScreen({ result }: RevealScreenProps) {
  const router = useRouter();
  const isPnLPositive = result.totalPnL >= 0;

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatPrice(price: number): string {
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto py-8 px-4">
      <div className="starfield" />

      <div className="relative z-10 w-full max-w-lg flex flex-col gap-5">
        {/* End reason */}
        <div className="text-center">
          <h1
            className="text-xl md:text-2xl text-retro-white tracking-wide"
            style={{ textShadow: '0 0 20px rgba(224, 96, 48, 0.6)' }}
          >
            {END_REASON_LABEL[result.endReason]}
          </h1>
          <p className="text-[8px] text-retro-white/40 mt-2">
            {result.duration}s elapsed
          </p>
        </div>

        {/* Direction badge */}
        <div className="flex justify-center">
          <span
            className={`border-4 px-4 py-1 text-[10px] uppercase tracking-widest ${DIRECTION_COLORS[result.netDirection]}`}
          >
            {result.netDirection}
          </span>
        </div>

        {/* Stats grid */}
        <div className="pixel-panel p-4 grid grid-cols-3 gap-4">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[7px] text-retro-white/40 uppercase">Orders</span>
            <span className="text-base text-retro-white">{result.ordersPlaced.length}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[7px] text-retro-white/40 uppercase">Size</span>
            <span className="text-base text-retro-white">{result.totalSize.toFixed(4)}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[7px] text-retro-white/40 uppercase">PnL</span>
            <span className={`text-base ${isPnLPositive ? 'text-retro-green' : 'text-retro-red'}`}>
              {isPnLPositive ? '+' : ''}${result.totalPnL.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Orders list */}
        {result.ordersPlaced.length > 0 && (
          <div className="pixel-panel overflow-hidden">
            <div className="px-3 py-2 bg-space-deeper text-[7px] text-retro-white/40 uppercase grid grid-cols-4 gap-2">
              <span>Side</span>
              <span>Price</span>
              <span>Size</span>
              <span>Time</span>
            </div>
            <div className="max-h-36 overflow-y-auto">
              {result.ordersPlaced.map((order) => (
                <div
                  key={order.coinId}
                  className="px-3 py-1.5 text-[8px] grid grid-cols-4 gap-2 border-t-2 border-retro-white/10"
                >
                  <span className={order.side === 'buy' ? 'text-retro-green uppercase' : 'text-retro-orange uppercase'}>
                    {order.side}
                  </span>
                  <span className="text-retro-white/70">{formatPrice(order.priceLevel)}</span>
                  <span className="text-retro-white/50">{order.size}</span>
                  <span className="text-retro-white/30">{formatTime(order.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.ordersPlaced.length === 0 && (
          <p className="text-center text-retro-white/30 text-[10px]">No orders placed.</p>
        )}

        {/* Buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => router.push('/lobby')}
            className="flex-1 pixel-btn pixel-btn-green text-xs py-3"
          >
            PLAY AGAIN
          </button>
          <button
            onClick={() => router.push('/')}
            className="flex-1 pixel-btn text-xs py-3"
          >
            MENU
          </button>
        </div>
      </div>
    </div>
  );
}
