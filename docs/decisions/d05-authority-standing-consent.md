# D05 — Authority and standing consent

- **Status:** `proposed`
- **Owner / required approver:** Product, legal, and security owners
- **Policy version:** `standing_authority_policy_v1`
- **Dated approver evidence:** None — proposed on 2026-09-13. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** production_billing; United Kingdom
- **Source / supporting review:** BUILD_PLAN.md §§2, 3.3; product/legal/security review and provider terms required
- **Executable feature gate:** `G4; standing_authorization_execution and payment_retry require D05`

## Exact proposed policy

Exact actions require an authorized tenant member’s approval; each recovery-fee statement requires approval by default. Only separately accepted bounded subscription terms may authorize defined renewals. Frequency, amount bounds, notices, expiry, cancellation, revocation, revalidation and provider retries/messages remain to be approved.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
