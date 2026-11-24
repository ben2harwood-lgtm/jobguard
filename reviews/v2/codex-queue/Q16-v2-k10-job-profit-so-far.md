# Q16 · V2-K10: job profit so far

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's professional coding-rules checklist will be in `/mnt/project-files/audits/` once it lands; when it does, it applies too. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (money; hidden findings). No table (read-only); stop and report if one is needed. Astra: yes. Usefulness **high**, effort **S**. Rework risk: **medium**.
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-k10, section 2B item 26.
**Starts when:** R2 has pushed c3. **Base:** that c3 head.

## Goal
A plain line for the builder only: "Quoted £18,400, extras £1,250, spent £9,100 so far, on track for about 31%."

## Scope
- From the accepted quote, approved variations and recorded costs already on v2/main's base (supplier documents and any cost records). Exact decimal strings and existing money helpers; no new rounding.
- Builder only. Never shown to crew or customer.
- **Must never reveal a hidden financial finding before the disclosure rules allow** (plan section 5 "Final Check and pricing"): two copies of the job differing only in one planted hidden finding show identical figures and wording.
- Clear about what's missing: "Costs recorded so far only."

## Done when
- The seed job shows the right figures from its records; the planted-finding pair is identical; crew and customer sessions get nothing; second-firm test per the rules. CI green apart from Vercel.
