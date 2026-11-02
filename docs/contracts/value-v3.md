# Value contracts: illustrative v3 and CH-9 part 2 runtime

CH-9 part 2 adds the distinct runtime contract described at the end of this file.
The original `value-receipt.v3` candidate and fixtures below remain illustrative;
they are never promoted into source-backed receipts.

Historical CH9-S status: schema and illustrative unit-contract preparation only. This is not an
accepted runtime source contract or completion of CH-9. `value-receipt.v3` is
implemented in `packages/core/src/value-v3.ts`; supplied examples live in
`value-v3.fixtures.ts`. There is no HTTP endpoint, UI, database adapter, provider,
fee calculator or authoritative eligibility service in this leaf. Shared exports
and runtime composition belong to the coordinator after review.

## Scope and dependency hold

Every object has `environment: synthetic_demo` and
`evidence: illustrative_unbound`. Those literals describe supplied examples;
they do not make an object a stored simulation fact or DEMO-S journey evidence.
All producer fields, source lists, revisions, event identities, correction links,
timestamps and source-vector entries below are **proposed and unbound**.

**H-VALUE-SOURCES remains HELD.** Installed signatures alone cannot discharge
it. Accepted authoritative source completeness, event/correction identity,
time semantics and producer acceptance evidence are required. The two proposed
ports, `ProposedValueSourcesPortV3.readAuthorisedSnapshot()` and
`ProposedValueDerivationPortV3.readImmutableDerivation()`, expose `unknown` and
declare `binding: held_H-VALUE-SOURCES`. They have no implementation, including
no fake implementation. Their names do not establish an authorization path.
Future adapters must authenticate and authorize before selecting tenant, job or
session scope; caller-supplied scope or qualification is never trusted authority.

## Candidate shape

Strict objects reject additional fields. `disclosure` is an illustrative `prelock` or `after_lock` label; prelock objects reject all found-category source IDs. This structural check does not establish runtime authority or hidden-state noninterference. A receipt has a version, scope, as-of
descriptor, exactly five category groups, illustrative sources and factual
references. Job scope contains tenant, job and session references. Business scope
contains tenant and session references and a separate subscription object with a
billing-period identifier, policy/derivation versions and a distinct asserted period source list. Subscription cost is prohibited on job receipts and
is never allocated to a job. Period references must be unique and disjoint from job source IDs; a known cost must use those period references. Their completeness and MON binding remain held.

| Group | Meaning and permitted content |
| --- | --- |
| `checked` | Count and source references only; no money fields. |
| `tracked` | Builder captures tracked through billing; supplied known fee must be zero. |
| `found` | Hypothetical post-final-check recoveries, distinct from captures. |
| `supplier` | Hypothetical supplier recoveries, distinct from found and withheld. |
| `withheld` | Hypothetical withheld-customer-payment recoveries. |

These groups occur exactly once in that order. The four money groups each have
`recorded`, `settled`, `qualifying`, `fee` and `remainder` amounts. Keeping
recorded/settled separate allows a nonqualifying payment to retain its accurately
labelled amount without promoting it to qualifying recovered principal. Passing
any field named `settled` through this schema does not verify settlement.

An amount is one of:

- `known`: exact upstream bounded safe-integer GBP pence (never rounded here),
  an explicit `net_principal` or `gross` basis and at least one source reference. Known zero is explicit £0.00 under the
  supplied assumptions; it is not a default for missing facts.
- `unknown`: a reason (`source_unavailable`, `binding_held` or `not_reported`),
  without money, basis or source-reference fields.
- `incomplete`: the same reason vocabulary plus
  `fractional_pence_requires_upstream_policy`, with absent money fields,
  identifying incomplete inputs separately from unknown inputs.

This boundary performs **no rounding**. A producer may supply `known` only when
its amount is already an exact integer pence value. A supplied SV-6 fee is
the upstream derivation output; this module neither rounds nor recomputes it.
An exact rational qualifying amount, remainder or source movement must never be rounded to fit this DTO. Non-integral amounts use `incomplete` with
`fractional_pence_requires_upstream_policy`; dependent fee/remainder amounts also
remain unavailable under the rules below. Non-integral source movements cannot
be supplied as known movements; omit those optional movements (`null`) and keep
any dependent category amounts incomplete. Null does not establish a zero or a
complete source claim. For F4, Q = 2000000/43p and remainder = 1800007/43p
therefore remain incomplete here, even though the upstream fee is 4651p.
The same applies to Q = 24691/2p and a supplied fee of 1235p. Rational
preservation and the upstream display-policy/version binding remain explicitly
**HELD** with H-VALUE-SOURCES; this leaf invents no rounding or tax policy.

`formatValueMoney` formats integer pence exactly and returns `Unavailable` with
the state for unknown/incomplete inputs. It neither supplies a missing amount nor
calculates VAT. Known qualifying, fee and remainder illustrations require
`net_principal` basis, including zero amounts.
The supplied remainder is checked against qualifying principal minus supplied
fee using integer arithmetic; this checks composition, not fee entitlement.
Any known positive fee requires known qualifying principal at least as large,
regardless of measure or remainder availability. This is a consistency bound,
not a fee-rate calculation.
Unavailable qualification cannot have known dependent fee/remainder values; an unavailable fee also requires an unavailable remainder.

## Illustrative references and event rules

Sources carry ID, event ID, revision, tenant/job/session scope, category, kind,
qualification label, optional original reference, timestamp, fixed
`reference_fee_policy_v3` label, derivation version and optional principal/fee
movements. These are asserted DTO values. Even `hypothetical_qualified` is an
explicit illustrative assertion, never proof of eligibility or settlement.

Local structural checks reject repeated source/event IDs, mismatched tenant/job/session
scope, missing or wrong-category amount references, repeated amount references,
missing factual references and invalid direct original/correction links.
Reversals and corrections reference a supplied original in the same job/category;
ordinary sources have no correction link. Independent events may share a supplied
timestamp. An event-ID uniqueness check cannot discover different IDs for one
real event, joins duplicating an event, omitted authoritative sources or an
incorrect producer identity rule.

Pending, unapproved, unpaid, disputed, disclosed-before-lock, after-lock and
builder-capture labels cannot support positive qualifying/recovery amounts or
positive fees. These checks do not reimplement the qualifying-source producer.
No model, source-reference string or DTO validation creates a recovery, variation,
debt, approval, fee posting or payment.

`asOf.vector` records supplied producer/revision references. `timeContract` is
always `proposed_unbound`; a supplied window uses `from` and `toExclusive` labels
and the measure distinguishes `cumulative_balance` from `window_movement`.
Malformed timestamps are rejected, and cumulative balances cannot be negative. Window ordering/selection semantics are deliberately unbound; no date arithmetic or filtering is performed here. This descriptor neither chooses the authoritative event clock nor executes a
time filter. Exact boundaries, read/pagination deduplication, out-of-order reads,
cross-period corrections and completeness remain runtime obligations. Illustrative
timestamps or self-authored event IDs cannot prove those obligations.

## Examples and commercial limits

All fees below are labelled hypothetical SV-6 outputs supplied to the fixture,
not fees calculated by this module. No settlement is fabricated to obtain a fee.

| Example | Supplied illustration |
| --- | --- |
| `recovery-18800` | £2,820 qualifying principal / £282 fee / £2,538 remainder. |
| Explicit recovery reversal | −£2,500 principal and −£250 fee movements, linked to the original, leave £320 / £32 / £288. |
| `shadow-30000` | £3,600 tracked with £0 fee; £800 found / £80 fee / £720 remainder. Supplier and withheld groups stay separate. |
| Independent recoveries | £500 / £50 / £450, and supplied qualifying £0 / fee £0; absent settlement remains unavailable. |
| `core-1000` compatibility | Separate £1,100 net and £1,320 gross invoice facts; approved +£125 and −£25, unapproved £50; £500 and £820 recorded payments, −£820 reversal and linked invoice correction. |

There is no v1 £79 credit, £203 balance, cap, base or activation obligation.
Subscription cost is period-only and cannot offset, credit, net against or refund
a success fee. No prevention pound amount is represented. The schema has no
hidden-signal identifiers or prelock shadow-state response; it is not itself a
builder-facing authorized/prelock transport. Future transports must establish
the permitted disclosure boundary independently.

Fee illustration, fee posting, collection and refund are separate facts. These
examples do not assert posting or collection. `VALUE_V3_LABELS` exports the exact basis/payment labels; applicable display wording is
“Illustration — proposed policy; principal only”, “yours before VAT and tax” and
“VAT not calculated in this simulation”. No tax outcome is calculated or claimed.

## Acceptance boundary

CH9-S01/S03–S06/S08/S09 cover schema/unit assertions on supplied illustrative
inputs only. A passing unit check cannot establish provenance, completeness,
qualification, settlement or a DEMO-S end state. Examples are never positive
end-state seeds or evidence of an executed fresh journey.

**CH9-S02 remains HELD** for CH9-J04/09 and CH9-B02/06/07: every amount must
reproduce from the API's complete authoritative source list, bound to actual
producer records and derivation outputs, with missing/duplicate/wrong-policy or
mixed-scope inputs refusing a complete claim.

**CH9-S07 remains HELD** for CH9-J04/09 and CH9-B02/03: accepted event/window
contracts and actual runtime traces must establish exact boundaries, distinct
events at equal timestamps, repeated/out-of-order/paginated reads and linked
cross-period reversals/corrections, distinguishing balance from movement.

A separately accepted CH9-S handoff can cover only this bounded schema/unit
contract. R/J consumption neither requires J/B to have passed already nor marks
S02/S07 passed. Missing policy and clock decisions, H-VALUE-SOURCES, producer
acceptance, actual independent review bound to the exact commit, CI and separate
technical acceptance all retain their holds. Review/acceptance identities remain
unassigned here. Local deterministic checks are not model review. No unqualified
CH9-S/source-proof or CH-9 PASS, merge, release, enablement or real-data approval
is conferred by this document.


## CH-9 part 2 runtime: mapped, inspectable (RED)

`job-value.v3` keeps its existing pre-lock/incomplete arm and adds `status: mapped`
with a strict `mapped-value-receipt.v1`. Sources are the authenticated job's lock,
original locked revision, original final invoice's builder-capture lines, completed
SV-5 processing-source identities, and immutable SV-6 attribution assessments.
Builder captures join `variation_revision.id = final_account_line.source_id`.
Catch sources retain the corrected #346/#356/#368 writer guarantees; this reader
calls the existing SV-6 resolver to check the latest source hash without appending
an assessment or changing a commercial fact. Stale sources and unassessed catch
cases make found figures unavailable. No local allocator or qualification policy
substitutes for SV-6. Job fees round once on cumulative principal through the same `cumulative-fee.v1`
v3 kernel as MON-4A/M4-9-S. Movement `fee` and `yoursBeforeVatAndTax` are exact
rational pence (`numerator`/`denominator` strings), preserving unrounded catch
shares; the UI labels them as such. Job totals remain integer-pence Money.
Window fees subtract the rounded cumulative balance before the window from that
at its end, so adjacent windows reconcile. Fractional principal pence remain
unavailable rather than being rounded in a value reader.

Receipt fields carry `reference_fee_policy_v3`, `cumulative-fee.v1`, full source
assessment documents and their manifests, lock/revision IDs, invoice-line IDs,
original/reassessment IDs, and explicit signed movements. Assessment revisions
replace cumulative balances, never add them. Duplicate source, line, work and
assessment identities or broken predecessors refuse. Current money reproduces
from those documents; the API rejects modified derived figures and foreign scope.

An optional UTC `from`/`toExclusive` pair selects a half-open **server-recorded
movement window**, using the existing exact-instant comparator (including
PostgreSQL microseconds). Found movements use SV-6 `serverRecordedAt`; checked
counts use completed-run `available_at`; tracked lines use original invoice
`created_at`. Full predecessor history stays in the source list so a reversal in
one window can reproduce without adding its original receipt again. No selector
means the cumulative mapped balance. A source invalidated today never supports a
current positive balance even if a historical window was selected. Late facts
appear when assessed; this is not a claim to backdated bank settlement time.

`/api/value` and Nest `/value` use the existing MON-1/MON-2A real company-session
bridge for a signed-in **made-up company**. Authentication and SQL company role
checks precede job enumeration or selection errors. A simultaneous practice
cookie cannot bypass a revoked company credential. Shared practice cookies keep
the part-1 business refusal; they never confer company billing authority.
Per-job practice reads still require immutable session ownership. Company job
links use the same company bridge on the exact GET job-value-v3 endpoint; no
other job or money endpoint is admitted for company principals. Both controlled
read functions refuse outside `jobguard_synthetic_demo` and do no hidden query
before the job's immutable lock. Company reads include small-builder jobs only.

The business result contains mapped job receipts, source-reproduced business
totals, and a separate subscription array. Each subscription amount is the saved
MON-1/MON-2A period principal, with source ID, period boundaries, policy/derivation
version, statement ID and period lines. Period and statement hashes, currency,
line identities and amounts must agree; period lines sum exactly to the amount.
`periodId` selects only an actual authorized saved period. Job windows never
prorate a subscription; subscription costs never appear on a job receipt. No
current period, trial discount, payment outcome or £0 charge is invented.

The public label is “mapped, inspectable”. Proposed-policy fee calculations stay
labelled “Illustration — proposed policy; principal only”, with “yours before VAT
and tax”. These are sourced synthetic figures, not a professional approval,
production fee, posting, settlement claim or tax calculation. Supplier and
withheld-payment sections remain separately unavailable until their accepted
producer bindings exist; no catch or tracked figure is relabelled into them.
No GET writes a receipt, assessment, audit event, allocation, charge or statement.
