VERDICT: PASS — bound to head cf774fbc66a1b0144f6a9389137d09f512edf2b8
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (7 Oct 2026); did not build, repair or order any commit in this PR.

**Short version.** This is a delta review of round 14, which is one commit (`cf774fb`) on top of `3543cbb`. My REPAIR on `3543cbb` (comment 6047005201) had already accepted the code of rounds 11–13. It asked for two test fixes and then a green `checks` job that includes the browser suites. Both fixes are done exactly as asked, and nothing else changed. CI on this exact head is fully green, with all 43 PostgreSQL files and all 230 browser tests passing at mobile and desktop sizes. This is the first head since the SBOX merge where the build and browser steps actually ran.

## Findings

**No P1 or P2 findings.**

### Previous P1-1 (SBOX practice-session suite needs UTF8): fixed
- `packages/db/test/practice-session.integration.test.ts:18`: the only change in the file is `initdbFlags:["--lc-messages=C"]` → `["--lc-messages=C","--encoding=UTF8"]`.
  - Line count is the same (247 → 247), and exactly one line differs (probe 1 below). No assertion, test body or timeout changed.
- `packages/db/MIGRATIONS.md:148-150` gains the one requested sentence: practice-session issuance now writes a generated site revision, so that suite passes `--encoding=UTF8`.
- CI: `test/practice-session.integration.test.ts (10 tests)` ✓. That is 10/10 on UTF8, with every original SBOX assertion intact. At `3543cbb` it was 9 of 10 failing.

### Previous P1-2 (whitespace-reason test never reached the CHECK): fixed
In `packages/db/test/job-parties.integration.test.ts`, the old boolean `directInsert` is replaced by three routes (:478), and all three run for every reason (:508).
- **`routine`** is unchanged. It runs as the runtime login and expects `22023 CORRECTION_REASON_REQUIRED`.
- **`runtime-insert`** is new and is an additional assertion, not a replacement. It is the same direct INSERT as before, run as `ch3a_login`, and now correctly expects `42501`. 0095:190 revokes INSERT on the table, and the `3543cbb` CI run showed exactly "permission denied for table job_party_binding" for this statement.
- **`owner-insert`** is the route that actually reaches the constraint:
  - It uses the admin pool inside the normal `withTenant` transaction (:481). `withTenant` does `BEGIN` and sets `app.tenant_id` locally, and does `ROLLBACK` on any error (`packages/db/src/tenant-context.ts:66-75`).
  - It runs `SET LOCAL ROLE jobguard_migration` and asserts `current_user` (:484-485), then does the binding INSERT (:487-488).
  - It runs `RESET ROLE` (:490) before the receipt completion (:491) and the audit append (:492). So if the constraint were ever defective, the record protocol would still complete and could not be blamed for the rejection.
  - It expects `{code:"23514", constraint:"job_party_binding_correction_reason_check"}` (:513).
- Because the role switch is `SET LOCAL`, it ends with the transaction on both commit and rollback. A pooled admin connection therefore never leaks the role.
- The runtime login gains no new ability. The existing assertion that runtime `SET ROLE jobguard_migration` fails with 42501 (:718) is untouched.
- All eight reason cases are byte-identical: tab, LF, CR, NBSP, BOM, empty, spaces, overlong UTF-16 (:504). The full unchanged-state comparison runs after every route (:516): audit head, binding count, job revision, current pointer, receipt count, audit count. The file still has 33 test declarations and 7 `toEqual(before)` assertions, the same as before.
- CI: `test/job-parties.integration.test.ts (86 tests)` ✓. At `3543cbb` it was 78/86. The eight `it.each` cases now pass all three routes each.

### P3 (optional, non-blocking)
- **P3-1:** `runtime-insert` matches on the code `42501` only. An RLS WITH CHECK failure also raises 42501, so it would be slightly sharper to also match `message: expect.stringContaining("permission denied for table job_party_binding")`.
  - In practice the table-privilege check runs before RLS, and the tenant setting matches, so the current assertion is not wrong. This is an extra assertion either way.
- **P3-2..4 carried from my previous verdict, unchanged:**
  - the audit-event scan cost in `practiceOwnedJobsSql()`;
  - the documented adoption-event trust boundary;
  - renumber safety. UIWIRE-12 and demo-bootstrap hard-code 47 migrations and the `0095_job_parties.sql` name, and `migrate.ts` keys backfill on that name. All are correct for the planned final number 0095, but any later renumber must update them.

## Specific checks requested
1. **The practice-session change is exactly the one initdb flag.** Confirmed by diff and by probe 1.
2. **The job-parties change keeps all eight cases and every state assertion; the owner route really reaches the constraint as `jobguard_migration`, with `SET LOCAL ROLE` inside the transaction and `RESET` before the receipt and audit; `runtime-insert` is an extra assertion.** All confirmed, as above.
   - For constraint reachability I also scanned every migration (probe 2). `app.job_party_binding` has no BEFORE INSERT trigger: there is only the BEFORE UPDATE/DELETE immutability trigger and the deferred AFTER INSERT record trigger.
   - The RLS policy admits `jobguard_migration` when `app.tenant_id` matches.
   - The only other CHECKs (`revision>=0`, provenance `'entered'`) pass for the test's values.
   - So the first failure the owner INSERT can meet is the `correction_reason` CHECK, and CI's 23514 plus constraint-name match confirms it.
3. **Nothing else changed since `3543cbb`.** `git diff 3543cbb cf774fb --stat` shows 4 files only: the two test files, `MIGRATIONS.md`, and the new `docs/verdicts/CH-3a/BUILDER_RECEIPT_round14.md`. The parent of `cf774fb` is `3543cbb`. Base `origin/main` is still `3395d343…`. The PR's file set against main gains only the receipt. Migrations, source and the lane file are byte-identical to the head I reviewed last time.
4. **CI on `cf774fb` is green.** Run 37689621646 (event `pull_request`, headSha `cf774fbc…`, conclusion success). `checks` passed in 15m50s, `dependency-review` passed, `secrets` passed, and the Vercel checks pass (ignored build step).

## What I source-inspected
- The full round-14 diff and the round-14 builder receipt. I treated the receipt as a claim and checked each point against the diff and CI.
- The `job-parties.integration.test.ts` helper and the whitespace test in full, plus the existing owner-role pattern at :697-702.
- `withTenant` (`packages/db/src/tenant-context.ts`).
- 0095: the table definition and CHECKs (:76-90), the RLS/grant loop and runtime INSERT revoke (:177-190), the validator (:8-17), and the trigger list.
- The 0094 trigger loop: its owner trigger covers only the material tables.
- The previous REPAIR verdict in full.

## What I executed
All of this ran in the detached worktree `/private/tmp/opus-ch-3a-cf774fb-0710` at the exact head. The worktree is clean afterwards.
- `pnpm install --frozen-lockfile --ignore-scripts` → 0. Disk had 50 GB free.
- `pnpm exec turbo run typecheck --force` → 0 (7/7, uncached).
- `node tools/agent-lane-boundary-lint.mjs` with a simulated pull_request event (base `3395d343…`, head `cf774fbc…`, ref `codex/sandbox/ch-3a`, `GITHUB_HEAD_REF` set) → 0, "Lane boundary passed", lane `ch-3a`.
- `LANE_BASE_REF=origin/main pnpm lint` with the same metadata → 0 (7/7).
- `pnpm build` → 0 (7/7).
- DB unit tests: `vitest run src test/verify-evidence-pack-cli.test.ts` → 0 (3 files, 12 tests).
- `playwright test --list` → 0. It lists 230 tests in 50 files: 115 per project (`mobile-360`, `desktop`). These include CH-3a 21+21, SBOX-SESSION-1 1+1, VALUE-1 1+1, SBOX-1 3+3, SBOX-2 3+3 and SBOX-resume 3+3. That matches CI's "Running 230 tests … 230 passed (9.4m)".
- **Own probe 1 (test-edit integrity, 18 checks) → 0, all passed.** It compares the files at `3543cbb` and `cf774fb` and checks that:
  - practice-session has exactly one changed line, and the change is only the added flag;
  - job-parties keeps identical test titles (29) and declarations (33), a byte-identical eight-reason table, and 7 → 7 unchanged-state assertions;
  - the routine and owner expectations are present, with no new skip/only/todo/timeout;
  - the owner route uses the admin pool, in the order SET LOCAL ROLE < binding INSERT < RESET ROLE < receipt UPDATE < audit;
  - there is no other role switch or GRANT in the helper.
- **Own probe 2 (constraint reachability, 17 checks) → 0, all passed.**
  - It confirms there is no BEFORE INSERT trigger on `job_party_binding` anywhere in the chain, the CHECK set, no later added CHECK, and that the RLS policy admits the migration role.
  - It re-implements `app.valid_party_revision_text` in JS, using a trim set checked byte-for-byte against 0095. All eight reasons evaluate false, so the CHECK must raise 23514. The sibling boundary reason evaluates true, and 250 emoji pass while 251 fail.
  - A weaker ASCII-space-only trim would let tab/LF/CR/NBSP/BOM through. So the owner route really does distinguish a correct constraint from a defective one.

## What I relied on CI for (run 37689621646, job 113026153402, exact head)
- typecheck, lint (lane boundary passed for `cf774fbc…`), core 1430/1430, API 377/377, web 115/115.
- **DB 43/43 files, 320/320 tests**, including:
  - practice-session 10, job-parties 86, sandbox 2, UIWIRE-12 22, demo-bootstrap 4;
  - practice-scope 6, practice-finding-scope 2, tenancy 9, job-import 2, shared-money-origin 12, restore-rehearsal 10.
- The build, the browser install and **"Exercise the production web build at mobile and desktop sizes": 230 passed, 0 failed, 0 flaky, 0 skipped.** That covers CH-3a.spec (42), SBOX-SESSION-1, VALUE-1, SBOX-1/2/resume, ENT-1 and the rest, in both projects.
  - This closes my previous P1-3. The round 11/12 browser cases (second-session 404/401, two-job unchanged-save revisions, explicit selection) and the SBOX/VALUE journeys with fictional scenario labels now have browser evidence.
- No embedded-PostgreSQL ECONNREFUSED or SH-1 timeout appeared. There were no flakes.

## What I did not verify
- **Any PostgreSQL behaviour locally.** `ipcs -m` showed 32 of 32 System V shared-memory segments in use (`kern.sysv.shmmni: 32`). Following the shared-memory rule, I did not try to start embedded PostgreSQL and relied on CI for every PostgreSQL fact above.
- I did not run the browser suites locally (CI only).
- I did not re-review the code of rounds 11–13 beyond confirming that it is byte-identical to the head I reviewed in 6047005201.

