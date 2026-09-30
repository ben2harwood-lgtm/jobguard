# D01 — Commercial fees

- **Status:** `proposed`
- **Owner / required approver:** Product/commercial owner
- **Policy version:** `reference_fee_policy_v3`
- **Dated approver evidence:** None — revised again on 2026-09-25 (BUILD_PLAN rev 2.4 §15); first proposed on 2026-09-13; revised on 2026-09-24 by founder direction (BUILD_PLAN rev 2.3 §14). Direction is not approval. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** All modes; United Kingdom; executable only in production_billing after approval
- **Source / supporting review:** `BUILD_PLAN.md` §§4, 10.1.2, 10.3.1 (rev 3.0); product/commercial and appropriate legal/accounting review required
- **Executable feature gate:** `G4-S; fee_posting requires D01 through requireApprovedDecision`

## Exact proposed policy

Rate unchanged: 10% of qualifying recovered net principal (BUILD_PLAN §10.3.1). Adds, as a separate and optional table, the managed-recovery service charge a builder may choose per case before any work: +5 points (drafted for you) or +10 points (solicitor letter via an SRA-regulated partner). It is a service charge, never a change to the 10% rate; offered only after pilot data (MON-9).

### Core rate (unchanged since 2026-09-24)

Success fee: 10% of cumulative qualifying recovered net principal in a D03-approved category, rounded half-even once on the cumulative exact value (BUILD_PLAN §10.3.1). No cap. No per-job base plan. No plan credit. Subscription payments (D09) never offset, credit or refund success fees. Builder-captured work (BUILD_PLAN §10.2.1) never attracts a fee. Reversals, refunds and credits produce linked compensation, never edits. Values are ex-VAT; VAT follows D02. A `reference_fee_policy_v2` (£0 platform charge, success fee only) was considered on 2026-09-24 and never implemented.

### Superseded candidate — `reference_fee_policy_v1` (retained for existing synthetic data only)

£79 base-plan principal; recovery fee is 10% of eligible landed principal, capped at 1.5% of accepted net job value; settled plan principal is credited once for that job. The base fee is separate and is not reduced when the recovery cap is below £79. Values are ex-VAT. Small-job wording, cancellations and refunds remain unapproved.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
