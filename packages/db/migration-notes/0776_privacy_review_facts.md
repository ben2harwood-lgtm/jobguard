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
facts or weaken the review checks. Reserved number 0776 is renumbered at landing.

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

Local validation: installed Vitest passed privacy-operations (5), migration-proof-loader
and dsar-migration-proofs (83), watchdog-registry/context-boundary/identity (278),
with at most two workers and three named files per run. Installed tsc passed all
seven workspace projects and a focused noEmit check of the changed DB test files.
Vitest list collected both DSAR integration files (12 tests); none was executed
here. git diff --check passed. The lane CLI refuses HEAD == origin/main before
the router commits; its exported lane rules validated all ten working-tree paths
and the exact allow list. Re-run the CLI against the actual committed range in CI.
pnpm typecheck stalled before launching turbo and was stopped; the same installed
tsc scripts were run directly. No packages were downloaded or pins changed.
