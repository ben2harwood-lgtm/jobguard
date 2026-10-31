# M4-22 CIS deductions: dark fixture contract v1 (RED)

Status: **fixture, awaiting adviser approval**. No adviser approval is claimed.
`CIS_ENABLED` is literal false. `assertCisIssueAllowed()` always refuses real
calculation, document issue and statutory returns. No provider, HMRC connection,
route, command executor, persistence, deployment or money posting is introduced.
These pure fixture APIs cannot activate any production capability or relax M1.

## Scope and sources

Strict versioned Zod inputs require synthetic tenant/job context, fictional
contractor/subcontractor references, evidence-backed status-record shapes and
explicit fixture validity intervals. Supported statuses are `gross_payment`
(0/100), `registered` (20/100) and `unregistered` (30/100). Missing or unknown
status never defaults to 30%, 20% or zero. A recorded fictional evidence ID,
reference and actor are mandatory even for gross/unregistered examples. They are
source lineage, not proof that any verification occurred. No API verifies evidence
or calls HMRC. Explicit `validFrom`/`validThrough` intervals are fixture inputs,
not a claim about statutory verification expiry rules.

The whole M4-21 VAT book and M4-20 retention book are parsed and reconciled using
the existing calculators. Their tenant/job and fictional parties must match.
Each CIS statement references a supplied VAT document and retention profile by ID;
VAT release IDs must resolve to M4-20 release records. Final VAT retained net and
deferred supplier VAT must match M4-20 remaining net/tax. Source VAT dates cannot
be in the future and document lineage cannot go backwards. The VAT document
retains M4-18 certification lineage. This module does not authenticate that
certification, a human approval, evidence bytes or contractual authority.

Direction is explicit: `customer_receipt` or `subcontractor_payment`. In either
case the VAT supplier is the subcontractor, the VAT customer is the contractor,
and cash is positive in the named direction. A reversal compensates an earlier
payment in that direction; it cannot exceed that payment or reverse a reversal.

## Candidate calculation and documentary records

Policy: `cis.materials-only.cumulative-half-up.dark.v1`. This deliberately narrow
fixture supports directly paid, evidenced materials only as an excluded cost;
other statutory cost exclusions and mixed cost rules are unsupported. The paid
net allocation is explicit and bounded by invoice net less retained principal;
materials cannot exceed paid net. Paid VAT is explicit and bounded separately by
M4-21 supplier VAT. DRC customer-accounted VAT never enters cash or the CIS base.
No automatic pro-rata allocation or estimate is made from cash or a job description.
A future approved adapter must verify allocation evidence and legal applicability.

All arithmetic uses checked BigInt intermediate pence with the existing money
limit. Candidate rounding uses the existing rational helper, half-up once on the
cumulative deduction base. This is an unapproved fixture policy, not tax advice.
For each cumulative statement:

- `deductionBase = paidNet - directMaterials` (VAT and unpaid retention excluded).
- `cisDeduction = round(deductionBase * explicitStatusNumerator / 100)`.
- `expectedCash = paidNet + paidVat - cisDeduction`.
- `invoiceExpectedCash = invoiceNet + vatToSupplier - retention - cisDeduction`.
- `unallocatedInvoiceNet = invoiceNet - retention - paidNet`; unallocated supplier
  VAT is separately `vatToSupplier - paidVat`.
- Actual cash is the sum of unique linked payments less bounded linked reversals.
  Allocated unpaid/refund and whole-invoice unpaid/refund balances are shown
  separately, floored at zero. An unallocated invoice balance is not an assertion
  of overdue debt. Deferred retained VAT and reverse-charge VAT remain separate.

Thus invoice gross equals retention plus CIS plus actual cash plus whole-invoice
unpaid cash less whole-invoice refund due. CIS is never a VAT treatment, a waived
commercial amount or a recovery-fee deduction. `feeEligibleRecovery` is always
zero. Even fixture deduction records are not evidence of qualifying recovered cash.

Each statement preserves its original calculation inputs, source VAT calculation,
retention profile, status record, policy/matrix/rounding versions, explicit rate,
document reference/date, declared tax-month end, human actor/Decision ID and source
calculation reference. Materials and payment records carry evidence IDs; each
payment has its own business reference, date and source ID. These are required
review shapes, not an approved statutory statement template or a return payload.
The fixture tax-month declaration must not precede the statement date; production
period rules and deadlines remain an adviser/template gate.

## History and corrections

Statements are cumulative, ordered snapshots. Their deltas subtract prior rounded
cumulative results, so part payments and inverse corrections telescope exactly.
Decreasing net, materials, paid VAT or eligible base requires a named correction
against the immediately preceding statement. A correction can expose refund due;
only an explicit bounded cash reversal changes actual cash. Prior snapshots and
calculation outputs are preserved and returned frozen. `appendCisFixtureStatement`
returns a frozen copy; an exact retry is a no-op and changed content under an old
ID is refused. Duplicate business references/IDs and reused/unlinked payment IDs
fail. The complete supplied history is validated on every call.

Changing status in an existing cumulative history is explicitly unsupported: it
must not retroactively re-rate historic payments. Revised-status segmentation,
other deductible cost categories, arbitrary historic corrections, source evidence
verification and durable authorized documents require a future reviewed contract.
The model is pure; imported history is not a tamper-resistant issued ledger.

## Evidence and remaining gates

Tests cover the three statuses, every M4-21 VAT row, both VAT retention bases,
materials exclusion, partial payments, tiny rounding residues, corrections,
compensating cash, missing/stale/future status/evidence, duplicate/replay conflicts,
tenant/job/party mismatches, source and amount limits and disabled real issue.
No database tables or routines change; no migration, LP-0 or tenancy-list amendment
is required. Independent exact-head RED review, green CI and adviser-approved
fixtures remain outstanding. Real issue needs its own durable, authorized command
integration and approved source/document/retention/tax policies.

Primary reference inspected for scope only:
[BUILD_PLAN R22: GOV.UK CIS deductions and subcontractor payments](https://www.gov.uk/what-you-must-do-as-a-cis-contractor/make-deductions-and-pay-subcontractors).
