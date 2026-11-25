# Q40 · V2-FL-F: which SECURITY DEFINER functions can cross firms on V2

**Tier:** RED (tenancy), report first. **Builder:** desktop Codex (lane A; no web Codex runner, 25 Nov), reading code and the catalog report. The checker is Claude. **Base:** `codex/sandbox/v2-fl1`. **Migration:** none in this piece. Any fix becomes its own packet. Planner: Fable thread.

## Why
The Q35 catalog run found **294 SECURITY DEFINER functions in `app` granted to `jobguard_runtime`** (list at the end of `/mnt/project-files/jobguard-v2/v2-fl-catalog-stop-2026-11-25.md`). A definer function runs as its owner, so a `v2_practice_firm` policy `TO jobguard_runtime` doesn't apply inside it. If V2 calls one that reads or writes job rows by tenant only, firm B could reach firm A's job, whatever the FL locks say.

## Steps
1. **Find what V2 can reach.** List every definer function that V2 code can call: anything under `apps/api/src` and `packages/db/src` reachable from V2 routes, `/api/v2-backend/*` and the V2 workspace, including functions called by other functions. Use a grep of `app\.[a-z_]+\(` plus `pg_depend`/`prosrc` for nesting. Paste the list.
2. For each one, record: does it touch job-bound rows, and does it check the firm (`app.current_firm_profile_key()` or a job lookup that the firm lock covers)?
3. Class each one as **safe** (no job rows, or firm-checked), **gap** (job rows by tenant only), or **unclear**.
4. Add a seed check per **gap** that proves the cross-firm read or write, written as an expected failure with `test.todo` and a reason. Rule 1 forbids skips in finished pieces, so this PR stays a draft report and never merges with todos.
5. **Stop** and post the table: function, caller, class, proof. The planner writes the fix packets (likely 2001-style retargets or V2 wrappers). Nothing in main's functions changes.

## Done when
The table covers every reachable function, each gap has a proof, and the report is in the PR body and in `/mnt/project-files/jobguard-v2/`.
