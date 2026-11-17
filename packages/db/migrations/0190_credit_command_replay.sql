BEGIN;
-- LATER-B16: command serialization only; installed owner, ACL and 0166 arithmetic retained.
CREATE OR REPLACE FUNCTION app.issue_practice_customer_credit_note(
 p_tenant uuid,p_job uuid,p_invoice uuid,p_actor uuid,p_command uuid,p_net_pence bigint,p_reason text,p_preview_hash text
) RETURNS TABLE(credit_note_id uuid,credit_number text,pdf_sha256 text,total_pence bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE inv app.customer_invoice%ROWTYPE; prior jsonb; credited bigint; credited_net bigint; credited_tax bigint; cumulative_tax bigint; tax bigint; gross bigint; paid bigint;
 request_digest text; expected_preview text; n bigint; number text; artifact text; digest text;
 decision_id uuid:=gen_random_uuid(); resolution_id uuid:=gen_random_uuid(); authorization_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid();
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 -- Authority precedes command replay and invoice lookup, including expired owners.
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_command IS NULL OR p_job IS NULL OR p_invoice IS NULL OR p_net_pence IS NULL OR p_reason IS NULL OR p_preview_hash IS NULL
 OR p_net_pence<=0 OR length(btrim(p_reason))<3 THEN RAISE EXCEPTION 'INVALID_CREDIT_AMOUNT'; END IF;
 -- Serialize command identity before reading its receipt, then the invoice balance.
 -- Both are separate statements so a waiter observes the committed receipt.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':credit-command:'||p_command::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 request_digest:=encode(public.digest(convert_to(p_job::text||p_invoice::text||p_net_pence::text||p_reason||p_preview_hash,'UTF8'),'sha256'),'hex');
 SELECT result INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
  IF NOT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command
   AND request_hash=request_digest AND command_type='customer_credit_note.issue' AND actor_membership_id=p_actor AND status='succeeded') THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN QUERY SELECT (prior->>'creditNoteId')::uuid,prior->>'creditNumber',prior->>'pdfSha256',(prior->>'totalPence')::bigint; RETURN;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_invoice::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO inv FROM app.customer_invoice WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_invoice;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
 SELECT COALESCE(sum(amount_pence),0),COALESCE(-sum(net_pence),0),COALESCE(-sum(tax_pence),0) INTO credited,credited_net,credited_tax FROM app.customer_credit_note WHERE tenant_id=p_tenant AND invoice_id=p_invoice;
 expected_preview:=encode(public.digest(convert_to(p_job::text||p_invoice::text||p_net_pence::text||credited::text||btrim(inv.pdf_sha256),'UTF8'),'sha256'),'hex');
 IF p_preview_hash<>expected_preview THEN RAISE EXCEPTION 'STALE_CREDIT_PREVIEW'; END IF;
 -- MIGFIX-5: credits conserve the ORIGINAL invoice. Net can never pass the invoice net, whatever VAT rounding leaves behind.
 IF credited_net+p_net_pence>inv.net_pence THEN RAISE EXCEPTION 'CREDIT_EXCEEDS_AVAILABLE_AMOUNT'; END IF;
 -- Cumulative whole-invoice VAT rounding (Ben decisions 7 and 8a): VAT is half-up 20% of the CUMULATIVE credited net, and the
 -- credit that reaches the full invoice net takes exactly the original invoice VAT, so credits always sum to the invoice. Any
 -- stray penny therefore falls in the customer's favour. The credit's own VAT is the cumulative VAT less what earlier credits took.
 cumulative_tax:=CASE WHEN credited_net+p_net_pence=inv.net_pence THEN inv.tax_pence ELSE least((credited_net+p_net_pence+2)/5,inv.tax_pence) END;
 tax:=greatest(least(cumulative_tax-credited_tax,inv.tax_pence-credited_tax),0);
 gross:=p_net_pence+tax;
 IF gross>inv.total_pence-credited THEN RAISE EXCEPTION 'CREDIT_EXCEEDS_AVAILABLE_AMOUNT'; END IF;
 INSERT INTO app.customer_credit_note_sequence(id,tenant_id,next_number)VALUES(gen_random_uuid(),p_tenant,2)
 ON CONFLICT(tenant_id) DO UPDATE SET next_number=app.customer_credit_note_sequence.next_number+1 RETURNING next_number-1 INTO n;
 number:='DEMO-CN-'||lpad(n::text,6,'0');
 artifact:='%PDF-1.4'||chr(10)||'Practice sandbox — synthetic credit; nothing is sent or paid out'||chr(10)||
  'Credit note: '||number||chr(10)||'Corrects '||inv.invoice_number||chr(10)||'Reason: '||btrim(p_reason)||chr(10)||
  'Net pence: -'||p_net_pence||chr(10)||'VAT pence: -'||tax||chr(10)||'Gross pence: -'||gross||chr(10)||'Original invoice hash: '||inv.pdf_sha256||chr(10)||'%%EOF';
 digest:=encode(public.digest(convert_to(artifact,'UTF8'),'sha256'),'hex');
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)VALUES(decision_id,p_tenant,'job',p_job::text,'customer_credit_note.issue');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'customer_credit_note.issue',NULL,digest,credited,gross,'GBP',inv.tax_policy_version,transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_credit_note(id,tenant_id,job_id,invoice_id,authorization_id,credit_number,amount_pence,currency,reason,net_pence,tax_pence,total_pence,source_invoice_hash,preview_hash,pdf_sha256,pdf_bytes,tax_policy_version,approved_at)
 VALUES(new_id,p_tenant,p_job,p_invoice,authorization_id,number,gross,'GBP',btrim(p_reason),-p_net_pence,-tax,-gross,inv.pdf_sha256,p_preview_hash,digest,convert_to(artifact,'UTF8'),inv.tax_policy_version,transaction_timestamp());
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_command,p_tenant,'customer_credit_note.issue','credit-note:'||p_invoice||':'||number,request_digest,'succeeded',jsonb_build_object('creditNoteId',new_id,'creditNumber',number,'pdfSha256',digest,'totalPence',-gross),p_actor,transaction_timestamp());
 RETURN QUERY SELECT new_id,number,digest,-gross;
END $$;
COMMIT;
