# D10 — Pursuit and banking route

- **Status:** `proposed`
- **Owner / required approver:** Appropriate legal/regulatory owner and provider onboarding owner
- **Policy version:** `pursuit_banking_policy_v2`
- **Dated approver evidence:** None — revised again on 2026-09-25 (BUILD_PLAN rev 2.4 §15); proposed on 2026-09-13. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** real recovery pursuit and banking; United Kingdom
- **Source / supporting review:** `BUILD_PLAN.md` §4, MON-6 and M4-5 (rev 3.0); legal/regulatory review and provider onboarding evidence required
- **Executable feature gate:** `G4-S; real_pursuit and bank_feed_activation require D10 (and D04/D12)`

## Exact proposed policy

Adds pay-now links and stage collection (MON-6): card and pay-by-bank through the builder's own provider account (direct charges), JobGuard never holds funds; a capped JobGuard fee (about 0.3% card, 20–30p pay-by-bank, capped £6–£15 a payment); bank transfer always shown equally; no customer surcharge; identical invoice presentation whether or not it carries a Final Check item. Synthetic build is permitted; live use requires a written payment-regulation opinion and a VAT ruling.

### Previous candidate — `pursuit_banking_policy_v1`

_(Section references in previous candidates refer to the archived plan revision in force at the time; see `docs/archive/`.)_

The builder sends approved factual communications; JobGuard does not autonomously collect debt or represent the builder. Use only an approved TrueLayer consent/licensing route and never hold customer funds. A tone filter is not regulatory approval.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
