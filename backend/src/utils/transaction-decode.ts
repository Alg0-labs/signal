/**
 * Decode wallet-relevant ERC-20 transfers from transaction payloads.
 * Supports Dune SIM API (clean topics[] arrays) and Moralis (topic0/1/2 variants, nested logs).
 * If logs yield nothing, falls back to decoding transfer() / transferFrom() calldata.
 */

import { formatEther, formatUnits, getAddress, getEventSelector } from 'viem'
import type { DecodedTransfer, TransactionActivity } from '../types/index.js'

export const ERC20_TRANSFER_TOPIC = getEventSelector('Transfer(address,address,uint256)')

/** ERC-20 transfer(address,uint256) */
const SELECTOR_TRANSFER = 'a9059cbb'
/** ERC-20 transferFrom(address,address,uint256) */
const SELECTOR_TRANSFER_FROM = '23b872dd'

export type RawTransferLeg = Omit<
  DecodedTransfer,
  'symbol' | 'name' | 'decimals' | 'logo' | 'amountFormatted'
>

export type TokenMeta = { symbol: string; name: string; decimals: number; logo?: string }

function normalizeHexTopic(t: unknown): string | null {
  if (t == null) return null
  if (typeof t === 'object' && t !== null && 'hash' in t && typeof (t as { hash: string }).hash === 'string') {
    const h = (t as { hash: string }).hash
    return h.startsWith('0x') ? h.toLowerCase() : `0x${h}`.toLowerCase()
  }
  if (typeof t !== 'string') return null
  const s = t.trim()
  if (!s) return null
  return s.startsWith('0x') ? s.toLowerCase() : `0x${s}`.toLowerCase()
}

export function parseWeiField(v: unknown): bigint {
  if (v == null || v === '') return 0n
  if (typeof v === 'bigint') return v
  try {
    return BigInt(String(v).trim())
  } catch {
    return 0n
  }
}

function topicToAddress(topic: string): `0x${string}` {
  return getAddress(`0x${topic.slice(26)}` as `0x${string}`)
}

export type NormalizedLog = { address: string; data: string; topics: string[] }

/**
 * Flatten tx log arrays (Dune SIM, Moralis, or any compatible shape) into a normalised list.
 * Dune already emits { address, data, topics[] } — handled by the Array.isArray branch.
 */
export function normalizeTxLogs(tx: unknown): NormalizedLog[] {
  if (tx == null || typeof tx !== 'object') return []
  const t = tx as Record<string, unknown>

  const buckets: unknown[] = []
  const push = (v: unknown) => {
    if (v == null) return
    if (Array.isArray(v)) buckets.push(...v)
  }

  push(t.logs)
  push(t.log_events)
  push(t.receipt_logs)
  const receipt = t.receipt as Record<string, unknown> | undefined
  if (receipt && typeof receipt === 'object') {
    push(receipt.logs)
    push(receipt.log_events)
  }
  const inner = t.transaction as Record<string, unknown> | undefined
  if (inner && typeof inner === 'object') {
    push(inner.logs)
  }

  const out: NormalizedLog[] = []
  for (const raw of buckets) {
    if (raw == null || typeof raw !== 'object') continue
    const log = raw as Record<string, unknown>
    const address = String(
      log.address ?? log.log_address ?? log.contract_address ?? log.token_address ?? ''
    ).trim()
    const data = String(log.data ?? log.data_hex ?? log.log_data ?? '0x0')

    let topics: string[] = []
    if (Array.isArray(log.topics)) {
      topics = log.topics.map(normalizeHexTopic).filter((x): x is string => x != null)
    } else {
      const t0 = normalizeHexTopic(log.topic0 ?? log.topic_0 ?? log.topic_0_hash)
      const t1 = normalizeHexTopic(log.topic1 ?? log.topic_1)
      const t2 = normalizeHexTopic(log.topic2 ?? log.topic_2)
      const t3 = normalizeHexTopic(log.topic3 ?? log.topic_3)
      if (t0) topics.push(t0)
      if (t1) topics.push(t1)
      if (t2) topics.push(t2)
      if (t3) topics.push(t3)
    }

    if (!address || topics.length === 0) continue
    out.push({ address, data, topics })
  }
  return out
}

export function parseErc20TransfersFromLogs(
  logs: NormalizedLog[],
  walletLower: string
): RawTransferLeg[] {
  const transferTopic = ERC20_TRANSFER_TOPIC.toLowerCase()
  const out: RawTransferLeg[] = []
  for (const log of logs) {
    const t0 = (log.topics[0] ?? '').toLowerCase()
    if (t0 !== transferTopic) continue
    if (log.topics.length !== 3) continue
    try {
      const tokenAddress = getAddress(log.address as `0x${string}`)
      const from = topicToAddress(log.topics[1])
      const to = topicToAddress(log.topics[2])
      const amountRaw = BigInt(log.data).toString()
      const f = from.toLowerCase()
      const t = to.toLowerCase()
      let direction: 'in' | 'out'
      if (f === walletLower) direction = 'out'
      else if (t === walletLower) direction = 'in'
      else continue
      out.push({ tokenAddress, from, to, amountRaw, direction })
    } catch {
      continue
    }
  }
  return out
}

/**
 * When Moralis omits or flattens logs incorrectly, decode a direct ERC-20 call on `tx.to`.
 */
export function parseErc20TransferFromCalldata(
  tx: { from?: string; to?: string; input?: string; data?: string },
  walletLower: string
): RawTransferLeg | null {
  const raw = (tx.input ?? tx.data ?? '0x') as string
  const tokenContract = tx.to
  const fromAddr = (tx.from ?? '').toLowerCase()
  if (!tokenContract?.startsWith('0x') || !raw.startsWith('0x')) return null

  const strip = raw.slice(2).toLowerCase()
  if (strip.length < 8) return null
  const selector = strip.slice(0, 8)

  try {
    if (selector === SELECTOR_TRANSFER && strip.length >= 136) {
      if (fromAddr !== walletLower) return null
      const recipient = getAddress(`0x${strip.slice(32, 72)}` as `0x${string}`)
      const amountRaw = BigInt('0x' + strip.slice(72, 136)).toString()
      return {
        tokenAddress: getAddress(tokenContract as `0x${string}`),
        from: tx.from!,
        to: recipient,
        amountRaw,
        direction: 'out',
      }
    }

    if (selector === SELECTOR_TRANSFER_FROM && strip.length >= 200) {
      const tFrom = getAddress(`0x${strip.slice(32, 72)}` as `0x${string}`)
      const tTo = getAddress(`0x${strip.slice(96, 136)}` as `0x${string}`)
      const amountRaw = BigInt('0x' + strip.slice(136, 200)).toString()
      let direction: 'in' | 'out'
      if (tFrom.toLowerCase() === walletLower) direction = 'out'
      else if (tTo.toLowerCase() === walletLower) direction = 'in'
      else return null
      return {
        tokenAddress: getAddress(tokenContract as `0x${string}`),
        from: tFrom,
        to: tTo,
        amountRaw,
        direction,
      }
    }
  } catch {
    return null
  }
  return null
}

/**
 * Prefer log-based ERC-20 transfers; if none, use calldata (e.g. USDT transfer when logs missing).
 */
export function collectRawTransferLegs(
  merged: Record<string, unknown>,
  walletLower: string
): RawTransferLeg[] {
  const logs = normalizeTxLogs(merged)
  const fromLogs = parseErc20TransfersFromLogs(logs, walletLower)
  if (fromLogs.length > 0) return fromLogs

  // Dune uses `data`, Moralis uses `input` — both handled below.
  const calldata = parseErc20TransferFromCalldata(
    {
      from: (merged.from_address as string | undefined) ?? (merged.from as string | undefined),
      to: (merged.to_address as string | undefined) ?? (merged.to as string | undefined),
      input: merged.input as string | undefined,
      data: merged.data as string | undefined,
    },
    walletLower
  )
  return calldata ? [calldata] : []
}

/** @deprecated renamed to normalizeTxLogs */
export const normalizeMoralisLogs = normalizeTxLogs

export function attachTokenMeta(row: RawTransferLeg, metaMap: Map<string, TokenMeta>): DecodedTransfer {
  const key = row.tokenAddress.toLowerCase()
  const m = metaMap.get(key) ?? {
    symbol: `${row.tokenAddress.slice(0, 6)}…`,
    name: 'Unknown token',
    decimals: 18,
  }
  let amountFormatted: string
  try {
    amountFormatted = formatUnits(BigInt(row.amountRaw), m.decimals)
  } catch {
    amountFormatted = row.amountRaw
  }
  return {
    ...row,
    symbol: m.symbol,
    name: m.name,
    decimals: m.decimals,
    logo: m.logo,
    amountFormatted,
  }
}

export function classifyActivity(transfers: DecodedTransfer[], merged: Record<string, unknown>): TransactionActivity {
  const label = String(
    (merged as { decoded_call?: { label?: string } }).decoded_call?.label ??
      (merged as { decodedCall?: { label?: string } }).decodedCall?.label ??
      ''
  ).toLowerCase()
  if (transfers.length === 0) return 'contract'

  const outs = transfers.filter((x) => x.direction === 'out')
  const ins = transfers.filter((x) => x.direction === 'in')
  if (outs.length === 0 && ins.length === 0) return 'contract'

  if (outs.length > 0 && ins.length > 0) {
    if (label.includes('swap')) return 'swap'
    const outAssets = new Set(outs.map((x) => x.tokenAddress.toLowerCase()))
    const inAssets = new Set(ins.map((x) => x.tokenAddress.toLowerCase()))
    const different =
      [...outAssets].some((a) => !inAssets.has(a)) || [...inAssets].some((a) => !outAssets.has(a))
    if (different) return 'swap'
    return 'contract'
  }
  if (outs.length > 0) return 'send'
  return 'receive'
}

function trimAmount(s: string): string {
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return s
  if (n === 0) return '0'
  if (Math.abs(n) >= 1) return n.toFixed(4).replace(/\.?0+$/, '')
  return n.toPrecision(4).replace(/\.?0+$/, '')
}

export function computeFeeEthAndUsd(
  merged: Record<string, unknown>,
  listRow: Record<string, unknown>,
  ethPriceUsd: number
): { feeNativeEth?: number; feeUsd?: number } {
  const gasUsed = parseWeiField(
    merged.gas_used ?? merged.receipt_gas_used ?? merged.gas ?? listRow.gas
  )
  const gasPrice = parseWeiField(
    merged.effective_gas_price ?? merged.gas_price ?? listRow.gas_price
  )
  const feeWei = gasUsed * gasPrice
  if (feeWei <= 0n) return {}
  const feeNativeEth = Number(formatEther(feeWei))
  const feeUsd = feeNativeEth * ethPriceUsd
  return { feeNativeEth, feeUsd }
}

/**
 * Short summary: what moved + fee in ETH and USD (no extra contract noise when empty).
 */
export function buildTransactionDescription(
  activity: TransactionActivity,
  transfers: DecodedTransfer[],
  feeNativeEth: number | undefined,
  feeUsd: number | undefined
): string {
  const leg = (t: DecodedTransfer) => `${trimAmount(t.amountFormatted)} ${t.symbol}`
  let body = ''
  switch (activity) {
    case 'swap': {
      const outs = transfers.filter((t) => t.direction === 'out')
      const ins = transfers.filter((t) => t.direction === 'in')
      body = `Swap ${outs.map(leg).join(', ')} → ${ins.map(leg).join(', ')}`
      break
    }
    case 'send':
      body = `Sent ${transfers.filter((t) => t.direction === 'out').map(leg).join(', ')}`
      break
    case 'receive':
      body = `Received ${transfers.filter((t) => t.direction === 'in').map(leg).join(', ')}`
      break
    default:
      body = transfers.length ? `Contract (${transfers.length} transfer event(s))` : 'Contract interaction'
  }

  if (feeNativeEth != null && feeUsd != null) {
    return `${body} · Fee ${feeNativeEth.toFixed(6)} ETH ($${feeUsd.toFixed(2)})`
  }
  if (feeNativeEth != null) {
    return `${body} · Fee ${feeNativeEth.toFixed(6)} ETH`
  }
  return body
}
