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


## r1 — issued repair, 25 October 2026

Dispatcher-issued first repair round of two for head
`34c89294b516a8fc1173045dd540449aced70496`, stacked on accepted CH6-C
`f2db7eae7accbb81fb9c8d75c221c99d72ba362b`. This section supersedes the earlier
no-baseline design and red CI-B01 status under the new explicit repair order; it
does not erase the earlier failed runs. Source-inspected and test-executed only.
No independent verdict, acceptance, commit, push, merge or release is claimed.

Read AGENTS.md, BUILD_PLAN.md CH-6 and the accepted v3 contract. The requested
`jg-runs/v5-ch6-b-claude-A-34c89294-20261025.md` is absent from this checkout;
read attempts and nearby-directory searches found no copy. The dispatcher's
explicit blocker was independently reproduced: 32 unresolved root-to-source
edges at 13 sites and zero confirmed v3 advisory violations. This receipt does
not claim to have read the missing verdict. Read the accepted CH6-CSG-01 guard
and its baseline directly from git object `03907c5c`; neither reference file was
edited or installed into this branch.

### Repair and bounded source review

Retained the existing finite scalar evaluator: literal/conditional alternatives,
immutable lexical constants, concatenation/templates and synchronous local
single-return helpers are already resolved before producing an unresolved edge.
Added paired ordinary/advisory tests for finite literals, immutable constants,
static helpers and immutable receipt parameters. Added negative controls for
mutable scalars/arrays, effectful helpers and recursion. No remaining real-source
site is a closed scalar expression under that grammar; no resolver exception or
production-source rewrite was used to hide one.

Source-inspected all 13 remaining sites. Generic receipt helpers have runtime
command families and/or unconstrained OR branches; the extra-origin replay is a
joined result without a proven discriminator; the practice proxy forwards runtime
SQL; the other execute sites are business dispatch calls with runtime objects.
The new `tools/commercial-integrity-boundary.unresolved.json` records one entry
per site with a specific reason. Reasons follow the accepted CSG analysis after
checking the corresponding source; fingerprints were generated by this lane's
own guard against this checkout, not copied from another commit. Added only this
exact new path to the CH6-B lane allowlist.

Fingerprints bind the executable statement, enclosing function/class, transitive
same-module lexical declarations (including unresolved helper bodies), dependency
kind and repeated-statement occurrence. Root chains remain diagnostic evidence;
one reviewed site covers its multiple root paths. Line movement and unrelated
module declarations do not freeze the whole source file. Changed statements or
visited lexical inputs invalidate the pin. Missing/malformed/null baseline files,
invalid entries and duplicate entries fail closed. Baseline matching applies only
to `UNRESOLVED_COVERED_EDGE`; it never filters a confirmed violation. New unknown
sites fail, removed/resolved/changed pins are stale and fail, and confirmed leaks
still fail. Automated mutation controls cover all three modes, transitive helper
changes, invalid baselines and on-disk loading failures.

CI-B01 now asserts zero confirmed violations, zero unbaselined unresolved edges
and zero stale/invalid entries, retaining its aggregate zero-diagnostic assertion.
The CLI exits zero on this repository: **42 protected roots; 0 diagnostics;
13 baselined unresolved sites**. Raw inspection still reports **32 unresolved
edges at 13 sites**. These are explicitly bounded limitations, not proven-safe
runtime paths. No taint, PostgreSQL, hidden-source or interprocedural proof is
claimed. No existing failure assertion was skipped, deleted or weakened.

### Actual r1 checks

Used installed Node `v24.17.0` and pinned pnpm `10.28.1` through the existing
`/private/tmp/ch6-b-bin/pnpm` shim. No install/download, staging or git write.
Logs are `/private/tmp/ch6-b-r1-*.log`; exact unit commands and exit codes are
also in `/private/tmp/ch6-b-r1-results.json` and
`/private/tmp/ch6-b-r1-results-local.json`. All Vitest runs used at most two
workers, Turbo at most two tasks; the tools suite used one test worker.

| Command | Result |
| --- | --- |
| `node --test --test-concurrency=1 tools/commercial-integrity-boundary.test.mjs` | Final EXIT 0: 81/81 tests. |
| `node --test --test-concurrency=1 tools/*.test.mjs` | Final EXIT 0: 203/203 tests, no skips. |
| `node tools/commercial-integrity-boundary.mjs` | EXIT 0: 42 roots, zero diagnostics, 13 baseline sites. |
| `pnpm typecheck --concurrency=2` | EXIT 0: 7 tasks. |
| `LANE_BASE_REF=origin/main pnpm lint` | EXIT 1: lane stage rejects the six inherited accepted CH6-C files; core-purity stage passed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | EXIT 1: same inherited six-file mismatch; no scope widening. |
| `LANE_BASE_REF=HEAD node tools/agent-lane-boundary-lint.mjs` | EXIT 1: validator intentionally refuses self-comparison. Not reported as a pass. |
| `LANE_BASE_REF=f2db7eae7accbb81fb9c8d75c221c99d72ba362b node tools/agent-lane-boundary-lint.mjs` | EXIT 0: actual leaf diff against accepted parent. This does not replace the requested main comparison. |
| `pnpm exec turbo run lint --concurrency=2` | EXIT 0: all 7 package lint tasks. |
| `node tools/money-arithmetic-lint.mjs` and `node tools/commercial-boundary-lint.mjs` | Both EXIT 0, completing the root lint stages blocked by lane comparison. |
| `pnpm build --concurrency=2` | EXIT 0: 7 tasks; existing Next CSS/root and sandbox cache warnings. |
| `pnpm --filter @jobguard/ai exec vitest run --maxWorkers=2` | EXIT 0: 147 tests / 15 files; fixtures, not live-model evaluation. |
| Same Vitest command for `@jobguard/config` and `@jobguard/storage` | Both EXIT 0: 82 tests / 8 files and 4 tests / 2 files. |
| `pnpm --filter @jobguard/core exec vitest run src/ --exclude 'dist/**' --maxWorkers=2` | EXIT 0: 2960 tests / 124 files, including v1/v3 regressions. |
| `pnpm --filter @jobguard/db exec vitest run src/ --exclude 'test/**' --exclude 'dist/**' --maxWorkers=2` | EXIT 0: 216 source-unit tests / 25 files; not database evidence. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | EXIT 0: 867 tests / 40 files. |
| `pnpm --filter @jobguard/api exec vitest run src/ --maxWorkers=2 --exclude '**/*.http.test.ts' --exclude '**/health.test.ts' --exclude '**/shadow-isolation.application.test.ts' --exclude '**/auth/sso/action-paths.test.ts' --exclude '**/final-account-lock.isolation.test.ts'` | EXIT 0: 2045 tests / 116 files; listening/DB suites excluded only from this local invocation. |
| `pnpm openapi:check` | EXIT 1: tsx launcher IPC `listen EPERM`; generator did not run through that wrapper. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | EXIT 0: actual unchanged OpenAPI generator/check without launcher IPC. |

Initial broad core discovery also ran emitted `dist/*.test.js` copies: 5915
passed, 5 failed in 4 files because source-inspection tests tried to read nonexistent
`dist/*.ts` source paths. Corrected source-only selection passed above; no test
changed. Initial DB filter `vitest run src` also matched `test/audit-*dbsrc*.integration.test.ts`:
240 passed, 18 skipped, 4 suites failed before PostgreSQL startup because no local
port was available. Corrected explicit `test/**` exclusion passed above. An API
local-unit attempt found the mixed `final-account-lock.isolation.test.ts` database
fixture: 2047 passed, 1 skipped, one suite failed at its unavailable-port setup.
These attempts are not database evidence. The first aggregate runner was interrupted
as it moved to web after discovering that unintended DB selection; final web run
passed independently. No PostgreSQL or browser server was started successfully.

Full root `pnpm test` was not invoked because it includes the forbidden database
and listening-server suites. Root tools discovery and available source-unit suites
were exercised directly instead. Full database, migrations, HTTP/browser and
standard OpenAPI wrapper checks remain for dispatcher GitHub CI. No test was
made optional or changed to accommodate the sandbox. No runtime/schema/DB/provider,
model/prompt, commercial policy or product behavior changed; no migration, rollback,
new operational alert or release approval is needed for this tooling-only change.
Existing CI-H/source, D11/D12, parent and release holds remain. The repaired diff
still requires a different model's exact-commit verdict and separate acceptance.

Intended dispatcher commit message is in `/private/tmp/jg-msg-ch6-b.txt`.

Final r1 working-tree verification: `git diff --check` EXIT 0; accepted-parent lane check EXIT 0 covering exactly the five delivery paths; repository CLI EXIT 0. HEAD remains `34c89294b516a8fc1173045dd540449aced70496`. No commit or push performed.
