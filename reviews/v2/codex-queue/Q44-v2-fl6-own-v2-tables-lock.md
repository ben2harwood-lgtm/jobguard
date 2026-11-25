# Q44 · V2-FL-6: lock every V2-owned job table, including ones still on unmerged branches

> Found by the Claude check of the FL PRs (25 Nov 18:28 UK). The Q35 catalog was read on a base that didn't yet have the V2 piece tables on unmerged branches, so those tables are on no FL list. Examples:
> - `v2_crew_brief`, `v2_crew_brief_photo` and `v2_crew_brief_command` (migration 2007, #916 and #954);
> - likely `v2_measurement` (2005, #904).
>
> The FL-1 guard will fail as soon as one of those branches meets FL-1.

**Tier:** RED (tenancy). **Builder:** desktop Codex (lane A). It's one SQL file and one bootstrap line, and CI1 is the proof. Checker: Claude. **Base:** `codex/sandbox/v2-fl1` (#966). **Branch:** `codex/sandbox/v2-fl6`. **PR:** draft into `codex/sandbox/v2-fl1`. **Migration: 2054**, a V2 bootstrap file (next free becomes 2055). **Plan check:** Astra. Planner: Fable thread, 25 Nov 18:35 UK.

## Dry-check against `codex/sandbox/v2-fl1` (rule 23)
- `tools/v2/bootstrap.mjs` lines 64 to 71 load the V2 files explicitly, in order: 2001, 2002 to 2004, 2025, then 2047. Every V2 piece branch adds its own line here.
- `tools/v2/migrations/2047_v2_firm_lock_core.sql` and `2001_practice_quote.sql` lines 1 to 17 give the fence, and lines 45 to 52 the policy pattern.
- The guard is `tools/v2/firm-lock/guard.mjs`. Pending lists live in `tools/v2/firm-lock/pending/`.

## Build
1. **`tools/v2/migrations/2054_v2_own_tables_firm_lock.sql`.** It uses 2001's fence (lines 1 to 17), then loops over the catalog:
   - every table in schema `app` whose name matches `v2\_%`;
   - that has both `tenant_id` and `job_id` columns;
   - that has no `v2_practice_firm` policy.
   For each one, it creates 2001's RESTRICTIVE `FOR ALL TO jobguard_runtime` EXISTS-on-`app.job` policy, using `format('%I')` for the name. V2-owned tables only: tables from main stay with FL-1 to FL-5. It changes no grants or other policies, and it is safe to run twice.
2. **Load it last.** Add its line as the **final** migration line in `bootstrap.mjs`, after every other V2 file. Comment it: `// V2-FL-6 (2054): must stay the last migration line; later pieces add theirs above it (rule 30).`
3. **Rule 30** goes in `01-RULES.md`, written by the planner (already done; see below). A builder doesn't need to lock its own `v2_*` job tables by hand, because 2054 does it. But it must put its bootstrap line **above** 2054, and its seed tests must include one firm A/B read check for each new job-bound table.
4. **Tests.** A seed check proves the lock is in place on every `v2_*` job table present on this base, by listing them from the catalog and expecting zero unlocked. One firm A/B read check uses `v2_work_plan_task`, or whichever `v2_*` table FL-1 doesn't already cover. Then run it on #954's branch locally: merge `codex/sandbox/v2-fl6` into a scratch copy of `codex/sandbox/v2-d5b-b`. Paste the guard output, which should show the crew-brief tables locked, into the PR body.

## Done when
- 2054 applies twice cleanly and is the last bootstrap line.
- The guard passes on this base and on the scratch merge with #954.
- CI1 is green, and the Claude check is clean or answered.
