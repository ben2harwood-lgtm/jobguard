# D16 — Enterprise commercial terms

- **Status:** `proposed`
- **Owner / required approver:** Founder (product/commercial) plus solicitor and accountant review
- **Policy version:** `enterprise_site_capture_policy_v1`
- **Dated approver evidence:** None — revised on 2026-09-30 (7-job line, BUILD_PLAN rev 3.0 §1.3); proposed on 2026-09-28 by founder direction (BUILD_PLAN rev 2.5 §16). Direction is not approval; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** synthetic_demo until approval; enterprise pilots and production charging need approval; United Kingdom
- **Source / supporting review:** `BUILD_PLAN.md` §§9.1.5–9.1.9 and 9.1.13; ENT-14 (rev 3.0); AGENTS.md §5.16; contract review by a solicitor; VAT and revenue treatment by an accountant (D02)
- **Executable feature gate:** `G1 plus a signed pilot agreement and DPA for real contractor data; G4-C for enterprise_fee_posting and enterprise_fee_collection; both require D16 (plus D02, D12)`

## Exact proposed policy

JobGuard earns 10% of the net (ex-VAT) value of site-originated extras that are approved, billed and paid. A site-originated extra was first raised in JobGuard by a site user, or surfaced by JobGuard and confirmed by the contractor; is not on the work order, quote or instructed schedule; and carries origin evidence (user, role, device, time, job, photo or note, and where possible the resident's confirmation). Never fee-bearing: original order lines, office entries, client-instructed variations, rejected, undone or unbilled extras, unpaid or pending amounts; reversals and credits reverse the fee. Origin is set once by the server and duplicates collapse. The fee is cumulative, exact-money and rounded once. Candidate platform charge: none (success fee only); minimum annual commitments, onboarding fees and volume-banded rates are negotiable and recorded per contract version. The fee arises on paid amounts reconciled monthly from the contractor's billing and payment data, with audit rights both ways; This revision permits fees only on approved, billed and paid amounts; fee-on-invoice with true-up is outside its authorized scope and remains disabled. One monthly statement per contractor, invoiced by JobGuard. The contractor's approval chain alone makes an extra billable. Routing site extras around the app to avoid the fee is addressed by contract and advisory analytics; no signal creates a charge.

Which firms are on this deal (founder decision 2026-09-30): the deal is per company, never per person. Firms that start above 7 jobs at once, or that want operatives logging extras, join this deal directly; a small-builder account that runs more than 7 jobs at once in any 2 of 3 consecutive monthly billing periods is moved to it with notice once this agreement and a data processing agreement are signed; jobs already live at the move finish on their original terms.

Founder direction 2026-09-30 (Command Center card `jobguard-open-policy-details`, "Accept as proposed"): a fee binds to the agreement version in force when the extra was raised, and the fee base never exceeds the approved value when the contractor bills more. This is direction, not formal approval evidence.

Open for approval: the formula for any volume bands or minimums (the fee engine refuses them until defined); whether a fee binds to the agreement version in force when the extra was raised (reference choice) or when it was paid; whether the fee base is capped at the approved value when the contractor bills more; whether any volume bands or caps apply; minimum commitments; implementation and contractual evidence for the fixed fee-on-payment rule; pilot-period terms; the baseline method used in pilots.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
