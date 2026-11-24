# Q13 · V2-K4: automatic chasing of unanswered quotes and unpaid invoices

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's professional coding-rules checklist will be in `/mnt/project-files/audits/` once it lands; when it does, it applies too. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (customer messages about money). Migration **2019**. Astra: yes. Usefulness **very high**, effort **S–M**. Rework risk: **low** (base merged).
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-k4, section 2A item 2, Ben's decision 3 (defaults). Follows BUILD_PLAN.md M4-16's rules for customer messages.
**Starts:** now. **Base:** `v2/main`. It reads quote and invoice states already on v2/main's base, so it does **not** wait for E7.


> **Customer link rule (01-RULES rule 16):** copy the existing customer job link's anonymous-access database check, not F6's (#923); recorded customer agreements are immutable to the app role; seed proofs pass in the full V2 suite without tripping the sign-in rate limit.

## Goal
The builder switches chasing on once per firm; JobGuard sends polite reminders for quotes not answered and invoices not paid, and stops by itself.

## Scope (Ben's defaults, exactly)
- Quotes sent and not accepted or declined: nudge on **day 3 and day 7**. Unpaid invoices: **3 and 10 days after the due date**. **At most three per item.**
- Stops on: a reply or decision, payment, a dispute, the builder's stop on that item, or the firm switching chasing off. **Never** chases a disputed, paid, part-paid-in-dispute or no-charge-pilot amount.
- Table: firm chase setting (on or off, who switched it, when) and chase log (item, step, due, sent, stopped reason). Commands: switch on or off, stop one item. A "run chases" step finds due chases and records each step **once** (idempotent per item and step), using the existing scheduler or worker if one fits, otherwise a run command tests can call with a test clock. One audit event per command and per chase sent.
- Message text: short, polite, fixed templates with the firm's name, the quote or invoice number and the amount; no other figures. Delivered **only to the local catcher**.
- Builder view: what will be chased next and when, with "stop" per item.

## Done when
- With a test clock: a quote gets chases on day 3 and 7 and no more; an invoice gets them at due+3 and due+10; a paid or disputed invoice gets none; a reply stops the chain; switching off stops everything queued; a re-run sends nothing twice; second-firm and audit tests per the rules; the catcher holds exactly the expected messages. CI green apart from Vercel.
