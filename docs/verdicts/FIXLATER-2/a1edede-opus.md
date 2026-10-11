VERDICT: PASS — bound to head a1edede7111b0aeb327276470c28a870e7589602
Reviewer: Claude Opus 5.5, fresh independent reviewer (did not build the change or write its order). Read-only; no test run on this Mac; GitHub CI is the test evidence.
Lane: AMBER — nothing here is really RED: 8 files, all on the order's allow list (lane file, receipt, 4 test files, 2 record documents); no file under src/ or migrations/.
Identity: worktree HEAD = PR #135 head = a1edede7111b0aeb327276470c28a870e7589602; merge-base = origin/main bbca5ca5ee55a6a4d7fcdf89de426195d28c3e27; one commit.

## Items
1. MET. Upgrade test: `const port = await freePort(61400, 200);` — same base 61400, same span 200; the only other change is adding `freePort` to the existing import. `pool-test-utils.ts` untouched.
2. MET. One line `await new Promise<void>(resolve => setTimeout(resolve, 25));` at the top of the "Round 1 B" `while (!blocked)` loop. No timeout, no assertion changed; the "retry finished without waiting" fail-fast branch is intact. The comment above the loop was reworded because "No sleeps" would now be untrue.
3. MET. `it.each` gains `succeeded`, `retryable`, `dead_letter`. Each is built like the neighbouring `executing` row: approve the reminder through the merged repository, then set the outbox status on the migration-owner connection. All three are legal `action_outbox` statuses (0006 CHECK). Three added assertions pin the state: 1 approval row, 0 sink rows (= not recorded as delivered), outbox status as set. Both existing refusal lines (repository `schedule`, raw runtime INSERT) are unchanged and expect `RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED`. True against merged code: the 0115 guard and the repository `sourceMessage` both block the delivered source whenever a later approved attempt's outbox status is anything but `cancelled`, and the later message has no sink row. Not vacuous: a guard that only blocked in-flight states would fail these rows.
4. MET. (a) New same-instant case stamps case and settlement to one microsecond instant, asserts the database sees them equal (exactly one row, `same_instant:true`), then expects excluded, 0 pence, "Paid before you opened this case" — matches 0119 line 102 (`e.created_at<=c.created_at`); under `<` the F20 review would be refused, so the test discriminates. (b) Wrong-case probe: a second case on the SAME job, review belongs to the first case, expects `23503` — matches the 4-column key `(tenant_id,job_id,case_id,review_id)` at 0119 line 30; a savepoint keeps the existing wrong-job probe byte-identical. (c) Five exact codes added AFTER the existing checks, none replaced: `42501` (guard line 63, plain runtime pool has no practice digest/environment), and `23514` four times (every `ELIGIBILITY_FIXTURE_MISMATCH` / `ELIGIBILITY_LINES_REQUIRED` raise in 0119, including the v1-refusal trigger line 168). (d) Header comment corrected.
5. MET. Busy port now comes from listening on port 0 and KEEPING that listener open (closed in `afterEach`), removing the close-then-reopen gap. The `expect(await freePort(taken, 2)).toBe(taken + 1)` loop line is byte-identical. Still proves the skip: `freePort` picks at random between the busy port and its neighbour; without the skip it would return the busy port about half the time across 20 tries.
6. MET. Names checked against 0119: `practice_feed_event_job_identity UNIQUE(tenant_id,job_id,id)` on `app.practice_feed_event` (line 7); trigger `recovery_eligibility_v1_duplicate_payment_refusal` BEFORE INSERT on `app.recovery_eligibility_revision`, function `app.refuse_v1_eligibility_for_duplicate_payment()` (lines 165–172), refusing when the case type is `duplicate_supplier_payment`. MIGRATIONS.md change is inside the 0119 section only; the contract gains one sentence.
Lane line: one line added in name order between `fixlater-1` and `harden-signin`; no other line touched.

## Removed-lines proof (`git diff bbca5ca...HEAD -U0 -- packages/db/test | grep '^-' | grep -v '^---'` → 7 lines)
1. free-port `const occupy = … Promise<void> …` — set-up helper, now returns the bound port. Not an expect.
2. free-port `const taken = await anyFree(); await occupy(taken, "127.0.0.1");` — set-up. Not an expect.
3. eligibility-v3 header comment "…NOT RUN in the builder sandbox." — item 4(d). Comment.
4. upgrade test import line — adds `freePort`. Import.
5. upgrade test `const port = 61400 + Math.floor(Math.random() * 200);` — item 1. Set-up.
6. follow-up `it.each(["active","queued","executing","outcome_unknown"] …` — table/title line, re-added with three more rows (item 3). Not an expect.
7. follow-up comment "…No sleeps, test retries or extra timeout." — item 2. Comment.
Result: no `expect` line, expected value or timeout was removed or altered. No `.skip`, `.only`, `.todo` or retry added.

## Question (2)
Tests and records only — that is the whole answer: no route to wrong money, an access hole, lost or corrupted data or a broken main journey. No added test asserts anything false about the merged code, and none is vacuous: each new case pins its own set-up (status / sink count / same-instant) before asserting the refusal or result, and each was checked against the SQL it exercises.

## BLOCKING
None.

## LATER
- free-port: the neighbour port (busy+1) could still be held by something else on a runner, so a very rare flake remains; the second test ("gives up…") still closes then re-opens its port.
- Item 3 fixtures set only the outbox status column (no attempt count or error text); enough because the guard reads only status.
- MIGRATIONS.md 0119 paragraph still says its PostgreSQL tests are "NOT RUN in the builder sandbox", and the contract still says database verification and RED-lane review "remain outstanding" — stale, outside this order.
- MIGRATIONS.md: the new trigger sentence repeats what the "Round 1" sentence in the same section already says.
- The wrong-case probe leaves one bare extra case row on its own fixture job; harmless.
- Application-level `rejects.toThrow()` checks at lines 68–72 keep no code (not PostgreSQL-deterministic); reasonable to leave.

## CI evidence
Run 38167722589 (CI, pull_request), head sha a1edede7111b0aeb327276470c28a870e7589602: `checks` pass (23m35s), `dependency-review` pass, `secrets` pass; lane boundary passed for lane `fixlater-2` against base bbca5ca.
Job log 114553663755: `recovery-follow-up.integration.test.ts` 59 tests passed (main bbca5ca run 38166158858: 56 → +3); `recovery-eligibility-v3.integration.test.ts` 24 passed (main: 23 → +1); `recovery-follow-up-upgrade.integration.test.ts` 3 passed (main: 3); `free-port.test.ts` 2 passed (main: 2). No failed test file in the log.
Builder receipt is honest: database, socket and browser tests marked NOT RUN in the sandbox.
