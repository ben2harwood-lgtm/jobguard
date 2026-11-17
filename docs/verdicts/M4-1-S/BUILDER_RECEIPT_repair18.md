# M4-1-S-R — builder receipt, repair 18

7 October 2026. PR #103; branch/lane `codex/sandbox/m4-1-s-repair` / `m4-1-s-repair`. Starting HEAD: `fb8e598c50554f5f4cb536ae27437bffd848573f`, integrating main `3395d343fd50d979c734daf4946ba293ee2ed836`. Reviewed predecessor: `96f058714c4b4294464ba63cbb2bc0b5ff7bac80`. Working-tree changes only; the dispatcher commits. This is builder execution evidence, not an independent verdict or technical acceptance. The previous Opus PASS does not review this diff.

## Integration and repairs

Reapplied this PR's application, controller, Next route and application-test changes over SBOX's versions. All public recovery-case application methods authorize job ownership through `PracticeAccess` before repository access. Writes and reply reads receive the verified session principal, including its membership and identity user; no hard-coded demo principal grants authority. Membership-checked reply reads return current state and the repository's `affectedCaseId`. A failure while constructing a committed reply remains `RECOVERY_COMMAND_OUTCOME_UNKNOWN`, including refusal-shaped errors. Nest preserves `PracticeErrorsFilter`; Next preserves `practiceFailure`, including no-store authorization failures. Missing sessions produce 401; stranger sessions and nonexistent jobs produce the same 404/code before repository access.

Restored the typed command failure mapping and own-property read-error mapping. Added SBOX's `NOT_FOUND`/404 and `SYNTHETIC_MODE_REQUIRED`/403 to the shared refusal contract as before-replay refusals: they refuse an initial attempt, but retain an unknown original on retry. Repair 17's reversible-refusal handling and every existing `settlesUnknown` value remain unchanged. Mode refusal remains SBOX's typed `SYNTHETIC_MODE_REQUIRED`; its internal diagnostic also names the earlier `MEMBERSHIP_FORBIDDEN` refusal, preserving both existing mode assertions.

The controller keeps SBOX's optional cookie argument for source compatibility with the existing transport tests; the actual eligibility session comes from the request's cookie as before. This resolves the merge-related transport/typecheck failure without editing or weakening that test. Existing application/command test doubles were adapted to the session-aware boundary and affected-case replies; previous assertions remain.

Every separate browser context in `M4-1-S.spec.ts` now copies `page.context().storageState()`. The helper receives the source page. Second contexts navigate directly to the saved job, avoiding a new sign-in that would replace the copied session. All persistence, source, money, lifecycle and repair 17 assertions remain unchanged. Ben's documented-design and accepted saved-job navigation substitute stand.

**Sol P3-1:** `friendlyErrors` uses `Object.hasOwn` before lookup. Contract-valid messages `constructor`, `toString` and `__proto__` each reach the alert as strings. Three regressions drive the real component's event handlers through the existing deterministic hook harness and render the actual alert subtree with React's `renderToString`.

**Opus P3-1 / Sol P3-2:** chose reload wording with a working **Reload page** button for both stale-revision codes on an unknown retry. The button calls `window.location.reload()` and reads persisted state on navigation. The attempt remains held until navigation; new commands remain blocked and Try again still sends the identical request. Neither stale code is marked as permanently settling, preserving repair 17's future/missing-revision cases. Both component regressions assert the uncertainty message, reload instruction and action, disabled fresh commands, identical retry body and successful replay. Raw held refusal codes and the PR description remain the requested follow-ups; neither is changed.

New Nest and Next handler regressions cover list, open, amend, every transition event, and eligibility review/approve/supersede. Each tests missing-session 401, stranger-session 404, identical nonexistent-job 404, and no repository work. They exercise real `PracticeAccess` with generated SQL-adapter responses and real filter/route mappings; they are not PostgreSQL or browser execution. Added dynamic-principal and committed-practice-refusal regressions.

## Validation

Existing installed dependencies; Node 24.17.0 and cached pinned pnpm 10.28.1 via `PATH=/private/tmp/jg-repair18-bin:$PATH`. No install or download. Logs: `/private/tmp/jg-repair18-*.log`. Initial system pnpm launcher attempts stalled at package-manager selection and were interrupted; all actual check results below use the cached pinned executable.

| Command | Exit | Result |
|---|---:|---|
| `pnpm typecheck` | 0 | All 7 package tasks; 2 cached. Initial runs found the transport-signature issue and two new test typing issues (union narrowing and CommonJS `import.meta`); fixed without changing assertions. A contention-reduction attempt was interrupted. Final log: `jg-repair18-typecheck-final-2.log`. |
| `LANE_BASE_REF=origin/main pnpm lint` / final `--concurrency=1` | 0 final | Boundary checks and all 7 package tasks; 2 cached. No self-comparison refusal. Earlier type error/interrupted attempts are not passes. Final log: `jg-repair18-lint-final.log`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Correct lane, including this receipt. |
| `pnpm build` / final `--concurrency=1` | 0 final | All 7 package tasks; 2 cached; production Next compilation, type checking, static pages and build traces completed. Initial transport-signature error was fixed; one parallel attempt was interrupted. Final log: `jg-repair18-build-final.log`. |
| `pnpm openapi:check` | 1 | `tsx` CLI IPC listener blocked by sandbox `EPERM`; generator did not run through this launcher. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same generator without a listener; committed OpenAPI matches. No regeneration or lane addition needed. |
| `pnpm --filter @jobguard/api test` | 1 | 416 passed, unchanged health test failed on socket-binding `listen EPERM` (one associated unhandled error). Chained OpenAPI check did not run. This run preceded three additive application tests. |
| Final `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1` | 1 | 419 passed / 1 failed: only unchanged `src/health.test.ts` cannot bind a listener. Includes all 86 recovery tests and existing practice-session/transport tests. Final log: `jg-repair18-api-final.log`. |
| Targeted API application/command/controller/session/transport run | 1 | 305 passed / 1 existing Next quote-delivery transport test timed out during peak contention. Its unchanged test passes in the final full API run above. |
| `pnpm --filter @jobguard/web test --maxWorkers=1` final | 0 | All 335 tests across 17 files, including prototype-name rendering, stale retry reload and ownership regressions. Final log: `jg-repair18-web-final-2.log`. Earlier full default-worker attempt was interrupted during contention. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | 0 final | All 1,578 tests across 52 files pass in the final complete run, with existing timeouts. Final log: `jg-repair18-core-final.log`. |
| Four unchanged core stress-test files, `--maxWorkers=1` | 1 | 101 passed / 1 allocation stress-test timeout at the existing 5000ms limit. The other earlier timeout cases pass in this run. |
| `pnpm --filter @jobguard/core exec vitest run src/receipt-allocation.test.ts --maxWorkers=1` | 0 | All 34 assertions/tests pass in isolation; no timeout changes. |
| `pnpm --filter @jobguard/ai test` | 0 | 72/72; synthetic fixtures/provider doubles, not live evaluation. |
| `pnpm --filter @jobguard/storage test` | 0 | 4/4; no live storage provider. |
| `pnpm --filter @jobguard/config test` | 0 | 2/2. |
| `pnpm --filter @jobguard/db exec vitest run test/recovery-case-outcome.test.ts` | 0 | 4/4; mocked transaction-boundary tests, not PostgreSQL proof. |
| `node --test tools/*.test.mjs` | 0 | 42/42. |
| `pnpm --filter @jobguard/web exec playwright test --list e2e/M4-1-S.spec.ts` final | 0 | 16 tests collected in mobile-360 and desktop; no browser execution. |
| `git diff --check`, migration comparisons and SHA-256, parsed/compact lane-registry comparison | 0 | No whitespace errors or migration changes. Registry changes only this lane's receipt; sorted compact lane lines preserved. |

Full root `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and browser execution are not claimed: they require the PostgreSQL/listener capabilities reserved for CI in this environment. Earlier complete core runs had 2 then 6 timeouts in unchanged tests (`enterprise-domain/boundaries`, `extra-origin`, `receipt-allocation`, `cumulative-fee`) during host contention. The four-file retry left one timeout; the allocation file then passed 34/34 in isolation, and the final complete core run passed 1,578/1,578. No source, assertion or timeout change was made in those files. The unchanged Next quote-delivery test also timed out once and passed in the final complete API run. These failures are retained as run history, not hidden or treated as passes.

Initial tests found stale local package output lacking SBOX exports; rebuilding dependencies resolved those failures. Initial typecheck/build found the removed optional controller argument; restored it without altering the transport assertions. The later typecheck found two new test-harness typing issues, fixed by an explicit discriminant check and a CommonJS-compatible path lookup; final typecheck, lint, build and web tests pass. Some parallel validation attempts were interrupted to reduce contention; they are not counted as passes. The host reported a load average above 400 during the later runs. No timeout, assertion, retry count or mandatory suite was weakened, increased, deleted or made optional.

## Scope, migration and remaining gates

Only this lane's existing allowed paths are edited. The compact registry retains one sorted lane per line; only `lanes["m4-1-s-repair"].receipt` changes to this receipt. No new path grant is required. OpenAPI generation result is recorded above; migrations are untouched. `0097_recovery_case_current.sql` matches both HEAD and `96f0587`, SHA-256 `84aef359c62455818e4eb66d26ca9d21c13c49ddd06af202fd107be3950d9375`. The integrator's migration list/order (0054, 0094, 0097), MIGRATIONS.md, §12.2 ledger and migration totals of 47 remain untouched. No new migration/backfill/rollback requirement, provider destination or operational alert.

Invariants touched: synthetic isolation, session/job ownership, verified reviewer membership, current-state idempotent replay, unknown write outcomes, immutable financial history and honest UI recovery/error states. Existing schema and wire versions remain; the two SBOX refusal codes and reload affordance are additive. No durable refusal redesign, production capability or commercial policy change.

PostgreSQL, migration and browser execution remain for mandatory GitHub CI after the dispatcher pushes: this sandbox cannot start PostgreSQL or bind listeners. Playwright collection proves collection only. No clean reinstall (dependencies were provided), live provider, spending, real data/send, production execution, decision approval, deployment, professional sign-off or release was performed. No Git write command, push, merge, PR creation or PR-description edit. Intended conventional commit subject/body: `/private/tmp/jg-msg-m4-1-s-repair.txt`.

Remaining gates: dispatcher commit/push; green mandatory CI, including the locally blocked checks and all existing PostgreSQL/browser suites; fresh independent verdict bound to the resulting exact commit; separate technical acceptance; founder-owned merge/release in migration order. The raw-code/PR-description follow-ups and prior REC-UI-1, REV-ACCT-1 and allocated-gross/eligible-net follow-ups remain deferred, not waived. **Not independently verified or accepted.**
