BEGIN;
-- M4-8-S part 2: synthetic neutral producer and case/work consumer for the
-- immutable 0258 bridge. No application amount or artifact is accepted.
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


-- Shared by the producer and consumer. Compare immutable commercial identity,
-- not regenerated line UUIDs, when excluding the original bill.
CREATE FUNCTION app.receipt_fact_invoice_line(t uuid,j uuid,i uuid,l uuid,r uuid,k uuid,ch uuid) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE binding app.final_account_invoice_binding; locked app.final_account_lock; item app.final_account_line;
BEGIN
 SELECT * INTO binding FROM app.final_account_invoice_binding WHERE tenant_id=t AND job_id=j AND invoice_id=i;
 SELECT * INTO locked FROM app.final_account_lock WHERE tenant_id=t AND job_id=j AND id=k;
 SELECT * INTO item FROM app.final_account_line WHERE tenant_id=t AND job_id=j AND id=l AND final_account_revision_id=r;
 IF item.id IS NULL OR locked.id IS NULL OR binding.invoice_id IS NULL
 OR (binding.revision_id,binding.lock_id,binding.check_id) IS DISTINCT FROM(r,k,ch)
 OR NOT EXISTS(SELECT 1 FROM app.final_account_invoiced_line x WHERE x.tenant_id=t AND x.job_id=j AND x.invoice_id=i AND x.final_account_line_id=l AND x.revision_id=r
  AND (x.scope_item_id,x.commercial_revision_id,x.line_kind,x.source_id,x.net_pence)=(item.scope_item_id,item.commercial_revision_id,item.line_kind,item.source_id,item.net_pence))
 OR NOT EXISTS(SELECT 1 FROM app.final_account_lock_check x WHERE x.tenant_id=t AND x.job_id=j AND x.lock_id=k AND x.id=ch AND x.status='completed')
 THEN RAISE EXCEPTION 'STORED_RECEIPT_LINE_BINDING_REQUIRED' USING ERRCODE='23514'; END IF;
 IF binding.invoice_kind='final' THEN
  IF r<>locked.final_account_revision_id THEN RAISE EXCEPTION 'STORED_RECEIPT_LINE_BINDING_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSIF binding.invoice_kind='supplementary' THEN
  IF r=locked.final_account_revision_id OR NOT EXISTS(
   WITH RECURSIVE ancestors AS (
    SELECT x.id,x.previous_revision_id,x.revision,ARRAY[x.id] path FROM app.final_account_revision x
     WHERE x.tenant_id=t AND x.job_id=j AND x.id=r AND x.baseline_quote_version_id=locked.baseline_quote_version_id
    UNION ALL SELECT x.id,x.previous_revision_id,x.revision,a.path||x.id FROM app.final_account_revision x JOIN ancestors a ON x.id=a.previous_revision_id
     WHERE x.tenant_id=t AND x.job_id=j AND x.baseline_quote_version_id=locked.baseline_quote_version_id AND x.revision<a.revision AND NOT x.id=ANY(a.path)
   ) SELECT 1 FROM ancestors WHERE id=locked.final_account_revision_id)
  OR NOT EXISTS(SELECT 1 FROM app.final_account_invoice_binding x WHERE x.tenant_id=t AND x.job_id=j AND x.lock_id=k AND x.invoice_kind='final' AND x.revision_id=locked.final_account_revision_id)
  OR EXISTS(SELECT 1 FROM app.final_account_line x WHERE x.tenant_id=t AND x.job_id=j AND x.final_account_revision_id=locked.final_account_revision_id
   AND (x.id=l OR (x.line_kind,x.source_id,x.commercial_revision_id,x.scope_item_id)=(item.line_kind,item.source_id,item.commercial_revision_id,item.scope_item_id)))
  THEN RAISE EXCEPTION 'STORED_RECEIPT_LINE_BINDING_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSE RAISE EXCEPTION 'STORED_RECEIPT_LINE_BINDING_REQUIRED' USING ERRCODE='23514'; END IF;
END $$;

-- A quarantined storage row is not a released source. Require the durable
-- producer command and exact approved authorization, not a JSON brand alone.
CREATE FUNCTION app.receipt_fact_source_approved(t uuid,j uuid,f uuid) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=pg_catalog,app AS $$
 SELECT EXISTS(SELECT 1 FROM app.receipt_allocation_fact_source s
  JOIN app.receipt_allocation_fact_revision r ON(r.tenant_id,r.job_id,r.id)=(s.tenant_id,s.job_id,s.allocation_revision_id)
  JOIN app.receipt_allocation_fact_command c ON(c.tenant_id,c.job_id,c.command_id)=(r.tenant_id,r.job_id,r.command_id)
  JOIN app.action_authorization a ON a.tenant_id=s.tenant_id AND a.id::text=s.source_manifest->>'approvalRef'
  JOIN app.decision_resolution dr ON(dr.tenant_id,dr.id,dr.decision_id)=(a.tenant_id,a.resolution_id,a.decision_id)
  WHERE s.tenant_id=t AND s.job_id=j AND s.id=f AND c.payload->>'version'='receipt-line-facts-command.v1'
   AND c.payload->>'action'=(CASE WHEN r.direction='receipt' THEN 'approve' ELSE 'reverse' END)
   AND c.result->>'allocationRevisionId'=r.id::text AND trim(a.content_hash)=r.source_hash
   AND a.action_type='receipt_facts.'||r.direction AND a.actor_membership_id=c.actor_membership_id
   AND dr.resolution='approved' AND dr.actor_membership_id=c.actor_membership_id AND c.created_at<=a.expires_at)
$$;

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
 -- Original lines are lock-bound; post-lock catches are bound to their
 -- supplementary invoice and an exact descendant chain back to that lock.
 IF l.id IS NULL OR s.id IS NULL OR k.id IS NULL OR item.id IS NULL OR inv.final_account_line_id IS NULL
 OR NOT EXISTS(SELECT 1 FROM app.final_account_invoice_binding b WHERE b.tenant_id=t AND b.job_id=j AND b.invoice_id=s.invoice_id AND b.invoice_kind=s.invoice_kind)
 OR NOT app.receipt_fact_source_approved(t,j,s.id)
 OR (l.original_line_net_pence,l.original_line_gross_pence,l.scope_item_id,l.commercial_revision_id)
 IS DISTINCT FROM(inv.net_pence,inv.gross_pence,inv.scope_item_id,inv.commercial_revision_id)
 OR l.net_numerator::numeric*l.gross_denominator::numeric*inv.gross_pence
 <>l.gross_numerator::numeric*l.net_denominator::numeric*inv.net_pence
 THEN RAISE EXCEPTION 'STORED_RECEIPT_LINE_BINDING_REQUIRED' USING ERRCODE='23514'; END IF;
 PERFORM app.receipt_fact_invoice_line(t,j,s.invoice_id,l.line_id,s.revision_id,s.lock_id,s.check_id);
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
 -- Catch cases and catch-origin lines require their own variation/revision;
 -- the generic invoice-reference route must never relabel original billing.
 IF rc.case_type='missed_variation_final_account' OR EXISTS(
  SELECT 1 FROM app.variation_revision vr JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(vr.tenant_id,vr.job_id,vr.variation_id)
  WHERE vr.tenant_id=t AND vr.job_id=j AND vr.id=l.commercial_revision_id AND item.line_kind='variation' AND item.source_id=vr.id AND o.kind='jobguard_catch') THEN
  -- The shared invoice-line guard above verifies this supplementary binding's
  -- exact revision, this lock, its completed check, ancestry and original-bill exclusion.
  IF rc.case_type IS DISTINCT FROM 'missed_variation_final_account' OR item.line_kind<>'variation' OR s.invoice_kind<>'supplementary'
   OR NOT EXISTS(SELECT 1 FROM app.variation_revision vr JOIN app.extra_origin o
    ON(o.tenant_id,o.job_id,o.variation_id)=(vr.tenant_id,vr.job_id,vr.variation_id)
    WHERE vr.tenant_id=t AND vr.job_id=j AND vr.id=l.commercial_revision_id AND item.source_id=vr.id AND vr.scope_item_id=l.scope_item_id
     AND o.kind='jobguard_catch' AND rc.source_refs ? ('variation:'||vr.variation_id::text) AND rc.source_refs ? ('revision:'||vr.id::text))
  THEN RAISE EXCEPTION 'STORED_RECEIPT_CASE_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSIF NOT (rc.source_refs ? s.invoice_id::text OR rc.source_refs ? ('variation:'||item.source_id::text)
  OR rc.source_refs ? ('revision:'||l.commercial_revision_id::text))
 THEN RAISE EXCEPTION 'STORED_RECEIPT_CASE_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM app.stored_receipt_case_binding b WHERE b.tenant_id=t AND b.job_id=j AND (b.line_id=l.line_id OR b.work_id=w)
  AND (b.case_id,b.work_id,b.line_id,b.lock_id) IS DISTINCT FROM(c,w,l.line_id,k.id))
 THEN RAISE EXCEPTION 'STORED_RECEIPT_LINE_ALREADY_BOUND' USING ERRCODE='23514'; END IF;
 IF l.reverses_line_allocation_id IS NULL THEN
  IF l.gross_numerator::numeric<=0 OR l.net_numerator::numeric<0 OR s.receipt_effective_at<l.line_existed_at
  OR EXISTS(SELECT 1 FROM app.action_authorization a WHERE a.tenant_id=t AND a.id::text=s.source_manifest->>'approvalRef' AND a.revoked_at IS NOT NULL)
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


CREATE FUNCTION app.receipt_fact_watermark(t uuid,j uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,app AS $$
 SELECT jsonb_build_object('revision',(SELECT coalesce(max(source_revision),0)+1 FROM app.receipt_allocation_fact_revision WHERE tenant_id=t AND job_id=j),
 'sourceHash',app.final_lock_hash(jsonb_build_object(
  'payments',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM app.customer_payment x WHERE tenant_id=t AND job_id=j),
  'movements',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM app.practice_feed_event x WHERE tenant_id=t AND job_id=j),
  'matches',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM app.practice_feed_receipt_match x WHERE tenant_id=t AND job_id=j),
  'refunds',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM app.customer_payment_reversal x WHERE tenant_id=t AND job_id=j),
  'credits',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM app.customer_credit_note x WHERE tenant_id=t AND job_id=j),
  'lines',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY invoice_id,final_account_line_id),'[]') FROM app.final_account_invoiced_line x WHERE tenant_id=t AND job_id=j),
  'allocations',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM app.receipt_allocation_fact_line x WHERE tenant_id=t AND job_id=j),
  'invalidations',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM app.evidence_invalidation x JOIN app.evidence_object e ON(e.tenant_id,e.id)=(x.tenant_id,x.evidence_id) WHERE e.tenant_id=t AND e.job_id=j))))
$$;

-- Derive an exact distribution solely from stored invoice/settlement facts.
-- SH-1 independently checks the returned input and proposal in the repository.
CREATE FUNCTION app.receipt_fact_proposal(t uuid,j uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE payment app.customer_payment; movement app.practice_feed_event; binding app.final_account_invoice_binding;
 original app.receipt_allocation_fact_revision; source app.receipt_allocation_fact_source; credit app.customer_credit_note;
 l record; used numeric[]; total numeric[]; amount numeric[]; balance numeric[]; terms jsonb:='[]'; inputs jsonb:='[]'; outputs jsonb:='[]';
 balances jsonb:='{}'; originals jsonb:='{}'; evidence jsonb; wm jsonb; rule text; ref text; direction text;
 gn numeric; gd numeric; nn numeric; nd numeric; g numeric; existed timestamptz; effective timestamptz; input jsonb; explicit_shares jsonb:='[]'; remittance uuid;
BEGIN
 wm:=app.receipt_fact_watermark(t,j);
 direction:=CASE WHEN p->>'action'='review_reverse' THEN 'reversal' ELSE 'receipt' END;
 IF direction='reversal' THEN
  SELECT * INTO original FROM app.receipt_allocation_fact_revision pr WHERE pr.tenant_id=t AND pr.job_id=j AND pr.id=(p->>'allocationRevisionId')::uuid AND pr.direction='receipt';
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_LINE_ORIGINAL_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO source FROM app.receipt_allocation_fact_source WHERE tenant_id=t AND job_id=j AND allocation_revision_id=original.id;
  IF source.id IS NULL OR NOT app.receipt_fact_source_approved(t,j,source.id) THEN RAISE EXCEPTION 'RECEIPT_LINE_ORIGINAL_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO payment FROM app.customer_payment WHERE tenant_id=t AND job_id=j AND id=original.payment_id;
 ELSE
  SELECT * INTO payment FROM app.customer_payment WHERE tenant_id=t AND job_id=j AND id=(p->>'paymentId')::uuid;
 END IF;
 IF payment.id IS NULL THEN RAISE EXCEPTION 'RECEIPT_LINE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT e.* INTO movement FROM app.practice_feed_event e JOIN app.practice_feed_receipt_match m
  ON(e.tenant_id,e.job_id,e.account_id,e.event_id)=(m.tenant_id,m.job_id,m.account_id,m.settled_event_id)
  WHERE m.tenant_id=t AND m.job_id=j AND m.payment_id=payment.id AND e.state='settled' AND e.identity='identified'
   AND e.gross_pence=m.matched_pence AND m.matched_pence=payment.amount_pence;
 IF movement.id IS NULL OR EXISTS(SELECT 1 FROM app.practice_feed_event e WHERE e.tenant_id=t AND e.job_id=j AND e.account_id=movement.account_id AND e.movement_key=movement.movement_key AND e.state='possible_duplicate'
  AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command c WHERE c.tenant_id=t AND c.job_id=j AND c.account_id=e.account_id AND c.movement_key=e.movement_key AND c.action='reconcile_duplicate'))
 THEN RAISE EXCEPTION 'RECEIPT_LINE_SETTLEMENT_REQUIRED' USING ERRCODE='23514'; END IF;
 effective:=movement.created_at;
 SELECT * INTO binding FROM app.final_account_invoice_binding WHERE tenant_id=t AND job_id=j AND invoice_id=payment.invoice_id;
 IF binding.invoice_id IS NULL THEN RAISE EXCEPTION 'STORED_RECEIPT_LINE_BINDING_REQUIRED' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.customer_invoice ci WHERE ci.tenant_id=t AND ci.job_id=j AND ci.id=payment.invoice_id AND ci.synthetic
  AND (ci.net_pence,ci.tax_pence,ci.total_pence)=(SELECT sum(x.net_pence),sum(x.tax_pence),sum(x.gross_pence) FROM app.final_account_invoiced_line x WHERE x.tenant_id=t AND x.job_id=j AND x.invoice_id=ci.id))
 THEN RAISE EXCEPTION 'RECEIPT_LINE_COMPOSITION_REQUIRED' USING ERRCODE='23514'; END IF;
 -- Recheck the authoritative certificate as well as the individual line binding.
 IF direction='receipt' THEN PERFORM app.require_authoritative_final_check(t,j); END IF;
 IF direction='receipt' THEN
  IF EXISTS(SELECT 1 FROM app.customer_payment_reversal WHERE tenant_id=t AND job_id=j AND payment_id=payment.id)
   OR EXISTS(SELECT 1 FROM app.receipt_allocation_fact_revision rf WHERE rf.tenant_id=t AND rf.job_id=j AND rf.payment_id=payment.id AND rf.direction='receipt')
   OR EXISTS(SELECT 1 FROM app.recovery_case_allocation WHERE tenant_id=t AND job_id=j AND payment_id=payment.id)
  THEN RAISE EXCEPTION 'RECEIPT_LINE_NOT_AVAILABLE' USING ERRCODE='23514'; END IF;
  -- Process receipts in their actual settlement order. A later deposit cannot
  -- retroactively change the outstanding denominator of an earlier receipt.
  IF EXISTS(SELECT 1 FROM app.practice_feed_receipt_match m JOIN app.practice_feed_event e ON(e.tenant_id,e.job_id,e.account_id,e.event_id)=(m.tenant_id,m.job_id,m.account_id,m.settled_event_id)
   JOIN app.customer_payment cp ON(cp.tenant_id,cp.job_id,cp.id)=(m.tenant_id,m.job_id,m.payment_id)
   WHERE m.tenant_id=t AND m.job_id=j AND cp.invoice_id=payment.invoice_id AND (e.created_at,e.id)<(movement.created_at,movement.id)
    AND NOT EXISTS(SELECT 1 FROM app.customer_payment_reversal r WHERE r.tenant_id=t AND r.payment_id=cp.id)
    AND NOT EXISTS(SELECT 1 FROM app.receipt_allocation_fact_revision r WHERE r.tenant_id=t AND r.payment_id=cp.id AND r.direction='receipt'))
  THEN RAISE EXCEPTION 'RECEIPT_LINE_EARLIER_RECEIPT_REQUIRED' USING ERRCODE='23514'; END IF;
  -- Do not compute a later denominator while an earlier stored reversal is
  -- still missing its line distribution. A credit also changes the commercial
  -- principal: require a corrected line composition before any later receipt,
  -- rather than treating its negative fee allocation as reopened cash capacity.
  IF EXISTS(SELECT 1 FROM app.customer_credit_note cn WHERE cn.tenant_id=t AND cn.job_id=j AND cn.invoice_id=payment.invoice_id AND cn.created_at<=movement.created_at)
  THEN RAISE EXCEPTION 'RECEIPT_LINE_CREDIT_COMPOSITION_REQUIRED' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM app.customer_payment_reversal rr JOIN app.customer_payment cp ON(cp.tenant_id,cp.job_id,cp.id)=(rr.tenant_id,rr.job_id,rr.payment_id)
    WHERE rr.tenant_id=t AND rr.job_id=j AND cp.invoice_id=payment.invoice_id AND rr.created_at<=movement.created_at
     AND EXISTS(SELECT 1 FROM app.receipt_allocation_fact_revision pr WHERE pr.tenant_id=t AND pr.payment_id=cp.id AND pr.direction='receipt')
     AND NOT EXISTS(SELECT 1 FROM app.receipt_allocation_fact_source fs WHERE fs.tenant_id=t AND fs.job_id=j AND fs.source_manifest->>'reversalSourceId'=rr.id::text))
  THEN RAISE EXCEPTION 'RECEIPT_LINE_EARLIER_REVERSAL_REQUIRED' USING ERRCODE='23514'; END IF;
  amount:=ARRAY[payment.amount_pence::numeric,1::numeric];
 ELSE
  IF p->'reversalSource'->>'kind'='payment_reversal' THEN
   SELECT created_at INTO effective FROM app.customer_payment_reversal WHERE tenant_id=t AND job_id=j AND payment_id=payment.id AND id=(p->'reversalSource'->>'sourceId')::uuid;
   IF NOT EXISTS(SELECT 1 FROM app.customer_payment_reversal WHERE tenant_id=t AND job_id=j AND payment_id=payment.id AND id=(p->'reversalSource'->>'sourceId')::uuid)
   THEN RAISE EXCEPTION 'RECEIPT_LINE_REVERSAL_REQUIRED' USING ERRCODE='23514'; END IF;
  ELSE
   SELECT * INTO credit FROM app.customer_credit_note WHERE tenant_id=t AND job_id=j AND invoice_id=payment.invoice_id AND id=(p->'reversalSource'->>'sourceId')::uuid;
   effective:=credit.created_at;
   IF credit.id IS NULL THEN RAISE EXCEPTION 'RECEIPT_LINE_REVERSAL_REQUIRED' USING ERRCODE='23514'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM app.receipt_allocation_fact_source s WHERE s.tenant_id=t AND s.job_id=j AND s.payment_id=payment.id
   AND s.source_manifest->>'reversalSourceId'=p->'reversalSource'->>'sourceId')
  THEN RAISE EXCEPTION 'RECEIPT_LINE_NOT_AVAILABLE' USING ERRCODE='23514'; END IF;
 END IF;
 rule:=CASE WHEN binding.invoice_kind='supplementary' THEN 'separate_invoice' ELSE 'pro_rata' END;
 ref:=CASE WHEN rule='separate_invoice' THEN binding.invoice_id::text ELSE movement.id::text END;
 -- Explicit remittance is accepted only from an already stored, byte-verified
 -- source for this exact payment. A free-text payment reference is not authority.
 IF (SELECT count(DISTINCT s.evidence_id) FROM app.recovery_allocation_line_source s JOIN app.recovery_allocation_review r
  ON r.tenant_id=s.tenant_id AND r.job_id=s.job_id AND r.payment_id=payment.id AND r.artifact->>'remittanceEvidenceId'=s.evidence_id::text
   AND r.action=(CASE WHEN direction='receipt' THEN 'allocate' ELSE 'reverse' END)
   AND (direction='receipt' OR r.artifact->>'sourceId'=p->'reversalSource'->>'sourceId')
  WHERE s.tenant_id=t AND s.job_id=j AND s.invoice_id=payment.invoice_id AND s.rule='explicit')>1
 THEN RAISE EXCEPTION 'RECEIPT_LINE_REMITTANCE_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT DISTINCT s.evidence_id INTO remittance FROM app.recovery_allocation_line_source s JOIN app.recovery_allocation_review r
  ON r.tenant_id=s.tenant_id AND r.job_id=s.job_id AND r.payment_id=payment.id AND r.artifact->>'remittanceEvidenceId'=s.evidence_id::text
   AND r.action=CASE WHEN direction='receipt' THEN 'allocate' ELSE 'reverse' END
   AND (direction='receipt' OR r.artifact->>'sourceId'=p->'reversalSource'->>'sourceId')
  WHERE s.tenant_id=t AND s.job_id=j AND s.invoice_id=payment.invoice_id AND s.rule='explicit' LIMIT 1;
 IF p ? 'remittanceEvidenceId' AND (p->>'remittanceEvidenceId')::uuid IS DISTINCT FROM remittance THEN RAISE EXCEPTION 'RECEIPT_LINE_REMITTANCE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF remittance IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
   WHERE e.tenant_id=t AND e.job_id=j AND e.id=remittance AND e.kind='original' AND e.server_verified_at IS NOT NULL AND u.state='verified'
    AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation x WHERE x.tenant_id=t AND x.evidence_id=e.id))
  THEN RAISE EXCEPTION 'RECEIPT_LINE_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
  rule:='explicit';ref:=remittance::text;
 END IF;
 FOR l IN SELECT x.*,si.created_at scope_created_at,coalesce(q.created_at,v.created_at,si.created_at) commercial_created_at
  FROM app.final_account_invoiced_line x JOIN app.scope_identity si ON(si.tenant_id,si.job_id,si.id)=(x.tenant_id,x.job_id,x.scope_item_id)
  LEFT JOIN app.quote_revision q ON(q.tenant_id,q.job_id,q.id)=(x.tenant_id,x.job_id,x.commercial_revision_id)
  LEFT JOIN app.variation_revision v ON(v.tenant_id,v.job_id,v.id)=(x.tenant_id,x.job_id,x.commercial_revision_id)
  WHERE x.tenant_id=t AND x.job_id=j AND x.invoice_id=payment.invoice_id ORDER BY x.final_account_line_id LOOP
  PERFORM app.receipt_fact_invoice_line(t,j,l.invoice_id,l.final_account_line_id,l.revision_id,binding.lock_id,binding.check_id);
  IF l.net_pence<0 OR l.gross_pence<=0 THEN RAISE EXCEPTION 'RECEIPT_LINE_COMPOSITION_REQUIRED' USING ERRCODE='23514'; END IF;
  existed:=greatest(l.scope_created_at,l.commercial_created_at);
  IF direction='receipt' THEN
   SELECT app.recovery_allocation_fraction_sum(coalesce(jsonb_agg(jsonb_build_array(fl.gross_numerator,fl.gross_denominator)),'[]')) INTO used
    FROM app.receipt_allocation_fact_line fl JOIN app.receipt_allocation_fact_source fs ON(fs.tenant_id,fs.job_id,fs.id)=(fl.tenant_id,fl.job_id,fl.source_id)
    WHERE fl.tenant_id=t AND fl.job_id=j AND fl.invoice_id=payment.invoice_id AND fl.line_id=l.final_account_line_id AND fs.receipt_effective_at<=movement.created_at;
   balance:=ARRAY[l.gross_pence::numeric*used[2]-used[1],used[2]];
   IF existed>movement.created_at THEN balance:=ARRAY[0::numeric,1::numeric]; END IF;
  ELSE
   -- Original positive shares, with all previous linked negatives, define the
   -- available refund denominator; current invoice balances cannot replace it.
   SELECT app.recovery_allocation_fraction_sum(coalesce(jsonb_agg(jsonb_build_array(fl.gross_numerator,fl.gross_denominator)),'[]')) INTO balance
    FROM app.receipt_allocation_fact_line fl WHERE fl.tenant_id=t AND fl.job_id=j AND (fl.id IN(SELECT x.id FROM app.receipt_allocation_fact_line x JOIN app.receipt_allocation_fact_source fs ON(fs.tenant_id,fs.job_id,fs.id)=(x.tenant_id,x.job_id,x.source_id) WHERE fs.tenant_id=t AND fs.allocation_revision_id=original.id AND x.line_id=l.final_account_line_id)
     OR fl.reverses_line_allocation_id IN(SELECT x.id FROM app.receipt_allocation_fact_line x JOIN app.receipt_allocation_fact_source fs ON(fs.tenant_id,fs.job_id,fs.id)=(x.tenant_id,x.job_id,x.source_id) WHERE fs.tenant_id=t AND fs.allocation_revision_id=original.id AND x.line_id=l.final_account_line_id));
   originals:=originals||jsonb_build_object(l.final_account_line_id::text,(SELECT x.id FROM app.receipt_allocation_fact_line x JOIN app.receipt_allocation_fact_source fs ON(fs.tenant_id,fs.job_id,fs.id)=(x.tenant_id,x.job_id,x.source_id) WHERE fs.tenant_id=t AND fs.allocation_revision_id=original.id AND x.line_id=l.final_account_line_id));
  END IF;
  IF balance[1]<0 THEN RAISE EXCEPTION 'RECEIPT_LINE_CAPACITY_EXCEEDED' USING ERRCODE='23514'; END IF;
  balances:=balances||jsonb_build_object(l.final_account_line_id::text,to_jsonb(balance));
  terms:=terms||jsonb_build_array(to_jsonb(balance));
  inputs:=inputs||jsonb_build_array(jsonb_build_object('id',l.final_account_line_id,'invoiceId',payment.invoice_id,'grossPence',l.gross_pence,'netPence',l.net_pence,
   'outstandingGross',jsonb_build_object('numerator',trunc(balance[1])::text,'denominator',trunc(balance[2])::text),'existedAt',to_char(existed AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 END LOOP;
 IF jsonb_array_length(inputs)=0 OR jsonb_array_length(inputs)>10000 THEN RAISE EXCEPTION 'RECEIPT_LINE_COMPOSITION_REQUIRED' USING ERRCODE='23514'; END IF;
 total:=app.recovery_allocation_fraction_sum(terms);
 IF total[1]<=0 THEN RAISE EXCEPTION 'RECEIPT_LINE_NOT_AVAILABLE' USING ERRCODE='23514'; END IF;
 IF direction='reversal' THEN
  amount:=total;
  IF credit.id IS NOT NULL THEN
   SELECT app.recovery_allocation_fraction_sum(coalesce(jsonb_agg(jsonb_build_array(fl.gross_numerator,fl.gross_denominator)),'[]')) INTO used
    FROM app.receipt_allocation_fact_line fl JOIN app.receipt_allocation_fact_source fs ON(fs.tenant_id,fs.job_id,fs.id)=(fl.tenant_id,fl.job_id,fl.source_id)
    WHERE fs.tenant_id=t AND fs.job_id=j AND fs.source_manifest->>'creditNoteId'=credit.id::text;
   balance:=ARRAY[credit.amount_pence::numeric*used[2]+used[1],used[2]];
   IF balance[1]<=0 THEN RAISE EXCEPTION 'RECEIPT_LINE_NOT_AVAILABLE' USING ERRCODE='23514'; END IF;
   IF balance[1]*amount[2]<amount[1]*balance[2] THEN amount:=balance; END IF;
  END IF;
  IF rule<>'explicit' THEN ref:=p->'reversalSource'->>'sourceId'; END IF;
 END IF;
 IF amount[1]*total[2]>total[1]*amount[2] THEN RAISE EXCEPTION 'RECEIPT_LINE_CAPACITY_EXCEEDED' USING ERRCODE='23514'; END IF;
 FOR l IN SELECT x.*,value->>'existedAt' existed_at FROM jsonb_array_elements(inputs) value JOIN app.final_account_invoiced_line x ON x.tenant_id=t AND x.job_id=j AND x.invoice_id=payment.invoice_id AND x.final_account_line_id=(value->>'id')::uuid ORDER BY x.final_account_line_id LOOP
  balance:=ARRAY[(balances->l.final_account_line_id::text->>0)::numeric,(balances->l.final_account_line_id::text->>1)::numeric];
  gn:=amount[1]*balance[1]*total[2];gd:=amount[2]*balance[2]*total[1];
  IF rule='explicit' THEN
   SELECT gross_numerator::numeric,gross_denominator::numeric INTO gn,gd FROM app.recovery_allocation_line_source WHERE tenant_id=t AND job_id=j AND invoice_id=payment.invoice_id AND line_id=l.final_account_line_id AND evidence_id=remittance ORDER BY id LIMIT 1;
   gn:=coalesce(gn,0);gd:=coalesce(gd,1);
   IF gn*balance[2]>balance[1]*gd THEN RAISE EXCEPTION 'RECEIPT_LINE_CAPACITY_EXCEEDED' USING ERRCODE='23514'; END IF;
  END IF;
  IF gn=0 THEN CONTINUE; END IF;
  g:=gcd(gn,gd);gn:=div(gn,g);gd:=div(gd,g);nn:=gn*l.net_pence;nd:=gd*l.gross_pence;g:=gcd(nn,nd);nn:=div(nn,g);nd:=div(nd,g);
  IF direction='reversal' THEN gn:=-gn;nn:=-nn; END IF;
  outputs:=outputs||jsonb_build_array(jsonb_build_object('lineId',l.final_account_line_id,'scopeItemId',l.scope_item_id,'commercialRevisionId',l.commercial_revision_id,
   'rule',rule,'sourceRef',ref,'gross',jsonb_build_object('numerator',gn::text,'denominator',gd::text),'net',jsonb_build_object('numerator',nn::text,'denominator',nd::text),
   'originalLineNetPence',l.net_pence,'originalLineGrossPence',l.gross_pence,'lineExistedAt',l.existed_at,'reversesLineAllocationId',originals->l.final_account_line_id::text));
  IF rule='explicit' THEN explicit_shares:=explicit_shares||jsonb_build_array(jsonb_build_object('lineId',l.final_account_line_id,'gross',jsonb_build_object('numerator',abs(gn)::text,'denominator',gd::text))); END IF;
 END LOOP;
 SELECT app.recovery_allocation_fraction_sum(coalesce(jsonb_agg(jsonb_build_array(value->'gross'->>'numerator',value->'gross'->>'denominator')),'[]')) INTO used FROM jsonb_array_elements(outputs);
 IF abs(used[1])*amount[2]<>amount[1]*used[2] THEN RAISE EXCEPTION 'RECEIPT_LINE_COMPOSITION_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('evidenceId',e.id,'objectVersionId',e.object_version_id,'sha256',trim(e.sha256),'serverReceivedAt',to_char(e.server_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY e.id),'[]') INTO evidence
  FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
  WHERE e.tenant_id=t AND e.job_id=j AND e.kind='original' AND e.server_verified_at IS NOT NULL AND u.state='verified'
   AND (e.id=remittance OR EXISTS(SELECT 1 FROM app.final_account_proof fp JOIN app.final_account_lock k ON k.tenant_id=fp.tenant_id AND k.job_id=fp.job_id
    WHERE fp.tenant_id=t AND fp.job_id=j AND fp.evidence_id=e.id AND fp.final_account_revision_id IN(binding.revision_id,k.final_account_revision_id)))
   AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation x WHERE x.tenant_id=t AND x.evidence_id=e.id);
 IF direction='receipt' AND jsonb_array_length(evidence)=0 THEN RAISE EXCEPTION 'RECEIPT_LINE_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
 input:=jsonb_build_object('version','recovery-receipt-facts.v1','environment','synthetic_demo','direction',direction,'compositionComplete',true,
  'receipt',jsonb_build_object('id',payment.id,'invoiceId',payment.invoice_id,'gross',jsonb_build_object('numerator',trunc(amount[1])::text,'denominator',trunc(amount[2])::text),'effectiveAt',to_char(effective AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sourceRef',CASE WHEN direction='reversal' THEN ref ELSE movement.id::text END),
  'lines',inputs,'explicit',CASE WHEN rule='explicit' THEN jsonb_build_object('sourceRef',ref,'shares',explicit_shares) ELSE NULL END,
  'separateInvoice',CASE WHEN binding.invoice_kind='supplementary' THEN jsonb_build_object('invoiceId',payment.invoice_id,'sourceRef',CASE WHEN direction='reversal' THEN ref ELSE payment.invoice_id::text END) ELSE NULL END);
 RETURN jsonb_build_object('paymentId',payment.id,'invoiceId',payment.invoice_id,'binding',to_jsonb(binding),'movement',to_jsonb(movement),'operation',direction,
  'effectiveAt',to_char(effective AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'watermark',wm,'lines',outputs,'input',input,'evidence',evidence,'reversalSource',p->'reversalSource','reversesAllocationRevisionId',original.id);
END $$;

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
 -- The superseded build-ahead protocol remains refused; only the no-amount protocol is enabled.
 IF p->>'version'='receipt-line-allocation-command.v1' THEN RAISE EXCEPTION 'RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED' USING ERRCODE='55000'; END IF;
 IF p_artifact IS NOT NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM 'receipt-line-facts-command.v1'
 OR action IS NULL OR action NOT IN('review','approve','review_reverse','reverse')
 OR NOT(p ?& ARRAY['version','commandId','action','expectedSourceRevision']) OR jsonb_typeof(p->'expectedSourceRevision') IS DISTINCT FROM 'number'
 OR coalesce(p->>'expectedSourceRevision','') !~ '^[1-9][0-9]*$'
 OR (action='review' AND (NOT p ? 'paymentId' OR p-ARRAY['version','commandId','action','expectedSourceRevision','paymentId','remittanceEvidenceId']<>'{}'))
 OR (action='review_reverse' AND (NOT(p ?& ARRAY['allocationRevisionId','reversalSource']) OR p-ARRAY['version','commandId','action','expectedSourceRevision','allocationRevisionId','reversalSource']<>'{}'
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
  IF request->>'version' IS DISTINCT FROM 'receipt-line-facts-command.v1'
   OR request->>'action' IS DISTINCT FROM (CASE WHEN action='reverse' THEN 'review_reverse' ELSE 'review' END)
  THEN RAISE EXCEPTION 'RECEIPT_LINE_APPROVAL_CHANGED' USING ERRCODE='23514'; END IF;
 END IF;
 IF expected<>(app.receipt_fact_watermark(t,j)->>'revision')::bigint THEN RAISE EXCEPTION 'RECEIPT_LINE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
 doc:=app.receipt_fact_proposal(t,j,request);
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

CREATE OR REPLACE FUNCTION app.read_receipt_allocation_facts(p_tenant uuid,p_job uuid,p_session_digest text,p_selector jsonb,p_expected jsonb DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=p_tenant;j uuid:=p_job;wm jsonb;rows jsonb;holds jsonb:='[]';bound record;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'RECEIPT_LINE_SYNTHETIC_ONLY' USING ERRCODE='42501'; END IF;
 PERFORM app.assert_receipt_fact_scope(t,j,p_session_digest);
 IF jsonb_typeof(p_selector) IS DISTINCT FROM 'object' OR (p_selector->>'jobId')::uuid IS DISTINCT FROM j
  OR p_selector-ARRAY['jobId','invoiceId','paymentId']<>'{}' THEN RAISE EXCEPTION 'INVALID_RECEIPT_LINE_QUERY' USING ERRCODE='23514'; END IF;
 FOR bound IN SELECT l.line_id,s.* FROM app.receipt_allocation_fact_line l JOIN app.receipt_allocation_fact_source s
  ON(s.tenant_id,s.job_id,s.id)=(l.tenant_id,l.job_id,l.source_id) WHERE l.tenant_id=t AND l.job_id=j LOOP
  PERFORM app.receipt_fact_invoice_line(t,j,bound.invoice_id,bound.line_id,bound.revision_id,bound.lock_id,bound.check_id);
  IF NOT app.receipt_fact_source_approved(t,j,bound.id)
   OR NOT EXISTS(SELECT 1 FROM app.final_account_invoice_binding b WHERE b.tenant_id=t AND b.job_id=j AND b.invoice_id=bound.invoice_id AND b.invoice_kind=bound.invoice_kind)
   OR NOT EXISTS(SELECT 1 FROM app.practice_feed_event e WHERE e.tenant_id=t AND e.job_id=j AND e.id=bound.movement_id AND trim(e.source_hash)=bound.movement_hash)
  THEN RAISE EXCEPTION 'RECEIPT_LINE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END LOOP;
 wm:=app.receipt_fact_watermark(t,j);
 IF p_expected IS NOT NULL AND p_expected IS DISTINCT FROM wm THEN RAISE EXCEPTION 'RECEIPT_LINE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('version','receipt-line-allocation-source.v1','tenantId',t,'jobId',j,
  'allocationRevisionId',r.id,'lineAllocationId',l.id,'sourceHash',r.source_hash,'direction',r.direction,'paymentId',s.payment_id,'movementId',s.movement_id,'movementHash',s.movement_hash,
  'invoiceId',s.invoice_id,'invoiceBinding',jsonb_build_object('invoiceId',s.invoice_id,'revisionId',s.revision_id,'lockId',s.lock_id,'checkId',s.check_id,'invoiceKind',s.invoice_kind),
  'lineId',l.line_id,'scopeItemId',l.scope_item_id,'commercialRevisionId',l.commercial_revision_id,'rule',l.rule,'sourceRef',l.source_ref,
  'receiptEffectiveAt',to_char(s.receipt_effective_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'lineExistedAt',to_char(l.line_existed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'gross',jsonb_build_object('numerator',l.gross_numerator,'denominator',l.gross_denominator),'net',jsonb_build_object('numerator',l.net_numerator,'denominator',l.net_denominator),
  'originalLineNetPence',l.original_line_net_pence,'originalLineGrossPence',l.original_line_gross_pence,'reversesLineAllocationId',l.reverses_line_allocation_id,
  'approvalRef',s.source_manifest->>'approvalRef','evidence',s.source_manifest->'evidence') ORDER BY r.created_at,l.id),'[]') INTO rows
  FROM app.receipt_allocation_fact_line l JOIN app.receipt_allocation_fact_source s ON(s.tenant_id,s.job_id,s.id)=(l.tenant_id,l.job_id,l.source_id)
  JOIN app.receipt_allocation_fact_revision r ON(r.tenant_id,r.job_id,r.id)=(s.tenant_id,s.job_id,s.allocation_revision_id)
  WHERE l.tenant_id=t AND l.job_id=j AND (NOT p_selector ? 'invoiceId' OR s.invoice_id=(p_selector->>'invoiceId')::uuid) AND (NOT p_selector ? 'paymentId' OR s.payment_id=(p_selector->>'paymentId')::uuid);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) x JOIN app.action_authorization a ON a.tenant_id=t AND a.id::text=x->>'approvalRef' WHERE a.revoked_at IS NOT NULL) THEN holds:=holds||'"APPROVAL_REVOKED"'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) x WHERE x->>'direction'='reversal') THEN holds:=holds||'"REVERSED_MOVEMENT"'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) x CROSS JOIN LATERAL jsonb_array_elements(x->'evidence') e JOIN app.evidence_invalidation i ON i.tenant_id=t AND i.evidence_id=(e->>'evidenceId')::uuid)
  THEN holds:=holds||'"INVALIDATED_EVIDENCE"'::jsonb; END IF;
 RETURN wm||jsonb_build_object('rows',rows,'holds',holds);
END $$;

ALTER FUNCTION app.receipt_fact_invoice_line(uuid,uuid,uuid,uuid,uuid,uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.receipt_fact_source_approved(uuid,uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.receipt_fact_watermark(uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.receipt_fact_proposal(uuid,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.receipt_fact_source_approved(uuid,uuid,uuid),app.receipt_fact_invoice_line(uuid,uuid,uuid,uuid,uuid,uuid,uuid),app.receipt_fact_watermark(uuid,uuid),app.receipt_fact_proposal(uuid,uuid,jsonb)
 FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
COMMIT;
