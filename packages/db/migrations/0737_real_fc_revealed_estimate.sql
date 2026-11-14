BEGIN;
-- Completed authorised reveal only. Estimates are persisted proposals, never prices.
-- A null persisted member or conflicting historical group remains unpriced.
-- Forward fix: replace this exact successor in a new migration; never rewrite history.
DO $guard$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='app.read_final_check_reveal(uuid,uuid,text)'::regprocedure
  AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') IN
   ('ae4fcf69bcbd955fce9e535241c0a94f3f9bfb9a1b731b64e066b0894dfa8940','4adecd9482b1b9bf3dda02c4270d24284dd2a40fe4d7a4a196e64cbf4842fa67')
  AND p.proowner='jobguard_migration'::regrole AND p.prosecdef
  AND p.proconfig=ARRAY['search_path=pg_catalog, app']
  AND p.proacl::text='{jobguard_migration=X/jobguard_migration,jobguard_runtime=X/jobguard_migration}')
 THEN RAISE EXCEPTION 'SAVED_ESTIMATE_UNEXPECTED_PREDECESSOR'; END IF;
END $guard$;
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
END $$;
COMMIT;
