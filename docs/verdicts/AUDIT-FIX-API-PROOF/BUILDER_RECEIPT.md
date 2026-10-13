# AUDIT-FIX-API-PROOF builder receipt

Issued 13 October 2026 by dispatcher 4. Branch: `codex/sandbox/audit-fix-api-proof`. Issued base: `e4cb8437d044746300c377647f6061d06cd960cc` (`origin/main`). Status: **HOLD — STOP for a required migration; no implementation or acceptance claimed.** Review lane: **RED**, retained for indirect proof/Decision authorization effects; the new lane registration itself is additive.

Read `AGENTS.md`, `BUILD_PLAN.md` §§2.4, 5.3 and CH-2, and `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-proof.md`. This is source inspection, not reproduction, database verification or independent review.

## Blocking findings

- 1: DROPPED — no verified failing reproduction; the required two-connection PostgreSQL race cannot run in this sandbox.
- 2: DROPPED — no verified failing reproduction; its real-PostgreSQL replacement sequence cannot run in this sandbox.
- 3: DROPPED — no verified failing reproduction before the migration STOP; no retry/audit fix is claimed.

## Migration STOP (source inspection only)

Replacement proof on the original completed stage needs a migration to preserve the existing history. `packages/db/migrations/0015_proof_stage_gates.sql:5` makes `(tenant_id,job_id,scope_item_id,stage)` unique; lines 13–17 provide only `proof_rework_required` events, with no replacement-proof resolution record; lines 20–22 grant SELECT/INSERT and deny UPDATE/DELETE. `packages/db/src/proof-repository.ts:22–23` uses a stage-wide receipt key and inserts another completion; `apps/api/src/proof/proof.application.ts:4` keeps the original `electrical-stage`. An additive durable replacement/resolution record and its projection are needed. No existing key, name, expected value, constraint or grant was changed. No test was executed to reproduce this finding, and no fix was attempted. The dispatch instruction explicitly requires STOP when a migration is necessary; this section records that stop, not a reproduced or fixed finding.

## Later findings (receipt only)

- 4: Adopted-job inherited ownership can pass PracticeAccess but fail the synthetic storage check during proof finalization.
- 5: Nest does not translate the proof application's typed client errors to the Next transport's 400/422 responses.
- Report's five suggested test improvements remain unimplemented: real ownership/domain refusals; actual response-write rollback; concurrent real finalizers; persisted completion/review history; browser replacement/recovery after reload.

## Changes and preservation

Only this receipt and the task's one compact lane-registration line were added. Exact allow list: these two files. C1: no new workflow was built because implementation stopped. No code, test, migration, package, lockfile, OpenAPI, grant, real data or provider action changed. Standard F: no grant added or widened. No git write command was run. `apps/api/src/auth/context-boundary.test.ts` and its pinned lists are untouched; no existing expected value/refusal/count/pinned name/fingerprint changed. No new catalogue row or premise-establishing test setup was needed. The comma on the preceding lane line is JSON punctuation only; that lane's parsed value is unchanged.

## Local checks

Dependencies were supplied; no clean install or install/download command was run. Node observed: `v24.17.0`. The default `pnpm --version` wrapper stalled and was interrupted (exit 130); checks then used the already installed **pnpm 10.28.1** binary with its directory prepended to PATH. All pnpm checks used `LANE_BASE_REF=origin/main`. Full output is retained in `/private/tmp/jg-api-proof-*.log` for this dispatch session.

| Command actually run | Exit / observed result |
| --- | --- |
| `pnpm typecheck` | 0; all 7 workspace tasks successful (2 cached). |
| `pnpm lint` | 1; core purity passed, then lane lint refused because HEAD and origin/main are the same commit. Package lint was not reached by this command. |
| `pnpm lint:lanes` | 1; `Missing branch or self-comparison range; refusing a misleading pass.` No alternate base or checker weakening was used. Dispatcher must rerun after committing. |
| `pnpm exec turbo run lint` | 0; all 7 package lint tasks successful (2 cached). |
| `node tools/money-arithmetic-lint.mjs` and `node tools/commercial-boundary-lint.mjs` | 0 each. |
| `pnpm openapi:check` | 1; tsx CLI IPC pipe creation refused with `listen EPERM`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Initial exit 1 (DB dist entry not yet built); rerun after DB build exit 0. This runs the unchanged checker without the tsx CLI IPC server. |
| `pnpm build` | 0; all 7 workspace tasks successful (2 cached), including the production Next build. Existing workspace-root/autoprefixer and sandbox Turbo I/O warnings were observed. |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | 0; 19 tests passed. The two lane fixture suites were not run because they invoke writing git commands, including init/add/commit. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage test` | 1; config 2 tests and storage 4 tests passed; core discovered both source and generated dist tests (4824 passed, 6 failed). Failures included dist source-inspection tests and unchanged 5-second allocator timeouts. |
| `pnpm --filter @jobguard/core exec vitest run src` | 1; 2413 tests passed, 2 existing allocator tests timed out at their unchanged 5-second limit. |
| `pnpm --filter @jobguard/core exec vitest run src/receipt-allocation.test.ts --maxWorkers=1` | 0; all 34 tests passed, including both timed-out cases. No timeout or expected value was changed. |
| `pnpm --filter @jobguard/ai exec vitest run src` | 0; 80 tests passed; fixture tests only, no live model run. |
| API available-tests command below | Initial exit 1 (DB dist unavailable); after DB build exit 1: 59 files / 1388 tests passed, 1 existing test skipped; the additional `final-account-lock.isolation.test.ts` suite failed in its free-port probe before PostgreSQL startup (`no free port in 58400..58650`). This is not a failing reproduction of any audit finding. |
| `pnpm --filter @jobguard/web test` | Initial exit 1 (unbuilt DB/API exports); after API build exit 0: 33 files / 784 tests passed. |
| DB unit-only command below | Initial exit 1: 6 files passed, verifier CLI had missing built imports (13 failures); after DB build, `pnpm --filter @jobguard/db exec vitest run test/verify-audit-export-cli.test.ts` exited 0 with all 14 verifier tests passing. This is unit/CLI evidence, not PostgreSQL integration evidence. |
| `git diff --check` | 0. |

The initial API/web/OpenAPI checks were launched before the DB/API build finished; their module-resolution failures were corrected by waiting for those builds and rerunning the dependent checks. No source was changed to correct the check setup.

Exact API available-tests command (transport/server suites excluded because they require localhost; the indirectly imported database isolation suite was discovered by its refused port probe):

```sh
pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/recovery-message.controller.test.ts --exclude src/recovery-follow-up.controller.test.ts --exclude src/watchdog-registry.test.ts --exclude src/auth/sso/action-paths.test.ts --exclude src/contractor/site-visit.http.test.ts --exclude src/contractor/site-extra-pricing.http.test.ts --exclude src/contractor/site-extra.http.test.ts --exclude src/contractor/contractor-practice-session.http.test.ts
```

Exact DB unit-only command:

```sh
pnpm --filter @jobguard/db exec vitest run test/recovery-case-join.test.ts test/site-extra-evidence-compatibility.test.ts test/recovery-message-repository.test.ts test/recovery-case-outcome.test.ts test/verify-audit-export-cli.test.ts test/contractor-session-context.test.ts test/verify-evidence-pack-cli.test.ts
```

Deterministic inspection imported the dispatcher's `/Users/benharwood/.local/share/full-steam/lane-floor.py` matcher and applied its current map to the two working-tree paths: AMBER for the additive lane line, GREEN for this receipt; review raised to RED for the issued proof/Decision authorization scope. The normal commit-range command cannot describe uncommitted changes and is not claimed as a reviewed diff. A read-only comparison of parsed lane JSON against `git show origin/main:config/agent-lane-assignments.json` proved every previous lane unchanged and the new exact two-file allow list. A byte comparison against `git show origin/main:apps/api/src/auth/context-boundary.test.ts` proved the forbidden file unchanged. These are deterministic checks, not an independent model verdict.

`pnpm test` was not run: its tool suites write Git fixture repositories and its DB suites start PostgreSQL. No PostgreSQL/browser suite or clean pinned install was run. Build output and compiler warnings do not constitute acceptance of the blocked findings.

## Dispatcher / Mac / GitHub CI checks

No PostgreSQL or browser was started. The dispatcher must run real PostgreSQL reproduction tests for `completion cannot clear a concurrent evidence invalidation`, `replacement proof clears rework on the original stage`, and `invalidation retries preserve audit and command identity` before any corresponding fix is accepted. These named tests have not been added or run by this stopped task. Preserve and run `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, and `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop UIWIRE-7.spec.ts CH-2.spec.ts proof-capture.spec.ts` on the Mac or GitHub CI. Full pinned-install CI and an independent verdict bound to the dispatcher's eventual commit, followed by separate technical acceptance, remain gates. A migration needs a new issued scope before implementation resumes.
