BEGIN;
-- LATER-SAFETY-80 (RED), narrowed: owner-protection on grant.revoke/membership.revoke; non-owners cannot grant to themselves.
-- Replaces only app.contractor_admin_command from its latest body (0549); owner, ACL, SECURITY DEFINER and search_path unchanged.
CREATE OR REPLACE FUNCTION app.contractor_admin_command(actor uuid, payload jsonb, request_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; k text:=payload->>'kind'; target uuid; permission text; rev integer; prior app.command_receipt; result jsonb; member uuid; account uuid; user_id uuid; rule_id uuid; contract_revision integer; g record; actor_owner boolean;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF payload->>'version' IS DISTINCT FROM 'contractor-command.v1' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF NOT coalesce(app.contractor_member_active(actor),false) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF k NOT IN('grant.revoke','membership.revoke') THEN
  PERFORM app.mon8_require_feature(actor,CASE WHEN k='contract.revise' THEN 'approval_chains' ELSE 'operative_roles' END);
 END IF;
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
 IF k IN('grant.create','grant.revoke','membership.revoke') THEN
  actor_owner:=EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner')
   OR EXISTS(SELECT 1 FROM app.role_grant x WHERE x.tenant_id=t AND x.membership_id=actor AND x.role='owner'
    AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(x.tenant_id,x.id)));
 END IF;
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
  IF member=actor AND NOT actor_owner THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO app.role_grant VALUES(t,(payload->>'id')::uuid,(payload->>'membershipId')::uuid,payload->>'role',payload->'scope'->>'kind',(payload->'scope'->>'id')::uuid,(payload->>'contractId')::uuid);
 WHEN 'grant.revoke' THEN
  IF NOT actor_owner AND EXISTS(
   SELECT 1 FROM app.role_grant x JOIN app.membership m ON(m.tenant_id,m.id)=(x.tenant_id,x.membership_id)
   WHERE x.tenant_id=t AND x.id=(payload->>'grantId')::uuid AND (m.role='owner' OR x.role='owner' OR EXISTS(
    SELECT 1 FROM app.role_grant o WHERE o.tenant_id=t AND o.membership_id=x.membership_id AND o.role='owner'
    AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(o.tenant_id,o.id)))))
  THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO app.role_grant_revocation VALUES(t,(payload->>'id')::uuid,(payload->>'grantId')::uuid);
 WHEN 'membership.revoke' THEN
  IF NOT actor_owner AND (EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=member AND role='owner')
   OR EXISTS(SELECT 1 FROM app.role_grant o WHERE o.tenant_id=t AND o.membership_id=member AND o.role='owner'
    AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(o.tenant_id,o.id))))
  THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO app.contractor_membership_revocation VALUES(t,(payload->>'id')::uuid,(payload->>'membershipId')::uuid);
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
