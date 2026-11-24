# Q10 · V2-F8: who was on site today

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
