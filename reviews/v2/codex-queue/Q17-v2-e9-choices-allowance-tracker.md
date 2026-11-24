# Q17 · V2-E9: customer choices and PC sums tracker

Tier: **RED** (money). Migration **2022**. Astra: yes. Usefulness **very high**, effort **M**. Rework risk: **high** (E1 is in review).
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-e9, section 2B item 17.
**Starts:** now. **Base:** E1's branch `claude/project-thread-vur4ba` (#919). Draft PR against it. It drafts extras through the variation path already on the base, so it does not wait for F3.

## Goal
Each customer choice (tiles, sanitaryware, worktop, paint) has an allowance (for example tiles at £25/m²) and a "decide by" date. If the choice goes over the allowance, a variation is **drafted** for the difference, never committed.

## Scope
- Table: allowance per choice (E1 customer-choice fact, allowance amount and basis per unit or total, decide-by date, chosen item and price). Commands with one audit event each.
- Over allowance: draft one variation for the difference through the existing variation-draft route, linked to the choice; the builder reviews it. Under or equal: nothing drafted.
- A late choice (past decide-by) is flagged to the builder and on the plan if a task depends on it.
- Never changes the accepted quote or any committed price.

## Done when
- Tiles chosen at £31/m² for 6 m² against £25/m² drafts one £36 (plus VAT as the existing rules apply) variation, uncommitted; a choice at or under allowance drafts nothing; changing the choice updates the same draft rather than adding another; a late choice is flagged; replay, stale version, second-firm and audit tests per the rules. CI green apart from Vercel.
