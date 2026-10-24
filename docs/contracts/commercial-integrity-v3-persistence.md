# CH6-P — synthetic advisory source persistence

Built against c50faa2affbc7dc9f4a8ede5b921ab007a846df6. Construction authority is
the issued CH6-P order of 24 October 2026. Merge target origin/main was
cdd1b29b75fcdc206e43e66dbd68d9f03c9b38fe at inspection. This document is an
implementation contract, not PostgreSQL, independent review or acceptance evidence.

`CommercialIntegrityV3Repository.readFamily/read/review` accept a genuine verified
tenant context, authenticated membership/user references, practice digest and job
on each call. They verify the persisted session's current owner, identity, expiry,
revocation and immutable ownership/adoption CTE before source access or replay.
Identifiers are normalized to lower-case before comparison. No tenant context is
reconstructed, cached or stored in the repository. Unsupported environment fails
before business access. Known v1 remains routed to v1; v3 read/review refuse v1.
The family projection reads only saved marker, provenance, job/activation/terms
policy and commercial track/environment, with no journal counts or cap heuristic.
Unknown, contradictory and contractor bindings fail closed. Imported v3 stays
`INTEGRITY_FAMILY_UNAVAILABLE` (CI-H7); known v1 imports remain v1.

## Activated source contract

The only activated rule is CI-F05 `invoice_or_payment_without_lock`. The ordinary
adapter reads immutable `app.customer_invoice` and `app.customer_payment` events
for the exact authorized tenant/job, plus ordinary `app.final_account_lock`
presence. A payment is `builder_attested`, never settlement proof. Reversal does
not erase the fact that payment activity occurred; no comparison of money is made.
Sources use original server `created_at`, six UTC fractional digits, row UUID,
revision `1` and SHA-256 of these exact UTF-8 identity strings:

- Invoice: `id:source_hash:pdf_sha256`.
- Payment: `id:invoice_id:amount_pence` (integer decimal).

The source namespace is `customer_invoice` or `customer_payment`; scope is the
already-authenticated opaque practice digest. No free text or media enters a
source identity or audit payload. The profile is
`synthetic_fixture.persisted-activity.v3`, rule `persisted-activity.1`; its anchored
window starts at job creation and ends at the maximum of creation and ordinary
activity server timestamps. It does not advance with a read clock. A new relevant
activity changes that horizon; a later unchanged read preserves finding/snapshot
identity. No delay, repetition count, allocation or quote endpoint is defaulted.
All source facts are validated by the accepted CH6-C strict schema/evaluator.
Arrays in the snapshot have CH6-C canonical set semantics. The enabled snapshot
has only fixed ASCII keys and ASCII source identities, so SQL C collation agrees
with CH6-C UTF-16 ordering for this subset. Generic Unicode snapshot support is not
claimed. PostgreSQL jsonb text is never used as the snapshot canonical encoding.

There is no hidden-table read, view, count, cache, role switch or signal-conditioned
branch on the pre-lock graph. Lock presence uses ordinary data. `evaluatedAt` is
the precise current server time returned for display, excluded from fingerprints.
For isolation comparisons, only that independently advancing public clock is
normalized; all other response bytes and executed SQL must match zero/many signals.
HTTP no-store headers belong to the separately issued CH6-A transport layer.

## Held ports and missing source contracts

Accepted SV-5 head 7e139e0b325c020c07e69867ef12fcfe191d5528 has
`FinalCheckRepository.read(context,jobId,digest)` calling
`app.read_final_check_reveal(uuid,uuid,text)`. Neither is installed at this build
base. Its `FinalCheckView` exposes loose `items: record[]`, not yet the exact
CH6-C completed-evidence, catch-line and consistent financial-basis DTO. The
`readCommercialIntegrityV3PublishedOutcomes` port is always typed unavailable
CI-H1, based solely on the ordinary lock/check state. No dependency is imported
from an unmerged worktree, no private signal table is queried, and no empty list
is presented as a successful published outcome. Pending, failed and completed
ordinary checks all retain that hold until a concrete accepted binding exists.

Ordinary quote/activation and lifecycle projections are not enabled in this leaf:
CI-H2 ordinary source-owner handoff and CI-H3 bounded profile remain explicit.
This adapter does not substitute MON-1 supplied fixtures, guess policy, or expose
empty input arrays as proof those events never occurred. CI-H4 identifier source
is absent; no phone/card ingestion or cross-account lookup. CI-H5 exact catch
credit/write-off/normalization source remains unavailable. These are availability
holds on required paths; aggregate CH-6 is incomplete. Pure CH6-C rule fixtures
are distinct from persisted source acceptance. CH6-B's transitive architecture
scanner remains a merge dependency; local checks cover current direct authority
consumers and persistence writes, not every possible dynamic import.

## Review and durability

The narrow CH6-C review schema admits version, command ID, finding key, snapshot
hash, `dismissed_false_positive` and trimmed explanation. Actor/job/tenant/session,
server time and source snapshot are independently derived. Unknown fields fail.
New review finds the current matching evaluator result and hashes
`canonicalCommercialIntegritySnapshot`; it never forwards caller source JSON.
The SQL writer reconstructs and compares the entire supported snapshot under
source locks. Unsupported rule snapshots fail `INTEGRITY_SOURCE_UNAVAILABLE`.
Changed source/key/hash/profile/window fails `INTEGRITY_SOURCE_CHANGED`.

A succeeded receipt stores the exact first result, actor, session, identity and
server time, with command kind `commercial_integrity.review.v3`, semantic key
`jobId:commandId`, and canonical request hash over job, actor, user, digest and
strict review. Exact replay reauthenticates before returning the original result,
including after facts change. Type/actor/job/session/payload conflicts fail
`IDEMPOTENCY_CONFLICT`. Concurrent duplicates serialize on tenant+command and
produce one receipt/audit. The SQL writer repeats family and current authority
checks, including after blocking waits and after the final audit lock.

Migration 0227 grants runtime EXECUTE only on
`app.ch6_record_integrity_review(uuid,uuid,text,jsonb,jsonb)`. Six private helpers
have no runtime/PUBLIC/shadow/infrastructure EXECUTE; all seven have migration
ownership and fixed search path. The new-kind guard is SECURITY INVOKER and uses
actual `current_user`, never a caller GUC. It refuses runtime INSERT, mutation,
conversion and deletion of v3 receipts; inherited runtime TRUNCATE/DELETE denials
remain. Privileged destructive database compromise is outside this trust boundary.
No authoritative commercial state consumes review results. No Decision, journal,
fee, meter, invoice state, eligibility, entitlement or outbox action is produced.

Shared exports/catalogue/route registration are coordinator work listed in the
builder receipt. The module currently consumes CH6-C's compiled public module;
core must build first until the coordinator adds the shared exports and changes
the import to `@jobguard/core`. That integration is a clean-install typecheck hold.
