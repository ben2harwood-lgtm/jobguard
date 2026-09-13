# D07 — Retention, recovery, and operations

- **Status:** `proposed`
- **Owner / required approver:** Data and operations owners
- **Policy version:** `pilot_data_operations_policy_v1`
- **Dated approver evidence:** None — proposed on 2026-09-13. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** pilot_no_charge and production_billing; United Kingdom with approved EU/UK service boundary
- **Source / supporting review:** BUILD_PLAN.md §§2, 5.7, 5.8, 5.11; data/operations review and restore evidence required
- **Executable feature gate:** `G1; real_data_activation requires D07; worm_retention requires a later explicit D07 approval`

## Exact proposed policy

Use private versioned evidence, explicit retention classes, deletion/export workflow, independent audit checkpoints and tested backup/restore. Candidate pilot objectives are at most 24 hours’ data loss and recovery within one working day; these are targets, not measured promises. Retention periods and any WORM/legal hold remain undecided.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
