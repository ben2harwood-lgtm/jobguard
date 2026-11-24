# Q10 · V2-F8: who was on site today

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's professional coding-rules checklist will be in `/mnt/project-files/audits/` once it lands; when it does, it applies too. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (new table; personal attendance data). Migration **2016**. Astra: yes. Rework risk: **high**.
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-f8, section 2A item 15.
**Starts when:** Q09 (V2-F1) has pushed. **Base:** `codex/sandbox/v2-f1`. Draft PR against it.

## Goal
One tap per person per day on the job's diary, with **no location tracking**, to feed the diary and later daywork sheets.

## Scope
- Table: job, person (crew member or builder), day (Europe/London), tapped by, time, optional note. One row per person per day; a second tap the same day is a replay or an edit.
- Command with expected version, replay identity and one audit event. No latitude, longitude, IP or device location stored anywhere.
- A crew member sees only their own days; the builder sees everyone on their jobs; the customer sees nothing.
- Shown on the diary view, V2 only.

## Done when
- A replayed tap counts once; no location is stored (assert the table has no such columns and the request carries none); a crew member sees only their own days; second-firm and audit tests per the rules. CI green apart from Vercel.
