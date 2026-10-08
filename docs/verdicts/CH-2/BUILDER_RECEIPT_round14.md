# CH-2 builder receipt — round 14

Working-tree repair for `codex/sandbox/ch-2`, this worktree, PR #97, based on HEAD `9f7cb864382983eda6f77dcbfffc1039ded015f4`. Addresses the supplied Claude Opus delta review (PR comment 6046556871) and reported CI failures in runs 37680904626 and 37679595185. Read AGENTS.md, BUILD_PLAN.md shared lifecycle/CH-2 and ENT-1 contracts, and the round-13 receipt. This is builder execution evidence, not an independent verdict or technical acceptance. The dispatcher must commit the repair before a fresh verdict can bind to its exact commit.

## Repairs and preservation

- **P1 — practice merchant evidence-pack fixture only.** In `packages/db/test/practice-session.integration.test.ts`, set transaction-local `app.tenant_id` with parameterized `set_config`. Replace the direct accepted-status write with `app.transition_job` for draft → quoting → accepted, then transition accepted → live before evidence writes. Use the same synthetic v1 net/policy/cap inputs as `evidence-pack-fixture.ts`. Move the supplier-document and version inserts into that same admin transaction so they also have tenant context and a live job. This fixes both guarded write groups with the triggers enabled. Every assertion in the entire practice-session file is unchanged; everything before the merchant-pack test is byte-identical to HEAD.
- **P3 — restore main's health test.** `apps/api/src/health.test.ts` is byte-identical to `origin/main` (`3395d343fd50d979c734daf4946ba293ee2ed836`), including its Supertest listener and assertions.
- **Lane registry.** Only the compact, single-line `ch-2` entry changed: add exactly `packages/db/test/practice-session.integration.test.ts` and remove `apps/api/src/health.test.ts`. Every other line is byte-identical to HEAD.

Only those three tracked files and this receipt are changed. All earlier CH-2 work, including rounds 12–13, is preserved except the explicitly requested health-test restoration. No assertion was weakened, skipped or deleted; no timeout was added or increased. The API unit run includes the restored health test and reports its failure. Shared fixture/lane edits serialize with the other task owners.

`packages/db/migrations/0096_watchdog_live.sql` is byte-identical to HEAD, including Ben's keep-triggers decision and the non-blocking `pg_try_advisory_xact_lock`. SHA-256: `4b369d40e3d952a19267601245fae6a961925242666d34411176512994b1a4c4`.

Affected invariants: CH-2 live-only watchdog inputs and fixture ordering; AGENTS §5.1 transaction-local tenant context; preservation of earlier acceptance assertions. No migration, backfill, schema/grant change, provider/configuration change, new external action, operational alert or public API compatibility change. Existing migration rollback/forward-fix guidance is unchanged.

## Search of other merged SBOX/ENT-1 tests

Searched watchdog-input INSERTs against the tables guarded by 0096 and inspected fixture/service paths in:

- `packages/db/test/sandbox.integration.test.ts`: bootstrap and sandbox repository paths; no admin watchdog-input inserts.
- `packages/db/test/practice-scope.integration.test.ts`: already imports live jobs through `importWatchdogFixtureJob` before evidence/proof commands.
- `packages/db/test/practice-finding-scope.integration.test.ts`: draft/quoting scope-selection fixtures; no watchdog-input writes.
- The remaining tests in `packages/db/test/practice-session.integration.test.ts`: identity, ownership, inbox reads and material catalogue fixtures; no other guarded admin writes.
- `packages/db/test/contractor.integration.test.ts`: organisation/role/client-contract fixtures; no watchdog-input inserts.
- The shared tests changed by SBOX-SESSION-1/ENT-1 (`UIWIRE-12.integration.test.ts`, `demo-bootstrap.integration.test.ts`, `tenancy.integration.test.ts`): inspected the merged changes and searched their fixture writes; no further instance of the reported pattern.
- SBOX browser specs and `ENT-1.spec.ts`: no admin SQL fixtures. The merchant-source journey in `SBOX-SESSION-1.spec.ts` already calls `startWatchdogJob` before its watchdog commands.

**Additional fixtures repaired: none.** This is source inspection, not PostgreSQL/browser execution.

## Executed checks

Used installed dependencies only: Node `v24.17.0`, cached pinned pnpm `10.28.1` via `PATH=/private/tmp/jg-ch2-round12-bin:$PATH`. No install or download; no claim of a fresh clean install. Logs are `/private/tmp/ch2-round14-*.log`.

| Command/check | Exit | Result |
| --- | ---: | --- |
| `pnpm typecheck` | 0 | Seven package tasks successful; four cache hits. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed. Lane checker rejects the health-test path in the existing HEAD diff/uncommitted restoration after its requested allowlist removal. No self-comparison refusal. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same health-path rejection. |
| `pnpm turbo run lint` | 0 | All seven package lint tasks successful; four cache hits. |
| `node tools/money-arithmetic-lint.mjs` | 0 | Passed. |
| `node tools/commercial-boundary-lint.mjs` | 0 | Passed. |
| `pnpm build` | 0 | Seven package tasks successful; four cache hits. Next compile/type validation/prerender passed. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1` | 1 | 19 files passed, one failed; **465 passed, one failed (466 total)**. Restored health test cannot bind: unhandled `listen EPERM: operation not permitted 0.0.0.0`, followed by Supertest's null-address/port error. No tests excluded. |
| `pnpm --filter @jobguard/db exec vitest run src/demo-seed.test.ts src/outbox.test.ts test/verify-evidence-pack-cli.test.ts --maxWorkers=1` | 0 | All three DB unit/CLI files, **12 tests**, passed; no PostgreSQL claim. |
| `node --test tools/*.test.mjs` | 0 | **42 tests** passed. |
| `pnpm openapi:check` | 1 | Installed tsx CLI refuses its IPC listener with `listen EPERM`, before the source checker runs. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same installed transformer/source checker without CLI IPC; committed OpenAPI matches. Standard script unchanged for CI. |
| `pnpm --filter @jobguard/db exec vitest list test/practice-session.integration.test.ts --maxWorkers=1` | 0 | All **10 cases** collected, including merchant-pack regression; no PostgreSQL tests executed. |
| Read-only final working-tree scope comparison against `origin/main` | 0 | All resulting changed/untracked paths match the CH-2 lane. Health has no resulting diff against main. Supplemental inspection, not a passing `lint:lanes` invocation. |
| `git diff --check`; byte/assertion/lane checks | 0 | Clean whitespace; 0096 unchanged; health equals main; all practice-session assertions preserved; only requested lane changes. |

The local lane checker unions the committed branch diff with dirty paths, so restoring health to main cannot remove its path from the current local check before the dispatcher commits. The final working-tree comparison confirms the restored file has no diff against main. The actual committed PR lane check still requires CI; no tooling or extra lane permission was changed to force a local pass.

Turbo reported denied writes to its shared worktree cache; Next printed the existing multiple-lockfile root warning. Successful task exit codes are recorded above.

## Handoff and remaining evidence

PostgreSQL, migration and browser suites were not run: this sandbox cannot start PostgreSQL or bind listeners, as specified by the dispatcher. They remain mandatory in GitHub CI after the dispatcher commits/pushes, including the unchanged merchant-pack assertions, restored health test, full `pnpm test`, build and browser suites. This repair has no local database proof of the CI regression's resolution.

Synthetic data only; no live providers, spending, real sends, production business mode or decision/policy approvals. Next's optimized production build does not activate production business mode. AI/provider evaluations are inapplicable because no model, prompt, schema, parser or provider behavior changed. The repaired commit still requires a fresh independent recorded verdict, separate technical acceptance and founder-owned merge/release.

No Git write command, commit, push, merge or PR operation was performed. Intended conventional commit subject and body are written to `/private/tmp/jg-msg-ch-2.txt`: `test(db): repair CH-2 practice merchant-pack fixture`.
