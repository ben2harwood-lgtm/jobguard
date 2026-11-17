# CI-TIME-2 — builder receipt

Date: 12 October 2026. Builder: Codex. Branch: `codex/sandbox/ci-time-2`. Inspected starting HEAD and `origin/main`: `fdf6d2a1ac81babc3149f69d75c2aa75c6c806ab`; starting working tree was clean. Issued by the JobGuard dispatcher under the coordinator's 12 October ruling. This working-tree handoff has no new commit: the sandbox makes `.git` read-only, and the dispatcher commits after the builder exits.

## Why

Dispatcher-supplied evidence (not independently retrieved by this builder): main on 11 October took 29m35s at `11f394b`, 28m35s at `168ec04`, and 22m10s at `a0963f4`. PR #142 attempt 1, run 38184154031, was cancelled at the 30-minute job limit in the browser step with all earlier steps green; attempt 2 passed in 28m57s. PR #138 passed in 29m17s. Healthy runs approach the existing job limit, and new pieces add tests. Raising the job limit permits the same checks to finish.

## Exact change

The entire workflow diff at `.github/workflows/ci.yml:15` is:

```diff
-    timeout-minutes: 30
+    timeout-minutes: 45
```

One compact lane line was inserted after `ci-time-1` and before `d13-16-ids`, with no other lane line touched:

```json
"ci-time-2":{"branches":["codex/sandbox/ci-time-2"],"note":"Routine CI repair (checks job time limit 30 to 45 minutes only); no test or check changed.","allow":[".github/workflows/ci.yml","config/agent-lane-assignments.json","docs/verdicts/CI-TIME-2/**"]},
```

No test, test file, step, command, step order, per-test timeout, Playwright configuration, Vitest configuration or check changed. No `continue-on-error`, skipped step or retry was added. No suite was split or reordered. `dependency-review` retains its 10-minute limit; `secrets` is byte-for-byte unchanged and still has no explicit limit. Builder assessment: this loosens or weakens no check; it changes only the overall `checks` job execution budget. The required independent checkers must assess that separately.

## Commands and exit codes

Dependencies were already installed according to the dispatcher; `pnpm install --frozen-lockfile` was not rerun and no packages were downloaded. Runtime: Node v24.17.0. `COREPACK_ENABLE_NETWORK=0 corepack pnpm --version` exited 0 and reported the pinned pnpm 10.28.1. For the pnpm commands below, `PATH=/private/tmp/jg-ci-time-2-bin:$PATH COREPACK_ENABLE_NETWORK=0` selected a temporary wrapper that executes `corepack pnpm "$@"`, including nested pnpm calls. No repository configuration was changed for this. The default launcher attempt `pnpm --version` stalled and was interrupted (exit 130).

Logs are under `/private/tmp/jg-ci-time-2-*.log`; they are local execution evidence, not independent verdicts.

| Command | Exit | Result |
| --- | --- | --- |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Expected pre-commit limitation: HEAD equals origin/main; the guard rejects a self-comparison range. Dispatcher must rerun after committing. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed; root lint then stopped at that same lane guard. This is not a root-lint pass. |
| `pnpm typecheck` | 0 | Seven successful Turbo tasks, all seven from cache. |
| `pnpm build` | 0 | Seven successful Turbo tasks; four cached and three executed, including API and production web build. |
| `pnpm openapi:check` | 1 | The tsx CLI attempted an IPC socket and failed with EPERM in this sandbox. |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | 0 | The same source OpenAPI generator/check passed using its loader without the CLI's IPC socket. |
| `pnpm turbo run lint` | 0 | Supplemental package lint: seven successful tasks, all cached; does not replace root lane lint. |
| `node tools/core-purity-lint.mjs` | 0 | 129 TypeScript files checked. |
| `node tools/money-arithmetic-lint.mjs` | 0 | Money arithmetic boundary passed. |
| `node tools/commercial-boundary-lint.mjs` | 0 | Commercial boundary passed. |
| `node --test tools/*.test.mjs` | 0 | 42 passed, none failed, cancelled or skipped. |
| `pnpm turbo run test --filter='!@jobguard/db' --force` | 1 | Partial unit run: core had 3,592 passes and two five-second timeouts in `src/receipt-allocation.test.ts` and its compiled copy; config had two passes and storage four. Turbo stopped before completing the remaining packages. |
| `pnpm --filter @jobguard/core exec vitest run src/receipt-allocation.test.ts dist/receipt-allocation.test.js` | 0 | Diagnostic isolation of the two files: 68 tests passed with unchanged test timeouts. Does not turn the earlier full-package failure into a pass. |
| `pnpm --filter @jobguard/ai test` | 0 | 72 passed. Synthetic fixtures, not live-provider verification. |
| `pnpm --filter @jobguard/web test` | 0 | 462 passed. Unit tests, not browser journeys. |
| `pnpm --filter @jobguard/api exec vitest run src` | 1 | 1,034 passed, four failed: health and two Nest SSO transport tests could not bind sockets; `auth/context-boundary.test.ts` hit its existing five-second timeout. Three EPERM socket errors were also reported. Tests were left unchanged. |
| `python3 -c 'import yaml; yaml.safe_load(open(".github/workflows/ci.yml")); print("Workflow YAML parsed")'` | 1 | Python YAML module unavailable. |
| `ruby -ryaml -e 'workflow = YAML.load_file(".github/workflows/ci.yml"); abort "wrong checks limit" unless workflow["jobs"]["checks"]["timeout-minutes"] == 45; abort "wrong dependency limit" unless workflow["jobs"]["dependency-review"]["timeout-minutes"] == 10; abort "secrets limit added" if workflow["jobs"]["secrets"].key?("timeout-minutes"); puts "Workflow YAML parsed; checks=45, dependency-review=10, secrets unchanged"'` | 0 | Workflow YAML parsed; job limits asserted. |
| Node inline `JSON.parse` plus imported `selectLane` for `codex/sandbox/ci-time-2` | 0 | Parsed the full lane registry and selected exactly `ci-time-2` with the requested branch, note and three allowed paths. |
| Python inline comparison against `git show HEAD:<path>` | 0 | Asserted exact workflow byte equality after the single 30-to-45 substitution; removing the one new lane line restores the original registry byte-for-byte. Asserted exact lane fields and adjacent name order. |
| `git diff -- .github/workflows/ci.yml` | 0 | Shows exactly the one changed workflow line above. |
| `git diff --check` | 0 | No whitespace errors. |

The root `pnpm test` (which includes real PostgreSQL), database/migration suites and browser journeys were not run: this sandbox cannot start PostgreSQL, bind sockets or run browsers. The limited local unit commands above are explicitly partial evidence; no mandatory GitHub CI step was made optional. No live services, real data, security scanner or network audit was invoked.

## Self-review and handoff

I read AGENTS.md and BUILD_PLAN.md §§2.1–2.4, including C8, before editing; there is no CI-TIME-2 card in the current BUILD_PLAN, so the issued work order supplies its exact scope. I compared the workflow and lane registry against the starting HEAD and verified the single substitution and single insertion byte-for-byte. The only repository changes are the workflow, the lane registration and this receipt. This preserves the fail-closed checks and earlier engineering guarantees without touching business behavior, schemas, migrations, public API contracts, dependencies or operational alerts. The lane registry is a shared serialized file; the dispatcher owns integration, and this builder edited only the issued line in this task worktree. The tradeoff is an additional 15 minutes available to a slow or stuck checks job. Browser-suite splitting and a secrets-job time limit remain separate later work under the issued order; BUILD_PLAN.md was not edited because it is outside this lane. Local timeout and sandbox failures remain disclosed holds for CI evidence, not permission to change tests.

The intended conventional commit subject and body are written to `/private/tmp/jg-msg-ci-time-2.txt`. No git-writing command, commit, push, PR, merge or acceptance was performed.

Remaining gates: dispatcher commit and committed-head lane/root lint; GitHub CI fully green on the exact pushed head; a fresh Claude Opus verdict and a separate Sol check, both bound to the exact commit, with findings labelled BLOCKING or LATER and an explicit statement whether ANY check is loosened or weakened. If either checker says yes, stop and refer to the coordinator. Separate technical acceptance and authorized merge remain outstanding. This receipt is not either independent checker result.

Builder receipt only — not independently verified, not accepted.
