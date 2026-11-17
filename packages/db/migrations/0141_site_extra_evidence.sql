BEGIN;
-- ENT-3d: a verified photo and a server-written resident confirmation on a logged site extra.
-- Additive only: five routines in schema app and their EXECUTE grants. No table, column, index, trigger, constraint, policy or table grant.
-- All five are SECURITY INVOKER. The one writer (routine 4) runs with the application login's EXISTING insert rights on the two
-- evidence tables; no grant is added. Formats: site-extra-content.v1 and resident-confirmation.v1 (docs/contracts/site-extra-evidence-v1.md).

-- 1. The content hash, byte for byte the core function siteExtraContentSha256V1. Reads no table.
CREATE FUNCTION app.ent3d_content_sha256(p_job uuid, p_description text, p_note text, p_photo_sha256 text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE framed text;
BEGIN
 IF p_job IS NULL OR p_description IS NULL OR p_note IS NULL THEN RETURN NULL; END IF;
 IF p_photo_sha256 IS NOT NULL AND p_photo_sha256 !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
 framed:='site-extra-content.v1'||chr(10)
  ||'S'||octet_length(convert_to(p_job::text,'UTF8'))::text||':'||p_job::text||';'
  ||'S'||octet_length(convert_to(p_description,'UTF8'))::text||':'||p_description||';'
  ||'S'||octet_length(convert_to(p_note,'UTF8'))::text||':'||p_note||';'
  ||(CASE WHEN p_photo_sha256 IS NULL THEN 'N;' ELSE 'S'||octet_length(convert_to(p_photo_sha256,'UTF8'))::text||':'||p_photo_sha256||';' END);
 RETURN encode(sha256(convert_to(framed,'UTF8')),'hex');
END $$;

-- 2. The confirmation document, byte for byte the core function residentConfirmationDocumentV1. Reads no table.
CREATE FUNCTION app.ent3d_confirmation_document(p_tenant uuid, p_job uuid, p_confirmation uuid, p_content_sha256 text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF p_tenant IS NULL OR p_job IS NULL OR p_confirmation IS NULL OR p_content_sha256 IS NULL OR p_content_sha256 !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
 RETURN 'jobguard-resident-confirmation.v1'||chr(10)
  ||'tenant:'||p_tenant::text||chr(10)
  ||'job:'||p_job::text||chr(10)
  ||'confirmation:'||p_confirmation::text||chr(10)
  ||'content-format:site-extra-content.v1'||chr(10)
  ||'content-sha256:'||p_content_sha256||chr(10)
  ||'statement:confirmed on the operative''s device; identity not verified'||chr(10);
END $$;

-- 3. The decision. Writes nothing and takes no lock. Always exactly one row. The first failing step decides.
CREATE FUNCTION app.ent3d_site_extra_evidence(p_job uuid, p_description text, p_note text, p_photo uuid, p_confirmation uuid, p_variation uuid)
RETURNS TABLE(decision text, reason_code text, photo_sha256 text, content_sha256 text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_photo_hash text; v_content text; v_document text; v_document_hash text; v_document_length bigint; v_key text;
BEGIN
 BEGIN
  v_tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN v_tenant:=NULL;
 END;
 IF v_tenant IS NULL OR p_job IS NULL OR p_description IS NULL OR p_note IS NULL THEN
  RETURN QUERY SELECT 'photo_refused'::text,'photo_not_accepted'::text,NULL::text,NULL::text; RETURN;
 END IF;
 IF p_photo IS NOT NULL THEN
  SELECT e.sha256::text INTO v_photo_hash FROM app.evidence_object e
   JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
   WHERE e.tenant_id=v_tenant AND e.id=p_photo AND e.job_id=p_job AND e.kind='original' AND e.evidence_type='site_photo'
    AND e.content_type IN('image/jpeg','image/png','image/webp')
    AND u.job_id=p_job AND u.state='verified' AND u.object_version_id IS NOT NULL AND u.object_version_id=e.object_version_id
    AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=e.tenant_id AND i.evidence_id=e.id);
  IF NOT FOUND THEN
   RETURN QUERY SELECT 'photo_refused'::text,'photo_not_accepted'::text,NULL::text,NULL::text; RETURN;
  END IF;
 END IF;
 v_content:=app.ent3d_content_sha256(p_job,p_description,p_note,v_photo_hash);
 IF v_content IS NULL THEN
  RETURN QUERY SELECT 'photo_refused'::text,'photo_not_accepted'::text,NULL::text,NULL::text; RETURN;
 END IF;
 IF p_confirmation IS NOT NULL THEN
  v_document:=app.ent3d_confirmation_document(v_tenant,p_job,p_confirmation,v_content);
  v_document_hash:=encode(sha256(convert_to(v_document,'UTF8')),'hex');
  v_document_length:=octet_length(convert_to(v_document,'UTF8'));
  v_key:='tenants/'||v_tenant::text||'/resident-confirmations/'||p_confirmation::text||'/document';
  IF p_confirmation IS NOT DISTINCT FROM p_photo OR v_document IS NULL OR NOT EXISTS(
   SELECT 1 FROM app.evidence_object c
   JOIN app.evidence_upload cu ON(cu.tenant_id,cu.id)=(c.tenant_id,c.upload_id)
   WHERE c.tenant_id=v_tenant AND c.id=p_confirmation AND c.job_id=p_job AND c.upload_id=c.id AND c.scope_item_id IS NULL AND c.original_evidence_id IS NULL
    AND c.kind='original' AND c.evidence_type='resident_confirmation' AND c.content_type='text/plain; charset=utf-8'
    AND c.object_key=v_key AND c.object_version_id='resident-confirmation.v1' AND c.retention_class='standard_evidence' AND c.device_captured_at IS NULL
    AND c.sha256::text=v_document_hash AND c.byte_length=v_document_length
    AND cu.job_id=p_job AND cu.scope_item_id IS NULL AND cu.state='verified' AND cu.rejection_code IS NULL AND cu.object_key=v_key
    AND cu.object_version_id=c.object_version_id AND cu.expected_sha256::text=c.sha256::text AND cu.maximum_bytes=c.byte_length
    AND cu.expected_content_type=c.content_type AND cu.retention_class=c.retention_class AND cu.device_captured_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=c.tenant_id AND i.evidence_id=c.id)
    AND NOT EXISTS(SELECT 1 FROM app.extra_origin o WHERE o.tenant_id=v_tenant AND o.job_id=p_job AND o.resident_confirmation_evidence_id=p_confirmation
     AND o.variation_id IS DISTINCT FROM p_variation)
  ) THEN
   RETURN QUERY SELECT 'confirmation_refused'::text,'confirmation_not_bound'::text,NULL::text,NULL::text; RETURN;
  END IF;
 END IF;
 RETURN QUERY SELECT 'accepted'::text,'accepted'::text,v_photo_hash,v_content;
END $$;

-- 4. The ONLY writer of a confirmation object. It has no parameter for the document, its hash, type, key, label or any time.
CREATE FUNCTION app.ent3d_record_resident_confirmation(p_actor uuid, p_job uuid, p_command uuid, p_confirmation uuid, p_description text, p_note text, p_photo uuid, p_shown_content_sha256 text)
RETURNS TABLE(outcome text, reason_code text, content_sha256 text, document_sha256 text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_authority text; v_decision text; v_content text; v_document text; v_document_hash text; v_document_length bigint; v_key text; v_now timestamptz;
 v_upload_count integer; v_object_count integer; v_same_count integer;
BEGIN
 BEGIN
  v_tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN v_tenant:=NULL;
 END;
 IF v_tenant IS NULL OR p_actor IS NULL OR p_job IS NULL OR p_command IS NULL OR p_confirmation IS NULL OR p_description IS NULL OR p_note IS NULL OR p_shown_content_sha256 IS NULL THEN
  RETURN QUERY SELECT 'refused'::text,'not_permitted'::text,NULL::text,NULL::text; RETURN;
 END IF;
 SELECT a.decision INTO v_authority FROM app.ent3a_extra_authority(p_actor,'LogSiteExtra',p_job) a;
 IF v_authority IS DISTINCT FROM 'allowed' THEN
  RETURN QUERY SELECT 'refused'::text,'not_permitted'::text,NULL::text,NULL::text; RETURN;
 END IF;
 SELECT d.decision,d.content_sha256 INTO v_decision,v_content FROM app.ent3d_site_extra_evidence(p_job,p_description,p_note,p_photo,NULL,NULL) d;
 IF v_decision IS DISTINCT FROM 'accepted' OR v_content IS NULL THEN
  RETURN QUERY SELECT 'refused'::text,'photo_not_accepted'::text,NULL::text,NULL::text; RETURN;
 END IF;
 IF p_shown_content_sha256 IS DISTINCT FROM v_content THEN
  RETURN QUERY SELECT 'refused'::text,'confirmation_mismatch'::text,NULL::text,NULL::text; RETURN;
 END IF;
 -- Two identical calls run one after the other.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ent3d-resident-confirmation:'||v_tenant::text||':'||p_confirmation::text,0));
 v_document:=app.ent3d_confirmation_document(v_tenant,p_job,p_confirmation,v_content);
 v_document_hash:=encode(sha256(convert_to(v_document,'UTF8')),'hex');
 v_document_length:=octet_length(convert_to(v_document,'UTF8'));
 v_key:='tenants/'||v_tenant::text||'/resident-confirmations/'||p_confirmation::text||'/document';
 SELECT count(*)::integer INTO v_upload_count FROM app.evidence_upload u WHERE u.tenant_id=v_tenant AND u.id=p_confirmation;
 SELECT count(*)::integer INTO v_object_count FROM app.evidence_object c WHERE c.tenant_id=v_tenant AND c.id=p_confirmation;
 IF v_upload_count>0 OR v_object_count>0 THEN
  SELECT count(*)::integer INTO v_same_count FROM app.evidence_object c
   JOIN app.evidence_upload cu ON(cu.tenant_id,cu.id)=(c.tenant_id,c.upload_id)
   WHERE c.tenant_id=v_tenant AND c.id=p_confirmation AND c.job_id=p_job AND c.upload_id=c.id AND c.scope_item_id IS NULL AND c.original_evidence_id IS NULL
    AND c.kind='original' AND c.evidence_type='resident_confirmation' AND c.content_type='text/plain; charset=utf-8'
    AND c.object_key=v_key AND c.object_version_id='resident-confirmation.v1' AND c.retention_class='standard_evidence' AND c.device_captured_at IS NULL
    AND c.sha256::text=v_document_hash AND c.byte_length=v_document_length
    AND cu.job_id=p_job AND cu.scope_item_id IS NULL AND cu.state='verified' AND cu.rejection_code IS NULL AND cu.object_key=v_key
    AND cu.object_version_id=c.object_version_id AND cu.expected_sha256::text=c.sha256::text AND cu.maximum_bytes=c.byte_length
    AND cu.expected_content_type=c.content_type AND cu.retention_class=c.retention_class AND cu.device_captured_at IS NULL;
  IF v_same_count=1 AND v_upload_count=1 AND v_object_count=1 THEN
   RETURN QUERY SELECT 'existing'::text,'existing'::text,v_content,v_document_hash; RETURN;
  END IF;
  RETURN QUERY SELECT 'conflict'::text,'conflict'::text,NULL::text,NULL::text; RETURN;
 END IF;
 -- That command id has already been used without this confirmation. This only reads whether the id was used; the replay rules stay in the extra's own command.
 IF EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=v_tenant AND r.command_id=p_command) THEN
  RETURN QUERY SELECT 'conflict'::text,'conflict'::text,NULL::text,NULL::text; RETURN;
 END IF;
 v_now:=pg_catalog.clock_timestamp();
 INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,rejection_code,object_version_id,device_captured_at,server_received_at,server_verified_at,expires_at)
  VALUES(p_confirmation,v_tenant,p_job,NULL,v_key,v_document_hash,'text/plain; charset=utf-8',v_document_length,'standard_evidence','verified',NULL,'resident-confirmation.v1',NULL,v_now,v_now,v_now);
 INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,original_evidence_id,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,device_captured_at,server_received_at,server_verified_at)
  VALUES(p_confirmation,v_tenant,p_confirmation,p_job,NULL,'original',NULL,'resident_confirmation',v_key,'resident-confirmation.v1',v_document_hash,v_document_length,'text/plain; charset=utf-8','standard_evidence',NULL,v_now,v_now);
 RETURN QUERY SELECT 'recorded'::text,'recorded'::text,v_content,v_document_hash;
END $$;

-- 5. The guard that runs inside the extra's own transaction. It decides on what the merged triggers stored, never on what the application passes.
CREATE FUNCTION app.ent3d_require_site_extra_evidence(p_job uuid, p_variation uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_track text; v_provenance text; v_evidence uuid; v_evidence_hash text; v_resident uuid; v_description text; v_note text; v_decision text; v_photo_hash text; v_have_origin boolean; v_have_variation boolean;
BEGIN
 BEGIN
  v_tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN v_tenant:=NULL;
 END;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514'; END IF;
 SELECT o.job_track,o.provenance,o.evidence_id,o.evidence_hash::text,o.resident_confirmation_evidence_id INTO v_track,v_provenance,v_evidence,v_evidence_hash,v_resident
  FROM app.extra_origin o WHERE(o.tenant_id,o.job_id,o.variation_id)=(v_tenant,p_job,p_variation);
 v_have_origin:=FOUND;
 SELECT v.description,v.capture_text INTO v_description,v_note FROM app.variation v WHERE(v.tenant_id,v.job_id,v.id)=(v_tenant,p_job,p_variation);
 v_have_variation:=FOUND;
 IF NOT v_have_origin OR NOT v_have_variation OR v_track IS DISTINCT FROM 'contractor' OR v_provenance IS DISTINCT FROM 'command' THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
 END IF;
 SELECT d.decision,d.photo_sha256 INTO v_decision,v_photo_hash FROM app.ent3d_site_extra_evidence(p_job,v_description,v_note,v_evidence,v_resident,p_variation) d;
 IF v_decision IS DISTINCT FROM 'accepted' OR v_photo_hash IS DISTINCT FROM v_evidence_hash THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
 END IF;
END $$;

ALTER FUNCTION app.ent3d_content_sha256(uuid,text,text,text) OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3d_confirmation_document(uuid,uuid,uuid,text) OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3d_site_extra_evidence(uuid,text,text,uuid,uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3d_record_resident_confirmation(uuid,uuid,uuid,uuid,text,text,uuid,text) OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3d_require_site_extra_evidence(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ent3d_content_sha256(uuid,text,text,text),
 app.ent3d_confirmation_document(uuid,uuid,uuid,text),
 app.ent3d_site_extra_evidence(uuid,text,text,uuid,uuid,uuid),
 app.ent3d_record_resident_confirmation(uuid,uuid,uuid,uuid,text,text,uuid,text),
 app.ent3d_require_site_extra_evidence(uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ent3d_content_sha256(uuid,text,text,text),
 app.ent3d_confirmation_document(uuid,uuid,uuid,text),
 app.ent3d_site_extra_evidence(uuid,text,text,uuid,uuid,uuid),
 app.ent3d_record_resident_confirmation(uuid,uuid,uuid,uuid,text,text,uuid,text),
 app.ent3d_require_site_extra_evidence(uuid,uuid) TO jobguard_runtime;
COMMIT;
