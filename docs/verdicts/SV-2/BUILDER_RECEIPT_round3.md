# SV-2 builder receipt — round 3 — 8 October 2026

Repair of PR #119 after the first independent Opus review (PR comment 6047219301, verdict REPAIR at
`239e432e57390582ce62d25c43d471d829dded0a`). **Not technically accepted.** This builder does not review or
accept its own work; a fresh independent review of this delta and CI on the new head are still required.
Source inspection, local execution and CI are kept apart below.

## Identity and scope

- Branch/worktree: `codex/sandbox/sv-2`, the issued `sv-2` worktree. Started at `239e432e57390582ce62d25c43d471d829dded0a`
  with an empty `git status --porcelain`. One local commit; nothing pushed, merged or opened as a PR.
- `origin/main` observed at `0264158` (CH-3a merged, migration 0095). **Main was not merged here**; the integrator will.
  Migration list counts (47) and the `0094…0100` ranges in the UIWIRE-12 and demo-bootstrap tests are unchanged and
  will need the integrator's re-count after the merge.
- Migration stays `0100_shadow_persistence.sql` (unmerged; edited in place). No merged migration (0000–0094) was touched.
- Synthetic data only. No live providers, spending, real sends, production mode or decision approvals.
- Binding answers from `SV-2-issued.txt` are unchanged: Ben's **“split the test”** for DW3 (empty half only; SV-4 owes the
  positive locked-job half), the `source_signal_id` existence-probe barrier, the card-to-merged command names
  (`LogExtra→LogBuilderExtra→builder_logged`, `AddFinalReviewExtra→final_review`, `ConfirmCatch→ConfirmJobGuardCatch→jobguard_catch`),
  no lock table, withdrawal as a fact only. The round-1 sentence in `BUILDER_RECEIPT.md` that bootstrap "removes"
  PostgreSQL 16's creator membership is **superseded and was false** (see 1e); that file is left as written.

## Environment

macOS (Darwin 25.4.0), Node v24.17.0, pnpm 10.28.1, embedded PostgreSQL 16.10 (`embedded-postgres` 16.10.0-beta.15), Vitest 4.1.11.
`/` had 61 GiB free before work. `pnpm install` was **not** run (`node_modules` present). The embedded PostgreSQL binaries
could not start because pnpm had skipped their dylib symlinks (`dyld: Library not loaded …libicudata.68.dylib`); I created the
17 symlinks named in the package's own `native/pg-symlinks.json`, inside the worktree's gitignored `node_modules` only.
PostgreSQL then initialised and started normally, so **every database result below was observed, not assumed.**

## What changed (files)

`config/agent-lane-assignments.json` (one `sv-2` line: one path added), `docs/contracts/shadow-persistence-v1.md`,
`packages/db/MIGRATIONS.md`, `packages/db/migrations/0100_shadow_persistence.sql`, `packages/db/src/demo-bootstrap.ts`,
`packages/db/src/variation-repository.ts`, and five tests: `demo-bootstrap`, `shadow-catalog`, `shadow-persistence`,
`shared-money-origin` (granted amendment), `small-builder-origin`; plus this receipt.

## Item by item

| # | Finding | What I did | Evidence |
| --- | --- | --- | --- |
| 1a | Logins named no database | The `pool()` helper in all three SV-2 test files now passes `database: "postgres"` (`port` hoisted to module scope). | All three suites now connect and pass. |
| 1b | Sequence check ran on a TOAST table | The `relkind='S'` filter now guards the call with `CASE WHEN c.relkind='S' THEN has_sequence_privilege(…) ELSE false END` (a plain `AND` does not fix evaluation order). | `shadow-catalog` passes. |
| 1c | `name[]` returned as a string | Grantee `ARRAY(…)` cast `::text[]`. | `shadow-catalog` passes. |
| 1d | Upgrade pool dropped the password | `new Pool({host,port,user:"postgres",password:"synthetic",database})`, no spread of `admin.options`. | Upgrade test passes. |
| 1e | PostgreSQL 16 creator membership | See below. | See below. |
| 1f | Merged SH-1 catch row | See below. | See below. |
| 2 | `FOR UPDATE OF j` on `app.job` as runtime | Row lock **removed** (see "Deviation" below). | Red then green, below. |
| 3 | Default No charge practice jobs refused | Predicate now `t.environment IN ('synthetic_demo','pilot_no_charge')`. | Red then green, below. |
| 4 | Older SECURITY DEFINER routines open to PUBLIC | 0100 revokes PUBLIC EXECUTE on the four; catalog test added. | Red then green, below. |
| 5 | Predecessor assumed to be "all but last" | Selected by name: everything before `0100_shadow_persistence.sql`, with `expect(index).toBeGreaterThan(0)`. | Upgrade test passes. |
| 6 | Whole tree | Typecheck, build, openapi check, lint, all unit and database tests green. | Commands table. |

### 1e — PostgreSQL 16 creator membership (made truthful, not removed)

I probed a real PostgreSQL 16.10 cluster. A CREATEROLE non-superuser (the Neon-style bootstrap owner) that creates a role
gets one `pg_auth_members` row per role: `admin_option=true, inherit_option=false, set_option=false`, grantor = the bootstrap
superuser. The owner's `REVOKE role FROM owner` and `REVOKE ADMIN OPTION FOR …` both succeed silently and change nothing (no grant of
its own to find), and `REVOKE … GRANTED BY postgres` is refused (`42501 permission denied to revoke privileges granted by role
"postgres"`). **It cannot be removed by the owner**, so I documented and tested that it remains.

- `demo-bootstrap.ts`: the no-op `REVOKE` loop is gone. Bootstrap now **fails closed** unless every holder of either shadow role is
  exactly the bootstrap owner with `admin_option` true and `inherit_option`/`set_option` false.
- `0100`: the support-route check is now `pg_has_role(session_user,'jobguard_shadow_emergency_access','USAGE')` (was `MEMBER`),
  so the leftover membership cannot satisfy it. A real holder must be granted the role with INHERIT.
- `demo-bootstrap.integration.test.ts`: replaces the old `rows toEqual([])` (which could never hold) with the exact shape (member
  `neondb_owner`, grantor `postgres`, `true/false/false`, both roles), asserts `USAGE` and `SET` are false for that owner, and
  adds a fail-closed case: a second holder makes bootstrap throw; revoking it restores the exact shape. Runs inside the existing
  60 s test; no timeout was added or lengthened.
- `shadow-persistence.integration.test.ts`: a real login that inherits `jobguard_shadow` (so it may execute the routine) and holds the
  emergency role only as ADMIN-only is refused the support route with `42501 separate support permission required`, creates no
  disclosure row and leaves the signal undisclosed; the same login can still disclose through a non-support route. The test also
  shows `pg_has_role … MEMBER` is true for it while `USAGE` and `SET` are false, which is why `MEMBER` was wrong.
- Contract and `MIGRATIONS.md` text corrected. One residual fact is stated plainly there: the owner's ADMIN OPTION would still let it
  grant the role to a login, so "who may hold the emergency role outside synthetic mode" stays a G1 gate.

### 1f — the single granted amendment (`shared-money-origin.integration.test.ts`)

Lane line `sv-2` gains exactly `packages/db/test/shared-money-origin.integration.test.ts` (one compact line, name-sorted position
unchanged, no other line touched). In that file I changed **only** the `["small_builder","jobguard_catch","ConfirmJobGuardCatch"]` row of
the command-map test: it was removed from the 7-row table and replaced, after the loop, by stricter assertions:

1. runtime is refused for a real signal id, a missing id and no id, with **one identical** `{code, message, detail, constraint}`
   (`42501`, `shadow origin unavailable through runtime`);
2. a privileged insert as `jobguard_migration` (via `SET LOCAL ROLE`) tied to a real `shadow_commercial_signal` on the same job succeeds, and the
   stored row is `{kind:"jobguard_catch", command_id, provenance:"command", source_signal_id:<signal>}`;
3. the same privileged path refuses `jobguard_catch` with a `LogBuilderExtra` receipt and with no signal (`23514`), which proves the
   `ConfirmJobGuardCatch → jobguard_catch` mapping rather than just the happy path.

The other six rows and every other assertion in the file are untouched. The original row fails against the current schema
(`error: shadow origin unavailable through runtime`), observed.

### 2 — runtime row lock: deviation from the order's example

The order suggested `FOR SHARE OF j`. **That also fails.** On a real PostgreSQL 16.10 migrated schema, a login holding
`jobguard_runtime` got `42501 permission denied for table job` for `FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE` **and**
`FOR KEY SHARE`; the plain `SELECT` works. PostgreSQL requires UPDATE privilege for every row-lock strength and runtime has none on
`app.job` (and must not be given any). So the lock is dropped entirely, which is the reviewer's first option.

What still guarantees exactly-once: the `command_receipt` claim (its unique keys make a concurrent twin wait for the first
transaction, then replay or conflict), the variation primary key and the one-origin-per-variation key. Compared with `main`, this path
checks **more** than before, not less: main's propose path did not check the job at all. The variation insert's foreign keys take
KEY SHARE locks on the job's track and scope rows.

Regression (`small-builder-origin`): asserts runtime has no UPDATE on `app.job`, that all four lock strengths are refused with `42501`
(so nobody reintroduces a lock with a different strength), then proves a runtime capture succeeds and that two concurrent captures of
different variations on one job both commit with three `builder_logged` origins.

### 3 — practice environments

The job track column's CHECK admits exactly `synthetic_demo` and `pilot_no_charge` (0053); the app's default "No charge" scenario is
`pilot_no_charge`. The query now allows both and nothing else, so any future or production-like value is refused by default. Regressions:
the column rejects `production_billing` (`23514`); a repository capture on a live `pilot_no_charge` small-builder job succeeds and
replays; a non-live job is still `FORBIDDEN`; and the real `VariationApplication` propose action works on a session-owned
`pilot_no_charge` practice job (price, replay, origin row).

### 4 — older routines

`0100` now runs `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC` for `advance_final_account_draft(uuid,uuid,uuid,integer)`,
`invalidate_stale_final_account_authorizations(uuid,uuid,char(64))`, `reserve_customer_invoice_number(uuid)` and
`issue_practice_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,date)`. **Main's grants checked first:** each has an explicit
`GRANT EXECUTE … TO jobguard_runtime` in 0016/0017/0027 and nothing else; main's 0095 only `CREATE OR REPLACE`s one of them with the
same signature (ACL preserved), so the revoke is order-independent. Runtime's grants are untouched. New catalog test
(`shadow-catalog`): the four have grantees exactly `{jobguard_migration, jobguard_runtime}` and runtime can still execute them; for each
new role the non-trigger routines in `app` it can execute are exactly its SV-2 grants (plus two documented pure, non-SECURITY-DEFINER
arithmetic helpers `half_even_ratio` and `reference_recovery_cap` that keep default PUBLIC EXECUTE, asserted `prosecdef=false`);
real logins of both roles are refused (`42501`) on all four older routines; and every trigger function they can execute is inert when
called directly (`0A000` or `42501`).

## Two further defects found only because the suites can now run

These were hidden behind the connection failure and are fixes to round-2 fixtures, not weakened assertions:

1. The existing application propose test (and my pilot twin) ran `UPDATE app.job SET accepted_net_value_pence, recovery_cap_pence`, which
   `job_baseline_shape` always refuses. The fixture now sets the full imported-baseline columns together (`provenance='imported'`,
   `fee_policy_version='reference_fee_policy_v1'`); the assertions are unchanged.
2. In `shadow-persistence` "qualifies every shadow link", the superuser fixture's classification row reused a signal already
   classified in that run, so the `(tenant, run, signal)` unique key raised `23505` before the foreign key could raise `23503`. It now uses
   a still-unclassified signal, so the assertion tests the foreign key it was written for. Same `23503` expectation.

## Evidence

Failed first (old code or old migration with the new tests, observed):

| Check | Against | Result |
| --- | --- | --- |
| Runtime capture, lock regression, application propose paths | `variation-repository.ts` as at `239e432` | 6 of 10 `small-builder-origin` tests fail with `permission denied for table job` |
| No Charge repository and application cases | lock removed, `environment='synthetic_demo'` kept | the 2 pilot tests fail with `FORBIDDEN`, the other 8 pass |
| Routine-grants catalog test and ADMIN-only support refusal | `0100` as at `239e432` | both fail (the grantee lists differ; the call resolved instead of being refused) |
| Original catch row | current schema | `shared-money-origin` command-map test fails with `shadow origin unavailable through runtime` |

Passing on the repaired tree (each command run in the worktree, exit code observed):

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/shadow-catalog…` | 0 | 6 tests |
| same, `shadow-persistence` + `small-builder-origin` | 0 | 8 + 10 tests |
| same, `shared-money-origin` `variation` `final-account` `demo-bootstrap` `tenancy` `UIWIRE-12` | 0 | 6 files, 49 tests |
| `pnpm typecheck` | 0 | 7 of 7 tasks |
| `pnpm test` (tools + all packages; includes `openapi:check` inside the API task) | 0 | tools 42; config 2; storage 4; core 2842; ai 72; api 347; web 100; **db 46 files, 257 tests on real PostgreSQL 16** |
| `pnpm build` | 0 | 7 of 7 tasks |
| `pnpm openapi:check` | 0 | up to date |

## Not run, and why

- `pnpm test:e2e` and the Playwright browser suites (`variations.spec.ts`, `m1-15-complete-journey.spec.ts`, …): not run locally;
  CI runs them after the dispatcher pushes. The two defects the review said would break them (findings 2 and 3) are covered at
  the real-PostgreSQL application level above, not at browser level.
- Main's `0095` merge and the resulting migration count/range updates: the integrator's job.

## For the integrator and later leaves

- **Review point P2-6 (the §12.2 ledger line)** is still integrator work; `BUILD_PLAN.md` is unchanged.
- **P3-7:** merge plan PR #118 before or with SV-2.
- **P3-8 (SV-4):** the reveal and disclosure routines query `app.final_account_lock` as `jobguard_migration` under FORCE RLS, so SV-4's lock table
  needs a tenant policy that includes `jobguard_migration`, and SV-4's positive tests must land with the table.
- **New for SV-4:** runtime captures no longer lock the job row, so if SV-4's lock creation must exclude an in-flight capture, it should
  take `FOR UPDATE` on the job's `app.job_commercial_track` row as well as the job row (captures take KEY SHARE on it through the variation foreign key).
- **P3-9 (not changed):** `jobguard_shadow` still has SELECT on `shadow_break_glass_access`; nothing in SV-2 needs it. It was outside this round's six items, so I left it. A one-line follow-up if you want it removed.
- **P3-10:** `shadow_reconciliation_run.status` allows only completed/failed; SV-5 will need an expand migration for pending runs.
- **Discovered later (Q3, restated):** there is still no builder-facing Withdraw action; `recordWithdrawal` is a repository seam only.
- **DW3:** positive half (a locked job returns only its own `revealed` rows) is owed by SV-4 under Ben's "split the test" decision. SV-2 proves the empty half with real revealed rows present, plus exact EXECUTE grantees.
- **Gates still open:** D12, D13, G1 (who may hold the emergency role outside synthetic mode, including the bootstrap owner's ADMIN OPTION), G4-S.

## TL;DR

Every CI failure in the review is fixed and now passes against real PostgreSQL 16 on this Mac (db 257 tests, plus typecheck, build, openapi and all other unit suites). The two real bugs are fixed too: the runtime lock is gone (PostgreSQL refuses *every* lock strength for that role, so the suggested `FOR SHARE` would have failed as well) and the default No charge practice jobs can log extras again. The shadow roles can no longer run the four older SECURITY DEFINER routines.

Status: prepared, tested locally (database suites observed passing), committed locally. Not reviewed, not accepted, not pushed, not deployed. Browser suites unverified locally.

Next action: dispatcher pushes `codex/sandbox/sv-2`; CI runs; fresh Opus reviews the delta from `239e432`.
