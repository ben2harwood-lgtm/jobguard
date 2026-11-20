BEGIN;

-- An issued final invoice preserves its issue-time Final Check authority for
-- receipts only. New billing still verifies the current proof set.
CREATE FUNCTION app.require_receipt_final_check(p_tenant uuid,p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF EXISTS(
  SELECT 1 FROM app.customer_invoice i
  LEFT JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id)
  JOIN app.final_account_lock l ON(l.tenant_id,l.job_id,l.id)=(b.tenant_id,b.job_id,b.lock_id)
  WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(b.invoice_kind,'final')='final'
 ) THEN RETURN; END IF;
 PERFORM app.require_authoritative_final_check(p_tenant,p_job);
END $$;
DO $$ DECLARE sig text; BEGIN
 FOREACH sig IN ARRAY ARRAY['require_receipt_final_check(uuid,uuid)'] LOOP
  EXECUTE 'ALTER FUNCTION app.'||sig||' OWNER TO jobguard_migration';
  EXECUTE 'REVOKE ALL ON FUNCTION app.'||sig||' FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_infrastructure';
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION app.receipt_fact_proposal(t uuid,j uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
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
 IF direction='receipt' THEN PERFORM app.require_receipt_final_check(t,j); END IF;
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
   AND r.action=CASE WHEN direction='receipt' THEN 'allocate' ELSE 'reverse' END
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

ALTER FUNCTION app.receipt_fact_proposal(uuid,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.receipt_fact_proposal(uuid,uuid,jsonb)
 FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
COMMIT;
