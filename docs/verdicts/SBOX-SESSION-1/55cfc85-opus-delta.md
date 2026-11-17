VERDICT: PASS — bound to head 55cfc858ed5f42876596954ec9355eb79ade59fe
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (7 Oct 2026); did not build, repair or order any commit in this PR.

**What this verdict covers.** This is a delta review. The full code review PASS is at `0ed2d76` (comment 6043601814) and the previous delta PASS is at `c163cfe` (comment 6044401848). Since then the integrator pushed one commit, `55cfc85`, which merges main `e77f442` (ENT-1 #100: contractor organisation, migration 0054). Eight files needed hand resolution. I reviewed each resolution as code, checked how ENT-1 and this PR's practice ownership interact, and checked CI on the exact head. The head did not move during the review.

## Findings

**P1:** none. **P2:** none.

**P3-1. ENT-1's upgrade test now upgrades to 0094, not to 0054.** This is a follow-up item and does not block this PR.
`packages/db/test/contractor.integration.test.ts:21` builds its "preceding supported schema" from `MIGRATION_URLS.slice(0,-1)`, which means "every migration except the last". After this merge the last migration is 0094, so that test now upgrades a database that already has 0054 up to 0094. Its comment still says it is testing ENT-1's own upgrade, and it still passes, so nothing is red. No coverage is lost:
- 0054 still runs on an already-populated database in `UIWIRE-12.integration.test.ts`, which upgrades from 0029 with data, and in `shared-money-origin.integration.test.ts`, which upgrades from 0042 with data.
- This PR's `practice-session.integration.test.ts:11-13` now covers the upgrade from main-with-0054 to 0094.

The test's intent will drift again with each later renumbered migration (0095–0099).
*Fix (ENT-1 lane or a small test-hygiene task; the file is outside `sbox-session-1`'s allow-list):* slice up to the index of `0054_contractor_organisation.sql`, as `practice-session.integration.test.ts:11-13` does for 0094.

**P3-2. One cookie now feeds two session registries with different rules.** This is for Ben or the integrator to schedule and does not block this PR.
After the merge, the same `jg_session` value issued by this PR's `/api/session` (`apps/web/app/api/session/route.ts:15-17`) is stored in two places:
- **This PR's registry** (`0094:4-10`) stores only its SHA-256 digest, with a 7-day expiry and revocation.
- **ENT-1's registry** stores the raw value as `control_plane.contractor_practice_session.session_id` (`0054:64-66, 153-165`). It accepts any UUID-shaped cookie (`contractor.application.ts:5, 11-15`) and has no expiry or revocation.

Consequences:
- The "only digests are stored" statement in `docs/contracts/authentication-v1.md` holds for practice jobs but not for the contractor organisation.
- Revoking or expiring a practice session (this PR's forward-fix lever in `MIGRATIONS.md`) does not end that cookie's contractor binding.

Why this is not a defect here: the table is readable only by the owner role, and all data is synthetic. Neither registry authenticates the other's sessions (detail below), so there is no cross-tenant reach.
*Recommended follow-up:* key contractor sessions on the practice digest and call `authenticatePracticeSession` at contractor start and resume.

**P3-3. Cosmetic heading level.** `packages/db/MIGRATIONS.md:142`: ENT-1's text from main uses `### 0054`, which nests it under 0053, while 0094 uses `##`. This is harmless and came from main.

## (1) Merge resolutions — correct and complete

- **Nothing else changed.** The merge's own change (`c163cfe → 55cfc85`) touches exactly 38 files. That is the same file set, with the same line counts, as main's change since the merge base (`2f986a7 → e77f442`).
  - All 30 files only main changed are blob-identical to `e77f442`.
  - All 131 files only this PR changed are blob-identical to `c163cfe`.
  - `e77f442 → 55cfc85` touches exactly this PR's 139 files.
  - `git diff-tree --cc` lists only the 8 overlapping files.
- **`migrate.ts`:** main's 0054 line, then this PR's 0094 line, in file-name order. Nothing was dropped.
- **`packages/db/src/index.ts` and `apps/api/src/workspace/index.ts`:** main's `contractor-repository` and contractor-application exports and this PR's `practice-session` and `practice-access` exports are all present.
- **`app.module.ts`:** contains this PR's `APP_FILTER` import and provider, main's `ContractorController` import and controller entry, and this PR's removal of `CommercialIntegrityApplication` from providers. ENT-1's controller needs only `Pool`, which is still provided.
- **`MIGRATIONS.md`:** both sections, verbatim, 0054 then 0094.
- **`UIWIRE-12` and `demo-bootstrap` tests:** every count line is 46, which is correct (44 before + 0054 + 0094). The UIWIRE-12 range ends at `0094_…`, and the demo-bootstrap title names 0054 and 0094. I also confirmed that `MIGRATION_URLS` has 46 entries, matching the 46 `.sql` files on disk.

## (2) How SBOX and ENT-1 interact — neither weakens the other's isolation

- **Error mapping.** `PracticeErrorsFilter` is `@Catch(PracticeAccessError)` only, and ENT-1 never throws that error type. `ContractorController.call()` turns every error into its own `HttpException`, so ENT-1's error mapping is unchanged (probe A below confirms this at runtime).
- **0094 vs ENT-1 tables.**
  - 0094 changes only `app.job`, `app.material_requirement`, `app.membership` (one SELECT policy for the owner role), five catalogue tables, and `control_plane.practice_session`.
  - Its restrictive policy and catalogue triggers are keyed to the fixed demo tenant `1111…`. ENT-1's practice tenants come from `gen_random_uuid()`.
  - 0094 names no ENT-1 object, and 0054 names no SBOX object.
- **The two new owner-role SELECT policies on `app.membership` combine as an OR.** They are ENT-1's current-tenant policy and this PR's demo-tenant lookup. Every ENT-1 read of `app.membership` filters explicitly by tenant (`0054:84-85`, `0054:236`, `contractor-repository.ts:51`), so the combined policies give ENT-1's code no wider view.
- **Separate session registries.**
  - This PR's `authenticate_practice_session` reads only `control_plane.practice_session`, by digest, and accepts only the fixed demo memberships.
  - ENT-1's `contractor_session` reads only `contractor_practice_session`, by raw UUID.
  - So a contractor-only cookie cannot open practice jobs, and a practice cookie maps only to its own generated contractor org.
- **No PracticeAccess bypass.** ENT-1's controller does not go around `PracticeAccess`: the contractor routes expose no job, case, decision or catalogue data, only the caller's own generated tenant. Its browser flow calls this PR's `POST /api/session` for recovery, and that path is exercised by ENT-1's browser specs, which are green below.

## (3) Migration order

Order is 0053, 0054, 0094, sorted and unique. Neither migration depends on the other.
- **Fresh install** passes in `demo-bootstrap` (46), the `shared-money-origin` fresh test and `tenancy`.
- **Upgrade from main-with-0054** passes in this PR's `practice-session` suite, whose preceding set now includes 0054.
- **Renumbering:** no other test or document hard-codes a count. The one "last migration" assumption is P3-1. `BUILD_PLAN.md:3324` ("highest merged migration is 0053") is a dated ledger record and still justifies 0094.

## (4) Lane file

It merged cleanly on non-adjacent lines.
- Head with the `sbox-session-1` line removed is byte-identical to main.
- Head with the `ent-1` line removed is byte-identical to `c163cfe`.
- Head has 88 lanes: main's 87 deep-equal, plus `sbox-session-1` unchanged.
- All 139 PR files are inside the lane's allow-list.

## What I executed (detached worktree `/private/tmp/opus-sbox-session-1-55cfc85-0710` at `55cfc85`)

- `pnpm install --frozen-lockfile --ignore-scripts`: exit 0.
- `tools/agent-lane-boundary-lint.mjs` with a simulated `pull_request` event (base `e77f442d…`, head `55cfc858…`, ref `codex/sandbox/sbox-session-1`, `GITHUB_HEAD_REF` set): exit 0, "Lane boundary passed", lane `sbox-session-1`. `tools/lint.mjs` with the same event: exit 0.
- `pnpm typecheck`: exit 0. `pnpm build`: exit 0.
- `node --test tools/*.test.mjs`: 42/42.
- API vitest: 19 files, 342 tests, plus my probe (20 files, 345 tests), exit 0. `openapi:check`: exit 0.
- Web vitest: 11 files, 100 tests, exit 0.
- **Probe A (executed, 3/3 pass), `apps/api/src/zz-opus-merge-probe.test.ts`, untracked.** It loads the real `AppModule` and checks:
  - the filter catches only `PracticeAccessError`;
  - contractor routes keep ENT-1's mapping: 403 `MODE_FORBIDDEN`, 401 `UNAUTHENTICATED` for a missing or malformed cookie, 403 `FORBIDDEN` for a foreign Origin, 503 when the database is unreachable;
  - practice routes still go through the global filter: 403 `SYNTHETIC_MODE_REQUIRED` and 401 `UNAUTHENTICATED`.
- **Probe B (executed, static).** The migration list equals the files on disk, is sorted and unique, and ends 0053, 0054, 0094. There are no cross-references between 0054 and 0094. I also listed the policies each migration adds.
- **Probe C (written, NOT executed), `packages/db/test/zz-opus-merge-probe.integration.test.ts`, untracked.** It covers: upgrade from main-with-0054 carrying a live contractor session, isolation between the two registries, which tables the policies attach to, the effect of the membership lookup on `contractor_member_active` and `contractor_allowed`, and fresh install. Embedded PostgreSQL could not start: `initdb` failed with "could not create shared memory segment: No space left on device" (`shmget`). Following the brief, I did not retry and relied on CI.

## What I relied on CI for

Run `37670936801` (event `pull_request`, headSha `55cfc858…`) concluded success. `checks` passed in 11m41s:
- typecheck, lint (lane boundary passed for `sbox-session-1` against base `e77f442`), and build all passed.
- **Test:** node:test 42/42. Vitest: storage 2, config 1, ai 72, core 1421, api 342 (including `openapi:check`), web 100, db 225, all passed with 0 failed. The PostgreSQL suites include `contractor` (17), `practice-session` (10), `UIWIRE-12` (22), `demo-bootstrap` (2), `tenancy` (9), `shared-money-origin` (11) and `sandbox` (2).
- **Browser:** the full e2e suite ran on `mobile-360` and `desktop` with `retries: 0`, 188 passed. That includes ENT-1, SBOX-SESSION-1, VALUE-1 and UIWIRE-7; no tests are skipped or marked `only`.

`dependency-review` and `secrets` passed. The known `extra-origin.test.ts` flake did not occur.

## Not verified in this pass

- I did not re-review the PR's own application code, migration or tests line by line. Outside the 8 resolved files they are byte-identical to `c163cfe`, and they rest on the full Opus PASS at `0ed2d76`.
- Probe C and all PostgreSQL and browser suites were not run locally. They rest on the CI run above.

