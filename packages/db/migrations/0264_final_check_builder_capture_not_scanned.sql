BEGIN;
-- SV-5 (Ben, 28 Oct: "Yes, builder capture"): the job's own walk-it capture text is builder capture and the
-- baseline's origin (AGENTS 5.14), not evidence to scan. 0238 froze it as a non-processable
-- 'unlinked_capture_source', and completion needed every source processable, so no captured job could complete.
-- It stays in the frozen inventory, now explicitly as 'builder_capture_not_scanned', so a completed check still
-- lists it; completion exempts only that kind. Three routines restated from 0238 with only those changes.
-- Every other source and already-frozen manifests are unchanged.

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
  UNION ALL SELECT DISTINCT jsonb_build_object('source_ref',c.id,'kind','builder_capture_not_scanned','evidence_id',NULL,'object_version_id',NULL,'sha256',NULL,'received_at',c.created_at,'processable',false,'input',to_jsonb(c))
  FROM app.capture_source c JOIN app.job_record_proposal p ON(p.tenant_id,p.source_id)=(c.tenant_id,c.id) WHERE p.tenant_id=t AND p.job_id=j AND c.created_at<=l.locked_at AND p.created_at<=l.locked_at
 ) sources;
 NEW.manifest_hash:=app.final_lock_hash(jsonb_build_object('lock',l.snapshot_digest,'cutoff',l.locked_at,'detector',NEW.detector_version,'policy',NEW.policy_version,'sources',inventory,'comparisons',NEW.frozen_comparisons));
 NEW.processing_source_count:=jsonb_array_length(inventory);
 FOR entry IN SELECT value FROM jsonb_array_elements(inventory) LOOP
  INSERT INTO app.final_check_processing_source(tenant_id,job_id,manifest_id,id,source_kind,source_ref,evidence_id,object_version_id,sha256,source_received_at,adapter_version,input_hash,processable,frozen_input)
  VALUES(t,j,mid,gen_random_uuid(),entry->>'kind',(entry->>'source_ref')::uuid,(entry->>'evidence_id')::uuid,entry->>'object_version_id',entry->>'sha256',(entry->>'received_at')::timestamptz,'synthetic-observation.v1',app.final_lock_hash(entry->'input'),(entry->>'processable')::boolean,entry->'input');
 END LOOP;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.final_check_guard_fact() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE m app.final_check_manifest;l app.final_account_lock;s app.shadow_signal_disposition;c app.shadow_signal_classification;
BEGIN
 IF TG_TABLE_NAME='final_check_processing_source' THEN
  SELECT * INTO m FROM app.final_check_manifest WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.manifest_id;
  IF NOT FOUND OR NEW.source_received_at>m.evidence_cutoff_at OR NEW.input_hash<>app.final_lock_hash(NEW.frozen_input) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  IF NEW.evidence_id IS NULL THEN
   IF NEW.processable OR NOT (
    (NEW.source_kind='pending_upload' AND EXISTS(SELECT 1 FROM app.evidence_upload u WHERE u.tenant_id=NEW.tenant_id AND u.job_id=NEW.job_id AND u.id=NEW.source_ref AND u.server_received_at=NEW.source_received_at AND to_jsonb(u)=NEW.frozen_input)) OR
    (NEW.source_kind='unlinked_supplier_version' AND EXISTS(SELECT 1 FROM app.supplier_document_version v WHERE v.tenant_id=NEW.tenant_id AND v.job_id=NEW.job_id AND v.id=NEW.source_ref AND v.created_at=NEW.source_received_at AND to_jsonb(v)=NEW.frozen_input)) OR
    (NEW.source_kind='unlinked_supplier_document' AND EXISTS(SELECT 1 FROM app.supplier_document v WHERE v.tenant_id=NEW.tenant_id AND v.job_id=NEW.job_id AND v.id=NEW.source_ref AND v.created_at=NEW.source_received_at AND to_jsonb(v)=NEW.frozen_input)) OR
    (NEW.source_kind='unlinked_purchase_order' AND EXISTS(SELECT 1 FROM app.purchase_order_revision v WHERE v.tenant_id=NEW.tenant_id AND v.job_id=NEW.job_id AND v.id=NEW.source_ref AND v.created_at=NEW.source_received_at AND to_jsonb(v)=NEW.frozen_input)) OR
    (NEW.source_kind='builder_capture_not_scanned' AND EXISTS(SELECT 1 FROM app.capture_source v JOIN app.job_record_proposal p ON(p.tenant_id,p.source_id)=(v.tenant_id,v.id) WHERE p.tenant_id=NEW.tenant_id AND p.job_id=NEW.job_id AND v.id=NEW.source_ref AND v.created_at=NEW.source_received_at AND to_jsonb(v)=NEW.frozen_input))
   ) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  ELSIF NEW.evidence_id<>NEW.source_ref OR NOT EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=NEW.tenant_id AND e.job_id=NEW.job_id AND e.id=NEW.evidence_id AND e.kind='original' AND to_jsonb(e)=NEW.frozen_input) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 ELSIF TG_TABLE_NAME='final_check_reveal_proof' THEN
  SELECT * INTO c FROM app.shadow_signal_classification WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.classification_id AND run_id=NEW.run_id AND signal_id=NEW.signal_id;
  SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.lock_id;
  IF c.id IS NULL OR l.id IS NULL OR NEW.capture_register_hash<>l.capture_register_hash OR NEW.line_set_hash<>l.line_set_hash OR NEW.evidence_set_hash<>app.final_lock_hash(NEW.evidence) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 ELSIF TG_TABLE_NAME='final_check_disposition_binding' THEN
  SELECT * INTO s FROM app.shadow_signal_disposition WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.disposition_id AND run_id=NEW.run_id AND signal_id=NEW.signal_id;
  SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.lock_id;
  IF s.id IS NULL OR l.id IS NULL OR s.disposition NOT IN(NEW.answer,'attribution_disputed') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NEW.selected_reference_kind='baseline' AND NOT l.snapshot->'baselineScopeItemIds' ? NEW.selected_reference_id::text THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NEW.selected_reference_kind='line' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(l.snapshot->'lines') line WHERE line.value->>'id'=NEW.selected_reference_id::text) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.complete_final_check(t uuid,j uuid,m uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE manifest app.final_check_manifest;l app.final_account_lock;prior app.final_check_run_binding;item jsonb;sig app.shadow_commercial_signal;refs jsonb;proof jsonb;ev jsonb;digest text;
 run uuid:=gen_random_uuid();event uuid:=gen_random_uuid();classification uuid;chosen_outcome text;next_revision integer;
BEGIN
 PERFORM app.final_check_worker(t,j);
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('shadow-detection:'||t::text||':'||j::text,0));
 SELECT * INTO manifest FROM app.final_check_manifest WHERE tenant_id=t AND job_id=j AND id=m;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF manifest.manifest_hash IS NULL THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'signalId'),'[]') INTO p FROM jsonb_array_elements(p);
 digest:=app.final_lock_hash(p);
 SELECT * INTO prior FROM app.final_check_run_binding WHERE tenant_id=t AND job_id=j AND manifest_id=m;
 IF FOUND THEN IF prior.result_hash<>digest THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;RETURN jsonb_build_object('runId',prior.run_id,'lockId',prior.lock_id,'zeroResult',prior.zero_result); END IF;
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j AND id=manifest.lock_id AND locked_at=manifest.evidence_cutoff_at;
 IF NOT FOUND OR manifest.processing_source_count<>(SELECT count(*) FROM app.final_check_processing_source WHERE tenant_id=t AND job_id=j AND manifest_id=m) THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
 -- The job's own walk-it text is listed as builder capture, not scanned; it is the only entry exempt from processing.
 IF EXISTS(SELECT 1 FROM app.final_check_processing_source s LEFT JOIN LATERAL(SELECT status,input_hash FROM app.final_check_source_attempt WHERE tenant_id=t AND job_id=j AND manifest_id=m AND source_id=s.id ORDER BY sequence DESC LIMIT 1)a ON true
  WHERE s.tenant_id=t AND s.job_id=j AND s.manifest_id=m AND NOT (s.source_kind='builder_capture_not_scanned' AND s.evidence_id IS NULL) AND (a.status IS NULL OR a.status NOT IN('zero_result','detected') OR a.input_hash<>s.input_hash OR NOT s.processable
   OR NOT EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=t AND e.job_id=j AND e.id=s.evidence_id AND app.final_lock_hash(to_jsonb(e))=s.input_hash)
   OR EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=s.evidence_id))) THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
 PERFORM 1 FROM app.shadow_commercial_signal WHERE tenant_id=t AND job_id=j ORDER BY id FOR UPDATE;
 -- Every source-linked detection must be accounted for, including coalesced identities and explicit exclusions.
 IF jsonb_array_length(p)<>(SELECT count(*) FROM app.shadow_commercial_signal WHERE tenant_id=t AND job_id=j)
 OR jsonb_array_length(p)<>(SELECT count(DISTINCT value->>'signalId') FROM jsonb_array_elements(p)) THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
 INSERT INTO app.shadow_reconciliation_run(tenant_id,job_id,id,policy_version,evidence_cutoff_at,status) VALUES(t,j,run,manifest.policy_version,manifest.evidence_cutoff_at,'completed');
 INSERT INTO app.final_check_run_binding(tenant_id,job_id,run_id,manifest_id,lock_id,evidence_cutoff_at,manifest_hash,result_hash,zero_result,classifications,audit_event_id)
 VALUES(t,j,run,m,l.id,l.locked_at,manifest.manifest_hash,digest,jsonb_array_length(p)=0,p,event);
 FOR item IN SELECT value FROM jsonb_array_elements(p) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(item))<>5 OR NOT item ?& ARRAY['signalId','expectedRevision','outcome','references','comparisons']
   OR jsonb_typeof(item->'signalId') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'outcome') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'expectedRevision') IS DISTINCT FROM 'number' OR item->>'expectedRevision' !~ '^[0-9]+$'
   OR jsonb_typeof(item->'references') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
  SELECT * INTO sig FROM app.shadow_commercial_signal WHERE tenant_id=t AND job_id=j AND id=(item->>'signalId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF sig.revision IS DISTINCT FROM (item->>'expectedRevision')::integer THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  chosen_outcome:=item->>'outcome';refs:=item->'references';
  IF chosen_outcome IS NULL OR chosen_outcome NOT IN('already_in_original_scope','builder_captured','already_on_final_account','duplicate_signal','not_enough_evidence','reveal') THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
  proof:=jsonb_build_object('baselineItemIds',manifest.frozen_comparisons->'baselineItemIds','captureIds',(SELECT coalesce(jsonb_agg(value->'id' ORDER BY value->>'id'),'[]') FROM jsonb_array_elements(manifest.frozen_comparisons->'captures')),
   'lockedLineIds',(SELECT coalesce(jsonb_agg(value->'id' ORDER BY value->>'id'),'[]') FROM jsonb_array_elements(manifest.frozen_comparisons->'lines')));
  IF item->'comparisons' IS DISTINCT FROM proof THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  IF sig.coalesced_into_signal_id IS NOT NULL AND (chosen_outcome<>'duplicate_signal' OR refs<>jsonb_build_array(sig.coalesced_into_signal_id)) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  IF (sig.disclosed_before_lock OR sig.state='surfaced_early') AND chosen_outcome='reveal' THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  IF chosen_outcome='already_in_original_scope' AND (jsonb_array_length(refs)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(refs) r WHERE NOT manifest.frozen_comparisons->'baselineItemIds' ? r.value)) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  IF chosen_outcome='builder_captured' AND (jsonb_array_length(refs)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(refs) r WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(manifest.frozen_comparisons->'captures') c WHERE c.value->>'id'=r.value))) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  IF chosen_outcome='already_on_final_account' AND (jsonb_array_length(refs)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(refs) r WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(manifest.frozen_comparisons->'lines') line WHERE line.value->>'id'=r.value))) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.evidence_id,'objectVersionId',e.object_version_id,'sha256',e.sha256,'receivedAt',to_char(e.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'source',o.evidence_type,'evidenceAfterLock',e.source_received_at>l.locked_at) ORDER BY e.evidence_id,e.object_version_id),'[]') INTO ev FROM app.shadow_signal_evidence e JOIN app.evidence_object o
    ON(o.tenant_id,o.job_id,o.id,o.object_version_id,o.sha256,o.server_received_at)=(e.tenant_id,e.job_id,e.evidence_id,e.object_version_id,e.sha256,e.source_received_at)
    WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=sig.id;
  IF chosen_outcome='reveal' AND (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ev) x WHERE NOT (x->>'evidenceAfterLock')::boolean) OR EXISTS(SELECT 1 FROM app.shadow_signal_evidence e WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=sig.id AND EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id))
   OR sig.matched_scope_item_id IN(SELECT value::uuid FROM jsonb_array_elements_text(manifest.frozen_comparisons->'baselineItemIds'))
   OR sig.matched_variation_id IN(SELECT (value->>'id')::uuid FROM jsonb_array_elements(manifest.frozen_comparisons->'captures'))) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  classification:=gen_random_uuid();
  INSERT INTO app.shadow_signal_classification(tenant_id,job_id,id,run_id,signal_id,outcome) VALUES(t,j,classification,run,sig.id,chosen_outcome);
  next_revision:=sig.revision;
  IF sig.state<>'surfaced_early' AND sig.state IN('candidate','held_for_final_check','reconciled') THEN
   next_revision:=sig.revision+1;
   UPDATE app.shadow_commercial_signal SET state=CASE WHEN chosen_outcome='reveal' THEN 'revealed' ELSE 'reconciled' END,
    outcome=CASE WHEN chosen_outcome='reveal' THEN NULL ELSE chosen_outcome END,revision=next_revision,
    first_builder_visible_at=CASE WHEN chosen_outcome='reveal' THEN coalesce(first_builder_visible_at,clock_timestamp()) ELSE first_builder_visible_at END
    WHERE tenant_id=t AND job_id=j AND id=sig.id;
  END IF;
  INSERT INTO app.final_check_reveal_proof(tenant_id,job_id,run_id,signal_id,lock_id,signal_revision,classification_id,comparison_version,capture_register_hash,line_set_hash,baseline_hash,comparisons,reference_ids,evidence,evidence_set_hash,description)
  VALUES(t,j,run,sig.id,l.id,next_revision,classification,manifest.policy_version,l.capture_register_hash,l.line_set_hash,app.final_lock_hash(manifest.frozen_comparisons->'baseline'),proof,refs,ev,app.final_lock_hash(ev),sig.description);
  INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref)
  SELECT t,j,gen_random_uuid(),sig.id,'evidence_after_lock',e->>'id' FROM jsonb_array_elements(ev)e WHERE (e->>'evidenceAfterLock')::boolean ON CONFLICT DO NOTHING;
 END LOOP;
 PERFORM app.append_final_check_audit(event,'system:final-check',j,'final_check.result_available',jsonb_build_object('manifestId',m,'runId',run,'lockId',l.id));
 -- Bridge exact successful processing into 0204's independently checked proof path.
 -- The prerequisite upload hash and source identity are never replaced by processing hashes.
 FOR item IN SELECT jsonb_build_object('source',ms.id,'hash',ms.frozen_input_hash,'evidence',ps.evidence_id,'object',ps.object_version_id,'sha',ps.sha256,'received',ps.source_received_at,'result',a.result_hash,'signals',a.signal_ids)
  FROM app.final_check_manifest_source ms JOIN app.final_check_processing_source ps ON ps.tenant_id=ms.tenant_id AND ps.job_id=ms.job_id AND ps.manifest_id=ms.manifest_id AND ps.evidence_id=ms.evidence_id
  JOIN LATERAL(SELECT * FROM app.final_check_source_attempt WHERE tenant_id=t AND job_id=j AND manifest_id=m AND source_id=ps.id ORDER BY sequence DESC LIMIT 1)a ON true
  WHERE ms.tenant_id=t AND ms.job_id=j AND ms.manifest_id=m AND ms.excluded_state IS NULL LOOP
  INSERT INTO app.shadow_final_check_source_attempt(tenant_id,job_id,manifest_id,source_id,id,execution_id,stage,version,input_hash,outcome,result_hash,result_signal_ids,evidence_id,object_version_id,sha256,source_received_at)
  SELECT t,j,m,(item->>'source')::uuid,gen_random_uuid(),run,stage,CASE stage WHEN 'detection' THEN manifest.detector_version ELSE manifest.reconciliation_version END,
   CASE stage WHEN 'detection' THEN item->>'hash' ELSE item->>'result' END,'succeeded',item->>'result',ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(item->'signals')),
   (item->>'evidence')::uuid,item->>'object',item->>'sha',(item->>'received')::timestamptz FROM unnest(ARRAY['detection','reconciliation']) stage ORDER BY stage;
 END LOOP;
 INSERT INTO app.shadow_final_check_reveal_proof(tenant_id,job_id,run_id,id,signal_id,classification_id,projection_version,result_descriptor)
 SELECT t,j,run,gen_random_uuid(),c.signal_id,c.id,'final-check-result.v1',jsonb_build_object('version','final-check-result.v1','signalId',c.signal_id,'classificationId',c.id,'outcome',c.outcome)
 FROM app.shadow_signal_classification c WHERE c.tenant_id=t AND c.job_id=j AND c.run_id=run;
 IF jsonb_array_length(p)=0 THEN
  INSERT INTO app.shadow_final_check_reveal_proof(tenant_id,job_id,run_id,id,projection_version,result_descriptor)
  VALUES(t,j,run,gen_random_uuid(),'final-check-result.v1','{"version":"final-check-result.v1","outcome":"zero_result"}');
 END IF;
 INSERT INTO app.shadow_final_check_run_binding(tenant_id,job_id,run_id,manifest_id,lock_id,evidence_cutoff_at,execution_id,detector_version,reconciliation_version)
 VALUES(t,j,run,m,l.id,l.locked_at,run,manifest.detector_version,manifest.reconciliation_version);
 -- Verification is mandatory even though certificate publication remains an explicit worker action.
 PERFORM app.verify_final_check_run(t,j,run,l.id,l.locked_at);
 RETURN jsonb_build_object('runId',run,'lockId',l.id,'zeroResult',jsonb_array_length(p)=0);
END $$;
COMMIT;
