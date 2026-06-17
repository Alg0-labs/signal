/**
 * Shared Agent Memory — the single source of truth passed through every node in the graph.
 *
 * Quant design principle: gather all market data ONCE, then every agent reads
 * from the same snapshot. No duplicated API calls. No stale data inconsistencies.
 * Each agent writes its output into well-defined slots.
 */

import { Annotation } from '@langchain/langgraph'
import type {
  TradeIntent,
  QuickCheckResult,
  AnalystReport,
  DebateMessage,
  TradingDecision,
  RiskAssessment,
  DeepAnalysisResult,
} from '../types.js'

// ── Market data snapshot (fetched once, shared by all agents) ─────────────────
export interface MarketSnapshot {
  symbol: string
  price: number
  change24h: number
  change7d: number
  volume24h: number
  marketCap: number
  ath: number
  atl: number
  rsi: number
  macd: { value: number; signal: number; histogram: number }
  atr: number
  volumeAnomaly: number
  avgVolume: number
  ohlcv: { time: number; open: number; high: number; low: number; close: number }[]
  // Rich CMC context for LLM agents (markdown from MCP server)
  cmcInfoReport: string
  cmcAnalyticsReport: string
  // News context
  newsScore: number
  positiveNewsCount: number
  negativeNewsCount: number
  topHeadlines: string[]
  fetchedAt: number
}

// ── Agent log entry — tracks what each agent did and how long it took ──────────
export interface AgentLogEntry {
  agent: string
  action: string
  startedAt: number
  durationMs: number
  success: boolean
  notes?: string
}

// ── LangGraph State Annotation (reducers control how each channel is merged) ──
export const CopilotStateAnnotation = Annotation.Root({
  // ─ Input (set once at graph entry) ─────────────────────────────────────────
  trade: Annotation<TradeIntent>({
    reducer: (_prev, next) => next,
  }),
  quickCheck: Annotation<QuickCheckResult>({
    reducer: (_prev, next) => next,
  }),

  // ─ Shared market snapshot (gathered once in first node) ─────────────────────
  market: Annotation<MarketSnapshot | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // ─ Analyst outputs (each analyst appends its report) ────────────────────────
  analystReports: Annotation<AnalystReport[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // ─ Debate transcript (debate node sets the full array at once) ───────────────
  debateTranscript: Annotation<DebateMessage[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  // ─ Trading decision (decision-maker node sets this) ─────────────────────────
  tradingDecision: Annotation<TradingDecision | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // ─ Risk assessment (risk node sets this) ────────────────────────────────────
  riskAssessment: Annotation<RiskAssessment | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // ─ Final output ─────────────────────────────────────────────────────────────
  finalResult: Annotation<DeepAnalysisResult | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // ─ Observability: every agent appends its log entry ─────────────────────────
  agentLog: Annotation<AgentLogEntry[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
})

export type CopilotState = typeof CopilotStateAnnotation.State

// ── Helper: log an agent run ──────────────────────────────────────────────────
export function makeLogEntry(
  agent: string,
  action: string,
  startedAt: number,
  success: boolean,
  notes?: string
): AgentLogEntry {
  return { agent, action, startedAt, durationMs: Date.now() - startedAt, success, notes }
}
