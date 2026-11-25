# Q35 · V2-FL: lock every job-bound table to its practice firm, with a guard test

> Follow-up to PX's migration 2025 (`2025_v2_evidence_firm_lock.sql`, evidence and photo tables, Ben approved "lock photos" 25 Nov). The PX builder flagged that other main tables bound to a job, outside 2001's quote-graph list, may have the same cross-firm gap on V2.

**Tier:** RED (tenancy). **Builder:** a Claude Opus thread (needs a live V2 database). **Base:** v2/main **after PX merges** (it needs 2025 in place). If PX has not merged, base on the PX branch and say so. **Branch:** `claude/<thread>`. **PR:** draft into `v2/main`, so CI1 runs. **Migration: 2047** (next free becomes 2048). **Planner:** Fable thread, 25 Nov 17:35 UK. A RED plan check is required on frm-management-layer#3 before building. Rules 1 to 29 apply, with a "Rules met" list in the PR body.

## Dry-check against v2/main @ 63f3af5ab (rule 23)
- `tools/v2/migrations/2001_practice_quote.sql` lines 42 to 57:
  - line 43 locks `app.job` with a RESTRICTIVE policy `v2_practice_firm` (`practice_session_digest IS NULL OR app.current_firm_profile_key() = 'practice:' || digest`);
  - lines 45 to 52 add `EXISTS (SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(t.tenant_id,t.job_id))` on 11 quote-graph tables only;
  - lines 55 to 57 lock `app.capture_source` through `job_record_proposal`.
- Lines 1 to 17 give the wrapper: `DO $v2$` plus the database-name and data-directory fence. 2047 copies that wrapper.
- Main has 438 migrations under `packages/db/migrations/`. A rough text search finds about 18 `CREATE TABLE app.*` with a `job_id uuid` column. That count is only an estimate, which is why the list must come from the live catalog (step 1), not from text search.
- CI1 runs `tools/v2/seed.integration.test.mjs` in the v2-seed job (`.github/workflows/ci.yml` line 184).

## Steps
1. **List from the catalog, not by hand.** On the V2 database after 2001 to 2046 and 2025, query `pg_class`/`pg_attribute` for every table in schema `app` that has both `tenant_id` and `job_id`, and list which already carry a `v2_practice_firm` policy. Paste the full list into the PR body: name, whether it was already locked, and what 2047 does.
2. **Indirect tables.** Tables that reach a job only through another table (as `capture_source` does) are listed separately in the PR body with the parent they join through. Lock those whose rows name a customer, crew member, address, photo, price or message. Any you leave out need a one-line reason in the allow list (step 4).
3. **Migration 2047** adds, for each table from step 1 that isn't locked yet, the same RESTRICTIVE `FOR ALL TO jobguard_runtime` policy as 2001 lines 50 and 51. Each policy is created only when `pg_policy` lacks it. It changes no grants, no other policies, and nothing on main's migrations. Run it on a database already holding V2 rows, then run it a second time.
4. **Guard test (the real fix).** Add a seed test, run by CI1, that queries the catalog and **fails** when any `app` table with `tenant_id` + `job_id` lacks `v2_practice_firm`, unless it is in an explicit allow list in the test with a reason. That way a new main table can't open the gap again silently. The allow list starts empty, or holds only reasoned entries.
5. **Proof per table class.** For each newly locked table, one seed check: firm A's session sees its own row, and firm B's session sees zero rows for the same job, using the two linked practice firms. Use one representative table per migration family if the list is long, plus the guard test over all of them.

## Stop and ask
- A table whose lock breaks an existing seed or main test, unless a V2-only policy fixes it. Never change main's migrations, grants or RLS to make a test pass.
- A table with a `job_id` that is nullable and holds rows for no job. Report it; don't lock it with a policy that hides those rows.
- More than 40 tables. Report the list and let the planner split the piece.

## Done when
- The PR body has the full catalog list and the indirect list.
- 2047 is applied twice cleanly. The guard test passes, and it fails when one policy is dropped (show that run in the PR).
- The firm A/B checks pass, and CI1 is green.
- A Codex review is clean or answered. Only Ben merges.
