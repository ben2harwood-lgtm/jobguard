# M4-2-S repair — builder receipt

Date: 2026-09-27. Builder: Codex. **This is implementation/test evidence, not an independent verdict or technical acceptance.**

Branch: `codex/sandbox/m4-2-s-repair`; base: `694e9e1755f2a5680898eb0fa04af48afd66c86b`.
Implementation head: `707d0bfa953802fd14124a405c33124d91172d77` (this receipt is committed separately).
Scope: exact R1–R4 repairs in `docs/verdicts/M4-2-S/be81bd5.md`, under BUILD_PLAN §30 and §13.2 C1–C8. Original reviewed head: `be81bd5ce92a8c79a91b6575271d0496a2c77970`, PR #85. No push or new PR.

## Changes and boundaries

- R2: approval checks revisions first, then requires the latest status to be `reviewed`. Current-revision approval of `superseded` or already `approved` rows fails with typed `ELIGIBILITY_REVIEW_REQUIRED`. Both Nest and Next return 409 and `Review the changed evidence before approving`, matching the stale-revision recovery message. Exact idempotent replay remains allowed after checking current authority.
- R3: the shared application passes the server-selected synthetic membership/identity, replacing the `practice-owner` reviewer literal. The repository checks the persisted same-tenant owner membership, identity, revocation and expiry inside the write transaction, holding a share lock through commit. The resulting `membership:<id>` is recorded in the immutable review and audit event, including approvals. Missing/malformed session and non-synthetic modes fail closed for this eligibility application path.
- This remains the existing synthetic principal bridge, not a new real-user authentication system: a valid-format practice session selects the seeded demo principal, whose recorded membership must be active. It does not establish a production authenticated identity or repair unrelated application authentication paths.
- R4: eligible wording is now `Synthetic scenario cites evidence attributing customer money to this claim; settlement is not verified`. Client-selected scenarios remain reference simulations, not evidence-object verification or settlement facts. No eligibility/category/money formula changes.
- R1: DB and both browser projects were attempted; sandbox restrictions prevent live execution (below). No execution evidence is invented.
- No migration needed; existing membership and append-only review/audit fields suffice. Migration 0047 remains unused. No grant, RLS, role, posting routine, production D03 policy, provider, fee, landing or global-banner change. No external actions or new alerts. Rollback is an application revert; existing review rows remain readable, and old reviewer strings are not rewritten.
- Routes and request schemas are unchanged: `POST /api/jobs/:id/recovery-cases/eligibility` delegates to the same application as Nest `POST /jobs/:id/recovery-cases/eligibility`. Nest now forwards the practice session cookie and maps re-review/authorization errors. OpenAPI generation comparison passes without changing `apps/api/openapi.json`.

## Tests first and local commits

The resumed worktree already contained lane/verdict commit `1a335e6` and tests-first commit `dedca4c`, plus five uncommitted implementation files. Those changes were inspected and completed, not discarded.

Prior-run logs preserved in `/private/tmp/jobguard-m4-2-s-logs/` show the wording test failing (1 failed / 8 passed) and all five application regressions failing before implementation. The original DB red attempt was blocked at initdb; no DB red/green assertion is claimed.

DB regressions now cover current-revision approvals after evidence, case and policy supersession; re-review then approval; repeat approval versus exact replay; unchanged review/audit after rejection; recorded reviewer/audit identity; missing membership, wrong identity/tenant, non-owner, revoked and expired membership, including revoked replay. Browser regression bypasses the disabled UI with current revisions, expects the typed 409, reloads/opens another page to verify persisted supersession, then re-reviews and approves. API tests cover session/mode refusal, server-selected membership and Nest conflict mapping. Existing tests were not weakened.

Implementation commits:
- `ff3b63d`: synthetic classifier wording.
- `707d0bf`: approval status, recorded membership, adapter handling and additional regression coverage.

## Commands actually run

Runtime: Node `v24.17.0`, pinned pnpm `10.28.1` via `PATH=/private/tmp/jobguard-m4-2-s-bin:$PATH`. Existing installed dependencies were reused; a fresh clean install is **not** claimed. An unrelated pnpm wrapper initially attempted version management; its untracked `.pnpm-store` was preserved outside the worktree at `/private/tmp/jobguard-m4-2-s-unpinned-store-resume`.

Logs below are local files under `/private/tmp/jobguard-m4-2-s-logs/`.

| Command | Result | Log |
|---|---|---|
| `pnpm -r build` | PASS, exit 0; production Next build completed | `build-resume.log` |
| `pnpm test` | NOT GREEN, exit 1; tool tests 39/39; core run hit worker startup timeouts and an inbox test timeout; stopped before remaining workspace suites | `test-resume.log` |
| `pnpm test:db` | NOT GREEN, exit 1; DB assertions NOT RUN where initdb failed; runner: 31 failed files / 2 passed, 1 failed test / 15 passed / 135 skipped, plus 1 worker error. Restore test also hit socket EPERM | `db-resume.log` |
| `CI=1 DEBUG=jobguard:e2e-db pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-2-S.spec.ts` | NOT RUN in either project; exit 1 before browser tests because production Next server could not bind port 3000 | `e2e-resume.log` |
| `pnpm lint` | PASS, exit 0; deterministic guards and all seven workspace lint tasks | `lint-resume.log` |
| `pnpm lint:lanes` | PASS, correct `m4-2-s-repair` lane against base 694e9e1 | `lanes-resume.log`, `lanes-final.log` |
| `pnpm typecheck` | PASS, exit 0; all seven workspace tasks | `typecheck-resume.log` |
| `pnpm openapi:check` | Wrapper blocked, exit 1: tsx IPC socket EPERM | `openapi-resume.log` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS, exit 0; same generator/check without tsx CLI IPC listener | `openapi-node.log` |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1` | PASS, 68 files / 326 tests (includes compiled and source test files) | `core-single-worker.log` |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1` | NOT GREEN, 82 passed / 1 failed; unchanged health test cannot bind a socket | `api-all-single-worker.log` |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-case.application.test.ts src/recovery-case.controller.test.ts --maxWorkers=1` | PASS, 2 files / 8 tests | `api-repair-final.log` |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-cases.integration.test.ts` | NOT RUN after library aliases restored; initdb failure, all 8 tests skipped | `db-repair-hydrated.log` |
| `pnpm test:migrations` | NOT RUN, exit 1 at initdb; both files failed setup, all 11 tests skipped | `migrations-resume.log` |
| `git diff --check` | PASS | terminal |

## Exact environment blocks

Hydrated dylibs existed but local aliases were missing. Added aliases only in ignored node_modules for `libzstd.1.dylib`, `liblz4.1.dylib`, `libz.1.dylib`, and `libicui18n.dylib` to their existing versioned binaries. The loader then reached Postgres initialization; direct initdb diagnostic (`initdb-ready.log`) failed with:

```text
FATAL:  could not create shared memory segment: Operation not permitted
DETAIL:  Failed system call was shmget(key=110542563, size=56, 03600).
child process exited with exit code 1
```

The DB harness reports:

```text
Postgres init script exited with code 1. Please check the logs for extra info. The data directory might already exist.
```

Playwright server startup:

```text
Error: listen EPERM: operation not permitted 127.0.0.1:3000
Error: Process from config.webServer was not able to start. Exit code: 1
```

OpenAPI CLI wrapper:

```text
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/35180.pipe
```

The API health test reports `TypeError: Cannot read properties of null (reading 'port')` accompanied by `Error: listen EPERM: operation not permitted 0.0.0.0`. The initial full core run reports `Error: [vitest-pool]: Timeout starting forks runner.` and `Test timed out in 5000ms.`; the complete single-worker core rerun passed without weakening tests.

## Remaining evidence and acceptance

R2–R4 are implemented and source-inspected. R1 execution evidence remains blocked: rerun the real DB suite and both browser projects on a host permitting Postgres shared memory and local listeners. No screenshots/traces or rendered UI acceptance are claimed because browser tests never started. No clean-install, full-regression, independent-review, technical-acceptance, merge or release claim. The original HOLD is not superseded by this builder receipt. A different-model verdict bound to the final diff and separate technical acceptance remain required under AGENTS §5.13 and C8; no reviewer was impersonated or approval inferred.
