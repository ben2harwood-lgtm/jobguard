# Q05 · V2-K8: off-hire reminders (scaffold, skips, plant)

Tier: **RED** (new table, money figures). Migration **2010**. Astra: yes. Rework risk: **medium**.
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-k8, section 2B item 18.
**Starts when:** R2 has pushed c3. **Base:** that c3 head. Draft PR against `codex/sandbox/v2-c3`.

## Goal
The builder records hired items on a job and is reminded to off-hire them when the work that needs them is done, so they stop paying for idle scaffold.

## Scope
- Table of hire items: job, what (scaffold, skip, plant, other), supplier text, booked-from date, weekly cost (exact decimal string, shown only to the builder), linked plan task(s) that need it, status (on hire, off-hire requested, off hire).
- Commands: add, edit, link to tasks, mark off-hire requested, mark off hire. Each with expected version, replay identity and one audit event.
- A reminder shows on the job (and Today if a list exists) when every linked task is done or its date has passed: "Scaffold not needed after Thursday: off-hire it?" Builder-only. **No message to the supplier**; at most a draft text the builder copies.
- Cost running total "about £X so far" for the builder only, from booked-from date and weekly cost, never shown to crew or customer.
- Simple screen section on the job's Work tab, V2 only.

## Done when
- Scaffold linked to the tiling task: after tiling is marked done (or its date passes), the reminder appears; marking off hire clears it; survives reload.
- Replay adds nothing; stale version refused; second firm sees none of it; every command has one audit event.
- Nothing reaches the local catcher. Playwright 360/1280 + phone-mode run. CI green apart from Vercel.
