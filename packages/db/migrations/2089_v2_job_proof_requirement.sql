-- Q81 / V2-AUTH-1. A linked V2 builder can read a job's proof requirement.
-- Main's app.job_proof_requirement (0734) asks app.lp6_session_authority for a home practice-session
-- digest, which a linked V2 session never has, so it refuses the linked builder by design. This
-- migration leaves 0734, lp6 and their grants unchanged and adds a V2-owned, read-only reader.
BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;

  -- Mirror of 0734 job_proof_requirement (and the read_job_proof_statement it calls); parity test
  -- "AUTH-1 parity" in tools/v2/seed.integration.test.mjs. The body copies main's one for one. Only
  -- the authority differs: 0734's job_proof_authority (the home session digest through lp6) is
  -- replaced by V2's verified linked path. The caller's credential must resolve through
  -- app.v2_work_plan_editor, and the job must belong to that firm through the same owned-job walk
  -- 0734 uses (the firm's own jobs and the jobs imported from them). v2_work_plan_editor goes through
  -- app.linked_practice_authority, which refuses a revoked or expired credential, namespace session
  -- or parent sign-in, and requires the bound firm. That takes the place of 0734's membership check:
  -- the linked owner membership lives in the builder's own tenant, not the practice tenant.
  -- Reads only; no row is written.
  CREATE OR REPLACE FUNCTION app.v2_job_proof_requirement(credential_digest text, j uuid, r uuid DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET timezone = 'UTC'
  AS $fn$
  DECLARE
    t uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
    a uuid; firm text; d text; owned boolean; s app.job_proof_statement; uploaded boolean; locked boolean;
  BEGIN
    IF t IS NULL OR j IS NULL OR credential_digest IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
    -- V2 authority, in place of 0734's job_proof_authority.
    a := app.v2_work_plan_editor(credential_digest);
    firm := app.current_firm_profile_key();
    IF a IS NULL OR firm IS NULL OR left(firm, 9) <> 'practice:' OR t IS DISTINCT FROM app.lp11_policy_tenant()
    THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
    d := substr(firm, 10);
    WITH RECURSIVE owned_job(id) AS (
      SELECT id FROM app.job WHERE tenant_id = t AND practice_session_digest = d
      UNION
      SELECT next_job.id FROM owned_job source JOIN app.job next_job ON next_job.tenant_id = t
        AND next_job.provenance = 'imported' AND next_job.practice_session_digest IS NULL
      WHERE EXISTS (SELECT 1 FROM app.job_import_v3 i WHERE i.tenant_id = t AND i.job_id = next_job.id AND i.source_job_id = source.id)
      OR EXISTS (SELECT 1 FROM app.imported_job_baseline ib
        JOIN app.job_party_binding imported ON (imported.tenant_id, imported.job_id, imported.id) = (ib.tenant_id, ib.job_id, ib.party_binding_id)
        JOIN app.job_party_binding origin ON origin.tenant_id = t AND origin.job_id = source.id
          AND origin.customer_revision_id = imported.customer_revision_id AND origin.site_revision_id = imported.site_revision_id
          AND origin.paying_party_revision_id = imported.paying_party_revision_id
        WHERE ib.tenant_id = t AND ib.job_id = next_job.id AND NOT EXISTS (SELECT 1 FROM app.job_import_v3 i WHERE i.tenant_id = t AND i.job_id = next_job.id)
          AND EXISTS (SELECT 1 FROM app.command_receipt rc WHERE rc.tenant_id = t AND rc.command_type = 'job.adopt_in_flight' AND rc.status = 'succeeded'
            AND rc.semantic_key = 'import:' || next_job.id::text AND rc.result->>'jobId' = next_job.id::text AND rc.result->>'sourceJobId' = source.id::text))
    ) SELECT EXISTS (SELECT 1 FROM owned_job WHERE id = j) INTO owned;
    IF NOT owned THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = '42501'; END IF;
    -- From here on, 0734's body. job_proof_requirement: with no statement for the job (or the
    -- revision), the default requirement.
    IF NOT EXISTS (SELECT 1 FROM app.job_proof_statement WHERE tenant_id = t AND job_id = j)
      AND NOT EXISTS (SELECT 1 FROM app.final_account_proof_statement WHERE tenant_id = t AND job_id = j AND revision_id = r)
    THEN
      RETURN jsonb_build_object('statement', NULL, 'requiredEvidenceType', 'electrical_certificate', 'stage', 'electrical-stage',
        'canChange', NOT EXISTS (SELECT 1 FROM app.evidence_upload WHERE tenant_id = t AND job_id = j AND scope_item_id IS NOT NULL AND expected_content_type <> 'audio/wav')
          AND NOT EXISTS (SELECT 1 FROM app.stage_completion WHERE tenant_id = t AND job_id = j)
          AND NOT EXISTS (SELECT 1 FROM app.final_account_lock WHERE tenant_id = t AND job_id = j), 'blockage', NULL);
    END IF;
    -- read_job_proof_statement.
    IF r IS NULL THEN
      SELECT * INTO s FROM app.job_proof_statement WHERE tenant_id = t AND job_id = j ORDER BY revision DESC LIMIT 1;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM app.final_account_revision WHERE tenant_id = t AND job_id = j AND id = r) THEN
        RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = '42501'; END IF;
      IF EXISTS (SELECT 1 FROM app.final_account_proof_statement b JOIN app.final_account_revision rev
        ON (rev.tenant_id, rev.job_id, rev.id) = (b.tenant_id, b.job_id, b.revision_id)
        WHERE b.tenant_id = t AND b.job_id = j AND b.revision_id = r AND b.source_hash IS DISTINCT FROM rev.source_hash)
      THEN RAISE EXCEPTION 'PROOF_SCHEMA_INCONSISTENT' USING ERRCODE = '23514'; END IF;
      SELECT st.* INTO s FROM app.final_account_proof_statement b JOIN app.job_proof_statement st
        ON (st.tenant_id, st.job_id, st.id) = (b.tenant_id, b.job_id, b.statement_id) WHERE b.tenant_id = t AND b.job_id = j AND b.revision_id = r;
    END IF;
    SELECT EXISTS (SELECT 1 FROM app.evidence_upload WHERE tenant_id = t AND job_id = j AND scope_item_id IS NOT NULL AND expected_content_type <> 'audio/wav') INTO uploaded;
    SELECT EXISTS (SELECT 1 FROM app.final_account_lock WHERE tenant_id = t AND job_id = j) INTO locked;
    RETURN jsonb_build_object('statement', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id', s.id, 'includesElectricalWork', s.includes_electrical_work, 'membershipId', s.membership_id, 'recordedAt', s.recorded_at) END,
      'requiredEvidenceType', CASE WHEN s.includes_electrical_work = false THEN 'completion_photo' ELSE 'electrical_certificate' END,
      'stage', CASE WHEN s.includes_electrical_work = false THEN 'completion-photo-stage' ELSE 'electrical-stage' END,
      'canChange', NOT uploaded AND NOT locked AND NOT EXISTS (SELECT 1 FROM app.stage_completion WHERE tenant_id = t AND job_id = j),
      'blockage', NULL);
  END
  $fn$;
  REVOKE ALL ON FUNCTION app.v2_job_proof_requirement(text, uuid, uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_job_proof_requirement(text, uuid, uuid) TO jobguard_runtime;

  -- The site-complete write lands in app.stage_completion (and a rework in app.stage_review_event, which names
  -- both its stage completion and its evidence invalidation; both must be visible to the firm).
  -- Main's tables carried tenant isolation only, so a second firm sharing the practice tenant could
  -- read or write them for this firm's job. Lock them to the firm, as FL-1 and the photo lock do.
  DROP POLICY IF EXISTS v2_practice_firm ON app.stage_completion;
  CREATE POLICY v2_practice_firm ON app.stage_completion AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job jb WHERE (jb.tenant_id, jb.id) = (stage_completion.tenant_id, stage_completion.job_id)))
    WITH CHECK (EXISTS (SELECT FROM app.job jb WHERE (jb.tenant_id, jb.id) = (stage_completion.tenant_id, stage_completion.job_id)));
  DROP POLICY IF EXISTS v2_practice_firm ON app.stage_review_event;
  CREATE POLICY v2_practice_firm ON app.stage_review_event AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.stage_completion sc WHERE (sc.tenant_id, sc.id) = (stage_review_event.tenant_id, stage_review_event.stage_completion_id))
      AND EXISTS (SELECT FROM app.evidence_invalidation ei WHERE (ei.tenant_id, ei.id) = (stage_review_event.tenant_id, stage_review_event.evidence_invalidation_id)))
    WITH CHECK (EXISTS (SELECT FROM app.stage_completion sc WHERE (sc.tenant_id, sc.id) = (stage_review_event.tenant_id, stage_review_event.stage_completion_id))
      AND EXISTS (SELECT FROM app.evidence_invalidation ei WHERE (ei.tenant_id, ei.id) = (stage_review_event.tenant_id, stage_review_event.evidence_invalidation_id)));
END
$v2$;
COMMIT;
