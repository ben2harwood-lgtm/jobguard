BEGIN;
-- CH-8 part 2, RED: synthetic-only worker exports. Infrastructure carries identifiers only.
CREATE TABLE app.evidence_pack_v3_request (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, command_id uuid NOT NULL,
 session_digest text NOT NULL, command jsonb NOT NULL, pre_lock boolean NOT NULL, requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,command_id), UNIQUE(tenant_id,job_id,case_id,command_id),
 FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id)
);
CREATE TABLE app.evidence_pack_v3 (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,case_id uuid NOT NULL,id uuid NOT NULL,
 material jsonb NOT NULL,artifact_text text NOT NULL,manifest_hash text NOT NULL,content_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,case_id,id),
 FOREIGN KEY(tenant_id,job_id,case_id,id) REFERENCES app.evidence_pack_v3_request(tenant_id,job_id,case_id,command_id),
 CHECK(manifest_hash ~ '^[a-f0-9]{64}$' AND content_hash=encode(sha256(convert_to(artifact_text,'UTF8')),'hex'))
);
CREATE TABLE app.evidence_pack_v3_approval (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,case_id uuid NOT NULL,command_id uuid NOT NULL,pack_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,case_id,command_id) REFERENCES app.evidence_pack_v3_request(tenant_id,job_id,case_id,command_id),
 FOREIGN KEY(tenant_id,job_id,case_id,pack_id) REFERENCES app.evidence_pack_v3(tenant_id,job_id,case_id,id)
);
CREATE TABLE app.evidence_pack_v3_check (
 tenant_id uuid NOT NULL,command_id uuid NOT NULL,visible_revision text NOT NULL,
 PRIMARY KEY(tenant_id,command_id), FOREIGN KEY(tenant_id,command_id) REFERENCES app.evidence_pack_v3_request(tenant_id,command_id)
);
CREATE TABLE infrastructure.evidence_pack_v3_request (
 tenant_id uuid NOT NULL,command_id uuid NOT NULL,requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz, PRIMARY KEY(tenant_id,command_id)
);
ALTER TABLE infrastructure.evidence_pack_v3_request OWNER TO jobguard_migration;
GRANT SELECT ON infrastructure.evidence_pack_v3_request TO jobguard_infrastructure;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['evidence_pack_v3_request','evidence_pack_v3','evidence_pack_v3_approval','evidence_pack_v3_check'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format($policy$CREATE POLICY tenant_isolation ON app.%I TO jobguard_migration USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)$policy$,n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure',n);
  EXECUTE format('CREATE TRIGGER evidence_pack_v3_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;
CREATE FUNCTION app.canonical_evidence_pack_v3(v jsonb) RETURNS text
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,app AS $$
DECLARE result text;
BEGIN
 IF jsonb_typeof(v)='object' THEN
  SELECT '{'||coalesce(string_agg(to_jsonb(k)::text||':'||app.canonical_evidence_pack_v3(value),',' ORDER BY k COLLATE "C"),'')||'}' INTO result FROM jsonb_each(v) e(k,value);
 ELSIF jsonb_typeof(v)='array' THEN
  SELECT '['||coalesce(string_agg(app.canonical_evidence_pack_v3(value),',' ORDER BY n),'')||']' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY e(value,n);
 ELSE result:=v::text; END IF;
 RETURN result;
END $$;
ALTER FUNCTION app.canonical_evidence_pack_v3(jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.canonical_evidence_pack_v3(jsonb) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure;
-- Private authority helper, shared by the request and worker boundary. No actor comes from JSON.
CREATE FUNCTION app.evidence_pack_v3_owner(t uuid,c uuid,d text) RETURNS uuid
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE j uuid; a record; owned boolean;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO a FROM app.authenticate_practice_session(d,t);
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 SELECT job_id INTO j FROM app.recovery_case WHERE tenant_id=t AND id=c AND synthetic;
 WITH RECURSIVE owned_jobs AS (
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=d
  UNION SELECT child.id FROM owned_jobs source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
  JOIN app.job child ON child.tenant_id=e.tenant_id AND child.id::text=e.subject_ref AND child.provenance='imported' AND child.practice_session_digest IS NULL
 ) SELECT EXISTS(SELECT 1 FROM owned_jobs WHERE id=j) INTO owned;
 IF NOT owned OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND environment='synthetic_demo' AND job_track='small_builder')
 OR NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 RETURN j;
END $$;
-- Ordinary inventory only. This function never names a shadow relation or a hidden-source routine.
-- JSON row text preserves PostgreSQL microseconds and exact numeric/rational strings; binary originals are base64.
CREATE FUNCTION app.evidence_pack_v3_ordinary(t uuid,c uuid) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path=pg_catalog,app SET timezone='UTC' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind','ordinary','sourceId',x.sid,'recordedAt',to_char(x.ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'content',x.body::text) ORDER BY x.sid),'[]')
 FROM app.recovery_case rc CROSS JOIN LATERAL (
 SELECT 'recovery_case:'||r.id::text sid,rc.created_at ts,to_jsonb(r) body FROM app.recovery_case r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND r.id=rc.id
 UNION ALL
 SELECT 'recovery_claim_revision:'||r.id::text sid,rc.created_at ts,to_jsonb(r) body FROM app.recovery_claim_revision r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND r.case_id=rc.id
 UNION ALL
 SELECT 'recovery_case_event:'||r.id::text sid,rc.created_at ts,to_jsonb(r) body FROM app.recovery_case_event r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND r.case_id=rc.id
 UNION ALL
 SELECT 'quote_document_version:'||r.id::text sid,r.created_at ts,to_jsonb(r) body FROM app.quote_document_version r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND true
 UNION ALL
 SELECT 'quote_acceptance:'||r.id::text sid,r.recorded_at ts,to_jsonb(r) body FROM app.quote_acceptance r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND true
 UNION ALL
 SELECT 'variation_revision:'||r.id::text sid,r.created_at ts,to_jsonb(r) body FROM app.variation_revision r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND true
 UNION ALL
 SELECT 'variation_approval:'||r.id::text sid,r.created_at ts,to_jsonb(r) body FROM app.variation_approval r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND true
 UNION ALL
 SELECT 'customer_invoice:'||r.id::text sid,rc.created_at ts,(to_jsonb(r)-'pdf_bytes')||jsonb_build_object('pdfBase64',encode(r.pdf_bytes,'base64')) body FROM app.customer_invoice r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND true
 UNION ALL
 SELECT 'evidence_object:'||r.id::text sid,r.server_received_at ts,to_jsonb(r) body FROM app.evidence_object r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND r.kind='original' AND r.server_verified_at IS NOT NULL
 UNION ALL
 SELECT 'job_source_original:'||r.evidence_id::text sid,r.source_received_at ts,(to_jsonb(r)-'bytes')||jsonb_build_object('originalBytesBase64',encode(r.bytes,'base64')) body FROM app.job_source_original r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND true
 UNION ALL
 SELECT 'synthetic_evidence_original:'||r.upload_id::text sid,rc.created_at ts,(to_jsonb(r)-'bytes')||jsonb_build_object('originalBytesBase64',encode(r.bytes,'base64')) body FROM app.synthetic_evidence_original r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND true
 UNION ALL SELECT 'supplier_document_version:'||r.id::text,r.created_at,to_jsonb(r) FROM app.supplier_document_version r WHERE r.tenant_id=t AND r.job_id=rc.job_id
 UNION ALL SELECT 'purchase_order_revision:'||r.id::text,r.created_at,to_jsonb(r) FROM app.purchase_order_revision r WHERE r.tenant_id=t AND r.job_id=rc.job_id
 UNION ALL SELECT 'final_account_revision:'||r.id::text,r.created_at,to_jsonb(r) FROM app.final_account_revision r WHERE r.tenant_id=t AND r.job_id=rc.job_id
 UNION ALL SELECT 'final_account_line:'||r.id::text,rc.created_at,to_jsonb(r) FROM app.final_account_line r WHERE r.tenant_id=t AND r.job_id=rc.job_id
 UNION ALL SELECT 'extra_origin:'||r.variation_id::text,rc.created_at,to_jsonb(r) FROM app.extra_origin r WHERE r.tenant_id=t AND r.job_id=rc.job_id
 UNION ALL SELECT 'evidence_invalidation:'||r.id::text,r.invalidated_at,to_jsonb(r) FROM app.evidence_invalidation r
 WHERE r.tenant_id=t AND EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=t AND e.job_id=rc.job_id AND e.id=r.evidence_id)
 ) x WHERE rc.tenant_id=t AND rc.id=c
$$;
-- The eight-section inventory is worker-only. Pre-lock exits before ANY hidden query.
CREATE FUNCTION app.evidence_pack_v3_material(t uuid,c uuid,ordinary_only boolean DEFAULT false) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE j uuid;l app.final_account_lock;b app.final_check_run_binding;rows jsonb;ordinary jsonb;
BEGIN
 SELECT job_id INTO j FROM app.recovery_case WHERE tenant_id=t AND id=c;
 ordinary:=app.evidence_pack_v3_ordinary(t,c);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND OR ordinary_only THEN RETURN jsonb_build_object('tenantId',t,'jobId',j,'caseId',c,'lifecycle',jsonb_build_object('state','pre_lock'),'records',ordinary); END IF;
 SELECT b0.* INTO b FROM app.final_check_run_binding b0
 WHERE b0.tenant_id=t AND b0.job_id=j AND b0.lock_id=l.id ORDER BY b0.available_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind',x.kind,'sourceId',x.sid,'recordedAt',to_char(x.ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'content',x.body::text) ORDER BY x.kind,x.sid),'[]') INTO rows FROM (
 SELECT 'lock' kind,'final_account_lock:'||l.id::text sid,l.locked_at ts,to_jsonb(l) body
 UNION ALL SELECT 'capture_snapshot','capture_snapshot:'||l.id::text,l.locked_at,l.snapshot
 UNION ALL SELECT 'reconciliation','final_check_run_binding:'||b.run_id::text,b.available_at,to_jsonb(b)
 UNION ALL SELECT 'source_observations','final_check_processing_source:'||r.id::text,r.source_received_at,to_jsonb(r) FROM app.final_check_processing_source r WHERE r.tenant_id=t AND r.job_id=j AND r.manifest_id=b.manifest_id
 UNION ALL SELECT 'reconciliation','final_check_source_attempt:'||r.id::text,r.created_at,to_jsonb(r) FROM app.final_check_source_attempt r WHERE r.tenant_id=t AND r.job_id=j AND r.manifest_id=b.manifest_id
 UNION ALL SELECT 'reveal','final_check_reveal_proof:'||r.signal_id::text,r.first_available_at,to_jsonb(r) FROM app.final_check_reveal_proof r WHERE r.tenant_id=t AND r.job_id=j AND r.run_id=b.run_id
 UNION ALL SELECT 'disposition','final_check_disposition_binding:'||r.disposition_id::text,r.created_at,to_jsonb(r) FROM app.final_check_disposition_binding r WHERE r.tenant_id=t AND r.job_id=j AND r.run_id=b.run_id
 UNION ALL SELECT 'attribution_revision','recovery_attribution_revision:'||r.id::text,r.created_at,to_jsonb(r) FROM app.recovery_attribution_revision r WHERE r.tenant_id=t AND r.job_id=j AND r.case_id=c AND r.lock_id=l.id
 UNION ALL SELECT 'settlement','recovery_case_allocation:'||r.id::text,r.created_at,to_jsonb(r) FROM app.recovery_case_allocation r WHERE r.tenant_id=t AND r.job_id=j AND r.case_id=c
 UNION ALL SELECT 'settlement','receipt_line_allocation:'||r.id::text,r.created_at,to_jsonb(r) FROM app.receipt_line_allocation r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.recovery_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.id=r.allocation_id AND a.case_id=c)
 UNION ALL SELECT 'settlement','recovery_case_allocation_reversal:'||r.id::text,r.created_at,to_jsonb(r) FROM app.recovery_case_allocation_reversal r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.recovery_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.id=r.allocation_id AND a.case_id=c)
 UNION ALL SELECT 'settlement','customer_payment:'||r.id::text,r.created_at,to_jsonb(r) FROM app.customer_payment r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.recovery_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.payment_id=r.id AND a.case_id=c)
 UNION ALL SELECT 'settlement','recovery_allocation_line_source:'||r.id::text,r.existed_at,to_jsonb(r) FROM app.recovery_allocation_line_source r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.receipt_line_allocation a JOIN app.recovery_case_allocation a0 ON a0.tenant_id=a.tenant_id AND a0.job_id=a.job_id AND a0.id=a.allocation_id WHERE a.tenant_id=t AND a.job_id=j AND a.source_id=r.id AND a0.case_id=c)
 UNION ALL SELECT 'settlement','practice_feed_event:'||r.id::text,r.created_at,to_jsonb(r) FROM app.practice_feed_event r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.recovery_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND (a.movement_id=r.id OR a.settled_event_id=r.event_id AND a.account_id=r.account_id))
 UNION ALL SELECT 'settlement','practice_feed_receipt_match:'||r.id::text,r.created_at,to_jsonb(r) FROM app.practice_feed_receipt_match r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.recovery_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND a.payment_id=r.payment_id)
 UNION ALL SELECT 'settlement','customer_payment_reversal:'||r.id::text,r.created_at,to_jsonb(r) FROM app.customer_payment_reversal r WHERE r.tenant_id=t AND r.job_id=j AND EXISTS(SELECT 1 FROM app.recovery_case_allocation a WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c AND a.payment_id=r.payment_id)
 ) x;
 RETURN jsonb_build_object('tenantId',t,'jobId',j,'caseId',c,'lifecycle',jsonb_build_object('state','post_lock','lockedAt',to_char(l.locked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'evidenceCutoff',to_char(b.evidence_cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'records',ordinary||rows);
END $$;
-- Public metadata and artifacts come from persisted worker results, never live hidden reads.
CREATE FUNCTION app.read_evidence_pack_v3(t uuid,c uuid,d text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE j uuid;
BEGIN
 j:=app.evidence_pack_v3_owner(t,c,d);
 RETURN jsonb_build_object('visibleSourceRevision',app.final_lock_hash(app.evidence_pack_v3_ordinary(t,c)),
 'requests',(SELECT coalesce(jsonb_agg(jsonb_build_object('commandId',r.command_id,'finished',EXISTS(SELECT 1 FROM app.evidence_pack_v3 p WHERE p.tenant_id=t AND p.id=r.command_id) OR EXISTS(SELECT 1 FROM app.evidence_pack_v3_approval a WHERE a.tenant_id=t AND a.command_id=r.command_id)) ORDER BY r.requested_at,r.command_id),'[]') FROM app.evidence_pack_v3_request r WHERE r.tenant_id=t AND r.case_id=c),
 'packs',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'artifactText',p.artifact_text,'manifestHash',p.manifest_hash,'contentHash',p.content_hash,'createdAt',p.created_at,'attachmentApprovalRecorded',EXISTS(SELECT 1 FROM app.evidence_pack_v3_approval a WHERE a.tenant_id=t AND a.pack_id=p.id)) ORDER BY p.created_at,p.id),'[]') FROM app.evidence_pack_v3 p WHERE p.tenant_id=t AND p.case_id=c));
END $$;
CREATE FUNCTION app.request_evidence_pack_v3(t uuid,c uuid,d text,q jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$
DECLARE j uuid;cid uuid;prior app.evidence_pack_v3_request;
BEGIN
 j:=app.evidence_pack_v3_owner(t,c,d);cid:=(q->>'commandId')::uuid;
 -- CH-8 part 2 installs preparation only. Part 3 owns runtime SV-6 activation.
 RAISE EXCEPTION 'EVIDENCE_PACK_V3_DEPENDENCY_HELD';
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext('pack-v3-command:'||cid::text));
 PERFORM app.evidence_pack_v3_owner(t,c,d);
 SELECT * INTO prior FROM app.evidence_pack_v3_request WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.case_id<>c OR prior.session_digest<>d OR prior.command<>q THEN RAISE EXCEPTION 'EVIDENCE_PACK_COMMAND_CONFLICT'; END IF;
  RETURN;
 END IF;
 IF q->>'version'='evidence-pack-command.v3' THEN
  IF q-ARRAY['version','commandId','format','expectedVisibleSourceRevision']<>'{}'::jsonb OR q->>'format' IS DISTINCT FROM 'TEXT'
  OR q->>'expectedVisibleSourceRevision' IS DISTINCT FROM app.final_lock_hash(app.evidence_pack_v3_ordinary(t,c)) THEN RAISE EXCEPTION 'EVIDENCE_PACK_V3_SOURCE_CONFLICT'; END IF;
 ELSIF q->>'version'='evidence-pack-attachment-approval.v3' THEN
  IF q-ARRAY['version','commandId','packId','expectedManifestHash','expectedContentHash']<>'{}'::jsonb
  OR NOT EXISTS(SELECT 1 FROM app.evidence_pack_v3 WHERE tenant_id=t AND case_id=c AND id=(q->>'packId')::uuid AND manifest_hash=q->>'expectedManifestHash' AND content_hash=q->>'expectedContentHash') THEN RAISE EXCEPTION 'EVIDENCE_PACK_STALE_APPROVAL'; END IF;
 ELSE RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
 INSERT INTO app.evidence_pack_v3_request VALUES(t,j,c,cid,d,q,NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j),clock_timestamp());
 INSERT INTO infrastructure.evidence_pack_v3_request(tenant_id,command_id) VALUES(t,cid);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'system:evidence-pack',j,'evidence_pack.v3_requested',jsonb_build_object('commandId',cid));
END $$;
-- Only the worker can fetch the request or authoritative material, including after-lock sources.
CREATE FUNCTION app.prepare_evidence_pack_v3(t uuid,cid uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.evidence_pack_v3_request;
BEGIN
 IF NOT pg_has_role(session_user,'jobguard_shadow','USAGE') OR pg_has_role(session_user,'jobguard_runtime','USAGE') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO r FROM app.evidence_pack_v3_request WHERE tenant_id=t AND command_id=cid;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 PERFORM app.evidence_pack_v3_owner(t,r.case_id,r.session_digest);
 RETURN jsonb_build_object('command',r.command,'visibleRevision',app.final_lock_hash(app.evidence_pack_v3_ordinary(t,r.case_id)),'material',app.evidence_pack_v3_material(t,r.case_id,r.pre_lock));
END $$;
-- Worker receipt contains no signal state; it binds the completed deterministic handoff to ordinary inputs.
CREATE FUNCTION app.complete_evidence_pack_v3_check(t uuid,cid uuid,h text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.evidence_pack_v3_request;
BEGIN
 IF NOT pg_has_role(session_user,'jobguard_shadow','USAGE') OR pg_has_role(session_user,'jobguard_runtime','USAGE') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO r FROM app.evidence_pack_v3_request WHERE tenant_id=t AND command_id=cid;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 PERFORM app.evidence_pack_v3_owner(t,r.case_id,r.session_digest);
 IF h IS DISTINCT FROM app.final_lock_hash(app.evidence_pack_v3_ordinary(t,r.case_id)) THEN RAISE EXCEPTION 'EVIDENCE_PACK_V3_SOURCE_CONFLICT'; END IF;
 INSERT INTO app.evidence_pack_v3_check VALUES(t,cid,h) ON CONFLICT DO NOTHING;
END $$;
-- A supplied envelope is checked against the exact current server inventory under the job/case locks.
CREATE FUNCTION app.finish_evidence_pack_v3(t uuid,cid uuid,m jsonb,artifact text,mh text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.evidence_pack_v3_request;j uuid;p app.evidence_pack_v3;envelope jsonb;expected_sources jsonb;expected_entries jsonb;expected_sections jsonb;
BEGIN
 IF NOT pg_has_role(session_user,'jobguard_shadow','USAGE') OR pg_has_role(session_user,'jobguard_runtime','USAGE') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext('pack-v3-command:'||cid::text));
 SELECT * INTO r FROM app.evidence_pack_v3_request WHERE tenant_id=t AND command_id=cid;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 -- Fence session revocation, job lock and allocation changes, before audit-head acquisition.
 PERFORM 1 FROM control_plane.practice_session WHERE token_digest=r.session_digest FOR SHARE;
 PERFORM 1 FROM app.membership WHERE tenant_id=t AND id IN(SELECT membership_id FROM app.authenticate_practice_session(r.session_digest,t)) FOR SHARE;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=r.job_id FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(r.case_id::text));
 j:=app.evidence_pack_v3_owner(t,r.case_id,r.session_digest);
 -- Independent database fence: queued/stale/direct worker calls cannot mint a pack or approval.
 RAISE EXCEPTION 'EVIDENCE_PACK_V3_DEPENDENCY_HELD';
 IF EXISTS(SELECT 1 FROM app.evidence_pack_v3 WHERE tenant_id=t AND id=cid) OR EXISTS(SELECT 1 FROM app.evidence_pack_v3_approval WHERE tenant_id=t AND command_id=cid) THEN RETURN; END IF;
 IF m->'lifecycle'->>'state'='pre_lock' AND NOT EXISTS(SELECT 1 FROM app.evidence_pack_v3_check WHERE tenant_id=t AND command_id=cid AND visible_revision=app.final_lock_hash(app.evidence_pack_v3_ordinary(t,r.case_id))) THEN RAISE EXCEPTION 'EVIDENCE_PACK_V3_DEPENDENCY_HELD'; END IF;
 IF m IS DISTINCT FROM app.evidence_pack_v3_material(t,r.case_id,r.pre_lock) THEN RAISE EXCEPTION 'EVIDENCE_PACK_V3_SOURCE_CONFLICT'; END IF;
 IF r.command->>'version'='evidence-pack-attachment-approval.v3' THEN
  SELECT * INTO p FROM app.evidence_pack_v3 WHERE tenant_id=t AND case_id=r.case_id AND id=(r.command->>'packId')::uuid;
  IF p.material IS DISTINCT FROM m OR p.manifest_hash IS DISTINCT FROM r.command->>'expectedManifestHash' OR p.content_hash IS DISTINCT FROM r.command->>'expectedContentHash' THEN RAISE EXCEPTION 'EVIDENCE_PACK_STALE_APPROVAL'; END IF;
  INSERT INTO app.evidence_pack_v3_approval VALUES(t,j,r.case_id,cid,p.id);
 ELSE
  IF r.command->>'expectedVisibleSourceRevision' IS DISTINCT FROM app.final_lock_hash(app.evidence_pack_v3_ordinary(t,r.case_id)) THEN RAISE EXCEPTION 'EVIDENCE_PACK_V3_SOURCE_CONFLICT'; END IF;
  envelope:=artifact::jsonb;
  IF envelope->>'version' IS DISTINCT FROM 'evidence-pack-export.v3' OR envelope->'manifest'->>'binding' IS DISTINCT FROM 'synthetic-records'
   OR envelope->'manifest'->>'tenantId' IS DISTINCT FROM t::text OR envelope->'manifest'->>'jobId' IS DISTINCT FROM j::text OR envelope->'manifest'->>'caseId' IS DISTINCT FROM r.case_id::text
   OR envelope->'manifest'->'lifecycle' IS DISTINCT FROM m->'lifecycle'
   OR jsonb_array_length(envelope->'sources') IS DISTINCT FROM jsonb_array_length(m->'records')
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(m->'records') x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(envelope->'sources') y WHERE y->>'sourceId'=x->>'sourceId' AND y->>'kind'=x->>'kind' AND y->>'content'=x->>'content' AND y->>'recordedAt'=x->>'recordedAt'))
   OR (m->'lifecycle'->>'state'='pre_lock' AND (envelope->'manifest'->'sections'<>'[]'::jsonb OR EXISTS(SELECT 1 FROM jsonb_array_elements(envelope->'sources') x WHERE x->>'kind'<>'ordinary')))
  THEN RAISE EXCEPTION 'EVIDENCE_PACK_CONTENT_MISMATCH'; END IF;
  SELECT coalesce(jsonb_agg(x||jsonb_build_object('tenantId',t,'jobId',j,'caseId',r.case_id,
   'sourceVersion',encode(sha256(convert_to(x->>'content','UTF8')),'hex'),
   'objectVersion','database-record:'||encode(sha256(convert_to(x->>'content','UTF8')),'hex'),'links','[]'::jsonb) ORDER BY x->>'sourceId' COLLATE "C"),'[]') INTO expected_sources FROM jsonb_array_elements(m->'records') x;
  SELECT coalesce(jsonb_agg((x-'content')||jsonb_build_object('contentHash',encode(sha256(convert_to(x->>'content','UTF8')),'hex')) ORDER BY x->>'sourceId' COLLATE "C"),'[]') INTO expected_entries FROM jsonb_array_elements(expected_sources) x;
  SELECT CASE WHEN m->'lifecycle'->>'state'='pre_lock' THEN '[]'::jsonb ELSE jsonb_agg(
   CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(expected_sources) x WHERE x->>'kind'=k) THEN
    jsonb_build_object('kind',k,'status','present','sourceIds',(SELECT jsonb_agg(x->>'sourceId' ORDER BY x->>'sourceId' COLLATE "C") FROM jsonb_array_elements(expected_sources) x WHERE x->>'kind'=k))
   ELSE jsonb_build_object('kind',k,'status','absent','reason',CASE WHEN k='settlement' THEN 'unpaid' ELSE 'not_yet_available' END) END ORDER BY k COLLATE "C") END INTO expected_sections
   FROM unnest(ARRAY['lock','capture_snapshot','source_observations','reconciliation','reveal','disposition','attribution_revision','settlement']) k;
  IF envelope->'sources' IS DISTINCT FROM expected_sources OR envelope->'manifest'->'entries' IS DISTINCT FROM expected_entries
   OR envelope->'manifest'->'sections' IS DISTINCT FROM expected_sections
   OR envelope->>'banner' IS DISTINCT FROM 'Practice sandbox — synthetic data; nothing is sent or charged'
   OR envelope->'manifest'->'trustLimitations' IS DISTINCT FROM jsonb_build_array(
    'Synthetic database records only; no production entitlement or external verification is asserted.',
    'Content mapping does not establish the truth of a claim.',
    'Checkpoint trust must be assessed independently.',
    'Evidence integrity does not establish that work occurred or that a debt is valid.')
   OR envelope->>'mediaType' IS DISTINCT FROM 'text/plain'
   OR envelope->'manifest'->>'version' IS DISTINCT FROM 'evidence-pack-manifest.v3'
   OR envelope->'manifest'-ARRAY['version','binding','tenantId','jobId','caseId','lifecycle','sections','entries','trustLimitations']<>'{}'::jsonb
   OR envelope-ARRAY['version','mediaType','banner','manifest','sources']<>'{}'::jsonb
   OR mh IS DISTINCT FROM encode(sha256(convert_to(app.canonical_evidence_pack_v3(envelope->'manifest'),'UTF8')),'hex')
   OR artifact IS DISTINCT FROM app.canonical_evidence_pack_v3(envelope)
  THEN RAISE EXCEPTION 'EVIDENCE_PACK_CONTENT_MISMATCH'; END IF;
  INSERT INTO app.evidence_pack_v3 VALUES(t,j,r.case_id,cid,m,artifact,mh,encode(sha256(convert_to(artifact,'UTF8')),'hex'),clock_timestamp());
 END IF;
 UPDATE infrastructure.evidence_pack_v3_request SET completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=cid;
 PERFORM app.append_final_check_audit(gen_random_uuid(),'system:evidence-pack',j,'evidence_pack.v3_completed',jsonb_build_object('commandId',cid));
END $$;
ALTER FUNCTION app.evidence_pack_v3_owner(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.evidence_pack_v3_owner(uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure;
ALTER FUNCTION app.evidence_pack_v3_ordinary(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.evidence_pack_v3_ordinary(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure;
ALTER FUNCTION app.evidence_pack_v3_material(uuid,uuid,boolean) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.evidence_pack_v3_material(uuid,uuid,boolean) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure;
ALTER FUNCTION app.read_evidence_pack_v3(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.read_evidence_pack_v3(uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.read_evidence_pack_v3(uuid,uuid,text) TO jobguard_runtime;
ALTER FUNCTION app.request_evidence_pack_v3(uuid,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.request_evidence_pack_v3(uuid,uuid,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.request_evidence_pack_v3(uuid,uuid,text,jsonb) TO jobguard_runtime;
ALTER FUNCTION app.prepare_evidence_pack_v3(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.prepare_evidence_pack_v3(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.prepare_evidence_pack_v3(uuid,uuid) TO jobguard_shadow;
ALTER FUNCTION app.finish_evidence_pack_v3(uuid,uuid,jsonb,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.finish_evidence_pack_v3(uuid,uuid,jsonb,text,text) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.finish_evidence_pack_v3(uuid,uuid,jsonb,text,text) TO jobguard_shadow;
ALTER FUNCTION app.complete_evidence_pack_v3_check(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.complete_evidence_pack_v3_check(uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.complete_evidence_pack_v3_check(uuid,uuid,text) TO jobguard_shadow;
COMMIT;
