# DEMO-S / DEMO-I builder receipt — RED lifecycle groundwork

28 October 2026. Builder: Codex in `codex/sandbox/demo-i`. Builder/source inspection and local test execution only; no independent review, database execution, browser acceptance, commit, push or merge is claimed.

## Scope and behavior

The issued order supersedes the old preparation-only storage hold for bounded synthetic lifecycle groundwork. Current working tree began clean after the router's main catch-up; no conflict markers or unresolved merge entries required repair. Read repository AGENTS, DEMO-S in BUILD_PLAN §10.4, the supplied SIMPLE_LOOP and on-disk SIMPLICITY_RULE, existing P1/P2 contracts, company/practice authority and callers/tests before implementation.

Implemented an additive 0313 migration, shared strict command schemas, repository and application composition class. Five chosen-scenario run attempts can be saved, resumed and reset; immutable lifecycle report snapshots can be written and read. Every scenario currently records a plain refusal, as executable J1–J5 bindings are not installed. Core correction; recovery execution/collection/refund; Final Check execution/attribution; meter profile execution/clock; trial execution/identity/clock still refuse. No domain journey or end figures are faked.

The existing MON-2A company authority is reused instead of treating a practice cookie as company permission. SQL checks persisted synthetic session and active membership on every call, before replay and after lock waits. Follow-up: runs and receipts bind the creator membership returned by `mon1_company_actor` within the company. A fresh valid sign-in for that same user/company resumes saved runs, immutable reports and exact command results. Another member or company cannot adopt the run. Session digests remain request credentials and are no longer stored in lifecycle tables. Database name is independently restricted to the synthetic database. Three new tables have tenant-qualified FKs and FORCE RLS; runtime has no direct table permissions. One metadata-only routine exposes five closed operations.

Reset archives metadata, retains all history and makes one successor. Reports are immutable lifecycle facts only; no source results, hidden data, money, external-action count or success claim. Metadata commands are idempotent with payload conflicts; mutation audit contains references/hashes and allocates its head last. No network actions, business jobs, company bootstrap, trial keys, subscription terms or financial records are changed. No chooser, transports or J1–J5 implementation is included. The application class is explicit backend composition groundwork, not a registered HTTP/browser feature.

## Actual validation

- Installed Node v24.17.0, TypeScript 5.8.3, Vitest 4.1.12; explicit repository working directories, existing installed binaries, maxWorkers=1, one named Vitest file per invocation.
- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed.
- `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` — passed, including the added application tests.
- Rebuilt existing core/config/db dist with their installed TypeScript compiler to resolve stale local build exports; no package download or tracked dependency change. Initial API collection errors came from stale activation/config exports; final actual runner passed.
- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=1 src/small-builder-demo-repository.test.ts` — 17 passed. Real repository boundary/transaction/rollback tests using fake pg; not PostgreSQL evidence.
- From apps/api: `./node_modules/.bin/vitest run --maxWorkers=1 src/small-builder-demo.application.test.ts` — 106 passed: existing strict-boundary cases plus actual application current-session/membership/production refusal tests.
- `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` — passed; purity reports its existing computed-import notices.
- Exact lane allowlist comparison against all 13 changed/untracked files — passed (12 functional/receipt paths plus the lane file).
- Supplemental no-emit compilation of the two CI integration files reached an existing imported fixture error at `packages/db/test/job-work-state-fixtures.ts:45` (`proofEvidenceTypeSchema.options[0]` is `string | undefined` under strict indexing); no diagnostic points to the new files. This supplemental check is not claimed passed and the unrelated fixture is unchanged.
- `git diff --check` — passed. Read-only git only; no commit/index/branch writes.
- The pnpm version launcher attempted registry verification and refused due to unavailable registry; used already installed repository compiler/test binaries, without downloading packages or changing launcher policy.

CI must run `test/small-builder-demo.integration.test.ts` and `test/small-builder-demo-upgrade.integration.test.ts` with maxWorkers=1. They cover fresh install, populated own-step upgrade and repeated runner; all-five persisted refusals; reload; replay and changed payload; same/different concurrent resets; stale/archive boundaries; immutable snapshots and exact run/snapshot binding; another company, another user in the same company and fresh valid sessions for the owner; session revocation including lock wait; raw SQL injection/privilege/RLS/pooled-context boundaries; unchanged job, trial-key, meter, subscription and journal history; and one audit event per original metadata command. They are written but NOT RUN locally: issued sandbox cannot start PostgreSQL or bind localhost. Browser suites are likewise left to CI; no browser behavior changes in this groundwork. Required complete CI and independent Claude RED review remain before merge.

## Initial source review

Found and fixed a trigger error before handoff: report/receipt immutability must branch before accessing run-only OLD/NEW fields. Guards now reject non-run updates immediately. No weakened tests or unrelated refactoring.

LATER / SIMPLICITY — `packages/db/migrations/0313_small_builder_demo_runs.sql`, `small_builder_demo_audit`: it follows the existing MON-2 SQL audit pattern. A future shared SQL audit-append helper could replace the duplicated canonical/hash assembly in MON-2 and DEMO-I, reducing future audit-format drift. That cross-piece refactor is outside this task and does not block.

## Handoff

Router commits/pushes/opens PR and updates finish/work lists outside this sandbox. Lane file lists exactly this piece's changed paths (its own metadata file is implicitly permitted). Migration discovery needs no manual edit. No secret, operational alert, provider or release configuration added. Existing interfaces are preserved through the API contracts re-export; added interfaces are versioned. No data backfill; forward-fix only, no destructive rollback. This remains RED for tenant/session isolation and hidden-data boundaries; product/journey acceptance is not asserted.

## Resume/reset follow-up — 28 October 2026

Issued follow-up to DEMO-I for DEMO-S finish-list row 21; RED (tenant isolation). Edited unmerged migration 0313 in place. Removed session-digest columns from run and receipt metadata and session comparisons from run, successor and replay lookup. Company-qualified owner membership is the authoritative identity. Every call still revalidates the current synthetic session and membership before replay and after the company lock. Reset still archives; no deletes, domain writes or changes to the synthetic database guard.

Added a locally executed application regression for re-authentication and fresh digest forwarding for the same membership. Added CI PostgreSQL cases for two fresh sign-ins with prior sessions revoked, create/snapshot/reset replay without duplicate runs/receipts/reports/audit events, unchanged historical snapshots, current archived state versus original replay results, successor resume, stale/archive rejection, expired/revoked session denial, another owner in the same company, foreign-company command scoping and the owning user with valid membership in another company. Extended the existing company fixture with an optional tenant ID to reuse its existing identity/session setup for the same-company adversary.

Follow-up checks actually run using installed binaries (no downloads):

- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed.
- `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` — passed.
- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=1 src/small-builder-demo-repository.test.ts` — 17 passed.
- From `apps/api`: `./node_modules/.bin/vitest run --maxWorkers=1 src/small-builder-demo.application.test.ts` — 107 passed, including the new fresh-sign-in boundary regression.
- From `packages/db`: `./node_modules/.bin/vitest list --maxWorkers=1 test/small-builder-demo.integration.test.ts test/small-builder-demo-upgrade.integration.test.ts` — collected all 14 cases, including the new adversaries; collection only, no PostgreSQL execution. An initial invocation from the repository root found no root Vitest binary; reran from the established database package directory.
- `git diff --check` — passed. Existing lane-policy loader and `lanePathAllowed` checked all eight follow-up paths successfully. The lane retains original DEMO-I PR paths and adds only the reused company fixture path; its own file is implicitly allowed by repository policy.

The updated PostgreSQL adversaries and existing upgrade/browser suites require GitHub CI; no database/browser execution is claimed. The earlier RED review at 418e6115 does not cover this follow-up; the router must arrange the new exact-head RED review. No git writes performed; router owns commit, push, PR and work-list updates.

## PR #387 repair round 1 — migration syntax

The current-main merge arrived clean: no unresolved conflict entries or shared expectation-list conflicts. Re-read SIMPLE_LOOP, SIMPLICITY_RULE, repository instructions, DEMO-S plan scope, migration 0313, runner and affected tests.

CI error position 6288 lands at the end of `WHEN 'snapshot'`, immediately before the CASE expression's `THEN` in the contract-version IF. The unparenthesized SQL CASE lets PL/pgSQL terminate its IF expression at that inner THEN, producing an incomplete SQL expression. Parenthesized that CASE expression; this is a one-line syntax repair with no ownership, replay, archival or synthetic-guard behavior change. The dollar delimiters and transaction were already complete.

The migration runner reads the full file and submits one atomic query; it does not split statements or dollar-quoted bodies. Its only 0313 rewrite inserts migration bookkeeping before the terminal COMMIT. Added a runner regression to the existing repository unit suite proving the submitted batch equals the entire on-disk 0313 with precisely that bookkeeping insertion, including the routine's end. The existing lane already covers every repair path.

Actual local checks, using installed binaries and no downloads:

- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed.
- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=1 src/small-builder-demo-repository.test.ts src/migrate-discovery.test.ts` — 21 tests passed across two files, including the new complete-batch regression.
- Static check of the entire SQL: five complete dollar-quoted bodies; balanced SQL quotes and parentheses inside/outside each body; body ENDs, closing statement semicolons, BEGIN/COMMIT and parenthesized CASE confirmed. This is structural validation, not a PostgreSQL parser execution.
- From `packages/db`: `./node_modules/.bin/vitest list --maxWorkers=1 test/small-builder-demo.integration.test.ts test/small-builder-demo-upgrade.integration.test.ts` — 14 cases collected, not executed. Existing tests exercise fresh migration, populated upgrade, repeated runner, all operations and ownership adversaries in CI.
- `git diff --check` and existing lane-path validation — passed.

The sandbox cannot start PostgreSQL, so actual PostgreSQL compilation and database assertions still require GitHub CI. No database success or new independent review is claimed. No git writes; router commits and pushes the repair. RED classification remains unchanged.
