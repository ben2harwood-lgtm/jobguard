# D03 — Eligible recovery and reversals

- **Status:** `proposed`
- **Owner / required approver:** Product owner plus appropriate legal/accounting reviewers
- **Policy version:** `reference_recovery_eligibility_policy_v3`
- **Dated approver evidence:** None — revised again on 2026-09-25 (BUILD_PLAN rev 2.4 §15); first proposed on 2026-09-13; revised on 2026-09-24 by founder direction (BUILD_PLAN rev 2.3 §14). Direction is not approval. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** synthetic_demo until approval; United Kingdom production scope to be reviewed
- **Source / supporting review:** `BUILD_PLAN.md` §§4, 5.5, 10.2.8 and 10.3.2–10.3.3 (rev 3.0); product, legal and accounting review required
- **Executable feature gate:** `G4-S; recovery_eligibility and positive_fee_posting require D03 (and D01/D02, plus D13 for missed_variation_final_account)`

## Exact proposed policy

D03 v2 plus (BUILD_PLAN §10.4 CH-7): applied supplier credit notes qualify once consumed against a later invoice paid in full (minimum £250 a case); duplicate supplier payments refunded in cash qualify; statutory late-payment interest actually paid by a business debtor qualifies as a separate line inside a builder-opened case, with the fixed statutory compensation excluded from the fee base; withheld-payment cases require the builder to open the case and approve the fee terms before any pursuit; overdue retention is an ordinary withheld payment once M4-20 exists; insurer proceeds never qualify.

### Previous candidate — `reference_recovery_eligibility_policy_v2`

_(Section references in previous candidates refer to the archived plan revision in force at the time; see `docs/archive/`.)_

Qualifying categories (BUILD_PLAN §14.7): (1) `missed_variation_final_account`, only when every §14.6 attribution condition holds; (2) supplier overcharge, only as settled cash refund — supplier credit notes against future purchases stay excluded; (3) `withheld_customer_payment`, only when the builder's invoice is overdue beyond an approved threshold, the customer has refused, disputed or ignored the builder's own reminder, and the builder explicitly opened the case and approved the success-fee terms for it before any JobGuard pursuit — only cash settled after opening counts. Customer receipts are allocated to caught lines by explicit allocation, then separate invoice, then pro-rata across lines outstanding at receipt (§14.8). Prevention, pending cash, invoice reductions and unverified manual receipts never qualify. The threshold, evidentiary sufficiency and disputes require approval.

### Previous candidate — v1

Only evidenced settled cash principal attributable to an approved recovery case is eligible. Pending cash, prevented spending, unapplied credit notes, invoice reductions and unverified manual receipts are non-billable; applied credits remain excluded. Partial outcomes, duplication, refunds, disputes, attribution and evidentiary sufficiency require approval.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
