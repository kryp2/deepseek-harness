/**
 * The `usageByRoute` projection unit: a pure fold of the latest request
 * configuration and assembled assistant messages into whole-log per-route
 * token accounting.
 *
 * Attribution model (load-bearing): the agent loop appends `request/header`
 * (and `request/context`) BEFORE the request it describes, and each step's
 * `assistant/message` lands after it in the same step. The fold therefore
 * keeps a single `lastRoute` `{ provider, model }` updated from every
 * `request/header.header.config`, and attributes each `assistant/message.usage`
 * to the route current at the time the message assembles. A `request/context`
 * event rewrites the same pointer from its own `provider`/`model` fields —
 * both events carry the same identity for a given step, so the two writers
 * agree; keeping both keeps the fold correct when only one of the two is
 * present (a context without a preceding header, or a header-only replay).
 *
 * The `calls` counter is attributed independently of `usage`: it increments on
 * every assembled assistant message whose current route is known, even when
 * the message reports no usage (a max-tokens usage-host message with empty
 * content still represents one completed call on that route). Token fields
 * only accrue when the message actually reports a finite, non-negative
 * `usage`, mirroring the window fold's guard — a malformed provider report
 * must not poison the sum.
 *
 * @module @deepseek-ai/dsh-session-usage/projection
 */

import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

/** One route's cumulative accounting, keyed in state by `"${provider}\u0000${model}"`. */
interface UsageRouteState {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  calls: number
}

/**
 * Fold state: the accumulated routes plus the current attribution pointer.
 * The pointer is `null` before the first `request/header` or `request/context`
 * — an assembled message before any request config cannot be attributed and is
 * skipped rather than guessed into a synthetic route.
 */
interface SessionUsageState {
  /** Current `{ provider, model }` from the latest request-config event. */
  lastRoute: { provider: string; model: string } | null
  /** Accumulated usage keyed by a stable route key, in first-seen order. */
  byKey: Record<string, UsageRouteState>
}

const usageRouteSchema = z.object({
  provider: z.string(),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  calls: z.number().int().nonnegative(),
})

const sessionUsageSchema = z.object({
  routes: z.array(usageRouteSchema),
  totalCalls: z.number().int().nonnegative(),
})

/** Stable state key separating provider from model; both are arbitrary strings. */
function routeKey(provider: string, model: string): string {
  return `${provider}\u0000${model}`
}

/**
 * Provider-reported token counts, guarded the way the window fold guards node
 * usage: every field must be a finite non-negative number, anything else reads
 * as `undefined` so the sum is never poisoned by a malformed report. The
 * optional cache/reasoning fields default to 0 (not absent) because the view
 * is a whole-value table, not a partial record.
 */
function usageCounts(usage: unknown): {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
} | undefined {
  if (typeof usage !== 'object' || usage === null) return undefined
  const value = usage as Record<string, unknown>
  const read = (name: string): number | undefined => {
    const field = value[name]
    return typeof field === 'number' && Number.isFinite(field) && field >= 0 ? field : undefined
  }
  const inputTokens = read('inputTokens')
  const outputTokens = read('outputTokens')
  // A message with neither input nor output reported carries no usable
  // accounting; the call still counts, but there is nothing to sum.
  if (inputTokens === undefined || outputTokens === undefined) return undefined
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens: read('cacheReadTokens') ?? 0,
    cacheWriteTokens: read('cacheWriteTokens') ?? 0,
    reasoningTokens: read('reasoningTokens') ?? 0,
  }
}

/** Descending output-token order, hottest route leading; ties keep first-seen order. */
function sortRoutes(routes: readonly UsageRouteState[]): UsageRouteState[] {
  return [...routes].sort((left, right) => right.outputTokens - left.outputTokens)
}

/** The `usageByRoute` unit registered on `ctx.sessionProjections` (exported for the unit spec). */
export const usageByRouteProjectionDefinition = {
  key: 'usageByRoute',
  stateVersion: 1,
  stateSchema: z.object({
    lastRoute: z.object({ provider: z.string(), model: z.string() }).nullable(),
    byKey: z.record(z.string(), usageRouteSchema),
  }) as z.ZodType<SessionUsageState>,
  init: (): SessionUsageState => ({ lastRoute: null, byKey: {} }),
  apply: (state, event) => {
    switch (event.type) {
      case 'request/header': {
        const { provider, model } = event.data.header.config
        const current = state.lastRoute
        if (current?.provider === provider && current.model === model) return state
        return { ...state, lastRoute: { provider, model } }
      }
      case 'request/context': {
        const { provider, model } = event.data
        const current = state.lastRoute
        if (current?.provider === provider && current.model === model) return state
        return { ...state, lastRoute: { provider, model } }
      }
      case 'assistant/message': {
        const route = state.lastRoute
        if (route === null) return state
        const counts = usageCounts(event.data.usage)
        const key = routeKey(route.provider, route.model)
        const existing = state.byKey[key]
        const entry: UsageRouteState = existing ?? {
          provider: route.provider,
          model: route.model,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
          calls: 0,
        }
        const next: UsageRouteState = {
          ...entry,
          calls: entry.calls + 1,
          ...counts === undefined ? {} : {
            inputTokens: entry.inputTokens + counts.inputTokens,
            outputTokens: entry.outputTokens + counts.outputTokens,
            cacheReadTokens: entry.cacheReadTokens + counts.cacheReadTokens,
            cacheWriteTokens: entry.cacheWriteTokens + counts.cacheWriteTokens,
            reasoningTokens: entry.reasoningTokens + counts.reasoningTokens,
          },
        }
        return { ...state, byKey: { ...state.byKey, [key]: next } }
      }
      default:
        return state
    }
  },
  wire: {
    viewSchema: sessionUsageSchema,
    view: (state) => {
      const routes = sortRoutes(Object.values(state.byKey))
      return {
        routes: routes.map(route => ({
          provider: route.provider,
          model: route.model,
          inputTokens: route.inputTokens,
          outputTokens: route.outputTokens,
          cacheReadTokens: route.cacheReadTokens,
          cacheWriteTokens: route.cacheWriteTokens,
          reasoningTokens: route.reasoningTokens,
          calls: route.calls,
        })),
        totalCalls: routes.reduce((sum, route) => sum + route.calls, 0),
      }
    },
  },
} satisfies ProjectionDefinition<'usageByRoute', SessionUsageState>

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    usageByRoute: SessionUsageState
  }
}
