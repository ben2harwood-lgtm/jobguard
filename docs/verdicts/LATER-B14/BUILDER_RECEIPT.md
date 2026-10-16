Built by Codex; dispatched 13 Oct 2026

Actual execution date: 16 Oct 2026. The dispatch addendum's requested first-line attribution (“Built by Claude Sonnet 5.5, Codex unavailable; dispatched 13 Oct 2026”) is inaccurate for this run; the builder was Codex. No independent review or acceptance is claimed.

# LATER-B14 builder receipt

Status: implementation prepared, UNCOMMITTED, RED checks pending, PARK under decision 74. Acceptance is PARTIAL because PostgreSQL/upgrade execution, OpenAPI, lane verification and independent verdicts are outstanding. No commit, push, merge, deployment, enablement, real data, real spending, outward message or permanent deletion was performed. Intended commit subject/body is in `/private/tmp/jg-msg-later-b14.txt`.

## Baseline and authority

Branch: `codex/sandbox/later-b14`. Initial working tree was clean. HEAD and local origin/main are `7ff452eeec1c523345d34715adfa3f8310062013`, newer than issued base `ca435eeb5791638c787c830d6ba717146f694539` and draft base `0bbb5ddb`. Local main wins; no fetch or Git write was performed.

Verified the order's citations against current main: BUILD_PLAN C5 at line 117 still requires payload-bound replay; M1-8 at line 386 still names pure checks, finding fingerprints and Decision inbox; Appendix A at line 3849 still says “Mandatory lane remains visible/blocking.” On current main, `decisions.application.ts:12` contains the fixed proof snapshot and ignores the supplied check ID. The repository's inbox query is at lines 13–21 (the draft's line 17 is its FROM clause); `persistFindings` is still at line 7. Source files and applicable plan contracts were inspected before edits. The full repository AGENTS.md was read.

Installed Node: 24.17.0. The global pnpm launcher identifies itself as a newer version and stalled before running tests. The already-installed, cached pnpm 10.28.1 was used thereafter; `pnpm --version` returned 10.28.1. No install/download command was issued. A temporary launcher at `/private/tmp/jg-later-b14-bin/pnpm` invokes `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`, so Turbo's child processes also use the pinned version. Every pnpm shell command first exported `PATH="$HOME/Library/pnpm/bin:$PATH"`; later commands then prepended this temporary launcher. No repository configuration or shared harness was changed to resolve tooling.

## Implementation and acceptance evidence

| ID | Built behavior | Test evidence | Status |
| --- | --- | --- | --- |
| L063 | Current verified original evidence must match tenant/job/scope/type and upload object version; invalidated proof does not satisfy the requirement. The existing synthetic first-scope electrical/second-scope materials recipe is retained. | Core snapshot test passed; API delegation test passed; PostgreSQL tests cover finalized proof, invalidation, another scope and pending upload. | Unit pass; DB NOT RUN |
| L064 | Ineligible/retired scope is absent from current projection. Latest finding content/classification revision governs projection. No finding/resolution is rewritten or deleted; history remains directly readable under the tenant context. | Core content identity test passed; PostgreSQL retirement/history assertions authored. | Unit pass; DB NOT RUN |
| L065 | Same check ID returns its exact original complete response. The versioned request hash includes the job; changed job/type/payload conflicts, and strict boundaries reject extra fields. Findings, receipt and identifier-only audit commit together. | API replay/conflict/authority tests passed; PostgreSQL concurrent replay, rollback, session/ownership checks, immutable response and incomplete-phase tests authored. | Unit pass; DB NOT RUN |
| L071 | Content/classification-sensitive fingerprint gives the new mandatory output its own Decision. Current subject projection picks the newest revision before suppression/resolution; old advisory state remains historical. Missing required proof stays open despite an old resolution. | Core mandatory/suppression regression passed; PostgreSQL suppression/dismissal preservation test authored. | Unit pass; DB NOT RUN |

The two existing synthetic Decision mutation routes were already registered pre-live. No route, contractor principal path, classification rule, shared watchdog registry or SERIOUS-B8 relevance repository was added/changed. The new routine accepts only the fixed builder synthetic tenant and rechecks the persisted practice session, active owner membership and immutable inherited job ownership on every phase, before job existence/replay. It takes authority, job, command and receipt locks before finding writes; audit head allocation is the final new lock. Completed responses are guarded against rewriting; a deferred constraint rejects committing unfinished phases.

The new check identity uses the existing tenant-wide command_receipt namespace. It does not extend the separate watchdog command identity registry. Replays deliberately retain historical findings/counts, while a fresh list or new check sees current proof. There is no fresh evaluation on replay.

## Migration and every new GRANT

Migration needed and authored: `packages/db/migrations/0193_later_decision_identity.sql`. It adds one SECURITY DEFINER execution function, two receipt guard functions and their triggers. It adds no table/column, changes no earlier SQL, rewrites no old row, and leaves the discovery runner and inventory untouched.

- `GRANT EXECUTE ON FUNCTION app.decision_check_command(text,jsonb,text,jsonb) TO jobguard_runtime;`

Standard F: **zero new direct INSERT, UPDATE or DELETE grants** to jobguard_runtime on any table. The checked execution function is owned by jobguard_migration and carries its own persisted-session/owner/job checks. PUBLIC and infrastructure execution are revoked. Existing table grants are not extended. No new role or RLS policy is added.

The new upgrade proof installs everything before 0193, seeds four nonempty relevant stores, captures named pre-existing columns/full format_type types and canonical row_to_json text matched by primary-key identity, applies 0193 alone as migration owner, compares, then runs all later migrations twice and compares again. Rolled-back controls reject a one-microsecond mutation and a retype; later nullable columns, a replaced function and an extra inserted row must pass the same comparator. Fresh migration installation is covered by the separate regression suite. Both files are NOT RUN here; SQL correctness and real PostgreSQL guarantees are unverified by this builder run. TypeScript transpilation found zero syntax diagnostics in those files; that is source parsing, not test execution.

Forward fix and rollback limitations: see `packages/db/migration-notes/0193_later_decision_identity.md`. Leave applied migration/history in place; correct via a later migration. Pause evaluation before reverting to the old application because it ignores check IDs. No destructive rollback is provided.

## Executed command record

All test runs were sequential, one named file per run, with --maxWorkers=2. No full package/repository test suite was run. Build and tests never ran together. Before every heavy command, `memory_pressure | tail -1` and `df -g /System/Volumes/Data` ran successfully (exit 0): 77–78% memory free; reported free disk 35–38 GB, above the 33 GB stop line. No database/browser process or heavy-slot command was started because those runs are explicitly prohibited in this sandbox.

| Command | Exit/result | Counts |
| --- | --- | --- |
| Initial global `pnpm --filter @jobguard/core exec vitest run src/decision-checks-later.test.ts --maxWorkers=2` | Interrupted, 130; stalled before runner | 0 tests |
| Same command with `npm_config_manage_package_manager_versions=false` | Interrupted, 130; still stalled | 0 tests |
| Pinned pnpm `--filter @jobguard/core exec vitest run src/decision-checks-later.test.ts --maxWorkers=2` before implementation | 1, expected first failure | 2 failed, 1 passed; 1 file |
| `pnpm --filter @jobguard/api exec vitest run src/decisions/decisions-later.test.ts --maxWorkers=2` before implementation/build | 1, missing built @jobguard/db entry | 0 tests; collection failed |
| Core task test command after implementation | 0 | 3 passed; 1 file |
| First `pnpm exec turbo run typecheck --force --concurrency=2` | Interrupted, 130; nested global pnpm stalled | 0 completed tasks reported |
| `pnpm exec turbo run typecheck --force --concurrency=2` with pinned child launcher | 0 | 7 successful tasks, 0 cached |
| `pnpm exec turbo run lint --force --concurrency=2` | 0 | 7 successful tasks, 0 cached |
| `pnpm build --force --concurrency=2` | 0 | 7 successful tasks, 0 cached |
| API task test command after build | 0 | 4 passed; 1 file |
| `pnpm openapi:check` | 1; tsx IPC socket refused before generation | Check NOT EXECUTED |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1; self-comparison refused | No lane pass |
| `node tools/lint.mjs` | 1; its lane subprocess refused self-comparison | Core purity passed, 193 TS files; overall root tools lint failed |
| `pnpm lint:lanes` | 1; self-comparison refused | No lane pass |
| `git diff --check` (repeated after edits and final receipt) | 0 | No whitespace errors |
| `pnpm --version` through the temporary pinned launcher | 0 | 10.28.1 |
| `node --input-type=module` using TypeScript transpileModule on the two new PostgreSQL files | 0 | 0 syntax diagnostics; 9 + 2 declared tests, NOT EXECUTED |
| Python SHA-256 and git-show comparisons for ten protected files | 0 | 10/10 byte-identical to origin/main |

First failing behavioral evidence: both L071 classification change and L064 content change returned the exact same fingerprint as before. The existing pure proof-snapshot behavior already passed; the new persisted-proof path is the API/repository change. The API pre-implementation attempt failed at dependency resolution, so it is not represented as a behavioral failure. Database tests were written before their implementation, but no first failing database run is claimed.

Forced runs were real executions (cache bypass, zero cache hits). Turbo emitted `WARNING IO error: Operation not permitted (os error 1)` for its shared cache writes; tasks still exited 0. No alternate cache-write route was attempted. Build also emitted workspace-root/multiple-lockfile, existing CSS autoprefixer, file-type export and dynamic dependency warnings; build exited 0. No successful check is being inferred from a cache hit.

Source-inspection commands actually used (read-only; no test counts): `pwd`, `git status --short`, `git rev-parse HEAD origin/main`, `git branch --show-current`, `git show origin/main:<file>`, `git diff --stat`, `git diff --numstat`, `git diff --check`, `git ls-files --others --exclude-standard`; `cat`, `rg`/`rg --files`, `head`, `sed -n`, `nl -ba`, `awk` and `ls -l` inspected AGENTS.md, BUILD_PLAN.md, package/TypeScript/Vitest configuration, Decision/core/repository/proof/session/command/audit source, earlier migrations, tenancy/Decision/upgrade tests, lane tooling and the standing handoff. Successful read sequences exited 0. Read sequences exited 1 when a requested path was absent, a zsh glob matched no file, or rg found no matching rows; no source was changed by those failures. Absent inspection paths were config/lanes/later-b14.json, packages/db/test/decisions.integration.test.ts, packages/db/src/practice-finding-scopes.ts, packages/db/src/command-identity.ts, apps/api/vitest.config.ts, packages/db/migrations/0094_practice_sessions.sql, packages/db/migrations/0025_proof_completion.sql (not reached after a prior absent file), tools/lane-policy.mjs, tools/turbo-worktree-cache.mjs, root node_modules/.bin/vitest, .npmrc, and the non-cached pnpm locations inspected while locating the installed pinned CLI. Unmatched globs were packages/db/src/user-command* and packages/db/src/scope*. Final source reads and diff inspection succeeded. The exact resulting code from exit-0 heredoc/Python edits is the uncommitted diff and named new files; task-local mkdir/chmod/heredoc writes also exited 0. No pre-existing uncommitted file was overwritten.

## NOT RUN / failed checks / STOP lines

- `packages/db/test/decisions-later.integration.test.ts`: NOT RUN (cannot start PostgreSQL here; 9 tests authored).
- `packages/db/test/later-decisions-upgrade.integration.test.ts`: NOT RUN (cannot start PostgreSQL here; 2 tests authored).
- `pnpm test`, `pnpm test:db`, `pnpm test:migrations`: NOT RUN (whole-suite/database execution reserved for CI/dispatcher).
- `pnpm test:e2e`, Playwright, browser/device runs: NOT RUN (CI only; sandbox cannot start a browser/listener; no UI edits).
- AI evaluation: inapplicable; no prompt/model/extraction parser/gateway or AI matching policy changed.
- Clean reinstall: NOT RUN; dependency downloads forbidden and installed dependencies were supplied.
- RED independent Opus/Sol verdicts and separate acceptance: NOT RECORDED by builder; required before technical acceptance. Decision 74 still requires PARK even after checks.

STOP — coordinator-owned lane registration: `config/lanes/later-b14.json:1`. **Before:** file absent. **After requested of coordinator:** register key later-b14, branch codex/sandbox/later-b14 and exactly the eleven issued paths (including receipt/ledger); builder made no registry edit. No existing merged test, pinned value/list or fingerprint needs weakening for this implementation. No existing merged test was edited.

Lane guard at `tools/agent-lane-boundary-lint.mjs:303` is unchanged:
`if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");`
**Before/after:** identical; do not edit it. Dispatcher must create the intended commit and use a real comparison range, then execute lane checks after registering the missing lane. HEAD=origin/main currently makes that guard fire before lane selection.

STOP — OpenAPI: exact attempted command `pnpm openapi:check`; refusal `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/9334.pipe`. Exit 1. The generator was not reached; no alternate execution route was tried. CI/dispatcher must run it outside this restriction. No source change is requested for this environmental refusal.

STOP — optional process inspection: `ps -o pid,ppid,etime,command -ax`; refusal `zsh:1: operation not permitted: ps`. The containing read sequence exited 1 (also encountered absent .npmrc). No alternate process-list route was tried and no task behavior depends on it.

## Builder source inspection (not an independent verdict)

Reviewed the diff for retained history, current proof scoping, exact replay, session/owner checks, transaction order, all new grants and migration upgrade comparator shape. This is builder source inspection, not review/acceptance. No table/column addition avoids any need to change tenancy catalogue expectations or fingerprinted-table pins. The only new privilege is routine EXECUTE. The normal list stays current while replays intentionally remain historical. The three-phase routine cannot commit an unfinished receipt. The existing synthetic rule recipe remains a reference implementation, not a newly inferred production policy.

Limits: real PostgreSQL execution is still required to establish routine/trigger syntax, RLS, deferred-constraint behavior, concurrency, audit-chain correctness and fresh/upgrade behavior. Unit mocks prove application delegation/error mapping only. The database fixtures use synthetic metadata, not provider-verified bytes in this run. No performance benchmark or real-user evidence is claimed. The receipt namespace is separate from watchdog's registry; no global cross-registry identity guarantee is asserted. New migration/routine triggers serialize with other work in command_receipt; landing must serialize any overlapping piece rather than editing its merged tests.

## Boundary evidence

Only the eleven issued repository paths are changed/new. No shared registry, old migration, merged test, lockfile, pinned source or security assertion was edited. This section is evidence in the receipt, not a permanent hash-pinning test.

Protected files (working SHA-256; each compared byte-for-byte with current origin/main):

| Path | SHA-256 |
| --- | --- |
| `apps/api/src/auth/context-boundary.test.ts` | `ec6d3dd219e42707fe0bd6b0550db7f4f260f36c55ff9fee0d36bde831586ef2` |
| `packages/db/src/practice-session.ts` | `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14` |
| `packages/core/src/watchdog.ts` | `a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca` |
| `packages/db/test/watchdog-command-harness.ts` | `3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6` |
| `packages/db/test/command-replay-contract.integration.test.ts` | `db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f` |
| `packages/db/test/tenancy.integration.test.ts` | `e55381055ae59ed2ba74daa389856b2b1d78f01dbf951598f5c3dbffe58b30b9` |
| `packages/db/src/migrate.ts` | `d9ac38c5bae60a487b2835c1681167ea5bf985f1449469c56eec0403772c8983` |
| `packages/db/MIGRATIONS.md` | `1790932d10a34c8cd0bf2bced5426ebff39717d4c9bafe55f290795ad462356d` |
| `config/agent-lane-assignments.json` | `99fcda4daff974e76a96095f6bfaa0be8745ecfc96fbdacbf67e27052df8eb4e` |
| `pnpm-lock.yaml` | `06b501e413424d77fc5c3a1ac0f481b7230c271e36bfbde2cb953385ccccd349` |

`git diff --stat` (tracked files only; untracked additions listed separately below):

```text
apps/api/src/decisions/decisions.application.ts | 18 +++++--
 packages/core/src/decision-checks.ts            |  2 +-
 packages/db/src/decision-repository.ts          | 66 +++++++++++++++++++++++--
 3 files changed, 79 insertions(+), 7 deletions(-)
```

Task deliverables other than this self-referential receipt (working SHA-256):

| Path | SHA-256 |
| --- | --- |
| `apps/api/src/decisions/decisions.application.ts` | `9b6509d0b89abf9b61955528c8ec4b3366db4bb2569d0cba9d1f2e16e657feb3` |
| `apps/api/src/decisions/decisions-later.test.ts` | `fcff387bd2913cd54529d25f738713b47df3a02dcddfdd8e57f4107689795cd7` |
| `packages/db/src/decision-repository.ts` | `75fb63e1960c574ca9a7492bf38c8b05d6a68eeef03eecaf1a136ab6a26eed7c` |
| `packages/db/test/decisions-later.integration.test.ts` | `c881e068bd6c35aeae97245e1cdaf127d98bcd03d7b0cd32da46ad3b9dd392af` |
| `packages/core/src/decision-checks.ts` | `3f5ed953085d0dbebd26c347e955517ceafee9ba35233be5f9f27fc5d596c060` |
| `packages/core/src/decision-checks-later.test.ts` | `1144be39ef6fae3842ec58caca5722d11f065494137e8932356a22dba8721618` |
| `packages/db/migrations/0193_later_decision_identity.sql` | `ccfb6c8b21016249ea766bcd81067c30af00a227660a56a04813d1219bc9ceb5` |
| `packages/db/migration-notes/0193_later_decision_identity.md` | `58c542b4dc47c7f39269ba2c97b291714456478e4e2498be8dc2134b8855ec19` |
| `packages/db/test/later-decisions-upgrade.integration.test.ts` | `2001f9cd9b18522d0f8d5cfa891ea46d53ae6ec0a3d3a3401b0f35a43eb45977` |
| `docs/ledger/LATER-B14.md` | `e7c6f17662a6ebba5ae3c943f67a6ad3d7197699a21210d424631300c2bc9f6b` |

Final HEAD: `7ff452eeec1c523345d34715adfa3f8310062013` (unchanged; all changes are uncommitted).


## r1 — LP-0 inventory repair (dispatcher 14, 16 October 2026 night)

Prepared by Codex from clean HEAD `4cd1aa7e9ed767f8aa7b26f07d22f58027322760` on `codex/sandbox/later-b14`, PR #263. BUILD-DON'T-MERGE (Ben decision 74): uncommitted repair, PARKED pending two independent exact-commit verdicts and separate acceptance. No commit, staging, push, merge, deployment, browser, provider call or real data. The dispatcher will commit and push. This append supersedes the original receipt's claim that no shared inventory update was needed.

Authority inspected: independent check B `d14-later-b14-checkB-opus-4cd1aa7.md`, Ben decision 60 (additive rows for newly created objects, existing runtime role plus owner/routine records), ruling 70 (add exactly the named contract path to the lane), AGENTS.md and BUILD_PLAN C4–C6 / LP-0. The existing Node 24.17.0 and cached pnpm 10.28.1 launcher `/private/tmp/jg-later-b14-bin/pnpm` were used; no install or download. Available disk was 35 GB, above the dispatcher's waived night floor of 30 GB; the superseded 45 GB gate was not imposed.

Only the requested inventory, lane and receipt change in r1. `docs/contracts/lp-0-effective-privileges-v1.json` gains exactly four entries: the runtime EXECUTE fact for `app.decision_check_command(text,jsonb,text,jsonb)` and migration-owner facts for that function, `app.guard_decision_check_receipt()` and `app.require_completed_decision_check()`. The EXECUTE entry uses the existing authority group `x-command-authority-writes` / `ap-command-receipts`, because the routine owns the checked receipt lifecycle and Decision creation; owners use `a-owner-routines`. Exactly three recorded routine identities are added, since `lp-0-authority-paths.integration.test.ts` checks identity completeness including owner-only routines. Rows are inserted in the existing lexical order without changing any existing row, group, metadata, trigger record or policy. The lane gains only `docs/contracts/lp-0-effective-privileges-v1.json`.

Recorded definer, search path, trigger-return and ACL posture come from 0193. Static writes/calls were checked with `staticScan` from `packages/db/test/lp-0-catalog.ts` against its migration source and inventory names; strict `parseInventory` passed. PostgreSQL-generated definition digests are explicitly `null`, not invented from SQL source bytes. These are source-derived records, not a live catalogue read. Both receipt guard functions remain non-definer, owner-only and unexecutable by runtime/PUBLIC/infrastructure. This repair grants no database privilege, creates no object, changes no SQL or application behavior, and adds no role, table, RLS policy, migration, operational alert or compatibility impact. The only inventoried runtime capability is the existing 0193 EXECUTE grant. No other role gains anything.

### r1 executed checks

Every pnpm command used the pinned temporary launcher in PATH. Typecheck/lint/build were forced real executions, with zero cache hits and concurrency 2; unit suites used at most two workers and ran sequentially after build. Existing Turbo cache-write and Next dependency/CSS/workspace warnings were nonfatal.

| Command | Result |
| --- | --- |
| `pnpm typecheck --force --concurrency=2` | PASS, 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint --force --concurrency=2` | PASS, root tools and 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS, includes working-tree repair and original branch diff |
| `pnpm build --force --concurrency=2` | PASS, 7/7 tasks |
| `node --test tools/*.test.mjs` | PASS, 100 tests |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | PASS, 101 files / 2,720 tests |
| `pnpm --filter @jobguard/ai exec vitest run --maxWorkers=2` | PASS, 10 files / 113 fixture tests; no live model |
| `pnpm --filter @jobguard/config exec vitest run src --maxWorkers=2` | PASS, 1 file / 1 test |
| `pnpm --filter @jobguard/storage exec vitest run src --maxWorkers=2` | PASS, 1 file / 2 tests; fake adapters |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | PASS, 40 files / 867 tests |
| `pnpm --filter @jobguard/db exec vitest run --exclude 'test/*.integration.test.ts' --exclude test/free-port.test.ts --maxWorkers=2` | PASS, 53 files / 463 unit tests, including LP-0 catalogue unit tests |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2` with the nine exclusions below | PASS, 86 files / 1,675 tests |
| `pnpm openapi:check` | Exit 1 before generator: tsx CLI IPC socket `listen EPERM` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS, same OpenAPI generator/check through installed loader, no socket |
| Inline Node check via `pnpm --filter @jobguard/api exec node --import tsx --input-type=module` | PASS: strict inventory schema, exactly 4 added entries / 3 added routines, previous rows and their order/all other fields preserved, catalogue static scan matches |
| `git diff --check` | PASS |

API exclusions (each passed as `--exclude`): `src/shadow-isolation.application.test.ts`, `src/health.test.ts`, `src/auth/sso/action-paths.test.ts`, `src/contractor/site-visit.http.test.ts`, `src/contractor/site-extra-pricing.http.test.ts`, `src/contractor/contractor-practice-session.http.test.ts`, `src/contractor/site-extra.http.test.ts`, `src/contractor/practice-worker-switch.http.test.ts`, `src/final-account-lock.isolation.test.ts`. These need PostgreSQL and/or listeners. The initial API selection omitted the last exclusion: 86 files passed / one suite setup failed at `freePort` (`no free port in 58400..58650`), 1,677 tests passed / 1 skipped. No PostgreSQL process started. The subsequent run added that exclusion and passed as recorded above; the failed setup is not a passing integration test. The initial inline inventory check from the db package also failed to resolve tsx; using the API package's already installed loader resolved that tooling issue.

Unique successful final selections total 5,941 tests (including 100 tooling tests); retries are not added to that total. Logs are `/private/tmp/jg-later-b14-r1-{typecheck,lint,lanes,build,tools-tests,core,ai,config,storage,web,db-unit,api-unit,api-unit-rerun,openapi,openapi-loader,inventory}.log`; exact initial unit invocation arrays/results are in `/private/tmp/jg-later-b14-r1-unit-results.json`.

**NOT RUN:** PostgreSQL LP-0 grant-freeze and authority-path suites, other real database/upgrade/migration suites, full `pnpm test` / `pnpm test:db` / `pnpm test:migrations`, listener-dependent tests and browser/e2e suites. Dispatcher states this sandbox cannot bind localhost or start PostgreSQL and prohibits browsers; those checks belong in GitHub CI after dispatcher push. No LP0-01/LP0-02 live pass or independent review of this repair is claimed. Both RED verdicts on the eventual repair commit, separate acceptance and Ben's decision-74 merge/enablement approval remain pending. Commit subject/body is written to both `/private/tmp/jg-msg-later-b14-r1.txt` and `/private/tmp/jg-msg-later-b14.txt`.

## r2 — final PostgreSQL CI repair (dispatcher 14, 16 October 2026 night)

Prepared by Codex from clean HEAD `a2fbd4e74a715d4736cfc016ee51cf76e050ba40` (r1), branch `codex/sandbox/later-b14`, PR #263. BUILD-DON'T-MERGE (decision 74). Read the supplied CI excerpt at `~/.local/share/full-steam/jg-runs/later-b14-ci-38969664243-excerpt.txt`: run 38969664243 reported three failures out of 2,559, namely the two L063 tests and LP0-02. That run predates this repair and is not evidence that r2 passes PostgreSQL. No staging, commit, push, merge, deployment, browser, external provider call or real data. Dispatcher owns commit/push. Disk remained 33 GiB available, above the waived night floor of 30 GB; no 45 GB gate was imposed. Existing dependencies were used without installation/download; checks used Node 24.17.0 and the cached pnpm 10.28.1 launcher `/private/tmp/jg-later-b14-bin/pnpm`.

### Cause and bounded repair

The **new LATER-B14 test fixtures were wrong**. Both failed while directly inserting `evidence_upload`, before their proof assertions: `guard_watchdog_input()` compares `NEW.tenant_id` with transaction-local `app.tenant_id`, which the unscoped admin queries omitted. In `packages/db/test/decisions-later.integration.test.ts`, the proof fixture inserts now run through existing `withTenant(admin, f.auth.context, ...)`, on its pinned transaction connection. The invalidation insert uses that same verified context. All assertions, finalized object/version/type/scope bindings, invalidation, wrong-scope rejection, pending-upload rejection and immutable response replay are preserved. No guard is bypassed/disabled, and no production code or merged test is changed. This is persisted synthetic fixture setup, not storage/provider verification or a PostgreSQL pass.

The **r1 additive LP-0 entries were wrong**. `deriveFacts` in `packages/db/test/lp-0-catalog.ts` emits a routine-owner fact only when the ACL has a non-owner grantee or the routine owner differs from its schema owner. Migration 0193 assigns all three functions to `jobguard_migration`, which owns `app`. Only `decision_check_command(text,jsonb,text,jsonb)` grants EXECUTE to `jobguard_runtime`; the two trigger functions revoke PUBLIC/runtime/infrastructure access and remain owner-only. Therefore remove just the r1-added owner entries for `guard_decision_check_receipt()` and `require_completed_decision_check()`.

The final LATER-B14 inventory delta has exactly these two capability facts:

- `acl|routine|function:app.decision_check_command(text,jsonb,text,jsonb)|jobguard_runtime|EXECUTE|-`
- `owner|routine|function:app.decision_check_command(text,jsonb,text,jsonb)|jobguard_migration`

All three recorded routine identities remain, including the two owner-only trigger functions. Their existing source-derived security/ACL/static-call records match 0193; unknown PostgreSQL definition digests remain `null`. No pre-LATER-B14 row, group, role, metadata, ordering, policy or trigger record changes. Ben decision 60 is preserved: the only added non-owner capability belongs to the existing runtime role. No grants or owners in SQL change; no new migration, financial behavior, compatibility impact or operational alert is introduced.

Only the new integration test, the requested additive inventory entries and this receipt change in r2. The receipt's r1 claim that four capability entries were needed is superseded by this correction. No repair required an existing baseline row or merged behavior to change.

### r2 executed checks

Typecheck, lint and build were forced executions, each with seven successful tasks and zero cache hits. Existing Turbo cache-write and Next workspace/dependency/CSS warnings were nonfatal. Commands prefixed `pnpm` below used the pinned temporary launcher in PATH.

| Command | Result |
| --- | --- |
| `pnpm typecheck --force --concurrency=2` | PASS, 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint --force --concurrency=2` | PASS, root tools and 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS, rerun after receipt append |
| `pnpm build --force --concurrency=2` | PASS, 7/7 tasks |
| `node --test tools/*.test.mjs` | PASS, 100 tests |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | PASS, 101 files / 2,720 tests |
| `pnpm --filter @jobguard/ai exec vitest run --maxWorkers=2` | PASS, 10 files / 113 fixture tests; no live model |
| `pnpm --filter @jobguard/config exec vitest run src --maxWorkers=2` | PASS, 1 file / 1 test |
| `pnpm --filter @jobguard/storage exec vitest run src --maxWorkers=2` | PASS, 1 file / 2 tests; fake adapters |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | PASS, 40 files / 867 tests |
| `pnpm --filter @jobguard/db exec vitest run --exclude 'test/*.integration.test.ts' --exclude test/free-port.test.ts --maxWorkers=2` | PASS, 53 files / 463 unit tests, including catalogue derivation/comparison |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2` with exclusions below | PASS, 86 files / 1,675 tests |
| `pnpm openapi:check` | Exit 1 before checker: tsx CLI IPC `listen EPERM` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS, same installed OpenAPI checker through loader, no IPC listener |
| `JG_REPO_ROOT="$PWD" pnpm --filter @jobguard/api exec node --import tsx /private/tmp/jg-later-b14-r2-inventory.mjs` | PASS, strict inventory parse; all 0193 function owners/revokes/grants modelled through actual `deriveFacts`; exactly 2 added facts / 3 recorded routines; `staticScan` matches; every baseline row, its order and all other inventory fields unchanged |
| `git diff --check` | PASS |

API exclusions (each passed as `--exclude`): `src/shadow-isolation.application.test.ts`, `src/health.test.ts`, `src/auth/sso/action-paths.test.ts`, `src/contractor/site-visit.http.test.ts`, `src/contractor/site-extra-pricing.http.test.ts`, `src/contractor/contractor-practice-session.http.test.ts`, `src/contractor/site-extra.http.test.ts`, `src/contractor/practice-worker-switch.http.test.ts`, `src/final-account-lock.isolation.test.ts`. These need PostgreSQL and/or listeners; no such suite is represented as passing. Unit invocation arrays, exits and log paths are preserved in `/private/tmp/jg-later-b14-r2-unit-results.json`; the runner is `/private/tmp/jg-later-b14-r2-units.py`. Successful selections total 5,941 tests including tooling, without counting retries.

The temporary inventory validator's initial attempt incorrectly compared recorded baseline rows to the current `origin/main` tip instead of this branch's merge base; that comparison failed. Correcting the temporary validator to the branch merge base made the complete preservation comparison pass. No inventory baseline row was edited to satisfy it. This is source-derived deterministic validation using the existing catalogue functions, not a live catalogue read, independent model review or acceptance.

Logs: `/private/tmp/jg-later-b14-r2-{typecheck,lint,lanes,build,tools-tests,core,ai,config,storage,web,db-unit,api-unit,openapi,openapi-loader,inventory}.log`.

**NOT RUN:** `packages/db/test/decisions-later.integration.test.ts` (including both repaired L063 cases), `packages/db/test/lp-0-grant-freeze.integration.test.ts`, `packages/db/test/lp-0-authority-paths.integration.test.ts`, `packages/db/test/later-decisions-upgrade.integration.test.ts`, other PostgreSQL/migration/upgrade suites, full `pnpm test` / `pnpm test:db` / `pnpm test:migrations`, listener-dependent tests and all browser/e2e suites. Dispatcher states this sandbox cannot bind localhost or start PostgreSQL and prohibits browsers. PostgreSQL checks must run in GitHub CI after dispatcher push. No local database start/probe was attempted.

Decision 74 remains BUILD, CHECK, PARK. Fresh exact-commit independent verdicts, separate acceptance and founder-owned merge/enablement remain outstanding. This repair is uncommitted; HEAD remains `a2fbd4e74a715d4736cfc016ee51cf76e050ba40`. Intended conventional commit subject/body is written to both `/private/tmp/jg-msg-later-b14-r2.txt` and `/private/tmp/jg-msg-later-b14.txt` for the dispatcher.
