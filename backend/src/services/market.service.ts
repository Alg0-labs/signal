import type {
  FearGreedData,
  MarketContext,
  MarketNewsInsight,
  NewsItem,
  PortfolioImpact,
  WalletData,
} from '../types/index.js'
import { extractEthMentions, matchNewsToEthHolding } from '../utils/tokenMatcher.js'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const CACHE_DURATION_MS = 15 * 60 * 1000
let marketCache: { data: Pick<MarketContext, 'fearGreed' | 'allNews'>; timestamp: number } | null = null

interface NewsProviderResult {
  provider: 'cryptonews'
  news: NewsItem[]
  ok: boolean
  status?: number
  error?: string
  raw?: unknown
}

async function writeMarketDebugLog(payload: Record<string, unknown>): Promise<void> {
  try {
    const dir = path.resolve(process.cwd(), 'debug', 'raw-news')
    await mkdir(dir, { recursive: true })
    const filename = `${Date.now()}-market-news.json`
    const filePath = path.join(dir, filename)
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
  } catch (error) {
    console.error('[market][debug-log]', error)
  }
}

function normalizeFearGreedLabel(raw: string): FearGreedData['label'] {
  if (raw === 'Extreme Fear') return 'Extreme Fear'
  if (raw === 'Fear') return 'Fear'
  if (raw === 'Greed') return 'Greed'
  if (raw === 'Extreme Greed') return 'Extreme Greed'
  return 'Neutral'
}

async function fetchFearGreed(): Promise<FearGreedData> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=7')
    const json = await res.json()

    if (!Array.isArray(json?.data) || json.data.length === 0) {
      throw new Error('No fear & greed data')
    }

    const history = json.data.map((row: any) => ({
      value: Number.parseInt(String(row.value), 10),
      timestamp: Number.parseInt(String(row.timestamp), 10) * 1000,
    }))

    const current = history[0]
    const oldest = history[history.length - 1]
    const diff = current.value - oldest.value
    const trendPrefix = diff >= 0 ? 'Increasing' : 'Decreasing'
    const trend = `${trendPrefix} from ${oldest.value} to ${current.value} over 7 days`

    return {
      value: current.value,
      label: normalizeFearGreedLabel(String(json.data[0].value_classification ?? 'Neutral')),
      timestamp: current.timestamp,
      trend,
      history,
    }
  } catch (error) {
    console.error('[market][fear-greed]', error)
    return {
      value: 50,
      label: 'Neutral',
      timestamp: Date.now(),
      trend: 'Data unavailable',
      history: [],
    }
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
}

function stripHtml(text: string): string {
  return decodeHtmlEntities(text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
}

function estimateSentimentFromText(text: string): NewsItem['sentiment'] {
  const lower = text.toLowerCase()
  const bullishSignals = ['surge', 'rally', 'bull', 'gain', 'breakout', 'approval', 'inflow', 'up']
  const bearishSignals = ['drop', 'fall', 'bear', 'sell-off', 'crash', 'liquidation', 'down', 'risk']
  const bullishScore = bullishSignals.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0)
  const bearishScore = bearishSignals.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0)
  if (bullishScore > bearishScore + 1) return 'bullish'
  if (bearishScore > bullishScore + 1) return 'bearish'
  return 'neutral'
}

function parseCryptoNewsRss(xmlText: string, sourceLabel: string): NewsItem[] {
  const itemBlocks = xmlText.match(/<item>([\s\S]*?)<\/item>/g) ?? []
  const items: NewsItem[] = []

  for (const block of itemBlocks.slice(0, 60)) {
    const titleRaw = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? ''
    const linkRaw = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? ''
    const descriptionRaw = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? ''
    const pubDateRaw = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? ''
    const title = stripHtml(titleRaw)
    const summary = stripHtml(descriptionRaw)
    const combined = `${title} ${summary}`.trim()
    if (!title || !linkRaw) continue

    items.push({
      id: linkRaw.trim(),
      title,
      summary: summary || title,
      url: linkRaw.trim(),
      source: sourceLabel,
      publishedAt: Number.isNaN(new Date(pubDateRaw).getTime()) ? Date.now() : new Date(pubDateRaw).getTime(),
      sentiment: estimateSentimentFromText(combined),
      relatedTokens: extractEthMentions(combined),
      importance: combined.toLowerCase().includes('breaking') ? 'high' : 'medium',
    })
  }

  return items
}

function parseCryptoNewsHtml(html: string, sourceLabel: string): NewsItem[] {
  const linkRegex = /<a[^>]+href="(https:\/\/cryptonews\.com\/news\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const seen = new Set<string>()
  const items: NewsItem[] = []
  let match: RegExpExecArray | null = null

  while ((match = linkRegex.exec(html)) !== null && items.length < 25) {
    const url = match[1].trim()
    const anchorInner = match[2]
    if (seen.has(url)) continue
    seen.add(url)

    const title = stripHtml(anchorInner)
    if (!title || title.length < 12) continue
    const combined = title
    items.push({
      id: url,
      title,
      summary: title,
      url,
      source: sourceLabel,
      publishedAt: Date.now(),
      sentiment: estimateSentimentFromText(combined),
      relatedTokens: extractEthMentions(combined),
      importance: combined.toLowerCase().includes('breaking') ? 'high' : 'medium',
    })
  }

  if (items.length > 0) return items

  const fallbackTitle = stripHtml(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '')
  if (!fallbackTitle) return []
  return [
    {
      id: `cryptonews-html-${Date.now()}`,
      title: fallbackTitle,
      summary: fallbackTitle,
      url: 'https://cryptonews.com/news/',
      source: sourceLabel,
      publishedAt: Date.now(),
      sentiment: estimateSentimentFromText(fallbackTitle),
      relatedTokens: extractEthMentions(fallbackTitle),
      importance: 'low',
    },
  ]
}

async function fetchCryptoNewsFeeds(): Promise<NewsProviderResult> {
  const feedUrls = [
    'https://cryptonews.com/news/ethereum-news/feed/',
    'https://cryptonews.com/news/ethereum/feed/',
    'https://cryptonews.com/news/eth/feed/',
    'https://cryptonews.com/news/feed/',
  ]

  const attempts: Array<Record<string, unknown>> = []

  for (const url of feedUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: 'application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8',
        },
      })
      const rawText = await res.text()
      const contentType = res.headers.get('content-type') ?? ''
      const lowerContentType = contentType.toLowerCase()
      const isXmlLike = lowerContentType.includes('xml') || rawText.includes('<rss') || rawText.includes('<channel>')

      attempts.push({
        url,
        status: res.status,
        contentType,
        preview: rawText.slice(0, 400),
      })

      if (!res.ok) continue

      const parsedNews = isXmlLike
        ? parseCryptoNewsRss(rawText, 'Cryptonews')
        : parseCryptoNewsHtml(rawText, 'Cryptonews')

      if (parsedNews.length > 0) {
        return {
          provider: 'cryptonews',
          news: parsedNews,
          ok: true,
          status: res.status,
          raw: {
            selectedUrl: url,
            contentType,
            totalResults: parsedNews.length,
            attempts,
          },
        }
      }
    } catch (error) {
      attempts.push({
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  try {
    const backupUrl = 'https://cryptonews.com/news/feed/'
    const res = await fetch(backupUrl)
    const rawText = await res.text()
    const parsedNews = parseCryptoNewsRss(rawText, 'Cryptonews')
    return {
      provider: 'cryptonews',
      news: parsedNews,
      ok: parsedNews.length > 0,
      status: res.status,
      raw: {
        selectedUrl: backupUrl,
        contentType: res.headers.get('content-type') ?? '',
        totalResults: parsedNews.length,
        attempts,
      },
    }
  } catch (error) {
    console.error('[market][cryptonews]', error)
    return {
      provider: 'cryptonews',
      news: [],
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      raw: { attempts },
    }
  }
}

async function fetchEth24hPriceChange(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true'
    )
    const json = await res.json()
    const change = Number(json?.ethereum?.usd_24h_change)
    return Number.isFinite(change) ? change : 0
  } catch (error) {
    console.error('[market][eth-24h-change]', error)
    return 0
  }
}

function aggregateSentiment(news: NewsItem[]): PortfolioImpact['sentiment'] {
  if (news.length === 0) return 'neutral'
  let bullish = 0
  let bearish = 0

  for (const item of news) {
    if (item.sentiment === 'bullish') bullish += 1
    if (item.sentiment === 'bearish') bearish += 1
  }

  if (bullish > bearish * 1.5) return 'bullish'
  if (bearish > bullish * 1.5) return 'bearish'
  if (bullish > 0 && bearish > 0) return 'mixed'
  return 'neutral'
}

function analyzeEthPortfolioImpact(
  wallet: WalletData,
  ethNews: NewsItem[],
  ethPriceChange24h: number
): PortfolioImpact[] {
  const netWorth = wallet.netWorthUsd > 0 ? wallet.netWorthUsd : 1
  const ethHoldingUsd = wallet.ethBalanceUsd
  const percentOfPortfolio = (ethHoldingUsd / netWorth) * 100

  const topNewsItem = [...ethNews].sort((a, b) => {
    if (a.importance === 'high' && b.importance !== 'high') return -1
    if (b.importance === 'high' && a.importance !== 'high') return 1
    return b.publishedAt - a.publishedAt
  })[0]

  return [
    {
      token: 'ETH',
      holdingUsd: ethHoldingUsd,
      percentOfPortfolio,
      priceChange24h: ethPriceChange24h,
      relatedNewsCount: ethNews.length,
      sentiment: aggregateSentiment(ethNews),
      topNewsItem,
    },
  ]
}

function buildReasoning(news: NewsItem): string {
  const summary = news.summary.replace(/\s+/g, ' ').trim()
  if (news.sentiment === 'bullish') {
    return `AI reads this as bullish because the headline/summary imply improving demand or positive ETH-specific catalysts. ${summary.slice(0, 140)}${summary.length > 140 ? '...' : ''}`
  }
  if (news.sentiment === 'bearish') {
    return `AI reads this as bearish because the wording suggests risk-off pressure, downside scenarios, or negative positioning for ETH. ${summary.slice(0, 140)}${summary.length > 140 ? '...' : ''}`
  }
  return `AI reads this as neutral because the content is mostly informational or mixed without a clear directional signal for ETH. ${summary.slice(0, 140)}${summary.length > 140 ? '...' : ''}`
}

function buildFearGreedConnection(news: NewsItem, fearGreed: FearGreedData): string {
  const value = fearGreed.value
  const trend = fearGreed.trend.toLowerCase()
  const isExtremeFear = value <= 20
  const isExtremeGreed = value >= 80
  const trendDirection = trend.includes('decreasing') ? 'risk appetite is weakening' : 'risk appetite is improving'

  if (news.sentiment === 'bearish' && isExtremeFear) {
    return `Matches current ${fearGreed.label} (${value}/100): bearish ETH headlines usually have outsized impact when market fear is already elevated.`
  }
  if (news.sentiment === 'bullish' && isExtremeFear) {
    return `Contrarian to ${fearGreed.label} (${value}/100): positive ETH news may signal selective recovery while broader market remains defensive.`
  }
  if (news.sentiment === 'bullish' && isExtremeGreed) {
    return `Aligned with ${fearGreed.label} (${value}/100): bullish ETH narratives can extend momentum, but watch for overextension risk.`
  }
  if (news.sentiment === 'bearish' && isExtremeGreed) {
    return `Diverges from ${fearGreed.label} (${value}/100): bearish ETH updates can be early warnings when the market is still complacent.`
  }
  return `Connection to Fear & Greed (${value}/100): ${trendDirection}; this headline is likely a secondary driver unless sentiment intensifies.`
}

function buildLatestNewsInsights(news: NewsItem[], fearGreed: FearGreedData): MarketNewsInsight[] {
  return [...news]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 10)
    .map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      sentiment: item.sentiment,
      aiReasoning: buildReasoning(item),
      fearGreedConnection: buildFearGreedConnection(item, fearGreed),
      url: item.url,
      source: item.source,
      publishedAt: item.publishedAt,
    }))
}

export async function fetchMarketContext(wallet: WalletData): Promise<MarketContext> {
  let fearGreed: FearGreedData
  let allNews: NewsItem[]
  let selectedProvider: 'cache' | 'cryptonews' = 'cache'
  let cryptonewsResult: NewsProviderResult | undefined

  if (marketCache && Date.now() - marketCache.timestamp < CACHE_DURATION_MS) {
    fearGreed = marketCache.data.fearGreed
    allNews = marketCache.data.allNews
    selectedProvider = 'cache'
  } else {
    const [freshFearGreed, cryptoNews] = await Promise.all([
      fetchFearGreed(),
      fetchCryptoNewsFeeds(),
    ])

    fearGreed = freshFearGreed
    cryptonewsResult = cryptoNews
    selectedProvider = 'cryptonews'
    allNews = cryptoNews.news

    marketCache = {
      data: { fearGreed, allNews },
      timestamp: Date.now(),
    }
  }

  const relevantNews = matchNewsToEthHolding(allNews)
  const ethPriceChange24h = await fetchEth24hPriceChange()
  const portfolioImpact = analyzeEthPortfolioImpact(wallet, relevantNews, ethPriceChange24h)
  const latestNewsInsights = buildLatestNewsInsights(
    relevantNews.length > 0 ? relevantNews : allNews,
    fearGreed
  )

  await writeMarketDebugLog({
    fetchedAt: new Date().toISOString(),
    selectedProvider,
    cryptonews: cryptonewsResult ?? { note: 'not called (cache hit)' },
    fearGreed: {
      value: fearGreed.value,
      label: fearGreed.label,
      trend: fearGreed.trend,
    },
    newsCounts: {
      allNews: allNews.length,
      relevantEthNews: relevantNews.length,
      latestNewsInsights: latestNewsInsights.length,
    },
    parsedAllNews: allNews,
    parsedRelevantNews: relevantNews,
    latestNewsInsights,
  })

  return {
    fearGreed,
    allNews,
    relevantNews,
    portfolioImpact,
    latestNewsInsights,
    fetchedAt: Date.now(),
  }
}
