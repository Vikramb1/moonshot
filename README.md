# MOONSHOT

**The world's first generative game-engine powered by Liquid. Trade like never before.**

---

## The Problem

Trading terminals are intimidating.

Candlestick charts, order books, liquidation ladders — they're powerful tools, but they create a massive barrier for anyone trying to understand how markets actually move. Most people don't learn to trade because the interface punishes them before they even place their first order.

We asked: *what if you could feel a price feed instead of just watching it?*

---

## What It Does

Moonshot maps a live crypto price stream into a real-time arcade game. You control a character — a spaceship, a surfer, or anything you can describe — and your vertical position on screen becomes your market prediction. Every second, the engine reads your position relative to the price line and fires a real 25× leveraged market order in that direction on the Liquid exchange.

**The market becomes the level. Your PnL becomes your score.**

### Core Mechanic — Tilt-Based Conviction Trading

A live price line scrolls across the screen in real time, fed by a sub-second WebSocket connection to Hyperliquid. You move your character with W/S or Arrow Keys. Your velocity creates a tilt angle — the engine's trade signal:

| Tilt | Conviction | Trade Fired |
|------|-----------|-------------|
| Tilting **upward** (moving up) | Price going **up** | Opens a **long** |
| Tilting **downward** (moving down) | Price going **down** | Opens a **short** |
| Neutral (in the safe zone) | No conviction | No trade, stamina regenerates |

A safe zone band tracks the price line. Staying inside it keeps you alive. Drifting away is where the money is made — or lost. Obstacles spawn everywhere *except* the safe zone, representing the noise you have to navigate through to hold your conviction.

### Three Game Modes

```
                            ┌─────────────────────────────────────┐
                            │             MOONSHOT                │
                            │    Generative Trading Game Engine   │
                            └──────┬──────────┬──────────┬────────┘
                                   │          │          │
                  ┌────────────────▼──┐  ┌────▼───────┐  ┌▼─────────────────┐
                  │   Orbit Space     │  │ Surf Shark  │  │ Describe a Game  │
                  │                   │  │             │  │                  │
                  │ Spaceship dodging │  │ Surfer      │  │ AI-generated     │
                  │ asteroids through │  │ riding the  │  │ avatar, world &  │
                  │ a star grid       │  │ price wave, │  │ obstacles from   │
                  │                   │  │ dodging     │  │ text prompts     │
                  │ Theme: pixel-     │  │ sharks      │  │                  │
                  │ retro orange      │  │             │  │ Claude generates │
                  │                   │  │ Theme:      │  │ Canvas 2D code   │
                  │ Config: Mission   │  │ ocean teal  │  │ at runtime       │
                  │ Control           │  │             │  │                  │
                  │                   │  │ Config:     │  │ Theme: forest    │
                  │                   │  │ Surf        │  │ green            │
                  │                   │  │ Station     │  │                  │
                  │                   │  │             │  │ Config: Game     │
                  │                   │  │             │  │ Studio (2-screen │
                  │                   │  │             │  │ wizard)          │
                  └───────────────────┘  └─────────────┘  └──────────────────┘
```

**Orbit Space** — The flagship mode. Pilot a spaceship through a star grid, dodge rotating asteroids, and ride the price feed. Pick your asset (BTC, ETH, SOL, DOGE), set your duration and position size, and launch from Mission Control.

**Surf Shark** — Same trading engine, ocean theme. You're a surfer riding the price wave, dodging sharks. Configure your session at the Surf Station.

**Describe a Game** — The generative mode. Type three descriptions — your avatar, your background, your obstacles — and Claude generates Canvas 2D drawing functions from pure text. A "Mario Kart racer dodging banana peels on Rainbow Road" becomes a playable trading game in seconds. The AI writes actual JavaScript rendering code that runs at 60fps.

---

## System Architecture

### High-Level Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js 15)                        │
│                     HTML Canvas 2D · 60fps · TypeScript              │
│                                                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────────────┐    │
│  │  / Landing   │   │  /lobby      │   │  /custom/create       │    │
│  │  Mode Select │   │  Mission     │   │  Game Studio          │    │
│  │              │   │  Control     │   │  (2-screen wizard)    │    │
│  └──────┬───────┘   └──────┬───────┘   └───────────┬───────────┘    │
│         │                  │                       │                 │
│         ▼                  ▼                       ▼                 │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────────────┐    │
│  │  /surf/lobby │   │  /game       │   │  /custom/game         │    │
│  │  Surf        │   │  Game.tsx    │   │  CustomGame.tsx       │    │
│  │  Station     │   │  ~850 lines  │   │  ~740 lines           │    │
│  └──────┬───────┘   │  Spaceship + │   │  AI-generated render  │    │
│         │           │  Asteroids   │   └───────────┬───────────┘    │
│         ▼           └──────┬───────┘               │                │
│  ┌──────────────┐          │                       │                │
│  │  /surf/game  │          │                       │                │
│  │  SurfGame    │          │                       │                │
│  │  .tsx        │          │                       │                │
│  │  ~930 lines  │          │                       │                │
│  │  Surfer +    │          │                       │                │
│  │  Sharks      │          │                       │                │
│  └──────┬───────┘          │                       │                │
│         │                  │                       │                │
│         └──────────────────┼───────────────────────┘                │
│                            │                                        │
│                     ┌──────▼───────┐                                │
│                     │ Shared Hooks │                                │
│                     │              │                                │
│                     │ useGameEngine│  State machine + lifecycle     │
│                     │ useLiquid    │  WebSocket price feed          │
│                     │ useMockPrice │  Offline fallback              │
│                     └──────┬───────┘                                │
└────────────────────────────┼────────────────────────────────────────┘
                             │
              WebSocket (price ticks) + REST (trades, themes)
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      Backend (FastAPI + uv)                        │
│                                                                     │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │                    WebSocket Endpoints                     │    │
│   │                                                            │    │
│   │   /ws/price/{symbol}        Sub-second allMids relay       │    │
│   │   /ws/price-stream/{symbol} Liquid REST polling (legacy)   │    │
│   └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │                      REST Endpoints                        │    │
│   │                                                            │    │
│   │   POST /api/trade            Market order → 500ms close    │    │
│   │   POST /api/generate-theme   Claude theme generation       │    │
│   │   POST /api/place-order      Direct limit order            │    │
│   │   POST /api/close-all        Emergency kill switch         │    │
│   │   GET  /api/account          Balance & equity              │    │
│   └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│   ┌─────────────────────┐  ┌──────────────┐  ┌────────────────┐    │
│   │  Hyperliquid WS     │  │ Liquid REST   │  │ Anthropic API  │    │
│   │  (price feed)       │  │ (orders)      │  │ (themes)       │    │
│   │  allMids channel    │  │ HMAC-SHA256   │  │ Claude Sonnet  │    │
│   │  sub-second latency │  │ 25× leverage  │  │ Canvas 2D gen  │    │
│   └─────────────────────┘  └──────────────┘  └────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Dual Exchange Bridge

The exchange we trade on (Liquid) doesn't offer a fast WebSocket price feed. So we built a bridge — prices stream in from Hyperliquid's `allMids` WebSocket at sub-second latency, while orders execute on Liquid's REST API with HMAC-SHA256 authentication.

```
  Hyperliquid              Backend               Frontend              Liquid
  (price feed)           (FastAPI)          (Canvas @ 60fps)         (exchange)
      │                      │                      │                     │
      │  allMids tick        │                      │                     │
      │  (sub-second)        │                      │                     │
      ├─────────────────────►│                      │                     │
      │                      │  WS: {price,         │                     │
      │                      │   direction,          │                     │
      │                      │   timestamp}          │                     │
      │                      ├─────────────────────►│                     │
      │                      │                      │                     │
      │                      │                      │ Interpolate price   │
      │                      │                      │ (4-frame lerp)      │
      │                      │                      │                     │
      │                      │                      │ Render frame        │
      │                      │                      │ Check tilt angle    │
      │                      │                      │                     │
      │                      │                      │ Every 1s, if        │
      │                      │                      │ |tilt| > 0.01:      │
      │                      │                      │                     │
      │                      │   POST /api/trade    │                     │
      │                      │   {symbol, side,      │                     │
      │                      │    size, leverage:25}  │                     │
      │                      │◄─────────────────────┤                     │
      │                      │                      │                     │
      │                      │     Market order (buy/sell)                │
      │                      ├───────────────────────────────────────────►│
      │                      │                      │   Order confirmed   │
      │                      │◄────────────────────────────────────────── │
      │                      │                      │                     │
      │                      │  {success, order_id,  │                     │
      │                      │   closes_in_ms: 500}  │                     │
      │                      ├─────────────────────►│                     │
      │                      │                      │                     │
      │                      │  asyncio.sleep(0.5)  │                     │
      │                      │                      │                     │
      │                      │     Opposite market order (auto-close)    │
      │                      ├───────────────────────────────────────────►│
      │                      │                      │                     │
```

---

## The Game Loop — 60fps Render Pipeline

Every game component runs a single `requestAnimationFrame` loop that processes physics, trading logic, and rendering in one tick. Game state lives in React refs — not `useState` — to prevent re-renders from killing frame rate.

```
    ┌──────────────────────────────────────────────────────────────┐
    │              requestAnimationFrame(tick)                      │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  1. PRICE INTERPOLATION                                      │
    │     4-frame lerp smoothing of WebSocket price ticks           │
    │     Eliminates network jitter → fluid price line              │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  2. DYNAMIC RESCALING                                        │
    │     Trigger at ±20% of visible range edge                    │
    │     Animate new range over 20 frames (lerp min/max)          │
    │     Remap entire price history buffer in same frame           │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  3. CHARACTER PHYSICS                                        │
    │     Velocity: INITIAL_SPEED=2.2 → MAX_SPEED=6.5 px/frame    │
    │     Acceleration ramp: lerp(vel, target, 0.06)               │
    │     Boundary clamping: 60px from top/bottom edges            │
    │     Tilt angle: clamp(velocity * 0.18, -0.55, 0.55)         │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  4. SAFE ZONE DETECTION                                      │
    │     ±32px band centered on current price Y-position          │
    │     Inside: stamina holds, shield alpha increases             │
    │     Outside: health drains at -0.04/frame                    │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  5. OBSTACLE MANAGEMENT                                      │
    │     Spawn interval: 28 frames → 20 → 14 (escalating)        │
    │     Collision: distance < radius + 8px → 15 damage           │
    │     Excluded from safe zone (±80px clearance)                │
    │     Proximity glow: intensity scales within 200px range      │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  6. TRADE SIGNAL GENERATION                                  │
    │     Every 1s: if |tiltAngle| > 0.01 → fire order             │
    │     tilt < 0 → long (buy)  ·  tilt > 0 → short (sell)       │
    │     Order: {coinId, priceLevel, size, side, timestamp}       │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  7. PnL AGGREGATION                                          │
    │     For each order: (currentPrice - entryPrice) / entryPrice │
    │       × positionSize × 25 (leverage) × direction             │
    │     Sum across all open orders → totalPnL                    │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  8. END CONDITION CHECK                                      │
    │     health ≤ 0       → endGame('health')                     │
    │     timeRemaining ≤ 0 → endGame('time')                      │
    │     PnL ≥ threshold  → endGame('profit')                     │
    │     PnL ≤ -threshold → endGame('loss')                       │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  9. RENDER — BACKGROUND CANVAS (z-index: 0)                  │
    │     Orbit: grid lines, star particles, scan effect           │
    │     Surf: ocean gradient, wave lines                         │
    │     Custom: AI-generated bgCtx drawing code                  │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  10. RENDER — GAME CANVAS (z-index: 1)                       │
    │      Price line (quadratic bezier + neon glow + fill)         │
    │      Safe zone (dashed borders + fill + corner brackets)     │
    │      Obstacles (asteroids / sharks / AI-generated)           │
    │      Character (ship / surfer / AI-generated + shield ring)  │
    │      Trail particles, floating text, flash effects           │
    │      Darkness wall (gradient fade from character → right)    │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  11. HUD OVERLAY (React DOM, z-index: 10)                    │
    │      Price display + direction arrow          (top-left)     │
    │      Stamina / hull health bar                (top-center)   │
    │      Countdown timer                          (top-right)    │
    │      Trade stats (on-target time, placed)     (bottom-left)  │
    │      Estimated PnL readout                    (bottom-right) │
    │      Trade log (last 8 orders)                (bottom)       │
    │      Price axis ladder                        (right edge)   │
    └──────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
                        (next frame)
```

### Price Line Rendering

The price line is the core visual. It renders as a smooth quadratic bezier curve with a neon glow, pulling from a rolling buffer of Y-coordinates. When price drifts too close to the canvas edge, the visible range dynamically rescales over 20 frames:

$$y_{\text{pixel}} = y_{\text{bottom}} - \frac{p - p_{\min}}{p_{\max} - p_{\min}} \cdot (y_{\text{bottom}} - y_{\text{top}})$$

The visible range is asset-specific — BTC uses ±0.03% (~$25 at $84k) while SOL uses ±0.1% — so micro-movements in any asset produce the same visual drama on screen.

### PnL Calculation at 25× Leverage

Small floating-point errors in price mapping get amplified 25×. PnL is aggregated across all open orders every frame:

$$\text{PnL} = \sum_{i} \frac{p_{\text{current}} - p_i}{p_i} \times s_i \times 25 \times d_i$$

where $p_i$ is entry price, $s_i$ is position size, and $d_i \in \{-1, +1\}$ is direction.

---

## Game Engine State Machine

The `useGameEngine` hook manages the full game lifecycle — a finite state machine with ref-mirrored state for zero-latency access from the render loop.

```
                              ┌───────────┐
                              │   IDLE    │
                              └─────┬─────┘
                                    │ startGame()
                                    ▼
                      ┌─────────────────────────────┐
                      │          PLAYING             │
                      │                              │
                      │  ┌────────────────────────┐  │
                      │  │      TICK LOOP         │  │
                      │  │                        │  │
                      │  │  ┌──────────────────┐  │  │
                      │  │  │ Check Health     │──┼──┼──► health ≤ 0
                      │  │  └────────┬─────────┘  │  │      │
                      │  │           ▼            │  │      │
                      │  │  ┌──────────────────┐  │  │      │
                      │  │  │ Check Timer      │──┼──┼──► time ≤ 0
                      │  │  └────────┬─────────┘  │  │      │
                      │  │           ▼            │  │      │
                      │  │  ┌──────────────────┐  │  │      │
                      │  │  │ Check PnL        │──┼──┼──► profit/loss
                      │  │  │ Thresholds       │  │  │   threshold
                      │  │  └────────┬─────────┘  │  │      │
                      │  │           │            │  │      │
                      │  │           ▼            │  │      │
                      │  │     (next frame)       │  │      │
                      │  └────────────────────────┘  │      │
                      └──────────────────────────────┘      │
                                                            │
                              ┌─────────────────────────────┘
                              │
                              ▼
                      ┌───────────────┐
                      │    ENDED      │
                      │               │
                      │  endReason:   │
                      │  · time       │
                      │  · health     │
                      │  · profit     │
                      │  · loss       │
                      │               │
                      │  GameResult   │
                      │  ──────────   │
                      │  ordersPlaced │
                      │  netDirection │
                      │  totalSize    │
                      │  totalPnL     │
                      │  duration     │
                      └───────┬───────┘
                              │
                              ▼
                      ┌───────────────┐
                      │ Reveal Screen │
                      └───────────────┘
```

---

## Order Execution Flow

Every trade is a zero-duration spike — market order in, opposite market order out 500ms later. No position holding. The backend handles retries and fallback closure.

```
┌─────────────────────────────── Frontend ──────────────────────────────────┐
│                                                                           │
│   Character tilt > 0.01                                                   │
│         │                                                                 │
│         ▼ (every 1s)                                                      │
│   ┌─────────────────────┐                                                 │
│   │ Generate trade       │                                                │
│   │ signal               │                                                │
│   │                      │                                                │
│   │ tilt < 0 → long      │                                                │
│   │ tilt > 0 → short     │                                                │
│   └──────────┬───────────┘                                                │
│              │                                                            │
│              ▼                                                            │
│   ┌──── Paper or Live? ────┐                                              │
│   │                        │                                              │
│   ▼                        ▼                                              │
│  PAPER                   LIVE                                             │
│  Record in               POST /api/trade ─────────────────────────────────┤
│  ordersRef               {symbol, side, size, leverage: 25}               │
│  (local only)                                                             │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────── Backend ───────────────────────────────────┐
│                                                                           │
│   ┌────────────────────────────┐                                          │
│   │ Open market order          │                                          │
│   │ 25× leverage               │ ──── HMAC-SHA256 ────► Liquid Exchange   │
│   └────────────┬───────────────┘                              │           │
│                │                                              │           │
│                ▼                                              │           │
│   ┌────────────────────────────┐                              │           │
│   │ asyncio.sleep(0.5)         │        Order confirmed ◄─────┘           │
│   │ (500ms hold)               │                                          │
│   └────────────┬───────────────┘                                          │
│                │                                                          │
│                ▼                                                          │
│   ┌────────────────────────────┐                                          │
│   │ Close with opposite order  │ ──── HMAC-SHA256 ────► Liquid Exchange   │
│   └────────────┬───────────────┘                                          │
│                │                                                          │
│           ┌────▼────┐                                                     │
│           │ Success? │                                                    │
│           └────┬────┘                                                     │
│           No   │   Yes                                                    │
│           │    │    └──► Position closed                                   │
│           ▼    │                                                          │
│   ┌────────────────┐                                                      │
│   │ Retry up to 3× │                                                      │
│   └───────┬────────┘                                                      │
│      Still│failing                                                        │
│           ▼                                                               │
│   ┌──────────────────────┐                                                │
│   │ Fallback:            │                                                │
│   │ close_position()     │                                                │
│   │ (emergency closure)  │                                                │
│   └──────────────────────┘                                                │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## AI Theme Generation Pipeline

The "Describe a Game" mode uses Claude to generate real Canvas 2D rendering code from natural language. A 400-line system prompt with reference implementations ensures quality output.

```
  User              Game Studio           Backend            Claude            localStorage
   │                (2-screen)           (FastAPI)          (Sonnet)
   │                    │                    │                  │                    │
   │  Screen 1:         │                    │                  │                    │
   │  avatar desc       │                    │                  │                    │
   │  background desc   │                    │                  │                    │
   │  obstacle desc     │                    │                  │                    │
   ├───────────────────►│                    │                  │                    │
   │                    │                    │                  │                    │
   │  Screen 2:         │                    │                  │                    │
   │  asset, duration,  │                    │                  │                    │
   │  position size,    │                    │                  │                    │
   │  trading mode      │                    │                  │                    │
   ├───────────────────►│                    │                  │                    │
   │                    │                    │                  │                    │
   │                    │  POST /api/        │                  │                    │
   │                    │  generate-theme    │                  │                    │
   │                    │  {avatar, bg,      │                  │                    │
   │                    │   obstacles}       │                  │                    │
   │                    ├───────────────────►│                  │                    │
   │                    │                    │                  │                    │
   │                    │                    │  System prompt   │                    │
   │                    │                    │  (400 lines) +   │                    │
   │                    │                    │  user descs      │                    │
   │                    │                    ├─────────────────►│                    │
   │                    │                    │                  │                    │
   │                    │                    │                  │ Generate 3 Canvas  │
   │                    │                    │                  │ 2D function bodies │
   │                    │                    │                  │ + color palette    │
   │                    │                    │                  │ + labels           │
   │                    │                    │                  │ (15-30+ draw calls │
   │                    │                    │                  │  per function)     │
   │                    │                    │                  │                    │
   │                    │                    │   Raw JSON       │                    │
   │                    │                    │◄─────────────────┤                    │
   │                    │                    │                  │                    │
   │                    │  {drawAvatar,      │                  │                    │
   │                    │   drawObstacle,    │                  │                    │
   │                    │   drawBackground,  │                  │                    │
   │                    │   colors, labels}  │                  │                    │
   │                    │◄───────────────────┤                  │                    │
   │                    │                    │                  │                    │
   │                    │  Save theme ──────────────────────────────────────────────►│
   │                    │                    │                  │                    │
   │                    │  Navigate to       │                  │                    │
   │                    │  /custom/game      │                  │                    │
   │                    │  ?id=theme_id      │                  │                    │
   │                    │                    │                  │                    │
```

### Theme Execution Safety

Every Claude-generated draw function is sandboxed with two layers of error boundaries:

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Theme Execution Pipeline                            │
│                                                                        │
│   ┌──────────────────────────────────┐                                 │
│   │  Generated function body         │                                 │
│   │  (string from Claude)            │                                 │
│   └──────────────┬───────────────────┘                                 │
│                  │                                                      │
│                  ▼                                                      │
│   ┌──────────────────────────────────┐    ┌─────────────────────────┐  │
│   │  new Function(                   │    │                         │  │
│   │    'ctx', 'frame', 'tilt',       │───►│  FALLBACK (Layer 1)    │  │
│   │    body                          │err │  Constructor failed     │  │
│   │  )                               │    │  → colored circle       │  │
│   └──────────────┬───────────────────┘    └─────────────────────────┘  │
│             OK   │                                                      │
│                  ▼                                                      │
│   ┌──────────────────────────────────┐    ┌─────────────────────────┐  │
│   │  Execute in game loop            │    │                         │  │
│   │  (called 60× per second)         │───►│  FALLBACK (Layer 2)    │  │
│   │                                  │err │  Runtime error          │  │
│   │  try { fn(ctx, frame, tilt) }    │    │  → colored circle       │  │
│   │  catch { fallback }              │    │  (per-frame try-catch)  │  │
│   └──────────────┬───────────────────┘    └─────────────────────────┘  │
│             OK   │                                                      │
│                  ▼                                                      │
│   ┌──────────────────────────────────┐                                 │
│   │  Canvas 2D rendering             │                                 │
│   │  at 60fps                        │                                 │
│   │  ✓ Game never crashes            │                                 │
│   └──────────────────────────────────┘                                 │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Frontend Component Architecture

```
┌────────────────────────────── App Router Pages ──────────────────────────┐
│                                                                          │
│  /                    /lobby              /surf/lobby        /custom/     │
│  Landing Page         Mission Control     Surf Station       create      │
│  (mode select)        (Orbit config)      (Surf config)     Game Studio  │
│                                                             (wizard)     │
└────┬──────────────────────┬────────────────────┬────────────────┬────────┘
     │                      │                    │                │
     │              ┌───────▼──────┐     ┌───────▼──────┐ ┌──────▼───────┐
     │              │   /game      │     │  /surf/game  │ │ /custom/game │
     │              └───────┬──────┘     └───────┬──────┘ └──────┬───────┘
     │                      │                    │               │
     │         ┌────────────▼─────────┐ ┌────────▼────────┐ ┌───▼──────────┐
     │         │ Game.tsx  (~850 ln)  │ │ SurfGame.tsx    │ │ CustomGame   │
     │         │ Spaceship + Asteroid │ │ (~930 ln)       │ │ .tsx (~740)  │
     │         │ Canvas renderer      │ │ Surfer + Sharks │ │ AI-generated │
     │         │                      │ │ Canvas renderer │ │ Canvas render│
     │         └──┬─────────┬─────┬──┘ └──┬──────┬────┬──┘ └──┬────┬──┬──┘
     │            │         │     │        │      │    │        │    │  │
     │            │    ┌────▼─┐   │        │ ┌────▼──┐ │        │ ┌──▼──▼─┐
     │            │    │HUD   │   │        │ │Surf   │ │        │ │Custom │
     │            │    │.tsx  │   │        │ │HUD    │ │        │ │HUD    │
     │            │    └──────┘   │        │ │.tsx   │ │        │ │.tsx   │
     │            │               │        │ └───────┘ │        │ └───────┘
     │            │               │        │           │        │
     │         ┌──▼───────────────▼────────▼───────────▼────────▼──┐
     │         │              Shared Hooks                         │
     │         │                                                   │
     │         │  useGameEngine.ts  ─── State machine + lifecycle  │
     │         │  useLiquid.ts      ─── WebSocket price feed       │
     │         │  useMockPrice.ts   ─── Offline mock price fallback│
     │         └───────────────────────────────────────────────────┘
     │
     │         ┌───────────────────────────────────────────────────┐
     │         │              Reveal Screens                       │
     │         │                                                   │
     │         │  RevealScreen.tsx      ─── Orbit Space results    │
     │         │  SurfRevealScreen.tsx  ─── Surf Shark results     │
     │         │  CustomRevealScreen.tsx ── Custom game results    │
     │         └───────────────────────────────────────────────────┘
```

### Double Canvas Rendering Stack

Each game mode uses two stacked canvases for rendering performance — a background layer for atmospheric elements and a game layer for dynamic objects:

```
┌──────────────────────────────────────────────────────────────────────┐
│  z:10  │  Price Axis (React DOM)                                     │
│        │  Right-edge price ladder with current price highlight badge  │
├────────┼─────────────────────────────────────────────────────────────┤
│  z:10  │  HUD Overlay (React DOM)                                    │
│        │  Price, timer, stamina bar, trade log, PnL readout          │
├────────┼─────────────────────────────────────────────────────────────┤
│  z:1   │  Game Canvas (HTML Canvas)                                  │
│        │  Price line, safe zone, obstacles, character, particles,    │
│        │  floating text, flash effects, darkness wall                │
├────────┼─────────────────────────────────────────────────────────────┤
│  z:0   │  Background Canvas (HTML Canvas)                            │
│        │  Grid, stars, ocean waves, or AI-generated background       │
└────────┴─────────────────────────────────────────────────────────────┘
```

---

## Challenges

### Keeping 60fps With Real-Time Data

WebSocket price updates arrive at irregular intervals with variable latency. Raw updates caused visible jitter in the price line. We solved this with a 4-frame linear interpolation buffer — each new price target is lerped over ~67ms, smoothing network jank into fluid motion.

### Dynamic Price Scaling Without Disorientation

When BTC moves $50 in seconds, the price can drift off-canvas. Auto-rescaling triggers at ±20% of the visible range and animates over 20 frames. The tricky part: rescaling the entire price history buffer simultaneously so the curve doesn't jump — every stored Y-coordinate gets remapped in the same frame.

### AI Theme Generation That Actually Works

Getting Claude to produce Canvas 2D code that renders well at 60fps required a 400-line system prompt with reference implementations, color constraints (backgrounds must stay under brightness 40), and minimum draw-call counts (15–30+ calls per object). Every generated function is wrapped in error boundaries so a hallucinated API call degrades to a default shape rather than crashing the game loop.

### Zero-Duration Trade Safety

All live trades are market orders that auto-close after 500ms. The backend uses a 3-retry loop with exponential backoff, and falls back to `close_position()` as a last resort. Paper mode is the default — live trading requires explicit opt-in.

---

## What We Learned

Markets are games. They have rules, opponents, risk, and reward. But traditional trading UIs hide the game behind spreadsheets. By mapping price action to spatial movement, players develop genuine intuition for volatility, momentum, and risk management — all while having fun.

The biggest technical lesson: **when real money is involved, every abstraction layer is a liability.** We kept the frontend stateless for trading (all orders go through the backend), used paper mode as the default, and made live mode require an explicit opt-in. The game is fun. Losing real money is not.

---

## Tech Stack

`Next.js 15` · `TypeScript` · `HTML Canvas 2D` · `Python` · `FastAPI` · `uv` · `Anthropic Claude` · `Hyperliquid WebSocket` · `Liquid Exchange API` · `Tailwind CSS` · `WebSockets`

---

## Running Locally

```bash
# Backend
cd backend
uv run uvicorn main:app --port 8000 --reload

# Frontend
cd frontend
npm install
npm run dev    # starts on port 3000
```

Environment variables (`.env` in `/backend`):
```
LIQUID_API_KEY=
LIQUID_API_SECRET=
ANTHROPIC_API_KEY=
```

---

## What's Next

- **More game modes** — The generative engine can skin any game mechanic. We want 10+ themes, all driven by the same trading engine underneath.
- **Leaderboards** — Best PnL per session, per asset, per game mode. The highest score is the best trade.
- **Mobile** — Touch controls, full PWA support. The best trading interface should live on your home screen.
- **More assets** — Any asset with a live price feed becomes a playable level.
- **Multiplayer** — Same price line, multiple players, competing PnL. Watch another trader's conviction in real time.

---

*Navigate the noise. Find the signal.*
