BEGIN;
-- CH-8 part 3 RED: synthetic source-backed packs only. Existing grants remain unchanged.
CREATE OR REPLACE FUNCTION app.evidence_pack_v3_material(t uuid,c uuid,ordinary_only boolean DEFAULT false) RETURNS jsonb
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
CREATE OR REPLACE FUNCTION app.request_evidence_pack_v3(t uuid,c uuid,d text,q jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$
DECLARE j uuid;cid uuid;prior app.evidence_pack_v3_request; actor uuid;
BEGIN
 j:=app.evidence_pack_v3_owner(t,c,d);cid:=(q->>'commandId')::uuid;
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
 SELECT membership_id INTO actor FROM app.authenticate_practice_session(d,t);
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(cid,t,'evidence_pack.v3',cid::text,app.final_lock_hash(jsonb_build_object('caseId',c,'session',d,'command',q)),'succeeded','{}',actor,clock_timestamp())
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'EVIDENCE_PACK_COMMAND_CONFLICT'; END IF;
 INSERT INTO app.evidence_pack_v3_request VALUES(t,j,c,cid,d,q,NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j),clock_timestamp());
 INSERT INTO infrastructure.evidence_pack_v3_request(tenant_id,command_id) VALUES(t,cid);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'system:evidence-pack',j,'evidence_pack.v3_requested',jsonb_build_object('commandId',cid));
END $$;
CREATE OR REPLACE FUNCTION app.finish_evidence_pack_v3(t uuid,cid uuid,m jsonb,artifact text,mh text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.evidence_pack_v3_request;j uuid;p app.evidence_pack_v3;envelope jsonb;expected_sources jsonb;expected_entries jsonb;expected_sections jsonb;
BEGIN
 IF NOT pg_has_role(session_user,'jobguard_shadow','USAGE') OR pg_has_role(session_user,'jobguard_runtime','USAGE') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext('pack-v3-command:'||cid::text));
 SELECT * INTO r FROM app.evidence_pack_v3_request WHERE tenant_id=t AND command_id=cid;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(r.case_id::text));
 PERFORM pg_advisory_xact_lock(hashtextextended('stored-receipt-lines:'||t::text||':'||r.job_id::text,0));
 -- Fence session revocation, job lock and allocation changes, before audit-head acquisition.
 PERFORM 1 FROM control_plane.practice_session WHERE token_digest=r.session_digest FOR SHARE;
 PERFORM 1 FROM app.membership WHERE tenant_id=t AND id IN(SELECT membership_id FROM app.authenticate_practice_session(r.session_digest,t)) FOR SHARE;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=r.job_id FOR UPDATE;
 j:=app.evidence_pack_v3_owner(t,r.case_id,r.session_digest);
 IF NOT EXISTS(SELECT 1 FROM app.command_receipt cr WHERE cr.tenant_id=t AND cr.command_id=cid AND cr.command_type='evidence_pack.v3'
  AND cr.request_hash=app.final_lock_hash(jsonb_build_object('caseId',r.case_id,'session',r.session_digest,'command',r.command)))
 THEN RAISE EXCEPTION 'EVIDENCE_PACK_COMMAND_CONFLICT'; END IF;

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
COMMIT;
