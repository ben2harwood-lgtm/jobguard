# M4-17-S — RED builder receipt

Built ahead on `codex/sandbox/m4-17-s-run`, base `codex/sandbox/m4-12-s-collect`; reserved migration 0492. Router owns commit/push/PR and the independent Claude review. This receipt is implementation evidence, not independent acceptance.

Implemented server-gathered immutable reconciliation snapshots, authenticated replay/read, exact-source review acknowledgement, checkpoint hash verification and paused checkpoint restoration. Reports label the customer, success-fee and subscription books separately, retain specific difference rows and do not mutate their sources. Workspace UI and route expose the run and review actions. No provider adapters or external actions exist in this change. The existing 0374 subscription issuer and every predecessor migration are unchanged. LP inventories and the tenancy/SERIOUS-B5/entitlement expectation sets are extended for exactly the installed objects.

The deliberately small design stores one canonical source snapshot, rather than a second writable balance ledger or adjustment executor. Reports and report hashes are rebuilt deterministically from the saved rows. The coarse source table fence is synthetic-only and deliberately makes no production throughput claim.

## Target journey remains incomplete upstream

Do not report the recovery-18800 acceptance figures as achieved. 0392's `success_fee_derivation.delta_pence >= 0` and 0393's negative-delta rejection prevent the compensating fee posting after the £3,000 receipt reversal. Required next step: an approved immutable compensating derivation/journal path preserving the latest source validation, approvals, lock order and audit, then the genuine two builder-opened withheld-payment-case chain. The existing accepted producer/attribution test fixture is a catch, not recovery-18800. This task does not replace that source policy or allocator.

When a current source fee is £32 but journals still total £282, reconciliation shows the real £282 and `FEE_COMPENSATION_REQUIRED`; it does not relabel £32 retained cash as £32 posted. £250 refunded and £288 yours before VAT/tax follow only after the real collection/reversal/refund chain and £32 posting exist. The reference-domain test uses explicit supplied history to test arithmetic; it is not proof that the DB can create that compensation. No direct end-state seed is claimed as a journey.

Checkpoint restore here verifies saved reconciliation rows and starts that run paused. A physical PostgreSQL checkpoint restore of this complete fresh journey, and an application-wide paused restored instance, remain unverified; they cannot be inferred from JSON round trips.

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
