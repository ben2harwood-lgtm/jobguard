# M4-21: expanded VAT fixture contract v1 (RED)

Status: **fixture, awaiting adviser approval**. Every row is **not adviser-approved**.
`VAT_TREATMENTS_ENABLED` is hard false. `assertVatTreatmentIssueAllowed` always throws;
there is no caller-supplied enablement/approval field, runtime route, persistence, executor,
provider, migration or release in this piece. D02/D06 review and a separately authorized
command integration are outstanding. These examples do not satisfy the plan's adviser
sign-off gate. M1's existing standard-20%-only implementation is unchanged.

## Explicit support matrix

Version: `vat.support-matrix.dark.v1`; rounding example:
`fixture_cumulative_group_half_up_v1`. GBP checked integer pence only.

| Code | Fixture rate | Explicit qualification | Draft wording/data |
| --- | --- | --- | --- |
| standard_20 | 20/100 | VAT-registered supplier, reverse charge out of scope | Standard rate and VAT amount |
| zero | 0/100 | VAT-registered supplier; human-sourced qualifying basis; reverse charge out of scope | Zero rate, qualifying basis reference |
| reduced_5 | 5/100 | VAT-registered supplier; human-sourced qualifying basis; reverse charge out of scope | Reduced rate, qualifying basis reference |
| non_vat | 0/100 arithmetic only | Supplier explicitly not VAT registered; reverse charge out of scope | Supplier not VAT registered, no VAT charged (distinct from zero-rated) |
| drc_20 | 20/100 customer-accounted | VAT-registered supplier/customer, explicitly in scope; neither end user nor intermediary supplier in this bounded fixture | Reverse charge: customer to account for VAT to HMRC; rate and customer-accounted amount separately |
| drc_5 | 5/100 customer-accounted | Same DRC statuses, plus human-sourced qualifying basis | Same DRC wording with reduced rate and separate amount |

This matrix deliberately supports a subset of possible legal cases; it does not decide
legal applicability. For example it rejects intermediary-supplier DRC examples rather
than determining whether a particular notification changes treatment. All groups require
explicit supplier/customer registration booleans, matching presence/absence of VAT numbers,
end-user/intermediary status, reverse-charge scope, actor/evidence IDs, and qualifying-basis
reference. `human_fixture` is the only accepted source. These are fictional assertions,
not verification of a tax registration, evidence document or adviser decision. Missing,
unknown, unsupported or conflicting input throws a typed error; nothing defaults to 20%.
A job description, model output or confidence score cannot supply an eligibility decision.
No CIS verification, deductions or returns are implemented (M4-22).

Each draft preserves its document reference/date, fictional supplier/customer references,
book tenant/job IDs, original source input, matrix and rounding versions, treatment-group
wording, exact rate in the matrix, and separate calculation outputs. These are calculation
fixtures, not a complete legally compliant invoice template: production document fields,
wording and eligibility evidence still require D02/D06 approval.

## Interim and retention calculation bases

A book is one tenant/job, supplier/customer, matrix, rounding version and retention-tax
basis. Every snapshot contains one complete cumulative group per treatment; group order
is immaterial. Rounding occurs once per cumulative tax-code group using the existing exact
`multiplyRatio(..., half_up)` helper. Document movements subtract the previous rounded
cumulative amounts, so tiny part bills and inverse credits telescope exactly. This is a
candidate fixture method, not an approved tax-rounding or tax-point policy.

Two explicitly chosen, unapproved basis examples are supported:

- `full_net`: calculate current tax on cumulative net including retained principal.
- `net_after_retention`: calculate current tax on cumulative net less retained principal;
  deferred retained VAT is rounded full-value VAT less rounded current VAT. Releasing
  retention changes the current tax basis without rebilling construction net.

For every group and document delta, `gross = net + vatToSupplier`,
`fullValueGross = gross + retainedVat`, and `expectedCash = gross - retained`.
`retained` is principal only; `retainedVat` is separately deferred supplier VAT.
`fullValueGross` is the full value including supplier VAT before deferral, not the cash
currently due. DRC `vatToSupplier` and `retainedVat` are zero: `reverseChargeVat` records
the customer's calculated tax on the chosen basis, outside gross/debt and expected cash.
DRC changes neither commercial net nor retained principal and creates no discount/debt waiver.
All outputs use checked Money; aggregate overflow fails before returning a result.

Example: reduced-rate net 10,000p, retained 1,000p with `net_after_retention` gives tax basis
9,000p, supplier VAT 450p, gross 10,450p, deferred retained VAT 50p, full value gross 10,500p,
and expected cash 9,450p. Release has net movement 0p, gross movement +50p, retained movement
-1,000p and expected-cash movement +1,050p. The DRC-5 counterpart has gross 10,000p, customer
VAT 450p and expected cash 9,000p; release adds 50p customer-accounted VAT and 1,000p expected
cash, with no new construction net.

M4-18 interaction: explicit `interimCertificationId` references the valuation source;
certification, invoice net, current supplier tax and receipts remain separate. This module
never substitutes an application for certification. M4-20 interaction: each snapshot binds
`retentionProfileId`, and release snapshots require a unique `retentionReleaseId`; it does
not create a release approval, satisfy a condition, schedule a timer or post a receipt.
Source IDs describe fictional lineage only. A future adapter must load verified tenant/job
scoped immutable sources and enforce certified ceilings, actual release allocations,
approvals and idempotency; this pure fixture model does not authenticate those sources.

Mixed standard/zero/reduced and compatible DRC groups are calculated independently. All
groups must agree on supplier/customer registration and end-user/intermediary statuses;
non-VAT and registered-supplier groups cannot coexist. Within a history, groups, original
eligibility and retention profile cannot be changed. Credits can only reduce net/retention
from the immediately preceding cumulative snapshot and cannot increase expected cash.
Historic arbitrary credit allocations, profile changes, changed treatment/status and other
regimes are unsupported. Retention releases keep net unchanged and cannot increase held
principal. Duplicate document references/IDs, duplicate groups, reused release IDs and broken
previous/credit references fail. Replaying the same pure calculation has no side effects;
this is not a durable issuance or settlement ledger.

## Evidence and remaining gates

Fixtures/tests cover every row, both retention bases, mixed groups, part billing, credit
correction to zero, retention release, rounding residues, amount limits, missing/conflicting
eligibility, strict versions, disabled issue and preservation of M1. M4-18 and M4-20 are run
as regression suites without edits. No tax/tenant tables or grants change, so no migration,
LP-0 or tenancy-list amendment is needed. Independent exact-head RED review and CI remain
required; adviser-approved fixtures and real document issue remain outstanding.

Primary references inspected for scope, not treated as approval:
[BUILD_PLAN R13: VAT for builders/new homes](https://www.gov.uk/vat-builders/new-homes),
[BUILD_PLAN R14: construction DRC](https://www.gov.uk/guidance/vat-domestic-reverse-charge-for-building-and-construction-services),
[HMRC DRC invoice requirements](https://www.gov.uk/hmrc-internal-manuals/vat-reverse-charge-for-building-and-construction-services-manual/vatrevcon37100).
