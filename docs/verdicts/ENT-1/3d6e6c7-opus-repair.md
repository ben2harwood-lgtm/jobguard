VERDICT: REPAIR — bound to head 3d6e6c7bbf61e44fa42e6aa6bb561e3d3852bccc
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (7 Oct 2026); did not build, repair or order any commit in this PR.

**In short:** the main-merge commit is clean. The two conflict resolutions are exact, nothing else changed, the exports do not collide, migration 0054 is still correct, and CI is green on this exact head. I am still returning REPAIR for one P2 in the admin page. GPT-6.1 Sol raised it at `addc30b` and I confirmed it with my own probe. After a temporary loading error, the only button on the page quietly swaps the browser's session for a new one. The organisation the user already built still exists in the database, but that browser can no longer reach it. The previous Opus PASS logged the misleading message as a P3 (its P3-3) but did not trace this consequence. The fix is small and stays inside the ENT-1 lane.

## P1
None.

## P2-1 — Recovery can replace the session and cut the user off from their saved organisation (Sol @addc30b P2: confirmed; supersedes the previous Opus P3-3)

**Where**
- `apps/web/app/admin/contractor/contractor-admin.tsx:20`: when the first read fails for any reason other than `UNAUTHENTICATED`, there is still no `view`. Even so, the page sets the status to "Showing an out-of-date organisation. Reload persisted organisation to continue." Nothing is actually shown.
- `contractor-admin.tsx:32`: with no `view`, the only control rendered is "Start generated contractor practice". The Reload button exists only when a `view` is present.
- `contractor-admin.tsx:21`: `start()` always calls `POST /api/session` first.
- `apps/web/app/api/session/route.ts:14`: every successful `POST /api/session` overwrites the `jg_session` cookie with a new `randomUUID()`. The cookie is httpOnly, so the old one cannot be recovered.
- `packages/db/migrations/0054_contractor_organisation.sql:144–147` and `:153–159`: a practice organisation is reachable only through its session id. `start_contractor_practice` already returns the same tenant when called again for the same session; `packages/db/test/contractor.integration.test.ts:43` proves this, and CI ran it.

**What happens (reproduced)**
- *(a) Existing organisation, first load fails once.* Typical causes are a network blip, a single 503 or a slow cold database start. The page says to reload but offers only Start. If the user clicks Start once the database answers again, the cookie is replaced and a brand-new tenant is created. Every region, team, member and contract version they made sits in an organisation this browser can never open again. (During a full outage Start fails harmlessly, because `/api/session` returns 503 before it sets the cookie at `route.ts:12`.)
- *(b) Start commits but its response is lost.* The page keeps the initial status ("Start a generated contractor organisation to practise.") and shows the raw error. Clicking Start again mints a second session and a second tenant. The first tenant is orphaned. Little is lost here, because that tenant had no user edits, but it is a blind retry. The server already supports reconciling: the same session gets the same tenant.
- My probe (`apps/web/opus-probe-0710/session-recovery.probe.test.tsx`, untracked, using the PR's own hook harness with a server model taken from the source lines above) passed 2/2. It recorded:
  - (a) buttons after the failed first read: `["Start generated contractor practice"]`. Status: "Showing an out-of-date organisation. Reload persisted organisation to continue." Requests: `GET /api/contractor`, `POST /api/session`, `POST /api/contractor?action=start`. The tenant shown changed from `1111…` to `2222…`, and the original cookie was gone.
  - (b) requests: `POST /api/session` ×2 and `POST /api/contractor?action=start` ×2, ending with two practice tenants.

**Why it blocks.** The plan's core promise is that recovery reads the persisted result (C1). Unknown or stale states must also be kept separate from real state (C7). This page breaks both:
- After a temporary error it describes a view that is not on screen.
- The page's only control permanently separates the browser from its persisted organisation.
- It retries an uncertain start blindly instead of reconciling with what the server already committed, against the C5 rule that an unknown outcome is reconciled, never blindly retried.

It is P2, not P1: no data is deleted, everything is synthetic, and a manual browser refresh before clicking Start does recover the organisation.

**Required fix.** It stays in lane: `contractor-admin.tsx`, `contractor-admin.test.tsx` and `ENT-1.spec.ts`. No SQL or API change is needed, and `/api/session` (outside this lane) stays untouched.
1. **No view after a read failure other than `UNAUTHENTICATED`:**
   - Show accurate text, for example "The persisted organisation could not be loaded."
   - Show a "Reload persisted organisation" action that retries `GET /api/contractor` with the existing cookie.
   - Do not offer Start until a read has actually returned `UNAUTHENTICATED`.
2. **`start()` must never replace a session that may already hold a practice organisation.**
   - Call `POST /api/contractor?action=start` with the current cookie first. Call `POST /api/session` only if that returns `UNAUTHENTICATED` (no usable cookie), then retry the start once.
   - If the start outcome is unknown (network error or unreadable response), say "Practice start was not confirmed" and recover by re-reading with the same cookie. Do not offer a fresh session.
   - Acceptance rule: zero `POST /api/session` when the browser already has a session, and at most one per journey that began without one.
3. **Regressions.**
   - Harness unit cases for both scenarios.
   - Two `ENT-1.spec.ts` fault tests in both projects, labelled as transport aborts (allowed by C6):
     - (a) Create practice and make one change. Reload the page with the first `GET /api/contractor` aborted. Assert that Reload is offered and Start is not, that Reload then shows the same tenant id and revision, and that no `POST /api/session` is sent after the abort.
     - (b) In a fresh context, let `POST /api/contractor?action=start` really commit (`route.fetch()`), then abort the response. Assert that the page says the start was not confirmed, that recovery shows the same tenant id a later full page reload shows, and that exactly one `POST /api/session` is sent in the whole journey.

Since a builder round is needed anyway, I recommend also folding in P3-1 and P3-2 below, which are one-line fixes. They are not required for PASS.

## P3 (carried over; the code is byte-identical to `addc30b`, so nothing new)
1. Malformed JSON is reported as `503 DATABASE_UNAVAILABLE, recoverable:true`. Where: `apps/web/app/api/contractor/route.ts:18`, with `failure()` at `:22`. Fix as previously given: `request.json().catch(()=>undefined)`, return `422 INVALID_COMMAND, recoverable:false`, and add a route test for both actions asserting no service call.
2. A repeated identical invalid-rules rejection does not move focus back to the error. Where: `contractor-admin.tsx:40`. Fix: add `setLoadErrorVersion(v=>v+1)` in that catch and in `start()`'s catch, plus a two-rejection regression.
3. `owner` is accepted on `grant.create` (`packages/core/src/contractor.ts:67`, `0054_contractor_organisation.sql:243`). This is not an escalation. Fine for ENT-10.

## Delta checks on the merge commit (all pass)
1. **Merge identity.**
   - `3d6e6c7` has parents `addc30b` and `f9de3ad`. PR head is unchanged at `3d6e6c7` (checked at start and end).
   - Excluding the two resolved files, `git diff f9de3ad...addc30b` and `git diff f9de3ad 3d6e6c7` are byte-identical: SHA-256 `c1615fa3491258b7d8a915a97931125c8e657549aa9808357935fa6757b1e0b4` for both, 254,860 bytes.
   - The changed-file sets are identical (34 files). Every one of the 32 other files has the same blob at `addc30b` and `3d6e6c7`.
   - Every file main changed since the old base `6566abc` is main's version at `3d6e6c7`.
2. **Lane registry.** Parsed comparison: 86 lanes, equal to main's 85 in main's order, then `ent-1`, which is byte-equal to the builder's entry. `version` 2 is unchanged. The PR alters or removes no base lane. Lane lint with simulated PR metadata (base `f9de3ad…`, head `3d6e6c7…`, ref `codex/sandbox/ent-1`) passed: "Lane boundary passed … lane ent-1".
3. **`packages/core/src/index.ts`.** It is main's file plus exactly one appended line, `export * from "./contractor.js";`.
4. **Export collisions (my probe 1, TypeScript compiler API over the core program).**
   - contractor (20 names), enterprise-domain (48) and shadow-domain (57) share no names. Across all 40 star-exported modules, no name is exported twice.
   - The per-module total plus `CORE_PACKAGE` is 428, equal to the 428 names in the index. All 20 contractor names resolve to `contractor.ts`. Zero diagnostics.
   - Positive control: a scratch module re-exporting `contractor.js` next to a fake module that also exports `contractorRoles` and `ContractorGrant` produced TS2308 twice, so the check does detect collisions.
5. **Runtime namespace (my probe 2, built `dist`).** All 13 contractor, 33 enterprise and 48 shadow runtime exports are present in `dist/index.js` with identical bindings, so ESM has not silently dropped any ambiguous star export.
6. **Shared vocabulary with ENT-4a.**
   - The nine shared role names mean the same thing. ENT-4a's extra `connector` role is the later ENT-13a machine role and is correctly not grantable in 0054's `role_grant` CHECK.
   - ENT-1's rule-step approvers (`supervisor`, `surveyor`, `commercial_manager`; up to 3 alternates) are a subset of ENT-4a's `enterpriseRequirementV1` step roles (up to 4 alternates). ENT-1's client approval maps to ENT-4a's `client_approver` step.
   - ENT-4a's grants are job-scoped while ENT-1's are unit-scoped. Those are different names and shapes; ENT-4b/ENT-5 will need to map between them. There is no conflict now.
7. **Migration.**
   - `0054_contractor_organisation.sql` is still the PR's only migration and is still the next number above main's `0053`; main added no migration since `6566abc`. `MIGRATION_URLS` lists 0054 last.
   - Renumber safety: no renumber is needed at this merge. ENT-1 must merge before SBOX-SESSION-1 (0094) to keep the order.
   - Later migration PRs must bump the hard-coded count of 45 (`UIWIRE-12.integration.test.ts:54–61`, `demo-bootstrap.integration.test.ts:29–34`). These checks fail loudly if missed.
   - The contractor upgrade test (`contractor.integration.test.ts:21`, `MIGRATION_URLS.slice(0,-1)`) will keep passing after later migrations land. It will then upgrade from "everything but the newest" rather than specifically to 0054.

## What I executed (worktree `/private/tmp/opus-ent-1-3d6e6c7-0710`, detached at `3d6e6c7`, Node 24.17.0, pnpm 10.28.1)
| Command | Exit | Result |
|---|---:|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | 0 | Installed (59 GB free beforehand) |
| `pnpm typecheck --force` | 0 | 7/7 tasks, 0 cached |
| `pnpm lint --force` with simulated PR event | 0 | Lane boundary passed (ent-1); 7/7 tasks |
| `pnpm build --force` | 0 | 7/7 tasks, 0 cached |
| `pnpm openapi:check` | 0 | Committed spec matches |
| `pnpm --filter @jobguard/core test` | 0 | 104 files / 2,842 tests. That is 2 × CI's 52/1,421, because the local `dist/*.test.js` built a step earlier is also collected. `extra-origin.test.ts` passed |
| `pnpm --filter @jobguard/web test` | 0 | 11 files / 88 tests |
| `apps/api: vitest run src` | 0 | 17 files / 114 tests (the health listener test passed here) |
| `node --test tools/*.test.mjs` | 0 | 42/42, no skips |
| Probe 1: TS API export-collision check plus positive control | 0 / 2 | 0 collisions; control gave TS2308 ×2 as expected |
| Probe 2: runtime namespace check on `dist` | 0 | No dropped or rebound names |
| Probe 3: Sol P2 session-recovery harness probe | 0 | 2/2; reproduces both scenarios (values above) |
| `playwright test --list --project=mobile-360 --project=desktop` | 0 | 182 total; ENT-1 has 16 |

**Relied on CI** (run 37662277443, `pull_request`, head `3d6e6c7bbf61e44fa42e6aa6bb561e3d3852bccc`, all jobs success). `checks` passed in 11m0s:
- lint, including the lane boundary on this head, base `f9de3ad`
- typecheck and build
- tools 42/42; core 52 files / 1,421 tests, including `extra-origin.test.ts` with no timeout; api 114; web 88
- db 40 files / 215 tests on real PostgreSQL 16, including `contractor.integration.test.ts` with 17 tests
- production-build Playwright: 182 passed in both projects, including ENT-1

`dependency-review` and `secrets` were green.

**Not verified by me:** PostgreSQL and browser suites locally (I relied on CI for both). The P2 in a real browser: my probe drives the real component handlers with a modelled server, and the two server facts come from `session/route.ts:14`, `0054:144–159` and the CI-run DB test at `contractor.integration.test.ts:43`. I made no edits, commits, pushes or merges. The probe file is left untracked in my worktree.

