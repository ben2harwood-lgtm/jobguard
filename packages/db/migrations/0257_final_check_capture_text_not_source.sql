BEGIN;
-- SV-5: the job's own walk-it capture text is builder capture (the baseline's origin, AGENTS 5.14), not
-- evidence the Final Check processes. 0238 froze it as a non-processable 'unlinked_capture_source', and
-- completion needs every source processable, so no job created through capture could ever complete.
-- Restated from 0238 with that one source removed; every other inventory source, the completion gate
-- and already-frozen manifests are unchanged.
CREATE OR REPLACE FUNCTION app.final_check_freeze_processing_inventory() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE t uuid:=NEW.tenant_id;j uuid:=NEW.job_id;mid uuid:=NEW.id;l app.final_account_lock;inventory jsonb;entry jsonb;
BEGIN
 IF NEW.manifest_hash IS NULL THEN RETURN NEW; END IF;
 PERFORM app.final_check_worker(t,j);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j AND id=NEW.lock_id;
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'source_ref',x->>'kind'),'[]') INTO inventory FROM (
  SELECT jsonb_build_object('source_ref',e.id,'kind',e.evidence_type,'evidence_id',e.id,'object_version_id',e.object_version_id,'sha256',e.sha256,'received_at',e.server_received_at,
   'processable',NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.id) AND NOT EXISTS(SELECT 1 FROM app.job imported WHERE imported.tenant_id=t AND imported.id=j AND imported.provenance='imported'),'input',to_jsonb(e)) x
  FROM app.final_check_manifest_source ms JOIN app.evidence_object e ON (e.tenant_id,e.job_id,e.id)=(ms.tenant_id,ms.job_id,ms.evidence_id) WHERE ms.tenant_id=t AND ms.job_id=j AND ms.manifest_id=mid AND ms.excluded_state IS NULL AND e.tenant_id=t AND e.job_id=j AND e.kind='original' AND e.server_received_at<=l.locked_at AND EXISTS(SELECT 1 FROM app.evidence_upload u WHERE u.tenant_id=t AND u.job_id=j AND u.id=e.upload_id AND u.state='verified')
  UNION ALL SELECT jsonb_build_object('source_ref',u.id,'kind','pending_upload','evidence_id',NULL,'object_version_id',NULL,'sha256',NULL,'received_at',u.server_received_at,'processable',false,'input',to_jsonb(u))
  FROM app.final_check_manifest_source ms JOIN app.evidence_upload u ON (u.tenant_id,u.job_id,u.id)=(ms.tenant_id,ms.job_id,ms.upload_id) WHERE ms.tenant_id=t AND ms.job_id=j AND ms.manifest_id=mid AND ms.excluded_state IS NULL AND (ms.evidence_id IS NULL OR ms.evidence_received_at>l.locked_at)
  UNION ALL SELECT jsonb_build_object('source_ref',v.id,'kind','unlinked_supplier_version','evidence_id',NULL,'object_version_id',NULL,'sha256',NULL,'received_at',v.created_at,'processable',false,'input',to_jsonb(v))
  FROM app.supplier_document_version v WHERE v.tenant_id=t AND v.job_id=j AND v.created_at<=l.locked_at
  UNION ALL SELECT jsonb_build_object('source_ref',d.id,'kind','unlinked_supplier_document','evidence_id',NULL,'object_version_id',NULL,'sha256',NULL,'received_at',d.created_at,'processable',false,'input',to_jsonb(d))
  FROM app.supplier_document d WHERE d.tenant_id=t AND d.job_id=j AND d.created_at<=l.locked_at AND NOT EXISTS(SELECT 1 FROM app.supplier_document_version v WHERE v.tenant_id=t AND v.job_id=j AND v.document_id=d.id AND v.created_at<=l.locked_at)
  UNION ALL SELECT jsonb_build_object('source_ref',v.id,'kind','unlinked_purchase_order','evidence_id',NULL,'object_version_id',NULL,'sha256',NULL,'received_at',v.created_at,'processable',false,'input',to_jsonb(v))
  FROM app.purchase_order_revision v WHERE v.tenant_id=t AND v.job_id=j AND v.created_at<=l.locked_at
 ) sources;
 NEW.manifest_hash:=app.final_lock_hash(jsonb_build_object('lock',l.snapshot_digest,'cutoff',l.locked_at,'detector',NEW.detector_version,'policy',NEW.policy_version,'sources',inventory,'comparisons',NEW.frozen_comparisons));
 NEW.processing_source_count:=jsonb_array_length(inventory);
 FOR entry IN SELECT value FROM jsonb_array_elements(inventory) LOOP
  INSERT INTO app.final_check_processing_source(tenant_id,job_id,manifest_id,id,source_kind,source_ref,evidence_id,object_version_id,sha256,source_received_at,adapter_version,input_hash,processable,frozen_input)
  VALUES(t,j,mid,gen_random_uuid(),entry->>'kind',(entry->>'source_ref')::uuid,(entry->>'evidence_id')::uuid,entry->>'object_version_id',entry->>'sha256',(entry->>'received_at')::timestamptz,'synthetic-observation.v1',app.final_lock_hash(entry->'input'),(entry->>'processable')::boolean,entry->'input');
 END LOOP;
 RETURN NEW;
END $$;
COMMIT;
