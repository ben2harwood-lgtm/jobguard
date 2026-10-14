# AUDIT-FIX-API-VALUE builder receipt

Issued 13 October 2026 by dispatcher 4. Branch: `codex/sandbox/audit-fix-api-value`. Base and unchanged HEAD: `e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4` (`origin/main`). Work is uncommitted for the dispatcher. No Git-writing command was run.

**Check lane: RED**, because this changes displayed approved money. The path map alone classifies value code AMBER; the money rule raises it to RED. No independent model verdict or separate acceptance is claimed. Acceptance remains on hold for the dispatcher/CI runs and a verdict bound to the eventual commit.

Read: repository `AGENTS.md`, BUILD_PLAN §§2, 5.1–5.2, 5.4–5.5, §7's built VALUE-1 record, CH-9 and its future dependency entry, current value/variation/session contracts and implementations, and `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-value.md`. CH-9's future product is outside this repair.

## Blocking finding and test-first evidence

**Finding 1 — FIXED in source; real PostgreSQL verification pending.** Proposed repricing hid the previous immutable approved amount.

Before changing production code, added `apps/api/src/value/value.application.test.ts` and the companion `packages/db/test/audit-api-value.integration.test.ts`. Ran this from `apps/api`:

```sh
node node_modules/vitest/vitest.mjs run src/value/value.application.test.ts
```

Result: **2 tests failed**, both at the preservation assertion (test line 42 at that point). After approving v1 for 12,500p and moving the working pointer to an unapproved 15,000p v2, expected `{pence:12500,basis:'net',sources:[v1]}`; received `{pence:null,basis:'net',sources:[]}`. The addition and omission cases failed for the audit's expected reason. This was an in-memory query-double reproduction, not PostgreSQL execution. The double explicitly recognizes the old current-revision join and the new variation-history join; it does not claim general SQL fidelity.

Then changed only the value projection: read revision history through the tenant-qualified variation identity, mark the current working revision, select the highest **approved** revision number once per variation, and list only current unapproved positive revisions as pending. Approval of v2 replaces v1's displayed amount/source rather than adding both. Existing authentication, ownership checks, response schema, invoice/receipt arithmetic, commercial commands, database privileges and persistence are unchanged.

The same two tests then passed. Added two further adversarial cases for unordered history, multiple variations, direction changes, unknown unapproved amounts, and obsolete unapproved revisions. Final unit coverage has four new tests; no existing test was edited.

The new integration suite uses the real practice-session issuer's session-owned live home fixture and real propose/approve/revise commands for additions and omissions. It checks 12,500p/v1 while v2 is pending, then 15,000p/v2 counted once, both retained approval rows, and stranger-session refusal with populated financial facts. It runs as the existing non-superuser/non-BYPASSRLS runtime role in a disposable synthetic cluster. Only that test cluster enables LOGIN on the existing role; there is **no new GRANT**, production permission change, trigger bypass, or migration. Standard F for a new grant is therefore inapplicable. The integration test has been statically typechecked; it has **not** been executed here.

**DROPPED:** none; the sole BLOCKING finding was reproduced.

## Scope and preservation

- Invariants: AGENTS §§5.1, 5.2, 5.5, 5.9; BUILD_PLAN §5.2's immutable commercial revisions. The same job, variation and revision identities remain authoritative.
- No migration, backfill, rollback procedure, new external action, provider route, environment variable, operational alert, prompt/model/extraction/matching change, fee policy, or production activation. Existing response shape is compatible; approved totals now remain visible while a replacement price awaits approval. C1: existing value workflow only, no new UI or route.
- No existing expected value, refusal, count, pinned name, fingerprint, catalogue row or test setup was changed. `apps/api/src/auth/context-boundary.test.ts` and its pinned lists are byte-identical to origin/main (SHA-256 `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`). No STOP condition was encountered.
- No premise setup was inserted into an existing test. New integration fixtures use the established session issuer and a new scope row before the unchanged commercial command path.
- The shared registry edit must serialize with other dispatched registry edits. Its only addition is this new lane; all prior lane entries remain identical.

Catalogue before: `audit-fix-api-value` absent. Catalogue after: one compact line in `config/agent-lane-assignments.json`:

```json
"audit-fix-api-value":{"branches":["codex/sandbox/audit-fix-api-value"],"receipt":"docs/verdicts/AUDIT-FIX-API-VALUE/BUILDER_RECEIPT.md","note":"AUDIT-FIX-API-VALUE: preserve latest approved variation money during unapproved repricing. RED money review. C1: existing read projection only; no new UI, migration or grant. Existing assertions and protected auth pins unchanged. Shared lane registry serializes with coordinator.","allow":["config/agent-lane-assignments.json","apps/api/src/value/value.application.ts","apps/api/src/value/value.application.test.ts","packages/db/test/audit-api-value.integration.test.ts","docs/verdicts/AUDIT-FIX-API-VALUE/BUILDER_RECEIPT.md"]},
```

## Checks actually run

Runtime: Node `v24.17.0`; pnpm `10.28.1`, invoked from its preinstalled store executable with `/private/tmp/jg-audit-api-value-bin` prepended to PATH for nested scripts. Dependencies were already installed; no install command was used. The default pnpm wrapper hung during version discovery and was interrupted. Logs are `/private/tmp/jg-api-value-*.log`.

| Command / check | Result |
| --- | --- |
| New value regression, before fix | FAIL as expected: 2/2, 12,500p became null and v1 sources disappeared |
| Same new regression, immediately after fix | PASS: 2/2; two additional cases subsequently added |
| `LANE_BASE_REF=origin/main pnpm typecheck` | PASS: 7 workspace tasks, 4 cached; API/db/web executed |
| `LANE_BASE_REF=origin/main pnpm typecheck --force` | PASS: all 7 workspace tasks executed, 0 cached |
| Integration-test temporary TypeScript project, `node node_modules/typescript/bin/tsc -p /private/tmp/jg-api-value-test-tsconfig.json` | PASS; static typing only, no database |
| `LANE_BASE_REF=origin/main pnpm lint` and `pnpm lint:lanes` | BLOCKED: `Missing branch or self-comparison range; refusing a misleading pass.` HEAD equals origin/main until dispatcher commits; guard unchanged |
| `pnpm turbo run lint` | PASS: 7 workspace tasks, 4 cached |
| `node tools/core-purity-lint.mjs` (through root lint), `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` | PASS |
| Supplemental working-tree lane allowlist and prior-registry comparison; lane-floor.py matcher over working-tree paths | PASS: exact allowlist equals all 5 changed paths, prior entries unchanged; path floor AMBER raised to RED for money. Not a replacement for committed lint:lanes/lane-floor |
| `LANE_BASE_REF=origin/main pnpm build` | PASS: 7 tasks, 4 cached; API/db/web built. Existing CSS warnings and sandbox Turbo IO warnings reported |
| `pnpm openapi:check` | BLOCKED by tsx CLI IPC `listen EPERM` |
| Same generator via `node --import tsx src/generate-openapi.ts --check` in apps/api, after package builds | PASS; committed OpenAPI unchanged. Earlier loader attempt encountered stale pre-build DB exports |
| Node tests: core-purity, dependency-audit, decision-check-purity, decision-records, shared-money-origin, policy-gate-sites, commercial-boundary | PASS: 19 tests |
| API source tests with bounded workers and socket/database exclusions | PASS: 64 files, 1,555 tests, including all 4 new value regressions and the unchanged protected context-boundary tests |
| DB unit tests, `src` plus recovery-case-join, site-extra-evidence-compatibility, recovery-message-repository, recovery-case-outcome, audit-api-capture, verify-audit-export-cli, contractor-session-context, verify-evidence-pack-cli; `--maxWorkers=1` | 166 passed; unchanged audit-checkpoint-handoff C-OPS-1 test timed out at its existing 5-second limit. Focused rerun also timed out; unresolved, no timeout or assertion changed |
| Core source unit suite, `vitest run src --maxWorkers=2` | 2,444 passed; existing receipt-allocation working-size test timed out. Focused unchanged rerun `--maxWorkers=1 -t 'the working size is bounded'` PASS (1 test, 33 unselected) |
| Config/storage tests through forced filtered Turbo run | PASS: 2 config tests, 4 storage tests (source and built copies) |
| AI `vitest run src --maxWorkers=1` and web `vitest run --maxWorkers=1` | PASS: AI 80 tests in 5 files; web 784 tests in 33 files |
| `git diff --check` | PASS |

Initial broad unit attempts encountered stale built DB exports and heavy-load timeouts; rebuilt dependencies before rerunning. The broad filtered Turbo attempt also discovered built-copy/source-inspection failures; source-only core rerun is reported separately above. These initial attempts are not represented as green runs. A subsequent API run had 1,557 passing tests and 1 existing skipped test, but suite collection failed when `final-account-lock.isolation.test.ts` imported its PostgreSQL fixture and could not bind a port; no PostgreSQL process was started. That suite was then excluded along with health, SSO action-path HTTP, shadow-isolation and contractor HTTP suites for the sandbox-safe API run: `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2 --exclude src/health.test.ts --exclude src/auth/sso/action-paths.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/final-account-lock.isolation.test.ts --exclude 'src/contractor/*.http.test.ts'`. Test expectations and timeouts were never relaxed.

Full `pnpm test` was not invoked: it starts mandatory PostgreSQL/HTTP suites and its lane tooling tests create/commit temporary Git repositories, forbidden by this work order. Neither PostgreSQL nor a browser was started. The full mandatory suites remain required.

## Dispatcher / Mac or GitHub CI runs required

After committing, rerun `LANE_BASE_REF=origin/main pnpm lint`, `pnpm lint:lanes`, `pnpm typecheck`, `pnpm build`, and normal `pnpm openapi:check`. Run full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, and `pnpm test:e2e`; in particular:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-api-value.integration.test.ts
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop VALUE-1.spec.ts MON-7.spec.ts SBOX-SESSION-1.spec.ts
```

The full API run must include the excluded port/database suites, including `final-account-lock.isolation.test.ts`. Recheck the unchanged C-OPS-1 timeout on the Mac/CI without editing its assertion or timeout. No new live-model evaluation is applicable because this repair changes neither AI behavior nor an AI boundary schema. No real data, spending, release or commercial approval occurred.

## LATER findings — listed only, unimplemented

1. Rejected current variation revisions still appear in `pendingExtras` as awaiting approval. Follow-up named test: `value excludes rejected extras from pending`.
2. Receipt and outstanding outcomes cite invoice identities, and an invoice without receipts reports recorded zero with an invoice source rather than an unknown/no-receipt-source outcome. Follow-up named test: `receipt and balance outcomes identify their contributing facts`.

The report's five suggestions to strengthen VALUE-1, MON-7, practice-session ownership, actual HTTP transport and populated SBOX-SESSION-1 provenance/isolation coverage are follow-up work; those existing tests were not edited.

Intended conventional commit subject/body: `/private/tmp/jg-msg-audit-fix-api-value.txt`. Builder evidence is source inspection and the execution explicitly recorded here; it is not an independent review or technical acceptance.
