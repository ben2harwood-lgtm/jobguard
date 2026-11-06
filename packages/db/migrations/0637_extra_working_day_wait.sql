BEGIN;
-- ENT-5 Q08. New snapshots default to two working days; old snapshots are untouched.
CREATE FUNCTION app.xa_wait_deadline(p_started timestamptz, p_step jsonb) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE local_time timestamp:=p_started AT TIME ZONE 'Europe/London'; remaining integer;
BEGIN
 -- Immutable older snapshots keep their original elapsed-minute wait.
 IF NOT (p_step ? 'waitWorkingDays') OR p_step->'waitWorkingDays'='null'::jsonb THEN
  RETURN p_started+((p_step->>'timeLimitMinutes')::numeric*interval '1 minute');
 END IF;
 remaining:=(p_step->>'waitWorkingDays')::integer;
 IF remaining IS NULL OR remaining NOT BETWEEN 1 AND 260 THEN RAISE EXCEPTION 'INVALID_RULES' USING ERRCODE='23514'; END IF;
 WHILE remaining>0 LOOP
  local_time:=local_time+interval '1 day';
  IF extract(isodow FROM local_time)<6 THEN remaining:=remaining-1; END IF;
 END LOOP;
 RETURN local_time AT TIME ZONE 'Europe/London';
END $$;
ALTER FUNCTION app.xa_wait_deadline(timestamptz,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.xa_wait_deadline(timestamptz,jsonb) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.xa_wait_deadline(timestamptz,jsonb) TO jobguard_runtime;
CREATE OR REPLACE FUNCTION app.xa_requirement(p_rules jsonb, p_net bigint) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
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
  v_steps:=v_steps||jsonb_build_array(jsonb_build_object('index',v_idx,'kind','human','role',s->>'role','timeLimitMinutes',s->'timeLimitMinutes','waitWorkingDays',CASE WHEN s ? 'waitWorkingDays' THEN s->'waitWorkingDays' ELSE '2'::jsonb END,'escalationRole',s->>'escalationRole','alternateRoles',s->'alternateRoles'));
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
CREATE OR REPLACE FUNCTION app.xa_escalate() RETURNS TABLE(request_id uuid, job_id uuid, variation_id uuid, step_index integer, eligible_roles text[])
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
  IF q.request_revision<>(SELECT max(r.request_revision) FROM app.extra_approval_request r WHERE r.tenant_id=q.tenant_id AND r.variation_id=q.variation_id) THEN CONTINUE; END IF;
  SELECT count(*),max(f.server_recorded_at) INTO v_n,v_started FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(q.tenant_id,q.id);
  v_started:=coalesce(v_started,q.server_recorded_at); v_step:=q.requirement->'steps'->v_n;
  CONTINUE WHEN v_step IS NULL OR v_step->>'kind'<>'human' OR v_step->>'role'='client_approver';
  CONTINUE WHEN clock_timestamp()<app.xa_wait_deadline(v_started,v_step);
  v_roles:=array_remove(ARRAY[v_step->>'escalationRole']||ARRAY(SELECT jsonb_array_elements_text(v_step->'alternateRoles')),NULL);
  CONTINUE WHEN cardinality(v_roles)=0;
  INSERT INTO app.extra_escalation_fact(tenant_id,id,job_id,variation_id,request_id,step_index,eligible_roles) VALUES(q.tenant_id,pg_catalog.gen_random_uuid(),q.job_id,q.variation_id,q.id,v_n,v_roles)
  ON CONFLICT(tenant_id,request_id,step_index) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN request_id:=q.id; job_id:=q.job_id; variation_id:=q.variation_id; step_index:=v_n; eligible_roles:=v_roles; RETURN NEXT; END IF;
  v_id:=NULL;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION app.xa_queue(p_member uuid) RETURNS TABLE(lane text, decision_id uuid, request_id uuid, job_id uuid, variation_id uuid, step_index integer, step_role text, net_pence bigint, escalated boolean, overdue boolean)
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
  overdue:=clock_timestamp()>=app.xa_wait_deadline(v_started,v_step);
  RETURN NEXT;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION infrastructure.discover_extra_escalations() RETURNS TABLE(tenant_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; caller text:=current_setting('app.tenant_id',true);
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 FOR t IN SELECT id FROM control_plane.tenant ORDER BY id LOOP
  PERFORM set_config('app.tenant_id',t::text,true);
  IF EXISTS(
   SELECT 1 FROM app.extra_approval_request r
   CROSS JOIN LATERAL (
    SELECT count(*)::integer AS n,max(f.server_recorded_at) AS started
    FROM app.extra_approval_step_fact f WHERE (f.tenant_id,f.request_id)=(r.tenant_id,r.id)
   ) progress
   CROSS JOIN LATERAL (SELECT r.requirement->'steps'->progress.n AS step) current_step
   WHERE r.tenant_id=t AND r.net_pence IS NOT NULL
    AND r.request_revision=(SELECT max(x.request_revision) FROM app.extra_approval_request x
     WHERE (x.tenant_id,x.variation_id)=(r.tenant_id,r.variation_id))
    AND NOT EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE (o.tenant_id,o.request_id)=(r.tenant_id,r.id))
    AND current_step.step->>'kind'='human' AND current_step.step->>'role'<>'client_approver'
    AND (current_step.step->>'escalationRole' IS NOT NULL OR jsonb_array_length(current_step.step->'alternateRoles')>0)
    AND clock_timestamp()>=app.xa_wait_deadline(coalesce(progress.started,r.server_recorded_at),current_step.step)
    AND NOT EXISTS(SELECT 1 FROM app.extra_escalation_fact e
     WHERE (e.tenant_id,e.request_id,e.step_index)=(r.tenant_id,r.id,progress.n))
  ) THEN tenant_id:=t; RETURN NEXT; END IF;
 END LOOP;
 PERFORM set_config('app.tenant_id',coalesce(caller,''),true);
END $$;

COMMIT;
