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

## m4-withheld-source — RED source adapter, migration 0497

This built-ahead follow-up adds withheld-customer-payment sources to the existing statement loader. It starts from the latest 0490/0491/0492 routines and copies 0489's withheld-allocation validation, binding the result to the approved derivation's source hash. It retains the existing private routine identities/ACLs and tenant/job scope. The source fence now covers allocation/reversal, eligibility, terms, proof and payer writers before statement, collection and reconciliation audit writes. No new table, permission, provider or production capability is introduced. The two LP-0 recorded static-call lists are unioned with the newly used existing helpers; entitlement, SERIOUS-B5 and runtime privilege expectation sets have no new identities to add.

The strict download schema and source display distinguish a withheld allocation from a catch assessment. Reconciliation snapshots now include existing withheld case, reversal and exact receipt-line rows; historical snapshots without those optional fields retain their encoding. Immutable documents and financial history remain unchanged. Migration 0497 documents a later-routine forward-fix strategy, without backfill or financial deletion.

The existing PostgreSQL reconciliation test now executes real synthetic allocation, posting, statement, fake collection, customer reversal, allocator reversal, compensation, correction and fake refund commands. It asserts all five requested monetary results (£32 posted, £250 refunded, £288 yours before tax, zero differences, zero external actions), preserves the original download bytes, and checks replay/stale statements. Additional PG cases cover unsettled/unallocated payments, another job's payment, tenant/session refusal and invalidated proof. A predecessor upgrade test preserves genuine withheld allocations/postings and routine ACLs. These tests are authored, not locally executed. This monetary fixture is not evidence that the entire fresh DEMO-S capture/materials/pursuit/browser journey is complete.

Initial source review: LATER / SIMPLICITY — `packages/db/migrations/0489_success_fee_recovery_compensation.sql` and `0497_withheld_payment_statement_source.sql`: a later bounded task could extract their common withheld-allocation validator into one private helper, retaining the exact source hashes and fences. This would reduce future validation drift; it does not block this patch. The current migration avoids changing the established posting writer or adding another privileged routine contract.

Local validation (Node v24.17.0; installed repository runners; at most two workers):

- Core Vitest: `issued-simulation-fee-statement.test.ts` and `simulation-money-run.test.ts`: 17 passed.
- DB Vitest: `withheld-payment-statement-source-catalog.test.ts`, `simulation-money-run-catalog.test.ts`, `simulation-money-run-repository.test.ts`: 9 passed. These are static/unit checks, not PostgreSQL execution.
- TypeScript: core, DB and web `--noEmit` passed. Standard local core/storage/config TypeScript builds supplied workspace dependency artifacts.
- PL/pgSQL CASE-in-IF, core purity and money-arithmetic checks passed; `git diff --check` passed.
- The pnpm launcher stalled and was stopped; direct installed `.bin` runners were used. The first DB unit/static invocation could not resolve the unbuilt core package; it passed after the normal dependency builds. No packages were downloaded or test infrastructure relaxed.

PostgreSQL fresh/upgrade, full CI, browser suites and the independent Claude RED review remain required after router push. No database, browser, independent review, merge or release success is claimed. The router owns commit, push and the eventual PR after its base merges.

- Full `node tools/lint.mjs` was attempted: core purity passed, then lane checking refused inherited predecessor paths against current main. The lane lists only this piece's actual changed paths, and was not expanded to claim the unmerged base. The router must rerun the unchanged gate once the base merges. No full lint pass is claimed.
