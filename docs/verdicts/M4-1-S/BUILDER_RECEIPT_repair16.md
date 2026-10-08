# M4-1-S-R — builder receipt, repair 16

7 October 2026. PR #103, branch/lane `codex/sandbox/m4-1-s-repair` / `m4-1-s-repair`. Base HEAD: `f5b4288c984b622cdebe5b003c59d49614e19690`. Working-tree repair; the dispatcher commits it. This is builder execution evidence, not an independent verdict or technical acceptance.

## Finding → fix → test

**Sol P2 + Opus P3-1:** arbitrary first-attempt 4xx responses discarded unknown outcomes, while post-replay retry refusals never released the hold. Added `recoveryCommandRefusalV1`, a Zod application error contract in the existing API contracts module, validating the known code, optional string message and exact HTTP status together. The server failure mapper and browser share the code/status rules, including each refusal's position relative to replay. Existing wire bodies and status mappings remain compatible.

- Known first-attempt refusals settle. `INVALID_COMMAND`, session/membership/reviewer refusals and preflight `JOB_NOT_FOUND` precede replay; on retry they keep the earlier unknown attempt.
- Post-replay stale revision, missing case/job/review, forbidden transition, source, claim and eligibility refusals settle both attempts: replay found no recorded command under the existing lock.
- Everything unclassified stays unknown, including timeouts, empty/unreadable bodies, malformed messages, code/status mismatches, intermediary 408/other 4xx/5xx and invalid success bodies. The component retains its original body, path, selection rule and command ID, with new commands blocked.

Tests were written and executed **before production edits on f5b4288**. The request/classifier and real-component suites exited 1: **38 classifier failures + 10 component failures; 140 passed**. The empty-408 test commits a fictional case in the in-memory replay adapter, loses the POST answer to an empty 408, asserts uncertainty and disabled openings (including forced clicks), then replays the identical body/path/ID and gets the one saved case. Six post-replay retry regressions fail on the old indefinite hold. After the fix both suites pass **188/188**.

Classifier coverage checks every recognised code/status pair for first attempts and retries, every wrong status, unreadable/unclassified responses and malformed error bodies. Server unit controls pin all error statuses, invalid-command parsing and unknown failures. Existing tests that encoded blanket-4xx refusal were replaced with stronger contract assertions: arbitrary messages/unreadable 404s now also run through the unknown-commit/replay regression; known refusals still permit a fresh ID. Repair-15 authorization cases now use each actual code/status pair and add membership refusal coverage. No assertion, timeout, retry count or skip setting was weakened.

**Opus P3-2:** corrected the identical-retry payload-conflict comment. The ID is already recorded under a different server-derived membership hash; it does not prove nothing was saved. Current fixed-synthetic-membership conflict handling and its regression remain. The comment explicitly records that **SBOX-SESSION-1**, when introducing per-session memberships, must retain/reconcile the attempt or show “already recorded”. That follow-up is not implemented or waived here.

## Commands actually run

Node **24.17.0**, cached pinned pnpm **10.28.1**, existing installed dependencies. Commands used `PATH=/private/tmp/jg-repair16-bin:$PATH`; its `pnpm` symlink targets the already-cached 10.28.1 executable. No install or package download. Logs: `/private/tmp/jg-repair16-logs/`.

| Command | Exit | Result |
|---|---:|---|
| `pnpm --filter @jobguard/web exec vitest run app/lib/recovery-case-requests.test.ts app/ui/recovery-cases.behaviour.test.ts` before fixes | 1 | 48 failed, 140 passed; production files unchanged from f5b4288 |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-case.application.test.ts` before fixes | 0 | 36/36 server controls |
| `pnpm --filter @jobguard/api build` | 0 | Refresh API contract artifacts before browser unit tests |
| Same two-file web command after fixes | 0 | 188/188 |
| `TURBO_FORCE=true pnpm typecheck` | 0 | 7/7 tasks, uncached |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | All boundary lints; 7/7 package tasks (2 cached); no self-comparison refusal |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Correct lane; final receipt included in final scope check |
| `pnpm --filter @jobguard/web test` | 0 | 271/271, 14 files |
| `pnpm --filter @jobguard/api exec vitest run src` | 1 | 162 passed; unchanged health test failed on socket-binding `listen EPERM`, with associated unhandled error |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-case.application.test.ts src/recovery-case.command.application.test.ts src/recovery-case.controller.test.ts` | 0 | All 63 affected recovery tests |
| `pnpm openapi:check` | 1 | tsx CLI could not bind its IPC listener (`EPERM`); generator did not run |
| `node --import tsx src/generate-openapi.ts --check` in `apps/api` | 0 | Same generator without CLI listener; generated OpenAPI matches |
| `node --test tools/*.test.mjs` | 0 | 42/42 |
| `TURBO_FORCE=true pnpm build` | 0 | 7/7 tasks, uncached; production Next build completed |
| Read-only equality/hash inspection against HEAD | 0 | Dependency files, plan, lane configuration and 0097 unchanged; migration SHA-256 `84aef359c62455818e4eb66d26ca9d21c13c49ddd06af202fd107be3950d9375` |
| `git diff --check` | 0 | Clean |

Turbo emitted sandbox cache IO warnings; Next emitted its existing multiple-lockfile root warning. Neither is a failing check. Full API health and standard OpenAPI-launcher failures are recorded, not counted as passes. Component tests use the real component with the existing hook harness and simulated network/commit/replay adapter; they are not browser or PostgreSQL execution.

## Scope, not run and remaining gates

All earlier work and Ben's 7 October **“keep design”** decisions from repair 15 remain: `greatest(manual_landed, approved_landed)`, document and version source IDs, and reverse-landing gating. **Migration stays 0097**, byte-identical; no database change, backfill, grant or new operational alert. Recovery authorization, locking, audit and durable replay implementation are unchanged. Affected invariants: AGENTS §§5.3–5.4 and boundary validation—honest command outcomes and retention of exact retry identity. Valid server responses remain compatible; previously unclassified 4xx answers now fail closed.

**Not run:** PostgreSQL/migration suites and Playwright (sandbox cannot bind localhost/start PostgreSQL; browser suites run in CI), clean reinstall (downloads prohibited), full root `pnpm test` (includes unavailable PostgreSQL and listener-dependent infrastructure; requested web/API suites run as above), dependency scanner/CI, live providers, real data, real sends, spending, production mode, deployment or decision approvals. AI evaluation is inapplicable: no model, prompt, extraction/matching policy or gateway changes.

Dependency advisory P1 awaits the integrator's main integration of **#113** and green CI; `package.json` and lockfile are untouched. PR metadata P3 is the integrator's job. No push, merge, PR creation or Git write command. Intended conventional commit subject/body is in `/private/tmp/jg-msg-m4-1-s-repair.txt`.

Remaining gates: dispatcher commit, main security-fix integration, green mandatory CI (including API health, PostgreSQL/migrations and both browser projects), fresh independent verdict bound to the exact resulting commit, separate technical acceptance and founder-owned merge in migration order. SBOX-SESSION-1, REC-UI-1, REV-ACCT-1 and allocated-gross/eligible-net follow-ups remain deferred as recorded. **Not independently verified or accepted.**
