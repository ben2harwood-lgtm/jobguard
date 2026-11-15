BEGIN;
-- Forward fix only; no backfill. Preserve immutable snapshots and replay.
CREATE OR REPLACE FUNCTION app.store_extra_pack_artifact(p_command uuid,p_job uuid,p_extra uuid,p_digest text,p_artifact jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=app.current_tenant(); actor uuid:=app.current_actor(); prior app.command_receipt;
 request_hash text; pack uuid; result jsonb; source jsonb; entry jsonb; manifest jsonb;
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' OR t IS NULL OR actor IS NULL
  OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'EXTRA_PACK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_command IS NULL OR p_job IS NULL OR p_extra IS NULL OR p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'EXTRA_PACK_INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_job::text,417));
 IF app.xa_covers(actor,ARRAY['surveyor','commercial_manager'],p_job,'job.read') IS NULL
  OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=p_job AND job_track='contractor' AND environment='synthetic_demo')
  OR NOT EXISTS(SELECT 1 FROM app.extra_origin WHERE tenant_id=t AND job_id=p_job AND variation_id=p_extra AND job_track='contractor' AND provenance='command') THEN
  RAISE EXCEPTION 'EXTRA_PACK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_command::text,863));
 request_hash:=encode(sha256(convert_to(jsonb_build_array('create-extra-evidence-pack.v1',p_job,p_extra,p_digest,actor)::text,'UTF8')),'hex');
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF FOUND THEN
  IF prior.command_type IS DISTINCT FROM 'CreateExtraEvidencePack' OR prior.request_hash::text IS DISTINCT FROM request_hash
   OR prior.actor_membership_id IS DISTINCT FROM actor OR prior.status IS DISTINCT FROM 'succeeded' THEN
   RAISE EXCEPTION 'EXTRA_PACK_COMMAND_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN prior.result;
 END IF;
 IF p_artifact IS NULL THEN RETURN NULL; END IF;
 manifest:=p_artifact->'integrity'->'manifest';
 IF coalesce(p_artifact->>'version'='extra-source-pack.v1' AND p_artifact->'completeApprovalPack'='false'::jsonb
  AND p_artifact->'subject'=jsonb_build_object('kind','extra','jobId',p_job,'extraId',p_extra)
  AND manifest->>'jobId'=p_job::text AND manifest->>'caseId'='extra:'||p_extra::text
  AND manifest->'omissions' @> '["Client access HELD","Export and send HELD"]'::jsonb
  AND jsonb_typeof(manifest->'entries')='array' AND jsonb_array_length(manifest->'entries')>0
  AND jsonb_typeof(p_artifact->'integrity'->'sources')='array',false) IS NOT TRUE THEN
  RAISE EXCEPTION 'EXTRA_PACK_INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 IF encode(sha256(convert_to(app.final_lock_canonical(manifest),'UTF8')),'hex') IS DISTINCT FROM p_digest THEN
  RAISE EXCEPTION 'EXTRA_PACK_DIGEST_MISMATCH' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(manifest->'entries')<>jsonb_array_length(p_artifact->'integrity'->'sources') THEN
  RAISE EXCEPTION 'EXTRA_PACK_INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 -- LATER-SAFETY-146: each identity pair must occur once in each array.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(manifest->'entries') e
   GROUP BY e->>'sourceId',e->'version' HAVING count(*)>1)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_artifact->'integrity'->'sources') s
   GROUP BY s->>'sourceId',s->'version' HAVING count(*)>1)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_artifact->'integrity'->'sources') s
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(manifest->'entries') e
    WHERE e->>'sourceId'=s->>'sourceId' AND e->'version'=s->'version')) THEN
  RAISE EXCEPTION 'EXTRA_PACK_INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 -- End LATER-SAFETY-146 validation.
 FOR entry IN SELECT value FROM jsonb_array_elements(manifest->'entries') LOOP
  SELECT value INTO source FROM jsonb_array_elements(p_artifact->'integrity'->'sources')
   WHERE value->>'sourceId'=entry->>'sourceId' AND value->'version'=entry->'version';
  IF source IS NULL OR source->>'jobId' IS DISTINCT FROM p_job::text OR source->'kind' IS DISTINCT FROM entry->'kind'
   OR source->'label' IS DISTINCT FROM entry->'label' OR entry->>'contentHash' IS DISTINCT FROM encode(sha256(convert_to(source->>'content','UTF8')),'hex') THEN
   RAISE EXCEPTION 'EXTRA_PACK_INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 END LOOP;
 pack:=gen_random_uuid();
 result:=jsonb_build_object('version','extra-evidence-pack-stored.v1','packId',pack,'manifestDigest',p_digest,'contentVersion','extra-source-pack.v1');
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(t,p_command,'CreateExtraEvidencePack','extra-pack:'||p_command::text,request_hash,'succeeded',result,actor,clock_timestamp());
 INSERT INTO app.extra_evidence_pack(tenant_id,id,job_id,variation_id,command_id,actor_membership_id,subject_hash)
 VALUES(t,pack,p_job,p_extra,p_command,actor,repeat('0',64));
 INSERT INTO app.extra_pack_artifact(tenant_id,job_id,variation_id,pack_id,actor_membership_id,command_id,content_version,manifest_digest,artifact,source_references)
 VALUES(t,p_job,p_extra,pack,actor,p_command,'extra-source-pack.v1',p_digest,p_artifact,manifest->'entries');
 -- Last lock is the audit head; no business lock is acquired after sealing.
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
  'actorRef','membership:'||actor::text,'eventType','extra.evidence_pack.stored','subjectType','extra','subjectRef',p_extra::text,
  'payload',jsonb_build_object('references',jsonb_build_object('commandId',p_command,'jobId',p_job,'packId',pack),
   'hashes',jsonb_build_object('manifest',p_digest)))),'checked_operation');
 RETURN result;
END $$;
COMMIT;
