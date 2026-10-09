VERDICT: PASS — bound to head f17e6ae847e5d4d5b6c66a2afc42058a1a91d7ca
Reviewer: fresh Claude Opus review agent spawned by the JobGuard integrator (Claude week, 9 Oct 2026); did not build, repair or order any commit in this PR.

**In short:** The fake recovery-message adapter no longer keeps the tenant context. It now gets the context with each call and does exactly what it did before. The one place that still holds the context is a small wrapper in the repository. That wrapper only lives for a single delivery or check, so it fits what the order was trying to achieve. Nothing in behaviour or tests changed beyond the new call shape. CI passed on this exact head: run 37961082363 completed success (checks, secrets, dependency-review).

Scope reviewed: `a7d5917..f17e6ae` (3 commits, 5 files), the order `TENANT-ADAPTER-1.txt`, the builder receipt, `packages/db/src/outbox.ts` (`OutboundAdapter`, `ActionExecutor`, `reconcileOutbox`), the spy and helper uses in `recovery-messages.integration.test.ts`, and the scanner-proof worktree. I re-ran nothing locally (budget).

## Findings

**P1:** none. **P2:** none.

**P3-1 (follow-up, not a blocker): the wrapper is a closure that holds the context, and the scanner can't see that.** `executorAdapter` (`packages/db/src/recovery-message-repository.ts:34-37`) and the test helper `practiceAdapter` (`packages/db/test/recovery-messages.integration.test.ts:107-110`) both capture the context for the length of one call. Today that is bounded: `executorAdapter` is not exported, and its result goes only into a throwaway `new ActionExecutor(...)` (`:271`) or into `reconcileOutbox(...)` (`:338`), and neither outlives the call. But the scanner's rules are syntactic. A later edit that kept an `executorAdapter(...)` result in a field or cache would not be flagged, because `ctx` only ever shows up as a call argument. The proper end state is a separate leaf: change `OutboundAdapter.deliver/reconcile` to take the context per call. `ActionExecutor.execute` and `reconcileOutbox` already have it in hand (`outbox.ts:13`, `:15`), and that change would remove both wrappers. Changing the shared interface was correctly kept out of this lane.

**P3-2 (note):** the wrapper logic is written twice (repository `:34-37`, test `:107-110`) because `executorAdapter` is module-private. That is acceptable, since exporting it would widen `@jobguard/db`'s API. The test helper's types are only checked by the builder's one-off tsconfig, because `packages/db` typecheck covers `src` only. That gap existed before this PR and is not a regression.

## Answers

**1. Behaviour identical — yes.**
- In `recovery-message-adapter.ts`, every `this.context` became the `context` parameter (`:50`, `:52`, `:53`, `:54`, `:59`, `:77`, `:78`). Nothing else in either method body changed.
- The mode short-circuits (`:40-42`) still come before any tenant use.
- The synthetic-only guards are untouched: the prefix/UUID/recipient check with `FAKE_EFFECT_MISMATCH`; case lock, source lock and `inspectRecoveryMessageCase` under `withTenant`; the sink insert with literal `'synthetic_demo',0` and `ON CONFLICT DO NOTHING`; and the `reconcile` prefix/UUID check.
- `withTenant` still receives the stamped object whole, so TENANT-STAMP-1's runtime check is unchanged.
- In the repository, both sites (`:270`, `:288`) build the adapter at the same point in the flow as before. Neither constructor had side effects before or after.
- The wrapper passes the same `ctx` the old constructor received. It copies `name` (literal `"fake_recovery_message"`, `adapter.ts:7`) and `supportsProviderDeduplication`, so the executor Map key and `adapters.has(r.adapter)` give the same result.
- `deliver`/`reconcile` return the adapter's promise unchanged, so `PracticeProcessStopped` still reaches the `instanceof` catch at `:272`, and the reconcile result and errors still reach `:338`.
- The spy is still meaningful. `vi.spyOn(FakeRecoveryMessageAdapter.prototype, 'reconcile')` (test `:1663`) still intercepts, because the wrapper looks up `adapter.reconcile` on the instance (and so the prototype) at call time. The assertions it feeds don't depend on argument shape: `not.toHaveBeenCalled` (`:1686`), `toHaveBeenCalledTimes(1)` (`:1709`), and `mockResolvedValueOnce('unknown')` (`:1740`).
- The test helper reads `stamped = context` when `practiceAdapter()` is called. That is the same moment the old constructor argument was evaluated, so it picks up the same `beforeEach`-assigned context (`:91`/`:151`).
- `index.ts:64` re-exports the class, so its public signature changes. `git grep` at `a7d5917` finds no consumer outside `packages/db`.

**2. The deviation — within the order's intent. Nothing material is lost by dropping `implements OutboundAdapter`.**
- The order's adapter bullet is fully met. The class has no context field, cache or closure. It is built with `(pool, mode)` only. Each tenant-needing method takes the stamped context as an argument, passes it whole to `withTenant` and reads `.tenantId` as a value. The repository passes `ctx` whole at each call and never into a constructor.
- The wrapper closure lives exactly as long as one repository method frame. That is the same lifetime as the repository's many `withTenant(this.pool, ctx, async db => …)` closures.
- No other code can reach it. It is module-private, and the `ActionExecutor` that keeps it in its `adapters` Map is created inline and dropped after `execute`.
- So it does not recreate the risk the scanner guards against: a long-lived object that carries a tenant and could be reused across requests. The residual weakness is the syntactic blind spot in P3-1.
- Type safety is kept. `executorAdapter` declares `: OutboundAdapter` (`:34`), so the object literal is checked against the interface: `name` must be `` `fake_${string}` ``, and `deliver`/`reconcile` return types are checked through the class's declared return types. If the class drifted, `pnpm typecheck` would fail at the wrapper instead of at the class.
- Dropping `implements` is arguably more honest. The class no longer has the executor's shape, so it can't be put into an executor Map without a context being supplied.
- The builder avoided touching any file outside the lane, so the order's "stop and report" condition was never triggered.

**3. Test change is signature-only — yes.**
- One file and one helper change, `recovery-messages.integration.test.ts:107-110`: +4/-1 lines, the only changed lines in the test diff.
- No `it`/`describe`/`expect`/timeout edits, and no `.skip`/`.only`/`todo`.
- Every `practiceAdapter(...)` call site is unchanged (`:638` … `:1628`, plus `.deliver(action)` at `:905`), and the spy line is unchanged.
- `recovery-message-repository.test.ts` and `recovery-message-upgrade.integration.test.ts` are untouched.

**4. Lane line — well-formed, and limited to the listed files.**
- `config/agent-lane-assignments.json:79` is added by the first commit `becec6d`: 1 insertion, no other line touched.
- It sits in name order between `synthetic-restore-rehearsal` and `tenant-stamp-1`, in the compact one-lane-per-line style.
- `branches`, `allow` and `note` match the order verbatim.
- On base, the only test file that references the adapter is `recovery-messages.integration.test.ts` (`git grep` at `a7d5917`: `:11`, `:107`, `:1660`), so the allow list is complete.
- The PR touches exactly the 5 allowed paths.
- No founder-reserved area: no migration, no `outbox.ts`/`BUILD_PLAN.md` edit, no auth or permission change (the change only makes the code stricter), and synthetic-only paths.
- All 3 commits carry the Sonnet trailer.

**5. Scanner proof — plausible, and partly confirmed.**
- `/private/tmp/jg-tenant-adapter-1-scanner-proof` exists at `2994f60ef91605c5…`. Its only changes are the two uncommitted `packages/db/src` files, and the changed lines of that diff are identical to this PR's `packages/db/src` diff.
- `apps/api/src/auth/context-boundary.test.ts` sha256 `49086b79…c0c3` matches `git show 2994f60:…`.
- The scanner's allow-list (`context-boundary.test.ts:35-40`: pass whole as a call argument, return whole, bind to a const, read `.tenantId`; whole-context returns from closures passed as arguments are refused) admits every new use. `adapter.deliver(ctx, action)`, `adapter.reconcile(ctx, key)`, `executorAdapter(…, ctx)` and `withTenant(this.pool, context, …)` all pass the context whole as an argument, and the closures return the adapter's result, not the context.
- All three flagged sites are gone: the field at `adapter.ts:33`, and `ctx` in the constructor calls at `repository.ts:262` and `:280`.
- So 144/145 → 145/145 is consistent with the diff. I did not re-run the scanner.

**6. CI:** **PASS.** Run `37961082363` (`CI`, pull_request) is bound to head `f17e6ae847e5d4d5b6c66a2afc42058a1a91d7ca` and completed `success` at 17:10:52Z. All three jobs passed: `checks`, `secrets` and `dependency-review`. The `checks` job ran install, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, the browser install, and the production e2e at mobile and desktop sizes, all green. Neither known main flake appeared. This was the only run for this branch; nothing was re-run.

---
_Generated by [Claude Code](https://claude.ai/code)_

