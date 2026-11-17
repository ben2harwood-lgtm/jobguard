# Builder receipt — main merge into codex/sandbox/m4-6-s

Builder receipt only — not independently verified, not accepted.

Merge commit cd55a84 merges origin/main 74ef849 (M0-6L #104, MIG-ORDER-1 #128) into base 544a9a6. Nothing pushed.

## Conflict resolutions (both sides kept)
- BUILD_PLAN.md: main's two M0-6L ledger amendments, then M4-6-S's; wording unchanged.
- apps/api/src/app.module.ts: main's full @Module (IdentityController, IDENTITY_APPLICATION, global APP_GUARD ApplicationAuthGuard, both APP_FILTERs) plus RecoveryFollowUpController prepended.
- packages/db/MIGRATIONS.md: 0111 section, then 0112 section.
- packages/db/src/migrate.ts: ...0110_work_orders, 0111_persisted_identity, 0112_recovery_follow_up.
- Auto-merged cleanly: apps/api/openapi.json, packages/db/src/index.ts, config/agent-lane-assignments.json.

## Scanner and guard
- `apps/api/src/auth/**` unedited; boundary scanner suite passed (3 files, 167 tests). It did not flag M4-6-S code.
- M4-6-S routes work behind the global guard: API unit tests and M4-6-S e2e pass.

## Commands
| Command | Exit | Counts |
|---|---|---|
| turbo build packages/* | 0 | - |
| pnpm typecheck | 0 | - |
| LANE_BASE_REF=origin/main pnpm lint | 0 | - |
| LANE_BASE_REF=origin/main pnpm lint:lanes | 0 | - |
| pnpm openapi:check | 0 | - |
| api vitest src/auth | 0 | 3 files / 167 tests |
| core test | 0 | 124 files / 3542 tests |
| api test (incl. openapi:check) | 0 | 36 files / 945 tests |
| web test | 0 | 21 files / 448 tests |
| db recovery-follow-up.integration | 0 | 45 |
| db identity.integration | 0 | 11 |
| db recovery-messages.integration | 0 | 98 |
| db work-order-import.integration | 0 | 49 |
| db tenancy.integration | 0 | 9 |
| e2e M4-6-S mobile-360 / desktop (CI=1) | 0 / 0 | 2 / 2 |
| e2e M4-5-S mobile-360 / desktop (CI=1) | 0 / 0 | 7 / 7 |

DB and e2e ran one at a time under heavy-slot. E2E used the uncommitted, untracked local Playwright config (installed headless shell). No tests, timeouts or checks changed.
