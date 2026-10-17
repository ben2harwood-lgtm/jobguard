# TESTS-DASHBOARD-AUTHORITY-1 — builder receipt

17 October 2026. **RED / PARK — decision 74.** Tests authored, PostgreSQL
execution HELD for CI. This is a builder receipt, not technical acceptance.

Starting HEAD `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`, matching the issued
base; clean checkout at entry. Branch `codex/sandbox/tests-dashboard-authority-1`.
Worked only in the issued worktree. No Git write, commit, push, merge,
enablement, release or deployment. Dispatcher owns committing and the exact-head
independent checks. Node `v24.17.0`; `.nvmrc` remains `24.15.0`; pnpm requested
`10.28.1`. Dependencies were already present; no install/download command,
dependency change or package-manager verification/configuration change.

Read AGENTS.md, applicable BUILD_PLAN contracts and ENT-9, the dashboard contract,
ENT-9B receipt, current dashboard repository/source SQL, tenant transaction and
session bridge, contractor command/session SQL and existing command fixtures.
The dispatch-referenced J6 check file is absent; no local inspection of READY is
claimed. The task header controls local execution and no-commit restrictions.

## Scope and acceptance

Added only the lane registration, two new test files, task ledger and this
receipt. The [ledger](../../ledger/TESTS-DASHBOARD-AUTHORITY-1.md) maps all eight
cases to DA1–DA5 and the gate-only negative control. Both lock orders run for
grant and membership revocation. Data is populated through existing commands;
stored supervisor sessions resolve through the real session bridge. Expiry is
explicitly separated owner fixture setup. No product code, queries, commands,
session implementation, grants, prices, policies, assertions/pins or existing
expectations were edited. No migration or new external action; Standard F and
root CI/regressions remain unchanged. No new alert or compatibility impact.

The retained PostgreSQL fixture has `persistent: true`; pool shutdown and
PostgreSQL stop do not remove its directory. No call to the shared destructive
cluster/close helper. Real database execution and both lock-order outcomes are
**unproved locally**, not passes. Collection and mock-based existing unit tests
do not establish PostgreSQL authority. If CI reveals a genuine product failure,
STOP and report it; this lane cannot repair access logic.

## Local verification

Logs and machine-readable command records:
`/private/tmp/jg-test-tests-dashboard-authority-1/`.

| Commands actually run | Result |
| --- | --- |
| `git rev-parse HEAD`; `git status --short`; `df -g /System/Volumes/Data` | PASS. Correct base/branch and clean entry; 53 GiB available at entry, 52 GiB at final check, above the 33 GB floor |
| Initial `pnpm --filter @jobguard/db exec vitest list test/enterprise-dashboard.authority-race.integration.test.ts` | Stalled after the existing ignored-`pnpm.overrides` warning; interrupted with Ctrl-C, exit 130, no collection/test execution |
| The same pnpm collection command, `pnpm exec turbo run typecheck --force --concurrency=2`, `pnpm exec turbo run lint --force --concurrency=2`, `pnpm build --force --concurrency=2`, `pnpm lint:lanes`, `pnpm openapi:check` | Each bounded attempt stalled before launching the check and was terminated after 12 seconds (SIGTERM, -15). Lint attempts used `LANE_BASE_REF=origin/main`. None is a wrapper pass; see `wrapper-results.json` and `*-wrapper.log` |
| In `packages/db`: `./node_modules/.bin/vitest list test/enterprise-dashboard.authority-race.integration.test.ts` (initial and final source collection) | PASS, exit 0; 8 cases collected, **zero tests executed**, no PostgreSQL startup |
| In `packages/db`: `./node_modules/.bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck test/enterprise-dashboard.authority-race.integration.test.ts` | PASS, exit 0. Explicitly includes the new test/helper; the normal db tsconfig includes `src` only |
| In each of `packages/core`, `packages/config`, `packages/storage`, `packages/ai`, `packages/db`, `apps/api`, `apps/web`: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` | All seven PASS, exit 0; these also execute each package's lint TypeScript check. Exact results in `static-results.json` |
| In each of `packages/core`, `packages/config`, `packages/storage`, `packages/ai`, `packages/db`: `./node_modules/.bin/tsc -p tsconfig.json`; in `apps/api`: `./node_modules/.bin/nest build`; in `apps/web`: `./node_modules/.bin/next build` | All seven builds PASS, exit 0; see `build-results.json`. Next emitted existing workspace-root, CSS and dependency-expression warnings. No browser or HTTP server was started |
| `LANE_BASE_REF=origin/main node tools/lint.mjs`; same environment with `node tools/agent-lane-boundary-lint.mjs` | FAIL, exit 1: `Missing branch or self-comparison range; refusing a misleading pass.` HEAD and origin/main both equal the issued base while all task files are uncommitted. Core purity passed before root lint stopped at lanes. No lane checker/base manipulation or dispatcher repair |
| Read-only Node inventory using existing `loadLanePolicy`, `selectLane`, `lanePathAllowed`, and read-only Git path lists | PASS, exit 0; exactly the five authorized files. This is uncommitted path validation, **not** a successful lint:lanes range check; see `scope-inventory.log` |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | PASS, exit 0 each |
| In `packages/core`: `./node_modules/.bin/vitest run src --maxWorkers=2` | FAIL, exit 1; 110 files/2,799 tests passed, 1 file/2 tests failed. Both failures are 5,000 ms timeouts in unchanged `src/receipt-allocation.test.ts`, at tests beginning lines 125 and 212; see `unit-core.log`. No business assertion repair or timeout change |
| In `packages/core`: `./node_modules/.bin/vitest run --maxWorkers=1 src/receipt-allocation.test.ts -t '2000 lines\|the working size is bounded'` | Diagnostic PASS, exit 0; the two formerly timed-out tests passed, 32 unselected tests skipped. Same existing assertions and default timeout; this is not a repeat of the full core suite or a replacement for CI |
| In `packages/core`: `./node_modules/.bin/vitest run --maxWorkers=2 src/enterprise-dashboard.test.ts src/enterprise-dashboard-billing.test.ts src/enterprise-signal.test.ts` | PASS, exit 0; 3 files, 19 tests. Existing pure-domain regression evidence, not PostgreSQL authority proof |
| In `packages/config` and `packages/storage`: `./node_modules/.bin/vitest run src --maxWorkers=2` | PASS, exit 0 each; respectively 1 file/1 test and 1 file/2 tests |
| In `packages/ai`: `./node_modules/.bin/vitest run --maxWorkers=2` | PASS, exit 0; 10 files, 113 tests; synthetic fixtures only, not a live-model evaluation |
| In `apps/api`: `./node_modules/.bin/vitest run --maxWorkers=2 src/contractor/enterprise-dashboard.application.test.ts src/contractor/enterprise-dashboard.boundaries.test.ts` | PASS, exit 0; 2 files, 4 tests. Existing application/architecture tests are not database scheduling evidence |
| In `apps/api`: `node --import tsx src/generate-openapi.ts --check` | PASS, exit 0; same generator check through the installed loader, no IPC-listening CLI and no artifact rewrite |
| `git diff --check` | PASS, exit 0. Final inventory also checks each new file's whitespace against `/dev/null` without staging |

All unit commands were sequential within their runner and used at most two test
workers. Compilation/build commands use installed local executables because the
pnpm wrapper did not progress; their evidence is distinct from pnpm/Turbo wrapper
success. No database, full root test, migration or browser/e2e suite ran locally.
No new mock orchestration test was substituted for the required database run.

## Independent Sol-high source review — initial response

Requested independent reviewer `gpt-6.1-sol`, reasoning `high`, in a fresh-context
sub-agent. It performed read-only source inspection with no edits, database/test
execution, Git writes or network calls. Its response was:

> PASS — source inspection only; execution and acceptance remain HOLD/PARK.
> No actionable source defects found in DA1–DA5 or the negative control.

The reviewer specifically inspected both actual gate statements and backend lock
observations, persisted-session expiry, same-backend isolation, the exact
revocation write set and installed embedded-postgres stop behavior. Review binds
to the following **initial uncommitted file hashes**, not a final task commit.
The test-file review was superseded by the builder correction described below:

```text
5047e9238771f7ce24f00fe8e228a034fdd993ae8c474be5e84a3844c6aa14f7  packages/db/test/enterprise-dashboard.authority-fixtures.ts
6b6a052395735b8a3d3957154336a1914daca8d3798c6ca2787326139902befb  packages/db/test/enterprise-dashboard.authority-race.integration.test.ts
```

Its review expressly leaves PostgreSQL scheduling, fixture compatibility and the
negative control unexecuted. Opus is not an available model in the current agent
tools; no Opus response is claimed. The RED two-model check is **incomplete**.
Dispatcher must obtain Opus and exact-commit Sol-high review/rebinding, CI proof
and separate technical acceptance. No review here authorizes merging, enabling
or deploying; Ben's button remains required.

### Builder source correction after initial review

Final source inspection found that the new refusal helper expected
`error.name === 'EnterpriseDashboardError'`, but the unchanged existing error
class does not set `name`. Corrected only this new test helper to assert the
actual `EnterpriseDashboardError` instance and `NOT_FOUND` code on the same read
promise. This was a test-authoring error caught by source inspection, not an
executed product failure. No existing test or product expectation was changed.
The original source review missed it. Requested a fresh independent Sol-high
inspection of the revised file, and repeated explicit test compilation and
collection. Root build/typecheck inputs are unchanged because db's normal
tsconfig excludes tests; no broad check repeat is claimed or needed for this
test-only correction.

### Fresh Sol-high response on final test source

The same independent reviewer re-inspected the revised files and the actual
error class, then returned:

> PASS — revised source only. Execution and acceptance remain HOLD/PARK.
> No further actionable source defects found.

It explicitly acknowledged the missed initial `.name` defect and confirmed that
the test and repository use the same `@jobguard/core` class entry point. It also
rechecked stored-session constraints, command/schema compatibility, report
assertions, lock instrumentation and DA5's expected write set. Final hashes:

```text
5047e9238771f7ce24f00fe8e228a034fdd993ae8c474be5e84a3844c6aa14f7  packages/db/test/enterprise-dashboard.authority-fixtures.ts
7f98506445183595924a8c47402fe4fc245f1cbcb8492c1c814534bef2b90382  packages/db/test/enterprise-dashboard.authority-race.integration.test.ts
```

Final explicit test compilation and final Vitest collection both passed, exit 0;
logs are `test-typecheck-final.log` and `collection-final.log`. Eight integration
cases collected, zero executed. No new database test was run during review or
correction. This remains a hash-bound source review of uncommitted files; Opus
and exact-commit review/acceptance are still absent.

Final path/whitespace/hash inventory is saved in `file-inventory.json`. The
inventory checks new files with read-only `git diff --no-index --check` against
`/dev/null`; status 1 with empty output is the expected new-file difference, not
a whitespace finding. An initial inventory invocation misclassified that status
and stopped; the corrected inventory completed without changing any files.
`git diff --check` and final status/base checks pass; no tracked file differs,
all five additions belong to this lane, and HEAD remains the issued base.

## Handoff

Intended conventional commit subject/body:
`/private/tmp/jg-msg-tests-dashboard-authority-1.txt`.

CI-only target:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/enterprise-dashboard.authority-race.integration.test.ts
```

Existing release/prerequisite holds remain. PARK until the required external
evidence and Ben's instruction; the builder does not accept its own work.

## r1 — dispatcher 14 repair, 17 October 2026 night

Entry HEAD `021e922652eb9dd45016d3e54334b32b955078da`, branch
`codex/sandbox/tests-dashboard-authority-1`, clean at entry. Repair addresses the
dispatcher's eight CI connection timeouts and both Opus REPAIR reports on that
commit. Those reports were read from the dispatch-supplied local paths; no fresh
independent verdict or technical acceptance is claimed for this working tree.

Changed only the two task-owned test files and this appended receipt:

- Runtime pools default to four connections, allowing fixture helpers to acquire
  a second connection while another is checked out.
- DA4 creates a separate, retained `max: 1` runtime pool. Both scheduled reads and
  the transaction-local tenant-state check use that pool. PID equality, leakage,
  refusal, commercial-state and race assertions keep their existing conditions.
- The 33 GiB preflight runs only when `process.env.CI` is unset. CI no longer has
  a Mac housekeeping requirement. This supersedes the unconditional preflight
  described in the initial receipt/ledger. `persistent: true`, registered pool
  shutdown, PostgreSQL stop and directory retention are unchanged.

No product code, existing shared helper, migration, policy, grant, pin, lane,
ledger or expected assertion value changed. No install/download command,
browser, Git write, commit, push, merge or release. No new operational alert or
compatibility impact. Node remains `v24.17.0`; no runtime/pin repair attempted.

Actual r1 command records and logs are in
`/private/tmp/jg-test-tests-dashboard-authority-1-r1/`. Its phase-specific
`*-results.json` files record exact commands, working directories and exits.
All lint commands used `LANE_BASE_REF=origin/main`.

| Commands actually run | Result |
| --- | --- |
| `pnpm typecheck`, `pnpm lint`, `pnpm lint:lanes`, `pnpm build`, `pnpm openapi:check` | Each stalled before launching the check, after the existing ignored-overrides warning; terminated after 12 seconds with SIGTERM (exit -15). These wrappers did not pass. No package download/configuration workaround used. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs`; `node tools/agent-lane-boundary-lint.mjs` with the same environment | Both PASS, exit 0. Unlike the original uncommitted handoff, HEAD now differs from origin/main, so the real lane comparison runs and passes. |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | Both PASS, exit 0. |
| In each of core/config/storage/ai/db/API/web: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` | All seven PASS, exit 0; these are also the packages' lint checks. |
| In `packages/db`: `./node_modules/.bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck test/enterprise-dashboard.authority-race.integration.test.ts` | PASS, exit 0, explicitly compiles both repaired test files, which the db source-only tsconfig excludes. |
| In `packages/db`: `./node_modules/.bin/vitest list test/enterprise-dashboard.authority-race.integration.test.ts` | PASS, exit 0; eight cases collected, zero executed. |
| `node --test tools/*.test.mjs` (shell glob expanded by the runner) | PASS, 100 tests. |
| In core/config/storage/ai: `./node_modules/.bin/vitest run src --maxWorkers=1` | All PASS, respectively 2,801 / 1 / 2 / 113 tests. AI uses synthetic fixtures, not a live provider evaluation. |
| In `apps/api`: `./node_modules/.bin/vitest run src --maxWorkers=1` | FAIL, exit 1: 92 files passed, 9 failed; 1,719 tests passed, 129 failed, 23 skipped, 129 unhandled errors. HTTP failures report `listen EPERM` and Supertest's null `port`; two existing database isolation fixture hooks fail at free-port discovery before PostgreSQL startup. See `unit-api.log`. This broad attempt is not a successful API or database run. |
| In `apps/web`: `./node_modules/.bin/vitest run --maxWorkers=1` | PASS, 40 files / 867 tests; no browser/e2e run. |
| In core/config/storage/ai/db: `./node_modules/.bin/tsc -p tsconfig.json`; in API: `./node_modules/.bin/nest build`; in web: `./node_modules/.bin/next build` | All seven PASS, exit 0. Next emits existing workspace-root, CSS and dependency-expression warnings. |
| In `apps/api`: `node --import tsx src/generate-openapi.ts --check` | PASS, exit 0; existing generator through the installed loader, avoiding the IPC CLI. |
| `git diff --check`; read-only HEAD/branch/status/diff inspection | PASS; changes confined to the two test files plus this receipt. |

**PostgreSQL authority target: NOT RUN.** The dispatcher states this sandbox
cannot bind localhost or start PostgreSQL, and the broad API attempt confirms
port discovery/bind failures. No PostgreSQL cluster was started for this repair.
Collection/typechecking do not prove DA1–DA5 or the negative control. Root
`pnpm test`, dedicated database/migration suites and browsers/e2e were not run.
The dispatcher must push and obtain real PostgreSQL CI results and independent
exact-commit verdicts; the previous repair reports do not approve this diff.

Intended conventional commit subject/body written to both requested paths:
`/private/tmp/jg-msg-tests-dashboard-authority-1-r1.txt` and
`/private/tmp/jg-msg-ent-9b.txt`. No commit or push by the builder.
**RED / PARK remains; no self-acceptance, merge or release.**

## r2 — dispatcher 14 final repair, 17 October 2026

Entry HEAD `416f0766`, branch `codex/sandbox/tests-dashboard-authority-1`,
clean at entry. Read the dispatch-supplied excerpt for CI run `38989379116`:
DA1 failed in `expireSession` with PostgreSQL syntax error at `)`. The
2575/2576 CI count is dispatcher-supplied evidence, not a local execution.

Changed only the expiry SQL in the task-owned fixture and this appended receipt.
The bare `at` alias is ambiguous with PostgreSQL's `AT` expression syntax.
It is now the explicit, ordinary alias `AS fixture_time`; both timestamp
references use `t.fixture_time`. No assertion or production code changed.

**PG16 manual grammar/semantics inspection:** `WITH t AS MATERIALIZED
(SELECT <timestamp expression> AS fixture_time)` is a materialized SELECT CTE.
`UPDATE <table> SET created_at=t.fixture_time,
expires_at=t.fixture_time+interval '7 days' FROM t WHERE session_id=$1` uses
that CTE as the UPDATE source. The expression is `clock_timestamp()-interval
'8 days'`, evaluated once for both assignments. Creation remains eight days
before that clock reading; expiry is seven days after creation, hence one day
before the reading. The session-id predicate, bounded seven-day lifetime,
unrevoked state, transaction and owner-only trigger handling are preserved.
This is manual source inspection, not a database parser/execution result.

**PostgreSQL authority file: NOT RUN.** The dispatcher states that this sandbox
cannot bind localhost or start PostgreSQL. The broad API attempt below also
fails on socket binding/free-port discovery. No authority database was started;
eight-case collection proves no DA1–DA5 assertion. Real PG16 CI remains required.
No browsers/e2e, dedicated DB/migration suite or root `pnpm test` ran. No schema,
AI gateway, prompt or model changed; live-model evaluation is inapplicable.

Actual r2 logs and exact command/exit records are in
`/private/tmp/jg-test-tests-dashboard-authority-1-r2/`, with phase-specific
`wrappers-results.json`, `static-results.json`, `unit-results.json` and
`build-results.json`. Installed dependencies were reused without downloads.
All lint attempts set `LANE_BASE_REF=origin/main`.

| Commands actually run | Result |
| --- | --- |
| `pnpm typecheck`, `pnpm lint`, `pnpm lint:lanes`, `pnpm build`, `pnpm openapi:check` | All stalled after the ignored-overrides warning, before launching the check; each terminated after 12 seconds with SIGTERM, exit -15. No wrapper pass claimed. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs`; same environment with `node tools/agent-lane-boundary-lint.mjs` | Both PASS, exit 0. |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | Both PASS, exit 0. |
| In core/config/storage/ai/db/API/web: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` | All seven PASS, exit 0; also the package lint checks. |
| In db: `./node_modules/.bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck test/enterprise-dashboard.authority-race.integration.test.ts` | PASS, exit 0; explicitly compiles the test and repaired fixture, excluded by the normal source-only db tsconfig. |
| In db: `./node_modules/.bin/vitest list test/enterprise-dashboard.authority-race.integration.test.ts` | PASS, exit 0; eight cases collected, zero executed. |
| `node --test tools/*.test.mjs` (runner expands glob) | PASS, exit 0; 100 tests. |
| In core/config/storage/ai: `./node_modules/.bin/vitest run src --maxWorkers=1` | All PASS, exit 0; respectively 2,801 / 1 / 2 / 113 tests. AI fixtures are synthetic, not live-provider evidence. |
| In API: `./node_modules/.bin/vitest run src --maxWorkers=1` | FAIL, exit 1; 92 files passed, 9 failed; 1,719 tests passed, 129 failed, 23 skipped, 129 unhandled errors. HTTP failures report `listen EPERM` and Supertest null `port`; two existing DB fixture hooks fail at free-port discovery. See `unit-api.log`; this is not a successful API/database run. |
| In web: `./node_modules/.bin/vitest run --maxWorkers=1` | PASS, exit 0; 40 files / 867 tests. No browser/e2e execution. |
| In core/config/storage/ai/db: `./node_modules/.bin/tsc -p tsconfig.json`; in API: `./node_modules/.bin/nest build`; in web: `./node_modules/.bin/next build` | All seven PASS, exit 0. Next retains existing workspace-root, CSS and dependency-expression warnings. No browser started. |
| In API: `node --import tsx src/generate-openapi.ts --check` | PASS, exit 0; installed loader runs the existing generator check without the IPC CLI. |
| `git diff --check`; read-only branch/HEAD/status/diff inspection; final `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | PASS, exit 0, including after receipt append. Only this receipt and the fixture changed from entry HEAD; the assertion file is unchanged. A diagnostic `ps` attempt was denied by the sandbox; no escalation attempted. |

No product implementation, assertion, migration, permission, policy, pin or lane
change; no new operational alert or backwards-compatibility impact. The affected
invariant remains stored-session revalidation despite a previously verified
context; this fixture repair does not establish that invariant locally.
No Git writes, commit, push, merge or release. No new independent model verdict
or separate acceptance is claimed. Exact-commit CI, independent review and
separate technical acceptance remain HOLD; RED / PARK remains.

Conventional commit subject/body saved to both requested paths:
`/private/tmp/jg-msg-tests-dashboard-authority-1-r2.txt` and
`/private/tmp/jg-msg-ent-9b.txt`. The dispatcher owns committing and pushing.
