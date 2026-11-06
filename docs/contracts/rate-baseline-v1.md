# M5-6 dark recent-rate baseline v1

This implements only the deterministic, synthetic portion permitted by BUILD_PLAN §12.4.
The pure core module is exported from the core barrel. The dark stored reader and acceptance
repository described below add migration 0609; the synthetic session route and screen below expose only stored suggestions and acceptances.
No provider or scheduler is connected. No merchant adapter is required for this synthetic foundation.
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

Still open for people: real held-out evaluation; any model beyond this baseline;
the real M5-5 merchant adapter; any cross-tenant privacy/commercial decision and design review;
and activation of any live route. Synthetic passing tests do
not close any of these requirements or mark full M5-6 complete.

## Synthetic merchant delivery record (partial M5-6)

A separate read-only practice projection now uses migration `0618_merchant_delivery_record_read`'s checked routine,
with the dunning owner/admin session check and synthetic database refusal. Each
order's latest receipt counts once across the session's single tenant; the URL job
must belong to it. Exact supplier_context values remain separate. Held or quarantined
latest documents do not count and never fall back to a previous ready revision.
The first ready receipt's short quantity and a larger latest delivered quantity
identify orders with more added later. Counts are descriptive, never a rank or score;
fewer than three orders says "not enough to say". Sessions with multiple memberships
are refused rather than guessing a tenant; requests cannot supply tenant or actor.
No price, order, delivery, debt or account is changed. No provider, cross-tenant
learning, alert, evaluation claim or live release is added. M5-5 and real evaluation
remain held; this does not finish M5-6. Before this implementation the new pure import,
route and SQL routine did not exist, so these new assertions fail by source reasoning;
database and browser failing-first execution was unavailable in the sandbox.

## Dark stored observations and human acceptance (0609)

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
no live HTTP surface, worker, merchant data or cross-tenant learning.

## Synthetic session screen and retained read (0610)

The practice page `/jobs/[id]/rate-suggestions` and session-only GET/POST
`/api/jobs/[id]/rate-suggestions` are refused outside `synthetic_demo`. The
sole current session membership selects the company; ambiguous sessions fail
closed. No request tenant, actor or session selector is accepted. POST requires
a trusted browser origin. All responses use no-store. The checked history read
requires the existing persisted small-builder owner authority covering this job,
before baseline data is read or an acceptance is attempted.

`readAcceptances(context, actor, jobId)` calls the sole read-only checked routine
added by 0610. No table grants, roles, write routines or stored formats change.
It returns actor membership ID (the stable who), server time, record/baseline
hashes, target revision and immutable source observation/revision provenance.
The client displays server counts, observed spread and policy; sparse data says
not enough to say. Comparison fields and target item/revision IDs are explicit
practice inputs; the server verifies the exact target and suggestion. The client
retains the exact serialized command in session storage across uncertain retries
and reloads, and clears it only on success or a definite refusal. Acceptance
remains a separate observation; quote, quote-line, rate-book, agreed-rate, invoice
and cap rows remain unchanged. No accepted observation feeds the baseline.

PostgreSQL integration and catalog/upgrade suites plus the headless browser
reload journey must run in CI; local transport/unit tests do not establish those
guarantees. Exact-head independent RED review is still required. This does not
finish M5-6; drift, recurring extras, merchant scoring, M5-5 and G0–G5 stay held.

The synthetic rate-acceptance command is outside the LP-5 dispatch lifecycle.
Its dedicated routine owns authorization, idempotency and checked audit sealing;
LP-5 lifecycle dispatch remains held for this command. Registry classification
does not imply lifecycle execution or production readiness.
