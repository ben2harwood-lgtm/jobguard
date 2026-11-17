# M4-5-S — builder receipt, round 8

8 October 2026. PR #106, branch `codex/sandbox/m4-5-s-r2`, worktree `m4-5-s-fresh`.
Starting HEAD: `227341bf572d3b70ff9865eb780dc6bbb4a40985` (round 7), clean tree. The builder did not review or accept anything; no push, merge or PR change. The dispatcher binds CI and the independent verdict to the commit this round creates. Synthetic data only. No assertion was weakened, skipped or removed, and no test timeout was added or lengthened.

Addresses the independent Opus REPAIR at `227341b` ([comment 6050261387](https://github.com/ben2harwood-lgtm/jobguard/pull/106#issuecomment-6050261387)) and the open GPT-6.1 Sol pre-check (`m4-5-s-solcheck-20261007T232428.md`). Migration `0099_recovery_messages.sql` is **unchanged** (no migration change was needed).

## 1. P2-1 — a failed "Check outcome" no longer jams the message

**Cause (confirmed).** `reconcile` commits a `reconcile_started` event in one transaction, then asks the practice provider and records the answer in later ones. If the process dies in between, the outbox stays `outcome_unknown` and the history stops at `reconcile_started`. A fresh click has a new command id (the browser makes one per click), found `reconcile_started` as the last event, and was refused with `RECOVERY_MESSAGE_EXECUTION_PENDING` forever. Only a replay of the lost original id could resume it.

**Design of the takeover** (`packages/db/src/recovery-message-repository.ts`, `reconcile`, first transaction):

1. The rule is the one the code already uses for an abandoned executing claim: `STALE_EXECUTION_MS` (five minutes). The age of the last `reconcile_started` event is read in SQL (`created_at < clock_timestamp() - STALE_EXECUTION_MS`), so it uses the database clock and the one constant.
2. Last event is `reconcile_started` and **younger** than five minutes: a check may still be running, so a fresh command is refused with `RECOVERY_MESSAGE_EXECUTION_PENDING`. The refusal rolls back, so it leaves no receipt, event or audit row.
3. Last event is `reconcile_started` and **older**: the check is abandoned. In the same transaction the fresh command appends `outcome_unknown` (the answer was never learned) and then its own `reconcile_started`, each with its audit record, in one audit batch. The shared guards in 0099 allow `reconcile_started` only after `outcome_unknown`, so the takeover uses that existing legal sequence and the database guarantees stay exactly as they were.
4. The rest is unchanged: after the commit the practice provider is **asked** (read-only) what it recorded, and the result is recorded once (`reconciled`, or `retryable` for "no record", through the existing `finishHistory`). The check never sends; the delivery attempt count does not change.
5. The same fence as before still holds: the case lock serialises two simultaneous fresh checks, and the loser fails `RECOVERY_MESSAGE_STALE_REVISION`. If the original check was merely slow and wakes after a takeover, its outbox update is guarded by `status='outcome_unknown'` and the history append by the revision check, so nothing is recorded twice.
6. A replay of the abandoned original id still resumes it (`isReplay` runs before the age rule, and still accepts `reconcile_started` and `outcome_unknown` as first events), and a replay of a takeover's own id works the same way. Replays of either id after the takeover finished return the settled state and write nothing.

The browser needs no change: it already makes a fresh id per click and sends the revision it last read. A click inside the window shows the existing "still in progress, refresh shortly" message; a click after it finishes the check.

## 2. Red / green evidence

New `describe('a fresh check finishes an abandoned reconcile without resending (round 8, Opus P2-1)')` in `packages/db/test/recovery-messages.integration.test.ts`, real PostgreSQL 16, all migrations through 0099, the real non-owner runtime role. The fault is a one-shot trigger on `app.action_outbox` that raises when the check records its answer (`outcome_unknown` to `succeeded` or `retryable`), which is exactly "the provider check fails after `reconcile_started` is saved"; the test removes it afterwards (the same injection technique as the P2-5 suite). The window is crossed by ageing the `reconcile_started` row with the admin connection (nothing waits five minutes).

Seven tests:

1. Within the window, two fresh checks are refused (`RECOVERY_MESSAGE_EXECUTION_PENDING`) and write nothing (all write counts equal, no command receipt). After the window, a fresh check from a reloaded read completes: status `simulated_delivery`, history `…, reconcile_started, outcome_unknown, reconcile_started, reconciled`, one `reconciled` event and audit record, one sink row, still one delivery attempt. Replays of the original and the takeover id write nothing; a further check is `NOT_RECONCILABLE` (no longer stuck).
2. The same with "no provider record": one `retryable`, no sink row, one attempt (the check did not resend); then a normal advance delivers (2 attempts, 1 sink row).
3. Control: the original command id still resumes its own check inside the window with no takeover events (`…, reconcile_started, reconciled`).
4. A takeover that itself fails is resumed by its own id; a fresh id is refused while that takeover is recent.
5. A second takeover after the first is also abandoned (`…, outcome_unknown, reconcile_started` twice, then `retryable`).
6. An abandoned check that began from an abandoned executing claim (both commands then hold an `outcome_unknown` of their own) is also taken over; this checks the `(command_id, kind)` uniqueness holds.
7. Two simultaneous fresh checks: exactly one succeeds, the other fails `RECOVERY_MESSAGE_STALE_REVISION`; one `reconciled`, one audit record, one sink row, one attempt.

**Red on `227341b`** (the repository file restored to `227341b` and the new tests run against it, then the fix put back):

```
pnpm exec vitest run --maxWorkers=1 test/recovery-messages.integration.test.ts -t "round 8"   (exit 1)
 × refuses a fresh check inside the window, then lets one take over, finish and record the answer exactly once
 × finds no provider record after a takeover, offers one safe retry and never resends by itself
 × lets a takeover that itself failed be resumed by its own id, and refuses a fresh id while it is recent
 × lets a later fresh check take over again when the first takeover is also abandoned
 × also takes over an abandoned check that began from an abandoned delivery claim
 × lets exactly one of two simultaneous fresh checks take over
 Tests  6 failed | 1 passed | 80 skipped (87)
```

Test 1 fails at the first fresh check after the window with `RecoveryMessageError: RECOVERY_MESSAGE_EXECUTION_PENDING` thrown from `recovery-message-repository.ts:305` (the exact line the reviewer named); the in-window refusals before it pass. The one passing test is the replay-of-the-original control (test 3), which worked before and must keep working.

**Green with the fix:** the same command, `Tests 7 passed | 80 skipped (87)`, and the whole file 87/87 (below).

## 3. P3 and housekeeping

- **Sol P2-2 / Opus P3-1 — recorded as a follow-up, not built.** An expired, never-started approval that a direct executor run cancels leaves the history and audit at `approved` while the outbox is `cancelled` (status already shows `blocked`). The reviewer judged it unreachable in the product: the application's own advance records `blocked` and its audit itself, and the deployed worker (`apps/api/src/worker.ts`) has only the `fake_capture` adapter, so the executor returns before its expiry check for this action. Nothing is stuck (a replacement preview is allowed). Suggested later fix, if the worker ever gets this adapter: let `finishHistory` append `blocked` (with the executor audit) when history ends at `approved` or `retryable` and the outbox is `cancelled` without a revocation, with a PostgreSQL regression for expiry before any attempt.
- **`packages/db/MIGRATIONS.md`** (wording only, no SQL block touched; the suites that read pre-deploy queries from this file pass):
  - the CH-2 sentence "0096 is registered last, after 0053. The file count remains 45." now says 0096 is registered after 0095 and before 0099 and that `migrate.ts` is the authority for order and count;
  - the 0099 intro now lists 0053, 0054, 0094, 0095 and 0096 as merged (it said "0054–0098 remain allocated elsewhere");
  - the proof sentence says the upgrade suite starts from a real database through 0096 (it said "real 0042 database");
  - "Until 0043 and 0044 merge, the migration list has a numbering gap" became a neutral note that gaps are harmless;
  - one sentence records the takeover rule above next to the existing abandoned-claim note.
- **Not done by the builder:** the PR description refresh (Opus P3-3) is the integrator's; the shared-status-table tidy (P3-4) is optional and was left alone.

## 4. Known edge (unreachable today, recorded for honesty)

If the practice provider's check ever answered `unknown`, a takeover or a stale-claim check would try to record `outcome_unknown` a second time under the same command id and meet the `(command_id, kind)` uniqueness. The fake adapter answers `unknown` only for a malformed effect key, which `appendOutboundAction` never produces, and the stale-claim path already had this shape before this round. The failure mode is a rolled-back transaction, not a corrupt or stuck record: the history stays at `reconcile_started`, which the new rule lets a fresh check take over after the window.

## 5. Files changed

`packages/db/src/recovery-message-repository.ts`, `packages/db/test/recovery-messages.integration.test.ts`, `packages/db/MIGRATIONS.md`, and this receipt. All inside the `m4-5-s` lane; `config/agent-lane-assignments.json` is not touched.

## 6. Commands and exits

Node 24.17.0, pnpm 10.28.1. Embedded PostgreSQL started without any symlink repair. Port 3000 and the Playwright ports were not used.

| Command | Exit | Evidence |
|---|---:|---|
| `vitest run … -t "round 8"` against `227341b` source | 1 | 6 failed, 1 passed (red, section 2) |
| `vitest run … -t "round 8"` with the fix | 0 | 7 passed |
| `pnpm typecheck` | 0 | 7/7 tasks |
| `pnpm build` | 0 | 7/7 tasks |
| `pnpm exec vitest run src` in `apps/api` | 0 | 24 files, 582 passed |
| `pnpm exec vitest run` in `apps/web` | 0 | 14 files, 124 passed |
| `recovery-messages`, `recovery-message-upgrade`, `recovery-message-repository`, `watchdog-legacy-identities`, `watchdog-migration-owner` (real PostgreSQL) | 0 | 5 files, 125 passed |
| `pnpm test` in `packages/db` (every PostgreSQL suite) | 0 | 57 files, 602 passed (round 7: 595; the 7 new tests) |
| `node --test tools/*.test.mjs` | 0 | 42 passed |
| Lane lint with simulated pull-request metadata | see hand-off message | A commit cannot contain its own SHA, so it is run against the committed head after this receipt is committed |

## 7. Not run

Browser execution of `M4-5-S.spec.ts` (CI runs it in both projects; the browser and `apps/web` are unchanged this round, so no new browser step was added). No new independent verdict or acceptance is claimed.
