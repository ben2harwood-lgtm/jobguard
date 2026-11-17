BEGIN;
-- DEMO-S step 7 explicitly requires one £34,400 net / £41,280 gross invoice.
-- Preserve the old supplementary route; allow the first final invoice to bind
-- a descendant containing the unchanged locked bill plus approved catches only.
CREATE FUNCTION app.j3_require_combined_revision(t uuid,j uuid,r uuid,k uuid) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE locked app.final_account_lock;
BEGIN
 SELECT * INTO locked FROM app.final_account_lock WHERE tenant_id=t AND job_id=j AND id=k;
 IF locked.id IS NULL OR r=locked.final_account_revision_id
 OR NOT EXISTS(
  WITH RECURSIVE ancestors AS (
   SELECT x.id,x.previous_revision_id,x.revision,ARRAY[x.id] path FROM app.final_account_revision x
    WHERE x.tenant_id=t AND x.job_id=j AND x.id=r AND x.baseline_quote_version_id=locked.baseline_quote_version_id
   UNION ALL SELECT x.id,x.previous_revision_id,x.revision,a.path||x.id FROM app.final_account_revision x JOIN ancestors a ON x.id=a.previous_revision_id
    WHERE x.tenant_id=t AND x.job_id=j AND x.baseline_quote_version_id=locked.baseline_quote_version_id AND x.revision<a.revision AND NOT x.id=ANY(a.path)
  ) SELECT 1 FROM ancestors WHERE id=locked.final_account_revision_id)
 THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
 -- A copied commercial identity can occur only once, never twice on this bill.
 IF EXISTS(SELECT 1 FROM app.final_account_line WHERE tenant_id=t AND job_id=j AND final_account_revision_id=r
  GROUP BY line_kind,source_id,commercial_revision_id,scope_item_id HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'INVOICE_SOURCE_CORRECTION_REQUIRED'; END IF;
 -- Preserve every locked commercial line, including its value. No replacements.
 IF EXISTS(SELECT 1 FROM app.final_account_line old WHERE old.tenant_id=t AND old.job_id=j AND old.final_account_revision_id=locked.final_account_revision_id
  AND NOT EXISTS(SELECT 1 FROM app.final_account_line fresh WHERE fresh.tenant_id=t AND fresh.job_id=j AND fresh.final_account_revision_id=r
   AND (fresh.line_kind,fresh.source_id,fresh.commercial_revision_id,fresh.scope_item_id,fresh.net_pence)=
       (old.line_kind,old.source_id,old.commercial_revision_id,old.scope_item_id,old.net_pence)))
 THEN RAISE EXCEPTION 'INVOICE_SOURCE_CORRECTION_REQUIRED'; END IF;
 -- New commercial identities must be approved, confirmed catches of THIS lock.
 IF NOT EXISTS(SELECT 1 FROM app.final_account_line WHERE tenant_id=t AND job_id=j AND final_account_revision_id=r)
 OR EXISTS(SELECT 1 FROM app.final_account_line fresh WHERE fresh.tenant_id=t AND fresh.job_id=j AND fresh.final_account_revision_id=r
  AND NOT EXISTS(SELECT 1 FROM app.final_account_line old WHERE old.tenant_id=t AND old.job_id=j AND old.final_account_revision_id=locked.final_account_revision_id
   AND (fresh.line_kind,fresh.source_id,fresh.commercial_revision_id,fresh.scope_item_id,fresh.net_pence)=
       (old.line_kind,old.source_id,old.commercial_revision_id,old.scope_item_id,old.net_pence))
  AND NOT EXISTS(SELECT 1 FROM app.variation_revision vr
   JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(vr.tenant_id,vr.job_id,vr.variation_id)
   JOIN app.final_check_reveal_proof proof ON(proof.tenant_id,proof.job_id,proof.signal_id,proof.lock_id)=(o.tenant_id,o.job_id,o.source_signal_id,k)
   JOIN app.final_check_disposition_binding disposition ON(disposition.tenant_id,disposition.job_id,disposition.signal_id,disposition.lock_id)=(o.tenant_id,o.job_id,o.source_signal_id,k)
   WHERE vr.tenant_id=t AND vr.job_id=j AND vr.id=fresh.commercial_revision_id AND fresh.line_kind='variation'
    AND fresh.source_id=vr.id AND fresh.scope_item_id=vr.scope_item_id AND fresh.net_pence=vr.signed_delta_pence AND fresh.net_pence>0
    AND o.kind='jobguard_catch' AND disposition.answer='confirmed_extra'
    AND EXISTS(SELECT 1 FROM app.variation_approval approval WHERE approval.tenant_id=t AND approval.job_id=j AND approval.revision_id=vr.id AND approval.signed_delta_pence=vr.signed_delta_pence)))
 THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
END $$;

CREATE OR REPLACE FUNCTION app.issue_lock_bound_customer_invoice(p_tenant uuid,p_job uuid,p_revision uuid,p_actor uuid,p_command uuid,p_kind text,p_recipient text,p_issued_on date,p_source_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE lock_row app.final_account_lock; check_row record; final_row app.final_account_revision; prior app.command_receipt;
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
 IF FOUND THEN IF prior.command_type<>'IssueLockBoundInvoice' OR prior.request_hash<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF; PERFORM app.final_check_require_invoice_actor(p_tenant,p_job,p_actor); RETURN prior.result; END IF;
 -- Preserve CH-4-C refusal order for owners; session scope still gates replay and every new issue.
 PERFORM app.ch4_require_open(p_tenant,p_job);
 SELECT * INTO lock_row FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 SELECT * INTO check_row FROM app.require_authoritative_final_check(p_tenant,p_job);
 PERFORM app.final_check_require_invoice_actor(p_tenant,p_job,p_actor);
 SELECT * INTO final_row FROM app.final_account_revision WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_revision AND source_hash=p_source_hash AND NOT issue_blocked;
 IF NOT FOUND THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT' USING ERRCODE='40001'; END IF;
 IF final_row.baseline_quote_version_id<>lock_row.baseline_quote_version_id THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
 IF p_kind='final' AND p_revision<>lock_row.final_account_revision_id THEN
  IF NOT EXISTS(SELECT 1 FROM app.final_account_draft WHERE tenant_id=p_tenant AND job_id=p_job AND current_revision_id=p_revision) THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT'; END IF;
  PERFORM app.j3_require_combined_revision(p_tenant,p_job,p_revision,lock_row.id);
 END IF;
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
 INSERT INTO app.final_account_invoice_binding(tenant_id,job_id,invoice_id,invoice_kind,lock_id,revision_id,check_id) VALUES(p_tenant,p_job,invoice_id,p_kind,lock_row.id,p_revision,check_row.check_id);
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
 PERFORM app.append_final_lock_audit(audit_id,p_actor,p_job,'customer_invoice.lock_bound_issued',jsonb_build_object('invoiceId',invoice_id,'lockId',lock_row.id,'checkId',check_row.check_id,'commandId',p_command),jsonb_build_object('pdf',digest));
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION app.receipt_fact_invoice_line(t uuid,j uuid,i uuid,l uuid,r uuid,k uuid,ch uuid) RETURNS void
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
  IF r<>locked.final_account_revision_id THEN
   -- Historical invoices remain valid after later draft revisions. The immutable
   -- issued revision was checked at issue; recheck its source with that revision.
   PERFORM app.j3_require_combined_revision(t,j,r,k);
  END IF;
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

CREATE OR REPLACE FUNCTION app.stored_receipt_case_facts(t uuid,j uuid,f uuid,c uuid,w uuid) RETURNS jsonb
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
 -- Original lines are lock-bound; post-lock catches are bound to an issued
 -- descendant, through the combined final or existing supplementary path.
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
  -- The shared invoice-line guard above verifies this issued descendant's
  -- exact revision, this lock, its completed check, ancestry and original-bill exclusion.
  IF rc.case_type IS DISTINCT FROM 'missed_variation_final_account' OR item.line_kind<>'variation' OR (s.invoice_kind<>'supplementary' AND NOT (s.invoice_kind='final' AND s.revision_id<>k.final_account_revision_id))
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

CREATE OR REPLACE FUNCTION app.recovery_attribution_sources(t uuid,j uuid,p jsonb,actor uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE c uuid:=(p->>'caseId')::uuid; w uuid:=(p->>'workId')::uuid;
 l uuid:=(p->>'lineId')::uuid; k uuid:=(p->>'lockId')::uuid;
 locked app.final_account_lock; item app.final_account_line; rc app.recovery_case_current;
 sig app.shadow_commercial_signal; origin app.extra_origin; proof app.final_check_reveal_proof;
 disposition app.final_check_disposition_binding; invoiced app.final_account_invoiced_line;
 binding app.final_account_invoice_binding; latest app.recovery_attribution_revision;
 allocation record; evidence jsonb; changes jsonb; saved jsonb; pair numeric[]; positive jsonb;
 n numeric; d numeric; paid boolean:=true; evidence_ok boolean; undisclosed boolean; confirmed boolean;
 sources jsonb:='[]'; manifests jsonb:='[]'; facts jsonb:='{}'; reasons jsonb:='[]'; exclusions jsonb;
 ids uuid[]; kinds text[]; predicates text[]; holds boolean[]; inventories jsonb[];
 source_hash text; subject jsonb; assessment uuid:=gen_random_uuid(); x integer; allocation_id uuid;
BEGIN
 SELECT * INTO locked FROM app.final_account_lock WHERE tenant_id=t AND job_id=j AND id=k;
 SELECT * INTO item FROM app.final_account_line WHERE tenant_id=t AND job_id=j AND id=l;
 SELECT * INTO rc FROM app.recovery_case_current WHERE tenant_id=t AND job_id=j AND id=c;
 SELECT o.* INTO origin FROM app.extra_origin o JOIN app.variation_revision vr
  ON(vr.tenant_id,vr.job_id,vr.variation_id)=(o.tenant_id,o.job_id,o.variation_id)
  WHERE vr.tenant_id=t AND vr.job_id=j AND vr.id=item.commercial_revision_id AND vr.id=item.source_id
   AND vr.scope_item_id=item.scope_item_id AND o.kind='jobguard_catch';
 SELECT * INTO sig FROM app.shadow_commercial_signal WHERE tenant_id=t AND job_id=j AND id=origin.source_signal_id;
 SELECT * INTO proof FROM app.final_check_reveal_proof WHERE tenant_id=t AND job_id=j AND signal_id=sig.id AND lock_id=k;
 SELECT * INTO disposition FROM app.final_check_disposition_binding WHERE tenant_id=t AND job_id=j AND signal_id=sig.id AND lock_id=k;
 SELECT * INTO invoiced FROM app.final_account_invoiced_line WHERE tenant_id=t AND job_id=j AND final_account_line_id=l;
 SELECT * INTO binding FROM app.final_account_invoice_binding WHERE tenant_id=t AND job_id=j AND invoice_id=invoiced.invoice_id;
 IF locked.id IS NULL OR item.id IS NULL OR rc.id IS NULL OR origin.variation_id IS NULL OR sig.id IS NULL
 OR proof.signal_id IS NULL OR disposition.disposition_id IS NULL OR invoiced.final_account_line_id IS NULL
 OR rc.case_type IS DISTINCT FROM 'missed_variation_final_account' OR NOT rc.synthetic OR rc.claim_revision IS NULL
 OR item.line_kind<>'variation' OR sig.work_id IS DISTINCT FROM w OR sig.coalesced_into_signal_id IS NOT NULL
 OR NOT rc.source_refs ? ('variation:'||origin.variation_id::text) OR NOT rc.source_refs ? ('revision:'||item.commercial_revision_id::text)
 OR (binding.invoice_kind IS DISTINCT FROM 'supplementary' AND NOT (binding.invoice_kind='final' AND binding.revision_id<>locked.final_account_revision_id)) OR binding.lock_id IS DISTINCT FROM k
 THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 -- #368: the catch line must belong to the exact bound descendant of the locked
 -- revision, never an arbitrary same-job revision or a line on the original bill.
 PERFORM app.receipt_fact_invoice_line(t,j,invoiced.invoice_id,l,item.final_account_revision_id,k,binding.check_id);
 IF EXISTS(SELECT 1 FROM app.recovery_attribution_revision a WHERE a.tenant_id=t AND a.job_id=j
  AND (a.line_id=l OR a.work_id=w) AND (a.case_id,a.work_id,a.line_id,a.lock_id) IS DISTINCT FROM(c,w,l,k))
 OR NOT EXISTS(SELECT 1 FROM app.stored_receipt_case_binding b WHERE b.tenant_id=t AND b.job_id=j
  AND (b.case_id,b.work_id,b.line_id,b.lock_id)=(c,w,l,k))
 THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_LINE_ALREADY_BOUND' USING ERRCODE='23514'; END IF;
 SELECT * INTO latest FROM app.recovery_attribution_revision WHERE tenant_id=t AND job_id=j AND case_id=c AND work_id=w AND line_id=l AND lock_id=k ORDER BY revision DESC LIMIT 1;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.evidence_id),'[]') INTO evidence FROM app.shadow_signal_evidence e
  WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=sig.id;
 evidence_ok:=jsonb_array_length(evidence)>0 AND NOT EXISTS(
  SELECT 1 FROM app.shadow_signal_evidence e LEFT JOIN app.evidence_object o
   ON(o.tenant_id,o.job_id,o.id,o.object_version_id,o.sha256,o.server_received_at)=(e.tenant_id,e.job_id,e.evidence_id,e.object_version_id,e.sha256,e.source_received_at)
  WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=sig.id AND (e.source_received_at>locked.locked_at OR o.id IS NULL
   OR o.server_verified_at IS NULL OR EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id)));
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]') INTO changes FROM app.evidence_invalidation i
  WHERE i.tenant_id=t AND i.evidence_id IN(SELECT e.evidence_id FROM app.shadow_signal_evidence e WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=sig.id);
 undisclosed:=NOT sig.disclosed_before_lock AND NOT sig.must_surface_now AND sig.state<>'surfaced_early'
  AND NOT EXISTS(SELECT 1 FROM app.shadow_disclosure_event e WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=sig.id AND e.before_lock);
 confirmed:=disposition.answer='confirmed_extra' AND sig.state='confirmed_extra' AND EXISTS(
  SELECT 1 FROM app.variation_approval a WHERE a.tenant_id=t AND a.job_id=j AND a.revision_id=item.commercial_revision_id AND a.signed_delta_pence>0);
 -- Allocation facts come only from M4-8-S; no second allocator or supplied money.
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'),
  coalesce(jsonb_agg(jsonb_build_object('n',a.net_numerator,'d',a.net_denominator)) FILTER(WHERE a.reverses_id IS NULL),'[]')
 INTO saved,positive FROM app.stored_receipt_case_allocation a
 WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND a.work_id=w AND a.line_id=l AND a.lock_id=k;
 -- #356: cap cumulative positive principal at line net; reversals do not reopen it.
 PERFORM app.assert_receipt_fact_bound(positive,item.net_pence,1);
 SELECT app.recovery_allocation_fraction_sum(coalesce(jsonb_agg(jsonb_build_array(a.net_numerator,a.net_denominator)),'[]')) INTO pair
 FROM app.stored_receipt_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND a.work_id=w AND a.line_id=l AND a.lock_id=k;
 n:=greatest(pair[1],0);d:=pair[2];
 IF n>item.net_pence*d THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_LINE_CAP' USING ERRCODE='23514'; END IF;
 FOR allocation IN SELECT a.*,s.id source_id,s.payment_id,s.movement_id,s.movement_hash,s.invoice_id,s.revision_id,s.check_id,
  fl.line_id fact_line,fl.net_numerator fact_n,fl.net_denominator fact_d
  FROM app.stored_receipt_case_allocation a JOIN app.receipt_allocation_fact_line fl ON(fl.tenant_id,fl.job_id,fl.id)=(a.tenant_id,a.job_id,a.fact_line_id)
  JOIN app.receipt_allocation_fact_source s ON(s.tenant_id,s.job_id,s.id)=(fl.tenant_id,fl.job_id,fl.source_id)
  WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND a.work_id=w AND a.line_id=l AND a.lock_id=k ORDER BY a.id LOOP
  IF allocation.fact_line<>l OR allocation.invoice_id<>invoiced.invoice_id OR allocation.revision_id<>binding.revision_id
   OR (allocation.net_numerator,allocation.net_denominator) IS DISTINCT FROM(allocation.fact_n,allocation.fact_d)
   OR NOT app.receipt_fact_source_approved(t,j,allocation.source_id)
  THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
  -- #346: the 0258 tenant FK alone does not bind a feed movement's job.
  IF NOT EXISTS(SELECT 1 FROM app.practice_feed_event e WHERE e.tenant_id=t AND e.job_id=j AND e.id=allocation.movement_id AND trim(e.source_hash)=allocation.movement_hash AND e.state='settled' AND e.identity='identified')
  THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_MOVEMENT_JOB_REQUIRED' USING ERRCODE='23514'; END IF;
  IF allocation.reverses_id IS NULL THEN
   allocation_id:=coalesce(allocation_id,allocation.id);
   paid:=paid AND NOT EXISTS(SELECT 1 FROM app.customer_payment_reversal r WHERE r.tenant_id=t AND r.job_id=j AND r.payment_id=allocation.payment_id AND NOT EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.reverses_id=allocation.id))
    AND NOT EXISTS(SELECT 1 FROM app.customer_credit_note cn WHERE cn.tenant_id=t AND cn.job_id=j AND cn.invoice_id=allocation.invoice_id AND NOT EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation a JOIN app.receipt_allocation_fact_line fl ON(fl.tenant_id,fl.job_id,fl.id)=(a.tenant_id,a.job_id,a.fact_line_id) JOIN app.receipt_allocation_fact_source fs ON(fs.tenant_id,fs.job_id,fs.id)=(fl.tenant_id,fl.job_id,fl.source_id) WHERE a.tenant_id=t AND a.job_id=j AND a.reverses_id=allocation.id AND fs.source_manifest->>'creditNoteId'=cn.id::text))
    AND NOT EXISTS(SELECT 1 FROM app.practice_feed_event e JOIN app.practice_feed_event original ON original.tenant_id=e.tenant_id AND original.account_id=e.account_id AND original.movement_key=e.movement_key
     WHERE original.tenant_id=t AND original.job_id=j AND original.id=allocation.movement_id AND e.state IN('reversed','possible_duplicate')
      AND (e.state='reversed' OR NOT EXISTS(SELECT 1 FROM app.practice_feed_command q WHERE q.tenant_id=t AND q.account_id=e.account_id AND q.movement_key=e.movement_key AND q.action='reconcile_duplicate')))
    AND NOT EXISTS(SELECT 1 FROM app.action_authorization a WHERE a.tenant_id=t AND a.id=allocation.authorization_id AND a.revoked_at IS NOT NULL);
   paid:=paid AND NOT EXISTS(SELECT 1 FROM app.action_authorization a JOIN app.receipt_allocation_fact_source fs ON fs.tenant_id=a.tenant_id AND fs.source_manifest->>'approvalRef'=a.id::text WHERE fs.tenant_id=t AND fs.job_id=j AND fs.id=allocation.source_id AND a.revoked_at IS NOT NULL);
  END IF;
 END LOOP;
 IF allocation_id IS NULL THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 -- A new immutable adjustment may be assessed before its allocation reversal is
 -- saved. Fail closed immediately, preserving the earlier revision as history.
 IF NOT paid THEN n:=0;d:=1; END IF;
 IF rc.state='prevented' THEN confirmed:=false; END IF;
 n:=least(n,greatest(rc.claim_pence-rc.written_off,0)*d);
 subject:=jsonb_build_object('tenantId',t,'jobId',j,'workId',w,'lineId',l,'lockId',k);
 ids:=ARRAY[(evidence->0->>'evidence_id')::uuid,sig.id,locked.baseline_quote_version_id,locked.command_id,locked.final_account_revision_id,proof.run_id,disposition.disposition_id,l,allocation_id];
 kinds:=ARRAY['evidence','disclosure','baseline_manifest','capture_manifest','locked_bill_manifest','reveal','disposition','invoice_line','line_allocation'];
 predicates:=ARRAY['evidence_received_before_lock','not_disclosed_before_lock','absent_from_accepted_scope','absent_from_builder_captures_at_lock','absent_from_locked_final_account','revealed_after_lock','builder_confirmed_genuine_extra_and_completed','billed_through_a_final_account_revision_and_invoice','customer_payment_settled_and_allocated_to_that_line','qualifying_allocated_principal_remains_after_item_specific_reversals_refunds_and_credits'];
 holds:=ARRAY[evidence_ok,undisclosed,NOT coalesce(locked.snapshot->'baselineScopeItemIds' ? sig.matched_scope_item_id::text,false),
  NOT EXISTS(SELECT 1 FROM jsonb_array_elements(locked.snapshot->'captureRegister') e WHERE e->>'id'=sig.matched_variation_id::text),
  NOT EXISTS(SELECT 1 FROM jsonb_array_elements(locked.snapshot->'lines') e WHERE e->>'id'=l::text OR e->>'scopeItemId'=item.scope_item_id::text),
  proof.first_available_at>=locked.locked_at,confirmed,true,paid AND n>0,n>0];
 SELECT coalesce(jsonb_agg(jsonb_build_object('version','shadow-ineligibility.v1','reason',i.reason,'sourceRef',sig.id,'at',to_char(i.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'disclosureRoute',NULL) ORDER BY i.id),'[]') INTO exclusions
 FROM app.shadow_signal_ineligibility i WHERE i.tenant_id=t AND i.job_id=j AND i.signal_id=sig.id;
 -- Hash all source facts, not just their IDs. Unallocated credits/refunds and
 -- invalidation also change the watermark, even before the neutral producer runs.
 source_hash:=app.final_lock_hash(jsonb_build_object('lock',locked.snapshot_digest,'signal',to_jsonb(sig),'proof',to_jsonb(proof),'disposition',to_jsonb(disposition),
  'allocations',saved,'invalidation',changes,'holds',holds,'exclusions',exclusions,'remaining',jsonb_build_array(n,d),'caseRevision',rc.revision));
 FOR x IN 1..9 LOOP
  sources:=sources||jsonb_build_array(jsonb_build_object('kind',kinds[x],'sourceId',ids[x],'sourceVersion',source_hash,'sourceHash',source_hash,'tenantId',t,'jobId',j));
 END LOOP;
 FOR allocation IN SELECT a.id,a.reverses_id FROM app.stored_receipt_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND a.work_id=w AND a.line_id=l AND a.lock_id=k AND a.id<>allocation_id LOOP
  sources:=sources||jsonb_build_array(jsonb_build_object('kind',CASE WHEN allocation.reverses_id IS NULL THEN 'line_allocation' ELSE 'line_reversal' END,'sourceId',allocation.id,'sourceVersion',source_hash,'sourceHash',source_hash,'tenantId',t,'jobId',j));
 END LOOP;
 inventories:=ARRAY[coalesce(locked.snapshot->'baselineScopeItemIds','[]'),proof.comparisons->'captureIds',proof.comparisons->'lockedLineIds'];
 FOR x IN 3..5 LOOP
  manifests:=manifests||jsonb_build_array(jsonb_build_object('kind',kinds[x],'sourceId',ids[x],'lockId',k,'status','completed','itemIds',inventories[x-2],'itemCount',jsonb_array_length(inventories[x-2])));
 END LOOP;
 FOR x IN 1..10 LOOP
  facts:=facts||jsonb_build_object(predicates[x],subject||jsonb_build_object('version','shadow-fact.v1','predicate',predicates[x],'holds',holds[x],'sourceRef',ids[least(x,9)]));
  IF NOT holds[x] THEN reasons:=reasons||to_jsonb(predicates[x]); END IF;
 END LOOP;
 IF jsonb_array_length(exclusions)>0 THEN reasons:=reasons||'"permanent_or_disputed_exclusion"'::jsonb; END IF;
 RETURN subject||jsonb_build_object('version','recovery-attribution-revision.v1','caseId',c,'assessmentId',assessment,'revision',coalesce(latest.revision,0)+1,'previousAssessmentId',latest.id,
  'caseRevision',rc.revision,'sourceRevision',source_hash,'sourceHash',source_hash,'sourceManifest',sources,'completeManifests',manifests,
  'facts',subject||jsonb_build_object('version','shadow-attribution.v1','policyVersion','shadow_attribution_policy_v3','revisionId',assessment,'disputeReview',NULL,'exclusions',exclusions,'facts',facts),
  'remainingPrincipal',jsonb_build_object('numerator',trunc(n)::text,'denominator',trunc(d)::text),'assessmentOutcome',CASE WHEN reasons='[]'::jsonb THEN 'eligible_for_review' ELSE 'excluded' END,'reasonCodes',reasons,
  'attributionPolicyVersion','shadow_attribution_policy_v3','eligibilityPolicyVersion','reference_recovery_eligibility_policy_v3','policyBundleRef','recovery-fee-illustration.synthetic-policy.v1',
  'assessedBy',jsonb_build_object('kind','membership','actorRef',actor),'serverRecordedAt',to_char(clock_timestamp(),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'environment','synthetic_demo','productionEnabled',false,'realExternalActions',0);
END $$;
ALTER FUNCTION app.j3_require_combined_revision(uuid,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.j3_require_combined_revision(uuid,uuid,uuid,uuid)
 FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
COMMIT;
