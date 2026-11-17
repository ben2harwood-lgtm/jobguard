# CH-2 builder receipt — round 13

Working-tree repair for `codex/sandbox/ch-2`, PR #97, based on HEAD `eef5b98a8b64c2638208a18ff950108e86c4dbbe`. Read the full GPT-6.1 Sol pre-check at `/Users/benharwood/.local/share/full-steam/jg-runs/ch-2-solcheck-20261007T200311.md`, AGENTS.md, BUILD_PLAN.md C1–C8 and CH-2, and the round-12 receipt. This receipt records builder execution; the repaired working tree has no commit yet and needs a fresh independent verdict and separate technical acceptance.

## Repairs

1. **Atomic evidence command/response (C5; AGENTS §5.4).** `packages/db/src/evidence.ts` passes the supplied completion callback into both existing-object checks. When either check completes a fresh command ID, it stores the identity/result and invokes the callback before the same transaction commits. An actual replay returns its stored object without running the callback. The new API regressions run the real application, evidence service and response repository with transaction-aware infrastructure doubles, covering response-write rollback, response-before-commit ordering and byte-identical replay after a changed proof projection. Three added PostgreSQL regressions cover existing and concurrently finalized objects, an actual failing response INSERT, physical identity/result rollback, successful retry, unchanged saved-response bytes and transaction visibility. PostgreSQL execution awaits CI.
2. **Inherited Nest routes (CH-2 registry Done-when).** The registry fails closed on controller inheritance. It also refuses undecorated subclasses that could inherit Controller metadata and imported/mixin bases it cannot resolve. Only unshadowed intrinsic `Error` inheritance used by existing domain errors is allowed without controller decorators. Negative tests include an unclassified inherited `@Post`, an imported base and an undecorated subclass of a controller. This is a conservative scanner convention: future non-error inheritance requires an explicit scanner extension rather than being silently ignored.
3. **RequestMapping routes (CH-2 registry Done-when).** The scanner recognizes literal `RequestMapping` paths and mutation methods from Nest's `RequestMethod` enum, including aliases/namespaces, path arrays and `ALL`. Omitted methods retain Nest's GET default. Unclassified mappings and indeterminate options/methods fail CI. Negative cases cover opaque options, spreads, shorthand, dynamic methods, computed keys, duplicate methods and an unrelated enum.

All earlier assertions remain. No test was removed, weakened or given a new/longer timeout. Round 12's SBOX-SESSION-1 integration and PracticeAccess checks remain; `proof.application.ts` is unchanged. The CH-2 lane registry already permits every changed path, so the registry and all other lane lines are unchanged. This round edits only the evidence service, its API tests, the registry test/scanner, PostgreSQL proof-response tests and this receipt. Those shared files serialize with CH-2 as editing owner.

`0096_watchdog_live.sql` is unchanged, including Ben's keep-triggers decision and the non-blocking `pg_try_advisory_xact_lock`. SHA-256: `4b369d40e3d952a19267601245fae6a961925242666d34411176512994b1a4c4`. No migration, backfill, schema/grant change, new external action or operational alert. Existing migration forward-fix/rollback guidance remains applicable. Public route and request/response schemas are unchanged; fresh no-op finalizations now persist their responses atomically.

## Tests first: red → green

Before the fixes, ran:

`pnpm --filter @jobguard/api exec vitest run src/proof/proof.application.test.ts src/watchdog-registry.test.ts --maxWorkers=1 -t 'round 13'`

Exit **1**: all **15 new regressions failed**. The proof tests observed committed identity/result records after response failure and response insertion after commit. The registry tests accepted inherited mutations, unclassified RequestMapping mutations and all nine indeterminate mapping forms. Log: `/private/tmp/ch2-round13-red.log`. The targeted filter was only for demonstrating red; final full-suite runs excluded no API tests.

After the fixes and rebuilding the DB package, the same two complete test files passed **129/129**, including all 15 new regressions. Log: `/private/tmp/ch2-round13-green.log`. PostgreSQL counterparts were added before the fix but only collected locally because this sandbox cannot start PostgreSQL.

## Executed checks

Node `v24.17.0`; already-cached pinned pnpm `10.28.1` via `PATH=/private/tmp/jg-ch2-round12-bin:$PATH`. Dependencies were already installed; no install/download or clean-install verification. The default machine pnpm dispatcher stalled during version inspection and was interrupted; cached pnpm worked. Logs use `/private/tmp/ch2-round13-*.log`.

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm --filter @jobguard/db build` | 0 | Rebuilt evidence service for package-import tests. |
| `pnpm typecheck` | 0 | Seven packages. |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Repository guards and all seven package checks. No self-comparison refusal: origin/main is `3395d343fd50d979c734daf4946ba293ee2ed836`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | CH-2 scope passes, including the final receipt. No lane lines changed. |
| `pnpm build` | 0 | Seven packages; Next compile, type validation and prerender pass. |
| `pnpm openapi:check` | 1 | Installed tsx CLI cannot bind its IPC listener: `listen EPERM`, before the checker runs. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same source checker/installed transformer without IPC; committed OpenAPI matches. Standard wrapper stays unchanged for CI. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1` | 0 | All 20 files, **466 tests**. |
| `pnpm --filter @jobguard/db exec vitest run src/demo-seed.test.ts src/outbox.test.ts test/verify-evidence-pack-cli.test.ts --maxWorkers=1` | 0 | All three DB unit/CLI files, **12 tests**; no PostgreSQL claim. |
| `pnpm --filter @jobguard/db exec vitest list test/proof-application-records.integration.test.ts --maxWorkers=1` | 0 | Eleven cases collected, including all three new PostgreSQL regressions; no test execution. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | 0 | All 53 source files, **1,428 tests**. |
| `pnpm --filter @jobguard/web test` | 0 | All eleven unit files, **100 tests**. |
| `node --test tools/*.test.mjs` | 0 | **42 tests**. |
| `git diff --check` | 0 | Clean. |
| Read-only migration/application/lane diff and SHA-256 | 0 | Migration 0096, proof application and lane registry unchanged. |

Turbo reported inability to write its shared worktree cache; successful task exits are recorded above. Next printed the existing multiple-lockfile root warning. Neither changes the successful build/check results.

## Handoff and remaining evidence

Synthetic data only; no live providers, spending, real sends, production business mode or decision/policy approvals. The optimized Next build verifies compilation/prerendering and does not enable production business mode. Local transaction doubles demonstrate application transaction composition, not physical PostgreSQL durability, locking or RLS.

PostgreSQL, migration and browser suites remain mandatory in GitHub CI after the dispatcher commits/pushes, including the three new proof-response cases and existing CH-2/SBOX-SESSION-1 journeys. Live-provider/evaluation checks are inapplicable: no provider, model, prompt or AI schema changed. The new exact commit still needs a recorded independent cross-model verdict, separate technical acceptance and founder-owned merge/release. No Git write, commit, push, merge or PR operation was performed.

Intended conventional commit subject and body: `/private/tmp/jg-msg-ch-2.txt`.
