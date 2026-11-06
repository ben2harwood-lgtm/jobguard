LATER-SAFETY-5 item 2 (RED: least privilege). Forward-only hardening of the
0588 scheduled readiness store. Both tenant policies now fail closed for absent
or reset tenant context, preserving their existing roles, grants and forced RLS.
Both tables reject UPDATE, DELETE and TRUNCATE using the same trigger pattern as
0589 inbox metrics, including writes performed as the table owner.

No data backfill, row-shape change, adapter/task change or provider activation.
The store appends plan revisions and proposals; no update/delete path was found.
Both tables already belong to later-empty-tables.ts alongside inbox_metric_receipt;
no new reset exception is needed. Administrative DDL can disable triggers, as it
can for inbox metrics; this is not protection against a malicious administrator.

Rollback/forward fix: preserve stored history and correct a policy or trigger in
a later reviewed migration. Do not delete rows or remove immutable history guards
as an operational workaround. Renumber at landing with the matching proof.

Tests: scheduled-readiness-hardening.integration.test.ts covers populated tables,
missing/reset/foreign tenant contexts, unchanged grants, owner and administrator
UPDATE/DELETE/TRUNCATE refusals and preservation of all stored rows. Its static
migration guard is locally runnable without PostgreSQL; the database tests require
CI. CI must also run existing readiness-store, inbox-metrics, tenancy, LP-0 and
upgrade/migration suites against fresh and upgraded PostgreSQL installations.

Item 1 is stopped under the brief's explicit transaction-boundary condition:
success-fee-composition.ts nests repository.withReader inside store.transaction.
withTenant commits before withReader resolves; the outer store commits afterwards.
ReservationStore's callback exposes a book and source readers, not its transaction
connection or a transaction-lifetime hook. Switching pools cannot retain FOR SHARE
until the reservation commit. A shared reservation transaction contract/implementation
is needed outside this item's allowed files. No 0783 migration or fee reader change
is supplied. Also, the unchanged success-fee-direct-debit integration suite currently
asserts that composing with runtime must fail, conflicting with the requested new
runtime capability. The later-safety-2 dependency merge remains for the router:
.git is read-only and no writing git command was run here.

Local validation (5 Nov 2026): the new static guard first failed because 0784 was
absent, then passed (1 test; 3 PostgreSQL tests deliberately excluded by the local
name filter). Migration proof loader: 76 passed. API watchdog-registry,
context-boundary and identity guards: 278 passed. Installed TypeScript compiler
completed core/config/storage/db/ai builds and API/web no-emit checks. The pnpm
launcher stalled before invoking checks; it was interrupted and the installed
binaries were used directly, without downloading packages. Full lane lint refused
the HEAD/base self-comparison on this uncommitted sandbox; its existing policy
loader/path helper verified the exact five working files and lane allow-list.
The router must run the full lane check after committing. These are local,
deterministic checks, not PostgreSQL evidence or an independent RED review.


## Batch-40 landing preparation (5 November 2026)

RED; NOPR. The clean preassembled union of later-safety-2 through later-safety-5
was checked against the available origin/main base 567604fdc (local main is stale;
no fetch or Git-writing command was run). Migrations and matching notes/proofs now
use these stems, in dependency order:

- 0625_company_import_once
- 0626_ais_private_reads
- 0627_billability_one_line
- 0628_dunning_owner_approval
- 0629_scheduled_readiness_hardening

Only complete filename stems were replaced. The recreated import and dunning
bodies retain the latest base bodies except their existing intended predicates.
The entitlement upgrade guard names each changed routine and binds the exact
replacement body. No table columns or new tables were introduced. The existing
later-empty-tables register already includes both scheduled stores and metrics.
The four added piece lanes were removed in favor of batch-40's exact 67-file
allow-list (excluding config/lanes). This preparation adds no product behavior.

Local deterministic validation: 534 tests passed across 22 named Vitest files,
with at most two workers and three named files per invocation. This includes the
278 watchdog-registry/context-boundary/identity tests, migration-proof-loader,
later-safety-3, inbox-metrics, dunning repository, payment-fee collection,
enterprise live prompt, readiness store, Deepgram fixture, shadow pilot report,
web transports/screens/pages, and the scheduled-readiness static guard. That last
invocation selected only the static test; its three PostgreSQL tests were not run.
Installed TypeScript compiled core/config/storage/db/ai and passed API/web no-emit
checks. Initial test discovery lacked built workspace dependencies; after those
builds all selected suites passed. The pnpm version probe stalled and was stopped;
installed package binaries were used without downloads. A direct Node import of
the TypeScript proof loader cannot resolve source .js aliases; the actual Vitest
proof-loader and complete-chain tests passed through the repository runner.

The required lane lint was run: it still reads committed HEAD's superseded paths
and therefore refuses the old lanes/migration names before the router commits.
Its exported policy/path/order helpers independently verified the working-tree
allow-list is exact and all five added migrations have matching proofs. The router
must rerun the full lint on the committed head. git diff --check passed.

CI must prove fresh and populated-upgrade PostgreSQL behavior, LP-0 catalogue,
RLS/grants, command authority, fingerprint preservation, audit integrity,
entitlement lifecycle and migration suites, plus affected browser journeys.
Exact-head independent RED review and green CI remain required before merge.
Nothing live, no customer data, no providers, no PR or release was performed.
The stopped fee reservation transaction item described above remains omitted;
this union does not claim that item or any whole plan piece is finished.

LATER / SIMPLICITY: apps/api/src/readiness-store.ts and
packages/db/src/inbox-metrics-repository.ts repeat the strict membership/identity
actor schema. A later shared contract export could keep that boundary shape in
one place while preserving each operation's independent permission checks.


## Current-main merge verification (5 November 2026)

READY for router commit/push and subsequent CI/review. The launcher already
committed the merge at 2fd1fb88b with origin/main d16ef1978. No unresolved index
entries or conflict markers remain. Local main is stale and was not used as the
comparison base. No Git-writing command was run in this sandbox.

Compared both replacement routines against the latest definitions on origin/main:
0625 retains the complete 0534 import body with only its tenant/source duplicate
predicate; 0628 retains the complete 0564 dunning body with only its current-owner
approval predicate. No main behavior was removed. All five migrations are absent
from main, above its 0613 maximum, and have matching proofs. No migration needed
dropping. Main's new rows in the shared registers were retained by the merge.
The lane allow-list equals all 68 changed paths outside config/lanes and does not
list itself. LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs
--lane=batch-40 passed. SQL CASE-in-IF lint passed for all 283 migrations.

Local installed Vitest binaries passed 232 tests in 13 named files, never more
than three named files per invocation or two Vitest workers total. Selected files:
DB later-safety-3, inbox-metrics, dunning-repository, payment-fee-collection-repository,
enterprise-live-prompt-repository and migration-proof-loader; API readiness-store
and deepgram-fixture.service; web recovery-billability-server,
managed-recovery-server and duplicate-candidates/transport; core shadow-pilot-report;
and only the static policies/immutability test in scheduled-readiness-hardening.
The latter explicitly did not run its three PostgreSQL tests. The initial pnpm
launches failed before running checks because the launcher could not fetch/verify
the pinned package-manager release; installed binaries supplied all test evidence.
No packages were downloaded. Stale migration references in the dunning note and
upgrade test title were corrected; no behavior or assertions were changed.

PostgreSQL, browser suites, green CI against the committed head and independent
RED review remain required. This is merge preparation, not completion of a plan
piece or approval to release.

Installed TypeScript checks passed: packages/db, apps/api and apps/web each ran
./node_modules/.bin/tsc -p tsconfig.json --noEmit from its package directory.
git diff --check passed. No further simplification was added on this follow-up;
the initial review suggestion above remains LATER only.


## Latest merge preparation (5 November 2026, 23:42 UTC)

READY for router staging/merge commit and push. This entry supersedes the earlier
current-main merge verification above: origin/main is now
68b104767b18fad6fc5b9676f95bcd7d68bcc19d, HEAD is
f763dc659d83a2e1a63d67f85c288dd25a648e59, and this merge is still uncommitted.
The sole conflicted file, plan-entitlement-lifecycle-upgrade.integration.test.ts,
now retains main's exact 0615 success-fee and 0616 payment-fee body assertions
and this group's exact 0625 import and 0628 dunning body assertions. No test was
weakened. The index remains unmerged until the router stages the resolution;
no Git-writing command was run in this sandbox.

Compared replacement routines to the latest bodies on this origin/main again:
0625 differs from 0534 only in its intended tenant/source duplicate predicate;
0628 differs from 0564 only in its intended current-owner approval predicate.
All five reserved 0625–0629 migrations are absent from main, with no duplicate
migration suffix, so none needed dropping. No additional exact-list edits were
needed. The lane allow-list exactly matches all 68 changed paths outside
config/lanes/ and excludes itself.

Local installed Vitest binaries passed 232 tests in 13 named files, with at most
three named files per run and at most two workers total. Commands, from the
respective package directories, used ./node_modules/.bin/vitest run --maxWorkers=1:
- db: test/later-safety-3.test.ts test/inbox-metrics.test.ts test/dunning-repository.test.ts (41)
- api: src/readiness-store.test.ts src/capture/deepgram-fixture.service.test.ts (17)
- db: test/migration-proof-loader.test.ts src/payment-fee-collection-repository.test.ts src/enterprise-live-prompt-repository.test.ts (110)
- web: app/lib/recovery-billability-server.test.ts app/lib/managed-recovery-server.test.ts app/api/contractor/jobs/[id]/duplicate-candidates/transport.test.ts (46)
- core: src/shadow-pilot-report.test.ts (17)
- db: test/scheduled-readiness-hardening.integration.test.ts -t 'declares missing-context-safe' (1 static check; 3 PostgreSQL tests excluded).
Installed ./node_modules/.bin/tsc -p tsconfig.json --noEmit passed in db, api
and web. git diff --check passed. The two initial pnpm invocations stalled before
test execution and were interrupted; no dependency install was requested.

The full lane lint currently fails because local mode counts main's staged merge
files against this group's lane, in addition to the branch delta. Do not add
main's files to this lane to silence that result. Direct origin/main-to-working-
tree path comparison confirms exact coverage; the router must rerun full lane
lint after staging and committing the merge. PostgreSQL, browser suites, committed-
head CI and independent RED review remain required. No further simplification
was added on this follow-up; the initial LATER suggestion above remains advisory.


## Final catch-up repair (6 November 2026)

READY for router commit/push, CI and independent RED recheck; batch-40 remains NOPR.
The enterprise-access upgrade comparator now permits only the exact 0629 qual and
with_check for app.scheduled_readiness_plan.tenant_isolation and
app.scheduled_readiness_proposal.tenant_isolation. Both full policy rows still
compare exactly, preserving roles, command, schema, name and permissiveness.
All other policies retain the predecessor byte comparison. No generic
CREATE POLICY discovery or predicate omission was introduced. Product code,
migration SQL, proofs and the main catch-up remain unchanged.

Local checks used the installed package Vitest binary with --maxWorkers=2:
- enterprise-access-upgrade.integration.test.ts, filtered to 'ACL comparison|policy comparison':
  2 passed; 1 PostgreSQL test excluded. Regression checks bind both replacements
  to 0629's proof and reject the old predicates, changes to either predicate or
  metadata, and changes on other tables, schemas or policies.
- later-safety-3.test.ts, migration-proof-loader.test.ts, inbox-metrics.test.ts:
  97 passed.
- scheduled-readiness-hardening.integration.test.ts, filtered to
  'declares missing-context-safe': 1 passed; 3 PostgreSQL tests excluded.
- packages/db ./node_modules/.bin/tsc -p tsconfig.json --noEmit: passed.

PostgreSQL and browser execution are reserved for GitHub CI by this sandbox's
instructions; these local results are deterministic checks, not live database
proof or independent review. The pnpm version probe stalled and was stopped;
no packages were downloaded. No Git-writing commands were run. Lane validation
uses origin/main's merge base, as the repository lane checker requires; local
main is stale. The fetched origin/main has advanced to 1c2d1f2f7 since this
branch's existing catch-up at 68b104767; this repair does not merge that new work.
The lane allow-list includes every changed path outside config/lanes, excludes
itself, and preserves the rest of the catch-up. Earlier LATER notes stand.

LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs --lane=batch-40
passed; the allow-list matches all 69 branch paths outside config/lanes.
git diff --check passed.


## PR preparation: reserved landing range (6 November 2026)

READY for router commit/push and PR opening. Compared against origin/main
f5415ddb4c3a40796dd812e8b5946ba5094daa2b (maximum migration 0621).
HEAD 88ba4dbac already contains that main; the working tree had no unfinished
merge or unresolved entries. Prechecked changes and the narrow policy comparator
repair are preserved. This preparation adds no product behavior.

The branch migrations against main, in their original order, are:
- 0625_company_import_once
- 0626_ais_private_reads
- 0627_billability_one_line
- 0628_dunning_owner_approval
- 0629_scheduled_readiness_hardening

All five are absent from main by suffix and no copy needed dropping. Each SQL
file is byte-identical to its prechecked predecessor; notes, proofs, lane paths
and every source reference were renumbered with it. The complete proof chain
passes with the reserved order. Compared every re-created routine to its latest
main body: 0625 preserves 0534 except the intended tenant/source duplicate
predicate; 0628 preserves 0564 except the intended current-owner approval check.
0629's trigger routine is new. No main routine behavior was removed. No new
tables, worker tasks, providers, CI images or function SET app.* clauses appear.
Changed web production sources were read for direct apps/api/src imports; none
were found. Cloudflare build was not run in this restricted environment.

Local checks used installed binaries, without downloads or Git-writing commands:
- packages/db ./node_modules/.bin/vitest run --maxWorkers=1
  test/later-safety-3.test.ts test/migration-proof-loader.test.ts
  test/inbox-metrics.test.ts: 97 passed.
- packages/db ./node_modules/.bin/vitest run --maxWorkers=1
  test/enterprise-access-upgrade.integration.test.ts -t
  'ACL comparison|policy comparison': 2 passed; 1 database test excluded.
- packages/db ./node_modules/.bin/vitest run --maxWorkers=1
  test/scheduled-readiness-hardening.integration.test.ts -t
  'declares missing-context-safe': 1 passed; 3 database tests excluded.
- packages/db ./node_modules/.bin/tsc -p tsconfig.json --noEmit: passed.
- node tools/plpgsql-case-in-if-lint.mjs: passed, 291 migrations.
- git diff --check: passed.

LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs --lane=batch-40
was run. It refuses only the 15 old filenames still in committed HEAD, because
its local mode unions HEAD's branch delta with uncommitted deletions. Do not add
obsolete paths to the final lane to silence this. Direct working-tree comparison
confirms the lane lists exactly all 69 final changed paths outside config/lanes
and excludes itself; the lint's migration-order helper also passes for 0625–0629.
The router must rerun the full lane lint after committing these renames.

CI must prove fresh/populated-upgrade PostgreSQL, catalogue/RLS/grants, command
replays and authority, audit and fingerprint preservation, import/AIS/billability/
dunning/readiness behavior, and affected browser journeys. Exact-head RED review
and green CI remain required before merge. Earlier independent precheck evidence
applies only to the heads it names. No live data, providers, deployment or launch.
The previously omitted reservation transaction item stays omitted. No whole plan
piece is claimed finished; the initial LATER / SIMPLICITY note remains advisory.

## PR #585 core catch-up (6 November 2026)

RED: session/authority error boundary. Reproduced the office-signals regression:
12 tests passed and the revoked-session assertion failed across the two prompt
repository suites. The group's shared failure mapper matched UNAUTHENTICATED by
message alone, masking the contractor session bridge's typed refusal. Restrict
that new mapping to PostgreSQL SQLSTATE 42501 so database lp_authority refusals
still become EXTRA_FORBIDDEN while session errors propagate unchanged. No tests,
SQL, policy pins, interfaces or other group behavior were changed.

Local deterministic validation, using installed binaries in packages/db:
- ./node_modules/.bin/vitest run --maxWorkers=2
  src/enterprise-office-signals.test.ts
  src/enterprise-live-prompt-repository.test.ts: 13 passed.
- ./node_modules/.bin/vitest run --maxWorkers=2
  test/contractor-session-context.test.ts: 17 passed.
- ./node_modules/.bin/vitest run --maxWorkers=2
  test/enterprise-access-upgrade.integration.test.ts
  test/scheduled-readiness-hardening.integration.test.ts -t
  'ACL comparison|policy comparison|declares missing-context-safe': 3 passed;
  4 PostgreSQL tests excluded. The 0629 two-policy pin is unchanged.
- ./node_modules/.bin/tsc -p tsconfig.json --noEmit: passed.
- Read-only comparison against origin/main: existing lane allow-list exactly
  matches all 69 changed paths outside config/lanes/ and does not list itself.
- git diff --check: passed.

READY for router commit/push to the same branch. No Git-writing command,
PostgreSQL server, browser, download or provider was used. GitHub CI must run the
real database/browser gates; exact-head independent RED review remains required.
This is a catch-up, not another repair round or a completion claim for the group.


## Batch-40 catch-up to #582 (6 November 2026)

READY for router staging of the two resolved paths, merge commit and push to
codex/sandbox/batch-40 / PR #585. RED. The launcher's incoming merge is
origin/main 46f0be7ea6758835db8797aa4bccdd9193fcbe63 (#582). The available ref
ends at 0623; #584 / 0624 remains a required predecessor at landing and is not
claimed merged or tested here. No Git-writing command was run; the index still
has unmerged entries until the router stages the resolved working files.

Resolved duplicate-candidates/transport.test.ts as the exact behavioral union:
the group's validated UUID session and 401 regressions plus main's sessionId
return field. Resolved plan-entitlement-lifecycle-upgrade.integration.test.ts by
retaining both exact 0625/0628 assertions and main's 0622 relink / 0623 unresolved
body assertions. No other test expectations changed in this catch-up.

Recreated both replacement routine definitions from the latest available main
bodies, then compared each: 0625 versus 0534 differs only by the intended company
source duplicate predicate; 0628 versus 0564 differs only by the intended current
owner approval check. All five branch-only migrations remain 0625–0629 with
matching proofs. Main's 0622–0623 migrations and shared exact-list/catalogue files
are byte-identical to origin/main, so no duplicate migration needed dropping.
The UNAUTHENTICATED SQLSTATE fix and the 0629 two-policy pin/proof are byte-identical
to HEAD. The lane exactly covers all 69 changed paths outside config/lanes/,
excludes itself, and requires no additions for main-only files.

Local deterministic validation used installed binaries only, no downloads.
At most two one-worker Vitest runs overlapped, with at most three named files
per invocation. From packages/db, ./node_modules/.bin/vitest run --maxWorkers=1:
- test/migration-proof-loader.test.ts test/later-safety-3.test.ts test/late-source-import-migration.test.ts: 91 passed.
- test/enterprise-access-upgrade.integration.test.ts test/scheduled-readiness-hardening.integration.test.ts -t 'ACL comparison|policy comparison|declares missing-context-safe': 3 passed; 4 PostgreSQL tests excluded.
- src/enterprise-office-signals.test.ts src/enterprise-live-prompt-repository.test.ts test/extra-relink-migration.test.ts: 15 passed.
From apps/web, ./node_modules/.bin/vitest run --maxWorkers=1:
- app/api/contractor/jobs/[id]/duplicate-candidates/transport.test.ts app/api/contractor/jobs/[id]/duplicate-candidates/route.test.ts app/lib/recovery-billability-server.test.ts: 34 passed.
Total final selected results: 143 passed. The first web run had two failures from
stale built DB exports (DuplicateDispositionError); rebuilding packages/db with
./node_modules/.bin/tsc -p tsconfig.json fixed test discovery, and the same three
files then passed without source or expectation changes. That DB compile passed;
apps/web ./node_modules/.bin/tsc -p tsconfig.json --noEmit passed.

SQL CASE-in-IF lint passed all 293 migrations; git diff --check passed; no conflict
markers remain in the branch delta. Working-tree lane policy helpers passed branch,
path and migration-order checks, and exact path-set comparison passed. The full
LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs --lane=batch-40
command refuses main's staged incoming merge files against this group's lane;
router must rerun after staging/committing, without adding main-only paths.

GitHub CI must run PostgreSQL and browser suites after router push, and an
independent RED review must bind the final exact head. No PostgreSQL server,
localhost listener, provider, customer data or release was used. No new behavior
or additional simplification finding was introduced in this catch-up.
