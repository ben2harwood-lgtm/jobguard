# AUDIT-FIX-API-FILE-RECOVERY-ALLOCATION builder receipt

Issued 13 October 2026 by dispatcher 4; built 14 October 2026. RED (money/API response boundary). Branch `codex/sandbox/audit-fix-api-file-recovery-allocation`; starting HEAD and `origin/main` both `c08a53784c05b54b18f7bfff87f4c7597032ca7e`. Working-tree handoff only: no Git write command, commit, push, migration, grant, real data, provider call or spending. Dispatcher owns commit and push; independent exact-commit verdict and separate acceptance remain required. This receipt is builder evidence, not acceptance.

Read repository `AGENTS.md`, `BUILD_PLAN.md` §10.3.2 and §10.4 M4-8-S, `docs/contracts/recovery-allocation-v1.md`, and `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-file-recovery-allocation.md`.

## Blocking finding disposition

FIXED — valid customer credit disables allocation reads and reversal reviews. No dropped findings.

First added `apps/api/src/recovery-allocation.credit.test.ts`, before touching the response schema. This is the smallest runnable reproducer: repository and authentication doubles return the reported negative balance; the actual controller, application parser and HTTP error mapping execute. The real-PostgreSQL journey is additionally authored, collected but not executed here.

Pre-fix command (API working directory): `./node_modules/.bin/vitest run src/recovery-allocation.credit.test.ts` (exit 1; 3 failed, 14 passed). Initially stale database build output lacked the repository export; rebuilt `packages/db` using `./node_modules/.bin/tsc -p tsconfig.json`, then reran to establish the expected failures. Actual expected failure evidence:

```text
FAIL paid-invoice credit remains readable and reversible: get
FAIL paid-invoice credit remains readable and reversible: review_reverse
AssertionError: promise rejected HttpException instead of resolving
Serialized Error: response { version: 'recovery-allocation-error.v1',
  code: 'DATABASE_UNAVAILABLE' }, status: 503
FAIL accepts bounded signed invoice balance -1000000000000
ZodError: minimum 0, path ['invoiceBalancePence']
Test Files 1 failed; Tests 3 failed | 14 passed
```

Changed only `invoiceBalancePence` to signed safe integer pence within ±`MAX_MONEY_PENCE`. The repository's existing calculation remains invoice gross minus credits minus unreversed payments. Preserves the reported `2256000 - 38400 - 2256000 = -38400` rather than clamping it. Allocation/source/review money remains non-negative; strict structured responses still execute on reads and commands. Documented this existing persisted-state meaning in the v1 contract. No entitlement, authorization, tax, rounding, ledger or commercial policy change. Compatibility: response validation now permits a legitimate customer-credit state in the existing version.

After fix, API working-directory command `./node_modules/.bin/vitest run src/recovery-allocation.credit.test.ts src/recovery-allocation.application.test.ts src/recovery-allocation.controller.test.ts` passed: 3 files, 55 tests. New tests cover both controller paths, signed bounds, unsafe/fractional/non-numeric values and unchanged non-negative allocation/source/review constraints.

Added real-repository/issued-owner-session test `paid-invoice credit remains readable and reversible` to the existing PostgreSQL suite. It approves £384, pays the remaining £19,176 after the existing £384 and £3,000 receipts, issues a £384 credit, reads the credit reversal source, reviews/approves the exact reversal, verifies the retained original allocation and proves replay adds no persisted effect. `pnpm --filter @jobguard/db exec vitest list test/recovery-allocation.integration.test.ts` passed collection, including this test; collection is not PostgreSQL execution.

## Preservation and permitted setup/catalogue additions

No existing expected value, refusal, count, pinned name or fingerprint was edited. A read-only comparison removed the newly added test/import/session field from the working copy and confirmed the remaining integration file equals HEAD byte for byte. `apps/api/src/auth/context-boundary.test.ts` equals HEAD byte for byte; SHA-256 remains `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`. No pinned catalogue edit was needed; no STOP line arose.

Only existing fixture setup expansion in `packages/db/test/recovery-allocation.integration.test.ts`:

```text
before: return { jobId, digest, invoiceId: invoice.id, invoices, cases, packs, feed, feedView, scopeId, lineId, revisionId,
after:  return { session, jobId, digest, invoiceId: invoice.id, invoices, cases, packs, feed, feedView, scopeId, lineId, revisionId,
```

This exposes the token already issued by unchanged fixture setup solely to the new controller test. Existing fixture calls and assertions are unchanged. One controller import was added for that test. No new grant or standard-F exception.

Only catalogue addition: `config/agent-lane-assignments.json`, one compact new row `audit-fix-api-file-recovery-allocation` (before: absent; after: exact six paths: the registry, API contract, new API regression test, existing database integration test, allocation contract document and this receipt). Existing rows unchanged. The coordinator `lane-floor.py` regexes and external JobGuard lane map classify the six working-tree paths as four AMBER and two GREEN; this is raised to RED under the dispatch rule for money and indirect financial effects. The script's normal commit-range run is deferred until dispatcher commit (HEAD currently equals base). A read-only `selectLane`/`matches` check passed for every modified/untracked working-tree path; this is a limited allow-list check, not a claimed full lane-lint pass.

## Verification environment and outstanding gates

Dependencies supplied by dispatcher; no install performed. Node `v24.17.0` (repository pins `24.15.0`); cached pnpm `10.28.1` used via `/private/tmp/jg-allocation-pnpm-bin/pnpm` pointing to `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. The default pnpm launcher attempted version management and was interrupted; an installed v9 attempt refused the engine pin. All subsequent pnpm checks use cached 10.28.1 without downloading packages. Turbo reused some shared-worktree cache outputs; package lint was requested with `--force`.

`LANE_BASE_REF=origin/main pnpm lint` and `LANE_BASE_REF=origin/main pnpm lint:lanes`: both fail closed with `Missing branch or self-comparison range; refusing a misleading pass.` HEAD equals origin/main in this no-commit sandbox. No checking-system rule was changed. Dispatcher must rerun on the committed head.

`pnpm openapi:check`: blocked by sandbox `listen EPERM` for the tsx CLI IPC socket. Equivalent no-socket invocation `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` passed (exit 0). No OpenAPI artifact change required.

`node --test` over commercial-boundary, core-purity, decision-check-purity, decision-records, dependency-audit, policy-gate-sites and shared-money-origin test files: 19 passed. The two agent-lane tool suites were not run because their fixtures issue Git write commands, prohibited by dispatch.

Initial selected-package Turbo unit run failed: core 4879 passed / 11 failed; nine timeouts plus two compiled-dist tests attempting to read missing `.ts` siblings. Config fixtures passed (2); AI fixtures passed (80); storage's 4 tests were cache replay. API/web were not reached in that interrupted dependency run. No existing test edited to resolve this.

Database unit-only selection (no PostgreSQL): 168 passed / 1 failed; existing C-OPS-1 transitive-source scan exceeded its 5000ms timeout. No timeout or expectation edit.

Final checks so far:

- `pnpm typecheck`: passed, 7/7 package tasks (4 cached; changed API, database and consuming web actually executed).
- `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs`: passed. `pnpm turbo run lint --force`: passed, 7/7 package tasks, none cached. These supplement the refused root/lane-lint checks; they do not turn those refusals into passes.
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1`: 33 files / 784 tests passed.
- `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1`: 2440 passed / 5 failed, all existing 5000ms timeouts (three receipt-allocation stress cases, enterprise-domain source scan, extra-origin offset sweep). No timeouts, expectations or pinned names changed.
- `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1`: retry still 55 passed / 1 timed out in unchanged C-OPS-1 scanner. No test weakened.
- `pnpm build`: passed, 7/7 tasks (4 cached; database, API and production Next build actually executed). Existing CSS/autoprefixer, workspace-root and sandbox cache-I/O warnings were emitted.
- `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1`: 62 files passed / 10 failed; 1584 tests passed / 110 failed / 23 skipped; 108 listener errors. Failures include sandbox `listen EPERM` / Supertest null-port errors; two existing API database suites refused during free-port setup before starting PostgreSQL (`shadow-isolation.application.test.ts`, `final-account-lock.isolation.test.ts`); and four existing 5000ms timeouts (pinned context scan, Next quote delivery transport, two SSO action-path tests). No source fingerprint, refusal, expectation or timeout changed. Focused allocation regression results remain 55/55 passed.
- `git diff --check`: passed. Logs retained at `/private/tmp/jg-allocation-*.log` for local inspection; receipt contains results and dispatcher instructions independently of those temporary logs.

## Dispatcher checks on the Mac / GitHub CI

After committing, run `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `LANE_BASE_REF=origin/main pnpm lint:lanes`, `pnpm test`, `pnpm build`, and `pnpm openapi:check` under the pinned runtime/package manager. Root `pnpm test` was not run here because it includes PostgreSQL and the prohibited Git-write fixture suites.

Run the named regression first: `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-allocation.integration.test.ts -t "paid-invoice credit remains readable and reversible"`, then the full allocation integration file, `pnpm test:db`, `pnpm test:migrations`, and `pnpm test:e2e` (both existing mobile-360 and desktop projects). Sandbox cannot start PostgreSQL or a browser; none was started. Database guarantees and browser journeys are unverified here. Existing test timeouts and compiled-output discovery must be checked in CI without weakening expectations. No migration/rollback needed: rollback is reverting this response validator change. No new operational alert or external adapter.

Affected invariants: versioned strict response boundaries, exact bounded money, preservation of immutable credits/payments, exact reversal authorization and replay, synthetic-only operation, unchanged tenant/session ownership and audit. AI prompt/model/parser changes are absent; no live-model evaluation required for this money response fix. Independent RED verdict bound to dispatcher commit, separate acceptance, all mandatory CI checks and existing production/commercial gates remain outstanding.

## Audit later / advisory items (receipt only)

The report explicitly says 0 LATER. Its five weakest-test observations remain advisory/unmodified: real unissued versus foreign issued sessions (401/404); independent sessions and crossed jobs; malformed responses through both application methods; altered exact approval hash with no writes; actual Nest routing and persisted replay. Only the valid credit/reversal response state belonging to the blocking finding was covered here.
