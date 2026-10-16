Built by Claude Sonnet 5.5, Codex unavailable; dispatched 13 Oct 2026

**Attribution correction:** the preceding line is the dispatch-required template text and is inaccurate for this run. Codex built this working-tree change on 16 October 2026. No Claude builder or independent reviewer participated. This is a builder receipt, not a verdict or technical acceptance.

# LATER-B20 — Commercial integrity projection correctness

Status: implementation prepared; runtime acceptance unverified; **PARK under decision 74**. Do not merge, enable or deploy. Synthetic fixtures only; no real customer data, spending, network delivery, permanent business deletion, commit or push.

## Base and authority

- Branch: `codex/sandbox/later-b20`.
- Initial and final HEAD: `31682762c903d716657c573e1b5deae63588aad7`; local `origin/main` resolves to the same SHA. The issued `ca435eeb5791638c787c830d6ba717146f694539` and draft `0bbb5ddb` are stale. Current main wins. No fetch or Git mutation was attempted.
- Read repository `AGENTS.md`, applicable `BUILD_PLAN.md` §§2.2–2.4 and release modes, the M1-16 and M1-16-S rows, D11 decision, current query/application code, and underlying snapshot/recovery migrations and fixtures.
- Cited `BUILD_PLAN.md:109`, `:394`, `:432` still contain C1 authoritative projections, M1-16 D11 advisory checks and M1-16-S advisory signals respectively. Original query lines 10–17 still contained maximum historical value facts and an unconditional landing join on this main.
- Existing repaired `commercial-integrity-application-repository.ts` remains outside this piece and unchanged. No web workflow changed; UI is parked by the order. No model, prompt or parser change; evaluation suite inapplicable.

## Implemented scope and acceptance evidence

| ID | Change and new test evidence | Runtime result |
| --- | --- | --- |
| L113 / dbsrc-02#1 | `quote accepted after historical backfill contributes the baseline`: accepted £800 net, final £1,100 net, existing 1,000 basis points, expected £300 difference. Accepted fixture has no historical value facts. | NOT RUN |
| L113 | New and historical jobs agree; current accepted, quoted and final snapshots override larger historical facts; fallback selects latest instead of maximum value; cancellation removes prior acceptance from won-job count. | NOT RUN |
| L114 / dbsrc-02#2 | `fully reversed landing no longer suppresses the integrity finding`: before reversal suppressed, after full reversal advisory finding returns. | NOT RUN |
| L114 | Partial reversal leaves a penny of effect; additional fully reversed allocation on the same job cannot remove it. Separate test reverses all allocations before the finding returns. | NOT RUN |
| L113 L114 | Tenant/job isolation including foreign tenant queue; repeated evaluation in a real read-only runtime transaction, with before/after application table counts. | NOT RUN |

Ten cases in `packages/db/test/later-commercial-integrity.integration.test.ts`. Written before the implementation query was changed. First red runtime run: **NOT RUN (cannot start PostgreSQL here; order prohibits local database execution)**. Do not count collection failure as a regression failure or a passing test. Pre-implementation source hash: `ae2ee6f13efa48a9da082f958677da88d86dea33132097f937e70fb2333ef9db`. Tests-before-code file hash: `dfcca2136da7cb1835e7df333e9918b26830420b298132d7de0f7a69ddc5da1e`.

Recovery fixtures seed isolated allocation facts under the fixture owner with triggers temporarily disabled inside setup transactions; runtime reads use the actual non-owner RLS role with triggers restored. These tests establish projection behavior only when executed; they do not establish provider integration, financial posting authorization, approval validity or fee calculation correctness. Quote acceptance fixtures use the existing synthetic repository helper.

## Implementation choices and builder source inspection

- The immutable accepted/baseline `quote_version` selected by the job pointer supplies accepted net principal. Current acceptance sequence supplies its acceptance time. Cancelled and superseded historical acceptances do not count as current wins.
- Latest sent immutable document supplies quoted net; current final-account revision supplies final net. Synthetic value facts remain latest-by-time/ID fallbacks, preserving legacy fixture support without requiring another backfill. Zero values remain explicit.
- Lateral subqueries keep one projection row per job and avoid multiplying values or reversals through activity/value joins.
- A landing contributes only when its original eligible net exceeds the sum of its posted reversal facts. All reversal joins include tenant, job and allocation. Integer PostgreSQL arithmetic preserves the remaining penny.
- Existing public function signature, pure evaluator, thresholds and advisory-only result remain unchanged. No authoritative commercial write, new route, external action, migration, column, role or production capability is introduced. No new alert or data migration is required.
- Relevant invariants: AGENTS §§5.1, 5.2, 5.3, 5.5–5.7 and 5.10. No command guard or shared replay harness changes; standard-F route-write provisions are inapplicable to this read projection.
- This source inspection is the requested builder self-inspection only. It is not an independent review. RED Opus and Sol-high checks must bind to the dispatcher-created exact commit, with separate acceptance, before any further decision. Decision 74 still requires PARK.

## Grants and compatibility

No migration. **Every new migration GRANT: none.** Standard F: no new direct INSERT, UPDATE or DELETE grant to `jobguard_runtime` on money, membership, authorization, receipt or audit tables.

The new test's sole GRANT is `GRANT jobguard_runtime TO later_b20_login`, an isolated test login membership. It adds no table permission to the application role. Test credentials are generated at runtime. No existing test, expected value, pin, fingerprint, command application or protected authentication file was changed.

## STOP and remaining prerequisites

1. **Lane registration — STOP on this portion.** `config/lanes/later-b20.json:1` does not exist, nor does a `later-b20` entry in the existing registry. Before: `<absent>`. Proposed after (coordinator-owned change; not applied because outside the enumerated allowed paths):

   ```json
   {"version":2,"lanes":{"later-b20":{"branches":["codex/sandbox/later-b20"],"test":"packages/db/test/later-commercial-integrity.integration.test.ts","receipt":"docs/verdicts/LATER-B20/BUILDER_RECEIPT.md","note":"L113/L114 read projection only; no migration or web workflow; decision 74 PARK.","allow":["packages/db/src/commercial-integrity-repository.ts","packages/db/test/later-commercial-integrity.integration.test.ts","docs/verdicts/LATER-B20/BUILDER_RECEIPT.md","docs/ledger/LATER-B20.md"]}}}
   ```

   No existing line needs weakening. `tools/agent-lane-boundary-lint.mjs:303` also refuses `HEAD == origin/main` in this deliberately uncommitted worktree. Before and after: unchanged `if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");`. No alternative base or check alteration was used. Dispatcher commit plus proper registration is needed.
2. **Shared test gate process inspection.** The collection command recorded below reported `sysctl: sysctl fmt -1 1024 1: Operation not permitted`, `sysmon request failed with error: sysmond service not found`, and `pgrep: Cannot get process list`. The collection command still proceeded, then failed resolving the unbuilt core package. No alternate collection route or retry was attempted.
3. Runtime database/browser/full suites remain CI-owned. Missing independent verdicts remain a hold. No claimed acceptance.

## Validation commands

Final command transcript and hashes follow below. All pnpm validation uses the already cached pinned 10.28.1 CLI through `/private/tmp/jg-later-b20-bin/pnpm`; no install or package download. Commands export `$HOME/Library/pnpm/bin` first, then prepend that temporary executable. Node is `v24.17.0`, Turbo `2.10.12`.

The global pnpm executable stalled during version checks and was interrupted (exit 130); attempts with `PNPM_MANAGE_PACKAGE_MANAGER_VERSIONS=false` and `--manage-package-manager-versions=false` also stalled and were interrupted. The existing cached pinned CLI returned 10.28.1 immediately. No repository package/configuration change was made for this environment issue.

Memory checks reported 81% free. Disk checks began at 47 GiB (rounded `df -g`), later 46, then 45; exact available space immediately before build was 45.184 GiB, above the required 45 GiB floor. Turbo emitted cache IO warnings `Operation not permitted (os error 1)` during otherwise successful forced typecheck/lint; no permission workaround or cache redirection was attempted.

## NOT RUN

- Actual `vitest run --maxWorkers=2 test/later-commercial-integrity.integration.test.ts`: NOT RUN (cannot start PostgreSQL here; explicit sandbox/dispatch prohibition). All ten cases unexecuted. Existing `commercial-integrity.integration.test.ts` likewise NOT RUN; outside the piece's permitted local test files.
- `pnpm test`: NOT RUN (whole suites reserved for dispatcher/CI; memory limits).
- `pnpm test:db`: NOT RUN (PostgreSQL cannot start here; whole database suite CI-only).
- `pnpm test:migrations`: NOT RUN (same; no migration in this piece).
- `pnpm test:e2e`, Playwright, browser/device runs: NOT RUN (CI-only, no changed web workflow).
- Live model/provider evaluations: NOT RUN (no applicable change; no real data, routes, spending or outward actions authorized).
- Clean reinstall: NOT RUN (dependencies already installed; downloads forbidden).

## Final evidence

Final hashes, diff scope and command results follow below. HEAD remains the original base because the dispatcher owns commit/push. Intended conventional commit message is in `/private/tmp/jg-msg-later-b20.txt`.

## Completed validation transcript

The forced root checks were each run once, sequentially: typecheck exit 0 (7/7 tasks, 0 cached, 36.494s); package lint exit 0 (7/7 tasks, 0 cached, 32.728s); build exit 0 (7/7 tasks, 0 cached, 1m57.47s). These are actual executions with `--force`, not cache hits. No tests ran alongside a build.

The build emitted warnings about workspace-root inference, CSS alignment, Nest/file-type exports, dynamic dependency resolution and cache serialization. It still exited 0. No out-of-lane changes were made in response.

The next available-disk observation after build completion was **44.620849609375 GiB**, below the required 45 GiB floor. Further heavy validation stopped immediately. `pnpm openapi:check` is **NOT RUN (disk floor)**. No cleanup/deletion was attempted. Only read-only Git/scope evidence and this handoff were completed afterward. `pnpm lint:lanes` names the same script as the direct required lane command below; that script was executed and failed, with no alternate base or registration workaround.

The test-list attempt used the shared gate and two-worker limit; exit 1, zero collected/executed tests, missing unbuilt `@jobguard/core` entry. It did not execute PostgreSQL, bind a socket, or run a browser. It was not retried after the gate's permission diagnostics.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-later-b20-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; ~/.local/bin/heavy-slot later-b20-list pnpm --filter @jobguard/db exec vitest list test/later-commercial-integrity.integration.test.ts --maxWorkers=2
```

Exit 1.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-later-b20-bin:$PATH"; pnpm exec turbo run typecheck --force --concurrency=2
```

Exit 0.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-later-b20-bin:$PATH"; pnpm exec turbo run lint --force --concurrency=2
```

Exit 0.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-later-b20-bin:$PATH"; pnpm build --force --concurrency=2
```

Exit 0.

```sh
LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs
```

Exit 1.

```sh
git diff --check
```

Exit 0.

```sh
git status --short && git diff --stat && git rev-parse HEAD origin/main
```

Exit 0.

```sh
shasum -a 256 packages/db/src/commercial-integrity-repository.ts packages/db/test/later-commercial-integrity.integration.test.ts packages/db/src/commercial-integrity-application-repository.ts apps/api/src/auth/context-boundary.test.ts packages/core/src/watchdog.ts packages/db/test/watchdog-command-harness.ts packages/db/test/command-replay-contract.integration.test.ts
```

Exit 0.

```sh
git diff --exit-code origin/main -- . ':(exclude)packages/db/src/commercial-integrity-repository.ts' ':(exclude)packages/db/test/later-commercial-integrity.integration.test.ts' ':(exclude)docs/verdicts/LATER-B20/BUILDER_RECEIPT.md' ':(exclude)docs/ledger/LATER-B20.md'
```

Exit 0.

```sh
git ls-files --others --exclude-standard
```

Exit 0.

```sh
git show origin/main:packages/db/src/commercial-integrity-application-repository.ts | shasum -a 256
```

Exit 0.

```sh
git diff --no-index --stat /dev/null packages/db/test/later-commercial-integrity.integration.test.ts
```

Exit 1 (1 means the expected new-file difference).

```sh
git diff --no-index --stat /dev/null docs/ledger/LATER-B20.md
```

Exit 1 (1 means the expected new-file difference).

## Scope and hashes

`git diff --stat` (tracked changes only) returned:

```text
 packages/db/src/commercial-integrity-repository.ts | 52 +++++++++++++++++-----
 1 file changed, 40 insertions(+), 12 deletions(-)
```

Untracked additions are exactly the 206-line new PostgreSQL file, the ledger and this receipt. `git ls-files --others --exclude-standard` lists exactly those three files. The no-index stat commands above expose the new test/ledger rather than silently omitting them. The exit-zero comparison excluding the four allowed files confirms no other tracked difference from local main. No Git index or history writes occurred.

SHA-256:

```text
0f2c248e5d984b8f96946536ae000912a7dccebb3c8b40926f403ac6a9975aec  packages/db/src/commercial-integrity-repository.ts
dfcca2136da7cb1835e7df333e9918b26830420b298132d7de0f7a69ddc5da1e  packages/db/test/later-commercial-integrity.integration.test.ts
236173044631ce1c6e637381bd82ea1c661192f1ca95945404fb26732715aea1  packages/db/src/commercial-integrity-application-repository.ts
ec6d3dd219e42707fe0bd6b0550db7f4f260f36c55ff9fee0d36bde831586ef2  apps/api/src/auth/context-boundary.test.ts
a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca  packages/core/src/watchdog.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6  packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f  packages/db/test/command-replay-contract.integration.test.ts
```

The unchanged command application hash was also computed directly from `git show origin/main:packages/db/src/commercial-integrity-application-repository.ts` and matches. Other unchanged tracked files are covered by the exit-zero out-of-lane diff comparison, rather than a new permanent pinning test.

## Inspection and environment command record

Read-only inspection used `pwd`, `git status --short`, `git rev-parse HEAD origin/main`, `git branch --show-current`, `cat`, `sed -n`, `rg -n`, `rg --files`, `head`, `nl -ba` and `ls -l` to inspect the authorities, lane tooling, package scripts/configuration, migrations, repository, existing fixtures/tests, installed executables and source paths described above. Successful reads/search pipelines exited 0; no tests or migrations were executed by inspection.

Nonzero exploratory batches (not validation passes):

- Initial `pwd && git status --short && git rev-parse HEAD origin/main && cat AGENTS.md && cat config/lanes/later-b20.json`: exit 1, missing lane file.
- Package-path probes found no `packages/db/test/activation-v3-fixture.ts`, `packages/db/src/quote-acceptance-repository.ts`, `packages/db/src/quote-acceptance.ts`, `.npmrc`, `node_modules/.bin/pnpm`, `/opt/homebrew/bin/pnpm` or `/usr/local/bin/pnpm`; glob probe `node_modules/.pnpm/pnpm*` ended its batch with exit 1 (`no matches found`). Existing source helper was located with `rg` in `packages/db/src/demo-seed.ts`. No file was created at any guessed source path.
- `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --version`: interrupted, exit 130; downstream memory/disk statements in that batch had not run.
- `export PATH="$HOME/Library/pnpm/bin:$PATH"; PNPM_MANAGE_PACKAGE_MANAGER_VERSIONS=false pnpm --version`: interrupted, exit 130.
- `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --manage-package-manager-versions=false --version`: interrupted, exit 130. A preceding temporary-directory filename search only read file names.
- Read cached pnpm wrapper files and confirmed cached pinned CLI locations with `cat`, `ls -l`, and `rg --files`: exit 0 for the located files. `chmod +x /private/tmp/jg-later-b20-bin/pnpm` and `/private/tmp/jg-later-b20-bin/pnpm --version`: exit 0; version 10.28.1, zero installs/downloads.
- `node --version`: exit 0, v24.17.0. Repeated `memory_pressure | tail -1`, `df -g /System/Volumes/Data` and exact `python3 -c 'import os; s=os.statvfs("/System/Volumes/Data"); print("available GiB:", s.f_bavail*s.f_frsize/1024**3)'` observations: exit 0, values recorded above. Disk declined during shared-machine activity and build; no deletion was attempted.
- `git diff --check` was additionally run during implementation twice, both exit 0, zero whitespace errors. SHA-256 source/test hashes were captured before the query change (exit 0), then after final source changes (exit 0). Read-only status/diff/base observations remained scoped to these same four allowed files, exit 0.

All edits used `apply_patch` successfully, including the temporary pinned-CLI wrapper, intended commit-message file, new test, query and two handoff documents. No shell command wrote Git state, started a server, sent an external message or deleted business data. Tool-session polling only collected existing command output; the three interrupted global version probes are explicitly accounted for above.

Final head SHA: **31682762c903d716657c573e1b5deae63588aad7**. This identifies the unchanged base, not a commit containing this uncommitted patch. Dispatcher must commit, rerun lane/CI checks and obtain independent RED verdicts; PARK remains mandatory.

Final handoff observations: `git diff --check && git status --short && git rev-parse HEAD` exited 0, showed the same four allowed files and unchanged HEAD. A read-only Python inspection of those four files exited 0, reported zero trailing-whitespace issues, counted ten `it` cases in the new test file, and confirmed `/private/tmp/jg-msg-later-b20.txt` exists. Neither command ran a test or generated build output. This documentation-only observation was the last receipt update.

