import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api",
  timeout: 60000,
  headers: { "Content-Type": "application/json" },
});

// Types mirroring actual backend response
export interface QuickCheckResult {
  success: boolean;
  sessionId: string;
  severity: "low" | "medium" | "high";
  recommendation: "EXECUTE" | "CAUTION" | "AVOID";
  confidence: number;
  insights: string[];
  suggestedActions: Array<{ label: string; action: string }>;
  executionTimeMs: number;
  signals: {
    momentum: {
      rsi: number;
      macd: { value: number; signal: number; histogram: number };
      trend: string;
      priceChange24h: number;
      confidence: number;
    };
    sentiment: {
      score: number;
      fearGreedIndex: number;
      fearGreedLabel: string;
      trending: boolean;
      shift: string;
      confidence: number;
    };
    whales: {
      volumeAnomaly: number;
      direction: string;
      alert: boolean;
      netFlow: string;
      confidence: number;
    };
    news: {
      hasBreakingNews: boolean;
      sentiment: string;
      importance: string;
      headlines: string[];
      confidence: number;
    };
  };
}

export interface AnalystReport {
  analyst: "market" | "sentiment" | "news" | "onchain";
  timestamp: string;
  asset: string;
  keyFindings: string[];
  metrics: Record<string, number | string>;
  signal: "bullish" | "bearish" | "neutral";
  confidence: number;
  reasoning: string;
}

export interface DebateMessage {
  speaker: "bull" | "bear" | "facilitator";
  round: number;
  argument: string;
  keyPoints: string[];
}

export interface DeepAnalysisResult {
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  conviction: "strong" | "moderate" | "weak";
  positionSize: number;
  entryStrategy: { method: "market" | "limit" | "dca"; targetPrice?: number; dcaSchedule?: string };
  exitStrategy: { targetPrice?: number; stopLoss?: number; trailingStop?: number };
  alternatives: Array<{ action: string; description: string }>;
  analystReports: AnalystReport[];
  debate: DebateMessage[];
  risk: {
    riskLevel: "low" | "medium" | "high" | "extreme";
    maxPositionPct: number;
    suggestedPositionPct: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    riskRewardRatio?: number;
    warnings: string[];
  };
  executionTimeMs: number;
}

export interface ChartData {
  symbol: string;
  prices: Array<[number, number]>;
  volumes: Array<[number, number]>;
  marketData: {
    currentPrice: number;
    priceChange24h: number;
    priceChangePercent24h: number;
    marketCap: number;
    volume24h: number;
    high24h: number;
    low24h: number;
  };
  indicators?: {
    rsi: number;
    macd: { value: number; signal: number; histogram: number };
    bb: { upper: number; middle: number; lower: number };
  };
}

export interface Citation {
  index: number;
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  sentiment: string;
}

export interface Technicals {
  asOf: number;
  price: number;
  trend: { direction: "uptrend" | "downtrend" | "range"; strength: string; detail: string };
  levels: Array<{ price: number; kind: "support" | "resistance"; touches: number; distancePct: number }>;
  movingAverages: {
    ma20: number | null; ma50: number | null; ma200: number | null;
    stack: "bullish" | "bearish" | "mixed"; pricePosition: string; cross: string | null;
  };
  volume: { latest: number; avg20: number; ratio: number; confirmation: string };
  momentum: { rsi: number | null; rsiState: string; macdHistogram: number | null; macdState: string };
  correlation: { withBTC: number | null; beta: number | null; note: string };
}

export interface Analogs {
  windowSize: number;
  sampleSize: number;
  matches: Array<{ date: number; similarity: number; ret1d: number; ret3d: number; ret7d: number }>;
  bullishPct3d: number;
  avgRet3d: number;
  avgRet7d: number;
  summary: string;
}

export interface Pattern {
  name: string;
  bias: "bullish" | "bearish" | "neutral";
  confidence: "high" | "medium" | "low";
  description: string;
}

export interface OrderFlow {
  buyVolumePct: number;
  cvdTrend: "accumulation" | "distribution" | "balanced";
  netDeltaPct: number;
  bookImbalance: number;
  bookBias: "bid-heavy" | "ask-heavy" | "balanced";
  spreadPct: number;
  summary: string;
}

export interface ChartChatResponse {
  success: boolean;
  reply: string;
  citations: Citation[];
  ragAvailable: boolean;
  technicals: Technicals | null;
  analogs: Analogs | null;
  pattern: Pattern | null;
  orderFlow: OrderFlow | null;
  asOf: number;
}

export interface MarketContext {
  fearGreed: {
    value: number;
    label: string;
    trend: "rising" | "falling" | "stable";
    history: Array<{ value: number; label: string; timestamp: string }>;
  };
  portfolioImpact: Array<{
    symbol: string;
    priceChange: number;
    valueChange: number;
  }>;
  relevantNews: Array<{
    title: string;
    sentiment: "bullish" | "bearish" | "neutral";
    importance: "high" | "medium" | "low";
    url?: string;
    source?: string;
  }>;
}

// API calls
export const signalApi = {
  // Backend expects { asset, action } — asset is the ticker symbol (BTC, ETH...)
  quickCheck: (symbol: string, action: "BUY" | "SELL") =>
    api.post<QuickCheckResult>("/copilot/quick-check", { asset: symbol, action }),

  // Backend expects { sessionId } — must pass the UUID from the quick-check response
  startDeepAnalysis: (sessionId: string) =>
    api.post<{ sessionId: string; status: string }>("/copilot/deep-analysis", { sessionId }),

  getAnalysisStatus: (sessionId: string) =>
    api.get<{ status: string; progress?: number }>(`/copilot/status/${sessionId}`),

  getAnalysisReport: (sessionId: string) =>
    api.get<DeepAnalysisResult>(`/copilot/report/${sessionId}`),

  getChart: (symbol: string) =>
    api.get<ChartData>(`/copilot/chart/${symbol}`),

  // "Talk to the chart" — grounded in live market data + temporal RAG news.
  // Longer timeout: on Voyage's free 3 RPM tier the embed call may queue.
  chartChat: (
    symbol: string,
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    range?: { from?: number; to?: number },
    selection?: { from: number; to: number }
  ) =>
    api.post<ChartChatResponse>(
      "/copilot/chart-chat",
      { symbol, messages, range, selection },
      { timeout: 150000 }
    ),

  getMarket: (address?: string) =>
    api.get<MarketContext>(`/market/${address || "0x0000000000000000000000000000000000000000"}`),

  getWallet: (address: string) =>
    api.get(`/wallet/${address}`),

  chat: (address: string, messages: Array<{ role: string; content: string }>) =>
    api.post("/chat", { address, messages }),
};
