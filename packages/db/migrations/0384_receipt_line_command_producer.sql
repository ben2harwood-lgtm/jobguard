BEGIN;
-- M4-8-S: enable v1 through the existing settled-fake-receipt producer.
-- Body copied from latest definition, 0335. No new routines, tables or grants.
CREATE OR REPLACE FUNCTION app.write_receipt_allocation_facts(p_tenant uuid,p_job uuid,p_session_digest text,p_command jsonb,p_artifact jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=p_tenant;j uuid:=p_job;p jsonb:=p_command; actor record; prior app.receipt_allocation_fact_command;
 review app.receipt_allocation_fact_review; doc jsonb; command uuid; review_id uuid; revision uuid; source uuid:=gen_random_uuid();
 audit uuid:=gen_random_uuid(); result jsonb; digest text; action text:=p->>'action'; expected bigint; row jsonb;
 decision uuid; resolution uuid:=gen_random_uuid(); auth uuid:=gen_random_uuid(); operation text; request jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'RECEIPT_LINE_SYNTHETIC_ONLY' USING ERRCODE='42501'; END IF;
 PERFORM app.assert_receipt_fact_scope(t,j,p_session_digest);
 SELECT * INTO actor FROM app.authenticate_practice_session(p_session_digest,t);
 IF p_artifact IS NOT NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR (p->>'version' IS NULL OR p->>'version' NOT IN('receipt-line-facts-command.v1','receipt-line-allocation-command.v1'))
 OR action IS NULL OR action NOT IN('review','approve','review_reverse','reverse')
 OR NOT(p ?& ARRAY['version','commandId','action','expectedSourceRevision']) OR jsonb_typeof(p->'expectedSourceRevision') IS DISTINCT FROM 'number'
 OR coalesce(p->>'expectedSourceRevision','') !~ '^[1-9][0-9]*$'
 OR (action='review' AND (NOT p ? 'paymentId' OR p-ARRAY['version','commandId','action','expectedSourceRevision','paymentId','remittanceEvidenceId']<>'{}'))
 OR (action='review_reverse' AND (NOT(p ?& ARRAY['allocationRevisionId','reversalSource']) OR p-(CASE WHEN p->>'version'='receipt-line-allocation-command.v1' THEN ARRAY['version','commandId','action','expectedSourceRevision','allocationRevisionId','reversalSource','grossPence','remittanceEvidenceId'] ELSE ARRAY['version','commandId','action','expectedSourceRevision','allocationRevisionId','reversalSource'] END)<>'{}'
  OR (p->>'version'='receipt-line-allocation-command.v1' AND (jsonb_typeof(p->'grossPence') IS DISTINCT FROM 'number' OR coalesce(p->>'grossPence','') !~ '^[1-9][0-9]*$' OR (p->>'grossPence')::numeric>1000000000000))
  OR jsonb_typeof(p->'reversalSource') IS DISTINCT FROM 'object' OR NOT(p->'reversalSource' ?& ARRAY['kind','sourceId'])
  OR (p->'reversalSource')-ARRAY['kind','sourceId']<>'{}' OR p->'reversalSource'->>'kind' IS NULL OR p->'reversalSource'->>'kind' NOT IN('payment_reversal','credit_note')))
 OR (action IN('approve','reverse') AND (NOT(p ?& ARRAY['reviewId','approvalHash']) OR p-ARRAY['version','commandId','action','expectedSourceRevision','reviewId','approvalHash']<>'{}'))
 THEN RAISE EXCEPTION 'INVALID_RECEIPT_LINE_COMMAND' USING ERRCODE='23514'; END IF;
 IF current_setting('transaction_isolation')<>'serializable' THEN RAISE EXCEPTION 'RECEIPT_LINE_SERIALIZABLE_REQUIRED' USING ERRCODE='25001'; END IF;
 command:=(p->>'commandId')::uuid;expected:=(p->>'expectedSourceRevision')::bigint;
 IF command IS NULL THEN RAISE EXCEPTION 'INVALID_RECEIPT_LINE_COMMAND' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('receipt-facts:'||t::text||':'||j::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('receipt-fact-command:'||t::text||':'||command::text,0));
 SELECT * INTO prior FROM app.receipt_allocation_fact_command WHERE tenant_id=t AND command_id=command;
 IF FOUND THEN
  IF prior.job_id<>j OR prior.payload<>p OR prior.actor_membership_id<>actor.membership_id OR prior.actor_identity_user_id<>actor.identity_user_id THEN RAISE EXCEPTION 'RECEIPT_LINE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 request:=p;
 IF action IN('approve','reverse') THEN
  SELECT * INTO review FROM app.receipt_allocation_fact_review WHERE tenant_id=t AND job_id=j AND id=(p->>'reviewId')::uuid;
  IF review.id IS NULL OR review.expires_at<=clock_timestamp() OR review.operation IS DISTINCT FROM (CASE WHEN action='reverse' THEN 'reversal' ELSE 'receipt' END)
   OR EXISTS(SELECT 1 FROM app.receipt_allocation_fact_revision rf WHERE rf.tenant_id=t AND rf.review_id=review.id)
   OR NOT EXISTS(SELECT 1 FROM app.receipt_allocation_fact_command c WHERE c.tenant_id=t AND c.command_id=review.command_id AND c.actor_membership_id=actor.membership_id AND c.actor_identity_user_id=actor.identity_user_id)
  THEN RAISE EXCEPTION 'RECEIPT_LINE_APPROVAL_CHANGED' USING ERRCODE='23514'; END IF;
  SELECT payload INTO request FROM app.receipt_allocation_fact_command WHERE tenant_id=t AND command_id=review.command_id;
  IF request->>'version' IS DISTINCT FROM p->>'version'
   OR request->>'action' IS DISTINCT FROM (CASE WHEN action='reverse' THEN 'review_reverse' ELSE 'review' END)
  THEN RAISE EXCEPTION 'RECEIPT_LINE_APPROVAL_CHANGED' USING ERRCODE='23514'; END IF;
 END IF;
 IF expected<>(app.receipt_fact_watermark(t,j)->>'revision')::bigint THEN RAISE EXCEPTION 'RECEIPT_LINE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
 doc:=app.receipt_fact_proposal(t,j,request);
 -- Refuse a cross-job movement before any fact insert; the composite FK is a backstop.
 IF NOT EXISTS(SELECT 1 FROM app.practice_feed_event e
  WHERE e.tenant_id=t AND e.job_id=j AND e.id=(doc->'movement'->>'id')::uuid)
 THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_MOVEMENT_JOB_REQUIRED' USING ERRCODE='23514'; END IF;
 -- The v1 amount confirms the complete stored reversal; it never sizes it.
 IF request->>'version'='receipt-line-allocation-command.v1' AND request->>'action'='review_reverse'
  AND (request->>'grossPence')::numeric*(doc->'input'->'receipt'->'gross'->>'denominator')::numeric
   <> (doc->'input'->'receipt'->'gross'->>'numerator')::numeric
 THEN RAISE EXCEPTION 'RECEIPT_LINE_REVERSAL_AMOUNT_CHANGED' USING ERRCODE='23514'; END IF;
 -- Serialize against the existing case writer before accepting receipt capacity.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':receipt:'||(doc->>'paymentId'),0));
 digest:=app.final_lock_hash(doc);operation:='receipt_facts.'||(doc->>'operation');
 IF action IN('review','review_reverse') THEN
  review_id:=gen_random_uuid();decision:=gen_random_uuid();
  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision,t,'customer_invoice',doc->>'invoiceId',operation);
 ELSE
  IF review.artifact->'facts' IS DISTINCT FROM doc OR trim(review.approval_hash) IS DISTINCT FROM p->>'approvalHash' OR digest IS DISTINCT FROM p->>'approvalHash'
   OR EXISTS(SELECT 1 FROM app.decision_resolution WHERE tenant_id=t AND decision_id=(review.artifact->>'decisionId')::uuid)
  THEN RAISE EXCEPTION 'RECEIPT_LINE_APPROVAL_CHANGED' USING ERRCODE='23514'; END IF;
  review_id:=review.id;revision:=gen_random_uuid();decision:=(review.artifact->>'decisionId')::uuid;
 END IF;
 result:=jsonb_build_object('version','receipt-line-facts-result.v1','environment','synthetic_demo','realExternalActions',0,'jobId',j,'commandId',command,
  'action',action,'reviewId',review_id,'approvalHash',digest,'allocationRevisionId',revision,'sourceRevision',expected,'sourceHash',doc->'watermark'->>'sourceHash','replayed',false,'input',doc->'input','lines',doc->'lines');
 INSERT INTO app.receipt_allocation_fact_command(tenant_id,job_id,command_id,actor_membership_id,actor_identity_user_id,payload,payload_hash,result,audit_event_id)
  VALUES(t,j,command,actor.membership_id,actor.identity_user_id,p,app.final_lock_hash(p),result,audit);
 IF action IN('review','review_reverse') THEN
  INSERT INTO app.receipt_allocation_fact_review(tenant_id,job_id,id,command_id,operation,payment_id,invoice_id,source_revision,source_hash,approval_hash,artifact,expires_at)
   VALUES(t,j,review_id,command,doc->>'operation',(doc->>'paymentId')::uuid,(doc->>'invoiceId')::uuid,expected,doc->'watermark'->>'sourceHash',digest,jsonb_build_object('facts',doc,'decisionId',decision),clock_timestamp()+interval '15 minutes');
 ELSE
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution,t,decision,'approved',actor.membership_id);
  INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at)
   VALUES(auth,t,decision,resolution,actor.membership_id,operation,doc->>'invoiceId',digest,expected,'receipt-line-facts.v1',review.expires_at);
  INSERT INTO app.receipt_allocation_fact_revision(tenant_id,job_id,id,command_id,review_id,payment_id,source_hash,source_revision,direction)
   VALUES(t,j,revision,command,review_id,(doc->>'paymentId')::uuid,digest,expected,doc->>'operation');
  INSERT INTO app.receipt_allocation_fact_source(tenant_id,job_id,id,allocation_revision_id,payment_id,movement_id,movement_hash,invoice_id,revision_id,lock_id,check_id,invoice_kind,source_manifest,receipt_effective_at)
   VALUES(t,j,source,revision,(doc->>'paymentId')::uuid,(doc->'movement'->>'id')::uuid,trim(doc->'movement'->>'source_hash'),(doc->>'invoiceId')::uuid,
    (doc->'binding'->>'revision_id')::uuid,(doc->'binding'->>'lock_id')::uuid,(doc->'binding'->>'check_id')::uuid,doc->'binding'->>'invoice_kind',
    jsonb_strip_nulls(jsonb_build_object('evidence',doc->'evidence','approvalRef',auth,'reversalSourceId',doc->'reversalSource'->>'sourceId','reversalSourceKind',doc->'reversalSource'->>'kind',
     'creditNoteId',CASE WHEN doc->'reversalSource'->>'kind'='credit_note' THEN doc->'reversalSource'->>'sourceId' END,'reversesAllocationRevisionId',doc->>'reversesAllocationRevisionId')),(doc->>'effectiveAt')::timestamptz);
  FOR row IN SELECT value FROM jsonb_array_elements(doc->'lines') LOOP
   INSERT INTO app.receipt_allocation_fact_line(tenant_id,job_id,id,source_id,invoice_id,line_id,scope_item_id,commercial_revision_id,rule,source_ref,gross_numerator,gross_denominator,net_numerator,net_denominator,original_line_net_pence,original_line_gross_pence,line_existed_at,reverses_line_allocation_id)
    VALUES(t,j,gen_random_uuid(),source,(doc->>'invoiceId')::uuid,(row->>'lineId')::uuid,(row->>'scopeItemId')::uuid,(row->>'commercialRevisionId')::uuid,row->>'rule',row->>'sourceRef',
     row->'gross'->>'numerator',row->'gross'->>'denominator',row->'net'->>'numerator',row->'net'->>'denominator',(row->>'originalLineNetPence')::bigint,(row->>'originalLineGrossPence')::bigint,(row->>'lineExistedAt')::timestamptz,(row->>'reversesLineAllocationId')::uuid);
  END LOOP;
 END IF;
 PERFORM app.append_final_check_audit(audit,'membership:'||actor.membership_id::text,j,'receipt_facts.'||action,jsonb_build_object('commandId',command,'reviewId',review_id,'allocationRevisionId',revision));
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION app.receipt_fact_source_approved(t uuid,j uuid,f uuid) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=pg_catalog,app AS $$
 SELECT EXISTS(SELECT 1 FROM app.receipt_allocation_fact_source s
  JOIN app.receipt_allocation_fact_revision r ON(r.tenant_id,r.job_id,r.id)=(s.tenant_id,s.job_id,s.allocation_revision_id)
  JOIN app.receipt_allocation_fact_command c ON(c.tenant_id,c.job_id,c.command_id)=(r.tenant_id,r.job_id,r.command_id)
  JOIN app.action_authorization a ON a.tenant_id=s.tenant_id AND a.id::text=s.source_manifest->>'approvalRef'
  JOIN app.decision_resolution dr ON(dr.tenant_id,dr.id,dr.decision_id)=(a.tenant_id,a.resolution_id,a.decision_id)
  WHERE s.tenant_id=t AND s.job_id=j AND s.id=f AND c.payload->>'version' IN('receipt-line-facts-command.v1','receipt-line-allocation-command.v1')
   AND c.payload->>'action'=CASE WHEN r.direction='receipt' THEN 'approve' ELSE 'reverse' END
   AND c.result->>'allocationRevisionId'=r.id::text AND trim(a.content_hash)=r.source_hash
   AND a.action_type='receipt_facts.'||r.direction AND a.actor_membership_id=c.actor_membership_id
   AND dr.resolution='approved' AND dr.actor_membership_id=c.actor_membership_id AND c.created_at<=a.expires_at)
$$;

COMMIT;
