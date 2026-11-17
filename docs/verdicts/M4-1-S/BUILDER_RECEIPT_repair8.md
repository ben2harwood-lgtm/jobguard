# M4-1-S-R — builder receipt, repair 8

Date: 2026-10-04. Builder: **Claude Sonnet 5.5** (repair 8, on top of repairs 1 to 7).
**Not independently verified. Not accepted.** Input: the GPT-6.1 Sol high check of `85a1dbc` (`jg-runs/m4-1-s-r-solcheck-20261004T090754.md`): REPAIR with one P2, no P1, no other repair requests.

## Binding and rulings recorded

- Branch `codex/sandbox/m4-1-s-repair`, PR #103, previous head `85a1dbc`; `origin/main` is still b717020 (already merged in). Commits (all end `Co-Authored-By: Claude Sonnet 5.5`): `49c8ef6` tests first; `e56a215` the fix; this receipt.
- **Coordinator ruling recorded:** the received figure = the **greater** of the manually recorded and the approved principal (never their sum) is CONFIRMED, because it avoids double counting (migration 0043 view, repair 4). No change was made to it.
- Ben's decisions stand (card `jobguard-open-from-jobs-substitute-2026-10-03`, "Accept the substitute"): the C7 Jobs-list substitute and the fictional sample-source labels.

## Tests first

Red before the fix (`m41r-logs/r10-red-db.log`): the case command now takes the server-selected membership; the three new PostgreSQL tests and the converted existing DB tests (38 failures) and the two API application tests failed against the old string-reviewer signature.

## Finding

| # | Finding | Status | Fix and proof |
|---|---|---|---|
| 1 (P2) | Membership revocation can race the case command (C5) | **FIXED** | `RecoveryCaseRepository.command` now takes `{membershipId, identityUserId}` instead of a reviewer string. Its first statement in the write transaction requires an active, unexpired **owner** membership for this tenant and identity, `FOR SHARE` until commit (the approach #102 uses in `eligibilityCommand`), before the replay lookup, the advisory lock or any write; otherwise it throws `RECOVERY_REVIEWER_FORBIDDEN` (HTTP 403 in the Next route). The stored reviewer is derived there as `membership:<id>`. The API application still checks job access first as a cheap preflight and passes the server-selected membership. Real PostgreSQL proof, each time with cases, claims, events and audit rows unchanged: (1) a member who opened a case, once revoked, is refused on **replay of the same command**, on a new open and on a transition; (2) a non-owner role, an expired membership, another identity and another tenant are refused; (3) **revocation in flight**: an uncommitted revocation is held by another connection, the command is observed blocked on the membership row lock (polled via `pg_stat_activity`, no guessed sleep), and when the revocation commits the command is refused and nothing is written. The lock holding it against a later revocation is the same `FOR SHARE` mechanism; there is no separate test that races a revocation against a command mid-transaction |

## Commands actually run on the final code

`CI=1`, `LANE_BASE_REF=origin/main`; database and browser commands inside `heavy-slot m41r`. Logs `m41r-logs/r10-*.log`, `r10b`, `r10c`.

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | up to date |
| `pnpm typecheck` | 0 | 7/7 |
| `pnpm lint` | 0 | 7/7; lane `m4-1-s-repair` passes |
| `pnpm lint:lanes` | 0 | passed |
| `pnpm build` | 0 | 7/7 |
| `pnpm openapi:check` | 0 | matches |
| `TURBO_FORCE=true heavy-slot m41r pnpm test` | 0 | 0 of 13 cached: `node --test` 39/39; core 664 (332 unique); ai 72; api 111 (16 files); web 68 (9 files); db 209 (39 files); storage 4; config 2 |
| `heavy-slot m41r pnpm test:db` | 0 | 39 files, 209 tests |
| `heavy-slot m41r pnpm test:migrations` | 0 | 2 files, 11 tests (all 44 migrations) |
| full e2e, both projects, all specs (shim outside the repo), clean re-run | 0 | **166 passed**, 0 failed, 0 flaky |

## Runs that did not count, and why (no test changed)

- The first full e2e in this round exited 1 with **4 mobile-360 timeouts** (M4-2-S D03 exclusions, quote-acceptance, two UIWIRE-1 tests; 162 passed in 35 minutes). The whole pipeline was 5 to 10 times slower than usual while the Mac was under heavy load from other sessions (the unit step took 11 minutes instead of about 1). None of those specs touches this change. Re-run with the machine quiet: 166 passed in 4 minutes.
- A second re-run's wrapper received SIGTERM at start-up (another session reuses the shared scratchpad shim and port 3000), but the Playwright process it had started finished and logged **166 passed (4.0m)**; a third, detached run produced the clean **exit 0, 166 passed** reported above.

## NOT RUN / deviations

- Locally the browser is the cached `chromium_headless_shell-1234` via a shim outside the repository (another session is also using that shim; it points at this worktree, so their runs would not test their own tree); GitHub CI uses the pinned Chromium and is the authority.
- No clean from-scratch install; no traces kept (all passed). No test races a revocation against a command mid-transaction (see the finding).
- Not done: a viewer for recorded source records. Still discovered and unfixed (pre-existing): `reverse_synthetic_landing` applies plan credit unconditionally while `approve_synthetic_landing` applies it only after a plan-fee settlement event.
- Existing replay data recorded with the old reviewer format would no longer match the new stored reviewer (synthetic, unreleased data only).
- Environment: Node v24.17.0, pnpm 10.28.1, Playwright 1.55.1, embedded PostgreSQL 16.10, macOS Darwin 25.4.0.

## Status

Prepared, built, locally tested and committed. GitHub CI is recorded in the coordinator report after the push. Not independently verified, not accepted, not merged.
