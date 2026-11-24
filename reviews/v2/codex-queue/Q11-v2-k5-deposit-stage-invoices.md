# Q11 · V2-K5: deposit and stage invoices from the accepted quote

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md` (version 1.1, in this repo on branch `claude/project-thread-cw5qv5`) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED (money)**. Migration **2012**. Astra: yes. Rework risk: **medium**. Ben decided practice slices of BUILD_PLAN.md items are fine (rev 1.3 decision 1); BUILD_PLAN.md M4-18 stays the plan of record for real use.
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-k5, section 2A item 3.
**Starts when:** R2 has pushed c3. **Base:** that c3 head. Draft PR against `codex/sandbox/v2-c3`.


> **Customer link rule (01-RULES rule 16):** copy the existing customer job link's anonymous-access database check, not F6's (#923); recorded customer agreements are immutable to the app role; seed proofs pass in the full V2 suite without tripping the sign-in rate limit.

## Change, 24 Nov 23:25 UK: cut to K5A (payment schedule only)
Codex stopped correctly. On c3, `apps/api/src/customer-invoice.controller.ts` has no draft route: `POST jobs/:id/customer-invoices` only **issues**, and the practice issue path needs a final-account revision, the Final Check and the full final-account amount. So a deposit or stage invoice can't go through it unchanged. This packet is now **K5A: the payment schedule, with no invoices**. **K5B** (drafting and issuing a stage or deposit invoice) needs a new, properly scoped invoice route on the money path. That's a separate RED packet, it goes to Astra before anyone builds it, and it isn't in tonight's queue.

## Goal (K5A)
The builder sets a payment split on the accepted quote (for example 30/40/30, or a fixed deposit then stages). JobGuard shows what is due, when and for how much, and flags a stage as "due now" when its trigger happens. Nothing is drafted, issued or sent.

## Scope (K5A)
- Table: one stage schedule per accepted quote revision. Each stage has a label, a percentage or fixed amount, a trigger (on acceptance, on a plan task done, on a date) and a status (planned, due). Commands carry expected version and replay identity, with one audit event each.
- Amounts: exact decimal strings using the existing money helpers and rounding rules. **The stages always add up exactly to the accepted total**; the last stage takes the remainder. No new rounding code.
- **No call to any customer-invoice route.** Don't edit `customer-invoice.controller.ts`, the invoice application or the final-account path. If you think you need to, stop and report.
- An approved variation re-splits only stages that aren't due yet, following the same rule. The builder sees "extras since the schedule was set" as its own line, ready for K5B or the final account.
- Builder only. Hidden financial findings never affect stage amounts or wording. No sends.
- Screen: one plain "Payment schedule" section on the job's Money tab, V2 only, behind the V2 flag.

## Acceptance cases added (Web Codex acceptance findings, frm-management-layer#3 comment 7145931890 (24 Nov 22:12 UK), folded in by the planner 22:25 UK)
- **Extra approved after the last stage is due.** Stages already due never change. The extra shows as its own "extras since the schedule" line for K5B or the final account. (Issued invoices are K5B.)

## Done when
- 30/40/30 on the seed quote total adds up exactly. An approved extra moves only stages not yet due. A stage turns "due" when its trigger happens. `git diff` shows no change to any customer-invoice or final-account file.
- Replay, stale version, second-firm and audit tests per the rules. Nothing reaches the catcher. CI green apart from Vercel.
