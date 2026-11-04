BEGIN;
-- Read-only projection. Reuse the observation command's exact scoped/live authority,
-- including current session, membership, grants and contractor entitlement.
CREATE FUNCTION app.contractor_job_evidence_read(p_session uuid,p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; answer jsonb;
BEGIN
 PERFORM app.lp_authority(p_session,p_job,'resolve');
 SELECT jsonb_build_object('version','observation-evidence.v1','items',coalesce(jsonb_agg(
  jsonb_build_object('evidenceId',e.id,'sha256',e.sha256,'objectVersion',e.object_version_id,
   'mediaKind',e.evidence_type,'photoTags',CASE WHEN e.evidence_type='completion_photo' THEN
    coalesce(app.lp_png_completion_tags(o.bytes),'[]'::jsonb) ELSE '[]'::jsonb END,
   'capturedAt',e.device_captured_at) ORDER BY e.id),'[]'::jsonb)) INTO answer
 FROM app.evidence_object e
 JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
 LEFT JOIN app.synthetic_evidence_original o ON(o.tenant_id,o.job_id,o.upload_id,o.object_key,o.object_version_id)=
  (e.tenant_id,e.job_id,e.upload_id,e.object_key,e.object_version_id)
  AND o.environment='synthetic_demo' AND o.content_type='image/png'
  AND octet_length(o.bytes)=e.byte_length AND encode(sha256(o.bytes),'hex')=e.sha256
 WHERE e.tenant_id=t AND e.job_id=p_job AND e.kind='original'
 AND e.evidence_type IN('completion_photo','completion_note') AND u.state='verified'
 AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE(i.tenant_id,i.evidence_id)=(e.tenant_id,e.id));
 RETURN answer;
END $$;
ALTER FUNCTION app.contractor_job_evidence_read(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.contractor_job_evidence_read(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.contractor_job_evidence_read(uuid,uuid) TO jobguard_runtime;
COMMIT;
