# JobGuard: pricing by live jobs, and every credible way to earn more

**For:** the founder
**Date:** 25 September 2026
**Status:** analysis and recommendation. Nothing here is an approval. Every number for the three builder types is an assumption until the pilot measures it (`BUILD_PLAN.md` §14.17). Prices are ex VAT unless stated.

**What this report draws on:** the merged pricing design, the three refutations of it (gaming, revenue, builder acceptance), 98 monetisation ideas each judged by three lenses (trust, legal, commercial), the competitor and pricing research report at `reports/JobGuard competitor and pricing research.md` (cited by section title) and its raw notes in `research_notes/JobGuard competitor and pricing research/`, `BUILD_PLAN.md` §14 and decision records D01–D13 in `docs/decisions/`.

**What a reader can and cannot check.** The research report, the build plan and the decision records are files in the repository. The pricing design, the three refutations and the lens scores are not: they were produced as steps of the same workflow that wrote this report and were not saved as files, so a reader cannot open them. The Trust and Composite columns in section 2 are the only record of the scores, and they should be treated as this report's own claims, not as independently checkable evidence, until those inputs are saved (recommended: `reports/inputs/`). "Three lenses" means three separate model passes with different briefs (trust, legal, commercial), not three people and not three different models. In the terms of `AGENTS.md` §5.13 every score here is a model opinion that has been source-inspected against the plan and the research; nothing in this report has been independently verified by a person.

---

## The answers in one page

1. **Yes, charging by the number of jobs live at once works.** It is what ServiceM8 already sells, builders understand it, adding a labourer never costs anything, and it gives a twelve-fold spread between a sole trader (£29) and a large firm (£349+). It needs four things to work: no cliffs (a small per-extra-job charge instead of a forced upgrade), a definition of "live" that matches "on site", a free allowance for small jobs, and honesty that it tops out around £350–£830 a month even for the biggest firm you target.
2. **Recommended ladder:** Solo £29 (4 live jobs), Builder £69 (7), Firm £179 (13), Contractor £349 (20). Extra jobs £20 a month each on Solo and Builder, £25 on Firm, £30 on Contractor, up to a cap that is never dearer than the next plan. Jobs under £2,000 do not take a place (a fairness exception to the count, not part of the meter). Your first live job is free. The 10% success fee is identical on every plan and never offset by the subscription.
3. **Expected subscription revenue:** Solo about £350 a year, small firm about £830, firm about £2,600 (roughly £130 a month under your candidate £349, unless the firm runs 20+ jobs or chooses Contractor for its features). All three are computed on the same assumed month-by-month job profile in section 1.
4. **The top earners beyond the subscription** are unglamorous: collecting the success fee on the same screen as the customer's payment, a capped fee on card and pay-by-bank links, a first-job-free trial with the card taken at switch-live, checks on who is actually paying, and the workflow features (staged invoicing, Construction Act notices, retention tracking, evidence packs) that give a firm a reason to pay £179 or £349. On section 5's sceptical assumptions the add-ons together earn between a third of the subscription and about the same again (Solo £110–£300 on £348; small firm £400–£900 on £828; firm £1,400–£2,650 on about £2,600), and the success fee adds another 15–45%. Useful, not multiples.
5. **What to avoid:** any money from a merchant, a lender, a lead platform or the builder's homeowner customer; insurer and trade-body commissions only under a separate partner-commission record and never in the no-charge pilot; any change to the 10% rate itself (managed recovery in section 2 is a separately chosen service charge layered on top of the unchanged 10%, not a second success-fee rate); any charge on money the builder could have had anyway (their own VAT, CIS, negotiation); and, above all, any product that puts a price on JobGuard's silence (a paid "show me what you found" button). The research is clear that the hidden final check, not the 10%, is the trust risk; several ideas would make that risk visible and permanent.
6. **What needs deciding:** D09 v3 (the ladder), D05 (the monthly maximum you may take), D13 v2 (three small changes so JobGuard never earns from things it could have prevented), D03 v3 (three small additions), D12 v3 (customer checks and the homeowner portal), and two new records (paid data services; partner commissions). A solicitor is needed for six specific points and an accountant for four; listed in section 6. Legal labels throughout are the legal lens's opinions pending that solicitor review, and a glossary of the trade, legal and plan terms is in section 8.

---

## 1. Does pricing by live jobs work?

### Verdict

**Yes, with conditions.** Counting jobs live at once is the right meter, and better than turnover or contract value:

- It is already accepted in this market. ServiceM8 prices by jobs with unlimited users (research report, "UK builders already pay £25–£45 a month, and quoting is becoming free").
- It never punishes you for adding the site lead or the labourer who takes the photos JobGuard needs.
- The builder controls it and can see it: "3 of 4 jobs on the go" is a sentence anyone understands.
- It stays below what the builder already pays for their per-user tool at every size, and it is an addition to that tool, not a replacement (JobGuard sits alongside a job-management app; section 7). So the honest comparison is additive: £29 on top of Tradify's £34 for one user; £69 on top of £100–£220 for three to five seats; about £220 on top of £204–£440 for six to ten seats (6 × £34 to 10 × £44). The pricing design's "fifteen seats at £480–£660" counted every labourer as a seat. The research says only that per-seat pricing discourages adding labourers ("Charge for live jobs, not people"); it has no evidence on how many seats firms actually buy, so six to ten is an assumption (section 7).
- Cross-check, not re-argument: it yields 0.13–0.23% of turnover, the same band a turnover meter would land in, measured by something visible and fair.

The three refutations agreed the meter itself is sound. What they attacked was the edges: the definition of "live", the ceiling on extra jobs, the small-job allowance, the trial, and a ladder that looked simple but hid twenty numbers. The ladder below is the pricing design with those fixes applied.

### The recommended ladder

| Plan | Price a month | Live jobs included | Each extra job | Most extras allowed | Most you can be charged in a month | Per included job |
|---|---|---|---|---|---|---|
| Solo | £29 (£290 a year) | 4 | £20 | 1 | £49 | £7.25 |
| Builder (the plan most will pick) | £69 (£690 a year) | 7 | £20 | 5 | £169 | £9.86 |
| Firm | £179 (£1,790 a year) | 13 | £25 | 6 | £329 | £13.77 |
| Contractor | £349 (£3,490 a year) | 20 | £30 | 16 | £829 | £17.45 |
| Above 36 live jobs | priced on request | | | | | |

**Rules that go with it**

- **Unlimited users on every plan. Quoting is free forever.** The 10% success fee is the same on every plan and is never reduced, credited or offset by the subscription (fixed decision; `AGENTS.md` §5.10).
- **Extra jobs, not upgrades.** When you switch a job live beyond your plan, it costs the extra-job price for the days it is live (about 66p a day on Solo and Builder). Nothing is ever blocked. When you reach the most extras allowed, the next switch-live shows a one-tap move to the next plan, which by design always costs the same or less than staying on extras. A second job beyond the cap needs that tap first.
- **The "most you can be charged" column is the fixed monthly maximum** you agree to at sign-up. JobGuard cannot take more than it in any month without a new decision from you (this is what the build plan calls the D05 bounded standing authority).
- **The effective monthly price rises smoothly with jobs**, with no cliffs: 1–4 jobs £29; 5 £49; 6–7 £69; 8 £89; 9 £109; 10 £129; 11 £149; 12 £169; 13 £179; 14 £204; 15 £229; 16 £254; 17 £279; 18 £304; 19 £329; 20 £349; 21 £379; 25 £499; 30 £649; 36 £829.
- **Small jobs are free.** A job whose accepted value is under £2,000 (the greater of what was quoted and what was accepted, so a discount cannot buy the allowance) takes no place. Fair use: up to your plan's included number of small jobs at once. It is tested once, at switch-live. If the final account before lock grows past £4,000, the job takes a place from that day, shown on the job list and the bill only, never on the Log an extra or approval screens. Be clear about what this is: the allowance and the £4,000 trip are value-based exceptions to your count meter, chosen for fairness (a £900 boiler swap should not cost a place), not part of the meter. The trip also creates a small incentive to under-log extras on a small job that is nearing £4,000 (£20 a month is at stake). The pilot should check for it by comparing logged-extra rates on small jobs that approach £4,000 with all other jobs; if under-logging shows, raise the trip or drop it.
- **First job free.** Your first live job costs nothing until you complete its final account or 90 days, whichever comes first; no subscription is charged while it is your only live job. The card is asked for at that switch-live (with a "skip for now"; it must be on file before a second job goes live). The success fee applies normally on that job so you experience the real model. One trial per business (company number where one exists, otherwise phone number and payment card; no tax identifiers, so no VAT number, are collected). Because the free period ends as soon as a second job goes live, it is worth £30–£60 to a sole trader who starts with one job and almost nothing to a firm that migrates several jobs at once.
- **Annual plans** get two months free on the plan price only; extra jobs are billed monthly and never discounted. Offered, never pre-selected, and only after six months of monthly data so the discount is not handed to people who would have paid monthly anyway.
- **No live jobs, no charge.** A monthly plan with nothing counting for a whole month drops to £0 (data kept, quoting on) and restarts at the next switch-live. Pilot experiment, not a promise. The Solo figures below assume no £0 month; a sole trader with one empty winter month pays £319 instead of £348.
- **Downgrades** take effect at the next billing date and only if your current count fits the smaller plan plus its extras. Upgrades are immediate and pro-rated.
- **Not in the ladder: weighting big jobs.** An earlier draft reserved a rule that a job over £50,000 counts as two places and over £150,000 as three. That is I03, which section 4 parks as contract-value pricing by the back door, so it is not written into D09 v3. It is recorded there as the only lever left if the pilot shows Firm-tier revenue is genuinely too low; switching it on would be a price change with notice and a new D09 version.

### How a live job is counted (the sentence for the pricing page)

> "We count the jobs you've got on the go, not jobs you've ever created. A job starts counting when work starts on site, or 30 days after you switch it live, whichever comes first. It stops when you complete the final account, mark it finished on site, or it goes quiet for a month. Small jobs (under £2,000 when accepted) don't take a place, up to your plan's number of them at once; if a small job grows past £4,000 before you complete the account, it takes a place from then. Your first job is free."

That sentence now says the same thing as the rules table below (the earlier draft's "stops when you send the final bill" and "jobs under £2,000 never count" did not). The line about how many jobs a typical sole trader or small firm runs was removed: it was this report's assumption, not something to tell customers as fact. The rules behind the sentence, in plain terms:

| Question | Rule | Why |
|---|---|---|
| When does counting start? | At the first site evidence (a proof or progress photo, a delivery note, a diary entry) or 30 days after switch-live, whichever is first. Purchase orders and supplier invoices do not start the clock. | Builders win work weeks before starting. JobGuard's order checks and readiness warnings need the job live before site start, so the won-but-not-started period must not cost money, or builders will delay switch-live and lose the prevention value. (Builder-acceptance fix, adopted.) |
| Can I use the watchdog on a job I have not switched live? | No. Purchase orders, supplier documents, proof uploads, extras, diary notes and customer messages all need the job to be live. | Otherwise "accepted but not live" becomes a free way to run the whole job. The pricing design assumed this; the gaming refutation found it was not built. (Adopted; a build change.) |
| When does counting stop? | At the earliest of: completing the final account (the lock); "Finished on site" (counting stops seven days later); a month with no site activity; or closing the job with a recorded reason. | The seven-day tail stops weekly pause-and-resume rotation (gaming fix); the month of quiet replaces the 45-day prompt and 60-day rule with one number a builder can remember (builder-acceptance fix). |
| What if work happens after the lock? | Confirming catches, invoicing, payments, retention release and snagging photos never count. New site work (a new order, a supplier invoice, a progress photo, a new extra) is redirected to a new linked job. The final invoice must derive from the locked account. Completing the account requires each scope item to be marked done, removed or deferred. | Closes the "lock on day one, run the job for free, keep all catches fee-free" exploit found by the gaming refutation, without ever charging for the day JobGuard reveals its own findings. (Adopted.) |
| What about long jobs, retention and jobs never locked? | A twelve-month build counts for twelve months; that is the honest cost of a job that long. Retention outstanding after the lock is a payment-side fact and never re-enters the meter. A job never locked stops counting after a month of quiet; you can also close it (no final check on that job). | Builders cannot be forced to lock. The real incentive to lock is the final check and the final invoice, both of which need it. The fee-side residual (a builder who invoices outside JobGuard to avoid both the place and the fee) is accepted plainly, as §14.10 already does. |
| One job or two? | One job = one paying customer + one site address + one accepted quote. Two customers can never share a job. Overlapping jobs for the same customer at the same address count as one place, however many quotes. A quote covering several addresses becomes linked jobs, one per site, or the builder attests it is one site. | Builders think in addresses ("the Elm Road job"), not quotes. Customer and site must be structured fields at switch-live, not free text; needed anyway for attribution and the customer checks in section 2. |
| Imported in-flight jobs? | Same start rule as any job (first site evidence or day 31). An import matching an existing customer and site is linked, not reset. Imports at the invoiced stage never count. | Welcomes a firm migrating fifteen jobs; removes the "every job is a free 30-day import" exploit. |
| A subcontractor running a whole development for one main contractor? | One job. | That is under-capture, not gaming: the highest-value users pay Solo or Builder until the Firm/Contractor features exist. Recorded as a known gap, not pretended away. |
| Does anything JobGuard finds ever change the count? | No. The count comes only from your own commands and server timestamps. No hidden signal, finding or document count can move it, and no page, count or bill may vary with hidden findings (§14.3). | The meter must be structurally severed from the shadow bill or it looks like JobGuard profiting from what it withholds. |
| What is on the bill? | A flat line when you are within your plan. Only in a month with extra jobs does the bill list the jobs that went over and their days. The job list always shows "5 of 7 jobs on the go; next job +£20 a month". | Flat prices are what builders prefer; the meter only appears when it bites. |

### Gaming risks and how the ladder handles them

| What a builder might try | What stops it | Honest residual |
|---|---|---|
| Keep small jobs, or all jobs, off JobGuard to stay cheap | Small jobs free; £20 extra job instead of a £110 cliff; first job free; the watchdog only runs on live jobs, so an off-platform job gets no order checks, proof gates, final account or final check | JobGuard loses catch revenue on off-platform jobs, so allowances stay generous. "Won but never switched live" is a signal for a conversation, never a penalty |
| Merge several customers into one job | Impossible by structure: one accepting customer per job, one final account, one invoice | None |
| Split a bigger job into sub-£2,000 quotes | Fair-use cap; the greater of quoted and accepted value; a job whose final account passes £4,000 takes a place | Same customer, same site, quotes within 90 days: shown on the job, advisory only. Accepted residual |
| Pause weekly to pay a seventh | Counting stops seven days after "Finished on site"; any site activity restarts it | None material |
| Lock early, keep working | Post-lock site work goes to a linked job; final invoice derives from the lock; completing the account needs every item dispositioned | A builder who lies about completion forfeits the final check on the rest; accepted |
| Never lock; invoice outside JobGuard | Counting stops after a month of quiet, so there is no incentive on the meter side | Fee-side residual already accepted in §14.10 |
| Bulk-import to run free final checks on old work | Harmless: imported baselines are labelled, and the fee is only ever triggered by the builder confirming a catch and getting paid | None |
| Sit on extras forever instead of upgrading | Capped at an amount never dearer than the next plan; a prompt when you have lived within one job of the cap for two months in a row | Acceptable |
| Three Solo accounts instead of one Firm | Company number per account where one exists; shared users, phone numbers and payment cards flagged for review | Low priority: per-job prices are close across plans, so the gain is small |
| A cached counter charging the wrong amount (JobGuard's own risk) | The count is rebuilt from immutable events with server timestamps; a cached number can never trigger a charge; late events post a correction line in the next month, never an edit | This is the risk that would destroy trust fastest; it is a build requirement, not a policy |

Every mitigation above is either a structural rule or an accepted residual. The pricing design listed several "advisory signals" as mitigations; the gaming refutation was right that a signal which by rule can never change a price is not a mitigation, so they are relabelled as residuals here.

### What the refuters said and which fixes were adopted

| Refutation | Its main point | Adopted? |
|---|---|---|
| **Gaming** | The cap on extra jobs was only checked at switch-live, so resume, reopen and imports could push a Solo tenant to 11 counted jobs with no upgrade | Yes: the cap is checked at every command that adds a place |
| | Pause with no minimum turned a concurrency meter into an activity-days meter | Yes: seven-day tail |
| | Early lock was a double win (free place, all catches fee-free) because the watchdog kept running on locked jobs | Yes: lock ends site work; new work goes to a linked job; final invoice derives from the lock |
| | Import grace could be claimed on every job | Yes: same start rule for all jobs; matching imports are linked |
| | Watchdog commands were not gated on the job being live | Yes: build change |
| | The £4,000 trip only fired on approved variations; fair use was flat across tiers; "one customer, one site" was unenforceable because customer and site were free text | Partly: trip moved to the final-account value before lock, shown only on the job list and bill; fair use scaled to the plan; customer and site become structured fields |
| | Advisory signals are not mitigations | Yes: relabelled as residuals |
| **Revenue** | The cap rule made every lower plan plus extras no dearer than the next plan, so the hero plan was never the rational choice | Yes: Solo allows only one extra, so the sixth job moves you to Builder |
| | The firm was under-charged by more than the meter requires; Contractor gave four places away | Yes: extra jobs £25 on Firm and £30 on Contractor; Contractor 20 places (your number); per-job price now rises at every step |
| | The two-period upgrade prompt could never fire | Yes: replaced by "within one job of the cap for two months" |
| | The trial was a place exclusion that did nothing on a flat plan | Yes: specified as "no subscription while the trial job is your only live job" |
| | The 1,000-builder illustration ignored trial, pause and annual; the per-seat comparison counted every labourer | Yes: year-one figures shown separately; comparator restated as an addition to an assumed six to ten seats (the research has no data on seats bought); JobGuard positioned as sitting alongside a job-management app, not replacing it |
| | Contractor at £399 or a £699 rung for 40 places | Not adopted: kept your £349 at 20 places, with £30 extras up to 36 and "on request" above, which reaches £829; revisit with pilot data |
| **Builder acceptance** | The ladder claimed one number per tier but hid fifteen rules and twenty numbers; all three archetypes sat at or over their limit | Partly: Solo 4 and Builder 7 (they proposed 4/8/14/28); Firm 13 and Contractor 20 keep the revenue lens's shape. Rules cut to the sentence above |
| | "Live" (switch-live to lock) did not mean "on site", so the meter charged the won-not-started weeks JobGuard's prevention needs | Yes: counting starts at first site evidence or day 31 |
| | Quote-based identity made a second quote at the same address a second place | Yes: same customer, same site, overlapping = one place |
| | Rules fired at the wrong moment (the £4,000 trip on the approval screen; the £20 line attached to a job; the 90-day combined-value rule punishing repeat customers) | Yes: trip on job list and bill only; combined-value test advisory only |
| | Five concepts to stop a job counting | Yes: one word ("Finished on site"), one quiet rule (a month) |
| | The cap gated switch-live | Partly: the job goes live; the upgrade is shown as the cheaper choice; only the second job past the cap waits for the tap |
| | Builder words as policy text; a bill that is flat unless you went over | Yes |

### Revenue by builder type

Assumptions, labelled: Solo runs 2.5 live jobs on average (19 jobs a year at £8,000, each live about 7 weeks: 19 × 7 ÷ 52 = 2.6), 30% under £2,000. Small firm 5.5 live (24 jobs at £25,000, about 12 weeks each: 24 × 12 ÷ 52 = 5.5), 15% under £2,000. Firm 15 live (33 jobs at £60,000, about 5.5 months each: 33 × 5.5 ÷ 12 = 15.1), 5% under £2,000. Peaks run higher than averages, which is what the extra-job charge captures.

To price all three ladders on the same footing, each archetype is given an assumed month-by-month profile of counted jobs (live jobs after the small-job allowance; the same counting rules are applied to every ladder, only the prices and limits differ, and a builder is assumed to sit on one plan all year rather than re-tier monthly):

- Solo: 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 4 (average 2.1 counted; one month at 4; no £0 month).
- Small firm: 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 7 (average 4.8; three months above 5; none above 7).
- Firm: 13, 13, 14, 14, 14, 14, 15, 15, 15, 15, 16, 17 (average 14.6; ten months above 13).

| | Recommended ladder | Your candidate ladder (£29 ≤3 / £69 ≤5 / £179 ≤10 / £349 ≤20) | Research report's ladder (£29 ≤3 / £59 ≤10 / £119 ≤25) |
|---|---|---|---|
| Solo | £29 × 12 → **£348 a year**; about £18 per job; 0.23% of turnover. A month at 5 would add £20 | £388 (the month at 4 costs £69) | £378 (that month costs £59) |
| Small firm | £69 × 12 → **£828 a year**; about £35 per job; 0.14%. Each month at 8 would add £20 | £1,158 (three months at 6–7 cost £179 each) | £708 |
| Firm | 2 × £179 + 4 × £204 + 4 × £229 + £254 + £279 → **about £2,600 a year** (£2,500–£2,750 across plausible profiles); about £220 a month; about £80 per job; 0.13% | £4,188 (every month is over 10) | £1,428 |
| Firm if it runs 20+ jobs or wants the Contractor features | £349 → £4,188 | £4,188 | £1,428 |
| Year one, with the free first job | about £300 / £828 / £2,600. The free period only runs while the trial job is the only live job, so it is worth £30–£60 to a sole trader who starts with one job, and nothing to a small firm or firm that migrates several jobs at once (at most one month's plan, £69 or £179, if they onboard one job at a time) | | |
| 1,000 paying builders (60% Solo, 30% small firm, 10% firm) | about £715,000 a year at steady state (600 × £348 + 300 × £828 + 100 × £2,600); about £690,000 in year one from the free first job alone; ramp-up and churn are not modelled and would lower it further | | |

Against your candidate ladder: same Solo price; same £69 at five jobs; the 5-to-6 and 10-to-11 cliffs are gone (on the profile above they cost the sole trader £40 and the small firm £330 a year); the per-job price still rises with size; the fifteen-job firm pays about £130 a month less unless it runs 20+ jobs or wants the Contractor features. Against the research ladder: £10 a month more for the small firm in exchange for the places it actually needs; roughly double for firms, which the per-seat comparison supports.

### What a jobs meter cannot capture, and whether it matters

- **Job size.** A £2m firm running fifteen extensions and a £600k firm running fifteen kitchens pay the same. The subscription charges the big firm about 0.13% of turnover and the sole trader 0.23%. The honest answer is to accept this: the subscription is a capacity charge; the 10% success fee is the value charge and already scales with job size (a missed £2,400 extra on a £60k job pays £240; the same 4% miss on an £8k job pays £32). The only lever that would close the gap is weighting big jobs (I03), which section 4 parks because it is contract-value pricing by the back door; it is the one thing to revisit if the pilot shows Firm-tier revenue is too low. Turnover or contract value as the meter would push the subscription toward a second percentage fee, which you rejected.
- **The ceiling.** A jobs meter will not go past about £350–£830 a month for a firm this size without becoming a turnover meter in disguise. Do not try. Beyond that the money comes from the success fee, the Firm/Contractor features and the add-ons in section 2.
- **Prevention on jobs kept off the platform.** Free quoting and the small-job allowance mean some value is delivered on jobs that never count. That is the cost of getting evidence and habit onto the system, and it is what keeps the watchdog fed.
- **Does it matter?** If prevention is worth about 1% of turnover (an assumption, in line with a self-reported 30% change-order lift from Buildbite but unproven), the subscription alone captures 13–23% of it (Solo £348 of £1,500; small firm £828 of £6,000; firm £2,600 of £20,000) and the builder keeps the rest. That is the honest shape of a watchdog product and the story the pricing page should tell, with the caveat in section 5 that prevention can never appear on a value receipt.

---

## 2. Every credible way to earn more from the value JobGuard creates

98 ideas were judged. 46 survived all three lenses (trust, legal, commercial), most of them "keep with conditions". 52 were rejected by at least one lens; they are in section 4.

**How to read the table.** Revenue is per builder per year using the commercial lens's revised figures (the sceptical ones), not the idea authors' figures. Trust is the trust lens's score out of 5. Composite is the sum of the three lens scores out of 15; it measures how cleanly an idea survived, not how much it earns, so read it alongside the revenue columns. "Needs" names the decision records (D-numbers) and build-plan tasks that gate it. The subscription line uses section 1's figures. Two of the 46 survivors (the extra-job rule and the annual option) are parts of the ladder and are folded into row 1, so the table has 44 rows.

| # | Idea | How it earns | Who pays | Solo | Small firm | Firm | Trust | Needs | Composite |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Live-jobs subscription ladder (I01, with the I02 extra-job rule and the I06 annual option folded in) | Monthly plan by jobs on the go, plus extra jobs by the day; annual at two months free, offered never forced (annual takers pay two months less: £58 / £138 / £358, and £698 on Contractor; blended about −£10 / −£24 / −£63 a year at 17.5% take-up) | Builder | £348 | £828 | £2,500–£2,750 | 5 | D09 v3, D05, D02; M4-13/14 (metering becomes required); G4 | 14 |
| 2 | Same-screen fee statement with prompt collection (I22) | Not new money: the 10% shown beside the customer's payment ("£1,000 received, £100 fee, £900 yours") and collected within days by Direct Debit | Builder, same fee | +£5–£10 | +£20–£40 | +£70–£120 | 5 | D05 (per-statement approval default; opt-in standing authority), D02 (VAT shown); M4-8/9/10/12, GoCardless at M4-15 | 13 |
| 3 | Property constraints check: listed, conservation area, Article 4, planning history, flood (I91) | Included in Builder and above (or £5 an address) | Builder | £0 in tier (£42 if metered) | £0 (£68) | £0 (£84) | 5 | D04 (data sources), reviewed wording; M2-6 readiness | 13 |
| 4 | Pay-now links on every invoice with a capped JobGuard fee (I39) | About 0.3% on cards, 20–30p on pay-by-bank, capped £6–£15 a payment; bank transfer always free. The Solo figure assumes jobs are invoiced in two or three stages (deposit, interim, final), so 40–60 payments a year of which 10–25% arrive through a link. I39's opt-in instant-payout element is dropped: it is the one part that could make JobGuard look like a payment service, and no UK rate for it was found | Builder (deducted by the processor; never surcharged to the customer) | £60–£150 | £150–£350 | £200–£450 | 4 | Legal opinion that JobGuard stays outside payment regulation; new task and D10/D05 extension; D02 VAT ruling; M4-11 onward; G4 | 12 |
| 5 | First live job free, card at switch-live (I10) | Conversion, not a charge: quoting free forever; the paywall is switch-live. Year-one subscription after the free job (section 1 basis): the free period runs only while the trial job is the only live job | Builders who win a job | year-one about £300 | £828 (at most £69 off) | £2,600 (at most £179 off) | 4 | D09 v3 trial terms, D05; wire M4-11 to switch-live; A/B test card vs no card | 12 |
| 6 | Free layer when nothing is live (I05) | Retention: £0 months when no job counts | Nobody | ~£10–£15 retained | £0 | £0 | 5 | D09 v3; M4-13 | 12 |
| 7 | Pre-send quote review by a panel QS (I49) | £195 (£20k–£60k quotes) / £345 (over £60k) per reviewed quote | Builder | ~£40 net | ~£350 net | ~£650 net | 5 | Reviewer contracts, insurance, D04 if any reviewer is outside UK/EU; a D13 rule that anything the reviewer saw is fee-free forever. Commercial lens: run as a manual service on £20k+ quotes first; do not build software until 30%+ of reviews find something the builder accepts | 11 |
| 8 | Staged invoicing, Construction Act notices, retention tracking (I24) | Domestic stage payments free in Builder; the commercial layer in Firm/Contractor or £29–£39 a month | Builder | ~£23 | ~£95 | £235–£470 | 4 | D06 v2 (reviewed templates, England and Wales first), D02 (VAT, reverse charge), insurance; M4-18 to M4-22 (the most expensive build in the plan) | 11 |
| 9 | Contract and payment-schedule pack: solicitor-reviewed terms, cancellation notice, stages (I33) | Standard pack in Builder/Firm; on Solo a flat £5-a-month add-on, repriced here from the input's £10 per quote so that no quote ever triggers a charge (see the §5.10 note below); a referral share on bespoke review | Builder | £30–£60 | £100–£180 | £200–£350 | 4 | Partner solicitor owns templates; D06; the cancellation-notice warning must be free on every plan | 11 |
| 10 | Insurance-backed guarantee and deposit protection registered from the evidence pack (I45) | Insurer pays 10–20% of premium; homeowner funds the premium as a priced, optional invoice line | Insurer commission | £15–£40 | £60–£150 | £150–£400 | 4 | Introducer status confirmed (or IAR under the administrator), D02 (IPT/VAT line), D12, new partner-commission record; never in the no-charge pilot | 11 |
| 11 | Annual profit-leak review by an analyst (I54) | £750 (Builder) / £1,500 (Firm) once a year, locked jobs only | Builder | £0 (not offered) | ~£75 | ~£270 | 4 | Analyst has no view of hidden signals; no tax advice; insurance; needs a year of locked jobs | 11 |
| 12 | Sub-invite growth channel with a month's credit for the inviter (I64) | New tenants from subs who later subscribe | Converted subs | ~£32 | ~£95 | ~£240 | 4 | D09 credit rule (never offsets a fee), D12 notice to subs; scoped role after M2-2 | 11 |
| 13 | "Who actually pays?" payer check for subcontract, landlord, agent and insurer-funded jobs (I92) | £29 per check on the paying entity (free layer from Companies House in Firm) | Builder | £15 | £61 | £218 | 4 | Structured paying-party field on the job (needed anyway); D12 v3; CRA contract; new paid-data record (D14); G4 | 11 |
| 14 | "Check this customer" business counterparty report (I87) | £19 per check (free Companies House layer first) | Builder | ~£23 gross / £11 margin | ~£86 / £45 | ~£253 / £133 | 4 | D12 v3, D04, D07, D14, D02; CRA reseller contract with a minimum commitment; companies only, never individuals | 11 |
| 15 | Check records as evidence in a later recovery case (I96) | No charge; makes the existing 10% cases settle more often | Nobody extra | ~£1 | ~£14 | ~£145 upside | 4 | D12 v3 names the purpose; CRA reports never reused for pursuit; legal sign-off on the pursuit position | 11 |
| 16 | Drawing check: measured takeoff plus "the drawing shows a soil-stack move you did not mention" (I27) | £19 a month add-on (omission warnings themselves free at quote time) | Builder | ~£23 (year 2+) | ~£90 | ~£140 | 4 | New prompt suite and golden set; D04 AI route; D12; a D13 rule that drawing-evidenced items are fee-free | 11 |
| 17 | Rate-review letter and 12-month savings tracker, flat (I77) | £49 per merchant round, or £15 a month "Buying watch" on Solo; folded into Firm | Builder | £10–£18 | £45–£75 | £70–£150 (or £0 in tier) | 4 | D09 add-on SKU; a visible rule that JobGuard takes nothing from any merchant | 11 |
| 18 | "Tell me now" plan toggle: see every possible extra as it arises, no success fee on JobGuard's finds (I67) | +£20 / +£40 / +£60 a month. The input priced it as a per-tier uplift of £49 / £99 / £179; the commercial lens cut it because at those prices the toggle costs most builders more than the fee it replaces and reads as a penalty for not paying. The input's alternative, a single "Builder Live" plan SKU, is rejected (section 4) | Builder | £36 weighted (net ~£10) | £120 (net ~£53) | £252 (net ~£96) | 4 | D09 v3, D13 v2, D05, D12 v3; pilot fairness data first (I75); copy must never call the standard plan "we hold back" | 11 |
| 19 | Statutory late-payment interest on business debtors inside an opened case (I14) | Ordinary 10% of the statutory interest actually paid, and only inside a case the builder opened and agreed fee terms for (ordinary late payment and reminders never count). The fixed statutory compensation (£40 / £70 / £100 per invoice) is excluded from the fee base: it is an entitlement the law gives the builder, not something JobGuard recovered | Builder | £0–£5 | £10–£15 | £40–£90 (plus an unmeasured lift in cases opened) | 4 | D03 v3 (separate line type), D02 (VAT outside scope), homeowners hard-blocked; M4-5/7/8 | 11 |
| 20 | Accounting sync and bookkeeping export (I26) | In tier on Builder/Firm; at most a £4 step on Solo; export-of-record first | Builder | ~£30 | £0 | £0 | 4 | D04 v2 (data leaving to Xero/QuickBooks), D02 tax mappings, D12; M5-1 onward; never claim "MTD-compatible" | 11 |
| 21 | Trade-body endorsed plan (FMB / NFB) with a referral to the body (I60) | Acquisition, not revenue: two months free via a verified membership number; 15% of the first year's plan price (ten paid months) to the body | JobGuard pays the body | £0 incremental (about £44 acquisition cost) | £0 (£104) | £0 (£269) | 4 | Mark licence, self-billing VAT, D09 promo terms; contract refuses any share of fees or view of findings | 11 |
| 22 | Accountant and bookkeeper channel: free practice view, 20% referral share for two years (I61) | Acquisition; later a practice-paid year-end pack | JobGuard pays the practice | −£70 a year for two years | −£166 | −£540; pack £10–£20 at maturity | 4 | Disclosed in the builder's terms; adviser seat has no view of hidden signals; AML check on the year-end pack; drop the bookkeeper introducer fee | 11 |
| 23 | Plan-choice screen, two-way comparison and pilot arms (I75) | No revenue; the instrument that tests whether the hidden final check reads fair before anything is charged. No fairness number can exist until the shadow bill runs on real pilot data | Nobody | £0 | £0 | £0 | 3 | G1 plus D12/D13 approval of the pilot disclosure (§14.11) before any shadow processing of real data; D09 v3 / D13 v2 text as proposals only | 11 |
| 24 | Exposure-vs-limit curve on the stage schedule (I95) | Included in Builder and above: "you are £12,400 out of pocket at week 6 under these terms" | Nobody | £0 | £0 | £0 | 4 | Stage schedule model (I40); CRA display rights if a credit limit is compared | 11 |
| 25 | Managed recovery: JobGuard drafts and runs the chase (I17) | A service charge the builder chooses per case, before JobGuard does anything, layered on top of the unchanged 10% success fee: 5 points for drafted-for-you, 10 points with a solicitor letter, so the builder sees 15% or 20% in total on that case. The 10% rate itself never changes; a builder who does not opt in pays 10% and chases themselves | Builder from recovered cash | ~£20 incremental (net ~£0) | ~£170 (net ~£100) | ~£580 (net ~£400) | 4 | D01 (service-charge table, the 10% untouched), D03 v2, D10, D05; solicitor opinion on whether the arrangement is a damages-based agreement (a "no win, no fee" share of what is recovered, regulated for lawyers; lens opinion); do not hire a desk before pilot data | 10 |
| 26 | Firm Care: named account manager, priority line, quarterly review (I52) | £149–£199 a month on Firm only, once there are ~100 Firm accounts | Builder | £0 | ~£60 (recommend not offered on Builder) | ~£360 | 4 | D09 add-on, D05; support role has no view of hidden signals and a scripted answer to "anything else on this job?" | 10 |
| 27 | Credit-control desk: weekly reminders drafted for one-tap approval (I47) | £49 (Builder) / £99 (Firm) a month | Builder | £15–£25 (loses money) | £90–£150 | £180–£300 | 4 | D10, D05, legal opinion on chasing homeowners under agreed terms; desk cannot open or suggest a case; behind G4 | 10 |
| 28 | Certified evidence pack: anchored, signed, dispute/ADR-ready (I34) | Standard pack in tier; £49–£99 for the anchored or ADR grade; raw export always free | Builder | £10–£45 | £40–£120 | £100–£300 | 3 | D07 (retention), D04 (timestamp provider), D12; never "tamper-proof" or "court-ready"; ordering a pack before lock triggers the must-surface check | 10 |
| 29 | Homeowner job portal: approvals, messages, stage sign-off (I55) | Free; the demand-side foundation; a small lift in confirmed catches | Nobody | ~£10 | ~£35 | ~£120 | 4 | D06 (authenticated customer approval), D12 v2/v3, consumer cancellation-notice kit (legal); real homeowners after G1 | 10 |
| 30 | Live-mode trial job: first job runs "Tell me now", then you choose (I74) | No revenue; a pilot arm | Nobody | −£12 to +£5 | −£15 to +£20 | −£18 to +£53 | 3 | G1 plus D12/D13 approval of the pilot disclosure (§14.11), then D13 v2, D12 v3; run only as one arm of the pilot, not the default | 10 |
| 31 | Duplicate supplier payment refunded in cash (I81) | Ordinary 10% on the cash refund | Builder | ~£1 | ~£3 | ~£15 | 4 | D03 v3 row; needs the bank feed (M4-7) | 10 |
| 32 | Legal escalation via an SRA-regulated partner or claims panel (I48) | Flat builder-paid handoff or fixed-price steps at the partner's direct price; no percentage of adviser fees | Builder pays the partner | £5–£15 | £20–£60 | £150–£700 | 3 | Referral, not resale (the legal lens's reading of the Legal Services Act: JobGuard may introduce a solicitor but may not sell legal work as its own; to be confirmed); commercial disputes only for adjudication; decision record; G4 | 9 |
| 33 | Human-reviewed dispute pack by a panel QS (I35) | £395 / £750 fixed fee; adjudication grade for commercial disputes | Builder | ~£10 net | £25–£80 net | £100–£280 net | 4 | Panel contracts and insurance; reviewer has no view of hidden signals; Firm tier first | 9 |
| 34 | Applied supplier credit notes as qualifying recovery (I13) | Ordinary 10% once a credit is consumed against a later invoice the builder paid in full | Builder | £0–£5 | £10–£25 | £50–£120 | 4 | D03 v3 wording only (no new pipeline); £250 minimum per case | 9 |
| 35 | Watch this customer: monitoring a business payer through the job (I94) | Included in Firm on free feeds (Companies House, Gazette); £3 a month per entity if metered | Builder | ~£3 | ~£22 | ~£99 (or £0 in tier) | 4 | D12 v3 (monitoring purpose with a stop point), D05 if metered; free-source events are never paywalled | 9 |
| 36 | Homeowner property check: title register (£12); named-person CCJ search (£10) deferred (I89) | Pass-through of the official title-register fee (assumed to be a few pounds; verify the current HM Land Registry fee) plus a service margin. I89's insolvency-register search on named individuals is dropped: it raises the same credit-reference question as the CCJ search and waits on the same solicitor view | Builder | £40 gross / £15 margin | £100 / £37 | £120 / £45 | 4 | D12 v3, D07, D14; the CCJ part needs a solicitor's view on credit-reference rules before it exists | 9 |
| 37 | Customer messaging by SMS/WhatsApp at cost plus (I32) | Per message at cost plus (assumption: about 10p a message; no competitor's per-message price was captured in the research); approval and reminder messages free | Builder | ~£30 (margin £18) | ~£84 (£50) | ~£190 (£115) | 3 | D04 (provider), D12 v2 wording that replies are job records; PECR; never nudge a builder to move a conversation in-thread | 9 |
| 38 | White-glove import of in-flight jobs (I51) | Free on Solo/Builder; a £500–£750 Firm package bundled into the first annual | Builder, once | £0 | £0 | ~£450 one-off | 4 | M1-17 decision record, D12 v2 (imported messages); anything predating adoption is fee-free forever | 9 |
| 39 | CIS-suffered year-end pack, flat (I79) | £59 (£99 Firm) per tax year. I79's comparison variant, 10% of CIS deductions reclaimed after the pack (`cis_suffered_reclaimed`), is dropped rather than shown: it is a fee measured on a tax outcome, which the D11 rule in section 4 forbids | Builder | £5–£10 | £10–£20 | £20–£35 | 4 | After M4-22; AML check; "aid, not advice; JobGuard does not file" | 9 |
| 40 | "Records verified in JobGuard" builder profile, quote stamp and structured quote-request page (I56) | Bundle the stamp and quote-request intake into the product; the public profile later. Renamed from the input's "JobGuard-checked": "checked" reads to a homeowner as JobGuard vouching for the builder's work, which the consumer-law wording review would almost certainly reject; "records verified" claims only what is true | Builder | ~£13 (or £0 bundled) | ~£22 | ~£45 | 3 | Consumer-law wording review ("checked" must not imply endorsement); trade mark; nothing from watchdog data ever shown | 9 |
| 41 | Value-floor guarantee: documented catches or your subscription back (I07) | Holds a market-rate price; pays out as a credit note | JobGuard bears the risk | £0 | ≈£0 | ≈£0 | 3 | Not before a year of pilot data on documented value; solicitor confirms it is not insurance; D09 v3, D02 | 9 |
| 42 | Prevention engine as the Builder-and-above differentiator (I08) | The input offered two forms: the prevention engine as what distinguishes Builder and above, or a priced add-on. The commercial lens narrowed it to supplier-document checking as a +£15 Solo add-on, with supplier documents refused at intake on Solo without it. That narrowing is **not adopted**: three-way matching of orders, deliveries and supplier invoices is part of the core flow, supplier documents are the first evidence source the shadow bill relies on (§14.2), and refusing them on Solo would remove both from the 60% of tenants on that plan and starve the final check. Recommended form: supplier-document checking in every tier including Solo; the deeper prevention layers (drawing check, item 16; constraints, item 3; exposure curve, item 24) are what Builder and above get | Builder | £0 direct (the rejected add-on form would have earned £30–£50 net) | £0 | £0 | 3 | D09 v3 tier contents; no intake refusal on any plan | 8 |
| 43 | Deposit and stage collection by Direct Debit (I40) | Bundle into stage payments; earn only the per-collection fee under item 4. I40's variable-recurring-payment variant (amounts set per stage under one mandate) is dropped: it needs a standing authority D05 does not yet allow and puts the Direct Debit indemnity risk on the builder | Builder | £5–£20 | £40–£90 | £80–£180 (overlaps item 4) | 3 | D05, D06 templates, D10 (indemnity risk stated plainly); GoCardless at M4-15 | 8 |
| 44 | Source-scoped live pack: supplier and order lines shown as they arise ("Materials live") (I70) | +£10 / +£20 / +£40 a month | Builder | ~£24 weighted | ~£72 | ~£192 | 3 | The three lenses disagree: legal says a likely ordering mistake should surface free on every plan (D13 must-surface rule); trust and commercial say sell only the materials half and drop the customer-requests half. Treat as a D13 question first, a product second | 8 |

**Ideas that survived all lenses but were told not to be built as described:** item 7 (QS review: manual service first), item 42 (the add-on form is not adopted; supplier-document checking stays in every tier), item 44 (a D13 question, not a product), and items 21, 22, 23, 24, 29 and 30, which earn nothing directly and are kept for retention, conversion or measurement. Items 20 and 40 earn small amounts (a £4 Solo step on the accounting sync; the quote stamp) and are also kept mainly for retention.

**How optional services and metered overage square with `AGENTS.md` §5.10.** §5.10 says creating, editing, reviewing or sending a quote can never create a platform fee, and that the platform charge is a tenant-level subscription, never a per-job base fee. Three things in the table sit near that line and are consistent with it only under these conditions. First, the QS quote review (item 7) is a professional service the builder orders per quote and pays a human reviewer for; it creates no obligation on the job, and a builder who never orders one is never charged, so it is a purchase, not a platform fee. Second, the contract pack (item 9) was input as £10 per quote on Solo; it is repriced here as a flat £5-a-month add-on so that no quote, sent or not, ever triggers a charge. Third, the extra-job charge is a metered element of the subscription defined by D09: it is measured by how many jobs are live at once, starts only when a job goes live beyond the plan, and is never attached to a job's value or to quoting or acceptance. It is a per-place capacity charge on the tenant, which is what D09 describes, not a per-job base fee of the kind §5.10 forbids. If a solicitor or the founder reads it otherwise, the fallback is to drop extras and use forced upgrades, at the cost of the cliffs section 1 removes.

### Notes on the top earners

**Collect the fee on the same screen as the money (item 2).** Not new revenue, but the difference between collecting roughly 85% and 95% of fees across thousands of small receivables in a trade with a well-documented late-payment problem (an assumption: no fee-collection data exists; the table's uplift is 10 points of the fee base, which is what those two numbers imply). The research is direct that a separate invoice weeks later "would feel like an isolated loss". Two cautions: the screen only exists once the customer's payment is bank-verified, which can lag the builder's own "mark paid" by days; and the optional standing Direct Debit authority must be opt-in, capped at the fee on the verified receipt, and never collect during an open dispute. Show the VAT basis on the statement or you breach your own §14.1 rule.

**Pay-now links with a capped fee (item 4).** The one add-on with a proven precedent: builders already pay Fergus 1.6% + 20p in the UK, and Jobber charges 2.9% + 30¢ in the US (its UK rate was not shown; research notes, "uk_trade_job_software"). The Solo figure only works if jobs are invoiced in stages, which the assumption now says. Keep bank transfer free and equally prominent, cap the fee so a £15,000 stage costs at most £15, and prove that the link looks identical on every invoice whether or not it carries a catch, or it leaks the shadow bill and looks like steering. Two things could kill it: a legal opinion that the fee structure makes JobGuard a payment service, and a VAT ruling that adds 20% for builders who cannot reclaim it. Get both before building.

**First job free, card at switch-live (item 5).** The research's own recommendation. The card ask runs against the no-card norm of every UK trade app, so do not hard-block: ask with "skip for now" and require the card before the second live job. Read switch-live rate, not sign-up rate, in the test: every lost switch-live also loses the fee engine on that job.

**Cheap prevention inside the tiers (items 3, 13, 14, 24, 35).** A listed-building or conservation-area constraint surfaced at quote time, the question "who will actually pay this invoice?", a free Companies House card on a business customer, an exposure curve showing how far out of pocket a stage schedule leaves you, and a winding-up petition against your main contractor surfaced mid-job. None earns much on its own; together they are what a small firm points at when asked why it pays £69 or £179. Build them as included features, meter nothing, and charge only for the paid data layer (a credit-agency report) where a reseller contract makes sense.

**The Firm and Contractor reasons to pay (items 8, 11, 25, 26).** A fifteen-person firm working for main contractors wants staged applications, pay-less notices, retention tracking and an evidence pack it can hand to a QS. That is where £179 and £349 become obviously worth buying. It is also the most expensive build in the plan and needs a construction solicitor to review the templates; it cannot exist before the M4-18 to M4-22 tasks. Until then, be plain that Contractor is places plus multi-entity and nothing else.

**Insurance-backed guarantee from the evidence pack (item 10).** The only idea where all three parties plausibly want the thing: homeowners value a guarantee that survives the builder's insolvency (an assumption; the research has no data on homeowner expectations), builders use it to win, and the insurer pays. This is third-party money, which point 5 of the one-page answer otherwise rules out; it is allowed only because the insurer is not a party the watchdog checks, only under a partner-commission record, and never in the no-charge pilot. The uptake assumptions were cut hard (scheme members already have a route) and the regulatory route (introducer status or an appointed-representative arrangement; see the glossary) must be decided before build. Only builder-consented, builder-visible facts ever reach the insurer.

**"Tell me now" (item 18).** The strongest fairness lever in the whole set: it turns the hidden final check into a priced choice the builder makes. It is also double-edged, because the pricing page then has to explain what the standard plan does, and a critic can write "JobGuard charges £20 a month not to withhold things". Roughly revenue-neutral because the builders who take it are the ones who would have generated the most catches. Its value is churn and reputation. Do not ship it before the pilot measures whether the hidden model itself reads fair (item 23); if showing a paid live option lowers how fair the standard plan looks, drop it.

### The same ideas grouped by theme

- **Subscription and packaging:** 1, 5, 6, 8, 18, 26, 42, 44.
- **Fee realisation and small fee extensions (no new rate):** 2, 15, 19, 31, 34.
- **Payments:** 4, 43.
- **Prevention sold at a flat price or included:** 3, 7, 9, 13, 14, 16, 17, 24, 35, 36, 11.
- **Recovery done for you:** 25, 27, 28, 32, 33.
- **Partners and channels (no supplier or lead money):** 10, 12, 21, 22, 38.
- **Demand side and customer relationship:** 29, 37, 40.
- **Measurement and trial design:** 23, 30, 41.
- **Tax-adjacent, flat only:** 20, 39.

---

## 3. Do these first

Ranked by value against friction, and sequenced against the plan's gates: the no-charge pilot (through G1), production billing (G4), and later milestones.

| Order | Do this | Why first | When |
|---|---|---|---|
| 1 | **Lock in the ladder as D09 v3 with the fixes in section 1**, and move the metering task (M4-14) from optional to required: job-days, caps checked at every place-adding command, "Finished on site", the month-of-quiet rule, the small-job allowance tested at switch-live, structured customer and site fields, the free first job, and the bill that is flat unless you went over. Write the counting sentence in section 1 (now aligned with the rules table) into the policy as the builder-facing text and make the replay fixtures prove the sentence and the code stay in agreement whenever either changes. | Everything else hangs off it, and the no-charge pilot should already run the meter with hypothetical prices so the numbers can be measured. | Text now; build during the pilot; charging at G4 |
| 2 | **First job free, card at switch-live, with a real test** (item 5). Ask for the card at switch-live with "skip for now"; require it before the second live job. Run the priced sign-up test the research asks for (£29 vs £39 Solo; card vs no card) and read switch-live rate. | Conversion is the biggest single lever on subscription revenue and the evidence for tradespeople does not exist. | Design now; test at G4 |
| 3 | **Collect the fee on the same screen as the money** (item 2). Per-statement approval by default; the standing Direct Debit authority opt-in, capped, and silent during disputes. | The cheapest protection of fee revenue there is, and the presentation the research says builders accept. | M4-8 to M4-12 |
| 4 | **Pay-now links with a capped fee** (item 4), after two pieces of paper: the payment-regulation opinion and the VAT ruling. Bank transfer always free and equally shown; identical link on every invoice. | The one add-on with a market precedent and real money at every size. | Opinion now; build after M4-11; live at G4 |
| 5 | **Customer approvals and stage sign-off in a portal, stage payments in the product, and the cancellation notice in every domestic quote** (items 29, 8 domestic layer, 9). Smallest slice first: an authenticated "Approve this extra" and "This stage is done" bound to the variation; messaging only after the homeowner notice and consumer-cancellation kit have legal review. | Written customer approval is the single most-wanted thing in this market and makes every variation, builder-logged included, more collectable. The cancellation-notice omission is a real way builders lose whole invoices. | Approvals and stages during M1/M2; messaging after G1 |
| 6 | **Cheap prevention inside the tiers** (items 3, 13, 14, 24, 35): constraints check, the "who pays?" question with a structured paying-party field, the free Companies House card, the exposure curve, monitoring on free feeds. No meters. | Near-zero data cost, strongest trust fit in the set, and the reason a builder can name for paying the tier price. | M2 (constraints, payer field); the rest as the checks are built |
| 7 | **Firm and Contractor depth** (items 8 commercial layer, 11, 25 rate table, 26): staged applications, notices, retention, evidence packs, a Firm-only annual review, and the managed-recovery service-charge table layered on the unchanged 10% (built cheaply into the fee routine; no desk hired until pilot data). | This is where the fifteen-job firm finds £349 worth buying and where the jobs meter's ceiling stops mattering. | M4-18 onward; solicitor-reviewed templates first |
| 8 | **Measure the hold-back before pricing it** (items 23, 30, then 18): randomise pilot builders' first job between hidden and shown; measure perceived fairness after lock; only then decide whether "Tell me now" ships. | Every disclosure idea, including the one that survived, depends on a number nobody has: whether the hidden final check reads fair to the builders who experience it. | Pilot (after G1 and D12/D13 pilot approval); decision before G4 |

Partner channels (items 21, 22) and the insurance-backed guarantee (item 10) are worth doing but are acquisition and retention, not revenue; start them once M4-11 sign-up exists and the partner paperwork is signed. Everything in items 7, 16, 20, 27, 28, 32, 33 is later (M5) or waits on pilot demand.

---

## 4. Avoid or park

Every rejected idea, with the one-line reason from the lens that rejected it. Where two lenses rejected, the decisive one is shown.

### Rejected on trust (a reasonable builder would see JobGuard profiting from its position, or the customer relationship damaged)

| Idea | One-line reason |
|---|---|
| I03 Weighted job slots (big jobs count double) | Contract-value pricing by the back door, which you rejected; all the revenue sits in the upward weights. Parked, not dead: it is the only lever left if the pilot shows Firm-tier revenue is too low, and it is deliberately kept out of D09 v3 (section 1). |
| I09 Value-indexed price rise at renewal | "You did well, so we charge more" is the advantage-taking that fairness research says builders punish; it also pays builders to log less. |
| I18 £35 file fee to open a withheld-payment case | Charging a builder to chase their own money at their worst moment, with no refund on failure and no cut in the 10%, when the market pairs a file fee with a lower commission. |
| I31 Paid seat for the builder's bookkeeper | Contradicts "unlimited users" and taxes the channel that brings MTD-era sole traders to JobGuard, for trivial money. |
| I43 Invoice-finance and working-capital referrals | A profit watchdog nudging builders into expensive debt (invoice finance is assumed to cost in the region of 2% a month; not in the research) from its own cash-flow screen, while it could earn 10% on the same invoice by other means; introducing sole traders to lenders is likely regulated credit broking (lens opinion: needs FCA permission). |
| I44 Homeowner "spread the cost" finance | JobGuard earning a lender's commission on the builder's customer, in consumer credit, where broking needs FCA permission (lens opinion). No claim is made here about any named finance provider; the research contains none. |
| I58 Verified-builder marketplace with a 2% fee on won jobs | JobGuard as both the builder's watchdog and their lead seller, ranking builders with the data it collects to protect them. |
| I68 Per-job "Tell me now" tick-box at switch-live (£19) | A paid tick at the moment friction must be zero; a builder who missed it on a complex job meets a reveal and a fee; also a per-job platform charge, which `AGENTS.md` §5.10 forbids. |
| I69 Paid "show me what you found" before completing the account | A price tag on withheld information at the moment of maximum leverage: the "held to ransom" reading made literal. Keep the mechanic only as a free bridge when a tenant upgrades. |
| I71 "My own records" live pack (prompts about your own diary notes, £10–£20 a month) | "Pay us so we don't use your own notes against you." The right home for this is a free prompt or a D13 rule change, decided with pilot data. |
| I73 Offer to switch to "Tell me now" on the fee statement | A screenshot of "we first held this on 14 May; pay £40 a month to see it sooner" becomes the trade's shorthand for JobGuard; revenue-neutral by its own arithmetic. |
| I67 variant: "Builder Live", a single plan SKU that shows everything (the input's alternative to the toggle, at £49 / £99 / £179) | A separate plan makes the standard plan read as "the one that holds things back", and at those prices it costs most builders more than the fee it replaces. The toggle form at +£20 / +£40 / +£60 survives as item 18. |
| I82 Fee on VAT wrongly charged by a sub and refunded | Money the builder was about to reclaim from HMRC anyway; strains sub relationships for £1–£150 a year. |
| I97 Pooled "how fast does this company pay other JobGuard builders" signal | Three contributors is no anonymity in a local trade; the rated company works out which builders reported it; it is the "builders' data reused across tenants" risk for under £50 a year. |

### Rejected on legal or regulatory grounds (all three lenses agreed; the legal reason is decisive)

Every legal label in this section is the legal lens's opinion, not advice, and each is to be confirmed or corrected by the solicitor review that section 6 asks for. Plain-English glosses are given in brackets and in the glossary (section 8).

| Idea | One-line reason |
|---|---|
| I16 15% band on the first £1,000, or a £25 minimum per catch | Changes the success-fee rate itself, automatically, on every catch: that reopens your fixed 10% (unlike item 25, which leaves the 10% untouched and adds a service charge the builder chooses per case); it also produces a misleading headline rate unless the floor is co-displayed, and copies the fee structure the FCA capped for claims firms. |
| I21 Prepaid recovery credits (£250 of fees for £200) | A refundable-on-demand balance that funds operations looks like deposit-taking (taking repayable money from the public, a regulated banking activity); VAT falls due on receipt; revenue-negative anyway. |
| I23 £5 per AI-proposed quote line the builder accepts | Breaches "quoting never bills" and gives an AI a financial incentive to inflate consumer quotes. |
| I38 Homeowner pays £9.99 to check the builder's final account | Purpose-limitation breach against the builder, an inherently misleading "independent" consumer offer, and the end of builder trust. Record "never" in the plan. |
| I65 Merchants pay JobGuard (connector fees or a slice of pooled rebates) | A merchant paying the party that checks its invoices is the fact pattern the lens associates with the Bribery Act and with secret commissions (an undisclosed payment from a supplier to the builder's agent); the rebate variant also requires holding builders' money. |
| I80 10% on a CIS over-deduction the contractor repays in cash | The deduction is credited to the sub by HMRC anyway; a cash top-up creates a double recovery the builder must unwind; JobGuard would earn from a tax error it helped create. |
| I84 10% of VAT bad-debt relief on a written-off invoice | A fee on the tax side of a customer who never paid; the lens's view is that JobGuard would then be giving tax advice, which brings anti-money-laundering registration and supervision, for £5–£100. |
| I85 10% of an insurance payout on a site loss | Regulated insurance and claims-management activity without authorisation, and the claims-firm association the research says to avoid. |
| I86 Share of savings when the builder switches merchant | JobGuard earning from where builders shop is indistinguishable from steering; attribution unprovable; a fee base JobGuard itself controls. |
| I90 Consented soft credit search on homeowners | Full FCA authorisation as a credit-reference provider for a product the credit agencies are unlikely to sell to non-lenders; homeowners walk away from the builder who asked. |

### Rejected on commercial grounds (lawful and mostly fair, but the money is not there or the build is out of proportion)

| Idea | One-line reason |
|---|---|
| I04 Documents-checked allowance with 40p overage | Every document a builder rations to stay under allowance is a lost overcharge signal; £0 for every archetype. Keep "documents checked" as an unmetered line on the value receipt. |
| I11 Multi-entity group account at £49 per extra entity | Costs more than a second Solo account; opens a cross-tenant read path for £0–£160 a year. Park to M5. |
| I12 Documented pre-payment supplier correction fee (5% or £10) | The builder controls the evidence and pays for supplying it, so the fee collapses toward zero while the statement reads as a taxi meter; put bill checking in the tiers instead. |
| I15 Separate retention-release chase fee | Almost all Firm-tier, behind the longest M4 chain, in a category with its own reform politics on which this research has nothing; treat overdue retention as an ordinary withheld payment when M4-20 exists. |
| I19 Historic supplier-invoice back-audit (setup fee plus 20–25%) | Merchants settle old overcharges by credit note, which D03 excludes; no agreed rates to audit against; human audit cost exceeds revenue in every archetype. |
| I20 "Final Check Only" pay-per-use for non-subscribers | Cannibalises subscriptions, the 15% is uncollectible without a bank feed, and thin evidence produces disputed late bills to homeowners. |
| I25 CIS module as a paid add-on | Priced above Xero's £5 for a smaller job; arrives last in M4; keep as an in-tier feature. |
| I28 Supplier price benchmark (£10–£15 a month) | Two years of empty cells before the pool populates, while a merchant-funded rival gives the same signal free; creates standing pressure to one day sell the pool to merchants. |
| I29 Regional labour-rate benchmark (£15 a month) | Selling-price information exchange between local competitors that a competition-law review may forbid; builders fear their rates leaking. |
| I30 API access at £49 a month | Nobody in a fifteen-person firm to use it; rivals give APIs away; a new surface that must be proven identical with and without hidden signals. Include free on Firm later. |
| I36 Homeowner-paid sealed job record (£69) | Homeowners have never shown they will buy this; a 15-year retention promise and full consumer-law load for under £100 a year. |
| I37 Insurer-paid claim-time evidence pack | No UK insurer paying per pack was found (assumption; the research did not look); fold "send evidence to my insurer" into the free export. |
| I41 Single-use virtual purchasing card per order | Parks the builder's cash with a provider, declines legitimate variances at the trade counter, and no UK revenue share is published. |
| I42 Regulated escrow released against JobGuard proof | Escrow is assumed to be a low-margin service with nothing to share (no escrow price was captured in the research); ties release to JobGuard's gates, making it the homeowner's policeman over the builder. |
| I46 Builder's own insurance introduction with commission (and the insurer data feed) | Compliance effort for pocket change; the data-feed variant turns a trust asset into a surveillance story. Keep the free "your cover looks thin" note. |
| I50 Final-account desk at £150–£600 a job | A paid service whose demand is evidence the core product failed; staff must work blind to the shadow bill and are then shown up by it. |
| I53 Paid site-lead training and certificate | It is product onboarding; competitors give it free; giving it away is the stronger trust signal. |
| I57 Homeowner aftercare record with exclusive repeat-work routing | A consumer-facing product with its own data and support load to earn under £60 a year; creates the homeowner base whose monetisation would be selling the builder's customers. |
| I59 Independent completion inspection with a 15% referral fee | A disclosed commission from a supposedly independent inspector undermines the inspection with both parties; volume never covers a vetted panel. |
| I62 Main contractor pays per project; subs free | Sells to the party the watchdog works against, into a Construction Act regime that is unbuilt, against an incumbent on enterprise sales cycles. |
| I63 White-label to lead-gen platforms or franchise networks | The natural licensees already give job tools away and would rather build; a partner-branded hidden final check followed by a JobGuard fee is the worst trust configuration the research identifies. |
| I66 Merchant rebate passed 100% to the builder with a JobGuard admin fee | Builders will not distinguish it from "JobGuard is in with Travis"; £4–£144 a year. |
| I72 Service credits on the paid plan (missed line, wrong card) | A loss-based capped payout looks like insurance; verification costs more than the credit; the standalone add-on is insurance-shaped. |
| I76 20% of savings after a JobGuard-drafted rate-review letter | A fifth of a discount the builder negotiated themselves; the builder-favourable "market fall" attestation quietly reduces the fee to near zero. Sell the letter flat (item 17). |
| I78 10% of input VAT recovered after a missing-invoice flag | HMRC often accepts other evidence and bookkeepers already chase these; £2.40 fee lines make the whole model look petty. Ship the flag free. |
| I83 10% of an unpaid merchant rebate recovered in cash | Merchants settle rebates by account credit; needs complete invoice capture JobGuard cannot verify; one step from negotiating merchant terms. |
| I88 Checks allowance inside the tiers | A monthly allowance for a rare purchase either goes unused or, on Firm, costs more in wholesale reports than the price attributed; a second meter you did not choose. |
| I93 Block-works Section 20 check (£39) | A handful of Firm jobs a year; fixed legal wording needs upkeep; the value lives in the payer-type logic of item 13. |
| I98 Trade credit insurance introduction | Excludes disputed debts (how construction customers actually withhold), converts at a fraction of a percent, and removes insured builders from the withheld-payment fee base. |

Two design rules fall out of this list and should be written into D11 v3: **no fee, credit, signal or feature ever depends on which merchant a builder uses**, and **no fee is ever measured on a tax outcome**.

---

## 5. What a builder pays and what JobGuard earns

All figures are assumptions, labelled, and steady state (year two onward). Two kinds of value are kept strictly apart. **Demonstrable value** is settled or externally evidenced money: a catch the builder confirmed, billed and was paid for; a withheld payment recovered through a case; statutory interest actually paid. It is the only kind that may appear on a value receipt. **Prevention value** is the unprovable counterfactual: extras the builder might not have billed, overcharges stopped before payment, faster invoicing. It is modelled here so the founder can size the product, and it never appears on a value receipt or in any builder-facing claim: `BUILD_PLAN.md` §14.1 forbids "you would have forgotten this", "you would never have billed this" and "JobGuard saved you £X" before settled cash. An earlier draft of this section counted captured extras as demonstrable; that was the forbidden claim in table form, and it was the largest number in every table.

**How the share rows are computed.** "Share" is JobGuard's take divided by the builder's value. The range is lowest take ÷ highest value to highest take ÷ lowest value; the midpoint is midpoint take ÷ midpoint value. Both are shown because the ranges are wide.

**Shared assumptions:** materials are 35–40% of turnover; extras run at about 5% of turnover and JobGuard's capture discipline is assumed to recover 20% more of them than the builder would alone (a modelling assumption only; Buildbite's self-reported 30% change-order lift is the only market figure and is unverified); supplier overcharges and duplicates caught before payment are 0.3–0.5% of materials spend (assumption; the research has no small-builder error rate); a qualifying catch after lock arises on 20% of jobs at 3% of job value (the pricing design's illustration; there is no UK data). Add-ons are shown net of what the builder would otherwise pay elsewhere where that is known.

### Solo (£150k turnover, 19 jobs at £8,000, one person)

| | Builder pays JobGuard | Assumption |
|---|---|---|
| Subscription | £348 | Solo £29 with no month above 4 counted and no £0 month (section 1 profile); a month at 5 adds £20, an empty winter month takes £29 off; year one about £300 with the free first job |
| Success fee | £50–£90 | 19 jobs × 20% × £240 × 10% = £91; commercial lenses used a base near £55 |
| Pay-now links | £60–£150 | jobs invoiced in two or three stages, so 40–60 payments a year; 10–25% arrive via links; fees mostly capped at £10; partly replaces card fees paid elsewhere |
| Contract pack add-on, IBG commission, checks | £50–£150 | £5-a-month contract pack at 50–100% take-up; IBG on 10–25% of jobs; one or two checks a year |
| **Total** | **about £500–£750** | |

| | Value to the builder | Assumption |
|---|---|---|
| Catches after lock, net of the fee | £450–£800 | the fee base above, builder keeps 90% |
| **Demonstrable value** | **£450–£800** | |
| JobGuard's share of demonstrable value | **62–167%, midpoint about 100%** (subscription plus fee alone: 50–97%, midpoint about 67%) | |
| Extras captured that might otherwise have gone unbilled | £1,000–£1,500 | 5% of turnover in extras, 20% better capture; prevention |
| Overcharges and duplicates stopped before payment | £150–£250 | 0.3–0.5% of £52k materials; prevention |
| Faster invoicing and fewer disputes | unquantified | prevention; excluded |
| **Prevention value** | **£1,150–£1,750** | never on a receipt |
| JobGuard's share of demonstrable plus prevention value | **20–47%, midpoint about 30%** (subscription plus fee alone: 16–27%, midpoint about 20%) | |

Read plainly: for a sole trader JobGuard takes about as much as it can point to. That is not because the ladder over-charges (£29 is level with YourTradebase, Qted and Powered Now and under Tradify) but because £348 is a floor against a small business and because nearly everything JobGuard does for a sole trader is prevention, which cannot go on a receipt. The Solo pitch therefore has to be "£29 a month; here is what we checked" (documents checked, orders matched, proof captured, constraints flagged), never "here is what we found you". The honest risks for Solo are conversion and budget (a compulsory MTD subscription competing for the same £30 a month), not price.

### Small firm (£600k turnover, 24 jobs at £25,000, five staff)

| | Builder pays JobGuard | Assumption |
|---|---|---|
| Subscription | £828–£868 | Builder £69 with no month above 7 counted gives £828 (section 1 profile); one or two months at 8 add £20 each; year one the same unless jobs are onboarded one at a time |
| Success fee | £200–£360 | 24 × 20% × £750 × 10% = £360; lens base near £210 |
| Pay-now links | £150–£350 | 15–30% of £600k via links |
| IBG commission, checks, contract pack, drawing check (year 2+) | £150–£350 | see section 2 items 9, 10, 13, 14, 16 |
| Managed-recovery service charge and late-payment interest where cases arise | £100–£200 | ~1.5 cases a year; the service charge is on top of the base 10% |
| **Total** | **about £1,430–£2,130** | |

| | Value to the builder | Assumption |
|---|---|---|
| Catches after lock, net of fee | £1,800–£3,200 | |
| Withheld payments recovered through cases, net of fee | £2,200–£4,500 | 1.5 cases × 55% success × £3,000–£6,000 recovered × 90% kept = £2,228–£4,455 |
| **Demonstrable value** | **£4,000–£7,700** | |
| JobGuard's share of demonstrable value | **19–53%, midpoint about 30%** (subscription plus fee alone: 13–31%, midpoint about 19%) | |
| Extras captured | £4,000–£6,000 | 5% of £600k, 20% better capture; prevention |
| Overcharges stopped before payment | £650–£1,100 | 0.3–0.5% of £225k materials; prevention |
| **Prevention value** | **£4,650–£7,100** | never on a receipt |
| JobGuard's share of demonstrable plus prevention value | **10–25%, midpoint about 15%** (subscription plus fee alone: 7–14%, midpoint about 10%) | |

### Firm (£2m turnover, 33 jobs at £60,000, fifteen staff)

| | Builder pays JobGuard | Assumption |
|---|---|---|
| Subscription | £2,500–£2,750 (£4,188 on Contractor) | Firm £179 plus one to four extras most months (section 1 profile: about £2,600) |
| Success fee | £700–£1,200 | 33 × 20% × £1,800 × 10% = £1,190; lens base near £700 |
| Pay-now links | £200–£450 | 10–20% of £2m via links, mostly capped at £15 |
| Firm-tier add-ons: commercial layer or in tier, payer checks, IBG, annual review, evidence packs | £700–£1,300 | items 8, 10, 11, 13, 28 |
| Managed-recovery service charge, interest and escalation on cases | £500–£900 | ~3 cases a year at £10,000; the service charge is on top of the base 10% |
| **Total** | **about £4,600–£6,600** | |

| | Value to the builder | Assumption |
|---|---|---|
| Catches after lock, net of fee | £6,000–£10,700 | |
| Withheld payments recovered through cases, net of fee | £8,100–£14,850 | 3 cases × 30–55% success × £10,000 × 90% kept; any retention released through a case is on top and is not counted |
| Late-payment interest and compensation actually paid by business debtors | £500–£1,000 | the builder's value includes the fixed compensation even though the fee base excludes it |
| **Demonstrable value** | **£14,600–£26,500** | |
| JobGuard's share of demonstrable value | **17–45%, midpoint about 27%** (subscription plus fee alone: 12–27%, midpoint about 17%) | |
| Extras captured | £15,000–£20,000 | 5% of £2m, 20% better capture; prevention |
| Overcharges stopped before payment | £2,000–£3,500 | 0.3–0.5% of £700k materials; prevention |
| **Prevention value** | **£17,000–£23,500** | never on a receipt |
| JobGuard's share of demonstrable plus prevention value | **9–21%, midpoint about 14%** (subscription plus fee alone: 6–13%, midpoint about 9%) | |

**What this says.** Measured only against money JobGuard can point to (confirmed catches paid, cases won, interest paid), JobGuard's take is not small: roughly all of it for a sole trader (midpoint about 100%), about 30% for a small firm and about 27% for a firm. Counting prevention as well, the midpoints fall to about 30%, 15% and 14%. So "the builder visibly keeps most of the money" is true for firms and small firms on the receipt, and true for a sole trader only if the builder credits prevention in their own reckoning, which JobGuard may not do for them. Two consequences follow. The value receipt for a sole trader will often show JobGuard earning about what it found, so the Solo pitch and the receipt must lead with what was checked, not what was found. And the case for Solo rests on prevention being real, which only the pilot can show (§14.17: catch rate after lock, extras logged per job, documents checked, overcharges stopped before payment). The two numbers that move everything are the catch rate after lock and how often builders open recovery cases; neither has any UK evidence behind it.

---

## 6. Decisions you need to make

An agent cannot mark any of these approved. Each is a versioned record; none rewrites terms builders have already accepted.

| Recommendation | Records it touches | What to decide | Needs a lawyer or accountant? |
|---|---|---|---|
| The ladder (section 1) | **D09 v3** (`subscription_pricing_policy_v3`): plans, included jobs, extra-job prices and caps, the counting rules, the small-job allowance and £4,000 trip (recorded as fairness exceptions to the count meter), free first job, annual terms, £0 months, add-on SKUs, credits that never offset fees. The big-job weighting (I03) is **not** in the record; it is noted as parked. **D05**: the monthly maximum per plan (£49 / £169 / £329 / £829) as the fixed amount you may take. **D11 v3**: metering signals relabelled as advisory residuals. **D02**: VAT on all lines; prominent VAT statement beside ex-VAT prices. | Confirm the numbers; confirm Contractor stays at £349/20 rather than £399 or a fifth rung. | Solicitor: one review of subscription terms (meter definition, notice, grandfathering, suspension; cost assumed at £3–8k, get quotes) and confirmation that monthly billing in arrears to sole traders needs no consumer-credit permission (the lens's "trade-credit exemption": letting a business customer pay after the service is delivered without becoming a lender). Accountant: revenue recognition per period; annual prepayment; credit notes. |
| Build changes behind the ladder | Add to `BUILD_PLAN.md` "Discovered later": M4-14 required; live-state gating of watchdog commands; "Finished on site" and close-with-reason; month-of-quiet rule; structured customer and site fields at switch-live; lock as completion declaration; post-lock site work to a linked job; replay fixtures for the cap-bypass, rotation, early-lock and import scenarios. | Approve the scope additions. | No. |
| First job free, card at switch-live | D09 v3 trial terms; D05 renewal authority; D12 v3 onboarding wording. | Free period definition; card with "skip for now". | Solicitor: trial and renewal wording (card-scheme rules on reminders and first-charge date). |
| Same-screen fee statement and Direct Debit | D05 (per-statement default; opt-in standing authority capped at the fee); D02 (VAT on the statement); D01 wording only. | Whether to offer the standing authority at all. | Accountant: VAT presentation. Solicitor: mandate wording, inside the same terms review. |
| Pay-now links | New task and a D10/D05 extension; D02; D04 (Stripe Connect, GoCardless, TrueLayer). | Whether to proceed at all, subject to the opinion. | **Solicitor (essential):** written opinion that Connect direct charges and pay-by-bank keep JobGuard outside payment-services regulation. **Accountant/tax adviser (essential):** VAT treatment of the application fee. |
| Customer portal, approvals, messaging | D06 (authenticated customer approval); D12 v3 (homeowner notice; JobGuard as controller for the shadow purpose; DSAR and objection handling; monitoring, counterparty checks and pursuit named as purposes). | Approve the notice wording and the controller position. | **Solicitor (essential):** consumer cancellation-notice kit for remotely approved extras; the homeowner privacy notice; a data-protection impact assessment. |
| Three D13 changes that stop JobGuard earning from things it could have prevented | **D13 v2**: (a) any pre-lock disclosure route ("Tell me now", a trial job shown live, a paid-for QS or drawing review, an upgrade bridge) sets fee-ineligibility at the moment the signal is created; (b) evidence that predates adopting an imported job is fee-free forever; (c) decide whether a deterministic "supplier or order line not in your quote or extras" rule is must-surface on every plan. | Decide (c) explicitly: it is the one place the standard plan sits on a likely ordering mistake until lock. | Solicitor: brief review of the must-surface wording. |
| Small fee-side additions, no new rate | **D03 v3**: applied credit notes qualify once consumed against a later invoice paid in full (£250 minimum per case); statutory interest as a separate qualifying line, only inside a case the builder opened, business debtors only, with the fixed statutory compensation excluded from the fee base; a duplicate-payment row (cash only); overdue retention treated as an ordinary withheld payment when M4-20 exists; insurer proceeds never qualify; no fee on a case against a client who is paying JobGuard for the project. **D01**: the 10% is untouched; the managed-recovery service charge (5 or 10 points, chosen per case) is recorded as a separate service-charge table, not a fee rate. | Approve the additions. | Solicitor: whether the managed-recovery arrangement is a damages-based agreement (a "no win, no fee" share of what is recovered, regulated for lawyers; lens opinion; cost assumed at £5–12k and six to ten weeks, get quotes); the pursuit position for consumer debtors (the pre-action protocol, meaning the steps a claimant must take before suing, and harassment rules). |
| Paid checks and data | **New D14 "paid data services"** (companies-only counterparty checks, property title check, payer check; the CCJ search on individuals deferred); D04 entries (Companies House, Gazette, credit agency, Land Registry); D07 retention for check records. | Whether to sign a credit-agency reseller contract with a minimum commitment before pilot attach data exists (recommendation: no; ship the free layer first). | Solicitor: confirm that combining public-register and agency data on companies does not make JobGuard a credit-reference agency; a separate view before any search on an individual. |
| Partner commissions (IBG, trade body, accountant) | **New record for partner commissions and regulated introductions**; D09 promo and referral terms; D02 (self-billing VAT; IPT line). | Whether JobGuard takes any third-party money at all. If yes, only from insurers and professional bodies, never merchants, lenders or lead platforms. | Solicitor: introducer status or appointed-representative route for the IBG partner; mark licences with trade bodies; referral disclosure wording accountants must give. |
| Firm/Contractor workflow depth | **D06 v2** (reviewed notice templates by jurisdiction; England and Wales first); D02 (stage-payment and retention VAT points; reverse charge); insurance. | Timing; whether the commercial layer is in tier or an add-on. | **Construction solicitor (essential):** templates and deadline rules (cost assumed at £8–20k and three to six months, get quotes). Professional-indemnity insurance. |
| "Tell me now" | D09 v3 (mode and price); D13 v2 (routes); D05 (plan change is a decision); D12 v3. | Only after the pilot fairness measurement; the price levels are untested. | Solicitor: that both plans are described neutrally in the terms (the standard plan is "a second check after your bill", never "we hold back"). |
| Two rules for D11 v3 | No fee, credit, signal or feature depends on which merchant a builder uses; no fee is measured on a tax outcome; the "never build" list (homeowner-paid audit of the builder; merchant money; marketplace). | Record them. | No. |

---

## 7. Where the evidence is weak

- **The primary inputs are not on file.** The pricing design, the three refutations and the lens scores behind every Trust and Composite number exist only as workflow outputs, not as files a reader can open. Until they are saved, nothing in section 2's scoring can be checked by anyone but the workflow that produced it.
- **No UK data on unbilled extras per job.** The success-fee base, the "20% better capture" modelling assumption and the catch rate after lock are all guesses. This is the single largest uncertainty in every revenue figure and only the pilot can fix it.
- **No data on supplier error rates for small builders.** The 0.3–0.5% figure is an assumption; the research captured no error rate for firms of any size.
- **The archetype numbers themselves.** Live-job counts by month, job durations, the share of jobs under £2,000, the accepted-value distribution and the share of jobs over £50,000 are all assumed. They decide whether Solo 4 / Builder 7 / Firm 13 are right and whether the parked big-job weighting (I03) ever needs revisiting.
- **Every attach rate in section 2** (pay-now links, checks, contract pack, IBG, drawing check, messaging) is a guess; the commercial lens cut most of them by half or more and they are still unmeasured.
- **Card at switch-live.** The 25–35% versus 4–6% conversion figures are B2B software numbers, not tradespeople; whether the card ask helps or hurts switch-lives is unknown and cannot be measured in a no-charge pilot.
- **Whether the hidden final check reads fair.** The research's betrayal-aversion findings are laboratory results; nobody has measured how a builder feels at the reveal. Everything in the disclosure family, and the standard plan's word-of-mouth risk, rests on this.
- **The comparator.** The per-seat comparison assumes a firm buys six to ten seats, not fifteen, and that JobGuard sits alongside rather than replaces a job-management app, so the builder pays both; neither assumption is verified, and the research has no evidence on seats actually bought.
- **Retention, dispute and case statistics.** Nothing in the research measures unrecovered retention, domestic dispute rates or how often builders open withheld-payment cases. Every case count in section 5 is a guess and must be verified before any marketing claim or pricing decision.
- **Whether the hidden final check reads fair can only be measured on real data.** The plan-choice comparison and the pilot arms (items 23 and 30) need the shadow bill to run on real pilot jobs, which needs G1 plus D12 and D13 approval of the pilot disclosure (§14.11). Until then no fairness number exists and "Tell me now" cannot be priced.
- **Winter pause and annual billing effects.** No traceable data; treat both as experiments.
- **Wholesale data costs and contract minimums** for credit-agency reports, Registry Trust searches and SMS/WhatsApp are assumed; a reseller minimum could make the paid check layer loss-making until there are a few hundred paying tenants.
- **The 1% of turnover prevention figure** used to size JobGuard's share of value is an assumption in line with one vendor's self-reported claim and nothing else.

---

## 8. Glossary

Plain-English meanings for the trade, legal, tax and plan terms used above. Legal entries are descriptions, not advice.

- **Construction Act; application for payment; pay-less notice.** The UK law that sets payment rules between businesses on construction contracts. A contractor sends an *application for payment* saying what it thinks it is owed; if the payer wants to pay less it must send a *pay-less notice* by a deadline, or the full amount falls due.
- **Retention.** A slice of each payment (typically a few per cent) a client holds back until the work is finished and defects are fixed.
- **Article 4 direction.** A council order removing normal permitted-development rights in an area, so small works need planning permission.
- **IBG (insurance-backed guarantee).** Insurance that honours a builder's guarantee if the builder goes out of business.
- **IPT.** Insurance premium tax, charged on insurance premiums instead of VAT.
- **Introducer; appointed representative; IAR.** Ways a business can be involved in selling insurance without its own FCA authorisation: an *introducer* only passes the customer on; an *appointed representative* (or *introducer appointed representative*, IAR) acts under another authorised firm's responsibility.
- **SRA.** Solicitors Regulation Authority, which regulates solicitors in England and Wales.
- **ADR.** Alternative dispute resolution: settling a dispute by mediation or adjudication instead of court.
- **Adjudication.** The fast Construction Act process for deciding a payment dispute between businesses.
- **DSAR.** Data subject access request: a person's right to a copy of the personal data an organisation holds about them.
- **UK GDPR Article 14.** The duty to tell a person what you hold about them when the data came from someone else (for example a homeowner whose messages a builder uploaded).
- **PECR.** The rules on electronic marketing and messaging (texts, emails, calls).
- **CRA.** Credit reference agency.
- **CCJ.** County court judgment, a court order to pay a debt; **Registry Trust** keeps the public register of them.
- **Gazette.** The official public record where insolvencies and winding-up petitions are published.
- **RMC / RTM.** Residents' management company / right-to-manage company: the bodies that run a block of flats and pay for its works.
- **Section 20.** The consultation a landlord or management company must run with leaseholders before major works.
- **MTD.** Making Tax Digital, HMRC's requirement to keep digital records and file through software.
- **CIS.** The Construction Industry Scheme, under which contractors deduct tax from payments to subcontractors.
- **DRC / reverse charge.** The domestic reverse charge: on many business-to-business construction supplies the customer, not the supplier, accounts for the VAT.
- **Self-billing VAT.** An arrangement where the customer raises the VAT invoice on the supplier's behalf (used here for commission paid to a trade body).
- **Stripe Connect direct charges.** A way of taking card payments where the charge is made on the builder's own Stripe account, so the platform never holds the money.
- **Pre-action protocol.** The steps a claimant must take (letters, information, time to respond) before starting a court claim.
- **Purpose limitation.** The data-protection rule that personal data collected for one purpose may not be used for an unrelated one.
- **Deposit-taking.** Accepting repayable money from the public, a regulated banking activity.
- **Credit broking.** Introducing customers to lenders, which needs FCA permission.
- **Damages-based agreement.** A "no win, no fee" arrangement paid as a share of what is recovered; regulated for lawyers.
- **Secret commission.** A payment from a supplier to someone acting for the customer, without the customer's informed consent.
- **Legal Services Act.** The law that reserves some legal work to authorised people; a business may refer clients to a solicitor but may not sell that work as its own.
- **Trade-credit exemption (as used here).** Letting a business customer pay in arrears for a service without that becoming regulated lending.
- **Revenue recognition.** The accounting rule for when income counts as earned (for example spreading an annual prepayment over twelve months).
- **Hero plan.** The plan a pricing page is designed to make most people choose.
- **Reverse trial.** A trial that starts on the full product and drops to a free tier if the customer does not pay.
- **Attach rate.** The share of customers who take an add-on.
- **Composite score.** In section 2, the sum of the three lens scores out of 15.
- **G1, G4.** Release gates in `BUILD_PLAN.md`: G1 must pass before the first real-user (no-charge) pilot; G4 before any production charging.
- **M-numbers (for example M4-14).** Build-plan tasks by milestone: M1 is the pilot core loop, M2 the watchdog, M3 native/offline, M4 payments and recovery, M5 later integrations. M4-14 is the concurrency-metering task.
- **SV tasks.** The shadow-bill task series added in `BUILD_PLAN.md` §14.14 (SV-0 policy through SV-8 production settlement).
- **D-numbers.** Decision records in `docs/decisions/` (D01 fees, D02 VAT, D03 eligibility, D05 standing authority, D09 subscription, D12 data protection, D13 shadow attribution, and so on).
