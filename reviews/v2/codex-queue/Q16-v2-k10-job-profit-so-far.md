# Q16 · V2-K10: job profit so far

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
