# D06 — Builder invoices, customer approval, and jurisdiction

- **Status:** `proposed`
- **Owner / required approver:** Product owner plus legal and tax reviewers
- **Policy version:** `simple_invoice_pilot_policy_v1`
- **Dated approver evidence:** None — proposed on 2026-09-13. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** pilot_no_charge; explicitly supported UK jurisdiction and standard-rated 20% GBP cases only
- **Source / supporting review:** BUILD_PLAN.md §§2, 3.1, 3.4; jurisdiction-specific legal/tax review required
- **Executable feature gate:** `G1; real_customer_invoice_issue requires D06 and D02`

## Exact proposed policy

Permit only a reviewed simple-invoice pilot. Do not automate construction notices, CIS, domestic reverse charge, retention or unsupported VAT categories. Keep builder attestations visibly distinct from authenticated customer approvals; no universal UK construction-notice regime is assumed.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
