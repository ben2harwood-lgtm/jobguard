# CH-2 builder receipt — round 10

7 October 2026. Branch `codex/sandbox/ch-2`, this worktree, existing PR #97. Starting and unchanged git HEAD: `940844a218d8069cda1b53e558b3c467debdc120` (round 9), following the Opus REPAIR verdict on `fb0561fb6ba7be78529a7fd60a0b6780fcd2234a`. This records working-tree repairs for the dispatcher to commit; it is builder evidence, not an independent verdict or technical acceptance.

## Finding → fix → test

| Finding | Fix / earlier coverage | Test and result |
|---|---|---|
| P1-1: a second page in the active demo session waits forever for “Start the demo”. | Deep-link that page to the already-running seeded Kitchen extension using the same browser context/session. Read its rendered job identity and verify its persisted live status. Keep every existing assertion, including changed-job 409 and exact conflict body. No timeout change. | Test-first source regression fails on the original helper call and passes after the deep link. Playwright discovers all eight CH-2 cases across `mobile-360` and `desktop`. Browser execution is **not verified locally**; both projects must run in CI. |
| P2-1: five Next adapters reported with incorrect identity-conflict status. | Fix PO revisions, supplier intake, goods receipts and inbox dismiss to return **409 / `{ "code": "IDEMPOTENCY_CONFLICT" }`**, matching Nest. **Round 9 already fixed the fifth route, proof**, including saved-response replay normalization; preserve that change. | Fifteen route-handler cases: changed payload, kind and job for each of the five routes. Each obtains the real error from real `claimCommandIdentity`, dispatches it through Nest's actual exception handler/filter, and feeds that same error into the actual Next POST handler. Four routes fail twelve cases with 400 before repair; proof's three cases already pass. All fifteen now pass. |
| P3-2: legacy plain-error replay branches become Nest 500s. | **Already covered by round 9:** both readiness legacy branches; supplier-match creation/correction; relevance-inbox prior-event check; discrepancy replay branches all throw `WatchdogError("IDEMPOTENCY_CONFLICT")`. No duplicate domain edit. Round 9 also normalized guarded supplier-fact/PO conflicts. | Retain round 9's six repository source regressions and its application/adapter proof/readiness replay tests. They pass in the final 179-test socket-free API suite. These are source and query-double/application tests, not fresh PostgreSQL execution. |
| P3-1: an old-app write also immediately loses to another open old-app writer of the same id. | Add one sentence beside the existing migration concurrency explanation: any previous-schema write, including a concurrent begin-upload retry, immediately conflicts, fails safe and must retry after the other writer ends. | Source-inspected documentation; migration 0096, trigger bodies and their earlier concurrency tests are unchanged. No new SQL execution claimed. |
| P3-3: two receipt claims are inaccurate. | Correct both claims below in this new receipt. Preserve historical receipts. | Read round-8/round-9 receipts and the supplied Opus verdict; real Next route tests establish the adapter correction. No historical receipt changed. |
| P3-4: hard-coded migration total and “0053 immediately before 0096” require manual updates after a renumber. | Registry and owner suite select CH-2/SH-1 by migration-name suffix and require SH-1 before CH-2 without requiring adjacency. Keep CH-2 last and the complete sorted registration. Counts use `MIGRATION_URLS.length`; registry compares all SQL files with the registry, and UIWIRE-12/bootstrap compare all applied names and totals with it. Owner/upgrade fixture select the pre-CH-2 schema by the selected migration name. | Three test-first source portability checks fail before repair and pass afterward. Registry's executed test verifies complete registration, uniqueness, ordering and count. Updated PostgreSQL assertions compile in typecheck/lint, but execution remains required in CI. No main merge performed. |

The route tests live in the existing in-lane `apps/api/src/watchdog-registry.test.ts`, alongside the earlier actual Next adapter tests. Database transport, synthetic session and workspace application are doubled for these adapter cases; no provider, socket, RLS, concurrent transaction or durable database effect is proved by them.

## Corrections to earlier receipts

The round-8 sentence “Next's existing message-based conflict mapping already returns the same 409/code”, and round 9's broader statement that the other guarded adapters already map it, were too broad. At `fb0561f`, revisions, intake, receipts and dismiss returned 400 and proof returned 500 for the claimer error. Round 9 fixed proof; round 10 fixes the other four. All five now have actual route-handler coverage for the real claimer conflict error.

The round-8 statement “PostgreSQL execution, including a red run on the starting SQL, is pending CI” was incorrect. CI executes the repaired SQL and cannot supply a red run on the starting SQL. The historical SQL red evidence is the earlier Opus reproduction on `5610a6f`, as identified by the supplied verdict. This round neither ran nor claims a red SQL control. Its new red evidence is the test-only unit/source run below.

## Tests first and commands actually run

Before implementation edits, `git diff --stat` showed **only** `apps/api/src/watchdog-registry.test.ts` changed: 53 added test lines. The red run exited **1: 16 failed, 56 passed / 72**. Twelve failures were the four routes returning 400 instead of 409; the other four were the browser setup and three migration-portability source checks. The proof route and round-9 replay/source regressions already passed. After the fixes, the same focused command exited **0: 72/72**.

Environment: Node **24.17.0**, pinned pnpm **10.28.1**, existing installed dependencies, macOS arm64. Pnpm commands used the existing `/private/tmp/ch2-bin` PATH shim. No install or download. Scratch logs: `/private/tmp/ch2-round10-*.log`.

| Command | Exit | Result |
|---|---:|---|
| `pnpm --filter @jobguard/api exec vitest run src/watchdog-registry.test.ts --maxWorkers=1`, test-only red | 1 | 16 failed / 56 passed, before fixes. |
| Same focused command, after fixes | 0 | 72 passed. |
| `pnpm typecheck`, initial | 2 | New test fixture used an overwritten `request_hash` property; TS2783. Replaced the fixture spread with explicit conditional fields; assertions unchanged. |
| `LANE_BASE_REF=origin/main pnpm lint`, initial | 2 | Same test-fixture TS2783; repository lane/purity/money guards passed. |
| `pnpm typecheck`, final source | 0 | 7 tasks successful; 4 cached. |
| `LANE_BASE_REF=origin/main pnpm lint`, final source | 0 | Repository guards and 7 tasks pass; no self-comparison refusal. |
| `pnpm lint:lanes` | 0 | CH-2 lane passes for existing branch range and working-tree paths. Final receipt-inclusive check recorded below. |
| `pnpm --filter @jobguard/api test --maxWorkers=1` | 1 | 179 passed / 1 failed. Unchanged `health.test.ts` cannot listen (`EPERM`), with its associated unhandled socket error. The script appends the argument after its OpenAPI command; its Vitest stage uses the script's default worker configuration. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts --maxWorkers=1`, before and after fixture correction | 0 each | 179 tests / 15 files. Invocation-only socket-test exclusion; no test file or CI skip changed. |
| `pnpm --filter @jobguard/web test --maxWorkers=1` | 0 | 63 tests / 8 files. |
| `pnpm openapi:check` | 1 | Installed `tsx` CLI tries an IPC socket and is refused with `listen EPERM`; no contract mismatch reported. |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | 0 | Same generator/check through a socket-free entry point; checked specification matches. OpenAPI unchanged. |
| `node --test tools/*.test.mjs` | 0 | 42 tests pass. |
| `pnpm --filter @jobguard/web exec playwright test --list --project=mobile-360 --project=desktop CH-2.spec.ts` | 0 | Eight tests discovered; listing only, no browser or server execution. |
| `pnpm build` | 0 | 7 tasks successful; 4 cached. DB/API rebuilt and Next production build completed. |
| `git diff --check` | 0 | No whitespace errors. |
| `node --input-type=module` (inline TypeScript AST comparison of HEAD/current CH-2 browser assertions) | 0 | All 66 original browser assertion expressions preserved verbatim; 3 added. |
| `git diff --exit-code HEAD -- packages/db/migrations/0096_watchdog_live.sql packages/db/src config/agent-lane-assignments.json apps/web/app/api/jobs/'[id]'/proof/route.ts docs/verdicts/CH-2/BUILDER_RECEIPT_round8.md docs/verdicts/CH-2/BUILDER_RECEIPT_round9.md apps/api/openapi.json` | 0 | Migration, all DB implementation, round-9 proof mapping, lane registry, historical receipts and OpenAPI preserved. |

Final receipt-inclusive `pnpm lint:lanes` and `git diff --check`: **exit 0 each**. No lane widening.

Turbo emits existing sandbox cache-write IO warnings; Next emits its existing multiple-lockfile/workspace-root warning. No clean pinned reinstall was performed.

## Scope and remaining verification

All changes are in the CH-2 lane. All earlier work, migration **0096**, the correct deadlock fix and Ben's **“keep triggers”** decision are retained. No new migration or rollback/forward-fix step: existing 0096 procedures still apply. No authorization, tenant isolation, audit, lock-order, identity ownership, money, provider or commercial-policy change. No new environment variable or operational alert. The compatibility change is that the four remaining deployed Next routes now return typed-conflict HTTP 409 instead of 400; exact successful replays remain unchanged. No assertion deleted or weakened, no timeout added or increased, no committed skip.

Not run and why:

- PostgreSQL integration, `pnpm test:db`, `pnpm test:migrations`, browser execution in both projects and full `pnpm test:e2e`: dispatcher states this sandbox cannot bind localhost or start PostgreSQL. No attempt to start those services; final committed/integrated-head CI must execute them. Browser changed-job coverage remains unverified until that run.
- Full root `pnpm test`: includes unavailable PostgreSQL suites. Available API, web and tool suites are reported separately. Core/AI suites were not repeated for this adapter/test/documentation repair; no core/AI implementation, prompt, model or extraction change.
- Clean install: dependencies already installed; downloads prohibited by the work order.
- Live providers/models, production mode, real sends, spending and decision approvals: outside this synthetic-only work order. None performed.
- Main/lane-registry merge, exact-commit independent verdict, technical acceptance and release checks: require the dispatcher/founder and a different model after commit. No merge or independent PASS/acceptance claimed here.

No git add, commit, checkout, push, merge or PR creation. Intended conventional commit subject/body written to `/private/tmp/jg-msg-ch-2.txt`. Dispatcher must commit these working-tree changes and obtain fresh CI and an independent verdict bound to that commit.
