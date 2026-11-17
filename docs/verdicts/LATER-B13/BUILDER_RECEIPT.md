Built by Codex (GPT-6); dispatched 13 Oct 2026; local work completed 16 Oct 2026.

# LATER-B13 — Readiness results and refusals

Status: partial validation, RED independent checks outstanding, PARK under decision 74. No acceptance, commit, push, merge, enablement or deployment. The addendum's requested Claude Sonnet builder attribution would be incorrect for this run; this receipt identifies the actual builder. No independent Claude/Opus or Sol-high verdict is claimed.

## Base and authority

Branch: `codex/sandbox/later-b13`. Initial and final HEAD: `4c407a6c81bd714a6875b7adf995812381d0fe57`.

The issued header cites `ca435eeb5791638c787c830d6ba717146f694539`, and the draft cites `0bbb5ddb`. Actual initial HEAD and origin/main were both `4c407a6c81bd714a6875b7adf995812381d0fe57`. Main wins. During the run the shared origin/main ref moved to `7ff452eeec1c523345d34715adfa3f8310062013`; no Git write was performed here. `git diff HEAD origin/main -- packages/db/src/readiness-repository.ts apps/api/src/readiness.controller.ts apps/api/src/readiness.contracts.ts packages/db/test/readiness.integration.test.ts BUILD_PLAN.md AGENTS.md` returned no differences. The task's cited main contracts therefore remain applicable without rebasing this branch.

Read AGENTS.md, the dispatch header/addendum, the standing handoff file, and BUILD_PLAN.md C5 (line 117), readiness inventory M2-6-S (line 430), CH-2 live guards (lines 456–466) and M2-6 (lines 2793–2804). The synthetic readiness route remains small-builder scoped. No contractor route, registry row, shared guard or replay harness was added or changed.

Installed Node: v24.17.0; `.nvmrc`: 24.15.0. Used the already-cached pinned pnpm 10.28.1 through Corepack with network disabled. Dependencies were already installed; no clean-install claim or install/download command was issued. Final validation used network-disabled Corepack. Vitest 4.1.11, TypeScript 5.8.3. PostgreSQL fixture version is the repository's embedded-postgres 16.10.0-beta.15, NOT executed here.

## Change and acceptance evidence

| Item | Implementation and evidence | Limit |
| --- | --- | --- |
| L060 / api-file-readiness#3 | New integration test `L060 api-file-readiness#3 existing plan from another job is refused, with a valid positive twin` obtains a real `planned_work_revision_id`, verifies the plan exists on the source job, inserts the valid same-job snapshot, then expects SQLSTATE `23503` and the exact FK constraint/table for the other job. | NOT RUN: PostgreSQL/sockets prohibited. The pre-existing test at readiness.integration.test.ts:3 used a snapshot ID as the plan reference; it remains unchanged. The new regression tests the intended existing schema guarantee, with no schema repair needed. |
| L067 / api-file-readiness#1 | New controller helper maps actual Zod failures to `400 {code:"INVALID_COMMAND"}` and unknown failures to `500 {code:"INTERNAL_ERROR"}`. Access and WatchdogError instances pass through to their existing typed filters. Eleven unit cases cover both mutations' invalid/valid inputs, authority before parsing, live/replay conflicts, and unknown errors on all three methods. | 11/11 unit cases passed. No readiness expected-revision field or stale-revision error exists on current main; that specific draft assertion remains unverified, without inventing a new contract. |
| L068 / api-file-readiness#2 | Repository advance creates a due-review Decision only when `!s.ready && !prior.rowCount`. The command identity and first result are still persisted for ready advances. Existing mandatory Decisions remain recorded. | Four new real-PostgreSQL tests cover ready no-op/replay/changed-payload/wrong-job conflicts, unresolved deduplication/concurrency, preservation of an earlier mandatory Decision, and command/Decision/audit rollback on a result-write failure. All four NOT RUN here. |

Tests were written before the implementation. The first executable unit behavior run reported **5 failed, 6 passed**: both malformed-command cases and all three unknown-error cases failed against the original controller. After implementation the same isolated source-resolved run passed **11/11**. After the forced build, the ordinary command without a temporary config also passed **11/11**. The new DB file contains five cases in total; its first failing run is **NOT RUN**, not an inferred pass or failure.

The temporary Vitest configuration only resolved workspace package names to source before dist existed. It did not change a shared harness, an expectation, a pin, or application behavior. The final ordinary run used normal built-package resolution. The unit suite uses service spies and does not claim to verify PostgreSQL, sessions, HTTP transport or tenant isolation.

## Checks actually run

All test invocations targeted this piece's one unit file with `--maxWorkers=2`; no simultaneous test/build, no whole-suite run. Before heavy commands memory was 73–77% free and available disk was 38–41 GiB, above the required thresholds. No DB/browser run was attempted, so no heavy-slot invocation was needed.

For the successful forced commands and final unit/OpenAPI commands, the shell prefix was:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/usr/local/lib/node_modules/corepack/shims:$PATH"
export COREPACK_ENABLE_NETWORK=0
```

The second PATH entry selects an existing Corepack shim, ensuring Turbo's child package-manager commands also use cached pnpm 10.28.1. No version check was disabled.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm --filter @jobguard/api exec vitest run src/readiness.later.test.ts --maxWorkers=2` (initial global launcher) | 130 | Interrupted before Vitest; pnpm 11 launcher was waiting on version selection. |
| `npm_config_manage_package_manager_versions=false pnpm --version` (followed in the same shell by memory/disk checks and the unit command) | 130 | Interrupted at version selection; no test started. |
| `pnpm --manage-package-manager-versions=false --version` | 130 | Interrupted; no version override was retained. |
| `COREPACK_ENABLE_NETWORK=0 corepack pnpm --version` | 0 | 10.28.1. |
| `COREPACK_ENABLE_NETWORK=0 corepack pnpm --filter @jobguard/api exec vitest run src/readiness.later.test.ts --maxWorkers=2` (before build) | 1 | One suite failed to load: `Failed to resolve entry for package "@jobguard/db"`; 0 test cases ran, because dist was absent. |
| `COREPACK_ENABLE_NETWORK=0 corepack pnpm --filter @jobguard/api exec vitest run src/readiness.later.test.ts --maxWorkers=2 --config /private/tmp/jg-vitest-later-b13.mjs` (before implementation) | 1 | 1 file, 5 failed / 6 passed / 11 total. |
| Same source-resolved unit command after implementation | 0 | 1 file, 11 passed / 11 total. |
| `COREPACK_ENABLE_NETWORK=0 corepack pnpm exec turbo run typecheck --force --concurrency=2` (initial PATH) | 1 | 0 successful / 3 scheduled; compiler checks did not start. Turbo selected global pnpm 11.8.0; version check refused the pinned-version mismatch. Log: `/private/tmp/jg-later-b13-typecheck.log`. |
| `pnpm --version` with final shim prefix | 0 | 10.28.1. |
| `pnpm exec turbo run typecheck --force --concurrency=2` with final prefix | 0 | 7/7 tasks successful, 0 cached, 24.994s. Log: `/private/tmp/jg-later-b13-typecheck-pinned.log`. |
| `pnpm exec turbo run lint --force --concurrency=2` | 0 | 7/7 tasks successful, 0 cached, 27.592s. Log: `/private/tmp/jg-later-b13-lint.log`. |
| `pnpm build --force --concurrency=2` | 0 | 7/7 tasks successful, 0 cached, 59.688s. Log: `/private/tmp/jg-later-b13-build.log`. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1 | Missing registered lane; exact refusal below. |
| `git diff --check` | 0 | No whitespace errors. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same missing registered lane; no registry edits. |
| `pnpm --filter @jobguard/api exec vitest run src/readiness.later.test.ts --maxWorkers=2` after build, final prefix | 0 | 1 file, 11 passed / 11 total. |
| `pnpm --filter @jobguard/api openapi:check` | 1 | tsx failed to bind its IPC pipe with EPERM before the OpenAPI comparison ran. STOP; no alternate invocation attempted. |
| `node tools/lint.mjs` | 1 | Core purity passed for 190 TypeScript files, then the lane check refused the missing registration. This is distinct from the green forced package lint above. |

Turbo emitted `WARNING IO error: Operation not permitted (os error 1)` for shared-cache I/O. The required compiler/build tasks executed with `--force`, and the summary showed zero cached tasks. No attempt was made to change permissions or redirect that cache to bypass the refusal.

## STOP / coordinator prerequisites

1. **Lane registration — `config/lanes/later-b13.json:1`.** Before: file absent; there is also no `later-b13` entry in `config/agent-lane-assignments.json`. After in this worktree: still absent. The coordinator must provide the registration; the builder did not edit the registry or lint rules. Exact refusal from `tools/agent-lane-boundary-lint.mjs:116`:

   `Lane boundary FAILED: Branch "codex/sandbox/later-b13" must match exactly one registered lane; found 0. Register the task before building.`

   Concrete proposed **coordinator-owned** after-content for the absent file:

   ```json
   {
     "version": 2,
     "lanes": {
       "later-b13": {
         "branches": ["codex/sandbox/later-b13"],
         "allow": [
           "packages/db/src/readiness-repository.ts",
           "apps/api/src/readiness.controller.ts",
           "apps/api/src/readiness.later.test.ts",
           "packages/db/test/readiness-later.integration.test.ts",
           "docs/verdicts/LATER-B13/BUILDER_RECEIPT.md",
           "docs/ledger/LATER-B13.md"
         ],
         "receipt": "docs/verdicts/LATER-B13/BUILDER_RECEIPT.md",
         "note": "LATER-B13 readiness results/refusals; RED independent checks then PARK under decision 74; no migration."
       }
     }
   }
   ```

2. **Stale revision assertion — `apps/api/src/readiness.contracts.ts:1`.** Before and after (unchanged):

   ```ts
   import{z}from"zod";export const readinessPlanV1=z.object({version:z.literal("readiness-plan.v1"),commandId:z.string().uuid(),scenarioNow:z.string().datetime(),resolved:z.boolean().optional()}).strict();export const readinessAdvanceV1=z.object({version:z.literal("readiness-clock.v1"),commandId:z.string().uuid(),scenarioNow:z.string().datetime()}).strict();
   ```

   There is no expected revision and no stale-revision error in this contract, application or repository. Existing live/replay conflicts are preserved and unit-tested. A numbered coordinator ruling must identify the intended existing refusal or separately authorize a versioned revision contract. No guessed field, error code, shared test edit or relaxed assertion was added.

3. **OpenAPI runner permission refusal.** Exact command: `pnpm --filter @jobguard/api openapi:check`, with the final shell prefix above. Exit 1; generator comparison NOT RUN:

   `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/83514.pipe`

   `code: 'EPERM', errno: -1, syscall: 'listen'`. Stopped this item and did not try another route.

4. **Process diagnostic permission refusal.** Exact command: `ps -axo pid,ppid,etime,command | rg 'pnpm|vitest' | head -15`. Exact output: `zsh:1: operation not permitted: ps`. No other process-inspection route was attempted. The surrounding shell batch returned 0 because the pipeline's final command returned 0; that is not a successful ps claim.

## NOT RUN

- `packages/db/test/readiness-later.integration.test.ts`: five cases NOT RUN (cannot start PostgreSQL / bind sockets here; explicitly prohibited by dispatch). This includes the first failing DB run.
- `packages/db/test/readiness.integration.test.ts`: unchanged prior regression, NOT RUN (only own test files allowed locally, plus PostgreSQL restriction).
- Shared command replay DB suite: unchanged, NOT RUN (same restrictions).
- Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`: NOT RUN (whole-suite and DB restrictions; dispatcher/GitHub CI owns them).
- `pnpm test:e2e`, Playwright/browser suites and both viewport projects: NOT RUN (browser/socket restrictions and explicit CI-only instruction).
- OpenAPI comparison itself: NOT RUN (attempted runner refused IPC bind as recorded above).
- `pnpm eval`: NOT RUN / inapplicable; no AI prompt/model/schema/parser/matching/gateway change.
- No live provider, real-data, real-spending or outward-action run.

## Migration, privileges, compatibility and operations

No migration or production SQL change. No new application-login INSERT/UPDATE/DELETE grants, and no changed controlled routines or role checks. Standard F: no new direct-write grant to `jobguard_runtime` on any money, membership, authorization, receipt or audit table.

Every new GRANT in a migration: **none**. The new DB test also contains no GRANT. Its connections start in the existing `jobguard_runtime` role through PostgreSQL connection options and assert `current_user`, `rolsuper=false` and `rolbypassrls=false`. The isolated cluster bootstrap login remains postgres; this is an effective-role fixture, not evidence about a production login or compromised bootstrap credentials. It has not executed here. Test credential values are generated at runtime, never committed as literals.

Request schemas, policy/rule revisions, source-fact evaluation and API route decorators remain unchanged. Malformed command responses change from an unhandled schema exception to a typed 400. Unknown controller failures become a sanitized typed 500. Ready advances no longer append an artificial due-review event/Decision; they still store their successful command identity/result. Historical Decisions and legacy replay paths remain intact. No data backfill or destructive rollback is needed. No new operational alerts or external execution path. Production rollout remains excluded by decision 74 and the normal release gates.

## Builder source inspection (not independent review)

- Checked the minimal repository condition against its surrounding transaction: live guard, advisory lock, identity claim, legacy replay, snapshot selection, audit/Decision insert, stored result and commit order are retained. No new business lock follows an audit append.
- Checked that fully ready work persists a result without fabricating a Decision, and that unresolved work retains the same immutable source/rule references and deduplication path. Old mandatory Decisions are not deleted or hidden.
- Checked the new FK test uses a stored plan, with the positive twin proving valid required fields before isolating the same-tenant wrong-job constraint.
- Checked that authentication still runs in the application before input parsing or repository access. The controller passes the original access/watchdog instance to the established filters. No arbitrary error message/code is trusted as a typed refusal.
- Checked the real-PostgreSQL rollback test injects a failure on the generated command's result insert after Decision/audit writes; it asserts all counts unchanged and retries that same command after a ready plan. This is source-inspected only until CI executes it.
- No merged tests, pinned list/value, fingerprinted table, shared harness, route registry or package export changed. Independent RED verdicts, exact committed head evidence and separate acceptance must be supplied by other actors.

## Changed-file evidence

`git diff --stat HEAD` (tracked changes only; new files are untracked because staging is prohibited):

```text
 apps/api/src/readiness.controller.ts    | 38 +++++++++++++++++++++++++++++++--
 packages/db/src/readiness-repository.ts |  2 +-
 2 files changed, 37 insertions(+), 3 deletions(-)
```

SHA-256 of implementation, tests and ledger:

```text
f54fc779896f40434a34ba412f002a32b970c6dd2e80190d2a35097950597d90  apps/api/src/readiness.controller.ts
6d3e54a3a2a0681b9dcff25aede5969c436981ff03717ddb929a995961a914d1  packages/db/src/readiness-repository.ts
0aec0fd905402961d8822717051ce71c2f8444ab77d7732dcbcfa59739328005  apps/api/src/readiness.later.test.ts
1e6ee6750b538ee1d14af2e1c359a43f478f30b951c6f2db518b3cde7b881d62  packages/db/test/readiness-later.integration.test.ts
46951f32d18f66cb0c469b8e1ff4d9f328f185be5898261f139b36127dd687f4  docs/ledger/LATER-B13.md
```

The receipt cannot include its own final hash without changing it. No permanent hash-pinning test was added. One-off inspection compared these protected files' current bytes to `git show HEAD:<path>`; all were identical:

```text
ec6d3dd219e42707fe0bd6b0550db7f4f260f36c55ff9fee0d36bde831586ef2  apps/api/src/auth/context-boundary.test.ts
a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca  packages/core/src/watchdog.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6  packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f  packages/db/test/command-replay-contract.integration.test.ts
d744c52b4d0fac23affa478ddc9f9b03338a156e4fc55b193407966cab6224ba  packages/db/test/readiness.integration.test.ts
a3614b8a5e9f63e3f0a2599872d4159bdead6f2be6f7e015875d272d85aa695d  apps/api/src/readiness.contracts.ts
d89c4532a138c827eae7b8e680fe9a2f138c7adea7688faacdaf5f95a68295c5  apps/api/src/readiness.application.ts
053330c840f55a29c7c6ae5cd81dbfd6224ccaadeccfd97481a991e9d0899dbe  apps/api/openapi.json
```

One-off `git diff --name-only HEAD` plus `git ls-files --others --exclude-standard` inspection found no file outside the issued six-file allow list. Comparison against moving origin/main includes unrelated upstream work; that is not a claim of local changes. No Git index or ref write was used to construct the evidence.

Intended commit message written to `/private/tmp/jg-msg-later-b13.txt` with subject `fix(readiness): preserve typed refusals and meaningful decisions` and an explanatory body. Dispatcher owns any later commit. Final HEAD remains `4c407a6c81bd714a6875b7adf995812381d0fe57`.

## Inspection and authoring command journal

These read/authoring shell batches are additional to the validation commands above. Exit codes are for the complete shell batch; a failed earlier read in a semicolon-separated batch is explicitly identified below. Polling used `write_stdin` only; three stalled launcher sessions were interrupted with Ctrl-C (exit 130 as recorded above). No command contained a Git write or a deletion operation.

| Shell batch / commands | Exit / evidence |
| --- | --- |
| `pwd && git status --short && git rev-parse HEAD && git rev-parse origin/main && cat AGENTS.md` | 0; clean initial worktree, actual base identified. |
| `rg -n 'readiness\|M2-6-S\|C5' BUILD_PLAN.md; cat config/lanes/later-b13.json; cat package.json; cat packages/db/src/readiness-repository.ts; cat apps/api/src/readiness.controller.ts` | 0 overall; lane file absent. |
| `cat ~/.local/share/full-steam/handoffs/jobguard-task.md; memory_pressure \| tail -1; df -g /System/Volumes/Data` | 0; standing rules read, 73% memory free, 41 GiB disk free. |
| `cat config/lanes/later-b13.json; cat apps/api/src/readiness.application.ts; cat apps/api/src/readiness.test.ts; cat packages/db/test/readiness.integration.test.ts; cat packages/db/src/readiness-repository.ts` | 0 overall; lane and old API readiness.test.ts absent, actual readiness integration test inspected. |
| `rg -n 'readiness\|M2-6-S\|C5' BUILD_PLAN.md; cat package.json; cat apps/api/package.json; cat packages/db/package.json; rg --files -g AGENTS.md -g '*readiness*' -g '*later*test.ts' -g '*lane*' config tools apps/api/src packages/db/test` | 0; scripts, pins and actual paths established. |
| `cat tools/agent-lane-boundary-lint.mjs; rg -n 'later-b13\|readiness\|Readiness' config/agent-lane-assignments.json apps/api/src/*test.ts apps/api/src/*filter* packages/core/src/watchdog.ts; cat apps/api/src/readiness.contracts.ts; cat apps/api/src/practice-access.ts; cat packages/db/test/watchdog-fixtures.ts; cat packages/db/test/tenant-context-test-utils.ts; cat apps/api/vitest.config.ts; cat packages/db/vitest.config.ts` | 0 overall; no API Vitest config; DB source aliases inspected. |
| `sed -n '90,124p' BUILD_PLAN.md; sed -n '325,345p' BUILD_PLAN.md; sed -n '419,466p' BUILD_PLAN.md; sed -n '2790,2812p' BUILD_PLAN.md; rg -n 'readiness\|planned_work' packages/db/migrations/0039*; rg -n 'ZodError\|BadRequestException\|WatchdogError' apps/api/src/*controller.ts \| head -45; git branch --show-current; node --version; export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --version` | 0 reported; source/plan context and branch established. Global pnpm selection was not relied upon as proof of the pinned version. |
| `cat apps/api/src/readiness.contracts.ts; cat apps/api/src/practice-access.ts; cat apps/api/src/recovery-message.controller.ts; cat apps/api/src/recovery-message.errors.ts; cat apps/api/src/watchdog-error.filter.ts; rg -n 'readiness\|readiness.application' apps/api/src/auth/context-boundary.test.ts packages/core/src/watchdog.ts; rg --files apps/api/src \| rg 'filter\|readiness\|later'; rg -n 'later-b13' config; ls config/lanes \| head` | 0 overall; guessed watchdog-error.filter.ts absent; actual watchdog.filter.ts found; missing lane confirmed. |
| `cat packages/db/test/watchdog-fixtures.ts; cat packages/db/test/tenant-context-test-utils.ts; cat apps/api/vitest.config.ts; cat packages/db/vitest.config.ts; cat apps/api/src/recovery-follow-up.test.ts; cat apps/api/src/generate-openapi.ts \| head -65` | 0 overall; absent guessed API files noted, fixtures and OpenAPI command inspected. |
| `cat apps/api/src/watchdog.filter.ts; cat apps/api/src/practice-errors.filter.ts; cat packages/db/src/watchdog.ts \| head -100; cat packages/db/test/pool-test-utils.ts \| head -100; cat apps/api/src/auth/context-boundary.test.ts \| head -95; rg -n 'readiness\|STALE_REVISION\|INVALID_COMMAND' apps/api/src/*test.ts \| head -35; cat apps/api/tsconfig.json; cat packages/db/tsconfig.json; rg -n 'static\|test\|readFile' tools/lint.mjs \| head -30; ls node_modules/.bin/pnpm; ls "$HOME/Library/pnpm/bin"` | 0 overall; root node_modules pnpm executable absent; global launcher directory present. |
| `cat apps/api/src/practice-transports.test.ts; cat apps/api/src/practice-feed.controller.test.ts \| head -60; sed -n '300,410p' tools/agent-lane-boundary-lint.mjs; cat .nvmrc; cat turbo.json; sed -n '1,90p' packages/db/test/pool-test-utils.ts` | 0; existing typed filters, script behavior, pin and test infrastructure inspected. |
| `rg -n 'CREATE TABLE app.watchdog_command_result\|job_id\|result' packages/db/migrations/009[456]* \| head -35` followed by the memory/disk checks and initial unit command recorded above | Interrupted shell 130; schema output inspected before authoring the result-count join. |
| `sed -n '106,117p' packages/db/migrations/0096_watchdog_live.sql; rg -n 'readiness_snapshot\|planned_work_revision' packages/db/migrations/0096_watchdog_live.sql; sed -n '255,285p' tools/agent-lane-boundary-lint.mjs; ls -l "$HOME/Library/pnpm/bin/pnpm"; ls apps/api/node_modules/.bin/vitest; rg -n 'function authenticatePracticeSession\|function authorizePracticeJob' packages/db/src/practice-session.ts` | 0; result table has no job_id, so test counts join to identity. |
| `cat "$HOME/Library/pnpm/bin/pnpm"; sed -n '286,300p' tools/agent-lane-boundary-lint.mjs; ps -axo pid,ppid,etime,command \| rg 'pnpm\|vitest' \| head -15` | 0 overall; ps refused, as recorded in STOP section. |
| `ls "$HOME/Library/pnpm/.tools/pnpm"; ls /opt/homebrew/bin/pnpm; cat .npmrc; ls node_modules/.pnpm \| rg '^pnpm@'` | 1; no Homebrew pnpm, no .npmrc, no installed pnpm workspace package. |
| `command -v -a pnpm; ls /usr/local/lib/node_modules; ls "$HOME/Library/pnpm/.tools/pnpm/11.8.0"; ls "$HOME/Library/pnpm/.tools/pnpm/9.0.0"; ls "$HOME/.cache/node/corepack"; ls "$HOME/.local/share/pnpm"` | 1 overall; zsh refused this command lookup syntax; absent local-share pnpm path. Existing Corepack cache located. |
| `ls "$HOME/.cache/node/corepack/v1/pnpm"; ls -l /usr/local/bin/pnpm; cat "$HOME/Library/pnpm/.tools/pnpm/11.8.0/package.json"; cat "$HOME/.cache/node/corepack/lastKnownGood.json"` | 0 overall; cached pinned 10.28.1 located; /usr/local/bin/pnpm absent. |
| `git diff -- apps/api/src/readiness.controller.ts packages/db/src/readiness-repository.ts; sed -n '1,100p' packages/db/src/practice-session.ts; rg -n '## 5.16' -A15 AGENTS.md; cat config/lanes/serious-b9.json` | 0; source inspection and lane format reference. |
| `cat apps/api/src/readiness.controller.ts; git status --short; nl -ba apps/api/src/readiness.contracts.ts; nl -ba packages/db/src/readiness-repository.ts \| sed -n '11,18p'; nl -ba tools/agent-lane-boundary-lint.mjs \| sed -n '128,135p'; git diff --numstat` | 0; source diff and exact unchanged contract line recorded. |
| `ls -l "$HOME/.cache/node/corepack/v1/pnpm/10.28.1/bin"; ls -l /usr/local/lib/node_modules/corepack/shims/pnpm; rg -n 'pm-on-fail\|manage-package' "$HOME/Library/pnpm/.tools/pnpm/11.8.0/node_modules/pnpm/dist/pnpm.cjs" \| head -10; ls /usr/local/lib/node_modules/corepack/shims` | 0 overall; guessed pnpm.cjs path absent; existing Corepack shim selected. |
| `nl -ba tools/agent-lane-boundary-lint.mjs \| sed -n '109,117p;309,317p'; git diff --check; git rev-parse HEAD; git rev-parse origin/main; git diff --name-only origin/main; git ls-files --others --exclude-standard` | 0; detected external movement of origin/main; later narrowed to task-relevant files. |
| `git diff HEAD origin/main -- packages/db/src/readiness-repository.ts apps/api/src/readiness.controller.ts apps/api/src/readiness.contracts.ts packages/db/test/readiness.integration.test.ts BUILD_PLAN.md AGENTS.md` followed by forced build command above | 0; relevant files unchanged on newer main; build 7/7. |
| `tail -16 /private/tmp/jg-later-b13-build.log; memory_pressure \| tail -1; df -g /System/Volumes/Data` | 0; build complete, disk 38 GiB/memory 77% free. |

Authoring used `tools.apply_patch` to add the two tests first, fix the new test's result-count query to join the actual identity schema, and add preservation coverage. Python heredoc commands then edited only the allowed controller/repository, reformatted the touched controller, and stripped its trailing whitespace. These authoring batches returned 0. One Python heredoc wrote the source-resolution-only temporary config `/private/tmp/jg-vitest-later-b13.mjs` before the first behavioral failure run; exit 0 before the subsequent test exited 1. No shared test configuration was modified.

A `mkdir -p docs/verdicts/LATER-B13 docs/ledger` and two `cat > ...` heredocs wrote the ledger and `/private/tmp/jg-msg-later-b13.txt` (exit 0). A later `cat > docs/verdicts/LATER-B13/BUILDER_RECEIPT.md` wrote this receipt (exit 0); this appendix was appended by a heredoc (exit 0).

The one-off Python evidence command computed SHA-256, compared protected bytes to `git show HEAD:<path>`, and compared changed/untracked paths with the issued allow list; it returned 0 with `Outside issued allow list: []`. It was followed by `git diff --stat HEAD; git status --short; git rev-parse HEAD; git rev-parse origin/main; memory_pressure | tail -1; df -g /System/Volumes/Data` (exit 0). Final verification repeats only receipt/hash/diff inspection, not the completed build or test suites.

Final fixture-only source inspection removed the initially drafted test-login membership grant entirely; `tools.apply_patch` now uses PostgreSQL connection options to select the existing effective runtime role and asserts its catalog flags. This DB test was NOT RUN before or after that edit. No implementation, unit test or build input changed after the completed forced checks, so those checks were not repeated. A Python heredoc updated this receipt and its DB-test hash; exit 0. Final `git diff --check` and allow-list/hash inspection are recorded below.

Final verification: `git diff --check` exited 0 after the fixture cleanup; tracked diff remains 2 files / 37 insertions / 3 deletions, with the two new tests, ledger and receipt untracked. One-off Python allow-list/hash inspection exited 0: six changed files, all within the issued list; all five recorded implementation/test/ledger hashes match. Final HEAD `4c407a6c81bd714a6875b7adf995812381d0fe57`, final observed origin/main `7ff452eeec1c523345d34715adfa3f8310062013`. No commit or push.
