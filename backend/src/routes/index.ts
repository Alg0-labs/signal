import { Router } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { getTransactionsPaged } from '../services/wallet.service.js'
import { prisma } from '../lib/prisma.js'
import { chat } from '../services/ai.service.js'
import { chartChat } from '../services/chart-chat.service.js'
import { fetchMarketContext } from '../services/market.service.js'
import {
  getWalletForRead,
  refreshWalletSnapshot,
  canManualRefresh,
  markManualRefresh,
} from '../services/wallet-snapshot.service.js'
import { quickCheck, deepAnalysis } from '../copilot/index.js'
import { runBacktest } from '../copilot/backtest/backtester.js'
import { getOHLCV, getMarketData, getVolumeHistory } from '../copilot/tools/market-data.js'
import type { CopilotSession, TradeIntent } from '../copilot/types.js'
import dotenv from 'dotenv'
dotenv.config()

// ─── Rate limiters ────────────────────────────────────────────────────────────
// Quick check: 15/min per IP (each call hits CoinGecko + RSS + Alternative.me)
const quickCheckLimiter = rateLimit({
  windowMs: 60_000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many quick check requests — please wait a minute.' },
})

// Deep analysis: 5/min per IP (each call invokes multiple LLM agents)
const deepAnalysisLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many deep analysis requests — please wait a minute.' },
})

// Chart data: 30/min per IP (CoinGecko free tier, cached 5 min on backend)
const chartLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chart requests.' },
})

// ─── Supported assets (matches chains in MCP server) ─────────────────────────
const SUPPORTED_CHART_ASSETS = new Set(['ETH', 'SOL', 'MATIC', 'AVAX', 'BNB'])
const SUPPORTED_BACKTEST_ASSETS = SUPPORTED_CHART_ASSETS

// Backtest cache: results are valid for 30 min (daily data doesn't change intraday)
const BACKTEST_CACHE_TTL_MS = 30 * 60 * 1000
const backtestCache = new Map<string, { result: unknown; expiresAt: number }>()

// Combined chart response cache (reduces burst traffic to CoinGecko on tab switching)
const CHART_SNAPSHOT_TTL_MS = 5 * 60 * 1000
const chartSnapshotCache = new Map<string, { payload: Record<string, unknown>; expiresAt: number }>()

// ─── Copilot Session Store (in-memory, TTL 1 hour) ────────────────────────────
// NOTE: In-memory only — sessions are lost on server restart.
// For production at scale, migrate to Redis with the same interface.
const SESSION_TTL_MS = 60 * 60 * 1000 // 1 hour
const copilotSessions = new Map<string, CopilotSession>()

function cleanExpiredSessions(): void {
  const now = Date.now()
  for (const [id, session] of copilotSessions.entries()) {
    if (now - session.timestamp > SESSION_TTL_MS) {
      copilotSessions.delete(id)
    }
  }
}

// Clean up every 15 minutes
setInterval(cleanExpiredSessions, 15 * 60 * 1000)

export const router = Router()

// ─── GET /api/wallet/:address ─────────────────────────────────────────────

router.get('/wallet/:address', async (req, res) => {
  const { address } = req.params

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' })
  }

  try {
    const { wallet, snapshotUpdatedAt, hydratedFromIndexer } = await getWalletForRead(address)
    res.json({
      success: true,
      wallet,
      snapshotUpdatedAt: snapshotUpdatedAt.toISOString(),
      hydratedFromIndexer,
    })
  } catch (err: any) {
    console.error('[wallet]', err.message)
    res.status(500).json({ error: err.message ?? 'Failed to fetch wallet data' })
  }
})

// ─── POST /api/wallet/:address/refresh ───────────────────────────────────

router.post('/wallet/:address/refresh', async (req, res) => {
  const { address } = req.params

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' })
  }

  const gate = canManualRefresh(address)
  if (!gate.ok) {
    return res.status(429).json({
      error: 'Refresh cooldown',
      retryAfterMs: gate.retryAfterMs,
    })
  }

  try {
    markManualRefresh(address)
    const wallet = await refreshWalletSnapshot(address)
    const row = await prisma.walletSnapshot.findUniqueOrThrow({
      where: { address: address.toLowerCase() },
    })
    res.json({
      success: true,
      wallet,
      snapshotUpdatedAt: row.updatedAt.toISOString(),
    })
  } catch (err: any) {
    console.error('[wallet-refresh]', err.message)
    res.status(500).json({ error: err.message ?? 'Failed to refresh wallet' })
  }
})

// ─── GET /api/wallet/:address/transactions ────────────────────────────────

router.get('/wallet/:address/transactions', async (req, res) => {
  const { address } = req.params

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' })
  }

  const offset = typeof req.query.offset === 'string' ? req.query.offset : undefined
  const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10) || 10, 50)

  try {
    const ethPriceRes = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
    )
    const ethPriceJson = await ethPriceRes.json() as { ethereum?: { usd?: number } }
    const ethPrice = ethPriceJson?.ethereum?.usd ?? 2500

    const result = await getTransactionsPaged(address, ethPrice, offset, limit)
    res.json({ success: true, ...result })
  } catch (err: any) {
    console.error('[transactions]', err.message)
    res.status(500).json({ error: err.message ?? 'Failed to fetch transactions' })
  }
})

// ─── POST /api/chat ───────────────────────────────────────────────────────

const ChatBodySchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ).min(1),
})

router.post('/chat', async (req, res) => {
  const parsed = ChatBodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors })
  }

  const { address, messages } = parsed.data

  try {
    const { wallet, snapshotUpdatedAt } = await getWalletForRead(address)
    const response = await chat(messages, wallet, snapshotUpdatedAt)
    res.json({ success: true, ...response })
  } catch (err: any) {
    console.error('[chat]', err.message)
    res.status(500).json({ error: err.message ?? 'AI error' })
  }
})

// ─── POST /api/copilot/chart-chat ─────────────────────────────────────────
// "Talk to the chart": grounded in live market data + temporal RAG news.

const ChartChatSchema = z.object({
  symbol: z.string().min(1).max(10),
  range: z.object({ from: z.number().optional(), to: z.number().optional() }).optional(),
  selection: z.object({ from: z.number(), to: z.number() }).optional(),
  messages: z.array(
    z.object({ role: z.enum(['user', 'assistant']), content: z.string() })
  ).min(1),
})

router.post('/copilot/chart-chat', async (req, res) => {
  const parsed = ChartChatSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors })
  }
  const { symbol, range, selection, messages } = parsed.data
  try {
    const result = await chartChat({ symbol: symbol.toUpperCase(), range, selection, messages })
    res.json({ success: true, ...result })
  } catch (err: any) {
    console.error('[chart-chat]', err.message)
    res.status(500).json({ error: err.message ?? 'Chart chat failed' })
  }
})

// ─── GET /api/market/:address (ETH-focused context) ───────────────────────

router.get('/market/:address', async (req, res) => {
  const { address } = req.params

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' })
  }

  try {
    const { wallet } = await getWalletForRead(address)
    const market = await fetchMarketContext(wallet)
    res.json({
      success: true,
      fearGreed: market.fearGreed,
      portfolioImpact: market.portfolioImpact,
      relevantNews: market.relevantNews.slice(0, 10),
      latestNewsInsights: market.latestNewsInsights,
      fetchedAt: market.fetchedAt,
    })
  } catch (err: any) {
    console.error('[market]', err.message)
    res.status(500).json({ error: err.message ?? 'Failed to fetch market data' })
  }
})

// ─── GET /api/copilot/chart/:symbol ───────────────────────────────────────
// Returns OHLCV candles + current market data + volume history for charting.
// Only the 5 assets supported by the MCP server chains are allowed.

router.get('/copilot/chart/:symbol', chartLimiter, async (req, res) => {
  const symbol = String(req.params.symbol).toUpperCase()

  if (!SUPPORTED_CHART_ASSETS.has(symbol)) {
    return res.status(400).json({
      error: `Unsupported asset. Supported: ${[...SUPPORTED_CHART_ASSETS].join(', ')}`,
    })
  }

  const now = Date.now()
  const snap = chartSnapshotCache.get(symbol)
  if (snap && now < snap.expiresAt) {
    return res.json({ ...snap.payload, cached: true })
  }

  try {
    const [ohlcv, market, volumeHistory] = await Promise.all([
      getOHLCV(symbol, 60),
      getMarketData(symbol),
      getVolumeHistory(symbol, 30),
    ])

    const payload: Record<string, unknown> = {
      success: true,
      symbol,
      ohlcv,
      market,
      volumeHistory,
    }
    chartSnapshotCache.set(symbol, { payload, expiresAt: Date.now() + CHART_SNAPSHOT_TTL_MS })
    res.json(payload)
  } catch (err: any) {
    console.error('[copilot][chart]', err.message)
    res.status(500).json({ error: err.message ?? 'Chart data fetch failed' })
  }
})

// ─── POST /api/copilot/quick-check ────────────────────────────────────────

const QuickCheckSchema = z.object({
  asset: z.string().min(1).max(20),
  action: z.enum(['BUY', 'SELL']),
  amount: z.number().nonnegative().optional().default(0),
  fromAsset: z.string().optional(),
  amountUSD: z.number().nonnegative().optional(),
  portfolioContext: z
    .object({
      currentHoldings: z.record(z.number()),
      availableUSD: z.number(),
      riskTolerance: z.enum(['low', 'moderate', 'high']),
    })
    .optional(),
})

router.post('/copilot/quick-check', quickCheckLimiter, async (req, res) => {
  const parsed = QuickCheckSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors })
  }

  const { asset, action, amount, fromAsset, amountUSD, portfolioContext } = parsed.data
  const symbol = asset.toUpperCase()

  const trade: TradeIntent = {
    asset: symbol,
    symbol,
    action,
    amount: amount ?? 0,
    fromAsset,
    amountUSD,
    portfolioContext,
  }

  try {
    console.log(`[copilot][route] Quick check: ${symbol} ${action}`)
    const result = await quickCheck(trade)

    const sessionId = crypto.randomUUID()
    const session: CopilotSession = {
      trade,
      quickCheck: { ...result, sessionId },
      status: 'quick_complete',
      timestamp: Date.now(),
    }
    copilotSessions.set(sessionId, session)

    res.json({
      success: true,
      sessionId,
      ...result,
    })
  } catch (err: any) {
    console.error('[copilot][route] quick-check error:', err.message)
    res.status(500).json({ error: err.message ?? 'Copilot quick check failed' })
  }
})

// ─── POST /api/copilot/deep-analysis ──────────────────────────────────────

const DeepAnalysisSchema = z.object({
  sessionId: z.string().uuid(),
})

router.post('/copilot/deep-analysis', deepAnalysisLimiter, async (req, res) => {
  const parsed = DeepAnalysisSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request — sessionId (UUID) required', details: parsed.error.errors })
  }

  const { sessionId } = parsed.data
  const session = copilotSessions.get(sessionId)

  if (!session) {
    return res.status(404).json({ error: 'Session not found. Run /copilot/quick-check first.' })
  }

  if (session.status === 'analyzing') {
    return res.status(409).json({ error: 'Deep analysis already in progress for this session' })
  }

  if (session.status === 'complete' && session.deepAnalysis) {
    return res.json({ success: true, status: 'complete', sessionId, result: session.deepAnalysis })
  }

  if (!session.quickCheck) {
    return res.status(400).json({ error: 'Quick check result missing from session' })
  }

  // Update status and respond 202 immediately
  session.status = 'analyzing'
  copilotSessions.set(sessionId, session)

  // Run deep analysis asynchronously
  deepAnalysis(session.trade, session.quickCheck)
    .then((result) => {
      const updated = copilotSessions.get(sessionId)
      if (updated) {
        updated.deepAnalysis = result
        updated.status = 'complete'
        updated.completedAt = Date.now()
        copilotSessions.set(sessionId, updated)
        console.log(`[copilot][route] Deep analysis complete for session ${sessionId}`)
      }
    })
    .catch((err) => {
      const updated = copilotSessions.get(sessionId)
      if (updated) {
        updated.status = 'error'
        updated.error = err.message ?? 'Unknown error during deep analysis'
        copilotSessions.set(sessionId, updated)
        console.error(`[copilot][route] Deep analysis error for session ${sessionId}:`, err.message)
      }
    })

  res.status(202).json({
    success: true,
    status: 'analyzing',
    sessionId,
    message: 'Deep analysis started. Poll /api/copilot/status/:sessionId for updates.',
  })
})

// ─── GET /api/copilot/status/:sessionId ───────────────────────────────────

router.get('/copilot/status/:sessionId', (req, res) => {
  const { sessionId } = req.params
  const session = copilotSessions.get(sessionId)

  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' })
  }

  res.json({
    success: true,
    sessionId,
    status: session.status,
    asset: session.trade.symbol,
    action: session.trade.action,
    timestamp: session.timestamp,
    completedAt: session.completedAt,
    error: session.error,
    hasQuickCheck: !!session.quickCheck,
    hasDeepAnalysis: !!session.deepAnalysis,
  })
})

// ─── GET /api/copilot/report/:sessionId ───────────────────────────────────

router.get('/copilot/report/:sessionId', (req, res) => {
  const { sessionId } = req.params
  const session = copilotSessions.get(sessionId)

  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' })
  }

  res.json({
    success: true,
    sessionId,
    status: session.status,
    trade: session.trade,
    quickCheck: session.quickCheck,
    deepAnalysis: session.deepAnalysis,
    timestamp: session.timestamp,
    completedAt: session.completedAt,
    error: session.error,
  })
})

// ─── POST /api/copilot/backtest ────────────────────────────────────────────
// Backtests RSI+MACD signals on 90 days of real historical OHLCV data.

const backtestLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many backtest requests — please wait a minute.' },
})

const BacktestSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  holdingPeriodDays: z.number().int().min(1).max(30).default(3),
  periodDays: z.number().int().min(30).max(90).default(90),
})

router.post('/copilot/backtest', backtestLimiter, async (req, res) => {
  const parsed = BacktestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors })
  }

  const { symbol, holdingPeriodDays, periodDays } = parsed.data

  if (!SUPPORTED_BACKTEST_ASSETS.has(symbol)) {
    return res.status(400).json({
      error: `Unsupported asset. Supported: ${[...SUPPORTED_BACKTEST_ASSETS].join(', ')}`,
    })
  }

  const cacheKey = `${symbol}:${holdingPeriodDays}:${periodDays}`
  const now = Date.now()
  const cached = backtestCache.get(cacheKey)
  if (cached && now < cached.expiresAt) {
    return res.json({ success: true, cached: true, ...(cached.result as object) })
  }

  try {
    console.log(`[copilot][backtest] Running: ${symbol} hold=${holdingPeriodDays}d period=${periodDays}d`)
    const result = await runBacktest(symbol, holdingPeriodDays, periodDays)
    backtestCache.set(cacheKey, { result, expiresAt: now + BACKTEST_CACHE_TTL_MS })
    res.json({ success: true, cached: false, ...result })
  } catch (err: any) {
    console.error('[copilot][backtest] error:', err.message)
    res.status(500).json({ error: err.message ?? 'Backtest failed' })
  }
})

// ─── GET /api/health ─────────────────────────────────────────────────────

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})
