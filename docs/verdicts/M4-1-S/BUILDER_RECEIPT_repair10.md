# M4-1-S-R — builder receipt, repair 10

Date: 2026-10-04. Builder: **Claude Sonnet 5.5** (repair 10, on top of repairs 1 to 9).
**Not independently verified. Not accepted.** This receipt is the builder's account only. A different model must record a verdict bound to the exact head, and a separate actor must record acceptance. Nothing here was merged, released or deleted, and no verdict file was edited.

Input: the GPT-6.1 Sol high check of `ac994c245af99a1f0160753e046e72718c9ad242` (`jg-runs/m4-1-s-r-solcheck-20261004T190652.md`): `VERDICT: REPAIR`, no P1, five in-scope defects (P2-1, P2-2, P2-3, P2-4, P3-6) and one out-of-scope defect (P2-5).

## Scope reading (integrator's ruling, recorded verbatim)

- IN SCOPE, fix now: P2-1 (case reads bypass membership verification; C5), P2-2 (a downward amendment can strand a fully received claim; card: claim revisions and the full state machine), P2-3 (updating an older case silently selects the newest case; C1/C7), P2-4 (the workbench lacks claim-amendment, recovered-closure and manual-reversal controls: the card requires claim revisions and reopen-on-reversal in the "Chase unpaid money" workbench, and C1 requires a complete vertical slice, so expose these EXISTING commands with pounds input, current revisions, error focus and persisted results, covered in both browser projects), and P3-6 (uppercase case UUIDs commit but return undefined).
- OUT OF SCOPE, NOT WAIVED: P2-5 (pre-existing reversal accounting in `0018_recovery_outcomes.sql`). It predates this diff and needs its own new migration, so it is outside M4-1-S-R's card. It is recorded as the follow-up task order `~/.local/share/full-steam/jg-orders/REV-ACCT-1.txt` (not dispatched until this PR merges) under BUILD_PLAN §14.3 "Discovered later". Do not change 0018 and do not fix it here; state this disposition in the receipt so the next checker sees it.
- Founder decisions (Ben, 4 Oct 2026), not defects: the C7 "open the job from Jobs" step is met by reopening the saved job fresh plus a second browser context, for every JobGuard task; fictional sample-source labels are acceptable for now. Coordinator ruling (4 Oct): migration numbers follow merge order, so this task keeps migration **0043**.

## Binding

- Branch `codex/sandbox/m4-1-s-repair`, PR #103, previous head `ac994c2`. `origin/main` had moved to `ebfeaae` (TEST-STAB-2, one commit); it is merged in (below). No migration was added by main, so 0043 is still the next number.
- Commits (all end `Co-Authored-By: Claude Sonnet 5.5`): `69adfad` merge of origin/main; `e5385ed` tests first; `d8a842c` P2-1 fix; `9214575` P2-2 and P3-6 fix; `75e7527` P2-3 and P2-4 fix; then this receipt (with the lane's `receipt` path pointing here). The code and test head that every command below ran on is `75e7527399cdddcc33180334848ea7546b9e6012`; the only later commit is this docs-and-lane-pointer commit.
- Lane `m4-1-s-repair`: no new path was needed. Every file touched is already in the lane's `allow` list; the only registry edit is the lane's `receipt` pointer (repair9 to repair10). The lane check passes.

## Main-merge resolution

`git merge origin/main` (a merge commit, no rebase, no force). Main's only change relevant to a conflict was `config/agent-lane-assignments.json` (main added the TEST-STAB-2 lane entry; this branch adds the `m4-1-s-repair` lane): resolved with `python3 ~/.local/share/full-steam/lane-union.py` mid-merge ("union ok: 80 lanes"), then `git add`. I compared the result with `origin/main`'s file lane by lane: the only difference is the `m4-1-s-repair` lane, which is this branch's own. The other four merged files (`apps/web/e2e/UIWIRE-1.spec.ts` and the three `docs/verdicts/TEST-STAB-2/*` files) merged cleanly and are main's. No migration-count assertion changed (main added no migration), `apps/api/openapi.json` did not conflict, and there was no real code conflict.

## Findings, tests first, fixes

Every new test was written and committed (`e5385ed`) before the fix. Red runs were against the unfixed code: core (`stateAfterClaimAmendment is not a function`, 9 failures), API (6 failures), real PostgreSQL (3 failures: `expected {…} to match object { state: 'landed' … }`, `… 'closed_no_recovery' …` and `expected undefined to match object`), and the browser test against the previous workbench build (both projects failed at `case-landed-net` expected `£1,500.00`, received `£0.00`, i.e. the page had jumped to the newer case). Logs of the red and green runs are in the builder's scratchpad (`m41r10/` and `logs/red-db.log`, `logs/green-db-1.log`).

| # | Finding | Status | Failing-first test | Fix |
|---|---|---|---|---|
| P2-1 | Case reads bypass membership verification (C5) | **FIXED** (`d8a842c`) | `apps/api/src/recovery-case.command.application.test.ts:31` onward: `list` calls `readSyntheticDemoJob(pool, jobId)` before the repository (call order asserted); `MEMBERSHIP_FORBIDDEN` and `JOB_NOT_FOUND` refusals list nothing; a command's refreshed list does not re-verify. `apps/api/src/recovery-case.application.test.ts:29` onward: with the REAL boundary (not mocked) a non-demo mode and an unreachable lookup both refuse and list nothing | `apps/api/src/recovery-case.application.ts:14` `list` verifies the persisted membership and job through the existing `readSyntheticDemoJob` boundary, then `view` (line 19); `command` and `eligibility` return `view`, because they have just verified the membership inside their own write transaction |
| P2-2 | A downward amendment can strand a fully received claim | **FIXED** (`9214575`) | core: `packages/core/src/recovery-case.test.ts:159` onward (the stranded state is characterised: `partially_landed` with nothing outstanding allows no closure, receipt or write-off). PostgreSQL: `packages/db/test/recovery-cases.workbench.integration.test.ts:244` onward: claim 2,500.00, receive 1,000.00, amend to 1,000.00 gives `landed`, then amendment replay, `close_recovered`, closure replay, no further receipt, a later upward amendment still refused, plus the written-off variant | `packages/core/src/recovery-case.ts:59` `stateAfterClaimAmendment` (applies `assertClaimAmendable` first; when an amendment REDUCES the claim of an open case to exactly the principal already settled it returns `landed`, or `closed_no_recovery` when part was written off; equal or upward amendments and landed, closed or prevented cases never change); `packages/db/src/recovery-case-repository.ts:89` uses it and records the state change on the immutable `claim_amended` event (`from_state` previous, `to_state` new); claim revisions keep both claims, so history is preserved |
| P2-3 | Updating an older case silently selects the newest case (C1/C7) | **FIXED** (`75e7527`) | `apps/web/e2e/M4-1-S.spec.ts:74` onward ("amends a claim to what was received…"): open the older £2,500 case, part-receive, open the newer £320 case (selected on opening), choose the older case and record 500.00: the older case's claimed, received and outstanding amounts stay visible. Red: failed here in both projects | `apps/web/app/ui/recovery-cases.tsx:11` `apply(next, pick)`: a command result keeps the user's selection; only a case that has just been opened (`open()` passes `"new"`, line 37) is selected explicitly, as the newest id not listed before |
| P2-4 | The workbench lacks amendment, recovered-closure and reversal controls (C1) | **FIXED** (`75e7527`) | same e2e test, both projects (`mobile-360`, `desktop`): amendment errors (blank, `1e3`, below the received amount) each announced in an alert that takes focus with nothing recorded; amend 2,500.00 to the 1,500.00 received gives "Received in full"; "Close as recovered"; an upward amendment of a closed case refused with plain wording; a reversal larger than the receipt refused; a valid reversal reopens the closed case ("Partly received", 500.00 outstanding); a second page holding a stale revision is refused with a plain message and focus on the alert; the authoritative read, a reload and a second browser context agree; 44x44 touch targets for the new controls; no horizontal scroll | `apps/web/app/ui/recovery-cases.tsx:43-44`: "New claimed amount (£)" with "Amend claim" (`amend_claim`, `expectedRevision` from the loaded case), "Close as recovered" (enabled only when received in full), "Reversed (£)" with "Reverse a landed recovery" (`reverse_landing`); pounds parsed by `parsePoundsToPence`, positive only; the loaded revision is shown (`data-testid="case-revision"`); three refusal codes have plain wording (line 5) |
| P3-6 | Uppercase case UUIDs commit but return `undefined` | **FIXED** (`9214575`) | PostgreSQL, `…workbench.integration.test.ts:292` onward: an upper-case case id (transition, amendment, eligibility) commits and returns the case; replay in the same spelling, the lower-case spelling and an upper-case command id are all the same command (no conflict, one event); red returned `undefined` | `packages/db/src/recovery-case-repository.ts:10` `canonicalIds` lower-cases `caseId` and `commandId` right after parsing, before hashing, the advisory lock, the replay and case queries and the returned-case lookup; applied in `command` (line 59) and `eligibilityCommand` (line 34). Hashes of already stored lower-case commands are unchanged |
| P2-5 | Pre-existing reversal accounting in `0018_recovery_outcomes.sql` | **FOLLOW-UP, NOT FIXED, NOT WAIVED** | none here | Out of this task's card by the integrator's ruling. Recorded as `~/.local/share/full-steam/jg-orders/REV-ACCT-1.txt` (not dispatched until this PR merges) under BUILD_PLAN §14.3 "Discovered later". `0018` and every migration are untouched by this repair; 0043 is unchanged |

## Commands actually run

All on head `75e7527` with `CI=1` and `LANE_BASE_REF=origin/main`. The heavy chain (tests, migrations, browser) ran inside a single `heavy-slot m4-1-s-repair` (the chain script waited for ports 3000 and 55432 to be free first); logs in the builder's scratchpad `m41r10/`.

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | up to date |
| `pnpm typecheck` | 0 | 7/7 |
| `pnpm lint` | 0 | 7/7; lane `m4-1-s-repair` and core-purity and money boundaries pass (first attempt exited 1 only because my own untracked local Playwright shim was in the tree; it was moved out and the command re-run clean) |
| `pnpm lint:lanes` | 0 | passed (same one-off, same fix) |
| `pnpm build` | 0 | 7/7 |
| `pnpm openapi:check` | 0 | matches (no contract change) |
| `TURBO_FORCE=true heavy-slot … pnpm test` | 0 | 0 of 13 cached: `node --test` 39/39; core 706 (68 files); ai 72; api 118 (16 files); web 68 (9 files); db 216 (39 files); storage 4; config 2 |
| `heavy-slot … pnpm test:db` | 0 | 39 files, 216 tests |
| `heavy-slot … pnpm test:migrations` | 0 | 2 files, 11 tests |
| `CI=1 … playwright test --project=mobile-360 --project=desktop e2e/M4-1-S.spec.ts e2e/M4-2-S.spec.ts e2e/M4-3-S.spec.ts` | 0 | **14 passed**, 0 failed, 0 flaky (the new test and the original M4-1-S test in both projects, plus every other spec that drives the workbench) |

## NOT RUN / deviations

- Locally the browser is the cached `chromium_headless_shell-1234` through an UNCOMMITTED shim config that sets only `executablePath` (the pinned 1193 shell is not installed; nothing was downloaded). The shim was kept out of the tree for lint and lanes and removed after the run; GitHub CI uses the pinned Chromium and is the authority.
- The full e2e suite was not run locally (only the three specs that drive the recovery workbench, both projects); GitHub CI runs the rest. No clean from-scratch install.
- `packages/db/test` has no test that wires `RecoveryCaseApplication` to a real database (the API package has no PostgreSQL harness). The read boundary is covered by the application tests above plus the existing `workspace-read.integration.test.ts`, which already proves revoked, expired and different-identity memberships and a foreign or missing job against real PostgreSQL for `readSyntheticDemoJob`.
- The web route still answers a refused read or write with its existing status mapping (400 with the refusal code in the body); only the code was required to change, and no status mapping was altered.
- Environment: Node v24.17.0, pnpm 10.28.1, Playwright 1.55.1, embedded PostgreSQL 16, macOS Darwin 25.4.0.

## Status

Prepared, built, locally tested and committed. Pushed and checked by GitHub CI as reported separately by the coordinator reply (head SHA and run id). Not independently verified, not accepted, not merged.
