# ENT-10a2 builder receipt

Builder: Codex GPT-6.1 Sol. Branch: `codex/sandbox/ent-10a2`. Base commit: `96f051f61cbb64081aba8881afe29ca74cd32155`. Working tree only: no commit, push, merge or pull request created. Intended commit message: `/private/tmp/jg-msg-ent-10a2.txt`.

Base migration 0129 SHA-256: `4bbeb8d9e88a8f65dc4c47ac369717b95c62e68b113793f5a0c0ad62a7446c50` (matches the order). ENT-10e is absent from the base. The base already includes migration 0131; the header's description of main ending at 0130 is older than this checkout. Issued number 0137 is registered last, in increasing numeric order.

**This is the first product code to set `app.membership.revoked_at`; until now only tests do.** The separate merged contractor `membership.revoke` command writes `app.contractor_membership_revocation` and is untouched. FIX-LATER before any commercial module opens to real sign-ins: current_memberships does not read that separate record.

## Outcome and technical acceptance

Built the new table and one checked routine, restricted identity repository, seed/bearer contracts, application, Nest controller, Next receiving route, OpenAPI and synthetic database/unit tests. No UI, provider connection, outbound action or native implementation was introduced. All changes are inside the issued lane; BUILD_PLAN.md and AGENTS.md are unchanged. Source-inspected, unit-tested and database-tested are separate claims below. Database guarantees remain unexecuted here, both RED verdicts remain pending, and the builder gives no acceptance.

Questions answered by source inspection: (1) the recorded revocation facts remove all existing company request authority through the unchanged gates, subject to the ten stated limits; (2) predicates explicitly scope memberships, grants, subjects and bound sessions to the connection's company, preserving other people/companies; (3) only a bearer proved for that path reaches deactivate; unproved requests perform only a fixed-label global refusal insert; (4) no merged routine, explicit table control, grant or test differs from base. PostgreSQL implicitly installs foreign-key internal enforcement triggers on referenced relations for the new table's constraints; the upgrade proof explicitly distinguishes these from an alteration/restatement of existing controls.

## Definitions and implementation

Every binding definition is BUILT and documented in [scim-deactivation-v1.md](../../contracts/scim-deactivation-v1.md): Provider (one test-only connection), Seed (one validated installation setting), Bearer (HMAC over lower-case connection), Proved/unproved caller (exact adapter-visible Authorization value only), Deactivation message (strict versioned JSON, UUID eventId, exact subject, active false), Person (stored connection/company/subject-hash link), Target memberships (all same-company unrevoked memberships), Deactivated (a–g company membership/session/grant facts plus atomic record/audit), four paired Outcomes, Replay, Conflict, Nothing written, one public refusal, and Synthetic only. Reactivation is HELD: active true fails input, no revocation is cleared.

Seed is read once at workspace composition from JOBGUARD_SCIM_SYNTHETIC_SEED, separately from every other setting. No default, persistence, logging, issuing route or screen exists. The connection/company is read only by merged sso_load_connection. Raw subject never enters SQL; only SHA-256 of unchanged UTF-8 bytes does. Event hash is SHA-256 of JSON.stringify with ordered keys active, connectionId, eventId, subjectHash, version. Repository result is strictly validated and paired before the last audit write. Errors preserve only typed public messages; original unknown errors remain server-side causes.

Transport evidence limit: the Next unit test executes its actual route source with an adapter-visible header supplied verbatim. Fetch Headers normalizes surrounding whitespace, so a wire-level trailing space may already have been removed before the route can see it. These tests prove rejection of malformed values *as delivered to the service*; no raw HTTP header-byte guarantee or live transport run is claimed. The missing/empty/scheme/case/wrong value/changed value/extra word/other connection/other seed/seed/unset/mode/session-only/non-JSON cases retain their exact recorded assertions.

## Database objects and ordered statements

Migration `packages/db/migrations/0137_scim_deactivation.sql` begins/commits its own transaction, has no backfill and changes no existing row when applied.

`identity.scim_event`: tenant_id UUID NOT NULL; id UUID NOT NULL; connection_id UUID NOT NULL; source_event_id UUID NOT NULL; subject_hash and event_hash CHAR(64) NOT NULL with lower-case SHA-256 checks; outcome TEXT NOT NULL closed to deactivated/ignored/refused; cause_code TEXT NOT NULL closed to the four causes; user_id UUID optional with identity_user FK; three INTEGER NOT NULL nonnegative revocation counts; created_at TIMESTAMPTZ NOT NULL. PK (tenant_id,id); unique (tenant_id,connection_id,source_event_id); tenant-qualified connection FK. Additional checks bind the four outcome/cause pairs, unknown-subject iff null user, and positive membership count iff deactivated, with all counts zero otherwise. Owner jobguard_migration; ENABLE/FORCE RLS; fail-closed 0129-shaped tenant policy; immutable UPDATE/DELETE trigger calling the merged reject routine. No table privilege granted to PUBLIC, identity, runtime or infrastructure.

Exact routine signature: `identity.scim_deactivate(c uuid,p jsonb) RETURNS jsonb`, PL/pgSQL, SECURITY DEFINER, search_path pg_catalog, owner jobguard_migration. Statement order:

1. Refuse non-synthetic database.
2. Validate strict object, version, textual UUID and lower-case hash fields; no other key.
3. Call merged sso_load_connection and read its company setting; missing setting refuses.
4. Take the shared company advisory lock, before any business row read/lock except that bootstrap load.
5. Look up same-company/connection/source-id replay. Identical hashes return stored result; changed content raises conflict.
6. Read one clock_timestamp into changed_at.
7. Resolve stored subject link; absent person becomes ignored.
8. Lock every unrevoked membership of that person/company in id order. No target becomes ignored; any owner makes the whole message refused.
9. Otherwise exactly two UPDATE statements setting only revoked_at, each guarded revoked_at IS NULL: memberships of that company, then sessions bound in that company through any of its connections. INSERT one set of missing same-company target grant revocations. Record true counts.
10. One INSERT of immutable scim_event, then return outcome/cause/recordId/replayed.
11. In the repository's merged enterprise transaction only, append one audit event last for a first message, then COMMIT. No business lock follows it. Replays append nothing.

Grant list: revoke all on the NEW table from PUBLIC, jobguard_runtime, jobguard_infrastructure, jobguard_identity; no grant back. Revoke all on the NEW routine from those four; grant EXECUTE only to jobguard_identity. No direct runtime INSERT, UPDATE or DELETE grant was added. No named exception to the new build standard is needed.

**no object from 0111, 0120 or 0129 altered or restated**

**no column, index, constraint, policy, trigger or grant added to any existing table** (explicit DDL; the new table's foreign keys create their own PostgreSQL internal enforcement triggers automatically, covered at N in D4).

## Gate map re-read at base

| Path | Unchanged base file:line | Fact |
|---|---|---|
| Bound request | apps/api/src/auth/persisted-auth-provider.ts:95; packages/db/migrations/0120_enterprise_identity.sql:204 | session.revoked_at; sso_session_scope → contractor_member_active → membership.revoked_at |
| List/resolve ANY session | persisted-auth-provider.ts:100 and :107; packages/db/src/identity-repository.ts:27; 0129_sso_required.sql:65; 0111_persisted_identity.sql:131 | current_memberships filters membership.revoked_at IS NULL |
| Emailed-code sign-in | persisted-auth-provider.ts:70; 0129_sso_required.sql:85 | current_memberships; issued ordinary session lists no membership here |
| Sign in again at provider | 0120_enterprise_identity.sql:147 | contractor_member_active false → MEMBERSHIP_REVOKED |
| Permission/admin/switch | 0054_contractor_organisation.sql:83 and :89; 0120_enterprise_identity.sql:86; 0129_sso_required.sql:138 | membership.revoked_at and immutable grant revocations |
| Background | 0120_enterprise_identity.sql:218; apps/api/src/auth/sso/sso.application.ts:checkWorkerAction; packages/db/src/outbox.ts:13 | bound session revocation and contractor_allowed; executor membership.revoked_at filter |
| Invitation creation | 0111_persisted_identity.sql:146 (owner check :153) | owner membership.revoked_at IS NULL |
| Emergency access | 0129_sso_required.sql:187 (current_memberships loop :198) | same current membership filter |

Source-inspected: **no path found on which a deactivated person can still act** using the existing membership/session authority. New owner-authorized invitation membership is the explicitly adopted limit below, not reactivation of an old fact. Immediate means the next check starts after commit; requests already checked can complete.

## Criteria

BUILT in this table means implementation plus an authored named test, not acceptance or an unobserved database pass. U1 in the file key is the unit file; acceptance [U1] is the upgrade test in D4.

- U1: `apps/api/src/auth/sso/scim.test.ts`
- U2: `apps/api/src/auth/sso/scim-paths.test.ts`
- D1: `packages/db/test/scim-deactivation.integration.test.ts`
- D2: `packages/db/test/scim-deactivation-access.integration.test.ts`
- D3: `packages/db/test/scim-deactivation-concurrency.integration.test.ts`
- D4: `packages/db/test/scim-deactivation-upgrade.integration.test.ts`
- guard: `apps/api/src/auth/context-boundary.test.ts`

| ID | Status | Files | Authored test title/declaration |
|---|---|---|---|
| A1 | BUILT — unit executed | U1 | it('[A1] accepts only the bounded installation setting and derives one bearer per connection' |
| A2 | BUILT — unit executed | U1/U2 | it.each(refusedCases)('[A2] %s has one global refusal and no lookup'<br>it('[A2] a global refusal insert failure keeps the identical public refusal'<br>it.each(negatives)('[A2] Nest %s returns only the identical refusal'<br>it.each([...negatives,'not JSON'])('[A2] Next %s returns only the identical refusal with no cookie or challenge'<br>it('[A2] both transports retain identical refusal when its insert fails' |
| A3 | BUILT — source only; database NOT RUN | D1 | it("[A3] provider proof scopes access before SQL and unknown connections leave only a global refusal" |
| A4 | BUILT — unit executed | U1 | it.each(invalids)('[A4] proved caller invalid input: %s'<br>it('[A4] repository sends only the canonical hashes and appends audit last' |
| A5 | BUILT — unit executed | U1/U2 | it.each(['SCIM_EVENT_CONFLICT','INVALID_SCIM_INPUT','SCIM_ROUTE_BLOCKED','SSO_ROUTE_BLOCKED','SSO_NOT_FOUND'] as const)('[A5] repository translates exact routine cause %s only'<br>it.each(['SCIM_EVENT_CONFLICT','INVALID_SCIM_INPUT','SSO_NOT_FOUND','SSO_ROUTE_BLOCKED','SCIM_ROUTE_BLOCKED','SCIM_UNAVAILABLE'] as const)('[A5] application maps proved repository failure %s without internal data'<br>it('[A5] unexpected proved error is unavailable and pre-service error is refused'<br>it('[A5] closed statuses and result schema refuse unknown or mismatched outcomes'<br>it('[A5] Nest and Next pass only path, authorization and raw body'<br>it('[A5] Next forwards invalid JSON sentinel through the proved service'<br>it.each([['SCIM_REFUSED',403],['INVALID_SCIM_INPUT',400],['SCIM_EVENT_CONFLICT',409],['SCIM_UNAVAILABLE',503]] as const)('[A5] both transports map %s to %s with code only'<br>it('[A5] service-construction errors expose only the public refusal on either transport' |
| B1 | BUILT — source only; database NOT RUN | D1 | it("[B1] exact membership/session/grant revocations share one database time and preserve every other row" |
| B2 | BUILT — source only; database NOT RUN | D1 | it("[B2] hashes match the real sign-in subject exactly including case and trailing whitespace" |
| B3 | BUILT — source only; database NOT RUN | D1 | it("[B3] identity email subject and locator remain canonical text unchanged and code request still works" |
| B4 | BUILT — source only; database NOT RUN | D1 | it("[B4] linked owner is refused whole even with a second active membership and keeps the next request" |
| B5 | BUILT — source only; database NOT RUN | D1 | it("[B5] unknown subject and an existing member address neither create nor link a person" |
| B6 | BUILT — source only; database NOT RUN | D1 | it("[B6] new messages revoke re-admitted membership while a replay never acts again" |
| B7 | BUILT — unit executed; database NOT RUN | U1/D1 | it('[B7] owned migration contains only two one-way updates and no reset'<br>it("[B7] owned source has exactly two one-way UPDATE statements and active true never re-enables" |
| G1 | BUILT — source only; database NOT RUN | D2 | it("[G1] every bound session immediately loses authentication session and company context" |
| G2 | BUILT — source only; database NOT RUN | D2 | it("[G2] ordinary session remains valid with the other company alone and refuses the removed company" |
| G3 | BUILT — source only; database NOT RUN | D2 | it("[G3] deactivated administrator loses both administrative services through bound and ordinary sessions" |
| G4 | BUILT — source only; database NOT RUN | D2 | for(const role of Object.keys(permissions) as Array<keyof typeof permissions>)it(`[G4] ${role} loses every enumerated permission on company and its own scope` |
| G5 | BUILT — source only; database NOT RUN | D2 | it("[G5] allowed background action and real executor both refuse before any attempt or adapter call" |
| G6 | BUILT — source only; database NOT RUN | D2 | it("[G6] provider cannot re-sign-in or relink by address and a fresh code session lists nothing" |
| G7 | BUILT — source only; database NOT RUN | D2 | it("[G7] required ON preserves switch history and all immediate request and background refusals"<br>it("[G7] removing the only re-admitted unlinked person reduces count and permits the original ON command" |
| G8 | BUILT — source only; database NOT RUN | D2 | it("[G8] another same-company administrator and another-company members retain request admin permission worker and executor authority" |
| R1 | BUILT — source only; database NOT RUN | D3 | it("[R1] replays all four stored outcomes without any record, revocation or audit write", async () => { |
| R2 | BUILT — source only; database NOT RUN | D3 | it("[R2] refuses changed content for one source id, retaining the original record and second person's access", async () => { |
| R3 | BUILT — source only; database NOT RUN | D3 | it("[R3] five rounds of the same message on two waiting backends produce one record and one audit event", async () => { |
| R4 | BUILT — source only; database NOT RUN | D3 | it("[R4] two waiting messages for one person serialize one deactivation and one already-inactive record", async () => { |
| R5 | BUILT — source only; database NOT RUN | D3 | it("[R5] five sign-in races finish with no usable bound session whichever transaction gets the lock first", async () => { |
| R6 | BUILT — source only; database NOT RUN | D3 | it("[R6] earlier messages replay in either order without changing a later re-admission", async () => { |
| T1 | BUILT — source only; database NOT RUN | D1 | for(const boundOther of [false,true])it(`[T1] same person retains the other company's ${boundOther?"bound and ordinary":"ordinary"} access and exact rows` |
| T2 | BUILT — source only; database NOT RUN | D1 | it("[T2] another company's subject is indistinguishable from an unlinked subject" |
| T3 | BUILT — source only; database NOT RUN | D1 | it("[T3] all same-company connections lose the person's sessions and event identities are connection-scoped" |
| T4 | BUILT — source only; database NOT RUN | D1 | it("[T4] FORCE RLS hides other-company records and missing empty invalid settings" |
| H1 | BUILT — source only; database NOT RUN | D1 | it("[H1] each outcome stores and audits exactly once with only approved identifiers and hashes" |
| H2 | BUILT — source only; database NOT RUN | D1 | it("[H2] audit failure rolls back every revocation and the exact message succeeds once on retry"<br>for(const failAt of ["routine","commit"] as const)it(`[H2] ${failAt} failure rolls back all domain audit and record writes` |
| H3 | BUILT — source only; database NOT RUN | D1 | it("[H3] commercial identity and earlier audit history stays byte-identical and record mutation fails for owner" |
| H4 | BUILT — source only; database NOT RUN | D1 | it("[H4] public refusals remain global and proved invalid input or conflict audits only its company" |
| K1 | BUILT — source only; database NOT RUN | D1 | it("[K1] catalog verifies tenant keys FORCE RLS immutable trigger and explicit least privileges" |
| U1 | BUILT — source only; database NOT RUN | D4 | it("[U1] applies only N over populated identity history, preserves every pre-existing object at N, then later migrations twice and rolled-back comparison controls", async () => { |
| X1 | BUILT — unit executed | guard | 145 unedited boundary tests |


C1 BUILT server vertical slice, no screen under parked-UI ruling; C2 BUILT shared service and both adapters/OpenAPI; C3 BUILT synthetic gates; C4 BUILT new keys/RLS/ownership/restricted routine, catalogue execution pending; C5 BUILT caller proof, scoping, replay/conflict/atomicity/race tests, database execution pending; C6 BUILT executable tests, only units executed; C7 not claimed because no screen; C8 BUILT lane and receipt, independent RED verdicts/acceptance HELD for dispatcher.

## Fixtures, comparisons and upgrade proof

D1 [B1] compares every unchanged row in app.membership, identity.session, app.role_grant, app.role_grant_revocation, identity.sso_subject, identity.sso_session_binding, identity.sso_grant, identity.membership_locator, identity.identity_user, identity.user_email, identity.invitation and identity.sso_required_event using PostgreSQL canonical text. It separately binds the intended changed row identities and proves equal stored times inside PostgreSQL. Earlier session and revocation values do not move.

D1 [H3] compares nonempty app.journal, app.journal_line, app.evidence_object and all identity.sso_connection, identity.verified_domain, identity.idp_group_role_mapping, identity.sso_grant, identity.sso_subject, identity.sso_session_binding, app.role_grant, identity.sso_required_event rows plus captured earlier audit ids. Journal/lines are posted through LedgerRepository; evidence is finalized through EvidenceService with a deterministic private-storage fixture. No live storage test is claimed.

D4 [U1] installs all migrations before 0137; linked owner and twice-signed mapped member populate all nine compared tables, with existing session/grant revocation and requirement ON plus a no-connection company. Snapshot: names/full format_type types, primary keys and row_to_json text. Apply 0137 alone: same captured rows, all pre-existing function text/owners/definer/config/ACL, existing column/catalog controls unchanged; only one new table and routine with their associated indexes/types/policy/constraints/trigger/FK internal triggers; zero records. Apply after-0137 migrations twice, compare captured identities/named columns/types only. Rolled-back controls: one-microsecond time change FAILS; pre-existing type change FAILS; nullable added column PASSES; own routine replacement after N PASSES; later inserted row PASSES. Empty captured-row control FAILS. No later function/column freeze. Compared tables: app.membership, identity.session, identity.sso_subject, identity.sso_session_binding, identity.sso_grant, app.role_grant, app.role_grant_revocation, identity.membership_locator, identity.sso_required_event.

Table-owner fixtures are explicitly labelled: practice bootstrap owner email/locator/ordinary session (matching merged fixture); second-company membership/locator; otherwise unreachable extra provider subject/session/binding shapes in T1(ii)/T3; second same-company owner-person membership in B4; historical ledger book/accounts/financial authorization and imported-job party metadata; approved Decision/resolution/action authorization for real executor tests; R6 re-admission membership/locator fallback. B6 and G7 re-admission use the REAL merged invitation and emailed-code path. No product routine is changed by these fixture seeds. Cleanup uses merged closeTestPools. Race observation reads real pg_locks without any sleep or business timer; no scheduler/worker is started.

## Commands actually run

Node v24.17.0. The shell's installed global pnpm launcher emitted a v11 warning and stalled before dispatching commands. Initial API build and first attempted unit run were interrupted with exit 130 (no suites executed); pnpm --version and its diagnostic version attempt were also interrupted with exit 130. No package download/install command was issued. A temporary PATH shim uses the already installed exact pnpm 10.28.1 at /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/dist/pnpm.cjs. For subsequent commands PATH=/private/tmp/jg-pnpm-ent-10a2:$PATH; VITEST_MAX_THREADS=2 and VITEST_MAX_FORKS=2 were set for checks. TURBO_CONCURRENCY=2 was set for root checks/build. No test files outside the issued two unit files and standalone boundary guard were executed.

| command | exit | observed result |
|---|---|---|
| pnpm turbo run build --concurrency=2 --filter=@jobguard/api... (pre-implementation) | 1 | 5/6 successful; API failed with absent SCIM modules/exports and test fixture type errors |
| pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/sso/scim.test.ts src/auth/sso/scim-paths.test.ts (failed-first) | 1 | 2 failed suites, zero tests; absent scim.application.js |
| pnpm typecheck | 0 | 7/7 tasks successful, 4 cached |
| LANE_BASE_REF=origin/main pnpm lint | 1 | core purity passed (132 files), then lane refusal below; later lint stages did not run |
| LANE_BASE_REF=origin/main pnpm lint:lanes | 1 | same lane refusal |
| pnpm turbo run build --concurrency=2 --filter=@jobguard/api... | 0 | 6/6 tasks successful, 2 cached |
| pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/sso/scim.test.ts src/auth/sso/scim-paths.test.ts | 1 | 97 passed, 2 failed; missing-mode fixture default and normalized trailing-header fixture |
| same unit command after fixture repair | 0 | 99/99 passed, 2 files |
| pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/context-boundary.test.ts | 0 | 145/145 passed, 1 unedited file |
| pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts (generation) | 0 | regenerated OpenAPI |
| pnpm build | 0 | 7/7 tasks successful, 2 cached; production Next route listed; after final newline-boundary repair |
| pnpm openapi:check | 1 | known tsx IPC listen EPERM below |
| pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts (issued fallback) | 0 | regenerated without IPC server |
| pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check (issued fallback) | 0 | exact generated OpenAPI matches |
| same two-file unit command after final newline-boundary repair | 0 | 102/102 passed, 2 files |
| git diff --check | 0 | no whitespace errors |

Lane error verbatim: `Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.` HEAD and origin/main are the same commit in this dispatcher-managed uncommitted worktree. No check was weakened or re-pointed. A read-only comparison of changed/untracked paths to the exact issued lane returned zero violations; this is not presented as a passed lint command. Dispatcher must run real lint and lint:lanes after commit.

OpenAPI error verbatim: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/44831.pipe`; syscall listen, errno -1, address that pipe. The only alternate invocation used was the order's expressly supplied node --import tsx fallback.

A read-only process diagnostic `ps -eo pid,ppid,etime,command | rg 'pnpm|turbo|vitest'` was refused: `zsh:1: operation not permitted: ps` (exit 1). That diagnostic stopped; no alternate process-listing attempt was made. Turbo emitted `WARNING IO error: Operation not permitted (os error 1)` for its shared cache, but the recorded successful compiler/build tasks completed; no cache permission workaround was attempted. Next also reported its existing multi-lockfile root and CSS autoprefixer/cache-serialization warnings. No merged style/config was edited.

Tests-first evidence: lane was the first edit; new unit tests, D3 and D4 were authored before production files; D1/D2 files and fixture were established before production, but their full substantive case expansion and historical-fixture strengthening overlapped implementation. Therefore a strictly serial per-case tests-first history for D1/D2 is NOT claimed. Every final criterion has an authored test; no database run was attempted.

## NOT RUN list for Mac helper / GitHub CI

Every line here is **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Use heavy-slot, --maxWorkers=2, no more than three files per invocation, one local helper slot as the dispatcher permits.

1. Database run 1: test/scim-deactivation.integration.test.ts test/scim-deactivation-access.integration.test.ts test/scim-deactivation-concurrency.integration.test.ts (20, 15 and 6 authored cases, not observed runtime counts).
2. Database run 2: test/scim-deactivation-upgrade.integration.test.ts test/enterprise-identity.integration.test.ts test/sso-required.integration.test.ts.
3. Database run 3: test/identity.integration.test.ts test/sso-emergency.integration.test.ts test/sso-emergency-concurrency.integration.test.ts.
4. Database run 4: test/contractor.integration.test.ts.
5. Unit regression run 1: src/auth/sso/action-paths.test.ts src/auth/sso/sso-required.test.ts src/auth/sso/sso-required-paths.test.ts (not executed because the sandbox order permits only new units plus X1; these files are unchanged).
6. Unit regression run 2: src/auth/identity.test.ts (same command restriction).
7. packages/core/src/contractor.test.ts, the pure permission conformance companion: not executed under the issued file restriction; remains mandatory in CI.
8. pnpm test:db and pnpm test:migrations/full mandatory PostgreSQL suites: prohibited in sandbox; mandatory CI evidence pending. pnpm test/full suite was not invoked. No browser suite applies to a new screen (UI parked); existing journeys remain unedited and mandatory in CI. Native M5-7 paths are HELD because no native app exists.

No AI model/prompt/extraction/matching change: eval is inapplicable. No install was run, so no clean pinned-install reproduction is claimed.

## Changes, exact registrations and unchanged evidence

[REGISTRATION_DIFF.patch](REGISTRATION_DIFF.patch) contains the exact zero-context additions/removals for every changed existing file. The ten changed existing files are: lane registry (one compact line after ent-10a); migrate (one final numeric entry); db index (one export); MIGRATIONS (one section); app module (import, one controller and one provider); workspace application (three required imports, exactly one new scim constructor line after unchanged ssoRequired line and one returned scim property); workspace index (two exports); OpenAPI (one new path, all 89 old paths deeply equal base); data-flow (one appended section); enterprise identity contract (only the two issued stale sentences corrected). BUILD_PLAN ledger is integrator-only and untouched.

[UNCHANGED_SHA256.tsv](UNCHANGED_SHA256.tsv) records base/current SHA-256 of 609 unchanged tracked files, including every byte-identical hard-limit file, all existing migrations, every existing test, all web pages/components and other routes, packages/config, tooling, CI, package manifests, lockfile, scanner and its eight pinned practice files. All equal. These are receipt artifacts, not permanent byte-pinning tests.

| scanner/pinned file | SHA-256 (base = working tree) |
|---|---|
| apps/api/src/auth/context-boundary.test.ts | d082694df3dc005461d92ac79f275f31525d35c3e022948b47efa0ed7f9a772f |
| packages/db/src/practice-session.ts | 9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14 |
| packages/db/src/contractor-repository.ts | 56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c |
| packages/db/src/contractor-party-repository.ts | e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0 |
| packages/db/src/work-order-repository.ts | 4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3 |
| packages/db/src/sor-repository.ts | 45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5 |
| packages/db/src/job-scheduling-repository.ts | ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d |
| packages/db/src/work-order-fixtures.ts | cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386 |
| packages/db/src/contractor-session-context.ts | a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c |

Changed and new files (including receipt artifacts):

- `apps/api/openapi.json`
- `apps/api/src/app.module.ts`
- `apps/api/src/auth/sso/scim-paths.test.ts`
- `apps/api/src/auth/sso/scim.application.ts`
- `apps/api/src/auth/sso/scim.contracts.ts`
- `apps/api/src/auth/sso/scim.controller.ts`
- `apps/api/src/auth/sso/scim.test.ts`
- `apps/api/src/workspace/application.ts`
- `apps/api/src/workspace/index.ts`
- `apps/web/app/api/auth/scim/[connectionId]/deactivations/route.ts`
- `config/agent-lane-assignments.json`
- `docs/contracts/enterprise-identity-v1.md`
- `docs/contracts/scim-deactivation-v1.md`
- `docs/operations/sso-data-flow.md`
- `docs/verdicts/ENT-10a2/BUILDER_RECEIPT.md`
- `docs/verdicts/ENT-10a2/REGISTRATION_DIFF.patch`
- `docs/verdicts/ENT-10a2/UNCHANGED_SHA256.tsv`
- `packages/db/MIGRATIONS.md`
- `packages/db/migrations/0137_scim_deactivation.sql`
- `packages/db/src/index.ts`
- `packages/db/src/migrate.ts`
- `packages/db/src/scim-repository.ts`
- `packages/db/test/scim-deactivation-access.integration.test.ts`
- `packages/db/test/scim-deactivation-concurrency.integration.test.ts`
- `packages/db/test/scim-deactivation-upgrade.integration.test.ts`
- `packages/db/test/scim-deactivation.integration.test.ts`
- `packages/db/test/scim-fixtures.ts`


## Ten stated limits (adopted, unchanged)

1. Checks completed before commit may allow that in-flight request to finish; checks starting after commit refuse.
2. Repository transaction forces audit atomicity, not a database-only audit gate; identity credential remains the sign-in/provider trust boundary.
3. Failed record/commit means no deactivation and HTTP 503; provider retries.
4. One-way; mistaken deactivation requires a new invitation membership while SSO is OFF. Old provider link remains; re-link later.
5. SSO OFF permits the owner's new or up-to-one-day-earlier unused emailed-code invitation to create a new membership. SSO ON closes it. Ben's card decision/follow-up waits for ENT-10e.
6. Unknown subjects have no future first-sign-in block.
7. Ordinary sessions remain valid for other companies and empty for the removed one.
8. No route rate limit; each unproved request creates one global refusal. Bearer strength 256 bits.
9. Nest framework malformed-JSON 400 can happen before controller; caller bytes alone cause it. Next sends sentinel through service and unproved caller receives public refusal.
10. One seed derives all connections; its holder can act for every synthetic connection. Live stored/rotatable per-connection authority is HELD.

## HELD and later list / integrator cards

Real provider SCIM and D04/G5: HELD, founder-reserved. SCIM 2.0 wire protocol (/Users, /Groups, PATCH, filters, paging, configuration/error format), provisioning/updating/group push, stored/rotatable per-connection credentials, issuance screens/commands and rate limits belong to that live piece. Reactivation and any revocation clearing: HELD. Owner deactivation/ownership transfer: not built under adopted Q2; card for Ben to confirm/change owner protection. Synthetic JSON and one-way behavior: revisit with live provider as adopted Q4(d/e). Emailed-code re-admission and first-sign-in unknown-subject block: need separate merged-gate work; invitation card after ENT-10e. Re-link: ENT-10a LATER 13. OIDC and native: HELD/later. Every screen: parked, plain event types may appear in existing list; one UI FIX-LATER line for integrator. Notifications: not built (nothing sent). Database-enforced audit requirement: not built under limit 2. Contractor membership.revoke mismatch: FIX-LATER before commercial modules open to real sign-ins; no edit here.

ENT-10e shares append-only registry/migrate/docs/composition/OpenAPI registrations. Whichever merges second needs the dispatcher's single union catch-up. This routine replaces none of its seven routines and cannot overwrite those SQL definitions. Migration renumber at landing belongs to dispatcher (SQL bytes unchanged). Two independent RED verdicts (fresh Opus plus separate Sol after CI) and separate acceptance remain pending; delegated test authors are implementation collaborators, not independent reviewers.

## Self-review

Re-read the complete working diff and new files against the issued scope. Confirmed every criterion has its ID in the assigned file; model output cannot express a role/tenant/action beyond the strict body; no merged gate or test changed; all company data reads explicitly scoped; target memberships are row-locked under the company lock; no extra lock after audit; exactly two one-way updates and the two permitted record/revocation inserts; no caller time or reset; no application table grant; explicit new routine EXECUTE only; one global refusal before proof; no raw subject/header/seed SQL/log/record; paired strict results; atomic audit and replay branches; tenant/session/grant preservation assertions; owner whole-message refusal; rule-9 upgrade comparisons and controls; no credential literals, excluded wording or new byte-freezing test; exact registration scope. 609 unchanged hashes and all 89 existing OpenAPI paths were checked against base. Read-only path/lane comparison found no violations. git diff --check passed.

Repairs during this pass: fixed test fixture's undefined-mode default; supplied exact adapter-visible values for whitespace cases and documented Fetch normalization; tightened end-anchor acceptance to refuse final newlines; added newline seed/header tests; strengthened D1 unchanged invitation/switch/history rows and D2 unaffected-person positives, and aligned generated fixture roles/pools. Cleanup removed the launcher-created .pnpm-store, workspace package/API dist, Next .next, task .turbo logs and generated web tsbuildinfo; no build output or test-results remains. No merged check was weakened. Strict serial D1/D2 tests-first history, committed-range lint, database execution and independent verification remain explicitly unclaimed.

Builder receipt only — not independently verified, not accepted.

## Mac verification (13 Oct)

Mac-side helper (Claude Sonnet 5.5), 13 Oct 2026. Not a review, not a verdict, no code changed beyond merging main. Logs: `~/.local/share/full-steam/jg-runs/ent-10a2-mac/`.

**Result: RED. Five database tests fail (36 of 41 in run 1 pass). All five are in this piece's own new tests/fixtures. Every merged test and every other required check passed. Nothing pushed.**

**Merges.** `origin/main` moved twice while this ran. Two plain merge commits: `dfc4f9c` "Merge main (f7fdc1c) into ENT-10a2" and then `57e3f5e` "Merge main (d38fbc5) into ENT-10a2" (d38fbc5 added CH-7-TERMS, migration 0134). Conflicts were only in append-only registrations (`apps/api/src/app.module.ts`, `apps/api/src/workspace/application.ts`, `apps/api/src/workspace/index.ts`, `packages/db/src/index.ts`, `packages/db/src/migrate.ts`, `packages/db/MIGRATIONS.md`); both sides kept, main's lines first. `apps/api/openapi.json` was not hand-merged: main's file taken, regenerated with `pnpm openapi:generate`, `pnpm openapi:check` passes (67 lines added, 0 removed against main). `migrate.ts` now ends 0131, 0132, 0134, 0137. `git diff origin/main --stat` shows only this piece's 27 files. Merge-base for the tested tree: origin/main d38fbc5.

| step | command (via heavy-slot, one file group at a time) | exit | count |
|---|---|---|---|
| build | core, db, storage, config, ai each alone, then api (twice: after each merge) | 0 | all built |
| lint:lanes | `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Lane boundary passed, 27 files |
| DB run 1 | scim-deactivation, scim-deactivation-access, scim-deactivation-concurrency | 1 | 36 passed, 5 failed (41). First attempt exit 1 was only the embedded PostgreSQL dylib problem (no tests ran); fixed by `scripts/hydrate-symlinks.js` in the `@embedded-postgres/darwin-arm64` package folder, then re-run |
| DB run 2 | scim-deactivation-upgrade, enterprise-identity, sso-required | 0 | 37 passed |
| DB run 3 | identity, sso-emergency, sso-emergency-concurrency | 0 | 17 passed |
| DB run 4 | contractor | 0 | 19 passed |
| unit run 5 | action-paths, sso-required, sso-required-paths | 0 | 42 passed |
| unit run 6 | identity.test.ts | 0 | 6 passed |
| item 7 | packages/core `src/contractor.test.ts` | 0 | 725 passed |
| scanner | `src/auth/context-boundary.test.ts` (unedited) | 0 | 145 passed |
| api units, apps/api/dist moved aside | `scim.test.ts`, `scim-paths.test.ts`, `src/watchdog-registry.test.ts` | 0 | 55 + 47 (= 102) + 121 = 223 passed |
| `pnpm test:migrations` | tenancy + demo-bootstrap | 0 | 13 passed |
| `pnpm typecheck` | | 0 | 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | | 0 | 7/7 tasks, lane boundary passed |
| `pnpm openapi:check` | | 0 | matches |

**Compiled-output check (CI order: typecheck, lint, test, then build).** `apps/api/dist` was moved aside outside the worktree (to `~/.local/share/full-steam/jg-runs/ent-10a2-mac/aside/`, then restored, nothing deleted); `apps/web/.next` did not exist in this worktree. The three api test files above passed with both absent. Nothing in `scim.test.ts`, `scim-paths.test.ts`, the watchdog registry test or the scim database tests imports a compiled output; the Next route is read as source text. (`@jobguard/*` package `dist` folders remain present, as in CI where `test` depends on `^build`.) The extra-unlink note: this piece does not change grants; its own D1 test makes only a read_only grant through `grant.create` (not an owner grant).

**Quoted results by test ID.**
- [U1] PASS: scim-deactivation-upgrade: "applies only N over populated identity history, preserves every pre-existing object at N, then later migrations twice and rolled-back comparison controls".
- [B1] PASS, [B2] PASS, [B3] FAIL, [B4] PASS (owner refused whole), [B5] PASS, [B6] PASS, [B7] PASS ("owned source has exactly two one-way UPDATE statements and active true never re-enables").
- [G1] PASS, [G2] PASS, [G3] PASS, [G4] PASS (all seven roles), [G5] PASS, [G6] FAIL, [G7] FAIL (required-ON case; the "removing the only re-admitted unlinked person" case PASSES), [G8] PASS.
- [H1] PASS, [H2] PASS (3 cases), [H3] PASS, [H4] PASS. [K1] PASS. [T1] ordinary PASS / bound-and-ordinary FAIL, [T2] PASS, [T3] PASS, [T4] PASS. [R1] to [R6] all PASS. [A3] FAIL.

**The five failures (first assertion, expected vs actual; owner).**
1. [B3] `scim-deactivation.integration.test.ts:96`: expected the code request to be accepted, got `AuthError RATE_LIMITED` thrown at `apps/api/src/auth/persisted-auth-provider.ts:33` (merged rule: same email and purpose within 60 s). Owner: builder test (the fixture helper `person()` at `packages/db/test/scim-fixtures.ts:87` already requested a signin code for that same address moments earlier in the same test; no clock advance in between).
2. [G6] `scim-deactivation-access.integration.test.ts:84`: same `RATE_LIMITED`. Owner: builder test.
3. [G7] `scim-deactivation-access.integration.test.ts:96`: same `RATE_LIMITED`. Owner: builder test.
4. [A3] `scim-deactivation.integration.test.ts:66` (the `migrate(alternate)` call): expected the second database to migrate, got an empty-credential authentication error (SQLSTATE 28P01) because `new Pool({...h.admin.options,database})` does not carry the fixture login. Owner: builder test/fixture (`scim-fixtures.ts` pool settings).
5. [T1] bound-and-ordinary `scim-deactivation.integration.test.ts:132`: `ZodError unrecognized_keys ["sessionId"]` from `apps/api/src/auth/principal-bridge.ts:19` (strict credentials schema). Owner: builder test (passes `otherBound` with an extra `sessionId` key to `identityApp.context`).
None involves the migration or product code; the migration-level tests (K1, U1, B1, B4, B7, G1 to G5, G8, H1 to H4, R1 to R6, T2 to T4) pass.

**GRANT and REVOKE statements in `0137_scim_deactivation.sql` (verbatim, all three):**
- line 30: `REVOKE ALL ON identity.scim_event FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_identity;`
- line 97: `REVOKE ALL ON FUNCTION identity.scim_deactivate(uuid,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_identity;`
- line 98: `GRANT EXECUTE ON FUNCTION identity.scim_deactivate(uuid,jsonb) TO jobguard_identity;`
No INSERT, UPDATE or DELETE grant to `jobguard_runtime` (or anyone) on money, membership, authorization, receipt or audit tables; the only writes to membership, session and grant-revocation rows are the checked routine's, and the only new privilege is EXECUTE on that routine for `jobguard_identity`.

## Repair round 1 (13 Oct): five Mac-found test/fixture defects, built by Claude, Codex unavailable

Built by a Claude Sonnet 5.5 builder (Codex unavailable), dispatched by the Claude session "JobGuard dispatcher, Monday". Not a review and not a verdict. Order: `ENT-10a2-r1-test-repair.txt`. Tests and fixtures only: no migration byte, no product code, no merged file, no other test, no scanner/list edit. Edited files: `packages/db/test/scim-fixtures.ts`, `packages/db/test/scim-deactivation.integration.test.ts` (and this receipt). `scim-deactivation-access.integration.test.ts` needed no edit (its two failures came from the shared fixture). No assertion was weakened, skipped, deleted or reworded; the test-side diff is 2 changed lines and 2 added lines, all listed below. Logs: `~/.local/share/full-steam/jg-runs/ent-10a2-repair1/`.

### The five defects and their fixes

**1. [B3] `scim-deactivation.integration.test.ts:96`, 2. [G6] `scim-deactivation-access.integration.test.ts:84`, 3. [G7] `scim-deactivation-access.integration.test.ts:96` (one cause, one fix, in `scim-fixtures.ts`).** Cause: the fixture helper `person()` asks for a sign-in code for the new person's address (to make the person's ordinary code session), then each test asks for a second sign-in code for the same address within the same second; the merged auth provider (`persisted-auth-provider.ts:33`) refuses a second request for the same address and purpose inside 60 seconds (`RATE_LIMITED`). Fix: at the end of `person()`, as the table owner, move that stored first request 61 seconds into the past, the table-owner way merged identity tests already move time (those tests advance an injected clock by 60001 ms; this harness's provider uses the real clock, so the stored time is moved instead).
- Before: nothing between `scim-fixtures.ts:88` (`const ordinary...`) and the `return`.
- After (new lines 89 and 90):
  - ` // Table-owner set-up, as merged identity tests advance their clock: age this stored sign-in request past the merged 60-second same-address cooldown, so a later request a test makes for this address is a real, otherwise-allowed one.`
  - ` await f.h.admin.query("UPDATE identity.challenge SET requested_at=requested_at-interval '61 seconds',expires_at=expires_at-interval '61 seconds' WHERE email=$1 AND purpose='signin'",[email]);`
- Why set-up only: it runs inside the fixture, after the person's own code has been verified and consumed, and before any test body; it touches only that address's earlier sign-in challenge row (`expires_at` moves with `requested_at`, so the table's `expires_at>requested_at` check still holds). The merged auth provider, the 60-second rule and every assertion are unchanged; the request each test makes ([B3] `toMatchObject({accepted:true})`, [G6] and [G7] code request then `verifyCode`) is now a real request the provider would allow after a minute, and it is still made without any clock change, so the tests still prove what their titles say (a deactivated person's NEW code request is accepted, signs in as an ordinary session, and lists no membership). No scim test expects `RATE_LIMITED`, so no other test depends on the old timing.

**4. [A3] `scim-deactivation.integration.test.ts:65`** (the `migrate(alternate)` call failed with an empty-password error from the second database's pool). Cause: `pg` keeps the pool's `password` option non-enumerable, so `{...h.admin.options,...}` drops it (the same note sits in `audit-export.integration.test.ts` at the line that copies `runtime.options.password`; `sso-required.integration.test.ts:182` builds its second pool the same way with an explicit password). Fix: copy it explicitly from the fixture's own admin pool; no new credential text is written.
- Before: `  const alternate=new Pool({...h.admin.options,database:"jobguard_scim_other"});`
- After: `  const alternate=new Pool({...h.admin.options,password:h.admin.options.password,database:"jobguard_scim_other"});`
- Why set-up only: it changes only how the second database's connection is opened; every statement and assertion after it ("route blocked" on the other database, event count unchanged) is untouched.

**5. [T1] bound-and-ordinary case, `scim-deactivation.integration.test.ts:132`** (`ZodError unrecognized_keys ["sessionId"]` from the strict credentials schema in `principal-bridge.ts`). Cause: `seedBinding()` returns `{sessionId,sessionToken,csrfToken,origin}` and the test spread all of it into `identityApp.context`, whose schema allows only `sessionToken`, `requestedTenantId`, `tenantHeader`, `csrfToken` and `origin`. Fix: pass exactly the allowed keys from the same object. `otherBound.sessionId` is still used where it belongs (the `identity.session` row snapshots on lines 129 and 130).
- Before (the changed call, rest of the line identical): `(await h.identityApp.context({...otherBound,requestedTenantId:b.principal.tenantId})).tenantId`
- After: `(await h.identityApp.context({sessionToken:otherBound.sessionToken,csrfToken:otherBound.csrfToken,origin:otherBound.origin,requestedTenantId:b.principal.tenantId})).tenantId`
- Why set-up only: the expectation (`.tenantId` equals the other company's id, i.e. a person bound to the other company keeps that company's access after deactivation here) is unchanged; only the shape of the credentials object handed in is corrected to what the merged schema accepts.

### Run table (13 Oct, Mac; every run through `heavy-slot` with at most two slots, database files `--maxWorkers=1`, three files per run at most)

| step | command | exit | count |
|---|---|---|---|
| dist check | each of core, db, storage, config, ai, api: any `src` file newer than the newest `dist` file? | n/a | none newer in any of the six, so no rebuild was needed (nothing under `src` changed in this round) |
| (a) run 1 | `scim-deactivation`, `scim-deactivation-access`, `scim-deactivation-concurrency` | 0 | 41 passed, 0 failed |
| (a) run 2 | same three files | 0 | 41 passed, 0 failed |
| (a) run 3 | same three files | 0 | 41 passed, 0 failed |
| (b) group 1 | `scim-deactivation-upgrade`, `enterprise-identity`, `sso-required` | 0 | 37 passed |
| (b) group 2 | `identity`, `sso-emergency`, `sso-emergency-concurrency` | 0 | 17 passed |
| (c) `pnpm typecheck` | | 0 | 7/7 tasks |
| (c) `LANE_BASE_REF=origin/main pnpm lint` | | 0 | 7/7 tasks; core purity, lane boundary (27 files) and money arithmetic boundary all passed |
| (c) edited test files type-checked | scratch `tsconfig` (outside the repository) extending the root `tsconfig.json`, `noEmit`, files: `scim-fixtures.ts`, `scim-deactivation.integration.test.ts`, `scim-deactivation-access.integration.test.ts`, run with the db package's `tsc` | 0 | no diagnostics (the three files plus `scim-repository.ts` confirmed in the file list) |

The embedded PostgreSQL started first time (no `hydrate-symlinks.js` run was needed). The migration, the product code and every merged file are byte-identical to the head this round started from (`36f42dd`); `git diff --stat` for this round shows only the two test/fixture files and this receipt.
