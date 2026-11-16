BEGIN;
-- real-fc-typed-recovery: cycle != immutable manifest attempt. Forward recovery only.
ALTER TABLE infrastructure.final_check_request
 ADD COLUMN cycle_id uuid NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN cycle_state text NOT NULL DEFAULT 'requested' CHECK(cycle_state IN('requested','active','failed','completed')),
 ADD COLUMN executions integer NOT NULL DEFAULT 0 CHECK(executions BETWEEN 0 AND 3),
 ADD COLUMN cycle_history jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(cycle_history)='array');
-- Legacy enqueued work has no cycle fence. Rest it; an owner can restart the SAME
-- manifest. Never revive published work. Deploy with old workers drained.
UPDATE infrastructure.final_check_request SET cycle_state='failed' WHERE enqueued_at IS NOT NULL;
DO $$ DECLARE t uuid;q infrastructure.final_check_request;checked boolean; BEGIN
 FOR q IN SELECT * FROM infrastructure.final_check_request WHERE enqueued_at IS NOT NULL LOOP
  t:=q.tenant_id;
  PERFORM set_config('app.tenant_id',t::text,true);
  BEGIN
   checked:=EXISTS(SELECT 1 FROM app.require_authoritative_final_check(t,q.job_id) proof
   JOIN app.shadow_final_check_completion cert ON(cert.tenant_id,cert.job_id,cert.check_id,cert.run_id,cert.lock_id)=(t,q.job_id,proof.check_id,proof.run_id,proof.lock_id)
   JOIN app.final_check_run_binding binding ON(binding.tenant_id,binding.job_id,binding.run_id,binding.lock_id,binding.manifest_id)=(t,q.job_id,cert.run_id,cert.lock_id,cert.manifest_id)
   WHERE (cert.lock_id,cert.manifest_id)=(q.lock_id,q.manifest_id));
  EXCEPTION WHEN raise_exception THEN checked:=false;
  END;
  IF checked THEN UPDATE infrastructure.final_check_request SET cycle_state='completed' WHERE lock_id=q.lock_id AND attempt=q.attempt; END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION app.final_check_read_authority(t uuid,j uuid,d text,locking boolean DEFAULT false)
 RETURNS TABLE(member_id uuid,user_id uuid) LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE a record; owned boolean;
BEGIN
 PERFORM app.final_check_context(t);
 IF NOT pg_has_role(session_user,'jobguard_runtime','USAGE') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF locking THEN PERFORM 1 FROM control_plane.practice_session WHERE token_digest=d FOR SHARE; END IF;
 SELECT * INTO a FROM app.authenticate_practice_session(d,t);
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF locking THEN PERFORM 1 FROM app.membership WHERE tenant_id=t AND id=a.membership_id AND identity_user_id=a.identity_user_id FOR SHARE; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=a.membership_id AND identity_user_id=a.identity_user_id AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 WITH RECURSIVE owned_jobs AS (
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=d
  UNION SELECT child.id FROM owned_jobs source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
  JOIN app.job child ON child.tenant_id=e.tenant_id AND child.id::text=e.subject_ref AND child.provenance='imported' AND child.practice_session_digest IS NULL
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=child.id AND iv.source_job_id=source.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||child.id::text AND rv.result->>'jobId'=child.id::text AND rv.result->>'sourceJobId'=source.id::text))
 ) SELECT EXISTS(SELECT 1 FROM owned_jobs WHERE id=j) INTO owned;

 IF NOT owned OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND job_track='small_builder' AND environment='synthetic_demo') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF locking THEN
  PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
  -- Recheck deadlines after every wait before replay or effects.
  IF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t) s WHERE s.membership_id=a.membership_id AND s.identity_user_id=a.identity_user_id) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=a.membership_id AND identity_user_id=a.identity_user_id AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT a.membership_id::uuid,a.identity_user_id::uuid;
END $$;
CREATE OR REPLACE FUNCTION app.final_check_builder(t uuid,j uuid,d text,locking boolean DEFAULT false)
 RETURNS TABLE(member_id uuid,user_id uuid) LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 RETURN QUERY SELECT * FROM app.final_check_read_authority(t,j,d,locking);
 IF NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION app.admit_final_check_cycle(t uuid,j uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,app,infrastructure AS $$
DECLARE l app.final_account_lock;m app.final_check_manifest;q infrastructure.final_check_request;next_attempt integer:=1;
BEGIN
 PERFORM app.ch4_require_open(t,j);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 SELECT * INTO q FROM infrastructure.final_check_request WHERE tenant_id=t AND job_id=j AND lock_id=l.id ORDER BY attempt DESC LIMIT 1 FOR UPDATE;
 -- Only a managed terminal failure may restart this same manifest. A publication,
 -- even invalidated, belongs to the separate checked rerun authority below.
 IF q.cycle_state='failed' AND (q.enqueued_at IS NOT NULL OR jsonb_array_length(q.cycle_history)>0)
 AND NOT EXISTS(SELECT 1 FROM app.shadow_final_check_completion cert WHERE (cert.tenant_id,cert.job_id,cert.lock_id,cert.manifest_id)=(t,j,l.id,q.manifest_id)) THEN
  UPDATE infrastructure.final_check_request SET
   cycle_history=cycle_history||jsonb_build_array(jsonb_build_object('cycleId',cycle_id,'executions',executions,'state',cycle_state)),
   cycle_id=gen_random_uuid(),cycle_state='requested',executions=0,enqueued_at=NULL
  WHERE lock_id=q.lock_id AND attempt=q.attempt RETURNING * INTO q;
 ELSE
  SELECT * INTO m FROM app.final_check_manifest WHERE tenant_id=t AND job_id=j AND lock_id=l.id ORDER BY attempt DESC LIMIT 1;
  IF FOUND THEN
   PERFORM app.require_final_check_rerun(t,j,m.id);
   next_attempt:=m.attempt+1;
  END IF;
  -- This is the original pre-manifest replay only. Once begin has run the
  -- rerun guard returns PENDING, without changing any request or history.
  INSERT INTO infrastructure.final_check_request(lock_id,tenant_id,job_id,attempt) VALUES(l.id,t,j,next_attempt) ON CONFLICT DO NOTHING;
  SELECT * INTO q FROM infrastructure.final_check_request WHERE tenant_id=t AND job_id=j AND lock_id=l.id AND attempt=next_attempt;
 END IF;
 IF q.manifest_id IS NULL THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('version','final-check-run-request.v1','lockId',l.id,'attempt',q.attempt,'manifestId',q.manifest_id,'state','requested','environment','synthetic_demo');
END $$;
CREATE OR REPLACE FUNCTION app.request_final_check_run(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$
DECLARE actor record;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('final-check-cycle:'||t::text||':'||j::text,1430));
 -- Same owner, practice-session, synthetic small-builder and accepted-terms authority as the builder reads.
 SELECT * INTO actor FROM app.final_check_builder(t,j,d,true);
 IF NOT app.final_check_practice_owns_job(t,j,d) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN app.admit_final_check_cycle(t,j);
END $$;
CREATE OR REPLACE FUNCTION app.company_final_check_request_run(j uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $$
DECLARE b jsonb:=app.bound_context_reader(); t uuid:=(b->>'tenant_id')::uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('final-check-cycle:'||t::text||':'||j::text,1430));
 PERFORM app.company_final_check_authority(j,b);
 IF NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1')
 THEN RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED'; END IF;
 RETURN app.admit_final_check_cycle(t,j);
END $$;
-- Checked lifecycle writes: no general infrastructure UPDATE grant.
CREATE FUNCTION app.final_check_cycle_claim(t uuid,j uuid,l uuid,m uuid,a integer,c uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$
BEGIN
 PERFORM app.final_check_worker(t,j);
 PERFORM app.ch4_require_open(t,j);
 UPDATE infrastructure.final_check_request SET executions=executions+1,cycle_state='active'
 WHERE (tenant_id,job_id,lock_id,manifest_id,attempt,cycle_id)=(t,j,l,m,a,c)
 AND cycle_state IN('requested','active') AND executions<3 AND enqueued_at IS NOT NULL;
 RETURN FOUND;
END $$;
CREATE FUNCTION app.final_check_cycle_finish(t uuid,j uuid,l uuid,m uuid,a integer,c uuid,succeeded boolean) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 OR NOT pg_has_role(session_user,'jobguard_shadow','USAGE') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM infrastructure.final_check_request WHERE (tenant_id,job_id,lock_id,manifest_id,attempt,cycle_id)=(t,j,l,m,a,c) AND cycle_state='active') THEN RETURN; END IF;
 -- A lost publication response reconciles only the exact current checked fact.
 BEGIN
  IF EXISTS(SELECT 1 FROM app.require_authoritative_final_check(t,j) proof
   JOIN app.shadow_final_check_completion cert ON(cert.tenant_id,cert.job_id,cert.check_id,cert.run_id,cert.lock_id)=(t,j,proof.check_id,proof.run_id,proof.lock_id)
   JOIN app.final_check_run_binding binding ON(binding.tenant_id,binding.job_id,binding.run_id,binding.lock_id,binding.manifest_id)=(t,j,cert.run_id,cert.lock_id,cert.manifest_id)
   WHERE (cert.lock_id,cert.manifest_id)=(l,m)) THEN succeeded:=true;
  ELSIF succeeded THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 EXCEPTION WHEN raise_exception THEN
  IF succeeded THEN RAISE; END IF;
 END;
 UPDATE infrastructure.final_check_request SET cycle_state=CASE WHEN succeeded THEN 'completed' WHEN executions>=3 THEN 'failed' ELSE 'active' END
 WHERE (tenant_id,job_id,lock_id,manifest_id,attempt,cycle_id)=(t,j,l,m,a,c) AND cycle_state='active';
END $$;
-- Scheduler may only rest an exact admitted cycle. Queue exhaustion is observed by
-- the infrastructure login, which owns Graphile; completion still requires a checked certificate.
CREATE FUNCTION infrastructure.final_check_cycle_exhausted(l uuid,m uuid,c uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$
DECLARE request infrastructure.final_check_request;checked boolean:=false;
BEGIN
 IF NOT pg_has_role(session_user,'jobguard_infrastructure','USAGE') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO request FROM infrastructure.final_check_request q WHERE (q.lock_id,q.manifest_id,q.cycle_id)=(l,m,c);
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('final-check-cycle:'||request.tenant_id::text||':'||request.job_id::text,1430)) THEN RETURN; END IF;
 PERFORM set_config('app.tenant_id',request.tenant_id::text,true);
 BEGIN
  checked:=EXISTS(SELECT 1 FROM app.require_authoritative_final_check(request.tenant_id,request.job_id) proof
   JOIN app.shadow_final_check_completion cert ON(cert.tenant_id,cert.job_id,cert.check_id,cert.run_id,cert.lock_id)=(request.tenant_id,request.job_id,proof.check_id,proof.run_id,proof.lock_id)
   JOIN app.final_check_run_binding binding ON(binding.tenant_id,binding.job_id,binding.run_id,binding.lock_id,binding.manifest_id)=(request.tenant_id,request.job_id,cert.run_id,cert.lock_id,cert.manifest_id)
   WHERE (cert.lock_id,cert.manifest_id)=(l,m));
 EXCEPTION WHEN raise_exception THEN checked:=false;
 END;
 UPDATE infrastructure.final_check_request q SET cycle_state=CASE WHEN checked THEN 'completed' ELSE 'failed' END
 WHERE (q.lock_id,q.manifest_id,q.cycle_id)=(l,m,c) AND q.cycle_state IN('requested','active') AND q.enqueued_at IS NOT NULL;
END $$;
CREATE OR REPLACE FUNCTION app.read_final_check_reveal(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE l app.final_account_lock;b app.final_check_run_binding;items jsonb;post_items jsonb;q infrastructure.final_check_request;checked boolean:=false;
BEGIN
 PERFORM app.final_check_read_authority(t,j,d);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 -- Fixed pre-lock branch never reads a shadow or final_check fact relation.
 IF NOT FOUND THEN RETURN jsonb_build_object('state','unlocked','items','[]'::jsonb); END IF;
 PERFORM app.final_check_builder(t,j,d);
 SELECT coalesce(jsonb_agg(jsonb_build_object('signalId',s.id,'description',s.description,'evidenceAfterLock',true,'evidence',
  (SELECT jsonb_agg(jsonb_build_object('id',e.evidence_id,'objectVersionId',e.object_version_id,'sha256',e.sha256,'receivedAt',to_char(e.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'source',o.evidence_type) ORDER BY e.evidence_id)
   FROM app.shadow_signal_evidence e JOIN app.evidence_object o ON(o.tenant_id,o.job_id,o.id,o.object_version_id,o.sha256,o.server_received_at)=(e.tenant_id,e.job_id,e.evidence_id,e.object_version_id,e.sha256,e.source_received_at)
   WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=s.id AND e.source_received_at>l.locked_at AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id))) ORDER BY s.id),'[]') INTO post_items
 FROM app.shadow_commercial_signal s WHERE s.tenant_id=t AND s.job_id=j AND s.coalesced_into_signal_id IS NULL
 AND EXISTS(SELECT 1 FROM app.shadow_signal_evidence e WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=s.id AND e.source_received_at>l.locked_at AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id));
 SELECT * INTO q FROM infrastructure.final_check_request WHERE tenant_id=t AND job_id=j AND lock_id=l.id ORDER BY attempt DESC LIMIT 1;
 IF q.enqueued_at IS NOT NULL OR jsonb_array_length(q.cycle_history)>0 THEN
  BEGIN
   checked:=EXISTS(SELECT 1 FROM app.require_authoritative_final_check(t,j) proof
   JOIN app.shadow_final_check_completion cert ON(cert.tenant_id,cert.job_id,cert.check_id,cert.run_id,cert.lock_id)=(t,j,proof.check_id,proof.run_id,proof.lock_id)
   JOIN app.final_check_run_binding binding ON(binding.tenant_id,binding.job_id,binding.run_id,binding.lock_id,binding.manifest_id)=(t,j,cert.run_id,cert.lock_id,cert.manifest_id)
   WHERE (cert.lock_id,cert.manifest_id)=(q.lock_id,q.manifest_id));
  EXCEPTION WHEN raise_exception THEN checked:=false;
  END;
  IF NOT checked THEN
   RETURN jsonb_build_object('state',CASE WHEN q.cycle_state IN('failed','completed') THEN 'failed' ELSE 'pending' END,'lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
  END IF;
 END IF;
 SELECT b0.* INTO b FROM app.final_check_run_binding b0 JOIN app.final_check_manifest m0 ON(m0.tenant_id,m0.job_id,m0.id)=(b0.tenant_id,b0.job_id,b0.manifest_id) WHERE b0.tenant_id=t AND b0.job_id=j AND b0.lock_id=l.id AND b0.evidence_cutoff_at=l.locked_at AND EXISTS(SELECT 1 FROM app.shadow_reconciliation_run r0 WHERE (r0.tenant_id,r0.job_id,r0.id,r0.status)=(t,j,b0.run_id,'completed')) ORDER BY m0.attempt DESC LIMIT 1;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('state',CASE WHEN EXISTS(SELECT 1 FROM app.final_check_source_attempt a JOIN app.final_check_manifest m ON(m.tenant_id,m.job_id,m.id)=(a.tenant_id,a.job_id,a.manifest_id) WHERE a.tenant_id=t AND a.job_id=j AND m.lock_id=l.id AND m.attempt=(SELECT max(latest.attempt) FROM app.final_check_manifest latest WHERE latest.tenant_id=t AND latest.job_id=j AND latest.lock_id=l.id) AND a.status IN('failed','unsupported') AND a.sequence=(SELECT max(x.sequence) FROM app.final_check_source_attempt x WHERE (x.tenant_id,x.job_id,x.manifest_id,x.source_id)=(a.tenant_id,a.job_id,a.manifest_id,a.source_id))) THEN 'failed' ELSE 'pending' END,'lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
 END IF;
 IF EXISTS(SELECT 1 FROM app.final_check_processing_source s WHERE s.tenant_id=t AND s.job_id=j AND s.manifest_id=b.manifest_id AND EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=s.evidence_id)) THEN
  RETURN jsonb_build_object('state','failed','lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('signalId',p.signal_id,'signalRevision',p.signal_revision,'description',p.description,'estimatedValuePence',(SELECT CASE WHEN count(DISTINCT v.estimated_value_pence)=1 AND bool_and(v.estimated_value_pence BETWEEN 0 AND 1000000000000) THEN min(v.estimated_value_pence) ELSE NULL END FROM app.shadow_commercial_signal v JOIN app.shadow_commercial_signal primary_signal ON primary_signal.tenant_id=v.tenant_id AND primary_signal.job_id=v.job_id AND primary_signal.work_id=v.work_id WHERE primary_signal.tenant_id=t AND primary_signal.job_id=j AND primary_signal.id=p.signal_id AND EXISTS(SELECT 1 FROM app.shadow_signal_evidence ve JOIN app.final_check_processing_source ps ON(ps.tenant_id,ps.job_id,ps.evidence_id,ps.manifest_id)=(ve.tenant_id,ve.job_id,ve.evidence_id,b.manifest_id) WHERE ve.tenant_id=t AND ve.job_id=j AND ve.signal_id=v.id AND ve.source_received_at<=l.locked_at)),'evidence',p.evidence,'comparisons',p.comparisons,
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
CREATE OR REPLACE FUNCTION app.company_final_check_reveal(j uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb:=app.bound_context_reader(); t uuid:=(ctx->>'tenant_id')::uuid; l app.final_account_lock;b app.final_check_run_binding;items jsonb;post_items jsonb;q infrastructure.final_check_request;checked boolean:=false;
BEGIN
 PERFORM app.company_final_check_authority(j,ctx);

 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 -- Fixed pre-lock branch never reads a shadow or final_check fact relation.
 IF NOT FOUND THEN RETURN jsonb_build_object('state','unlocked','items','[]'::jsonb); END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1')
 THEN RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('signalId',s.id,'description',s.description,'evidenceAfterLock',true,'evidence',
  (SELECT jsonb_agg(jsonb_build_object('id',e.evidence_id,'objectVersionId',e.object_version_id,'sha256',e.sha256,'receivedAt',to_char(e.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'source',o.evidence_type) ORDER BY e.evidence_id)
   FROM app.shadow_signal_evidence e JOIN app.evidence_object o ON(o.tenant_id,o.job_id,o.id,o.object_version_id,o.sha256,o.server_received_at)=(e.tenant_id,e.job_id,e.evidence_id,e.object_version_id,e.sha256,e.source_received_at)
   WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=s.id AND e.source_received_at>l.locked_at AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id))) ORDER BY s.id),'[]') INTO post_items
 FROM app.shadow_commercial_signal s WHERE s.tenant_id=t AND s.job_id=j AND s.coalesced_into_signal_id IS NULL
 AND EXISTS(SELECT 1 FROM app.shadow_signal_evidence e WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=s.id AND e.source_received_at>l.locked_at AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id));
 SELECT * INTO q FROM infrastructure.final_check_request WHERE tenant_id=t AND job_id=j AND lock_id=l.id ORDER BY attempt DESC LIMIT 1;
 IF q.enqueued_at IS NOT NULL OR jsonb_array_length(q.cycle_history)>0 THEN
  BEGIN
   checked:=EXISTS(SELECT 1 FROM app.require_authoritative_final_check(t,j) proof
   JOIN app.shadow_final_check_completion cert ON(cert.tenant_id,cert.job_id,cert.check_id,cert.run_id,cert.lock_id)=(t,j,proof.check_id,proof.run_id,proof.lock_id)
   JOIN app.final_check_run_binding binding ON(binding.tenant_id,binding.job_id,binding.run_id,binding.lock_id,binding.manifest_id)=(t,j,cert.run_id,cert.lock_id,cert.manifest_id)
   WHERE (cert.lock_id,cert.manifest_id)=(q.lock_id,q.manifest_id));
  EXCEPTION WHEN raise_exception THEN checked:=false;
  END;
  IF NOT checked THEN
   RETURN jsonb_build_object('state',CASE WHEN q.cycle_state IN('failed','completed') THEN 'failed' ELSE 'pending' END,'lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
  END IF;
 END IF;
 SELECT b0.* INTO b FROM app.final_check_run_binding b0 JOIN app.final_check_manifest m0 ON(m0.tenant_id,m0.job_id,m0.id)=(b0.tenant_id,b0.job_id,b0.manifest_id) WHERE b0.tenant_id=t AND b0.job_id=j AND b0.lock_id=l.id AND b0.evidence_cutoff_at=l.locked_at AND EXISTS(SELECT 1 FROM app.shadow_reconciliation_run r0 WHERE (r0.tenant_id,r0.job_id,r0.id,r0.status)=(t,j,b0.run_id,'completed')) ORDER BY m0.attempt DESC LIMIT 1;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('state',CASE WHEN EXISTS(SELECT 1 FROM app.final_check_source_attempt a JOIN app.final_check_manifest m ON(m.tenant_id,m.job_id,m.id)=(a.tenant_id,a.job_id,a.manifest_id) WHERE a.tenant_id=t AND a.job_id=j AND m.lock_id=l.id AND m.attempt=(SELECT max(latest.attempt) FROM app.final_check_manifest latest WHERE latest.tenant_id=t AND latest.job_id=j AND latest.lock_id=l.id) AND a.status IN('failed','unsupported') AND a.sequence=(SELECT max(x.sequence) FROM app.final_check_source_attempt x WHERE (x.tenant_id,x.job_id,x.manifest_id,x.source_id)=(a.tenant_id,a.job_id,a.manifest_id,a.source_id))) THEN 'failed' ELSE 'pending' END,'lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
 END IF;
 IF EXISTS(SELECT 1 FROM app.final_check_processing_source s WHERE s.tenant_id=t AND s.job_id=j AND s.manifest_id=b.manifest_id AND EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=s.evidence_id)) THEN
  RETURN jsonb_build_object('state','failed','lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('signalId',p.signal_id,'signalRevision',p.signal_revision,'description',p.description,'estimatedValuePence',(SELECT CASE WHEN count(DISTINCT v.estimated_value_pence)=1 AND bool_and(v.estimated_value_pence BETWEEN 0 AND 1000000000000) THEN min(v.estimated_value_pence) ELSE NULL END FROM app.shadow_commercial_signal v JOIN app.shadow_commercial_signal primary_signal ON primary_signal.tenant_id=v.tenant_id AND primary_signal.job_id=v.job_id AND primary_signal.work_id=v.work_id WHERE primary_signal.tenant_id=t AND primary_signal.job_id=j AND primary_signal.id=p.signal_id AND EXISTS(SELECT 1 FROM app.shadow_signal_evidence ve JOIN app.final_check_processing_source ps ON(ps.tenant_id,ps.job_id,ps.evidence_id,ps.manifest_id)=(ve.tenant_id,ve.job_id,ve.evidence_id,b.manifest_id) WHERE ve.tenant_id=t AND ve.job_id=j AND ve.signal_id=v.id AND ve.source_received_at<=l.locked_at)),'evidence',p.evidence,'comparisons',p.comparisons,
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
ALTER FUNCTION app.final_check_read_authority(uuid,uuid,text,boolean) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_read_authority(uuid,uuid,text,boolean) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
ALTER FUNCTION app.admit_final_check_cycle(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.admit_final_check_cycle(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
ALTER FUNCTION app.final_check_cycle_claim(uuid,uuid,uuid,uuid,integer,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_cycle_claim(uuid,uuid,uuid,uuid,integer,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.final_check_cycle_claim(uuid,uuid,uuid,uuid,integer,uuid) TO jobguard_shadow;
ALTER FUNCTION app.final_check_cycle_finish(uuid,uuid,uuid,uuid,integer,uuid,boolean) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_cycle_finish(uuid,uuid,uuid,uuid,integer,uuid,boolean) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.final_check_cycle_finish(uuid,uuid,uuid,uuid,integer,uuid,boolean) TO jobguard_shadow;
ALTER FUNCTION infrastructure.final_check_cycle_exhausted(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION infrastructure.final_check_cycle_exhausted(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION infrastructure.final_check_cycle_exhausted(uuid,uuid,uuid) TO jobguard_infrastructure;
COMMIT;
