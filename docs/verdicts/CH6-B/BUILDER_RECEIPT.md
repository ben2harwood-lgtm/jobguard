# CH6-B builder receipt — HOLD

24 October 2026. Codex builder; source-inspected and test-executed only. No independent model verdict, acceptance, green source proof, commit, push, merge or release is claimed. C250: one build plus two bounded repair rounds completed; no further implementation round taken.

## Issuance, base and scope

The issued CH6-B order under decision 74 supersedes the draft's build prerequisites and permits this lane registration. It authorises build ahead, not merge. The order's “draft allowlist for MON1-I” wording is inconsistent with its explicit pure-tooling scope; safest bounded interpretation used **CH6-B's two exact new tool paths**, the explicitly authorised new lane file and this receipt. No MON1-I files were touched.

- Worktree: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/ch6-b`; branch `codex/sandbox/ch6-b`.
- HEAD / accepted CH6-C source base: `f2db7eae7accbb81fb9c8d75c221c99d72ba362b`.
- Integration target `origin/main`: `cdd1b29b75fcdc206e43e66dbd68d9f03c9b38fe`; local `main`: `694e9e1755f2a5680898eb0fa04af48afd66c86b`. No fetch or branch movement.
- Read AGENTS.md, BUILD_PLAN.md CH-6 and applicable advisory/shadow invariants, planning-pack common §§1–3.3, full CH6-B draft lines 4066–4095, CH6-C contract and receipt, existing money-origin scanner and lane validator.
- Reference guard absent from HEAD, `main`, `origin/main`, and supplied `cdd1b29b` tree. Read-only `git log --all -- tools/commercial-integrity-current-source-guard.mjs` found it; inspected latest available repair object `72f38f0aa0ae03fbeacc949d88a262d9f9465c20` (also read its tests). Adapted its TypeScript parser, lexical binding, selective barrel, finite SQL and authority-discovery patterns. Did not import, modify, baseline or replace the installed-v1 guard. **STOP/HOLD:** dispatcher must reconcile the order's “on main after #305” claim against actual target refs; object availability alone is not acceptance evidence.
- Only four new delivery files: `tools/commercial-integrity-boundary.mjs`, `tools/commercial-integrity-boundary.test.mjs`, `config/lanes/ch6-b.json`, this receipt. All existing tracked source and package files remain unchanged.

## Accepted inventory and choices

`git grep -n '^export ' -- packages/core/src/commercial-integrity-v3.ts` verified all fourteen accepted module exports, against CH6-C's contract/receipt inventory. None absent; no guessed or reduced inventory:

`commercialIntegrityV3InputSchema`, `CommercialIntegrityV3Input`, `commercialIntegrityV3Kinds`, `commercialIntegrityReviewSourceSnapshotV3Schema`, `CommercialIntegrityReviewSourceSnapshotV3`, `commercialIntegrityV3ResultSchema`, `CommercialIntegrityV3Result`, `commercialIntegrityReviewV3Schema`, `CommercialIntegrityReviewV3`, `commercialIntegrityFamilyV1Schema`, `CommercialIntegrityFamilyV1`, `CommercialIntegrityV3Error`, `canonicalCommercialIntegritySnapshot`, `evaluateCommercialIntegrityV3`.

Every identity is `{ file: 'packages/core/src/commercial-integrity-v3.ts', name }`. The scanner validates both the supplied inventory and actual TypeScript exports against the complete accepted set. Tests remove/rename every occurrence of each identity, not just one equivalent key. Type-only imports/uses are erased and do not count as runtime reads; types still remain in the validated inventory. DTO revision is the accepted `.v3` family (family routing DTO remains `.v1`). No runtime module is imported or evaluated by the scanner.

Safest choices under the issued Ben instruction: no production threshold/policy decisions; no exemptions for unresolved paths; no byte assertions, source hashes or unresolved baseline; no guessed v3 persistence API or hidden-table access; no new DB/browser suite for tooling with no database change, route or page. SQL controls are in-memory syntax fixtures, **not PostgreSQL tests**. All existing v1 code/checks remain intact. No migration, role, external action, schema, model, prompt, runtime alert, command or fee change.

`checkCommercialIntegrityBoundary(project, agreedV3Symbols)` returns sorted diagnostics with code, actual file, line, forbidden/unresolved dependency and root-to-source chain. Recursively discovers naming-based pricing/meter/fee/entitlement/subscription/activation/account-status roots and follows used named/default/namespace/aliased bindings and selective re-exports, wrappers and reached implementation modules. Harmless barrel exports, unused imports, comments, tests/fixtures and evaluator-to-authority input direction do not taint ordinary consumers. Static namespace re-exports resolve per member. Computed namespace access, escaping namespaces, ambiguous/missing exports, dynamic loaders and unknown query structure fail closed. SQL reads include the v3 feedback/routine namespace and v3 receipt/result discriminators; unknown receipt-result families remain unresolved rather than safe.

Static limits: finite naming discovery is not semantic discovery of enforcement under unrelated filenames; runtime reflection, external packages, provider/database routine bodies, arbitrary query builders and full interprocedural data flow are not proven. Reached implementation modules are conservative module-level approximations; pure barrels are selective. SQL handling is a bounded tokenizer/scalar evaluator, not a PostgreSQL parser or runtime query trace. Runtime hidden-source isolation and nonmutation remain CH6-P evidence requirements. This tool makes no claim of full shadow isolation or parent acceptance.

## Actual checks

Node `v24.17.0`; already-installed pinned pnpm `10.28.1` invoked through `/private/tmp/ch6-b-bin/pnpm`, which executes `node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs "$@"`. No install or package download. Heavy invocations serialised through existing `/Users/benharwood/.local/bin/heavy-slot` with `HEAVY_SLOTS=1`; at most two workers. The helper reports sandbox `sysctl`/`ps` permission failures: actual process/load admission measurement is not claimed. Initial disk availability 103 GiB.

Commands below ran from the worktree root, using the pinned pnpm PATH and heavy-slot wrapper where applicable. Full local logs: `/private/tmp/ch6-b-*.log` (not CI artifacts).

| Command | Actual result |
| --- | --- |
| `node --check tools/commercial-integrity-boundary.mjs` | EXIT 0 after initial implementation. |
| `node --test --test-concurrency=1 tools/commercial-integrity-boundary.test.mjs` — initial build | EXIT 1: 55 passed, 1 failed; actual source has 32 unresolved diagnostics. |
| Same command — repair 1 | EXIT 1: 64 passed, 1 failed; namespace re-export controls added; real source has 42 diagnostics including ordinary indexed-import false positives. |
| Same command — repair 2/final | EXIT 1: **65 passed, 1 failed / 66 tests**; corrected ordinary-data indexing vs module namespace access; real source again has **32 unresolved diagnostics**, zero confirmed forbidden v3 dependencies. CI-B01 is deliberately still blocking. |
| `pnpm --filter @jobguard/core typecheck` | EXIT 0. |
| `node --test --test-concurrency=1 tools/later-shared-money-discovery.test.mjs tools/core-purity.test.mjs` | EXIT 0; 6 tests passed. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/commercial-integrity-v3.test.ts src/commercial-integrity-v3.boundaries.test.ts src/commercial-integrity.test.ts` | EXIT 0; 25 tests / 3 files passed, including unchanged v1 regression. |
| `pnpm --filter @jobguard/core lint` | EXIT 0. |
| `LANE_BASE_REF=origin/main pnpm lint` | EXIT 1. Core purity passed (231 files, 7 existing reported computed imports); lane guard rejects six accepted CH6-C parent files in stacked diff. Subsequent root lint stages did not run. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | EXIT 1, same six inherited CH6-C paths. No lane widening/base falsification. |
| `pnpm build --concurrency=2` | EXIT 0; 7 successful tasks, 2 cached. Existing Next root inference/CSS and dependency/cache warnings; no server started. |
| `pnpm typecheck --concurrency=2` | EXIT 0; 7 successful tasks, 2 cached. |
| `pnpm openapi:check` | EXIT 1 before schema check: sandbox `listen EPERM` on tsx launcher IPC socket. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | EXIT 0; same generator/check mode without launcher IPC. No generated file changed. Standard wrapper still requires CI rerun. |
| `node tools/commercial-integrity-boundary.mjs` | EXIT 1; **42 discovered protected roots, 32 unresolved diagnostics**, zero confirmed forbidden dependencies. Full JSON chains in `/private/tmp/ch6-b-source.log`. |
| `node --check tools/commercial-integrity-boundary.mjs` and `node --check tools/commercial-integrity-boundary.test.mjs` (final) | Both EXIT 0. |
| `git diff --exit-code` and targeted `git diff --exit-code HEAD -- tools/shared-money-origin-scan.mjs packages/core/src/commercial-integrity.ts packages/core/src/commercial-integrity.test.ts package.json` | EXIT 0; no existing tracked file edited. New files are untracked because committing/staging is prohibited. |
| `git diff --check` | EXIT 0 (tracked diff only; no staging performed). |

Final disk availability remains 103 GiB. No database, migration, browser, native, live-model or provider test was run. No such test was added: this pure-tooling leaf has no DB change, page, route, model/prompt or provider adapter. The source SQL controls are parser tests only. Root `pnpm test` was not run locally (would fan out subsystem suites, including prohibited DB work); focused tools/core tests above were run and the guard is automatically included in existing `node --test tools/*.test.mjs` CI discovery.

## STOP: actual source proof remains red

There are 32 unresolved root-to-source paths, reduced to the following 13 unique source sites. No confirmed forbidden v3 dependency was found, but unresolved does **not** mean safe. The real-source assertion remains failing; no skip, TODO, allowlist, hash or baseline masks it. CI-B01 is **NOT SATISFIED**, so this delivery is **HOLD / NOT ACCEPTED**, not downstream build/merge clearance. Repair 2 used the last C250 round.

| Source site | Unresolved reason |
| --- | --- |
| `packages/db/src/commands.ts:109` | app.command_receipt.result without proven non-advisory discriminator |
| `packages/db/src/commands.ts:81` | app.command_receipt.result without proven non-advisory discriminator |
| `packages/db/src/demo-seed.ts:70` | unknown query text/structure |
| `packages/db/src/demo-seed.ts:94` | unknown query text/structure |
| `packages/db/src/extra-repository.ts:49` | app.command_receipt.result without proven non-advisory discriminator |
| `packages/db/src/extra-repository.ts:75` | app.command_receipt.result without proven non-advisory discriminator |
| `packages/db/src/practice-session.ts:73` | unknown query text/structure |
| `packages/db/src/quote-delivery-repository.ts:43` | unknown query text/structure |
| `packages/db/src/quote-delivery-repository.ts:44` | unknown query text/structure |
| `packages/db/src/site-visit-repository.ts:197` | unknown query text/structure |
| `packages/db/src/site-visit-repository.ts:205` | unknown query text/structure |
| `packages/db/src/site-visit-repository.ts:49` | app.command_receipt.result without proven non-advisory discriminator |
| `packages/db/src/subscription-executor.ts:14` | unknown query text/structure |

Exact unique-site count: 13; distinct chains retain the total of 32.

The scanner follows generic receipt helpers with runtime-selected command types and dynamic SQL constructors. Proving those paths requires a bounded source/resolver design from the coordinator, not reducing the accepted v3 inventory or declaring old unknown paths safe. No changes to those protected/shared source files are authorised in this leaf. The no-hash/no-baseline requirement is preserved. The in-memory controls pass, but they cannot replace this missing real-source proof.

CI-B02/B03/B06 controls passed. CI-B04 detects actual SQL syntax, including v3 receipt reads in protected-path fixtures; persisted CH6-P feedback/source reproduction is not installed or proven here and remains a source gate. CI-B05 advisory UI/read/review fixture legality and existing v1/core/purity/money checks passed; the separate installed-v1 CSG guard is absent from this checkout, so its own repository-source suite was NOT RUN. All runtime pre-lock query-log/nonmutation proof, CI-H1–H7, D11/D12, parent SV-5/MON-1 acceptance, two exact-head Claude verdicts and separate acceptance remain held. The issue clears the agreed-symbol build prerequisite; it does not supply those results.

## Shared integration and dispatcher handoff

No shared integration edits were made or are needed to discover the new tool test: root `test` already includes `tools/*.test.mjs`. **Additive rows for this leaf:** shared core/db/API barrels: none; catalogue entries: none; Nest/Next routes: none; OpenAPI: none; migrations/roles: none; package scripts/CI: none. New exact lane file is supplied in the authorised shape and names only this branch, tools and receipt. C1 tooling exception is recorded in its note.

The predecessor's pending coordinator barrel row, if still needed for later runtime consumers, remains `export * from './commercial-integrity-v3.js';` in `packages/core/src/index.ts`; this source scanner does not require or simulate that row. Do not treat this receipt as authority to change it. Later consumers must use their own accepted integration contract.

Before review/acceptance: reconcile reference-guard target availability; resolve or obtain a separately issued design for the 13 unknown sites; integrate the accepted CH6-C parent into the real target and rerun lane checks against that target without granting parent files to CH6-B. Then rerun the real-source tool test/CLI, standard root checks and required CI. No missing green result or review is inferred from the build-ahead order. This receipt makes no change to BUILD_PLAN.md outside the allowlist; the unresolved seam is handed back here instead.

Intended commit message is written at `/private/tmp/jg-msg-ch6-b.txt`. Dispatcher owns staging/commit/push; Ben owns merge/release. Exact final commit does not yet exist, so independent verdicts cannot bind this uncommitted work. Do not label CH6-B accepted or CH-6 complete from this delivery.

Supplemental lane-schema/path check: invoked `loadLanePolicy`, `selectLane` and `lanePathAllowed` directly for the exact four delivery paths; EXIT 0. This validates the new registration and owned paths only, and does not replace the failed `origin/main` range checks. Final read-only `git status --short` shows only the four authorised new delivery paths; no commit/stage/push occurred.
