BEGIN;
-- Additive repair: do not rewrite an already-applied migration or receipt.
-- Lock command identity BEFORE looking for a replay, then lock the invoice.
-- Both operations share this order; the caller appends its audit last.
CREATE OR REPLACE FUNCTION app.record_practice_customer_receipt(
 p_tenant uuid,p_job uuid,p_invoice uuid,p_actor uuid,p_command uuid,
 p_paid_on date,p_amount bigint,p_method text,p_reference text
) RETURNS TABLE(payment_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE
 prior record; request_digest text; legacy_digest text; active_total numeric;
 decision_id uuid:=gen_random_uuid(); resolution_id uuid:=gen_random_uuid();
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
END$$;
ALTER FUNCTION app.record_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,date,bigint,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.record_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,date,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,date,bigint,text,text) TO jobguard_runtime;

-- The invoice is now an explicit authorization boundary, not just a URL label.
CREATE FUNCTION app.reverse_practice_customer_receipt(
 p_tenant uuid,p_job uuid,p_invoice uuid,p_payment uuid,p_actor uuid,p_command uuid,p_reason text
) RETURNS TABLE(reversal_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE
 prior record; request_digest text; legacy_digest text;
 authorization_id uuid:=gen_random_uuid(); decision_id uuid:=gen_random_uuid();
 resolution_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid();
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF p_job IS NULL OR p_invoice IS NULL OR p_payment IS NULL OR p_actor IS NULL OR p_command IS NULL
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 240 THEN
  RAISE EXCEPTION 'INVALID_REVERSAL' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':practice-command:'||p_command::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':receipt:'||p_invoice::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.customer_payment p JOIN app.customer_invoice i
  ON(i.tenant_id,i.job_id,i.id)=(p.tenant_id,p.job_id,p.invoice_id)
  WHERE p.tenant_id=p_tenant AND p.job_id=p_job AND p.invoice_id=p_invoice AND p.id=p_payment AND i.synthetic
 ) THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
 request_digest:=encode(public.digest(convert_to(jsonb_build_array(
  'practice-customer-receipt.reverse.v2',p_tenant,p_job,p_invoice,p_payment,p_actor,btrim(p_reason)
 )::text,'UTF8'),'sha256'),'hex');
 legacy_digest:=encode(public.digest(convert_to(p_job::text||p_payment::text||btrim(p_reason),'UTF8'),'sha256'),'hex');
 SELECT command_type,actor_membership_id,request_hash,status,result INTO prior
 FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
  IF prior.command_type IS DISTINCT FROM 'customer_payment.reverse'
     OR prior.actor_membership_id IS DISTINCT FROM p_actor
     OR prior.request_hash NOT IN(request_digest,legacy_digest)
     OR prior.status IS DISTINCT FROM 'succeeded' OR prior.result->>'reversalId' IS NULL THEN
   RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN QUERY SELECT (prior.result->>'reversalId')::uuid; RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM app.customer_payment_reversal WHERE tenant_id=p_tenant AND payment_id=p_payment) THEN
  RAISE EXCEPTION 'PAYMENT_ALREADY_REVERSED' USING ERRCODE='23505';
 END IF;
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
 VALUES(decision_id,p_tenant,'job',p_job::text,'customer_payment.reverse');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)
 VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'customer_payment.reverse',NULL,request_digest,0,NULL,NULL,'manual_receipt_v1',transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_payment_reversal(id,tenant_id,job_id,payment_id,authorization_id,reason)
 VALUES(new_id,p_tenant,p_job,p_payment,authorization_id,btrim(p_reason));
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_command,p_tenant,'customer_payment.reverse','manual-receipt-reversal:'||p_payment,request_digest,'succeeded',jsonb_build_object('reversalId',new_id),p_actor,transaction_timestamp());
 RETURN QUERY SELECT new_id;
END$$;
ALTER FUNCTION app.reverse_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.reverse_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reverse_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,uuid,text) TO jobguard_runtime;
-- Archive the old routine in place, but deny its invoice-unbound entry point.
REVOKE EXECUTE ON FUNCTION app.reverse_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,text) FROM jobguard_runtime;
COMMENT ON FUNCTION app.reverse_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,text)
 IS 'Historical 0029 implementation; runtime must use the invoice-bound seven-argument routine.';
COMMIT;
