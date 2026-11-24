# Q14 · V2-K6: forward a merchant invoice to the job

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's professional coding-rules checklist will be in `/mnt/project-files/audits/` once it lands; when it does, it applies too. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (inbound documents routed to a firm). Migration **2020**. Astra: yes. Usefulness **high**, effort **M**. Rework risk: **low** (base merged).
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-k6, section 2A item 4. Practice slice of BUILD_PLAN.md M2-2 and SV-7B; a real inbound mail provider is Ben's later call (D04).
**Starts:** now. **Base:** `v2/main`. Stock effects (E3) are left out, so it does not wait for E3.

## Goal
Each firm gets one inbound address. A merchant invoice email forwarded there (with its attached PDF or image file) lands on the right job as a supplier document, ready for the existing three-way check (M2-4-S), without retyping.

## Scope
- Table: firm inbound address (random local-part, stored), and inbound items (received at, sender, subject, attachment references, matched job or "needs a job", filed by). One audit event per filing command.
- Practice only: a **local inbound catcher** (a test route or folder the V2 launcher reads) stands in for real mail. No real mail provider.
- Filing: match a job by a job reference in the subject or body, or by a supplier already on the job; otherwise it waits in "needs a job" for the builder. Filing uses the **existing** supplier-document intake (`supplier-documents/intake`) unchanged; if it can't, stop and report.
- Unknown sender: always waits for the builder. Another firm's address never files into this firm.

## Done when
- A forwarded invoice with the job reference files to that job and reaches the three-way check; one without a match waits; an unknown sender waits; mail to another firm's address never appears here; a duplicate forward files once; second-firm and audit tests per the rules. CI green apart from Vercel.
