-- LATER-SAFETY-152 r1. Placeholder: router reserves the landing number.
-- Forward fix only; existing immutable facts and allocation runs are retained.
CREATE OR REPLACE FUNCTION app.cb_derive(p_session uuid,p_job uuid,p_command uuid,p_source text,p_invoice text,p_hash text,p_projection jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; run uuid; prev uuid; h text; contract uuid; movement jsonb; l jsonb; exported uuid; line_job uuid; f record;
BEGIN
 a:=app.cb_authority(p_session,p_job,true);
 IF NOT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command AND actor_membership_id=a AND semantic_key='contractor-billing:'||p_job::text||':'||p_command::text AND command_type='ImportBillingStatus' AND status='processing') THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 SELECT app.final_lock_hash(jsonb_agg(payload_hash ORDER BY source,source_event_id)),min(client_contract_id::text)::uuid INTO h,contract
 FROM app.billing_fact WHERE tenant_id=t AND job_id=p_job;
 IF h IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'BILLING_STALE'; END IF;
 PERFORM app.cb_validate(p_job,p_source,p_invoice,p_projection);
 SELECT id INTO run FROM app.billing_allocation_run WHERE tenant_id=t AND job_id=p_job AND source=p_source AND invoice_number=p_invoice AND input_hash=h;
 IF run IS NOT NULL THEN RETURN run; END IF;
 SELECT id INTO prev FROM app.billing_allocation_run r WHERE r.tenant_id=t AND r.job_id=p_job AND r.source=p_source AND r.invoice_number=p_invoice
 AND NOT EXISTS(SELECT 1 FROM app.billing_allocation_run n WHERE n.tenant_id=t AND n.predecessor_id=r.id);
 -- The empty all-facts hold has already passed cb_validate. Preserve only
 -- database-owned predecessor amounts, never caller-supplied replacement money.
 -- These unresolved facts still receive a successor run and quarantine records,
 -- so prepared fee statements become stale without erasing settled history.
 IF prev IS NOT NULL AND jsonb_array_length(p_projection->'lines')=0
 AND jsonb_array_length(p_projection->'allocations')=0
 AND (SELECT count(*)=jsonb_array_length(p_projection->'held')
      AND p_projection->'held' @> jsonb_agg(jsonb_build_object('sourceEventId',source_event_id,'reason','COMPOSITION_REQUIRED'))
      FROM app.billing_fact WHERE tenant_id=t AND job_id=p_job AND source=p_source AND invoice_number=p_invoice) THEN
  SELECT jsonb_set(projection,'{held}',p_projection->'held') INTO p_projection
  FROM app.billing_allocation_run WHERE tenant_id=t AND id=prev;
 END IF;
 run:=gen_random_uuid();
 INSERT INTO app.billing_allocation_run(tenant_id,id,job_id,client_contract_id,source,invoice_number,input_hash,projection,predecessor_id,command_id)
 VALUES(t,run,p_job,contract,p_source,p_invoice,h,p_projection,prev,p_command);
 FOR movement IN SELECT value FROM jsonb_array_elements(p_projection->'allocations') LOOP
  FOR l IN SELECT value FROM jsonb_array_elements(movement->'lines') LOOP
   SELECT m.export_line_id,m.line_job_id INTO exported,line_job FROM app.billing_line_match m JOIN app.billing_fact bf ON(bf.tenant_id,bf.id)=(m.tenant_id,m.fact_id)
   WHERE bf.tenant_id=t AND bf.job_id=p_job AND bf.source=p_source AND bf.invoice_number=p_invoice AND bf.match_valid
   AND bf.payload->>'factType'='invoiced' AND m.external_invoice_line_id=l->>'lineId' LIMIT 1;
   IF exported IS NULL AND(l->'matchedExtraNet'->>'numerator')::numeric<>0 THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
   INSERT INTO app.contractor_receipt_line_allocation(tenant_id,id,job_id,run_id,source_ref,original_source_ref,external_invoice_line_id,export_line_id,line_job_id,rule,gross_numerator,gross_denominator,net_numerator,net_denominator,matched_extra_numerator,matched_extra_denominator)
   VALUES(t,gen_random_uuid(),p_job,run,movement->>'sourceRef',movement->>'originalSourceRef',l->>'lineId',exported,coalesce(line_job,p_job),l->>'rule',(l->'gross'->>'numerator')::numeric,(l->'gross'->>'denominator')::numeric,
    (l->'net'->>'numerator')::numeric,(l->'net'->>'denominator')::numeric,(l->'matchedExtraNet'->>'numerator')::numeric,(l->'matchedExtraNet'->>'denominator')::numeric);
  END LOOP;
 END LOOP;
 FOR f IN SELECT b.id,b.source_event_id FROM app.billing_fact b WHERE b.tenant_id=t AND b.job_id=p_job AND b.source=p_source AND b.invoice_number=p_invoice LOOP
  FOR l IN SELECT value FROM jsonb_array_elements(p_projection->'held') WHERE value->>'sourceEventId'=f.source_event_id LOOP
   INSERT INTO app.billing_quarantine(tenant_id,id,job_id,client_contract_id,fact_id,reason) VALUES(t,gen_random_uuid(),p_job,contract,f.id,l->>'reason') ON CONFLICT DO NOTHING;
  END LOOP;
 END LOOP;
 INSERT INTO app.billing_application_event(tenant_id,id,job_id,run_id,command_id) VALUES(t,gen_random_uuid(),p_job,run,p_command);
 RETURN run;
END $$;
