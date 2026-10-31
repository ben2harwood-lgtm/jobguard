# 0328 — CH-5 part 2 (RED)

Synthetic only. Company v3 live imports now execute the existing checked writer
and `ch4_admit_place` under the tenant capacity serializer in one command
transaction. The original invoiced writer signature is retained for compatibility;
its live result envelope is internal, and its public immutable result is unchanged.
The replacement retains main's transaction-bound LP-2 adoption permit, matched
to the exact inserted draft shape, and MON-1's immediate upgrade/track-review
Decisions. Existing main migrations are unchanged; the router renumbers this
built-ahead migration when opening the PR.

MON-1's committed ledger classifies legacy imports from their immutable baseline,
recorded receive time and party binding, and v3 imports from their stored adoption
snapshot and revision-one binding. Historical attestation never backdates the
start anchor. Invoiced imports contribute zero. Missing authenticated baseline
facts remain unavailable. Existing grouping, small allowances and the Solo grace
limit apply; Builder stays unblocked and its admission audit records
`track_review_due` after its thirteenth chargeable place. The existing admission
audit also binds the immutable meter-source hash. Replays retain their first IDs
and do not reopen closed work or reserve capacity again.

The new owner-only company identity bridge delegates to `mon1_company_actor`;
it releases no business data. RLS, table grants and existing protected routine
fingerprints are preserved. A deferred record guard requires the exact persisted
import, successful command result and adoption audit for cap-free v3 imports,
including when a caller sets the import GUC itself. Legacy v1 cap/terms remain.

No historical rows are rewritten. No allocations, charges, refunds, fee postings,
issued periods or locked-bill references are changed. The counted-day/period
source reader still refuses imported sources: this migration implements committed
admission, not a second billing projector. An unavailable bill is never zero or a
free import period. Approved monthly maxima remain unchanged.

The company screen is `/meter/jobs/:id/imports`; it uses the existing meter
identity, tenant membership, origin and CSRF bridge. Shared practice live imports
remain unavailable; shared practice invoiced imports keep their existing path.
The source binding endpoint authorizes before returning a binding identity.

SV-6 is absent. The persisted-import catch step always refuses with
`ATTRIBUTION_UNAVAILABLE` and a plain reason after fresh ownership and exact
baseline checks. It never reads hidden candidates or locks, and never creates a
catch, assessment, allocation or fee. Pre-adoption exclusion wording is a rule,
not a fabricated persisted £0 assessment. Historical uploads and imported final
account assembly remain unavailable.

Fresh-install, predecessor-upgrade/replay, real admission, rollback, tenant,
GUC bypass, closed-job replay and locked-job tests are committed for PostgreSQL
CI. The browser test exercises the real company import, reload and catch refusal.
Neither suite can run in this sandbox. Local commands and results belong to the
router's commit/PR description. RED independent review and green CI remain gates.

Forward-fix strategy: retain immutable imports and their audit/source bindings;
repair the checked routines in a subsequent migration. Do not remove persisted
imports, rewrite prior commercial terms or replay them as newly adopted jobs.
