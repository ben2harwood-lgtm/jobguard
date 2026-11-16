# 0754 — attempted subscription result reconciliation

LATER-SAFETY-158; RED (subscription money-result authority). MON-2A only, fictional synthetic simulations. MON-2B, provider evidence and G4-S remain closed. This closes only recovery of an already-attempted simulation, not the never-attempted expired-approval case or all of audit J06 L2 / MON-2.

## Change and invariants

Replaces only `app.mon2_command(uuid,text,uuid,jsonb)`, from LS-162’s effective 0752 body. The sole body delta is the authorization guard for `reconcile_simulation`: require an existing durable attempt and verify the original exact authorization against the immutable work's agreement revision, Decision and approved resolution, original actor's current owner membership, statement subject, action, amount, GBP currency, hash and policy. Natural authorization expiry and a newer agreement revision are allowed only here. Explicit authorization revocation, original approver revocation/expiry/demotion (including contractor revocation), current actor/session/tenant checks, current expected revision, owner-before-receipt replay, MON-3 billing validation, result finality and unknown-outcome rules remain enforced. Execute and record use their unchanged predicate. No attempt, approval renewal, agreement or statement rewrite, provider execution or financial posting is added.

`CREATE OR REPLACE` retains the signature, owner, SECURITY DEFINER, search path and grants. The migration has BEGIN/COMMIT and no table/data/ACL changes. No historical migration is edited. Both MIGFIX-7 and plan-entitlement successor-body expectations advance to 0754 and retain the LS-149 predecessor reference. 0749 does not replace this routine. Depends on PR #811 (LS-162) landing first: 0754 preserves its `SUBSCRIPTION_PENDING_CHANGE` refusal verbatim.

The exact historical checks are local to the reconciliation branch because expiry must remain enforced everywhere else. They deliberately duplicate the relevant owner/resolution checks rather than relax `mon2_authorized` globally or add a second public authorization API.

## Preflight and compatibility

Clean starting worktree: `codex/sandbox/later-safety-158`, HEAD `8e5e90c3f994e722779e3bc23950da7358a3436f`. Supplied base `f4016e96798c5c18b23a0d5ba2d1bf431500d963` is its immediate parent. The intervening LS-159 merge changes only web/admin files and its lane; affected SQL, executor and helpers are unchanged. No git writes, fetch, database/browser execution, PR or CI launch by this builder.

Read current repository AGENTS, MON-2, SIMPLE_LOOP and the external simplicity rule. The requested repository-local CODEX_SESSION_POLICY path is absent; the existing policy was read at `/Users/benharwood/Claude/Projects/Next Gen Learning Platform/docs/workflow/CODEX_SESSION_POLICY.md`.

## Authored coverage (not database execution evidence)

`subscription-attempt-reconciliation.integration.test.ts` contains a pure exact-body delta test and 46 PostgreSQL cases. These cover lost and unknown results after expiry, revision change and both; the real `SubscriptionExecutor.reconcile` with execute forbidden; in-flight expiry after durable execution; unchanged work/agreement/authorization/statement/source bytes and current result envelope; stale revisions and fresh execution refusal; missing attempts; current/original authority and binding refusals; exact identity/hash/amount/action/policy checks; currency constraints; redirect/finality, result conflicts, replay and concurrent terminal effects; populated predecessor upgrade and metadata preservation. Three restored scratch mutations remove only this exception and demonstrate predecessor refusal for expiry/revision/both, followed by successful executor reconciliation after restoration. The mutation cases are authored, not executed locally.

## Validation and handoff

Actual local results (Node 24.17.0, cached pnpm 10.28.1, installed Vitest 4.1.12):

- `PATH=/tmp/jg-pnpm-10.28.1-bin:$PATH node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs typecheck`: all seven workspace tasks pass.
- `node node_modules/typescript/bin/tsc -p /tmp/later-safety-158-tests-tsconfig.json`: passes, including the new test and its imports with workspace packages resolved to source; `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit` also passes.
- Installed Vitest, `--maxWorkers=1`, selecting only the new pure exact-body test: one passes; 45 database cases intentionally unexecuted under that name filter. No PostgreSQL hooks run.
- Installed Vitest, `--maxWorkers=1`, `test/migration-proof-loader.test.ts test/upgrade-proof-utils.test.ts`: 81 pass.
- PL/pgSQL CASE-in-IF lint passes over all 415 discovered migrations; `git diff --check` and exact six-path lane verification pass.

The Vitest invocations use `/tmp/later-safety-158-vitest.config.mjs`, which imports the repository's existing config and adds source aliases for Core, Storage, Config and AI. Standard collection initially failed on missing workspace `dist` entry points, so no database tests or behavior were mocked or bypassed; the temporary aliases allow the pure checks to collect against the existing sources without a build. No repository runner configuration changed.

PostgreSQL fresh/upgrade, both successor suites, subscription suites, full required current-main CI and independent exact-head RED review remain mandatory before landing. Database/browser execution is forbidden in this sandbox.

The proof fragment uses the existing metadata-only format (`lp0`, `upgrade`, `tenancy` all empty); no catalogue attributes, relations or grants change. No installed proof-generator executable or script was found in this checkout or the known tool locations. The fragment was serialized locally in that existing format and passes the installed proof-loader unit suite; router must run its installed generator and compare the fragment before landing. This is not claimed as generator-produced catalogue evidence.

`.nvmrc` pins Node 24.15.0; this sandbox exposes Node 24.17.0 and a Codex runtime at 24.22.1, with no installed 24.15.0 found. Checks use the existing Node 24.17.0 and cached pnpm 10.28.1; pinned-runtime CI is still required. Initial plain pnpm/typecheck attempts reached the host's package-manager auto-switch and failed its registry-signature/network verification; no setting or security check was changed. Subsequent commands use the already-installed exact pnpm directly, with its existing wrapper in PATH for child commands.

## Deployment and recovery

Apply once in the router's fixed reserved migration order; repeat migration discovery is idempotent. No backfill is needed. Upgrade tests compare populated rows and routine metadata. If reversal is required, use a reviewed forward migration restoring the prior guard, never modify 0754 or any historical migration. That rollback intentionally restores the result-recovery limitation; no results or audit history should be removed.

## R2 — preserve LS-162 before landing (16 November 2026)

Starting head `6d2993207`. The sandbox forbids git writes, including fetch, so the source is the existing `origin/codex/sandbox/later-safety-162` ref at `5f84ae5451b5da6d2fbdd273499181b60d42eb91`, read with `git show`. Reconstructed 0754 directly from its `0752_subscription_pending_downgrade.sql`, reapplying only LS-158’s reconciliation exception. Both successor lists still name 0754 as latest, now documenting the 0752 predecessor as well as 0746. The pure regression compares the entire body against 0752 after removing only the reconciliation exception. The new PostgreSQL regression creates a pending downgrade after the full migration chain, expects a fresh request to refuse with `SUBSCRIPTION_PENDING_CHANGE` / `23514` without new state, approval, receipt or audit effects, and verifies the original command still replays exactly. No other behavior changes.

0752 is not in this branch yet. For the local pure test only, its exact cached-ref bytes were temporarily placed at the expected migration path, then moved back to `/tmp`; no dependency migration is included in this repair. After #811 lands, the checked-in test reads that actual predecessor normally. The existing temporary Vitest config supplies source aliases; no PostgreSQL hooks run with the pure test name filter. PostgreSQL and browser suites were not run in this sandbox.

R2 local results: `git diff --check`, exact cached-0752 body comparison and existing-lane path verification passed. The installed Vitest command below passed **1 pure test**, with **46 PostgreSQL cases skipped**; the test-source TypeScript command passed. An initial attempt used the nonexistent root Vitest entry point and failed before collection; the corrected command uses the installed db package runner.

```sh
# From packages/db:
node node_modules/vitest/vitest.mjs run --config /tmp/later-safety-158-vitest.config.mjs --maxWorkers=1 test/subscription-attempt-reconciliation.integration.test.ts -t 'replaces only the attempted reconciliation guard'
# From repository root:
node node_modules/typescript/bin/tsc -p /tmp/later-safety-158-tests-tsconfig.json
```

Required PostgreSQL checks after integrating #811, with installed Vitest 4 and one worker (run from the repository root):

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/subscription-attempt-reconciliation.integration.test.ts test/subscription-pending-downgrade.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/subscription-statements.integration.test.ts test/subscription-upgrade.integration.test.ts test/subscription-internal-owner.integration.test.ts
pnpm test:migrations
```

Full required CI, the router’s proof-generator comparison and an independent exact-head RED review remain required. PR #811 must land first. No commit, push, PR, database, browser or provider action was performed here.
