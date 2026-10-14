# ENT-10e r3 command journal — 13 October 2026

Actual builder: Codex. Git reads only; no commit, add, checkout, merge, rebase, fetch or push. No database/browser test execution. Test assertions and source inspections are different evidence.

For successful pnpm checks the shell prefix was exactly:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/jg-ent10e-bin:$PATH"
```

The temporary `pnpm` shim executes the already cached `node "$HOME/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs" "$@"`. It changes no repository configuration, package pin or lockfile and downloads nothing. Node reported v24.17.0; pinned pnpm reported 10.28.1; Turbo 2.10.12 and Vitest 4.1.11 are the installed tools. Unit runs also exported `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`. Each heavy run was preceded by `memory_pressure | tail -1` and `df -g /System/Volumes/Data`: observed free memory 72–74%, disk 51–52 GB. Build and tests did not overlap. No heavy database/browser run was attempted, so no heavy-slot invocation was made.

| Command | Exit | Observed result / counts |
| --- | --- | --- |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/sso/sso-emergency-owner.test.ts src/auth/sso/sso-required-unlinked.test.ts` through the initial global launcher | 130, interrupted with Ctrl-C | Stalled before Vitest output; no test count. The launcher was pnpm 11 and attempted automatic version handling. |
| `pnpm --manage-package-manager-versions=false --version` | 130, interrupted | Same stalled launcher; no tests. |
| `npm_config_manage_package_manager_versions=false pnpm --version` | 130, interrupted | Same stalled launcher; no tests. |
| `npm_config_pm_on_fail=ignore pnpm --version` | 130, interrupted | Same stalled launcher; no tests. |
| `node apps/api/node_modules/vitest/vitest.mjs run --maxWorkers=2 apps/api/src/auth/sso/sso-emergency-owner.test.ts apps/api/src/auth/sso/sso-required-unlinked.test.ts` | 1 | First failing unit attempt, before implementation: 2 failed suites, 0 tests collected. `Failed to resolve entry for package "@jobguard/db"`; dist did not exist. This is a dependency-resolution failure, not an observed failing business assertion. |
| `pnpm --pm-on-fail=ignore --version` | 0 | Reported 11.8.0, establishing the launcher mismatch. |
| `pnpm exec turbo run build --filter=@jobguard/api... --concurrency=2 --force` with `pnpm_config_pm_on_fail=ignore` under pnpm 11 | 1 | Launcher tried its internal dependency verification/install; engines refused expected pnpm 10.28.1, got 11.8.0. No build task ran. No deliberate package install/download command was issued. Pins/lockfile unchanged. |
| `pnpm exec turbo --version` with `pnpm_config_pm_on_fail=ignore pnpm_config_verify_deps_before_run=false` | 0 | Reported 2.10.12; diagnosis only, no package installation. |
| `node "$HOME/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs" --version` | 0 | Found cached pinned 10.28.1; all substantive pnpm checks below use it. |
| `pnpm exec turbo run build --filter=@jobguard/api... --concurrency=2 --force` | 0 | 6 tasks successful, 0 cached; packages needed by API unit imports built. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/sso/sso-emergency-owner.test.ts src/auth/sso/sso-required-unlinked.test.ts src/auth/sso/sso-emergency.test.ts` | 0 | 3 files, 30 tests passed (21 new, 9 inherited). |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/sso/sso-required-disclosure.test.ts` | 0 | 1 file, 17 tests passed. Total executed: 47 passed, 0 failed. |
| `pnpm --filter @jobguard/api openapi:generate` | 1 | STOP this item: tsx IPC socket `listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/54459.pipe`. No alternative generator route or manual spec rewrite attempted. `apps/api/openapi.json` unchanged; regeneration is outstanding. |
| `pnpm exec tsc -p /private/tmp/jg-ent10e-tests-tsconfig.json` | 0 | Targeted compile of the five own database files plus their imported types. No PostgreSQL executed. |
| `pnpm exec turbo run typecheck --force` | 0 | 7 tasks successful, 0 cached; real typecheck scripts executed. |
| `LANE_BASE_REF=4db73817ab7b3be4993fe8b01279ac0e1b8cf836 pnpm lint --force` | 1 | Core purity passed (151 TS files). Lane stage refused 42 inherited merged paths outside ENT-10e. Turbo lint did not run in this invocation. No lane widening or unrelated repair. |
| `LANE_BASE_REF=4db73817ab7b3be4993fe8b01279ac0e1b8cf836 pnpm lint:lanes` | 1 | Same historical-base failure, 42 inherited paths. These paths are not builder edits in r3. |
| `pnpm exec turbo run lint --force` | 0 | 7 package lint tasks successful, 0 cached; separate unaffected check, not a claim that the failed root lint passed. |
| `pnpm build --concurrency=2 --force` | 0 | 7 tasks successful, 0 cached, including production Next build and new detail route. Existing Next root inference/CSS warnings; Turbo emitted shared-cache `IO error: Operation not permitted` warnings, but executed each task. No cache write workaround. |
| `pnpm exec tsc -p /private/tmp/jg-ent10e-tests-tsconfig.json` (after database-test repairs) | 0 | Same targeted compile, not a database run. Later test-only query/setup strengthening does not change application code. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Explicit environment-note base, scope passed; origin/main was e4cb8437d044746300c377647f6061d06cd960cc, HEAD a390b73. Both original-base failures retained above. |
| `node /private/tmp/jg-ent10e-assertions.cjs` | 0 | TypeScript AST extracted each individual old expect. |
| `python3 /private/tmp/jg-ent10e-tables.py` | 0 | Complete before/after table: 100 old expect calls across the two database and two unit files, plus every touched database line. |
| `git diff --check` | 0 each time run | No whitespace errors. |

Inspection and authoring invocations also ran; they did not execute tests. Repository reads used `pwd`, `git status --short`, `git rev-parse HEAD`, `git log -5 --oneline`, `git rev-list --left-right --count HEAD...origin/main`, `git diff --name-only HEAD...origin/main`, `git diff $(git merge-base HEAD origin/main) HEAD --name-only`, `git log --oneline --all --max-count=35`, `git diff HEAD...origin/main -- apps/api/src/workspace/application.ts config/agent-lane-assignments.json packages/db/src/migrate.ts`, and legacy read-only `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` filtered for conflict markers. No actual merge conflict was found at initial HEAD. Main moved externally during this round: initial 6659fb5, later e4cb843; builder HEAD did not move. Some conflict-marker search results were quoted historical journal strings, not merge conflicts.

Read-only `cat`, `sed -n`, `rg`, `rg --files`, `head`, `ls` and `stat -f` inspected AGENTS.md, the applicable BUILD_PLAN sections, the issued ENT-10d order and standing handoff, the whole 0129 migration, 0111/0120/0054 mechanisms, repository/application/contracts/controllers/routes/composition, all seven ENT-10d test files, context-boundary scanner and its approved paths, contracts/data-flow/receipts, migration runner and upgrade examples, manifests/tsconfig/Turbo config, and installed pnpm launcher/config code. The early batch reading contract/package/source files returned exit 0; output was sometimes truncated, and focused reads followed. A batch ending in `rg -n 'CREATE TABLE identity.identity_user' ...` returned 1 because the file uses `CREATE TABLE IF NOT EXISTS`; subsequent focused reading confirmed the definition. Missing `.npmrc`, alternate pnpm paths and absent dist/cache/output paths produced ordinary diagnostic errors inside otherwise completed inspection shells.

The process-inspection subcommand `ps -axo pid,ppid,etime,command` was refused: `zsh:1: operation not permitted: ps`. That item was stopped and was not retried by any route. The surrounding read-only shell exited 0; that is not a claim that ps worked. No approval reviewer rejection occurred.

Authoring shell invocations exited 0: Python baseline capture (160 hashes and four test source baselines); two unit-file heredocs; permitted emergency-fixture re-points and independent database fixture/test authoring; D4/D5/D6 acceptance heredocs; D2 E1–E9 heredoc; `python3 /private/tmp/jg-ent10e-migration.py`; source/contracts/transport/composition and permitted unit-case update script; docs append script; temporary pinned launcher creation (`mkdir -p`, heredoc, `chmod +x`); targeted test tsconfig heredoc; test-only repairs/strengthening; six-routine read comparison and preservation scan; acceptance inventory and protected hash proof; AST/line table and gate-read receipt files; receipt/message writes and final verification. Migration drafting started from the 0129 text and all six replacements were compared exactly to their single-read transformations (exit 0). Source inspection confirmed both command/append routines absent from 0143 replacements and all old expectation texts present except the approved equality enrichment.

These checks intentionally did not run repository/package test suites, PostgreSQL, browsers, migrations against a live cluster, live IdP, native/eval or reviewers. `pnpm openapi:check` is NOT RUN after the generator's IPC permission refusal: it invokes the same refused tsx runner. The dispatcher must run generation/check in its capable environment. Full database/browser/regression command list is in the builder receipt.

Final scope-count inspection: an ephemeral Python assertion guessed 43 inherited out-of-lane paths; the read-only diff actually returned 42, so that script raised AssertionError (Python exit 1, surrounding multi-command shell exit 0). The receipt/journal counts were corrected to the observed 42. No permanent or merged expectation changed. Subsequent protected/sign-in hashes and OpenAPI unchanged checks passed (exit 0).

Artifact preservation Python invocation: exit 0, moved 15 own generated outputs to `/private/tmp/jg-ent10e-r3-build-artifacts-ukyu_jqb` using rename, no deletion. Pre-existing .pnpm-store retained and disclosed.

Final source/scope/ancestry/assertion/hash Python verification exited 0 (15 tracked edits and 13 new files at its snapshot, before creating its own R3_FINAL_SCOPE.md); 91 protected hashes verified, 100 old expect calls accounted for and exactly two grants. git diff --check exited 0. The final LANE_BASE_REF=origin/main pnpm lint:lanes also exited 0 after receipt/artifact work; no lane widening. Final working-tree new-file count becomes 14 with R3_FINAL_SCOPE.md itself. Intended commit message at /private/tmp/jg-msg-ent-10e.txt was verified current.
