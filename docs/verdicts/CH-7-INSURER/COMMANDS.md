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
