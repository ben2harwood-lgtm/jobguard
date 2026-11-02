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

## r1 (ruling 102)

18 Oct 2026. Builder: Codex, requested GPT-6-Astra lane. Earlier builder attribution and STOP sections above are historical. Status: STOPPED before implementation on a false order prerequisite; no acceptance claimed. BUILD-DON'T-MERGE / decision 74 / RED check then PARK remains binding.

HEAD is `62b53bd6bcb75e83c6ea39ba7c1814e3fbb0bac3`; actual local `origin/main` is `b881f90be0a6d368838ca4392338147ef819bd3a`, superseding both bases in the issued file. Initial working tree was clean. Read the on-disk issued order, AGENTS.md, BUILD_PLAN.md C1–C8 and M0-9 inventory, standing handoff, earlier receipt, outbox implementation/audit helper and the three named test files. The outbox source and named tests have no diff against current origin/main. The four test conflicts match ruling 102. The protected `packages/db/src/outbox.test.ts:57–62` was not changed.

### STOP: existing lane registration is absent

The new order says: “Add those exact paths to the file that already registers the later-b9 lane … otherwise its entry in config/agent-lane-assignments.json” and “if something it assumes is false on the current code, STOP on that file:line with before/after and build nothing else.”

- Location: `config/agent-lane-assignments.json:1`, the `lanes` object; no existing LATER-B9 entry has a line number because the entry does not exist. `config/lanes/later-b9.json` is also absent.
- Before (parsed): `lanes["later-b9"] === undefined`; zero registrations match `codex/sandbox/later-b9`, including branch prefixes and all dedicated lane files.
- After needed, NOT APPLIED: one coordinator-authorized `later-b9` registration for `codex/sandbox/later-b9`, with the original piece paths plus `packages/db/test/outbox.integration.test.ts`, `packages/db/src/outbox.test.ts`, and `packages/db/src/audit-fix-dbsrc-08.test.ts`. Then extend that single registration as ruling 102 directs. No duplicate registration is proposed.
- Exact selector/lint refusal: `Branch "codex/sandbox/later-b9" must match exactly one registered lane; found 0. Register the task before building.`

No registration, implementation, tests, expectations, pins or shared lists were edited. L019/L020/L027 remain NOT BUILT. There is no failing-first implementation run because the prerequisite STOP precedes building.

### Commands and observed results

Read-only inspection shell groups returned exit 0. They contained: `pwd`; `git status --short`; `git branch --show-current`; `git rev-parse HEAD origin/main`; reads of AGENTS.md, the issued order, prior receipt, both package manifests, outbox.ts, audit.ts, the three named tests, BUILD_PLAN.md excerpts, prior ledger, standing handoff and lane-lint implementation; `rg` searches for lane registrations and nested AGENTS.md files; `rg --files config/lanes`; `git show origin/main:config/agent-lane-assignments.json`; and `git diff origin/main --stat` plus the path-scoped source/test diff. The attempted dedicated lane-file read reported `No such file or directory`; searches for later-b9 returned no matches. Aggregate shell exit codes do not turn those missing-file/search results into passes. Some long read outputs were truncated; focused follow-up reads and parsed-policy inspection established the STOP independently.

- `memory_pressure | tail -1`: exit 0; 58% free (threshold 35%).
- `df -g /System/Volumes/Data`: exit 0; 59 GiB available (threshold above 33 GB).
- `node --version`: exit 0; v24.17.0.
- Inline `node --input-type=module` inspection using `existsSync`, parsed legacy JSON, `loadLanePolicy` and `selectLane`: exit 1; dedicated file false, legacy entry ABSENT, zero matching lanes.
- `export PATH="$HOME/Library/pnpm/bin:$PATH"` followed by `LANE_BASE_REF=origin/main pnpm lint:lanes`: interrupted with Ctrl-C, exit 130, after only a pnpm configuration warning and no lint result. No package install/download command was issued. This is NOT a passing lint run.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`: exit 1; exact zero-registration refusal above.
- `git diff --check`: exit 0 before receipt update; no implementation changes.
- `git diff --stat`: exit 0 before receipt update; empty working diff. Relative to origin/main, only inherited receipt/ledger changes existed (2 files, 105 insertions).
- `shasum -a 256` on the five files below: exit 0.
- `git rev-parse HEAD`: exit 0; unchanged HEAD above.
- Read existing `/private/tmp/jg-msg-later-b9.txt`: exit 0. Its old stopped-run text is preserved, with the r1 handoff appended.

Post-receipt scope verification is recorded below. No Git write, package installation, provider call, real data, spending or outward action was performed.

### NOT RUN and release holds

- packages/db typecheck, lint, build; forced root typecheck/lint/build; OpenAPI check; own unit tests: NOT RUN because the order explicitly requires building nothing else when an assumed prerequisite is false.
- New `packages/db/src/later-outbox.test.ts` and `packages/db/test/later-outbox.integration.test.ts`: NOT CREATED / NOT RUN.
- `packages/db/test/outbox.integration.test.ts`, PostgreSQL concurrency checks, full `pnpm test:db` and `pnpm test:migrations`: NOT RUN; sandbox cannot start PostgreSQL, CI required.
- Full `pnpm test`: NOT RUN; whole-suite runs belong to dispatcher/CI.
- `pnpm test:e2e`, browser and Playwright: NOT RUN; prohibited locally, CI only.
- Live adapter checks: NOT RUN; excluded by the synthetic-only order.
- Migrations: none. New GRANTs: none. Standard F: no direct protected-table write grant added.

### Unchanged source evidence and builder inspection

SHA-256 before receipt-only updates:

```text
99032dfa0bdcd3782fa8b25dfea2282eb8f4de76a627800070a0b9c37a01e2b7  packages/db/src/outbox.ts
288f47ad6f0f0fc3666ad9c556f73a5a8142f433a6c1f52e28bba1631050aa97  packages/db/src/outbox.test.ts
2125cb1bc8a92578b9ed7a689390a93495091f01b9c29ab12106a777431ccebb  packages/db/src/audit-fix-dbsrc-08.test.ts
107d82357b7cd2a350ee65b344a6f143d6d39d2fdd6d81122d53a4c51bb51606  packages/db/test/outbox.integration.test.ts
2e146f8144b7c93cdb8d1b2de58d9383597f244484cbd82038a6bff9cb4206fc  config/agent-lane-assignments.json
```

Builder inspection only: ruling 102 resolves the earlier test-edit conflicts, but does not supply the assumed existing registration. Creating it would contradict this round's explicit false-assumption STOP instruction. No independent model verdict or technical acceptance is claimed. Dispatcher must resolve registration before implementation resumes; exact-commit independent RED review, CI database evidence and separate acceptance remain outstanding.

Final verification shell group (exit 0): `git diff --check`; `git diff --stat`; `git status --short`; `git diff --name-only origin/main`; path-scoped `git diff origin/main` for the five hashed files; `git rev-parse HEAD`. Whitespace check passed, the five-file diff was empty, and both working-tree and base-relative changed-file lists contained only the receipt and ledger. Before adding this verification paragraph, the working diff was 2 files / 65 insertions. HEAD remains `62b53bd6bcb75e83c6ea39ba7c1814e3fbb0bac3`. No commit was created.


## r1b — 18 Oct 2026

Builder: Codex. This is a build receipt, not an independent verdict or acceptance. Historical STOPs above are superseded by the dispatcher's lane registration and ruling 102. Decision 74: synthetic only, RED independent exact-commit reviews, then PARK. No commit, push, deployment or outward delivery.

Initial/final Git HEAD: `cf4195dfb112630adfb9210402af744592b7e3f9`. Local `origin/main`: `b881f90be0a6d368838ca4392338147ef819bd3a`. Initial working tree clean. Read AGENTS.md, the on-disk issued order, standing handoff, BUILD_PLAN.md §5.3/C5/M0-9, earlier receipt and current implementation/tests. Main's outbox lines match the ruling. The existing dedicated lane already contains all required paths; no duplicate or registration edit was needed.

### Implementation and acceptance mapping

- L019: legacy `safeRetry` remains signature-compatible but cannot release `outcome_unknown`. Only the reconciliation adapter's definitive result transitions it. The result and adapter identity are recorded in the action's audit event in the same transaction. Reconciliation checks adapter identity, and compares the original full-precision database timestamp on update so duplicate/stale responses cannot apply to a newer state. No caller-created evidence parameter was added.
- L020: success, retryable, unknown, dead-letter, expiry cancellation, stale-claim recovery, operator retry/cancel and definitive reconciliation append one outcome audit event, after all business writes. A failed audit append rolls back outcome/attempt writes. A zero-row completion/reconciliation update appends no event. Claim/attempt-start remains execution bookkeeping, not a second outcome event: ruling 102 requires exactly one additional event for successful delivery. Invalid commands and unchanged unknown reconciliation have no committed outcome to audit. No user content or provider free text is copied into audit payloads.
- L027: the locked claim query uses PostgreSQL `clock_timestamp()` to refuse future `next_attempt_at`; stale executing claims remain eligible for unknown-outcome recovery. Normal retries keep the one-minute back-off.
- Preserved: fake adapters only; exact authorization and active owner membership predicate; network calls outside transactions; all business writes before the audit-head lock. No worker paging or dispatcher edits.
- Ruling 102 applied only to the named success count, unsafe retry refusal, five-attempt due-time setup and four audit SELECT responses in each named strict mock. `outbox.test.ts:57–62` is unchanged.

### Tests first

Created `packages/db/src/later-outbox.test.ts` before implementation. The installed Vitest first run returned exit 1: **12/12 tests failed** against original outbox code (boolean retry resolved, future work delivered, audit events missing, audit failure did not roll back, mismatched adapter accepted). Command: `packages/db/node_modules/.bin/vitest run --root packages/db src/later-outbox.test.ts --maxWorkers=2`.

Created `packages/db/test/later-outbox.integration.test.ts` before implementation. **NOT RUN**, including its first failing run: PostgreSQL prohibited in this sandbox. It covers due-time/concurrent claim, concurrent definitive reconciliation, one event per outcome, refusal/no-op behavior, audit-trigger failure rolling back outcome and attempt, and duplicate provider callback idempotency. This is test source, not PostgreSQL execution evidence.

The first post-implementation three-file unit run returned exit 1: **17 tests passed in 2 files**, third suite could not import `@jobguard/core` because its generated build output was absent. Command: `packages/db/node_modules/.bin/vitest run --root packages/db src/later-outbox.test.ts src/outbox.test.ts src/audit-fix-dbsrc-08.test.ts --maxWorkers=2`. No test or shared configuration was changed to bypass that prerequisite.

### Tooling and inspection record

Read-only inspections used `pwd`, `git status --short`, `git rev-parse HEAD` / `origin/main`, `git diff --stat` / path-scoped diffs / `--check`, `cat`, `sed`, `rg`, `ls`, `tail`, `node --version`, and the TypeScript printer. File edits used Python and Node filesystem operations within the lane. Read groups returned exit 0 except the explicitly missing optional files below. No package install/download command was issued.

Resource checks: `memory_pressure | tail -1` returned 52%, 54%, 53% free; `df -g /System/Volumes/Data` returned 57 then 56 GiB available. All above the 35% / 33 GB gates. Node v24.17.0. Inspection of optional root `node_modules/.bin/vitest` and `.npmrc` reported absent files (group exit 1); package-local Vitest exists.

Initial `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --filter @jobguard/db exec vitest run src/later-outbox.test.ts --maxWorkers=2` stalled after a pnpm configuration warning; interrupted with Ctrl-C, exit 130, no tests run. The launcher is pnpm 11 while the repository pins 10.28.1. Subsequent pnpm commands prepend the existing `/private/tmp/jg-pnpm-r1/bin` shim, which invokes the already-cached `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`; no download or shim edit. Direct installed Vitest supplied the failing-first evidence above.

Diagnostic STOP only: `ps -axo pid,ppid,etime,command | rg 'pnpm|vitest' | head -15` reported `zsh:1: operation not permitted: ps`. Process inspection was stopped; no alternate route or escalation attempted. This does not block implementation. Turbo also emitted `WARNING IO error: Operation not permitted (os error 1)` during forced checks; final command results are recorded below, not inferred from cache output.

### Scope, operational impact and review holds

Migrations: none. New GRANTs: none. Standard F: no new direct protected-table write grants. No schema/backfill/rollback operation; rollback is the ordinary source revert, but do not re-enable boolean-based unknown retries in production. No new alerts; existing queue/retry/failure/unknown telemetry remains. Existing operator retry callers retain their signature but `true` no longer authorizes an unknown retry.

Builder source inspection, not independent review: checked predicate preservation, audit lock order, reconciliation timestamp precision, duplicate transition no-op handling and ruling-only merged test diffs. SQL protocol doubles do not establish PostgreSQL locking, RLS or rollback guarantees. Existing provider adapter trust and stale-delivery behavior outside the issued fixes still require their normal review; no production readiness claim.

NOT RUN: both `packages/db/test/outbox.integration.test.ts` and `packages/db/test/later-outbox.integration.test.ts`; PostgreSQL concurrency/rollback runs; full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`; `pnpm test:e2e`, browser and Playwright; live adapters. Reasons: dispatcher prohibits database/browser/socket runs locally, full suites belong to dispatcher/CI, live effects excluded. No local browser or database startup attempted. No independent verdict or separate acceptance has been recorded for this diff.

### Executed checks and scope evidence

- `pnpm exec turbo run typecheck --force --concurrency=2`: exit 0; 7/7 tasks successful, **0 cached**. Includes packages/db. Log `/private/tmp/jg-later-b9-r1b-typecheck.log`.
- `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force --concurrency=2`: exit 0; 7/7 tasks successful, **0 cached**. Includes packages/db on final source. Log `/private/tmp/jg-later-b9-r1b-lint.log`.
- `LANE_BASE_REF=origin/main node tools/lint.mjs`: exit 0; core purity (212 TypeScript files), lane, money and commercial boundaries.
- `LANE_BASE_REF=origin/main pnpm lint:lanes` and direct `node tools/agent-lane-boundary-lint.mjs`: exit 0; exactly the registered lane, including new untracked test files. `git diff --check`: exit 0.
- Pre-build resource check: exit 0; 48% memory free, 56 GiB disk available.

Implementation/test SHA-256 (`shasum -a 256`, exit 0):

```text
bdd002c41c4f865f3746c33e23f5345dc3d95e0504705ff3ccb1291fd8de26c1  packages/db/src/outbox.ts
609f9f379464e22a99dce537939067b56375ce04fc45915b9e4d78188c56b267  packages/db/src/later-outbox.test.ts
e9f61f5440c285d0af5f2dc6f0dcad9566cf6248ef8ed9a00018c6099a6518f1  packages/db/test/later-outbox.integration.test.ts
6fed4335de1244f7f15095273110d7893502e96134bbdbf51a3f0b6661fa5fe7  packages/db/src/outbox.test.ts
75ece302c45f12c76b2fe9d34f20de941306da8255199ca3a348092429be764c  packages/db/src/audit-fix-dbsrc-08.test.ts
b4585cdd8294de3b4254f50d11dbb40a2b370adf57851bbd04ea25c4447a6b21  packages/db/test/outbox.integration.test.ts
```

Read-only Python comparison against `git show origin/main:packages/db/src/outbox.test.ts` confirms lines 57–62 byte-identical (SHA-256 of joined lines: `e3ffdcb45c844cc4666698a0289de65d2a8661e3d8121edc5aba21f24aacfd86`). Both lane registers unchanged from HEAD: dedicated SHA-256 `d73a269014d884c2883166b3f76f25f8df16ad00af23afab23da8b7498b45a1c`; legacy `2e146f8144b7c93cdb8d1b2de58d9383597f244484cbd82038a6bff9cb4206fc`. No permanent file-pinning test was added.

Tracked diff snapshot before this paragraph (`git diff --stat`, exit 0; new files separately listed below):

```text
 docs/ledger/LATER-B9.md                     |  5 ++
 docs/verdicts/LATER-B9/BUILDER_RECEIPT.md   | 41 +++++++++++++
 packages/db/src/audit-fix-dbsrc-08.test.ts  |  4 ++
 packages/db/src/outbox.test.ts              |  4 ++
 packages/db/src/outbox.ts                   | 94 ++++++++++++++++++++++++++++-
 packages/db/test/outbox.integration.test.ts |  7 ++-
 6 files changed, 149 insertions(+), 6 deletions(-)
```
- New untracked `packages/db/src/later-outbox.test.ts`: 91 lines.
- New untracked `packages/db/test/later-outbox.integration.test.ts`: 199 lines.

The intended commit subject/body was appended as the **r1b intended commit message** block to `/private/tmp/jg-msg-later-b9.txt`; prior handoff text preserved under the no-overwrite instruction. Dispatcher should use the r1b block.


### Final r1b results

- `pnpm build --force --concurrency=2`: exit 0; **7/7 tasks successful, 0 cached**, 1m48s. Log `/private/tmp/jg-later-b9-r1b-build.log`. Existing workspace-root / CSS autoprefixer warnings and Turbo IO warnings did not fail the command; no unrelated configuration changed.
- Final `pnpm --filter @jobguard/db exec vitest run src/later-outbox.test.ts src/outbox.test.ts src/audit-fix-dbsrc-08.test.ts --maxWorkers=2`: exit 0; **3 files, 22 tests passed**. Log `/private/tmp/jg-later-b9-r1b-unit.log`. The formerly blocked core import resolved after the required build. Pre-test gate: 51% memory free, 56 GiB disk; exit 0.
- `pnpm openapi:check`: exit 1, **STOP for this check only**. `apps/api/package.json:72` before: `"openapi:check": "tsx src/generate-openapi.ts --check"`; after: unchanged (run the same check in CI where IPC is permitted). Exact refusal: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/24130.pipe`. The tsx launcher failed before schema verification. No workaround, permission escalation or source/script edit. Log `/private/tmp/jg-later-b9-r1b-openapi.log`.
- No implementation STOP remains. Diagnostic process inspection remains stopped as documented above; not a product blocker. PostgreSQL/browser/full-suite NOT RUN entries remain as listed. AI evaluation inapplicable: no AI changes.

Final receipt/ledger/message writes were within the issued lane and named temporary artifact. The final whitespace, lane and Git-state verification follows this append. Source/test hashes above remain current. No Git write occurred; HEAD remains `cf4195dfb112630adfb9210402af744592b7e3f9`. Built uncommitted; acceptance remains held for independent RED review, CI PostgreSQL evidence and the OpenAPI check. PARK.

Final verification group returned exit 0: lane lint passed; `git diff --check` passed; tracked diff snapshot 6 files / 198 insertions / 6 deletions, plus the two new test files; `git status --short` showed only the eight authorised implementation/test/document paths. HEAD unchanged as above. This paragraph records that completed verification.


## r2 (ruling 112)

18 Oct 2026. Builder: Codex. PR #285, decision 74, BUILD-DON'T-MERGE. Starting HEAD `cfe17d69d3a5d709a3f762161ff544c053a8c770`; working tree initially clean. Read AGENTS.md, BUILD_PLAN.md §5.3/C5 and M0-9 mapping, the current lane register, prior receipt, recovery-message advance and its merged tests. Ruling 112 supplies this repair's scope. No package download/install, Git write, commit or push.

### Implementation and regression source

An authorised owner advance of a retryable recovery message now updates that action's `next_attempt_at=clock_timestamp()` after approval/source validation and before recording `started` and audit, inside their transaction. The update is tenant/action scoped and restricted to `retryable`; business-row locking remains before audit append. Automatic execution and its one-minute back-off remain unchanged. Affected invariants: exact current authorization (§5.3), durable retry and transaction boundaries (§5.4), atomic audit (§5.7).

Added one PostgreSQL regression to the already-authorised `packages/db/test/later-outbox.integration.test.ts`. It uses the real runtime role, evidence fixture and recovery-message service: definite failure creates one attempt and a future due time; automatic execution cannot call the adapter or change the message state; an owner retry delivers once, with two attempts and the expected history; command replay and another executor call produce no duplicate. This is test source only, NOT execution evidence. The existing L027 PostgreSQL test is unchanged. `git diff --exit-code -- packages/db/test/recovery-messages.integration.test.ts packages/db/src/outbox.ts` passed: the three named merged tests and the executor are untouched.

### Local execution evidence

Commands use the existing `/private/tmp/jg-pnpm-r1/bin` shim (pnpm 10.28.1), Node v24.17.0; dependencies were already installed. Logs use prefix `/private/tmp/jg-later-b9-r2-`.

- `pnpm --filter @jobguard/db typecheck`: PASS, exit 0 (`typecheck.log`).
- `LANE_BASE_REF=origin/main pnpm lint`: PASS, exit 0; boundary checks and 7/7 Turbo tasks, 4 cached; db/api/web lint executed (`lint.log`). Turbo emitted non-fatal IO permission warnings.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: PASS, exit 0 (`lanes.log`). Lane registration unchanged.
- Initial `pnpm --filter @jobguard/db exec vitest run src --maxWorkers=2`: interrupted, exit 130 (`unit.log`). The substring filter unexpectedly selected four `test/*dbsrc*.integration.test.ts` suites; setup attempted and all 18 integration tests were skipped. This was an accidental prohibited suite selection, stopped as soon as noticed, not PostgreSQL verification. The partial run also reported one failed audit-checkpoint-handoff source test without a completed diagnostic summary. No test/configuration was changed in response.
- Corrected `pnpm --filter @jobguard/db exec vitest run ./src/ --exclude '**/test/**' --maxWorkers=2`: PASS, exit 0; all 18 source unit files / 146 tests, including audit-checkpoint-handoff and L027 (`unit-only.log`).
- `pnpm openapi:check`: STOP for this check only, exit 1 (`openapi.log`). The unchanged tsx launcher failed before schema verification with `listen EPERM` on `/var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/5405.pipe`. No workaround/escalation; dispatcher/CI must run it where IPC is permitted.

PostgreSQL verification: NOT RUN. Neither the new regression nor the three protected recovery-message tests was run; their passing status must be established in CI. No browser suite, migration suite or live adapter run. The accidental aborted selection above is disclosed separately rather than represented as a successful database run. Full workspace `pnpm test` not run because it includes database suites. AI eval is inapplicable to this retry-only change.

No schema, migration, grants, backfill, new alert, API contract or provider changes. Reverting the five-line source repair restores the known owner-retry regression; no data rollback is needed. Independent exact-commit review and separate acceptance remain outstanding. Decision 74: RED review then PARK; no merge, release or acceptance claimed.


Final r2 build: `pnpm build --force --concurrency=2` PASS, exit 0, 7/7 tasks, zero cached, 1m37.975s (`/private/tmp/jg-later-b9-r2-build.log`). Non-fatal Turbo IO, Next workspace-root and compilation warnings remain outside this repair. Intended conventional commit subject/body written to `/private/tmp/jg-msg-later-b9.txt` for the dispatcher. No commit or push performed.

## b1 (ruling 115)

18 Oct 2026. Builder: Codex. PR #285, decision 74, BUILD-DON'T-MERGE. Starting HEAD `074a819e`, branch `codex/sandbox/later-b9`, initially clean. Inspected AGENTS.md, BUILD_PLAN.md §5.3, both named test setups, lane registration and previous receipts. This is a builder run receipt, not an independent verdict or acceptance.

Ruling 115 changes only the named test setups: immediately before direct executor calls, the exhausted-refusal test uses its admin connection and Test Q uses its inspection connection to set the exact action's `next_attempt_at=clock_timestamp()`. Test Q sets it before each of its two direct calls. Every assertion remains unchanged. Added exactly those two test paths to `config/lanes/later-b9.json`. No production source, migration, API contract, dependency, authorization policy, audit behavior or back-off implementation changed. The affected guarantee is durable outbox retry (§5.4); these test setups deliberately make work due without changing the automatic back-off guarantee. No data migration, rollback, operational alert or new release gate is introduced.

Checks used installed dependencies, Node v24.17.0 and the existing `/private/tmp/jg-pnpm-r1/bin` pnpm shim. No package install/download or Git write was performed. An initial ambient `pnpm --version` hung and was interrupted (exit 130); subsequent commands used the installed shim. Logs are `/private/tmp/jg-later-b9-b1-<name>.log`.

- `pnpm --filter @jobguard/db --filter @jobguard/api typecheck`: PASS, exit 0, both packages. Repeated after edits: PASS, exit 0 (`typecheck.log`).
- `LANE_BASE_REF=origin/main pnpm lint`: PASS, exit 0, 7/7 tasks, 2 cached (`lint.log`).
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: PASS, exit 0 (`lanes.log`).
- `pnpm build --force --concurrency=2`: PASS, exit 0, 7/7 tasks, zero cached, 1m47.078s (`build.log`). Existing Turbo IO and Next compilation/workspace warnings were non-fatal.
- `pnpm --filter @jobguard/db exec vitest run ./src/ --exclude '**/test/**' --maxWorkers=2`: exit 1, 204 passed / 1 failed, 23 files (`db-unit.log`). The sole failure was the existing 5000ms timeout in audit-checkpoint-handoff C-OPS-1 while other checks ran. `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1`: PASS, exit 0, all 71 tests (`db-unit-recheck.log`); no assertion or timeout changed.
- Initial API run: `pnpm --filter @jobguard/api exec vitest run src --exclude '**/shadow-isolation.application.test.ts' --exclude '**/*.http.test.ts' --exclude '**/health.test.ts' --exclude '**/auth/sso/action-paths.test.ts' --maxWorkers=2`: exit 1, 1878 passed / 7 failed / 1 skipped, 102 files passed / 2 failed (`api-unit.log`). This inadvertently included the mixed unit/PostgreSQL `final-account-lock.isolation.test.ts`; its database setup failed at port allocation (`no free port in 58400..58650`), before PostgreSQL started. This accidental setup attempt is disclosed, not counted as database verification. Seven SSO resource tests also failed while dependencies were rebuilding (invalid UUID translation / missing `requireLinkSession`); the corrected run below excludes the mixed database file and uses rebuilt dependencies.
- `pnpm openapi:check`: STOP for this check only, exit 1 (`openapi.log`). The unchanged tsx launcher failed before schema verification with `listen EPERM` on `/var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/14772.pipe`. Dispatcher/CI must run where IPC is permitted; no workaround or source edit.

PostgreSQL verification: NOT RUN. Both modified tests require CI execution; no passing database assertion is claimed. Browser and migration suites NOT RUN under the dispatcher sandbox constraints. Full workspace `pnpm test` was not run because it includes database/browser-dependent tests; HTTP tests requiring local binding were excluded from the unit selection. AI evaluation is inapplicable. Independent exact-commit RED review and separate acceptance remain outstanding; decision 74 requires PARK, not merge or release.

Corrected API unit command: `pnpm --filter @jobguard/api exec vitest run src --exclude '**/shadow-isolation.application.test.ts' --exclude '**/final-account-lock.isolation.test.ts' --exclude '**/*.http.test.ts' --exclude '**/health.test.ts' --exclude '**/auth/sso/action-paths.test.ts' --maxWorkers=2`: PASS, exit 0, 103 files / 1883 tests (`api-unit-corrected.log`). All seven initial SSO failures passed after the rebuild. No implementation STOP remains; OpenAPI alone remains STOP pending CI. Intended conventional commit subject/body written to `/private/tmp/jg-msg-later-b9.txt`. No commit, push or merge performed.
