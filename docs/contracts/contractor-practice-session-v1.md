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
