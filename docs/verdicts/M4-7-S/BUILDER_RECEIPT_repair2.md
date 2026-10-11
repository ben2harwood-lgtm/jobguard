# M4-7-S / PR #108 — repair-builder receipt, round 2, 5 October 2026

**Builder:** OpenAI GPT-6.1 Sol via Codex. **Base:** `7cb2dfb2ca61aaf0833a12b9178e18dc1ddbe490`. **Lane:** `m4-7-s`, branch `codex/sandbox/m4-7-s-r3`. The dispatcher owns the resulting commit and push. This builder issued no git commands, made no independent verdict, accepted nothing and merged nothing. The prescribed lane checks perform their own read-only git comparisons.

**P1 remains OPEN under founder-held SBOX-SESSION-1; C3/C5 remain blocked.** The fresh verdict lists one P1 and no additional P2/P3 defects. There is no in-scope runtime repair that can establish the missing creator authority without changing the held shared prerequisite. **Not independently verified, not accepted.**

Read: AGENTS.md rev 3.0; BUILD_PLAN.md §2.4 C1–C8 and M4-7-S task card; every file in `docs/verdicts/M4-7-S/` at the supplied base (both receipts and `CI_EVIDENCE_c8e7957.json`); `/private/tmp/jg-m4-7-s-r3-solverdict.md`; the held SBOX-SESSION-1 order and both earlier M4-7-S session follow-ups. Ben's 4 October rulings accepting the C7 Jobs-list substitute and fictional sample-source labels remain in force. Earlier repaired findings are not reopened or waived.

## P1 → regression → held prerequisite

**Written/extended and run before any repository edit.** The new scratch test file `/private/tmp/jg-m4-7-s-r3-repair2/session-regression.mts` preserves the prior builder's GET-first and POST-connect-first rejection assertions and exposure diagnostic, and adds creator-first GET/connect preservation and stranger-first POST exposure/lockout diagnostics. The two required refusal tests fail with **Missing expected rejection**, not a transport or setup failure. Exit **1**, **2 failed / 4 passed / 0 skipped**. Both stranger-first paths expose the fictional receipt and prevent subsequent creator access. Creator-first access still works and refuses a later stranger.

These tests execute actual repository, transaction-wrapper, audit and projection code with a SQL-client double. They prove **repository control flow only**, not PostgreSQL, RLS, trigger, rollback or race guarantees. They are scratch evidence for the held prerequisite, not passing mandatory coverage or a replacement for database/browser regressions.

**Root-cause ownership established by source inspection:**

| Boundary | File:line evidence and implication |
|---|---|
| Shared synthetic-session check | `apps/web/app/lib/synthetic-server.ts:8` accepts a UUID-shaped cookie without authenticating a persisted session or binding it to a job. |
| Capture transport/composition | `apps/web/app/api/jobs/capture/route.ts:6` calls that helper and passes only the body to `capture.create`; `apps/api/src/workspace/application.ts:51` maps that call to `CaptureApplication.capture`. The session is discarded before creation. |
| Captured-job creation | `apps/api/src/capture/capture.application.ts:8` selects the fixed demo owner; `:13` accepts no creator session and supplies none to persistence. `packages/db/src/capture-repository.ts:7` has no creator-session input; `:24` creates the job without one in the capture transaction. No authoritative creator binding exists for the feed to reuse. |
| Sibling quote service | `apps/api/src/quote/quote.application.ts:2` selects the same fixed demo owner; `:4` reads/writes the job without session ownership verification. |
| Sibling invoice service | `apps/api/src/customer-invoice.application.ts:2` selects the same fixed demo owner; `:3` reads/writes invoices and receipts without a session/job binding. |
| Sibling recovery service | `apps/api/src/recovery-case.application.ts:6` selects the fixed demo owner; `:11`/`:14` reads/writes without a session; `:19` only validates UUID shape for eligibility. |
| Feed's additional checks and residual | `apps/api/src/practice-feed.application.ts:28` rejects non-synthetic mode; `:29` validates session shape. `packages/db/src/practice-feed-repository.ts:73` verifies current owner membership; `:83` reads sandbox-run ownership and `:84` refuses a conflicting session. For captured jobs, `:87` permits an unowned job to be claimed and `:92` inserts the caller as owner. `:101` then refuses the creator after a stranger's claim; `:117` projects receipts. |
| Database backstop gap | `packages/db/migrations/0046_practice_feed.sql:128`/`:132` checks the claim's supplied session, membership and conflicting sandbox runs, but requires no positive creator binding for a captured job. |

**Disposition: shared SBOX-SESSION-1 prerequisite, held for Ben; not fixed or waived.** Its cause includes the pre-existing shared synthetic-session/capture boundary used by sibling services. Fixing only the feed's first-touch condition cannot derive the creator; UUID secrecy, mount order, client acquisition metadata and existing first-touch owners are not authority. M4-7-S retains its live-membership, synthetic-mode, sandbox-run and persisted first-touch checks and is no weaker than these siblings. No shared-session code was changed or founder authorization inferred.

Appended the exact-base evidence to `/Users/benharwood/.local/share/full-steam/jg-orders/SBOX-SESSION-1.txt` and wrote `/Users/benharwood/.local/share/full-steam/jg-orders/M4-7-S-7cb2dfb-session-binding-followup.txt`. Both explicitly retain **HELD**, **OPEN P1**, and **not accepted**. Local staging copy: `/private/tmp/jg-m4-7-s-r3-repair2/session-followup.txt`; verified the follow-up is byte-identical and the shared order contains that note. The first automatic permission review timed out without executing the external-directory write; its permitted single retry succeeded. No outstanding approval request remains.

The held order requires immutable creator-session ownership in the capture transaction, shared checks before feed reads/claims/commands/replays and receipt snapshots, PostgreSQL enforcement, and fail-closed legacy handling. Never infer creators from existing first-touch owners. Required regressions are real-PostgreSQL stranger-first GET/POST, raw SQL, unbound legacy jobs and races with preserved creator access; both browser projects must create through the real capture API **without first mounting the creator's feed**, then attack from a second session. Existing creator-first coverage at `packages/db/test/practice-feed.integration.test.ts:397` and `apps/web/e2e/M4-7-S.spec.ts:254` remains intact and does not cover this attack. The held database/browser regressions were **specified, not implemented or executed** here.

## Local commands and results

Installed Node **24.17.0**, pnpm **10.28.1**, supplied dependencies. Used the existing installed pinned binary via `/private/tmp/jg-m4-7-s-r3-bin` prepended to PATH; no install, download or package/runtime pin change. `TURBO_FORCE=true` forced uncached typecheck/lint/build. Logs and per-command exit JSON are under `/private/tmp/jg-m4-7-s-r3-repair2/`; the check driver there records each command and working directory.

| Command actually run | Exit | Result / log |
|---|---:|---|
| `node --import ./apps/api/node_modules/tsx/dist/loader.mjs --test /private/tmp/jg-m4-7-s-r3-repair2/session-regression.mts` | 1 | 2 expected missing-rejection failures, 4 diagnostic passes, 0 skipped; `session-regression.log` |
| `TURBO_FORCE=true pnpm typecheck` | 0 | 7/7 tasks, 0 cached; `typecheck.log` |
| `LANE_BASE_REF=origin/main TURBO_FORCE=true pnpm lint` | 0 | Purity, lane, money and commercial guards; 7/7 tasks, 0 cached; `lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Local branch comparison against `origin/main`; all **36 paths** allowed, including the new receipt; `lanes.log` |
| `TURBO_FORCE=true pnpm build` | 0 | 7/7 tasks, 0 cached, including production Next build; `build.log` |
| `pnpm --filter @jobguard/core exec vitest run src` | 0 | **252 tests / 35 files**; `core.log` |
| `pnpm --filter @jobguard/api exec vitest run src` | 1 | **150 passed / 1 failed, 17 files**; unchanged `src/health.test.ts` fails on prohibited socket bind (`listen`, `EPERM`), with one reported unhandled socket error; `api.log` |
| `pnpm --filter @jobguard/web exec vitest run app` | 0 | **74 tests / 9 files**; `web.log` |
| `pnpm --filter @jobguard/db exec vitest run src/demo-seed.test.ts test/verify-evidence-pack-cli.test.ts` | 0 | **7 tests / 2 files**, unit/CLI only; `db-unit.log` |
| `pnpm openapi:check` | 1 | tsx CLI IPC socket prohibited (`listen`, `EPERM`), before comparison; `openapi.log` |
| In `apps/api`: `node --import ./node_modules/tsx/dist/loader.mjs src/generate-openapi.ts --check` | 0 | Same source/committed-OpenAPI comparison through Node's loader, without the CLI IPC server; `openapi-node.log` |

No test exclusion, skip, retry wrapper or timeout increase was introduced to hide either the authorization failures or the sandbox's health-test restriction. The source-directory unit invocations avoid counting compiled `dist/` duplicates. The API suite remains a reported local failure, not a claimed full pass.

## Change scope, compatibility and remaining evidence

Repository changes are exactly this new receipt and one exact allow-list path added to **this lane only** in `config/agent-lane-assignments.json`. An initial SHA-256 snapshot of existing lane files and inspected shared-prerequisite files confirms only the lane registration changed among them. No runtime, migration, schema, UI, money, provider, deployment, approval, alert or timeout change; no new data migration or backwards-compatibility impact. Existing migration **0046** stays unchanged. The dispatcher commit message is `/private/tmp/jg-msg-m4-7-s-r3.txt`.

**Not run locally:** PostgreSQL integration (`pnpm test:db`), migrations (`pnpm test:migrations`), browsers (`pnpm test:e2e`, including both projects), full root `pnpm test` (includes PostgreSQL), clean install, secrets/dependency scans, model evaluation or live providers. This sandbox cannot bind localhost or start PostgreSQL. **Database, migration and browser suites run in GitHub CI after the dispatcher pushes.** No new-head CI was retrieved or asserted; prior CI receipts apply only to their recorded heads. No screenshots/traces were generated. No real data, bank credentials, commercial sends, charges, spend or release was exercised.

Remaining: Ben authorizes/dispatches SBOX-SESSION-1; immutable creation-time ownership and feed enforcement are implemented with the required failing-first database/browser tests; new-head CI runs; a fresh Claude Opus response records the independent exact-commit verdict; a separate actor records technical acceptance. Green build and prior CI do not resolve P1. **Not independently verified, not accepted.**
