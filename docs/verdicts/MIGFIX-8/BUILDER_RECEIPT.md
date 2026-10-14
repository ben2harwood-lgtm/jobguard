Built by Codex; dispatched 13 Oct 2026. Actual builder attribution supersedes the dispatcher-supplied attribution text.

# MIGFIX-8 builder receipt — partial evidence, RED lane

The addendum requested the first line “Built by Claude Sonnet 5.5, Codex unavailable; dispatched 13 Oct 2026”. That attribution is incorrect for this build and is recorded here as supplied text, not asserted as a fact. This work was built by Codex. No independent verdict or acceptance is claimed.

## Identity and baseline

- Issued task: MIGFIX-8; migration **0154_follow_up_clock_fence.sql** (header wins over the draft's 0157).
- Reused worktree: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/practice-facts-1`.
- Branch: `codex/sandbox/migfix-8`.
- Verified initial/final HEAD and `origin/main`: `bd959b01e857de0ba7cbd3588bab84add7d0f493`. Main matches the issued base. No Git write, commit, push, PR or review was performed.
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

## Executed command ledger

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

## Self-inspection and limits

Checked the run/case/intent/audit ordering, session-before-fence ownership checks, original routine refusals, private-helper privileges, canonical-text upgrade comparisons, actual immutable-session fixture binding and bounded race-test cleanup. This is builder source inspection only; PostgreSQL scheduling, role/catalog behavior, upgrade controls and all tests still need execution. No independent model reviewed this diff and the builder does not accept it.

Acceptance remains **partial / held for execution and RED review**. Independent different-model verdict bound to the dispatcher's exact eventual commit and separate acceptance remain required. No production or commercial release gate advances.

## Change manifest

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

New untracked files: the 150-line 0154 migration, two new test files (8 declarations), and this receipt. Final status must contain exactly these plus the four tracked paths above. No lockfile/package/config/environment data changes. Intended commit message is `/private/tmp/jg-msg-migfix-8.txt`.

Final HEAD: **bd959b01e857de0ba7cbd3588bab84add7d0f493** (unchanged base; work is uncommitted). Eventual dispatcher commit/review SHA: **pending**.
