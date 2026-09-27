# D09 — Subscription pricing and metering

- **Status:** `proposed`
- **Owner / required approver:** Commercial and accounting owners
- **Policy version:** `subscription_pricing_policy_v3`
- **Dated approver evidence:** None — revised again on 2026-09-25 (BUILD_PLAN rev 2.4 §15); first proposed on 2026-09-13; revised on 2026-09-24 by founder direction (BUILD_PLAN rev 2.3 §14). Direction is not approval. Approval is founder-reserved; a future approval must identify approver, date, evidence URI/reference, and the exact policy version.
- **Applicable environment / jurisdiction:** production_billing; United Kingdom
- **Source / supporting review:** BUILD_PLAN.md §§2, 14.1, 14.13; commercial terms and accounting review required
- **Executable feature gate:** `G4; paid_subscription and metering_execution require D09 (plus D02/D05)`

## Exact proposed policy

Jobs-on-the-go subscription (BUILD_PLAN §15.1): Solo £29 (4 jobs), Builder £69 (7), Firm £179 (13), Contractor £349 (20), over 36 on request; extra jobs £20/£20/£25/£30 a month by the day, capped at 1/5/6/16 extras so a plan plus extras never exceeds the next plan; small jobs under £2,000 (greater of quoted and accepted) take no place up to the plan's included count, and take one if the pre-lock final account passes £4,000; counting starts at first site evidence or day 31 after switch-live and stops at lock, Finished on site + 7 days, a month of no site activity, or close; free first job while it is the only live job, until lock or 90 days, one per business; annual = two months free on the plan price; unlimited users; plan entitlements per MON-8. Weighted big-job places (I03) and £0 empty months are parked for pilot data. Subscription payments never offset success fees.

### Previous candidate — `subscription_pricing_policy_v2`

A recurring subscription per builder business pays for the always-on service. Define: amount, monthly and annual frequency, any trial or free period, optional active-job or business-size tiers, cancellation, price changes and notice, grandfathering, and payment failure. Subscription payments never reduce, credit or offset JobGuard success fees, and are not refunded because a success fee is earned. The synthetic demo may use `placeholder_subscription_v0` (£30.00/month principal) labelled as a placeholder, never as a price.

### Previous candidate — v1

No tier price, included-job count or limit is assumed. Before implementation, define concurrency intervals, billing periods, inclusions, credits and upgrade approval. Subscription credit must not duplicate the per-job £79 credit.

## Approval requirement

This record is not approval and must fail closed wherever its executable gate applies. Changing this policy requires a new version and must not rewrite historic terms or facts.
