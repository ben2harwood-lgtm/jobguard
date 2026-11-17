# M4-1-S-R — builder receipt, repair 14

Date: 2026-10-05. Builder: **GPT-6.1 Sol via Codex**.
Base: **023c1bf28ad3926a52e447bf79992c6facce6e23** (`023c1bf`), branch `codex/sandbox/m4-1-s-repair`, PR #103.
**Not independently verified, not accepted.** This is a builder run receipt, not a verdict. The dispatcher commits and pushes; a fresh Claude Opus verdict must bind to the resulting exact commit, followed by separate acceptance. No git commands were issued by this builder; the required lane/lint scripts internally perform read-only git inspection. No commit, push, review, acceptance or merge was performed.

Read first: `/private/tmp/jg-m41-r14-solverdict.md` (REPAIR, exactly two current findings), repository `AGENTS.md` rev 3.0, `BUILD_PLAN.md` §2 including C1–C8, and the M4-1-S receipts, especially repairs 11–13 and their frozen scope.

## Findings → failing-first evidence → fixes

### P2-1 — a committed command can be reported as refused

Tests were written and executed before either production fix:

- `apps/web/app/lib/recovery-case-routes.test.ts:27`: both real Next POST handlers call the real application with a simulated committed repository write. The subsequent application list throws a refusal-looking stale-revision error. Both responses must be HTTP 503 with `recovery-command-error.v1`, `RECOVERY_COMMAND_OUTCOME_UNKNOWN`, and `outcome: unknown`; the existing client classifier must retain an unknown outcome. Replaying the identical body/command ID returns the original affected case and a valid saved answer, with exactly one simulated effect. Red: **409 received instead of 503**, both routes. Unexpected write/commit failures also returned **400 instead of 503**, both routes. Malformed input JSON remains a pre-commit 400 and invokes no command (passed before and after).
- `apps/api/src/recovery-case.command.application.test.ts:99` and `apps/api/src/recovery-case.application.test.ts:52`: each application post-commit read must throw the typed unknown error even when the read failure resembles a refusal. Red: original stale-revision Error escaped, with no unknown code.
- `apps/api/src/recovery-case.controller.test.ts:28`: both Nest POST paths must map uncertain/unexpected execution failures to the same typed 503 body. Red: ordinary POST threw a raw Error; eligibility returned 400.
- `packages/db/test/recovery-case-outcome.test.ts:11`: both repository post-commit reads must wrap failures; missing affected rows must also fail unknown instead of resolving undefined. Red: two original errors escaped and two promises resolved undefined. The transaction boundary here is stubbed; these are error-boundary unit tests, not evidence of PostgreSQL commits.

Fixes:

- `packages/db/src/recovery-case-repository.ts:21` defines `RecoveryCommandOutcomeUnknownError`; `:36` centralizes both repository answer reads in `committedCase`, invoked after the transaction resolves (`:74`, `:114`). Every failure, including a missing affected row, is typed unknown. Transaction, locking, durable command IDs, replay checks and accounting are unchanged.
- `apps/api/src/recovery-case.application.ts:25` wraps both application answer-building reads after the repository returns. `:50` exports the shared Next/Nest mapping: explicit known pre-commit domain/schema refusals retain 4xx; typed post-commit errors and unexpected database/uncertain-commit errors return the versioned 503 unknown body. Internal failure details are not exposed on the unknown path.
- `apps/web/app/api/jobs/[id]/recovery-cases/route.ts:12` and `apps/web/app/api/jobs/[id]/recovery-cases/eligibility/route.ts:6` separate request JSON parsing from execution/answer construction and use the shared mapping. `apps/api/src/recovery-case.controller.ts:16` and `:23` apply it to both Nest write paths too.
- The existing client unknown-outcome classifier/held-command path is preserved. Its previous lost-answer, same-ID retry, blocked-new-opening and exactly-one-simulated-case tests all pass in the complete web suite.

Supplementary real PostgreSQL regressions were added at `packages/db/test/recovery-cases.workbench.integration.test.ts:475` and `:488`: an opening and an eligibility revision really commit, an injected repository answer read then fails, and the identical command ID replays one persisted case/event or eligibility revision. These **were not executed locally** (red or green); they require the GitHub CI database environment. The route/application replay test is simulated and is not described as a real database integration.

### P2-2 — stale approval continues after job switch or unmount

`apps/web/app/ui/recovery-cases.behaviour.test.ts:810` adds five tests using the existing deterministic hook runtime and real component/button handlers. They cover job switch and unmount while step one is pending, a refused first step, an unknown first step, and the successful two-step action on the same job. Job-switch assertions also require no old-job case/message/state on the new job. Red: **two POSTs instead of one** after job switch, unmount and first-step refusal; the unknown and positive control already passed.

Fix: `apps/web/app/ui/recovery-cases.tsx:63` takes one ticket before step one, routes both awaits through `alive`, passes the same ticket to both sends, stops on abandonment, and proceeds only after a saved first-step result. `:37` and `:43` check ticket validity before starting a POST. The intentional stale approval still reaches its expected conflict on the same job. No lifecycle controls were added.

## Commands actually run

Logs: `/private/tmp/jg-repair14-logs/`. Commands below use existing dependencies; nothing was installed. Node **v24.17.0**, pnpm **10.28.1**, Vitest **4.1.11**, Next **15.5.25**.

The default PATH launcher was pnpm 11 and stalled while selecting the repository pin. Initial pnpm version/test-launch probes were interrupted (exit 130; no tests executed). A cached exact pnpm 10.28.1 was found at `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`; a temporary launcher in `/private/tmp/jg-repair14-bin` invokes it with Node. All final pnpm commands have `PATH=/private/tmp/jg-repair14-bin:$PATH`. No packages were downloaded. The stalled launcher generated a local `.pnpm-store` directory; it was moved intact to `/private/tmp/jg-repair14-launcher-store`, outside the reviewable tree.

| Command | Exit | Executed result |
|---|---:|---|
| Web `node_modules/.bin/vitest run app/lib/recovery-case-routes.test.ts app/ui/recovery-cases.behaviour.test.ts` (apps/web, before fixes) | 1 | 7 failed, 97 passed; 104 total, 2 files. Four server regressions and three stale-flow regressions failed for the expected reasons above. |
| API `node_modules/.bin/vitest run src/recovery-case.application.test.ts src/recovery-case.command.application.test.ts src/recovery-case.controller.test.ts` (apps/api, before fixes) | 1 | 4 failed, 24 passed; 28 total, 3 files. |
| DB `node_modules/.bin/vitest run test/recovery-case-outcome.test.ts` (packages/db, before fixes) | 1 | 4 failed; 1 file. |
| `TURBO_FORCE=true pnpm typecheck` | 0 | 7/7 tasks, 0 cached. |
| Initial `LANE_BASE_REF=origin/main pnpm lint` / `pnpm lint:lanes` | 1 / 1 | Correctly refused the launcher's three generated `.pnpm-store/v11/index.db*` files; the store was moved intact to temporary storage. No lane grant or check was weakened. |
| `LANE_BASE_REF=origin/main TURBO_FORCE=true pnpm lint` | 0 | Core purity, lane, exact money/commercial boundaries; 7/7 package lint tasks, 0 cached. |
| `pnpm lint:lanes` | 0 | Own exact lane passed, including the working-tree changes. |
| `TURBO_FORCE=true pnpm build` | 0 | 7/7 tasks, 0 cached; production Next build completed. |
| `pnpm --filter @jobguard/core exec vitest run src` | 0 | 369 tests, 34 source files. |
| `pnpm --filter @jobguard/api exec vitest run src` | 1 | 127 passed, 1 failed; 16 files. The unchanged health test needs socket binding and failed with `listen EPERM` at `0.0.0.0`; Vitest also reported its associated unhandled error. No test was skipped or modified to bypass this restriction. |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-case.application.test.ts src/recovery-case.command.application.test.ts src/recovery-case.controller.test.ts` | 0 | All 28 affected API tests passed, 3 files. This is supplementary evidence; it does not replace the failed full API run. |
| `pnpm --filter @jobguard/web test` | 0 | All 207 tests passed, 14 files (196 existing + 11 new). |
| `pnpm --filter @jobguard/db exec vitest run test/recovery-case-outcome.test.ts` | 0 | All 4 new repository error-boundary unit tests passed. |
| `pnpm openapi:check` | 1 | Existing tsx CLI wrapper could not bind its IPC socket (`listen EPERM`, `tsx-501/...pipe`). |
| `node --import tsx src/generate-openapi.ts --check` (apps/api) | 0 | Same source OpenAPI check via the Node loader, without CLI IPC; no generated-spec change. |

Turbo emitted sandbox IO/cache warnings while the actual uncached tasks completed. Next emitted its existing multiple-lockfile root warning. Neither required configuration changes.

## Scope, migrations, compatibility and remaining evidence

Only these two findings were repaired. No migrations, policy/model/prompt changes, external actions, grants, fee formula changes or deployment changes. `0018` and `0043` are untouched. Affected invariants: exact command replay/unknown outcomes (AGENTS §§5.3–5.4; C5) and abandonment of client operations without stale requests/state (C7). Unexpected command failures now return a typed 503 instead of misleading 4xx; legitimate schema/domain refusals keep 4xx. No new operational infrastructure or alerts were introduced.

The first working-tree edit updated **only** lane `m4-1-s-repair`: receipt pointer → this file; exact paths added for the two fixes: `apps/api/src/recovery-case.controller.ts`, `apps/api/src/recovery-case.controller.test.ts`, `apps/web/app/api/jobs/[id]/recovery-cases/eligibility/route.ts`, `apps/web/app/lib/recovery-case-routes.test.ts`, `packages/db/test/recovery-case-outcome.test.ts`. Existing shared recovery application/repository/UI ownership stays within this repair. No other lane changed.

Frozen follow-ups remain unmodified: caller authentication → **SBOX-SESSION-1**, held for Ben; missing lifecycle actions → **REC-UI-1**; `0018` reversal accounting → **REV-ACCT-1**; the recorded allocated-gross/eligible-net follow-up remains deferred. No founder-reserved work was performed.

Not run: PostgreSQL integration suites, `pnpm test:db`, `pnpm test:migrations`, browser suites (including both existing projects), full root `pnpm test`, clean reinstall, AI evaluation (no AI changes), live providers or deployment. This sandbox cannot bind localhost or start PostgreSQL. **Database and browser suites run in GitHub CI after the dispatcher pushes.** The two added real-database tests therefore await CI. The hook-runtime web tests prove component ordering and requests, not actual browser behavior. Mandatory suites and their timeouts/retry settings are unchanged.

Working-tree implementation and local evidence are ready for dispatcher commit. **Not independently verified, not accepted.** CI, a fresh exact-commit Claude Opus verdict, and separate technical acceptance remain required.
