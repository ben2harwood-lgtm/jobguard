-- RECEIPT-DUP-2: a deduplicated command keeps its answer. Record its own receipt pointing at the
-- existing payment, so a retry after that payment is reversed replays it instead of paying again.
BEGIN;

CREATE OR REPLACE FUNCTION app.record_practice_customer_receipt(
 p_tenant uuid,p_job uuid,p_invoice uuid,p_actor uuid,p_command uuid,
 p_paid_on date,p_amount bigint,p_method text,p_reference text
) RETURNS TABLE(payment_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR lower(nullif(current_setting('app.tenant_id',true),'')) IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor()
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE
 prior record; request_digest text; legacy_digest text; active_total numeric;
 existing_id uuid; decision_id uuid:=gen_random_uuid(); resolution_id uuid:=gen_random_uuid();
 authorization_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid();
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF p_job IS NULL OR p_invoice IS NULL OR p_actor IS NULL OR p_command IS NULL
    OR p_amount IS NULL OR p_amount<1 OR p_amount>1000000000000
    OR p_paid_on IS NULL OR NOT isfinite(p_paid_on)
    OR p_paid_on<date '0001-01-01' OR p_paid_on>date '9999-12-31'
    OR p_method IS NULL OR p_method NOT IN('bank_transfer','cash','card_elsewhere','cheque','other')
    OR p_reference IS NULL OR length(btrim(p_reference)) NOT BETWEEN 1 AND 120 THEN
  RAISE EXCEPTION 'INVALID_RECEIPT' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':practice-command:'||p_command::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':receipt:'||p_invoice::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.customer_invoice WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_invoice AND synthetic) THEN
  RAISE EXCEPTION 'INVOICE_NOT_FOUND';
 END IF;
 request_digest:=encode(public.digest(convert_to(jsonb_build_array(
  'practice-customer-receipt.record.v2',p_tenant,p_job,p_invoice,p_actor,
  to_char(p_paid_on,'YYYY-MM-DD'),p_amount,p_method,btrim(p_reference)
 )::text,'UTF8'),'sha256'),'hex');
 -- Keep legitimate retries of pre-upgrade commands working. Actor, operation,
 -- invoice and a succeeded result are still checked; no historical row changes.
 legacy_digest:=encode(public.digest(convert_to(p_job::text||p_invoice::text||p_paid_on::text||p_amount::text||p_method||btrim(p_reference),'UTF8'),'sha256'),'hex');
 SELECT command_type,actor_membership_id,request_hash,status,result INTO prior
 FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
  IF prior.command_type IS DISTINCT FROM 'customer_payment.record'
     OR prior.actor_membership_id IS DISTINCT FROM p_actor
     OR prior.request_hash NOT IN(request_digest,legacy_digest)
     OR prior.status IS DISTINCT FROM 'succeeded' OR prior.result->>'paymentId' IS NULL THEN
   RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN QUERY SELECT (prior.result->>'paymentId')::uuid; RETURN;
 END IF;
 -- Record and reversal share the invoice advisory lock above. Check the
 -- current unreversed receipts before creating any new command or payment.
 SELECT p.id INTO existing_id FROM app.customer_payment p
 WHERE p.tenant_id=p_tenant AND p.job_id=p_job AND p.invoice_id=p_invoice
  AND p.paid_on=p_paid_on AND p.amount_pence=p_amount
  AND p.method=p_method AND p.reference=btrim(p_reference)
  AND NOT EXISTS(SELECT 1 FROM app.customer_payment_reversal r
   WHERE (r.tenant_id,r.payment_id)=(p.tenant_id,p.id))
 ORDER BY p.created_at,p.id
 LIMIT 1;
 IF FOUND THEN
  INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
  VALUES(p_command,p_tenant,'customer_payment.record','manual-receipt-duplicate:'||p_command,request_digest,'succeeded',jsonb_build_object('paymentId',existing_id),p_actor,transaction_timestamp());
  RETURN QUERY SELECT existing_id; RETURN;
 END IF;
 SELECT coalesce(sum(p.amount_pence),0) INTO active_total FROM app.customer_payment p
 WHERE p.tenant_id=p_tenant AND p.invoice_id=p_invoice AND NOT EXISTS(
  SELECT 1 FROM app.customer_payment_reversal r WHERE(r.tenant_id,r.payment_id)=(p.tenant_id,p.id)
 );
 IF active_total+p_amount>1000000000000 THEN
  RAISE EXCEPTION 'RECEIPT_TOTAL_LIMIT' USING ERRCODE='22003';
 END IF;
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
 VALUES(decision_id,p_tenant,'job',p_job::text,'customer_payment.record');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)
 VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'customer_payment.record',NULL,request_digest,0,p_amount,'GBP','manual_receipt_v1',transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_payment(id,tenant_id,job_id,invoice_id,authorization_id,paid_on,amount_pence,currency,method,reference,builder_attested,provenance,qualifying_recovery_proof,platform_fee_settlement)
 VALUES(new_id,p_tenant,p_job,p_invoice,authorization_id,p_paid_on,p_amount,'GBP',p_method,btrim(p_reference),true,'manual_builder_attestation',false,false);
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_command,p_tenant,'customer_payment.record','manual-receipt:'||new_id,request_digest,'succeeded',jsonb_build_object('paymentId',new_id),p_actor,transaction_timestamp());
 RETURN QUERY SELECT new_id;
END;
END
$$;

COMMIT;
