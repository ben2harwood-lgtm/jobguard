# D11 — Commercial integrity and anti-gaming

- **Status:** `proposed`
- **Owner / required approver:** Product/commercial owner
- **Policy version:** `commercial_integrity_policy_v1`
- **Dated approver evidence:** None — proposed on 2026-09-13. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** synthetic advisory evaluation until approval; United Kingdom
- **Source / supporting review:** BUILD_PLAN.md §2 and M1-16; owner anti-gaming design and commercial review required
- **Executable feature gate:** `G4; production_integrity_signals/thresholds require D11; no signal may authorize an automatic charge or account action`
- **Synthetic inspection profile:** [`commercial_integrity_demo_v1`](../../packages/core/src/commercial-integrity.ts) is explicitly linked for M1-16-S demonstrations only. Its example thresholds are not this proposed production policy and are never a production default.

## Exact proposed policy

Freeze accepted_net_value at switch-live and retain quoted and final values. Flag—never auto-penalize—won-but-not-live jobs, material accepted/quoted/final variance, inconsistent live-job activity and recovery marked settled outside the app. Signals are not proof. Cap basis, thresholds and any consequence remain undecided; the optional greater-of-accepted-and-quoted cap is not selected.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
