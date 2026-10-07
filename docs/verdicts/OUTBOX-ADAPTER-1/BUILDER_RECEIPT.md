# OUTBOX-ADAPTER-1 builder run receipt

Date: 7 October 2026. Branch: `codex/sandbox/outbox-adapter-1`.
Inspected baseline: `HEAD` and `origin/main` both `a5ed99a8f7b4e76925c35297dda0d06d6f8834ab`.
Delivery is an uncommitted working-tree diff; the dispatcher owns commit/push.
Builder evidence only: technical acceptance is **HOLD** pending CI and an independent verdict bound to the resulting commit. No independent model review or separate acceptance is claimed.

## Change and scope

The first edit appended exactly one `outbox-adapter-1` lane, with exact changed code/test paths, the lane file, and `docs/verdicts/OUTBOX-ADAPTER-1/**`. Existing lanes are unchanged.

`ActionExecutor.execute` now checks `this.adapters.has(row.adapter)` immediately after its existing authorized `SELECT ... FOR UPDATE OF o`. An executor without that adapter returns before status handling, telemetry, attempt counting/insertion or delivery. Pending unsupported work remains pending for its owning executor. The existing adapter lookup/delivery, supported-adapter behavior, authorization query, tenant transaction, lock order, audit facts and unknown-outcome reconciliation are unchanged. `worker.ts` is unchanged.

Tests were written before changing production code:

- `packages/db/src/outbox.test.ts`: four service cases using the actual executor and tenant transaction wrapper with a stubbed SQL client. Unsupported pending, expired-pending, retryable and stale-executing rows perform only transaction setup, the existing locked read and commit; no mutation/attempt/audit SQL, adapter call or telemetry occurs. This is unit evidence, not proof of PostgreSQL guarantees.
- `packages/db/test/outbox.integration.test.ts`: uses the existing embedded PostgreSQL 16.10 harness, migration-created ownership/policies and actual runtime/infrastructure login roles. A committed, signalled `fake_quote_delivery` action is offered twice to a `fake_capture`-only executor. Full row and attempt/audit snapshots stay identical. A second executor registering `fake_quote_delivery` runs concurrently with duplicate owner calls and the generic executor, then replays; assertions require one synthetic adapter invocation, one succeeded attempt and the exact approved action. Existing assertions were retained.

No migration, data backfill, schema/grant/RLS change, new external action, provider configuration, UI change or operational alert. Compatibility: unsupported execution now resolves without claiming instead of throwing after a claim. Rollback is a code revert, which would restore the original defect; no database rollback is needed. Historical stranded rows are outside this fix's scope.

## Environment and commands

Dependencies were already installed; no package install/download command was run. Node is `v24.17.0`, pinned cached pnpm is `10.28.1`, Vitest is `4.1.11`. Commands below used `PATH=/private/tmp/jg-outbox-adapter-1-bin:$PATH`, where a temporary symlink selects the already installed pnpm 10.28.1 binary. An initial global `pnpm --version` stalled and was interrupted (exit 130); the cached pinned binary's `--version` returned 0 and `10.28.1`. No dependency files changed.

Turborepo replayed cached results for unchanged packages (including unchanged core/config/storage/AI tests); receipt distinguishes those from newly executed regressions. It warned about restricted shared-cache writes without failing the successful commands.

| Command | Exit | Actual result |
| --- | ---: | --- |
| `pnpm --filter @jobguard/db exec vitest run src/outbox.test.ts` (initial fixture construction, unchanged executor) | 1 | Four failures; incomplete row fixture was corrected before production code changed. |
| `pnpm --filter @jobguard/db exec vitest run src/outbox.test.ts` (complete fixture, unchanged main executor) | 1 | Four failures: pending/retryable reject with `FAKE_ADAPTER_NOT_REGISTERED`; expired/stale cases attempt forbidden status changes. This is the demonstrated red run on main code. |
| `pnpm --filter @jobguard/db exec vitest run src/outbox.test.ts` (after fix) | 0 | Four regression cases pass. |
| `pnpm typecheck` | 0 | Seven packages pass; four cached. |
| `pnpm build` | 0 | Seven packages pass; four cached. Next production compilation, type validation, static-page generation and tracing complete. Existing CSS/workspace-root warnings do not fail the build. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passes; official lane check rejects `HEAD == origin/main` before package lint. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same fail-closed self-comparison rejection in this uncommitted worktree. Checker unchanged. |
| `pnpm turbo run lint` | 0 | All seven package lint checks pass; four cached. |
| `node tools/money-arithmetic-lint.mjs && node tools/commercial-boundary-lint.mjs` | 0 | Both remaining boundary checks pass. |
| `pnpm test --filter='!@jobguard/db'` | 1 | All 42 tool tests pass; unchanged core/config/storage/AI suites replay cached passes. API has 107 passing tests and one health test failure/unhandled `listen EPERM` because localhost binding is forbidden. Turbo stops before web tests. DB integration execution was deliberately excluded per dispatch instructions. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --exclude '**/*.integration.test.ts'` | 0 | All three runnable unit files / 11 tests pass. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` | 0 | All 14 service/unit files / 107 tests pass. The mandatory health test remains blocked; no assertion/configuration was weakened. |
| `pnpm --filter @jobguard/web test` | 0 | Eight unit files / 63 tests pass. |
| `pnpm openapi:check` | 1 | `tsx` CLI cannot bind its Unix IPC socket (`listen EPERM`); generator does not run through that wrapper. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same OpenAPI generator/check passes using Node's import hook without the CLI IPC listener. |
| `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-outbox-adapter-1-tests.tsconfig.json` | 0 | Supplemental strict no-emit check of both new test files, including the PostgreSQL integration file excluded from the ordinary DB source tsconfig. Temporary config extends the existing DB tsconfig. |
| Supplemental `node --input-type=module` lane inspection, then `node /private/tmp/jg-outbox-adapter-1-lane-check.mjs` after receipt creation | 0 | Using unchanged exported `selectLane`/`matches`, verified exactly one added lane, identical prior lanes/version, and every changed/untracked repository path allowed. This is not an official lane-check pass. |
| `git diff --check` | 0 | No whitespace errors. |

## Not run and remaining gates

- Real PostgreSQL regression, `pnpm test:db`, `pnpm test:migrations`, unfiltered `pnpm test` and existing outbox/quote-delivery/worker/database regressions were not run: dispatcher explicitly says this sandbox cannot start PostgreSQL or bind localhost. **The new DB test runs in GitHub CI after the dispatcher pushes.** Its red result on main and green result after the fix are not locally claimed. Existing suites and assertions are unchanged and still mandatory.
- Browser suites were not run: the sandbox forbids their database/server sockets; this database-only leaf changes no UI. CI preserves prior browser checks. No native suite applies.
- Clean install was not repeated because the dispatcher supplies installed dependencies and forbids downloads.
- No live providers, real sends, payment/spending, production mode, repository decision approvals or live-model evaluation. All fixture actions are synthetic fake adapters. No prompt/model/parser changes require a new evaluation gate; cached unchanged AI fixture tests are not a live-model evaluation.
- Official lint/lane check, complete tests, normal OpenAPI wrapper and remaining CI checks must pass after dispatcher commit. No checker, script, test assertion or release gate was weakened to hide sandbox failures.
- Independent Claude verdict and separate technical acceptance remain pending for the exact dispatcher-created commit. No commit, staging, checkout, push, merge or PR was performed in this repository. Tool-suite lane fixtures use their existing disposable temporary Git repositories.
- Intended conventional commit subject/body is `/private/tmp/jg-msg-outbox-adapter-1.txt`.

## Invariants / inherited criteria

- AGENTS §§5.1, 5.3, 5.4, 5.7: existing tenant-scoped role/authorization read and lock stay in place; unsupported adapters cannot create a claim, attempt or audit fact. Supported delivery stays after transaction commit. Existing audit behavior is identical.
- C1/C2: complete database/service fix with unit and integration coverage using the existing executor seam; no API boundary or UI needed.
- C3: synthetic fixtures/fake adapters only; environment/production gates unchanged.
- C4: no money, schema, privilege or RLS changes; PostgreSQL evidence pending CI.
- C5: the adapter check precedes every status mutation; duplicate/concurrent owning execution is covered by the DB regression. Existing authorization, replay and unknown-outcome reconciliation paths remain intact. An unknown result is never relabelled success or blindly retried.
- C6: unit execution and test typechecking recorded above; real PostgreSQL coverage written, execution held for CI, without mock substitution for its guarantees.
- C7: not applicable; no web workflow/UI change.
- C8: narrow append-only lane; mandatory checks preserved. Official lane check and socket-dependent suites await CI; independent recorded verdict/technical acceptance remain HOLD.

## Round 2

Date: 7 October 2026. PR #112 follow-up on `codex/sandbox/outbox-adapter-1`.
Round-1 baseline: `52c19dd1d6d07ad20b2391985dee2500dda94670`; local `origin/main`: `a5ed99a8f7b4e76925c35297dda0d06d6f8834ab`.
Delivery is an uncommitted working-tree diff for the dispatcher to commit. Round 1 and its receipt above are preserved.

### Change and regression evidence

The only production-code change is the attempt UPDATE parameter in `ActionExecutor.execute`: an outbox status of `dead_letter` maps to attempt outcome `failed`, preserving the adapter's error code. The outbox row still becomes `dead_letter`. Every other status/outcome mapping, telemetry event, authorization query, adapter ownership guard, transaction boundary and lock order is identical. No migration or CHECK change; `0006_outbox.sql` and the existing lane are byte-for-byte unchanged.

Both regressions were written before the fix. The new unit case failed on round-1 code (four existing cases passed): the actual attempt UPDATE supplied `dead_letter` where `failed` was expected. It passes after the fix and also asserts the terminal outbox status, adapter error code and unchanged telemetry sequence.

The new real-PostgreSQL case uses the existing migrated PostgreSQL 16.10 harness and runtime role, driving five synthetic retryable deliveries through the actual executor. It asserts four `retryable` attempts, then outbox `dead_letter` / fifth attempt `failed`, preserved error codes, finalized attempts, no stranded `executing` row or `started` attempt for the action, and no sixth delivery on replay. **This DB case runs in GitHub CI through the existing `pnpm test` step** (`@jobguard/db` runs unfiltered Vitest); no workflow change is needed. Its red/green PostgreSQL execution was not possible locally and is not claimed.

No schema, grants, RLS, provider configuration, money policy, UI, new external action or alert changes. No data migration/backfill; rollback is a code revert, which restores the retry-exhaustion defect. Repairing historical stranded actions is outside this change.

### Commands and exit codes

Dependencies were already installed; no install/download was attempted. Commands used `PATH=/private/tmp/jg-outbox-adapter-1-bin:$PATH` to select cached pinned pnpm `10.28.1`; Node is `v24.17.0`. Turborepo replayed cached passes for unchanged packages and warned about restricted shared-cache writes.

| Command | Exit | Actual result |
| --- | ---: | --- |
| `pnpm --filter @jobguard/db exec vitest run src/outbox.test.ts` (tests first, round-1 executor) | 1 | New fifth-retry case fails on the attempt UPDATE parameter; four round-1 cases pass. |
| Same command after fix | 0 | All five source cases pass. |
| `pnpm typecheck` | 0 | Seven packages pass; four cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Boundary checks and seven package lint checks pass; four package checks cached. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Existing outbox-adapter-1 lane passes without widening. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --exclude '**/*.integration.test.ts'` | 0 | Five runnable unit files / 19 tests pass; discovered source and existing compiled unit files included. |
| `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-outbox-adapter-1-tests.tsconfig.json` | 0 | Strict no-emit check includes both changed test files, including the PostgreSQL integration file excluded from normal source typechecking. |
| `pnpm test --filter='!@jobguard/db'` | 1 | All 42 tool tests and 107 API tests pass; health test fails with localhost `listen EPERM`. Unchanged core/config/storage/AI test passes are cached; Turbo stops before web tests. DB execution deliberately excluded per dispatcher. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` | 0 | 14 files / 107 socket-free service/unit tests pass; mandatory health test remains unchanged. |
| `pnpm --filter @jobguard/web test` | 0 | Eight unit files / 63 tests pass. |
| `pnpm build` | 0 | Seven packages pass; four cached. Next production compilation, type validation, static pages and tracing complete; existing workspace-root warning does not fail the build. |
| `pnpm openapi:check` | 1 | Existing tsx wrapper cannot bind its Unix IPC socket (`listen EPERM`). |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same OpenAPI generator/check passes without the CLI IPC listener. |
| `python3 /private/tmp/jg-outbox-adapter-1-round2-preservation.py` | 0 | Exact one-parameter executor diff; round-1 tests/receipt preserved, existing integration assertions unchanged, lane and 0006 unchanged. |
| `git diff --check` | 0 | No whitespace errors. |

### Not run and remaining gates

- Real PostgreSQL tests, `pnpm test:db`, `pnpm test:migrations`, unfiltered `pnpm test` and browser suites were not run because the dispatcher states this sandbox cannot start PostgreSQL or bind localhost. They remain mandatory in GitHub CI after dispatcher push, including the new DB regression; no suite or assertion was weakened.
- Clean install was not repeated because downloads are forbidden and dependencies were supplied. No native changes or prompt/model/parser changes require native or new evaluation runs.
- Synthetic fixtures and fake adapters only. No live provider, real send, spending, production mode, real decision approval, live-model evaluation or policy approval was performed.
- Independent commit-bound verdict and separate technical acceptance remain **HOLD** pending dispatcher commit and CI/review evidence. This receipt is builder/test evidence, not independent verification.
- No repository staging, commit, checkout, push, merge or PR creation was performed. Existing tool tests use disposable temporary Git repositories. Intended conventional commit subject and body are written to `/private/tmp/jg-msg-outbox-adapter-1.txt`.

Affected invariants: AGENTS §§5.1, 5.3, 5.4 and 5.7 retain the existing tenant/authorization boundaries, durable attempt history, retry behavior and audit/lock ordering. This change lets the terminal known-failure result transaction satisfy the existing attempt constraint without changing unknown-outcome reconciliation.
