# READY — fee-store-safety catch-up to main (RED)

Plan piece: fee-store-safety; PR #570. Verified the launcher-completed merge
`bb428c441b65942dcd46c68d129446b863223e6c` with main parent
`46ba084a71976d8154df287bb715b6dfca348a6f`. The index has no unmerged
entries and the initial working tree was clean. No source repair was needed.
All incoming main paths are byte-identical to that main parent. Fee-store source,
tests, migration SQL, note and proof are byte-identical to the pre-merge branch
parent. Both sides' behaviour and every test expectation are preserved.
Migration 0608 remains reserved above main's expected 0607 after #569 lands.
The lane lists exactly all eight paths differing from origin/main outside
config/lanes, and does not list itself. Only this existing receipt was updated.

Local checks executed for this catch-up (installed binaries, no downloads):
- From apps/api: `./node_modules/.bin/vitest run src/fee-collection/postgres-reservation-store.test.ts src/watchdog-registry.test.ts --maxWorkers=2`:
  2 files, 141 tests passed.
- From packages/db: `./node_modules/.bin/vitest run test/migration-proof-loader.test.ts test/late-source-import-migration.test.ts --maxWorkers=2`:
  2 files, 79 tests passed. These are deterministic source/proof checks, not
  real-PostgreSQL integration evidence.
- From root: `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit`
  and `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`: passed.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`: passed
  against the committed merge. Read-only byte comparisons, exact lane equality,
  absence of unmerged index entries and `git diff --check`: passed.

No git writes, PostgreSQL, browser suite, provider calls or live activation ran.
The router commits this receipt and pushes PR #570; green required CI against
current main and independent RED review of the final exact head remain required.
UNKNOWN-RESULT-AUTHORITY remains a hold on route/rail activation. The dark store
is not claimed production-ready. The earlier receipts below remain historical;
this section supersedes their catch-up status and outstanding merge instructions.

## Previous catch-up receipt

# FEE-STORE-UPDATE-GRANT — READY for router commit and PR (RED)

Plan piece: fee-store-safety. Exact-union catch-up with batch-25 at
`36acf72daddbaa68f09a84c67a8a22842a72928d`. Both conflict resolutions retain all
exports/table keys from both sides and now match main. No new runtime behaviour.
Migration SQL renamed from `1060_fee_reservation_book_guard.sql` to
`0608_fee_reservation_book_guard.sql` without changing any SQL bytes. The note,
proof and upgrade lookup use the reserved stem. Main's corrected PostgreSQL roles
string is retained in every predecessor proof and in 0608's exact before value;
no proof entry or assertion was removed. The raw runtime SQL attack is retained.
The lane lists exactly the eight changed files outside config/lanes and excludes
itself. The historical evidence below is retained; this section supersedes its
old draft status and migration-not-implemented statement.

Local checks (installed repository binaries, no downloads):
- API: `./node_modules/.bin/vitest run src/fee-collection/postgres-reservation-store.test.ts src/watchdog-registry.test.ts --maxWorkers=2`:
  adapter 15 passed; watchdog initially failed on stale built core exports.
  Rebuilt core with `./node_modules/.bin/tsc -p packages/core/tsconfig.json`;
  targeted watchdog rerun with `--maxWorkers=2`: 126 passed.
- DB: `./node_modules/.bin/vitest run test/migration-proof-loader.test.ts --maxWorkers=2`:
  initially found the predecessor roles representation mismatch; after exact
  alignment with main, 76 passed. No tests or proof checks weakened.
- Root: `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` and
  `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`: passed.
- Read-only byte/content checks: SQL unchanged; both adapter files unchanged;
  attack tests retain main's added termsHash fixture binding; upgrade test lookup
  changed only its stem; every main migration proof unchanged. Lane equality and
  `git diff --check` passed.

Router must stage the resolved files, complete the existing merge, commit, push
and open the PR, then obtain committed-range lane verification, green required
CI and exact-head independent RED review. No git writes ran. PostgreSQL and
browser suites were not run in this sandbox; they remain CI gates.
UNKNOWN-RESULT-AUTHORITY remains a hold on route/rail activation: generic caller
result reporting is not authenticated provider-result evidence. The store stays
dark; this catch-up does not resolve or weaken that existing hold. No live money,
provider calls, customer data or release.

## Historical diagnostic receipt (superseded draft status)

# FEE-STORE-UPDATE-GRANT — NOT READY (RED)

Test-first diagnostic only. No grant repair, migration 1060 or proof has been issued. Do not commit, push or open a PR for this draft as a finished repair. No scanner, pin, fingerprinted-table column, provider or function setting was changed.

## Evidence

- Added the independent reviewer's exact raw SQL attack to `packages/db/test/fee-reservation.integration.test.ts`: after a fake provider accepts and crashes, runtime attempts to replace `attempts` with `[]`. The required expectation is SQLSTATE 42501, unchanged book, refused second rail reservation and harmless original-command replay. PostgreSQL execution is unavailable here; this is a source-added regression, not an observed database failure.
- Added an adapter regression for the alternate route: a store callback changes `outcome_unknown` to `released`. Ran the repository's installed Vitest runner on `src/fee-collection/postgres-reservation-store.test.ts`, `--maxWorkers=1`: 13 passed, the new regression failed because the promise resolved instead of rejecting. Thus merely hiding raw UPDATE behind an unrestricted JSON replacement routine does not close the attack.
- `node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit`: PASS.
- `node_modules/.bin/tsc -p packages/db/tsconfig.json`: PASS. Core, storage and config builds also passed to supply the existing package export targets required by Vitest.
- Installed Vitest runner on `test/migration-proof-loader.test.ts`, `--maxWorkers=1`: 76 passed. No new migration proof was added.
- Initial pnpm invocations stalled before executing their commands and were interrupted; they are not test passes. Used the installed project compiler and Vitest binaries without downloading packages. Initial Vitest collection failed on missing built package exports; built those dependencies and reran successfully to the intended failing regression.
- Exact-union merge conflict resolution in the working files: retain both PayNowAttemptApplication and PracticeBankApplication exports; retain all keys from both later-empty-tables predecessors. The read-only git index still records unmerged entries; only the router can stage and finish the merge.

## Named holds for landing

1. **UNKNOWN-RESULT-AUTHORITY**: `DarkFeeCollectionExecutor.execute` commits `outcome_unknown` before calling `rail.submit`, then its next store callback replaces that state with `provider_accepted` or `released` for a definite result. The same generic callback/JSON write interface accepts an invented release (observed failing regression above). A strict routine that rejects all overwrites breaks the existing successful/definite-failure executor tests. A routine accepting an unverified result argument or caller-appended audit event retains the alternate attack. The implementation needs a reviewed, authenticated provider-result/reconciliation path distinct from general book replacement. No new provider-result authority has been invented in this draft. This is an engineering design hold, not a request for Ben to approve routine repair work.
2. **1060-NOT-IMPLEMENTED**: reserve 1060 for the actual safe forward repair; add its exact named LP-0 grant changes and upgrade proof then, with policy roles as the string `{jobguard_runtime}`. The archive already lacks raw UPDATE and DELETE grants. Its append-only replay/compaction behaviour must stay intact. No scanner or pin change has been made or identified as necessary by an executed new-migration check.
3. **CI-AND-REVIEW**: run the new runtime SQL attack plus existing reservation, archive populated upgrade, privilege, tenancy, migration replay and full required migration/database checks against real PostgreSQL. Prove wrong-tenant and missing-context routine refusal, every unknown-overwrite route, no second reservation, successful authenticated result handling, definite failure, recovery, refunds and replay. Independent RED review must bind the final exact head. Nothing in this draft claims those gates passed.
4. **READ-ONLY-INDEX**: router must stage the exact-union resolutions and finish the existing merge. No git write was attempted here. Lane lint without an explicit base refused a self-comparison. The added lane records every current working-tree path differing from batch-25, excluding config/lanes; the explicit `LANE_BASE_REF=origin/codex/sandbox/batch-25` run also refused inherited batch-23/batch-25 lane files and batch-25 additions still staged relative to HEAD. Those paths do not differ from the batch-25 working-tree base and were not falsely added to the requested lane. Committed-range lane proof remains the router's responsibility after staging the merge.

Initial review LATER / SIMPLICITY: `PostgresReservationStore.transaction` already centralizes persistence. Keep its validation, compaction and audit ordering and replace only that persistence boundary once result authority is defined; do not duplicate executor orchestration in a second storage implementation. This reduces drift between the two fake rails and preserves archive compatibility. This note is non-blocking.
