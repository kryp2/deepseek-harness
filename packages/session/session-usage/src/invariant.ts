/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-session-usage`.
 * @module @deepseek-ai/dsh-session-usage/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-session-usage'

/** Cordis companion plugin name. */
export const name = 'session-usage-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the package owns a single pure projection fold whose
 * wire payload is schema-validated by the projection registry at every
 * snapshot and change-feed emission, and the event relation the fold relies
 * on — `request/header`/`request/context` preceding the step's
 * `assistant/message` in the append-only log — is owned and runtime-checked
 * by dsh-agent-loop (request config is logged before the request is issued),
 * not here.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
