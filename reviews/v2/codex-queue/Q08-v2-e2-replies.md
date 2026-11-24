# Q08 · V2-E2: replies tied to the one fact they answer

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's professional coding-rules checklist will be in `/mnt/project-files/audits/` once it lands; when it does, it applies too. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (new table; outside answers). Migration **2013**. Astra: yes. Rework risk: **high** (E1 is in review).
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-e2.
**Starts:** now. **Base:** E1's branch `claude/project-thread-vur4ba` (#919). Draft PR against it. Merge E1 again when it moves. Do not edit E1's files; answer facts through E1's commands.

## Goal
A reply from a customer, merchant or crew member is tied safely to firm, job, verified recipient, the one open fact it may answer, the request version, an expiry and a way to cancel.

## Scope
- Table of reply requests: fact (E1), recipient (role and contact as recorded), request version, single-use reply token stored as a hash, expiry, cancelled. Builder creates and cancels (audit event each).
- A reply page by token (V2 only, no sign-in): shows only that one question and its options, records the answer once, and applies it to E1's fact through E1's command.
- Requests are "sent" **only to the local catcher**. Also allow the builder to paste a reply received by WhatsApp or phone as the answer (plan section 9 point 3), recorded with source "pasted by builder".
- Answer from a request for an older fact version: kept as out of date, not applied. Expired or cancelled token: refused plainly.

## Done when
- A duplicate reply applies once; a reply to an old request is kept as out of date and not applied; another firm's token or fact is refused; expired and cancelled tokens are refused.
- The catcher holds exactly one message per request; nothing goes anywhere else. Audit events for create, cancel and applied answer. CI green apart from Vercel.
