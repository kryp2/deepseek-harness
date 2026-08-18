# Cordis inspect providers now register idempotently

## Problem

`@deepseek-ai/dsh-tool-cordis` registers four host-global Cordis inspect
providers (`Service`, `Event`, `Builtin`, `Tool`) whenever it mounts, and it
is carried by the shipped `cordis` preset as well as forks that copy that
preset (the `peck` preset). The `cordisInspect` registry is process-global, so
mounting a second preset threw `Host Cordis inspect provider "Service" is
already registered`, surfaced to the browser as `SessionCreateError` and a dead
"New session" button. It recurred after every preset/config change that made a
second preset mount.

## Fix

`CordisInspectRegistryService.register()` is now idempotent per manifest id.
The first mount owns the entry; each later mount of the same id takes a
reference, and a disposer evicts the shared entry only when its last holder
disposes. Identical manifests therefore coexist; a genuinely different manifest
under an already-taken id is still the first registration's problem (unchanged
from before, where the id alone collided).

## Scope

Only the Host inspect registry relaxed. Every other "already registered" guard
(tools, skills, subagents, LSP, session projections, agent factories) keeps its
fail-loud duplicate check because there the collision is an authoring error, not
a known idempotent cross-preset re-mount.

## Follow-up

- A reference-count unit test belongs beside the registry; there is no existing
  `inspect-registry` spec to extend, so it lands with the next cordis-host-runner
  test pass.