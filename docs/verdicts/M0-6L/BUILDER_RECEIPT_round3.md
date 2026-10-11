# M0-6L round 3 — BUILDER RECEIPT, not an independent review

**Builder:** Claude Sonnet 5.5 (repair builder). Branch `codex/sandbox/m0-6l`, PR #104.
**Starting head:** `25499d1a7bf95382d36feed89f253c96b7bf495a` (Sol high check: VERDICT REPAIR, three findings).
**Migration number unchanged: 0052.** No migration, schema, API contract or OpenAPI change in this round.
**Code commits this receipt is bound to:** merge `0a9ceaf` (origin/main `ebfeaae`), `0a55afe` (findings 1 and 2), `d36b7a3`
(finding 3). The receipt itself is a later, documentation-only commit.

**State: NOT independently verified, NOT technically accepted.** I repaired; I did not review or accept anything. A fresh Sol check
and a fresh Claude Opus re-review check the new head.

## Scope reading (recorded verbatim, as settled by the integrator against the card's Done-when)

> IN SCOPE, fix now (all three): P2-1 (renamed imports bypass the constructor boundary) and P2-2 (synthetic confinement trusts
> variable names rather than their source): both fall under the Done-when "An import/boundary test proves the only callers that
> construct a verifiedContext/effective_tenant_id for withTenant are the authenticated principal bridge". P3-3 (invitation copy
> promises the wrong account behaviour): this task's own sign-in UI.
>
> Nothing is out of scope. Identity email to a real address stays blocked (D04); do not add any live transport.

Founder decisions of 4 Oct 2026 applied, not re-litigated: the C7 "open the job from Jobs" step is met by reopening the saved
state fresh plus a second browser context (the invitation spec reloads and reads the result in a second context); fictional
sample-source labels are acceptable; migration numbers follow merge order, so 0052 stays. No live transport was added.

## Step 0 — merge of main

`git fetch origin`; `origin/main` had moved by one commit, `ebfeaae` "TEST-STAB-2: wait for review saves before reloading in
UIWIRE-1 (#105)". `git merge origin/main` (merge commit `0a9ceaf`, no rebase, no force). One conflict: `config/agent-lane-assignments.json`
(a one-line JSON file touched on both sides). Resolved with `python3 ~/.local/share/full-steam/lane-union.py` ("union ok: 80 lanes"),
then `git add`. Checked afterwards: no lane differs from `origin/main` or from the previous head apart from the union (79 lanes on main,
this branch's `m0-6l` added, nothing else new, none changed on both sides). Main added no migration, so the migration-count
assertions are unchanged (0000..0042 plus 0052 = 44); `apps/api/openapi.json` had no conflict and `pnpm openapi:check` passes.
No real code conflict: the `UIWIRE-1.spec.ts` change came in cleanly from main (not edited by me).

## Findings

### Finding 1 (P2) — renamed imports bypass the constructor boundary: FIXED in `0a55afe`

* **Red first** (on `25499d1`, against the new tests in `apps/api/src/auth/context-boundary.test.ts`): 12 of the 13 new tests failed and 4
  passed (the one new test that passed is the control "still allows name-preserving plumbing"). Every failure was the stated reason:
  the scan reported an empty list, for example `AssertionError: apps/api/src/new-feature.application.ts: expected [] to deeply equal
  ArrayContaining{…}` for `verifiedTenantContextFromMembership as makeContext`, and `type alias in apps/api/src/x.ts: expected [] to
  not deeply equal []` for `type Ctx = VerifiedTenantContext; ... as Ctx`.
* **Fix** (same file, the scan): the constructor and the context type may be imported, re-exported or destructured only under their
  own names (`parse()` rename rule, lines 178-186; a rename in either direction is refused, including string-literal module export
  names, `export { x as y }`, `export { x as y } from`, and `const { ctor: make } = ns`). A local `type`/`interface`/`import X = ns.T`
  that names the context type, `ReturnType<typeof verifiedTenantContextFromMembership>` or `typeof withTenant` is tracked to a
  fixed point (`tainted`, line 217) and counts as a cast target; exporting such an alias is refused (lines 228-229) because another
  file could import and cast to it. The `Parameters<typeof verifiedTenantContextFromMembership>[0]` argument cast that the retained
  synthetic services use is deliberately not tainted (it is the argument type, not the context).
* **Green:** `context-boundary.test.ts` 16 passed. Regression cases: renamed value import, string-literal import name, destructuring
  rename, renamed type import (plus `<Context>` assertion), re-exports (value, type, and a two-file laundering pair), the bridge file
  with an aliased import, and seven alias/derivation spellings of the type.

### Finding 2 (P2) — synthetic confinement trusts variable names, not their source: FIXED in `0a55afe`

* **Red first:** the same run. Sol's reproduction (`DEMO_TENANT_ID` and `DEMO_*MEMBERSHIP_ID` assigned from request input, no import)
  produced `expected [] to deeply equal ArrayContaining{…}`. Further new cases failed the same way: shadowing by parameter, inner
  `const`, destructuring and `catch` variable; imports from another module or aliased; spread/computed/accessor/duplicate keys in the
  constructor argument; a non-literal fixture constant; a barrel that redefines a fixture name.
* **Fix** (same file):
  - Retained synthetic exception limited to the explicit existing-file list `APPROVED_SYNTHETIC_FILES` (line 49, 21 files); a
    perfectly shaped call anywhere else fails with "not an approved retained synthetic file" (line 340). The list is pinned: every
    entry must exist and still construct, and every constructing file outside the four special categories must be listed
    (last test, line 660).
  - `DEMO_*` tenant/membership/identity names are trusted by origin: in all application source they may only be an unaliased import
    from `@jobguard/db` (inside `packages/db/src`, from `./demo-seed`) (`authoritativeModule`, line 132; binding rule in `parse()`
    and `fixtureBound`, line 251). Any local declaration, parameter, destructuring, catch variable, rename, default or namespace
    import is refused, wherever the file is. `packages/db/src/demo-seed.ts` must hold every such name as an exported `const`
    literal UUID, and a barrel may not redefine or re-source one.
  - Constructor arguments and casts must be plain literals (`plainLiteral`, line 116: no spread, computed key, accessor or duplicate
    property); an object passed by name must be exactly one top-level `const` that is only read or constructed from
    (`onlyReadOrConstructed`, line 260, `resolveFixedObject`, line 291). Found while self-checking: the old by-name resolution
    ignored later mutation (`membership.tenantId = input.tenant`); this was red-first as well (second red run: 2 failed, 14 passed)
    and is now refused.
  - Top-level application files (for example a Next `middleware.ts`) are now scanned as well (line 396).
* **Changes to existing assertions, stated plainly:** the existing synthetic-shape tests ran at made-up paths
  (`apps/api/src/new-feature.application.ts`, `x.application.ts`). With the approved list those paths would now fail for the new
  reason, so the shape tests now run at the approved path `apps/api/src/material.application.ts` (constant `APPROVED_SYNTHETIC`),
  which keeps each negative case failing for its own original reason. No assertion was removed, loosened or skipped, and no
  timeout changed. The header comment and `docs/operations/m0-6l-identity.md` now state what the scan cannot do (a context
  laundered through `any`/`never`, a type derived through an arbitrary signature, a member name computed at run time) so nobody
  mistakes it for a type-checker.
* **Green:** `context-boundary.test.ts` 16 passed (whole-tree scan about 0.4 s).

### Finding 3 (P3) — invitation copy promises the wrong account behaviour: FIXED in `d36b7a3`

* **Red first** (on `25499d1`, `apps/web/e2e/M0-6L.spec.ts`, both projects): the extended invitation test failed at its new copy assertion
  with received text "You are signed in. To add the invited business to your account, enter the address …", exit 1 (2 failed, 2 passed:
  the first spec test).
* **Fix:** `apps/web/app/sign-in/sign-in.tsx`. Before verification a signed-in user is told that verifying signs the browser in as the
  address the invitation was sent to, that the business is added to this account only if it is the same address, and that a different
  address switches the browser to that other account (line 30). After verification the page compares the principal id before and after
  and says which happened: new sign-in, "now one of this account's memberships", or "now signed in as the invited address, which is a
  different account from the one you were using" (lines 4-6, 19, 28). A signed-out visitor following an invitation link is told that
  verifying signs them in as the invited address. `docs/contracts/authentication-v1.md` and `docs/operations/m0-6l-identity.md` now state the
  behaviour (the previous session cookie is replaced in the browser; the old session is not revoked server-side).
* **UI test now covers differing emails:** the invitation test runs, in one signed-in browser, the same-address case (identity unchanged,
  two memberships, copy asserted) and then the differing-address case (identity changes, only the invited tenant and role appear, the old
  tenant is gone, the switch notice is shown, reload and a second browser context read the same result), plus a no-request preview of the
  invitation link for a signed-out visitor, sandbox banner and no-horizontal-overflow checks kept. Budget note: the identity web bucket
  is 10 requests per 10 minutes for both projects, so the spec still spends exactly 5 requests per project (1 + 4). To stay inside it, the
  brand-new recipient's verification now happens in the signed-in member's browser (which is the differing-address case) instead of in a
  fresh context; the signed-out invitation page is still loaded in its own fresh context but no longer verified there. No assertion of
  the first test changed.
* **Green:** `M0-6L.spec.ts` 4 passed (2 tests x 2 projects).

## Commands run on head `d36b7a3`, in `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/m0-6l`

Database and browser commands ran inside `heavy-slot m0-6l`.

| Command | Exit | Count / result |
|---|---:|---|
| `git merge origin/main` | 1 then resolved | one conflict (lane registry), `lane-union.py` 80 lanes, merge commit `0a9ceaf` |
| `pnpm install --frozen-lockfile` | 0 | lockfile up to date |
| `pnpm typecheck` | 0 | 7/7 packages |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7/7 packages |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `m0-6l`, every changed file declared |
| `pnpm build` | 0 | 7/7 packages including the production Next build (after the sign-in change; the first rebuild was uncached for the web app) |
| `pnpm test` | 0 | tools 39; config 2; core 432 (68 files); storage 4; AI 72; db 194 (39 files); web 63 (8 files); API 129 (17 files, was 113: 16 in the boundary file) |
| `pnpm test:db` | 0 | 39 files, 194 tests |
| `pnpm test:migrations` | 0 | 2 files, 11 tests |
| `pnpm openapi:check` | 0 | document matches the source |
| `vitest run src/auth/context-boundary.test.ts` (red, first) | 1 | 12 failed, 4 passed (findings 1 and 2) |
| same, after the fix | 0 | 16 passed |
| same, second red (mutation after declaration, top-level scan) | 1 | 2 failed, 14 passed |
| same, after the fix | 0 | 16 passed |
| `CI=1 playwright test --project=mobile-360 --project=desktop M0-6L.spec.ts` (red, before the UI fix) | 1 | 2 failed, 2 passed |
| same, after the fix | 0 | 4 passed |
| `CI=1 playwright test --project=mobile-360 --project=desktop M0-6L.spec.ts shell.spec.ts deploy-smoke.spec.ts UIWIRE-1.spec.ts` (final head) | 0 | 30 passed (15 tests x 2 projects) |

In-worktree database counts (194) are higher than a clean checkout's because stale compiled `dist/*.test.js` files are also collected here
(the earlier receipt explains the same effect); GitHub CI runs a clean checkout.

## Environment notes

* **Playwright browser:** the pinned `chromium_headless_shell-1193` is not installed on this Mac. I used an **UNCOMMITTED** config kept in
  the scratchpad outside the repository (imports the real `apps/web/playwright.config.ts` and only adds
  `launchOptions.executablePath` pointing at the installed `chromium_headless_shell-1234`, with absolute `testDir`, `globalSetup`,
  web-server `cwd` and `outputDir`). Same tests, projects, viewports, web server and global setup. **GitHub CI, with its pinned browser, is
  the proof for the browser flavour.** Nothing about it is committed.
* Embedded PostgreSQL started normally (`ipcs -m` showed no leaked segments). No environment repair was needed.
* Heavy slots were busy with other builders for about 25 minutes; I waited, never ran past two heavy suites.

## Not run, and why

* The full browser suite (all specs, both projects) locally: GitHub CI runs it on the pushed head. I ran this task's spec plus the specs
  that touch sign-in or that the main merge changed (`shell`, `deploy-smoke`, `UIWIRE-1`).
* `dependency-review` (`tools/dependency-audit.mjs`) and the gitleaks `secrets` job: GitHub-only checks.
* A clean-clone install and run (build-order fault check): the previous round did this and nothing in this round changes build order or
  package resolution; CI also runs `pnpm test` before `pnpm build` on a clean checkout.
* No review of the Codex implementation beyond the three findings: that belongs to the Sol checker and the Opus reviewer.

## Open items

* The boundary scan is syntactic by design (limits stated in the test header and the operations note). It does not claim to catch a
  context laundered through `any`/`never` or a member name computed at run time; those remain with the compiler, the approved list
  and review. I did not widen scope to a type-checker-based scan.
* Migration-count assertions assume this branch alone on top of main (0000..0042 plus 0052 = 44); the integrator re-adjusts at merge time.
* Not independently verified, not accepted.
