# MON-3-P-A builder receipt

18 October 2026. Builder: Codex. Check lane RED. This is a builder run receipt, **not an independent verdict or technical acceptance**. No commit or push performed; dispatcher must bind subsequent RED review to the exact committed diff and obtain separate acceptance. MON-3 remains OPEN.

## Delivered scope

All-key checking in the existing pure preview, retaining stable v1 tuples and the deprecated single-key compatibility helper. Private migration 0192 adds immutable tenant/job/activation-bound fictional verification snapshots and globally unique individual claims. Snapshot insertion derives/claims every key in canonical order in the inserting transaction; collisions roll back the whole statement. Exact internal replay adds nothing. No caller-selected key list, non-owner grants, runtime endpoints, trial admissions, deadlines, billing or provider actions.

Tests cover core bypasses, storage/completeness, actual catalogs and access, immutable claims, cross-tenant races and rollback, and populated own-migration upgrades. Database test activation parents are explicitly isolated FK scaffolding using replication mode only for legacy parent insertion; new storage tests use ordinary enforcement. These are not command-authority, successful-trial-activation or Final Check integration evidence.

Affected invariants: AGENTS §§5.1 (qualified relationships/RLS), 5.2 (immutable history), 5.3–5.4 (no runtime authority; atomic private storage), 5.10 (no charging), 5.13 (independent verdict remains required). No business network calls, feature-pool owner credential, new access exception, prompt/model or browser change. The only shared-file change is four additive inventory lines in tenancy tests; serialize that edit with MON-2A-P. No shared barrels, schema, runner, legacy register or prior migrations changed.

## Environment and reproducibility

Base/HEAD at start: `b881f90be0a6d368838ca4392338147ef819bd3a`; branch `codex/sandbox/mon-3-p-a`. Dispatcher allocated 0192; renumber at merge. Working tree started clean.

Installed dependencies reused as instructed; no dependency installation or fresh install. The initial global `pnpm --version` attempted automatic version/signature verification and failed to fetch; subsequent commands use the already-cached pin without that path. Actual Node `v24.17.0`; repository `.nvmrc` is `24.15.0`. Commands use cached pinned pnpm `10.28.1` through `/private/tmp/mon3pa-bin/pnpm` (a shim to `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`); default global pnpm was not the pin. Turbo output includes cache hits, explicitly not new execution of those checks. PostgreSQL **NOT RUN**; actual server version unknown. Manifest pin `embedded-postgres 16.10.0-beta.15` is not measured server evidence.

## Run evidence

Logs are under `/private/tmp/mon3pa-*.log` for dispatcher inspection. Command results below refer to child-command exit status, not the enclosing log-printing shell.

- Failing first: `packages/core/node_modules/.bin/vitest run --root packages/core src/free-first-job-keys.test.ts` — exit 1, five failures because plural helper did not exist. An earlier root `.bin/vitest` attempt could not find the binary and is not the failing-first evidence.
- Targeted final: same executable/root with `src/free-first-job-keys.test.ts src/free-first-job.test.ts` — exit 0, 2 files / 16 tests pass.
- `node --test tools/*.test.mjs` — exit 0, 100 tests pass.
- `LANE_BASE_REF=origin/main pnpm lint` — exit 1 at lane check: HEAD equals origin/main, so the checker refuses self-comparison. Core-purity subcheck passed.
- `LANE_BASE_REF=origin/main pnpm lint:lanes` — exit 1 for the same reason. No fabricated base/commit or checker weakening. A separate deterministic working-tree path check using exported `loadLanePolicy`/`lanePathAllowed` found zero violations; this is not official range-lint evidence.
- Money-arithmetic and commercial-boundary checks were invoked separately because root lint stopped at lane validation; both passed (exit 0).
- `pnpm exec turbo run test --filter='!@jobguard/db'` — exit 1: 2,799 core tests passed, seven existing assertions timed out at unchanged 5-second limits across five files; subsequent packages did not all execute. No test or timeout was weakened. Retry results recorded below.
- `pnpm openapi:check` — exit 1: tsx CLI IPC socket `listen EPERM`. First `node --import tsx src/generate-openapi.ts --check` fallback also exited 1 because core dist was not yet built. Final post-build direct-loader result recorded below.
- Database test-file TypeScript check via temporary `/private/tmp/mon3pa-test-tsconfig.json`, extending repository strict settings and including all five new DB test/helper files — exit 0 before final test additions; final rerun recorded below. This compiles tests without starting PostgreSQL.

Additional check results:

- `pnpm typecheck` — exit 0; all seven tasks successful (two cache hits).
- `pnpm exec turbo run lint` — exit 0; all seven package tasks successful (two cache hits). Root lane lint remains held as above.
- Direct-loader OpenAPI retry from `apps/api`: `node --import tsx src/generate-openapi.ts --check` — exit 0 after dependencies built; no OpenAPI diff.
- Final strict test-file compiler check — exit 0. The handoff rerun caught a fixture UUID parameter type mismatch (exit 2); it was corrected to reuse the existing fixture parameter type, then the strict compiler passed (exit 0).
- Unqualified single-worker core retry included generated `dist` copies with source-relative assertions; interrupted with exit 130. No claim of passing this invalid retry.
- Source-only core run from repository root (`vitest run --root packages/core src --maxWorkers=1`) — exit 1: 2,801 pass, four existing five-second timeouts plus one source-inspection failure caused by that test assuming the package working directory. Package-directory retry of the three affected files follows below; no test changes/timeouts.
- Initial recursive non-core exclusion selection could not find `vitest` (exit 254); retried with explicit package names rather than selecting the root package.

- Package-directory retry: `vitest run src/receipt-allocation.test.ts src/subscription-period.test.ts src/enterprise-domain/boundaries.test.ts --maxWorkers=1` — exit 1, 55 pass / 2 timeouts. Remaining failures are the unchanged receipt allocator tests at lines 125 (2,000-line case) and 212 (working-size limit). This is a regression hold, not a pass.
- Explicit non-core package selection passed AI recorded-fixture tests (113), storage (2), config (1), then was interrupted (exit 130) upon finding that the API selection includes `shadow-isolation.application.test.ts`, whose hooks build artifacts and start PostgreSQL/HTTP servers. No PostgreSQL result is claimed. It was replaced by an API source run explicitly excluding that integration file and the separate web unit suite; these exclusions are sandbox-only and do not change CI requirements.
- Initial `pnpm build` — exit 1: six tasks successful, Next compiled and generated pages but failed while collecting build traces with missing `.next/static/mPwF_kt_xKrBpfohxQGa1/_ssgManifest.js`. The API integration test's build hooks may have overlapped this build; cause is unproved. A fresh isolated root build retry follows below.

- Isolated `pnpm build` retry — exit 0; all seven tasks successful (two cache hits). Initial failure remains recorded above; no Next configuration or application code was changed to obtain this result.
- Web unit suite, `vitest run --maxWorkers=1` from `apps/web` with its existing e2e-excluding configuration — exit 0, 40 files / 867 tests pass. No browser launched.
- API source suite excluding the known PostgreSQL/HTTP integration file — interrupted with exit 130 after repeated existing HTTP-test failures; incomplete, not a pass. Small targeted API/diagnostic result follows below.
- Final delivery strict TypeScript check of all new DB tests/helpers — exit 0, including the same-tenant/foreign-tenant FK/RLS assertions.
- Final `git diff --check` — exit 0. Final working-tree-only lane path check: 15 files, zero violations. Official post-commit lane/range validation remains required.

Targeted API result: `vitest run src/free-first-job.application.test.ts src/free-first-job-card.adapter.test.ts src/auth/sso/action-paths.test.ts --maxWorkers=1` from `apps/api` — exit 1 overall, 27 pass / 2 fail. Both trial files pass (11 tests). The two SSO HTTP diagnostic cases fail with `listen EPERM` on `0.0.0.0`, also reported as two unhandled errors. No PostgreSQL or browser is involved in this targeted run. This demonstrates the socket restriction, not a passing API regression suite.

## Explicit NOT RUN and holds

`pnpm test` aggregate, `pnpm test:db`, `pnpm test:migrations` and the named four PostgreSQL suites: **NOT RUN**, per dispatcher sandbox restriction. No database failing-first execution is claimed. The accidentally broad API selection was interrupted as documented above; no completed database run or version is reported. All new DB suites were authored before the migration. PostgreSQL version, actual fresh/upgrade catalog behavior, race outcomes and mandatory DB regression remain CI obligations. Browser/Playwright/e2e never run, as explicitly instructed. No native/AI change; live-model eval inapplicable.

Migration recovery: transaction rollback on installation failure; once installed preserve claims and fix forward. No backfill, key deletion/reset or retention promise. No runtime compatibility break; old helper preserved and preview now rejects either consumed key. No new operational alerts.

STOPs are scoped in `docs/ledger/MON-3-P-A.md` with file:line and before/after: no runtime admission/composition without B/C interfaces; no persisted elapsed-day/DST/conversion decision; no identity replacement/merge authority when no retained verified key connects records. Independent A work continues and is delivered. All D01/D02/D03/D08/D09/D16 release gates remain closed. No approval is inferred from any green test.

B/C still own verified identity/card facts, new-live eligibility, first/second admission, old-facade/direct-SQL protection, exact authorization/current membership replay, command/receipt/audit atomicity, authoritative ends, London clock and MON-2A-P correction/conversion interfaces, actual Final Check/illustration parity. A does not close their aggregate acceptance.
