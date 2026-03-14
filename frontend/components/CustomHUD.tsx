'use client';

import { useEffect, useRef, useState } from 'react';
import type { CustomGameTheme } from '@/types';

function lerpVal(a: number, b: number, t: number) { return a + (b - a) * t; }

function healthColor(val: number, accent: string): string {
  if (val >= 60) {
    const t = (val - 60) / 40;
    const r = Math.round(lerpVal(255, 32, t));
    const g = Math.round(lerpVal(160, 176, t));
    const b = Math.round(lerpVal(0, 176, t));
    return `rgb(${r},${g},${b})`;
  } else {
    const t = val / 60;
    const r = 255;
    const g = Math.round(lerpVal(50, 160, t));
    const b = Math.round(lerpVal(50, 0, t));
    return `rgb(${r},${g},${b})`;
  }
}

interface TradeLogEntry {
  side: 'long' | 'short';
  price: number;
  size: number;
  timestamp: number;
}

interface CustomHUDProps {
  theme: CustomGameTheme;
  currentPrice: number;
  previousPrice: number;
  priceDirection: 'up' | 'down' | 'neutral';
  timeRemaining: number;
  secondsOnTarget: number;
  totalPlaced: number;
  estimatedPnL: number;
  health: number;
  hitFlash: boolean;
  tradeLog: TradeLogEntry[];
}

export default function CustomHUD({
  theme,
  currentPrice,
  previousPrice,
  priceDirection,
  timeRemaining,
  secondsOnTarget,
  totalPlaced,
  estimatedPnL,
  health,
  hitFlash,
  tradeLog,
}: CustomHUDProps) {
  const [priceScale, setPriceScale] = useState(false);
  const [damageShow, setDamageShow] = useState(false);
  const prevHealth = useRef(health);

  const healthBarRef = useRef<HTMLDivElement>(null);
  const healthPctRef = useRef<HTMLSpanElement>(null);
  const healthDisplayedRef = useRef(100);
  const healthTargetRef = useRef(100);
  const frameCountRef = useRef(0);

  const accent = theme.colors.accent;

  healthTargetRef.current = health;

  useEffect(() => {
    let animId: number;
    const animate = () => {
      const hd = healthDisplayedRef.current;
      const target = healthTargetRef.current;
      healthDisplayedRef.current = hd + (target - hd) * 0.06;
      frameCountRef.current++;

      const val = healthDisplayedRef.current;
      const color = healthColor(val, accent);

      let opacity = 1;
      if (val < 30) {
        opacity = 0.7 + 0.3 * Math.sin(frameCountRef.current * 0.15);
      }

      if (healthBarRef.current) {
        healthBarRef.current.style.width = `${val}%`;
        healthBarRef.current.style.background = color;
        healthBarRef.current.style.opacity = String(opacity);
      }
      if (healthPctRef.current) {
        healthPctRef.current.textContent = `${Math.round(val)}%`;
        healthPctRef.current.style.color = color;
      }

      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, []);

  useEffect(() => {
    setPriceScale(true);
    const t = setTimeout(() => setPriceScale(false), 150);
    return () => clearTimeout(t);
  }, [currentPrice]);

  useEffect(() => {
    if (health < prevHealth.current - 5) {
      setDamageShow(true);
      const t = setTimeout(() => setDamageShow(false), 600);
      prevHealth.current = health;
      return () => clearTimeout(t);
    }
    prevHealth.current = health;
  }, [health]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const pctChange = previousPrice > 0
    ? ((currentPrice - previousPrice) / previousPrice * 100).toFixed(2)
    : '0.00';
  const pctPositive = parseFloat(pctChange) >= 0;
  const isLowTime = timeRemaining <= 10;
  const isPnLPositive = estimatedPnL >= 0;

  const panelStyle: React.CSSProperties = {
    background: 'rgba(0, 0, 0, 0.65)',
    backdropFilter: 'blur(4px)',
    border: `1px solid ${accent}40`,
    borderRadius: 4,
  };

  return (
    <div className="absolute inset-0 pointer-events-none select-none" style={{ zIndex: 10 }}>
      {/* Top left — asset + price */}
      <div style={{ ...panelStyle, position: 'absolute', top: 12, left: 12, padding: '8px 12px' }}>
        <div style={{ fontSize: 7, letterSpacing: 2, color: 'rgba(224,240,255,0.5)', textTransform: 'uppercase' }}>ETH / USD</div>
        <div style={{
          fontSize: 16, fontWeight: 'bold', color: '#e0f0ff',
          transform: priceScale ? 'scale(1.04)' : 'scale(1)',
          transition: 'transform 0.15s ease', marginTop: 2,
        }}>
          ${currentPrice > 0 ? currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '--'}
          <span style={{
            color: priceDirection === 'up' ? accent : priceDirection === 'down' ? '#c03020' : 'rgba(224,240,255,0.4)',
            marginLeft: 6, fontSize: 10,
          }}>
            {priceDirection === 'up' ? '▲' : priceDirection === 'down' ? '▼' : ''}
          </span>
        </div>
        <div style={{ fontSize: 7, color: pctPositive ? accent : '#c03020', marginTop: 1 }}>
          {pctPositive ? '+' : ''}{pctChange}%
        </div>
      </div>

      {/* Top center — health bar */}
      <div style={{
        ...panelStyle, position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        borderColor: hitFlash ? 'rgba(255,50,50,0.7)' : `${accent}40`,
        transition: 'border-color 0.1s ease',
      }}>
        <span style={{ fontSize: 8, letterSpacing: 2, color: `${accent}cc`, fontFamily: "'Space Mono', monospace" }}>
          {theme.labels.healthLabel}
        </span>
        <div style={{
          width: 180, height: 10, background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 99,
          position: 'relative', overflow: 'hidden',
        }}>
          <div ref={healthBarRef} style={{ width: '100%', height: '100%', borderRadius: 99, background: accent }} />
        </div>
        <span ref={healthPctRef} style={{
          fontSize: 9, fontFamily: "'Space Mono', monospace", fontWeight: 'bold',
          color: accent, minWidth: 28,
        }}>100%</span>
      </div>

      {/* Top right — timer */}
      <div style={{ ...panelStyle, position: 'absolute', top: 12, right: 12, padding: '8px 12px', textAlign: 'right' }}>
        <div style={{ fontSize: 7, letterSpacing: 2, color: 'rgba(224,240,255,0.5)', textTransform: 'uppercase' }}>TIME</div>
        <div style={{
          fontSize: 18, fontWeight: 'bold',
          color: isLowTime ? '#c03020' : '#e0f0ff',
          animation: isLowTime ? 'timerShake 0.1s infinite alternate' : undefined, marginTop: 2,
        }}>
          {formatTime(timeRemaining)}
        </div>
      </div>

      {/* Bottom left — stats */}
      <div style={{ ...panelStyle, position: 'absolute', bottom: 12, left: 12, padding: '8px 12px' }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div>
            <div style={{ fontSize: 7, color: 'rgba(224,240,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>On Target</div>
            <div style={{ fontSize: 13, fontWeight: 'bold', color: '#e0f0ff', marginTop: 1 }}>{secondsOnTarget}s</div>
          </div>
          <div>
            <div style={{ fontSize: 7, color: 'rgba(224,240,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Placed</div>
            <div style={{ fontSize: 13, fontWeight: 'bold', color: '#e0f0ff', marginTop: 1 }}>${totalPlaced.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Bottom right — PnL */}
      <div style={{ ...panelStyle, position: 'absolute', bottom: 12, right: 12, padding: '8px 12px', textAlign: 'right' }}>
        <div style={{ fontSize: 7, letterSpacing: 2, color: 'rgba(224,240,255,0.4)', textTransform: 'uppercase' }}>EST. PNL</div>
        <div style={{ fontSize: 16, fontWeight: 'bold', color: isPnLPositive ? accent : '#c03020', marginTop: 1 }}>
          {isPnLPositive ? '+' : ''}${estimatedPnL.toFixed(2)}
        </div>
      </div>

      {/* Bottom center — trade log */}
      {tradeLog.length > 0 && (
        <div style={{
          ...panelStyle,
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 360, width: '40%', maxHeight: 80, overflowY: 'auto',
          padding: '4px 10px',
          fontFamily: "'Space Mono', monospace", fontSize: 9,
          pointerEvents: 'auto',
        }} ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
          {tradeLog.slice(-8).map((t, i) => (
            <div key={i} style={{ color: t.side === 'long' ? accent : '#c03020', lineHeight: '15px' }}>
              {t.side === 'long' ? 'BUY' : 'SELL'} @ ${t.price.toFixed(2)} · ${t.size.toFixed(2)}
            </div>
          ))}
        </div>
      )}

      {/* Damage overlay */}
      {damageShow && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          fontSize: 14, fontWeight: 'bold', color: theme.colors.damageParticle,
          animation: 'hullBreach 0.6s ease-out forwards', pointerEvents: 'none',
          textShadow: `0 0 10px ${theme.colors.damageParticle}`,
          textTransform: 'uppercase', letterSpacing: 2,
        }}>
          {theme.labels.damageText}
        </div>
      )}

      <style>{`
        @keyframes timerShake { from { transform: translateX(-2px); } to { transform: translateX(2px); } }
        @keyframes hullBreach {
          0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.08); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </div>
  );
}
