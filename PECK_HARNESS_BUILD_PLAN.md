# Peck Harness build plan (rough working draft)

How this harness executes the [distribution and metered routing plan](.agents/notes/proposed/architecture/2026-08-18-peck-distribution-and-metered-routing.md), and what gets upgraded before real work starts. Status tracker: [epic #3](https://github.com/kryp2/deepseek-harness/issues/3).

## A. Upgrades BEFORE we start (prerequisites, in order)

1. **Land the preset stage-storm fix in the fork trunk** — branch `fix/agent-preset-stage-storm-2026-08-18` (commit `ce623ca641`) is ready; upstream takes no external PRs and has PRs disabled, so the fix lives in the fork trunk; optionally report the bug upstream via GitHub Discussions.
2. **Fix the live deployment** — cherry-pick the fix into the branch the running `dsh web` serves from, rebuild in a coordinated window, verify preset switching works end-to-end (new session starts on Peck.to; no storm).
3. **Toolchain alignment window** — node_modules was built by pnpm 9.15.9, manifest pins 11.7.0. One deliberate reinstall when the server can be down; never purge under the live server.
4. **Repair the local e2e environment** — three apps/web files (agent-preset-selection, skill-invocation-policy, skill-user-invoke) fail identically with and without changes on this machine (skill-discovery environment failures). Agents need honest green/red before fan-out begins.
5. **Orchestration setup** — epic #3 is the single tracker; fix the worker model-tier map: cheap leaves (fixtures, docs, eval cases, broad tests) on deepseek-v4-flash; frontier work (wallet crypto, SPV, payment concurrency, settlement, contracts) on v4-pro / gpt-5.6-luna; subscription CLI agents (codex, claude, opencode-go) through the clia plugin; async decisions to Thomas via the telegram bridge.

## B. How the harness is used (execution model)

- One master session (Peck.to preset) orchestrates; fan-out through the DSH `workflow` tool with per-agent `model` overrides, plus `subagent`/`subagent_fork` for single delegations (depth cap 3).
- One work item = ONE repository, one base commit, allowed paths, forbidden shared paths, one unique worktree, one stable agent identity (`dsh-peck/<model>`).
- Leaf agents return source changes + generation instructions; the integration owner alone updates shared artifacts (lockfiles, generated catalogs, bundle composition, schema hashes, final snapshots).
- Every change carries `Agent: dsh-peck/<model>` + `Co-authored-by`; PRs touching production, infra, secrets, or smart contracts are `[HOLD]` for Thomas.
- Fork mechanics: no PRs exist (fork + upstream both closed to PRs) — changes land as branches, owner-merge to trunk after checks ([standing order](.agents/notes/implemented/process/2026-08-18-agent-workflow-in-the-peck-fork.md), untracked until committed).

## C. Work order (from the codex plan)

- [x] 0. Sync fork master to upstream baseline (rc.7, `99f6f02fec`)
- [x] 1. Preset stage-storm fix — merged to fork master (`ce623ca641`); agent-workflow + plan notes merged (`432ac1315b`); upstream Discussions post pending (token cannot write discussions)
- [ ] 2. Split the mixed branch `feat/user-questions-waterfall-telegram` — generic waterfall/telegram/event-scope/Cordis-idempotency vs. Peck rebrand
- [ ] 3. Freeze receipt schema + golden vectors (overlay-schema repo owns; harness + gateway pin one revision)
- [ ] 4. Repair reservation + channel opening (llm-gateway atomic reservation; BRC-100 funding proof after SPV)
- [ ] 5. **Canary**: one metered `deepseek-v4-flash` stream through llm.peck.to — reserve before serve, settle after, signed receipt verified + displayed, balance shown
- [ ] 6. Route catalog + constraint routing + receipt presentation (pinned route per session)
- [ ] 7. Channel close
- [ ] 8. Encrypted session backup (BRC-2, local-first)
- [ ] 9. Anchor receipt batches on BSV

## D. First steps tomorrow

1. Re-record translation pairing for the two untracked note pairs in the worktree, `doc-sync`, commit + owner-merge to fork master.
2. Owner-merge the preset fix branch to fork master (fast-forward).
3. Cherry-pick the fix into the live deployment branch; rebuild in a quiet window; verify Peck.to preset + switching in the GUI.
4. Start item C.2 (branch split) as the first orchestrated fan-out.

## Known environment facts (for any agent)

- This session ran under PTC code mode; user-settings default is already `peck` — new sessions compose from Peck.to.
- Model routes in `~/.dsh/settings.yaml`: qwen-token-plan (this session), opencode-go (default agent model kimi-k3), openrouter (gemini-3.7-flash, deepseek-v4-flash-0731, glm-5.2, gpt-5.6-luna).
- pnpm lives at `~/.npm-global/bin` (9.15.9); lefthook pre-push runs the incremental typecheck.
