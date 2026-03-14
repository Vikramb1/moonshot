'use client';

/**
 * Game — main Three.js game component
 *
 * Renders the game world via @react-three/fiber's <Canvas>.
 * useGameEngine is lifted here so HUD gets live data.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useMockPrice } from '@/lib/useMockPrice';
import { useGameEngine, MIN_Y, MAX_Y } from '@/lib/useGameEngine';
import HUD from './HUD';
import PriceLine from './PriceLine';
import type { Coin, GameParams, GameResult, Order } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCROLL_SPEED = 0.05;
const SHIP_SPEED = 0.15;
const COLLISION_RADIUS = 0.6;
const COIN_LOOKAHEAD = 15;
const COIN_SPAWN_OFFSET = 20;
const PRICE_RANGE_PCT = 0.02;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapPriceToY(priceLevel: number, currentPrice: number): number {
  if (currentPrice === 0) return 0;
  const priceRange = currentPrice * PRICE_RANGE_PCT;
  const low = currentPrice - priceRange;
  const high = currentPrice + priceRange;
  const t = Math.max(0, Math.min(1, (priceLevel - low) / (high - low)));
  return MIN_Y + t * (MAX_Y - MIN_Y);
}

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
// Scene (runs inside <Canvas>)
// ---------------------------------------------------------------------------

interface SceneProps {
  currentPrice: number;
  previousPrice: number;
  priceDirection: 'up' | 'down' | 'neutral';
  gameStatus: string;
  ordersPlaced: Order[];
  onCollectCoin: (coin: Coin, currentPrice: number) => void;
  onCheckEnd: (pnl: number) => void;
}

function Scene({
  currentPrice,
  previousPrice,
  priceDirection,
  gameStatus,
  ordersPlaced,
  onCollectCoin,
  onCheckEnd,
}: SceneProps) {
  const { camera } = useThree();

  const shipRef = useRef<THREE.Group>(null);
  const shipPosRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<Record<string, boolean>>({});
  const coinsRef = useRef<Coin[]>([]);
  const coinMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());

  // WASD input
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

  // Init coin grid when game starts playing
  useEffect(() => {
    if (gameStatus !== 'playing' || coinsRef.current.length > 0) return;
    if (currentPrice === 0) return;

    const initial: Coin[] = [];
    for (let i = 0; i < COIN_LOOKAHEAD; i++) {
      initial.push(generateCoin(0, currentPrice, i));
    }
    coinsRef.current = initial;
  }, [gameStatus, currentPrice]);

  // Main game loop
  useFrame(() => {
    if (gameStatus !== 'playing') return;

    // WASD movement
    if (keysRef.current['w']) {
      shipPosRef.current.y = Math.min(MAX_Y, shipPosRef.current.y + SHIP_SPEED);
    }
    if (keysRef.current['s']) {
      shipPosRef.current.y = Math.max(MIN_Y, shipPosRef.current.y - SHIP_SPEED);
    }

    // Auto-scroll right
    shipPosRef.current.x += SCROLL_SPEED;

    if (shipRef.current) {
      shipRef.current.position.set(shipPosRef.current.x, shipPosRef.current.y, 0);
    }

    camera.position.x = shipPosRef.current.x;

    // Spawn new coins
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

    // Collision detection
    const shipX = shipPosRef.current.x;
    const shipY = shipPosRef.current.y;

    coinsRef.current = coinsRef.current.map((coin) => {
      if (coin.collected) return coin;

      const dx = shipX - coin.position.x;
      const dy = shipY - coin.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < COLLISION_RADIUS) {
        const mesh = coinMeshesRef.current.get(coin.id);
        if (mesh) mesh.scale.setScalar(0);

        onCollectCoin({ ...coin, collected: true }, currentPrice);
        return { ...coin, collected: true };
      }
      return coin;
    });

    // Compute PnL from orders
    const pnl = ordersPlaced.reduce((sum, order) => {
      const diff = currentPrice - order.priceLevel;
      return sum + diff * order.size * (order.side === 'buy' ? 1 : -1);
    }, 0);

    onCheckEnd(pnl);
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 5]} intensity={1} color={0x00ccff} />

      {/* Ship */}
      <group ref={shipRef} position={[0, 0, 0]}>
        <mesh rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.3, 0.8, 8]} />
          <meshStandardMaterial color={0x00ccff} emissive={0x004466} />
        </mesh>
        <pointLight color={0x00ccff} intensity={2} distance={4} />
      </group>

      {/* Coins */}
      <group>
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

      {/* Price line */}
      <PriceLine
        currentPrice={currentPrice}
        previousPrice={previousPrice}
        priceDirection={priceDirection}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Game — exported component (owns engine + mock price)
// ---------------------------------------------------------------------------

interface GameProps {
  params: GameParams;
  onGameEnd: (result: GameResult) => void;
  onStartGame?: () => void;
}

export default function Game({ params, onGameEnd, onStartGame }: GameProps) {
  const { currentPrice, previousPrice, priceDirection, isConnected } = useMockPrice();
  const engine = useGameEngine(params);

  // Start game on mount
  useEffect(() => {
    engine.startGame();
    if (onStartGame) onStartGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire onGameEnd when engine signals end
  useEffect(() => {
    if (engine.gameStatus === 'ended' && engine.gameResult) {
      onGameEnd(engine.gameResult);
    }
  }, [engine.gameStatus, engine.gameResult, onGameEnd]);

  const handleCollectCoin = useCallback(
    (coin: Coin, price: number) => {
      engine.collectCoin(coin, price);
    },
    [engine.collectCoin],
  );

  const handleCheckEnd = useCallback(
    (pnl: number) => {
      engine.checkGameEndConditions(pnl);
    },
    [engine.checkGameEndConditions],
  );

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 60 }}
        style={{ background: '#0d1f2d' }}
      >
        <Scene
          currentPrice={currentPrice}
          previousPrice={previousPrice}
          priceDirection={priceDirection}
          gameStatus={engine.gameStatus}
          ordersPlaced={engine.ordersPlaced}
          onCollectCoin={handleCollectCoin}
          onCheckEnd={handleCheckEnd}
        />
      </Canvas>

      {/* HUD overlay with live engine data */}
      <HUD
        currentPrice={currentPrice}
        timeRemaining={engine.timeRemaining}
        coinsCollected={engine.coinsCollected.length}
        ordersPlaced={engine.ordersPlaced.length}
        estimatedPnL={engine.totalPnL}
        params={params}
      />

      {!isConnected && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-retro-orange bg-black/70 px-3 py-1 rounded">
          Connecting to price feed...
        </div>
      )}
    </div>
  );
}
