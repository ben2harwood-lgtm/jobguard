# AUDIT-FIX-API-CAPTURE — builder receipt

Issued 13 October 2026 by dispatcher 4. Branch: `codex/sandbox/audit-fix-api-capture`. Starting/current HEAD and `origin/main`: `e4cb8437d044746300c377647f6061d06cd960cc`. Working-tree changes only; the dispatcher owns commit/push. Intended message: `/private/tmp/jg-msg-audit-fix-api-capture.txt`.

Read `AGENTS.md`, `BUILD_PLAN.md` §§2.4, 5.1–5.4 and the §7.2 M1-3 inventory, and `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-capture.md` (source inspection at `6659fb58791ec22588948f005b2bd4f6b299fa48`). No new product task or policy inferred from the audit.

**Check lane: RED.** These repairs affect immutable commercial money and scope identity. The path map defaults these source paths to AMBER and treats the additive registry as AMBER; the dispatcher's money rule raises this change to RED. Canonical `lane-floor.py` must be run after the dispatcher creates the commit; a base/head comparison now would cover no working-tree changes. No independent model verdict, technical acceptance or release approval has been recorded by this builder. Final acceptance remains HOLD pending dispatcher/CI checks and an independent verdict bound to the committed diff.

## Blocking findings and test-first evidence

Before editing product code, added `packages/db/test/audit-api-capture.test.ts` and ran:

```sh
packages/db/node_modules/.bin/vitest run --config packages/db/vitest.config.ts packages/db/test/audit-api-capture.test.ts
```

Exit **1**, **6 failed / 1 passed**. Original log: `/private/tmp/jg-audit-capture-before.log`. These tests invoke the real review repository, confirmation mutation and (for replay) CaptureApplication/UserCommandDispatcher with scripted SQL responses. This reproduces application defects; it is **not PostgreSQL assurance**.

| Finding | Expected failure observed before fix | Repair |
| --- | --- | --- |
| 1 — wrong immutable total | `3 × 2500`: received 2500, expected 7500; `2.5 × 101`: received 101, expected 252. | `calculateNetLine(parseQuantity(...), money(...))` uses existing checked bigint/rational half-even arithmetic. Unknown rate remains null. |
| 2 — captured identity disappears | Both omission and fresh-UUID substitution resolved successfully when rejection was expected. | Compare every proposal line's immutable `(id, scope_item_id)` pair to review rows, with unique scope identities and preserved proposal origin, at save and again inside confirmation before scope writes. |
| 3 — dismissed human addition | Null quantity/unit raised `REVIEW_INCOMPLETE`; the priced dismissed case created one forbidden scope revision instead of zero. | Only `disposition: accepted` enters readiness and persistence promotion. Dismissed human identities are still retired; no scope revision or progress is created. |

DROPPED — #4: the unchanged application/dispatcher replay test passed with the identical command after advancing Date.now by one second; no failing reproduction, no replay/dispatcher fix.

The initial regression assertions remain unchanged. Additional own tests cover rejection of already-stored incomplete reviews, origin relabeling, duplicate scope identities, split/merge parent retirement and child lineage, and unknown rates. Final targeted result: **14 passed**, exit **0** (`/private/tmp/jg-audit-capture-after.log`).

Added `packages/db/test/audit-api-capture.integration.test.ts`: real PostgreSQL 16 application save/confirm checks for exact totals, omissions/substitutions/relabeling, rollback of an incomplete draft's confirmation, dismissed human lines, and lost-response replay with exactly one receipt/authorization/audit event/scope revision. **NOT RUN** here: sandbox forbids PostgreSQL and local listeners. Both new test files passed a strict TypeScript check via `/private/tmp/jg-audit-capture-test-tsconfig.json`; that temporary config extends the existing API config and includes only these new test entrypoints.

## Changes and invariant preservation

Product changes: `packages/core/src/review.ts`, `packages/db/src/review-repository.ts`. Other changes are the two new test files, this receipt and exactly one compact additive registry line with exact file paths. No API route, UI, prompt, extraction parser, commercial policy or command hash change.

Affected invariants: AGENTS §§5.2, 5.4, 5.5, 5.9; plan C4/C5. Canonical scope now includes only accepted work and preserves the original captured identities. Save rejects incomplete identity sets before review writes; confirmation also rejects previously stored malformed drafts in its existing atomic command transaction. Accepted unpriced work keeps unknown price/total. Existing six-place quantity and money helpers govern priced line calculation; LATER boundary-schema work is not claimed complete.

**Zero migrations and zero production GRANTs. Standard F:** no direct application-login money/membership/authorization/receipt/audit privileges are added. The new disposable PostgreSQL test login uses only `GRANT jobguard_runtime TO audit_capture_login`, matching the existing harness; this is test-cluster setup, not a deployed grant. No schema, RLS, role, routine, owner, retention or residency change. No backfill, rollback migration or forward-fix migration required. Existing immutable historical rows are not rewritten. Rollback of the code change would restore the three defects; no new data shape is introduced.

No existing test, expected value, refusal, count, pinned name or fingerprint changed. `apps/api/src/auth/context-boundary.test.ts` and its lists are untouched. No existing catalogue row changed or added. Before/after setup exception: **none in an existing test**; the new integration file did not exist before, and now establishes a disposable synthetic tenant, owner, practice session and captured proposal before calling the unchanged CaptureApplication APIs. No real data, provider calls, spending, sends or new operational alerts.

Shared files: the lane registry is additive only and must serialize through the coordinator; the review repository is also a shared capture dependency. No parallel agent work was started. Deterministic registry comparison confirms every prior lane is unchanged; uncommitted path validation using the existing `selectLane`/`matches` helpers passes. This is not a substitute for standard lane lint or independent review.

## Commands actually run

Dependencies were supplied; no clean install was performed. Runtime observed: Node **24.17.0** (repo `.nvmrc` pins 24.15.0), installed pnpm **11.8.0** (repo pins 10.28.1), TypeScript 5.8.3, Vitest 4.1.11. Pins and lockfile are untouched.

Standard pnpm wrappers were attempted for `typecheck`, `lint`, `lint:lanes`, `build`, `openapi:check`, with `LANE_BASE_REF=origin/main`. They did **not** pass: the installed launcher tries automatic version switching and dependency verification/reinstallation, and then refuses the repository's pnpm engine mismatch. Stalled launcher attempts were interrupted (130); subsequent attempts exited 1 with `ERR_PNPM_UNSUPPORTED_ENGINE`. No package install completed. Local-only launcher flags `pnpm_config_pm_on_fail=ignore` and `pnpm_config_verify_deps_before_run=false` disable those implicit actions; they do not alter the repository. The pinned dispatcher/CI run is still required.

Underlying check results (commands use supplied local binaries, no downloads):

| Command | Result |
| --- | --- |
| `node_modules/.bin/tsc -p packages/{core,config,ai,storage,db}/tsconfig.json --noEmit` (each separately), and equivalent API/web configs | Each exit 0; all seven workspaces typecheck. |
| `node_modules/.bin/tsc -p /private/tmp/jg-audit-capture-test-tsconfig.json` | Exit 0, both new test files. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | Exit 1: core purity passes, lane check refuses `HEAD == origin/main` before a dispatcher commit. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Exit 1: `Missing branch or self-comparison range; refusing a misleading pass.` |
| `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` | Each exit 0. |
| Deterministic working-tree lane/registry/protected-auth check using the existing helpers and read-only git | Exit 0; not standard lint. |
| `node --test` for commercial-boundary, core-purity, decision-check-purity, decision-records, dependency-audit, policy-gate-sites and shared-money-origin tool tests | Exit 0, 19 tests. Lane tool test fixtures are not run: they execute writing git commands. |
| Core `node_modules/.bin/vitest run src --maxWorkers=1` | Exit 0, 80 files / 2415 tests. |
| AI `node_modules/.bin/vitest run src --maxWorkers=1` | Exit 0, 5 files / 80 synthetic fixture tests; no live model call. |
| Config/storage `node_modules/.bin/vitest run src --maxWorkers=1` | Exit 0, 1 and 2 tests respectively. |
| `node_modules/.bin/tsc -p packages/{config,storage,ai,core,db}/tsconfig.json` (each separately) | Each exit 0; dependency builds refreshed the supplied stale dist outputs. |
| API `node_modules/.bin/nest build` | Exit 0. |
| OpenAPI `node --import tsx src/generate-openapi.ts --check` in API | Exit 0 after dependency builds. Earlier tsx CLI failed with EPERM creating its IPC listener; earlier node-loader attempt found a missing stale dist export. |

Additional completed direct runs:

| Command | Result |
| --- | --- |
| API `vitest run src --maxWorkers=1 --exclude 'src/**/*.http.test.ts' --exclude 'src/health.test.ts' --exclude 'src/auth/sso/action-paths.test.ts' --exclude 'src/shadow-isolation.application.test.ts'` | Exit 1: 1541 passed / 1 failed / 1 skipped; 61 passed files, 2 failed files. `src/practice-transports.test.ts:121` exceeded its unchanged 5000 ms timeout. `src/final-account-lock.isolation.test.ts:37` unexpectedly invokes a real-DB fixture under a non-integration filename and failed the sandbox port check (`no free port in 58400..58650`); no PostgreSQL server started. The database isolation suite remains a dispatcher check; the transport file passed its isolated unchanged retry (71 tests, exit 0). |
| DB `vitest run --maxWorkers=1 --exclude 'test/**/*.integration.test.ts' --exclude 'test/free-port.test.ts' --exclude 'dist/**'` | Exit 1: 166 passed / 1 failed. `src/audit-checkpoint-handoff.test.ts:279` source reachability scan exceeded its unchanged 5000 ms timeout. Isolated unchanged-file retry also exit 1 (55 passed / 1 failed), same timeout. No expected value or timeout changed; dispatcher must rerun this test. |
| Web `vitest run --maxWorkers=1` after fresh dependency/API builds | Exit 0, 33 files / 784 tests. |
| Web `node_modules/.bin/next build` after fresh dependency/API builds | Exit 0; production compile, type validation, 31 static pages and trace collection completed. Earlier stale-output build attempt was interrupted (130). Existing workspace-root/CSS warnings were not changed. |
| API additional direct `tsc -p apps/api/tsconfig.json` build | Exit 0. |
| API `vitest run src/practice-transports.test.ts --maxWorkers=1` isolated retry | Exit 0, 71 tests; original timeout remains unchanged. |

 Initial broad tests exposed stale dist exports, duplicate compiled tests and resource-contention timeouts; no assertion or timeout was edited. Compiled duplicates are excluded from the direct source-suite runs. The full root `pnpm test` is not run because it starts forbidden database suites and git-writing tool fixtures.

## LATER findings — receipt only, no fixes

- #5: complete Nest proposal/read-review/save-confirm routes and generated schemas are missing.
- #6: review input schemas lack the established money magnitude/safe-integer and six-place quantity limits.
- #7: capture replay does not bind source kind/acquisition metadata.
- #8: the existing stale-save assertion rejects inconsistent client/expected revisions before reaching persisted-revision concurrency protection.

The five weakest-test recommendations are left unchanged: stale-save setup; capture span fixture premise; invalid provider-output transport interception; browser persisted lineage checks; precise invalid stored lifecycle failure.

## Dispatcher / Mac / CI handoff

Using the pinned install, after committing this tree:

```sh
LANE_BASE_REF=origin/main pnpm typecheck
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm test
pnpm build
pnpm openapi:check
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-api-capture.integration.test.ts test/review.integration.test.ts test/commands.integration.test.ts test/command-replay-contract.integration.test.ts
pnpm test:db
pnpm test:migrations
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop capture.spec.ts review-confirm.spec.ts
```

PostgreSQL, migrations, MinIO/browser journeys and listener-dependent HTTP/identity/shadow tests must run on the Mac outside this sandbox or GitHub CI. Run canonical `lane-floor.py jobguard <repo> e4cb8437d044746300c377647f6061d06cd960cc <new-commit>`; preserve RED for money. Obtain the independent recorded RED verdict on that exact commit and separate technical acceptance. No founder merge/push/release or commercial/security approval is inferred from this receipt.
