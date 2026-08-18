/**
 * Pure types of the session-usage domain: the ONE home of the `usageByRoute`
 * projection-key declaration, free of this package's host-side value imports
 * (cordis context, zod, the llm chunk predicate). Two namespace projections
 * serve it — `./types` for host consumers, `./client` for client aggregates —
 * with zero content duplication.
 *
 * @module @deepseek-ai/dsh-session-usage/types
 */

// Marks this file a module so the declaration below AUGMENTS the projection
// table instead of declaring an ambient module.
export {}

/**
 * Token accounting and call count for one `(provider, model)` route over the
 * whole durable log. Counts mirror the disjoint {@link TokenUsage} convention:
 * `inputTokens` is uncached input only; cached input is `cacheReadTokens` /
 * `cacheWriteTokens` (billed input = the sum of the three). `reasoningTokens`
 * is an output subdivision and is not added again.
 */
export interface UsageRoute {
  /** Registered provider route (`request/header` config `provider`). */
  provider: string
  /** Provider-owned model id (`request/header` config `model`). */
  model: string
  /** Summed uncached input tokens. */
  inputTokens: number
  /** Summed output tokens. */
  outputTokens: number
  /** Summed cache-read tokens (optional, reported separately). */
  cacheReadTokens: number
  /** Summed cache-write tokens (optional, reported separately). */
  cacheWriteTokens: number
  /** Summed reasoning tokens (output subdivision). */
  reasoningTokens: number
  /** Number of assembled assistant messages attributed to this route. */
  calls: number
}

/**
 * Whole-log per-route token usage, independent of how much history a client
 * has paged in. Every route the log ever used appears once, in descending
 * output-token order so the hottest route leads; `totalCalls` sums the call
 * counts across routes. All fields start at 0 until the first contributing
 * `assistant/message` with usage lands.
 */
export interface SessionUsageProjection {
  /** Per-route usage, descending by output tokens. */
  routes: UsageRoute[]
  /** Summed call count across every route. */
  totalCalls: number
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Per-route token usage folded over the whole log; see {@link SessionUsageProjection}. */
    usageByRoute: SessionUsageProjection
  }
}
