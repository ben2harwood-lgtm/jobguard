Repair **TENANT-STAMP-1** round 2 (branch `codex/sandbox/tenant-stamp-1`, this worktree, PR #115, current head e7d4ba8). Keep all earlier work. Requirement: your original order `TENANT-STAMP-1.txt`.

**GitHub CI on e7d4ba8 (run 37657122047) failed in the PostgreSQL suite: 1 failed / 218 passed (40 files).** The browser step did not run because the earlier step failed.
- Failing test: `packages/db/test/shared-money-origin.integration.test.ts` > "SH-1 real PostgreSQL origin and track guarantees" > "fails reads/writes closed for missing, malformed and other-tenant contexts".
- Cause: line 92 is `await expect(withTenant(runtime, ctx("malformed"), async()=>undefined)).rejects.toMatchObject({code:"INVALID_TENANT_CONTEXT"})`. Your conversion made `ctx()` call `testTenantContext` → `verifiedTenantContextFromMembership`, which now throws synchronously for the malformed tenant id, so the error is thrown while building the arguments, before `withTenant` is called and before `expect(...)` receives a promise.

**Fix:**
1. Keep the test's meaning exactly: a malformed context handed to `withTenant` must be refused with `INVALID_TENANT_CONTEXT`. Make that line hand `withTenant` a malformed, unstamped context (for example `{ tenantId: "malformed" } as VerifiedTenantContext`, with a short comment that this deliberately exercises the refusal path), so `withTenant` itself rejects. Do not loosen the matcher, do not remove the line, do not change any other assertion.
2. Search every converted test for the same pattern: any place that deliberately passes a malformed, missing or invalid context to `withTenant` (or to a repository that calls it) and expects `INVALID_TENANT_CONTEXT` or a rejection. Each must still reach `withTenant` and be refused there, not throw earlier while building the argument. List each one you checked (file:line) in the receipt.
3. If you find any other test whose meaning your round-1 conversion changed, restore its meaning the same way and list it.

**Lane:** stay inside the `tenant-stamp-1` lane; if you touch a new file, add its exact path to that lane entry (one-line compact JSON style unchanged).
**Checks:** `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint` (may refuse a self-comparison; say so), `pnpm --filter @jobguard/db test` (unit), API unit tests, `pnpm build`. PostgreSQL and browser suites run in CI after the dispatcher pushes.
**Receipt:** `docs/verdicts/TENANT-STAMP-1/BUILDER_RECEIPT_round2.md`.
**Rules:** synthetic data only; no live providers, spending, real sends, production mode, decision approvals, deployment or release; never weaken, skip or delete an assertion; no new or longer timeouts; no migration.
**Deliver:** the receipt as your final message. Do not push, merge or open PRs.
