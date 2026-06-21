/**
 * CMC MCP Client
 * Talks to the remote CoinMarketCap Portfolio MCP server over the
 * Model Context Protocol (Streamable HTTP, stateless JSON-RPC).
 *
 * Deployed at https://crypto-portfolio-mcp.onrender.com/mcp/
 * Override with MCP_SERVER_URL (or legacy CMC_MCP_URL).
 *
 * Tool results are returned as markdown strings — designed for LLM
 * consumption in analyst agents. Falls back gracefully when the server
 * is unavailable.
 */

const DEFAULT_MCP_URL = 'https://crypto-portfolio-mcp.onrender.com/mcp/'
const MCP_URL = process.env.MCP_SERVER_URL ?? process.env.CMC_MCP_URL ?? DEFAULT_MCP_URL
// Health endpoint lives at the server root, not under /mcp
const HEALTH_URL = new URL('/health', MCP_URL).toString()
// Portfolio tools require a Moralis key; market tools don't. Optional.
const MORALIS_KEY = process.env.MORALIS_API_KEY
const TIMEOUT_MS = 12000

let rpcId = 0

interface MCPToolResult {
  content?: Array<{ type: string; text?: string }>
  isError?: boolean
}

/**
 * Parse a Streamable-HTTP response body, which may be either a plain JSON
 * object or an SSE stream of `event: message\ndata: {...}` frames.
 */
function parseStreamableBody(body: string): any | null {
  const trimmed = body.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed) } catch { return null }
  }
  // SSE framing — grab the last `data:` payload that parses as JSON
  let parsed: any = null
  for (const line of trimmed.split('\n')) {
    const l = line.trim()
    if (!l.startsWith('data:')) continue
    const payload = l.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    try { parsed = JSON.parse(payload) } catch { /* ignore partial frames */ }
  }
  return parsed
}

/**
 * Invoke an MCP tool and return its concatenated text content.
 * Returns null on transport error, RPC error, or empty result.
 */
async function callTool(name: string, args: Record<string, unknown>): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    if (MORALIS_KEY) headers['X-Moralis-Key'] = MORALIS_KEY

    const res = await fetch(MCP_URL, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++rpcId,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    })
    clearTimeout(timer)
    if (!res.ok) return null

    const rpc = parseStreamableBody(await res.text())
    if (!rpc || rpc.error) return null

    const result = rpc.result as MCPToolResult | undefined
    if (!result || result.isError || !Array.isArray(result.content)) return null

    const text = result.content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text!)
      .join('\n')
      .trim()

    return text || null
  } catch {
    return null
  }
}

/** Rich token info card (markdown) for a symbol — price, market cap, ATH/ATL, supply */
export async function getTokenInfoReport(symbol: string): Promise<string | null> {
  return callTool('get_token_info', { symbol: symbol.toUpperCase() })
}

/** Detailed analytics with timeframe breakdown (1h, 24h, 7d, 30d) */
export async function getTokenAnalyticsReport(symbol: string, timeframe: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<string | null> {
  return callTool('get_token_analytics', { symbol: symbol.toUpperCase(), timeframe })
}

/** Cross-chain presence report for a token */
export async function getCrossChainReport(symbol: string): Promise<string | null> {
  return callTool('search_token_across_chains', { symbol: symbol.toUpperCase() })
}

/** Compare two+ tokens side-by-side (server requires 2-10 symbols) */
export async function compareTokensReport(symbols: string[]): Promise<string | null> {
  const upper = symbols.map(s => s.toUpperCase())
  if (upper.length < 2) return null
  return callTool('compare_tokens', { symbols: upper.slice(0, 10) })
}

/** Health check — returns true if MCP server is running */
export async function isMCPAvailable(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Fetch a rich context bundle for an analyst agent.
 * Returns markdown string combining token info + analytics.
 * Falls back to a sentinel string if MCP unavailable.
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
