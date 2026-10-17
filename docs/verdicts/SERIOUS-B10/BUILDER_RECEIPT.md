# SERIOUS-B10 builder receipt — STOP / HOLD

17 October 2026; dispatcher 14; ruling 85, L054; BUILD-DON'T-MERGE under decision 74. Branch `codex/sandbox/serious-b10`; initial HEAD and supplied `origin/main` both `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`. Builder evidence only. No commit, push, merge, independent verdict, acceptance or release is claimed.

## Required stop

The broader DB source unit run broke the existing **demoted approver cannot execute queued sends** test at `packages/db/src/audit-fix-dbsrc-08.test.ts:79` (executor invocation at line 88). Its SQL protocol double throws `Unexpected SQL` for the new cancellation UPDATE because the new SQL string begins with a newline, while this double accepts UPDATE statements with `sql.startsWith("UPDATE ")`. The generated `dist/audit-fix-dbsrc-08.test.js` copy failed for the same reason. No existing test, expectation or configuration was edited. Implementation and further test work stopped immediately after inspecting this failure, as expressly ordered. The current patch is **not accepted or ready to merge**; no repair was attempted after the stop.

Failure log: `/private/tmp/jg-b10-db-unit-final.log`. Reported result: 17 files passed, 2 failed; 141 tests passed, 2 failed. These counts include emitted test copies: Vitest's `src` filter also matches `dbsrc` in the emitted filename. They are not a distinct-test total.

## Built working-tree changes

- `packages/db/src/outbox.ts`: add a tenant/member-qualified exclusion for `app.contractor_membership_revocation` to the existing dispatch authority lookup. When no authorized action is found, a guarded UPDATE cancels only pending/retryable work owned by the executor's registered adapters if its authorization or authorizing membership was revoked. Return `{ kind: "cancelled", code: "AUTHORIZATION_REVOKED" }`; persist the same reason in an append-only `outbox.authorization_revoked` audit event in the cancellation transaction. No adapter delivery or delivery-attempt insertion occurs on this path. Previously executing, unknown-outcome and completed work is not relabelled by the refusal path. A database/audit error throws and prevents delivery.
- `packages/db/src/serious-b10.test.ts`: four mocked orchestration tests cover typed refusal/audit, invisible work, failed authority reads, and rollback on failed audit persistence. These are not PostgreSQL evidence.
- `packages/db/test/serious-b10-outbox-revocation.integration.test.ts`: copy the actual SSO-linked owner fixture, approved-action helper, active-owner control and L054 contractor-command revocation reproduction from `codex/sandbox/later-b28`, tip `a112be7e83a88a52f70bb16da5257532a081ce30`. Convert the expected-failure case into a normal test in this new file. Its new assertion expects terminal `cancelled` instead of the reproduction's `pending`, to match the requested recorded refusal/no-blind-retry behavior. An optional clarification was raised about that mismatch; no reply had arrived when this receipt was written. The original branch, file and expectations are untouched. Additional PostgreSQL cases cover replay/no retry, audit chain, previously retryable work, direct revocations, unrelated member/tenant isolation, adapter ownership and preservation of prior execution outcomes. Fourteen cases collected, none executed here.
- `config/lanes/serious-b10.json`: exact task branch and exact four other changed paths, including this receipt. Its own lane JSON is implicitly editable and forbidden in `allow` by the existing lane-file validator; no wildcard or shared-register change.
- This receipt. No other tracked source files changed.

Read `AGENTS.md`, `BUILD_PLAN.md` §§2 and 5.3, migration 0150's current-membership/invitation checks, migration 0054's revocation records, existing outbox implementation/tests, and the later-b28 reproduction before implementation. Applicable invariants: tenant-scoped authority, execution-time revocation, immutable approved content, durable terminal refusal, no blind provider retry, append-only audit with its lock acquired last, and no business network call inside a transaction. This is backend execution work with no new web workflow (C1). Shared outbox file ownership remains this piece's dispatcher lane; no unrelated task or shared registry/export edit was undertaken.

No schema migration, new grant, security-definer routine, inventory change, backfill, credential, provider route, live send or commercial-policy change. Reuses existing runtime SELECT/UPDATE permissions and audit machinery. No new operational alert; the new audit event identifies the refusal without recipient or content data. The point-in-time dispatch check does not retract already executing or delivered work. PostgreSQL authorization, tenant isolation, atomic cancellation and real concurrency remain unverified locally. Application rollback would remove the guard; already cancelled actions must not be silently revived and would need fresh authorization.

## Commands actually run

Supplied dependencies reused; no install/download. Node `v24.17.0`, repository `.nvmrc` `24.15.0`; cached pnpm `10.28.1`. pnpm commands used `PATH=/private/tmp/jg-migfix-2-bin:$PATH npm_config_manage_package_manager_versions=false COREPACK_ENABLE_NETWORK=0`. This was not a clean pinned install. Temporary logs are outside the repository.

| Command | Observed result |
| --- | --- |
| `pnpm --filter @jobguard/db exec vitest run src/outbox.test.ts src/serious-b10.test.ts --maxWorkers=1` | Exit 0; 2 files / 9 tests passed, including all unchanged outbox unit tests. `/private/tmp/jg-b10-outbox-unit.log`. |
| `pnpm typecheck --force` | Final exit 0; all 7 tasks executed. `/private/tmp/jg-b10-typecheck-final.log`. |
| `LANE_BASE_REF=origin/main pnpm lint --force` | Exit 1; lane guard refuses identical base/HEAD: `Missing branch or self-comparison range; refusing a misleading pass.` `/private/tmp/jg-b10-lint.log`. Core purity passed before this refusal. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1 from the lane command for the same identical-base refusal. `/private/tmp/jg-b10-lint-lanes.log`. No lint bypass or Git write used. |
| `pnpm exec turbo run lint --force` | Final exit 0; all 7 package checks executed. This does not constitute a passing root/lane check. `/private/tmp/jg-b10-package-lint-final.log`. |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | Completed successfully. |
| `pnpm build --force --concurrency=2` | Final exit 0; all 7 tasks executed, including the Next production build. `/private/tmp/jg-b10-build-final.log`. |
| `node --test tools/*.test.mjs` | Exit 0; 100 passed. `/private/tmp/jg-b10-tools-unit.log`. |
| `node node_modules/typescript/bin/tsc -p /private/tmp/jg-b10-integration-tsconfig.json` | Exit 0; temporary strict no-emit configuration includes the new integration file and its imports. No repository config changed. `/private/tmp/jg-b10-integration-typecheck.log`. |
| `pnpm --filter @jobguard/db exec vitest list test/serious-b10-outbox-revocation.integration.test.ts --json` | Exit 0; 14 tests collected. No hook or database test executed. `/private/tmp/jg-b10-integration-collection.log`. |
| `pnpm openapi:check` | Exit 1; TSX CLI IPC listener refused by sandbox (`listen EPERM`). `/private/tmp/jg-b10-openapi.log`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same generator/snapshot check without TSX CLI's listener. OpenAPI artifact unchanged. `/private/tmp/jg-b10-openapi-node.log`. |
| `pnpm --filter @jobguard/db exec vitest run src --exclude 'test/**' --maxWorkers=1` | Final exit 1; the existing-test failure above triggered the mandatory STOP. `/private/tmp/jg-b10-db-unit-final.log`. |
| `git diff --check` | Exit 0, including after the failure inspection. |

Earlier attempts are retained: initial typecheck/package lint/build reported literal-type widening in the **new** unit test's adapter mocks; those mocks were typed and the subsequent full checks passed. An early DB source run was started before generated workspace dependencies were built and reported package-entry load failures, with 39 tests passing; no existing assertion ran and failed in those unloaded suites. After the build, the next DB unit run produced the existing-test failure above and work stopped. Initial logs: `/private/tmp/jg-b10-typecheck.log`, `/private/tmp/jg-b10-package-lint.log`, `/private/tmp/jg-b10-build.log`, `/private/tmp/jg-b10-db-unit.log`. Turbo cache-write permission warnings and existing CSS build warnings remain in the logs.

## Not run and remaining gates

- **PostgreSQL / new L054 execution: NOT RUN.** Dispatcher prohibits localhost binding/PostgreSQL startup in this sandbox. No attempt to start PostgreSQL or a browser. CI must execute the new test plus unchanged outbox/authorization regressions, `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and applicable browser suites.
- Remaining domain, API and web unit runs were **NOT RUN** after the required existing-test STOP. No claim that the full test suite passes.
- Formal root/lane lint must be rerun after the dispatcher creates an actual task commit distinct from `origin/main`.
- **RED two-model check: NOT RUN / HOLD.** There is no builder commit to bind a verdict to, and no independent model review or separate acceptance is represented by this receipt. Dispatcher must arrange the actual exact-commit reviews and acceptance. Decision 74 still requires PARK and Ben's express merge approval; no automated merge authority is inferred.
- All production, real-data, provider, commercial and release gates remain closed. No approval decision is recorded here.

## Uncommitted artifact identities

SHA-256, captured after the required stop (receipt excluded to avoid a self-reference):

```text
075099d9863ee014d86fe6cbc9e803d3b821ea5ae4847bfe5e8399df9ab249ae  packages/db/src/outbox.ts
e725ce1fa87705775456dd7541f9e00f2a77c455c6d73bc40478d044d96cf00d  packages/db/src/serious-b10.test.ts
c11b4e3a4b713e536ff5b98f9c69e13380605cea4e26782c5a26f393225d9a78  packages/db/test/serious-b10-outbox-revocation.integration.test.ts
0b679bedb3d4c23dfc7a06ee06e777dcd444d8f91c5835a4a9d95b8323f4a1ba  config/lanes/serious-b10.json
```

Intended conventional commit text: `/private/tmp/jg-msg-serious-b10.txt`. Dispatcher owns any commit/push; this handoff remains stopped and parked.

## r1 — cancellation SQL prefix repair (17 October 2026)

Dispatcher 14 explicitly authorized this repair on `codex/sandbox/serious-b10`, starting from dispatcher-created HEAD `46c168937eac306a00ad4cd25b1ad830b7cd3a02`. The earlier STOP above is historical: this round removes only the cancellation query's leading newline/indentation in `packages/db/src/outbox.ts`, so it begins with `UPDATE ` and satisfies the existing double's `sql.startsWith("UPDATE ")` matcher. SQL predicates, parameters and behavior are unchanged. No existing test, new SERIOUS-B10 test, schema, configuration, or other source file was edited. This receipt is appended as requested.

Both specifically requested tests pass without another matcher rejection. The broader DB source run also passes on repeat. These are executed unit/protocol-double checks, not PostgreSQL proof or an independent model verdict. BUILD-DON'T-MERGE remains in force: no Git write, commit, push, merge, acceptance or release performed by this builder.

Dependencies were reused without installation or download. Node `v24.17.0`; cached pnpm `10.28.1` through the previously supplied `/private/tmp/jg-migfix-2-bin/pnpm`. All pnpm checks below used `PATH=/private/tmp/jg-migfix-2-bin:$PATH npm_config_manage_package_manager_versions=false COREPACK_ENABLE_NETWORK=0`. This was not a clean pinned install. Logs are `/private/tmp/jg-b10-r1-<name>.log`.

| Command actually run | Exit / result | Log name |
| --- | --- | --- |
| `pnpm --filter @jobguard/db exec vitest run src/audit-fix-dbsrc-08.test.ts src/serious-b10.test.ts --maxWorkers=1` | 0; 2 files, 9 tests passed. | `targeted` |
| `pnpm typecheck --force` | 0; all 7 tasks executed. | `typecheck` |
| `pnpm build --force --concurrency=2` | 0; all 7 tasks executed, including Next production build. Existing workspace-root, bundling/CSS and Turbo cache-permission warnings are retained in the log. | `build` |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 0; root invariants and all 7 package tasks passed. | `lint` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; SERIOUS-B10 lane passed against actual `origin/main`. | `lint-lanes` |
| `node --test tools/*.test.mjs` | 0; 100 tests passed. | `tools` |
| `pnpm --filter @jobguard/db exec vitest run src --exclude 'dist/**' --exclude 'test/**' --maxWorkers=1` | First exit 1: 137 passed, 1 timed out at the existing `audit-checkpoint-handoff.test.ts:279` 5-second limit during concurrent checks. Exact repeat exit 0: all 18 files / 138 tests passed, with no test or timeout change. | `db-source-unit`, `db-source-unit-repeat` |
| `pnpm --filter @jobguard/{package} exec vitest run --exclude 'dist/**' --maxWorkers=1` (five separate commands: `core`, `config`, `storage`, `ai`, `web`) | Each exit 0: core 111 files / 2,801 tests; config 1 / 1; storage 1 / 2; AI 10 / 113; web 40 / 867. | `{package}-source-units` |
| `pnpm --filter @jobguard/api exec vitest run src --exclude 'dist/**' --exclude 'src/shadow-isolation.application.test.ts' --exclude 'src/health.test.ts' --maxWorkers=1` | 1; 92 files passed, 7 failed; 1,719 tests passed, 128 failed, 1 skipped; 128 unhandled socket errors. HTTP tests hit `listen EPERM` / null server-port errors; `final-account-lock.isolation.test.ts` cannot find a bindable port (`no free port in 58400..58650`). These environment-dependent suites require CI. | `api-units` |
| `pnpm openapi:check` | 1; TSX CLI IPC `listen EPERM` in sandbox. | `openapi` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; same generator and snapshot check without TSX CLI listener; artifact unchanged. | `openapi-node` |
| `git diff --check`; `git diff --exit-code HEAD -- packages/db/src/audit-fix-dbsrc-08.test.ts packages/db/src/serious-b10.test.ts` | 0; whitespace check and both test files unchanged. | read-only checks |

Other attempts are retained truthfully: `pnpm --filter @jobguard/db exec vitest run --include 'src/**/*.test.ts' --maxWorkers=1` exited 1 because this Vitest has no `--include` flag (`db-units`). The corrected command is recorded above. `pnpm exec turbo run test --force --filter='!@jobguard/db' --filter='!@jobguard/api'` exited 1 because emitted core `dist/*.test.js` source-inspection copies try to read nonexistent `dist/*.ts` files (4 files / 5 failures, 5,597 passing tests including emitted duplicates; `units`). The source-only runs above pass; no generated artifact or test configuration was changed to hide the failure. A recursive workspace exec attempt exited 254 with `Command "vitest" not found` (`workspace-source-units`); the five explicit package commands above replaced it. A plain `pnpm --version` invocation stalled and was interrupted (130); subsequent commands used the known cached pinned binary.

Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, the new PostgreSQL SERIOUS-B10 regression and browser suites are deferred to GitHub CI after dispatcher push. No PostgreSQL service or browser was started. Some API tests discovered their own socket/database setup and failed at the bind boundary; this is not database test evidence. No provider/model/prompt change, migration, operational alert or commercial-policy change in r1. Prior invariants and production gates remain as recorded above. Exact-commit independent review, separate acceptance and Ben's express merge approval remain outstanding.

Repaired `outbox.ts` SHA-256: `c36f1d3a6d49a4eb960665261ab4d1c7bf45e42e21132aa2deeb5d9408094bb5`. Existing `audit-fix-dbsrc-08.test.ts`: `2125cb1bc8a92578b9ed7a689390a93495091f01b9c29ab12106a777431ccebb`. SERIOUS-B10 unit test retains its earlier hash. Intended commit message for this repair: `/private/tmp/jg-msg-serious-b10-r1.txt`; also copied to dispatcher-requested `/private/tmp/jg-msg-serious-b10.txt`.
