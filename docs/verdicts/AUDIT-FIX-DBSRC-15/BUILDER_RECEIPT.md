# AUDIT-FIX-DBSRC-15 builder receipt

Status: **STOP / HOLD — no fixes applied, not ready for acceptance or merge.**
Check lane: **RED**, raised for roles/tenancy. The working-tree paths classify as AMBER/AMBER/GREEN using the coordinator's `lane-floor.py` matching rules; indirect effects require RED under the issued instruction.

Branch: `codex/sandbox/audit-fix-dbsrc-15`. Read-only `git rev-parse HEAD origin/main` returned `bd959b01e857de0ba7cbd3588bab84add7d0f493` for both. No Git-writing command, migration, grant, package installation, PostgreSQL start, browser start, real data or spending. No builder acceptance or independent model verdict is claimed.

Read: repository `AGENTS.md`; `BUILD_PLAN.md` §9.1.2–9.1.4 and ENT-2/ENT-3/ENT-4b; report `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-15.md`; coordinator lane-floor rules.

## Blocking findings

1. **REPRODUCED at repository control-flow level; STOP before fix.** Added `packages/db/test/audit-dbsrc-15.test.ts`, “SoR listing refuses client approvers outside approval packs”. A synthetic recording PostgreSQL adapter supplies an active client approver with A's unrestricted contract-read permission and distinct A/B schedules. The actual `SorRepository.list` resolves with both schedules instead of rejecting with `NOT_FOUND`. This is an adapter/unit reproduction, not real PostgreSQL/RLS verification. The report's real A/B grant-and-schedule database regression still requires the dispatcher.

   The first run failed for the wrong reason (`TypeError: Right-hand side of instanceof is not an object`): the pre-existing built core output was stale. Built the existing core package without changing source, then reran. The second run failed for the **expected reason**: `promise resolved ... instead of rejecting`, with both `Fictional client A` and `Fictional client B` in the returned versions. The new test deliberately remains red because the issued STOP rule prevents completing this fix while preserving the existing expectation below.

   **STOP location:** `packages/db/test/contractor.integration.test.ts:422`. The actor at line 389 is a client-scoped approver without a contract restriction; the expected expression invokes the existing pure permission rule on client A and yields true. The new reproduction also asserts that premise before its failing repository call.

   **Before (existing line, unchanged):**

   ```ts
   expect(await outcome(()=>rates.list(actor)),`${label}: price-list read`).toBe(may('contract.read',tenantTarget)||may('contract.read',clientTargets.A)||may('contract.read',clientTargets.B));
   ```

   **After (would be required for this expectation; NOT applied):**

   ```ts
   expect(await outcome(()=>rates.list(actor)),`${label}: price-list read`).toBe(label==='client_approver@client'?false:may('contract.read',tenantTarget)||may('contract.read',clientTargets.A)||may('contract.read',clientTargets.B));
   ```

   That changes an existing expected value from true to false for the client approver and is forbidden by the issued instruction. No premise-establishing setup was added to disguise this conflict, and no product fix was applied. Work stopped before altering this assertion. The protected `apps/api/src/auth/context-boundary.test.ts` and all its pinned lists are untouched.

2. **DROPPED — no failing deadlock reproduction executed before the required STOP; PostgreSQL is unavailable in this sandbox; no lock-order fix applied.**

## Report follow-ups

The report marks **0 LATER** findings. Its five test-strengthening suggestions are recorded only: contractor conformance listing contents; overlapping site-extra/order-revision race; actual missing verified-domain SSO refusal; forced repository audit-append rollback for SSO; 201 eligible jobs plus unauthorized predecessors for site-visit pagination. No existing test was edited for these suggestions.

## Changes and invariants

Only the new regression, this receipt and one compact exact-path lane row are changed. The lane registry is shared and must serialize with coordinator edits. Before: `audit-fix-dbsrc-15` absent. After: one new row allows exactly `config/agent-lane-assignments.json`, `packages/db/test/audit-dbsrc-15.test.ts`, and this receipt. All other lane rows are unchanged. No catalogue, refusal, count, expected value, pinned name or fingerprint was changed. No premise setup before an existing call was changed. Standard F is inapplicable: no database grant or controlled writer was introduced.

Affected invariants: §5.1 scoped contractor reads; §5.4 lock order (unfixed report); §5.13 independent recorded verdict remains outstanding. No production behavior, backwards-compatibility impact, data migration or operational alert is introduced. Both reported production concerns remain unresolved by this packet.

## Checks

Runtime: Node `v24.17.0`. Used the already cached exact pnpm `10.28.1` through a temporary `/private/tmp/jg-audit-dbsrc-15-bin/pnpm` launcher. No install/download command was run. The default installed pnpm version command stalled in version switching and was cancelled; all task checks use the cached pinned executable. `LANE_BASE_REF=origin/main` was set for checks.

- `pnpm --filter @jobguard/core build`: PASS, dependency rebuild for the regression.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-dbsrc-15.test.ts`: FAIL before fix, 1 failed, expected refusal vs successful A/B listing after rebuilding core.
- `pnpm lint:lanes`: FAIL, `Missing branch or self-comparison range; refusing a misleading pass.` HEAD equals origin/main and this task cannot create a commit. The separate read-only working-tree check used the unchanged exported `selectLane`/`matches` functions against `git diff --name-only -z origin/main` plus untracked files: exactly the three allowed paths, no forbidden paths. This is supplemental deterministic evidence, not a passing committed-range lane check.
- `pnpm lint`: FAIL at the same lane self-comparison guard, before package lint.
- `pnpm openapi:check`: sandbox-blocked by tsx CLI's IPC pipe `listen EPERM`; `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check`: PASS, same checker without the IPC CLI.
- Safe tool tests: `node --test tools/policy-gate-sites.test.mjs tools/dependency-audit.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/core-purity.test.mjs tools/shared-money-origin.test.mjs tools/commercial-boundary.test.mjs`: PASS, 19 tests. Lane test fixtures were excluded because they run Git-writing commands.

- Individual `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, and `node tools/commercial-boundary-lint.mjs`: PASS. Root lint still fails the required lane guard.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts'`: FAIL, 254 passed / 3 failed. One failure is the new expected regression. The other two are unchanged source/dist audit-checkpoint-handoff scan tests timing out at the existing 5000 ms threshold. No expected value or timeout was changed.
- `pnpm --filter @jobguard/api exec vitest run src --exclude '**/health.test.ts' --exclude '**/shadow-isolation.application.test.ts' --exclude '**/*.http.test.ts' --exclude '**/action-paths.test.ts'`: FAIL, 1550 passed / 7 failed / 1 skipped. Six files have seven unit timeouts (including the protected auth context test, which was not edited); the final-account-lock isolation suite also fails setup because it cannot find a permitted port. That database suite is embedded in a unit-named file; no PostgreSQL process started. Full API verification remains incomplete. A focused six-file unit rerun with `--maxWorkers=1` was attempted, excluding that database suite.
- `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage --filter @jobguard/web test`: CANCELLED (exit 130) after discovering default collection also includes built dist tests and concurrent tests timed out. Repeated source-only tests with `--maxWorkers=1`; initial interrupted output is not a pass.

- `pnpm typecheck`: PASS, 7/7 tasks (4 cached), 5m25s. Turbo reported sandbox cache-write warnings; the check itself completed successfully.
- `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1`: PASS, 33 files / 784 tests.

- `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage exec vitest run src --maxWorkers=1`: FAIL. Core: 2442 passed / 3 failed, all existing 5000 ms timeouts (two receipt-allocation cases and one enterprise-domain structural scan). Config: 1 passed. Storage: 2 passed. The dependency-ordered run stopped before AI, so AI was run separately. No existing tests were modified.
- Focused API rerun: `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/recovery-follow-up.controller.test.ts src/recovery-message.controller.test.ts src/shadow-detection.worker.test.ts src/watchdog-registry.test.ts src/auth/context-boundary.test.ts src/auth/identity.test.ts`: PASS, 6 files / 312 tests, including the unchanged protected auth context test.
- Full root `pnpm test` was not run: it starts PostgreSQL suites and Git-writing tool fixtures; the permitted unit subsets and safe tool tests above were run instead. Full tests remain a dispatcher gate.

- `pnpm --filter @jobguard/ai exec vitest run src --maxWorkers=1`: PASS, 5 files / 80 synthetic unit tests; no live model integration is claimed.
- `git diff --check`: PASS. Read-only comparison confirms every other lane row and the entire protected auth test equal HEAD exactly.

- `pnpm build`: PASS, 7/7 tasks (4 cached), 8m13s. Existing CSS/autoprefixer and inferred-workspace-root warnings, plus sandbox cache-write warnings; no warning was fixed or suppressed.

Final result: STOP / HOLD. Typecheck, build, OpenAPI via the same Node-loaded checker, safe tool tests, web units and focused API rechecks passed. The new regression remains failing; core/DB scan timeouts and unavailable database/browser suites remain disclosed. No source fix is claimed, and the unsafe existing expectation requires issuer resolution before this can become an accepted fix. Logs are under `/private/tmp/jg-audit-dbsrc-15-*.log` (local artifacts, not independent verification).

## Dispatcher checks and holds

On the Mac or GitHub CI, after resolving the STOP with the issuer, the dispatcher must run the real PostgreSQL A/B listing regression and the report's two-connection concurrent order-revision regression (both free-text and priced logs), then `pnpm test:db`, `pnpm test:migrations`, full `pnpm test`, and `pnpm test:e2e`. Include unchanged `packages/db/test/contractor.integration.test.ts` and `packages/db/test/site-extra-pricing.integration.test.ts`; the report's deadlock test is not implemented in this stopped packet. The new unit regression is red by design until the authorized fix is supplied. Repeat `LANE_BASE_REF=origin/main pnpm lint`, `pnpm lint:lanes`, typecheck, build and OpenAPI check against an actual dispatcher-created commit. Independent RED model verdict bound to that exact commit and separate acceptance remain outstanding. No migration strategy is needed because no migration exists.
