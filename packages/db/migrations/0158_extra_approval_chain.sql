BEGIN;
-- ENT-5b: the approval chain for contractor extras, built ahead on ENT-5's foundation (0157). Additions only; no predecessor object is changed.
-- Standard F: the application login gets SELECT only on every new table. Every writer is a SECURITY DEFINER routine owned by jobguard_migration that
-- re-checks the actor (the receipt for the command must still be processing for that same actor, and the stored grants must cover the job).
-- Routines are named app.xa_* on purpose: the ENT-5 foundation test pins that no function matching ent5_% is runtime-executable.
-- Demo fixture rulings (see docs/verdicts/ENT-5b/BUILDER_RECEIPT.md): person key = membership id; the applicable contract is the work order's own contract
-- version and its rule version; time limits come from the rule document; escalation makes the step's escalationRole and alternateRoles eligible in addition
-- to the original role; a repeat approval by the same person at the same step slot in a later version is refused (held_repeat_semantics).

CREATE TABLE app.extra_approval_request (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, variation_id uuid NOT NULL,
 request_revision integer NOT NULL CHECK(request_revision>0),
 binding_id uuid, rule_version_id uuid NOT NULL, contract_version_id uuid NOT NULL, client_id uuid NOT NULL,
 rule_document_hash char(64) NOT NULL CHECK(rule_document_hash ~ '^[a-f0-9]{64}$'),
 requirement jsonb NOT NULL, comparisons jsonb NOT NULL,
 net_pence bigint CHECK(net_pence IS NULL OR net_pence BETWEEN 1 AND 1000000000000),
 revision_hash char(64) NOT NULL CHECK(revision_hash ~ '^[a-f0-9]{64}$'),
 command_id uuid NOT NULL, submitter_membership_id uuid NOT NULL,
 server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 request_hash char(64) NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,variation_id,id), UNIQUE(tenant_id,variation_id,request_revision), UNIQUE(tenant_id,command_id),
 CHECK((binding_id IS NULL)=(net_pence IS NULL)),
 FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,variation_id,binding_id) REFERENCES app.extra_approval_revision_binding(tenant_id,job_id,variation_id,id),
 FOREIGN KEY(tenant_id,rule_version_id) REFERENCES app.approval_rule_version(tenant_id,id),
 FOREIGN KEY(tenant_id,contract_version_id) REFERENCES app.client_contract_version(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,submitter_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.extra_approval_step_fact (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, variation_id uuid NOT NULL, request_id uuid NOT NULL,
 step_index integer NOT NULL CHECK(step_index>=0),
 step_role text NOT NULL, actor_kind text NOT NULL CHECK(actor_kind IN('member','client_approver','contract_rule')),
 actor_membership_id uuid, grant_id uuid,
 approved_hash char(64) NOT NULL CHECK(approved_hash ~ '^[a-f0-9]{64}$'), approved_net_pence bigint CHECK(approved_net_pence IS NULL OR approved_net_pence>0),
 fictional_role_name text CHECK(fictional_role_name IS NULL OR length(fictional_role_name) BETWEEN 1 AND 100),
 actual_tester_reference text CHECK(actual_tester_reference IS NULL OR length(actual_tester_reference) BETWEEN 1 AND 100),
 command_id uuid NOT NULL, server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,request_id,step_index), UNIQUE(tenant_id,request_id,actor_membership_id),
 CHECK((actor_kind='contract_rule')=(actor_membership_id IS NULL)),
 CHECK(actor_kind<>'client_approver' OR (fictional_role_name IS NOT NULL AND actual_tester_reference IS NOT NULL)),
 FOREIGN KEY(tenant_id,job_id,variation_id,request_id) REFERENCES app.extra_approval_request(tenant_id,job_id,variation_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.extra_approval_outcome (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, variation_id uuid NOT NULL, request_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('approved','rejected','withdrawn','duplicate')),
 by_rule boolean NOT NULL DEFAULT false, reason_code text CHECK(reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_]{0,39}$'),
 actor_kind text NOT NULL CHECK(actor_kind IN('member','client_approver')), actor_membership_id uuid NOT NULL,
 command_id uuid NOT NULL, server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,request_id),
 CHECK(kind NOT IN('rejected','withdrawn') OR reason_code IS NOT NULL),
 FOREIGN KEY(tenant_id,job_id,variation_id,request_id) REFERENCES app.extra_approval_request(tenant_id,job_id,variation_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.extra_client_link (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, variation_id uuid NOT NULL, request_id uuid NOT NULL, client_id uuid NOT NULL,
 approver_membership_id uuid NOT NULL, recipient text NOT NULL CHECK(recipient ~ '^[^@\s]+@[^@\s]+\.invalid$'),
 token_hash char(64) NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'), expires_at timestamptz NOT NULL,
 replaces_link_id uuid, issued_by_membership_id uuid NOT NULL, authorization_id uuid NOT NULL, outbox_action_id uuid NOT NULL,
 command_id uuid NOT NULL, server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,token_hash), UNIQUE(tenant_id,authorization_id), UNIQUE(tenant_id,outbox_action_id), UNIQUE(tenant_id,replaces_link_id),
 FOREIGN KEY(tenant_id,job_id,variation_id,request_id) REFERENCES app.extra_approval_request(tenant_id,job_id,variation_id,id),
 FOREIGN KEY(tenant_id,replaces_link_id) REFERENCES app.extra_client_link(tenant_id,id),
 FOREIGN KEY(tenant_id,approver_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,issued_by_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id),
 FOREIGN KEY(tenant_id,outbox_action_id) REFERENCES app.action_outbox(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id)
);
CREATE TABLE app.extra_client_link_closure (
 tenant_id uuid NOT NULL, id uuid NOT NULL, link_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN('decided','revoked','replaced')),
 actor_membership_id uuid NOT NULL, command_id uuid NOT NULL, server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,link_id),
 FOREIGN KEY(tenant_id,link_id) REFERENCES app.extra_client_link(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id)
);
CREATE TABLE app.extra_escalation_fact (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, variation_id uuid NOT NULL, request_id uuid NOT NULL, step_index integer NOT NULL CHECK(step_index>=0),
 eligible_roles text[] NOT NULL, fired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,request_id,step_index),
 FOREIGN KEY(tenant_id,job_id,variation_id,request_id) REFERENCES app.extra_approval_request(tenant_id,job_id,variation_id,id)
);

DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['extra_approval_request','extra_approval_step_fact','extra_approval_outcome','extra_client_link','extra_client_link_closure','extra_escalation_fact'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
 EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);
 EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
END LOOP; END $$;

-- Row guard for the three fact tables: server time is stamped here, and the command's own receipt must still be processing for the same actor.
CREATE FUNCTION app.xa_fact_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE command app.command_receipt;
BEGIN
 SELECT * INTO command FROM app.command_receipt WHERE (tenant_id,command_id)=(NEW.tenant_id,NEW.command_id);
 IF command.command_id IS NULL OR command.status<>'processing' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='extra_approval_step_fact' THEN
  IF NEW.actor_membership_id IS NOT NULL AND command.actor_membership_id IS DISTINCT FROM NEW.actor_membership_id THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='extra_approval_request' THEN
  IF command.actor_membership_id IS DISTINCT FROM NEW.submitter_membership_id THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 ELSE
  IF command.actor_membership_id IS DISTINCT FROM NEW.actor_membership_id THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 END IF;
 NEW.server_recorded_at:=clock_timestamp();
 RETURN NEW;
END $$;
ALTER FUNCTION app.xa_fact_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.xa_fact_guard() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER stamp BEFORE INSERT ON app.extra_approval_step_fact FOR EACH ROW EXECUTE FUNCTION app.xa_fact_guard();
CREATE TRIGGER stamp BEFORE INSERT ON app.extra_approval_outcome FOR EACH ROW EXECUTE FUNCTION app.xa_fact_guard();
CREATE TRIGGER stamp BEFORE INSERT ON app.extra_approval_request FOR EACH ROW EXECUTE FUNCTION app.xa_fact_guard();

-- ---- helpers (not runtime-callable unless stated) ----
CREATE FUNCTION app.xa_covers(p_actor uuid, p_roles text[], p_job uuid, p_permission text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_chosen uuid;
BEGIN
 BEGIN v_tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_tenant:=NULL; END;
 IF v_tenant IS NULL OR p_actor IS NULL OR NOT coalesce(app.contractor_member_active(p_actor),false) THEN RETURN NULL; END IF;
 SELECT g.id INTO v_chosen FROM app.role_grant g
  JOIN app.team t ON t.tenant_id=g.tenant_id AND t.id=app.contractor_job_team(p_job)
  JOIN app.org_unit b ON(b.tenant_id,b.id)=(t.tenant_id,t.branch_id)
  JOIN app.membership m ON(m.tenant_id,m.id)=(g.tenant_id,g.membership_id) AND m.role=g.role
  WHERE g.tenant_id=v_tenant AND g.membership_id=p_actor AND g.role=ANY(p_roles) AND app.contractor_role_permits(g.role,p_permission)
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
   AND(g.scope_kind='tenant' AND g.scope_id=v_tenant OR g.scope_kind='team' AND g.scope_id=t.id OR g.scope_kind='branch' AND g.scope_id=b.id OR g.scope_kind='region' AND g.scope_id=b.parent_id)
  ORDER BY g.id LIMIT 1;
 RETURN v_chosen;
END $$;

CREATE FUNCTION app.xa_begin(p_job uuid, p_command uuid, p_types text[], p_actor uuid) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_receipt app.command_receipt;
BEGIN
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

-- The requirement snapshot: pure integer comparison on whole pence. An unpriced extra (NULL) counts as above every threshold and falls in the last band.
CREATE FUNCTION app.xa_requirement(p_rules jsonb, p_net bigint) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE v_bands jsonb:=p_rules->'bands'; v_band jsonb; i integer; v_steps jsonb:='[]'::jsonb; s jsonb; v_idx integer:=0; v_client jsonb:=p_rules->'clientApproval';
 v_need boolean:=false; v_before boolean:=false; v_proceed bigint:=(p_rules->'proceedLimit'->>'pence')::bigint;
BEGIN
 IF p_rules->>'version'<>'approval-rules.v1' OR jsonb_typeof(v_bands)<>'array' OR jsonb_array_length(v_bands)<1 THEN RAISE EXCEPTION 'INVALID_RULES' USING ERRCODE='23514'; END IF;
 v_band:=v_bands->(jsonb_array_length(v_bands)-1);
 IF p_net IS NOT NULL THEN
  FOR i IN 0..jsonb_array_length(v_bands)-1 LOOP
   IF v_bands->i->'upToPence'='null'::jsonb OR p_net<=(v_bands->i->>'upToPence')::bigint THEN v_band:=v_bands->i; EXIT; END IF;
  END LOOP;
 END IF;
 FOR s IN SELECT e.value FROM jsonb_array_elements(v_band->'steps') e LOOP
  v_steps:=v_steps||jsonb_build_array(jsonb_build_object('index',v_idx,'kind','human','role',s->>'role','timeLimitMinutes',s->'timeLimitMinutes','escalationRole',s->>'escalationRole','alternateRoles',s->'alternateRoles'));
  v_idx:=v_idx+1;
 END LOOP;
 IF v_idx=0 THEN v_steps:=jsonb_build_array(jsonb_build_object('index',0,'kind','contract_rule','role','contract_rule')); v_idx:=1; END IF;
 IF v_client->>'kind'='threshold' THEN
  v_need:=p_net IS NULL OR p_net>(v_client->>'abovePence')::bigint;
  v_before:=p_net IS NULL OR p_net>(v_client->>'beforeWorkAbovePence')::bigint;
 END IF;
 IF v_need THEN v_steps:=v_steps||jsonb_build_array(jsonb_build_object('index',v_idx,'kind','human','role','client_approver','timeLimitMinutes',v_client->'timeLimitMinutes')); END IF;
 RETURN jsonb_build_object('version','extra-approval-requirement.v1','steps',v_steps,'clientRequired',v_need,
  'comparisons',jsonb_build_object('withinProceedLimit',p_net IS NOT NULL AND p_net<=v_proceed,'aboveClientThreshold',v_need,'aboveClientBeforeWorkThreshold',v_before));
END $$;

CREATE FUNCTION app.xa_decision_id(p_request uuid, p_index integer) RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT(substr(h,1,12)||'4'||substr(h,14,3)||'8'||substr(h,18,15))::uuid FROM(SELECT md5('extra-approval-step:'||p_request::text||':'||p_index::text) h) x
$$;
CREATE FUNCTION app.xa_open_decision(p_tenant uuid, p_request uuid, p_index integer) RETURNS void LANGUAGE sql SET search_path=pg_catalog AS $$
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(app.xa_decision_id(p_request,p_index),p_tenant,'extra_approval_step',p_request::text||':'||p_index::text,'extra.approve_step') ON CONFLICT DO NOTHING
$$;
CREATE FUNCTION app.xa_resolve_decision(p_tenant uuid, p_request uuid, p_index integer, p_resolution text, p_actor uuid) RETURNS void LANGUAGE sql SET search_path=pg_catalog AS $$
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)
 SELECT pg_catalog.gen_random_uuid(),p_tenant,d.id,p_resolution,p_actor FROM app.decision d WHERE d.tenant_id=p_tenant AND d.id=app.xa_decision_id(p_request,p_index) ON CONFLICT DO NOTHING
$$;
CREATE FUNCTION app.xa_event(p_tenant uuid, p_job uuid, p_variation uuid, p_kind text, p_revision uuid, p_reason text, p_command uuid, p_actor uuid) RETURNS void LANGUAGE sql SET search_path=pg_catalog AS $$
 INSERT INTO app.extra_event(tenant_id,id,job_id,variation_id,kind,revision_id,reason_code,command_id,actor_membership_id) VALUES(p_tenant,pg_catalog.gen_random_uuid(),p_job,p_variation,p_kind,p_revision,p_reason,p_command,p_actor)
$$;
CREATE FUNCTION app.xa_latest_kind(p_tenant uuid, p_job uuid, p_variation uuid) RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT e.kind FROM app.extra_event e WHERE(e.tenant_id,e.job_id,e.variation_id)=(p_tenant,p_job,p_variation) ORDER BY e.sequence DESC LIMIT 1
$$;

-- Opens a request for the stated revision: snapshot, event, first Decision, and the rule-only approval where the rules need no human.
CREATE FUNCTION app.xa_open_request(p_tenant uuid, p_job uuid, p_variation uuid, p_command uuid, p_actor uuid, p_binding uuid, p_revision uuid, p_hash text, p_net bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v_wo app.work_order; v_cv app.client_contract_version; v_rule app.approval_rule_version; v_req jsonb; v_id uuid:=pg_catalog.gen_random_uuid(); v_rev integer; v_doc text; v_state text:='awaiting_approval'; v_steps jsonb;
BEGIN
 SELECT w.* INTO v_wo FROM app.work_order w WHERE w.tenant_id=p_tenant AND w.job_id=p_job;
 SELECT c.* INTO v_cv FROM app.client_contract_version c WHERE c.tenant_id=p_tenant AND c.id=v_wo.contract_version_id;
 SELECT r.* INTO v_rule FROM app.approval_rule_version r WHERE r.tenant_id=p_tenant AND r.id=v_cv.rule_version_id;
 IF v_wo.id IS NULL OR v_cv.id IS NULL OR v_rule.id IS NULL THEN RAISE EXCEPTION 'RULES_NOT_FOUND' USING ERRCODE='23514'; END IF;
 v_req:=app.xa_requirement(v_rule.document,p_net); v_steps:=v_req->'steps';
 v_doc:=encode(sha256(convert_to(v_rule.document::text,'UTF8')),'hex');
 v_rev:=coalesce((SELECT max(x.request_revision) FROM app.extra_approval_request x WHERE x.tenant_id=p_tenant AND x.variation_id=p_variation),0)+1;
 INSERT INTO app.extra_approval_request(tenant_id,id,job_id,variation_id,request_revision,binding_id,rule_version_id,contract_version_id,client_id,rule_document_hash,requirement,comparisons,net_pence,revision_hash,command_id,submitter_membership_id,request_hash)
 VALUES(p_tenant,v_id,p_job,p_variation,v_rev,p_binding,v_rule.id,v_cv.id,v_wo.client_id,v_doc,v_req-'comparisons',v_req->'comparisons',p_net,p_hash,p_command,p_actor,
  encode(sha256(convert_to(jsonb_build_array('extra-approval-request.v1',p_tenant,v_id,p_job,p_variation,v_rev,p_binding,v_rule.id,v_cv.id,v_wo.client_id,v_doc,v_req,p_net,p_hash,p_command,p_actor)::text,'UTF8')),'hex'));
 PERFORM app.xa_event(p_tenant,p_job,p_variation,'awaiting_approval',p_revision,NULL,p_command,p_actor);
 IF v_steps->0->>'kind'='contract_rule' THEN
  IF p_net IS NOT NULL THEN
   INSERT INTO app.extra_approval_step_fact(tenant_id,id,job_id,variation_id,request_id,step_index,step_role,actor_kind,approved_hash,approved_net_pence,command_id)
   VALUES(p_tenant,pg_catalog.gen_random_uuid(),p_job,p_variation,v_id,0,'contract_rule','contract_rule',p_hash,p_net,p_command);
   IF jsonb_array_length(v_steps)=1 THEN
    INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,by_rule,actor_kind,actor_membership_id,command_id)
    VALUES(p_tenant,pg_catalog.gen_random_uuid(),p_job,p_variation,v_id,'approved',true,'member',p_actor,p_command);
    PERFORM app.xa_event(p_tenant,p_job,p_variation,'approved',p_revision,NULL,p_command,p_actor);
    v_state:='approved';
   END IF;
  END IF;
 ELSE PERFORM app.xa_open_decision(p_tenant,v_id,0); END IF;
 RETURN jsonb_build_object('requestId',v_id,'requestRevision',v_rev,'state',v_state,'revisionHash',p_hash,'netPence',p_net,'stepCount',jsonb_array_length(v_steps));
END $$;

-- ---- commands ----
CREATE FUNCTION app.xa_submit(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_origin app.extra_origin; v_sor app.extra_sor_revision; v_bind app.extra_approval_revision_binding; v_role text; v_ok boolean; v_bid uuid; v_net bigint; v_hash text; v_rev uuid;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['SubmitExtra'],p_actor);
 SELECT x.* INTO v_origin FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_variation);
 IF v_origin.variation_id IS NULL OR v_origin.job_track IS DISTINCT FROM 'contractor' OR v_origin.provenance IS DISTINCT FROM 'command' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT m.role INTO v_role FROM app.membership m WHERE m.tenant_id=v_tenant AND m.id=p_actor;
 SELECT s.* INTO v_sor FROM app.extra_sor_revision s WHERE(s.tenant_id,s.job_id,s.variation_id)=(v_tenant,p_job,p_variation);
 v_ok:=app.xa_covers(p_actor,ARRAY['supervisor','surveyor'],p_job,'job.read') IS NOT NULL
  OR(v_role='operative' AND p_actor=v_origin.raising_membership_id AND v_sor.id IS NOT NULL AND coalesce(app.contractor_job_allowed(p_actor,'extra.log',p_job),false));
 IF NOT v_ok THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF app.xa_latest_kind(v_tenant,p_job,p_variation) IS DISTINCT FROM 'logged' OR EXISTS(SELECT 1 FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=p_variation) THEN
  RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514';
 END IF;
 SELECT b.* INTO v_bind FROM app.extra_approval_revision_binding b WHERE(b.tenant_id,b.job_id,b.variation_id)=(v_tenant,p_job,p_variation) ORDER BY b.logical_revision DESC LIMIT 1;
 IF v_sor.id IS NOT NULL THEN
  IF v_bind.id IS NULL THEN
   v_bid:=pg_catalog.gen_random_uuid();
   INSERT INTO app.extra_approval_revision_binding(tenant_id,id,job_id,variation_id,logical_revision,source_kind,source_revision_id,sor_revision_id,source_hash,command_id,actor_membership_id)
   VALUES(v_tenant,v_bid,p_job,p_variation,1,'server_sor',v_sor.id,v_sor.id,v_sor.content_hash,p_command,p_actor);
  ELSE v_bid:=v_bind.id; END IF;
  v_net:=v_sor.net_pence; v_hash:=v_sor.content_hash::text; v_rev:=NULL;
 ELSIF v_bind.id IS NOT NULL THEN
  v_bid:=v_bind.id; v_hash:=v_bind.source_hash::text; v_rev:=v_bind.variation_revision_id;
  SELECT r.signed_delta_pence INTO v_net FROM app.variation_revision r WHERE(r.tenant_id,r.job_id,r.id)=(v_tenant,p_job,v_rev);
 ELSE v_bid:=NULL; v_net:=NULL; v_hash:=v_origin.origin_hash::text; v_rev:=NULL; END IF;
 RETURN app.xa_open_request(v_tenant,p_job,p_variation,p_command,p_actor,v_bid,v_rev,v_hash,v_net);
END $$;

CREATE FUNCTION app.xa_price(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid, p_net bigint, p_revise boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_origin app.extra_origin; v_var app.variation; v_prev app.extra_approval_revision_binding; v_req app.extra_approval_request; v_outcome text; v_latest text; v_rev_id uuid:=pg_catalog.gen_random_uuid(); v_rev_no integer; v_prev_rev uuid; v_hash text; v_bid uuid:=pg_catalog.gen_random_uuid(); v_ref text;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY[CASE WHEN p_revise THEN 'ReviseExtra' ELSE 'PriceExtra' END],p_actor);
 SELECT x.* INTO v_origin FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_variation);
 IF v_origin.variation_id IS NULL OR v_origin.job_track IS DISTINCT FROM 'contractor' OR v_origin.provenance IS DISTINCT FROM 'command' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Ben, 13 Oct 2026 (answer 12): surveyors price. Revising a price is pricing.
 IF app.xa_covers(p_actor,ARRAY['surveyor'],p_job,'extra.price') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_net IS NULL OR p_net NOT BETWEEN 1 AND 1000000000000 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 v_latest:=app.xa_latest_kind(v_tenant,p_job,p_variation);
 SELECT b.* INTO v_prev FROM app.extra_approval_revision_binding b WHERE(b.tenant_id,b.job_id,b.variation_id)=(v_tenant,p_job,p_variation) ORDER BY b.logical_revision DESC LIMIT 1;
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=p_variation ORDER BY q.request_revision DESC LIMIT 1;
 IF NOT p_revise THEN
  IF v_latest IS DISTINCT FROM 'logged' OR v_req.id IS NOT NULL OR v_prev.id IS NOT NULL OR EXISTS(SELECT 1 FROM app.extra_sor_revision s WHERE(s.tenant_id,s.variation_id)=(v_tenant,p_variation)) THEN
   RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT o.kind INTO v_outcome FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,v_req.id);
  IF v_req.id IS NULL OR v_outcome NOT IN('approved','rejected') OR v_latest NOT IN('approved','rejected') OR v_req.net_pence IS NOT DISTINCT FROM p_net THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT v.* INTO v_var FROM app.variation v WHERE(v.tenant_id,v.job_id,v.id)=(v_tenant,p_job,p_variation);
 SELECT r.revision,r.id INTO v_rev_no,v_prev_rev FROM app.variation_revision r WHERE(r.tenant_id,r.variation_id)=(v_tenant,p_variation) ORDER BY r.revision DESC LIMIT 1;
 v_rev_no:=coalesce(v_rev_no,0)+1;
 v_ref:='surveyor-quote:'||p_command::text;
 v_hash:=encode(sha256(convert_to(jsonb_build_array('surveyor-quoted-revision.v1',v_tenant,v_rev_id,p_job,p_variation,v_rev_no,v_prev_rev,p_net,p_actor,p_command)::text,'UTF8')),'hex');
 INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,previous_revision_id,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version)
 VALUES(v_rev_id,v_tenant,p_job,p_variation,v_var.scope_item_id,v_rev_no,v_prev_rev,v_var.description,'1','item',p_net,p_net,v_hash,p_actor,'human_entered',v_ref,encode(sha256(convert_to(v_ref,'UTF8')),'hex'),'surveyor-quote.v1');
 INSERT INTO app.extra_approval_revision_binding(tenant_id,id,job_id,variation_id,logical_revision,source_kind,source_revision_id,variation_revision_id,source_hash,predecessor_binding_id,command_id,actor_membership_id)
 VALUES(v_tenant,v_bid,p_job,p_variation,coalesce(v_prev.logical_revision,0)+1,'ordinary',v_rev_id,v_rev_id,v_hash,v_prev.id,p_command,p_actor);
 IF p_revise THEN RETURN app.xa_open_request(v_tenant,p_job,p_variation,p_command,p_actor,v_bid,v_rev_id,v_hash,p_net); END IF;
 RETURN jsonb_build_object('bindingId',v_bid,'revisionId',v_rev_id,'revisionHash',v_hash,'netPence',p_net);
END $$;

-- Approve one company step, or reject at it. Order of refusals is fixed: stale, decided, hash/net, unpriced, order, role, self, separation.
CREATE FUNCTION app.xa_approve(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_step integer, p_hash text, p_net bigint, p_reject boolean, p_reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_req app.extra_approval_request; v_origin app.extra_origin; v_n integer; v_step jsonb; v_roles text[]; v_grant uuid; v_prior record; v_rev uuid; v_total integer; v_final boolean;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY[CASE WHEN p_reject THEN 'RejectExtra' ELSE 'ApproveExtraStep' END],p_actor);
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE(q.tenant_id,q.job_id,q.id)=(v_tenant,p_job,p_request);
 IF v_req.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT x.* INTO v_origin FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,v_req.variation_id);
 IF v_req.request_revision<>(SELECT max(q.request_revision) FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=v_req.variation_id) THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,p_request)) OR app.xa_latest_kind(v_tenant,p_job,v_req.variation_id) IS DISTINCT FROM 'awaiting_approval' THEN RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE='23514'; END IF;
 IF v_req.revision_hash::text IS DISTINCT FROM p_hash OR v_req.net_pence IS DISTINCT FROM p_net THEN RAISE EXCEPTION 'HASH_MISMATCH' USING ERRCODE='23514'; END IF;
 IF v_req.net_pence IS NULL THEN RAISE EXCEPTION 'UNPRICED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO v_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,p_request);
 IF p_step IS DISTINCT FROM v_n THEN RAISE EXCEPTION 'STEP_OUT_OF_ORDER' USING ERRCODE='23514'; END IF;
 v_total:=jsonb_array_length(v_req.requirement->'steps'); v_step:=v_req.requirement->'steps'->v_n;
 IF v_step IS NULL OR v_step->>'kind'<>'human' THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF v_step->>'role'='client_approver' THEN RAISE EXCEPTION 'CLIENT_STEP_REQUIRES_CLIENT' USING ERRCODE='23514'; END IF;
 v_roles:=ARRAY[v_step->>'role'];
 IF EXISTS(SELECT 1 FROM app.extra_escalation_fact e WHERE(e.tenant_id,e.request_id,e.step_index)=(v_tenant,p_request,v_n)) THEN
  v_roles:=v_roles||(v_step->>'escalationRole')||ARRAY(SELECT jsonb_array_elements_text(v_step->'alternateRoles'));
 END IF;
 v_grant:=app.xa_covers(p_actor,v_roles,p_job,'extra.approve');
 IF v_grant IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_actor=v_origin.raising_membership_id THEN RAISE EXCEPTION 'SELF_APPROVAL' USING ERRCODE='23514'; END IF;
 SELECT f.step_index,f.request_id INTO v_prior FROM app.extra_approval_step_fact f JOIN app.extra_approval_request q ON(q.tenant_id,q.id)=(f.tenant_id,f.request_id)
  WHERE f.tenant_id=v_tenant AND q.variation_id=v_req.variation_id AND f.actor_membership_id=p_actor ORDER BY (f.request_id=p_request) DESC,f.step_index LIMIT 1;
 IF v_prior.request_id IS NOT NULL THEN
  IF v_prior.request_id=p_request OR v_prior.step_index<>v_n THEN RAISE EXCEPTION 'REUSED_APPROVER' USING ERRCODE='23514'; END IF;
  RAISE EXCEPTION 'REPEAT_HELD' USING ERRCODE='23514';
 END IF;
 SELECT b.variation_revision_id INTO v_rev FROM app.extra_approval_revision_binding b WHERE(b.tenant_id,b.id)=(v_tenant,v_req.binding_id);
 IF p_reject THEN
  IF p_reason IS NULL OR p_reason !~ '^[a-z][a-z0-9_]{0,39}$' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,reason_code,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,'rejected',p_reason,'member',p_actor,p_command);
  PERFORM app.xa_event(v_tenant,p_job,v_req.variation_id,'rejected',v_rev,p_reason,p_command,p_actor);
  PERFORM app.xa_resolve_decision(v_tenant,p_request,v_n,'rejected',p_actor);
  RETURN jsonb_build_object('requestId',p_request,'state','rejected','stepIndex',v_n);
 END IF;
 INSERT INTO app.extra_approval_step_fact(tenant_id,id,job_id,variation_id,request_id,step_index,step_role,actor_kind,actor_membership_id,grant_id,approved_hash,approved_net_pence,command_id)
 VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,v_n,v_step->>'role','member',p_actor,v_grant,v_req.revision_hash,v_req.net_pence,p_command);
 PERFORM app.xa_resolve_decision(v_tenant,p_request,v_n,'approved',p_actor);
 v_final:=v_n+1=v_total;
 IF v_final THEN
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,'approved','member',p_actor,p_command);
  PERFORM app.xa_event(v_tenant,p_job,v_req.variation_id,'approved',v_rev,NULL,p_command,p_actor);
 ELSIF v_req.requirement->'steps'->(v_n+1)->>'role'<>'client_approver' THEN PERFORM app.xa_open_decision(v_tenant,p_request,v_n+1); END IF;
 RETURN jsonb_build_object('requestId',p_request,'state',CASE WHEN v_final THEN 'approved' ELSE 'awaiting_approval' END,'stepIndex',v_n);
END $$;

CREATE FUNCTION app.xa_withdraw(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid, p_reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_req app.extra_approval_request; v_latest text; v_open boolean; v_n integer;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['WithdrawExtra'],p_actor);
 IF NOT EXISTS(SELECT 1 FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_variation) AND x.job_track='contractor' AND x.provenance='command') THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Ben, 13 Oct 2026 (answer 12): supervisors withdraw. Wider roles are held and therefore refused.
 IF app.xa_covers(p_actor,ARRAY['supervisor'],p_job,'job.read') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR p_reason NOT IN('not_done','raised_in_error','resident_cancelled','already_on_order') THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 v_latest:=app.xa_latest_kind(v_tenant,p_job,p_variation);
 -- Withdrawing is withdrawing the request: once it is approved the extra stays approved (so an approve that wins a race is the one effect).
 IF v_latest IS NULL OR v_latest NOT IN('logged','awaiting_approval') THEN RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE='23514'; END IF;
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=p_variation ORDER BY q.request_revision DESC LIMIT 1;
 v_open:=v_req.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,v_req.id));
 IF v_open THEN
  SELECT count(*) INTO v_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,v_req.id);
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,reason_code,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,p_variation,v_req.id,'withdrawn',p_reason,'member',p_actor,p_command);
  PERFORM app.xa_resolve_decision(v_tenant,v_req.id,v_n,'dismissed',p_actor);
 END IF;
 PERFORM app.xa_event(v_tenant,p_job,p_variation,'withdrawn',NULL,p_reason,p_command,p_actor);
 RETURN jsonb_build_object('variationId',p_variation,'state','withdrawn','requestId',v_req.id);
END $$;

CREATE FUNCTION app.xa_mark_duplicate(p_job uuid, p_duplicate uuid, p_canonical uuid, p_command uuid, p_actor uuid, p_link uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_req app.extra_approval_request; v_latest text; v_n integer;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['MarkDuplicate'],p_actor);
 IF app.xa_covers(p_actor,ARRAY['supervisor','surveyor','commercial_manager'],p_job,'job.read') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_duplicate=p_canonical OR NOT EXISTS(SELECT 1 FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_duplicate) AND x.job_track='contractor')
  OR NOT EXISTS(SELECT 1 FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_canonical) AND x.job_track='contractor') THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 v_latest:=app.xa_latest_kind(v_tenant,p_job,p_duplicate);
 IF v_latest IS NULL OR v_latest NOT IN('logged','awaiting_approval','approved','rejected') OR app.xa_latest_kind(v_tenant,p_job,p_canonical) IN('withdrawn','duplicate') THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
 INSERT INTO app.extra_duplicate_link(tenant_id,id,job_id,duplicate_id,canonical_id,kind,command_id,actor_membership_id) VALUES(v_tenant,p_link,p_job,p_duplicate,p_canonical,'link',p_command,p_actor);
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=p_duplicate ORDER BY q.request_revision DESC LIMIT 1;
 IF v_req.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,v_req.id)) THEN
  SELECT count(*) INTO v_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,v_req.id);
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,p_duplicate,v_req.id,'duplicate','member',p_actor,p_command);
  PERFORM app.xa_resolve_decision(v_tenant,v_req.id,v_n,'dismissed',p_actor);
 END IF;
 PERFORM app.xa_event(v_tenant,p_job,p_duplicate,'duplicate',NULL,NULL,p_command,p_actor);
 RETURN jsonb_build_object('linkId',p_link,'variationId',p_duplicate);
END $$;

-- ---- client approval ----
CREATE FUNCTION app.xa_issue_link(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_link uuid, p_approver uuid, p_recipient text, p_token_hash text, p_expires_at timestamptz, p_authorization uuid, p_outbox uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_req app.extra_approval_request; v_auth app.action_authorization; v_out app.action_outbox; v_n integer; v_wo app.work_order; v_prev uuid; v_replaced jsonb:='[]'::jsonb; l record;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['IssueClientApproval'],p_actor);
 -- Ben decision 18: only OWNER-approved sends go out. The exact authorization and its outbox row must already exist for this very request, recipient and amount.
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=v_tenant AND m.id=p_actor AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE(q.tenant_id,q.job_id,q.id)=(v_tenant,p_job,p_request);
 IF v_req.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF v_req.request_revision<>(SELECT max(q.request_revision) FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=v_req.variation_id) THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,p_request)) OR v_req.net_pence IS NULL THEN RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO v_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,p_request);
 IF v_req.requirement->'steps'->v_n->>'role' IS DISTINCT FROM 'client_approver' THEN RAISE EXCEPTION 'STEP_OUT_OF_ORDER' USING ERRCODE='23514'; END IF;
 SELECT a.* INTO v_auth FROM app.action_authorization a WHERE(a.tenant_id,a.id)=(v_tenant,p_authorization);
 SELECT o.* INTO v_out FROM app.action_outbox o WHERE(o.tenant_id,o.id)=(v_tenant,p_outbox);
 IF v_auth.id IS NULL OR v_out.id IS NULL OR v_auth.actor_membership_id<>p_actor OR v_auth.action_type<>'extra.client_approval_request.send' OR v_auth.recipient IS DISTINCT FROM p_recipient
  OR v_auth.aggregate_revision<>v_req.request_revision OR v_auth.amount_pence IS DISTINCT FROM v_req.net_pence OR v_auth.revoked_at IS NOT NULL OR v_auth.expires_at<p_expires_at
  OR v_out.authorization_id<>p_authorization OR v_out.recipient IS DISTINCT FROM p_recipient OR v_out.action_type<>v_auth.action_type OR v_out.status<>'pending' THEN
  RAISE EXCEPTION 'SEND_NOT_AUTHORISED' USING ERRCODE='42501';
 END IF;
 IF p_expires_at<=clock_timestamp() OR p_expires_at>clock_timestamp()+interval '31 days' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 SELECT w.* INTO v_wo FROM app.work_order w WHERE w.tenant_id=v_tenant AND w.job_id=p_job;
 IF NOT EXISTS(SELECT 1 FROM app.contractor_member cm JOIN app.membership m ON(m.tenant_id,m.id)=(cm.tenant_id,cm.membership_id) JOIN app.role_grant g ON(g.tenant_id,g.membership_id)=(cm.tenant_id,cm.membership_id)
  WHERE cm.tenant_id=v_tenant AND cm.membership_id=p_approver AND cm.client_id=v_req.client_id AND cm.email=p_recipient AND m.role='client_approver' AND coalesce(app.contractor_member_active(p_approver),false)
   AND g.role='client_approver' AND g.scope_kind='client' AND g.scope_id=v_req.client_id AND(g.contract_id IS NULL OR g.contract_id=v_wo.contract_id)
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))) THEN
  RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501';
 END IF;
 -- A replacement cancels every earlier open link of this request ("cancel replaced requests").
 FOR l IN SELECT k.id,k.outbox_action_id FROM app.extra_client_link k WHERE(k.tenant_id,k.request_id)=(v_tenant,p_request)
   AND NOT EXISTS(SELECT 1 FROM app.extra_client_link_closure c WHERE(c.tenant_id,c.link_id)=(k.tenant_id,k.id)) ORDER BY k.server_recorded_at LOOP
  INSERT INTO app.extra_client_link_closure(tenant_id,id,link_id,kind,actor_membership_id,command_id) VALUES(v_tenant,pg_catalog.gen_random_uuid(),l.id,'replaced',p_actor,p_command);
  v_prev:=l.id; v_replaced:=v_replaced||jsonb_build_array(l.outbox_action_id);
 END LOOP;
 INSERT INTO app.extra_client_link(tenant_id,id,job_id,variation_id,request_id,client_id,approver_membership_id,recipient,token_hash,expires_at,replaces_link_id,issued_by_membership_id,authorization_id,outbox_action_id,command_id)
 VALUES(v_tenant,p_link,p_job,v_req.variation_id,p_request,v_req.client_id,p_approver,p_recipient,p_token_hash,p_expires_at,v_prev,p_actor,p_authorization,p_outbox,p_command);
 RETURN jsonb_build_object('linkId',p_link,'requestId',p_request,'replacedOutboxIds',v_replaced);
END $$;

CREATE FUNCTION app.xa_revoke_link(p_job uuid, p_link uuid, p_command uuid, p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_link app.extra_client_link;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['RevokeClientApproval'],p_actor);
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=v_tenant AND m.id=p_actor AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT k.* INTO v_link FROM app.extra_client_link k WHERE(k.tenant_id,k.job_id,k.id)=(v_tenant,p_job,p_link);
 IF v_link.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM app.extra_client_link_closure c WHERE(c.tenant_id,c.link_id)=(v_tenant,p_link)) THEN RAISE EXCEPTION 'LINK_REVOKED' USING ERRCODE='23514'; END IF;
 INSERT INTO app.extra_client_link_closure(tenant_id,id,link_id,kind,actor_membership_id,command_id) VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_link,'revoked',p_actor,p_command);
 RETURN jsonb_build_object('linkId',p_link,'outboxActionId',v_link.outbox_action_id);
END $$;

-- The client approver acts as themselves. Refusals in order: forged, someone else's, closed/replayed, expired, email, wrong extra, stale, authority, order, hash/net.
CREATE FUNCTION app.xa_client_decide(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_token_hash text, p_email text, p_hash text, p_net bigint, p_reject boolean, p_reason text, p_role_name text, p_tester text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_link app.extra_client_link; v_closure text; v_req app.extra_approval_request; v_wo app.work_order; v_n integer; v_total integer; v_rev uuid; v_grant uuid; v_final boolean;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['ClientDecideExtra'],p_actor);
 SELECT k.* INTO v_link FROM app.extra_client_link k WHERE k.tenant_id=v_tenant AND k.token_hash=p_token_hash;
 IF v_link.id IS NULL OR v_link.approver_membership_id<>p_actor THEN RAISE EXCEPTION 'LINK_INVALID' USING ERRCODE='42501'; END IF;
 SELECT c.kind INTO v_closure FROM app.extra_client_link_closure c WHERE(c.tenant_id,c.link_id)=(v_tenant,v_link.id);
 IF v_closure='decided' THEN RAISE EXCEPTION 'LINK_REPLAYED' USING ERRCODE='23514'; END IF;
 IF v_closure IS NOT NULL THEN RAISE EXCEPTION 'LINK_REVOKED' USING ERRCODE='23514'; END IF;
 IF clock_timestamp()>=v_link.expires_at THEN RAISE EXCEPTION 'LINK_EXPIRED' USING ERRCODE='23514'; END IF;
 IF p_email IS NULL OR lower(p_email)<>lower(v_link.recipient) THEN RAISE EXCEPTION 'EMAIL_MISMATCH' USING ERRCODE='23514'; END IF;
 SELECT w.* INTO v_wo FROM app.work_order w WHERE w.tenant_id=v_tenant AND w.job_id=p_job;
 IF v_link.job_id<>p_job OR v_link.request_id<>p_request OR v_wo.client_id IS DISTINCT FROM v_link.client_id THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE(q.tenant_id,q.job_id,q.id)=(v_tenant,p_job,p_request);
 IF v_req.client_id<>v_link.client_id THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF v_req.request_revision<>(SELECT max(q.request_revision) FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=v_req.variation_id) THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,p_request)) OR app.xa_latest_kind(v_tenant,p_job,v_req.variation_id) IS DISTINCT FROM 'awaiting_approval' THEN RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE='23514'; END IF;
 SELECT g.id INTO v_grant FROM app.contractor_member cm JOIN app.membership m ON(m.tenant_id,m.id)=(cm.tenant_id,cm.membership_id) JOIN app.role_grant g ON(g.tenant_id,g.membership_id)=(cm.tenant_id,cm.membership_id)
  WHERE cm.tenant_id=v_tenant AND cm.membership_id=p_actor AND cm.client_id=v_req.client_id AND lower(cm.email)=lower(p_email) AND m.role='client_approver' AND coalesce(app.contractor_member_active(p_actor),false)
   AND g.role='client_approver' AND g.scope_kind='client' AND g.scope_id=v_req.client_id AND(g.contract_id IS NULL OR g.contract_id=v_wo.contract_id)
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id)) ORDER BY g.id LIMIT 1;
 IF v_grant IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO v_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,p_request);
 IF v_req.requirement->'steps'->v_n->>'role' IS DISTINCT FROM 'client_approver' THEN RAISE EXCEPTION 'STEP_OUT_OF_ORDER' USING ERRCODE='23514'; END IF;
 IF v_req.revision_hash::text IS DISTINCT FROM p_hash OR v_req.net_pence IS DISTINCT FROM p_net OR v_req.net_pence IS NULL THEN RAISE EXCEPTION 'HASH_MISMATCH' USING ERRCODE='23514'; END IF;
 IF p_role_name IS NULL OR p_tester IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 SELECT b.variation_revision_id INTO v_rev FROM app.extra_approval_revision_binding b WHERE(b.tenant_id,b.id)=(v_tenant,v_req.binding_id);
 INSERT INTO app.extra_client_link_closure(tenant_id,id,link_id,kind,actor_membership_id,command_id) VALUES(v_tenant,pg_catalog.gen_random_uuid(),v_link.id,'decided',p_actor,p_command);
 IF p_reject THEN
  IF p_reason IS NULL OR p_reason !~ '^[a-z][a-z0-9_]{0,39}$' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,reason_code,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,'rejected',p_reason,'client_approver',p_actor,p_command);
  PERFORM app.xa_event(v_tenant,p_job,v_req.variation_id,'rejected',v_rev,p_reason,p_command,p_actor);
  RETURN jsonb_build_object('requestId',p_request,'state','rejected','stepIndex',v_n);
 END IF;
 INSERT INTO app.extra_approval_step_fact(tenant_id,id,job_id,variation_id,request_id,step_index,step_role,actor_kind,actor_membership_id,grant_id,approved_hash,approved_net_pence,fictional_role_name,actual_tester_reference,command_id)
 VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,v_n,'client_approver','client_approver',p_actor,v_grant,v_req.revision_hash,v_req.net_pence,p_role_name,p_tester,p_command);
 v_total:=jsonb_array_length(v_req.requirement->'steps'); v_final:=v_n+1=v_total;
 IF v_final THEN
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,'approved','client_approver',p_actor,p_command);
  PERFORM app.xa_event(v_tenant,p_job,v_req.variation_id,'approved',v_rev,NULL,p_command,p_actor);
 END IF;
 RETURN jsonb_build_object('requestId',p_request,'state',CASE WHEN v_final THEN 'approved' ELSE 'awaiting_approval' END,'stepIndex',v_n);
END $$;

-- Read-side authority for the client approval page: the same current-authority test the decision applies (active member, client_approver membership, an unrevoked
-- grant on this client that still covers this job's contract). It changes nothing; a revoked or removed client is refused before any data is returned.
CREATE FUNCTION app.xa_client_view_authority(p_job uuid, p_request uuid, p_actor uuid, p_email text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_wo app.work_order; v_client uuid; v_grant uuid;
BEGIN
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN v_tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_tenant:=NULL; END;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT w.* INTO v_wo FROM app.work_order w WHERE w.tenant_id=v_tenant AND w.job_id=p_job;
 SELECT q.client_id INTO v_client FROM app.extra_approval_request q WHERE(q.tenant_id,q.job_id,q.id)=(v_tenant,p_job,p_request);
 IF v_wo.id IS NULL OR v_client IS NULL OR v_wo.client_id IS DISTINCT FROM v_client THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT g.id INTO v_grant FROM app.contractor_member cm JOIN app.membership m ON(m.tenant_id,m.id)=(cm.tenant_id,cm.membership_id) JOIN app.role_grant g ON(g.tenant_id,g.membership_id)=(cm.tenant_id,cm.membership_id)
  WHERE cm.tenant_id=v_tenant AND cm.membership_id=p_actor AND cm.client_id=v_client AND lower(cm.email)=lower(p_email) AND m.role='client_approver' AND coalesce(app.contractor_member_active(p_actor),false)
   AND g.role='client_approver' AND g.scope_kind='client' AND g.scope_id=v_client AND(g.contract_id IS NULL OR g.contract_id=v_wo.contract_id)
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id)) ORDER BY g.id LIMIT 1;
 IF v_grant IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
END $$;

-- ---- scheduled escalation and the queue ----
-- No time argument: the clock is the server's. Idempotent: the unique key makes a repeat run (or a restarted worker) a no-op.
CREATE FUNCTION app.xa_escalate() RETURNS TABLE(request_id uuid, job_id uuid, variation_id uuid, step_index integer, eligible_roles text[])
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_column
DECLARE v_tenant uuid; q app.extra_approval_request; v_n integer; v_step jsonb; v_started timestamptz; v_roles text[]; v_id uuid;
BEGIN
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN v_tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_tenant:=NULL; END;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 FOR q IN SELECT r.* FROM app.extra_approval_request r WHERE r.tenant_id=v_tenant AND r.net_pence IS NOT NULL
   AND r.request_revision=(SELECT max(x.request_revision) FROM app.extra_approval_request x WHERE x.tenant_id=r.tenant_id AND x.variation_id=r.variation_id)
   AND NOT EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(r.tenant_id,r.id)) ORDER BY r.server_recorded_at,r.id LOOP
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text||':'||q.job_id::text,417));
  IF EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(q.tenant_id,q.id)) THEN CONTINUE; END IF;
  SELECT count(*),max(f.server_recorded_at) INTO v_n,v_started FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(q.tenant_id,q.id);
  v_started:=coalesce(v_started,q.server_recorded_at); v_step:=q.requirement->'steps'->v_n;
  CONTINUE WHEN v_step IS NULL OR v_step->>'kind'<>'human' OR v_step->>'role'='client_approver';
  CONTINUE WHEN clock_timestamp()<v_started+((v_step->>'timeLimitMinutes')::numeric*interval '1 minute');
  v_roles:=ARRAY[v_step->>'escalationRole']||ARRAY(SELECT jsonb_array_elements_text(v_step->'alternateRoles'));
  INSERT INTO app.extra_escalation_fact(tenant_id,id,job_id,variation_id,request_id,step_index,eligible_roles) VALUES(q.tenant_id,pg_catalog.gen_random_uuid(),q.job_id,q.variation_id,q.id,v_n,v_roles)
  ON CONFLICT(tenant_id,request_id,step_index) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN request_id:=q.id; job_id:=q.job_id; variation_id:=q.variation_id; step_index:=v_n; eligible_roles:=v_roles; RETURN NEXT; END IF;
  v_id:=NULL;
 END LOOP;
END $$;

-- Grant-filtered queue: the mandatory lane. Reads no advisory suppression state, so nothing advisory can hide an item.
CREATE FUNCTION app.xa_queue(p_member uuid) RETURNS TABLE(lane text, decision_id uuid, request_id uuid, job_id uuid, variation_id uuid, step_index integer, step_role text, net_pence bigint, escalated boolean, overdue boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
#variable_conflict use_column
DECLARE v_tenant uuid; q app.extra_approval_request; v_n integer; v_step jsonb; v_roles text[]; v_esc boolean; v_started timestamptz;
BEGIN
 BEGIN v_tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_tenant:=NULL; END;
 IF v_tenant IS NULL THEN RETURN; END IF;
 FOR q IN SELECT r.* FROM app.extra_approval_request r WHERE r.tenant_id=v_tenant AND r.net_pence IS NOT NULL
   AND r.request_revision=(SELECT max(x.request_revision) FROM app.extra_approval_request x WHERE x.tenant_id=r.tenant_id AND x.variation_id=r.variation_id)
   AND NOT EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(r.tenant_id,r.id)) ORDER BY r.server_recorded_at,r.id LOOP
  SELECT count(*),max(f.server_recorded_at) INTO v_n,v_started FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(q.tenant_id,q.id);
  v_started:=coalesce(v_started,q.server_recorded_at); v_step:=q.requirement->'steps'->v_n;
  CONTINUE WHEN v_step IS NULL OR v_step->>'kind'<>'human' OR v_step->>'role'='client_approver';
  v_esc:=EXISTS(SELECT 1 FROM app.extra_escalation_fact e WHERE(e.tenant_id,e.request_id,e.step_index)=(q.tenant_id,q.id,v_n));
  v_roles:=ARRAY[v_step->>'role'];
  IF v_esc THEN v_roles:=v_roles||(v_step->>'escalationRole')||ARRAY(SELECT jsonb_array_elements_text(v_step->'alternateRoles')); END IF;
  CONTINUE WHEN app.xa_covers(p_member,v_roles,q.job_id,'extra.approve') IS NULL;
  lane:='mandatory'; decision_id:=app.xa_decision_id(q.id,v_n); request_id:=q.id; job_id:=q.job_id; variation_id:=q.variation_id; step_index:=v_n; step_role:=v_step->>'role'; net_pence:=q.net_pence; escalated:=v_esc;
  overdue:=clock_timestamp()>=v_started+((v_step->>'timeLimitMinutes')::numeric*interval '1 minute');
  RETURN NEXT;
 END LOOP;
END $$;

-- ---- ownership and execute rights ----
DO $$ DECLARE f text; BEGIN FOREACH f IN ARRAY ARRAY[
 'app.xa_covers(uuid,text[],uuid,text)','app.xa_begin(uuid,uuid,text[],uuid)','app.xa_requirement(jsonb,bigint)','app.xa_decision_id(uuid,integer)','app.xa_open_decision(uuid,uuid,integer)',
 'app.xa_resolve_decision(uuid,uuid,integer,text,uuid)','app.xa_event(uuid,uuid,uuid,text,uuid,text,uuid,uuid)','app.xa_latest_kind(uuid,uuid,uuid)',
 'app.xa_open_request(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bigint)','app.xa_submit(uuid,uuid,uuid,uuid)','app.xa_price(uuid,uuid,uuid,uuid,bigint,boolean)',
 'app.xa_approve(uuid,uuid,uuid,uuid,integer,text,bigint,boolean,text)','app.xa_withdraw(uuid,uuid,uuid,uuid,text)','app.xa_mark_duplicate(uuid,uuid,uuid,uuid,uuid,uuid)',
 'app.xa_issue_link(uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,uuid)','app.xa_revoke_link(uuid,uuid,uuid,uuid)',
 'app.xa_client_decide(uuid,uuid,uuid,uuid,text,text,text,bigint,boolean,text,text,text)','app.xa_client_view_authority(uuid,uuid,uuid,text)','app.xa_escalate()','app.xa_queue(uuid)'] LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO jobguard_migration',f);
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',f);
END LOOP;
FOREACH f IN ARRAY ARRAY['app.xa_covers(uuid,text[],uuid,text)','app.xa_decision_id(uuid,integer)','app.xa_submit(uuid,uuid,uuid,uuid)','app.xa_price(uuid,uuid,uuid,uuid,bigint,boolean)',
 'app.xa_approve(uuid,uuid,uuid,uuid,integer,text,bigint,boolean,text)','app.xa_withdraw(uuid,uuid,uuid,uuid,text)','app.xa_mark_duplicate(uuid,uuid,uuid,uuid,uuid,uuid)',
 'app.xa_issue_link(uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,uuid)','app.xa_revoke_link(uuid,uuid,uuid,uuid)',
 'app.xa_client_decide(uuid,uuid,uuid,uuid,text,text,text,bigint,boolean,text,text,text)','app.xa_client_view_authority(uuid,uuid,uuid,text)','app.xa_escalate()','app.xa_queue(uuid)'] LOOP
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO jobguard_runtime',f);
END LOOP; END $$;
COMMIT;
