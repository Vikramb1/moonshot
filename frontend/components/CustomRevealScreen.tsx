'use client';

import { useRouter } from 'next/navigation';
import type { GameResult, CustomGameTheme } from '@/types';

interface CustomRevealScreenProps {
  result: GameResult;
  theme: CustomGameTheme;
}

export default function CustomRevealScreen({ result, theme }: CustomRevealScreenProps) {
  const router = useRouter();
  const isPnLPositive = result.totalPnL >= 0;
  const accent = theme.colors.accent;

  const END_LABELS: Record<GameResult['endReason'], { text: string; color: string }> = {
    time:   { text: "TIME'S UP", color: '#e0f0ff' },
    health: { text: theme.labels.damageText, color: theme.colors.damageParticle },
    profit: { text: 'PROFIT TARGET HIT', color: accent },
    loss:   { text: 'STOP LOSS HIT', color: '#d4c4a0' },
  };

  const label = END_LABELS[result.endReason];

  const formatPrice = (p: number) =>
    `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center px-4">
      <div style={{
        position: 'fixed', inset: 0,
        background: `linear-gradient(180deg, ${theme.colors.bgTop} 0%, ${theme.colors.bg} 100%)`,
      }} />

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
          <p className="text-[7px] mt-3 uppercase tracking-wider" style={{ color: 'rgba(224,240,255,0.4)' }}>
            {result.duration}s elapsed
          </p>
        </div>

        {/* Direction badge */}
        <div className="flex justify-center">
          <span
            className="text-[7px] uppercase tracking-widest px-4 py-1"
            style={{
              border: `4px solid ${result.netDirection === 'bullish' ? accent : result.netDirection === 'bearish' ? '#c03020' : '#808080'}`,
              color: result.netDirection === 'bullish' ? accent : result.netDirection === 'bearish' ? '#c03020' : '#808080',
              background: 'rgba(10, 16, 30, 0.9)',
              borderRadius: 6,
            }}
          >
            {result.netDirection}
          </span>
        </div>

        {/* Stats grid */}
        <div style={{ border: `4px solid ${accent}`, background: 'rgba(10, 16, 30, 0.9)', borderRadius: 6, padding: 16 }}>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-[6px] uppercase tracking-wider" style={{ color: 'rgba(224,240,255,0.5)' }}>Orders</div>
              <div className="text-xs mt-1" style={{ color: '#e0f0ff' }}>{result.ordersPlaced.length}</div>
            </div>
            <div>
              <div className="text-[6px] uppercase tracking-wider" style={{ color: 'rgba(224,240,255,0.5)' }}>Size</div>
              <div className="text-xs mt-1" style={{ color: '#e0f0ff' }}>${result.totalSize.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[6px] uppercase tracking-wider" style={{ color: 'rgba(224,240,255,0.5)' }}>Zone $</div>
              <div className="text-xs mt-1" style={{ color: accent }}>+${result.totalZoneEarnings.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[6px] uppercase tracking-wider" style={{ color: 'rgba(224,240,255,0.5)' }}>PnL</div>
              <div className={`text-xs mt-1`} style={{ color: isPnLPositive ? accent : '#c03020' }}>
                {isPnLPositive ? '+' : ''}${result.totalPnL.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Orders list */}
        {result.ordersPlaced.length > 0 && (
          <div style={{ border: `4px solid ${accent}`, background: 'rgba(10, 16, 30, 0.9)', borderRadius: 6, overflow: 'hidden' }}>
            <div
              className="grid grid-cols-4 gap-2 px-3 py-2 text-[6px] uppercase tracking-wider"
              style={{ color: 'rgba(224,240,255,0.5)', background: 'rgba(8, 16, 28, 0.6)' }}
            >
              <span>Side</span><span>Price</span><span>Size</span><span>Time</span>
            </div>
            <div style={{ maxHeight: 144, overflowY: 'auto' }}>
              {result.ordersPlaced.map((order) => (
                <div
                  key={order.coinId}
                  className="grid grid-cols-4 gap-2 px-3 py-1.5 text-[7px]"
                  style={{ borderTop: `2px solid ${accent}30` }}
                >
                  <span style={{ color: order.side === 'buy' ? accent : '#c03020' }} className="uppercase">{order.side}</span>
                  <span style={{ color: 'rgba(224,240,255,0.6)' }}>{formatPrice(order.priceLevel)}</span>
                  <span style={{ color: 'rgba(224,240,255,0.4)' }}>${order.size}</span>
                  <span style={{ color: 'rgba(224,240,255,0.25)' }}>{formatTime(order.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.ordersPlaced.length === 0 && (
          <p className="text-center text-[7px] uppercase tracking-wider" style={{ color: 'rgba(224,240,255,0.3)' }}>No orders placed.</p>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              const params = new URLSearchParams(window.location.search);
              params.set('id', theme.id);
              router.push(`/custom/create?replay=${theme.id}`);
            }}
            style={{
              flex: 1, padding: '12px 24px', fontWeight: 'bold', textTransform: 'uppercase',
              letterSpacing: '0.05em', fontSize: 11,
              border: `4px solid ${accent}`, background: accent, color: '#000',
              borderRadius: 4, cursor: 'pointer',
            }}
          >
            PLAY AGAIN
          </button>
          <button
            onClick={() => router.push('/')}
            style={{
              flex: 1, padding: '12px 24px', fontWeight: 'bold', textTransform: 'uppercase',
              letterSpacing: '0.05em', fontSize: 11,
              border: `4px solid ${accent}`, background: 'transparent', color: '#e0f0ff',
              borderRadius: 4, cursor: 'pointer',
            }}
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
