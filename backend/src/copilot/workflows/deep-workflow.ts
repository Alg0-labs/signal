/**
 * Deep Analysis Workflow — LangGraph State Graph
 *
 * Graph topology:
 *
 *   START
 *     │
 *     ▼
 *  gather_data          ← fetches all market data once into SharedMemory
 *     │
 *     ▼
 *  [parallel analysts]  ← market / sentiment / news / onchain (fan-out via Send API)
 *     │
 *     ▼
 *  debate               ← bull vs bear, 2 rounds + facilitator synthesis
 *     │
 *     ▼
 *  decide               ← trader agent synthesizes all reports + debate
 *     │
 *     ▼
 *  assess_risk          ← pure ATR-based position sizing + stop levels
 *     │
 *     ▼
 *  finalize             ← assembles DeepAnalysisResult
 *     │
 *     END
 */

import { StateGraph, START, END } from '@langchain/langgraph'
import { getOHLCV, getMarketData, getVolumeHistory } from '../tools/market-data.js'
import { calculateRSI, calculateMACD, calculateATR } from '../tools/indicators.js'
import { fetchNewsForSymbol, computeNewsSentiment } from '../tools/news-rss.js'
import { getAnalystContext } from '../tools/cmc-mcp.js'
import { analyzeMarket } from '../agents/market-analyst.js'
import { analyzeSentiment } from '../agents/sentiment-analyst.js'
import { analyzeNews } from '../agents/news-analyst.js'
import { analyzeOnchain } from '../agents/onchain-analyst.js'
import { runDebate } from '../agents/debate.js'
import { makeDecision } from '../agents/decision-maker.js'
import { assessRisk } from '../agents/risk-calculator.js'
import {
  CopilotStateAnnotation,
  makeLogEntry,
  type CopilotState,
  type MarketSnapshot,
} from '../state/shared-memory.js'
import type { TradeIntent, QuickCheckResult, DeepAnalysisResult, AnalystReport } from '../types.js'

// ── Node: Run all 4 analysts in parallel (single node = simpler fan-in) ───────
async function analyzeAllNode(state: CopilotState): Promise<Partial<CopilotState>> {
  const t = Date.now()
  const [mR, sR, nR, oR] = await Promise.allSettled([
    marketAnalystNode(state),
    sentimentAnalystNode(state),
    newsAnalystNode(state),
    onchainAnalystNode(state),
  ])

  const reports: AnalystReport[] = []
  const logs: CopilotState['agentLog'] = []

  for (const result of [mR, sR, nR, oR]) {
    if (result.status === 'fulfilled') {
      if (result.value.analystReports) reports.push(...result.value.analystReports)
      if (result.value.agentLog) logs.push(...result.value.agentLog)
    }
  }

  logs.push(makeLogEntry('analyze_all', `${reports.length}/4 analysts complete`, t, true))
  return { analystReports: reports, agentLog: logs }
}

// ── Node: Gather all market data into shared memory ───────────────────────────
async function gatherDataNode(state: CopilotState): Promise<Partial<CopilotState>> {
  const t = Date.now()
  const symbol = state.trade.symbol.toUpperCase()

  console.log(`[copilot][graph] gather_data: ${symbol}`)

  const [ohlcvResult, marketResult, volumeResult, newsResult, cmcResult] = await Promise.allSettled([
    getOHLCV(symbol, 60),
    getMarketData(symbol),
    getVolumeHistory(symbol, 7),
    fetchNewsForSymbol(symbol),
    getAnalystContext(symbol),          // CMC MCP — rich markdown for LLM agents
  ])

  const ohlcv = ohlcvResult.status === 'fulfilled' ? ohlcvResult.value : []
  const market = marketResult.status === 'fulfilled' ? marketResult.value : null
  const volumeHistory = volumeResult.status === 'fulfilled' ? volumeResult.value : []
  const newsPosts = newsResult.status === 'fulfilled' ? newsResult.value : []
  const cmcCtx = cmcResult.status === 'fulfilled' ? cmcResult.value : ''

  // Technical indicators
  const closes = ohlcv.map(c => c.close)
  const rsi = closes.length >= 15 ? calculateRSI(closes, 14) : NaN
  const macdRaw = closes.length >= 35 ? calculateMACD(closes, 12, 26, 9) : { macd: NaN, signal: NaN, histogram: NaN }
  const atr = ohlcv.length >= 15 ? calculateATR(ohlcv, 14) : NaN

  // Volume anomaly
  const historicalVols = volumeHistory.slice(0, -1).map(v => v.volume)
  const avgVolume = historicalVols.length > 0 ? historicalVols.reduce((a, b) => a + b, 0) / historicalVols.length : 0
  const volumeAnomaly = avgVolume > 0 && market ? market.volume24h / avgVolume : 1

  // News sentiment
  const { score: newsScore, positiveCount, negativeCount } = computeNewsSentiment(newsPosts)
  const topHeadlines = newsPosts.slice(0, 3).map((p: any) => p.title)

  // Build CMC context parts
  const parts = cmcCtx.split('\n\n---\n\n')
  const cmcInfoReport = parts[0] ?? ''
  const cmcAnalyticsReport = parts[1] ?? ''

  const snapshot: MarketSnapshot = {
    symbol,
    price: market?.price ?? 0,
    change24h: market?.change24h ?? 0,
    change7d: market?.priceChange7d ?? 0,
    volume24h: market?.volume24h ?? 0,
    marketCap: market?.marketCap ?? 0,
    ath: market?.ath ?? 0,
    atl: market?.atl ?? 0,
    rsi: isNaN(rsi) ? 50 : rsi,
    macd: {
      value: isNaN(macdRaw.macd) ? 0 : macdRaw.macd,
      signal: isNaN(macdRaw.signal) ? 0 : macdRaw.signal,
      histogram: isNaN(macdRaw.histogram) ? 0 : macdRaw.histogram,
    },
    atr: isNaN(atr) ? 0 : atr,
    volumeAnomaly,
    avgVolume,
    ohlcv,
    cmcInfoReport,
    cmcAnalyticsReport,
    newsScore,
    positiveNewsCount: positiveCount,
    negativeNewsCount: negativeCount,
    topHeadlines,
    fetchedAt: Date.now(),
  }

  return {
    market: snapshot,
    agentLog: [makeLogEntry('gather_data', 'fetch_market_snapshot', t, true,
      `CMC MCP: ${cmcInfoReport ? 'OK' : 'unavailable'}, ohlcv: ${ohlcv.length} candles`)],
  }
}

// ── Node: Market Analyst ───────────────────────────────────────────────────────
async function marketAnalystNode(state: CopilotState): Promise<Partial<CopilotState>> {
  const t = Date.now()
  try {
    const report = await analyzeMarket(state.trade, {
      ohlcv: state.market?.ohlcv ?? [],
      market: { price: state.market?.price ?? 0, change24h: state.market?.change24h ?? 0 },
      rsi: state.market?.rsi ?? 50,
      macd: state.market?.macd ?? { value: 0, signal: 0, histogram: 0 },
      atr: state.market?.atr ?? 0,
      // Include CMC context for richer analysis
      cmcContext: state.market?.cmcAnalyticsReport ?? '',
    })
    return {
      analystReports: [report],
      agentLog: [makeLogEntry('market_analyst', 'analyze', t, true)],
    }
  } catch (err: any) {
    return { agentLog: [makeLogEntry('market_analyst', 'analyze', t, false, err.message)] }
  }
}

// ── Node: Sentiment Analyst ────────────────────────────────────────────────────
async function sentimentAnalystNode(state: CopilotState): Promise<Partial<CopilotState>> {
  const t = Date.now()
  try {
    const report = await analyzeSentiment(state.trade, {
      fearGreed: {
        value: state.quickCheck.signals.sentiment.fearGreedIndex,
        label: state.quickCheck.signals.sentiment.fearGreedLabel,
        trend: state.quickCheck.signals.sentiment.shift,
      },
      pulse: {
        score: state.quickCheck.signals.sentiment.score,
        shift: state.quickCheck.signals.sentiment.shift,
        trending: state.quickCheck.signals.sentiment.trending,
      },
      positiveCount: state.market?.positiveNewsCount ?? 0,
      negativeCount: state.market?.negativeNewsCount ?? 0,
      // CMC info gives community/social context
      cmcContext: state.market?.cmcInfoReport ?? '',
    })
    return {
      analystReports: [report],
      agentLog: [makeLogEntry('sentiment_analyst', 'analyze', t, true)],
    }
  } catch (err: any) {
    return { agentLog: [makeLogEntry('sentiment_analyst', 'analyze', t, false, err.message)] }
  }
}

// ── Node: News Analyst ────────────────────────────────────────────────────────
async function newsAnalystNode(state: CopilotState): Promise<Partial<CopilotState>> {
  const t = Date.now()
  try {
    const report = await analyzeNews(state.trade, {
      impact: state.quickCheck.signals.news,
      topHeadlines: state.market?.topHeadlines ?? [],
      cmcContext: state.market?.cmcInfoReport ?? '',
    })
    return {
      analystReports: [report],
      agentLog: [makeLogEntry('news_analyst', 'analyze', t, true)],
    }
  } catch (err: any) {
    return { agentLog: [makeLogEntry('news_analyst', 'analyze', t, false, err.message)] }
  }
}

// ── Node: On-Chain Analyst ────────────────────────────────────────────────────
async function onchainAnalystNode(state: CopilotState): Promise<Partial<CopilotState>> {
  const t = Date.now()
  try {
    const report = await analyzeOnchain(state.trade, {
      whales: state.quickCheck.signals.whales,
      market: { price: state.market?.price ?? 0, change24h: state.market?.change24h ?? 0 },
      volumeAnomaly: state.market?.volumeAnomaly ?? 1,
      avgVolume: state.market?.avgVolume ?? 0,
    })
    return {
      analystReports: [report],
      agentLog: [makeLogEntry('onchain_analyst', 'analyze', t, true)],
    }
  } catch (err: any) {
    return { agentLog: [makeLogEntry('onchain_analyst', 'analyze', t, false, err.message)] }
  }
}

// ── Node: Debate ───────────────────────────────────────────────────────────────
async function debateNode(state: CopilotState): Promise<Partial<CopilotState>> {
  const t = Date.now()
  try {
    const transcript = await runDebate(state.analystReports, state.trade, 2)
    return {
      debateTranscript: transcript,
      agentLog: [makeLogEntry('debate', `${transcript.length} messages`, t, true)],
    }
  } catch (err: any) {
    return {
      debateTranscript: [],
      agentLog: [makeLogEntry('debate', 'run', t, false, err.message)],
    }
  }
}

// ── Node: Decision Maker ───────────────────────────────────────────────────────
async function decideNode(state: CopilotState): Promise<Partial<CopilotState>> {
  const t = Date.now()
  try {
    const decision = await makeDecision(
      state.trade,
      state.analystReports,
      state.debateTranscript,
      state.quickCheck,
    )
    return {
      tradingDecision: decision,
      agentLog: [makeLogEntry('decision_maker', `${decision.action} ${decision.conviction}`, t, true)],
    }
  } catch (err: any) {
    // Default to HOLD if decision fails
    return {
      tradingDecision: {
        action: 'HOLD',
        conviction: 'weak',
        confidence: 0.3,
        reasoning: 'Decision maker failed — defaulting to HOLD.',
        positionSizePct: 0,
        entryMethod: 'market',
      },
      agentLog: [makeLogEntry('decision_maker', 'decide', t, false, err.message)],
    }
  }
}

// ── Node: Risk Assessment ──────────────────────────────────────────────────────
async function assessRiskNode(state: CopilotState): Promise<Partial<CopilotState>> {
  const t = Date.now()
  const risk = await assessRisk(
    state.trade,
    state.tradingDecision!,
    state.quickCheck.signals,
    { ohlcv: state.market?.ohlcv ?? [], market: { price: state.market?.price ?? 0 } },
  )
  return {
    riskAssessment: risk,
    agentLog: [makeLogEntry('risk_calculator', risk.riskLevel, t, true)],
  }
}

// ── Node: Finalize ─────────────────────────────────────────────────────────────
async function finalizeNode(state: CopilotState): Promise<Partial<CopilotState>> {
  const t = Date.now()
  const decision = state.tradingDecision!
  const risk = state.riskAssessment!
  const currentPrice = state.market?.price ?? 0

  const entryStrategy: DeepAnalysisResult['entryStrategy'] = { method: decision.entryMethod }
  if (decision.entryMethod === 'limit' && currentPrice > 0) {
    entryStrategy.targetPrice = parseFloat(
      (currentPrice * (state.trade.action === 'BUY' ? 0.99 : 1.01)).toFixed(2)
    )
  } else if (decision.entryMethod === 'dca') {
    entryStrategy.dcaSchedule = 'Split into 3 equal parts over 3 days'
  }

  const exitStrategy: DeepAnalysisResult['exitStrategy'] = {}
  if (risk.takeProfitPrice) exitStrategy.targetPrice = risk.takeProfitPrice
  if (risk.stopLossPrice) exitStrategy.stopLoss = risk.stopLossPrice
  if (decision.action === 'BUY' && currentPrice > 0) {
    exitStrategy.trailingStop = parseFloat((currentPrice * 0.05).toFixed(2))
  }

  const alternatives: DeepAnalysisResult['alternatives'] = []
  if (decision.action !== 'HOLD') {
    alternatives.push({ action: 'HOLD', description: 'Wait for clearer entry signal or lower risk' })
  }
  if (decision.entryMethod !== 'dca') {
    alternatives.push({ action: `${decision.action} via DCA`, description: 'Dollar-cost average to reduce timing risk' })
  }
  if (decision.action === 'BUY' && currentPrice > 0) {
    alternatives.push({
      action: 'LIMIT ORDER',
      description: `Set a limit buy at $${(currentPrice * 0.97).toFixed(2)} for 3% better entry`,
    })
  }

  // Total execution time = sum of all agent durations
  const totalMs = state.agentLog.reduce((sum, e) => sum + e.durationMs, 0)

  const result: DeepAnalysisResult = {
    action: decision.action,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    conviction: decision.conviction,
    positionSize: Math.min(decision.positionSizePct, risk.suggestedPositionPct),
    entryStrategy,
    exitStrategy,
    alternatives,
    analystReports: state.analystReports,
    debate: state.debateTranscript,
    risk,
    executionTimeMs: totalMs,
  }

  return {
    finalResult: result,
    agentLog: [makeLogEntry('finalize', 'compose_result', t, true,
      `${state.analystReports.length} analysts, ${state.debateTranscript.length} debate msgs`)],
  }
}

// ── Build the LangGraph StateGraph ────────────────────────────────────────────
// Graph topology (linear with internal parallelism in analyze_all):
//   START → gather_data → analyze_all → debate → decide → assess_risk → finalize → END
//
// The 4 analysts run in parallel INSIDE analyze_all via Promise.allSettled.
// This avoids the TypeScript fan-out/fan-in type complexity while keeping parallelism.

function buildGraph() {
  return new StateGraph(CopilotStateAnnotation)
    .addNode('gather_data', gatherDataNode)
    .addNode('analyze_all', analyzeAllNode)   // 4 analysts in parallel internally
    .addNode('debate', debateNode)
    .addNode('decide', decideNode)
    .addNode('assess_risk', assessRiskNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'gather_data')
    .addEdge('gather_data', 'analyze_all')
    .addEdge('analyze_all', 'debate')
    .addEdge('debate', 'decide')
    .addEdge('decide', 'assess_risk')
    .addEdge('assess_risk', 'finalize')
    .addEdge('finalize', END)
    .compile()
}

// Singleton compiled graph — build once, reuse across requests
let _compiledGraph: ReturnType<typeof buildGraph> | null = null
function getGraph() {
  if (!_compiledGraph) _compiledGraph = buildGraph()
  return _compiledGraph
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function deepAnalysis(
  trade: TradeIntent,
  quickCheckResult: QuickCheckResult,
): Promise<DeepAnalysisResult> {
  const wallStart = Date.now()
  console.log(`[copilot][graph] Starting deep analysis: ${trade.symbol} ${trade.action}`)

  const graph = getGraph()

  const finalState = await graph.invoke({
    trade,
    quickCheck: quickCheckResult,
  })

  console.log(`[copilot][graph] Complete in ${Date.now() - wallStart}ms`)
  console.log(`[copilot][graph] Agent log:`)
  for (const entry of finalState.agentLog) {
    console.log(`  ${entry.success ? '✓' : '✗'} ${entry.agent.padEnd(20)} ${entry.durationMs}ms  ${entry.notes ?? ''}`)
  }

  if (!finalState.finalResult) {
    throw new Error('Graph completed but finalResult is null')
  }

  return finalState.finalResult
}
