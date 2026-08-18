/**
 * Function plugin registering the `usageByRoute` projection unit: whole-log
 * per-route token usage served through the session-projection seam (registry
 * snapshot, change feed, and every projection carrier), so clients render
 * per-subscription usage that paging and compaction cannot change. The plugin
 * owns only the fold; delivery is the seam's.
 *
 * @module @deepseek-ai/dsh-session-usage
 */

import type { Context } from '@deepseek-ai/cordis'
import { usageByRouteProjectionDefinition } from './projection.ts'

export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'session-usage'
/** The projection registry is the plugin's whole purpose; without it the fiber stays pending. */
export const inject = ['sessionProjections']

/**
 * Register the `usageByRoute` unit; the registration is an effect on this
 * plugin's fiber, so unloading removes the key.
 * @param ctx - registrant context carrying the projection registry.
 */
export function apply(ctx: Context): void {
  ctx.sessionProjections.register(usageByRouteProjectionDefinition)
}
