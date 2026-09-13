# D02 — VAT, rounding, and invoicing

- **Status:** `proposed`
- **Owner / required approver:** Qualified tax/accounting reviewer and product owner
- **Policy version:** `reference_tax_invoice_policy_v1`
- **Dated approver evidence:** None — proposed on 2026-09-13. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** pilot_no_charge and production_billing; supported United Kingdom pilot cases only
- **Source / supporting review:** BUILD_PLAN.md §§2, 3.4, 3.6; qualified UK tax/accounting review required
- **Executable feature gate:** `G1 and G4; tax_invoice requires D02 through requireApprovedDecision`

## Exact proposed policy

Fee figures are VAT-exclusive; accepted job value and eligible recovery principal exclude VAT. Real pilot customer invoices are limited to explicitly confirmed standard-rated 20% GBP cases. Commercial calculations use half-even; candidate VAT totals by tax-code group and uses half-up for positive invoices with a sign-symmetric inverse for credits. Platform VAT status, invoice presentation and accounting mappings remain undecided.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
