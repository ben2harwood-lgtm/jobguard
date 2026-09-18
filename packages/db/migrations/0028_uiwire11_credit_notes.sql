BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE TABLE app.customer_credit_note_sequence(
 id uuid NOT NULL, tenant_id uuid NOT NULL, next_number bigint NOT NULL DEFAULT 1 CHECK(next_number>0),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id)
);
ALTER TABLE app.customer_credit_note_sequence OWNER TO jobguard_migration;
ALTER TABLE app.customer_credit_note_sequence ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_credit_note_sequence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.customer_credit_note_sequence FOR ALL TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON app.customer_credit_note_sequence TO jobguard_runtime;
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.customer_credit_note_sequence FROM jobguard_runtime;

ALTER TABLE app.customer_credit_note ADD COLUMN net_pence bigint;
ALTER TABLE app.customer_credit_note ADD COLUMN tax_pence bigint;
ALTER TABLE app.customer_credit_note ADD COLUMN total_pence bigint;
ALTER TABLE app.customer_credit_note ADD COLUMN source_invoice_hash char(64);
ALTER TABLE app.customer_credit_note ADD COLUMN preview_hash char(64);
ALTER TABLE app.customer_credit_note ADD COLUMN pdf_sha256 char(64);
ALTER TABLE app.customer_credit_note ADD COLUMN pdf_bytes bytea;
ALTER TABLE app.customer_credit_note ADD COLUMN tax_policy_version varchar(80);
ALTER TABLE app.customer_credit_note ADD COLUMN approved_at timestamptz;
ALTER TABLE app.customer_credit_note ADD CONSTRAINT customer_credit_note_signed_amount_ck
 CHECK(net_pence<0 AND tax_pence<=0 AND total_pence=net_pence+tax_pence AND amount_pence=-total_pence);

-- SECURITY DEFINER runs as the FORCE-RLS table owner. Keep its exact table surface visible.
ALTER POLICY tenant_isolation ON app.customer_invoice TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER POLICY tenant_isolation ON app.customer_credit_note TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER POLICY tenant_isolation ON app.customer_payment TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER POLICY tenant_isolation ON app.command_receipt TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER POLICY tenant_isolation ON app.decision TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER POLICY tenant_isolation ON app.decision_resolution TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER POLICY tenant_isolation ON app.action_authorization TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

CREATE FUNCTION app.issue_practice_customer_credit_note(
 p_tenant uuid,p_job uuid,p_invoice uuid,p_actor uuid,p_command uuid,p_net_pence bigint,p_reason text,p_preview_hash text
) RETURNS TABLE(credit_note_id uuid,credit_number text,pdf_sha256 text,total_pence bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE inv app.customer_invoice%ROWTYPE; prior jsonb; credited bigint; tax bigint; gross bigint; paid bigint;
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
 SELECT COALESCE(sum(amount_pence),0) INTO credited FROM app.customer_credit_note WHERE tenant_id=p_tenant AND invoice_id=p_invoice;
 expected_preview:=encode(public.digest(convert_to(p_job::text||p_invoice::text||p_net_pence::text||credited::text||btrim(inv.pdf_sha256),'UTF8'),'sha256'),'hex');
 IF p_preview_hash<>expected_preview THEN RAISE EXCEPTION 'STALE_CREDIT_PREVIEW'; END IF;
 tax:=(p_net_pence+2)/5; -- positive half-up 20%; stored below with the correcting sign
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
ALTER FUNCTION app.issue_practice_customer_credit_note(uuid,uuid,uuid,uuid,uuid,bigint,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.issue_practice_customer_credit_note(uuid,uuid,uuid,uuid,uuid,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.issue_practice_customer_credit_note(uuid,uuid,uuid,uuid,uuid,bigint,text,text) TO jobguard_runtime;
COMMIT;
