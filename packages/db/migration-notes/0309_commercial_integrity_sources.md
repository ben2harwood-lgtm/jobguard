# 0309 — CH-6 synthetic advisory source projections (RED)

Adds two owner-only immutable synthetic source tables, four private/source
routines (only `ch6_integrity_sources(uuid,uuid,text)` is executable by runtime),
and replaces the existing source-fingerprint validator and checked feedback
writer in place. No financial, meter, fee, entitlement or account-status record
is written. Existing receipt hashes and original replay results are retained.

Sources are exact owned quote documents/party bindings, server lifecycle events,
ordinary invoice/payment activity, and an exact completed Final Check publication
for the one immutable lock. An unlocked call never invokes the publication port.
Runtime receives no grants on either new table, any hidden table, or the private
publication/validation helpers. RLS is enabled and forced on the new tenant/job
source tables; the only policy is for the migration owner. LP-0 and SERIOUS-B5
register the new objects; PostgreSQL catalogue/upgrade checks run in CI.

Identifier assertions contain only opaque SHA-256 subject references and named
synthetic fixture authority, scope, sharing and expiry. No raw phone/card or
cross-tenant matching service is added. Same-current-user/same-tenant membership
reuse is minimized to an opaque assertion. Line corrections require an exact
invoice/line/lock, a real saved synthetic credit note or verified original
`writeoff_record` evidence, and a bounded amount. The insert guard serializes on
the job and conserves both credit and original line capacity. These are synthetic
advisory source records, never legal debt adjustments or qualifying fee evidence.
Only the owner loads these fixtures; no new runtime writer is granted.

Explicit refusals: imported-v3 family until immutable adoption routing exists;
unpublished/failed/unauthorized Final Check results; absent phone/card and line
correction assertions; unallocated whole-invoice credits; unknown monetary basis;
the explicit allocation source port while the installed upstream source
handoff refuses all saves. Quarantined 0258 rows are not read or promoted; this
refusal is independent of SV-6. The pure detector retains exact fractional/amount
and reversal protections for a later accepted source contract. None falls back to hidden rows or guessed money. The
reference profile uses the existing pure synthetic fixture parameters and is
labelled `synthetic_fixture.persisted-v3.1`, never a production D11 approval.

No backfill or mutation of existing business rows. New tables start empty.
Forward fix: add a later migration to correct a source reader or close its EXECUTE
grant; preserve all existing source and review rows. There is no destructive down
migration. Reverting application code alone must keep the read boundary closed
rather than using a legacy v1 view for v3. Production/provider/real-data release
remains outside this synthetic change.

Source hashes normalize timestamp fields to UTC; completion object-version IDs
outside the existing bounded ASCII canonical subset refuse that evidence source.
Line-source inserts and new feedback validation require READ COMMITTED (40001
retry otherwise); historical receipt replay still precedes recomputation. The
insert guard takes its job lock before the fresh aggregate capacity check. The
feedback writer keeps its existing membership row locks rather than adding a
membership table lock that could invert revocation lock order.

Review locking follow-up (0309 is still unpublished): the feedback writer now
uses tenant/job-qualified `FOR SHARE` row locks, with deterministic key order,
instead of table-wide SHARE locks. Order is session, membership, command advisory,
owned session jobs by UUID, then the source tables in the explicit SQL order,
receipt and audit head. Related-quote rows are limited to those owned session
jobs; evidence invalidations are joined back to this job's evidence. Other
companies and unrelated sessions keep writing while a review transaction is open.

The source readers and fingerprint are STABLE: the fingerprint statement after
all source-lock waits gets one fresh READ COMMITTED snapshot for its CH-6 fact
queries, aggregates and absence predicates. Row locks retain existing facts;
insert gaps are not locked. A review records the exact coherent source snapshot
at validation, rather than claiming to exclude every later insert. Family and
wall-clock authority are rechecked after waits; no business locks follow audit.
Exact receipt replay remains ahead of source locking/recomputation.

Real supplementary catch lines resolve their priced `variation_revision` back
to the immutable origin variation; legacy owner-loaded variation-ID fixtures
remain readable. Ambiguous multiple invoiced lines still refuse exact attribution.
The published-path regression confirms/prices/approves a catch, assembles a real
descendant account revision and issues final and supplementary invoices through
the checked runtime repository, with every trigger and FK enabled. Its exact-line
writeoff review cites the supplementary line and the original lock. No replication
role override is used in that test. PostgreSQL execution is deferred to CI.
