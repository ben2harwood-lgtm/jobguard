# AUDIT-FIX-DBSRC-10 builder receipt

Status: STOPPED / HOLD. No implementation accepted or independently verified.

Issued 13 October 2026 by dispatcher 4; inspected 14 October 2026. Branch `codex/sandbox/audit-fix-dbsrc-10`; starting HEAD and supplied `origin/main` both `c08a53784c05b54b18f7bfff87f4c7597032ca7e`. Source report: `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-10.md`. Read repository AGENTS.md, BUILD_PLAN.md §§2, 5.3, 5.6 and M2-1 before any change. Scope is RED (commercial authorization and money).

## Mandatory stop

The work order says: “No migration unless the finding cannot be fixed without one (then STOP and say so).” Blocking finding 5 requires a schema change to record replacement proof on the original stage while preserving original completion history. `packages/db/migrations/0015_proof_stage_gates.sql:5` enforces `UNIQUE(tenant_id,job_id,scope_item_id,stage)`. Line 21 grants only SELECT/INSERT and revokes UPDATE/DELETE/TRUNCATE. Later migration 0096 adds guards and a qualified FK, but does not remove that uniqueness. `packages/db/src/proof-repository.ts:22` also reserves a permanent stage semantic key; line 23 inserts a new completion. Altering the receipt alone cannot overcome the database constraint. Updating/deleting the old completion, changing the stage name or loosening grants would violate the issued scope/history guarantee.

This is source inspection, not an executed PostgreSQL reproduction. Implementation stopped immediately at this migration requirement. No migration written; no product source or existing tests changed. No new grants (standard F unchanged). No new operational alert, external action, secret, provider route, real data or spending. Dispatcher must reissue migration scope before this finding can be implemented. No schema rollback or data backfill applies to this documentation-only handoff.

## Finding disposition

- 1 DROPPED: no failing reproduction executed before the mandatory migration stop; obsolete purchase-order authority remains unverified and unfixed.
- 2 DROPPED: no failing reproduction executed before the mandatory migration stop; quote preview line totals remain unverified and unfixed.
- 3 DROPPED: no failing reproduction executed before the mandatory migration stop; applicable normalized purchase-order rates remain unverified and unfixed.
- 4 DROPPED: no failing reproduction executed before the mandatory migration stop; completion/invalidation race remains unverified and unfixed.
- 5 STOPPED (migration required); DROPPED from implementation because no failing PostgreSQL reproduction can run here.
- 6 DROPPED: no failing reproduction executed before the mandatory migration stop; clock-advanced quote-send retry remains unverified and unfixed.

DROPPED means excluded under the issued failing-test rule, not disproved or safe. No regression test or claimed fix is supplied.

LATER findings (receipt only): 7 document creation accepts inconsistent commercial line details; 8 proof invalidation ignores command identity; 9 constant-return free-quoting test cannot detect actual platform accounting effects. No later finding implemented.

## Changes and preserved pins

- Added exactly one compact lane row, `audit-fix-dbsrc-10`, allowing only this receipt and `config/agent-lane-assignments.json`. Before: absent. After: documentation-only RED stop lane. Existing lane rows unchanged; shared registry owner is the coordinator and its integration must serialize.
- Added this receipt. No existing expected value, refusal, count, pinned name or fingerprint changed. No catalogue or premise-establishing setup changes. `apps/api/src/auth/context-boundary.test.ts` and its pinned lists untouched.
- Intended conventional commit message is in `/private/tmp/jg-msg-audit-fix-dbsrc-10.txt`. No Git write command run; dispatcher owns commit/push. No new commit exists to bind an independent verdict to.

## Checks

Supplied dependencies used; no install command run. Node v24.17.0 differs from `.nvmrc` 24.15.0. Initial PATH `pnpm --version` invoked pnpm 11, tried its automatic version verification, then exited 1 because registry fetch/signature verification failed. Initial nested pnpm checks were interrupted (130) when the same shim stalled. A temporary executable `/private/tmp/jg-audit-fix-dbsrc-10-bin/pnpm` invokes the already-cached pnpm 10.28.1; subsequent checks prepend this directory to PATH. No package downloaded or dependency changed. No failed security/signature check was overridden.

Commands below use this cached pnpm; `LANE_BASE_REF=origin/main` was set for lint and lane checks.

- `pnpm typecheck`: exit 0, seven shared-cache hits; not a fresh execution.
- `pnpm build`: exit 0, seven shared-cache hits; not a fresh Next build or browser run.
- `pnpm lint`: exit 1 after core purity passed; lane checker refuses HEAD == origin/main.
- `pnpm lint:lanes`: exit 1 for the same self-comparison refusal. No checker changes.
- `pnpm openapi:check`: exit 1 because tsx CLI cannot listen on its IPC pipe (EPERM).
- `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check`: exit 0; same OpenAPI checker via a loader that needs no CLI IPC pipe.
- `node tools/money-arithmetic-lint.mjs` and `node tools/commercial-boundary-lint.mjs`: exit 0 each.
- `node --test tools/policy-gate-sites.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/core-purity.test.mjs tools/shared-money-origin.test.mjs tools/commercial-boundary.test.mjs`: exit 0; eight tests passed. Git-writing tooling tests not run, preserving the work order's prohibition.
- Path floor: applied the installed `lane-floor.py` matcher and coordinator's `lane-maps/jobguard.json` to read-only working-tree diff/untracked paths (the CLI's commit comparison would see no change). Registry AMBER; receipt GREEN; floor AMBER. Raised to RED for the issued authorization/money audit. No coordinator map changed.
- `git diff --check`: exit 0; protected auth file has no diff; registry is one additive line.
- Final read-only Node validation using `selectLane`/`matches` and `git show HEAD:config/agent-lane-assignments.json`: exit 0; removing only the added lane reproduces the original registry exactly, and both changed/untracked paths match the exact allow list. This is not a substitute pass for the refused commit-range lane lint.

Uncached typecheck/package lint and selected unit checks were also attempted; final results follow. Initial broad unit selection included restored compiled `dist` tests and was interrupted (130), with failures observed in compiled source-inspection tests (`dist/audit-checkpoint-handoff.test.js`, `dist/site-extra-pricing.test.js`, `dist/recovery-allocation.test.js`) and the compiled cumulative-fee property test. Source-only reruns explicitly exclude `**/dist/**`; this is a local selection, not a change to any mandatory script. PostgreSQL `.integration.test.ts` and localhost `free-port.test.ts` remain excluded from the DB unit selection. No integration suite is claimed passed.

- `pnpm exec turbo run typecheck lint --force`: interrupted (130) at the stop handoff; completed core/config/storage/AI/DB tasks before entering API checks, but no complete uncached seven-package result. Not a pass.
- `pnpm -r --workspace-concurrency=2 --filter @jobguard/core --filter @jobguard/ai --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/web exec vitest run --maxWorkers=1 --exclude '**/dist/**'`: interrupted (130) after observed unchanged source failures in three `src/receipt-allocation.test.ts` cases (2000-line aggregation, distinct-denominator working bound, cancelling-balance kernel size). Config: one source test passed; storage: two source tests passed. Core had not completed; AI/web not reached. No full unit pass claimed or test weakened.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --exclude '**/dist/**' --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts'`: exit 1, 168 passed / one failed across 13 source files. The unchanged `src/audit-checkpoint-handoff.test.ts:279` C-OPS-1 transitive-boundary assertion timed out at its existing 5000ms limit. No timeout increase or assertion change.
- API selection: `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1`, adding `--exclude` for the 17 source test files identified by `rg -l 'supertest|\\.listen\\(|createServer|embedded-postgres|startPostgres|new Pool' apps/api/src --glob '*test.ts'` (paths relative to apps/api). Interrupted (130) after failures observed in unchanged `src/watchdog-registry.test.ts` (“classifies standalone job mutations and dispatcher command literals too”) and `src/practice-transports.test.ts` (quote delivery GET session mapping). Suite incomplete; no full API pass claimed. Protected `context-boundary.test.ts` never edited.

Selected checks were ended at the mandatory-stop handoff after these unrelated failures were observed; none serves as a failing reproduction of an audit finding. Full root `pnpm test` was not run because it includes forbidden Git-writing tooling fixtures and PostgreSQL/listener suites. All listed incomplete or failed checks remain dispatcher/CI duties, with no security, test or lane waiver.

## Dispatcher / Mac or GitHub CI requirements

This sandbox cannot start PostgreSQL, bind localhost or run a browser. Do not treat source inspection or local unit results as PostgreSQL guarantees. After authorized implementation, first execute the report's six failing regression tests against actual PostgreSQL 16, then verify their fixes. Run `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, and the full required browser suite `pnpm test:e2e` in CI (or on a Mac capable of running the harness). At minimum preserve `packages/db/test/materials.integration.test.ts`, `quote.integration.test.ts`, `evidence.integration.test.ts`, `proof-replay.integration.test.ts`, `proof-application-records.integration.test.ts`, `commands.integration.test.ts`, `outbox.integration.test.ts`, `tenancy.integration.test.ts`, and both viewport projects for quote-send, purchase-order and proof workflows.

Lane lint must run again after dispatcher commits: supplied HEAD equals `origin/main`, so the local checker refuses that self-comparison by design. No waiver or weaker comparison requested. Full checks, migration authorization, independent exact-commit cross-model verdict, separate technical acceptance and founder-controlled merge/release remain outstanding. This receipt is a stop handoff, not task completion.
