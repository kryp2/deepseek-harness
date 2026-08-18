# @deepseek-ai/dsh-llm-claude-cli

> Status: **V1 prototype.** Tested against Claude Code 2.1.x. See
> [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
> before adopting for production work.

`claude --print --output-format json` adapter for the DeepSeek Harness LLM
seam. Lets a DSH agent run on Claude models without an `ANTHROPIC_API_KEY`
by shelling out to a locally-installed Claude Code CLI. Authentication
flows through the host's own Claude subscription (Pro/Max OAuth) — the
harness carries no Anthropic credentials.

## Why this exists

`@deepseek-ai/dsh-llm-deepseek` speaks the DeepSeek chat-completions API.
This package is its sibling for users whose preferred model is Claude and
who already pay for Claude Code. The bridge collapses `GenerateOptions` to
one `claude --print` call and parses the resulting JSON document back into
harness `StreamChunk`s.

## Model Experience

| Wire alias | Underlying model (Claude Code 2.1.x) | Notes |
|---|---|---|
| `sonnet` | Claude Sonnet 4.5 | default; matched by `--settings` model pin |
| `haiku` | Claude Haiku 4.5 | cheap tier for cost-sensitive loops |
| `opus` | Claude Opus 4.x | gated by subscription tier; may be unavailable |

The bridge does not see the underlying model id directly; it surfaces
Claude Code's `modelUsage` payload in the session log for diagnostics.

### Cache + cost

Each `claude --print` call rewrites Claude Code's prompt cache. For short
conversations the cache-write cost can dominate Anthropic-side pricing —
a 1-token reply on a 30k-token system prompt can show `cache_creation_input_tokens
~30000` on the response. For long, multi-turn sessions the cache amortizes
and the bridge becomes cheaper than the API.

### Tokens

Token counts come from Claude Code's `usage` block and are reported in
the standard harness `TokenUsage` shape: disjoint
`inputTokens` / `outputTokens` plus optional `cacheReadTokens`,
`cacheWriteTokens`, and `reasoningTokens`. The adapter does NOT inflate
input tokens with cache reads — the harness convention is disjoint counts.

## Install

```sh
pnpm install
```

Add to your `cordis.yml`:

```yaml
- id: llm-claude-cli
  name: '@deepseek-ai/dsh-llm-claude-cli'
  config:
    binary: claude                       # PATH-resolvable
    settingsJson: '{"model":"sonnet","effortLevel":"medium"}'
    maxTokens: 32000
    maxSystemPromptChars: 32000
    models:
      - id: sonnet
      - id: haiku
      - id: opus
```

The plugin registers one provider route: `claude-cli`. Point a DSH
`GenerateOptions` at it with `provider: "claude-cli"` and any of the
configured model aliases.

## Wire protocol

```
GenerateOptions
   │
   ▼  buildInvocation()
claude --print --output-format json \
       --model <alias> \
       --settings '<json>' \
       --max-turns 1 \
       --permission-mode plan \
       --allowed-tools "" \
       --system-prompt '<text>'
   │
   ▼  stdin: role-tagged transcript
Claude Code subprocess
   │
   ▼  stdout: { type:"result", result, usage, total_cost_usd, ... }
translate()
   │
   ▼
StreamChunk[]   { block-start, text-delta, block-end, usage, finish }
```

`--max-tokens` is intentionally NOT forwarded. Claude Code CLI 2.1.x rejects
it as an unknown option; deployments needing a hard output cap should pin
the model in `--settings` or rely on Claude Code's own `max_tokens` policy.

## Known Limitations and Deferred Work

### V1 limitations

- **No streaming.** V1 reads the full JSON document and emits one
  text-delta. The wire protocol supports `stream-json`; V2 will use it.
- **Tool-call detection is opportunistic.** The serializer tells Claude
  Code not to call tools (`--allowed-tools ""`, `--max-turns 1`) so the
  DSH tool loop stays the source of truth. Claude may still emit fenced
  JSON blocks like `{"tool":"name","arguments":{...}}`; the translator
  scans for those and surfaces them as `tool-call` blocks. False-positive
  risk: any fenced JSON in the response could match if its `tool` field
  happens to name a registered tool schema. V2 should switch to
  `--output-format stream-json` for structured events.
- **System-prompt cap.** Claude Code silently truncates very long system
  prompts. The bridge caps explicitly at `maxSystemPromptChars` (default
  32 000 chars) and logs a warning when it kicks in. Deployments with
  large `peck-docs` workspaces should grow the cap.
- **Cache write cost.** Every call rewrites the cache. Short calls are
  more expensive than the Anthropic API; long-running sessions amortize.
  The bridge surfaces `total_cost_usd` in the session log so deployments
  can monitor real spend.
- **No image input.** V1 advertises `inputModalities: ['text']` only.
  Anthropic image support requires the native Messages API, which Claude
  Code's `--print` does not expose.
- **No native Anthropic tool-call shape.** The bridge emits synthetic
  tool-call blocks with `id: "claude-cli-<n>"` because Claude Code does
  not produce Anthropic-format call ids in `--print` mode. DSH's tool
  loop will execute the call and replay the result; the synthetic id is
  not stable across turns and is intended to be opaque to downstream
  code.
- **OAuth-only authentication.** The package requires no API key and
  refuses to send one if present. A failed `claude --print` invocation
  surfaces as `LlmError('AUTH')` with stderr details — Claude Code's
  `/login` flow is the user's responsibility.

### Deferred work

- `stream-json` output for true SSE-streaming into the harness.
- Vision input via Anthropic-format image blocks.
- A small `--bare`-mode sidecar that exposes Anthropic-format HTTP
  directly from Claude Code's internal session; this would replace the
  subprocess adapter entirely and unlock native tool-calls, vision, and
  prompt-cache reuse without the per-call rewrite.
- Configurable retry policy on subprocess failures (e.g. transient
  ECONNRESET to OAuth endpoint).

## Public API

| Export | Notes |
|---|---|
| `ClaudeCliAdapter` | extends `LlmAdapter`; one instance per plugin mount |
| `Config` | schemastery schema; doubles as settings-section shape |
| `apply` | Cordis function plugin entry; `inject: ['llm']` |
| `resolveAdapterOptions(config)` | explicit resolve step, fail-loud |
| `DEFAULT_CONTEXT_WINDOW` / `DEFAULT_MAX_TOKENS` / `DEFAULT_STREAM_IDLE_TIMEOUT_MS` | shared with the adapter |
| `ClaudeCliCatalogModel` / `ClaudeCliConnectionOptions` | types |
| `./invariant` | companion plugin registering package ownership |

## See also

- `@deepseek-ai/dsh-llm` — provider-neutral LLM service interface
- `@deepseek-ai/dsh-llm-deepseek` — sibling adapter for the DeepSeek API
- `docs/architecture.md` — adapter registration lifecycle
- `docs/cookbook/adding-a-package.md` — package layout rules this follows