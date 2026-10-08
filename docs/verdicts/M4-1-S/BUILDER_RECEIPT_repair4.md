# M4-1-S-R — builder receipt, repair 4

Date: 2026-10-04. Builder: **Claude Sonnet 5.5** (repair 4, on top of repairs 1 to 3).
**Not independently verified. Not accepted.** Input: Claude Opus re-review of `271997d` is PASS (PR comment); the GPT-6.1 Sol high check (`jg-runs/m4-1-s-r-solcheck-20261004T000820.md`) is REPAIR with no P1, two P2 and one P3. A fresh verdict bound to the new head and a separate acceptance are still owed.

## Binding

- Branch `codex/sandbox/m4-1-s-repair`, PR #103, previous head `271997d`. `origin/main` is still `b039abf`, already merged in; no new merge was needed.
- Commits (all end `Co-Authored-By: Claude Sonnet 5.5`): `6b7ac8a` tests written first; `0fc0284` the fixes; this receipt.
- The lane `m4-1-s-repair` gained exactly two files (`apps/web/app/lib/recovery-fee-note.ts` and its test). The Playwright shim is still outside the repository; the worktree has no untracked files.

## Tests first

Run red before any fix (log `m41r-logs/r4-red-db.log`): PostgreSQL 3 failed (approved landing to received/outstanding to amendment/write-off/reversal; approved-only landing not reversible by hand; fully offset fee) and the new web wording test failed to import. The e2e persistence journey was rewritten before the fix and first ran against the fixed code (it needs no code change).

## Findings from the Sol check

| # | Finding | Status | Fix and proof |
|---|---|---|---|
| 1 (P2) | Approved landings and workbench accounting disconnected | **FIXED** | `app.recovery_case_current` now exposes `manual_landed` (workbench events), `approved_landed` (landing allocations net of approved reversals) and `landed` = the **larger** of the two, never the sum, so a builder who records by hand the money later approved is not double counted, and approved principal is never invisible. Received, outstanding, claim amendment (`RECOVERY_CLAIM_BELOW_SETTLED`), write-off remainder and the fee all read it. The workbench may reverse only its own manual records (bounded by `manual_landed`); approved landings are reversed through `reverse_synthetic_landing`. Legacy cases with no workbench history are unchanged (their row is still read by the routine; checked). Proof, real PostgreSQL: approved 1,000.00 shows received 1,000.00, outstanding 1,500.00, fee 21.00; recording 600.00 by hand changes nothing; another 600.00 raises received to 1,200.00; amendment to 1,199.99 is refused; write-off records 1,300.00 and leaves 0.00; reversing the approved landing leaves the manual 1,200.00 and a 0.00 fee; manual reversal of 1,200.01 is refused and 1,200.00 succeeds; landed + written off + outstanding = claim throughout |
| 2 (P2) | Persistence journey incomplete | **PARTLY FIXED; remainder OPEN FOR BEN** | Fixed: the e2e now uses a true second browser context (own cookies and storage, signs in itself), asserts the whole persisted `recovery-cases` response is **identical** (ids, revisions, amounts, source identities) before reload and in the second context, and opens the merchant and customer cases there to see the same source links and amounts. Not fixable by me: "open the job from Jobs". The Jobs list (`readSyntheticDemo`) deliberately excludes capture-created jobs; listing them changes the Jobs home contract for every spec that reads it. See OPEN FOR BEN |
| 3 (P3) | Zero fee described as no qualifying landing | **FIXED** | `feeBasisNote` chooses the wording from the approved principal, not the fee: positive fee, approved landing with zero fee ("no additional fee after the cap and plan credit"), none ("No approved qualifying landing yet"). The case shows the approved amount. Proof: web unit test (3 states) and a PostgreSQL test of a 50.00 landing with 5.00 fee fully offset by plan credit (derivation capped fee 500, credit 500, liability 0, delta 0) where the view reports approved 50.00 and fee 0 |

### OPEN FOR BEN (the repair stays on hold while these stand)

1. **Open from Jobs.** Choose one: (a) waive C7's "open the job from Jobs" for capture-created jobs in M4-1-S-R, because the Jobs list excludes them by design and the job page is reached by URL and a second signed-in context; or (b) add listing of capture-created jobs to the Jobs home as its own task. Builder lean: (a). Exact words Ben can send: "Approve option (a) for M4-1-S-R" or "Do option (b) as a separate task".
2. **Fictional practice labels** (unchanged): recorded sources are admitted alongside the fixed practice labels. Builder lean: accept for the synthetic slice.

## Commands actually run on the final head

`CI=1`, `LANE_BASE_REF=origin/main`; database and browser commands inside `heavy-slot m41r`. Logs `m41r-logs/r4-*.log` and `r4b-*.log`.

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | up to date |
| `pnpm typecheck` | 0 | 7/7 (4 cached) |
| `pnpm lint` | 0 | 7/7 (4 cached); lane `m4-1-s-repair` passes |
| `pnpm lint:lanes` | 0 | passed |
| `pnpm build` | 0 | 7/7 (4 cached) |
| `pnpm openapi:check` | 0 | matches |
| `TURBO_FORCE=true heavy-slot m41r pnpm test` | 0 | 0 of 13 cached: `node --test` 39/39; core 608 (34 files twice, once from `dist`; 304 unique); ai 72; api 78; web 59 (8 files); db 166 (34 files); storage 4; config 2 |
| `heavy-slot m41r pnpm test:db` | 0 | 34 files, 166 tests |
| `heavy-slot m41r pnpm test:migrations` | 0 | 2 files, 11 tests |
| full e2e, both projects, all specs, shim outside the repo | 0 | **162 passed**, 0 failed, 0 flaky |

## Failed runs that were re-run, and why (no test was changed)

- First full pipeline, `pnpm test` and `pnpm test:db` exited 1 although every test passed (34 files, 166 tests): Vitest reported one unhandled `57P01 terminating connection` from `capture.integration.test.ts`, a file I did not touch. `closeTestPools` documents this race ("stopping Postgres in that window reports a spurious FATAL 57P01") and works around it with a 25 ms drain; under this Mac's load (average 30 or more) it fired once. The identical commands passed on the immediate re-run. This is a pre-existing teardown flake, not changed or hidden.
- First full e2e run failed at start-up with `EADDRINUSE 127.0.0.1:3000`: another worktree's web server took the fixed port after my check. Re-run when the ports were free, 162 passed.

## NOT RUN / deviations

- Locally the browser is the cached `chromium_headless_shell-1234` through the outside-the-repo shim; GitHub CI uses the pinned Chromium and is the authority.
- No clean from-scratch install. No traces kept (all passed).
- Not done: the Jobs-list step (OPEN FOR BEN 1); a viewer for recorded source records; sibling conflicts with #101 and #102 (integration step, unchanged).
- The case state stays the workflow stage set by workbench events: an approved landing adds received principal but does not move the state.
- **Discovered, not fixed (pre-existing, out of scope):** `app.reverse_synthetic_landing` applies plan-fee credit `least(7900, fee)` unconditionally, while `approve_synthetic_landing` applies it only when a plan-fee settlement event exists. In a job with fees but no settlement, a reversal compensates the whole job's fee, so a per-case fee sum can go negative. The new tests use jobs with a settlement event, where both routines agree. This should become its own task.
- Environment: Node v24.17.0, pnpm 10.28.1, Playwright 1.55.1, embedded PostgreSQL 16.10, macOS Darwin 25.4.0.

## Status

Prepared, built, locally tested (unit, database, migration, complete browser suite) and committed. GitHub CI is recorded in the coordinator report after the push. Not independently verified, not accepted, not merged.
