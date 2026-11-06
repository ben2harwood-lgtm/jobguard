M5-11 (partial), RED: identity/authority checks for synthetic privacy review.

Adds only app.privacy_review_fact and replaces app.privacy_command from its latest
0585 body. Forced tenant RLS, tenant-qualified request/membership foreign keys,
immutable UPDATE/DELETE/TRUNCATE trigger, no runtime table grants. The existing
company actor/session check and database fence remain authoritative. Strict v2
verify records synthetic_fixture only, advances the request revision and returns
factId through the existing command receipt/replay path. Review binds two facts
of the correct kinds to the same tenant/request and stores their methods in the
review record, which already flows into execution receipts. Audit remains hashes
and references only. No real-person identity policy is implied.

Upgrade does not backfill or rewrite requests, existing review records, or any
other table/routine. Existing historical reviews remain readable unchanged. New
reviews require facts. Forward fix with a new migration if needed; do not delete
facts or weaken the review checks. Landing migration: 0630_privacy_review_facts (reserved after 0624–0629).

The dsar-offboarding integration command and review helpers now record real
synthetic facts and translate their two extra revisions for the existing journey
steps; all existing assertions are retained. New fact tests use actual revisions.

Named holds for landing: PostgreSQL CI must prove fresh/upgrade migration,
request/review preservation, forced RLS, catalog/proof agreement, owner constraints,
immutability, replays/races, cross-tenant/request/kind rejection, contractor
instruction, inventory binding and receipt/audit privacy. Independent RED review
and green CI on the exact landing head remain required. retentionReviewRef remains
a reference. Real methods, providers/uploads, D07/D12 and G0-G5 remain closed;
this change does not finish M5-11 or enable real requests.

Batch-43 local validation (5 Nov 2026): installed Vitest 4.1.12 passed
privacy-operations (5), migration-proof-loader and dsar-migration-proofs (83),
context-boundary (145), and watchdog-registry, identity and privacy-operations.application
(138): 371 tests total. Each run used --maxWorkers=2 and at most three named files.
The pnpm launchers stalled before launching their runners and were interrupted;
no dependencies were downloaded. Direct installed runners were used instead.
Initial DB/API collection failures were missing local workspace dist builds;
core/config/ai/storage/db were built with the installed tsc, then the affected
suites passed. No test assertion was weakened.
Installed tsc passed all seven workspace projects (core/config/ai/storage/db/api/web);
core/db/api/web also passed --noEmit. A focused strict noEmit check passed for
the three changed DB test suites and later-empty-tables. No database or browser
suite ran here.
The lane CLI refuses the self-comparison while HEAD equals origin/main, before
the router commits. Its exported policy/selection/path rules validated the exact
nine non-lane working-file paths, without a self-entry. CI must rerun the actual
CLI on the committed range. git diff --check HEAD passed.

Merge union retains main's interim-draft and direct-debit empty tables alongside
privacy_review_fact. Only the added migration/proof/notes stems and their references
were renumbered. No migration already on main was edited. privacy_command is new
after 0556, so plan-entitlement-lifecycle-upgrade has no predecessor definition for
it to exempt; its exact successor ACL is already composed through the proof loader.
No new job mutation route, central command type, service, client, server module or
browser spec is introduced. LP-5c protected authority tables are not written.

LATER / SIMPLICITY: packages/db/test/dsar-offboarding.integration.test.ts:
replace the implicit checkRevisions offset map with explicit returned revisions
when next extending these journeys; this makes stale-revision assertions easier
to maintain. Deferred; no behavior or acceptance assertion changed for this batch.

Merge refresh validation (5 Nov 2026, main d16ef1978): resolved the sole
later-empty-tables conflict as main's exact list plus app.privacy_review_fact.
All main identity, SCIM, fixture, reservation, retention and other empty-table
entries are retained. Compared the complete replacement privacy_command body
against main's latest definition in 0585_dsar_offboarding.sql: only this group's
existing verify/review fact changes differ; main's database fence, actor checks,
locking, instruction, inventory, execution and sealed audit paths are preserved.
Main has no copy of migration 0630, so no duplicate migration was removed.

Current refresh checks: direct installed Vitest runners, --maxWorkers=1 per run,
privacy-operations.test.ts (5 passed), dsar-migration-proofs.test.ts and
migration-proof-loader.test.ts (84 passed). At most two workers ran at once.
pnpm launchers stalled before the runners and were interrupted; no packages
were downloaded. Exported lane policy checks confirm exactly nine non-lane
paths, no self-entry, and valid migration order against MERGE_HEAD (= origin/main).
PostgreSQL/browser suites and the committed-range lane CLI remain for CI;
independent RED review remains required. Git index is read-only here, so the
router must stage the resolved file and conclude the merge.
The additional core/db noEmit TypeScript command sequence produced no output
and was interrupted after more than two minutes; no current-refresh typecheck
PASS is claimed. CI must supply that result. git diff MERGE_HEAD --check passed.

Landing refresh validation (5 Nov 2026, origin/main 68b104767): the launcher
already completed the merge at a7d613476; no unresolved index entries remain.
Compared the replacement privacy_command against main's latest 0585 body again:
only the existing verify/review fact changes differ. Main's complete empty-table
list is retained plus privacy_review_fact; no migration already on main is
changed or duplicated. The lane lists exactly the nine changed non-lane paths.

Installed Vitest --maxWorkers=1: privacy-operations.test.ts (5 passed),
dsar-migration-proofs.test.ts and migration-proof-loader.test.ts (84 passed).
At most two workers ran concurrently. Core and DB installed TypeScript noEmit
checks passed. The actual lane boundary CLI passed against origin/main, including
migration ordering; PL/pgSQL CASE-in-IF lint passed all 284 migrations.
git diff origin/main --check passed. No code or test changes were needed.
PostgreSQL, browser suites, green CI and independent RED review remain required
on the final pushed head. READY for router commit/push and later PR opening.

PR landing refresh (6 Nov 2026): resolved later-empty-tables.ts as the exact
union, retaining main's order and adding privacy_review_fact. Main ends at
0623_extra_duplicate_disposition; this branch adds only 0630_privacy_review_facts
(reserved after #584's 0624 and #585's 0625–0629). No main migration has the
privacy_review_facts stem, so no duplicate was removed. Renamed only the 1045
stem in SQL, proof, note, tests and lane. Diffed the complete re-created
privacy_command against main's latest body, 0585_dsar_offboarding.sql: only the
prechecked verify/review fact changes differ; actor/database fences, locking,
instruction, execution and sealed audit remain intact. No new behavior added.
Added the private fact table to watchdog.integration's tables list as required
by the landing brief; restore-reconciliation-upgrade already uses laterEmptyTables.

Current local checks: installed Vitest --maxWorkers=1, core privacy-operations
5/5 and DB dsar-migration-proofs + migration-proof-loader 84/84 passed. At most
two workers ran concurrently. Installed DB TypeScript --noEmit passed. PL/pgSQL CASE-in-IF lint passed
all 289 migrations.
git diff origin/main --check passed. No PostgreSQL or browser suite ran here.
The pnpm launcher cannot verify/download its pinned executable in this restricted
network, so installed runners were used without downloading dependencies.
The actual lane CLI was run and rejects the unfinished merge/index range (main's
incoming files and the old renamed paths). Its exported policy checks PASS on
the exact prospective merge diff against origin/main: all ten non-lane changed
paths, no self-entry, correct migration ordering. Router must conclude the merge
and rerun the actual lane CLI on the committed range. CI must prove the full
PostgreSQL fresh/upgrade, catalog/RLS, replay/race, watchdog, restore-reconciliation,
privacy journey and remaining required suites; exact-head RED review and green
CI remain merge gates. READY for router merge completion, commit, push and PR.
