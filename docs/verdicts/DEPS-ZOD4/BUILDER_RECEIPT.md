# DEPS-ZOD4 builder receipt — round 3, C243, 24 October 2026

Repair of PR #312 head `b80681eb2a0315d37e0ac38bcf4a1450ff37f1ad`, branch `codex/sandbox/deps-zod4`. Builder evidence only; this is not an independent verdict or acceptance. The order reports both Claude reviewers as REPAIR; fresh independent review must bind to the dispatcher's eventual commit. No Git write, package download, push, PR mutation or deployment performed.

## Changes limited to C243

- `apps/api/src/workspace/contracts.ts` now imports only Zod at runtime. Its local UTC datetime schema uses the identical date/time regex composition and error message as core `utcDatetimeV1`. `contracts.datetime.test.ts` compares both schemas on 250 inputs: valid and invalid leap dates, minute/second precision, long fractions, impossible times, offsets, missing zones and non-strings. Browser specs are unchanged; core's `vitest run src` script is unchanged.
- Shared `packages/config/src/auth-url.ts` checks the original string **before** Zod URL parsing: `value === value.trim()` and no tab, CR, LF, NBSP or BOM anywhere. It does not ban ordinary spaces or other Unicode whitespace inside paths. Applied to tenant credential origin; OIDC config/request issuer and redirect URI; OIDC claims issuer; SSO metadata callback/entry point; identity database URL and allowed origin. Existing URL/protocol/domain, length and credential restrictions remain in place. The config public export is the only new shared registration.
- Restore supplier regex issue insertion order to `validation`, `code`, `message`, `path`. `supplier-document.error-body.test.ts` compares the serialized `{code: error.message}` body byte-for-byte with the legacy regex error, covering inner and outer key order and error wording. Production parsing remains Zod 4; the test uses a small legacy regex schema solely to obtain its expected error representation.
- Extend the exact-file lane inventory for the five new source/test files. No route adapter, browser spec, package manifest, lockfile, financial calculation, database schema, permission, prompt or model changed in this round.

## Regression proof on the supplied head

Before changing production source, added `apps/api/src/auth/url-compatibility.test.ts` and ran:

`pnpm --filter @jobguard/api exec vitest run src/auth/url-compatibility.test.ts --maxWorkers=2`

**Exit 1: 137 failed, 13 passed (150 tests)** on unchanged `b80681eb` implementation. Log: `/private/tmp/jg-zod4-r3-red.log`. This exercises ten boundary/field combinations, valid URLs, leading/trailing whitespace and embedded tab/CR/LF/NBSP/BOM (authority and path). After repair the same 150 tests pass. The config unit test additionally verifies valid path spaces, percent escapes and embedded em-space are preserved verbatim, avoiding an overbroad all-whitespace ban.

## Client-visible error audit

Searched all `apps/web` client source, unit tests and e2e with `rg` for `e.message`, `error.message`, `.code`, `.message`, `JSON.parse`, `invalid_string`, `invalid_format`, `Invalid uuid`, `Invalid url`, `ZodError`, and code/message comparison, regex and string operations. Full search output is in `/private/tmp/jg-zod4-r3-{client-error-search,error-test-search,error-comparisons,client-consumers,zod-assertion-search}.log`.

Results:

- The affected materials/material-rates, purchase-orders, supplier-documents, supplier-matches, things-to-check, relevance-inbox, readiness, final-account and customer-invoice route families return error text as `code`; their route source, response keys/order, status selection and response structure are unchanged.
- `materials.tsx`, `purchase-order.tsx`, `supplier-documents.tsx`, `supplier-match.tsx`, `supplier-fact-editor.tsx`, `things-to-check.tsx` and `final-account-lock.tsx` throw/display opaque response codes/messages. No Zod issue text is decoded or compared. `relevance-inbox.tsx` and `job-final-account.tsx` do not parse that text. `final-account.tsx` parses stored lineage JSON, not error text.
- Named-domain-code handling exists elsewhere: `recovery-case-requests.ts` validates typed refusals and compares stale codes; `practice-receipts-state.ts` maps named codes; `jobguard-app.tsx`, `job-parties.tsx`, contractor admin and client approval screens classify named authorization/conflict codes. `evidence-packs.tsx` matches STALE/CONFLICT/SOURCE_NOT_FOUND, and `recovery-messages.tsx` classifies named recovery codes. These are not Zod issue-message parsers. `receipt-http-error.ts` and its unit test classify the error **name** `ZodError`, preserving a fixed `INVALID_RECEIPT_COMMAND` response.
- E2e/unit assertions compare named business codes (including ENT-1, CH-2/CH-3a, SV-4, MON-7, M4-5-S/M4-6-S) or generic string type (ENT-10a). No assertion parses/depends on serialized Zod issue wording. No `invalid_string`/`invalid_format` consumer or assertion was found in `apps/web`.

Therefore the order's allowance for changed Zod issue wording applies; no broad error-text translation was added. Supplier regex bytes are explicitly preserved and tested as requested.

## Commands actually run

Node `v24.17.0`; pnpm `10.28.1` via `PATH=/private/tmp/jg-zod-bin:$PATH`. Installed dependencies reused. Checks ran **one at a time**, all Vitest runs at most two workers and Turbo concurrency one. Observed load averages remained below 20 (approximately 3–6). Logs: `/private/tmp/jg-zod4-r3-*.log`.

| Command | Exit | Evidence |
| --- | --- | --- |
| `pnpm build --concurrency=1` | 0 | All 7 workspaces, including Next production build. |
| `pnpm typecheck --concurrency=1` | 0 | All 7 workspaces. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | 0 | Root purity/lane/money/commercial guards and all 7 package lints. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Actual lane boundary check, including current uncommitted/untracked paths. |
| `pnpm --filter @jobguard/core test --maxWorkers=2` | 0 | 124 source files, 2,953 tests; source-only selection retained. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2` | 1 | 2,229 passed, 129 failed, 23 skipped; 123 files passed, 9 failed. 129 listener errors are `listen EPERM` / Supertest null listener-port failures. Two additional failed suite setups: final-account isolation cannot obtain port 58400..58650; shadow isolation cannot obtain port 58000..58500. Environment-blocked, not represented as passes. |
| `pnpm --filter @jobguard/config exec vitest run src --maxWorkers=2` | 0 | 5 source files, 42 tests. |
| `pnpm --filter @jobguard/ai exec vitest run src --maxWorkers=2` | 0 | 15 files, 147 tests, including fixture evaluations. No live-provider/model claim. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | 0 | 40 files, 867 tests. |
| `pnpm openapi:check` | 1 | tsx CLI's IPC listener denied with EPERM. |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | 0 | Same actual OpenAPI check through direct loader; no generated output changes. |
| `pnpm --filter @jobguard/web exec playwright test --list` | 0 | **All 380 tests in 69 files list.** No browser test execution, dev server or use of port 3000. |
| `pnpm --filter @jobguard/api exec vitest run src/auth/url-compatibility.test.ts src/workspace/contracts.datetime.test.ts src/supplier-document.error-body.test.ts --maxWorkers=2 --reporter=verbose` | 0 | All 3 repair files, 152 tests pass. Focused run isolates the repair evidence from environment-blocked API suites. |
| `git diff --check` | 0 | No whitespace errors. |

No clean reinstall was attempted: the order forbids downloads and supplies installed dependencies. No DB/migration or executed-browser suite was attempted separately; the sandbox cannot bind listeners or start PostgreSQL, and the order restricts Playwright to discovery. Coordinator/GitHub CI must run the listener-dependent API, real PostgreSQL/migration and executed-browser suites after committing/pushing. None of those checks was weakened or made optional.

## Handoff

No migrations or new operational alerts. Affected invariants: boundary strictness, tenant-origin rejection, timestamp compatibility and public error serialization. Rollback: revert this round's source/test/lane changes together; the prior core Zod migration remains independently reviewable. Commercial, real-data, residency, provider and live-model release gates are unchanged. Shared config index ownership is serialized in this task. Independent exact-commit verdict and separate technical acceptance remain required.

Intended conventional commit message written to `/private/tmp/jg-msg-deps-zod4.txt`; dispatcher owns Git writes.

---

Historical round-2 receipt follows unchanged; its command results and blockers describe that earlier run, not round 3.

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
