/**
 * Canonical serialization, schema validation, and verification helpers
 * for Peck metered inference receipts.
 *
 * @module @deepseek-ai/dsh-session-metered-receipt
 */

import { z } from 'zod'
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type {
  MeteredInferenceReceipt,
  SignedMeteredReceipt,
  SessionReceiptsSummary,
} from './types.js'

/** The canonical receipt schema version string. */
export const RECEIPT_SCHEMA_VERSION = 'peck/v1/inference-receipt' as const

/** Zod schema for metered token usage breakdown. */
export const meteredUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
})

/** Zod schema for unsigned metered inference receipts. */
export const meteredInferenceReceiptSchema = z.object({
  version: z.literal(RECEIPT_SCHEMA_VERSION),
  requestId: z.string().min(1),
  channelOutpoint: z.string().regex(/^[0-9a-fA-F]{64}:\d+$/),
  channelSequence: z.number().int().positive(),
  routeId: z.string().min(1),
  upstreamModelId: z.string().min(1),
  catalogHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
  priceScheduleId: z.string().min(1),
  usage: meteredUsageSchema,
  chargeSats: z.number().int().nonnegative(),
  amountSpentNewSats: z.number().int().nonnegative(),
  responseHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
  timestampMs: z.number().int().positive(),
})

/** Zod schema for signed metered inference receipts. */
export const signedMeteredReceiptSchema = meteredInferenceReceiptSchema.extend({
  gatewaySignature: z.string().min(1),
  clientSignature: z.string().min(1).optional(),
})

/** Zod schema for session receipts summary projection. */
export const sessionReceiptsSummarySchema = z.object({
  totalChargedSats: z.number().int().nonnegative(),
  receiptCount: z.number().int().nonnegative(),
  receipts: z.array(signedMeteredReceiptSchema),
}) as z.ZodType<SessionReceiptsSummary>

/**
 * Canonical line-based serialization of a metered inference receipt.
 * Guaranteed byte-identical across TypeScript, Go, and Python.
 * No trailing newline, strict decimal integers, strict parameter order.
 *
 * @param r - The metered inference receipt.
 * @returns The canonical newline-delimited payload string.
 */
export function canonicalizeReceipt(r: MeteredInferenceReceipt): string {
  return [
    r.version,
    `request_id=${r.requestId}`,
    `channel_outpoint=${r.channelOutpoint}`,
    `channel_sequence=${r.channelSequence}`,
    `route_id=${r.routeId}`,
    `upstream_model_id=${r.upstreamModelId}`,
    `catalog_hash=${r.catalogHash}`,
    `price_schedule_id=${r.priceScheduleId}`,
    `input_tokens=${r.usage.inputTokens}`,
    `cache_read_tokens=${r.usage.cacheReadTokens}`,
    `cache_write_tokens=${r.usage.cacheWriteTokens}`,
    `output_tokens=${r.usage.outputTokens}`,
    `reasoning_tokens=${r.usage.reasoningTokens}`,
    `charge_sats=${r.chargeSats}`,
    `amount_spent_new_sats=${r.amountSpentNewSats}`,
    `response_hash=${r.responseHash}`,
    `timestamp_ms=${r.timestampMs}`,
  ].join('\n')
}

/**
 * Computes the 32-byte SHA-256 digest of the canonical receipt payload.
 *
 * @param r - The metered inference receipt.
 * @returns Hex-encoded 32-byte SHA-256 digest.
 */
export function hashReceipt(r: MeteredInferenceReceipt): string {
  const canonical = canonicalizeReceipt(r)
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/**
 * Validates whether an unknown object conforms to SignedMeteredReceipt.
 *
 * @param value - The object to validate.
 * @returns Validated SignedMeteredReceipt.
 */
export function parseSignedReceipt(value: unknown): SignedMeteredReceipt {
  return signedMeteredReceiptSchema.parse(value) as SignedMeteredReceipt
}

/**
 * Projection definition for session metered receipts summary.
 */
export const meteredReceiptsProjectionDefinition: ProjectionDefinition<
  'meteredReceipts',
  SignedMeteredReceipt[]
> = {
  key: 'meteredReceipts',
  schema: sessionReceiptsSummarySchema,
  init: () => [],
  apply: (state, event) => {
    if (event.type === 'peck/metered-receipt') {
      const parsed = signedMeteredReceiptSchema.safeParse(event.data)
      if (parsed.success) {
        return [...state, parsed.data as SignedMeteredReceipt]
      }
    }
    return state
  },
  view: state => ({
    totalChargedSats: state.reduce((sum, r) => sum + r.chargeSats, 0),
    receiptCount: state.length,
    receipts: state,
  }),
  stateVersion: 1,
}

export const name = 'session-metered-receipt'
export const inject = ['sessionProjections']

/**
 * Plugin apply entry point.
 * @param ctx - Cordis Context.
 */
export function apply(ctx: Context): void {
  const projections = ctx.get('sessionProjections')
  if (projections) {
    ctx.effect(() => projections.register(meteredReceiptsProjectionDefinition))
  }
}

export * from './types.js'
