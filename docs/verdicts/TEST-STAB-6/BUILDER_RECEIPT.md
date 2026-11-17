# TEST-STAB-6 builder receipt

Builder: Codex (dispatch requested GPT-6.1 Sol, high reasoning). Builder evidence only: self-reviewed; not independently verified or technically accepted. RED lane, checking-system test. Issued 12 October 2026 by the dispatcher on the coordinator's 23:00 ruling; implementation follows the supplied work order.

Branch: `codex/sandbox/test-stab-6`. Clean starting HEAD and `origin/main`: `a54d46f6a80357ebf33043ac6135ef3e4d397f4e`, containing TRAIN-LANE-1 (#158). Read repository AGENTS.md and BUILD_PLAN.md §§2.1–2.4; this maintenance repair's acceptance criteria come from the dispatch. No commit, add, checkout, push or PR operation performed on this repository. Git-writing test operations occur only in temporary fixture repositories. The dispatcher owns the commit; this receipt cannot bind a verdict to a future commit.

## Problem and scope

The dispatch reports PR #156, GitHub Actions run [38311882779, attempt 1](https://github.com/ben2harwood-lgtm/jobguard/actions/runs/38311882779/attempts/1): `TL-P5 pass and refusal preserve objects refs index and worktree` failed `deepStrictEqual`; the object listings had 21 entries after and 22 before, differing only in `objects/maintenance.lock`. A rerun passed. This is supplied CI evidence, not a CI log retrieved or a local failure observed by this builder. The transient lock belongs to Git background auto-maintenance started during fixture history creation.

First working-tree change: exactly one compact lane entry, `test-stab-6`, between `test-stab-5` and `train-lane-1`, with the exact dispatched branch, receipt, note and three allowed paths. Shared registry ownership is limited to that line.

The only test-file change is these two config calls immediately after the existing user.email setup in `fixture()`:

```diff
     git("init", "-b", "main"); git("config", "user.name", "Train test"); git("config", "user.email", "train-test@example.invalid");
+    git("config", "gc.auto", "0");
+    git("config", "maintenance.auto", "false");
     git("config", "commit.gpgsign", "false"); git("config", "merge.gpgsign", "false");
```

Before: no fixture-local gc.auto or maintenance.auto setting. After: fixture-local `gc.auto=0` and `maintenance.auto=false`. Initialization applies before any fixture commits; independent cached fixtures inherit the settings by copying the seed repository. No `gc.autoDetach` setting was added: disabling automatic maintenance at its entry points needs no detach override.

**No assertion, snapshot or file-name filter changed.** No file name, including `maintenance.lock`, is ignored or special-cased. All original object paths, refs and status remain snapshotted. No other test, security test/list, `apps/api/src/auth/context-boundary.test.ts`, lint implementation or workflow changed. No product code, dependency, migration, API, prompt/model/schema or web workflow changed; C1/C2/C7 introduce no new UI or endpoint. No data migration, backwards-compatibility impact, external action or operational alert. Product authorization, money, tenant and audit invariants are unaffected; the checking-system guarantee is preserved.

## Unfixed maintenance probes

Before adding the two config lines, ran five sequential focused TL-P5 processes with maintenance enabled through inherited command-scope environment configuration (no fixture-local config edit):

```sh
GIT_CONFIG_COUNT=2 \
GIT_CONFIG_KEY_0=maintenance.auto GIT_CONFIG_VALUE_0=true \
GIT_CONFIG_KEY_1=gc.auto GIT_CONFIG_VALUE_1=1 \
node --test --test-name-pattern TL-P5 tools/agent-lane-boundary-train.test.mjs
```

Exit codes for runs 1–5: `0, 0, 0, 0, 0` (0/5 failed). Each process selected one test; these were not 43-test runs.

Then ran five further sequential focused processes with the same first two settings plus:

```sh
GIT_CONFIG_COUNT=4 \
GIT_CONFIG_KEY_0=maintenance.auto GIT_CONFIG_VALUE_0=true \
GIT_CONFIG_KEY_1=gc.auto GIT_CONFIG_VALUE_1=1 \
GIT_CONFIG_KEY_2=maintenance.strategy GIT_CONFIG_VALUE_2=incremental \
GIT_CONFIG_KEY_3=maintenance.loose-objects.auto GIT_CONFIG_VALUE_3=1 \
node --test --test-name-pattern TL-P5 tools/agent-lane-boundary-train.test.mjs
```

Exit codes for runs 1–5: `0, 0, 0, 0, 0` (0/5 failed). Total 0/10 local probe runs failed. **The flake did not reproduce quickly in this sandbox.** No local differing object entry was observed; the reported differing entry `objects/maintenance.lock` is from the supplied CI evidence above. No failure has been invented. Probe logs and exit-code JSON are under `/private/tmp/jg-test-stab-6/before-*`; those temporary artifacts are not committed. Forced configuration applied only to these subprocesses, not the fixed runs.

## Environment and limits

Existing installed dependencies used; no install command or package download performed. Node `v24.17.0` (existing environment; `.nvmrc` says `24.15.0`), Git `2.50.1 (Apple Git-155)`, cached pnpm `10.28.1` verified with `COREPACK_ENABLE_NETWORK=0 corepack pnpm --version` (exit 0). Initial bare `pnpm --version` stalled and was interrupted (exit 130); subsequent pnpm commands use the pre-existing `/private/tmp/jg-train-pnpm-bin/pnpm` Corepack shim with network disabled, including child pnpm commands. No clean reinstall is claimed.

All test processes run sequentially. The work order permits Node tests only under its memory limit, so root `pnpm test` (which also launches Vitest), package Vitest suites and live-model evaluation are not run here. PostgreSQL, migration, MinIO and browser suites remain required in GitHub CI: the sandbox cannot start PostgreSQL or bind localhost. No database or browser failure is disguised as a pass. Evaluation is inapplicable to this unchanged AI behavior. Missing GitHub and independent review evidence remains a hold for acceptance.

## Twenty consecutive fixed runs

Exact command, once per process, twenty times in sequence with no other test process running:

```sh
node --test tools/agent-lane-boundary-train.test.mjs
```

| Run | Exit code | Tests / passes / failures / skips |
| --- | --- | --- |
| 01 | 0 | 43 / 43 / 0 / 0 |
| 02 | 0 | 43 / 43 / 0 / 0 |
| 03 | 0 | 43 / 43 / 0 / 0 |
| 04 | 0 | 43 / 43 / 0 / 0 |
| 05 | 0 | 43 / 43 / 0 / 0 |
| 06 | 0 | 43 / 43 / 0 / 0 |
| 07 | 0 | 43 / 43 / 0 / 0 |
| 08 | 0 | 43 / 43 / 0 / 0 |
| 09 | 0 | 43 / 43 / 0 / 0 |
| 10 | 0 | 43 / 43 / 0 / 0 |
| 11 | 0 | 43 / 43 / 0 / 0 |
| 12 | 0 | 43 / 43 / 0 / 0 |
| 13 | 0 | 43 / 43 / 0 / 0 |
| 14 | 0 | 43 / 43 / 0 / 0 |
| 15 | 0 | 43 / 43 / 0 / 0 |
| 16 | 0 | 43 / 43 / 0 / 0 |
| 17 | 0 | 43 / 43 / 0 / 0 |
| 18 | 0 | 43 / 43 / 0 / 0 |
| 19 | 0 | 43 / 43 / 0 / 0 |
| 20 | 0 | 43 / 43 / 0 / 0 |

All twenty exit codes are 0; all twenty logs independently report 43 tests, 43 passes, 0 failures and 0 skips (860 test executions). The command uses the entire test file, not a name selection. Logs are `/private/tmp/jg-test-stab-6/after-01.log` through `after-20.log`; per-run exit codes are in `after-results.json`. These are local test executions, not twenty CI runs.

## Additional executed checks

Every pnpm command below uses `PATH=/private/tmp/jg-train-pnpm-bin:$PATH COREPACK_ENABLE_NETWORK=0`. Check processes also have `LANE_BASE_REF=origin/main`. No command changes the lint, comparison base or assertions to manufacture a pass.

| Command actually run | Exit | Actual result |
| --- | --- | --- |
| `node --test tools/agent-lane-boundary-train.test.mjs` (additional run after the twenty) | 0 | 43 tests, 43 passes, 0 failures, 0 skips |
| `node --test tools/agent-lane-boundary.test.mjs` | 0 | 23 tests, 23 passes, 0 failures, 0 skips; existing file unchanged |
| `node --test --test-concurrency=1 tools/*.test.mjs` (expanded to all nine files in sorted order) | 0 | 85 tests, 85 passes, 0 failures, 0 skips; entire Node suite, not the root Vitest suite |
| `pnpm typecheck --concurrency=1 --no-daemon` | 0 | 7/7 Turbo tasks successful; 7/7 cached, not a fresh compiler run |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1 --no-daemon` (initial run) | 1 | Core purity executed and passed (132 TypeScript files); lane step refused self-comparison before remaining root checks |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (initial run) | 1 | `Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.` |
| `pnpm build --concurrency=1 --no-daemon` | 0 | 7/7 tasks successful, 2/7 cached; remaining 5 executed, including API and production Next build |
| `pnpm openapi:check` | 1 | tsx CLI's IPC listen failed `EPERM` before schema comparison; sandbox restriction |
| `pnpm turbo run lint --concurrency=1 --no-daemon` | 0 | Supplementary package lint: 7/7 successful, 7/7 cached; not a full root-lint pass |
| `node tools/money-arithmetic-lint.mjs` | 0 | Remaining root money arithmetic check passed |
| `node tools/commercial-boundary-lint.mjs` | 0 | Remaining root commercial boundary check passed |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same unchanged OpenAPI generator and committed-schema comparison executed successfully through Node's loader, avoiding the tsx CLI IPC server |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1 --no-daemon` (retry after external main advancement) | 0 | Root checks executed and passed; 7/7 package lint tasks successful, 7/7 cached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (same retry) | 0 | Exact `test-stab-6` lane; three working-tree paths, all allowed |
| `git merge-base --is-ancestor d19c9ba origin/main` | 0 | Required base ancestor present |
| `git diff --check` | 0 | No whitespace errors |

At the initial lint runs, `HEAD` equalled `origin/main`; the unchanged checker rejected that identical commit range. Subsequently `origin/main` advanced externally to `96f051f61cbb64081aba8881afe29ca74cd32155` (PR #160, ENT-10c), while this worktree's HEAD stayed at its original `a54d46f...` base. Both requested lint commands were then rerun with the same `LANE_BASE_REF=origin/main` and passed. The lane result reports that new base, original HEAD, `comparison: "merge-base"`, and exactly the three assigned paths. No Git-writing command, older comparison base, synthetic commit or checker override was used to change the outcome.

The first final-scope inspection used a two-endpoint diff against the moving `origin/main` and exited 1: it included the newly merged ENT-10c documentation and lane line as base-only differences. Those were not working-tree edits and were not deleted or changed by this builder. Repeated self-inspection against immutable starting HEAD exited 0: existing `selectLane` and `matches` functions selected `test-stab-6` and confirmed the actual tracked/untracked working-tree changes are exactly its three assigned paths. Full-byte comparisons against the immutable starting commit also passed for the two config insertions and single lane insertion. This narrow scope inspection is distinct from the full lint retries, which independently exited 0.

Build emitted Next's existing multi-lockfile workspace-root warning and Turbo `IO error: Operation not permitted` warnings, but completed with exit 0 and 7 successful tasks. No build-generated tracked file changed. Cached logs display paths from another worktree; cached checks are identified explicitly rather than claimed as fresh executions here. OpenAPI's ordinary launcher still needs its normal CI run; the loader result is an executed equivalent comparison, not a claim that the launcher passed.

Temporary evidence: `/private/tmp/jg-test-stab-6/extra-train.log`, `old-lanes.log`, `node-tools.log`, `typecheck.log`, `lint.log`, `lint-lanes.log`, `build.log`, `openapi.log`, `package-lint.log`, `money-lint.log`, `commercial-lint.log`, `openapi-loader.log`; `checks-results.json`, `supplementary-results.json` and `retry-results.json` contain actual argv and exit codes; `lint-retry.log` and `lint-lanes-retry.log` preserve the successful retries. These local artifacts are not part of the commit.

## Self-review and handoff

Builder source-inspection completed against the immutable starting `origin/main` commit (`a54d46f6a80357ebf33043ac6135ef3e4d397f4e`), also the unchanged worktree HEAD:

- Removing exactly the two inserted fixture config lines restores the full test file byte-for-byte to the base; no snapshot, assertion, file-name filter, title, expected value or other test changed.
- Removing exactly the new registry line restores all existing registry bytes; JSON parses, and lane order is `test-stab-5`, `test-stab-6`, `train-lane-1`.
- Actual changed-file set is exactly `config/agent-lane-assignments.json`, `tools/agent-lane-boundary-train.test.mjs`, and this receipt. No security test/list, rule 11 credential literal, rule 12 standing source/hash test, workflow or product source added or changed. The temporary byte comparison is self-review evidence, not a new standing test.
- Test execution evidence is distinct from this self-review and from independent model verification. No independent verdict or acceptance is claimed.

Intended conventional commit subject and body are written to `/private/tmp/jg-msg-test-stab-6.txt`. No repository commit was made; HEAD remains the recorded base.

Remaining gates: dispatcher commit and GitHub's full checks, including root lint/lane lint on a non-identical commit range, normal OpenAPI launcher, Vitest, database/migrations and browser regressions. After GitHub's run, a fresh Claude Opus review AND a separate Codex Sol check must both confirm the committed diff is exactly the two fixture config lines plus the lane line and receipt, bound to the exact commit. Separate technical acceptance and dispatcher-owned commit/push/merge remain outstanding. This builder receipt is neither of those verdicts and does not close the RED review gate.
