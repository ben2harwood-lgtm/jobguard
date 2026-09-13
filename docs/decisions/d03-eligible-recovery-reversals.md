# D03 — Eligible recovery and reversals

- **Status:** `proposed`
- **Owner / required approver:** Product owner plus appropriate legal/accounting reviewers
- **Policy version:** `reference_recovery_eligibility_policy_v1`
- **Dated approver evidence:** None — proposed on 2026-09-13. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** synthetic_demo until approval; United Kingdom production scope to be reviewed
- **Source / supporting review:** BUILD_PLAN.md §§2, 3.6; product, legal and accounting review required
- **Executable feature gate:** `G4; recovery_eligibility and positive_fee_posting require D03 (and D01/D02 as applicable)`

## Exact proposed policy

Only evidenced settled cash principal attributable to an approved recovery case is eligible. Pending cash, prevented spending, unapplied credit notes, invoice reductions and unverified manual receipts are non-billable; applied credits remain excluded. Partial outcomes, duplication, refunds, disputes, attribution and evidentiary sufficiency require approval.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
