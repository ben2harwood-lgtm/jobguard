LATER-SAFETY-157 (M5-1), RED — stranded accounting-export attempts

Recreates only app.accounting_export(uuid,text,text,text,jsonb). A current
same-tenant owner/admin may read and reconcile an existing persisted attempt
after its Decision expires or its original approver departs. The exception
requires the exact outbox attempt, tenant/source, immutable ledger/Decision
artifact, preview hash, company and reference. The existing inbox-only
reconciliation and audit retain the current actor and exact attempt. New claims,
approvals, unattempted reads, consent checks and all observation outcomes retain
their existing controls. No new send, attempt, money, settlement, role or grant
path is introduced; qualifyingRecoveryProof remains false.

R2 landing catch-up: rebuilt from the last CREATE OR REPLACE of
app.accounting_export in landed 0749_lp6d_remaining_routines.sql (LP-6d #776,
f4016e967), then reapplied only the reconciliation declaration, committed-attempt
exception and expiry exception. The reconstructed SQL is byte-identical to the
existing 0751: its preliminary LP6D prefix already matches the landed prefix.
The prescribed function-name comparison finds only app.accounting_export in
0751, also present in 0749; no other routine needs rebasing. A new LP6d source
regression asserts this exact replacement overload and byte-identical prefix.
Historical LP6d predecessor tests still correctly prove 0749 itself.

MIGFIX-7 already registers this exact overload at 0751 and checks it before
LP6d's generic handling. The plan-entitlement registration was accidentally
nested inside an unterminated 0749-only branch after the merge; R2 moves it
before that branch, restores the branch's closing/continue, and asserts unchanged
routine metadata as well as the exact 0751 body. Both pins now select 0751.
BEGIN/COMMIT, signature, SECURITY DEFINER and search_path=pg_catalog are
preserved. CREATE OR REPLACE preserves the existing owner and grants. No data
migration is needed. The proof uses the existing strict migration-proof format
with empty metadata/row/tenancy deltas, as the predecessor 0693 does. No catalogue
capture or proof-generator database execution was possible here. Roll forward
with a reviewed function replacement if needed; do not edit applied migrations.

Local evidence (installed Node 24.17.0; repository .nvmrc requests 24.15.0;
installed Vitest 4.1.12, --maxWorkers=1; no packages downloaded):
- node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit: PASS.
- Temporary TypeScript project extending repository tsconfig, including the new
  integration file and both successor integration files: PASS. This checks types,
  not PostgreSQL behavior.
- Existing runner/config: accounting-export-repository.test.ts: 6 PASS. The
  executor and proof-loader suites initially could not import @jobguard/core
  because dependency dist output is absent in this worktree.
- Temporary /tmp Vitest config preserving repository timeouts/setup and adding
  source aliases for core/storage/db/config: accounting-export-executor.test.ts
  and migration-proof-loader.test.ts: 88 PASS. No assertions were changed.
- LP-6d prefix byte comparison and git diff --check: PASS.

Authored, NOT executed: real-PostgreSQL expiry, successor owner/admin, immutable
Decision/actor/artifact/reference/money, audit attribution, active caller/session
and request-binding refusals, unattempted/new-claim refusals, consent/stale/source/
attempt/absent-observation refusals, paid/hash/reference/edit/duplicate/absence
outcomes, replay and restored scratch mutation. Existing unknown/race/route
suites were not executed locally. No PostgreSQL, browser, provider, real customer
data, PR, CI, git write, deployment or release ran here.

Remaining gates: router commits/pushes NOPR build; pinned-runtime current-main
CI including fresh/upgrade,
proof-consumer, both successor tests, accounting-export suites and scratch
mutation; independent Claude RED review on the exact resulting head. No
production/provider/release gate is lifted.

R2 local evidence (15 November 2026):
- Reconstructed 0751 from landed 0749 plus only the reconciliation delta: exact
  equality, including the unchanged LP6D prefix. No migration/proof change needed.
- node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit: PASS.
- Temporary TypeScript project including the reconciliation integration test
  and both successor integration tests: PASS after fixing the merged branch.
- Installed Vitest 4.1.12, --maxWorkers=1: lp6d-routines.test.ts,
  accounting-export-repository.test.ts, migration-proof-loader.test.ts: 120 PASS;
  accounting-export-executor.test.ts: 11 PASS.
- Standard config initially failed to resolve missing @jobguard/core build
  output (12 repository tests passed). Successful runs used temporary
  /tmp/later-safety-157-r2-vitest.config.ts extending the real repository config
  with core/storage source aliases; no setup, assertions or repo config changed.
- The expanded temporary type project initially exposed the missing closing
  branch, then existing LP6d JSON-import typing assumptions. Final project checks
  the three integration files; LP6d source assertions ran through real Vitest.
- git diff --check: PASS. No PG or browser was started; no packages downloaded.

Exact pending real-PostgreSQL commands (repository root, installed dependencies,
CI environment; at most three named files per run and one worker):

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/accounting-export-attempt-reconciliation.integration.test.ts test/accounting-export.integration.test.ts test/accounting-export-upgrade.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/accounting-export-route-change.integration.test.ts test/accounting-export-credit-invoice-route.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts test/lp6d-routines.integration.test.ts
pnpm test:migrations
```

These are pending commands, not PostgreSQL evidence. Required current-main CI
and independent RED review at the resulting exact head remain gates.
