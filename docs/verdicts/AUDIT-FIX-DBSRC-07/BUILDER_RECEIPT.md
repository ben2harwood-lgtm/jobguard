# AUDIT-FIX-DBSRC-07 builder receipt

Status: STOP — migration required; no implementation, failing-test reproduction, independent verdict or acceptance claimed.

Issued 13 October 2026; inspected 14 October 2026. Branch `codex/sandbox/audit-fix-dbsrc-07`; HEAD and origin/main both `c08a53784c05b54b18f7bfff87f4c7597032ca7e`. Audit source: `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-07.md` (source-inspected `6659fb5`, no tests claimed by its author). Lane RED: money and tenancy.

The dispatcher says: “No migration unless the finding cannot be fixed without one (then STOP and say so).” This stop condition applies to the ledger findings: `packages/db/migrations/0004_ledger.sql:14–16` contains the controlled posting functions; runtime has EXECUTE on them (line 22), while direct journal writes are revoked (line 18). Later migrations do not replace these functions. A TypeScript guard alone cannot preserve AGENTS §§5.1, 5.4–5.7 for direct runtime SQL or concurrent corrections. Correcting the controlled SQL path needs a reviewed forward migration; no migration was written or historical migration altered. Implementation stopped before writing reproduction tests or changing any production file. Read AGENTS.md, BUILD_PLAN §§5.3–5.5 and its merged-work inventory (M0-7/ledger), and the applicable money/environment contracts.

## Findings

- BLOCKING 1: DROPPED — no executed failing reproduction; PostgreSQL prohibited, and migration-required stop reached.
- BLOCKING 2: DROPPED — no executed failing reproduction; PostgreSQL prohibited, and migration-required stop reached.
- BLOCKING 3: DROPPED — no executed failing reproduction; PostgreSQL prohibited, and migration-required stop reached.
- BLOCKING 4: DROPPED — no executed failing reproduction; implementation stopped on migration requirement before this finding.
- BLOCKING 5: DROPPED — no executed failing reproduction; implementation stopped on migration requirement before this finding.
- LATER 6: application money magnitude limit missing at listed ledger/job schemas; receipt only, unchanged.

“DROPPED” follows the dispatch rule for findings without failing-test evidence in this run; it does not claim the reported behavior is fixed. No claimed red/green cycle.

The report's five test-strengthening notes are deferred, receipt only: illegal lifecycle refusal masked by missing permission; authorization cases missing; zero-line case missing; imported-lineage refusal masked by nonexistent quote; proposal join missing scope_item_id. All existing tests/expected values/refusals/counts/pinned names/fingerprints unchanged. `apps/api/src/auth/context-boundary.test.ts` untouched; no protected-line edit attempted. No new catalogue row or premise-establishing setup. No grant, external action, real data, spending, provider call or deployment.

## Exact changes

- config/agent-lane-assignments.json before: no audit-fix-dbsrc-07 row; after: one compact row permitting exactly this registry and this receipt. All previous rows unchanged.
- This receipt before: absent; after: stop/evidence record.
- `/private/tmp/jg-msg-audit-fix-dbsrc-07.txt`: intended documentation commit message; dispatcher commits. No git-writing command executed.

## Validation

Node `v24.17.0`; cached pnpm `10.28.1`. No install/download command executed. Initial default `pnpm --version` launcher hung and was interrupted (exit 130); subsequent commands use an out-of-repo `/private/tmp/jg-dbsrc07-bin/pnpm` wrapper calling the already cached 10.28.1, with `npm_config_manage_package_manager_versions=false`. All commands use `LANE_BASE_REF=origin/main`. Raw logs are in `/private/tmp/jg-dbsrc07-*.log`, outside the lane.

| Command | Actual result |
| --- | --- |
| `pnpm typecheck` | Exit 0; 7/7 tasks cached by Turbo, not a fresh typecheck |
| `pnpm lint` | Exit 1; core purity passed; lane checker refuses HEAD equal to origin/main before package lint |
| `pnpm lint:lanes` | Exit 1; “Missing branch or self-comparison range; refusing a misleading pass.” Dispatcher must rerun after committing |
| `pnpm turbo run lint` | Exit 0; 7/7 package tasks cached |
| `node tools/money-arithmetic-lint.mjs` | Exit 0 |
| `node tools/commercial-boundary-lint.mjs` | Exit 0 |
| `pnpm build` | Exit 0; 7/7 tasks cached, not a fresh build |
| `pnpm openapi:check` | Exit 1; tsx launcher IPC socket `listen EPERM` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same OpenAPI check, bypassing the launcher's IPC socket |
| `pnpm turbo run test --filter=@jobguard/core --filter=@jobguard/ai --filter=@jobguard/config --filter=@jobguard/storage --filter=@jobguard/web` | Exit 1; config 2 passed, AI 80 passed, web 784 passed, storage 4 passed (cached); core 4,884 passed / 6 failed. Core failures: source and compiled receipt-allocation timeouts (four); compiled recovery-allocation and site-extra-pricing tests cannot open source `.ts` files (two). No assertion/timeout changed |
| Supplementary `selectLane`/`matches` check plus comparison of registry to `git show HEAD:config/agent-lane-assignments.json` after removing this new row | Passed: exact allow-list and all previous registry data preserved; this does not replace `lint:lanes` |
| `git diff --check` | Exit 0 |

DB/API unit runs were interrupted to narrow source selection and exclude generated `dist` tests; initial API selection was also interrupted to exclude `auth/sso/action-paths.test.ts` (supertest). DB's interrupted run showed failures of the unchanged `[C-OPS-1]` source reachability test in both compiled and source copies. Full root `pnpm test` was not run because it invokes PostgreSQL/listener suites and tool tests that write Git repositories. Final source-only DB/API invocations were also interrupted (exit 130) after producing only the Vitest RUN banner and no completed results; no pass claimed. All exclusions are invocation-only sandbox constraints, not edits to tests/config or waivers of mandatory suites.

## Dispatcher/Mac or GitHub CI follow-up

Before any repair, dispatcher must reissue authorization covering the required forward migration. Then write and run the report's five named reproductions against real PostgreSQL on the unchanged baseline, before implementing fixes. Run `pnpm test:db`, `pnpm test:migrations`, complete `pnpm test`, and `pnpm test:e2e` outside this sandbox (PostgreSQL/browser/listener startup prohibited here). These are pending, not passed or silently optional. No migration/upgrade/catalog/rollback proof exists for this stopped task. Any new grant must satisfy standard F. A different-model verdict bound to the dispatcher's exact resulting commit, followed by separate acceptance, remains required; this builder does not accept its work.


Final source-only commands attempted (exit 130; dispatcher must rerun):

- `pnpm --filter @jobguard/db exec vitest run --exclude '**/dist/**' --exclude '**/*.integration.test.ts' --exclude 'test/free-port.test.ts' --maxWorkers=1`
- `pnpm --filter @jobguard/api exec vitest run --exclude '**/dist/**' --exclude 'src/health.test.ts' --exclude 'src/shadow-isolation.application.test.ts' --exclude 'src/contractor/*.http.test.ts' --exclude 'src/auth/sso/action-paths.test.ts' --maxWorkers=1`

Final working-tree inspection: exactly one added registry line and this new receipt. No production, migration, test, pinned-list, expected-value or catalogue modifications. No new operational alert or compatibility change; the reported ledger/scope defects remain unrepaired. The stop is the outcome, not technical acceptance of AUDIT-FIX-DBSRC-07.
