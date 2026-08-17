# Agent Note: Compose Peck distribution and metered model routing

Status: proposed

English | [中文](2026-08-18-peck-distribution-and-metered-routing.zh.md)

## Problem

Peck needs one agent product that can use personal model subscriptions, user-owned API credentials, and commercially metered model calls without making users configure every provider for every device. The existing Peck work already spans a DeepSeek Harness fork, a gateway, BRC-100 wallet infrastructure, a payment-channel contract, receipt experiments, and encrypted storage. Treating those parts as one undifferentiated fork would make upstream synchronization difficult and would let wallet, provider, and product policy leak into the Harness core.

The access methods also carry different authority and billing rules. A personal coding subscription may permit interactive local use while forbidding a shared backend. A user API key remains user-owned and must not become Peck inventory. A Peck-funded API account may serve multiple users only under its commercial terms and needs an exact, auditable charge. Presenting all three methods in one interface must not erase these differences.

Provider names and headline token prices are insufficient for fair routing. Routes can differ by cache price, output price, context tier, time window, tool support, usage reporting, retention policy, and measured task success. A static cheapest-model list would become stale and could select a model that is cheap only for the wrong request shape or time of day.

Cross-repository work adds a second coordination risk. The current Harness branch combines generic question-waterfall work with Peck branding, while payment repositories contain dirty or diverged work. Agents that infer ownership from the workspace alone can edit the same files, build against different wire fields, or overwrite uncommitted work.

## Proposal

The existing `kryp2/deepseek-harness` fork will remain the sole Peck Harness product repository. It will track `deepseek-ai/deepseek-harness` through explicit upstream-sync PRs and keep Peck behavior in plugins, capability packages, and a `peck` composition bundle. Internal `dsh` package and CLI names remain compatible with upstream during the canary. Peck-specific packages remain private until a later distribution decision creates an explicit `@peck-to` publication boundary.

The non-repository `dsh-peck` scaffold is migration input, not a second source of truth. Proven wallet and receipt code moves into reviewed Harness packages. Gateway, channel, storage, and anchoring services retain independent repositories and releases and communicate through versioned HTTP and receipt fields.

The first canary proves one complete path: a BRC-100 wallet authorizes a spending ceiling, `deepseek-v4-flash` serves one streaming request through the Peck gateway, the gateway reserves credit before serving, actual usage settles after serving, and the Harness verifies and displays a signed receipt and remaining balance. Provider expansion, encrypted session backup, channel close, and receipt anchoring follow only after this path passes testnet acceptance.

## Access classes

Peck Harness presents one model-selection experience while preserving three execution classes:

- **Local plan.** A personal interactive subscription or native coding-agent login runs on the user's machine through its permitted tool or CLI. Peck never shares, proxies, or prices that entitlement as public inventory.
- **Your API key.** A user-owned provider credential is encrypted with wallet-derived BRC-2 encryption, decrypted only on the user's machine, and sent directly to that provider. Peck may display provider-reported usage but does not charge sats for the inference.
- **Pay sats.** A commercially meterable Peck provider account runs behind `llm.peck.to`. The request uses reserved channel credit and returns a signed exact-cost receipt.

Provider configuration declares its execution class. A credential or route cannot silently cross classes. Personal-plan credentials are rejected from gateway inventory, and commercially funded calls never fall back to a user's local credential.

## Harness composition

The `peck` bundle composes wallet identity, the Peck gateway adapter, route and receipt presentation, spend policy, and later encrypted backup. Wallet identity and credential ownership form their own capability because sessions, backup, and other Peck features consume them independently of LLM calls.

Direct providers use the existing `llm-pi-ai` provider mechanism. Wallet-funded providers use one `llm-peck` adapter; provider-specific transport and billing interpretation remain in gateway drivers. Adding a model that uses an existing provider protocol is a catalog change, not a new Harness adapter.

The Harness resolves a virtual profile once before an agent session and pins `route_id`, `upstream_model_id`, `catalog_hash`, and `price_schedule_id`. A running session never changes those values silently. If the pinned route becomes unavailable, the user approves a replacement or starts a newly pinned session.

## Metered request and receipt

The gateway accepts a BRC-100 funding proof only after SPV verification. Before forwarding a request, it atomically reserves the maximum amount permitted for that request against the channel. Concurrent requests cannot reserve more than the available channel balance. Completion, cancellation, disconnect, retry, and provider failure each settle or release the reservation through one idempotent request identity.

The versioned signed receipt contains the request id, channel outpoint, channel sequence, provider-qualified route id, upstream model id, catalog hash, price-schedule id, measured input/cache/output usage, actual satoshi charge, response hash, timestamp, and gateway signature. Cross-language schemas and golden vectors live in the repository that owns Peck overlay schemas; the Harness and gateway pin the same schema revision.

The initial budget is a user-selected channel ceiling displayed in sats and estimated fiat. Harness warns at 50, 80, and 95 percent consumption. Exhaustion requires an explicit new authorization; automatic top-up is not part of the canary.

## Catalog, routing, and scheduling

Each provider-qualified route records transport, region, capabilities, context and output limits, reasoning modes, execution class, retention and residency claims, and source verification time. Its versioned price schedule records currency, effective interval, cache-hit and cache-miss input prices, output price, threshold tiers, tool charges, UTC price windows, source URL, and whether verification is provisional. Wallet-funded routing rejects provisional prices.

The router first applies capability, execution-class, privacy, and spending constraints. It then chooses the cheapest route that passes the task category's measured quality and protocol-reliability floor. Cost estimation uses the expected cached and uncached input and expected output instead of adding headline input and output prices. Test failure, invalid tool behavior, or low-confidence completion may escalate to the next qualifying route; a simpler route may continue only at an explicit safe task boundary.

Interactive work dispatches immediately. Work marked flexible stays encrypted on the user's machine and dispatches in the cheapest qualifying price window within 24 hours. Deadline work dispatches in the cheapest qualifying window before its selected deadline. Provider schedules remain UTC data and the UI renders them in the user's time zone, including daylight-saving transitions. A queued prompt is not uploaded merely to reserve a future price, and the route is re-quoted before dispatch.

DeepSeek V4 Flash begins as the paid worker candidate, while DeepSeek V4 Pro, GLM-5.2, Qwen, Luna, and later models enter the appropriate local or commercial class only after contract probes and Peck task evaluations. Subscription quotas and API token prices remain separate price objects.

## Cross-agent execution

One GitHub epic owns the cross-repository dependency graph. Every work item names one repository, one base commit, allowed paths, forbidden shared paths, its schema revision, acceptance commands, and one stable agent identity. Each agent uses a unique worktree and opens a PR under the workspace attribution rules.

The integration owner alone updates shared lockfiles, generated catalogs, bundle composition, schema hashes, and final snapshots. Leaf agents return source changes and generation instructions instead of racing on shared artifacts. `IN_FLIGHT.md` changes once in the final PR for each repository.

Cheap models own bounded leaf packages, provider fixtures, documentation, evaluation cases, and broad test expansion. Frontier review owns protocol fields, wallet cryptography, SPV verification, payment concurrency, settlement, smart-contract integration, and cross-repository acceptance. Production, infrastructure, secrets, deployment, and smart-contract PRs remain `[HOLD]` for Thomas.

The implementation order is upstream baseline, split existing generic and Peck changes, freeze schema and golden vectors, repair reservation and channel opening, connect one metered Harness call, add routing and receipt presentation, complete channel close, add encrypted backup, and finally anchor receipt batches.

## Alternatives considered

**Create another Harness fork.** A fork of the existing fork would duplicate upstream tracking and split product authority without isolating any real deployment boundary. Plugins and a product bundle provide the required separation inside the existing fork.

**Put Peck behavior directly in the Harness core.** This makes the first demo shorter but turns every upstream sync into product-specific conflict resolution and prevents wallet and payment capabilities from evolving independently.

**Proxy personal subscriptions through Peck.** This would blur user entitlement, provider terms, credential ownership, and public billing. Local execution gives one user experience without treating subscriptions as resale inventory.

**Add one Harness adapter per paid provider.** That duplicates wallet, reservation, streaming, and receipt behavior. One Peck adapter keeps the wallet contract stable while gateway drivers own provider differences.

**Route by one static cheapest-model ranking.** Static rankings ignore request composition, price windows, cache use, capability failures, and changing model quality. Versioned prices plus measured task floors make the selection explainable and reproducible.

**Build storage and on-chain anchoring before paid inference.** Those features improve the finished product but do not prove that wallet authorization, inference, settlement, and receipt verification form a usable path.

## Acceptance criteria

- Fork `master` tracks a reviewed upstream baseline, and the mixed existing branch is split into generic behavior and Peck distribution PRs rather than merged intact.
- A testnet user connects a BRC-100 wallet, authorizes a bounded channel, streams one `deepseek-v4-flash` request, pays actual measured usage, verifies the receipt, and sees the remaining balance.
- Concurrent, cancelled, retried, disconnected, duplicated, and failed requests cannot overspend or charge twice.
- Local subscriptions and user API keys never traverse the Peck-funded gateway, and gateway routes cannot consume personal-plan credentials.
- Route resolution is deterministic and pins the provider route, catalog, and price schedule used by the receipt.
- Pricing tests cover cache states, UTC price boundaries, local daylight-saving presentation, catalog expiry, and a price change between queue and dispatch.
- Flexible prompts remain encrypted locally until dispatch and pause rather than exceed the authorized ceiling.
- Every non-trivial implementation PR includes its owning Agent Note, focused tests, a runnable keyless snapshot for user-visible behavior, and the workspace's required PR attribution.

## Risks

Wallet-funded inference creates a money path where a reservation race, unverifiable provider usage, or ambiguous retry can cause loss or unfair charging. The canary must remain bounded and testnet-first until concurrency and idempotency evidence passes independent review.

Provider terms and price schedules change without code changes. A stale catalog can misprice calls or use an entitlement outside its permitted class, so commercial routing must fail closed when source verification expires or usage fields do not reconcile.

Local scheduling saves money only while the Harness process can dispatch the job. The product must state this limitation and must not imply a remote always-on queue while prompts remain local.

The existing repositories contain valuable dirty work. Cross-agent speed increases overwrite risk unless unique worktrees, path ownership, and one shared-artifact integrator remain mandatory.
