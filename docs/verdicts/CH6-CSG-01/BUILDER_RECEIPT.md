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
