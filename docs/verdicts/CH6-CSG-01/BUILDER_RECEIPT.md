# CH6-CSG-01 builder receipt

Status: **HOLD — implementation delivered; installed-source gate fails closed. Not reviewed, accepted or merge-ready.** This is the separately issued installed-v1 synthetic architecture guard, not CH6-B/CH-6 completion, v3 adoption, parent dependency waiver, DEMO-S credit or production activation.

## Identity and ownership

- Issue/base/target/local `origin/main`/unchanged HEAD: `dc5721230fd8aedbf2d9d0457789074b66b48765`.
- Branch: `codex/sandbox/ch6-csg-01`; worktree: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/ch6-csg-01`.
- Final commit: **not created**; dispatcher must bind its committed head and exact-head CI. Builder did not stage, commit, push, merge or publish.
- Builder: Codex `gpt-6.1-sol`, medium reasoning. Stock run log observed at `/Users/benharwood/.local/share/full-steam/jg-runs/ch6-csg-01-20261023T170714.log`; it records Codex `0.163.0-alpha.11.2`, the worktree, model, reasoning and session `01a16984-48ce-75e2-a938-85f5108630ea`. Fresh selector account identity, remaining allowance and selection receipt were **not supplied/independently verified**. No account selection or dispatch was fabricated or repeated.
- Builder-owned additions only: `tools/commercial-integrity-current-source-guard.mjs`, `tools/commercial-integrity-current-source-guard.test.mjs`, this receipt. Coordinator-owned lane `config/lanes/ch6-csg-01.json` remains absent; builder did not author it or edit the legacy registry.
- Two delegated Codex subtasks prepared the in-memory tests and independently source-inspected SQL boundaries. These are same-model implementation assistance, **not** Claude A/B verdicts or technical acceptance.

## Controls read and missing evidence

Read repository `AGENTS.md`, `BUILD_PLAN.md` §2 (including C1–C8), §10 CH-6 and §12, the pinned source anchors, manifests and existing shared-money scanner. Required `docs/dispatch/2026-10-20-speed-v5-milestone-and-deferrals.md` is absent at the issue base/worktree. After requesting its location asynchronously, located and read the main-working-copy version at `/Users/benharwood/Claude/Projects/my-new-project/docs/dispatch/2026-10-20-speed-v5-milestone-and-deferrals.md`, plus `/private/tmp/jg-astra-order-readiness-demo.md`. These were read after implementation/checks began and are not claimed to be pinned source. Their milestone/synthetic/dependency limits agree with this issued split. Dispatcher account/allowance/selector evidence remains unsupplied; no answer to the asynchronous evidence request was received. No remote refresh, independent review seat assignment or professional/commercial approval is claimed.

## Implementation and finite limits

Public API: `createProject(files)`, `loadRepoProject(root)`, `checkCommercialIntegrityBoundary(project)`; CLI accepts an optional repository root and prints sorted structured diagnostics, returning 1 for violations/unresolved boundaries. TypeScript 5.8.3 parses source without executing inspected modules or SQL. Source loading recursively covers the four required trees and manifest-mapped workspace source helpers. Workspace resolution uses checked-in exact `exports`/`types` targets; missing/ambiguous local mappings fail closed. External packages/builtins are opaque leaves.

The finite basename token/phrase discovery is implemented explicitly; it is not semantic discovery of every authority module. Lexical TypeScript symbols keep shadowed bindings separate. Symbol-level barrel resolution avoids poisoning ordinary money consumers with unused advisory exports. A reached implementation module is conservatively inspected at module level, including its other runtime references. Re-export cycles terminate; unresolved cycles do not become safe. Runtime imports, immutable aliases, namespace member access, wrappers, side effects and literal loading are followed; unsupported loading/escape/reassignment is unresolved within the covered slice. Type-only and unused import edges do not authorize a runtime finding.

SQL inspection is syntactic: terminal `query`/`execute` calls and terminal `sql` tags, static strings/concatenation/immutable aliases and parameter arrays. SQL tokenization separates comments, identifiers, strings and parameters. Installed fact tables are **inputs**, not output tables; this conservative boundary rejects their use. Receipt-result reads need a provable non-advisory discriminator. OR/UNION, multiple read scopes or joins without a bounded receipt proof remain unresolved. Unknown templates/query construction and business methods named `execute` are conservatively unresolved rather than exempted. No arbitrary reflection/generated-code, runtime taint, stored-routine body, opaque third-party builder, database/RLS or universal CH-6 isolation assurance is claimed.

C1: no web workflow or browser spec added. No policies, prompts/models, migrations, data, authorization behavior, financial records, application code, shared scanners, package scripts, dependencies, production/provider/deployment settings or CI checks changed. No live/paid evaluation, network/provider/database action or local browser/database suite is part of this guard.

## Resource and command evidence

Node `v24.17.0`; installed parser TypeScript `5.8.3`. The default pnpm shim stalled on version probes; no package was installed/downloaded by the builder. Located and used existing pinned pnpm at `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs` (version `10.28.1`); a temporary `/private/tmp/ch6-csg-01-bin/pnpm` symlink selects it for subprocesses.

Read and validated the existing `/Users/benharwood/.local/bin/heavy-slot` and its existing `build-node-count` helper; did not replace them. Sandbox host load/process inspection was denied, so read-only host inspection was retried with approved escalation. Before checks: free disk 213 GiB (initial 214 GiB), free memory 60%, load `{9.83 13.24 12.22}`, two build Node processes. Used the existing scheduler's fresh admission with a conservative single-slot cap: `JG_HEAVY_SLOT_COUNT=1 HEAVY_SLOTS=1`; tests explicitly use one worker. No two lane check invocations overlap. Host slot contention can queue a command; no slot stealing or new scheduler was used. Explicit coordinator-issued numeric admission was not supplied, so this evidence must not be described as a supplied dispatch admission record.

Commands/results are completed below after final execution. Logs live only under `/private/tmp/ch6-csg-01-*` and are not repository artifacts. Root `pnpm test` is not run locally because it fans out into mandatory database suites; required bounded tests are run separately. Database, migrations, browser and all exact-final-head CI remain required in GitHub CI.

### Commands actually run

Each scheduled command was run separately, one invocation at a time, through the existing absolute `heavy-slot` path with `JG_HEAVY_SLOT_COUNT=1 HEAVY_SLOTS=1`. For pnpm commands, `PATH=/private/tmp/ch6-csg-01-bin:$PATH` selected the installed pinned pnpm. These are local deterministic execution results, not independent verdicts.

| Command after scheduler label | Result |
| --- | --- |
| `node --test --test-concurrency=1 tools/commercial-integrity-current-source-guard.test.mjs` | Final: exit **1**, **96 passed / 97 tests**. Sole failure: CSG-01's intentionally strict actual-repository zero-diagnostic assertion. No skip/todo/cancelled test. Final log `/private/tmp/ch6-csg-01-unit-handoff.log`. All synthetic positive/negative controls and CLI/API agreement pass. |
| `node --test --test-concurrency=1 tools/later-shared-money-discovery.test.mjs tools/core-purity.test.mjs` | Exit **0**, **6/6 pass**; `/private/tmp/ch6-csg-01-regression.log`. |
| `node tools/commercial-integrity-current-source-guard.mjs` | Exit **1**; 42 roots / 59 unresolved diagnostics, inventory below. |
| `pnpm typecheck --concurrency=1` | Exit **0**, 7 successful tasks (4 cached); `/private/tmp/ch6-csg-01-typecheck.log`. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Exit **1**. Core purity passes (228 TypeScript files); lane checker refuses `Missing branch or self-comparison range; refusing a misleading pass.` Subsequent root lint stages do not execute. `/private/tmp/ch6-csg-01-lint.log`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit **1**, same self-comparison refusal; `/private/tmp/ch6-csg-01-lanes.log`. HEAD is still the issue base and coordinator lane registration/commit is outstanding. |
| `CIRCLE_NODE_TOTAL=2 pnpm build --concurrency=1` | Exit **0**, 7 successful tasks (3 cached); `/private/tmp/ch6-csg-01-build.log`. Installed Next config source computes workers as `max(1,CIRCLE_NODE_TOTAL-1)`, hence one worker. Existing CSS autoprefixer warning remains; no source repair. |
| `pnpm openapi:check` | Exit **0**; `/private/tmp/ch6-csg-01-openapi.log`. |

Also ran syntax checks (`node --check`) on both new tools, read-only git identity/status checks, and `git diff --exit-code origin/main -- tools/later-shared-money-discovery.test.mjs tools/core-purity.test.mjs tools/shared-money-origin-scan.mjs package.json pnpm-lock.yaml .github/workflows` (exit 0, unchanged). CSG-11 checks continuing root test discovery and installed mandatory entrypoints; existing lane CI remains responsible for per-branch permissions. Earlier unit runs surfaced the same installed-source HOLD while the synthetic matrix grew (75/76, 80/81, 92/93 94/95 and 95/96); none was claimed as an all-green pass. Final source hashes below bind the delivered tool/test bytes without claiming a final commit.

- Guard SHA-256: `0a36f51c680b8be9848b168f1b872af05f5628ab1da7e3cb58fd6c077c3da8df`.
- Test SHA-256: `dd45fa56bc697ddc664ebdd1b47ba87e8a716b4280868d470d9f5afd5fe89572`.

## Actual-source HOLD inventory

Final CLI exit **1**: **42 protected roots, 59 diagnostics**, all `UNRESOLVED_COVERED_EDGE`; **0 confirmed forbidden dependency / SQL diagnostics**. The 59 dependency-chain-specific records coalesce into the following **27 distinct source cases**. Every case is explained here; duplicate chains do not imply different causes. Full deterministic per-root chains are in `/private/tmp/ch6-csg-01-scan-handoff.log` and reproducible with the CLI. An earlier scan had 63 diagnostics; distinguishing SQL `count(*)` from a SELECT wildcard removed a false receipt-result classification, backed by a new regression.

| Source | Explanation | Chain-specific records |
| --- | --- | --- |
| `apps/api/src/practice-access.ts:27` | Conditional query selection includes a table-name template; the query body is not a supported static string expression. | 2 |
| `packages/db/src/commands.ts:81` | Generic replay reads result using a runtime command family and an OR command-id branch; no non-advisory proof. | 4 |
| `packages/db/src/commands.ts:109` | Dismissal replay has a different literal family on only one OR branch; the command-id branch is not constrained. | 4 |
| `packages/db/src/demo-seed.ts:70` | Business boundary.execute(command) is a syntactically covered execute call with a runtime object, not a statically known SQL body. | 4 |
| `packages/db/src/demo-seed.ts:94` | Quote delivery execute receives context/job/document arguments; terminal execute is conservatively covered and unresolved. | 4 |
| `packages/db/src/extra-repository.ts:49` | Generic receipt replay reads result with runtime command-family parameters and OR command-id matching. | 1 |
| `packages/db/src/extra-repository.ts:75` | Joined receipt result is selected without a statically resolved non-advisory command-type discriminator. | 1 |
| `packages/db/src/extra-repository.ts:135` | Template interpolation of originColumns is outside the frozen no-substitution/concatenation SQL expression support. | 1 |
| `packages/db/src/extra-repository.ts:147` | Nested query template interpolates originColumns; complete query text is unresolved. | 1 |
| `packages/db/src/extra-repository.ts:193` | Query structure is generated by unlinkAllowed(...); local function-generated SQL is not statically evaluated. | 1 |
| `packages/db/src/extra-repository.ts:206` | Query template embeds generated unlinkAllowed(...) structure; unresolved query body. | 1 |
| `packages/db/src/practice-session.ts:21` | Query argument is a conditional expression rather than the supported literal/concatenation/immutable-string alias forms. | 2 |
| `packages/db/src/practice-session.ts:52` | Query alias is built through runtime subject-kind selection and interpolated table identifiers. | 2 |
| `packages/db/src/practice-session.ts:73` | Generic local query helper receives runtime sql/values parameters; callers are not specialized by runtime data flow. | 2 |
| `packages/db/src/quote-delivery-repository.ts:43` | Business ActionExecutor.execute(context,id) is a terminal execute call; its first argument is not static SQL. | 4 |
| `packages/db/src/quote-delivery-repository.ts:44` | Second business ActionExecutor.execute(context,id) call has the same unresolved syntactic boundary. | 4 |
| `packages/db/src/site-visit-repository.ts:49` | Generic receipt replay reads result with a runtime discriminator and an unscoped OR command-id branch. | 1 |
| `packages/db/src/site-visit-repository.ts:139` | Query template invokes timestampText(...); function-generated query text is not evaluated. | 1 |
| `packages/db/src/site-visit-repository.ts:144` | Query template invokes timestampText(...) for the completion timestamp; unresolved structure. | 1 |
| `packages/db/src/site-visit-repository.ts:197` | Business this.execute(context,...) dispatch is covered by terminal name; context is not static SQL. | 1 |
| `packages/db/src/site-visit-repository.ts:205` | Second business this.execute(context,...) dispatch has the same unresolved boundary. | 1 |
| `packages/db/src/subscription-executor.ts:14` | Adapter.execute(work) receives runtime authorized work; broad terminal execute detection cannot prove a SQL boundary. | 1 |
| `packages/db/src/work-order-repository.ts:125` | CTE query template interpolates TENANT_WIDE_IMPORT; substitution expressions are unresolved. | 3 |
| `packages/db/src/work-order-repository.ts:176` | Query template interpolates TENANT_WIDE_IMPORT; complete query text is unresolved. | 3 |
| `packages/db/src/work-order-repository.ts:182` | Receipt query template interpolates permission SQL; complete query text is unresolved. | 3 |
| `packages/db/src/work-order-repository.ts:307` | Batch query template interpolates permission SQL; complete query text is unresolved. | 3 |
| `packages/db/src/work-order-repository.ts:312` | Order query template interpolates permission SQL; complete query text is unresolved. | 3 |

Concrete authority chain: `packages/db/src/activation-repository.ts` → `packages/db/src/commands.ts:81` (also `:109`). The generic replay boundary alone prevents current-source PASS. These are static inability-to-prove findings, not evidence that advisory feedback has actually altered money. Production fixes, function specialization, or a revised coverage contract require a separately scoped coordinator decision/order. None is silently implemented or exempted here.

## Remaining handoff and release gates

After final checks free disk is **209 GiB**, above the 45 GiB floor. Only the three builder-owned additions are present in final working-tree status; existing source/tests/config/CI remain unchanged. No migration, backfill, rollback, provider action, commercial decision, alert deployment or production compatibility change occurs. New CLI failures are the static guard diagnostic signal only. Intended conventional commit subject/body is written to `/private/tmp/jg-msg-ch6-csg-01.txt`.

Coordinator must register its exact lane, commit the working tree, record full final SHA/account-selector/dispatch evidence, and run all required CI on that head. CI links are **not available**. Required root test remains red until the actual-source HOLD is resolved through authorized scope; do not relabel the synthetic controls as whole-leaf PASS. PostgreSQL, migration, browser, security/dependency checks and exact-head CI are unexecuted locally and remain required. No clean-install claim is made; existing installed dependencies were used.

Two real independent Claude A/B exact-head verdicts and a separate fresh-context acceptance actor remain outstanding. This receipt is builder evidence only. No task/parent acceptance, merge readiness, CH-6/CH6-B closure, dependency waiver, v3 policy/producer adoption, DEMO-S completion, real-data approval or fee activation is granted. Ben owns merge; builder has not committed or pushed.

## r1

Issued 23 October 2026 by the Track A+B dispatcher. Started from branch `codex/sandbox/ch6-csg-01`, HEAD `62d8b6886f8d085b145ef65ec19cb5af0da178a9`, base/main `dc5721230fd8aedbf2d9d0457789074b66b48765`. Read the preceding **Actual-source HOLD inventory** before editing, plus repository AGENTS, BUILD_PLAN §2/C1–C8 and CH-6, the guard/tests, affected source constructs and dispatcher-owned lane. The r1 order explicitly authorizes the baseline and revised strict assertion. The historical installed-source HOLD above is superseded by the r1 deterministic guard results below; independent review/acceptance remains **HOLD**, not inferred from those results.

### r1 changes and source review

- Added static evaluation of template substitutions, immutable scalar bindings and bounded local function/arrow helpers with a single return expression. Arguments must resolve statically and bind by TypeScript lexical symbol. Numeric addition retains JavaScript scalar semantics. Inspected code never executes. Mutable/reassigned bindings (including assignment/destructuring, increment and for-in/of targets), recursion, runtime arguments, defaults/rest, async/generator helpers and multi-statement bodies remain unresolved. The depth bound is 64 symbols.
- Resolved **11 of the original 27 source cases**, removing **21 of 59 chain-specific diagnostics**: extra-repository `135/147/193/206`; site-visit-repository `139/144`; work-order-repository `125/176/182/307/312`. Each has a positive and forbidden-SQL negative control for the same construct; additional adversarial controls cover unsupported helpers and helper-derived receipt discriminators.
- Source-inspected the remaining **16 cases / 38 chain-specific unresolved records**: five receipt-discriminator cases, seven business `execute` calls, four conditional/runtime query constructions. Their exact locations and individual reasons are recorded in `tools/commercial-integrity-current-source-guard.unresolved.json`. Conditional alternatives, runtime command-family specialization, generic forwarding wrappers and SQL-vs-business receiver typing are outside this finite resolver. No claim that these constructs are universally impossible to analyse, or that their SQL is independently verified, is made.
- Baseline entries contain file, informational line, SHA-256 construct fingerprint, reason and exact `UNRESOLVED_COVERED_EDGE` code. Fingerprints bind the enclosing statement bytes (excluding leading trivia), diagnostic cause and occurrence of identical statements. Moving a statement to another line preserves the fingerprint; changing it requires review. Two identical calls at quote-delivery `43/44` have separate entries. Duplicate dependency chains share their source case, while newly copied occurrences cannot borrow an exception. The baseline is checked in explicitly; the guard does not update/grow it.
- The default repository API and CLI now fail on every confirmed forbidden diagnostic, unbaselined unresolved case, stale entry and malformed/duplicate baseline. Only exact unresolved-code matches can be covered; a confirmed forbidden dependency or SQL diagnostic is never filtered. New unresolved, stale and confirmed-forbidden failure modes have executable tests, including changed constructs and duplicate occurrences. Missing/unreadable/malformed baseline fails closed. In-memory projects retain strict raw diagnostics; `{ baseline: null }` explicitly exposes raw diagnostics for review. CLI reports the number of baselined cases alongside failing diagnostics.

The word reviewed here means **builder source-inspected reasons**, as requested for the explicit r1 baseline. It is not an independent model verdict, professional sign-off or approval of the business paths. No application behavior, commercial policy, migrations, provider configuration, package scripts, shared guards/tests or CI assertion was changed. C1: no web workflow. Dispatcher-owned `config/lanes/ch6-csg-01.json` is unchanged from HEAD. No sub-agents were used in r1.

### r1 execution evidence

Used installed Node `v24.17.0`, TypeScript `5.8.3` and existing pnpm `10.28.1` via `/private/tmp/ch6-csg-01-bin/pnpm`; no install/download or clean-install claim. Typecheck/lint/build ran with Turbo concurrency 1; unit runners use one worker. Typecheck/build reused existing Turbo artifacts, whose replayed logs can name other worktrees. Build used `CIRCLE_NODE_TOTAL=2`. The broader-check driver ran its package invocations sequentially. Logs are `/private/tmp/ch6-csg-r1-*.log`. No repository Git writes, staging, commit, push or publish occurred; existing lane tests create disposable Git fixtures under temporary directories.

| Command (package cwd where stated) | Actual r1 result |
| --- | --- |
| `node --test --test-concurrency=1 tools/commercial-integrity-current-source-guard.test.mjs` | **0; final 138/138 pass**, no skipped/todo/cancelled tests. `targeted.log`. |
| `node tools/commercial-integrity-current-source-guard.mjs` | **0; 42 protected roots, 0 failing diagnostics, 16 baselined unresolved cases.** Raw review mode: 38 unresolved records, 0 confirmed violations; default mode: 0 unbaselined, 0 stale. `cli.log`. |
| `node --test --test-concurrency=1 tools/*.test.mjs` (shell-expanded file list) | **0; 257/257 pass** at the earlier r1 iteration; subsequent guard changes were rechecked by the final 138-test targeted suite above. `tools.log`. No claim of a final all-tools rerun. |
| `pnpm typecheck --concurrency=1` | **0; 7 successful / 7 cached** tasks. `typecheck.log`. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | **0**, initially and after final guard changes; final 7 successful tasks / 4 cached. Purity, money and lane checks pass. Cache IO permission warnings are present. `lint.log`, `final-lint.log`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **0**, registered `ch6-csg-01` lane, including baseline path. `lanes.log`. |
| `CIRCLE_NODE_TOTAL=2 pnpm build --concurrency=1` | **0; 7 successful / 7 cached** tasks. Existing CSS warning appears in replayed build output. `build.log`. |
| `pnpm openapi:check` | **1**, sandbox `listen EPERM` on tsx's IPC pipe, before the check runs. `openapi.log`. |
| API cwd: `node --import tsx src/generate-openapi.ts --check` | **0**, same actual OpenAPI comparison through the import hook, without tsx CLI's IPC listener. `openapi-fallback.log`. No generated spec edited. |
| Core cwd: `pnpm exec vitest run --maxWorkers=1` | **1**; 5877 pass / 5 fail, 244 files. All five failures are emitted `dist/*.test.js` source-inspection tests trying to read nonexistent `dist/*.ts` files: jobs-on-the-go, recovery-allocation, site-extra-pricing, subscription-architecture (two). `core.log`. No dist artifacts deleted or tests changed to obtain a pass. |
| Core cwd: `pnpm exec vitest run src/ --maxWorkers=1` | **1**; 2939 pass / 2 five-second timeouts, 120 passing files / 2 failing files. This source-only run overlapped web units. `core-source.log`. |
| Core cwd: `pnpm exec vitest run src/enterprise-baseline.property.test.ts src/receipt-allocation.test.ts --maxWorkers=1` | **0; 98/98 pass**, isolated serial retry of the two timeout files with unchanged timeouts/assertions. `core-timeout-retry.log`. The preceding full-source run is still recorded as exit 1. |
| Config cwd: `pnpm exec vitest run --maxWorkers=1` | **0; 82 tests / 8 files pass** (includes discovered emitted copies). `config.log`. |
| AI cwd: `pnpm exec vitest run --maxWorkers=1` | **0; 147 tests / 15 files pass**, fixtures/fakes only; no live-model evaluation. `ai.log`. |
| Storage cwd: `pnpm exec vitest run --maxWorkers=1` | **0; 4 tests / 2 files pass** (includes emitted copy), adapter fakes, not a live object-store integration. `storage.log`. |
| DB cwd: `pnpm exec vitest run src --maxWorkers=1` | **1**; 240 pass, 18 skipped, 29 passing / 4 failing files. The substring filter accidentally selected four `test/*dbsrc*.integration.test.ts` files; their hooks fail with `no free port` in this no-bind sandbox. No successful PostgreSQL evidence is claimed. `db-unit.log`. |
| DB cwd: `pnpm exec vitest run src/ --maxWorkers=1` | **1**; corrected source-directory filter: 215 pass / 1 timeout, 24 passing / 1 failing file. `audit-checkpoint-handoff.test.ts` C-OPS-1 transitive source scan exceeded its unchanged five-second timeout. `db-source.log`. |
| DB cwd: `pnpm exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1` | **1**; isolated serial retry: 70 pass / the same 1 five-second timeout (5034 ms). **Remaining local check failure**, not waived or reclassified as a pass. `db-timeout-retry.log`. |
| API cwd: `pnpm exec vitest run src --maxWorkers=1 --exclude src/health.test.ts --exclude src/shadow-isolation.application.test.ts` | **1**; 2073 pass / 128 fail / 1 skipped, 119 passing / 7 failing files. Two known server/browser/database files were excluded from this local subset; other discovered HTTP tests produced 128 `listen EPERM` errors and consequent null-port failures. `final-account-lock.isolation.test.ts` fails its real-DB port hook. Other failing files: SSO `action-paths`, contractor `contractor-practice-session.http`, `practice-worker-switch.http`, `site-extra-pricing.http`, `site-extra.http`, `site-visit.http`. `api-unit.log`. No API success is claimed for the blocked HTTP/DB journeys. |
| Web cwd: `pnpm exec vitest run --maxWorkers=1` | **0; 867 tests / 40 files pass**. Unit/adapter tests, not browser journeys. `web-unit.log`. |
| `node --check` both guard tools; `git diff --check`; read-only unchanged-path comparison against HEAD | **0**. Lane file, existing shared scanner/tests, manifests/lockfile and workflows unchanged from HEAD. |

The corrected DB source scan still times out locally on its isolated retry; full root `pnpm test` therefore is **not claimed green**. The root runner, standalone PostgreSQL/migration/browser suites and exact-committed-head CI remain for GitHub CI under the dispatcher's environment note. Some broad local subsets reached DB port hooks and failed before database startup; they do not count as database executions or RLS proof. No timeout, assertion, suite, package script or release gate was relaxed. No migration/backfill/rollback, application compatibility change or operational alert deployment is required by this tooling-only change; the new operational signal is the guard's explicit baseline/violation failure output.

Final source hashes (SHA-256):

- Guard: `d869640011a5923ca87d870beaf0709dc71aac027bf1e0baeb6234ef3a0a7ea6`.
- Tests: `163829dd7f733962996baa57f361329d9120cc53d94d62f6ab32857bb808e783`.
- Baseline: `9c2c90863af91d3d4e6b6194f867971b281b55b242204891ee75826ac7e6d1b9`.

Final intended conventional commit subject/body: `/private/tmp/jg-msg-ch6-csg-01.txt`. Changes are confined to the guard, its tests, the new baseline and this receipt. Free disk observed at 205 GiB during final checks. HEAD remains `62d8b6886f8d085b145ef65ec19cb5af0da178a9`; no final commit was created by the builder. Dispatcher must commit/push the working tree and bind the actual final SHA, CI results and independent verdicts. **Independent exact-head Claude verdicts, separate technical acceptance and founder merge/release remain outstanding.** This is r1 local implementation evidence only: no CH-6/CH6-B parent closure, dependency waiver, v3 adoption, production activation, fee entitlement or real-data approval.

## review repair 1

Issued 23 October 2026 for PR #305, branch `codex/sandbox/ch6-csg-01`, starting head `fc3ff245da71d5862fcf7964379918f8e613652c`, base `dc572123`. Read AGENTS, BUILD_PLAN §2/C1–C8 and CH-6, both independent Claude A/B review files **in full** from `/Users/benharwood/.local/share/full-steam/jg-runs/v5-ch6-csg-01-claude-{A,B}-fc3ff245-20261023.md`, the guard/tests/baseline, applicable source constructs and registered lane. The review files are outside this worktree's `jg-runs/`. Both verdicts are REPAIR against the starting head; neither is a verdict on these uncommitted repairs. No sub-agents were used.

### Changes and invariants

- Enumerate every finite conditional alternative, including combinations in templates/concatenations and bounded local helpers with statically evaluated defaults. Enumeration is capped at 128 alternatives and the existing 64-symbol depth bound; unsupported expressions remain unresolved. No inspected code executes. The three cases `practice-access.ts:27`, `practice-session.ts:21/:52` now resolve and leave the baseline. Forbidden branches, edits to `table`/`sql`, and edits to `practiceOwnedJobsSql` are caught in installed-source mutation regressions.
- Fingerprints now bind the enclosing function/class (or statement), the original statement/cause/occurrence, and the transitive same-module declaration closure referenced by that construct. This is deliberately broader than the evaluator's visited inputs and includes declarations it cannot evaluate. Sorted declaration text makes traversal order immaterial; results are cached per AST node/cause. Feeding const/helper edits fail as unbaselined plus stale. Line movement, duplicate occurrence protection and chain-independent matching retain their earlier tests. All remaining 13 sites were re-bound to this stronger fingerprint; no new site or reason was added. Baseline **16 → 13**, raw chain-specific unresolved records **38 → 32**.
- Exact advisory marker literals anywhere in executable covered source produce a confirmed diagnostic, including new `claim`, `readReceipt` and dispatcher call arguments. They cannot borrow a generic helper's baseline. Type declarations remain erased. Ordinary SQL string labels retain their prior positive control.
- Imported runtime bindings in decorated constructor parameter types now count as dependencies, conservatively in every source tree (the installed API enables decorator metadata). Parameter decorators and decorated properties are also covered. Existing undecorated type-position behavior and explicit `import type` stay legal. Tests include the installed subscription application injection repro and safe/erased controls.
- Whole-row receipt references, including JSON conversion/aggregation and bare row aliases, count as result reads. Qualified columns and receipt counts retain their existing behavior. Non-advisory proof requires a plain positive `command_type = literal/immutable parameter` WHERE conjunct. Boolean comparisons, IS/CASE/NOT/OR and nested/joined ambiguous scopes fail closed. Array bindings must be const, unwritten, unmutated and unescaped; spreads cannot prove parameter ordinals. Element writes, splice and opaque escapes have regressions.

Existing tests were not edited or weakened. The first 24 reviewer-repro tests were added before implementation: **162 total, 138 passed / 24 failed** (`/private/tmp/ch6-review1-before.log`). They all pass after the repair. Additional controls cover erased metadata types, installed injection, nested/schema-qualified row projections and alternate forbidden ternary branches. Final targeted suite: **169/169 pass**, no skips/todos/cancellations. These are deterministic tests, not independent model verification.

The 13 remaining baseline cases retain their individual source-inspected reasons: runtime/generic receipt replay, the joined origin receipt read, the generic practice forwarding query, and business methods conservatively covered by the terminal `execute` name. No application source, commercial policy, migration, provider, package/lockfile, CI script, shared guard or lane file changed. C1: no web workflow. No migration/backfill/rollback, production compatibility change or deployed alert is needed; guard failure diagnostics remain the operational signal.

### Execution evidence

Used existing installed Node `v24.17.0`, TypeScript `5.8.3`, pnpm `10.28.1` through `/private/tmp/ch6-csg-01-bin/pnpm`. No dependency download/install or clean-install claim. Turbo uses concurrency 1 and unit runners use one worker. Existing Turbo cache output can refer to another worktree. Build used `CIRCLE_NODE_TOTAL=2`. Logs are `/private/tmp/ch6-review1-*.log`.

| Command / scope | Actual result |
| --- | --- |
| `node --test --test-concurrency=1 tools/commercial-integrity-current-source-guard.test.mjs` | **0; 169/169 pass** (`targeted-final.log`). |
| `node tools/commercial-integrity-current-source-guard.mjs` | **0; 42 protected roots; 0 diagnostics; 13 baselined cases** (`cli.log`). Explicit raw API inspection: 32 unresolved records, **0 confirmed violations**; default API: 0 diagnostics. |
| `node --test --test-concurrency=1 tools/*.test.mjs` (shell-expanded list) | Final **0; 291/291 pass** (`final-tools.log`), includes earlier shared-money and purity regression suites. |
| `pnpm typecheck --concurrency=1` | **0; 7 successful / 7 cached** (`typecheck.log`). |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | **0**, initial and final; final 7 successful / 4 cached, existing cache IO permission warnings (`final-lint.log`). |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **0** (`lanes.log`). |
| `CIRCLE_NODE_TOTAL=2 pnpm build --concurrency=1` | **0; 7 successful / 7 cached** (`build.log`). |
| `pnpm openapi:check` | **1**, tsx CLI IPC `listen EPERM` before comparison (`openapi.log`). |
| Core cwd: `pnpm exec vitest run src/ --maxWorkers=1` | **0; 2941 tests / 122 files pass** (`core.log`). |
| Config cwd: same source-only command | **0; 41 tests / 4 files pass** (`config.log`). |
| AI cwd: same source-only command | **0; 147 tests / 15 files pass**, synthetic fixtures/fakes, no live-model evaluation (`ai.log`). |
| Storage cwd: same source-only command | **0; 2 tests / 1 file pass**, adapter fakes (`storage.log`). |
| DB cwd: same source-only command | **0; 216 tests / 25 files pass**, source units, not PostgreSQL integration (`db-source.log`). |
| API cwd: source-only command with local server/DB exclusions | Initial **1; 2061 pass / 2 fail**, 116 passing / 1 failing file, plus 2 unhandled errors. Excluded `**/*.http.test.ts`, `src/health.test.ts`, `src/shadow-isolation.application.test.ts`, `src/sso/action-paths.test.ts` and `src/final-account-lock.isolation.test.ts`. SSO exclusion had the wrong directory; actual `src/auth/sso/action-paths.test.ts` attempted a listener and failed `EPERM` (`api-source.log`). This failure remains recorded. |

The first broader-unit driver was interrupted after the API result, while starting web units; that web attempt has no completion result (`web.log`). Corrected API subset, fresh web units and OpenAPI import-hook results are appended below. Exclusions are local sandbox subsets only; no repository test or mandatory CI suite was made optional. Root `pnpm test`, real PostgreSQL/migrations and browser suites remain for GitHub CI as the dispatcher instructed; the sandbox cannot bind localhost or start PostgreSQL.

Finite scope remains explicit: naming-based authority discovery, module-level traversal after selective barrel resolution, opaque external packages, no universal taint/SQL isolation claim. Deliberate loader/method obfuscation (`createRequire`, query `.call`/`.bind`), dependency injection wired through unrelated composition modules, unqualified SQL/search_path and arbitrary third-party builders remain outside this finite guard. The reviews' adjacent LATER items are not claimed fixed. Structural unresolved diagnostics and chain-independent baseline keys retain the existing finite contract.

Source SHA-256:

- Guard: `a0aec9e217a30d6fa6f8ec330173febfd82312ab3e79317c7d305f63981d24f8`.
- Tests: `8d4d173667ae8ac5354c4c2dfe5ae128cb918812e8f5760a02e801882461a05f`.
- Baseline: `11b391f70086f138124cca9da916598cf8d189f2d04b39ed33db6726107c3b58`.

No Git write/stage/commit/push was performed. Intended conventional commit subject/body: `/private/tmp/jg-msg-ch6-csg-01.txt`. The dispatcher must commit/push and bind final-head CI and fresh independent verdicts; separate technical acceptance and founder merge/release remain outstanding. **HOLD for those gates**, with local guard repair complete; no parent CH-6/CH6-B closure, v3 adoption, fee activation or real-data approval is inferred.

Final broader-unit completions:

- API cwd: `pnpm exec vitest run src/ --maxWorkers=1 --exclude '**/*.http.test.ts' --exclude src/health.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/auth/sso/action-paths.test.ts --exclude src/final-account-lock.isolation.test.ts`: **0; 2045 tests / 116 files pass** (`api-local.log`). This corrects the local SSO exclusion; the initial failure above is not reclassified.
- Web cwd: `pnpm exec vitest run --maxWorkers=1`: **0; 867 tests / 40 files pass** (`web-final.log`), unit/adapter coverage, not browser journeys.
- API cwd: `node --import tsx src/generate-openapi.ts --check`: **0** (`openapi-fallback.log`), actual source OpenAPI comparison without the tsx CLI IPC listener; no spec edited.
- `node --check` both tools, `git diff --check`: **0**. Final working tree has only the guard, appended tests, smaller baseline and appended receipt modified. Remaining exact-head CI, real PostgreSQL/migrations/browser and independent acceptance gates are unchanged.
