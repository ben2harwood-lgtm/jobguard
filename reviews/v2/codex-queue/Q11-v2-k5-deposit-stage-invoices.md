# Q11 · V2-K5: deposit and stage invoices from the accepted quote

Tier: **RED (money)**. Migration **2012**. Astra: yes. Rework risk: **medium**. Ben decided practice slices of BUILD_PLAN.md items are fine (rev 1.3 decision 1); BUILD_PLAN.md M4-18 stays the plan of record for real use.
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-k5, section 2A item 3.
**Starts when:** R2 has pushed c3. **Base:** that c3 head. Draft PR against `codex/sandbox/v2-c3`.

## Goal
The builder picks a split on the accepted quote (for example 30/40/30, or a fixed deposit then stages), and JobGuard drafts each stage invoice through the **existing invoice path**, with bank details and a due-date reminder for the builder.

## Scope
- Table: stage schedule per accepted quote revision: stages with label, percentage or fixed amount, trigger (on acceptance, on a plan task done, on a date), status (planned, drafted, issued). Commands with expected version, replay identity and one audit event each.
- Amounts: exact decimal strings using the existing money helpers and rounding rules; **the stages always add up exactly to the accepted total** (the last stage takes the remainder). No new rounding code.
- Drafting a stage invoice calls the existing invoice-draft route; **nothing is issued without the builder's press**, and issuing uses the existing route unchanged. No card payments (MON-6), no sends except to the local catcher.
- An approved variation changes only stages not yet issued; issued invoices are never rewritten. The final account still reconciles (existing final-account path).
- Hidden financial findings never affect stage amounts or wording.

## Done when
- 30/40/30 on the seed quote total adds up exactly; an approved extra moves only later stages; issued stages never change; the final account reconciles to the accepted total plus approved extras.
- Replay, stale version, second-firm and audit tests per the rules. Nothing reaches the catcher unless the builder presses send. CI green apart from Vercel.
