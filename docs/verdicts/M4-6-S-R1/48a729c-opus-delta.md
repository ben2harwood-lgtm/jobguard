VERDICT: PASS — bound to head 48a729c5051390f680e85f8d51a392384d79677c
Reviewer: the same fresh Claude Opus agent (Opus 5.5) that reviewed fae8695; did not build or order this; did not read the Sol check.
Lane: RED. Scope: round-1 re-check only (fixes and regressions), `git diff c88c554 48a729c` (5 files), against the repair order M4-6-S-R1-r1-repair.txt.
BLOCKING: 0. LATER: 4 new (the 8 LATER items from the fae8695 verdict are unchanged and not re-reviewed).

## The merge c88c554
Parents are fae8695 and origin/main 530681c. The merge's change set is identical, patch for patch, to main's own changes since the base ff072c7 (FIXLATER-1, 11 files). It touched none of this piece's code. The one shared file, MIGRATIONS.md, changed only in the 0107 and 0110 sections, not the 0115 section.

## Fix A (my BLOCKING 1) — DONE as ordered
- Same rule in both places: 0115:30-31 and recovery-follow-up-repository.ts:458-459 now say a later message blocks only when it has an approval whose outbox action is not cancelled. A later message with no approval is ignored, as in 0112. Nothing else in either routine changed.
- Named tests exist (follow-up test, appended): cancel after an unapproved preview then schedule from message 1; unapproved preview, close, reopen, fresh run, schedule, review, exact approval, delivery; live follow-up with an open preview keeps ALREADY_ACTIVE and the delivered source id. Each would fail at fae8695 (the old rule refuses with MESSAGE_NOT_DELIVERED and a null source).
- The round-0 "active" row now expects ALREADY_ACTIVE; queued, executing and unknown-outcome rows still expect MESSAGE_NOT_DELIVERED, in the repository and in the raw SQL guard.
- MIGRATIONS.md sentence corrected.

## Fix B (the other checker's finding) — DONE as ordered
- repository.ts:181 takes the shared 'recovery-follow-up-audit' key before reading `clockAudited`; the optional clock entry is built under it.
- The two-connection test exists and is driven by PostgreSQL's own lock-wait view, with no sleeps or timeouts. Its starting state is built by restoring the real 0112 evaluator as the migration owner and running the real SBOX-2 advance, then restoring 0115; no hand-written business row. At fae8695 it would end with two time_advanced entries for one command and fail.

## Routines against 0112 (extracted and diffed again)
- app.guard_recovery_follow_up: differs only in the CREATE OR REPLACE header, one comment line and the source-message predicate.
- app.evaluate_recovery_follow_ups: byte-identical to the fae8695 version, so still only the header, two DECLARE lines and the appended audit block.
- 0115 still contains only BEGIN, two CREATE OR REPLACE FUNCTION, COMMIT.

## Regressions checked
- Lock order after Fix B: the retry takes its command lock and makes its domain writes first, then the audit key, then the audit head, and takes nothing afterwards. SBOX-2's advance and the due signal take follow-up locks, then the audit key, then the head. No path holds the audit key or head while waiting for a business lock, so I find no inversion and no deadlock path. The key was already taken at this point one statement later, so the order is unchanged.
- Fix A allows nothing new for approved attempts: a later message whose action is queued, executing, retryable, unknown, dead-lettered, or succeeded without a delivery record is "not cancelled" and blocks. A later delivered message becomes the source itself. One approval per message (primary key), so no mixed case.
- No assertion that was on main changed: the follow-up test file is +222 / -1 against main, and the one removed line is an import line (adds readFile). All 9 changed files are inside the lane.

## LATER (new)
1. follow-up test, Round 1 B polling loop — spins on pg_stat_activity with no pause and relies on the default 5-second test timeout if the retry neither blocks nor finishes. Passed in 371 ms in CI.
2. No test row for a later approved attempt that is succeeded-without-delivery, retryable or dead-lettered; blocked by the SQL on inspection only.
3. Red-before-fix was not executed for the four new tests by anyone; that they fail at fae8695 is reasoning (mine and the builder's).
4. The long new end-to-end test, like the round-0 one, has no explicit timeout; it ran in about 1.1 s in CI.

## Test evidence for this exact head
GitHub CI run 38134140142 (pull_request, head 48a729c5051390f680e85f8d51a392384d79677c): "checks" passed in 26m14s. I read the job log:
- Lane boundary passed for lane m4-6-s-r1, base 530681c, head 48a729c.
- Database suite: 69 files, 896 tests passed. recovery-follow-up.integration.test.ts 56 tests passed, including all four "Round 1" tests by name; recovery-follow-up-upgrade.integration.test.ts 3 tests passed.
- Browser: 300 passed. No failed, flaky or retried tests in the log.
So yes: I saw the database tests green on 48a729c. I ran no database test on this Mac, as instructed. No Mac database log was used.

## What I did
Executed: git rev-parse (head matches), merge-parent and patch comparison, per-file diffs, routine extraction and diff against 0112, numstat against main, gh pr checks 130, gh run view (head sha and job log, searched not dumped). Worktree left clean; nothing in the repository edited.
Source-inspected only: lock-order and source-rule reasoning above.
