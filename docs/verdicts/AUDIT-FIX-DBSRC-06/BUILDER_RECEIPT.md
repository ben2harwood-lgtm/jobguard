# AUDIT-FIX-DBSRC-06 builder receipt

Status: HOLD. Builder evidence only; no independent model verdict or acceptance.

Issued 13 October 2026 by dispatcher 4. Branch `codex/sandbox/audit-fix-dbsrc-06`; starting HEAD `bd959b01e857de0ba7cbd3588bab84add7d0f493`. Check lane: RED (money and tenancy); dispatcher must run lane-floor.py on the committed diff. Audit source: `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-06.md` (source-inspected report).

## Blocking findings

1. Reproduced in a new scripted repository test before production edits: R1 returned while `read().id` still named R2 (exit 1). Fixed by advancing the draft with the existing controlled routine when immutable source content is reused, invalidating stale authorizations and appending an audit event in the same transaction. An unchanged head remains a no-op. New revisions allocate above the maximum historical revision, so moving back to R1 cannot collide with R2's number. Existing revisions, lines and proof stay immutable. Matching PostgreSQL repository-command test is written but unrun.
2. Reproduced in a new scripted repository test before production edits: net 10,000p, expected 15,000p (exit 1). Fixed assembly selection to use the latest approved commercial revision per variation rather than requiring that approval to match the working head. Rejected approved revisions remain excluded. A pending 7,000p revision remains only in pending; its approved 5,000p predecessor remains in totals until fresh approval. Matching PostgreSQL repository-command test is written but unrun.
3. DROPPED — no executed failing PostgreSQL reproduction in this sandbox; no fix made.

Migration STOP: source inspection of `packages/db/migrations/0132_final_account_lock.sql:274`–`:299` shows the controlled lock routine checks the draft head but never compares current approvals to the account's commercial line set. Closing that database boundary requires an additive migration replacing the controlled routine. The issued order says “No migration unless the finding cannot be fixed without one (then STOP and say so).” No migration or partial application-only guard was made. This is a hold, not a finding-3 pass or a claim the reported scenario is safe.

Scripted tests demonstrate application control flow only; they do not execute SQL or prove PostgreSQL guarantees. Both scripted tests passed after fixes. The second test's SQL-response dispatcher was corrected from a broad `FROM app.variation_approval a` match to the assembly SELECT prefix after it accidentally matched pending-read SQL; no expected value changed.

## Later findings (receipt only)

- #4: assembly ignores command identity; replay/payload-conflict work deferred.
- #5: mandatory proof/approval decisions can be dismissed from the inbox; deferred.
- Report's five test-strengthening suggestions: repository assembly coverage; assembly-driven authorization invalidation; real variation-to-supplementary invoice F7 journey; eventual invoice success after completion race; mandatory inbox IDs/refusals and member preference isolation. Existing tests remain unchanged.

## Scope and preservation

Applicable contracts read: AGENTS.md §§5.2–5.5, 5.7, 5.13; BUILD_PLAN.md §2.4 C1–C8, §5.2, SV-4; `docs/contracts/final-account-lock-v1.md`. C1: repair existing repository commands; no new screen or route. Exact lane allow list added as one compact line; all other lane entries unchanged. Shared lane registry/final-account repository edits serialize with coordinator. No agents delegated.

No existing expected value, refusal, count, pinned name, fingerprint or test changed. `apps/api/src/auth/context-boundary.test.ts` untouched. No new catalogue rows and no setup changes to existing calls. New integration fixtures establish a fictional baseline before new, previously nonexistent test calls. No migrations, grants, provider actions, real data, spending, dependency changes or package downloads. Standard F: no grant introduced. Rollback: revert the repository fix; no data rewrite, backfill or schema rollback. API shape is unchanged. No new operational alert.

## Validation

Dependencies were already installed. Node v24.17.0; cached pinned pnpm 10.28.1 used via `/private/tmp/jg-dbsrc-06-bin` on PATH because the default pnpm wrapper stalled. No git write commands issued against this repository; tooling tests use disposable Git fixture repositories. Dispatcher owns commit/push; intended conventional commit message is at `/private/tmp/jg-msg-audit-fix-dbsrc-06.txt`.

Dispatcher/Mac or GitHub CI must run PostgreSQL suites, migration checks and existing browser journeys. Sandbox cannot bind localhost, start PostgreSQL or run browsers. Integration tests are not represented as executed. Production policy/release gates and a different-model verdict bound to the dispatcher-created commit remain pending; builder does not accept this work.

Completed validation (all pnpm commands use the cached PATH prefix):

| Command | Actual result |
| --- | --- |
| `pnpm --filter @jobguard/db exec vitest run test/audit-dbsrc-06.test.ts --maxWorkers=1` | Initial exit 1, two expected failures: stale current ID and 10,000p versus 15,000p. After fixes and test-response dispatcher correction: exit 0, 2 tests. Intermediate run: 1 pass/1 harness failure; expectations unchanged. |
| `pnpm --filter @jobguard/db exec vitest list test/audit-dbsrc-06.integration.test.ts` | Exit 0, both tests collected; hooks not run. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck --esModuleInterop test/audit-dbsrc-06.test.ts test/audit-dbsrc-06.integration.test.ts` | Exit 0. |
| `node --test tools/*.test.mjs` | Exit 0, 85 tests. |
| `node tools/core-purity-lint.mjs`; `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | Each exit 0. |
| `LANE_BASE_REF=origin/main pnpm typecheck` | Exit 0; 7 successful package checks, 4 cached and 3 executed. Turbo emitted sandbox IO warnings while attempting cache writes; command succeeded. |
| `LANE_BASE_REF=origin/main pnpm build` | Exit 0; 7 successful package builds, 4 cached and 3 executed. Existing Next workspace-root/CSS and sandbox cache-write warnings; production build completed. |
| `LANE_BASE_REF=origin/main pnpm lint`; `LANE_BASE_REF=origin/main pnpm lint:lanes` | Each exit 1: “Missing branch or self-comparison range; refusing a misleading pass.” HEAD and origin/main both equal the supplied base because the dispatcher has not committed the working tree. Checker unchanged. |
| Supplementary read-only working-tree path check using existing `selectLane`/`matches` helpers; `git diff --check` | Each exit 0. Five exact changed/new files allowed; earlier lanes and protected auth test bytes unchanged. Not a replacement lane-check pass. |
| `pnpm openapi:check` | Exit 1, sandbox EPERM on tsx IPC pipe. |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | First attempt exit 1 on a stale built DB export while build was running; same check after DB build exit 0. Existing generator and unchanged `--check` mode; CLI IPC listener avoided. |
| `pnpm --filter @jobguard/api exec vitest run src/final-account.application.test.ts src/final-account-lock.application.test.ts src/variation/variation.application.test.ts --maxWorkers=1` | Exit 0, 21 tests. |
| Sequential `pnpm --dir packages/<ai\|config\|storage> exec vitest run src --maxWorkers=1` | Exit 0; AI 80 tests, config 1, storage 2. |
| `pnpm --filter @jobguard/db exec vitest run --exclude 'dist/**' --exclude 'src/**' --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts' --maxWorkers=1` | Exit 0, 84 tests in 9 files, including both new scripted regressions. PostgreSQL and localhost suites excluded explicitly for sandbox constraints. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0, 784 tests in 33 files. Unit tests only, not browser journeys. |
| `pnpm --dir packages/core exec vitest run src --maxWorkers=1` | Exit 1: 2,442 passed, 3 failed, all existing 5,000ms timeouts: two large receipt-allocation cases and the enterprise-domain source boundary scan. Their assertions and timeouts remain unchanged. The sequential shell stopped at this core failure; AI/config/storage were then run separately. |
| `pnpm --filter @jobguard/api exec vitest run src/auth/context-boundary.test.ts -t 'approves each main practice caller only at its exact reviewed source identity' --maxWorkers=1` | Exit 1: existing 5,000ms timeout at `apps/api/src/auth/context-boundary.test.ts:1287`. No assertion or pin changed; all 8 pinned source hashes still match. |

Protected-line preservation: `apps/api/src/auth/context-boundary.test.ts:1287`, before `it("approves each main practice caller only at its exact reviewed source identity", () => {`; after **identical**, no proposed edit. The failure is a timeout, not a pin change request. Existing expected values, counts, refusals and source pins remain untouched.

Broad initial foundation/DB/API/web unit attempts were interrupted (exit 130) after compiled test duplicates, slow-test failures and transport/import failures appeared; these are not passes. DB filtering was corrected to explicitly exclude dist/src, integration tests and the localhost free-port suite: positional `test` alone also matched compiled test names. Existing CI selection and assertions remain unchanged. Logs: `/private/tmp/jg-dbsrc-06-*.log`.

Core timeout details: `packages/core/src/receipt-allocation.test.ts` cases “2000 lines of distinct 12-digit amounts aggregate exactly, within the contract size, and round once” and “the working size is bounded: more distinct denominators than the documented limit fail closed”; `packages/core/src/enterprise-domain/boundaries.test.ts:27` case “new subdirectory production source is pure and directly reuses SH-1 kernels; money operators are bigint”. These are execution failures, not passes or approved exceptions. Root `pnpm test` was not started because it includes prohibited PostgreSQL/local-server suites; the runnable subsets and omitted suites are recorded explicitly. No clean-install claim: the issued order required using installed dependencies.

Dispatcher must run after its commit:

- `LANE_BASE_REF=origin/main pnpm typecheck`, `pnpm lint`, `pnpm lint:lanes`, `pnpm test`, `pnpm build`, `pnpm openapi:check`.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-dbsrc-06.integration.test.ts test/final-account.integration.test.ts test/variation.integration.test.ts test/final-account-lock.integration.test.ts test/final-account-lock-invoice.integration.test.ts`; `pnpm test:db`; `pnpm test:migrations`.
- `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop final-account.spec.ts variations.spec.ts SV-4.spec.ts`, plus the mandatory existing browser regression suite.
- Independent RED verdict against the exact dispatcher commit and separate technical acceptance. Finding 3 requires a newly issued migration task before closure.
