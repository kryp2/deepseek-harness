# IN_FLIGHT — deepseek-harness (Peck fork)
_Sist oppdatert: 2026-08-22 (post-sync GUI gjenopprettet)_

## Sist gjort
- 22.08 kveld: **GUI-et er helt tilbake** (PR #11, `1fbe7c0dbf`). To post-sync-regresjoner: (1) merkevaren lå i nye slots som `ui-brand-official` bare fyller under `DSH_CLIENT_BUILD_PROFILE=official` ⇒ **forken MÅ bygges med `pnpm run build:official`**, ellers ryker fugl + «Peck Harness»; (2) `agent.inject()` med rå streng (peck-meta-digesten) forgiftet innboksen ⇒ `queueItems` kastet ⇒ WebSocket-upgrade rev socketen ⇒ ingen workspace/sesjoner lastet. `Inbox` reparerer nå slike poster ved replay. ⚠️ 5 repo-porter (constraints, licenses, docs:build:mpa, module graph, knip) er RØDE på master fra før — verifisert identiske på master og branch, ikke rør dem i forbifarten.
- 22.08 kveld: **`dsh-web.service` restartet — GUI er oppe igjen.** Prosessen kjørte fortsatt pre-sync host fra 01:45 mot 18:14-klientbygget, så siden døde på «`__ModuleLoader__` bootstrap facade is missing». Restarten avdekket den ekte blokkeringen: alle tre statiske host-plugins i `peck-meta/tools/*.plugin.mjs` lå på pre-sync cordis-kontrakt (`bash`-tjenesten heter nå `shell`; udeklarert `ctx.tools` kaster). Fikset i peck-meta PR #15; boot grønn, 0 restarts, 37 klient-plugins aktive.
- 22.08: **FULL UPSTREAM SYNC MERGET** — PR #10 (`edcae975`): 750 commits inn (0.1.1-rc.2-familien), drift 743 → 0. Våre pakker portet til ny ProjectionDefinition-kontrakt; versjoner alignet til rc.2; lockfile/notiser/kataloger regenerert; zh-tabeller speilet; doc-sync 28/28, typecheck 0 feil, test:gui 3997 grønne.
- 22.08: Farge-fullføring merget (#9, `3fdd38f01e`). Attribusjonsreglen klarget i peck-to/CLAUDE.md + AGENTS.md: `Agent:`-linje FØRST i PR-body når agent har bidratt; commit-trailere forblir hook-skrevne.
- 22.08: PR #28 (llm-gateway docs) og #83 (overlay PoW-term) merget på Thomas' autorisasjon.

## Neste
- Gateway-siden av C.3: pin `peck/v1/inference-receipt` i llm-gateway (G1-arbeidet der er startet, branch feat/g1-spv-channel-verification).
- Canary-riggen (C.5): precheck (nøkkelkunde-verifisering) → ENFORCE_PAYMENT via tagget revisjon → én målt deepseek-v4-flash-strøm.
- **Ukentlig sync-rutine**: fetch upstream + merge inn i `sync/upstream-<dato>` + porter + Telegram-rapport — nå er deltaet smått (~100 commits/uke).
- Ryddeøkt 22.08 kveld: 11 stale remote-branches slettet på kryp2/peck-harness (alle verifisert innhold i master via ancestry/git-cherry/fil-diff), lokale branch-trær = kun master, deployment-traps + IN_FLIGHT landet (`3afa483a8a`), claude-cli retestet grønt post-sync (37/37), full build kjørt (host+client).

## Blokkert / venter på
- Upstream er pull-only speiling; sync = fetch upstream + merge inn i kryp2/peck-harness.
- pnpm A3: bruk alltid `npx -y pnpm@11.7.0`; node_modules er nå reinstallert på 11.7.0 (purge godkjent av Thomas 22.08).
