BEGIN;
-- Metadata only: FORCE RLS permits byte reads on the ordinary runtime connection,
-- not this definer. Both projections recheck the observation command's authority.
CREATE FUNCTION app.contractor_job_evidence_read(p_session uuid,p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; answer jsonb;
BEGIN
 PERFORM app.lp_authority(p_session,p_job,'resolve');
 SELECT jsonb_build_object('version','observation-evidence.v1','items',coalesce(jsonb_agg(
  jsonb_build_object('evidenceId',e.id,'sha256',e.sha256,'objectVersion',e.object_version_id,
   'mediaKind',e.evidence_type,'contentType',e.content_type,
   'capturedAt',e.device_captured_at) ORDER BY e.id),'[]'::jsonb)) INTO answer
 FROM app.evidence_object e
 JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
 WHERE e.tenant_id=t AND e.job_id=p_job AND e.kind='original'
 AND e.evidence_type IN('completion_photo','completion_note') AND u.state='verified'
 AND e.server_verified_at IS NOT NULL AND u.server_verified_at IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE(i.tenant_id,i.evidence_id)=(e.tenant_id,e.id));
 RETURN answer;
END $$;
ALTER FUNCTION app.contractor_job_evidence_read(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.contractor_job_evidence_read(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.contractor_job_evidence_read(uuid,uuid) TO jobguard_runtime;

-- A runtime-read preimage is independently bound to finalized metadata, just as
-- lp_command does. No original-table grant or policy is added to the definer.
CREATE FUNCTION app.contractor_completion_photo_tags(p_session uuid,p_job uuid,p_evidence uuid,p_sha256 text,p_version text,p_bytes bytea) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; original_bytes bytea;
BEGIN
 PERFORM app.lp_authority(p_session,p_job,'resolve');
 SELECT p_bytes INTO original_bytes
 FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
 WHERE e.tenant_id=t AND e.job_id=p_job AND e.id=p_evidence AND e.sha256=p_sha256 AND e.object_version_id=p_version
 AND e.kind='original' AND e.evidence_type='completion_photo' AND e.content_type='image/png'
 AND e.server_verified_at IS NOT NULL AND u.state='verified' AND u.server_verified_at IS NOT NULL
 AND octet_length(p_bytes)=e.byte_length AND encode(sha256(p_bytes),'hex')=e.sha256
 AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE(i.tenant_id,i.evidence_id)=(e.tenant_id,e.id));
 IF original_bytes IS NULL THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
 RETURN coalesce(app.lp_png_completion_tags(original_bytes),'[]'::jsonb);
END $$;
ALTER FUNCTION app.contractor_completion_photo_tags(uuid,uuid,uuid,text,text,bytea) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.contractor_completion_photo_tags(uuid,uuid,uuid,text,text,bytea) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.contractor_completion_photo_tags(uuid,uuid,uuid,text,text,bytea) TO jobguard_runtime;
COMMIT;
