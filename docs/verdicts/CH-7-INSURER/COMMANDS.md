# Shell command record — CH-7-INSURER blocked preflight

Exit codes are the observed shell-batch exits. A successful read batch is not a test pass. Python mutation batches are described by their actual operation rather than copied in full; the saved patch preserves the exact draft test bytes. No installation, git mutation, database startup or browser command was issued.

| Batch | Commands / operation | Exit / counts |
|---|---|---|
| 1 | `pwd; git status --short; git rev-parse HEAD; git rev-parse origin/main; cat AGENTS.md` | 0; clean tree, same base/head |
| 2 | `rg -n` for routine definitions, GRANT/job locks and recovery route guards across migrations 0119/012*/013*, recovery-case/job-party/quote/v3 repositories and watchdog.ts; `cat config/agent-lane-assignments.json` | 0; read-only |
| 3 | `rg -n` applicable card/fixture names in BUILD_PLAN.md; `cat docs/contracts/recovery-eligibility-v3.md`; `cat docs/verdicts/CH-7/BUILDER_RECEIPT.md` | 0; read-only |
| 4 | `cat` core v3 evaluator, DB v3 repository, recovery application/contracts and Next eligibility route | 0; read-only |
| 5 | `rg -n '^"ch-7' config/agent-lane-assignments.json`; repository-wide `rg -n` newest definitions; `cat` v3 repository, quote repository and 0134 terms migration | 0; newest guard 0130, effect 0119 |
| 6 | `python3` lane insertion using JSON and one compact row | 0; 1 added line |
| 7 | `cat` core evaluator/test and 0130 migration; `sed -n '132,174p'` 0119 | 0; read-only |
| 8 | `cat` DB v3 integration, API v3 application test and follow-up upgrade integration test | 0; output truncated; not counted as full-file inspection |
| 9 | `cat` job-party/recovery-case repositories and synthetic-party fixture; `sed` 0095 party and 0002 evidence sections | 0; output truncated |
| 10 | `sed` BUILD_PLAN sections; `cat` contract/package/registry/e2e; `memory_pressure` / `df -g /System/Volumes/Data`; `cat ~/.local/share/full-steam/handoffs/jobguard-task.md` | 0; 74% memory, 90 GB available |
| 11 | `rg` GRANT/row locks; `cat` synthetic fixture, upgrade-proof-utils and API v3 test | 0; read-only |
| 12 | `rg` tenancy/watchdog grants and fact calls; `nl` API context; `cat` package/evidence/contract; `rg` task locations | 0; read-only |
| 13 | `sed` task cards and prior receipt; `cat` registry tail/pool-test-utils; `sed` DB and API STOP contexts; `rg` migration grants | 0; read-only |
| 14 | `rg` UPDATE grants/revokes across all migrations; `sed` 0003/0095; `cat` job-parties and DB watchdog source | 0; read-only |
| 15 | `python3` tests-first drafts; `memory_pressure | tail -1`; `df -g /System/Volumes/Data`; `export PATH="$HOME/Library/pnpm/bin:$PATH"`; `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/recovery-eligibility-v3.test.ts` | 130 (interrupted); 75%/90 GB; no Vitest collection/execution count |
| 16 | `rg` F21/reasonHeld; `sed` practice session/feed; `cat packages/db/package.json`; `cat packages/api/package.json` | 1; final path absent (API is apps/api) |
| 17 | `command -v pnpm`; `ls` pnpm launcher; `node --version`; `cat apps/api/package.json`; `rg` job UPDATE; `sed` existing party lock; `cat packages/db/src/practice-material-pool.ts` | 1; final path absent; Node v24.17.0 |
| 18 | `cat` pnpm launcher; `rg --files packages/db/src`; `cat` DB Vitest config; `sed -n '270,312p'` DB v3 test; `rg` F21/reasonHeld | 0; found additional F21 null assertion |
| 19 | `nl -ba ...integration.test.ts` lines 302–308; `git diff --stat`; `rg --files /private/tmp` filtered for pnpm filenames | 130 (search interrupted); no search result used |
| 20 | `ps -axo pid,ppid,etime,comm` piped to rg; `rg` package-manager settings; `ls /private/tmp/jg-fixlater-1-bin/pnpm`; `git branch --show-current`; `git diff --check`; `nl` 0003 and 0095 | Shell 0; ps refused: `zsh:1: operation not permitted: ps`; no retry/alternate diagnostic |
| 21 | `ls` pnpm cache candidate paths; `git diff --numstat`; `sed` lane names; `rg` 0130/0134 definitions/grants and repository lock calls | 0; candidate pinned cache paths absent |
| 22 | `ls "$HOME/Library/pnpm/.tools/pnpm"`; `cat pnpm-workspace.yaml`; `git diff --` the three edited test files | 0; 11.8.0/9.0.0 entries; draft displayed |
| 23 | `python3` saves exact three-file draft diff and restores each originally-clean file from read-only `git show HEAD:<path>`; `node` two message lengths/hashes and lane JSON parse; `git diff --stat`; `git diff --check` | 0; 2 hashes match, 147 lanes, 1 tracked added line |
| 24 | `LANE_BASE_REF=4db73817ab7b3be4993fe8b01279ac0e1b8cf836 node tools/agent-lane-boundary-lint.mjs` | 1; unrelated FIXLATER-5 receipt fails lane against supplied old base |
| 25 | `git diff --numstat origin/main`; `git status --short`; `git rev-parse HEAD`; `python3` hash/equality evidence against read-only `git show origin/main:<path>` | 0; 8 sampled files byte-identical |
| 26 | `python3` writes receipt with exact unchanged STOP contexts and intended commit message at /private/tmp/jg-msg-ch-7-insurer.txt | 0; metadata only |
| 27 | `python3` writes this command inventory | 0; metadata only |

The individual `write_stdin` polls returned no additional output. The two Ctrl-C writes completed the running shell batches at exit 130 as recorded above. No test counts are inferred from polling. Final read-only artifact/diff inspection is recorded in the receipt.


## Round 1 command inventory (13 October)

The receipt's Round 1 check table records exact implementation-check commands, exit codes and counts. All test runs were sequential, at most two files, Vitest maxWorkers=2. DB/browser suites were never invoked. Long Python edits below are recorded as operations rather than repeated source; their resulting files are in the change inventory. No deletion, installation or git-writing command.

| Operation / commands actually issued | Observed exit/result |
| --- | --- |
| `pwd`, `git status --short`, `cat` own receipt, worktree-relative issued order, AGENTS | Batch 0; order-relative cat reported No such file; receipt read first. |
| `rg --files` task/issued/AGENTS names; `git rev-parse HEAD origin/main`; 0095 origin/main grep; BUILD_PLAN/lane/old command log searches | 0, read-only. |
| `ls /private/tmp/jg-orders`; broad `rg --files` for issued order under a nonexistent project subdir and /private/tmp | 2, no order found; transient search returned unrelated copied test paths. Later Ctrl-C poll found it already completed. No result used as source. |
| `ls -la /private/tmp`; reads of .agents/.codex, 0095, SV-4, package.json and prior commands | Batch 0; output truncated, not counted as full-file inspection. No mutation. |
| Origin/main lock/context grep in 0003/0006/0090–0100; BUILD_PLAN CH-7 and v3 contract reads | 0. |
| 0095/0097/SV-4 reads; integrator handoff read; `ls .agents .codex` | 1 from absent local directories. No permission refusal. |
| Bounded Python directory-name listing located full-steam/jg-orders | 0; filename inspection only. |
| `cat ~/.local/share/full-steam/jg-orders/CH-7-INSURER-issued.txt`; targeted order chunks; origin/main routine/application/job-lock greps | 0. Issued header/addendum/draft read; later chunks used to avoid truncation. |
| Core/DB evaluator, API/application/contracts/controller/route, previous terms modules/tests and generator inspection | Read batches 0/1; absent diagnostic filenames explicitly reported (actual files found via rg). No alternate permission operation. |
| Installed launcher/pinned cache inspection; `memory_pressure | tail -1`; `df -g /System/Volumes/Data` | 0; exact cached 10.28.1 found, 75% / 93 GB then 72% / 92 GB. |
| Applicable BUILD_PLAN CH-3a, D03 category/fixture/CH-7/SB sections; 0119/0130/0095/0106/0127/0002/0096/0128 and older CH-7 receipt reads | 0; no product approval inferred. |
| apply_patch: new schema/API tests before implementation | Success. |
| Python: initial DB mark/context/catalog/replay/upgrade tests before migration/writer implementation | 0, written-first; not executed against PostgreSQL. |
| apply_patch/Python: new core schema, controlled writer repository, API dispatch/contracts/exports, 0142, migration registration and catalog rows | Success/0; no merged migration edited. |
| Python: own core Node-import correction; docs partial-contract/migration note | 0. |
| Python: supplementary DB amount/owner/source/audit controls; exact evidence fixture and repository digest check | 0; supplementary checks added after initial implementation. |
| `git diff --check`, diff stats/status, original core/e2e/assertion reads, shared-money track/guard inspection | 0; one diagnostic glob batch reported zsh no matches, with no result used. |
| Python: independent F19 core/DB/browser tests before F19 implementation | 0. F19 first failing run is in receipt (2 failed/26 passed). |
| Python: F19 constants/reason/header/held flags and SQL parity; explicit contractor refusal on new mark entry points | 0. |
| Python: previous-evaluator upgrade seed, own constant/hash tests, rolled-back later-insert control, DB source/evidence/replay/timestamp/concurrency/control tests | 0. DB source checks compile only, not execution. |
| Repeated read-only `git rev-parse/log/diff --name-only`, routine/newest-definition searches on externally advanced origin/main | 0; main moved from 1f54750 to ec6ad4d, routines unchanged. |
| Python difflib: two exact restated-routine diff artifacts | 0, receipt artifacts only. |
| Forced typecheck, root forced lint, forced build, targeted unit runs, DB test tsc, lane wrappers, compiled OpenAPI generation/check and official pnpm OpenAPI wrapper | Exact commands/results/counts and refusal are in Round 1 receipt; log files under /private/tmp/jg-ch-7-insurer-r1-*.log. |
| Python: restores only the originally-clean OpenAPI file changed by our compiled generator, using read-only git show HEAD | 0; original artifact restored; no alternative generator attempted after tsx refusal. |
| Python: fixes own withdrawal test input, keeps fixture access value on separate lines, moves only added catalog rows into name order | 0. No original assertion changed. |
| Python: nine unchanged-file hashes, source diff review and current inventory | 0; all four stopped lines and both merged routine sources unchanged. |
| Python: appends Round 1 receipt/this log and writes intended message /private/tmp/jg-msg-ch-7-insurer.txt | 0; no commit. |
| Final `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; all changes within ch-7-insurer allowlist. |

The official `pnpm openapi:check` refusal is the only stopped executable check: `listen EPERM` on tsx's IPC pipe. Turbo also logged cache-related IO permission warnings while the requested forced tasks themselves executed successfully. No permissions escalation, shared-cache repair or alternate post-refusal operation was attempted. The generated diff shown by the compiled OpenAPI generator was unrelated parameter metadata and was restored; it is not presented as a source-generator pass.
