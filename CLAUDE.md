# MOONSHOT

## What this is
A generative trading game where a spaceship flies through a coin grid in real time.
Each coin collected places a real limit order on Liquid exchange instantly.
Game ends when duration elapses, profit threshold is hit, or stop loss triggers.

## Architecture
- frontend/   Next.js 15 + Three.js game
- backend/    FastAPI Python server via uv

## Running locally
cd backend && uv run main.py        # starts on port 8000
cd frontend && npm run dev          # starts on port 3000

## Environment variables
LIQUID_API_KEY=
LIQUID_API_SECRET=

## Key decisions
- WASD controls ship: W = up, S = down, A and D reserved for future use
- Ship always moves right automatically along X axis
- Each coin Y position maps directly to a real Liquid price level
- Coin collision = immediate limit order POST to /api/place-order server side
- Price line moves on Y axis in real time from Liquid WebSocket feed
- Game has three end conditions: time elapsed, profit threshold, loss threshold
- All Liquid API calls happen server side in Python only, never from frontend

## Game end conditions
- Time: game duration hits 0 (30s or 60s configured in lobby)
- Profit: totalPnL >= profitThreshold (if set by user in lobby)
- Loss: totalPnL <= -lossThreshold (if set by user in lobby)

## Liquid API
- REST base: https://api.liquid.com
- WebSocket: wss://tap.liquid.com/app/LiquidTapClient
- Auth: JWT generated from API key and secret per Liquid docs
- Place order: POST /orders
- BTC/USD product ID: 1

## DO NOT
- Never place orders from the frontend
- Never hardcode API keys anywhere
- Never skip collision detection before placing an order
- Never run game end logic server side — frontend owns game state
