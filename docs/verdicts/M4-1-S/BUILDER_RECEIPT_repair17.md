# M4-1-S-R — builder receipt, repair 17

7 October 2026. PR #103; branch/lane `codex/sandbox/m4-1-s-repair` / `m4-1-s-repair`. Starting HEAD: `0d81969f623caa308c1082fa3660bff13f397c58` (repair-16 head plus the integrator's main merge). Working-tree changes only; the dispatcher commits. Original order and repairs 1–16 remain, except the retry-settlement assertions explicitly strengthened below. Builder execution evidence, **not an independent verdict or technical acceptance**. The Opus PASS at the starting head does not review this new diff.

## Findings and changes

**P2: a post-replay refusal does not cancel an unfinished original.** The shared refusal table now separates replay stage from `settlesUnknown`. On retry, an absent replay record establishes only that nothing was recorded yet. A pre-replay or potentially reversible refusal retains the original attempt, including its body, path, revision, selection rule and command ID; new commands remain blocked, and Try again replays that identical request. Only a permanent barrier to the identical command, a recorded conflict under the existing fixed synthetic membership, or a valid saved result ends the hold. First-attempt application refusals retain their existing behaviour. No durable refusal record or database change is introduced.

**P3: inherited read-error properties.** `recoveryReadFailure` uses `Object.hasOwn` before looking up a status. `constructor`, `toString` and `__proto__`, supplied as either `Error.message` or `Error.code`, now return exactly `{status:503, body:{code:"DATABASE_UNAVAILABLE"}}`.

**P3: lane receipt.** Only `lanes["m4-1-s-repair"].receipt` changes to this file. Parsed comparison against HEAD and byte comparison with `json.dumps(obj, separators=(",",":"), ensure_ascii=False)` plus one trailing newline pass. No other lane or field changes. The PR description is untouched.

## Refusal classification

All rows refer to an **identical retry after an unknown original**, under the current documented design. “Unknown” keeps the attempt held. Some code values cover both permanent and reversible causes; without distinguishing evidence they fail closed as unknown.

| Shared code | HTTP | Stage | Retry outcome and reason |
|---|---:|---|---|
| `INVALID_COMMAND` | 400 | Before replay | Unknown: parsing never establishes the original's outcome. |
| `UNAUTHENTICATED` | 401 | Before replay | Unknown: session check never reaches replay. |
| `MEMBERSHIP_FORBIDDEN` | 403 | Before replay | Unknown: membership/preflight check never reaches replay. |
| `RECOVERY_REVIEWER_FORBIDDEN` | 403 | Before replay | Unknown: owner verification never reaches replay. |
| `ELIGIBILITY_REVIEWER_FORBIDDEN` | 403 | Before replay | Unknown: reviewer verification never reaches replay. |
| `JOB_NOT_FOUND` | 404 | Before replay | Unknown: preflight cannot establish a pending command's result. |
| `RECOVERY_JOB_NOT_FOUND` | 404 | After replay | Unknown: absence is not a tombstone; a job can appear later. |
| `RECOVERY_CASE_NOT_FOUND` | 404 | After replay | Unknown: absence does not permanently reserve or forbid the case identity; wrong-job and missing-record causes share this code. |
| `ELIGIBILITY_REVIEW_NOT_FOUND` | 404 | After replay | Unknown: a review can be appended without changing the case revision. Supersede binds no expected review revision. |
| `RECOVERY_STALE_REVISION` | 409 | After replay | Unknown: the code tests inequality, including an expected revision ahead of current; subsequent history can reach it. The code does not prove the expected revision was passed. |
| `ELIGIBILITY_STALE_REVISION` | 409 | After replay | Unknown: it also covers missing/future case/review/evidence/policy revisions; subsequent history can satisfy those expectations. |
| `ELIGIBILITY_REVIEW_REQUIRED` | 409 | After replay | Refused permanently: approval has already matched the exact immutable review revision and its bound fields; that row is not reviewed. A replacement has a different review revision. |
| `RECOVERY_SOURCE_NOT_RECOGNISED` | 400 | After replay | Unknown: covers an absent recorded invoice/document or missing job material linkage that can appear later; no case revision binds an opening's sources. |
| `RECOVERY_TRANSITION_FORBIDDEN` | 400 | After replay | Unknown: also covers amount guards. Approved principal can change without a case-revision change (including the existing prevent-after-approved-reversal regression). |
| `RECOVERY_CLAIM_BELOW_SETTLED` | 400 | After replay | Unknown: approved reversal can lower settled principal without changing case revision. The delayed £900 amendment can then execute. |
| `RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE` | 400 | After replay | Refused permanently: closed/fully received state and current claim derive from immutable case history. Changing either changes the bound case revision; approved cash changes neither. |
| `ELIGIBILITY_NOT_APPROVABLE` | 400 | After replay | Refused permanently: classification belongs to the exact immutable matched review revision. Reclassification requires a different review revision. |
| `IDEMPOTENCY_PAYLOAD_CONFLICT` | 409 | Recorded conflict | Refused: this ID already has a different durable payload/job binding; the identical command cannot subsequently execute under it. Existing fixed-synthetic-membership handling remains. SBOX-SESSION-1's reconciliation follow-up remains deferred. |

## Red-before / green-after evidence

Production files were unchanged from `0d81969` during the recorded red runs. After correcting two initial test-harness setup mistakes (input selection and a scoped constant), the two-file web run had **17 behavioural failures, 174 passes**. The API run had **3 failures, 36 passes**. After production fixes: **191/191** in those web files and **39/39** in the API file; final complete web suite **274/274**.

Named red-to-green tests:

- `repair 17: %s/%i refuses a first attempt but cannot settle an unfinished original on retry` — eight post-replay code/status cases, preserving first-attempt assertions and checking both code-only and message-bearing replies.
- `repair 17: a reversible post-replay refusal %s/%i retains the original attempt and blocks new commands` — eight component cases. These replace repair-16's six unsafe hold-release assertions with stricter uncertainty, disabled controls, forced-click rejection and identical-replay assertions.
- `delayed £900 amendment, refused retry, approved reversal and late original stay unknown until identical replay confirms the save` — real component with the existing hook harness and simulated deferred network/persistence adapter. It checks the refusal does not settle the attempt, every fresh opening stays blocked, reversal preserves revision, late execution still leaves the UI uncertain, and identical replay shows £900 before releasing the hold.
- `repair 17: inherited read status %s defaults to DATABASE_UNAVAILABLE` — three names, each tested through message and code.

The old classifier assertion that *every* post-replay refusal settled an unknown attempt is replaced by permanent-versus-reversible assertions. All first-attempt, permanent-refusal, payload-conflict, malformed response, exact-status and prior replay coverage remains. No assertion was weakened, no suite/test was skipped, and no timeout or retry count was added or increased.

## Commands actually run

Existing installed dependencies; Node **24.17.0**, cached pinned pnpm **10.28.1**. pnpm commands used `PATH=/private/tmp/jg-repair16-bin:$PATH`, the existing cached executable shim. No install/download. Logs: `/private/tmp/jg-repair17-logs/`.

| Command | Exit | Result |
|---|---:|---|
| `pnpm --filter @jobguard/web exec vitest run app/lib/recovery-case-requests.test.ts app/ui/recovery-cases.behaviour.test.ts` before production fixes | 1 | Initial harness iterations corrected; final recorded red: 17 failed, 174 passed. |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-case.application.test.ts` before fixes | 1 | 3 failed, 36 passed. |
| `pnpm --filter @jobguard/api build` | 0 | Refreshed shared contract artifacts. |
| Same two-file web command after fixes | 0 | 191/191. |
| Same API file command after fixes | 0 | 39/39. |
| `TURBO_FORCE=true pnpm typecheck` initial / final | 2 / 0 | New test lacked a TypeScript union narrowing; fixed without changing its assertions. Final 7/7 tasks, uncached. |
| `LANE_BASE_REF=origin/main pnpm lint` initial / final | 2 / 0 | Same test typing error; final boundary lints and 7/7 package tasks pass (4 cached). No self-comparison refusal. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Correct assigned lane; repeated after this receipt was written. |
| `pnpm --filter @jobguard/web test` initial / final | 0 / 0 | 274/274, 14 files. Final run includes the corrected narrowing. |
| `pnpm --filter @jobguard/api test` | 1 | 165 passed; unchanged health test failed on socket-binding `listen EPERM`, with one associated unhandled error. Its chained OpenAPI launcher did not run. |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-case.application.test.ts src/recovery-case.command.application.test.ts src/recovery-case.controller.test.ts` | 0 | All 66 affected recovery tests. |
| `pnpm openapi:check` | 1 | tsx CLI's IPC socket cannot bind (`EPERM`); generator did not run through that launcher. |
| `node --import tsx src/generate-openapi.ts --check` in `apps/api` | 0 | Same generator without the listener; OpenAPI matches. |
| `node --test tools/*.test.mjs` | 0 | 42/42. |
| `TURBO_FORCE=true pnpm build` | 0 | 7/7 tasks uncached; production Next build completed. |
| `pnpm --filter @jobguard/db exec vitest list test/recovery.integration.test.ts` initial / final | 0 / 0 | Imports and collects the new real-PG regression; does not execute hooks or PostgreSQL. |
| `pnpm --filter @jobguard/web exec playwright test --list M4-1-S.spec.ts` | 0 | 16 collected tests, including the new regression in both projects. Collection only. |
| `pnpm exec tsc -p /private/tmp/jg-repair17-db-tsconfig.json` | 2 / 0 / 0 | Extra check of integration-test TypeScript: corrected temporary type-root configuration, then passed; final source-contract import also passes. No repository configuration change. |
| Read-only equality/hash checks against HEAD | 0 | Only the requested lane field changed; migration, registration, repository, plan and dependencies unchanged. |
| `git diff --check` | 0 | Clean; repeated after the receipt. |

Turbo emitted sandbox cache IO warnings; Next emitted the existing multiple-lockfile root warning. The full API and standard OpenAPI-launcher failures are reported as failures, not passes. Unit/component tests and collection are not browser/PostgreSQL execution.

## Required CI execution and remaining gates

CI must execute the new **real-PostgreSQL** test in `packages/db/test/recovery.integration.test.ts`:

`repair 17: delayed original, below-settled retry, approved reversal and late execution keep the browser attempt unknown until replay`

It gates only the original's acquisition of a real connection before its transaction. Real runtime-role queries/routines approve £1,000 against £2,500, refuse the identical £900 retry, reverse the approved principal without changing case revision, then let the original commit. It asserts the shared wire/refusal contract requires continued uncertainty before and after that late commit; identical replay returns a valid saved response, with exactly one command event and amendment audit event. The shared contract is imported from source so DB tests have no undeclared dependency on API build artifacts.

CI must execute the new **browser** test in `apps/web/e2e/M4-1-S.spec.ts`, in **mobile-360 and desktop**:

`repair 17: a below-settled retry keeps a delayed £900 amendment held across an approved reversal and late execution`

The fault adapter aborts the first browser transport and delays forwarding that exact original through the authenticated real request client. Every refusal/success comes from the actual application and PostgreSQL; no JobGuard success API is fulfilled. Synthetic fixtures feed the existing landing and reversal routines, executed as `jobguard_runtime`. Assertions cover the actual 400 below-settled reply, held/blocked UI, byte-identical retries, unchanged revision across reversal, late committed £900, uncertainty until replay, one command event, reload, a second signed-in context, banner, error focus, touch target and no overflow. The earlier accepted URL/second-context substitute for capture jobs absent from Jobs remains.

Targeted CI commands: `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery.integration.test.ts` and `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-1-S.spec.ts`. All previously mandatory PostgreSQL, migration, browser and API-health checks remain required.

**Not run locally:** PostgreSQL/migration suites and browser journeys (dispatcher-confirmed sandbox cannot bind localhost/start PostgreSQL), clean reinstall (downloads prohibited), full root `pnpm test` (includes unavailable PostgreSQL/listener infrastructure), live providers, real data/sends, spending, production mode, deployment or decision approvals. Synthetic approval rows in the unexecuted test fixtures are generated reference data, not human/policy/production approvals. AI evaluation is inapplicable: no model/prompt/extraction/matching/gateway changes.

**Migration stays 0097**, SQL byte-identical to HEAD: SHA-256 `84aef359c62455818e4eb66d26ca9d21c13c49ddd06af202fd107be3950d9375`. No backfill, grants, posting-routine change or new alert. Ben's “keep documented design” decision, the maximum of manual/approved principal, source document/version identities and reverse-landing controls stand. Affected invariants: exact command identity/outcomes and durable idempotency (AGENTS §§5.3–5.4), versioned boundary validation. Wire codes/statuses and successful responses remain compatible; certain retry refusals now retain uncertainty conservatively. The shared lane-registry edit is limited to this lane's receipt.

No Git write command, push, merge, PR creation or PR-text edit. Intended conventional commit subject/body: `/private/tmp/jg-msg-m4-1-s-repair.txt`.

Remaining gates: dispatcher commit/push, green mandatory CI including the two new real-PG/browser regressions and the locally blocked health/OpenAPI launcher checks, a fresh independent verdict bound to the resulting exact commit, separate technical acceptance, and founder-owned merge/release in migration order. Earlier deferred SBOX-SESSION-1, REC-UI-1, REV-ACCT-1 and allocated-gross/eligible-net follow-ups remain. **Not independently verified or accepted.**
