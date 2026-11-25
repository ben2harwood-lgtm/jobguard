# Q16 · V2-K10: job profit so far

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md` (version 1.1, in this repo on branch `claude/project-thread-cw5qv5`) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (money; hidden findings). No table (read-only); stop and report if one is needed. Astra: yes. Usefulness **high**, effort **S**. Rework risk: **medium**.
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-k10, section 2B item 26.
**Starts when:** R2 has pushed c3. **Base:** that c3 head.

> **c3 audit gap (standard line, coordinator ruling 25 Nov 00:09 UK).** c3's plan read creates a plan with no audit event. That is a known c2/c3 gap, and its fix waits for Ben. This piece **reads or links to the plan only**: build against c3 as it is, and **keep out of `packages/db/src/v2-work-plan-repository.ts`** (and every other c2/c3 file). Do not hold on this gap. Put this line in the PR body: "Inherits c3's plan-creation audit gap; needs c3 re-merged after the c2/c3 fix." 

## Goal
A plain line for the builder only: "Quoted £18,400, extras £1,250, spent £9,100 so far (46% of £19,650), £10,550 left in the budget." (ex-VAT; corrected 22:25 UK)

## Scope
- From the accepted quote, approved variations and recorded costs already on v2/main's base (supplier documents and any cost records). Exact decimal strings and existing money helpers; no new rounding.
- Builder only. Never shown to crew or customer.
- **Must never reveal a hidden financial finding before the disclosure rules allow** (plan section 5 "Final Check and pricing"): two copies of the job differing only in one planted hidden finding show identical figures and wording.
- Clear about what's missing: "Costs recorded so far only."

## Acceptance cases added (Web Codex acceptance findings, frm-management-layer#3 comment 7145931890 (24 Nov 22:12 UK), folded in by the planner 22:25 UK)
- **Correct the example (it was wrong).** This piece shows no forecast percentage, because a forecast needs a cost-to-complete input that doesn't exist yet. The builder sees, ex-VAT and stated as ex-VAT: **quoted** £18,400, **approved extras** £1,250, **job total** £19,650, **recorded costs so far** £9,100, **left in the budget** £10,550, and **spent so far** 46.31% of the total (9,100 ÷ 19,650). A forecast margin is a later piece.
- If there is no accepted price (job total zero or missing): show "No accepted price yet" and no percentages.
- **Leak pair.** Compare the complete response for two jobs differing only in a hidden finding; then test that crew and customer roles are refused on the read endpoint.
- **Crew and customer refusals while V2 has no crew or customer sessions (planner, 25 Nov 00:50 UK).** Main's crew and customer session routines (`identity.customer_portal_use`, `identity.extra_customer_use`, `app.customer_portal_issuer`, the operative routines in 0549) only run on `jobguard_synthetic_demo`, so these sessions can't be made on the V2 database until V2-SX. Until then:
  1. Keep the builder, leak-pair and second-firm tests on the real V2 database.
  2. Prove the read endpoint's **own** role gate with an HTTP-level test. Use the same route handler and a session whose resolved membership role is crew or customer (the repo's existing role-check test pattern). It must get the plain refusal and a body with no figures.
  3. Don't add skipped or todo tests, because rule 10 forbids silent skips. List the real-session crew and customer cases in the PR body under "Waits for V2-SX".
  - **Correction (25 Nov 02:55 UK, plan check 7150113086).** The seed test that sends `jg_customer_session=fictional-customer-token` and expects 401 proves only that an invalid session is refused. It does not prove a real customer is refused. Keep it, but name it "invalid customer cookie is refused", and don't count it as the customer-role test. The real-role proof (separate cookie jars, no financial fields, after signout, across firms) is in V2-SX revision 2 and comes back as K10-R.
  4. K10 is judged on 1 and 2. The real-session tests come back as **K10-R**, test files only, once V2-SX merges.

## Done when
- The seed job shows the right figures from its records; the planted-finding pair is identical; crew and customer roles are refused at the route (real V2 sessions wait for V2-SX); second-firm test per the rules. CI green apart from Vercel.
