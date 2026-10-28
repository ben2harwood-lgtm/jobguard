# DEMO-S / DEMO-I builder receipt — RED lifecycle groundwork

28 October 2026. Builder: Codex in `codex/sandbox/demo-i`. Builder/source inspection and local test execution only; no independent review, database execution, browser acceptance, commit, push or merge is claimed.

## Scope and behavior

The issued order supersedes the old preparation-only storage hold for bounded synthetic lifecycle groundwork. Current working tree began clean after the router's main catch-up; no conflict markers or unresolved merge entries required repair. Read repository AGENTS, DEMO-S in BUILD_PLAN §10.4, the supplied SIMPLE_LOOP and on-disk SIMPLICITY_RULE, existing P1/P2 contracts, company/practice authority and callers/tests before implementation.

Implemented an additive 0313 migration, shared strict command schemas, repository and application composition class. Five chosen-scenario run attempts can be saved, resumed and reset; immutable lifecycle report snapshots can be written and read. Every scenario currently records a plain refusal, as executable J1–J5 bindings are not installed. Core correction; recovery execution/collection/refund; Final Check execution/attribution; meter profile execution/clock; trial execution/identity/clock still refuse. No domain journey or end figures are faked.

The existing MON-2A company authority is reused instead of treating a practice cookie as company permission. SQL checks persisted synthetic session and active membership on every call, before replay and after lock waits. Runs additionally bind exact creator membership and session digest; another session cannot resume/adopt them. New sign-in sessions must start new attempts. Database name is independently restricted to the synthetic database. Three new tables have tenant-qualified FKs and FORCE RLS; runtime has no direct table permissions. One metadata-only routine exposes five closed operations.

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

CI must run `test/small-builder-demo.integration.test.ts` and `test/small-builder-demo-upgrade.integration.test.ts` with maxWorkers=1. They cover fresh install, populated own-step upgrade and repeated runner; all-five persisted refusals; reload; replay and changed payload; same/different concurrent resets; stale/archive boundaries; immutable snapshots and exact run/snapshot binding; another company and another session; session revocation including lock wait; raw SQL injection/privilege/RLS/pooled-context boundaries; unchanged job, trial-key, meter, subscription and journal history; and one audit event per original metadata command. They are written but NOT RUN locally: issued sandbox cannot start PostgreSQL or bind localhost. Browser suites are likewise left to CI; no browser behavior changes in this groundwork. Required complete CI and independent Claude RED review remain before merge.

## Initial source review

Found and fixed a trigger error before handoff: report/receipt immutability must branch before accessing run-only OLD/NEW fields. Guards now reject non-run updates immediately. No weakened tests or unrelated refactoring.

LATER / SIMPLICITY — `packages/db/migrations/0313_small_builder_demo_runs.sql`, `small_builder_demo_audit`: it follows the existing MON-2 SQL audit pattern. A future shared SQL audit-append helper could replace the duplicated canonical/hash assembly in MON-2 and DEMO-I, reducing future audit-format drift. That cross-piece refactor is outside this task and does not block.

## Handoff

Router commits/pushes/opens PR and updates finish/work lists outside this sandbox. Lane file lists exactly this piece's changed paths (its own metadata file is implicitly permitted). Migration discovery needs no manual edit. No secret, operational alert, provider or release configuration added. Existing interfaces are preserved through the API contracts re-export; added interfaces are versioned. No data backfill; forward-fix only, no destructive rollback. This remains RED for tenant/session isolation and hidden-data boundaries; product/journey acceptance is not asserted.
