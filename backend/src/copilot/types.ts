export interface TradeIntent {
  asset: string;           // e.g., 'ETH', 'BTC'
  symbol: string;          // Same as asset, uppercase
  action: 'BUY' | 'SELL';
  amount: number;
  fromAsset?: string;
  amountUSD?: number;
  portfolioContext?: {
    currentHoldings: Record<string, number>;
    availableUSD: number;
    riskTolerance: 'low' | 'moderate' | 'high';
  };
}

export interface MomentumSignal {
  rsi: number;
  macd: { value: number; signal: number; histogram: number };
  trend: 'oversold' | 'neutral' | 'overbought';
  priceChange24h: number;
  confidence: number;
}

export interface SentimentPulse {
  score: number;       // -1 to 1
  fearGreedIndex: number;
  fearGreedLabel: string;
  trending: boolean;
  shift: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
}

export interface WhaleActivity {
  volumeAnomaly: number;   // multiplier vs 7d avg (e.g. 2.5 = 2.5x normal)
  direction: 'accumulation' | 'distribution' | 'neutral';
  alert: boolean;
  netFlow: 'inflow' | 'outflow' | 'neutral';
  confidence: number;
}

export interface NewsImpact {
  hasBreakingNews: boolean;
  sentiment: 'positive' | 'negative' | 'neutral';
  importance: 'low' | 'medium' | 'high';
  headlines: string[];
  confidence: number;
}

export interface QuickCheckResult {
  severity: 'low' | 'medium' | 'high';
  recommendation: 'EXECUTE' | 'CAUTION' | 'AVOID';
  confidence: number;
  insights: string[];
  signals: {
    momentum: MomentumSignal;
    sentiment: SentimentPulse;
    whales: WhaleActivity;
    news: NewsImpact;
  };
  suggestedActions: Array<{
    label: string;
    action: 'execute' | 'wait' | 'limit' | 'analyze';
    params?: Record<string, unknown>;
  }>;
  sessionId?: string;
  executionTimeMs?: number;
}

export interface AnalystReport {
  analyst: 'market' | 'sentiment' | 'news' | 'onchain';
  timestamp: string;
  asset: string;
  keyFindings: string[];
  metrics: Record<string, number | string>;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
}

export interface DebateMessage {
  speaker: 'bull' | 'bear' | 'facilitator';
  round: number;
  argument: string;
  keyPoints: string[];
}

export interface RiskAssessment {
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
  maxPositionPct: number;
  suggestedPositionPct: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  riskRewardRatio?: number;
  warnings: string[];
}

export interface TradingDecision {
  action: 'BUY' | 'SELL' | 'HOLD';
  conviction: 'strong' | 'moderate' | 'weak';
  confidence: number;
  reasoning: string;
  positionSizePct: number;
  entryMethod: 'market' | 'limit' | 'dca';
}

export interface DeepAnalysisResult {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  conviction: 'strong' | 'moderate' | 'weak';
  positionSize: number;
  entryStrategy: { method: 'market' | 'limit' | 'dca'; targetPrice?: number; dcaSchedule?: string };
  exitStrategy: { targetPrice?: number; stopLoss?: number; trailingStop?: number };
  alternatives: Array<{ action: string; description: string }>;
  analystReports: AnalystReport[];
  debate: DebateMessage[];
  risk: RiskAssessment;
  executionTimeMs: number;
}

export interface CopilotSession {
  trade: TradeIntent;
  quickCheck?: QuickCheckResult;
  deepAnalysis?: DeepAnalysisResult;
  status: 'quick_complete' | 'analyzing' | 'complete' | 'error';
  error?: string;
  timestamp: number;
  completedAt?: number;
}
