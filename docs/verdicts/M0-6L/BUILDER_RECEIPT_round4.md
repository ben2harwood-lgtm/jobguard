# M0-6L round 4 — BUILDER RECEIPT

Builder: **GPT-6.1 Sol via Codex**, repair builder, 5 October 2026.
PR: #104; branch: `codex/sandbox/m0-6l`.
Base: **97884ace7ff76be705c1d0f49af356f4063c4f5d**.
Repair specification: `/private/tmp/jg-m0-6l-solverdict.md` (REPAIR, three P2 findings).
This receipt describes the uncommitted working tree based on that exact head. The dispatcher
must commit it and bind the fresh Claude Opus verdict to the resulting exact commit.
**not independently verified, not accepted**.

## Authority and scope

Read AGENTS.md rev 3.0, BUILD_PLAN.md §2.4 C1–C8 and the M0-6L card (§11.1),
all three existing task receipts, authentication-v1.md, the identity operations note,
the fresh Sol verdict, and the integrator's M0-6L-round3.txt repair brief.

The previous integrator scope reading is preserved verbatim:

> IN SCOPE, fix now (all three): P2-1 (renamed imports bypass the constructor boundary) and P2-2 (synthetic confinement trusts variable names rather than their source): both fall under the Done-when "An import/boundary test proves the only callers that construct a verifiedContext/effective_tenant_id for withTenant are the authenticated principal bridge". P3-3 (invitation copy promises the wrong account behaviour): this task's own sign-in UI.
> Nothing is out of scope. Identity email to a real address stays blocked (D04); do not add any live transport.

That reading covers the three remaining scanner defects in the fresh verdict: all belong
to this task's required import/boundary test. Earlier renamed-import, fixture-origin and
invitation-copy repairs are preserved. Ben's 4 October decisions accepting the C7 Jobs-list
substitute and fictional sample-source labels remain settled. Migration 0052 stays allocated.

Changed paths in this round only:

- `apps/api/src/auth/context-boundary.test.ts`
- `docs/operations/m0-6l-identity.md`
- `docs/verdicts/M0-6L/BUILDER_RECEIPT_round4.md`

All were already allowed by this lane. No lane registration needed modification. No runtime
identity/business code, authorization across practice sessions, migration, provider, UI,
commercial policy or founder-reserved capability changed. No new out-of-scope finding was
discovered; no follow-up order was needed. SBOX-SESSION-1 remains held for Ben and untouched.
The existing earlier OpenAPI compiled/source discrepancy remains recorded in BUILD_PLAN.md
§14.3; it was not re-investigated or waived here.

## Failing-first evidence and repairs

All regressions were written before fixing scanner behavior. A scratch-root parameter was
added to the collector as a test seam before the red run; its original root selection and
file filtering were retained, so the missing root-tools finding failed for the stated reason.
Tests use temporary filesystem fixtures, not a planted application file in another lane.

The first red run had **14 failed / 22 passed / 36 total**. A further bare parenthesized-delete
case was added before any behavior fix; that red run had **15 failed / 22 passed / 37 total**.
Logs: `/private/tmp/jg-m0-6l-round4-red.log` and `jg-m0-6l-round4-red2.log`.
No existing assertion was removed or weakened; no skip, retry or timeout was added.

### P2-1: typed context reconstruction — fixed

Test: `apps/api/src/auth/context-boundary.test.ts:554` (seven parameterized cases).
The exact typed-return reproduction, inferred returns, typed variables, `satisfies`, value
aliases, type aliases and inferred constructor results require a reconstruction violation
at four unapproved application paths and an approved synthetic path. Forwarding and ordinary
object-spread controls remain allowed (`:568`).

Red: all seven reconstruction cases failed. Six first returned no violations; the inferred
constructor case returned constructor violations but lacked the required reconstruction
violation. The exact `{ ...context, tenantId }` reproduction uses no `any` or `never`.

Fix: `apps/api/src/auth/context-boundary.test.ts:241`. Reuse context-type alias tracking to
identify annotated values and return types; propagate constructor results and inferred
local aliases to a fixed point. Reject object literals that spread a context, or construct
one through an annotated initializer/return or `satisfies`. Forward an existing verified
value instead of treating the copied compile-time brand as new membership verification.

Green: all seven cases and controls pass in the 37-test suite and the 149-test API unit run.

### P2-2: wrapped/destructured fixed membership mutations — fixed

Test: `apps/api/src/auth/context-boundary.test.ts:579` (eleven parameterized mutation cases).
Covers parenthesized assignment, receiver wrapping, compound assignment, object/array/nested
and default destructuring, parenthesized deletion (including the bare reproduction),
increment and iteration targets. The constructor argument uses the permitted
`Parameters<typeof verifiedTenantContextFromMembership>[0]` assertion. Safe property-read
control: `:595`.

Red: seven mutation cases returned no violation: parenthesized assignment, compound
assignment, object/nested/array destructuring, bare parenthesized deletion and iteration.
Four further controls were already rejected by the old scan and remain rejected.

Fix: `apps/api/src/auth/context-boundary.test.ts:317`; wrapper traversal at `:112`.
Follow receiver and property expression wrappers, then traverse nested object/array/rest
assignment targets. Refuse assignments, compound assignments, delete, increment/decrement
and for-in/for-of targets. Distinguish these uses from property reads and constructor input.

Green: all eleven mutation cases, the safe-read control and all earlier fixed-object cases
pass. Membership object identity is no longer treated as proof that its properties stayed fixed.

### P2-3: repository-root tools omitted — fixed

Test: `apps/api/src/auth/context-boundary.test.ts:599`.
A real temporary repository includes four planted root-tool constructor callers (TS, nested
TSX, MJS and JS), a package-tool positive control, test/spec/declaration files and generated
output. Collection must return exactly the five application files, and the scanner must
reject every planted caller.

Red: collection returned only `packages/example/tools/control.mjs`, omitting all four
root-tool callers. Fix: `apps/api/src/auth/context-boundary.test.ts:444` and `:458`.
Include root `tools/`; share the application-file predicate for recursive and app-level
collection; exclude `.test` and `.spec` files for every supported extension. The collector
accepts an optional repository root solely to exercise collection with actual filesystem fixtures.

After the three behavior fixes, all 21 new cases passed but the existing whole-tree test
exceeded its unchanged 5-second timeout (36 passed / 1 failed). Host load was 71.00. Directory
walks still awaited each nested directory serially. The collector now awaits independent
child directory reads concurrently (`:450`); it reads the same files and retains all assertions.
This is a collection optimization, not a retry wrapper or a timeout change.

Green: **37/37**, including real-tree collection/rejection and all existing controls.
The operations note documents the three changes at `docs/operations/m0-6l-identity.md:22`.
The scanner remains syntactic; arbitrary signature derivations, computed runtime names and
`any`/`never` laundering remain its previously documented limits. This repair is not a
claim of runtime exploit prevention or a new runtime authorization mechanism.

## Commands and results

Working directory: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/m0-6l`.
Node **24.17.0**, pnpm **10.28.1**. All validation commands used
`PATH=/private/tmp/jg-m0-6l-round4-bin:$PATH`; the temporary launcher calls the existing cached
`/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. No install or package download
completed. Before using that launcher, a system `pnpm --version` probe entered the pnpm-11
preflight and was interrupted (exit 130); it created an empty `.pnpm-store/v11` plus three
SQLite index artifacts. These generated files made the first lint/lane checks fail. I checked
that the store contained only those three files, removed the generated store, and reran the
checks with cached pinned pnpm. No tracked or user-authored file was deleted.

| Command | Exit | Count / result |
| --- | ---: | --- |
| Cached `pnpm --version` | 0 | 10.28.1 |
| `pnpm --filter @jobguard/api exec vitest run src/auth/context-boundary.test.ts` — red 1 | 1 | 14 failed, 22 passed, 36 total |
| Same — red 2, bare delete added before fixes | 1 | 15 failed, 22 passed, 37 total |
| Same — first fixed run | 1 | 36 passed; whole-tree test timed out at unchanged 5000 ms |
| Same — after concurrent directory collection | 0 | 37 passed, 1 file |
| `pnpm --filter @jobguard/api typecheck` — preliminary | 0 | API source typechecks |
| `pnpm typecheck` | 0 | 7 packages successful; 5 cached, API/web executed |
| `LANE_BASE_REF=origin/main pnpm lint` — first attempt | 1 | Lane rejected three generated pnpm probe artifacts |
| Same — after generated-store cleanup | 0 | Purity, lane, money/commercial boundaries; 7 package lints successful, 5 cached |
| `pnpm lint:lanes` — first attempt | 1 | Same three generated artifacts |
| Same — after cleanup | 0 | Lane m0-6l; base origin/main `ebfeaae7b07747997194e17eff1601557fced6e8`, head exact supplied base; 51 PR/working-tree paths |
| `pnpm lint:lanes` — after writing this receipt | 0 | 52 paths, including this new receipt; no lane edits |
| `pnpm --filter @jobguard/core test` | 0 | 432 tests, 68 files |
| `pnpm --filter @jobguard/web test` | 0 | 63 tests, 8 files |
| `pnpm --filter @jobguard/api test` | 1 | 149 passed; HTTP health test failed (listen EPERM), 17 files; chained OpenAPI command did not execute |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` | 0 | 149 unit/service/boundary tests, 16 files, including all 37 boundary tests |
| `pnpm build` | 0 | 7 packages successful; 5 cached, Nest and production Next rebuilt |
| `pnpm openapi:check` | 1 | tsx CLI IPC listener denied (EPERM) |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same repository source OpenAPI comparison; snapshot agrees |

Final successful core/API-unit/web executions cover **644 tests** (432 + 149 + 63).
The 37 boundary tests are included in the API count, not additional to it. Standard API
suite and standard OpenAPI wrapper failures are recorded above, not presented as passes.
API's HTTP health test was attempted unmodified before the explicit listener-free unit
command; no test file, suite configuration or mandatory CI check was skipped or changed.
Turbo reports existing sandbox cache-write warnings; Next reports the existing multiple-lockfile
workspace-root warning. They did not change exits. Logs are under `/private/tmp/jg-m0-6l-round4-*.log`.

## Not run and remaining gates

- `pnpm test:db`, `pnpm test:migrations` and PostgreSQL integration/regression suites:
  dispatcher states this sandbox cannot start PostgreSQL. **GitHub CI runs database and
  migration checks after the dispatcher pushes.** No database mock is offered as proof.
- Playwright `M0-6L.spec.ts` and earlier browser suites in mobile-360 and desktop:
  this sandbox cannot bind localhost/start PostgreSQL. **GitHub CI runs browser suites after
  the dispatcher pushes.** No local browser evidence or new-head CI result is claimed.
- Full root `pnpm test`: includes PostgreSQL and Git-writing tool-fixture tests; those cannot
  be run under the task's sandbox/Git constraints. Core, API and web unit checks ran as above.
- Clean install: dependencies were supplied and package downloads prohibited; no install ran.
- Network security/dependency audit, live providers, real data, release, deployment, and model
  evaluation: not run. No prompt/model/parser change; CI security gates remain mandatory.
- No Git command was issued directly; requested lint/lane scripts perform their existing
  read-only Git inspection. No Git mutation, commit, merge, push or remote message was sent.
  The dispatcher owns commit/push, then CI and the fresh exact-commit Claude Opus review.

No migration/backfill, API contract, rollout, financial policy, operational alert or backwards-
compatibility change in this round. AGENTS §5.1 and the M0-6L boundary Done-when / C5/C8 are
the affected guarantees. A green local check is deterministic evidence, not an independent
verdict. New-head CI, independent review and separate technical acceptance remain outstanding.
**not independently verified, not accepted**.
