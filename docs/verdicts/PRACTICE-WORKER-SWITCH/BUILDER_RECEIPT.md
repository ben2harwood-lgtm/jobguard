Built by Codex; dispatched 13 Oct 2026; continuation round 2 on 15 Oct 2026.

# PRACTICE-WORKER-SWITCH — backend builder receipt

Builder receipt only — not independently verified, not accepted.

Actual builder is Codex. The addendum's Sonnet attribution is not used as a false
authorship claim. The first-round receipt is preserved unchanged as
`BUILDER_RECEIPT.round1.md`. This receipt supersedes its HELD backend status and
its S1/S2/S3/S4 STOPs under the explicit continuation rulings. No commit or push.

Base: `6671538c8d69936c162368c760dd6ce0f7f10493`. Final existing HEAD: `5245b01bbafce460b06300b062cfe9290f1796de`.
Branch: `codex/sandbox/practice-worker-switch`. New backend changes are uncommitted for
the dispatcher. These hashes identify the issued base and prior partial commit,
not a commit containing this continuation.

## Result and remaining STOP

Backend source is built: migration 0165 and registration; two private tables; ten
routines; five refusal triggers on existing tables; hardened lookup composition;
repository with atomic audit and refusal records; one application, Nest controller
and three Next routes. Decision 39's operative, surveyor, supervisor and client
(`client_approver`) are permitted. No UI or browser spec is part of this piece.

**STOP O1: OpenAPI generation.** Exact refused command, exit 1:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/jg-pws-bin:$PATH"
pnpm --filter @jobguard/api openapi:generate
```

Refusal: `Error: listen EPERM: operation not permitted` on the TSX IPC pipe under
the supplied temporary directory. The CLI failed before running the generator.
`apps/api/package.json:71` before and after is exactly
`"openapi:generate": "tsx src/generate-openapi.ts",`.
`apps/api/src/generate-openapi.ts:8` before and after is exactly
`const app = await NestFactory.create(AppModule, { logger: false });`.
Line 7 before it declares `output`; line 9 after it serializes `configureOpenApi`.
No alternate execution route or manual OpenAPI patch was attempted after refusal.
`apps/api/openapi.json` is unchanged and lacks these three routes; dispatcher must
run the normal generator and `pnpm openapi:check`. The check is NOT RUN here because
it uses that same refused TSX IPC mechanism. This is a sandbox refusal, not an
automatic approval-review rejection.

**Partial PW19 at the Nest edge, main wins:** merged
`apps/api/src/auth/application-auth.guard.ts:16` returns the guard's 401 before the
controller in non-demo modes. Its exact line is unchanged:

```ts
    }catch(error){const {code}=identityStatus(error);if(code==="TENANT_FORBIDDEN"||code==="ORIGIN_FORBIDDEN")throw new ForbiddenException({code});throw new UnauthorizedException({code:"UNAUTHENTICATED"});}
```

Before line 15 is the existing identity-context call; after line 17 is the comment
about synthetic projections. No change is proposed to this protected source or
its tests. The application and Next edge return MODE_FORBIDDEN/403, with no DB
access. H records the actual guard 401. If 403 at this Nest edge remains mandatory,
that is a coordinator-owned guard/contract prerequisite; this piece cannot assert
that acceptance. No earlier assertion is weakened.

## Checks actually run

Cached installed pnpm 10.28.1 was found at
`~/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. A temporary launcher at
`/private/tmp/jg-pws-bin/pnpm` executes it with Node. Every subsequent pnpm command
first exports the required `$HOME/Library/pnpm/bin` path, then prepends this local
launcher. No dependency was downloaded or installed; no package or runtime pin
changed. Node observed v24.17.0. The normal pnpm entrypoint reported 11.8.0 outside
the repository, and stalled inside it; interrupted probes are recorded below.

Every heavy shell first ran `memory_pressure | tail -1` and
`df -g /System/Volumes/Data` (exit 0): observed free memory 47–60%, disk 58–64 GB.
No database or browser run, process inspection, server, socket, or whole suite was
attempted. Tests were serial, at most three files, maxWorkers=2. Build and tests
never overlapped.

| Command (with PATH prefix above) | Exit | Observed result |
| --- | --- | --- |
| `pnpm exec turbo run typecheck --force` | 0 | 7 tasks successful, 0 cached |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0 | 7 tasks successful, 0 cached |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0 | purity, lane boundary, money arithmetic checks passed |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | practice-worker-switch lane passed, including working-tree paths |
| `pnpm build --concurrency=2 --force` | 0 | 7 tasks successful, 0 cached; Next routes compiled |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/practice-worker-switch.test.ts` | 0 | 1 file, 69 passed |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/practice-worker-switch.application.test.ts` | 0 | 1 file, 17 passed |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 app/api/contractor/practice/acting-as/route.test.ts app/api/contractor/practice/acting-as/end/route.test.ts 'app/api/contractor/practice/workers/[workerId]/acting-as/route.test.ts'` | 0 | 3 files, 32 passed |
| `./node_modules/.bin/vitest run --maxWorkers=2 src/auth/context-boundary.test.ts` in apps/api | 0 | unchanged scanner, 1 file, 145 passed |
| `./node_modules/.bin/tsc -p /private/tmp/jg-pws-db-test-types.json` | 0 | own four DB files and fixture typechecked, no DB execution |
| `pnpm --filter @jobguard/api openapi:generate` | 1 | STOP O1 above |
| `git diff --check` | 0 | no whitespace errors |

Forced-check logs are copied into this receipt directory as CONTINUATION_*.log.
Turbo printed cache IO permission warnings, but all tasks executed and exited 0;
no warning is represented as a skipped task. Next printed existing stylesheet and
workspace-root warnings. The final database-test typecheck also passed after the expanded company/clock
controls; the last team-move, identity-mismatch and resolver-outcome cases were
added afterward and remain source-inspected. The DB suites remain NOT RUN. The root typecheck/lint/build
all preceded that final SQL-only tightening; no database verification is inferred
from them.

Earlier continuation diagnostics, separate from the final checks:

- First API Vitest invocation (local binary, maxWorkers=2), exit 1: 1 suite failed,
  0 tests. Workspace @jobguard/db dist was missing. Its initial test file was
  inadvertently created below apps/api/apps/api and moved to its allowed path;
  no other file was overwritten. This was a dependency/setup failure, not proof
  that the intended feature assertion failed.
- First web invocation (same three own files), exit 1: 3 suites failed, 0 tests;
  @jobguard/core dist was missing. No first assertion failure is invented.
- Sequential prerequisite compilations: core, storage, config passed; db first
  returned exit 2 for cross-version Zod `.extend` type expansion. I changed the
  new repository to validate the target envelope separately from the existing
  command schema. Subsequent db, ai and API compilations exited 0.
- Local API unit run after implementation, exit 0: 11 tests; later strengthened
  final run above is 17. Local web run after implementation, exit 0: 32 tests;
  final rerun above also 32 after runtime-generated fixture session values.
- `pnpm --version`, environment and flag variants inside the repository each
  stalled and were interrupted (130). `pnpm --version` from /private/tmp exited
  0 with 11.8.0. The installed 9.0.0 version probe exited 0; its `exec turbo
  --version` probe eventually exited 0 with 2.10.12. No validation pass used that
  older manager. Cached 10.28.1 `pnpm --version` exited 0.

Main DB test files were written before migration/repository implementation. Later
coverage was added while inspecting the implementation. The HTTP spec was written
after the controller, not falsely labelled a demonstrated first failure. The
schema suite's first-failure evidence is preserved in round 1. All DB-first runs
are NOT RUN under the dispatch environment.

## NOT RUN and acceptance accounting

- `packages/db/test/practice-worker-switch.integration.test.ts` (D1): cannot start PostgreSQL here.
- `packages/db/test/practice-worker-switch-proof.integration.test.ts` (D2): cannot start PostgreSQL here.
- `packages/db/test/practice-worker-switch-upgrade.integration.test.ts` (D3): cannot start PostgreSQL here.
- `packages/db/test/practice-company-marker.integration.test.ts` (D4): cannot start PostgreSQL here.
- `apps/api/src/contractor/practice-worker-switch.http.test.ts` (H): real Nest/supertest pipeline needs a socket; unavailable here.
- PW29 merged DB/migration-driving suites: dispatcher/CI only; no whole-suite run.
- Browser journey: not built in this piece, assigned to ENT-11a; browser unavailable.
- `pnpm openapi:check`: STOP O1, not a pass.

P = core, U = application, W = the three web-handler files. The table below states
BUILT source/test scope; it does not claim every detailed assertion has executed.
Where a large acceptance paragraph is only represented in part, that is partial.
No placeholder test stands in for PW29 or the unchanged scanner.

| ID | Source/test evidence and status |
| --- | --- |
| PW1 | BUILT D1 four-role start/end, fixed window, database bounds, marker acquired/present, audit chain and xmin; NOT RUN |
| PW2 | BUILT D1 merged scheduling/organisation reads and unchanged authority rows; NOT RUN; exhaustive global-table snapshots remain partial |
| PW3 | BUILT D1 unchanged session; W no cookie; U/W strict output; H NOT RUN |
| PW4 | BUILT D1 open refusal, D2 all non-owner session-role controls; NOT RUN; owner/grant revocation, track and second-session variants are included |
| PW5 | BUILT D1 owner/office/revoked/wider/foreign target refusals; decision 39 allows surveyor/client; NOT RUN |
| PW6 | BUILT D1 foreign context/target, independent company; D2 runtime ACL; NOT RUN; unstamped/missing context coverage uses merged stamp invariant |
| PW7 | BUILT D1 exact named replay/conflict tests, old replay leaves newer switch; NOT RUN |
| PW8 | BUILT D1 unclosed expiry/end/restart, D2 window/environment CHECK; NOT RUN |
| PW9 | BUILT D1 ended and home-ended while acting; U/W one closed failure; H NOT RUN |
| PW10 | BUILT D1 routine/audit/commit fault injection and lock observer, D2 missing audit rollback; NOT RUN |
| PW11 | BUILT D1 duplicate/different commands, cross-session opposite commands, merged tenant-lock races, concurrent session revoke and end; NOT RUN |
| PW12 | BUILT D3 canonical-text differential, actual fields/types, side-by-side hardened copy, no-active-switch classes; NOT RUN; merged resolver and startPractice outcomes are also compared before/after N |
| PW13 | BUILT D1 tenant invariant, D2 direct foreign/office/owner target guards; NOT RUN; full all-triggers-off foreign-member journey remains partial |
| PW14 | BUILT D2 marker/switch mismatch/time controls plus PW30/31/34; NOT RUN; some deliberately invalid row combinations remain partial |
| PW15 | BUILT D4 sign-in roots, marker authority/time/immutability; NOT RUN; the ten named RC/V variants are included |
| PW16 | BUILT D4 owner/superuser roots, repointing, SSO trigger, open/ended; NOT RUN; product invitation and SSO administration refusal controls are included |
| PW17 | BUILT D2 FK, CHECK, immutable history, missing decision answer, no-audit and runtime controls; NOT RUN |
| PW18 | BUILT D2 fully migrated second database and mode-first refusals; NOT RUN; hand-written second-database session variants remain partial |
| PW19 | BUILT U/W all six modes, passed; H preserves merged 401 rather than draft 403, NOT RUN; partial as explained above |
| PW20 | BUILT D1/D2 wrong sessions/settings/foreign target, U/W ignored authority; NOT RUN DB; complete draft RC/V group remains partial |
| PW21 | BUILT P all authority fields (passed), U exact actor/stamped bridge/body rejection (passed), W thin forwarding (passed) |
| PW22 | BUILT D1 refusal dedupe and target omission; NOT RUN; refusal-audit-failure control remains partial |
| PW23 | BUILT strict internal/public schemas and diagnostic stripping U/W (passed), D1 catalogue scan and D4 values (NOT RUN); whole used-value set remains partial |
| PW24 | BUILT status/origin/JSON/path U/W (passed), H real framework/guard cases NOT RUN |
| PW25 | BUILT D2 ownership/flags/execute/constraint catalogue, D3 before/after write privileges; NOT RUN |
| PW26 | BUILT D3 named pre-existing columns/types/original identities, all fifteen tables populated, own migration delta then later migrations twice, rolled-back controls; NOT RUN |
| PW27 | BUILT D3 hardened rollback + separate feature-off/end/state, U privilege refusal (passed); DB NOT RUN |
| PW28 | unchanged boundary scanner executed, 145 passed; scanner and eight source hashes equal issued base |
| PW29 | NOT RUN, dispatcher/CI runs all mandatory merged suites; no acceptance claimed |
| PW30 | BUILT D1 named fresh-read/isolation/clock/strict-expiry cases and D3 source at N; NOT RUN |
| PW31 | BUILT D4 named root cases P1–P24 including one per S1 extra path; NOT RUN; P16 onward prove root implications, not complete emergency/invitation workflow executions |
| PW32 | BUILT D1 role grant/refusal/revocation and both lock orders, D2 unacted member control; NOT RUN; exhaustive team-move matrix remains partial |
| PW33 | BUILT D4 actual hand-built company with/without sign-in, no runtime session-table access; D3 migration marks nobody; NOT RUN |
| PW34 | BUILT D3 three answers and helper failures with/without switch; NOT RUN; ended-session × none/current/ended switch matrix is included |
| PW-F1 | HELD separate tests-only follow-up (QL no), unchanged |

Conditions (a)–(f): (a) PW12 D3 differential; (b) PW13 D1/D2 company/target;
(c) PW14/30/31/34 lookup; (d) PW15/16 D4 marker and refusal; (e) PW20 negative
controls (partial detailed matrix); (f) PW27 D3 plus the two statements below.
All database portions are written/unexecuted, not independently verified.

## Six base checks and current-main reconciliation

1. The hardened helper exists in 0138; called, not replaced. Its current body is
   reproduced in the first-round receipt and unchanged here.
2. 0138 is registered at migrate.ts:79; base ends at 0158, not 0138. New 0165 is
   appended in increasing numeric order. No test asserts it is last forever.
3. Before this piece, no practice switch/marker objects existed. Migration acquires
   no marker and changes no existing row.
4. Existing bridge, repository and merged startBeforeMigration/applyMigration,
   digestOf, expired/home-ended fixtures are imported unchanged.
5. Lookup on base is exactly the hardened statement below; new lookup calls its
   helper and preserves the signature/owner/ACL by CREATE OR REPLACE only.
6. Main's 0143 and 0150 extra writers are P16–P24, reconciled under S1. Old P9
   impossibility is withdrawn: 0143 drops the held rule and implements owner
   approval/windows. Those paths still use current_memberships/locator and the
   existing connection/sign-in roots. 0150's six writers use address, locator and
   invitation roots. The three operator commands add no existing-company sign-in
   root. No source is pinned by a new test. No change to their source is proposed.

Main wins over every stale draft citation. Current source locations: 0143 emergency
rule change :3, window :8, use replacement :126; 0150 writers :51/:58/:75/:78/:80/:117;
base migration registration through 0158 :92; current hardening lane :144 and
practice-worker-switch :145. The reviewed statements differ from the draft's old
base, not from the issued base SHA. S2 moves screens/browser spec to ENT-11a; S3
was not hit because this existing HEAD differs from base and lane lint ran; S4 no
process inspection was repeated.

## Seven RED questions — builder source inspection only

1. **Can a path work for a company that is not made-up, or change company?** The
   normal checked path cannot acquire a marker with any sign-in root (company
   rule packages/db/migrations/0165_practice_worker_switch.sql:41); lookup always
   selects the helper's tenant (packages/db/migrations/0165_practice_worker_switch.sql:284). The
   deliberate-owner limits remain: hand-built no-sign-in companies are eligible,
   triggers can be disabled, and office-member later sign-ins have the approved
   lookup limit. This is not a claim against a privileged rewrite. D2/D4 NOT RUN.
2. **Can it lend grants?** It writes no grant. Target rule
   packages/db/migrations/0165_practice_worker_switch.sql:67 and trigger
   packages/db/migrations/0165_practice_worker_switch.sql:274 use the
   four-role decision-39 allowlist; existing scope/client constraints still judge
   every action. All named grants remain the worker's own; privileged disabling
   is outside the checked path. DB authority proof NOT RUN.
3. **Can an unauthenticated/wrongly authenticated caller discover the target?**
   Application authenticates at application.ts:22 before body/path; routines check
   persisted live session and tenant before target eligibility; caller-only
   refusal takes precedence. U passed; DB/HTTP matrix NOT RUN.
4. **Can it extend/revive a session?** No new source writes any session row. The
   helper is the sole live-session test. Switching neither extends nor revives a
   session. D1 session/home-end proofs NOT RUN.
5. **Can a new refusal trigger affect an unmarked company?** It returns NEW for
   a company with no marker and a person never acted as
   (packages/db/migrations/0165_practice_worker_switch.sql:255). An identity
   user shared by hand with an already-acted-as member retains its permanent
   identity refusal, as documented. No broad claim about privileged hand links.
6. **Can a running switch survive a later sign-in?** For locator/invitation roots
   and owner/worker address/session roots, the next lookup no longer honours it
   (packages/db/migrations/0165_practice_worker_switch.sql:284); P16–P24 use these roots. A deliberately
   written SSO connection with triggers off, or a later office-only address/session,
   is the explicit approved limit (P4/P5/P7/P8/P12/P14/P19 variants). A new start
   rechecks all members. Every corresponding DB assertion is NOT RUN.
7. **Can grants outside the permitted roles appear while acting; can the trigger
   affect unacted members?** The new trigger refuses roles outside decision 39's
   four on current switches, leaves unacted members alone and serializes with
   product grant writers via tenant key 54. It writes no grant itself. D1/D2 tests
   are NOT RUN. No protection against deliberately disabled triggers is claimed.

## Objects, grants, lock order and rollback

Exactly one existing function replaced, with unchanged owner and privileges;
exactly four triggers added to four existing identity tables and one to
app.role_grant; no column, index, constraint, policy or grant on any existing table;
nothing on control_plane.contractor_practice_session except incoming foreign keys;
no existing object dropped. This is source-inspected, not a database catalogue
result. New objects and ten signatures/flags are described in the contract and
fully defined in migration 0165 (appended below).

New GRANT lines, one each; standard F gives no new runtime table access and no new
write privilege on any existing money, membership, authorization, receipt or audit
table. The three routines derive their actor from the persisted session and check
that session's authority themselves:

```sql
GRANT EXECUTE ON FUNCTION app.practice_worker_switch_on(uuid,uuid,uuid) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.practice_worker_switch_off(uuid,uuid) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.practice_worker_switch_state(uuid) TO jobguard_runtime;
```

Existing advisory seeds found on main: 0, 54, 55, 56, 126, 130, 144, 145, 417,
3101, 3102, plus two-hash legacy keys. Chosen new seeds: 16501 (session reference)
and 16502 (command). On/off order: shared tenant 54, session 16501, command 16502,
row/FK changes, audit head last. Refusal: command 16502, membership reads, audit
head last. State/lookup have no lock. Neither new table stores a session value or
digest. No money table, routine or figure is read or written.

Rollback statement 1 restores the hardened lookup; routes still record switches,
state says unclosed, no session acts:

```sql
CREATE OR REPLACE FUNCTION app.contractor_session(s uuid) RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT l.tenant_id,l.membership_id,l.identity_user_id FROM app.contractor_practice_session_live(s) l $$;
```

Rollback statement 2 disables new starts for runtime; end/state remain callable:

```sql
REVOKE EXECUTE ON FUNCTION app.practice_worker_switch_on(uuid,uuid,uuid) FROM jobguard_runtime;
```

Both tables, permanent markers and five refusal triggers stay. Removing refusals
would be these five additional statements, NOT performed or part of this rollback:

```sql
DROP TRIGGER made_up_company_no_sign_in ON identity.membership_locator;
DROP TRIGGER made_up_company_no_sign_in ON identity.invitation;
DROP TRIGGER made_up_company_no_sign_in ON identity.sso_connection;
DROP TRIGGER made_up_company_no_sign_in ON identity.user_email;
DROP TRIGGER made_up_worker_no_wider_grant ON app.role_grant;
```

The full old/new lookup text, all definitions, P1–P24 set/attach/lookup sides, all
sixteen limits and HELD items are in `docs/contracts/practice-worker-switch-v1.md`.
The S1 tests bind P16 onward by name to each added path's root. Root-level tests
are not represented as live identity integrations.

## ENT-11a handoff

Use `createPracticeWorkerSwitchApplication({ pool }).start(principal, workerId, raw)`
or POST `/api/contractor/practice/workers/{workerMembershipId}/acting-as` for each
of operative, surveyor, supervisor, client_approver. Body is exactly
`{ version: "practice-worker-switch-on.v1", commandId: uuid }`. The database
checks that existing membership; do not fabricate a principal or grant. Return:
strict practice-worker-switch-state.v1, environment synthetic_demo,
realExternalActions 0, state acting, switchId, workerMembershipId, six-digit UTC
startedAt/expiresAt, endedAt/endReason null. End with the off body and read current
state via `/api/contractor/practice/acting-as`. Start replay is historical; only GET
is current. No cookie write. End before switching to another role. Screens and
browser journey are outside this backend piece under S2.

## Self-review and evidence

I inspected the complete tracked diff and every new file, the exact lookup text,
security flags, explicit grants, audit order and role/session constraints. I fixed
cross-version Zod expansion; generated fixture session values at runtime; corrected
finance fixture scope and real-session environment; made a direct-owner foreign
target test bind the target identity so RLS cannot turn its INSERT into zero rows;
added rolled-back malformed-decision coverage and strict cardinality refusals.
A broad edit briefly affected the merged session-revoke web test; its exact line
was restored. No merged test differs from base or HEAD now. No scanner, pinned
source, watchdog file, shared harness, migration, policy, package or plan changed.

The retained public schemas are the round-1 implementation. Existing registration
edits are append-only exports, one migration entry and controller registration;
OpenAPI remains untouched under O1. The generated lane evidence includes untracked
files, which tracked `git diff --stat` omits. Hashes for the scanner and its eight
pinned files are in CONTINUATION_SOURCE_EVIDENCE.json, all equal to issued base.
Source file manifests/diff hashes are receipts only, never standing test pins.
No build output or test-results path is added to Git; normal ignored outputs from
the required build remain. No delete/clean/reset/stash/process-inspection command
or git write occurred. No external communication, provider, spending, real data,
release, deploy, merge, push or acceptance action occurred.

Remaining gates: O1 generator/check; partial assertions explicitly listed above;
all four PostgreSQL suites and H; PW29 merged regressions; RED Opus + Sol verdicts
bound to the dispatcher's final commit; separate acceptance; ENT-11a browser/UI
rework and PW-F1 as their own pieces. Build output is not database verification.
No professional sign-off or live integration is claimed.

## Migration source for reviewer inspection

This is the current complete definition of both tables, all ten routines, guards,
indexes, trigger bindings, lookup and grants. It is source evidence, NOT RUN SQL.

```sql
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('app.contractor_practice_session_live(uuid)') IS NULL OR NOT EXISTS(
  SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid='control_plane.contractor_practice_session'::regclass AND a.attname='session_digest' AND NOT a.attisdropped)
 THEN RAISE EXCEPTION 'PRACTICE_WORKER_SWITCH_NEEDS_SESSION_HARDENING'; END IF;
END $$;

CREATE TABLE control_plane.practice_company_marker (
 tenant_id uuid PRIMARY KEY REFERENCES control_plane.tenant(id),
 session_ref uuid NOT NULL UNIQUE REFERENCES control_plane.contractor_practice_session(session_id),
 owner_membership_id uuid NOT NULL, owner_identity_user_id uuid NOT NULL UNIQUE,
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'), marked_at timestamptz NOT NULL,
 FOREIGN KEY(tenant_id,owner_membership_id,owner_identity_user_id) REFERENCES app.membership(tenant_id,id,identity_user_id),
 UNIQUE(tenant_id,session_ref,owner_membership_id)
);
ALTER TABLE control_plane.practice_company_marker OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.practice_company_marker FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TABLE control_plane.practice_worker_switch (
 id uuid PRIMARY KEY, session_ref uuid NOT NULL REFERENCES control_plane.contractor_practice_session(session_id),
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), owner_membership_id uuid NOT NULL,
 worker_membership_id uuid NOT NULL, worker_identity_user_id uuid NOT NULL,
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'), command_id uuid NOT NULL UNIQUE,
 started_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 ended_at timestamptz, end_reason text, end_command_id uuid UNIQUE, end_event_id uuid UNIQUE,
 FOREIGN KEY(tenant_id,session_ref,owner_membership_id) REFERENCES control_plane.practice_company_marker(tenant_id,session_ref,owner_membership_id),
 FOREIGN KEY(tenant_id,worker_membership_id,worker_identity_user_id) REFERENCES app.membership(tenant_id,id,identity_user_id),
 FOREIGN KEY(tenant_id,worker_membership_id) REFERENCES app.contractor_member(tenant_id,membership_id),
 CHECK(owner_membership_id<>worker_membership_id), CHECK(expires_at=started_at+interval '30 minutes'),
 CHECK((ended_at IS NULL AND end_reason IS NULL AND end_command_id IS NULL AND end_event_id IS NULL)
  OR (ended_at IS NOT NULL AND end_reason IS NOT NULL AND end_reason IN('switched_back','expired') AND end_command_id IS NOT NULL AND end_event_id IS NOT NULL)),
 CHECK(ended_at IS NULL OR (ended_at>=started_at AND ended_at<=expires_at)),
 CHECK(end_reason IS DISTINCT FROM 'expired' OR ended_at=expires_at),
 CHECK(end_reason IS DISTINCT FROM 'switched_back' OR ended_at<expires_at)
);
ALTER TABLE control_plane.practice_worker_switch OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.practice_worker_switch FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE UNIQUE INDEX practice_worker_switch_one_open ON control_plane.practice_worker_switch(session_ref) WHERE ended_at IS NULL;
CREATE INDEX practice_worker_switch_user ON control_plane.practice_worker_switch(worker_identity_user_id);
CREATE INDEX practice_worker_switch_open_member ON control_plane.practice_worker_switch(tenant_id,worker_membership_id) WHERE ended_at IS NULL;

CREATE FUNCTION app.practice_company_made_up(p_session_ref uuid)
 RETURNS TABLE(verdict text,reason_code text,company uuid,owner_member uuid,owner_user uuid)
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE t uuid; own record;
BEGIN
 verdict:='forbidden'; reason_code:='mode';
 IF current_database()<>'jobguard_synthetic_demo' THEN RETURN NEXT; RETURN; END IF;
 reason_code:='session';
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RETURN NEXT; RETURN; END;
 IF t IS NULL OR p_session_ref IS NULL THEN RETURN NEXT; RETURN; END IF;
 SELECT s.tenant_id,s.membership_id,s.identity_user_id INTO own FROM control_plane.contractor_practice_session s WHERE s.session_id=p_session_ref;
 IF NOT FOUND OR own.tenant_id IS DISTINCT FROM t THEN RETURN NEXT; RETURN; END IF;
 reason_code:='owner';
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=own.membership_id AND m.identity_user_id=own.identity_user_id AND m.role='owner'
  AND app.contractor_member_active(m.id) AND app.contractor_allowed(m.id,'organisation.manage',t)) THEN RETURN NEXT; RETURN; END IF;
 reason_code:='company_has_sign_in';
 IF EXISTS(SELECT 1 FROM identity.membership_locator l WHERE l.tenant_id=t)
 OR EXISTS(SELECT 1 FROM identity.invitation i WHERE i.tenant_id=t)
 OR EXISTS(SELECT 1 FROM identity.sso_connection s WHERE s.tenant_id=t)
 OR EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND (
  EXISTS(SELECT 1 FROM identity.user_email e WHERE e.user_id=m.identity_user_id)
  OR EXISTS(SELECT 1 FROM identity.session s WHERE s.user_id=m.identity_user_id))) THEN RETURN NEXT; RETURN; END IF;
 verdict:='made_up'; reason_code:='made_up'; company:=t; owner_member:=own.membership_id; owner_user:=own.identity_user_id; RETURN NEXT;
END $$;

CREATE FUNCTION app.practice_worker_switch_decision(p_session_ref uuid,p_worker uuid)
 RETURNS TABLE(decision text,reason_code text,company uuid,owner_member uuid,owner_user uuid,worker_user uuid)
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE rule record; member_user uuid;
BEGIN
 BEGIN SELECT * INTO STRICT rule FROM app.practice_company_made_up(p_session_ref);
 EXCEPTION WHEN no_data_found OR too_many_rows THEN
  decision:='forbidden'; reason_code:='unexpected'; RETURN NEXT; RETURN;
 END;
 decision:='forbidden'; reason_code:=rule.reason_code;
 IF rule.verdict IS DISTINCT FROM 'made_up' THEN RETURN NEXT; RETURN; END IF;
 company:=rule.company; owner_member:=rule.owner_member; owner_user:=rule.owner_user;
 decision:='not_found'; reason_code:='worker';
 SELECT m.identity_user_id INTO member_user FROM app.membership m
 WHERE m.tenant_id=rule.company AND m.id=p_worker AND m.id<>rule.owner_member
 AND m.role IN('operative','supervisor','surveyor','client_approver') AND app.contractor_member_active(m.id)
 AND NOT EXISTS(SELECT 1 FROM app.role_grant g WHERE g.tenant_id=rule.company AND g.membership_id=m.id
  AND g.role NOT IN('operative','supervisor','surveyor','client_approver')
  AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE r.tenant_id=rule.company AND r.grant_id=g.id))
 AND NOT EXISTS(SELECT 1 FROM identity.user_email e WHERE e.user_id=m.identity_user_id)
 AND NOT EXISTS(SELECT 1 FROM identity.membership_locator l WHERE l.user_id=m.identity_user_id)
 AND NOT EXISTS(SELECT 1 FROM identity.session s WHERE s.user_id=m.identity_user_id);
 IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
 decision:='allowed'; reason_code:='allowed'; worker_user:=member_user; RETURN NEXT;
END $$;

CREATE FUNCTION app.practice_worker_switch_on(p_session uuid,p_command uuid,p_worker uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; live record; rule record; saved control_plane.practice_worker_switch; marker control_plane.practice_company_marker; reading timestamptz; replay boolean:=false;
BEGIN

 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_session IS NULL OR p_command IS NULL OR p_worker IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END;
 SELECT * INTO live FROM app.contractor_practice_session_live(p_session);
 IF NOT FOUND OR t IS NULL OR t IS DISTINCT FROM live.tenant_id THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;

 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(live.session_ref::text,16501));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command::text,16502));

 SELECT * INTO saved FROM control_plane.practice_worker_switch s WHERE s.command_id=p_command OR s.end_command_id=p_command;
 IF FOUND THEN
  IF saved.command_id=p_command AND saved.session_ref=live.session_ref AND saved.worker_membership_id=p_worker THEN
   replay:=true; SELECT * INTO marker FROM control_plane.practice_company_marker k WHERE k.tenant_id=t;
   RETURN jsonb_build_object('switch',saved.id,'session',saved.session_ref,'owner',saved.owner_membership_id,'worker',saved.worker_membership_id,
 'startedAt',to_char(saved.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'expiresAt',to_char(saved.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'marker',(CASE WHEN saved.started_at=marker.marked_at THEN 'acquired' ELSE 'present' END),'state','acting','replayed',replay);
  END IF;
  RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505';
 END IF;
 BEGIN SELECT * INTO STRICT rule FROM app.practice_worker_switch_decision(live.session_ref,p_worker);
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END;
 IF rule.decision IS NULL OR rule.decision NOT IN('allowed','not_found') THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO marker FROM control_plane.practice_company_marker k WHERE k.tenant_id=t;
 IF FOUND AND (marker.session_ref IS DISTINCT FROM live.session_ref OR marker.owner_membership_id IS DISTINCT FROM live.membership_id OR marker.owner_identity_user_id IS DISTINCT FROM live.identity_user_id)
 THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM control_plane.practice_worker_switch s WHERE s.session_ref=live.session_ref AND s.ended_at IS NULL)
 THEN RAISE EXCEPTION 'SWITCH_OPEN' USING ERRCODE='55000'; END IF;
 IF rule.decision='not_found' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 reading:=clock_timestamp();
 IF marker.tenant_id IS NULL THEN
  INSERT INTO control_plane.practice_company_marker(tenant_id,session_ref,owner_membership_id,owner_identity_user_id,marked_at)
   VALUES(rule.company,live.session_ref,rule.owner_member,rule.owner_user,reading) RETURNING * INTO marker;
 END IF;
 INSERT INTO control_plane.practice_worker_switch(id,session_ref,tenant_id,owner_membership_id,worker_membership_id,worker_identity_user_id,command_id,started_at,expires_at)
 VALUES(gen_random_uuid(),live.session_ref,rule.company,rule.owner_member,p_worker,rule.worker_user,p_command,reading,reading+interval '30 minutes') RETURNING * INTO saved;
 RETURN jsonb_build_object('switch',saved.id,'session',saved.session_ref,'owner',saved.owner_membership_id,'worker',saved.worker_membership_id,
 'startedAt',to_char(saved.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'expiresAt',to_char(saved.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'marker',(CASE WHEN saved.started_at=marker.marked_at THEN 'acquired' ELSE 'present' END),'state','acting','replayed',replay);
END $$;

CREATE FUNCTION app.practice_worker_switch_off(p_session uuid,p_command uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; live record; saved control_plane.practice_worker_switch; reading timestamptz; replay boolean:=false;
BEGIN

 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_session IS NULL OR p_command IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END;
 SELECT * INTO live FROM app.contractor_practice_session_live(p_session);
 IF NOT FOUND OR t IS NULL OR t IS DISTINCT FROM live.tenant_id THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;

 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(live.session_ref::text,16501));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command::text,16502));

 SELECT * INTO saved FROM control_plane.practice_worker_switch s WHERE s.command_id=p_command OR s.end_command_id=p_command;
 IF FOUND THEN
  IF saved.end_command_id=p_command AND saved.session_ref=live.session_ref THEN replay:=true; RETURN jsonb_build_object('switch',saved.id,'session',saved.session_ref,'owner',saved.owner_membership_id,'worker',saved.worker_membership_id,
 'endedAt',to_char(saved.ended_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'endReason',saved.end_reason,'endEvent',saved.end_event_id,'state','owner','replayed',replay); END IF;
  RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505';
 END IF;
 SELECT * INTO saved FROM control_plane.practice_worker_switch s WHERE s.session_ref=live.session_ref AND s.ended_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ACTING' USING ERRCODE='55000'; END IF;
 reading:=clock_timestamp();
 UPDATE control_plane.practice_worker_switch s SET ended_at=least(reading,s.expires_at),
  end_reason=(CASE WHEN reading<s.expires_at THEN 'switched_back' ELSE 'expired' END),end_command_id=p_command,end_event_id=gen_random_uuid()
 WHERE s.id=saved.id RETURNING * INTO saved;
 RETURN jsonb_build_object('switch',saved.id,'session',saved.session_ref,'owner',saved.owner_membership_id,'worker',saved.worker_membership_id,
 'endedAt',to_char(saved.ended_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'endReason',saved.end_reason,'endEvent',saved.end_event_id,'state','owner','replayed',replay);
END $$;

CREATE FUNCTION app.practice_worker_switch_state(p_session uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; live record; saved control_plane.practice_worker_switch; answer text:='owner';
BEGIN

 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;

 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END;
 SELECT * INTO live FROM app.contractor_practice_session_live(p_session);
 IF NOT FOUND OR t IS NULL OR t IS DISTINCT FROM live.tenant_id THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;

 SELECT * INTO saved FROM control_plane.practice_worker_switch s WHERE s.session_ref=live.session_ref AND s.ended_at IS NULL;
 IF FOUND THEN
  answer:='unclosed';
  IF EXISTS(SELECT 1 FROM app.contractor_session(p_session) l WHERE l.tenant_id=t AND l.membership_id=saved.worker_membership_id) THEN answer:='acting'; END IF;
 END IF;
 RETURN jsonb_build_object('state',answer,'switch',saved.id,'worker',saved.worker_membership_id,
 'startedAt',to_char(saved.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'expiresAt',to_char(saved.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

CREATE FUNCTION app.practice_company_marker_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE rule record;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'PRACTICE_MARKER_IMMUTABLE' USING ERRCODE='55000'; END IF;
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN SELECT * INTO STRICT rule FROM app.practice_company_made_up(NEW.session_ref);
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'PRACTICE_MARKER_FORBIDDEN' USING ERRCODE='42501'; END;
 IF rule.verdict IS DISTINCT FROM 'made_up' OR rule.company IS DISTINCT FROM NEW.tenant_id OR rule.owner_member IS DISTINCT FROM NEW.owner_membership_id
 OR rule.owner_user IS DISTINCT FROM NEW.owner_identity_user_id OR NEW.marked_at IS NULL OR NEW.marked_at<transaction_timestamp() OR NEW.marked_at>clock_timestamp()
 THEN RAISE EXCEPTION 'PRACTICE_MARKER_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER practice_company_marker_guard BEFORE INSERT OR UPDATE OR DELETE ON control_plane.practice_company_marker FOR EACH ROW EXECUTE FUNCTION app.practice_company_marker_guard();
CREATE TRIGGER practice_company_marker_no_truncate BEFORE TRUNCATE ON control_plane.practice_company_marker FOR EACH STATEMENT EXECUTE FUNCTION app.practice_company_marker_guard();

CREATE FUNCTION app.practice_worker_switch_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE rule record;
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'SWITCH_RECORD_IMMUTABLE' USING ERRCODE='55000'; END IF;
 IF TG_OP='INSERT' THEN
  IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  BEGIN SELECT * INTO STRICT rule FROM app.practice_worker_switch_decision(NEW.session_ref,NEW.worker_membership_id);
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END;
  IF rule.decision IS DISTINCT FROM 'allowed' OR rule.company IS DISTINCT FROM NEW.tenant_id OR rule.owner_member IS DISTINCT FROM NEW.owner_membership_id
   OR rule.worker_user IS DISTINCT FROM NEW.worker_identity_user_id OR NEW.ended_at IS NOT NULL OR NEW.end_reason IS NOT NULL OR NEW.end_command_id IS NOT NULL OR NEW.end_event_id IS NOT NULL
   OR NEW.started_at IS NULL OR NEW.started_at<transaction_timestamp() OR NEW.started_at>clock_timestamp()
  THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSIF TG_OP='UPDATE' THEN
  IF OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL
   OR (to_jsonb(NEW)-ARRAY['ended_at','end_reason','end_command_id','end_event_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['ended_at','end_reason','end_command_id','end_event_id'])
   OR (CASE WHEN NEW.end_reason='switched_back' THEN NEW.ended_at<transaction_timestamp() OR NEW.ended_at>clock_timestamp()
    WHEN NEW.end_reason='expired' THEN NEW.ended_at IS DISTINCT FROM OLD.expires_at OR clock_timestamp()<OLD.expires_at ELSE true END)
  THEN RAISE EXCEPTION 'SWITCH_RECORD_IMMUTABLE' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER practice_worker_switch_guard BEFORE INSERT OR UPDATE OR DELETE ON control_plane.practice_worker_switch FOR EACH ROW EXECUTE FUNCTION app.practice_worker_switch_guard();
CREATE TRIGGER practice_worker_switch_no_truncate BEFORE TRUNCATE ON control_plane.practice_worker_switch FOR EACH STATEMENT EXECUTE FUNCTION app.practice_worker_switch_guard();

CREATE FUNCTION app.practice_worker_switch_require_audit() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM app.audit_event a WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.id AND a.event_type='practice.worker_switch.started'
   AND a.subject_type='practice-worker-switch' AND a.subject_ref=NEW.id::text AND a.actor_ref='membership:'||NEW.owner_membership_id::text
   AND (a.payload->'references'->>'worker')=NEW.worker_membership_id::text)
  THEN RAISE EXCEPTION 'SWITCH_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSIF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM app.audit_event a WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.end_event_id AND a.event_type='practice.worker_switch.ended'
   AND a.subject_type='practice-worker-switch' AND a.subject_ref=NEW.id::text AND a.actor_ref='membership:'||NEW.owner_membership_id::text
   AND (a.payload->'references'->>'reason')=NEW.end_reason)
  THEN RAISE EXCEPTION 'SWITCH_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER practice_worker_switch_require_audit AFTER INSERT OR UPDATE ON control_plane.practice_worker_switch DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.practice_worker_switch_require_audit();

CREATE FUNCTION app.practice_company_refuse_sign_in() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_SCHEMA<>'identity' THEN RAISE EXCEPTION 'PRACTICE_SIGN_IN_TRIGGER_INVALID'; END IF;
 IF TG_TABLE_NAME IN('membership_locator','invitation','sso_connection') THEN
  IF EXISTS(SELECT 1 FROM control_plane.practice_company_marker k WHERE k.tenant_id=NEW.tenant_id)
  THEN RAISE EXCEPTION 'PRACTICE_COMPANY_SIGN_IN_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='user_email' THEN
  IF EXISTS(SELECT 1 FROM control_plane.practice_company_marker k WHERE k.owner_identity_user_id=NEW.user_id)
   OR EXISTS(SELECT 1 FROM control_plane.practice_worker_switch s WHERE s.worker_identity_user_id=NEW.user_id)
  THEN RAISE EXCEPTION 'PRACTICE_COMPANY_SIGN_IN_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE RAISE EXCEPTION 'PRACTICE_SIGN_IN_TRIGGER_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER made_up_company_no_sign_in BEFORE INSERT OR UPDATE ON identity.membership_locator FOR EACH ROW EXECUTE FUNCTION app.practice_company_refuse_sign_in();
CREATE TRIGGER made_up_company_no_sign_in BEFORE INSERT ON identity.invitation FOR EACH ROW EXECUTE FUNCTION app.practice_company_refuse_sign_in();
CREATE TRIGGER made_up_company_no_sign_in BEFORE INSERT ON identity.sso_connection FOR EACH ROW EXECUTE FUNCTION app.practice_company_refuse_sign_in();
CREATE TRIGGER made_up_company_no_sign_in BEFORE INSERT OR UPDATE ON identity.user_email FOR EACH ROW EXECUTE FUNCTION app.practice_company_refuse_sign_in();

CREATE FUNCTION app.practice_worker_refuse_wider_grant() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.role NOT IN('operative','supervisor','surveyor','client_approver') AND EXISTS(
  SELECT 1 FROM control_plane.practice_worker_switch s WHERE s.tenant_id=NEW.tenant_id AND s.worker_membership_id=NEW.membership_id AND s.ended_at IS NULL AND s.expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'PRACTICE_WORKER_GRANT_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER made_up_worker_no_wider_grant BEFORE INSERT ON app.role_grant FOR EACH ROW EXECUTE FUNCTION app.practice_worker_refuse_wider_grant();

CREATE OR REPLACE FUNCTION app.contractor_session(s uuid) RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT l.tenant_id, coalesce(a.worker_membership_id,l.membership_id), coalesce(a.worker_identity_user_id,l.identity_user_id) FROM app.contractor_practice_session_live(s) l LEFT JOIN (control_plane.practice_worker_switch a JOIN control_plane.practice_company_marker k ON k.tenant_id=a.tenant_id AND k.session_ref=a.session_ref AND k.owner_membership_id=a.owner_membership_id AND k.environment='synthetic_demo') ON a.session_ref=l.session_ref AND a.tenant_id=l.tenant_id AND a.owner_membership_id=l.membership_id AND k.owner_identity_user_id=l.identity_user_id AND a.environment='synthetic_demo' AND a.ended_at IS NULL AND a.started_at<=clock_timestamp() AND a.expires_at>clock_timestamp() AND current_database()='jobguard_synthetic_demo' AND current_setting('transaction_isolation')='read committed' AND NOT EXISTS(SELECT 1 FROM identity.membership_locator ml WHERE ml.tenant_id=l.tenant_id) AND NOT EXISTS(SELECT 1 FROM identity.invitation iv WHERE iv.tenant_id=l.tenant_id) AND NOT EXISTS(SELECT 1 FROM identity.user_email ue WHERE ue.user_id IN(l.identity_user_id,a.worker_identity_user_id)) AND NOT EXISTS(SELECT 1 FROM identity.session rs WHERE rs.user_id IN(l.identity_user_id,a.worker_identity_user_id)) $$;
ALTER FUNCTION app.practice_company_made_up(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_company_made_up(uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_worker_switch_decision(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_worker_switch_decision(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_worker_switch_on(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_worker_switch_on(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_worker_switch_off(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_worker_switch_off(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_worker_switch_state(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_worker_switch_state(uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_company_marker_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_company_marker_guard() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_worker_switch_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_worker_switch_guard() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_worker_switch_require_audit() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_worker_switch_require_audit() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_company_refuse_sign_in() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_company_refuse_sign_in() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_worker_refuse_wider_grant() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_worker_refuse_wider_grant() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.practice_worker_switch_on(uuid,uuid,uuid) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.practice_worker_switch_off(uuid,uuid) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.practice_worker_switch_state(uuid) TO jobguard_runtime;
COMMIT;
```

## Main moved during continuation

The initial origin/main check matched the issued base. At final evidence capture,
origin/main had advanced to `8a6bde1c12fb48f4cccb4b18e60fb6614e8b5849`. The added main piece changes migration
runner transaction bookkeeping and outbox/its tests; it adds no migration or new
identity writer. The own registration remains an append after 0158. No catch-up,
merge, rebase, protected-test edit or other-piece repair was attempted. Catch-up
is integrator-owned under the order. All source manifests and invariant hashes
here are deliberately against the issued `6671538c8d69936c162368c760dd6ce0f7f10493`, and all checks ran in this
unchanged worktree. The first manifest attempt accidentally compared the newly
advanced ref, encountered main's added audit test absent here (FileNotFoundError,
exit 1 inside that Python snippet), and was corrected to the immutable issued
base. No file was restored or deleted to hide that difference.

Final packaging commands: receipt/evidence Python scripts exited 0 after the
explicit issued-base correction; `git diff --check` exited 0. The final advisory
search against the issued SHA exited 0, 146 lines and the eleven listed seeds;
output is CONTINUATION_ADVISORY_LOCKS.txt. The intended commit message is written
to /private/tmp/jg-msg-practice-worker-switch.txt. No git write was made.

## Repair r2

15 October 2026; dispatcher 11; PR #225; repair base/head `8c916ae2fcc0e661f1d85e6222ad267030d2d36d`. Built by Codex. This addendum supersedes earlier check status only where a new result is recorded below; it is builder evidence, not an independent verdict or acceptance. No Git write command, dependency installation, browser or PostgreSQL start was performed. Dispatcher owns commit/push and the real-database CI run.

### Failure coverage and scope

Read the entire supplied `pws-ci-fail.txt`. All listed failures trace to the same six unreviewed routine facts: LP0-10/11/12, LP0-17, “reports existing exceptions truthfully”, and LP0-01/02/03/04/05. The log ends during LP0-05; no unshown CI result is inferred. LP0-17 also compares every routine identity, including owner-only routines, so all ten new routine records are added. The existing guard, assertions and scanner remain unchanged.

Inventory changes are add-only: 28 added rows, zero removed or changed rows. Every existing parsed record, serialized line, hash, pin, base, target state, recorded note, RLS/policy list, gap and hold remains unchanged. No existing entry needed an amendment. Migration 0165, product source, OpenAPI and all existing tests are unchanged by this repair. No migration or runtime grant is introduced by this repair.

The only runtime powers inventoried for this feature are EXECUTE on the three checked session-authorized entry points, not table writes. They validate the hardened live practice session, compare tenant context and refuse outside the synthetic database; start checks the owner, company and worker. The private marker and switch tables revoke all runtime/PUBLIC/infrastructure access. The seven helper/trigger routines revoke runtime/PUBLIC/infrastructure EXECUTE. These source observations are not a real-database proof.

Both new tables are in `control_plane`; the RLS and ownership catalogs in `tenancy.integration.test.ts` explicitly select `n.nspname = 'app'`. No tenancy rows are required, so that file is unchanged. Their owner is also their schema owner and they have no non-owner grants, so the LP-0 fact derivation emits no table-owner/ACL capability facts for them. Adding those capability keys would create stale entries.

### Every added row

Group row: `a-exec-practice-worker-switch` (`identity`, `approved_current`, `rebind_at_card`). Authority-path row: `ap-practice-worker-switch`. Both assign LP-6a trusted practice identity, LP-6d actor/tenant binding and LP-12 ownership review, cite migration/repository sources and the four feature integration proofs, and retain the synthetic-only/real-data hold. Ownership entries use the existing `a-owner-routines` group.

Six capability rows (exact keys and groups):

```text
acl|routine|function:app.practice_worker_switch_off(uuid,uuid)|jobguard_runtime|EXECUTE|- -> a-exec-practice-worker-switch
acl|routine|function:app.practice_worker_switch_on(uuid,uuid,uuid)|jobguard_runtime|EXECUTE|- -> a-exec-practice-worker-switch
acl|routine|function:app.practice_worker_switch_state(uuid)|jobguard_runtime|EXECUTE|- -> a-exec-practice-worker-switch
owner|routine|function:app.practice_worker_switch_off(uuid,uuid)|jobguard_migration -> a-owner-routines
owner|routine|function:app.practice_worker_switch_on(uuid,uuid,uuid)|jobguard_migration -> a-owner-routines
owner|routine|function:app.practice_worker_switch_state(uuid)|jobguard_migration -> a-owner-routines
```

Ten recorded routine rows (all owner `jobguard_migration`, `search_path=pg_catalog`, no PUBLIC or other-role EXECUTE; only the three entry points have reachable/runtimeExecute true):

| Routine identity | SECURITY DEFINER | Trigger | New definition SHA-256 |
| --- | --- | --- | --- |
| `function:app.practice_company_made_up(uuid)` | false | false | `04f88a6a248d2392fd4087f48295d9060bd5a18be3fc5de35b74d525a7dde39b` |
| `function:app.practice_company_marker_guard()` | false | true | `2ab3a32eeee5d4e6936806b1b1711e108ef00c9fe96c8d01675d7fde35de6b8d` |
| `function:app.practice_company_refuse_sign_in()` | true | true | `c50330496f669a508b5cada8d8e82e4816ad26bb9097826a1a60bbf21de83b2c` |
| `function:app.practice_worker_refuse_wider_grant()` | true | true | `9b49b32e1306c45baae8733f0fbf3a1b3d6508d5ff8aa559266d596a4fdeb285` |
| `function:app.practice_worker_switch_decision(uuid,uuid)` | false | false | `a3bf1beefc0ba0c281318b0c4ced35d92a375dead4fc56ea114e9aefad5e5f93` |
| `function:app.practice_worker_switch_guard()` | false | true | `90931a157a954d2571c060e88f6d5bd7e8053f3e0bd7efa59f5ca2c5d0247553` |
| `function:app.practice_worker_switch_off(uuid,uuid)` | true | false | `2d67e7aed83a90695917064e19dda9fd101ed5d187e86ee86719dd7917756a67` |
| `function:app.practice_worker_switch_on(uuid,uuid,uuid)` | true | false | `a4b0c97c1a4058332a9f9d0b62ac7bd531161673407a09aa68e0ee56bad2e637` |
| `function:app.practice_worker_switch_require_audit()` | false | true | `b92f86bf465cc3400be9a464a881d2ec367474541119bfeb2bbc8d354c32156a` |
| `function:app.practice_worker_switch_state(uuid)` | true | false | `df0c6794c77b6e053da68838133191941e7a9c7a23f2aa7b4ee931a3bc447a8d` |

Hashes follow the existing source-derived recording method used by SV-7A: exact migration bodies with PostgreSQL `pg_get_functiondef` header formatting, SHA-256 over UTF-8. The same method reproduces the unchanged `contractor_session(uuid)` and `contractor_practice_session_guard()` hashes from migration 0138 exactly. This is a source-level control, not PostgreSQL execution. The actual unchanged static scanner also matches all ten new staticWrites/staticCalls records. LP0-13 hash comparison remains held; no existing contractor_session hash or scanner pin is updated.

Ten recorded trigger rows (exact facts; recorded, not a new protection comparator):

```text
app.role_grant|made_up_worker_no_wider_grant|app.practice_worker_refuse_wider_grant|BEFORE INSERT|O
control_plane.practice_company_marker|practice_company_marker_guard|app.practice_company_marker_guard|BEFORE INSERT/DELETE/UPDATE|O
control_plane.practice_company_marker|practice_company_marker_no_truncate|app.practice_company_marker_guard|BEFORE TRUNCATE|O
control_plane.practice_worker_switch|practice_worker_switch_guard|app.practice_worker_switch_guard|BEFORE INSERT/DELETE/UPDATE|O
control_plane.practice_worker_switch|practice_worker_switch_no_truncate|app.practice_worker_switch_guard|BEFORE TRUNCATE|O
control_plane.practice_worker_switch|practice_worker_switch_require_audit|app.practice_worker_switch_require_audit|AFTER INSERT/UPDATE|O
identity.invitation|made_up_company_no_sign_in|app.practice_company_refuse_sign_in|BEFORE INSERT|O
identity.membership_locator|made_up_company_no_sign_in|app.practice_company_refuse_sign_in|BEFORE INSERT/UPDATE|O
identity.sso_connection|made_up_company_no_sign_in|app.practice_company_refuse_sign_in|BEFORE INSERT|O
identity.user_email|made_up_company_no_sign_in|app.practice_company_refuse_sign_in|BEFORE INSERT/UPDATE|O
```

Two lane allow-list paths added with the Edit/apply_patch tool; every prior lane field and allowed path is preserved:

- `docs/contracts/lp-0-effective-privileges-v1.json`
- `packages/db/test/tenancy.integration.test.ts`

### Repair validation

Existing dependencies only: Node `v24.17.0`, cached pinned pnpm `10.28.1`. Commands use `PATH=/private/tmp/jg-pws-bin:$PATH`; that existing temporary launcher executes the installed cached pnpm through Node. Heavy typecheck/lint/build/unit checks run serially through `~/.local/bin/heavy-slot`. Logs are under `/private/tmp/pws-r2-*.log`. Final command results are appended below.

| Command (pinned PATH above; heavy-slot labels `pws-r2-*`) | Exit / observed result | Log suffix |
| --- | --- | --- |
| `~/.local/bin/heavy-slot pws-r2-typecheck pnpm typecheck --force` | 0; 7 tasks successful, 0 cached | `typecheck.log` |
| `LANE_BASE_REF=origin/main ~/.local/bin/heavy-slot pws-r2-lint pnpm lint --force` | 0; root checks and 7 tasks successful, 0 cached | `lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; practice-worker-switch lane passed | `lint-lanes.log` |
| `node --input-type=module` working-tree check using unchanged `selectLane`/`matches` and `git diff --name-only` | 0; all three edited paths allowed | `working-lane.log` |
| `~/.local/bin/heavy-slot pws-r2-build pnpm build --concurrency=2 --force` | 0; 7 tasks successful, 0 cached | `build.log` |
| `~/.local/bin/heavy-slot pws-r2-db-unit pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lp-0-catalog.test.ts` | 0; 26 passed | `db-unit.log` |
| `~/.local/bin/heavy-slot pws-r2-core-unit pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/practice-worker-switch.test.ts` | 0; 69 passed | `core-unit.log` |
| `~/.local/bin/heavy-slot pws-r2-api-unit pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/practice-worker-switch.application.test.ts src/auth/context-boundary.test.ts` | 0; 162 passed | `api-unit.log` |
| `~/.local/bin/heavy-slot pws-r2-web-unit pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 app/api/contractor/practice/acting-as/route.test.ts app/api/contractor/practice/acting-as/end/route.test.ts 'app/api/contractor/practice/workers/[workerId]/acting-as/route.test.ts'` | 0; 32 passed; no browser | `web-unit.log` |
| `pnpm openapi:check` | 1; TSX CLI IPC listener refused with `listen EPERM` before checking the artifact | `openapi.log` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; same generator/check through the Node loader, artifact unchanged | `openapi-node.log` |
| `pnpm --filter @jobguard/api exec node --import tsx /private/tmp/pws-r2-inventory-check.mts` | 0; strict inventory and path completeness, six repaired facts/dispositions, removal control, PUBLIC EXECUTE rejection controls, ten exact static scanner records and ten trigger records | `inventory-check.log` |
| Python source-hash check using the source-derived prefix of `/private/tmp/pws-r2-inventory.py` | 0; two existing control hashes reproduced, all ten new routine records/hashes match | `hashes.log` |
| `python3 /private/tmp/pws-r2-preservation.py` | 0; +28/-0 inventory lines; all original rows/hashes/pins preserved; exactly two lane paths added; tenancy unchanged | `preservation.log` |
| `git diff --check` | 0; no whitespace errors | terminal output |

Total: **289 targeted unit tests passed**, seven test files. Inventory after the repair: 1,133 capability entries, 55 groups, 33 paths, 307 routine records, 364 trigger records. The preservation check compares against read-only `git show HEAD:<path>` and proves every pre-existing inventory line and parsed record is unchanged, including historical measured hashes. It also checks all unrelated lanes/fields and every previous allowed path are unchanged.

The slot wrapper printed sandbox sysctl/sysmon/pgrep restrictions; successful commands still acquired slots and executed. Turbo printed existing cache IO warnings; all seven tasks executed for typecheck/lint/build and exited successfully. Next printed existing stylesheet, dynamic-dependency and workspace-root warnings. The standard OpenAPI failure is a sandbox socket restriction, not an automatic approval-review rejection; the successful Node-loader invocation checks the same committed generator/artifact without an IPC listener. The repair does not claim that the standard CLI command passed.

**Still owed:** dispatcher commit/push, real PostgreSQL CI for both LP-0 integration suites, tenancy and mandatory migration/regression/feature proofs, plus independent exact-commit RED verdicts and separate acceptance. The root `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and browser suites are not run here because their database/browser execution is unavailable or explicitly excluded. No new model/prompt/parser behavior requires an evaluation. No clean dependency reinstall, new external action, data migration, new alert, production rollout or release approval is claimed. Existing commercial/security/real-data gates and the earlier PW19 limitation remain.

Intended conventional commit message written to `/private/tmp/jg-msg-practice-worker-switch.txt` for the dispatcher. No staging, commit, checkout, push or other Git write command was run.
