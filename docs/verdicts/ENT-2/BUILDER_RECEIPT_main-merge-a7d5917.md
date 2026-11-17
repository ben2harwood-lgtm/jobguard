# ENT-2 builder receipt, main merge (origin/main `a7d5917`, CH-1 #123)

**Builder receipt only — not independently verified, not accepted.** Builder: Claude Sonnet 5.5. A fresh reviewer and the integrator decide acceptance; the builder never reviews, accepts, pushes or merges.

## Identity

| | |
|---|---|
| Branch | `codex/sandbox/ent-2` (local only, not pushed) |
| Merged in | `origin/main` at `a7d5917d676791671706b43b4730652544ba6ce4` (Merge CH-1 #123, migration 0109) |
| Pre-merge head | `0f5608ccd78cb475ea526445f3b159a2291e8b65` (attempt-3 repair) |
| Merge commit | `c7a88301b52097bc0b06c30813f21bc5e17e3690` (parents `0f5608c`, `a7d5917`) |
| Code head verified | `c7a88301b52097bc0b06c30813f21bc5e17e3690` (this receipt is the only change after it) |

## Conflict resolutions (every one keeps both sides)

| File | Resolution |
|---|---|
| `BUILD_PLAN.md` | Kept main's "Ledger amendment — CH-1, 9 October 2026" line and this branch's "Ledger amendment — ENT-2, 9 October 2026" line, CH-1 first (merged first); wording of both unchanged. |
| `packages/core/src/index.ts` | Union of exports: `work-order.js`, `sor-pricing.js` (ENT-2) and `activation-v3.js` (CH-1). |
| `packages/db/src/migrate.ts` | `MIGRATION_URLS` in numeric order: …`0107_recovery_messages.sql`, `0109_job_activation_terms.sql`, `0110_work_orders.sql`. |
| `packages/db/test/tenancy.integration.test.ts` | Union of rows in both lists (forced-RLS list and owner list); `job_activation_terms` placed before `job_assignment` to keep the lists alphabetical. Two hunks. |
| `packages/db/MIGRATIONS.md` | Both sections kept in numeric order (0109 CH-1, then 0110 ENT-2); text unchanged. |
| `config/agent-lane-assignments.json` | Auto-merged without conflict; `ch-1` and `ent-2` lanes both present; valid JSON. `lane-union.py` was not needed. |

Observation, not changed (no judgement was permitted, wording of a section is the lane owner's): the ENT-2 section in `MIGRATIONS.md` still says the migration is "Registered last, after `0106_practice_feed.sql`" and takes the next number "after the held 0107-0109". After this merge it is registered after `0109_job_activation_terms.sql`, and 0107, 0108 and 0109 are all merged.

## Step 2 — object overlap between 0109 (CH-1) and 0110 (ENT-2)

No object is created, replaced or altered by both. Both touch `app.job`, but on different objects:

| | 0109 (CH-1) | 0110 (ENT-2) |
|---|---|---|
| CHECK constraints on `app.job` | drops and re-adds `job_baseline_shape`; drops and re-adds `job_practice_scenario_check` | drops and re-adds `job_provenance_check` (defined inline in 0020; no migration other than 0110 changes it); adds `work_order_job_has_no_quote_or_fee` |
| Columns on `app.job` | adds `saved_v1_sample boolean NOT NULL DEFAULT false` | none |
| Triggers on `app.job` | `saved_v1_sample_guard` (BEFORE INSERT OR UPDATE) | `a_work_order_job_guard` (BEFORE INSERT OR UPDATE) |
| Other | rebuilds `app.job_activation.job_activation_check`; new table `job_activation_terms`; new functions `switch_job_live_v3`, `guard_saved_v1_sample`, `seed_saved_v1_sample` | new tables/functions for work orders, SoR, scheduling; `CREATE OR REPLACE app.read_contractor_resident` (only 0102 and 0110 define it) |

0110 therefore rebuilds nothing that 0109 changed, so no 0110 definition needed to carry a 0109 change. Interaction checked: 0110's work-order job insert (`id, tenant_id, title, status, revision, provenance='work_order'`) leaves the four baseline columns NULL, so it satisfies 0109's new `job_baseline_shape` through its all-NULL first branch; `practice_scenario` stays NULL (passes `job_practice_scenario_check`) and `saved_v1_sample` takes its default `false` (passes `saved_v1_sample_guard`). The two triggers act on separate columns and fire in name order (`a_work_order_job_guard`, then `saved_v1_sample_guard`). 0109 was not edited.

## Commands run on `c7a8830`

| Command | Exit | Result |
|---|---|---|
| `pnpm turbo run build --filter='./packages/*'` | 0 | 5 of 5 tasks successful |
| `pnpm typecheck` | 0 | 7 of 7 tasks successful |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7 of 7 tasks successful |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | "Lane boundary passed", lane `ent-2`, base `a7d5917`, head `c7a8830`, 54 files |
| `pnpm --filter @jobguard/core test` | 0 | 122 files, 3502 tests passed |
| `pnpm --filter @jobguard/api test` (includes `openapi:check`) | 0 | 32 files, 744 tests passed |
| `pnpm --filter @jobguard/web test` | 0 | 21 files, 448 tests passed |
| `pnpm openapi:check` | 0 | no diff |
| `heavy-slot ent-2` … `vitest run --maxWorkers=1 test/work-order-import.integration.test.ts` | 0 | 1 file, 49 tests passed |
| same, `job-scheduling.integration.test.ts` | 0 | 1 file, 9 tests passed |
| same, `contractor.integration.test.ts` | 0 | 1 file, 19 tests passed |
| same, `job-activation-terms.integration.test.ts` (CH-1's) | 0 | 1 file, 11 tests passed |
| same, `tenancy.integration.test.ts` | 0 | 1 file, 9 tests passed |
| same, `UIWIRE-12.integration.test.ts` | 0 | 1 file, 22 tests passed |
| same, `demo-bootstrap.integration.test.ts` | 0 | 1 file, 4 tests passed |

Each database suite ran alone, in its own `heavy-slot ent-2` slot, one after another. No test was edited, skipped, weakened or given a longer timeout. Synthetic data only. Disk free stayed well above the 45 GB floor (112 GB at the end).

## Not covered

Browser end-to-end suites, the other database suites and the migration upgrade-path suites were not part of this task and were not run. Nothing was pushed.

Builder receipt only — not independently verified, not accepted.
