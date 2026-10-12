# PRACTICE-SESSION-HARDEN-1 — builder receipt

Builder: Codex (issued builder identity: GPT-6.1 Sol). Working tree only, no commit made. Source-inspected and unit-test-executed evidence; PostgreSQL, socket pipeline and independent verification remain pending.

Base: `96c0cb8a5b5562c65b79f5f601ba9d60f8fcf05a` (main at branch cut). Local head: `f7dde27303d3723a2a820863ac8ddcf955ebc3f6`; includes coordinator prerequisite `e9aa80f2cbeb19ecf3a8ff957f1581e154e75c32` and dispatcher lane registration. The dispatcher owns commit, catch-up, migration renumbering if needed, push, PR, merge and release. Main moved after this base; this branch registers 0138 last after its actual 0130 predecessor, and has no unmerged migration dependency.

Builder receipt only — not independently verified, not accepted.

## What happens to people who already have a practice cookie

After this piece is applied to a practice database, anyone whose practice cookie is more than seven days old starts a FRESH made-up company at their next Start and no longer reaches the old one. This may include the founder's own browser. NOTHING is deleted: the old rows remain, ended. A converted row with a live home record keeps only that record's remaining life; a converted row with no home record is ended too.

Mac read-only Q13 no-home-record count: **NOT AVAILABLE — not run in this sandbox; a numeric Mac result is required before acceptance**. Home-ended and home-live counts likewise pending; do not treat missing counts as zero. Q7 existing non-bootstrap/non-tenant owner-grant count: **NOT AVAILABLE — Mac read-only query pending**. Tell the coordinator if no-home-record is above zero, and make the founder's owner-grant card only if Q7 is above zero. No database or external message was sent here.

A start with no home record is allowed here by the coordinator's OPTION A ruling, only with its fixed seven-day cap from that start, never renewable. Home practice refuses it. The strict rule is the separate, owned and drafted **PRACTICE-START-STRICT-1**. Do not shorten this HOLD. A superuser who un-ends a home record by hand can make an un-revoked contractor session that is still before its cap answer again. No application route can do that; this is the coordinator's accepted limit.

## Four RED questions — source-inspected answers

1. Does any change make a session, grant or role more permissive? **No application-accessible path becomes more permissive.** Lookup adds cap/revoke/home checks; start keeps the bootstrap unchanged and refuses ended values; grant.create adds the existing member.invite owner refusal after all earlier refusals. The one new callable routine only ends the caller's own session. Proving source: migration live, lookup, revoke, start and grant branches; `packages/db/migrations/0138_practice_session_hardening.sql:38` (live), `:46` (lookup), `:48` (revoke), `:70` (start), `:191` (grant refusal).
2. Can a session value still be read from a table, log or audit payload? **Current contractor rows keep only the digest and a random row number after conversion; this piece's outputs and audit event contain neither value nor digest.** The value still reaches SQL as a bound parameter; parameter logging, superseded row versions, WAL and earlier backups are honest limits 1–2 and FIX-LATER before any deployment. Proving lines: migration `:28` (re-key/conversion), `:89` (new row), repository `packages/db/src/contractor-practice-session-repository.ts:13` (bound call) and `:18` (audit), `:26` (sanitized errors), application `:26` (unknown errors sanitized). PostgreSQL catalogue scans are written, not executed here. No claim about actual operational log settings.
3. Can a legitimate practice owner be locked out? **Holders whose home record has ended are refused by design, at conversion and afterwards; converted rows with no home record are also ended.** A live home record and un-revoked contractor row keep their remaining life. Bootstrap owners and grandfathered owner grants remain; member state is not added to lookup. A copied cap, including an earlier cap for a formerly no-home-record value, can be earlier than a home deadline lengthened by hand. Proving lines: migration `:20` (home), `:28` (conversion), `:41` (lookup), `:77` (start), `:90` (unchanged bootstrap track/member/grants). PH1/PH23 prove the ordinary issued-cookie path when run on PostgreSQL.
4. Can a session outlive its home deadline or revive an ended value? **No holder/application path can do either.** One read-only home helper supplies lookup/start/revoke/guard/conversion. New caps are bounded; converted B/C/D rows end; stored caps cannot move and revoked times cannot clear. No-home-record starts have no home deadline and get only their own fixed cap; if a home record appears later the tighter record applies. By-hand paths remain honest limits 8, 11–12, including un-ending home. Proving lines: migration `:18` (single home helper), `:28` (conversion), `:41` (live), `:58` (revoke clock), `:80` (start clock/cap), `:96` (guard); no runtime-executable routine added here accepts a time or interval.

## Four base checks

1. `packages/db/src/contractor-session-context.ts` exists: PASS, observed.
2. `git grep -n practice_worker_switch -- packages/db/migrations`: no matches, PASS. On this base no route or routine switches a practice role; PRACTICE-WORKER-SWITCH must preserve this deadline in its later piece.
3. `git grep -n 'WHERE session_id=' -- packages/db/test/audit-export.integration.test.ts`: no matches, PASS. Coordinator's one-line setup change is already in e9aa80f; no assertion changed. That file was never edited by this builder and remains byte-equal to local head. Its Mac 11-test result is dispatcher-provided history, not a run observed here.
4. Home table mentions occur only in 0094, 0095, 0106, 0109; issuer/lookup definitions occur only in 0094: PASS before edits, observed. Our new migration names the home table once, in routine 6, and never writes or locks it.

## Scope and registrations

four columns, four constraints and three triggers (two trigger functions) added to control_plane.contractor_practice_session and its existing rows converted in place; exactly three existing functions replaced, with unchanged owner and privileges; no column, index, constraint, policy, trigger or grant on any other existing table; no existing object dropped; control_plane.practice_session read by one helper and never written

Shared registration edits are serialized to this lane: core/db/workspace exports, migrate list, MIGRATIONS.md, AppModule and OpenAPI. The dispatcher already owns the unchanged lane line. The full exact added lines and file list are recorded below after final checks. No dependency, lockfile, configuration, scanner, merged test, merged migration or UI edit. No new direct INSERT/UPDATE/DELETE grant to jobguard_runtime on any table; the only new EXECUTE grant is the checked revoke routine. The merged appendAuditBatch retains its existing audit write path; no new audit-table grant is added. No named exception to the new build standard is needed.

## Fingerprints against main at branch cut

| File | SHA-256 | comparison |
| --- | --- | --- |
| apps/api/src/auth/context-boundary.test.ts | d082694df3dc005461d92ac79f275f31525d35c3e022948b47efa0ed7f9a772f | equal |
| packages/db/src/practice-session.ts | 9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14 | equal |
| packages/db/src/contractor-repository.ts | 56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c | equal |
| packages/db/src/contractor-party-repository.ts | e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0 | equal |
| packages/db/src/work-order-repository.ts | 4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3 | equal |
| packages/db/src/sor-repository.ts | 45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5 | equal |
| packages/db/src/job-scheduling-repository.ts | ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d | equal |
| packages/db/src/work-order-fixtures.ts | cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386 | equal |
| packages/db/src/contractor-session-context.ts | a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c | equal |

## Tests first

The P/U/W/H and D1/D2/D3 test files were written before their corresponding implementation modules and migration. Database tests were not executed. First core build: exit 2 (new module absent); first new unit run: exit 1, one failed suite, zero tests collected, missing `./contractor-practice-session.js`. This is the observed failed-first unit run, not a PostgreSQL failure. Logs are retained in /private/tmp while working and summarized below. The global pnpm shim attempted version management and was interrupted (exit 130); no dependency installation was run or completed. All completed commands use the already-cached pinned pnpm 10.28.1 via PATH=/private/tmp/jg-ph-bin:$PATH, Node v24.17.0.

Fixture setup: imports merged cluster()/ownerTx, keeps values in memory, seeds the demo owner with the four constant-based owner inserts. The stopped-before-migration starter reuses cluster(true)'s merged pre-0122 setup and applies only remaining predecessors by registered name. It exports makeSessionExpired, startBeforeMigration, startSessionWithHomeRecord and endHomeRecord for the next piece. The issuer/cluster coexistence has been source-inspected and is NOT PostgreSQL-executed; if the Mac finds a setup conflict, repair only this lane's fixture to the issued standalone-server fallback, never a merged test.

## Remaining gates

- Mac/GitHub PostgreSQL 16 runs: new D1/D2/D3, mandatory merged regressions, test:db and test:migrations. No database guarantees are independently verified here.
- Real Nest socket pipeline H: NOT RUN (sandbox cannot bind sockets). Browser/e2e: UI HELD; sandbox cannot run a browser. No web workflow is added.
- Fresh independent Opus + Sol RED verdicts bound to the dispatcher's exact committed diff; separate technical acceptance. No review fabricated by the builder.
- Q7/Q13 numeric Mac counts; coordinator Q1 prerequisite is already present but its PostgreSQL regression is pending here.
- UI remains parked; all real-user, provider, pilot, production, deployment and release gates remain HELD.

## Blocking dispatcher repairs (no builder edit)

`LANE_BASE_REF=origin/main pnpm lint` and `pnpm lint:lanes` both exited 1. The actual committed lane line contains the root-only entry `0138_practice_session_hardening.sql`, rather than the issued `packages/db/migrations/0138_practice_session_hardening.sql`. The dispatcher must repair that exact allowlist path; it was checked and left untouched as instructed. No root-level duplicate, scanner edit, bypass or lane widening was made.

The same comparison also includes `packages/db/test/audit-export.integration.test.ts`, solely from the coordinator's e9aa80f prerequisite; the builder has not changed it. The observed `origin/main` is `96f051f61cbb64081aba8881afe29ca74cd32155`, whose merge base with this branch is 96c0cb8 and whose audit-export setup still uses the old session_id lookup. Dispatcher/integrator must account for the authorized prerequisite in the comparison or land it on the base before rerunning lint. Do not grant this builder that locked file. Core purity ran and passed before lint stopped; the money and commercial checks were also run separately, with exit 0. Full root lint remains FAILED, not a substituted pass.

## Observed commands and results

Every completed pnpm command below used the existing cached pinned pnpm with `PATH=/private/tmp/jg-ph-bin:$PATH`. `TURBO_CONCURRENCY=2` was also set for root typecheck/lint. No vitest run used more than two workers or more than one file. No whole package/repository test run was attempted. No clean install was claimed: dependencies were already installed.

| Command | exit / observed result |
| --- | --- |
| Initial global-shim `pnpm turbo run build --concurrency=2 --filter=@jobguard/core...` | interrupted at version-management stage, exit 130; no completed build |
| Pinned `pnpm turbo run build --concurrency=2 --filter=@jobguard/core...` before implementation | exit 2; missing new module |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/contractor-practice-session.test.ts` before implementation | exit 1; 1 failed suite, 0 tests collected (missing module) |
| `pnpm turbo run build --concurrency=2 --filter=@jobguard/core...` after implementation | exit 0; 1/1 tasks |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/contractor-practice-session.test.ts` | exit 0; 22/22 tests |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/contractor.test.ts` | exit 0; 725/725 tests, unedited |
| `pnpm turbo run build --concurrency=2 --filter=@jobguard/api...` initial | exit 1; 5/6 tasks, two new test stub typing errors |
| Same API build after type repairs, after added transport tests, and after explicit pool injection | exit 0 each; 6/6 tasks each |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/contractor-practice-session.application.test.ts` initial, expanded, DI-before, DI-after | exits 0 (36/36), 0 (41/41), 1 (41 passed/1 failed), 0 (42/42); intermediate unchanged repair run also 0 (36/36) |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/contractor.application.test.ts` | exit 0; 3/3 tests, unedited |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/context-boundary.test.ts` | exit 0; 145/145 tests, unedited |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 app/api/contractor/practice/session/revoke/route.test.ts` initial and expanded | exit 0; 19/19 then 42/42 tests |
| `pnpm exec tsc -p /private/tmp/jg-ph-db-tests.tsconfig.json` | exit 0 on all five inspection runs; only compilation of new DB tests/helper, not PostgreSQL execution |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts` | exit 0; repository generator used without socket-dependent CLI |
| `pnpm typecheck` | exit 0; 7/7 tasks; repeated after explicit pool injection with exit 0, 7/7 |
| `LANE_BASE_REF=origin/main pnpm lint` | exit 1; core purity passed (131 TS files); two lane issues above prevented remaining root lint steps |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | exit 1; same two paths, unchanged lane |
| `pnpm build --concurrency=2` | exit 0; 7/7 tasks; repeated after DI repair, exit 0, 7/7 |
| `pnpm openapi:check` | exit 1; known sandbox `listen EPERM` in tsx CLI IPC pipe, before generator execution |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | exit 0; repeated after DI repair with exit 0 |
| `node tools/money-arithmetic-lint.mjs` | exit 0; money arithmetic boundary check passed |
| `node tools/commercial-boundary-lint.mjs` | exit 0; no output |
| `git diff --check` | exit 0 |
| Read-only Python source comparisons | exit 0: pinned bytes equal; old admin body plus one line only; 3 replacements/6 additions; home table named once; existing OpenAPI paths and all other top-level OpenAPI content unchanged; builder files have no credential-shaped literals |

The final six executed unit files total **979 passing tests** (22 + 725 + 42 + 3 + 145 + 42). This total includes the three unchanged guard files; it excludes H and all database tests. Turbo emitted sandbox cache `Operation not permitted` warnings but successful build/typecheck exits. Next emitted existing CSS autoprefixer warnings; no UI file was changed. Repeated checks were justified by the new DI regression and its repair, not by retry-wrapping a failing assertion.

## Acceptance map

BUILT below means implementation/test source written. D1/D2/D3 and H remain NOT RUN; BUILT is not a database, HTTP-socket or independent pass. P, U and W are executed unit tests with stubs; the socket-free Nest composition case in U is also executed.

- P: `packages/core/src/contractor-practice-session.test.ts`.
- U: `apps/api/src/contractor/contractor-practice-session.application.test.ts`.
- W: `apps/web/app/api/contractor/practice/session/revoke/route.test.ts`.
- H: `apps/api/src/contractor/contractor-practice-session.http.test.ts`.
- D1: `packages/db/test/contractor-practice-session.integration.test.ts`.
- D2: `packages/db/test/contractor-owner-grant.integration.test.ts`.
- D3: `packages/db/test/contractor-practice-session-upgrade.integration.test.ts`.

**[PH1] BUILT** — D1: [PH1] issued sessions take the unchanged home record's remaining deadline.

**[PH2] BUILT** — D1: [PH2] a new session with no home record keeps its fixed cap and concurrent starts share one company.

**[PH3] BUILT** — D1: [PH3] expiry and the copied cap refuse access even if home is lengthened.

**[PH4] BUILT** — D1: [PH4] home %s refuses every contractor path without changing its row.

**[PH5] BUILT** — D1: [PH5] contractor revoke leaves home and home jobs unchanged and cannot be revived by the live home.

**[PH6] BUILT** — D1: [PH6] holder activity never moves a deadline with home=%s.

**[PH7] BUILT** — D1: [PH7] never-issued, cap-expired, revoked and both home-ended values have one public answer.

**[PH8] BUILT** — D1: [PH8] %s stays ended and a fresh value starts a separate company; D1: [PH8] a home record appearing later keeps the earlier cap and its end refuses the session.

**[PH9] BUILT** — D1: [PH9] owner writes cannot move authority fields, undo a revoke, remove or truncate rows; D1: [PH9] owner insert refuses %s; D1: [PH9] runtime cannot access either session table directly.

**[PH10] BUILT** — D1: [PH10] revoke is timestamped, audited, and leaves company unchanged with home=%s.

**[PH11] BUILT** — D1: [PH11] all revoke refusals are indistinguishable and write nothing; D1: [PH11] a holder can end their own session after membership revoke without additional permission.

**[PH12] BUILT** — D1: [PH12] failures at routine, audit insert and commit roll back both versions and audit head; D1: [PH12] deferred audit refuses routine and owner revocations at commit without an event; D1: [PH12] the audit append takes the final contending lock.

**[PH13] BUILT** — D1: [PH13] two revokes produce one event; open revoke and home ending read the committed state; D1: [PH13] a start concurrent with an open revoke cannot create a second company.

**[PH14] BUILT** — D1: [PH14] a different database name refuses all session routines.

**[PH15] BUILT** — D1: [PH15] catalogue scan finds no stored session values and exactly one new digest place.

**[PH16] BUILT** — D1: [PH16] canonical uuid case and the home digest bind the same row.

**[PH17] BUILT** — P: [PH17] accepts exactly the versioned revoke body; P: [PH17] refuses authority field %s; P: [PH17] validates the public result and closed failures strictly; U: [PH17] refuses mode %s before database access; U: [PH17] refuses missing or malformed principal; U: [PH17] authenticates before validating well-formed bodies; U: [PH17] refuses body authority field %s after one bridge call; U: [PH17] passes the real stamped context whole through withTenant and returns no authority fields; U: [PH17] refuses an invalid database answer and rolls back; U: [PH17] strips all unexpected PostgreSQL text from thrown errors and public failures; U: [PH17] repository translates only exact routine message %s; U: [PH17] Nest injects the real pool without relying on emitted constructor metadata; W: [PH17] refuses Origin %s before service access; W: [PH17] refuses mode %s before pool access; W: [PH17] refuses invalid JSON without service access; W: [PH17] reads only its own cookie and ignores query and header authority; W: [PH17] maps %s without cookie or authority leakage; W: [PH17] strips unknown errors; W: [PH17] passes missing or malformed cookie for service refusal; W: [PH17] real service refuses authority field %s through Next; W: [PH17] real service returns one answer for an ended caller through Next; W: [PH17] real service refuses malformed or missing cookie without database access; H: [PH17] real pipeline refuses malformed JSON before the controller; H: [PH17] real guard refuses no session before the controller; H: [PH17] real controller refuses Origin %s without service call; H: [PH17] real controller returns strict no-store success with no cookie; H: [PH17] real guard refuses mode %s with no database access; H: [PH17] real controller maps %s; H: [PH17] real application refuses authority field %s through HTTP; H: [PH17] real application gives one answer for an ended caller whatever the well-formed body; H: [PH17] real controller strips unexpected errors and ignores header/query authority.

**[PH18] BUILT** — D2: [PH18] refuses owner grant in otherwise open cell %s.

**[PH19] BUILT** — D2: [PH19] preserves the earlier refusal for %s; D2: [PH19] mode is refused before the new owner rule in direct SQL.

**[PH20] BUILT** — D2: [PH20] direct runtime routine refuses owner without any layer above it.

**[PH21] BUILT** — D2: [PH21] invitation and grant still permit role %s; D2: [PH21] generator, direct owner insert, team move and revocations retain their behavior.

**[PH22] BUILT** — D1: [PH22] catalogue proves columns, constraints, non-internal triggers and exact routine grants; D3: [PH22] replacement attributes at N alone are unchanged.

**[PH23] BUILT** — D3: [PH23] populated conversion preserves live home sessions and ends B, C and D without touching other rows; D3: [PH23] rolled-back session comparison refuses %s; D3: [PH23] microsecond and pre-existing type changes fail the same helper comparison; D3: [PH23] later nullable columns, changed function and inserted rows pass; D3: [PH23] successors and repeated migrate preserve named existing rows and full types.

**[PH24] BUILT** — D3: [PH24] only three old function texts differ at N alone and home is unchanged.

**[PH25] BUILT / EXECUTED** — unchanged boundary scanner 145/145, contractor core 725/725, contractor application 3/3; fingerprints above equal branch-cut main. No renamed guard or changed assertion.

**[PH26] HELD (execution only)** — every listed merged integration test remains byte-identical to local head; PostgreSQL cannot start in this sandbox. Their full grouped command list follows. The coordinator's setup-only change is already present; it is the only prior audit-export difference from branch-cut main.

## NOT RUN — full Mac/GitHub list

Each following command is **NOT RUN (sandbox cannot start PostgreSQL / a browser)**, except H which is **NOT RUN (sandbox cannot bind sockets)**. Each has maxWorkers=2, at most three files, one invocation at a time:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/contractor-practice-session.integration.test.ts test/contractor-owner-grant.integration.test.ts test/contractor-practice-session-upgrade.integration.test.ts
pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/contractor-practice-session.http.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/contractor.integration.test.ts test/contractor-parties.integration.test.ts test/contractor-session-context.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/audit-export.integration.test.ts test/audit-checkpoint-handoff.integration.test.ts test/enterprise-identity.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/identity.integration.test.ts test/practice-session.integration.test.ts test/work-order-import.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/work-order-concurrency.integration.test.ts test/job-scheduling.integration.test.ts test/sor-pricing.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/sso-emergency.integration.test.ts test/sso-emergency-concurrency.integration.test.ts test/sso-required.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/extra-origin.integration.test.ts test/extra-origin-upgrade.integration.test.ts test/recovery-follow-up-upgrade.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/recovery-timing-pin.integration.test.ts test/prevention-checks.integration.test.ts test/job-activation-terms.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/tenancy.integration.test.ts test/shadow-catalog.integration.test.ts test/demo-bootstrap.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/fingerprinted-row-shape.integration.test.ts test/job-parties.integration.test.ts test/small-builder-origin.integration.test.ts
```

Root pnpm test, test:db, test:migrations and test:e2e were not run: the issued memory limits forbid whole-suite local runs; database/browser execution is unavailable. No AI/model behavior changes, so eval is inapplicable to this leaf. Native is inapplicable. The mandatory full suites remain CI/integrator gates, not optionalized checks.

## Read-only Mac counts before upgrade

Run Q13 BEFORE 0138 in any kept practice database, as table owner, and record counts only (never a value):

```sql
SELECT count(*) FILTER (WHERE p.token_digest IS NULL) AS no_home_record,
 count(*) FILTER (WHERE p.token_digest IS NOT NULL AND NOT (p.environment='synthetic_demo' AND p.revoked_at IS NULL AND p.expires_at>clock_timestamp())) AS home_record_ended,
 count(*) FILTER (WHERE p.environment='synthetic_demo' AND p.revoked_at IS NULL AND p.expires_at>clock_timestamp()) AS home_record_live
FROM control_plane.contractor_practice_session x
LEFT JOIN control_plane.practice_session p ON p.token_digest=encode(sha256(convert_to(x.session_id::text,'UTF8')),'hex');
```

Q7 owner-grant count, counts only; card to Ben only if positive:

```sql
SELECT count(*) AS existing_owner_grants
FROM app.role_grant g JOIN app.membership m ON m.tenant_id=g.tenant_id AND m.id=g.membership_id
WHERE g.role='owner' AND (m.role<>'owner' OR g.scope_kind<>'tenant');
```

These queries have NOT RUN here. No count is invented. The first two Q13 classes are ended by conversion; the third keeps its remaining deadline.

## Expected table definition after 0138 (source-inspected)

```sql
CREATE TABLE control_plane.contractor_practice_session (
 session_id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
 membership_id uuid NOT NULL,
 identity_user_id uuid NOT NULL REFERENCES identity.identity_user(id),
 session_digest char(64) NOT NULL,
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 FOREIGN KEY(tenant_id,membership_id) REFERENCES app.membership(tenant_id,id),
 CONSTRAINT contractor_practice_session_digest_unique UNIQUE(session_digest),
 CONSTRAINT contractor_practice_session_digest_valid CHECK(session_digest ~ '^[0-9a-f]{64}$'),
 CONSTRAINT contractor_practice_session_cap CHECK(expires_at >= created_at AND expires_at <= created_at + interval '7 days'),
 CONSTRAINT contractor_practice_session_revoked_window CHECK(revoked_at IS NULL OR (revoked_at >= created_at AND revoked_at < expires_at))
);
```

No defaults; owner/privileges unchanged. The two BEFORE guard triggers cover row INSERT/UPDATE/DELETE and statement TRUNCATE; the deferred AFTER UPDATE constraint trigger requires audit. PH22 filters internal triggers, so a later FK can coexist. Owner-TRUNCATE asserts refusal and unchanged rows only, with no pinned error (H1); no head-level routine text is pinned (H3). The live helper remains SQL VOLATILE by default (H4).

## Every replacement difference and why it permits the same or less

- **contractor_session:** replace direct session_id lookup with the live helper; keep the three output columns. Added digest/cap/revoke/home checks can only refuse additional calls; member/company predicates are unchanged (none).
- **start_contractor_practice:** add exactly three local variables (digest, clock reading, home deadline); find existing rows by digest; return existing company only while live, otherwise nil; a new row under an ended home value returns nil before any setting/write; generate the same company, owner, track, units and team; insert a random row number, digest and capped times instead of the value. No new generation path; no-home-record generation remains the base's path, now capped. Mode and advisory key 55 stay unchanged. NULL is still refused by NOT NULL. A new value cannot resolve an old company.
- **contractor_admin_command:** one identical owner refusal added as the first grant.create statement, after unchanged permission/replay/member/revision checks. Everything else in the body is byte-equal; legacy receipts still replay. No change to schema/table/generator/member.invite/team.move. Same or fewer grants.

Routine 6, live helper, conversion and lookup match the specified text tokens (layout/terminating semicolons only). No specification-token departure is needed. New routine signatures, flags, volatility, owners/grants, full old/new replacement texts and the one-line body diff are reproduced in the contract appendix below. This is source inspection, not PostgreSQL catalogue evidence.

## Self-review

Re-read git diff against 96c0cb8 and all new source/test files against issued v2 and H1–H6. Checked every PH mapping; one home test/digest/live definition; one home-table mention in migration; no home write/lock; immutable cap and revoke; finite live-home conversion versus B/C/D endings; nil start without writes/settings; holder-only revoke independent of member/grant state; bound-only value; no public value/digest; strictly parsed internal/public results; audit last write and same transaction; original owner/grants/volatility on replacements; six new routines with explicit exact-signature permissions; no direct table write grants; no cookie changes; no route with jobs; no commandType literal form; no context construction, retention or cast in new source; no source outside the issued list; no credential-shaped literals; scanner + eight pinned files and every merged test unchanged by the builder.

Repairs made in self-review: use a single clock reading in the expiry fixture to avoid a microsecond CHECK violation; supply complete FK setup in the second-database case; compile DB tests independently; tighten duplicate-digest SQLSTATE coverage; scan all held session values after the complete file; drive real application bodies through both transport adapters; explicitly inject Pool in the new controller, proved first failing then passing with a socket-free Nest test; prove two revokes wait on separate connections using the actual PostgreSQL lock state; commit the same open home-end transaction used by its visibility test; add rolled-back unsafe-rekey control before N. No standing/merged test or security list was repaired. No builder edit to the malformed dispatcher lane entry.

C1 server slice built, UI/browser states HELD by founder; C2 one application across Nest/Next, OpenAPI regenerated; C3 synthetic-only mode before database access; C4 control-plane exception unchanged, no money/new business table/direct grants; C5 exact persisted session, stamped context, atomic audit/races written; C6 P/U/W executed, PostgreSQL/H pending; C7 no workflow change; C8 fail-closed gates preserved, lane lint blockers and RED verdicts remain HOLD. Source inspection, test execution and independent verification are separate claims.

## Exact existing-file additions and changed-file inventory

The following additions are shown exactly from the working tree diff against branch-cut main. The lane line is the dispatcher's earlier commit, not an edit made here; its missing directory is visible and remains a blocker. AppModule changes only one import and one controller registration. Existing OpenAPI paths and all other top-level content compare equal to local head.

### config/agent-lane-assignments.json

```text
"practice-session-harden-1":{"branches":["codex/sandbox/practice-session-harden-1"],"receipt":"docs/verdicts/PRACTICE-SESSION-HARDEN-1/BUILDER_RECEIPT.md","note":"PRACTICE-SESSION-HARDEN-1: tightenings only. Contractor practice sessions get a fixed 7-day life and a revoke command; only a SHA-256 digest of the session value is stored and existing rows are converted in place; grant.create refuses the owner role as member.invite does. One new migration replaces three routines of 0054 and adds four columns to control_plane.contractor_practice_session. Server only; UI parked. Shared registration files append-only. No merged test, pinned file or security list is edited. BUILD_PLAN.md is integrator-only.","allow":["config/agent-lane-assignments.json","docs/verdicts/PRACTICE-SESSION-HARDEN-1/**","docs/contracts/contractor-practice-session-v1.md","packages/core/src/contractor-practice-session.ts","packages/core/src/contractor-practice-session.test.ts","packages/core/src/index.ts","0138_practice_session_hardening.sql","packages/db/src/contractor-practice-session-repository.ts","packages/db/src/index.ts","packages/db/src/migrate.ts","packages/db/MIGRATIONS.md","packages/db/test/contractor-practice-session-fixtures.ts","packages/db/test/contractor-practice-session.integration.test.ts","packages/db/test/contractor-owner-grant.integration.test.ts","packages/db/test/contractor-practice-session-upgrade.integration.test.ts","apps/api/src/contractor/contractor-practice-session.application.ts","apps/api/src/contractor/contractor-practice-session.controller.ts","apps/api/src/contractor/contractor-practice-session.application.test.ts","apps/api/src/contractor/contractor-practice-session.http.test.ts","apps/api/src/app.module.ts","apps/api/src/workspace/index.ts","apps/api/openapi.json","apps/web/app/api/contractor/practice/session/revoke/route.ts","apps/web/app/api/contractor/practice/session/revoke/route.test.ts"]},
```

### packages/core/src/index.ts

```text
export * from "./contractor-practice-session.js";
```

### packages/db/src/index.ts

```text
export * from "./contractor-practice-session-repository.js";
```

### apps/api/src/workspace/index.ts

```text
export { ContractorPracticeSessionApplication, assertContractorPracticeSessionMode, contractorPracticeSessionHttpFailure, createContractorPracticeSessionApplication } from "../contractor/contractor-practice-session.application.js";
```

### packages/db/src/migrate.ts

```text
  new URL("../migrations/0138_practice_session_hardening.sql", import.meta.url),
```

### packages/db/MIGRATIONS.md

```text

## 0138_practice_session_hardening.sql — contractor practice session boundary

Depends on 0054 and 0094. Converts contractor session values in place into canonical SHA-256 digests and independent random row numbers. Live home records supply the remaining deadline; ended or absent home records end converted rows. New starts with no home record retain a nonrenewable seven-day cap. Lookup reads the home record on every call. Adds holder-only contractor revoke with a deferred audit requirement, write-once guards, and the same owner refusal in grant.create as member.invite. No new direct table write grants; only the checked revoke routine gains runtime EXECUTE.

Forward fix preferred. A rollback restoring the three 0054 routines must also drop the three new NOT NULL requirements and the guard trigger, since the old start writes four columns. No current row retains its original session value, so restoring the old lookup ends every current session; each browser starts a new company. No rows are deleted. PostgreSQL upgrade and catalogue checks remain pending outside the sandbox.
```

### apps/api/src/app.module.ts

```text
import { ContractorPracticeSessionController } from "./contractor/contractor-practice-session.controller.js";
@Module({ controllers: [ContractorPracticeSessionController,SsoRequiredController,SsoController,AuditExportController,RecoveryFollowUpController,RecoveryMessageController,PreventionCheckController,HealthController,CaptureController,WorkspaceController,SandboxController,QuoteController,VariationController,DecisionsController,ProofController,FeeIllustrationController,FinalAccountController,CustomerInvoiceController,MaterialController,ValueController,PurchaseOrderController,SupplierDocumentController,SupplierMatchController,RecoveryCaseController,ThingsToCheckController,ReadinessController,InboxRelevanceController,CommercialIntegrityController,EvidencePackController,ContractorController,ContractorPartiesController,WorkOrderController,SchedulingController,JobPartiesController,JobPartiesListController,PracticeFeedController,IdentityController], providers:[{provide:SSO_REQUIRED_APPLICATION,useFactory:(pool:Pool,identity:()=>IdentityApplication)=>()=>createWorkspaceApplication({pool,identity:identity()}).ssoRequired!,inject:[Pool,IDENTITY_APPLICATION]},{provide:SSO_APPLICATION,useFactory:(pool:Pool,identity:()=>IdentityApplication)=>()=>createWorkspaceApplication({pool,identity:identity()}).sso!,inject:[Pool,IDENTITY_APPLICATION]},{provide:APP_FILTER,useClass:WatchdogExceptionFilter},{provide:APP_FILTER,useClass:PracticeErrorsFilter},{provide:Pool,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL})},{provide:CaptureRepository,useFactory:(pool:Pool)=>new CaptureRepository(pool),inject:[Pool]},{provide:SandboxRepository,useFactory:(pool:Pool)=>new SandboxRepository(pool),inject:[Pool]},{provide:WorkspaceService,useFactory:(pool:Pool)=>new WorkspaceService(pool),inject:[Pool]},{provide:SandboxService,useFactory:(repository:SandboxRepository)=>new SandboxService(repository),inject:[SandboxRepository]},CaptureService,{provide:IDENTITY_APPLICATION,useFactory:()=>{let application:IdentityApplication|undefined;return ()=>application??=createIdentityApplication(process.env)}},{provide:APP_GUARD,useClass:ApplicationAuthGuard}] })
```

### apps/api/openapi.json

```text
    "/contractor/practice/session/revoke": {
      "post": {
        "operationId": "ContractorPracticeSessionController_revoke",
        "parameters": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "version"
                ],
                "properties": {
                  "version": {
                    "type": "string",
                    "enum": [
                      "contractor-practice-session-revoke.v1"
                    ]
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": ""
          }
        },
        "summary": "End only the caller's contractor practice session; home practice is unchanged",
        "tags": [
          "contractor-practice-session"
        ]
      }
    },
```

Builder changed/new file list (includes untracked additions; git diff --stat alone excludes those):

```text
apps/api/openapi.json
apps/api/src/app.module.ts
apps/api/src/contractor/contractor-practice-session.application.test.ts
apps/api/src/contractor/contractor-practice-session.application.ts
apps/api/src/contractor/contractor-practice-session.controller.ts
apps/api/src/contractor/contractor-practice-session.http.test.ts
apps/api/src/workspace/index.ts
apps/web/app/api/contractor/practice/session/revoke/route.test.ts
apps/web/app/api/contractor/practice/session/revoke/route.ts
docs/contracts/contractor-practice-session-v1.md
docs/verdicts/PRACTICE-SESSION-HARDEN-1/BUILDER_RECEIPT.md
packages/core/src/contractor-practice-session.test.ts
packages/core/src/contractor-practice-session.ts
packages/core/src/index.ts
packages/db/MIGRATIONS.md
packages/db/migrations/0138_practice_session_hardening.sql
packages/db/src/contractor-practice-session-repository.ts
packages/db/src/index.ts
packages/db/src/migrate.ts
packages/db/test/contractor-owner-grant.integration.test.ts
packages/db/test/contractor-practice-session-fixtures.ts
packages/db/test/contractor-practice-session-upgrade.integration.test.ts
packages/db/test/contractor-practice-session.integration.test.ts
```

Observed tracked diff stat against 96c0cb8, including the two existing prerequisite commits:

```text
 apps/api/openapi.json                             | 37 +++++++++++++++++++++++
 apps/api/src/app.module.ts                        |  3 +-
 apps/api/src/workspace/index.ts                   |  1 +
 config/agent-lane-assignments.json                |  1 +
 packages/core/src/index.ts                        |  1 +
 packages/db/MIGRATIONS.md                         |  6 ++++
 packages/db/src/index.ts                          |  1 +
 packages/db/src/migrate.ts                        |  1 +
 packages/db/test/audit-export.integration.test.ts |  2 +-
 9 files changed, 51 insertions(+), 2 deletions(-)
```

## Contract appendix — definitions, HELD items, fourteen honest limits, rollback, six routines, and full old/new SQL

The following is the full contractor-practice-session-v1 contract written for this task. It carries the definitions verbatim, exact replacement bodies and their body comparison. PostgreSQL evidence remains NOT RUN.

# Contractor practice session v1

PRACTICE-SESSION-HARDEN-1, issued v2 on 12 October 2026. Synthetic server only; UI HELD. One deadline for an issued cookie. This document describes the implementation, with PostgreSQL execution and independent RED review still pending.

## Definitions

- **Session value:** the uuid in the `jg_session` cookie. **Canonical text:** PostgreSQL's text form of that uuid (`s::text`: lower case, hyphenated), which is the text `randomUUID()` issued. **Digest:** the 64 lower-case hexadecimal characters of the unkeyed SHA-256 of the canonical text in UTF-8: in SQL `encode(sha256(convert_to(s::text,'UTF8')),'hex')`, in TypeScript the merged `createHash("sha256").update(token).digest("hex")` (`practice-session.ts:11`). For one cookie it equals the home practice record's `token_digest`. The two records of one cookie are therefore joined by `session_digest = token_digest` (both `char(64)`).
- **Home record:** the row of `control_plane.practice_session` whose `token_digest` is the value's digest. It is written only by the merged issuer, when `/api/session` hands out the cookie; this piece READS it and never writes it. **Home deadline:** that row's `expires_at` (7 days after the cookie was issued, `0094:8`). **Home record live** at a clock reading: `environment='synthetic_demo'`, `revoked_at IS NULL` and `expires_at` after the reading (the three conditions the merged home lookup puts on the record, `0094:38-39`). **Home record ended:** it exists and is not live. The test reads the RECORD only, not the fixed demo member the home lookup also checks (Q12).
- **Session row:** one row of `control_plane.contractor_practice_session`. **Row number:** its `session_id` after this migration: a random uuid that is NOT the session value and can be shown in an audit event. **Cap:** the row's `expires_at`, written once, when the row is written: the EARLIER of the home deadline (when a live home record exists at that moment) and 7 days after the row's `created_at`. It is a ceiling: it can end a session, it never lengthens one, and it is never later than the home deadline it was copied from.
- **Live** (one reading of the database's clock, taken at the lookup): the row is not revoked (`revoked_at IS NULL`), its cap is after the reading, AND no home record for its digest is ended at that reading (a home record, if there is one, is live). **Expired:** not revoked and no longer live (its cap has passed, or its home record has ended). **Revoked:** `revoked_at` is set (the contractor side only). **Ended:** a row exists and is not live, whichever side ended it. **Never issued:** no session row has the value's digest.
- **The one deadline:** for a cookie the issuer issued, the home deadline is the only end time. Contractor access with that cookie ends at that moment or earlier (a contractor revoke, an ended home record) and never later. Nothing a holder does moves it: no routine of this piece writes a home record or changes a cap, and the merged issuer cannot issue the same value twice. **A value with no home record** (never issued by the issuer; possible only with a hand-set cookie value or a direct call) has no home deadline and no home practice: its cap is 7 days from its first start (Q11).
- **Converted session:** a row that existed before this migration. Its `created_at` is the migration transaction's own time (one value for every converted row), not its true first use, which the row never recorded. Its cap: if its home record is live at that time, the home deadline (it takes the home record's remaining life); otherwise (home record ended, or NO home record) the migration's own time, so the row is ENDED by the upgrade.
- **The one public answer:** for a never-issued value, an expired one, a revoked one and one whose home record has ended, alike, the merged lookup returns no row and every merged caller answers its existing `UNAUTHENTICATED`. The cases are indistinguishable to the caller on every route except "start", where a value that has no session row and no ended home record still generates a company (unchanged) and every other one of them is refused.
- **Authority fields (never accepted from a request):** `tenantId`, `tenant_id`, `requested_tenant_id`, `membershipId`, `identityUserId`, `sessionId`, `session`, `sessionRef`, `digest`, `sessionDigest`, `role`, `environment`, `createdAt`, `expiresAt`, `revokedAt`, `days`, `window`, `reason`, `commandId`.
- **Nothing written:** no new row and no changed row in `control_plane.contractor_practice_session`, `control_plane.practice_session`, `control_plane.tenant`, `identity.identity_user`, `app.account`, `app.membership`, `app.contractor_member`, `app.org_unit`, `app.team`, `app.role_grant`, `app.role_grant_revocation`, `app.commercial_track_assignment`, `app.command_receipt` or `app.audit_event`.

## Lifetime and conversion

The home record is read at every contractor lookup. Its end immediately refuses subsequent contractor lookups; contractor revoke refuses only contractor access and leaves home practice unchanged. Nothing a holder can call moves either stored time. A new value gets a new company, and an ended value never starts again. A cap copied at start also prevents a home deadline lengthened by hand from lengthening contractor access.

New starts with no home record are allowed here by the coordinator's OPTION A ruling, with seven days from the first start, never renewable. Home practice keeps refusing such a value. The strict rule is HELD for the separate, owned and drafted PRACTICE-START-STRICT-1.

Converted class A rows (live home record) keep the home record's remaining life; class B (home expired), class C (home revoked), and class D (no home record) end at the upgrade. Conversion replaces every row number and keeps the tenant, member and identity. No conversion audit event is written. The home record is read only.

## Boundary

`POST /contractor/practice/session/revoke` (Nest) and `POST /api/contractor/practice/session/revoke` (Next) accept only `{ version: "contractor-practice-session-revoke.v1" }`, strictly. The caller's own cookie supplies the session value; body, query, other cookies and headers supply no authority. No cookie is set, changed or cleared.

Success is `{ version: "contractor-practice-session-revoked.v1", environment: "synthetic_demo", realExternalActions: 0, revokedAt }`, with UTC microseconds. Failure is `{ version: "contractor-practice-session-error.v1", code }`, strictly. Codes/statuses: UNAUTHENTICATED 401; MODE_FORBIDDEN 403; ORIGIN_FORBIDDEN 403; INVALID_COMMAND 400; PRACTICE_SESSION_UNAVAILABLE 503. No PostgreSQL diagnostic or cause leaves this implementation.

The application checks mode before database access, principal shape, persisted session through the merged bridge, strict body, repository, strict result. Every controller/route response produced by this piece uses `no-store`. Next checks the merged trusted-origin helper, then mode, then JSON before composing the service. Nest checks the configured Origin list as AuditExportController does; its existing global guard remains in place. Framework malformed JSON returns its own 400 and the global guard's missing-cookie/non-synthetic-mode refusals return its existing 401 before the service. Those earlier framework responses are outside this controller's versioned body and header handling; neither transport sets a cookie.

## Persistence and routines

The table keeps eight columns: `session_id uuid PRIMARY KEY`, `tenant_id uuid NOT NULL`, `membership_id uuid NOT NULL`, `identity_user_id uuid NOT NULL`, `session_digest character(64) NOT NULL UNIQUE`, `created_at timestamptz NOT NULL`, `expires_at timestamptz NOT NULL`, `revoked_at timestamptz NULL`. Existing foreign keys, owner and privileges stay unchanged. CHECKs require a lower-case 64-character hexadecimal digest, a cap between creation and creation plus seven days, and any revoke time at or after creation but before the cap. No defaults are added.

All six new routines have `SET search_path=pg_catalog`, owner `jobguard_migration`, and no PUBLIC/infrastructure EXECUTE. Only routine 3 is SECURITY DEFINER and runtime-executable; the others are invoker routines and have no runtime EXECUTE:

1. `app.contractor_practice_session_digest(uuid) RETURNS character(64)` — SQL STABLE; one canonical digest expression. NULL gives NULL.
2. `app.contractor_practice_session_live(uuid) RETURNS TABLE(session_ref uuid, tenant_id uuid, membership_id uuid, identity_user_id uuid)` — SQL VOLATILE by default, a plain read helper, exactly ONE row or none. Tests session records only, with one clock reading; membership and company state are not extra predicates.
3. `app.revoke_contractor_practice_session(uuid) RETURNS jsonb` — PL/pgSQL VOLATILE SECURITY DEFINER. Database mode first, guarded uuid tenant setting, row lock by digest, one clock reading, one UNAUTHENTICATED refusal for all holder/context/lifetime failures. No membership/grant check. Returns row number, member and UTC microseconds internally only. Calls routines 1 and 6 and repeats only the row's two live tests so it can store exactly the reading it tested.
4. `app.contractor_practice_session_guard() RETURNS trigger` — PL/pgSQL VOLATILE. INSERT is bounded by transaction/database clock and home deadline; the new columns are write-once, except NULL-to-current-time revoke. Set revoke times cannot move or clear. DELETE/TRUNCATE are refused. The four pre-existing columns retain the table owner's existing freedom.
5. `app.contractor_practice_session_require_audit() RETURNS trigger` — PL/pgSQL VOLATILE. Deferred UPDATE constraint trigger requires the tenant-qualified revoke event before commit.
6. `app.contractor_practice_home_deadline(character,timestamptz) RETURNS timestamptz` — SQL STABLE. Three answers: `infinity` means no home record; `-infinity` means an ended home record; a finite time is the live home deadline. It reads the home RECORD, with no write or lock, and is the migration's only statement naming that table.

The three replacements retain the merged names, signatures, languages, SECURITY DEFINER flags, search paths, owners, grants and volatility. Lookup delegates to routine 2 and returns the same three columns. Start keeps the generated organisation and lock key 55; it finds by digest, refuses ended values with the nil uuid without writes or settings, and writes a random row number and bounded times for a new value. Grant command adds just the identical owner refusal used by member.invite, as the first statement of the grant.create branch. Earlier permission, replay, membership and revision refusals stay in the same order; existing owner-grant receipts still replay. Generated bootstrap owners and direct owner-role inserts are unchanged.

## Atomic audit

Revoke and one event commit in the merged `withTenant` transaction. `appendAuditBatch` is the final write and owns the final contending lock. The event has derived ID `derivedUuid("practice-session-revoked:" + tenant + ":" + rowNumber)`, event type `contractor.practice_session.revoked`, subject type `practice-session`, subject reference row number, actor reference `membership:<member>`, and payload `{ references: { session: rowNumber, environment: "synthetic_demo" }, classifications: { action: "security" } }`. Neither session value nor digest is in the event. A direct routine call without its event fails at commit.

## HELD

- Every screen, button, page, component, navigation item and browser test, including ending or expiry notices: UI parked by Ben.
- Hash before database: needs a pinned repository and two fingerprints changed; before any deployment.
- Strict issued-session start rule and limits on generated companies: PRACTICE-START-STRICT-1, FIX-LATER item 3. A start with no home record is allowed here by ruling.
- ContractorController's existing fixed Origin: FIX-LATER item 5, before any deployment.
- Renewal, lengthening, or ending another holder's session: outside this boundary.
- Existing grants, team.move, or which member may hold which role: Q7, founder decision.
- Any home table, issuer, lookup, guard, home-ending route or dependence on the fixed demo owner's membership: Q12, read only here.
- PRACTICE-WORKER-SWITCH: separate later piece; it must keep using the live helper and prove that role switching moves no deadline and revives no ended value.
- Real people, pilot, production, providers, sends, spending, deployment and release: founder-reserved.

## Honest limits

1. The digest is computed inside the database: the pinned repository still sends the session value as a bound parameter, as today; it is never part of a statement's text, and a database configured to log bound parameters would log it. Hash-before-database and logged-bound-parameter handling remain FIX-LATER before any deployment.
2. Session values written before the upgrade remain in superseded row versions, the write-ahead log and any earlier backup until normal clean-up and retention remove them. This is FIX-LATER before any deployment.
3. The lookup is read once per request: a request already past it finishes as the member it was given even if the session expires, is revoked, or its home record ends an instant later. That last instant is the stated limit.
4. A converted session keeps only what is left of its home record's 7 days; one whose home record has ended, or that has no home record, is ended by the upgrade. Anyone whose cookie was issued more than 7 days before the upgrade is signed out of contractor practice by it (home practice had already refused it): Start gives a new cookie and a NEW made-up company. The old company stays, reachable by no browser. A converted row's created_at is the upgrade time; its company's creation time remains on control_plane.tenant.created_at.
5. The audit chain has an event for revoke only: start is written by a pinned file this piece cannot change (commercial_track.assigned stands for it); expiry and home ending are passive; a refused lookup has no company to record it in.
6. Start still tells a never-used value with no ended home record (a new company) from an ended one (refused): a fact about the caller's own value only. Generating companies from arbitrary uuids is unchanged, FIX-LATER item 3. The strict rule is PRACTICE-START-STRICT-1, owned and drafted.
7. Owner grants handed out by grant.create before the upgrade stay in force until an administrator revokes them; merged team.move still re-issues a team-scoped grant with the role it had; direct inserts by the table owner are not governed.
8. Nothing in a database withstands its own owner or a superuser, who can switch triggers off or write rows by hand.
9. Revoking neither clears the cookie nor touches the home practice record: home practice with the same cookie carries on. The merged admin screen will, on its next Start, fetch a new cookie, also beginning new home practice. The old rows stay, out of that browser's reach. No screen calls the new route.
10. The session of a revoked MEMBER still resolves to its company, as today; each command still checks that member's own authority.
11. A value the issuer never issued has no home record: its contractor session has its own seven-day cap from its first start, and home practice refuses it. If a home record with the same digest is ever written, the tighter of the two applies from then on; this piece does not stop that record being written (it may not touch the home table or issuer). Through the product it cannot happen: the issuer draws a new random value. Only a caller holding the application's database login could ask the issuer routine for a chosen digest.
12. The home record is the authority at every lookup and this piece adds no guard to it: its owner or a superuser can still change it by hand. Ending or shortening it ends contractor access at once; lengthening it never lengthens access past the copied cap; un-ending it by hand makes a contractor session that is neither revoked nor past its cap answer again. No application route or callable routine does these. This accepted limit is distinct from any holder-accessible renewal.
13. The home test reads the home RECORD only. Home practice also refuses a cookie when the fixed demo owner's membership is revoked or expired; contractor practice does not follow that (Q12).
14. An upper-case spelling is refused by home practice (it hashes text as sent) and resolved by contractor practice (the argument is a uuid) under the same home deadline, as today for spelling and never beyond the deadline.

## Rollback note

Prefer a forward fix. Restore the three 0054 function texts with three CREATE OR REPLACE statements, preserving owners/grants. The 0054 start writes four columns only, so all three added NOT NULL requirements and both guard triggers must be dropped in the same rollback or every start fails. The deferred audit trigger and remaining added rules/helpers should be removed as part of a reviewed full rollback. No row retains its original session value, so the restored lookup ends every current session; each browser starts a new made-up company. Nothing is deleted. Later foreign keys require their own coordinated rollback.

## Validation gates

Schemas, application and Next adapter use stubbed database facts in sandbox unit runs. Actual PostgreSQL 16 behavior, conversion counts in any kept Mac database, the real Nest socket pipeline, and every unedited merged database regression are NOT RUN in this sandbox. RED requires independent fresh Opus and Sol verdicts bound to the dispatcher's exact commit; no builder acceptance. UI and all real-data release gates remain HELD.

## Three replacements, full old and new SQL

These are source texts, not database-executed evidence. Owners and grants are retained by CREATE OR REPLACE; no ALTER OWNER, GRANT or REVOKE is issued for these replacements.

### contractor_session before (0054)

```sql
CREATE FUNCTION app.contractor_session(s uuid) RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT x.tenant_id,x.membership_id,x.identity_user_id FROM control_plane.contractor_practice_session x WHERE x.session_id=s AND current_database()='jobguard_synthetic_demo'
$$;
```

### contractor_session after (0138)

```sql
CREATE OR REPLACE FUNCTION app.contractor_session(s uuid) RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT l.tenant_id,l.membership_id,l.identity_user_id FROM app.contractor_practice_session_live(s) l $$;
```

### start_contractor_practice before (0054)

```sql
CREATE FUNCTION app.start_contractor_practice(s uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; u uuid; a uuid; m uuid; r uuid; b uuid; team_id uuid; assignment uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(s::text,55));
 SELECT tenant_id INTO t FROM control_plane.contractor_practice_session WHERE session_id=s;
 IF t IS NOT NULL THEN RETURN t; END IF;
 t:=gen_random_uuid(); u:=gen_random_uuid(); a:=gen_random_uuid(); m:=gen_random_uuid(); r:=gen_random_uuid(); b:=gen_random_uuid(); team_id:=gen_random_uuid(); assignment:=gen_random_uuid();
 PERFORM set_config('app.tenant_id',t::text,true);
 INSERT INTO control_plane.tenant(id) VALUES(t); INSERT INTO identity.identity_user(id) VALUES(u);
 INSERT INTO app.account(id,tenant_id,name) VALUES(a,t,'Fictional contractor');
 INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,t,a,u,'owner');
 INSERT INTO control_plane.contractor_practice_session VALUES(s,t,m,u);
 PERFORM app.assign_commercial_track(t,assignment,'contractor','synthetic-agreement:'||t,0,'operations:synthetic-generator');
 INSERT INTO app.contractor_member VALUES(t,m,NULL,'owner@fictional.invalid');
 INSERT INTO app.org_unit VALUES(t,t,'tenant',NULL,NULL,'Fictional contractor'),(t,r,'region',t,'tenant','Fictional region'),(t,b,'branch',r,'region','Fictional branch');
 INSERT INTO app.team(tenant_id,id,branch_id,name) VALUES(t,team_id,b,'Fictional team');
 INSERT INTO app.role_grant VALUES(t,gen_random_uuid(),m,'owner','tenant',t,NULL);
 RETURN t;
END $$;
```

### start_contractor_practice after (0138)

```sql
CREATE OR REPLACE FUNCTION app.start_contractor_practice(s uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; u uuid; a uuid; m uuid; r uuid; b uuid; team_id uuid; assignment uuid; digest char(64); reading timestamptz; home timestamptz;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(s::text,55));
 SELECT x.tenant_id INTO t FROM control_plane.contractor_practice_session x WHERE x.session_digest=app.contractor_practice_session_digest(s);
 IF t IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM app.contractor_practice_session_live(s)) THEN RETURN t; END IF;
  RETURN '00000000-0000-0000-0000-000000000000'::uuid;
 END IF;
 digest:=app.contractor_practice_session_digest(s); reading:=clock_timestamp(); home:=app.contractor_practice_home_deadline(digest,reading);
 IF home='-infinity'::timestamptz THEN RETURN '00000000-0000-0000-0000-000000000000'::uuid; END IF;
 t:=gen_random_uuid(); u:=gen_random_uuid(); a:=gen_random_uuid(); m:=gen_random_uuid(); r:=gen_random_uuid(); b:=gen_random_uuid(); team_id:=gen_random_uuid(); assignment:=gen_random_uuid();
 PERFORM set_config('app.tenant_id',t::text,true);
 INSERT INTO control_plane.tenant(id) VALUES(t); INSERT INTO identity.identity_user(id) VALUES(u);
 INSERT INTO app.account(id,tenant_id,name) VALUES(a,t,'Fictional contractor');
 INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,t,a,u,'owner');
 INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) VALUES(gen_random_uuid(),t,m,u,digest,reading,LEAST(home,reading+interval '7 days'));
 PERFORM app.assign_commercial_track(t,assignment,'contractor','synthetic-agreement:'||t,0,'operations:synthetic-generator');
 INSERT INTO app.contractor_member VALUES(t,m,NULL,'owner@fictional.invalid');
 INSERT INTO app.org_unit VALUES(t,t,'tenant',NULL,NULL,'Fictional contractor'),(t,r,'region',t,'tenant','Fictional region'),(t,b,'branch',r,'region','Fictional branch');
 INSERT INTO app.team(tenant_id,id,branch_id,name) VALUES(t,team_id,b,'Fictional team');
 INSERT INTO app.role_grant VALUES(t,gen_random_uuid(),m,'owner','tenant',t,NULL);
 RETURN t;
END $$;
```

### contractor_admin_command before (0054)

```sql
CREATE FUNCTION app.contractor_admin_command(actor uuid, payload jsonb, request_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; k text:=payload->>'kind'; target uuid; permission text; rev integer; prior app.command_receipt; result jsonb; member uuid; account uuid; user_id uuid; rule_id uuid; contract_revision integer; g record;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF payload->>'version' IS DISTINCT FROM 'contractor-command.v1' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF NOT coalesce(app.contractor_member_active(actor),false) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 permission:='organisation.manage';
 CASE k
 WHEN 'unit.create' THEN target:=(payload->>'parentId')::uuid;
 WHEN 'team.create' THEN target:=(payload->>'branchId')::uuid;
 WHEN 'client.create' THEN target:=(payload->>'branchId')::uuid;
 WHEN 'member.invite' THEN
  target:=(payload->'scope'->>'id')::uuid;
  IF payload->>'role'='client_approver' THEN permission:='client.invite'; target:=(payload->>'clientId')::uuid; END IF;
 WHEN 'grant.create' THEN target:=(payload->'scope'->>'id')::uuid;
 WHEN 'grant.revoke' THEN SELECT scope_id INTO target FROM app.role_grant WHERE tenant_id=t AND id=(payload->>'grantId')::uuid;
 WHEN 'membership.revoke' THEN target:=t;
 WHEN 'team.move' THEN
  target:=(payload->>'toTeamId')::uuid;
  IF payload->>'fromTeamId' IS NOT NULL AND NOT app.contractor_allowed(actor,permission,(payload->>'fromTeamId')::uuid) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 WHEN 'contract.revise' THEN target:=(payload->>'clientId')::uuid; permission:='contract.manage';
 ELSE RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END CASE;
 IF target IS NULL OR NOT coalesce(app.contractor_allowed(actor,permission,target),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=(payload->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.request_hash<>request_hash OR prior.actor_membership_id<>actor THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result;
 END IF;
 IF k IN('grant.create','team.move','membership.revoke') THEN
  member:=(payload->>'membershipId')::uuid;
  IF NOT coalesce(app.contractor_member_active(member),false) OR NOT (
    app.contractor_allowed(actor,'organisation.manage',t) OR EXISTS(
      SELECT 1 FROM app.role_grant x WHERE x.tenant_id=t AND x.membership_id=member
      AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(x.tenant_id,x.id))
      AND app.contractor_allowed(actor,'organisation.manage',x.scope_id)))
  THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 END IF;
 SELECT count(*)::integer INTO rev FROM app.command_receipt WHERE tenant_id=t AND command_type LIKE 'contractor.%';
 IF rev<>(payload->>'expectedRevision')::integer THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 -- Subject IDs are one namespace: contractor_allowed resolves a bare UUID across units, teams and clients,
 -- so a new subject may never reuse an ID that already names another subject (or the tenant). Serialised by the tenant lock above.
 IF k IN('unit.create','team.create','client.create') AND ((payload->>'id')::uuid=t
   OR EXISTS(SELECT 1 FROM app.org_unit WHERE tenant_id=t AND id=(payload->>'id')::uuid)
   OR EXISTS(SELECT 1 FROM app.team WHERE tenant_id=t AND id=(payload->>'id')::uuid)
   OR EXISTS(SELECT 1 FROM app.client_organisation WHERE tenant_id=t AND id=(payload->>'id')::uuid))
 THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 CASE k
 WHEN 'unit.create' THEN INSERT INTO app.org_unit VALUES(t,(payload->>'id')::uuid,payload->>'unitKind',target,CASE payload->>'unitKind' WHEN 'region' THEN 'tenant' ELSE 'region' END,payload->>'name');
 WHEN 'team.create' THEN INSERT INTO app.team(tenant_id,id,branch_id,name) VALUES(t,(payload->>'id')::uuid,target,payload->>'name');
 WHEN 'client.create' THEN INSERT INTO app.client_organisation(tenant_id,id,branch_id,name,client_type) VALUES(t,(payload->>'id')::uuid,target,payload->>'name',payload->>'clientType');
 WHEN 'member.invite' THEN
  IF payload->>'role'='owner' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF payload->>'role'='client_approver' AND ((payload->'scope'->>'kind')<>'client' OR target IS DISTINCT FROM (payload->'scope'->>'id')::uuid OR payload->>'clientId' IS NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  user_id:=gen_random_uuid(); member:=(payload->>'id')::uuid;
  SELECT account_id INTO account FROM app.membership WHERE tenant_id=t AND id=actor;
  INSERT INTO identity.identity_user(id) VALUES(user_id);
  INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(member,t,account,user_id,payload->>'role');
  INSERT INTO app.contractor_member VALUES(t,member,(payload->>'clientId')::uuid,payload->>'email');
  INSERT INTO app.role_grant VALUES(t,gen_random_uuid(),member,payload->>'role',payload->'scope'->>'kind',(payload->'scope'->>'id')::uuid,(payload->>'contractId')::uuid);
  IF payload->'scope'->>'kind'='team' THEN INSERT INTO app.team_membership VALUES(t,gen_random_uuid(),member,(payload->'scope'->>'id')::uuid,1,true); END IF;
 WHEN 'grant.create' THEN
  INSERT INTO app.role_grant VALUES(t,(payload->>'id')::uuid,(payload->>'membershipId')::uuid,payload->>'role',payload->'scope'->>'kind',(payload->'scope'->>'id')::uuid,(payload->>'contractId')::uuid);
 WHEN 'grant.revoke' THEN INSERT INTO app.role_grant_revocation VALUES(t,(payload->>'id')::uuid,(payload->>'grantId')::uuid);
 WHEN 'membership.revoke' THEN INSERT INTO app.contractor_membership_revocation VALUES(t,(payload->>'id')::uuid,(payload->>'membershipId')::uuid);
 WHEN 'team.move' THEN
  member:=(payload->>'membershipId')::uuid;
  IF payload->>'fromTeamId'=payload->>'toTeamId' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
  IF payload->>'fromTeamId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.team_membership tm WHERE tm.tenant_id=t AND tm.membership_id=member AND tm.team_id=(payload->>'fromTeamId')::uuid AND tm.active AND tm.revision=(SELECT max(x.revision) FROM app.team_membership x WHERE(x.tenant_id,x.membership_id,x.team_id)=(tm.tenant_id,tm.membership_id,tm.team_id))) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF payload->>'fromTeamId' IS NOT NULL THEN
   INSERT INTO app.team_membership SELECT t,gen_random_uuid(),member,(payload->>'fromTeamId')::uuid,coalesce(max(revision),0)+1,false FROM app.team_membership WHERE tenant_id=t AND membership_id=member AND team_id=(payload->>'fromTeamId')::uuid;
   FOR g IN SELECT * FROM app.role_grant x WHERE x.tenant_id=t AND x.membership_id=member AND x.scope_kind='team' AND x.scope_id=(payload->>'fromTeamId')::uuid AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(x.tenant_id,x.id)) LOOP
    INSERT INTO app.role_grant_revocation VALUES(t,gen_random_uuid(),g.id);
    INSERT INTO app.role_grant VALUES(t,gen_random_uuid(),member,g.role,'team',target,NULL);
   END LOOP;
  END IF;
  INSERT INTO app.team_membership SELECT t,(payload->>'id')::uuid,member,target,coalesce(max(revision),0)+1,true FROM app.team_membership WHERE tenant_id=t AND membership_id=member AND team_id=target;
 WHEN 'contract.revise' THEN
  -- Structured boundary is validated again in the application; SQL rejects incomplete/wrong-version documents.
  IF NOT app.valid_client_contract(payload->'document') OR NOT app.valid_approval_rules(payload->'rules') OR payload->'rules'->>'version' IS DISTINCT FROM 'approval-rules.v1'
   OR jsonb_typeof(payload->'rules'->'bands') IS DISTINCT FROM 'array'
   OR jsonb_array_length(payload->'rules'->'bands')=0
   OR payload->'rules'->'bands'->-1->'upToPence' IS DISTINCT FROM 'null'::jsonb
   OR payload->'rules'->'proceedLimit'->>'currency' IS DISTINCT FROM 'GBP'
   OR NOT coalesce((payload->'rules'->'proceedLimit'->>'pence') ~ '^[0-9]+$',false)
   OR (payload->'rules'->'proceedLimit'->>'pence')::numeric>1000000000000
   OR payload->'document'->>'version' IS DISTINCT FROM 'client-contract.v1'
   OR payload->'document'->>'vatCode' IS DISTINCT FROM 'synthetic-unreviewed'
   THEN RAISE EXCEPTION 'INVALID_RULE_DOCUMENT' USING ERRCODE='22023'; END IF;
  INSERT INTO app.client_contract VALUES(t,(payload->>'contractId')::uuid,target) ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM app.client_contract WHERE tenant_id=t AND id=(payload->>'contractId')::uuid AND client_id=target) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT coalesce(max(revision),0)+1 INTO contract_revision FROM app.client_contract_version WHERE tenant_id=t AND contract_id=(payload->>'contractId')::uuid;
  rule_id:=gen_random_uuid();
  INSERT INTO app.approval_rule_version VALUES(t,rule_id,target,(payload->>'contractId')::uuid,contract_revision,payload->'rules');
  INSERT INTO app.client_contract_version(tenant_id,id,client_id,contract_id,revision,document,rule_version_id) VALUES(t,(payload->>'id')::uuid,target,(payload->>'contractId')::uuid,contract_revision,payload->'document',rule_id);
 END CASE;
 result:=jsonb_build_object('id',payload->>'id','revision',rev+1,'kind',k,'environment','synthetic_demo','realExternalActions',0);
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES((payload->>'commandId')::uuid,t,'contractor.'||k,payload->>'commandId',request_hash,'succeeded',result,actor,clock_timestamp());
 RETURN result;
END $$;
```

### contractor_admin_command after (0138)

```sql
CREATE OR REPLACE FUNCTION app.contractor_admin_command(actor uuid, payload jsonb, request_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; k text:=payload->>'kind'; target uuid; permission text; rev integer; prior app.command_receipt; result jsonb; member uuid; account uuid; user_id uuid; rule_id uuid; contract_revision integer; g record;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF payload->>'version' IS DISTINCT FROM 'contractor-command.v1' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF NOT coalesce(app.contractor_member_active(actor),false) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 permission:='organisation.manage';
 CASE k
 WHEN 'unit.create' THEN target:=(payload->>'parentId')::uuid;
 WHEN 'team.create' THEN target:=(payload->>'branchId')::uuid;
 WHEN 'client.create' THEN target:=(payload->>'branchId')::uuid;
 WHEN 'member.invite' THEN
  target:=(payload->'scope'->>'id')::uuid;
  IF payload->>'role'='client_approver' THEN permission:='client.invite'; target:=(payload->>'clientId')::uuid; END IF;
 WHEN 'grant.create' THEN target:=(payload->'scope'->>'id')::uuid;
 WHEN 'grant.revoke' THEN SELECT scope_id INTO target FROM app.role_grant WHERE tenant_id=t AND id=(payload->>'grantId')::uuid;
 WHEN 'membership.revoke' THEN target:=t;
 WHEN 'team.move' THEN
  target:=(payload->>'toTeamId')::uuid;
  IF payload->>'fromTeamId' IS NOT NULL AND NOT app.contractor_allowed(actor,permission,(payload->>'fromTeamId')::uuid) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 WHEN 'contract.revise' THEN target:=(payload->>'clientId')::uuid; permission:='contract.manage';
 ELSE RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END CASE;
 IF target IS NULL OR NOT coalesce(app.contractor_allowed(actor,permission,target),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=(payload->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.request_hash<>request_hash OR prior.actor_membership_id<>actor THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result;
 END IF;
 IF k IN('grant.create','team.move','membership.revoke') THEN
  member:=(payload->>'membershipId')::uuid;
  IF NOT coalesce(app.contractor_member_active(member),false) OR NOT (
    app.contractor_allowed(actor,'organisation.manage',t) OR EXISTS(
      SELECT 1 FROM app.role_grant x WHERE x.tenant_id=t AND x.membership_id=member
      AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(x.tenant_id,x.id))
      AND app.contractor_allowed(actor,'organisation.manage',x.scope_id)))
  THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 END IF;
 SELECT count(*)::integer INTO rev FROM app.command_receipt WHERE tenant_id=t AND command_type LIKE 'contractor.%';
 IF rev<>(payload->>'expectedRevision')::integer THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 -- Subject IDs are one namespace: contractor_allowed resolves a bare UUID across units, teams and clients,
 -- so a new subject may never reuse an ID that already names another subject (or the tenant). Serialised by the tenant lock above.
 IF k IN('unit.create','team.create','client.create') AND ((payload->>'id')::uuid=t
   OR EXISTS(SELECT 1 FROM app.org_unit WHERE tenant_id=t AND id=(payload->>'id')::uuid)
   OR EXISTS(SELECT 1 FROM app.team WHERE tenant_id=t AND id=(payload->>'id')::uuid)
   OR EXISTS(SELECT 1 FROM app.client_organisation WHERE tenant_id=t AND id=(payload->>'id')::uuid))
 THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 CASE k
 WHEN 'unit.create' THEN INSERT INTO app.org_unit VALUES(t,(payload->>'id')::uuid,payload->>'unitKind',target,CASE payload->>'unitKind' WHEN 'region' THEN 'tenant' ELSE 'region' END,payload->>'name');
 WHEN 'team.create' THEN INSERT INTO app.team(tenant_id,id,branch_id,name) VALUES(t,(payload->>'id')::uuid,target,payload->>'name');
 WHEN 'client.create' THEN INSERT INTO app.client_organisation(tenant_id,id,branch_id,name,client_type) VALUES(t,(payload->>'id')::uuid,target,payload->>'name',payload->>'clientType');
 WHEN 'member.invite' THEN
  IF payload->>'role'='owner' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF payload->>'role'='client_approver' AND ((payload->'scope'->>'kind')<>'client' OR target IS DISTINCT FROM (payload->'scope'->>'id')::uuid OR payload->>'clientId' IS NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  user_id:=gen_random_uuid(); member:=(payload->>'id')::uuid;
  SELECT account_id INTO account FROM app.membership WHERE tenant_id=t AND id=actor;
  INSERT INTO identity.identity_user(id) VALUES(user_id);
  INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(member,t,account,user_id,payload->>'role');
  INSERT INTO app.contractor_member VALUES(t,member,(payload->>'clientId')::uuid,payload->>'email');
  INSERT INTO app.role_grant VALUES(t,gen_random_uuid(),member,payload->>'role',payload->'scope'->>'kind',(payload->'scope'->>'id')::uuid,(payload->>'contractId')::uuid);
  IF payload->'scope'->>'kind'='team' THEN INSERT INTO app.team_membership VALUES(t,gen_random_uuid(),member,(payload->'scope'->>'id')::uuid,1,true); END IF;
 WHEN 'grant.create' THEN
  IF payload->>'role'='owner' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO app.role_grant VALUES(t,(payload->>'id')::uuid,(payload->>'membershipId')::uuid,payload->>'role',payload->'scope'->>'kind',(payload->'scope'->>'id')::uuid,(payload->>'contractId')::uuid);
 WHEN 'grant.revoke' THEN INSERT INTO app.role_grant_revocation VALUES(t,(payload->>'id')::uuid,(payload->>'grantId')::uuid);
 WHEN 'membership.revoke' THEN INSERT INTO app.contractor_membership_revocation VALUES(t,(payload->>'id')::uuid,(payload->>'membershipId')::uuid);
 WHEN 'team.move' THEN
  member:=(payload->>'membershipId')::uuid;
  IF payload->>'fromTeamId'=payload->>'toTeamId' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
  IF payload->>'fromTeamId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.team_membership tm WHERE tm.tenant_id=t AND tm.membership_id=member AND tm.team_id=(payload->>'fromTeamId')::uuid AND tm.active AND tm.revision=(SELECT max(x.revision) FROM app.team_membership x WHERE(x.tenant_id,x.membership_id,x.team_id)=(tm.tenant_id,tm.membership_id,tm.team_id))) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF payload->>'fromTeamId' IS NOT NULL THEN
   INSERT INTO app.team_membership SELECT t,gen_random_uuid(),member,(payload->>'fromTeamId')::uuid,coalesce(max(revision),0)+1,false FROM app.team_membership WHERE tenant_id=t AND membership_id=member AND team_id=(payload->>'fromTeamId')::uuid;
   FOR g IN SELECT * FROM app.role_grant x WHERE x.tenant_id=t AND x.membership_id=member AND x.scope_kind='team' AND x.scope_id=(payload->>'fromTeamId')::uuid AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(x.tenant_id,x.id)) LOOP
    INSERT INTO app.role_grant_revocation VALUES(t,gen_random_uuid(),g.id);
    INSERT INTO app.role_grant VALUES(t,gen_random_uuid(),member,g.role,'team',target,NULL);
   END LOOP;
  END IF;
  INSERT INTO app.team_membership SELECT t,(payload->>'id')::uuid,member,target,coalesce(max(revision),0)+1,true FROM app.team_membership WHERE tenant_id=t AND membership_id=member AND team_id=target;
 WHEN 'contract.revise' THEN
  -- Structured boundary is validated again in the application; SQL rejects incomplete/wrong-version documents.
  IF NOT app.valid_client_contract(payload->'document') OR NOT app.valid_approval_rules(payload->'rules') OR payload->'rules'->>'version' IS DISTINCT FROM 'approval-rules.v1'
   OR jsonb_typeof(payload->'rules'->'bands') IS DISTINCT FROM 'array'
   OR jsonb_array_length(payload->'rules'->'bands')=0
   OR payload->'rules'->'bands'->-1->'upToPence' IS DISTINCT FROM 'null'::jsonb
   OR payload->'rules'->'proceedLimit'->>'currency' IS DISTINCT FROM 'GBP'
   OR NOT coalesce((payload->'rules'->'proceedLimit'->>'pence') ~ '^[0-9]+$',false)
   OR (payload->'rules'->'proceedLimit'->>'pence')::numeric>1000000000000
   OR payload->'document'->>'version' IS DISTINCT FROM 'client-contract.v1'
   OR payload->'document'->>'vatCode' IS DISTINCT FROM 'synthetic-unreviewed'
   THEN RAISE EXCEPTION 'INVALID_RULE_DOCUMENT' USING ERRCODE='22023'; END IF;
  INSERT INTO app.client_contract VALUES(t,(payload->>'contractId')::uuid,target) ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM app.client_contract WHERE tenant_id=t AND id=(payload->>'contractId')::uuid AND client_id=target) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT coalesce(max(revision),0)+1 INTO contract_revision FROM app.client_contract_version WHERE tenant_id=t AND contract_id=(payload->>'contractId')::uuid;
  rule_id:=gen_random_uuid();
  INSERT INTO app.approval_rule_version VALUES(t,rule_id,target,(payload->>'contractId')::uuid,contract_revision,payload->'rules');
  INSERT INTO app.client_contract_version(tenant_id,id,client_id,contract_id,revision,document,rule_version_id) VALUES(t,(payload->>'id')::uuid,target,(payload->>'contractId')::uuid,contract_revision,payload->'document',rule_id);
 END CASE;
 result:=jsonb_build_object('id',payload->>'id','revision',rev+1,'kind',k,'environment','synthetic_demo','realExternalActions',0);
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES((payload->>'commandId')::uuid,t,'contractor.'||k,payload->>'commandId',request_hash,'succeeded',result,actor,clock_timestamp());
 RETURN result;
END $$;
```

### Plain text body comparison

```diff
--- 0054 body
+++ 0138 body
@@ -60,6 +60,7 @@
   INSERT INTO app.role_grant VALUES(t,gen_random_uuid(),member,payload->>'role',payload->'scope'->>'kind',(payload->'scope'->>'id')::uuid,(payload->>'contractId')::uuid);
   IF payload->'scope'->>'kind'='team' THEN INSERT INTO app.team_membership VALUES(t,gen_random_uuid(),member,(payload->'scope'->>'id')::uuid,1,true); END IF;
  WHEN 'grant.create' THEN
+  IF payload->>'role'='owner' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
   INSERT INTO app.role_grant VALUES(t,(payload->>'id')::uuid,(payload->>'membershipId')::uuid,payload->>'role',payload->'scope'->>'kind',(payload->'scope'->>'id')::uuid,(payload->>'contractId')::uuid);
  WHEN 'grant.revoke' THEN INSERT INTO app.role_grant_revocation VALUES(t,(payload->>'id')::uuid,(payload->>'grantId')::uuid);
  WHEN 'membership.revoke' THEN INSERT INTO app.contractor_membership_revocation VALUES(t,(payload->>'id')::uuid,(payload->>'membershipId')::uuid);

```


Builder receipt only — not independently verified, not accepted.

## Final cleanup and unchanged-file inspection

Removed only local build/cache output after completed checks: `.pnpm-store`, `packages/core/dist`, `packages/core/.turbo`, `packages/config/dist`, `packages/config/.turbo`, `packages/storage/dist`, `packages/storage/.turbo`, `packages/ai/dist`, `packages/ai/.turbo`, `packages/db/dist`, `packages/db/.turbo`, `apps/web/.next`, `apps/web/.turbo`, `apps/api/dist`, `apps/api/.turbo`, `apps/web/tsconfig.tsbuildinfo`. Installed dependencies, .git and shared worktrees were untouched. Rechecked the scanner and its eight pinned files against 96c0cb8, every tracked DB test and auth file against local head, and the old extra-origin test against 96c0cb8: all byte-equal. No new credential-shaped literal found in builder files. All 26 acceptance IDs are recorded.

Builder receipt only — not independently verified, not accepted.

## Mac verification (12 Oct)

Run by the Mac-side helper (Claude Sonnet 5.5) on 12 to 13 Oct 2026 after midnight, macOS 26.4, Node v24.17.0, pnpm 10.28.1, embedded PostgreSQL 16, vitest 4.1.11, Playwright 1.55.1 (channel chromium). This is test execution only. It is not a review, not a verdict and not acceptance. Nothing in the code was changed except by the merge of main below. Raw logs: `~/.local/share/full-steam/jg-runs/harden-1-mac/`.

**Result: RED. One database test in the builder's own new upgrade file fails intermittently (2 of 5 runs). Everything else is green. The branch was NOT pushed.**

### Merge of main

Merge commit `f2b822bfde1a7e90612a6fd53b9a2ca213dd7892`, "Merge main (96f051f) into PRACTICE-SESSION-HARDEN-1" (main `96f051f61cbb64081aba8881afe29ca74cd32155`, 38 commits ahead of the branch cut 96c0cb8). Conflicts were only in append-only files; both sides kept, main's lines first: `packages/db/src/migrate.ts` (now ends 0129, 0130, 0131, 0138), `packages/db/MIGRATIONS.md` (0131 section, then 0138), `config/agent-lane-assignments.json` (`fee-both-1` line, then ours), `packages/core/src/index.ts` (`practice-facts`, then ours), `apps/api/src/app.module.ts` (`PracticeFactsController` from main, `ContractorPracticeSessionController` kept). `apps/api/openapi.json` was not hand-merged: main's file was taken, then `pnpm openapi:generate` and `pnpm openapi:check` (exit 0). The only difference from main's OpenAPI is the one added path `/contractor/practice/session/revoke`; no existing path changed. `git diff origin/main --stat` shows 25 files: the 24 lane paths and the coordinator's one-file prerequisite `packages/db/test/audit-export.integration.test.ts`. `LANE_BASE_REF=origin/main pnpm lint:lanes` passes. No merged integration test other than that prerequisite differs from main.

### Counts before the upgrade (Q13 and Q7)

**No kept practice database exists on this Mac, so no count was run and none is invented.** Searched: running PostgreSQL processes and listening ports, embedded-cluster data directories (`PG_VERSION` files) under the repository, `~/.local/share`, `~/Library` and the temporary folders, launch agents, Docker (not installed). The only running cluster was another agent's throwaway browser-test cluster in a temporary folder (not counted). The only other data directories found were stray throwaway test and debug clusters in the temporary folder, not stopped-and-kept practice databases. Q13 no_home_record, home_record_ended, home_record_live: not available (no database). Q7 owner-grant count: not available (no database). So no card to Ben is triggered by this run; the founder's own browser, if it holds an old cookie, is covered by the cookie paragraph at the top.

### Runs (all after rebuilding core, db, storage, config, ai each alone, then api)

| Step | Command (short) | Exit | Result |
| --- | --- | --- | --- |
| 1 | `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane boundary passed |
| 3a | core `contractor-practice-session.test.ts` + `contractor.test.ts` | 0 | 2 files, 747/747 (22 + 725) |
| 3b-1 | db new: practice-session, owner-grant, practice-session-upgrade (3 files, maxWorkers 2) | 1 | 76 passed, 1 FAILED: `[PH23] rolled-back session comparison refuses membership` |
| 3b-2 | upgrade file alone (maxWorkers 1) | 0 | 11/11 |
| 3b-3, 3b-4, 3b-5 | same three files again, three times | 0, 1, 0 | 77/77; 76 + 1 FAILED (same test); 77/77 |
| 3c-1 | api `contractor-practice-session.http.test.ts`, `watchdog-registry.test.ts`, `auth/context-boundary.test.ts` | 0 | 3 files, 305/305 (39 + 121 + 145) |
| 3c-2 | web `revoke/route.test.ts` | 0 | 42/42 |
| 3d | 27 merged database suites, 9 runs of 3 files, none edited | 0 each | 9 runs, 27 files, 424/424 (41, 52, 71, 24, 23, 36, 49, 19, 109) |
| 3e-1 | `pnpm test:migrations` | 0 | 2 files, 13/13 |
| 3e-2 | `pnpm typecheck` | 0 | 7/7 tasks |
| 3e-3 | `LANE_BASE_REF=origin/main pnpm lint` | 0 | core purity, lane boundary, money check passed, 7/7 tasks |
| 3e-4 | `pnpm openapi:check` | 0 | up to date |
| 3f-1 | `SBOX-SESSION-1.spec.ts`, both projects, workers 1 | 0 | 2/2 |
| 3f-2 | contractor and session specs (ENT-1, ENT-2, ENT-10b, CH-3a, CH-7, M4-2-S, M4-5-S, M4-6-S, M4-7-S, MON-7), both projects | 1 | 127 passed, 1 failed: `[mobile-360] ENT-2.spec.ts:19`, the known Mac-only failure (not a finding) |
| 3f-3 | the other 42 spec files that mention practice (CH-1, CH-2, ENT-10d, M0-6L, M1-16-S, M2-1A-S to M2-7-S, M4-1-S, M4-3-S, PRACTICE-FACTS-1, SBOX-1, SBOX-2, SBOX-resume, UIWIRE-1 to 15, VALUE-1, VOICE-1, capture, fee-statement, m1-15-complete-journey, quote-acceptance, review-confirm, switch-live; the pattern for `capture` also ran `proof-capture`), both projects | 0 | 172/172 |

Production build of the web app was made first (`next build`, exit 0). Merged database suites run: contractor, contractor-parties, contractor-session-context, audit-export, audit-checkpoint-handoff, enterprise-identity, identity, practice-session, work-order-import, work-order-concurrency, job-scheduling, sor-pricing, sso-emergency, sso-emergency-concurrency, sso-required, extra-origin, extra-origin-upgrade, recovery-follow-up-upgrade, recovery-timing-pin, prevention-checks, job-activation-terms, tenancy, shadow-catalog, demo-bootstrap, fingerprinted-row-shape, job-parties, small-builder-origin. All byte-identical to main (audit-export carries only the coordinator's prerequisite line) and all passed; none skipped.

### The failing test (not fixed; owner is the builder's test)

First failing assertion, in the first run and again in one of the three repeats:

`packages/db/test/contractor-practice-session-upgrade.integration.test.ts:118` (called from `:115`, through `rolledBack` in `upgrade-proof-utils.ts:53`), test `[PH23] rolled-back session comparison refuses membership`. Expected: the control UPDATE succeeds inside the rolled-back transaction so that `sessionDifferences(client)` can be asserted non-empty. Actual: PostgreSQL error 23503, "insert or update on table contractor_practice_session violates foreign key constraint contractor_practice_session_tenant_id_membership_id_fkey", detail "Key (tenant_id, membership_id) ... is not present in table membership".

Cause (read from the test source; the database behaved correctly): the test picks its row with `sessions.find(x => x.class === "A")` from a query with no ORDER BY, but there are two class-A rows (fixtures 0 and 1, each in its own tenant) and the membership it writes (`ownerCommand.membershipId`) belongs only to fixture 0's tenant. When the unordered query returns fixture 1's row first, the foreign key on (tenant_id, membership_id) refuses the control UPDATE. So the failure is in the builder's new D3 test (non-deterministic choice of row), not in the migration, the product code or any merged code. It failed in 2 of 5 runs (both times in the three-file run; the file passed alone and in two other three-file runs). A repair would be to order the query (or choose the row by fixture) in that test only. It is not repaired here.

### Quoted results, step 3(b) (all-green repeat, test titles as printed by vitest verbose; `PH` numbers are the order's acceptance IDs)

Upgrade proof for 0138 (rule 9), conversion, and replacement checks:

```text
✓ [PH22] replacement attributes at N alone are unchanged
✓ [PH23] populated conversion preserves live home sessions and ends B, C and D without touching other rows
✓ [PH24] only three old function texts differ at N alone and home is unchanged
✓ [PH23] rolled-back session comparison refuses membership   (FAILED in 2 of 5 runs; see above)
✓ [PH23] rolled-back session comparison refuses raw-row-number
✓ [PH23] rolled-back session comparison refuses D-cap
✓ [PH23] rolled-back session comparison refuses B-cap
✓ [PH23] rolled-back session comparison refuses A-home-cap
✓ [PH23] microsecond and pre-existing type changes fail the same helper comparison
✓ [PH23] later nullable columns, changed function and inserted rows pass
✓ [PH23] successors and repeated migrate preserve named existing rows and full types
```

Home record and deadline (every title that mentions home or deadline):

```text
✓ [PH1] issued sessions take the unchanged home record's remaining deadline
✓ [PH2] a new session with no home record keeps its fixed cap and concurrent starts share one company
✓ [PH3] expiry and the copied cap refuse access even if home is lengthened
✓ [PH4] home revoked refuses every contractor path without changing its row
✓ [PH4] home expired refuses every contractor path without changing its row
✓ [PH5] contractor revoke leaves home and home jobs unchanged and cannot be revived by the live home
✓ [PH6] holder activity never moves a deadline with home=false
✓ [PH6] holder activity never moves a deadline with home=true
✓ [PH7] never-issued, cap-expired, revoked and both home-ended values have one public answer
✓ [PH8] home-expired stays ended and a fresh value starts a separate company
✓ [PH8] home-revoked stays ended and a fresh value starts a separate company
✓ [PH8] home-without-row stays ended and a fresh value starts a separate company
✓ [PH8] a home record appearing later keeps the earlier cap and its end refuses the session
✓ [PH9] owner insert refuses beyond-home
✓ [PH9] owner insert refuses home-ended
✓ [PH10] revoke is timestamped, audited, and leaves company unchanged with home=false
✓ [PH10] revoke is timestamped, audited, and leaves company unchanged with home=true
✓ [PH13] two revokes produce one event; open revoke and home ending read the committed state
✓ [PH16] canonical uuid case and the home digest bind the same row
```

Digest storage (no session value in any table), catalogue and permissions:

```text
✓ [PH15] catalogue scan finds no stored session values and exactly one new digest place
✓ [PH16] canonical uuid case and the home digest bind the same row
✓ [PH22] catalogue proves columns, constraints, non-internal triggers and exact routine grants
✓ [PH9] runtime cannot access either session table directly
✓ [PH9] owner writes cannot move authority fields, undo a revoke, remove or truncate rows
```

Revoke (holder-only, indistinguishable refusals, audited, race-safe):

```text
✓ [PH10] revoke is timestamped, audited, and leaves company unchanged with home=false / home=true
✓ [PH11] all revoke refusals are indistinguishable and write nothing
✓ [PH11] a holder can end their own session after membership revoke without additional permission
✓ [PH12] failures at routine, audit insert and commit roll back both versions and audit head
✓ [PH12] deferred audit refuses routine and owner revocations at commit without an event
✓ [PH12] the audit append takes the final contending lock
✓ [PH13] two revokes produce one event; open revoke and home ending read the committed state
✓ [PH13] a start concurrent with an open revoke cannot create a second company
```

Owner grant refusal (`grant.create` with `owner`), 10 + 7 + 1 + 9 results:

```text
✓ [PH18] refuses owner grant in otherwise open cell P-O-tenant / P-O-region / P-O-branch / P-O-team / P-A1-tenant / P-P-tenant / A1-O-tenant / A1-O-team / A2-O-branch / A2-O-team   (10 of 10)
✓ [PH19] preserves the earlier refusal for operative / read-only / other-branch / unknown-member / revoked-member / stale   (6 of 6)
✓ [PH19] mode is refused before the new owner rule in direct SQL
✓ [PH20] direct runtime routine refuses owner without any layer above it
✓ [PH21] invitation and grant still permit role admin / operative / supervisor / surveyor / commercial_manager / finance / read_only / client_approver   (8 of 8)
✓ [PH21] generator, direct owner insert, team move and revocations retain their behavior
```

Other new database results in the same files that passed: [PH14] a different database name refuses all session routines; [PH8] cap stays ended and a fresh value starts a separate company; [PH8] contractor-revoked stays ended and a fresh value starts a separate company; [PH9] owner insert refuses backdated / forwarddated / revoked / invalid-digest / before-created / beyond-seven / duplicate. Total in the three new files: 77 tests; 77 passed in 3 of 5 runs and 76 passed with the one failure above in 2 of 5 (the single-file run counts as one of the five).

Not pushed. No pull request opened. Status: merged with main, tested on the Mac, NOT green.

## Repair round 2 (13 Oct): intermittent PH23 test, built by Claude, Codex unavailable

Built by Claude Sonnet 5.5 because Codex had no budget. Only a test was changed; no migration, product code, merged test, scanner or list was touched, and `apps/api/src/auth/context-boundary.test.ts` was not touched. This is a repair note, not a review or a verdict; a separate Opus check and a Codex Sol check come later.

### The defect

`packages/db/test/contractor-practice-session-upgrade.integration.test.ts:116`, in `it.each(["membership","raw-row-number","D-cap","B-cap","A-home-cap"])("[PH23] rolled-back session comparison refuses %s", ...)`. The first line picked its row with `sessions.find(x => x.class === ...)`. The `sessions` list comes from a query with no `ORDER BY`, so it has no fixed order, and it holds two class-A rows (line 78 asserts `toHaveLength(2)`), one per tenant. For the `membership` control the test writes `ownerCommand.membershipId` into the chosen row. That membership belongs to fixture 0's tenant only. When the other tenant's class-A row came back first, PostgreSQL refused the control UPDATE with error 23503 (`contractor_practice_session_tenant_id_membership_id_fkey`) before the comparison could run. Seen on the Mac as about 2 failures in 5 runs.

Reproduced here on the unchanged code before the fix, first attempt, upgrade file alone: 1 failed, 10 passed; `contractor-practice-session-upgrade.integration.test.ts:118` (called from `:115` through `rolledBack`, `upgrade-proof-utils.ts:53`), error 23503 with the constraint name above. Log: `repair1/00-old-upgrade-1.log`.

### Before and after (one statement changed, in that test only)

Before (line 116):

```ts
  const selected = sessions.find(x => x.class === (control === "D-cap" ? "D" : control === "B-cap" ? "B" : "A"))!;
```

After (lines 116 to 119):

```ts
  // `sessions` has no fixed order and holds two class-A rows (one per tenant); ownerCommand.membershipId exists only in fixtures[0]'s tenant,
  // so the membership control needs that tenant's row. Every control uses the same explicit order: fixtures[0]'s tenant first, then digest.
  const homeTenant = (x: Captured) => (JSON.parse(x.bytes) as { tenant_id: string }).tenant_id === fixtures[0]!.p.tenantId ? 0 : 1;
  const selected = sessions.filter(x => x.class === (control === "D-cap" ? "D" : control === "B-cap" ? "B" : "A")).sort((a, b) => homeTenant(a) - homeTenant(b) || (a.digest < b.digest ? -1 : 1))[0]!;
```

Nothing else changed: the five controls, every `UPDATE`, and `expect((await sessionDifferences(client)).length).toBeGreaterThan(0)` are as before, as is the closing `await compare(c.admin)`. The `membership` control now always writes a membership of the row's own tenant, and that membership differs from the row's own, so the helper still reports `columns-changed`. The other four controls make the same change as before, now on a row picked in a fixed order.

### Other unordered picks checked

- `contractor-practice-session-upgrade.integration.test.ts`: the only unordered `find` on a multi-row list was the one above. `fixtures[...]` are indexed by position; `sessions.some(...)` and `sessions.filter(...).length` are order-free; every `.rows[0]` reads a single-row aggregate or a one-key lookup. No other change needed.
- `contractor-practice-session.integration.test.ts`: `.find(unit => unit.kind === "branch")` (line 76) runs on one freshly started tenant, which has exactly one branch (migration 0138 seeds one region, one branch, one team); the unit list is also `ORDER BY kind,name` in `contractor-repository.ts:76`. All `.rows[0]` reads are keyed lookups or aggregates. Cannot produce this failure; unchanged.
- `contractor-owner-grant.integration.test.ts`: `view.units.find(kind === "region")`, `view.units.find(kind === "branch")` and `view.teams[0]` (line 27) read one freshly started tenant before the second branch is created, so each has exactly one match (units `ORDER BY kind,name`, teams `ORDER BY name`). `.rows[0]` at line 18 is a keyed lookup. Cannot produce this failure; unchanged.

### Runs after the fix

Command for runs 1 to 5, each through `heavy-slot`, `--maxWorkers=1`, in `packages/db`: `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/contractor-practice-session.integration.test.ts test/contractor-owner-grant.integration.test.ts test/contractor-practice-session-upgrade.integration.test.ts`. The dist folders for core, db, storage, config, ai and api were checked and were not stale (no source file newer than its dist, built 23:46 on 12 Oct), so no rebuild was needed. Logs are under `~/.local/share/full-steam/jg-runs/harden-1-mac/repair1/`.

| Run | Files | Exit | Test files | Tests |
|---|---|---|---|---|
| 1 | three files | 0 | 3 passed (3) | 77 passed (77) |
| 2 | three files | 0 | 3 passed (3) | 77 passed (77) |
| 3 | three files | 0 | 3 passed (3) | 77 passed (77) |
| 4 | three files | 0 | 3 passed (3) | 77 passed (77) |
| 5 | three files | 0 | 3 passed (3) | 77 passed (77) |
| 6 | upgrade file alone | 0 | 1 passed (1) | 11 passed (11) |
| 7 | upgrade file alone | 0 | 1 passed (1) | 11 passed (11) |
| 8 | upgrade file alone | 0 | 1 passed (1) | 11 passed (11) |
| typecheck | `pnpm typecheck` | 0 | 7 of 7 tasks | n/a |
| lint | `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7 of 7 tasks | n/a |

Not claimed: the `db` typecheck covers `src/` only (`packages/db/tsconfig.json` includes `src/**/*.ts`), so the test file is checked by running it, not by `tsc`. Eight passes in a row is evidence of stability, not proof; before the fix this test failed about 2 runs in 5. Not independently reviewed yet.
