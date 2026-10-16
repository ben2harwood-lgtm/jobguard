-- SERIOUS-B5: repair current source validation and new synthetic invoice artifacts only.
-- Same routine identities/owners/grants; no historical document or approval is rewritten.
BEGIN;
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
 -- Both directions matter: missing, replaced, duplicated or spurious approved lines require reassembly.
 -- Approval writers lock their variation before inserting approval, so this statement runs after all waits.
 IF EXISTS(
  WITH effective AS (
   SELECT DISTINCT ON (a.variation_id) r.id source_id,r.scope_item_id,r.id commercial_revision_id,
    a.id approval_id,r.signed_delta_pence net_pence,r.description
   FROM app.variation_approval a
   JOIN app.variation_revision r ON(r.tenant_id,r.job_id,r.id)=(a.tenant_id,a.job_id,a.revision_id)
   WHERE a.tenant_id=p_tenant AND a.job_id=p_job
   ORDER BY a.variation_id,r.revision DESC
  ), actual AS (
   SELECT source_id,scope_item_id,commercial_revision_id,approval_id,net_pence,description
   FROM app.final_account_line WHERE tenant_id=p_tenant AND job_id=p_job
    AND final_account_revision_id=p_revision AND line_kind='variation'
  )
  SELECT * FROM (TABLE effective EXCEPT ALL TABLE actual) missing
  UNION ALL SELECT * FROM (TABLE actual EXCEPT ALL TABLE effective) obsolete
 ) THEN RAISE EXCEPTION 'FINAL_ACCOUNT_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
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

CREATE OR REPLACE FUNCTION app.issue_practice_customer_invoice(
 p_tenant uuid,p_job uuid,p_final_revision uuid,p_actor uuid,p_command uuid,p_recipient text,p_issued_on date
) RETURNS TABLE(invoice_id uuid,invoice_number text,pdf_sha256 text,total_pence bigint,source_hash text,outbox_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE existing app.customer_invoice%ROWTYPE; final_row app.final_account_revision%ROWTYPE;
 n bigint; number text; artifact text; digest text; decision_id uuid:=gen_random_uuid();
 resolution_id uuid:=gen_random_uuid(); authorization_id uuid:=gen_random_uuid(); new_invoice uuid:=gen_random_uuid();
 request_digest text:=encode(public.digest(convert_to(p_job::text||p_final_revision::text||p_recipient||p_issued_on::text,'UTF8'),'sha256'),'hex');
 prior jsonb; party_snapshot jsonb;

 -- ASCII PDF 1.4 objects: offsets and lengths below are byte counts of the stored artifact.
 pdf_rows text[]:=ARRAY[]::text[]; pdf_objects text[]; pdf_offsets bigint[]:=ARRAY[0::bigint];
 pdf_raw text; pdf_line text; pdf_stream text; pdf_kids text:=''; pdf_xref bigint;
 pdf_page integer; pdf_pages integer; pdf_i integer; pdf_j integer; pdf_content integer; pdf_font integer;
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 SELECT result INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
   IF (SELECT request_hash FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command)<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
   RETURN QUERY SELECT (prior->>'invoiceId')::uuid,prior->>'invoiceNumber',prior->>'pdfSha256',(prior->>'totalPence')::bigint,prior->>'sourceHash',prior->>'outboxStatus'; RETURN;
 END IF;
 IF p_recipient !~ '^[^@ ]+@example\.invalid$' THEN RAISE EXCEPTION 'SYNTHETIC_RECIPIENT_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT r.* INTO final_row FROM app.final_account_revision r JOIN app.final_account_draft d ON(d.tenant_id,d.id)=(r.tenant_id,r.final_account_draft_id)
 WHERE r.tenant_id=p_tenant AND r.job_id=p_job AND r.id=p_final_revision AND d.current_revision_id=r.id AND NOT r.issue_blocked;
 IF NOT FOUND THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT'; END IF;
 SELECT * INTO existing FROM app.customer_invoice WHERE tenant_id=p_tenant AND final_account_revision_id=p_final_revision;
 IF FOUND THEN RETURN QUERY SELECT existing.id,existing.invoice_number::text,existing.pdf_sha256::text,existing.total_pence,existing.source_hash::text,'succeeded'::text; RETURN; END IF;
 party_snapshot:=app.require_current_job_parties(p_tenant,p_job);
 INSERT INTO app.customer_invoice_sequence(id,tenant_id,next_number)VALUES(gen_random_uuid(),p_tenant,2)
 ON CONFLICT(tenant_id) DO UPDATE SET next_number=app.customer_invoice_sequence.next_number+1 RETURNING next_number-1 INTO n;
 number:='DEMO-CUST-'||lpad(n::text,6,'0');
 artifact:='Number: '||number||chr(10)||'Issue date: '||p_issued_on::text||chr(10)||
  'Issuer: Fictional Builder Ltd ['||p_tenant::text||']'||chr(10)||'Recipient: '||p_recipient||chr(10)||
  'Reference tax version: '||final_row.tax_policy_version||chr(10)||'Frozen final account: '||final_row.id::text||chr(10)||
  'Source hash: '||final_row.source_hash||chr(10)||
  'Net GBP: '||to_char(final_row.net_pence::numeric/100,'FM999999999990.00')||chr(10)||
  'VAT GBP: '||to_char(final_row.tax_pence::numeric/100,'FM999999999990.00')||chr(10)||
  'Total GBP: '||to_char(final_row.total_pence::numeric/100,'FM999999999990.00')||chr(10)||
  coalesce((SELECT string_agg(l.description||' | Net GBP: '||to_char(l.net_pence::numeric/100,'FM999999999990.00'),chr(10) ORDER BY l.ordinal,l.id)
   FROM app.final_account_line l WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.final_account_revision_id=p_final_revision),'')||chr(10)||
  party_snapshot::text;

 -- Convert the exact approved snapshot to printable, wrapped rows (same ASCII fallback as quote PDFs).
 FOREACH pdf_raw IN ARRAY string_to_array(artifact,chr(10)) LOOP
  pdf_raw:=regexp_replace(pdf_raw,'[^ -~]','?','g');
  IF length(pdf_raw)=0 THEN pdf_rows:=array_append(pdf_rows,''); END IF;
  pdf_i:=1;
  WHILE pdf_i<=length(pdf_raw) LOOP
   pdf_rows:=array_append(pdf_rows,substr(pdf_raw,pdf_i,90)); pdf_i:=pdf_i+90;
  END LOOP;
 END LOOP;
 pdf_pages:=greatest(1,(cardinality(pdf_rows)+53)/54); pdf_font:=3+pdf_pages*2;
 pdf_objects:=ARRAY['<< /Type /Catalog /Pages 2 0 R >>',''];
 FOR pdf_page IN 1..pdf_pages LOOP
  pdf_i:=3+(pdf_page-1)*2; pdf_content:=pdf_i+1;
  pdf_kids:=pdf_kids||pdf_i::text||' 0 R ';
  pdf_stream:='BT /F1 8 Tf 40 790 Td 12 TL'||chr(10)||
   '(SYNTHETIC - NOT A REAL INVOICE) Tj'||chr(10)||
   'T* (Practice sandbox - synthetic data; nothing is sent or charged) Tj'||chr(10)||
   'T* (Not a real tax invoice) Tj';
  FOR pdf_j IN ((pdf_page-1)*54+1)..least(pdf_page*54,cardinality(pdf_rows)) LOOP
   pdf_line:=replace(replace(replace(pdf_rows[pdf_j],chr(92),chr(92)||chr(92)),'(',chr(92)||'('),')',chr(92)||')');
   pdf_stream:=pdf_stream||chr(10)||'T* ('||pdf_line||') Tj';
  END LOOP;
  pdf_stream:=pdf_stream||chr(10)||'ET';
  pdf_objects:=array_append(pdf_objects,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '||pdf_font||' 0 R >> >> /Contents '||pdf_content||' 0 R >>');
  pdf_objects:=array_append(pdf_objects,'<< /Length '||octet_length(pdf_stream)||' >>'||chr(10)||'stream'||chr(10)||pdf_stream||chr(10)||'endstream');
 END LOOP;
 pdf_objects[2]:='<< /Type /Pages /Kids ['||pdf_kids||'] /Count '||pdf_pages||' >>';
 pdf_objects:=array_append(pdf_objects,'<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
 artifact:='%PDF-1.4'||chr(10);
 FOR pdf_i IN 1..cardinality(pdf_objects) LOOP
  pdf_offsets:=array_append(pdf_offsets,octet_length(artifact)::bigint);
  artifact:=artifact||pdf_i||' 0 obj'||chr(10)||pdf_objects[pdf_i]||chr(10)||'endobj'||chr(10);
 END LOOP;
 pdf_xref:=octet_length(artifact);
 artifact:=artifact||'xref'||chr(10)||'0 '||(cardinality(pdf_objects)+1)||chr(10)||'0000000000 65535 f '||chr(10);
 FOR pdf_i IN 2..cardinality(pdf_offsets) LOOP
  artifact:=artifact||lpad(pdf_offsets[pdf_i]::text,10,'0')||' 00000 n '||chr(10);
 END LOOP;
 artifact:=artifact||'trailer << /Size '||(cardinality(pdf_objects)+1)||' /Root 1 0 R >>'||chr(10)||'startxref'||chr(10)||pdf_xref||chr(10)||'%%EOF';
 digest:=encode(public.digest(convert_to(artifact,'UTF8'),'sha256'),'hex');
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)VALUES(decision_id,p_tenant,'job',p_job::text,'final_account.issue');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'final_account.issue',p_recipient,digest,final_row.revision,final_row.total_pence,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
 VALUES(new_invoice,p_tenant,p_job,p_final_revision,authorization_id,number,p_issued_on,jsonb_build_object('legalName','Fictional Builder Ltd','runIdentity',p_tenant),final_row.tax_policy_version,'GBP',final_row.net_pence,final_row.tax_pence,final_row.total_pence,final_row.source_hash,digest,convert_to(artifact,'UTF8'),true,'SYNTHETIC - NOT A REAL INVOICE');
 INSERT INTO app.customer_invoice_evidence(id,tenant_id,job_id,invoice_id,evidence_id,object_version_id,sha256,scope_item_id)
 SELECT gen_random_uuid(),p_tenant,p_job,new_invoice,evidence_id,object_version_id,sha256,scope_item_id FROM app.final_account_proof WHERE tenant_id=p_tenant AND final_account_revision_id=p_final_revision;
 INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at,status,completed_at)
 VALUES(gen_random_uuid(),p_tenant,authorization_id,'fake_invoice_delivery','practice-invoice:'||new_invoice,'final_account.issue',p_recipient,digest,artifact,final_row.revision,final_row.total_pence,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes','succeeded',transaction_timestamp());
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_command,p_tenant,'customer_invoice.issue','invoice:'||p_final_revision,request_digest,'succeeded',jsonb_build_object('invoiceId',new_invoice,'invoiceNumber',number,'pdfSha256',digest,'totalPence',final_row.total_pence,'sourceHash',final_row.source_hash,'outboxStatus','succeeded'),p_actor,transaction_timestamp());
 RETURN QUERY SELECT new_invoice,number,digest,final_row.total_pence,final_row.source_hash::text,'succeeded'::text;
END $$;

CREATE OR REPLACE FUNCTION app.issue_lock_bound_customer_invoice(p_tenant uuid,p_job uuid,p_revision uuid,p_actor uuid,p_command uuid,p_kind text,p_recipient text,p_issued_on date,p_source_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE lock_row app.final_account_lock; check_row app.final_account_lock_check; final_row app.final_account_revision; prior app.command_receipt;
 request_digest text; party_snapshot jsonb; n bigint; number text; artifact text; digest text; invoice_id uuid:=gen_random_uuid();
 decision_id uuid:=gen_random_uuid(); resolution_id uuid:=gen_random_uuid(); authorization_id uuid:=gen_random_uuid(); audit_id uuid:=gen_random_uuid();
 net bigint; tax bigint; gross bigint; selected_lines jsonb; result jsonb; item jsonb;

 -- ASCII PDF 1.4 objects: offsets and lengths below are byte counts of the stored artifact.
 pdf_rows text[]:=ARRAY[]::text[]; pdf_objects text[]; pdf_offsets bigint[]:=ARRAY[0::bigint];
 pdf_raw text; pdf_line text; pdf_stream text; pdf_kids text:=''; pdf_xref bigint;
 pdf_page integer; pdf_pages integer; pdf_i integer; pdf_j integer; pdf_content integer; pdf_font integer;
BEGIN
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_job::text,130));
 IF p_kind IS NULL OR p_kind NOT IN ('final','supplementary') OR p_command IS NULL OR p_issued_on IS NULL OR p_issued_on NOT BETWEEN '0001-01-01'::date AND '9999-12-31'::date OR p_recipient IS NULL OR p_recipient !~ '^[^@ ]+@example\.invalid$' OR p_source_hash IS NULL OR p_source_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 request_digest:=app.final_lock_hash(jsonb_build_object('command','IssueLockBoundInvoice','job',p_job,'revision',p_revision,'actor',p_actor,'kind',p_kind,'recipient',p_recipient,'issuedOn',p_issued_on,'sourceHash',p_source_hash));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN IF prior.command_type<>'IssueLockBoundInvoice' OR prior.request_hash<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF; RETURN prior.result; END IF;
 SELECT * INTO lock_row FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 SELECT * INTO check_row FROM app.final_account_lock_check WHERE tenant_id=p_tenant AND job_id=p_job AND lock_id=lock_row.id AND evidence_cutoff_at=lock_row.locked_at ORDER BY created_at DESC,id DESC LIMIT 1;
 IF check_row.status='failed' THEN RAISE EXCEPTION 'FINAL_CHECK_FAILED'; END IF;
 IF check_row.status IS DISTINCT FROM 'completed' THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 SELECT * INTO final_row FROM app.final_account_revision WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_revision AND source_hash=p_source_hash AND NOT issue_blocked;
 IF NOT FOUND THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT' USING ERRCODE='40001'; END IF;
 IF final_row.baseline_quote_version_id<>lock_row.baseline_quote_version_id THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
 IF p_kind='final' AND p_revision<>lock_row.final_account_revision_id THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
 IF p_kind='final' AND EXISTS(SELECT 1 FROM app.customer_invoice i LEFT JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id) WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(b.invoice_kind,'final')='final') THEN RAISE EXCEPTION 'FINAL_INVOICE_ALREADY_ISSUED'; END IF;
 IF p_kind='supplementary' THEN
  IF p_revision=lock_row.final_account_revision_id OR NOT EXISTS(SELECT 1 FROM app.customer_invoice i LEFT JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id) WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(b.invoice_kind,'final')='final') THEN RAISE EXCEPTION 'SUPPLEMENTARY_INVOICE_BASE_REQUIRED'; END IF;
  IF NOT EXISTS(WITH RECURSIVE ancestors AS (SELECT id,previous_revision_id FROM app.final_account_revision WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_revision
   UNION ALL SELECT r.id,r.previous_revision_id FROM app.final_account_revision r JOIN ancestors a ON r.id=a.previous_revision_id WHERE r.tenant_id=p_tenant AND r.job_id=p_job) SELECT 1 FROM ancestors WHERE id=lock_row.final_account_revision_id) THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.final_account_draft WHERE tenant_id=p_tenant AND job_id=p_job AND current_revision_id=p_revision) THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT'; END IF;
  -- A replacement/removal is a correction, not a newly added catch line. Fail closed until explicitly corrected.
  IF EXISTS(SELECT 1 FROM app.customer_invoice i JOIN app.final_account_line old ON(old.tenant_id,old.job_id,old.final_account_revision_id)=(i.tenant_id,i.job_id,i.final_account_revision_id)
   LEFT JOIN app.final_account_invoice_binding binding ON(binding.tenant_id,binding.job_id,binding.invoice_id)=(i.tenant_id,i.job_id,i.id)
   WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(binding.invoice_kind,'final') IN ('final','supplementary')
   AND NOT EXISTS(SELECT 1 FROM app.final_account_line current_line WHERE current_line.tenant_id=p_tenant AND current_line.job_id=p_job AND current_line.final_account_revision_id=p_revision
    AND (current_line.line_kind,current_line.source_id,current_line.commercial_revision_id,current_line.scope_item_id,current_line.net_pence)=(old.line_kind,old.source_id,old.commercial_revision_id,old.scope_item_id,old.net_pence))) THEN RAISE EXCEPTION 'INVOICE_SOURCE_CORRECTION_REQUIRED'; END IF;
 END IF;
 -- Account lines retain immutable commercial source identity across account revisions.
 SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'),coalesce(sum(l.net_pence),0) INTO selected_lines,net FROM app.final_account_line l
 WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.final_account_revision_id=p_revision AND (
 p_kind='final' OR (NOT EXISTS(SELECT 1 FROM app.final_account_invoiced_line b WHERE b.tenant_id=p_tenant AND b.job_id=p_job AND b.line_kind=l.line_kind AND b.source_id=l.source_id AND b.commercial_revision_id=l.commercial_revision_id)
 AND NOT EXISTS(SELECT 1 FROM app.customer_invoice i JOIN app.final_account_line old ON(old.tenant_id,old.job_id,old.final_account_revision_id)=(i.tenant_id,i.job_id,i.final_account_revision_id)
 WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND NOT EXISTS(SELECT 1 FROM app.final_account_invoice_binding b WHERE(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id))
 AND old.line_kind=l.line_kind AND old.source_id=l.source_id AND old.commercial_revision_id=l.commercial_revision_id)));
 IF jsonb_array_length(selected_lines)=0 OR net<0 OR net>1000000000000 THEN RAISE EXCEPTION 'INVOICE_AMOUNT_INVALID'; END IF;
 -- Same exact positive standard-rate candidate expression as merged 0028; no float arithmetic.
 tax:=(net+2)/5; gross:=net+tax;
 IF gross>1000000000000 THEN RAISE EXCEPTION 'INVOICE_AMOUNT_INVALID'; END IF;
 IF p_kind='final' AND ROW(net,tax,gross) IS DISTINCT FROM ROW(final_row.net_pence,final_row.tax_pence,final_row.total_pence) THEN RAISE EXCEPTION 'FINAL_ACCOUNT_TOTAL_MISMATCH'; END IF;
 party_snapshot:=app.require_current_job_parties(p_tenant,p_job);
 INSERT INTO app.customer_invoice_sequence(id,tenant_id,next_number) VALUES(gen_random_uuid(),p_tenant,2) ON CONFLICT(tenant_id) DO UPDATE SET next_number=app.customer_invoice_sequence.next_number+1 RETURNING next_number-1 INTO n;
 number:='DEMO-CUST-'||lpad(n::text,6,'0');
 artifact:='Number: '||number||chr(10)||'Issue date: '||p_issued_on::text||chr(10)||
  'Issuer: Fictional Builder Ltd ['||p_tenant::text||']'||chr(10)||'Recipient: '||p_recipient||chr(10)||
  'Reference tax version: '||final_row.tax_policy_version||chr(10)||'Frozen final account: '||final_row.id::text||chr(10)||
  'Source hash: '||final_row.source_hash||chr(10)||
  'Lock: '||lock_row.id::text||chr(10)||'Kind: '||p_kind||chr(10)||
  'Net GBP: '||to_char(net::numeric/100,'FM999999999990.00')||chr(10)||
  'VAT GBP: '||to_char(tax::numeric/100,'FM999999999990.00')||chr(10)||
  'Total GBP: '||to_char(gross::numeric/100,'FM999999999990.00')||chr(10)||
  coalesce((SELECT string_agg((l->>'description')||' | Net GBP: '||to_char((l->>'net_pence')::numeric/100,'FM999999999990.00'),chr(10) ORDER BY (l->>'ordinal')::integer,l->>'id')
   FROM jsonb_array_elements(selected_lines) l),'')||chr(10)||party_snapshot::text;

 -- Convert the exact approved snapshot to printable, wrapped rows (same ASCII fallback as quote PDFs).
 FOREACH pdf_raw IN ARRAY string_to_array(artifact,chr(10)) LOOP
  pdf_raw:=regexp_replace(pdf_raw,'[^ -~]','?','g');
  IF length(pdf_raw)=0 THEN pdf_rows:=array_append(pdf_rows,''); END IF;
  pdf_i:=1;
  WHILE pdf_i<=length(pdf_raw) LOOP
   pdf_rows:=array_append(pdf_rows,substr(pdf_raw,pdf_i,90)); pdf_i:=pdf_i+90;
  END LOOP;
 END LOOP;
 pdf_pages:=greatest(1,(cardinality(pdf_rows)+53)/54); pdf_font:=3+pdf_pages*2;
 pdf_objects:=ARRAY['<< /Type /Catalog /Pages 2 0 R >>',''];
 FOR pdf_page IN 1..pdf_pages LOOP
  pdf_i:=3+(pdf_page-1)*2; pdf_content:=pdf_i+1;
  pdf_kids:=pdf_kids||pdf_i::text||' 0 R ';
  pdf_stream:='BT /F1 8 Tf 40 790 Td 12 TL'||chr(10)||
   '(SYNTHETIC - NOT A REAL INVOICE) Tj'||chr(10)||
   'T* (Practice sandbox - synthetic data; nothing is sent or charged) Tj'||chr(10)||
   'T* (Not a real tax invoice) Tj';
  FOR pdf_j IN ((pdf_page-1)*54+1)..least(pdf_page*54,cardinality(pdf_rows)) LOOP
   pdf_line:=replace(replace(replace(pdf_rows[pdf_j],chr(92),chr(92)||chr(92)),'(',chr(92)||'('),')',chr(92)||')');
   pdf_stream:=pdf_stream||chr(10)||'T* ('||pdf_line||') Tj';
  END LOOP;
  pdf_stream:=pdf_stream||chr(10)||'ET';
  pdf_objects:=array_append(pdf_objects,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '||pdf_font||' 0 R >> >> /Contents '||pdf_content||' 0 R >>');
  pdf_objects:=array_append(pdf_objects,'<< /Length '||octet_length(pdf_stream)||' >>'||chr(10)||'stream'||chr(10)||pdf_stream||chr(10)||'endstream');
 END LOOP;
 pdf_objects[2]:='<< /Type /Pages /Kids ['||pdf_kids||'] /Count '||pdf_pages||' >>';
 pdf_objects:=array_append(pdf_objects,'<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
 artifact:='%PDF-1.4'||chr(10);
 FOR pdf_i IN 1..cardinality(pdf_objects) LOOP
  pdf_offsets:=array_append(pdf_offsets,octet_length(artifact)::bigint);
  artifact:=artifact||pdf_i||' 0 obj'||chr(10)||pdf_objects[pdf_i]||chr(10)||'endobj'||chr(10);
 END LOOP;
 pdf_xref:=octet_length(artifact);
 artifact:=artifact||'xref'||chr(10)||'0 '||(cardinality(pdf_objects)+1)||chr(10)||'0000000000 65535 f '||chr(10);
 FOR pdf_i IN 2..cardinality(pdf_offsets) LOOP
  artifact:=artifact||lpad(pdf_offsets[pdf_i]::text,10,'0')||' 00000 n '||chr(10);
 END LOOP;
 artifact:=artifact||'trailer << /Size '||(cardinality(pdf_objects)+1)||' /Root 1 0 R >>'||chr(10)||'startxref'||chr(10)||pdf_xref||chr(10)||'%%EOF';
 digest:=encode(sha256(convert_to(artifact,'UTF8')),'hex');
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision_id,p_tenant,'job',p_job::text,'final_account.issue');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'final_account.issue',p_recipient,digest,final_row.revision,gross,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
 VALUES(invoice_id,p_tenant,p_job,p_revision,authorization_id,number,p_issued_on,jsonb_build_object('legalName','Fictional Builder Ltd','runIdentity',p_tenant),final_row.tax_policy_version,'GBP',net,tax,gross,final_row.source_hash,digest,convert_to(artifact,'UTF8'),true,'SYNTHETIC - NOT A REAL INVOICE');
 INSERT INTO app.final_account_invoice_binding(tenant_id,job_id,invoice_id,invoice_kind,lock_id,revision_id,check_id) VALUES(p_tenant,p_job,invoice_id,p_kind,lock_row.id,p_revision,check_row.id);
 -- Largest-remainder display allocation of the one group tax; tie-break by line ID, as core allocation.
 -- Display tax follows merged absolute-net weights; invoice totals use the one group calculation.
 FOR item IN WITH weights AS(SELECT value,abs((value->>'net_pence')::numeric) weight FROM jsonb_array_elements(selected_lines)),
 parts AS(SELECT value,CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE floor(tax::numeric*weight/sum(weight) OVER()) END base,
 CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE mod(tax::numeric*weight,sum(weight) OVER()) END remainder FROM weights),
 ranked AS(SELECT *,row_number() OVER(ORDER BY remainder DESC,value->>'id') rank,tax-sum(base) OVER() left_over FROM parts)
 SELECT value||jsonb_build_object('allocated_tax',base+CASE WHEN rank<=left_over THEN 1 ELSE 0 END) FROM ranked LOOP
  INSERT INTO app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id,revision_id,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,tax_pence,gross_pence)
  VALUES(p_tenant,p_job,invoice_id,(item->>'id')::uuid,p_revision,(item->>'scope_item_id')::uuid,(item->>'commercial_revision_id')::uuid,item->>'line_kind',(item->>'source_id')::uuid,(item->>'net_pence')::bigint,(item->>'allocated_tax')::bigint,(item->>'net_pence')::bigint+(item->>'allocated_tax')::bigint);
 END LOOP;
 INSERT INTO app.customer_invoice_evidence(id,tenant_id,job_id,invoice_id,evidence_id,object_version_id,sha256,scope_item_id)
 SELECT gen_random_uuid(),p_tenant,p_job,invoice_id,evidence_id,object_version_id,sha256,scope_item_id FROM app.final_account_proof WHERE tenant_id=p_tenant AND job_id=p_job AND final_account_revision_id=p_revision;
 INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at,status,completed_at)
 VALUES(gen_random_uuid(),p_tenant,authorization_id,'fake_invoice_delivery','lock-invoice:'||invoice_id,'final_account.issue',p_recipient,digest,artifact,final_row.revision,gross,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes','succeeded',transaction_timestamp());
 result:=jsonb_build_object('invoiceId',invoice_id,'invoiceNumber',number,'pdfSha256',digest,'netPence',net,'taxPence',tax,'totalPence',gross,'sourceHash',p_source_hash,'invoiceKind',p_kind,'lockId',lock_row.id);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_tenant,p_command,'IssueLockBoundInvoice',p_revision::text,request_digest,'succeeded',result,p_actor,clock_timestamp());
 PERFORM app.append_final_lock_audit(audit_id,p_actor,p_job,'customer_invoice.lock_bound_issued',jsonb_build_object('invoiceId',invoice_id,'lockId',lock_row.id,'checkId',check_row.id,'commandId',p_command),jsonb_build_object('pdf',digest));
 RETURN result;
END $$;
COMMIT;
