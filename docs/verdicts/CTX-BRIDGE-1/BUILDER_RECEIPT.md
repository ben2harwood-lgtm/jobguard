# CTX-BRIDGE-1 builder receipt

Builder: Codex; issued builder designation GPT-6.1 Sol, high reasoning.
Date: 12 October 2026. Lane: RED. Branch: `codex/sandbox/ctx-bridge-1`.
Base and current Git HEAD: `a0963f405fee263cf2bfe8effe68bbeaa9ae1ff6`. Review head H1: not yet assigned; the dispatcher commits this working tree. No commit, stage, checkout, push, PR, merge, acceptance or release was performed by the builder.

Authority: issued order records Ben's "yes to all" at 16:20 on 12 October and the coordinator's issue instruction around 16:25. Q1 is MET; Q2/Q3 and Q3a/Q4/Q5/Q7/Q8/Q9 are adopted. Coordinator alone edits the two named security tests after both code checks pass; any subsequent bridge correction starts a new round and requires coordinator pin updates.

The shared bridge uses the persisted contractor practice session as the sole source of tenant and membership. Audit-export authorization, actor selection, refusal awaiting, status/body mapping and repository calls remain unchanged, apart from the approved extra read-only lookup and explicit disagreement refusal. The bridge does not grant permissions and remains `synthetic_demo` only. No migration, dependency, money, commercial policy, provider, route, controller, OpenAPI, UI or environment configuration changed. No new operational alert or external action.

`origin/main` moved during work to `fdf6d2a1ac81babc3149f69d75c2aa75c6c806ab` (FIXLATER-4, PR #144). The dispatch base was the latest main when inspected. The audit-export integration file remains byte-identical to the dispatch base; FIXLATER-4 changed its port setup and helper import upstream. The builder did not copy, reverse or edit those upstream changes. The dispatcher handles catch-up; compare this task against its immutable base/merge base, not two endpoints after unrelated main changes. Shared `packages/db/src/index.ts` and lane-registry edits serialize with other pieces. ENT-3a switches in its own branch only after this merges.

## Changed files

- `config/agent-lane-assignments.json`: exactly one compact line, after ci-time-1 and before d13-16-ids; 11 allowed paths, including the two coordinator-only test paths.
- `packages/db/src/contractor-session-context.ts`: new bridge, one maker call.
- `packages/db/src/index.ts`: one appended export line.
- `packages/db/test/contractor-session-context.test.ts`: new [B1]–[B8] unit boundary tests.
- `packages/db/test/contractor-session-context.integration.test.ts`: new [D1]–[D3] real PostgreSQL tests, written before implementation, NOT RUN.
- `apps/api/src/audit-export/audit-export.application.ts`: only the specified import, deleted imports, class comment and resolveContext method.
- `apps/api/src/audit-export/audit-export.context.test.ts`: new [X1]–[X4] tests with a file-local bridge stand-in.
- `docs/contracts/audit-export-v1.md`: exactly the one refusal-context sentence corrected.
- `docs/verdicts/CTX-BRIDGE-1/BUILDER_RECEIPT.md`: this receipt.

The builder edited neither the security test nor ENT-4b's test that pins it, and wrote no patch to either.

## Acceptance evidence

BUILT denotes implemented coverage; executed checks are stated separately. Database/browser guarantees are not claimed from stand-ins.

| ID | Status and test evidence |
| --- | --- |
| B1 | BUILT and unit-run: `[B1] refuses mode %s before database access` in `packages/db/test/contractor-session-context.test.ts` (four modes). |
| B2 | BUILT and unit-run: `[B2] refuses invalid session %s before lookup` in the same file (seven invalid inputs). |
| B3 | BUILT and unit-run: `[B3] propagates the exact unknown-session and database error objects`. |
| B4 | BUILT and unit-run: `[B4] returns the frozen stamped context and rejects a frozen look-alike before connecting`; recording pool observes BEGIN, tenant setting, COMMIT and release. |
| B5 | BUILT and unit-run: `[B5] performs one lookup with one argument and passes the exact member to the maker`; maker spy calls through to the merged maker, exact argument/result identity checked. |
| B6 | BUILT and unit-run: `[B6] accepts two required parameters, ignores extra authority fields and exports only the bridge`. |
| B7 | BUILT and unit-run: `[B7] makes a fresh context on every call and has no keeper or module-level state`. |
| B8 | BUILT and unit-run: `[B8] mirrors the single direct maker return and unaliased signature the scanner will review`; AST also excludes assertions and checks two required parameter types and return type. This mirror is not a scanner PASS once named. |
| D1 | BUILT, NOT RUN: `[D1] reads only the persisted session tenant's real organisation rows` in `packages/db/test/contractor-session-context.integration.test.ts`, both directions and nonempty positive controls. |
| D2 | BUILT, NOT RUN: `[D2] refuses an unknown uuid and never exchanges tenants between sessions`. |
| D3 | BUILT, NOT RUN: `[D3] attributes a revoked member to the session tenant without granting query authority`. |
| X1 | BUILT and unit-run: `[X1] passes the bridge's exact context to %s with the application's pool and session` in `apps/api/src/audit-export/audit-export.context.test.ts`, list/create/refuse. Marker only reaches repository stand-ins, never withTenant. |
| X2 | BUILT and unit-run: `[X2] preserves missing/unknown-session errors without a refusal and active-member list/actor results`; `[X2] awaits exactly one durable %s refusal before 403 and preserves refusal failure as 503`; `[X2] preserves held mode %s before database access`. Expected results match merged tests. |
| X3 | BUILT and unit-run: `[X3] refuses disagreeing tenant lookups and bridge UNAUTHENTICATED on %s`, list/create/refuse-list/refuse-create; case-insensitive uuid comparison and unchanged propagation of other errors also covered. |
| X4 | BUILT and unit-run: `[X4] removes the hand-made adapter and calls the shared bridge once in the typed method`. Unchanged span hashes below are receipt evidence, not standing byte-pinning tests, per rule 12. |
| X5 | Executed unedited: merged `apps/api/src/audit-export/audit-export.application.test.ts` passes in the 30-test combined API run. |
| S1 | Executed unedited: 143 PASS / exactly 2 expected FAIL, 145 total. Full reports below. Scanner, seven pinned sources and ENT-4b test unchanged. |
| S2 | NOT RUN: reviewers' throwaway patch runs and H2 scanner/ENT-4b S9 runs are coordinator/integrator work. |
| S3 | NOT RUN: merged PostgreSQL/CLI/page/browser regression runs remain required; five merged audit-export test files unchanged at dispatch base. |

C1: no web workflow changes; existing slice preserved. C2: shared application service retained; OpenAPI verification recorded below. C3: explicit synthetic guard before access. C4: no schema or money change. C5: session lookup only, current authorization checks unchanged. C6: Vitest executed; real PostgreSQL coverage written first and held for helper. C7: inapplicable to this change. C8: lane entry, fail-closed checks retained, RED independent verdicts and separate acceptance remain outstanding.

## Bridge signature, full text and informational digest

Signature: `export async function contractorSessionContext(pool: Pool, sessionId: string): Promise<VerifiedTenantContext>`.

Informational working-tree SHA-256: `a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c`.
The coordinator computes the pin afresh from committed H1; this receipt value is never the source of the pin.

```typescript
import type { Pool } from "pg";
import { z } from "zod";
import { ContractorError } from "@jobguard/core";
import { ContractorRepository } from "./contractor-repository.js";
import { verifiedTenantContextFromMembership, type VerifiedTenantContext } from "./tenant-context.js";

/**
 * Shared contractor-session bridge: synthetic practice only, with no pilot or
 * production authority. Its sole export accepts two required parameters: the
 * server's own pg Pool (the same pool the caller's repositories use) and the
 * session value read by the transport from the jg_session cookie.
 *
 * It never accepts a tenant, membership, identity user, role, member description,
 * AuthenticatedMembership, requested tenant, request, headers, supplying callback,
 * or options/flag to skip or replace the session lookup. Only the session value
 * can influence which tenant comes out. There are no classes, module-level state
 * or caches in this file.
 *
 * In order and nothing more: refuse any JOBGUARD_ENV other than synthetic_demo
 * with ContractorError MODE_FORBIDDEN before database access; refuse any session
 * value that is not a string uuid with ContractorError UNAUTHENTICATED before
 * database access; resolve it through an instance of the merged
 * ContractorRepository using the caller's pool; pass that exact, unaltered member
 * to verifiedTenantContextFromMembership and return its very object whole.
 * The persisted session lookup is the only source of tenant and member. Unknown
 * session errors and database failures propagate unchanged. This file has exactly
 * one maker call and never rebuilds, spreads or alters the member.
 *
 * This proves only which company a persisted session belongs to; it grants
 * nothing. It deliberately does not check active membership or permissions:
 * audit export needs a revoked member's context to record its refusal. Every
 * caller keeps its database authorization checks unchanged.
 *
 * Callers bind the result to a const annotated VerifiedTenantContext under its
 * own name. They may pass it whole to a repository, return it whole from an
 * ordinary function/method, or read .tenantId as a value. They never retain it in
 * fields, containers, mutable bindings, caches or escaping closures; destructure,
 * spread, copy or use object helpers on it; compare or branch on it except a null
 * check; or return it from a closure passed as an argument. This bridge returns
 * the maker's result directly.
 */
export async function contractorSessionContext(pool: Pool, sessionId: string): Promise<VerifiedTenantContext> {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new ContractorError("MODE_FORBIDDEN");
  if (!z.string().uuid().safeParse(sessionId).success) throw new ContractorError("UNAUTHENTICATED");
  const member = await new ContractorRepository(pool).resolveSession(sessionId);
  return verifiedTenantContextFromMembership(member);
}
```

## Exact application edit boundaries

At dispatch base, line 3 before:

```typescript
import { AuditExportError, AuditExportRepository, ContractorRepository, AUDIT_EXPORT_NOTICE, AUDIT_EXPORT_SANDBOX } from "@jobguard/db";
```

After (line 3):

```typescript
import { AuditExportError, AuditExportRepository, ContractorRepository, contractorSessionContext, type VerifiedTenantContext, AUDIT_EXPORT_NOTICE, AUDIT_EXPORT_SANDBOX } from "@jobguard/db";
```

Only these two imports (base lines 4–5) were removed:

```typescript
import { resolveVerifiedTenantContext } from "../auth/principal-bridge.js";
import { AuthError, type AuthProvider } from "../auth/auth-provider.js";
```

Class comment before (base line 12):

```typescript
/** Uses the existing authenticated bridge rather than minting a new synthetic context. No tenant input is accepted. */
```

After (line 10):

```typescript
/** Uses the shared contractor-session bridge; the persisted session supplies the tenant. No tenant input is accepted. */
```

resolveContext before (base lines 44–55; the two legacy fixed value occurrences are omitted solely to obey standing rule 11, every other character below is the original method):

```typescript
  private async resolveContext(sessionId: string, member: Awaited<ReturnType<AuditExportApplication["member"]>>) {
    // This read-only adapter consumes ENT-1's persisted session lookup. The role is deliberately inert:
    // the repository rechecks current tenant-wide owner/admin grants under the shared ENT-1 lock.
    const denied = async (): Promise<never> => { throw new AuthError("UNAUTHENTICATED"); };
    const provider: AuthProvider = {
      requestCode: denied, verifyCode: denied,
      authenticate: async token => token === sessionId ? { identityUserId: member.identityUserId, sessionId, csrfToken: [legacy fixed value omitted under rule 11] } : undefined,
      findMembership: async (principal, tenantId) => principal.identityUserId === member.identityUserId && tenantId === member.tenantId ? { id: member.membershipId, identityUserId: member.identityUserId, tenantId: member.tenantId, role: "read_only", email: "generated@fictional.invalid" } : undefined,
    };
    // Browser origin checks are in both HTTP adapters; these values are internal bridge credentials, never user input.
    return resolveVerifiedTenantContext(provider, { sessionToken: sessionId, requestedTenantId: member.tenantId, csrfToken: [legacy fixed value omitted under rule 11], origin: "https://audit-export.fictional.invalid" }, "https://audit-export.fictional.invalid");
  }
```

The original exact bytes remain readable at `a0963f405fee263cf2bfe8effe68bbeaa9ae1ff6:apps/api/src/audit-export/audit-export.application.ts`; original method SHA-256 `61aace8489432e708f8175d11c789c0e27aa4a7ab243e1d90d3d14ba6a68f648`. The builder will not add credential-shaped fixed strings to a document.

resolveContext after (lines 42–52):

```typescript
  private async resolveContext(sessionId: string, member: Awaited<ReturnType<AuditExportApplication["member"]>>): Promise<VerifiedTenantContext> {
    try {
      const context: VerifiedTenantContext = await contractorSessionContext(this.pool, sessionId);
      const tenantId = context.tenantId;
      if (tenantId.toLowerCase() !== member.tenantId.toLowerCase()) throw new AuditExportError("AUDIT_EXPORT_UNAUTHENTICATED");
      return context;
    } catch (error) {
      if ((error as { code?: string }).code === "UNAUTHENTICATED") throw new AuditExportError("AUDIT_EXPORT_UNAUTHENTICATED");
      throw error;
    }
  }
```

Every other application line is byte-identical to the dispatch base. Verified by content-delimited comparisons, including all three original call sites:

- Span A: `export class AuditExportApplication {` up to (excluding) `  private async resolveContext`: SHA-256 `5e31f765ea278300c365c1b3f7609bab932e1e4e437a47e7df0fa976a161f0f6` before and after.
- Span B: `  async list(` to EOF: SHA-256 `096c2ea3fa8cc4a8311ef42e44260f0133c76776313a0c98c804c3aed77c0673` before and after.
- Base lines 1–2 and 6–11 unchanged; only named imports/comment/method changed.

## Unedited file fingerprints

Compared raw bytes with `git show a0963f405fee263cf2bfe8effe68bbeaa9ae1ff6:<path>`. Scanner, pinned seven and all other listed files also equal current origin/main except the audit-export integration test changed by FIXLATER-4 after dispatch. This task made no changes to that file.

| File | SHA-256 | Equal dispatch base |
| --- | --- | --- |
| `apps/api/src/auth/context-boundary.test.ts` | `7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d` | Yes |
| `packages/db/src/practice-session.ts` | `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14` | Yes |
| `packages/db/src/contractor-repository.ts` | `56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c` | Yes |
| `packages/db/src/contractor-party-repository.ts` | `e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0` | Yes |
| `packages/db/src/work-order-repository.ts` | `4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3` | Yes |
| `packages/db/src/sor-repository.ts` | `45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5` | Yes |
| `packages/db/src/job-scheduling-repository.ts` | `ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d` | Yes |
| `packages/db/src/work-order-fixtures.ts` | `cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386` | Yes |
| `apps/api/src/audit-export/audit-export.application.test.ts` | `8bac90b630ea3f782c6be2f811fdcbf6ad154b262cfb7ee592547794590ae1bd` | Yes |
| `packages/db/test/audit-export.integration.test.ts` | `99d1b31a941ada69c31b0d9184b00ce8cbebf0efa0c14b6dbec749529ce70c45` | Yes |
| `packages/db/test/verify-audit-export-cli.test.ts` | `bce6ddb9e84724e3a58cc631f92e878f8f5ff7eade68f6b13c6c2c482fdc1bfe` | Yes |
| `apps/web/app/admin/contractor/audit-exports/page.test.tsx` | `d4da63e68075f6370c06964ceb6016ebb1984796cf749e01f2e08f295488abf8` | Yes |
| `apps/web/e2e/ENT-10b.spec.ts` | `3acbff5c76f607296ca0c415ec3da4ff38f6915e985f32714e771d1218087023` | Yes |
| `packages/db/test/extra-origin.integration.test.ts` | `3d49f5722de606c91b1f2802e59617a230d9fc7a2ceeb320cf50e4cf2cd9c68e` | Yes |
| `packages/db/src/tenant-context.ts` | `9237013c368deeec3d14098b030264dbd6cc3e57534e4cbc237cad06aa2b4b0f` | Yes |

## Failed-first evidence

All three new test files were written before the implementation. Imported packages were built before unit runs. PostgreSQL tests were not executed.

First DB unit command: `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/contractor-session-context.test.ts`, exit 1, one failed suite, zero collected tests because the bridge module did not yet exist:

```text

 RUN  v4.1.11 /Users/benharwood/Claude/Projects/my-new-project/.worktrees/ctx-bridge-1/packages/db

 ❯ test/contractor-session-context.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/contractor-session-context.test.ts [ test/contractor-session-context.test.ts ]
Error: Cannot find module '../src/contractor-session-context.js' imported from /Users/benharwood/Claude/Projects/my-new-project/.worktrees/ctx-bridge-1/packages/db/test/contractor-session-context.test.ts
 ❯ test/contractor-session-context.test.ts:10:1
      8| import * as tenantContext from "../src/tenant-context.js";
      9| import type { AuthenticatedMembership } from "../src/tenant-context.js…
     10| import * as bridge from "../src/contractor-session-context.js";
       | ^
     11|
     12| function recordingPool() {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  no tests
   Start at  16:26:28
   Duration  2.89s (transform 1.10s, setup 0ms, import 0ms, tests 0ms, environment 0ms)

undefined
/Users/benharwood/Claude/Projects/my-new-project/.worktrees/ctx-bridge-1/packages/db:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run --maxWorkers=2 test/contractor-session-context.test.ts
```

First API unit command: `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/audit-export/audit-export.context.test.ts`, exit 1, 9 FAIL / 7 PASS / 16 total. All three [X1] cases failed because `bridge.mock.calls` was `[]` instead of `[[application pool, session value]]`; the merged hand-made adapter was still in place. Four [X3] disagreement paths, the [X3] propagation case and [X4] adapter-removal case also failed. The full X4 diagnostic reproduced the old adapter, so it is not copied into this document under rule 11. Original failed-first log is temporary local evidence at `/private/tmp/ctx-bridge-runs/first-api-unit.log`.

During source review before the passing unit run, corrected new [B8]'s cast detector: a text pattern for angle-bracket assertions also matched the valid Promise return annotation. AST assertion detection now checks actual casts without rejecting the required return type. No merged test changed.

## Scanner run: exact expected reports

Command: `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/context-boundary.test.ts`, exit 1 (expected), 143 PASS / 2 FAIL / 145 total. Exactly two messages in the first case, only the new file in the second; no caller violation. Full output:

```text

 RUN  v4.1.11 /Users/benharwood/Claude/Projects/my-new-project/.worktrees/ctx-bridge-1/apps/api

 ❯ src/auth/context-boundary.test.ts (145 tests | 2 failed) 3712ms
     × holds for the real repository: only the bridge, its definition, the worker queue, the retained synthetic sandbox and the rehearsal construct a tenant context 2513ms
     × pins the approved list to files that exist and still construct, and it covers every file the real tree constructs in 37ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/auth/context-boundary.test.ts > M0-6L sole-constructor boundary across all application source > holds for the real repository: only the bridge, its definition, the worker queue, the retained synthetic sandbox and the rehearsal construct a tenant context
AssertionError: expected [ …(2) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "packages/db/src/contractor-session-context.ts is not an approved retained synthetic file; a new caller of the tenant-context constructor needs a reviewed edit to the approved list",
+   "packages/db/src/contractor-session-context.ts:46 synthetic constructor argument must be a fixed, plain literal object (one top-level const, no spread, computed key, accessor or duplicate property)",
+ ]

 ❯ src/auth/context-boundary.test.ts:746:39
    744|     expect(files.length).toBeGreaterThan(200);
    745|     expect(files.map(f => f.path)).toEqual(expect.arrayContaining([REA…
    746|     expect(boundaryViolations(files)).toEqual([]);
       |                                       ^
    747|     // The real-user path has exactly one bridge. Other calls are the …
    748|     const constructors = files.filter(f => occurrences(f).found.some(o…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/auth/context-boundary.test.ts > M0-6L round 3: the retained synthetic exception is bound to the authoritative fixture constants > pins the approved list to files that exist and still construct, and it covers every file the real tree constructs in
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "packages/db/src/contractor-session-context.ts",
+ ]

 ❯ src/auth/context-boundary.test.ts:1218:148
    1216|     const special = new Set([REAL, DEFINITION, WORKER, REHEARSAL]);
    1217|     expect(APPROVED_PRACTICE_FILES.filter(path => !present.has(path) |…
    1218|     expect(constructing.filter(path => !special.has(path) && !APPROVED…
       |                                                                                                                                                    ^
    1219|     // The authoritative fixture module really holds literal UUID cons…
    1220|     const seed = files.find(f => f.path === "packages/db/src/demo-seed…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 143 passed (145)
   Start at  16:30:01
   Duration  4.97s (transform 690ms, setup 0ms, import 1.07s, tests 3.71s, environment 0ms)

undefined
/Users/benharwood/Claude/Projects/my-new-project/.worktrees/ctx-bridge-1/apps/api:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run --maxWorkers=2 src/auth/context-boundary.test.ts
```

## Commands and environment

Node `v24.17.0`; pinned pnpm `10.28.1`; Vitest `4.1.11`; turbo `2.10.12`. Dependencies preinstalled; no install or package-download command was issued. The default launcher was interrupted and not reused. The default pnpm launcher emitted a pnpm 11 warning and stalled during `pnpm --version`; it was interrupted (exit 130). Thereafter every pnpm call uses `PATH=/private/tmp/ctx-bridge-bin:$PATH`, a temporary shim pointing to the already cached `~/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. Root checks also use `TURBO_CONCURRENCY=2`, so the requested `pnpm build` has bounded concurrency. One test run at a time, no whole test suite, never more than two files in a local Vitest run.

Build cache logs replay other worktree paths; those are cache entries, not commands run there by this builder. Turbo printed `WARNING  IO error: Operation not permitted (os error 1)` about its shared cache after successful builds. No cache-permission workaround was attempted.

| Command (in actual order) | Exit and observed result |
| --- | --- |
| `pnpm turbo run build --concurrency=2 --filter=@jobguard/db...` (before failing-first B run) | 0; 3/3 build tasks successful, 2 cached. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/contractor-session-context.test.ts` | 1; missing module, 1 failed suite, 0 tests. |
| `pnpm turbo run build --concurrency=2 --filter=@jobguard/api...` (before failing-first X run) | 0; 6/6 successful, 4 cached. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/audit-export/audit-export.context.test.ts` | 1; 9 failed / 7 passed / 16 total. |
| `pnpm turbo run build --concurrency=2 --filter=@jobguard/db...` | 0; 3/3 successful, 2 cached. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/contractor-session-context.test.ts src/tenant-context.test.ts` | 0; 2 files, 38 tests passed. |
| `pnpm turbo run build --concurrency=2 --filter=@jobguard/api...` | 0; 6/6 successful, 4 cached. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/audit-export/audit-export.context.test.ts src/audit-export/audit-export.application.test.ts` | 0; 2 files, 30 tests passed. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/context-boundary.test.ts` | 1 expected; 143 passed / 2 failed / 145 total. |
| `pnpm typecheck` | 0; 7/7 package tasks successful, 4 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | 0; core purity (129 TS files), lane, money and commercial guards passed; 7/7 package tasks successful, 4 cached. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; exactly the 9 task files permitted, merge-base comparison against advanced origin/main. |
| `pnpm build` | 0; 7/7 build tasks successful, 4 cached; Next production build complete. |
| `pnpm openapi:check` | 1; sandbox tsx IPC `listen EPERM`, exact report below. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; no output; generated OpenAPI equals committed artifact. Prescribed fallback after known EPERM. |

Read-only byte comparison against changing `origin/main` initially exited 1 because FIXLATER-4 moved the audit-export integration file upstream. Repeating against immutable dispatch base verified all listed files unchanged; no file was edited in response.

A read-only inspection `ps -axo pid,ppid,etime,%cpu,command | rg 'nest build|tsc|pnpm|turbo' | tail -15` produced `zsh:1: operation not permitted: ps`; inspection stopped, no alternate process inspection attempted. This was a sandbox command refusal, not an approval-review escalation.

OpenAPI launcher environment failure (observed in full; fallback explicitly authorized by the issued order):

```text

> jobguard@ openapi:check /Users/benharwood/Claude/Projects/my-new-project/.worktrees/ctx-bridge-1
> pnpm --filter @jobguard/api openapi:check


> @jobguard/api@0.0.0 openapi:check /Users/benharwood/Claude/Projects/my-new-project/.worktrees/ctx-bridge-1/apps/api
> tsx src/generate-openapi.ts --check

node:net:1987
      const error = new UVExceptionWithHostPort(rval, 'listen', address, port);
                    ^

Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/15592.pipe
    at Server.setupListenHandle [as _listen2] (node:net:1987:21)
    at listenInCluster (node:net:2066:12)
    at Server.listen (node:net:2188:5)
    at file:///Users/benharwood/Claude/Projects/my-new-project/.worktrees/ctx-bridge-1/node_modules/.pnpm/tsx@4.20.3/node_modules/tsx/dist/cli.mjs:53:31537
    at new Promise (<anonymous>)
    at createIpcServer (file:///Users/benharwood/Claude/Projects/my-new-project/.worktrees/ctx-bridge-1/node_modules/.pnpm/tsx@4.20.3/node_modules/tsx/dist/cli.mjs:53:31515)
    at async file:///Users/benharwood/Claude/Projects/my-new-project/.worktrees/ctx-bridge-1/node_modules/.pnpm/tsx@4.20.3/node_modules/tsx/dist/cli.mjs:55:459 {
  code: 'EPERM',
  errno: -1,
  syscall: 'listen',
  address: '/var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/15592.pipe',
  port: -1
}

Node.js v24.17.0
/Users/benharwood/Claude/Projects/my-new-project/.worktrees/ctx-bridge-1/apps/api:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @jobguard/api@0.0.0 openapi:check: `tsx src/generate-openapi.ts --check`
Exit status 1
 ELIFECYCLE  Command failed with exit code 1.
```

Root build warnings: Next inferred the parent workspace root from multiple lockfiles; existing CSS autoprefixer `end` alignment warnings and webpack warning-serialization messages. Build completed successfully; no web/config change was made.

Final cleanup removed only untracked generated artifacts: `apps/web/.next`, `apps/web/.turbo`, `apps/web/tsconfig.tsbuildinfo`, `apps/api/dist`, `apps/api/.turbo`, `packages/core/dist`, `packages/core/.turbo`, `packages/config/dist`, `packages/config/.turbo`, `packages/storage/dist`, `packages/storage/.turbo`, `packages/ai/dist`, `packages/ai/.turbo`, `packages/db/dist`, `packages/db/.turbo`, `.pnpm-store`. No test-results directory remained. Dependencies in node_modules were preserved. Temporary run logs and the cached-pnpm shim remain outside the working tree under `/private/tmp/ctx-bridge-runs` and `/private/tmp/ctx-bridge-bin`. `git diff --check` passed; final status contains exactly the nine lane-owned files above. Tracked diff is four existing files, 15 inserted / 16 removed lines; the five new files (including this receipt) appear as untracked until the dispatcher stages them.

## NOT RUN and helper handoff

Every item below is NOT RUN (sandbox cannot start PostgreSQL / a browser). No database or browser socket was started, and no real-provider request, identity enrollment or commercial send occurred.

1. `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/contractor-session-context.integration.test.ts test/audit-export.integration.test.ts test/verify-audit-export-cli.test.ts` — D1–D3 plus merged audit-export/CLI regression, three files maximum.
2. `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/extra-origin.integration.test.ts` — unchanged ENT-4b [S9] must pass on H1; after coordinator H2 it must pass with exactly its single value replaced.
3. `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 app/admin/contractor/audit-exports/page.test.tsx` — merged page unit suite; held for helper under the order's S3.
4. `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop ENT-10b.spec.ts` — both existing browser projects.
5. S2 patched throwaway-copy scanner and ENT-4b runs, and full GitHub checks on H2 — not performed by the builder; both reviewers/coordinator own these steps.
6. Whole-repository `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, other unlisted suites — not run under explicit memory/sandbox limits. No migration change. `pnpm eval` inapplicable: no AI/parser/policy change. Clean frozen-install proof not rerun: installed dependencies supplied; downloads prohibited.

## Self-review

Re-read the entire tracked diff and all new source/tests against the order. Verified the exact function signature, sole export, mode/uuid guards before lookup, sole maker call, exact member identity, direct whole-object return, absence of mutable/module state and context keepers. Verified the changed application method binds an explicitly typed const, reads only tenantId, checks uuid values case-insensitively, translates only UNAUTHENTICATED and propagates other failures. Original actor/auth/refusal/list/create call sites and both protected spans remain identical.

Verified one new maker call across added application source (no new test maker calls either), no context casts, no new dependency or SQL implementation/migration/routine, no route/controller/OpenAPI/UI change and no edit to any merged test, scanner, seven pinned sources, tenant-context, AGENTS or BUILD_PLAN. Every new test title begins with its B/D/X ID. All criteria have explicit coverage/run evidence above; S2/S3 and database guarantees stay held. No forbidden wording or new long literal beside a credential-shaped assignment was added. The receipt omits only the deleted adapter's two long fixed values to respect standing rule 11. Unchanged spans live in receipt evidence rather than standing hash assertions under rule 12.

The one test-authoring correction was the [B8] AST cast check described above. No implementation repair was needed for the passing unit or expected scanner results. Final checks and generated-artifact cleanup are recorded above. The final added-line inspection found no credential-shaped long fixed assignments; no broader test run or permission workaround was attempted.

## Remaining acceptance and release steps

Mac helper executes the NOT RUN list; GitHub H1 API tests should be red only on the two exact scanner cases. A fresh Claude Opus code check and separate Sol check bind to committed H1; both independently dry-run the prepared patches in throwaway copies and confirm full scanner success. Only after both PASS does the coordinator compute the committed bridge hash, edit the scanner's three lists/count, compute the scanner's new hash, update ENT-4b's one pinned value, and commit those two files only as H2. GitHub must be fully green on H2; both reviewers confirm the prepared H1..H2 checklist. Separate acceptance/merge then follows. Keep the bridge bytes stable after both code checks. ENT-3a catches up main and switches its own adapter afterwards, under its own tests/reviews.

Deferred items already acknowledged in the order: three existing call-site context annotations/scanner propagation; stale merged test title; operations description of scanner categories. BUILD_PLAN is integrator-only, so these are handed over here, not edited by the builder.

Builder receipt only — not independently verified, not accepted.

## Mac verification (12 Oct)

Written by a Mac-side helper (Claude Sonnet 5.5) on 12 Oct 2026 about 17:50 to 18:05 BST for the JobGuard dispatcher. macOS 26.4, node v24.17.0, pnpm 10.28.1. Every heavy command ran through `~/.local/bin/heavy-slot`, one at a time, vitest `--maxWorkers=2`, at most three test files per run, free memory 66 to 72 percent before each. This section records observed results only; it is not a review or an acceptance.

**Branch state.** Before: head `3312a5097c5689c1d28980a5d8f7d0206f440850`, tree clean, merge-base `a0963f4`. `origin/main` had moved to `17c82ee2822cba9be364297d64e8754b43a57013` (FIXLATER-4 #144, PLAN-ENT4C-UNLINK-ROLES #148). I ran `git merge --no-ff origin/main` from the worktree: no conflicts; the only shared file touched on both sides was `config/agent-lane-assignments.json` (auto-merged, both lines kept). The merge commit is `e34d6c6277297b1113088feaf93c1d11ba57e41e` ("Merge origin/main (17c82ee) into codex/sandbox/ctx-bridge-1 - catch-up"). The bridge file is byte-identical across the merge: blob `f0a162c198419909ca7aca4b3394520876c6ac99` at both `3312a50` and `e34d6c6`.

**Files changed against `origin/main` (`git diff --stat origin/main...HEAD`, working directory the ctx-bridge-1 worktree):** `apps/api/src/audit-export/audit-export.application.ts` (modified), `apps/api/src/audit-export/audit-export.context.test.ts` (new), `config/agent-lane-assignments.json` (+1 line), `docs/contracts/audit-export-v1.md` (modified), `docs/verdicts/CTX-BRIDGE-1/BUILDER_RECEIPT.md` (new), `packages/db/src/contractor-session-context.ts` (new), `packages/db/src/index.ts` (+1 line), `packages/db/test/contractor-session-context.integration.test.ts` (new), `packages/db/test/contractor-session-context.test.ts` (new). 9 files. No existing test file is modified: the only test files in the diff are the three new ones (`git diff --name-status origin/main HEAD` shows A, A, A for them and nothing for any merged test). `git diff --quiet origin/main HEAD -- apps/api/src/auth/context-boundary.test.ts packages/db/test/extra-origin.integration.test.ts` exits 0.

**Bridge file.** `packages/db/src/contractor-session-context.ts`, sha256 `a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c` (same in the working tree, at `3312a50` and at `e34d6c6`), ASCII text, 0 carriage returns, 0 non-ASCII bytes, exactly one `verifiedTenantContextFromMembership(` in the file.

**Dist rebuilt first (gitignored), each alone through heavy-slot, working directory the worktree root:**

| Command | Exit |
|---|---|
| `pnpm --filter @jobguard/core build` | 0 |
| `pnpm --filter @jobguard/db build` | 0 |
| `pnpm --filter @jobguard/storage build` | 0 |
| `pnpm --filter @jobguard/config build` | 0 |
| `pnpm --filter @jobguard/ai build` | 0 |

**Test, typecheck and lint runs (working directory the worktree root; each prefixed `~/.local/bin/heavy-slot <label>`):**

| # | Command | Exit | Counts |
|---|---|---|---|
| 1 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/contractor-session-context.test.ts src/tenant-context.test.ts` | 0 | 2 files passed, 38 tests passed |
| 2a | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/contractor-session-context.integration.test.ts` (first try) | 1 | environment fault, 3 skipped: `Unknown Error: Postgres init script exited with code null. Please check the logs for extra info. The data directory might already exist.` Cause: embedded PostgreSQL native symlinks not hydrated in this worktree. Fix: `node scripts/hydrate-symlinks.js` run from `node_modules/.pnpm/@embedded-postgres+darwin-arm64@16.10.0-beta.15/node_modules/@embedded-postgres/darwin-arm64` (node_modules only). |
| 2b | same command, rerun after the hydrate | 0 | 1 file passed, 3 tests passed ([D1], [D2], [D3]) |
| 3 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/audit-export.integration.test.ts test/audit.integration.test.ts test/verify-audit-export-cli.test.ts` (all unedited) | 0 | 3 files passed, 30 tests passed |
| 4 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/audit-export/audit-export.context.test.ts src/audit-export/audit-export.application.test.ts` (merged file unedited) | 0 | 2 files passed, 30 tests passed |
| 5 | `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/context-boundary.test.ts` (unedited, old name list) | 1 (expected) | 1 file failed, 145 tests: 2 failed, 143 passed |
| 6 | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/extra-origin.integration.test.ts` (unedited, includes [S9]) | 0 | 1 file passed, 32 tests passed |
| 7 | `pnpm typecheck` | 0 | turbo 7 of 7 tasks successful (4 replayed from the shared turbo cache, 3 executed: db, api, web) |
| 8 | `LANE_BASE_REF=origin/main pnpm lint` | 0 | core purity passed (129 files); lane boundary passed; money arithmetic check passed; turbo 7 of 7 successful (4 cached) |
| 9 | `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | "Lane boundary passed", lane `ctx-bridge-1`, base `17c82ee`, head `e34d6c6`, the 9 files listed above |

**Run 5 is the expected scanner result, and only that.** Exactly the two cases the order names failed, for exactly the stated reason, and no other case failed (143 of 145 passed). Failure messages as printed:
1. `M0-6L sole-constructor boundary across all application source > holds for the real repository: only the bridge, its definition, the worker queue, the retained synthetic sandbox and the rehearsal construct a tenant context`: `expected [ ...(2) ] to deeply equal []`, received `"packages/db/src/contractor-session-context.ts is not an approved retained synthetic file; a new caller of the tenant-context constructor needs a reviewed edit to the approved list"` and `"packages/db/src/contractor-session-context.ts:46 synthetic constructor argument must be a fixed, plain literal object (one top-level const, no spread, computed key, accessor or duplicate property)"`.
2. `M0-6L round 3: the retained synthetic exception is bound to the authoritative fixture constants > pins the approved list to files that exist and still construct, and it covers every file the real tree constructs in`: `expected [ Array(1) ] to deeply equal []`, received `["packages/db/src/contractor-session-context.ts"]`.
Both exist only because the new file is not yet on the scanner's list. That is the expected reason the coordinator's commit to the two security tests is needed.

**Prepared patches (outside the repository), made and proved.** Directory `~/.local/share/full-steam/jg-runs/ctx-bridge-patch-2026-10-11/ready/`. The two templates were used unchanged (sha256 `926f837e...` and `a77d7920...` as the README states). Value 1 (bridge file sha256, above) went into `context-boundary.patch`; value 2, the sha256 of the scanner after patch 1, is `d082694df3dc005461d92ac79f275f31525d35c3e022948b47efa0ed7f9a772f`, and went into `extra-origin-s9.patch`. Drift check on the branch: the scanner is `7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d` (blob `bc63da29c0415bb55efefad54525822c2a437862`) and `extra-origin.integration.test.ts` is `3d49f5722de606c91b1f2802e59617a230d9fc7a2ceeb320cf50e4cf2cd9c68e`, both as the README expects. Proof in a throwaway detached worktree outside the repository tree (`ready/wt`, at `e34d6c6`, left in place): `git apply --check` then `git apply` of both patches, uncommitted, never committed or pushed; `git diff --numstat` printed `4 2 apps/api/src/auth/context-boundary.test.ts` and `1 1 packages/db/test/extra-origin.integration.test.ts`; the new path appears 3 times in the patched scanner. After an offline frozen install, a rebuild of the five packages and the hydrate step, in that worktree: `context-boundary.test.ts` exit 0, 145 of 145 passed (including "approves each main practice caller only at its exact reviewed source identity"); `extra-origin.integration.test.ts` exit 0, 32 of 32 passed (including "[S9] scanner and seven pinned bridges stay byte-identical", run alone as well: 1 passed). Without the patches: the scanner fails the two cases above, and [S9] passes (run 6).

**The two security-related test files are untouched on this branch.** `apps/api/src/auth/context-boundary.test.ts` (sha256 `7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d`) and `packages/db/test/extra-origin.integration.test.ts` (sha256 `3d49f5722de606c91b1f2802e59617a230d9fc7a2ceeb320cf50e4cf2cd9c68e`) are byte-identical to `origin/main`. `apps/api/src/audit-export/audit-export.application.test.ts` is `8bac90b630ea3f782c6be2f811fdcbf6ad154b262cfb7ee592547794590ae1bd`, as in the order. This helper edited no source or test file; the only changes in this commit are this section.

**NOT RUN by this helper (not asked for, or outside the time box):** `pnpm build`; `pnpm openapi:check`; `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 app/admin/contractor/audit-exports/page.test.tsx`; `ENT-10b.spec.ts` in both browser projects; whole-package or whole-repository suites (`pnpm test`, `pnpm test:db`, `pnpm test:migrations`); GitHub checks on this head; the two code checks (Claude Opus, Sol); the coordinator's commit H2. Turbo replayed cached typecheck and lint logs for four packages (one log shows another worktree's path); db, api and web were executed fresh.

## Browser evidence for acceptance criterion S3 (dispatcher, 12 Oct 2026, on head 45ed1d3)

A fresh Sol check (`ctx-bridge-1-solcheck-20261012T181116.md`) and the Opus reviewer both noted that `apps/web/e2e/ENT-10b.spec.ts` was recorded NOT RUN. It has now been run, unedited, against the production build of this exact tree:
- `pnpm build` (working directory `.worktrees/ctx-bridge-1`, through `~/.local/bin/heavy-slot`): exit 0 (log `jg-runs/ctx-bridge-1-browser-build.log`).
- `CI=1 pnpm exec playwright test -c jg-runs/pw-local-channel-ctx-bridge-1.config.ts --project=mobile-360 --project=desktop --workers=1 e2e/ENT-10b.spec.ts` (working directory `.worktrees/ctx-bridge-1/apps/web`, through heavy-slot; out-of-repo wrapper config with `channel: "chromium"`): **2 passed (12.7 s), exit 0** (mobile-360 and desktop; log `jg-runs/ctx-bridge-1-browser-ent-10b-2.log`). A first attempt on the same tree failed only because another run held port 3000.
- The page unit test (`apps/web/app/admin/contractor/audit-exports/page.test.tsx`) passed 11/11 in the Sol check's own run; not repeated here.
The bridge file, both security-related test files and every other tracked file are unchanged by this record.
