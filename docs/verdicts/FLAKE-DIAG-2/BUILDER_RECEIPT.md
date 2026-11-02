# FLAKE-DIAG-2 builder receipt

## Session block

- Order: FLAKE-DIAG-2, Track D, issued 25 October 2026.
- Builder: Codex; session/thread `01a1733b-a11c-7213-bc44-add8e08bfbb8`.
- Date: 2026-10-25 (UTC).
- Workspace: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/flake-diag-2`.
- Branch: `codex/sandbox/flake-diag-2`.
- Inspected HEAD and `origin/main`: `28416d1ea7e154f2353d56e28f30db34e06e36ab`.
- Delivery: working-tree edits; dispatcher owns commit/push. No git writes performed.
- Status: source-inspected and locally checked as recorded below; browser verification, independent exact-commit verdict and separate acceptance remain outstanding. This receipt is not an independent review or acceptance.

## Cause: test synchronization

The test reloads while the `complete` POST is still pending. Playwright's click waits for dispatch/actionability, not the asynchronous command's response. The following independent API GET checks verified upload state but originally never checked completion. It can finish before the completion write, allowing reload to abort the outstanding browser POST. The eventual assertion correctly sees an incomplete stage.

Read-only evidence: dispatcher-provided run 40188050363, artifact `playwright-evidence-1/test-results/CH-2-watchdog-panels-requi-708c1-ative-inputs-across-clients-mobile-360/trace.zip`, under `/Users/benharwood/.local/share/full-steam/jg-runs/flake-diag-2-traces/`. Inspected its `test.trace`, `0-trace.trace`, `0-trace.network` and referenced JSON resources with Python zipfile; no trace server or browser was started. The failure is `assertReadable` line 16 reached immediately after reload at original line 95.

Trace times below are monotonic milliseconds from that recording:

| Event | Time | Evidence |
| --- | --- | --- |
| Finalize POST starts | 31792.306 | 200 response after 418.966 ms; verified upload, `completion: null` |
| Complete POST starts | 32659.901 | Request body has `action: complete` and the verified evidence/scope identities |
| Complete button click returns | 32660.408 | Click finishes while POST remains outstanding |
| Independent proof GET starts | 32665.122 | 200 after 5.049 ms; verified upload, `completion: null` |
| Reload starts | 32672.974 | Only 13.073 ms after completion request start |
| Completion POST outcome | — | Recorded status -1, `net::ERR_ABORTED`, no response body |
| Destination proof GETs | 32779.321, 33011.943 | Both 200 with `completion: null` |
| Stage assertion fails | 43124.714 | `In progress` persists throughout the existing 10-second expectation |

This is evidence of navigation racing an unacknowledged write, not a cached read after confirmed completion. A browser abort alone does not prove that a server transaction rolled back; the trace establishes that the POST was unacknowledged and subsequent reads still lacked completion. No environmental fault is required to explain this interleaving. The supplied trace diagnoses this occurrence; older #293 failures were not separately inspected.

Source checks support the readiness boundary:

- `apps/web/app/ui/proof-stage.tsx`: the command awaits POST success and its JSON response before updating `view`; `stage-status` is `Complete` only when that view contains a completion. There is no optimistic completion. Its background reads already use `cache: no-store`.
- `apps/web/app/api/jobs/[id]/proof/route.ts`: POST awaits the application command before answering.
- `apps/api/src/proof/proof.application.ts`, `packages/db/src/proof-repository.ts`, `packages/db/src/tenant-context.ts`: completion is awaited, the command response is captured transactionally, and `withTenant` awaits COMMIT before returning. The rendered completion is therefore the real command acknowledgement for this flow.

The conditional requirement to fix stale application state after a completed action does not arise in this trace: completion was never acknowledged before reload and the persisted view is incomplete. No speculative application change is needed.

## Fix and scope

`apps/web/e2e/CH-2.spec.ts` now waits for `stage-status` to equal `Complete` immediately after clicking the completion action, before the persistence GET or any navigation. It then requires the persisted completion to have an ID and `reviewRequired: false`. This gives a failed command an immediate failure at the action boundary and prevents navigation from aborting an in-flight command. The subsequent reload, deep-link and second-client assertions remain intact.

Only the spec, `config/lanes/flake-diag-2.json` and this receipt are delivered. The lane file grants only the spec and receipt; its own path is implicitly editable by its branch. No retries, skips, sleeps, timeout changes or weakened assertions. No migration, routing, shared types, application code, dependency or shared lane-register change. No commercial-policy, authorization, tenant-isolation, money or audit behavior change; existing persisted-history requirements are strengthened. No new operational alerts or backwards-compatibility impact. Reverting this spec change requires no data rollback.

## Local checks

Existing installed dependencies only: Node `v24.17.0`, cached pinned pnpm `10.28.1`. Commands use `PATH="/private/tmp/jg-flake-diag-2-bin:$PATH"`; that temporary launcher points at `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. Initial default `pnpm --version` stalled in automatic package-manager selection and was interrupted (130); no install/download command was issued. An overbroad read-only cache-location search was also interrupted (130) once the known cached executable was located.

Logs: `/private/tmp/jg-flake-diag-2-*.log`.

| Command | Result |
| --- | --- |
| `pnpm typecheck` | PASS, exit 0; 7/7 tasks, 6 cached |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1; core purity passes, lane guard refuses self-comparison before later steps |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1; `Missing branch or self-comparison range; refusing a misleading pass.` |
| `pnpm exec turbo run lint` | PASS, exit 0; 7/7 tasks, 0 cached |
| `node tools/money-arithmetic-lint.mjs` | PASS, exit 0 |
| `node tools/commercial-boundary-lint.mjs` | PASS, exit 0 |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 app/ui/workspace-lifecycle.test.ts app/page.test.tsx` | PASS, exit 0; 2 files / 16 tests |
| `pnpm build` | PASS, exit 0; 7/7 tasks, 6 cached; 1m40s |
| `pnpm openapi:check` | Exit 1; tsx CLI IPC socket `listen EPERM`, before generator execution |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | PASS, exit 0; same checker through the installed loader, no schema write |
| `git diff --check` | PASS, exit 0 |
| Supplemental Node working-tree scope check using the real `loadLanePolicy`, `selectLane`, `lanePathAllowed` | PASS, exit 0; exactly the three delivered files; not a substitute for standard lane lint |

Build emitted Next workspace-root, CSS/autoprefixer, Nest/file-type optional-module and computed-dependency warnings, plus restricted shared-cache write warnings; compilation and the full production build succeeded. No warning was silenced or dependency changed.

The changed file is a Playwright spec excluded from Vitest; it has no directly applicable web unit suite. The existing workspace-navigation tests and scaffold unit above are supplementary only and do not prove the browser race fixed. No implementation-mirroring unit test was added for a four-line e2e-only change.

Lint is not claimed green: HEAD equals `origin/main` because this sandbox must leave changes uncommitted. The guard refuses that range before inspecting working-tree edits. Dispatcher must commit and rerun both prescribed lint commands against `origin/main`. Package lint and the other root boundary checks are recorded separately, without bypassing or changing the guard.

## Reviewer evidence plan and remaining gates

Database and browser suites were NOT RUN: dispatcher explicitly states this sandbox cannot start PostgreSQL or bind localhost. Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and `pnpm test:e2e` are not claimed passed. No AI/prompt/schema change; eval is inapplicable. No fresh dependency install performed.

Outside the sandbox, with installed browser/dependencies, run from repository root against the dispatcher's exact commit:

```sh
pnpm build
CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --repeat-each=30 --workers=1 --retries=0 e2e/CH-2.spec.ts
```

This is 30 headless repetitions of each of the four CH-2 tests (120 tests), one worker and zero retries. The production build is required because CI mode starts `next start`. Global setup supplies the real PostgreSQL fixture. Preserve the Playwright report and any failure traces, and bind results to the dispatcher's commit. Check that the completion response/UI acknowledgement precedes the proof GET and reload, and persisted completion survives reload, deep link and the second browser context. Also run the standard CH-2 desktop project and CI's mandatory regressions.

For an additional controlled race check, a reviewer can pause only the complete-action response in a temporary Playwright route: the modified flow must remain on the current page until released, then verify completion and reload. A rejected completion must fail the pre-reload `Complete` assertion; increasing timeouts or repeating the action is not a fix. This controlled experiment has NOT been executed here.

Independent checker verdict for the exact committed diff, separate acceptance, the 30-repeat browser evidence and CI checks remain release/acceptance holds. Builder makes no acceptance, merge or release claim.
