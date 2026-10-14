# AUDIT-FIX-DBSRC-09 builder receipt

**STOP — migration required for the controlled financial write paths. No repair implemented.**

Issued 13 October 2026 by dispatcher 4. Branch `codex/sandbox/audit-fix-dbsrc-09`; starting and unchanged HEAD `bd959b01e857de0ba7cbd3588bab84add7d0f493`. Check lane **RED** for money. Work is uncommitted; no Git-writing commands, installs, PostgreSQL, browser, real data, spending or external actions.

Read repository AGENTS.md; BUILD_PLAN §§2, 5.1–5.4, the UIWIRE-10/11 built-task records and SV-4 invoice guard acceptance; the issued dbsrc-09 audit; current repository, invoice/credit SQL definitions, and existing invoice test harnesses. No independent verdict or technical acceptance is claimed.

## Stop condition

The first blocking finding reaches `app.issue_practice_customer_invoice`, whose latest definition is `packages/db/migrations/0095_job_parties.sql:340`. It copies the cumulative revision totals (`:379`); existing-invoice lookup (`:361`) only covers that revision. The runtime can execute it directly via the unchanged grant in `0027_uiwire10_customer_invoice.sql:52`. The credit routine similarly permits gross-only availability at `0028_uiwire11_credit_notes.sql:70` and remains directly executable by runtime (`:90`). AGENTS §§5.3–5.6 and BUILD_PLAN C4 require these protected money invariants in controlled writes. A repository-only preflight would leave direct SQL bypasses, and an unserialized preflight would also race. Enforcing those invariants in existing deployed routines requires a new migration; editing an old migration would not fix an upgraded database. The work order says “No migration unless the finding cannot be fixed without one (then STOP and say so).” Stopped implementation on this boundary. No migration number, new policy, SQL rewrite or workaround was selected.

Source inspection above is not execution of the report's scenarios. No failing regression was run and no finding is claimed fixed. Per the issued reproduction rule:

- **DROPPED (this attempt), BLOCKING 1:** no failing-test reproduction executed before the migration STOP.
- **DROPPED (this attempt), BLOCKING 2:** no failing-test reproduction executed before the migration STOP.
- **DROPPED (this attempt), BLOCKING 3:** no failing-test reproduction executed before the migration STOP; repository replay projection remains unchanged.

These statuses do not clear the reported risks for release.

## Scope and preservation

Only this receipt and one compact lane entry are changed. Existing source, tests, expected values, refusals, counts, pins, fingerprints and migrations are unchanged. The protected `apps/api/src/auth/context-boundary.test.ts` and its catalogues are untouched and compare byte-identical to origin/main (SHA-256 `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`). No existing test setup or catalogue row was changed. No schema/backfill/rollback obligation, public behavior change, provider, alert or AI change is introduced. Standard F: **no new GRANT**, direct runtime money/membership/authorization/receipt/audit write privilege, role or policy change.

Catalogue before: `audit-fix-dbsrc-09` absent. Catalogue after: one compact entry in `config/agent-lane-assignments.json` permitting exactly `config/agent-lane-assignments.json` and `docs/verdicts/AUDIT-FIX-DBSRC-09/BUILDER_RECEIPT.md`. All prior catalogue entries compare identical to origin/main. Registry edits serialize with the dispatcher. Exact added row:

```json
"audit-fix-dbsrc-09":{"branches":["codex/sandbox/audit-fix-dbsrc-09"],"receipt":"docs/verdicts/AUDIT-FIX-DBSRC-09/BUILDER_RECEIPT.md","note":"RED money/controlled-write review. STOP: enforcing the reported financial invariants requires a migration; no implementation attempted. C1: receipt and additive lane entry only, no web workflow. Shared registry serializes with dispatcher.","allow":["config/agent-lane-assignments.json","docs/verdicts/AUDIT-FIX-DBSRC-09/BUILDER_RECEIPT.md"]}
```

## Checks actually run

Runtime Node `v24.17.0`, preinstalled pinned pnpm `10.28.1` (temporary PATH shim at `/private/tmp/jg-audit-dbsrc-09-bin`). No install or download. Logs are `/private/tmp/jg-dbsrc09-*.log`. These are baseline/administrative checks, not verification of a repair. Implementation remains stopped.

| Command/check | Actual result |
| --- | --- |
| `LANE_BASE_REF=origin/main pnpm build` | PASS: 7 workspace tasks, 4 cached; API/db/web built. Existing CSS/workspace-root and sandbox Turbo IO warnings recorded |
| `LANE_BASE_REF=origin/main pnpm typecheck` | PASS: 7 workspace tasks, 4 cached; API/db/web executed |
| `LANE_BASE_REF=origin/main pnpm turbo run lint` | PASS: 7 workspace tasks, 4 cached; API/db/web executed. Separate fallback, not a pass of root lane lint |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL/CANNOT VERIFY: lane check refuses HEAD == origin/main with “Missing branch or self-comparison range; refusing a misleading pass.” Core purity passed before that refusal |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Same self-comparison refusal; no guard changed |
| Supplemental working-tree allowlist and previous-registry comparison, protected auth file byte comparison | PASS: exactly two allowed paths; all prior lane values identical; protected test byte-identical |
| Supplemental lane-floor.py matcher over working-tree paths | Registry AMBER, receipt GREEN; assigned RED for the financial audit. Not the committed lane-floor check |
| Money arithmetic and commercial-boundary linters | PASS |
| Safe Node tooling tests (core purity, dependency audit, decision-check purity, decision records, shared money origin, policy gate sites, commercial boundary) | PASS: 19 tests |
| Config/storage tests through forced filtered Turbo test | PASS: 2 config tests and 4 storage tests, zero cached test tasks |
| AI source unit tests, `vitest run src --maxWorkers=1` | PASS: 80 tests / 5 files |
| Core source unit tests, `vitest run src --maxWorkers=1` | FAIL: 2,440 passed, 5 timed out at the unchanged 5-second limit (three receipt-allocation cases, enterprise-boundary source inspection, exhaustive extra-origin offsets) |
| Web unit re-run after API build completed, `vitest run --maxWorkers=1` | PASS: 784 tests / 33 files; initial failure remains recorded |
| Initial web unit run before API build completed | FAIL: 272 passed, 512 failed, 15 errors; includes undefined `recoveryCaseCommandResponseV1` from stale API built output. Re-run after API build is separately recorded above |
| API sandbox-safe source suite, `vitest run src --maxWorkers=1` with the exclusions below | FAIL: 1,553 passed, two unchanged 5-second timeouts in watchdog-registry standalone-mutation coverage and practice-transports Next quote-delivery GET. Protected context-boundary test included; no test edits |
| DB source unit tests, `vitest run src --maxWorkers=1` | FAIL: 86 passed, unchanged C-OPS-1 transitive-source test timed out at its existing 5-second limit; no assertion/timeout changed |
| `pnpm openapi:check` | BLOCKED: tsx CLI IPC socket `listen EPERM` |
| Same OpenAPI generator via `node --import tsx src/generate-openapi.ts --check` in apps/api | PASS after DB dependency build. Earlier pre-build attempt failed on stale built DB export `ContractorPracticeSessionRepository`; both attempts logged |
| `git diff --check` | PASS at initial and final scope verification |

All started checks have completed; no check process is intentionally left running. No finding-specific failing regression or fix was attempted after the migration STOP.

Full `pnpm test` was not invoked because it starts PostgreSQL/HTTP suites and the lane-tool fixture tests run Git-writing commands, forbidden here. The sandbox-safe API command was `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --exclude src/health.test.ts --exclude src/auth/sso/action-paths.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/final-account-lock.isolation.test.ts --exclude 'src/contractor/*.http.test.ts'`; the excluded suites remain required in dispatcher CI. No PostgreSQL or browser was started. Broad tests ran concurrently; any observed timeout remains a failure, not a pass inferred from load.

## Dispatcher / Mac or GitHub CI checks required

Recheck the eight unchanged timeouts (five core, one DB, two API) on the Mac/CI without changing assertions or budgets.

After any separately issued migration repair, first run the report's named failing regressions against real PostgreSQL: `legacy issue cannot rebill an invoiced baseline` (F7 two-revision scenario, unchanged first invoice plus exactly 96,000p supplementary); `credit corrections cannot exceed remaining invoice net` (preview and direct runtime routine, two credits and 6,664p net unchanged); `issue replay projects existing receipts and credits` (70,000p balance, 50,000p paid, 12,000p credited). None of these new regressions exists in this stopped attempt.

Mandatory real suites: `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e`. Particularly retain UIWIRE-10/11/12 and final-account-lock invoice PostgreSQL/browser coverage. Any future migration requires fresh/upgrade/catalog/RLS/grant/concurrency verification and the migration-specific forward-fix strategy. Re-run `LANE_BASE_REF=origin/main pnpm lint` and `pnpm lint:lanes` after the dispatcher commits; also typecheck/build/openapi. No database or browser suite can be executed here under the dispatcher's environment restriction. No live-model evaluation is applicable to this receipt-only change.

## LATER findings — listed only

4. Replayed issuance appends duplicate issuance audit facts.
5. Concurrent identical issuance retries conflict instead of replaying.
6. Calendar issue dates shift during British Summer Time.

The report's five weak-test observations (UIWIRE-10 replay coverage, UIWIRE-11 rounding coverage, independent race fixtures, legacy/interim lock coverage, prevention provider coverage) are follow-up suggestions only. Existing tests were not edited.

Intended conventional commit message: `/private/tmp/jg-msg-audit-fix-dbsrc-09.txt`. This is a stopped builder run receipt, not an independent verdict or acceptance.
