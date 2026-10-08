# CH-2 builder receipt — round 11

Repair of PR #97 on `codex/sandbox/ch-2`, starting from **ed8d2e39a78e3fdb81217d2b39c5868a652a9e3e**. This receipt describes uncommitted working-tree changes; the dispatcher owns commit and push. It is builder evidence, not an independent verdict or technical acceptance.

P2-1 is repaired in tests only. The owner suite selects `previous` with `MIGRATION_URLS.slice(0, MIGRATION_URLS.indexOf(target))` and asserts that exact registered prefix. The SH-1 presence assertion remains. The registry test requires SH-1 before CH-2 by position, without requiring CH-2 to remain last. Complete SQL-file registration, registered count, uniqueness, exactly one watchdog migration and sorted order assertions remain intact. Only the terminal-migration assertions identified in the order were replaced or removed as explicitly directed; no other assertion was weakened, skipped or deleted.

P3-1 is repaired by replacing only `CONFLICT` with `IDEMPOTENCY_CONFLICT` in the specified pre-0096 proof replay sentence in `packages/db/MIGRATIONS.md`.

Two added source regressions failed before the repair and passed afterward:

- `round 11 migration merge-ahead regressions > registry ordering does not require CH-2 to be the last migration`
- `round 11 migration merge-ahead regressions > owner setup applies only the registered prefix before CH-2`

The red run had **2 failed / 72 passed**; only the registry test file had changed at that point (15 added regression-test lines). The green run had **74 passed**. These checks inspect the actual test sources: they reject the old last-migration/whole-registry assertions, and require the owner setup's prefix selection. They do not claim PostgreSQL execution.

Environment: Node **24.17.0**, pnpm **10.28.1**, existing installed dependencies, macOS arm64. Every pnpm command below used `PATH=/private/tmp/ch2-bin:$PATH`, the existing shim to the installed pinned pnpm. No dependency install or download. Logs are `/private/tmp/ch2-round11-*.log`.

| Command actually run | Exit | Result |
|---|---:|---|
| `pnpm --filter @jobguard/api exec vitest run src/watchdog-registry.test.ts --maxWorkers=1` — red | 1 | Two new regression tests failed; 72 existing tests passed. |
| Same focused command — green | 0 | 74 tests passed. |
| `pnpm typecheck` | 0 | 7/7 tasks; 4 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Lane, core purity, money checks and 7/7 tasks passed; 4 cached. No self-comparison refusal. |
| `pnpm lint:lanes` | 0 | `ch-2` lane passed; repeated with this receipt included. |
| `pnpm --filter @jobguard/api test` | 1 | 181 passed / 1 failed in 16 files. Unchanged health test cannot bind a socket: `listen EPERM` on `0.0.0.0`, with one associated unhandled error. The script's appended OpenAPI check was not reached. No test exclusion or skip used. |
| `pnpm --filter @jobguard/db exec vitest run src test/verify-evidence-pack-cli.test.ts --maxWorkers=1` | 0 | All 12 DB unit/CLI tests passed in 3 files; no PostgreSQL suite invoked. |
| `pnpm openapi:check` | 1 | Installed `tsx` CLI cannot create its IPC socket: `listen EPERM`. |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | 0 | Same OpenAPI generator/check through the socket-free entry point; committed specification matches. |
| `pnpm build` | 0 | 7/7 tasks; 4 cached. DB/API rebuilt and Next production build completed. |
| `git diff --check` | 0 | No whitespace errors. |
| `git diff --exit-code HEAD -- packages/db/migrations/0096_watchdog_live.sql packages/db/src config/agent-lane-assignments.json packages/core apps/web apps/api/openapi.json docs/verdicts/CH-2/BUILDER_RECEIPT_round8.md docs/verdicts/CH-2/BUILDER_RECEIPT_round9.md docs/verdicts/CH-2/BUILDER_RECEIPT_round10.md` | 0 | All listed implementation, migration, lane, browser, specification and historical-receipt paths unchanged. |

Only four working-tree files change: the two ordered test files, `MIGRATIONS.md`, and this receipt. All are inside the existing `ch-2` lane. Migration remains **0096**, with SQL, triggers, lock order and round-10 non-blocking `pg_try_advisory_xact_lock` fix unchanged. Ben's **keep triggers** decision stands. No runtime behavior, money, authorization, tenant isolation, audit, commercial policy, environment variable or alert change. No new migration or rollback step; the existing 0096 procedure still applies. No new or increased timeout.

PostgreSQL integration, migration and browser suites were not run locally because this sandbox cannot bind localhost or start PostgreSQL. They remain required in CI after the dispatcher commits and pushes. The supplied green CI at ed8d2e3 is earlier-head evidence, not verification of this repair. Fresh CI, an independent different-model verdict bound to the resulting commit, and separate technical acceptance remain outstanding. No release or decision approval is claimed.

Synthetic data only. No live providers, spending, real sends, production mode, decision approvals, git add/commit/checkout/push/merge or PR creation. Intended conventional commit subject and body are written to `/private/tmp/jg-msg-ch-2.txt`.
