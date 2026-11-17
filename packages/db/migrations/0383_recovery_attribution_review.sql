BEGIN;
-- SV-6 RED: exact owner-only synthetic review. Start from the latest 0340 routine.
CREATE OR REPLACE FUNCTION app.assess_recovery_attribution(p_job uuid,p_session text,p_command jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor record;
 c uuid; prior app.recovery_attribution_command; document jsonb; result jsonb; previous uuid;
 reviewed app.recovery_attribution_revision; live jsonb; artifact_hash text;
 review_id uuid:=gen_random_uuid(); resolution_id uuid:=gen_random_uuid(); authorization_id uuid:=gen_random_uuid(); deadline timestamptz;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Malformed session digests and unversioned/authority-bearing payloads stay closed.
 -- This gate reads no job/hidden data and never substitutes caller facts for stored sources.
 IF p_session IS NULL OR p_session !~ '^[0-9a-f]{64}$'
 OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
 OR p_command->>'version' IS DISTINCT FROM 'recovery-attribution-command.v1'
 OR p_command-(ARRAY['version','action','commandId','caseId','workId','lineId','lockId','expectedCaseRevision','expectedAttributionRevision'] || (CASE WHEN p_command->>'action'='approve_review' THEN ARRAY['assessmentId','expectedSourceHash','reviewArtifactHash'] ELSE ARRAY[]::text[] END))<>'{}'::jsonb
 THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND' USING ERRCODE='0A000'; END IF;
 -- Scope/owner/lock before any hidden source, subject lookup or replay.
 SELECT * INTO actor FROM app.final_check_builder(t,p_job,p_session);
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=p_job AND practice_session_digest=p_session)
 OR NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=p_job)
 THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR p_command->>'version' IS DISTINCT FROM 'recovery-attribution-command.v1'
 OR coalesce(p_command->>'action','') NOT IN('assess','approve_review')
  OR NOT(p_command ?& ARRAY['version','action','commandId','caseId','workId','lineId','lockId','expectedCaseRevision','expectedAttributionRevision'])
 OR coalesce(p_command->>'expectedCaseRevision','') !~ '^[1-9][0-9]*$' OR coalesce(p_command->>'expectedAttributionRevision','') !~ '^(0|[1-9][0-9]*)$'
 THEN RAISE EXCEPTION 'INVALID_RECOVERY_ATTRIBUTION_COMMAND' USING ERRCODE='23514'; END IF;
 IF p_command->>'action'='approve_review' AND (
  NOT(p_command ?& ARRAY['assessmentId','expectedSourceHash','reviewArtifactHash'])
  OR coalesce(p_command->>'assessmentId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR coalesce(p_command->>'expectedSourceHash','') !~ '^[0-9a-f]{64}$'
  OR coalesce(p_command->>'reviewArtifactHash','') !~ '^[0-9a-f]{64}$')
 THEN RAISE EXCEPTION 'INVALID_RECOVERY_ATTRIBUTION_COMMAND' USING ERRCODE='23514'; END IF;
 c:=(p_command->>'caseId')::uuid;
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(c::text));
 -- Shared with the allocator, then append's command lock, before any audit.
 PERFORM pg_advisory_xact_lock(hashtextextended('stored-receipt-lines:'||t::text||':'||p_job::text,0));
 SELECT * INTO actor FROM app.final_check_builder(t,p_job,p_session,true);
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext('attribution-command:'||(p_command->>'commandId')));
 SELECT * INTO actor FROM app.final_check_builder(t,p_job,p_session);
 SELECT * INTO prior FROM app.recovery_attribution_command WHERE tenant_id=t AND command_id=(p_command->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.job_id<>p_job OR prior.actor_membership_id<>actor.member_id OR prior.payload<>p_command
  THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN prior.first_result;
 END IF;
 IF p_command->>'action'='approve_review' THEN
  SELECT * INTO reviewed FROM app.recovery_attribution_revision
   WHERE tenant_id=t AND job_id=p_job AND case_id=c AND work_id=(p_command->>'workId')::uuid
    AND line_id=(p_command->>'lineId')::uuid AND lock_id=(p_command->>'lockId')::uuid
   ORDER BY revision DESC LIMIT 1;
  IF reviewed.id IS DISTINCT FROM (p_command->>'assessmentId')::uuid
   OR reviewed.revision IS DISTINCT FROM (p_command->>'expectedAttributionRevision')::integer
   OR reviewed.case_revision IS DISTINCT FROM (p_command->>'expectedCaseRevision')::integer
   OR reviewed.source_hash IS DISTINCT FROM p_command->>'expectedSourceHash'
  THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_STALE' USING ERRCODE='40001'; END IF;
  -- Reconstruct every conjunct from the same stored sources under the allocator's locks.
  live:=app.recovery_attribution_sources(t,p_job,p_command,actor.member_id);
  IF live->>'sourceHash' IS DISTINCT FROM reviewed.source_hash
   OR (live->>'caseRevision')::integer IS DISTINCT FROM reviewed.case_revision
  THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_STALE' USING ERRCODE='40001'; END IF;
  IF reviewed.document->>'assessmentOutcome' IS DISTINCT FROM 'eligible_for_review'
   OR live->>'assessmentOutcome' IS DISTINCT FROM 'eligible_for_review'
   OR reviewed.document->'reasonCodes' IS DISTINCT FROM '[]'::jsonb OR live->'reasonCodes' IS DISTINCT FROM '[]'::jsonb
   OR (live->'remainingPrincipal'->>'numerator')::numeric<=0
   OR live->'remainingPrincipal' IS DISTINCT FROM reviewed.document->'remainingPrincipal'
   OR (SELECT count(*) FROM jsonb_each(live->'facts'->'facts'))<>10
   OR (SELECT count(*) FROM jsonb_each(reviewed.document->'facts'->'facts'))<>10
   OR EXISTS(SELECT 1 FROM jsonb_each(live->'facts'->'facts') f WHERE f.value->'holds' IS DISTINCT FROM 'true'::jsonb)
   OR EXISTS(SELECT 1 FROM jsonb_each(reviewed.document->'facts'->'facts') f WHERE f.value->'holds' IS DISTINCT FROM 'true'::jsonb)
  THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_REVIEW_EXCLUDED' USING ERRCODE='23514'; END IF;
  -- The entire immutable assessment is the exact review artifact: includes action
  -- subject, principal, source manifest/hash and explicit synthetic policy bundle.
  artifact_hash:=app.final_lock_hash(reviewed.document);
  IF artifact_hash IS DISTINCT FROM p_command->>'reviewArtifactHash'
  THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_REVIEW_ARTIFACT_CHANGED' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM app.recovery_attribution_command q WHERE q.tenant_id=t AND q.assessment_id=reviewed.id AND q.payload->>'action'='approve_review')
  THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_REVIEW_ALREADY_RECORDED' USING ERRCODE='23514'; END IF;
  -- No new expiry duration: the exact synthetic review cannot outlive the
  -- existing authenticated session or membership. No standing/fee authority.
  SELECT least(s.expires_at,m.expires_at) INTO deadline FROM control_plane.practice_session s
   JOIN app.membership m ON m.tenant_id=t AND m.id=actor.member_id WHERE s.token_digest=p_session;
  IF deadline IS NULL OR deadline<=clock_timestamp() THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
   VALUES(review_id,t,'recovery_attribution',reviewed.id::text,'recovery.attribution_review');
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)
   VALUES(resolution_id,t,review_id,'approved',actor.member_id);
  INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at)
   VALUES(authorization_id,t,review_id,resolution_id,actor.member_id,'recovery.attribution_review',reviewed.id::text,artifact_hash,reviewed.revision,reviewed.document->>'eligibilityPolicyVersion',deadline);
  result:=jsonb_build_object('version','recovery-attribution-review-result.v1','environment','synthetic_demo','productionEnabled',false,'realExternalActions',0,
   'reviewId',review_id,'assessmentId',reviewed.id,'assessmentRevision',reviewed.revision,'sourceRevision',reviewed.document->>'sourceRevision',
   'sourceHash',reviewed.source_hash,'reviewAuthorizationId',authorization_id,'reviewArtifactHash',artifact_hash,'commandId',p_command->>'commandId','effect','review_recorded');
  INSERT INTO app.recovery_attribution_command(tenant_id,command_id,job_id,actor_membership_id,assessment_id,case_id,work_id,line_id,lock_id,payload,first_result)
   VALUES(t,(p_command->>'commandId')::uuid,p_job,actor.member_id,reviewed.id,c,reviewed.work_id,reviewed.line_id,reviewed.lock_id,p_command,result);
  PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor.member_id::text,p_job,'recovery.attribution_reviewed',
   jsonb_build_object('commandId',p_command->>'commandId','assessmentId',reviewed.id,'reviewId',review_id,'authorizationId',authorization_id,'reviewArtifactHash',artifact_hash));
  RETURN result;
 END IF;
 document:=app.recovery_attribution_sources(t,p_job,p_command,actor.member_id);
 previous:=(document->>'previousAssessmentId')::uuid;
 result:=app.append_recovery_attribution(document,actor.member_id,p_command,CASE WHEN previous IS NOT NULL THEN 'source_changed' END,CASE WHEN previous IS NOT NULL THEN document->>'sourceHash' END);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor.member_id::text,p_job,'recovery.attribution_assessed',
  jsonb_build_object('commandId',p_command->>'commandId','assessmentId',document->>'assessmentId','caseId',c,'sourceHash',document->>'sourceHash'));
 RETURN result;
END $$;
COMMIT;
