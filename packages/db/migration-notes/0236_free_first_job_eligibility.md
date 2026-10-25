# 0236 — advisory free-first-job eligibility

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
