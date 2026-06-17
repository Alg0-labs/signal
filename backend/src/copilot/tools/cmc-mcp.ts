/**
 * CMC MCP HTTP Client
 * Calls the coinmarketcap_mcp FastAPI wrapper running on port 6274.
 * Returns formatted markdown strings — designed for LLM consumption in analyst agents.
 * Falls back gracefully when the MCP server is not running.
 */

const CMC_BASE = process.env.CMC_MCP_URL ?? 'http://localhost:6274'
const TIMEOUT_MS = 8000

async function fetchCMC(path: string, init?: RequestInit): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(`${CMC_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const json = await res.json() as { success?: boolean; data?: string; result?: string }
    return json.data ?? json.result ?? null
  } catch {
    return null
  }
}

/** Rich token info card (markdown) for a symbol — price, market cap, ATH/ATL, supply */
export async function getTokenInfoReport(symbol: string): Promise<string | null> {
  return fetchCMC(`/api/v1/market/token/${encodeURIComponent(symbol.toUpperCase())}`)
}

/** Detailed analytics with timeframe breakdown (1h, 24h, 7d, 30d) */
export async function getTokenAnalyticsReport(symbol: string, timeframe: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<string | null> {
  return fetchCMC(`/api/v1/market/analytics/${encodeURIComponent(symbol.toUpperCase())}?timeframe=${timeframe}`)
}

/** Cross-chain presence report for a token */
export async function getCrossChainReport(symbol: string): Promise<string | null> {
  return fetchCMC(`/api/v1/market/search/${encodeURIComponent(symbol.toUpperCase())}`)
}

/** Compare two+ tokens side-by-side */
export async function compareTokensReport(symbols: string[]): Promise<string | null> {
  return fetchCMC('/api/v1/market/compare/tokens', {
    method: 'POST',
    body: JSON.stringify({ symbols: symbols.map(s => s.toUpperCase()) }),
  })
}

/** Health check — returns true if MCP server is running */
export async function isMCPAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${CMC_BASE}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Fetch a rich context bundle for an analyst agent.
 * Returns markdown string combining token info + analytics.
 * Falls back to empty string if MCP unavailable.
 */
export async function getAnalystContext(symbol: string): Promise<string> {
  const [info, analytics] = await Promise.allSettled([
    getTokenInfoReport(symbol),
    getTokenAnalyticsReport(symbol, '24h'),
  ])

  const parts: string[] = []
  if (info.status === 'fulfilled' && info.value) parts.push(info.value)
  if (analytics.status === 'fulfilled' && analytics.value) parts.push(analytics.value)

  if (parts.length === 0) {
    return `[CMC MCP unavailable — operating without CoinMarketCap data for ${symbol}]`
  }

  return parts.join('\n\n---\n\n')
}
