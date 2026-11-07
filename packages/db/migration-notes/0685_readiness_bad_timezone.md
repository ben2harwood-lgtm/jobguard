# 0685 readiness bad timezone — LATER-SAFETY-29

Forward migration after 0684_readiness_discovery_guard; preserve that relative
order when renumbering at landing. Starts from the complete 0684 routine and
only guards its date comparison with a CASE checking pg_catalog.pg_timezone_names.
An unknown stored zone is skipped, including when an older revision used a
valid zone. CASE keeps AT TIME ZONE out of the unknown-zone path regardless of
WHERE predicate evaluation order. TypeScript validation is unchanged.

The synthetic database guard, latest-revision selection, date filter, 100-row
cap, identifier-only output, SECURITY DEFINER/search_path, owner, EXECUTE grants,
FORCE RLS tenant context and restoration on success/error are unchanged. No
tables, policies, grants, signatures, backfill or external actions change; the
explicit lp0/upgrade/tenancy proof sections are empty for that reason.

The added real-PostgreSQL regression seeds two fictional unknown zones as latest
stored revisions. It installs 0684 and expects 22023, restores 0685 in finally,
then requires another tenant's due plan and excludes both bad plans. The six
existing timer cases and readiness-store tests retain every assertion.

CI must execute the timer and store integration suites, fresh/upgrade migration
checks, LP-0 grant freeze and tenancy checks. PostgreSQL cannot start or bind
localhost in this sandbox, so failing-first database execution is pending CI.
This landing group is RED because it includes tenant-bound discovery through a
SECURITY DEFINER routine; it requires an independent check. It remains NOPR, with no release or live-data claim.

Forward fix only: retain stored plans and add a later reviewed migration if
needed; do not restore discovery that lets one unknown zone block all tenants.

Named holds for landing: merge later-safety-20 (and batch-44) before this piece;
renumber complete migration stems with 0683 < 0684 < 0685 preserved; obtain CI
database proof and an independent check at the exact landing head. No scanner
or pin edit is needed.

Local evidence: `node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`
passed. After building existing core/storage dependencies with their pinned tsc,
`packages/db/node_modules/.bin/vitest run --maxWorkers=2
test/migration-proof-loader.test.ts` (cwd packages/db) passed 77 tests. Vitest
`list --maxWorkers=2 test/readiness-timer.integration.test.ts
test/readiness-store.integration.test.ts` collected all seven timer and four
store cases without running hooks. `git diff --check` passed. A byte comparison
confirmed the original six timer cases are unchanged and the SQL differs from
0684 only in the guarded predicate. The initial proof-loader load failed for
missing core dist; it passed after the normal dependency build. The pnpm wrapper
stalled before launching commands; direct installed binaries completed them.

The read-only Git sandbox prevented the requested predecessor merge: its 22-file
patch is applied to working files only, preserving current main. Git metadata
is unchanged; the router must record the predecessor merge before committing.
The lane lists the exact diff from later-safety-20, including inherited main
changes, as required by the brief; those inherited files were not edited here.

## Landing reconciliation — 6 November 2026

Current main is the launcher-provided MERGE_HEAD `3f4fc1e95` (the local `main`
reference is stale). Retained the complete main membership/identity checks and
all four main readiness-store integration cases, alongside the inherited
batch-44 scheduling/resequencing and legacy-proposal assertions. The new timer
and cross-tenant store fixtures supply actual synthetic owner membership IDs
and identity IDs; they no longer use the audit-reference string rejected by
main. No production behavior was added during this reconciliation.

Main has no discovery routine or migrations 0683–0685. All three remain in their
existing order; 0684 extends 0683 with the synthetic-database/date guard, and
0685 extends that complete body only with the unknown-time-zone CASE predicate.
Main's worker task lists and successor-table expectations retain all their
entries, with this group's rows beside them. The group lane now lists exactly
all 23 changed paths relative to MERGE_HEAD, excluding every config/lanes/ path.
The predecessor branch changes are included in this landing group; the earlier
separate predecessor-merge note describes the prior build, not this handoff.

Local checks use installed Vitest 4.1.12 with explicit `--maxWorkers=2` and at
most three named files per invocation. Passed core readiness (9 tests), API
scheduler/store/task (34 tests), migration proof loader (77 tests), and API/DB
TypeScript checks (`node_modules/.bin/tsc -p <package>/tsconfig.json --noEmit`).
The two real PostgreSQL files collect seven timer and five store cases with
`vitest list`; hooks/database assertions were not executed in this sandbox.
The pnpm wrapper stalled, so installed binaries were used; worker composition
initially could not resolve the unbuilt AI package, then its normal TypeScript
build and the config build supplied the missing artifacts. Final worker test
results are recorded below.

The router must stage the resolved files and record the merge because .git is
read-only here. No git-writing command, push, PR, database server or browser
was run. CI database/browser gates and independent RED review remain required.

Final worker composition rerun: both named API worker files passed (13 tests).
`git diff --check` passed. Byte comparison confirms 0685 differs from 0684 only
in its guarded date predicate. Lane equality and conflict-marker checks passed.
READY for router staging/commit; CI and independent review are still pending.


## LATER-SAFETY-29-CATCHUP — 7 November 2026

READY for router staging and commit. Resolved the two working-file conflicts by
restoring origin/main's exact migfix-7-upgrade and plan-entitlement-lifecycle-upgrade
copies. Both catalogues exclude infrastructure, so discovery needs no new routine
entry in either suite. Preserved the union of main and the piece elsewhere, with
no new behavior or changed test expectations.

Renumbered the complete migration stems 1050, 1051, 1052 to 0683, 0684, 0685,
respectively, including notes, proof filenames/content, lane and timer test
references. Byte comparison against HEAD confirms all three SQL files are
unchanged. Main has no discover_readiness_plans body to supersede; 0684 retains
the complete 0683 routine and 0685 retains 0684 plus the existing timezone guard.
The lane equals the actual 23 changed paths from origin/main outside config/lanes/.
No stale old-stem references remain in source, tests or notes.

Passed installed TypeScript checks for packages/core, packages/db and apps/api
with --noEmit. Passed installed Vitest 4.1.12 runs with --maxWorkers=2 and at most
three named files per run: core readiness (9), API readiness scheduler/store/task
(34), API shadow-detection worker and sv5pre worker registration (13), database
migration-proof-loader (77): 133 tests total. Vitest list collected the seven
timer and five store PostgreSQL cases without executing database hooks.
The initial API test command pointed at a missing root Vitest binary; rerunning
with the installed API-package binary passed. git diff --check origin/main passed.

No database/browser execution, Git metadata write, commit, push or PR was attempted.
The index still needs router staging to record the resolved merge. RED: CI database
and browser gates and the required independent review remain separate landing gates.
