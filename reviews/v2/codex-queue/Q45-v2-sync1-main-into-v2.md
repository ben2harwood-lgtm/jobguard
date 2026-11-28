# Q45 · V2-SYNC-1: merge main into v2/main (photos on extras, snag list, pack count, pilot work)

> As of 25 Nov 20:10 UK, main has #905 (photos on variations), #910 (pack count) and #911 (snag list). It does **not** have #906 (6pm diary) or #907 (Friday PDF), which are both still open against main, and there's no handover-page PR on main yet. A **SYNC-2** follows once those merge.

**Tier:** RED (it brings 12 main migrations and changes in the shared code). **Builder:** Opus 5.5 thread (Ben, 25 Nov 19:53 UK: Opus builds and repairs, Codex only checks). **Checker:** Codex, by a `@codex review` comment on the PR or a read-only Mac review (rule 27). **Base:** v2/main. **Branch:** `claude/<thread>-sync1`. **PR:** draft into v2/main, made as a **merge commit**. Don't squash or rebase. **V2 migration: 2056** (a V2 bootstrap file; next free becomes 2057). **Plan check:** Astra. Planner: Fable thread, 25 Nov 20:10 UK.

**When.** Start now. Merge it **after FL-1 #966**, so the guard checks main's new tables. If FL-1 hasn't merged, run its guard from that branch locally and paste the result.

## Dry-check: origin/main against v2/main, 25 Nov 20:05 UK (rule 23)
- main is **107 commits ahead** of v2/main, and v2/main is 57 ahead of main. That's 327 files and about 19.8k lines.
- The merges include #905 (photos on variations), #910 (pack count), #911 (QW-4 snag list) and #873 (launch test). Pilot pieces #877 to #888 bring migrations **0771 to 0782**.
- A trial `git merge-tree` shows **three conflicts**:
  - `apps/web/app/ui/quote-editor.tsx`, because c5 (#921) and QW-6 #910 both touch the quote editor;
  - `packages/db/src/index.ts`, export lists on both sides, so keep both;
  - `packages/db/test/purchase-order-audit.integration.test.ts`, migration-count or list lines on both sides, so recount.
- **Fences.** In the new main migrations, the literal `jobguard_synthetic_demo` appears:
  - in **0782_snag_list.sql line 123**, inside `app.snag_practice_actor(t uuid, j uuid)` (`SNAG_PRACTICE_ONLY`), so snags refuse on V2's `jobguard_v2_local`;
  - in **0777_pilot_final_check.sql line 103** (`pilot := current_database() <> 'jobguard_synthetic_demo'`), so on V2 the final-check path takes the **pilot** branch;
  - 11 times in **0775_pilot_customer_portal.sql**.
  None of 2001's six retargeted routines is redefined in 0771 to 0782, so 2001 keeps working.
- **New main job tables:**
  - `app.snag_command`, `app.snag`, `app.snag_revision`, `app.snag_event`, `app.snag_photo` and `app.snag_photo_upload` (0782);
  - `app.variation_revision_photo` (0781);
  - `app.pilot_final_check_terms_approval` (0776).
  None of them has `v2_practice_firm`.

## Build
1. **Merge `origin/main` into a branch from v2/main.** Resolve the three conflicts by keeping both sides' behaviour. For `quote-editor.tsx`, c5's "don't forget" prompts and QW-6's pack count must both still render, and both sets of tests must pass.
2. **V2 bootstrap file `tools/v2/migrations/2056_v2_sync1_fences_and_locks.sql`.** Use 2001's fence (lines 1 to 17), then:
   - **(a)** Retarget `app.snag_practice_actor` the way 2001 does (lines 20 to 39: read `pg_get_functiondef`, replace the literal with `jobguard_v2_local`, `CREATE OR REPLACE`, and assert the owner and ACL are unchanged). Snags then work on V2 practice jobs.
   - **(b)** Don't retarget 0775 (SX rev 4: customers use V2 capability links only), and don't retarget 0777. Instead add a seed test proving the V2 final-check path is **not reachable** on a practice job today: it refuses, or runs no pilot side effect. Record that 0777's pilot branch applies on V2 under "LATER for G pieces".
   - **(c)** Add 2001's `v2_practice_firm` policy to the eight new main job tables listed above.
   - Load 2056 in `bootstrap.mjs` **above** FL-6's 2054 line (rule 30), or as the last line before it if FL-6 hasn't merged.
3. **Run main's migrations on a fresh V2 stack.** All 0771 to 0782 must apply in the V2 bootstrap. Note the schema migration count it prints.

## Tests
- On the merge, these must all pass with no skips:
  - the full V2 seed suite (CI1);
  - core and web unit tests;
  - main's own tests for #905, #910, #911 and #873.
- New seed tests:
  - a snag can be recorded on the V2 practice job, and the second firm can't see it;
  - a variation revision photo is invisible to the second firm;
  - the 0777 pilot branch isn't reachable from a practice job (2b);
  - the FL-1 guard passes, with no new pending entries.
- Lane lint with `LANE_BASE_REF=origin/v2/main`. The lane file allows the merge's files through a `merge-main` note, per the existing merge practice. Check how #898 to #901's restacks were linted.

## Stop and ask
- A conflict that needs a product choice, not a mechanical one.
- A main test that fails only on V2.
- Any main migration that refuses on `jobguard_v2_local` other than the three fences listed above.

## Done when
- v2/main has main's photos on extras, snag list and pack count working on the V2 practice job.
- Snags work on V2. The new tables are locked. CI1 is green.
- The Codex review is clean or answered.
- After it merges, the G pieces can reuse QW-4 and QW-5 (roadmap batch G).
