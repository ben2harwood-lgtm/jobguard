# AUDIT-FIX-API-FILE-SHADOW-DETECTION — builder receipt

Issued 13 October 2026 by dispatcher 4; executed 14 October 2026. Builder: Codex. Branch `codex/sandbox/audit-fix-api-file-shadow-detection`. At task start, inspected HEAD and origin/main both `c08a53784c05b54b18f7bfff87f4c7597032ca7e`. Working-tree changes only; no Git-writing command, commit, staging, checkout, push, merge or release. Intended commit message: `/private/tmp/jg-msg-audit-fix-api-file-shadow-detection.txt`.

**STOP — a migration is required to fix BLOCKING 1. Reproduction only; regression remains failing; not merge-ready.** No implementation fix, independent verdict, technical acceptance or PostgreSQL proof is claimed.

## Scope and blocking reproduction

Read AGENTS.md rev 3.0, BUILD_PLAN.md SV-3/SV-4/SV-5 and applicable §5 invariants, `docs/contracts/shadow-detection-v1.md`, the actual worker/reader/sink and migrations 0128/0132/0133. Read the issued audit `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-file-shadow-detection.md` (one BLOCKING, two LATER).

**BLOCKING 1 — reproduced; not fixed.** New test `apps/api/src/shadow-detection-lock-race.test.ts`: **completes a pending mandatory firing when final-account locking races detection**. It executes the actual worker, observation reader and detection repository with deterministic PostgreSQL contract doubles. The runtime double supplies exact accepted-terms lookup success, an unlocked live job and finalized, version-specific evidence with `safetyImplication=true`. The shadow double pauses after signal persistence COMMIT; the test commits its simulated builder lock, resumes execution and retries the task. It expects exactly one mandatory Decision, firing and disclosure and refuses an undisclosed held survivor.

Executed `./node_modules/.bin/vitest run src/shadow-detection-lock-race.test.ts --maxWorkers=1` from apps/api. After refreshing existing compiled dependencies, exit **1**, **one failed test / four failed assertions**: all three effect counts are **0 rather than 1** and the signal remains `held_for_final_check` with `disclosed_before_lock=false`. Diagnostic: `Initial attempt and retry: early surface requires an unlocked job; DETECTION_LOCKED_JOB`. Re-executed after replacing this new test's ES2024 Promise helper with an ES2023-compatible barrier; same business failures, exit **1**. Log: `/private/tmp/jg-shadow-regression-final.log`.

This is an executed application/repository sequencing regression against a database contract double, **not** an executed SQL routine, real-PostgreSQL lock race, persisted database count or live integration. The double models the explicit current 0133 locked-job refusal before effects; the actual reader produces the retry refusal. No blocking finding is DROPPED.

## Why the migration stop applies

`packages/db/migrations/0133_shadow_detection.sql:92` refuses new mandatory firings once `final_account_lock` exists. The shadow login has SELECT only on `shadow_must_surface_firing`; creation is confined to the controlled `surface_shadow_signal_early` routine. Retrying persisted groups or relaxing the reader's lock refusal cannot bypass that routine's refusal. The existing 0132 lock command serializes on the job row. Persistence and each alert currently commit separately, as explicitly documented for the business-before-audit lock order.

Completing the report's pending firing after the lock therefore requires an approved forward migration changing the controlled boundary (and a truthful post-lock disclosure path), or a reviewed database fence/batch design preventing this incomplete durable state. Direct inserts, new role grants, ignoring the refusal, weakening lock checks or unsafe aggregation of later business locks after an audit-head lock are not authorized alternatives. Existing migration bytes are immutable for this task. Stopped before any such change under the issued rule: **“No migration unless the finding cannot be fixed without one (then STOP and say so).”**

## Protected sources, lane and change inventory

Only a new test, this receipt and one compact additive lane entry are changed. Exact allow list: `config/agent-lane-assignments.json`, `apps/api/src/shadow-detection-lock-race.test.ts`, `docs/verdicts/AUDIT-FIX-API-FILE-SHADOW-DETECTION/BUILDER_RECEIPT.md`. Registry before: no `audit-fix-api-file-shadow-detection` entry. After: one entry for the exact issued branch and those three exact files. Parsed comparison against the issued base `c08a53784c05b54b18f7bfff87f4c7597032ca7e` proves every prior lane entry is unchanged. Origin/main subsequently advanced externally; this branch was not rebased or merged. No existing catalogue row or premise-establishing setup is edited.

No existing test, expected value, refusal, count, pinned name or fingerprint is changed. `apps/api/src/auth/context-boundary.test.ts` is untouched. A read-only comparison to the initial origin/main (issued base) proves byte identity (whole-file SHA-256 `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`). No protected line needed modification. No migration, backfill, schema, production code, role membership, RLS policy or grant change. **Standard F: no new grant; not applicable to this reproduction-only change.** All data is fabricated; no real data, provider call, spending or external business action. No model, prompt, schema or policy change. Existing synthetic-only and release restrictions remain in force; no new operational alert is implemented.

The path floor must be calculated by the dispatcher on the actual committed diff using `lane-floor.py`. Its commit-only interface cannot classify uncommitted files. At task start HEAD/base were also identical. The new lane registration and test fall under the current AMBER path floor, receipt under GREEN; retain **RED** review for any follow-on change to tenant/role/controlled mandatory effects. The proposed migration design is not approved here. Shared lane registry edits serialize with other task registrations.

## LATER — receipt only

- LATER 2: an AI proposal error prevents deterministic mandatory findings from reaching persistence. No fix or test added.
- LATER 3: multiple schema-valid AI candidates share a signal identity and can reject the whole batch with `OBSERVATION_BINDING_MISMATCH`. No fix or test added.
- Audit weak-test suggestions, deferred: distinguish invocation contexts A/B/A and deterministic proposals; prove startup refusals leave ports untouched; prove malformed/cross-tenant payloads leave all ports untouched; exercise exact-version/tenant accepted-terms success and refusal; complete and replay a task through actual shared-worker composition with unique persisted effects. No existing worker test edited.

## Local validation

Dependencies were already installed; no install or download. Commands use existing cached pnpm **10.28.1** through `/private/tmp/jg-audit-bin/pnpm` prepended to PATH. Node **24.17.0** is installed; `.nvmrc` pins **24.15.0**, so this is not a clean pinned-install claim. Logs are local `/private/tmp/jg-shadow-*.log` files.

Commands actually run (the pinned temporary pnpm wrapper is on PATH for pnpm calls):

| Command | Result |
|---|---|
| Targeted new regression (apps/api), before any production fix | **1**, one failed test / four business assertions; three effect counts zero and held undisclosed signal |
| `pnpm build` (final rerun) | **0**, all 7 tasks successful, 5 cached; 31 web pages generated |
| `pnpm typecheck` (final rerun) | **0**, all 7 tasks successful, 5 cached |
| `LANE_BASE_REF=origin/main pnpm lint` (initial) | **1**, core purity passed, lane checker refused identical base/HEAD before package lint |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (initial) | **1**, same self-comparison refusal; rerun after dispatcher commit |
| `LANE_BASE_REF=origin/main pnpm lint` (after external ref advance) | **0**, core purity, lane, money/commercial boundaries and all 7 package lint tasks successful; 5 cached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (after external ref advance) | **0**, all three working-tree files in the exact lane; base `bd959b01e857de0ba7cbd3588bab84add7d0f493`, unchanged HEAD `c08a53784c05b54b18f7bfff87f4c7597032ca7e` |
| `pnpm exec turbo run lint` (final rerun) | **0**, all 7 package lint tasks successful, 5 cached |
| `node tools/money-arithmetic-lint.mjs` | **0**, money boundary check passed |
| `node tools/commercial-boundary-lint.mjs` | **0**, commercial boundary check passed |
| `node --test $(rg --files tools -g '*.test.mjs' \| rg -v 'agent-lane-boundary(-train)?\.test\.mjs$')` | **0**, 19 passed; two Git-writing fixture suites reserved for dispatcher/CI |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | **0**, 81 files / 2,445 passed |
| `pnpm --filter @jobguard/ai --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/core --parallel exec vitest run --maxWorkers=1` | Overall interrupted **130**; AI finished with **80 passed**, config **2 passed**, storage **4 passed**; core's duplicate dist collection timed out, replaced by source-only run above |
| `pnpm --filter @jobguard/db exec vitest run src --maxWorkers=1` | **1**, twice: 86 passed / one existing `[C-OPS-1]` source-graph scan exceeded the default test timeout (29s and 20s scan durations) |
| Same DB unit command plus `--testTimeout=60000` | **0**, 5 files / 87 passed; CLI timeout override only, no test file edited |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --testTimeout=60000 --exclude 'src/shadow-isolation.application.test.ts' --exclude 'src/final-account-lock.isolation.test.ts' --exclude 'src/health.test.ts' --exclude 'src/auth/sso/action-paths.test.ts' --exclude 'src/contractor/*.http.test.ts'` | **1**, 63 files / **1,551 existing tests passed**; only the new regression failed (four expected business assertions). Excluded PostgreSQL/HTTP suites remain mandatory in CI |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1 --testTimeout=60000` | **0**, 33 files / 784 passed |
| `pnpm openapi:check` | **1**, tsx CLI IPC socket creation denied with `listen EPERM` |
| `node --import tsx src/generate-openapi.ts --check` (apps/api) | **0**, same generator/check through loader without the denied IPC socket |
| Supplemental read-only working-tree allow-list check using exported `selectLane` / `matches` | **0**, all three changed files are in the new exact lane; distinct from the initial formal refused range check |
| Supplemental external lane-floor matcher on those exact paths | AMBER registry/test, GREEN receipt; commit-based script still reserved for dispatcher |
| Parsed lane registry comparison to issued base (initial origin/main) | **0**, one new entry only; all previous entries unchanged |
| `git diff --check` | **0** |

The first targeted test attempt failed before reproduction with stale compiled exports (`parseObservation is not a function`); the dependency build refreshed these before the actual reproduced assertions. The first typecheck/build/package-lint attempts failed on this new test's `Promise.withResolvers` usage (TS2550 under the repository's ES2023 library). Replaced only the new test's barrier implementation, preserving all its business expectations, then reran. Initial API/web broad runs were interrupted (**130**) while API exports were unavailable during the failed Nest build; they are not green verification evidence. Final runs use compiled current exports. Extended CLI unit timeouts are disclosed; they do not prove the unchanged root suite or clean pinned CI passes. Turbo reported shared-cache IO permission warnings; task exit/results above distinguish those warnings from test assertions. The web build also reported existing workspace-root and CSS autoprefixer warnings; no adjacent configuration/CSS change was made. During final inventory, origin/main advanced externally to `bd959b01e857de0ba7cbd3588bab84add7d0f493` (adding the unrelated `audit-fix-api-value` lane). The initial equal-base refusals are preserved above; full lint and lane lint were rerun successfully against the new ref. The fixed issued-base registry comparison still proves only this task's entry was added; all previous entries remain unchanged. No Git mutation was performed to follow the external ref. Root `pnpm test` is not executed: it includes mandatory PostgreSQL suites and Git-writing lane-fixture tests disallowed in this sandbox. Browser/native/real-model checks are not substituted by unit tests.

## Dispatcher / CI follow-up

Reissue the database boundary work with migration authority before treating this task as a fix. Preserve the new regression's business assertions and add a real-PostgreSQL counterpart using actual accepted terms, finalized evidence, final-account locking and exact unique mandatory effects. The contract double models the current SQL refusal; a follow-on SQL change needs a reviewed matching contract double, rather than a claim that these arrays prove database effects. This receipt does not authorize the builder to accept its own work.

On the Mac or GitHub CI after the dispatcher commits/pushes, run the full pinned `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `LANE_BASE_REF=origin/main pnpm lint:lanes`, `pnpm test`, `pnpm build`, `pnpm openapi:check`, `pnpm test:db`, `pnpm test:migrations` and `pnpm test:e2e`. These include the excluded API PostgreSQL/HTTP suites and Git-writing tool fixture suites. The three existing PostgreSQL suites `packages/db/test/shadow-detection.integration.test.ts`, `shadow-persistence.integration.test.ts` and `final-account-lock.integration.test.ts` are especially relevant. No PostgreSQL server or browser was started locally. The new regression currently fails intentionally; publishing this change does not make CI green.

Bind a different model's real recorded RED verdict to the dispatcher's exact eventual commit and obtain separate technical acceptance. Founder retains merge/push/release ownership; no approval is inferred from this receipt.
