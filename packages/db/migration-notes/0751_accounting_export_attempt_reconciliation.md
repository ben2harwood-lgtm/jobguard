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

The LP6D_BOUND prefix is copied byte-for-byte from the locally available
origin/codex/sandbox/lp-6d-remaining-routines-r4 at
930685efec8b8fb18e3f22f10a25c469a553451f, temporary migration
0740_lp6d_remaining_routines.sql. Integration must rebase on #776's eventual
0749 body and LP6D-LANDING-NOTES.md, retaining that prefix and the latest body.
No fetch, branch mutation or edits to LP-6d were performed. Both successor tests
pin this exact 0751 overload before generic LP-6d body handling; preserve that
precedence when resolving landing conflicts. No unrelated routine entries or
fingerprints changed.

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

Remaining gates: router commits/pushes NOPR build; integrate against actual LP-6d
0749 and landing notes; pinned-runtime current-main CI including fresh/upgrade,
proof-consumer, both successor tests, accounting-export suites and scratch
mutation; independent Claude RED review on the exact resulting head. No
production/provider/release gate is lifted.
