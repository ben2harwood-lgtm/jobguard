# D11 — Commercial integrity and anti-gaming

- **Status:** `proposed`
- **Owner / required approver:** Product/commercial owner
- **Policy version:** `commercial_integrity_policy_v3`
- **Dated approver evidence:** None — revised again on 2026-09-25 (BUILD_PLAN rev 2.4 §15); first proposed on 2026-09-13; revised on 2026-09-24 by founder direction (BUILD_PLAN rev 2.3 §14). Direction is not approval. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** synthetic advisory evaluation until approval; United Kingdom
- **Source / supporting review:** `BUILD_PLAN.md` §4, §14.2 and CH-6 (rev 3.0); owner anti-gaming design and commercial review required
- **Executable feature gate:** `the applicable track gate (G4-C or G4-S); production_integrity_signals/thresholds require D11; no signal may authorize an automatic charge or account action`
- **Synthetic inspection profile:** [`commercial_integrity_demo_v1`](../../packages/core/src/commercial-integrity.ts) is explicitly linked for M1-16-S demonstrations only. Its example thresholds are not this proposed production policy and are never a production default.

## Exact proposed policy

D11 v2 plus (AGENTS §5.15): no fee, credit, signal or feature depends on which merchant a builder uses; no fee is measured on a tax outcome; the never-build list in BUILD_PLAN §14.2; metering residuals (won but never switched live, split small quotes, pause patterns) are advisory signals only and can never change a price, count or fee.

### Previous candidate — `commercial_integrity_policy_v2`

_(Section references in previous candidates refer to the archived plan revision in force at the time; see `docs/archive/`.)_

Adds lock/reveal integrity (BUILD_PLAN §14.10). Structural: immutable lock and evidence receive times; variations cannot be deleted, only withdrawn (still capture); one economic recovery per coalesced work item; lines already in the locked account or baseline cannot be caught; AI confidence is never entitlement; JobGuard may not reveal before lock and later charge. Advisory signals, never automatic penalties: a catch dismissed as not completed despite completion evidence; customer receipts exceeding the locked account plus confirmed catches; credit notes or write-offs on catch lines; explicit allocations that consistently avoid catch lines; invoice or payment activity with no lock. v1 cap-basis signals apply only to v1 data. Residual risk is accepted and disclosed: a builder can dismiss a genuine catch or bill it outside JobGuard.

### Previous candidate — v1

Freeze accepted_net_value at switch-live and retain quoted and final values. Flag—never auto-penalize—won-but-not-live jobs, material accepted/quoted/final variance, inconsistent live-job activity and recovery marked settled outside the app. Signals are not proof. Cap basis, thresholds and any consequence remain undecided; the optional greater-of-accepted-and-quoted cap is not selected.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
