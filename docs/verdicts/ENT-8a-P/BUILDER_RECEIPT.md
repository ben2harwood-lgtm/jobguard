# ENT-8A-P builder receipt

Status: implementation handoff; acceptance held. Issued 18 October 2026; base `b881f90b`; branch `codex/sandbox/ent-8a-p`. Synthetic practice only. No commit or push by builder. The executable lane uses the draft's exact `ENT-8a-P` path casing.

## Authority and scope

Read repository AGENTS.md, BUILD_PLAN.md §§9.1.4–10 and ENT-8a, and Ben's 17 October answers directly. Sub-order A only. Migration 0189 reserved by dispatcher; 0188 belongs to another PR. Existing migration files and shared lane register remain unchanged.

STOP for optional end check only: base has no authoritative enterprise agreement store or contractor job-completion command. Visit completion is not job completion. Positive end-check acceptance and whole-row closure remain outstanding. No competing settings/agreement or completion subsystem is authorized.

RED lane: two independent Claude checks against the eventual exact commit, plus separate technical acceptance, remain required. This receipt is builder evidence, never independent acceptance.

## Execution evidence

- Working tree clean at initial inspection (`git status --short`). No Git write commands run.
- Runtime: Node v24.17.0. Cached pinned pnpm 10.28.1 used via `/private/tmp/jg-ent-8b-sor-bin/pnpm`; no packages downloaded. Default global pnpm version probe stalled on its version-switching path.
- PostgreSQL integration and migration suites: NOT RUN, dispatcher sandbox restriction. CI must run them after dispatcher commit/push.
- Browser/Playwright/e2e: NOT RUN, explicitly forbidden by dispatcher. Existing CI requirements remain in force.

Final test results and implementation coverage will be recorded before handoff.

## Implemented changes and limits

- Migration 0189: seven append-only tenant/job-qualified tables, FORCE RLS, no runtime direct table privileges; six checked entrypoints plus private helpers. Session authority, live state and source/command identities precede new writes or replay. Shared receipt guard preserves the original successful result; audit checks make command/fact/origin outcomes atomic. New origin branch preserves predecessor framing/guards byte-for-byte below the prompt-specific branch.
- Rules (b)–(d), immutable settings, materials source deduplication and quarantine, visit source-arrival hook before audit, paginated scoped inbox/detail, checked confirmation/dismissal and real persisted office-origin advisory trigger.
- Confirmation supports explicit catalogue work resolution for visit/closeout and exact instructed-line excess selection for materials. It neither prices nor approves. ENT-5 remains the separate progression path.
- Rule (a) source reader calls the merged calculator and verifies stored-note preimages/citations. The photo path now reads command-finalized original PNG bytes and CRC-checked explicit metadata tags, bound to native evidence hash/length/version. Positive photo source tests and all six observation properties are written, NOT RUN. Existing image intake creates no text-note objects; no new note uploader is claimed.
- End check remains refusal-only pending authoritative agreement/version and active-owner job-completion seams. No row closure or whole-task acceptance is claimed.
- Quarantine/unevaluated comparison counts are command result diagnostics; no provider or external alert delivery is added. Immutable source history remains for investigation.

## Check results

Commands use cached pinned pnpm 10.28.1; logs are under `/private/tmp/ent-8a-p-*.log`.

| Command/check | Observed result |
|---|---|
| `pnpm typecheck` | Earlier integrated run PASS: 7 tasks; final follow-up results below. Earlier intermediate run failed before DB export; intermediate compiler attempts hit 4GB OOM/deep Zod type comparisons, repaired with structural parser signatures. |
| `pnpm build` | Earlier integrated run PASS: 7 tasks, including Next static generation. No browser run. |
| `LANE_BASE_REF=origin/main pnpm lint` | BLOCKED at lane checker: HEAD equals origin/main, so self-comparison is refused before package lint. No scanner weakened. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Same self-comparison refusal. Requires dispatcher commit then rerun. |
| Working-tree exact allowlist check | PASS; used existing lane policy/parser helpers on tracked diff plus untracked files. This is not the full lane check. |
| Core purity, money arithmetic, commercial boundary lint scripts | PASS. |
| `node --test tools/*.test.mjs` | PASS: 100 tests. |
| `pnpm --filter @jobguard/core test` | FAIL: 5 assertions among generated `dist` test copies (5,610 passed); assertions resolve source paths from compiled location. No source test removed or weakened. |
| `pnpm --filter @jobguard/core exec vitest run src` | Earlier run PASS: 112 files, 2,809 tests. This source-only result is not a full root-suite pass. |
| `pnpm eval` | PASS: 11 files, 115 tests. Includes separate four-rule persisted-fixture false-prompt/missed-extra metrics. Supplied synthetic facts only, no live model or database execution. Legacy rule-(a) report still labels its own b–d scope held. |
| Focused API three new suites | PASS: 21 tests; final run used normal built workspace exports. Controller-method tests bind no socket; mocked read-after-write is not PostgreSQL proof. |
| `pnpm openapi:check` | BLOCKED: tsx CLI IPC pipe listen EPERM. |
| `TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/src/generate-openapi.ts --check` | PASS: same generator without CLI IPC server. |
| Privilege inventory schema/path validation | PASS: 1,171 entries. Initial added exception target `retain` was refused, corrected to `review_at_card`; new entries await independent review, not self-approved. |
| TypeScript compile of new PostgreSQL test files via temporary config | PASS (no test execution). |
| `pnpm test` aggregate | NOT RUN: includes prohibited PostgreSQL subsystem. Component results above are not an aggregate pass. |
| `pnpm test:db`, `pnpm test:migrations` | NOT RUN: dispatcher prohibits PostgreSQL startup in this sandbox. |
| Playwright/e2e | NOT RUN: explicitly prohibited. Existing CI checks untouched. |

Failing-first evidence: API application test initially failed because its implementation module was absent. Core tests were written first, but the first runner invocation hung, so no observed core red result is claimed. PostgreSQL tests were written but never executed; neither red nor green database results are claimed. AI's initial missing-built-core failure was infrastructure setup, not a behavioural red test.

## Review and handoff

Database tests cover command identity/replay, no-op identity, live/authority refusals, resolution races, office links, source quarantine, catalogue and own-step/failed-upgrade preservation. They do not establish any PostgreSQL guarantee until CI actually executes them. Rule-(a) positive source properties and ENT-5 submit/approval progression are included in the unrun PostgreSQL suite. End-check positive completion remains unimplemented pending owning seams. All acceptance assertions must be demonstrated before whole-task acceptance.

No migration applied; no historical backfill; no provider calls, releases, fees or external sends. Forward fix is disabling new entrypoints/hooks while retaining immutable history. Shared exports, AppModule, OpenAPI, watchdog registry and catalogue files require serialization with other lanes. RED two independent Claude verdicts on the dispatcher's exact commit and separate technical acceptance remain outstanding. Commit message is supplied separately; no Git writes performed.

## Final follow-up validation

Added explicit `existingExtraId` selection for ambiguous exact matches; the selected extra must already match the same job/work identity. Added PostgreSQL refusal/coalescence coverage (NOT RUN). No origin or duplicate-group mutation is authorized by this field.

Final API suites: 21 tests PASS. Source-alias OpenAPI generator/check PASS. Working-tree allowlist PASS for all 38 paths; `git diff --check` PASS. Two concurrent typecheck/build follow-ups were interrupted after four minutes to reduce contention; neither is a pass. Two subsequent full core source runs failed only on existing five-second timeouts (first: 5 failed/2,805 passed; second: 3 failed/2,807 passed). No timeout or test assertion was weakened. Earlier passing results above are not substituted for these final failures.

Final `pnpm eval`: PASS, 11 files/115 tests. Final core source run with two workers: 2,808 passed, 2 timed out in existing receipt-allocation tests (112 files, 111 passed). This is a FAIL, not a full-suite pass. The new core persistence tests passed in that run.

Final `pnpm typecheck`: PASS, 7/7 tasks (two cached), log `/private/tmp/ent-8a-p-typecheck-final5.log`.

Final PostgreSQL test TypeScript compilation: PASS using `/private/tmp/ent-8a-p-db-test-tsconfig.json`, including explicit existing-extra selection coverage. This is source compilation only; PostgreSQL tests remain NOT RUN.

Final `pnpm build`: PASS, 7/7 tasks (two cached), including API compilation and Next static generation; log `/private/tmp/ent-8a-p-build-final5.log`. Existing webpack dependency warnings and Turbo cache-permission warnings did not fail the build. No browser execution. Intended commit message: `/private/tmp/jg-msg-ent-8a-p.txt`. No commit or push performed.


## r1 (CI)

18 October 2026. Builder: Codex gpt-6-astra. Issued head `13b4780e`, PR #288, CI run `39133896077`. This is a builder repair receipt, not independent review or acceptance. No commit/push or Git writes performed. Prior inspection verdicts do not cover this uncommitted repair.

### Repairs

- Migration **0191**: parenthesize the JSON locator before subtracting allowed keys. PostgreSQL arithmetic precedence otherwise tries to parse the literal `locator` as JSON, preventing all valid photo observations from reaching source validation.
- Migration **0191**: acquire job serialization key 417 before the live-job SHARE lock. Previously a second confirmation/dismissal could hold that row lock while waiting for the first command's advisory key; the first command's scope write then needed to upgrade the row lock. Visit completion now takes that same key before its live check, and the internal hook follows the same order. Tenant authority remains first and audit remains last; no deadlock is hidden by error remapping. Existing race assertions are unchanged.
- Revoked-session fixture uses the merged audited `ContractorPracticeSessionRepository.revoke` with the persisted session context, rather than a raw update rejected by `PRACTICE_SESSION_AUDIT_REQUIRED`.
- Closeout fixture selects `CLEAR-GUTTER` (off-order, present in the immutable SoR), instead of `FIT-LOCK` (already on demo order 1). Both rejection of a missing identity and the no-implicit-price assertions remain.
- Duration fixture imports standards into a fresh schedule instead of colliding with the seeded schedule's unique 2026-01-01 effective date. It still revises the contract and order through the existing command paths.
- LP0-17: add exactly the 15 new `lp_*` routine protection records. Existing entries and assertions are untouched. The added metadata is source-inspected; `definitionSha256` is null because no `pg_get_functiondef` output was obtained. No fabricated database digest. Schema/path validation passes: 1,177 entries, 341 routine records.
- Executable migration references already used 0191; update remaining current documentation/lane-note references from 0189. Earlier receipt entries are retained as historical evidence.

No new migration number, grants, business policy, external action, backfill or release capability. Existing 0191 forward-fix guidance remains applicable. No merged test assertion changed.

### Item-specific STOPs

- **SERIOUS-B5 upgrade:** STOP pending the actual text/location of standing ruling 113. The merged test snapshots through 0186, then applies every later migration; its only additive allowance is the two 0188 tables and five helpers. The excerpt correctly shows 0191's seven new tables breaking that whole-tail comparison. Ruling 113 was referenced but not supplied or found in the repository. Do not guess an exemption or alter this merged assertion. Asked dispatcher for the ruling; all other work continued.
- **Role × permission conformance:** STOP pending the omitted failure name/assertion and owning-lane direction if needed. The excerpt contains failures 1–13 only. 0191 changes neither `contractor_allowed` nor `contractor_role_permits` nor the core permission matrix. Shared merged role assertions remain untouched.
- **Migration ordering against moving origin/main:** STOP for dispatcher integration. Both requested lane-aware lint commands refuse 0191 because origin/main now contains migration 0192. The issued worktree still uses 0191 as explicitly assigned. No main merge, renumber, shared-list rewrite or lint bypass performed.

### Validation (local, installed dependencies)

Node 24.17.0; cached pinned pnpm 10.28.1 via `/private/tmp/jg-allocation-pnpm-bin`. Initial unpinned PATH invocations stalled before running package checks and were interrupted; no install/download command issued. No clean reinstall claimed.

- DB + API typecheck: PASS (`pnpm --filter @jobguard/db --filter @jobguard/api typecheck`).
- DB + API package lint: PASS (same filters, `lint`).
- `LANE_BASE_REF=origin/main pnpm lint` and `lint:lanes`: FAIL at migration order, as above. Core-purity lint passed before the failure; separate money-arithmetic and commercial-boundary lint passed.
- Tool unit tests: PASS, 100 tests.
- Core source unit tests: PASS, 115 files / 2,898 tests (`vitest run src --maxWorkers=2`).
- Synthetic `pnpm eval`: PASS, 13 files / 125 tests. No live-model evidence.
- OpenAPI normal script: BLOCKED by tsx IPC listen EPERM. Same generator via `TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/src/generate-openapi.ts --check`: PASS.
- PostgreSQL test-file TypeScript compilation: PASS using the existing temporary `ent-8a-p-db-test-tsconfig.json`; source compilation only.
- Inventory parse/path validation and `git diff --check`: PASS.
- PostgreSQL / migrations / browser: **NOT RUN**. An initial Vitest `src` substring filter inadvertently also selected two `test/audit-*-dbsrc-*.integration.test.ts` files; it was interrupted and replaced with explicit `--exclude 'test/**'`. No PostgreSQL result or guarantee is claimed. API HTTP runs encountered prohibited socket use and were interrupted; a separately enumerated non-socket unit subset is recorded below. No assertion or timeout changed.

Remaining local run results are appended below. Logs: `/private/tmp/ent-8a-p-r1-*.log`. CI must execute PostgreSQL fixtures, races, migration and catalogue suites before technical acceptance; the two held items above are not represented as fixed.

Final r1 local results:

- `pnpm build`: PASS, 7/7 tasks (2 cached), including Next static generation. Existing webpack/Turbo cache warnings did not fail the build.
- DB source units with explicit `--exclude 'test/**'`: first run 180 passed / 1 existing source-graph timeout; unchanged rerun with one worker PASS, 22 files / 181 tests. No timeout relaxed.
- Enumerated API subset: 104 files / 1,754 tests PASS; the aggregate command FAILS because `final-account-lock.isolation.test.ts` imports the real-DB harness indirectly and cannot obtain a localhost port (one skipped test). PostgreSQL did not start. This is not a full API-suite pass. Selection list: `/private/tmp/ent-8a-p-r1-api-unit-files.txt`; result: `/private/tmp/ent-8a-p-r1-api-unit-selected.log`.
- No new approval, independent verdict or acceptance claimed. Intended commit subject/body written to `/private/tmp/jg-msg-ent-8a-p.txt` for dispatcher use. No commit or push.
