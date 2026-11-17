VERDICT: PASS — bound to head 8fabfa4cf1063e6ff752dbcbf02a1abbdb342b58
Reviewer: fresh Claude Opus review agent spawned by the JobGuard integrator (8 Oct evening); did not build, repair or order any commit in this PR.

**Short version.** Since the PASS at `4cd7e04`, two main merges and one test line were added, and none of them changes what M4-7-S does. Every conflict in the MON-7a merge was settled by keeping both sides whole, the TENANT-STAMP-1 merge had no conflicts, and the PR's diff against main `41d83ac` is the passed diff plus the one stamped-context test line. CI `checks` is green on exactly this head (run 37814940442).

## What I checked

**1. Conflict resolutions (`git show --remerge-diff`).**
- `40a0506` (MON-7a, 9 conflicted files): every hunk is a union and nothing is dropped. `app.module.ts` keeps `PreventionCheckController` first and `PracticeFeedController` last, and the providers are unchanged. `workspace/application.ts` exposes both `practiceFeed` and `preventionChecks`, and every other key is byte-identical. `workspace/index.ts`, `core/src/index.ts` and `db/src/index.ts` keep both export sets (including `prevention-register-fixtures.js`). `watchdog.ts` keeps both `pre_live_allowed` pairs (Next route and Nest route for each feature). `migrate.ts` order is `0102, 0103, 0106`. `MIGRATIONS.md` and the `BUILD_PLAN.md` §12.2 ledger keep both sections whole, with MON-7a first.
- `c23adf8` (TENANT-STAMP-1): the remerge diff is empty, so the merge was clean.
- **Same PR, in substance.** `git diff b552bdc 4cd7e04` and `git diff 41d83ac 8fabfa4` touch the same 40 files with the same +3834/−4 counts. The changed lines match exactly in 37 of them. The other 3 are `app.module.ts` and `workspace/application.ts`, which differ only because MON-7a's entries are now on the context lines, and `practice-feed.integration.test.ts`, which differs only by the 8fabfa4 change.

**2. How it fits with MON-7a and TENANT-STAMP-1.**
- **Registry.** Both features' routes are `pre_live_allowed` in `packages/core/src/watchdog.ts` (Next and Nest forms). That is correct: neither feature writes watchdog inputs.
- **MON-7a's upgrade test** (`packages/db/test/prevention-checks.integration.test.ts:191`) applies every migration except 0103, including 0106, and then runs `migrate()`. That creates a database where 0106 went in before 0103, which can never happen in real use. It still passes:
  - 0106 and 0103 do not reference each other's tables or functions.
  - 0106's triggers are only on its own five `practice_feed_*` tables, so the test's plain `app.job` insert is unaffected.
  - `migrate()` (`packages/db/src/migrate.ts`) skips already-applied names and does not enforce order.
  - CI was green on `40a0506` and is green here.

  It is not a real problem. It is a test-design weakness on MON-7a's side (P3-1).
- **M4-7-S's own upgrade test** (`practice-feed.integration.test.ts:87-90`) uses every migration registered before 0106, so it now correctly includes 0102 and 0103.
- **TENANT-STAMP-1.** I searched every `.ts`/`.tsx` file in the PR diff for `withTenant`, `VerifiedTenantContext` and `tenantId:`. Production code never builds a context by hand:
  - `practice-feed-repository.ts:164,176` pass the caller's context straight to `withTenant`.
  - `practice-feed.application.ts:37,44` pass `scope.auth.context` from main's `PracticeAccess`.
  - The web route builds no context.
  - The feed test's main context (`:21`) comes from the stamped `verifiedTenantContextFromMembership`, and the other-tenant context (`:400`) now does too.

  The remaining `{ tenantId: ... }` objects are harmless:
  - `apps/api/src/practice-feed.application.test.ts:23,43,46` give a context to a mocked repository, so it never reaches `withTenant`.
  - `:88,99` (and the matching ones in `core/src/practice-feed.test.ts:87` and `e2e/M4-7-S.spec.ts:300`) are forged request bodies that the feed is meant to reject.
  - The feed test's `:392` and `:553/562` put another tenant id into raw row data inside a stamped transaction, expecting RLS to refuse it.

  Nothing in the PR would now be refused at runtime.

**3. `8fabfa4`.** The only change is `{ tenantId: otherTenant } as VerifiedTenantContext` → `testTenantContext(otherTenant)` (`practice-feed.integration.test.ts:400`), plus the import swap. `testTenantContext` (`packages/db/test/tenant-context-test-utils.ts`) calls the stamped membership constructor with the given tenant id. The assertion is unchanged: another tenant's transaction sees zero `practice_feed_event` rows. It is actually stronger than before. The old cast object is now refused by `withTenant` with `InvalidTenantContextError`, so without this change the test would have errored instead of testing RLS. Nothing was weakened.

**4. CI.** Run 37814940442 on head `8fabfa4`: `checks` success, `dependency-review` success, `secrets` success.

## Findings

No P1. No P2.

**P3-1 (MON-7a's file, not this lane): MON-7a's upgrade test builds its "previous schema" by leaving out 0103 rather than taking the migrations before it.**
- `prevention-checks.integration.test.ts:191` therefore now applies 0106 before 0103.
- It passes because the two migrations are independent. A later migration that depends on 0103 would make it fail for the wrong reason.
- **Fix:** at MON-7a's next touch, slice `MIGRATION_URLS` up to 0103's index, as the feed suite does at `:87-90`.

**P3-2: stale number in the docs.**
- `packages/db/MIGRATIONS.md:634` says the upgrade base is "currently through 0102". It is now through 0103.
- **Fix:** at the next touch.

**Carried from the 4cd7e04 review, still open and non-blocking:**
- the stale test comments at `practice-feed.integration.test.ts:87` and `:113`
- the lane note naming 0101 (`config/agent-lane-assignments.json`)
- the PR description still being the r3 receipt; write the merge commit message fresh

CI run: 37814940442 (https://github.com/ben2harwood-lgtm/jobguard/actions/runs/37814940442)
