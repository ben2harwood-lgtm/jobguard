# TESTS-ERRORS-1 — Builder receipt

Status: **PARK / technical acceptance HOLD**. Decision 74, RED lane, BUILD-DON'T-MERGE. Work remains uncommitted for the dispatcher. This receipt is execution evidence, not builder self-acceptance.

## Scope and environment

- Worktree: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/tests-errors-1`.
- Branch: `codex/sandbox/tests-errors-1`.
- Starting HEAD and `origin/main`: `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`; initial `git status --short` empty.
- Disk preflight: `df -g /System/Volumes/Data` reported 53 GB available, above the 33 GB floor.
- Existing prepared dependencies used; no install or package download command run. Cached pnpm 10.28.1 invoked through a scratch PATH shim; `COREPACK_ENABLE_NETWORK=0` for recorded checks. The default pnpm wrapper version probe stalled and was interrupted; it was not used for checks. Runtime Node v24.17.0 differs from `.nvmrc` v24.15.0; no pin changed and no clean pinned reinstall claimed.
- Read `AGENTS.md`, `BUILD_PLAN.md` §2.4 including C5 and §12.2's SBOX-SESSION-1 amendment, the filter/error definition, neighboring test coverage and the named audit draft. `checks/J6-jobguard-next-orders-night4-check.md` was absent from this checkout; its READY verdict is supplied dispatch context, not independently verified evidence.

Changes are exactly the new PE1 test, requested lane file, ledger and this receipt. No product code or existing test changes. No migrations, grants, permissions, money, policy, API, provider or deployment changes; standard F unchanged. No new operational alert, compatibility impact, shared registration overlap or adjacent work discovered.

## PE1 and mutation evidence

Three parameterized cases use real `PracticeAccessError` instances with fictional tenant/job/evidence IDs, diagnostic text, message, stack, cause and a spying enumerable `toJSON`. They assert exact status calls (401/404/403), exactly one JSON call with exactly `{code}`, exact `JSON.stringify` output and zero calls to the attached serializer. Soft body/serializer assertions let the scratch mutation report every redaction failure independently.

Scratch baseline and mutant filters/tests are preserved under `/private/tmp/jg-test-tests-errors-1/{baseline,mutant}/`; the test copies are byte-identical to the repository test. Only the mutant replaces `.json({code:error.code})` with `.json({...error})`. `mutation.diff` records that sole filter difference. Scratch resolution uses a symlink to existing API dependencies and a scratch tsconfig extending the repository config; no vendor, DB or HTTP mock replaces the filter/error classes.

The first mutation attempt stopped at module resolution because the fresh checkout lacked `@jobguard/db` dist output (exit 1, zero tests); `mutation.log` preserves it. This is not mutation-detection evidence. After building shared dependencies, `mutation-assertions.log` records all three cases failing (exit 1): each exact JSON argument/body assertion, exact serialized-body assertion and uncalled-serializer assertion detects the spread regression. `real-filter.log` records all three cases passing against the unchanged real filter (exit 0). `scratch-baseline.log` records all three passing against the byte-identical scratch baseline (exit 0). The production filter was never mutated. Test invocations were sequential and each capped at two workers.

## Commands actually run

Full logs and machine-readable command/exit/timing records are in `/private/tmp/jg-test-tests-errors-1/` (`checks.jsonl`, `run-check.py`). All pnpm commands below used cached pnpm 10.28.1. No check configuration or assertions were weakened.

| Command | Exit | Result / log |
| --- | --- | --- |
| `git rev-parse HEAD` / `git rev-parse origin/main` | 0 | Both equal the starting base above. |
| `git status --short` | 0 | Initially clean; final new files limited to the four named outputs. |
| `df -g /System/Volumes/Data` | 0 | 53 GB initially; 52 GB during build. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 --root /private/tmp/jg-test-tests-errors-1/mutant practice-errors.redaction.test.ts` (first attempt) | 1 | Zero tests; missing dist entrypoint, `mutation.log`. |
| Same scratch mutant command after shared packages built | 1 | Expected red: 3 failed cases, all 9 body/serializer assertions fail, `mutation-assertions.log`. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/practice-errors.redaction.test.ts` | 0 | 3 passed, `real-filter.log`. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 --root /private/tmp/jg-test-tests-errors-1/baseline practice-errors.redaction.test.ts` | 0 | 3 passed, `scratch-baseline.log`. |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0 | All 7 package tasks passed, `typecheck.log`. |
| `pnpm exec turbo run lint --force --concurrency=2` | 0 | All 7 package tasks passed, `lint.log`. |
| `LANE_BASE_REF=origin/main pnpm lint --force --concurrency=2` | 1 | Core purity passed (212 files); unchanged lane guard then refused self-comparison, `root-lint.log`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | `Missing branch or self-comparison range; refusing a misleading pass`, `lane.log`. HEAD equals origin/main because committing is prohibited. No older base substituted. |
| `node tools/money-arithmetic-lint.mjs` | 0 | Passed separately after the root guard stopped lint, `arithmetic.log`. |
| `node tools/commercial-boundary-lint.mjs` | 0 | Passed separately, `commercial.log`. |
| `pnpm openapi:check` | 1 | tsx CLI IPC socket rejected by sandbox (`listen EPERM`); generator not reached, `openapi.log`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same unmodified generator/check via Node import loader, without the CLI IPC listener; `openapi-no-ipc.log`. Standard wrapper remains held for CI. |
| `node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json` | 0 | Supplementary prerequisite diagnostic compilation while the shared build ran. |
| `pnpm build --force --concurrency=2` | 0 | All 7 package tasks passed, including production Next compilation and static generation; `build.log`. |
| `git diff --check` | 0 | Tracked diff clean. |
| `python3 /private/tmp/jg-test-tests-errors-1/final-check.py` (first attempt) | 1 | Scratch helper incorrectly treated the normal no-index content-difference exit 1 as a whitespace failure; no whitespace diagnostics, `final-check.log`. |
| Same scratch helper after correcting its no-index exit handling | 0 | Read-only Git scope/HEAD/branch inspection, whitespace checks of all four new files (accepting a content-difference exit only with empty whitespace diagnostics), exact lane JSON, reviewed hashes and scratch-copy/mutation checks; `final-check-corrected.log`. |

Turbo emitted sandbox `IO error: Operation not permitted` warnings while caching; typecheck, package lint and build nevertheless exited 0 with all tasks successful. Next reported multiple-lockfile workspace-root and CSS autoprefixer warnings; these existing files were not changed. No environment permission escalation requested. Final review artifacts are `working-tree.patch` and `final-files.sha256.json` in the scratch output directory. The final scope check is deterministic evidence, not a substitute for the lane guard or independent review.

## Independent Sol-high source review

Actual separate reviewer: `gpt-6.1-sol`, high reasoning, fresh context, agent `/root/sol_high_review`. It performed source inspection only, without tests, writes, provider calls or sockets. Recorded response:

> **PASS — source-inspected test and lane scope only.**
>
> PE1 covers all three `PracticeAccessError` codes with exact 401/404/403 status calls, exactly one `{ code }` JSON argument, exact serialized body, and an uncalled `toJSON` spy despite attached fictional tenant/job/evidence diagnostics, message, stack and cause.
>
> Source inspection indicates `.json({ ...error })` would fail the exact-body assertions and invoke the copied `toJSON`. This mutation was **not executed by this reviewer**.
>
> The lane allows only the specified test and documentation paths, plus its implicitly permitted own configuration path. Product filter/error definitions have no diff. No findings.
>
> Test SHA-256: `14d01abce99572ca952fd24b4441a31e1d2eed43142e70c6f3b4cd969c307b71`.
> Filter SHA-256: `919a82c671e9fa44cccab5679b2c4362591e4e7a5e4d3d974a3875a843189718`.
>
> Reviewed uncommitted sources against HEAD `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`. Documentation and execution evidence were not reviewed. Overall technical acceptance remains **HOLD** pending builder checks, required Opus and commit-bound RED reviews, and separate acceptance.

No Opus reviewer is callable through the available agent tools. No external CLI/provider review was invoked under the no-outward-actions restriction. The source review above is not a final commit-bound verdict, and no second-model PASS or separate acceptance is claimed.

## Remaining gates and handoff

- Full tests, DB/migration/browser/e2e suites and final commit-dependent lane checks: **NOT RUN locally** per the issued header; no runner bypass. Explicit lane attempts are recorded as refusals rather than final commit checks. CI retains all mandatory suites after dispatcher commit/push.
- No HTTP server, database, provider delivery or broader authorization behavior verified. The response spy only stringifies the object handed to JSON.
- Dispatcher must commit, rerun the unchanged lane guard against a real commit range and obtain CI, independent Opus and exact-commit Sol-high RED verdicts plus separate acceptance. PARK until Ben's button; no merge, enablement or deployment authority inferred.
- Intended commit message file: `/private/tmp/jg-msg-tests-errors-1.txt`.
