# AUDIT-FIX-DBSRC-05 builder receipt

Issued 13 October 2026; built 14 October 2026 in `codex/sandbox/audit-fix-dbsrc-05`, starting HEAD and origin/main `bd959b01e857de0ba7cbd3588bab84add7d0f493`. Audit source: `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-05.md`. Rules read: repository AGENTS.md, BUILD_PLAN.md §§2.4 and 5.6, and the M0-11/M1-10 evidence lineage. This is builder evidence, not independent verification or acceptance. No git write command, commit, push, release, real data or spending.

## Disposition

- BLOCKING 1 — DROPPED: no failing PostgreSQL reproduction executed in this sandbox.
- BLOCKING 2 — DROPPED: no failing PostgreSQL reproduction executed in this sandbox.
- BLOCKING 3 — reproduced, fixed, unit regression green; PostgreSQL acceptance pending dispatcher execution.
- LATER 4 — pack generation/approval do not check recovery-owned shared command IDs; listed only, unchanged.
- LATER 5 — historical fee-illustration creation cannot replay its first persisted result; listed only, unchanged.

## Red before fix, green after fix

First added `packages/db/test/audit-dbsrc-05.test.ts`, before changing evidence.ts. Ran `packages/db/node_modules/.bin/vitest run test/audit-dbsrc-05.test.ts` from packages/db: exit 1; 2 failed / 3 passed. Both exact reported byte strings failed the new refusal assertion: `AssertionError: expected true to be false`, expected false, received true. JPEG, WebP and PNG valid controls passed. Log: `/private/tmp/jg-dbsrc-05-red.log`.

Then replaced only JPEG/WebP signature acceptance with format-checked, full pixel decoding using Sharp 0.35.5 (already installed and already pinned transitively). Finalisation awaits validation before registering authoritative evidence. Decode warnings/errors return false and use the existing `OBJECT_INVALID` / `corrupt_image` rejection path. A 40,000,000-pixel input limit bounds decoded work independently of the existing upload byte limit. Original bytes, hash/version binding and the PNG validation path are preserved. No race-state or cleanup code changed.

Final targeted run: `packages/db/node_modules/.bin/vitest run --root packages/db test/audit-dbsrc-05.test.ts`, exit 0, **8/8 passed**. Covers both reported malformed files, valid JPEG/WebP/PNG controls, MIME mismatch, and encoded-image truncation. Log: `/private/tmp/jg-dbsrc-05-targeted-final.log`.

Added a separate real-PostgreSQL integration suite, `packages/db/test/audit-dbsrc-05.integration.test.ts`, using the existing embedded PostgreSQL 16 and non-owner runtime-role harness. Four cases drive begin/finalise and check malformed-image refusal, rejected upload state, zero evidence objects and refused proof links, plus valid JPEG/WebP controls retaining exact bytes/hash/version and permitting proof linking. **Not executed here.** No database mock substitutes for that suite.

## Scope, lanes, invariants and grants

Exact seven-file lane entry added as one compact line. Working-tree path classification used the actual `lane-floor.py` rx function and coordinator-owned jobguard lane map: **RED**, because packages/db/package.json and pnpm-lock.yaml are red paths. The committed base/head classifier must run after the dispatcher commits; HEAD still equals the base. The lane registry is shared and must serialize with other task entries.

No existing expected value, refusal, count, pinned name, fingerprint or test file changed. `apps/api/src/auth/context-boundary.test.ts` is byte-identical to HEAD; SHA-256 before=after `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`. Manual path/immutability check passed for all seven files; this is a deterministic working-tree inspection, not a replacement for lane lint or independent review.

Additive setup/catalogue record: before, the lane registry had no `audit-fix-dbsrc-05`; after, it has the exact seven-path entry. Before, packages/db had no direct Sharp dependency/importer; after, it declares existing pinned `sharp: 0.35.5` and lock importer `0.35.5(@types/node@24.0.3)`. No existing package version or lock resolution changed. The existing installed Sharp package was linked into packages/db/node_modules locally; nothing was downloaded. No existing test call received extra setup or changed expectations.

**Migrations, backfills, new production grants and operational alerts: none. Standard F: no new application-login INSERT/UPDATE/DELETE privileges on money, membership, authorization, receipt or audit tables.** One test-cluster-only role membership statement in the new harness: `GRANT jobguard_runtime TO audit_dbsrc_05_login`, giving the disposable non-superuser/non-BYPASSRLS login the existing migrated runtime privileges, with no production grant. No RLS, table, schema, routine, role-policy, provider route or commercial-policy change. Affected invariants: AGENTS §5.8 and BUILD_PLAN §5.6 evidence verification; C4/C5/C6 tenant/proof/runtime boundaries remain mandatory. This patch is local server decoding, with no external processing or new provider/data flow. No UI or AI prompt/model changes.

Backwards compatibility: invalid JPEG/WebP inputs previously accepted now reject; hasCompleteImage returns Promise<boolean> and its sole production caller awaits it. Very large JPEG/WebP inputs over 40 million pixels reject. Native Sharp binaries must remain available on the deployment platform. Previously registered evidence is not rewritten or revalidated by this patch. Rollback is a code/dependency rollback and restores the acceptance defect; no data rollback or forward-fix migration is required.

## Checks

All validation pnpm commands used the already-cached pinned pnpm 10.28.1 via a temporary PATH shim; Node v24.17.0. Initial global pnpm version probes failed its automatic version switch/signature verification; the cached 10.28.1 executable was then used directly. No dependency install/download command was run. Full clean-install evidence is not claimed.

- `LANE_BASE_REF=origin/main pnpm typecheck` — exit 0, all 7 workspace tasks successful (4 cached); log `/private/tmp/jg-dbsrc-05-typecheck.log`.
- `LANE_BASE_REF=origin/main pnpm build` — exit 0, all 7 workspace tasks successful (4 cached); production bundle, Next type checks and 31 static pages completed. Existing CSS/root-inference/cache warnings remain. Log `/private/tmp/jg-dbsrc-05-build.log`.
- `LANE_BASE_REF=origin/main pnpm lint` — exit 1 at lane self-comparison refusal.
- `LANE_BASE_REF=origin/main pnpm lint:lanes` — exit 1: `Missing branch or self-comparison range; refusing a misleading pass.` Dispatcher must rerun after committing; no base substitution or weakened check.
- `node tools/core-purity-lint.mjs && node tools/money-arithmetic-lint.mjs && node tools/commercial-boundary-lint.mjs` — exit 0.
- `node --test tools/policy-gate-sites.test.mjs tools/dependency-audit.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/core-purity.test.mjs tools/shared-money-origin.test.mjs tools/commercial-boundary.test.mjs` — exit 0, 19/19 passed. Lane fixture tool tests were not run: they execute git writes, prohibited by the issued task.
- `pnpm openapi:check` — exit 1, tsx CLI IPC socket `listen EPERM`. Socket-free attempt `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` initially exited 1 because pre-existing built @jobguard/db artifacts lacked ContractorPracticeSessionRepository; retry after the DB build completed **passed, exit 0**, log `/private/tmp/jg-dbsrc-05-openapi-direct-final.log`. The standard script still needs a dispatcher rerun.
- `pnpm --filter @jobguard/db exec vitest run --exclude "**/*.integration.test.ts" --exclude "**/free-port.test.ts" --maxWorkers=1` — exit 1, 205 passed / 1 failed; the unchanged `src/audit-checkpoint-handoff.test.ts:279` graph scan timed out at its existing 5000ms limit. New validator regressions passed within this run. Log `/private/tmp/jg-dbsrc-05-db.log`.
- `pnpm turbo run test --filter=@jobguard/core --filter=@jobguard/config --filter=@jobguard/storage --filter=@jobguard/ai --filter=@jobguard/web` — exit 1 at core: 4878 passed / 12 failed. Failures: existing 5000ms timeouts in extra-origin, receipt-allocation and enterprise-boundary tests; emitted dist tests also try to open absent dist/recovery-allocation.ts and dist/site-extra-pricing.ts. Config 2/2 and AI 80/80 passed; other tasks were cached or cancelled. This is not a passing full unit run. Log `/private/tmp/jg-dbsrc-05-others.log`.
- `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext --esModuleInterop test/audit-dbsrc-05.test.ts test/audit-dbsrc-05.integration.test.ts` — exit 0; new unit and integration test sources typecheck. An earlier duplicate attempt was interrupted (130) to reduce parallel compiler load.
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` — exit 1: 11 files failed / 22 passed, 322 tests failed / 462 passed. Reported failure: `siteVisitHttpFailure is not a function` from unchanged contractor route adapters. No web/API expected values or product code changed by this task. Log `/private/tmp/jg-dbsrc-05-web-unit.log`.
- `pnpm --filter @jobguard/api exec vitest run src --exclude "**/shadow-isolation.application.test.ts" --maxWorkers=1` — exit 1: 31 files failed / 40 passed; 503 tests failed / 1178 passed / 1 skipped. Errors include unavailable repository constructors/functions in the loaded artifacts, local socket `listen EPERM`, real-database isolation fixture setup failing with `no free port in 58400..58650`, and unchanged 5000ms source-scan timeouts. Log `/private/tmp/jg-dbsrc-05-api.log`. Protected-test STOP record: `apps/api/src/auth/context-boundary.test.ts:1287` timed out; before = existing 5000ms test and pinned lists, after = byte-identical (no proposed change). No protected line, pin, fingerprint or timeout was changed to obtain a pass.
- `git diff --check` — exit 0.

Early broad unit attempts were interrupted (exit 130) to exclude the API shadow-isolation PostgreSQL/browser suite and DB free-port socket suite. No PostgreSQL server or browser started. The filtered API run also discovered `final-account-lock.isolation.test.ts`, whose real-database setup failed at free-port allocation before starting PostgreSQL; this is a failed fixture setup, not executed database evidence. Root pnpm test was not run because it includes forbidden git-writing fixture tests and database suites. No mandatory suite is being made optional; dispatcher/CI checks below remain release/acceptance holds.

## Dispatcher / CI holds

On the Mac or GitHub CI, after the dispatcher commits and pushes:

1. Run a clean pinned install, `LANE_BASE_REF=origin/main pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `LANE_BASE_REF=origin/main pnpm lint:lanes`, `pnpm test`, `pnpm build`, and `pnpm openapi:check`.
2. Run `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-dbsrc-05.integration.test.ts test/evidence.integration.test.ts`, `pnpm test:db` and `pnpm test:migrations`. The new PostgreSQL acceptance assertions are unexecuted here.
3. Run `pnpm test:e2e` in both existing mobile-360 and desktop projects, including the existing proof/evidence journey, and the API shadow-isolation suite. No browser was started in this sandbox.
4. Resolve outstanding unchanged-suite failures without altering protected expectations; record a different model's exact-commit RED verdict and separate actor acceptance. Builder has neither accepted nor independently reviewed this work. G0/G1 and other existing release gates remain unchanged.

Intended conventional commit subject/body: `/private/tmp/jg-msg-audit-fix-dbsrc-05.txt`. All changes remain uncommitted in the working tree for the dispatcher.
