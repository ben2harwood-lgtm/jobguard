# MON-2A-P builder receipt

18 October 2026. Sub-order A only. Builder: Codex; same-model agents handled disjoint core, SQL and PostgreSQL-test files under AGENTS §1. Their source inspections are **not** independent RED verdicts.

Status: implemented working-tree candidate; **technical acceptance HOLD**. PostgreSQL, migration execution and browsers are **NOT RUN**, as the dispatcher required. No practice server/database row, live gate or B/C task is closed. Two independent Claude checks bound to the dispatcher's final commit, then separate acceptance, remain required.

Base/HEAD: `b881f90be0a6d368838ca4392338147ef819bd3a`, also `origin/main`. Branch: `codex/sandbox/mon-2a-p`. No repository Git writes, commit, push, package download or installation occurred. Intended conventional commit message: `/private/tmp/jg-msg-mon-2a-p.txt`.

## Delivered

Migration 0190 installs the first platform subscription statement namespace; public reference catalogue; 17 tenant business tables; checked commands/read/source routines; source/line/amount deferred constraints; immutable agreement/change/source/period/statement/review/simulation facts; shared receipt and audit integration. All business rows have tenant keys, migration ownership and FORCE RLS. No runtime direct business-table reads/writes or privileged worker role are added. The control-plane catalogue SELECT and three checked runtime EXECUTEs are the only new capabilities; eight capability/owner inventory entries, one group and one authority path are bounded to this migration.

Core calendar, accepted-revision selection, stable place attribution, canonical largest-remainder allocation and correction dispositions have separate exports. The PostgreSQL-backed repository verifies issued base principal through existing core source/grouping/pricing functions in the issuing transaction. Server authority resolves per call and SQL independently checks the persisted synthetic session and company role. Only a current owner accepts terms/change terms/simulated collection. Statement simulation is provider-neutral, synthetic, exact-approved and durable; adapter work occurs after claim commit.

SQL source review fixed a PL/pgSQL variable/column collision in outcome checks, representative UUID normalization, attribution-version mismatch, source-binding constraints and immediate review of earlier grace crossings. The final authorization helper also checks the existing contractor-membership revocation fact. These are source-inspected fixes, not proof of PostgreSQL execution.

`docs/contracts/subscription-v1.md` publishes B/C's interfaces. `docs/ledger/MON-2A-P.md` maps assertions. `docs/operations/subscription-synthetic.md` and the migration note describe alerts, authority, lock order, compatibility and forward fixes. The exact lane file includes only the issued allow list, with migration number 0190 substituted.

## Runtime and installation evidence

Dependencies were already installed and reused as instructed. No clean install was attempted or claimed. Host `node --version`: **v24.17.0**; repository `.nvmrc`: **24.15.0**. CI must repeat on its pinned runtime. The normal pnpm launcher stalled while resolving its manager; three attempts were interrupted (130). The cached pinned manager was available at `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`, and reported **10.28.1**.

Subsequent pnpm commands used `PATH=/private/tmp/mon2-bin:$PATH`, whose wrapper invokes that exact cached file with Node. This is outside the repository and changes no package pin or dependency. Turbo reported harmless cache-write `Operation not permitted` warnings; final forced checks below executed with zero cache hits.

## Actual verification

All targeted Vitest batches were serial, at most three files and `--maxWorkers=2`. Full source core testing is separately identified.

| Command actually run | Result |
|---|---|
| `pnpm typecheck` | Exit 0, 7 packages; 5 fresh, 2 cache hits. Earlier snapshot before final changes. |
| `pnpm typecheck --force` (final successful run) | Exit 0, 7/7 fresh, 0 cached. Subsequent DB-only result-schema addition also passed DB typecheck and final forced build. |
| `pnpm --filter @jobguard/db typecheck` | Exit 0 after strict result-schema addition. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1: core purity passed; lane refuses self-comparison because unchanged HEAD equals origin/main. No assertion weakened. |
| `pnpm lint:lanes` | Exit 1, same uncommitted self-comparison limitation. |
| `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` | Exit 0 for each; final static lint components run separately because lane stopped the aggregate. |
| `pnpm exec turbo run lint --force` | Exit 0, all 7 packages fresh, 0 cached. |
| Read-only exported lane-loader/path/order check using `loadLanePolicy`, `lanePathAllowed`, `migrationOrderViolations` against `git diff`, untracked paths and origin/main migration tree | Exit 0: 29 changed/untracked paths, zero path or migration-order violations. This is a working-tree-only check, not the refused commit-range command. |
| `node --test tools/agent-lane-boundary.test.mjs` | Exit 0, 23 tests. |
| `pnpm build` | Exit 0, 7 packages; 5 fresh, 2 cached. |
| `pnpm build --force` | Exit 0, all 7 packages fresh, 0 cached. Next emitted existing workspace-root/CSS warnings. No browser launched. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | Exit 0, 113 files, **2,812 tests**; includes preserved foundation/architecture tests. |
| `pnpm --filter @jobguard/core exec vitest run src/subscription-persistence.test.ts src/subscription-allocation.test.ts src/subscription-architecture.test.ts --maxWorkers=2` | Exit 0, 3 files, **14 tests**, after final crypto-import fix. |
| `pnpm --filter @jobguard/db exec vitest run src/subscription-simulated-payment-adapter.test.ts --maxWorkers=2` | Exit 0, **7 tests**, final run. Includes executor unknown-outcome retry refusal and failure persistence. No PostgreSQL. |
| `pnpm --filter @jobguard/api exec vitest run src/subscription.application.test.ts --maxWorkers=2` | Exit 0, **4 tests**, final run. |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC socket `listen EPERM`, sandbox restriction. |
| From `apps/api`: `node --import tsx src/generate-openapi.ts --check` | Exit 0; same source generator/check argument without the prohibited tsx CLI IPC listener. No API route was added. |
| TypeScript `createProgram`/`getPreEmitDiagnostics` for the six new PostgreSQL test/fixture files, filtered to their diagnostics | Exit 0, zero diagnostics. Static check only; no database execution. |
| From `apps/api`: `node --import tsx --input-type=module -e "const m=await import('../../packages/db/test/lp-0-catalog.ts'); const {inventory}=await m.loadReviewedInventory(); console.log('inventory parsed',inventory.entries.length);"` | Exit 0, 1,167 inventory entries parse successfully. This validates inventory structure, not live grants. |
| `git diff --check` | Exit 0. |

Logs for the main checks are under `/private/tmp/mon2-*.log`; they are local run artifacts, not committed acceptance evidence.

## Failing-first and repaired runs

Core agent wrote nine named tests with explicit not-implemented stubs before implementing behavior. Direct package-local Vitest collected them and exited 1 with **9 genuine failures**. Its final two-file run passed 11 tests after implementation and added adversarial cases. An intermediate allocation-suite collection error from Zod unwrap order was fixed and is not counted as an assertion failure.

API tests were authored first; their first execution failed collection because the implementation module did not exist. A later attempt failed collection because `@jobguard/db/dist` had not yet been built. Neither is a genuine failing assertion. Both were resolved; four API assertions pass. PostgreSQL named tests were authored before SQL implementation finished, but no failing-first PostgreSQL execution is claimed because it was prohibited.

The first forced typecheck/package-lint run failed because a core test statically imported Node crypto without Node types. Replaced it with the existing variable dynamic-import test pattern; final forced checks passed. The unfiltered core Vitest command collected both `src` and generated `dist` tests: 5 source-file lookup failures in 4 generated test files, with 5,619 passing tests. No test was deleted or weakened. The source-only full run then passed 2,812 tests; the duplicate generated-test discovery remains a repository runner issue outside this lane.

The compiled-JavaScript OpenAPI fallback failed with a stale-output difference (Nest compilation differs from the source generator). The source `node --import tsx` invocation subsequently passed. An initial inventory parse correctly rejected the new money group for a missing authority path; the bounded path was added and parsing passed. One test command used the nonexistent name `tools/agent-lane-boundary-lint.test.mjs` and failed before collection; the correct existing lane test file passed 23 tests. A first inventory-loader invocation from DB failed to resolve `tsx`; invoking the installed loader from the API package succeeded. Initial `python` launcher was absent; `python3` was used instead.

## Mandatory work left to CI/checkers

- **NOT RUN:** `pnpm test:db`, `pnpm test:migrations`, all 35 new PostgreSQL assertions, populated-predecessor N-alone proof, successors/repeat proof, catalogs/grants/RLS, advisory-lock races, exact receipt/audit effects and nine persisted card figures. Written tests are not a database pass.
- **NOT RUN:** root `pnpm test`, because it invokes the prohibited PostgreSQL suite. The full core source suite and targeted API/DB units above are actual evidence; other repository suites are not claimed here.
- **NOT RUN:** Playwright/e2e and browser suites, explicitly prohibited. No screen change. Existing mandatory browser gates remain for CI.
- No prompt/model change; no new evaluation gate applies. Existing evaluation requirements remain unchanged and no live-model evaluation is claimed.
- Standard lint/lane commit-range check must run after the dispatcher commits; do not substitute the working-tree-only result for that check.
- Two independent Claude RED verdicts bound to the final commit and separate acceptance are missing. Founder/dispatcher owns commit, push, merge and release.

## Policy and operational holds

The item-specific STOP list is retained while other synthetic work proceeds: refunds, negative-balance settlement, carry-forward, excess collection or maximum override; unspecified first-period stubs/reanchoring/conversion; broader roles/historical access/standing consent/impersonation/shared-company visibility; Q9 notice/legal/DPA/track transition; real hosted provider/identity/card mandate/conversion; real data/spend/deletion/outward actions; all named live release/collection gates. Negative facts remain stored with `NEGATIVE_CORRECTION_POLICY_HOLD`; positive excess remains stored with `CORRECTION_EXCESS_UNCOLLECTED`. Neither is silently carried forward.

Synthetic exact authorization expiry is bounded to the existing accepting session expiry, so an expired delayed downgrade/simulation refuses rather than treating old approval as standing consent. No broader authorization lifetime policy is introduced. Sources remain supplied MON-1B facts; there is no claim of CH-4 lifecycle/admission wiring or trial integration. Current owner/admin historical reads are preserved; shared-practice summaries remain forbidden.

No backfill or existing fingerprinted column change. Migration installation rolls back on failure; installed accepted and issued facts must be preserved and repaired additively. Existing catalogue/authority/architecture claims superseded by merged MON-1B and the upstream shadow-import repair are updated in the contract. No unrelated build-plan, migration runner, legacy lane register or old migration was changed.

Final source review also covered interrupted simulation attempts: an attempt with no persisted result can reconcile, without another execution. A regression unit test passes and a PostgreSQL regression is written. A root static test-file check first reported four rootDir configuration diagnostics; the check was rerun with the workspace rootDir (no repository config change).

Reconciliation uses its own command identity while retaining the provider result identity; observing the same still-unknown result is a no-op on result facts. This preserves cross-family command conflicts without manufacturing a second provider effect. A PostgreSQL regression is written (NOT RUN).

Final audit source inspection binds both canonical request and committed-result hashes in the same existing audit format; statement artifact hashes are therefore covered by the chained result hash. SQL remains NOT RUN. The post-reconciliation DB rebuild passed (exit 0).

Final handoff: the last `pnpm build --force` completed with exit 0, seven successful packages and zero cached tasks (9m05s). Final working-tree diff whitespace check passed. No PostgreSQL/browser execution or technical acceptance is implied. The dispatcher commit-message file is written and the repository remains uncommitted/unpushed.
