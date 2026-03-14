'use client';

/**
 * Game — main Three.js game component
 *
 * Renders the entire game world via @react-three/fiber's <Canvas>.
 * Owns the Three.js scene lifecycle and delegates game state to useGameEngine.
 * Reads live BTC price from useLiquid.
 *
 * Props:
 *   params     — GameParams from the lobby (duration, thresholds)
 *   onGameEnd  — callback fired when any end condition is met; receives GameResult
 *
 * Scene composition:
 *   <Starfield />    background stars
 *   <Ship />         player-controlled spaceship
 *   <CoinGrid />     collectible coins mapped to price levels
 *   <PriceLine />    live price indicator
 *   <HUD />          2D overlay (rendered outside <Canvas>)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useLiquid } from '@/lib/useLiquid';
import { useGameEngine, MIN_Y, MAX_Y } from '@/lib/useGameEngine';
import HUD from './HUD';
import PriceLine from './PriceLine';
import type { Coin, GameParams, GameResult } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How fast the ship auto-scrolls right per frame (world units). */
const SCROLL_SPEED = 0.05;

/** How far the ship moves per WASD keypress (world units). */
const SHIP_SPEED = 0.15;

/** Approximate collision radius for ship-coin bounding sphere check. */
const COLLISION_RADIUS = 0.6;

/** How many coins to keep ahead of the ship at all times. */
const COIN_LOOKAHEAD = 15;

/** How many world units ahead of the ship new coins should spawn. */
const COIN_SPAWN_OFFSET = 20;

/** Price range as a percentage of current price (±2%). */
const PRICE_RANGE_PCT = 0.02;

// ---------------------------------------------------------------------------
// Coin grid mapping helpers
// ---------------------------------------------------------------------------

/**
 * mapPriceToY
 *
 * Converts a Liquid price level to a Three.js Y coordinate.
 * The visible price range spans ±PRICE_RANGE_PCT around the current price,
 * linearly mapped onto [MIN_Y, MAX_Y] in world space.
 *
 * @param priceLevel   The specific price this coin represents.
 * @param currentPrice The live market price from useLiquid.
 * @returns            Y position in world coordinates.
 */
function mapPriceToY(priceLevel: number, currentPrice: number): number {
  if (currentPrice === 0) return 0;
  const priceRange = currentPrice * PRICE_RANGE_PCT;
  const low = currentPrice - priceRange;
  const high = currentPrice + priceRange;
  // Clamp to avoid coins spawning outside MIN_Y / MAX_Y
  const t = Math.max(0, Math.min(1, (priceLevel - low) / (high - low)));
  return MIN_Y + t * (MAX_Y - MIN_Y);
}

/**
 * mapYToPrice
 *
 * Inverse of mapPriceToY. Used to derive the price level from ship Y for HUD.
 *
 * @param y            World-space Y coordinate.
 * @param currentPrice Live market price from useLiquid.
 * @returns            Approximate Liquid price level.
 */
function mapYToPrice(y: number, currentPrice: number): number {
  if (currentPrice === 0) return currentPrice;
  const t = (y - MIN_Y) / (MAX_Y - MIN_Y);
  const priceRange = currentPrice * PRICE_RANGE_PCT;
  return currentPrice - priceRange + t * 2 * priceRange;
}

// ---------------------------------------------------------------------------
// generateCoin — creates a single new Coin
// ---------------------------------------------------------------------------

/**
 * generateCoin(shipX, currentPrice, index)
 *
 * Generates one Coin at a random price level within ±PRICE_RANGE_PCT of the
 * current market price, placed ahead of the ship on the X axis.
 *
 * Price levels are randomly sampled from the visible range so each coin
 * represents a real order price the player might place.
 *
 * @param shipX        Current ship X position (world units).
 * @param currentPrice Live BTC/USD price from useLiquid.
 * @param index        Stagger offset so coins don't all spawn at the same X.
 * @returns            A new uncollected Coin.
 */
function generateCoin(shipX: number, currentPrice: number, index: number): Coin {
  const priceRange = currentPrice * PRICE_RANGE_PCT;
  const priceLevel = currentPrice - priceRange + Math.random() * 2 * priceRange;
  const y = mapPriceToY(priceLevel, currentPrice);
  const x = shipX + COIN_SPAWN_OFFSET + index * 3;

  return {
    id: `coin-${Date.now()}-${index}-${Math.random()}`,
    priceLevel,
    position: { x, y, z: 0 },
    collected: false,
  };
}

// ---------------------------------------------------------------------------
// Inner Three.js scene (runs inside <Canvas>)
// ---------------------------------------------------------------------------

interface SceneProps {
  params: GameParams;
  onGameEnd: (result: GameResult) => void;
  currentPrice: number;
  previousPrice: number;
  priceDirection: 'up' | 'down' | 'neutral';
}

function Scene({ params, onGameEnd, currentPrice, previousPrice, priceDirection }: SceneProps) {
  const { camera } = useThree();
  const engine = useGameEngine(params);

  // Refs for scene objects (updated each frame — avoid re-renders)
  const shipRef = useRef<THREE.Group>(null);
  const shipPosRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<Record<string, boolean>>({});
  const coinsRef = useRef<Coin[]>([]);
  const coinMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const sceneRef = useRef<THREE.Scene | null>(null);
  const gameStartedRef = useRef(false);

  // Coin mesh parent group
  const coinGroupRef = useRef<THREE.Group>(null);

  // ---------------------------------------------------------------------------
  // initStarfield
  // ---------------------------------------------------------------------------

  /**
   * initStarfield()
   *
   * Creates a Points geometry with 2000 randomly positioned stars that drift
   * slowly to the left each frame, giving a sense of forward momentum.
   *
   * Stars are positioned in a large box centered at the origin.
   * Each frame, X positions are decremented slightly; stars that pass
   * behind the camera wrap around to the far end.
   *
   * Returns a THREE.Points object to be added to the scene.
   *
   * TODO: implement star drift animation in useFrame
   * TODO: use additive blending on the material for a glowing effect
   */
  const starfieldRef = useRef<THREE.Points | null>(null);

  useEffect(() => {
    // Placeholder: 2000 stars in a 200-unit cube
    const count = 2000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 50;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, sizeAttenuation: true });
    starfieldRef.current = new THREE.Points(geo, mat);
    // TODO: add to scene via ref
  }, []);

  // ---------------------------------------------------------------------------
  // handleWASD — FULLY IMPLEMENTED
  // ---------------------------------------------------------------------------

  /**
   * handleWASD()
   *
   * Registers keydown and keyup listeners on mount.
   * W key moves the ship up (positive Y); S key moves it down (negative Y).
   * A and D are captured but currently no-ops (reserved for future strafing).
   * Ship Y is clamped between MIN_Y and MAX_Y by updateShipPosition().
   *
   * Uses a keysRef (not state) to avoid triggering re-renders on every frame.
   * The actual position update is applied in the useFrame loop for smooth 60fps
   * movement rather than discrete per-event jumps.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Coin grid initialisation
  // ---------------------------------------------------------------------------

  /**
   * initCoinGrid()
   *
   * Seeds the initial coin array when the game starts playing.
   * Generates COIN_LOOKAHEAD coins spread ahead of the ship's starting position.
   * Each coin's Y position is derived from a random price level in the ±2% range.
   *
   * TODO: replace Math.random() price levels with a seeded distribution that
   *       guarantees roughly equal buy and sell opportunities.
   */
  useEffect(() => {
    if (engine.gameStatus !== 'playing' || coinsRef.current.length > 0) return;
    if (currentPrice === 0) return;

    const initial: Coin[] = [];
    for (let i = 0; i < COIN_LOOKAHEAD; i++) {
      initial.push(generateCoin(0, currentPrice, i));
    }
    coinsRef.current = initial;
    gameStartedRef.current = true;
  }, [engine.gameStatus, currentPrice]);

  // Start game on mount
  useEffect(() => {
    engine.startGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire onGameEnd when engine signals end
  useEffect(() => {
    if (engine.gameStatus === 'ended' && engine.gameResult) {
      onGameEnd(engine.gameResult);
    }
  }, [engine.gameStatus, engine.gameResult, onGameEnd]);

  // ---------------------------------------------------------------------------
  // useFrame — main game loop
  // ---------------------------------------------------------------------------

  useFrame(() => {
    if (engine.gameStatus !== 'playing') return;

    // ---- handleWASD (applied each frame for smooth movement) ----------------

    if (keysRef.current['w']) {
      shipPosRef.current.y = Math.min(MAX_Y, shipPosRef.current.y + SHIP_SPEED);
    }
    if (keysRef.current['s']) {
      shipPosRef.current.y = Math.max(MIN_Y, shipPosRef.current.y - SHIP_SPEED);
    }
    // A and D: no-op (reserved)

    // ---- autoScrollShip -----------------------------------------------------

    /**
     * autoScrollShip()
     *
     * Moves the ship rightward at SCROLL_SPEED world units per frame.
     * Moves the camera to follow the ship so the ship stays centered.
     * Triggers new coin generation when the lookahead window shrinks.
     *
     * TODO: tie SCROLL_SPEED to a configurable speed param from GameParams.
     * TODO: spawn coins from a deterministic seed for replay support.
     */
    shipPosRef.current.x += SCROLL_SPEED;

    // Apply position to ship mesh
    if (shipRef.current) {
      shipRef.current.position.set(shipPosRef.current.x, shipPosRef.current.y, 0);
    }

    // Camera follows ship on X axis
    camera.position.x = shipPosRef.current.x;

    // Spawn new coins to maintain lookahead
    const ahead = coinsRef.current.filter(
      (c) => !c.collected && c.position.x > shipPosRef.current.x,
    );
    if (ahead.length < COIN_LOOKAHEAD && currentPrice > 0) {
      const maxX = coinsRef.current.reduce((m, c) => Math.max(m, c.position.x), 0);
      const newCoin = generateCoin(
        Math.max(shipPosRef.current.x, maxX - COIN_SPAWN_OFFSET),
        currentPrice,
        coinsRef.current.length,
      );
      coinsRef.current = [...coinsRef.current, newCoin];
    }

    // ---- updatePriceLine ----------------------------------------------------

    /**
     * updatePriceLine()
     *
     * Maps the live currentPrice to a Y world coordinate and positions
     * the price line mesh there each frame.
     * The line spans the full X width of the camera frustum.
     *
     * TODO: pass priceLineRef to <PriceLine /> as a forwardRef so this
     *       component can set its Y directly without a React re-render.
     */
    // TODO: update price line Y via ref when PriceLine exposes one

    // ---- checkCollisions — FULLY IMPLEMENTED --------------------------------

    /**
     * checkCollisions()
     *
     * For every uncollected coin, computes the 3D distance between the ship's
     * world-space center and the coin's center.
     * If the distance is within COLLISION_RADIUS, the coin is collected:
     *   1. coin.collected is set to true in coinsRef
     *   2. collectCoin() is called, which fires the order POST to the backend
     *   3. The coin mesh is hidden immediately (scale to 0) pending removal
     *
     * Uses a simple bounding sphere check (no physics engine needed at this scale).
     * TODO: add a particle burst effect at the collision point.
     */
    const shipX = shipPosRef.current.x;
    const shipY = shipPosRef.current.y;

    coinsRef.current = coinsRef.current.map((coin) => {
      if (coin.collected) return coin;

      const dx = shipX - coin.position.x;
      const dy = shipY - coin.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < COLLISION_RADIUS) {
        // Hide mesh immediately
        const mesh = coinMeshesRef.current.get(coin.id);
        if (mesh) mesh.scale.setScalar(0);

        // Fire order (async — game does not wait for it)
        void engine.collectCoin({ ...coin, collected: true }, currentPrice);

        return { ...coin, collected: true };
      }
      return coin;
    });

    // ---- checkGameEndConditions — FULLY IMPLEMENTED -------------------------
    engine.checkGameEndConditions(engine.totalPnL);
  });

  // ---------------------------------------------------------------------------
  // Render — Three.js JSX
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Ambient light */}
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 5]} intensity={1} color={0x00ccff} />

      {/* ---- Ship ---- */}
      {/**
       * initShip()
       * Placeholder geometry: a cone pointing right (+X).
       * TODO: replace with a custom low-poly spaceship mesh.
       * TODO: attach a PointLight to the ship group for glow.
       * TODO: add a particle trail system emitting from the ship's rear.
       */}
      <group ref={shipRef} position={[0, 0, 0]}>
        <mesh rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.3, 0.8, 8]} />
          <meshStandardMaterial color={0x00ccff} emissive={0x004466} />
        </mesh>
        {/* Glow point light attached to ship */}
        <pointLight color={0x00ccff} intensity={2} distance={4} />
      </group>

      {/* ---- Coin grid ---- */}
      {/**
       * initCoinGrid()
       * Renders each coin in coinsRef as a torus mesh.
       * Tori spin slowly around the Z axis each frame (TODO: animate in useFrame).
       * TODO: use instanced meshes for performance with many coins.
       * TODO: add a glow material / emissive color keyed to buy (cyan) vs sell (orange).
       */}
      <group ref={coinGroupRef}>
        {coinsRef.current
          .filter((c) => !c.collected)
          .map((coin) => (
            <mesh
              key={coin.id}
              position={[coin.position.x, coin.position.y, coin.position.z]}
              ref={(mesh) => {
                if (mesh) coinMeshesRef.current.set(coin.id, mesh);
                else coinMeshesRef.current.delete(coin.id);
              }}
            >
              <torusGeometry args={[0.3, 0.08, 8, 24]} />
              <meshStandardMaterial
                color={coin.priceLevel >= currentPrice ? 0x00ffff : 0xff6b35}
                emissive={coin.priceLevel >= currentPrice ? 0x004444 : 0x441100}
              />
            </mesh>
          ))}
      </group>

      {/* ---- Price line ---- */}
      <PriceLine
        currentPrice={currentPrice}
        previousPrice={previousPrice}
        priceDirection={priceDirection}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Game — exported component
// ---------------------------------------------------------------------------

interface GameProps {
  params: GameParams;
  onGameEnd: (result: GameResult) => void;
}

export default function Game({ params, onGameEnd }: GameProps) {
  const { currentPrice, previousPrice, priceDirection, isConnected } = useLiquid('BTC-PERP');

  // HUD state — passed down from engine via Scene (lifted here for overlay)
  // TODO: lift useGameEngine here so HUD can read from it directly
  const [hudData] = useState({
    coinsCollected: 0,
    ordersPlaced: 0,
    estimatedPnL: 0,
    timeRemaining: params.duration,
  });

  return (
    <div className="relative w-full h-full">
      {/* Three.js Canvas */}
      <Canvas
        camera={{ position: [0, 0, 10], fov: 60 }}
        style={{ background: '#000008' }}
      >
        <Scene
          params={params}
          onGameEnd={onGameEnd}
          currentPrice={currentPrice}
          previousPrice={previousPrice}
          priceDirection={priceDirection}
        />
      </Canvas>

      {/* HUD overlay (2D, rendered outside canvas) */}
      <HUD
        currentPrice={currentPrice}
        timeRemaining={hudData.timeRemaining}
        coinsCollected={hudData.coinsCollected}
        ordersPlaced={hudData.ordersPlaced}
        estimatedPnL={hudData.estimatedPnL}
        params={params}
      />

      {/* Connection indicator */}
      {!isConnected && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-orange-400 bg-black/70 px-3 py-1 rounded">
          Connecting to price feed…
        </div>
      )}
    </div>
  );
}
