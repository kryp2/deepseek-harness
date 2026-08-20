/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-session-metered-receipt`.
 * @module @deepseek-ai/dsh-session-metered-receipt/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-session-metered-receipt'

/** Cordis companion plugin name. */
export const name = 'session-metered-receipt-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the package owns pure schema definitions and a pure
 * projection fold whose wire payload is validated by Zod at every snapshot
 * and change-feed emission.
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
