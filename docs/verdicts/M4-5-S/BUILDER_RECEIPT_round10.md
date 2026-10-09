# M4-5-S — builder receipt, round 10 (repair of the fresh Opus REPAIR verdict at 50f71cc)

8 October 2026. PR #106, branch `codex/sandbox/m4-5-s-r2`, worktree `m4-5-s-fresh`.
Starting HEAD: `50f71cc8f46502240a8cf49d56f65150d48b704d`, clean tree. The builder did not review or accept anything; no push, merge or PR change. Synthetic data only; no live provider, spending, real send, production mode or decision approval. No assertion was weakened, skipped or removed, and no test timeout was added or lengthened. No merged migration (0000–0097) was edited, and **migration `0099_recovery_messages.sql` is unchanged** (the fix is in the repository code only; no database rule needed to move). `config/agent-lane-assignments.json` and `BUILD_PLAN.md` are not touched. Rounds 1–9 and Ben's "a replay returns current state" ruling are kept.

Verdict being repaired: fresh Claude Opus REPAIR bound to `50f71cc` (PR #106 comment 6051647676), plus its P3 on Sol's malformed-answer finding.

## Fix 1 — P2-1: an old "Check outcome" replayed after a retry cycle resumed a check it did not own

**Cause.** `packages/db/src/recovery-message-repository.ts`, `reconcile()`, replay branch: a replay of a check command resumed (asked the provider and recorded the answer) whenever the delivery record was `outcome_unknown`, whichever attempt that uncertainty belonged to. Replaying check C1 after the message had been retried and gone uncertain again asked the provider about attempt 2 under C1's id, flipped the delivery record to `retryable`, and wrote no history (the newest event, `outcome_unknown`, is not one `finishHistory` maps). Migration 0099's history guard then refused every way forward, and the raw `23514` rule error reached the API as HTTP 500.

**Change.** The replay now resumes only while that command's own check is still open: the message's newest event must be `reconcile_started` **and** carry this command's id (and the delivery record must still be `outcome_unknown`, as before). Otherwise the replay returns current state with no provider call and no write, exactly as the advance replay already does with its `started` event. The resumed revision is that event's revision.

What still resumes (all existing tests, unchanged): the original id resuming its own open check; a takeover's own id (its newest event is its own `reconcile_started`); the stale-claim path (`outcome_unknown` and `reconcile_started` written together by the same command). A check that already recorded its own "still unknown" answer is no longer re-run by a replay (new test 4 below); a fresh click, which has a new id, is what asks again.

**Tests first.** Four new real-PostgreSQL tests in `packages/db/test/recovery-messages.integration.test.ts`, `describe('an old check request replayed after a retry cycle returns current state (round 10, Opus P2-1)')`, shaped like the reviewer's probe C1 (real PostgreSQL 16, all migrations, the real non-owner runtime role). "The provider is not called" is asserted with a spy on `FakeRecoveryMessageAdapter.prototype.reconcile` (the only provider check). The file's import line gained `afterEach` and `vi` (no other change to existing code).

1. Returns current state for the old check: two replays equal the current state, the provider is not asked, the delivery record is still `outcome_unknown`, the stored history and audit types are unchanged, `writeCounts()` (decision, authorization, receipt, outbox, approval, event, audit) is unchanged, 2 attempts, 0 sink rows; reusing the id with a different `expectedRevision` is still `RECOVERY_MESSAGE_COMMAND_CONFLICT`.
2. The message stays usable: after the stale replay, advance is the typed `RECOVERY_MESSAGE_RECONCILE_REQUIRED`, revoke is the typed `RECOVERY_MESSAGE_NOT_REVOCABLE`, a replacement preview is `RECOVERY_MESSAGE_EXISTING_EFFECT` (no `23514`, no 500); a fresh check asks the provider exactly once, records `retryable`; one advance then delivers (3 attempts, 1 sink row, delivery record `succeeded`); the old request afterwards returns the delivered state and sends nothing more.
3. The owner can revoke after a fresh check: `revoked`, delivery record `cancelled`, 0 sink rows.
4. A check whose own answer was "still unknown" (the provider answer injected through the same spy): recorded once, a replay of it returns current state with the provider asked only once and nothing written; a fresh check then settles it to `retryable`.

**Red on `50f71cc`** (source unchanged, new tests added):
```
pnpm exec vitest run --maxWorkers=1 test/recovery-messages.integration.test.ts -t "round 10"        (exit 1)
 Tests  4 failed | 94 skipped (98)
 × returns current state for the old check …      expected status "outcome_unknown", received "retryable"   (the reviewer's C1 result: the delivery record flipped by the replay)
 × leaves the message usable …                    expected 'RECOVERY_MESSAGE_RECONCILE_REQUIRED', received '23514'   (the raw database rule error)
 × lets the owner revoke after a fresh check …    RECOVERY_MESSAGE_NOT_RECONCILABLE   (the message was stuck)
 × returns current state for a check whose own answer was "still unknown" …   expected "outcome_unknown", received "retryable"
```
**Green after the change:**
```
pnpm exec vitest run --maxWorkers=1 test/recovery-messages.integration.test.ts test/recovery-message-upgrade.integration.test.ts test/recovery-message-repository.test.ts   (exit 0)
 Test Files  3 passed (3)    Tests  110 passed (110)
```
(`recovery-messages` 98 = 94 + 4 new; every round 8 takeover test and the "current-state replay contract" tests pass unchanged.)

## Fix 2 — Sol's malformed-answer finding (P3): a 200 answer that is not a usable answer crashed the panel

**Cause.** `apps/web/app/ui/recovery-messages.tsx` adopted the JSON of a 200 read (`load`) and of a 200 command answer (`act`) unchecked: `{}` became state, and the render then threw on `state.readiness` (and `body.code` threw on a `null` refusal body).

**Change (same file, lane allow-list).** No response schema is exported to the web (the API package exports none for messages, and `apps/api/package.json` is outside the lane), and the lane allows no new file, so the check is a local zod schema in `recovery-messages.tsx`, applied to both paths before `adopt`:
- `usableMessageState(body, caseId)` (exported for tests) accepts a body only if it is the `recovery-message-response.v1` wrapper (the literal is pinned here and by the API's existing `toMatchObject({ version: "recovery-message-response.v1" … })` test), names **this** case (`caseId`, and every message's `message.caseId`), and carries every field the panel reads: `readiness` (eligible, reason, caseRevision, packId), `messages` and `latest` (id, revision, a status and history kinds the panel has words for, the three flags, `message` amount/sender/recipient/body/hashes/packId, `attachment` packRevision and sources, `approval`, `history`), `sink` rows, `sinkCount`, and `realExternalActions` equal to 0. The checked body is adopted as it came, not the parsed copy.
- An unusable read raises a plain sentence: "The saved messages could not be read, so they were not used. The last good view is kept. Choose Refresh saved messages to try again." An unusable command answer: "The server's answer to that action could not be read, so it was not used. The action may or may not have been saved. Choose Refresh saved messages to see what is recorded before trying again." The last good state is not touched, `loading` and `busy` are released in `finally`, and the existing re-read after any command failure still runs, so a usable re-read shows what is saved.
- A refusal body that is `null` or not an object is a plain failure (`refusalCode`), never a JavaScript error.

**Tests first.** `apps/web/app/ui/recovery-messages.test.tsx`, `describe('a malformed successful answer is refused, not adopted (round 10)')`. The file's react mock now also records state writes and the effects asked for (the earlier tests ignore both); the panel's own `load` effect and its "Check outcome" and "Preview factual message" button handlers run against a stubbed `fetch`. 25 malformed bodies run on **both paths** (50 cases): `{}`, `null`, a string, a list, the wrong version, no version, another case's id, no case id, a message of another case, no readiness, a readiness without `packId`, messages that are not a list, no `latest`, `latest` without message / amount / attachment / sources / history / revision, an amount that is text, a status or history kind the panel has no words for, no sink, a text sink count, and a non-zero count of real external actions. Each asserts: nothing adopted (no state or draft write), a plain sentence set (no `TypeError`, `Cannot read`, `undefined`), the last good state still rendered, and "Refresh saved messages" not disabled. Also: a usable re-read after an unusable command answer is adopted and the sentence stays; a preview with an unusable answer; a `null` refusal body on both paths; and a control that a usable answer is adopted and clears the error on both paths. No assertion in the earlier tests changed.

**Red on `50f71cc`** (component restored to the committed version for the run, then put back):
```
pnpm exec vitest run app/ui/recovery-messages.test.tsx        (exit 1)
 Tests  53 failed | 31 passed (84)     e.g. "expected [ {} ] to deeply equal []" (the `{}` answer written into state), "expected [ null ] to deeply equal []", "vi.fn() to be called 2 times, but got 1" (the throw stopped the re-read)
```
**Green after:** `Tests 84 passed (84)`; whole web suite `20 files, 434 passed`.

**Real server answers pass the new check.** One throwaway test (moved to the scratchpad, not committed) dumped nine real `RecoveryMessageState` answers from the real PostgreSQL suite (no messages, previewed, queued, outcome_unknown, retryable, delivered, revoked, blocked, supplier case), wrapped them with the API's `version`, and ran them through `usableMessageState`: all accepted as they came, and all refused for another case id.

## Item 3 — recorded, not built

- **Closed "no recovery" cases can still be messaged** (old behaviour, Opus probe B4): the readiness and the guards do not read the case's state, so a case closed as `closed_no_recovery` with money outstanding is `eligible` and previews a message. Follow-up for the `BUILD_PLAN.md` §14.3 table; whether closed cases may be messaged may be Ben's call.
- **Main's 0018 landing-reversal routine** (`app.reverse_synthetic_landing`) takes no case advisory key, so it does not wait for a delivery that holds the sink (Opus probe B2). The outcome is still consistent (the sink guard compares the amount at insert time; a reversal orders after the delivery). Outside this lane.
- **Round-8 Sol P2-2 follow-up** belongs in the `BUILD_PLAN.md` §14.3 follow-up table. That is the integrator's job; this receipt and `BUILDER_RECEIPT_round8.md` are the only places it is recorded until then.
- **The upgrade test hard-codes the `0099_` prefix** (`recovery-message-upgrade.integration.test.ts`, lines 19 and 38). A renumber makes it fail loudly, not silently; update both lines at renumber time.
- Also from the verdict, untouched: `evidence-packs.tsx` (M4-3-S, merged code) adopts a 200 answer unchecked in the same way (`setPacks(body.packs)`); record it in §14.3 or give it the same check later. And the open panel keeps the old amount after an approved landing elsewhere until its next action (P3, server is safe).

## Commands and exits

Node 24.17.0, pnpm 10.28.1, embedded PostgreSQL 16 (its dylib links were already in place; `initdb` ran). All database runs `--maxWorkers=1`; machine load average was 50–70 throughout.

| Command | Exit | Result |
|---|---:|---|
| `vitest run --maxWorkers=1 test/recovery-messages.integration.test.ts -t "round 10"` on `50f71cc` source | 1 | 4 failed, 94 skipped (red, reasons above) |
| same three-file db run after the fix (`recovery-messages`, `recovery-message-upgrade`, `recovery-message-repository`) | 0 | 3 files, 110 passed |
| `apps/web` `vitest run app/ui/recovery-messages.test.tsx` on the committed component | 1 | 53 failed, 31 passed (red) |
| same file after the fix | 0 | 84 passed |
| `pnpm typecheck` | 0 | 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` (core purity, lane boundary, money boundary, tsc) | 0 | 7/7 tasks; run before the commit and again on the committed head (lane `m4-5-s` passed with this receipt among the changed files, base `df1f9c1`) |
| `apps/web` `vitest run` (whole suite) | 0 | 20 files, 434 passed |
| `apps/api` `vitest run src` | 0 | 25 files, 663 passed |
| `packages/core` `vitest run` | 0 | 110 files, 3232 passed |
| `apps/api` `pnpm openapi:check` | 0 | no drift (`apps/api/openapi.json` unchanged; no API surface changed) |
| `node --test tools/*.test.mjs` | 0 | 42 passed |

## Not run, and why

- **`pnpm build` and a second pass of the full database suite were not run.** `df -h /` showed 43 GB free at the start, 41 GB before the database runs above, and 39.7 GB (39.56 GB at the end) by the time the lighter checks finished; the order says to stop under 40 GB free. Nothing this builder started holds disk (embedded PostgreSQL's temp directories are removed by the suite); free space was falling because of other work on the Mac. The database change was proven by the three-file run above (done at 41 GB); the web change is covered by typecheck and the whole web suite; a production build, the other database suites and the browser specs are left to CI after the integrator pushes. `playwright` was not run locally.
- No independent verdict or acceptance is claimed. The reviewer's probe file was not committed.

## Files changed

`packages/db/src/recovery-message-repository.ts`, `packages/db/test/recovery-messages.integration.test.ts`, `apps/web/app/ui/recovery-messages.tsx`, `apps/web/app/ui/recovery-messages.test.tsx`, and this receipt. All are in the `m4-5-s` lane allow list.
