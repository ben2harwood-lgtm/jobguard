# Technical acceptance OUTBOX-ADAPTER-1 — PR #112 — verified head 4faa966 — ACCEPTED

**Decision:** ACCEPTED for merge under Ben's written delegation, provided GitHub CI is fully green on the exact final head that adds this file. No deploy or release.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), the JobGuard integrator, a subagent of the coordinator session "Full-steam parallel build plan", 7 October 2026.
- Codex gpt-6.1-sol built the code in two rounds. A separate merge-maker agent made the main-merge commit.
- The integrator wrote the work orders and spawned the reviewer and merge-maker. It did not build the code or give a verdict.

## 1. Authority applied
- `BUILD_PLAN.md` §2.1 written delegation (Ben, 30 September 2026): CI fully green on the exact head, a recorded PASS bound to that head, a separate acceptance, migration order, and no founder-reserved area.
- No migration. Under Ben's 5 October merge-ahead ruling, a PR with no migration or unmerged dependency may merge ahead.
- This is not a §12.3 card. It fixes reproducible defects on `main`, recorded under §14.3 "Discovered later":
  - Codex bot P1 4198937427 on PR #106: an executor claimed actions whose adapter it lacked.
  - GPT-6.1 Sol finding on PR #106: the fifth retryable failure wrote `dead_letter` into `action_attempt.outcome`, which the 0006 CHECK constraint forbids.
- Fixing a reproducible bug within approved scope is routine work under the working agreement. It touches no access, data or authorisation boundary.

## 2. Verified heads and verdicts — PASS
- **Code head:** `3baf60d60b63535d5ceb31ff191528bd837510fe`. Orders: `OUTBOX-ADAPTER-1.txt` (round 1) and `OUTBOX-ADAPTER-1-r2-dead-letter.txt` (round 2). Receipt: `BUILDER_RECEIPT.md`.
- **Independent Claude verdict on the code:** `3baf60d-opus.md`, copied verbatim from PR #112 comment 6037853584. "VERDICT: PASS — bound to head 3baf60d60b63535d5ceb31ff191528bd837510fe". The reviewer:
  - copied the PR's tests onto unchanged `main` and showed both fixes red there (`FAKE_ADAPTER_NOT_REGISTERED`; `action_attempt_outcome_check`) and green on the head, on embedded PostgreSQL 16.10;
  - found no change to lock order or authorisation;
  - found no P1 or P2.
- **Main merge:** `4faa9663a7fbb21501e4ada8695c24e47aa4d17f` merges `main` `73a643b` (SEC-DEPS #113 and TEST-STAB-3 #114) using an exact lane-registry union. That is the only conflict.
- **Delta re-checks by the same reviewer:**
  - `4faa966-opus-delta-repair-ci.md` (comment 6038195325): REPAIR, only because `checks` failed on an embedded-PostgreSQL start-up flake in the untouched `variation.integration` suite (ECONNREFUSED in `beforeAll`). The code needed no repair.
  - `4faa966-opus-delta.md` (comment 6038545164): "VERDICT: PASS — bound to head 4faa9663a7fbb21501e4ada8695c24e47aa4d17f". It confirms that, excluding the lane file, the PR diff is byte-identical before and after the merge (SHA-256 `8caf79f3…c32b8c`), and that the lane file is main's lanes plus `outbox-adapter-1`.
- **CI on 4faa966** (run 37622770104, attempt 2): `checks` pass, `dependency-review` pass, `secrets` pass.
  - DB: 39 files and 198 tests passed, none failed or skipped. That includes `outbox.integration` (11) and `variation.integration` (2).
  - API 108, web 63, Playwright 166.
  - The failed first attempt was re-run on the same head without any change.
- **Only commit after 4faa966:** this one, adding the record files inside `docs/verdicts/OUTBOX-ADAPTER-1/`, which the lane allows.

## 3. Scope — PASS
- Files changed: `packages/db/src/outbox.ts` (two narrow edits), `packages/db/src/outbox.test.ts`, `packages/db/test/outbox.integration.test.ts`, one appended lane, and the receipt.
- No migration, schema, grant, RLS, worker, API, UI or CI change.

## 4. Follow-ups — not blocking, recorded for the coordinator
- **P3-a:** actions no running executor handles now wait in `pending` with no alert.
- **P3-b:** rows stuck in `executing` for adapters other than `fake_capture` have no automatic recovery. Rows for adapters nothing registers cannot be cancelled, because `operateOutbox` refuses `executing`.
- **P3-c (already on main):** the worker's discovery query never marks signals as handled, so after 100 signals it only ever re-reads the oldest 100. This needs its own task card.

## 5. Founder-reserved areas — none
No live provider, production mode, real data, spending, decision approval, deployment or release. No check was weakened.

| Step | Actor | Record |
|---|---|---|
| Build (2 rounds) | Codex gpt-6.1-sol (Gmail), dispatched by the integrator | `BUILDER_RECEIPT.md` |
| Main merge (lane union) | Fresh Claude Opus merge-maker agent | merge commit 4faa966 |
| Independent check and delta re-checks | Fresh Claude Opus review agent | `3baf60d-opus.md`, `4faa966-opus-delta-repair-ci.md`, `4faa966-opus-delta.md` |
| Technical acceptance and merge | JobGuard integrator, Claude Opus 5.5 | this file |
