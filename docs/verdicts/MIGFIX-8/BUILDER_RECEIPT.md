Built by Codex; dispatched 13 Oct 2026. Actual builder attribution supersedes the dispatcher-supplied attribution text.

# MIGFIX-8 builder receipt — partial evidence, RED lane

The addendum requested the first line “Built by Claude Sonnet 5.5, Codex unavailable; dispatched 13 Oct 2026”. That attribution is incorrect for this build and is recorded here as supplied text, not asserted as a fact. This work was built by Codex. Opus subsequently recorded a source-only **REPAIR** verdict for `8872bb73009a4d998d82aa6e368ea376f81b8d66`; no PASS or acceptance is claimed. The original-build and repair-r1 evidence below is historical; the 14 October repair-r2 section records the current working tree and checks.

## Identity and baseline

- Issued task: MIGFIX-8; migration **0154_follow_up_clock_fence.sql** (header wins over the draft's 0157).
- Reused worktree: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/practice-facts-1`.
- Branch: `codex/sandbox/migfix-8`.
- Original build baseline: `bd959b01e857de0ba7cbd3588bab84add7d0f493`; it was both HEAD and `origin/main` during that build. The dispatcher later committed the implementation. Repair-r1 starts at HEAD `8872bb73009a4d998d82aa6e368ea376f81b8d66`, branch `codex/sandbox/migfix-8`; current `origin/main` is `077ab6383e1d3c35e6ac37691f557e67c551011d`. This builder performs no Git writes, commit or push.
- Main already contains migrations through 0142, including 0139–0142. Registration adds only this migration after those actual main entries.
- Read repository AGENTS.md, BUILD_PLAN.md §2.4 and M4-6-S (§10.4), and the standing handoff rules. No skill applies to this database repair. No sub-agent was used.
- Main source: scheduling guard at `0115_recovery_follow_up_repair.sql:8`, atomic evaluation/audit at `:57`, AFTER advanced-event trigger at `0112_recovery_follow_up.sql:469`; repository schedule at `recovery-follow-up-repository.ts:100`, active-run tick read previously at `:445`; sandbox advance previously at `sandbox-repository.ts:36`. Clock limit remains 3 (`packages/core/src/recovery-follow-up.ts:16`) and scheduling owner remains `practice_fake_clock` (`:18`). The external source report `mig-0112-0120.md` was supplied by reference in the order; its database assertions were checked against these actual main sources.

## Changes and affected invariants

- Add one private **SECURITY INVOKER** trigger helper owned by `jobguard_migration`. It checks tenant context and locks the `(tenant, recovery-follow-up-run:run)` advisory key before receipt or event insertion. Event fencing includes archive; receipt fencing covers raw clock advancement before it changes the tick.
- Restate the existing scheduling guard and evaluation body with exactly one run-fence statement added to each. An ephemeral source comparison removed those two additions and confirmed the remaining routine text matches 0115. This is source inspection, not PostgreSQL execution or independent verification.
- Repository scheduling selects an eligible run identity, takes its fence **before** the case lock, and refreshes its tick/archive state after waiting. Sandbox advance/archive/reset verifies session ownership before taking the same fence and refreshes state after waiting.
- Domain ordering: run fence before case/intent locks; catch-up serialization and audit head last. The fence lasts until transaction completion. The existing unique due effects, pending Decision, atomic `time_advanced → became_due` audit, delivered-source requirement and specific refusals stay in place.
- No change to the three-step limit, synthetic environment, `realExternalActions:0`, approval path, immutable money history, ownership checks, RLS, policies, existing grants or fingerprints. No new external action, alert or provider route. No API, UI, prompt, schema boundary or model change. Contractor command registries/harnesses are untouched; this is the existing small-builder synthetic scheduler.
- Shared-file integration must serialize: lane registry and migration runner, plus both existing repository files. Additive lane/runner entries only; no merged test edits.

## Tests first and acceptance coverage

Both new database test files were written before the migration or repository implementation. The first baseline run is **NOT RUN (cannot start PostgreSQL or bind sockets here)**, as expressly stated in the dispatch environment. There is no observed failing run and no database pass. The private-helper catalogue assertion was added later during source validation; no failing execution of it is claimed.

Seven integration test declarations and one upgrade declaration (8 total):

| ID | Written coverage | Execution |
| --- | --- | --- |
| MIGFIX-8.1 | Scheduling intent/required parts held uncommitted at tick 2; final clock waits on a real observed lock; commit; inspect tick 3, exactly one due Decision/event/audit before any read or catch-up; no new authorization/outbox/sink/journal effects | NOT RUN |
| MIGFIX-8.2 | Reverse winner with raw stale tick-2 insert; precise clock-invalid refusal; repository exhaustion; zero unreachable intents/effects | NOT RUN |
| MIGFIX-8.3 | Controlled final-advance race followed by duplicate clock events, fresh repositories, repeated signals/reads, one due result; separate concurrent sandbox final-advance/restart test keeps tick 3 and zero external actions | NOT RUN |
| MIGFIX-8.4 | Two repository schedulers race a paused raw scheduler and final advancement; one intent/due result, specific refusal of other schedulers, bounded statement timeout detects failure to complete | NOT RUN |
| MIGFIX-8.5 | Archived run, a newly appended claim revision, undelivered source; existing specific refusals, rollback, zero follow-up/send effects | NOT RUN |
| MIGFIX-8.CATALOG | Runtime cannot call private trigger helper; migration ownership, invoker security, no runtime/infrastructure execute privilege | NOT RUN |
| MIGFIX-8.UPGRADE | Install before N; populated quote/evidence/invoice/message/follow-up/due/audit history; apply N alone as migration owner; canonical named columns, full types and primary-key identities; old grants/RLS/policies and old routine ACLs; later migrations twice; rolled-back controls | NOT RUN |

The upgrade comparison reads `row_to_json(t)::text` from an explicit sub-select of pre-existing named columns. It records full `format_type(atttypid,atttypmod)`, compares each pre-existing identity and requires non-empty compared tables. Later-added rows are ignored. The same comparison rejects a one-microsecond time mutation and a pre-existing column retype; it permits an added nullable column, a replaced function and a later insert. Catalogue/routine checks apply immediately after this migration, rather than freezing later routine changes. Normal migration-runner replays are tested twice. The new filenames match existing mandatory package Vitest discovery in root CI; no check was made optional.

Rule 9 (verbatim):

> An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

## Grants, migration strategy and rollout

**Every new GRANT in 0154: none (0).** Standard F: no new direct INSERT/UPDATE/DELETE grant to `jobguard_runtime` on money, membership, authorization, receipt or audit tables; no new runtime or infrastructure business privilege. The only ACL statement is REVOKE ALL on the new trigger helper from PUBLIC, runtime and infrastructure. Existing invoker-routine ACLs survive CREATE OR REPLACE.

No row backfill or commercial-history normalization. Install forward through the registered migration. If installation fails, its transaction rolls back. For an installed regression, ship a separately reviewed forward fix, retaining row history and privileges; do not edit this or any merged migration, remove data or drop the fence without a reviewed replacement. Existing repository code remains schema compatible; the database trigger enforces the schedule/clock fence even before repository deployment, while updated repository ordering avoids case-before-run waits. Independent DB validation is still required before accepting this rollout claim.

## Original-build executed command ledger (13 October; historical)

All shell commands were run in this worktree. Read/edit batches below identify the actual command forms and operands; heredoc bodies are the in-session scripts writing the listed owned files. No command invoked Git writes or package installation explicitly. Counts are test counts only where a test actually ran (none).

| Commands actually issued | Exit/result |
| --- | --- |
| `pwd && git status --short && git branch --show-current && git rev-parse HEAD && git rev-parse origin/main` | 0; clean initial tree, issued branch/base verified |
| `cat AGENTS.md`; `cat ~/.local/share/full-steam/handoffs/jobguard-task.md` | 0 each |
| Batched `rg -n`/`sed -n`/`head`/`tail`/`cat` reads of BUILD_PLAN.md, both repositories, 0021/0094/0097/0107/0112/0115/0132/0134 migrations, both existing follow-up suites, fixture/pool/context helpers, migrate.ts, package/tsconfig/Vitest/CI/lane configuration, and tool lint sources | Read batches returned 0 except batches ending in unmatched `rg` (1). Requests for `packages/db/test/helpers/postgres.ts`, `packages/db/test/postgres.ts` and `packages/db/src/recovery-case-current.ts` found no such file; subsequent reads used the actual pool helpers/current view. No missing file was manufactured |
| `cat ~/.local/bin/heavy-slot` | 0; inspected gate, never started DB/browser commands |
| `memory_pressure \| tail -1`; `df -g /System/Volumes/Data` | 0; first 80% free/38 GB available, later 81%/37 GB; above dispatched 35% and 35 GB thresholds |
| `python3 - <<'PY'` additive lane registration | 0; one lane row |
| `cat > packages/db/test/migfix-8.integration.test.ts <<'EOF'`; `cat > packages/db/test/migfix-8-upgrade.integration.test.ts <<'EOF'`; Python adjustments to these owned new tests | 0; 8 final test declarations, no execution |
| Python implementation batch writing 0154 SQL and the three owned source files | 0; no merged migration modified |
| `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --filter @jobguard/db exec tsc --noEmit --skipLibCheck --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop test/migfix-8.integration.test.ts test/migfix-8-upgrade.integration.test.ts` | **1**, pnpm safety refusal before compiler/test execution; 0 checks/tests executed |
| Polls of that same running command via write_stdin (empty input) | Returned no intermediate diagnostic; final process exit 1 above |
| `memory_pressure \| tail -1; ps -A -o pid,etime,%cpu,rss,comm \| rg 'tsc\|node' \| head -12` | Shell batch 0; process inspection refused (`zsh:11: operation not permitted: ps`); no process data, no retry; individual ps status not separately captured |
| `node --version`; `command -v pnpm`; `ls -l "$HOME/Library/pnpm/bin/pnpm"` | 0; Node v24.17.0; installed pnpm launcher path confirmed |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | **1**; self-comparison refusal, no lane pass |
| Node esbuild syntax-parsing heredoc targeting `.pnpm/esbuild@0.25.9/.../main.js` | **1**; assumed module path absent (ERR_MODULE_NOT_FOUND); no parse occurred |
| Node built-in `stripTypeScriptTypes` syntax-parsing heredocs | 0 each; four files parsed per completed run; syntax only, no semantic typecheck/test/build |
| Python source-routine comparison, SHA-256 manifest and protected-file main comparisons | 0; 2 routine bodies preserved except fences, 0 new GRANTs, 5 protected files unchanged |
| `git diff --check`; `git diff --stat`; `git diff --numstat`; `git status --short`; repository/source-count `rg`/`wc` inspections | 0 except empty-match rg (1); no whitespace errors; changed paths confined to issued lane |
| `mkdir -p docs/verdicts/MIGFIX-8`; heredoc to `/private/tmp/jg-msg-migfix-8.txt` | 0; intended conventional commit subject/body written |
| Python receipt generation and final syntax/hash/diff/status checks | 0 if final output confirms; receipt is an evidence record, not a verdict |

### Refusals and exact STOP details

The pinned pnpm command above was refused with:

```text
[ERROR] Refusing to run pnpm@10.28.1: its npm registry signature could not be verified (@pnpm/exe@10.28.1: fetch failed; @pnpm/macos-arm64@10.28.1: fetch failed; pnpm@10.28.1: fetch failed). The bytes selected by this project's lockfile/registry do not match a published, signed pnpm release.
```

STOP: no retry, package-manager safety override, package download command, substitute semantic compiler invocation or permission escalation. Dispatcher must resolve its pinned launcher/registry availability. This is the launcher's stated reason, not evidence that the repository was altered. No auto-review escalation was requested or rejected.

The lane checker refused with:

```text
Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.
```

Exact file/line: `tools/agent-lane-boundary-lint.mjs:212`.
Before and after (unchanged):

```js
if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");
```

STOP: no alteration to this merged guard or comparison substitution. The dispatcher must commit the work before rerunning its origin/main comparison. No coordinator-owned code/test/pin change is requested; no existing assertion has been weakened.

Process-inspection STOP: exact command `ps -A -o pid,etime,%cpu,rss,comm`; refusal `zsh:11: operation not permitted: ps`. No retry or alternate process-inspection route.

### NOT RUN / blocked commands

- `packages/db/test/migfix-8.integration.test.ts`: **NOT RUN (cannot start PostgreSQL / bind sockets here)**, seven tests, including first baseline run.
- `packages/db/test/migfix-8-upgrade.integration.test.ts`: **NOT RUN (cannot start PostgreSQL / bind sockets here)**, one test, including first baseline run.
- Forced final commands **NOT RUN** after the pnpm safety refusal: `pnpm exec turbo run typecheck --force`; `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force`; `pnpm build --concurrency=2 --force`. Therefore **no --force execution or green result is claimed**.
- Root lint orchestration, `pnpm lint:lanes`, `pnpm openapi:check`: **NOT RUN** through pnpm due to that refusal. Separate direct lane invocation also refused as recorded above.
- Unit suites: no new unit test file; acceptance is PostgreSQL integration, not a mock or pure-function substitute. Zero unit test passes claimed.
- Whole `pnpm test`, `pnpm test:db`, `pnpm test:migrations`: **NOT RUN**, dispatcher-owned whole suites under memory rules; new files remain mandatory CI-discovered tests.
- Browser/native: **NOT RUN (cannot start a browser here)**; no UI/native workflow change, but inherited journeys remain dispatcher/CI checks. No screenshots.
- Eval: inapplicable (no model, prompt, parser, matching policy or AI gateway change).

Suggested dispatcher DB invocation, **not executed by builder**:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
~/.local/bin/heavy-slot migfix-8 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/migfix-8.integration.test.ts test/migfix-8-upgrade.integration.test.ts
```

## Original-build self-inspection and limits

Checked the run/case/intent/audit ordering, session-before-fence ownership checks, original routine refusals, private-helper privileges, canonical-text upgrade comparisons, actual immutable-session fixture binding and bounded race-test cleanup. This was builder source inspection only; PostgreSQL scheduling, role/catalog behavior and upgrade controls still need execution. At original handoff no independent review existed. The subsequent Opus source inspection returned REPAIR, as recorded above; the builder does not accept its own work.

Acceptance remains **partial / held for execution and RED review**. Independent different-model verdict bound to the dispatcher's exact eventual commit and separate acceptance remain required. No production or commercial release gate advances.

## Original-build change manifest (13 October; historical)

SHA-256 of final code/registration/test bytes (receipt excluded to avoid a self-referential hash):

```text
ddbb1830499f2e15136114317313b2cea4df08e666302a3f743d3e5c39304587  config/agent-lane-assignments.json
2b31bf995b5c63e6389c59a1fda6e4d9ea50af4cd1116250f15b3dbd4c224fab  packages/db/src/migrate.ts
59e224ed4a1e34e008838f393aefa30623b2f9d56a339fdb79a60dd61a75d632  packages/db/src/recovery-follow-up-repository.ts
d848b2259c0538e997b83437182d9086553f3a62a19f837718f1ff7bc00a0f26  packages/db/src/sandbox-repository.ts
f51a4eeea6aaf74f6535f0adef99f1dc495ad5c52330ee6b2c5beaedb31ba1c4  packages/db/migrations/0154_follow_up_clock_fence.sql
3fdf50db69ae661f1b2b58725be6eae4f37c7e082702214fe6b757f6aedbcc43  packages/db/test/migfix-8.integration.test.ts
15df4a8dec839decac0159357027c65c2cdfa8ffad0c16ebad7a99ea7224c8c0  packages/db/test/migfix-8-upgrade.integration.test.ts
```

Protected merged files compared byte-for-byte with origin/main:

```text
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35  apps/api/src/auth/context-boundary.test.ts
1628a2c3dc2d24cdb20c11ded7461a9206af9e71f918bff571ba51e66cf9aaf7  packages/core/src/watchdog.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6  packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f  packages/db/test/command-replay-contract.integration.test.ts
cd9c33100f69e8a5084b11c3accdfbfacf58997bb6ea5c0709c72ec9711b2a2d  packages/db/test/tenancy.integration.test.ts
```

Tracked `git diff --stat` before receipt creation (new untracked files are listed separately):

```text
 config/agent-lane-assignments.json               |  1 +
 packages/db/src/migrate.ts                       |  1 +
 packages/db/src/recovery-follow-up-repository.ts | 23 ++++++++++++++++-------
 packages/db/src/sandbox-repository.ts            | 12 +++++++++---
 4 files changed, 27 insertions(+), 10 deletions(-)
```

At the original handoff, the 150-line 0154 migration, two new test files (8 declarations), and this receipt were untracked, alongside the four tracked paths above. The dispatcher committed those eight files in `8872bb73`; they are tracked at repair-r1 start. This original manifest describes the original bytes, before the approved repair below. Intended commit message is `/private/tmp/jg-msg-migfix-8.txt`.

Repair-r1 HEAD: **8872bb73009a4d998d82aa6e368ea376f81b8d66**. The implementation is committed at that head; only repair-r1 changes remain uncommitted for the dispatcher. Successor commit and independent review of it: **pending**.

## Repair round r1 — 14 October 2026, dispatcher 5

Authority: the dispatcher issued B1–B3 from the Opus verdict at `/Users/benharwood/.local/share/full-steam/jg-runs/migfix-8-opus-8872bb7.md` (source inspection only, nothing executed). The widening of this lane to `packages/db/MIGRATIONS.md` is explicitly approved. B1 adds only that allowed path and a 0154 section documenting the private invoker helper, two BEFORE INSERT fences, two restated routines, unchanged privileges/history, upgrade proof and forward-fix strategy. B2 changes only the later-insert control's event index from 2 to 3: the fixture already has created index 1 and advanced index 2, so 3 avoids the existing tenant/run/index uniqueness collision. Its test and expectations are preserved. B3 corrects current HEAD/commit wording and records execution limits and this round's actual checks.

No migration, production source, existing merged test, expectation, or `apps/api/src/auth/context-boundary.test.ts` is changed. No new migration, compatibility impact, external action, operational alert or commercial-policy approval belongs to this round. Shared documentation and lane registry edits remain serialized in this lane.

**Database and browser suites: NOT RUN. No database test could run in this sandbox**, which cannot bind localhost or start PostgreSQL. No baseline-first race run, migration/catalog/upgrade pass or browser pass is claimed. Both MIGFIX-8 integration files, `pnpm test:db`, `pnpm test:migrations`, the full `pnpm test` and browser regressions remain required in GitHub CI after the dispatcher pushes. Unit checks do not prove these PostgreSQL guarantees. No model/prompt/parser/gateway change requires an evaluation for this repair.

The dispatcher owns the successor commit and push. A fresh or explicitly rebound independent verdict against that exact commit, green mandatory CI and separate acceptance remain required; this receipt is builder evidence only.


### Repair-r1 executed checks

Node `v24.17.0`; installed pinned pnpm binary verified as `10.28.1`. The default launcher (`/Users/benharwood/Library/pnpm/bin/pnpm`) stalled before running `pnpm typecheck` and was interrupted with exit 130. No package download/install command or safety override was issued. Subsequent pnpm commands used the already installed binary by prepending `/Users/benharwood/Library/pnpm/store/v11/links/@pnpm/macos-arm64/10.28.1/6adbece7fcd33fcfc0543fbc54147847898d5c988debc7796a9f48f7b526903c/node_modules/@pnpm/macos-arm64` to PATH. Turbo reported cache-write IO warnings under the sandbox; `--force` ensured checks were executed. Logs are `/private/tmp/jg-migfix-8-r1-*.log`.

| Actual command | Exit and result |
| --- | --- |
| `pnpm typecheck --force` | **2**; four package checks successful; DB failed TS2375 at `packages/db/src/recovery-follow-up-repository.ts:384`; dependent checks did not run |
| `LANE_BASE_REF=origin/main pnpm lint --force` | **2**; root purity, lane, money and commercial checks completed; package lint failed on the same TS2375 |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **0**, pass; also direct `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` passed |
| `pnpm build --concurrency=2 --force` | **2**; four package builds successful; DB failed on the same TS2375, preventing API/web builds |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage --filter @jobguard/web --workspace-concurrency=2 test` | **1**; config 2 and storage 4 tests passed; core discovered generated `dist` tests as well as source and reported 4,888 passed/2 failed (missing sibling TypeScript source in `dist`); downstream AI/web did not run in this invocation |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | **0**; all 81 source test files, **2,445 tests passed**, including the source counterparts of both generated-file failures; no test/expectation changed |
| `pnpm --filter @jobguard/ai --filter @jobguard/web --workspace-concurrency=2 test --exclude '**/dist/**'` | **1** overall; AI 5 files/**80 tests passed**; web 22 files/462 tests passed, 11 files/322 tests failed; missing functions include `siteVisitHttpFailure` and `sorSiteExtraHttpFailure`. API/web build prerequisites were not completed because of the compiler failure; no claim that web regressions pass |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts'` | **0**; **18 files/256 unit tests passed**; these are unit/scripted/CLI checks, not PostgreSQL integration evidence |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2 --exclude src/health.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/auth/sso/action-paths.test.ts --exclude 'src/contractor/*.http.test.ts'` | **1**; 64 files/1,557 tests passed; `final-account-lock.isolation.test.ts` failed in setup (`no free port in 58400..58650`) and its one test was skipped. That indirectly imported database harness could not initialize PostgreSQL. HTTP/socket suites were excluded only for this local invocation; no mandatory CI discovery changed |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | **0**; **19 tests passed**. The two agent-lane fixture suites were not invoked because they execute Git writes, prohibited by this repair order |
| `pnpm openapi:check` | **1**; tsx CLI could not bind its IPC socket (`listen EPERM`), before validating OpenAPI |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | **0**; the same generator/check completed through the installed Node loader, without the CLI IPC socket; committed OpenAPI matches |
| Python exact-byte/registry/source checks; `git diff --check` | **0**; preservation checks below passed, no whitespace errors |

**Compiler blocker exposed by execution:** the committed `begin()` returns `{ replayed: false, jobId: found.job_id, run }`, where `run` is `undefined` for non-schedule commands, but declares `run?: { id: string; tick: number } | null` with `exactOptionalPropertyTypes`. This source is byte-for-byte unchanged from `8872bb73`. The issued B1–B3 repair remains confined to documentation, the approved lane widening and the single fixture index correction; the compiler blocker requires follow-up before acceptance. Typecheck, lint and build are **FAIL**, not green or merely NOT RUN. Web unit failures and the sandbox-blocked API setup remain unresolved execution evidence.

### Repair-r1 final source evidence

Exact HEAD-versus-working-tree comparisons confirm migration 0154 is unchanged (SHA-256 `f51a4eeea6aaf74f6535f0adef99f1dc495ad5c52330ee6b2c5beaedb31ba1c4`). The upgrade file differs only at the approved index `2 → 3`; all test declarations, assertions and expectations otherwise remain byte-identical. The concurrency suite, both repositories, migration runner, tenancy integration test and `apps/api/src/auth/context-boundary.test.ts` are unchanged. The lane JSON differs only by the single approved documentation path, and all pre-existing MIGRATIONS.md bytes are preserved with 0154 appended.

Exactly four tracked paths differ from HEAD: `config/agent-lane-assignments.json`, `packages/db/MIGRATIONS.md`, `packages/db/test/migfix-8-upgrade.integration.test.ts` and this receipt. This is deterministic builder source evidence, not an independent review or database catalog result. HEAD remains `8872bb73009a4d998d82aa6e368ea376f81b8d66`; the original implementation is committed there, and only these repair changes await the dispatcher. The intended conventional commit subject/body overwrites `/private/tmp/jg-msg-migfix-8.txt`. No Git write, commit, push or permission escalation was performed. Mandatory CI, the compiler follow-up, independent review bound to the successor commit and separate acceptance remain owed.

## Repair round r2 — 14 October 2026, dispatcher 6

**Scope and identity.** Start/current HEAD is `92f1410145be416579444179c94906b0b9f16f13`, branch `codex/sandbox/migfix-8`; observed `origin/main` is `c203bb27893342ca2569272ff4dc908b614267d6`. This is the uncommitted r2 working tree for the dispatcher. The source-only Opus delta verdict at `/Users/benharwood/.local/share/full-steam/jg-runs/migfix-8-opus-92f1410.md` reports **REPAIR**, with blocking N1 (TS2375) and the continuing CI execution gate N2. It is not a verdict on these successor bytes. No PR, commit, push, Git mutation, permission escalation or sub-agent was used.

**N1 repair.** In `RecoveryFollowUpRepository.begin()`, the non-scheduling branch now returns `null` rather than explicitly returning `undefined` in `run`. That matches the existing optional nullable field under `exactOptionalPropertyTypes`. The scheduling branch still calls `activeRun()`; the replay branch still omits `run`; the sole reader already guards absent/null runs. The code diff is exactly one replacement. No migration, schema, authorization, lock ordering, money policy, public boundary, operational alert or external action changes.

**Checks actually executed.** Node `v24.17.0`, already installed pinned pnpm `10.28.1`; no package installation/download command. Pnpm commands use the existing pinned binary directory recorded in r1 at the front of PATH. `LANE_BASE_REF=origin/main` was set for lint and lint:lanes (and inherited by the sequential runner). Typecheck, lint and build each ran **once** with `--force`; all four specifically required checks exited **0**. Logs are `/private/tmp/jg-migfix-8-r2-*.log`; the sequential check ledger is `/private/tmp/jg-migfix-8-r2-results.json`, with separate typecheck/retry `.exit` files.

| Actual command | Exit | Result |
| --- | --- | --- |
| `pnpm typecheck --force` | **0** | All 7 package checks passed, 0 cached; TS2375 resolved. |
| `LANE_BASE_REF=origin/main pnpm lint --force` | **0** | Root purity, lane, money and commercial checks; all 7 package lint checks passed, 0 cached. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **0** | MIGFIX-8 lane passed against origin/main c203bb27893342ca2569272ff4dc908b614267d6. |
| `pnpm build --concurrency=2 --force` | **0** | All 7 package builds passed, 0 cached; includes DB, API and production Next web build. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | **0** | 81 source files; 2,445 tests passed. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts'` | **1** | 16 files passed, 2 files failed; 254 tests passed, 2 timed out at the existing 5,000 ms limit in source/generated audit-checkpoint-handoff tests. This selection is FAIL; see isolated retry below. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2 --exclude src/health.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/final-account-lock.isolation.test.ts --exclude src/auth/sso/action-paths.test.ts --exclude 'src/contractor/*.http.test.ts'` | **0** | 64 files; 1,555 tests passed. Socket/PostgreSQL-dependent files excluded only from this local command. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | **0** | 33 files; all 784 tests passed. The r1 missing-function failures did not recur after the successful build. |
| `pnpm --filter @jobguard/ai exec vitest run --maxWorkers=2 --exclude '**/dist/**'` | **0** | 5 source files; 80 tests passed; deterministic fixtures, no live model/provider evaluation. |
| `pnpm --filter @jobguard/config exec vitest run src --maxWorkers=2` | **0** | 1 source file; 1 test passed. |
| `pnpm --filter @jobguard/storage exec vitest run src --maxWorkers=2` | **0** | 1 source file; 2 tests passed. |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | **0** | 19 tests passed. Git-mutating lane fixture suites were not invoked. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | **0** | Same committed OpenAPI generator in --check mode through the installed Node tsx loader; committed document matches. |
| `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1` | **0** | Isolated retry: 1 source file, all 56 tests passed with unchanged assertions and the existing timeout. |
| Python HEAD-byte comparison; `git diff --check`; `git diff --stat`; `git status --short` | **0** | Exact source replacement and preservation checks; no whitespace errors; only the repository source and this receipt differ. |

**Other failure and warnings.** The DB unit selection above exited 1 because the existing transitive-source reachability test timed out twice: `src/audit-checkpoint-handoff.test.ts:279` and its generated `dist` counterpart, with the two copies scanning concurrently. Retrying the source file alone at one worker passed all 56 tests without changing its 5,000 ms timeout. This supports a concurrency/load explanation, but does not convert the original failed invocation into a pass; the generated copy was not retried. There were no other failed verification checks this round. Forced Turbo runs emitted cache IO warnings under the sandbox but executed every task. The successful web build reported an existing autoprefixer warning at `practice-receipts.module.css:25:44` and related webpack cache serialization warnings; no UI change was made.

**Local suite limits.** PostgreSQL, migration, race/upgrade and browser suites remain **NOT RUN** here because the dispatcher states this sandbox cannot bind localhost or start PostgreSQL. The API invocation explicitly excludes health, shadow isolation, final-account-lock isolation, SSO action-path and contractor HTTP files for that reason. DB integration/free-port files were excluded only from the local unit selection. Core/config/storage source selections avoid generated duplicate tests. The two Node lane fixture suites execute Git writes and were excluded under this order. No configuration, discovery rule, assertion or mandatory CI check was changed; no full `pnpm test`, `pnpm test:db`, `pnpm test:migrations` or browser pass is claimed. The OpenAPI check executes the same `src/generate-openapi.ts --check` using `node --import tsx`, so the tsx CLI IPC listener is unnecessary; the root tsx CLI wrapper was not invoked this round.

**Preservation evidence (Rule 12, receipt-only).** A one-off Python comparison against HEAD confirmed the source differs only by the authorized `undefined → null` replacement, and migration 0154, both MIGFIX-8 test files, context-boundary security test, lockfile, root package manifest, migration runner, sandbox repository and lane registry are byte-identical. No permanent file/hash-pinning test was added. Rule 11: no test/fixture or credential-shaped literal was introduced. Preserved file hashes:

```text
f51a4eeea6aaf74f6535f0adef99f1dc495ad5c52330ee6b2c5beaedb31ba1c4  packages/db/migrations/0154_follow_up_clock_fence.sql
3fdf50db69ae661f1b2b58725be6eae4f37c7e082702214fe6b757f6aedbcc43  packages/db/test/migfix-8.integration.test.ts
a73532e67ad3d2e9b066d60de2d17a3644b168e3339bdae3d2a29ace47b002e0  packages/db/test/migfix-8-upgrade.integration.test.ts
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35  apps/api/src/auth/context-boundary.test.ts
06b501e413424d77fc5c3a1ac0f481b7230c271e36bfbde2cb953385ccccd349  pnpm-lock.yaml
```

**Remaining gates.** Dispatcher owns commit/push, main catch-up and any required serialized integration; this round performs no rebase or renumber. GitHub CI must run both MIGFIX-8 PostgreSQL suites green on the successor commit and supply the baseline failing-first evidence required for 8.1–8.4, plus the mandatory broader checks. A new or explicitly rebound independent verdict on that exact commit and separate acceptance remain pending. No commercial/production release gate advances. Intended conventional commit subject and body overwrite `/private/tmp/jg-msg-migfix-8.txt`. These results supersede r1 local check results only; earlier ledger entries remain historical evidence.
