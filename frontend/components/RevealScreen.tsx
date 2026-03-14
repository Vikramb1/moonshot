'use client';

import { useRouter } from 'next/navigation';
import type { GameResult } from '@/types';

interface RevealScreenProps {
  result: GameResult;
}

const END_LABELS: Record<GameResult['endReason'], { text: string; color: string }> = {
  time:   { text: "TIME'S UP", color: '#f0f0e0' },
  health: { text: 'HULL DESTROYED', color: '#c03020' },
  profit: { text: 'PROFIT TARGET HIT', color: '#40a030' },
  loss:   { text: 'STOP LOSS HIT', color: '#e0b020' },
};

export default function RevealScreen({ result }: RevealScreenProps) {
  const router = useRouter();
  const isPnLPositive = result.totalPnL >= 0;
  const label = END_LABELS[result.endReason];

  const formatPrice = (p: number) =>
    `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center px-4">
      {/* Starfield */}
      <div className="starfield" />

      <div className="relative z-10 w-full max-w-md flex flex-col gap-5">
        {/* End reason */}
        <div className="text-center">
          <h1
            className="text-sm md:text-base uppercase tracking-wider"
            style={{
              color: label.color,
              textShadow: `0 0 20px ${label.color}80, 0 4px 0 rgba(0,0,0,0.4)`,
              animation: result.endReason === 'health' ? 'shakeOnMount 0.5s ease' : undefined,
            }}
          >
            {label.text}
          </h1>
          <p className="text-[7px] text-retro-white/40 mt-3 uppercase tracking-wider">
            {result.duration}s elapsed
          </p>
        </div>

        {/* Direction badge */}
        <div className="flex justify-center">
          <span
            className="text-[7px] uppercase tracking-widest px-4 py-1"
            style={{
              border: `4px solid ${result.netDirection === 'bullish' ? '#40a030' : result.netDirection === 'bearish' ? '#c03020' : '#808080'}`,
              color: result.netDirection === 'bullish' ? '#40a030' : result.netDirection === 'bearish' ? '#c03020' : '#808080',
              background: 'rgba(13, 31, 45, 0.9)',
            }}
          >
            {result.netDirection}
          </span>
        </div>

        {/* Stats grid */}
        <div className="pixel-panel p-4">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-[6px] text-retro-white/50 uppercase tracking-wider">Orders</div>
              <div className="text-xs text-retro-white mt-1">{result.ordersPlaced.length}</div>
            </div>
            <div>
              <div className="text-[6px] text-retro-white/50 uppercase tracking-wider">Size</div>
              <div className="text-xs text-retro-white mt-1">${result.totalSize.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[6px] text-retro-white/50 uppercase tracking-wider">Zone $</div>
              <div className="text-xs text-retro-green mt-1">
                +${result.totalZoneEarnings.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[6px] text-retro-white/50 uppercase tracking-wider">PnL</div>
              <div className={`text-xs mt-1 ${isPnLPositive ? 'text-retro-green' : 'text-retro-red'}`}>
                {isPnLPositive ? '+' : ''}${result.totalPnL.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Orders list */}
        {result.ordersPlaced.length > 0 && (
          <div className="pixel-panel overflow-hidden">
            <div
              className="grid grid-cols-4 gap-2 px-3 py-2 text-[6px] text-retro-white/50 uppercase tracking-wider"
              style={{ background: 'rgba(8, 21, 32, 0.6)' }}
            >
              <span>Side</span><span>Price</span><span>Size</span><span>Time</span>
            </div>
            <div style={{ maxHeight: 144, overflowY: 'auto' }}>
              {result.ordersPlaced.map((order) => (
                <div
                  key={order.coinId}
                  className="grid grid-cols-4 gap-2 px-3 py-1.5 text-[7px]"
                  style={{ borderTop: '2px solid rgba(248, 248, 240, 0.1)' }}
                >
                  <span className={`uppercase ${order.side === 'buy' ? 'text-retro-green' : 'text-retro-red'}`}>{order.side}</span>
                  <span className="text-retro-white/60">{formatPrice(order.priceLevel)}</span>
                  <span className="text-retro-white/40">${order.size}</span>
                  <span className="text-retro-white/25">{formatTime(order.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.ordersPlaced.length === 0 && (
          <p className="text-center text-retro-white/30 text-[7px] uppercase tracking-wider">No orders placed.</p>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/lobby')}
            className="flex-1 pixel-btn pixel-btn-green text-[8px] py-3"
          >
            PLAY AGAIN
          </button>
          <button
            onClick={() => router.push('/')}
            className="flex-1 pixel-btn text-[8px] py-3"
          >
            MENU
          </button>
        </div>
      </div>

      <style>{`
        @keyframes shakeOnMount {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
}
