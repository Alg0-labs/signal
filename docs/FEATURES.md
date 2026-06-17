# Features

A complete catalogue of what SIGNAL ships today.

## AI Copilot

| Feature | Description |
| --- | --- |
| Quick Check | 4-signal fused analysis (momentum, sentiment, whales, news) in ~3s |
| Deep Analysis | 7-agent LangGraph workflow with Bull vs Bear debate |
| Bull vs Bear Debate | Two rounds of adversarial reasoning + facilitator synthesis |
| Decision Engine | Single BUY / SELL / HOLD verdict with confidence + thesis |
| Risk Engine | ATR-based position sizing, stop-loss & take-profit levels |
| Backtester | RSI + MACD strategy backtest over up to 90 days of real OHLCV |
| Async sessions | quick-check → deep-analysis → status/report polling API |

## Market intelligence

- Live OHLCV candles, market data and volume history (CoinGecko)
- Technical indicators: RSI, MACD, ATR, Bollinger Bands
- Chart-pattern & order-flow heuristics
- Historical analogs lookup
- Fear & Greed index (Alternative.me)
- Crypto news ingestion via RSS

## RAG — "Talk to the chart"

- Scheduled news ingestion and embedding (Voyage / Gemini)
- Pinecone vector store + temporal retriever
- Time-range-aware grounding so answers match the selected chart window
- Graceful degradation when RAG keys are not configured

## Wallet & on-chain

- Wallet snapshot via Moralis indexer, cached in PostgreSQL (Prisma)
- Paged transaction history with USD valuation
- AI chat over wallet context with tool use
- `viem` transaction builder: native ETH + ERC-20 transfers
- Multi-chain: Ethereum, Polygon, BSC, Arbitrum, Optimism, Base

## Frontend

- Animated landing page (Framer Motion)
- Copilot page: quick check, deep analysis, live price chart
- Dashboard: market chart (lightweight-charts), Fear & Greed, news, chart-chat
- Reusable UI kit: navbar, card, badge, button, input, markdown renderer
- Data layer: React Query + Zustand + axios

## Production hardening

- Per-route rate limiting (quick-check, deep-analysis, chart, backtest)
- Zod request validation on every endpoint
- CORS allow-list (localhost + `*.vercel.app`)
- 64 KB request-body cap to prevent oversized-payload DoS
- Response caching for charts and backtests
- Health-check endpoints for Railway / Vercel / Render
