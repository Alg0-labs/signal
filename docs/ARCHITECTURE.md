# Architecture

SIGNAL is a TypeScript monorepo split into two deployable apps:

```
signal/
├── backend/    Express + LangGraph AI engine, RAG, wallet & market services
├── frontend/   Next.js 16 (App Router) dashboard & copilot UI
├── docs/        Architecture & feature documentation
└── assets/      Product screenshots
```

## High-level flow

```
        ┌──────────────────────────────────────────────┐
        │                 Frontend (Next.js)            │
        │   Landing · Copilot · Dashboard · Chart-chat  │
        └───────────────────────┬──────────────────────┘
                                 │  REST (axios + React Query)
                                 ▼
        ┌──────────────────────────────────────────────┐
        │              Backend (Express API)            │
        │  rate-limit · zod validation · session store  │
        └───────┬───────────────┬───────────────┬───────┘
                │               │               │
        Quick Check       Deep Analysis        RAG
        (4 signals)       (7-agent graph)   (Pinecone)
                │               │               │
                ▼               ▼               ▼
        CoinGecko / RSS    Claude (Anthropic)  Embeddings
        Alternative.me     LangGraph state     (Voyage/Gemini)
        Moralis indexer    graph + tools       vector store
```

## Deep Analysis — LangGraph state graph

The deep-analysis workflow is a directed state graph (`backend/src/copilot/workflows/deep-workflow.ts`):

```
START
  │
  ▼
gather_data            fetch OHLCV, indicators, news, on-chain context once
  │
  ▼
[parallel analysts]    market · sentiment · news · on-chain  (fan-out)
  │
  ▼
debate                 Bull vs Bear — 2 rounds + facilitator synthesis
  │
  ▼
decide                 trader agent synthesizes reports + debate
  │
  ▼
assess_risk            ATR-based position sizing, stop-loss, take-profit
  │
  ▼
finalize → END         assembles the DeepAnalysisResult
```

### The 7 agents
1. **Market Analyst** — trend, RSI, MACD, Bollinger Bands
2. **Sentiment Analyst** — Fear & Greed, social momentum
3. **News Analyst** — RSS + RAG-retrieved headlines
4. **On-chain Analyst** — volume anomalies, whale flow
5. **Debate (Bull vs Bear)** — adversarial reasoning + facilitator
6. **Decision Maker** — synthesizes a single BUY / SELL / HOLD call
7. **Risk Calculator** — deterministic ATR position sizing & stops

## Quick Check — 4 parallel signals

`backend/src/copilot/workflows/quick-workflow.ts` runs four lightweight probes
concurrently and fuses them into a severity score in under ~3 seconds:

- **Momentum** — RSI + MACD trend
- **Sentiment Pulse** — Fear & Greed index + trending status
- **Whale Tracker** — volume anomaly / net-flow direction
- **News Scanner** — breaking-news detection from RSS

## RAG — "Talk to the chart"

`backend/src/copilot/rag/` ingests crypto news on a schedule, embeds it
(Voyage or Gemini), and stores vectors in Pinecone. The chart-chat service
retrieves temporally-relevant headlines for the selected time range so answers
are grounded in what was actually happening on the chart. The feature degrades
gracefully when RAG keys are absent.

## Persistence

- **PostgreSQL via Prisma** — `WalletSnapshot` cache (address → payload, TTL refresh)
- **In-memory session store** — copilot sessions (TTL 1h; swap for Redis to scale)
- **Response caches** — chart snapshots (5 min) and backtests (30 min)

## Wallet & transactions

`viem`-based transaction builder supports native + ERC-20 transfers across
Ethereum, Polygon, BSC, Arbitrum, Optimism and Base. Wallet data is hydrated
from the Moralis indexer and cached in Postgres with a manual-refresh cooldown.
