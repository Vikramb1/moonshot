'use client';

/**
 * PriceLine — live price indicator rendered in the Three.js scene
 *
 * A thin horizontal plane that tracks the current BTC/USD price on the Y axis.
 * Its Y position is updated every frame by Game.tsx's updatePriceLine() call.
 *
 * Props:
 *   currentPrice    — current BTC/USD mid price from useLiquid
 *   previousPrice   — last tick's price (used to detect spikes)
 *   priceDirection  — 'up' | 'down' | 'neutral' (drives color and particle direction)
 *
 * Visual effects (all TODO — placeholder geometry + material in place):
 *
 * pulsing glow
 *   Soft breathing effect: line emissive intensity oscillates on a ~2s sine cycle.
 *   Implemented via a time uniform passed to a ShaderMaterial.
 *   TODO: write GLSL fragment shader reading uTime uniform.
 *
 * scanline
 *   A bright point travels from left to right along the line continuously.
 *   Leaves a fading trail behind it implemented as a texture or shader.
 *   TODO: implement as a separate Points geometry or GLSL scan animation.
 *
 * color based on price direction
 *   up      → cyan / blue  (#00ffff)
 *   down    → orange / red (#ff6b35)
 *   neutral → white / silver (#ffffff)
 *   Transitions smoothly between colors using THREE.Color.lerp each frame.
 *   TODO: implement lerp in useFrame once ShaderMaterial is ready.
 *
 * particle emitters
 *   Small Points geometry particles drift upward when price is rising,
 *   downward when falling. Particle positions updated each frame.
 *   TODO: implement particle system as a separate BufferGeometry.
 *
 * thickness pulse on spike
 *   When price moves > 0.1% in one tick, scaleY spikes to 3x then springs back.
 *   TODO: implement with a simple damped spring (useSpring or manual lerp).
 */

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MIN_Y, MAX_Y } from '@/lib/useGameEngine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Half-width of the price line plane in world units (spans visible frustum). */
const LINE_HALF_WIDTH = 50;

/** Base thickness of the price line plane. */
const LINE_BASE_HEIGHT = 0.04;

/** Price change percentage that triggers a thickness pulse. */
const SPIKE_THRESHOLD_PCT = 0.001;

/** Color for upward price movement. */
const COLOR_UP = new THREE.Color(0x00ffff);
/** Color for downward price movement. */
const COLOR_DOWN = new THREE.Color(0xff6b35);
/** Color for neutral movement. */
const COLOR_NEUTRAL = new THREE.Color(0xffffff);

interface PriceLineProps {
  currentPrice: number;
  previousPrice: number;
  priceDirection: 'up' | 'down' | 'neutral';
}

export default function PriceLine({ currentPrice, previousPrice, priceDirection }: PriceLineProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  // Current animated color (lerped toward target each frame)
  const currentColorRef = useRef<THREE.Color>(new THREE.Color(0xffffff));
  // Current scaleY for thickness pulse
  const scaleYRef = useRef<number>(1);
  // Pulse spring velocity
  const scaleVelocityRef = useRef<number>(0);

  // ---------------------------------------------------------------------------
  // Detect spike on price update
  // ---------------------------------------------------------------------------

  const prevPriceRef = useRef<number>(previousPrice);
  useEffect(() => {
    if (previousPrice === 0 || currentPrice === 0) return;
    const changePct = Math.abs(currentPrice - previousPrice) / previousPrice;
    if (changePct >= SPIKE_THRESHOLD_PCT) {
      // Kick the spring — will decay back to 1 in useFrame
      scaleVelocityRef.current += 2; // +2 gives scaleY a jump toward 3x
    }
    prevPriceRef.current = previousPrice;
  }, [currentPrice, previousPrice]);

  // ---------------------------------------------------------------------------
  // useFrame — animate per tick
  // ---------------------------------------------------------------------------

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current) return;

    const t = clock.getElapsedTime();

    // ---- Map current price to Y position ----
    // Uses the same mapPriceToY logic as the coin grid (defined inline here
    // to avoid importing from Game.tsx which would create a circular dep).
    if (currentPrice > 0) {
      const priceRange = currentPrice * 0.02;
      const low = currentPrice - priceRange;
      const high = currentPrice + priceRange;
      const norm = Math.max(0, Math.min(1, (currentPrice - low) / (high - low)));
      const targetY = MIN_Y + norm * (MAX_Y - MIN_Y);
      // Smooth Y movement
      meshRef.current.position.y +=
        (targetY - meshRef.current.position.y) * 0.1;
    }

    // ---- Pulsing glow via emissiveIntensity ----
    // TODO: replace with a ShaderMaterial uTime uniform approach for full control
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI); // 0 → 1 on ~2s cycle
    materialRef.current.emissiveIntensity = 0.4 + pulse * 0.8;

    // ---- Color lerp toward direction target ----
    const targetColor =
      priceDirection === 'up'
        ? COLOR_UP
        : priceDirection === 'down'
        ? COLOR_DOWN
        : COLOR_NEUTRAL;
    currentColorRef.current.lerp(targetColor, 0.05);
    materialRef.current.color.copy(currentColorRef.current);
    materialRef.current.emissive.copy(currentColorRef.current);

    // ---- Thickness pulse spring (scaleY) ----
    // Simple damped spring: F = -k*x - b*v where x = (scaleY - 1)
    const k = 12; // spring stiffness
    const b = 5;  // damping
    const displacement = scaleYRef.current - 1;
    const springForce = -k * displacement - b * scaleVelocityRef.current;
    scaleVelocityRef.current += springForce * 0.016; // assume ~60fps
    scaleYRef.current = Math.max(1, scaleYRef.current + scaleVelocityRef.current * 0.016);
    meshRef.current.scale.setY(scaleYRef.current);

    // TODO: scanline — move a bright point along X using a shader or sub-mesh
    // TODO: particle emitters — update particle positions based on priceDirection
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <group>
      {/* ---- Main price line plane ---- */}
      <mesh ref={meshRef} position={[0, 0, 0]}>
        <planeGeometry args={[LINE_HALF_WIDTH * 2, LINE_BASE_HEIGHT]} />
        {/**
         * Placeholder MeshStandardMaterial.
         * TODO: replace with ShaderMaterial for pulsing glow + scanline effects.
         * The ShaderMaterial should accept:
         *   uTime      — elapsed seconds for animation
         *   uColor     — vec3 color based on price direction
         *   uPulse     — 0..1 glow intensity
         */}
        <meshStandardMaterial
          ref={materialRef}
          color={0xffffff}
          emissive={0xffffff}
          emissiveIntensity={0.5}
          transparent
          opacity={0.9}
          depthWrite={false}
        />
      </mesh>

      {/*
       * TODO: scanline sub-mesh
       * A small bright PlaneGeometry traveling from left to right along the line.
       * Position updated each frame: scanX = ((t * SCAN_SPEED) % LINE_HALF_WIDTH*2) - LINE_HALF_WIDTH
       */}

      {/*
       * TODO: particle emitter Points geometry
       * Small particles spawned at line position, drifting up (price up) or down (price down).
       * Implemented as a BufferGeometry with positions updated each frame.
       */}
    </group>
  );
}
