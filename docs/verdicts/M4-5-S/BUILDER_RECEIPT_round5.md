# M4-5-S — builder receipt, round 5

7 October 2026. PR #106, branch `codex/sandbox/m4-5-s-r2`, worktree `m4-5-s-fresh`.
Starting HEAD: `381b5bb62703baba07ea01798bfa3827d607a5db`; integrated main: `3395d343fd50d979c734daf4946ba293ee2ed836`. Earlier work and both integration merges are preserved. This receipt covers uncommitted working-tree repairs; the dispatcher must bind CI and the independent verdict to the commit it creates. No commit, push, merge, PR mutation or acceptance was performed.

**Implementation repaired; technical acceptance remains on hold for exact-commit CI and independent review.** PostgreSQL and browser execution are intentionally left to CI under the supplied sandbox instruction. No live providers, spending, real sends, production mode or policy approvals were used.

## Repairs and regression evidence

### 1. SBOX-SESSION-1 ownership / C5

Every message read/list, draft, approval, advance, reconciliation and revocation now authorizes through `PracticeAccess.case` before parsing/reading business content or recognizing a replay. Tenant context and actor come from the authenticated session principal. Supplier evidence inspection/execution uses `practiceMaterialPool` with the authenticated digest, matching the integrated evidence-pack application. Missing/invented sessions fail with `PracticeAccessError(UNAUTHENTICATED)`; foreign/missing cases and foreign/nonexistent messages share `NOT_FOUND`.

Nest preserves practice errors for the existing `PracticeErrorsFilter`. Both Next routes use `practiceFailure`, including its no-store response, and await SBOX's asynchronous workspace factory. Existing command/domain error redaction remains. No shared authentication implementation or ownership migration was changed.

- Red before, green after: `SBOX recovery-message ownership for every action > <read/list|draft|approve|advance|reconcile|revoke> hides another session's case just like a missing case` and the six corresponding `refuses a missing session before any database access` tests. The recorded red run used the HEAD application with current built dependencies: 14 failed / 6 passed; the repaired application suite has 21 passes. These are service tests using the actual PracticeAccess/session functions with database boundary doubles, not PostgreSQL proof.
- The prior arbitrary-UUID success assertion now rejects an unissued token. The revoked/missing-owner assertion retains rejection and follows SBOX's 401 authentication semantics. No assertion was removed to conceal failure.
- Green: six controller `preserves the shared 401/404 filter` tests, and six `Next <action> maps practice failures through the real no-store adapter` tests loading the actual routes and actual `practiceFailure`. The Next tests were first red (6 failures) against routes that did not await the asynchronous factory.
- Green: `hides a nonexistent or foreign message behind the same practice NOT_FOUND`.
- Added browser regression: `a new practice session cannot see or act on another session's recovery messages`. It issues a NEW session, checks read/draft/all four commands against the first session's message, compares missing-case/message behavior, checks missing-session 401s, verifies the foreign page has no message body, and confirms the creator's persisted state is unchanged. Collected in both projects; execution pending CI. Every existing second context used for persistence/racing approval retains the creator's `storageState`; the new stranger context intentionally does not.

### 2. Opus P1-2: fifth retryable failure

Migration remains **0099_recovery_messages.sql**. Its only SQL change is the failed-history predicate: require `action_attempt.outcome='failed'` together with `action_outbox.status='dead_letter'`, matching merged OUTBOX-ADAPTER-1. The existing outbox-to-message mapping already maps dead_letter to failed; the existing display label is retained and tested.

- Source-inspected red cause: the previous predicate required `latest='dead_letter'`, which 0006's attempt CHECK forbids. No PostgreSQL red/green execution is claimed here.
- Added real-PostgreSQL regression: `records failed after five retryable adapter failures and keeps the message panel readable`. Five advances use the real merged ActionExecutor and deterministic practice adapter. Assertions cover all attempt outcomes, failed projection/history, dead-letter outbox, zero sink rows, a further advance returning `RECOVERY_MESSAGE_NOT_ADVANCEABLE`, unchanged writes and repeat reads. Collected; must run green in CI.
- Green web unit: `displays exhausted failure without offering another advance`, including “Delivery failed repeatedly — nothing sent”.
- Existing adversarial history guards, catalog/grant/RLS assertions and terminal-refusal assertions remain.

### 3. Opus P1-1 / P1-3: integrated-tree evidence

Verified the integrator's fixes: the register has 47 sorted migrations, 0099 last; UIWIRE-12 counts 47 over 0000..0099 and 47 overall; demo-bootstrap expects 47. Those assertions were preserved. A static register/range probe passed; that is not a live database catalog test.

The pre-existing PostgreSQL test `cancels an exhausted refusal, appends blocked history and releases a replacement preview` is retained unchanged. Its executor dependency now exists in the merged tree. The upgrade fixture still applies every registered migration preceding 0099; its comments/title now correctly identify the preceding schema as through 0094. Collected: 80 recovery-message integration tests, 3 upgrade tests and 9 repository unit tests. No suite/assertion is skipped or weakened. The 83 PostgreSQL tests require CI execution on the dispatcher's commit, together with UIWIRE-12, demo-bootstrap and all earlier mandatory suites.

### 4. Opus P3-1 / P3-2 / P3-3

**P3-1:** an identical blocked advance replay returns current state, including a later replacement, consistently with Ben's ruling. The first blocked attempt still returns its conflict; replay creates no additional effect.

- Red before / green after unit: `returns current state for a pre-start block without execution or writes` failed with `RECOVERY_MESSAGE_BLOCKED` against HEAD, then passed after repair. All 9 repository units pass.
- Added PostgreSQL test `replays a pre-start blocked advance as current state even after a replacement preview`: compares full current responses before/after replacement, unchanged write counts, payload conflict and zero attempts/sink. Collected; execution pending CI.

**P3-2:** the delivery picker shows the selected record's stored document number plus its identity. It no longer asserts fixture quantities. The supplier-documents projection previously omitted that column, so `packages/db/src/supplier-document-repository.ts` now selects `d.document_number`.

- Red before / green after: `offers the recorded fictional partial delivery as an explicit selection` initially failed to find `DN-FICTIONAL-42`, then passed. It also rejects the former fixed quantities.
- Lane exception: added ONLY the exact supplier-document-repository path to the compact m4-5-s line. The existing API projection needed this column; fabricating a delivery number in a lane-local UI would not satisfy the review. No other lane changed. This shared projection edit is serialized with the completed SBOX integration; no new supplier behavior was built.

**P3-3:** MIGRATIONS.md now places 0099 after 0053, 0054 and 0094, and documents exhausted failed history. Ordering source-inspected; no executable database claim applies to this documentation move.

### 5. Reverse command-ID exclusion: explicit follow-up

Not implemented, as instructed by Ben and the Opus lane ruling. Evidence-pack generation/attachment approval must separately claim shared command receipts and reject IDs already held by recovery/other command families, with receipt-before-case locking and sequential/concurrent PostgreSQL tests. Recorded in BUILD_PLAN §14.3. The already implemented recovery-side exclusion and its tests are preserved; evidence-pack-repository.ts is untouched.

### 6. OpenAPI and whole-tree checks

Regenerated apps/api/openapi.json from the merged controller registry, restoring the message endpoints while keeping main's other endpoints. Current-state replay summaries remain. Checks below are actual executions on this repair tree, not evidence for the old reviewed commit.

## Commands and exits

Node 24.17.0; pinned pnpm 10.28.1 from the already installed Corepack cache. `/private/tmp/jg-m45-bin/pnpm` invokes that cached version because the default user shim selects pnpm 11. No installation/download or lockfile change. Commands below used that directory at the front of PATH. Supplied dependencies were reused; no clean-install claim is made.

| Command | Exit | Evidence |
|---|---:|---|
| `pnpm turbo run build --filter=@jobguard/db...` | 0 | Built current core/db workspace exports before recorded red tests; 3 tasks |
| `node node_modules/vitest/vitest.mjs run src/recovery-message.application.test.ts` (apps/api; temporarily HEAD implementation, restored afterwards) | 1 | Recorded ownership red: 14 failed, 6 passed |
| `node node_modules/vitest/vitest.mjs run app/ui/recovery-messages.test.tsx` (apps/web; before picker fix) | 1 | Picker red: 1 failed, 5 passed |
| `node node_modules/vitest/vitest.mjs run test/recovery-message-repository.test.ts` (packages/db; temporarily HEAD implementation, restored afterwards) | 1 | Blocked replay red: 1 failed, 8 passed |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-message.controller.test.ts` (before asynchronous-route fix) | 1 | Next route red: 6 failed, 8 passed |
| `pnpm typecheck` (initial / final) | 2 / 0 | Initial caught asynchronous workspace integration defect; final 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` (initial / final) | 1 / 0 | Same initial defect; final lane, purity, money/commercial checks and 7/7 package tasks |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Passed twice; local branch comparison included working-tree changes, no self-comparison refusal |
| `pnpm build` | 0 | 7/7 tasks including production Next build |
| `pnpm --filter @jobguard/api openapi:generate` | 1 | tsx CLI's IPC listen forbidden by sandbox (EPERM) |
| `node --import tsx src/generate-openapi.ts` (apps/api) | 0 | Generated actual merged OpenAPI, no listener |
| `pnpm openapi:check` | 1 | Same tsx CLI IPC restriction; no stale-OpenAPI failure |
| `node --import tsx src/generate-openapi.ts --check` (apps/api) | 0 | Unchanged checker matches regenerated file |
| `npm_config_script_shell=/private/tmp/jg-m45-openapi-shell pnpm openapi:check` | 0 | Same root/package script and unchanged checker; temporary shell invokes Node's tsx loader for this exact command, avoiding CLI IPC. No repository script/dependency/check changes |
| `pnpm --filter @jobguard/api exec vitest run src` (initial / final) | 1 / 1 | Final 407 passed, 1 failed: unchanged health.test.ts cannot bind its supertest socket (listen EPERM). No exclusion/skip; CI must run it |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-message.application.test.ts src/recovery-message.controller.test.ts src/recovery-message.errors.test.ts` | 0 | 66 passed |
| `pnpm --filter @jobguard/web test` | 0 | 106 passed, 12 files |
| `pnpm --filter @jobguard/core test` | 1 | 2884 passed; the source and emitted copies of the bounded-allocation test exceeded the existing timeout during parallel checks |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1` | 0 | Complete same suite: 2886 passed, 106 files; no timeout changes, filtering or skips |
| `pnpm --filter @jobguard/db exec vitest run src test/recovery-message-repository.test.ts test/verify-evidence-pack-cli.test.ts` | 0 | All 21 available database units, 4 files; no PostgreSQL guarantee inferred |
| `node --test tools/*.test.mjs` | 0 | 42 passed |
| `pnpm --filter @jobguard/db exec vitest list test/recovery-messages.integration.test.ts test/recovery-message-upgrade.integration.test.ts test/recovery-message-repository.test.ts` | 0 | 92 collected: 80 integration, 3 upgrade, 9 unit |
| `pnpm --filter @jobguard/web exec playwright test --list e2e/M4-5-S.spec.ts` | 0 | 12 collected: 6 mobile-360, 6 desktop; repeated after final browser assertion |
| Static migration register/range/order probe and lane-JSON comparison | 0 | 47 sorted migrations, 47 in range, 0099 last; only m4-5-s changed, one exact path added |
| `git diff --check` | 0 | Clean |

Local check logs are `/private/tmp/jg-m45-*.log`. Turbo could not persist some shared-cache artifacts under the sandbox (IO warnings); successful task results above remained exit 0. The existing Next workspace-root warning was also unchanged.

## Migration, invariants and remaining gates

0099 changes only the terminal failed-fact guard; its number, tables, immutable history, grants, RLS, source locks and forward-fix strategy remain. No data backfill, ledger/policy/fee change or new provider action. For already-applied synthetic databases, use the existing reviewed forward-fix strategy; do not delete failed attempts or historical events. 0094 ownership is consumed, not amended. No new operational alert or timeout.

Affected invariants: AGENTS §§5.1 (session/tenant/job boundary), 5.3–5.4 (exact authority, replay and outbox facts), 5.7 (append-only history/audit), 5.8 (current evidence), 5.10 (synthetic-only) and 5.13 (independent verdict), plus C2/C4/C5/C6. No new model/prompt/parser/matching policy: live-model evaluation is inapplicable.

Not run: PostgreSQL integration/migration/catalog suites, MinIO/browser execution, root pnpm test (would launch PostgreSQL), screenshots/traces, live evaluations or providers. The dispatcher explicitly forbids starting PostgreSQL/listeners in this sandbox. CI must run every M4-5-S PostgreSQL test, upgrade/catalog/bootstrap regressions, the browser specification in both projects and all previous mandatory suites, secrets and dependency-review on the commit it creates. The health test and standard tsx script also require that unrestricted CI environment.

No new independent verdict or technical acceptance is claimed. Existing d3f3dd9 REPAIR verdicts are historical, not review of this working tree. The dispatcher should update PR #106's stale description to the new commit, 0099, this receipt and actual CI results, then obtain an exact-commit rebound verdict and separate acceptance. No release gate or founder decision is approved by this repair.

Intended commit message is written to `/private/tmp/jg-msg-m4-5-s-fresh.txt`.
