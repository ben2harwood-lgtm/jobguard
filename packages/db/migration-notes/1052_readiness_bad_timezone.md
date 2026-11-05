# 1052 readiness bad timezone — LATER-SAFETY-29

Forward migration after 1051_readiness_discovery_guard; preserve that relative
order when renumbering at landing. Starts from the complete 1051 routine and
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
stored revisions. It installs 1051 and expects 22023, restores 1052 in finally,
then requires another tenant's due plan and excludes both bad plans. The six
existing timer cases and readiness-store tests retain every assertion.

CI must execute the timer and store integration suites, fresh/upgrade migration
checks, LP-0 grant freeze and tenancy checks. PostgreSQL cannot start or bind
localhost in this sandbox, so failing-first database execution is pending CI.
This non-RED piece still needs an independent check because it replaces a
SECURITY DEFINER routine. It remains NOPR, with no release or live-data claim.

Forward fix only: retain stored plans and add a later reviewed migration if
needed; do not restore discovery that lets one unknown zone block all tenants.

Named holds for landing: merge later-safety-20 (and batch-44) before this piece;
renumber complete migration stems with 1050 < 1051 < 1052 preserved; obtain CI
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
1051 only in the guarded predicate. The initial proof-loader load failed for
missing core dist; it passed after the normal dependency build. The pnpm wrapper
stalled before launching commands; direct installed binaries completed them.

The read-only Git sandbox prevented the requested predecessor merge: its 22-file
patch is applied to working files only, preserving current main. Git metadata
is unchanged; the router must record the predecessor merge before committing.
The lane lists the exact diff from later-safety-20, including inherited main
changes, as required by the brief; those inherited files were not edited here.
