# CH-3b builder receipt — round 3

Builder: Codex, builder only. Starting head `830765d`, branch `codex/sandbox/ch-3b`, PR #120.
Repairs the independent Claude Opus REPAIR verdict bound to `9023506bf9da79ca8c65e33aca3dee4c8cd60e15`.
This records builder source inspection and execution, not independent review or acceptance.

Read the repository's full `AGENTS.md`, applicable CH-3b task and contractor contracts in `BUILD_PLAN.md`,
`docs/contracts/contractor-parties-v1.md`, both earlier builder receipts, and the round-3 order/verbatim verdict in this request.
`CH-3b-issued.txt` and the separate round-2 order were not supplied or located in the worktree, project docs,
or targeted temporary/home searches. Their location was requested asynchronously; no answer was available when
preparing this receipt. Compliance with those absent source orders is not claimed; the prior work and recorded
round-2 decisions are preserved. No additional work or acceptance is inferred from their absence.

## Failing-first evidence (recorded before implementation changes)

New regression assertions were added before editing the schema, controller, generated OpenAPI or migration.

| Command (package working directory) | Exit | Result |
|---|---|---|
| `node node_modules/vitest/vitest.mjs run src/contractor-parties.test.ts` (`packages/core`) | 1 | 4 new null-contact rows failed with Zod `Expected string, received null`; 7 earlier tests passed. Log: `/private/tmp/jg-ch-3b-round3-core-red.log`. |
| `node node_modules/vitest/vitest.mjs run src/contractor/contractor-parties.controller.test.ts` (`apps/api`) | 1 | Both new OpenAPI assertions failed: path parameter arrays were empty; 2 earlier tests passed. Log: `/private/tmp/jg-ch-3b-round3-api-red.log`. |

The raw-routine `.INVALID` regression and both repository-entry null-contact rows were written before the fix.
They cannot be executed in this sandbox: PostgreSQL startup and localhost binding are unavailable by dispatcher instruction.
Their failing-first database execution is not claimed. GitHub CI must execute them after the integrator pushes.
The core `.INVALID` rejection assertion already passes against the original core behavior.

## Repairs

- **R1:** Only `contractorResidentBoundaryV1` makes contact `name`, `phone` and `email` nullish.
  Strict contact/import schemas are unchanged. Non-null malformed values retain their validation.
  The existing P2-1 PostgreSQL test includes null name, null phone without email, and both phone/email null
  through **both** `bind` and `bindInTransaction`, using `assertContractorPartiesRequired`.
  The existing effects projection is compared after each entry point: bindings, resident rows, CH-3a bindings,
  receipts, audit events, outbox actions and job revision remain unchanged. Four core rows verify boundary
  acceptance and strict-schema rejection. A complete contact with `phone: null` plus a valid email remains
  `INVALID_COMMAND` in SQL through both repository entry points; the contract records that existing choice.
- **R2:** Already repaired by integrator commit `c8d3e35`; inspected the single `MIGRATION_URLS` import.
  The file is unchanged in this round.
- **R3:** Both handlers declare `@ApiParam` with their correct name, UUID format and explicit string type.
  Regenerated `apps/api/openapi.json`; its only changes are those two required path parameters.
  Both new transport tests verify the generated parameter definitions.
- **R4:** Only unmerged migration `0102_contractor_parties.sql` is edited: its existing email regex is
  supplemented by case-sensitive `LIKE '%.invalid'`. The raw-routine regression expects SQL `22023` /
  `INVALID_COMMAND` for `resident@example.INVALID` and compares all existing effects before/after.
  A core regression verifies the same suffix is refused there. No merged migration (0000–0097) is edited.

## Commands and results

Node `v24.17.0`; final pnpm commands use the already-cached **10.28.1** via a temporary wrapper at
`/private/tmp/jg-ch-3b-round3-bin/pnpm` (PATH prefix for each command). No install command was run.
The machine's default pnpm is 11.8.0: initial package-test attempts returned 1 for the engine mismatch;
initial root build/typecheck/lint/version-manager attempts were interrupted (130) while its automatic version
switch stalled. That shim eventually reported unavailable registry-signature verification; no packages were
downloaded. The cached pinned runner was subsequently located through an earlier temporary runner script.

| Command | Exit | Result |
|---|---|---|
| `pnpm typecheck` | 0 | All 7 tasks pass. |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | All source/boundary checks and 7 package tasks pass. Base is `df1f9c1`; no self-comparison refusal. |
| `pnpm lint:lanes` | 0 | `ch-3b` lane passes, including working-tree edits; registry unchanged. |
| `pnpm build` | 0 | All 7 tasks pass, 2 cached. Next build succeeds. |
| `pnpm openapi:check` | 1 | tsx CLI's IPC socket creation fails with sandbox `listen EPERM`, before generating/comparing the document. |
| `npm_config_script_shell=/private/tmp/jg-ch-3b-round3-script-shell.sh pnpm openapi:check` | 0 | Temporary shell substitutes `node --import tsx` only for the exact `tsx src/generate-openapi.ts --check` command. Same generator, arguments and exact-byte assertion; all other commands use `/bin/sh`. No repository script or assertion changed. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same generator and exact committed-byte comparison pass without the tsx CLI IPC socket. |
| `pnpm --filter @jobguard/core test` | 0 | 110 files, 3,210 tests pass; no skipped tests. |
| `pnpm --filter @jobguard/api test` | 1 | 592 tests pass, including both new OpenAPI rows; only `src/health.test.ts` fails on sandbox `listen EPERM` (`0.0.0.0`). Its chained OpenAPI command is not reached. No assertions skipped or changed. |
| `pnpm --filter @jobguard/web test` | 0 | 19 files, 350 tests pass; no skipped tests. |
| `node --test tools/*.test.mjs` | 0 | All 42 tests pass; no skipped tests. |
| `node --import tsx src/generate-openapi.ts` (`apps/api`) | 0 | Generates the two path-parameter changes. |
| `node --import tsx src/generate-openapi.ts --check` (`apps/api`) | 0 | Exact regenerated-file comparison passes. |
| `node node_modules/typescript/bin/tsc -p /private/tmp/jg-ch-3b-round3-db-test-typecheck.json` | 0 | Typechecks the changed PostgreSQL test and imported sources. This is static validation, not database execution. |
| `git diff --check` | 0 | No whitespace errors. |
| `git diff --quiet HEAD -- BUILD_PLAN.md config/agent-lane-assignments.json packages/db/test/demo-bootstrap.integration.test.ts` | 0 | Integrator-owned files unchanged. |

Logs are `/private/tmp/jg-ch-3b-round3-*.log`.
Earlier direct-tool executions also ran: dependency TypeScript builds (5 packages, exit 0), all seven package
typechecks (exit 0), Nest build (exit 0), Next build (exit 0), root source lint and lane lint (exit 0), core tests
(exit 0), and API/web tests. The first two web runs failed (exit 1, 189 failures) against stale compiled API
exports; rebuilding existing packages resolved all 350 tests without source changes. The first post-fix API
run had two path-schema failures because Swagger did not infer `type`; explicit `type: String` retained and
satisfied those assertions. Its final only failure is the health socket restriction above.
The first temporary DB-test typecheck returned 2 because its scratch `rootDir` excluded imported API sources;
correcting that scratch setting to the worktree root returned 0. The test and repository configurations were
unchanged. The initial generator loader attempt returned 1 against stale DB output (`WatchdogError` missing);
the dependency rebuild resolved it. Direct tsx CLI generation returned 1 on IPC `EPERM`, matching the pnpm
OpenAPI limitation. No new or longer timeout was introduced.

## Scope, migration and outstanding verification

The only behavior changes are boundary acceptance of null contact fields and matching SQL's synthetic email
suffix to the existing core rule. Existing strict schemas, permissions, tenancy, audit, idempotency and financial
guarantees remain intact. No new external action, provider, credential, alert, permission or production mode.
All fixtures are synthetic. The build command compiles production artifacts; it does not enable production mode.

0102 remains additive and unmerged; its numbering and earlier migration strategy are preserved. Fresh-install,
upgrade, privileges/RLS and PostgreSQL behavioral proof, including the new rows, require GitHub CI after the
integrator pushes. Browser suites also remain mandatory in that CI. No local PostgreSQL, browser, full root
`pnpm test`, `pnpm test:db` or `pnpm test:migrations` run is claimed. This contact schema does not affect an AI
prompt, parser, model or gateway; no AI evaluation/provider call was needed or run.

The integrator's `830765d` ledger paragraph is preserved. No further CH-2 follow-on change is required for
these CH-3b routes: the POST still changes a client/customer link, not job state, and the resident route is GET.
The repository binding remains ENT-2's integration seam.

Prepared in the working tree only. No git add/commit/checkout/push, merge, decision approval, release or
acceptance action was performed. Intended commit message: `/private/tmp/jg-msg-ch-3b.txt`.
A fresh independent verdict bound to the dispatcher-created commit and separate acceptance are still owed;
no exact-new-head CI result exists yet. D12 v4, D04, G1 and ENT-14 remain proposed/closed.

## HELD (unchanged)

Ben's card `jobguard-ch3b-held-clauses-2026-10-07`, exact ruling **"hold the two checks"**:

1. DW1's second clause: ENT-2's import tests call the routine and assert the refusal.
2. DW3's team-scoped positive cases: an operative on the job and that team's supervisor.

Both remain **HELD**. ENT-2 must prove both before ENT-2 is accepted. CH-3b repository tests do not prove ENT-2 import behavior.

## Carried notes

- CH-3a's ordinary bind can still replace a contractor job's parties before live; ENT-2 must guard which record wins.
- ENT-2's import route must be classified `pre_live_allowed` in CH-2's job-mutation registry. The registry test scans web routes only under `/api/jobs|decisions|recovery-cases` (and Nest paths containing `jobs`), so a web route under `/api/contractor/...` is not discovered.
