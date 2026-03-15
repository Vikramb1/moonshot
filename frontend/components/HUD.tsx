'use client';

import { useEffect, useRef, useState } from 'react';

function lerpVal(a: number, b: number, t: number) { return a + (b - a) * t; }

function healthColor(val: number): [number, number, number] {
  // Smooth interpolation: green(0,255,100) → yellow(255,200,0) → red(255,50,50)
  if (val >= 60) {
    const t = (val - 60) / 40;
    return [
      Math.round(lerpVal(255, 0, t)),
      Math.round(lerpVal(200, 255, t)),
      Math.round(lerpVal(0, 100, t)),
    ];
  } else {
    const t = val / 60;
    return [
      255,
      Math.round(lerpVal(50, 200, t)),
      Math.round(lerpVal(50, 0, t)),
    ];
  }
}

interface HUDProps {
  currentPrice: number;
  previousPrice: number;
  priceDirection: 'up' | 'down' | 'neutral';
  timeRemaining: number;
  secondsOnTarget: number;
  totalPlaced: number;
  estimatedPnL: number;
  health: number;
  hitFlash: boolean;
  symbol?: string;
  tradeLogVisible?: boolean;
}

export default function HUD({
  currentPrice,
  previousPrice,
  priceDirection,
  timeRemaining,
  secondsOnTarget,
  totalPlaced,
  estimatedPnL,
  health,
  hitFlash,
  symbol = 'ETH-PERP',
  tradeLogVisible = false,
}: HUDProps) {
  const [priceScale, setPriceScale] = useState(false);
  const [hullBreach, setHullBreach] = useState(false);
  const prevHealth = useRef(health);

  // Health bar animation refs — direct DOM manipulation for 60fps smoothness
  const healthBarRef = useRef<HTMLDivElement>(null);
  const healthPctRef = useRef<HTMLSpanElement>(null);
  const healthDisplayedRef = useRef(100);
  const healthTargetRef = useRef(100);
  const frameCountRef = useRef(0);

  healthTargetRef.current = health;

  useEffect(() => {
    let animId: number;
    const animate = () => {
      const hd = healthDisplayedRef.current;
      const target = healthTargetRef.current;
      healthDisplayedRef.current = hd + (target - hd) * 0.06;
      frameCountRef.current++;

      const val = healthDisplayedRef.current;
      const [r, g, b] = healthColor(val);
      const color = `rgb(${r},${g},${b})`;

      // Pulse when low
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
      setHullBreach(true);
      const t = setTimeout(() => setHullBreach(false), 600);
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
    border: '4px solid #f8f8f0',
    background: 'rgba(13, 31, 45, 0.9)',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
  };

  return (
    <div className="absolute inset-0 pointer-events-none select-none" style={{ zIndex: 10 }}>
      {/* Top left — PnL (large) + asset price */}
      <div style={{
        ...panelStyle,
        position: 'absolute', top: 16, left: 16,
        padding: '12px 18px',
      }}>
        <div style={{ fontSize: 8, letterSpacing: 2, color: 'rgba(240,240,224,0.6)', textTransform: 'uppercase' }}>EST. PNL</div>
        <div style={{
          fontSize: 32, fontWeight: 'bold',
          color: isPnLPositive ? '#40a030' : '#c03020',
          marginTop: 2, lineHeight: 1.1,
        }}>
          {isPnLPositive ? '+' : ''}${estimatedPnL.toFixed(2)}
        </div>
        <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>
          <div style={{ fontSize: 7, letterSpacing: 2, color: 'rgba(240,240,224,0.6)', textTransform: 'uppercase' }}>
            {symbol.replace('-PERP', '')} / USD
          </div>
          <div style={{
            fontSize: 14, fontWeight: 'bold', color: '#f0f0e0',
            transform: priceScale ? 'scale(1.04)' : 'scale(1)',
            transition: 'transform 0.15s ease',
            marginTop: 2,
          }}>
            ${currentPrice > 0 ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '--'}
            <span style={{
              color: priceDirection === 'up' ? '#40a030' : priceDirection === 'down' ? '#c03020' : 'rgba(240,240,224,0.4)',
              marginLeft: 6, fontSize: 10,
            }}>
              {priceDirection === 'up' ? '▲' : priceDirection === 'down' ? '▼' : ''}
            </span>
          </div>
          <div style={{ fontSize: 7, color: pctPositive ? '#40a030' : '#c03020', marginTop: 2 }}>
            {pctPositive ? '+' : ''}{pctChange}%
          </div>
        </div>
      </div>

      {/* Top center — health bar */}
      <div style={{
        ...panelStyle,
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px',
        borderColor: hitFlash ? 'rgba(255,50,50,0.8)' : '#f8f8f0',
        transition: 'border-color 0.1s ease',
      }}>
        <span style={{
          fontSize: 9, letterSpacing: 3,
          color: 'rgba(0, 220, 255, 0.65)',
          fontFamily: "'Space Mono', monospace",
        }}>HULL</span>
        <div style={{
          width: 200, height: 14,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 99,
          position: 'relative', overflow: 'hidden',
        }}>
          <div
            ref={healthBarRef}
            style={{
              width: '100%', height: '100%',
              borderRadius: 99,
              background: 'rgb(0, 255, 100)',
            }}
          />
        </div>
        <span
          ref={healthPctRef}
          style={{
            fontSize: 10,
            fontFamily: "'Space Mono', monospace",
            fontWeight: 'bold',
            color: 'rgb(0, 255, 100)',
            minWidth: 32,
          }}
        >100%</span>
      </div>

      {/* Top right — timer */}
      <div style={{
        ...panelStyle,
        position: 'absolute', top: 16, right: 84,
        padding: '10px 14px', textAlign: 'right',
      }}>
        <div style={{ fontSize: 7, letterSpacing: 2, color: 'rgba(240,240,224,0.6)', textTransform: 'uppercase' }}>TIME</div>
        <div style={{
          fontSize: 16, fontWeight: 'bold',
          color: isLowTime ? '#c03020' : '#f0f0e0',
          animation: isLowTime ? 'timerShake 0.1s infinite alternate' : undefined,
          marginTop: 4,
        }}>
          {formatTime(timeRemaining)}
        </div>
      </div>

      {/* Bottom left — trade stats */}
      <div style={{
        ...panelStyle,
        position: 'absolute', bottom: tradeLogVisible ? 90 : 20, left: 16,
        padding: '8px 14px',
        transition: 'bottom 0.3s ease',
      }}>
        <div style={{ fontSize: 8, color: 'rgba(240,240,224,0.7)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
          <span style={{ color: '#e06030' }}>●</span>{' '}
          {secondsOnTarget}s on target
        </div>
        <div style={{ fontSize: 8, color: 'rgba(240,240,224,0.7)', textTransform: 'uppercase', letterSpacing: 1 }}>
          <span style={{ color: '#e06030' }}>●</span>{' '}
          ${totalPlaced.toFixed(2)} placed
        </div>
      </div>



      {/* Hull breach overlay */}
      {hullBreach && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          fontSize: 12, fontWeight: 'bold', color: '#c03020',
          animation: 'hullBreach 0.6s ease-out forwards',
          pointerEvents: 'none',
          textShadow: '0 0 10px rgba(192, 48, 32, 0.6)',
          textTransform: 'uppercase',
          letterSpacing: 2,
        }}>
          HULL BREACH
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
