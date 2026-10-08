# M4-1-S-R — builder receipt, repair 9

Date: 2026-10-04. Builder: **Claude Sonnet 5.5** (repair 9, on top of repairs 1 to 8).
**Not independently verified. Not accepted.** Inputs: the GPT-6.1 Sol high check of `4429ef6` (`jg-runs/m4-1-s-r-solcheck-20261004T130402.md`): REPAIR, one P2, "no P1 or additional P3 findings"; the Claude Opus review of `4429ef6` is PASS with no P1 or P2 (PR comment 5979831754), so there was nothing to fold in.

## Binding

- Branch `codex/sandbox/m4-1-s-repair`, PR #103, previous head `4429ef6`; `origin/main` is still b717020 (already merged in). Commits (all end `Co-Authored-By: Claude Sonnet 5.5`): `f240d25` tests first; `693d17f` the fix; this receipt (and the lane's receipt path).
- Everything else stays as round 8. Ben's decisions (card `jobguard-open-from-jobs-substitute-2026-10-03`: C7 Jobs-list substitute and fictional source labels) and the coordinator's ruling (received = the greater of manual and approved principal) stand.

## Tests first

Red before the fix (`m41r-logs/r11-red-db.log` and a core run): core, `close_recovered` without the full claim and the new amendment guard (`assertClaimAmendable` did not exist); real PostgreSQL, 3 of the 4 new tests failed because the upward amendment of a landed or written-off case was accepted. The fourth (the explicit reopen path) already worked and is kept as a regression.

## Finding

| # | Finding | Status | Fix and proof |
|---|---|---|---|
| 1 (P2) | Claim amendment permits a false "Closed — recovered" (BUILD_PLAN section 5.5 full-claim closure) | **FIXED** | (1) **Core guard:** `close_recovered` is rejected unless the whole current claim is received (`landed === claimed`, with received principal being the greater of manual and approved). (2) **Choice recorded: REJECT.** `assertClaimAmendable` rejects an amendment that **raises** the claim of a case in `landed`, `closed_recovered` or `closed_no_recovery` with `RECOVERY_CLAIM_AMENDMENT_ON_CLOSED_CASE`; the settled-floor rule (`RECOVERY_CLAIM_BELOW_SETTLED`) is unchanged; lower or equal amendments that still cover the settled principal are allowed. **Reason:** an explicit reopen transition already exists in the table (`dispute`, from all three states, goes to `negotiating`), so no silent reopening by amendment is needed and no new transition or policy was invented; the user reopens, then the claim may rise (it can in `negotiating`, `pursuing`, `partially_landed`, `evidence_assembled`, `identified`), the remainder must be received, and only then can the case close as recovered. The existing behaviour that an amendment keeps the previous state is unchanged for those open states. The stale-revision check still runs first, so a stale amendment is reported as stale. Proof, core: guard tests for every closed-or-landed state, the open states, equal/lower amendments, and the end-to-end reopen sequence. Proof, real PostgreSQL: receive 2,500.00 in full, then amend to 3,000.00 is refused, a **replay** of the refused command is refused the same way and recorded nowhere, a stale-revision amendment reports `RECOVERY_STALE_REVISION`, and claim revisions, case events and audit rows are unchanged; a legitimate closure is replay-safe and a later upward amendment of the closed case is refused; a written-off closed case refuses the same amendment; and the reopen path (close, dispute, amend to 3,000.00, record the last 500.00, close recovered) ends with the claim, received and closed amounts all 3,000.00 and 0.00 outstanding |

## Commands actually run on the final code

`CI=1`, `LANE_BASE_REF=origin/main`; database and browser commands inside `heavy-slot m41r`; the browser shim is the builder's own, outside the repository. Logs `m41r-logs/r11-*.log`.

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | up to date |
| `pnpm typecheck` | 0 | 7/7 |
| `pnpm lint` | 0 | 7/7; lane `m4-1-s-repair` passes |
| `pnpm lint:lanes` | 0 | passed |
| `pnpm build` | 0 | 7/7 |
| `pnpm openapi:check` | 0 | matches |
| `TURBO_FORCE=true heavy-slot m41r pnpm test` | 0 | 0 of 13 cached: `node --test` 39/39; core 686 (343 unique, also run from `dist`); ai 72; api 111 (16 files); web 68 (9 files); db 213 (39 files); storage 4; config 2 |
| `heavy-slot m41r pnpm test:db` | 0 | 39 files, 213 tests |
| `heavy-slot m41r pnpm test:migrations` | 0 | 2 files, 11 tests (all 44 migrations) |
| full e2e, both projects, all specs | 0 | **166 passed**, 0 failed, 0 flaky |

## Test slips fixed while getting to green (no test weakened)

- One of my new test helpers compared a uuid parameter with a varchar column (`audit_event.subject_ref`); I added a `::text` cast. No assertion changed.

## NOT RUN / deviations

- Locally the browser is the cached `chromium_headless_shell-1234` (the pinned 1193 shell is not installed; no download); GitHub CI uses the pinned Chromium and is the authority.
- No clean from-scratch install; no traces kept (all passed). The workbench UI has no "amend claim" control, so the amendment guard is exercised through the repository and core only.
- Not done: a viewer for recorded source records. Still discovered and unfixed (pre-existing): `reverse_synthetic_landing` applies plan credit unconditionally while `approve_synthetic_landing` applies it only after a plan-fee settlement event.
- Environment: Node v24.17.0, pnpm 10.28.1, Playwright 1.55.1, embedded PostgreSQL 16.10, macOS Darwin 25.4.0.

## Status

Prepared, built, locally tested and committed. GitHub CI is recorded in the coordinator report after the push. Not independently verified, not accepted, not merged.
