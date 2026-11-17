# M4-1-S-R — builder receipt, repair 7 (integration with #101 and #102)

Date: 2026-10-04. Builder: **Claude Sonnet 5.5**. **Not independently verified. Not accepted.** No code behaviour was added in this step; it integrates `origin/main` after #101 (M4-3-S-R, migration 0042) and #102 (M4-2-S-R) merged, keeping all three PRs' behaviours. Earlier receipts (repair 1 to 6) stand, including Ben's recorded acceptance (card `jobguard-open-from-jobs-substitute-2026-10-03`, "Accept the substitute") of the C7 Jobs-list substitute and the fictional sample-source labels.

## What was merged and how the conflicts were resolved

- `origin/main` b717020 (#102) merged non-force; six conflicts.
- `apps/api/src/recovery-case.application.ts`: `command` keeps this repair's job-access check and verified-membership reviewer; `eligibility` is #102's (session check, synthetic-demo mode check, owner membership verified under lock). #102's application test file is kept as is; this repair's command tests moved to `recovery-case.command.application.test.ts`.
- `packages/db/src/recovery-case-repository.ts`: `command` keeps the server reviewer, job-bound replay and recorded/catalogue source resolution; `eligibilityCommand` is #102's membership-object version (owner membership checked `FOR SHARE`, reviewer stored as `membership:<id>`) with its replay now also bound to the target job.
- `apps/web/app/ui/recovery-cases.tsx`: this repair's UI (parsed money, error focus, job fee liability, case postings, approved landing, source links and details, #101's recorded-source picker) plus #102's tested eligibility command helpers. The client-asserted reviewer literal stays removed.
- Tests: #102's `recovery-cases.integration.test.ts` is kept (its calls adapted to the server-reviewer `command` signature and to catalogue source labels; assertions unchanged); this repair's workbench tests moved to `recovery-cases.workbench.integration.test.ts` (calls adapted to an owner membership); `recovery.integration.test.ts` seeds an owner membership for its eligibility calls.
- **`M4-2-S.spec.ts` case-fee reconciliation:** the four `case-fee` assertions (£0.00) are unchanged and still pass, because `case-fee` now shows the job fee liability, which is £0.00 where no landing has been approved. I did not weaken them; I **added** an assertion beside each that the fee-basis note reads "No approved qualifying landing yet, so no fee exists", so the wording and the value are checked together.
- Lane registry: main's file plus the `m4-1-s-repair` lane (three files added to its exact list, receipt path updated).
- Migrations: still 0043 after main's 0042; counts unchanged at 44.

## Commands actually run on the merged head

`CI=1`, `LANE_BASE_REF=origin/main`; database and browser commands inside `heavy-slot m41r`. Logs `m41r-logs/r9-*.log`.

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | up to date |
| `pnpm typecheck` | 0 | 7/7 |
| `pnpm lint` | 0 | 7/7; lane `m4-1-s-repair` passes |
| `pnpm lint:lanes` | 0 | passed |
| `pnpm build` | 0 | 7/7 |
| `pnpm openapi:check` | 0 | matches |
| `TURBO_FORCE=true heavy-slot m41r pnpm test` | 0 | 0 of 13 cached: `node --test` 39/39; core 664 (332 unique, also run from `dist`); ai 72; api 111 (16 files); web 68 (9 files); db 206 (39 files); storage 4; config 2 |
| `heavy-slot m41r pnpm test:db` | 0 | 39 files, 206 tests |
| `heavy-slot m41r pnpm test:migrations` | 0 | 2 files, 11 tests (all 44 migrations) |
| full e2e, both projects, all specs, including #101's and #102's (shim outside the repo) | 0 | **166 passed**, 0 failed, 0 flaky |

## Failed runs that were re-run (no test weakened)

- First run of this pipeline: `pnpm test` and `pnpm test:db` exited 1. One failure was mine: an old M4-2-era test in the moved workbench file still passed a reviewer string to #102's `eligibilityCommand`, which now (correctly) refuses it; I adapted its calls to an owner membership and its reviewer assertion to `membership:<id>` (same strength). The other was `audit.integration.test.ts` reporting `Connection terminated unexpectedly` while migrating under machine load (a file I did not touch; it passed in every later run).

## NOT RUN / deviations

- Locally the browser is the cached `chromium_headless_shell-1234` via a shim outside the repository; GitHub CI uses the pinned Chromium and is the authority.
- No clean from-scratch install; no traces kept (all passed).
- Not done: a viewer for recorded source records. Still discovered and unfixed (pre-existing): `reverse_synthetic_landing` applies plan credit unconditionally while `approve_synthetic_landing` applies it only after a plan-fee settlement event.
- Environment: Node v24.17.0, pnpm 10.28.1, Playwright 1.55.1, embedded PostgreSQL 16.10, macOS Darwin 25.4.0.

## Status

Prepared, built, locally tested and committed. GitHub CI is recorded in the coordinator report after the push. Not independently verified, not accepted, not merged.
