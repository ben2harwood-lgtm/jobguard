# D14 — Paid data services

- **Status:** `proposed`
- **Owner / required approver:** Founder plus data/legal owner
- **Policy version:** `paid_data_services_policy_v1`
- **Dated approver evidence:** None — proposed on 2026-09-25 (BUILD_PLAN rev 2.4 §15). Direction is not approval; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** production only after approval; United Kingdom
- **Source / supporting review:** `BUILD_PLAN.md` §4 and §10.1.10 (rev 3.0); `reports/JobGuard monetisation and jobs pricing.md` items 13, 14, 36; solicitor review of credit-reference rules required
- **Executable feature gate:** `G4-S; paid_counterparty_checks and title_checks require D14 (plus D04, D07, D12)`

## Exact proposed policy

Free public-register layer first (Companies House, the Gazette) inside the plans. Paid, flat-priced checks later: credit-agency reports on companies only, never individuals; HM Land Registry title checks at the official fee plus a disclosed margin. No search on named individuals (CCJ or insolvency) until a solicitor confirms the credit-reference position. Check records follow D07 retention and are never reused for pursuit. No reseller contract with a minimum commitment before pilot attach data exists.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
