# SH-1 CI repair — builder receipt

**Task:** SH-1 Shared money and origin primitives (PR #99, branch `codex/sandbox/sh-1`)
**Repair builder:** Claude Sonnet 5.5 (not the original builder, not the reviewer, not the acceptor)
**Starting head:** `c56eb81c923653239c4c464614b0a199f0fdb5a7` (failing GitHub CI run 37151973590)
**Status: not independently verified, not accepted.** A different model checks these commits; a Claude Opus reviewer checks the Codex code.

## Why CI failed

The `checks` job stopped at `pnpm test` (typecheck and lint were green; build and browser steps never ran).
Three PostgreSQL tests failed, all test-fixture problems, none in the SH-1 product code:

| # | Failing test | Root cause | Fix (commit) |
|---|---|---|---|
| 1 | `UIWIRE-12.integration.test.ts` (beforeAll, line 54) | Hard-coded total of 42 migrations; with `0053_shared_money_origin.sql` a fresh/upgraded database records 43. | Totals and the BETWEEN range now count 0053 on top of current main (43). `86b1c4f` |
| 2 | `demo-bootstrap.integration.test.ts` ("applies 0000..0041 …") | Same hard-coded 42 (`migrations: 42`, `toHaveLength(42)`) and range text. | Set to 43; range text now reads `0000..0041 and 0053`. `86b1c4f` |
| 3 | `shared-money-origin.integration.test.ts` ("the real switch-live command binds atomically …") | Fixture inserted `app.quote_acceptance.stated_method = 'synthetic attestation'` (21 chars). The column is `varchar(20)` with a CHECK of verbal/email/message/signed-paper, so the insert failed with SQLSTATE 22001 before reaching the command under test. | Fixture uses `'verbal'`. No assertion changed. `c9b81ed` |

Migration 0053 was not renumbered. The totals are set for THIS branch only; the integrator re-adjusts them at merge time.

## Not caused by SH-1: flaky UIWIRE-1 spec (not touched)

`apps/web/e2e/UIWIRE-1.spec.ts` lines 8 and 9 failed intermittently in full-suite browser runs (run 1: both at mobile-360;
run 2: line 8 at desktop) and pass when the spec runs alone (12/12). The Playwright trace shows `POST /api/jobs/<id>/review`
ending with status -1 (aborted): the test clicks "Save review" and immediately calls `page.reload()` without waiting for the save,
so a slower server cancels the request and the added/split line is lost. This is a race inside the existing spec and SH-1 does not
touch the review route. It belongs to another task's lane, so it was not edited (no retry wrapper, no longer timeout).
Suggested follow-up for the owner: wait for the review response or the "Review saved" text before reloading.

## Environment repairs (nothing in the repository changed)

- The first local `pnpm test` failed 32 database suites with `Postgres init script exited with code null`. Cause: pnpm skipped the
  `@embedded-postgres/darwin-arm64` postinstall, so the dylib symlinks were missing. Fixed by running the package's own
  `scripts/hydrate-symlinks.js` inside `node_modules` (a rebuildable folder). `ipcs -m` showed no leaked segments.
- Playwright 1.55.1 pins `chromium_headless_shell-1187`, which is not installed. An UNCOMMITTED local config that only sets
  `launchOptions.executablePath` to the installed `chromium_headless_shell-1234` was used for every browser run below and was then
  moved out of the tree (it breaks the web `tsc` lint if left in place). GitHub CI with the pinned browser is the proof of record.

## Commands run (local, Mac, Node 24.17.0, pnpm 10.28.1)

Database and browser commands ran inside `heavy-slot sh-1`. `pnpm install`, typecheck, lint, build and `openapi:check` do not touch a
database or browser and ran outside a slot.

| Command | Exit | Result |
|---|---:|---|
| `pnpm install --frozen-lockfile` | 0 | already up to date |
| `pnpm typecheck` | 0 | 7 of 7 tasks |
| `pnpm exec turbo run lint` (package lint) | 0 | 7 of 7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | core purity passed (75 files); lane boundary FAILED, see "Open" |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | same lane failure |
| `pnpm build` | 0 | 7 of 7 tasks |
| `pnpm test`, first run (slot) | 1 | db 35 files / 161 tests all passed; one unhandled FATAL 57P01 ("terminating connection due to administrator command") attributed by Vitest to `readiness.integration.test.ts` teardown, the Postgres-stop race that `pool-test-utils.ts` already documents; SH-1 does not touch that file |
| `pnpm test`, rerun (slot) | 0 | tools 42; core 498 (74 files); api 75 (10); web 56 (7); ai 72 (3); config 2; storage 4 (2); db 161 (35) |
| `pnpm test:db` (slot) | 0 | 35 files, 161 tests |
| `pnpm test:migrations` (slot) | 0 | 2 files, 11 tests |
| `pnpm openapi:check` | 0 | up to date |
| `CI=1 … test:e2e --project=mobile-360 --project=desktop` (all specs), run 1 (slot) | 1 | 162 tests: 160 passed, 2 failed (UIWIRE-1 lines 8 and 9, mobile-360) |
| same, run 2 (slot) | 1 | 162 tests: 161 passed, 1 failed (UIWIRE-1 line 8, desktop) |
| same, `UIWIRE-1.spec.ts` only (slot) | 0 | 12 passed |
| `git diff --check origin/main...HEAD` | 0 | clean |

SH-1 adds no web workflow and has no `SH-1.spec.ts`; no existing spec was changed. The full browser suite was run anyway because CI runs it.

## Not run

- GitHub CI on a new head: not yet pushed (see "Open").
- Pinned Playwright browser: not installed locally (above).
- `pnpm eval` and live-provider checks: not in this repair's scope.

## Open

`pnpm lint` (and the CI lint step, which runs before tests) stays red until the sh-1 lane in `config/agent-lane-assignments.json`
allows the paths this repair had to touch: `packages/db/test/UIWIRE-12.integration.test.ts`,
`packages/db/test/demo-bootstrap.integration.test.ts` and `docs/verdicts/SH-1/**`. The repair builder was not permitted to widen
its own lane's allow list, so that edit and the push are left for the dispatcher or Ben.
