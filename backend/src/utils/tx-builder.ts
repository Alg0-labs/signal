/**
 * tx-builder.ts
 *
 * Pure utility for constructing raw EVM transaction parameters.
 * No network calls — just deterministic data encoding.
 *
 * Supports:
 *  - Native asset transfers (ETH, MATIC, BNB, AVAX, …)
 *  - ERC-20 token transfers via the standard transfer(address,uint256) selector
 */

import { encodeFunctionData, parseEther, parseUnits } from 'viem'

// ─── ABI fragments ────────────────────────────────────────────────────────────

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'recipient', type: 'address' as const },
      { name: 'amount',    type: 'uint256' as const },
    ],
    outputs: [{ name: '', type: 'bool' as const }],
  },
] as const

// ─── Output types ─────────────────────────────────────────────────────────────

export interface NativeTxData {
  kind:    'native'
  to:      string         // recipient
  value:   `0x${string}` // hex wei
  data:    '0x'
  chainId: number
}

export interface TokenTxData {
  kind:         'token'
  to:           string         // ERC-20 contract address
  value:        '0x0'
  data:         `0x${string}` // ABI-encoded transfer(address,uint256) calldata
  chainId:      number
  recipient:    string         // actual token recipient
  amountRaw:    string         // BigInt string (smallest unit)
}

export type EvmTxData = NativeTxData | TokenTxData

// ─── Validation helpers ────────────────────────────────────────────────────────

export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim())
}

export function isPositiveDecimal(value: string): boolean {
  const trimmed = value.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return false
  return Number.isFinite(Number(trimmed)) && Number(trimmed) > 0
}

// ─── Builders ─────────────────────────────────────────────────────────────────

/**
 * Build raw transaction parameters for a native asset transfer.
 *
 * @param to       Recipient address
 * @param amount   Human-readable amount in the chain's native unit (e.g. "0.1" ETH)
 * @param chainId  EVM chain ID (default 1 = Ethereum mainnet)
 */
export function buildNativeTx(
  to: string,
  amount: string,
  chainId = 1,
): NativeTxData {
  if (!isValidEvmAddress(to))      throw new Error(`Invalid recipient address: ${to}`)
  if (!isPositiveDecimal(amount))  throw new Error(`Invalid amount: ${amount}`)

  const wei   = parseEther(amount as `${number}`)
  const value = `0x${wei.toString(16)}` as `0x${string}`

  return { kind: 'native', to, value, data: '0x', chainId }
}

/**
 * Build raw transaction parameters for an ERC-20 token transfer.
 *
 * @param tokenAddress  ERC-20 contract address
 * @param recipient     Token recipient address
 * @param amount        Human-readable token amount (e.g. "100" USDC)
 * @param decimals      Token decimals (e.g. 6 for USDC, 18 for WETH)
 * @param chainId       EVM chain ID
 */
export function buildErc20Tx(
  tokenAddress: string,
  recipient: string,
  amount: string,
  decimals: number,
  chainId: number,
): TokenTxData {
  if (!isValidEvmAddress(tokenAddress)) throw new Error(`Invalid token address: ${tokenAddress}`)
  if (!isValidEvmAddress(recipient))    throw new Error(`Invalid recipient address: ${recipient}`)
  if (!isPositiveDecimal(amount))       throw new Error(`Invalid amount: ${amount}`)

  const amountRaw = parseUnits(amount, decimals)
  const data      = encodeFunctionData({
    abi:          ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args:         [recipient as `0x${string}`, amountRaw],
  })

  return {
    kind:      'token',
    to:        tokenAddress,
    value:     '0x0',
    data,
    chainId,
    recipient,
    amountRaw: amountRaw.toString(),
  }
}
