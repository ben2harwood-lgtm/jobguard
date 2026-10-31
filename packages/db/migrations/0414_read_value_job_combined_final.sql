BEGIN;
-- Read-only CH-9 projection. No new writer, allocation or fee authority.
CREATE OR REPLACE FUNCTION app.read_value_job(j uuid,digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor record;
 locked app.final_account_lock; run app.final_check_run_binding; a record;
 checked jsonb:='[]'; tracked jsonb:='[]'; assessments jsonb:='[]'; current_source jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'VALUE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t<>'11111111-1111-4111-8111-111111111111'::uuid THEN
  SELECT app.mon1_company_actor(t,digest) member_id INTO actor;
 ELSE
  SELECT * INTO actor FROM app.authenticate_practice_session(digest,t);
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor.membership_id AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
  THEN RAISE EXCEPTION 'VALUE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j AND (t<>'11111111-1111-4111-8111-111111111111'::uuid OR practice_session_digest=digest))
 THEN RAISE EXCEPTION 'VALUE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO locked FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 -- No hidden query, identifier, count or timing path before the immutable lock.
 IF locked.id IS NULL THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND job_track='small_builder' AND environment='synthetic_demo')
 THEN RAISE EXCEPTION 'VALUE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t='11111111-1111-4111-8111-111111111111'::uuid THEN
  SELECT * INTO actor FROM app.final_check_builder(t,j,digest);
 END IF;
 SELECT * INTO run FROM app.final_check_run_binding WHERE tenant_id=t AND job_id=j AND lock_id=locked.id;
 IF run.run_id IS NOT NULL THEN
  SELECT coalesce(jsonb_agg(s.id ORDER BY s.id),'[]') INTO checked
  FROM app.final_check_processing_source s WHERE s.tenant_id=t AND s.job_id=j AND s.manifest_id=run.manifest_id AND s.processable;
 END IF;
 -- Keep original locked capture IDs in the value contract. Match their immutable
 -- commercial identity to the issued line, including a 0413 combined final.
 -- Never count descendant copies or post-lock catches as builder captures.
 FOR a IN SELECT jsonb_build_object('id',l.id,'revisionId',l.final_account_revision_id,
  'sourceId',l.source_id,'checkId',b.check_id,'netPence',l.net_pence,'invoiceId',i.invoice_id,'at',to_char(ci.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) document,
  i.final_account_line_id invoice_line_id,i.revision_id invoice_revision_id
 FROM app.final_account_line l JOIN app.variation_revision v ON(v.tenant_id,v.job_id,v.id)=(l.tenant_id,l.job_id,l.source_id)
 JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(v.tenant_id,v.job_id,v.variation_id)
 JOIN app.final_account_invoiced_line i ON(i.tenant_id,i.job_id,i.line_kind,i.source_id,i.commercial_revision_id,i.scope_item_id,i.net_pence)=
  (l.tenant_id,l.job_id,l.line_kind,l.source_id,l.commercial_revision_id,l.scope_item_id,l.net_pence)
 JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.invoice_id)
 JOIN app.customer_invoice ci ON(ci.tenant_id,ci.job_id,ci.id)=(i.tenant_id,i.job_id,i.invoice_id)
 WHERE l.tenant_id=t AND l.job_id=j AND l.final_account_revision_id=locked.final_account_revision_id
 AND l.line_kind='variation' AND l.commercial_revision_id=v.id AND o.kind IN('builder_logged','final_review')
 AND b.invoice_kind='final' AND b.lock_id=locked.id AND b.revision_id=i.revision_id
 AND ci.final_account_revision_id=i.revision_id ORDER BY l.id LOOP
  PERFORM app.receipt_fact_invoice_line(t,j,(a.document->>'invoiceId')::uuid,a.invoice_line_id,
   a.invoice_revision_id,locked.id,(a.document->>'checkId')::uuid);
  tracked:=tracked||jsonb_build_array(a.document);
 END LOOP;
 FOR a IN SELECT r.*,row_number() OVER(PARTITION BY case_id,work_id,line_id,lock_id ORDER BY revision DESC) latest
  FROM app.recovery_attribution_revision r WHERE tenant_id=t AND job_id=j ORDER BY case_id,work_id,line_id,revision LOOP
  IF a.latest=1 THEN
   -- Re-resolve current sources without appending: a stale assessment must not
   -- keep showing positive money after a refund, credit or evidence invalidation.
   current_source:=app.recovery_attribution_sources(t,j,a.document,actor.member_id);
  END IF;
  assessments:=assessments||jsonb_build_array(jsonb_build_object('document',a.document,
   'current',a.latest<>1 OR (current_source->>'sourceHash')=(a.document->>'sourceHash')));
 END LOOP;
 RETURN jsonb_build_object('tenantId',t,'jobId',j,'lockId',locked.id,'lockedRevisionId',locked.final_account_revision_id,
  'lockedAt',to_char(locked.locked_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'checked',checked,
  'checkId',run.run_id,'checkedAt',to_char(run.available_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'tracked',tracked,'assessments',assessments,
  'foundComplete',NOT EXISTS(SELECT 1 FROM app.recovery_case_current c WHERE c.tenant_id=t AND c.job_id=j AND c.case_type='missed_variation_final_account'
   AND NOT EXISTS(SELECT 1 FROM app.recovery_attribution_revision r WHERE r.tenant_id=t AND r.job_id=j AND r.case_id=c.id)));
END $$;
ALTER FUNCTION app.read_value_job(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.read_value_job(uuid,text) FROM PUBLIC,jobguard_infrastructure,jobguard_shadow;
GRANT EXECUTE ON FUNCTION app.read_value_job(uuid,text) TO jobguard_runtime;
COMMIT;
