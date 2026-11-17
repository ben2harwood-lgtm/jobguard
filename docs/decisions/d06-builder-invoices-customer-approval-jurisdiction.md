# D06 — Builder invoices, customer approval, and jurisdiction

- **Status:** `proposed`
- **Owner / required approver:** Product owner plus legal and tax reviewers
- **Policy version:** `customer_approval_jurisdiction_policy_v2`
- **Dated approver evidence:** None — revised again on 2026-09-25 (BUILD_PLAN rev 2.4 §15); proposed on 2026-09-13. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** pilot_no_charge; explicitly supported UK jurisdiction and standard-rated 20% GBP cases only
- **Source / supporting review:** `BUILD_PLAN.md` §§4, 5.1, 5.4 and M4-18–M4-22 (rev 3.0); jurisdiction-specific legal/tax review required
- **Executable feature gate:** `G1; real_customer_invoice_issue requires D06 and D02`

## Exact proposed policy

Adds authenticated customer approval of quotes, extras and stages through the customer portal (MON-5), kept distinct from builder attestation; a domestic cancellation-notice kit in every domestic quote, free on every plan; solicitor-reviewed commercial notice templates (England and Wales first) for M4-19.

### Previous candidate — `simple_invoice_pilot_policy_v1`

_(Section references in previous candidates refer to the archived plan revision in force at the time; see `docs/archive/`.)_

Permit only a reviewed simple-invoice pilot. Do not automate construction notices, CIS, domestic reverse charge, retention or unsupported VAT categories. Keep builder attestations visibly distinct from authenticated customer approvals; no universal UK construction-notice regime is assumed.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
