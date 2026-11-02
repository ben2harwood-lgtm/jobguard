-- CH-4-U: preserve command replays; refuse new invoices while the job is closed.
BEGIN;
CREATE OR REPLACE FUNCTION app.issue_practice_customer_invoice(
 p_tenant uuid,p_job uuid,p_final_revision uuid,p_actor uuid,p_command uuid,p_recipient text,p_issued_on date
) RETURNS TABLE(invoice_id uuid,invoice_number text,pdf_sha256 text,total_pence bigint,source_hash text,outbox_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE existing app.customer_invoice%ROWTYPE; final_row app.final_account_revision%ROWTYPE;
 n bigint; number text; artifact text; digest text; decision_id uuid:=gen_random_uuid();
 resolution_id uuid:=gen_random_uuid(); authorization_id uuid:=gen_random_uuid(); new_invoice uuid:=gen_random_uuid();
 request_digest text:=encode(public.digest(convert_to(p_job::text||p_final_revision::text||p_recipient||p_issued_on::text,'UTF8'),'sha256'),'hex');
 prior jsonb; party_snapshot jsonb; check_row record; lock_row app.final_account_lock; item jsonb;

 -- ASCII PDF 1.4 objects: offsets and lengths below are byte counts of the stored artifact.
 pdf_rows text[]:=ARRAY[]::text[]; pdf_objects text[]; pdf_offsets bigint[]:=ARRAY[0::bigint];
 pdf_raw text; pdf_line text; pdf_stream text; pdf_kids text:=''; pdf_xref bigint;
 pdf_page integer; pdf_pages integer; pdf_i integer; pdf_j integer; pdf_content integer; pdf_font integer;
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 PERFORM app.final_check_require_invoice_actor(p_tenant,p_job,p_actor);
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.final_check_require_invoice_actor(p_tenant,p_job,p_actor);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_job::text,130));
 IF EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command AND (command_type<>'customer_invoice.issue' OR actor_membership_id<>p_actor)) THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
 SELECT result INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
   IF (SELECT request_hash FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command)<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
   RETURN QUERY SELECT (prior->>'invoiceId')::uuid,prior->>'invoiceNumber',prior->>'pdfSha256',(prior->>'totalPence')::bigint,prior->>'sourceHash',prior->>'outboxStatus'; RETURN;
 END IF;
 PERFORM app.ch4_require_open(p_tenant,p_job);
 IF p_recipient !~ '^[^@ ]+@example\.invalid$' THEN RAISE EXCEPTION 'SYNTHETIC_RECIPIENT_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT r.* INTO final_row FROM app.final_account_revision r JOIN app.final_account_draft d ON(d.tenant_id,d.id)=(r.tenant_id,r.final_account_draft_id)
 WHERE r.tenant_id=p_tenant AND r.job_id=p_job AND r.id=p_final_revision AND d.current_revision_id=r.id AND NOT r.issue_blocked;
 IF NOT FOUND THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT'; END IF;
 SELECT * INTO existing FROM app.customer_invoice WHERE tenant_id=p_tenant AND final_account_revision_id=p_final_revision;
 IF FOUND THEN
  IF EXISTS(SELECT 1 FROM app.final_account_invoice_binding binding WHERE binding.tenant_id=p_tenant AND binding.job_id=p_job AND binding.invoice_id=existing.id AND binding.invoice_kind IN ('final','supplementary')) THEN RAISE EXCEPTION 'FINAL_INVOICE_ALREADY_ISSUED'; END IF;
  RETURN QUERY SELECT existing.id,existing.invoice_number::text,existing.pdf_sha256::text,existing.total_pence,existing.source_hash::text,'succeeded'::text; RETURN; END IF;
 SELECT * INTO check_row FROM app.require_authoritative_final_check(p_tenant,p_job);
 IF (SELECT count(*) FROM app.final_account_line WHERE tenant_id=p_tenant AND job_id=p_job AND final_account_revision_id=p_final_revision)=0 THEN RAISE EXCEPTION 'INVOICE_AMOUNT_INVALID'; END IF;
 IF final_row.net_pence IS DISTINCT FROM (SELECT sum(net_pence) FROM app.final_account_line WHERE tenant_id=p_tenant AND job_id=p_job AND final_account_revision_id=p_final_revision) OR final_row.tax_pence<>(final_row.net_pence+2)/5 OR final_row.total_pence<>final_row.net_pence+final_row.tax_pence THEN RAISE EXCEPTION 'FINAL_ACCOUNT_TOTAL_MISMATCH'; END IF;
 SELECT * INTO lock_row FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF p_final_revision<>lock_row.final_account_revision_id OR final_row.baseline_quote_version_id<>lock_row.baseline_quote_version_id THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM app.customer_invoice i LEFT JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id) WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(b.invoice_kind,'final')='final') THEN RAISE EXCEPTION 'FINAL_INVOICE_ALREADY_ISSUED'; END IF;
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
 INSERT INTO app.final_account_invoice_binding(tenant_id,job_id,invoice_id,invoice_kind,lock_id,revision_id,check_id) VALUES(p_tenant,p_job,new_invoice,'final',lock_row.id,p_final_revision,check_row.check_id);
 FOR item IN WITH weights AS(SELECT to_jsonb(l) value,abs(l.net_pence::numeric) weight FROM app.final_account_line l WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.final_account_revision_id=p_final_revision),
 parts AS(SELECT value,CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE floor(final_row.tax_pence::numeric*weight/sum(weight) OVER()) END base,
 CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE mod(final_row.tax_pence::numeric*weight,sum(weight) OVER()) END remainder FROM weights),
 ranked AS(SELECT *,row_number() OVER(ORDER BY remainder DESC,value->>'id') rank,final_row.tax_pence-sum(base) OVER() left_over FROM parts)
 SELECT value||jsonb_build_object('allocated_tax',base+CASE WHEN rank<=left_over THEN 1 ELSE 0 END) FROM ranked LOOP
  INSERT INTO app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id,revision_id,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,tax_pence,gross_pence)
  VALUES(p_tenant,p_job,new_invoice,(item->>'id')::uuid,p_final_revision,(item->>'scope_item_id')::uuid,(item->>'commercial_revision_id')::uuid,item->>'line_kind',(item->>'source_id')::uuid,(item->>'net_pence')::bigint,(item->>'allocated_tax')::bigint,(item->>'net_pence')::bigint+(item->>'allocated_tax')::bigint);
 END LOOP;
 INSERT INTO app.customer_invoice_evidence(id,tenant_id,job_id,invoice_id,evidence_id,object_version_id,sha256,scope_item_id)
 SELECT gen_random_uuid(),p_tenant,p_job,new_invoice,evidence_id,object_version_id,sha256,scope_item_id FROM app.final_account_proof WHERE tenant_id=p_tenant AND final_account_revision_id=p_final_revision;
 INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at,status,completed_at)
 VALUES(gen_random_uuid(),p_tenant,authorization_id,'fake_invoice_delivery','practice-invoice:'||new_invoice,'final_account.issue',p_recipient,digest,artifact,final_row.revision,final_row.total_pence,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes','succeeded',transaction_timestamp());
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_command,p_tenant,'customer_invoice.issue','invoice:'||p_final_revision,request_digest,'succeeded',jsonb_build_object('invoiceId',new_invoice,'invoiceNumber',number,'pdfSha256',digest,'totalPence',final_row.total_pence,'sourceHash',final_row.source_hash,'outboxStatus','succeeded'),p_actor,transaction_timestamp());
 PERFORM app.append_final_lock_audit(gen_random_uuid(),p_actor,p_job,'customer_invoice.lock_bound_issued',jsonb_build_object('invoiceId',new_invoice,'lockId',lock_row.id,'checkId',check_row.check_id,'commandId',p_command),jsonb_build_object('pdf',digest));
 RETURN QUERY SELECT new_invoice,number,digest,final_row.total_pence,final_row.source_hash::text,'succeeded'::text;
END $$;
COMMIT;
