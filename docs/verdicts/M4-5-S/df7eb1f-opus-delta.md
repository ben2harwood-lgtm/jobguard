VERDICT: PASS — bound to head df7eb1f3aa2261e79ea799ce5fd8666b78fe908b
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (8 Oct 2026); did not build, repair or order any commit in this PR.

**In short:** Both round 10 fixes are correct and complete. Last round's blocker (P2-1) is gone. An old "Check outcome" request, replayed after a retry came back uncertain, now just returns the current state: it makes no provider call and writes nothing, and the message stays usable. I reproduced last round's stuck case on real PostgreSQL at this head and it no longer sticks.

The panel now refuses a malformed successful answer instead of crashing. Real server answers still pass its check: I ran 18 real PostgreSQL answers, covering every message status and every readiness reason, through it, and all were accepted as they came.

Round 8's takeover and Ben's "a replay returns current state" ruling still hold. CI is fully green on this exact commit, including both browser projects. Nothing outside the five round 10 files changed. One new small finding (P3-1, a letter-case slip in the new condition) is not blocking.

This is a delta review on top of the last verdict, REPAIR at `50f71cc` ([comment 6051647676](https://github.com/ben2harwood-lgtm/jobguard/pull/106#issuecomment-6051647676)). The delta is one commit, `df7eb1f` (Sonnet round 10). Main has not moved since (`origin/main` = `df1f9c1`), so no new merge needed checking. The verdict below is for the whole PR at `df7eb1f`.

## Findings

### P1: none. P2: none.

### P3 (not blocking)

1. **New: the new replay condition compares command ids with exact letter case** (`packages/db/src/recovery-message-repository.ts:291`, `last.command_id !== input.commandId`).
   - **Why it slips:** `command_id` is a `uuid` column, so PostgreSQL hands it back in lower case. `input.commandId` is not lower-cased anywhere: zod's `.uuid()` accepts upper case, and neither `recoveryMessageCommandV1` nor the application or repository normalises it. The request hash is built from the same spelling, so a verbatim upper-case replay still passes `isReplay`.
   - **Effect:** an API caller that sends an upper-case command id cannot resume its own interrupted check by replaying it. The replay returns current state, and a fresh check can take over once the 5-minute window has passed. Nothing gets stuck, nothing is sent twice and nothing is written. The browser is unaffected, because `crypto.randomUUID()` is lower case.
   - **Evidence:** source inspection, plus `z.string().uuid()` accepting an upper-case id in node. My PostgreSQL probe for this (D2) could not run (see "What I executed").
   - **Fix (one line):** compare `input.commandId.toLowerCase()`, or put `AND command_id=$3` in the SQL. Any later round can take it.
2. **Carried, still only in builder receipts:** these are recorded only in `BUILDER_RECEIPT_round8.md` and `BUILDER_RECEIPT_round10.md`. The integrator should add them to the `BUILD_PLAN.md` §14.3 follow-up table, which is in this lane.
   - round 8 Sol P2-2;
   - closed "no recovery" cases can still be messaged (probe B4 last round; possibly Ben's call);
   - `app.reverse_synthetic_landing` takes no case lock (main's 0018, outside this lane);
   - `evidence-packs.tsx:32,58` still adopts a 200 answer unchecked (merged M4-3-S code).
3. **Carried:** `recovery-message-upgrade.integration.test.ts:19,38` hard-code the `0099_` prefix. A renumber makes the test fail loudly, not silently; update both lines at renumber time.
4. **Minor wording:** the "answer could not be read" sentence (`recovery-messages.tsx:80`) tells the user to choose "Refresh saved messages", but the panel has already re-read. It is harmless and honest ("may or may not have been saved").
5. **Pre-existing, source-level observation, not executed:** two verbatim replays of the same still-open check sent at the same moment can both ask the provider (as before round 10). The provider question only reads, and the answer is recorded once. The slower caller may get a typed `STALE_REVISION` or `NOT_RECONCILABLE` rather than current state. This is narrow, and no browser path reaches it.

## Delta checks

### Fix 1: replay resumes only its own open check. Correct and complete.

`reconcile()`'s replay branch (`:283-292`) now resumes only when three things hold:
- the outbox is still `outcome_unknown`;
- the newest event is `reconcile_started`;
- that event carries this command's id.

Otherwise it returns `{ replayed: true }`, which means no provider call and no write. The resumed revision is `last.revision`, the same value as the old `revisionOf()`, because both are the max revision.

**Can it refuse a legitimate resume?** Only for the letter-case slip above. While the original's check is open, nothing else can add an event:
- advance is refused with `RECONCILE_REQUIRED`;
- revoke is refused;
- a fresh check inside the window is `EXECUTION_PENDING` and writes nothing;
- `finishHistory` appends nothing when the newest event is `reconcile_started` and the outbox is unknown (`:490-493`).

So the only events that can follow are the check's own answer, which closes it, or a takeover after 5 minutes, which then owns the check.

**Can it let two checks run?** No new way. The condition strictly narrows the old resume branch. It also removes one concurrent check the old code allowed: a replay of the abandoned original while a takeover is running. The two remaining concurrent cases were already accepted in round 8:
- an original still alive past the window alongside a takeover;
- simultaneous verbatim replays of the same open id.

In both, the provider question only reads, the outbox update is guarded by `status='outcome_unknown'`, and the history is appended once under the case lock.

**Paths that must still resume, and do:**
- the original resuming its own open check;
- a takeover resuming its own id;
- the stale-claim path (both events written by one command; my probe D5).

All 7 round 8 tests and the "current-state replay contract" tests pass in CI.

**The builder's 4 new PostgreSQL tests:**
- they spy on `FakeRecoveryMessageAdapter.prototype.reconcile`;
- they cover last round's probe C1 shape, plus "still unknown, then replay";
- they assert no provider call, unchanged write counts, history, audits and outbox;
- they check typed refusals with no `23514`/500;
- they show a fresh check, then a retry or a revoke, working afterwards.

All 4 pass in CI.

### Fix 2: the panel checks answers before using them. Correct, and it accepts every real answer.

`usableMessageState` (`recovery-messages.tsx:40-56`) is applied to both the read (`:104`) and the command answer (`:137`). It requires:
- the `recovery-message-response.v1` wrapper;
- this case's id, on the answer and on every message;
- every field the screen reads.

Status and history kinds are checked against the core label tables, whose keys are the complete `RECOVERY_MESSAGE_STATUSES` and `RECOVERY_MESSAGE_EVENT_KINDS`. Those match 0099's `kind` check exactly.

The object schemas are not strict, so fields the server adds are tolerated, and the original body is adopted unchanged. A refusal body that is `null` or not an object becomes a plain fallback code. On an unusable answer the last good state is kept, `busy`/`loading` are released, and the existing re-read still runs.

The version literal is pinned on the web side and by the API's own test (`recovery-message.application.test.ts:64`). `zod` is already a web dependency.

## Whole-PR state
- **Diff since `50f71cc`:** exactly 5 files:
  - the repository;
  - its integration test (only an import line and an appended block);
  - `recovery-messages.tsx`;
  - its unit test (the react mock now records state writes and effects instead of ignoring them, then an appended block; no earlier assertion changed);
  - `BUILDER_RECEIPT_round10.md`.
- **Not touched:** migration `0099` is byte-unchanged, and neither the lane registry nor `BUILD_PLAN.md` was touched.
- **Last round's whole-PR conclusions** (merge `6706505`, the 0097 snapshot alignment, the upgrade fixture, the `recovery-cases.tsx` behaviours) are unaffected by this delta and still stand.
- **PR description:** now current.

## CI on `df7eb1f` (run [37725142371](https://github.com/ben2harwood-lgtm/jobguard/actions/runs/37725142371), log read)
- **`checks` passed** (19m45s):
  - typecheck 7/7.
  - lint: lane `m4-5-s` passed, base `df1f9c1`, head `df7eb1f`.
  - `pnpm test`: core 55 files / 1616; api 25 / 663; web 20 / 434; DB **57 files / 662**, which is last round's 658 plus the 4 new tests. Within that: recovery-messages 98, recovery-message-upgrade 3, recovery-message-repository 9.
  - Production build passed.
  - **Browser: "Running 264 tests using 1 worker … 264 passed (13.4m)"**. This includes the M4-5-S spec, which drives the real panel through the real routes, so the new check accepts real answers in a real browser.
- `dependency-review` and `secrets` passed. Vercel was skipped by the ignored-build step.

## What I executed
Worktree `/private/tmp/opus-m4-5-s-50f71cc-0810`, re-used and detached at `df7eb1f`. Disk was 37–39 GB free, so per the order there was no install and no `pnpm build`.

| Command | Exit | Result |
|---|---:|---|
| `pnpm typecheck --force` | 0 | 7/7 |
| `node tools/lint.mjs` with a simulated `pull_request` event (base `df1f9c1`, head `df7eb1f`, ref `codex/sandbox/m4-5-s-r2`) | 0 | core purity; lane `m4-5-s` passed; money boundary |
| `apps/web` `vitest run` | 0 | 20 files, 434 passed |
| `heavy-slot` real PostgreSQL 16 reviewer probes, run 1 | 1 | D1, D5 and E1 passed; D2–D4 failed in my own helper (it read the error code `XX000` instead of the message), not in the product |
| same, run 2 (after fixing the helper) | 1 | could not start: `initdb` failed because all 32/32 SysV shared-memory segments are taken by orphaned segments (attach count 0, creators dead). Per the brief I did not clear them or loop |
| web probe: the 18 real answers dumped by E1, run through `usableMessageState` | 0 | 19 passed. Every answer is accepted as the same object and refused for another case id |

**Probe results (real PostgreSQL, all migrations, real non-owner runtime role):**
- **D1 (last round's C1, re-run at this head):**
  - the replay answers `ok:outcome_unknown`;
  - **0 provider calls**, the outbox stays `outcome_unknown`, write counts are unchanged;
  - a fresh check gives `retryable`, then a retry gives `simulated_delivery` (1 sink row, 3 attempts).
- **D5:** the stale-claim path's own replay still resumes (`retryable`).
- **E1:** dumped real answers for:
  - every status: previewed (customer and merchant), queued, executing, claim abandoned, outcome unknown (with and without a sink row), retryable, delivered, reconciled, revoked, blocked, failed after retries, changed since review;
  - every readiness reason: no pack, pack not approved, prevention case not eligible, and ready with no message.

Probe files and notes are in the integrator scratchpad under `m45s-r10/`, and nothing was left in the tree.

## Relied on CI for
- the builder's 4 new and the 7 round 8 PostgreSQL tests;
- the full DB suite;
- the production build;
- both browser projects.

## Not verified
- My concurrency probes D3 (a replay of the original while a takeover is inside the provider) and D4 (two simultaneous replays), and the letter-case probe D2. They were blocked by the machine's shared memory; my conclusions on them rest on source reading.
- I did not run browser suites locally.
- No live providers, real data, spending, deployment or merge.

