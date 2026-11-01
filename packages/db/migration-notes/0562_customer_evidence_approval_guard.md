# 0562 — SV-5 customer evidence approval guard (RED)

Adds an invoker trigger on variation_approval INSERT, enforcing the repository's
same tenant/job, original, server-verified and non-invalidated evidence predicate
for customer_evidence. RLS and grants are unchanged. The trigger has a pinned
search path and no public function privilege. MON-5's 0502 authenticated-customer
provenance trigger remains unchanged; the fetched LP-5b writers branch contains
no customer_evidence database predicate, so it does not close this gap.

Customer evidence remains no stronger than builder attestation. A site photo
can satisfy this object-integrity gate; it does not establish a written yes.
Dedicated written-approval types and live commercial approval remain external
gates. No fee, attribution or customer-authentication policy changes.

No backfill: historical immutable approvals are preserved even if their evidence
would fail the new insertion gate. Evidence invalidation remains an append-only
fact; this guard does not rewrite historical approvals after later invalidation.
Forward-fix with a later migration if needed; do not remove historical facts.
No new operational alerts, providers or real data.

Tests cover populated predecessor upgrade, migration replay, direct runtime
cross-job/preview/pending-upload/missing/null/invalidated refusals, valid original
acceptance, unchanged builder attestation and forged authenticated refusal.
Unverified objects cannot be inserted under the existing NOT NULL constraint;
the pending-upload test exercises the actual unverified lifecycle.
PostgreSQL suites and exact-head independent RED review remain required in CI.
Local checks and results are recorded in the router commit message.
