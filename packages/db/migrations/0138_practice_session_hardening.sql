BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.contype='f' AND c.confrelid='control_plane.contractor_practice_session'::regclass) THEN
  RAISE EXCEPTION 'PRACTICE_SESSION_REKEY_UNSAFE';
 END IF;
END $$;

-- Canonical uuid text; NULL gives NULL. No application EXECUTE permission.
CREATE FUNCTION app.contractor_practice_session_digest(s uuid) RETURNS char(64)
 LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to(s::text,'UTF8')),'hex')::char(64)
$$;
ALTER FUNCTION app.contractor_practice_session_digest(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.contractor_practice_session_digest(uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

-- infinity: no home record; -infinity: ended home record; finite: live home deadline.
-- This helper reads the record only, takes no lock and writes nothing.
CREATE FUNCTION app.contractor_practice_home_deadline(d char(64), reading timestamptz) RETURNS timestamptz
 LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT CASE WHEN p.environment='synthetic_demo' AND p.revoked_at IS NULL AND p.expires_at>reading THEN p.expires_at ELSE '-infinity'::timestamptz END FROM control_plane.practice_session p WHERE p.token_digest=d),'infinity'::timestamptz)
$$;
ALTER FUNCTION app.contractor_practice_home_deadline(char,timestamptz) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.contractor_practice_home_deadline(char,timestamptz) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

ALTER TABLE control_plane.contractor_practice_session
 ADD COLUMN session_digest char(64), ADD COLUMN created_at timestamptz,
 ADD COLUMN expires_at timestamptz, ADD COLUMN revoked_at timestamptz;
UPDATE control_plane.contractor_practice_session x SET session_digest=c.digest, created_at=transaction_timestamp(), expires_at=CASE WHEN isfinite(c.home) THEN LEAST(c.home, transaction_timestamp()+interval '7 days') ELSE transaction_timestamp() END, session_id=gen_random_uuid() FROM (SELECT y.session_id AS raw_id, app.contractor_practice_session_digest(y.session_id) AS digest, app.contractor_practice_home_deadline(app.contractor_practice_session_digest(y.session_id), transaction_timestamp()) AS home FROM control_plane.contractor_practice_session y) c WHERE x.session_id=c.raw_id;
ALTER TABLE control_plane.contractor_practice_session
 ALTER COLUMN session_digest SET NOT NULL, ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN expires_at SET NOT NULL,
 ADD CONSTRAINT contractor_practice_session_digest_unique UNIQUE(session_digest),
 ADD CONSTRAINT contractor_practice_session_digest_valid CHECK(session_digest ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT contractor_practice_session_cap CHECK(expires_at >= created_at AND expires_at <= created_at + interval '7 days'),
 ADD CONSTRAINT contractor_practice_session_revoked_window CHECK(revoked_at IS NULL OR (revoked_at >= created_at AND revoked_at < expires_at));

-- VOLATILE by default: a plain read helper returning exactly ONE row or none.
-- One database clock reading binds both records; no membership/company rule.
CREATE FUNCTION app.contractor_practice_session_live(s uuid)
 RETURNS TABLE(session_ref uuid,tenant_id uuid,membership_id uuid,identity_user_id uuid)
 LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT x.session_id, x.tenant_id, x.membership_id, x.identity_user_id FROM control_plane.contractor_practice_session x CROSS JOIN (SELECT clock_timestamp() AS reading) c WHERE x.session_digest=app.contractor_practice_session_digest(s) AND x.revoked_at IS NULL AND x.expires_at>c.reading AND app.contractor_practice_home_deadline(x.session_digest,c.reading)>c.reading AND current_database()='jobguard_synthetic_demo'
$$;
ALTER FUNCTION app.contractor_practice_session_live(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.contractor_practice_session_live(uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

CREATE OR REPLACE FUNCTION app.contractor_session(s uuid) RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT l.tenant_id,l.membership_id,l.identity_user_id FROM app.contractor_practice_session_live(s) l $$;

CREATE FUNCTION app.revoke_contractor_practice_session(s uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE requested uuid; target control_plane.contractor_practice_session; reading timestamptz;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  requested:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN requested:=NULL;
 END;
 SELECT x.* INTO target FROM control_plane.contractor_practice_session x WHERE x.session_digest=app.contractor_practice_session_digest(s) FOR UPDATE;
 reading:=clock_timestamp();
 -- The only repetition of the row's live tests: store the exact reading tested.
 IF s IS NULL OR target.session_id IS NULL OR requested IS NULL OR requested IS DISTINCT FROM target.tenant_id
  OR target.revoked_at IS NOT NULL OR target.expires_at<=reading OR app.contractor_practice_home_deadline(target.session_digest,reading)<=reading
 THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 UPDATE control_plane.contractor_practice_session x SET revoked_at=reading WHERE x.session_id=target.session_id;
 RETURN jsonb_build_object('session',target.session_id,'member',target.membership_id,'revokedAt',to_char(reading AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;
ALTER FUNCTION app.revoke_contractor_practice_session(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.revoke_contractor_practice_session(uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.revoke_contractor_practice_session(uuid) TO jobguard_runtime;

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

CREATE FUNCTION app.contractor_practice_session_guard() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'PRACTICE_SESSION_IMMUTABLE' USING ERRCODE='55000'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revoked_at IS NOT NULL OR NEW.created_at<transaction_timestamp() OR NEW.created_at>clock_timestamp()
   OR NEW.expires_at>LEAST(app.contractor_practice_home_deadline(NEW.session_digest,NEW.created_at),NEW.created_at+interval '7 days')
  THEN RAISE EXCEPTION 'PRACTICE_SESSION_IMMUTABLE' USING ERRCODE='55000'; END IF;
 ELSE
  IF NEW.session_digest IS DISTINCT FROM OLD.session_digest OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
   OR (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at AND (OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR NEW.revoked_at<transaction_timestamp() OR NEW.revoked_at>clock_timestamp()))
  THEN RAISE EXCEPTION 'PRACTICE_SESSION_IMMUTABLE' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.contractor_practice_session_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.contractor_practice_session_guard() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER contractor_practice_session_guard BEFORE INSERT OR UPDATE OR DELETE ON control_plane.contractor_practice_session FOR EACH ROW EXECUTE FUNCTION app.contractor_practice_session_guard();
CREATE TRIGGER contractor_practice_session_truncate_guard BEFORE TRUNCATE ON control_plane.contractor_practice_session FOR EACH STATEMENT EXECUTE FUNCTION app.contractor_practice_session_guard();

CREATE FUNCTION app.contractor_practice_session_require_audit() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM app.audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.event_type='contractor.practice_session.revoked'
   AND e.subject_type='practice-session' AND e.subject_ref=NEW.session_id::text AND e.actor_ref='membership:'||NEW.membership_id
 ) THEN RAISE EXCEPTION 'PRACTICE_SESSION_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.contractor_practice_session_require_audit() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.contractor_practice_session_require_audit() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE CONSTRAINT TRIGGER contractor_practice_session_audit AFTER UPDATE ON control_plane.contractor_practice_session DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.contractor_practice_session_require_audit();

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

COMMIT;
