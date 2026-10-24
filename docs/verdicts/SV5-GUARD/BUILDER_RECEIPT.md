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


## R2 — C249, 24 October 2026 (starting head 20893322)

This section supersedes the original receipt's construction description where amended below. Working-tree repair only; no Git writes, dependency downloads, push, independent verdict, acceptance or release. The dispatcher commits and pushes. The order reports both head-20893322 reviewers as REPAIR; their recorded files are not present under `jg-runs` in this worktree, so this is not a claim to have read their full responses.

- Cast `$3::varchar` in both transition queries, including CASE comparisons, removing the ambiguous varchar/text parameter inference (42P08).
- C241b first asserts an ordinary superuser quarantine transition is refused with `55000 / FINAL_CHECK_UPLOAD_TRANSITION_LOCKED`, then makes the artificial state change with `SET LOCAL session_replication_role = replica` inside only that fixture transaction. Frozen inventory, replay, manifest and completion assertions are unchanged. Its file is added to the lane allowlist.
- 0212 now refuses C248's nonverified state changes to any state except rejected, and C238's verified state changes, outside READ COMMITTED. The isolation predicate precedes the lock-row lookup so a fixed caller snapshot cannot hide the committed lock. The READ COMMITTED predicates and error codes remain intact. This intentionally also refuses those transitions in higher-isolation transactions before any lock exists; callers must use READ COMMITTED. Same-state updates and C248 terminal rejection retain existing behavior.
- 0212 re-creates `app.serialize_final_check_evidence()` with CREATE OR REPLACE, the same signature, owner, SECURITY DEFINER, search_path and private execute ACL. Source comparison PASS: its body differs from 0204 only by the added isolation predicate; 0204 is byte-identical to HEAD. No freeze, replay, completion, upload identity or evidence-object behavior changes.
- Four new DB cases pin a runtime REPEATABLE READ or SERIALIZABLE snapshot before an independent lock commits, then assert SQLSTATE 55000 and the guard-specific error for pending → quarantined and verified → rejected. Each rolls back the failed transaction and checks the original state persisted. Both guards are covered under both isolations.
- LP-0 hashes updated for both function bodies; tenancy and serious-b5 explicitly check both private migration-owned functions. Serious-b5 preserves the restated function's full existing catalogue metadata comparison. Definition hashes are source-derived with the PostgreSQL canonical wrapper, not read from a running database: C248 `d8e220b74f3a7aae60a9915dd8595565f864e4f9255db51ebab118260a9039f5`; C238 `0da97bfd5468bbf6a3d300bfa101e4498b0e203454ed3ba0824be69f64b7da9b`.

Affected invariants: tenant-scoped private guards, finalized evidence and immutable lock/cutoff (AGENTS §§5.1, 5.8, 5.14). No backfill or new grants, business actions or alerts. Production and independent exact-commit review/acceptance gates remain. Forward-fix migration 0212; dropping it reopens the races.

### R2 PostgreSQL red/green receipt — pending CI

Per the dispatcher's sandbox note, no PostgreSQL or browser suite was launched: this sandbox cannot bind localhost or start PostgreSQL. **With 0212: NOT RUN here. Without 0212: NOT RUN here.** No 6/6 or 10/10 DB pass or negative-control failure is claimed. CI/reviewer must run `pnpm --filter @jobguard/db exec vitest run test/post-lock-upload-guard.integration.test.ts test/final-check-manifest.integration.test.ts --maxWorkers=2` with 0212, and prove the refusal regressions fail when 0212 is omitted in a disposable database. The existing rollback-only negative control removes only C248's trigger and requires both formerly blocked transitions to succeed, then verifies rollback restores refusal. It is additional proof, not a substitute for the requested actual without-migration run. Migration, LP-0, tenancy, serious-b5 and browser mandatory checks remain due in GitHub CI after dispatcher push.

### R2 lane lint refusal list

`LANE_BASE_REF=origin/main pnpm lint --concurrency=1` and `LANE_BASE_REF=origin/main pnpm lint:lanes` both exit 1 on the inherited stacked diff. The lane remains narrow; no shared lane register changes. The current refusal list has 107 paths (the requested manifest test is now allowed):

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


### R2 executed local checks and handoff

Node `v24.17.0`, preinstalled cached pnpm `10.28.1` through the existing `/private/tmp/jg-sv5-guard-bin/pnpm` launcher; no install or download. Checks ran one at a time, Turbo concurrency 1 and all Vitest commands maxWorkers 2. The unit driver waited while one-minute load exceeded 20 (observed 20.22 and 20.66); build started at 19.08. Logs: `/private/tmp/jg-sv5-guard-r2-*.log` (local builder evidence only).

- `pnpm typecheck --concurrency=1`: PASS, 7 tasks / 4 cached.
- `LANE_BASE_REF=origin/main pnpm lint --concurrency=1`: FAIL on lane boundary; core-purity passes with the existing 7 computed-import notices. `LANE_BASE_REF=origin/main pnpm lint:lanes`: FAIL on the 107 paths listed above.
- `pnpm turbo run lint --concurrency=1`: PASS, 7 tasks / 2 cached. `node tools/money-arithmetic-lint.mjs` and `node tools/commercial-boundary-lint.mjs`: PASS individually. These do not replace the failing root lane check.
- `node --test tools/*.test.mjs`: PASS, 126 tests.
- Units ran sequentially per package with `pnpm --filter @jobguard/<package> exec vitest run --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/dist/**'`; API additionally selects `src`. Core PASS 125 files / 2,965 tests; config PASS 4 / 41; storage PASS 1 / 2; AI PASS 15 / 147; web PASS 41 / 897.
- DB unit selection: 48 files / 430 tests pass; `test/free-port.test.ts` fails its 2 socket tests with `listen EPERM 127.0.0.1` (exit 1). API source selection: 127 files pass, 10 fail; 2,099 tests pass, 133 fail, 23 skip (exit 1). Diagnostics are `listen EPERM 0.0.0.0`, no-free-port fixture setup, and follow-on null-port TypeErrors. The broad API selection imports two database-labelled `.test.ts` suites; their free-port setup fails before PostgreSQL can start. Full `pnpm test`, PostgreSQL assertions and browser suites are not claimed green.
- `pnpm build --concurrency=1`: PASS, 7 tasks / 4 cached; includes Next production build. Existing Turbo sandbox IO and Next multiple-lockfile workspace-root warnings remain.
- `pnpm openapi:check`: blocked (exit 1), tsx CLI IPC socket `listen EPERM`. `node --import tsx src/generate-openapi.ts --check` from `apps/api`: PASS (exit 0), same checker without CLI IPC.
- `pnpm --filter @jobguard/db exec vitest list test/post-lock-upload-guard.integration.test.ts --maxWorkers=2`: PASS, all 10 cases collected, including four C249 cases. Collection imports the suite but executes no DB setup/assertion.
- Source comparison: 0204 byte-identical to HEAD; restated C238 function differs only by CREATE OR REPLACE and its isolation predicate. Own-diff scope: all 8 authored paths match the explicit lane allowlist or its implicitly allowed lane file. Shared lane register, 0204 and 0205 remain untouched.
- `git diff --check`: PASS. SQL SHA-256 for 0212: `83b54322e623f6f48f5cf301d342bbd35630a087cacf5d2d45b178aa9cdf33f5`.
- Conventional commit subject/body written to `/private/tmp/jg-msg-sv5-guard.txt`. No git add, commit, checkout or other Git write. Dispatcher owns commit/push; exact candidate commit and independent verdict remain unknown until that handoff.

R2 implementation is ready for dispatcher commit and CI. Acceptance remains held for actual PostgreSQL with/without-0212 proof, mandatory DB/catalogue/migration/browser checks, a different model's recorded verdict bound to that commit, and separate actor acceptance. This is builder construction and deterministic local evidence only.

R3 (24 October 2026, H0 only, base ae1c4362): changed only the two upgrade assertions to pass before.routines/after.routines to restated; sequential checks with cached pnpm 10.28.1, Turbo concurrency 1 and Vitest --maxWorkers=2: pnpm typecheck, package lint, node --test tools/*.test.mjs, core/config/storage/ai/web units and pnpm build PASS (exit 0); LANE_BASE_REF=origin/main pnpm lint and pnpm lint:lanes FAIL on inherited stack boundaries (exit 1); DB units 429 pass/3 fail (two socket EPERM, one audit-checkpoint-handoff source-scan 5000ms timeout, also timed out on isolated rerun), API units 2099 pass/133 fail/23 skip (socket/port restrictions and follow-on errors), both exit 1; pnpm openapi:check blocked by tsx IPC EPERM (exit 1), same checker via node --import tsx src/generate-openapi.ts --check in apps/api PASS (exit 0); git diff --check PASS; exact commands/results and logs at /private/tmp/jg-sv5-guard-r3-{checks.py,results.jsonl,*.log}; no dependency install or Git writes, no migration/runtime changes, DB/browser execution deferred to dispatcher-pushed GitHub CI; intended commit subject/body at /private/tmp/jg-msg-sv5-guard.txt.
