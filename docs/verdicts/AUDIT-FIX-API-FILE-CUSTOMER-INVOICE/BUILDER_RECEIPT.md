# AUDIT-FIX-API-FILE-CUSTOMER-INVOICE builder receipt

Status: **STOPPED — migration required; no implementation acceptance claimed.**

Issued 13 October 2026 by dispatcher 4. Source inspection and available deterministic checks only; no independent model verdict or acceptance. Check lane: RED (invoice money and commercial authorization). No real data, external action or spending.

## Baseline and authority

- Read repository `AGENTS.md`, `BUILD_PLAN.md` §10.2.6 and `docs/contracts/final-account-lock-v1.md`, and the issued audit at `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-file-customer-invoice.md`.
- Branch: `codex/sandbox/audit-fix-api-file-customer-invoice`.
- Actual initial HEAD and local `origin/main`: `c08a53784c05b54b18f7bfff87f4c7597032ca7e`; the issued base was `e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4`. No branch/ref changes made.
- Runtime: Node `v24.17.0`; repository package-manager pin `pnpm@10.28.1`. Dependencies already present; no install attempted.

## Mandatory migration stop

Finding 4's active writer is `app.issue_practice_customer_invoice` in `packages/db/migrations/0095_job_parties.sql:340`. Lines 367–372 construct a PDF header followed by plain text and append a party snapshot. Lines 373–385 derive the artifact hash and bind it to the action authorization, stored invoice bytes, outbox content and command result. `PracticeInvoiceRepository.artifact` returns those stored bytes, and the application/controller deliver them as a PDF.

A valid PDF must be created before the exact artifact is authorized and stored. Fixing that writer requires a new migration replacing the persisted routine; editing an already-applied migration would not upgrade existing databases. Transforming the download would deliver bytes different from the approved/stored/hash-bound artifact. No migration, historical-byte rewrite or download conversion was attempted. The issued rule says: **“No migration unless the finding cannot be fixed without one (then STOP and say so).”** Implementation stopped when this requirement was identified, before any production or test edit.

## Finding disposition

- DROPPED #1 for this run: no failing authenticated revised-account reproduction executed; PostgreSQL is unavailable in this sandbox.
- DROPPED #2 for this run: no failing split-credit preview/issue reproduction executed; PostgreSQL is unavailable in this sandbox.
- DROPPED #3 for this run: no failing two-connection snapshot reproduction executed; PostgreSQL is unavailable in this sandbox.
- DROPPED #4 for this run: no failing issued-download PDF-parser reproduction executed; mandatory migration STOP reached during source inspection.

These dispositions do not claim the reported defects are fixed or disproved. No regression test was written or shown failing, and no fix was applied.

LATER #5: the local-state invoice journey does not exercise persisted invoice API issuance/payment/reversal/credit history; retain for separately issued work.

The audit's five weak-test suggestions remain unimplemented: persisted `customer-invoice.spec.ts` journey; actual PDF parsing/hash/content in UIWIRE-10; split-credit rounding boundaries in UIWIRE-11; exact competing-command/idempotent-retry assertions in UIWIRE-11; authenticated cross-job access assertions in practice transports.

## Exact changes and preserved guarantees

- Added one compact lane row with an exact two-file allow list, and this receipt.
- Catalogue before: no `audit-fix-api-file-customer-invoice` lane. After: one new row for this issued task, allowing only `config/agent-lane-assignments.json` and this receipt. All earlier rows remain unchanged.
- No premise-establishing test setup changes; no existing expectation, refusal, count, pinned name or fingerprint changed.
- `apps/api/src/auth/context-boundary.test.ts` and its pinned lists are untouched.
- Standard F: no new or changed GRANT, no direct financial/authorization write privilege, no migration/schema change, backfill or rollback requirement. No new operational alert, API or backwards-compatibility change.

## Checks

Full database/browser suites cannot run here. No clean install was performed. No changed implementation exists to validate.

| Actually executed command/check | Result |
| --- | --- |
| `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `LANE_BASE_REF=origin/main pnpm lint:lanes`, `pnpm build`, `pnpm openapi:check` | Launcher stalled before script execution; interrupted, exit 130. No install command issued. |
| `node_modules/.bin/turbo run typecheck` | Exit 0; all seven tasks were shared-cache hits, not fresh executions. |
| `node_modules/.bin/turbo run build` | Exit 0; all seven tasks were shared-cache hits, not a fresh build. |
| Direct `node_modules/.bin/tsc -p tsconfig.json --noEmit`, per package | Fresh passes for core, config, AI, storage and DB. Parallel runner interrupted (130); fresh API/web checks did not complete. Separate API/web attempts also interrupted (130). |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | Exit 1 after core-purity pass: lane checker refuses identical HEAD and origin/main. |
| `node tools/agent-lane-boundary-lint.mjs` | Exit 1: “Missing branch or self-comparison range; refusing a misleading pass.” No weaker comparison base substituted. |
| Core-purity, money-arithmetic, commercial-boundary lint scripts directly | Exit 0. |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | Exit 0; 19 tests passed. Git-writing lane fixture suites deliberately excluded. |
| `node_modules/.bin/vitest run --maxWorkers=1` in packages/config | Exit 0; 2 tests / 2 files passed. |
| Same command in packages/ai | Exit 0; 80 tests / 5 files passed; fixture tests, not live-model evaluation. |
| Same command in packages/storage | Exit 0; 4 tests / 2 files passed. |
| Same command in apps/web | Exit 0; 784 tests / 33 files passed; unit tests, not browser tests. |
| DB `node_modules/.bin/vitest run --exclude '**/dist/**' --exclude '**/*.integration.test.*' --exclude 'test/free-port.test.ts' --maxWorkers=1` | Exit 1; 168 passed / 1 failed across 13 files. Unchanged `[C-OPS-1] all transitive request workspace sources and package entry targets cannot reach the operator` timed out at its existing 5000ms limit (`src/audit-checkpoint-handoff.test.ts:279`). No limit or assertion changed. |
| Initial DB unit filter `vitest run src test --exclude '**/*.integration.test.ts' --exclude 'test/free-port.test.ts' --maxWorkers=1` | Interrupted (130) after selecting compiled `dist` test copies and reporting a checkpoint reachability failure; corrected the invocation to exclude all dist and integration copies. |
| OpenAPI via `apps/api/node_modules/.bin/tsx apps/api/src/generate-openapi.ts --check` | Exit 1; sandbox denies tsx IPC listener (`listen EPERM`). |
| `node --import tsx src/generate-openapi.ts --check` from apps/api | Exit 0; exact OpenAPI comparison passes using the installed loader, without the CLI IPC listener. A preceding root-directory loader attempt failed on missing decorator compiler settings; corrected the working directory. |
| Exact lane registration / old-row preservation / protected-test byte comparison against HEAD | Passed; only the new compact row added; every previous row and protected test byte-identical. This is not range-lint acceptance. |
| `git diff --check` | Exit 0. |

Initial core `vitest run --maxWorkers=1` also selected compiled dist test copies restored by the shared build cache. Interrupted (130) and corrected the invocation to `vitest run --exclude '**/dist/**' --maxWorkers=1`. Before interruption, unchanged source tests in enterprise boundaries, extra origin and receipt allocation reported failures; compiled site-extra-pricing/recovery-allocation checks also failed. No assertions, timeout limits or source files were changed in response.

Corrected core unit invocation `node_modules/.bin/vitest run --exclude '**/dist/**' --maxWorkers=1`: exit 0; **2445 tests / 81 files passed**, 76.02s. This corrected invocation excludes compiled copies without modifying tests.

API command from apps/api: `node_modules/.bin/vitest run src --exclude '**/*.http.test.ts' --exclude 'src/health.test.ts' --exclude 'src/shadow-isolation.application.test.ts' --exclude 'src/auth/sso/action-paths.test.ts' --maxWorkers=1`. Exit 1; **1551 passed, 2 failed, 1 skipped**, 61 passed / 3 failed files, 387.88s. Failures:

- `src/practice-transports.test.ts:121`, “Next quote delivery GET maps missing, invented and stranger practice sessions to 401/404”: existing 5000ms timeout.
- `src/recovery-message.controller.test.ts:69`, “Next read/list maps practice failures through the real no-store adapter”: existing 5000ms timeout.
- `src/final-account-lock.isolation.test.ts`, “DW8 real database application isolation”: indirect database fixture attempted free-port discovery, refused with `no free port in 58400..58650` before PostgreSQL could start. This integration-dependent suite was missed by the original source scan because its setup is imported. It belongs on the dispatcher's Mac/CI alongside the excluded HTTP and shadow-isolation suites; no test was edited to bypass it.

None of these failures reproduces a finding in the issued customer-invoice report; no assertion, timeout, retry policy or expected value was changed. These deterministic results do not constitute independent review or a green full-suite run.

## Dispatcher checks and remaining gates

Run on the Mac/GitHub CI after the dispatcher commits/pushes: `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `LANE_BASE_REF=origin/main pnpm lint:lanes`, `pnpm build`, `pnpm openapi:check`, `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, and `pnpm test:e2e` (including UIWIRE-10/11/12 and the customer-invoice journey). The full test command includes temporary git-writing lane-test fixtures, real PostgreSQL integration suites and HTTP listener tests; it was not invoked under this sandbox's restrictions. The reported regressions still need failing tests and fixes in a separately authorized migration-capable task. Existing tests alone do not establish those fixes.

Required before technical acceptance: a different model's recorded verdict bound to the dispatcher's exact commit, separate acceptance, and founder-owned merge/push/release. This receipt supplies no release or professional/commercial approval.

Intended commit message is written to `/private/tmp/jg-msg-audit-fix-api-file-customer-invoice.txt`. No git-writing command was run.
