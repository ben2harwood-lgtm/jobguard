# SERIOUS-B4 builder receipt — 16 October 2026

**Builder evidence only; not an independent verdict or technical acceptance.** Branch `codex/sandbox/serious-b4`; supplied HEAD and `origin/main` both `0bbb5ddbd074b791ece740a1861a6b7cc2fd6577`. Initial tree was clean. Dispatcher creates the commit; no Git-writing command was run. Check lane RED (money/access/data).

Scope is only **Batch 4, S12–S14** from the external `NIGHT-AUDIT-TRIAGE-SERIOUS-2026-10-16.md`. Read AGENTS.md, applicable BUILD_PLAN C1–C8, CH-2, M0-11/M1-10/UIWIRE-7 mappings, existing proof/evidence boundaries and the source aliases below. No other batch implemented. No dropped or stopped item; all three reproduced at the service/adapter level. Physical database behavior remains unverified locally.

## Reproduce first, then fix

| Item and all source aliases | Before-fix execution | Smallest correction and coverage |
| --- | --- | --- |
| **S12** — dbsrc-05#1; mig-0000-0003#3; mig-0024-0027#5; mig-0054-0096#1 | `src/evidence-finalization-race.test.ts`: **2 failed, 1 passed**. A delayed read failure changed `verified` to `rejected`, and changed a newer quarantined version to `rejected`. Failures were the expected state assertions. | Guard rejection by pending/quarantined state and exact object version, including the orphan caller's observed version. Successful registrations and another version survive; the still-pending failed version is rejected. Real PostgreSQL races for both the same version and a different failed version are written in `serious-b4-evidence-proof.integration.test.ts`. |
| **S13** — api-proof#2; dbsrc-10#5; mig-0000-0003#5; mig-0012-0015#3; mig-0024-0027#6; mig-0054-0096#2 | `src/proof-replacement.test.ts`: **1 failed**, with `ProofCommandError: COMMAND_CONFLICT` at the permanent original stage receipt, as expected. This is an orchestration double, not proof of PostgreSQL constraints. | Append a completion naming its same-stage predecessor after invalidation; preserve roots, original IDs, request hashes and receipts. Stage and command locks serialize replacement and replay. Read the unsuperseded completion for the current/rework projection. Migration is needed to remove the old permanent uniqueness without changing history. PostgreSQL cases cover original/replacement replay, concurrent identical replacement, unchanged stage, refusal of a fresh replacement while proof is still valid, preserved reviews, resolved Decision, RLS and mutation refusals. |
| **S14** — api-proof#4; mig-0054-0096#3 | `src/proof/proof-adopted-original.test.ts`: **1 failed**, rejecting the owned adopted-job finalize with `PROOF_INVALID` because the synthetic original lookup used only the direct job digest. Recorded after rebuilding stale dependency artifacts. | Reuse `practiceOwnedJobsSql` for synthetic original reads. Replace the material-requirement guard body with the same recursive adoption ownership semantics and retain SKU/digest checks. The inbox repair already on main is untouched. `serious-b4-practice.integration.test.ts` binds fictional source parties and adopts through real application commands, then checks owner materials, stranger-job/SKU refusals, generated proof finalization, completion/invalidation/replacement on the same stage and reload. Material-trigger behavior is source-inspected and CI-only, not locally database-reproduced. |

Initial red commands (before their respective fixes):

```sh
pnpm --filter @jobguard/db exec vitest run src/evidence-finalization-race.test.ts src/proof-replacement.test.ts --maxWorkers=1
pnpm --filter @jobguard/api exec vitest run src/proof/proof-adopted-original.test.ts --maxWorkers=1
```

The first command exited 1 with three expected failures and one passing control. The final pre-fix API run exited 1 with the expected `PROOF_INVALID`. Raw evidence is `/private/tmp/jg-serious-b4-red-db.log` and `/private/tmp/jg-serious-b4-red-api-final.log`. Earlier API attempts used stale built core exports and failed in error mapping with a TypeError; those are not credited as reproduction evidence. A first dependency compile also caught an erroneous test-helper import outside rootDir; the new tests now use the existing context constructor without importing emitted test fixtures. No existing expected value was changed.

## Changes, invariants and compatibility

Migration `0171_evidence_proof_rework.sql` is above supplied main's highest migration, 0166. It adds a nullable predecessor field, a tenant/job/scope/stage-qualified FK, a self-link refusal, one-root and one-successor uniqueness. All earlier row fields remain unchanged; no backfill or historical receipt/hash rewrite. Existing owner, FORCE RLS, grants, evidence FKs and completion UPDATE/DELETE/TRUNCATE refusals remain. The material guard replacement adds no routine identity, ACL or security-definer capability. It retains legacy null-digest synthetic fixtures. The LP-0 inventory's historical function-body digest remains untouched: current tests explicitly record rather than compare those protection digests under the LP0-13/Q2 hold (`lp-0-authority-paths.integration.test.ts:196`). No pinned inventory, expectation, refusal, count, name, hash or fingerprint is edited.

Apply migration before the service. Old binaries can still create first completions; they cannot repair completed stages. Install failures roll back transactionally; after replacements exist, fix forward instead of deleting history or restoring the old unique stage constraint. See `packages/db/migration-notes/0171_evidence_proof_rework.md` and `docs/ledger/SERIOUS-B4.md`. Renumber again above main if needed before integration. No edits to `packages/db/src/migrate.ts` or MIGRATIONS.md.

Affected guarantees: AGENTS 5.1 tenant/session isolation, 5.4 durable command replay, 5.7 preserved audit references/history and 5.8 verified version-specific evidence; CH-2 live-only execution and the existing separate-upload-lock invalidation protocol are preserved. No commercial amount/rate, access-policy decision, AI prompt/model, external provider action, operational alert, spending or real data. Synthetic fixtures only. No new production capability or gate approval follows.

The sole existing test edit adds an empty-current-completion query handler to `packages/db/test/proof-invalidation.test.ts`; every existing assertion remains byte-for-byte unchanged. `apps/api/src/auth/context-boundary.test.ts`, pinned lists and the lane register are untouched. The version-2 lane file contains exact paths and lists neither itself nor the lane register.

## Commands actually run

Dependencies were supplied, not freshly installed. Runtime Node **24.17.0**; `.nvmrc` pins **24.15.0**; cached pnpm **10.28.1** via `/private/tmp/jg-migfix-2-bin/pnpm`. Successful final commands set `PATH=/private/tmp/jg-migfix-2-bin:$PATH npm_config_manage_package_manager_versions=false COREPACK_ENABLE_NETWORK=0`. No package install/download command was issued. An initial Turbo dependency build inherited the normal inner pnpm launcher, which attempted its automatic version/signature fetch and refused it; the cached offline launcher then completed. This launcher failure is not evidence of package tampering.

| Command | Actual result |
| --- | --- |
| `pnpm typecheck` | Final exit 0, 7 tasks successful, 2 cached. Earlier new-test import errors were corrected; no existing expectation changed. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1: core purity passes, then lane guard refuses a self-comparison because HEAD equals origin/main. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1, same self-comparison refusal. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Exit 1, same refusal. No alternate base or bypass used. Dispatcher must run against the committed diff. |
| `pnpm exec turbo run lint` | Exit 0, 7 tasks successful, 2 cached. Package checks only, not a substitute for the refused lane guard. |
| `node tools/money-arithmetic-lint.mjs` and `node tools/commercial-boundary-lint.mjs` | Both exit 0. |
| `pnpm build` | Exit 0, 7 tasks successful, 2 cached; production Next build completed. Turbo reported cache-write permission warnings. |
| `node --test tools/*.test.mjs` | Exit 0; 100 tests passed. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 0; core 94 files/2,601 tests; config 1/1; storage 1/2; AI 6/85. Fixture evaluations only, no live model call. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0; 39 files/844 tests. Unit tests, not browser/e2e. |
| `pnpm --filter @jobguard/db exec vitest run src --exclude 'test/**' --maxWorkers=1` | Final exit 0; 12 files/114 tests. Initial concurrent-load run had one existing operator-reachability test exceed 5 seconds; isolated rerun passed without timeout/assertion edits. |
| `pnpm --filter @jobguard/db exec vitest run src/evidence-finalization-race.test.ts src/proof-replacement.test.ts test/proof-invalidation.test.ts --maxWorkers=1` | Exit 0; 3 files/6 tests, including both existing invalidation regressions. |
| `pnpm --filter @jobguard/api exec vitest run src/proof --maxWorkers=1` | Final exit 0; 2 files/10 tests. An earlier changed query accidentally matched an existing broad fixture predicate; changing the query parameter placement fixed it without editing that fixture or its expectations. |
| API source unit subset, exclusions below | Final exit 0; 79 files/1,643 tests. Earlier attempt omitted the new practice-worker-switch HTTP suite from the listener exclusions: 79 files passed and 21 tests failed with listen EPERM. No database was started. |
| Three new PostgreSQL test files compiled with `tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --skipLibCheck --strict --esModuleInterop --exactOptionalPropertyTypes true` | Final exit 0. Compilation only; physical PostgreSQL assertions NOT RUN. |
| `pnpm openapi:check` | Exit 1 because the tsx CLI IPC listener is forbidden (EPERM). |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; the same source generator/snapshot check without the CLI listener. |
| `git diff --check` and supplemental uncommitted path/migration-order validation | Exit 0; supplemental validation does not replace the refused committed-range lane check. |

API source subset command is `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1` with `--exclude` for each of: `src/auth/sso/action-paths.test.ts`, `src/contractor/contractor-practice-session.http.test.ts`, `src/contractor/site-extra-pricing.http.test.ts`, `src/contractor/site-extra.http.test.ts`, `src/contractor/site-visit.http.test.ts`, `src/contractor/practice-worker-switch.http.test.ts`, `src/health.test.ts`, `src/shadow-isolation.application.test.ts`, `src/final-account-lock.isolation.test.ts`. Listener/database suites are excluded only in this local invocation, never disabled in configuration or waived for CI.

Raw final logs: `/private/tmp/jg-serious-b4-{typecheck-final,lint,lanes,boundary,package-lint,build,tools-tests,domain-tests,web-tests,db-source-tests-final,green-db,green-api,api-source-tests-final,integration-typecheck-final,openapi,openapi-direct,working-tree-lane}.log`. Logs remain local ephemeral evidence. Intended conventional commit message: `/private/tmp/jg-msg-serious-b4.txt`.

## Dispatcher and independent-checker holds

Do not infer a full `pnpm test` pass from source subsets. Full test, real PostgreSQL `pnpm test:db` / `pnpm test:migrations`, fresh install/populated upgrade, and browser/e2e were **NOT RUN** in this sandbox. Browser/e2e was explicitly prohibited. Required PostgreSQL cases for CI:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/serious-b4-evidence-proof.integration.test.ts test/serious-b4-practice.integration.test.ts test/serious-b4-upgrade.integration.test.ts test/evidence.integration.test.ts test/proof-replay.integration.test.ts test/proof-invalidation.integration.test.ts test/proof-application-records.integration.test.ts
```

Also run the full mandatory suites, lane check against the committed head, and existing catalogue/pinned regression suites. The upgrade proof installs all predecessors, populates a completion plus commercial/receipt/audit fixtures, compares named historical columns/full types and ACL/RLS, tests root/predecessor refusals, and applies later migrations twice. It is written and typechecked, not database-executed. No new professional/security/commercial approval is claimed. Independent exact-commit RED verdict, separate technical acceptance, push/merge and release remain with the dispatcher/checker/founder.
