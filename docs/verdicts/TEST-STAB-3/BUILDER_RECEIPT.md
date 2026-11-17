# TEST-STAB-3 builder run receipt

Date: 7 October 2026. Branch: `codex/sandbox/test-stab-3`.
Base/unchanged HEAD: `a5ed99a8f7b4e76925c35297dda0d06d6f8834ab` (`origin/main`).
Working-tree handoff only: no commit, staging, checkout, push, merge or PR.

## Change and source inspection

First change: append exactly the requested `test-stab-3` lane to `config/agent-lane-assignments.json`; all existing entries preserved.

Only executable source changed: `apps/web/e2e/SBOX-resume.spec.ts`. Each wait is registered before its click through `Promise.all`, matches the exact job-specific pathname and POST method, and requires `response.ok()` before navigation.

| Click → navigation | Original lines | Updated lines | Successful response awaited |
| --- | --- | --- | --- |
| Record practice acceptance → `/jobs/${jobId}#quote` | 71 → 72 | wait 71–74; click 73 → goto 75 | `POST /api/jobs/${jobId}/quotes/acceptance` |
| Start this practice job → `/jobs/${jobId}#work-proof` | 76 → 77 | wait 79–82; click 81 → goto 83 | `POST /api/jobs/${jobId}/quotes/activation` |

Inspected every click and navigation/reload in the file. These are the only unguarded mutating click → navigation pairs. `confirmed()` already waits for persisted quote revision `1` (lines 31–32) before returning to callers that navigate. Other navigations have no intervening mutation. Request paths/methods were checked against the quote editor and the existing Next POST handlers.

All 46 existing assertion calls are unchanged, verified with the TypeScript parser against HEAD. No assertion weakening, success API interception, retries, timeout changes, test skips, application changes or other spec changes.

## Commands and results

Dependencies were already installed; no install/update command was run. Node: `v24.17.0`; cached pinned pnpm: `10.28.1`. Checks used `PATH=/private/tmp/jg-test-stab-3-bin:$PATH` and `COREPACK_ENABLE_NETWORK=0`; that temporary launcher invokes the existing cached `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. The ambient pnpm launcher stalled on two version probes; both were interrupted (exit 130), then replaced for this run by the cached pinned launcher. No package or repository dependency changes.

| Command | Exit | Evidence |
| --- | --- | --- |
| `pnpm --version` (cached launcher) | 0 | `10.28.1` |
| `pnpm typecheck` | 0 | 7 tasks successful; 6 cached, changed web task executed |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed; lane check refused identical HEAD/base before package lint |
| `pnpm lint:lanes` | 1 | `Missing branch or self-comparison range; refusing a misleading pass.` |
| `pnpm turbo run lint` | 0 | Supplementary package checks: 7 successful, 6 cached; does not replace root lane check |
| `node tools/money-arithmetic-lint.mjs` | 0 | Money arithmetic boundary passed |
| `node tools/commercial-boundary-lint.mjs` | 0 | Commercial boundary passed |
| `pnpm turbo run test --filter='!@jobguard/db'` | 0 | 12 tasks successful, 11 cached; web freshly ran 63 tests in 8 files; unchanged package tests reused Turbo cache |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | 0 | 19 tests passed |
| `pnpm --filter @jobguard/db exec vitest run test/verify-evidence-pack-cli.test.ts` | 0 | 4 offline CLI tests passed; no database started |
| `pnpm openapi:check` | 1 | tsx CLI could not bind its IPC socket: `listen EPERM` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same OpenAPI generator/check through Node import hook, avoiding the CLI socket |
| `pnpm build` | 0 | 7 tasks successful; 6 cached, production Next build executed (5m9s); existing CSS/workspace-root warnings |
| `node --input-type=module` (inline source verification) | 0 | 46 unchanged assertion calls, exactly one appended lane, all working-tree paths allowed by selected lane; supplementary verification only |
| `git diff --check` | 0 | No whitespace errors |

Root lint and lane lint cannot pass before the dispatcher commits: HEAD and `origin/main` are identical, and this sandbox prohibits Git writes. The full lane checker was preserved; no alternate comparison ref or permissive fallback was used. Turbo also reported sandbox I/O warnings while successful tasks returned exit 0.

## Not run and remaining gates

- Browser suites, including `SBOX-resume.spec.ts` in both `mobile-360` and `desktop`: sandbox cannot bind localhost or start PostgreSQL. GitHub CI must run both projects after dispatcher commit/push: `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop SBOX-resume.spec.ts`. No browser pass is claimed.
- PostgreSQL, migration and full root `pnpm test` suites: sandbox restriction; no migrations or database changes. The root test command includes the database suite and lane tests that perform Git writes. Those lane unit tests were not invoked under the explicit no-Git-writes instruction.
- Clean reinstall, live providers, live-model evaluations, production mode, real sends, spending, real customer data and decision approvals: not performed; outside this spec-only synthetic task.
- Independent exact-commit verdict and separate technical acceptance: pending after dispatcher commit and CI. This is builder source/test evidence, not independent review or acceptance.

Migration: none. Affected invariants: C6 real JobGuard success APIs and C7 persisted lifecycle/scope assertions retained; tests wait for mutation success before navigating. No changed contracts, runtime behaviour, backwards-compatibility impact or operational alerts. Adjacent work: none.

Intended conventional commit subject/body written to `/private/tmp/jg-msg-test-stab-3.txt`.
