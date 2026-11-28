BEGIN;

-- NULL selects the pilot branch on these four existing routines. It carries
-- no authority: the same transaction must have a persisted real pilot owner.
CREATE FUNCTION app.pilot_final_check_builder(t uuid,j uuid,locking boolean)
 RETURNS TABLE(member_id uuid,user_id uuid) LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE actor uuid:=app.current_actor();
BEGIN
 PERFORM app.pilot_final_account_owner(t,j,actor,locking);
 RETURN QUERY SELECT m.id,m.identity_user_id FROM app.membership m
 WHERE (m.tenant_id,m.id)=(t,actor) AND m.identity_user_id IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION app.pilot_final_check_builder(uuid,uuid,boolean) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_final_check_builder(uuid,uuid,boolean) FROM PUBLIC;

-- Use the same persisted proof verifier as the invoice gate. The pilot
-- request reserves its manifest as the check ID. A completed run alone,
-- or a result associated with any other request, cannot release findings.
CREATE FUNCTION app.require_pilot_final_check_run(t uuid,j uuid,l app.final_account_lock)
 RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE q infrastructure.final_check_request; run uuid;
BEGIN
 IF app.pilot_final_account_terms(t,j) IS DISTINCT FROM l.onboarding_terms_version
  OR NOT app.pilot_final_account_has_terms(t,j,l.onboarding_terms_version,l.locked_at)
 THEN RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED'; END IF;
 SELECT * INTO q FROM infrastructure.final_check_request
 WHERE (tenant_id,job_id,lock_id,attempt)=(t,j,l.id,1);
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 BEGIN
  SELECT proof.run_id INTO run FROM app.require_authoritative_final_check(t,j) proof
  JOIN app.shadow_final_check_completion cert
   ON (cert.tenant_id,cert.job_id,cert.check_id,cert.run_id,cert.lock_id)=(t,j,proof.check_id,proof.run_id,proof.lock_id)
  JOIN app.final_check_run_binding binding
   ON (binding.tenant_id,binding.job_id,binding.run_id,binding.lock_id,binding.manifest_id)=(t,j,cert.run_id,cert.lock_id,cert.manifest_id)
  WHERE (cert.lock_id,cert.check_id,cert.manifest_id,cert.evidence_cutoff_at)=(l.id,q.manifest_id,q.manifest_id,l.locked_at);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT IN ('FINAL_CHECK_NOT_COMPLETE','FINAL_CHECK_INVENTORY_INCOMPLETE','FINAL_CHECK_INPUT_UNAVAILABLE',
    'FINAL_CHECK_INPUT_MISMATCH','FINAL_CHECK_DETECTION_REQUIRED','FINAL_CHECK_SIGNAL_BINDING_INVALID',
    'FINAL_CHECK_RESULT_UNAVAILABLE','FINAL_CHECK_SOURCE_IDENTITY_CHANGED','FINAL_CHECK_LOCK_BINDING_INVALID') THEN RAISE; END IF;
 END;
 IF run IS NULL THEN
  IF q.cycle_state IN ('failed','completed')
   OR EXISTS(SELECT 1 FROM app.shadow_final_check_completion cert WHERE (cert.tenant_id,cert.job_id,cert.lock_id)=(t,j,l.id))
   OR EXISTS(SELECT 1 FROM app.final_check_source_attempt a
      WHERE (a.tenant_id,a.job_id,a.manifest_id)=(t,j,q.manifest_id)
       AND a.status IN ('failed','unsupported')
       AND a.sequence=(SELECT max(x.sequence) FROM app.final_check_source_attempt x
        WHERE (x.tenant_id,x.job_id,x.manifest_id,x.source_id)=(a.tenant_id,a.job_id,a.manifest_id,a.source_id)))
  THEN RAISE EXCEPTION 'FINAL_CHECK_FAILED'; END IF;
  RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE';
 END IF;
 RETURN run;
END $$;
ALTER FUNCTION app.require_pilot_final_check_run(uuid,uuid,app.final_account_lock) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_pilot_final_check_run(uuid,uuid,app.final_account_lock) FROM PUBLIC;

-- These four bodies retain the practice authority and commands from 0749.
CREATE OR REPLACE FUNCTION app.read_final_check_reveal(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR lower(nullif(current_setting('app.tenant_id',true),'')) IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE l app.final_account_lock;b app.final_check_run_binding;items jsonb;post_items jsonb;q infrastructure.final_check_request;checked boolean:=false; pilot_run uuid;
BEGIN
 IF d IS NULL THEN
  PERFORM app.pilot_final_check_builder(t,j,false);
 ELSE
  PERFORM app.final_check_read_authority(t,j,d);
 END IF;
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 -- Fixed pre-lock branch never reads a shadow or final_check fact relation.
 IF NOT FOUND THEN RETURN jsonb_build_object('state','unlocked','items','[]'::jsonb); END IF;
 IF d IS NULL THEN
  BEGIN
   pilot_run:=app.require_pilot_final_check_run(t,j,l);
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM NOT IN ('FINAL_CHECK_NOT_COMPLETE','FINAL_CHECK_FAILED') THEN RAISE; END IF;
   RETURN jsonb_build_object('state',CASE WHEN SQLERRM='FINAL_CHECK_FAILED' THEN 'failed' ELSE 'pending' END,
    'lockId',l.id,'items','[]'::jsonb);
  END;
 ELSE
  PERFORM app.final_check_builder(t,j,d);
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('signalId',s.id,'description',s.description,'evidenceAfterLock',true,'evidence',
  (SELECT jsonb_agg(jsonb_build_object('id',e.evidence_id,'objectVersionId',e.object_version_id,'sha256',e.sha256,'receivedAt',to_char(e.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'source',o.evidence_type) ORDER BY e.evidence_id)
   FROM app.shadow_signal_evidence e JOIN app.evidence_object o ON(o.tenant_id,o.job_id,o.id,o.object_version_id,o.sha256,o.server_received_at)=(e.tenant_id,e.job_id,e.evidence_id,e.object_version_id,e.sha256,e.source_received_at)
   WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=s.id AND e.source_received_at>l.locked_at AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id))) ORDER BY s.id),'[]') INTO post_items
 FROM app.shadow_commercial_signal s WHERE s.tenant_id=t AND s.job_id=j AND s.coalesced_into_signal_id IS NULL
 AND EXISTS(SELECT 1 FROM app.shadow_signal_evidence e WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=s.id AND e.source_received_at>l.locked_at AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id));
 SELECT * INTO q FROM infrastructure.final_check_request WHERE tenant_id=t AND job_id=j AND lock_id=l.id ORDER BY attempt DESC LIMIT 1;
 IF d IS NOT NULL AND (q.enqueued_at IS NOT NULL OR jsonb_array_length(q.cycle_history)>0) THEN
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
 SELECT b0.* INTO b FROM app.final_check_run_binding b0 JOIN app.final_check_manifest m0 ON(m0.tenant_id,m0.job_id,m0.id)=(b0.tenant_id,b0.job_id,b0.manifest_id) WHERE b0.tenant_id=t AND b0.job_id=j AND b0.lock_id=l.id AND b0.evidence_cutoff_at=l.locked_at AND (d IS NOT NULL OR b0.run_id=pilot_run) AND EXISTS(SELECT 1 FROM app.shadow_reconciliation_run r0 WHERE (r0.tenant_id,r0.job_id,r0.id,r0.status)=(t,j,b0.run_id,'completed')) ORDER BY m0.attempt DESC LIMIT 1;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('state',CASE WHEN EXISTS(SELECT 1 FROM app.final_check_source_attempt a JOIN app.final_check_manifest m ON(m.tenant_id,m.job_id,m.id)=(a.tenant_id,a.job_id,a.manifest_id) WHERE a.tenant_id=t AND a.job_id=j AND m.lock_id=l.id AND m.attempt=(SELECT max(latest.attempt) FROM app.final_check_manifest latest WHERE latest.tenant_id=t AND latest.job_id=j AND latest.lock_id=l.id) AND a.status IN('failed','unsupported') AND a.sequence=(SELECT max(x.sequence) FROM app.final_check_source_attempt x WHERE (x.tenant_id,x.job_id,x.manifest_id,x.source_id)=(a.tenant_id,a.job_id,a.manifest_id,a.source_id))) THEN 'failed' ELSE 'pending' END,'lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
 END IF;
 IF EXISTS(SELECT 1 FROM app.final_check_processing_source s WHERE s.tenant_id=t AND s.job_id=j AND s.manifest_id=b.manifest_id AND EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=s.evidence_id)) THEN
  RETURN jsonb_build_object('state','failed','lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('signalId',p.signal_id,'signalRevision',p.signal_revision,'description',p.description,'estimatedValuePence',(SELECT CASE
    WHEN count(*)=count(v.estimated_value_pence)
     AND count(DISTINCT v.estimated_value_pence)=1
     AND bool_and(v.estimated_value_pence BETWEEN 0 AND 1000000000000)
    THEN min(v.estimated_value_pence) ELSE NULL END
   FROM app.shadow_commercial_signal primary_signal
   JOIN app.shadow_commercial_signal v ON(v.tenant_id,v.job_id,v.work_id)=(primary_signal.tenant_id,primary_signal.job_id,primary_signal.work_id)
   JOIN app.shadow_signal_classification vc ON(vc.tenant_id,vc.job_id,vc.run_id,vc.signal_id)=(p.tenant_id,p.job_id,p.run_id,v.id)
   WHERE primary_signal.tenant_id=t AND primary_signal.job_id=j AND primary_signal.id=p.signal_id
    AND EXISTS(SELECT 1 FROM app.shadow_signal_evidence ve
     JOIN app.final_check_processing_source ps ON(ps.tenant_id,ps.job_id,ps.evidence_id,ps.object_version_id,ps.sha256,ps.source_received_at,ps.manifest_id)
      =(ve.tenant_id,ve.job_id,ve.evidence_id,ve.object_version_id,ve.sha256,ve.source_received_at,b.manifest_id)
     JOIN app.evidence_object eo ON(eo.tenant_id,eo.job_id,eo.id,eo.object_version_id,eo.sha256,eo.server_received_at)
      =(ve.tenant_id,ve.job_id,ve.evidence_id,ve.object_version_id,ve.sha256,ve.source_received_at)
     WHERE ve.tenant_id=t AND ve.job_id=j AND ve.signal_id=v.id AND ve.source_received_at<=l.locked_at
      AND eo.server_verified_at IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=ve.evidence_id))),
  'variationId',(SELECT v.id FROM app.variation v
   JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(v.tenant_id,v.job_id,v.id)
   JOIN app.command_receipt cr ON(cr.tenant_id,cr.command_id)=(o.tenant_id,o.command_id)
   WHERE db.answer='confirmed_extra' AND s.disposition='confirmed_extra'
    AND (s.tenant_id,s.job_id,s.run_id,s.signal_id)=(p.tenant_id,p.job_id,p.run_id,p.signal_id)
    AND db.lock_id=l.id AND db.expected_signal_revision=p.signal_revision
    AND v.tenant_id=t AND v.job_id=j AND v.id=db.command_id AND v.origin='jobguard_catch'
    AND o.kind='jobguard_catch' AND o.job_track='small_builder' AND o.provenance='command'
    AND o.source_signal_id=p.signal_id AND o.command_id=db.command_id
    AND cr.command_type='ConfirmJobGuardCatch' AND cr.status='succeeded'
    AND cr.actor_membership_id=db.actor_membership_id AND cr.request_hash=db.request_hash
    AND cr.semantic_key='extra-origin:'||j::text||':'||v.id::text
    AND cr.result->>'variationId'=v.id::text AND cr.result->>'dispositionId'=db.disposition_id::text
    AND cr.result->>'signalId'=p.signal_id::text AND cr.result->>'runId'=p.run_id::text
    AND cr.result->>'lockId'=l.id::text AND cr.result->>'disposition'='confirmed_extra'),'evidence',p.evidence,'comparisons',p.comparisons,
  'baselineHash',p.baseline_hash,'captureRegisterHash',p.capture_register_hash,'lineSetHash',p.line_set_hash,'evidenceSetHash',p.evidence_set_hash,'disposition',s.disposition,'answer',db.answer,'dispositionId',db.disposition_id) ORDER BY p.signal_id),'[]') INTO items
 FROM app.final_check_reveal_proof p JOIN app.shadow_signal_classification c ON(c.tenant_id,c.job_id,c.run_id,c.signal_id)=(p.tenant_id,p.job_id,p.run_id,p.signal_id)
 LEFT JOIN app.final_check_disposition_binding db ON(db.tenant_id,db.job_id,db.run_id,db.signal_id)=(p.tenant_id,p.job_id,p.run_id,p.signal_id)
 LEFT JOIN app.shadow_signal_disposition s ON(s.tenant_id,s.id)=(db.tenant_id,db.disposition_id)
 WHERE p.tenant_id=t AND p.job_id=j AND p.run_id=b.run_id AND c.outcome='reveal';
 -- 0247: the builder's own locked lines, so an answer can name the exact line it points at.
 RETURN jsonb_build_object('state','completed','lockId',l.id,'runId',b.run_id,'items',items,'postLockItems',post_items,
  'lockedLines',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',fl.id,'kind',fl.line_kind,'scopeItemId',fl.scope_item_id,'description',fl.description) ORDER BY fl.line_kind,fl.description,fl.id),'[]')
   FROM app.final_account_line fl WHERE fl.tenant_id=t AND fl.job_id=j AND fl.final_account_revision_id=l.final_account_revision_id));
END;
END
$$;

CREATE OR REPLACE FUNCTION app.record_final_check_disposition(t uuid,j uuid,d text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR lower(nullif(current_setting('app.tenant_id',true),'')) IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  -- LP6D_DIGEST: a digest that authenticates must be the bound actor; an unauthenticated one keeps the body's own refusal.
  OR coalesce((CASE WHEN d ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN (SELECT membership_id FROM app.contractor_session(d::uuid)) ELSE (SELECT membership_id FROM app.authenticate_practice_session(d,app.current_tenant())) END),app.current_actor()) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE actor record;prior app.command_receipt;proof app.final_check_reveal_proof;sig app.shadow_commercial_signal;l app.final_account_lock;pilot_run uuid;cid uuid;ref uuid;kind text;
 answer text;resolved text;request_digest text;result jsonb;disposition uuid:=gen_random_uuid();event uuid:=gen_random_uuid();
BEGIN
 IF d IS NULL THEN
  SELECT * INTO actor FROM app.pilot_final_check_builder(t,j,true);
 ELSE
  SELECT * INTO actor FROM app.final_check_builder(t,j,d,true);
 END IF;
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 IF d IS NULL THEN pilot_run:=app.require_pilot_final_check_run(t,j,l); END IF;
 -- Authority and its locks precede subject parsing and replay.
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 IF p->>'version' IS DISTINCT FROM 'final-check.disposition.v1' OR (SELECT count(*) FROM jsonb_object_keys(p))<>8
 OR NOT p ?& ARRAY['version','commandId','lockId','runId','signalId','expectedSignalRevision','answer','referenceId']
 OR jsonb_typeof(p->'version') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'commandId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'lockId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'runId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'signalId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'expectedSignalRevision') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'answer') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p->'referenceId') NOT IN('string','null')
 OR p->>'answer' IS NULL OR p->>'answer' NOT IN('already_included','in_original_scope','not_completed','not_chargeable','wrong_job_or_evidence')
 OR (p->>'expectedSignalRevision') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 cid:=(p->>'commandId')::uuid;answer:=p->>'answer';ref:=(p->>'referenceId')::uuid;
 IF cid IS NULL OR p->>'lockId' IS NULL OR p->>'runId' IS NULL OR p->>'signalId' IS NULL OR p->>'expectedSignalRevision' IS NULL
 OR (answer NOT IN('already_included','in_original_scope') AND ref IS NOT NULL) THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 request_digest:=app.final_lock_hash(jsonb_build_object('job',j,'actor',actor.member_id,'identity',actor.user_id,'payload',p));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||cid::text,145));
 IF d IS NULL THEN
  PERFORM app.pilot_final_check_builder(t,j,false);
 ELSIF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t) a WHERE a.membership_id=actor.member_id AND a.identity_user_id=actor.user_id) THEN
  RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN IF prior.command_type<>'RecordFinalCheckDisposition' OR prior.request_hash<>request_digest OR prior.actor_membership_id<>actor.member_id THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;RETURN prior.result; END IF;
 SELECT * INTO proof FROM app.final_check_reveal_proof WHERE tenant_id=t AND job_id=j AND run_id=(p->>'runId')::uuid AND signal_id=(p->>'signalId')::uuid AND lock_id=(p->>'lockId')::uuid AND (d IS NOT NULL OR (run_id,lock_id)=(pilot_run,l.id));
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.shadow_signal_classification WHERE tenant_id=t AND job_id=j AND run_id=proof.run_id AND signal_id=proof.signal_id AND outcome='reveal') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO sig FROM app.shadow_commercial_signal WHERE tenant_id=t AND job_id=j AND id=proof.signal_id FOR UPDATE;
 IF d IS NULL THEN
  PERFORM app.pilot_final_check_builder(t,j,false);
 ELSIF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t) a WHERE a.membership_id=actor.member_id AND a.identity_user_id=actor.user_id) THEN
  RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF sig.state<>'revealed' OR sig.revision<>(p->>'expectedSignalRevision')::integer OR proof.signal_revision<>sig.revision THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j AND id=proof.lock_id;
 IF ref IS NOT NULL THEN
  IF l.snapshot->'baselineScopeItemIds' ? ref::text THEN kind:='baseline';
  ELSIF answer='already_included' AND EXISTS(SELECT 1 FROM jsonb_array_elements(l.snapshot->'lines') line WHERE line.value->>'id'=ref::text) THEN kind:='line';
  ELSE RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 resolved:=CASE WHEN answer IN('already_included','in_original_scope') AND ref IS NULL THEN 'attribution_disputed' ELSE answer END;
 INSERT INTO app.shadow_signal_disposition(tenant_id,job_id,id,run_id,signal_id,disposition) VALUES(t,j,disposition,proof.run_id,proof.signal_id,resolved);
 INSERT INTO app.final_check_disposition_binding(tenant_id,job_id,disposition_id,run_id,signal_id,lock_id,expected_signal_revision,command_id,actor_membership_id,identity_user_id,answer,selected_reference_id,selected_reference_kind,request_hash,audit_event_id)
 VALUES(t,j,disposition,proof.run_id,proof.signal_id,l.id,sig.revision,cid,actor.member_id,actor.user_id,answer,ref,kind,request_digest,event);
 UPDATE app.shadow_commercial_signal SET state=CASE WHEN resolved='attribution_disputed' THEN 'attribution_disputed' ELSE 'dismissed' END,revision=revision+1 WHERE tenant_id=t AND job_id=j AND id=sig.id;
 IF resolved='attribution_disputed' THEN INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref) VALUES(t,j,gen_random_uuid(),sig.id,'attribution_disputed',disposition::text); END IF;
 result:=jsonb_build_object('dispositionId',disposition,'signalId',sig.id,'runId',proof.run_id,'lockId',l.id,'disposition',resolved);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(t,cid,'RecordFinalCheckDisposition',j::text,request_digest,'succeeded',result,actor.member_id,clock_timestamp());
 PERFORM app.append_final_check_audit(event,'membership:'||actor.member_id::text,j,'final_check.disposition_recorded',jsonb_build_object('dispositionId',disposition,'signalId',sig.id,'commandId',cid,'runId',proof.run_id));
 RETURN result;
END;
END
$$;

CREATE OR REPLACE FUNCTION app.read_final_check_disputes(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR lower(nullif(current_setting('app.tenant_id',true),'')) IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE l app.final_account_lock;pilot_run uuid;
BEGIN
 IF d IS NULL THEN
  PERFORM app.pilot_final_check_builder(t,j,false);
 ELSE
  PERFORM app.final_check_builder(t,j,d);
 END IF;
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
 IF d IS NULL THEN
  BEGIN
   pilot_run:=app.require_pilot_final_check_run(t,j,l);
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM NOT IN ('FINAL_CHECK_NOT_COMPLETE','FINAL_CHECK_FAILED') THEN RAISE; END IF;
   RETURN '[]'::jsonb;
  END;
 END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('dispositionId',b.disposition_id,'signalId',b.signal_id,'runId',b.run_id,'lockId',b.lock_id,'answer',b.answer) ORDER BY b.disposition_id),'[]')
 FROM app.final_check_disposition_binding b JOIN app.shadow_signal_disposition s ON(s.tenant_id,s.id)=(b.tenant_id,b.disposition_id) WHERE b.tenant_id=t AND b.job_id=j AND s.disposition='attribution_disputed' AND (d IS NOT NULL OR (b.run_id,b.lock_id)=(pilot_run,l.id)));
END;
END
$$;

CREATE OR REPLACE FUNCTION app.confirm_final_check_catch(t uuid,j uuid,d text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR lower(nullif(current_setting('app.tenant_id',true),'')) IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  -- LP6D_DIGEST: a digest that authenticates must be the bound actor; an unauthenticated one keeps the body's own refusal.
  OR coalesce((CASE WHEN d ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN (SELECT membership_id FROM app.contractor_session(d::uuid)) ELSE (SELECT membership_id FROM app.authenticate_practice_session(d,app.current_tenant())) END),app.current_actor()) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE actor record;prior app.command_receipt;proof app.final_check_reveal_proof;sig app.shadow_commercial_signal;l app.final_account_lock;pilot_run uuid;cid uuid;
 request_digest text;out_result jsonb;disposition uuid:=gen_random_uuid();event uuid:=gen_random_uuid();scope uuid:=gen_random_uuid();label text;
BEGIN
 IF d IS NULL THEN
  SELECT * INTO actor FROM app.pilot_final_check_builder(t,j,true);
 ELSE
  SELECT * INTO actor FROM app.final_check_builder(t,j,d,true);
 END IF;
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 IF d IS NULL THEN pilot_run:=app.require_pilot_final_check_run(t,j,l); END IF;
 -- Authority and its locks precede subject parsing and replay (same order as record_final_check_disposition).
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM 'final-check.catch.v1' OR (SELECT count(*) FROM jsonb_object_keys(p))<>6
 OR NOT p ?& ARRAY['version','commandId','lockId','runId','signalId','expectedSignalRevision']
 OR jsonb_typeof(p->'commandId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'lockId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'runId') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p->'signalId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'expectedSignalRevision') IS DISTINCT FROM 'number' OR (p->>'expectedSignalRevision') !~ '^[0-9]+$'
 THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 cid:=(p->>'commandId')::uuid;
 request_digest:=app.final_lock_hash(jsonb_build_object('job',j,'actor',actor.member_id,'identity',actor.user_id,'payload',p));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||cid::text,145));
 IF d IS NULL THEN
  PERFORM app.pilot_final_check_builder(t,j,false);
 ELSIF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t) a WHERE a.membership_id=actor.member_id AND a.identity_user_id=actor.user_id) THEN
  RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN IF prior.command_type<>'ConfirmJobGuardCatch' OR prior.request_hash<>request_digest OR prior.actor_membership_id<>actor.member_id OR prior.status<>'succeeded' THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;RETURN prior.result; END IF;
 SELECT * INTO proof FROM app.final_check_reveal_proof WHERE tenant_id=t AND job_id=j AND run_id=(p->>'runId')::uuid AND signal_id=(p->>'signalId')::uuid AND lock_id=(p->>'lockId')::uuid AND (d IS NOT NULL OR (run_id,lock_id)=(pilot_run,l.id));
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.shadow_signal_classification WHERE tenant_id=t AND job_id=j AND run_id=proof.run_id AND signal_id=proof.signal_id AND outcome='reveal') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO sig FROM app.shadow_commercial_signal WHERE tenant_id=t AND job_id=j AND id=proof.signal_id FOR UPDATE;
 IF d IS NULL THEN
  PERFORM app.pilot_final_check_builder(t,j,false);
 ELSIF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t) a WHERE a.membership_id=actor.member_id AND a.identity_user_id=actor.user_id) THEN
  RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF sig.state<>'revealed' OR sig.revision<>(p->>'expectedSignalRevision')::integer OR proof.signal_revision<>sig.revision THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 -- The extra-origin check requires the raising command's receipt in 'processing' with this exact semantic key; the variation id is the command id.
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(t,cid,'ConfirmJobGuardCatch','extra-origin:'||j::text||':'||cid::text,request_digest,'processing',actor.member_id);
 label:=left(proof.description,500);
 INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES(scope,t,j,'reserved');
 INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,existing_scope_item_id,lineage_parent_scope_item_id,capture_kind,capture_text,description,origin)
 VALUES(cid,t,j,scope,NULL,NULL,'text',left(proof.description,5000),label,'jobguard_catch');
 INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,command_id,raising_membership_id,raising_role,provenance,source_signal_id)
 VALUES(t,j,cid,'small_builder','jobguard_catch',cid,actor.member_id,'owner','command',sig.id);
 INSERT INTO app.shadow_signal_disposition(tenant_id,job_id,id,run_id,signal_id,disposition) VALUES(t,j,disposition,proof.run_id,proof.signal_id,'confirmed_extra');
 INSERT INTO app.final_check_disposition_binding(tenant_id,job_id,disposition_id,run_id,signal_id,lock_id,expected_signal_revision,command_id,actor_membership_id,identity_user_id,answer,selected_reference_id,selected_reference_kind,request_hash,audit_event_id)
 VALUES(t,j,disposition,proof.run_id,proof.signal_id,l.id,sig.revision,cid,actor.member_id,actor.user_id,'confirmed_extra',NULL,NULL,request_digest,event);
 UPDATE app.shadow_commercial_signal SET state='confirmed_extra',revision=revision+1 WHERE tenant_id=t AND job_id=j AND id=sig.id;
 out_result:=jsonb_build_object('dispositionId',disposition,'signalId',sig.id,'runId',proof.run_id,'lockId',l.id,'disposition','confirmed_extra','variationId',cid);
 UPDATE app.command_receipt SET status='succeeded',result=out_result,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=cid;
 PERFORM app.append_final_check_audit(event,'membership:'||actor.member_id::text,j,'final_check.catch_confirmed',jsonb_build_object('dispositionId',disposition,'signalId',sig.id,'commandId',cid,'runId',proof.run_id,'variationId',cid));
 RETURN out_result;
END;
END
$$;

COMMIT;
