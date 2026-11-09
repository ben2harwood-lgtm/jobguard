BEGIN;
-- DEMO-S / MON-3, dark company-only database authority. No existing routine is replaced.
-- Follows 0697 bound-context-reader and 0698 LS-142 attempt identities.
CREATE FUNCTION app.company_final_check_authority(j uuid,b jsonb) RETURNS void
 LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=(b->>'tenant_id')::uuid; a uuid:=(b->>'actor_id')::uuid; practice_owned boolean;
BEGIN
 IF b IS NULL OR t IS NULL OR a IS NULL OR j IS NULL
  OR b IS DISTINCT FROM app.bound_context_reader()
  OR current_database() IS DISTINCT FROM 'jobguard_synthetic_demo'
  OR current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
  OR NOT pg_has_role(session_user,'jobguard_runtime','USAGE')
  OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'COMPANY_FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- The pair deliberately has no credential kind. Exclude EVERY tenant reachable
 -- through either non-real resolver, including revoked historical contractor sessions.
 -- Home practice has two fixed tenants; contractor sessions are tenant-bound.
 IF t IN ('11111111-1111-4111-8111-111111111111'::uuid,'33333333-3333-4333-8333-333333333333'::uuid)
  OR EXISTS(SELECT 1 FROM control_plane.contractor_practice_session s WHERE s.tenant_id=t)
  OR EXISTS(SELECT 1 FROM control_plane.practice_company_marker k WHERE k.tenant_id=t)
 THEN RAISE EXCEPTION 'COMPANY_FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Same order as the existing lock: job, variations, membership, audit last.
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'COMPANY_FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.variation WHERE tenant_id=t AND job_id=j ORDER BY id FOR UPDATE;
 PERFORM 1 FROM app.membership WHERE tenant_id=t AND id=a FOR SHARE;
 -- Fresh statements AFTER all waits, and before any replay or business read/write.
 IF b IS DISTINCT FROM app.bound_context_reader()
  OR NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=a AND m.role='owner'
   AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()))
  OR NOT EXISTS(SELECT 1 FROM app.job jb JOIN app.job_commercial_track tr ON (tr.tenant_id,tr.job_id)=(jb.tenant_id,jb.id)
   WHERE jb.tenant_id=t AND jb.id=j AND jb.practice_session_digest IS NULL
    AND tr.job_track='small_builder' AND tr.environment='synthetic_demo')
 THEN RAISE EXCEPTION 'COMPANY_FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Follow all recorded parent forms, with UNION (not UNION ALL) to terminate cycles.
 WITH RECURSIVE edges(child,source) AS (
  SELECT i.job_id,i.source_job_id FROM app.job_import_v3 i WHERE i.tenant_id=t
  UNION SELECT (r.result->>'jobId')::uuid,nullif(r.result->>'sourceJobId','')::uuid FROM app.command_receipt r
   WHERE r.tenant_id=t AND r.command_type='job.adopt_in_flight' AND r.status='succeeded'
    AND r.result->>'jobId' IS NOT NULL
  UNION SELECT e.subject_ref::uuid,nullif(e.payload->'references'->>'sourceJobId','')::uuid FROM app.audit_event e
   WHERE e.tenant_id=t AND e.event_type='job.imported_baseline_attested' AND e.subject_type='job'
 ), parents(id) AS (
  SELECT j UNION SELECT edge.source FROM parents p JOIN edges edge ON edge.child=p.id WHERE edge.source IS NOT NULL
 ) SELECT EXISTS(SELECT 1 FROM parents p LEFT JOIN app.job jb ON jb.tenant_id=t AND jb.id=p.id
  WHERE jb.id IS NULL OR jb.practice_session_digest IS NOT NULL) INTO practice_owned;
 IF practice_owned THEN RAISE EXCEPTION 'COMPANY_FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION app.company_final_check_authority(uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.company_final_check_authority(uuid,jsonb)
 FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;

CREATE FUNCTION app.company_final_check_read(j uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $$
DECLARE b jsonb:=app.bound_context_reader(); t uuid:=(b->>'tenant_id')::uuid;
BEGIN
 PERFORM app.company_final_check_authority(j,b);
 RETURN jsonb_build_object('version','company-final-check-read.v1',
  'draft',(SELECT to_jsonb(r) FROM app.final_account_draft d JOIN app.final_account_revision r
   ON (r.tenant_id,r.job_id,r.id)=(d.tenant_id,d.job_id,d.current_revision_id) WHERE d.tenant_id=t AND d.job_id=j),
  'lines',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.ordinal),'[]') FROM app.final_account_line l
   JOIN app.final_account_draft d ON (d.tenant_id,d.job_id,d.current_revision_id)=(l.tenant_id,l.job_id,l.final_account_revision_id)
   WHERE l.tenant_id=t AND l.job_id=j),
  'lock',(SELECT to_jsonb(l) FROM app.final_account_lock l WHERE l.tenant_id=t AND l.job_id=j),
  'termsAccepted',EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1'),
  'dispositions',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.scope_item_id),'[]') FROM
   (SELECT DISTINCT ON (scope_item_id) scope_item_id,disposition FROM app.final_account_scope_disposition
    WHERE tenant_id=t AND job_id=j ORDER BY scope_item_id,recorded_at DESC,id DESC) d));
END $$;

CREATE FUNCTION app.company_final_check_terms(j uuid,c uuid,v text) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $$
DECLARE b jsonb:=app.bound_context_reader(); t uuid:=(b->>'tenant_id')::uuid;
BEGIN
 IF b IS NULL THEN RAISE EXCEPTION 'COMPANY_FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Take the legacy terms serialization lock before authority checks, so its
 -- internal acquisition cannot introduce an unchecked wait before replay.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':final-check-terms',130));
 PERFORM app.company_final_check_authority(j,b);
 RETURN app.accept_final_check_terms(t,(b->>'actor_id')::uuid,c,v);
END $$;

CREATE FUNCTION app.company_final_check_disposition(j uuid,c uuid,s uuid,d text) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $$
DECLARE b jsonb:=app.bound_context_reader();
BEGIN
 PERFORM app.company_final_check_authority(j,b);
 RETURN app.record_final_account_disposition((b->>'tenant_id')::uuid,j,(b->>'actor_id')::uuid,c,s,d);
END $$;

CREATE FUNCTION app.company_final_check_lock(j uuid,c uuid,r uuid,e integer,d text) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $$
DECLARE b jsonb:=app.bound_context_reader(); l app.final_account_lock;
BEGIN
 PERFORM app.company_final_check_authority(j,b);
 l:=app.lock_final_account((b->>'tenant_id')::uuid,j,(b->>'actor_id')::uuid,c,r,e,d);
 -- Preserve the exact immutable result on replay.
 RETURN to_jsonb(l);
END $$;

CREATE FUNCTION app.company_final_check_request_run(j uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $$
DECLARE b jsonb:=app.bound_context_reader(); t uuid:=(b->>'tenant_id')::uuid; l app.final_account_lock;m app.final_check_manifest;q infrastructure.final_check_request;next_attempt integer:=1;
BEGIN
 PERFORM app.company_final_check_authority(j,b);
 IF NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1')
 THEN RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED'; END IF;
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

CREATE FUNCTION app.company_final_check_reveal(j uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb:=app.bound_context_reader(); t uuid:=(ctx->>'tenant_id')::uuid; l app.final_account_lock;b app.final_check_run_binding;items jsonb;post_items jsonb;
BEGIN
 PERFORM app.company_final_check_authority(j,ctx);
 IF NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1')
 THEN RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED'; END IF;
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

ALTER FUNCTION app.company_final_check_read(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.company_final_check_read(uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.company_final_check_read(uuid) TO jobguard_runtime;
ALTER FUNCTION app.company_final_check_terms(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.company_final_check_terms(uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.company_final_check_terms(uuid,uuid,text) TO jobguard_runtime;
ALTER FUNCTION app.company_final_check_disposition(uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.company_final_check_disposition(uuid,uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.company_final_check_disposition(uuid,uuid,uuid,text) TO jobguard_runtime;
ALTER FUNCTION app.company_final_check_lock(uuid,uuid,uuid,integer,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.company_final_check_lock(uuid,uuid,uuid,integer,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.company_final_check_lock(uuid,uuid,uuid,integer,text) TO jobguard_runtime;
ALTER FUNCTION app.company_final_check_request_run(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.company_final_check_request_run(uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.company_final_check_request_run(uuid) TO jobguard_runtime;
ALTER FUNCTION app.company_final_check_reveal(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.company_final_check_reveal(uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.company_final_check_reveal(uuid) TO jobguard_runtime;
COMMIT;
