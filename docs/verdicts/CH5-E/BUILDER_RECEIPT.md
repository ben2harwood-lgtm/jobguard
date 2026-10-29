## Ben-authorized CI round 4 and reserved renumber — 29 October 2026

CH-5 / CH5-E, PR #386, RED. Round 4 is explicitly authorized in the supplied
29 October brief. Failure trace: `~/.local/share/full-steam/codex-runs/ch5-e-ci-traces-0604.txt`.
Starting HEAD 3fbede8f96d886402b1fbf121706d63d5c338293, incoming main
fe80add539fc9f97028b90420918d16759f636ee. This is builder verification,
not a new independent RED review.

Failures repaired:

- Desktop and mobile CH-5 reached the final live-import refusal assertion, where
  the global alert locator also selected Next.js's route announcer. Scope the
  locator to the existing main landmark. Keep the exact expected refusal text,
  all preceding import/reload/isolation/forged-lock assertions and all timeouts.
  No UI behavior or browser assertion is relaxed.
- CH-2 discovered two unclassified Next mutations, the corresponding Nest routes
  and the new dispatcher command. Add all five exact keys to jobMutationRegistry
  as pre_live_allowed, matching ordinary adoption's existing classification.
  No scanner, guard, exception or allowlist in the tests is changed.
- M0-6L correctly refused context wrappers in the internal provenance repository.
  Its two methods now accept the existing ImportedBaselineReadScope whole and
  forward that exact scope to the held observation reader. The context stamp,
  session digest, authority checks and dependency refusals are preserved. Caller
  tests use the same internal scope and additionally verify scope object identity.
  Public import application methods already use PracticeAccess.job, the existing
  reviewed persisted-session bridge; they continue to do so. No context minting,
  principal bridge, source fingerprint or constructor allowance was changed.

Resolved eight working-file merge conflicts, retaining incoming business-value
composition/providers, small-builder demo and evidence-pack exports, CH-5 import
composition, and both sides' catalogue additions. Generated OpenAPI preserves
every main path and both import paths exactly. LP-0 entries are the exact parent
union; routine identities are unioned with current main's newer definitions and
group metadata preserved. Group source/test lists retain both sides. SERIOUS-B5
keeps the complete invoiced-import and stored-receipt additions, and both calls;
entitlement/tenancy retain main's rows plus only the existing job_import_v3 rows.

Renumbered 0323 -> 0349 and 0324 -> 0350 in the same order. Used the actual
exported planRenumber from tools/migration-renumber.mjs with the brief's reserved
ceiling 0348, then its filesystem move/stem-rewrite behavior through
/tmp/ch5-e-round4-renumber.mjs. The tool's ordinary --write requires a clean tree
and runs git add, incompatible with this pending merge and read-only .git; the
adapter runs only read-only Git and leaves staging to the router. It passed a
syntax check before execution. SQL files were moved, not edited. Both new SQL
files equal the original HEAD bytes exactly; every migration in the before
inventory has the identical SHA-256 afterward. Migration notes, full-stem
references, active test labels, LP-0 sources and lane paths follow the new numbers.
The 0349 upgrade test asserts exact predecessor 0337_enterprise_fee_posting_tidy.sql.
Actual MIGRATION_URLS confirms 0337 -> 0349 -> 0350. No PL/pgSQL IF/CASE edits
were needed; no SQL logic, privilege or stored format changed.

Actual relevant local checks (Node v24.17.0; installed pnpm 10.28.1 via cached
pnpm.cjs; at most two workers):

- API Vitest src/auth/context-boundary.test.ts and src/watchdog-registry.test.ts,
  --maxWorkers=1: 270 passed, including all three previously failing assertions.
- DB Vitest test/imported-observation-reader.integration.test.ts,
  test/imported-evidence-provenance.integration.test.ts and
  test/job-import-v3.integration.test.ts, --maxWorkers=1 -t source-only:
  25 passed; 5 PostgreSQL cases deselected locally, unchanged and mandatory in CI.
  The initial run caught two old-signature read calls in the test; both were
  updated to forward the existing scope and the same assertions pass on rerun.
- DB Vitest test/lp-0-catalog.test.ts and
  test/audit-export-privilege-comparator.test.ts, --maxWorkers=1: 45 passed.
- API Vitest src/job-import-v3.application.test.ts and
  src/value/value-composition.test.ts, --maxWorkers=1: 3 passed.
  Total final scoped Vitest results: 343 passed.
- Core build and DB build: passed. API tsc --noEmit: passed.
- tsc with /tmp/ch5-e-round4-tests-tsconfig.json: passed; compiles both renumbered
  upgrade suites, merged SERIOUS-B5/entitlement suites and modified provenance
  caller suites. Compilation log: /tmp/ch5-e-round4-test-compilation.log.
- OpenAPI generation and generated-contract check: passed.
- Playwright --list e2e/CH-5.spec.ts: both desktop and mobile-360 collected;
  collection only, not browser execution.
- Node test MC-6 migration order: passed (1 test); only this pure test selected,
  no Git-writing fixture tests run.
- Actual migrationOrderViolations against incoming main: no violations;
  composed lane-policy load passed. Direct worktree/main inventory is exactly
  53 allowed payload paths plus the own lane file, including untracked renames.
- Exact parent/main catalogue union, SQL hashes, generated OpenAPI union,
  conflict-marker scan and git diff --check: passed.

The prior temporary pnpm wrapper had expired; no package install/download was
attempted. No Git writes, local database startup, listener, real data, live money,
provider or release actions. No tests skipped in source, weakened or loosened.
Router must stage the eight resolved index entries, new migration/note names and
other changes, complete this pending merge, and rerun the normal lane check and
GitHub CI. Stock ancestry-based lane comparison cannot establish the final merge
until the router records it; exact filesystem payload/lane inventory is verified.
PostgreSQL/migrations and actual desktop/mobile browser execution remain CI gates.
Ready commit message: /tmp/ch5-e-20261029T060451Z-commit-msg.txt.

## CI repair try 3 (last) — 28 October 2026, 23:30 UTC run

CH-5 / CH5-E, PR #386, RED. Trace source:
`~/.local/share/full-steam/codex-runs/ch5-e-ci-traces-2330.txt`.
Started clean at e66cf8778f756948e6cbe45c099c8df590f0dba8, with main
199f9f54542ed44139c175836e8796bd03dfad1d already merged; no pending
conflicts. Shared LP-0, SERIOUS-B5, entitlement and tenancy expectations remain
byte-identical to that merged HEAD, retaining both sides' rows and assertions.

Failures and repairs:

1. PostgreSQL positive invoiced import failed in mutation.lock with permission
   denied for app.job. Runtime intentionally lacks UPDATE permission required
   for SELECT FOR UPDATE. Use the existing transaction advisory-lock pattern,
   scoped to tenant and import source job, before command receipt/audit locks.
   Keep all authentication/snapshot checks and the definer SQL writer's row lock.
   No grants or exception lists changed. The existing duplicate/replay and
   permission/isolation PostgreSQL test remains unchanged and mandatory in CI.
2. Desktop and mobile CH-5 browser journeys never found the Imported job receipt.
   Both invoke that same invoiced adoption path; repair its permission failure
   above. No UI, browser assertions or timeouts were changed. Browser verification
   must run in CI; these traces alone do not prove the repaired journeys pass.
3. The 0323 upgrade test named 0301 as its predecessor although merged SV-7A
   introduced 0303. Assert the exact current predecessor basename
   0303_job_source_intake.sql. All row/type/security assertions and successor
   migrations remain enforced; no broader regex or relaxed assertion added.
4. Clean DB typecheck failed TS2307 on three relative core/dist imports, with a
   cascading any-to-never error. Use @jobguard/core's existing source-types /
   built-runtime package contract. Job import symbols were already exported;
   add only the two existing baseline refusal symbols needed by its internal
   DB reader. No successful projection, new DTO or provider behavior added.

Strengthened the existing source-only invoiced mutation/replay regression to
execute lock before mutate, emulate the runtime row-lock permission boundary,
assert scoped advisory-lock arguments/order, and deny revoked sessions before
locking. Restoring the original row-lock line temporarily makes this regression
fail with the original permission error (mutation exit 1); source restored in
finally. Log: /tmp/ch5-e-try3-lock-mutation.log. This scripted check is not
PostgreSQL concurrency or privilege proof.

Checks actually run with installed pnpm 10.28.1, at most two workers:

- DB Vitest test/job-import-v3.integration.test.ts, --maxWorkers=1, name filter
  'source-only application boundary': 12 passed; 3 PostgreSQL cases deselected.
- DB Vitest test/imported-baseline-sources.integration.test.ts, --maxWorkers=1,
  name filter 'scripted': 9 passed; 2 PostgreSQL cases deselected.
- Core Vitest src/job-import-v3.test.ts and src/imported-baseline-sources.test.ts,
  --maxWorkers=1: 20 passed.
- API Vitest src/job-import-v3.application.test.ts,
  src/imported-shadow-source-adapter.test.ts and src/job-source.controller.test.ts,
  --maxWorkers=1: 12 passed. Total focused local passes: 53.
- DB tsc -p tsconfig.json --noEmit: passed.
- Core build (tsc): passed.
- API tsc -p tsconfig.json --noEmit: passed.
- DB source and both modified test suites compile via existing repository tsc
  with /tmp/ch5-e-try3-typecheck.json: passed. Compiler file inventory confirms
  core/src/job-import-v3.ts and core/src/imported-baseline-sources.ts resolve
  from source declarations, not generated dist declarations. Log:
  /tmp/ch5-e-try3-typecheck.log.
- LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs: passed.
- Exact shared-list/main LP-0 union, 52-path lane payload plus own lane,
  migration predecessor, conflict-marker and git diff --check checks: passed.

All 137 migration SQL files match starting HEAD byte-for-byte, including
0323/0324; no SQL bug was implicated. No CASE inside a PL/pgSQL IF condition
occurs in those two migrations, so no SQL edit is needed. No test weakened,
skipped in source or exception widened. No Git writes, dependency downloads,
PostgreSQL startup, listener, real data, provider, money or release actions.

Router owns commit/push and the final CI run. PostgreSQL/migration and desktop /
mobile CH-5 browser suites are unexecuted here and remain required CI gates.
This is a RED repair and builder verification, not an independent review.
Ready commit message: /tmp/ch5-e-20261028T233042Z-commit-msg.txt.

## SV-7A intake catch-up — 28 October 2026, 22:49 UTC run

CH-5 / CH5-E, PR #386, RED. Catch-up only; no new behavior.
HEAD: e47c694f3ce1c0324dd62bb29ac764deba90c33a.
MERGE_HEAD / origin/main: d461c00839d5b431e442706f8a03ec1c5b713bd5
(SV-7A intake, PR #354). Existing RED-pass is reported by the task brief;
these checks are builder verification, not a new independent review.

Resolved both working-file conflict blocks: workspace composition retains the
CH-5 imports application and main's SV-7A intake method; SERIOUS-B5 applies both
invoicedImportAdditions and sourceIntakeAdditions, preserving their complete
existing assertions and the 0323 routine assertions. LP-0 already merged cleanly:
verified exact entries and recorded routines from both parents, with group lists
unioned. Entitlement and tenancy remain byte-identical to HEAD and differ from
main only by the existing job_import_v3 expectations. No SQL edits: all 136
existing migration SQL files match HEAD byte-for-byte (including 0323/0324),
and incoming 0303 matches main exactly. Lane allowlist remains exactly the 52
PR payload paths relative to main; its own lane file is implicitly allowed.
Updated the existing lane note without widening its allowlist. No substantial
new complexity or worthwhile simplification within this conflict-only catch-up.

Local checks actually run with installed pnpm 10.28.1, Node v24.17.0:

- `/private/tmp/jg-ch5-p-bin/pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp-0-catalog.test.ts test/audit-export-privilege-comparator.test.ts`: 44 passed.
- `/private/tmp/jg-ch5-p-bin/pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/job-import-v3.application.test.ts src/imported-shadow-source-adapter.test.ts src/job-source.controller.test.ts`: 12 passed.
- `/private/tmp/jg-ch5-p-bin/pnpm --filter @jobguard/api exec tsc -p tsconfig.json --noEmit`: passed.
- `/private/tmp/jg-ch5-p-bin/pnpm --filter @jobguard/db exec tsc -p /tmp/ch5-e-r2-test-typecheck.json --noEmit`: passed (existing config targets SERIOUS-B5 upgrade suite; compilation only).
- From apps/api, `node --import tsx src/generate-openapi.ts --check`: passed.
- Read-only parent inventory comparisons, exact lane inventory, SQL byte checks,
  conflict-marker scan and `git diff --check`: passed.
- Initial PATH `pnpm --version` emitted a configuration warning and stalled;
  interrupted it, then used the installed pinned wrapper for all checks above.

At most two test/check workers ran at once. No package downloads, Git writes,
PostgreSQL startup, listeners, real data, providers, money or release actions.
Router must stage the two resolved files and lane/receipt updates and finish the
pending merge; read-only .git leaves the two index entries marked unmerged here.
Rerun the normal lane check after recording the merge. Database, migration,
browser and full required suites remain GitHub CI gates after router push.
Commit message: /tmp/ch5-e-20261028T224959Z-commit-msg.txt.

## Pending main merge conflict resolution — 28 October 2026, 22:21 UTC run

CH-5 / CH5-E, PR #386, RED; catch-up only, no new behavior.
HEAD is f35be1f8cf90df43cfe937ef80cda950b1566edf; MERGE_HEAD and
origin/main are 6329be99619e3795da6d2e07d832296269748ee1 (M4-9-S #380).
Resolved all four conflicted working files, keeping both pieces' controller
registration, application composition, OpenAPI endpoints and LP-0 entries.
Each resolved file equals its existing HEAD content: the preceding catch-up had
already prepared the combined content before this actual Git merge was begun.

Verified every incoming-main LP-0 entry and recorded privilege fact remains
exactly present. Group source/test lists retain main entries plus CH-5 entries.
SERIOUS-B5 retains main's exact two M4-9-S routine identities and adds only
CH-5's existing 0323/0324 expectations; entitlement and tenancy differences from
main are only the existing job_import_v3 expectations. Both migration filenames
and bytes match HEAD exactly; no SQL was edited. The lane lists exactly the 52
PR payload paths against origin/main, with its own lane file implicitly allowed.
No worthwhile simplification applies to this conflict-only catch-up.

Actual local checks (installed tools, no package downloads):

- Pinned pnpm 10.28.1 DB Vitest, maxWorkers=2: lp-0-catalog.test.ts and
  audit-export-privilege-comparator.test.ts: 44 passed.
- Pinned pnpm API Vitest, maxWorkers=2: job-import-v3.application.test.ts,
  imported-shadow-source-adapter.test.ts, success-fee.application.test.ts:
  19 passed.
- Installed tsc: apps/api/tsconfig.json --noEmit and existing
  /tmp/ch5-e-r2-test-typecheck.json --noEmit: passed.
- From apps/api, node --import tsx src/generate-openapi.ts --check: passed.
- Exact main inventory/lane comparisons, SQL byte comparison and conflict-marker
  scan: passed. git diff --check: passed.
- Stock LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs:
  failed while merge is pending because its committed ancestry still counts
  incoming M4-9-S files as CH-5 changes. No lane widening; the direct comparison
  against origin/main matches the lane exactly. Router must rerun after recording
  this merge.
- The initial PATH pnpm command emitted an incompatible-version warning and was
  interrupted before tests started; the successful suites used the existing
  pinned /private/tmp/jg-ch5-p-bin/pnpm instead.

Router handoff: stage the four resolved files and lane/receipt updates, finish
this existing merge, then rerun the stock lane check and GitHub CI. Git still
reports four unmerged index entries because .git is read-only here; all working
file conflict markers are resolved. Database and browser execution remain for
GitHub CI. Existing RED-pass is reported by the brief, not a new builder review.
No Git writes, PostgreSQL startup, listener, real data, provider or money action.

## Catch-up to M4-9-S / PR #380 — 28 October 2026

CH-5 / CH5-E, PR #386, RED. Catch-up only; no new product behavior.
The supplied brief reports the existing head RED-passed; this entry is builder
verification, not a new independent review.

Observed HEAD d058cef4 had merged main only through 9a298d4d, whereas
origin/main was already 6329be99 (PR #380). No unresolved Git entries existed.
Integrated the exact incoming main content using read-only Git reads and
stdout-only three-way comparisons; kept both controller/application exports,
OpenAPI paths, LP-0 privilege entries and recorded routines. Restored main's
exact M4-9-S read/write routine identities in SERIOUS-B5. Entitlement and tenancy
expectations already retained main plus the CH-5 import aggregate. Preserved
the pre-existing uncommitted policy-role assertion repair and receipt.

Migrations 0323 and 0324, including filenames and SQL bytes, match HEAD exactly.
Every non-overlapping incoming-main file matches origin/main byte for byte.
The existing config/lanes/ch5-e.json lists exactly the 52 CH-5 payload paths
against 6329be99; its own lane file is implicitly allowed. Updated its note;
no additional lane grants. No worthwhile simplification within this catch-up.

Checks actually run with installed tools (no package downloads):

- DB Vitest: test/lp-0-catalog.test.ts and
  test/audit-export-privilege-comparator.test.ts, --maxWorkers=2: 44 passed.
- API Vitest: src/job-import-v3.application.test.ts,
  src/imported-shadow-source-adapter.test.ts and
  src/success-fee.application.test.ts, --maxWorkers=2: 19 passed.
- node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit: passed.
- node_modules/.bin/tsc -p /tmp/ch5-e-r2-test-typecheck.json --noEmit: passed.
- Installed tsc builds of packages/core and packages/db: passed.
- From apps/api, node --import tsx src/generate-openapi.ts --check: passed.
  The tsx CLI could not bind its IPC pipe; direct Node import avoided that.
- Exact working-tree comparison with origin/main: lane paths match, all main
  LP-0 entries/recorded routines retained, migrations unchanged; passed.
- git diff --check and changed-file conflict-marker scan: passed.

Router action before committing/pushing: record the actual merge of
origin/main 6329be99 into this branch. This sandbox cannot write .git, so only
the resolved file content is prepared here. The stock lane command currently
fails because Git ancestry still treats incoming M4-9-S files as CH-5 edits;
do not widen the CH-5 lane to hide that. After recording the merge, rerun the
stock lane command. PostgreSQL and browser suites remain for GitHub CI.
No Git writes, PostgreSQL startup, browser binding, providers, customer data,
live money or release action occurred.

## Repair round 2 for PR #386 — 28 October 2026

RED; source/test-expectation repair only. Current main was already merged and
there were no conflict markers or unmerged entries when this round began.

Diagnosed SERIOUS-B5's policy assertion: pg_policies.roles has PostgreSQL type
name[]. The installed pg driver exposes that type as a string rather than a
JavaScript array. Reused this test file's existing SELECT $1::name[]::text[] cast
and compared the sorted exact pair jobguard_migration/jobguard_runtime. Added
explicit PERMISSIVE, USING and WITH CHECK assertions for precisely the policy
installed by 0324. No SQL, permissions, routine body or grants changed. No test
was weakened or disabled.

Checks actually run:

- Installed pg driver parser assertion: reproduced name[] as a string, verified
  text[] as the exact two-role array, and verified an extra shadow role remains
  detectable. This is a local driver check, not PostgreSQL verification.
- TypeScript check of serious-b5-upgrade.integration.test.ts and its imports via
  /tmp/ch5-e-r2-test-typecheck.json: passed.
- node tools/agent-lane-boundary-lint.mjs --lane=ch5-e: passed against current
  origin/main. The existing lane already covers this branch's exact payload;
  no lane-register or directory-wide grant was added.
- git diff --check: passed.

Remaining hold: the supplied summary still omits the positive-import test's
actual error and both browser assertions/stacks. GitHub CLI cannot connect to
the API. Read-only Chrome inspection reached CI run 40770431788 at a5d4cc0,
confirming the failed jobs; GitHub requires sign-in to view their logs. No
credentials were entered. Requested the first browser assertion/trace and the
positive-import error. Those causes remain undiagnosed, so no speculative
production or journey changes and no claim that the round is ready. Real
PostgreSQL/browser suites require CI; no such local suites were run. No Git
write, push, live provider, customer-data or release action was performed.

## Repair round 1 for PR #386 — 28 October 2026

RED; synthetic data only. This entry supersedes the earlier renumber-only state.
No Git index writes, commit, push, PostgreSQL start, provider or release action.

Cause and changes:

- 0324's replacement baseline constraint rejected capped imported v3 rows that
  0109 already accepted, breaking the recovery terms/timing fixtures and upgrade
  compatibility. Restored that predecessor branch, while keeping the new
  cap-free v3 import restricted to invoiced jobs. The checked writer body and
  its grants are unchanged. Added a populated historical capped-v3 upgrade
  regression and a cap-free-live refusal assertion; these require PostgreSQL CI.
- The shared legacy PostgreSQL fixture hook pre-bound parties for an invoiced
  import before the actual writer bound its supplied parties. Narrowed the hook
  to leave the controlled invoiced-import path to the real writer. Existing
  positive/replay/isolation assertions remain intact; no product grant changed.
- Entitlement-upgrade's exact successor row list omitted app.job_import_v3.
  Added that one table only. SERIOUS-B5's existing exact CH-5 additions and the
  incoming main expectations are retained.
- LP0-17's recorded routine identity list omitted adopt_invoiced_job_v3. Added
  its source-derived protection record, new-table RLS/policy/trigger records,
  and source/test references in the existing authority group. No bulk refresh
  or extra grants. Both sides' inventory entries remain present.
- Resolved the core barrel conflict by keeping both job-import-v3 and
  meter-today exports. Updated 0323's upgrade predecessor to main's 0301.
- Archived the inherited CH5-B/P lane JSON files, preserving their bytes, into
  docs/archive/lanes. The sole active CH5-E lane lists exactly the real payload
  against MERGE_HEAD, excluding lane metadata (its own file is implicit).
- The optional changed-test typecheck found the existing insertPhoto default
  indexed a possibly undefined enum option. Named the same pre_cover_photo
  enum member explicitly, preserving the fixture's default behavior.

Local validation actually executed:

- Core TypeScript build, DB/API/web TypeScript checks: passed.
- Changed PostgreSQL test TypeScript check via
  `tsc -p /tmp/ch5-e-test-typecheck.json --noEmit`: passed after fixing the
  existing fixture default type error.
- API Vitest, maxWorkers=1: job-import-v3.application.test.ts and
  imported-shadow-source-adapter.test.ts: 8 tests passed.
- Core Vitest, maxWorkers=1: job-import-v3.test.ts and
  imported-baseline-sources.test.ts: 20 tests passed.
- Web route Vitest, maxWorkers=1: import-v3/route.test.ts: 3 tests passed.
- DB scripted-transport describe selected by name, maxWorkers=1:
  job-import-v3.integration.test.ts: 12 source-only tests passed. The 3
  PostgreSQL tests were excluded from this local selection, remain unchanged
  and mandatory in CI.
- migrate-discovery.test.ts: 3 tests passed. An initial run also selected the
  PostgreSQL describe in job-import-v3.integration.test.ts; its setup failed
  at freePort because localhost binding is unavailable. No PostgreSQL result
  is claimed and the database was not started.
- LP-0 parse/path completeness and HEAD/MERGE_HEAD inventory union: passed.
  Source comparison confirms the checked writer body and GRANT lines unchanged.
- Exact payload/lane coverage against incoming main and archived lane-byte
  comparisons: passed. Standard local lint still rejects pending merge/index
  artifacts against old HEAD; the router must stage/finalize the merge outside
  this read-only Git sandbox. No boundary enforcement was weakened.
- git diff --check: passed.

Remaining hold: the two CH-5 browser failures are not diagnosed from the supplied
summary. GitHub API access failed in this sandbox; requested the first browser
assertion/trace to identify its cause. No speculative UI change, skipped browser
assertion or claim of a fixed browser journey. The listed DB failures need their
real PostgreSQL CI rerun; source inspection and local unit checks are not DB
verification or independent RED review.

## Renumber-only catch-up for PR #386 — 28 October 2026

Renamed 0224_job_import_v3 to 0361_job_import_v3 and
0312_job_import_v3_invoiced to 0362_job_import_v3_invoiced, preserving the
private-refusal-before-invoiced-writer order and both SQL files byte for byte.
Used the exported `planRenumber` from `tools/migration-renumber.mjs` with the
reserved 0323/0324 range; applied filesystem moves because its CLI write mode
requires a clean tree and writes Git's index. No Git write commands were run.
Renamed notes, updated upgrade-test filenames and predecessor (main's 0300),
and extended this branch's lane paths. Kept both import and enterprise exports
when resolving the workspace barrel conflict. The privilege inventory retains
the union of HEAD and origin/main entries, verified by key/identity.

Local checks actually run:

- `node --check tools/migration-renumber.mjs` — passed.
- From apps/api: `./node_modules/.bin/vitest run --maxWorkers=2 src/job-import-v3.application.test.ts src/imported-shadow-source-adapter.test.ts` — 2 files, 8 tests passed.
- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=1 src/migrate-discovery.test.ts` — 1 file, 3 tests passed.
- `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` — passed.
- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed.
- `git diff --check` — passed.
- Read-only Node assertions — SQL bytes match original HEAD; reserved order,
  upgrade-test references, privilege-list union and catch-up lane coverage pass.
- `node tools/agent-lane-boundary-lint.mjs --lane=ch5-e` — FAILED on inherited
  CH5-B/P paths and other lanes' incoming merge entries. In particular,
  config/lanes/ch5-b.json and config/lanes/ch5-p.json are outside this lane;
  this repair does not change those files or weaken lane enforcement.

Router action required before committing: finalize the resolved merge in Git's
index and reconcile the inherited lane-boundary rejection. The workspace file
has no conflict markers, but Git still records it as unmerged because the index
is read-only here. No PostgreSQL or browser suite was run; those require GitHub
CI. RED remains applicable to the enclosing CH-5 PR; no behavior changed in
this catch-up and no independent review is claimed.

# CH-5 current-main catch-up and CH5-A/J candidate — 28 October 2026

RED: charging control and tenant isolation. Synthetic only. No commit, push,
merge, live provider, real customer data or release performed in this sandbox.
The supplied SIMPLE_LOOP is the current build rulebook; the older receipt below
is retained as history, not current coordination authority.

Implemented migration 0324's positive invoiced writer, authenticated Nest/Next
preview/adopt/read APIs, and a browser preview/attestation/saved-import page. One
immutable aggregate stores the approved v3 fixture, terms and baseline/scope
mapping, original result, session-bound public request hash and an invoiced-stage
zero-count exclusion. No v1 cap or policy is attached. The existing v1 writer,
its fields and tests remain. Current same-customer/site live overlaps are linked
within the owning practice session. A command replays its exact stored IDs;
a different command for the same source fixture is refused. Source job locking
precedes receipt and audit locks. Actual history manifests are refused.

Resolved the SERIOUS-B5 catch-up conflict by preserving both sides' exact-object
upgrade checks. Added the 0324 catalogue/RLS/grant expectations and four narrow
privilege-inventory entries for review. No generic inventory/fingerprint refresh.
The table is FORCE RLS, tenant-qualified and SELECT-only for the runtime; only
the session-authorized checked routine can write it. Existing canonical JSON is
reused for the fixed ASCII fixture instead of introducing another encoder.

Still refused / outstanding:

- Live imports and the actual Solo/Builder grace-place admission remain
  METER_PLACE_SOURCE_HANDOFF_HELD: this checkout's MON-1 boundary is still an
  unconditional refusal, and the stored ledger cannot yet atomically admit an
  import. No supplied-count oracle becomes a runtime permit or free import period.
- Historical-original ingestion, imported Final Account baseline consumption,
  imported locks and a persisted pre-adoption catch remain unavailable. The UI
  shows the £0 pre-adoption exclusion rule and says no historical catch exists;
  this is NOT completion of CH-5's actual pre-adoption-catch Done-when assertion.
- Production imports, real fees/providers/data and release gates remain off.

The opaque meterResultRef on invoiced results refers to the durable zero-count
exclusion, NOT a MON-1 period computation. Random generated IDs for terms/baseline
are identities inside the immutable aggregate; they do not masquerade as quote
or locked-bill rows. A baseline ID substituted into the lock boundary is tested
with a valid lock command and must return STALE_REVISION.

Executed local evidence (installed Node 24.17.0 / Vitest 4.1.12):

- Direct installed tsc builds/typechecks for config, core, db and API; web noEmit
  typecheck. No dependency download. The pnpm shim stalled and was cancelled;
  installed binaries were used thereafter.
- core Vitest, maxWorkers=1: job-import-v3.test.ts,
  imported-evidence-provenance.test.ts, meter-place-admission.test.ts: 55 passed.
- API Vitest, maxWorkers=1: job-import-v3.application.test.ts,
  imported-shadow-source-adapter.test.ts, job-parties.application.test.ts:
  43 passed.
- db Vitest, maxWorkers=1: job-import-v3.integration.test.ts -t source-only:
  12 passed, 3 PostgreSQL cases intentionally not selected.
- db Vitest, maxWorkers=1: imported-baseline-sources.integration.test.ts,
  imported-observation-reader.integration.test.ts,
  imported-evidence-provenance.integration.test.ts -t source-only: 22 passed,
  4 PostgreSQL cases intentionally not selected.
- web Vitest, maxWorkers=1: import-v3/route.test.ts: 3 passed.
  Total final focused cases: 135 passed. Scripted transports prove application
  routing/binding/refusal only, not PostgreSQL guarantees.
- Vitest list loaded the new PostgreSQL positive/upgrade cases, the earlier own
  upgrade and the resolved SERIOUS-B5 suite without running hooks. Playwright
  --list discovers CH-5.spec.ts for mobile-360 and desktop; no browser ran.
- OpenAPI generated through node --import tsx (the tsx CLI's IPC socket is forbidden
  here); only the new import endpoints are added.
- Core purity and money/commercial boundary lints pass. Full tools/lint.mjs stops
  at lane lint because the uncommitted catch-up merge attributes incoming main
  and CH5-B/C/P paths to ch5-e. Its scope was not widened to cover those changes.
- Final package builds/typechecks and OpenAPI --check pass. An additional temporary
  test-only tsc project reports one inherited error in
  job-work-state-fixtures.ts:45 (schema.options[0] may be undefined); no error in
  the new test files was reported. That broader helper was left unchanged.
- git diff --check passes. The index still reports the original unmerged file;
  its text markers are resolved. Only the router can git add/complete the merge.

CI still must execute PostgreSQL fresh/upgrade/race/authorization/RLS/locked-bill
cases and CH-5.spec.ts on the real browser. PostgreSQL/localhost were not started.
No whole-repository test/build pass or independent review is claimed. Migration
0324 notes specify forward fix/revocation with immutable rows retained.

CH-5 as a whole is NOT complete: the stored admission and historical catch/source
work above are outstanding. Do not silently mark its finish-list line done.

---

# CH5-E builder receipt — DEPENDENCY-BOUND partial boundaries

25 October 2026, C268. Synthetic only. Not complete, reviewed, accepted,
committed, pushed, merged or released. No successful historical import, stored
provenance, worker observation, hidden catch or imported-job £0 journey claimed.

Read AGENTS.md, BUILD_PLAN §§2.2–2.4/CH-5, full DRAFT CH5-E, shared §§1–3,
CH-5 source/handoff section and lane row in the authoritative corrected draft;
CH5-C/P/B source/receipts and saved CODEX_SESSION_POLICY.md. Dispatch supersedes
DRAFT issuance and own-lane restrictions, authorizes build-ahead, and retains
all source/acceptance holds. No agents delegated. No dependency downloads.

Clean entry: branch codex/sandbox/ch5-e, HEAD
219a7a7a1bf683e608dd450fbf1b94c985a519c6 (CH5-B, in review per dispatch),
on CH5-P c6c4ec9765877da4793187fe7e3123448db992c1.
Read-only origin/main cdd1b29b75fcdc206e43e66dbd68d9f03c9b38fe; no refresh claim.
No Git-writing commands. Changes remain in this working tree for dispatcher commit.

## Scope and dependency evidence

P has preview/refusal only; 0323 installs an uncallable unconditional SQL refusal,
not a successful baseline/terms/history writer or protected completion ledger.
B returns never with IMPORTED_BASELINE_SOURCE_HANDOFF_HELD, no accepted baseline
map. ImportedObservationBundleV1 and worker/sink import-source acknowledgement
are still proposals. Never reinterpret a preview, v1 row or empty array as that
source. C268 permits building ahead, not fabricating accepted interfaces.

New internal boundaries only:

- ImportedEvidenceProvenanceRepository.read/adoptWithHistory preserve original
  verified context, digest and path job and delegate to the held source reader.
  No request parsing, approval, receipt or business mutation is performed for this
  unavailable capability. The unknown command is intentionally not read and this
  class is NOT an implementation of the future successful HistoryImportPort.
- readImportedObservationBundle reuses B's synthetic-mode, strict digest/UUID,
  fresh session and session-owned tenant/job checks, without catching denials.
  If B ever returns successfully, an independent IMPORT_HISTORY_SOURCE_HANDOFF_HELD
  refusal remains. A B upgrade alone cannot activate historical sources.
- applyImportedProvenance always refuses. It does not inspect model/deterministic
  proposals or untrusted provenance, default timing to after_adoption, call the
  sink, or emit an empty success batch. No worker composition or HTTP exposure.

Reservation **0232 unused**: no migration, tables, routine, EXECUTE, runtime write,
RLS exception, fixture original, schema/backfill or rollback change. LP-0 including
lp-0-authority-paths, tenancy, serious-b5 and contractor-entitlement therefore
need **zero additive catalogue rows**. All existing freezes remain untouched.
No shared barrel, worker, sink, reader, evidence service, registry or central
config/agent-lane-assignments.json edit. Own lane uses the explicit dispatch
exception. No external action/provider/env/alert change.

## Acceptance and retained holds

| ID | Evidence and limitation |
| --- | --- |
| CH5-E01 | DEPENDENCY-BOUND: no originals or immutable provenance storage exists |
| CH5-E02/E03 | DEPENDENCY-BOUND persisted timing; C's existing precise pure timing tests are regression evidence only |
| CH5-E04 | Both proposal paths refuse unaccepted provenance; successful classification/sink recheck DEPENDENCY-BOUND |
| CH5-E05/E06 | No source can be emitted/promoted; actual version/hash/finalization/re-upload/link checks DEPENDENCY-BOUND |
| CH5-E07 | No writes, site events, captures, counts or commercial effects; scripted tests and CI-only state comparison |
| CH5-E08 | No new authority/grants; wrapper, protected ledger, atomic originals and routine catalog proof DEPENDENCY-BOUND |
| CH5-E09 | Existing v1/quoted worker source unchanged; local worker regressions below; hidden-state real DB/query-log tests CI-only |
| CH5-E10 | Existing pure attribution regression only; NOT an imported-job full journey |

Unbuilt: 0232 wrapper and immutable original/provenance ledger; server byte/version/
hash verification; protected completion and manifest/action-hash binding; successful
history receipt/replay/rollback/upgrade; fictional original selection; accepted
worker bundle/baseline map; proposal timing transformation and sink recheck.
No speculative table/helper/schema or successful bundle was invented.

Parent C/P/B acceptance and merge, CH-1/MON-1 source/admission and trial-plan
handoff, SV-2/SV-3 bundle/sink interface remain holds. H-IMPORT-BASELINE/H-SV5/
H-SV6 and CH5-J block the complete imported Final Check/£0-fee journey. The
coordinator owns all shared composition. Future activation needs a separately
issued writer/source handoff and exact additive catalogue records from actual
PostgreSQL. All real-data/provider/charging/release gates remain closed.
Two real independent exact-head Claude verdicts, green integrated CI and separate
acceptance are required; Ben owns merge. Builder checks are not model review.

C1/C2/C7: held internal boundaries introduce no route/page/web workflow. Browser
spec and OpenAPI registration are inapplicable to this partial scope; existing
mandatory browser regressions remain CI duties. No model/prompt/parser/matching
change: no AI evaluation run claimed. DB/browser suites cannot run in this sandbox
under the explicit dispatcher constraint; no localhost/PG process started.

## Actual validation

Supplied dependencies; Node v24.17.0 and installed pnpm 10.28.1 via existing
/private/tmp/jg-ch5-p-bin/pnpm. No clean-install claim. Heavy checks one at a time
through /Users/benharwood/.local/bin/heavy-slot, HEAVY_SLOTS=1; host resource
inspection requires approved sandbox escalation. At admission load below 20;
98 GiB free disk, memory 47% free. Vitest maxWorkers=2; Turbo concurrency=1.
Logs /private/tmp/jg-ch5-e-*. Source-only tests are scripted application evidence,
not PostgreSQL/RLS proof. Real CI cases in imported-observation-reader integration
suite have no skip/todo; deselect them locally by source-only name filter.

- Core prerequisite build: exit 0 (dist absent at entry).
- pnpm typecheck --concurrency=1: exit 0, 7 successful, 4 cached.

Remaining actual results appended after execution.

## Session record

Saved operating policy:
`/Users/benharwood/.local/share/full-steam/jg-runs/approved-saved-resumes-20261021T173036Z/CODEX_SESSION_POLICY.md`.
This is the newly issued E leaf, not a parent-session resume. Usage/cache counters
are not exposed; unknown, not zero. No cache benefit or quota saving claimed.

```yaml
session_record_version: 1
task_id: CH5-E
project: JobGuard
role: builder
thread_id: 01a172c6-fb0f-7673-bdb4-674932416633
surface: unknown
host: local macOS sandbox
authorised_route_ref: user CH5-E order C268, 2026-10-25
repository: /Users/benharwood/Claude/Projects/my-new-project
integration_target: origin/main
integration_target_revision: cdd1b29b75fcdc206e43e66dbd68d9f03c9b38fe
worktree: /Users/benharwood/Claude/Projects/my-new-project/.worktrees/ch5-e
branch: codex/sandbox/ch5-e
starting_base_revision: 219a7a7a1bf683e608dd450fbf1b94c985a519c6
source_pin: 219a7a7a1bf683e608dd450fbf1b94c985a519c6
candidate_revision: uncommitted working tree on 219a7a7a
last_validated_revision: working tree; actual results in this receipt
allowed_files_ref: config/lanes/ch5-e.json; C268 own-lane/receipt exception
governing_contract_ref: AGENTS.md; BUILD_PLAN.md CH-5; DRAFT CH5-E and shared sections
model_requested: unknown
effort_requested: unknown
model_runtime_confirmed: unknown
effort_runtime_confirmed: unknown
runtime_confirmation_ref: unknown
last_completed_turn: CH5-E bounded build 2026-10-25
last_receipt_ref: docs/verdicts/CH5-E/BUILDER_RECEIPT.md
state: DEPENDENCY-BOUND partial working-tree handoff
resumed_from_thread_id: unknown
successor_reason: new issued CH5-E leaf
preflight_ref: clean status; HEAD 219a7a7a; C268 allowlist
result_id: unknown
acknowledgement_ref: unknown
ci_evidence_ref: unknown
reviewer: unknown
review_evidence_ref: unknown
accepting_actor: unknown
acceptance_evidence_ref: unknown
outstanding_holds: P/B acceptance and merge; history persistence; accepted baseline map and SV-2/SV-3 bundle/sink; imported Final Check/attribution; integrated CI and independent verdicts; separate acceptance; release gates
builder_finished_at: 2026-10-25T11:28:19Z
coordinator_acknowledged_at: unknown
integrated_at: unknown
merged_revision: unknown
```

## Executed checks and mutation evidence

| Actual command (installed pnpm) | Result |
| --- | --- |
| `pnpm --filter @jobguard/core build` | Exit 0; prerequisite dist absent at entry |
| `pnpm typecheck --concurrency=1` | Exit 0, 7 workspace tasks, 4 cached |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Exit 1, inherited lane paths; purity passes (243 files), package lint not reached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1, same inherited lane range |
| `pnpm turbo run lint --concurrency=1` | Exit 0, 7 package tasks, 4 cached |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/imported-evidence-provenance.integration.test.ts test/imported-observation-reader.integration.test.ts -t source-only` | Exit 0, 13 scripted tests; 2 PostgreSQL tests deselected by name (Vitest displays skipped); no skip/todo introduced |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/imported-shadow-source-adapter.test.ts src/shadow-detection.worker.test.ts src/later-shadow-detection.worker.test.ts` | First exit 1: new adapter 6 passed, two existing worker suites could not resolve absent AI dist |
| `pnpm turbo run build '--filter=@jobguard/api^...' --concurrency=1` | Exit 0, 5 dependency artifact builds, 4 cached; no package download |
| Same three-file worker command, rerun | Exit 0, 20 tests / 3 files |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/imported-evidence-provenance.test.ts src/shadow-domain/signal.test.ts src/shadow-domain/attribution.test.ts` | Exit 0, 35 existing tests / 3 files |
| `python3 /private/tmp/jg-ch5-e-mutations.py` | Exit 0, six behavioral mutants killed; each mutant Vitest exit 1; source restored in finally |

Required root lint/lane status is **H-LANE-BASE**, not pass. The dispatched base
contains parent changes ahead of origin/main, including job-work-state API/web,
workspace/OpenAPI, MON1 and CH5-C/P/B files. None are CH5-E edits or added to E's
allowlist. Diagnostics: `/private/tmp/jg-ch5-e-lint.log`,
`/private/tmp/jg-ch5-e-lanes.log`. Integrated-main rerun remains mandatory.

Load rose above 20 (observed peak 34.85); no new check started until it fell below
20. Also waited for other authorized builds holding the shared slot. The exact
existing scheduler was used with one slot; no bypass/replacement scheduler.

Every new guard has an executable behavioral mutation check:

| Guard / label | Temporary mutant caught |
| --- | --- |
| reader-authority | Removes awaited B authority/source call; cannot silently replace fresh denial with own hold |
| independent-history-hold | Returns undefined when a simulated future B success occurs |
| reader-context | Copies the original verified context before B |
| adopt-context | Copies original verified context in adoptWithHistory delegation |
| read-context | Copies original verified context in provenance read delegation |
| proposal-hold | Returns empty success proposals instead of refusing |

All six killed=true, mutant exit 1 with failed behavioral assertion, aggregate
exit 0. Individual `/private/tmp/jg-ch5-e-mutant-<label>.log`, aggregate
`/private/tmp/jg-ch5-e-mutations.log`; runner `/private/tmp/jg-ch5-e-mutations.py`.
These are application controls, not SQL/catalog/RLS proof. Unchanged B guards
(mode, strict scope, current session, ownership) retain their exact-base mutation
evidence in `docs/verdicts/CH5-B/BUILDER_RECEIPT.md`; E reexecutes their scripted
adversarial cases and its own guard control proves the dependency cannot be
skipped/masked. No parent source was mutated by E.

## Reviewer/CI work — NOT RUN locally

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/imported-observation-reader.integration.test.ts test/imported-evidence-provenance.integration.test.ts test/shadow-detection.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/job-sources-evidence.integration.test.ts test/shadow-isolation-query-log.integration.test.ts
pnpm test:db
pnpm test:migrations
pnpm test
```

Authored real PostgreSQL cases verify authorized-job refusal/no persisted effects,
wrong session within the practice tenant, same-tenant other/unknown job, foreign
tenant, expired/revoked session and pooled tenant-context reset. They cannot prove
nonexistent history storage or successful imported observations. No E migration
upgrade suite is invented: no E migration exists. Full prior DB/browser/MinIO and
required CI checks remain mandatory; dispatcher pushes for GitHub CI. No own-step
upgrade/catalog evidence claimed. Full root test not run locally because it runs
forbidden PostgreSQL suites.

Shared integration requests: none for activation now. All new symbols are held
internal boundaries, intentionally absent from barrels/HTTP/worker composition.
Do not wire a success port from them. Revisit after accepted P history/completion
persistence, B baseline map and SV-2/SV-3 import bundle/sink handoff. Adjacent work
is recorded here for coordinator adoption; no unauthorized BUILD_PLAN edit.

## Final local results

- `pnpm build --concurrency=1`: exit 0, 7 tasks successful, 5 cached, 37.531s;
  existing Next workspace-root/webpack/CSS warnings. No browser execution.
- `pnpm openapi:check`: exit 0, generated contract unchanged.
- `node --test --test-concurrency=1 --test-name-pattern='MC-6 migration order' tools/merge-churn.test.mjs`:
  exit 0, 1 order test, no PostgreSQL or Git-writing fixture test selected.
- `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-ch5-e-tests-tsconfig.json`:
  exit 0, authored integration suites/helper imports compile; not a DB run.
- `node tools/money-arithmetic-lint.mjs`: exit 0.
- `node tools/commercial-boundary-lint.mjs`: exit 0.
- `python3 /private/tmp/jg-ch5-e-scope.py`: exit 0, exact 8 authorized new files,
  zero tracked edits, whitespace clean. Narrow diagnostic does not replace the
  failed required origin/main lane check.
- `git diff --check`: exit 0; untracked files additionally covered by scope check.

Total scoped passing unit/regression tests: **68** (13 scripted DB application,
20 worker/adaptor, 35 existing pure timing/signal/attribution). Two PostgreSQL
cases deselected locally, not executed or represented as passes. Six additional
mutation runs failed behaviorally as required; aggregate mutation runner passed.
Production source restored before successful root build. Subsequent edits only
to receipt. Final disk 97 GiB, load 6.52. No package install, commit, add, checkout,
push, branch mutation, remote message, deployment, provider call or local listener.

Intended conventional subject/body saved at **/private/tmp/jg-msg-ch5-e.txt**.
All eight files remain unstaged/uncommitted. Dispatcher owns commit/push, reviewer
CI, exact-head reviews and separate acceptance; parent must be accepted and merged
before this piece merges. This handoff completes the available bounded work, not
CH5-E's dependency-bound positive acceptance or the CH-5 journey.

## PR #386 catch-up — 29 October 2026

CH-5 part 1, RED. Entry HEAD `2198b35c` already contains the merge of main
`32411c4e`; the worktree had no unresolved conflicts or conflict markers. Both
shared JSON catalogues (OpenAPI and effective privileges) retain all object keys
from both merge parents. No production behavior changed in this catch-up.

Replaced the stale `0337` predecessor assertion with a filesystem-only Vitest
case: enumerate migration SQL filenames below `0349`, sort them, and check that
0349's immediate predecessor in `MIGRATION_URLS` is the highest one. It currently
resolves to `0340_recovery_attribution_hookup.sql` and follows later predecessors
without another hard-coded pin. The existing PostgreSQL upgrade proof still
installs all predecessors and preserves its row/type/security/replay assertions.
The existing lane file records this catch-up and retains the combined PR paths.

Actual local checks (installed dependencies, Node v24.17.0, no package downloads):

- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=1 test/job-import-v3-upgrade.integration.test.ts -t 'orders 0349 immediately'`
  passed: 1 filesystem assertion; 1 PostgreSQL test deselected, not executed.
- From `packages/db`: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` passed.
- `node tools/agent-lane-boundary-lint.mjs` passed against merged main.
- `git diff --check` passed.
- Read-only Python byte comparison against RED-reviewed `84171946` passed for
  both migrations: 0349 SHA-256 `f2e6cc28139d25adfcd7279ffb8aad965d05ad615823ab96beed5e5495a4f932`;
  0350 SHA-256 `ec760547c2e313dbbe4ed65a7f5fe834cf55f69ed8240af06ef8be7fb8295798`.
- Read-only Python comparison confirmed both shared catalogues retain both merge
  parents' object keys. No catalogue edit was needed.

PostgreSQL/browser suites and full required checks remain GitHub CI duties under
the issued sandbox constraint. No database/listener started; no git write,
commit, push, provider call or release performed. This is builder validation,
not a new independent review. Router owns commit/push and CI/review disposition.

## PR #386 catch-up 2 — 29 October 2026

CH-5 / ch5-e, RED. Resolved the router-started merge of current main
`7eef37d694d98e95eb76baae95169e089e3b98e5` (through migration 0358)
into entry HEAD `db63aa538dbabfc965a894ae871937d05e72a2e6`.
The local `main` ref is older; `origin/main` and MERGE_HEAD identify the incoming
main used here. Git metadata remains untouched; the router must stage the resolved
files and finalize the merge commit.

Resolved LP-0 with main's exact newer legacy-adoption definitions, including the
job-insert permit dependency and withdrawn legacy execution, plus the CH-5
entries. Preserved every main catalogue field/list member; group sources/tests
retain the union. Entitlement retains both job_import_v3 and lp_job_insert_permit.
SERIOUS-B5, privilege and tenancy expectations keep main plus the existing CH-5
additions. No routine was re-created or behavior changed.

Used the exported planRenumber from tools/migration-renumber.mjs with reserved
ceiling 0360 to move 0349 -> 0361 and 0350 -> 0362. Its --write CLI requires a
clean worktree and writes git metadata, so the filesystem-only adapter used its
planner and move/stem-rewrite approach, leaving staging to the router. SQL bytes
are unchanged: 0361 SHA-256
f2e6cc28139d25adfcd7279ffb8aad965d05ad615823ab96beed5e5495a4f932;
0362 SHA-256 ec760547c2e313dbbe4ed65a7f5fe834cf55f69ed8240af06ef8be7fb8295798.
All 147 migrations already on origin/main match its bytes exactly. Active
upgrade-test labels, migration-note headings, catalogue sources and lane paths
follow 0361/0362; historical receipt prose retains its original numbers.

Actual local checks (installed dependencies; no downloads; at most two workers):

- node --check tools/migration-renumber.mjs: passed.
- DB Vitest --maxWorkers=1 test/lp-0-catalog.test.ts
  test/audit-export-privilege-comparator.test.ts: 45 passed.
- DB Vitest --maxWorkers=1 test/job-import-v3-upgrade.integration.test.ts
  -t 'orders 0361 immediately': 1 passed, PostgreSQL case deselected.
- DB tsc -p tsconfig.json --noEmit: passed.
- git diff --check: passed.
- Read-only structured comparison: all main LP-0 values retained, with only
  additive CH-5 list entries; no duplicate catalogue identities.
- Exported lanePathAllowed and migrationOrderViolations against origin/main and
  the actual working-tree paths: passed. Ordinary node tools/lint.mjs passes
  core purity but its lane step fails on the still-pending merge/index: it sees
  incoming main paths and removed old migration names against pre-merge HEAD.
  The lane register was not widened to absorb main's files. Router must finalize
  the merge and rerun the normal lane check.
- node --test --test-concurrency=1 tools/lp-downstream-inventory.test.mjs:
  2 passed, 3 failed for LP-0-generated document drift. A temporary comparison
  using origin/main's generator/catalogue/document confirms main already drifts;
  CH-5 adds only its three LP-0-derived object rows. Left generator/document/tests
  unchanged as explicitly instructed; the main fix is expected separately.

Database/browser suites, final normal lane lint and all required CI remain with
the router/GitHub CI after staging and pushing. No PostgreSQL/listener, git write,
commit, push, provider call or release. This is builder verification, not an
independent RED review.
