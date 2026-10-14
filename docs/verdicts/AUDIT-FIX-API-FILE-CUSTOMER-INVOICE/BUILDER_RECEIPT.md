# AUDIT-FIX-API-FILE-CUSTOMER-INVOICE builder receipt — repair r2

## Repair r2 — test only, 14 October 2026

Dispatcher 5 issued this repair against HEAD `2c0b279c20d3fd74f3b53ad48cde69aebe670b3e`. Read the independent Opus REPAIR verdict at `/Users/benharwood/.local/share/full-steam/jg-runs/audit-fix-api-file-customer-invoice-opus-2c0b279.md`, repository `AGENTS.md`, `BUILD_PLAN.md` §§2.4, 5.3–5.4 and 10.2.6, and `docs/contracts/final-account-lock-v1.md`.

The NEW replacement/replay test previously generated a fresh command for an already-issued revision. Migration 0095 returns that existing invoice without creating a receipt for the fresh command; after revision replacement, replaying it therefore fails the current-revision check. `freshInvoice` now returns the command that actually created the invoice. Only **`requires full credit before replacing an invoice and preserves earlier command replays`** uses that retained command for its replay and changed-payload assertions. All assertions are preserved. The only changed files in r2 are the NEW integration-test file and this receipt; production code, migrations, existing tests and lane policy are untouched.

**PostgreSQL is still unrun.** No database or browser suite was attempted in r2: this sandbox cannot bind localhost or start PostgreSQL. No real-PostgreSQL pass, failing-first proof, independent verification, technical acceptance or release is claimed. GitHub CI must run the new six-test suite, UIWIRE-10/11/12, full database/migration/browser checks and the previously requested PostgreSQL failing-first comparison after the dispatcher commits/pushes. The r1 release holds and finding 4 STOP remain unchanged; a verdict bound to the dispatcher's new commit and separate acceptance remain owed.

### R2 checks actually run

Dependencies were already installed; no install/download or git-writing command was run. Node is `v24.17.0`. The default standalone `pnpm --version` stalled and was interrupted (130); all pnpm checks below used the existing temporary PATH shim `/private/tmp/jg-pnpm-r1/bin/pnpm`, which invokes cached pinned pnpm `10.28.1`. Logs are `/private/tmp/jg-invoice-r2-*.log`.

| Actually executed check | Result |
| --- | --- |
| `pnpm typecheck --force` | Exit 0; all seven packages freshly executed, zero cache hits. |
| `LANE_BASE_REF=origin/main pnpm lint --force` | Exit 0; root checks and all seven package checks freshly executed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0; registered six-file task lane. |
| `pnpm build --force` | Exit 0; all seven packages freshly executed, including Next production build. Existing CSS/workspace-root and sandbox cache-write warnings. |
| `pnpm openapi:check` | Exit 1; tsx CLI IPC listener refused with `listen EPERM`. |
| `node --import tsx src/generate-openapi.ts --check` from apps/api | Exit 0; same installed generator and exact OpenAPI comparison, without CLI IPC. |
| `node_modules/.bin/tsc -p /private/tmp/jg-invoice-r1-tests-tsconfig.json` | Exit 0; retained strict/noEmit config includes the NEW integration test and unchanged UIWIRE-12, beyond the package's src-only typecheck. |
| Selected sandbox-compatible unit suites | Exit 0 throughout; tools 19, DB source 91 (including four invoice-repository units), DB test-directory units 82, core 2445, API 1551, web 784, AI fixtures 80, config 1, storage 2: **5055 tests passed**. No live-model or browser result claimed. |
| Exact-diff inspection and `git diff --check` | Passed; only fixture command retention and the one test's command selection changed, with every assertion unchanged. |

The unit commands and exit codes are recorded in `/private/tmp/jg-invoice-r2-unit-results.json`, with per-suite logs. From each package, Vitest used `run --exclude '**/dist/**' --maxWorkers=1`; DB source selected `src`, and DB test-directory units explicitly selected its eight non-integration/non-free-port test files. API selected `src` and excluded `**/*.http.test.ts`, `src/health.test.ts`, `src/shadow-isolation.application.test.ts`, `src/auth/sso/action-paths.test.ts` and `src/final-account-lock.isolation.test.ts` because those suites require listeners and/or PostgreSQL. Tools ran the seven read-only suites via `node --test`; the two agent-lane fixture suites execute git-writing commands and were excluded. Full `pnpm test` remains mandatory in CI and was not invoked under the no-git-write instruction.

Intended conventional commit message overwritten at `/private/tmp/jg-msg-audit-fix-api-file-customer-invoice.txt`. Working-tree handoff only; dispatcher owns commit/push. No migration, compatibility, authorization, money-policy, operational-alert or provider-route change in r2.

## Repair r1 — historical receipt

Status: **Findings 1–3 implemented and scripted-unit verified; real PostgreSQL verification pending. Finding 4 STOPPED. No technical acceptance or release claimed.**

Issued 14 October 2026 by dispatcher 5 against `2e6f87d05091cbc103dc020d9f386aa32a368756`. RED money/authorization lane. Working-tree changes only; dispatcher owns commit/push. No real data, business network action, spending, installation, migration, or git-writing command.

## Authority and baseline

Read repository `AGENTS.md`, `BUILD_PLAN.md` §10.2.6 and `docs/contracts/final-account-lock-v1.md`; the original audit at `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-file-customer-invoice.md`; and the full Opus REPAIR verdict at `/Users/benharwood/.local/share/full-steam/jg-runs/audit-fix-api-file-customer-invoice-opus-2e6f87d.md`. That verdict is source inspection of the previous commit, not verification of this repair.

Branch: `codex/sandbox/audit-fix-api-file-customer-invoice`. Initial HEAD: `2e6f87d05091cbc103dc020d9f386aa32a368756`; local `origin/main`: `bd959b01e857de0ba7cbd3588bab84add7d0f493`. The previous receipt recorded an issued base `e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4` versus its actual base `c08a53784c05b54b18f7bfff87f4c7597032ca7e`; this repair does not change refs or resolve that historical discrepancy. Runtime Node `v24.17.0`; pnpm pin `10.28.1`; installed Vitest `4.1.11`.

The earlier DROPPED dispositions for findings 1–3 are withdrawn. Sandbox inability to start PostgreSQL is a verification limit, never evidence that a defect cannot be reproduced or repaired.

## Repairs and limits

- **Finding 3:** `creditView` now selects invoice amounts and ordered credit history in one SQL statement, matching the sibling receipt projection's READ COMMITTED snapshot strategy. The response shape, amount mapping and ordering remain the same. The NEW real two-connection test **`credit history and balance share one snapshot`** intercepts the completed invoice SELECT on connection A, commits a credit on B before returning A's rows, then checks history/balance consistency and the subsequent committed view. It explicitly checks different backend PIDs. A separate scripted-response unit reproduces the same interleaving.
- **Finding 2:** preview and issue acquire the exact transaction-scoped advisory lock used by migration 0028's issuer, then read cumulative credited net and reject when requested net plus prior credited net exceeds original invoice net. The new guard uses `bigint` arithmetic and the existing `CREDIT_EXCEEDS_AVAILABLE_AMOUNT` refusal. The existing gross ceiling, tax formula and preview-hash algorithm are unchanged. Completed commands still reach the persisted routine's replay/payload-conflict checks. The NEW real test **`split credits cannot exceed original net principal`** issues 10001 and 10002 net against 20003 net / 4001 VAT / 24004 gross, refuses the third 1p net at preview and independently at issue using the old preview's correctly computed hash, and checks unchanged effects plus original-command replays/conflict. Another NEW test holds the stored issuer's lock while a repository issue waits, proving the net total is checked after the wait.
- **Finding 1:** `issue` serializes repository issuers by tenant/job, then refuses a new invoice on a different revision when an earlier invoice has any gross value not credited. It throws `INVOICE_CORRECTION_OR_SUPPLEMENTARY_REQUIRED` before commercial writes. Prior commands and already-issued revisions still reach the persisted routine's original replay/conflict checks. The NEW real test **`revised account cannot rebill previously invoiced scope`** uses 110000 net then 120000 net and checks refusal, unchanged authorization/outbox/command/audit counts, and aggregate billed net. Additional NEW tests cover partial versus full credit, replacement/replay, and competing issuers on the same revision. This does not implement supplementary or added-lines-only invoicing.

**Ben's money decision remains owed:** the split-credit example leaves 1p of VAT/gross outstanding after all 20003p of original net has been credited. This repair refuses another net credit and leaves that penny outstanding. No zero-net credit, residual-tax clearing, rounding change or other money rule is invented.

These are repository/API-path guards. The persisted SQL issuers remain unchanged: direct calls still have their old gross-only credit/per-revision invoice checks. This repair does not claim database-wide enforcement against callers bypassing the repository; closing those routine paths requires separately authorized migration work. Existing tenant context, membership, authorization, RLS, immutable artifacts and audit paths are retained.

## Finding 4 — mandatory STOP remains

The active invoice writer in `0095_job_parties.sql` constructs a PDF header plus plain text and hashes those bytes into authorization, stored invoice, outbox and receipt. A readable PDF must be generated before authorization and storage; transforming the download would break the artifact binding. This requires a new migration and a separately issued order that addresses already-stored artifacts. The same pattern exists in the credit issuer. No persisted issuer, migration, existing artifact bytes or hashes were changed. No readable-PDF fix or parser test is claimed here.

## Exact files and preserved guarantees

The lane row is widened to exactly these six files, and its obsolete “Documentation only” note is corrected:

- `packages/db/src/practice-invoice-repository.ts`
- `packages/db/src/practice-invoice-repository.test.ts` — NEW scripted unit tests
- `packages/db/test/practice-invoice-audit.integration.test.ts` — NEW real PostgreSQL suite
- `packages/db/test/UIWIRE-12.integration.test.ts` — legacy fixture setup only
- `config/agent-lane-assignments.json`
- this receipt

UIWIRE-12 already tests reversal binding against two historical invoices on one job. Its second-invoice fixture now calls the unchanged stored routine directly, through the same runtime role/tenant transaction, to create that deliberately historical scenario; the new repository guard forbids new commands from creating it. Every existing assertion, refusal, count, amount, pinned name, fingerprint and hash remains unchanged. No test assertion was deleted or relaxed. This is serialized work in the shared UIWIRE-12 file, not an unrelated feature.

Read-only comparisons against HEAD verify all other lane rows byte-identical, all UIWIRE-12 expectation lines identical, `apps/api/src/auth/context-boundary.test.ts` byte-identical, and no diff in `apps/web/e2e` or migrations. Standard F: no GRANT, schema/role/access change, new credential, boundary widening or direct financial write privilege. No data migration/backfill/rollback is needed; no historical row is rewritten. Response payloads are unchanged; newly unsafe attempts now refuse before effects. No new operational alert or provider/data-flow change. AI gateway/evaluation and browser implementation changes are inapplicable; existing mandatory CI suites remain required.

## Failing-first evidence

Before changing the repository, ran `node_modules/.bin/vitest run src/practice-invoice-repository.test.ts --maxWorkers=1` from `packages/db`: **exit 1, 3 failed / 1 passed**. The three named regressions fail for the reported reasons: balance 24004 versus credit-adjusted 12003 in the scripted interleaving, preview incorrectly accepts the excess penny, and revised issuance resolves instead of refusing. Log: `/private/tmp/jg-invoice-r1-red-unit.log`.

Also wrote and attempted the NEW real PostgreSQL suite before the fix: `node_modules/.bin/vitest run test/practice-invoice-audit.integration.test.ts --maxWorkers=1`. **Exit 1 at fixture setup: `no free port in 59600..59900`; its then-five test bodies did not execute.** A sixth lock-wait test was added afterwards. Log: `/private/tmp/jg-invoice-r1-red-db.log`. This is not a real-database red or green proof. The dispatcher must run all six tests on PostgreSQL, and must reproduce the three named regressions with the pre-repair repository to establish the database failing-first evidence.

## Checks actually run

Dependencies were already installed; no clean install or downloads. The default pnpm standalone launcher stalled on initial attempts. For the final commands, a temporary PATH shim `/private/tmp/jg-pnpm-r1/bin/pnpm` invokes the already-cached pinned JS executable `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`; this keeps root scripts and nested pnpm commands on 10.28.1. No repository package/tool configuration changed. Turbo uses `--force` for fresh executions; sandbox cache-write warnings are not counted as check success.

Commands below use the temporary pinned-pnpm PATH where pnpm is named. Logs are `/private/tmp/jg-invoice-r1-*.log`.

| Actually executed check | Result |
| --- | --- |
| `pnpm typecheck --force` | Exit 0; all seven packages freshly executed, zero cache hits. |
| `LANE_BASE_REF=origin/main pnpm lint --force` | Exit 0; root boundary checks and all seven package checks freshly executed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0; exact six-file lane, real origin/main comparison. |
| `pnpm build --force` | Exit 0; all seven packages freshly executed, including Next production build. Existing CSS/workspace-root and sandbox cache-write warnings. |
| `pnpm openapi:check` | Exit 1: tsx CLI cannot bind its IPC listener (`listen EPERM`). |
| `node --import tsx src/generate-openapi.ts --check` from apps/api | Exit 0; same installed generator's exact OpenAPI comparison, without CLI IPC. |
| NEW scripted unit suite, before repair | Exit 1; three named regressions failed / one replay test passed. |
| NEW scripted unit suite, final repository | Exit 0; 4 tests / 1 file passed (both initial green and final run). |
| NEW PostgreSQL suite, pre-repair attempt | Exit 1 at free-port setup; test bodies not executed. Six final tests require CI. |
| `tsc -p /private/tmp/jg-invoice-r1-tests-tsconfig.json` | Exit 0; temporary strict/noEmit config typechecks the NEW integration suite and modified UIWIRE-12, which the normal package src-only config does not include. |
| DB `vitest run src --exclude '**/dist/**' --maxWorkers=1` | Exit 1; 90 passed / 1 failed, six files. Unchanged C-OPS-1 transitive workspace operator-reachability test exceeded its existing 5000ms limit (20.2s elapsed). No limit/assertion changed. |
| DB eight explicitly selected test-directory unit files, with dist excluded | Exit 0; 82 tests / 8 files passed. |
| Core units, dist excluded | Exit 1; 2442 passed / 3 timed out, 81 files. Unchanged receipt-allocation tests at lines 125, 212 and 222 exceeded their existing 5000ms limits while other checks ran. |
| Core `vitest run src/receipt-allocation.test.ts --maxWorkers=1`, after concurrent checks finished | Exit 0; all 34 tests passed with original limits/assertions. The first full-suite timeout result remains recorded. |
| API available unit suites | Exit 0; 1551 tests / 63 files passed. Command: `vitest run src --exclude '**/*.http.test.ts' --exclude 'src/health.test.ts' --exclude 'src/shadow-isolation.application.test.ts' --exclude 'src/auth/sso/action-paths.test.ts' --exclude 'src/final-account-lock.isolation.test.ts' --maxWorkers=1`. Exclusions require HTTP listeners and/or real PostgreSQL; they remain mandatory in CI. |
| Web units, dist excluded | Exit 0; 784 tests / 33 files passed; no browser run claimed. |
| AI fixtures, dist excluded | Exit 0; 80 tests / 5 files passed; no live-model evaluation claimed. |
| Config and storage units, dist excluded | Exit 0; config 1 test / 1 file; storage 2 tests / 1 file. |
| Seven selected read-only tools suites | Exit 0; 19 tests passed. Git-writing lane fixture suites were excluded. |
| Existing-assertion/protected-file/lane-row comparisons and `git diff --check` | Passed; no existing expected values or protected files changed. |

One initial DB test-directory filter (`vitest run test --exclude '**/*.integration.test.ts' --exclude 'test/free-port.test.ts' --maxWorkers=1`) selected source and compiled dist copies because Vitest filters by substring. It was interrupted (130) after unchanged C-OPS-1 copies timed out, then corrected to the eight exact test-directory filenames plus dist exclusion; the corrected run above passed. Initial launcher/direct-turbo attempts were interrupted or superseded by the pinned-pnpm fresh runs; no cache-hit result is claimed as fresh validation.

C-OPS-1 isolated recheck: `vitest run src/audit-checkpoint-handoff.test.ts -t 'all transitive request workspace sources and package entry targets cannot reach the operator' --maxWorkers=1` exited 0; the one selected test passed (55 unrelated tests skipped), with the original 5000ms limit. Log: `/private/tmp/jg-invoice-r1-db-timeout-recheck.log`. Neither isolated recheck replaces the recorded initial full-suite results or the dispatcher's full `pnpm test` requirement.

## Dispatcher verification and remaining gates

After committing/pushing, run:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/practice-invoice-audit.integration.test.ts test/UIWIRE-10.integration.test.ts test/UIWIRE-11.integration.test.ts test/UIWIRE-12.integration.test.ts
pnpm typecheck
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm build
pnpm openapi:check
pnpm test
pnpm test:db
pnpm test:migrations
pnpm test:e2e
```

The NEW required regressions are named exactly **`credit history and balance share one snapshot`**, **`split credits cannot exceed original net principal`**, and **`revised account cannot rebill previously invoiced scope`**. For the PostgreSQL failing-first comparison, use the new suite with only `practice-invoice-repository.ts` from `2e6f87d` in a separate dispatcher-controlled checkout, run those three tests, then run the full six-test suite against the repair. Do not substitute mock results for PostgreSQL. GitHub CI owns the full database/migration/browser suites; the sandbox cannot bind localhost or start PostgreSQL. Full `pnpm test` also runs temporary git-writing lane fixtures and was not invoked under the no-git-write instruction.

LATER #5 remains: the web invoice journey exercises local state, not the persisted API. The PDF parsing strengthening remains stopped with finding 4. The new suite addresses split-credit penny/replay boundaries; the existing weak UIWIRE-11 competing-command assertion and authenticated transport cross-job strengthening still need their own order. No existing expected result was changed to address them.

A different model must record a verdict bound to the dispatcher's exact repair commit; separate acceptance and founder-owned merge/push/release remain owed. The previous Opus REPAIR verdict and these deterministic checks are not acceptance of this diff. Production/commercial/real-user release gates remain unchanged.

Intended conventional commit message: `/private/tmp/jg-msg-audit-fix-api-file-customer-invoice.txt`. No git-writing command was run.
