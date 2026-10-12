# TRAIN-LANE-1 builder receipt — 12 October 2026

Builder receipt only — not independently verified, not accepted.

## Authority and scope

Issued by the dispatcher on the coordinator's 12 October ruling, with Q1–Q5 as answered in the issued header. Check lane RED: fresh Opus plus a separate Sol 6.1 high check on the dispatcher's exact committed head, followed by separate acceptance. This receipt is builder evidence and self-review only.

Ben's card `jobguard-train-branches-on-github-2026-10-11`, answered 12 October, allows these exact words:

> The proposed change would accept a branch named train/… only on a draft pull request that is never merged, and only when every commit on it is a merge of a piece that is already registered and approved. Anything else on that branch would still be refused. It edits the checking tool itself, so it would be built and checked at the strictest level.

Q1 leaves approval as the integrator's CHECK-LANES section 9 duty. The following sentence appears verbatim in the lint header, in the train success output, and here:

This tool verified only that every commit is a clean merge of main or an exact current branch tip that passes its own lane check; it does not verify that any piece is approved (verdicts live off-branch).

CHECK-LANES and operations guides are outside the allow list and were not edited. Q2 permits exactly one workflow addition: `types: [opened, synchronize, reopened, ready_for_review]`. Q3 treats a pull-request head as an exact GitHub branch tip. Q4 places all new tests in `tools/agent-lane-boundary-train.test.mjs`; the existing test file has zero diff. Q5 permits the specified name pattern and base branch `main`.

The clean checkout and `origin/main` initially both pointed to `18743cb5aad8578960296ad2fd60c104cb16e90e`. Branch: `codex/sandbox/train-lane-1`. During the build, the shared `origin/main` ref advanced to `d58560e39bd726dc3eba08e763ef465d98b23cb0` (ENT-4a-ALIGN). The worktree HEAD remains the issued base. Its actual changes are confined to the allow list; comparisons to the newer remote additionally show the intervening main changes. The dispatcher must refresh the branch before the exact-head CI/reviews. No repository history was written by the builder.

First change: one compact `train-lane-1` lane line, after `test-stab-5` and before `uiwire-1`. Exactly the five issued scopes, substituting the new test filename as required by Q4. The lint, workflow and lane registry are shared checking files; CI-TIME-2 was already merged into the starting base. Its 45-minute checks limit is preserved. Integration of subsequent shared-file changes must serialize through the dispatcher.

No migration, database change, API change, AI/prompt change, UI change, dependency change, commercial-policy change or new operational alert. Rule 9 is inapplicable. Rules 11 and 12 apply; no credential-shaped fixtures and no standing byte/hash pins of shared or unowned files were added.

## Rule and enforcing lines

References below are to `tools/agent-lane-boundary-lint.mjs` in the final working tree.

| Rule | Enforcement |
| --- | --- |
| T1 exact `pull_request` event | 219, after unchanged event validation |
| T2 whole train name, lower case groups, at most 64 characters, no trailing line break | 49–50; used at 219 |
| T3 both explicit lane sources absent | 219: no lane arguments and `AGENT_LANE === undefined` |
| T4 zero matching lanes in today's checked-out policy | 25–28 and 219, using the same matching expression as `selectLane` |
| T5 event-file JSON boolean `draft === true` | 70 |
| T6 event-file base branch exactly `main` | 71 |
| Existing version/no-fallback policy checks | 73–76; malformed matching data falls through to the original selector at 222 |
| C1 full history and available write-tree merge computation | 79 and 85–96 |
| C2 nonempty first-parent train, exactly two actual parents per train commit | 131–145; reads commit headers, ignores commit messages, does not use replacement objects |
| C3 main-side first, otherwise exact origin tip and each piece's own valid lane | 138; 97–126: ignore origin/HEAD, exact SHA lookup, merge base with that piece, read that tree's policy, call original selector, refuse differing lane names, check piece paths |
| C4 clean plain merge and exact tree equality | 88–94 and 139–142; conflict status 1 is refused; changed trees list every differing path |
| C5 at least one registered second parent | 146 |
| C6 separately compute final base-to-head path union | exported pure function 52–54 and 147–149 |
| Exact accepted heads and merge order in success log | 150–151 and 240; train-only approval sentence at 241 |
| Refusal prefix and scratch cleanup | 68, 152–157 |

All new Git commands use `execFileSync("git", [...])`, with no shell interpolation. Refs use `--end-of-options` where accepted. Merge computation fixes `merge.renames=true` and `merge.directoryRenames=conflict`. Scratch objects layer over repository objects using a C-style quoted alternate path; only the newly created scratch directory is removed. The passing and refusal fixtures confirm no repository object-file, ref or status changes. There is no network action or provider credential in the lint, and no option/environment escape from its checks.

`matches` is byte-identical. The only `selectLane` change is the permitted verbatim extraction:

```diff
-  const found = Object.entries(config.lanes).filter(([, lane]) =>
-    lane.branches?.includes(branch) || lane.branchPrefixes?.some((prefix) =>
-      prefix && (branch === prefix || branch.startsWith(`${prefix}-`))));
+  const found = matchingLanes(config, branch);
```

The original matching expression is now at lines 21–23, with exactly one copy. All selector returns and error messages are unchanged. The original `inspectLane` Git commands, event checks, local file collection, ordinary return and ordinary error messages remain in place. The CLI adds a line only for a train result.

## Tests first and acceptance coverage

The final 43-case file was run against the unchanged main lint and unchanged main workflow: **exit 1; 43 tests, 5 passed, 38 stopped passing, 0 skipped**. Every TL-P case was refused with the existing `found 0` message (the CLI case exposes that through its subprocess error). TL-D1, D2, D3, D4 and D6 already passed. Then the final implementation and one workflow addition were restored: **exit 0; 43 tests passed, 0 skipped**.

The default seed is built with `git init -b main`, actual commits, exact remote refs and actual `--no-ff` merges. Copies into separate temporary repositories avoid rebuilding identical history for each case. Custom self-registration fixtures build their own histories. No test writes this repository's Git history.

| ID | Cases / assertion | Unchanged lint | Final implementation |
| --- | --- | --- | --- |
| TL-P1 | two exact registered heads; ordered pieces, full SHAs, head-first commits, union of files, null lane | refused: found 0 | pass |
| TL-P2 | each piece registers its own separated policy entry | refused: found 0 | pass |
| TL-P3 | advanced main plus GitHub-style merge checkout; no main-only file in result | refused: found 0 | pass |
| TL-P4 | one piece | refused: found 0 | pass |
| TL-P5 | repository objects, refs and status unchanged after pass, draft refusal and recomputed-tree refusal; staged/untracked changes preserved | refused: found 0 | pass |
| TL-P6 | approval-limit sentence printed for train CLI pass, absent for ordinary CLI pass; logged exact heads | refused: found 0 | pass |
| TL-R1 | five cases: extra inside scope, extra outside scopes, altered contents, dropped file, ours strategy; full merge SHA and differing path | refused before train assertions | all 5 pass |
| TL-R2 | same-line content and adjacent-policy-line conflicts, resolved by hand; plain merge conflict and piece leaves train | refused before train assertions | both pass |
| TL-R3 | ordinary top commit, empty top commit, ordinary between merges, fast-forward piece head, one-parent merge-style message; SHA and parent count | refused before train assertions | all 5 pass |
| TL-R4 | three parents, reversed parents, zero parents | refused before train assertions | all 3 pass |
| TL-R5 | false, missing, null, text true, number 1; separate environment/label/title/body decoys | refused before train assertions | both tests pass |
| TL-R6 | no lane, local only, parent of exact tip, child of tip, sibling-only registration, integration lane, other train, two differing lanes | refused before train assertions | all 8 pass |
| TL-R7 | exact tip edits database path outside its own lane; SHA, branch, lane and path | refused before train assertions | pass |
| TL-R8 | non-main and missing base ref | refused before train assertions | pass |
| TL-R9 | main-side merges only | refused before train assertions | pass |
| TL-R10 | shallow clone; full-history refusal | refused before train assertions | pass |
| TL-R11 | invalid policy version and fallback policy remain refused | ordinary policy error, no train prefix | pass |
| TL-U1 | independent pure C6 function returns both outside paths | function not yet present | pass |
| TL-D1 | all 22 invalid names, including 65 characters and trailing newline; whole original message | pass | pass |
| TL-D2 | local, push, explicit environment lane, explicit argument lane, pull_request_target; whole original messages | pass | pass |
| TL-D3 | expressly registered train name uses ordinary lane; pass and full cannot-edit message with true/false/missing draft | pass | pass |
| TL-D4 | direct selector still gives whole found-0 message | pass | pass |
| TL-D5 | existing file unchanged, all 23 existing tests run separately | existing file preserved | 23 pass |
| TL-D6 | malformed policy cannot enter train rule; whole original policy/type messages | pass | pass |
| TL-W1 | honest-mistake guard on owned ready_for_review trigger line, no shared-file byte pin | stops passing | pass |

C6 is called directly because genuine histories with these outside paths are refused first by C3 or C4. That separate test is not presented as a reachable bypass of those earlier rules.

Earlier exploratory runs are also recorded: the initial ungrouped 67-case run exited 1 (26 passed, 41 stopped passing). Its workflow read occurred after the proposed workflow line was written, so it is not the authoritative unchanged-workflow baseline. The grouped 41-case unchanged-lint/workflow run exited 1 (4 passed, 37 stopped passing). An already-staged dropped-file fixture needed `git rm -f` in its own temp repository; no assertion changed. Two implemented 41-case runs exited 0 with 41 passes each. Self-review then added D6/R11 and the corresponding malformed-policy preservation, leading to the final 43-case baseline and pass above.

## Negative controls

Temporary working-copy controls only; no control script or switched check is committed. Each run used:

`node --test --test-concurrency=2 --test-name-pattern '<pattern>' tools/agent-lane-boundary-train.test.mjs`

These are focused file selections, not claims of running all cases. The driver restores the exact starting lint in a `finally` block. Each control exits 1 and causes the following named tests to stop passing:

| Check switched off | Pattern | Tests / passes / stops passing | Named cases that stop passing |
| --- | --- | --- | --- |
| T5 draft predicate | TL-R5 | 2 / 0 / 2 | boolean-value matrix; all draft decoys |
| T2 name predicate | TL-D1 | 1 / 0 / 1 | whole-message invalid-name matrix |
| C2 parent-count guard | TL-R3\|TL-R4 | 8 / 1 / 7 | every R3 case, three parents, zero parents |
| C3(i) no-exact-tip guard | TL-R6 | 8 / 5 / 3 | local only, parent of tip, child of tip |
| C3(ii) no-selected-lane guard | TL-R6 | 8 / 4 / 4 | no lane, sibling registration, integration lane, other train |
| C3(iii) own-path guard | TL-R7 | 1 / 0 / 1 | own-lane path refusal with piece identity |
| C4 tree-equality guard | TL-R1 | 7 / 2 / 5 | every R1 case; pattern also selects the passing R10 and R11 cases |

Some controls cause the specific required reason to stop matching while a later check still refuses the input; this proves the named guard/assertion is exercised and does not claim every removed guard independently produces an accepted train. The controls were first run on the 41-case implementation and repeated on the final 43-case implementation. The final diff contains no switch.

## Stated limits

- **L1:** Approved cannot be seen by the lint: verdicts live outside the branch until merge. The lint enforces registered, exact current head, passing its own lane. Only fully checked pieces belong on a train; CHECK-LANES section 9 step 1 remains the integrator's duty. A train exposes nothing that each piece's pull-request run does not.
- **L2:** Pull-request existence cannot be seen offline. The lint sees branch tips; a registered pushed branch with no pull request counts as a registered head.
- **L3:** Draft is the event-time flag. Manually re-running an old run replays its old file. Never-merged discipline rests on GitHub's draft restriction, the new ready_for_review trigger, and the people who merge.
- **L4:** A tick covers the exact printed piece heads. Later branch movement does not re-run the train. CHECK-LANES section 9 step 3 compares main's tree to the train's tree.
- **L5:** Policy registration is self-service as before: a piece can register itself in its own diff; reviewers read that line.

## Self-review

Read the complete diff against `origin/main`, distinguishing the intervening ENT-4a-ALIGN main changes from this worktree's own changes against its fixed starting HEAD. New untracked tests and this receipt were also read in full. The malformed-policy gate issue found during this pass was corrected and covered by D6/R11.

The checkers' first question: **No**, an ordinary train commit, a hand-edited merge or an unregistered non-main-side second parent cannot pass (R1–R4, R6–R7). **No**, an ordinary non-train branch is not accepted or refused differently (D1–D4, D6, and the unchanged 23 tests).

- Input outside the train rule changes a Git command, return value or message: **no**. The original path remains unchanged; malformed matching data falls back to its original selector error.
- One-parent train commit can pass: **no**, C2 and every R3 case.
- Non-main-side second parent other than an exact current branch tip can pass: **no**, C3(i), R6 local/parent/child cases. Main-side parents are the expressly ordered exception.
- Piece registered only by a sibling can pass: **no**, the base-plus-that-piece tree supplies policy, R6 sibling registration.
- One-byte tree difference can pass: **no**, tree object identity and path diff, R1 altered contents and other cases.
- Draft decided by anything other than event-file boolean: **no**, R5 includes all ordered values and decoys.
- An error path ends in a pass: **no**. The one expected selector found-0 error marks eligibility; every unexpected selector/Git/output/cleanup error is refused. Ancestry status 1 means the expressly expected non-ancestor result.
- Tool writes into the repository: **no**, recomputation writes only scratch objects; P5 checks object files, refs and status after pass and refusals.
- Branch name or SHA is part of a shell line: **no**, all Git arguments remain arrays.

The sole acceptance relaxation is the explicitly authorized train path under T1–T4, subject to T5–T6 and C1–C6. No ordinary check is loosened, skipped or made optional. No existing assertion was edited. The workflow adds a run and removes no trigger, step, permission or check; its complete workflow diff is exactly the one added types line. Both RED reviewers must independently confirm those points on the committed diff.

## Commands and actual results

Environment: Node `v24.17.0`, Git `2.50.1 (Apple Git-155)`, cached pnpm `10.28.1` verified by `COREPACK_ENABLE_NETWORK=0 corepack pnpm --version` (exit 0). No install was run. The globally selected pnpm launcher attempted registry verification of the requested version and was refused when lookup failed; subsequent commands use the already cached, exact pin through Corepack with network disabled. `/private/tmp/jg-train-pnpm-bin/pnpm` is a temporary Corepack shim so nested pnpm scripts use the same pin. It is outside the repository and is not part of the diff.

The test commands were run one at a time, with file concurrency at most two. Earlier fixture setup was made cheaper by copying an actual Git-built seed, without sharing mutable fixture repositories. No full test suite was run locally.

| Command actually run | Exit / result |
| --- | --- |
| `node --test --test-concurrency=2 tools/agent-lane-boundary-train.test.mjs` against original lint/workflow, initial ungrouped file | 1; 67 tests, 26 passes, 41 stop passing; exploratory, not authoritative unchanged-workflow evidence |
| same command against original lint/workflow, grouped 41-case file | 1; 41 tests, 4 passes, 37 stop passing |
| same command against implemented 41-case file, twice | 0 both times; 41 passes each |
| same command against original lint/workflow, final 43-case file | 1; 43 tests, 5 passes, 38 stop passing; every TL-P exposes found 0 |
| same command against final implemented 43-case file | 0; 43 passes, 0 skipped |
| `node --test --test-concurrency=2 tools/agent-lane-boundary.test.mjs`, twice including after final lint edits | 0 both times; 23 passes each, 0 skipped; existing file unedited |
| focused negative-control commands listed above, each repeated on final implementation | each 1; named tests stop passing, no skipped tests reported; driver restores exact lint bytes |
| `cmp tools/agent-lane-boundary-lint.mjs /private/tmp/train-lane-built-final.mjs` after controls | 0; exact restoration |
| `git hash-object tools/agent-lane-boundary.test.mjs` | 0; `83803f113018110c809821e1d6858e5d6432589b` |
| `git diff --numstat origin/main -- tools/agent-lane-boundary.test.mjs` | 0; empty output, zero diff |
| `git diff --numstat HEAD -- config/agent-lane-assignments.json` | 0; one insertion, zero deletions |
| JSON parse of lane file using Node `JSON.parse(readFileSync(...))` | 0; version 2, exact assigned branch and scopes |
| YAML parse using installed `js-yaml@4.3.2`, `yaml.load(readFileSync(...))` | 0; PR types opened, synchronize, reopened, ready_for_review |
| `git diff origin/main -- .github/workflows/ci.yml` | 0; exactly one added types line; existing 45-minute limit unchanged |
| `node --check tools/agent-lane-boundary-lint.mjs` and `node --check tools/agent-lane-boundary-train.test.mjs` | 0 after correcting an initial construction syntax typo; tests subsequently execute the final module |
| `node /private/tmp/train-lane-inspection.mjs` | 0; matches unchanged, selector only permitted verbatim move, all actual working-tree changes inside lane. Initial receipt-only scope probe removed the first status space incorrectly and exited 1; corrected probe reads null-delimited path lists. No standing test added. |
| `COREPACK_ENABLE_NETWORK=0 corepack pnpm typecheck --concurrency=2 --no-daemon` | 0; 7/7 Turbo tasks successful, 7/7 cached; not a fresh compiler run |
| `PATH=/private/tmp/jg-train-pnpm-bin:$PATH COREPACK_ENABLE_NETWORK=0 pnpm build --concurrency=2 --no-daemon` | 0; 7/7 Turbo tasks successful, 7/7 cached; not a fresh build |
| `PATH=/private/tmp/jg-train-pnpm-bin:$PATH COREPACK_ENABLE_NETWORK=0 pnpm openapi:check` | 1; NOT EXECUTED: sandbox refused tsx IPC listen, `EPERM`, before schema comparison |
| `git diff --check` | 0 |

The old file's full hash and zero diff replace the draft's partial-file hash command, as ordered by Q4. They are receipt evidence, not a committed byte-pinning assertion. Source-inspection probes and hashes are not presented as independent model checks.

Sandbox diagnostic: `ps -axo pid,ppid,etime,command` inside a progress probe was refused with `zsh: operation not permitted: ps` (compound probe exit 1). That diagnostic was stopped; no process-list alternative was used. All Git history operations in temporary test repositories ran successfully; no test was marked passed without running.

Final lint commands, both using the cached pin and no network:

- `PATH=/private/tmp/jg-train-pnpm-bin:$PATH COREPACK_ENABLE_NETWORK=0 LANE_BASE_REF=origin/main pnpm lint:lanes` — **exit 0**, ordinary `train-lane-1` lane; five changed paths, all inside its allow list.
- `PATH=/private/tmp/jg-train-pnpm-bin:$PATH COREPACK_ENABLE_NETWORK=0 LANE_BASE_REF=origin/main pnpm lint` — **exit 0**, root purity/lane/money/commercial checks executed; 7/7 package lint tasks successful, 7/7 cached. Full root lint was run once.

The pre-commit self-comparison refusal did not occur because `origin/main` advanced during the task. Both local lint logs name base `d58560e39bd726dc3eba08e763ef465d98b23cb0`, head `18743cb5aad8578960296ad2fd60c104cb16e90e`, and the five working-tree paths. These are local working-tree checks, not a committed PR-head or GitHub train pass.

## NOT RUN / remaining gates

- Fresh pinned install: NOT RUN, dependencies supplied installed and package downloads not permitted. Typecheck/build/package-lint results above are cached task successes, not fresh compiler/build execution.
- Whole `pnpm test`: NOT RUN, explicitly prohibited by this order's memory limit. The two specified Node test files and focused controls actually ran.
- PostgreSQL, migration and browser suites: NOT RUN; no migration or business/browser change, and this sandbox cannot start PostgreSQL or bind sockets. Existing mandatory CI scripts and assertions remain unchanged.
- OpenAPI comparison: NOT EXECUTED after the actual command exited 1 with IPC `EPERM`. No alternative execution or permission workaround was attempted.
- AI evaluations and native/device suites: inapplicable; those components are not changed.
- GitHub run on the pushed, refreshed exact head and first real train on runner Git 2.55: NOT RUN. Existing Mac trains continue until that first real train passes.
- Fresh Opus + separate Sol 6.1 high verdicts, each bound to the exact committed head and explicitly confirming ordinary-branch behavior and no workflow check made weaker/optional, plus separate acceptance: outstanding, owned by the dispatcher/integrator. No model verdict or acceptance is claimed here.

The dispatcher commits the exact working-tree change, refreshes from current main, pushes and obtains the RED checks. No automatic train creation, push, PR opening, readying, merge, protection change or approval-head registry is included.

Intended commit message written to `/private/tmp/jg-msg-train-lane-1.txt`.

Builder receipt only — not independently verified, not accepted.
