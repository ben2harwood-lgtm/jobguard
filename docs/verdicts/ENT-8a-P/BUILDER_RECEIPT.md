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
