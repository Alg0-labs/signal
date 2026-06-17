/**
 * Crypto News RSS Fetcher
 * Replaces CryptoPanic (which was rate-limiting / 404ing).
 * Uses CoinTelegraph tag RSS (symbol-specific) + general RSS fallbacks.
 */

// Map crypto symbols to CoinTelegraph tag slugs
const SYMBOL_TO_CT_TAG: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binance',
  MATIC: 'polygon', ARB: 'arbitrum', OP: 'optimism', AVAX: 'avalanche',
  LINK: 'chainlink', UNI: 'uniswap', AAVE: 'aave', INJ: 'injective-protocol',
  SUI: 'sui', APT: 'aptos', DOT: 'polkadot', ADA: 'cardano', XRP: 'ripple',
  DOGE: 'dogecoin', SHIB: 'shiba-inu', LTC: 'litecoin', ATOM: 'cosmos',
  NEAR: 'near-protocol', ALGO: 'algorand', ICP: 'internet-computer',
}

// General fallback feeds (ordered by reliability)
const GENERAL_FEEDS = [
  'https://cointelegraph.com/rss',
  'https://cryptonews.com/news/feed/',
  'https://decrypt.co/feed',
]

export interface RssNewsItem {
  title: string
  url: string
  source: string
  publishedAt: number
  sentiment: 'positive' | 'negative' | 'neutral'
  importance: 'low' | 'medium' | 'high'
  summary?: string // article description (used to enrich RAG embeddings)
}

// RSS <link>/<guid> often wrap the URL in CDATA and HTML-encode the query string
// (&amp;). Unwrap + decode so we store a clean, clickable https URL.
function cleanUrl(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/[<>\s]/g, '')
    .trim()
}

function stripHtml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim()
}

function estimateSentiment(text: string): RssNewsItem['sentiment'] {
  const lower = text.toLowerCase()
  const bullish = ['surge', 'rally', 'gain', 'breakout', 'bull', 'approval', 'adoption', 'inflow', 'record', 'high', 'upgrade', 'launch', 'partnership', 'soars', 'rises', 'jumps']
  const bearish = ['drop', 'fall', 'crash', 'sell-off', 'bear', 'hack', 'exploit', 'ban', 'regulation', 'lawsuit', 'liquidation', 'outflow', 'dump', 'plunge', 'decline', 'risk']
  const b = bullish.reduce((s, t) => s + (lower.includes(t) ? 1 : 0), 0)
  const br = bearish.reduce((s, t) => s + (lower.includes(t) ? 1 : 0), 0)
  if (b > br + 1) return 'positive'
  if (br > b + 1) return 'negative'
  return 'neutral'
}

function isRelevant(text: string, symbol: string): boolean {
  const tag = SYMBOL_TO_CT_TAG[symbol.toUpperCase()] ?? symbol.toLowerCase()
  const lower = text.toLowerCase()
  const symbolLower = symbol.toLowerCase()
  // Match the symbol name, tag name, or full token name
  return lower.includes(symbolLower) || lower.includes(tag) || lower.includes(` ${tag} `)
}

function parseRss(xml: string, source: string, symbol: string, filterBySymbol: boolean): RssNewsItem[] {
  const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? []
  const items: RssNewsItem[] = []

  for (const block of itemBlocks.slice(0, 50)) {
    const titleRaw = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? ''
    const linkRaw = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]
      ?? block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] ?? ''
    const descRaw = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? ''
    const pubRaw = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? ''

    const title = stripHtml(titleRaw)
    const desc = stripHtml(descRaw)
    const combined = `${title} ${desc}`

    if (!title || title.length < 10) continue
    if (filterBySymbol && !isRelevant(combined, symbol)) continue

    const publishedAt = pubRaw ? new Date(pubRaw).getTime() : Date.now()

    items.push({
      title: title.slice(0, 120),
      url: cleanUrl(linkRaw) || source,
      source,
      publishedAt: isNaN(publishedAt) ? Date.now() : publishedAt,
      sentiment: estimateSentiment(combined),
      importance: combined.toLowerCase().includes('breaking') || combined.toLowerCase().includes('hack') ? 'high' : 'medium',
      summary: desc.slice(0, 400),
    })
  }

  return items
}

async function fetchRss(url: string, timeoutMs = 6000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; OracleBot/1.0)',
      },
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/**
 * Fetch news for a specific crypto symbol.
 * Primary: CoinTelegraph tag RSS (symbol-specific)
 * Fallback: General RSS feeds filtered by keyword
 */
export async function fetchNewsForSymbol(symbol: string): Promise<RssNewsItem[]> {
  const tag = SYMBOL_TO_CT_TAG[symbol.toUpperCase()] ?? symbol.toLowerCase()

  // 1. Try CoinTelegraph tag-specific RSS first
  const ctUrl = `https://cointelegraph.com/rss/tag/${tag}`
  const ctXml = await fetchRss(ctUrl)
  if (ctXml && (ctXml.includes('<item>') || ctXml.includes('<entry>'))) {
    const items = parseRss(ctXml, 'CoinTelegraph', symbol, false)
    if (items.length > 0) {
      console.log(`[copilot][news-rss] CoinTelegraph tag/${tag}: ${items.length} articles`)
      return items.slice(0, 10)
    }
  }

  // 2. Try cryptonews symbol-specific
  const cnUrl = `https://cryptonews.com/news/${tag.replace(/-/g, '')}-news/feed/`
  const cnXml = await fetchRss(cnUrl)
  if (cnXml && cnXml.includes('<item>')) {
    const items = parseRss(cnXml, 'CryptoNews', symbol, false)
    if (items.length > 0) {
      console.log(`[copilot][news-rss] CryptoNews ${symbol}: ${items.length} articles`)
      return items.slice(0, 10)
    }
  }

  // 3. Fall back to general feeds filtered by keyword
  for (const url of GENERAL_FEEDS) {
    const xml = await fetchRss(url)
    if (!xml || !xml.includes('<item>')) continue
    const sourceName = url.includes('cointelegraph') ? 'CoinTelegraph'
      : url.includes('cryptonews') ? 'CryptoNews' : 'Decrypt'
    const items = parseRss(xml, sourceName, symbol, true) // filter by symbol
    if (items.length > 0) {
      console.log(`[copilot][news-rss] ${sourceName} general (filtered): ${items.length} articles for ${symbol}`)
      return items.slice(0, 10)
    }
  }

  // 4. Last resort: general CoinTelegraph with no filtering
  const ctGeneralXml = await fetchRss('https://cointelegraph.com/rss')
  if (ctGeneralXml && ctGeneralXml.includes('<item>')) {
    const items = parseRss(ctGeneralXml, 'CoinTelegraph', symbol, false).slice(0, 5)
    console.log(`[copilot][news-rss] CoinTelegraph general fallback: ${items.length} articles`)
    return items
  }

  console.log(`[copilot][news-rss] No news found for ${symbol}`)
  return []
}

/**
 * Compute sentiment score from news items.
 * Returns score in [-1, 1] range.
 */
export function computeNewsSentiment(items: RssNewsItem[]): {
  score: number
  positiveCount: number
  negativeCount: number
} {
  if (items.length === 0) return { score: 0, positiveCount: 0, negativeCount: 0 }
  let pos = 0, neg = 0
  for (const item of items) {
    if (item.sentiment === 'positive') pos++
    else if (item.sentiment === 'negative') neg++
  }
  const total = items.length
  const score = (pos - neg) / total
  return { score, positiveCount: pos, negativeCount: neg }
}
