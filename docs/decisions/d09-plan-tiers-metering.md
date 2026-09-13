# D09 — Plan tiers and metering

- **Status:** `proposed`
- **Owner / required approver:** Commercial and accounting owners
- **Policy version:** `plan_metering_policy_v1`
- **Dated approver evidence:** None — proposed on 2026-09-13. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** production_billing; United Kingdom
- **Source / supporting review:** BUILD_PLAN.md §2; commercial terms and accounting review required
- **Executable feature gate:** `G4; paid_subscription and metering_execution require D09 (plus D01/D02/D05)`

## Exact proposed policy

No tier price, included-job count or limit is assumed. Before implementation, define concurrency intervals, billing periods, inclusions, credits and upgrade approval. Subscription credit must not duplicate the per-job £79 credit.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
