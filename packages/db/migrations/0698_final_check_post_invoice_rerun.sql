BEGIN;
-- LATER-SAFETY-142: forward-only append of attempts. Existing row values and ACLs survive.
ALTER TABLE app.final_check_manifest
 ADD COLUMN attempt integer NOT NULL DEFAULT 1 CHECK(attempt>0),
 ADD COLUMN predecessor_manifest_id uuid,
 ADD COLUMN withdrawn_predecessor_source_ids uuid[] NOT NULL DEFAULT '{}',
 ADD CONSTRAINT final_check_attempt_predecessor FOREIGN KEY(tenant_id,job_id,predecessor_manifest_id) REFERENCES app.final_check_manifest(tenant_id,job_id,id),
 ADD CONSTRAINT final_check_attempt_chain CHECK((attempt=1 AND predecessor_manifest_id IS NULL AND cardinality(withdrawn_predecessor_source_ids)=0) OR (attempt>1 AND predecessor_manifest_id IS NOT NULL AND cardinality(withdrawn_predecessor_source_ids)>0));
ALTER TABLE app.final_check_manifest DROP CONSTRAINT final_check_manifest_tenant_id_job_id_lock_id_key;
ALTER TABLE app.final_check_manifest ADD CONSTRAINT final_check_manifest_lock_attempt UNIQUE(tenant_id,job_id,lock_id,attempt);
ALTER TABLE infrastructure.final_check_request ADD COLUMN attempt integer NOT NULL DEFAULT 1 CHECK(attempt>0), ADD COLUMN manifest_id uuid NOT NULL DEFAULT gen_random_uuid();
UPDATE infrastructure.final_check_request q SET manifest_id=m.id FROM app.final_check_manifest m WHERE (m.tenant_id,m.job_id,m.lock_id)=(q.tenant_id,q.job_id,q.lock_id);
ALTER TABLE infrastructure.final_check_request DROP CONSTRAINT final_check_request_pkey;
ALTER TABLE infrastructure.final_check_request ADD PRIMARY KEY(lock_id,attempt);
ALTER TABLE infrastructure.final_check_request ADD UNIQUE(manifest_id);

-- Missing inventory is justified only by immutable, tenant-qualified predecessor snapshots.
CREATE FUNCTION app.final_check_omitted_uploads(t uuid,j uuid,m uuid) RETURNS uuid[]
LANGUAGE sql STABLE SET search_path=pg_catalog,app AS $$
 WITH RECURSIVE chain AS (
 SELECT id,predecessor_manifest_id,withdrawn_predecessor_source_ids FROM app.final_check_manifest WHERE tenant_id=t AND job_id=j AND id=m
 UNION ALL SELECT p.id,p.predecessor_manifest_id,p.withdrawn_predecessor_source_ids FROM app.final_check_manifest p JOIN chain c ON p.id=c.predecessor_manifest_id WHERE p.tenant_id=t AND p.job_id=j
 ) SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}'::uuid[]) FROM chain CROSS JOIN LATERAL unnest(withdrawn_predecessor_source_ids) x
$$;
ALTER FUNCTION app.final_check_omitted_uploads(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_omitted_uploads(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;


CREATE OR REPLACE FUNCTION app.verify_final_check_run(p_tenant uuid,p_job uuid,p_run uuid,p_lock uuid,p_cutoff timestamptz) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE b app.shadow_final_check_run_binding;m app.final_check_manifest;s app.final_check_manifest_source;d app.shadow_final_check_source_attempt;r app.shadow_final_check_source_attempt;inventory jsonb;result_digest text;
BEGIN
 SELECT * INTO b FROM app.shadow_final_check_run_binding WHERE (tenant_id,job_id,run_id,lock_id,evidence_cutoff_at)=(p_tenant,p_job,p_run,p_lock,p_cutoff);
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 SELECT * INTO m FROM app.final_check_manifest WHERE (tenant_id,job_id,id,lock_id,evidence_cutoff_at)=(p_tenant,p_job,b.manifest_id,p_lock,p_cutoff);
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.shadow_reconciliation_run WHERE (tenant_id,job_id,id,evidence_cutoff_at,status,policy_version)=(p_tenant,p_job,p_run,p_cutoff,'completed',b.reconciliation_version)) THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'inputHash',frozen_input_hash) ORDER BY id),'[]') INTO inventory FROM app.final_check_manifest_source WHERE (tenant_id,job_id,manifest_id)=(p_tenant,p_job,m.id);
 IF m.inventory_hash<>app.final_lock_hash(inventory) OR m.source_count<>jsonb_array_length(inventory)
 OR m.source_count+cardinality(app.final_check_omitted_uploads(p_tenant,p_job,m.id))<>(SELECT count(*) FROM app.evidence_upload WHERE tenant_id=p_tenant AND job_id=p_job AND server_received_at<=p_cutoff)
 OR EXISTS(SELECT 1 FROM app.evidence_upload u WHERE u.tenant_id=p_tenant AND u.job_id=p_job AND u.server_received_at<=p_cutoff AND NOT u.id=ANY(app.final_check_omitted_uploads(p_tenant,p_job,m.id)) AND NOT EXISTS(SELECT 1 FROM app.final_check_manifest_source ms WHERE (ms.tenant_id,ms.job_id,ms.manifest_id,ms.upload_id,ms.source_received_at)=(p_tenant,p_job,m.id,u.id,u.server_received_at)))
 -- A supplied original-object receipt cannot introduce an unprocessed pre-cutoff source outside the frozen inventory.
 OR EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.kind='original' AND e.server_received_at<=p_cutoff AND NOT e.upload_id=ANY(app.final_check_omitted_uploads(p_tenant,p_job,m.id)) AND NOT EXISTS(SELECT 1 FROM app.final_check_manifest_source ms WHERE (ms.tenant_id,ms.job_id,ms.manifest_id,ms.upload_id)=(p_tenant,p_job,m.id,e.upload_id))) THEN RAISE EXCEPTION 'FINAL_CHECK_INVENTORY_INCOMPLETE'; END IF;
 FOR s IN SELECT * FROM app.final_check_manifest_source WHERE (tenant_id,job_id,manifest_id)=(p_tenant,p_job,m.id) LOOP
  IF s.excluded_state IS NOT NULL THEN CONTINUE; END IF; -- C204: excluded uploads are recorded, never evidence
  IF NOT EXISTS(SELECT 1 FROM app.evidence_upload u WHERE (u.tenant_id,u.job_id,u.id,u.server_received_at)=(p_tenant,p_job,s.upload_id,s.source_received_at)
   AND s.frozen_input_hash=app.final_lock_hash(jsonb_build_object('upload',u.id,'receivedAt',to_char(u.server_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'expectedHash',u.expected_sha256,'contentType',u.expected_content_type))) THEN RAISE EXCEPTION 'FINAL_CHECK_INPUT_MISMATCH'; END IF;
  SELECT * INTO d FROM app.shadow_final_check_source_attempt WHERE (tenant_id,job_id,manifest_id,source_id,execution_id,stage)=(p_tenant,p_job,m.id,s.id,b.execution_id,'detection') ORDER BY created_at DESC,id DESC LIMIT 1;
  SELECT * INTO r FROM app.shadow_final_check_source_attempt WHERE (tenant_id,job_id,manifest_id,source_id,execution_id,stage)=(p_tenant,p_job,m.id,s.id,b.execution_id,'reconciliation') ORDER BY created_at DESC,id DESC LIMIT 1;
  IF d.outcome IS DISTINCT FROM 'succeeded' OR r.outcome IS DISTINCT FROM 'succeeded' OR d.input_hash IS DISTINCT FROM s.frozen_input_hash OR d.version IS DISTINCT FROM b.detector_version OR r.version IS DISTINCT FROM b.reconciliation_version OR r.input_hash IS DISTINCT FROM d.result_hash OR r.result_signal_ids IS DISTINCT FROM d.result_signal_ids OR ROW(r.evidence_id,r.object_version_id,r.sha256,r.source_received_at) IS DISTINCT FROM ROW(d.evidence_id,d.object_version_id,d.sha256,d.source_received_at) THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.evidence_upload u JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.upload_id)=(u.tenant_id,u.job_id,u.id) WHERE (u.tenant_id,u.job_id,u.id,u.state)=(p_tenant,p_job,s.upload_id,'verified') AND e.kind='original' AND (e.id,e.object_version_id,e.sha256,e.server_received_at)=(d.evidence_id,d.object_version_id,d.sha256,d.source_received_at) AND e.sha256=u.expected_sha256 AND e.object_version_id=u.object_version_id AND e.server_received_at<=p_cutoff AND (s.evidence_id IS NULL OR (e.id,e.object_version_id,e.sha256,e.server_received_at)=(s.evidence_id,s.object_version_id,s.sha256,s.evidence_received_at)) AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation x WHERE x.tenant_id=p_tenant AND x.evidence_id=e.id)) THEN RAISE EXCEPTION 'FINAL_CHECK_INPUT_UNAVAILABLE'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(d.result_signal_ids) sid WHERE NOT EXISTS(SELECT 1 FROM app.shadow_signal_classification c JOIN app.shadow_final_check_reveal_proof p ON(p.tenant_id,p.job_id,p.run_id,p.signal_id,p.classification_id)=(c.tenant_id,c.job_id,c.run_id,c.signal_id,c.id) WHERE (c.tenant_id,c.job_id,c.run_id,c.signal_id)=(p_tenant,p_job,p_run,sid))) THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 END LOOP;
 -- All held, pre-cutoff evidence-linked signals need classification, independently of detector output lists.
 IF EXISTS(SELECT 1 FROM app.shadow_commercial_signal sig WHERE sig.tenant_id=p_tenant AND sig.job_id=p_job AND (sig.created_at<=p_cutoff OR EXISTS(SELECT 1 FROM app.shadow_signal_evidence e WHERE (e.tenant_id,e.job_id,e.signal_id)=(p_tenant,p_job,sig.id) AND e.source_received_at<=p_cutoff)) AND NOT EXISTS(SELECT 1 FROM app.shadow_signal_classification c JOIN app.shadow_final_check_reveal_proof p ON(p.tenant_id,p.job_id,p.run_id,p.signal_id,p.classification_id)=(c.tenant_id,c.job_id,c.run_id,c.signal_id,c.id) WHERE (c.tenant_id,c.job_id,c.run_id,c.signal_id)=(p_tenant,p_job,p_run,sig.id))) THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.shadow_final_check_reveal_proof WHERE (tenant_id,job_id,run_id)=(p_tenant,p_job,p_run)) THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 IF EXISTS(SELECT 1 FROM app.shadow_final_check_reveal_proof WHERE (tenant_id,job_id,run_id)=(p_tenant,p_job,p_run) AND signal_id IS NULL) AND EXISTS(SELECT 1 FROM app.shadow_signal_classification WHERE (tenant_id,job_id,run_id)=(p_tenant,p_job,p_run)) THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 SELECT app.final_lock_hash(coalesce(jsonb_agg(jsonb_build_object('signalId',signal_id,'resultHash',result_hash) ORDER BY signal_id NULLS FIRST),'[]')) INTO result_digest FROM app.shadow_final_check_reveal_proof WHERE (tenant_id,job_id,run_id)=(p_tenant,p_job,p_run);
 IF result_digest<>b.result_manifest_hash THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 RETURN result_digest;
END $$;

CREATE FUNCTION app.verify_final_check_predecessor_structure(p_tenant uuid,p_job uuid,p_run uuid,p_lock uuid,p_cutoff timestamptz) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE b app.shadow_final_check_run_binding;m app.final_check_manifest;s app.final_check_manifest_source;d app.shadow_final_check_source_attempt;r app.shadow_final_check_source_attempt;inventory jsonb;result_digest text;
BEGIN
 SELECT * INTO b FROM app.shadow_final_check_run_binding WHERE (tenant_id,job_id,run_id,lock_id,evidence_cutoff_at)=(p_tenant,p_job,p_run,p_lock,p_cutoff);
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 SELECT * INTO m FROM app.final_check_manifest WHERE (tenant_id,job_id,id,lock_id,evidence_cutoff_at)=(p_tenant,p_job,b.manifest_id,p_lock,p_cutoff);
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.shadow_reconciliation_run WHERE (tenant_id,job_id,id,evidence_cutoff_at,status,policy_version)=(p_tenant,p_job,p_run,p_cutoff,'completed',b.reconciliation_version)) THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'inputHash',frozen_input_hash) ORDER BY id),'[]') INTO inventory FROM app.final_check_manifest_source WHERE (tenant_id,job_id,manifest_id)=(p_tenant,p_job,m.id);
 IF m.inventory_hash<>app.final_lock_hash(inventory) OR m.source_count<>jsonb_array_length(inventory)
 OR m.source_count+cardinality(app.final_check_omitted_uploads(p_tenant,p_job,m.id))<>(SELECT count(*) FROM app.evidence_upload WHERE tenant_id=p_tenant AND job_id=p_job AND server_received_at<=p_cutoff)
 OR EXISTS(SELECT 1 FROM app.evidence_upload u WHERE u.tenant_id=p_tenant AND u.job_id=p_job AND u.server_received_at<=p_cutoff AND NOT u.id=ANY(app.final_check_omitted_uploads(p_tenant,p_job,m.id)) AND NOT EXISTS(SELECT 1 FROM app.final_check_manifest_source ms WHERE (ms.tenant_id,ms.job_id,ms.manifest_id,ms.upload_id,ms.source_received_at)=(p_tenant,p_job,m.id,u.id,u.server_received_at)))
 -- A supplied original-object receipt cannot introduce an unprocessed pre-cutoff source outside the frozen inventory.
 OR EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.kind='original' AND e.server_received_at<=p_cutoff AND NOT e.upload_id=ANY(app.final_check_omitted_uploads(p_tenant,p_job,m.id)) AND NOT EXISTS(SELECT 1 FROM app.final_check_manifest_source ms WHERE (ms.tenant_id,ms.job_id,ms.manifest_id,ms.upload_id)=(p_tenant,p_job,m.id,e.upload_id))) THEN RAISE EXCEPTION 'FINAL_CHECK_INVENTORY_INCOMPLETE'; END IF;
 FOR s IN SELECT * FROM app.final_check_manifest_source WHERE (tenant_id,job_id,manifest_id)=(p_tenant,p_job,m.id) LOOP
  IF s.excluded_state IS NOT NULL THEN CONTINUE; END IF; -- C204: excluded uploads are recorded, never evidence
  IF NOT EXISTS(SELECT 1 FROM app.evidence_upload u WHERE (u.tenant_id,u.job_id,u.id,u.server_received_at)=(p_tenant,p_job,s.upload_id,s.source_received_at)
   AND s.frozen_input_hash=app.final_lock_hash(jsonb_build_object('upload',u.id,'receivedAt',to_char(u.server_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'expectedHash',u.expected_sha256,'contentType',u.expected_content_type))) THEN RAISE EXCEPTION 'FINAL_CHECK_INPUT_MISMATCH'; END IF;
  SELECT * INTO d FROM app.shadow_final_check_source_attempt WHERE (tenant_id,job_id,manifest_id,source_id,execution_id,stage)=(p_tenant,p_job,m.id,s.id,b.execution_id,'detection') ORDER BY created_at DESC,id DESC LIMIT 1;
  SELECT * INTO r FROM app.shadow_final_check_source_attempt WHERE (tenant_id,job_id,manifest_id,source_id,execution_id,stage)=(p_tenant,p_job,m.id,s.id,b.execution_id,'reconciliation') ORDER BY created_at DESC,id DESC LIMIT 1;
  IF d.outcome IS DISTINCT FROM 'succeeded' OR r.outcome IS DISTINCT FROM 'succeeded' OR d.input_hash IS DISTINCT FROM s.frozen_input_hash OR d.version IS DISTINCT FROM b.detector_version OR r.version IS DISTINCT FROM b.reconciliation_version OR r.input_hash IS DISTINCT FROM d.result_hash OR r.result_signal_ids IS DISTINCT FROM d.result_signal_ids OR ROW(r.evidence_id,r.object_version_id,r.sha256,r.source_received_at) IS DISTINCT FROM ROW(d.evidence_id,d.object_version_id,d.sha256,d.source_received_at) THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.evidence_upload u JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.upload_id)=(u.tenant_id,u.job_id,u.id) WHERE (u.tenant_id,u.job_id,u.id,u.state)=(p_tenant,p_job,s.upload_id,'verified') AND e.kind='original' AND (e.id,e.object_version_id,e.sha256,e.server_received_at)=(d.evidence_id,d.object_version_id,d.sha256,d.source_received_at) AND e.sha256=u.expected_sha256 AND e.object_version_id=u.object_version_id AND e.server_received_at<=p_cutoff AND (s.evidence_id IS NULL OR (e.id,e.object_version_id,e.sha256,e.server_received_at)=(s.evidence_id,s.object_version_id,s.sha256,s.evidence_received_at))) THEN RAISE EXCEPTION 'FINAL_CHECK_INPUT_UNAVAILABLE'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(d.result_signal_ids) sid WHERE NOT EXISTS(SELECT 1 FROM app.shadow_signal_classification c JOIN app.shadow_final_check_reveal_proof p ON(p.tenant_id,p.job_id,p.run_id,p.signal_id,p.classification_id)=(c.tenant_id,c.job_id,c.run_id,c.signal_id,c.id) WHERE (c.tenant_id,c.job_id,c.run_id,c.signal_id)=(p_tenant,p_job,p_run,sid))) THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 END LOOP;
 -- All held, pre-cutoff evidence-linked signals need classification, independently of detector output lists.
 IF EXISTS(SELECT 1 FROM app.shadow_commercial_signal sig WHERE sig.tenant_id=p_tenant AND sig.job_id=p_job AND (sig.created_at<=p_cutoff OR EXISTS(SELECT 1 FROM app.shadow_signal_evidence e WHERE (e.tenant_id,e.job_id,e.signal_id)=(p_tenant,p_job,sig.id) AND e.source_received_at<=p_cutoff)) AND NOT EXISTS(SELECT 1 FROM app.shadow_signal_classification c JOIN app.shadow_final_check_reveal_proof p ON(p.tenant_id,p.job_id,p.run_id,p.signal_id,p.classification_id)=(c.tenant_id,c.job_id,c.run_id,c.signal_id,c.id) WHERE (c.tenant_id,c.job_id,c.run_id,c.signal_id)=(p_tenant,p_job,p_run,sig.id))) THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.shadow_final_check_reveal_proof WHERE (tenant_id,job_id,run_id)=(p_tenant,p_job,p_run)) THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 IF EXISTS(SELECT 1 FROM app.shadow_final_check_reveal_proof WHERE (tenant_id,job_id,run_id)=(p_tenant,p_job,p_run) AND signal_id IS NULL) AND EXISTS(SELECT 1 FROM app.shadow_signal_classification WHERE (tenant_id,job_id,run_id)=(p_tenant,p_job,p_run)) THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 SELECT app.final_lock_hash(coalesce(jsonb_agg(jsonb_build_object('signalId',signal_id,'resultHash',result_hash) ORDER BY signal_id NULLS FIRST),'[]')) INTO result_digest FROM app.shadow_final_check_reveal_proof WHERE (tenant_id,job_id,run_id)=(p_tenant,p_job,p_run);
 IF result_digest<>b.result_manifest_hash THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 RETURN result_digest;
END $$;

ALTER FUNCTION app.verify_final_check_predecessor_structure(uuid,uuid,uuid,uuid,timestamptz) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.verify_final_check_predecessor_structure(uuid,uuid,uuid,uuid,timestamptz) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;

CREATE FUNCTION app.require_final_check_rerun(t uuid,j uuid,m uuid) RETURNS uuid[]
LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE p app.final_check_manifest;c app.final_account_lock_check;removed uuid[];failure text;
BEGIN
 PERFORM app.ch4_require_open(t,j);
 SELECT * INTO p FROM app.final_check_manifest WHERE tenant_id=t AND job_id=j AND id=m;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_check_manifest WHERE tenant_id=t AND job_id=j AND lock_id=p.lock_id AND attempt>p.attempt) THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
 SELECT * INTO c FROM app.final_account_lock_check WHERE tenant_id=t AND job_id=j AND lock_id=p.lock_id ORDER BY created_at DESC,id DESC LIMIT 1;
 IF c.status IS DISTINCT FROM 'completed' OR NOT EXISTS(SELECT 1 FROM app.shadow_final_check_completion x WHERE (x.tenant_id,x.job_id,x.check_id,x.manifest_id)=(t,j,c.id,m)) THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
 BEGIN
  PERFORM app.verify_final_check_run(t,j,c.run_id,p.lock_id,p.evidence_cutoff_at);
 EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT;
 END;
 IF failure IS DISTINCT FROM 'FINAL_CHECK_INPUT_UNAVAILABLE' THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 -- All checks other than current invalidation still have to pass.
 PERFORM app.verify_final_check_predecessor_structure(t,j,c.run_id,p.lock_id,p.evidence_cutoff_at);
 SELECT array_agg(s.id ORDER BY s.id) INTO removed FROM app.final_check_manifest_source s
 JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.upload_id)=(s.tenant_id,s.job_id,s.upload_id)
 WHERE s.tenant_id=t AND s.job_id=j AND s.manifest_id=m AND s.excluded_state IS NULL AND e.kind='original'
 AND EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.id);
 RETURN removed;
END $$;
ALTER FUNCTION app.require_final_check_rerun(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_final_check_rerun(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;


CREATE OR REPLACE FUNCTION app.guard_final_check_manifest() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE predecessor app.final_check_manifest;removed uuid[];inventory jsonb;l app.final_account_lock;excluded jsonb;seq bigint;prev text;ts timestamptz;payload jsonb;ph text;eh text;
BEGIN
 PERFORM app.final_check_require_worker(NEW.tenant_id,NEW.job_id);
 IF NEW.lock_id IS NULL AND NEW.evidence_cutoff_at IS NULL THEN SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id; NEW.lock_id:=l.id;NEW.evidence_cutoff_at:=l.locked_at; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE (tenant_id,job_id,id,locked_at)=(NEW.tenant_id,NEW.job_id,NEW.lock_id,NEW.evidence_cutoff_at)) THEN RAISE EXCEPTION 'FINAL_CHECK_LOCK_BINDING_INVALID' USING ERRCODE='23503'; END IF;
 SELECT * INTO predecessor FROM app.final_check_manifest WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND lock_id=NEW.lock_id ORDER BY attempt DESC LIMIT 1;
 IF FOUND THEN
  removed:=app.require_final_check_rerun(NEW.tenant_id,NEW.job_id,predecessor.id);
  IF NEW.attempt<>predecessor.attempt+1 OR NEW.predecessor_manifest_id IS DISTINCT FROM predecessor.id
   OR NOT EXISTS(SELECT 1 FROM infrastructure.final_check_request q WHERE (q.tenant_id,q.job_id,q.lock_id,q.attempt,q.manifest_id)=(NEW.tenant_id,NEW.job_id,NEW.lock_id,NEW.attempt,NEW.id)) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  NEW.withdrawn_predecessor_source_ids:=removed;
 ELSIF NEW.attempt<>1 OR NEW.predecessor_manifest_id IS NOT NULL THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 IF predecessor.id IS NULL THEN
  -- Preserve the legacy explicit-manifest writer before discovery; after discovery only its reserved identity may freeze.
  UPDATE infrastructure.final_check_request SET manifest_id=NEW.id WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND lock_id=NEW.lock_id AND attempt=1 AND enqueued_at IS NULL AND manifest_id<>NEW.id;
  IF EXISTS(SELECT 1 FROM infrastructure.final_check_request WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND lock_id=NEW.lock_id AND attempt=1 AND manifest_id<>NEW.id) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 END IF;
 INSERT INTO app.final_check_manifest_source(tenant_id,job_id,manifest_id,id,upload_id,source_kind,evidence_id,object_version_id,sha256,source_received_at,evidence_received_at,frozen_input_hash,adapter_version,excluded_state,excluded_reason)
 SELECT u.tenant_id,u.job_id,NEW.id,u.id,u.id,'evidence_upload',e.id,e.object_version_id,e.sha256,u.server_received_at,e.server_received_at,
 app.final_lock_hash(jsonb_build_object('upload',u.id,'receivedAt',to_char(u.server_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'expectedHash',u.expected_sha256,'contentType',u.expected_content_type)),NEW.detector_version,
 CASE WHEN u.state='rejected' THEN u.state WHEN u.state='pending' AND u.expires_at<=clock_timestamp() THEN 'expired' END,
 CASE WHEN u.state='rejected' THEN coalesce(u.rejection_code,'rejected') WHEN u.state='pending' AND u.expires_at<=clock_timestamp() THEN 'expired_unswept' END
 FROM app.evidence_upload u LEFT JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.upload_id,e.kind)=(u.tenant_id,u.job_id,u.id,'original')
 WHERE u.tenant_id=NEW.tenant_id AND u.job_id=NEW.job_id AND u.server_received_at<=NEW.evidence_cutoff_at
 AND NOT u.id=ANY(coalesce(removed,'{}'::uuid[])||coalesce(app.final_check_omitted_uploads(NEW.tenant_id,NEW.job_id,NEW.predecessor_manifest_id),'{}'::uuid[]));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'inputHash',frozen_input_hash) ORDER BY id),'[]'),count(*) INTO inventory,NEW.source_count FROM app.final_check_manifest_source WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND manifest_id=NEW.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('uploadId',upload_id,'state',excluded_state,'reason',excluded_reason) ORDER BY upload_id),'[]') INTO excluded FROM app.final_check_manifest_source WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND manifest_id=NEW.id AND excluded_state IS NOT NULL;
 IF jsonb_array_length(excluded)>0 THEN
  -- Audited once per manifest, with the exact exclusions; the audit head is allocated last, after every business lock above.

  payload:=jsonb_build_object('references',jsonb_build_object('manifestId',NEW.id,'lockId',NEW.lock_id),'hashes',jsonb_build_object('exclusions',app.final_lock_hash(excluded)));

  PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','system:final_check','eventType','final_check.sources_excluded','subjectType','job','subjectRef',NEW.job_id::text,'payload',payload)),'checked_operation');

 END IF;
 NEW.inventory_hash:=app.final_lock_hash(inventory);NEW.created_at:=clock_timestamp();RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.request_final_check_run(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$
DECLARE actor record;l app.final_account_lock;m app.final_check_manifest;q infrastructure.final_check_request;next_attempt integer:=1;
BEGIN
 -- Same owner, practice-session, synthetic small-builder and accepted-terms authority as the builder reads.
 SELECT * INTO actor FROM app.final_check_builder(t,j,d,true);
 IF NOT app.final_check_practice_owns_job(t,j,d) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.ch4_require_open(t,j);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 SELECT * INTO m FROM app.final_check_manifest WHERE tenant_id=t AND job_id=j AND lock_id=l.id ORDER BY attempt DESC LIMIT 1;
 IF FOUND THEN
  PERFORM app.require_final_check_rerun(t,j,m.id);
  next_attempt:=m.attempt+1;
 END IF;
 INSERT INTO infrastructure.final_check_request(lock_id,tenant_id,job_id,attempt) VALUES(l.id,t,j,next_attempt) ON CONFLICT DO NOTHING;
 SELECT * INTO q FROM infrastructure.final_check_request WHERE tenant_id=t AND job_id=j AND lock_id=l.id AND attempt=next_attempt;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('version','final-check-run-request.v1','lockId',l.id,'attempt',q.attempt,'manifestId',q.manifest_id,'state','requested','environment','synthetic_demo');
END $$;

CREATE OR REPLACE FUNCTION app.begin_final_check(t uuid,j uuid,detector text,policy text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE q infrastructure.final_check_request;expected uuid:=nullif(current_setting('app.final_check_attempt_id',true),'')::uuid;expected_attempt integer:=nullif(current_setting('app.final_check_attempt_number',true),'')::integer;expected_lock uuid:=nullif(current_setting('app.final_check_lock_id',true),'')::uuid;l app.final_account_lock;m app.final_check_manifest;comparison jsonb;result jsonb;mid uuid:=gen_random_uuid();event uuid:=gen_random_uuid();
BEGIN
 PERFORM app.final_check_worker(t,j);
 IF detector IS NULL OR length(detector) NOT BETWEEN 1 AND 80 OR policy IS DISTINCT FROM 'final-check.reconciliation.v1' THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('shadow-detection:'||t::text||':'||j::text,0));
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 IF expected_lock IS NOT NULL AND l.id IS DISTINCT FROM expected_lock THEN RAISE EXCEPTION 'FINAL_CHECK_LOCK_BINDING_INVALID'; END IF;
 SELECT * INTO q FROM infrastructure.final_check_request WHERE tenant_id=t AND job_id=j AND lock_id=l.id AND (expected IS NULL OR manifest_id=expected) AND (expected_attempt IS NULL OR attempt=expected_attempt) ORDER BY attempt DESC LIMIT 1;
 IF (expected IS NOT NULL AND q.manifest_id IS DISTINCT FROM expected) OR (expected_attempt IS NOT NULL AND q.attempt IS DISTINCT FROM expected_attempt) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 IF q.manifest_id IS NOT NULL THEN mid:=q.manifest_id; END IF;
 SELECT * INTO m FROM app.final_check_manifest WHERE tenant_id=t AND job_id=j AND lock_id=l.id AND (expected IS NULL OR id=expected) AND (expected_attempt IS NULL OR attempt=expected_attempt) ORDER BY attempt DESC LIMIT 1;
 IF q.attempt>coalesce(m.attempt,0) THEN m:=NULL; END IF;
 IF m.id IS NOT NULL THEN
  IF m.detector_version<>detector OR m.reconciliation_version<>policy THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  IF m.manifest_hash IS NULL THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
  RETURN app.read_final_check_manifest(t,j,m.id);
 END IF;
 comparison:=jsonb_build_object('tenantId',t,'jobId',j,'captures',l.snapshot->'captureRegister','baselineItemIds',l.snapshot->'baselineScopeItemIds','lines',l.snapshot->'lines',
  'baselineRecordedAt',to_char((SELECT created_at FROM app.quote_version WHERE tenant_id=t AND job_id=j AND id=l.baseline_quote_version_id) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'baseline',(SELECT coalesce(jsonb_agg(to_jsonb(line) ORDER BY line.id),'[]') FROM app.final_account_line line WHERE line.tenant_id=t AND line.job_id=j AND line.final_account_revision_id=l.final_account_revision_id AND line.line_kind='baseline'));
 INSERT INTO app.final_check_manifest(attempt,predecessor_manifest_id,tenant_id,job_id,id,lock_id,evidence_cutoff_at,detector_version,reconciliation_version,policy_version,manifest_hash,processing_source_count,frozen_comparisons,audit_event_id)
 VALUES(coalesce(q.attempt,1),(SELECT id FROM app.final_check_manifest WHERE tenant_id=t AND job_id=j AND lock_id=l.id ORDER BY attempt DESC LIMIT 1),t,j,mid,l.id,l.locked_at,detector,policy,policy,repeat('0',64),0,comparison,event);
 result:=app.read_final_check_manifest(t,j,mid);
 PERFORM app.append_final_check_audit(event,'system:final-check',j,'final_check.manifest_frozen',jsonb_build_object('manifestId',mid,'lockId',l.id));
 RETURN result;
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
 IF EXISTS(SELECT 1 FROM app.final_check_manifest x WHERE x.tenant_id=t AND x.job_id=j AND x.lock_id=manifest.lock_id AND x.attempt>manifest.attempt) AND NOT EXISTS(SELECT 1 FROM app.final_check_run_binding WHERE tenant_id=t AND job_id=j AND manifest_id=m) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
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
   OR NOT (app.final_check_practice_source_current(s) OR EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=t AND e.job_id=j AND e.id=s.evidence_id AND app.final_lock_hash(to_jsonb(e))=s.input_hash))
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

CREATE OR REPLACE FUNCTION app.read_final_check_reveal(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE l app.final_account_lock;b app.final_check_run_binding;items jsonb;post_items jsonb;
BEGIN
 PERFORM app.final_check_builder(t,j,d);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 -- Fixed pre-lock branch never reads a shadow or final_check fact relation.
 IF NOT FOUND THEN RETURN jsonb_build_object('state','unlocked','items','[]'::jsonb); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('signalId',s.id,'description',s.description,'evidenceAfterLock',true,'evidence',
  (SELECT jsonb_agg(jsonb_build_object('id',e.evidence_id,'objectVersionId',e.object_version_id,'sha256',e.sha256,'receivedAt',to_char(e.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'source',o.evidence_type) ORDER BY e.evidence_id)
   FROM app.shadow_signal_evidence e JOIN app.evidence_object o ON(o.tenant_id,o.job_id,o.id,o.object_version_id,o.sha256,o.server_received_at)=(e.tenant_id,e.job_id,e.evidence_id,e.object_version_id,e.sha256,e.source_received_at)
   WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=s.id AND e.source_received_at>l.locked_at AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id))) ORDER BY s.id),'[]') INTO post_items
 FROM app.shadow_commercial_signal s WHERE s.tenant_id=t AND s.job_id=j AND s.coalesced_into_signal_id IS NULL
 AND EXISTS(SELECT 1 FROM app.shadow_signal_evidence e WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=s.id AND e.source_received_at>l.locked_at AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id));
 SELECT b0.* INTO b FROM app.final_check_run_binding b0 JOIN app.final_check_manifest m0 ON(m0.tenant_id,m0.job_id,m0.id)=(b0.tenant_id,b0.job_id,b0.manifest_id) WHERE b0.tenant_id=t AND b0.job_id=j AND b0.lock_id=l.id AND b0.evidence_cutoff_at=l.locked_at AND EXISTS(SELECT 1 FROM app.shadow_reconciliation_run r0 WHERE (r0.tenant_id,r0.job_id,r0.id,r0.status)=(t,j,b0.run_id,'completed')) ORDER BY m0.attempt DESC LIMIT 1;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('state',CASE WHEN EXISTS(SELECT 1 FROM app.final_check_source_attempt a JOIN app.final_check_manifest m ON(m.tenant_id,m.job_id,m.id)=(a.tenant_id,a.job_id,a.manifest_id) WHERE a.tenant_id=t AND a.job_id=j AND m.lock_id=l.id AND m.attempt=(SELECT max(latest.attempt) FROM app.final_check_manifest latest WHERE latest.tenant_id=t AND latest.job_id=j AND latest.lock_id=l.id) AND a.status IN('failed','unsupported') AND a.sequence=(SELECT max(x.sequence) FROM app.final_check_source_attempt x WHERE (x.tenant_id,x.job_id,x.manifest_id,x.source_id)=(a.tenant_id,a.job_id,a.manifest_id,a.source_id))) THEN 'failed' ELSE 'pending' END,'lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
 END IF;
 IF EXISTS(SELECT 1 FROM app.final_check_processing_source s WHERE s.tenant_id=t AND s.job_id=j AND s.manifest_id=b.manifest_id AND EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=s.evidence_id)) THEN
  RETURN jsonb_build_object('state','failed','lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('signalId',p.signal_id,'signalRevision',p.signal_revision,'description',p.description,'evidence',p.evidence,'comparisons',p.comparisons,
  'baselineHash',p.baseline_hash,'captureRegisterHash',p.capture_register_hash,'lineSetHash',p.line_set_hash,'evidenceSetHash',p.evidence_set_hash,'disposition',s.disposition,'answer',db.answer,'dispositionId',db.disposition_id) ORDER BY p.signal_id),'[]') INTO items
 FROM app.final_check_reveal_proof p JOIN app.shadow_signal_classification c ON(c.tenant_id,c.job_id,c.run_id,c.signal_id)=(p.tenant_id,p.job_id,p.run_id,p.signal_id)
 LEFT JOIN app.final_check_disposition_binding db ON(db.tenant_id,db.job_id,db.run_id,db.signal_id)=(p.tenant_id,p.job_id,p.run_id,p.signal_id)
 LEFT JOIN app.shadow_signal_disposition s ON(s.tenant_id,s.id)=(db.tenant_id,db.disposition_id)
 WHERE p.tenant_id=t AND p.job_id=j AND p.run_id=b.run_id AND c.outcome='reveal';
 -- 0247: the builder's own locked lines, so an answer can name the exact line it points at.
 RETURN jsonb_build_object('state','completed','lockId',l.id,'runId',b.run_id,'items',items,'postLockItems',post_items,
  'lockedLines',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',fl.id,'kind',fl.line_kind,'scopeItemId',fl.scope_item_id,'description',fl.description) ORDER BY fl.line_kind,fl.description,fl.id),'[]')
   FROM app.final_account_line fl WHERE fl.tenant_id=t AND fl.job_id=j AND fl.final_account_revision_id=l.final_account_revision_id));
END $$;

CREATE OR REPLACE FUNCTION app.read_value_job(j uuid,digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor record;
 locked app.final_account_lock; run app.final_check_run_binding; a record;
 checked jsonb:='[]'; tracked jsonb:='[]'; assessments jsonb:='[]'; current_source jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'VALUE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t<>'11111111-1111-4111-8111-111111111111'::uuid THEN
  SELECT app.mon1_company_actor(t,digest) member_id INTO actor;
 ELSE
  SELECT * INTO actor FROM app.authenticate_practice_session(digest,t);
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor.membership_id AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
  THEN RAISE EXCEPTION 'VALUE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j AND (t<>'11111111-1111-4111-8111-111111111111'::uuid OR practice_session_digest=digest))
 THEN RAISE EXCEPTION 'VALUE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO locked FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 -- No hidden query, identifier, count or timing path before the immutable lock.
 IF locked.id IS NULL THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND job_track='small_builder' AND environment='synthetic_demo')
 THEN RAISE EXCEPTION 'VALUE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t='11111111-1111-4111-8111-111111111111'::uuid THEN
  SELECT * INTO actor FROM app.final_check_builder(t,j,digest);
 END IF;
 SELECT b0.* INTO run FROM app.final_check_run_binding b0 JOIN app.final_check_manifest m0 ON(m0.tenant_id,m0.job_id,m0.id)=(b0.tenant_id,b0.job_id,b0.manifest_id) WHERE b0.tenant_id=t AND b0.job_id=j AND b0.lock_id=locked.id AND EXISTS(SELECT 1 FROM app.shadow_reconciliation_run r0 WHERE (r0.tenant_id,r0.job_id,r0.id,r0.status)=(t,j,b0.run_id,'completed')) ORDER BY m0.attempt DESC LIMIT 1;
 IF run.run_id IS NOT NULL THEN
  SELECT coalesce(jsonb_agg(s.id ORDER BY s.id),'[]') INTO checked
  FROM app.final_check_processing_source s WHERE s.tenant_id=t AND s.job_id=j AND s.manifest_id=run.manifest_id AND s.processable;
 END IF;
 -- Keep original locked capture IDs in the value contract. Match their immutable
 -- commercial identity to the issued line, including a 0413 combined final.
 -- Never count descendant copies or post-lock catches as builder captures.
 FOR a IN SELECT jsonb_build_object('id',l.id,'revisionId',l.final_account_revision_id,
  'sourceId',l.source_id,'checkId',b.check_id,'netPence',l.net_pence,'invoiceId',i.invoice_id,'at',to_char(ci.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) document,
  i.final_account_line_id invoice_line_id,i.revision_id invoice_revision_id
 FROM app.final_account_line l JOIN app.variation_revision v ON(v.tenant_id,v.job_id,v.id)=(l.tenant_id,l.job_id,l.source_id)
 JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(v.tenant_id,v.job_id,v.variation_id)
 JOIN app.final_account_invoiced_line i ON(i.tenant_id,i.job_id,i.line_kind,i.source_id,i.commercial_revision_id,i.scope_item_id,i.net_pence)=
  (l.tenant_id,l.job_id,l.line_kind,l.source_id,l.commercial_revision_id,l.scope_item_id,l.net_pence)
 JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.invoice_id)
 JOIN app.customer_invoice ci ON(ci.tenant_id,ci.job_id,ci.id)=(i.tenant_id,i.job_id,i.invoice_id)
 WHERE l.tenant_id=t AND l.job_id=j AND l.final_account_revision_id=locked.final_account_revision_id
 AND l.line_kind='variation' AND l.commercial_revision_id=v.id AND o.kind IN('builder_logged','final_review')
 AND b.invoice_kind='final' AND b.lock_id=locked.id AND b.revision_id=i.revision_id
 AND ci.final_account_revision_id=i.revision_id ORDER BY l.id LOOP
  PERFORM app.receipt_fact_invoice_line(t,j,(a.document->>'invoiceId')::uuid,a.invoice_line_id,
   a.invoice_revision_id,locked.id,(a.document->>'checkId')::uuid);
  tracked:=tracked||jsonb_build_array(a.document);
 END LOOP;
 FOR a IN SELECT r.*,row_number() OVER(PARTITION BY case_id,work_id,line_id,lock_id ORDER BY revision DESC) latest
  FROM app.recovery_attribution_revision r WHERE tenant_id=t AND job_id=j ORDER BY case_id,work_id,line_id,revision LOOP
  IF a.latest=1 THEN
   -- Re-resolve current sources without appending: a stale assessment must not
   -- keep showing positive money after a refund, credit or evidence invalidation.
   current_source:=app.recovery_attribution_sources(t,j,a.document,actor.member_id);
  END IF;
  assessments:=assessments||jsonb_build_array(jsonb_build_object('document',a.document,
   'current',a.latest<>1 OR (current_source->>'sourceHash')=(a.document->>'sourceHash')));
 END LOOP;
 RETURN jsonb_build_object('tenantId',t,'jobId',j,'lockId',locked.id,'lockedRevisionId',locked.final_account_revision_id,
  'lockedAt',to_char(locked.locked_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'checked',checked,
  'checkId',run.run_id,'checkedAt',to_char(run.available_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'tracked',tracked,'assessments',assessments,
  'foundComplete',NOT EXISTS(SELECT 1 FROM app.recovery_case_current c WHERE c.tenant_id=t AND c.job_id=j AND c.case_type='missed_variation_final_account'
   AND NOT EXISTS(SELECT 1 FROM app.recovery_attribution_revision r WHERE r.tenant_id=t AND r.job_id=j AND r.case_id=c.id)));
END $$;

CREATE OR REPLACE FUNCTION app.request_practice_final_check_on_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.job j JOIN app.job_commercial_track tr
   ON (tr.tenant_id,tr.job_id)=(j.tenant_id,j.id)
   WHERE j.tenant_id=NEW.tenant_id AND j.id=NEW.job_id
     AND j.practice_session_digest IS NOT NULL AND j.provenance<>'imported'
     AND tr.job_track='small_builder' AND tr.environment='synthetic_demo') THEN
  INSERT INTO infrastructure.final_check_request(lock_id,tenant_id,job_id)
    VALUES(NEW.id,NEW.tenant_id,NEW.job_id) ON CONFLICT(lock_id,attempt) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.evidence_pack_v3_material(t uuid,c uuid,ordinary_only boolean DEFAULT false) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE j uuid;l app.final_account_lock;b record;rows jsonb;ordinary jsonb;
BEGIN
 SELECT job_id INTO j FROM app.recovery_case WHERE tenant_id=t AND id=c;
 ordinary:=app.evidence_pack_v3_ordinary(t,c);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND OR ordinary_only THEN RETURN jsonb_build_object('tenantId',t,'jobId',j,'caseId',c,'lifecycle',jsonb_build_object('state','pre_lock'),'records',ordinary); END IF;
 SELECT b0.* INTO b FROM app.final_check_run_binding b0 JOIN app.final_check_manifest m0 ON(m0.tenant_id,m0.job_id,m0.id)=(b0.tenant_id,b0.job_id,b0.manifest_id)
 WHERE b0.tenant_id=t AND b0.job_id=j AND b0.lock_id=l.id AND EXISTS(SELECT 1 FROM app.shadow_reconciliation_run r0 WHERE (r0.tenant_id,r0.job_id,r0.id,r0.status)=(t,j,b0.run_id,'completed')) ORDER BY m0.attempt DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind',x.kind,'sourceId',x.sid,'recordedAt',to_char(x.ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'content',x.body::text) ORDER BY x.kind,x.sid),'[]') INTO rows FROM (
 SELECT 'lock' kind,'final_account_lock:'||l.id::text sid,l.locked_at ts,to_jsonb(l) body
 UNION ALL SELECT 'capture_snapshot','capture_snapshot:'||l.id::text,l.locked_at,l.snapshot
 UNION ALL SELECT 'reconciliation','final_check_run_binding:'||b.run_id::text,b.available_at,jsonb_build_object('run_id',b.run_id,'manifest_id',b.manifest_id,'lock_id',b.lock_id,'manifest_hash',b.manifest_hash,'result_hash',b.result_hash)
 UNION ALL SELECT 'source_observations','final_check_processing_source:'||r.id::text,r.source_received_at,jsonb_build_object('id',r.id,'manifest_id',r.manifest_id,'input_hash',r.input_hash) FROM app.final_check_processing_source r WHERE r.tenant_id=t AND r.job_id=j AND r.manifest_id=b.manifest_id
 UNION ALL SELECT 'reconciliation','final_check_source_attempt:'||r.id::text,r.created_at,jsonb_build_object('id',r.id,'source_id',r.source_id,'input_hash',r.input_hash,'result_hash',r.result_hash) FROM app.final_check_source_attempt r WHERE r.tenant_id=t AND r.job_id=j AND r.manifest_id=b.manifest_id
 UNION ALL SELECT 'reveal','final_check_reveal_proof:'||r.signal_id::text,r.first_available_at,to_jsonb(r) FROM app.final_check_reveal_proof r WHERE r.tenant_id=t AND r.job_id=j AND r.run_id=b.run_id AND EXISTS(SELECT 1 FROM app.recovery_case rc
  JOIN app.variation_revision vr ON vr.tenant_id=rc.tenant_id AND vr.job_id=rc.job_id
   AND rc.source_refs ? ('revision:'||vr.id::text) AND rc.source_refs ? ('variation:'||vr.variation_id::text)
  JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(vr.tenant_id,vr.job_id,vr.variation_id)
  WHERE rc.tenant_id=t AND rc.job_id=j AND rc.id=c AND rc.case_type='missed_variation_final_account'
   AND o.kind='jobguard_catch' AND o.source_signal_id=r.signal_id
   AND EXISTS(SELECT 1 FROM app.final_account_line fl WHERE fl.tenant_id=t AND fl.job_id=j
    AND fl.line_kind='variation' AND fl.source_id=vr.id AND fl.commercial_revision_id=vr.id AND fl.scope_item_id=vr.scope_item_id)) AND EXISTS(SELECT 1 FROM app.shadow_signal_classification cl WHERE cl.tenant_id=t AND cl.job_id=j AND cl.run_id=b.run_id AND cl.id=r.classification_id AND cl.signal_id=r.signal_id AND cl.outcome='reveal')
 UNION ALL SELECT 'disposition','final_check_disposition_binding:'||r.disposition_id::text,r.created_at,to_jsonb(r) FROM app.final_check_disposition_binding r WHERE r.tenant_id=t AND r.job_id=j AND r.run_id=b.run_id AND EXISTS(SELECT 1 FROM app.recovery_case rc
  JOIN app.variation_revision vr ON vr.tenant_id=rc.tenant_id AND vr.job_id=rc.job_id
   AND rc.source_refs ? ('revision:'||vr.id::text) AND rc.source_refs ? ('variation:'||vr.variation_id::text)
  JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(vr.tenant_id,vr.job_id,vr.variation_id)
  WHERE rc.tenant_id=t AND rc.job_id=j AND rc.id=c AND rc.case_type='missed_variation_final_account'
   AND o.kind='jobguard_catch' AND o.source_signal_id=r.signal_id
   AND EXISTS(SELECT 1 FROM app.final_account_line fl WHERE fl.tenant_id=t AND fl.job_id=j
    AND fl.line_kind='variation' AND fl.source_id=vr.id AND fl.commercial_revision_id=vr.id AND fl.scope_item_id=vr.scope_item_id)) AND EXISTS(SELECT 1 FROM app.shadow_signal_classification cl WHERE cl.tenant_id=t AND cl.job_id=j AND cl.run_id=b.run_id AND cl.signal_id=r.signal_id AND cl.outcome='reveal')
 UNION ALL SELECT 'attribution_revision','recovery_attribution_revision:'||r.id::text,r.created_at,to_jsonb(r) FROM app.recovery_attribution_revision r WHERE r.tenant_id=t AND r.job_id=j AND r.case_id=c AND r.lock_id=l.id
 UNION ALL SELECT 'settlement','stored_receipt_case_allocation:'||r.id::text,r.created_at,to_jsonb(r) FROM app.stored_receipt_case_allocation r WHERE r.tenant_id=t AND r.job_id=j AND r.case_id=c AND r.lock_id=l.id
 UNION ALL SELECT 'settlement','receipt_allocation_fact_line:'||r.id::text,r.line_existed_at,to_jsonb(r) FROM app.receipt_allocation_fact_line r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND a.fact_line_id=r.id)
 UNION ALL SELECT 'settlement','receipt_allocation_fact_source:'||r.id::text,r.receipt_effective_at,to_jsonb(r) FROM app.receipt_allocation_fact_source r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation a JOIN app.receipt_allocation_fact_line fl ON(fl.tenant_id,fl.job_id,fl.id)=(a.tenant_id,a.job_id,a.fact_line_id) WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND fl.source_id=r.id)
 UNION ALL SELECT 'settlement','final_account_invoice_binding:'||r.invoice_id::text,l.locked_at,to_jsonb(r) FROM app.final_account_invoice_binding r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation a JOIN app.receipt_allocation_fact_line fl ON(fl.tenant_id,fl.job_id,fl.id)=(a.tenant_id,a.job_id,a.fact_line_id) WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND fl.invoice_id=r.invoice_id)
 UNION ALL SELECT 'settlement','final_account_invoiced_line:'||r.invoice_id::text||':'||r.final_account_line_id::text,l.locked_at,to_jsonb(r) FROM app.final_account_invoiced_line r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation a JOIN app.receipt_allocation_fact_line fl ON(fl.tenant_id,fl.job_id,fl.id)=(a.tenant_id,a.job_id,a.fact_line_id) WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND fl.invoice_id=r.invoice_id AND fl.line_id=r.final_account_line_id)
 UNION ALL SELECT 'settlement','customer_credit_note:'||r.id::text,r.created_at,to_jsonb(r) FROM app.customer_credit_note r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation a JOIN app.receipt_allocation_fact_line fl ON(fl.tenant_id,fl.job_id,fl.id)=(a.tenant_id,a.job_id,a.fact_line_id) WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND fl.invoice_id=r.invoice_id)
 UNION ALL SELECT 'settlement','recovery_case_allocation:'||r.id::text,r.created_at,to_jsonb(r) FROM app.recovery_case_allocation r WHERE r.tenant_id=t AND r.job_id=j AND r.case_id=c
 UNION ALL SELECT 'settlement','receipt_line_allocation:'||r.id::text,r.created_at,to_jsonb(r) FROM app.receipt_line_allocation r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.recovery_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.id=r.allocation_id AND a.case_id=c)
 UNION ALL SELECT 'settlement','recovery_case_allocation_reversal:'||r.id::text,r.created_at,to_jsonb(r) FROM app.recovery_case_allocation_reversal r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.recovery_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.id=r.allocation_id AND a.case_id=c)
 UNION ALL SELECT 'settlement','customer_payment:'||r.id::text,r.created_at,to_jsonb(r) FROM app.customer_payment r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.recovery_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.payment_id=r.id AND a.case_id=c) OR r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation a JOIN app.receipt_allocation_fact_line fl ON(fl.tenant_id,fl.job_id,fl.id)=(a.tenant_id,a.job_id,a.fact_line_id) JOIN app.receipt_allocation_fact_source s ON(s.tenant_id,s.job_id,s.id)=(fl.tenant_id,fl.job_id,fl.source_id) WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND s.payment_id=r.id)
 UNION ALL SELECT 'settlement','recovery_allocation_line_source:'||r.id::text,r.existed_at,to_jsonb(r) FROM app.recovery_allocation_line_source r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.receipt_line_allocation a JOIN app.recovery_case_allocation a0 ON a0.tenant_id=a.tenant_id AND a0.job_id=a.job_id AND a0.id=a.allocation_id WHERE a.tenant_id=t AND a.job_id=j AND a.source_id=r.id AND a0.case_id=c)
 UNION ALL SELECT 'settlement','practice_feed_event:'||r.id::text,r.created_at,to_jsonb(r) FROM app.practice_feed_event r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.recovery_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND (a.movement_id=r.id OR a.settled_event_id=r.event_id AND a.account_id=r.account_id)) OR r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation a JOIN app.receipt_allocation_fact_line fl ON(fl.tenant_id,fl.job_id,fl.id)=(a.tenant_id,a.job_id,a.fact_line_id) JOIN app.receipt_allocation_fact_source s ON(s.tenant_id,s.job_id,s.id)=(fl.tenant_id,fl.job_id,fl.source_id) WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND (s.movement_id=r.id OR EXISTS(SELECT 1 FROM app.practice_feed_event original WHERE original.tenant_id=t AND original.job_id=j AND original.id=s.movement_id AND original.account_id=r.account_id AND original.movement_key=r.movement_key)))
 UNION ALL SELECT 'settlement','practice_feed_receipt_match:'||r.id::text,r.created_at,to_jsonb(r) FROM app.practice_feed_receipt_match r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.recovery_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND a.payment_id=r.payment_id) OR r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation a JOIN app.receipt_allocation_fact_line fl ON(fl.tenant_id,fl.job_id,fl.id)=(a.tenant_id,a.job_id,a.fact_line_id) JOIN app.receipt_allocation_fact_source s ON(s.tenant_id,s.job_id,s.id)=(fl.tenant_id,fl.job_id,fl.source_id) WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND s.payment_id=r.payment_id)
 UNION ALL SELECT 'settlement','customer_payment_reversal:'||r.id::text,r.created_at,to_jsonb(r) FROM app.customer_payment_reversal r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.recovery_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND a.payment_id=r.payment_id) OR r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation a JOIN app.receipt_allocation_fact_line fl ON(fl.tenant_id,fl.job_id,fl.id)=(a.tenant_id,a.job_id,a.fact_line_id) JOIN app.receipt_allocation_fact_source s ON(s.tenant_id,s.job_id,s.id)=(fl.tenant_id,fl.job_id,fl.source_id) WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND s.payment_id=r.payment_id)
 ) x;
 RETURN jsonb_build_object('tenantId',t,'jobId',j,'caseId',c,'lifecycle',jsonb_build_object('state','post_lock','lockedAt',to_char(l.locked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'evidenceCutoff',to_char(b.evidence_cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'records',ordinary||rows);
END $$;

CREATE OR REPLACE FUNCTION app.read_final_check_manifest(t uuid,j uuid,m uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE manifest app.final_check_manifest;inventory jsonb;
BEGIN
 PERFORM app.final_check_worker(t,j);
 SELECT * INTO manifest FROM app.final_check_manifest WHERE tenant_id=t AND job_id=j AND id=m;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF manifest.manifest_hash IS NULL THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'evidenceId',s.evidence_id,'sourceKind',s.source_kind,'sourceRef',s.source_ref,'objectVersionId',s.object_version_id,'sha256',s.sha256,
  'receivedAt',to_char(s.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'inputHash',s.input_hash,'processable',s.processable,'input',s.frozen_input,
  'status',coalesce(a.status,'pending')) ORDER BY s.id),'[]') INTO inventory FROM app.final_check_processing_source s
 LEFT JOIN LATERAL(SELECT status FROM app.final_check_source_attempt WHERE tenant_id=t AND job_id=j AND manifest_id=m AND source_id=s.id ORDER BY sequence DESC LIMIT 1)a ON true
 WHERE s.tenant_id=t AND s.job_id=j AND s.manifest_id=m;
 RETURN jsonb_build_object('version','final-check.manifest.v1','id',manifest.id,'lockId',manifest.lock_id,'cutoff',to_char(manifest.evidence_cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'hash',manifest.manifest_hash,'detectorVersion',manifest.detector_version,'policyVersion',manifest.policy_version,'sources',inventory,'excludedUploads',(SELECT coalesce(jsonb_agg(jsonb_build_object('uploadId',ms.upload_id,'state',ms.excluded_state,'reason',ms.excluded_reason) ORDER BY ms.upload_id),'[]') FROM app.final_check_manifest_source ms WHERE ms.tenant_id=t AND ms.job_id=j AND ms.manifest_id=m AND ms.excluded_state IS NOT NULL),'comparisons',manifest.frozen_comparisons,'result',(SELECT jsonb_build_object('runId',b.run_id,'lockId',b.lock_id,'zeroResult',b.zero_result,'classifications',b.classifications) FROM app.final_check_run_binding b WHERE b.tenant_id=t AND b.job_id=j AND b.manifest_id=m),'signals',(SELECT coalesce(jsonb_agg(jsonb_build_object('signalId',s.id,'revision',s.revision,'description',s.description,'scopeItemId',s.matched_scope_item_id,'coalescedIntoSignalId',s.coalesced_into_signal_id,'permanentExclusion',(manifest.attempt>1 AND EXISTS(SELECT 1 FROM app.shadow_signal_evidence se JOIN app.evidence_invalidation invalid ON(invalid.tenant_id,invalid.evidence_id)=(se.tenant_id,se.evidence_id) WHERE se.tenant_id=t AND se.job_id=j AND se.signal_id=s.id)) OR s.disclosed_before_lock OR s.state='surfaced_early' OR EXISTS(SELECT 1 FROM app.shadow_signal_ineligibility i WHERE i.tenant_id=t AND i.job_id=j AND i.signal_id=s.id AND i.reason IN('disclosed_before_lock','surfaced_early','pre_adoption_evidence','attribution_disputed')) OR EXISTS(SELECT 1 FROM app.shadow_signal_disposition prior WHERE prior.tenant_id=t AND prior.job_id=j AND prior.signal_id=s.id),'evidenceIds',(SELECT coalesce(jsonb_agg(e.evidence_id ORDER BY e.evidence_id),'[]') FROM app.shadow_signal_evidence e WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=s.id AND e.source_received_at<=manifest.evidence_cutoff_at AND (manifest.attempt=1 OR EXISTS(SELECT 1 FROM app.final_check_processing_source ps WHERE ps.tenant_id=t AND ps.job_id=j AND ps.manifest_id=m AND ps.evidence_id=e.evidence_id)))) ORDER BY s.id),'[]') FROM app.shadow_commercial_signal s WHERE s.tenant_id=t AND s.job_id=j));
END $$;

COMMIT;
