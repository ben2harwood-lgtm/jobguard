# Batch 33: M2-1 practice order screen and M2-2 later delivery

## PR #575 repair — 5 November 2026

READY: batch-33 origin and replay-coverage repair; RED. This section supersedes the historical merge status below. The router already merged main as `9d6aef1169f569d9f5bc8774c7ba55864cf7b98f` (parents `889b44af0` and `28871adf3`); no unresolved index entries remain. This repair preserves that union and leaves the proven later-delivery implementation unchanged. No git-writing commands were run.

- Replaced the merchant-order bridge's request-URL origin comparison with the unchanged shared `isTrustedBrowserOrigin(request)` used by sibling routes. The fixture calls the real helper with explicit server configuration. Added localhost/127.0.0.1 regression coverage and rejection of unconfigured origins, wrong ports and forwarded-host spoofing before application work.
- Confirmed POST → merchantOrderReply → MerchantOrderApplication.execute → PurchaseOrderActionRepository.approve for approval requests, including the existing exact reviewed-facts/retry unit test. Added the route to that command's existing real replay-contract case and added the test path to the lane; the lane does not list itself. Preview and manual attestation retain their separate existing paths.
- Final local checks: apps/web `./node_modules/.bin/vitest run --maxWorkers=2 app/lib/merchant-order-server.test.mts app/api/contractor/origin.test.ts app/ui/supplier-documents.test.tsx`: PASS, 37 tests. apps/api `./node_modules/.bin/vitest run --maxWorkers=2 src/merchant-order.application.test.ts src/watchdog-registry.test.ts`: PASS, 131 tests. Core `./node_modules/.bin/tsc -p tsconfig.json`: PASS. Web `./node_modules/.bin/tsc -p tsconfig.json --noEmit`: PASS. Source-only TypeScript AST check confirms the route is listed under the approve replay case; this is not a PostgreSQL replay execution. Lane boundary lint and diff whitespace check pass.
- Initial web typecheck caught a missing .js extension in the new .mts fixture import; corrected and rerun successfully. Initial API registry run used stale compiled core and failed on main's cis-fixtures entry; rebuilt core from unchanged source and reran successfully.
- Required downstream: router commit/push, exact-head green CI including PostgreSQL command replay and production-build browser tests at both widths, plus independent RED recheck. This sandbox cannot start PostgreSQL or bind localhost, so neither suite was run locally. No migration, provider, real-data, deployment or launch change.

READY for router staging, merge completion and PR; RED. No git/index mutation, commit, push or PR performed here.

## Scope and merge

Compared with incoming main `199124c0885ca27558fbaf62a9a74dee7ad2818f` (both MERGE_HEAD and origin/main). HEAD remains `d15940e82bd76e03025b3c12f0da6bbc06fb3f8e` until the router completes the merge. The sole remaining content conflict was apps/api/package.json: resolved as the exact union of merchant-order and incoming evidence-bundle exports. Incoming rate-suggestion and evidence-bundle work is preserved unchanged.

M2-1 database action, attestation, audit/replay, command registry and migration proof are already on main. This group adds its fictional practice screen/API bridge and route classification. Main still posts accepted:"1", rejected:"0" for a later delivery. The retained branch fix posts cumulative accepted quantity (8 becomes 9), preserves rejected quantity, caps the increment at the remaining missing quantity and exposes later-delivered quantity. The focused UI regression passes; browser coverage additionally asserts accepted 9, missing 1 and later delivered 1 after reload. Browser session requests now use page.evaluate fetch so secure cookies use the browser jar. No live provider, customer-data activation or release is authorized.

The referenced batch-33-harden.md is absent. Applied the supplied brief, batch-9-harden.md, pre-check and existing branch hardening. Manual attestation remains outside LP-5 with its production lifecycle-adapter hold already named in docs/contracts/dark-merchant-order-v1.md; it is not lifecycle dispatch. The new bridge does not mint tenant context; PracticeAccess supplies verified context and actor. No worker tasks or new commands/tables are added.

## Migration reconciliation

- Branch migration list against incoming main: empty. All migration SQL, proofs and notes match main, whose top is 0610.
- Previously removed 0980_dark_merchant_order repeats main 0606 and remains absent, together with its obsolete proof. Use main's 0606 and proof.
- Routines recreated by this group: none. Consequently no routine body can replace or remove main's later guards, including lp5_command_result and outbound pause protections.
- Main's upgrade table/catalog lists, replay cases, migration-proof tests and registry command entries are retained. Only the merchant-order HTTP route classification differs in the core registry.

## Current local validation

Used installed repository binaries, without package downloads. Every Vitest invocation named at most three files and used --maxWorkers=2.

- packages/core: ./node_modules/.bin/tsc -p tsconfig.json: PASS.
- packages/db: ./node_modules/.bin/tsc -p tsconfig.json: PASS.
- apps/api and apps/web: ./node_modules/.bin/tsc -p tsconfig.json --noEmit: PASS in each workspace.
- apps/web: ./node_modules/.bin/vitest run --maxWorkers=2 app/ui/merchant-order.test.ts app/ui/supplier-documents.test.tsx app/lib/merchant-order-server.test.mts: PASS, 3 files / 10 tests.
- apps/api: ./node_modules/.bin/vitest run --maxWorkers=2 src/merchant-order.application.test.ts src/watchdog-registry.test.ts src/auth/context-boundary.test.ts: PASS, 3 files / 276 tests.
- apps/api: ./node_modules/.bin/vitest run --maxWorkers=2 src/auth/identity.test.ts: PASS, 1 file / 7 tests.
- packages/db: ./node_modules/.bin/vitest run --maxWorkers=2 test/m2-1-migration-proof.test.ts test/migration-proof-loader.test.ts: PASS, 2 files / 80 tests. These are source/proof checks, not PostgreSQL evidence.
- Total final targeted results: 373 tests passed across 9 files. The initial API invocation overlapped the core rebuild: it saw stale compiled core (rate-suggestions unclassified) and a context scan timeout under load (load average 29.33). After core completed, the same invocation passed without source or test changes.
- git diff --check origin/main: PASS. apps/api/package.json parses and has no conflict markers.
- Source-inspected the new web route/server imports: package exports only, no direct apps/api source import; server module starts with server-only. Cloudflare production build was not run in this constrained environment.
- node tools/agent-lane-boundary-lint.mjs: RUN, fails before staging because it unions the old HEAD diff with incoming main's staged files. Did not widen the lane to admit main's unrelated work. Separately applied the tool's exported lanePathAllowed to git diff origin/main: PASS, exact coverage of all 19 paths, no stale allow paths and no self-listing. Router must rerun standard lint after completing the merge.

## Required downstream evidence

- Router stages the resolved working files and completes the pending merge; the read-only index still reports apps/api/package.json unmerged. Then run standard lane lint.
- Exact-head green CI: pinned install, typecheck, lint, test, production build and required database/migration suites. PostgreSQL must prove fresh/upgrade success, command/replay/privilege guarantees, cumulative goods receipts, isolation and downstream match allocations.
- Production-build browser CI: M2-1-order-screen.spec.ts and M2-2-S.spec.ts at phone and desktop widths, at most two workers. No PostgreSQL instance or browser server was started here.
- One independent RED review at the exact final head. Local deterministic checks are not independent review or live integration evidence.

## Carried later points

Pre-check follow-ups remain outside this merge repair: merchant route error allow-list, deployed-origin verification, practice panel visibility outside synthetic mode, stale repository/contract no-HTTP wording, and delivered/rejected quantity semantics.

LATER / SIMPLICITY: apps/web/app/ui/supplier-documents.tsx — extract the later-delivery handler into a readable local function on a future touch, preserving the exact integer quantity helpers and request behavior; this makes cumulative quantity/revision rules easier to maintain without reformatting the whole component. Non-blocking initial source-review observation.
