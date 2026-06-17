// ─── Claude tool definitions ─────────────────────────────────────────────────
// Edit ONLY this file when updating tool schemas. Do not touch ai.service.ts.

export const SEND_ETH_TOOL = {
  name: 'send_eth',
  description: 'Transfer native ETH (or the chain native asset) to an address',
  input_schema: {
    type: 'object',
    properties: {
      to:      { type: 'string', description: 'Recipient address (0x...)' },
      amount:  { type: 'string', description: "Amount in ETH, e.g. '0.1'" },
      chainId: { type: 'number', description: 'EVM chain ID (1=Ethereum, 137=Polygon, 56=BSC, 42161=Arbitrum, 10=Optimism, 8453=Base). Default 1.' },
      reason:  { type: 'string', description: 'Short reason for the transfer' },
    },
    required: ['to', 'amount'],
  },
} as const

export const SEND_TOKEN_TOOL = {
  name: 'send_token',
  description: 'Transfer an ERC-20 token to an address. Only call this when the user explicitly confirms they want to send a specific token they hold.',
  input_schema: {
    type: 'object',
    properties: {
      to:           { type: 'string', description: 'Recipient address (0x...)' },
      amount:       { type: 'string', description: "Human-readable token amount, e.g. '100' for 100 USDC" },
      tokenSymbol:  { type: 'string', description: 'Token symbol, e.g. USDC' },
      tokenName:    { type: 'string', description: 'Full token name, e.g. USD Coin' },
      tokenAddress: { type: 'string', description: 'ERC-20 contract address (0x...)' },
      decimals:     { type: 'number', description: 'Token decimals, e.g. 6 for USDC, 18 for WETH' },
      chainId:      { type: 'number', description: 'EVM chain ID where the token lives (1=Ethereum, 137=Polygon, 56=BSC, 42161=Arbitrum, 10=Optimism, 8453=Base)' },
      reason:       { type: 'string', description: 'Short reason for the transfer' },
    },
    required: ['to', 'amount', 'tokenSymbol', 'tokenName', 'tokenAddress', 'decimals', 'chainId'],
  },
} as const
