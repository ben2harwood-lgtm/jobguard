BEGIN;
-- LP-8a: only checked owner routines may create immutable billing facts.
-- The two *_sequence objects are TABLES, not PostgreSQL sequences. There is
-- no nextval() surface; INSERT/UPDATE on those tables and the public number
-- reservation helper are the corresponding number-burning capabilities.
REVOKE INSERT ON app.customer_invoice, app.customer_invoice_evidence,
 app.customer_credit_note, app.customer_payment, app.customer_payment_reversal
 FROM jobguard_runtime, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON app.customer_invoice_sequence,
 app.customer_credit_note_sequence FROM jobguard_runtime, PUBLIC;
REVOKE EXECUTE ON FUNCTION app.reserve_customer_invoice_number(uuid)
 FROM jobguard_runtime, PUBLIC;

-- LP-6c already grants the migration owner the two binding projections.
-- No extra grants on those binding projections are needed.

-- Retain the installed four-argument interface. Actor identity comes from the
-- unforgeable transaction binding, never from a tenant/actor GUC or the draft.
-- Rebuild the latest base definition (0016) with LP-6c protected binding.
-- No historical migration changes.
CREATE OR REPLACE FUNCTION app.advance_final_account_draft(
 p_tenant uuid,p_draft uuid,p_revision uuid,p_number integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE head app.final_account_draft; candidate app.final_account_revision; actor_id uuid;
BEGIN
 -- Check identity before business locks, following LP-6c.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 actor_id:=app.current_actor();
 PERFORM 1 FROM app.membership m WHERE m.tenant_id=p_tenant AND m.id=actor_id
  AND m.role='owner' AND m.revoked_at IS NULL
  AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp());
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_draft IS NULL OR p_revision IS NULL OR p_number IS NULL OR p_number<1 THEN
  RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_REVISION' USING ERRCODE='22023';
 END IF;
 SELECT * INTO head FROM app.final_account_draft
  WHERE tenant_id=p_tenant AND id=p_draft FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job j WHERE j.tenant_id=p_tenant AND j.id=head.job_id AND j.status='live') THEN
  RAISE EXCEPTION 'FROZEN_BASELINE_REQUIRED' USING ERRCODE='42501';
 END IF;
 SELECT r.* INTO candidate FROM app.final_account_revision r
  WHERE r.tenant_id=p_tenant AND r.job_id=head.job_id AND r.final_account_draft_id=head.id
   AND r.id=p_revision AND r.revision=p_number;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_REVISION' USING ERRCODE='22023'; END IF;
 -- An exact retry is harmless. Rewind, skipped numbers and a branch off a
 -- different parent must never move the authoritative current pointer.
 IF head.current_revision_id=p_revision AND head.revision=p_number THEN RETURN; END IF;
 IF p_number<>head.revision+1 OR candidate.previous_revision_id IS DISTINCT FROM head.current_revision_id THEN
  RAISE EXCEPTION 'STALE_FINAL_ACCOUNT_REVISION' USING ERRCODE='40001';
 END IF;
 UPDATE app.final_account_draft SET current_revision_id=p_revision,revision=p_number,
  updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_draft;
END
$$;
REVOKE ALL ON FUNCTION app.advance_final_account_draft(uuid,uuid,uuid,integer) FROM PUBLIC;
-- Forward fix only: restoring direct billing INSERT or the unguarded pointer
-- routine would reopen authorization bypasses. Repair callers, never regrant.


-- Private bridge to the existing LP-5 claim. No runtime SELECT on claims and
-- no caller-selected actor/tenant/authorization. LP-6c's protected binding is
-- checked before replay data, business locks or authorization can be used.
CREATE FUNCTION app.lp8a_billing_command(p_command uuid,p_type text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE t uuid:=app.current_tenant(); actor uuid:=app.current_actor();
 c app.command_lifecycle_claim; r app.command_receipt; a app.action_authorization; action jsonb;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF c.command_id IS NULL OR c.actor_membership_id IS DISTINCT FROM actor
  OR c.transaction_id IS DISTINCT FROM pg_current_xact_id() OR c.version<>'command.v1'
  OR r.status IS DISTINCT FROM 'processing' OR r.command_type IS DISTINCT FROM p_type
  OR c.resource->>'subjectType' IS DISTINCT FROM 'job' OR c.effect_ref IS NOT NULL THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner'
  AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp());
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 action:=c.significant_input->'action';
 SELECT grant_row.* INTO a FROM app.action_authorization grant_row
 JOIN app.decision_resolution resolution ON(resolution.tenant_id,resolution.id)=(grant_row.tenant_id,grant_row.resolution_id)
 JOIN app.decision decision ON(decision.tenant_id,decision.id)=(grant_row.tenant_id,grant_row.decision_id)
 WHERE grant_row.tenant_id=t AND grant_row.id=c.authorization_id AND grant_row.actor_membership_id=actor
  AND grant_row.revoked_at IS NULL AND grant_row.expires_at>clock_timestamp()
  AND resolution.resolution='approved' AND resolution.actor_membership_id=actor
  AND resolution.decision_id=decision.id AND decision.subject_type='job'
  AND decision.subject_ref=c.resource->>'subjectRef';
 IF a.id IS NULL OR a.action_type IS DISTINCT FROM action->>'actionType'
  OR a.recipient IS DISTINCT FROM action->>'recipient' OR a.content_hash IS DISTINCT FROM action->>'contentHash'
  OR a.aggregate_revision IS DISTINCT FROM (action->>'aggregateRevision')::integer
  OR a.amount_pence IS DISTINCT FROM (action->>'amountPence')::bigint
  OR a.currency IS DISTINCT FROM action->>'currency' OR a.policy_version IS DISTINCT FROM action->>'policyVersion'
  OR a.expires_at IS DISTINCT FROM (action->>'expiresAt')::timestamptz THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('tenant',t,'actor',actor,'job',c.resource->>'subjectRef','authorization',a.id,'action',action,'semanticKey',r.semantic_key);
END $$;
ALTER FUNCTION app.lp8a_billing_command(uuid,text) OWNER TO jobguard_command_writer;
REVOKE ALL ON FUNCTION app.lp8a_billing_command(uuid,text) FROM PUBLIC,jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.lp8a_billing_command(uuid,text) TO jobguard_migration;

-- Exact ASCII PDF serialization shared by the two compatibility artifacts.
-- This validates source-derived bytes rather than trusting runtime-supplied text.
CREATE FUNCTION app.lp8a_billing_pdf(p_lines text[],p_credit boolean) RETURNS bytea
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE stream text; objects text[]; pdf text:='%PDF-1.4'||chr(10);
 offsets integer[]:=ARRAY[]::integer[]; xref integer; i integer; line text;
BEGIN
 stream:=CASE WHEN p_credit THEN 'BT /F1 10 Tf 40 760 Td ' ELSE 'BT /F1 16 Tf 54 760 Td ' END;
 FOR i IN 1..cardinality(p_lines) LOOP
  line:=translate(regexp_replace(p_lines[i],'[^ -~]','?','g'),'()'||chr(92),'   ');
  stream:=stream||(CASE WHEN i=1 THEN '' WHEN p_credit THEN '0 -24 Td ' ELSE '0 -28 Td ' END)||'('||line||') Tj';
  IF i<cardinality(p_lines) THEN stream:=stream||' '; END IF;
 END LOOP;
 stream:=stream||' ET';
 objects:=ARRAY['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  '<< /Length '||length(stream)::text||' >>'||chr(10)||'stream'||chr(10)||stream||chr(10)||'endstream',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica'||(CASE WHEN p_credit THEN '' ELSE '-Bold' END)||' >>'];
 FOR i IN 1..cardinality(objects) LOOP
  offsets:=array_append(offsets,length(pdf));
  pdf:=pdf||i::text||' 0 obj'||chr(10)||objects[i]||chr(10)||'endobj'||chr(10);
 END LOOP;
 xref:=length(pdf);
 pdf:=pdf||'xref'||chr(10)||'0 6'||chr(10)||'0000000000 65535 f '||chr(10);
 FOR i IN 1..cardinality(offsets) LOOP pdf:=pdf||lpad(offsets[i]::text,10,'0')||' 00000 n '||chr(10); END LOOP;
 pdf:=pdf||'trailer << /Size 6 /Root 1 0 R >>'||chr(10)||'startxref'||chr(10)||xref::text||chr(10)||'%%EOF';
 RETURN convert_to(pdf,'UTF8');
END $$;
ALTER FUNCTION app.lp8a_billing_pdf(text[],boolean) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp8a_billing_pdf(text[],boolean) FROM PUBLIC,jobguard_runtime;

-- Compatibility for the exact-PDF legacy API, not an alternate approval path.
-- Amounts, proof copies and number allocation are derived here, never DML from
-- runtime. Its dispatcher still creates/finishes the single-use checked claim.
CREATE FUNCTION app.issue_approved_customer_invoice(
 p_command uuid,p_revision uuid,p_issued_on date,p_issuer jsonb,p_number text,p_pdf bytea
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE c jsonb; t uuid; actor uuid; j uuid; auth uuid; action jsonb;
 final_row app.final_account_revision; lock_row app.final_account_lock;
 new_invoice uuid:=gen_random_uuid(); n bigint; pdf_hash text;
BEGIN
 c:=app.lp8a_billing_command(p_command,'customer_invoice.issue');
 t:=(c->>'tenant')::uuid; actor:=(c->>'actor')::uuid; j:=(c->>'job')::uuid;
 auth:=(c->>'authorization')::uuid; action:=c->'action';
 IF right(c->>'semanticKey',69) IS DISTINCT FROM ':lp3='||encode(sha256(convert_to(app.final_lock_canonical(jsonb_build_array(p_revision,p_issued_on::text,p_issuer->>'legalName',p_issuer->>'address',p_issuer->>'vatNumber')),'UTF8')),'hex') THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM app.final_check_require_invoice_actor(t,j,actor);
 PERFORM 1 FROM app.job WHERE tenant_id=t AND app.job.id=j AND status='live' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FROZEN_BASELINE_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM app.ch4_require_open(t,j);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':customer-invoice-number',0));
 SELECT r.* INTO final_row FROM app.final_account_revision r JOIN app.final_account_draft d
  ON(d.tenant_id,d.job_id,d.id)=(r.tenant_id,r.job_id,r.final_account_draft_id)
  WHERE r.tenant_id=t AND r.job_id=j AND r.id=p_revision AND d.current_revision_id=r.id AND NOT r.issue_blocked;
 IF NOT FOUND OR final_row.revision IS DISTINCT FROM (action->>'aggregateRevision')::integer
  OR final_row.total_pence IS DISTINCT FROM (action->>'amountPence')::bigint THEN
  RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT_APPROVAL' USING ERRCODE='40001'; END IF;
 PERFORM app.require_authoritative_final_check(t,j);
 SELECT * INTO lock_row FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF lock_row.final_account_revision_id IS DISTINCT FROM p_revision
  OR lock_row.baseline_quote_version_id IS DISTINCT FROM final_row.baseline_quote_version_id THEN
  RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_account_line WHERE tenant_id=t AND job_id=j AND final_account_revision_id=p_revision)
  OR final_row.net_pence IS DISTINCT FROM (SELECT sum(net_pence) FROM app.final_account_line WHERE tenant_id=t AND job_id=j AND final_account_revision_id=p_revision)
  OR final_row.tax_pence<>(final_row.net_pence+2)/5 OR final_row.total_pence<>final_row.net_pence+final_row.tax_pence THEN
  RAISE EXCEPTION 'FINAL_ACCOUNT_TOTAL_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM app.customer_invoice WHERE tenant_id=t AND job_id=j) THEN
  RAISE EXCEPTION 'FINAL_INVOICE_ALREADY_ISSUED'; END IF;
 pdf_hash:=encode(public.digest(p_pdf,'sha256'),'hex');
 IF action->>'actionType' IS DISTINCT FROM 'final_account.issue' OR action->>'recipient' IS NOT NULL
  OR action->>'currency' IS DISTINCT FROM 'GBP' OR action->>'policyVersion' IS DISTINCT FROM final_row.tax_policy_version
  OR pdf_hash IS NULL OR pdf_hash IS DISTINCT FROM action->>'contentHash'
  OR p_issued_on IS NULL OR p_issued_on NOT BETWEEN date '0001-01-01' AND date '9999-12-31'
  OR p_issuer IS NULL OR jsonb_typeof(p_issuer)<>'object'
  OR coalesce(length(btrim(p_issuer->>'legalName')),0) NOT BETWEEN 1 AND 160
  OR coalesce(length(btrim(p_issuer->>'address')),0) NOT BETWEEN 1 AND 500
  OR length(p_issuer->>'vatNumber')>32 OR octet_length(p_pdf)>10485760 THEN
  RAISE EXCEPTION 'APPROVED_PDF_HASH_MISMATCH' USING ERRCODE='42501'; END IF;
 PERFORM app.require_current_job_parties(t,j);
 n:=app.reserve_customer_invoice_number(t);
 IF p_number IS DISTINCT FROM 'SYN-'||to_char(p_issued_on,'YYYY')||'-'||lpad(n::text,6,'0') THEN
  RAISE EXCEPTION 'APPROVED_PDF_HASH_MISMATCH' USING ERRCODE='42501'; END IF;
 -- Reject evidence with a wrong job, scope, version or lifecycle, even though
 -- the old evidence FK only checked (tenant,evidence_id).
 IF EXISTS(SELECT 1 FROM app.final_account_proof p LEFT JOIN app.evidence_object e
  ON(e.tenant_id,e.job_id,e.scope_item_id,e.id,e.object_version_id,e.sha256)=(p.tenant_id,p.job_id,p.scope_item_id,p.evidence_id,p.object_version_id,p.sha256)
  LEFT JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
  WHERE p.tenant_id=t AND p.job_id=j AND p.final_account_revision_id=p_revision
   AND (e.id IS NULL OR e.kind<>'original' OR u.state IS DISTINCT FROM 'verified'
    OR EXISTS(SELECT 1 FROM app.evidence_invalidation invalid WHERE invalid.tenant_id=t AND invalid.evidence_id=e.id))) THEN
  RAISE EXCEPTION 'INVALID_INVOICE_EVIDENCE' USING ERRCODE='42501'; END IF;
 IF p_pdf IS DISTINCT FROM app.lp8a_billing_pdf(ARRAY['SYNTHETIC - NOT A REAL INVOICE','Invoice '||p_number,
  'Issuer: '||(p_issuer->>'legalName'),'Total GBP '||to_char(final_row.total_pence::numeric/100,'FM9999999999999990.00'),
  'Source revision: '||p_revision::text,'Evidence versions: '||coalesce((SELECT string_agg(object_version_id,', ' ORDER BY evidence_id)
    FROM app.final_account_proof WHERE tenant_id=t AND job_id=j AND final_account_revision_id=p_revision),'none')],false) THEN
  RAISE EXCEPTION 'APPROVED_PDF_HASH_MISMATCH' USING ERRCODE='42501'; END IF;

 INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
 VALUES(new_invoice,t,j,p_revision,auth,p_number,p_issued_on,p_issuer,final_row.tax_policy_version,'GBP',final_row.net_pence,final_row.tax_pence,final_row.total_pence,final_row.source_hash,pdf_hash,p_pdf,true,'SYNTHETIC - NOT A REAL INVOICE');
 INSERT INTO app.customer_invoice_evidence(id,tenant_id,job_id,invoice_id,evidence_id,object_version_id,sha256,scope_item_id)
 SELECT gen_random_uuid(),t,j,new_invoice,p.evidence_id,p.object_version_id,p.sha256,p.scope_item_id FROM app.final_account_proof p
 WHERE p.tenant_id=t AND p.job_id=j AND p.final_account_revision_id=p_revision;
 RETURN new_invoice;
END $$;
ALTER FUNCTION app.issue_approved_customer_invoice(uuid,uuid,date,jsonb,text,bytea) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.issue_approved_customer_invoice(uuid,uuid,date,jsonb,text,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.issue_approved_customer_invoice(uuid,uuid,date,jsonb,text,bytea) TO jobguard_runtime;

CREATE FUNCTION app.issue_approved_customer_credit(
 p_command uuid,p_invoice uuid,p_amount bigint,p_reason text,p_pdf bytea
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE c jsonb; t uuid; j uuid; auth uuid; action jsonb; invoice app.customer_invoice;
 credited bigint; credited_net bigint; credited_tax bigint; net bigint; tax bigint; preview text; new_credit uuid:=gen_random_uuid();
BEGIN
 c:=app.lp8a_billing_command(p_command,'customer_credit_note.issue');
 t:=(c->>'tenant')::uuid; j:=(c->>'job')::uuid; auth:=(c->>'authorization')::uuid; action:=c->'action';
 IF right(c->>'semanticKey',69) IS DISTINCT FROM ':lp3='||encode(sha256(convert_to(app.final_lock_canonical(jsonb_build_array(p_invoice,p_amount,p_reason)),'UTF8')),'hex') THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM app.final_check_require_invoice_actor(t,j,(c->>'actor')::uuid);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_invoice::text,0));
 SELECT * INTO invoice FROM app.customer_invoice WHERE tenant_id=t AND job_id=j AND app.customer_invoice.id=p_invoice;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_CREDIT_AMOUNT'; END IF;
 SELECT coalesce(sum(amount_pence),0),coalesce(-sum(net_pence),0),coalesce(-sum(tax_pence),0)
 INTO credited,credited_net,credited_tax FROM app.customer_credit_note WHERE tenant_id=t AND invoice_id=p_invoice;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>1000000000000 THEN RAISE EXCEPTION 'INVALID_CREDIT_AMOUNT'; END IF;
 net:=(p_amount*5+3)/6; tax:=(net+2)/5;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>1000000000000 OR net<=0 OR net+tax<>p_amount
  OR credited+p_amount>invoice.total_pence OR credited_net+net>invoice.net_pence OR credited_tax+tax>invoice.tax_pence
  OR invoice.tax_policy_version<>'candidate_m1_standard_v1' OR NOT invoice.synthetic
  OR action->>'actionType' IS DISTINCT FROM 'customer_credit_note.issue' OR action->>'recipient' IS NOT NULL
  OR action->>'currency' IS DISTINCT FROM 'GBP' OR action->>'policyVersion' IS DISTINCT FROM invoice.tax_policy_version
  OR (action->>'amountPence')::bigint IS DISTINCT FROM p_amount
  OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 240
  OR p_pdf IS NULL OR octet_length(p_pdf)>10485760 THEN
  RAISE EXCEPTION 'INVALID_CREDIT_AMOUNT'; END IF;
 preview:=encode(public.digest(convert_to(j::text||p_invoice::text||net::text||credited::text||invoice.pdf_sha256::text,'UTF8'),'sha256'),'hex');
 IF p_pdf IS DISTINCT FROM app.lp8a_billing_pdf(ARRAY['SYNTHETIC - NOT A REAL INVOICE',
  'Practice sandbox - synthetic data; nothing is sent or charged','Credit note CN-'||p_command::text,
  'Corrects invoice '||invoice.invoice_number,'Reason: '||p_reason,'Net pence: '||(-net)::text,
  'VAT pence: '||(-tax)::text,'Total GBP pence: '||(-p_amount)::text,'Original invoice hash: '||invoice.pdf_sha256::text],true) THEN
  RAISE EXCEPTION 'APPROVED_PDF_HASH_MISMATCH' USING ERRCODE='42501'; END IF;

 INSERT INTO app.customer_credit_note(id,tenant_id,job_id,invoice_id,authorization_id,credit_number,amount_pence,currency,reason,net_pence,tax_pence,total_pence,source_invoice_hash,preview_hash,pdf_sha256,pdf_bytes,tax_policy_version,approved_at)
 VALUES(new_credit,t,j,p_invoice,auth,'CN-'||p_command::text,p_amount,'GBP',p_reason,-net,-tax,-p_amount,invoice.pdf_sha256,preview,encode(public.digest(p_pdf,'sha256'),'hex'),p_pdf,invoice.tax_policy_version,transaction_timestamp());
 RETURN new_credit;
END $$;
ALTER FUNCTION app.issue_approved_customer_credit(uuid,uuid,bigint,text,bytea) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.issue_approved_customer_credit(uuid,uuid,bigint,text,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.issue_approved_customer_credit(uuid,uuid,bigint,text,bytea) TO jobguard_runtime;
COMMIT;
