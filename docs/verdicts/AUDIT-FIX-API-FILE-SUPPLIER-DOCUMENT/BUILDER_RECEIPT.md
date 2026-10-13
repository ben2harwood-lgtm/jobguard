# AUDIT-FIX-API-FILE-SUPPLIER-DOCUMENT — builder receipt

Issued 13 October 2026 by dispatcher 4. Branch `codex/sandbox/audit-fix-api-file-supplier-document`; starting HEAD and `origin/main` both `e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4`. Working-tree delivery only: the dispatcher owns commit/push. Intended conventional commit subject/body: `/private/tmp/jg-msg-audit-fix-api-file-supplier-document.txt`. No git-writing command was run.

**Review lane: RED, because the corrections affect money and supplier facts.** The mechanical working-tree path floor is AMBER (supplier paths default amber; own new registry entry is amber-first); the indirect money effect raises it to RED. The dispatcher must run `lane-floor.py` against the actual committed diff. The registry adds exactly one compact entry, `audit-fix-api-file-supplier-document`, with seven exact file paths. All existing entries remain unchanged. Shared registry edits serialize with other tasks.

Read: repository `AGENTS.md`; `BUILD_PLAN.md` §2/C1–C8, §7 existing synthetic supplier slices, CH-2 live-only command contract, and §11.3 M2-2/M2-3; audit report `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-file-supplier-document.md`. This is a correction to the existing synthetic supplier workflow; no new web route, screen, provider, commercial policy or production activation. C1 evidence is the existing workflow plus application regressions and dispatcher-only PostgreSQL tests; its browser regressions remain required.

## Blocking finding 1 — reproduced and fixed

Wrote `packages/db/test/audit-api-file-supplier-document.test.ts` before changing production code. Test `confirms decimal quantities using exact arithmetic` runs the real application, repository, tenant transaction wrapper, command identity/result path and audit append against scripted existing invoice/SQL responses. Only the authenticated practice-access lookup is replaced with a synthetic verified context. This is an executable application reproduction, **not** PostgreSQL/RLS proof.

Before fix, quantity `"1.1"`, unit price `100`, net `110`, revision `0` failed exactly as reported:

```text
FAIL ... confirms decimal quantities using exact arithmetic
AssertionError: promise rejected "Error: ARITHMETIC_MISMATCH" instead of resolving
Caused by: Error: ARITHMETIC_MISMATCH
  ... supplier-document-repository.ts:12
```

The repository now calls the existing exact bigint decimal helper used by supplier extraction, exported through the existing wildcard export. Whole-penny equality is preserved; mismatches and fractional pennies retain `ARITHMETIC_MISMATCH`. This does not introduce rounding of supplier facts or change extraction policy, parser version, citations, golden fixtures, money limits or pinned names. The new test checks revision `1`, exact quantity/price/net insert parameters, and single audit/result inserts. Additional cases cover six-place quantities, leading zeros, mismatched totals and fractional-penny refusal.

The new real-PostgreSQL test imports the invoice and delivery fixtures on a fresh synthetic live job using the established fixture helper and runtime login. It asserts the stored quantity is `1.100000`, net is `110`, revision is `1`, and exact replay does not change counts. **Authored/typechecked, not database-executed here.**

## Blocking finding 2 — reproduced and fixed

Before fix, the same new unit file's tests `rejects quantities beyond supported precision without writes` succeeded instead of rejecting: confirmation `"1.0000001" × 10000000p = 10000001p` returned `{revision:1,replayed:false}`; receipt accepted `"1.1234567"` returned `{revision:2}`. The rejected-quantity variant and direct repository callers also reproduced acceptance. These successes demonstrate the boundary defect; PostgreSQL's rounding itself was source-inspected, not simulated or claimed as database-executed.

```text
FAIL ... rejects quantities beyond supported precision without writes: confirmation
AssertionError: promise resolved "{ revision: 1, replayed: false }" instead of rejecting
FAIL ... rejects quantities beyond supported precision without writes: accepted receipt
AssertionError: promise resolved "{ revision: 2 }" instead of rejecting
```

Both established v1 schemas now allow at most six fractional places, matching `numeric(20,6)`. Confirmation and receipt repositories also validate before opening a transaction, protecting direct callers. Invalid quantities produce the existing typed `ZodError`; tests verify no fact/receipt/audit/command-identity/command-result insert and no database call for direct invalid inputs. The new PostgreSQL test checks rejection and unchanged stored fact, receipt, audit, identity and result counts for all three excessive-precision inputs. **Authored/typechecked, not database-executed here.**

Neither blocking finding was DROPPED: both reproduced with failing tests before fixes. The initial run showed **8 failed / 3 passed**; after fixes, **11 passed**. Existing test expectations were never edited.

## Scope and invariants

Affected invariants: AGENTS §§5.5 exact quantities/money and 5.9 human-confirmed supplier facts; BUILD_PLAN C4/C5/C6 boundary validation, atomic command effects and executable regressions. Existing live guard, verified tenant context, lock order, command request hashing, legacy replay, source-disposition refusals, audit payloads and transaction behavior are unchanged.

**No migration and no production GRANT. Standard F:** no new application-login INSERT/UPDATE/DELETE grant on money, membership, authorization, receipt or audit tables. The new disposable PostgreSQL test role uses only `GRANT jobguard_runtime TO audit_supplier_login`, matching the existing harness; it adds no deployed privilege or protected-table grant. No RLS, role, owner, SQL routine, table, backfill, production data or residency change. No new external action or operational alert. Code rollback would restore these defects; no data rollback is needed. Existing historical rows are not rewritten or repaired by this change. Compatibility: previously accepted quantities with more than six fractional places now fail validation; supported quantities retain existing command versions and replay contracts.

Catalogue additions: **none**. No merged test set-up was changed, so there is no before/after premise-establishing edit to list. The new tests contain their own synthetic invoice/delivery setup. The new exported helper is exposed by the unchanged existing supplier-facts wildcard; no package-index edit.

Preservation check: zero modified existing test files. `apps/api/src/auth/context-boundary.test.ts` is byte-identical to starting HEAD (SHA-256 `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`). No pinned expectation, refusal, count, name, fingerprint or list was edited. Protected-line STOP condition was not encountered; no before/after change is proposed for that file.

## Executed validation

Dependencies were already installed; no install/download was performed. Node `24.17.0` is provided by the environment (`.nvmrc` pins `24.15.0`; unchanged). Used cached **pnpm 10.28.1** via a task-local `/private/tmp/jg-supplier-pnpm-bin/pnpm` wrapper, placed first on PATH for commands below. Initial global pnpm version probes stalled on its version-switch path and were interrupted; the cached pinned executable resolved that without installing packages.

Before/after reproduction:

- `packages/db/node_modules/.bin/vitest run --root packages/db --maxWorkers=1 test/audit-api-file-supplier-document.test.ts`: before **8 failed / 3 passed**, expected failures above (`/private/tmp/jg-supplier-before.log`); after **11 passed** (`/private/tmp/jg-supplier-after.log`). Core TypeScript was rebuilt between runs so runtime imports used the fixed schema/helper.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-api-file-supplier-document.test.ts`: **11 passed** (`/private/tmp/jg-supplier-focused-db.log`).
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src/supplier-facts.test.ts src/supplier-documents.test.ts src/quantity.test.ts`: **8 passed** (`/private/tmp/jg-supplier-focused-core.log`).
- `pnpm build`: **PASS**, 7 packages (`/private/tmp/jg-supplier-build.log`); existing CSS autoprefixer/lockfile-root warnings and sandbox Turbo cache warnings were emitted.
- `pnpm typecheck`: **PASS**, 7 packages (`/private/tmp/jg-supplier-typecheck.log`).
- `packages/db/node_modules/.bin/tsc -p /private/tmp/jg-supplier-tests-tsconfig.json`: **PASS**, strict no-emit checking of both new regression files and their imports (temporary config extends the repository config).
- `pnpm eval`: **PASS**, 5 files / 80 synthetic tests; no live model or provider (`/private/tmp/jg-supplier-eval.log`).
- `pnpm --filter @jobguard/config --filter @jobguard/storage test`: **PASS**, config 2 tests and storage 4 tests (`/private/tmp/jg-supplier-config-storage-tests.log`).
- `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs`: **PASS**, 19 tests. Git-writing lane fixture suites were not run under the dispatcher restriction.
- Core purity, money-arithmetic and commercial-boundary lint: **PASS**. Uncommitted working-tree allow-list verification using the existing exported `selectLane`/`matches` functions: **PASS**; separately labelled, not the official committed lane check. `git diff --check`: **PASS**.
- `LANE_BASE_REF=origin/main pnpm lint` and `LANE_BASE_REF=origin/main pnpm lint:lanes`: **FAIL-CLOSED**, `Missing branch or self-comparison range; refusing a misleading pass.` Starting HEAD still equals origin/main because this task forbids commits. No lint policy changed; rerun after dispatcher commit.
- `pnpm openapi:check`: **sandbox blocked**, tsx CLI `listen EPERM` on its IPC socket. Alternative `cd apps/api && node --import tsx src/generate-openapi.ts --check`: **PASS after dependency builds**; first attempt before builds failed with missing `SiteVisitRepository` export. Published OpenAPI file unchanged. The official wrapper remains required on Mac/CI.

Broad initial package runs included generated dist tests and were interrupted, then source/serial runs were used. Root `pnpm test` was not run because it includes prohibited PostgreSQL, socket and git-writing fixtures; these restricted checks remain mandatory outside this sandbox. No existing suite became optional. Detailed broad-run results:

- `pnpm turbo run lint`: **PASS**, all 7 package lint tasks (root lint still refuses the uncommitted lane comparison, as above).
- `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1`: **2443 passed / 2 failed**, 80 passing files and one failing file. Both failures are existing `src/receipt-allocation.test.ts` tests timing out at the unchanged 5000ms limit: the 2000-line exact-aggregation test and documented denominator-limit test. A focused rerun of that unchanged file yielded **32 passed / the same 2 timeout failures**. No timeout or assertion was edited.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --exclude '**/dist/**' --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts'`: **177 passed / 1 failed**, including the 11 new regressions. The existing `[C-OPS-1] all transitive request workspace sources and package entry targets cannot reach the operator` test in `src/audit-checkpoint-handoff.test.ts:279` timed out at its unchanged 5000ms limit. The free-port unit test requires a localhost bind and was deferred with the integration suites.
- First serial web unit run: **585 passed / 199 failed** in 7 files, with missing built `siteVisitHttpFailure` / site-visit exports. It started before dependency builds finished. The same serial web unit command rerun after dependency builds completed: **PASS**, 33 files / 784 tests (`/private/tmp/jg-supplier-web-unit-rerun.log`). No web file or expectation was changed.
- Broad API source-unit run excludes the existing socket/DB tests (`shadow-isolation.application.test.ts`, `auth/sso/action-paths.test.ts`, and `*.http.test.ts`); **1553 passed / 1 failed / 1 skipped**, 63 passing files and 2 failing files, plus one unhandled socket error. Two additional socket-dependent tests were discovered: `health.test.ts` uses supertest and failed with `listen EPERM`; `final-account-lock.isolation.test.ts` attempted a real-database fixture but failed in `freePort` before PostgreSQL initialization/start (`no free port in 58400..58650`). No PostgreSQL server was started. The existing skip remains unchanged; the full package suite must execute on Mac/CI. The protected auth boundary suite was not among the failures. The initial unrestricted API attempt included dist and HTTP tests and was interrupted after export/socket failures; it is not reported as a completed suite.

All failure logs remain under `/private/tmp/jg-supplier-*.log`. These observations are not an independent verdict or proof that the failures also occur on the starting commit.

## Deferred audit observations

**LATER:** stale supplier intake revision throws plain `Error("STALE_DOCUMENT_INTAKE")`, so Nest returns HTTP 500 instead of typed 409. No stale-conflict/filter change in this task.

Audit's weak-test improvements are deferred, with no edits to those existing assertions:

- Original/version/hash/page-lineage preservation across duplicate intake and corrections.
- Same-tenant wrong-job links, cross-tenant reads and every supplier table's forbidden mutations.
- Intake injection fields and malformed IDs; new tests here cover the blocking receipt precision issue only.
- Exact extraction citation boundaries and matching source substrings.
- Actual supplier command ID reuse with changed payload/job instead of registry source-string inspection.

## Dispatcher/Mac/CI work and acceptance hold

Run after the dispatcher commits, using the clean pinned environment:

```sh
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm typecheck
pnpm test
pnpm build
pnpm openapi:check
pnpm eval
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-api-file-supplier-document.integration.test.ts test/supplier-documents.integration.test.ts
pnpm test:db
pnpm test:migrations
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M2-2-S.spec.ts M2-3-S.spec.ts M2-4-S.spec.ts M2-5-S.spec.ts CH-2.spec.ts
```

Do not start PostgreSQL or browsers in this sandbox. No PostgreSQL or browser test body was executed here; the API isolation suite setup attempt failed before starting PostgreSQL, as recorded above. Real PostgreSQL storage/rollback/RLS, browser supplier workflows and mandatory broader checks require Mac/CI evidence. No customer data or provider credential, no spending. No live extraction release or G2 sign-off follows from this synthetic correction.

**HOLD for technical acceptance:** different-model verdict on the dispatcher's exact commit, independent verification of the required checks, separate acceptance, and founder-owned merge/release remain outstanding. This receipt is builder evidence, not an independent verdict or approval.
