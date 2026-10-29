BEGIN;
-- MON-8 RED: explicit replacements preserve existing scoped authorization and write paths.
CREATE OR REPLACE FUNCTION app.contractor_admin_command(actor uuid, payload jsonb, request_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; k text:=payload->>'kind'; target uuid; permission text; rev integer; prior app.command_receipt; result jsonb; member uuid; account uuid; user_id uuid; rule_id uuid; contract_revision integer; g record;
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
CREATE OR REPLACE FUNCTION app.guard_contractor_grant() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE bound_client uuid; BEGIN
 IF NEW.role='operative' THEN
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.membership_id) THEN RAISE EXCEPTION 'foreign membership' USING ERRCODE='23503'; END IF;
  PERFORM app.mon8_require_feature(NEW.membership_id,'operative_roles');
 END IF;
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
CREATE OR REPLACE FUNCTION app.work_order_begin(actor uuid, p_job uuid, p_title text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
BEGIN
 PERFORM app.mon8_require_feature(actor,'work_orders');
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 INSERT INTO app.lp_job_insert_permit(tenant_id,job_id,backend_pid,transaction_id,operation,insert_shape,actor_membership_id)
 VALUES(t,p_job,pg_backend_pid(),pg_current_xact_id(),'work_order',
  app.lp_job_insert_shape(jsonb_populate_record(NULL::app.job,jsonb_build_object('tenant_id',t,'id',p_job,'title',left(p_title,200),
   'status','draft','revision',0,'provenance','work_order'))),actor);
 INSERT INTO app.job(id,tenant_id,title,status,revision,provenance) VALUES(p_job,t,left(p_title,200),'draft',0,'work_order');
 INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES(t,p_job,'contractor','synthetic_demo','work_order_import');
 RETURN 0;
END $$;
CREATE OR REPLACE FUNCTION app.work_order_commit(actor uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; k text:=payload->>'kind'; wo app.work_order; cur app.work_order_revision; binding app.contractor_party_binding;
 doc jsonb; revision_no integer; revision_id uuid:=(payload->>'revisionId')::uuid; job_row app.job; first_version uuid; second_version uuid; first_date date; second_date date;
 lines jsonb:=coalesce(payload->'lines','[]'::jsonb); status_value text:=payload->>'status'; issued date:=(payload->>'issuedOn')::date; version_id uuid:=nullif(payload->>'sorVersionId','')::uuid;
 total bigint; team_value uuid:=nullif(payload->'team'->>'teamId','')::uuid; member uuid;
BEGIN
 PERFORM app.mon8_require_feature(actor,'work_orders');
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF payload->>'version' IS DISTINCT FROM 'work-order-commit.v1' OR k NOT IN('create','revise') OR status_value NOT IN('ordered','cancelled') OR jsonb_typeof(lines)<>'array' OR jsonb_array_length(lines)>1000
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 IF k='create' THEN
  SELECT * INTO binding FROM app.contractor_party_binding WHERE tenant_id=t AND job_id=(payload->>'jobId')::uuid AND work_order_id=(payload->>'workOrderId')::uuid;
  IF binding.id IS NULL THEN RAISE EXCEPTION 'CONTRACTOR_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
  -- Defence in depth: CH-3b already checked the actor against this client when it bound the parties; the order is committed only for a member who may import for it.
  IF NOT coalesce(app.work_order_client_permitted(actor,binding.client_id),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO job_row FROM app.job WHERE tenant_id=t AND id=binding.job_id FOR UPDATE;
  IF job_row.provenance<>'work_order' OR job_row.status<>'draft' THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  IF (payload->>'expectedRevision')::integer<>0 OR status_value<>'ordered' THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  INSERT INTO app.work_order(tenant_id,id,job_id,client_id,contract_id,contract_version_id,reference)
  VALUES(t,binding.work_order_id,binding.job_id,binding.client_id,binding.contract_id,binding.contract_version_id,payload->>'reference') RETURNING * INTO wo;
  revision_no:=1;
 ELSE
  SELECT * INTO wo FROM app.work_order WHERE tenant_id=t AND id=(payload->>'workOrderId')::uuid FOR UPDATE;
  -- An order of a client outside the actor's scope is, to them, an order that does not exist (ENT-1): no revision, cancellation or line/team change.
  IF wo.id IS NULL OR NOT coalesce(app.work_order_client_permitted(actor,wo.client_id),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT r.* INTO cur FROM app.work_order_current c JOIN app.work_order_revision r ON(r.tenant_id,r.work_order_id,r.id)=(c.tenant_id,c.work_order_id,c.revision_id) WHERE c.tenant_id=t AND c.work_order_id=wo.id;
  IF cur.id IS NULL OR cur.revision<>(payload->>'expectedRevision')::integer THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  revision_no:=cur.revision+1;
 END IF;
 SELECT document INTO doc FROM app.client_contract_version WHERE tenant_id=t AND id=wo.contract_version_id;
 -- The pinned contract version's tendered adjustment is the only adjustment a price can use.
 IF doc->'tenderedAdjustment'->>'numerator' IS DISTINCT FROM payload->'adjustment'->>'numerator' OR doc->'tenderedAdjustment'->>'denominator' IS DISTINCT FROM payload->'adjustment'->>'denominator'
 THEN RAISE EXCEPTION 'INVALID_ADJUSTMENT' USING ERRCODE='22023'; END IF;
 IF status_value='ordered' THEN
  IF jsonb_array_length(lines)=0 OR version_id IS NULL THEN RAISE EXCEPTION 'SOR_VERSION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  -- The version in force on the order's issue date: the latest version listed by the pinned contract version that took effect on or before it.
  SELECT v.id,v.effective_from INTO first_version,first_date FROM app.sor_version v WHERE v.tenant_id=t AND v.effective_from<=issued
   AND v.id IN(SELECT jsonb_array_elements_text(doc->'sorVersionIds')::uuid) ORDER BY v.effective_from DESC LIMIT 1;
  SELECT v.id,v.effective_from INTO second_version,second_date FROM app.sor_version v WHERE v.tenant_id=t AND v.effective_from<=issued
   AND v.id IN(SELECT jsonb_array_elements_text(doc->'sorVersionIds')::uuid) ORDER BY v.effective_from DESC OFFSET 1 LIMIT 1;
  IF first_version IS NULL THEN RAISE EXCEPTION 'SOR_VERSION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF second_date=first_date THEN RAISE EXCEPTION 'AMBIGUOUS_SOR_VERSION' USING ERRCODE='22023'; END IF;
  IF first_version IS DISTINCT FROM version_id THEN RAISE EXCEPTION 'SOR_VERSION_NOT_FOUND' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT coalesce(sum((l->>'netPence')::bigint),0) INTO total FROM jsonb_array_elements(lines) l;
 INSERT INTO app.work_order_revision(tenant_id,id,work_order_id,revision,status,issued_on,due_on,priority,content_hash,diff,batch_id,row_number,sor_version_id,adjustment_numerator,adjustment_denominator,net_total_pence)
 VALUES(t,revision_id,wo.id,revision_no,status_value,issued,nullif(payload->>'dueOn','')::date,payload->>'priority',payload->>'contentHash',payload->'diff',(payload->>'batchId')::uuid,(payload->>'rowNumber')::integer,version_id,
  (payload->'adjustment'->>'numerator')::bigint,(payload->'adjustment'->>'denominator')::bigint,total);
 -- A scope identity per line, minted into the existing registry; an unchanged line keeps the identity the caller matched.
 INSERT INTO app.scope_identity(id,tenant_id,job_id,state)
 SELECT (l->>'scopeItemId')::uuid,t,wo.job_id,'confirmed' FROM jsonb_array_elements(lines) l ON CONFLICT(tenant_id,id) DO NOTHING;
 INSERT INTO app.work_order_line(tenant_id,id,work_order_id,revision_id,job_id,position,scope_item_id,client_line_reference,sor_version_id,sor_code,unit,rate_pence,quantity,net_pence,origin)
 SELECT t,(l->>'id')::uuid,wo.id,revision_id,wo.job_id,(l->>'position')::integer,(l->>'scopeItemId')::uuid,nullif(l->>'clientLineReference',''),(l->>'sorVersionId')::uuid,l->>'sorCode',l->>'unit',(l->>'ratePence')::bigint,l->>'quantity',(l->>'netPence')::bigint,l->>'origin'
 FROM jsonb_array_elements(lines) l;
 IF team_value IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM app.team WHERE tenant_id=t AND id=team_value) THEN RAISE EXCEPTION 'ASSIGNMENT_INVALID' USING ERRCODE='22023'; END IF;
  INSERT INTO app.job_assignment(tenant_id,id,job_id,work_order_id,revision_id,team_id,membership_id) VALUES(t,gen_random_uuid(),wo.job_id,wo.id,revision_id,team_value,NULL);
  FOR member IN SELECT value::uuid FROM jsonb_array_elements_text(coalesce(payload->'team'->'membershipIds','[]'::jsonb)) LOOP
   IF NOT coalesce(app.contractor_member_active(member),false) OR NOT EXISTS(SELECT 1 FROM app.team_membership tm WHERE tm.tenant_id=t AND tm.membership_id=member AND tm.team_id=team_value AND tm.active
     AND tm.revision=(SELECT max(x.revision) FROM app.team_membership x WHERE(x.tenant_id,x.membership_id,x.team_id)=(tm.tenant_id,tm.membership_id,tm.team_id)))
   THEN RAISE EXCEPTION 'ASSIGNMENT_INVALID' USING ERRCODE='22023'; END IF;
   INSERT INTO app.job_assignment(tenant_id,id,job_id,work_order_id,revision_id,team_id,membership_id) VALUES(t,gen_random_uuid(),wo.job_id,wo.id,revision_id,team_value,member);
  END LOOP;
 ELSIF jsonb_array_length(coalesce(payload->'team'->'membershipIds','[]'::jsonb))>0 THEN RAISE EXCEPTION 'ASSIGNMENT_INVALID' USING ERRCODE='22023';
 END IF;
 INSERT INTO app.work_order_current(tenant_id,work_order_id,revision_id) VALUES(t,wo.id,revision_id)
 ON CONFLICT(tenant_id,work_order_id) DO UPDATE SET revision_id=excluded.revision_id;
 IF k='create' THEN
  -- Live from import (CH-2): the job already has the CH-3b binding, so the existing JOB_PARTIES_REQUIRED guard on entering live is satisfied by it.
  UPDATE app.job SET status='live',revision=revision+1,updated_at=transaction_timestamp() WHERE tenant_id=t AND id=wo.job_id AND provenance='work_order' AND status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN jsonb_build_object('workOrderId',wo.id,'jobId',wo.job_id,'revisionId',revision_id,'revision',revision_no);
END $$;
CREATE OR REPLACE FUNCTION app.ent4b_origin_provenance() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE command app.command_receipt; grant_row app.role_grant; team_row app.team; branch_row app.org_unit;
 v app.variation; values_to_hash text[]; value_text text; encoded text:='extra-origin-hash.v1'||chr(10);
BEGIN
 IF NEW.job_track<>'contractor' THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE (tenant_id,id)=(NEW.tenant_id,NEW.job_id) AND provenance='work_order') THEN
  IF num_nonnulls(NEW.command_type,NEW.raising_grant_id,NEW.raiser_assigned,NEW.work_order_id,NEW.work_order_revision_id,NEW.site_visit_id,NEW.evidence_id,NEW.resident_confirmation_evidence_id,NEW.client_capture_id,NEW.origin_hash)<>0 THEN
   RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.kind='jobguard_surfaced_confirmed' THEN
  IF current_user<>'jobguard_migration' THEN RAISE EXCEPTION 'PROMPT_ORIGIN_HELD' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.prompt_resolution r JOIN app.extra_prompt p ON(p.tenant_id,p.job_id,p.id)=(r.tenant_id,r.job_id,r.prompt_id)
   JOIN app.command_receipt c ON(c.tenant_id,c.command_id)=(r.tenant_id,r.command_id)
   WHERE (r.tenant_id,r.job_id,r.variation_id,r.command_id,r.actor_membership_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id,NEW.command_id,NEW.raising_membership_id)
   AND r.kind='created' AND r.prompt_hash=p.prompt_hash AND p.surfaced_at<NEW.server_recorded_at AND c.command_type='ConfirmPrompt' AND c.status='processing'
   AND NEW.raising_role IN('supervisor','surveyor','commercial_manager') AND app.lp_citations_valid(NEW.job_id,p.id))
  THEN RAISE EXCEPTION 'PROMPT_ORIGIN_HELD' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT * INTO command FROM app.command_receipt WHERE (tenant_id,command_id)=(NEW.tenant_id,NEW.command_id);
 NEW.command_type:=command.command_type;
 SELECT w.id,c.revision_id INTO NEW.work_order_id,NEW.work_order_revision_id FROM app.work_order w
 JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id) WHERE (w.tenant_id,w.job_id)=(NEW.tenant_id,NEW.job_id);
 IF NEW.work_order_id IS NULL OR NEW.work_order_revision_id IS NULL OR NOT app.contractor_member_active(NEW.raising_membership_id) THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
 END IF;
 SELECT * INTO grant_row FROM app.role_grant WHERE (tenant_id,id)=(NEW.tenant_id,NEW.raising_grant_id);
 SELECT * INTO team_row FROM app.team WHERE (tenant_id,id)=(NEW.tenant_id,app.contractor_job_team(NEW.job_id));
 SELECT * INTO branch_row FROM app.org_unit WHERE (tenant_id,id)=(NEW.tenant_id,team_row.branch_id);
 IF grant_row.id IS NULL OR grant_row.membership_id IS DISTINCT FROM NEW.raising_membership_id OR grant_row.role IS DISTINCT FROM NEW.raising_role
  OR EXISTS(SELECT 1 FROM app.role_grant_revocation WHERE (tenant_id,grant_id)=(NEW.tenant_id,grant_row.id))
  OR team_row.id IS NULL OR branch_row.id IS NULL
  OR NOT coalesce((grant_row.scope_kind='tenant' AND grant_row.scope_id=NEW.tenant_id)
    OR (grant_row.scope_kind='team' AND grant_row.scope_id=team_row.id)
    OR (grant_row.scope_kind='branch' AND grant_row.scope_id=branch_row.id)
    OR (grant_row.scope_kind='region' AND grant_row.scope_id=branch_row.parent_id),false) THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
 END IF;
 NEW.raiser_assigned:=app.contractor_job_assigned(NEW.raising_membership_id,NEW.job_id);
 IF NEW.site_visit_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.site_visit WHERE (tenant_id,id,job_id,membership_id)=(NEW.tenant_id,NEW.site_visit_id,NEW.job_id,NEW.raising_membership_id)) THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23503';
 END IF;
 SELECT sha256 INTO NEW.evidence_hash FROM app.evidence_object WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.evidence_id);
 IF NEW.resident_confirmation_evidence_id IS NOT NULL AND EXISTS(SELECT 1 FROM app.evidence_object WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.resident_confirmation_evidence_id) AND evidence_type<>'resident_confirmation') THEN RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514'; END IF;
 SELECT * INTO v FROM app.variation WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id);
 IF v.excess_of_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.work_order_line WHERE (tenant_id,job_id,revision_id,scope_item_id)=(NEW.tenant_id,NEW.job_id,v.excess_of_revision_id,v.excess_of_scope_item_id)) THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23503';
 END IF;
 -- Boolean spelling and microsecond timestamps are independent of session timezone/DateStyle.
 PERFORM app.mon8_require_feature(NEW.raising_membership_id,'site_origin_capture');
 values_to_hash:=ARRAY[NEW.tenant_id::text,NEW.job_id::text,NEW.variation_id::text,NEW.job_track,NEW.kind,NEW.provenance,NEW.command_id::text,NEW.command_type,
  NEW.raising_membership_id::text,NEW.raising_role,NEW.raising_grant_id::text,CASE WHEN NEW.raiser_assigned THEN 'true' ELSE 'false' END,
  to_char(NEW.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),NEW.device_id,
  to_char(NEW.device_captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),NEW.client_capture_id::text,NEW.work_order_id::text,NEW.work_order_revision_id::text,
  NEW.site_visit_id::text,NEW.evidence_id::text,NEW.evidence_hash,NEW.resident_confirmation_evidence_id::text,NEW.source_capture_kind,NEW.source_capture_hash];
 FOREACH value_text IN ARRAY values_to_hash LOOP
  encoded:=encoded||CASE WHEN value_text IS NULL THEN 'N;' ELSE 'S'||octet_length(convert_to(value_text,'UTF8'))::text||':'||value_text||';' END;
 END LOOP;
 NEW.origin_hash:=encode(sha256(convert_to(encoded,'UTF8')),'hex');
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION app.xa_begin(p_job uuid, p_command uuid, p_types text[], p_actor uuid) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_receipt app.command_receipt;
BEGIN
 IF p_types IS DISTINCT FROM ARRAY['RevokeClientApproval']::text[] THEN PERFORM app.mon8_require_feature(p_actor,'approval_chains'); END IF;
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN v_tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_tenant:=NULL; END;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT r.* INTO v_receipt FROM app.command_receipt r WHERE r.tenant_id=v_tenant AND r.command_id=p_command;
 IF v_receipt.command_id IS NULL OR v_receipt.status IS DISTINCT FROM 'processing' OR NOT(v_receipt.command_type=ANY(p_types)) OR v_receipt.actor_membership_id IS DISTINCT FROM p_actor THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(v_tenant::text,54));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text||':'||p_job::text,417));
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track t WHERE(t.tenant_id,t.job_id)=(v_tenant,p_job) AND t.job_track='contractor' AND t.environment='synthetic_demo') THEN
  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002';
 END IF;
 RETURN v_tenant;
END $$;
CREATE OR REPLACE FUNCTION identity.sso_admin_command(s char(64),p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c uuid; revision integer; actor uuid; BEGIN
 -- Same tenant lock as ENT-1: admin/revocation/mapping/sign-in serialize before the audit head.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 actor:=identity.sso_require_admin(s,t);
 PERFORM app.mon8_require_feature(actor,'sso');
 IF (p->>'version')<>'sso-admin.v1' OR (p->>'requested_tenant_id') IS DISTINCT FROM t::text THEN RAISE EXCEPTION 'INVALID_SSO_INPUT' USING ERRCODE='22023'; END IF;
 IF (p->>'action')='connection.create' THEN
  IF ((p->'metadata')->>'tenantId') IS DISTINCT FROM t::text OR ((p->'metadata')->>'id') IS DISTINCT FROM (p->>'id') THEN RAISE EXCEPTION 'SSO_FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO identity.sso_connection(tenant_id,id,metadata) VALUES(t,(p->>'id')::uuid,(p->'metadata')); RETURN actor;
 END IF;
 c:=(p->>'connectionId')::uuid;
 PERFORM 1 FROM identity.sso_connection WHERE tenant_id=t AND id=c;
 IF NOT FOUND THEN RAISE EXCEPTION 'SSO_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF (p->>'action')='domain.verify' THEN
  IF (p->>'proof') IS DISTINCT FROM ('synthetic-domain:'||c::text||':'||(p->>'domain')) THEN RAISE EXCEPTION 'DOMAIN_UNVERIFIED' USING ERRCODE='22023'; END IF;
  INSERT INTO identity.verified_domain(tenant_id,connection_id,domain) VALUES(t,c,(p->>'domain'));
 ELSIF (p->>'action')='mapping.set' THEN
  SELECT coalesce(max(x.revision),0) INTO revision FROM identity.idp_group_role_mapping x WHERE tenant_id=t AND connection_id=c AND idp_group=(p->>'group');
  IF revision<>(p->>'expectedRevision')::integer THEN RAISE EXCEPTION 'STALE_MAPPING' USING ERRCODE='40001'; END IF;
  IF (((p->'scope')->>'kind')='tenant' AND ((p->'scope')->>'id') IS DISTINCT FROM t::text)
   OR (((p->'scope')->>'kind') IN('region','branch') AND NOT EXISTS(SELECT 1 FROM app.org_unit WHERE tenant_id=t AND id=((p->'scope')->>'id')::uuid AND kind=((p->'scope')->>'kind')))
   OR (((p->'scope')->>'kind')='team' AND NOT EXISTS(SELECT 1 FROM app.team WHERE tenant_id=t AND id=((p->'scope')->>'id')::uuid))
  THEN RAISE EXCEPTION 'SSO_FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO identity.idp_group_role_mapping(tenant_id,id,connection_id,idp_group,revision,role,scope_kind,scope_id,enabled)
   VALUES(t,gen_random_uuid(),c,(p->>'group'),revision+1,(p->>'role'),((p->'scope')->>'kind'),((p->'scope')->>'id')::uuid,(p->>'enabled')::boolean);
 ELSE RAISE EXCEPTION 'INVALID_SSO_INPUT' USING ERRCODE='22023'; END IF;
 RETURN actor;
END $$;
CREATE OR REPLACE FUNCTION identity.sso_required_command(s char(64),p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; c uuid; scope jsonb; candidate uuid; BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SSO_ROUTE_BLOCKED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 actor:=identity.sso_require_admin(s,t);
 IF (p->>'required') IS DISTINCT FROM 'false' THEN PERFORM app.mon8_require_feature(actor,'sso'); END IF;
 IF (p->>'version') IS DISTINCT FROM 'sso-required-command.v1' OR (p->>'requested_tenant_id') IS DISTINCT FROM t::text
  OR jsonb_typeof(p->'required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p->'expectedRevision') IS DISTINCT FROM 'number'
  OR (p->>'expectedRevision') !~ '^[0-9]+$' OR length(coalesce(p->>'reason','')) NOT BETWEEN 20 AND 500
  OR (p-ARRAY['version','requested_tenant_id','required','expectedRevision','reason'])<>'{}'::jsonb
 THEN RAISE EXCEPTION 'INVALID_SSO_REQUIRED_INPUT' USING ERRCODE='22023'; END IF;
 IF (p->>'required')::boolean THEN
  SELECT co.id INTO candidate FROM identity.sso_connection co WHERE co.tenant_id=t
   AND EXISTS(SELECT 1 FROM identity.verified_domain d WHERE d.tenant_id=t AND d.connection_id=co.id)
   AND EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(g.idp_group) g.enabled FROM identity.idp_group_role_mapping g WHERE g.tenant_id=t AND g.connection_id=co.id ORDER BY g.idp_group,g.revision DESC) latest WHERE latest.enabled)
   ORDER BY co.created_at,co.id LIMIT 1;
  IF candidate IS NULL THEN RAISE EXCEPTION 'SSO_REQUIRED_NO_CONNECTION' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT identity.sso_session_scope(se.id) INTO scope FROM identity.session se WHERE se.token_digest=s;
 IF scope IS NULL OR (scope->>'revoked')='true' OR (scope->>'tenantId') IS DISTINCT FROM t::text OR (scope->>'membershipId') IS DISTINCT FROM actor::text
 THEN RAISE EXCEPTION 'SSO_REQUIRED_NEEDS_SSO_SESSION' USING ERRCODE='42501'; END IF;
 c:=(scope->>'connectionId')::uuid;
 IF c IS NULL THEN RAISE EXCEPTION 'SSO_REQUIRED_NEEDS_SSO_SESSION' USING ERRCODE='42501'; END IF;
 IF (p->>'required')::boolean THEN
  -- The connection supporting this revision is the administrator's live binding, never caller input.
  IF NOT EXISTS(SELECT 1 FROM identity.verified_domain d WHERE d.tenant_id=t AND d.connection_id=c)
   OR NOT EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(g.idp_group) g.enabled FROM identity.idp_group_role_mapping g WHERE g.tenant_id=t AND g.connection_id=c ORDER BY g.idp_group,g.revision DESC) latest WHERE latest.enabled)
  THEN RAISE EXCEPTION 'SSO_REQUIRED_NO_CONNECTION' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM identity.membership_locator l JOIN app.membership m
    ON(m.tenant_id,m.id,m.identity_user_id)=(l.tenant_id,l.membership_id,l.user_id)
    WHERE l.tenant_id=t AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM identity.sso_subject sub WHERE sub.tenant_id=t AND sub.user_id=l.user_id AND sub.membership_id=l.membership_id))
  THEN RAISE EXCEPTION 'SSO_REQUIRED_UNLINKED_MEMBERS' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN identity.sso_required_append(t,c,actor,'admin',(p->>'required')::boolean,p->>'reason',(p->>'expectedRevision')::integer);
END $$;
CREATE OR REPLACE FUNCTION app.import_batch_record(actor uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; rows jsonb:=coalesce(payload->'rows','[]'::jsonb); batch uuid:=(payload->>'batchId')::uuid; n integer;
BEGIN
 PERFORM app.mon8_require_feature(actor,'work_orders');
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF payload->>'version' IS DISTINCT FROM 'import-batch-record.v1' OR jsonb_typeof(rows)<>'array' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 n:=jsonb_array_length(rows);
 INSERT INTO app.import_batch(tenant_id,id,command_id,source_sha256,source_name,source_kind,row_count,created_count,revised_count,unchanged_count,rejected_count,actor_membership_id)
 SELECT t,batch,(payload->>'commandId')::uuid,payload->>'sourceSha256',payload->>'sourceName',payload->>'sourceKind',n,
  count(*) FILTER(WHERE r->>'outcome'='created'),count(*) FILTER(WHERE r->>'outcome'='revised'),count(*) FILTER(WHERE r->>'outcome'='unchanged'),count(*) FILTER(WHERE r->>'outcome'='rejected'),actor
 FROM jsonb_array_elements(rows) r;
 INSERT INTO app.import_row_receipt(tenant_id,batch_id,row_number,outcome,error_code,work_order_reference,work_order_id,revision_id)
 SELECT t,batch,(r->>'rowNumber')::integer,r->>'outcome',nullif(r->>'errorCode',''),nullif(r->>'reference',''),nullif(r->>'workOrderId','')::uuid,nullif(r->>'revisionId','')::uuid FROM jsonb_array_elements(rows) r;
 -- A created or revised receipt must point at a revision this very batch wrote.
 IF EXISTS(SELECT 1 FROM app.import_row_receipt x JOIN app.work_order_revision v ON(v.tenant_id,v.id)=(x.tenant_id,x.revision_id)
   WHERE x.tenant_id=t AND x.batch_id=batch AND x.outcome IN('created','revised') AND (v.batch_id<>batch OR v.row_number<>x.row_number))
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('batchId',batch,'rowCount',n);
END $$;
CREATE OR REPLACE FUNCTION app.import_sor_version(actor uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; items jsonb:=coalesce(payload->'items','[]'::jsonb); prior app.sor_version; version uuid:=(payload->>'versionId')::uuid; schedule uuid:=(payload->>'scheduleId')::uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 PERFORM app.mon8_require_feature(actor,'work_orders');
 IF t IS NULL OR NOT coalesce(app.sor_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF payload->>'version' IS DISTINCT FROM 'sor-version-record.v1' OR jsonb_typeof(items)<>'array' OR jsonb_array_length(items) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM app.sor_version WHERE tenant_id=t AND command_id=(payload->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.request_hash<>payload->>'requestHash' OR prior.actor_membership_id<>actor THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('versionId',prior.id,'scheduleId',prior.schedule_id,'itemCount',prior.item_count,'effectiveFrom',prior.effective_from,'replayed',true);
 END IF;
 INSERT INTO app.schedule_of_rates(tenant_id,id,reference,actor_membership_id) VALUES(t,schedule,payload->>'scheduleReference',actor) ON CONFLICT(tenant_id,id) DO NOTHING;
 INSERT INTO app.sor_version(tenant_id,id,schedule_id,reference,effective_from,item_count,content_hash,command_id,request_hash,actor_membership_id)
 VALUES(t,version,schedule,payload->>'reference',(payload->>'effectiveFrom')::date,jsonb_array_length(items),payload->>'contentHash',(payload->>'commandId')::uuid,payload->>'requestHash',actor);
 INSERT INTO app.sor_item(tenant_id,version_id,code,description,unit,rate_pence,standard_minutes)
 SELECT t,version,i->>'code',i->>'description',i->>'unit',(i->>'ratePence')::bigint,nullif(i->>'standardMinutes','')::integer FROM jsonb_array_elements(items) i;
 RETURN jsonb_build_object('versionId',version,'scheduleId',schedule,'itemCount',jsonb_array_length(items),'effectiveFrom',(payload->>'effectiveFrom')::date,'replayed',false);
END $$;
CREATE OR REPLACE FUNCTION app.bind_contractor_parties(actor uuid,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; j app.job; link app.contractor_client_customer; c app.customer_revision; p app.customer_revision; s app.site_revision;
 cv uuid; prior app.command_receipt; h text; result jsonb; row_id uuid:=gen_random_uuid(); party_id uuid:=gen_random_uuid(); expected integer; client_kind text; res jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF t IS NULL OR NOT coalesce(app.contractor_member_active(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM app.mon8_require_feature(actor,'work_orders');
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 -- Order: active membership, then completeness, then role authority. Completeness is judged before authority because a missing client
 -- leaves no client scope to check; the refusal reveals only the shape of the caller's own payload.
 -- "Missing" means absent or JSON null: client, contract, site, or a resident that is neither a complete contact (a name plus a phone or an email)
 -- nor a no-resident reason. Present but malformed values (blank text, bad email, unknown reason) are INVALID_COMMAND instead.
 res:=payload->'resident';
 IF payload->>'clientId' IS NULL OR payload->>'contractId' IS NULL OR payload->>'siteRevisionId' IS NULL OR res IS NULL OR res='null'::jsonb
 OR (jsonb_typeof(res)='object' AND (
  (res->>'kind'='none' AND coalesce(jsonb_typeof(res->'reason'),'null')='null')
  OR (res->>'kind'='contact' AND (coalesce(jsonb_typeof(res->'contact'),'null')='null'
   OR (jsonb_typeof(res->'contact')='object' AND (coalesce(jsonb_typeof(res->'contact'->'name'),'null')='null'
    OR (coalesce(jsonb_typeof(res->'contact'->'phone'),'null')='null' AND coalesce(jsonb_typeof(res->'contact'->'email'),'null')='null'))))))
 ) THEN RAISE EXCEPTION 'CONTRACTOR_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 IF NOT (coalesce(app.contractor_allowed(actor,'organisation.manage',(payload->>'clientId')::uuid),false) OR coalesce(app.contractor_allowed(actor,'data.import',t),false)) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF payload-ARRAY['version','environment','commandId','jobId','workOrderId','expectedJobRevision','clientId','contractId','siteRevisionId','payingPartyRevisionId','resident']<>'{}'::jsonb
 OR payload->>'version' IS DISTINCT FROM 'contractor-party-import.v1' OR NOT payload ?& ARRAY['commandId','jobId','workOrderId','expectedJobRevision']
 OR payload->>'commandId' IS NULL OR payload->>'jobId' IS NULL OR payload->>'workOrderId' IS NULL
 OR jsonb_typeof(payload->'expectedJobRevision') IS DISTINCT FROM 'number' OR payload->>'expectedJobRevision' !~ '^(0|[1-9][0-9]*)$'
 OR NOT app.valid_contractor_resident(payload->'resident') THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 expected:=(payload->>'expectedJobRevision')::integer;
 SELECT * INTO j FROM app.job WHERE tenant_id=t AND id=(payload->>'jobId')::uuid FOR UPDATE;
 IF j.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 h:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=(payload->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.command_type<>'contractor_parties.bind' OR prior.status<>'succeeded' OR prior.request_hash<>h OR prior.actor_membership_id<>actor
  OR NOT EXISTS(SELECT 1 FROM app.contractor_party_binding b WHERE b.tenant_id=t AND b.job_id=j.id AND b.work_order_id=(payload->>'workOrderId')::uuid AND b.command_id=prior.command_id AND b.id::text=prior.result->>'id') THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result;
 END IF;
 IF j.revision<>expected OR j.status NOT IN('draft','quoting') OR EXISTS(SELECT 1 FROM app.contractor_party_binding WHERE tenant_id=t AND (job_id=j.id OR work_order_id=(payload->>'workOrderId')::uuid)) THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 SELECT * INTO link FROM app.contractor_client_customer WHERE tenant_id=t AND client_id=(payload->>'clientId')::uuid;
 IF link.id IS NULL THEN RAISE EXCEPTION 'CONTRACTOR_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 -- Integrator decision (CH-3b round 2): every import uses the customer's LATEST revision, never the revision seen at link time,
 -- and re-checks its type against the client kind. A customer revised to another type fails closed; the old revision is never pinned.
 SELECT r.* INTO c FROM app.customer_revision r WHERE r.tenant_id=t AND r.customer_id=link.customer_id ORDER BY r.revision DESC LIMIT 1;
 IF c.id IS NULL THEN RAISE EXCEPTION 'PARTY_NOT_FOUND' USING ERRCODE='23503'; END IF;
 SELECT o.client_type INTO client_kind FROM app.client_organisation o WHERE o.tenant_id=t AND o.id=link.client_id;
 IF c.payload->>'type' IS DISTINCT FROM client_kind THEN RAISE EXCEPTION 'CUSTOMER_TYPE_MISMATCH' USING ERRCODE='22023'; END IF;
 -- The parameter is qualified with the function name because customer_revision and site_revision also have a payload column.
 SELECT r.* INTO p FROM app.customer_revision r WHERE r.tenant_id=t AND r.id=coalesce((bind_contractor_parties.payload->>'payingPartyRevisionId')::uuid,c.id);
 SELECT r.* INTO s FROM app.site_revision r WHERE r.tenant_id=t AND r.id=(bind_contractor_parties.payload->>'siteRevisionId')::uuid;
 IF p.id IS NULL OR s.id IS NULL THEN RAISE EXCEPTION 'PARTY_NOT_FOUND' USING ERRCODE='23503'; END IF;
 -- Select by contract identity, then let the composite FK prove client+tenant binding independently.
 SELECT id INTO cv FROM app.client_contract_version WHERE tenant_id=t AND contract_id=(payload->>'contractId')::uuid ORDER BY revision DESC LIMIT 1;
 result:=jsonb_build_object('version','contractor-party-result.v1','environment','synthetic_demo','commandId',payload->>'commandId','id',row_id,'realExternalActions',0);
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES((payload->>'commandId')::uuid,t,'contractor_parties.bind',payload->>'commandId',h,'succeeded',result,actor,clock_timestamp());
 -- CH-3a's immutable binding is recorded by the new contractor binding/receipt audit guard below; its older job.parties command guard is not changed.
 INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance)
 VALUES(t,party_id,j.id,expected+1,c.customer_id,c.id,p.customer_id,p.id,s.site_id,s.id,'work_order_import');
 INSERT INTO app.contractor_party_binding(tenant_id,id,job_id,work_order_id,client_id,contract_id,contract_version_id,customer_id,party_binding_id,command_id,actor_membership_id)
 VALUES(t,row_id,j.id,(payload->>'workOrderId')::uuid,(payload->>'clientId')::uuid,(payload->>'contractId')::uuid,coalesce(cv,(payload->>'contractId')::uuid),c.customer_id,party_id,(payload->>'commandId')::uuid,actor);
 INSERT INTO app.contractor_resident_contact(tenant_id,id,job_id,binding_id,contact,no_resident_reason)
 VALUES(t,gen_random_uuid(),j.id,row_id,payload->'resident'->'contact',payload->'resident'->>'reason');
 INSERT INTO app.job_party_current(tenant_id,job_id,binding_id) VALUES(t,j.id,party_id) ON CONFLICT(tenant_id,job_id) DO UPDATE SET binding_id=excluded.binding_id;
 UPDATE app.job SET revision=revision+1,updated_at=transaction_timestamp() WHERE tenant_id=t AND id=j.id;
 RETURN result;
END $$;
-- Preserve 0347 OIDC replay namespaces; only commercial-loss grant handling differs.
CREATE OR REPLACE FUNCTION identity.sso_complete(c uuid,claims jsonb,state char(64),new_session uuid,token char(64),csrf text,expires timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; r identity.sso_request; sub identity.sso_subject; u uuid; member uuid; account uuid; address text:=(claims->>'email'); email_domain text; group_row record; grant_id uuid; grants_count integer:=0; allow_new_grants boolean:=false; sh char(64):=(claims->>'subjectHash'); eh char(64):=(claims->>'emailHash'); link identity.session; binding jsonb; BEGIN
 binding:=identity.sso_load_connection(c); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 -- Match email-code serialization order and lock globally shared email before identity creation/linking.
 PERFORM pg_advisory_xact_lock(hashtextextended('identity-email:'||address,0));
 SELECT * INTO r FROM identity.sso_request WHERE tenant_id=t AND connection_id=c AND request_id=(claims->>'requestId') FOR UPDATE;
 IF r.request_id IS NULL OR r.state_digest<>state OR r.expires_at<=clock_timestamp() OR r.consumed_at IS NULL THEN RAISE EXCEPTION 'REQUEST_REFUSED' USING ERRCODE='22023'; END IF;
 IF address IS NULL OR address<>lower(address) OR address NOT LIKE '%.invalid' OR length(address)>320 THEN RAISE EXCEPTION 'DOMAIN_UNVERIFIED' USING ERRCODE='22023'; END IF;
 email_domain:=split_part(address,'@',2);
 IF NOT EXISTS(SELECT 1 FROM identity.verified_domain WHERE tenant_id=t AND connection_id=c AND verified_domain.domain=email_domain) THEN RAISE EXCEPTION 'DOMAIN_UNVERIFIED' USING ERRCODE='22023'; END IF;
 IF binding->>'protocol'='oidc' THEN
  IF EXISTS(SELECT 1 FROM identity.oidc_assertion_use WHERE tenant_id=t AND connection_id=c AND (assertion_id=claims->>'assertionId' OR request_id=r.request_id)) THEN RAISE EXCEPTION 'ASSERTION_REPLAY' USING ERRCODE='23505'; END IF;
 ELSE
 IF EXISTS(SELECT 1 FROM identity.sso_assertion_use WHERE assertion_id=(claims->>'assertionId')) THEN RAISE EXCEPTION 'ASSERTION_REPLAY' USING ERRCODE='23505'; END IF;
 END IF;
 SELECT * INTO sub FROM identity.sso_subject WHERE tenant_id=t AND connection_id=c AND subject_hash=sh;
 IF sub.user_id IS NOT NULL THEN
  IF sub.email_hash<>eh THEN RAISE EXCEPTION 'LINK_FORBIDDEN' USING ERRCODE='42501'; END IF;
  u:=sub.user_id; member:=sub.membership_id;
  IF NOT app.contractor_member_active(member) THEN RAISE EXCEPTION 'MEMBERSHIP_REVOKED' USING ERRCODE='42501'; END IF;
  -- Existing linked SSO identity cannot be replaced by a different account.
  IF r.link_session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM identity.session WHERE id=r.link_session_id AND user_id=u AND revoked_at IS NULL AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'LINK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE
  SELECT user_id INTO u FROM identity.user_email WHERE email=address;
  IF u IS NOT NULL THEN
   IF r.link_session_id IS NULL THEN RAISE EXCEPTION 'LINK_REQUIRED' USING ERRCODE='42501'; END IF;
   SELECT * INTO link FROM identity.session WHERE id=r.link_session_id AND user_id=u AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE;
   IF link.id IS NULL THEN RAISE EXCEPTION 'LINK_FORBIDDEN' USING ERRCODE='42501'; END IF;
   SELECT id INTO member FROM app.membership WHERE tenant_id=t AND identity_user_id=u AND app.contractor_member_active(id) FOR SHARE;
   IF member IS NULL THEN RAISE EXCEPTION 'LINK_FORBIDDEN' USING ERRCODE='42501'; END IF;
  ELSIF r.link_session_id IS NOT NULL THEN RAISE EXCEPTION 'LINK_FORBIDDEN' USING ERRCODE='42501';
  END IF;
 END IF;
 IF member IS NOT NULL THEN allow_new_grants:=(app.mon8_feature_decision(member,'sso')->>'executable')::boolean; END IF;
 SELECT count(*) INTO grants_count FROM (SELECT DISTINCT ON(idp_group) * FROM identity.idp_group_role_mapping WHERE tenant_id=t AND connection_id=c ORDER BY idp_group,revision DESC) g
  WHERE enabled AND idp_group IN(SELECT jsonb_array_elements_text(claims->'groups'));
 IF sub.user_id IS NOT NULL THEN
  -- Revocation on a verified next sign-in is a committed fact even if no mapped group remains.
  UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id IN(SELECT session_id FROM identity.sso_session_binding WHERE tenant_id=t AND connection_id=c AND subject_hash=sh) AND revoked_at IS NULL;
  INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id) SELECT t,gen_random_uuid(),g.grant_id FROM identity.sso_grant g
   WHERE tenant_id=t AND connection_id=c AND subject_hash=sh AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation v WHERE v.tenant_id=t AND v.grant_id=g.grant_id)
   AND (allow_new_grants OR NOT EXISTS(
    SELECT 1 FROM app.role_grant old_grant JOIN (
     SELECT DISTINCT ON(idp_group) * FROM identity.idp_group_role_mapping WHERE tenant_id=t AND connection_id=c ORDER BY idp_group,revision DESC
    ) mapping ON mapping.role=old_grant.role AND mapping.scope_kind=old_grant.scope_kind AND mapping.scope_id=old_grant.scope_id
    WHERE old_grant.tenant_id=t AND old_grant.id=g.grant_id AND mapping.enabled
    AND mapping.idp_group IN(SELECT jsonb_array_elements_text(claims->'groups'))));
 END IF;
 IF grants_count=0 THEN
  IF binding->>'protocol'='oidc' THEN
   INSERT INTO identity.oidc_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,(claims->>'assertionId'),r.request_id);
  ELSE
   INSERT INTO identity.sso_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,(claims->>'assertionId'),r.request_id);
  END IF;
  RETURN jsonb_build_object('code','NO_MAPPED_GRANTS');
 END IF;
 IF expires<=clock_timestamp() OR expires>clock_timestamp()+interval '15 minutes' THEN RAISE EXCEPTION 'REQUEST_REFUSED' USING ERRCODE='22023'; END IF;
 -- DB uniqueness is inside the same transaction as identity, membership, grants and session.
 IF binding->>'protocol'='oidc' THEN
   INSERT INTO identity.oidc_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,(claims->>'assertionId'),r.request_id);
  ELSE
   INSERT INTO identity.sso_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,(claims->>'assertionId'),r.request_id);
  END IF;
 IF member IS NULL THEN
  u:=gen_random_uuid(); member:=gen_random_uuid();
  SELECT id INTO account FROM app.account WHERE tenant_id=t ORDER BY created_at,id LIMIT 1;
  INSERT INTO identity.identity_user(id) VALUES(u);
  INSERT INTO identity.user_email(email,user_id) VALUES(address,u);
  INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(member,t,account,u,'read_only');
  INSERT INTO app.contractor_member VALUES(t,member,NULL,address);
  INSERT INTO identity.membership_locator VALUES(u,t,member);
 END IF;
 IF sub.user_id IS NULL THEN PERFORM app.mon8_require_feature(member,'sso'); allow_new_grants:=true; END IF;
 IF sub.user_id IS NULL THEN
  INSERT INTO identity.sso_subject(tenant_id,connection_id,subject_hash,email_hash,user_id,membership_id) VALUES(t,c,sh,eh,u,member);
 END IF;
 FOR group_row IN SELECT * FROM (SELECT DISTINCT ON(idp_group) * FROM identity.idp_group_role_mapping WHERE tenant_id=t AND connection_id=c ORDER BY idp_group,revision DESC) g
  WHERE enabled AND allow_new_grants AND idp_group IN(SELECT jsonb_array_elements_text(claims->'groups')) LOOP
  grant_id:=gen_random_uuid();
  INSERT INTO app.role_grant VALUES(t,grant_id,member,group_row.role,group_row.scope_kind,group_row.scope_id,NULL);
  INSERT INTO identity.sso_grant(tenant_id,connection_id,subject_hash,grant_id) VALUES(t,c,sh,grant_id);
 END LOOP;
 INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES(new_session,u,'synthetic_demo',token,csrf,expires);
 INSERT INTO identity.sso_session_binding(tenant_id,connection_id,subject_hash,session_id) VALUES(t,c,sh,new_session);
 INSERT INTO identity.security_event(id,event_type,subject_id) VALUES(gen_random_uuid(),'session.issued',new_session);
 RETURN jsonb_build_object('userId',u,'membershipId',member,'tenantId',t);
END $$;
-- Preserve 0347 OIDC registration, adding the same server-side SSO entitlement as SAML.
CREATE OR REPLACE FUNCTION identity.oidc_create(s char(64),p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c uuid:=(p->'config'->>'connectionId')::uuid; current_session identity.session; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 PERFORM app.mon8_require_feature(identity.sso_require_admin(s,t),'sso');
 SELECT * INTO current_session FROM identity.session WHERE token_digest=s AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF current_session.id IS NULL THEN RAISE EXCEPTION 'SSO_FORBIDDEN'; END IF;
 PERFORM identity.oidc_link(t,current_session.id,current_session.user_id,s,current_session.csrf_token);
 IF p->>'version' IS DISTINCT FROM 'oidc-connection.v1' OR p->>'protocol' IS DISTINCT FROM 'oidc'
 OR p->'config'->>'tenantId' IS DISTINCT FROM t::text THEN RAISE EXCEPTION 'SSO_FORBIDDEN'; END IF;
 INSERT INTO identity.sso_connection(tenant_id,id,metadata) VALUES(t,c,p);RETURN c;
END $$;
CREATE OR REPLACE FUNCTION app.ent3b_start_visit(p_actor uuid, p_command uuid, p_job uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant uuid; answers integer; answered text; order_id uuid; new_visit uuid:=gen_random_uuid();
BEGIN
 PERFORM app.mon8_require_feature(p_actor,'site_origin_capture');
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- The tenant lock merged contractor administration takes exclusively: a grant, membership or team change cannot land between this check and the commit.
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(tenant::text,54));
 IF p_actor IS NULL OR p_command IS NULL OR p_job IS NULL OR NOT EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=tenant AND r.command_id=p_command AND r.status='processing' AND r.command_type='StartSiteVisit' AND r.actor_membership_id=p_actor) THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 SELECT count(*)::integer, min(a.decision) INTO answers, answered FROM app.ent3b_visit_authority(p_actor,p_job) a;
 IF answers IS DISTINCT FROM 1 OR answered IS DISTINCT FROM 'allowed' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant::text||':'||p_job::text||':'||p_actor::text,3101));
 IF EXISTS(SELECT 1 FROM app.site_visit v WHERE v.tenant_id=tenant AND v.job_id=p_job AND v.membership_id=p_actor AND v.completed_at IS NULL) THEN
  RAISE EXCEPTION 'VISIT_ALREADY_OPEN' USING ERRCODE='55000';
 END IF;
 SELECT w.id INTO order_id FROM app.work_order w WHERE w.tenant_id=tenant AND w.job_id=p_job;
 IF order_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- No time is supplied: started_at is the column default.
 INSERT INTO app.site_visit(tenant_id,id,job_id,work_order_id,membership_id) VALUES(tenant,new_visit,p_job,order_id,p_actor);
 RETURN new_visit;
END $$;
CREATE OR REPLACE FUNCTION app.ent3b_complete_visit(p_actor uuid, p_command uuid, p_job uuid, p_visit uuid, p_answer text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant uuid; answers integer; answered text; visit_row app.site_visit; answer_id uuid:=gen_random_uuid(); recorded timestamptz;
BEGIN
 PERFORM app.mon8_require_feature(p_actor,'site_origin_capture');
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(tenant::text,54));
 IF p_actor IS NULL OR p_command IS NULL OR p_job IS NULL OR p_visit IS NULL OR NOT EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=tenant AND r.command_id=p_command AND r.status='processing' AND r.command_type='CompleteSiteVisit' AND r.actor_membership_id=p_actor) THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 IF p_answer IS NULL OR p_answer NOT IN('yes','no') THEN RAISE EXCEPTION 'CLOSEOUT_ANSWER_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*)::integer, min(a.decision) INTO answers, answered FROM app.ent3b_visit_authority(p_actor,p_job) a;
 IF answers IS DISTINCT FROM 1 OR answered IS DISTINCT FROM 'allowed' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant::text||':'||p_visit::text,3102));
 SELECT * INTO visit_row FROM app.site_visit v WHERE v.tenant_id=tenant AND v.id=p_visit AND v.job_id=p_job AND v.membership_id=p_actor;
 IF visit_row.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF visit_row.completed_at IS NOT NULL THEN RAISE EXCEPTION 'VISIT_ALREADY_COMPLETED' USING ERRCODE='55000'; END IF;
 -- One server reading is both the completion time and the answer's recorded time.
 recorded:=pg_catalog.clock_timestamp();
 UPDATE app.site_visit SET completed_at=recorded WHERE tenant_id=tenant AND id=p_visit;
 INSERT INTO app.closeout_answer(tenant_id,id,job_id,work_order_id,site_visit_id,membership_id,question_version,answer,command_id,server_recorded_at)
  VALUES(tenant,answer_id,p_job,visit_row.work_order_id,p_visit,p_actor,'closeout-question.v1',p_answer,p_command,recorded);
 RETURN answer_id;
END $$;
CREATE OR REPLACE FUNCTION app.cb_authority(p_session uuid,p_job uuid,p_write boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; s app.job; v_job uuid; jobs uuid[];
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 SELECT m.id INTO a FROM app.contractor_session(p_session) x JOIN app.membership m ON(m.tenant_id,m.id,m.identity_user_id)=(x.tenant_id,x.membership_id,x.identity_user_id)
 WHERE x.tenant_id=t AND m.role='finance' AND coalesce(app.contractor_member_active(m.id),false)
  AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND EXISTS(SELECT 1 FROM app.role_grant g WHERE(g.tenant_id,g.membership_id)=(t,m.id) AND g.role='finance' AND g.scope_kind='tenant' AND g.scope_id=t
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(t,g.id)));
 IF a IS NULL THEN RAISE EXCEPTION 'BILLING_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Retained contractor billing/exports keep their original finance and job scope.
 PERFORM app.mon8_feature_decision(a,'accounting_export','retained_read');
 IF p_write THEN
  PERFORM app.mon8_require_feature(a,'work_orders');
  -- Shared organisation fence, job/group, ordered extra members, actor; no business locks after audit.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text,618));
  jobs:=ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(coalesce(nullif(current_setting('app.cb_job_ids',true),''),'[]')::jsonb) x UNION SELECT p_job ORDER BY 1);
  FOREACH v_job IN ARRAY jobs LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||v_job::text,417));
   PERFORM 1 FROM app.job WHERE tenant_id=t AND id=v_job FOR SHARE;
   PERFORM 1 FROM app.variation WHERE tenant_id=t AND job_id=v_job ORDER BY id FOR UPDATE;
  END LOOP;
  PERFORM 1 FROM app.membership WHERE tenant_id=t AND id=a FOR SHARE;
  IF NOT coalesce(app.contractor_member_active(a),false) OR NOT EXISTS(SELECT 1 FROM app.membership m JOIN app.role_grant g ON(g.tenant_id,g.membership_id)=(m.tenant_id,m.id) WHERE m.tenant_id=t AND m.id=a AND m.role='finance' AND g.role='finance' AND g.scope_kind='tenant' AND g.scope_id=t AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(t,g.id))) THEN RAISE EXCEPTION 'BILLING_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT j.* INTO s FROM app.job j JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
 WHERE j.tenant_id=t AND j.id=p_job AND c.job_track='contractor' AND c.environment='synthetic_demo';
 IF s.id IS NULL THEN RAISE EXCEPTION 'BILLING_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF p_write AND s.status<>'live' THEN RAISE EXCEPTION 'JOB_NOT_LIVE' USING ERRCODE='23514'; END IF;
 IF p_write THEN FOREACH v_job IN ARRAY jobs LOOP
  IF NOT EXISTS(SELECT 1 FROM app.job z JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(z.tenant_id,z.id) WHERE z.tenant_id=t AND z.id=v_job AND c.job_track='contractor' AND c.environment='synthetic_demo') THEN RAISE EXCEPTION 'BILLING_NOT_FOUND'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=v_job AND status='live') THEN RAISE EXCEPTION 'JOB_NOT_LIVE' USING ERRCODE='23514'; END IF;
 END LOOP; END IF;
 RETURN a;
END $$;
CREATE OR REPLACE FUNCTION identity.invite_member(session_digest char(64), t uuid, recipient varchar, assigned_role varchar)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
DECLARE s identity.session; a uuid; actor uuid; invitation_id uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO s FROM identity.session WHERE token_digest=session_digest AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
 -- Contractor revocation owns this same tenant key (seed 54). Take it before the authority read.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 SELECT * INTO s FROM identity.session WHERE token_digest=session_digest AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT m.account_id,m.id INTO a,actor FROM app.membership m WHERE m.tenant_id=t AND m.identity_user_id=s.user_id
  AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r
   WHERE r.tenant_id=m.tenant_id AND r.membership_id=m.id) FOR SHARE OF m;
 IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF assigned_role='operative' THEN PERFORM app.mon8_require_feature(actor,'operative_roles'); END IF;
 INSERT INTO identity.invitation(id,email,tenant_id,account_id,role,expires_at,issuer_user_id)
 VALUES(invitation_id,recipient,t,a,assigned_role,clock_timestamp()+interval '1 day',s.user_id);
 INSERT INTO identity.security_event VALUES(gen_random_uuid(),'invitation.created',invitation_id,clock_timestamp());
 RETURN invitation_id;
END $$;
CREATE OR REPLACE FUNCTION identity.provision_verified_challenge(challenge_id uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
DECLARE c identity.challenge; i identity.invitation; l identity.membership_locator; u uuid; t uuid; a uuid; m uuid; issuer uuid;
BEGIN
 SELECT * INTO c FROM identity.challenge WHERE id=challenge_id FOR UPDATE;
 IF NOT FOUND OR NOT c.verified OR c.consumed_at IS NULL OR c.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'invalid challenge' USING ERRCODE='22023';
 END IF;
 -- Consume the authorization latch on every outcome, including unknown signin/invitation.
 UPDATE identity.challenge SET verified=false WHERE id=c.id;
 SELECT user_id INTO u FROM identity.user_email WHERE email=c.email;
 IF c.purpose='signin' AND u IS NULL THEN RETURN NULL; END IF;
 IF c.purpose='invitation' THEN
  -- Match the contractor command lock before checking membership reuse.
  SELECT tenant_id INTO t FROM identity.invitation WHERE id=c.invitation_id AND email=c.email;
  IF t IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54)); END IF;
  SELECT * INTO i FROM identity.invitation WHERE id=c.invitation_id AND email=c.email
   AND accepted_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF i.role='operative' THEN
   PERFORM set_config('app.tenant_id',i.tenant_id::text,true);
   SELECT member_row.id INTO issuer FROM app.membership member_row WHERE member_row.tenant_id=i.tenant_id AND member_row.identity_user_id=i.issuer_user_id AND member_row.account_id=i.account_id
    AND member_row.role='owner' AND member_row.revoked_at IS NULL AND(member_row.expires_at IS NULL OR member_row.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=i.tenant_id AND r.membership_id=member_row.id)
    ORDER BY member_row.id LIMIT 1;
   IF issuer IS NULL THEN RETURN NULL; END IF;
   IF NOT (app.mon8_feature_decision(issuer,'operative_roles')->>'executable')::boolean OR c.expires_at<=clock_timestamp() THEN RETURN NULL; END IF;
  END IF;
 END IF;
 IF u IS NULL THEN
  u:=gen_random_uuid();
  INSERT INTO identity.identity_user(id) VALUES(u);
  INSERT INTO identity.user_email(email,user_id) VALUES(c.email,u);
  IF c.purpose='signup' THEN
   t:=gen_random_uuid(); a:=gen_random_uuid(); m:=gen_random_uuid();
   INSERT INTO control_plane.tenant(id) VALUES(t);
   PERFORM set_config('app.tenant_id',t::text,true);
   INSERT INTO app.account(id,tenant_id,name) VALUES(a,t,'New business');
   INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,t,a,u,'owner');
   INSERT INTO identity.membership_locator VALUES(u,t,m);
  END IF;
 END IF;
 IF c.purpose='invitation' THEN
  PERFORM set_config('app.tenant_id',i.tenant_id::text,true); m:=gen_random_uuid();
  -- The locator outlives revocation and expiry, so it is not itself a reason to refuse. Lock it, then lock the linked
  -- membership: only a currently ACTIVE membership blocks a fresh invitation (the invitation then stays unused).
  SELECT * INTO l FROM identity.membership_locator WHERE user_id=u AND tenant_id=i.tenant_id FOR UPDATE;
  IF FOUND THEN
   PERFORM 1 FROM app.membership WHERE tenant_id=l.tenant_id AND id=l.membership_id AND identity_user_id=u
    AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r
     WHERE r.tenant_id=l.tenant_id AND r.membership_id=l.membership_id) FOR SHARE;
   IF FOUND THEN RETURN NULL; END IF;
   -- Inactive: add the invitation-bound replacement and repoint the locator atomically. The revoked or expired
   -- membership row is kept untouched as history (audit rows keep referring to it).
   INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,i.tenant_id,i.account_id,u,i.role);
   UPDATE identity.membership_locator SET membership_id=m WHERE user_id=u AND tenant_id=i.tenant_id;
  ELSE
   INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,i.tenant_id,i.account_id,u,i.role);
   INSERT INTO identity.membership_locator VALUES(u,i.tenant_id,m);
  END IF;
  UPDATE identity.invitation SET accepted_at=clock_timestamp() WHERE id=i.id;
 END IF;
 INSERT INTO identity.security_event VALUES(gen_random_uuid(),'identity.verified',c.id,clock_timestamp());
 RETURN u;
END $$;
-- MON-8-P-B slice 1. No data backfill and no changes to retained-read predicates.
CREATE FUNCTION app.mon8_require_operative_agreement(t uuid) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE assignment app.commercial_track_assignment; agreement_status text;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF t IS NULL OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- Lock first; subsequent queries use a fresh READ COMMITTED snapshot after any wait.
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 SELECT * INTO assignment FROM app.commercial_track_assignment WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
 SELECT status INTO agreement_status FROM app.contractor_agreement_status_revision
 WHERE tenant_id=t AND assignment_id=assignment.id ORDER BY revision DESC LIMIT 1;
 IF assignment.commercial_track IS DISTINCT FROM 'contractor' OR agreement_status IS DISTINCT FROM 'active' THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
END $$;
ALTER FUNCTION app.mon8_require_operative_agreement(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_require_operative_agreement(uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

CREATE FUNCTION app.mon8_operative_write_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='extra_origin' THEN
  IF NEW.kind IN('site_user','jobguard_surfaced_confirmed') THEN
   PERFORM app.mon8_require_operative_agreement(NEW.tenant_id);
  END IF;
 ELSIF NEW.role='operative' THEN
  IF TG_OP='UPDATE' THEN
   -- Revocation/expiry updates and historical reads still work after agreement loss.
   IF NEW.role IS NOT DISTINCT FROM OLD.role AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id THEN RETURN NEW; END IF;
  END IF;
  PERFORM app.mon8_require_operative_agreement(NEW.tenant_id);
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.mon8_operative_write_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_operative_write_guard() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER mon8_operative_membership BEFORE INSERT OR UPDATE ON app.membership FOR EACH ROW EXECUTE FUNCTION app.mon8_operative_write_guard();
CREATE TRIGGER mon8_operative_grant BEFORE INSERT ON app.role_grant FOR EACH ROW EXECUTE FUNCTION app.mon8_operative_write_guard();
CREATE TRIGGER mon8_operative_invitation BEFORE INSERT ON identity.invitation FOR EACH ROW EXECUTE FUNCTION app.mon8_operative_write_guard();
-- Run before existing provenance triggers, including for a forged job_track value.
CREATE TRIGGER extra_origin_00_entitlement BEFORE INSERT ON app.extra_origin FOR EACH ROW EXECUTE FUNCTION app.mon8_operative_write_guard();

COMMIT;
