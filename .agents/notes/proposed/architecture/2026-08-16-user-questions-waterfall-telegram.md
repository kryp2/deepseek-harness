# Agent Note: User-questions waterfall for pluggable human-in-the-loop channels

Status: proposed

## Problem

`ctx.userQuestions` is a single-provider seam: `UserQuestionService.registerProvider()`
throws `DUPLICATE_PROVIDER` on a second registration, and `ask()` delegates to that one
`this.provider`. The host `dsh-host-apiproxy` registers the one web-GUI provider
unconditionally in its `apply()`. This makes the *ask the human* path a closed, single-
channel surface: a second answer channel (Telegram, email, a messaging bridge) cannot
coexist with, or answer the same question as, the web GUI.

`ctx.approval` already got this right. `ApprovalService` dispatches an `approval/request`
waterfall scoped to the requesting agent, races the answer against the caller's abort
signal, and fails closed to `'unavailable'`. Any number of answerers may register on
that waterfall; the web proxy is just one `ctx.on('approval/request', ...)` listener
among several. There is no structural reason the question path should not mirror it —
one seam is single-provider while its sibling is a waterfall, and that asymmetry is the
only thing blocking pluggable question channels.

## Proposal

Give `UserQuestionService` the same waterfall shape `ApprovalService` already has, while
preserving a migration path for the shipped web provider:

1. **Add a typed event** — `'user-questions/ask'`, mode waterfall, scoped to the asking
   agent, with the same contract as `approval/request`: a listener returns an
   `AskUserQuestionAnswer` to claim the question, or calls `next()` to let another
   answerer try. The end of the chain (past the last listener) is the fail-closed
   default.

2. **Dispatch through the waterfall in `ask()`** — replace `return this.provider.ask(request)`
   with a scoped waterfall over `'user-questions/ask'`, raced against `request.signal`
   and normalized like the approval path. Keep the existing liveness checks
   (CALLER_NOT_LIVE, DELEGATED_CALLER, EMPTY_QUESTIONS, BAD_INTENT) ahead of dispatch.

3. **Migrate the web proxy from provider to listener.** The pending-question registry
   and mux broadcast are proxy concerns, not channel concerns, so they move into a
   `ctx.on('user-questions/ask', ...)` listener. `registerProvider` is then removed
   (the singular provider has no remaining consumer) rather than shimmed.

4. **Telegram answerer (optional, pluggable)** — a new opt-in plugin registers its own
   `ctx.on('user-questions/ask', ...)` listener that sends the question to Telegram
   (inline buttons + free text) and resolves from the reply. It coexists with the web
   listener: whichever answers first wins the waterfall.

## Consequences

- **First-answer-wins across channels.** A question reaches every registered answerer
  simultaneously; the first to produce a valid `AskUserQuestionAnswer` settles `ask()`.
  Abort still withdraws the question from all listeners.
- **Fail-closed.** With no listener composed, `ask()` resolves to a documented error
  (mirroring `'unavailable'`) rather than `NO_PROVIDER`; the shipped web listener keeps
  the default behavior identical.
- **Symmetry with approval.** The two human-interaction seams share one shape, one
  scoping rule, and one normalization strategy. This is the "broader human-in-the-loop
  seam" in one move, because the same seam also admits an approval-style answerer for
  `ask_user_question` without touching the approval path (which is already a waterfall).
- **Scope discipline.** Waterfall listeners are agent-scoped via `dsh-scope`, matching
  `approval/request`; a channel answers only questions for agents it owns.

## Alternatives considered

- **Multi-provider registration (keep N providers).** Rejected: changes what "the provider"
  means, forces every consumer to reason about which provider answered, and does not
  reuse the proven waterfall/race/normalization machinery approval already has.
- **A separate Telegram tool the agent must call explicitly** (`ask_via_telegram`). This
  is what the `peck-meta` bridge does today and works, but it is not seamless: the model
  must choose the channel. The waterfall makes every channel transparent to the caller.
- **Wrap the existing provider at a higher level.** Rejected: the pending-question
  registry and mux broadcast are private to the proxy, so no wrapper can reach them
  without duplicating proxy internals.

## Required verification

- `packages/interaction/user-questions` unit tests: waterfall dispatch, first-answer-wins,
  fail-closed, abort race, scope filtering (mirror `user-approval/tests/approval.spec.ts`).
- A real-composition test proving the web listener still answers `ask_user_question`
  end-to-end (the product-visible path must not regress).
- A keyless snapshot for the assembled `ask_user_question` transcript.
- `typecheck`, `build`, `test:coverage` on the touched packages, and a doc-sync run.
