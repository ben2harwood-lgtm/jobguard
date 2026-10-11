VERDICT: PASS — bound to head 3a97344895811bfd3f5fa51d0af82149a051587d
Reviewer: fresh Claude Opus review agent spawned by the JobGuard integrator (8 Oct evening); did not build, repair or order any commit in this PR.

**In short:** 3a97344 is a clean, mechanical merge of main (6574a4e, MON-7a #121) into the already-passed 22d56b7. The PR's own changes are identical to what was reviewed before. The new prevention-check code only ever reaches `withTenant` through a context made by the stamped constructor, so the stricter check does not break it. CI `checks` is green on exactly this head, including the MON-7a database test.

## 1. Merge is mechanical
- `git show --remerge-diff 3a97344` is **empty**: no conflict resolution and no hand edits in the merge.
- `git diff 6574a4e...3a97344` against `git diff b552bdc...22d56b7` (b552bdc = merge-base of 22d56b7 and 6574a4e): **identical** once blob-index and hunk-offset lines are ignored. Both are 57 files, +769/−110.
- `git diff 22d56b7 3a97344` contains only MON-7a's 35 files (+2128/−4).

## 2. Interaction with MON-7a
- `packages/db/src/prevention-check-repository.ts:69,76`: `withTenant(this.pool, context, …)` passes the caller's `VerifiedTenantContext` through unchanged and imports the same module instance (`./tenant-context.js:7`), so the WeakSet stamp is preserved.
- `apps/api/src/prevention-check.application.ts:13,19`: the context comes from `PracticeAccess.job` → `authorizePracticeJob`, which is minted by `verifiedTenantContextFromMembership` (`packages/db/src/practice-session.ts:23`).
- `packages/db/test/prevention-checks.integration.test.ts:34,85`: both contexts come from `verifiedTenantContextFromMembership`. Its `withTenant` calls at `:89,91,93` use that stamped context.
- `apps/api/src/prevention-check.application.test.ts:17`: mocks `context: {}`, but the test asserts the command is rejected before the repository is called (`persistence` not called), so the mock context never reaches `withTenant`. This is harmless.
- `apps/web/app/api/jobs/[id]/prevention-checks/**`: the routes delegate to `workspaceApplication().preventionChecks`, with no direct `withTenant` and no context construction.
- MON-7a's `tenancy.integration.test.ts` hunks only add `counterparty_check` and `property_constraint_fact` to the RLS and owner catalogs. They merged cleanly beside this PR's `testTenantContext` helper (`:19-20`).
- Whole-tree grep at 3a97344 for `as VerifiedTenantContext` across apps/** and packages/**: the only hits outside the two constructors (`tenant-context.ts:39,53`) are deliberate negative tests: `tenant-context.test.ts:25,41`, `tenancy.integration.test.ts:143`, `shared-money-origin.integration.test.ts:98` and `evidence-packs.integration.test.ts:89`. No production code builds a context by hand.

## 3. CI
- Run **37810151872** (headSha 3a97344): `checks` job 113424594199 **success**, `dependency-review` success, `secrets` success.
- In that run, `prevention-checks.integration.test.ts` (11), `prevention-check.application.test.ts` (5), `prevention-checks.test.ts` (29) and `tenant-context.test.ts` (21) all passed. The browser step passed 258 tests. The build includes both prevention-check routes.
- Locally, `tenant-context.test.ts` passed 21/21. The api unit test could not load locally only because the workspace `@jobguard/db` dist is unbuilt in the worktree (this is environmental, and I did not build it). CI covers it.

## Findings
- None at P1 or P2.
- **P3 (follow-up, optional):** `apps/api/src/prevention-check.application.test.ts:17` uses an unstamped `context: {}` mock. It is safe today because the test never reaches persistence, but a stamped test helper would keep the pattern consistent if that test is ever extended to a passing path.
