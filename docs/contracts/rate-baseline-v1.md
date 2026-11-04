# M5-6 dark recent-rate baseline v1

This implements only the deterministic, synthetic portion permitted by BUILD_PLAN §12.4.
It is not exported from the core barrel or connected to a route, screen, database reader,
writer, provider or scheduler. It needs no migration and does not need a merchant adapter.
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
A future authenticated human command must check membership, exact intent and current
revision and atomically create the new immutable revision/observation. No accepted quote,
agreed rate, invoice or cap is updated here.

Still open for people: real held-out evaluation; any model beyond this baseline; any screen;
the real M5-5 merchant adapter; any cross-tenant privacy/commercial decision and design review;
and wiring to a live route with authorization and persistence. Synthetic passing tests do
not close any of these requirements or mark full M5-6 complete.

## Recurring extras: synthetic read only

A separate session-only owner read and practice page now group this company's current
approved variation revisions by exact description and unit (trim, lowercase, collapse
spaces; no aliases or semantic matching). Withdrawals and unapproved revisions are excluded.
At least three distinct jobs with approvals in the reference policy's 180-day server-clock
window are required; sparse results say “not enough to say” and carry no rate. Each variation
counts once; distinct jobs establish eligibility, while all qualifying variation observations
contribute to the observed low/high and half-even median. Source variation, job, revision and
observation IDs accompany the range, which is not a confidence interval. Existing runtime
SELECT grants and tenant RLS apply; the transaction is read only. No request tenant, actor or
cutoff, acceptance control, commercial write, migration or live capability is introduced.
Real evaluation, human acceptance, dependencies and G0–G5 remain held; M5-6 stays open.
