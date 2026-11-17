# D05 — Authority and standing consent

- **Status:** `proposed`
- **Owner / required approver:** Product, legal, and security owners
- **Policy version:** `standing_authority_policy_v3`
- **Dated approver evidence:** None — revised on 2026-09-30 (BUILD_PLAN rev 3.0); revised again on 2026-09-25 (BUILD_PLAN rev 2.4 §15); proposed on 2026-09-13. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** production_billing; United Kingdom
- **Source / supporting review:** `BUILD_PLAN.md` §§4, 5.3 and M4-13 (rev 3.0); product/legal/security review and provider terms required
- **Executable feature gate:** `the applicable track gate (G4-C or G4-S); standing_authorization_execution and payment_retry require D05`

## Exact proposed policy

Small-builder monthly maximums: Solo £49, Builder £169 (the Firm and Contractor plans are withdrawn). Trial conversion and renewal terms; success-fee statements approved per statement by default; an optional, opt-in standing Direct Debit authority capped at the fee on a bank-verified receipt and paused during any dispute. Contractor fee statements are approved by the contractor's finance role each month (D16).

### Previous candidate — `standing_authority_policy_v2`

_(Section references in previous candidates refer to the archived plan revision in force at the time; see `docs/archive/`.)_

Monthly maximum per plan (Solo £49, Builder £169, Firm £329, Contractor £829) that the subscription may take without a new builder decision; trial conversion and renewal terms; success-fee statements approved per statement by default; an optional, opt-in standing Direct Debit authority capped at the fee on a bank-verified receipt, paused during any dispute; pay-now link fees follow D10 v2.

### Previous candidate — `standing_authority_policy_v1`

Exact actions require an authorized tenant member’s approval; each recovery-fee statement requires approval by default. Only separately accepted bounded subscription terms may authorize defined renewals. Frequency, amount bounds, notices, expiry, cancellation, revocation, revalidation and provider retries/messages remain to be approved.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
