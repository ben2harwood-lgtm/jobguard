# CI-TIME-1 — builder receipt

Date: 9 October 2026. Builder: Claude Sonnet 5.5. Branch: `codex/sandbox/ci-time-1`, cut from `origin/main` 3a06a02. Issued by the JobGuard integrator as routine work under BUILD_PLAN §2.1 ("repair a failed check without weakening it"), the same footing as TEST-STAB-4. Recorded as §14.3 **Discovered later**; not a §12.3 card.

## Why

`.github/workflows/ci.yml:15` limited the `checks` job to 20 minutes. Main's own `checks` job already takes 18m49s (run on 3a06a02, 8 Oct 17:47; 268 browser tests in 12.5 minutes, single worker). PR #106 (M4-5-S, head 1e271bf) adds database and browser tests. Its `checks` job was cut off at the 20-minute limit twice (run 37841298306, attempts 1 and 2), each time in the browser step with 240 of 282 tests passed and 0 failed, flaky or retried. Every earlier step passed (typecheck, lint, unit and database suites: core 1692, api 729, web 448, db 741; build). The job limit, not any test, is what fails. CH-1 and ENT-2 add more tests, so every later PR would hit the same wall.

## Change

One line in `.github/workflows/ci.yml` (the `checks` job):

```diff
-    timeout-minutes: 20
+    timeout-minutes: 30
```

Plus one new lane line in `config/agent-lane-assignments.json`, inserted in name order after `ci-repair` and before `d13-16-ids`, touching no other line:

```
"ci-time-1":{"branches":["codex/sandbox/ci-time-1"],"note":"Routine CI repair (job time limit only); no test or check changed.","allow":[".github/workflows/ci.yml","config/agent-lane-assignments.json","docs/verdicts/CI-TIME-1/**"]},
```

The lane has no `test` field: `tools/agent-lane-boundary-lint.mjs` does not require one, and `test-stab-4` and `sec-deps-*` are lanes of the same kind.

## What did not change

No test file, test body, per-test timeout, Playwright config or Vitest config changed. In the workflow, the steps, commands and order are the same. There is no `continue-on-error`, no skipped step and no retry. The `secrets` job is unchanged. `dependency-review` keeps its 10-minute limit. Nothing was weakened, skipped or removed.

## Commands and exit codes

Run in `.worktrees/ci-time-1` against the committed range `origin/main` (3a06a02) .. `b833b4e` (the lane commit and the ci.yml commit; the receipt commit that follows adds only this file, which the lane allows).

| Command | Exit |
| --- | --- |
| `pnpm install --frozen-lockfile` | 0 |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 (lane `ci-time-1`; files `.github/workflows/ci.yml`, `config/agent-lane-assignments.json`) |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 (7 of 7 turbo lint tasks successful) |
| `node -e JSON.parse(config/agent-lane-assignments.json)` | 0 |
| `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml")'` | 0 (`checks` 30, `dependency-review` 10, jobs: checks, secrets, dependency-review) |

A Python `yaml` import and a Node `yaml` package were not available in this environment, so Ruby's YAML parser was used for the parse check.

## Not verified

GitHub CI on the pushed head is the real proof: the `checks` job must complete green under the new 30-minute limit. That has not been run. No tests were run locally beyond the lint commands above.

Builder receipt only — not independently verified, not accepted.
