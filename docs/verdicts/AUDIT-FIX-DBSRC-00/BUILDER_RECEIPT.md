# AUDIT-FIX-DBSRC-00 builder receipt

Disposition: **STOP — migration required; no implementation delivered.** This is a builder handoff, not an independent verdict or technical acceptance.

Issued 13 October 2026 by dispatcher 4. Inspected 14 October 2026 in branch `codex/sandbox/audit-fix-dbsrc-00`; HEAD and `origin/main` both `bd959b01e857de0ba7cbd3588bab84add7d0f493`. Initial working tree was clean. Node `v24.17.0`; dependencies were already present; no install performed.

Source: `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-00.md`. Applicable contracts read: AGENTS.md and BUILD_PLAN.md §§2.4, 5.1–5.3. Check lane: RED (commercial acceptance, authorization and money).

## Blocking findings

1. **STOP: Cancelled acceptance cannot be renewed.** Source inspection confirms three independent obstacles: `packages/db/src/acceptance-repository.ts:29` uses the permanent `practice-accept:<documentId>` key; `packages/db/migrations/0011_quote_acceptance.sql:3` has `UNIQUE(tenant_id,job_id,document_id)`; line 14 unconditionally inserts the same document ID into `app.quote_version`. Lines 27–28 preserve acceptance/event history with immutable triggers. The existing controlled routine is the only acceptance write path; searching all migrations found no replacement for it or removal of the uniqueness constraint. An application replay-key change alone cannot record a second acceptance of the same exact document while preserving the original history. A migration must change the schema and controlled routine, with corresponding cancellation/active-acceptance selection changes. The work order explicitly says: “No migration unless the finding cannot be fixed without one (then STOP and say so).” Stopped before writing tests or fixes; no database execution or failing-test reproduction claimed. This remains a migration blocker, not a reproduced or completed finding.
2. **Not attempted after mandatory STOP: An unsent preview prevents acceptance of the sent quote.** No failing test or fix written. Dispatcher must decide whether to split this into a separate no-migration work order. No claim of reproduction or resolution.

The DROPPED rule was not used to recast the mandatory migration STOP as a test result: no reproduction was attempted after the stop condition was established.

## Later findings (receipt only)

- Changed acceptance/disposition metadata does not produce a payload conflict (`statedMethod`, `acceptedAt`, `occurredAt`).
- Operator reachability guard misses a `let`-bound `createRequire` loader.
- Audit's five test-strengthening suggestions: repository-level cancellation/reacceptance and newer-preview coverage; observable activation lock contention; mutable-loader fixture; PostgreSQL CLI copy-failure rollback comparison; repository-level own/foreign/nonexistent account reads under alternating tenants.

## Changes and invariant preservation

- New compact lane row only: before, no `audit-fix-dbsrc-00` row; after, its exact allow list contains only the lane registry and this receipt. All existing rows are unchanged. Shared registry edits require serialization by the coordinator.
- Added this receipt. No premise-establishing test setup or other catalogue additions.
- No product code, existing test, expected value, refusal, count, pinned name, fingerprint, migration, grant, package or lockfile changed. `apps/api/src/auth/context-boundary.test.ts` and its pinned lists are untouched.
- No Git-writing command, network provider action, real data, spending, PostgreSQL or browser startup. Intended commit message goes to `/private/tmp/jg-msg-audit-fix-dbsrc-00.txt`; dispatcher owns commit/push.
- No data migration, compatibility change or new operational alert delivered. Existing acceptance defects remain. Independent exact-commit verdict, separate acceptance and applicable release gates remain outstanding.

## Checks

Baseline checks below do not prove either audit finding fixed. This administrative diff does not fulfill the audit task's acceptance criteria. Local binaries were used when the pnpm launcher stalled; those runs are not represented as successful root pnpm checks or a clean pinned install.

| Command actually run | Result |
| --- | --- |
| `pnpm typecheck`; `LANE_BASE_REF=origin/main pnpm lint`; `LANE_BASE_REF=origin/main pnpm lint:lanes`; `pnpm build`; `pnpm openapi:check` | Launcher printed a pnpm configuration warning then stalled without running the checks; interrupted with SIGINT (130). No install was run. Launcher targets global pnpm v11; repository requires 10.28.1. Attempts to obtain the launcher's version with package-manager-management disabled also stalled and were interrupted; an already cached pnpm 9.0.0 binary reported 9.0.0 and was not used for checks. |
| `./node_modules/.bin/tsc -p tsconfig.json --noEmit`, separately in config, core, storage, ai, db, api, web | All seven passed (0); matches the workspace lint/typecheck scripts. |
| `./node_modules/.bin/tsc -p tsconfig.json`, separately in config, core, storage, ai, db, api | All six passed (0). API's actual Nest build is recorded separately below. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs`; `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Core purity passed (158 files); lane lint refused `Missing branch or self-comparison range; refusing a misleading pass.` HEAD equals origin/main. No base override or lint change made. |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | Both passed (0). An additional attempted `node tools/decision-check-purity-lint.mjs` failed because that script does not exist; the real decision-check-purity test below passed. |
| API: `./node_modules/.bin/tsx src/generate-openapi.ts --check` | Sandbox EPERM creating tsx IPC socket. |
| API: `node --import tsx src/generate-openapi.ts --check` | Passed (0), using the installed loader without the CLI IPC socket. |
| `./node_modules/.bin/vitest run --maxWorkers=1`, separately in core, config, storage, ai | Passed: core 115 files / 2818 tests; config 2 / 2; storage 2 / 4; ai 5 / 80. AI run uses existing fixture tests, not a live model. |
| DB: `./node_modules/.bin/vitest run --maxWorkers=1 src` | 4 files passed / 1 failed; 86 tests passed / 1 failed. Existing `[C-OPS-1] all transitive request workspace sources and package entry targets cannot reach the operator` timed out at its unchanged 5000ms limit (`src/audit-checkpoint-handoff.test.ts:279`). No test/timeout change or assertion of audit reproduction. |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | 19 passed. Excluded the two lane-boundary fixture suites because they execute Git-writing commands. |
| Supplementary inline Node check using `selectLane`/`matches` and read-only Git comparisons | Passed: exact lane covers the two changed files; every existing lane row remains unchanged; only this lane added. Not a full lane-lint pass. |
| `git diff --check` | Passed. Read-only Git status/diff checks used; no Git-writing command. |

Web: `./node_modules/.bin/vitest run --maxWorkers=1` passed (33 files / 784 tests). API: `./node_modules/.bin/nest build` passed (0).

API tests: a Python runner selected `src/**/*.test.ts` excluding sources containing `supertest`, `embedded-postgres`, `.listen(`, `startNext`, `mkdtemp`, `createServer`, or `freePort`, then invoked `./node_modules/.bin/vitest run --maxWorkers=1` with those explicit paths. Excluded files: `auth/context-boundary.test.ts`, `auth/sso/action-paths.test.ts`, `contractor/contractor-practice-session.http.test.ts`, `contractor/site-extra-pricing.http.test.ts`, `contractor/site-extra.http.test.ts`, `contractor/site-visit.http.test.ts`, `health.test.ts`, `shadow-isolation.application.test.ts`. Result: 63 files passed / 1 failed; 1412 tests passed / 1 skipped. The selected `final-account-lock.isolation.test.ts` imports a real-DB fixture indirectly; its setup failed `no free port in 58400..58650` because socket probes were denied. No PostgreSQL process started. The filter was insufficient to isolate all database-dependent suites; this is not a successful complete API run. Vitest exited 1 (the reporting Python wrapper itself exited 0). Dispatcher must run the complete API suite outside this sandbox.

Web: `./node_modules/.bin/next build` first failed resolving `@jobguard/api/identity` while the initial API compilation was running. Retried after the API entry had been emitted (Nest build also completed successfully during the retry); the second run passed (0), including compilation, type validation, static generation and build traces. Existing autoprefixer `end`/`flex-end` warnings and a multiple-lockfile workspace-root warning remain unchanged. No browser/server journey was run.

## Dispatcher checks on the Mac / GitHub CI

After a migration-authorized implementation is separately issued, first run the audit's two named reproductions against real PostgreSQL: `accepts the same document again after explicit pre-live cancellation` and `accepts an unsuperseded sent quote after a newer unsent preview`. They have not been added in this stopped work order. The former must cover unchanged original history, later acceptance timestamp and successful switch-live; the latter must bind D1's exact ID/version/hash and 120000 pence gross while D2 remains unissued.

With pinned pnpm 10.28.1, run the root `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `LANE_BASE_REF=origin/main pnpm lint:lanes`, `pnpm build` and `pnpm openapi:check` after the dispatcher commits. Run full `pnpm test`, `pnpm test:db`, `pnpm test:migrations` (plus explicit fresh/upgrade tests for any new migration), and affected browser journeys with `pnpm test:e2e` on both existing projects. This sandbox cannot start PostgreSQL or bind localhost. These suites are deferred, not optional or passed. Review any necessary grants under standard F; no grant is proposed here.
