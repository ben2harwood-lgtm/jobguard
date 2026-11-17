# M0-6L round 10 — record (main-merge, renumber 0108 → 0111, scanner approval of ENT-2's four files)

Compiled by the JobGuard integrator (Claude week, Claude Opus 5.5) on 9 Oct 2026 from the round-10 Claude Sonnet builder's report and the coordinator's scanner commit. This is a record, not a verdict or an acceptance.

## Commits
- `47d131e` (Sonnet builder) — merge of origin/main fd81315 (CH-1 #123 0109, ENT-2 #125 0110, TENANT-ADAPTER-1 #126). Conflicts resolved keeping both sides: `apps/api/src/app.module.ts` (main's controllers incl. WorkOrderController/SchedulingController + IdentityController, global APP_GUARD ApplicationAuthGuard, IDENTITY_APPLICATION, both APP_FILTERs), `packages/db/src/migrate.ts` (…0109, 0110, then 0111), `packages/db/MIGRATIONS.md` (main's 0109/0110 sections, then identity), `BUILD_PLAN.md` (main's CH-1/ENT-2 ledger lines, then M0-6L's). Note: this merge commit already lists `0111_persisted_identity.sql` in migrate.ts while the file is renamed only in 8176a2e (bisect-only inconsistency; final tree consistent).
- `d9bd868` (Sonnet builder) — lane path swap 0108 → 0111 on the m0-6l line only (standing yes for renumber lane swaps).
- `8176a2e` (Sonnet builder) — `git mv` 0108 → 0111, SHA-256 `9779d3f643b248b025b0951c204c6cf51d6a936e531e883e783d9e17b85a59e0` before and after; identity test looks up 0111 by name, asserts it follows `0110_work_orders.sql`, keeps strictly increasing names, `slice(0, identityIndex)`, identity.challenge absent/present, `MIGRATION_URLS.length` and full applied-list equality; MIGRATIONS.md section → 0111.
- `aca197b` (integrator) — §12.2 ledger line for the second renumber.
- `0c375f6` (coordinator session, on Ben's typed answer "Approve the four ENT-2 files", card `jobguard-m06l-scanner-ent2-files-2026-10-09`) — `apps/api/src/auth/context-boundary.test.ts` only (+13/−3): ENT-2's `work-order-repository.ts`, `sor-repository.ts`, `job-scheduling-repository.ts`, `work-order-fixtures.ts` added to the approved membership bridges, hash-locked to their bytes at main fd81315, with exact call counts 4/2/2/3 in an explicit map (the old ternary would have given 3 to every new file).
- A stash `stash@{0}` holds 45 abandoned scanner-approval test lines from the earlier, refused approach (coordinator ruling "Option A"); kept, never applied.

## Object check (builder)
0111 shares no object with 0107, 0109 or 0110: 0111 touches app.account and app.membership (new UNIQUE constraint and two provision policies), the identity schema and the jobguard_identity role; 0109/0110 only reference app.membership through foreign keys or read it in function bodies.

## Checks
- Before the scanner commit (aca197b): `pnpm --filter @jobguard/api exec vitest run src/auth` → 165 passed, 2 failed (the whole-repository scan and the approved-list coverage test, both on ENT-2's 11 sites). After 0c375f6: 167/167 (coordinator). `git diff --check` clean.
- `lint:lanes` passes at aca197b (integrator).
- Not run locally in this round: typecheck, lint, the full unit suites, openapi:check and the DB/browser suites — GitHub CI on the pushed head is the evidence for those.

Not independently verified and not accepted by this record.
