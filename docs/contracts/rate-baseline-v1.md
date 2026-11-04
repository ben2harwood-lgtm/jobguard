# M5-6 dark recent-rate baseline v1

This implements only the deterministic, synthetic portion permitted by BUILD_PLAN §12.4.
The pure core module is exported from the core barrel. The dark stored reader and acceptance
repository described below add migration 0762; neither is connected to a route, screen, provider
or scheduler. No merchant adapter is required for this synthetic foundation.
M5-5 remains unbuilt; this work does not satisfy or bypass its real integration dependency.
G0–G5 are unchanged and no release approval is implied.

The versioned observation input maps immutable rate-book columns to camel-case fields.
`kind` distinguishes credits in future synthetic ingestion; existing quote observations are
net-principal `rate` records. `category` is the explicit comparison context; no semantic
matching or inferred context is attempted. Source revision, scope identity, job, observation,
effective time and entered/accepted provenance accompany every retained sample. The caller
must supply verified human-confirmed immutable source records; this pure module cannot prove
that a source exists or that a human confirmed it.

Normalization trims/lowercases labels and resolves a small explicit unit alias list.
Tax treatments are separate strata, never inferred or converted from gross amounts.
Packs require a base unit and a positive decimal size (up to six places). Exact bigint
arithmetic converts pack principal to base-unit pence, rounding half-even once. Pack size
changes retain their original sizes in provenance. Unknown units/tax, absent context,
credits and incomparable strata have named exclusions. Conflicting replay identities fail;
identical source revision replays count once. Every supplied tenant is checked before filtering.
Cross-tenant learning is disabled.

The reference baseline takes at most ten latest comparable observations within 180 days
of an explicit caller-supplied cutoff. It excludes values outside three times the median
(or below one third), with named reasons, only when at least three samples exist. This
simple heuristic is not an anomaly model and may miss clustered bad data. After exclusions,
fewer than three samples means unknown, with no suggested rate. Otherwise the rate is the
median, with exact half-even rounding of even-sized medians. Spread is the observed min/max,
not a confidence interval. Drift requires at least six retained samples: compare median
rates in the newer and older halves, flagging a change above 20% of the older median.
These constants are a versioned descriptive reference, not calibrated production thresholds.

The evaluator takes training observations, a fixed candidate estimate and strictly later
held-out observations. Training identities cannot appear in holdout. Both estimates are
scored on the same comparable held-out records, with replay/credit exclusions; extreme
held-out prices stay in the score. It reports training, total holdout, comparable and evaluated
counts, half-even rounded mean absolute errors and observed error ranges. Sparse training
or no comparable holdout returns unknown. The error ranges do not express statistical
confidence. Candidate selection before seeing the holdout is the evaluator caller's duty;
this function cannot establish experimental independence.

Acceptance returns a new-revision **proposal**, bound to a tenant, current/new revision,
scope identity, actor and exact suggested amount. It copies source provenance without
mutating the suggestion or any commercial record. It is not authorization or persistence.
The dark authenticated command below checks membership, exact intent and current revision
and records a separate immutable acceptance observation. It does not promote commercial scope. No accepted quote,
agreed rate, invoice or cap is updated here.

Still open for people: real held-out evaluation; any model beyond this baseline; any screen;
the real M5-5 merchant adapter; any cross-tenant privacy/commercial decision and design review;
and wiring to a live route with authorization and persistence. Synthetic passing tests do
not close any of these requirements or mark full M5-6 complete.

## Dark stored observations and human acceptance (0762)

`RateSuggestionRepository.read(context, query)` reads only the context tenant's immutable
`rate_book_observation` rows, joined by tenant/job/item/source revision to confirmed scope.
A source must match its revision's unit and principal rate. Untraceable rows are named
`untraced_source` exclusions. Conflicting observations of one revision are all excluded as
`conflicting_source_revision`; identical replays retain the core's named duplicate exclusion.
Unit/tax/context/window/outlier exclusions remain descriptive, with sparse samples unknown.
The baseline hash binds the policy version, normalized query and complete ordered stored source snapshot,
including excluded rows. It is a freshness binding, not evidence authenticity.

`accept(context, actor, raw)` accepts a strict versioned command with no tenant, actor or
activation flag. The actor argument carries a human session digest, never an actor identity;
the one write routine derives an active owner from the existing persisted session/SSO verifier.
Only synthetic small-builder jobs are permitted. One tenant advisory lock serializes accepts;
SQL independently verifies the bounded median/outlier policy, source IDs, snapshot hash and
latest target revision. One target revision can be accepted once. Command replay returns its
original record even after new observations; changed intent or actor conflicts. The transaction
also invokes the pure acceptance proposal and seals a checked audit event with references/hashes.
No new role or direct table grant is added.

The append-only FORCE-RLS `rate_suggestion_acceptance` row is a separate accepted observation
with `suggestion_accepted` provenance, previous scope revision, exact pence/stratum/policy,
source observation IDs, baseline hash, session-derived actor, command/request/record hashes
and `synthetic_demo` label. The immutable observation IDs retain the source revision links.
It never feeds the baseline. It is not a new commercial scope revision and cannot change
quotes, quote lines, rate-book observations, material/agreed rates, invoices or cap snapshots.
PostgreSQL CI must verify these boundaries; local SQL transport tests do not prove them.

M5-6 remains open: real held-out evaluation, later drift models, recurring-extra suggestions,
merchant scoring, M5-5's real adapter and all applicable release gates remain held. There is
no HTTP route, screen, worker, application composition, merchant data or cross-tenant learning.
