# Q06 · V2-K9: risk assessment, method statement and construction phase plan (draft)

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md` (version 1.1, in this repo on branch `claude/project-thread-cw5qv5`) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (new table; safety document). Migration **2011**. Astra: yes. Rework risk: **medium**.
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-k9, section 2B item 22.
**Starts when:** R2 has pushed c3. **Base:** that c3 head. Draft PR against `codex/sandbox/v2-c3`.

## Goal
From the job's scope, template and plan, JobGuard fills a draft risk assessment, method statement and construction phase plan that the builder completes and signs. **JobGuard never certifies it** (plan section 5 "Who decides").

## Scope
- Template data (its own file, keyed by c1's template key): common hazards and controls per task type (for example dust from tile cutting, working at height for hall ceilings, occupied home, COSHH for adhesives and paint).
- Table of RAMS drafts: job, version, sections (hazards and controls per task, sequence of work, site rules, welfare, emergency contacts), builder edits, status (draft, signed), signed by and when. Commands: generate, edit a section, sign. Each with expected version, replay identity and one audit event. Regenerating keeps builder edits where they still fit and flags clashes.
- The signed version is read-only; a change makes a new draft version.
- Export as a printable page (no sending). Clear wording: "Prepared by JobGuard from your plan. You must check and complete it. It is not a certificate."
- No prices. Zero paid AI calls (data-driven only).

## Done when
- The splashback and hall job gets a draft listing tile-cutting dust and occupied-home controls; the builder edits one section and signs; a later plan change makes a new draft and leaves the signed one untouched.
- Replay, stale version, second-firm and audit tests as in the rules. Playwright 360/1280 + phone-mode run. CI green apart from Vercel.
