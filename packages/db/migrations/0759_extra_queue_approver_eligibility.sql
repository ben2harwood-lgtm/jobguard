BEGIN;
-- LATER-SAFETY-188: queue visibility follows existing approver separation checks.
CREATE OR REPLACE FUNCTION app.xa_queue(p_member uuid) RETURNS TABLE(lane text, decision_id uuid, request_id uuid, job_id uuid, variation_id uuid, step_index integer, step_role text, net_pence bigint, escalated boolean, overdue boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
#variable_conflict use_column
DECLARE v_tenant uuid; q app.extra_approval_request; v_n integer; v_step jsonb; v_roles text[]; v_esc boolean; v_started timestamptz; v_prior record;
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
  -- SELF_APPROVAL exclusion: use the same qualified origin as xa_approve.
  CONTINUE WHEN EXISTS(SELECT 1 FROM app.extra_origin x
   WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,q.job_id,q.variation_id)
    AND x.raising_membership_id=p_member);
  -- REUSED_APPROVER exclusion: mirror the writer, including unknown legacy rejection slots.
  SELECT h.step_index,h.request_id INTO v_prior FROM (
   SELECT f.step_index,f.request_id FROM app.extra_approval_step_fact f
    WHERE f.tenant_id=v_tenant AND f.variation_id=q.variation_id AND f.actor_membership_id=p_member
   UNION ALL
   SELECT (r.result->>'stepIndex')::integer,o.request_id FROM app.extra_approval_outcome o
    JOIN app.command_receipt r ON(r.tenant_id,r.command_id)=(o.tenant_id,o.command_id)
    WHERE o.tenant_id=v_tenant AND o.variation_id=q.variation_id AND o.actor_membership_id=p_member
     AND o.kind='rejected' AND r.status='succeeded'
  ) h ORDER BY (h.step_index<>v_n) DESC,h.step_index LIMIT 1;
  CONTINUE WHEN v_prior.request_id IS NOT NULL AND v_prior.step_index IS DISTINCT FROM v_n;
  lane:='mandatory'; decision_id:=app.xa_decision_id(q.id,v_n); request_id:=q.id; job_id:=q.job_id; variation_id:=q.variation_id; step_index:=v_n; step_role:=v_step->>'role'; net_pence:=q.net_pence; escalated:=v_esc;
  overdue:=clock_timestamp()>=app.xa_wait_deadline(v_started,v_step);
  RETURN NEXT;
 END LOOP;
END $$;
COMMIT;
