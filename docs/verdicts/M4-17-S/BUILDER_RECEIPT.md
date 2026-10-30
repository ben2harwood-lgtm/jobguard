# M4-17-S — RED builder receipt

Built ahead on `codex/sandbox/m4-17-s-run`, base `codex/sandbox/m4-12-s-collect`; reserved migration 0492. Router owns commit/push/PR and the independent Claude review. This receipt is implementation evidence, not independent acceptance.

Implemented server-gathered immutable reconciliation snapshots, authenticated replay/read, exact-source review acknowledgement, checkpoint hash verification and paused checkpoint restoration. Reports label the customer, success-fee and subscription books separately, retain specific difference rows and do not mutate their sources. Workspace UI and route expose the run and review actions. No provider adapters or external actions exist in this change. The existing 0374 subscription issuer and every predecessor migration are unchanged. LP inventories and the tenancy/SERIOUS-B5/entitlement expectation sets are extended for exactly the installed objects.

The deliberately small design stores one canonical source snapshot, rather than a second writable balance ledger or adjustment executor. Reports and report hashes are rebuilt deterministically from the saved rows. The coarse source table fence is synthetic-only and deliberately makes no production throughput claim.

## Target journey remains incomplete at the statement-source adapter

Repair 1 incorporates the coordinator's merged 0489 compensation and 0491 collection fixes. The original missing-compensation diagnosis is superseded: 0489 now posts linked negative journals. No routine is defined in more than one of 0489, 0490, 0491 and 0492. In particular, `write_success_fee_v3`, `check_success_fee_journal` and `check_success_fee_derivation` retain their latest 0489 definitions through 0492. No later stale body replaces them.

The remaining step is the current withheld-payment source adapter for 0490's `platform_fee_statement_sources`. That routine expects `assessmentId` catch sources, while the latest writer emits `recoveryAllocationId` withheld-payment sources. 0492 now names `withheld_payment_statement_source_adapter` as an explicit unavailable dependency before attempting the catch loader. It does not manufacture an assessment, reuse stale posted eligibility or invent collection/refund facts. The PostgreSQL regression drives the real recovery fixture through both allocations, reversal and approved compensation, asserts £32 posted and zero external actions, and asserts `Review needed` plus that exact remaining dependency. It does not assert £250 refunded, £288 or zero differences without their chain.

The recovery fixture uses genuine writers but includes prerequisite F5 activity; it is not the complete fresh £18,800 demo. The complete target journey, adapter integration and physical PostgreSQL restore remain unverified. Checkpoint restoration here verifies saved reconciliation rows and starts that run paused; it is not an application-wide payment kill switch.

## Repair 1 changes

Copied the exact `success_fee_tenant` policy line from 0491 into 0492. Scanned every dynamic SQL format string in 0492; the new static regression decodes those strings and checks the full policy expression, including the empty-string `nullif` arguments and quoted setting/type literals. No other malformed format-string quoting was found. No predecessor migration on main was edited.

The journal duplicate key now uses its validated `side`, with a test proving distinct debit/credit rows without optional account metadata are not classified as duplicates. LP-0 has no new routines, calls, writes or grants to union in this repair; both recorded inventories still match the actual migration scan. Existing policy metadata now describes the repaired identical predecessor policy.

## Validation

Local results (Node v24.17.0, installed dependencies; direct repository `.bin` runners after the pnpm launcher stalled and was stopped):

- `packages/core/node_modules/.bin/vitest run --maxWorkers=1 src/simulation-money-run.test.ts src/simulation-fee-collection.test.ts src/simulation-fee-statement.test.ts` from packages/core: 62 passed.
- `packages/db/node_modules/.bin/vitest run --maxWorkers=1 src/simulation-money-run-repository.test.ts test/simulation-money-run-catalog.test.ts test/lp-0-catalog.test.ts` from packages/db: 32 passed. These are unit/static checks, not PostgreSQL execution.
- `apps/api/node_modules/.bin/vitest run --maxWorkers=1 src/success-fee.application.test.ts` from apps/api: 19 passed.
- `apps/web/node_modules/.bin/vitest run --maxWorkers=1 'app/api/jobs/[id]/success-fees/money-check/route.test.ts' 'app/api/jobs/[id]/success-fees/collection/route.test.ts'` from apps/web: 5 passed.
- Root `./node_modules/.bin/tsc -p <package>/tsconfig.json --noEmit`: core, db, API and web passed. The standard TypeScript builds for core, storage, db, config, AI and API were also run to supply workspace import artifacts. Initial API/web/static test imports failed before those local artifacts existed, then passed after the normal builds; no aliases or checks were changed.
- `git diff --check`: passed. A read-only diff/untracked-path comparison verifies the lane lists exactly this change's paths (own lane implicitly owned).
- `node tools/lint.mjs`: core purity passed. Lane lint remains blocked against current main because this built-ahead branch carries the unmerged predecessor changes outside this piece's lane. The configured base is currently identical to HEAD, so forcing that comparison would be refused by the existing checker. The router must re-run the unchanged lane check after the base merges; the lane was not expanded to claim inherited changes. No full lint/CI success is claimed.

PostgreSQL, upgrade, tenant/catalog integration and browser suites are authored for GitHub CI because this sandbox cannot start PostgreSQL or bind localhost. The browser test is a transport/render test using synthetic responses, not a completed persisted recovery journey. New SQL integration tests exercise actual source collection, replay, cross-job/tenant access, audit rollback, stale restore/review, unknown collections, and incoming feed anomalies through the existing fake producer. A genuine predecessor upgrade test is included. No independent RED review has occurred.

No package downloads, git writes, live provider calls, real data or real money were used. No CI, database, browser, physical-restore or release pass is claimed.

## Repair 1 validation

- Installed core Vitest runner, `--maxWorkers=1 src/simulation-money-run.test.ts`: 10 passed.
- Installed DB Vitest runner, `--maxWorkers=1 test/simulation-money-run-catalog.test.ts src/simulation-money-run-repository.test.ts test/lp-0-catalog.test.ts`: 34 passed, including the quoting and migration-order regressions. These are static/unit checks, not PostgreSQL execution.
- `./node_modules/.bin/tsc -p packages/core/tsconfig.json`, `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`, and `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`: passed after the dependency-union narrowing fix. `git diff --check`: passed.
- PostgreSQL suites, including the added real compensation/incomplete-adapter regression, remain CI-only. No database, browser, complete target journey or renewed independent RED-review pass is claimed.
