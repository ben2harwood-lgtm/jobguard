Built by Codex (GPT-6); dispatched 13 Oct 2026.

# LATER-B8 builder receipt

Status: implementation and new tests supplied, validation incomplete, PARKED under decision 74. Check lane RED. No independent review, technical acceptance, commit, push, enablement or deployment is claimed. The dispatch template's requested first line attributes this build to Claude Sonnet 5.5; that attribution would be inaccurate, so this receipt identifies the actual builder.

## Base and scope

Worktree `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/later-b8`, branch `codex/sandbox/later-b8`. Initial working tree was clean. HEAD and `origin/main` both resolve to `31682762c903d716657c573e1b5deae63588aad7`. That current main wins over the issued `ca435eeb5791638c787c830d6ba717146f694539` and the draft's `0bbb5ddb`; no Git reference was changed.

Verified current main's cited text: `BUILD_PLAN.md:380–381` still identifies M1-2 capture/proposal/reserved IDs and M1-3 review/lineage/confirmation; C4/C5 at lines 115–117 still declare the existing money limit and exact replay/race contracts. Original `review.ts:6` had an unbounded fractional quantity regex; original `capture-repository.ts:21` performed lookup without serialization and line 27 compared only the text hash. Existing `review.integration.test.ts:31` submits a saved revision 1 with expected revision 0, exercising the request mismatch guard before reading stored state.

Only the four allowed implementation/test files, this receipt and `docs/ledger/LATER-B8.md` were written in the repository. Intended commit message is at `/private/tmp/jg-msg-later-b8.txt`. No migration, package/lockfile change, schema/table change, source pin update, existing test edit, UI, provider integration or network business action was added. Fictional fixtures only. No socket, PostgreSQL process or browser was started.

## Implementation and acceptance evidence

| ID | Change and added coverage | Evidence status |
| --- | --- | --- |
| L011 | Review quantity validation delegates to `parseQuantity`; nullable rates are bounded by `MAX_MONEY_PENCE`. New core file declares 21 cases: invalid rate/quantity, inclusive limits, unknown values and dismissed lines. | Source-inspected only; Vitest launcher refused before collection, 0 tests executed. |
| L012 | Replay binds source text/hash, kind, all acquisition JSON, parsed proposal including field provenance/spans, prompt version, schema version and model. JSONB equality treats reordered object keys as equal; omitted kind/metadata normalize to existing text/null defaults. Tests cover eight changed-input cases, preserved reserved IDs/source bytes/references and normalized defaults. | New PostgreSQL tests NOT RUN. |
| L013 | New test submits a valid review with both revision inputs 0 after stored revision becomes 1; expects code `REVIEW_REVISION_CONFLICT` and the stored guard's specific message, then verifies unchanged state. | New PostgreSQL test NOT RUN. This is coverage of an existing guard, so it need not fail on the baseline implementation; the defect was the old test's unreachable stored guard. No existing test change needed. |
| L018 | Tenant/capture transaction advisory lock before lookup and all inserts; existing transaction owns commit/rollback. New table-lock barrier forces overlapping callers; identical callers must share one proposal/identity, changed payload must yield typed `CAPTURE_ID_REUSED`. Additional tests cover failed capture insertion/retry and failed confirmation with zero scope/receipt/authorization/audit residue. | New PostgreSQL tests NOT RUN. |

The new database file declares 15 cases in total. Tests were written before the implementation edits. No successful first-red assertion run exists: the first core command failed in pnpm before collecting tests; the database first-red run is NOT RUN under the order's explicit sandbox prohibition. Boundary failure without the implementation is source-inspected, not test-executed. Preservation/normalization/rollback cases intentionally also exercise existing guarantees.

Reversible choices: compare existing JSONB values in PostgreSQL instead of inventing a new stored fingerprint or canonicalization policy; reuse existing two-key advisory-lock style, canonicalizing UUIDs in SQL and separating capture keys with a `capture:` prefix. Authentication remains before the added capture lock; replay ownership remains before comparing or returning a stored result. The added lock precedes all source/job/identity writes. Capture does not append audit events today; no audit or shared command behavior was introduced. No existing contractor-job route is added or changed: these commands create a draft job, so no watchdog registry edit is needed.

Compatibility: inputs exceeding the already declared money/quantity limits now fail schema validation. A reused capture ID with changed immutable provenance now conflicts even if its text is unchanged. Matching captures retain their stored proposal and reserved identities. Legacy stored reviews outside the declared limits will fail validation; no data rewrite is attempted. No new operational alert is added. Unrelated merged checks must still pass in CI.

## Commands and results

Both pnpm commands below included `export PATH="$HOME/Library/pnpm/bin:$PATH"` before calling pnpm. Node reported `v24.17.0`. Manifests pin pnpm `10.28.1`, TypeScript `5.8.3`, Vitest `4.1.11`, PostgreSQL harness `16.10.0-beta.15`. pnpm version itself could not execute. No install/download command was issued; the installed pnpm launcher attempted registry resolution on its own and failed verification.

| Command | Exit | Result/counts |
| --- | --- | --- |
| `pnpm --version` | 1 | Pinned-release signature verification refusal; no version produced. Part of the initial read-only inspection shell. |
| `pnpm --filter @jobguard/core exec vitest run src/later-review-boundary.test.ts --maxWorkers=2` | 1 | First test attempt, before implementation. Same launcher refusal; 0 files collected, 0 tests executed. No test fan-out. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1 | `Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.` No override, alternative base, tool modification or bypass attempted. |
| `git diff --check` | 0, repeated during inspection and finalization | Whitespace check only; does not prove tests pass. |
| `git diff --stat` / `git diff --numstat` | 0 | Two tracked source files, 20 insertions and 4 deletions. New untracked files are separately enumerated below. |
| `git diff --exit-code origin/main -- packages/db/test/review.integration.test.ts apps/api/src/auth/context-boundary.test.ts packages/core/src/watchdog.ts packages/db/test/watchdog-command-harness.ts packages/db/test/command-replay-contract.integration.test.ts config/agent-lane-assignments.json` | 0 | Listed protected/merged files unchanged. |
| `shasum -a 256` over the files listed below | 0 | Code/test and unchanged protected-file hashes recorded below. |
| `wc -l packages/core/src/later-review-boundary.test.ts packages/db/test/later-capture-review.integration.test.ts` | 0 | 48 core lines, 198 database lines. |
| `memory_pressure \| tail -1` | 0, repeated | 81–82% free, above 35% minimum; also above the standing 50% tripwire. |
| `df -g /System/Volumes/Data` | 0, repeated | 47 GB available throughout checks, above 45 GB floor. |
| `git rev-parse HEAD` / `git rev-parse origin/main` | 0, repeated | Both SHAs recorded above; no Git writes. |

Exact package-manager refusal (same for both attempts):

```text
[ERROR] Refusing to run pnpm@10.28.1: its npm registry signature could not be verified (@pnpm/exe@10.28.1: fetch failed; @pnpm/macos-arm64@10.28.1: fetch failed; pnpm@10.28.1: fetch failed). The bytes selected by this project's lockfile/registry do not match a published, signed pnpm release.
This can indicate a tampered lockfile or a malicious/unreachable registry. Set `pmOnFail` to `ignore` to skip the version switch if this is unexpected.
```

The suggested bypass was not used. The second command was started while the initial version query was still running, before its refusal had returned. Once refusal was known, no further pnpm command or alternate executable path was attempted. Both original processes exited 1.

## NOT RUN

- `packages/core/src/later-review-boundary.test.ts`: NOT RUN as tests; command attempted, launcher exited 1 before collection. 21 declared cases, no result.
- `packages/db/test/later-capture-review.integration.test.ts`: NOT RUN (cannot start PostgreSQL / bind sockets here; dispatcher explicitly prohibits the run). 15 declared cases, no result. No heavy-slot execution attempted.
- `pnpm exec turbo run typecheck --force --concurrency=2`: NOT RUN after the pnpm safety refusal.
- `pnpm exec turbo run lint --force --concurrency=2`: NOT RUN after the pnpm safety refusal.
- `pnpm build --force --concurrency=2`: NOT RUN after the pnpm safety refusal. No cache-hit result claimed; all required reruns must use `--force`.
- `pnpm lint:lanes`: NOT RUN after the pnpm safety refusal. The explicitly required direct Node lane command ran and failed as recorded above.
- `pnpm openapi:check`: NOT RUN after the pnpm safety refusal; no route was changed.
- `pnpm test`: NOT RUN (whole-suite runs prohibited in this sandbox).
- `pnpm test:db`: NOT RUN (whole DB suite and PostgreSQL startup prohibited here).
- `pnpm test:migrations`: NOT RUN (PostgreSQL startup prohibited; no migration in this piece).
- `pnpm test:e2e`, Playwright and all browser checks: NOT RUN (CI only, explicit dispatcher prohibition).
- AI evaluation/live model evaluation: NOT RUN; no prompt/model/parser/gateway or extraction schema change. Review commercial validation changes only.

## STOP / coordinator prerequisites

1. **Package-manager execution:** exact refused commands and text appear above. The installed launcher is `/Users/benharwood/Library/pnpm/bin/pnpm:27` (the `exec` of installed `@pnpm/exe/pnpm`); project package-manager pin is `package.json:4`. Before: requested pinned `pnpm@10.28.1` cannot be verified in this environment. After required from coordinator/environment owner: make the already authorized pinned release verifiably available, preserving signature checks, then run the exact test and forced commands. No project pin, dependency, launcher or signature setting was changed. This is a tool safety refusal, not an automatic approval-review rejection.
2. **Missing lane file:** `config/lanes/later-b8.json:1` is absent, and neither the lane directory nor legacy register contains `later-b8`. The order's explicit allow list omits registration changes. STOP on registration rather than editing a shared register or expanding this piece's authority. Before: file absent. Proposed after, for coordinator registration:

```json
{"version":2,"lanes":{"later-b8":{"branches":["codex/sandbox/later-b8"],"receipt":"docs/verdicts/LATER-B8/BUILDER_RECEIPT.md","note":"RED; decision 74 PARK. Capture/review boundaries and synthetic tests only; no UI or new web workflow, migration, grant or provider action.","allow":["packages/core/src/review.ts","packages/core/src/later-review-boundary.test.ts","packages/db/src/capture-repository.ts","packages/db/test/later-capture-review.integration.test.ts","docs/verdicts/LATER-B8/BUILDER_RECEIPT.md","docs/ledger/LATER-B8.md"]}}}
```

3. **Uncommitted self-comparison:** `tools/agent-lane-boundary-lint.mjs:303` correctly refuses when HEAD equals the requested comparison base. Exact before line: `if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");`. Proposed after line: **identical**; the dispatcher must create the authorized commit, then rerun against `origin/main`. No weakening of this shared check is requested. No different base or injected configuration was used.

No existing assertion or setup must change to build this piece. In particular, `packages/db/test/review.integration.test.ts:31` stays unchanged: the added L013 test covers the stored guard independently rather than changing that merged line. No source pin or catalogue prerequisite arose. This is partial delivery pending all executable evidence and RED review, never acceptance.

## Grants, migrations and protected effects

Migration: none. New production GRANTs: none. Standard F: no new direct INSERT, UPDATE or DELETE grant to `jobguard_runtime` on any table; no new protected routine, receipt/audit writer, authorization path or privilege change.

Only test setup contains `GRANT jobguard_runtime TO later_b8_login`: a disposable PostgreSQL login inherits the existing runtime role, with NOSUPERUSER and NOBYPASSRLS; this adds no table privileges to the application role. Generated test credentials are created at runtime. No production credential value was read or written.

## Builder source-inspection notes (not independent review)

- Confirmed nullable prices/quantities and inclusive money limits remain supported; no rounding introduced.
- Compared all persisted caller-controlled capture provenance, including proposal field spans. Server-generated IDs/timestamps are not replay inputs.
- Compared JSONB rather than serialized key order; reordered metadata replays. Input proposal is validated before persistence, as before.
- Capture lock is tenant-qualified, transaction-local and taken before absent-row lookup. PostgreSQL UUID casts normalize key spelling. Hash collisions can over-serialize unrelated keys but cannot merge data or suppress payload checks.
- Current `withTenant` uses ordinary BEGIN/COMMIT transaction behavior. The follow-up SELECT after waiting for the transaction lock reads the winning committed capture. No network action or later audit lock is added.
- The overlap test barriers wait on actual database locks and drain both operations even if a barrier assertion fails. Snapshot/zero assertions check rollback directly. These statements describe test design; execution is missing.
- Existing review/confirmation/command/audit production code and all merged tests remain unchanged. No synthetic grant is used as evidence of stronger production authorization.
- No professional sign-off, second-model response or independently verified status is asserted. Dispatcher must commit first and arrange independent Opus and Sol-high verdicts on the same exact commit plus separate acceptance. Decision 74 keeps this PARKED until Ben's button.

## Diff and hashes

Tracked `git diff --stat`:

```text
 packages/core/src/review.ts           |  8 ++++++--
 packages/db/src/capture-repository.ts | 16 ++++++++++++++--
 2 files changed, 20 insertions(+), 4 deletions(-)
```

New untracked lane files: `packages/core/src/later-review-boundary.test.ts` (48 lines), `packages/db/test/later-capture-review.integration.test.ts` (198 lines), `docs/ledger/LATER-B8.md`, and this receipt. `git diff --stat` excludes these by design; the final status enumeration checks them separately. No Git index writes were made.

SHA-256 of implementation/test files:

```text
e53f24f1c0c97e121492d371fb225691a5236c243305092723d86c2b4ee7b924  packages/core/src/review.ts
950c5575e9ee00a6015c3b6ea470b2002f696ac299b7d2fecd3ce31338cec7c2  packages/core/src/later-review-boundary.test.ts
254659e109d965471904e3fd0d6adaa365fc74262003595ae194b7029457cc34  packages/db/src/capture-repository.ts
eb612541e31de36d1caab298bb1b35634827582c2afb0290f127374e42c3c01f  packages/db/test/later-capture-review.integration.test.ts
```

SHA-256 of unchanged merged/protected files (also verified by `git diff --exit-code origin/main -- ...`):

```text
9065079536ac8d99699a9198245b95638e3a0f9755040db04580c2246aef4fc7  packages/db/test/review.integration.test.ts
ec6d3dd219e42707fe0bd6b0550db7f4f260f36c55ff9fee0d36bde831586ef2  apps/api/src/auth/context-boundary.test.ts
a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca  packages/core/src/watchdog.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6  packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f  packages/db/test/command-replay-contract.integration.test.ts
99fcda4daff974e76a96095f6bfaa0be8745ecfc96fbdacbf67e27052df8eb4e  config/agent-lane-assignments.json
```

Final HEAD (unchanged, uncommitted working-tree diff): `31682762c903d716657c573e1b5deae63588aad7`.

Additional artifact hashes:

```text
bbd3e648ab99deb2f2f8c714ea1bf14a55f4f5209afbb4a8892ca894e50c855e  docs/ledger/LATER-B8.md
95a04f1733d99c628df3aee96e63fc5a7261535698215a2714ffd99212c765ec  /private/tmp/jg-msg-later-b8.txt
```

## Inspection command inventory

The numbered entries below record the remaining shell invocations, including repeated reads. Exit codes are the aggregate shell status, not a claim that every intermediate read succeeded. All are source/environment inspection with zero tests executed. Output was sometimes truncated by the tool; no truncated output is counted as passing verification. File edits used `apply_patch`, which returned successfully for each patch; no shell mutation or Git write was used.

1. Exit 1 (missing lane file):
   `pwd; git status --short; git rev-parse HEAD; git rev-parse origin/main; cat config/lanes/later-b8.json`
2. Exit 0:
   `cat AGENTS.md; cat packages/core/src/review.ts; cat packages/db/src/capture-repository.ts`
3. Exit 0:
   `rg -n 'M1-2|M1-3|C4|C5|capture source|review, split|quantity|magnitude|lock order' BUILD_PLAN.md; cat package.json; cat packages/core/package.json; cat packages/db/package.json; cat ~/.local/share/full-steam/handoffs/jobguard-task.md`
4. Exit 0:
   `cat packages/core/src/review.ts; cat packages/db/src/capture-repository.ts`
5. Exit 0:
   `sed -n '90,140p' BUILD_PLAN.md; sed -n '365,395p' BUILD_PLAN.md; cat packages/core/src/money.ts; cat packages/core/src/quantity.ts; cat packages/core/src/capture.ts`
6. Exit 0:
   `cat packages/db/test/review.integration.test.ts; cat packages/db/test/capture.integration.test.ts; cat packages/db/src/review-repository.ts; cat tools/agent-lane-boundary-lint.mjs`
7. Exit 1 at final pnpm command (refusal recorded above):
   `rg --files -g AGENTS.md -g '*lane*' -g '*capture*' -g '*review*' -g '*vitest*'; memory_pressure | tail -1; df -g /System/Volumes/Data; node --version; export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --version`
8. Exit 0:
   `cat packages/core/src/quantity.ts; cat packages/core/src/money.ts; cat packages/db/test/review.integration.test.ts; cat packages/db/test/capture.integration.test.ts`
9. Exit 0:
   `cat packages/db/src/review-repository.ts; cat packages/db/test/audit-api-capture.integration.test.ts`
10. Exit 0 overall; `test-database.ts` was absent and no LATER-B8 registration matched:
    `cat packages/db/test/audit-api-capture.test.ts; cat packages/core/src/review.test.ts; cat packages/db/test/test-database.ts; cat packages/db/vitest.config.ts; rg -n 'advisory|lockAudit|lock.*tenant|appendAudit' packages/db/src/*repository.ts | head -65; rg -n 'later-b8|LATER-B8' config/agent-lane-assignments.json; sed -n '372,385p' BUILD_PLAN.md`
11. Exit 0:
    `cat packages/db/test/audit-api-capture.integration.test.ts`
12. Exit 0:
    `cat packages/db/src/review-repository.ts`
13. Exit 0 overall:
    `cat packages/core/src/capture.ts; cat packages/db/migrations/0007_capture.sql; cat packages/db/test/tenant-context-test-utils.ts; sed -n '1,90p' packages/db/test/pool-test-utils.ts; cat packages/db/vitest.config.ts; rg -n 'canonicalJson|pg_advisory_xact_lock' packages/db/src/commands.ts packages/db/src/stored-command.ts packages/db/src/audit.ts; rg -n 'later-b|capture' config/agent-lane-assignments.json | tail -12`
14. Exit 0 overall:
    `rg -n 'capture-repository|review.ts|sourcePins|sha256|pinned' apps/api/src/auth/context-boundary.test.ts; cat packages/db/src/tenant-context.ts; sed -n '1,80p' packages/db/src/commands.ts; rg -n 'lockTenant|shared.*lock|tenant.*lock' packages/db/src/capture-repository.ts packages/db/src/tenant-context.ts packages/db/test/lock-order-1.test.ts; sed -n '1,70p' tools/agent-lane-boundary-lint.mjs; cat packages/core/tsconfig.json; cat packages/db/tsconfig.json`
15. Exit 0 overall:
    `cat packages/db/vitest.config.ts; rg -n 'canonicalJson' packages/core/src/index.ts; sed -n '1,55p' packages/db/test/lock-order-1.test.ts; git branch --show-current; git status --short; sed -n '1,25p' config/agent-lane-assignments.json`
16. Exit 0:
    `rg -n 'capture|hashtextextended|pg_advisory' packages/db/test/lock-order-1.integration.test.ts; rg -n 'canonical' packages/core/src/index.ts packages/core/src/*.ts | head -20; sed -n '50,100p' apps/api/src/auth/context-boundary.test.ts; cat packages/core/src/capture.ts; cat apps/api/src/capture/capture.application.ts`
17. Exit 0:
    `memory_pressure | tail -1; df -g /System/Volumes/Data`
18. Exit 1: the PATH-prefixed core Vitest command recorded in the verification table (only test invocation).
19. Exit 1 (root Vitest bin absent; package Vitest bin exists):
    `command -v pnpm; ls -l /Users/benharwood/Library/pnpm/bin/pnpm; ls node_modules/.bin/vitest packages/core/node_modules/.bin/vitest`
20. Exit 2 (`.npmrc` absent):
    `cat /Users/benharwood/Library/pnpm/bin/pnpm; ls -l node_modules/.bin/turbo; ls -l packages/core/node_modules/.bin/vitest; rg -n 'packageManager|managePackageManagerVersions' pnpm-workspace.yaml .npmrc`
21. Exit 2 (`canonical-json.ts` and `job-administration-repository.ts` absent):
    `cat packages/db/src/canonical-json.ts; rg -n 'appendAuditBatch|GRANT|scope_identity' packages/db/migrations/0003* packages/db/migrations/0008* | head -16; rg -n 'role.*job|shared tenant|hashtextextended\(.+54' packages/db/src/job-administration-repository.ts`
22. Exit 1: direct Node lane command recorded in the verification table.
23. Exit 0:
    `git diff --check; git diff --stat; git status --short; nl -ba packages/db/test/review.integration.test.ts | sed -n '28,34p'; nl -ba tools/agent-lane-boundary-lint.mjs | sed -n '330,345p'; df -g /System/Volumes/Data; memory_pressure | tail -1`
24. Exit 0 overall (no LATER-B8 registration matched):
    `git diff -- packages/core/src/review.ts packages/db/src/capture-repository.ts; nl -ba packages/core/src/review.ts | head -24; nl -ba packages/db/src/capture-repository.ts | head -62; nl -ba tools/agent-lane-boundary-lint.mjs | sed -n '293,308p'; rg -n 'later-b8' config/lanes config/agent-lane-assignments.json; rg -n 'function canonicalJson|export.*canonicalJson' packages/db/src | head -8`
25. Exit 0:
    `rg -n 'job_record_proposal|capture_source' packages/db/migrations | tail -24; cat apps/api/package.json; git diff --numstat; shasum -a 256 packages/core/src/review.ts packages/core/src/later-review-boundary.test.ts packages/db/src/capture-repository.ts packages/db/test/later-capture-review.integration.test.ts packages/db/test/review.integration.test.ts apps/api/src/auth/context-boundary.test.ts packages/core/src/watchdog.ts packages/db/test/watchdog-command-harness.ts packages/db/test/command-replay-contract.integration.test.ts config/agent-lane-assignments.json`
26. Exit 1 (final search had no match):
    `cat packages/db/migrations/0022_browser_local_dictation.sql; git status --porcelain=v1; git diff --name-only origin/main; git ls-files --others --exclude-standard; git show origin/main:packages/core/src/review.ts | head -14; git show origin/main:packages/db/src/capture-repository.ts | head -34; rg -n 'tsconfig|test/.*integration' tools/lint.mjs`
27. Exit 0: protected-file `git diff --exit-code` from the verification table, followed by `git rev-parse HEAD; git rev-parse origin/main`.
28. Exit 0:
    `shasum -a 256 packages/core/src/review.ts packages/core/src/later-review-boundary.test.ts packages/db/src/capture-repository.ts packages/db/test/later-capture-review.integration.test.ts; wc -l packages/core/src/later-review-boundary.test.ts packages/db/test/later-capture-review.integration.test.ts; git diff --check; git diff --stat; git rev-parse HEAD; git rev-parse origin/main; df -g /System/Volumes/Data; memory_pressure | tail -1`
29. Exit 0:
    `nl -ba /Users/benharwood/Library/pnpm/bin/pnpm | tail -6; git diff --check; git diff --stat; git status --short; git diff --name-only origin/main; git ls-files --others --exclude-standard; shasum -a 256 packages/core/src/review.ts packages/core/src/later-review-boundary.test.ts packages/db/src/capture-repository.ts packages/db/test/later-capture-review.integration.test.ts docs/ledger/LATER-B8.md /private/tmp/jg-msg-later-b8.txt; git rev-parse HEAD; df -g /System/Volumes/Data; memory_pressure | tail -1`

Final post-receipt inspection: `git diff --check`, `git status --short`, `git diff --stat`, `git rev-parse HEAD` and `shasum -a 256` over the four source/test files plus the ledger/message file. Results are also exposed in the tool transcript; any failure would be recorded before handoff.
