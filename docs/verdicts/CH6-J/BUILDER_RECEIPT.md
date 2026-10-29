# CH6-J builder receipt

> Current state, 28 October 2026: CH-6 continuation is ready for router commit,
> GitHub CI and the independent RED review. The final section below supersedes
> previous incomplete/facade/source-port statuses. Explicit allocation avoidance
> refuses the installed neutral-source handoff; it does not depend on SV-6.


Status: BUILD-AHEAD IMPLEMENTATION; aggregate acceptance HELD. Builder source inspection and focused unit execution only. No independent model verdict or technical acceptance is asserted. No commit, push, merge, migration, live provider, spending or commercial external action.

## Authority and base

Issued CH6-J order (24 October 2026), decision 74, C250 and Ben's 23 October safest-choice answer. Read repository AGENTS.md in full, BUILD_PLAN.md §2.4 C1–C8, §10.2.9 and CH-6 card, planning pack common contract III-AUTH through III-RECEIPT, shared ownership, complete CH6-J draft at lines 4219–4259, adjacent CH6 contract/holds, and `/Users/benharwood/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261023.md`.

Actual branch `codex/sandbox/ch6-j`; unchanged HEAD/base `cc59edd22d495a77b64c570bf3252cb7d6ed2350` (CH6-A). Integration target `origin/main` resolves to `cdd1b29b75fcdc206e43e66dbd68d9f03c9b38fe`; local `main` is older (`694e9e1755f2a5680898eb0fa04af48afd66c86b`). Dispatcher owns final commit SHA and CI/review binding. Consumed build-ahead producers as issued; no assertion that their review/merge gates have cleared.

Installed Node `v24.17.0`, TypeScript 5.8.3, Next 15.5.27, React 19.1.9, Vitest 4.1.11. Lockfile/package manifests unchanged. Pinned pnpm 10.28.1 cannot start through installed launcher (see validation).

## Exact changed files

- `apps/web/app/ui/commercial-integrity.tsx`: installed family-first wrapper; saved v1 presentation retained, no client fixture/evaluator or activation-counter fetch; common persisted-review path.
- `apps/web/app/ui/commercial-integrity-v3.tsx`: strict family/view/feedback parsing, generation-scoped reads, snapshot hashing, exact retry identity, saved v3 results and accessible review/error/loading controls.
- `apps/web/app/ui/commercial-integrity-v3.test.tsx`: focused source-only journey/controller/render tests; synthetic wire fixtures are unit data, not browser acceptance evidence.
- `apps/web/e2e/ch6-integrity-v3.spec.ts`: real existing capture/job page; current composition unavailable path (or generated v3 zero ordinary findings once integrated); reload and second context, notice, no legacy flash/links/overflow, screenshot destination.
- `apps/web/e2e/ch6-integrity-v3-helpers.ts`: existing fictional capture commands; no final advisory-result seeding.
- `config/lanes/ch6-j.json`: explicit order-authorised lane, parent's version-2 single-lane shape, exact file list and browser spec.
- `docs/verdicts/CH6-J/BUILDER_RECEIPT.md`: this receipt.

Read-only legacy `apps/web/e2e/M1-16-S.spec.ts` unchanged. No shared barrel, catalogue, route registration, stylesheet, money, meter, Final Check, source adapter or database file edited. No schema change; migration 0234 remains untouched/reserved to coordinator. No new role/routine/grant.

## Implementation and safest choices

1. Family is fetched with `cache: no-store` before data. Unknown/error/malformed/wrong-job/mode/contradictory responses render unavailable; there is no fallback, fixture, false empty state or previous job display. Canonical lower-case UUID comparisons and paths. Existing v1 endpoint lacks a jobId in its public view; retain that contract and bind to the selected job path plus request generation rather than inventing a field.
2. V3 uses the actual CH6-C schemas and canonical serializer from its built module, following A/P's private module seam until dispatcher adds public exports. Browser SHA-256 derives the finding snapshot hash only; it does not evaluate advice, choose policy, derive fees or change facts.
3. No optimistic dismissal. Only a matching persisted feedback response followed by an authoritative family/data re-read completes saving. The same command ID AND exact payload survive retry after failure/unknown outcome within the mounted application. Reload/new process reads persisted feedback; it does not persist unsaved commands or session authority locally. Edited uncertain payloads require reload. Historical feedback for another snapshot does not dismiss today's finding.
4. Source descriptions show ordinary record type, server time, provenance and same/authorised-related-job wording, not source IDs, session digest, hashes, private references or arbitrary link targets. No source link is manufactured. Actual base source types `customer_invoice` and `customer_payment` are mapped explicitly. Unknown authorised ordinary types use “Recorded source”. No hidden-source labels, counts or requests.
5. No guessed delay/repetition profile or cross-account lookup. Available/unavailable ordinary assessment is explicit, including zero ordinary findings. Money presentation uses the existing exact pence formatter; safe numeric or decimal-string pence comparisons display GBP to two decimals. No count/state/price/cap/fee/account action is introduced.
6. Review explanation is bounded to 500 characters. Loading/errors are accessible, review textarea receives focus, Escape/Close restore the triggering control, primary buttons have minimum 44×44 dimensions. Raw server/schema/network errors never enter DOM. Job changes remount; unmount, focus, page show, visibility and explicit session-change invalidation clear stale responses/review drafts. See session integration hold below.
7. Safest DEMO-S choices: refuse unavailable/ambiguous authority; do not infer a family or a saved dismissal; hold unsupported sources rather than disclose; never derive a count, fee or settlement. Existing server authorization is sole write authority. No new load-bearing policy adopted.

## Verified symbols and STOP / integration handoff

`git grep` verified `commercialIntegrityFamilyV1Schema`, `commercialIntegrityReviewV3Schema`, `commercialIntegrityV3ResultSchema`, `canonicalCommercialIntegritySnapshot` in `packages/core/src/commercial-integrity-v3.ts`; `CommercialIntegrityV3Application.view/review/family` and its return shape; P's `CommercialIntegrityV3Repository` and receipt fields; installed Next family/v3/review routes; installed wrapper call from workspace-shell; actual browser projects and legacy spec.

- **STOP J-S1 (existing producer composition):** `git grep commercialIntegrityV3 apps/api/src/workspace/application.ts apps/api/src/workspace/index.ts` finds no facade/export. Base Next transport intentionally responds 503 `INTEGRITY_UNAVAILABLE`. Coordinator must add `CommercialIntegrityV3Application` construction with current request-scoped `sessionId`, expose `commercialIntegrityV3: {family(id), view(id, query), review(id, body)}` bound to it, and preserve fresh authority on each call. No alternate client authority or direct DB path added here. Nest controller registration already exists; no duplicate row needed.
- **STOP J-S2 (public barrel):** shared `packages/core/src/index.ts` lacks `export * from './commercial-integrity-v3.js'`. Exact additive row belongs to dispatcher; this build consumes the already-existing private built module, so it compiles without a guessed export.
- **STOP J-S3 (OpenAPI):** exact-base generated OpenAPI is stale; coordinator owns regeneration after composition/registration. Do not edit generated catalogue in this lane.
- **HELD J-H1:** P currently provides invoice/payment ordinary activity only. Its published DTO returns `available:false`; quote/activation/work-event/assertion arrays are empty and no optional won/restart/allocation thresholds are installed. CI-H1/H2/H3/H4/H5/H7 remain producer-owned; no nine-family aggregate claim, accepted imported-v3 source claim, or won-never-live source proof. Conditional unit labels test selected family transport only, not producer discrimination.
- **HELD J-H2:** no accepted source-ID-to-authorized-evidence-page contract for these advisory records. Source navigation remains plain text, no links. Coordinator/source owner must supply exact same-job route and authorization contract before enabling links or adding their browser journeys.
- **HELD J-H3:** the component supports `jg:session-changed` and focus/visibility invalidation, but no existing shell dispatch of that event was found. For same-document session replacement, coordinator must dispatch `window.dispatchEvent(new Event('jg:session-changing'))` immediately when session reset/sign-in begins (clear without fetching), then `window.dispatchEvent(new Event('jg:session-changed'))` after the new session is installed (reload). Full-document navigation/remount is already generation-safe. No claim of arbitrary invisible HttpOnly-cookie-change detection or completed CI-J04 across all reset modes.
- **HELD J-H4:** parent acceptance/merge gates, two exact-head independent Claude verdicts, separate acceptance, full exact-head CI and both browser projects remain outstanding. No source inspection or unit mock is counted as real PostgreSQL/browser evidence.

No additional database test file is authorised by the UI-only allowlist. Existing producer PostgreSQL suites remain required and untouched: `packages/db/test/commercial-integrity-v3.integration.test.ts`, `commercial-integrity-v3-review.integration.test.ts`, `commercial-integrity-v3-query-isolation.integration.test.ts`, `commercial-integrity-v3-receipt-guard.integration.test.ts`, `commercial-integrity-v3-upgrade.integration.test.ts`, plus CH6-A HTTP/authority tests. They are NOT RUN locally. No new database invariant is implemented by this UI.

## Acceptance mapping

| ID | Evidence / remaining hold |
|---|---|
| CI-J01 | Unit render shows persisted source type, exact rule/window, advisory/no-effect language and explicit zero/unavailable state; real two-project source journey HELD J-S1/J-H1. |
| CI-J02 | V1 labels/test IDs and saved-only values retained; unchanged M1-16-S regression NOT RUN and HELD on family composition. No v3 fixture/cap flash in unit tests. |
| CI-J03 | Unit controller covers exact canonical hash/retry body, forged/mismatched success, failures, stale session response, double click, new controller loading stored feedback; real DB receipt/restart proof NOT RUN. |
| CI-J04 | Generation invalidation tested at metadata, data and save stages. Current-session and other-session database proof remain upstream/CI; same-document reset dispatch HELD J-H3. |
| CI-J05 | No hidden fetch or conditional count; UI only ordinary validated view, no hidden IDs/links. Real zero/many worker/query-log differential proof HELD upstream and NOT RUN. |
| CI-J06 | Browser helper uses installed real fictional capture commands; no seeded final result or money/lock manipulation. Source-producing positive finding journey HELD J-H1. |
| CI-J07 | Explicit exclusion of held producer branches; no canned signal used as source proof. |
| CI-J08 | Unit tests cover exact supplied family routing v1/v3, unknown/wrong job/mode/track/contradiction/error with no fallback. Server policy/import classification stays A/P's responsibility; accepted-import browser journey HELD. |

## Commands actually run

Only source/unit/build/OpenAPI commands locally; no listener, PostgreSQL, browser, package install or dependency download command intentionally launched. The installed pnpm launcher itself attempted an automatic network version selection; no packages were installed.

- `pwd`, `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/main main`, `git branch --show-current`, `git grep`, `rg`, `cat`, `sed`, `git diff --check`: inspection completed; diff whitespace check exit 0.
- `node -v`: exit 0, v24.17.0.
- `pnpm -v`, `pnpm --filter @jobguard/web typecheck`, `npm_config_manage_package_manager_versions=false pnpm --version`: exit 1 before package scripts. Installed launcher refuses pinned 10.28.1 because registry signature cannot be verified (`fetch failed`); config attempt did not bypass it. No `pmOnFail=ignore`, lockfile edit or alternate package-manager version used. Package scripts executed directly with installed exact binaries below.
- First direct web `tsc` exit 2: CH6-C built output absent and initial test mock argument typing; built core and corrected test typing. Subsequent web typecheck exit 0.
- `node_modules/.bin/tsc -p packages/core/tsconfig.json`: exit 0 (untracked/ignored generated dist only).
- `../../node_modules/.bin/tsc -p tsconfig.json` in packages/config, packages/ai, packages/db and apps/api: exit 0 each. `node_modules/.bin/tsc -p packages/storage/tsconfig.json`: exit 0. These are build prerequisites, no source changes.
- `apps/web/node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`: exit 0 after implementation; also the exact web lint script body (package lint is tsc).
- Initial focused Vitest invocation used an incorrect relative binary path from apps/web: exit 127; corrected to local `node_modules/.bin/vitest`.
- `node_modules/.bin/vitest run --maxWorkers=2 app/ui/commercial-integrity-v3.test.tsx` in apps/web: successive source iterations exit 0 (36 tests); final expanded matrix result recorded below.
- One edit command used a repo-relative path from apps/web and failed before editing (`FileNotFoundError`); rerun from repository root successfully. Its following unchanged 36-test run passed. No claim the failed edit applied.
- `LANE_BASE_REF=origin/main node tools/lint.mjs`: exit 1. Core purity passed (240 TypeScript files, eight existing computed-import reports); lane boundary refuses inherited base producer files outside CH6-J. Do not broaden allowlist to conceal this build-ahead ancestry.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`: exit 1, same inherited out-of-lane files (log `/private/tmp/ch6-j-lanes.log`). This is the actual lint:lanes script body.
- `LANE_BASE_REF=cc59edd22d495a77b64c570bf3252cb7d6ed2350 node tools/agent-lane-boundary-lint.mjs`: exit 1, validator correctly rejects self-comparison while HEAD remains issued base. Separate explicit working-tree path audit below is labelled deterministic, not a passing lane-range check.
- `node tools/money-arithmetic-lint.mjs`: exit 0. `node tools/commercial-boundary-lint.mjs`: exit 0.
- First direct `next build`: exit 1 because API dist was not built. Second `CIRCLE_NODE_TOTAL=2 next build`: exit 1 because storage dist was not built. Dependencies then built sequentially. Final build result below. `CIRCLE_NODE_TOTAL=2` restricts Next static workers to one (its formula subtracts one); no source config edit.
- First `node --import tsx src/generate-openapi.ts --check` in apps/api: exit 1, storage dist missing. After storage build: exit 1, committed OpenAPI stale on inherited base. No regeneration performed.

## CI-only commands / remaining release gates

NOT RUN locally by order: PostgreSQL, migrations, restore, browser/Playwright/start-server suites, full workspace tests (include DB). New browser spec is written for existing pages only; no browser is launched even for listing tests. Required CI:

`pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop --workers=1 ch6-integrity-v3.spec.ts M1-16-S.spec.ts`, full `pnpm test:e2e`, `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `pnpm lint:lanes`, `pnpm test`, `pnpm build`, `pnpm openapi:check`, applicable producer `pnpm test:db` / `pnpm test:migrations` and fixture gates. Existing pipeline unchanged. Browser traces/screenshots and CI URLs not available. No model/prompt/parser changes, so no new live-model evaluation; previous evaluation requirements persist.

Affected invariants: AGENTS §§5.1/5.3/5.9/5.10/5.12/5.13/5.14, D11 advisory isolation; no effect on money/meter/fees/Final Check. Rollback: revert the UI files; no data migration/backfill/financial compensation. No operational alert added. Commercial/regional/live release gates remain closed. Generated fixture IDs are fixed fictional UUIDs in unit tests; browser capture IDs will be recorded by CI traces. External commercial effect count: zero.

## Final local validation results

- Final focused unit command (apps/web): `node_modules/.bin/vitest run --maxWorkers=2 app/ui/commercial-integrity-v3.test.tsx` — **exit 0, 46 tests passed**. Added controls also reject foreign ordinary source job, inconsistent source window/profile, mismatched receipt fields and duplicate in-flight review. Test run is synthetic source-only; not database/browser execution.
- Final web typecheck and package lint body: `apps/web/node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` — **exit 0**. All dependency package TypeScript builds above also exit 0.
- Production web build after prerequisite dist builds: `CIRCLE_NODE_TOTAL=2 node_modules/.bin/next build` (apps/web) — **exit 0**. Next completed compile/type validation, static generation and route collection, including existing job and family/v3 transport routes. Warnings: existing workspace-root inference, CSS `end` compatibility, Nest/file-type export and load-esm computed dependency. No warning suppressed. Final-source repeat logged at `/private/tmp/ch6-j-build.log`; result confirmed below.
- Explicit working-tree-only allowlist audit using exported `loadLanePolicy` / `lanePathAllowed`, `git diff --name-only HEAD` and `git ls-files --others --exclude-standard` — **exit 0**, seven paths, zero violations. This does not turn either failed lane-range command into a pass.
- Final `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs`, `git diff --check` — **exit 0** each.
- Intended conventional commit subject/body written to `/private/tmp/jg-msg-ch6-j.txt`; dispatcher must commit. HEAD remains the issued base, so no final commit hash exists yet.

Discovered later (coordinator backlog proposal; BUILD_PLAN.md is outside this lane): integrate the request-scoped CH6-A facade and core barrel row; regenerate stale OpenAPI; install two-phase shell session invalidation events; hand over authorised source-navigation and remaining CH6 source adapters; then execute persisted dismissal/restart/tenant/shadow differential browser/database acceptance. Keep these held instead of treating synthetic unit fixtures as source-production proof.

Final-source production build repeat: **exit 0** (`CIRCLE_NODE_TOTAL=2 node_modules/.bin/next build > /private/tmp/ch6-j-build.log 2>&1`, apps/web). Final whitespace check: **exit 0**. All generated build outputs remain ignored; the final seven changed paths stay within the issued allowlist.

## r1

25 October 2026. Repair order `jg-orders/CH6-J-v5-r1.txt`; read independent Claude A REPAIR report `jg-runs/v5-ch6-j-claude-A-c9098678-20261025.md` in full. Starting/remaining HEAD `298120254404521929237dce27e2c60de30ce489` on `codex/sandbox/ch6-j`. This section supersedes conflicting implementation/validation claims above. No commit, push or PR; dispatcher owns the next commit, exact-head review and acceptance.

### Repairs and scope

- **B1:** restored `apps/web/app/ui/commercial-integrity.tsx` byte-for-byte from `origin/main`. Deterministic `git diff --exit-code origin/main -- apps/web/app/ui/commercial-integrity.tsx` exits 0. It reads the original v1 endpoint directly, uses server decision status and preserves main's activation/cap/filter/review behavior, including its existing initial fixture and optimistic feedback behavior. Those inherited behaviors are not claimed as v3 guarantees. No installed page imports the family-first journey. Only the standalone `CommercialIntegrityV3` seam uses it; installing v3 remains HELD on J-S1 composition.
- **B2:** v3 web component imports the four existing public exports from `@jobguard/core`. CH6-A r2 already added the core/db barrel rows; no missing export or barrel edit needed. No deep dist imports remain in these web files.
- The first no-dist proof also exposed two transitive deep imports in `packages/db/src/commercial-integrity-v3-repository.ts` and `commercial-integrity-v3-sources.ts`. Switched only those imports to `@jobguard/core` and removed the stale build-first comment. These are **cross-lane CH6-P file edits**, made under r1's “and anything similar” instruction because they directly prevented the required web proof. Dispatcher must serialize/coordinate these two import-only repairs with CH6-P; the CH6-J lane register has not been widened. No query, SQL, schema, posting, grant, repository behavior or migration change.
- Updated CH6-J browser coverage to the repaired installed behavior: saved v1 sources/cap/empty state remain visible even while a direct family probe returns unavailable; UI requests stay on v1, including after reload and a new browser context. Existing `M1-16-S.spec.ts` and all its assertions remain unchanged. Removed the old spec's expectation that the installed page should show the broken family's 503 alert; that expectation contradicts r1. This does not claim the standalone v3 seam is installed or browser-tested. V3 source/dismissal, process restart and source-production acceptance remain HELD, not replaced by weaker claims.

LATER disposition:

1. Ordinary focus/pageshow/visibility events no longer reload/clear the v3 journey, review draft or uncertain retry identity. Job mount, explicit reload and explicit session events retain invalidation. Same-document shell session dispatch remains HELD J-H3; removal of incidental focus refresh does not implement it.
2. Hard-coded installed D11 status removed with wrapper restoration; main uses the server status.
3. `LegacyResults` was removed with wrapper restoration. No separate unit-render claim for that deleted component; unchanged M1-16-S remains the required v1 DOM regression, NOT RUN locally.
4. Scope references compare canonical lower case; added a distinct mixed-case scope test. Existing malformed-scope rejection test retained.
5. Second browser context uses Playwright's configured `baseURL`, not a hard-coded port.
6. Spec name/comments now say new **browser context**; application-process restart proof remains HELD.
7. Replaced duplicate scenario names with one explicit server-selected v1 routing case and one server-selected v3 routing case. The identical routing assertions remain; no producer classification coverage is implied. Added scope test brings focused coverage to 44 distinct cases (previous 46 included repeated identical routing bodies).
8. Removed pageshow listener, eliminating mount-plus-pageshow duplicate load.

React best-practices skill read and applied to changed TSX: checked effect dependencies/listener cleanup, keyed job lifecycle, request generations, accessible loading/dialog controls and existing bounded explanation. User-required package imports take precedence over the skill's generic advice about barrel imports. This is builder source inspection, not an independent model verdict.

### Commands and results

Installed dependencies used; no install/download requested. Node v24.17.0, pinned pnpm 10.28.1 invoked directly via `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. A temporary `/private/tmp/ch6-j-r1-bin/pnpm` launcher invokes that same cached binary; final recursive commands used `PATH="/private/tmp/ch6-j-r1-bin:$PATH"` to prevent Turbo's nested calls selecting the system launcher. No repository package-manager, lockfile or configuration changes.

- No-dist attempt 1: moved every `packages/*/dist` aside, invoked cached pnpm `--filter @jobguard/web typecheck`: **exit 2**, four errors from the two transitive DB deep imports. All dist directories restored in `finally`.
- **Final no-dist proof: exit 0.** After the two import fixes, moved `packages/ai/dist`, `packages/config/dist`, `packages/core/dist`, `packages/db/dist`, `packages/storage/dist` to sibling `dist.ch6-j-r1-backup` names; asserted no `packages/*/dist` existed; removed ignored `apps/web/tsconfig.tsbuildinfo` for a fresh check; ran `node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs --filter @jobguard/web typecheck` (the pinned `pnpm --filter @jobguard/web typecheck` command): **exit 0**. Every directory restored in `finally`. Exit recorded in `/private/tmp/ch6-j-r1-no-dist.exit`. This is typechecking against source, not a clean install or runtime test.
- `pnpm --filter @jobguard/web lint`: **exit 0**; final repeat after browser assertion adjustment also exit 0 (`/private/tmp/ch6-j-r1-web-lint-final.log`).
- Initial `pnpm --filter @jobguard/web test --maxWorkers=2`: **exit 1**, 44 files/905 tests passed, v3 suite could not load because restored old core dist lacked the merged public exports. Rebuilt dependencies through the real workspace build; no test weakened or skipped to address it.
- Final `pnpm --filter @jobguard/web test --maxWorkers=2`: **exit 0, 45 files, 949 tests passed**, including all 44 CH6-J cases (`/private/tmp/ch6-j-r1-web-unit-final.log`). Synthetic unit evidence, not PostgreSQL/browser proof.
- `LANE_BASE_REF=origin/main pnpm lint`: **exit 1**, core purity completed (240 files, existing computed-import reports); lane boundary stops the remaining Turbo lint phase (`/private/tmp/ch6-j-r1-root-lint.log`).
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: **exit 1**, inherited build-ahead producer changes outside CH6-J plus the two explicitly noted DB import repairs (`/private/tmp/ch6-j-r1-lanes.log`). No allowlist broadening or lane pass claimed. Working-tree changed paths are the five CH6-J UI/test files, this receipt, and those two DB import files.
- Initial root typecheck/build invocations without the temporary pinned launcher stalled in nested system-pnpm calls and were interrupted. Tool returned 0 on interruption; this is **not** recorded as success. Initial logs `/private/tmp/ch6-j-r1-typecheck.log` and `ch6-j-r1-build.log` contain replayed cache output from other worktrees; those are not this run's executed checks.
- Final `pnpm typecheck` with pinned launcher: **exit 0, 7/7 Turbo tasks successful**, four cached (`/private/tmp/ch6-j-r1-typecheck-pinned.log`).
- Final `CIRCLE_NODE_TOTAL=2 pnpm build` with pinned launcher: **exit 0, 7/7 tasks successful**, two cached; web production compilation/type validation/static generation/route collection completed (`/private/tmp/ch6-j-r1-build-pinned.log`). `CIRCLE_NODE_TOTAL=2` limits Next static workers. Existing CSS compatibility, workspace-root and Nest/computed-dependency warnings remain; Turbo reports cache I/O EPERM warnings without failing the build. Final browser-only path assertion adjustment was subsequently typechecked by web lint.
- `pnpm openapi:check`: **exit 1 before generator execution**, sandbox rejects the tsx CLI IPC socket (`listen EPERM`, `/private/tmp/ch6-j-r1-openapi.log`). Safe equivalent `node --import tsx src/generate-openapi.ts --check` in apps/api: **exit 0**, catalogue current (`/private/tmp/ch6-j-r1-openapi-node.log`). No generated catalogue edit.
- `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs`, `git diff --check`: **exit 0** each. Read-only `git status`, `git rev-parse`, `git diff`, `git show`, source searches and review/contract reads completed. A broad file search was interrupted; a process diagnostic was denied (`ps: operation not permitted`); neither provides validation evidence.

### Remaining gates and handoff

**Browser NOT RUN. PostgreSQL/migrations NOT RUN.** No listener or PostgreSQL started. Both `M1-16-S.spec.ts` and `ch6-integrity-v3.spec.ts` must pass in CI in **mobile-360 and desktop**, and within the full required suite:

```sh
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop --workers=1 ch6-integrity-v3.spec.ts M1-16-S.spec.ts
```

No screenshots, traces or CI result asserted. Current independent verdict remains REPAIR until the dispatcher commits and obtains a fresh exact-commit review. CI-J02's code regression is repaired by exact-main restoration; its browser acceptance remains unverified. J-S2 export hold is resolved by the merged parent. OpenAPI is locally checked via the equivalent Node invocation. J-S1 facade, ordinary source completeness, source navigation, explicit shell session integration, persisted v3 process-restart/tenant/shadow differential proof and separate acceptance remain HELD. No fee/meter/settlement/Final Check action enabled; no commercial external effect. Rollback is a source revert, with no migration/backfill. Intended conventional commit subject/body written to `/private/tmp/jg-msg-ch6-j.txt` for the dispatcher.


## 28 October 2026 — CH-6 integration on ch6-j (RED, incomplete)

Read the current SIMPLE_LOOP.md, SIMPLICITY_RULE.md, repository AGENTS.md and
BUILD_PLAN.md CH-6 / 10.2.9. SIMPLE_LOOP supersedes the old BUILD_RULES coordination
rules. No git mutation, dependency download, database server, HTTP listener,
provider call, real customer data or release was used.

Resolved all four conflicted working files, retaining both controller sets and
providers, both tenancy tests and the union of B5 additive routine expectations.
OpenAPI was regenerated from the combined Nest controller graph and checked.
The index remains unmerged because .git is read-only; the router must stage the
resolved files. No git add/commit/merge/reset was run.

Ported the three tools files by hand from the requested read-only diff
origin/main...origin/codex/sandbox/ch6-b. No old branch receipt or lane was copied.
Rebound exactly five existing unresolved-site fingerprints after inspecting their
current code and branch diff: commands.ts lines 81/109 and extra-repository.ts
line 75 have only the upstream UUID schema compatibility change in their lexical
closure; site-visit-repository.ts lines 197/205 retain business execute(context,...)
with upstream assigned-jobs query extraction in their enclosing class. Reasons,
site count, violation detection and fail-closed new/stale-site checks are retained.
These remain unresolved sites, not a claim of whole-program runtime isolation.

Self-attack found and fixed two gaps in pure advisory evaluation:
- Allocation avoidance previously counted absent/reversed/overallocated receipts.
  It now requires exact unreversed receipt references, common amount basis, known
  catch lines, bounded outstanding value, and a cumulative exact bigint allocation
  total within receipt capacity (including other saved active allocations).
  Receipts enter the finding source snapshot, so changed receipt revisions change
  its fingerprint. Duplicate inputs deduplicate; reversed competing allocations
  consume no capacity. Tests cover all of these boundaries.
- A supplied published lock could cite a different bill. Its source ID must now
  equal the lock ID, its server timestamp must equal the immutable cutoff and its
  provenance must be server_recorded. Cross-job/tenant/session references and
  duplicate receipt identities are rejected. Existing fixture locks were made
  explicit; previous assertions remain.

Added CI-only cross-tenant read/review/SQL-replay and RLS receipt isolation tests.
Extended the zero/many-hidden query-log test to compare protected economic records
after advisory reads, review and replay. The snapshot now includes MON-1 lifecycle
sources, computations, place bindings, corrections, alerts and day ledgers as well
as the prior meter, financial and document records. Added the v1-only cap-signal
label and its browser assertion. Fixed the two existing one-argument Zod record
calls in the DB feedback decoder and web legacy decoder for this merged base.
No migration is needed for these changes; reserved 0309 remains unused.

Local executed evidence (Node 24.17.0, installed pnpm 10.28.1 cached CLI):
- core targeted Vitest: commercial-integrity-v3.test.ts,
  commercial-integrity-v3.boundaries.test.ts, commercial-integrity.test.ts,
  --maxWorkers=2: PASS, 3 files / 28 tests.
- API targeted Vitest: commercial-integrity-v3.application.test.ts and
  commercial-integrity-v3.boundary.test.ts, --maxWorkers=2: PASS, 2 files / 24 tests.
- web targeted Vitest: commercial-integrity-v3.test.tsx, --maxWorkers=2:
  PASS, 1 file / 44 tests (rerun after the decoder fix).
- node --test --test-concurrency=1 tools/commercial-integrity-boundary.test.mjs
  tools/commercial-integrity-current-source-guard.test.mjs: PASS, 250 tests.
  New v3 guard alone: 81 tests. The tests mutate authority sources and prove
  forbidden dependencies/SQL cannot feed pricing, meter, fees, entitlement or
  account status within the scanner's documented source model.
- core, db, API and web typecheck: PASS. DB/API and web initially found the Zod
  decoder incompatibilities above; final runs passed after repair.
- core, db and config builds: PASS (needed to refresh inherited stale runtime
  exports before generating OpenAPI). API OpenAPI generation and --check via
  node --import tsx src/generate-openapi.ts in apps/api: PASS; no listener.
- core-purity, money-arithmetic and commercial-boundary lint: PASS. Core purity
  reports its existing ten computed-import observations, not refusals.
- TypeScript syntax parsing of four changed DB test suites: PASS, syntax only.
- git diff --check: PASS. React checklist applied to the two minimal TSX changes;
  no hook, lifecycle or architecture refactor. Existing source package imports
  retained. No independent review is claimed.

The initial system pnpm wrapper stalled and was interrupted; that run is not a
pass. OpenAPI initially hit inherited stale DB/config dist exports, corrected by
the builds above. One generation attempt from repository root could not resolve
the API-local tsx package; the final generation/check used the API directory.

Not run: PostgreSQL, migrations, browser/E2E, full workspace test/lint/build,
GitHub CI or RED review. These sandbox limits are explicit in the user brief.
Lane policy lists exactly these session's edited paths (plus its implicitly
permitted own file), not the inherited MON-1/main merge tree.

**Not complete: do not commit as a finished CH-6 piece.** This base still has only
CI-F05 as a persisted source adapter. CI-F01–04 have no exact published evidence /
catch-line financial DTO; CI-F06–08 still have empty ordinary quote/activation /
lifecycle arrays and no installed bounded profile; CI-F09 has no authorised opaque
identifier assertion source. Imported-v3 routing also stays unavailable. The
installed job page still uses the v1 panel; its v3 component remains a standalone
seam. This change does not turn those unavailable sources into empty successful
assessments or turn pure synthetic fixtures into persisted-source proof. The
remaining source-contract and page composition work must be completed before
aggregate CH-6 is called finished. CI and one independent RED review are then
required. The router handoff message is marked do not commit accordingly.


## 28 October 2026 — CH-6 persisted sources and installed v3 continuation (RED)

Ready for the router to stage the resolved merge and commit. This continuation
supersedes the preceding incomplete status and the earlier temporary message.
No commit, push, merge, release, PostgreSQL server, local listener, provider or
real customer data was used. Current working files preserve both merge parents
(HEAD 46eeb776 / incoming 36de0fe3); module tokens, shared relation expectations
and catalogue helpers were checked against the actual incoming merge parent.
The remote main ref moved during work; unrelated later main changes were not
copied into this task. The index still has unresolved entries because it is
read-only; conflict markers are removed from all four working files.

Implemented:
- 0309 source migration: exact owned accepted quote documents/party bindings,
  ordinary activity, immutable linked server lifecycle events, and minimized
  current-user account reuse; completed published Final Check evidence and the
  exact locked gross bill/catch lines/receipts; bounded synthetic credit/writeoff
  line sources and opaque user/phone/card assertions. Runtime has no direct
  SELECT or write grant on either new source table, no new hidden table grant,
  and no execution grant on the private publication/validation helpers.
- Eight active rule families F01–F03/F05–F09 now have persisted source paths.
  Missing inputs remain distinguishable from no findings. Assertions and exact
  correction mappings are owner-loaded, versioned fictional fixtures; no live
  identifier collection, raw phone/card matching or financial write route exists.
- The source reader enters its publication port only after ordinary lock presence
  and a completed, authorized publication bound to that exact lock/run. Public
  `published` is always null; the page receives only cited advisory snapshots.
  Pending/failed/unavailable publication refuses without private fallback reads.
- The checked feedback writer reconstructs each supported kind's exact facts,
  comparisons, profile and key in SQL before matching the canonical hash.
  Historical 0227 receipts replay before recomputation and retain their bytes.
- The installed page now uses the existing family-first journey, preserves saved
  v1 values/test IDs and v1-only cap labelling, and shows actual v3 read/review
  results plus readable refusals. Fabricated initial values are removed.
- LP-0 registers the one runtime read capability and all four new routine
  protection rows. SERIOUS-B5 and both exact tenancy/upgrade inventories union
  the new source objects with both parents' rows. 0309 adds no backfill or change
  to prior business facts. Migration notes give its forward-fix strategy.

Explicit source refusals:
- F04: `receipt_line_source_handoff_unavailable` / per-rule `source_absent`.
  The installed receipt-line adapter refuses every save with
  `RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED`, and 0258 explicitly quarantines its
  storage. CH-6 does not read/promote that quarantine or bypass its gate. The
  pure allocation detector retains exact capacity/reversal tests; SQL review
  refuses that kind until a later accepted neutral-source handoff. This is
  independent of SV-6. No speculative enabling switch was added.
- Imported-v3 family still refuses without immutable adoption routing. No lock,
  pending/failed/unauthorized publication, unsupported original completion
  metadata, absent/expired opaque assertions, missing exact quote party/value
  sources, missing catch gross-line amounts, and unmapped credit balances are
  explicit unavailable inputs. Actual corrections keep F02's credit-basis
  comparison unavailable rather than inventing net/gross adjustment semantics.
- All non-synthetic process routes remain closed; D11 production approval and
  real-data/provider/release gates are unchanged.

Self-attack and tests added:
- Duplicate/replayed source identities and feedback, distinct-session related
  quotes, cross-tenant receipt replay/RLS, forged locked-bill references, original
  evidence bindings, credit/line aggregate capacity and competing insert races.
- Whole-invoice versus exact-line corrections, partial unmapped credit balances,
  verified writeoff evidence and invalidation, exact locked gross receipt bounds
  and payment reversal. Source hash timestamps are timezone-normalized, with a
  UTC versus Pacific/Auckland regression. Unsupported isolation refuses with
  retry semantics instead of using a stale aggregate snapshot.
- Zero/many hidden query logs and byte comparison, a private publication trap
  proving the unlocked read never invokes it, closed runtime grants, and full
  protected-fact snapshots across reads/reviews/replays. Protected snapshots
  include quote/cap, account/membership, fee/landing/journal, subscription and
  MON-1 source/computation/place/correction/day ledgers.
- The published financial-parent fixtures explicitly bypass predecessor setup
  checks only while making fictional parent rows. CH-6 source guards, FK checks,
  reads and review verification run with ordinary triggers and RLS enabled.
  These are source projection tests, not financial/provider command proof.

Executed local checks, installed dependencies only (at most two workers):
- Core targeted Vitest, three named files: PASS, 28 tests.
- API v3 application/boundary Vitest, two named files: PASS, 24 tests.
- Web v3 journey/rendering Vitest, one named file: PASS, 48 tests.
- DB strict-input/LP-0 comparator unit Vitest, two named files: PASS, 31 tests.
- Node v3 + installed-v1 guards, test-concurrency=1: PASS, 253 tests.
  Total: 384 targeted local tests. Final v3 guard CLI: 58 protected roots,
  zero diagnostics, 13 existing exactly baselined unresolved sites. No new
  unresolved allowance was added; the five upstream fingerprint adaptations
  documented above remain the only ported-baseline changes.
- DB build, API/web typecheck, and expanded test-only TypeScript check covering
  the new DB suites plus shared catalogue inventories: PASS. Expanded test
  checking caught a fixture-scope mistake in the publication trap; it was fixed
  before the final passing check. These checks do not start PostgreSQL.
- OpenAPI `node --import tsx src/generate-openapi.ts --check` in apps/api: PASS.
- Core purity (279 files), money arithmetic and commercial boundary lint: PASS.
- git diff --check: PASS. Lane schema validates 33 exact edited/new paths plus
  its implicit own lane file. Full branch-diff lane lint was not presented as a
  pass against the read-only unresolved merge/inherited parent tree.

New DB suites, migrations, fresh/upgrade catalogue checks, query-log tests and
mobile/desktop browser journeys are CI ONLY and NOT RUN locally. Full workspace
build/test/lint and GitHub CI are not claimed. The router must stage, commit,
push and obtain green required CI plus one independent RED review on that head.
The new ready message is /tmp/ch6-j-20261028T183104Z-commit-msg.txt.

LATER / SIMPLICITY (initial self-check, non-blocking): the duplicate CH-6 routine
identity lists in tenancy.integration.test.ts and contractor-entitlement-upgrade.
integration.test.ts could share one test-only declared inventory. This would
reduce expectation-list drift while keeping actual PostgreSQL catalogue reads
independent from their expected values. No unrelated extraction was bundled.


## 28 October 2026 — review locking and supplementary source follow-up (RED)

Ready for router commit; migration 0309 is edited in place because it is not yet
on main. No git mutation, database process, local listener, download, provider,
real customer data or release was used. This follow-up still requires CI and
independent RED review against the resulting head; the earlier review at ef1ffc9e
does not review these new bytes.

Replaced the 27 table-wide SHARE locks with explicitly ordered FOR SHARE locks
on this tenant/job's source rows. Related-quote sources include the owned session
jobs needed by that rule, sorted by UUID, with no other tenant/session included.
Evidence invalidations are scoped through this job's evidence. The new priced
revision source mapping is also row-locked. Session/membership/command locking,
receipt replay, authorization rechecks and the final audit-head order remain.
After lock waits the source readers/fingerprint use a fresh coherent statement
snapshot (STABLE). This preserves exact aggregate/absence validation without
claiming that row locks prevent inserts into an empty predicate. Family is also
rechecked after the waits. No business lock is acquired after the audit append.

Added CI-only PostgreSQL regressions:
- Keep a successful review transaction open, actually update jobs in another
  tenant and an unrelated session under a bounded lock timeout, and prove the
  reviewed job still refuses a competing exclusive row lock. Exact replay still
  returns the original result and only one receipt exists.
- Hold this job, start a review, observe actual lock contention, then commit a
  new payment before releasing it. The review must see the fresh source horizon,
  reject the stale snapshot and leave no receipt/audit.
- Publish a real Final Check, issue the locked final invoice, confirm/price/approve
  its catch, assemble a descendant revision and issue the supplementary invoice
  through the checked runtime repository with the actual practice-session pool.
  Verify the baseline is not rebilled and the catch line is on the descendant.
  An exact synthetic writeoff source then saves/replays an advisory review citing
  that line and the original lock. No session_replication_role override is used
  anywhere in this test. Existing projection-only fixtures remain labelled.

That last path exposed an exact-ID gap: real assembled variation lines use the
priced revision ID, while the old reader only matched the variation ID. The
reader now resolves priced revisions back to their immutable origin variation,
retaining compatibility with the earlier owner-loaded fictional source fixtures.
Multiple possible invoiced catch lines still refuse exact attribution. No fee,
ledger, allocation, meter or invoice command behavior was changed.

Local checks actually executed, installed Node v24.17.0 / Vitest 4.1.12:
- In packages/db: node node_modules/vitest/vitest.mjs run --maxWorkers=1
  test/commercial-integrity-v3-input.test.ts — PASS, 1 file / 5 tests.
- node --test --test-concurrency=1 tools/commercial-integrity-boundary.test.mjs
  tools/commercial-integrity-current-source-guard.test.mjs — PASS, 253 tests.
- node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit — PASS.
- node node_modules/typescript/bin/tsc -p /tmp/ch6-j-test-types.json — PASS;
  temporary config extends the real root tsconfig and includes both changed DB
  integration files and their transitive imports. Typecheck only, no DB execution.
- git diff --check — PASS. Follow-up lane lists exactly its six changed source,
  test and existing documentation paths, plus its implicitly allowed own file.

One initial combined edit/check command used repository-relative paths from the
DB directory and failed before editing or running tests. The paths were corrected;
the successful commands above are the validation evidence.

NOT RUN: PostgreSQL integration tests, migration fresh/upgrade suites, browser,
full workspace suites or GitHub CI. The user explicitly reserves database/browser
execution for GitHub CI because this sandbox cannot start PostgreSQL or bind
localhost. These are pending checks, not passes. No new migration/backfill or
privilege change is introduced. Independent RED review remains for the loop owner.
The ready commit message is /tmp/ch6-j-20261028T195452Z-commit-msg.txt.


## 28 October 2026 — exact catch revision mapping and main merge repair (RED)

Ready for router staging/commit. This entry supersedes the earlier note about
compatibility with owner-loaded variation-ID line fixtures: no such fallback
remains. Migration 0309 is still unpublished and was edited in place.

Both `ch6_integrity_published` catch lookups now join the source line's tenant,
job and source_id to `variation_revision` tenant, job and id, then match
`variation_revision.variation_id` to the immutable `extra_origin.variation_id`.
The locked-account inclusion check and exact invoice-line lateral query both
use this representation; the ambiguity count also resolves revision identities.
A bare variation ID cannot match a real line. The existing tenant/job, original
lock, gross bounds, ambiguity refusals and source row locks remain.

Converted the shared published financial-parent fixture to reuse the actual
confirmed/priced/approved catch and final/supplementary invoice path. The
supplementary descendant contains the exact priced source revision, scope,
approval and approved description, and asserts that the baseline was not billed
again. Its financial facts now use PracticeInvoiceRepository recordReceipt,
previewCredit/issueCredit and reverseReceipt. The entire published suite contains
no session_replication_role override and fabricates no invoice, invoice binding,
invoiced line, extra origin, disposition, payment, credit or reversal rows.
The initial baseline and descendant account assembly remain explicit synthetic
fixture setup with triggers/FKs enabled; this is not an end-to-end quote journey.

The receipts comparison now proves 132001p versus the locked 120000p plus the
real 12000p catch, with reversal removing the finding. Credit and writeoff
findings run against that same actual catch-line representation. A real 83p net
credit yields 100p gross, retaining the original 60p versus 41p overflow and
competing 60p mapping tests without weakening their capacity boundaries.
The supplementary writeoff test separately proves the saved catch line cites
the original immutable lock and differs from the variation identity.

Resolved both incoming-main conflicts in working files, preserving the union:
- packages/db/src/index.ts: both meter exports and enterprise baseline export.
- contractor-entitlement-upgrade.integration.test.ts: both CH-6 source-table and
  platform enterprise fee-table expectation rows.
No markers remain. The Git index still lists conflicts because this sandbox
cannot write .git; the router must stage the resolved files. Other incoming-main
changes were left in place, with no unrelated refactor.

Local evidence actually executed (installed dependencies only, max one worker):
- DB input Vitest: node node_modules/vitest/vitest.mjs run --maxWorkers=1
  test/commercial-integrity-v3-input.test.ts in packages/db — PASS, 5 tests.
- node --test --test-concurrency=1 tools/commercial-integrity-boundary.test.mjs
  tools/commercial-integrity-current-source-guard.test.mjs — PASS, 253 tests.
- node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit — PASS.
- node node_modules/typescript/bin/tsc -p /tmp/ch6-j-test-types.json — PASS;
  checks the changed published suite, existing review suite and resolved
  contractor-entitlement upgrade suite with their transitive imports.
- git diff --check — PASS; explicit source assertions confirm no conflict markers,
  no direct source_id-to-variation-ID comparison and no replication-role override
  in the published suite. The lane lists exactly this follow-up's edited paths
  plus its implicitly permitted own file, excluding unrelated staged merge work.

NOT RUN: PostgreSQL, fresh/upgrade migrations, browser suites, full workspace CI
or independent RED review. Database execution remains CI-only under the user's
sandbox brief. No git write, download, live provider, real data or release action.
Ready message: /tmp/ch6-j-20261028T200215Z-commit-msg.txt.

## 28 October 2026 — main catch-up verification (RED; router action required)

The supplied worktree was already clean at merge commit 41ca6a5d, with main
8e80dabd as its second parent. There were no unresolved Git entries or conflict
markers to repair. This catch-up changes only this existing receipt and the
CH6-J lane file; it adds no product behavior or SQL changes.

Verified the merge result against the available origin/main:
- All 178 main migration SQL/note files match main byte-for-byte. No duplicate
  main migrations remain as branch additions under another name.
- LP-0 effective privileges, SERIOUS-B5 upgrade, contractor-entitlement upgrade,
  tenancy catalogue expectations and DB exports retain every main line; the
  branch contributes additive CH-6 entries only.
- config/lanes/mon1-read.json, including #377's lane note, matches main exactly.
- Migration 0309 matches both HEAD and the pre-merge first parent byte-for-byte.
  SHA-256: e127deaa30be03e0036265de63b559365b0f22881bd759eae5418421a3584ac3.
- No tracked working file contains unresolved conflict markers.

Updated config/lanes/ch6-j.json to enumerate the exact non-register paths in
this branch's diff against main, including inherited CH6-A and CH6-P work.
The lane's own file is implicitly allowed. The checker forbids a lane file
from granting any other config/lanes path; those inherited files cannot be
added to its allow list. The existing shared checker is unchanged.

Actual local checks (installed Node v24.17.0, Vitest 4.1.12):
- node --test --test-concurrency=1 tools/commercial-integrity-boundary.test.mjs
  tools/commercial-integrity-current-source-guard.test.mjs — PASS, 253 tests.
  Output: /tmp/ch6-j-20261028T212452Z-boundary-tests.log.
- From packages/db: node node_modules/vitest/vitest.mjs run --maxWorkers=1
  test/commercial-integrity-v3-input.test.ts — PASS, 1 file / 5 tests.
- node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit — PASS.
- Deterministic merge assertions listed above — PASS.
- node tools/agent-lane-boundary-lint.mjs --lane=ch6-j — FAIL: inherited
  config/lanes/ch6-a.json and config/lanes/ch6-p.json are outside this lane.
- The checker's exported migrationOrderViolations against origin/main reports
  inherited 0330_commercial_integrity_v3_receipts.sql must be above main's 0301.
  It is not present on main and is not a byte-identical copy of another main
  migration. It was preserved, not dropped or assigned an unreserved number.

Router action required before commit/PR readiness: reconcile inherited parent
lane files with the intended PR base under the existing lane policy, and arrange
an allocated number for inherited CH6-P migration 0227 (or land its dependency
and catch up to that exact base). Keep 0309 SQL unchanged. These are actual
admission failures, not a request to weaken checks. The attempted lane allow list
including parent lane files was rejected and corrected before this handoff.

NOT RUN: PostgreSQL, migration install/upgrade, browser, full workspace suites,
GitHub CI or independent RED review. Database/browser execution remains CI-only
under the sandbox brief. A pnpm --version probe stalled after a configuration
warning and was interrupted; subsequent checks used installed Node executables.
No Git write commands, live data/provider actions or release actions were used.
The router owns finish-list and Command Center state updates.

Commit-message handoff: /tmp/ch6-j-20261028T212452Z-commit-msg.txt is marked
"do not commit" because both admission blockers remain.

## 29 October 2026 — PR #392 main catch-up (RED)

Catch-up only against origin/main bf1052a025f37831f7956eec8b604c1cdefcf18c.
Resolved the three working-file conflicts, keeping both sides:
- app.module.ts has one Module decorator registering both CH6 and success-fee
  controllers, retaining main's providers and remaining controllers.
- OpenAPI is regenerated from that combined controller set. Every main path is
  unchanged and the three CH6 paths are additive.
- SERIOUS-B5 keeps both integritySourceAdditions and evidencePackV3Additions,
  with all source-intake, evidence-pack and demo-run expectations from main.

Deterministic assertions passed: no tracked conflict markers; every SQL file
from HEAD and current main is byte-identical to its respective source; all main
lines (including multiplicity) survive in LP-0 catalogue, effective privileges,
SERIOUS-B5, contractor entitlement and tenancy expectations. Migration 0309 is
unchanged: SHA-256 e127deaa30be03e0036265de63b559365b0f22881bd759eae5418421a3584ac3.
No new behavior, migration number, SQL change or protected fingerprint update.
The lane lists exact non-register branch diff paths against current main; its
own file is implicit, and the checker forbids granting other lane files.

Actual local checks (installed dependencies, one Vitest worker per run):
- Core and DB TypeScript builds: PASS (tsc -p packages/core/tsconfig.json,
  then tsc -p packages/db/tsconfig.json).
- API TypeScript noEmit: PASS (tsc -p apps/api/tsconfig.json --noEmit).
- Shared DB expectation TypeScript noEmit: PASS using temporary config
  /tmp/ch6-j-20261029T002245Z-types.json extending root tsconfig and including
  SERIOUS-B5, entitlement, tenancy and LP-0 catalogue test files.
- DB commercial-integrity-v3-input.test.ts: PASS, 5 tests. The initial invocation
  also named nonexistent lp-0-compare.test.ts; only the input file ran. The actual
  lp-0-catalog.test.ts was then run separately: PASS, 27 tests.
- API commercial-integrity-v3.application.test.ts and
  commercial-integrity-v3.boundary.test.ts: PASS, 24 tests.
- OpenAPI generate and --check: PASS from apps/api after rebuilding installed
  workspace outputs. Initial generation encountered stale compiled core exports;
  rebuilding core/DB resolved that without source changes.
- git diff --check: PASS.
- Node boundary/current-source-guard tests, --test-concurrency=1: FAIL,
  250 passed / 3 failed of 253. Log:
  /tmp/ch6-j-20261029T002245Z-boundary.log. All three failures concern the v3
  subscription-executor unresolved baseline: expected fingerprint
  6d06ef4e1ea57f5eb65bf754153483bf36573d734ff96c44d4f53fe4a2668561
  is stale against current source fingerprint
  e3022f3b698c45f3159149e4750bb539f49c66ad1de705035eb0a737ecb33852.
  No baseline/check was weakened or rebound under this catch-up-only brief.
- Lane CLI: FAIL; the uncommitted merge comparison includes incoming main
  paths and the inherited config/lanes/ch6-a.json and ch6-p.json. Independently
  comparing the working tree directly to main still identifies those two parent
  lane files outside this lane's permitted paths.
- Exported migrationOrderViolations against current main: FAIL for inherited
  0227 and own 0309, both below main's highest 0313. The explicit instruction to
  preserve migration 0309 and SQL bytes was followed; neither was renumbered.

A first edit invocation accidentally used root-relative paths from apps/api and
failed before editing; it was corrected. An intermediate controller union had
both Module decorators; inspecting the generated OpenAPI caught the lost
success-fee path, and the final single-decorator union preserves every main path.

NOT RUN: PostgreSQL, fresh/upgrade migration execution, browser suites, full
workspace suites or GitHub CI. Those remain for CI under the sandbox brief.
Git index still lists the three conflicts because no Git write is permitted;
working files are resolved and require router staging. RED-passed status was
supplied by the brief; this session performed deterministic checks, not another
independent review. Router owns work-list updates and all Git writes.

Handoff is NOT READY: existing lane/migration admission failures and the stale
v3 baseline remain. The requested message file is marked "do not commit":
/tmp/ch6-j-20261029T002245Z-commit-msg.txt. The router must resolve those through
the existing policy/authority before committing; no new reporting mechanism or
additional simplification is introduced in this repeat catch-up.

## 29 October 2026 — router-authorized admission reconciliation (RED)

READY for router staging and commit. This entry supersedes the previous
catch-up's admission blockers and its do-not-commit message. Prior resolved
controller/OpenAPI/SERIOUS-B5 behavior is retained; no new product behavior.

The router explicitly authorized these changes:
- Renumber 0227 to reserved 0330 and 0309 to reserved 0331, preserving order and
  SQL bytes. Used tools/migration-renumber.mjs's exported planRenumber with the
  router's reserved range starting after 0329, then applied its filesystem moves
  and stem-reference updates without Git writes. The helper's --write CLI cannot
  be used here: it requires a clean worktree and runs git add, both incompatible
  with the supplied unresolved/read-only Git index. The helper passed node
  --check before use; no shared helper/check was changed. Notes, executable
  fixture URLs, input SQL assertions and the LP-0 inventory now use current names.
- Archive branch-only config/lanes/ch6-a.json and ch6-p.json unchanged under
  archive/2026-10-29/ch6-j-inherited-lanes/. There is no ch6-b registration in
  this tree. All MON-1 and other main lane files already match main and remain
  unchanged. ch6-j lists exactly the surviving branch payload plus archives and
  new migration paths; its own lane file is implicitly allowed. No permission
  for config/lanes or the lane register was added.
- Refresh the single stale subscription-executor.ts:14 exception fingerprint
  in commercial-integrity-boundary.unresolved.json from 6d06ef4e... to e3022f3b...
  (full values recorded above). This one entry caused the three test failures.
  Same file, line, code, reason and exception count; no scope widening. Main's
  current-source-guard baseline already has that exact fingerprint and is kept.

Byte verification passed:
- 0330 equals HEAD's original 0227 exactly, SHA-256
  bb05d312c73a68488b395a9b659f6f712f8147212492df40f314ff68ddf20605.
- 0331 equals HEAD's original 0309 exactly, SHA-256
  e127deaa30be03e0036265de63b559365b0f22881bd759eae5418421a3584ac3.
- Both archive files equal their original HEAD lane files exactly.
- Every SQL migration and lane file on main bf1052a0 remains byte-identical.
  There are no branch duplicate migrations already on main; only 0330 and 0331
  are new. Shared expectations retain main's rows plus CH-6 additions.

Local checks actually executed, installed dependencies only:
- Node --test --test-concurrency=1 tools/commercial-integrity-boundary.test.mjs
  tools/commercial-integrity-current-source-guard.test.mjs: PASS, 253/253.
  Log: /tmp/ch6-j-20261029T003142Z-boundary.log.
- DB Vitest --maxWorkers=1 test/commercial-integrity-v3-input.test.ts
  test/lp-0-catalog.test.ts: PASS, 2 files / 32 tests. This executes the renamed
  SQL-file assertion through the actual repository runner.
- DB TypeScript --noEmit: PASS. Shared catalogue TypeScript: PASS.
- Expanded test-only TypeScript --noEmit with catalogue, upgrade, query-isolation
  and input suites: PASS, using /tmp/ch6-j-20261029T003142Z-types.json.
- Final working-tree payload checked with the existing loadLanePolicy,
  selectLane and lanePathAllowed exports against origin/main: PASS. Existing
  migrationOrderViolations on actual main migration paths and the final on-disk
  new migrations: PASS. Exact lane payload equality also checked.
  This is explicitly the final filesystem projection, not the full Git CLI
  result: the read-only index still records the old parents/conflicts until the
  router stages the resolved merge. No policy/checker workaround was installed.
- git diff --check and tracked working-file conflict-marker scan: PASS.

PostgreSQL, fresh/upgrade migrations and browser suites remain CI-only under
this sandbox brief. No DB execution, Git write, download, live provider/customer
activity or release occurred. The prior RED-pass status came from the router;
these deterministic checks are not an independent review. Router owns staging,
commit/push, required CI and work-list updates.

Ready message: /tmp/ch6-j-20261029T003142Z-commit-msg.txt.

## PR #392 catch-up to main f7aa65c8 — 29 October 2026, 01:12 run

RED, catch-up only. Resolved the two merge conflicts on disk: AppModule now
retains CommercialIntegrityV3Controller alongside main's BusinessValueController,
ValueV3Controller and reader factory; the LP-0 inventory retains main's exact
billing group (including migration 0322) and CH-6's separate authority group.
No new behaviour or SQL changes. Updated this receipt and the existing ch6-j
lane note; its allow list exactly matches all 54 branch payload paths relative
to MERGE_HEAD, excluding the implicitly allowed lane file itself.

Verification actually run with installed dependencies:
- API Vitest, maxWorkers=2: commercial-integrity-v3.boundary,
  commercial-integrity-v3.application and value/value-composition: 25/25 PASS.
  Initial composition run failed because installed DB dist lacked main's new
  ValueV3Reader export; rebuilt core and DB via their existing tsc build commands,
  then reran the same three files successfully. No source workaround added.
- DB Vitest, maxWorkers=1: commercial-integrity-v3-input and lp-0-catalog:
  32/32 PASS. These are local unit/catalogue checks, not PostgreSQL execution.
- Node --test --test-concurrency=1 tools/commercial-integrity-boundary.test.mjs
  tools/commercial-integrity-current-source-guard.test.mjs: 253/253 PASS;
  /tmp/ch6-j-20261029T011209Z-boundary.log.
- Installed tsc: API --noEmit PASS; core and DB builds PASS.
- OpenAPI check PASS via `node --import tsx src/generate-openapi.ts --check`
  in apps/api. The tsx CLI first hit its sandbox-blocked IPC socket; direct
  Node import runs the same checker without that CLI socket.
- Every main inventory array entry remains present exactly. Existing lane
  loader/selector/path checker: exact payload equality PASS; existing migration
  ordering checker PASS; tracked working-file conflict-marker scan PASS.
- All 273 SQL migration and lane files from MERGE_HEAD remain byte-identical.
- 0330 SHA-256 bb05d312c73a68488b395a9b659f6f712f8147212492df40f314ff68ddf20605;
  0331 SHA-256 e127deaa30be03e0036265de63b559365b0f22881bd759eae5418421a3584ac3.
  Both match RED-reviewed head 18db2a9f byte-for-byte.

The read-only Git index still lists conflicts until the router stages these
resolved files. No Git write was attempted. PostgreSQL, migrations and browser
execution remain for GitHub CI. The supplied RED pass at 18db2a9f is historical;
this catch-up's deterministic checks are not an independent review of a new head.
Router owns staging, commit, push, current-head CI and status updates.
Ready message: /tmp/ch6-j-20261029T011209Z-commit-msg.txt.

## PR #392 CI-fix try 1 — 29 October 2026, 01:31 run

RED. Read all supplied CI failure traces in ch6-j-ci-traces-0131.txt. The
worktree had no outstanding conflicts. Fixed each root cause without skipping
or weakening tests and without changing exceptions:

- Both browser projects: CH-6 saved-v1/fresh-v3 and M1-16-S draft/activated
  journeys could not display their recorded checks because the web transport
  found no commercialIntegrityV3 in createWorkspaceApplication. Compose the
  existing application there, forwarding only the request's session to family,
  view and review. Added a regression through the real workspace factory for
  all three delegates and the absent-session case; no alternative authority.
- CI-P03: 0331's text-array concatenation interpreted a reason as an array
  literal (22P02). Use array_append on all five single-reason branches. This
  is a SQL bug, so 0331 necessarily changes; no grants, table definitions or
  sources change. Its pending/failed CASE is parenthesized. 0330 is unchanged.
- Five published financial tests: reconciliation deliberately does not publish
  an invoice-authorizing certificate. The fixture now explicitly inserts the
  completion for its exact verified run and lock through the existing shadow
  worker's normal completion trigger before the production invoice command.
  It preserves all certificate checks, triggers, FK and invoice assertions.
- Lifecycle source replay test: PostgreSQL inferred parameter $4 as both integer
  sequence and text concatenation. Derive the interval from $4::integer instead.
- SERIOUS-B5 upgrade: pg_policies.roles is name[] and pg returns its raw text.
  Reuse the suite's established name[]::text[] conversion, retaining the exact
  expected migration-only policy role.

Local checks actually executed with installed tools, at most two Vitest workers:
- API Vitest: commercial-integrity-v3.boundary, commercial-integrity-v3.application
  and value/value-composition: 3 files, 26/26 PASS.
- Web Vitest: family route, v3 route and commercial-integrity-v3 UI: 3 files,
  67/67 PASS. These are unit/transport checks, not browser execution.
- DB Vitest: commercial-integrity-v3-input and lp-0-catalog: 2 files, 32/32 PASS.
- Node boundary and current-source-guard: 253/253 PASS, log
  /tmp/ch6-j-20261029T013134Z-boundary.log.
- API tsc --noEmit and API tsc build PASS; focused integration-fixture TypeScript
  PASS with /tmp/ch6-j-20261029T013134Z-types.json.
- OpenAPI check PASS via node --import tsx in apps/api. An initial invocation
  from the repository root could not resolve that package-local loader; reran
  from its proper package directory without changing source or dependencies.
- Existing lane loader/selector/path checks: exact 55 branch payload paths,
  no missing/extra permissions; existing migration order checker PASS;
  tracked-file conflict-marker scan and git diff --check PASS.

0330 remains byte-identical to HEAD. Corrected 0331 SHA-256:
312ac5de619bdc47263ec098c86f5b00a26348e4f6bac3b49f8da7cc91870993.
No PostgreSQL/browser suite could execute in this sandbox; CI must exercise the
reported DB and end-to-end failures. No Git writes, exceptions, downloads,
customer data or live actions. The router owns commit/push, CI and RED review
binding for the repaired head. Ready message:
/tmp/ch6-j-20261029T013134Z-commit-msg.txt.

## PR #392 CI-fix try 2 — 29 October 2026, 02:11 run

RED. Read the supplied ch6-j-ci-traces-0211.txt. No merge conflicts were present.
Three remaining root causes repaired, with all existing assertions retained:

- CH-6 saved-v1/fresh-v3 and M1-16-S draft/activated browser failures (both
  desktop and mobile): downloaded the existing CI artifact
  playwright-evidence-3-1 (12866772246, run 40801349894) through the GitHub
  connector. The error contexts show the panel's unavailable state, and the
  CH-6 network traces contain no integrity request at all. IntegrityJourney
  stored native fetch as a method and invoked it with a class-instance receiver,
  which browser Web IDL rejects before sending a request. The default transport
  now forwards through an arrow function. A regression models the native receiver
  check using the default transport: FAIL before the fix (error instead of v1),
  PASS after. Injected transport and all validation/failure paths remain intact.
- Five published financial regressions: the shadow worker has no SELECT grant
  on final_account_lock. Following the existing fixture boundary, the admin
  reads the immutable ID/cutoff, then the shadow worker supplies them as VALUES
  to the existing completion trigger. The trigger still verifies the exact
  run/lock/cutoff. No grants, replication override or guard bypass added.
- Lifecycle replay regression: sequence is bigint; the previous explicit integer
  interval operand still conflicted with its inferred parameter type. Cast both
  occurrences of parameter $4 as bigint, matching the actual column.

Local validation actually executed:
- Web Vitest, maxWorkers=2: commercial-integrity-v3 UI, family route and v3 route:
  3 files, 68/68 PASS. The new default-fetch regression first reproduced failure
  in a single-file maxWorkers=1 run (48 existing passes, one expected debugging
  failure), before the implementation fix.
- Web tsc --noEmit PASS.
- Focused integration-fixture tsc --noEmit PASS using the existing
  /tmp/ch6-j-20261029T013134Z-types.json (published, sources, upgrade suites).
- Node boundary/current-source-guard tests: 253/253 PASS,
  /tmp/ch6-j-20261029T021132Z-boundary.log.
- Existing lane loader/selector/path checks: exact 55 branch payload paths,
  no missing/extra permissions. Existing migration ordering check PASS.
- Tracked-file conflict-marker scan and git diff --check PASS.
- Migrations 0330 and 0331 are byte-identical to this run's HEAD. SHA-256:
  0330 bb05d312c73a68488b395a9b659f6f712f8147212492df40f314ff68ddf20605;
  0331 312ac5de619bdc47263ec098c86f5b00a26348e4f6bac3b49f8da7cc91870993.

No tests skipped/weakened, exceptions changed, SQL edited, privileges widened,
Git writes, packages installed, real customer data or live actions. PostgreSQL
and browser reruns remain for GitHub CI. Local scripted/unit evidence is not
independent RED review or proof that those CI suites pass. Router owns commit,
push, current-head CI, RED review binding and status updates.
Ready message: /tmp/ch6-j-20261029T021132Z-commit-msg.txt.

## PR #392 CI-fix try 3 (last) — 29 October 2026, 02:31 run

RED. Read all supplied ch6-j-ci-traces-0231.txt. No outstanding merge conflicts.
The five failures reduce to two actual bugs in migration 0331:

- Whole-invoice credit and receipt-overage tests failed strict decoding with
  INTEGRITY_SOURCE_UNAVAILABLE. Ordinary payment activity and published receipts
  used the same tenant/job/scope/sourceType/sourceId despite different fact
  envelopes (and different reversal-sensitive content). Keep ordinary activity
  as customer_payment; use published_customer_payment for the published receipt
  projection. The source schema, conflicting-identity rejection, exact values,
  reversal handling, review re-resolution and money controls are unchanged.
- Both writeoff tests failed because SQL alias `old` collided with PL/pgSQL OLD
  in the trigger's duplicate lookup. This also caused both competing credit
  mappings to reject, failing the race's one-success assertion. Rename only the
  lookup alias to prior_source. Duplicate refusal, job-row serialization,
  line/credit conservation and evidence checks remain unchanged.

Added a decoder regression using the namespace actually emitted by installed
SQL: ordinary and published facts with the same payment ID decode only with
separate projection identities, while conflicting same-identity facts still
refuse. Restoring the original SQL namespace temporarily reproduced the exact
INTEGRITY_SOURCE_UNAVAILABLE failure; fixed SQL was restored in a finally block.
Log: /tmp/ch6-j-20261029T023130Z-regression-before.log. Added real SQL projection
assertions to the existing receipt integration test; all prior assertions remain.

Checks actually executed (installed tools, at most two Vitest workers):
- DB Vitest, maxWorkers=1, commercial-integrity-v3-input and lp-0-catalog:
  33/33 PASS, including the new decoder/projection regression.
- Core Vitest, maxWorkers=2, commercial-integrity-v3 and its boundaries:
  22/22 PASS, preserving duplicate/reversal, attribution and snapshot controls.
- Boundary/current-source-guard Node tests: 253/253 PASS,
  /tmp/ch6-j-20261029T023130Z-boundary.log.
- Focused integration and input-fixture TypeScript --noEmit PASS via
  /tmp/ch6-j-20261029T023130Z-types.json.
- Existing lane loader/selector/path checks: exact 55 branch payload paths,
  no missing/extra permissions. Existing migration order checker PASS.
- Tracked-file conflict-marker scan and git diff --check PASS.
- 0330 byte-identical to HEAD. Corrected 0331 SHA-256:
  817800313a1473335de06e0884e9796c9cceefadb3b2aad9490b19cd8e584077.

0331 changes because both bugs are in SQL; no other migration changes. No tests
weakened/skipped, exceptions changed, grants widened, customer data, live actions
or Git writes. PostgreSQL execution is unavailable here: CI still must prove
all five reported failures and existing race/replay limits on the repaired head.
This is the last authorized CI repair try; any remaining CI failure goes to the
router's one Ben card under SIMPLE_LOOP, not another automatic repair round.
Router owns commit/push, current-head CI, independent RED review binding and
work-list updates. Ready message:
/tmp/ch6-j-20261029T023130Z-commit-msg.txt.
