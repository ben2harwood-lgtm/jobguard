BEGIN;
-- MIGFIX-5 (0156): customer billing integrity. Restates two installed routines in place (CREATE OR REPLACE keeps owner and ACL):
--  * app.lock_final_account (0132): refuses an account assembled before the latest approved variation, after the variation row locks.
--  * app.issue_practice_customer_credit_note (0028): conserves original invoice net and VAT ceilings across partial credits.
-- Held, not here: legacy issuer guard (open #189 / 0147 already restates it) and real PDF bytes (Ben decision 7: later).
CREATE OR REPLACE FUNCTION app.lock_final_account(p_tenant uuid,p_job uuid,p_actor uuid,p_command uuid,p_revision uuid,p_expected integer,p_declaration text) RETURNS app.final_account_lock
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE request_digest text; prior app.command_receipt; existing_lock app.final_account_lock; r app.final_account_revision; sources jsonb; s jsonb;
 row_id uuid:=gen_random_uuid(); event_id uuid:=gen_random_uuid(); server_time timestamptz; result jsonb;
BEGIN
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 -- Always the job first, as in SV-2 reveal/disclosure; audit allocation is last.
 PERFORM 1 FROM app.job j JOIN app.job_commercial_track t ON(t.tenant_id,t.job_id)=(j.tenant_id,j.id)
 WHERE j.tenant_id=p_tenant AND j.id=p_job AND j.status IN ('live','invoiced','paid') AND t.job_track='small_builder'
 AND t.environment='synthetic_demo' FOR UPDATE OF j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 IF p_command IS NULL OR p_revision IS NULL OR p_expected IS NULL OR p_expected<0 OR p_declaration IS DISTINCT FROM 'final_account_declaration.v1' THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 request_digest:=app.final_lock_hash(jsonb_build_object('command','LockFinalAccount','job',p_job,'actor',p_actor,'revision',p_revision,'expected',p_expected,'declaration',p_declaration));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
  IF prior.command_type<>'LockFinalAccount' OR prior.request_hash<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
  SELECT * INTO existing_lock FROM app.final_account_lock WHERE tenant_id=p_tenant AND command_id=p_command; RETURN existing_lock;
 END IF;
 SELECT * INTO existing_lock FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_ALREADY_LOCKED' USING ERRCODE='23505',DETAIL=existing_lock.id::text; END IF;
 SELECT x.* INTO r FROM app.final_account_revision x JOIN app.final_account_draft d ON(d.tenant_id,d.job_id,d.current_revision_id)=(x.tenant_id,x.job_id,x.id)
 WHERE x.tenant_id=p_tenant AND x.job_id=p_job AND x.id=p_revision AND x.revision=p_expected AND NOT x.issue_blocked;
 IF NOT FOUND THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT' USING ERRCODE='40001'; END IF;
 PERFORM 1 FROM app.variation WHERE tenant_id=p_tenant AND job_id=p_job ORDER BY id FOR UPDATE;
 -- MIGFIX-5: every variation approval is read AFTER the variation row locks above, so an approval that committed first
 -- is visible here and one that has not committed waits behind this lock and becomes a post-lock source. An account
 -- assembled before the latest approval can therefore never be locked without that approved source.
 IF EXISTS(SELECT 1 FROM app.variation v JOIN app.variation_approval a ON(a.tenant_id,a.job_id,a.variation_id,a.revision_id)=(v.tenant_id,v.job_id,v.id,v.current_revision_id)
  WHERE v.tenant_id=p_tenant AND v.job_id=p_job AND v.state='approved'
  AND NOT EXISTS(SELECT 1 FROM app.final_account_line l WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.final_account_revision_id=p_revision
   AND l.line_kind='variation' AND l.source_id=a.revision_id AND l.commercial_revision_id=a.revision_id)) THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT' USING ERRCODE='40001',DETAIL='approved_source_missing_from_account'; END IF;
 sources:=app.read_final_account_lock_sources(p_tenant,p_job,p_revision);
 IF jsonb_array_length(sources->'captureRegister')<>(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(sources->'captureRegister')) THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(sources->'captureRegister') c WHERE length(c.value->>'description') NOT BETWEEN 1 AND 4000 OR (c.value->>'valuePence')::numeric>1000000000000)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(sources->'lines') l WHERE (l.value->>'netPence')::numeric>1000000000000) THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 IF jsonb_array_length(sources->'baselineScopeItemIds')=0 OR jsonb_array_length(sources->'scopeDispositions')<>jsonb_array_length(sources->'baselineScopeItemIds') THEN RAISE EXCEPTION 'SCOPE_DISPOSITION_MISSING'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=p_tenant AND terms_version='synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED'; END IF;
 server_time:=clock_timestamp();
 s:=sources||jsonb_build_object('version','shadow-lock.v1','tenantId',p_tenant,'jobId',p_job,'finalAccountRevisionId',p_revision,'baselineQuoteVersionId',r.baseline_quote_version_id,
  'declaration','I''ve reviewed the work and extras on this job and this is my complete final account.','declarationVersion',p_declaration,'onboardingTermsVersion','synthetic_final_check_terms.v1',
  'lockingMembershipId',p_actor,'serverTimestamp',to_char(server_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'commandId',p_command,'auditEventId',event_id);
 result:=jsonb_build_object('lockId',row_id);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_tenant,p_command,'LockFinalAccount',p_job::text,request_digest,'succeeded',result,p_actor,server_time);
 INSERT INTO app.final_account_lock(tenant_id,job_id,id,final_account_revision_id,baseline_quote_version_id,capture_register_hash,line_set_hash,scope_disposition_hash,snapshot_digest,snapshot,
 declaration,declaration_version,onboarding_terms_version,locking_membership_id,locked_at,command_id,audit_event_id)
 VALUES(p_tenant,p_job,row_id,p_revision,r.baseline_quote_version_id,app.final_lock_hash(s->'captureRegister'),app.final_lock_hash(s->'lines'),app.final_lock_hash(s->'scopeDispositions'),app.final_lock_hash(s),s,
 s->>'declaration',p_declaration,'synthetic_final_check_terms.v1',p_actor,server_time,p_command,event_id) RETURNING * INTO existing_lock;
 PERFORM app.append_final_lock_audit(event_id,p_actor,p_job,'final_account.locked',jsonb_build_object('lockId',row_id,'commandId',p_command,'finalAccountRevisionId',p_revision),jsonb_build_object('snapshot',existing_lock.snapshot_digest));
 RETURN existing_lock;
END $$;
CREATE OR REPLACE FUNCTION app.issue_practice_customer_credit_note(
 p_tenant uuid,p_job uuid,p_invoice uuid,p_actor uuid,p_command uuid,p_net_pence bigint,p_reason text,p_preview_hash text
) RETURNS TABLE(credit_note_id uuid,credit_number text,pdf_sha256 text,total_pence bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE inv app.customer_invoice%ROWTYPE; prior jsonb; credited bigint; credited_net bigint; credited_tax bigint; tax bigint; gross bigint; paid bigint;
 request_digest text; expected_preview text; n bigint; number text; artifact text; digest text;
 decision_id uuid:=gen_random_uuid(); resolution_id uuid:=gen_random_uuid(); authorization_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid();
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF p_net_pence<=0 OR length(btrim(p_reason))<3 THEN RAISE EXCEPTION 'INVALID_CREDIT_AMOUNT'; END IF;
 request_digest:=encode(public.digest(convert_to(p_job::text||p_invoice::text||p_net_pence::text||p_reason||p_preview_hash,'UTF8'),'sha256'),'hex');
 SELECT result INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
  IF (SELECT request_hash FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command)<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN QUERY SELECT (prior->>'creditNoteId')::uuid,prior->>'creditNumber',prior->>'pdfSha256',(prior->>'totalPence')::bigint; RETURN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_invoice::text,0));
 SELECT * INTO inv FROM app.customer_invoice WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_invoice;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
 SELECT COALESCE(sum(amount_pence),0),COALESCE(-sum(net_pence),0),COALESCE(-sum(tax_pence),0) INTO credited,credited_net,credited_tax FROM app.customer_credit_note WHERE tenant_id=p_tenant AND invoice_id=p_invoice;
 expected_preview:=encode(public.digest(convert_to(p_job::text||p_invoice::text||p_net_pence::text||credited::text||btrim(inv.pdf_sha256),'UTF8'),'sha256'),'hex');
 IF p_preview_hash<>expected_preview THEN RAISE EXCEPTION 'STALE_CREDIT_PREVIEW'; END IF;
 -- MIGFIX-5: credits conserve the ORIGINAL invoice. Net can never pass the invoice net, whatever VAT rounding leaves behind.
 IF credited_net+p_net_pence>inv.net_pence THEN RAISE EXCEPTION 'CREDIT_EXCEEDS_AVAILABLE_AMOUNT'; END IF;
 -- VAT keeps the merged per-credit positive half-up 20% (existing pinned results are unchanged) but can never pass the VAT still
 -- remaining on the original invoice. Cumulative whole-invoice VAT rounding (final credit takes the exact remainder) is HELD:
 -- it changes the merged expectation in practice-invoice-audit.integration.test.ts (see the MIGFIX-5 receipt).
 tax:=least((p_net_pence+2)/5,greatest(inv.tax_pence-credited_tax,0));
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
