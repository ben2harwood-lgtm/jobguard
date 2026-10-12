# SV-2 builder receipt — catch-up onto main `530681c` and renumber 0100 → 0118 — 11 October 2026

**Builder receipt only — not independently verified, not accepted.** This builder does not review or accept its own work. PR #119 was reviewed
and accepted at an earlier head; this delta (merge, renumber, ledger line, two test-fixture repairs) needs CI on the new head and a fresh
independent review of the delta.

## Identity

- Branch/worktree: `codex/sandbox/sv-2`, `.worktrees/sv-2`. Started at `99c33ea31620f4ce37ad30bfc53131202ed5220f` (= `origin/codex/sandbox/sv-2`,
  clean tree). Merged `origin/main` at `530681c030a2333ec8f27f4d1a2cf4803a833465`.
- SV-2's own change before the catch-up: 23 files, +2054 / −3 against merge-base `df1f9c1`. After the merge, renumber and repairs the diff against main touches those 23 files plus `BUILD_PLAN.md`
  (ledger line) and this receipt: 25 files, as `pnpm lint:lanes` lists them.
- Commits: `58c10c0` merge; `2fd903f` renumber and ledger record; the test-repair commit (below) which also carries this receipt.

## Conflicted files and resolutions (both sides kept)

| File | Resolution |
|---|---|
| `packages/db/src/migrate.ts` | Main's registrations 0102–0112 kept exactly; SV-2's registration re-applied (merge commit: still `0100`, numeric position; renumber commit: moved to `0118` after `0112`, registry strictly increasing). |
| `packages/db/src/index.ts` | Main's twelve new `export *` lines kept; SV-2's `export * from "./shadow-repository.js"` appended. |
| `packages/db/MIGRATIONS.md` | Main's sections kept unchanged; SV-2's section kept and, in the renumber commit, moved after `0112` and retitled `0118`, with one sentence that it was renumbered from 0100 to 0118 on 11 October under the merge-ahead ruling. Against main this file has additions only. |

`config/agent-lane-assignments.json` and `BUILD_PLAN.md` auto-merged; `config/agent-lane-assignments.json` was re-checked as valid JSON with every main
line intact and SV-2's own line the only addition. `apps/api/openapi.json` needed no change (`pnpm openapi:check` passes). No hunk needed a behaviour judgment.

## Renumber

`packages/db/migrations/0100_shadow_persistence.sql` → `packages/db/migrations/0118_shadow_persistence.sql` (`git mv`; 0 insertions, 0 deletions — SQL bytes unchanged).
0118 is the next number neither merged (through 0112) nor reserved (0113 CH-7, 0114 ENT-10a, 0115 M4-6-S-R1, 0116 ENT-10b, 0117 ENT-4b).

Files whose only change is the filename or number swap: `config/agent-lane-assignments.json` (SV-2's own line, path), `packages/db/test/shadow-persistence.integration.test.ts`,
`packages/db/test/shadow-catalog.integration.test.ts` (also two comments), `packages/db/test/small-builder-origin.integration.test.ts` (filename on two lines and four comments),
`docs/contracts/shadow-persistence-v1.md` (filename and two "0100" mentions). Earlier receipts under `docs/verdicts/SV-2/` were left as historical records and still say 0100.
`BUILD_PLAN.md` §12.2 gained one "Ledger amendment — SV-2, 11 October 2026" paragraph before `### 12.3 The graph`; SV-2's lane line already allowed `BUILD_PLAN.md`.
No test asserted that a migration "is the last", so no order assertion was rewritten for that reason.

## Test repairs after the catch-up

Three tests in `packages/db/test/small-builder-origin.integration.test.ts` (a file this PR adds; it does not exist on main) failed after the merge. Only set-up lines
and one catalogue check in that file changed; no product code, migration or other test file was touched. Every statement under test and every other `expect(...)` is byte-identical.

**Why they failed.** (a) Main's `0110_work_orders.sql` (ENT-2, line 177) now raises `job provenance is immutable` for any `UPDATE app.job SET provenance=...`; two fixtures changed provenance to
`imported` by UPDATE. (b) With SV-2 now registered after `0106_practice_feed.sql`, the upgrade test's predecessor schema includes 0106's `guard_practice_feed`, so the SBOX routine count
went from 5 to 6.

**Fix 1 — fixture, "the existing application propose action issues LogBuilderExtra, with price, and replays" (lines 86–91).**
Before:
```
  // SBOX's issuance routine creates the live home job with immutable ownership.
  const job=(await admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND status='live'",[DEMO_TENANT_ID,auth.digest])).rows[0].id as string,scope=randomUUID();
  // job_baseline_shape needs the full imported-baseline columns together; a lone pair of values is refused.
  await admin.query("UPDATE app.job SET provenance='imported',accepted_net_value_pence=10000,fee_policy_version='reference_fee_policy_v1',recovery_cap_pence=150 WHERE tenant_id=$1 AND id=$2",[DEMO_TENANT_ID,job]);
```
After:
```
  // 0110 makes job provenance immutable, so the imported job is created imported rather than updated from SBOX's
  // issuance-routine home job: same practice session and scenario, live, with the full imported baseline columns together
  // (job_baseline_shape refuses a lone pair of values).
  const job=randomUUID(),scope=randomUUID();
  await admin.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence) SELECT $3,tenant_id,title,'live',practice_session_digest,practice_scenario,'imported',10000,'reference_fee_policy_v1',150 FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND status='live'",[DEMO_TENANT_ID,auth.digest,job]);
  // The legacy live-job trigger binds the small-builder track only for non-imported live inserts, so bind the same track it bound for the home job.
  await admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance,source_id) VALUES($1,$2,'small_builder','synthetic_demo','legacy_synthetic_live_fixture',$2)",[DEMO_TENANT_ID,job]);
```
The job reaches the same end state the test needs (live, imported, same session and scenario, full baseline columns, `small_builder`/`synthetic_demo` track as the 0053 trigger gave it) without any
provenance UPDATE. It is a second job in the same practice session; the issuance routine's own home job is unchanged. Nothing the test asserts was altered.

**Fix 2 — fixture, "works on a No charge (pilot_no_charge) practice job" (lines 152–156).**
Before (inside `asTenant`):
```
    await db.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional No charge practice job','draft',$3,'capture')",[job,DEMO_TENANT_ID,auth.digest]);
    await db.query("INSERT INTO app.job_commercial_track(...)  -- unchanged
    await db.query("UPDATE app.job SET status='live',provenance='imported',accepted_net_value_pence=10000,fee_policy_version='reference_fee_policy_v1',recovery_cap_pence=150 WHERE tenant_id=$1 AND id=$2",[DEMO_TENANT_ID,job]);
```
After:
```
    // 0110 makes job provenance immutable: the job is created imported (with its full baseline columns) rather than updated afterwards.
    await db.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence) VALUES($1,$2,'Fictional No charge practice job','live',$3,'capture','imported',10000,'reference_fee_policy_v1',150)",[job,DEMO_TENANT_ID,auth.digest]);
    await db.query("INSERT INTO app.job_commercial_track(...)  -- unchanged
```
Same end state (live, imported, baseline columns, `pilot_no_charge` track); the UPDATE that is now forbidden is folded into the INSERT.

**Fix 3 — predecessor routine check, "upgrades seeded SH-1 backfill..." (line 234).**
Before: `expect(sboxBefore.routines).toHaveLength(5);`
After:
```
   // The exact SBOX routines on the predecessor, by name: the five SBOX-SESSION-1 routines plus 0106's guard_practice_feed, which now precedes 0118.
   expect(sboxBefore.routines.map(row=>row.proname).sort()).toEqual(["authenticate_practice_session","guard_practice_feed","guard_practice_material_owner","guard_practice_material_requirement","guard_practice_owner","issue_practice_session"]);
```
Why not weaker: a bare count of 5 became an exact list of the six routine names, which fails on a missing, extra or renamed routine as well as a wrong count. The line that follows,
`expect(await sboxCatalog()).toEqual(sboxBefore)` (SV-2's migration leaves every SBOX policy, grant, binding, trigger and routine definition unchanged), is untouched. Nothing was deleted, skipped or turned into `>=`, and no timeout was changed.

## Commands and results (all in `.worktrees/sv-2`, PATH with `~/Library/pnpm/bin`, heavy runs inside `~/.local/bin/heavy-slot sv-2`)

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | done |
| `pnpm typecheck` | 0 | 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7/7 tasks (first run failed only because the rename was not yet committed) |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | passed, 25 files including this receipt |
| `pnpm turbo run build --filter=@jobguard/db...` and `--filter=@jobguard/api...` | 0, 0 | 3/3 and 6/6 tasks (stale `dist` of `@jobguard/core` and `@jobguard/config` rebuilt; not committed) |
| `pnpm openapi:check` | 0 | after the builds (it failed first on stale `dist`, an environment fault) |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1` on `shadow-persistence`, `shadow-catalog`, `small-builder-origin`, `shared-money-origin` | 1 before the repairs (3 failed / 33 passed of 36), **0 after: 4 files, 36/36 passed** | embedded PostgreSQL 16 started without any environment fix |
| `pnpm test:migrations` (`tenancy`, `demo-bootstrap`) | 0 | 2 files, 13/13 passed |
| `pnpm --filter @jobguard/api exec vitest run src/variation/variation.application.test.ts` | 0 | 1 file, 5/5 passed |

## Not run

The full unit suite, the browser (Playwright) suites and GitHub CI were not run here. Nothing under `.pnpm-store`, `node_modules`, build output or test results is committed.
Builder receipt only — not independently verified, not accepted.
