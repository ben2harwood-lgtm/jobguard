# D08 — Offline security and conflicts

- **Status:** `proposed`
- **Owner / required approver:** Security and product owners
- **Policy version:** `offline_security_policy_v1`
- **Dated approver evidence:** None — proposed on 2026-09-13. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** native real-data distribution; United Kingdom and approved EU/UK sync route
- **Source / supporting review:** BUILD_PLAN.md §§2, 5.12; security review and physical-device tests required
- **Executable feature gate:** `G3; native_real_data_distribution requires D08`

## Exact proposed policy

Require encrypted per-user/tenant local storage, sensitive-field minimization, append-only commercial commands, a bounded offline access lease, and last-writer-wins only for expressly allowlisted non-commercial fields. Lost-device and offline-revocation limitations must be stated.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
