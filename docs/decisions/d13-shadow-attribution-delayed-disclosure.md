# D13 — Shadow attribution and delayed disclosure

- **Status:** `proposed`
- **Owner / required approver:** Founder (product/commercial) plus legal review
- **Policy version:** `shadow_attribution_policy_v3`
- **Dated approver evidence:** None — revised on 2026-09-28 (BUILD_PLAN rev 2.5 §16); revised again on 2026-09-25 (BUILD_PLAN rev 2.4 §15); proposed on 2026-09-24 by founder direction (BUILD_PLAN rev 2.3 §14). Direction is not approval; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** synthetic_demo until approval; pilot_no_charge shadow processing and production success fees need approval; United Kingdom
- **Source / supporting review:** `BUILD_PLAN.md` §10.2 (small builders) and §9.1.10 (contractors) (rev 3.0); AGENTS.md §5.14; legal review of disclosure and fairness required
- **Executable feature gate:** `G1 for real-data shadow processing; G4-S for missed_variation_final_account fees; both require D13 (plus D12)`

## Exact proposed policy

v2 applies to the SME track only. On the enterprise track (BUILD_PLAN §9.1.10) possible extras are surfaced live to the contractor's supervisors and nothing is held until a final bill; an optional end-of-job check may be enabled per contract, and anything it surfaces that the contractor confirms is fee-bearing as a JobGuard-surfaced extra under D16.

### Previous candidate — `shadow_attribution_policy_v2`

_(Section references in previous candidates refer to the archived plan revision in force at the time; see `docs/archive/`.)_

D13 v1 plus: any pre-lock disclosure route (a future "Tell me now" option, a trial job shown live, a paid human or drawing review, an upgrade bridge) makes the signal fee-free at the moment it is created; evidence dated before an imported job was adopted is fee-free forever; a supplier or order line outside the quote and extras stays evidence, not must-surface, unless a must-surface rule fires (founder decision 2026-09-24). "Tell me now" is parked until the pilot measures whether the Final Check reads fair.

### Previous candidate — `shadow_attribution_policy_v1`

JobGuard may hold possible unbilled work found in job evidence as hidden shadow signals until the builder locks the final account, then reveal it. Builder capture — a Log an extra record in any state, a line added at final review before lock, or baseline scope — is always fee-free. Everything else, including diary and voice notes not submitted as Log an extra, is evidence. Ambiguous matches resolve in the builder's favour. A valid lock is one immutable, builder-declared record per job binding the final-account revision, baseline, capture snapshot, declaration text, actor and server time; final invoice issue requires it. Only evidence received before lock can qualify.

Must-surface rules override hiding: a safety implication; a clear customer request for work above a threshold to be approved here where written agreement is needed before the work proceeds; an active dispute that silence would materially worsen; any legal or contractual duty to tell. Any disclosure before lock, by any route, makes the signal permanently fee-ineligible. Disputed attribution is reviewed by a human against the immutable record; unresolved disputes are fee-free. Onboarding discloses the final check and success fee before the first job. Shadow data is readable only by an isolated worker role; support access is break-glass and audited.

Open for approval: the must-surface value threshold, the dispute process, the onboarding wording and whether evidence imported after lock can ever qualify in a later version.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
