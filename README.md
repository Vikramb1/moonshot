# Moonshot

**Moonshot** is a generative trading game where you pilot a spaceship alongside a live crypto price feed — and your position relative to the price line places real leveraged trades on a live exchange. It turns the abstract, stressful world of crypto trading into a 60fps arcade experience.

## Inspiration

Trading terminals are intimidating. Candlestick charts, order books, liquidation ladders — they're powerful tools, but they create a barrier for anyone trying to understand how markets actually move. We asked: *what if you could feel a price feed instead of just watching it?*

The idea was simple — map a live price stream to a game world. Your ship's vertical position becomes your price prediction. Flying above the current price means you're bullish; flying below means you're bearish. Every second, the game reads your position and fires a real 25x leveraged market order in that direction. The market becomes the level, and your PnL becomes your score.

## How It Works

The core mechanic is **price prediction through spatial movement**. A live price line snakes across the screen in real time, fed by a WebSocket connection to Hyperliquid. You control your ship with W/S (up/down), and your vertical offset from the price line is your trade signal:

- **Above the price line** → you're predicting the price will go **up** → the game opens a **long** position
- **Below the price line** → you're predicting the price will go **down** → the game opens a **short** position
- **On the price line** → you're in the **safe zone** → no damage, but no conviction either

Staying close to the price line keeps you safe (your health regenerates), but drifting away is where the money is made — or lost. Every second, the game checks your tilt and fires a market order. If you predicted right, your PnL climbs. If not, you eat the loss at 25x leverage.

The game ends when time runs out, your health hits zero (from asteroids or straying too far from the price), or you hit a profit/loss threshold you set before launch.


## Building the Game

### Frontend — 60fps Canvas Rendering

The game renders entirely on an HTML Canvas using `requestAnimationFrame`. We avoided heavyweight scene-graph libraries in favor of direct draw calls — every frame redraws the price history curve, the spaceship, asteroids, particles, and the HUD from scratch. Game state lives in React refs (not `useState`) to prevent re-renders from killing frame rate.

The price line is the core visual. It renders as a smooth quadratic Bézier curve with a neon glow, pulling from a rolling buffer of Y-coordinates. When the price drifts too close to the canvas edge, the visible range dynamically rescales over 20 frames:

$$
y_{\text{pixel}} = y_{\text{bottom}} - \frac{p - p_{\min}}{p_{\max} - p_{\min}} \cdot (y_{\text{bottom}} - y_{\text{top}})
$$

where the visible range $[p_{\min}, p_{\max}]$ is asset-specific — BTC uses $\pm 0.03\%$ (about \$25 at \$84k) while SOL uses $\pm 0.1\%$ — so micro-movements in any asset produce the same visual drama.

### Backend — Dual Exchange Bridge

The exchange we trade on (Liquid) doesn't offer a fast WebSocket price feed. So we built a **bridge architecture** — prices stream in from Hyperliquid's `allMids` WebSocket (sub-second updates), while orders execute on Liquid's REST API. The backend stitches these together, forwarding price ticks to the frontend over its own WebSocket and placing HMAC-signed orders when the game fires a trade.

Each trade auto-closes after 500ms via an `asyncio` background task, keeping exposure brief:

```python
async def close_after_delay(symbol, side, size):
    await asyncio.sleep(0.5)
    liquid.place_order(symbol, opposite(side), "market", size, leverage=25)
```

### Three Game Modes

1. **Moonshot 1.0** — The original. Spaceship + asteroids + live price feed. Pick your asset (BTC, ETH, SOL, DOGE), set your duration and position size, and predict.
2. **Surf Shark** — Same trading engine, ocean theme. You're a surfer riding the price wave, dodging sharks instead of asteroids.
3. **Describe a Game** — Type three descriptions — your avatar, your background, your obstacles — and Claude generates Canvas 2D drawing functions from pure text. A "Mario Kart racer dodging banana peels on Rainbow Road" becomes a playable trading game in seconds. The AI writes actual JavaScript that renders your custom theme in real time.

## Challenges

### Keeping 60fps with real-time data

WebSocket price updates arrive at irregular intervals with variable latency. Raw updates caused visible jitter in the price line. We solved this with a 4-frame linear interpolation buffer — each new price target is lerped over ~67ms, smoothing network jank into fluid motion.

### PnL accuracy at 25x leverage

Small floating-point errors in price mapping get amplified 25x. Our PnL calculation aggregates across all open orders:

$$
\text{PnL} = \sum_{i} \frac{p_{\text{current}} - p_i}{p_i} \times s_i \times 25 \times d_i
$$

where $p_i$ is the entry price, $s_i$ is position size, and $d_i \in \{-1, +1\}$ is direction. We use the interpolated display price (not the raw WebSocket price) so the HUD stays consistent with what the player sees on screen.

### Dynamic price scaling without disorientation

When BTC moves \$50 in a few seconds, the price can drift off-canvas. We implemented auto-rescaling that triggers at ±20% of the visible range and animates over 20 frames. The tricky part was rescaling the entire price history buffer simultaneously so the curve doesn't "jump" — every stored Y-coordinate gets remapped in the same frame.

### AI theme generation that actually works

Getting Claude to produce Canvas 2D code that renders well at 60fps required a 400-line system prompt with reference implementations, color constraints (backgrounds must stay under brightness 40), and minimum draw-call counts (15–30+ calls per object). Every generated function is wrapped in error boundaries so a hallucinated API call degrades to a default shape rather than crashing the game loop.

## What We Learned

Markets are games — they have rules, opponents, risk, and reward. But traditional trading UIs hide the game behind spreadsheets. By stripping away the complexity and mapping price action to spatial movement, we found that players develop genuine intuition for volatility, momentum, and risk management — all while having fun.

The biggest technical lesson: **when real money is involved, every abstraction layer is a liability.** We kept the frontend stateless for trading (all orders go through the backend), used paper mode as the default, and made live mode require an explicit opt-in. The game is fun. Losing real money is not.
