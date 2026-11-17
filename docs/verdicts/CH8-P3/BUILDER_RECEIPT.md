# CH-8 part 3 — RED synthetic evidence-pack activation

Plan: BUILD_PLAN.md CH-8, finish-list row 11. Branch codex/sandbox/ch8-p3, built on ch8-rest
and the router's pending SV-6 merge. Resolved packages/db/src/index.ts by keeping both exports;
the router must stage it to clear the unmerged index. No git mutation was attempted here.

The application queues v3 generation/approval; 0343 installs the checked SQL writer and extends
post-lock material with SV-6 stored receipt facts, allocations, exact invoice bindings/invoiced
lines and payment/adjustment history. Ordinary pre-lock material still exits before hidden reads.
0306 retains its refusal without unreachable code. Existing v1 storage/behavior and privileges
remain intact. Shared command receipts exclude cross-family IDs; worker completion rechecks the
receipt, session, case/job, material and canonical bytes. Case -> stored-line -> job locking matches
SV-6. The separate queued worker is required to keep hidden credentials out of runtime requests.

New CI tests cover SQL-versus-TypeScript canonical byte equality (including Unicode, control
characters, microseconds and rational text); actual generation/approval/replays; altered artifacts;
material forged with another job; cross-session/tenant reads; consumed allocation capacity;
locked original versus supplementary descendant invoice references; stale approval after refund;
immutable old packs and appended attribution/reversal history. A fresh shadow-30000 fixture runs
existing commercial writers from a £30,000 baseline to settled catch, allocation and attribution.
Source evidence/classifier proposals are controlled fixtures, not detection accuracy or live AI
proof. The browser test then builds/approves through the UI and existing worker, downloads, checks
all eight sections, compares the offline CLI report and verifies persistence on reload.

SB-02 activation coverage runs the actual worker with its deterministic must-surface reader/sink,
compares completed pre-lock artifact bytes and ordinary revisions with zero versus 100 hidden
signals, compares runtime statement shape, and inspects the ordinary SQL branch for hidden reads.
This is structural timing coverage, not a measured wall-clock constant-time claim. Must-surface
fixtures are excluded from equality. No real customer data, live provider, money or release.

Validation actually run locally:

- Installed Vitest 4.1.12, maxWorkers=1: API evidence-pack-v3.application, worker and controller:
  22 tests passed; core evidence-pack-v3-assembly, evidence-pack-v3 and evidence-pack: 99 passed;
  db verify-evidence-pack-cli: 5 passed (126 total).
- Installed tsc with package tsconfig.json: core/config/storage/db builds passed; API, web and db
  typechecks passed. These package checks are also their TypeScript lint checks.
- Changed PostgreSQL test files transpile without syntax diagnostics; Playwright --list discovers
  the two CH-8 tests on both mobile-360 and desktop. No DB/browser execution was attempted.
- git diff --check, core purity, money-arithmetic and commercial-boundary checks passed.
- Full tools/lint.mjs stops at lane boundary: comparison with current main includes inherited
  ch8-rest and staged SV-6/other prerequisite changes outside this piece's exact lane. Do not
  broaden the lane to hide that; router must reconcile prerequisite ancestry/current-main CI.
- Initial pnpm invocation failed its automatic version-signature fetch in the restricted network;
  all successful checks used installed package executables, with no package download/install.
  Two mistaken root-level tsc invocations used the root base config instead of package configs
  and failed on repository-wide decorator/test settings; corrected package checks passed above.

CI must execute the new PostgreSQL command, post-lock, isolation and 0343 upgrade suites (including
non-superuser migration install, preserved rows/types/keys/grants and reruns), existing #346/#356/#368
SV-6/allocator adversarial suites, CH-8 browser tests and required full current-main checks. SQL byte
parity and the browser journey are source-inspected/test-authored, not locally test-executed or
independently verified. One fresh independent Claude RED review remains required. No separate
security/commercial approval, production enablement or fee authorization is inferred.

LATER / SIMPLICITY — packages/db/src/evidence-pack-v3-command.ts and the old preparation ports:
once compatibility consumers are migrated, consolidate the held sentinel/preparation seam around
the installed worker repository. This reduces competing entry-point explanations; it is outside
this activation and does not block it.

## RED repair round 1 — reviewer FAIL at 33414dcd

Fixed the disclosure defect in the activation candidate. 0343 now selects reveal and disposition
records only for a reveal classification bound to the current case's catch, via extra_origin,
variation_revision, case source references and the final-account line's actual revision-valued
source_id/commercial_revision_id. Processing sources and attempts export explicit ID/hash projections.
The wider hidden-path check also found whole-run classifications in the run-binding JSON and another
catch's signal ID in ordinary extra_origin rows: these are now projected/scoped too. Public original
evidence, accepted documents and commercial line history remain ordinary sources; hidden detector
inputs, classification lists and unrelated catch proofs are excluded. No grants or money writers change.

The PostgreSQL regression uses the real reconciler with three signals on one completed run: own
reveal, not_enough_evidence and a second revealed/confirmed catch. Negative controls verify all three
proofs actually exist. It checks exact own proof/disposition selection, explicit ID/hash-only source
shapes, absence of the two excluded signal IDs/descriptions from the full artifact, rejected hidden
proof injection and a separate ordinary recovery case receiving no catch proofs at all.

0306 restored byte for byte from origin/codex/sandbox/ch8-rest c0ac3776 (PR #389), verified with cmp.
The previous receipt's statement about removing unreachable 0306 code is superseded by this repair.
Resolved the current-main conflict in packages/core/src/index.ts by preserving evidence-pack and
meter-today exports. Verified the shared privilege expectation identities contain both HEAD and
origin/main sets; staged expectation rows from the router merge were preserved.

Local repair validation: 73 core evidence-pack v3/assembly tests and 25 API v3 application/worker/
controller tests passed using installed Vitest 4.1.12 with maxWorkers=1. Core and db package builds,
db typecheck, web typecheck, money/commercial boundary checks, changed PostgreSQL fixture/test syntax
and diff whitespace checks passed. PostgreSQL is unavailable in this sandbox: the new same-run
regression, migration installation, SQL canonical parity, earlier adversarial allocation suites and
browser journeys remain CI execution requirements, followed by the independent Claude RED recheck.
The router must stage the resolved index; no git-writing command was run.

## Catch-up after SV-6/#400 and stored allocator/#383 — 29 October 2026

Resolved the two export-list conflicts against MERGE_HEAD, preserving every branch export and all
main exports, with no duplicates. Both index files now match main byte for byte. The shared
privilege expectation and unresolved-source lists already match main and were preserved. Main's
0335 stored allocator and 0340 SV-6 SQL are unchanged; inherited copies drop out of the PR diff.
The mixed-final-check fixture additions remain because they support the reviewed CH8 disclosure
regression; they preserve main's fixture changes.

Used tools/migration-renumber.mjs's exported planRenumber with the router's 0343 reservation
(0341/0342 unavailable), then applied its planned filesystem rename and reference updates without
Git mutation. CLI --write cannot run here: it requires a clean worktree and stages its changes.
0343_evidence_pack_v3_activation.sql equals HEAD's 0327 bytes exactly; SHA-256:
ce9c722bea6b53a26998cccdd780535c9e1eae3cca14e103313228d88bbc0834.
Updated upgrade-test lookup, migration tracking insertion, predecessor-number bound, migration note,
contract, operational notes and lane paths. The contract now names the installed SV-6 migration 0340.
No CASE occurs inside a PL/pgSQL IF condition in the activation SQL; the relevant allocator IF CASE
expressions on main are already parenthesised. No SQL behavior or bytes were changed.

Checks actually run for this catch-up, using installed executables and maxWorkers=1:

- API evidence-pack-v3 application, controller and worker: 25 tests passed (three named files).
- Core evidence-pack-v3, evidence-pack-v3-assembly and evidence-pack: 99 tests passed (three files).
- tsc -p packages/db/tsconfig.json --noEmit, apps/api/tsconfig.json --noEmit and
  apps/web/tsconfig.json --noEmit: all passed.
- Core purity, money arithmetic and commercial boundary checks: passed.
- git diff --check and git diff --check MERGE_HEAD: passed.
- Deterministic lane-policy validation using mergeLanePolicy/lanePathAllowed: all 16 actual PR paths
  exactly covered, with the lane file itself implicitly permitted by repository policy. No inherited
  prerequisite paths were added to the lane. Full branch-history lane CI awaits the router's merge
  commit; this filesystem validation is not an independent review.
- Confirmed conflict markers absent; both resolved exports and 0335/0340 SQL equal MERGE_HEAD.

Ready for the router to stage the resolved files and 0327 -> 0343 rename and commit. The index still
reports both exports as unmerged because .git is read-only and no Git-writing command was run.
PostgreSQL migration/adversarial suites, browser execution and required full CI remain for GitHub CI.
This RED piece still requires the loop's independent Claude review on the exact resulting head.
No commit, push, PR, merge, release or real-provider action was performed in this sandbox.

## Current-main catch-up — 29 October 2026, 08:13 run

Started at c28b8877 with a clean tree and no unmerged index entries. No conflict repair was
needed. Current origin/main contains 0347, so 0343 no longer satisfies migration ordering.
The finish list's 08:15 reservation assigns this piece 0360 (0348–0359 belong to other pieces).
Used the existing planRenumber export with those reservations, then applied filesystem renames
and reference updates without Git mutation: 0343 -> 0360. Updated the upgrade test's lookup,
tracking insert and predecessor bound, lane, migration note, contract and operations references.
SQL bytes are unchanged; SHA-256 remains
ce9c722bea6b53a26998cccdd780535c9e1eae3cca14e103313228d88bbc0834.
Earlier receipt sections retain their historical numbering and merge state; this section records
the current state and supersedes their instructions to stage unresolved exports.

Checks actually run using installed package executables:

- API evidence-pack v3 application/controller/worker plus v1 application/controller/errors:
  6 files, 55 tests passed, Vitest 4.1.12, maxWorkers=1.
- Core evidence-pack v3, assembly and v1: 3 files, 99 tests passed, maxWorkers=1.
- DB standalone verifier CLI: 1 file, 5 tests passed, maxWorkers=1. Total: 159 tests passed.
- tsc -p packages/db/tsconfig.json --noEmit, apps/api/tsconfig.json --noEmit and
  apps/web/tsconfig.json --noEmit all passed (also the package TypeScript lint checks).
- Core purity, money arithmetic and commercial boundary checks passed. Core purity reports
  computed-import advisories; it does not refuse them.
- Playwright --list CH-8.spec.ts discovers both tests on mobile-360 and desktop (4 cases).
  This is discovery only, not browser execution.
- Changed TypeScript transpiles without syntax diagnostics after renumbering. Final filesystem
  lane policy covers exactly the 16 PR paths; migrationOrderViolations passes against origin/main.
  This validates the final filesystem, not a staged commit or CI result.
- git diff --check passed; no unmerged entries were present. No Git-writing command was run.

Ready for the router to stage the 0343 -> 0360 renames and reference/receipt updates and commit.
PostgreSQL cannot start in this sandbox; DB suites, browser execution and full required CI remain
pending, followed by an independent Claude RED review against the resulting exact head. No commit,
push, PR, merge, provider action or release was performed here. No new simplification review was
added during this catch-up; the initial LATER / SIMPLICITY entry remains above.

## PR #408 CI repair — try 2 of 3, 29 October 2026 08:55 run

Read the supplied ch8-p3-ci-traces-0855.txt. Started at 9c102a87 with a clean tree and no
unmerged index entries. Left the two identified main LP inventory failures and their files
untouched. Fixed each branch-owned cause without removing assertions or widening exceptions:

- Post-lock source/settlement and same-run disclosure tests, plus the tampered-artifact command
  test, hit PostgreSQL 22P02 (`Token "manifest" is invalid`). In 0360, subtraction bound before
  JSON extraction in the allowed-manifest-key check. Parenthesized the extraction before array
  subtraction. This intentionally changes this branch's new SQL bytes; all other SQL is unchanged.
  Existing success, tamper, replay and disclosure assertions remain. No CASE occurs inside a
  PL/pgSQL IF condition in this migration; the CASE expressions are in SELECT statements.
- Cross-command-family replay test hit 42P08 because parameter $2 was inferred as both UUID and
  varchar. Explicit UUID and text casts retain the exact same command ID in both columns.
- SB-02 hit OBSERVATION_JOB_UNAVAILABLE because its ordinary fixture had already advanced to
  invoiced and its runtime observation pool lacked the session digest. The test now creates a
  fresh session-bound job through existing quote/activation writers, opens a supplier case using
  the existing closed synthetic source catalogue, and uses practiceMaterialPool for the actual
  reader. It still runs the real must-surface callback/worker and compares completed bytes,
  revisions and runtime statement shapes with zero versus 100 hidden signals on that same job.
  It does not alter job state directly or relax the production reader's live-job requirement.
- Both browser projects failed before fixture setup on audit.ts's ESM named export. The test
  now uses the API package's existing tsx scoped ESM loader for the entire source fixture graph,
  avoiding Playwright's mixed module transformation. No dependency or application code is added.

Local validation actually executed (at most two concurrent workers):

- Installed Vitest 4.1.12, maxWorkers=1: API v3 application/controller/worker, 25 tests passed.
- Web tsc -p apps/web/tsconfig.json --noEmit passed after the loader change.
- TypeScript createProgram using the DB package options, noEmit and repository rootDir:
  both changed integration tests and their imported graph passed full typechecking.
- Core tsc -p packages/core/tsconfig.json passed to refresh stale local package exports.
- Isolated /tmp Playwright test loaded the actual shadowPackCatch fixture graph via the same
  scoped loader under a Playwright worker: 1 passed. It does not invoke the fixture or connect
  to PostgreSQL. Initial smoke attempts exposed temporary harness path/extension issues and a
  require-only resolution of an import-only package export; corrected the loader resolution to
  the existing sibling API package.json pattern, then refreshed stale core output and passed.
- git diff --check passed and git ls-files -u was empty. All edited paths remain in this lane.
  A quick CASE regex overmatched END IF followed by SELECT CASE; source inspection confirms no
  CASE in an IF condition. No claim of SQL execution is made from that source inspection.

PostgreSQL and full browser execution remain CI-only in this sandbox. CI must rerun the failed
commands, SB-02, post-lock/disclosure suites and both CH-8 browser projects, plus required checks;
this RED piece still needs the loop owner's independent Claude review against the exact head.
No tests were skipped/weakened, no exception/lane was widened, no Git-writing command was run,
and no commit/push/merge/release/provider action was performed.

## PR #408 CI repair — try 3 of 3 (last), 29 October 2026 11:09 run

Read ch8-p3-ci-traces-1109.txt, which reports the remaining mobile CH-8 fixture import failure
at tsImport: audit.js does not provide appendAuditBatch. Started at ee387867 after the main merge,
with a clean worktree and no unmerged index entries. Inspected current origin/main's audit.ts:
appendAuditBatch is still its intended exported API, and the worktree copy equals main. This is
not an obsolete caller/API migration; the previous in-worker loader workaround did not fix CI.
No audit export, caller API, shared module, or migration is changed in this repair.

CH-8 now executes the same shadowPackCatch fixture with the API package's existing tsx loader in
a fresh Node subprocess, so Playwright's loader/cache cannot transform or reuse its audit module.
The subprocess runs the existing real quote, lock, catch, invoice, receipt, allocation and attribution
writers; only session/job/payment IDs and the attribution result return to the test. No end state or
successful response is fabricated. The browser journey's assertions remain intact on both projects.
The parent retains shadow-login lifecycle ownership. The child uses the same admin, restricted shadow
and runtime connection configurations and closes all its pools. Connection configurations pass over
stdin, not command arguments. pg-pool hides its password option from enumeration, so that field is
explicitly preserved for JSON serialization. Process errors and nonzero exits are asserted before
parsing fixture output. The bounded subprocess timeout fails setup rather than silently proceeding.

Local validation actually executed:

- Installed tsc -p apps/web/tsconfig.json --noEmit passed after the final test change.
- Installed tsc -p packages/core/tsconfig.json passed to refresh merged main's local output.
- /tmp isolated Playwright smoke test ran the actual fixture import graph in the same fresh-node
  --import tsx mode: 1 passed with one worker. Initial smoke found stale local core output missing
  mapValueReceipt; rebuilding current core resolved it. This smoke imports the real fixture and
  its audit graph but does not invoke database setup or start a browser.
- Checked the actual embedded child program with node --check: passed.
- Verified pg Pool connection configuration (including its non-enumerable password and startup
  tenant option) survives the exact JSON serialization shape, without opening a DB connection.
- Playwright --list CH-8.spec.ts still discovers both tests on mobile-360 and desktop: 4 cases.
- git diff --check passed. git ls-files -u is empty. Migration 0360 is byte-identical to HEAD;
  no migration on main, audit API, test assertion, exception or lane scope was changed.

PostgreSQL cannot start in this sandbox. The full shadow-30000 fixture and browser/worker journey
remain for CI execution, then the loop owner's exact-head independent Claude RED review. If this
last CI repair still fails, the router must follow the three-try cap and file the required card.
No fourth attempt is authorized by this handoff. No Git-writing command, commit, push, merge,
release or live provider action was performed. This remains synthetic-only.

## PR #408 CI repair — Ben-authorized round 4, 29 October 2026 15:22 run

Authority: this brief grants Ben's extra round ("Yes, one more each"); if this round still fails,
the router parks it. Started at 437ac065, after the router's main merge, with a clean worktree
and no unmerged index entries. Read ch8-p3-ci-traces-1522.txt in full.

SB-02 root cause: the pre-lock source included `b app.final_check_run_binding` in DECLARE,
although the actual query ran only after the pre-lock return. Changed that variable to RECORD;
the existing SELECT still populates it only on the post-lock path. The test pattern is unchanged.
This intentionally changes this branch's new SQL, rather than hiding the reference or relaxing
its test. Verified the SQL differs from the starting 0360 bytes ONLY in that declaration.
Inspected migration definitions: main's latest predecessor bodies for these routines remain in
0306; no later main redefinition is overwritten or edited. Existing activation, case-scoped
proof projection, writer validation, locking and grants remain as before. No CASE is inside an
IF condition in this migration; its CASE expressions are in SELECT statements.

Browser root causes: shadowPackCatch uses the real quote/activation writers but has no captured
proposal. WorkspaceShell's non-capture branch never rendered RecoveryCases, so the pack button
could not exist. That component's list validator also excluded the server-created
missed_variation_final_account case. Connected the existing RecoveryCases component to the
loaded non-capture workspace and added that precise literal to the response schema ONLY.
The client open-command contract remains unchanged and rejects this type; the server's catch
confirmation/creation controls are unchanged. The existing browser journey now explicitly checks
the recovery heading and selects the confirmed catch before opening its pack. All original UI,
worker, byte verification, approval and reload assertions remain intact.

Regression coverage invokes the actual WorkspaceShell render branch, asserting it contains the
real recovery component bound to the loaded job and exposes none on a forbidden workspace.
Read-boundary coverage accepts the confirmed catch, refuses an unknown type and refuses a client
catch-creation command. Existing adversarial recovery UI tests still pass.

Main contains 0361/0362. Used tools/migration-renumber.mjs's exported planRenumber with the brief's
explicit 0375 target (0363–0374 reserved), applying filesystem-only renames/reference updates.
Updated upgrade lookup, tracking insert, predecessor bound, migration note, contract, operations
and exact lane paths. Historical receipt sections retain their then-current numbering. The live
finish list now contains a later 15:25 note reserving 0382 instead; this run follows the explicit
0375 instruction in its issued brief. Router should reconcile its newer reservation before push.
Added only the exact implementation/regression paths to this piece's lane, without directory globs
or policy exceptions. docs/contracts/lp-downstream-effects-v1.md is untouched.

Validation actually executed locally, at most two workers:

- Web Vitest 4.1.12, maxWorkers=1: workspace-shell-ch8, recovery-case-requests,
  workspace-lifecycle and recovery-cases.behaviour: 4 files, 217 tests passed.
- API Vitest 4.1.12, maxWorkers=1: recovery-case.application and evidence-pack-v3
  application/controller/worker: 4 files, 70 tests passed. Total: 287 tests passed.
- Installed tsc package builds for core, db, API and AI passed; web --noEmit typecheck passed.
  Initial web tests needed current API output built; the subsequent real-runner tests passed.
- OpenAPI --check passed using node --import tsx from apps/api. Direct tsx CLI was blocked by
  sandbox IPC permissions; the initial root-cwd loader attempt lacked decorator settings.
  Retried with the API working directory/config and passed; no OpenAPI change was required.
- Playwright --list CH-8.spec.ts discovers both tests on mobile-360 and desktop (4 cases).
- The exact unchanged SB-02 forbidden-reference regex passes the migration's pre-lock source.
  This is source inspection, not pg_get_functiondef execution.
- Final filesystem lane policy covers all 20 PR paths; 0375 passes order against local origin/main.
- git diff --check passed; git ls-files -u is empty. No Git-writing command was run.

PostgreSQL cannot start here. The full installed-function SB-02 check and both browser journeys
must rerun in CI; no locally executed PostgreSQL/browser pass is claimed. The independent Claude
RED review remains against the exact resulting head. No assertion was weakened or skipped and
no exception added. No commit, push, merge, release, provider action or real-data use occurred.


## PR #408 current-main catch-up — 29 October 2026, 15:36 run

RED CH-8 part 3 catch-up only. The router had already started merging origin/main
72226d28 into reviewed branch head 3b9226ca. Resolved the sole workspace-shell conflict
by retaining main's first-job trial link and this branch's RecoveryCases panel in the
non-capture workspace. No new behavior, test assertion or expectation was introduced.

The LP-0 effective privilege inventory, SERIOUS-B5 upgrade expectations, contractor
entitlement upgrade expectations and tenancy expectations match main byte for byte.
All main lane files and all main migrations match main byte for byte; inherited
migration copies consequently drop out of the PR diff. The downstream LP contract is
untouched and matches main. The latest main definitions of all four routines replaced
by 0375 remain in 0306; no newer routine body is overwritten. Migration 0375 remains
byte-identical to HEAD, SHA-256:
8a821a400e115f8ee1ff9ca4127d6671544e75f00b4000afbfe94c2ade105036.

Validation executed using installed local executables, at most two concurrent workers:

- API Vitest --maxWorkers=1: evidence-pack-v3 application, controller and worker;
  3 named files, 25 tests passed.
- Web Vitest --maxWorkers=1: workspace-shell-ch8, recovery-case-requests and
  workspace-lifecycle; 3 named files, 94 tests passed. Total: 119 tests passed.
- TypeScript builds: core, db, API and AI passed; web --noEmit typecheck passed.
- OpenAPI --check using node --import tsx in apps/api passed.
- Core purity, money arithmetic and commercial boundary checks passed. Core purity
  retains its existing computed-import advisories.
- Final filesystem lane policy exactly covers all 20 PR paths; migration ordering
  passes against origin/main. git diff --check and git diff --check origin/main pass.
- An initial pnpm invocation stalled and was interrupted; installed .bin executables
  were used instead. Initial guessed guard filenames were absent; the repository's
  actual *-lint.mjs guard entrypoints above were then run successfully.

Ready for the router to stage the resolved workspace and receipt, complete the pending
merge and push. The index still reports workspace-shell unmerged because .git is
read-only; no Git-writing command was run. PostgreSQL and browser suites remain for
GitHub CI, along with all required checks and the loop owner's exact-head RED handling.
No commit, push, PR creation, merge, release, provider action or real-data use occurred.
