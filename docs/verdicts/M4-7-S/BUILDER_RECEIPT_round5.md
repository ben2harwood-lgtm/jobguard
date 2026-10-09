# M4-7-S — round 5 builder receipt

Date: 7 October 2026. PR #108, branch `codex/sandbox/m4-7-s-r3`, supplied worktree. Starting HEAD: `5299c65c1ca6d019b8fa1852af1ee2bc2cef1cfa` (clean tree). This round answers the independent Opus verdict **REPAIR at 5299c65** (issue comment 6047139296). The commit that carries this receipt is reported in the dispatcher message (a file cannot name its own commit). Builder evidence is not independent review or acceptance.

**Status: repairs implemented; technical acceptance remains HOLD for CI (PostgreSQL and both browser projects) and a fresh independent verdict bound to the new head.** No push, merge, PR creation, branch or file deletion, live provider, real send, spend, production activation or decision approval occurred. `BUILD_PLAN.md` was not edited (the integrator writes the §12.2 0101 paragraph).

## What changed

**P1-1 (CI red).** In `packages/db/test/practice-feed.integration.test.ts`, deleted exactly the two pasted lines in "competing browsers create one account/effect or a typed stale-revision conflict" (they contradicted the `PRACTICE_FEED_STALE_REVISION` assertion that follows), and restored the raw-claim expectation for another tenant to `/row-level security|PRACTICE_FEED_FORBIDDEN/u` (the guard's tenant check correctly raises FORBIDDEN first). Both tests now run to their end, so the race assertions (one effect, two commands, audit counts) and the later raw-SQL assertions (missing claim audit, account bound to another session) execute again once CI runs the file.

**P2-1 (raw session token at rest).** Since SBOX-SESSION-1 the `jg_session` cookie is a 7-day bearer token. The feed no longer stores, sets or audits it; only SBOX's sha256 digest (the same value as `app.job.practice_session_digest` and `authenticatePracticeSession(...).digest`) is used.

- `0101_practice_feed.sql` (unmerged, number kept): `practice_feed_job_owner.session_id uuid` and `practice_feed_account.session_id uuid` become `session_digest char(64) NOT NULL CHECK(session_digest ~ '^[0-9a-f]{64}$')`. The unique and the account-to-owner foreign key move to `session_digest`. The guard trigger now reads the transaction setting `app.practice_feed_session_digest` (was `app.practice_feed_session`), requires it to be 64 lowercase hex, and compares it directly with the job's immutable `practice_session_digest` and passes it to SBOX's existing `authenticate_practice_session` (the `sha256(convert_to(...))` step is gone because the setting already is the digest). Owner rows must carry that digest; account rows must match both the setting and the owner row; command, event and match rows still require the account's digest to equal the setting. Still no new SECURITY DEFINER function, no new grant and no change to RLS, ownership or the append-only grants.
- `practice-feed-repository.ts`: `view` and `command` take `sessionDigest` (validated as 64 hex, FORBIDDEN otherwise) instead of the raw session. The digest is what `set_config('app.practice_feed_session_digest', ...)`, the job and principal checks, both inserts, the snapshot comparison and the audit references (`ownerId`+`sessionDigest` on `practice_feed.claimed`, `sessionDigest` on every command) carry. The `sha256(sessionId)` step is gone; the raw token is not an argument of the class at all.
- `practice-feed.application.ts`: still runs SBOX `PracticeAccess.job()` first (401 missing/unissued, same 404 for stranger, missing job and old unbound job) and now passes `auth.digest`, not the cookie value, to the repository. The Nest and Next transports share this and are unchanged.
- Every round-4 guarantee is unchanged in code: creator binding by `practice_session_digest`, live session re-authentication in the same transaction and in the trigger, `PracticeAccess` in front of both routes, stranger 404, missing session 401, old unbound jobs refused, membership locks, advisory locks and audit ordering.
- `MIGRATIONS.md` ownership and environment bullets updated to say digest-only.

**P2-2.** The upgrade test no longer requires 0094 to sit directly before 0101. It asserts 0101 is last, 0094 is present, and `indexOf(0094) < indexOf(0101)`; `names` still equals the full registry in filename order.

**P3s.**
- `config/agent-lane-assignments.json`: on the `m4-7-s` line only, removed `packages/db/migrations/0046_practice_feed.sql` from `allow`, and added this round's receipt path (required, otherwise lane lint rejects the new file; same mechanism as round 4). The `note` lost its now-false sentence about a "deletion-only 0046 exception" and says "Round 4 and round 5 receipt paths". The line stays one line of compact JSON; no other lane line changed (`git diff --stat` shows 1 insertion, 1 deletion in that file).
- The sandbox-run test (`a job that belongs to a sandbox run can only be claimed by that run's session`) is replaced by "a job created by the practice sandbox belongs to its creating session...". It builds the job through the real `SandboxRepository.create` (SBOX's derived `sandbox_run.session_id`, never a raw token), and asserts the job's creator digest, that a stranger's snapshot and connect get NOT_FOUND with no owner row, that the creator can read and is registered, that a raw-SQL claim by another session on a second sandbox-created job is refused (NOT_FOUND, no owner row), and that the real creator can still connect. Same intent and coverage as before (stranger refused, raw claim refused, creator allowed), now with a fixture SBOX actually produces. The old fixture's raw-token `sandbox_run` insert is gone.
- `apps/api/package.json`: the `openapi:generate` and `openapi:check` scripts are back to main's `tsx src/generate-openapi.ts` form. The `node --import tsx` workaround is **not** needed: with main's scripts `pnpm openapi:check` passes here (exit 0). The only remaining diff to main in that file is the `./practice-feed-contracts` export the feed needs.

## New and changed tests

- `practice-feed.integration.test.ts` (real PostgreSQL, **not executed here, see below**): helpers now derive the digest exactly as SBOX does (`sha256` hex of the token) and the raw-SQL tests set `app.practice_feed_session_digest` and write `session_digest`. New test **"stores only SBOX's session digest..."**: after a claim (first read), a connect and an advance it (1) proves the test's digest equals `authenticatePracticeSession().digest`; (2) records every statement and parameter the repository sends (a pool proxy, same technique as SBOX's `practiceMaterialPool`) and asserts none contains the raw token while they do contain the digest; (3) asserts the owner and account rows hold the digest and the three audit rows (`claimed`, `connect`, `advance`) carry `references.sessionDigest` equal to it; (4) searches `to_jsonb(row)::text` for the raw token string in `practice_feed_job_owner`, `practice_feed_account`, `practice_feed_command`, `practice_feed_event`, `practice_feed_receipt_match` and **all of `app.audit_event`** and requires zero hits; (5) with triggers bypassed by an admin session, a raw-token value in `session_digest` is rejected by the table CHECK (23514).
- `practice-feed.application.test.ts`: the mocked `PracticeAccess.job()` now returns a `digest`; the repository must receive the digest, a new test asserts the raw cookie value appears in no repository argument (and the digest does). All earlier application assertions are kept with the digest in place of the raw session.
- No assertion was deleted or weakened except the two pasted lines the verdict named (a defect, not coverage). The assertion at the old `:97` was changed as the verdict directs. No timeout was added or lengthened.

## Fail-first evidence (verdict item c) and its limits

**Run here: a scripted-client probe of the repository logic.** I extracted `packages/db/src/practice-feed-repository.ts` from `feb957a` (git blob `f15a92dd8fc628124506a8a811c432986be2c16c`, the round-3 first-touch code) and from the new tree, replaced only its two internal imports (`audit`, `tenant-context`) with tiny stubs, and drove both with the same scripted "database" (a fake `pg` client that answers by SQL text, with job J bound to creator session C and a live stranger session S). It is a model of the database that I wrote, **not PostgreSQL**; it only shows what the repository code does. Results (probe and logs are in the session scratchpad, not committed; the lane allows no probe file):

| Check | `feb957a` repository | new repository |
| --- | --- | --- |
| stranger-first view refused `PRACTICE_FEED_NOT_FOUND` | **FAIL** (resolved) | PASS |
| stranger-first view inserts no feed owner | **FAIL** (1 owner insert, naming the stranger) | PASS (0) |
| stranger-first connect refused | **FAIL** (resolved) | PASS |
| stranger-first connect inserts no owner/account | **FAIL** (1 owner + 1 account insert) | PASS (0, 0) |
| creator still reads after a stranger touched first | **FAIL** (`PRACTICE_FEED_FORBIDDEN`, locked out) | PASS |
| only the creator is ever registered as owner | **FAIL** (owner is the stranger) | PASS |
| control: creator's first read succeeds and registers the creator | PASS | PASS |
| raw token never reaches any statement, parameter or audit entry | **FAIL** (found) | PASS |
| digest is what the setting, owner row and audit carry | n/a | PASS |

So the stranger-first behaviour fails against the old first-touch repository and passes against the new one, and the raw-token-at-rest defect is detected by the same probe in the old code and absent in the new. Hashes of the probed sources: old `fc3b5298...309` and new `f783463b...886` after the import stubs (sha256 of the two staged files).

**Not run here, and not claimed:** the real-PostgreSQL red run (including the stranger-first test's raw-SQL claim leg, which is the 0101 trigger change) and the browser stranger-first red run. Local embedded PostgreSQL cannot start on this Mac: `pnpm --filter @jobguard/db exec vitest run test/practice-feed.integration.test.ts` fails in `initdb` with "Postgres init script exited with code null" (System V shared memory is exhausted: `ipcs -m` lists 32 segments and `kern.sysv.shmmni` is 32, so every segment identifier is in use, apparently by leftovers of other sessions' embedded PostgreSQL runs; I did not touch them). I did not retry. **CI and the reviewer must establish** both red runs and both green runs. To get the red runs in a disposable synthetic checkout, keep the new tests and the 0101 registration but restore the `feb957a` repository and application, and load the old 0046 SQL as 0101: the stranger-first PostgreSQL test and the Playwright stranger-first test should fail because the stranger's first request succeeds. Then run the new head for green.

## Commands actually run (worktree, Node v24.17.0)

| Command | Exit | Result |
| --- | --- | --- |
| `git rev-parse HEAD`; `git status --porcelain` (start) | 0 | `5299c65c...`; empty |
| `pnpm typecheck` | 0 | 7/7 tasks (api typecheck covers the application tests) |
| scratch `tsc --noEmit` over `practice-feed.integration.test.ts` with the db tsconfig (the db package's own tsconfig only covers `src`) | 0 | no type errors in the integration test |
| `pnpm build` | 0 | 7/7 tasks |
| `pnpm --filter @jobguard/api exec vitest run src` | 0 | 21 files, 390 tests (was 389; +1 new) |
| `pnpm --filter @jobguard/web exec vitest run` | 0 | 12 files, 111 tests |
| `pnpm --filter @jobguard/db exec vitest run src` | 0 | 2 files, 8 tests |
| `pnpm openapi:check` (root) and `pnpm openapi:check` in `apps/api` with main's `tsx` script | 0 / 0 | document unchanged |
| `node --test tools/*.test.mjs` | 0 | 42/42 |
| `node tools/lint.mjs` (before the commit; local event on the old head) | 0 | core purity, lane boundary, money boundary passed |
| `pnpm --filter @jobguard/db exec vitest run test/practice-feed.integration.test.ts` | 1 | **blocked** by embedded PostgreSQL `initdb` (see above); 27 tests skipped, none executed |
| scripted-client probe, old then new repository | 1 / 0 | table above |

Lane lint with simulated PR metadata (`GITHUB_EVENT_NAME=pull_request`, `base.sha` = `origin/main` `3395d343...`, `head.ref` `codex/sandbox/m4-7-s-r3`, `head.sha` = the new commit) can only be run after the commit exists; its result is in the dispatcher message.

## Things the reviewer should know

- **The digest is still a lookup key.** SBOX's own functions take the digest (`authenticate_practice_session(digest)`), and `app.job.practice_session_digest` is already runtime-readable, so the digest is the same exposure class SBOX accepted ("application trust boundary, not protection from stolen DB credentials"). What this round removes is the raw cookie value (which is what a browser holds), including from the append-only audit chain. If the reviewer wants audit references to carry a further-derived id (like `sandbox_run.session_id`), that is a small follow-up; I followed the instruction to use the digest.
- **Out-of-lane leftover.** `packages/db/test/practice-session.integration.test.ts:68` (merged SBOX, not in this lane's allow list) still sets the old transaction setting name `app.practice_feed_session` while attempting a forged owner UPDATE. Nothing reads that name now, and the UPDATE is still refused by SBOX's `guard_practice_owner`, so the test's assertion is unaffected.
- The CI evidence file `CI_EVIDENCE_c8e7957.json` and the earlier receipts are historical and unchanged.

## TL;DR

The practice feed now keeps only SBOX's digest of the session, never the 7-day cookie value, in its tables, its transaction setting and its audit chain, and the two broken round-4 tests are fixed so the race and raw-SQL checks run again. The stranger-first fix is shown to fail on the old repository logic and pass on the new one with a scripted database, but the real PostgreSQL and browser runs could not be done on this Mac and must come from CI and the reviewer. Next action: push is not mine to do; the integrator pushes, CI runs, and a fresh independent review is bound to the new head.
