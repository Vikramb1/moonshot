'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiquid } from '@/lib/useLiquid';
import { useGameEngine } from '@/lib/useGameEngine';
import SurfHUD from './SurfHUD';
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
const SHARK_BASE_INTERVAL = 28;
const GAME_AREA_PCT = 0.75;
const PRICE_AXIS_W = 68;

// Chart range — tuned for ETH volatility ±0.2%
const VISIBLE_RANGE_PCT = 0.002;
const CHART_HEIGHT_FRACTION = 0.6;

const SEED_PRICE = 2500;
const NOISE_FREQUENCY = 0.06;

// Ocean colors
const COL_BG = '#0a1a2e';
const COL_BG_TOP = '#122840';
const COL_LINE = 'rgba(240, 248, 255, 0.9)';
const COL_LINE_GLOW = 'rgba(32, 176, 176, 0.4)';
const COL_FOAM = 'rgba(224, 240, 255, 0.7)';
const COL_SAFE = 'rgba(64, 220, 200, 1)';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; radius: number; color: string }
interface FloatingText { text: string; x: number; y: number; opacity: number; vy: number; life: number; color: string; size: number }
interface Shark {
  x: number; y: number; vx: number; vy: number;
  phase: number; phaseSpeed: number; radius: number;
  bodyLen: number; finHeight: number;
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

// ---------------------------------------------------------------------------
// Surfer drawing
// ---------------------------------------------------------------------------
function drawSurfer(ctx: CanvasRenderingContext2D, frame: number, tilt: number) {
  ctx.save();

  // Surfboard
  ctx.save();
  ctx.rotate(tilt * 0.3);
  const boardGrad = ctx.createLinearGradient(-18, 0, 18, 0);
  boardGrad.addColorStop(0, '#c8a050');
  boardGrad.addColorStop(0.5, '#e0c070');
  boardGrad.addColorStop(1, '#c8a050');
  ctx.fillStyle = boardGrad;
  ctx.beginPath();
  ctx.ellipse(0, 6, 22, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 120, 60, 0.6)';
  ctx.lineWidth = 0.75;
  ctx.stroke();
  // Board stripe
  ctx.strokeStyle = 'rgba(32, 176, 176, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-14, 6);
  ctx.lineTo(14, 6);
  ctx.stroke();
  ctx.restore();

  // Surfer body
  const bobOff = Math.sin(frame * 0.08) * 1.5;

  // Legs
  ctx.fillStyle = 'rgba(40, 80, 120, 1)';
  ctx.fillRect(-6, -2 + bobOff, 4, 8);
  ctx.fillRect(2, -2 + bobOff, 4, 8);

  // Torso
  ctx.fillStyle = 'rgba(20, 60, 100, 1)';
  ctx.fillRect(-5, -12 + bobOff, 10, 12);

  // Wetsuit stripe
  ctx.fillStyle = 'rgba(32, 176, 176, 0.4)';
  ctx.fillRect(-5, -8 + bobOff, 10, 2);

  // Head
  ctx.fillStyle = 'rgba(210, 170, 130, 1)';
  ctx.beginPath();
  ctx.arc(0, -16 + bobOff, 5, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = 'rgba(60, 40, 20, 1)';
  ctx.beginPath();
  ctx.arc(0, -18 + bobOff, 5, Math.PI, Math.PI * 2);
  ctx.fill();

  // Arms
  const armAngle = tilt * 2;
  ctx.strokeStyle = 'rgba(210, 170, 130, 1)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-5, -8 + bobOff);
  ctx.lineTo(-14 - armAngle * 3, -6 + bobOff);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(5, -8 + bobOff);
  ctx.lineTo(14 + armAngle * 3, -6 + bobOff);
  ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Shark drawing
// ---------------------------------------------------------------------------
function drawShark(ctx: CanvasRenderingContext2D, shark: Shark, frame: number) {
  ctx.save();
  ctx.translate(shark.x, shark.y);
  ctx.scale(-1, 1); // flip so shark faces left (direction of travel)

  const undulate = Math.sin(frame * 0.06 + shark.phase) * 3;

  // Proximity glow
  if (shark.glowIntensity > 0.01) {
    const glowGrad = ctx.createRadialGradient(0, 0, shark.bodyLen * 0.3, 0, 0, shark.bodyLen * 1.5);
    glowGrad.addColorStop(0, `rgba(200, 80, 60, ${shark.glowIntensity * 0.3})`);
    glowGrad.addColorStop(1, 'rgba(200, 80, 60, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(-shark.bodyLen * 1.5, -shark.bodyLen * 1.5, shark.bodyLen * 3, shark.bodyLen * 3);
  }

  // Body
  ctx.fillStyle = 'rgba(90, 100, 110, 1)';
  ctx.beginPath();
  ctx.moveTo(shark.bodyLen * 0.5, undulate);
  ctx.quadraticCurveTo(shark.bodyLen * 0.2, -shark.bodyLen * 0.25 + undulate, 0, undulate * 0.5);
  ctx.quadraticCurveTo(-shark.bodyLen * 0.3, shark.bodyLen * 0.15 + undulate, -shark.bodyLen * 0.5, undulate);
  ctx.quadraticCurveTo(-shark.bodyLen * 0.3, -shark.bodyLen * 0.15 + undulate, 0, undulate * 0.5);
  ctx.quadraticCurveTo(shark.bodyLen * 0.2, shark.bodyLen * 0.25 + undulate, shark.bodyLen * 0.5, undulate);
  ctx.closePath();
  ctx.fill();

  // Belly
  ctx.fillStyle = 'rgba(140, 150, 160, 0.5)';
  ctx.beginPath();
  ctx.ellipse(0, 2 + undulate * 0.5, shark.bodyLen * 0.3, shark.bodyLen * 0.1, 0, 0, Math.PI);
  ctx.fill();

  // Dorsal fin
  ctx.fillStyle = 'rgba(70, 80, 90, 1)';
  ctx.beginPath();
  ctx.moveTo(0, -shark.bodyLen * 0.15 + undulate * 0.5);
  ctx.lineTo(-shark.bodyLen * 0.12, -shark.finHeight + undulate * 0.3);
  ctx.lineTo(shark.bodyLen * 0.1, -shark.bodyLen * 0.15 + undulate * 0.5);
  ctx.closePath();
  ctx.fill();

  // Tail fin
  ctx.fillStyle = 'rgba(80, 90, 100, 1)';
  ctx.beginPath();
  ctx.moveTo(-shark.bodyLen * 0.45, undulate);
  ctx.lineTo(-shark.bodyLen * 0.65, -shark.bodyLen * 0.2 + undulate);
  ctx.lineTo(-shark.bodyLen * 0.55, undulate);
  ctx.lineTo(-shark.bodyLen * 0.65, shark.bodyLen * 0.2 + undulate);
  ctx.closePath();
  ctx.fill();

  // Eye
  ctx.fillStyle = 'rgba(20, 20, 20, 1)';
  ctx.beginPath();
  ctx.arc(shark.bodyLen * 0.3, -3 + undulate * 0.7, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.beginPath();
  ctx.arc(shark.bodyLen * 0.31, -3.5 + undulate * 0.7, 0.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface SurfGameProps {
  params: GameParams;
  onGameEnd: (result: GameResult) => void;
}

export default function SurfGame({ params, onGameEnd }: SurfGameProps) {
  const { currentPrice, previousPrice, priceDirection, isConnected } = useLiquid('ETH-PERP');
  const engine = useGameEngine(params);
  const [tradeLog, setTradeLog] = useState<TradeLogEntry[]>([]);

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
    priceHistoryPx: [] as number[],
    interpPrice: 0,
    interpTarget: 0,
    interpPrev: 0,
    interpFrame: 0,
    displayPrice: SEED_PRICE,
    animMin: 0,
    animMax: 0,
    targetMin: 0,
    targetMax: 0,
    rescaleStartMin: 0,
    rescaleStartMax: 0,
    rescaleFrame: 20,
    simPrice: SEED_PRICE,
    simNoiseAmp: SEED_PRICE * 0.0001,
    simSpikeValue: 0,
    simSpikeFrames: 0,
    simDeltaHistory: [] as number[],
    simLastPrice: SEED_PRICE,
    sharks: [] as Shark[],
    sharkTimer: 0,
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
    if (currentPrice === s.lastWsPrice) return;
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
      if (Math.abs(tilt) < 0.01) return;
      const side: 'long' | 'short' = tilt < 0 ? 'long' : 'short';
      const price = stateRef.current.interpPrice;
      const size = params.positionSize;
      const data = { success: true, order_id: 'dummy-' + Date.now() };
      const order: Order = {
        coinId: `tilt-${Date.now()}`,
        priceLevel: price,
        size,
        side: side === 'long' ? 'buy' : 'sell',
        timestamp: Date.now(),
        liquidOrderId: data.order_id,
      };
      engine.addOrder(order);
      setTradeLog((prev) => {
        const next = [...prev, { side, price, size, timestamp: Date.now() }];
        return next.length > 50 ? next.slice(-50) : next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [engine.gameStatus, params.positionSize]);

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
  // MAIN GAME LOOP
  // =========================================================================
  useEffect(() => {
    if (engine.gameStatus !== 'playing') return;

    const s = stateRef.current;
    const bgC = bgCanvasRef.current;
    const gC = gameCanvasRef.current;
    if (!bgC || !gC) return;
    const bgCtx = bgC.getContext('2d')!;
    const ctx = gC.getContext('2d')!;

    if (!s.mounted) {
      s.mounted = true;
      s.shipY = gC.height / 2;
      const initPrice = currentPrice || SEED_PRICE;
      s.interpPrice = initPrice;
      s.interpPrev = initPrice;
      s.interpTarget = initPrice;
      s.simPrice = initPrice;
      s.simLastPrice = initPrice;
      s.displayPrice = initPrice;
      const halfRange = initPrice * VISIBLE_RANGE_PCT;
      s.animMin = initPrice - halfRange;
      s.animMax = initPrice + halfRange;
      s.targetMin = s.animMin;
      s.targetMax = s.animMax;
      s.rescaleStartMin = s.animMin;
      s.rescaleStartMax = s.animMax;
      s.rescaleFrame = 20;
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
      const interpT = Math.min(s.interpFrame / 30, 1);
      s.interpPrice = lerp(s.interpPrev, s.interpTarget, interpT);

      // --- Simulated price ---
      if (!isConnected) {
        const baseAmp = s.simNoiseAmp;
        const noiseOffset =
          Math.sin(frame * NOISE_FREQUENCY) * baseAmp
          + Math.sin(frame * NOISE_FREQUENCY * 2.3) * baseAmp * 0.4
          + Math.sin(frame * NOISE_FREQUENCY * 0.7) * baseAmp * 0.6;

        const trendOffset = Math.sin(frame * 0.004) * SEED_PRICE * 0.00008;

        if (frame > 0 && frame % 180 === 0) {
          s.simSpikeValue = (Math.random() - 0.5) * SEED_PRICE * 0.0002;
          s.simSpikeFrames = 10;
        }
        const spike = s.simSpikeFrames > 0 ? s.simSpikeValue : 0;
        if (s.simSpikeFrames > 0) s.simSpikeFrames--;

        s.simPrice = SEED_PRICE + noiseOffset + trendOffset + spike;

        const delta = Math.abs(s.simPrice - s.simLastPrice) / s.simPrice;
        s.simDeltaHistory.push(delta);
        if (s.simDeltaHistory.length > 10) s.simDeltaHistory.shift();
        if (s.simDeltaHistory.length >= 3) {
          const avgDelta = s.simDeltaHistory.reduce((a, b) => a + b, 0) / s.simDeltaHistory.length;
          const baseLine = SEED_PRICE * 0.0001;
          if (avgDelta < 0.00003) s.simNoiseAmp = baseLine * 2.5;
          else if (avgDelta > 0.00015) s.simNoiseAmp = baseLine * 0.6;
          else s.simNoiseAmp = baseLine;
        }
        s.simLastPrice = s.simPrice;
      }

      const displayPrice = isConnected ? s.interpPrice : s.simPrice;
      s.displayPrice = displayPrice;

      // --- Dynamic rescaling ---
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

      // --- Price Y ---
      const priceY = mapPrice(displayPrice, s.animMin, s.animMax, H);

      s.priceHistoryPx.push(priceY);
      const maxHistLen = Math.floor(shipX) + 1;
      if (s.priceHistoryPx.length > maxHistLen) {
        s.priceHistoryPx.shift();
      }

      // --- Surfer physics ---
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

      // Bob + shake
      s.bobPhase += 0.04;
      const bobY = Math.sin(s.bobPhase) * 2.5;
      const shakeOff = s.shipShake > 0 ? (Math.random() - 0.5) * 6 * (s.shipShake / 12) : 0;
      const drawSurferY = s.shipY + bobY + shakeOff;
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
          text: 'RIDING THE WAVE', x: shipX - 60, y: drawSurferY - 25,
          opacity: 1, vy: -0.5, life: 25, color: COL_SAFE, size: 10,
        });
      }
      s.wasInSafe = inSafe;

      // --- Sharks ---
      const elapsed = params.duration - engine.timeRemainingRef.current;
      const sharkInterval = elapsed > 40 ? 14 : elapsed > 20 ? 20 : SHARK_BASE_INTERVAL;
      s.sharkTimer++;
      if (s.sharkTimer >= sharkInterval) {
        s.sharkTimer = 0;
        let ay: number;
        do { ay = 60 + Math.random() * (H - 120); } while (Math.abs(ay - safeY) < 80);
        const bodyLen = 20 + Math.random() * 14;
        s.sharks.push({
          x: gameW + 20, y: ay,
          vx: -(3 + Math.random() * 4), vy: (Math.random() - 0.5) * 1.2,
          phase: Math.random() * Math.PI * 2,
          phaseSpeed: 0.03 + Math.random() * 0.04,
          radius: bodyLen * 0.5,
          bodyLen,
          finHeight: bodyLen * 0.6 + Math.random() * 6,
          glowIntensity: 0,
        });
      }

      for (let i = s.sharks.length - 1; i >= 0; i--) {
        const shark = s.sharks[i];
        shark.x += shark.vx;
        shark.y += shark.vy + Math.sin(frame * shark.phaseSpeed + shark.phase) * 0.5;
        if (shark.y < shark.radius + 10 || shark.y > H - shark.radius - 10) shark.vy *= -1;
        shark.y = Math.max(shark.radius + 10, Math.min(H - shark.radius - 10, shark.y));
        if (shark.x < -60) { s.sharks.splice(i, 1); continue; }
        if (Math.abs(shark.y - safeY) < 80) { s.sharks.splice(i, 1); continue; }

        const dxa = shipX - shark.x; const dya = s.shipY - shark.y;
        const distA = Math.sqrt(dxa * dxa + dya * dya);
        shark.glowIntensity = distA < 200
          ? lerp(shark.glowIntensity, (200 - distA) / 200, 0.08)
          : lerp(shark.glowIntensity, 0, 0.08);

        if (distA < shark.radius + 8) {
          s.sharks.splice(i, 1);
          engine.takeDamage(15);
          s.flashRed = 24; s.shipShake = 12;
          s.flashWhite = { x: shipX, y: s.shipY, life: 10 };
          setHitFlash(true);
          if (hitFlashTimeout.current) clearTimeout(hitFlashTimeout.current);
          hitFlashTimeout.current = setTimeout(() => setHitFlash(false), 400);
          for (let p = 0; p < 12; p++) {
            const angle = (p / 12) * Math.PI * 2;
            const speed = 4 + Math.random() * 4;
            s.particles.push({
              x: shipX, y: s.shipY,
              vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
              life: 14, maxLife: 14, radius: 4,
              color: 'rgba(100, 180, 220, 1)',
            });
          }
        }
      }

      // --- Water spray trail ---
      const tCos = Math.cos(s.shipTiltAngle);
      const sprayX = shipX - 18 * tCos;
      const sprayY = drawSurferY + 6;
      for (let p = 0; p < 3; p++) {
        s.particles.push({
          x: sprayX + (Math.random() - 0.5) * 8,
          y: sprayY + (Math.random() - 0.5) * 4,
          vx: -(1.5 + Math.random() * 1.5),
          vy: -(0.5 + Math.random() * 1.5),
          life: 20, maxLife: 20, radius: 2.5,
          color: COL_FOAM,
        });
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

      // --- PnL ---
      const pnl = engine.ordersRef.current.reduce((sum: number, order: Order) => {
        const diff = s.interpPrice - order.priceLevel;
        return sum + diff * order.size * (order.side === 'buy' ? 1 : -1) * 0.001;
      }, 0);
      engine.checkGameEndConditions(pnl);
      if (engine.endedRef.current) return;

      // =====================================================================
      // DRAW — BACKGROUND (clean ocean gradient)
      // =====================================================================
      const bgGrad = bgCtx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, COL_BG_TOP);
      bgGrad.addColorStop(1, COL_BG);
      bgCtx.fillStyle = bgGrad;
      bgCtx.fillRect(0, 0, W, H);

      // Subtle horizontal depth lines (very faint)
      bgCtx.strokeStyle = 'rgba(32, 176, 176, 0.03)';
      bgCtx.lineWidth = 1;
      for (let gy = 0; gy <= H; gy += 80) {
        bgCtx.beginPath(); bgCtx.moveTo(0, gy); bgCtx.lineTo(W, gy); bgCtx.stroke();
      }

      // =====================================================================
      // DRAW — GAME CANVAS
      // =====================================================================
      ctx.clearRect(0, 0, W, H);

      // --- Price line as smooth wave ---
      const hist = s.priceHistoryPx;
      if (hist.length >= 2) {
        const xOff = shipX - hist.length + 1;

        // Build a smooth curved path using quadratic bezier
        const buildSmoothPath = () => {
          ctx.beginPath();
          ctx.moveTo(xOff, hist[0]);
          for (let i = 1; i < hist.length - 1; i++) {
            const cpx = xOff + i;
            const cpy = hist[i];
            const npx = xOff + i + 1;
            const npy = hist[i + 1];
            const midX = (cpx + npx) / 2;
            const midY = (cpy + npy) / 2;
            ctx.quadraticCurveTo(cpx, cpy, midX, midY);
          }
          // Final segment
          ctx.lineTo(xOff + hist.length - 1, hist[hist.length - 1]);
        };

        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';

        // Thin fill below the line (not all the way to bottom)
        const fillDepth = (H - 160) * 0.06;
        ctx.beginPath();
        ctx.moveTo(xOff, hist[0]);
        for (let i = 1; i < hist.length - 1; i++) {
          const cpx = xOff + i;
          const cpy = hist[i];
          const npx = xOff + i + 1;
          const npy = hist[i + 1];
          const midX = (cpx + npx) / 2;
          const midY = (cpy + npy) / 2;
          ctx.quadraticCurveTo(cpx, cpy, midX, midY);
        }
        ctx.lineTo(xOff + hist.length - 1, hist[hist.length - 1]);
        // Close downward for fill
        for (let i = hist.length - 1; i >= 0; i--) ctx.lineTo(xOff + i, hist[i] + fillDepth);
        ctx.closePath();
        const fillGrad = ctx.createLinearGradient(0, priceY, 0, priceY + fillDepth);
        fillGrad.addColorStop(0, 'rgba(32, 176, 176, 0.18)');
        fillGrad.addColorStop(1, 'rgba(32, 176, 176, 0)');
        ctx.fillStyle = fillGrad;
        ctx.fill();

        // Glow layer
        ctx.lineWidth = 8; ctx.strokeStyle = COL_LINE_GLOW;
        ctx.globalAlpha = 0.25;
        buildSmoothPath(); ctx.stroke();
        ctx.globalAlpha = 1;

        // Main foam line
        ctx.lineWidth = 2; ctx.strokeStyle = COL_LINE;
        ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(224, 240, 255, 0.5)';
        buildSmoothPath(); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // --- Darkness wall — extends from ship to price axis ---
      ctx.fillStyle = COL_BG;
      ctx.fillRect(shipX, 0, W - PRICE_AXIS_W - shipX, H);
      const darkGrad = ctx.createLinearGradient(shipX - 24, 0, shipX, 0);
      darkGrad.addColorStop(0, 'rgba(10, 26, 46, 0)');
      darkGrad.addColorStop(1, 'rgba(10, 26, 46, 1)');
      ctx.fillStyle = darkGrad; ctx.fillRect(shipX - 24, 0, 24, H);

      // --- Current price dashed line ---
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(32, 176, 176, 0.15)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, priceY); ctx.lineTo(W - PRICE_AXIS_W, priceY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // --- Safe zone ---
      const safeTop = safeY - SAFE_ZONE_HALF;
      const safeBot = safeY + SAFE_ZONE_HALF;
      ctx.save();
      const sineOsc = Math.sin(frame / 60 * Math.PI * 2 / 3) * 0.02;
      ctx.globalAlpha = 1 + sineOsc;
      ctx.fillStyle = inSafe ? 'rgba(64, 220, 200, 0.07)' : 'rgba(64, 220, 200, 0.03)';
      ctx.fillRect(0, safeTop, W - PRICE_AXIS_W, safeBot - safeTop);
      ctx.restore();

      const dashOff = (frame * 1.2) % 24;
      ctx.save();
      ctx.setLineDash([14, 10]); ctx.lineDashOffset = -dashOff;
      ctx.strokeStyle = 'rgba(64, 220, 200, 0.2)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, safeTop); ctx.lineTo(W - PRICE_AXIS_W, safeTop); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, safeBot); ctx.lineTo(W - PRICE_AXIS_W, safeBot); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Safe zone corner brackets
      const bPulse = 0.5 + 0.5 * Math.sin(frame / 60 * Math.PI * 2 / 1.5);
      ctx.save();
      ctx.strokeStyle = `rgba(64, 220, 200, ${0.5 + bPulse * 0.5})`;
      ctx.lineWidth = 1.5;
      if (inSafe) { ctx.shadowBlur = 4; ctx.shadowColor = COL_SAFE; }
      ctx.beginPath(); ctx.moveTo(shipX - 8, safeTop); ctx.lineTo(shipX, safeTop); ctx.lineTo(shipX, safeTop + 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(shipX + 8, safeTop); ctx.lineTo(shipX, safeTop); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(shipX - 8, safeBot); ctx.lineTo(shipX, safeBot); ctx.lineTo(shipX, safeBot - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(shipX + 8, safeBot); ctx.lineTo(shipX, safeBot); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // --- Sharks ---
      for (const shark of s.sharks) {
        drawShark(ctx, shark, frame);
      }

      // Off-screen shark arrows
      for (const shark of s.sharks) {
        const dx = Math.abs(shark.x - shipX);
        if (dx < 220 && (shark.y < 10 || shark.y > H - 10)) {
          const arrowY = shark.y < 10 ? 15 : H - 15;
          const pointing = shark.y < 10 ? -1 : 1;
          const pulse = 0.35 + 0.5 * Math.abs(Math.sin(frame / 60 * Math.PI * 2 / 0.6));
          ctx.save(); ctx.fillStyle = `rgba(90, 100, 110, ${pulse})`;
          ctx.beginPath();
          ctx.moveTo(shipX, arrowY + pointing * 12);
          ctx.lineTo(shipX - 4.5, arrowY); ctx.lineTo(shipX + 4.5, arrowY);
          ctx.closePath(); ctx.fill(); ctx.restore();
        }
      }

      // --- Surfer ---
      ctx.save(); ctx.translate(shipX, drawSurferY); ctx.rotate(s.shipTiltAngle);
      drawSurfer(ctx, frame, s.shipTiltAngle);
      // Shield — teal wave-curl ring
      if (s.shieldAlpha > 0.01) {
        const shieldCol = engine.healthRef.current < 30
          ? `rgba(255, 60, 60, ${0.55 * s.shieldAlpha})`
          : `rgba(64, 220, 200, ${0.55 * s.shieldAlpha})`;
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
        ctx.fillStyle = 'rgba(32, 128, 160, 1)'; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
      if (s.flashWhite.life > 0) {
        ctx.save(); ctx.globalAlpha = (s.flashWhite.life / 10) * 0.35;
        ctx.beginPath(); ctx.arc(s.flashWhite.x, s.flashWhite.y, 36, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(224, 240, 255, 1)'; ctx.fill(); ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(tick);
    }

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [engine.gameStatus]);

  // =========================================================================
  // Price axis data
  // =========================================================================
  const s = stateRef.current;
  const dp = s.displayPrice || currentPrice || SEED_PRICE;
  const aMin = s.animMin || dp - dp * VISIBLE_RANGE_PCT;
  const aMax = s.animMax || dp + dp * VISIBLE_RANGE_PCT;
  const axisH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const currentPriceY = mapPrice(dp, aMin, aMax, axisH);

  const inc = dp * VISIBLE_RANGE_PCT * 0.25;
  const axisLabels: { price: number; y: number }[] = [];
  if (inc > 0) {
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

      <SurfHUD
        currentPrice={currentPrice}
        previousPrice={previousPrice}
        priceDirection={priceDirection}
        timeRemaining={engine.timeRemaining}
        secondsOnTarget={secondsOnTarget}
        totalPlaced={engine.ordersPlaced.reduce((sum, o) => sum + o.size, 0)}
        estimatedPnL={engine.totalPnL}
        health={engine.health}
        hitFlash={hitFlash}
      />

      {/* Price axis */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: PRICE_AXIS_W, height: '100%',
        background: 'rgba(10, 20, 36, 0.97)',
        borderLeft: '1px solid rgba(32, 176, 176, 0.15)',
        fontFamily: "'Space Mono', monospace",
        fontSize: 11, zIndex: 10,
      }}>
        {axisLabels.map((label, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: label.y - 7,
            right: 10,
            color: 'rgba(160, 190, 210, 0.75)',
            whiteSpace: 'nowrap',
          }}>
            {fmtPrice(label.price)}
            <div style={{
              position: 'absolute', left: -14, top: 6,
              width: 4, height: 1,
              background: 'rgba(32, 176, 176, 0.3)',
            }} />
          </div>
        ))}

        <div style={{
          position: 'absolute',
          top: currentPriceY - 10,
          left: 0, right: 0,
          display: 'flex', justifyContent: 'center',
        }}>
          <span style={{
            background: 'rgba(32, 176, 176, 1)',
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
          position: 'absolute', bottom: 0, left: 0, right: PRICE_AXIS_W,
          maxHeight: 80, zIndex: 15,
          background: 'rgba(10, 20, 36, 0.88)',
          borderTop: '1px solid rgba(32, 176, 176, 0.15)',
          overflowY: 'hidden',
          fontFamily: "'Space Mono', monospace",
          fontSize: 12,
          padding: '6px 12px',
        }}>
          {tradeLog.slice(-8).map((t, i) => (
            <div key={i} style={{ color: t.side === 'long' ? '#20b0b0' : '#c03020', lineHeight: '18px' }}>
              {t.side === 'long' ? 'BOUGHT' : 'SOLD'} ETH @ ${t.price.toFixed(2)} · ${t.size.toFixed(2)}
            </div>
          ))}
        </div>
      )}

      {!isConnected && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          fontSize: 11, color: 'rgba(32, 176, 176, 0.65)', background: 'rgba(10,20,36,0.9)',
          padding: '4px 12px', borderRadius: 4, zIndex: 20,
        }}>
          Connecting to price feed...
        </div>
      )}
    </div>
  );
}
