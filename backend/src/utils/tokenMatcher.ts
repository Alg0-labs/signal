import type { NewsItem } from '../types/index.js'

const ETH_ALIASES = ['ethereum', 'ether', 'eth', 'weth', 'eth2', 'etherum']

export function extractEthMentions(text: string): string[] {
  const lowerText = text.toLowerCase()

  for (const alias of ETH_ALIASES) {
    const regex = new RegExp(`\\b${alias}\\b`, 'i')
    if (regex.test(lowerText)) return ['ETH']
  }

  return []
}

export function matchNewsToEthHolding(news: NewsItem[]): NewsItem[] {
  return news.filter((item) => item.relatedTokens.includes('ETH'))
}
