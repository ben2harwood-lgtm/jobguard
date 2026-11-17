VERDICT: PASS — bound to head fe76e7f0f0beb185effd0f45835cce7b1e579cd7
Reviewer: independent Claude Opus 5.5, routine cloud session (inbox row 90, assigned by C). I did not build, repair or order any commit in this PR. `git log origin/main..fe76e7f` has no commit carrying this session's trailer.

**Scope.** This covers round 3 (`37f0e9d`), the integrator's main merge (`377c884`, main `df1f9c1`), and round 4 (`fe76e7f`, tests only). I judged them against the REPAIR at `239e432` (comment 6047219301) and Ben's "split the test" ruling. The DW3 locked-job reveal proof belongs to SV-4 / plan #118, so its absence is not a finding. The head is unchanged since the row was written, and main is still `df1f9c1`, so the PR is up to date with it.

**In short.** Every finding from the last REPAIR that the builder owned is fixed in the code, with tests that prove the fix:
- P1-1a–f: the harness, the PG16 creator membership and the SH-1 catch row;
- P1-2: the runtime row lock;
- P1-3: No-charge practice jobs;
- P2-4: PUBLIC EXECUTE on the four older SECURITY DEFINER routines;
- P2-5: the upgrade predecessor.

The merge kept both sides. Round 4 changes test fixtures only, and every assertion is kept or tightened. CI `checks`, `dependency-review` and `secrets` are green on this exact head (run 37724027692). I found no new P1 or P2.

## Findings

**P1:** none. **P2:** none.

**Before merge (integrator, not a code defect):**
- The §12.2 ledger line (previous P2-6: "SV-2 → 0100, codex/sandbox/sv-2; §12.3's 0061 released") is still missing. `BUILD_PLAN.md` is in the `sv-2` allow list but is not changed by this PR, and main has no SV-2/0100 line.
- Merge order with plan PR #118 (previous P3-7) still applies.

**P3 (carried, non-blocking):**
1. `jobguard_shadow` still has SELECT on `shadow_break_glass_access` (`0100:126` grants SELECT on every shadow table). Nothing in SV-2 needs it; the receipt leaves it as a one-line follow-up.
2. Removing the job row lock leaves the capture's "job is live" check unserialised against a concurrent status change. This is not a regression: main's propose path checked nothing. The receipt's note for SV-4 is right: lock creation should take `FOR UPDATE` on the job's `app.job_commercial_track` row, which captures hold KEY SHARE on through the variation FK.
3. Previous P3-8 and P3-10 still stand for SV-4/SV-5: the reveal and disclosure routines need a tenant policy on `final_account_lock` that includes `jobguard_migration`, and `shadow_reconciliation_run.status` has no pending state.

## What I checked, item by item

| Previous finding | Status at `fe76e7f` | Evidence |
|---|---|---|
| 1a–1d harness | Fixed | `database:"postgres"` in the SV-2 pools; `CASE WHEN relkind='S'` guard; `::text[]`; explicit upgrade-pool password |
| 1e PG16 creator membership | Fixed, and now described truthfully | `demo-bootstrap.ts`: the no-op REVOKE loop is gone, and bootstrap now fails closed unless every holder of both roles is exactly the owner with `admin_option=t, inherit=f, set=f`. `0100:246`: the support route checks `pg_has_role(session_user,…,'USAGE')`, no longer `MEMBER`. Tests assert the exact shape and that an ADMIN-only holder is refused the support route. |
| 1f SH-1 catch row | Fixed via the granted lane amendment | Only the `ConfirmJobGuardCatch` row moved out of the 7-row table. Runtime is refused identically for a real, a missing and a null source (`42501`). A migration-role insert with a real signal stores `jobguard_catch`/`command`/`source_signal_id`; a wrong receipt type or a null source gives `23514`. The other six rows are untouched. The lane adds exactly that one test path. |
| 2 runtime lock on `app.job` | Fixed by removal | `variation-repository.ts:47-53` has no `FOR …` clause. The receipt's claim that every lock strength needs UPDATE matches PostgreSQL's rules. The regression test asserts all four strengths are refused and that concurrent captures both commit. |
| 3 No-charge practice jobs | Fixed | The predicate is `environment IN ('synthetic_demo','pilot_no_charge')`, exactly 0053's CHECK set. There are repository and application regressions on a session-owned `pilot_no_charge` job. |
| 4 older SECURITY DEFINER routines | Fixed | `0100:22` revokes PUBLIC EXECUTE on all four. `shadow-catalog` scans the **whole** `app` schema by catalog (`:79-85`): each new role may execute exactly its SV-2 grants plus two INVOKER pure helpers. This is a catalog check, not a list, so it also covers every SECURITY DEFINER routine main brought in (0054, 0094–0097). It ran green on the merged tree. |
| 5 upgrade predecessor | Fixed | `small-builder-origin:209-211` slices by `findIndex(…0100_shadow_persistence.sql)` with `toBeGreaterThan(0)`. |

**Main merge `377c884`:**
- `migrate.ts` lists `0053, 0054, 0094, 0095, 0096, 0097, 0100` in that order, keeping main's 0095 `deployment_mode` hook.
- `demo-bootstrap.ts` is main's version plus the two SV-2 blocks (role posture, exact creator-membership shape).
- The PR's lane registry change against main is one `sv-2` line.
- My own run of `tools/agent-lane-boundary-lint.mjs` with a simulated pull_request event (base `df1f9c1`, head `fe76e7f`) passed for lane `sv-2`.

**Round 4 `fe76e7f`:** I read the whole diff against `377c884`.
- The three SV-2 database suites now use `--encoding=UTF8` and `installLegacySyntheticPartyFixtures`, which are CH-3a's requirements. Writes to guarded evidence or job rows now run in a transaction with `app.tenant_id` set, which CH-2's live guard requires.
- `variation.application.test` swaps the pinned ownership SQL literal for a prefix match on `practiceOwnedJobsSql()`. It adds stricter checks: two ownership calls on the session digest, the first before the capture and the second after it.
- `demo-bootstrap.integration` uses `MIGRATION_URLS.length` instead of 47, and a trace mock for the two shadow-role posture queries.
- No assertion was removed or weakened. There is no `.skip`, `.only` or conditional skip in any touched suite.

**Database behaviour, read and not run.** I could not run embedded PostgreSQL here. These are checked by reading the code and confirmed only by CI being green on this exact head:
- the probe barrier (`0100:173`), which fires before the FK as a BEFORE trigger;
- the support-route USAGE check;
- the catalog scans;
- no-charge capture;
- the four-strength lock refusal;
- concurrent captures;
- the upgrade path.

The raw job log could not be fetched (proxy 403). So for which suites ran, I relied on the green `checks` conclusion together with there being no skips in the SV-2 suites.

**Not verified by me:** the browser suites and the build beyond CI's green conclusion. I did not reproduce the round-3 receipt's local database counts (db 257).

---
_Generated by [Claude Code](https://claude.ai/code)_
