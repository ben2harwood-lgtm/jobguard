# 0317 — advisory free-first-job eligibility

Issued MON-3C-ELIG, built ahead on B `1f73a07c13591e3ae5e479f1c87b337b0f1356ce`.
DEPENDENCY-BOUND until B is accepted and merged. Synthetic only.

Adds only `app.mon3_read_eligibility(uuid,text,uuid)`, owned by
`jobguard_migration`, SECURITY DEFINER, search_path=pg_catalog. EXECUTE only
for runtime and owner. Inherited default grants are removed. Existing business
relations retain FORCE RLS and their current grants/policies. No tables, backfill,
external action, command receipt, audit event, trial admission, key claim or
financial effect is created. 0206 and its hard refusal remain unchanged.

The routine renews B's persisted session/SSO/current-owner check before lookup
and before disclosure. Shared-practice targets and unknown/foreign targets use
the same denial. There is no accepted practice-reader seam in this leaf.
Missing pre-activation track is unavailable/ineligible; accepted status does not
prove provenance. Exact quote version/hash, latest acceptance, current party
snapshot, import/activation/close/reopen/lock history and B's same-business
completed card are inspected. Terms are opaque existing monthly agreement IDs.

A has global unique keys but FORCE RLS permits only tenant-local reads. B has
no checked global read helper. Every available local tuple is checked with A's
exact tuple bytes; global clearance is always `KEY_CHECK_UNAVAILABLE`. The reader
never claims a key to probe uniqueness or broadens A's privileges. Consequently
no response claims eligible entitlement. `offerSkip` is an offer only, requiring
an exact fresh target and sufficient company identity; phone alone never suffices.
A missing terms or key result remains held. Future admission MUST re-read under
its own locks; no response authorizes activation.

Install is transactional: rollback on failure. Once installed, fix forward with
an additive migration preserving original immutable facts. No data rollback,
key reset, historical rewrite, or production enablement. Own-step upgrade tests
capture populated predecessor named columns/types/PK values and routine ACLs,
then apply this migration alone and successors twice. Mutation/damage controls
are in the owned tests; real PostgreSQL/catalog proof is CI-only and NOT RUN here.

28 Oct MON-3 continuation: this reserved migration now also composes END/CONV/WIRE.
0316's SQL is unchanged. No additional migration number is claimed.

Adds owner-only, FORCE-RLS `trial_start`, `trial_end_source` and
`trial_subscription_source`, a unique first admission per company, and checked
company-owner lifecycle/card/activation entrypoints. Source-table triggers bind
starts and ends to immutable activation, lock and close facts; GET never writes.
No old trial/activation/statement rows are backfilled. Existing B admission stays
closed; its callers do not silently gain authority. Registered trial companies
cannot use an older activation facade to avoid admission.

The existing subscription source and issue routines retain their signatures and
grants. Issuance pins accepted source/terms/trial days, suppresses base AND extras
on free days and uses the existing exact arithmetic. Prior issued statements are
not rewritten. Lock/close day is free; second activation and the exclusive London
midnight deadline convert on that date. Initial stub days before trial start are
free; the original anchor remains. Missing accepted monthly terms, wholly
pre-trial/future periods, corrections and changed conversion boundaries fail
closed for affected charging. Plan-change authorization stays independent of
card-on-file; positive simulated collections require a card and current sources.

The capacity prerequisite on this checkout still raises
`CAPACITY_ADMISSION_UNAVAILABLE`. New activation preserves that clean refusal.
A test-only capacity substitute exercises the rest of the real checked command;
it is not installed by this migration or claimed as capacity proof. Shared
practice authority, unverified business identities, imports and legacy trial
conversion remain refused. All identities and cards are fictional.

Forward-fix strategy: preserve immutable source and statement rows; ship a new
reviewed migration for any correction. Do not roll back by dropping tables or
reopening the legacy denial boundary. PostgreSQL fresh/upgrade/catalogue,
concurrency and browser suites run in CI; they are not locally verified here.
