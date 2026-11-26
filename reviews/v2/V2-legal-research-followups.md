# V2 follow-ups from the JobGuard legal research (25 Nov 2026)

Source: `/mnt/project-files/jobguard-legal-research-2026-11-25/` (papers A VAT invoicing, B consumer cancellation, C data protection and pilot terms, each with an independent AI check). **This is AI research, not legal or tax advice. None of it has been reviewed by a solicitor, accountant or data-protection professional.** Planner reading, 26 Nov 07:45 UK.

**Why nothing changes now.** Every V2 piece runs only in the shared practice tenant, with invented `.invalid` contacts and the local catcher. No real homeowner, invoice or send is involved. So none of these items blocks a V2 build. They are conditions **before any V2 feature is used with real customers**, and they are carried as packet notes and LATER items.

## Needs Ben's own sign-off (company facts, money, accounts; not decided here)
1. **ICO data protection fee**: very likely tier 1, £52 a year (£47 by direct debit) (C, confirmed by check C). Money, so it's Ben's call.
2. **Who is the controller for the Final Check**: JobGuard alone, or jointly with the builder? A joint arrangement needs an Article 26 agreement (check C, row 2). This is a company position.
3. **Liability cap amount** in the pilot terms (C outline item 6), and whether insurance backs it. It must pass the UCTA reasonableness test.
4. **DPIA sign-off**: Ben signs it as owner, before real homeowners use the portal (C, DPIA step 7).
5. **Where data actually runs** (check C, fix 1): hosting, database, email, logs, backups, and any translation, OCR or AI service. This feeds the **3 Dec hosting decision**. Anything outside the UK or EEA must be named, with its safeguard, before real data.
6. **D4B's paid translation provider** (Ben picks it before real use): its data location is part of item 5.
7. **Pilot region**: England and Wales first (B, matches D06). Already Ben's D06 position; recorded here only.

## Packet notes (added to the packets named)
| Packet | Note | Source |
|---|---|---|
| Q11 K5 deposit and stage invoices | A deposit or part-payment normally creates its **own VAT tax point** on receipt (Notice 700 14.2.3). Before real use, each stage or deposit invoice must be a separate builder-confirmed invoice with its own date; a single completion tax point would be wrong. Practice build unchanged. | Check A, fix 2 |
| Q12 F6 approve extra by link; C3B/C6 extras | Before real use: (a) the approve button must say the homeowner is agreeing to pay ("Accept and agree to pay £X"; CCRs reg 14 for distance contracts); (b) an extra over £42 that is new work may need its own cancellation kit (unclear in law, so send it); (c) re-run the builder's "standard-rated" VAT checklist whenever a line is added after the quote (an extra such as loft insulation may carry 0% or 5%). | B; check A, fix 3 |
| Q41 D4B translated briefs | A real translation provider is a sub-processor. Its location and safeguard must be named in the processor schedule and the homeowner notice before real use. FakeTranslator in practice is unaffected. | Check C, fix 1 |
| Q43 F1-P, B1 walk photos, Q31 K1 share | Before real use, the photo screens carry a short builder rule: **no people in photos (especially children), no key-safe or alarm codes, no dates the home will be empty.** Add the item to the DPIA risk list. | Check C, fix 5 |
| Q46 E7 reminders; E2 replies | Reminder and reply-link messages to real homeowners are covered by the joint homeowner notice. The notice must say plainly that the Final Check reads portal messages, and why (check C, fix 2). No change to the practice build. | Check C, fix 2 |
| Next templates (bathroom refresh, decorating; ~5 Dec) | The bathroom template must ask **"Is this an adaptation for a disabled person, or a mobility aid for someone 60 or over?"** If yes, the job is not standard-rated (0% or 5%) and stays draft-only. Energy-saving items (insulation, heat pumps, solar, batteries, heating controls, draught-proofing) are 0% until 31 March 2027, then 5%. Templates are data only, so this is a data field plus one worked test. | Check A, fix 1 |

## LATER items (not scheduled; before real customers)
- **L1 Builder-confirmed VAT invoice issue** with the widened checklist (check A fixes 1 to 5), drafts marked "This is not a VAT invoice", one VAT figure per invoice, the rounding method stored per invoice, credit notes copying the original VAT and prompting issue within 14 days of a refund, and strict "inc. VAT" stripping for unregistered builders. This belongs to main's invoicing (D02, D06), not to V2 practice.
- **L2 Domestic cancellation kit**: verbatim statutory text, using the **supply-and-fit (goods) wording by default** when materials are included (check B, kit fix 1). Email only with the homeowner's recorded agreement, otherwise paper (check B, fix 1). An early-start request comes from the homeowner's own email or on paper, not a portal tick alone (check B, fix 3). The Schedule 2(o) sentence goes on every domestic quote (check B, fix 4).
- **L3 Approval record types**: "customer approved (signed in)" and "builder says the customer agreed" stay separate, labelled on every document. Builder attestation never unlocks an early start.
- **L4 Stage sign-off wording**: "stage complete for payment purposes", never "accept and waive claims" (CRA s.49). Check G-series handover and F2 proof-holds text against this before real use.
- **L5 Export before deletion**: a forced full export before JobGuard deletes a builder's data (C retention table). K7 export covers most of this; confirm when K7 is built.
- **L6 Final Check switch-off**: the notice says a builder can switch it off, but D13 doesn't say so. Check the build supports it (check C, smaller notes).
- **L7 Each builder's complaints route** (DUAA, in force by 19 June 2026) goes on the builder onboarding checklist.

## Not affected
Firm locks (FL-1 to FL-6), SYNC-1, CI and test pieces, E5A, F8 attendance (crew data stays inside the firm, no location columns), and the C3B-1 screen fix.
