# D04 — Providers and residency

- **Status:** `proposed`
- **Owner / required approver:** Data/security owner
- **Policy version:** `provider_residency_policy_v1`
- **Dated approver evidence:** None — proposed on 2026-09-13. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** Real-data pilot and production; EU/UK personal-data boundary with UK-primary deployment
- **Source / supporting review:** BUILD_PLAN.md §§2, 5.11 and Appendix C; current vendor deployment evidence and data/security review required
- **Executable feature gate:** `G1, G3, G4 and G5 as applicable; provider_dispatch requires D04 through requireApprovedDecision`

## Exact proposed policy

Personal data may use only individually verified EU/UK processing, storage and logging routes, with no silent global fallback. Approval must enumerate actual AI, speech, authentication/commercial email, telemetry, OCR, sync, object/backup, banking, payment and accounting destinations, subprocessors, retention/training and deletion behavior.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
