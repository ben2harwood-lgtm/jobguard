BEGIN;
-- SV-5 reveal screen: restate 0238's read unchanged except that a completed check also
-- returns the locked final-account lines (builder data only, no shadow fact). Owner and ACL
-- are kept by CREATE OR REPLACE.
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
 SELECT * INTO b FROM app.final_check_run_binding WHERE tenant_id=t AND job_id=j AND lock_id=l.id AND evidence_cutoff_at=l.locked_at;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('state',CASE WHEN EXISTS(SELECT 1 FROM app.final_check_source_attempt a JOIN app.final_check_manifest m ON(m.tenant_id,m.job_id,m.id)=(a.tenant_id,a.job_id,a.manifest_id) WHERE a.tenant_id=t AND a.job_id=j AND m.lock_id=l.id AND a.status IN('failed','unsupported') AND a.sequence=(SELECT max(x.sequence) FROM app.final_check_source_attempt x WHERE (x.tenant_id,x.job_id,x.manifest_id,x.source_id)=(a.tenant_id,a.job_id,a.manifest_id,a.source_id))) THEN 'failed' ELSE 'pending' END,'lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
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
COMMIT;
