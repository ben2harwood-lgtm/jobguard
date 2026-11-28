# Q89 · V2-FL-JOB: app.job's firm lock stops another firm reading an imported job, so every table locked through app.job is closed too

**Tier:** T3 RED (an RLS policy; desktop security review). **Builder:** Opus 5.5 thread. **Checker:** desktop Codex code review and security review. **Base:** v2/main + #1057 at its head when you start (record the sha). **Branch:** the builder thread's own branch, in a new lane `config/lanes/v2-fl-job.json`. **Migration:** 2090, from the register; it's final at merge. **From:** desktop Codex P2 on #1104 @ 5b379cb7a (28 Nov 17:30 UK). **Plan check:** Astra on frm-management-layer#3, with a Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 17:35 UK.

## What it is
app.job's restrictive `v2_practice_firm` policy lets through every row with `practice_session_digest IS NULL`, and that's how imported jobs are stored. Many tables are locked indirectly, by "the job is visible": 2089's stage_completion and stage_review_event, FL-1's photo tables, 2047's diary and links, and others. All of them inherit that opening, so firm B can read firm A's imported-job rows through any of them.

## Steps
1. **Inventory.** List every V2 restrictive policy that reaches a row's firm only through app.job. Put the list in the PR.
2. **Write a failing test first.** Firm A imports a job, and firm B's practice session then tries every table in the list. Today some reads succeed; record which.
3. **Fix it once, in app.job's own `v2_practice_firm` policy**, migration 2090, edited as a new migration rather than in place. An imported job (`practice_session_digest IS NULL`) is visible only to the firm that owns it, decided by the same owned-job walk 0734 and 2089 use. An unowned imported job is visible to no practice firm. Main's own policies and lp6 don't change.
4. Change no indirect policy unless the inventory finds one that doesn't go through app.job.

## Tests
- On an imported job, the owner reads every listed table and firm B reads none of them.
- On a session-created job, behaviour is unchanged.
- A job with no owner is visible to no practice firm.
- Main's own job reads in the V2 DB are unchanged; the full DB integration suite proves it.
- v2-seed and CI1 pass. `tools/migration-renumber.mjs --check` is clean. Rule 29/30: no route and no table.

## Done when
- No table locked through app.job lets another firm read an imported job.
- #1104's P2 is answered with a link to this PR.
- The desktop code and security verdicts are clean.
- Ben presses the RED card, and the planner raises it.
