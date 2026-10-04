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

## Addendum, 4 October: lane approvals, merge with main, final local results

- **Lane approvals (Ben, Command Center cards `jobguard-sh-1-lane-allow-list` and `jobguard-sh-1-evidence-pack-fixture`):** the sh-1 lane now also allows
  `packages/db/test/UIWIRE-12.integration.test.ts`, `packages/db/test/demo-bootstrap.integration.test.ts`, `docs/verdicts/SH-1/**` (`e6963b2`)
  and `packages/db/test/evidence-pack-fixture.ts` (`9123fe9`). The coordinator applied both edits; the repair builder did not widen the lane itself.
- **Merge of `origin/main` (`b0fbf9a`):** brings in #101 (M4-3-S-R, migration 0042), #102 (M4-2-S-R) and #96. Lane registry merged as a union
  (`lane-union.py`), `migrate.ts` order 0042 then 0053, `MIGRATIONS.md` sections in that order. Migration counts are main's 43 plus 0053 = **44**
  (UIWIRE-12 totals and BETWEEN bound, demo-bootstrap `migrations: 44`, range text "0000..0042 and 0053"). 0053 is not renumbered.
- **Fixture conflict found by the merge:** the #101 evidence-pack fixture inserts a variation on a job with no `job_commercial_track` binding, which
  SH-1 forbids by design (SQLSTATE 23502 on `variation.job_track`). `9123fe9` binds a `small_builder` track first, as SH-1's own tests do. The same
  fixture also seeds the 0042 upgrade test (`evidence-pack-upgrade.integration.test.ts`) on a real 0041 database where `app.job_commercial_track` does not
  exist, so the binding is guarded with `to_regclass` (this repair's last test commit). No assertion was changed.
- **Final local results on the pushed head (Node 24.17, pnpm 10.28.1; database and browser runs in `heavy-slot sh-1`):**

| Command | Exit | Counts |
|---|---:|---|
| `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`, `pnpm openapi:check` | 0 | typecheck and build 7 of 7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` and `pnpm lint:lanes` | 0 | lane boundary, core purity and money checks pass |
| `pnpm test` | 0 | core 550; api 108; web 63; ai 72; config 2; storage 4; db 194 (39 files) |
| `pnpm test:db` | 0 | 39 files, 194 tests |
| `pnpm test:migrations` | 0 on rerun | 2 files, 11 tests. The first run on this head failed: the `tenancy.integration.test.ts` beforeAll died after 10.7 s ("Unknown Error: undefined") and its afterAll timed out while the Mac was running other suites. A second run, same code, passed. Treat as an embedded-Postgres start-up flake, not a code failure. |
| Full e2e, both projects (earlier merged head `b0fbf9a`, local headless shell 1234) | 0 | 166 passed |

The e2e run predates the two fixture-only commits above, which change no application code. GitHub CI with the pinned browser is the proof of record.
The earlier UIWIRE-1 spec race (see above) did not recur in that run but is still unfixed in its own lane.

## Open

GitHub CI on the pushed head. Independent verdict and separate acceptance remain pending. Not independently verified, not accepted.

## Round 2: independent check on `71ee571` (Sol 6.1, verdict REPAIR, two P2 findings)

Repair builder: Claude Sonnet 5.5 (same repair builder as above; not a reviewer, not the acceptor). Tests first: the regression tests were
committed first (`2a6503a`) and failed on `71ee571` for the expected reasons; the fix followed (`0ba95c5`).

| # | Finding | Root cause | Fix |
|---|---|---|---|
| 1 | P2: receipt cutoff loses timestamp precision | `Date.parse` truncates fractional milliseconds, so a line created at `.000900Z` was treated as existing at a receipt of `.000100Z`. | `receipt-allocation.ts` now compares exact instants: whole seconds (calendar arithmetic in `bigint`, timezone offset applied) plus the decimal fraction at any length. Covers every form the schema accepts (`Z`, `+hh:mm`, `+hhmm`, seconds optional). |
| 2 | P2: valid allocation totals cannot always enter the fee kernel | Rational components were capped at 100 characters, but the exact net summed over a normal invoice has about 8 digits per line (150 lines: 130 digits). Raising the cap to fit one example would fail at larger sizes. | The kernel limit is derived from the supported allocation sizes: `MAX_EXACT_PENCE_DIGITS` = 10,000 lines x 13 money digits + 3 x 100 input digits + 13 = 130,313, with the derivation in the code and `docs/contracts/shared-money-origin-v1.md`. Allocation inputs stay at 100 digits and an allocation whose own total exceeds that fails closed (`INVALID_ALLOCATION`), so per-line work is bounded. The kernel no longer reduces its input (no full-length gcd) and rounds the exact product once, half-even; the money magnitude limit is checked by cross-multiplication. `addExactPence` now reduces with one short gcd, and new `sumExactPence` adds any number of terms exactly and reduced in time linear in the term count, failing closed (`INVALID_SHARED_MONEY`) beyond the limit. |

New tests (in `packages/core/src/receipt-allocation.test.ts` and `cumulative-fee.test.ts`; no existing assertion changed):
sub-millisecond, nanosecond, offset (`Z`, `+01:00`, `+0100`, `-05:00`, `+05:30`) and calendar-boundary (leap day, year end) cutoffs for pro-rata and explicit allocation;
the 150-line example from the finding (fee 8p); allocator to fee kernel for 1,000 and 2,000 lines of distinct 12-digit amounts, checked against an independent
product-denominator computation, with `addExactPence` folding and `sumExactPence` agreeing and the result inside the contract size; sequential whole-penny pro-rata receipts
against updated balances aggregating to the same exact value as one allocation; fail-closed allocation total; kernel size boundary (exactly the limit accepted, one digit more
rejected, unreduced fractions accepted and money limit still enforced); `sumExactPence` against folded addition on 300 random sets; `addExactPence` against its definition on 2,000
random pairs with shared denominator factors; the size constants.

Size and time (measured on this Mac with `tsx`, distinct 11-digit line amounts, allocation then `sumExactPence` then the kernel; not asserted in a unit test because the largest case takes seconds):
150 lines about 10 ms (1,390 digits); 1,000 lines about 0.1 s (7,849 digits); 10,000 lines (the schema maximum) about 4 to 5 s with `sumExactPence` or with one-at-a-time `addExactPence`
(72,641 digits, inside the 130,313 limit); every case returns fee 8p for a 100p receipt. The previous one-at-a-time addition took 8.6 s at 800 lines and was impractical beyond that.

| Command (round 2, head `0ba95c5` plus this receipt) | Exit | Counts |
|---|---:|---|
| `pnpm typecheck`, `pnpm build`, `pnpm openapi:check` | 0 | typecheck and build 7 of 7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint`, `pnpm lint:lanes` | 0 | lane boundary, core purity, money arithmetic and commercial boundary checks pass; `tools/shared-money-origin.test.mjs` still requires bigint-only `*` and `/` in both kernels |
| `pnpm test` (slot) | 0 | tools 42; core 580 (74 files); api 108; web 63; ai 72; config 2; storage 4; db 194 (39 files) |
| `pnpm test:db` (slot) | 0 | 39 files, 194 tests |
| `pnpm test:migrations` (slot) | 0 | 2 files, 11 tests |
| `git diff --check origin/main...HEAD` | 0 | clean |

Not run locally: the browser suite (this round changes only `packages/core` arithmetic and its contract text, and no web code calls these functions yet; GitHub CI runs the full suite).
Still not independently verified, not accepted.

