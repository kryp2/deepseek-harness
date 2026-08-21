# Agent Note: Cordis inspect providers register idempotently

Status: implemented

English | [中文](2026-08-18-cordis-inspect-provider-idempotent.zh.md)

## Problem

`@deepseek-ai/dsh-tool-cordis` registers four host-global Cordis inspect providers (`Service`, `Event`, `Builtin`, `Tool`) whenever it mounts, and it is carried by the shipped `cordis` preset as well as forks that copy that preset (the `peck` preset). The `cordisInspect` registry is process-global, so mounting a second preset threw `Host Cordis inspect provider "Service" is already registered`, surfaced to the browser as `SessionCreateError` and a dead "New session" button. It recurred after every preset/config change that made a second preset mount.

## Decision

`CordisInspectRegistryService.register()` is idempotent per manifest id. The first mount owns the entry; each later mount of the same id takes a reference, and a disposer evicts the shared entry only when its last holder disposes. Identical manifests therefore coexist; a genuinely different manifest under an already-taken id is still the first registration's problem (unchanged from before, where the id alone collided).

Only the Host inspect registry is relaxed. Every other "already registered" guard (tools, skills, subagents, LSP, session projections, agent factories) keeps its fail-loud duplicate check, because there the collision is an authoring error, not a known idempotent cross-preset re-mount.

## Alternatives considered

- **Keep failing loudly and require preset deduplication** — lost: shipped and forked presets legitimately mount the same providers twice, so the second mount is normal operation, and surfacing it as `SessionCreateError` with a dead "New session" button was the bug itself.
- **Relax the other registries the same way** — lost: for tools, skills, subagents, LSP, session projections, and agent factories a duplicate is an authoring error, and the fail-loud guard is what catches it.

## Consequences

Duplicate-inspection false alarms are gone for multi-preset compositions at the cost of one reference count per shared entry. A reference-count unit test belongs beside the registry; there is no existing `inspect-registry` spec to extend, so it lands with the next cordis-host-runner test pass. The duplicate guards everywhere else are untouched.
