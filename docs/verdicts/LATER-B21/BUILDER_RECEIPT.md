Built by Codex (GPT-6); dispatched 13 Oct 2026; LATER-B21 work dated 16 Oct 2026.

The addendum requested the first line “Built by Claude Sonnet 5.5, Codex unavailable; dispatched 13 Oct 2026”. That attribution is inaccurate for this run; the factual builder is recorded above.

# LATER-B21 builder receipt

RED, decision 74: build then PARK. No merge, enablement, deployment or acceptance. Changes remain uncommitted. No independent reviewer was invoked by this builder; the dispatcher owns the Opus plus Sol-high checks and separate acceptance.

## Base and authority checked

Initial HEAD and local `origin/main`: `4c407a6c81bd714a6875b7adf995812381d0fe57`. Final HEAD remains that SHA. During checks the shared `origin/main` ref advanced externally to `7ff452eeec1c523345d34715adfa3f8310062013`. The worktree started clean. These refs supersede issued `ca435eeb5791638c787c830d6ba717146f694539` and draft `0bbb5ddb`; current main wins. No fetch, package install or Git write was performed by this builder. All cited plan/source/test files were checked again against the newer main and are byte-identical to HEAD; the lane checker and legacy registry are also unchanged between those refs.

Read local `AGENTS.md`, applicable `BUILD_PLAN.md` contracts and inventory, the standing task handoff and its referenced `COMMON.md`. Verified against `git show origin/main:<path>`:

- `BUILD_PLAN.md:117` remains C5 and explicitly requires the same-tenant wrong-job proof.
- `BUILD_PLAN.md:425` remains the M4-1-S recovery case/workbench inventory row; its historical HOLD is not treated as acceptance.
- `packages/db/test/recovery-cases.integration.test.ts:11` and `packages/db/test/recovery-cases.workbench.integration.test.ts:15` retain the transition check with `caseId:randomUUID()`. Each file also already has a populated wrong-job eligibility check. This task strengthens the transition proof, leaving those files intact.
- `packages/db/src/recovery-case-repository.ts:147` performs the current-case lookup with tenant, job and case predicates; line 148 raises `RECOVERY_CASE_NOT_FOUND` before a write. The added test exercises this actual repository.

## Added proof and acceptance mapping

All three generated test cases carry `[L115/dbsrc-11#7]` in their titles:

1. `existing same-tenant foreign-job case is refused (target 0), with no effects and a valid positive twin`.
2. The same title for target 1, proving the reverse direction.
3. `the same refusal assertion detects omission of the real repository lookup's job predicate`.

Each scenario creates two real jobs and opens a real populated recovery case on each through `RecoveryCaseRepository` as an active persisted owner, using a non-owner/non-superuser login inheriting the existing runtime role. Member-facing reads prove each case exists and belongs to its own job. A fresh transition command targets the other job with a valid revision. The helper requires exactly `Error("RECOVERY_CASE_NOT_FOUND")`, rather than any rejection or matching substring. Canonical server-text snapshots cover tenant-wide job rows, cases, current projections, claim revisions, events, eligibility revisions, audit events/head, command receipts and action outbox. Both jobs must remain unchanged after refusal. The identical refused command then succeeds on its owning job, with one correctly linked transition event; the other job stays unchanged.

The negative control intercepts only the actual repository current-case SELECT on a separate real PostgreSQL runtime pool, removes only `AND job_id=$2`, and renumbers its case parameter. It preserves tenant, membership and all database policies. The control verifies the query returned the populated foreign case. The remaining composite FK must refuse the mislinked event with PostgreSQL `23503`; the SAME exact-refusal helper must raise an assertion failure on that different outcome. The repository transaction rolls back, its pool closes, snapshots remain unchanged, and an ordinary repository still produces the exact refusal afterward. No parallel fixture model, modified production file, altered database policy or accepted generic rejection is used.

Acceptance is **partial / execution unverified**: source and strict test typing checked; all three PostgreSQL tests and the omission control are NOT RUN. No local red test execution, runtime defect, independent verification or acceptance is claimed. Tests were authored first; this order needs no implementation code. The first failing database run is NOT RUN because sockets/PostgreSQL are excluded here.

## Grants, migrations and boundaries

No migration. New migration GRANTs: **none**. Standard F: no new direct INSERT, UPDATE or DELETE grant to `jobguard_runtime` on any table.

One fixture-only role membership statement, in the new test: `GRANT jobguard_runtime TO later_b21_login`. It grants no new privilege to the application login and is confined to the disposable synthetic cluster. Existing production grants and functions are unchanged. No routes, schemas, fingerprints, shared harnesses, existing tests, security lists or UI files changed. No real customer data, real spending or outward action. No removal command was run.

## Checks actually run

Runtime: Node `v24.17.0`. Repository pin and locally cached package manager: pnpm `10.28.1`. Dependencies were already installed. The default PATH launcher points at a pnpm 11 executable and stalled on version inspection; both attempts were interrupted (130). The pinned pnpm was found at `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`; a temporary executable symlink `/private/tmp/jg-later-b21-bin/pnpm` selects it, including for child package scripts. No package download was requested.

Every subsequent pnpm shell block begins with:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/jg-later-b21-bin:$PATH"
```

| Command | Exit / counts / evidence |
| --- | --- |
| `pnpm exec tsc -p /private/tmp/jg-later-b21-typecheck.json` | 0; strict static check explicitly includes the new test and imported helpers; no tests executed. Temporary config extends root strict configuration, no emit. |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0; 7/7 tasks, 0 cached. |
| `pnpm exec turbo run lint --force --concurrency=2` | 0; 7/7 tasks, 0 cached. |
| `pnpm build --force --concurrency=2` | 0; 7/7 tasks, 0 cached. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1; no registered branch lane, zero matching lanes. |
| `git diff --check` | 0; tracked diff empty; final addition whitespace check below. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; same missing registration. |
| `pnpm openapi:check` | 1; `tsx` pipe creation refused with `listen EPERM`; schema comparison NOT RUN. Stopped, no alternate launcher or retry. |

Forced turbo runs use `--force`; no cache hit is counted as execution. Turbo printed `WARNING IO error: Operation not permitted (os error 1)` during typecheck/lint. No permissions or cache location was changed to work around those warnings.

Build also printed warnings about multiple workspace lockfiles, CSS `end` support, the NestJS `file-type` export and a dynamic dependency expression. The build itself exited 0; no UI or dependency edits were made for those out-of-lane warnings.

Before heavy work, `memory_pressure | tail -1` reported 72%, later 76% free (77% at the final check); `df -g /System/Volumes/Data` reported 41 GB then 40 GB available, above the binding 35% / 33 GB limits. Resource checks exited 0. No test/build concurrency; no database or browser process started.

## NOT RUN

| Command / file | Reason |
| --- | --- |
| `~/.local/bin/heavy-slot later-b21 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/later-recovery-case-job-isolation.integration.test.ts` | NOT RUN: sandbox cannot bind sockets or start PostgreSQL; dispatcher/CI must execute this file, 3 test cases. |
| `pnpm test` | NOT RUN: whole-suite execution prohibited for this builder; CI owns it. |
| `pnpm test:db` | NOT RUN: whole DB suite prohibited; cannot start PostgreSQL here. |
| `pnpm test:migrations` | NOT RUN: suite prohibited; no migration in this piece; cannot start PostgreSQL here. |
| `pnpm test:e2e` / browser / Playwright | NOT RUN: expressly CI-only; sandbox cannot start a browser or bind sockets. |
| Separate unit test files | None added or applicable; this lane adds only the PostgreSQL proof. |

## STOP / coordinator prerequisites

`config/lanes/later-b21.json:1`: **before** = file absent, no `later-b21` key in the legacy registry either. **Required after** = coordinator-provided version-2 lane for branch `codex/sandbox/later-b21`, allowing exactly the new test, this receipt and `docs/ledger/LATER-B21.md`. File left absent because it is outside the issued allowlist and the header says to stop on coordinator-owned prerequisites. No shared registry or checker edits.

Both prescribed lane commands returned the actual refusal from `tools/agent-lane-boundary-lint.mjs:116`: `Lane boundary FAILED: Branch "codex/sandbox/later-b21" must match exactly one registered lane; found 0. Register the task before building.` No checker edit is proposed. The shared base had advanced by execution time, so the equality guard at line 303 was not triggered. Dispatcher must provide the missing lane registration before a meaningful lane pass. No alternate base or checker bypass was used. Proposed coordinator-owned file content (not written):

```json
{
  "version": 2,
  "lanes": {
    "later-b21": {
      "branches": ["codex/sandbox/later-b21"],
      "allow": [
        "packages/db/test/later-recovery-case-job-isolation.integration.test.ts",
        "docs/verdicts/LATER-B21/BUILDER_RECEIPT.md",
        "docs/ledger/LATER-B21.md"
      ],
      "receipt": "docs/verdicts/LATER-B21/BUILDER_RECEIPT.md",
      "test": "packages/db/test/later-recovery-case-job-isolation.integration.test.ts"
    }
  }
}
```

`pnpm openapi:check` was stopped at the existing `apps/api/package.json:72` command `tsx src/generate-openapi.ts --check`; before/after are unchanged. Refusal: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/44761.pipe`. No workaround was attempted; CI must run it.

Inspection command `ps -axo pid,ppid,etime,command | rg 'pnpm|corepack'` was refused with `zsh:3: operation not permitted: ps` (shell block exit 1). Stopped process inspection; no alternative route was tried. No automatic approval escalation was requested.

## Scope evidence and self-review

`git diff --stat` is empty because all three deliverables are new/untracked and no commit/index write is allowed. `git diff --exit-code HEAD --` exited 0: all tracked files match HEAD exactly. The comparison between HEAD and the newer shared main for the cited plan/source/tests, checker and registry was empty. Final status and no-index addition statistics are recorded below after checks. SHA-256 values for inspected unchanged files:

```text
ed507dc76814d92944e6e810d90992276197e8b30e72235f8fb34f87c7733d7a  packages/db/src/recovery-case-repository.ts
85108a465e469380340e91f573431d6832abbcb92f96e6c3b1406c296dc2b393  packages/db/test/recovery-cases.integration.test.ts
c35c23cb018e657dbdda73719bad15e37730e94337b8c68cd7f25f3cb72db472  packages/db/test/recovery-cases.workbench.integration.test.ts
8903cfb2ce110bfa8f5d7f0bef33b5c629a32f9a2ca2f613cfaef2a823119e45  tools/agent-lane-boundary-lint.mjs
99fcda4daff974e76a96095f6bfaa0be8745ecfc96fbdacbf67e27052df8eb4e  config/agent-lane-assignments.json
43bed0bc809192d2ec1ea1969cb52f2578b1cb5aec26ae1426a4f10e6fe5f9b9  packages/db/test/later-recovery-case-job-isolation.integration.test.ts
```

Builder source inspection, not an independent verdict: checked population premises, active owner path, both job directions, exact error, unchanged stored state, successful owning-job twin, real query interception, foreign row observed, FK error distinguished and transaction rollback. No public response/HTTP status assertion is added because this lane exercises a repository, which exposes an Error rather than an HTTP response. No pre-existing assertion needs a change. No broader missing-tenant/non-member proof is claimed by this narrowly issued item. Operational alerts, compatibility and production behavior: unchanged. Remaining holds: database execution, lane prerequisite, independent RED verdicts and founder-owned acceptance/button. No UI LATER item discovered.

Intended commit message is written to `/private/tmp/jg-msg-later-b21.txt`. Final HEAD remains `4c407a6c81bd714a6875b7adf995812381d0fe57`.

## Inspection and tooling command audit

Shell command inventory below supplements the check table. Inspection commands execute zero tests; counts are not applicable. Repeated reads are included. Pipelines report their shell-block exit; an intermediate missing-file result is called out. Asynchronous shell sessions were polled with empty stdin until completion; the two stalled version checks received Ctrl-C and exited 130. Tool-based patches successfully created/updated only the three lane deliverables, the temporary typecheck configuration and the temporary intended commit message; no shell-based edit or Git write was used.

| Commands, in execution groups | Exit / result |
| --- | --- |
| `pwd`; `git status --short`; `git rev-parse HEAD origin/main`; `cat AGENTS.md`; `cat /Users/benharwood/.local/share/full-steam/handoffs/jobguard-task.md` | Each 0; initial status empty; HEAD/base as above. |
| `cat config/lanes/later-b21.json` | 1, no such file. |
| `rg -n 'C5\|M4-1-S\|recovery workbench\|same-tenant wrong-job\|LATER-B21' BUILD_PLAN.md config tools packages/db/test` | 0. |
| `cat packages/db/test/recovery-cases.integration.test.ts` | 0. |
| `rg --files packages/db/test packages/db/src` piped to `rg 'recovery\|setup\|harness\|fixture'` | 0. |
| `cat package.json packages/db/package.json packages/db/vitest.config.ts` (three reads) | Each 0. |
| `cat tools/agent-lane-boundary-lint.mjs` | 0. |
| `memory_pressure \| tail -1`; `df -g /System/Volumes/Data` (initial and before checks) | Each 0; values recorded above. |
| `cat packages/db/src/recovery-case-repository.ts` | 0. |
| `sed -n '1,135p' packages/db/test/recovery-cases.workbench.integration.test.ts` | 0. |
| `sed -n '95,135p' BUILD_PLAN.md`; `sed -n '409,445p' BUILD_PLAN.md`; `cat /Users/benharwood/.local/share/full-steam/handoffs/COMMON.md` | Block 0. |
| `cat packages/db/test/pool-test-utils.ts packages/db/test/tenant-context-test-utils.ts` | 0. |
| `rg --files -g AGENTS.md -g '*vitest*' -g '*later-b2*' config packages/db`; `node --version`; PATH export then `pnpm --version` | Block interrupted 130 after launcher stalled; Node version reported; zero tests. |
| `sed -n '150,230p' packages/db/src/recovery-case-repository.ts` | 0. |
| `sed -n '1,95p' packages/db/test/recovery-cases.workbench.integration.test.ts` | 0. |
| `sed -n '132,152p' packages/db/src/recovery-case-repository.ts`; `cat packages/db/src/recovery-case-sources.ts` | Block 0. |
| `cat packages/db/tsconfig.json tools/lint.mjs`; `rg -n 'recovery_case\|jobguard_runtime' packages/db/migrations/0034_recovery_cases.sql packages/db/migrations/0097_recovery_case_current.sql`; `ls -l /Users/benharwood/Library/pnpm/bin/pnpm node_modules/.bin/pnpm`; `command -v pnpm`; `rg -n 'openapi:check\|build' apps/api/package.json apps/web/package.json` | Block 0; intermediate `ls` reported absent local `node_modules/.bin/pnpm`. |
| `sed -n '1,150p' packages/db/test/recovery-timing-pin.integration.test.ts`; `cat config/lanes/later-b20.json` | Block 1, latter file absent. |
| `cat packages/db/src/tenant-context.ts`; `cat /Users/benharwood/Library/pnpm/bin/pnpm`; `rg -n 'query.*mockImplementation\|spyOn.*query\|job_id=\$2\|predicate' packages/db/test/recovery-case-outcome.test.ts packages/db/test/*isolation*` | Block 0. |
| `ls /Users/benharwood/Library/pnpm/.tools/pnpm`; `cat .npmrc pnpm-workspace.yaml`; `ps -axo pid,ppid,etime,command \| rg 'pnpm\|corepack'` | Block 1; `.npmrc` absent; `ps` permission refusal recorded above; no retry of process inspection. |
| PATH export then `npm_config_manage_package_manager_versions=false pnpm --version` | Interrupted 130 after the same launcher stalled; zero tests. |
| `cat packages/db/migrations/0034_recovery_cases.sql`; `cat packages/db/src/audit.ts`; `rg -n 'CREATE TABLE.*audit\|CREATE TABLE.*outbox\|CREATE TABLE.*command\|audit_head' packages/db/migrations/000*.sql` | Block 0. |
| `rg --files node_modules /Users/benharwood/Library/pnpm/.tools/pnpm /opt/homebrew/lib/node_modules 2>/dev/null` piped to `rg '/(pnpm.cjs\|pnpm.mjs\|package.json)$'` then `head -35`; `ls -l node_modules/.bin/turbo node_modules/.bin/tsc`; `cat node_modules/.modules.yaml \| head -12` | Block 0. |
| `rg -n 'manage.package.manager\|managePackageManager\|packageManagerStrict\|MANAGE_PACKAGE\|manage-package' /Users/benharwood/Library/pnpm/.tools/pnpm/11.8.0_tmp_19591/node_modules/pnpm/dist/pnpm.mjs \| head -25`; `ls /opt/homebrew/bin/pnpm /usr/local/bin/pnpm /Users/benharwood/.local/share/pnpm/pnpm /Users/benharwood/Library/Caches/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs` | Block 1; candidate binary paths absent. |
| `ls /Users/benharwood/Library/Caches/node/corepack /Users/benharwood/.cache/node/corepack /Users/benharwood/Library/pnpm/.tools /Users/benharwood/Library/pnpm/global`; `rg -n 'packageManager\|manage.*[Vv]ersion\|pmOnFail\|manage.*[Mm]anager' /Users/benharwood/Library/pnpm/.tools/pnpm/11.8.0_tmp_19591/node_modules/pnpm/dist/pnpm.mjs \| tail -30` | Block 0; first candidate directory absent; actual corepack cache located. |
| `git diff --stat`; `git status --short`; `rg -n 'later-b21' config/agent-lane-assignments.json config/lanes`; `rg -n 'pin_recovery_timing\|recovery_case_event.*guard\|recovery.*write' packages/db/migrations/01*.sql \| tail -15` | Block 0; registration search returned no match (1); initial new-test status only. |
| `ls /Users/benharwood/.cache/node/corepack/v1/pnpm`; `sed -n '304780,304805p' /Users/benharwood/Library/pnpm/.tools/pnpm/11.8.0_tmp_19591/node_modules/pnpm/dist/pnpm.mjs`; `sed -n '304990,305055p'` of the same file; `sed -n '245,259p' packages/db/migrations/0107_recovery_messages.sql`; `cat tsconfig.json` | Block 0. |
| `ls -l /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin`; `node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs --version`; resource checks | Block 0; pinned pnpm 10.28.1. |
| `mkdir -p /private/tmp/jg-later-b21-bin`; `ln -s /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs /private/tmp/jg-later-b21-bin/pnpm` | Block 0. |
| `git show origin/main:packages/db/test/recovery-cases.integration.test.ts \| nl -ba \| sed -n '8,13p'`; equivalent workbench command with `sed -n '13,17p'`; `git show origin/main:BUILD_PLAN.md \| sed -n '117p;425p'`; `nl -ba tools/agent-lane-boundary-lint.mjs \| sed -n '250,270p'`; `rg -n 'self-review\|Self.review' docs/verdicts/LATER* docs/ledger/LATER*` | Block 1; final unmatched shell glob stopped that optional search; cited lines were returned. |
| `rg -n 'Missing branch\|found.*Register\|register' tools/agent-lane-boundary-lint.mjs`; `shasum -a 256 packages/db/src/recovery-case-repository.ts packages/db/test/recovery-cases.integration.test.ts packages/db/test/recovery-cases.workbench.integration.test.ts tools/agent-lane-boundary-lint.mjs config/agent-lane-assignments.json packages/db/test/later-recovery-case-job-isolation.integration.test.ts`; `nl -ba packages/db/test/later-recovery-case-job-isolation.integration.test.ts \| tail -9` | Block 0; hashes above. |
| `cat apps/api/src/generate-openapi.ts`; `sed -n '1,80p' tools/agent-lane-boundary-lint.mjs`; `cat apps/web/next.config.ts apps/web/next.config.mjs` | Block 1; optional Next config candidates absent. |

The three generated test cases remain NOT RUN throughout this audit; shell/static check counts must not be read as database passes.

## Final scope and handoff evidence

Post-check commands (zero tests executed):

| Command | Exit / result |
| --- | --- |
| `git diff --stat HEAD origin/main -- BUILD_PLAN.md packages/db/src/recovery-case-repository.ts packages/db/test/recovery-cases.integration.test.ts packages/db/test/recovery-cases.workbench.integration.test.ts tools/agent-lane-boundary-lint.mjs config/agent-lane-assignments.json` | 0; empty, cited files and checker/registry unchanged on newer main. |
| `git diff --exit-code HEAD --` | 0; every tracked file unchanged (repeated at handoff). |
| `git diff --stat` | 0; empty, all deliverables are untracked (repeated at handoff). |
| `git rev-parse HEAD origin/main` | 0; unchanged HEAD `4c407a6c81bd714a6875b7adf995812381d0fe57`, newer main `7ff452eeec1c523345d34715adfa3f8310062013` (repeated at handoff). |
| `git status --short` | 0; only the three authorized new files, shown below (repeated at handoff). |
| `memory_pressure \| tail -1`; `df -g /System/Volumes/Data` | 0 each, 77% free memory / 40 GB disk. |
| `git diff --no-index --stat /dev/null packages/db/test/later-recovery-case-job-isolation.integration.test.ts` | 1 (normal difference status); 1 file, 152 insertions. |
| `git diff --no-index --stat /dev/null docs/ledger/LATER-B21.md` | 1 (normal difference status); 1 file, 11 insertions. |
| `git diff --no-index --stat /dev/null docs/verdicts/LATER-B21/BUILDER_RECEIPT.md` | 1 (normal difference status); 1 file, 163 insertions at that inspection, before this evidence was appended. |
| `git diff --no-index --check /dev/null packages/db/test/later-recovery-case-job-isolation.integration.test.ts` | 1 (normal difference status), no whitespace diagnostics. |
| `git diff --no-index --check /dev/null docs/ledger/LATER-B21.md` | 1 (normal difference status), no whitespace diagnostics. |
| `git diff --no-index --check /dev/null docs/verdicts/LATER-B21/BUILDER_RECEIPT.md` | 1 (normal difference status), no whitespace diagnostics. |

Two one-off Node inspections below each exited 0. They are receipt evidence, not permanent tests or an independent verdict. The first reverified every cited line on current main; the second confirmed exactly the three allowed untracked paths and emitted their inspection-time hashes. Final stable artifact hashes:

```text
49a05b014148190259aa2fe811ef0af00fce1a1c010d452208442d4cc5bcadb8  docs/ledger/LATER-B21.md
43bed0bc809192d2ec1ea1969cb52f2578b1cb5aec26ae1426a4f10e6fe5f9b9  packages/db/test/later-recovery-case-job-isolation.integration.test.ts
```

Exact Node inspection commands:

```sh
node --input-type=module -e 'import {execFileSync} from "node:child_process";import {createHash} from "node:crypto";const git=(...args)=>execFileSync("git",args,{encoding:"utf8"});for(const [file,line] of [["BUILD_PLAN.md",117],["BUILD_PLAN.md",425],["packages/db/test/recovery-cases.integration.test.ts",11],["packages/db/test/recovery-cases.workbench.integration.test.ts",15],["packages/db/src/recovery-case-repository.ts",147]]){const main=git("show",`origin/main:${file}`),head=git("show",`HEAD:${file}`),text=main.split("\n")[line-1];console.log(JSON.stringify({file,line,unchanged:main===head,mainSha256:createHash("sha256").update(main).digest("hex"),premise:file.endsWith("test.ts")?text.includes("caseId:randomUUID()"):text}));}'
node --input-type=module -e 'import {execFileSync} from "node:child_process";import {createHash} from "node:crypto";import {readFileSync} from "node:fs";const files=["packages/db/test/later-recovery-case-job-isolation.integration.test.ts","docs/ledger/LATER-B21.md","docs/verdicts/LATER-B21/BUILDER_RECEIPT.md"].sort();const actual=execFileSync("git",["ls-files","--others","--exclude-standard"],{encoding:"utf8"}).trim().split("\n").sort();if(JSON.stringify(actual)!==JSON.stringify(files))throw new Error("Unexpected untracked paths");for(const file of files)console.log(createHash("sha256").update(readFileSync(file)).digest("hex"),file);console.log("Exactly three authorized untracked paths; zero database tests executed");'
```

Handoff status:

```text
?? docs/ledger/LATER-B21.md
?? docs/verdicts/LATER-B21/
?? packages/db/test/later-recovery-case-job-isolation.integration.test.ts
```

Final `git diff --check`: 0, no diagnostics. No commit or push. Intended conventional subject and body are at `/private/tmp/jg-msg-later-b21.txt`. PostgreSQL proof: NOT RUN, three cases. Lane registration: STOP at absent `config/lanes/later-b21.json:1`, exact before/required-after above. OpenAPI: STOP on the existing tsx pipe permission refusal; no retry. RED review and acceptance: not performed by builder. PARK remains mandatory.
