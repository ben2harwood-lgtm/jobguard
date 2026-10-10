# M0-6L CI repair — BUILDER RECEIPT, not an independent review

**Builder:** Claude Sonnet 5.5 (repair builder). Branch `codex/sandbox/m0-6l`, PR #104. Starting head
`757895c1542ab29266f796430d6765755f2b9cce` (Codex GPT-6.1 Sol build, based on `3e0764b`).
**Migration number unchanged: 0052.**
**Code commit every result below is bound to: `56d3b7f78a83fe356691e27badd7941a0db87fa8`** (the second merge of `origin/main`; the last code change of my own is `8ddb063d8ad9b60a1fb07434dcdf9f41ba6a3f19`). This receipt is a later,
documentation-only commit.

**State: NOT independently verified, NOT technically accepted.** I repaired; I did not review or accept anything.
A different model (GPT-6.1 Sol, high) checks these commits and a Claude Opus reviewer checks the Codex code.

## Finding before any fix: no CI run had ever started on PR #104 (a first run on the repaired head then failed, root cause 6)

`gh run list --branch codex/sandbox/m0-6l` returned nothing and `gh pr view 104` reported
`mergeable: CONFLICTING / mergeStateStatus: DIRTY`. GitHub does not start `pull_request` workflows on a conflicting PR, so
there was no red CI log to read; only the two Vercel status contexts existed. The failures below were found by merging
`origin/main` and running the whole gate locally, including the PostgreSQL and browser suites Codex's sandbox could not run.

## Root causes and fixes

| # | Root cause | Where | Fix | Commit |
|---|---|---|---|---|
| 1 | The branch did not merge with `main` (#101 put migration 0042 on main). Conflicts: lane registry, `MIGRATIONS.md`, `migrate.ts`, `demo-bootstrap.integration.test.ts`. | those four files | Merged `origin/main` (non-force). Lane registry resolved with `lane-union.py` (78 lanes, no lane changed on both sides). Runner now lists `0042` then `0052`. `MIGRATIONS.md` keeps main's 0041/0042 notes and this lane's 0052 note, now saying 0043–0051 are reserved and the upgrade starts from 0042. | `4f9e341` |
| 2 | Migration-count assertions counted the wrong total. Main has 0000..0042 (43); this branch adds 0052, so 44. | `demo-bootstrap.integration.test.ts` (3 numbers + title "0000..0042 plus 0052"); `UIWIRE-12.integration.test.ts` (`MIGRATION_URLS` length, BETWEEN-range row count, total row count) | Set to 44 for **this branch only**; the integrator re-adjusts at merge time. The UIWIRE-12 BETWEEN range now ends at `0052_persisted_identity.sql`. No receipt, hash or grant assertion changed. | `4f9e341`, `3268890` |
| 3 | `pnpm lint` failed: lane `m0-6l` is not allowed to edit `packages/db/test/UIWIRE-12.integration.test.ts` (fix 2 needs it). | `config/agent-lane-assignments.json` | Added exactly that one file to the `m0-6l` allow list with a note that it is a count assertion only (same precedent as the `m4-3-s-repair` lane). No other lane touched; no wildcard. | `f367eee` |
| 4 | M0-6L e2e, first real browser run: `getByRole("alert")` matched two elements, the sign-in error and Next's empty `#__next-route-announcer__` (also `role=alert`): strict-mode violation. | `apps/web/e2e/M0-6L.spec.ts` | Locator is now the alert carrying the error text; still asserts exactly one such alert (`toHaveCount(1)`) and that it holds focus. | `dd1ce9f` |
| 5 | M0-6L e2e: calls needing the signed-in session got 401. The session cookie is `Secure`; Playwright's `APIRequestContext` (the `request` fixture and `page.request`) treats only `localhost`/`*.localhost` as secure, so it never sends a Secure cookie to `http://127.0.0.1` (trace: `GET /api/auth/session` carried no Cookie header). The product was right; the harness could not carry the cookie. | same spec | Authenticated calls (`/api/auth/session`, `/api/auth/invitations`, including the wrong-tenant `x-tenant-id` 403 case) now run as real same-origin `fetch` inside the browser, which uses the real cookie jar. Cookie-less negative calls (replay 400 `INVALID_CODE`, real address 403 `IDENTITY_ROUTE_BLOCKED`, role elevation 400) still use the API client. The invitation test's owner now signs in inside its own browser context. **No assertion, status code, timeout or retry changed.** The cookie-attribute assertion (`httpOnly`, `secure`, `SameSite=Strict`) is untouched. | `dd1ce9f` |

| 6 | **The first GitHub CI run (on repair head `6e2b65b`) failed at `pnpm test`, and my local run had masked it.** `packages/db/test/identity.integration.test.ts` drives the API identity application layer against real PostgreSQL, so it imports `apps/api` sources, which import `@jobguard/db` and `@jobguard/config` by package name. Those resolve to each package's built `dist`. CI runs `pnpm test` *before* `pnpm build`, and turbo's `^build` only builds the db package's own dependencies, so on a clean checkout neither `dist` exists: `vite:import-analysis: Failed to resolve entry for package "@jobguard/db"` (CI run 37185484021: 37 db suites passed, 172 tests, 1 suite failed to load). It passed locally only because earlier builds had left `dist` behind. | new `packages/db/vitest.config.ts`; `config/agent-lane-assignments.json` | Reproduced in a fresh clone of `6e2b65b` with no build (same 1 failed suite / 172 tests). Added two `resolve.alias` entries so `@jobguard/db` and `@jobguard/config` resolve to their source in the db package's vitest run (`@jobguard/db` then is the same module the tests import as `../src/index.js`). Allowed that one file in the `m0-6l` lane. No test, assertion or timeout changed. Fresh clone after the fix: 38 files / 179 tests pass. | `8ddb063` |

Product code was not changed by this repair beyond the merge resolution of `packages/db/src/migrate.ts` (0042 then 0052); `apps/api`, `apps/web/app` and the other `packages/*/src` files are exactly as Codex built them.
The D04 block is still tested at three levels: `apps/api/src/auth/identity.test.ts` (adapter rejects every real
recipient and every non-synthetic mode), the PostgreSQL-backed `identity.integration.test.ts` suite, and the browser
spec (real address returns 403 `IDENTITY_ROUTE_BLOCKED`).

## Environment problems fixed (not tests)

* Embedded PostgreSQL would not start (`Postgres init script exited with code null`, 35 suites): pnpm skipped the
  `@embedded-postgres/darwin-arm64` postinstall, so the dylib symlinks (for example `libicudata.68.dylib`) were missing.
  Fixed by running that package's own `node scripts/hydrate-symlinks.js` in its directory. `ipcs -m` showed no leaked
  segments. Nothing in the repository changed.
* Pinned Playwright 1.55.1 expects `chromium_headless_shell-1193`, which is not installed here, and no download was
  authorised. I used an **uncommitted** config outside the repository
  (`.../scratchpad/m0-6l-repair/playwright.m06l.config.ts`) that imports the real `playwright.config.ts` and only adds
  `launchOptions.executablePath` pointing at the installed `chromium_headless_shell-1234`. Same tests, projects,
  viewports, web server and global setup. **GitHub CI, with its pinned browser, is the proof for the browser flavour.**

## Commands run in the working tree on `dd1ce9f` (before fix 6, which only changes how the db vitest run resolves two package names; `LANE_BASE_REF=origin/main pnpm lint` was re-run on `8ddb063`, exit 0). All inside `heavy-slot m0-6l` where they use a database or browser

| Command | Exit | Count / result |
|---|---:|---|
| `pnpm install --frozen-lockfile` | 0 | lockfile up to date |
| `pnpm typecheck` | 0 | 7/7 packages (re-run after the spec fix: `apps/web` tsc 0) |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | lane check plus 7/7 packages (first attempt exit 1, root cause 3) |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | after the lane fix |
| `pnpm build` | 0 | 7/7 packages including production Next build |
| `pnpm test` (final run) | 0 | tools 39; core 428 (68 files); config 2; storage 4; AI 72; API 105 (14 files); web 56; db 182 passed (39 files). Total 888 |
| `pnpm test:db` | 0 | 39 files, 182 tests, includes the 7 real-PostgreSQL M0-6L identity tests and UIWIRE-12 upgrade |
| `pnpm test:migrations` | 0 | 2 files, 11 tests (tenancy and demo-bootstrap, 44 migrations) |
| `pnpm openapi:check` | 0 | document matches the merged source |
| `CI=1 playwright test --project=mobile-360 --project=desktop M0-6L.spec.ts` | 0 | 4 passed (2 tests x 2 projects); first attempt 4 failed, root causes 4 and 5 |
| Full browser suite, `CI=1 playwright test --project=mobile-360 --project=desktop` (all specs, 1 worker, production build) | 0 | 168 passed (84 specs x 2 projects), 3.6 min |

Earlier attempts that failed and why: `pnpm test` run 1 (exit 1) failed 35 db suites on the PostgreSQL environment
problem above; run 2 (exit 1) failed `UIWIRE-12` on a second count assertion I had not yet updated (`toBe(43)`, root
cause 2) and `decision-inbox.integration.test.ts` with `Connection terminated unexpectedly` inside `migrate()`.
`decision-inbox` is untouched by this branch; it passed when re-run alone (23 tests with UIWIRE-12) and in two further
full runs. I did not establish the cause of that single connection drop (the Mac was running other builders'
PostgreSQL instances at the time); it is recorded, not explained.

## Second merge of main, and the final local gate on the merged head

While I was working, #102 (M4-2-S repair, no migration) merged to main and the PR became `CONFLICTING` again (lane
registry only). I merged `origin/main` a second time (non-force; `lane-union.py`, 79 lanes). The migration-count
assertions are unchanged (still 0000..0042 plus 0052 = 44). Everything below ran on the merged head, in the real worktree:

| Command (merged head) | Exit | Count / result |
|---|---:|---|
| `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build` | 0 | 7/7 packages each |
| `LANE_BASE_REF=origin/main pnpm lint`, `pnpm lint:lanes` | 0 | lane `m0-6l`, every changed file declared |
| `pnpm test` | 0 | tools 39; core 432; config 2; storage 4; AI 72; API 113 (16 files); web 63 (8 files); db 190 (39 files) |
| `pnpm test:db` | 0 | 39 files, 190 tests |
| `pnpm test:migrations` | 0 | 2 files, 11 tests |
| `pnpm openapi:check` | 0 | matches |
| Full browser suite, both projects, production build | 0 | 170 passed (85 specs x 2) |

## Clean-clone run of the whole CI sequence (the check that exposes build-order faults)

After root cause 6 I cloned the repository afresh into the scratchpad (`git clone`, checkout `6e2b65b`, plus the
uncommitted `vitest.config.ts` fix, identical to commit `8ddb063`), ran `pnpm install --frozen-lockfile` and hydrated the
PostgreSQL symlinks, and ran the workflow's own order with **no prior build**:

| Step (clean clone, CI order) | Exit | Result |
|---|---:|---|
| `pnpm turbo run test --filter=@jobguard/db`, before the fix | 1 | 1 suite failed to load, 172 tests (reproduces CI) |
| same, after the fix | 0 | 38 files / 179 tests |
| `pnpm typecheck` | 0 | 7/7 |
| `pnpm test` | 0 | tools 39; db 179 (38 files); core 428; AI 72; API 105; web 56; storage 4; config 1 |
| `pnpm build` | 0 | 7/7 |
| `CI=1 playwright test --project=mobile-360 --project=desktop` (all specs, production build, uncommitted browser-path config) | 0 | 168 passed |

(The in-worktree runs above count db 182 and config 2 because stale compiled `dist/*.test.js` files left by earlier builds
are also collected there; the clean clone has none.)

## Not run, and why

* The pinned-browser run (see above): GitHub CI is the pinned-browser proof.
* `dependency-review` (`tools/dependency-audit.mjs`) and the gitleaks `secrets` job: GitHub-only checks (network, scan
  action); not run locally.
* `pnpm install` always used the local pnpm store (`--prefer-offline` in the clean clone); no registry-fresh install was attempted.
* `LANE_BASE_REF=origin/main pnpm lint` was run in the real worktree, not in the clean clone (the clone has no `origin/main` of GitHub's).
* No review of the Codex implementation (security design of migration 0052, the principal bridge, SQL privileges):
  that belongs to the Opus reviewer and the Sol checker. I did not look for new defects beyond what the suites exposed.

## Overlaps and open items

* Migration-count assertions in `demo-bootstrap.integration.test.ts` and `UIWIRE-12.integration.test.ts` assume this
  branch alone on top of main (0000..0042 plus 0052 = 44). Other open PRs (0043+) will each change the number: the
  integrator re-adjusts when merging.
* `config/agent-lane-assignments.json` and `apps/api/openapi.json` are shared registration files; both merged cleanly.

---

# Round 2: Sol check on `18b38fa` (REPAIR, three P2 findings)

Specification: `/Users/benharwood/.local/share/full-steam/jg-runs/m0-6l-solcheck-20261004T084937.md` (VERDICT: REPAIR, HEAD
`18b38fa`). Tests first for each finding (red for the stated reason, then fixed). Findings 1 and 2 are also the two
open Codex review threads on the PR. Migration number unchanged (**0052**; unapplied anywhere, so edited in place).
`origin/main` had not moved past `b717020` (#102, already merged here) when I started or when I pushed, and the PR was
`MERGEABLE/CLEAN`, so no third merge was needed.

| # | Sol finding | Red evidence (before the fix) | Fix | Green evidence | Commit |
|---|---|---|---|---|---|
| 1 | P2: a signed-in user cannot accept an invitation through the UI (the page showed only the account panel whenever a session existed) | `M0-6L.spec.ts` extended: a signed-in user (own tenant) follows another tenant's invitation link. Failed in both projects: `getByLabel("Invitation reference")` not found | `sign-in.tsx`: with an invitation reference in the URL the page shows the current account panel plus an "Accept an invitation" section (reference prefilled, purpose fixed). Email and code verification unchanged. On success the memberships are reloaded, the used reference is removed from the address bar and the form closes. | Same spec, both projects: the user ends with two memberships (owner of their own tenant, finance in the inviter's), shown after a reload, no horizontal overflow, sandbox notice present. The new-user invitation path in the same test is unchanged and passes. | `a1fd611` |
| 2 | P2: a revoked or expired member cannot accept a fresh invitation (the locator survives revocation and `provision_verified_challenge` refused on its mere existence) | 3 new PostgreSQL tests failed: revoked and expired re-invitation (`INVALID_CODE`), and concurrent verification (0 successes instead of 1); 8 others passed | `0052_persisted_identity.sql`: under row locks on the locator and its membership, only a currently ACTIVE membership refuses (invitation left unused). For a revoked or expired one the function inserts a new invitation-bound membership and repoints the locator in the same transaction; the old membership row is untouched history. `MIGRATIONS.md` and the operations note updated. | `identity.integration.test.ts` 11/11: revoked and expired re-invitation (new membership id, role from the new invitation, old row kept, one locator, invitation accepted); an active member is still refused and the invitation stays unused; three concurrent verifications of one fresh invitation create exactly one replacement membership. | `6d49c68` |
| 3 | P2: the sole-constructor test scanned only `apps/api/src/auth` and three web files | Sol's recursive scratch test found the retained callers; the old test could not see them | New `apps/api/src/auth/context-boundary.test.ts`: parses every application source file with the TypeScript parser (apps/api/src, apps/web/app, each package's src and tools; tests and generated output excluded) and fails on any `verifiedTenantContextFromMembership` call, alias or element-access use, cast to `VerifiedTenantContext` (any spelling that names the type), or `effective_tenant_id`/`effectiveTenantId` identifier outside five explicit categories, each with its own tested rule: **bridge** (exactly one call, fed by `asAuthenticatedMembership`), **definition** (`tenant-context.ts`, one frozen `{ tenantId }` cast), **worker** (one cast of a strictly validated queue payload), **retained synthetic sandbox** (API and db source only; every call and cast fed only fixed `DEMO_*` tenant and membership constants; a client tenant may be read only to refuse anything but the DEMO tenant; no header, cookie or bridge reference), **rehearsal** (`synthetic-restore.mjs`, refuses any non-synthetic mode). | 3 tests: the real tree passes; planting one extra caller anywhere (api, web, core, auth) fails; a double cast, `import()` and wrapped casts, an alias, a second bridge constructor, a second worker cast, an unstrict worker payload, and a request-fed synthetic call all fail; the retained synthetic shape passes. | `edc7e05`, `f1eb5fe` |

Two things found while doing round 2, both fixed without touching a timeout:

* The shared identity request bucket is 10 requests per 10 minutes across the whole browser run and a code can be
  re-requested for the same email and purpose only after 60 s. My first signed-in test reused an email within 60 s (the
  hidden `textContent()` wait ran into the 30 s test limit). The spec now spends 5 requests per project (10 total, the
  budget exactly), never repeats an email and purpose, and the signed-in user signs up first and is then invited. The
  spec comment records this budget so the next test author sees it.
* The first clean-clone run of the new boundary test exceeded vitest's 5 s default on a loaded machine. The scan now parses
  only files that can matter, reads in parallel and memoizes parses: 2.5 s down to 0.3 s locally. The default timeout is untouched.

**C7 substitute:** the coordinator's note says Ben's C7 substitute applies to all JobGuard tasks. I do not have its text,
so I changed nothing for it; the new browser assertions keep the sandbox notice and no-overflow checks.

## Round-2 commands (merged head, database and browser steps inside `heavy-slot m0-6l`)

| Command | Exit | Count / result |
|---|---:|---|
| `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build` | 0 | 7/7 each |
| `LANE_BASE_REF=origin/main pnpm lint`, `pnpm lint:lanes` | 0 | lane `m0-6l`, every changed file declared |
| `pnpm test` | 0 | tools 39; core 432; config 2; storage 4; AI 72; API 116 (17 files); web 63; db 194 (39 files) |
| `pnpm test:db` | 0 | 39 files, 194 tests (11 identity tests incl. 4 new) |
| `pnpm test:migrations` | 0 | 2 files, 11 tests |
| `pnpm openapi:check` | 0 | matches |
| `CI=1 playwright test --project=mobile-360 --project=desktop M0-6L.spec.ts` | 0 | 4 passed (red run before the UI fix: 2 failed, the two invitation tests) |
| Full browser suite, both projects, production build, uncommitted browser-path config as before | 0 | 170 passed (85 specs x 2), 4.8 min |
| Clean clone at `f1eb5fe` (earlier build leftovers present), `pnpm turbo run test --filter=@jobguard/db --filter=@jobguard/api`, no new build | 0 | API 116 (17 files), db 194 (39 files). The run before the speed fix failed 1 API test (5 s default timeout) and is recorded above. |

Not run: GitHub-only checks (dependency-review, gitleaks) and the pinned browser, as before; CI on the pushed head is the
proof. Not reviewed by me: whether Sol's remaining judgement on the retained synthetic callers (existing, merged code) is
satisfied by a confinement test rather than a refactor; that is for the checker.

Not independently verified, not accepted.
