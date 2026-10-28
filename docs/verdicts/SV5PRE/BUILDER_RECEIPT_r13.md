# SV5PRE builder receipt, r13 (Ben decision 17: late photo and the final lock)

Decision (Ben, 14 Oct, coordinator chat, decision 17): the lock waits for photos already uploading; nothing slips past the lock.

Finding: migration 0147 already makes evidence writes hold SHARE on the job row while `app.lock_final_account` (0132) takes UPDATE on it, so the lock already queues behind an in-progress upload transaction and the upload is then in the frozen manifest; merged 0144 plus 0147 refuse a photo started after the lock. The real gap was that the wait was unbounded (an upload transaction that never ends would hold the lock request forever).

Change (no migration, no new number, no pinned list touched)
- packages/db/src/final-account-lock-repository.ts: `lock()` sets a transaction-local `lock_timeout` (default 5000 ms, constructor option `lockWaitMs`) before calling the lock routine; SQLSTATE 55P03 maps to typed `FinalAccountLockError("FINAL_ACCOUNT_UPLOADS_IN_PROGRESS")`. Nothing is written on timeout; a retry is safe.
- packages/core/src/final-account-lock.ts: one added code in the error union (additive).
- apps/api/src/final-account-lock.controller.ts: regex gains `|UPLOADS_IN_PROGRESS` so the refusal is HTTP 409 (all existing codes map as before).
- Tests added (packages/db/test/sv5pre-completion.integration.test.ts, new `it`s only): D17-a upload started before lock: lock waits (still pending at 300 ms, no lock row), upload commits, lock completes, frozen manifest has it (sourceCount 1, receipt before lock time); D17-b upload after lock refused POST_LOCK_WORK_REQUIRES_LINKED_JOB, no row; D17-c upload never finishes: bounded lock refuses FINAL_ACCOUNT_UPLOADS_IN_PROGRESS in under 5 s, no lock row, retry after commit succeeds.

Merge: origin/main 46cdade3 merged into the branch (c45a5d37). Conflicts in config/agent-lane-assignments.json (lane-union.py), packages/db/MIGRATIONS.md and packages/db/src/migrate.ts (both sides kept; 0147 then 0150, 0151, 0153; no renumbering).

Commands (heavy-slot, vitest --maxWorkers=2)
- sv5pre-completion D17 only: 3/3 pass. sv5pre-completion + final-account-lock-invoice: 39/39 pass. pnpm typecheck exit 0.
- pnpm lint and lane lint: FAIL (exit 1) on lane boundary only: sv5pre allow list lacks the three product files above and BUILDER_RECEIPT_13.md (that one pre-dates this round). I was refused permission to edit config/agent-lane-assignments.json, so it is not fixed. Needed allow entries: packages/core/src/final-account-lock.ts, packages/db/src/final-account-lock-repository.ts, apps/api/src/final-account-lock.controller.ts, docs/verdicts/SV5PRE/BUILDER_RECEIPT_13.md, docs/verdicts/SV5PRE/BUILDER_RECEIPT_r13.md.

Not run: full suite, API/web tests for the controller regex, CI. Not independently verified, not accepted.
