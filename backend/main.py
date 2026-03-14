"""
MOONSHOT — FastAPI backend
Handles all Liquid exchange API calls via liquidtrading-python SDK.
The frontend NEVER calls Liquid directly — all auth and order placement lives here.

Run with:  uv run uvicorn main:app --port 8000 --reload

Liquid SDK docs: https://sdk.tryliquid.xyz/
REST base URL:   https://api-public.liquidmax.xyz/v1
Auth:            HMAC-SHA256 (handled by LiquidClient automatically)
"""

import asyncio
import hashlib
import hmac
import json
import os
import time
import uuid

import websockets
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from liquidtrading import LiquidClient
from pydantic import BaseModel

load_dotenv()

LIQUID_API_KEY = os.getenv("LIQUID_API_KEY", "")
LIQUID_API_SECRET = os.getenv("LIQUID_API_SECRET", "")
LIQUID_BASE_URL = os.getenv("LIQUID_BASE_URL", "https://api-public.liquidmax.xyz")

# Single SDK client instance
liquid = LiquidClient(
    api_key=LIQUID_API_KEY,
    api_secret=LIQUID_API_SECRET,
    base_url=LIQUID_BASE_URL,
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
# HMAC-SHA256 auth helper — reference implementation
# ---------------------------------------------------------------------------

def _sign_request(
    method: str,
    path: str,
    query: str = "",
    body: str = "",
) -> dict[str, str]:
    """
    Build auth headers for raw httpx calls (the SDK handles this automatically).
    Kept as reference for any future raw REST calls.
    """
    if not LIQUID_API_KEY or not LIQUID_API_SECRET:
        raise ValueError("LIQUID_API_KEY and LIQUID_API_SECRET must be set in .env")

    timestamp_ms = str(int(time.time() * 1000))
    nonce = uuid.uuid4().hex[:16]
    body_hash = hashlib.sha256(body.encode()).hexdigest()

    payload = "\n".join([
        timestamp_ms, nonce, method.upper(), path, query, body_hash,
    ])

    signature = hmac.new(
        LIQUID_API_SECRET.encode(), payload.encode(), hashlib.sha256,
    ).hexdigest()

    return {
        "X-Liquid-Key": LIQUID_API_KEY,
        "X-Liquid-Timestamp": timestamp_ms,
        "X-Liquid-Nonce": nonce,
        "X-Liquid-Signature": signature,
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@app.get("/api/account")
async def get_account():
    """Fetch account + balance data from Liquid via SDK."""
    try:
        account = liquid.get_account()
        balances = liquid.get_balances()
        return {
            "equity": account.equity,
            "available_balance": account.available_balance,
            "margin_used": account.margin_used,
            "account_value": account.account_value,
            "balances": [
                {
                    "exchange": b.exchange,
                    "equity": b.equity,
                    "available_balance": b.available_balance,
                }
                for b in (balances if isinstance(balances, list) else [balances])
            ],
        }
    except Exception as exc:
        return {"error": str(exc)}


class PlaceOrderRequest(BaseModel):
    """Body for POST /api/place-order"""
    symbol: str
    price: float
    size: float
    side: str


@app.post("/api/place-order")
async def place_order(body: PlaceOrderRequest):
    """Place a limit order on Liquid."""
    try:
        order = liquid.place_order(
            symbol=body.symbol,
            side=body.side,
            type="limit",
            size=body.size,
            price=body.price,
            leverage=1,
            time_in_force="gtc",
        )
        return {"liquidOrderId": order.order_id, "status": order.status}
    except Exception as exc:
        return {"liquidOrderId": None, "status": f"error:{exc}"}


# ---------------------------------------------------------------------------
# Live price stream via SDK polling
# ---------------------------------------------------------------------------

@app.websocket("/ws/price-stream/{symbol}")
async def price_stream(ws: WebSocket, symbol: str = "ETH-PERP"):
    """
    Stream live prices. Sends backfill from recent candles, then polls
    the ticker every ~100ms for real-time updates.
    """
    await ws.accept()

    try:
        now_ms = int(time.time() * 1000)
        thirty_sec_ago = now_ms - 30_000

        candles = liquid.get_candles(symbol, interval="1m", limit=2)
        for candle in candles:
            candle_ts = int(candle.timestamp * 1000) if candle.timestamp < 1e12 else int(candle.timestamp)
            if candle_ts >= thirty_sec_ago:
                for price_val in [candle.open, candle.high, candle.low, candle.close]:
                    await ws.send_json({"price": price_val, "timestamp": candle_ts})

        ticker = liquid.get_ticker(symbol)
        await ws.send_json({"price": ticker.mark_price, "timestamp": now_ms})

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


# ---------------------------------------------------------------------------
# 1-second trade endpoint
# ---------------------------------------------------------------------------

class TradeRequest(BaseModel):
    """Body for POST /api/trade"""
    symbol: str = "ETH-PERP"
    size: float = 0.5
    side: str
    leverage: int = 25


@app.post("/api/trade")
async def trade(body: TradeRequest):
    """Place a market trade, then immediately close with opposite order."""
    order_side = "buy" if body.side == "long" else "sell"
    close_side = "sell" if body.side == "long" else "buy"

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

    async def close_after_delay():
        """Close this specific trade by placing an opposite market order of the same size."""
        await asyncio.sleep(0.5)
        max_retries = 3
        for attempt in range(max_retries):
            try:
                liquid.place_order(
                    symbol=body.symbol,
                    side=close_side,
                    type="market",
                    size=body.size,
                    leverage=body.leverage,
                )
                print(f"[trade] closed {body.side} {body.size} {body.symbol}")
                return
            except Exception as exc:
                print(f"[trade] close attempt {attempt + 1}/{max_retries} failed: {exc}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(1.0)
        # Last resort: try close_position
        try:
            liquid.close_position(body.symbol)
            print(f"[trade] fallback close_position {body.symbol}")
        except Exception as exc:
            print(f"[trade] FAILED to close {body.symbol}: {exc}")

    asyncio.create_task(close_after_delay())

    return {
        "success": True,
        "order_id": order.order_id,
        "side": body.side,
        "size": body.size,
        "symbol": body.symbol,
        "closes_in_ms": 500,
    }


@app.post("/api/close-all")
async def close_all():
    """Emergency close all positions for all supported symbols."""
    results = []
    for sym in ["ETH-PERP", "BTC-PERP", "SOL-PERP", "DOGE-PERP"]:
        try:
            liquid.close_position(sym)
            results.append({"symbol": sym, "closed": True})
        except Exception as exc:
            results.append({"symbol": sym, "closed": False, "error": str(exc)})
    return {"results": results}


# ---------------------------------------------------------------------------
# Real-time price WebSocket — powered by Hyperliquid allMids stream
# Orders still go through Liquid; only the price feed uses Hyperliquid.
# ---------------------------------------------------------------------------

HYPERLIQUID_WS_URL = "wss://api.hyperliquid.xyz/ws"

# Map our symbol names to Hyperliquid coin names
SYMBOL_TO_HL_COIN: dict[str, str] = {
    "ETH-PERP": "ETH",
    "BTC-PERP": "BTC",
    "SOL-PERP": "SOL",
    "DOGE-PERP": "DOGE",
}


@app.websocket("/ws/price/{symbol}")
async def price_websocket(ws: WebSocket, symbol: str):
    """
    Stream real-time mid prices from Hyperliquid's allMids WebSocket.
    Sub-second updates — no polling, no rate limits.
    """
    await ws.accept()

    coin = SYMBOL_TO_HL_COIN.get(symbol, symbol.replace("-PERP", ""))
    previous_price: float = 0.0
    running = True

    async def stream_from_hyperliquid():
        nonlocal previous_price, running
        while running:
            try:
                async with websockets.connect(HYPERLIQUID_WS_URL) as hl_ws:
                    # Subscribe to allMids
                    await hl_ws.send(json.dumps({
                        "method": "subscribe",
                        "subscription": {"type": "allMids"},
                    }))
                    print(f"[ws/price] connected to Hyperliquid allMids for {coin}")

                    async for raw_msg in hl_ws:
                        if not running:
                            break
                        try:
                            msg = json.loads(raw_msg)
                        except json.JSONDecodeError:
                            continue

                        # Skip subscription confirmation
                        if msg.get("channel") != "allMids":
                            continue

                        mids = msg.get("data", {}).get("mids", {})
                        price_str = mids.get(coin)
                        if price_str is None:
                            continue

                        current_price = float(price_str)
                        if current_price == previous_price:
                            continue

                        if previous_price == 0.0:
                            direction = "neutral"
                        elif current_price > previous_price:
                            direction = "up"
                        else:
                            direction = "down"

                        update = {
                            "price": current_price,
                            "previousPrice": previous_price,
                            "direction": direction,
                            "timestamp": int(time.time() * 1000),
                        }
                        previous_price = current_price
                        await ws.send_json(update)

            except WebSocketDisconnect:
                running = False
                return
            except Exception as exc:
                print(f"[ws/price] Hyperliquid connection error: {exc}")
                if running:
                    await asyncio.sleep(1.0)  # Brief pause before reconnect

    async def wait_for_disconnect():
        try:
            while True:
                await ws.receive_text()
        except (WebSocketDisconnect, Exception):
            pass

    try:
        done, pending = await asyncio.wait(
            [
                asyncio.ensure_future(stream_from_hyperliquid()),
                asyncio.ensure_future(wait_for_disconnect()),
            ],
            return_when=asyncio.FIRST_COMPLETED,
        )
        running = False
        for task in pending:
            task.cancel()
    except Exception as exc:
        print(f"[ws/price] handler error: {exc}")
    finally:
        running = False
        try:
            await ws.close()
        except Exception:
            pass
