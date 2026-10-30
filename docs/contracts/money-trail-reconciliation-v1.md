# M4-17-S money trail: reference comparison and availability v1

24 October 2026. **Server portion only, Q2 review portion held. Full server task
and the complete plan card remain INCOMPLETE.** Decision 74 permits preparation
on accepted partial M4-12-S `b3b322aa`; acceptance of a partial prerequisite does
not supply missing financial authority or source contracts.

## Actual prerequisite map

- UIWIRE-12: `PracticeInvoiceRepository` and immutable invoice/payment/reversal
  facts exist. Its clamped display balance is not reconciliation arithmetic.
- M4-8-S: `RecoveryAllocationRepository` and migration 0136 own persisted
  receipt-line/case allocation and reversal. This piece adds no allocator and
  neither edits those tables nor claims to verify their source-backed facts.
- SV-6: migration 0213 stores attribution history, but
  `app.assess_recovery_attribution(uuid,text,jsonb)` refuses dependency-bound.
  Private storage documents cannot establish the §10.2.8 source predicate.
  SV-5's authoritative completed source chain remains dependency-bound.
- M4-9-S: migration 0218 has `read_success_fee_v3(uuid,text)` and
  `write_success_fee_v3(uuid,text,jsonb,jsonb)`. The writer always refuses.
  There are no authoritative v3 posted derivations/compensations to reconcile.
- M4-10-S: `simulationFeeStatementDocumentV1` is a pure document representation,
  with settlement history `integration_unavailable`. No issued immutable v3
  statement/correction/family-balance contract exists.
- M4-12-S: `projectFeeCollectionReference` and the API fake-event validator are
  supplied-data arithmetic/validation, not durable attempts, settlements or
  refunds. Its reserved 0220 migration is intentionally absent.
- MON-2A-P: migration 0195, `SubscriptionRepository`, `mon2_read(uuid,text)` and
  its simulated executor provide company subscription facts. Shared-practice
  company summaries remain refused. No unsafe job/practice adapter is guessed.

No approved authority contract exists to invoke a new money-trail run. Q2's
proposed owner-specific permission is unanswered. Accordingly no run command,
run writer, run persistence, run/review route, watchdog classification, approval
or OpenAPI operation is created. The source-backed adapter and full fixture
cannot be built by replacing these missing records with v1 ledgers, subscription
statements, owner-seeded money, supplied flags, model output or private SV-6 rows.

## Independent pure reference comparison

`reconcileMoneyTrailReference(unknown)` accepts strict
`money-trail-reference.v1` supplied synthetic data only. This is a reference
analysis function, not an HTTP command or database report. The required family
names are customer, allocations, eligibility, fee_postings, fee_statements,
fee_events and subscription. Availability and the `reference.v1` source version
are supplied assertions; they do not verify an adapter or qualify principal.
Missing/read-failed/unsupported/absent families produce `SOURCE_UNAVAILABLE` and
`Review needed`; they cannot produce a complete, zero-difference result.

Facts have bounded source identity/revision/hash, named kind, exact numerator/
denominator pence and an explicit company period for subscription facts only.
Duplicate fact or family identities are invalid. Eligible net accepts exact
nonnegative fractions; other amounts are whole pence. Posted fee principal may
be signed to represent supplied compensation facts. Their existence or validity
is not inferred. All individual, aggregate and signed difference amounts are
bounded by the existing Money limit. Invalid input/overflow raises the redacted
`MoneyTrailError: INVALID_MONEY_TRAIL_REFERENCE`.

Customer balance is invoices − credits − receipts + receipt reversals.
Negative balances remain signed and generate a specific overpayment difference.
Expected fee principal uses the existing cumulative half-even kernel at 1/10
of supplied cumulative Q, with J=0 to calculate expected cumulative F only.
It compares F with the signed supplied posted total. It does not derive Q,
post F−J, select a compensation or allocate any receipt. No VAT calculation,
minimum, cap, base, credit, subscription offset or tolerance is added.

Subscription charges/settlements have separate balances and source identities.
Each explicit company period is compared independently, so opposite period
errors cannot cancel. No period cost is allocated to a job. F23's supplied
£69 subscription and £80 fee remain separate. A legitimate unpaid fee does
not become a fabricated settlement merely because it has been posted.

Reference collection/refund observations contain event/effect/source identities,
positive GBP principal, state, explicit original collection for refunds and
explicit checkpoint/predecessor observations. Only settled, nonambiguous,
source-bound observations enter settlement totals. Identical same-ID delivery
replay is deduplicated; changed same-ID content refuses. Different unresolved
observations of one movement are reported together and excluded from cash,
never counted twice. An invalid/missing fee-posting source is an orphan.
Refunds require an explicitly named settled nonblocked collection and cannot
exceed that original's principal across all supplied settled refunds; the whole
inconsistent original group is excluded and reported. No original selection,
splitting, waterfall, execution or durable deduplication contract is invented.
Pending/accepted/unknown never mean settled. Unknown and unsettled observations
remain specific differences on recomputation. Both late cases (after the bound
checkpoint, awaiting a causal predecessor) get distinct codes without any new
deadline, grace period or tolerance. Awaiting-predecessor cash is excluded.
This reference interpretation does not authenticate fake events or replace
M4-12-S's future durable accepted-replay/event-transition contract.

Results always say `referenceOnly: true`,
`authoritativeSourceVerification: false`, `productionEnabled: false`,
`realExternalActions: 0`. The simulation match label can describe supplied
reference data only. It is not an authoritative stored run, verified source
manifest or completion of MT-01/MT-02. No run UUID, actor or execution time is
accepted. Difference rows have named book, code, exact affected source IDs,
expected/observed/signed difference where meaningful and a reproducible hash;
nonmonetary anomalies carry null amounts. Inputs are parsed/copied and unchanged.

Hash encoding uses existing pure SHA-256, UTF-8, domain tag then newline then
canonical JSON. Absent optional object fields are omitted; object keys sort by code point; fact/event/family arrays sort
by identity; periods/source refs sort and deduplicate; differences sort by
hash. Exact fractions reduce before hashing. Tags are
`money-trail-source.v1`, `money-trail-difference.v1` and
`money-trail-report.v1`. Source hash binds the entire normalized supplied
snapshot including tenant/job, availability, revisions, classification and
amounts. Report hash binds source hash and the economic result. Same-ID exact
replay and query order do not change it; changed relevant facts do. Hashes
prove deterministic reference encoding, not source authenticity or live funds.

## Checked read-only availability boundary (0310 / C262)

`MoneyTrailRepository.availability(context, jobId, digest)` passes the existing
stamped context whole through `practiceMaterialPool` and `withTenant`, with
parameterized transaction-local tenant/session context. It calls only
`app.read_money_trail_availability(uuid,text)` and validates the strict
`money-trail-availability.v1` response and exact requested job binding.
No transport is installed. No client authority or financial result is accepted.

The routine delegates the existing accepted `read_success_fee_v3` check:
synthetic database, valid tenant, persisted current practice session, active
unexpired current owner, exact session-owned small-builder synthetic job and
v3 policy. This reuses existing read scope for constant dependency metadata;
it grants no new permission to request a run. It reads no shadow, eligibility,
allocation, invoice, subscription or fee source. It returns dependency status
only, never balances, counts, hashes or an empty completed report.

0310 creates exactly this migration-owned SECURITY DEFINER function with fixed
`search_path=pg_catalog`. Runtime receives EXECUTE on this signature only;
PUBLIC/infrastructure/shadow get none. No tables, table grants, policies,
existing routines or roles change. There is no new table requiring FORCE RLS,
tenancy or contractor table inventory rows. LP-0 has exactly two new ACL/owner
keys, one routine protection record and appended authority-path evidence;
serious-B5 has exactly one new routine identity. No freeze is loosened.
RLS still assumes correctly authenticated tenant context and cannot protect
against stolen privileged credentials. Source-inspected SQL and scripted pool
tests are not PostgreSQL execution proof.

Forward fix by reviewed additive migration when accepted source and authority
contracts exist; never enable money operations by merely deleting a refusal.
No backfill, migration of economic facts or new operational alert. A run's
future command receipt, source snapshot, source-change refusal, audit atomicity,
replay/races and immutable relational validation remain unbuilt as a whole.

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

## Independent reading of available sources

`MoneyTrailRepository.availableSources(context, jobId, digest)` uses the same
accepted access check inside one tenant transaction, then reads all supported
customer/M4-8-S facts in a **single SQL statement snapshot** through existing
runtime SELECT grants and RLS. The table/expression list is a closed server
constant, never an argument. Every branch explicitly filters tenant and job;
each returned row is independently bound to both identities and validated
against a strict kind-specific shape. Unsupported/corrupt shapes, excessive
rows or out-of-bound exact amounts refuse; nothing is silently truncated.
No source table/privilege/routine is changed by this reader.

The ten named projections are `customer_invoice`, `customer_credit_note`,
`customer_payment`, `customer_payment_reversal`, `recovery_allocation_review`,
`recovery_allocation_line_source`, `recovery_case_allocation`,
`recovery_case_allocation_reversal`, `receipt_line_allocation` and
`recovery_allocation_command`. They preserve document/source identities,
stored gross/net/tax values, original allocation rule/source, exact numerator/
denominator, reversal/original linkage, review/authorization, evidence version/
hash and settled movement references where present. No customer description,
reason, recipient, transcript, PDF bytes, approval artifact, raw command payload
or feed ownership-claiming read is used. Customer invoice/credit/receipt amounts
are gross; fee and subscription principal in the separate reference comparison
are net/principal. Internal raw column mirrors retain decimal pence strings to
avoid PostgreSQL bigint conversion loss; no new public Money representation or
transport is introduced.

The strict `money-trail-available-sources.v1` internal envelope always has
`incomplete: true`, `realExternalActions: 0` and explicitly unavailable
eligibility, fee_postings, fee_statements, fee_events and subscription families.
It carries no completion/match label, report hash, computed balance, qualified
Q or fee entitlement. These are read source rows, not a complete source manifest
or persisted reconciliation. A receipt/allocation reference alone never becomes
qualifying settlement. No automatic connection from these rows to the supplied
reference comparison is installed while the authoritative adapters are missing.
MON-2A's shared-practice refusal remains intact; no company subscription cost is
assigned to a job. The SQL availability routine itself still reads no money
sources: all source projection runs separately under the existing runtime role.

Tests cover all ten supplied row shapes, strictness, exact fractions, unchanged
inputs, ten tenant/job SQL filters, both per-row scope checks, missing authority
before source SQL, source bounds and explicit incompleteness. The PostgreSQL
suite additionally exercises the actual runtime empty-source query, preserves
all source rows and records connection-scoped query evidence. It remains NOT
RUN in this sandbox. Populated source-chain comparison, actual allocator
reversal/deposit validation and qualification remain dependency-bound; scripted
row fixtures are not authoritative monetary facts or MT-01/MT-04 completion.

## Retained holds

Q2: MT-18 in full; review assertions of MT-07/15/16. No review actor, action,
outcome, acknowledgement, dismissal, tolerance, settlement override, table,
helper, writer, route or schema. Run authority is absent, so all dependent run
assertions in MT-01/02/08/09/10/11/13/15/16/17/20 remain unbuilt. No held
positive test is replaced with privileged fixture success.

Actual source-chain reading/allocation validation and immutable run persistence,
MT-01's command-built £320/£22,176/£32/£250 fixture, no-offset integration,
event restart/race/rebuild and cold-restore proofs remain DEPENDENCY-BOUND on
the actual missing source contracts. The independent reference tests do not
close those assertions. Non-catch qualification authority and negative-
compensation execution remain unbuilt. Screens and exact plan V(...) IDs,
labels and amounts remain parked, preserving the original plan unchanged.
Real data/providers/charging/refunds/deployment/release remain outside scope.
Exact-commit different-model verdict and separate acceptance are still owed.

## M4-17 dark operational slice (29 October 2026)

`financial-reconciliation.ts` adds a production-shaped **in-memory fake seam**,
not a production money service. There is no HTTP route, provider SDK, credential,
network endpoint, database write, durable schedule or deployment. Constructors
and commands accept only `synthetic_demo`; the runner is disabled by default.
Explicit fake enablement cannot enable a production environment. Every report
remains `referenceOnly`, `authoritativeSourceVerification: false`,
`productionEnabled: false`, `realExternalActions: 0`. No new dependency or
migration is required (0458 is unused).

The strict versioned snapshot binds every invoice, journal, provider observation
and correction to one tenant/job. UUIDs and bounded integer pence are the only
source fields; free text, PII, hidden/shadow data and provider credentials are
rejected. A journal here is a supplied immutable posting observation, not a new
balanced double-entry posting routine. Invoice net/VAT/gross are supplied facts
whose arithmetic is checked; this code neither calculates nor approves tax.
Customer invoice revisions are read as historical immutable records, including
locked bills. This service cannot edit, supersede, issue or unlock those bills.
Adjustment approval binds the exact current supplied invoice revision.

Reports explain invoice net/VAT/gross and outstanding balance; gross charged;
provider refunds/fees; net payout; bank observations; clearing and payout in
transit; internal payment/refund/fee/payout observations; allocations and active
reservations. Gross payment is never inferred from a net payout or bank credit.
Payment children share the original source budget; bank observations share the
payout budget. Refunds reduce the available allocation/reservation budget;
release and allocation reversal facts restore it without editing originals.
Signed discrepancies are retained. No fee entitlement, recovery principal or
allocation is invented from these figures.

The unexplained-balance queue identifies missing/duplicate journals, duplicate
provider effects, late observations, missing/wrong/blocked predecessors, orphan
payments, overpayments, source limits, reversal errors, allocation/reservation
limits, outstanding clearing and payout awaiting bank. Invalid predecessor
chains and ambiguous duplicate effects are excluded from provider totals.
This fake models each payout as an explicit share of one payment/invoice; a
real provider batch must be decomposed into source-bound shares by its future
accepted adapter. A refund after a fully exhausted payout budget stays a
reconciliation exception; the fake does not invent funding or cross-job netting.
Late observations remain visible in the queue; no timing tolerance or automatic
acknowledgement is inferred.

`FakeFinancialReconciliationRunner` has one daily scheduling owner with a
per-day receipt, plus on-demand runs over current observations. The router or a
real scheduler is not installed. Command IDs bind exact canonical content;
exact replays return the original result, changed-content replays refuse.
Fake provider delivery accepts immutable observations, deduplicates exact
same-ID replays and refuses changed content. Missing predecessors can arrive
later, in either order; on-demand reconciliation recomputes the explanation.

Adjustments append either a journal fact or an exact duplicate-resolution fact.
The latter retains both original observations and names the duplicate and the
one retained; it cannot waive different money or chain exclusions. Old facts
remain in the source hash. A server authority interface must supply current
membership, scope, permission and exact Decision verification (including expiry,
revocation and actor/action/content binding); tests use deterministic fakes.
There is no client `approved` flag or production implementation of that seam.
An adjustment binds the whole source hash and invoice revision, refuses any
new or expanded discrepancy, and appends one hash-linked audit receipt with
only command/content hashes. Failed adjustments do not mutate state. Replay
still checks current membership/permission. In-memory deduplication and audit
are **not** durable idempotency or PostgreSQL proof.

The existing reference comparison now selects its fee terms from the bound
`policyVersion` registry, rather than embedding 1/10 in the reconciliation
calculation. Only `reference_fee_policy_v3` is supported; unknown versions and
caller-supplied rates refuse. Omission retains v1 reference compatibility by
binding v3 explicitly during parsing. Normalized source/report hashes now include
that policy binding; older reference hashes require recomputation, not reuse as
new-policy receipts. No persisted run format is changed. The shared cumulative half-even kernel
and its small-builder fixed-rate invariant remain authoritative for arithmetic.
No contractor formula or historical v1 cap/credit policy is silently substituted.

NOT built: authoritative invoice/journal/reservation/provider source adapters,
durable scheduled runs/queue/adjustments, real membership/Decision verification,
provider webhook authentication or live rails, cross-rail collection control,
financial restore/replay certification, UI, external security review and the
G4-S/G4-C evidence packs. The base source/authority holds above remain. This
slice does not complete the whole M4-17 card or release either track.

Local verification for this slice: 107 tests passed across
`financial-reconciliation.test.ts`, `money-trail-reconciliation.test.ts` and
`cumulative-fee.test.ts`, with at most two workers. Core TypeScript no-emit,
core purity, money arithmetic and commercial boundary checks passed. The seven
uncommitted paths pass the existing lane loader/path predicate. Full lane lint
against origin/main fails because this build-ahead branch inherits unmerged
M4-9-S/M4-10-S/M4-12-S/M4-17-S paths; the lane was not widened to claim those
changes. The router must preserve dependency merge order and run current-main CI.
Full workspace CI, PostgreSQL, browser suites and independent Claude RED review
were not executed here. The pnpm launcher stalled before invoking checks and
was interrupted; verification used the already-installed Vitest and TypeScript
binaries from the repository's package scripts. No package was downloaded.

## M4-17 queue persistence (0479; synthetic reference analysis only)

The `FinancialReconciliationQueueRepository` stores the existing supplied fake
snapshots and deterministic reports, plus each report's unexplained differences.
It recomputes reports when reading; changed source rows or balances refuse.
No authoritative source adapter, route, scheduler, provider or live execution is
added. Every report retains all four reference/disabled flags. This extends only
the dark M4-17 seam; the accepted-source/production run holds above remain.

0479 adds five append-only, FORCE-RLS tables: `financial_reconciliation_run`,
`financial_reconciliation_difference`, `financial_reconciliation_adjustment`,
`financial_reconciliation_approval`, and `financial_reconciliation_command`.
The last retains exact command payloads, identity and result references, including
daily aliases, so a restart cannot lose a claimed command identity. Daily runs
retain the first report per tenant/job/day; on-demand runs use supplied current
observations. A new run never rewrites old runs or their queues. A per-tenant
transaction lock serializes claims, run revisions and reviews; audit is last.
The scheduling caller is not installed.

Runtime has no table privileges. One new SECURITY DEFINER entry point,
`app.financial_reconciliation_queue(uuid,uuid,jsonb)`, has a fixed pg_catalog
search path, explicit runtime-only EXECUTE and no PUBLIC/infrastructure/shadow
access. It reuses `ef_actor`'s persisted live contractor finance session, active
membership and unrevoked tenant finance grant, restricted to the synthetic
database and a synthetic job. This slice consequently serves the existing
finance-session seam; the single-identity small-builder practice session cannot
supply independent approval. A second browser/session of the proposer is not a
second identity. No production role or commercial permission is introduced.
RLS still assumes the server supplies the correctly authenticated tenant context;
it does not protect against a stolen privileged connection.

A proposal binds one stored run/source hash, the exact adjustment command/content
hash and invoice revision. The existing fake runner previews it and refuses new
or expanded discrepancies. SQL independently checks scope, hashes, source/run and
invoice revision. A separate active finance identity approves that exact stored
proposal. Newer runs invalidate unapproved proposals conservatively, even if
balances happen to match. Replays still authenticate current finance authority;
changed payloads or identities conflict. Run/proposal/approval facts and their
audit event commit together. No authoritative invoice, journal, allocation,
reservation, bill lock or recovery proof is changed. **Approval is an immutable
review fact, not executable commercial authorization**: there is no adjustment
executor, Decision-to-money path or override. Production execution would require
the existing exact Decision/expiry/revocation gates and accepted source adapters.

The only shared expectation additions are the installed five tables and their
exact indexes/policies, and the one new routine's LP-0 owner/EXECUTE/protection
record. Existing expectations and migrations remain intact. No data migration or
backfill occurs. Forward-fix by additive migration; do not edit or remove stored
history. Restore uses these immutable snapshots for deterministic report rebuild;
this does not certify full financial restore, external replay prevention or a
production gate. External execution remains absent/disabled.

Initial self-review: LATER / SIMPLICITY at
`packages/db/src/financial-reconciliation-queue-repository.ts:stored` — if another
persisted reference report needs structural comparison, reuse a shared canonical
encoder rather than adding another local comparator; this would reduce encoding
maintenance. No unrelated canonical-format refactor is part of this piece.

Validation is recorded in the router commit-message handoff. PostgreSQL queue,
approval, privilege, upgrade and RLS tests are CI-only in this sandbox. Full
workspace checks and the independent exact-head Claude RED review remain owed.
This is not completion of M4-17's production reconciliation/security/restore gate.

### M4-17 queue follow-up: SQL source and report verification

Branch-owned 0479 now rebuilds the entire synthetic customer-invoice set for
this tenant/job from `app.customer_invoice`, including each immutable
`final_account_revision_id` and net/tax/gross pence. A different amount,
revision, invented identity or missing stored invoice refuses, even if the
caller supplies a fresh consistent source hash. SQL independently recomputes
all balances and differences for the supported snapshot and compares the whole
report, including canonical difference IDs. Fabricated, altered or omitted
queue entries and changed balances refuse before persistence or audit. Daily
aliases also validate their supplied snapshot/report before retaining the first
run of the day; exact command replay still returns its immutable original.

Provider observations remain supplied fictional inputs and never establish
verified settlement. The stored platform journal has different kinds and book
semantics from these invoice-scoped reference journal observations; there is no
accepted adapter for that shape or for reference duplicate corrections. SQL
therefore refuses nonempty `journals` and `corrections` rather than accepting
unbacked facts. A proposed/approved reference adjustment is still a review fact,
not a posted journal or executable authorization. Supporting persisted journal
or correction inputs requires their actual source mapping and SQL comparison;
this follow-up does not invent it. Honest invoice/provider-only reports retain
the same report format, disabled flags, balances, hashes and queues.

The PostgreSQL regression fixture now uses the existing historical invoice
fixture with a real stored final-account revision and authorization. It attacks
the SQL entry point directly, bypassing repository validation. Tests also
compare supported provider chains, duplicate effects, limits, missing parents,
orphans, overpayments and late observations against the pure reference engine.
No new table, routine, ACL or policy is introduced: the exact LP-0 / SERIOUS-B5
unions remain unchanged. Only the unmerged branch-owned migration is edited.
PostgreSQL integration and upgrade execution remain CI-only here.
