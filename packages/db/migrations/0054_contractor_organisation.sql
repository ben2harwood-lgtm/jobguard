BEGIN;
-- Expand-only ENT-1. Track changes never rewrite existing jobs or commercial history.
CREATE TABLE app.commercial_track_assignment (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), commercial_track text NOT NULL CHECK(commercial_track IN('contractor','small_builder')),
 agreement_reference text NOT NULL CHECK(agreement_reference ~ '^synthetic-agreement:[0-9a-f-]{36}$'),
 environment text NOT NULL CHECK(environment='synthetic_demo'), actor_ref text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,revision)
);
CREATE TABLE app.org_unit (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), id uuid NOT NULL, kind text NOT NULL CHECK(kind IN('tenant','region','branch')),
 parent_id uuid, parent_kind text, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,id,kind), FOREIGN KEY(tenant_id,parent_id,parent_kind) REFERENCES app.org_unit(tenant_id,id,kind),
 CHECK((kind='tenant' AND parent_id IS NULL AND parent_kind IS NULL AND id=tenant_id) OR (kind='region' AND parent_id IS NOT NULL AND parent_kind='tenant') OR (kind='branch' AND parent_id IS NOT NULL AND parent_kind='region'))
);
CREATE TABLE app.team (
 tenant_id uuid NOT NULL, id uuid NOT NULL, branch_id uuid NOT NULL, branch_kind text NOT NULL DEFAULT 'branch' CHECK(branch_kind='branch'), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,branch_id,branch_kind) REFERENCES app.org_unit(tenant_id,id,kind)
);
CREATE TABLE app.client_organisation (
 tenant_id uuid NOT NULL, id uuid NOT NULL, branch_id uuid NOT NULL, branch_kind text NOT NULL DEFAULT 'branch' CHECK(branch_kind='branch'), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 client_type text NOT NULL CHECK(client_type IN('housing_association','local_authority','insurer','landlord_or_agent','person','main_contractor')),
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,branch_id,branch_kind) REFERENCES app.org_unit(tenant_id,id,kind)
);
CREATE TABLE app.client_contract (
 tenant_id uuid NOT NULL, id uuid NOT NULL, client_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,client_id,id), FOREIGN KEY(tenant_id,client_id) REFERENCES app.client_organisation(tenant_id,id)
);
CREATE TABLE app.approval_rule_version (
 tenant_id uuid NOT NULL, id uuid NOT NULL, client_id uuid NOT NULL, contract_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0), document jsonb NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,client_id,contract_id,id), UNIQUE(tenant_id,contract_id,revision),
 FOREIGN KEY(tenant_id,client_id,contract_id) REFERENCES app.client_contract(tenant_id,client_id,id), CHECK(document->>'version'='approval-rules.v1')
);
CREATE TABLE app.client_contract_version (
 tenant_id uuid NOT NULL, id uuid NOT NULL, client_id uuid NOT NULL, contract_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0), document jsonb NOT NULL, rule_version_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,contract_id,revision),
 FOREIGN KEY(tenant_id,client_id,contract_id) REFERENCES app.client_contract(tenant_id,client_id,id),
 FOREIGN KEY(tenant_id,client_id,contract_id,rule_version_id) REFERENCES app.approval_rule_version(tenant_id,client_id,contract_id,id), CHECK(document->>'version'='client-contract.v1')
);
CREATE TABLE app.contractor_member (
 tenant_id uuid NOT NULL, membership_id uuid NOT NULL, client_id uuid, email text NOT NULL CHECK(email LIKE '%.invalid'),
 PRIMARY KEY(tenant_id,membership_id), UNIQUE(tenant_id,membership_id,client_id), FOREIGN KEY(tenant_id,membership_id) REFERENCES app.membership(tenant_id,id), FOREIGN KEY(tenant_id,client_id) REFERENCES app.client_organisation(tenant_id,id)
);
CREATE TABLE app.role_grant (
 tenant_id uuid NOT NULL, id uuid NOT NULL, membership_id uuid NOT NULL, role text NOT NULL CHECK(role IN('owner','admin','operative','supervisor','surveyor','commercial_manager','finance','read_only','client_approver')),
 scope_kind text NOT NULL CHECK(scope_kind IN('tenant','region','branch','team','client')), scope_id uuid NOT NULL, contract_id uuid,
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,membership_id) REFERENCES app.contractor_member(tenant_id,membership_id),
 FOREIGN KEY(tenant_id,scope_id,contract_id) REFERENCES app.client_contract(tenant_id,client_id,id),
 CHECK((role='client_approver' AND scope_kind='client') OR (role<>'client_approver' AND scope_kind<>'client' AND contract_id IS NULL)), CHECK(role<>'finance' OR scope_kind='tenant')
);
CREATE TABLE app.role_grant_revocation (
 tenant_id uuid NOT NULL, id uuid NOT NULL, grant_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,grant_id), FOREIGN KEY(tenant_id,grant_id) REFERENCES app.role_grant(tenant_id,id)
);
CREATE TABLE app.contractor_membership_revocation (
 tenant_id uuid NOT NULL, id uuid NOT NULL, membership_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,membership_id), FOREIGN KEY(tenant_id,membership_id) REFERENCES app.contractor_member(tenant_id,membership_id)
);
CREATE TABLE app.team_membership (
 tenant_id uuid NOT NULL, id uuid NOT NULL, membership_id uuid NOT NULL, team_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0), active boolean NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,membership_id,team_id,revision), FOREIGN KEY(tenant_id,membership_id) REFERENCES app.contractor_member(tenant_id,membership_id), FOREIGN KEY(tenant_id,team_id) REFERENCES app.team(tenant_id,id)
);
-- Reviewed identity/control-plane exception: bearer handles expose only their own generated principal.
CREATE TABLE control_plane.contractor_practice_session (
 session_id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), membership_id uuid NOT NULL, identity_user_id uuid NOT NULL REFERENCES identity.identity_user(id),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES app.membership(tenant_id,id)
);
ALTER TABLE control_plane.contractor_practice_session OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.contractor_practice_session FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['commercial_track_assignment','org_unit','team','client_organisation','client_contract','approval_rule_version','client_contract_version','contractor_member','role_grant','role_grant_revocation','contractor_membership_revocation','team_membership'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);
 EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);
 EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record()',n);
 END LOOP; END $$;
-- Needed only by the audited operations transaction; business runtime policy is unchanged.
CREATE POLICY contractor_operations_audit ON app.audit_event FOR INSERT TO jobguard_migration
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE FUNCTION app.contractor_member_active(m uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app.membership a JOIN app.contractor_member c ON(c.tenant_id,c.membership_id)=(a.tenant_id,a.id)
 WHERE a.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND a.id=m AND a.role=ANY(ARRAY['owner','admin','operative','supervisor','surveyor','commercial_manager','finance','read_only','client_approver']) AND (a.role='client_approver')=(c.client_id IS NOT NULL) AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>statement_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=a.tenant_id AND r.membership_id=a.id))
 AND (SELECT commercial_track FROM app.commercial_track_assignment WHERE tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid ORDER BY revision DESC LIMIT 1)='contractor'
$$;
CREATE FUNCTION app.contractor_allowed(m uuid, permission text, target uuid, contract uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT app.contractor_member_active(m) AND (target=nullif(current_setting('app.tenant_id',true),'')::uuid
 OR EXISTS(SELECT 1 FROM app.org_unit WHERE id=target) OR EXISTS(SELECT 1 FROM app.team WHERE id=target) OR EXISTS(SELECT 1 FROM app.client_organisation WHERE id=target)) AND EXISTS(
 SELECT 1 FROM app.role_grant g
 LEFT JOIN app.team t ON(t.tenant_id,t.id)=(g.tenant_id,target)
 LEFT JOIN app.client_organisation c ON(c.tenant_id,c.id)=(g.tenant_id,target)
 LEFT JOIN app.org_unit b ON b.tenant_id=g.tenant_id AND b.id=coalesce(t.branch_id,c.branch_id,target)
 WHERE g.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND g.membership_id=m
 AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
 AND permission=ANY(CASE g.role
 WHEN 'owner' THEN ARRAY['organisation.read','organisation.manage','client.invite','contract.read','contract.manage']
 WHEN 'admin' THEN ARRAY['organisation.read','organisation.manage','client.invite','contract.read','contract.manage']
 WHEN 'operative' THEN ARRAY['job.read','extra.log','resident.read']
 WHEN 'supervisor' THEN ARRAY['contract.read','job.read','extra.log','extra.price','extra.approve','dashboard.read','resident.read']
 WHEN 'surveyor' THEN ARRAY['contract.read','job.read','extra.price','extra.approve','dashboard.read','resident.read']
 WHEN 'commercial_manager' THEN ARRAY['client.invite','contract.read','contract.manage','job.read','extra.price','extra.approve','dashboard.read','resident.read']
 WHEN 'finance' THEN ARRAY['contract.read','data.export','data.import','statement.read']
 WHEN 'read_only' THEN ARRAY['contract.read','job.read','dashboard.read']
 WHEN 'client_approver' THEN ARRAY['contract.read'] ELSE ARRAY[]::text[] END)
 AND (g.scope_kind='tenant' AND g.scope_id=g.tenant_id
 OR g.scope_kind='team' AND g.scope_id=t.id
 OR g.scope_kind='branch' AND g.scope_id=b.id
 OR g.scope_kind='region' AND (g.scope_id=b.parent_id OR g.scope_id=b.id AND b.kind='region')
 OR g.scope_kind='client' AND g.scope_id=c.id AND (g.contract_id IS NULL OR g.contract_id=contract))
 AND (g.role<>'operative' OR EXISTS(SELECT 1 FROM app.team_membership tm WHERE tm.tenant_id=g.tenant_id AND tm.membership_id=m AND tm.team_id=t.id AND tm.active AND tm.revision=(SELECT max(x.revision) FROM app.team_membership x WHERE(x.tenant_id,x.membership_id,x.team_id)=(tm.tenant_id,tm.membership_id,tm.team_id))))
 )
$$;
CREATE FUNCTION app.guard_contractor_grant() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE bound_client uuid; BEGIN
 IF (SELECT commercial_track FROM app.commercial_track_assignment WHERE tenant_id=NEW.tenant_id ORDER BY revision DESC LIMIT 1) IS DISTINCT FROM 'contractor' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT client_id INTO bound_client FROM app.contractor_member WHERE tenant_id=NEW.tenant_id AND membership_id=NEW.membership_id;
 IF NEW.role='client_approver' THEN
  IF bound_client IS DISTINCT FROM NEW.scope_id OR bound_client IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSIF bound_client IS NOT NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NEW.scope_kind='tenant' AND NEW.scope_id<>NEW.tenant_id
 OR NEW.scope_kind IN('region','branch') AND NOT EXISTS(SELECT 1 FROM app.org_unit WHERE tenant_id=NEW.tenant_id AND id=NEW.scope_id AND kind=NEW.scope_kind)
 OR NEW.scope_kind='team' AND NOT EXISTS(SELECT 1 FROM app.team WHERE tenant_id=NEW.tenant_id AND id=NEW.scope_id)
 OR NEW.scope_kind='client' AND NOT EXISTS(SELECT 1 FROM app.client_organisation WHERE tenant_id=NEW.tenant_id AND id=NEW.scope_id)
 THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='23503'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER grant_boundary BEFORE INSERT ON app.role_grant FOR EACH ROW EXECUTE FUNCTION app.guard_contractor_grant();

-- Operations-only, synthetic assignment. No EXECUTE grant to business runtime or infrastructure.
CREATE FUNCTION app.assign_commercial_track(t uuid, assignment uuid, track text, agreement text, expected integer, actor text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF coalesce((SELECT max(revision) FROM app.commercial_track_assignment WHERE tenant_id=t),0)<>expected THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 INSERT INTO app.commercial_track_assignment VALUES(t,assignment,expected+1,track,agreement,'synthetic_demo',actor,clock_timestamp());
END $$;
ALTER FUNCTION app.assign_commercial_track(uuid,uuid,text,text,integer,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.assign_commercial_track(uuid,uuid,text,text,integer,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

CREATE FUNCTION app.contractor_session(s uuid) RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT x.tenant_id,x.membership_id,x.identity_user_id FROM control_plane.contractor_practice_session x WHERE x.session_id=s AND current_database()='jobguard_synthetic_demo'
$$;
ALTER FUNCTION app.contractor_session(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.contractor_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.contractor_session(uuid) TO jobguard_runtime;

-- Generates ONLY a minimal isolated fictional organisation, not an imported enterprise demo.
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
ALTER FUNCTION app.start_contractor_practice(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.start_contractor_practice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.start_contractor_practice(uuid) TO jobguard_runtime;
-- Scoped migration policies used by the bounded fixture/invitation routines.
CREATE POLICY contractor_bootstrap_account ON app.account FOR ALL TO jobguard_migration USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY contractor_bootstrap_membership ON app.membership FOR ALL TO jobguard_migration USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

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
ALTER FUNCTION app.contractor_admin_command(uuid,jsonb,text) OWNER TO jobguard_migration;
ALTER FUNCTION app.contractor_member_active(uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.contractor_allowed(uuid,text,uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_contractor_grant() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.contractor_admin_command(uuid,jsonb,text),app.contractor_member_active(uuid),app.contractor_allowed(uuid,text,uuid,uuid),app.guard_contractor_grant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.contractor_admin_command(uuid,jsonb,text),app.contractor_member_active(uuid),app.contractor_allowed(uuid,text,uuid,uuid) TO jobguard_runtime;
CREATE FUNCTION app.require_contractor_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='commercial_track_assignment' THEN
  IF NOT EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=NEW.tenant_id AND id=NEW.id AND event_type='commercial_track.assigned' AND actor_ref=NEW.actor_ref) THEN RAISE EXCEPTION 'contractor assignment audit required' USING ERRCODE='23514'; END IF;
 ELSIF NEW.command_type LIKE 'contractor.%' THEN
  IF NOT EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=NEW.tenant_id AND id=NEW.command_id AND actor_ref='membership:'||NEW.actor_membership_id AND payload->'hashes'->>'document'=NEW.request_hash) THEN RAISE EXCEPTION 'contractor command audit required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.require_contractor_audit() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_contractor_audit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER contractor_track_audit AFTER INSERT ON app.commercial_track_assignment DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_contractor_audit();
CREATE CONSTRAINT TRIGGER contractor_command_audit AFTER INSERT ON app.command_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_contractor_audit();
-- Defence in depth for callers with SQL access: immutable documents cannot bypass the versioned schema.
CREATE FUNCTION app.valid_approval_rules(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE band jsonb; step jsonb; previous numeric:=-1; limit_value numeric; n integer:=0; count_bands integer; alt jsonb;
BEGIN
 IF jsonb_typeof(d)<>'object' OR d->>'version' IS DISTINCT FROM 'approval-rules.v1'
 OR d-ARRAY['version','proceedLimit','bands','clientApproval','evidence']<>'{}'::jsonb
 OR NOT d ?& ARRAY['version','proceedLimit','bands','clientApproval','evidence']
 OR jsonb_typeof(d->'proceedLimit')<>'object' OR (d->'proceedLimit')-ARRAY['pence','currency']<>'{}'::jsonb
 OR NOT d->'proceedLimit' ?& ARRAY['pence','currency'] OR d->'proceedLimit'->>'currency' IS DISTINCT FROM 'GBP' OR jsonb_typeof(d->'proceedLimit'->'pence')<>'number'
 OR NOT (d->'proceedLimit'->>'pence') ~ '^[0-9]+$' OR (d->'proceedLimit'->>'pence')::numeric>1000000000000
 OR jsonb_typeof(d->'bands')<>'array' OR jsonb_typeof(d->'evidence')<>'object'
 OR (d->'evidence')-ARRAY['photosRequired','residentConfirmationRequired']<>'{}'::jsonb
 OR jsonb_typeof(d->'evidence'->'photosRequired') IS DISTINCT FROM 'boolean' OR jsonb_typeof(d->'evidence'->'residentConfirmationRequired') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
 count_bands:=jsonb_array_length(d->'bands'); IF count_bands<1 OR count_bands>20 THEN RETURN false; END IF;
 FOR band IN SELECT value FROM jsonb_array_elements(d->'bands') LOOP
  n:=n+1;
  IF jsonb_typeof(band)<>'object' OR band-ARRAY['upToPence','steps']<>'{}'::jsonb OR NOT band ?& ARRAY['upToPence','steps'] OR jsonb_typeof(band->'steps')<>'array' OR jsonb_array_length(band->'steps')>8 THEN RETURN false; END IF;
  IF band->'upToPence'='null'::jsonb THEN IF n<>count_bands THEN RETURN false; END IF;
  ELSE
   IF n=count_bands OR jsonb_typeof(band->'upToPence')<>'number' OR NOT (band->>'upToPence') ~ '^[0-9]+$' THEN RETURN false; END IF;
   limit_value:=(band->>'upToPence')::numeric; IF limit_value<=previous OR limit_value>1000000000000 THEN RETURN false; END IF; previous:=limit_value;
  END IF;
  FOR step IN SELECT value FROM jsonb_array_elements(band->'steps') LOOP
   IF jsonb_typeof(step)<>'object' OR NOT step ?& ARRAY['role','timeLimitMinutes','escalationRole','alternateRoles'] OR step-ARRAY['role','timeLimitMinutes','escalationRole','alternateRoles']<>'{}'::jsonb
   OR jsonb_typeof(step->'role') IS DISTINCT FROM 'string' OR jsonb_typeof(step->'escalationRole') IS DISTINCT FROM 'string' OR NOT step->>'role'=ANY(ARRAY['supervisor','surveyor','commercial_manager']) OR NOT step->>'escalationRole'=ANY(ARRAY['supervisor','surveyor','commercial_manager'])
   OR jsonb_typeof(step->'timeLimitMinutes')<>'number' OR NOT (step->>'timeLimitMinutes') ~ '^[0-9]+$' OR (step->>'timeLimitMinutes')::numeric NOT BETWEEN 1 AND 525600
   OR jsonb_typeof(step->'alternateRoles')<>'array' OR jsonb_array_length(step->'alternateRoles')>3 THEN RETURN false; END IF;
   FOR alt IN SELECT value FROM jsonb_array_elements(step->'alternateRoles') LOOP IF jsonb_typeof(alt)<>'string' OR NOT (alt#>>'{}')=ANY(ARRAY['supervisor','surveyor','commercial_manager']) THEN RETURN false; END IF; END LOOP;
  END LOOP;
 END LOOP;
 IF jsonb_typeof(d->'clientApproval')<>'object' THEN RETURN false; END IF;
 IF d->'clientApproval'->>'kind'='none' THEN RETURN (d->'clientApproval')-'kind'='{}'::jsonb; END IF;
 IF d->'clientApproval'->>'kind' IS DISTINCT FROM 'threshold' OR NOT d->'clientApproval' ?& ARRAY['kind','abovePence','beforeWorkAbovePence','timeLimitMinutes'] OR (d->'clientApproval')-ARRAY['kind','abovePence','beforeWorkAbovePence','timeLimitMinutes']<>'{}'::jsonb THEN RETURN false; END IF;
 FOR alt IN SELECT d->'clientApproval'->'abovePence' UNION ALL SELECT d->'clientApproval'->'beforeWorkAbovePence' LOOP IF jsonb_typeof(alt)<>'number' OR NOT (alt#>>'{}') ~ '^[0-9]+$' OR (alt#>>'{}')::numeric>1000000000000 THEN RETURN false; END IF; END LOOP;
 RETURN jsonb_typeof(d->'clientApproval'->'timeLimitMinutes')='number' AND (d->'clientApproval'->>'timeLimitMinutes') ~ '^[0-9]+$' AND (d->'clientApproval'->>'timeLimitMinutes')::numeric BETWEEN 1 AND 525600;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
ALTER FUNCTION app.valid_approval_rules(jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.valid_approval_rules(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.valid_approval_rules(jsonb) TO jobguard_runtime;
ALTER TABLE app.approval_rule_version ADD CONSTRAINT valid_document CHECK(app.valid_approval_rules(document) IS TRUE);
CREATE FUNCTION app.valid_client_contract(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE item jsonb; BEGIN
 IF jsonb_typeof(d)<>'object' OR NOT d ?& ARRAY['version','reference','startsOn','endsOn','sorVersionIds','tenderedAdjustment','photoRule','vatCode','exportedNotBilledAlertDays']
 OR d-ARRAY['version','reference','startsOn','endsOn','sorVersionIds','tenderedAdjustment','photoRule','vatCode','exportedNotBilledAlertDays']<>'{}'::jsonb
 OR d->>'version' IS DISTINCT FROM 'client-contract.v1' OR jsonb_typeof(d->'reference') IS DISTINCT FROM 'string' OR length(d->>'reference') NOT BETWEEN 1 AND 80
 OR jsonb_typeof(d->'startsOn') IS DISTINCT FROM 'string' OR NOT (d->>'startsOn') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 OR jsonb_typeof(d->'sorVersionIds') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'sorVersionIds')>100
 OR jsonb_typeof(d->'tenderedAdjustment') IS DISTINCT FROM 'object' OR NOT d->'tenderedAdjustment' ?& ARRAY['numerator','denominator']
 OR (d->'tenderedAdjustment')-ARRAY['numerator','denominator']<>'{}'::jsonb
 OR jsonb_typeof(d->'tenderedAdjustment'->'numerator') IS DISTINCT FROM 'string' OR NOT (d->'tenderedAdjustment'->>'numerator') ~ '^-?(0|[1-9][0-9]{0,11})$'
 OR jsonb_typeof(d->'tenderedAdjustment'->'denominator') IS DISTINCT FROM 'string' OR NOT (d->'tenderedAdjustment'->>'denominator') ~ '^[1-9][0-9]{0,11}$'
 OR jsonb_typeof(d->'photoRule') IS DISTINCT FROM 'string' OR NOT d->>'photoRule'=ANY(ARRAY['required','optional'])
 OR d->>'vatCode' IS DISTINCT FROM 'synthetic-unreviewed' OR jsonb_typeof(d->'exportedNotBilledAlertDays') IS DISTINCT FROM 'number'
 OR NOT (d->>'exportedNotBilledAlertDays') ~ '^[0-9]+$' OR (d->>'exportedNotBilledAlertDays')::numeric NOT BETWEEN 1 AND 3650 THEN RETURN false; END IF;
 IF (d->>'startsOn')::date::text<>d->>'startsOn' THEN RETURN false; END IF;
 IF d->'endsOn'<>'null'::jsonb THEN
  IF jsonb_typeof(d->'endsOn')<>'string' OR NOT (d->>'endsOn') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (d->>'endsOn')::date::text<>d->>'endsOn' OR d->>'endsOn'<d->>'startsOn' THEN RETURN false; END IF;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'sorVersionIds') LOOP
  IF jsonb_typeof(item)<>'string' OR NOT (item#>>'{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
ALTER FUNCTION app.valid_client_contract(jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.valid_client_contract(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.valid_client_contract(jsonb) TO jobguard_runtime;
ALTER TABLE app.client_contract_version ADD CONSTRAINT valid_document CHECK(app.valid_client_contract(document) IS TRUE);
COMMIT;
