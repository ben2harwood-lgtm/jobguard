# JobGuard version 1: the honest launch gap (21 Nov 2026)

Read-only research by a Claude helper (Opus 5.5, medium). JobGuard main read at ee974f03 (21 Nov 05:50, after ea10154b).
Nothing was built, run, deployed or changed. **[fact]** = I checked it in the code or a document. **[estimate]** = my own judgement.

## 1. The answer in three sentences

Version 1 is further away than it looks: the product works well from start to finish, but only as a practice copy with made-up firms. Every screen is locked to practice mode, so no real builder can sign in, no email can reach a real customer and no money can be taken. The biggest missing pieces are a real version of the app on a real server, real emails, the safety and privacy groundwork the plan calls gate G1, a payment provider for subscriptions, and a set of approvals (prices, data, legal) that only you can give.

## 2. What works for real today, and what is only practice

**Works (in practice mode)** [fact]:
- A builder can go from typed words to quote, customer acceptance, extras, proof, final account, Final Check, invoice and "paid", on a phone and a laptop. Helpers walked this on 20 Nov as a kitchen fitter, a plumber, a decorator and from the customer's side (`coordinator/burn-2026-11-20/jg-walk4.md`, `jg-walk-customer.md`, `jg-walk-plumber.md`). On 21 Nov the laptop runs of Northside and the £95 own-job journey passed on ea10154b (work list line DEMO-HOSTED-REFRESH).
- Both demos pass in CI (automatic tests on GitHub). About 67 of the plan's 81 counted pieces are done (`burn-2026-11-20/jg-finish-recount.md`; that count is approximate).
- Sign-in by emailed code is built and saved in the database (`docs/operations/m0-6l-identity.md`).
- Talking into the phone is turned into text on the phone itself (no outside speech service needed).
- Least-privilege database work is built: LP-12, LP-13 and the synthetic LP-9 final gate all merged on 20 Nov; only LP-9's outside evidence (real deployment, secrets, an outside reviewer) is left. "Least privilege" means each part of the app can only touch the data it needs.

**Only practice, or switched off** [fact]:
- **The whole app.** About 190 checks refuse to run unless the server is in practice mode (`JOBGUARD_ENV !== "synthetic_demo"`). The web app gets its database through `apps/web/app/lib/synthetic-server.ts`, which throws outside practice mode, and 163 web files use it.
- **Emails.** Sign-in codes only go to made-up `.invalid` addresses (`apps/web/app/sign-in/sign-in.tsx:58`). Sending a quote refuses any real address (`SYNTHETIC_RECIPIENT_REQUIRED`, `packages/db/src/quote-delivery-repository.ts`). The code has no text-message or WhatsApp sending at all.
- **Money.** Stripe and GoCardless exist only as fakes and a sandbox (`apps/api/src/fee-collection/fake-stripe.ts`, `fake-gocardless.ts`, `packages/db/src/subscription-stripe-sandbox-adapter.ts`). Every payment method is listed as disabled (`docs/operations/release-inventory.md`).
- **AI.** The live AI route is off (`LIVE_ROUTE_DISABLED`). Today's journey works without it.
- **Hosting.** Only the practice demo is online (Cloudflare and Neon). Its Final Check helper runs on your Mac and stalls whenever the Mac sleeps or loses Wi-Fi (`burn-2026-11-20/jg-hosted-demo.md`).
- **Gates.** None of the plan's safety gates G0 to G5 is met. "G0 is not met. G1 is not met." (`docs/operations/foundation-gates.md`). All 16 decision records D01 to D16 are still "proposed" (`docs/decisions/`).
- **Native phone app.** Parts are built and checked (M3-3, M3-4, M3-5) but not joined up. There is no proof on a real phone, and D08 and G3 are closed (work list M3-1 to M3-5).

## 3. The gap

Who does it: BUILD = agents can do it; BEN = only you (money, accounts, legal, public claims, launch); BOTH = agents prepare it and you approve.
Size [estimate]: S = under a day of agent work, M = 1–3 days, L = more.

**Sign-in and accounts**
1. **A real mode for the app.** Every screen needs to run for a real signed-in builder on a real database, not only the practice firm. This is my finding from the code. The plan assumes it (M0-6L "the principal bridge for real users", BUILD_PLAN.md:2655; M0-13a "a pilot deployment refuses synthetic commands", :2691) but has **no card of its own** for it. BUILD, L. Ask for a plan card first so it gets counted.
2. **Real sign-in emails.** Connect an email sender so codes reach real inboxes. The route is blocked until D04 approves a provider (`docs/operations/identity-email-data-flow.md`; M0-6L, :2655). BOTH, M.
3. **Real customers sign in to the customer page** (MON-5). Real customers need G1, D06 v2 and D12 v3 (BUILD_PLAN.md MON-5 row in the §10.4 table; §13.2 "Customer accepts the quote… on their phone"). BOTH, S once item 1 is done.
4. **Trusted visitor addresses for sign-in limits.** These stop people guessing codes. They need a verified source at the edge of the real deployment (`m0-6l-identity.md`, "Before real-user release"). BUILD, S.

**Money and payments**
5. **Subscription charging**: Solo £29 and Builder £69, collected through a real provider. This needs MON-2B (BUILD_PLAN.md:2142–2183), the terms-and-mandate record M4-13 (:3036) and JobGuard's own invoices and credit notes M4-10 (:3014). BOTH, L. You open the provider account.
6. **Approve the prices and VAT rules**: D09 v4 plans and prices, D05 monthly maximum, D02 VAT and rounding (BUILD_PLAN.md:175–197; MON-2B depends on them). BEN, S.
7. **Reconciliation and money-surface review**: the books must balance, and refunds and reversals must be tested (M4-17, :3064; G4-S, :169). BUILD, M. **Penetration test** (a paid outside security test) of the money parts (G4-S, :169). BEN (spending).
8. **Controlled first charge**: release record, live smoke test with one consenting builder, and a way to roll back (M4-23, :3125–3136; `docs/operations/live-smoke-test-procedure.md`, `rollback-disable-plan.md`). BOTH, M.
9. **The 10% success fee on Final Check finds.** Collecting it needs MON-4B, M4-9, M4-12, M4-15 (Direct Debit), SV-8 and a bank feed (M4-7), plus the full G4-S evidence (:169, §12.4 :3719–3743). BOTH, L. **It can wait.** The plan lets each way of charging stay off on its own (:169, "Each rail … can stay disabled independently").

**Sending to customers**
10. **Real emails for quotes, invoices, extras and messages**, through the existing outbox (the queue that sends messages safely and records each one). This needs a "stop all sending" switch (M0-13a, :2683–2691; `docs/operations/commercial-outbound-pause.md`) and D04 approval of the email provider. BOTH, M.
11. **Customer notice wording**: the approved cancellation-notice kit and the customer approval templates (D06; G1 "supported invoice/tax scope", :164). BEN (legal), with agents drafting.

**Data, hosting and security**
12. **A real UK server**: locked-down passwords and secrets, logs with personal details removed, alerts, and an always-on Final Check helper instead of your Mac (M0-13a, :2683; `docs/operations/provider-register.md` says every region is "not chosen"). BOTH, L. Deploying is yours.
13. **Backup and restore rehearsal** on the real server (M0-13b). BUILD, M. You approve the recovery targets in D07.
14. **Privacy operations**: keeping, exporting and deleting people's data, and handling a person's request for their own data (M0-13c; `docs/operations/privacy-operations.md`). BUILD, M.
15. **Gate evidence pack for G0 and G1** (M0-13d; `docs/operations/foundation-gates.md`, 21 rows, none passed). BOTH, M.
16. **Finish least privilege**: LP-12, LP-13 and LP-9's synthetic final refusal run are merged (20 Nov); what remains is LP-9's outside evidence on the real deployment. LP-9 also needs **a paid independent human reviewer**: you ruled "Obtain a quote; spend only after explicit approval" (BUILD_PLAN.md:3502–3510). BOTH, M plus the reviewer.
17. **Approve the data decisions**: D04 providers and UK/EU storage, D07 retention and backups, D12 data protection (G1, :164). BEN, S each.
18. **Trusting Final Check's findings** (gate G2: measured error rates, human review and false-alarm feedback before builders rely on automatic findings; :165, SV-3 "live-model run is a separate release item", :1817). BOTH, M.

**Legal and policy**
19. **No-charge pilot terms** approved (`docs/contracts/pilot-terms-v1.md`; G1 row `g1-terms`). BEN.
20. **Approve the Final Check disclosure** (D13), including the fee figure shown in the Final Check terms (G1 row `g1-d13`; `burn-2026-11-20/jg-walk-fixes.md` says only you can set that figure). BEN.
21. **Customer terms for paying builders**, reviewed by a solicitor, plus D01, D03 and D11 for the success fee when that comes (G4-S, :169; M4-13, :3036). BEN (legal and spending), with agents drafting.
22. **Public privacy notice and terms pages.** No such pages exist in `apps/web/app` [fact]. The plan does not name them as a card, but G1 needs an approved privacy procedure (:164). BOTH, S to draft. Publishing them is yours.
23. **Sales claims must match what is built** (§13, :3745–3798). For example, "Mobile app that works with no signal" is still "To build". BOTH, S.

**Mobile app**
24. **Native app**: join M3-3, M3-4 and M3-5, then the device test suite and release gate M3-7 (:2903), D08 offline security, and G3 (:166). BOTH, L. **Not needed for a first beta**, because the browser works on phones.
25. **Physical iPhone check of on-phone dictation** (work list DEMO-VOICE-PHONE). BEN, S.

**Anything else the plan requires**
26. **Two real builders try it unscripted** while someone watches and notes the friction (M1-15T, :2721–2728). Today 0 of 2 are done: Tommy and Paul Blake (work list DEMO-S). This first needs the hosted demo refresh (DEMO-HOSTED-REFRESH, checking now). BEN.
27. **No-charge shadow pilot on real jobs**, with a measured report reviewed before any small-builder charging (M1-15S, :2730–2737). BOTH, weeks of calendar time.
28. **DEMO-S independent check** of the exact commit. The report still says "Independent verdict: missing" (`jg-finish-recount.md`). BUILD, S.
29. **Contractor track**, only if version 1 includes contractors: company sign-on ENT-10, the signed pilot agreement and DPA (data processing agreement) ENT-14 (:1172), connectors to the contractor's own systems ENT-13b, and G4-C (:168). BOTH, L. This route is slower than the small-builder one.

## 4. The shortest honest order to a first paying beta builder [estimate]

The plan does not allow going straight from the practice demo to charging. It runs: practice demo, then a real but free pilot (G1), then charging (G4-S) (§3, :150–169). The quickest version charges a subscription only and leaves the success fee off.

**Step A: finish the demo (days).** Agents finish the hosted refresh and the DEMO-S check (items 26 and 28). You run the refreshed demo and send it to Tommy and Paul Blake.
- Send to the All-builds coordinator: "Yes, send the refreshed demo link to Tommy and Paul Blake."

**Step B: a real, free pilot (about 2–3 weeks of agent work).** Agents build items 1–4, 10 and 12–16, and draft 19, 20 and 22. You approve the providers, the data rules, the pilot terms and the Final Check wording.
- "Yes, plan a free real pilot first, then a subscription-only paid beta. Write the real-mode plan card." (All-builds coordinator)
- "Yes, propose the D04 provider list for the pilot: hosting, database, email, logs and backups, all UK/EU. I'll approve it." (All-builds coordinator)
- "Approve D07 and D12 as proposed for the no-charge pilot." (send after reading the summary the coordinator gives you)
- "Approve the no-charge pilot terms and D13 Final Check disclosure as proposed." (same)
- "Yes, get quotes for the independent database reviewer and a penetration test. Don't spend yet." (All-builds coordinator)
- You deploy the pilot server yourself, then: "Yes, invite Tommy and Paul Blake to the free pilot."

**Step C: run the free pilot (about 4+ weeks of calendar time).** Builders use it on real jobs. Agents produce the M1-15S report (item 27) and fix anything that blocks them.

**Step D: subscription-only paid beta (about 2–3 weeks of agent work, plus your outside steps).** Agents build items 5, 7 and 8 and finish 21 and 23. You open the payment provider account, approve the prices, VAT and monthly maximum, have a solicitor review the terms, approve the penetration test spend, and approve the first live charge.
- "Approve D09 v4 prices (Solo £29 for 4 jobs, Builder £69 for 7, extra jobs £20, first job free), D05 and D02 as proposed." (All-builds coordinator)
- "Yes, spend on the penetration test at the quoted price." (send once you've seen the quote)
- "Yes, run the first live subscription charge with one pilot builder who agrees." (All-builds coordinator)

[estimate] With no hold-ups, a first paying builder is about 2–3 months away. Most of that is the pilot's calendar time and your outside steps, not code.

## 5. What version 1 deliberately does not need

From the plan's own lists and the finish list's "Not needed for the demos" (`JOBGUARD_FINISH_LIST.md`, lines 161–171; BUILD_PLAN.md §12.4 :3719–3743, §14 :3800–3808):
- Charging the 10% success fee at launch (each way of charging can stay off on its own, :169). It is shown, not charged.
- Pay-now links on customer invoices (MON-6) and managed recovery (MON-9).
- The bank feed (M4-7, TrueLayer), staged invoicing, construction notices, retention money, reverse-charge VAT and CIS (M4-18 to M4-22: "after the pilot", :3739).
- Xero and QuickBooks export, and M5-1 to M5-12 generally (:3740).
- The native offline app (M3, ENT-12). The browser covers a first beta.
- The live AI route (M0-12a) and the outside speech service (M0-12b). Today's journey runs without them.
- Live supplier and inbox connectors (SV-7B, M2 live parts).
- The whole contractor track, if you start with small builders (ENT-8b, ENT-10, ENT-13, ENT-14, G4-C).
- The plan's "never build" list, for example money from merchants or homeowner-paid audits (§14.2, :3806).

## Notes and limits

- BUILD_PLAN.md §7.3 "Not built" (:437–439) is out of date: it still says no SV or MON piece is built.
- I did not run any tests or the app. The ~190 practice-mode locks and the `.invalid`-only sending come from searching the code.
- Sizes and the time estimate are mine. Nothing here approves any decision.
