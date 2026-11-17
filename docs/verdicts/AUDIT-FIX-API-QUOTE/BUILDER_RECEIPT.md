# AUDIT-FIX-API-QUOTE builder receipt

Issued 13 October 2026 by dispatcher 4. Branch: `codex/sandbox/audit-fix-api-quote`. HEAD and `origin/main`: `e4cb8437d044746300c377647f6061d06cd960cc` (read-only git inspection). Review lane: RED (money, authorization, tenancy). Status: **STOP — migration required; no implementation or technical acceptance**.

Read `AGENTS.md`, `BUILD_PLAN.md` §§2.1–2.4 and 5.1–5.4, and `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-quote.md`. This receipt reports source inspection only, not a reproduced PostgreSQL failure or an independent verdict.

## Mandatory migration stop

The work order says: "No migration unless the finding cannot be fixed without one (then STOP and say so)." Blocking finding 5 requires changing the protected database acceptance path:

- `packages/db/src/acceptance-repository.ts:29` uses the permanent `practice-accept:<documentId>` semantic key. A new command after cancellation replays the original acceptance.
- `packages/db/migrations/0011_quote_acceptance.sql:3` enforces `UNIQUE(tenant_id,job_id,document_id)` on immutable acceptance records.
- The same migration, lines 13–14, unconditionally inserts both `app.quote_version` using the document ID and a new `app.quote_acceptance`.
- `packages/db/migrations/0003_job_spine.sql:54` makes the quote-version ID a primary key and its job/version unique. Cancellation retains these rows and only clears the job pointer (`0011`, line 25).
- A repository search found no later replacement of `app.record_builder_attested_acceptance` or removal of the acceptance uniqueness constraint.

Changing only the semantic key would therefore proceed to duplicate-key failures. Restoring the same document's active acceptance while preserving original records and adding a new attestation needs a reviewed migration to the controlled routine and acceptance storage/projection contract. Runtime direct writes, deleting old records, or substituting a different document would not satisfy the requested acceptance assertion. No migration or grant has been written; any future grant must follow standard F. Stop occurred during initial inspection, before tests or product edits.

## Findings disposition

- 1 DROPPED from this attempt: no failing reproduction executed; stopped at finding 5's migration prerequisite before implementation.
- 2 DROPPED from this attempt: no failing reproduction executed; stopped at finding 5's migration prerequisite before implementation.
- 3 DROPPED from this attempt: no failing reproduction executed; stopped at finding 5's migration prerequisite before implementation.
- 4 DROPPED from this attempt: no failing reproduction executed; stopped at finding 5's migration prerequisite before implementation.
- 5 STOP: source-inspected migration prerequisite above; the requested accept → cancel → accept failure was not test-executed. No fix claimed.

"DROPPED" records the work-order failing-test threshold, not a finding disproved or resolved. All five remain unverified and unfixed.

LATER findings (listed only): 6 changed attestation payloads evade replay conflicts; 7 a quote line can reference another item's source revision; 8 standalone Nest lacks delivery and artifact routes. The report's five weak-test observations are also unchanged.

## Changes and preservation

Only this receipt and one compact, exact-path lane registration were added. Lane catalogue before: no `audit-fix-api-quote` row. After: one row allowing only `config/agent-lane-assignments.json` and this receipt. No other catalogue row changed. No premise-establishing test setup was added.

No product code, migration, grant, existing expected value, refusal, count, pinned name or fingerprint changed. `apps/api/src/auth/context-boundary.test.ts` and its pinned lists are untouched. No new external action, operational alert, compatibility impact, provider interaction, real data or spending. Shared registration overlap: lane registry only, this task's additive row; dispatcher owns subsequent integration.

## Execution evidence

- `git status --short`: exit 0, initially clean.
- `git branch --show-current`: exit 0, correct task branch.
- `git rev-parse HEAD origin/main`: exit 0, both the issued base SHA above.
- `node --version`: exit 0, `v24.17.0`.
- `pnpm --version`: did not return a version; emitted a warning that the `pnpm.overrides` field is ignored. Interrupted with exit 130. Two configuration-override version probes also stalled and were interrupted with exit 130. No install/download command was issued; no package version is claimed.
- `ps -o pid,ppid,command -ax`: exit 1, sandbox denied process inspection.

- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`: exit 1, refuses a self-comparison because HEAD equals origin/main. Base ref and checker unchanged; dispatcher must rerun after committing.
- `LANE_BASE_REF=origin/main node tools/lint.mjs`: exit 1 for the same lane refusal after core purity passed.
- `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs`: each exit 0.
- `node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit` and the same command for `packages/db/tsconfig.json`: each exit 0. These are direct package typechecks, not a root `pnpm typecheck` run.
- In `packages/core`, `node node_modules/vitest/vitest.mjs run src`: exit 1; 2,414 passed, one timed out at the unchanged 5,000ms limit (`src/receipt-allocation.test.ts:212`, bounded working-size test).
- In `packages/db`, `node node_modules/vitest/vitest.mjs run src --maxWorkers=1`: exit 1; 84 passed, one timed out at the unchanged 5,000ms limit (`src/audit-checkpoint-handoff.test.ts:279`, C-OPS-1 transitive-request-source test). This runs source unit tests only, not PostgreSQL integration tests.
- In `apps/api`, `node --import tsx src/generate-openapi.ts --check`: exit 1, stale built core lacks `SiteVisitError`; after a direct core build it failed with stale built DB lacking `SiteVisitRepository`. These are module-loading failures, not OpenAPI contract results.
- After direct core and DB builds, `node --import tsx src/generate-openapi.ts --check` in `apps/api`: exit 0; OpenAPI check passed.
- `node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json`: exit 0, direct core build; generated ignored output only.
- `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json`: exit 0, direct DB build; generated ignored output only. These package builds are not a full root build.
- `git diff --check`: exit 0. A read-only JSON comparison against `git show HEAD:config/agent-lane-assignments.json` passed: every existing lane row is unchanged, and only the new two-path lane row was added.

No test expectations, pinned names, fingerprints, timeout or checker rules were changed in response to these failures. There was no clean reinstall and no failing audit regression test has been demonstrated. Root pnpm typecheck/lint/unit/build/openapi commands could not be run through the stalling launcher; direct fallback checks above are labelled precisely. No git write command was run. Intended conventional commit message is at `/private/tmp/jg-msg-audit-fix-api-quote.txt`; dispatcher commits after exit.

## Dispatcher follow-up

Authorize a separately scoped migration task before resuming finding 5, or reissue a work order limited to findings 1–4. Before each fix, execute the report's failing PostgreSQL regression using runtime credentials, an owning practice session and synthetic job parties. This sandbox cannot start PostgreSQL or bind localhost/browser servers; mocks are not PostgreSQL evidence.

On the Mac or GitHub CI, run the five report-named regressions, the quote/acceptance/command integration suites, `pnpm test:db`, and (for the future migration) `pnpm test:migrations` with fresh/upgrade/catalog/privilege coverage. Run `pnpm test:e2e --project=mobile-360 --project=desktop quote-editor.spec.ts quote-send.spec.ts quote-acceptance.spec.ts`, plus `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `LANE_BASE_REF=origin/main pnpm lint:lanes`, `pnpm test`, `pnpm build` and `pnpm openapi:check` with the pinned package manager. A real failing regression must precede any claimed fix.

Independent exact-commit verdict, separate technical acceptance, PostgreSQL/browser validation and any migration authorization remain outstanding. No release gate or approval is advanced.
