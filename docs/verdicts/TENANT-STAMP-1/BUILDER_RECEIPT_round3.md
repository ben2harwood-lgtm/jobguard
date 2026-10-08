# TENANT-STAMP-1 round 3 builder receipt

8 October 2026. Builder: Claude Sonnet 5.5. Branch `codex/sandbox/tenant-stamp-1`, PR #115. Base: local merge commit `2b26c0e` (main `df1f9c1` merged in, not pushed). Order: `~/.local/share/full-steam/jg-orders/TENANT-STAMP-1-r3-conversion.txt`, on top of the original order, round 2, the Opus PASS at `45a4e44` and Ben's 8 Oct answer "Yes, conversion only". Builder evidence only: no independent verdict, no push, merge or PR, and no change to `config/agent-lane-assignments.json`. All earlier work is kept: the stamp, `verifiedTenantContextForQueuedJob`, the worker change, `testTenantContext`, and the round 1 and 2 conversions that survived the merge.

## What changed

The merge took main's side of 24 test files plus `evidence-pack.application.ts`, so the earlier conversion of those files was gone, and main added new test files that build a context by hand. Every hand-made `VerifiedTenantContext` in `apps/**` and `packages/**` is now a stamped one made with `testTenantContext(...)`, except the deliberate refusal cases below. Nothing else in a test file changed: no assertion, matcher argument, SQL, fixture value, test name or timeout. No production code, migration, schema or lane file changed. Affected guarantees: AGENTS 5.1 and 5.13, BUILD_PLAN C4, C5, C8.

**Total: 47 hand-made contexts converted in 33 test files.** A further 3 files changed by one comment line only (36 changed test files in all). The shared helper `packages/db/test/tenant-context-test-utils.ts` is unchanged.

| File | Contexts converted | Lines | Lane |
| --- | --- | --- | --- |
| `test/UIWIRE-10.integration.test.ts` | 1 | +3/-2 | in lane |
| `test/UIWIRE-11.integration.test.ts` | 1 | +3/-2 | in lane |
| `test/UIWIRE-12.integration.test.ts` | 2 | +4/-3 | in lane |
| `test/activation.integration.test.ts` | 1 | +3/-2 | in lane |
| `test/commands.integration.test.ts` | 1 | +3/-2 | in lane |
| `test/commercial-integrity.integration.test.ts` | 1 | +3/-2 | in lane |
| `test/decision-inbox.integration.test.ts` | 1 | +3/-2 | in lane |
| `test/evidence.integration.test.ts` | 2 | +3/-2 | in lane |
| `test/final-account.integration.test.ts` | 2 | +4/-3 | in lane |
| `test/inbox-relevance.integration.test.ts` | 1 | +2/-1 | in lane |
| `test/job-import.integration.test.ts` | 2 | +4/-3 | in lane |
| `test/job-parties.integration.test.ts` | 3 | +5/-4 | **OUT OF LANE** |
| `test/job.integration.test.ts` | 1 | +3/-2 | in lane |
| `test/match-inbox-replay.integration.test.ts` | 1 | +3/-2 | **OUT OF LANE** |
| `test/materials.integration.test.ts` | 1 | +3/-2 | in lane |
| `test/practice-scope.integration.test.ts` | 2 | +3/-2 | in lane |
| `test/practice-session.integration.test.ts` | 1 | +2/-1 | **OUT OF LANE** |
| `test/proof-application-records.integration.test.ts` | 1 | +2/-1 | **OUT OF LANE** |
| `test/quote.integration.test.ts` | 2 | +4/-3 | in lane |
| `test/readiness.integration.test.ts` | 1 | +2/-1 | in lane |
| `test/recovery-case-outcome.test.ts` | 1 | +3/-2 | **OUT OF LANE** |
| `test/recovery-cases.integration.test.ts` | 2 | +3/-2 | in lane |
| `test/recovery-cases.workbench.integration.test.ts` | 3 | +4/-3 | **OUT OF LANE** |
| `test/recovery.integration.test.ts` | 2 | +3/-2 | in lane |
| `test/review.integration.test.ts` | 1 | +2/-2 | in lane |
| `test/supplier-documents.integration.test.ts` | 1 | +3/-2 | in lane |
| `test/supplier-matching.integration.test.ts` | 1 | +3/-2 | in lane |
| `test/things-replay.integration.test.ts` | 1 | +3/-2 | **OUT OF LANE** |
| `test/variation.integration.test.ts` | 1 | +3/-2 | in lane |
| `test/watchdog-command-harness.ts` | 1 | +3/-2 | **OUT OF LANE** |
| `test/watchdog-fixtures.ts` | 2 | +4/-3 | **OUT OF LANE** |
| `test/watchdog.integration.test.ts` | 2 | +4/-3 | **OUT OF LANE** |
| `test/workspace-read.integration.test.ts` | 1 | +3/-2 | in lane |
Comment-only edits (one line each, adding no conversion): `packages/db/test/evidence-packs.integration.test.ts:88`, `packages/db/test/tenancy.integration.test.ts:142`, `packages/db/src/tenant-context.test.ts:23`. The first two mark the deliberate literals below, the third marks the forged inputs table.

### Shapes the order's grep did not find

`git grep 'as (unknown as )?VerifiedTenantContext'` missed two shapes, found by an AST scan of every object literal with a `tenantId` property under `apps` and `packages`:

- `packages/db/test/practice-session.integration.test.ts:185`: `as import("../src/tenant-context.js").VerifiedTenantContext` (converted).
- `packages/db/test/proof-application-records.integration.test.ts:106`: `as typeof h.ctx` (converted). The first full PostgreSQL run caught this one: it failed with `INVALID_TENANT_CONTEXT` at the `stranger` context. Fixed by `testTenantContext(randomUUID())`.

The scan then found no other context-shaped literal. A future scanner should match on the literal, not on the cast's type name.

### Two conversions that were not a plain swap

- `packages/db/test/recovery-case-outcome.test.ts` mocks `../src/tenant-context.js` down to a fake `withTenant`, so the shared helper (which imports that module) would get the mock. The context is therefore built from the real constructor, using `vi.importActual` for that module, with the same identity values the helper uses and a random tenant. The mocked `withTenant` still ignores the context, so every assertion is unchanged. The unused `import type` of the context type was removed.
- `packages/db/test/inbox-relevance.integration.test.ts` used `{tenantId, membershipId} as unknown as VerifiedTenantContext`. The extra `membershipId` property is dropped: an AST check shows `ctx` is only ever passed whole as a call argument (9 uses, none a property access), and the membership id is passed separately.

### Deliberate unstamped literals (kept, each marked with a one-line comment)

Each one must reach `withTenant` and be refused there with `INVALID_TENANT_CONTEXT`:

- `packages/db/test/shared-money-origin.integration.test.ts:98`: `{tenantId:"malformed"}` (comment at :97, from round 2).
- `packages/db/test/tenancy.integration.test.ts:143`: `{ tenantId: "not-a-uuid" }` (comment at :142).
- `packages/db/test/evidence-packs.integration.test.ts:89`: `{}` passed to `repo.list` (comment at :88).
- `packages/db/src/tenant-context.test.ts:25` and `:41`: the forged-input table of the boundary test (comment at :23).

The two literal casts inside `packages/db/src/tenant-context.ts` (`Object.freeze(...) as VerifiedTenantContext` in the two constructors) are the stamped constructors themselves, not hand-made contexts.

### Application code

`apps/api/src/evidence-pack.application.ts` on main (SBOX) no longer builds a context by hand: `authorize` calls `new PracticeAccess(pool, sessionId).case(caseId)`, which gets a context from `authorizePracticeJob` (`packages/db/src/practice-session.ts:23`, built with `verifiedTenantContextFromMembership`), plus `practiceMaterialPool`. The order's condition ("if main's version still builds a context by hand") is not met, so the file is **unchanged** and SBOX's `PracticeAccess` authorisation and `practiceMaterialPool` use are intact. One thing for the reviewer: it still returns `{ ctx, actorRef, repo }` from `authorize`. The original order asked for no context inside a container; with the stamp that is harmless (identity-based), and splitting it would mean re-running the authorisation per call. No other `apps/**` or non-test `packages/**` source builds a context by hand.

### Not converted, and why

Six test files return a fake principal from a spied `PracticeAccess` method, such as `{context:{tenantId:...}} as never`: `apps/api/src/capture/capture-state.test.ts:12`, `apps/api/src/evidence-pack.application.test.ts:29`, `apps/api/src/recovery-case.application.test.ts:12` and `:116`, `apps/api/src/recovery-case.command.application.test.ts:12`, `apps/api/src/workspace/workspace.service.test.ts:12`, `apps/web/app/lib/recovery-case-routes.test.ts:36`. They are not `VerifiedTenantContext` casts, the repositories or `withTenant` they feed are mocked, and all of these suites pass with the stamp live. I left them alone as outside the order's definition. If the coordinator wants them stamped too, that is a small separate change.

## Proof that only context constructions changed

`/private/tmp/claude-501/.../scratchpad/ast-check.cjs` (ephemeral) parses every changed test file at `HEAD` and now with the TypeScript compiler. It collects every context construction (object-literal casts and helper calls) in source order, checks each converted one passes the same tenant expression as the old literal's `tenantId`, replaces all of them with placeholders, normalises import lists (ignoring only the context type name and the helper import), allows only the explanatory comment lines and the one `vi.importActual` line, and then requires the two texts to be identical. Result: **36 files checked, 47 conversions, 6 retained constructions, 0 failures.** Mutation test: changing one matcher (`toBeNull` to `toBeUndefined`) in `final-account.integration.test.ts` made it fail at that line; the file was restored byte for byte.

## Files changed outside the current `tenant-stamp-1` lane entry (10)

The lane entry was not edited, as ordered. `LANE_BASE_REF=origin/main pnpm lint` fails on exactly these ten and no others, as expected:

- `packages/db/test/job-parties.integration.test.ts`
- `packages/db/test/match-inbox-replay.integration.test.ts`
- `packages/db/test/practice-session.integration.test.ts`
- `packages/db/test/proof-application-records.integration.test.ts`
- `packages/db/test/recovery-case-outcome.test.ts`
- `packages/db/test/recovery-cases.workbench.integration.test.ts`
- `packages/db/test/things-replay.integration.test.ts`
- `packages/db/test/watchdog-command-harness.ts`
- `packages/db/test/watchdog-fixtures.ts`
- `packages/db/test/watchdog.integration.test.ts`

The in-lane new files are `docs/verdicts/TENANT-STAMP-1/**` (this receipt, `ORDER.md`, `ORDER_round2.md`). `ORDER.md` and `ORDER_round2.md` are byte-identical copies of `TENANT-STAMP-1.txt` and `TENANT-STAMP-1-r2-ci.txt` (checked with `cmp`).

## Commands and results

Node 24.17.0, pnpm 10.28.1, Vitest 4.1.11. Machine load average was 90 to 175 during the first runs.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm typecheck` | 0 | 7/7 tasks (final tree) |
| `pnpm build` | 0 | 7/7 tasks (final tree) |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed; lane check fails on exactly the 10 out-of-lane files above, so the later steps of that command did not run |
| `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs`, `pnpm turbo run lint` | 0, 0, 0 | Run on their own because of the lane stop: money and commercial checks pass; 7/7 package lint tasks |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1` (first run, embedded PostgreSQL not yet startable) | 1 | Every PostgreSQL file failed in setup: `initdb` could not load a library, see environment note. Not a test result |
| Same, second run (embedded PostgreSQL working) | 1 | 598 passed, 4 failed / 602. One real failure: `proof-application-records` `stranger` context (fixed above). Three 5000 ms timeouts under load: `job-parties` (2 tests) and `contractor` (1 test) |
| `vitest run --maxWorkers=1` on `proof-application-records`, `job-parties`, `contractor` | 0 | 3 files, 114 tests passed |
| **Final full `packages/db` suite**, `vitest run --maxWorkers=1 --reporter=verbose` | 0 | **58 files, 602 tests passed**. This includes tenancy, UIWIRE-12, demo-bootstrap, every converted PostgreSQL suite, the stamp boundary test and the outbox test |
| `pnpm --filter @jobguard/api test` (includes chained `openapi:check`) | 0 | 22 files, 584 tests passed |
| `pnpm openapi:check` | 0 | Contract unchanged |
| `pnpm --filter @jobguard/web test` | 0 | 19 files, 350 tests passed |
| `pnpm --filter @jobguard/core test` | 0 | 108 files, 3188 tests passed (an earlier run under load timed out 4 tests in `receipt-allocation.test.ts`, 5000 ms each; it passes alone and on rerun; core is untouched) |
| `node --test tools/*.test.mjs` | 0 | 42 passed, 0 failed |
| AST conversion-only check (above) | 0 | 36 files, 47 conversions, 0 failures |
| `tsc --noEmit` over `packages/db/src` and `packages/db/test` (scratch config) | 2 | 28 errors, none mentioning the context type, the helper or any line this order changed; they are existing type looseness in test files (`packages/db` typechecks `src` only) |

Disk free before heavy runs: 51 GB, then 48 GB (above the 40 GB floor).

### Environment note (not a repository change)

The worktree's `node_modules` had never run the embedded PostgreSQL package's own install step, so `initdb` aborted with "Library not loaded: libicudata.68.dylib" and every PostgreSQL suite failed in setup. I ran that package's shipped script (`node scripts/hydrate-symlinks.js` inside `@embedded-postgres/darwin-arm64`), which only creates the missing short library names inside `node_modules` (git-ignored). No install or download was run, and nothing was deleted. Other fresh worktrees will need the same step.

### Timeouts

No timeout was added, lengthened or changed in any file. The three 5000 ms failures in the second run were caused by machine load and passed on rerun and in the final full run.

## Not done

Nothing was committed to a protected branch, pushed, merged or opened as a PR. The browser (Playwright) and GitHub CI runs are not part of this local evidence. The independent Claude verdict on the final commit is still required. The lane change for the 10 files is the coordinator's.

## TL;DR

Every test file on current main that still built a tenant pass by hand now gets a genuine one (47 passes in 33 files), and the only unstamped passes left are the deliberate "this must be refused" tests, each marked. Only the pass construction changed in each file, which an automated before-and-after comparison confirms, and the whole database suite (58 files, 602 tests), plus API, web, core and tool tests, passes. Ten of the converted files sit outside the lane entry, so the lane check will fail on exactly those until the coordinator widens the lane.

**Status:** prepared, tested locally and committed locally; not pushed, not independently reviewed, not deployed. **Next action:** the coordinator widens the `tenant-stamp-1` lane for the 10 files, then an independent Claude review of the new commit. **Decisions Ben needs to make now:** none.
