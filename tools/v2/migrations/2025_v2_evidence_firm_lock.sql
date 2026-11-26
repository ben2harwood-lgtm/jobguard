-- V2 photo lock (Ben, 25 Nov: "lock photos"). Local practice only.
-- 2001 limits the job and quote graph to the signed-in practice firm, but the
-- evidence and photo tables kept tenant isolation only. V2 practice firms share
-- one backing tenant, so a second firm could read another firm's photo rows and
-- bytes. Add the same restrictive firm rule: a row is visible or writable only
-- when its job is visible to the firm (app.job carries 2001's firm policy).
-- No grant changes, no permissive policy, nothing outside the V2 database.
BEGIN;
DO $v2$
DECLARE relation regclass;
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RAISE EXCEPTION 'V2_DATABASE_REQUIRED';
  END IF;

  FOREACH relation IN ARRAY ARRAY[
    'app.evidence_upload', 'app.evidence_object', 'app.synthetic_evidence_original', 'app.evidence_link',
    'app.job_photo_purpose', 'app.evidence_pack', 'app.evidence_pack_revision', 'app.evidence_pack_attachment_approval',
    'app.extra_evidence_pack', 'app.signed_evidence_export', 'app.customer_invoice_evidence', 'app.final_account_proof',
    'app.proof_application_response'
  ]::regclass[] LOOP
    IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = relation AND polname = 'v2_practice_firm') THEN
      EXECUTE format('CREATE POLICY v2_practice_firm ON %s AS RESTRICTIVE FOR ALL TO jobguard_runtime
        USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (%s.tenant_id, %s.job_id)))
        WITH CHECK (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (%s.tenant_id, %s.job_id)))',
        relation, relation, relation, relation, relation);
    END IF;
  END LOOP;

  -- These two carry no job_id: reach the job through the evidence or the upload.
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.evidence_invalidation'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.evidence_invalidation AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.evidence_object e WHERE (e.tenant_id, e.id) = (evidence_invalidation.tenant_id, evidence_invalidation.evidence_id)))
      WITH CHECK (EXISTS (SELECT FROM app.evidence_object e WHERE (e.tenant_id, e.id) = (evidence_invalidation.tenant_id, evidence_invalidation.evidence_id)));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.synthetic_evidence_chunk'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.synthetic_evidence_chunk AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.evidence_upload u WHERE (u.tenant_id, u.id) = (synthetic_evidence_chunk.tenant_id, synthetic_evidence_chunk.upload_id)))
      WITH CHECK (EXISTS (SELECT FROM app.evidence_upload u WHERE (u.tenant_id, u.id) = (synthetic_evidence_chunk.tenant_id, synthetic_evidence_chunk.upload_id)));
  END IF;
END
$v2$;
COMMIT;
