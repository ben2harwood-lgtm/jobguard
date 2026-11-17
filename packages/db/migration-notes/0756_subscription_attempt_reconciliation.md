# 0756 — attempted subscription result reconciliation

LATER-SAFETY-158-CATCHUP; RED (subscription money-result authority). Catch-up of accepted head `78f7aeeaa5c4c9ebe9659c51c7fdcee13fdf3bfe`, synthetic MON-2A only. No provider, live-money or release capability is added.

## Change and invariants

Renumbers the unlanded LS-158 migration, note and metadata-only proof to `0756_subscription_attempt_reconciliation`. Main owns the connector-promotion migration at 0754 and LS-162’s pending-downgrade migration at 0755. The lane retains all old paths and adds the new paths for the rename.

Rebuilt `app.mon2_command(uuid,text,uuid,jsonb)` verbatim from main’s `0755_subscription_pending_downgrade.sql`, then reapplied only the already-accepted LS-158 reconciliation exception. The complete function definition is byte-identical to the accepted LS-158 definition. Against 0755, only the reconciliation authorization guard differs. Owner, SECURITY DEFINER, search path, signature and grants are preserved through CREATE OR REPLACE; no ACL or data changes occur. Both shared successor-list conflicts resolve to 0756 as the single latest source, preserving main’s other rows.

Reconciliation still requires a durable attempt and the original exact authorization, Decision/resolution, statement/hash/amount/currency/policy binding and current original-owner authority. Natural approval expiry and a newer agreement revision remain allowed only for reconciliation. Revocation, current actor/session/tenant checks, expected revision, owner-before-replay, unchanged execute/record guards and result finality remain enforced. LS-162’s pending-change refusal and exact command replay are retained verbatim. No additional complexity or unrelated refactor is introduced.

## Coverage and validation

The pure test compares the full new definition against 0755 after removing only LS-158’s reconciliation exception. Existing PostgreSQL coverage includes lost/unknown results, expiry/revision changes, authorization and tenant failures, replay/concurrency, immutable effects, populated predecessor upgrade and routine metadata. The pending-change regression also asserts that the installed function contains the 0756 reconciliation exception, then verifies `SUBSCRIPTION_PENDING_CHANGE` / `23514` without new state, approval, receipt or audit effects and verifies the original pending command still replays exactly. It therefore exercises LS-162 after the replacement.

Local checks use installed Node 24.17.0, Vitest 4.1.12 with one worker, and TypeScript 5.8.3. The existing temporary Vitest config imports the repository config and resolves workspace packages to source; no repository runner configuration changes. No database hooks execute under the pure-test name filter.

Commands run locally:

```sh
# From packages/db:
node node_modules/vitest/vitest.mjs run --config /tmp/later-safety-158-vitest.config.mjs --maxWorkers=1 test/subscription-attempt-reconciliation.integration.test.ts -t 'replaces only the attempted reconciliation guard'
node node_modules/vitest/vitest.mjs run --config /tmp/later-safety-158-vitest.config.mjs --maxWorkers=1 test/migration-proof-loader.test.ts test/upgrade-proof-utils.test.ts
# From repository root:
node node_modules/typescript/bin/tsc -p /tmp/later-safety-158-tests-tsconfig.json
node node_modules/typescript/bin/tsc -p /tmp/later-safety-158-catchup-tests-tsconfig.json
```

Results: **1 pure body-comparison test passed**, **46 database cases skipped**, **81 proof-loader/upgrade-helper tests passed**. Both TypeScript checks passed; the catch-up config includes the reconciliation test and both resolved successor-list files. Exact full-body comparison against accepted HEAD and reconciliation-only comparison against 0755 passed, as did proof-name binding, unique successor-row checks and `git diff --check`. PostgreSQL/browser execution is unavailable in this sandbox; these checks are not PostgreSQL execution evidence. No git writes, commit, push or CI launch are performed by this builder. Shared-list conflict markers are resolved in file contents; the router must stage them to clear the read-only index’s unmerged entries.

## Required PostgreSQL handoff

Run from the repository root in CI with installed dependencies (one worker; at most three named files per invocation):

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/subscription-attempt-reconciliation.integration.test.ts test/subscription-pending-downgrade.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/subscription-statements.integration.test.ts test/subscription-upgrade.integration.test.ts test/subscription-internal-owner.integration.test.ts
pnpm test:migrations
```

Full required current-main CI and independent exact-head RED review remain release/merge evidence. The renamed proof is the unchanged metadata-only fragment (`lp0`, `upgrade`, `tenancy` empty), not a new generated catalogue observation; retain the router’s proof-generator comparison before landing.

## Deployment and recovery

Apply after 0755 in migration order. No backfill is required. Repeat migration discovery remains idempotent. Use a reviewed forward migration to restore 0755’s prior reconciliation guard if required; never edit landed migration history or remove result/audit facts. That reversal restores the prior result-recovery limitation. MON-2B, provider evidence and G4-S remain closed.
