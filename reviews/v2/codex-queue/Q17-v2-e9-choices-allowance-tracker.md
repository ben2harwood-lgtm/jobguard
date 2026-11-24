# Q17 · V2-E9: customer choices and PC sums tracker

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's professional coding-rules checklist will be in `/mnt/project-files/audits/` once it lands; when it does, it applies too. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (money). Migration **2022**. Astra: yes. Usefulness **very high**, effort **M**. Rework risk: **high** (E1 is in review).
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-e9, section 2B item 17.
**Starts:** now. **Base:** E1's branch `claude/project-thread-vur4ba` (#919). Draft PR against it. It drafts extras through the variation path already on the base, so it does not wait for F3.


> **Customer link rule (01-RULES rule 16):** copy the existing customer job link's anonymous-access database check, not F6's (#923); recorded customer agreements are immutable to the app role; seed proofs pass in the full V2 suite without tripping the sign-in rate limit.

## Goal
Each customer choice (tiles, sanitaryware, worktop, paint) has an allowance (for example tiles at £25/m²) and a "decide by" date. If the choice goes over the allowance, a variation is **drafted** for the difference, never committed.

## Scope
- Table: allowance per choice (E1 customer-choice fact, allowance amount and basis per unit or total, decide-by date, chosen item and price). Commands with one audit event each.
- Over allowance: draft one variation for the difference through the existing variation-draft route, linked to the choice; the builder reviews it. Under or equal: nothing drafted.
- A late choice (past decide-by) is flagged to the builder and on the plan if a task depends on it.
- Never changes the accepted quote or any committed price.

## Acceptance cases added (Web Codex acceptance findings, frm-management-layer#3 comment 7145931890 (24 Nov 22:12 UK), folded in by the planner 22:25 UK)
- **Back under allowance after a draft exists.** If a choice moves from over the allowance back to equal or under, the existing draft is cancelled or superseded through the existing draft transition (name it in the PR) and can never be approved for the old excess. Test it.

## Done when
- Tiles chosen at £31/m² for 6 m² against £25/m² drafts one £36 (plus VAT as the existing rules apply) variation, uncommitted; a choice at or under allowance drafts nothing; changing the choice updates the same draft rather than adding another; a late choice is flagged; replay, stale version, second-firm and audit tests per the rules. CI green apart from Vercel.
