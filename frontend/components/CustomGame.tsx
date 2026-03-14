'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiquid } from '@/lib/useLiquid';
import { useGameEngine } from '@/lib/useGameEngine';
import CustomHUD from './CustomHUD';
import type { GameParams, GameResult, Order, CustomGameTheme } from '@/types';

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
const OBSTACLE_BASE_INTERVAL = 28;

const VISIBLE_RANGE_PCT = 0.002;
const CHART_HEIGHT_FRACTION = 0.6;

const SEED_PRICE = 2500;
const NOISE_FREQUENCY = 0.06;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; radius: number; color: string }
interface FloatingText { text: string; x: number; y: number; opacity: number; vy: number; life: number; color: string; size: number }
interface Obstacle {
  x: number; y: number; vx: number; vy: number;
  phase: number; phaseSpeed: number; radius: number;
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
// Safe function constructors with fallbacks
// ---------------------------------------------------------------------------
function makeDrawAvatar(body: string): (ctx: CanvasRenderingContext2D, frame: number, tilt: number) => void {
  try {
    const fn = new Function('ctx', 'frame', 'tilt', body) as (ctx: CanvasRenderingContext2D, frame: number, tilt: number) => void;
    return (ctx, frame, tilt) => {
      try { fn(ctx, frame, tilt); } catch {
        ctx.fillStyle = '#c080ff';
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
      }
    };
  } catch {
    return (ctx) => {
      ctx.fillStyle = '#c080ff';
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    };
  }
}

function makeDrawObstacle(body: string): (ctx: CanvasRenderingContext2D, obstacle: Obstacle, frame: number) => void {
  try {
    const fn = new Function('ctx', 'obstacle', 'frame', body) as (ctx: CanvasRenderingContext2D, obstacle: Obstacle, frame: number) => void;
    return (ctx, obstacle, frame) => {
      try { fn(ctx, obstacle, frame); } catch {
        ctx.save();
        ctx.translate(obstacle.x, obstacle.y);
        ctx.fillStyle = '#ff4060';
        ctx.beginPath(); ctx.arc(0, 0, obstacle.radius, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    };
  } catch {
    return (ctx, obstacle) => {
      ctx.save();
      ctx.translate(obstacle.x, obstacle.y);
      ctx.fillStyle = '#ff4060';
      ctx.beginPath(); ctx.arc(0, 0, obstacle.radius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
  }
}

function makeDrawBackground(body: string): (bgCtx: CanvasRenderingContext2D, W: number, H: number, frame: number) => void {
  try {
    const fn = new Function('bgCtx', 'W', 'H', 'frame', body) as (bgCtx: CanvasRenderingContext2D, W: number, H: number, frame: number) => void;
    return (bgCtx, W, H, frame) => {
      try { fn(bgCtx, W, H, frame); } catch {
        bgCtx.fillStyle = '#1a0a2e';
        bgCtx.fillRect(0, 0, W, H);
      }
    };
  } catch {
    return (bgCtx, W, H) => {
      bgCtx.fillStyle = '#1a0a2e';
      bgCtx.fillRect(0, 0, W, H);
    };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface CustomGameProps {
  params: GameParams;
  theme: CustomGameTheme;
  onGameEnd: (result: GameResult) => void;
}

export default function CustomGame({ params, theme, onGameEnd }: CustomGameProps) {
  const { currentPrice, previousPrice, priceDirection, isConnected } = useLiquid(params.symbol);
  const engine = useGameEngine(params);
  const [tradeLog, setTradeLog] = useState<TradeLogEntry[]>([]);

  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const frameRef = useRef(0);

  const [hitFlash, setHitFlash] = useState(false);
  const hitFlashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [secondsOnTarget, setSecondsOnTarget] = useState(0);

  // Build drawing functions once
  const drawFnsRef = useRef({
    avatar: makeDrawAvatar(theme.drawAvatar),
    obstacle: makeDrawObstacle(theme.drawObstacle),
    background: makeDrawBackground(theme.drawBackground),
  });

  const colors = theme.colors;

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
    obstacles: [] as Obstacle[],
    obstacleTimer: 0,
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

  // Tilt-based trading every 1s
  useEffect(() => {
    if (engine.gameStatus !== 'playing') return;
    const interval = setInterval(() => {
      const tilt = stateRef.current.shipTiltAngle;
      if (Math.abs(tilt) < 0.01) return;
      const side: 'long' | 'short' = tilt < 0 ? 'long' : 'short';
      const price = stateRef.current.interpPrice;
      const size = params.positionSize;
      const order: Order = {
        coinId: `tilt-${Date.now()}`,
        priceLevel: price,
        size,
        side: side === 'long' ? 'buy' : 'sell',
        timestamp: Date.now(),
        liquidOrderId: 'dummy-' + Date.now(),
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

    const drawAvatar = drawFnsRef.current.avatar;
    const drawObstacle = drawFnsRef.current.obstacle;
    const drawBackground = drawFnsRef.current.background;

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
      // Full width game area — avatar at 35% from left
      const shipX = W * 0.35;
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

      // --- Avatar physics ---
      const wHeld = s.keys['w'] || s.keys['W'] || s.keys['ArrowUp'];
      const sHeld = s.keys['s'] || s.keys['S'] || s.keys['ArrowDown'];

      if (wHeld && !sHeld) {
        if (s.wHeldFrames === 0) { s.shipVelY = -INITIAL_SPEED; } else { s.shipVelY = lerp(s.shipVelY, -MAX_SPEED, ACCELERATION_RAMP); }
        s.wHeldFrames++; s.sHeldFrames = 0;
      } else if (sHeld && !wHeld) {
        if (s.sHeldFrames === 0) { s.shipVelY = INITIAL_SPEED; } else { s.shipVelY = lerp(s.shipVelY, MAX_SPEED, ACCELERATION_RAMP); }
        s.sHeldFrames++; s.wHeldFrames = 0;
      } else {
        s.shipVelY = lerp(s.shipVelY, 0, 0.22);
        s.wHeldFrames = 0; s.sHeldFrames = 0;
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
      const drawAvatarY = s.shipY + bobY + shakeOff;
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
          text: theme.labels.onTargetText, x: shipX - 60, y: drawAvatarY - 25,
          opacity: 1, vy: -0.5, life: 25, color: colors.safe, size: 10,
        });
      }
      s.wasInSafe = inSafe;

      // --- Obstacles — spawn from full right edge ---
      const elapsed = params.duration - engine.timeRemainingRef.current;
      const obstacleInterval = elapsed > 40 ? 14 : elapsed > 20 ? 20 : OBSTACLE_BASE_INTERVAL;
      s.obstacleTimer++;
      if (s.obstacleTimer >= obstacleInterval) {
        s.obstacleTimer = 0;
        let ay: number;
        do { ay = 60 + Math.random() * (H - 120); } while (Math.abs(ay - safeY) < 80);
        const radius = 10 + Math.random() * 7;
        s.obstacles.push({
          x: W + 20, y: ay,
          vx: -(3 + Math.random() * 4), vy: (Math.random() - 0.5) * 1.2,
          phase: Math.random() * Math.PI * 2,
          phaseSpeed: 0.03 + Math.random() * 0.04,
          radius,
          glowIntensity: 0,
        });
      }

      for (let i = s.obstacles.length - 1; i >= 0; i--) {
        const obs = s.obstacles[i];
        obs.x += obs.vx;
        obs.y += obs.vy + Math.sin(frame * obs.phaseSpeed + obs.phase) * 0.5;
        if (obs.y < obs.radius + 10 || obs.y > H - obs.radius - 10) obs.vy *= -1;
        obs.y = Math.max(obs.radius + 10, Math.min(H - obs.radius - 10, obs.y));
        if (obs.x < -60) { s.obstacles.splice(i, 1); continue; }
        if (Math.abs(obs.y - safeY) < 80) { s.obstacles.splice(i, 1); continue; }

        const dxa = shipX - obs.x; const dya = s.shipY - obs.y;
        const distA = Math.sqrt(dxa * dxa + dya * dya);
        obs.glowIntensity = distA < 200
          ? lerp(obs.glowIntensity, (200 - distA) / 200, 0.08)
          : lerp(obs.glowIntensity, 0, 0.08);

        if (distA < obs.radius + 8) {
          s.obstacles.splice(i, 1);
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
              color: colors.damageParticle,
            });
          }
        }
      }

      // --- Trail particles ---
      const tCos = Math.cos(s.shipTiltAngle);
      const sprayX = shipX - 18 * tCos;
      const sprayY = drawAvatarY + 6;
      for (let p = 0; p < 3; p++) {
        s.particles.push({
          x: sprayX + (Math.random() - 0.5) * 8,
          y: sprayY + (Math.random() - 0.5) * 4,
          vx: -(1.5 + Math.random() * 1.5),
          vy: -(0.5 + Math.random() * 1.5),
          life: 20, maxLife: 20, radius: 2.5,
          color: colors.particle,
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
      // DRAW — BACKGROUND
      // =====================================================================
      drawBackground(bgCtx, W, H, frame);

      // =====================================================================
      // DRAW — GAME CANVAS (full width)
      // =====================================================================
      ctx.clearRect(0, 0, W, H);

      // --- Price line ---
      const hist = s.priceHistoryPx;
      if (hist.length >= 2) {
        const xOff = shipX - hist.length + 1;

        const buildSmoothPath = () => {
          ctx.beginPath();
          ctx.moveTo(xOff, hist[0]);
          for (let i = 1; i < hist.length - 1; i++) {
            const cpx = xOff + i; const cpy = hist[i];
            const npx = xOff + i + 1; const npy = hist[i + 1];
            const midX = (cpx + npx) / 2; const midY = (cpy + npy) / 2;
            ctx.quadraticCurveTo(cpx, cpy, midX, midY);
          }
          ctx.lineTo(xOff + hist.length - 1, hist[hist.length - 1]);
        };

        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';

        // Fill below line
        const fillDepth = (H - 160) * 0.06;
        ctx.beginPath();
        ctx.moveTo(xOff, hist[0]);
        for (let i = 1; i < hist.length - 1; i++) {
          const cpx = xOff + i; const cpy = hist[i];
          const npx = xOff + i + 1; const npy = hist[i + 1];
          ctx.quadraticCurveTo(cpx, cpy, (cpx + npx) / 2, (cpy + npy) / 2);
        }
        ctx.lineTo(xOff + hist.length - 1, hist[hist.length - 1]);
        for (let i = hist.length - 1; i >= 0; i--) ctx.lineTo(xOff + i, hist[i] + fillDepth);
        ctx.closePath();
        const fillGrad = ctx.createLinearGradient(0, priceY, 0, priceY + fillDepth);
        fillGrad.addColorStop(0, colors.lineGlow.replace(/[\d.]+\)$/, '0.18)'));
        fillGrad.addColorStop(1, colors.lineGlow.replace(/[\d.]+\)$/, '0)'));
        ctx.fillStyle = fillGrad;
        ctx.fill();

        // Glow
        ctx.lineWidth = 8; ctx.strokeStyle = colors.lineGlow;
        ctx.globalAlpha = 0.25;
        buildSmoothPath(); ctx.stroke();
        ctx.globalAlpha = 1;

        // Main line
        ctx.lineWidth = 2; ctx.strokeStyle = colors.line;
        ctx.shadowBlur = 10; ctx.shadowColor = colors.line;
        buildSmoothPath(); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // --- Current price dashed line (full width) ---
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = colors.safe.replace(/[\d.]+\)$/, '0.15)');
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, priceY); ctx.lineTo(W, priceY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // --- Safe zone (full width) ---
      const safeTop = safeY - SAFE_ZONE_HALF;
      const safeBot = safeY + SAFE_ZONE_HALF;
      ctx.save();
      const sineOsc = Math.sin(frame / 60 * Math.PI * 2 / 3) * 0.02;
      ctx.globalAlpha = 1 + sineOsc;
      ctx.fillStyle = inSafe
        ? colors.safe.replace(/[\d.]+\)$/, '0.07)')
        : colors.safe.replace(/[\d.]+\)$/, '0.03)');
      ctx.fillRect(0, safeTop, W, safeBot - safeTop);
      ctx.restore();

      const dashOff = (frame * 1.2) % 24;
      ctx.save();
      ctx.setLineDash([14, 10]); ctx.lineDashOffset = -dashOff;
      ctx.strokeStyle = colors.safe.replace(/[\d.]+\)$/, '0.2)');
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, safeTop); ctx.lineTo(W, safeTop); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, safeBot); ctx.lineTo(W, safeBot); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Safe zone brackets
      const bPulse = 0.5 + 0.5 * Math.sin(frame / 60 * Math.PI * 2 / 1.5);
      ctx.save();
      ctx.strokeStyle = colors.safe.replace(/[\d.]+\)$/, `${0.5 + bPulse * 0.5})`);
      ctx.lineWidth = 1.5;
      if (inSafe) { ctx.shadowBlur = 4; ctx.shadowColor = colors.safe; }
      ctx.beginPath(); ctx.moveTo(shipX - 8, safeTop); ctx.lineTo(shipX, safeTop); ctx.lineTo(shipX, safeTop + 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(shipX + 8, safeTop); ctx.lineTo(shipX, safeTop); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(shipX - 8, safeBot); ctx.lineTo(shipX, safeBot); ctx.lineTo(shipX, safeBot - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(shipX + 8, safeBot); ctx.lineTo(shipX, safeBot); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // --- Obstacles ---
      for (const obs of s.obstacles) {
        drawObstacle(ctx, obs, frame);
      }

      // Off-screen obstacle arrows
      for (const obs of s.obstacles) {
        const dx = Math.abs(obs.x - shipX);
        if (dx < 220 && (obs.y < 10 || obs.y > H - 10)) {
          const arrowY = obs.y < 10 ? 15 : H - 15;
          const pointing = obs.y < 10 ? -1 : 1;
          const pulse = 0.35 + 0.5 * Math.abs(Math.sin(frame / 60 * Math.PI * 2 / 0.6));
          ctx.save(); ctx.fillStyle = `rgba(200, 80, 60, ${pulse})`;
          ctx.beginPath();
          ctx.moveTo(shipX, arrowY + pointing * 12);
          ctx.lineTo(shipX - 4.5, arrowY); ctx.lineTo(shipX + 4.5, arrowY);
          ctx.closePath(); ctx.fill(); ctx.restore();
        }
      }

      // --- Avatar ---
      ctx.save(); ctx.translate(shipX, drawAvatarY); ctx.rotate(s.shipTiltAngle);
      drawAvatar(ctx, frame, s.shipTiltAngle);
      // Shield ring
      if (s.shieldAlpha > 0.01) {
        const shieldCol = engine.healthRef.current < 30
          ? `rgba(255, 60, 60, ${0.55 * s.shieldAlpha})`
          : colors.safe.replace(/[\d.]+\)$/, `${0.55 * s.shieldAlpha})`);
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
        ctx.fillStyle = colors.damageParticle; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
      if (s.flashWhite.life > 0) {
        ctx.save(); ctx.globalAlpha = (s.flashWhite.life / 10) * 0.35;
        ctx.beginPath(); ctx.arc(s.flashWhite.x, s.flashWhite.y, 36, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(224, 240, 255, 1)'; ctx.fill(); ctx.restore();
      }

      // --- Price label on right edge ---
      const priceLabelX = W - 8;
      ctx.save();
      ctx.fillStyle = colors.accent;
      ctx.font = "bold 11px 'Space Mono', monospace";
      ctx.textAlign = 'right';
      ctx.fillText(
        displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        priceLabelX,
        priceY + 4,
      );
      ctx.restore();

      animFrameRef.current = requestAnimationFrame(tick);
    }

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [engine.gameStatus]);

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <canvas ref={bgCanvasRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
      <canvas ref={gameCanvasRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />

      <CustomHUD
        theme={theme}
        currentPrice={currentPrice}
        previousPrice={previousPrice}
        priceDirection={priceDirection}
        timeRemaining={engine.timeRemaining}
        secondsOnTarget={secondsOnTarget}
        totalPlaced={engine.ordersPlaced.reduce((sum, o) => sum + o.size, 0)}
        estimatedPnL={engine.totalPnL}
        health={engine.health}
        hitFlash={hitFlash}
        tradeLog={tradeLog}
      />

      {!isConnected && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          fontSize: 11, color: `${colors.accent}aa`, background: 'rgba(10,14,28,0.9)',
          padding: '4px 12px', borderRadius: 4, zIndex: 20,
        }}>
          Connecting to price feed...
        </div>
      )}
    </div>
  );
}
