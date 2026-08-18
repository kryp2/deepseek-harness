# @deepseek-ai/dsh-session-usage

English | [中文](README.zh.md)

Function plugin registering the `usageByRoute` projection unit: whole-log per-route token usage folded from the latest request configuration and assembled assistant messages, served through the session-projection seam (registry snapshot, change feed, and every projection carrier). Clients render per-subscription usage that paging and compaction cannot change.

## Fold semantics

- Attribution keys on the latest `request/header` (config `provider`/`model`) or `request/context` (its own `provider`/`model`) fields. The agent loop logs both before the request they describe, so each step's `assistant/message` is attributed to the route current when it assembles.
- `calls` increments on every assembled assistant message whose route is known, even without a usage report (a max-tokens usage-host message is still one completed call).
- Token fields (`inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`) accrue only when the message reports finite non-negative counts; a malformed report is guarded like the window fold guards node usage and contributes nothing.
- Counts are disjoint, matching `TokenUsage`: `inputTokens` is uncached input, cached input is the cache fields, and `reasoningTokens` is an output subdivision.
- `routes` lists each route the log used once, descending by output tokens; `totalCalls` sums call counts.
- A composed registry always serves the key, so clients read the value, never key presence.

## Composition

```yaml
- id: session-usage
  name: '@deepseek-ai/dsh-session-usage'
```

Injects `sessionProjections` — the plugin's whole purpose; in assemblies without the registry the fiber stays pending and nothing registers.

## Model Experience

None, as the plugin only computes a client-facing read model of already-logged session events and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the plugin never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Attribution is a single pointer, not per-step custody** — the fold attributes each message to the latest request config, so a message assembled after a mid-session config switch is attributed to the new route; this matches the loop's ordering (config is logged before the request it describes).
- **Usage is provider-reported and optional** — a route whose provider reports no usage still accumulates `calls` but zero tokens; token figures are only as complete as the adapters' reports.
- **No cost, balance, or CLI-agent aggregation** — this unit counts tokens and calls only; `$` pricing, external balances (`/credits`), and `usage.jsonl` (codex/claude/opencode CLI agents) live in later dashboard layers, not here.
