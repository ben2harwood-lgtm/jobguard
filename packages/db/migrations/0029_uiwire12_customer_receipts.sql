BEGIN;
-- Receipt mutation is deliberately confined to these routines. The runtime role
-- retains SELECT/INSERT-only table grants and cannot turn an attestation into a landing.
ALTER POLICY tenant_isolation ON app.customer_payment TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER POLICY tenant_isolation ON app.customer_payment_reversal TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER POLICY tenant_isolation ON app.customer_invoice TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER POLICY tenant_isolation ON app.command_receipt TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER POLICY tenant_isolation ON app.decision TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER POLICY tenant_isolation ON app.decision_resolution TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER POLICY tenant_isolation ON app.action_authorization TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE FUNCTION app.record_practice_customer_receipt(p_tenant uuid,p_job uuid,p_invoice uuid,p_actor uuid,p_command uuid,p_paid_on date,p_amount bigint,p_method text,p_reference text)
RETURNS TABLE(payment_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prior jsonb; request_digest text; decision_id uuid:=gen_random_uuid(); resolution_id uuid:=gen_random_uuid(); authorization_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid();
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF p_amount<=0 OR p_paid_on IS NULL OR p_method NOT IN('bank_transfer','cash','card_elsewhere','cheque','other') OR length(btrim(p_reference))<1 THEN RAISE EXCEPTION 'INVALID_RECEIPT'; END IF;
 request_digest:=encode(public.digest(convert_to(p_job::text||p_invoice::text||p_paid_on::text||p_amount::text||p_method||btrim(p_reference),'UTF8'),'sha256'),'hex');
 SELECT result INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
  IF (SELECT request_hash FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command)<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN QUERY SELECT (prior->>'paymentId')::uuid; RETURN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':receipt:'||p_invoice::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.customer_invoice WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_invoice AND synthetic) THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)VALUES(decision_id,p_tenant,'job',p_job::text,'customer_payment.record');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
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

CREATE FUNCTION app.reverse_practice_customer_receipt(p_tenant uuid,p_job uuid,p_payment uuid,p_actor uuid,p_command uuid,p_reason text)
RETURNS TABLE(reversal_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prior jsonb; request_digest text; authorization_id uuid:=gen_random_uuid(); decision_id uuid:=gen_random_uuid(); resolution_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid();
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF length(btrim(p_reason))<3 THEN RAISE EXCEPTION 'INVALID_REVERSAL'; END IF;
 request_digest:=encode(public.digest(convert_to(p_job::text||p_payment::text||btrim(p_reason),'UTF8'),'sha256'),'hex');
 SELECT result INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
  IF (SELECT request_hash FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command)<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN QUERY SELECT (prior->>'reversalId')::uuid; RETURN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':receipt:'||p_payment::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.customer_payment WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_payment) THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM app.customer_payment_reversal WHERE tenant_id=p_tenant AND payment_id=p_payment) THEN RAISE EXCEPTION 'PAYMENT_ALREADY_REVERSED'; END IF;
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)VALUES(decision_id,p_tenant,'job',p_job::text,'customer_payment.reverse');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'customer_payment.reverse',NULL,request_digest,0,NULL,NULL,'manual_receipt_v1',transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_payment_reversal(id,tenant_id,job_id,payment_id,authorization_id,reason)VALUES(new_id,p_tenant,p_job,p_payment,authorization_id,btrim(p_reason));
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_command,p_tenant,'customer_payment.reverse','manual-receipt-reversal:'||p_payment,request_digest,'succeeded',jsonb_build_object('reversalId',new_id),p_actor,transaction_timestamp());
 RETURN QUERY SELECT new_id;
END$$;
ALTER FUNCTION app.reverse_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.reverse_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reverse_practice_customer_receipt(uuid,uuid,uuid,uuid,uuid,text) TO jobguard_runtime;
COMMIT;
