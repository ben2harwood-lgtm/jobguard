# TESTS-BASELINE-PARSER-1 — builder receipt

17 October 2026. **BUILD-DON'T-MERGE / PARK (decision 74). RED review pair incomplete.** No commit, stage, checkout, push, merge, activation or deployment by builder. Dispatcher owns the commit; founder owns merge/release. No technical acceptance is asserted.

## Authority and checkout

Read repository `AGENTS.md` rev 3.0, `BUILD_PLAN.md` §2.4 (including C4/C6) and ENT-9, the baseline contract, parser, existing parser tests, and ENT-9A receipt including HELD / STOP / LATER. The issued pre-build check path `checks/J6-jobguard-next-orders-night4-check.md` is absent in this checkout; its READY status is supplied by the order, not independently verified here.

Initial `git rev-parse HEAD`: `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`. Correct prepared branch `codex/sandbox/tests-baseline-parser-1`; `git status --short` was empty. `origin/main` resolves to the same issued HEAD. Working directory is the issued reused `mon-3` worktree. Initial and subsequent resource checks show **53 GB available**, above the 33 GB floor.

Node `v24.17.0`; cached prepared pnpm **10.28.1**, Vitest **4.1.11**, Turbo **2.10.12**. Package commands use `PATH=/private/tmp/jg-r1-pnpm-bin:$PATH`, whose existing pnpm symlink points to `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. No package installation, dependency change, alternate version, safety override or download command was issued. An initial default-launcher `pnpm --version` probe emitted an overrides warning and did not finish; it was interrupted (130). The prepared cached runner's version probe exited 0. No verification refusal was bypassed.

## Scope and acceptance evidence

Only new files: the exact issued lane JSON (which does not grant itself), `packages/core/src/enterprise-baseline.property.test.ts`, the task ledger and this receipt. All existing tracked files stay unchanged. No product/parser/schema/method/fixture/export/index/old-test edits. No existing amount, count, hash expectation, money policy, price or permission changes.

The new file has **64 cases**, eight fixed seeds (`1`, `7`, `42`, `137`, `2026`, `65537`, `0x12345678`, `0xdeadbeef`), no clock or unseeded random dependency. Ordinary generated histories contain 4–12 jobs, 2–5 teams and at most four extras per job. Three permutation rounds per seed; eight quote/line-ending combinations per seed; seven metadata-column corruptions per seed. Boundary data is separately generated in memory and never retained as giant fixtures.

| Assertion | Added evidence |
| --- | --- |
| BP1 | Independent history-to-CSV encoder and JSON serialization decode identically, with normalized IDs and preserved extra count. No production exporter is used as an input encoder. |
| BP2 | Seeded nested property/array and CSV row permutations preserve normalized history, import source hash, exact batch replay, complete report and JSON/CSV export bytes. |
| BP3 | Whole quoted cells, LF/CRLF, absent/present final newline preserve input. Unmatched quotes, characters after a closing quote, short/long rows, mixed metadata and bare CR refuse with the BaselineError type and BASELINE_INVALID message. Every common metadata column is corrupted separately across generated rows. |
| BP4 | JSON and CSV accept exactly 8,000,000 input characters / 1,000 teams / 10,000 jobs / 20,000 extras in one job / 20,000 extras across jobs, then refuse one above. Separate cases isolate each count. The CSV character case uses 15,000 extras, below count ceilings; it pads legal unique ASCII identities rather than introducing invalid cells. |
| BP5 | Generated invalid JSON/schema/identity/CSV imports leave a mutable caller array, prior batch identity, full serialized content and prior exports unchanged. |
| BP6 | Generated no-job, zero-extra-job, unknown-value and known-zero histories retain different counts/statuses/source hashes. No jobs is not_computable; known zero is complete; unknown remains incomplete/null with an explicit unknown count. Both formats are checked. |

## Genuine red controls, followed by green

Before running the new suite against the real implementation, small isolated parser copies were created under `/private/tmp/jg-test-tests-baseline-parser-1/`. Each imports copied, unchanged local dependencies. Scratch tests retain the real test's relative parser import. The repository parser and its import target were never mutated. Each command uses at most two workers and runs sequentially. The initial green run passed 64; the CSV character generator was then refined to use 15,000 extras, and relevant controls plus the full real suite were rerun successfully. Initial scratch test snapshots are also retained.

`prepare-controls.py` records exact before/after guard removals and parser SHA-256 in `mutation-manifest.json`. `run-controls.py` records actual commands/exit codes in `red-results.json` and checks for **“expected function to throw an error, but it didn't”**. Nine scenarios all exited **1 with that assertion**, rather than import/compiler/runner failures:

| Scratch directory | Removed validation | Target |
| --- | --- | --- |
| `unmatched-quotes` | Final quoted-state refusal | BP3 unmatched quotes |
| `trailing-characters` | Closed-field/embedded-quote refusal | BP3 trailing characters |
| `column-count` | CSV field-count check | BP3 extra columns |
| `mixed-metadata` | Repeated metadata equality check | BP3 mixed metadata |
| `character-limit` | Input text-length condition | BP4 character bounds, both formats |
| `team-limit` | History team max(1,000) | BP4 team bounds, both formats |
| `job-limit` | History job max(10,000) | BP4 job bounds, both formats |
| `per-job-extra-limit` | Per-job max(20,000) **and** aggregate extra guard | BP4 per-job bounds, both formats |
| `batch-extra-limit` | Aggregate extra guard alone | BP4 multi-job extra bounds, both formats |

The two extra ceilings are equal: the aggregate guard independently rejects an overfull single job. Accordingly the single-job mutation removes both, transparently. It proves the rejection contract, not independent necessity of the redundant schema guard. The multi-job case isolates the aggregate guard.

Exact scratch command template (full argument arrays in `red-results.json`):

```sh
pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 \
  --root /private/tmp/jg-test-tests-baseline-parser-1/<directory> \
  enterprise-baseline.property.test.ts --testNamePattern '<BP3/BP4 target>'
```

Real target restored by selecting the unmodified repository root/imports:

```sh
pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/enterprise-baseline.property.test.ts
```

Exit **0**, **64/64 passed**, final run duration **1.06 seconds** (`green-property-final.log`). No genuine implementation failure was found; none was repaired or hidden by changed expectations.

## Sequential verification

All package commands below use the prepared PATH above. Force flags prevent claiming cached checks as fresh execution. Turbo emits sandbox cache I/O warnings; task exit statuses and outcomes below are the execution evidence.

| Command | Actual result / retained log |
| --- | --- |
| `git rev-parse HEAD` | 0; issued base above |
| `git status --short` | 0; initially clean |
| `df -g /System/Volumes/Data` | 0; 53 GB available |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/enterprise-baseline.property.test.ts` | 0; 64 passed; `green-property-final.log` |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0; 7/7 tasks; `typecheck-final.log` (also passed before the generator refinement) |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force --concurrency=2` | 0; 7/7 tasks; `lint.log` |
| `pnpm build --force --concurrency=2` | 0; 7/7 tasks, 5m34.96s; `build.log` |
| `git diff --check` | 0 after build; `diff-check.log`; repeated at handoff |

Supplementary checks after the ordered sequence:

| Command | Actual result / retained log |
| --- | --- |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/enterprise-baseline.test.ts src/enterprise-baseline.property.test.ts` | 0; **85/85 passed** (21 existing, 64 new); `baseline-regression.log` |
| `pnpm openapi:check` | **1**, before generator execution: tsx IPC socket `listen EPERM`; `openapi.log`. No OpenAPI comparison pass is claimed; CI owes this check. |
| `node tools/core-purity-lint.mjs` | 0; `core-purity.log` |
| `node tools/money-arithmetic-lint.mjs` | 0; `money-arithmetic.log` |
| `node tools/commercial-boundary-lint.mjs` | 0; `commercial-boundary.log` |

The issued primary package-check sequence ran serially. The supplementary OpenAPI attempt was started before the supplementary regression poll had reported completion; those two briefly overlapped. Only one Vitest process ran, limited to two workers. A subsequent interrupt request found OpenAPI already exited 1 from the sandbox IPC denial; it was not rerun or bypassed. The failed OpenAPI startup is an environment failure, not a stale-schema finding, approval-review rejection or implementation test failure.

`pnpm lint`, `pnpm lint:lanes` / committed-range root lane check: **NOT RUN**, per issued header. The existing scanner rejects a self-comparison when `origin/main == HEAD`; no commit, fake comparison or different base was created to obtain green. A separate read-only **working-tree scope check**, using the actual loaded lane policy and lanePathAllowed, verifies that every new path is allowed and no tracked file changed. It is labelled scope inventory, not a committed-range lane pass. Dispatcher/CI owes the real lane checks after commit.

Full `pnpm test`, DB/migration, browser/e2e/native and root commit-dependent checks: **NOT RUN in sandbox**, with existing CI obligations retained. No PostgreSQL, localhost service or browser started. No AI/prompt/model/gateway change; no fixture or live evaluation applies. The Claude checker attempt below is independent code review, not a product live-model evaluation.

## Independent reviewers and holds

Independent **gpt-6.1-sol / high** collaboration reviewer `/root/sol_high_review` returned **PASS — read-only snapshot review; no blocking findings**, bound to test SHA-256 `b15bf23333fd8644de0c49966e6006cbd5ccc7ec5dd37c4a3fdbc166519f57fc`. It inspected the tests, unchanged source, final green log and all nine negative controls. It executed no tests and wrote no files. The actual response is retained in scratch `sol-high-review.md` (transcribed by builder with provenance). Its nonblocking caveat is the redundant per-job/aggregate guard above. This is an independent model response for the test bytes, **not exact-commit review or acceptance of the entire eventual diff**.

The explicitly requested **Claude Opus / high** check was attempted with tools disabled, no session persistence and no MCP tools. Actual command:

```sh
claude --print --model opus --effort high --tools '' --strict-mcp-config \
  --disable-slash-commands --no-session-persistence --output-format json \
  < /private/tmp/jg-test-tests-baseline-parser-1/opus-review-prompt.txt \
  > /private/tmp/jg-test-tests-baseline-parser-1/opus-review.json \
  2> /private/tmp/jg-test-tests-baseline-parser-1/opus-review.stderr.log
```

Exit **1**, result **“Not logged in · Please run /login”**, `duration_api_ms: 0`, zero model token usage. **No Opus verdict exists.** No login, credential change, alternate provider or fallback reviewer was attempted. RED requires that missing review, exact-commit binding after dispatcher's commit, and separate technical acceptance. PARK remains mandatory; builder does not accept its work.

## Compatibility, invariants and retained scratch

C4 money/DB guarantees are preserved by zero money or database implementation edits. C6 pure-domain coverage is added without claiming DB/browser evidence. No migration/backfill, rollback, grant, Standard F, authorization, audit, durable import, authenticated scope, deployment or production-accounting change. No new alert/config/provider flow. This task does **not** complete ENT-9 acceptance, establish historical completeness, or approve real histories or a pilot method. All earlier commercial/security/release gates remain.

Retained scratch root: `/private/tmp/jg-test-tests-baseline-parser-1/`. No scratch file was deleted. Retained contents include both control scripts, nine directories above (parser/test/dependency copies, package marker, node_modules symlink and initial test snapshot), nine `red-*.log` files, mutation manifest/results, green logs, typecheck logs, lint/build logs, independent reviewer prompt/outputs, working-tree scope evidence and final retained-file manifest. No generated historical fixture data is written there. Intended commit subject/body is in `/private/tmp/jg-msg-tests-baseline-parser-1.txt`.

## Closing verification

Final source checks confirm **zero tracked-file changes**, exactly the four allowed new files and test SHA-256 unchanged from the independent Sol review. `git diff --check` passes; a separate new-file whitespace scan checks untracked contents as well. Final HEAD remains `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`; no commit is created. Final resource and scope results are in scratch `final-scope.log`. The retained manifest is `retained-manifest.json` (paths, sizes, SHA-256; node_modules links listed without traversing them).

Result: **64 new tests and 21 prior baseline tests pass; typecheck, package lint, build and applicable source lints pass.** OpenAPI remains held on sandbox IPC permission; the commit-dependent lane check and broader mandatory CI remain owed. Opus is unavailable due missing CLI authentication; RED exact-commit model pair and separate acceptance remain held. **PARK.**
