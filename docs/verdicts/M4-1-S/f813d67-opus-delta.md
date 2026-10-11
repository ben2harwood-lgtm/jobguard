VERDICT: PASS — bound to head f813d67b2a64e661c620779ec72663f6afc0fd5f
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (7 Oct 2026); did not build, repair or order any commit in this PR.

**What this covers.** This is a delta review since the last REPAIR verdict, which was bound to `4514a2a` (comment 6047526615). I reviewed all three commits since then:
- `c2ea055`: builder repair 20, the import fix;
- `c0f2f9f`: the integrator's merge of main `17523d9` (CH-3a #98, SEC-DEPS-2026-10-08 #122, CH-2 #97);
- `f813d67`: builder repair 21, which re-applies this PR's test changes on top of CH-3a and CH-2.

I judged them against that verdict's P1-1 and P3-1, C1–C8, and Ben's "keep documented design" ruling.

**In short:** the one blocker is fixed. The workbench PostgreSQL test now loads without `packages/db/dist`. The application checks that moved to the API unit tests are real: each of four deliberate breakages of the application code makes them fail. The merge kept both sides. Every test file this PR touches is main's version plus exactly this PR's earlier changes, and nothing else. The two browser-test changes are needed because of CH-2, and they weaken nothing. Migration 0097 is byte-identical. No product code changed since `4514a2a` apart from what main brought in. CI on this exact head is fully green, including PostgreSQL, the build and both browser projects.

## Findings

No P1 or P2 findings.

**P3-1. Two documents are slightly out of date after the merge. Docs only, not blocking.**
- `BUILD_PLAN.md:3330` (§12.2, the M4-1-S-R ledger amendment) still lists only "0094 is SBOX-SESSION-1's and 0095 CH-3a's". It should also name CH-2's 0096, which is now merged, so 0097 is simply the next free number.
- `packages/db/MIGRATIONS.md:563` says "Fresh installs still apply 45 files". A fresh install now applies 49 (`MIGRATION_URLS` has 49 entries; there are 49 `.sql` files).
- **Fix** (at merge, or as a follow-up): name 0096 in the ledger line, and say "all registered migrations" instead of giving a count.
- My predecessor's P3-1 asked to raise the hard-coded migration counts. That is now unnecessary: main made `UIWIRE-12.integration.test.ts` and `demo-bootstrap.integration.test.ts` count-agnostic, and both files are byte-identical to main on this head.

**P3-2. Renumbering note.**
- `packages/db/test/recovery-cases.workbench.integration.test.ts:6` finds the upgrade point by searching for the file name `0097_recovery_case_current.sql`.
- If this migration is ever renumbered again and that name is not updated, the search quietly returns −1. The upgrade test would then install "every migration but the last" instead of failing.
- No renumber is expected, because main is at 0096. If one happens, update that line as well.

**Observation for the CH-2 owner, not this PR's defect.**
- On main, the proof stage that CH-2 added to the captured-job page can show its own `<p role="alert">This proof record could not load. Try again.</p>`. It shows it whenever `GET /api/jobs/:id/proof` fails three times:
  - see `proof-stage.tsx`;
  - `ProofApplication.project` answers `NOT_FOUND` while the job has no confirmed scope.
- That alert is why repair 21 limited the M4-1-S alert checks to the workbench.
- A real builder who opens a fresh job may see a "could not load" error that is not really an error. It is worth a small CH-2 follow-up.
- I confirmed the source in code. I did not reproduce it in a browser.

**Still open (recorded follow-ups, not touched by these commits):** Sol P3-3 (raw codes while a retry is held), Sol P3-4 (stale PR description), REC-UI-1, REV-ACCT-1, and the bound between allocated gross and eligible net.

## What I checked, item by item

**(1) Import fix (`c2ea055`). Correct.**
- `recovery-cases.workbench.integration.test.ts` no longer imports `@jobguard/db` or anything from `apps/api`. Its only `apps/api` mention is a comment (`:545`).
- The real-PostgreSQL proof now uses `../src/index.js` only, and does what the previous verdict asked:
  - the plain repository refuses the rate (the control);
  - `new RecoveryCaseRepository(practiceMaterialPool(runtime, auth.digest))` opens the case, lists it and reviews it, with `Supplier agreement Synthetic repair 19 agreement` and `recorded: true`;
  - a repository on the stranger's digest gets `RECOVERY_SOURCE_NOT_RECOGNISED`;
  - `authorizePracticeJob` for the stranger gives an identical `NOT_FOUND` for another session's job and for a job that does not exist, while the owner resolves.
- The application checks moved to `apps/api/src/recovery-case.application.test.ts:137-219`. They use a recording fake pool behind the *real* `practiceMaterialPool`.
  - They assert that every transaction straight after `BEGIN` installs `app.practice_material_digest` with the authorised session's digest. That covers list, command plus its reply read, command with a deferred body reader, eligibility plus its reply read, and eligibility using the session override.
  - They assert that a refused target gets 404 `{code:"NOT_FOUND"}` through the real `PracticeErrorsFilter`, never connects to the pool and never reads the body.
  - They assert that a body that cannot be parsed is a 400 refusal, with no connection.
- `PracticeAccess` stores `sessionId` on itself, so the stub's digest-per-session really does tell the owner and the other session apart.
- **The moved checks fail on the old code.** I temporarily changed `recovery-case.application.ts` four ways. Each change made a repair-20 test fail, and I restored the file byte for byte afterwards:
  - (A) repository on the plain pool (the old repair-18 code);
  - (B) eligibility ignores the session override;
  - (C) the body is read before authorisation;
  - (E) the reply read uses the plain pool.

**(2) The two files taken from main. Both sides are present and every assertion is kept.**
- For every file, I compared this PR's own changes against its base before and after the merge:
  - **Same:** `recovery.integration.test.ts`, `recovery-cases.integration.test.ts` and 52 other files carry exactly the same added and removed lines as at `4514a2a`.
  - **Different, and reviewed:** only four files: the API application test (`c2ea055`), the workbench test, the M4-1-S spec and the lane registry.
  - **Each changed file's change since `4514a2a`** is exactly main's change, apart from those four files and the two count-agnostic files that are now identical to main.
- So main's CH-3a and CH-2 lines are present in both taken files: `installLegacySyntheticPartyFixtures`, the UTF8 cluster, and "configures … after invoicing", where the job is moved live → invoiced first.
- This PR's lines are all back as well: `reviewedRepository()`, the reworded fictional source references, and the 12 added recovery tests.
- Nothing was removed from either side. The fixtures meet CH-3a through main's own party-fixture helper, and nothing else was relaxed.
- In repair 21, the only change to the workbench test is `--encoding=UTF8` in `initdbFlags`. CH-3a's site revisions call `normalize()`, which needs a UTF8 database. Main's two taken files carry the same flag.

**(3) Browser-test changes (`apps/web/e2e/M4-1-S.spec.ts`). Needed, and they weaken nothing.**
- **Alert locators.** All 8 `p[role=alert]` locators became `#recovery-cases p[role=alert]`.
  - The workbench's alert is inside `<section id="recovery-cases">` (`recovery-cases.tsx:72`). A locator that finds nothing would fail the test, not pass it.
  - The text, focus and count checks are unchanged.
  - The `toHaveCount(0)` checks now mean "no alert in the workbench", which is what this lane's tests are about. The proof alert is CH-2's (see the observation above).
- **Evidence fixtures.** Two fixtures insert `app.evidence_object` under normal constraints. CH-2's `guard_watchdog_input` (0096) now requires `app.tenant_id` to be set and the job to be live.
  - The fixtures now set the tenant, assert the job is `quoting`, and move it accepted → live through `app.transition_job`. They do not write the status directly.
  - The activation row, the cap snapshot and the lifecycle now share one fictional baseline id.
  - The builder did *not* take the easier route of inserting the evidence with constraints switched off. That route would have been a bypass.
  - One note: the move runs while `session_replication_role=replica` (the existing fixture setup), so CH-3a's `job_parties_live_guard` trigger does not fire during it. That is harmless here, because `openReview` saves customer and site first, and no assertion depends on it.

**(4) Migration and product code. Unchanged.**
- `0097_recovery_case_current.sql` SHA-256 is `84aef359c62455818e4eb66d26ca9d21c13c49ddd06af202fd107be3950d9375` at both `4514a2a` and the head.
- It is registered last, after `0096_watchdog_live.sql`.
- `git diff 4514a2a f813d67 -- apps packages/core packages/db/src` contains only main's changes, plus the reviewed API test.
- Lane registry:
  - it equals main's 92 lanes, unchanged and in order, plus the PR's own `m4-1-s-repair` lane;
  - that lane's `allow` list is unchanged since `4514a2a`; only `receipt` moved to `BUILDER_RECEIPT_repair21.md`;
  - all 58 changed files fall inside `allow`.

**(5) CI on `f813d67`. Fully green.**
- Run 37711476042: `checks` success (14m54s), `dependency-review` pass, `secrets` pass. The Vercel previews were skipped by their ignored-build step.
- Lint: the lane boundary passed on base `17523d9` and head `f813d67`.
- `pnpm test`: 13 of 13 tasks.
  - core: 1594 tests;
  - api: 22 files, 582 tests;
  - web: 19 files, 350 tests;
  - db: 54 files, 552 tests. That includes `recovery-cases.workbench.integration.test.ts` (41), `recovery.integration.test.ts` (15), `recovery-cases.integration.test.ts` (12) and `practice-session.integration.test.ts` (11).
- `pnpm build`: 7 of 7.
- Production-build browser run: `252 passed (10.0m)`, with no flaky or skipped tests.
  - On this head, `playwright test --list` shows 252 tests in 51 files.
  - Those include M4-1-S (8 tests in each of `desktop` and `mobile-360`), SBOX-SESSION-1 (1 in each) and VALUE-1 (1 in each).
- None of the known flakes appeared.

## Evidence

**Source-inspected:**
- all three commits in full;
- `recovery-case.application.ts` and `practice-access.ts`;
- `practiceMaterialPool` (`practice-session.ts:63-87`) and `withTenant` (it sends exactly `BEGIN`);
- main's CH-2 parts: `0096` `guard_watchdog_input`, `proof-stage.tsx`, `proof.application.ts`;
- main's CH-3a parts: `0095` `require_job_parties` and its triggers;
- `0003` `transition_job`;
- the `openReview` helper, `recovery-cases.tsx:72`, both builder receipts, and the earlier verdict.

**Executed** (detached worktree `/private/tmp/opus-m4-1-s-r-f813d67-0710`; 66 GB free disk):
- `pnpm install --frozen-lockfile --ignore-scripts`: exit 0.
- `pnpm typecheck`: exit 0, 7 of 7.
- `npx turbo run lint`: exit 0, 7 of 7.
- `node tools/lint.mjs` and `tools/agent-lane-boundary-lint.mjs` with a simulated `pull_request` event (base `17523d9`, head `f813d67`): exit 0, lane `m4-1-s-repair` passed.
- Repeat of the previous P1: with only core and storage built and **no** `packages/db/dist`, `vitest list test/recovery-cases.workbench.integration.test.ts` exits 0 and lists 41 tests, and the whole db suite collects cleanly. Before, this failed at the `@jobguard/db` import.
- API: `vitest run` on `recovery-case.application`, `.command.application` and `.controller` tests: 3 files, 89 tests pass. My four mutation probes (A, B, C, E) each produced exactly one expected failure; file restored.
- Real PostgreSQL under `heavy-slot`: workbench, recovery-cases, recovery and practice-session integration suites: exit 0, 4 files, 79 tests. (I hydrated the embedded-PostgreSQL dylib symlinks first. There was no shared-memory error.)
- PostgreSQL probe: I replaced the scoped repository in the workbench practice test with the plain runtime pool. The test then fails with `RECOVERY_SOURCE_NOT_RECOGNISED`, so its success depends on the session scope. File restored.
- `shasum -a 256` on 0097 at both commits.
- Per-file comparisons of each file's changes before and after the merge.

**Relied on CI for:** `pnpm build` and the production-build browser run at both viewports, including M4-1-S, SBOX-SESSION-1 and VALUE-1; and the full db, core and web suites.

**Not verified:**
- I did not run Playwright locally.
- I did not reproduce the CH-2 proof-stage alert in a browser.
- I did not re-review the product code that is unchanged since `4514a2a`; earlier verdicts covered it, and I confirmed it is unchanged.

