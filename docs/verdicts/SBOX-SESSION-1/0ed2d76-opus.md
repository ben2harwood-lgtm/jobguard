VERDICT: PASS — bound to head 0ed2d76f18fc918d770cd16c3167815759976231
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (7 Oct 2026); did not build, repair or order any commit in this PR.

## Plain-English summary

Both blockers from the last REPAIR (at `a00d20f`, comment 6041043584) are now fixed.

1. **VALUE-1 is fixed, and its test still means what it meant.** Ben approved adding exactly one file to the lane. Round 4 changed one line of that file. The second browser window now uses the same practice session as the first one, so it still proves a fresh window reads the saved result from the server. A different session reading the same job now gets "not found", which is exactly what this PR is meant to enforce.
2. **CI is green on this exact head**, including both screen sizes of SBOX-SESSION-1, VALUE-1 and UIWIRE-7, and the real-PostgreSQL practice-session suite.

The round-3 code is byte-for-byte unchanged apart from the two main merges. Migration is still 0094.

One thing to know before merging: `main` has moved again since this head (SV-1, #111, now at `f9de3ad`). The PR now conflicts with `main` in the lane registry file only. This PASS covers `0ed2d76` only. The next union merge needs its own quick check and green CI.

## Findings

No P1 or P2 findings.

### P3 (not blocking this PR)
1. **The PR needs one more lane-registry merge before it can merge.**
   - `git merge-tree 0ed2d76 f9de3ad` reports one conflict, in `config/agent-lane-assignments.json`.
   - Main's new changes since `c6deb4f` are pure-core files (`packages/core/src/shadow-domain/**`, `packages/core/src/index.ts`) plus the lane file. None overlaps this PR.
   - **Required:** merge as an exact union, as before. Then check the new merge commit (same changed-file set, same non-lane diff, lane file = main + `sbox-session-1`) and get `checks` green on it before merging.
2. **There is a flaky test on `main`, and it is not this PR's defect.**
   - The test is `packages/core/src/extra-origin.test.ts:33`, "accepts exactly the offsets from -23:59 to +23:59…".
   - It timed out at 5 s in attempt 1 of run 37658190913 on this head (5,019 ms).
   - It also timed out on `main`'s own push run for `c6deb4f` (run 37657498901, 5,326 ms).
   - This PR changes nothing under `packages/core`. Run alone on my machine, the test takes 525 ms. In CI it shares the runner with ENT-4a's `enterprise-domain/origin.test.ts` (175 tests, about 15 s), which arrived with #110.
   - It needs its own card on `main`: make the 2,879-offset loop cheaper, or set an explicit, justified time limit through a reviewed change. Do not REPAIR this PR for it.
3. **Three follow-ups are recorded but not built** (listed in `docs/verdicts/SBOX-SESSION-1/BUILDER_RECEIPT_round4.md`):
   - a rate limit and cleanup for the anonymous `POST /api/session`, which writes a session and three jobs per call;
   - re-pointing M0-6L's real-tenant capture through its principal bridge;
   - a separate card for the recovery-case audit actor, which on `main` is taken from the client-supplied `reviewerRef`.
   All three should land before public availability.
4. **Migration numbers are safe to renumber.**
   - `demo-bootstrap.integration.test.ts:27,34` and `UIWIRE-12.integration.test.ts:54-61` hard-code 45 migrations, ending at 0094. Each later PR in the renumber plan (0095–0099) must update these. If it does not, they fail loudly, not silently.
   - The earlier P3 about "assume 0094 is last" is fixed: `practice-session.integration.test.ts:11-13` now finds the migrations before 0094 by file name.

## What I checked

### Blockers from a00d20f
- **Blocker 1 (VALUE-1:9): resolved.**
  - **Lane change `80338ba`:** I compared the parsed JSON before and after. Exactly one change: `apps/web/e2e/VALUE-1.spec.ts` is appended to the end of the `sbox-session-1` allow list.
    - Nothing was removed.
    - No other field of that lane changed. No other lane changed, lane order is the same, and `version` is still 2.
    - Ben's answer is in the Command Center log: "Decided: Practice-session fix needs one test file", actor Ben, 15:20 UTC on 7 Oct, answer "Add the one file".
  - **Round 4, `0a0c022`:** touches only `VALUE-1.spec.ts` (1 line) and the round-4 receipt.
    - `browser.newContext()` became `browser.newContext({ storageState: await page.context().storageState() })`.
    - That context's `secondPage.request.post("/api/session")` was removed.
    - The `value-recorded-gross` `toHaveText("£1,320.00",{timeout:45_000})` assertion is unchanged. No assertion, retry or timeout changed anywhere in the PR's test diff. Playwright `retries: 0` is unchanged.
  - **Does VALUE-1 still prove C1?** C1 asks that "a second browser context must read the persisted result". Yes, it still does:
    - The value page (`apps/web/app/ui/job-value.tsx`) loads only from `fetch('/api/jobs/${id}/value',{cache:"no-store"})`, and nothing on it reads browser storage. The only localStorage key in the app, `jobguard:m1-15-lineage`, feeds the final-account screen, not the value page.
    - So the new window starts with no page state. It shares only the session cookie, and its £1,320.00 must come from the database through the authorised API.
    - This is the same pattern as `SBOX-1.spec.ts:19`, `M4-3-S.spec.ts:145` and `SBOX-resume.spec.ts:47`.
    - The cross-session read that was removed is now checked the other way round: `SBOX-SESSION-1.spec.ts:17` checks that a stranger gets 404 on `/value`.
    - On `80338ba` (run 37653803758), before round 4, VALUE-1 failed in both projects at exactly that second-context assertion (`VALUE-1.spec.ts:9:518`, "element(s) not found"). That shows the change was needed.
- **Blocker 2 (merge main, green `checks`): resolved.** CI evidence is listed under "Relied on CI" below.

### Main merges `e6de64c` (main `6566abc`) and `0ed2d76` (main `c6deb4f`)
- **Changed files:** for each merge, the PR's list of changed files against main is identical before and after (137/137 and 139/139).
- **Non-lane diff:** the diff outside the lane file is byte-identical before and after.
- **Lane file:** the parsed lane file is exactly main's lanes in main's order, then the `sbox-session-1` lane (83+1 and 84+1). It is still one line.
- **Overlap:** since the PR's original base `a5ed99a`, main has touched no file this PR touches except the lane registry.

### Round-3 code unchanged since a00d20f
- **The diff:** I compared the PR's diff against main at `a00d20f` with its diff at `0ed2d76`, leaving out the lane file, `VALUE-1.spec.ts` and the round-4 receipt. The two are byte-identical. That covers P1(b) `evidence_or_upload` in `practice-access.ts`, P2's per-call scoped `EvidencePackRepository` in `evidence-pack.application.ts`, and the P3-4 comment at `packages/db/src/practice-session.ts:55`.
- **Migration:** still `packages/db/migrations/0094_practice_session_ownership.sql`, the only migration in the diff.

## Executed (local, detached worktree at 0ed2d76)
| Command | Result |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm lint` with a simulated `pull_request` event (base `c6deb4f`, head `0ed2d76`, branch `codex/sandbox/sbox-session-1`) | exit 0 |
| `node tools/agent-lane-boundary-lint.mjs` (same metadata) | exit 0, lane `sbox-session-1`, 139 files |
| `pnpm --filter @jobguard/api exec vitest run src` | 17 files / 336 passed |
| `pnpm --filter @jobguard/web exec vitest run` | 8 files / 63 passed |
| `pnpm openapi:check` | exit 0 |
| `node --test tools/*.test.mjs` | 42/42 |
| `playwright test --list` | 168 tests in 48 files; SBOX-SESSION-1, VALUE-1 and both UIWIRE-7 tests listed for both `mobile-360` and `desktop`; no skip/only/fixme in those specs |
| `heavy-slot vitest run practice-session, demo-bootstrap, sandbox` (embedded PostgreSQL 16.10) | 3 files / 14 passed |
| `vitest run src/extra-origin.test.ts` (core, alone) | 6/6, the slow test took 525 ms |

### Adversarial probes
Four tests on embedded PostgreSQL 16.10 under `heavy-slot`, all passed. They run through the real API application classes with real issued session tokens, as a non-superuser runtime login. File (untracked, not committed): `/private/tmp/opus-sbox-session-1-0ed2d76-0710/packages/db/test/opus-probe-sbox-session-1-0ed2d76.integration.test.ts`.
- **Probe 1, P1(b) access matrix through `PracticeAccess.subject`:**
  - Allowed: session A's own pending upload and own evidence object on job J1.
  - Every other case gets NOT_FOUND:
    - IDs from A's other job J2 (same session);
    - session B's uploads and evidence;
    - a random UUID;
    - B using A's IDs on B's own job;
    - B on A's job.
  - The narrow checks stay narrow: `evidence` refuses an upload ID, and `upload` refuses an evidence ID.
  - A missing or invented session gets UNAUTHENTICATED.
- **Probe 2, P2 under concurrency on one reused connection:**
  - Setup: sessions A and B each have a fully sourced merchant-overcharge pack. Both deliberately use the same merchant name and SKU at different prices. Everything runs through a `pg` pool limited to one connection.
  - Generate and approve succeed for both.
  - 40 interleaved concurrent `list` calls: each always returns its own pack, approval valid, with its own rate source and never the other session's.
  - Cross-session `list` and `inspect` calls mixed into the same batch get NOT_FOUND and do not disturb the owners.
  - Afterwards, the reused connection holds no `app.practice_material_digest`.
  - A control test shows that this leftover check does catch a setting left on the connection.
- **Probe 3, the VALUE-1 pattern at API level:**
  - A brand-new pool with the same session token reads `ValueApplication` exactly as the first pool did.
  - Another session gets NOT_FOUND. A missing or invented session gets UNAUTHENTICATED.

## Relied on CI (exact head 0ed2d76)
- **Run 37658190913, attempt 2** (the integrator re-ran the failed job on the same head; head SHA confirmed): `checks` success, `dependency-review` success, `secrets` success.
  - **Unit:** core 41 files / 591, API 336, web 63, ai 72.
  - **DB:** 40 files / 208 passed, including `practice-session.integration.test.ts` 10/10 with "practice merchant evidence packs approve with session-scoped rates and still deny strangers", `demo-bootstrap` 2/2 ("applies 0000..0042, 0053 and 0094"), and `UIWIRE-12` 22/22.
  - **Lint step:** lane boundary passed for `sbox-session-1` against base `c6deb4f`.
  - **Browser** ("Exercise the production web build at mobile and desktop sizes"): **168 passed**, 0 failed, `retries: 0`. That equals the full 168-test list above, which contains SBOX-SESSION-1, VALUE-1 and UIWIRE-7 in both projects. The dot reporter does not print test names, so I confirmed coverage by matching the count to the list.
- **Attempt 1** (job 112918639312) failed only in the core unit suite: `extra-origin.test.ts:33` timed out at 5,019 ms, 1 failed / 590 passed. That is the same untouched test that also fails on main's own push run 37657498901 (see P3-2). Typecheck and lint passed in attempt 1. The job stopped at that test step, so the later build and browser steps ran only in attempt 2.

## Not verified
- I did not run the browser suite locally. Browser evidence is from CI only.
- No live provider, real data, spending or deployment was involved.
- This verdict does not cover any future merge of `f9de3ad` or later main into the branch.

