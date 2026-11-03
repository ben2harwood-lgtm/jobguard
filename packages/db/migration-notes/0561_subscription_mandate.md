# M4-13 dark subscription mandate persistence (`0561_subscription_mandate`)

Add tenant-scoped FORCE-RLS immutable terms and mandate lifecycle history. Runtime
has no direct table grants. Session-bound functions recheck active membership
under the existing tenant subscription lock (184); owner commands create exact
synthetic approvals and append receipt, history and audit in one transaction.
No locks are acquired after the audit head. Terms text and hashes are immutable;
approval actor, exact version/hash, Decision, command and server time survive
revocation. Revocation/cancellation record provider cancellation as **pending**;
no adapter runs. A cancellation after revocation remains a separate fact.

No backfill grants a mandate to existing subscription acceptances. No provider,
ledger, job, final account, shadow signal or customer data is touched. The notice
policy remains unapproved, so every replacement approval is refused with
MANDATE_NOTICE_REAUTHORISATION_REQUIRED; annual or changed schema terms fail
validation. This also prevents a worker from inventing a plan change.

`SubscriptionMandateRepository.mayInitiate` reloads the durable record and current
approval membership, uses database time, and returns specific refusal reasons.
It always returns mayInitiate=false, productionEnabled=false. A valid bounded
synthetic renewal can only be labelled eligibleForSimulation. Statement requests
require the later executor's exact locked approval/source/remaining-balance check
and are always refused here. This read reserves nothing: callers must recheck
and reserve atomically in MON-2B/M4-12; its result cannot authorise an external
executor. Current period totals are trusted server inputs, never HTTP inputs.
No public endpoint is introduced. Invalid SQL errors are mapped to fixed codes;
audit contains references/hashes, not terms text or personal information.

Forward fix only: preserve history and append a corrective migration. To disable,
revoke runtime EXECUTE on app.m413_command and app.m413_read. Never delete rows or
roll back approval facts. G4-S, D05/D09 v4 and all dependent commercial/security
approvals remain unresolved. No live path can be enabled by a flag.

Verification: focused deterministic adapter tests run locally; fresh PostgreSQL,
upgrade, real races, rollback and catalog tests are written for CI and cannot run
in this sandbox. No database guarantee is claimed from a fake.

Catch-up to incoming main `111865cf65f5e68a28ce1891bd52aad0ac7a0f10`:
keep main's exports alongside the mandate repository; retain the existing exact
agreement/revision/hash statement binding. The persistence and database gate now
use reserved stems `0561_subscription_mandate` and
`0562_subscription_mandate_db_gate`. Both tables are explicitly registered in the
migration proof's tenancy list, which supplies the exact RLS and owner lists in
`tenancy.integration.test.ts`; their policy records are included in the LP-0 proof.
The existing `mon2_audit` call uses main's LP-4 sealer and does not restore a legacy
audit writer or replace any main entitlement/command routine. No provider runs.

Local catch-up validation (3 Nov 2026; installed Node 24.17.0 and Vitest 4.1.12):
- `packages/core`: `node_modules/.bin/tsc -p tsconfig.json --noEmit` passed;
  `node_modules/.bin/vitest run --maxWorkers=1 src/subscription-agreement.test.ts src/subscription-pricing.test.ts`
  passed the one matching file (`subscription-agreement.test.ts`), 9 tests.
- `packages/db`: `node_modules/.bin/tsc -p tsconfig.json --noEmit` passed.
- `packages/db`: `node_modules/.bin/vitest run --maxWorkers=1 test/subscription-mandate.test.ts test/subscription-mandate-db-gate.test.ts test/migration-proof-loader.test.ts`
  passed 3 files, 87 tests, with the package's actual Vitest configuration.
- `packages/db`: `node_modules/.bin/vitest run --maxWorkers=1 test/lp4-writer-catchup.test.ts test/lp5b-main-writers.test.ts test/lp-0-catalog.test.ts`
  passed 3 files, 52 tests. At most two single-worker runs ran concurrently.
- `node tools/plpgsql-case-in-if-lint.mjs` passed, 217 migrations.
- `git diff --check MERGE_HEAD` passed; the existing lane validator's pure
  functions and an exact working-tree path comparison passed for all 16 paths.

These are deterministic checks, not independent review or PostgreSQL execution.
Fresh install, upgrade, catalog privileges/RLS, races, rollback, and cross-database
gate integration remain unproved in this sandbox. Database/browser/full CI and
independent RED review remain for the router. No git index, commit, push or PR
operation was performed; the router must stage the resolved export file and
renamed migrations when completing the pending merge.
