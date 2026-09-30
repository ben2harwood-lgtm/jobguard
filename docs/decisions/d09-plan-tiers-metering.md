# D09 — Subscription pricing and metering

- **Status:** `proposed`
- **Owner / required approver:** Commercial and accounting owners
- **Policy version:** `subscription_pricing_policy_v4`
- **Dated approver evidence:** None — revised on 2026-09-30 (BUILD_PLAN rev 3.0 §1.3); revised again on 2026-09-25 (BUILD_PLAN rev 2.4 §15); first proposed on 2026-09-13; revised on 2026-09-24 by founder direction (BUILD_PLAN rev 2.3 §14). Direction is not approval. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** production_billing; United Kingdom
- **Source / supporting review:** `BUILD_PLAN.md` §§4 and 10.1; MON-1 and MON-2 (rev 3.0); commercial terms and accounting review required
- **Executable feature gate:** `G4-S; paid_subscription and metering_execution require D09 (plus D02/D05)`

## Exact proposed policy

Small-builder track only. Two plans: Solo £29 a month (4 jobs on the go) and Builder £69 a month (7 jobs); extra jobs £20 a month each, billed by the day, capped at 1 (Solo) and 5 (Builder), monthly maximums £49 and £169; the v3 counting rules, small-job allowance, free first job and annual terms unchanged. The Firm (£179) and Contractor (£349) plans are withdrawn. The deal is per company: an account that runs more than 7 jobs at once in any 2 of 3 consecutive monthly billing periods is moved to the contractor deal (D16) with notice, once a contractor agreement and data processing agreement are signed (until then it stays on Builder and pays extra jobs); short peaks are billed as extra jobs; jobs already live at the move finish on their original terms. Subscription payments never offset success fees. Proposed parameters (BUILD_PLAN §10.1): the move to the contractor deal is triggered by at least 10 days above 7 places in two of the last three monthly billing periods, using the proposed measurement rule pending founder confirmation, or immediately when a Builder account passes its grace place; on Builder nothing is ever blocked and the monthly maximum holds; the trial ends when the trial job is locked, closed, or after 90 days; the £4,000 small-job trip is never reversed; "quoted value" is the highest net quote sent; a quiet month counts while it runs.

### Previous candidate — `subscription_pricing_policy_v3`

_(Section references in previous candidates refer to the archived plan revision in force at the time; see `docs/archive/`.)_

Jobs-on-the-go subscription (BUILD_PLAN §15.1): Solo £29 (4 jobs), Builder £69 (7), Firm £179 (13), Contractor £349 (20), over 36 on request; extra jobs £20/£20/£25/£30 a month by the day, capped at 1/5/6/16 extras so a plan plus extras never exceeds the next plan; small jobs under £2,000 (greater of quoted and accepted) take no place up to the plan's included count, and take one if the pre-lock final account passes £4,000; counting starts at first site evidence or day 31 after switch-live and stops at lock, Finished on site + 7 days, a month of no site activity, or close; free first job while it is the only live job, until lock or 90 days, one per business; annual = two months free on the plan price; unlimited users; plan entitlements per MON-8. Weighted big-job places (I03) and £0 empty months are parked for pilot data. Subscription payments never offset success fees.

### Previous candidate — `subscription_pricing_policy_v2`

A recurring subscription per builder business pays for the always-on service. Define: amount, monthly and annual frequency, any trial or free period, optional active-job or business-size tiers, cancellation, price changes and notice, grandfathering, and payment failure. Subscription payments never reduce, credit or offset JobGuard success fees, and are not refunded because a success fee is earned. The synthetic demo may use `placeholder_subscription_v0` (£30.00/month principal) labelled as a placeholder, never as a price.

### Previous candidate — v1

No tier price, included-job count or limit is assumed. Before implementation, define concurrency intervals, billing periods, inclusions, credits and upgrade approval. Subscription credit must not duplicate the per-job £79 credit.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
