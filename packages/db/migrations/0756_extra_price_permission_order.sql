-- LATER-SAFETY-183: refuse pricing permission before disclosing target existence.
-- Complete latest body from 0749; existing owner and ACLs are retained.
BEGIN;

CREATE OR REPLACE FUNCTION app.xa_price(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid, p_net bigint, p_revise boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR lower(nullif(current_setting('app.tenant_id',true),'')) IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE lp5_result jsonb; v_tenant uuid; v_origin app.extra_origin; v_var app.variation; v_prev app.extra_approval_revision_binding; v_req app.extra_approval_request; v_outcome text; v_latest text; v_rev_id uuid:=pg_catalog.gen_random_uuid(); v_rev_no integer; v_prev_rev uuid; v_hash text; v_bid uuid:=pg_catalog.gen_random_uuid(); v_ref text; v_late boolean:=false; v_old_n integer;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY[CASE WHEN p_revise THEN 'ReviseExtra' ELSE 'PriceExtra' END],p_actor);
 -- Ben, 13 Oct 2026 (answer 12): surveyors price. Revising a price is pricing.
 IF app.xa_covers(p_actor,ARRAY['surveyor'],p_job,'extra.price') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT x.* INTO v_origin FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_variation);
 IF v_origin.variation_id IS NULL OR v_origin.job_track IS DISTINCT FROM 'contractor' OR v_origin.provenance IS DISTINCT FROM 'command' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF p_net IS NULL OR p_net NOT BETWEEN 1 AND 1000000000000 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 v_latest:=app.xa_latest_kind(v_tenant,p_job,p_variation);
 SELECT b.* INTO v_prev FROM app.extra_approval_revision_binding b WHERE(b.tenant_id,b.job_id,b.variation_id)=(v_tenant,p_job,p_variation) ORDER BY b.logical_revision DESC LIMIT 1;
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=p_variation ORDER BY q.request_revision DESC LIMIT 1;
 IF NOT p_revise THEN
  -- Two legal starting points: never submitted (logged, no request), or submitted UNPRICED and not yet decided (the latest request has no net and no outcome). The second supersedes that request.
  v_late:=v_latest='awaiting_approval' AND v_req.id IS NOT NULL AND v_req.net_pence IS NULL AND v_req.binding_id IS NULL AND v_prev.id IS NULL
   AND NOT EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,v_req.id));
  IF NOT v_late AND (v_latest IS DISTINCT FROM 'logged' OR v_req.id IS NOT NULL OR v_prev.id IS NOT NULL) OR EXISTS(SELECT 1 FROM app.extra_sor_revision s WHERE(s.tenant_id,s.variation_id)=(v_tenant,p_variation)) THEN
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
 IF p_revise THEN lp5_result:=app.xa_open_request(v_tenant,p_job,p_variation,p_command,p_actor,v_bid,v_rev_id,v_hash,p_net); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result; END IF;
 IF v_late THEN
  -- The unpriced snapshot is superseded by the new request revision (older revisions are refused as stale); its open Decision is dismissed.
  SELECT count(*) INTO v_old_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,v_req.id);
  PERFORM app.xa_resolve_decision(v_tenant,v_req.id,v_old_n,'dismissed',p_actor);
  lp5_result:=app.xa_open_request(v_tenant,p_job,p_variation,p_command,p_actor,v_bid,v_rev_id,v_hash,p_net)||jsonb_build_object('bindingId',v_bid,'revisionId',v_rev_id,'supersededRequestId',v_req.id); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
 END IF;
 lp5_result:=jsonb_build_object('bindingId',v_bid,'revisionId',v_rev_id,'revisionHash',v_hash,'netPence',p_net); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END;
END
$$;

COMMIT;
