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
facts or weaken the review checks. Batch migration 1045_privacy_review_facts is renumbered again at landing.

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
Main has no copy of migration 1045, so no duplicate migration was removed.

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
