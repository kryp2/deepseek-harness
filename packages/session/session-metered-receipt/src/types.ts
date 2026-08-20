/**
 * Schema and types for Peck metered model inference receipts (v=1).
 *
 * Pinned per Plan C.3 and the metered routing design note:
 * - Version: `peck/v1/inference-receipt`
 * - Exact token accounting + satoshi charge verification
 * - Canonical string serialization for deterministic cryptographic signatures
 *
 * @module @deepseek-ai/dsh-session-metered-receipt/types
 */

export {}

/** Measured token breakdown for one metered inference request. */
export interface MeteredUsage {
  /** Uncached input tokens. */
  inputTokens: number
  /** Cache read tokens (discounted pricing tier). */
  cacheReadTokens: number
  /** Cache write tokens. */
  cacheWriteTokens: number
  /** Total generated output tokens. */
  outputTokens: number
  /** Reasoning tokens (subdivision of outputTokens). */
  reasoningTokens: number
}

/**
 * Core unsigned payload of a Peck metered inference receipt.
 * Serialized canonically to bytes for client and gateway signatures.
 */
export interface MeteredInferenceReceipt {
  /** Receipt schema version tag: fixed `peck/v1/inference-receipt`. */
  version: 'peck/v1/inference-receipt'
  /** Unique idempotent client request identifier. */
  requestId: string
  /** BRC-104 / sCrypt payment channel outpoint `"<funding_txid>:<output_index>"`. */
  channelOutpoint: string
  /** Strictly increasing channel sequence nonce. */
  channelSequence: number
  /** Gateway provider-qualified route identifier (e.g. `peck/deepseek-v4-flash`). */
  routeId: string
  /** Upstream model identifier (e.g. `deepseek-v4-flash`). */
  upstreamModelId: string
  /** Hex-encoded SHA-256 hash of the pinned route catalog. */
  catalogHash: string
  /** Price schedule identifier pinned for this session. */
  priceScheduleId: string
  /** Measured token usage breakdown. */
  usage: MeteredUsage
  /** Actual total satoshi charge for this request. */
  chargeSats: number
  /** Running total satoshis spent in the channel up to and including this receipt. */
  amountSpentNewSats: number
  /** Hex-encoded SHA-256 digest of the raw model response body/stream. */
  responseHash: string
  /** Unix timestamp in milliseconds when the receipt was minted. */
  timestampMs: number
}

/** Signed metered receipt carrying gateway server signature and optional client signature. */
export interface SignedMeteredReceipt extends MeteredInferenceReceipt {
  /** Gateway ECDSA signature over the canonical receipt payload. */
  gatewaySignature: string
  /** Optional client authorization signature over the canonical payload. */
  clientSignature?: string
}

/** Summary projection of verified receipts in a session. */
export interface SessionReceiptsSummary {
  /** Total verified satoshis charged across all receipts. */
  totalChargedSats: number
  /** Total receipts count in the session. */
  receiptCount: number
  /** List of verified signed receipts in order. */
  receipts: SignedMeteredReceipt[]
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Emitted when a metered model response yields a verified receipt. */
    'peck/metered-receipt': SignedMeteredReceipt
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Session metered inference receipts and cumulative charges. */
    meteredReceipts: SessionReceiptsSummary
  }
}
