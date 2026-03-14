'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameEngine } from '@/lib/useGameEngine';
import HUD from './HUD';
import type { GameParams, GameResult, Order } from '@/types';

interface TradeLogEntry {
  side: 'long' | 'short';
  price: number;
  size: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SCROLL_SPEED = 2.0;
const INITIAL_SPEED = 2.2;
const MAX_SPEED = 6.5;
const ACCELERATION_RAMP = 0.06;
const SAFE_ZONE_HALF = 32;
const ASTEROID_BASE_INTERVAL = 28;
const GAME_AREA_PCT = 0.75;
const PRICE_AXIS_W = 68;
// Chart range — per-asset so tick-level moves are visible
// Lower price assets need tighter pct to amplify small absolute moves
const VISIBLE_RANGE_MAP: Record<string, number> = {
  'BTC-PERP': 0.0003,   // ±$25 at ~$84k
  'ETH-PERP': 0.0005,   // ±$1 at ~$2k
  'SOL-PERP': 0.001,    // ±$0.13 at ~$130
  'DOGE-PERP': 0.0003,  // ±$0.00003 at ~$0.095
};
const DEFAULT_VISIBLE_RANGE_PCT = 0.0005;
const CHART_HEIGHT_FRACTION = 0.6;

// Colors
const COL_BG = '#0d0816';
const COL_LINE = 'rgba(220, 220, 240, 1)';
const COL_LINE_GLOW = 'rgba(180, 140, 220, 0.5)';
const COL_CYAN = 'rgba(0, 220, 255, 1)';
const COL_SAFE = 'rgba(0, 255, 150, 1)';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------
interface Star { x: number; y: number; r: number; baseA: number; twinkle: boolean; phase: number; period: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; radius: number; color: string }
interface FloatingText { text: string; x: number; y: number; opacity: number; vy: number; life: number; color: string; size: number }
interface Asteroid {
  x: number; y: number; vx: number; vy: number;
  rotation: number; rotSpeed: number; radius: number;
  vertices: { x: number; y: number }[];
  detailOffsets: { ox: number; oy: number }[];
  glowIntensity: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mapPrice(price: number, min: number, max: number, canvasH: number): number {
  const chartTopY = canvasH * 0.5 - canvasH * CHART_HEIGHT_FRACTION * 0.5;
  const chartBottomY = canvasH * 0.5 + canvasH * CHART_HEIGHT_FRACTION * 0.5;
  const t = (price - min) / (max - min);
  return chartBottomY - t * (chartBottomY - chartTopY);
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function generateAsteroidVertices(radius: number): { x: number; y: number }[] {
  const n = 6 + Math.floor(Math.random() * 3);
  const verts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const r = radius * (0.7 + Math.random() * 0.6);
    verts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return verts;
}

// ---------------------------------------------------------------------------
// Ship drawing
// ---------------------------------------------------------------------------
function drawShip(ctx: CanvasRenderingContext2D, frame: number) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 5, 0, 0, Math.PI * 2);
  const fuselageGrad = ctx.createLinearGradient(0, -5, 0, 5);
  fuselageGrad.addColorStop(0, 'rgba(40, 60, 90, 1)');
  fuselageGrad.addColorStop(1, 'rgba(15, 25, 45, 1)');
  ctx.fillStyle = fuselageGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(80, 160, 220, 0.6)';
  ctx.lineWidth = 0.75;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(0, -5); ctx.lineTo(-14, -22); ctx.lineTo(-20, -8);
  ctx.closePath();
  ctx.fillStyle = 'rgba(20, 45, 80, 1)'; ctx.fill();
  ctx.strokeStyle = 'rgba(60, 130, 200, 0.5)'; ctx.lineWidth = 0.75; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(-14, -22);
  ctx.strokeStyle = 'rgba(0, 180, 255, 0.6)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, 5); ctx.lineTo(-14, 22); ctx.lineTo(-20, 8);
  ctx.closePath();
  ctx.fillStyle = 'rgba(20, 45, 80, 1)'; ctx.fill();
  ctx.strokeStyle = 'rgba(60, 130, 200, 0.5)'; ctx.lineWidth = 0.75; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(-14, 22);
  ctx.strokeStyle = 'rgba(0, 180, 255, 0.6)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.fillStyle = 'rgba(10, 20, 40, 1)';
  ctx.strokeStyle = 'rgba(0, 180, 255, 0.4)'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.roundRect(-23, -12.5, 10, 5, 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-23, 7.5, 10, 5, 2); ctx.fill(); ctx.stroke();

  const glowR1 = 3 + Math.sin(frame * 0.18) * 0.8;
  const glowR2 = 3 + Math.sin(frame * 0.18 + 1.5) * 0.8;
  const g1 = ctx.createRadialGradient(-25, -10, 0, -25, -10, glowR1);
  g1.addColorStop(0, 'rgba(0, 220, 255, 0.9)'); g1.addColorStop(1, 'rgba(0, 220, 255, 0)');
  ctx.fillStyle = g1; ctx.fillRect(-25 - glowR1, -10 - glowR1, glowR1 * 2, glowR1 * 2);
  const g2 = ctx.createRadialGradient(-25, 10, 0, -25, 10, glowR2);
  g2.addColorStop(0, 'rgba(0, 220, 255, 0.9)'); g2.addColorStop(1, 'rgba(0, 220, 255, 0)');
  ctx.fillStyle = g2; ctx.fillRect(-25 - glowR2, 10 - glowR2, glowR2 * 2, glowR2 * 2);

  ctx.strokeStyle = 'rgba(0, 180, 255, 0.15)'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(-16, -2); ctx.lineTo(16, -2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-16, 2); ctx.lineTo(16, 2); ctx.stroke();

  ctx.beginPath(); ctx.ellipse(8, 0, 6, 3.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 220, 255, 0.25)'; ctx.fill();
  ctx.strokeStyle = 'rgba(0, 220, 255, 0.7)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(9, -1, 3, 1.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; ctx.fill();

  ctx.beginPath();
  ctx.moveTo(22, -4); ctx.quadraticCurveTo(36, -1, 42, 0);
  ctx.quadraticCurveTo(36, 1, 22, 4); ctx.closePath();
  ctx.fillStyle = 'rgba(0, 200, 240, 0.9)'; ctx.fill();
  ctx.strokeStyle = 'rgba(0, 220, 255, 1)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.arc(42, 0, 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.fill();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface PriceData {
  currentPrice: number;
  previousPrice: number;
  priceDirection: 'up' | 'down' | 'neutral';
  isConnected: boolean;
}

interface GameProps {
  params: GameParams;
  priceData: PriceData;
  onGameEnd: (result: GameResult) => void;
}

export default function Game({ params, priceData, onGameEnd }: GameProps) {
  const { currentPrice, previousPrice, priceDirection, isConnected } = priceData;
  const engine = useGameEngine(params);
  const [tradeLog, setTradeLog] = useState<TradeLogEntry[]>([]);
  const [livePrice, setLivePrice] = useState(0);
  const VISIBLE_RANGE_PCT = VISIBLE_RANGE_MAP[params.symbol] ?? DEFAULT_VISIBLE_RANGE_PCT;

  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const frameRef = useRef(0);

  const [hitFlash, setHitFlash] = useState(false);
  const hitFlashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [secondsOnTarget, setSecondsOnTarget] = useState(0);

  // Mutable game state
  const stateRef = useRef({
    shipY: 0,
    shipVelY: 0,
    shipTiltAngle: 0,
    shipShake: 0,
    bobPhase: 0,
    wHeldFrames: 0,
    sHeldFrames: 0,
    keys: {} as Record<string, boolean>,
    stars: [] as Star[],
    gridOffsetX: 0,
    scanX: 0,
    priceHistoryPx: [] as number[],
    interpPrice: 0,
    interpTarget: 0,
    interpPrev: 0,
    interpFrame: 0,
    displayPrice: 0,
    // Dynamic price range
    animMin: 0,
    animMax: 0,
    targetMin: 0,
    targetMax: 0,
    rescaleStartMin: 0,
    rescaleStartMax: 0,
    rescaleFrame: 20,
    // Game objects
    asteroids: [] as Asteroid[],
    asteroidTimer: 0,
    particles: [] as Particle[],
    floatingTexts: [] as FloatingText[],
    shieldAlpha: 0,
    wasInSafe: false,
    totalZoneFrames: 0,
    flashRed: 0,
    flashWhite: { x: 0, y: 0, life: 0 },
    mounted: false,
    lastWsPrice: 0,
  });

  useEffect(() => { engine.startGame(); }, []);

  useEffect(() => {
    if (engine.gameStatus === 'ended' && engine.gameResult) {
      onGameEnd(engine.gameResult);
    }
  }, [engine.gameStatus, engine.gameResult, onGameEnd]);

  useEffect(() => {
    const s = stateRef.current;
    const down = (e: KeyboardEvent) => {
      s.keys[e.key] = true; s.keys[e.code] = true;
      if (e.key === 'Escape') engine.endGame('time');
    };
    const up = (e: KeyboardEvent) => { s.keys[e.key] = false; s.keys[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  useEffect(() => {
    const s = stateRef.current;
    if (currentPrice === 0 || currentPrice === s.lastWsPrice) return;
    s.interpPrev = s.lastWsPrice || currentPrice;
    s.interpTarget = currentPrice;
    s.interpFrame = 0;
    s.lastWsPrice = currentPrice;
  }, [currentPrice]);

  // ---- Tilt-based trading every 1s ----
  useEffect(() => {
    if (engine.gameStatus !== 'playing') return;
    const interval = setInterval(() => {
      const tilt = stateRef.current.shipTiltAngle;
      if (Math.abs(tilt) < 0.01) return; // dead zone
      const side: 'long' | 'short' = tilt < 0 ? 'long' : 'short';
      const price = stateRef.current.interpPrice;
      const size = params.positionSize;

      const recordTrade = (orderId: string) => {
        const order: Order = {
          coinId: `tilt-${Date.now()}`,
          priceLevel: price,
          size,
          side: side === 'long' ? 'buy' : 'sell',
          timestamp: Date.now(),
          liquidOrderId: orderId,
        };
        engine.addOrder(order);
        setTradeLog((prev) => {
          const next = [...prev, { side, price, size, timestamp: Date.now() }];
          return next.length > 50 ? next.slice(-50) : next;
        });
      };

      if (params.useLive) {
        // Real API call to Liquid
        fetch('http://localhost:8000/api/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: params.symbol, size, side, leverage: 25 }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.success) {
              recordTrade(data.order_id);
            } else {
              console.warn('[LIVE TRADE FAILED]', data.error);
              // Fall back to paper trade so game still works
              recordTrade('paper-' + Date.now());
            }
          })
          .catch((err) => {
            console.warn('[LIVE TRADE ERROR]', err);
            recordTrade('paper-' + Date.now());
          });
      } else {
        // Paper trade — no network call
        recordTrade('paper-' + Date.now());
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [engine.gameStatus, params.positionSize, params.symbol, params.useLive]);

  useEffect(() => {
    const resize = () => {
      [bgCanvasRef, gameCanvasRef].forEach(ref => {
        if (ref.current) { ref.current.width = window.innerWidth; ref.current.height = window.innerHeight; }
      });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // =========================================================================
  // MAIN GAME LOOP — waits for real WS price before starting
  // =========================================================================
  useEffect(() => {
    if (engine.gameStatus !== 'playing' || !isConnected || currentPrice === 0) return;

    const s = stateRef.current;
    const bgC = bgCanvasRef.current;
    const gC = gameCanvasRef.current;
    if (!bgC || !gC) return;
    const bgCtx = bgC.getContext('2d')!;
    const ctx = gC.getContext('2d')!;

    if (!s.mounted) {
      s.mounted = true;
      s.shipY = gC.height / 2;
      const initPrice = currentPrice;
      s.interpPrice = initPrice;
      s.interpPrev = initPrice;
      s.interpTarget = initPrice;
      s.displayPrice = initPrice;
      const halfRange = initPrice * VISIBLE_RANGE_PCT;
      s.animMin = initPrice - halfRange;
      s.animMax = initPrice + halfRange;
      s.targetMin = s.animMin;
      s.targetMax = s.animMax;
      s.rescaleStartMin = s.animMin;
      s.rescaleStartMax = s.animMax;
      s.rescaleFrame = 20;
      for (let i = 0; i < 220; i++) {
        s.stars.push({
          x: Math.random() * gC.width, y: Math.random() * gC.height,
          r: 0.4 + Math.random() * 1.2, baseA: 0.25 + Math.random() * 0.6,
          twinkle: Math.random() < 0.3, phase: Math.random() * Math.PI * 2,
          period: 2 + Math.random() * 3,
        });
      }
    }

    function tick() {
      if (engine.endedRef.current) return;

      const W = gC!.width;
      const H = gC!.height;
      const gameW = W * GAME_AREA_PCT;
      const shipX = gameW * 0.72;
      const frame = frameRef.current++;

      // --- Interpolate real/mock price ---
      s.interpFrame++;
      const interpT = Math.min(s.interpFrame / 4, 1);
      s.interpPrice = lerp(s.interpPrev, s.interpTarget, interpT);

      // Display price — always real WS data (game won't start without connection)
      const displayPrice = s.interpPrice;
      s.displayPrice = displayPrice;
      if (frame % 3 === 0) setLivePrice(displayPrice);

      // --- Dynamic rescaling (±0.01% range, 10% edge trigger, 45-frame anim) ---
      const visRange = s.animMax - s.animMin;
      if (displayPrice < s.animMin + visRange * 0.20 ||
          displayPrice > s.animMax - visRange * 0.20) {
        const newHalf = displayPrice * VISIBLE_RANGE_PCT;
        s.rescaleStartMin = s.animMin;
        s.rescaleStartMax = s.animMax;
        s.targetMin = displayPrice - newHalf;
        s.targetMax = displayPrice + newHalf;
        s.rescaleFrame = 0;
      }
      if (s.rescaleFrame < 20) {
        s.rescaleFrame++;
        const rt = s.rescaleFrame / 20;
        s.animMin = lerp(s.rescaleStartMin, s.targetMin, rt);
        s.animMax = lerp(s.rescaleStartMax, s.targetMax, rt);
      }

      // --- Price Y (chart maps to middle 35% of screen) ---
      const priceY = mapPrice(displayPrice, s.animMin, s.animMax, H);

      // Push to history; cap at shipX pixels
      s.priceHistoryPx.push(priceY);
      const maxHistLen = Math.floor(shipX) + 1;
      if (s.priceHistoryPx.length > maxHistLen) {
        s.priceHistoryPx.shift();
      }

      // --- Ship physics — two-phase acceleration ---
      const wHeld = s.keys['w'] || s.keys['W'] || s.keys['ArrowUp'];
      const sHeld = s.keys['s'] || s.keys['S'] || s.keys['ArrowDown'];

      if (wHeld && !sHeld) {
        if (s.wHeldFrames === 0) {
          s.shipVelY = -INITIAL_SPEED;
        } else {
          s.shipVelY = lerp(s.shipVelY, -MAX_SPEED, ACCELERATION_RAMP);
        }
        s.wHeldFrames++;
        s.sHeldFrames = 0;
      } else if (sHeld && !wHeld) {
        if (s.sHeldFrames === 0) {
          s.shipVelY = INITIAL_SPEED;
        } else {
          s.shipVelY = lerp(s.shipVelY, MAX_SPEED, ACCELERATION_RAMP);
        }
        s.sHeldFrames++;
        s.wHeldFrames = 0;
      } else {
        // Neither or both — decelerate smoothly
        s.shipVelY = lerp(s.shipVelY, 0, 0.22);
        s.wHeldFrames = 0;
        s.sHeldFrames = 0;
      }

      s.shipVelY = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, s.shipVelY));
      s.shipY += s.shipVelY;
      if (s.shipY < 60) { s.shipY = 60; s.shipVelY = 0; s.wHeldFrames = 0; s.sHeldFrames = 0; }
      if (s.shipY > H - 60) { s.shipY = H - 60; s.shipVelY = 0; s.wHeldFrames = 0; s.sHeldFrames = 0; }

      // Tilt
      const targetTilt = Math.max(-0.55, Math.min(0.55, s.shipVelY * 0.18));
      s.shipTiltAngle = lerp(s.shipTiltAngle, targetTilt, 0.12);

      // Bob + shake (visual only)
      s.bobPhase += 0.04;
      const bobY = Math.sin(s.bobPhase) * 2.5;
      const shakeOff = s.shipShake > 0 ? (Math.random() - 0.5) * 6 * (s.shipShake / 12) : 0;
      const drawShipY = s.shipY + bobY + shakeOff;
      if (s.shipShake > 0) s.shipShake--;

      // --- Safe zone ---
      const safeY = priceY;
      const inSafe = Math.abs(s.shipY - safeY) <= SAFE_ZONE_HALF;

      if (inSafe) {
        s.totalZoneFrames++;
        if (s.totalZoneFrames % 60 === 0) {
          setSecondsOnTarget(Math.floor(s.totalZoneFrames / 60));
        }
      } else {
        engine.adjustHealth(-0.04);
      }

      s.shieldAlpha = inSafe
        ? Math.min(1, s.shieldAlpha + 1 / 20)
        : Math.max(0, s.shieldAlpha - 1 / 20);

      if (inSafe && !s.wasInSafe) {
        s.floatingTexts.push({
          text: 'ON TARGET', x: shipX - 60, y: drawShipY - 25,
          opacity: 1, vy: -0.5, life: 25, color: COL_SAFE, size: 10,
        });
      }
      s.wasInSafe = inSafe;

      // --- Asteroids ---
      const elapsed = params.duration - engine.timeRemainingRef.current;
      const astInterval = elapsed > 40 ? 14 : elapsed > 20 ? 20 : ASTEROID_BASE_INTERVAL;
      s.asteroidTimer++;
      if (s.asteroidTimer >= astInterval) {
        s.asteroidTimer = 0;
        let ay: number;
        do { ay = 60 + Math.random() * (H - 120); } while (Math.abs(ay - safeY) < 80);
        const radius = 13 + Math.random() * 11;
        s.asteroids.push({
          x: gameW + 20, y: ay,
          vx: -(3 + Math.random() * 4), vy: (Math.random() - 0.5) * 1.2,
          rotation: 0, rotSpeed: (Math.random() - 0.5) * 0.08,
          radius, vertices: generateAsteroidVertices(radius),
          detailOffsets: Array.from({ length: 2 }, () => ({
            ox: (Math.random() - 0.5) * radius * 0.4,
            oy: (Math.random() - 0.5) * radius * 0.4,
          })),
          glowIntensity: 0,
        });
      }

      for (let i = s.asteroids.length - 1; i >= 0; i--) {
        const a = s.asteroids[i];
        a.x += a.vx; a.y += a.vy; a.rotation += a.rotSpeed;
        if (a.y < a.radius + 10 || a.y > H - a.radius - 10) a.vy *= -1;
        a.y = Math.max(a.radius + 10, Math.min(H - a.radius - 10, a.y));
        if (a.x < -50) { s.asteroids.splice(i, 1); continue; }
        if (Math.abs(a.y - safeY) < 80) { s.asteroids.splice(i, 1); continue; }

        const dxa = shipX - a.x; const dya = s.shipY - a.y;
        const distA = Math.sqrt(dxa * dxa + dya * dya);
        a.glowIntensity = distA < 200
          ? lerp(a.glowIntensity, (200 - distA) / 200, 0.08)
          : lerp(a.glowIntensity, 0, 0.08);

        if (distA < a.radius + 8) {
          s.asteroids.splice(i, 1);
          engine.takeDamage(15);
          s.flashRed = 24; s.shipShake = 12;
          s.flashWhite = { x: shipX, y: s.shipY, life: 10 };
          setHitFlash(true);
          if (hitFlashTimeout.current) clearTimeout(hitFlashTimeout.current);
          hitFlashTimeout.current = setTimeout(() => setHitFlash(false), 400);
          for (let p = 0; p < 12; p++) {
            const angle = (p / 12) * Math.PI * 2;
            const speed = 4 + Math.random() * 4;
            s.particles.push({ x: shipX, y: s.shipY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 14, maxLife: 14, radius: 4, color: 'rgba(255,200,200,1)' });
          }
        }
      }

      // --- Engine trail ---
      const tCos = Math.cos(s.shipTiltAngle);
      const tSin = Math.sin(s.shipTiltAngle);
      const nacelles = [{ lx: -25, ly: -10 }, { lx: -25, ly: 10 }];
      for (const nac of nacelles) {
        const wx = shipX + nac.lx * tCos - nac.ly * tSin;
        const wy = drawShipY + nac.lx * tSin + nac.ly * tCos;
        for (let p = 0; p < 5; p++) {
          s.particles.push({
            x: wx + (Math.random() - 0.5) * 4,
            y: wy + (Math.random() - 0.5) * 4,
            vx: -(2 + Math.random() * 2) * tCos,
            vy: -(2 + Math.random() * 2) * tSin + (Math.random() - 0.5) * 0.5,
            life: 28, maxLife: 28, radius: 3.5, color: COL_CYAN,
          });
        }
      }

      // Update particles
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i]; p.x += p.vx; p.y += p.vy; p.life--;
        if (p.life <= 0) s.particles.splice(i, 1);
      }

      // Update floating texts
      for (let i = s.floatingTexts.length - 1; i >= 0; i--) {
        const ft = s.floatingTexts[i]; ft.y += ft.vy; ft.life--; ft.opacity = ft.life / 35;
        if (ft.life <= 0) s.floatingTexts.splice(i, 1);
      }

      if (s.flashRed > 0) s.flashRed--;
      if (s.flashWhite.life > 0) s.flashWhite.life--;

      // --- PnL with 25x leverage ---
      // PnL per order = (priceDelta / entryPrice) * positionSize * leverage * direction
      const pnl = engine.ordersRef.current.reduce((sum: number, order: Order) => {
        const pctMove = (displayPrice - order.priceLevel) / order.priceLevel;
        const direction = order.side === 'buy' ? 1 : -1;
        return sum + pctMove * order.size * 25 * direction;
      }, 0);
      engine.checkGameEndConditions(pnl);
      if (engine.endedRef.current) return;

      // =====================================================================
      // DRAW — BACKGROUND
      // =====================================================================
      bgCtx.fillStyle = COL_BG;
      bgCtx.fillRect(0, 0, W, H);

      // --- Grid — covers full canvas, drawn before stars ---
      const axisInc = displayPrice * VISIBLE_RANGE_PCT * 0.25;
      const priceAxisYs: number[] = [];
      if (axisInc > 0) {
        const start = Math.ceil(s.animMin / axisInc) * axisInc;
        for (let p = start; p <= s.animMax; p += axisInc) {
          priceAxisYs.push(mapPrice(p, s.animMin, s.animMax, H));
        }
      }

      bgCtx.lineWidth = 1;

      for (let gy = 0; gy <= H; gy += 72) {
        let isPriceLevel = false;
        for (const py of priceAxisYs) {
          if (Math.abs(gy - py) < 4) { isPriceLevel = true; break; }
        }
        bgCtx.strokeStyle = isPriceLevel ? 'rgba(255,255,255,0.048)' : 'rgba(255,255,255,0.022)';
        bgCtx.beginPath(); bgCtx.moveTo(0, gy); bgCtx.lineTo(W, gy); bgCtx.stroke();
      }

      s.gridOffsetX = (s.gridOffsetX + 0.4) % 72;
      bgCtx.strokeStyle = 'rgba(255,255,255,0.022)';
      for (let gx = -s.gridOffsetX; gx <= W; gx += 72) {
        bgCtx.beginPath(); bgCtx.moveTo(gx, 0); bgCtx.lineTo(gx, H); bgCtx.stroke();
      }

      // Stars
      for (const star of s.stars) {
        let alpha = star.baseA;
        if (star.twinkle) alpha *= 0.5 + 0.5 * Math.sin(frame / 60 * Math.PI * 2 / star.period + star.phase);
        bgCtx.beginPath(); bgCtx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        bgCtx.fillStyle = `rgba(255,255,255,${alpha})`; bgCtx.fill();
      }

      bgCtx.fillStyle = 'rgba(0,0,0,0.06)';
      for (let sy = 0; sy < H; sy += 3) bgCtx.fillRect(0, sy, W, 1);

      s.scanX = (frame % 300) / 300 * W;
      const grad = bgCtx.createLinearGradient(s.scanX - 30, 0, s.scanX + 30, 0);
      grad.addColorStop(0, 'rgba(180,80,160,0)');
      grad.addColorStop(0.5, 'rgba(180,80,160,0.04)');
      grad.addColorStop(1, 'rgba(180,80,160,0)');
      bgCtx.fillStyle = grad; bgCtx.fillRect(s.scanX - 30, 0, 60, H);

      // =====================================================================
      // DRAW — GAME CANVAS
      // =====================================================================
      ctx.clearRect(0, 0, W, H);

      // --- Price line ---
      const hist = s.priceHistoryPx;
      if (hist.length >= 2) {
        const xOff = shipX - hist.length + 1;
        const buildPath = () => {
          ctx.beginPath();
          ctx.moveTo(xOff, hist[0]);
          for (let i = 1; i < hist.length; i++) ctx.lineTo(xOff + i, hist[i]);
        };

        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';

        ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(160, 120, 200, 0.1)';
        buildPath(); ctx.stroke();

        ctx.lineWidth = 7; ctx.strokeStyle = COL_LINE_GLOW;
        ctx.globalAlpha = 0.35;
        buildPath(); ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.lineWidth = 3; ctx.strokeStyle = COL_LINE;
        ctx.shadowBlur = 12; ctx.shadowColor = 'rgba(200, 180, 255, 0.7)';
        buildPath(); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();

        const fillDepth = (H - 160) * 0.04;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(xOff, hist[0]);
        for (let i = 1; i < hist.length; i++) ctx.lineTo(xOff + i, hist[i]);
        for (let i = hist.length - 1; i >= 0; i--) ctx.lineTo(xOff + i, hist[i] + fillDepth);
        ctx.closePath();
        const fillGrad = ctx.createLinearGradient(0, priceY, 0, priceY + fillDepth);
        fillGrad.addColorStop(0, 'rgba(160, 100, 200, 0.18)');
        fillGrad.addColorStop(1, 'rgba(160, 100, 200, 0)');
        ctx.fillStyle = fillGrad; ctx.fill();
        ctx.restore();
      }

      // --- Darkness wall ---
      ctx.fillStyle = COL_BG;
      ctx.fillRect(shipX, 0, gameW - shipX, H);
      const darkGrad = ctx.createLinearGradient(shipX - 24, 0, shipX, 0);
      darkGrad.addColorStop(0, 'rgba(13, 8, 22, 0)');
      darkGrad.addColorStop(1, 'rgba(13, 8, 22, 1)');
      ctx.fillStyle = darkGrad; ctx.fillRect(shipX - 24, 0, 24, H);

      ctx.fillStyle = 'rgba(8, 8, 20, 0.6)';
      ctx.fillRect(gameW, 0, W - gameW - PRICE_AXIS_W, H);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(gameW, 0); ctx.lineTo(gameW, H); ctx.stroke();

      // --- Current price dashed line ---
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(200, 180, 240, 0.2)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, priceY); ctx.lineTo(W - PRICE_AXIS_W, priceY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // --- Safe zone ---
      const safeTop = safeY - SAFE_ZONE_HALF;
      const safeBot = safeY + SAFE_ZONE_HALF;
      ctx.save();
      const sineOsc = Math.sin(frame / 60 * Math.PI * 2 / 3) * 0.02;
      ctx.globalAlpha = 1 + sineOsc;
      ctx.fillStyle = inSafe ? 'rgba(0, 255, 150, 0.07)' : 'rgba(0, 255, 150, 0.04)';
      ctx.fillRect(0, safeTop, gameW, safeBot - safeTop);
      ctx.restore();

      const dashOff = (frame * 1.2) % 24;
      ctx.save();
      ctx.setLineDash([14, 10]); ctx.lineDashOffset = -dashOff;
      ctx.strokeStyle = 'rgba(0, 255, 150, 0.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, safeTop); ctx.lineTo(gameW, safeTop); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, safeBot); ctx.lineTo(gameW, safeBot); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      const bPulse = 0.5 + 0.5 * Math.sin(frame / 60 * Math.PI * 2 / 1.5);
      ctx.save();
      ctx.strokeStyle = `rgba(0, 255, 150, ${0.5 + bPulse * 0.5})`;
      ctx.lineWidth = 1.5;
      if (inSafe) { ctx.shadowBlur = 4; ctx.shadowColor = COL_SAFE; }
      ctx.beginPath(); ctx.moveTo(shipX - 8, safeTop); ctx.lineTo(shipX, safeTop); ctx.lineTo(shipX, safeTop + 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(shipX + 8, safeTop); ctx.lineTo(shipX, safeTop); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(shipX - 8, safeBot); ctx.lineTo(shipX, safeBot); ctx.lineTo(shipX, safeBot - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(shipX + 8, safeBot); ctx.lineTo(shipX, safeBot); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // --- Asteroids ---
      for (const a of s.asteroids) {
        ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rotation);
        if (a.glowIntensity > 0.01) {
          ctx.beginPath();
          ctx.moveTo(a.vertices[0].x * 1.5, a.vertices[0].y * 1.5);
          for (let v = 1; v < a.vertices.length; v++) ctx.lineTo(a.vertices[v].x * 1.5, a.vertices[v].y * 1.5);
          ctx.closePath();
          ctx.fillStyle = `rgba(200, 80, 60, ${a.glowIntensity * 0.25})`; ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(a.vertices[0].x, a.vertices[0].y);
        for (let v = 1; v < a.vertices.length; v++) ctx.lineTo(a.vertices[v].x, a.vertices[v].y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(55, 55, 68, 1)'; ctx.fill();
        ctx.fillStyle = 'rgba(200, 80, 60, 0.12)'; ctx.fill();
        ctx.strokeStyle = 'rgba(130, 130, 148, 0.85)'; ctx.lineWidth = 1; ctx.stroke();
        for (const d of a.detailOffsets) {
          ctx.beginPath();
          for (let v = 0; v < a.vertices.length; v++) {
            const px = a.vertices[v].x * 0.35 + d.ox; const py = a.vertices[v].y * 0.35 + d.oy;
            if (v === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.fillStyle = 'rgba(40, 40, 52, 1)'; ctx.fill();
        }
        ctx.restore();
      }

      // Off-screen arrows
      for (const a of s.asteroids) {
        const dx = Math.abs(a.x - shipX);
        if (dx < 220 && (a.y < 10 || a.y > H - 10)) {
          const arrowY = a.y < 10 ? 15 : H - 15;
          const pointing = a.y < 10 ? -1 : 1;
          const pulse = 0.35 + 0.5 * Math.abs(Math.sin(frame / 60 * Math.PI * 2 / 0.6));
          ctx.save(); ctx.fillStyle = `rgba(180, 100, 80, ${pulse})`;
          ctx.beginPath();
          ctx.moveTo(shipX, arrowY + pointing * 12);
          ctx.lineTo(shipX - 4.5, arrowY); ctx.lineTo(shipX + 4.5, arrowY);
          ctx.closePath(); ctx.fill(); ctx.restore();
        }
      }

      // --- Ship ---
      ctx.save(); ctx.translate(shipX, drawShipY); ctx.rotate(s.shipTiltAngle);
      drawShip(ctx, frame);
      if (s.shieldAlpha > 0.01) {
        const shieldCol = engine.healthRef.current < 30
          ? `rgba(255, 60, 60, ${0.55 * s.shieldAlpha})`
          : `rgba(0, 255, 150, ${0.55 * s.shieldAlpha})`;
        ctx.strokeStyle = shieldCol; ctx.lineWidth = 1;
        const sr = frame * 0.018;
        for (let seg = 0; seg < 4; seg++) {
          const sa = sr + seg * Math.PI / 2 + 0.09;
          ctx.beginPath(); ctx.arc(0, 0, 28, sa, sa + Math.PI / 2 - 0.18); ctx.stroke();
        }
      }
      ctx.restore();

      // --- Particles ---
      for (const p of s.particles) {
        const alpha = p.life / p.maxLife; const r = p.radius * alpha;
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.shadowBlur = 4; ctx.shadowColor = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = p.color; ctx.fill();
        ctx.shadowBlur = 0; ctx.restore();
      }

      // --- Floating texts ---
      for (const ft of s.floatingTexts) {
        ctx.save(); ctx.globalAlpha = Math.max(0, ft.opacity);
        ctx.font = `bold ${ft.size}px 'Space Mono', monospace`;
        ctx.fillStyle = ft.color; ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y); ctx.restore();
      }

      // --- Flash effects ---
      if (s.flashRed > 0) {
        ctx.save(); ctx.globalAlpha = (s.flashRed / 24) * 0.22;
        ctx.fillStyle = 'rgba(255, 30, 30, 1)'; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
      if (s.flashWhite.life > 0) {
        ctx.save(); ctx.globalAlpha = (s.flashWhite.life / 10) * 0.35;
        ctx.beginPath(); ctx.arc(s.flashWhite.x, s.flashWhite.y, 36, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.fill(); ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(tick);
    }

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [engine.gameStatus, isConnected, currentPrice]);

  // =========================================================================
  // Price axis data — labels at VISIBLE_RANGE_PCT * 0.25 increments
  // =========================================================================
  const s = stateRef.current;
  const dp = s.displayPrice || currentPrice || 1;
  const aMin = s.animMin || dp - dp * VISIBLE_RANGE_PCT;
  const aMax = s.animMax || dp + dp * VISIBLE_RANGE_PCT;
  const axisH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const hasPrice = dp > 1 && aMax > aMin;
  const currentPriceY = hasPrice ? mapPrice(dp, aMin, aMax, axisH) : axisH / 2;

  const inc = dp * VISIBLE_RANGE_PCT * 0.25;
  const axisLabels: { price: number; y: number }[] = [];
  if (hasPrice && inc > 0) {
    const start = Math.ceil(aMin / inc) * inc;
    for (let p = start; p <= aMax; p += inc) {
      const y = mapPrice(p, aMin, aMax, axisH);
      if (Math.abs(y - currentPriceY) > 20) {
        axisLabels.push({ price: p, y });
      }
    }
  }

  const fmtPrice = (p: number) =>
    p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <canvas ref={bgCanvasRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
      <canvas ref={gameCanvasRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />

      <HUD
        currentPrice={livePrice || currentPrice}
        previousPrice={previousPrice}
        priceDirection={priceDirection}
        timeRemaining={engine.timeRemaining}
        secondsOnTarget={secondsOnTarget}
        totalPlaced={engine.ordersPlaced.reduce((sum, o) => sum + o.size, 0)}
        estimatedPnL={engine.totalPnL}
        health={engine.health}
        hitFlash={hitFlash}
        symbol={params.symbol}
      />

      {/* Price axis */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: PRICE_AXIS_W, height: '100%',
        background: 'rgba(10, 10, 18, 0.97)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
        fontFamily: "'Space Mono', monospace",
        fontSize: 11, zIndex: 10,
      }}>
        {axisLabels.map((label, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: label.y - 7,
            right: 10,
            color: 'rgba(180, 180, 190, 0.75)',
            whiteSpace: 'nowrap',
          }}>
            {fmtPrice(label.price)}
            <div style={{
              position: 'absolute', left: -14, top: 6,
              width: 4, height: 1,
              background: 'rgba(255,255,255,0.2)',
            }} />
          </div>
        ))}

        {/* Current price pill */}
        <div style={{
          position: 'absolute',
          top: currentPriceY - 10,
          left: 0, right: 0,
          display: 'flex', justifyContent: 'center',
        }}>
          <span style={{
            background: 'rgba(0, 220, 255, 1)',
            color: '#000', fontWeight: 'bold',
            borderRadius: 2, padding: '2px 6px',
            fontSize: 11, whiteSpace: 'nowrap',
          }}>
            {fmtPrice(dp)}
          </span>
        </div>
      </div>

      {/* Trade log panel */}
      {tradeLog.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 120, zIndex: 15,
          background: 'rgba(6, 8, 20, 0.88)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          overflowY: 'auto',
          fontFamily: "'Space Mono', monospace",
          fontSize: 12,
          padding: '6px 12px',
        }} ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
          {tradeLog.map((t, i) => (
            <div key={i} style={{ color: t.side === 'long' ? '#40a030' : '#c03020', lineHeight: '18px' }}>
              [{new Date(t.timestamp).toLocaleTimeString()}] {t.side === 'long' ? 'BOUGHT' : 'SOLD'} {params.symbol.replace('-PERP', '')} @ ${t.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} · ${t.size.toFixed(2)}
            </div>
          ))}
        </div>
      )}

      {!isConnected && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          fontSize: 11, color: 'rgba(0, 220, 255, 0.65)', background: 'rgba(6,8,24,0.9)',
          padding: '4px 12px', borderRadius: 4, zIndex: 20,
        }}>
          Connecting to price feed...
        </div>
      )}
    </div>
  );
}
