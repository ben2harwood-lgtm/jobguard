# MON1-T builder receipt — 23 October 2026

**BUILD PREPARED; HOLD for integration, PostgreSQL CI, independent reviews and acceptance.**
No commit, push, PR, merge, deployment, enablement, provider action, real data or spending.
Ben owns merge; the dispatcher commits after builder exit. This is a builder run
receipt, not an independent model verdict or acceptance.

## Issuance and inspected baseline

- Order: issued MON1-T, Build Speed Plan v5 wave 2, decision 74, 23 October 2026;
  authorized build-ahead only. The issued branch/number override proposed draft names.
- Worktree: `.worktrees/mon1-t`, branch `codex/sandbox/mon1-t`.
- `git rev-parse HEAD`: `14eca75074217fa82fb719c38cac8a997eec59ad`.
- `git rev-parse origin/main`: `dc5721230fd8aedbf2d9d0457789074b66b48765`.
- Initial `git status --short`: clean. No tracked predecessor file was edited.
- Base contains unmerged CH-4-C #290. Its presence is source evidence only, not
  acceptance, merged ancestry or a cleared H-CH4/H-PREDECESSORS gate.
- Read AGENTS.md, applicable BUILD_PLAN §10.1.6/MON-1 and parent contracts,
  the workstate–meter–trial pack common §§1–2.5/holds and MON1-T draft,
  MIGRATIONS.md migration instructions, and actual source/schema/test seams.
- Verified existing names/paths: `approvePricedVariation`,
  `BuilderCaptureRepository`, `FinalAccountCommandService`, `job_activation_terms`,
  `variation_approval`, `final_account_lock`, `exceedsSmallJobTripThreshold`,
  tenant transaction API, `test/lock-order-1.test.ts`,
  `job-work-state-sources.integration.test.ts`,
  `job-work-state-post-lock.integration.test.ts`,
  `job-work-state-races.integration.test.ts`, `variation.integration.test.ts`,
  `final-account.integration.test.ts`. New trip symbols/tables were proposed and
  absent as expected; this leaf supplies them, without shared exports or consumers.

## Delivered within the exact allowlist

- `packages/db/migrations/0206_meter_small_trip.sql` and matching migration note.
  Two immutable RLS tables, stable tenant/job trip identity, numbered observations,
  source FKs/hashes, exact net and original/recorded timestamps. Private source
  reconstruction and atomic audit append; no public/runtime EXECUTE or source trigger.
- `packages/db/src/meter-small-trip.ts`: strict versioned Zod projection,
  typed validation failures and `readSmallTrip(transaction, jobId)` for an existing
  job-authorized transaction. No HTTP surface or independent authority grant.
- Three own PostgreSQL test files: threshold, revisions, no-rebuild final-review
  source, unapproved proposals, latching, delayed earlier source, invalidating late
  omission hold, private concurrency/replay/rollback, lock-vs-approval both orders,
  RLS/grants, read projection, preceding-schema upgrade and successor preservation.
- `docs/contracts/meter-small-trip-v1.md`, exact lane `config/lanes/mon1-t.json`,
  and this receipt. No shared barrel/catalog/migration runner/routing/source edits.

Tests were prepared against the proposed seam during implementation, then refined
against actual schema and function checks. The delegated builder owned only the
three allowed test files; this was builder collaboration, not independent review.

## Simplest proposed choices bound here

1. Replay is SQL over immutable activation terms and approved revision facts;
   no parallel final-account calculator or draft rebuild dependency.
2. Source kinds are `activation` and `variation_approval`. Only originally small
   jobs can trip, so persisted crossing sources are approvals. Source-bound latest
   revision per variation is selected chronologically by `(created_at,id)`.
3. Use server-default approval `created_at`, not caller-supplied `approved_at`;
   preserve six-digit UTC in hashes and read output. Default transaction timestamps
   and raw source-write privileges are a predecessor provenance limitation, not
   proof against forged source rows. Exact integration timestamp authority remains
   a STOP below; no historical source is rewritten or newly pinned here.
4. Exact numeric intermediate totals, checked existing magnitude limit, strict
   `>400000p`; omissions cannot remove a historical crossing. Replayed same source
   hash adds nothing; late earlier crossing appends linked observation with same ID.
5. Late facts removing/postponing a latched crossing raise
   `SMALL_TRIP_RECONCILIATION_REQUIRED`, preserving history and smallness loss.
6. Require existing tenant lock184 by inspecting pg_locks; never take it late.
   Private invoker routine requires migration role and matching tenant context;
   source owner authenticates/rechecks current authority before this call. Audit
   allocation is last. No new broad role or source-table grant.
7. Existing approval table lacks `(tenant,job,id)` unique key; use its tenant/source
   FK plus checked job/revision binding, and existing composite revision/activation/
   baseline FKs. Do not alter fingerprinted parents to create a new key.
8. Fixtures intentionally seed activation parents in replica mode and original
   fictional approval times. Trip routines/tables run with normal enforcement.
   These are private foundation tests, never substituted for app-command journeys.

## Local commands and actual results

Runtime: Node `v24.17.0`. Existing cached pnpm `10.28.1` was invoked via
`PATH=/private/tmp/jg-mon1-t-bin:$PATH`; its wrapper executes
`/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`.
No dependency installation/download was performed. Initial system pnpm invocations
(`pnpm --filter @jobguard/db typecheck`, `pnpm --version`, and a version-manager
configuration probe) hung before script execution and were interrupted (130).
The cached pinned binary resolved this without changing repository configuration.

| Command | Actual result |
| --- | --- |
| `pnpm --filter @jobguard/db typecheck` (pinned binary) | PASS, exit 0; rerun after final source/test preparation |
| `./node_modules/.bin/tsc -p /private/tmp/jg-mon1-t-test-tsconfig.json` | PASS, exit 0; strict noEmit compilation of all three new integration files and imported helpers; package tsconfig otherwise excludes test/ |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lock-order-1.test.ts` | Initial FAIL: core dist not built; rerun after build PASS, 1 file / 4 tests |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/meter-persistence.test.ts src/meter-repository.test.ts` | PASS, 2 files / 12 tests; supplied-input regression evidence only |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/jobs-on-the-go.test.ts` | PASS, 1 file / 38 tests; unchanged pure meter regression |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL, exit 1: lane rejects inherited CH-4-C files against origin/main; core-purity phase PASS, 231 TS files with 7 pre-existing computed-import reports |
| `pnpm lint:lanes` | FAIL, exit 1: same inherited CH-4-C range, not MON1-T file edits |
| `LANE_BASE_REF=14eca75074217fa82fb719c38cac8a997eec59ad pnpm lint` (diagnostic) | FAIL, exit 1: linter explicitly refuses self-comparison; no substituted PASS claimed |
| `pnpm exec turbo run lint --concurrency=2` | PASS, 7 tasks, 2 cache hits; package checks only, without replacing the requested failed lane gate |
| `node tools/money-arithmetic-lint.mjs` | PASS, exit 0 |
| `node tools/commercial-boundary-lint.mjs` | PASS, exit 0 |
| `pnpm build --concurrency=2` | PASS, 7 tasks, 2 cache hits. Nonfatal shared-cache EPERM, Next workspace-root/CSS and Nest file-type dependency warnings reported |
| `pnpm openapi:check` | FAIL, exit 1: tsx CLI IPC pipe listen EPERM in sandbox |
| `node --import tsx apps/api/src/generate-openapi.ts --check` from root | FAIL: root has no tsx package resolution |
| `node --import tsx src/generate-openapi.ts --check` from apps/api | PASS, exit 0; same generator/check, socket-free loader invocation |
| `git diff --check` | PASS for tracked diff; new files additionally checked in final scope/whitespace inspection |
| Node lane-policy check of issued-base tracked delta + untracked files using existing `loadLanePolicy`/`lanePathAllowed` | PASS; exact MON1-T working-tree paths only. This is a bounded scope check, not the failed main-range gate |

The test builder additionally ran TypeScript transpileModule syntax checks on the
three integration files, exit 0 with no diagnostics. This was parsing evidence,
not database execution. Root strict test compilation above supplies type evidence.
All Vitest commands use at most `--maxWorkers=2`; build/lint Turbo concurrency is 2.
No PostgreSQL or browser suite was launched.

## Acceptance mapping — written, NOT PostgreSQL-executed

| ID | Prepared evidence and remaining boundary |
| --- | --- |
| M1T-01 | 399999/400000/400001, latest approved replacement and exact SQL arithmetic; CI pending |
| M1T-02 | Later approved omission and unapproved revision keep stable event; CI pending |
| M1T-03 | Private approved final-review fact trips without draft rebuild; actual source hook HOLD MON1-I |
| M1T-04 | Draft/priced/rejected/withdrawn-only facts do not trip; unsupported price/payment/catch kinds refused; CI pending |
| M1T-05 | Stable event, two immutable observations, microseconds, replay and invalidation hold; computation/statement correction uniqueness HOLD MON1-S/I |
| M1T-06 | Overlapping source INSERT+capture, replay, earlier source concurrency and source/trip/audit rollback; authenticated command composition HOLD MON1-I |
| M1T-07 | Private tenant-first lock/approval orders and delayed pre-lock source; actual source/lock command races and catch consumer proof HOLD MON1-I |
| M1T-08 | Tenant/job/source, private EXECUTE, table privileges, caller amount/time absence, read validation; revoked session/owner and practice authority HOLD integration |
| M1T-09 | No source API edits or trip responses introduced; actual integrated public output/UI proof HOLD MON1-I/R/J |
| M1T-10 | Fresh fixture migrations and N-alone populated upgrade, grants/policies/rows/types and successors twice; PostgreSQL execution pending CI |

## NOT RUN — required dispatcher/CI checks

By issued restriction, PostgreSQL and browser suites are NOT RUN locally. The
following draft commands remain required CI evidence after predecessors merge:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/meter-trip.integration.test.ts test/meter-trip-races.integration.test.ts test/meter-trip-upgrade.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/job-work-state-sources.integration.test.ts test/job-work-state-post-lock.integration.test.ts test/job-work-state-races.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/variation.integration.test.ts test/final-account.integration.test.ts
```

`pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e`, full `pnpm test` and full
required GitHub CI: NOT RUN. Root test includes database suites; no socket-based
subsystem was made optional. No browser spec belongs to this private no-route leaf
(C1 reason in lane); affected integrated journey checks remain downstream mandatory.
AI eval/live-model runs: NOT RUN / inapplicable; no prompt/model/extraction change.
Clean install: NOT RUN; dependencies were preinstalled and downloads forbidden.

## Every STOP and continuing hold

- **STOP — lock-order interface:** coordinator must confirm authority precheck,
  tenant184, authority recheck, ordered job/variation/source locks, receipt/result,
  audit-last composition. Existing approval function audits internally; no late
  trigger may acquire tenant184 or a job/business lock after that audit. Unit
  lock-order results are not this missing integration proof.
- **STOP — source timestamp provenance:** existing approval approved_at is supplied
  by caller; created_at defaults to transaction start and raw source inserts can
  supply it. MON1-I/source owner must bind trusted original server-fact provenance
  and post-lock refusal under the accepted authority/lock interface. No new public
  invocation exists until this is resolved; private fixtures do not clear it.
- **STOP — coordinator consumer edits:** variation-repository.ts,
  final-account-repository.ts and activation SQL/TS were untouched. MON1-I must wire
  the seam inside each authoritative source transaction; this leaf cannot claim
  an automatic product trip or source-API acceptance yet.
- **STOP — correction consumers:** MON1-S/I must bind observation revision to new
  source/computation and exactly one next-period correction with unchanged issued
  statements. Negative correction and closed receiving-period holds remain.
- **STOP — main-range lane check:** origin/main comparison includes inherited
  CH-4-C changes and fails exact allowlist. No lane widening, shared policy edit,
  base rewrite or scope-change workaround was used. Re-run after predecessor merge.
- **STOP — database/catalog/upgrade/browser proof:** executable files are prepared
  and typechecked, not PostgreSQL-executed. Shared catalogs are coordinator-owned.
- **STOP — review/acceptance:** no candidate SHA exists because builder cannot
  commit; Claude A/B and separate accepting actor bindings/evidence are not supplied.
  Both exact-head verdicts, green CI and distinct acceptance are still required.

Common draft holds retained verbatim by ID: **H-ISSUE** (this concrete order only
binds build scope, branch, base and number; unspecified review/acceptance seats
remain unbound), **H-PREDECESSORS**, **H-NORMATIVE**, **H-CH4**, **H-B**,
**H-METER-CLOCK**, **H-TRIAL-CLOCK**, **H-CONVERSION**, **H-PRACTICE**, **H-HTTP**,
**H-IDENTITY**, **H-ENABLE**, **H-EXTERNAL**, **H-CH4-Q01/Q03**, **H-REVIEW**,
**H-LIVE**. Irrelevant trial/HTTP/provider operations are untouched, not approved.
Original CH-1/CH-2/CH-3a/CH-4/SV-4 predecessor acceptance evidence remains with the
dispatcher; build-ahead authorization does not assert it. D09 and all live monetary/
region/retention/release gates remain. No parent MON-1/DEMO-S completion claimed.

Backwards compatibility: additive only, no backfill/history rewrite, old readers
ignore new objects. Operational change: private typed reconciliation/range/lock
refusals and appended trip audit facts; no scheduled alert, worker or external action
was installed. Forward-fix/rollback posture is in the same-stem migration note.
