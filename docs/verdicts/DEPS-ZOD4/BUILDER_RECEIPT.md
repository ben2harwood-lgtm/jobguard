# DEPS-ZOD4 builder receipt — round 2, 24 October 2026

Builder evidence only. Independent exact-commit review and separate acceptance remain outstanding. No Git write commands, commit, push, PR creation or deployment performed.

## Scope and changes

The coordinator resolved and installed exact Zod 4.6.6 across all consuming workspaces and the lockfile. This run used that installed version; no dependency download, temporary package replacement or diagnostic Zod implementation was used. The remaining body-parser advisory belongs to separately dispatched PR #310 (dispatcher evidence; not independently audited here).

Round-1 migration retained: explicit two-argument records and sparse enum records, prefaults preserving pre-parse validation/transforms, Zod 4 generic/output types and object-shape access, email/URL helpers, and permissive GUIDs with the original `Invalid uuid` message. Strict objects, schema bounds, money limits and brands remain enforced. The new throwing-getter oversized-array test executes the real patched array parser without allocating a huge array.

Round-2 repairs:

- Restore the former optional semantics of unknown quantity/authority fields. Missing quantity reaches `INVALID_QUANTITY`, while any other malformed command remains `INVALID_COMMAND`; missing download authority produces the same seven-key refusal and cleanup requirement as revoked authority.
- Add shared pure timestamp schemas in `packages/core/src/datetime.ts`. Zod 4.6.6 now requires seconds for qualified ISO datetimes; the existing contracts allowed minute precision. The shared schemas preserve valid Gregorian dates, optional seconds, unbounded fractional precision and colon/colonless offset syntax. UTC-only boundaries remain UTC-only. Precision-six boundaries continue using the equivalent precision-six validator. Receipt/origin validation still independently enforces offsets from -23:59 to +23:59, producing one field issue for impossible offsets. The money allocator and arithmetic were not changed.
- Strengthen the new compatibility test with leap dates, minute-precision UTC and offset timestamps, offset issue paths, missing quantity and command-error precedence. No existing test expectation or fixture was edited.
- Existing tests require exact byte hashes for five modified authentication repository files and exact AST syntax for the worker's queued-context constructor. Restore those files/that constructor's reviewed source rather than change those expectations. These are the test-proven exceptions to the GUID-helper migration: `practice-session.ts`, `contractor-party-repository.ts`, `work-order-repository.ts`, `job-scheduling-repository.ts`, `contractor-session-context.ts`, and worker `queueContext`. Their existing UUID syntax is retained; other migrated UUID sites retain `z.guid({ error: "Invalid uuid" })`.
- Preserve the supplier application's existing regex error contract for invalid quantities (`ZodError`, `invalid_string`, `regex`, `Invalid`, same path). Parsing uses Zod 4; only the legacy error constructor from the installed package's compatibility export is used to represent this existing public failure. No v3 schema or array parser is used by the adapter. Other failures retain their original Zod 4 error.
- Building core before an unrestricted Vitest run still produced five ENOENT failures in compiled duplicate tests, because they try to read TypeScript next to `dist/*.js`. Scope the core test script to `vitest run src`, matching API's source-test selection. All 124 source test files still run, with 2,953 tests; no source test was removed or skipped.
- Refresh the exact-file lane inventory, including `pnpm-lock.yaml`. The lane's own file is implicitly permitted by the existing checker; self-granting it is prohibited. There is no new web workflow (C1).

## Environment and checks

Node 24.17.0, pnpm 10.28.1 through `PATH=/private/tmp/jg-zod-bin:$PATH`. The global pnpm 11 launcher stalled; it was stopped before using the pinned cached launcher. Dependencies were already installed. Builds and requested package checks ran one at a time; a failed OpenAPI CLI attempt briefly overlapped the tail of the supplemental tooling tests, and subsequent checks ran sequentially; all Vitest runs use at most two workers and all Turbo runs concurrency one. Observed load averages were below 20. Full logs: `/private/tmp/jg-zod4-r2-*.log`.

The sandbox prohibits listener binding and PostgreSQL startup. No real PostgreSQL or browser integration result is claimed. Source-inspected, test-executed and independently verified are separate claims.

| Command (pinned PATH above) | Exit | Result |
| --- | --- | --- |
| `pnpm turbo run build --filter=@jobguard/core --concurrency=1` | 0 | Core build before source tests; rebuilt after timestamp changes. |
| `pnpm --filter @jobguard/core test --maxWorkers=2` | 0 | All 124 source files, 2,953 tests pass. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2` | 1 | Diagnostic after build: 5 compiled-duplicate ENOENT failures, 5,901 passes. Fixed by the source-only package test script above. |
| `pnpm turbo run build --filter=@jobguard/api --concurrency=1` | 0 | Initial API/dependency build. |
| `pnpm build --concurrency=1` | 0 | All 7 workspaces, including Next production build; final build after shared timestamp and supplier adapter changes passes. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2` | 1 | Final run: 2,077 pass, 129 fail, 23 skipped, 129 listener errors. HTTP failures are `listen EPERM` / Supertest null listener ports. Final-account and shadow isolation setup fail to acquire PostgreSQL ports. Earlier source-stamp, AST and application regressions pass. These environment-blocked suites remain mandatory in CI. |
| `pnpm --filter @jobguard/config exec vitest run src --maxWorkers=2` | 0 | 41 source tests pass. |
| `pnpm --filter @jobguard/ai exec vitest run src --maxWorkers=2` | 0 | 147 source tests including fixture golden evaluations pass. No live-model or provider evaluation claimed. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | 0 | 40 files, 867 tests pass. |
| `pnpm typecheck --concurrency=1` | 0 | All 7 workspaces. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | 1 | Core purity passes; lane checker refuses self-comparison because uncommitted branch HEAD equals origin/main. No Git writes permitted; dispatcher must rerun after committing. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same honest self-comparison refusal. Supplemental working-tree inventory uses the real policy loader and `lanePathAllowed`; no uncovered changed path. |

Final results on the working-tree implementation:

| Additional / final command | Exit | Evidence |
| --- | --- | --- |
| `pnpm --filter @jobguard/config exec vitest run --maxWorkers=2` | 0 | 82 tests, including compiled duplicates. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts'` | 0 | All 72 non-integration files / 638 tests pass. Explicit local exclusions retain mandatory PostgreSQL/listener checks in CI. Initial focused supplier run had 3 failures; the final complete unit run includes and passes those unchanged tests. |
| `pnpm --filter @jobguard/storage exec vitest run src --maxWorkers=2` | 0 | 2 source adapter tests; no live S3 claim. |
| `pnpm turbo run lint --concurrency=1` | 0 | Package lint in all 7 workspaces. This supplements, and does not replace, blocked root lane-aware lint. |
| `node tools/money-arithmetic-lint.mjs` | 0 | Exact-money guard passes. |
| `node tools/commercial-boundary-lint.mjs` | 0 | Commercial-boundary guard passes. |
| `node --test --test-concurrency=2 tools/*.test.mjs` | 0 | All 126 tooling tests pass. |
| `pnpm --filter @jobguard/api openapi:generate` | 1 | tsx CLI cannot create its IPC listener: EPERM. |
| `pnpm openapi:check` | 1 | Same tsx CLI IPC restriction. |
| `node --import tsx src/generate-openapi.ts` in `apps/api` | 0 | Actual generator, direct loader avoids the CLI-only IPC listener. |
| `node --import tsx src/generate-openapi.ts --check` in `apps/api` | 0 | Actual generated output check passes. |
| Real `loadLanePolicy` / `lanePathAllowed` over tracked + untracked changes | 0 | All 201 changed paths covered, including lockfile and implicitly permitted own lane file. Not represented as official range-check success. |
| `git diff --check` | 0 | No whitespace errors. |

OpenAPI regenerated output is byte-identical to `origin/main:apps/api/openapi.json`; there is no contract diff to explain. SHA-256: `21376c65338815e24d1dffb8e3ba8dc33ab3e3ce70760cfd2b3ab687ba39868a`.

No dependency advisory scan was attempted in this network-restricted run. The coordinator's installed-lockfile/advisory evidence is separately supplied by the order; this receipt does not claim an independently executed online scan.

## Invariants and handoff

Affected: boundary validation, exact error classification, timestamp language, money input validation, authentication source guards and schema output types. No SQL migration, financial formula, permission, audit-storage rule, provider route, prompt or model changed. No new operational alert. No customer data or live external provider call. Existing real-data, commercial, residency, live-model and release gates remain unchanged.

Shared-file overlap: core's public index adds the UTC timestamp schema export; package manifests and lockfile overlap the coordinator's dependency-resolution work. Other dependency leaves must serialize overlapping source edits. The lane inventory covers these exact paths.

Rollback is source/manifests/lockfile together; reverting the dependency also restores its reported security vulnerability. Production/browser/PostgreSQL/migration checks remain required in GitHub CI. Independent verdict and separate acceptance must bind to the dispatcher's exact eventual commit.

Intended dispatcher message: `/private/tmp/jg-msg-deps-zod4.txt`. The required `do not commit` first line records the unresolved environment/range checks; it is not a claim of technical acceptance.
