VERDICT: REPAIR — bound to head 3543cbb1b5d7463f3c060daafbbd492401add2d3
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (7 Oct 2026); did not build, repair or order any commit in this PR.

**Short version.** The code direction in rounds 11–13 is sound: SBOX-SESSION-1's ownership guarantees are kept, CH-3a's quote/workspace changes were re-applied faithfully on top of SBOX's versions, and the first Sol P2 (saved revisions being silently replaced) is genuinely fixed. But CI on this exact head is red for two real reasons (not flakes), so the browser suites never ran. Both fixes are small and stay inside the existing lane.

## Findings

### P1-1 — SBOX's practice-session suite fails 9 of 10: session issuance now needs a UTF8 database
- CI run 37683586054 (event pull_request, headSha `3543cbb1b5d7…`), job `checks`, step `Run pnpm test`: `test/practice-session.integration.test.ts (10 tests | 9 failed)`. Every failure is `error: Unicode normalization can only be performed if server encoding is UTF8`, raised from `compute_site_match_key()` inside `app.issue_practice_session` (stack: `issuePracticeSession src/practice-session.ts:15`).
- Cause: round 13's new trigger `app.seed_generated_practice_job_parties()` inserts a `site_revision` during issuance (`packages/db/migrations/0095_job_parties.sql:222-223`). That fires `compute_site_match_key()`, which always calls `normalize(...,NFKC)` (`0095_job_parties.sql:57`). That suite's cluster is created with `initdbFlags:["--lc-messages=C"]` only (`packages/db/test/practice-session.integration.test.ts:18`), and `embedded-postgres` then initialises SQL_ASCII (I saw the same "locale C … encoding SQL_ASCII" initdb line locally). So round 13 moved the 0ad202c failure from `JOB_PARTIES_REQUIRED` to an encoding error; the SBOX suite is still red.
- The PR's own documented rule (`packages/db/MIGRATIONS.md:138-150`) already says site-revision writes need UTF8 and that "embedded test clusters that write site revisions pass `--encoding=UTF8`". Issuance now writes a site revision, so this suite falls under that rule. The integrator's merge `e988e2c` already made the same environment-only change to SBOX's sandbox suite.
- **Required fix:** add `"--encoding=UTF8"` to the `initdbFlags` at `packages/db/test/practice-session.integration.test.ts:18`. This changes the test environment only: no assertion, no test body, no timeout. Also add one sentence to the MIGRATIONS.md encoding note saying practice-session issuance now writes a generated site revision and needs a UTF8 database (Neon is UTF8). Then CI must show that suite at 10/10 with every original SBOX assertion intact. The integrator should note that this is a one-line *modification* to an SBOX test file, not an addition. I consider it strictly necessary and not a weakening.

### P1-2 — Round 12's whitespace-reason test can never reach the constraint it claims to prove (8 failures)
- Same run: `test/job-parties.integration.test.ts (86 tests | 8 failed)`. All 8 are `refuses <tab|line feed|carriage return|NBSP|BOM|empty|spaces|overlong UTF-16> correction reasons in both routine and constraint…`, failing at `job-parties.integration.test.ts:503`. Expected `{code:"23514", constraint:"job_party_binding_correction_reason_check"}`, received `42501 permission denied for table job_party_binding`.
- Cause: the `directInsert` branch (`job-parties.integration.test.ts:480`) inserts as the runtime login (`ch3a_login`, which the helper even asserts at :479). But 0095 revokes runtime INSERT on `app.job_party_binding` (`0095_job_parties.sql:190`), so the CHECK is never evaluated. The routine half of each case passed in CI, with the full unchanged-state assertions (first loop iteration). So the `bind_job_parties` refusal of tab/LF/CR/NBSP/BOM is proven. The constraint half (`0095_job_parties.sql:81`) is not.
- **Required fix:** run the direct-INSERT branch on a connection that actually has INSERT on the table. Use the admin pool, either as the owner via `SET LOCAL ROLE jobguard_migration` with `app.tenant_id` set (the pattern at :689) or as admin. The runtime login cannot `SET ROLE` to the migration role, and must not be given that ability. Keep the receipt/audit protocol and the `23514` + constraint-name expectation. Keep the unchanged bindings/revision/current/receipts/audit-count/audit-head assertions. If wanted, keep a separate runtime assertion that a direct INSERT is denied with `42501`. CI must show job-parties 86/86.

### P1-3 (consequence) — no browser evidence at this head
`pnpm test` failed, so steps 9–11 (`pnpm build`, browser install, "Exercise the production web build at mobile and desktop sizes") were skipped. None of CH-3a.spec (42 cases), SBOX-SESSION-1, VALUE-1, SBOX-1/2/resume ran in either project. The new round 11/12 browser cases are untested in a browser: second-session 404/401, two-job unchanged-save revisions and explicit selection. So are the SBOX/VALUE journeys, now that the live home job carries "Fictional scenario customer" labels. A green `checks` on the repaired head, including both browser projects, is required before PASS.

### P3 (non-blocking notes)
- P3-1 Performance: `practiceOwnedJobsSql()` (`packages/db/src/practice-session.ts:34-43`) is a recursive CTE that joins `app.audit_event` on `event_type` and a JSON path. `audit_event` has only the `(tenant_id, occurred_at)` index (`0001_audit.sql:30`). Every practice authorisation, and each registry query, therefore scans all of the shared demo tenant's audit rows, and this grows with every session. Consider a partial expression index in 0095, e.g. on `(tenant_id, (payload->'references'->>'sourceJobId')) WHERE event_type='job.imported_baseline_attested'`. Not required for this PR.
- P3-2 Trust boundary, documented: import ownership is inherited through a server-written, append-only adoption audit event. Runtime credentials could append such a row, but SBOX's per-session isolation is already enforced by the application rather than RLS within the shared demo tenant. So this adds no new exposure. The receipt says this explicitly; just keep it in mind if session isolation ever moves into RLS.
- P3-3 Renumber safety: UIWIRE-12 and demo-bootstrap hard-code 47 migrations and the `0095_job_parties.sql` name, and `migrate.ts:67` keys the backfill-mode injection on that file name. All of these are correct for the planned final number 0095, but any later renumber must update them (known; same as previous verdicts).

## Specific checks requested
1. **SBOX-SESSION-1 not weakened.**
   - Migrations: `git diff 3395d34 HEAD -- packages/db/migrations/` touches only `0095_job_parties.sql`, so 0000–0094 are byte-identical to main.
   - `practice-session.ts` (round 11 SQL, round 13 comment only): the authoriser now admits exactly the session's own jobs plus imported jobs with a NULL owner, `provenance='imported'`, reached through `job.imported_baseline_attested` events whose `sourceJobId` is an owned job. A job owned by another session is never admitted, because the recursion requires the digest to be NULL. Unreferenced legacy jobs stay hidden. There is no first-touch claim. The case/decision variants are equivalent to the old SQL for owned jobs.
   - I judge this change necessary. The alternative, setting owner and scenario at import time, would mislabel the scenario: 0094's CHECK allows only `capture|core-1000|home`. Only CH-3a's `adopt` writes `sourceJobId`, from a server-authorised source and a hash-derived job id.
   - `practice-session.integration.test.ts`: 5 added lines, no removals. They seed parties explicitly before the test's direct quote-document insert, which CH-3a's document guard needs.
   - Issuance marker: `current_user='jobguard_migration'`, a server identity. Row fields and GUCs are not trusted. The live guard is unchanged, with no exemption. Runtime `SET ROLE` is denied, and the generator is INVOKER with no PUBLIC/runtime/infrastructure EXECUTE. These are asserted in the round-13 cases, which passed in CI on UTF8.
   - Quoting/capture jobs stay unbound until the user enters details. Switch-live, adoption and documents still require parties.
2. **Quote/workspace re-application.** I compared token-level edits of `git diff 2f986a7 52006fa` against `git diff 3395d34 HEAD` for `apps/api/src/quote/*` and `workspace/application.ts`. All edits are pure insertions, with no SBOX code removed. They are the same four insertions in each file, except the activation guard now uses `practice.context/membershipId/digest` after `access.job`. Every SBOX `PracticeAccess.job` call is intact. The preview endpoint uses the cookie-aware application.
   - Job-parties endpoints: missing/malformed/invented session → `UNAUTHENTICATED` (401 through `practiceFailure` / the global `PracticeErrorsFilter`). Another session → `NOT_FOUND` (404, body `{code}` only, no labels). A foreign requested tenant on an owned job → 403, after the ownership check.
   - OpenAPI: main's 60 paths unchanged, plus 4 additions. The generator `--check` passes.
3. **Sol P2s.**
   - P2-1 (hydrate from the bound snapshot): fixed. I ran the round-12 component tests against `0ad202c`'s `job-parties.tsx`: **3 failed / 7 passed** (the two snapshot-hydration cases and the stale-edit refusal). At head: **10/10**. The real-PostgreSQL two-job customer/payer regressions passed in CI. The browser cases did not run (P1-3).
   - P2-2 (nonblank reasons): the routine half is fixed and CI-proven. The constraint half is unproven (P1-2).
4. **Integrity.** All 0095 SQL added since 52006fa is ASCII. The only non-ASCII line, an em dash in the invoice text at :367, was already present at 52006fa. The round-10 validator patterns are unchanged.
   - `migrate.ts` lists 47 files, matching the directory, with no duplicates, in order 0053, 0054, 0094, 0095. The test totals of 47 are correct.
   - Lane file: main's 89 lanes are unchanged and in main's order, plus `ch-3a`, with no duplicate keys. Since 52006fa the `ch-3a` allow list gains exactly `packages/db/src/practice-session.ts` and `packages/db/test/practice-session.integration.test.ts`, both justified.
   - Merge `e988e2c`: the combined-diff resolutions are true unions: app.module, workspace/db index exports, migrate.ts, demo-runtime keeping SBOX's `practice_session_digest IS NULL`, jobguard-app, and the test totals. The shared-token `SYNTHETIC_SESSION` the merge left in `/api/jobs` was replaced by the real cookie in round 11. No skipped or deleted tests, and no longer timeouts. The round-11 API unit edits replace "no connection opened" with an allowlist of SQL that runs before ownership is checked, which is equivalent under database-backed session authentication. `dependency-review` and `secrets` are green.

## What I executed (detached worktree `/private/tmp/opus-ch-3a-3543cbb-0710` at the exact head; clean afterwards)
- `pnpm install --frozen-lockfile --ignore-scripts` → 0.
- `pnpm exec turbo run typecheck --force` → 0 (7/7, uncached).
- `node tools/agent-lane-boundary-lint.mjs` with a simulated pull_request event (base `3395d343…`, head `3543cbb1…`, ref `codex/sandbox/ch-3a`, `GITHUB_HEAD_REF` set) → 0, "Lane boundary passed", lane `ch-3a`.
- `pnpm lint` with the same metadata → 0. `pnpm build` → 0 (7/7).
- Web tests → 0 (13 files, 115 tests). API `vitest run src --exclude src/health.test.ts` → 0 (19 files, 376 tests). DB unit `vitest run src test/verify-evidence-pack-cli.test.ts` → 0 (12). `node --test tools/*.test.mjs` → 0 (42 pass, 0 skipped).
- `node --import tsx src/generate-openapi.ts --check` → 0.
- Red/green for Sol P2-1: 3 failed / 7 passed at `0ad202c`'s component, and 10/10 at head. The file was restored with `git checkout`.
- **Own adversarial probe A** (application boundary, fake pool that records every SQL statement): view/command/adopt/list with missing, malformed, invented and stranger sessions, plus an owner with a foreign tenant and a stranger with a non-UUID job id. **20/20 pass**, with the expected code each time and **zero** party or business queries before refusal.
- **Own adversarial probe B** (real PostgreSQL): issuance under SQL_ASCII and UTF8 clusters, a migration-owner direct INSERT of tab/LF/NBSP/BOM reasons, and a stranger authorising an owner's job. **Could not run.** Embedded PostgreSQL's initdb bootstrap failed under shared-memory exhaustion on this Mac: initdb fell back to `max_connections 20` / `shared_buffers 400kB`, and `ipcs -m` showed 32 of 32 System V segments in use (`kern.sysv.shmmni: 32`). I did not retry in a loop and relied on CI for the PostgreSQL facts instead.

## Relied on CI for
Run 37683586054 at this exact head:
- typecheck and lint green; `@jobguard/db#test` failed: 41 of 43 DB files passed, 17 tests failed as above.
- Green there: sandbox 2/2, practice-scope 6/6, practice-finding-scope 2/2, UIWIRE-12 22/22, demo-bootstrap 4/4, restore-rehearsal 10/10, shared-money-origin 12/12, tenancy 9/9, job-import 2/2.
- Job-parties 78/86, including the round-11 ownership/import-inheritance case, the round-12 two-job revision cases and null/boundary reason case, and all four round-13 issuance cases.
- Other packages: core 1430, api 377, web 115.
- Browser: not run.

## Not verified
- Any PostgreSQL behaviour locally (shared memory).
- The constraint half of P2-2.
- SBOX practice-session behaviour on a UTF8 cluster: the round-13 job-parties cases issue sessions successfully on UTF8, but SBOX's own 10 assertions have not run there.
- All browser journeys at this head.

