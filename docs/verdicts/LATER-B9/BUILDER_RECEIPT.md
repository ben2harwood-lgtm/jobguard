Built by Claude Sonnet (Codex stand-in), dispatcher 14

# LATER-B9 — Outbox retry and audit correctness

Status: STOPPED on merged-test conflicts (rule G); NOT BUILT; no acceptance claimed. Decision 74: RED check then PARK; never merge or enable.

## Dispatcher 14 section (17 Oct 2026)

The earlier stop (16 Oct, 44 GiB free against the then 45 GB gate) is kept below as history. Decision 82 lowered the gate to 33 GB; free disk now 47 GiB, so that gate no longer blocks. I re-read the order, `packages/db/src/outbox.ts` and the three merged outbox test files, and found that each of L019, L020 and L027 cannot be delivered without changing a merged test line. The order forbids that (HARD LIMITS: no existing expectations; rule G). I changed no production code, test, migration or grant. Branch is behind origin/main (now 1bcd8db8); nothing merged or rebased. `config/lanes/later-b9.json` is the dispatcher's job.

### STOP lines (file:line, what the change would be)

1. L019 `safeRetry` boolean: `packages/db/test/outbox.integration.test.ts:243`
   - Before: `await operateOutbox(runtime, context, action.id, "retry", true);` then expects `retryable`. This runs right after `reconcileOutbox` returned `"unknown"` (no durable evidence), so the test requires the boolean to release `outcome_unknown`.
   - After needed: the call must be refused (`UNSAFE_OUTBOX_COMMAND`) or must carry real reconciliation evidence, and the expectation at 244 changes with it.
2. L020 audit on success: `packages/db/test/outbox.integration.test.ts:187`
   - Before: `expect(after.audit).toEqual(before.audit);` after a succeeded delivery (queried at 144). A success audit event makes this fail.
   - After needed: `after.audit` has exactly one more event, of the success type.
3. L020 audit, SQL-protocol mocks reject any SQL they do not list: `packages/db/src/outbox.test.ts:97` (retry exhaustion, 5th attempt) and `packages/db/src/audit-fix-dbsrc-08.test.ts:79` (owner check). `appendAuditBatch` issues `SELECT nullif(current_setting...)`, `SELECT ... app.lock_audit_head()`, `SELECT clock_timestamp()` and `SELECT app.advance_audit_head(...)`; the mocks at outbox.test.ts:93-96 and audit-fix-dbsrc-08.test.ts:75-78 do not answer them and throw. The set-up lines would need audit SELECT answers.
4. L027 due-time claim: `packages/db/test/outbox.integration.test.ts:257` (loop of five immediate `execute` calls). The executor sets `next_attempt_at = now + 1 minute` on `retryable` (outbox.ts:13); once the claim honours `next_attempt_at`, iterations 2 to 5 are refused and the test (which expects `dead_letter` on the fifth) fails. After needed: the test must advance or set `next_attempt_at` to now between attempts.

Nothing in L019, L020 or L027 is separable from these lines: each acceptance line (boolean cannot release; one audit event per committed outcome including success; future `next_attempt_at` prevents claim) contradicts a merged assertion. I did not work round them (for example by dropping the retry back-off, keeping the boolean working, or skipping audit on success), because each would leave the defect the order names in place.

### Commands run this session
- `git status`, `git branch`, `git log`, `df -g` (47 GiB free), reads of the order, template, `outbox.ts`, `audit.ts`, migration `0006_outbox.sql`, and the three test files, `git fetch`. No tests, typecheck, lint or build were run (nothing changed). All checks: NOT RUN, nothing to check.
- New GRANTs: none. Migrations: none. Standard F: unaffected.

### Ready when the coordinator rules
Once the four lines above are re-ruled (or the order is amended to allow those exact edits), the build is: (a) `operateOutbox` refuses unless a reconciliation record proving `not_found`/`succeeded` for this action exists (no new caller-created facts); (b) executor claim adds `next_attempt_at<=clock_timestamp()` in the locked SELECT; (c) each committed transition calls `appendAuditBatch` last in the same transaction after the row locks. Later UI thought: none.

## History: earlier stop (16 Oct)


# LATER-B9 — stopped at resource gate

Status: NOT BUILT; no technical acceptance claimed. Decision 74 requires PARK after RED review; no merge, enablement or deployment is authorized. The requested first-line attribution to Claude Sonnet was replaced with the actual builder identity.

## Base and scope

Inspected HEAD and local `origin/main`: `31682762c903d716657c573e1b5deae63588aad7`. Both differ from header base `ca435eeb5791638c787c830d6ba717146f694539` and draft base `0bbb5ddb`; current local main controls. No fetch or Git writes were performed. The initial working tree was clean.

The current BUILD_PLAN.md C5 contract remains at line 117 and M0-9 inventory at line 377. Current outbox executor, operator and reconciler remain at lines 13, 14 and 15 respectively. Source inspection found the operator's caller-supplied `safeRetry` path, the executor's missing due-time check and missing transition audit writes; none has been repaired or execution-tested.

## STOP

The mandatory pre-heavy resource check reported:

```text
System-wide memory free percentage: 80%
Filesystem   1G-blocks Used Available Capacity  iused     ifree %iused  Mounted on
/dev/disk3s5       926  848        44    96% 25120644 467520520    5%   /System/Volumes/Data
```

44 GiB available fails the dispatch requirement to stay above 45 GB. Implementation and checks stopped at this gate. No files were removed and no cleanup was attempted. Restore disk capacity before resuming.

The specified `config/lanes/later-b9.json` was absent during inspection (`cat: config/lanes/later-b9.json: No such file or directory`). No lane registration was added or changed; whether the legacy register covers this branch was not established before stopping. The dispatcher must resolve registration if absent. No existing test, pin, fingerprint or shared harness change was attempted; therefore there is no proposed before/after assertion requiring a coordinator ruling.

## Commands actually run

Each block below is one shell tool invocation. All three invocations returned exit code 0; these aggregate codes are inspection results, not passing implementation checks. Output was subject to tool truncation. The first invocation contained the failing lane-file read noted above.

```sh
pwd; git status --short; git rev-parse HEAD origin/main; cat AGENTS.md; cat config/lanes/later-b9.json; cat packages/db/src/outbox.ts
```

```sh
cat package.json packages/db/package.json packages/db/src/audit.ts packages/db/src/tenant-context.ts; rg -n 'outbox|C5|M0-9' BUILD_PLAN.md; rg -n 'operateOutbox|reconcileOutbox|ActionExecutor|action_outbox|action_attempt|provider_event_inbox' packages/db/test/outbox* packages/db/src/*test* packages/db/migrations | head -160
```

```sh
cat tools/agent-lane-boundary-lint.mjs; rg --files config/lanes | head -20; cat /Users/benharwood/.local/share/full-steam/handoffs/jobguard-task.md; memory_pressure | tail -1; df -g /System/Volumes/Data; node --version
```

Only three inspection shell invocations preceded this receipt (the initial invocation plus the two independent reads). Node reported `v24.17.0`. No package installation or download occurred. Tool metadata was also inspected read-only. Receipt, ledger and intended message were created with `apply_patch`.

## Validation and acceptance evidence

- L019, L020, L027: NOT IMPLEMENTED; no new tests written; no first failing test run. No acceptance assertion satisfied by execution evidence.
- `packages/db/src/later-outbox.test.ts`: NOT CREATED / NOT RUN because of disk gate.
- `packages/db/test/later-outbox.integration.test.ts`: NOT CREATED / NOT RUN; disk gate and dispatcher prohibition on starting PostgreSQL in this sandbox.
- Required forced typecheck, forced lint and forced build: NOT RUN because of disk gate. No cache-hit success claimed.
- Lane boundary lint, `pnpm lint:lanes`, OpenAPI check and `git diff --check`: NOT RUN after the stop. No lane pass claimed.
- Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`: NOT RUN under dispatch scope and sandbox restrictions.
- `pnpm test:e2e`, Playwright and browser runs: NOT RUN; CI only under dispatch instructions.
- Live adapter tests: NOT RUN; excluded. No provider, credential, real data, outward action or spending was used.
- New migrations: none. New GRANTs: none. Standard F: no new direct protected-table write grant was introduced.

## Scope evidence and handoff

No production source or test changed. Initial `git status --short` produced no entries. Post-stop hashes and `git diff --stat` were not collected; no hash-based unchanged-file claim is made. Only this receipt, the task ledger and `/private/tmp/jg-msg-later-b9.txt` are written for the stopped handoff.

Last observed HEAD (no Git write): `31682762c903d716657c573e1b5deae63588aad7`. There is no new commit. Intended eventual subject: `fix(outbox): enforce durable retry and outcome audit`; this subject does not describe a completed implementation yet.

## Builder inspection notes

This is a source-inspection receipt, not an independent verdict. No review, acceptance or completed self-verification is claimed. Resume with lane confirmation and resource checks, then write tests before implementation, run the allowed checks and obtain independent RED verdicts bound to the dispatcher's final commit. Keep the result PARKED.
