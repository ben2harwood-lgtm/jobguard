# AUDIT-FIX-DBSRC-03 builder receipt

Issued 13 October 2026 by dispatcher 4. Branch `codex/sandbox/audit-fix-dbsrc-03`; supplied and inspected base `bd959b01e857de0ba7cbd3588bab84add7d0f493` (`origin/main`). Working-tree changes only; the dispatcher owns the commit. No Git-writing command was run.

**Check lane: RED — money and tenancy. Technical acceptance: HOLD**, pending real PostgreSQL/browser execution, the independent RED reviews bound to the eventual commit, and separate acceptance. This is builder evidence, not an independent verdict.

Read: repository AGENTS.md rev 3.0 in full; BUILD_PLAN §§2.1–2.4, 5.1–5.4, the M1-12/UIWIRE-10/11/12 built records and the §7.1 audit priority; existing final-account-lock contract; migrations 0017, 0028 and 0030; existing billing, command, tenant-context, home-read and practice-session implementations/tests; the supplied `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-03.md`; external CHECK-LANES v2 and standard F's grant restriction.

## Test-first blocking findings

Before changing either production file, added `packages/db/test/audit-dbsrc-03.test.ts` and ran, from `packages/db`:

```sh
node node_modules/vitest/vitest.mjs run test/audit-dbsrc-03.test.ts --maxWorkers=1
```

**Result: FAIL, 4/4 for the audit's expected reasons.** Log: `/private/tmp/jg-dbsrc-03-tests-before.log`. The shell captured and printed the log after Vitest failed, so its wrapper exited 0; Vitest itself reported four failures. These are bounded query-double reproductions using the real service, dispatcher, reader and home-read code. They are not PostgreSQL proofs.

1. **Competing credits — FIXED in source; database proof pending.** `serializes competing credits against remaining debt` paused the first 8,000p credit after its balance read, started a distinct second command, then released the first. Expected one success; got two. The double stages inserts until commit and uses distinct legacy credit numbers, avoiding a uniqueness collision as a substitute for the real defect. The fix acquires the existing practice-credit routine's invoice advisory lock in the dispatcher lock hook, before receipt/FK locks and before a separate balance-read statement. UUIDs are cast through UUID to canonical text, so uppercase IDs cannot select a different lock. Amount comparison uses exact bigint. Credits remain bounded by invoice debt; the expected result is one 8,000p credit and a 4,000p balance. Credit numbers now use the command UUID and fit the existing 40-character column.
2. **Credit reader compatibility — FIXED for new credits; database proof pending.** `command-service credits remain readable` failed with `Cannot read properties of null (reading 'trim')` in the unchanged credit reader. New inserts fill signed net/VAT/gross, invoice and preview hashes, synthetic PDF bytes/SHA-256, the existing tax-policy version, and server approval time. The PDF identifies the correcting credit and invoice and includes its signed amounts/reason/source hash; local tests check hash and PDF offsets. The original invoice is not edited. The gross input is inverted through the existing 0028 candidate standard-rate rule `tax=(net+2)/5`, with bigint arithmetic; the result is sign-symmetric. A gross amount having no exact inverse (e.g. 3p) returns `INVALID_CREDIT_AMOUNT` rather than inventing VAT or changing the approved gross. This is the existing synthetic candidate, not D02 tax approval. Pre-existing incomplete credit rows are not backfilled.
3. **Repeated bank references — FIXED in source; database proof pending.** `allows separate receipts sharing a bank reference` failed with `COMMAND_CONFLICT` on the genuine second instalment. The service now delegates receipt identity and durable replay to the existing checked 0030 routine in its tenant transaction. Distinct command IDs may share `INV-100`; retries return the original payment. The public result and non-qualifying-recovery/platform-settlement flags remain unchanged. Current owner/expiry checks precede the routine; the routine performs its own authorization checks. Both prior service audit event types are appended together once before commit, and the existing payload-conflict error is mapped to `COMMAND_CONFLICT`. Exact retries of historical dispatcher-written receipts verify their stored full-input authorization hash and return without rewriting history. Reusing this existing checked writer also inherits its existing money limits; no separate LATER-money implementation or acceptance claim is made.
4. **Unrelated workshop access — FIXED in source; database proof pending.** `home read survives unrelated workspace revocation` failed with `MEMBERSHIP_FORBIDDEN` from the empty tenant. The optional empty-workshop lookup now returns no tenant when its membership is missing/revoked/expired/wrong-identity. The primary membership remains required, and database failures still propagate. No exception is broadly swallowed. Primary jobs and tenant remain available, and inaccessible tenant names are omitted.

The same four new tests immediately passed after the fixes (`/private/tmp/jg-dbsrc-03-tests-after.log`). Additional new coverage checks unsupported gross-credit rollback, PDF structure, legacy receipt compatibility and fail-closed home behavior. Final counts are recorded below.

**DROPPED: none.** All four BLOCKING findings were reproduced before fixing their production paths.

`packages/db/test/audit-dbsrc-03.integration.test.ts` adds the real-PostgreSQL equivalents with the existing non-owner/non-BYPASSRLS runtime role, plus historical dispatcher-receipt compatibility. It creates separate fictional invoice fixtures through the actual invoice command and retains original rows/history. The race pauses a real connection after its balance read and starts the competitor with an uppercase invoice UUID. The home test keeps a practice session active, revokes only the empty membership, and checks the unchanged primary job list/session. The fixture enables LOGIN only on the existing runtime role in its disposable cluster; there is no GRANT, trigger disable, production permission change or migration. Integration coverage is written and statically checked; no successful PostgreSQL execution is claimed here.

## Scope and preservation

Affected invariants: AGENTS §§5.1, 5.3–5.5, 5.7 and 5.10; BUILD_PLAN C4/C5. No migration, backfill, new grant, provider, secret, environment variable, prompt/model/parser/matching change, external action, operational alert, production activation, real data or spending. Standard F: **new GRANTs: none**. Existing schema/grants and controlled routines are reused. Database catalogs and earlier guarantees still require their mandatory CI suites.

C1: existing separately exported billing service and existing home read only; no new UI or route. The web invoice writer remains PracticeInvoiceRepository. Existing invoice/credit/receipt and Jobs journeys remain mandatory regression coverage.

No existing expected value, refusal, count, pinned name, fingerprint, test setup or catalogue row was changed. `apps/api/src/auth/context-boundary.test.ts` is byte-identical to origin/main, SHA-256 `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`. No STOP condition was encountered. No premise setup was inserted into an existing test (before/after: no change); setup is confined to new suites. Every previous lane entry is identical. The lane registry is shared and must serialize with the dispatcher/other dispatched registrations.

Catalogue before: `audit-fix-dbsrc-03` absent. Catalogue after: one new compact exact-allowlist row in `config/agent-lane-assignments.json`. Final registry text and final checks are recorded below.

## LATER findings — listed only

- Credit payload target/reason are not fully bound to approval/content hash and dispatcher replay identity. Named follow-up: `binds credit target and reason to approval and command identity`.
- Receipt inputs/aggregate receipts can exceed the supported money range in the audited direct-writer path. Named follow-up: `rejects receipt amounts and cumulative receipts above the money limit`. The receipt repair reuses the existing checked routine; no separate follow-up test or full finding closure is claimed.
- An advisory question promoted to mandatory can remain suppressed. Named follow-up: `surfaces a previously suppressed question when it becomes mandatory`.

The report's five weakest-test recommendations are follow-up work; existing final-account, decision-inbox, workspace-read and demo-bootstrap assertions were not edited.

## Checks and dispatcher handoff

Runtime: Node `v24.17.0`; pinned pnpm `10.28.1`, using the preinstalled executable via `PATH=/private/tmp/jg-audit-api-value-bin:$PATH`. The default pnpm 11.8 wrapper hung during version selection and was interrupted (exit 130); no package install/download was invoked. Existing dependencies were used; no clean install is claimed. Logs: `/private/tmp/jg-dbsrc-03-*.log`.

| Command / check | Actual result |
| --- | --- |
| New four query-double regressions, before fix | Vitest FAIL as expected, 4/4; output reproduced all four reported failures |
| Same four regressions, immediately after fix | PASS, 4/4; exit 0 |
| Final focused `vitest run test/audit-dbsrc-03.test.ts --maxWorkers=1` | PASS, 8/8; exit 0 |
| `LANE_BASE_REF=origin/main pnpm typecheck --force` | PASS; exit 0, seven tasks executed, zero cached |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1: unchanged lane guard refuses HEAD equal to origin/main; root core-purity check passed before that refusal |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1: `Missing branch or self-comparison range; refusing a misleading pass.` Must rerun after commit |
| `LANE_BASE_REF=origin/main pnpm turbo run lint --force` | PASS; exit 0, seven package tasks executed, zero cached |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | PASS; exit 0; repeated after final source edits |
| `LANE_BASE_REF=origin/main pnpm build --force --concurrency=2` | PASS; exit 0, seven tasks executed, zero cached; existing Next workspace-root/CSS and sandbox Turbo IO warnings |
| Final `pnpm --filter @jobguard/db typecheck` and `pnpm --filter @jobguard/db build` | PASS; exit 0. Rebuilt the final billing source after its last lock/audit edits; checked emitted JS contains the canonical UUID lock and both audit event types |
| Temporary test TypeScript project: `node node_modules/typescript/bin/tsc -p /private/tmp/jg-dbsrc-03-test-tsconfig.json` | PASS after correcting the new fixture's session token to the existing string return type; static only, no database. Earlier attempt had two TS2339 errors in the new fixture, both corrected |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC `listen EPERM` |
| Same check via `node --import tsx src/generate-openapi.ts --check`, in apps/api | PASS; exit 0; no OpenAPI change |
| Safe Node tooling test subset | PASS; exit 0, 19 tests |
| Corrected DB unit run, explicit `--exclude '**/*.integration.test.ts' --maxWorkers=1` | Exit 1: 176 passed, one unchanged C-OPS-1 timeout; 14 files. Includes all eight new regressions; no integration suite collected |
| Focused unchanged C-OPS-1 retry, `-t 'all transitive request workspace sources'` | Exit 1: still exceeds the existing 5-second test limit; 1 failed, 55 unselected. No timeout/assertion changed |
| Sandbox-safe API source suite, two workers | Exit 1: 1,554 passed, one unchanged context-boundary timeout; 64 files |
| Focused protected auth-test retry, `-t 'approves each main practice caller only at its exact reviewed source identity' --maxWorkers=1` | PASS; exit 0, 1 selected test, 144 unselected; original assertion and 5-second limit unchanged |
| Core source suite, one worker | Exit 1: 2,443 passed, two receipt-allocation working-size test timeouts; 81 files |
| Same two unchanged core tests, selected by their existing names with one worker | PASS; exit 0, 2 selected tests, 32 unselected; no limit/assertion changed |
| AI source unit/golden fixtures, one worker | PASS; exit 0, 80 tests in 5 files; synthetic fixtures only, not live-model/provider evidence |
| Web unit suite, one worker | PASS; exit 0, 784 tests in 33 files; no browser |
| Forced config/storage tests | PASS; exit 0: 2 config tests, 4 storage tests (source and built copies); no external storage call |
| Supplemental working-tree lane/preservation checks and `git diff --check` | PASS; no existing registry entry/test/pin changed; exact allowlist covers the six changed files. Supplemental check is not committed lane lint |

Exact safe tooling command:

```sh
node --test tools/core-purity.test.mjs tools/dependency-audit.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/shared-money-origin.test.mjs tools/policy-gate-sites.test.mjs tools/commercial-boundary.test.mjs
```

DB unit command, from packages/db:

```sh
node node_modules/vitest/vitest.mjs run src test/audit-dbsrc-03.test.ts test/recovery-case-join.test.ts test/site-extra-evidence-compatibility.test.ts test/recovery-message-repository.test.ts test/recovery-case-outcome.test.ts test/audit-api-capture.test.ts test/verify-audit-export-cli.test.ts test/contractor-session-context.test.ts test/verify-evidence-pack-cli.test.ts --exclude '**/*.integration.test.ts' --maxWorkers=1
```

API command, from apps/api:

```sh
node node_modules/vitest/vitest.mjs run src --maxWorkers=2 --exclude src/health.test.ts --exclude src/auth/sso/action-paths.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/final-account-lock.isolation.test.ts --exclude 'src/contractor/*.http.test.ts'
```

An earlier broad DB-unit attempt ran while built dependencies were still stale: 49 failed, 128 passed, 4 skipped, with nine file failures (including missing built exports, old built behavior, CLI verification and C-OPS-1). Its `src` substring filter also matched the new `audit-dbsrc-03.integration.test.ts` filename: that suite failed at free-port selection (`no free port in 57000..57500`) before PostgreSQL initialization/start. No PostgreSQL server or browser was started. The corrected command explicitly excludes every integration file and, after the builds, resolves all of those earlier failures except C-OPS-1. The original failed attempt remains in `/private/tmp/jg-dbsrc-03-db-unit.log`; it is not counted as green evidence. A process-list diagnostic was denied by the sandbox; no permission escalation was attempted.

Full `pnpm test` was not invoked: it starts prohibited local database/HTTP suites and the lane-tool tests execute Git-writing commands in temporary repositories. The full mandatory suites remain dispatcher/CI work. No mandatory test was weakened, skipped in repository configuration, made optional or re-pinned. Command-line sandbox exclusions are listed above.

Canonical lane-floor invocation `python3 /Users/benharwood/.local/share/full-steam/lane-floor.py jobguard . origin/main HEAD` reported GREEN/0 paths because the endpoints are identical before commit; that is **not usable diff evidence**. A supplemental working-tree application of the same external path matcher gives AMBER; money and tenancy raise this task to RED. The dispatcher must rerun the canonical floor on the eventual commit.

Exact registry addition (before: absent; after: this single compact line; all old entries unchanged):

```json
"audit-fix-dbsrc-03":{"branches":["codex/sandbox/audit-fix-dbsrc-03"],"receipt":"docs/verdicts/AUDIT-FIX-DBSRC-03/BUILDER_RECEIPT.md","note":"Four blocking dbsrc-03 repairs only; RED money and tenancy. C1: existing billing service and home read only; no new web workflow, migration or grant. Existing tests and protected auth pins unchanged. Shared lane registry serializes with dispatcher.","allow":["config/agent-lane-assignments.json","packages/db/src/customer-billing-repository.ts","packages/db/src/demo-runtime.ts","packages/db/test/audit-dbsrc-03.test.ts","packages/db/test/audit-dbsrc-03.integration.test.ts","docs/verdicts/AUDIT-FIX-DBSRC-03/BUILDER_RECEIPT.md"]},
```

After committing/pushing, the dispatcher must run on the Mac or GitHub CI:

```sh
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm typecheck
pnpm build
pnpm openapi:check
pnpm test
pnpm test:db
pnpm test:migrations
pnpm test:e2e
python3 /Users/benharwood/.local/share/full-steam/lane-floor.py jobguard . origin/main HEAD
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-dbsrc-03.integration.test.ts test/final-account.integration.test.ts test/workspace-read.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src/audit-checkpoint-handoff.test.ts
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop customer-invoice.spec.ts UIWIRE-10.spec.ts UIWIRE-11.spec.ts UIWIRE-12.spec.ts SBOX-resume.spec.ts SBOX-SESSION-1.spec.ts
```

Full API coverage must restore the excluded HTTP/database suites. C-OPS-1 still needs an unchanged successful run or a separately issued repair; this task does not alter its limit or assertion. No new live-model evaluation is applicable because the repair changes no AI behavior/schema. G1/provider/commercial/tax approvals and production capabilities remain under their existing gates.

Intended conventional commit subject/body: `/private/tmp/jg-msg-audit-fix-dbsrc-03.txt`. Builder work is ready for dispatcher review, but technical acceptance remains HOLD until the required runtime evidence and two independent RED checks plus separate acceptance are recorded against the final commit.
