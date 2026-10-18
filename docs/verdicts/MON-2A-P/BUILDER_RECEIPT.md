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

## r1 — continuation (18 October 2026)

Builder: Codex (dispatcher requested gpt-6-astra). Resumed dispatcher-committed partial repair at `4c07c506f3046a5146f9921f853b0deeeae296b6`, following the verdict on `da7979fd`. Read the receipt, current diff against origin/main and merge-base diff; the direct comparison includes unrelated changes that have since landed on main. None of those files or merged tests/expectations were changed. Existing installed dependencies and cached pnpm 10.28.1 wrapper were reused; Node v24.17.0. No downloads, Git writes, commit or push.

Preserved the partial repair's correct implementation: `mon2_authorized` uses the non-keyword `authorization_id` parameter; downgrade boundary is calculated before approval, and expiry is London midnight ending the first Solo period; accept/upgrade/simulation still use session expiry. All active-owner, contractor-revocation, authorization and revision checks remain. `SubscriptionApplication` already routes through the existing principal bridge and passes its whole context. SQL syntax repair is source-inspected only, pending PostgreSQL CI.

Added three PostgreSQL regression cases: expired accepting session and revoked accepting session each permit due application by a separately authenticated current admin with fitting capacity; revoked approving-owner membership instead records `refused_authority`. Each asserts the original authorization expiry equals the scheduled first Solo period's end and outlasts the session. As in the existing synthetic tests, privileged fixture setup brings the scheduled date into the past; it does not alter authorization expiry or expose a runtime clock override. These cases are written and statically checked, **NOT PostgreSQL-executed**.

Fixed the partial API test fixture's short session/CSRF strings to satisfy the existing principal-bridge schemas. Initial execution caught two fixture failures; final API execution passes with the existing sole-constructor test unchanged. Updated only the directly affected expiry descriptions in the subscription contract and migration note. This supersedes the original receipt's statement that delayed downgrades expire with the login session. FIX-LATER L1–L7 remain untouched.

### Actual continuation checks

All pnpm commands below used `PATH=/private/tmp/mon2-bin:$PATH`; logs are `/private/tmp/mon2-r1-*.log`.

| Command | Actual result |
|---|---|
| `pnpm --filter @jobguard/core --filter @jobguard/db --filter @jobguard/api typecheck` | Exit 0, all three packages. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1 after core-purity pass: migration 0190 must be above main's 0192. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1, same migration-order refusal. |
| `pnpm exec turbo run lint --force` | Exit 0, seven packages, zero cache hits. |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | Both exit 0. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | Exit 0, 114 files / 2,815 tests. |
| `pnpm --filter @jobguard/api exec vitest run src/subscription.application.test.ts src/auth/context-boundary.test.ts --maxWorkers=2` | Final exit 0, 149 tests. Initial run had two invalid-fixture failures, repaired above. |
| `pnpm --filter @jobguard/db exec vitest run --dir src --maxWorkers=2` | Exit 1: 140 passed, one unchanged audit source-graph test exceeded its 5-second timeout. |
| `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1` | Exit 1, same timeout; 55 passed. |
| Same audit test command with `--testTimeout=15000` | Exit 0, all 56 tests. Command-only diagnostic allowance; no test or configuration edit. Standard timeout result remains recorded above. |
| `pnpm openapi:check` | Exit 1, sandbox `listen EPERM` for tsx IPC pipe. |
| From `apps/api`: `node --import tsx src/generate-openapi.ts --check` | Exit 0, same source generator without CLI IPC socket. |
| TypeScript program/static diagnostics for `subscription-persistence.integration.test.ts`, workspace rootDir | Exit 0, zero diagnostics in the regression file; no PostgreSQL execution. |

An initial DB unit command used positional `src` instead of `--dir src`; Vitest also selected `test/audit-dbsrc-03.integration.test.ts` by substring. It reported skipped assertions during fixture setup and was interrupted (130) immediately on discovery. No running PostgreSQL or successful database assertion is claimed; corrected unit-only discovery is recorded above. Root `pnpm test`, PostgreSQL/migration suites and browsers were not intentionally run. All PostgreSQL behavioral/syntax verification remains **NOT RUN**, for dispatcher CI.

**STOP — migration numbering only:** origin/main now contains migration 0192; lane checks require renumbering this piece above it. This narrow r1 order authorizes B1, SQL syntax and context-boundary repairs, not migration renumbering/reconciliation with new main. No renumber, lane exception or merged expectation edit was performed. Dispatcher follow-up is required for a green lane/checks job. The standard audit timeout is also retained as a local check limitation; its assertions pass under the explicitly recorded diagnostic timeout.

Technical acceptance remains HOLD pending PostgreSQL/migration CI, green `checks`, an independent verdict bound to the final commit and separate acceptance. The builder does not self-accept. Intended commit message is `/private/tmp/jg-msg-mon-2a-p.txt`.

Final continuation build: `pnpm build --force` exited 0, seven successful packages, zero cache hits (2m20.551s). Existing Next workspace-root/CSS warnings and Turbo cache-write warnings did not fail the build. Final `git diff --check` passed. Working-tree changes are limited to the new PostgreSQL regression cases, this piece's API fixture, two expiry descriptions and this appended receipt. No new migration, backfill, operational alert or production capability was added in the continuation.

## r2 (CI)

18 October 2026. Builder: Codex (dispatcher requested gpt-6-astra). Repair starts at dispatcher head `346a3507`; the dispatcher reports two independent inspection PASS verdicts on the prior code. Those are not PostgreSQL execution evidence or reviews of this uncommitted repair. No Git writes, commit, push, dependency download, PostgreSQL process, database suite or browser run was performed. Installed Node v24.17.0 and cached pnpm 10.28.1 were reused through `PATH=/private/tmp/mon2-bin:$PATH`.

Read the actual failed-job log for run `39137966392` with `gh run view --log-failed` (read-only network access; saved to `/private/tmp/mon2-r2-ci.log`). The eight subscription failures were one PostgreSQL `42P08` fixture error, one incorrect privilege expectation, and six five-second timeouts. Repairs:

- The foreign-family receipt fixture casts the reused parameter as `$2::uuid::text`, matching the existing fixture convention and avoiding conflicting text/UUID inference. Actor/payload/subject/family conflict assertions stay in place.
- The authority test now checks forbidden writes on the subscription-owned agreement, work, statement, attempt and result tables. It explicitly records the legacy `command_receipt` INSERT grant from 0005 and continues to deny DELETE/TRUNCATE. It no longer incorrectly claims this task revoked the shared receipt grant. No grant, access rule or migration changed.
- The six timed-out multi-period/correction scenarios have explicit, bounded 120-second test budgets. Their full inputs, money/maximum/lineage/review assertions and deferred database integrity checks remain intact. No global timeout, skip or reduced fixture was introduced. Whether these budgets suffice, and whether all assertions pass once reached, remains for PostgreSQL CI.
- LP-0's recorded inventory gains exactly the eleven new `mon2_*` routine identities, in the existing row format with `definitionSha256: null`. Owner, definer, execution, trigger and source-scan metadata are recorded; no merged LP-0 assertion, grant comparator or held digest-comparison mechanism changed. Existing ACL dispositions already cover the new reachable routines.
- Standing ruling 113 is applied only to the SERIOUS-B5 additive snapshot: seventeen named app tables plus the control-plane catalogue, eleven named routines, the twenty-eight indexes attached to those exact tables, and their seventeen policies. Expected app rows are empty; the two catalogue seed rows are explicitly specified, then ordered by PostgreSQL's JSONB-text ordering. Predecessor rows, privileges, relations and policies still compare in full. Combined 0188/0193 additions are inserted in server order to avoid displacing earlier additions at the wrong array positions. The original 0188 and final equality assertions remain in place.

Migration `0193_subscription_persistence.sql` and the dispatcher's CASE fix are unchanged. Main's separate 0193/LATER-B14 collision remains dispatcher-owned at merge, as explicitly instructed. No new money/access rule, production capability, backfill or alert was introduced. All previous commercial and release holds remain.

### Actual r2 checks

Logs are `/private/tmp/mon2-r2-*.log`. Unit commands use source-only discovery to exclude generated tests and PostgreSQL integration files.

| Command | Actual result |
|---|---|
| `pnpm --filter @jobguard/core --filter @jobguard/db --filter @jobguard/api typecheck` | Exit 0, all three packages. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1: core purity passes; lane registry refuses the authorized `packages/db/test/serious-b5-upgrade.integration.test.ts` edit. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1, same registry refusal. No lane exception or registry edit made. |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | Both exit 0. |
| `pnpm --filter @jobguard/core exec vitest run --dir src --maxWorkers=2` | Exit 0, 117 files / 2,908 tests. |
| `pnpm --filter @jobguard/api exec vitest run src/subscription.application.test.ts src/subscription-boundaries.test.ts src/auth/context-boundary.test.ts --maxWorkers=2` | Exit 0, 3 files / 152 tests. |
| `pnpm --filter @jobguard/db exec vitest run --dir src --maxWorkers=2` | Exit 1, 199 passed / 1 failed: unchanged `[C-OPS-1]` audit-checkpoint source-graph test exceeded 5 seconds. No subscription unit failed. |
| `node --test tools/*.test.mjs` | Exit 0, 100 passed. |
| TypeScript `createProgram` / `getPreEmitDiagnostics`, seven subscription/snapshot test and fixture files, workspace rootDir | Exit 0, zero diagnostics in those files. Static check only. |
| From `apps/api`, `node --import tsx --input-type=module` invoking `loadReviewedInventory()` | Exit 0, 337 recorded routines parse successfully. Structure check only, not live catalogue evidence. |
| `pnpm openapi:check` | Exit 1, sandbox `listen EPERM` on the tsx CLI IPC pipe. |

**STOP — lane registry only:** standing ruling 113 explicitly authorizes the snapshot edit, but the lane allowlist does not include its path. Shared lane-registry changes are outside this repair's allowed shared edits. Dispatcher must reconcile that allowlist; the authorized snapshot repair is retained. Migration renumbering likewise remains dispatcher-owned. Neither issue was used to stop the other repairs.

**PostgreSQL NOT RUN.** Root `pnpm test`, `test:db`, migrations, browser/e2e, persisted figures, live grants, and the repaired upgrade snapshots remain for dispatcher CI. Timeouts in the supplied CI log do not establish that the underlying assertions passed. No self-acceptance: technical acceptance requires CI and a verdict bound to the final dispatcher commit, followed by separate acceptance.

Additional completed checks: `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1 --testTimeout=15000` exited 0 (71 tests). This is a command-only diagnostic timeout; the standard five-second failure above remains recorded and the merged test/configuration is unchanged. From `apps/api`, `node --import tsx src/generate-openapi.ts --check` exited 0 using the same source generator without the prohibited CLI IPC listener. `git diff --check` exited 0.

`pnpm exec turbo run lint --force` exited 0: seven successful packages, zero cached tasks (2m19.803s). This package-level result does not override the root lint/lane-registry STOP above. Intended conventional commit subject/body is written to `/private/tmp/jg-msg-mon-2a-p.txt`; dispatcher owns committing it.

Final build: `pnpm build --force` exited 0, seven successful packages, zero cached tasks (2m23.158s). Next emitted workspace-root/CSS/dynamic-dependency warnings and Turbo emitted cache-write permission warnings; the build succeeded. Final working-tree whitespace check passed. The seven modified files are the four subscription suites, the two explicitly allowed shared inventory/snapshot files, and this receipt. PostgreSQL remains **NOT RUN**; migration 0193 is untouched and no commit/push was performed.
