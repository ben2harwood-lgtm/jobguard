# M4-1-S-R — builder receipt, repair 5

Date: 2026-10-04. Builder: **Claude Sonnet 5.5** (repair 5, on top of repairs 1 to 4).
**Not independently verified. Not accepted.** Input: the GPT-6.1 Sol high check of `19a40bf` (`jg-runs/m4-1-s-r-solcheck-20261004T033345.md`): REPAIR, no P1, four P2.

## Binding

- Branch `codex/sandbox/m4-1-s-repair`, PR #103, previous head `19a40bf`. `origin/main` is still `b039abf` (already merged in).
- Commits (all end `Co-Authored-By: Claude Sonnet 5.5`): `69ec428` tests written first; `0b4c0d4` the fixes; this receipt. No lane change (no new files).

## Tests first

Red before any fix (`m41r-logs/r5-red-db.log`): PostgreSQL, the two-case fee sequence and the capacity-after-reversal test failed (the capacity one with `allocation exceeds available receipt or claim` on a fresh, valid landing), plus the fee assertions on the new field names; the web wording tests failed against the old helper.

## Findings

| # | Finding | Status | Fix and proof |
|---|---|---|---|
| 1 (P2) | Signed job-level adjustments shown as a current case fee | **FIXED** | The fee is a job-level figure (one cap and one plan credit shared by all cases), so the workbench now reports three separate numbers: `feeJobLiabilityPence` (the job's current liability, labelled "Job fee liability (shared by all cases on this job)" and bound to `case-fee`), and the case's own `feeObligationsPostedPence` and `feeCompensationsPostedPence` (shown as "Postings made because of this case ... compensation (job-level true-up)"). Wording never calls a job-level compensation a case fee and never says "no fee exists" for a case that has a posting. Proof, real PostgreSQL, Sol's sequence with a settled plan credit: approve 1,000.00 on A, 1,000.00 on B, reverse A: job liability 21.00 on both cases; A shows obligation 21.00 and compensation 100.00 with approved 0.00; B shows obligation 100.00 and approved 1,000.00; the job journal nets to 21.00. Web unit tests cover five wording states. `M4-2-S.spec.ts` is still unchanged and passes |
| 2 (P2) | Approved reversals do not restore claim capacity in the landing routine | **FIXED** | `approve_synthetic_landing` now bounds a new allocation by the NET approved principal (`approved_landed`, allocations less approved reversals) against claim minus written-off, under the existing locks. Proof, real PostgreSQL, with write-off history: claim 2,500.00, approve 1,000.00, write off 1,500.00, fully reverse the approval: a fresh 1,000.01 is refused and a fresh 1,000.00 lands; partial reversal of 400.00 restores exactly 400.00 (400.01 refused, 400.00 lands) |
| 3 (P2) | Founder decisions outstanding | **OPEN FOR BEN — not resolved, not waived by the builder** | (1) "Open the job from Jobs": the Jobs list deliberately excludes capture-created jobs, so the second browser context still reaches the job by URL (it signs in itself and reads identical case and source data). Ben chooses: (a) waive C7's "open from Jobs" for capture-created jobs in M4-1-S-R, or (b) add listing of capture-created jobs to the Jobs home as a separate task. Builder lean (a). Reply words: "Approve option (a) for M4-1-S-R" or "Do option (b) as a separate task". (2) Fictional practice source labels remain admitted next to recorded source ids. Builder lean: accept for the synthetic slice. Reply words: "Accept fictional source labels for M4-1-S-R" |
| 4 (P2) | External evidence not independently checkable | **NOT A BUILDER FIX — recorded** | The checker could not reach GitHub. Builder-reported local results are below and the GitHub Actions result for the pushed head is recorded by the coordinator (`gh pr checks 103`). Nothing here claims an independent check |

## Commands actually run on the final code

`CI=1`, `LANE_BASE_REF=origin/main`; database and browser commands inside `heavy-slot m41r`. Logs `m41r-logs/r5-*.log`.

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | up to date |
| `pnpm typecheck` | 0 | 7/7 (4 cached) |
| `pnpm lint` | 0 | 7/7 (4 cached); lane `m4-1-s-repair` passes |
| `pnpm lint:lanes` | 0 | passed |
| `pnpm build` | 0 | 7/7 (all cached from the preceding identical build) |
| `pnpm openapi:check` | 0 | matches |
| `TURBO_FORCE=true heavy-slot m41r pnpm test` | 0 | 0 of 13 cached: `node --test` 39/39; core 608 (304 unique, also run from `dist`); ai 72; api 78; web 61 (8 files); db 168 (34 files); storage 4; config 2 |
| `heavy-slot m41r pnpm test:db` | 0 | 34 files, 168 tests |
| `heavy-slot m41r pnpm test:migrations` | 0 | 2 files, 11 tests |
| full e2e, both projects, all specs (shim outside the repo) | 0 | **162 passed**, 0 failed, 0 flaky |

## NOT RUN / deviations

- Locally the browser is the cached `chromium_headless_shell-1234` via a shim outside the repository; GitHub CI uses the pinned Chromium.
- No clean from-scratch install; no traces kept (all passed).
- Not done: the Jobs-list step (OPEN FOR BEN); a viewer for recorded source records; sibling conflicts with #101 and #102 (integration step). The case state remains the workflow stage set by workbench events.
- Still discovered and unfixed (pre-existing, out of scope): `reverse_synthetic_landing` applies plan credit unconditionally while `approve_synthetic_landing` applies it only after a plan-fee settlement event; the new tests use jobs with a settlement event, where both agree.
- Environment: Node v24.17.0, pnpm 10.28.1, Playwright 1.55.1, embedded PostgreSQL 16.10, macOS Darwin 25.4.0.

## Status

Prepared, built, locally tested and committed. Not independently verified, not accepted, not merged; OPEN FOR BEN items 3 stand.
