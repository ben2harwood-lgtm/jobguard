# SV5-GUARD — builder receipt, C248, 24 October 2026

Working-tree construction on accepted SV-5 #181 head `5da4b0b97ee277d894cda888eee51e94a5cb2011`. Branch already present: `codex/sandbox/sv5-guard`. No Git writes, commit, push, PR, merge, release, independent verdict or acceptance. The dispatcher owns commit/push; reviewer/CI owns real PostgreSQL execution. No dependency install or download command was run.

Migration `0212_post_lock_upload_guard.sql` adds only `app.guard_post_lock_upload_transition()` and `app.evidence_upload.b_final_check_upload_transition`. The trigger runs after 0204's tenant/identity checks and job SHARE lock, so the existing serialization with lock/freeze remains intact. For a pre-cutoff nonverified upload, a state change after lock can only target rejected (`FINAL_CHECK_UPLOAD_TRANSITION_LOCKED`, SQLSTATE 55000 otherwise). C238 remains in 0204 and forbids verified-source transitions. Post-cutoff rows and same-state updates retain prior guards. No manifest/freeze changes, new grants, UI or HTTP changes.

The private function uses the existing migration/superuser setup exception, scopes context and the lock lookup to the row tenant/job, restores prior context and has fixed search_path. No new audit mechanism: allowed rejection becomes an immutable exclusion, with its reason, in the existing `final_check.sources_excluded` audit at manifest freeze. This is a freeze-time exclusion audit, not a claim that raw UPDATE itself appends an audit event. No new operational alert; the new database error identifies a refused state change.

LP-0 gains exactly one recorded private routine and trigger. Tenancy asserts exact owner, SECURITY DEFINER, fixed path, runtime/shadow denial and enabled trigger definition. The serious-b5 upgrade comparison gains a named 0212 step asserting exact signature, owner-only execute ACL and trigger, retaining every predecessor row, relation, policy and routine expectation. The new LP-0 definition digest is source-derived using the PostgreSQL canonical wrapper; it has not been read from a live catalogue here.

No backfill. Migration note documents forward-fix preference and that dropping the guard reopens C248. This leaf does not repair an already frozen unprocessable source or rewrite an existing manifest. Affected invariants: AGENTS 5.1 tenant isolation, 5.4 serialization, 5.7 exclusion audit, 5.8 finalized evidence, 5.14 immutable lock; C238/C244 remain enforced.

## Authored tests and without-0212 requirement

`post-lock-upload-guard.integration.test.ts` exercises real runtime-login UPDATEs after an actual lock and before manifest creation: expired pre-lock pending → quarantined and → verified both refuse with the new message/SQLSTATE; → rejected succeeds. Two SV-5 regressions retain expired-unswept or rejected exclusions, assert their immutable exclusion audit, reconcile to completed zero-result, and replay without another exclusion audit. Other tests prevent rejected reactivation and retain unlocked-job/post-cutoff behavior, with foreign-tenant RLS denial.

A rollback-only negative control drops **only** 0212's new trigger, adopts the actual fixture runtime login role, and asserts that both reviewer transitions succeed; rollback restores the guard and its refusal is asserted again. The positive refusal tests are designed to fail without 0212 (the UPDATE would succeed); catalogue/upgrade assertions also require its exact objects. **Neither the DB tests nor their without-0212 failure have been executed here. Actual red/green proof is a reviewer/CI hold, not a builder-verified claim.** No PostgreSQL or browser suite was deliberately launched; the broad API source-unit selection encountered two existing database-labelled tests before their free-port setup could proceed.

## Local run receipt

Runtime: Node `v24.17.0`, pinned cached pnpm `10.28.1`. The default pnpm launcher stalled and was interrupted (exit 130); cached pnpm was then invoked through `/private/tmp/jg-sv5-guard-bin/pnpm`, placed first on PATH for all subsequent pnpm commands. No packages were installed. Load readings during checks remained below 20. Checks ran sequentially; Turbo used concurrency 1 and Vitest maxWorkers 2.

- `pnpm typecheck --concurrency=1`: PASS, 7 tasks (4 cached).
- `LANE_BASE_REF=origin/main pnpm lint --concurrency=1`: FAIL at lane boundary; core-purity passed, 7 existing computed-import notices. Full refusal list below. Root lint does not reach its later stages after that refusal.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: same inherited stack refusal. Lane remains narrow; shared register untouched.
- `pnpm turbo run lint --concurrency=1`: PASS, 7 package tasks (2 cached). `node tools/money-arithmetic-lint.mjs` and `node tools/commercial-boundary-lint.mjs`: PASS separately.
- Unit commands: each package in turn used `pnpm --filter @jobguard/<package> exec vitest run --maxWorkers=2 --exclude '**/*.integration.test.ts'`. API final run adds `src`; DB final run also excludes `**/dist/**`. Initial ai/db/api/web runs lacked dependency dist builds and failed resolution; after build, affected packages were rerun. One broad post-build API attempt picked up emitted dist tests and was interrupted; final API run follows the package's source selection.
- Core: PASS, 125 files / 2,965 tests. Config: PASS, 4 files / 41 tests. Storage: PASS, 1 file / 2 tests. AI after build: PASS, 15 files / 147 tests. Web after build: PASS, 41 files / 897 tests.
- API source run: 127 files passed, 10 failed; 2,099 tests passed, 133 failed, 23 skipped. Failures are unavailable listen sockets/ports; no assertion-error diagnostics. DB source run: 48 files / 430 tests passed; only `test/free-port.test.ts` failed (2 tests, `listen EPERM 127.0.0.1`). The earlier post-build DB run included emitted dist test copies (73 files passed / 646 assertions passed plus the same 2 failures); the final source run excludes those duplicates.
- `pnpm build --concurrency=1`: PASS, 7 tasks (4 cached), including Next production build. Turbo reported sandbox IO warnings; Next reported the existing multiple-lockfile workspace-root warning.
- `node --test tools/*.test.mjs`: PASS, 126 tests, including migration-order/merge-churn checks without PostgreSQL.
- `pnpm openapi:check`: blocked by tsx CLI IPC socket (`listen EPERM`); `node --import tsx src/generate-openapi.ts --check` from apps/api: PASS, same checker without CLI IPC.
- `git diff --check`: PASS during inspection; final handoff verification recorded below.

Logs are local under `/private/tmp/jg-sv5-guard-*.log`; these are builder logs, not CI or independent review evidence. No clean reinstall was attempted (dependencies preinstalled). No live provider or model run, eval, browser journey, migration execution or PostgreSQL guarantee is claimed. Existing mandatory DB suites remain mandatory in reviewer/CI.

## Lane scope

The lane allow list contains exactly these seven changed non-lane files; its own eighth changed file, `config/lanes/sv5-guard.json`, is implicitly authorized by the lane-file policy (that policy forbids putting lane-directory paths in allow):

- `packages/db/migrations/0212_post_lock_upload_guard.sql`
- `packages/db/migration-notes/0212_post_lock_upload_guard.md`
- `packages/db/test/post-lock-upload-guard.integration.test.ts`
- `packages/db/test/tenancy.integration.test.ts`
- `packages/db/test/serious-b5-upgrade.integration.test.ts`
- `docs/contracts/lp-0-effective-privileges-v1.json`
- `docs/verdicts/SV5-GUARD/BUILDER_RECEIPT.md`

Against `origin/main` (`89b7b3d2e55ed668cd09aac117d8055f4fb03b0c`), the lane checker includes the stacked SV-5/prerequisite diff. It refuses these 108 exact paths, which this leaf does not broaden its lane to claim:

```text
apps/api/openapi.json
apps/api/src/app.module.ts
apps/api/src/customer-invoice-sv5pre.filter.test.ts
apps/api/src/customer-invoice-sv5pre.filter.ts
apps/api/src/customer-invoice.application.ts
apps/api/src/customer-invoice.controller.ts
apps/api/src/final-account-lock.application.test.ts
apps/api/src/final-account-lock.application.ts
apps/api/src/final-account-lock.controller.ts
apps/api/src/final-check-task-executor.ts
apps/api/src/final-check.application.test.ts
apps/api/src/final-check.application.ts
apps/api/src/final-check.contracts.ts
apps/api/src/final-check.controller.test.ts
apps/api/src/final-check.controller.ts
apps/api/src/final-check.http.test.ts
apps/api/src/final-check.isolation.test.ts
apps/api/src/final-check.worker.test.ts
apps/api/src/final-check.worker.ts
apps/api/src/shadow-detection.worker.test.ts
apps/api/src/shadow-isolation.application.test.ts
apps/api/src/sv5pre-invoice.http.test.ts
apps/api/src/sv5pre-worker-execution.integration.test.ts
apps/api/src/sv5pre-worker-registration.test.ts
apps/api/src/worker-task-extensions.ts
apps/api/src/worker.ts
apps/web/app/api/jobs/[id]/customer-invoices/route.test.ts
apps/web/app/api/jobs/[id]/customer-invoices/route.ts
apps/web/e2e/M4-3-S.spec.ts
apps/web/e2e/M4-5-S.spec.ts
apps/web/e2e/SV-4.spec.ts
apps/web/e2e/UIWIRE-10.spec.ts
apps/web/e2e/UIWIRE-11.spec.ts
apps/web/e2e/UIWIRE-15.spec.ts
apps/web/e2e/VALUE-1.spec.ts
apps/web/e2e/helpers/customer-invoice-journey.ts
apps/web/e2e/helpers/recovery-allocation-journey.ts
apps/web/e2e/helpers/recovery-sources.ts
config/agent-lane-assignments.json
config/lanes/sv5-0205-renumber.json
config/lanes/sv5-181-green.json
config/lanes/sv5pre-0204-renumber.json
docs/contracts/final-account-lock-v1.md
docs/contracts/final-check-v1.md
docs/contracts/sv5pre-completion-v1.md
docs/ledger/SV5-0205-RENUMBER.md
docs/ledger/SV5PRE-0204-RENUMBER.md
docs/operations/final-check-recovery.md
docs/verdicts/SV-5/BUILDER_RECEIPT.md
docs/verdicts/SV5PRE/BUILDER_RECEIPT.md
docs/verdicts/SV5PRE/BUILDER_RECEIPT_13.md
docs/verdicts/SV5PRE/BUILDER_RECEIPT_r13.md
docs/verdicts/SV5PRE/BUILDER_RECEIPT_r14.md
packages/core/src/final-account-lock.ts
packages/core/src/final-check-completion.test.ts
packages/core/src/final-check-completion.ts
packages/core/src/final-check.test.ts
packages/core/src/final-check.ts
packages/core/src/index.ts
packages/core/src/watchdog.ts
packages/db/migration-notes/0204_final_check_prerequisites.md
packages/db/migration-notes/0205_final_check.md
packages/db/migrations/0204_final_check_prerequisites.sql
packages/db/migrations/0205_final_check.sql
packages/db/src/final-account-lock-repository.ts
packages/db/src/final-check-completion-repository.ts
packages/db/src/final-check-repository.ts
packages/db/src/final-check-source-reader.ts
packages/db/src/guarded-practice-invoice-repository.ts
packages/db/src/index.ts
packages/db/src/shadow-detection-repository.ts
packages/db/test/UIWIRE-10.integration.test.ts
packages/db/test/UIWIRE-11.integration.test.ts
packages/db/test/UIWIRE-12.integration.test.ts
packages/db/test/contractor-entitlement-upgrade.integration.test.ts
packages/db/test/final-account-lock-invoice.integration.test.ts
packages/db/test/final-account-lock.integration.test.ts
packages/db/test/final-check-access.integration.test.ts
packages/db/test/final-check-c239.test.ts
packages/db/test/final-check-catch.integration.test.ts
packages/db/test/final-check-disposition.integration.test.ts
packages/db/test/final-check-fixture.ts
packages/db/test/final-check-invoice.integration.test.ts
packages/db/test/final-check-manifest.integration.test.ts
packages/db/test/final-check-races.integration.test.ts
packages/db/test/final-check-upgrade.integration.test.ts
packages/db/test/final-check-worker-factory.ts
packages/db/test/final-check.integration.test.ts
packages/db/test/invoice-later.integration.test.ts
packages/db/test/migfix-5.integration.test.ts
packages/db/test/practice-facts.integration.test.ts
packages/db/test/practice-feed.integration.test.ts
packages/db/test/practice-invoice-audit.integration.test.ts
packages/db/test/recovery-allocation-races.integration.test.ts
packages/db/test/recovery-allocation-upgrade.integration.test.ts
packages/db/test/recovery-allocation.integration.test.ts
packages/db/test/recovery-case-terms-upgrade.integration.test.ts
packages/db/test/recovery-case-terms.integration.test.ts
packages/db/test/recovery-line-allocation.integration.test.ts
packages/db/test/serious-b5.integration.test.ts
packages/db/test/serious-b9.integration.test.ts
packages/db/test/sv5pre-completion-access.integration.test.ts
packages/db/test/sv5pre-completion-isolation.integration.test.ts
packages/db/test/sv5pre-completion.integration.test.ts
packages/db/test/sv5pre-fixtures.ts
packages/db/test/sv5pre-legacy-invoice.integration.test.ts
packages/db/test/sv5pre-session-invoice.integration.test.ts
packages/db/test/sv5pre-upgrade.integration.test.ts
```

## Reviewer handoff

Run the new guard suite and existing SV5PRE completion, SV-5 final-check, LP-0 grant/authority, tenancy and serious-b5 upgrade suites using real PostgreSQL and maxWorkers 2, then the remaining mandatory DB/migration suites. Execute the negative control and record real red/green evidence before acceptance. Preserve C238 and freeze checks. Full CI, socket-dependent tests, clean pinned-install evidence, exact-commit cross-model verdict and separate actor acceptance remain outstanding. Founder owns merge/push/release.

## Session record

Unknown fields are unknown; no runtime-model, token-usage, cache, session-continuity or acceptance claim is inferred.

```json
{
  "session_record_version": 1,
  "task_id": "SV5-GUARD C248, 24 October 2026",
  "project": "JobGuard",
  "role": "builder",
  "thread_id": "unknown",
  "surface": "unknown",
  "host": "unknown",
  "authorised_route_ref": "unknown",
  "repository": "ben2harwood-lgtm/jobguard",
  "integration_target": "SV-5 #181 accepted head 5da4b0b9",
  "integration_target_revision": "5da4b0b97ee277d894cda888eee51e94a5cb2011",
  "worktree": "/Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv5-guard",
  "branch": "codex/sandbox/sv5-guard",
  "starting_base_revision": "5da4b0b97ee277d894cda888eee51e94a5cb2011",
  "source_pin": "5da4b0b97ee277d894cda888eee51e94a5cb2011",
  "candidate_revision": "uncommitted working tree; dispatcher commits",
  "last_validated_revision": "uncommitted working tree; local non-DB checks only",
  "allowed_files_ref": "config/lanes/sv5-guard.json",
  "governing_contract_ref": "AGENTS.md; BUILD_PLAN.md SV-4/SV-5; C248 order; docs/contracts/final-check-v1.md; docs/contracts/sv5pre-completion-v1.md",
  "model_requested": "unknown",
  "effort_requested": "unknown",
  "model_runtime_confirmed": "unknown",
  "effort_runtime_confirmed": "unknown",
  "runtime_confirmation_ref": "unknown",
  "last_completed_turn": "unknown",
  "last_receipt_ref": "docs/verdicts/SV5-GUARD/BUILDER_RECEIPT.md",
  "state": "working-tree handoff; DB execution, independent verdict and acceptance pending",
  "resumed_from_thread_id": "unknown",
  "successor_reason": "unknown",
  "preflight_ref": "user C248 order and read-only repository inspection",
  "result_id": "unknown",
  "acknowledgement_ref": "unknown",
  "ci_evidence_ref": "unknown",
  "reviewer": "unknown",
  "review_evidence_ref": "unknown",
  "accepting_actor": "unknown",
  "acceptance_evidence_ref": "unknown",
  "outstanding_holds": "PostgreSQL regressions, actual without-0212 failure proof, migration/LP-0/tenancy/upgrade suites, socket-dependent tests, inherited stacked lane failures, exact-commit independent verdict, separate acceptance and founder merge/release",
  "builder_finished_at": "unknown",
  "coordinator_acknowledged_at": "unknown",
  "integrated_at": "unknown",
  "merged_revision": "unknown"
}
```

Usage source/turn ID, token counts and cache counters: unknown.

## Final deterministic handoff verification

- New suite collection: `pnpm --filter @jobguard/db exec vitest list test/post-lock-upload-guard.integration.test.ts --maxWorkers=2` PASS, six cases collected; this imports/collects tests but executes no PostgreSQL setup or assertion.
- Read-only own-diff check PASS: exactly eight authored paths match the seven explicit allow entries plus the implicitly authorized own lane file. Every path passes the existing `lanePathAllowed` function. This is an own-diff scope check, not a replacement pass for the failing full stacked lane command.
- Byte comparison to HEAD PASS for shared `config/agent-lane-assignments.json`, 0204 and 0205. `migrationOrderViolations` PASS for new 0212 against origin/main. No freeze code changed.
- `git diff --check` PASS. Intended conventional commit subject/body written to `/private/tmp/jg-msg-sv5-guard.txt`; dispatcher commits after exit.
- Migration SQL SHA-256: `aab96bdc85638ad90169b993be3c9daa046e760cc007a653ddfde2d9a3326a08`.

Construction and available checks are complete. This receipt is builder evidence only; technical acceptance remains held for reviewer/CI PostgreSQL execution, negative-control proof and an independent recorded verdict bound to the eventual commit.
