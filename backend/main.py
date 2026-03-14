"""
MOONSHOT — FastAPI backend
Handles all Liquid exchange API calls (REST + WebSocket).
The frontend NEVER calls Liquid directly — all auth and order placement lives here.

Run with:  uv run uvicorn main:app --port 8000 --reload
"""

import asyncio
import json
import os
import time
from typing import Any

import httpx
import jwt
import websockets
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from liquidtrading import LiquidClient
from pydantic import BaseModel

load_dotenv()

LIQUID_API_KEY = os.getenv("LIQUID_API_KEY", "")
LIQUID_API_SECRET = os.getenv("LIQUID_API_SECRET", "")
LIQUID_REST_BASE = "https://api.liquid.com"
LIQUID_WS_URL = "wss://tap.liquid.com/app/LiquidTapClient"

# Liquid SDK client (new API)
liquid = LiquidClient(
    api_key=LIQUID_API_KEY,
    api_secret=LIQUID_API_SECRET,
)

app = FastAPI(title="MOONSHOT Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# JWT auth helper — FULLY IMPLEMENTED
# ---------------------------------------------------------------------------

def generate_jwt(path: str) -> str:
    """
    Generate a Liquid-compatible JWT for authenticating REST requests.

    Liquid requires a fresh JWT per request, signed with the API secret using HS256.
    The payload format follows the Liquid API documentation exactly.

    Args:
        path: The API endpoint path, e.g. "/orders" or "/accounts/balance".
              Must match the path of the HTTP request being authenticated.

    Returns:
        A signed JWT string to be sent in the X-Quoine-Auth header.

    Payload fields:
        path        — request path (Liquid uses this to bind the token to one endpoint)
        nonce       — current timestamp in milliseconds as a string (prevents replay)
        token_id    — the API key from the environment
    """
    nonce = str(int(time.time() * 1000))
    payload: dict[str, Any] = {
        "path": path,
        "nonce": nonce,
        "token_id": LIQUID_API_KEY,
    }
    token = jwt.encode(payload, LIQUID_API_SECRET, algorithm="HS256")
    # pyjwt >= 2.0 returns str directly; older versions returned bytes
    return token if isinstance(token, str) else token.decode("utf-8")


def liquid_headers(path: str) -> dict[str, str]:
    """
    Build the auth headers required for every Liquid REST call.

    Returns a dict with:
        X-Quoine-API-Version — always "2"
        X-Quoine-Auth        — the freshly generated JWT for this path
        Content-Type         — "application/json"
    """
    return {
        "X-Quoine-API-Version": "2",
        "X-Quoine-Auth": generate_jwt(path),
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@app.get("/api/account")
async def get_account():
    """
    Fetch the authenticated user's account balances from Liquid.

    Calls GET https://api.liquid.com/accounts/balance with a fresh JWT.
    Returns a list of { currency, balance } objects for all non-zero balances.

    The frontend calls this once on the lobby page to display available funds
    before the user launches a game.
    """
    path = "/accounts/balance"
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{LIQUID_REST_BASE}{path}",
            headers=liquid_headers(path),
        )
        response.raise_for_status()
        data = response.json()

    # Normalize to a simple list the frontend can consume
    balances = [
        {"currency": account["currency"], "balance": account["balance"]}
        for account in data
        if float(account.get("balance", 0)) > 0
    ]
    return balances


class PlaceOrderRequest(BaseModel):
    """Body for POST /api/place-order"""
    product_id: int
    price: float
    size: float
    side: str  # 'buy' | 'sell'


@app.post("/api/place-order")
async def place_order(body: PlaceOrderRequest):
    """
    Place a limit order on Liquid. FULLY IMPLEMENTED.

    Called by useGameEngine.collectCoin() whenever the ship hits a coin.
    This is the ONLY place orders are ever created — never from the frontend.

    Flow:
        1. Build a Liquid "limit" order payload from the request body.
        2. Sign the request with a fresh JWT for the /orders path.
        3. POST to https://api.liquid.com/orders.
        4. Return the Liquid order ID and status to the frontend.

    Args (request body):
        product_id  — Liquid product ID (1 = BTC/USD)
        price       — limit price level the coin represented
        size        — quantity in BTC (DEFAULT_ORDER_SIZE from game engine)
        side        — 'buy' if coin was above current price, 'sell' if below

    Returns:
        { liquidOrderId: str, status: str }
        liquidOrderId is null if Liquid returned an error (game continues).
    """
    path = "/orders"
    order_payload = {
        "order": {
            "product_id": body.product_id,
            "side": body.side,
            "quantity": str(body.size),
            "price": str(body.price),
            "order_type": "limit",
        }
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{LIQUID_REST_BASE}{path}",
            headers=liquid_headers(path),
            json=order_payload,
        )

    if response.status_code not in (200, 201):
        # Return a soft failure — game should not crash if an order fails
        return {
            "liquidOrderId": None,
            "status": f"error:{response.status_code}",
        }

    data = response.json()
    return {
        "liquidOrderId": str(data.get("id", "")),
        "status": data.get("status", "unknown"),
    }


# ---------------------------------------------------------------------------
# Liquid SDK — live price stream + 1-second trade
# ---------------------------------------------------------------------------

@app.websocket("/ws/price-stream/{symbol}")
async def price_stream(ws: WebSocket, symbol: str = "ETH-PERP"):
    """
    Stream live prices for an asset via the Liquid SDK.

    On initial connection, sends the last 30 seconds of 1-second candle data
    as backfill, then polls the ticker every ~100ms for real-time updates.

    Each message sent to the frontend:
        { price: float, timestamp: int }
    """
    await ws.accept()

    try:
        # Backfill: fetch last 30 seconds of 1s candle data (use 1m candles, last 1)
        # Since the smallest candle interval is 1m, we use the ticker polling approach
        # for sub-minute granularity. Fetch the most recent 1m candle and current ticker
        # to approximate the last 30 seconds.
        now_ms = int(time.time() * 1000)
        thirty_sec_ago = now_ms - 30_000

        # Get 1m candles for recent history (last few minutes to ensure coverage)
        candles = liquid.get_candles(symbol, interval="1m", limit=2)
        for candle in candles:
            candle_ts = int(candle.timestamp * 1000) if candle.timestamp < 1e12 else int(candle.timestamp)
            # Send OHLC points as individual price points within the last 30s window
            if candle_ts >= thirty_sec_ago:
                for price_val in [candle.open, candle.high, candle.low, candle.close]:
                    await ws.send_json({"price": price_val, "timestamp": candle_ts})

        # Also send current ticker as the most recent backfill point
        ticker = liquid.get_ticker(symbol)
        await ws.send_json({
            "price": ticker.mark_price,
            "timestamp": now_ms,
        })

        # Live polling loop (~100ms interval)
        last_price = ticker.mark_price
        while True:
            await asyncio.sleep(0.1)
            try:
                ticker = liquid.get_ticker(symbol)
                current_price = ticker.mark_price
                if current_price != last_price:
                    await ws.send_json({
                        "price": current_price,
                        "timestamp": int(time.time() * 1000),
                    })
                    last_price = current_price
            except Exception:
                # Tolerate transient SDK errors; keep streaming
                continue

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[ws/price-stream] error: {exc}")
    finally:
        try:
            await ws.close()
        except Exception:
            pass


class TradeRequest(BaseModel):
    """Body for POST /api/trade"""
    symbol: str = "ETH-PERP"
    size: float = 0.5  # margin in USD (with 25x leverage → $12.50 notional)
    side: str  # 'long' | 'short'
    leverage: int = 25


@app.post("/api/trade")
async def trade(body: TradeRequest):
    """
    Place a market trade and automatically close it after exactly 1 second.

    - 'long' opens a buy, then closes after 1s.
    - 'short' opens a sell, then closes after 1s.

    Size is the margin amount in USD. With the default 25x leverage,
    size=0.5 puts up ~$0.49 margin for a ~$12.50 notional position
    (the minimum allowed by Hyperliquid is $10 notional).

    Returns the opening order, then schedules the close in the background.
    """
    order_side = "buy" if body.side == "long" else "sell"

    try:
        order = liquid.place_order(
            symbol=body.symbol,
            side=order_side,
            type="market",
            size=body.size,
            leverage=body.leverage,
        )
    except Exception as exc:
        return {"success": False, "error": str(exc)}

    # Schedule the close after exactly 1 second in the background
    async def close_after_delay():
        await asyncio.sleep(1.0)
        try:
            liquid.close_position(body.symbol)
        except Exception as exc:
            print(f"[trade] failed to close {body.symbol}: {exc}")

    asyncio.create_task(close_after_delay())

    return {
        "success": True,
        "order_id": order.order_id,
        "side": body.side,
        "size": body.size,
        "symbol": body.symbol,
        "closes_in_ms": 1000,
    }


# ---------------------------------------------------------------------------
# WebSocket — price feed proxy. FULLY IMPLEMENTED.
# ---------------------------------------------------------------------------

@app.websocket("/ws/price/{product_id}")
async def price_websocket(ws: WebSocket, product_id: int):
    """
    Proxy Liquid's real-time price WebSocket to the frontend. FULLY IMPLEMENTED.

    The frontend connects here on mount (via useLiquid hook).
    This handler:
        1. Accepts the frontend WebSocket connection.
        2. Opens its own WebSocket to wss://tap.liquid.com/app/LiquidTapClient.
        3. Subscribes to the product's price channel (product_{id}-tickers).
        4. Forwards each tick to the frontend as a PriceUpdate JSON object.
        5. Unsubscribes and closes the Liquid connection when the frontend disconnects.

    The PriceUpdate shape streamed to the frontend:
        {
            price:         float   — current mid price in USD
            previousPrice: float   — previous tick's price
            direction:     str     — 'up' | 'down' | 'neutral'
            timestamp:     int     — ms since epoch
        }

    Channel format: "product_{product_id}-tickers"
    Liquid sends JSON messages with a "data" key containing the ticker payload.
    """
    await ws.accept()

    previous_price: float = 0.0

    channel = f"product_{product_id}-tickers"
    subscribe_msg = json.dumps({
        "event": "pusher:subscribe",
        "data": {"channel": channel},
    })

    try:
        async with websockets.connect(LIQUID_WS_URL) as liquid_ws:
            # Subscribe to the price channel for the requested product
            await liquid_ws.send(subscribe_msg)

            async def listen_liquid():
                """Read messages from Liquid and forward to frontend."""
                nonlocal previous_price
                async for raw in liquid_ws:
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    # Liquid sends a wrapper with event + data (data is a JSON string)
                    if msg.get("event") != "updated":
                        continue

                    inner = msg.get("data")
                    if not inner:
                        continue

                    # data field is itself a JSON-encoded string
                    try:
                        ticker = json.loads(inner) if isinstance(inner, str) else inner
                    except (json.JSONDecodeError, TypeError):
                        continue

                    # last_traded_price is the authoritative mid price on Liquid
                    raw_price = ticker.get("last_traded_price") or ticker.get("last_price")
                    if raw_price is None:
                        continue

                    current_price = float(raw_price)
                    if previous_price == 0.0:
                        direction = "neutral"
                    elif current_price > previous_price:
                        direction = "up"
                    elif current_price < previous_price:
                        direction = "down"
                    else:
                        direction = "neutral"

                    update = {
                        "price": current_price,
                        "previousPrice": previous_price,
                        "direction": direction,
                        "timestamp": int(time.time() * 1000),
                    }
                    previous_price = current_price

                    try:
                        await ws.send_json(update)
                    except Exception:
                        # Frontend disconnected; stop forwarding
                        break

            async def listen_frontend():
                """Keep connection alive; handle any messages from frontend (e.g. ping)."""
                try:
                    while True:
                        await ws.receive_text()
                except WebSocketDisconnect:
                    pass

            # Run both listeners concurrently; stop when either exits
            done, pending = await asyncio.wait(
                [
                    asyncio.ensure_future(listen_liquid()),
                    asyncio.ensure_future(listen_frontend()),
                ],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        # Log and close gracefully so the frontend can reconnect
        print(f"[ws/price] error: {exc}")
    finally:
        try:
            await ws.close()
        except Exception:
            pass
