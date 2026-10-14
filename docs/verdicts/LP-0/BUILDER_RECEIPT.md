# LP-0 builder receipt (grant freeze guard, separable part)

**Not independently verified, not accepted.** This is the builder's own record. Whole-task completion is NOT claimed: LP0-13 and LP0-22 are HELD (below). A passing guard is not a least-privilege or customer-data gate.

## Base, head, dependency
- PLAN-LPL merge: PR #174, merge commit `a778d64c4439c4cf3e149962e67ef49ae969bfbe` on `origin/main` (section 11.8 and `docs/verdicts/PLAN-LPL/` present). Build branch `codex/sandbox/lp-0` created from it; later merged `origin/main` `3351ed99` (PR #203, no database object change). Head SHA is reported in the PR (a file cannot name its own commit).
- Environment: Node v24.17.0, pnpm 10.28.1 (workspace-installed; shell default 11.8.0), PostgreSQL 16.10 (embedded, disposable, darwin), vitest 4.1.11, zod 3.25.76. Registry: 80 migrations, highest `0150_membership_authority_fix.sql` (0143 is not registered). Reservations 0139-0143 untouched.

## Changed files (all new except the lane line)
`config/agent-lane-assignments.json` (one additive `lp-0` line); `packages/db/test/lp-0-catalog.ts`, `lp-0-catalog.test.ts`, `lp-0-grant-freeze.integration.test.ts`, `lp-0-authority-paths.integration.test.ts`; `docs/contracts/lp-0-effective-privileges-v1.json` and `.md`; `docs/contracts/lp-command-binding-design-v1.md`; this receipt. No migration (`MIGNUM_LP_0` unused). **New runtime grants: none.**

## Commands and results (heavy-slot, `--maxWorkers=2`, one run at a time)
| Command | Exit | Result |
|---|---|---|
| `pnpm typecheck` | 0 | 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `lp-0`, 7 files |
| `pnpm build` / `pnpm openapi:check` / `git diff --check` | 0 / 0 / 0 | |
| lp-0-catalog.test.ts | 0 | 25 passed |
| lp-0-grant-freeze + lp-0-authority-paths integration | 0 | 19 passed (13 + 6) |
| api context-boundary.test.ts | 0 | 145 passed |
| tenant-context, contractor-session-context (2) | 0 | 41 passed |
| tenancy, commands, audit | 0 | 21 passed |
| command-replay-contract, proof-replay, match-inbox-replay | 0 | 64 passed |
| fingerprinted-row-shape, audit-export, demo-bootstrap | 0 | 28 passed |
| site-extra, site-extra-authority, extra-origin | 0 | 104 passed |
| extra-links, extra-unlink, contractor-owner-grant | 0 | 60 passed |
| identity, contractor-practice-session, scim-deactivation-access | 0 | 65 passed |
| final-account-lock, final-account-lock-invoice, recovery-allocation | 0 | 41 passed |
| job-activation-terms, recovery-case-terms, UIWIRE-12 | 0 | 79 passed |
| shadow-catalog, shadow-persistence, shadow-isolation-query-log | 0 | 15 passed |

**Not run locally:** aggregate `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e` (CI runs them, Q3); no browser spec (no web change).

## Failed-first evidence (weak, disclosed)
- The comparator unit tests were written after a first draft of the helper. Failed-first was shown by withholding the helper file: run failed with an unresolved import (1 file failed, no tests). It is not a behavioural red.
- Integration tests were committed before the inventory existed: both files failed in setup (ENOENT on the inventory JSON, 19 tests skipped). Also not a behavioural red. Each control states its precondition (guard passes) before the defect, which is the meaningful discriminator.

## Acceptance IDs
LP0-01 to LP0-12, LP0-14 to LP0-18: test names as in the order, all passing (grant-freeze file for 01-09, 14-16, 18; authority-paths file for 10-12, 17; comparator fixtures in lp-0-catalog.test.ts). LP0-19: regression batches above, diff review pending. LP0-20: design note written, **independent review NOT recorded**. LP0-21: diff touches only listed files (check `git diff origin/main --name-status`); independent review pending.
**HELD:** LP0-13 (same-signature routine/helper/RLS change detection and its control; depends on the coordinator's Q2 ruling and any Ben authorisation) and LP0-22 (whole-task verdict/acceptance). Routine and RLS protection facts, static-scan hypotheses, policies and triggers are only RECORDED in the inventory; nothing compares them. The only definition comparison built is view definition digests (LP0-10) and live-vs-live digest equality across migrator replay (LP0-01); coordinator to say whether either touches the Q2 reservation.

## Measured inventory (landing base)
241 tables, 4 views, 0 sequences, 271 routines (177 reachable by a non-owner, 85 of them SECURITY DEFINER), 242 policies, 339 triggers. 1078 compared facts, 1079 reviewed entries (two role profiles). Runtime login: SELECT 201 tables + 4 views; INSERT 130 tables; UPDATE 6 tables + 28 columns; DELETE 6 tables; EXECUTE 99 routines (53 more by PUBLIC, 36 pgcrypto). 53 groups, 25 existing-exception groups (178 entries), 31 authority paths, 12 target-state statements, all five LP-13 items as explicit paths. Six M4-8-S allocation tables confirmed SELECT-only.

## Findings recorded (not fixed)
Exceptions are real today (demonstrated as the real role: membership insert; `transition_job` executable). PUBLIC TEMPORARY plus definers without `pg_temp` last (untested hypothesis); two SECURITY DEFINER trigger functions with PUBLIC EXECUTE; `evaluate_recovery_follow_ups` invoker routine without fixed search path; `ledger_balance` security_barrier view not security_invoker; runtime can execute pg_cancel_backend and related system functions (own role checks).

## Other disclosures
- Inventory classification is the builder's judgment from source inspection, assembled by a one-off script outside the repository; every group is for independent review. Static scans are hypotheses.
- The guard is default-deny: any later migration that gives the runtime login a new object or grant fails it until the inventory is reviewed. Lanes of other in-flight pieces do not list the inventory file; the coordinator needs a rule for that.
- Controls only create/drop objects in disposable test databases and clean up (verified, LP0-18). No existing test, pin, fingerprint, protected application file, script, lockfile or CI file edited.
- Shared-file overlap: lane register is additive one line; the coordinator's integration slot was not separately obtained by the builder.

## Remaining gates
Fresh Opus and Sol review of the exact commit; independent review of the design note before LP-5/LP-6a; Q2 ruling and LP0-13; separate acceptance; CI aggregate suites. Customer-data release remains blocked.
