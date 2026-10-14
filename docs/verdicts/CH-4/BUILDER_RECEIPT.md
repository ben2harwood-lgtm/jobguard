# CH-4 repair round r6 — 13 October 2026, dispatcher 4

Builder run receipt; not an independent verdict or technical acceptance. Starting
and final HEAD: `5066f0ea545cd7b3977f161f2d6cc856029fdd0a` (PR #185).
Observed `origin/main`: `45125a4bb19cb32ca72b262229de5c030d2c33cf`; no fetch.
Working tree was clean at entry. No Git-writing command, install, package download,
PostgreSQL startup, socket-binding test, commit, push, merge or release was run.
Node v24.17.0 and installed pnpm 10.28.1 were used. All successful pnpm commands
below used `PATH=/private/tmp/ch4-pnpm-bin:$PATH`, the existing pinned shim.
An initial unqualified `pnpm --version` hung without returning a version and was
interrupted (exit 130); it was not used for checks or installation.

## Root cause and exact repair

`packages/db/src/migrate.ts:98` does **not split migration statements**. It reads
each registered file and sends that entire file as one `pool.query(sql)` call.
Only 0095 has a mode substitution; 0144 is sent unchanged, beginning `BEGIN;`.
Thus PostgreSQL's 1-based position 18569 refers to the full 39,972-character
original 0144 file, not a separately split routine or the chain concatenated.
It maps to line 175, column 190, immediately before the CASE expression's first
`THEN` (character 18570). The enclosing `CREATE FUNCTION
app.ch4_storage_integrity()` starts at character 14138, line 142.

The IF condition compared `latest.kind IS DISTINCT FROM CASE WHEN ... THEN ...
ELSE ... END`. PL/pgSQL reads an IF expression only until the first THEN outside
parentheses/brackets; this CASE's THEN ended it prematurely, leaving incomplete
SQL. This is confirmed by PostgreSQL 16's
[read_sql_construct implementation](https://raw.githubusercontent.com/postgres/postgres/REL_16_STABLE/src/pl/plpgsql/src/pl_gram.y)
(lines 2557–2574), rather than inferred from balanced dollar quotes alone.

Edited own unmerged migration 0144 in place: parenthesized that CASE expression.
A preservation check reconstructs the final file from HEAD with this single
replacement, proving the only SQL changes are the two parentheses. The resulting
predicate, tenant checks, predecessor semantics, privileges and commercial policy
are unchanged. No merged test changed.

Added `packages/db/test/job-work-state-syntax.test.ts`, plus that one exact path
in CH-4's own lane allowlist. Parsed comparison proves every other lane and every
other CH-4 field unchanged. The new test drives the real migration runner with a
scripted query adapter and verifies that its actual 0144 query equals the file.
The adapter establishes runner behavior only, not PostgreSQL execution.

The lexical guard checks the entire outer query and all 13 dollar bodies (10
functions and 3 DO blocks): quotes/comments, parentheses/brackets, the
BEGIN/IF/LOOP/CASE nesting used here, and all IF/ELSIF conditions. It rejects an
unprotected CASE before a condition's terminating THEN. Mutation controls remove
the actual fix in memory and prove rejection; additional controls cover missing
dollar/quote/comment terminators, parentheses, THEN and END. A positive control
covers tagged dollar quotes, nested comments, escaped/doubled quotes and SQL CASE
inside an EXISTS subquery. No SQL fixture, package or production parser was added.
This is a narrow guard for this migration's syntax forms, not a complete SQL or
PL/pgSQL parser, and cannot establish grants, RLS, execution or migration success.

Source-inspected every remaining statement of 0144, including all routine/DO
endings, trigger/constraint declarations and remaining CASE expressions. The
guard checks all bodies rather than just the failing function. No second instance
of this syntax class was found. PostgreSQL must still validate the complete chain.

## Tests-first evidence and executed checks

Before the SQL edit, the new 8-case suite exited 1: the full-query check rejected
`CASE in IF/ELSIF must be parenthesized`; the mutation control also correctly
reported that the expected fixed expression was absent. Six guard controls passed.
After the two-parenthesis fix, all 8 cases passed. After adding the two block-END
controls, the final standalone suite passed all **10** cases (exit 0).

Exact commands and results (logs at `/private/tmp/ch-4-r6-*.log`):

| Command | Exit | Result / log suffix |
|---|---:|---|
| `pnpm typecheck --concurrency=2 --force` | 0 | 7 executed tasks, 0 cached; `typecheck` |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2 --force` | 0 | root invariants and 7 executed package tasks, 0 cached; `lint` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | merge-base plus working tree; `lanes` |
| `pnpm build --concurrency=2 --force` | 0 | 7 executed tasks, 0 cached; `build` |
| `pnpm openapi:check` | 1 | tsx CLI IPC `listen EPERM` before checker; `openapi` |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | 0 | same source checker without CLI listener; `openapi-source` |
| `pnpm --filter @jobguard/core test --maxWorkers=2` | 1 | duplicate built-test collection issue below; `core` |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | 0 | 81 files, 2,426 source tests; `core-source` |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2 --exclude src/health.test.ts --exclude src/auth/sso/action-paths.test.ts --exclude 'src/contractor/*.http.test.ts' --exclude src/final-account-lock.isolation.test.ts --exclude src/shadow-isolation.application.test.ts` | 0 | 66 files, 1,556 tests; `api` |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | 0 | 33 files, 784 tests; `web` |
| `pnpm --filter @jobguard/ai exec vitest run src --maxWorkers=2` | 0 | 5 files, 80 synthetic adapter/evaluation tests; `ai` |
| `pnpm --filter @jobguard/config exec vitest run src --maxWorkers=2` | 0 | 1 test; `config` |
| `pnpm --filter @jobguard/storage exec vitest run src --maxWorkers=2` | 0 | 2 tests; `storage` |
| DB unit batch command below | 0 | 8 files, 76 tests (syntax suite then had 8 cases); `db-unit` |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/job-work-state-syntax.test.ts` | 0 | final 10 cases; `syntax` |
| `pnpm exec tsc -p /private/tmp/ch-4-r6-test-tsconfig.json` | 0 | strict typecheck of the new test and imports; `test-typecheck` |
| selected `node --test` tool batch below | 0 | 7 files, 19 tests; `tools` |
| `git diff --check` | 0 | no whitespace errors |
| Python exact SQL/lane preservation inspection | 0 | only two SQL parentheses, one lane path; no tracked-test edits |

The temporary test tsconfig extends the repository's strict config with noEmit,
no declarations/source map, and only the absolute new test path in `files`.
It is needed because the db package's normal typecheck includes `src` only.

DB unit batch:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 \
  test/recovery-case-join.test.ts test/site-extra-evidence-compatibility.test.ts \
  test/recovery-message-repository.test.ts test/recovery-case-outcome.test.ts \
  test/verify-audit-export-cli.test.ts test/contractor-session-context.test.ts \
  test/job-work-state-syntax.test.ts test/verify-evidence-pack-cli.test.ts
```

Tool batch was executed through Python `subprocess.run(['node','--test',...])`
using the sorted seven tool test paths listed in
`/private/tmp/ch-4-r6-tools-files.txt`: all `tools/*.test.mjs` except
`agent-lane-boundary.test.mjs` and `agent-lane-boundary-train.test.mjs`. Those two
create temporary Git repositories and run Git-writing commands, so they were
NOT RUN under this round's explicit no-Git-writes instruction. The lane checker
itself was run and passed. The eight API exclusions comprise two real-DB files
and six socket-based HTTP files; db `free-port.test.ts` also needs socket binding
and was NOT RUN. No retained suite was edited or made optional.

Build warnings: existing Next workspace-root/lockfile warning, CSS autoprefixer
`end` compatibility, webpack cache serialization, Nest file-type export and
load-esm dynamic-import warnings. Build exited 0. OpenAPI JSON was not edited.

Discovered later: default core tests after a build collect both `src` and `dist`.
Two built tests (`dist/recovery-allocation.test.js` DW9 and
`dist/site-extra-pricing.test.js` C3) fail with ENOENT while reading their adjacent
`.ts` files from `dist`. That run had 2 failed / 4,850 passed tests in 162 files;
source-only execution passed all 2,426 tests in 81 files. This is separate from
0144's SQL fix and was not repaired by changing merged tests or test discovery.
Do not describe the full `pnpm test` umbrella as passed in this sandbox.

## Whole filtered CI log inspection — run 38472273971

Inspected the full supplied 2,351-line log (not a full unfiltered Actions log):
`/Users/benharwood/.local/share/full-steam/jg-runs/ch-4-ci-failed-38472273971.log`.
ANSI-cleaned inspection copy: `/private/tmp/ch-4-ci-clean.log`.

Observed failures:

1. API `final-account-lock.isolation.test.ts`, DW8 real database setup at line 37:
   42601, end-of-input, position 18569 from `migrate.ts:98`.
2. API `shadow-isolation.application.test.ts`, setup at line 108: same 42601 and
   position; all 22 tests skipped on setup failure. API totals: 2 failed files,
   72 passed; 1,682 passed tests, 23 skipped.
3. DB `job-parties.integration.test.ts`: "applies the full migration chain to a
   SQL_ASCII database without UTF8 encoding" failed (85 other cases passed).
   Its detailed error is absent from the supplied filtered log. Source shows it
   calls `migrate(ascii)` at line 304; the 0144 cause is consistent but not proven
   for this particular failure without its detailed trace or a rerun.
4. DB `recovery-follow-up-upgrade.integration.test.ts`: "preserves
   preview/approve/revoke/deliver/reconcile and their refusals on upgraded messages
   without resending" failed; its other two cases passed. The log explicitly
   prints end-of-input at character 18569 followed by the full 0144 query.
   Source calls `migrate(admin)` at line 248 after its own upgrade assertions.

The other logged DB suites show skipped cases after setup; Turbo aborted on
`@jobguard/api#test` with 11/13 tasks successful, so the log has no final DB error
summary. This is not evidence of individual DB assertion regressions or passes.
The logged `RECOVERY_MESSAGE_CHANGED` and `RECOVERY_MESSAGE_EXISTING_EFFECT`
errors are expected negative controls (asserted rejections at upgrade test lines
208, 220 and 238), not other failing assertions. No additional independent
failure signature appears in the supplied log. Non-fatal CI warnings include
cache restore HTTP 400, Node/url.parse deprecation and Turbo test-output warnings.
The checks job stopped before build/browser steps; the supplied log does not
establish results for separate secrets/dependency-review jobs.

## Dispatcher execution required on the Mac / GitHub CI

PostgreSQL, migrations, socket-based HTTP, browser and full umbrella checks are
**NOT RUN here**. Use the pinned install and run:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 \
  test/job-work-state.integration.test.ts \
  test/job-work-state-sources.integration.test.ts \
  test/job-work-state-post-lock.integration.test.ts \
  test/job-work-state-races.integration.test.ts \
  test/job-work-state-catalog.integration.test.ts \
  test/job-work-state-upgrade.integration.test.ts \
  test/job-parties.integration.test.ts \
  test/recovery-follow-up-upgrade.integration.test.ts
pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 \
  src/final-account-lock.isolation.test.ts src/shadow-isolation.application.test.ts
pnpm test:db
pnpm test:migrations
pnpm test
pnpm openapi:check
pnpm build
pnpm test:e2e
```

The focused six CH-4 suites cover fresh/upgrade application of 0144, exact
catalog/grants/RLS, source replay, post-lock refusal and races. The retained
SQL_ASCII and follow-up-upgrade files are named above because this CI also showed
failures there. Full db/API umbrellas must cover every retained suite, including
ones aborted or skipped in the supplied log. Browser execution retains the
existing mobile-360 and desktop projects and all earlier mandatory journeys.

Migration strategy: 0144 is own/unmerged and repaired in place. Its BEGIN/COMMIT
transaction retains atomic application. No backfill, schema-shape change,
policy change, new grants, new alert or external action. A failed application
must roll back its transaction before retrying the corrected full chain; a later
failure after commit but before migration-name recording requires inspection,
not blind reapplication. This receipt does not prove runtime rollback behavior.
Existing historical migrations and customer records were untouched.

Affected invariants: tenant-qualified storage/RLS, immutable work/predecessor
facts, exact source/audit transaction behavior and durable migration application.
Their database guarantees still require actual PostgreSQL results. Q-01/Q-03/
Q-04/Q-05/Q-06 remain HELD; no held capability is admitted by this repair.
Independent different-model verdict bound to the dispatcher's eventual exact
commit and separate acceptance remain required. No acceptance/release claim.
Intended conventional commit message is overwritten at
`/private/tmp/jg-msg-ch-4.txt`; dispatcher owns commit/push.

---

## Retained earlier receipt history

Built by Codex; dispatched 13 Oct 2026

# CH-4 repair round r2 — partial, not accepted

Dispatched 13 October 2026, dispatcher 4. Starting and final HEAD: `4454c66560e9d97b3e2cbc1f32584fef8b3110d0`.
Observed `origin/main`: `6659fb58791ec22588948f005b2bd4f6b299fa48`; no fetch, Git write, commit, push,
merge, release, model review or acceptance was performed. Working tree was clean
at entry. Installed Node v24.17.0 and the existing pinned pnpm 10.28.1 shim were
used; no install, download or pin change. Intended message:
`/private/tmp/jg-msg-ch-4.txt`.

This round applies the coordinator ruling approving additive catalogue rows for
the four NEW CH-4 tables. The earlier receipt's catalogue STOP is resolved by this
explicit ruling; its OpenAPI STOP remains. Older sections below are retained
historical evidence and do not describe the current r2 catalogue state.

## Approved changes — exact before/after

Only `packages/db/test/tenancy.integration.test.ts` and CH-4's own lane entry
change, plus this receipt. In each of the two lists:

| Unchanged anchor (before) | Added immediately after it (after) |
|---|---|
| `job_finding` | `job_link` |
| `job_party_current` | `job_photo_purpose` |
| `job_record_proposal` | `job_site_source_receipt`, then `job_work_state_event` |

Eight added rows, four in each list, in name order:

```ts
      { relname: "job_link", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_photo_purpose", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_site_source_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_work_state_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_link", owner: "jobguard_migration" },
      { relname: "job_photo_purpose", owner: "jobguard_migration" },
      { relname: "job_site_source_receipt", owner: "jobguard_migration" },
      { relname: "job_work_state_event", owner: "jobguard_migration" },
```

Current r2 row lines: RLS/guard 268, 271, 273, 274; ownership 511, 514, 516, 517.
Rechecked current-main anchors at 268/270/271 and 508/510/511; they have the same
names/fields. This older checkout's original anchors were 267/269/270 and
506/508/509. Main wins; no conflicting main value was found at these anchors.
All existing expected values, refusals, counts, names, fingerprints and ordering
are preserved. A one-time Python inspection removed only the eight added lines
in memory and required exact equality with HEAD's entire test file; it passed.
No permanent preservation test was added.

Lane before: CH-4's allow list lacked `packages/db/test/tenancy.integration.test.ts`.
Lane after: add that exact path once and append a note recording coordinator
approval for the catalogue rows only. Every earlier allow entry and every other
lane is unchanged, verified by parsed-JSON comparison.
No premise-establishing setup line was needed or added.

## Executed checks and command evidence

Every pnpm command below was prefixed with:
`export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/ch4-pnpm-bin:$PATH"`.
No test/build fan-out occurred. Before each heavy command,
`memory_pressure | tail -1` reported 74% free and
`df -g /System/Volumes/Data` reported 52 GB available (both exit 0).

| Command | Exit | Evidence |
|---|---:|---|
| `pnpm --filter @jobguard/api openapi:generate` | 1 | tsx IPC permission refusal; JSON unchanged |
| `pnpm exec turbo run typecheck --concurrency=2 --force` | 0 | 7 successful tasks; 0 cached |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0 | Core purity (153 files), lane, money and commercial checks |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --concurrency=2 --force` | 0 | 7 successful tasks; 0 cached |
| `pnpm build --concurrency=2 --force` | 0 | 7 successful tasks; 0 cached; 30 static pages generated |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Actual merge-base range plus working-tree catalogue changes |
| `git diff --check` | 0 | No whitespace errors |
| `python3` inline additive edit | 0 | 8 new rows, 1 new lane path; JSON parses |
| `python3` inline preservation inspection | 0 | Entire earlier test bytes retained; other lanes and allow entries unchanged; hashes below |

Typecheck, lint and build used `--force`; no cache-hit result is called a run.
Turbo printed shared-cache IO permission warnings; all tasks nevertheless
executed successfully. Build printed the existing Next root/lockfile, CSS,
file-type export and dynamic-import warnings and exited 0.

Read-only shell inspection commands all exited 0: `pwd`, `git status --short`,
`git rev-parse HEAD`, `git rev-parse origin/main`; `cat AGENTS.md`,
`cat docs/contracts/job-work-state-v1.md`, `cat package.json`,
`cat apps/api/src/generate-openapi.ts`, `cat /private/tmp/ch4-pnpm-bin/pnpm`;
`sed -n '225,340p' AGENTS.md`, `sed -n '1950,1980p' BUILD_PLAN.md`,
`sed -n '1950,1978p' BUILD_PLAN.md`,
`sed -n '250,280p' packages/db/test/tenancy.integration.test.ts`,
`sed -n '490,525p' packages/db/test/tenancy.integration.test.ts`,
`sed -n '1,120p' docs/verdicts/CH-4/BUILDER_RECEIPT.md`,
`sed -n '1,65p' tools/lint.mjs`,
`sed -n '1,75p' tools/agent-lane-boundary-lint.mjs`,
`node --version`, `command -v pnpm`, `ls -l /private/tmp/ch4-pnpm-bin/pnpm`;
`git show origin/main:packages/db/test/tenancy.integration.test.ts` with
`sed -n '255,280p'` and `sed -n '495,520p'`;
`rg -n` searches for CH-4/table/OpenAPI names in the instructions, plan, lane,
package manifests, tenancy test and receipt; and the `rg -n` grant/added-row
inspection in migration 0144 and tenancy test.
`git diff -- packages/db/test/tenancy.integration.test.ts`, `git diff --numstat`
and `git diff --stat` exited 0. The inline preservation script and receipt
writer use read-only `git show HEAD:<path>`, `git rev-parse` and `git diff`;
all returned 0. Interactive output polls for typecheck/lint/build reached exit 0.
The `python3` receipt/message writer is recorded here as an artifact operation,
not a test. Final verification commands/results are appended below.

## STOP — OpenAPI

Exact command: `pnpm --filter @jobguard/api openapi:generate`, exit 1.
Exact refusal:

```text
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/42931.pipe
```

`apps/api/src/generate-openapi.ts:9` identifies the normal artifact write;
`apps/api/openapi.json:1` is unchanged. The refusal occurred in the tsx CLI before
that write. Per the issued stop-on-refusal instruction, no alternate invocation,
manual artifact edit or escalation was attempted. `pnpm openapi:check` is
**NOT RUN after the generator refusal**, not passed. Dispatcher/CI must regenerate
with the existing generator and check the result, preserving published operation
contracts and the pinned 409 enum. No automatic approval-review rejection occurred;
this was an operating-system permission refusal.

## NOT RUN and acceptance limits

`packages/db/test/tenancy.integration.test.ts` and all six own DB suites
(`job-work-state.integration.test.ts`, `job-work-state-sources.integration.test.ts`,
`job-work-state-post-lock.integration.test.ts`, `job-work-state-races.integration.test.ts`,
`job-work-state-catalog.integration.test.ts`, `job-work-state-upgrade.integration.test.ts`)
are **NOT RUN (cannot start PostgreSQL here)**. Every retained DB suite, affected
browser journey, `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and e2e umbrella
in the earlier receipt remain NOT RUN for dispatcher/CI execution. Unit tests
were not repeated in r2: this round changes catalogue expectations and lane
metadata only; previous unit evidence is historical and is not a new r2 run.
No database catalogue, RLS, ownership or migration assertion is claimed passed
from compilation or the additive source inspection.

Q-01/Q-03/Q-04/Q-05/Q-06 remain HELD exactly as recorded below. CH4-A21/A24/A25
still require actual PostgreSQL/retained-suite results; CH4-A28 still requires a
real different-model verdict bound to the dispatcher's eventual commit and
separate acceptance. No full acceptance ID is newly passed. No held command,
registry key, model/prompt, UI, provider action or production activation was added.

## Grants and preservation

No new GRANT or migration change in r2. Standard F remains: no runtime direct
INSERT/UPDATE/DELETE grant on money, membership, authorization, receipt or audit.
The unchanged 0144 migration's new grants (one per line) remain:

```sql
GRANT SELECT ON app.job_work_state_event TO jobguard_runtime;
GRANT SELECT ON app.job_site_source_receipt TO jobguard_runtime;
GRANT SELECT ON app.job_photo_purpose TO jobguard_runtime;
GRANT SELECT ON app.job_link TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.ch4_read_work_facts(uuid,uuid,text) TO jobguard_runtime;
```

SHA-256 before (HEAD) and after r2:

```text
packages/db/test/tenancy.integration.test.ts
  HEAD   41a9b7171e92a718f5f59f5a1879f3f5bc66aff94773ccbed2356516d5ab52ac
  r2     076246fa5ff916d5443fb5a8e17dd34f16da3d523544b02ef9123512195af2ad
config/agent-lane-assignments.json
  HEAD   5719ef4d2c3bc5122ae8f0b911491eeca4506a64e6aaddf348fefd2d4114b9be
  r2     554844d7425e240749a4a91bd467ac8aa88b0d33c8f8a92f27d89fc1792aafff
apps/api/openapi.json
  HEAD   c368255cd5e89140d2c4d6422a373edab192e478c773ddf20fed1a21a51413b5
  r2     c368255cd5e89140d2c4d6422a373edab192e478c773ddf20fed1a21a51413b5
packages/db/migrations/0144_job_work_state.sql
  HEAD   e88858ecd2fa4d482561dde4d8043b4adbe3414c715146c655e0d86f123f7c9b
  r2     e88858ecd2fa4d482561dde4d8043b4adbe3414c715146c655e0d86f123f7c9b
apps/api/src/auth/context-boundary.test.ts
  HEAD   a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35
  r2     a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35
packages/db/test/watchdog-command-harness.ts
  HEAD   3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6
  r2     3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6
packages/db/test/command-replay-contract.integration.test.ts
  HEAD   db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f
  r2     db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f
packages/db/test/fingerprinted-row-shape.integration.test.ts
  HEAD   be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8
  r2     be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8
```

`git diff --stat -- . ':!docs/verdicts/CH-4/BUILDER_RECEIPT.md'` (exit 0):

```text
 config/agent-lane-assignments.json           | 2 +-
 packages/db/test/tenancy.integration.test.ts | 8 ++++++++
 2 files changed, 9 insertions(+), 1 deletion(-)
```

Self-inspection: exact added-row removal reconstructs HEAD; unchanged source
bytes and hashes do not establish runtime correctness or independent review.
The catalogue edit is the only r2 edit to a merged test and is explicitly
coordinator-approved. The JSON lane check proves other entries unchanged.
OpenAPI remains incomplete under the exact refusal above. No schema/data
migration, backwards-compatibility change or new operational alert in r2.
Independent verdict and separate acceptance remain outstanding.

---

## Retained r1 and original delivery history


# CH-4 repair round r1 — partial, not accepted

Repair starting and final HEAD: `30a44f9fede0f473252d8a06c8235823e8f6d761`.
Branch: `codex/sandbox/ch-4`. Migration: `0144`, own and unmerged, edited in place.
The dispatcher committed the original delivery before this repair. Only the r1
working-tree changes are uncommitted. No git-writing command, push, release or
acceptance was performed in r1. Intended commit message is overwritten at
`/private/tmp/jg-msg-ch-4.txt`.

Opus reference: `/Users/benharwood/.local/share/full-steam/jg-runs/ch-4-opus-30a44f9.md`.
That verdict is REPAIR, source-inspected against the starting HEAD, not an
independent verdict on these uncommitted repair bytes. A new exact-commit verdict
and separate acceptance remain required.

## r1 repair and tests-first evidence

B1: read the real `proofEvidenceTypeSchema` from `packages/core/src/proof.ts:3`
and verified the same declaration on observed `origin/main`
(`6659fb58791ec22588948f005b2bd4f6b299fa48`). All three migration lists now use
`pre_cover_photo`, `completion_photo`, `excavation_photo`,
`electrical_certificate`. A comment names the enum source. The SQL replacements
were generated by reading that declaration, not by selecting guessed labels.

Before editing SQL or fixtures, expanded the own, unmerged source suite:
- Four named cases, one per enum option, drive the existing EvidenceService
  begin/finalize path with synthetic PNG bytes and a storage fake, assert exactly
  one first-site-evidence event and an exact evidence/version/hash receipt, then
  retain completion/replay assertions.
- Four named raw runtime-login insertion cases, one per enum option, persist a
  verified upload before lock and attempt the original insert after lock.
  They require `POST_LOCK_WORK_REQUIRES_LINKED_JOB`, zero original/source effects,
  identical event history and unchanged canonical upload bytes.
- Both matrices consume `proofEvidenceTypeSchema.options`, including all three
  real photo types and the retained certificate case.
- The own fixture's invalid default `photo` label now uses the enum's first option.
  Unknown-type exclusion still explicitly uses `unknown_photo_label`.

Exact test-title patterns in
`packages/db/test/job-work-state-sources.integration.test.ts`:
`CH4-A02 CH4-A05 %s creates first site evidence; stage completion is activity and planning is not (real existing proof commands, storage fake)`;
`CH4-A13 %s original raw runtime insert is refused on a locked job with a pre-lock verified upload`.
The source suite now defines 12 cases (previously 5; net +7).
First failing PostgreSQL run: **NOT RUN (cannot start PostgreSQL here)**.
Green PostgreSQL run: **NOT RUN for the same reason**. These are written coverage,
not a passed CH4-A02 or CH4-A13. No complete acceptance ID is newly claimed.

## r1 executed checks

Installed Node `v24.17.0`; the existing pinned pnpm 10.28.1 shim from the original
delivery was reused. No install, package download or pin change was attempted.
Before heavy checks: `memory_pressure -Q | tail -1` showed 74% free, and
`df -g /System/Volumes/Data` showed 52 GB available throughout. Only own unit files
ran, one run at a time, with `--maxWorkers=2` and no more than three files.

| Check | Exit | Evidence |
|---|---:|---|
| Core CH-4 unit suite | 0 | 1 file, 11 tests |
| API application/controller/HTTP batch | 0 | 3 files, 8 tests |
| API isolation suite | 0 | 1 file, 2 tests; scripted boundary test |
| Forced typecheck, concurrency 2 | 0 | 7 tasks successful, 0 cached |
| Root lint checks with LANE_BASE_REF=origin/main | 0 | Core purity, lane, money and commercial checks |
| Forced package lint, concurrency 2 | 0 | 7 tasks successful, 0 cached |
| Forced build, concurrency 2 | 0 | 7 tasks successful, 0 cached |
| pnpm lint:lanes with LANE_BASE_REF=origin/main | 0 | Real merge-base range plus working-tree changes |
| OpenAPI generation | 1 | Permission refusal below; JSON unchanged |
| Own test-file transpilation | 0 | 2 files, 0 syntax diagnostics; does not typecheck DB tests |
| Enum/SQL source comparison | 0 | 3 SQL lists equal all 4 enum values; deterministic check only |
| Whitespace check | 0 | git diff --check |

Total executed unit coverage: 21 tests in five distinct files. No PostgreSQL,
listening HTTP, browser or provider integration is proved by these runs.
Forced checks used `--force`; cache hits are not reported as runs. Turbo printed
shared-cache IO permission warnings. The build printed the previously observed
Next workspace-root, CSS, file-type export and dynamic-import warnings and exited 0.
One inspection script's obsolete `tools/openapi-check.mjs` read and
`apps/api/scripts` search were absent (cat 1 / rg 2); subsequent reads succeeded,
so the combined shell's exit was 0. No implementation depended on those paths.

All six own database files and every retained database/browser/umbrella suite
listed in the original-delivery record below remain **NOT RUN** here. In
particular the new sources cases, migration application, upgrade controls, races,
catalogue checks, `pnpm test:db`, `pnpm test:migrations` and affected e2e journeys
require dispatcher/CI execution. No suites became optional; Q-01/Q-03/Q-04/Q-05/
Q-06 and the original partial acceptance accounting remain held.

## r1 STOP and coordinator-owned catalogue edits

**OpenAPI STOP:** `apps/api/src/generate-openapi.ts:9`,
`apps/api/openapi.json:1`. Ran the requested existing generator, exit 1:

```text
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/25718.pipe
```

The refusal happened in the tsx CLI's IPC listener before application generation.
The dispatch instruction says to stop a permission-refused item and not try
another route to the same effect. No alternative invocation, manual JSON edit or
escalation was attempted. `openapi:check` is **NOT RUN after the refusal**, not green.
Dispatcher must regenerate the GET work-state operation and five 422 responses
with the existing generator, preserve newer-main operations and existing 409
values, then run `pnpm openapi:check`. This requested part remains incomplete.

**Catalogue STOP:** `packages/db/test/tenancy.integration.test.ts`, coordinator-owned.
Both lists still need the four new tables. The exact before/after snippets in the
original record below remain valid against observed origin/main, rechecked in r1:
- Main line 268: after unchanged `job_finding`, add `job_link` with all three RLS/guard fields true.
- Main line 270: after unchanged `job_party_current`, add `job_photo_purpose` with all three RLS/guard fields true.
- Main line 271: after unchanged `job_record_proposal`, add `job_site_source_receipt` and `job_work_state_event` with all three RLS/guard fields true.
- Main line 508: after unchanged `job_finding`, add `job_link`, owner `jobguard_migration`.
- Main line 510: after unchanged `job_party_current`, add `job_photo_purpose`, owner `jobguard_migration`.
- Main line 511: after unchanged `job_record_proposal`, add `job_site_source_receipt` and `job_work_state_event`, owner `jobguard_migration`.

On this older checkout those insertion anchors are lines 267/269/270 and
506/508/509. Main wins; the above requested line numbers are main's.
The full literal before/after replacements below specify every retained field.
No merged test or pinned list was edited. The previous self-comparison lane STOP
is resolved for this real committed HEAD range; no lane checker line was changed.
Newer-main additive reconciliation remains a dispatcher landing responsibility.

## r1 Opus LATER notes — preserved, not repaired

1. **Post-reopen eligibility default:** migration's final-check guard tests only
   the latest closed/reopened event and refuses while closed. A fixture reopen
   therefore removes this particular refusal. Post-reopen eligibility remains
   undecided under Q-01; this default is not a policy ruling. Earlier/running/
   completed-check consequences and lifecycle command admission remain held.
2. **Session expiry on existing source inserts:** `ch4_source_job` (original
   migration line 113, unchanged) newly refuses a guarded source insert if its
   persisted owning practice session is expired/revoked, including owner/worker
   insert paths. Retained Mac suites and the late-processing policy need checking.
3. **Changed refusal text/order:** application post-lock checks precede live
   checks; the A1 source trigger precedes the watchdog trigger. Locked non-live
   jobs return linked-job 422 rather than JOB_NOT_LIVE; raw wrong-tenant inserts
   return WORK_STATE_FORBIDDEN rather than JOB_NOT_FOUND (same SQLSTATE). Unchanged.
4. **Hard limit 12, lock order:** source-capture comments alone do not prove that
   no new business lock is acquired after audit-head allocation. CH-4 races and
   watchdog lock-order tests remain NOT RUN, so this property is unverified.
5. **Delivery/goods refusal detail:** post-lock delivery and goods-receipt storage
   refusals have a bare message without linked-job detail; typed mapping uses its
   generic fallback. Unchanged.
6. **Controller decorators:** the CH-4 controller adds four merged controllers'
   422 decorators through their prototypes. Unchanged; possible later cleanup.
7. **Certificate qualification:** whether electrical certificates should qualify
   as first site evidence needs a coordinator policy ruling. This repair retains
   the existing overlapping value and covers it without deciding that question.
8. **Unused variable:** capture helper's `prior_context` remains unused.

## r1 grants, self-inspection and preservation

No new GRANT, routine, route, registry key, authority policy, table or commercial
behavior was added in r1. Standard F remains: exactly the four SELECT grants and
the one checked-read EXECUTE grant enumerated below; no new direct runtime write
grant in any table family. Held writers remain inaccessible. No money, origin,
audit, lock, shadow or fingerprinted row shape was edited.

Source inspection confirms each enum option is covered by both test matrices,
and the raw case reaches evidence_object admission after a verified upload rather
than merely testing the upload guard. No test pins a merged file/hash.
The r1 edit inventory is migration, own fixture, own source suite and this receipt.
305 merged test files were compared byte-for-byte against repair HEAD; zero
changed. This does not claim equality to newer main or a passed DB catalogue run.

SHA256 evidence (receipt excluded to avoid self-reference):

```text
e88858ecd2fa4d482561dde4d8043b4adbe3414c715146c655e0d86f123f7c9b packages/db/migrations/0144_job_work_state.sql r1 changed
12e163577d260f0a44055e06ebb22184bfd7c8aeffe05bf1db63cc44966be647 packages/db/test/job-work-state-sources.integration.test.ts r1 changed
9585b7e9ce6f62c3227f2c3f39049c1718bea9e869427b77d194f01e4e9395a1 packages/db/test/job-work-state-fixtures.ts r1 changed
bcf18c087225144c80e91bab383144be03bcd899f79c8097ed28c39ce4dfeec9 packages/core/src/proof.ts unchanged from repair HEAD
41a9b7171e92a718f5f59f5a1879f3f5bc66aff94773ccbed2356516d5ab52ac packages/db/test/tenancy.integration.test.ts unchanged from repair HEAD
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 packages/db/test/watchdog-command-harness.ts unchanged from repair HEAD
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f packages/db/test/command-replay-contract.integration.test.ts unchanged from repair HEAD
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 apps/api/src/auth/context-boundary.test.ts unchanged from repair HEAD
c368255cd5e89140d2c4d6422a373edab192e478c773ddf20fed1a21a51413b5 apps/api/openapi.json unchanged from repair HEAD
Merged test files compared against repair HEAD: 305 changed: []
```

`git diff --stat -- . ':!docs/verdicts/CH-4/BUILDER_RECEIPT.md'`:

```text
packages/db/migrations/0144_job_work_state.sql     |  7 +++---
 packages/db/test/job-work-state-fixtures.ts        |  3 ++-
 .../job-work-state-sources.integration.test.ts     | 26 ++++++++++++++++++----
 3 files changed, 28 insertions(+), 8 deletions(-)
```

The receipt is the only additional changed path. Commit-message bytes are outside
the repository. All preservation claims here are deterministic inspection,
not an independent model review.

## r1 exact shell transcript

Each recorded shell script below is exact; the exit is the shell's final exit.
Read-only inspections were batched where independent. Tool-based patches changed
the own test suite first, then its own fixture; the SQL edit script follows in
this transcript. Receipt and intended-message writes used apply_patch. Polls only
read running commands' completion and introduced no shell script.

Shell script 1 — exit 0:

```sh
pwd; git status --short; git rev-parse HEAD; cat AGENTS.md; rg -n 'CH-4|10.1.5|10.2.6' BUILD_PLAN.md
```

Shell script 2 — exit 0:

```sh
cat packages/db/test/job-work-state-post-lock.integration.test.ts; cat docs/verdicts/CH-4/BUILDER_RECEIPT.md
```

Shell script 3 — exit 0:

```sh
cat packages/core/src/proof.ts; cat packages/db/test/job-work-state-sources.integration.test.ts; cat packages/db/test/job-work-state-fixtures.ts
```

Shell script 4 — exit 0:

```sh
cat /Users/benharwood/.local/share/full-steam/jg-runs/ch-4-opus-30a44f9.md; cat package.json; cat packages/db/package.json; cat apps/api/package.json
```

Shell script 5 — exit 0:

```sh
sed -n '1342,1385p' BUILD_PLAN.md; sed -n '1501,1538p' BUILD_PLAN.md; sed -n '1953,1982p' BUILD_PLAN.md; cat docs/contracts/job-work-state-v1.md; nl -ba packages/db/migrations/0144_job_work_state.sql | sed -n '95,245p'; nl -ba packages/db/test/tenancy.integration.test.ts | sed -n '256,276p;500,516p'
```

Shell script 6 — exit 0:

```sh
sed -n '1,85p' packages/core/src/proof.ts; cat packages/db/test/job-work-state-sources.integration.test.ts; rg -n -A18 -B5 'insertPhoto|workTenant|createWorkFixture' packages/db/test/job-work-state-fixtures.ts; cat /Users/benharwood/.local/share/full-steam/jg-runs/ch-4-opus-30a44f9.md
```

Shell script 7 — exit 0:

```sh
cat package.json; cat apps/api/package.json; cat tools/openapi-check.mjs; rg -n 'openapi|lint:lanes' tools apps/api/scripts; sed -n '150,320p' docs/verdicts/CH-4/BUILDER_RECEIPT.md; sed -n '300,350p' packages/db/migrations/0144_job_work_state.sql; cat /private/tmp/ch4-pnpm-bin/pnpm; node --version; memory_pressure -Q | tail -1; df -g /System/Volumes/Data
```

Shell script 8 — exit 0:

```sh
rg -n 'requiredEvidenceType|stage' packages/db/src/proof-repository.ts | head -25; cat apps/api/src/generate-openapi.ts; sed -n '1,35p' packages/db/test/job-work-state-fixtures.ts; sed -n '85,138p' packages/db/migrations/0144_job_work_state.sql; git rev-parse origin/main; git diff --stat origin/main...HEAD; rg -n 'CH-4|Q-01|reopen' docs/contracts/job-work-state-v1.md
```

Shell script 9 — exit 0:

```sh
python3 - <<'PY'
from pathlib import Path
import re
proof = Path('packages/core/src/proof.ts').read_text()
values = re.search(r'proofEvidenceTypeSchema = z.enum\(\[(.*?)\]\)', proof).group(1)
real_types = re.findall(r'"([a-z_]+)"', values)
assert real_types == ['pre_cover_photo', 'completion_photo', 'excavation_photo', 'electrical_certificate']
path = Path('packages/db/migrations/0144_job_work_state.sql')
sql = path.read_text()
old = "'photo','progress_photo','proof_photo','electrical_certificate'"
assert sql.count(old) == 3
replacement = ','.join("'" + value + "'" for value in real_types)
sql = sql.replace(old, replacement)
sql = sql.replace(" IF TG_TABLE_NAME='evidence_object' THEN applies:=", " -- Proof evidence types: packages/core/src/proof.ts (proofEvidenceTypeSchema).\n IF TG_TABLE_NAME='evidence_object' THEN applies:=", 1)
path.write_text(sql)
print('Replaced all 3 SQL lists with the 4 values read from proofEvidenceTypeSchema.')
PY
```

Shell script 10 — exit 1:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/ch4-pnpm-bin:$PATH"; pnpm --filter @jobguard/api openapi:generate
```

Shell script 11 — exit 0:

```sh
memory_pressure -Q | tail -1; df -g /System/Volumes/Data; export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/ch4-pnpm-bin:$PATH"; pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-work-state.test.ts
```

Shell script 12 — exit 0:

```sh
memory_pressure -Q | tail -1; df -g /System/Volumes/Data; export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/ch4-pnpm-bin:$PATH"; pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/job-work-state.application.test.ts src/job-work-state.controller.test.ts src/job-work-state.http.test.ts
```

Shell script 13 — exit 0:

```sh
memory_pressure -Q | tail -1; df -g /System/Volumes/Data; export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/ch4-pnpm-bin:$PATH"; pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/job-work-state.isolation.test.ts
```

Shell script 14 — exit 0:

```sh
cat packages/db/tsconfig.json; sed -n '1,240p' tools/agent-lane-boundary-lint.mjs; cat tools/lint.mjs; git diff -- packages/db/test/job-work-state-sources.integration.test.ts packages/db/test/job-work-state-fixtures.ts packages/db/migrations/0144_job_work_state.sql
```

Shell script 15 — exit 0:

```sh
memory_pressure -Q | tail -1; df -g /System/Volumes/Data; export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/ch4-pnpm-bin:$PATH"; pnpm exec turbo run typecheck --force --concurrency=2
```

Shell script 16 — exit 0:

```sh
sed -n '110,225p' docs/verdicts/CH-4/BUILDER_RECEIPT.md; tail -70 docs/verdicts/CH-4/BUILDER_RECEIPT.md; sed -n '27,42p' docs/contracts/job-work-state-v1.md; sed -n '205,220p' tools/agent-lane-boundary-lint.mjs; git show origin/main:packages/core/src/proof.ts | head -5; git show origin/main:BUILD_PLAN.md | sed -n '1953,1978p'
```

Shell script 17 — exit 0:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/ch4-pnpm-bin:$PATH"; LANE_BASE_REF=origin/main node tools/lint.mjs
```

Shell script 18 — exit 0:

```sh
memory_pressure -Q | tail -1; df -g /System/Volumes/Data; export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/ch4-pnpm-bin:$PATH"; LANE_BASE_REF=origin/main pnpm exec turbo run lint --force --concurrency=2
```

Shell script 19 — exit 0:

```sh
git show origin/main:packages/db/test/tenancy.integration.test.ts | nl -ba | sed -n '264,275p;504,516p'; git diff origin/main -- AGENTS.md BUILD_PLAN.md; git diff --name-only; git diff --check; git status --short
```

Shell script 20 — exit 0:

```sh
memory_pressure -Q | tail -1; df -g /System/Volumes/Data; export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/ch4-pnpm-bin:$PATH"; pnpm build --concurrency=2 --force
```

Shell script 21 — exit 0:

```sh
python3 - <<'PY'
import hashlib, subprocess
from pathlib import Path
paths=['packages/db/migrations/0144_job_work_state.sql','packages/db/test/job-work-state-sources.integration.test.ts','packages/db/test/job-work-state-fixtures.ts','packages/core/src/proof.ts','packages/db/test/tenancy.integration.test.ts','packages/db/test/watchdog-command-harness.ts','packages/db/test/command-replay-contract.integration.test.ts','apps/api/src/auth/context-boundary.test.ts','apps/api/openapi.json']
for path in paths:
    old = subprocess.check_output(['git','show','HEAD:'+path])
    current = Path(path).read_bytes()
    print(hashlib.sha256(current).hexdigest(), path, 'unchanged from repair HEAD' if current==old else 'r1 changed')
main_paths=subprocess.check_output(['git','ls-tree','-r','--name-only','origin/main'],text=True).splitlines()
tests=[p for p in main_paths if '.test.' in p and Path(p).is_file()]
changed=[p for p in tests if Path(p).read_bytes()!=subprocess.check_output(['git','show','HEAD:'+p])]
print('Merged test files compared against repair HEAD:',len(tests),'changed:',changed)
PY
```

Shell script 22 — exit 0:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/ch4-pnpm-bin:$PATH"; LANE_BASE_REF=origin/main pnpm lint:lanes
```

Shell script 23 — exit 0:

```sh
git diff --stat -- . ':!docs/verdicts/CH-4/BUILDER_RECEIPT.md'; git diff --check; git rev-parse HEAD; df -g /System/Volumes/Data; node - <<'JS'
const fs = require('node:fs');
const ts = require('typescript');
for (const path of ['packages/db/test/job-work-state-fixtures.ts','packages/db/test/job-work-state-sources.integration.test.ts']) {
 const result = ts.transpileModule(fs.readFileSync(path,'utf8'), {fileName:path,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext}});
 const errors=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 if(errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));
 console.log(path+': 0 syntax diagnostics (not typechecking or a PostgreSQL run)');
}
const proof = fs.readFileSync('packages/core/src/proof.ts','utf8');
const expected = [...proof.match(/proofEvidenceTypeSchema = z.enum\(\[(.*?)\]\)/)[1].matchAll(/"([a-z_]+)"/g)].map(m=>m[1]);
const sql = fs.readFileSync('packages/db/migrations/0144_job_work_state.sql','utf8');
const lists = [...sql.matchAll(/NEW.evidence_type (?:NOT )?IN\(([^)]+)\)/g)].map(m=>[...m[1].matchAll(/'([a-z_]+)'/g)].map(x=>x[1]));
if(lists.length!==3 || lists.some(list=>JSON.stringify(list)!==JSON.stringify(expected))) throw new Error('CH-4 evidence lists differ from proof enum');
console.log('3 SQL lists match all 4 proof enum values (deterministic source check only).');
JS
```

Final HEAD for r1: `30a44f9fede0f473252d8a06c8235823e8f6d761`.
OpenAPI and coordinator catalogue additions remain STOP; PostgreSQL and browser
checks remain NOT RUN. This repair is not accepted.

Post-transcript verification shell, exit 0:

```sh
head -12 docs/verdicts/CH-4/BUILDER_RECEIPT.md; cat /private/tmp/jg-msg-ch-4.txt; git diff --check; git status --short
```

This read confirmed four changed repository paths and no whitespace errors.
An initial tool patch for the message was invalid (`multiple operations target
/private/tmp/jg-msg-ch-4.txt`); verification rejected it before any message-file
mutation. A subsequent in-place Update File patch overwrote the intended message.
No file was deleted.

Final verification after receipt writing, exit 0:

```sh
git diff --check; git diff --stat; git status --short; git rev-parse HEAD; cat /private/tmp/jg-msg-ch-4.txt
```

No whitespace errors; four changed paths only (receipt, migration, own fixture,
own source suite). HEAD remained 30a44f9fede0f473252d8a06c8235823e8f6d761. The
message read confirmed its conventional fix(db) subject and r1 validation body.
The full diff-stat snapshot before adding this verification log was:

```text
 docs/verdicts/CH-4/BUILDER_RECEIPT.md              | 406 +++++++++++++++++++++
 packages/db/migrations/0144_job_work_state.sql     |   7 +-
 packages/db/test/job-work-state-fixtures.ts        |   3 +-
 .../job-work-state-sources.integration.test.ts     |  26 +-
 4 files changed, 434 insertions(+), 8 deletions(-)
```

---

# Original delivery record — historical, before dispatcher commit 30a44f9

The following receipt is retained as the original build evidence. Its references
to uncommitted original work and HEAD=issued-base describe that earlier delivery,
not the current r1 state. Its earlier hashes describe those earlier bytes; the r1
hashes and results above supersede them for the three repaired implementation/
test files. The original exact catalogue replacements remain current on main.


# CH-4 builder receipt — partial, not accepted

Check lane RED. Branch `codex/sandbox/ch-4`. Issued base and final HEAD: `269874640468a6e1dfdfed63edd4ce187d1d9dbb`.
All changes are uncommitted. No add, checkout, commit, push, merge, release or
acceptance was performed. Intended message: `/private/tmp/jg-msg-ch-4.txt`.
The addendum's requested Sonnet attribution would be inaccurate: this work was
built by Codex. No different-model verdict or separate acceptance exists yet.

## Scope and source verification

The CH-4 card, §10.1.5 meanings, CH-2 live predicate/registry contract, CH-3a party
bindings, SV-4 lock contract and §12 ownership/dependencies were source-inspected
on the issued base. AGENTS rev 3.0 was read. This is source inspection, not a
claim that its acceptance tests passed. The issued base already has 0140 site-extra
pricing, contrary to the draft's 0138 runner endpoint. Main wins: 0144 is appended
after 0140. No historic 0067 or another piece's migration number was used.

During work, origin/main advanced to `6659fb58791ec22588948f005b2bd4f6b299fa48`. Its changes include ENT-3b/0139,
contractor visit/extra version-2 registrations, additional catalogue rows and
shared barrels/composition/OpenAPI. Its only BUILD_PLAN change appends the ENT-3b
ledger amendment; the cited CH-4/counting/live/lock contracts are unchanged.
The worktree remains on the issued base as instructed. The dispatcher must merge
both sets of additive registrations and rerun checks on the resulting commit.
No open ENT branch implementation was copied or consumed. Preservation hashes
below refer to the issued base; unchanged does not mean identical to newer main.

Delivered: four immutable side tables; strict schemas and fact projection;
normalized existing-source hooks with original microsecond times; deterministic
first-evidence candidates and shared delivery/receipt deduplication; source-driven
finish cancellation without rewriting history; post-lock guards and replay seams;
new-lock/pending-check closure gating; immutable link/purpose integrity; one checked
persisted read shared by Nest/Next; typed 422 source refusal with exact copy.
No new mutation route or live-only registry key is introduced. Q-02's prerequisite
was not needed for this source-hook/read slice; future keys remain coordinator-owned.

Q-01/Q-03/Q-04/Q-05/Q-06 remain HELD exactly as issued. No finish/cancel/close/
reopen/resume/link/snagging-admission command or public writer routine exists.
No timers, intervals, eligibility restoration, money, capacity, counter, provider
integration or screen is implemented. This does not complete CH-4 or unblock MON-1.

## Executed checks and exact commands

Node: `v24.17.0`; installed pinned CLI: `10.28.1`. Dependencies were supplied.
`pnpm install --frozen-lockfile`: NOT RUN, dispatcher forbids downloads/install.
The global pnpm wrapper stalled selecting a version and was cancelled (130).
The existing cached 10.28.1 CLI was verified with:

`export PATH="$HOME/Library/pnpm/bin:$PATH"; node "$HOME/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs" --version` — 0.

A temporary shim `/private/tmp/ch4-pnpm-bin/pnpm` executes that exact cached CLI.
Every subsequent pnpm command used this prefix (no package pin was changed):

`export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/ch4-pnpm-bin:$PATH";`

Before heavy commands, `memory_pressure -Q | tail -1` and
`df -g /System/Volumes/Data` exited 0: observed free memory 67–72%, disk 65–83 GB.
The initial `memory_pressure | tail -1` stalled and was cancelled (130); `-Q`
queries the same free-memory percentage without the blocking default mode.
No database/browser/heavy-slot run was attempted: the sandbox cannot start them.
Tests used `--maxWorkers=2`, at most three files, serially; build and test never ran together.

| Command / run | Exit | Evidence |
|---|---:|---|
| `packages/core/node_modules/.bin/vitest run --maxWorkers=2 packages/core/src/job-work-state.test.ts` first run | 1 | Missing CH-4 module; 1 failed suite, 0 collected tests |
| Same command after implementation | 0 | 1 file, 9 tests passed |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/job-work-state.application.test.ts src/job-work-state.controller.test.ts src/job-work-state.http.test.ts` first run | 1 | 3 failed suites, 0 tests; package dist dependencies/controller unavailable |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-work-state.test.ts` strict-read regression red | 1 | 9 passed, 1 failed: missing read schema |
| Same command strict-read green | 0 | 10 tests passed |
| Same command late-receipt regression red | 1 | 10 passed, 1 failed: older activity incorrectly cancelled later finish |
| Same command final green | 0 | 11 tests passed |
| `pnpm exec turbo run typecheck --force` initial | 2 | 4 tasks passed; cross-package Zod type depth failed DB |
| `pnpm exec turbo run typecheck --force --concurrency=2` correction 1 | 2 | 5 tasks passed; direct source imports in API test violated rootDir |
| Same command correction 2 | 0 | 7 tasks executed, 0 cached |
| Same command after fact/query changes | 0 | 7 tasks executed, 0 cached |
| Same command final | 0 | 7 tasks executed, 0 cached, 31.091s |
| `pnpm exec turbo run lint --force --concurrency=2` initial | 0 | 7 package tasks executed, 0 cached |
| Same command final | 0 | 7 package tasks executed, 0 cached, 17.107s |
| `pnpm build --concurrency=2 --force` | 0 | 7 tasks executed, 0 cached, 35.653s |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/job-work-state.application.test.ts src/job-work-state.controller.test.ts src/job-work-state.http.test.ts` green | 0 | 3 files, 7 tests passed |
| Same command final including Next case | 0 | 3 files, 8 tests passed |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/job-work-state.http.test.ts src/job-work-state.isolation.test.ts` | 0 | 2 files, 4 tests passed (one overlaps previous batch) |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 1 | Core purity passed (153 TS files); lane gate refused initial HEAD=base comparison |
| `node tools/money-arithmetic-lint.mjs` | 0 | Money arithmetic boundary check passed |
| `node tools/commercial-boundary-lint.mjs` | 0 | No reported violation |
| `pnpm --filter @jobguard/api openapi:generate` | 1 | tsx IPC listener refused with EPERM; JSON unchanged |
| `git diff --check` (repeated after edits) | 0 | No whitespace errors |
| `git diff --name-only --diff-filter=D` | 0 | No deleted tracked files |

Final distinct unit coverage is 21 tests: 11 core plus 10 API. API application,
controller, Next and isolation tests are scripted boundary/serialization checks,
not real PostgreSQL or listening HTTP workflow evidence. The build ran the real
Next/Nest/tsc steps. It emitted shared-cache IO permission warnings and existing
Next workspace-root/CSS/file-type warnings; it exited 0. No cache-hit green is claimed.
Root lint did NOT pass; package lint is a separate result. `lint:lanes` and
`openapi:check` were not retried around refused gates.

Read-only inspection commands used `pwd`, `git status --short`, `git rev-parse`,
`git branch --show-current`, `git show`, `git diff`, `git log`, `rg`/`rg --files`,
`cat`, `head`, `tail`, `sed`, `nl`, `ls`, `node --version`, and Python hash/path/
JSON inspection. File writes used here-documents, Python and TypeScript AST
insertion scripts; the generated paths are the file inventory below. Exploratory
compound commands and write-script bodies were not retained as a complete exact
shell transcript; this is an A28 receipt limitation, not a claimed complete log.
Known nonzero inspection outcomes: missing guessed support/migration paths,
zsh unmatched old migration globs, an initial lane-insertion assertion (no write),
and the process inspection refusal below. These did not authorize edits outside the lane.
A partial machine run log is preserved at `/private/tmp/ch4-command-results.json`.

Tests-first evidence: the initial pure tests and initial source/storage/catalog/
post-lock/race DB files preceded their implementations; API tests preceded the
transport implementation. Strict-read and late-receipt tests have real assertion
red/green evidence. Database red/green execution is NOT RUN. The upgrade proof
and expanded later DB controls were authored after the initial SQL draft, so the
strict tests-first requirement is not fully met; reviewers must retain that gap.

## STOP / coordinator-owned items

1. **Merged catalogue lists**, current main
   `packages/db/test/tenancy.integration.test.ts:268,270,271,508,510,511`.
   No line in this merged test was changed. The coordinator must add the following
   rows in name order, retaining every existing row (current-main anchors shown):

**Line 268 before:**

```ts
      { relname: "job_finding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

**After (original line plus additions):**

```ts
      { relname: "job_finding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_link", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

**Line 270 before:**

```ts
      { relname: "job_party_current", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

**After (original line plus additions):**

```ts
      { relname: "job_party_current", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_photo_purpose", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

**Line 271 before:**

```ts
      { relname: "job_record_proposal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

**After (original line plus additions):**

```ts
      { relname: "job_record_proposal", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_site_source_receipt", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "job_work_state_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

**Line 508 before:**

```ts
      { relname: "job_finding", owner: "jobguard_migration" },
```

**After (original line plus additions):**

```ts
      { relname: "job_finding", owner: "jobguard_migration" },
      { relname: "job_link", owner: "jobguard_migration" },
```

**Line 510 before:**

```ts
      { relname: "job_party_current", owner: "jobguard_migration" },
```

**After (original line plus additions):**

```ts
      { relname: "job_party_current", owner: "jobguard_migration" },
      { relname: "job_photo_purpose", owner: "jobguard_migration" },
```

**Line 511 before:**

```ts
      { relname: "job_record_proposal", owner: "jobguard_migration" },
```

**After (original line plus additions):**

```ts
      { relname: "job_record_proposal", owner: "jobguard_migration" },
      { relname: "job_site_source_receipt", owner: "jobguard_migration" },
      { relname: "job_work_state_event", owner: "jobguard_migration" },
```

2. **Lane gate**, `tools/agent-lane-boundary-lint.mjs:212` (unchanged):

```js
if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");
```

The command was `LANE_BASE_REF=origin/main node tools/lint.mjs`, exit 1.
At that run both refs were the issued base. After: **the line must stay unchanged**;
the dispatcher supplies an actual commit/range and runs the gate. No fake range,
check edit or alternative bypass was attempted after refusal.

3. **OpenAPI**, `apps/api/src/generate-openapi.ts:9` / `apps/api/openapi.json:1`.
Command: `pnpm --filter @jobguard/api openapi:generate`, exit 1.
Exact refusal: `Error: listen EPERM: operation not permitted
/var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/20902.pipe`.
The existing JSON stayed unchanged. After: dispatcher runs the existing generator
and adds only the CH-4 read operation and source 422 responses, preserving current
main's ENT-3b operations and the pinned 409 enum. No alternate generation route
was attempted. `openapi:check`: NOT RUN after this refusal.

4. **Process inspection**: `ps -o pid,etime,command -p 93390` was refused with
`zsh:1: operation not permitted: ps`. That item stopped; no alternative process
inspection route was attempted.

5. **Current-main reconciliation**: retain newer shared registrations during
landing in `config/agent-lane-assignments.json`, core/DB barrels, migration runner/
notes, API module/workspace composition and OpenAPI. No git-writing operation or
out-of-lane copy was attempted. This is a dispatcher landing task, not permission
to erase newer main's changes.

Q-02 is a future STOP only if a new live-only registry key becomes necessary:
`packages/db/test/command-replay-contract.integration.test.ts:20` and the shared
harness remain untouched. No such key is needed or added by this delivered slice.

## Every new GRANT — standard F

No new direct INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER grant to
`jobguard_runtime`, on any table family. No new membership, authorization, money,
receipt or audit write privilege. Private helpers/trigger routines are revoked
from PUBLIC, runtime, infrastructure, shadow and emergency-access roles.

- `GRANT SELECT ON app.job_work_state_event TO jobguard_runtime;`
- `GRANT SELECT ON app.job_site_source_receipt TO jobguard_runtime;`
- `GRANT SELECT ON app.job_photo_purpose TO jobguard_runtime;`
- `GRANT SELECT ON app.job_link TO jobguard_runtime;`
- `GRANT EXECUTE ON FUNCTION app.ch4_read_work_facts(uuid,uuid,text) TO jobguard_runtime;`

These are four SELECT grants and one EXECUTE grant on the checked read only.
Catalogue/grantee ownership/RLS assertions exist but are NOT RUN here. No held
routine receives EXECUTE. No shadow relation receives a new privilege or column.

## NOT RUN files and required external evidence

All six own PostgreSQL suites below are NOT RUN (cannot start PostgreSQL here),
including first failing execution and fresh/upgrade/race/catalog checks:

- `packages/db/test/job-work-state.integration.test.ts` — NOT RUN (cannot start PostgreSQL here).
- `packages/db/test/job-work-state-sources.integration.test.ts` — NOT RUN (cannot start PostgreSQL here).
- `packages/db/test/job-work-state-post-lock.integration.test.ts` — NOT RUN (cannot start PostgreSQL here).
- `packages/db/test/job-work-state-races.integration.test.ts` — NOT RUN (cannot start PostgreSQL here).
- `packages/db/test/job-work-state-catalog.integration.test.ts` — NOT RUN (cannot start PostgreSQL here).
- `packages/db/test/job-work-state-upgrade.integration.test.ts` — NOT RUN (cannot start PostgreSQL here).

Retained files were confirmed present on the issued checkout. All are unchanged:

- `packages/db/test/watchdog.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/watchdog-lock-order.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/command-replay-contract.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/job-parties.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/variation.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/evidence.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/materials.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/supplier-documents.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/proof-replay.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/final-account-lock.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/final-account-lock-invoice.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/final-account-lock-reveal.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/final-account-lock-upgrade.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/fingerprinted-row-shape.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/tenancy.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/site-extra.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/site-extra-authority.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/shared-money-origin.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/extra-origin.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/extra-origin-upgrade.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/contractor-session-context.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/shadow-catalog.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/demo-bootstrap.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).
- `packages/db/test/UIWIRE-12.integration.test.ts` — NOT RUN (cannot start PostgreSQL here; dispatcher-owned retained run).

- `apps/api/src/auth/context-boundary.test.ts` — NOT RUN (local runs restricted to own files; source/hash inspection only).
- `apps/api/src/watchdog-registry.test.ts` — NOT RUN (same restriction; registry unchanged).
- Newer main's ENT-3b suites, site-extra visit coverage and small-builder-origin Rule-9 proof — NOT RUN; dispatcher runs after landing.
- Existing affected browser journeys, mobile-360 and desktop — NOT RUN (cannot start a browser here). No new screen/spec was authorized.
- `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, retained e2e umbrellas — NOT RUN locally under three-file limit; CI/checker evidence mandatory.
- `pnpm lint:lanes` — NOT RUN after its underlying lane safety refusal.
- `pnpm openapi:check` — NOT RUN after generator listener refusal.
- `pnpm eval` — inapplicable: no model, prompt, extraction parser or AI gateway change.
- No production/pilot activation, provider integration, real upload invitation, release/security/commercial approval, or professional sign-off.

## Acceptance accounting

No complete acceptance ID is declared passed. Executed units prove only the named
independent assertions below; PostgreSQL acceptance is unverified and policy/
authority sub-parts remain held. "Written" is not "passed".

| ID | Available evidence / remaining hold |
|---|---|
| CH4-A01 | Core strict-command/read schema tests; API authority/query/mode tests executed. Held-command/snagging admission remains Q-06/Q-03. |
| CH4-A02 | Core classifier executed; source suite written for photo, ready/held delivery and actual proof pending/finalize. DB NOT RUN. |
| CH4-A03 | Core earliest identity executed; shared delivery/receipt and concurrent candidate tests written, DB NOT RUN. |
| CH4-A04 | Core origin classes executed; real builder capture/replay/withdrawal source test written, DB NOT RUN. Full repricing/approval/rejection regression depends on retained suites. |
| CH4-A05 | Core reserved-source contract executed; existing proof completion/replay source test written, DB NOT RUN. |
| CH4-A06 | Pure representation and older-receipt regression executed; fixture immutable marker/cancel and automatic cancellation tests written, DB NOT RUN. Q-05 retrospective interval and Q-06 command holds remain. |
| CH4-A07 | Pure reason/note shape executed; fixture close/history/audit-note exclusion test written, DB NOT RUN. Q-06 runtime close held. |
| CH4-A08 | New pending-check/raw and existing lock-routine refusal fixture tests written, DB NOT RUN. Reopening/earlier/running/completed consequences Q-01; close authority Q-06 held. |
| CH4-A09 | Pure immutable/terminal-lock representation executed; fixture reopen/resume storage written. Q-06 execution and Q-04/Q-05 interval/place semantics held. |
| CH4-A10 | Core changed-identity check executed; existing source replay/conflict tests written, DB NOT RUN. Held command replay Q-06. |
| CH4-A11 | Core microsecond/order/regression tests executed; stored photo-source exact time and upgrade comparators written, DB NOT RUN. |
| CH4-A12 | Fact ordering only executed; no complete interval implementation/test. Q-04/Q-05 held. |
| CH4-A13 | Pure offer and 422 mapper executed; DB guards cover order draft/revision/placement, invoice intake, image upload/finalization, builder origin, stage/link/progress writes. Own tests cover a raw table matrix, supplier/builder paths and six actual existing repository recipes through read-only harness reuse. The matrix is NOT RUN; checker execution and remaining edge coverage are mandatory. |
| CH4-A14 | Pure no-activity classes executed; billing bank-receipt/helper exclusion boundary test written, DB NOT RUN. No live catch/payment/retention journey asserted. Sn agging admission Q-03 held. |
| CH4-A15 | Builder pre-lock replay/changed/new identity and source replay tests written, DB NOT RUN. Existing non-live guards remain; no cross-lifecycle exception was invented. Six-repository replay/new-identity matrix is written but NOT RUN; refused-ID retry and remaining edge cases still need checker coverage. |
| CH4-A16 | Concurrent source winner, actual lock-routine vs intake and revocation-while-waiting tests written, DB NOT RUN. Deferred plain-read authority recheck source-inspected only. |
| CH4-A17 | Atomic rollback, excluded billing lock-helper and fixture closed lock refusal written, DB NOT RUN. Full close/check race and Q-01/Q-06 consequences held. |
| CH4-A18 | Link integrity/invalid identity and valid common-binding fixture tests written, DB NOT RUN. Complete permission/cycle/replay journey Q-06 held. |
| CH4-A19 | Fixture link job-byte/money-effect inventory written, DB NOT RUN; runtime linking Q-06 held. |
| CH4-A20 | API authority-before-read and stamp-copy boundary tests executed; DB context/catalog and authenticated reader/expiry written, DB NOT RUN. Full real source/transport isolation and held command authority unverified/held. |
| CH4-A21 | Actual catalogue/SELECT-only/private-helper assertions written, DB NOT RUN. Held command grants remain absent. |
| CH4-A22 | Scripted fixed public query shape executed; real zero/many hidden-signal read equivalence written, DB NOT RUN. Held interval/command equivalence Q-04/Q-05/Q-06. |
| CH4-A23 | Fresh service forwarding, Nest metadata and actual Next handler serialization/no-store boundary tests executed. Real persisted reader test written, DB NOT RUN; listening/framework journeys and held transports remain unverified/held. |
| CH4-A24 | Rule-9 own-step/canonical text/types/PK-row comparator, later twice, negative/positive controls written, DB NOT RUN. Fingerprinted-table suite unchanged and unrun. |
| CH4-A25 | Issued-base preservation hashes below. All retained runs NOT RUN; current-main landing regressions mandatory. |
| CH4-A26 | No new job mutation key; registry/harness untouched. Future key coverage is coordinator-owned; held commands remain absent. Unchanged registry/replay suites NOT RUN. |
| CH4-A27 | Synthetic-only constructor/query/read output tests executed; SQL mode/side-table and fixture effect inventory written, DB NOT RUN. No real provider initialized; held command/snagging paths remain absent. |
| CH4-A28 | This receipt, intended message and hashes; uncommitted diff only. Complete shell transcript/test-first deviations noted. Independent exact-commit verdict and separate acceptance pending. |

## Self-review (builder source inspection, not independent verdict)

- New table families have SELECT-only grants; no new public mutation or guessed lifecycle role.
- Existing hash/receipt arithmetic and live calls are retained; changes are additive imports, checks, catch mapping and composition/metadata.
- Source locks precede sequence/advisory work and audit; excluded billing/catch facts return before the source business-lock helper.
- Source audit is deferred; its post-insert source authority recheck uses plain reads only. Every failure rolls the transaction back.
- Older received work does not cancel a later finish marker; source identity and original server timestamps remain immutable. No timer or retrospective interval rule selected.
- First site evidence is an earliest-candidate projection, documented as a reversible implementation choice; no immutable historical winner is rewritten.
- Photo purpose cannot relabel an existing progress source as snagging. Admission remains absent.
- Current closed-state guard addresses new lock/pending admission only; absence of that refusal is not a restoration/eligibility approval.
- Links enforce exact bindings, shared identities and serialized cycle detection as storage; the eventual authorization/adoption command journey remains held.
- No hidden input, money writer, provider call, quoted-document/lock/source mutation or UI edit was added.
- SQL, races, catalogues and upgrades are NOT RUN. Coverage gaps in A13/A15/A16/A17/A20/A23, the strict tests-first deviation and incomplete exact exploratory transcript remain technical holds, not approved exceptions.
- OpenAPI artifact and root lane acceptance remain blocked as above; landing must preserve newer main.

LATER: screens/offer presentation and held link/snagging/lifecycle command journeys after the issued rulings.

## Preservation hashes, inventory and final head

All eight reviewed practice bridge source hashes, the auth boundary test, shared
watchdog/harness/replay tests, fingerprint test and contractor source on the
issued base are unchanged. No permanent test was added to pin merged/shared file
bytes. The following inspection is not retained-suite execution:

```text
9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14 packages/db/src/practice-session.ts UNCHANGED vs issued base
56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c packages/db/src/contractor-repository.ts UNCHANGED vs issued base
e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0 packages/db/src/contractor-party-repository.ts UNCHANGED vs issued base
4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3 packages/db/src/work-order-repository.ts UNCHANGED vs issued base
45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5 packages/db/src/sor-repository.ts UNCHANGED vs issued base
ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d packages/db/src/job-scheduling-repository.ts UNCHANGED vs issued base
cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386 packages/db/src/work-order-fixtures.ts UNCHANGED vs issued base
a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c packages/db/src/contractor-session-context.ts UNCHANGED vs issued base
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 apps/api/src/auth/context-boundary.test.ts UNCHANGED vs issued base
efe6f104c0a9e7ae408ce661b23fcbd181a11eb6dce65624ba61b14a73ff9de9 packages/core/src/watchdog.ts UNCHANGED vs issued base
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 packages/db/test/watchdog-command-harness.ts UNCHANGED vs issued base
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f packages/db/test/command-replay-contract.integration.test.ts UNCHANGED vs issued base
41a9b7171e92a718f5f59f5a1879f3f5bc66aff94773ccbed2356516d5ab52ac packages/db/test/tenancy.integration.test.ts UNCHANGED vs issued base
be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8 packages/db/test/fingerprinted-row-shape.integration.test.ts UNCHANGED vs issued base
e71f848bbf8978ac78bc8a4cdd3f0519e8d52f23d14fcd4e917e1ef02d246839 packages/db/src/site-extra-repository.ts UNCHANGED vs issued base
1e3119299e15572885633d5f892f2bc385756589e65a1b280d476f5c5cc74eab packages/db/migrations/0135_site_extra_authority.sql UNCHANGED vs issued base
ae66c7ba5465ec9cd34d69af2085ab3f4c2a882f7580c7cae4a1ed68061ffba1 AGENTS.md UNCHANGED vs issued base
abe4a650e2ca928c38ee21bc7168caf10e44e66c45f55e25aa80c6f238a6148b BUILD_PLAN.md UNCHANGED vs issued base
06b501e413424d77fc5c3a1ac0f481b7230c271e36bfbde2cb953385ccccd349 pnpm-lock.yaml UNCHANGED vs issued base
c368255cd5e89140d2c4d6422a373edab192e478c773ddf20fed1a21a51413b5 apps/api/openapi.json UNCHANGED vs issued base
```

`git diff --stat` (tracked edits; untracked additions listed separately):

```text
 apps/api/src/app.module.ts                         |  4 +++-
 apps/api/src/proof/proof.application.ts            |  3 ++-
 apps/api/src/workspace/application.ts              |  4 +++-
 apps/web/app/api/jobs/[id]/proof/route.ts          |  4 ++--
 .../jobs/[id]/purchase-orders/placement/route.ts   |  2 +-
 .../jobs/[id]/purchase-orders/revisions/route.ts   |  2 +-
 .../jobs/[id]/supplier-documents/intake/route.ts   |  2 +-
 apps/web/app/api/jobs/[id]/variations/route.ts     |  4 ++--
 config/agent-lane-assignments.json                 |  3 ++-
 packages/core/src/index.ts                         |  1 +
 packages/db/MIGRATIONS.md                          | 21 +++++++++++++++++
 packages/db/src/evidence.ts                        | 26 ++++++++++++----------
 packages/db/src/index.ts                           |  2 ++
 packages/db/src/migrate.ts                         |  1 +
 packages/db/src/proof-repository.ts                | 12 +++++-----
 packages/db/src/purchase-order-repository.ts       |  5 +++--
 packages/db/src/supplier-document-repository.ts    | 13 ++++++-----
 packages/db/src/variation-repository.ts            | 12 +++++-----
 18 files changed, 80 insertions(+), 41 deletions(-)
```

Full non-receipt file inventory with SHA256 (working-tree inspection, not a lane-gate replacement):

```text
e9911c3af8efbd2cfd8a78ed2bbd6e42ffce4503ce9c58ad95d227071e6fae1d apps/api/src/app.module.ts
c71dc10e38c04a602961e9e3eb44e8a7fa7c0eebf082687871dffbd3f8deaa49 apps/api/src/job-work-state.application.test.ts
19d74e04f7eb75e90c20e7c36adbde307d38412bb303d6451026e79d4a697bf8 apps/api/src/job-work-state.application.ts
2dd45fd7d8d589990d676e9a74b41d7fc32be35ffabc588e44f2a24398281467 apps/api/src/job-work-state.contracts.ts
ed14a09854ed56dcfc0e3b1bb4811069c9426ec4f5ab9e7de97f1fa695f89759 apps/api/src/job-work-state.controller.test.ts
a0c0f571f323916f44bee6a1c7e28866a8d051f542cb2b4f7c1526b983d73f84 apps/api/src/job-work-state.controller.ts
605874c3a4192117461d0a61955463cd6138c3abfd8d96d4fb8c18a5f81c230e apps/api/src/job-work-state.errors.ts
163a8e38acf8ea2551949d0ee7f0a3352b42e3986e16839909f0caee94dfeeaf apps/api/src/job-work-state.http.test.ts
1d97400c24d254fa2c2032534b05e30932d15f9a091523e3e3f37519d0b3acc8 apps/api/src/job-work-state.isolation.test.ts
a27c824bb559c33093bade3112e67742216b581b216f4b7176c479db1355e853 apps/api/src/proof/proof.application.ts
56d0ec5c4df0e43847d52dc6fff0285b246cbee4a586d352628912e9e9e792cf apps/api/src/workspace/application.ts
d86953b0acddd8169e8e52ef62e1ea371d185e555634253ff584328e05d1df4f apps/web/app/api/jobs/[id]/proof/route.ts
d0730b72bd5b4d419889982454c24e7a294ac2d1411fa7774c9e942fb50aca48 apps/web/app/api/jobs/[id]/purchase-orders/placement/route.ts
970c2dd0f9dbd5aac9eae603428ed99eb34ddd0cd5797f3371ca24aa60bf2417 apps/web/app/api/jobs/[id]/purchase-orders/revisions/route.ts
cc50bc648acfdee3e48641faccdd82079c667110b5ddef07578c6e5d2e17468f apps/web/app/api/jobs/[id]/supplier-documents/intake/route.ts
5771b6718f88acd4fa8275095e0506944ca9b7d6204d8521c9266b99ed60b725 apps/web/app/api/jobs/[id]/variations/route.ts
1851ee0ef023fd6ff154f5b5c61fccae18cc69c7ad2cf867d164ad3cb94bf45f apps/web/app/api/jobs/[id]/work-state/route.ts
5719ef4d2c3bc5122ae8f0b911491eeca4506a64e6aaddf348fefd2d4114b9be config/agent-lane-assignments.json
6ca091032933dbb706944319af24b6593eb438b9fd3cbc87a47e774f41ce1cda docs/contracts/job-work-state-v1.md
a74341374ebb2767dcc4c6036e63103b9ab7a1274b7d7bc3e4897743d3588f39 packages/core/src/index.ts
3e3364a82341d097ae0d98a3b2d51889cc11723ff76f9968a0e92b6cf0d01afc packages/core/src/job-work-state.test.ts
6ce44ec242714ebf8b1d312dd70e980f718f2089a5685bf4ec7d03e629bb37f6 packages/core/src/job-work-state.ts
386531bd4c4edd506ce5498a378edfcc6977f711fa9bb33ada476006b3608b6b packages/db/MIGRATIONS.md
1c5f360e84bc0cb304e3334a60239c55f0970bcb43bbf9fb8532479831bd2219 packages/db/migrations/0144_job_work_state.sql
541f9e38802dcfd362b7716d3aa934d713bb485ee5980570c67c32ab97c0c546 packages/db/src/evidence.ts
59d4de587417bc55aff9e0afd9982b07ccc9cee246b4b7c75761a4abc8003dc4 packages/db/src/index.ts
26e62c39b4b971dcb8f354ffeda3c99d0ba0e4220ac286816a6adb4400062b9d packages/db/src/job-work-state-repository.ts
8360b7836d3db2b8bce2c9b075f2eb43855eae8b8fc088dc2ccfcb08e8a77008 packages/db/src/job-work-state-sources.ts
8f7751f88c684d334c43b1d6029d5538d8ea35068e1de0bc5b4be5f2064d9b5b packages/db/src/migrate.ts
1e3c2070656c8e71e4f391535f6566e3082b604693e62b0594c41717585b54e9 packages/db/src/proof-repository.ts
ee921d3f03e43e09e5561df4a3449277d0712059b314d18453da014fd2f17a36 packages/db/src/purchase-order-repository.ts
6998004fa8fbe0b679cc7d640cbecf723fc7debd6f601c4d9bc393db00d547dc packages/db/src/supplier-document-repository.ts
383bb186ced25eff6016e0970398ff6ef21ace0d672c6e10c1682ae8f34429f8 packages/db/src/variation-repository.ts
ebabeeeea4ec1d0a52edbbb307cbf36f6fbda5dc63ec37453441c1c05eaf23ea packages/db/test/job-work-state-catalog.integration.test.ts
0a84202955c554732016f3dcd07788413fe64ed06521ee34067f083439b5bf5a packages/db/test/job-work-state-fixtures.ts
1b55959c8ed86455f57d79a779677ea5bb503040dd2ddee7685e1755f5f26e48 packages/db/test/job-work-state-post-lock.integration.test.ts
bd4c57f8745a610d1735679b898b401af97bb05d334f9ad42c7ab5c1e6cb4329 packages/db/test/job-work-state-races.integration.test.ts
7a81f948f8bb872f0b40e17bd26a3fc5d171ce5b432ade7581d8ce2c09f3acae packages/db/test/job-work-state-sources.integration.test.ts
19cb3aae9ea71ec6939c20a34d2bef9d0b2113b48ff22ce76f25f0556a2fd7ad packages/db/test/job-work-state-upgrade.integration.test.ts
2fc85c00343e2221a330ed3398e472312eba3ece8ec5b7e2b315feb103406c9b packages/db/test/job-work-state.integration.test.ts
```

All 41 changed/new files fit the issued lane ceiling; no deleted tracked file.
This manual inventory does not replace the refused lane gate.

Final HEAD: `269874640468a6e1dfdfed63edd4ce187d1d9dbb` (issued base; all delivered work uncommitted).
Current observed origin/main: `6659fb58791ec22588948f005b2bd4f6b299fa48`.


## r2 final verification

The receipt/message writer exited 0. Final `git diff --check`, `git diff --stat`, `git status --short`, `git rev-parse HEAD` and `df -g /System/Volumes/Data` exited 0; disk was 51 GB available at final verification (52 GB before heavy runs). The final inline Python verification exited 0: exactly the three authorized r2 paths changed, eight additive catalogue rows reconstruct the prior test bytes when removed in memory, other lane entries remain unchanged, and the intended commit-message file exists. Final HEAD remains `4454c66560e9d97b3e2cbc1f32584fef8b3110d0`. No Git-writing command was run.

Final whole-worktree stat before the final verification note (exit 0):

```text
 config/agent-lane-assignments.json           |   2 +-
 docs/verdicts/CH-4/BUILDER_RECEIPT.md        | 204 +++++++++++++++++++++++++++
 packages/db/test/tenancy.integration.test.ts |   8 ++
 3 files changed, 213 insertions(+), 1 deletion(-)
```

Final receipt disk-value correction and stat recording via `python3` exited 0; post-correction `git diff --check` exited 0.


## Repair round r3 — mounted Nest read route (13 October 2026)

Issued by dispatcher 4 against local HEAD
`f87cbe17f3c2c98e00f925da17886063c4209a89`. Scope: the single blocking
controller-registration defect, its regression coverage, and regenerated OpenAPI.
No Git-writing command, install, package download, migration or policy change.

`AppModule.controllers` now includes the already imported
`JobWorkStateController`. The regression in `job-work-state.http.test.ts`
compiles the real `AppModule` with only its Pool provider replaced, initializes
Nest without a listener, observes registration of GET `/jobs/:id/work-state`,
and dispatches the registered Nest handler with a synthetic session. It checks
200, the read result, the `Cache-Control: no-store` header, and the GET operation
in the actual module's generated OpenAPI. The read application is scripted;
this proves module registration/dispatch, not PostgreSQL authorization.

The test first failed because Nest could not find `JobWorkStateController`.
After registration, two intermediate harness runs failed on incomplete Express
response doubles; the final double implements the adapter's response methods
and all assertions pass. The original two HTTP adapter tests remain unchanged.

OpenAPI was regenerated from the existing source generator. Besides the newly
mounted GET, generation includes five pre-existing CH-4 source-operation 422
response decorators. Swagger replaces the variation operation's implicit 201
documentation with its existing explicit 422 response metadata. No response
metadata or source-operation behavior was changed in this repair.

### Executed checks

Node `v24.17.0`; cached pinned pnpm `10.28.1`. The global pnpm version-selection
wrapper stalled and was interrupted; all checks below use the pre-existing
cached CLI shim, with this command prefix:

```sh
export PATH="/private/tmp/ch4-pnpm-bin:/Users/benharwood/Library/pnpm/bin:$PATH"
```

| Command | Exit/result |
| --- | --- |
| `pnpm typecheck --force --concurrency=2` | 0; 7 packages, no cached tasks |
| `LANE_BASE_REF=origin/main pnpm lint --force --concurrency=2` | 0; root invariants and all 7 packages, no cached tasks |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; CH-4 lane |
| `pnpm build --force --concurrency=2` | 0; 7 packages, no cached tasks |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/job-work-state.http.test.ts` | Initial missing-controller red: 1 failed, 2 passed; final registration/dispatch green: 3 passed |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/job-work-state.application.test.ts src/job-work-state.controller.test.ts src/job-work-state.http.test.ts src/job-work-state.isolation.test.ts` | 0; 4 files, 11 tests passed |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-work-state.test.ts` | 0; 11 tests passed |
| `pnpm --filter @jobguard/api openapi:generate` | 1; tsx CLI IPC `listen EPERM` |
| `pnpm openapi:check` | 1 on both attempts; tsx CLI IPC `listen EPERM`, including after regeneration |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts` | 0; same source generator, without CLI IPC; artifact regenerated |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; regenerated artifact matches the source generator |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage --filter @jobguard/web --workspace-concurrency=2 test --maxWorkers=2` | 1; core 4,492 passed, 6 failed (four allocation timeouts and two source-inspection assertions against compiled dist copies); config 2 passed, storage 4 passed; bail prevented AI/web |
| `pnpm --filter @jobguard/ai --filter @jobguard/web --workspace-concurrency=1 --no-bail test --maxWorkers=2` | 0; AI 80 passed, web 636 passed |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src --exclude "**/health.test.ts" --exclude "**/shadow-isolation.application.test.ts"` | 1; 63 files passed, 6 failed; 1,479 tests passed, 96 failed, 1 skipped; 73 errors. Includes replay mocks missing existing CH-4 membership queries, socket `EPERM`, and the remaining final-account isolation suite unable to obtain a PostgreSQL port |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src test/recovery-case-join.test.ts test/recovery-message-repository.test.ts test/recovery-case-outcome.test.ts test/contractor-session-context.test.ts test/verify-audit-export-cli.test.ts test/verify-evidence-pack-cli.test.ts` | 1; 145 passed, 1 audit-checkpoint source-graph test timed out at its existing 5-second limit |

Detailed command output is in `/private/tmp/ch4-r3-*.log`. Turbo reported
shared-cache IO permission warnings; the forced typecheck, lint and build still
completed successfully. The broader suites are not claimed green. No failing
assertion, timeout, source fixture or existing test was changed.

Tenant/session authorization and no-store remain the route's existing contracts;
there are no new credentials, external actions, operational alerts or database
changes. `pnpm test`, database/migration and browser umbrellas remain for GitHub
CI under the dispatcher's environment instruction. A clean install was not
attempted because dependencies are installed and downloads are prohibited.
AI evaluation is inapplicable to this registration-only change.

This is builder test evidence, not independent acceptance. Independent verdict
bound to the dispatcher's resulting commit, separate acceptance, CI evidence and
release gates remain outstanding. Intended commit message is overwritten at
`/private/tmp/jg-msg-ch-4.txt`; the dispatcher owns commit, push and merge.


## Repair round r4 — response preservation, evidence labels and replay regressions

Dispatcher 4, 13 October 2026. Starting/final local HEAD:
`58a6e5882080686cb492c3c78ed0258e897914f1`. Working tree was clean at entry.
Node v24.17.0; existing cached pnpm 10.28.1 shim. No install, download,
Git-writing command, push, migration, policy change or acceptance. Intended
commit message overwritten at `/private/tmp/jg-msg-ch-4.txt`.

**B1:** CH-4's own outside decoration explicitly adds
`ApiCreatedResponse({description:""})` for `VariationController.post` and
omits that method from CH-4's 422 documentation list. The merged variation
controller is unchanged. The runtime post-lock refusal remains unchanged;
422 documentation on the other four source operations remains. The source
generator regenerated `apps/api/openapi.json`. Structured comparison proves
the **entire** variation POST operation equals observed `origin/main`, so the
requested route diff is empty. This follows the dispatch message's explicit
empty-diff target. The attached Opus delta had asked for 201 plus 422, so an
optional clarification was sent; no reply arrived. The final resolution follows
the latest dispatch wording. The own Nest/OpenAPI regression checks the exact
restored 201 description.

**B2:** the contract now names `pre_cover_photo`, `completion_photo`,
`excavation_photo`, `electrical_certificate`, citing `proofEvidenceTypeSchema`
in `packages/core/src/proof.ts`. No migration or evidence policy changed.

**B3:** the earlier receipt's “replay mocks missing existing CH-4 membership
queries” described a real regression, not sandbox noise. In the unchanged
merged `apps/api/src/watchdog-registry.test.ts`, the two parameterized
purchase-order conflict cases at line 692 failed because the query double at
line 592 correctly refused CH-4's new `SELECT 1 FROM app.membership` query.
The original dispatcher already verifies active owner membership before calling
its lock hook (`packages/db/src/commands.ts:62`). Placement now retains that
original live guard and replay path without CH-4's extra precheck. Only a
`JOB_NOT_LIVE` refusal, after the original transaction rolls back, opens a new
stamped tenant transaction to recheck active membership and read the post-lock
offer. A fresh transaction is necessary because the PostgreSQL exception aborts
the original transaction. Original authorization, lock order, command identity,
stored receipts and new-source refusal remain in place.

A further 21 failures in that same merged suite were CH-4 adapter regressions:
Next error handlers asked the mocked workspace for `workState.failure` on
ordinary conflict/access errors. The existing response adapters for proof,
purchase-order revisions/placement, supplier intake and variations now invoke
that CH-4 mapping only for `JobWorkStateError`. Ordinary errors retain their
existing response path without an extra workspace service lookup. No merged
test was edited. Five own scripted boundary cases check conflict/not-found
query preservation, active/revoked membership before party disclosure, and the
unlocked not-live read. These are not PostgreSQL proofs.

### Executed checks

All pnpm commands used the existing prefix:
`export PATH="/private/tmp/ch4-pnpm-bin:/Users/benharwood/Library/pnpm/bin:$PATH"`.
Logs are `/private/tmp/jg-ch-4-*.log`.

| Command | Exit/result |
| --- | --- |
| `pnpm typecheck --force --concurrency=2` | 0; 7 executed tasks |
| `LANE_BASE_REF=origin/main pnpm lint --force --concurrency=2` | 0; root invariants and 7 executed tasks |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 |
| `pnpm build --force --concurrency=2` | 0; 7 executed tasks, 30 static pages |
| `pnpm --filter @jobguard/db build` | 0; compiled the changed replay implementation before API tests |
| `pnpm --filter @jobguard/api openapi:generate` | 1; tsx IPC `listen EPERM` |
| `pnpm openapi:check` | 1; same tsx IPC restriction |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts` | 0; same generator, without CLI IPC |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; exact source/artifact match |
| API `vitest run --maxWorkers=2 src` before repair | 1; 63 files passed, 8 failed; 1,479 passed, 97 failed, 23 skipped; 74 errors |
| API targeted `watchdog-registry`, own HTTP and own isolation tests | 0; 3 files, 131 passed |
| API `vitest run --maxWorkers=2 src --exclude "**/shadow-isolation.application.test.ts" --exclude "**/final-account-lock.isolation.test.ts"` after repair | 1; 64 files passed, 5 failed; 1,505 passed, 74 failed; 74 errors |
| API same run additionally excluding `health.test.ts`, `contractor-practice-session.http.test.ts`, `site-extra.http.test.ts`, `site-extra-pricing.http.test.ts`, `action-paths.test.ts` | 0; 64 files, 1,489 passed, zero failed |
| API `vitest run --maxWorkers=1 src/final-account-lock.isolation.test.ts -t "DW8 application read"` | 0; 2 scripted reads passed, 1 real-DB case excluded |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage --filter @jobguard/web --workspace-concurrency=1 --no-bail test --maxWorkers=2` | 1; core 4,496 passed/2 failed; config 2, storage 4, AI 80, web 636 all passed |
| core `vitest run --maxWorkers=2 src` | 0; 78 files, 2,249 passed |
| DB `vitest run --maxWorkers=2 src` | 1; 84 passed, 1 existing 5-second audit-checkpoint source-graph timeout |
| DB `vitest run --maxWorkers=1 src` retry after build | 0; 4 files, 85 passed, original timeout unchanged |
| `node --test --test-concurrency=2` for the seven non-Git-fixture tooling test files | 0; 19 passed |
| `git diff --check` and read-only preservation inspection | 0; no whitespace errors, no merged test changed, variation controller unchanged |

The 23 functional API failures are fixed. The remaining 74 API failures belong
only to `health.test.ts` (1), `contractor-practice-session.http.test.ts` (39),
`site-extra-pricing.http.test.ts` (16), `site-extra.http.test.ts` (16), and
`auth/sso/action-paths.test.ts` (2); their socket bind fails with EPERM.
The two DB-backed API files failed setup in the initial baseline; later runs
exclude them explicitly under the dispatcher's no-PostgreSQL environment rule.
Neither exclusion changes a repository script, assertion or CI requirement.

The broader core script collects both source and compiled dist tests. Its two
failures are `dist/recovery-allocation.test.js` and
`dist/site-extra-pricing.test.js` trying to read nonexistent `.ts` files in dist;
the unchanged source suite passes. These unrelated tests/configuration remain
unchanged. The two full root tooling attempts produced no result before being
interrupted (exit 1); the 19-test subset excludes the two Git-fixture suites.
The initial global pnpm version wrapper stalled and was interrupted (130);
all subsequent pnpm checks used the cached shim. No incomplete run is a pass.

PostgreSQL, migrations, full umbrella and browser suites remain GitHub CI work;
no real provider or live-model evaluation applies to this repair. Forced Turbo
checks reported shared-cache IO warnings; build also reported existing Next
root/lockfile, CSS, file-type export and dynamic-import warnings. Database
migration and grant bytes are unchanged. No new operational alert or production
capability. Independent exact-commit verdict and separate acceptance remain
outstanding. This receipt records builder execution only.


Final B1 target verification: entire variation POST dictionary equals
`origin/main`, with no ignored response or other field. After that final
metadata change, the same generator's `--check` exited 0; the targeted 131
tests passed again; `pnpm typecheck --concurrency=2` and
`LANE_BASE_REF=origin/main pnpm lint --concurrency=2` both exited 0 (7 successful
tasks, 2 cached, 5 executed); lane lint exited 0 again after receipt edits.
Read-only final scope inspection confirms 13 changed files, only the two own
CH-4 test files changed, no merged controller/test edit, and HEAD unchanged.
Final `pnpm build --concurrency=2` exited 0 after the final B1 metadata edit:
7 successful tasks, 2 cached, 5 executed, 30 static pages. Final
`git diff --check` exited 0. The commit-message file contains the conventional
subject and body, reflecting the final empty variation-route diff. No
Git-writing command was issued; dispatcher retains commit/push ownership.


## Catch-up r5 — 13 October 2026, dispatcher 4

Builder execution receipt, not an independent verdict or technical acceptance.
Started at local HEAD `9d13b01f7ce454cf553eed6d0a4e16d515f7ccab`, in the
already-started merge of `origin/main` at
`e4cb8437d044746300c377647f6061d06cd960cc`. The dispatcher's reported Opus PASS
belongs to the original HEAD, not this uncommitted merge resolution. Git's index
still lists six unmerged paths because this sandbox cannot write `.git`; the
dispatcher must stage the resolved working files and finish the merge.

### Resolution and authorized extra

All six working-file conflicts are resolved. Main content is retained exactly,
with CH-4 additions integrated afterward:

- `apps/api/src/app.module.ts`: main's SiteVisitController remains registered;
  CH-4's JobWorkStateController and global JobWorkStateExceptionFilter remain.
- `apps/api/src/workspace/application.ts`: main's startVisit, completeVisit,
  assignedJobs and orderLines services remain; CH-4's frozen workState reader
  and failure mapper are appended to the returned application.
- Both package export indexes retain main's exports, followed by CH-4 exports.
- Migration registration retains 0141 then 0144 in numeric order. The reserved
  0142/0143 gaps remain reserved for CH-7-INSURER and ENT-10e. No migration SQL
  bytes were edited. MIGRATIONS.md retains the exact main text then CH-4's 0144
  explanation.

The dispatcher expressly authorized a documented extra: variation POST OpenAPI
now includes an explicit 422 alongside its original 201. Only ApiResponse import
and decorators were added to the controller. A structured comparison of the
regenerated variation POST against origin/main proves that deleting the new 422
from the comparison yields the exact original operation, including the identical
201 dictionary, operationId, parameters, summary and tags. Other controller
metadata is unchanged. The CH-4 lane gains only that controller path and a note
recording this response-metadata authorization; all other lane registrations
remain identical to main. No broad lane permission was added.

OpenAPI includes every main operation and CH-4's work-state read. The existing
CH-4 422 responses on proof, purchase-order revision/placement and supplier
intake remain. Main's site-visit and evidence API content is retained.

Read-only preservation checks found both tenancy expectation lists still sorted
by relname, matching their ORDER BY c.relname queries, with main's closeout_answer
and all four CH-4 rows included. No tenancy test edit was needed. SHA-256 snapshots
of 414 test/spec and package/pin files taken before resolution remain unchanged.
No merged test, existing assertion, pin or fingerprint was edited.

### Commands actually run

Existing installed dependencies only. Successful pnpm invocations used:
`export PATH="/private/tmp/ch4-pnpm-bin:/Users/benharwood/Library/pnpm/bin:$PATH"`.
The existing shim invokes cached pnpm 10.28.1; Node is 24.17.0. The initial global
pnpm version wrapper stalled and was interrupted (130); no install or package
download was requested. Logs are `/private/tmp/jg-ch-4-r5-*.log`.

| Command | Exit/result |
| --- | --- |
| `pnpm exec turbo run typecheck --force` | 0; 7 successful, 0 cached; run once |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0; 7 successful, 0 cached; run once |
| `pnpm exec turbo run build --force` | 0; 7 successful, 0 cached; run once; 31 generated pages |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 1; purity passes, then lane script rejects incoming main's staged paths; remaining root checks were run separately |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 1; same lane rejection before Turbo can execute again |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; incoming main paths rejected while merge remains uncommitted |
| `node tools/money-arithmetic-lint.mjs` | 0 |
| `node tools/commercial-boundary-lint.mjs` | 0 |
| `pnpm --filter @jobguard/api openapi:generate` | 1; sandbox tsx IPC listen EPERM |
| `pnpm openapi:check` | 1; same tsx IPC restriction |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts` | 0 after package build; same generator without CLI IPC; two early attempts failed on stale core/DB exports while build was pending |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; exact regenerated artifact/source match |
| core `vitest run --maxWorkers=2 src` | 0; 81 files, 2,426 passed |
| API source suite, with explicit environment exclusions listed below | 0; 66 files, 1,556 passed |
| API `vitest run --maxWorkers=1 src/final-account-lock.isolation.test.ts -t 'DW8 application read'` | 0; 2 scripted reads passed; 1 real-DB case excluded |
| config/storage/AI/web sequential tests, `--maxWorkers=2` | 1 initially: config 2, storage 4 and AI 80 passed; web 684 passed/100 failed on stale compiled API exports while build was pending |
| `pnpm --filter @jobguard/web test --maxWorkers=2` after API build | 0; 33 files, 784 passed; stale-export failures resolved by the required build, no source/test change |
| DB `vitest run --maxWorkers=1 src test/site-extra-evidence-compatibility.test.ts` | 1 initially; 91 passed, 1 existing audit-checkpoint source-graph 5-second timeout during concurrent work |
| same DB command after concurrent suites/build finished | 0; 5 files, 92 passed; original timeout unchanged |
| seven tooling test files, `node --test --test-concurrency=2` | 0; 19 passed |
| `git grep -n '<<<<<<<\|>>>>>>>' -- . ':!docs/verdicts'` | 1 with no output: no conflict marker matches |
| `git diff --check` | 0 |

The exact API source command was:

```sh
pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src \
  --exclude '**/shadow-isolation.application.test.ts' \
  --exclude '**/final-account-lock.isolation.test.ts' \
  --exclude '**/health.test.ts' \
  --exclude '**/contractor-practice-session.http.test.ts' \
  --exclude '**/site-extra.http.test.ts' \
  --exclude '**/site-extra-pricing.http.test.ts' \
  --exclude '**/site-visit.http.test.ts' \
  --exclude '**/auth/sso/action-paths.test.ts'
```

Those files require PostgreSQL or a bound HTTP socket, both unavailable under the
dispatcher's environment note. The isolated scripted DW8 reads were still run.
The tooling run covered policy-gate-sites, dependency-audit, decision-check-purity,
decision-records, core-purity, shared-money-origin and commercial-boundary;
the two Git-fixture test suites were not run because they issue Git-writing
commands. No script or mandatory CI assertion was weakened or made optional.

The real lane-script result remains RED in this unfinished merge: its local mode
includes staged changes relative to HEAD, so incoming main files count as local
lane edits until the dispatcher completes the merge. The first run also identified
the variation controller before its narrow dispatcher-authorized allowance was
recorded. A separate read-only deterministic comparison of the final working tree
to origin/main found all changed paths within the CH-4 allowlist. This diagnostic
is not presented as a successful lane-script run. Rerun root lint and lint:lanes
on the dispatcher's finished merge commit.

Forced checks reported shared-cache IO warnings; Next build also emitted existing
root/lockfile, CSS, file-type export and dynamic-import warnings. No new operational
alert, grant, backfill, command authority, money policy or production capability.
Database, migration, HTTP socket, full umbrella and both browser project suites
remain GitHub CI work after the dispatcher pushes. G1 and held CH-4 scope remain
unchanged; CH-4 is still the partial synthetic slice, not complete/unblocked MON-1.
The new exact-commit independent verdict and separate acceptance remain pending.
No Git-writing command was issued by the builder. Intended commit message is
written to `/private/tmp/jg-msg-ch-4.txt`; dispatcher owns stage/commit/push.

## Repair r7 — CI 38477725695, starting head f93716d (13 October 2026)

Builder: Codex. Source-inspected and locally test-executed as specified below;
real PostgreSQL and browser execution NOT RUN. This is not an independent
verdict or technical acceptance. No Git-writing command, package download,
PostgreSQL start, localhost bind or merged-test edit was performed.

### Actual failures and repair

Read the dispatcher's complete filtered failed log at
`/Users/benharwood/.local/share/full-steam/jg-runs/ch-4-ci-failed-38477725695.log`.
It contains **no assertion row/hash/identity diff**. Both tests throw before
reaching their isolation comparison:

- Log lines 569–576: DW8 throws `record "new" has no field "status"` at
  `FinalAccountLockRepository.lock`. Migration 0144's shared admission trigger
  uses `TG_TABLE_NAME='final_account_lock_check' AND NEW.status<>'pending'`.
  Resolving the expression still accesses the field on `final_account_lock`,
  whose row type has no status column. Nested IF dispatch now resolves the field
  only for the check table. The existing skip for nonpending checks, closed-job
  refusal, tenant/session authority and locking remain intact.
- Log lines 580–595: Test Q throws `INVALID_WORK_SOURCE` during proof completion.
  Source inspection establishes that `ch4_receipt_integrity` runs under
  `jobguard_migration` and reads `stage_completion`. Its FORCE RLS policy admits
  only runtime (0015); unlike evidence and command receipts, no later migration
  admits its owner. Thus the real runtime insert is invisible to the definer's
  source check. Added `ch4_stage_source_read`: SELECT only for the migration owner,
  limited to the current tenant. No RLS/owner bypass, runtime grant, source hash,
  identity, processing clock or historical row was changed.

The merged fixtures seed the same evidence in both copies, then add only private
signal/evidence links to the many-signal copy. DW8 uses generic `photo` with zero
bytes and a pending upload; Test Q's held source is also generic `photo` with zero
bytes and a pending upload. Both are excluded from CH-4 photo capture by the
existing qualification checks. Private links have no CH-4 trigger. There is no
observed signal-derived public row difference in this supplied run; errors mask
any subsequent comparison. Exact repaired-head CI must establish the complete
isolation result. No shadow-table read or signal-dependent suppression was added
to product code. The two merged tests and all of their comparisons are unchanged
(`git diff --exit-code HEAD --` on those two paths returned 0).

### Added regression and upgrade proof

Added r7 coverage in own `job-work-state-sources.integration.test.ts`. A freshly
migrated, populated source fixture is cloned into two real databases; only one
gets 25 held signals and version-specific evidence links via `jobguard_shadow`.
Before and after identical non-owner runtime photo and stage writes, the test
compares complete canonical `row_to_json(t)::text` rows for all four CH-4 tables,
source audit rows and audit heads. Receipts/events start nonempty; the business
writes must add the expected two effects and change the snapshot. Every stored
column is compared. A disposable-database clock fixture controls processing time,
just as merged Test Q does; no timestamps, ids or hashes are removed. This is a
source-trigger integration fixture, not a newly authorized command or provider
test. Existing real EvidenceService/ProofCommandService coverage remains intact.

The own rule-9 proof now seeds and compares pre-existing stage-completion rows,
retains full named columns/types/PK identities/canonical bytes and all old
comparisons and controls, and additionally preserves all pre-existing policies.
It inspects the new owner SELECT policy and checks missing/wrong/correct tenant
visibility as the actual migration role. After own-step/later-twice preservation
checks, it issues a new lock through the real repository on the upgraded schema,
covering the missing-status defect. All added DB assertions are NOT RUN locally;
both test files pass strict TypeScript checking including their imports.

Migration 0144 is own/unmerged and edited in place as instructed. No backfill,
new dependency, money policy, provider, native change, UI flow, operational alert
or public API change. Existing runtime policies/grants and immutable history are
preserved. BEGIN/COMMIT keeps installation atomic; after release, fixes remain
additive forward migrations rather than deleting immutable source history.
Affected invariants: tenant isolation (§5.1), atomic source/audit effects (§5.4,
§5.7), version-specific evidence (§5.8), hidden-signal isolation (§5.14).

### Commands actually run and results

Used installed pnpm 10.28.1 via the existing shim, with
`export PATH="/private/tmp/ch4-pnpm-bin:/Users/benharwood/Library/pnpm/bin:$PATH"`.
Node is 24.17.0. Logs are `/private/tmp/jg-ch-4-r7-*.log`.

| Command | Actual result |
| --- | --- |
| `pnpm typecheck` | PASS; 7 successful, 2 cached |
| `LANE_BASE_REF=origin/main pnpm lint` | PASS; root rules and 7 package checks, 2 cached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS |
| `pnpm build` | PASS; 7 successful, 2 cached; 31 pages |
| `pnpm openapi:check` | BLOCKED: tsx CLI's IPC pipe listen EPERM |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS; same generator/artifact check through loader without CLI IPC |
| `pnpm exec tsc -p /private/tmp/jg-ch-4-r7-tests-tsconfig.json` | PASS on both added/extended integration files; repeated after final test edits |
| core `vitest run --maxWorkers=2 src` | 2,455 pass, one unchanged allocation test exceeds its existing 5-second timeout under concurrent checks |
| core `vitest run --maxWorkers=1 src/receipt-allocation.test.ts` after other checks finish | PASS; 34/34; unchanged timed-out assertion now passes |
| DB `vitest run --maxWorkers=1 src test/job-work-state-syntax.test.ts test/site-extra-evidence-compatibility.test.ts` | 101 pass, one unchanged audit-checkpoint source-graph test exceeds its existing 5-second timeout under concurrent checks |
| DB `vitest run --maxWorkers=1 src/audit-checkpoint-handoff.test.ts` | First rerun during build still times out (55 pass); idle rerun PASS, 56/56; no timeout/test edits |
| API source suite with environment exclusions below | PASS; 67 files, 1,567 tests |
| API `vitest run --maxWorkers=1 src/final-account-lock.isolation.test.ts -t 'DW8 application read'` | PASS; two scripted reads; real-DB case excluded |
| config / storage / AI tests | PASS; 2 / 4 / 80 tests |
| web `test --maxWorkers=2` | PASS; 33 files, 784 tests |
| seven tooling tests with `node --test --test-concurrency=2` | PASS; 19 tests |
| `git diff --check` | PASS |

Exact available API source command:

```sh
pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src \
  --exclude '**/shadow-isolation.application.test.ts' \
  --exclude '**/final-account-lock.isolation.test.ts' \
  --exclude '**/health.test.ts' \
  --exclude '**/contractor-practice-session.http.test.ts' \
  --exclude '**/site-extra.http.test.ts' \
  --exclude '**/site-extra-pricing.http.test.ts' \
  --exclude '**/site-visit.http.test.ts' \
  --exclude '**/auth/sso/action-paths.test.ts'
```

These exclusions require PostgreSQL or bound sockets. Scripts/CI discovery and
mandatory tests were not changed. Tooling ran commercial-boundary, core-purity,
decision-check-purity, decision-records, dependency-audit, policy-gate-sites and
shared-money-origin tests. The two Git-fixture tooling suites issue Git-writing
commands, so were not run under the dispatcher's prohibition. The umbrella
`pnpm test` was therefore not run; these are the actual available unit subsets.
Initial timeout results remain recorded; no green blanket suite is invented.
Build reported existing Next warnings and restricted Turbo-cache IO warnings.

### Dispatcher PostgreSQL/browser work — NOT RUN by builder

Focused commands (after installed builds, with permitted PostgreSQL/socket access):

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 \
  test/job-work-state-sources.integration.test.ts \
  test/job-work-state-upgrade.integration.test.ts \
  test/job-work-state.integration.test.ts \
  test/job-work-state-post-lock.integration.test.ts \
  test/job-work-state-races.integration.test.ts \
  test/job-work-state-catalog.integration.test.ts
pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 \
  src/final-account-lock.isolation.test.ts \
  src/shadow-isolation.application.test.ts
pnpm test
pnpm test:db
pnpm test:migrations
pnpm test:e2e
pnpm openapi:check
```

The two previously red merged tests, new r7 source-isolation case, updated
rule-9 proof and existing real proof commands remain explicit PostgreSQL gates.
No exact-commit independent cross-model verdict or separate acceptance is claimed.
G1, production disablement and held CH-4 scope remain unchanged. Dispatcher owns
commit/push; intended message is `/private/tmp/jg-msg-ch-4.txt` (overwritten).

## Repair r8 — CI 38494833390, head dc6b373 (14 October 2026, dispatcher 5)

Builder: Codex. Started clean on `codex/sandbox/ch-4` at
`dc6b37392de39ea434ca71bd1d4d2bde9ab95dd6` (r7 plus main, PR #185).
Read the entire supplied filtered log:
`/Users/benharwood/.local/share/full-steam/jg-runs/ch-4-ci-failed-38494833390.log`.
The ANSI/timestamp-stripped reading copy is `/private/tmp/ch4-r8-ci-clean.log`
(1,788 lines). The run reports **11 failing tests in seven DB files**, with
1,950 DB tests passing; the other package suites pass. The root `pnpm test` and
`@jobguard/db#test` failures are propagation of those eleven failures.
These are source-inspected repairs, with local execution limited below;
PostgreSQL/browser verification and exact-commit independent verdict/acceptance
remain pending. No Git-writing command or package installation was issued.

### Every failure in the supplied log, and its disposition

| # | Failing file and exact test | Observed failure and repair |
| --- | --- | --- |
| 1 | `audit-export.integration.test.ts`: leaves every existing table, policy, routine privilege and runtime role attribute unchanged on upgrade | `[MO5-e]` reports exactly `policy app.stage_completion.ch4_stage_source_read: permissive policy added`. **0144 is wrong.** Removed this policy from own unmerged migration in place. No edit to the merged test. |
| 2 | `job-work-state-post-lock.integration.test.ts`: CH4-A08 closed jobs refuse final-check admission (fixture close, new insert only) | PostgreSQL 42P08, `$2` text versus uuid at fixture line 62. **Own fixture setup is wrong.** Cast the command UUID before its text semantic-key representation; explicitly type UUID parameters in lifecycle INSERT SELECT. |
| 3 | `job-work-state-post-lock.integration.test.ts`: CH4-A08 CH4-A17 closed storage refuses the existing lock routine atomically | Same shared lifecycle fixture 42P08 before the refusal assertion. Same setup repair; closed-job refusal and atomic rollback checks unchanged. |
| 4 | `job-work-state-post-lock.integration.test.ts`: CH4-A13 CH4-A15 purchase-order-repository.ts#place: genuine pre-lock replay is unchanged and a new identity cannot use its allowance | Fresh post-lock ID resolved `{reused:false, placementId, outboxActionId}`. **Repository code is wrong.** Dispatcher semantic deduplication returns before mutate, bypassing the existing new-source refusal. Admission now distinguishes an already committed exact identity (including successful pre-lock no-ops), an original completed legacy receipt, and a fresh identity. Only the latter is refused before semantic reuse. Original hashes/authority/dispatcher conflict checks remain. |
| 5 | `job-work-state-races.integration.test.ts`: CH4-A06 source activity cancels an outstanding marker without editing it | Shared lifecycle fixture 42P08. Same fixture repair; cancellation/history expectations unchanged. |
| 6 | `job-work-state-sources.integration.test.ts`: r7 zero/25 evidence-linked held signals leave all four new tables and source audit byte-identical before and after runtime photo/stage writes | PostgreSQL 28P01 `empty password returned by client` at clone migration. **Own test pool setup is wrong.** `Pool.options.password` is non-enumerable; spreading options omits it. Copy it explicitly into each seed/clone admin/runtime pool. The zero/25 inputs and every-byte comparison stay intact. Also cast UUIDs before text use in its previously unreached source inserts. |
| 7 | `job-work-state-upgrade.integration.test.ts`: CH4-A24 own migration preserves original rows/types/PK identities/grants; later migrations twice; comparator controls | 42P08 `$2` text versus uuid at its proof receipt insert. **Own setup is wrong.** Explicit UUID-to-text cast; all original row/type/PK/grant and comparator controls retained. The r7 positive added-policy setup also conflicts with #1: it now runs solely as a rolled-back widening control, with its original policy-name/role/visibility expectations retained. Added exact comparison of all policies on older tables, including rejection of this control. |
| 8 | `job-work-state.integration.test.ts`: CH4-A06 finished and cancellation append immutable facts (fixture storage only) | Shared lifecycle fixture 42P08; same fixture repair, immutable predecessor assertions unchanged. |
| 9 | `job-work-state.integration.test.ts`: CH4-A07 CH4-A09 close requires reason and note and reopen preserves history (fixture storage only) | Shared lifecycle fixture 42P08; same fixture repair, history/note/audit assertions unchanged. |
| 10 | `job-work-state.integration.test.ts`: CH4-A18 CH4-A19 exact common party bindings create only an immutable link (fixture, admission held) | Its link command receipt has the same 42P08 UUID/text ambiguity. **Own setup is wrong.** Explicit UUID-to-text cast; common-party and no-money/no-activation expectations unchanged. |
| 11 | `watchdog-lock-order.integration.test.ts`: evidence.ts#finalize | Audit count increased but observer saw no audit-head lock. **Own added audit timing is wrong.** CH-4 deferred source audit ran during COMMIT, after the observer's last open-transaction snapshot. Finalize now drains deferred constraints after storing its command result and running its completion callback, before returning from the transaction. All business work precedes that audit drain; no test/observer edit. |

### Stage integrity without an older permission widening

Keep the tenant/job/id stage key and add a tenant/job/id/completed-at/evidence-link
unique key. The new receipt stores `stage_evidence_link_id` and references the
full source key, with non-null/type-shape checks and a source/link hash check.
PostgreSQL referential integrity checks the exact source row/time/link even when
FORCE RLS hides that row from the migration owner. This replaces the failing
owner SELECT validation without granting any new source read permission. The
original stage/source hash derivation, source identity and microsecond time are
unchanged. No older row, type, primary identity, policy or ACL is rewritten.

Added adversarial own coverage: stage receipts reject a one-microsecond forged
source time, another link with its matching derived hash, and an incorrect hash;
the actual migration role still sees no stage rows. Existing real proof-source
commands and zero/25 clone comparisons remain required. Added an actual existing
PO repository case proving a successful pre-lock semantic no-op retains its own
replay identity after lock, while changed requests and fresh IDs are refused.
These added PostgreSQL tests are NOT RUN in this sandbox.

The own upgrade test's r7 widening-policy assertions are retained inside an
explicit transaction rolled back after proving the strengthened policy comparator
rejects the widening. On the migrated schema itself, the older tables' complete
policy sets must equal their pre-0144 sets, and the owner cannot read stage rows,
even with the correct tenant. The original missing/wrong/correct-tenant policy
control expectations are unchanged and distinguish the forbidden widening from
the actual unchanged permissions. This control creates no production policy.

Both protected files remain byte-for-byte identical to entry and HEAD:

- `apps/api/src/shadow-isolation.application.test.ts`:
  `8d4f2abc7b502489ac49e56e60224623d90ff901aa41892ed40ff2bf69967006`.
- `apps/api/src/auth/context-boundary.test.ts`:
  `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`.

No existing expected value, refusal, count, pinned name, fingerprint or hash was
changed. No merged test was edited. Q-01/Q-03/Q-04/Q-05/Q-06 stay unbuilt. No new
command, permission, route, money policy, interval calculation, backfill, provider,
native feature, production enablement or operational alert. Affected invariants:
§§5.1, 5.3, 5.4, 5.7, 5.8 and 5.14. Contract and migration notes describe the final
implementation. 0144 remains atomic BEGIN/COMMIT; after merge/release use a reviewed
additive forward fix, preserving immutable history. This repair edits only own
unmerged 0144, as instructed. No backwards-incompatible public API change.

### Commands actually run

Node 24.17.0, existing installed pnpm 10.28.1 via
`PATH=/private/tmp/ch4-pnpm-bin:/Users/benharwood/Library/pnpm/bin:$PATH`.
Logs: `/private/tmp/jg-ch-4-r8-*.log`. No package download or install attempted.

| Command | Actual result |
| --- | --- |
| `pnpm typecheck` | PASS twice, including final source; 7 successful / 2 cached each run |
| `LANE_BASE_REF=origin/main pnpm lint` | PASS twice, including final source; root checks and 7 package tasks / 2 cached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS twice, including final changed paths |
| `pnpm build` | PASS twice; final source build: 7 successful / 2 cached, 31 pages |
| `pnpm openapi:check` | BLOCKED / exit 1: tsx CLI IPC `listen EPERM` before checker execution |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS twice, including final built dependencies; same checker/artifact, no CLI IPC |
| core `vitest run --maxWorkers=1 src` | PASS: 82 files, 2,456 tests |
| DB `vitest run --maxWorkers=1 src test/job-work-state-syntax.test.ts test/site-extra-evidence-compatibility.test.ts` | PASS: 7 files, 104 tests; includes the unchanged 13-body migration syntax assertion; no PostgreSQL claim |
| API source command below | Initial exit 1: 1,570 pass / one scripted PO receipt-query failure; after final source and dependency rebuild, PASS: 68 files, 1,571 tests |
| API `vitest run --maxWorkers=1 src/watchdog-registry.test.ts` | Two intermediate reruns: 120 pass / one failure each, loading stale DB dist; final complete API rerun above passes all 121 unchanged registry tests |
| API `vitest run --maxWorkers=1 src/final-account-lock.isolation.test.ts -t 'DW8 application read'` | PASS: two scripted reads; one real-DB test excluded |
| config / storage / AI `test --maxWorkers=1` | PASS: 2 / 4 / 80 tests; AI runs synthetic fixtures only |
| web `test --maxWorkers=2` | PASS twice, final built dependencies included: 33 files / 784 tests |
| seven tooling files, `node --test --test-concurrency=2` | PASS: 19 tests |
| `pnpm exec tsc -p /private/tmp/jg-ch-4-r8-tests-tsconfig.json` (all CH-4 tests) | Exit 2: imported, unchanged `watchdog-command-harness.ts:164` passes `string \| undefined` to a string argument. No merged harness edit. Root typecheck does not include DB integration tests. |
| `pnpm exec tsc -p /private/tmp/jg-ch-4-r8-changed-tests-tsconfig.json` (fixture, sources, upgrade, main storage tests and their imports) | PASS: strict checking; excludes the post-lock/race imports of that existing harness |
| `git diff --check`, protected-file SHA-256 + `git diff --exit-code HEAD --` preservation checks | PASS |
| TypeScript AST inspection of every edited test against HEAD | PASS: every original matcher and expected argument remains present with at least its original multiplicity; added assertions only |

The initial PO query returned only a `1` marker, which the existing scripted
replay adapter does not implement. The final code uses the established full
receipt read (`request_hash,status,result`) for legacy receipts. A prior committed
identity also preserves pre-lock successful semantic no-ops, whose dispatcher
receipt belongs to the first command. The dispatcher still validates payload
hash/status before returning a cached result. The two intermediate targeted API
reruns used the still-unrebuilt DB dist containing that initial marker query
(confirmed by inspecting the emitted file), so both retained the same refusal
failure. A full dependency rebuild followed by the complete available API suite
passes unchanged; no mock expectation, refusal or source test was adjusted.

The all-tests ad hoc typecheck is honestly recorded as failed on the existing
imported harness, rather than loosening its type settings or changing that file.
The directly changed source/upgrade/storage tests pass strict checking; real DB
execution of these and the added post-lock no-op test remains CI work. Existing
Next root/lockfile, CSS, file-type export/dynamic-import and restricted Turbo
cache warnings remain in build logs. No timeout was raised or test disabled.

Available API source command (CI discovery and scripts are unchanged):

```sh
pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src \
  --exclude '**/shadow-isolation.application.test.ts' \
  --exclude '**/final-account-lock.isolation.test.ts' \
  --exclude '**/health.test.ts' \
  --exclude '**/contractor-practice-session.http.test.ts' \
  --exclude '**/site-extra.http.test.ts' \
  --exclude '**/site-extra-pricing.http.test.ts' \
  --exclude '**/site-visit.http.test.ts' \
  --exclude '**/auth/sso/action-paths.test.ts'
```

Excluded cases need PostgreSQL or bound sockets, unavailable by the dispatcher's
environment note. Seven tooling test files ran: policy-gate-sites, dependency-audit,
decision-check-purity, decision-records, core-purity, shared-money-origin and
commercial-boundary. The other two tooling suites issue Git-writing commands;
therefore they and the umbrella `pnpm test` were not run. No optional-CI change.

Dispatcher must run focused CH-4 PostgreSQL suites plus
`audit-export.integration.test.ts`, `watchdog-lock-order.integration.test.ts`,
`command-replay-contract.integration.test.ts`, the two protected API tests and
`final-account-lock.isolation.test.ts`; then full `pnpm test`, `pnpm test:db`,
`pnpm test:migrations`, both browser projects via `pnpm test:e2e`, and standard
`pnpm openapi:check` after pushing. The earlier supplied run's passing protected
and Final Check isolation suites are evidence for dc6b373 only, not this repair.
G1/production gates, the exact-repair-commit independent cross-model verdict and
separate acceptance remain outstanding. Dispatcher owns stage/commit/push.
Intended conventional commit message is `/private/tmp/jg-msg-ch-4.txt` (overwritten).
