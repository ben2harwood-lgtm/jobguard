BEGIN;
-- M4-8-S part 2: consume the private, immutable 0258 receipt-line bridge.
-- This does not grant a caller authority to manufacture that bridge's facts.
CREATE TABLE app.stored_receipt_case_binding (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, work_id uuid NOT NULL,
 line_id uuid NOT NULL, lock_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,job_id,line_id), CONSTRAINT srcb_work UNIQUE(tenant_id,job_id,work_id),
 CONSTRAINT srcb_subject UNIQUE(tenant_id,job_id,case_id,work_id,line_id,lock_id),
 FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,line_id) REFERENCES app.final_account_line(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,lock_id) REFERENCES app.final_account_lock(tenant_id,job_id,id)
);
CREATE TABLE app.stored_receipt_case_command (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, command_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 payload jsonb NOT NULL, artifact jsonb NOT NULL, result jsonb NOT NULL,
 decision_id uuid NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,command_id), CONSTRAINT srcc_job UNIQUE(tenant_id,job_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,decision_id) REFERENCES app.decision(tenant_id,id)
);
CREATE TABLE app.stored_receipt_case_allocation (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, command_id uuid NOT NULL,
 case_id uuid NOT NULL, work_id uuid NOT NULL, line_id uuid NOT NULL, lock_id uuid NOT NULL,
 fact_line_id uuid NOT NULL, reverses_id uuid, authorization_id uuid NOT NULL,
 gross_numerator text NOT NULL, gross_denominator text NOT NULL,
 net_numerator text NOT NULL, net_denominator text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), CONSTRAINT srca_job UNIQUE(tenant_id,job_id,id), CONSTRAINT srca_fact UNIQUE(tenant_id,fact_line_id), CONSTRAINT srca_command UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,command_id) REFERENCES app.stored_receipt_case_command(tenant_id,job_id,command_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,job_id,case_id,work_id,line_id,lock_id) REFERENCES app.stored_receipt_case_binding(tenant_id,job_id,case_id,work_id,line_id,lock_id),
 FOREIGN KEY(tenant_id,job_id,fact_line_id) REFERENCES app.receipt_allocation_fact_line(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,reverses_id) REFERENCES app.stored_receipt_case_allocation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['stored_receipt_case_binding','stored_receipt_case_command','stored_receipt_case_allocation'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY stored_receipt_tenant ON app.%I FOR ALL TO jobguard_migration USING(tenant_id=CASE WHEN pg_input_is_valid(current_setting(''app.tenant_id'',true),''uuid'') THEN current_setting(''app.tenant_id'',true)::uuid END) WITH CHECK(tenant_id=CASE WHEN pg_input_is_valid(current_setting(''app.tenant_id'',true),''uuid'') THEN current_setting(''app.tenant_id'',true)::uuid END)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access',n);
  EXECUTE format('CREATE TRIGGER stored_receipt_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;

-- A single source projection supplies the review and execution. No amount,
-- tax, fraction, source hash, policy or actor is accepted from the application.
CREATE FUNCTION app.stored_receipt_case_facts(t uuid,j uuid,f uuid,c uuid,w uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE l app.receipt_allocation_fact_line;s app.receipt_allocation_fact_source;k app.final_account_lock;
 inv app.final_account_invoiced_line; item app.final_account_line; movement app.practice_feed_event;
 rc app.recovery_case_current; original app.stored_receipt_case_allocation; parts jsonb; pair numeric[]; legacy_net numeric;
BEGIN
 SELECT * INTO l FROM app.receipt_allocation_fact_line WHERE tenant_id=t AND job_id=j AND id=f;
 SELECT * INTO s FROM app.receipt_allocation_fact_source WHERE tenant_id=t AND job_id=j AND id=l.source_id;
 SELECT * INTO k FROM app.final_account_lock WHERE tenant_id=t AND job_id=j AND id=s.lock_id;
 SELECT * INTO item FROM app.final_account_line WHERE tenant_id=t AND job_id=j AND id=l.line_id;
 SELECT * INTO inv FROM app.final_account_invoiced_line WHERE tenant_id=t AND job_id=j AND invoice_id=l.invoice_id AND final_account_line_id=l.line_id;
 -- #368: job equality alone is insufficient. Both the actual line and issued
 -- immutable line snapshot must be from the revision behind this exact lock.
 IF l.id IS NULL OR s.id IS NULL OR k.id IS NULL OR item.id IS NULL OR inv.final_account_line_id IS NULL
 OR item.final_account_revision_id IS DISTINCT FROM k.final_account_revision_id
 OR inv.revision_id IS DISTINCT FROM k.final_account_revision_id OR s.revision_id IS DISTINCT FROM k.final_account_revision_id
 OR NOT EXISTS(SELECT 1 FROM app.final_account_invoice_binding b JOIN app.final_account_lock_check ch
  ON(ch.tenant_id,ch.job_id,ch.lock_id,ch.id)=(b.tenant_id,b.job_id,b.lock_id,b.check_id)
  WHERE b.tenant_id=t AND b.job_id=j AND b.invoice_id=s.invoice_id AND b.revision_id=s.revision_id
   AND b.lock_id=k.id AND b.check_id=s.check_id AND b.invoice_kind=s.invoice_kind AND ch.status='completed')
 OR (l.original_line_net_pence,l.original_line_gross_pence,l.scope_item_id,l.commercial_revision_id)
 IS DISTINCT FROM(inv.net_pence,inv.gross_pence,inv.scope_item_id,inv.commercial_revision_id)
 OR l.net_numerator::numeric*l.gross_denominator::numeric*inv.gross_pence
 <>l.gross_numerator::numeric*l.net_denominator::numeric*inv.net_pence
 THEN RAISE EXCEPTION 'STORED_RECEIPT_LINE_BINDING_REQUIRED' USING ERRCODE='23514'; END IF;
 -- #346: bind the event's job as well as tenant, and recheck the saved hash.
 SELECT * INTO movement FROM app.practice_feed_event WHERE tenant_id=t AND job_id=j AND id=s.movement_id AND trim(source_hash)=s.movement_hash;
 IF movement.id IS NULL OR movement.state<>'settled' OR movement.identity<>'identified'
 OR NOT EXISTS(SELECT 1 FROM app.practice_feed_receipt_match m JOIN app.customer_payment p ON(p.tenant_id,p.job_id,p.id)=(m.tenant_id,m.job_id,m.payment_id)
  WHERE m.tenant_id=t AND m.job_id=j AND m.payment_id=s.payment_id AND p.invoice_id=s.invoice_id
   AND m.account_id=movement.account_id AND m.settled_event_id=movement.event_id AND m.matched_pence=movement.gross_pence AND p.amount_pence=m.matched_pence)
 OR EXISTS(SELECT 1 FROM app.practice_feed_event e WHERE e.tenant_id=t AND e.account_id=movement.account_id AND e.movement_key=movement.movement_key AND e.state='possible_duplicate'
  AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command r WHERE r.tenant_id=t AND r.account_id=e.account_id AND r.movement_key=e.movement_key AND r.action='reconcile_duplicate'))
 THEN RAISE EXCEPTION 'STORED_RECEIPT_SETTLEMENT_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO rc FROM app.recovery_case_current WHERE tenant_id=t AND job_id=j AND id=c;
 IF rc.id IS NULL OR NOT rc.synthetic OR rc.state='prevented' OR rc.claim_revision IS NULL
 THEN RAISE EXCEPTION 'STORED_RECEIPT_CASE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF NOT (rc.source_refs ? s.invoice_id::text OR rc.source_refs ? ('variation:'||item.source_id::text)
  OR rc.source_refs ? ('revision:'||l.commercial_revision_id::text))
 THEN RAISE EXCEPTION 'STORED_RECEIPT_CASE_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM app.stored_receipt_case_binding b WHERE b.tenant_id=t AND b.job_id=j AND (b.line_id=l.line_id OR b.work_id=w)
  AND (b.case_id,b.work_id,b.line_id,b.lock_id) IS DISTINCT FROM(c,w,l.line_id,k.id))
 THEN RAISE EXCEPTION 'STORED_RECEIPT_LINE_ALREADY_BOUND' USING ERRCODE='23514'; END IF;
 IF l.reverses_line_allocation_id IS NULL THEN
  IF l.gross_numerator::numeric<=0 OR l.net_numerator::numeric<0 OR s.receipt_effective_at<l.line_existed_at
  OR EXISTS(SELECT 1 FROM app.customer_payment_reversal WHERE tenant_id=t AND job_id=j AND payment_id=s.payment_id)
  OR EXISTS(SELECT 1 FROM app.practice_feed_event e WHERE e.tenant_id=t AND e.job_id=j AND e.account_id=movement.account_id AND e.movement_key=movement.movement_key AND e.state='reversed')
  THEN RAISE EXCEPTION 'STORED_RECEIPT_NOT_AVAILABLE' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM app.recovery_case_allocation WHERE tenant_id=t AND payment_id=s.payment_id)
  THEN RAISE EXCEPTION 'STORED_RECEIPT_CASH_ALREADY_USED' USING ERRCODE='23514'; END IF;
  -- #356: exact cumulative positive net is bounded by the immutable line net.
  -- Reversals never reopen historical positive capacity.
  SELECT coalesce(jsonb_agg(jsonb_build_object('n',a.net_numerator,'d',a.net_denominator)),'[]') INTO parts
   FROM app.stored_receipt_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.line_id=l.line_id AND a.reverses_id IS NULL;
  PERFORM app.assert_receipt_fact_bound(parts||jsonb_build_array(jsonb_build_object('n',l.net_numerator,'d',l.net_denominator)),inv.net_pence,1);
  SELECT coalesce(jsonb_agg(jsonb_build_object('n',a.gross_numerator,'d',a.gross_denominator)),'[]') INTO parts
   FROM app.stored_receipt_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.line_id=l.line_id AND a.reverses_id IS NULL;
  PERFORM app.assert_receipt_fact_bound(parts||jsonb_build_array(jsonb_build_object('n',l.gross_numerator,'d',l.gross_denominator)),inv.gross_pence,1);
  SELECT coalesce(jsonb_agg(jsonb_build_object('n',a.gross_numerator,'d',a.gross_denominator)),'[]') INTO parts
   FROM app.stored_receipt_case_allocation a JOIN app.receipt_allocation_fact_line fl ON(fl.tenant_id,fl.job_id,fl.id)=(a.tenant_id,a.job_id,a.fact_line_id)
   JOIN app.receipt_allocation_fact_source fs ON(fs.tenant_id,fs.job_id,fs.id)=(fl.tenant_id,fl.job_id,fl.source_id)
   WHERE a.tenant_id=t AND a.job_id=j AND fs.payment_id=s.payment_id AND a.reverses_id IS NULL;
  PERFORM app.assert_receipt_fact_bound(parts||jsonb_build_array(jsonb_build_object('n',l.gross_numerator,'d',l.gross_denominator)),movement.gross_pence,1);
  SELECT app.recovery_allocation_fraction_sum(coalesce(jsonb_agg(jsonb_build_array(a.net_numerator,a.net_denominator)),'[]')) INTO pair
   FROM app.stored_receipt_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c;
  SELECT coalesce(sum(a.eligible_net_pence-(SELECT coalesce(sum(r.eligible_net_pence),0) FROM app.recovery_case_allocation_reversal r WHERE r.tenant_id=t AND r.allocation_id=a.id)),0)
   INTO legacy_net FROM app.recovery_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c;
  IF pair[1]*l.net_denominator::numeric+l.net_numerator::numeric*pair[2]>(rc.claim_pence-greatest(rc.landed,legacy_net)-rc.written_off)::numeric*pair[2]*l.net_denominator::numeric
  THEN RAISE EXCEPTION 'STORED_RECEIPT_EXCEEDS_CLAIM' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT a.* INTO original FROM app.stored_receipt_case_allocation a
   JOIN app.receipt_allocation_fact_line fl ON(fl.tenant_id,fl.job_id,fl.id)=(a.tenant_id,a.job_id,a.fact_line_id)
   JOIN app.receipt_allocation_fact_source fs ON(fs.tenant_id,fs.job_id,fs.id)=(fl.tenant_id,fl.job_id,fl.source_id)
   WHERE a.tenant_id=t AND a.job_id=j AND a.fact_line_id=l.reverses_line_allocation_id AND a.case_id=c AND a.work_id=w AND a.line_id=l.line_id AND a.reverses_id IS NULL
    AND fs.payment_id=s.payment_id AND fs.invoice_id=s.invoice_id;
  IF original.id IS NULL OR l.gross_numerator::numeric>=0 OR l.net_numerator::numeric>0
  OR (CASE WHEN s.source_manifest ? 'creditNoteId' THEN
   NOT EXISTS(SELECT 1 FROM app.customer_credit_note cn WHERE cn.tenant_id=t AND cn.job_id=j AND cn.invoice_id=s.invoice_id
    AND cn.id::text=s.source_manifest->>'creditNoteId' AND cn.amount_pence::numeric*l.gross_denominator::numeric>=abs(l.gross_numerator::numeric))
   ELSE NOT EXISTS(SELECT 1 FROM app.customer_payment_reversal WHERE tenant_id=t AND job_id=j AND payment_id=s.payment_id) END)
  THEN RAISE EXCEPTION 'STORED_RECEIPT_REVERSAL_REQUIRED' USING ERRCODE='23514'; END IF;
  IF s.source_manifest ? 'creditNoteId' THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('n',a.gross_numerator,'d',a.gross_denominator)),'[]') INTO parts
    FROM app.stored_receipt_case_allocation a JOIN app.receipt_allocation_fact_line fl ON(fl.tenant_id,fl.job_id,fl.id)=(a.tenant_id,a.job_id,a.fact_line_id)
    JOIN app.receipt_allocation_fact_source fs ON(fs.tenant_id,fs.job_id,fs.id)=(fl.tenant_id,fl.job_id,fl.source_id)
    WHERE a.tenant_id=t AND a.reverses_id IS NOT NULL AND fs.source_manifest->>'creditNoteId'=s.source_manifest->>'creditNoteId';
   PERFORM app.assert_receipt_fact_bound(parts||jsonb_build_array(jsonb_build_object('n',l.gross_numerator,'d',l.gross_denominator)),
    (SELECT amount_pence FROM app.customer_credit_note WHERE tenant_id=t AND job_id=j AND id::text=s.source_manifest->>'creditNoteId'),1);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n',a.gross_numerator,'d',a.gross_denominator)),'[]') INTO parts
   FROM app.stored_receipt_case_allocation a WHERE a.tenant_id=t AND a.reverses_id=original.id;
  PERFORM app.assert_receipt_fact_bound(parts||jsonb_build_array(jsonb_build_object('n',l.gross_numerator,'d',l.gross_denominator)),original.gross_numerator::numeric,original.gross_denominator::numeric);
 END IF;
 RETURN jsonb_build_object('version','stored-receipt-case-facts.v1','currency','GBP','caseId',c,'workId',w,'lineId',l.line_id,'lockId',k.id,'factLineId',f,
  'paymentId',s.payment_id,'sourceHash',(SELECT source_hash FROM app.receipt_allocation_fact_revision WHERE tenant_id=t AND job_id=j AND id=s.allocation_revision_id),'movementId',movement.id,'movementHash',s.movement_hash,'caseRevision',rc.revision,
  'gross',jsonb_build_object('numerator',l.gross_numerator,'denominator',l.gross_denominator),
  'net',jsonb_build_object('numerator',l.net_numerator,'denominator',l.net_denominator),'reversesId',original.id,
  'rule',l.rule,'sourceRef',l.source_ref,'policyVersion','reference_fee_policy_v3');
END $$;

CREATE FUNCTION app.allocate_stored_receipt_line(t uuid,j uuid,d text,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE actor record; prior app.stored_receipt_case_command; review app.stored_receipt_case_command;
 facts jsonb; digest text; action text:=p->>'action'; cid uuid; c uuid; f uuid; w uuid; payment uuid;
 result jsonb; decision uuid; resolution uuid:=gen_random_uuid(); auth uuid:=gen_random_uuid(); allocation uuid:=gen_random_uuid();
 expiry timestamptz:=clock_timestamp()+interval '15 minutes'; operation text;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'STORED_RECEIPT_SYNTHETIC_ONLY' USING ERRCODE='42501'; END IF;
 PERFORM app.assert_receipt_fact_scope(t,j,d);
 SELECT * INTO actor FROM app.authenticate_practice_session(d,t);
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM 'stored-receipt-case-command.v1'
 OR action IS NULL OR action NOT IN('review','approve')
 OR NOT(p ?& ARRAY['version','action','commandId','factLineId','caseId','workId','expectedCaseRevision'])
 OR p-ARRAY['version','action','commandId','factLineId','caseId','workId','expectedCaseRevision','reviewId','approvalHash']<>'{}'::jsonb
 OR (action='review' AND (p ? 'reviewId' OR p ? 'approvalHash'))
 OR (action='approve' AND NOT(p ?& ARRAY['reviewId','approvalHash']))
 OR jsonb_typeof(p->'expectedCaseRevision') IS DISTINCT FROM 'number'
 OR coalesce(p->>'expectedCaseRevision','') !~ '^[1-9][0-9]*$'
 THEN RAISE EXCEPTION 'INVALID_STORED_RECEIPT_COMMAND' USING ERRCODE='23514'; END IF;
 cid:=(p->>'commandId')::uuid;c:=(p->>'caseId')::uuid;f:=(p->>'factLineId')::uuid;w:=(p->>'workId')::uuid;
 IF cid IS NULL OR c IS NULL OR f IS NULL OR w IS NULL THEN RAISE EXCEPTION 'INVALID_STORED_RECEIPT_COMMAND' USING ERRCODE='23514'; END IF;
 -- Same case/receipt lock order as the existing allocator, then command/line
 -- locks. All business locks precede the final audit append.
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(c::text));
 SELECT s.payment_id INTO payment FROM app.receipt_allocation_fact_line l JOIN app.receipt_allocation_fact_source s
  ON(s.tenant_id,s.job_id,s.id)=(l.tenant_id,l.job_id,l.source_id) WHERE l.tenant_id=t AND l.job_id=j AND l.id=f;
 IF payment IS NULL THEN RAISE EXCEPTION 'STORED_RECEIPT_LINE_BINDING_REQUIRED' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':receipt:'||payment::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('stored-receipt-command:'||t::text||':'||cid::text,0));
 -- Serialize competing case/work interpretations of the same job's lines.
 PERFORM pg_advisory_xact_lock(hashtextextended('stored-receipt-lines:'||t::text||':'||j::text,0));
 SELECT * INTO prior FROM app.stored_receipt_case_command WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.job_id<>j OR prior.actor_membership_id<>actor.membership_id OR prior.payload<>p
  THEN RAISE EXCEPTION 'STORED_RECEIPT_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 facts:=app.stored_receipt_case_facts(t,j,f,c,w);
 IF (facts->>'caseRevision')::integer IS DISTINCT FROM (p->>'expectedCaseRevision')::integer
 THEN RAISE EXCEPTION 'STORED_RECEIPT_STALE' USING ERRCODE='40001'; END IF;
 digest:=app.final_lock_hash(facts);
 operation:=CASE WHEN facts->>'reversesId' IS NULL THEN 'stored_receipt.allocate' ELSE 'stored_receipt.reverse' END;
 IF action='review' THEN
  decision:=gen_random_uuid();
  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
   VALUES(decision,t,'recovery_case',c::text,operation);
  result:=jsonb_build_object('version','stored-receipt-case-result.v1','environment','synthetic_demo','realExternalActions',0,
   'jobId',j,'reviewId',cid,'approvalHash',digest,'facts',facts,'allocationId',NULL,'replayed',false);
 ELSE
  SELECT * INTO review FROM app.stored_receipt_case_command WHERE tenant_id=t AND job_id=j AND command_id=(p->>'reviewId')::uuid;
  IF review.command_id IS NULL OR review.payload->>'action'<>'review' OR review.actor_membership_id<>actor.membership_id
  OR review.expires_at<=clock_timestamp() OR review.artifact<>facts OR p->>'approvalHash' IS DISTINCT FROM digest
  OR EXISTS(SELECT 1 FROM app.decision_resolution WHERE tenant_id=t AND decision_id=review.decision_id)
  THEN RAISE EXCEPTION 'STORED_RECEIPT_APPROVAL_CHANGED' USING ERRCODE='23514'; END IF;
  decision:=review.decision_id;expiry:=review.expires_at;
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution,t,decision,'approved',actor.membership_id);
  -- Exact rational amounts are bound by content_hash; amount_pence is NULL
  -- because rounding a deemed line amount would lose information.
  INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at)
   VALUES(auth,t,decision,resolution,actor.membership_id,operation,c::text,digest,(facts->>'caseRevision')::integer,facts->>'policyVersion',expiry);
  INSERT INTO app.stored_receipt_case_binding(tenant_id,job_id,case_id,work_id,line_id,lock_id)
   VALUES(t,j,c,w,(facts->>'lineId')::uuid,(facts->>'lockId')::uuid) ON CONFLICT DO NOTHING;
  INSERT INTO app.stored_receipt_case_allocation(tenant_id,job_id,id,command_id,case_id,work_id,line_id,lock_id,fact_line_id,reverses_id,authorization_id,gross_numerator,gross_denominator,net_numerator,net_denominator)
   VALUES(t,j,allocation,cid,c,w,(facts->>'lineId')::uuid,(facts->>'lockId')::uuid,f,(facts->>'reversesId')::uuid,auth,
    facts->'gross'->>'numerator',facts->'gross'->>'denominator',facts->'net'->>'numerator',facts->'net'->>'denominator');
  result:=jsonb_build_object('version','stored-receipt-case-result.v1','environment','synthetic_demo','realExternalActions',0,
   'jobId',j,'reviewId',review.command_id,'approvalHash',digest,'facts',facts,'allocationId',allocation,'replayed',false);
 END IF;
 INSERT INTO app.stored_receipt_case_command(tenant_id,job_id,command_id,actor_membership_id,payload,artifact,result,decision_id,expires_at)
 VALUES(t,j,cid,actor.membership_id,p,facts,result,decision,expiry);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor.membership_id::text,j,
  CASE WHEN action='review' THEN 'recovery.stored_receipt_reviewed' WHEN facts->>'reversesId' IS NULL THEN 'recovery.stored_receipt_allocated' ELSE 'recovery.stored_receipt_reversed' END,
  jsonb_build_object('commandId',cid,'caseId',c,'factLineId',f,'allocationId',CASE WHEN action='approve' THEN allocation END));
 RETURN result;
END $$;

-- The older case writer takes this same receipt lock before inserting. Prevent
-- it from spending cash already consumed through the stored-line path.
CREATE FUNCTION app.guard_legacy_stored_receipt_cash() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':receipt:'||NEW.payment_id::text,0));
 IF EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation a JOIN app.receipt_allocation_fact_line l ON(l.tenant_id,l.job_id,l.id)=(a.tenant_id,a.job_id,a.fact_line_id)
  JOIN app.receipt_allocation_fact_source s ON(s.tenant_id,s.job_id,s.id)=(l.tenant_id,l.job_id,l.source_id)
  WHERE a.tenant_id=NEW.tenant_id AND s.payment_id=NEW.payment_id)
 THEN RAISE EXCEPTION 'STORED_RECEIPT_CASH_ALREADY_USED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stored_receipt_cash_guard BEFORE INSERT ON app.recovery_case_allocation FOR EACH ROW EXECUTE FUNCTION app.guard_legacy_stored_receipt_cash();
ALTER FUNCTION app.stored_receipt_case_facts(uuid,uuid,uuid,uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.allocate_stored_receipt_line(uuid,uuid,text,jsonb) OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_legacy_stored_receipt_cash() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.stored_receipt_case_facts(uuid,uuid,uuid,uuid,uuid),app.allocate_stored_receipt_line(uuid,uuid,text,jsonb),app.guard_legacy_stored_receipt_cash()
 FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.allocate_stored_receipt_line(uuid,uuid,text,jsonb) TO jobguard_runtime;
COMMIT;
