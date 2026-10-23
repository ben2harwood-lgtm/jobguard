# Commercial integrity v3 — pure synthetic advisory contract

CH6-C, issued build-ahead on 23 October 2026. This contract describes a pure
small-builder demonstration evaluator. It is not D11 approval, a persisted source
adapter, an independent verdict, acceptance, or permission to enable a feature.
The source base is `dc5721230fd8aedbf2d9d0457789074b66b48765`.

## Authority and separation

`packages/core/src/commercial-integrity-v3.ts` owns the additive v3 contracts.
The existing `commercial-integrity.ts`, its four finding kinds, demo thresholds,
v1 cap fields and existing tests remain unchanged. The coordinator owns shared
barrel exports and downstream registration. Consumers must not use advisory output
to calculate prices, meter days, fees, entitlement, account status or enforcement.
No finding is approval, liability, fraud, proof of settlement or a charge.

The evaluator reads no clock, database, network, provider or model; it creates no
IDs, receipts, Decisions, ledger entries, outbox work or mutated source records.
Inputs and outputs are synthetic-only. Projection tenant/job scope is supplied
by the future authenticated adapter, not established by this pure function.

## Facts and policy

Strict versioned schemas separate ordinary `pre_lock` facts from `post_lock`
already-published outcomes. A pre-lock input cannot carry a hidden candidate,
catch, hidden count or private evidence field. Post-lock facts require their exact
lock, completed published-outcome contract and cutoff. Neither pure parsing nor a
fixture demonstrates that a source was actually published or authorised.

Facts bind tenant, job and opaque practice `scopeId`, immutable source identity/revision/hash where relevant,
original server timestamp and declared provenance. Receipts labelled
`builder_attested` remain attestations. Customer/site equality requires immutable
identity bindings, including distinct units; text similarity is insufficient.
Identifier reuse uses minimised opaque authorised assertions, never raw users,
phone numbers, cards or cross-tenant lookup credentials.

All money uses safe integer GBP pence within the existing `MAX_MONEY_PENCE`
bound. Comparisons and aggregation use exact integer arithmetic. Net and gross
amounts require an explicitly consistent basis; unknown basis is unavailable.
There is no tax calculation or duplicate money kernel. Timestamp validation reuses
`workFactTimeV1`: canonical UTC with exactly six fractional digits. Lexical
ordering and whole-second conversion plus exact `bigint` fractional arithmetic
preserve microseconds, including the 90-day endpoints. Other timestamp formats
are rejected rather than silently truncated or normalised.

CI-H3 has no invented default. A caller must provide an explicitly named synthetic
fixture profile and its applicable rule parameters. Missing parameters produce an
explicit policy-absent availability result, never a guessed delay, repetition
count, allocation threshold or endpoint convention. Supplied fixture values are
demonstration choices only and do not approve a production D11 policy.

## Required rule matrix

| ID / finding kind | Required facts and exclusions |
| --- | --- |
| CI-F01 `dismissed_not_completed_with_completion_evidence` | Published `not_completed` dismissal and qualifying verified completion evidence for the exact visible catch/work. Pending, invalidated, unrelated, wrong-job or unpublished evidence cannot trigger. |
| CI-F02 `receipts_exceed_locked_account_and_confirmed_catches` | Immutable locked account plus additional confirmed catches not already included, compared to deduplicated receipts on the same GBP basis. Reversals and credits must retain exact attribution; a deposit counts once. One penny above the evidenced comparison is distinguishable from equality. Unknown basis is unavailable. |
| CI-F03 `catch_line_credit_or_writeoff` | Actual immutable line-specific credit/write-off linked to a visible confirmed catch. Baseline credits, unmapped whole-invoice credits and hypothetical write-offs do not become catch corrections. |
| CI-F04 `explicit_allocations_avoid_catch_lines` | Exact saved user-selected allocations, reversals and eligible catch lines in a supplied anchored profile/window. Missing consistency parameters, one ordinary partial payment, proportional allocation and reversed sources cannot silently satisfy the rule. No reallocation is written. |
| CI-F05 `invoice_or_payment_without_lock` | Saved ordinary invoice/payment activity and ordinary lock absence. Reads no hidden facts. Wording is advisory and preserves legacy, deposit and interim flows; no invoice invalidation or payment stop. |
| CI-F06 `won_never_switched_live` | Recorded current quote acceptance, explicit accepted/cancelled/revised state, missing activation and supplied delay/window. User text does not prove acceptance. The existing v1 threshold is unchanged. |
| CI-F07 `related_sub2000_quotes_90_days` | Two or more distinct authorised jobs/quotes with exact same customer/site bindings and contract-selected net quote values strictly below 200000 pence. One job's revisions count once. Test 199999/200000/200001 pence, distinct units, unconfirmed near matches, other scope, and 90 days minus/exact/plus one microsecond against supplied endpoint semantics. |
| CI-F08 `repeated_finish_restart` | Original server-ordered CH-4 lifecycle facts and explicit repetition/window parameters. Replays, duplicate source identities and delayed processing cannot inflate occurrences. No work-state or meter write. |
| CI-F09 `account_identifier_reuse` | Explicit fictional or authorised opaque assertions for each of `user`, `phone`, `card`, with subject/purpose/authority provenance and a cited window. Absent, expired or wrong-scope assertions do not trigger. Innocent family/company sharing remains a possible false positive. No raw identifier or other-session/tenant existence is returned. Real source integration remains CI-H4. |

Missing source, missing policy and no findings are distinct. None proves absence,
wrongdoing, acceptance or entitlement. Fixture-only tests prove pure behaviour,
not reconstruction from persisted ordinary records or hidden-source isolation.

## Stable findings and review boundary

The result fixes `advisory: true` and `syntheticOnly: true`; every finding fixes
`advisory: true` and cites exact
sources, compared figures/basis, rule/profile version, anchored window and a plain
reason. Finding identity depends on kind, rule version, canonical ordered source
identities and an anchored window. Replay, input order, unrelated findings and a
later read time do not change it. Changed relevant source revisions, hashes,
values, profile or window must change its source fingerprint.

The internal `commercial-integrity-source-snapshot.v3` contains the complete
relevant canonical source facts and bindings. It excludes incidental
`evaluatedAt`, HTTP time, presentation and unrelated findings.
`canonicalCommercialIntegritySnapshot` validates and emits deterministic canonical
text without Node crypto. Object keys use UTF-16 ordinal ordering; scalar values
use JSON encoding; every array has set semantics, with canonical values sorted
and deduplicated. Consumers must not use this representation for order-sensitive
arrays. The finding contains its `sourceSnapshot`, not a computed hash. Downstream
application/SQL implementations must agree on the exact canonical representation
and hash it outside pure core. That future SQL agreement remains unproved here.

The public implementation inventory is `commercialIntegrityV3InputSchema`,
`commercialIntegrityV3ResultSchema`, `commercialIntegrityReviewV3Schema`,
`commercialIntegrityReviewSourceSnapshotV3Schema`,
`commercialIntegrityFamilyV1Schema`, `commercialIntegrityV3Kinds`,
`evaluateCommercialIntegrityV3`, `canonicalCommercialIntegritySnapshot`,
`CommercialIntegrityV3Error`, and inferred types `CommercialIntegrityV3Input`,
`CommercialIntegrityV3Result`, `CommercialIntegrityReviewV3`,
`CommercialIntegrityReviewSourceSnapshotV3`, `CommercialIntegrityFamilyV1`.
These are module exports only; this leaf does not edit the shared barrel.

Input schema failures become `INVALID_COMMERCIAL_INTEGRITY_V3_INPUT` from the
evaluator. Successful results expose `unavailable` entries with a rule kind and
`policy_absent`, `source_absent`, `line_source_absent` or `basis_unavailable`, `credit_basis_unavailable`.
Every source must match the supplied tenant and practice scope; only related
quote facts may reference another job within that same supplied scope. Future
adapters still have to prove those bindings against persisted authority.

The external review schema admits only version `commercial-integrity-review.v3`,
command ID, finding key, finding snapshot hash, outcome
`dismissed_false_positive`, and trimmed explanation of 1–500 characters. Tenant,
job, actor, authority, time and internal source snapshot are server-derived and
cannot be submitted as review overrides. Explanation text remains private feedback;
audit carries only IDs/hashes. The pure module does not save feedback, grant
authority, implement replay or suppress a changed finding after dismissal.

The minimal family response is version `commercial-integrity-family.v1`, synthetic
environment, job ID, `family: 'v1' | 'v3'` and `realExternalActions: 0`. It conveys
server-selected routing, never request permission. Ambiguous/contradictory policy
must not select v3 by default; imported-v3 routing remains CI-H7.

## Source inspection and retained holds

Read-only inspection at the recorded base found all CI-S1 and CI-S7–S11 named
seams: v1 evaluator; `JobPartiesRepository.list/view` and session-filtered identity
bindings; `JobWorkStateRepository.read` calling `app.ch4_read_work_facts`;
`MeterRepository.read/rebuild` supplied-input computations;
`PracticeInvoiceRepository.list/creditView/receiptView`;
`RecoveryAllocationRepository.view`; shadow persistence and final-account-lock
contracts. Existing exported primitives are `money`, `moneyFromBigInt`,
`MAX_MONEY_PENCE`, `workFactTimeV1`, `instantV1` and `compareServerInstants`.
The implemented v3 module reuses the money bound and `workFactTimeV1`; it needs
neither a second money calculator nor the broader instant schema/comparator.
There is no exported
microsecond arithmetic parser: the allocator's exact parser is private. No missing
existing seam was treated as permission to invent its implementation.

| Hold | Remains required |
| --- | --- |
| CI-H1 | Accepted SV-5 public published-disposition/confirmed-catch/completed-evidence DTO, exact symbol/head and privilege/session proof. No private shadow-table adapter is authorised. |
| CI-H2 | Accepted MON-1/CH-4 ordinary lifecycle/source/authority handoff; supplied meter fixtures are not lifecycle events. |
| CI-H3 | Approved bounded demonstration profile for adapters where defaults are undecided; production D11 approval remains closed. Pure fixtures use explicit parameters only. |
| CI-H4 | Separately approved minimised synthetic identifier-assertion source with scope/provenance. Fictional pure fixtures do not permit real card/phone ingestion or matching. |
| CI-H5 | Accepted immutable line attribution for credit/write-off and normalised account/receipt comparisons; accepted SV-6 head only if it is the chosen producer. |
| CI-H6 | Coordinator-allocated CH6-P checked review writer, new-kind immutability guard, source validator, migration note and catalogue evidence. Pure schemas do not make receipts immutable. |
| CI-H7 | Accepted CH-5 imported-v3 discriminator and immutable adoption routing; otherwise typed family unavailable. |
| CI-H8 | Actual coordinator-agreed CH6-C public symbol/DTO revision, integrated head and nonoverlapping CH6-B ownership handoff. Proposed names and fixture agreement do not clear it. |

The formal SV-5/MON-1 parent gates, H-PURE-SPLIT/source-design acknowledgement,
D11/D12, independent exact-commit verdicts, separate acceptance and all real-data,
provider, charging and release gates stay held. This build-ahead order authorises
construction only. The dispatcher integrates shared surfaces after predecessors;
Ben alone merges. No database/browser, source-adapter, production or parent-journey
acceptance is asserted by this document.

## Concrete build choices and handoff

DTO revision is the literal `.v3` family shown above. Every source requires
`tenantId`, `jobId`, `scopeId`, `sourceId`, `sourceType`, `revision`, `hash`,
`recordedAt` and explicit provenance. Related quote sources alone may belong to
other jobs, with the same tenant and authorised practice scope. Source identity
is tenant/job/scope/type/ID; conflicting repeated identities are refused.
At most one current accepted quote per job is permitted; revised/cancelled
quotes remain explicitly represented. Ambiguous current revisions fail closed.

The fixture test profile is `synthetic_fixture.v3`, rule `fixture-rules.1`:
window 2026-01-01 through 2026-04-01 UTC, inclusive; two distinct explicit
payments for allocation avoidance; two linked lifecycle cycles; won delay
604800000000 microseconds (strictly greater); net quotes below 200000 pence
within 90 exact 24-hour days, with an explicit inclusive/exclusive endpoint.
These values are supplied only by tests, never exported as a default profile.

For F02, any actual credit/write-off makes comparison unavailable with
`credit_basis_unavailable`: the accepted normalisation semantics are still CI-H5.
The evaluator does not guess how a credit changes the immutable lock amount.
Reversed receipts contribute zero; additional confirmed catches contribute only
when not already included in the lock. F03 independently reports an actual mapped
correction and refuses unknown/mismatched basis. F01 requires server-recorded
verified original proof, its immutable object version and byte length. Lifecycle
cycles require a linked finish/cancel-or-resume pair or close/reopen pair in
server timestamp order; replays and multiple restarts of one finish count once.

`canonicalCommercialIntegritySnapshot` returns canonical text, not a digest.
The adapter must hash those exact UTF-8 bytes and bind the result as
`findingSnapshotHash`; the core does not fabricate a hash. Arrays are canonical
sets (sorted and deduplicated), object keys use UTF-16 ordinal order and scalars
use JSON encoding. PostgreSQL `jsonb::text` is not this representation. An actual
SQL implementation and real-source reproduction remain CH6-P/CI-H1/H5 holds.
There are no package barrel exports in this build; the dispatcher must integrate
and agree the module symbol inventory before CH6-B/P/A/J consume it.
