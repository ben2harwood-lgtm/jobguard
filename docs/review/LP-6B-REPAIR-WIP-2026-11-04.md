# LP-6b repair WIP — 4 November 2026

**Checkpoint only: complete shard results are still pending. Do not merge.**

Branch: `codex/sandbox/lp-6b-repair-wip`. The PR branch remains untouched at
`6c7ded22c533c7d7660beb640144934d8c7f6e53`. Main was merged cleanly in
`4497621853cdccde351c8997d10af3b30667eeb4` (122 commits behind; main
`f78c8168449a08b3db6719a3388d9c23d325ac14`). The initial repair runtime code is
at `2fbb0f52ab30388189806e7ab8a9aa2c6808a636`; `d09babfe` subsequently changes
only an API replay mock and its lane declaration.

## Completed checks so far

Pinned Node 24.15.0 and pnpm 10.28.1. Real PostgreSQL 16.10; synthetic data only.

| Command | Result |
| --- | --- |
| `pnpm --filter @jobguard/web test` | 116 files, 1,638 tests passed |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed with the cloud local-process/network permission needed for Node synchronous subprocesses |
| `pnpm build` | Passed with that same execution permission |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6b-effective-actor-upgrade.integration.test.ts` | Passed; real populated upgrade and stale-context refusal |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/practice-worker-switch.integration.test.ts test/evidence-pack-v3-isolation.integration.test.ts test/contractor-practice-session.integration.test.ts` | 97 passed, 2 failed; see session-only controls below |
| `node --test tools/*.test.mjs` | 410 passed, 4 failed; unchanged shared-money discovery guards |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/watchdog-registry.test.ts` | 108 passed, 18 failed after replay mock fix; untouched query allow-list below |

All four exact core commands are running to completion:

```sh
pnpm --filter @jobguard/db test --shard=1/4
pnpm --filter @jobguard/db test --shard=2/4
pnpm --filter @jobguard/db test --shard=3/4
pnpm --filter @jobguard/db test --shard=4/4
```

They include built `dist` unit tests as well as source tests, matching the normal
build-then-test setup. No suite has been removed or optionalized. No final pass
or full coverage claim is made at this checkpoint. A supplementary browser run
uses installed Chromium 154 through a temporary external launch configuration,
with original test assertions and CI's one worker. The pinned Playwright browser
CDN returned `403 Domain forbidden`; this is not pinned-browser CI evidence.

## Items left for Ben under the repair limits

- `[S9]` in `packages/db/test/extra-origin.integration.test.ts` is unchanged.
- Ending a switch after the effective worker is revoked (`PW32`) and revoking
  one's own session after base membership revocation (`PH11`) retain their old
  session-only contracts, but business binding now refuses before the callback.
  Preserving those controls needs new named binding exceptions and additions to
  `lp6b-deferred-binding.test.ts`. No exception or guard relaxation was added.
- The generic query proxy's fingerprint changed when practice digest setup moved
  after binding. Four tool tests fail against the unchanged baselines in
  `tools/commercial-integrity-boundary.unresolved.json` and
  `tools/commercial-integrity-current-source-guard.unresolved.json`.
- The 18 remaining API stranger/missing-session tests need their binding doubles
  and the query allow-list at `apps/api/src/watchdog-registry.test.ts:877`
  reconciled. The allow-list was left unchanged. The separate replay mock gained
  exact binding answers without changing any guard or assertion.

## S9 values at this checkpoint

These are proposed replacement values for Ben to review, not guard edits made
by the builder. They will be recomputed if the authorized practice bridge changes.

`packages/db/src/practice-session.ts`

- Old: `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14`
- New: `3dfaf399fa6e19763f06ef0e25678a951e19a235e85cd6e526d104f208adae48`

`apps/api/src/auth/context-boundary.test.ts`

- Old: `b77c7b63985dc66d359af04285e099463335085aa47e64100af9473dc9f58bc0`
- New: `78d7c5cafd7714e80d9dd8b904380cfcd3d92bc4157e90927057d10a32ff4ce9`

The practice bridge carries the authenticated credential privately and installs
its compatibility digest after binding. The boundary file includes the approved
LP-6b bridge contracts and the refreshed practice-session pin. S9 still pins the
earlier bytes; every other S9 entry remains unchanged.

## Binding-row removal before real data

Ben must appoint a named database/security operations owner for retention and
removal of `control_plane.request_binding` rows before real data, coordinated
with the LP binding owners and independently reviewed. This repair builds no
cleanup job. Two independent security checks remain pending until the real DB
runs have completed; no independent approval is claimed here.

## First complete four-shard run (before the next repair checkpoint)

| Shard | Passed | Failed | Skipped | Todo | Total tests | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1/4 | 1608 | 8 | 42 | 13 | 1671 | exit 1; 9 failed / 173 passed files |
| 2/4 | 1366 | 16 | 0 | 0 | 1382 | exit 1; 12 failed / 170 passed files |
| 3/4 | 1528 | 30 | 12 | 4 | 1574 | exit 1; 14 failed / 167 passed files |
| 4/4 | 1611 | 12 | 28 | 0 | 1651 | exit 1; 13 failed / 168 passed files |

All four ran to completion on real PostgreSQL. Some skips are failed setup,
not passing assertions. These totals include source and built duplicate unit
tests. Further repairs are being checked; this is not a final-state pass claim.
The WIP now preserves digest-before-tenant compatibility after binding, moves
the binding error into an internal module to retain the original tenant-context
exports, maps binding refusals at domain boundaries, aligns worker fixtures with
queued contexts, and repairs old-schema seed setup. Authentication credentials
are non-enumerable on both real provider principal types; added serialization
assertions cover JSON and shallow copies. No forbidden guard baseline, S9 pin
or privilege was changed. Final S9 replacement hashes must be recomputed after
these authorized practice-bridge edits.
