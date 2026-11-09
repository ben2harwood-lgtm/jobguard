BEGIN;
CREATE OR REPLACE FUNCTION app.accounting_export(t uuid,digest text,operation text,source text,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; f app.accounting_export_fixture; d app.accounting_export_decision;
 l app.accounting_export_ledger; o app.accounting_export_outbox; result jsonb; h text;
 invoice jsonb; allocated bigint;
 decision uuid; attempt uuid; expiry timestamptz; observation jsonb; matches jsonb; next_status text;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'EXPORT_SYNTHETIC_ONLY'; END IF;
 actor:=app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,484));
 actor:=app.mon1_company_actor(t,digest);
 IF operation IS NULL OR operation NOT IN('preview','approve','claim','reconcile','read')
  OR source IS NULL OR source !~ '^demo-[a-z0-9-]{1,80}$'
  OR jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT'; END IF;
 SELECT * INTO f FROM app.accounting_export_fixture WHERE tenant_id=t AND source_id=source;
 IF f.source_id IS NULL THEN RAISE EXCEPTION 'EXPORT_NOT_FOUND'; END IF;
 IF f.revoked OR f.consent_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'EXPORT_CONSENT_EXPIRED'; END IF;
 f.artifact:=app.accounting_export_routed_artifact(t,f.artifact);
 -- Preserve the source and locked-bill invariants even for administrator-seeded fixtures.
 IF f.artifact #>> '{source,kind}' IS NULL
  OR f.artifact #>> '{source,kind}' NOT IN('customer_invoice','credit','receipt')
  OR f.artifact #>> '{source,state}' IS DISTINCT FROM (CASE WHEN f.artifact #>> '{source,kind}'='customer_invoice' THEN 'issued' ELSE 'posted' END)
  OR f.artifact #>> '{source,visibility}' IS DISTINCT FROM 'builder'
  OR f.artifact #>> '{source,tenantId}' IS DISTINCT FROM 'demo-'||t::text
  OR f.artifact #>> '{source,sourceId}' IS DISTINCT FROM source
  OR f.artifact #> '{source,revision}' IS DISTINCT FROM f.artifact #> '{scope,sourceRevision}'
  OR f.artifact #> '{source,amount}' IS DISTINCT FROM f.artifact #> '{target,amount}'
  OR f.artifact #>> '{source,amount,pence}' IS NULL
  OR f.artifact #>> '{source,amount,pence}' !~ '^[1-9][0-9]{0,11}$'
  OR f.artifact #>> '{source,amount,currency}' IS DISTINCT FROM 'GBP'
  OR f.artifact #> '{scope,companyId}' IS DISTINCT FROM f.artifact #> '{scope,mapping,companyId}'
  OR f.artifact #> '{scope,companyId}' IS DISTINCT FROM f.artifact #> '{target,companyId}'
  OR (f.artifact #> '{source,finalAccount}' IS DISTINCT FROM 'null'::jsonb AND
   f.artifact #> '{source,finalAccount,revision}' IS DISTINCT FROM f.artifact #> '{source,finalAccount,lockedRevision}')
 THEN RAISE EXCEPTION 'EXPORT_STALE_REVISION'; END IF;
 IF f.artifact #>> '{source,kind}' IN('credit','receipt') THEN
  SELECT artifact INTO invoice FROM app.accounting_export_fixture WHERE tenant_id=t AND source_id=f.artifact #>> '{source,invoiceId}';
  IF invoice IS NULL OR invoice #>> '{source,kind}' IS DISTINCT FROM 'customer_invoice'
   OR invoice #>> '{source,state}' IS DISTINCT FROM 'issued'
   OR invoice #> '{scope,jobId}' IS DISTINCT FROM f.artifact #> '{scope,jobId}'
   OR invoice #> '{scope,companyId}' IS DISTINCT FROM f.artifact #> '{scope,companyId}'
   OR invoice #> '{scope,mapping,customerId}' IS DISTINCT FROM f.artifact #> '{scope,mapping,customerId}'
   OR EXISTS(SELECT 1 FROM app.accounting_export_ledger WHERE tenant_id=t
    AND source_id=f.artifact #>> '{source,invoiceId}'
    AND artifact->'route' IS DISTINCT FROM f.artifact->'route')
   OR invoice #> '{source,revision}' IS DISTINCT FROM f.artifact #> '{source,invoiceRevision}'
   OR (invoice #> '{source,finalAccount}' IS DISTINCT FROM 'null'::jsonb AND
    invoice #> '{source,finalAccount,revision}' IS DISTINCT FROM invoice #> '{source,finalAccount,lockedRevision}')
  THEN RAISE EXCEPTION 'EXPORT_REFERENCE_CONFLICT'; END IF;
  SELECT coalesce(sum((artifact #>> '{source,amount,pence}')::bigint),0) INTO allocated
   FROM app.accounting_export_ledger WHERE tenant_id=t AND source_id<>source
    AND artifact #>> '{source,invoiceId}'=f.artifact #>> '{source,invoiceId}';
  IF allocated+(f.artifact #>> '{source,amount,pence}')::bigint>(invoice #>> '{source,amount,pence}')::bigint
   THEN RAISE EXCEPTION 'EXPORT_REFERENCE_CONFLICT'; END IF;
 END IF;
 h:=app.final_lock_hash(f.artifact);
 IF operation='preview' THEN
  IF v<>'{}'::jsonb THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT'; END IF;
  RETURN jsonb_build_object('version',1,'artifact',f.artifact,'previewHash',h);
 END IF;
 SELECT * INTO l FROM app.accounting_export_ledger WHERE tenant_id=t AND source_id=source;
 SELECT * INTO o FROM app.accounting_export_outbox WHERE tenant_id=t AND source_id=source;
 IF operation='approve' THEN
  IF v-ARRAY['version','decisionId','previewHash','expiresAt','humanConfirmed']<>'{}'::jsonb
   OR v->>'version' IS DISTINCT FROM '1' OR v->'humanConfirmed' IS DISTINCT FROM 'true'::jsonb
   OR v->>'previewHash' IS DISTINCT FROM h THEN RAISE EXCEPTION 'EXPORT_APPROVAL_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM app.accounting_export_route_change WHERE tenant_id=t AND decision_id=(v->>'decisionId')::uuid)
   THEN RAISE EXCEPTION 'EXPORT_REPLAY_CONFLICT'; END IF;
  decision:=(v->>'decisionId')::uuid; expiry:=(v->>'expiresAt')::timestamptz;
  IF decision IS NULL OR expiry IS NULL OR expiry<=clock_timestamp() OR expiry>f.consent_expires_at THEN RAISE EXCEPTION 'EXPORT_APPROVAL_REQUIRED'; END IF;
  SELECT * INTO d FROM app.accounting_export_decision WHERE tenant_id=t AND id=decision;
  IF d.id IS NOT NULL AND (d.actor_id<>actor OR d.source_id<>source OR d.preview_hash<>h OR d.expires_at<>expiry) THEN RAISE EXCEPTION 'EXPORT_REPLAY_CONFLICT'; END IF;
  IF l.source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.accounting_export_decision WHERE tenant_id=t AND id=l.decision_id AND actor_id=actor) THEN RAISE EXCEPTION 'EXPORT_NOT_FOUND'; END IF;
  IF l.source_id IS NOT NULL AND l.artifact<>f.artifact THEN RAISE EXCEPTION 'EXPORT_REFERENCE_CONFLICT'; END IF;
  IF d.id IS NULL THEN
   INSERT INTO app.accounting_export_decision(tenant_id,id,actor_id,source_id,preview_hash,artifact,expires_at)
    VALUES(t,decision,actor,source,h,f.artifact,expiry);
  END IF;
  IF l.source_id IS NULL THEN
   INSERT INTO app.accounting_export_ledger(tenant_id,source_id,decision_id,company_id,artifact,reference)
    VALUES(t,source,decision,f.artifact #>> '{scope,companyId}',f.artifact,app.final_lock_hash(jsonb_build_array(t,source))) RETURNING * INTO l;
   INSERT INTO app.accounting_export_outbox(tenant_id,source_id) VALUES(t,source) RETURNING * INTO o;
  END IF;
 ELSIF l.source_id IS NULL THEN RAISE EXCEPTION 'EXPORT_NOT_FOUND';
 END IF;
 IF operation<>'approve' THEN
  SELECT * INTO d FROM app.accounting_export_decision WHERE tenant_id=t AND id=l.decision_id;
  IF d.actor_id<>actor THEN RAISE EXCEPTION 'EXPORT_NOT_FOUND'; END IF;
  IF l.artifact<>f.artifact THEN RAISE EXCEPTION 'EXPORT_STALE_REVISION'; END IF;
  IF operation='read' THEN
   IF v<>'{}'::jsonb THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT'; END IF;
  ELSE
   IF d.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'EXPORT_APPROVAL_REQUIRED'; END IF;
   attempt:=(v->>'attemptId')::uuid;
   IF attempt IS NULL OR v->>'version' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT'; END IF;
   IF operation='claim' THEN
    IF v-ARRAY['version','attemptId']<>'{}'::jsonb THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT'; END IF;
    -- Commit the unknown state BEFORE any external call. Never reclaim an in-flight attempt.
    IF o.status<>'pending' THEN RAISE EXCEPTION 'EXPORT_RECONCILE_REQUIRED'; END IF;
    INSERT INTO app.accounting_export_attempt(tenant_id,id,source_id) VALUES(t,attempt,source);
    UPDATE app.accounting_export_outbox SET status='outcome_unknown',attempt_id=attempt,attempts=attempts+1
     WHERE tenant_id=t AND source_id=source RETURNING * INTO o;
   ELSE
    IF v-ARRAY['version','attemptId']<>'{}'::jsonb THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT'; END IF;
    IF o.attempt_id IS DISTINCT FROM attempt THEN RAISE EXCEPTION 'EXPORT_REPLAY_CONFLICT'; END IF;
    SELECT i.matches INTO matches FROM app.accounting_export_inbox i
     JOIN app.accounting_export_attempt a ON a.tenant_id=i.tenant_id AND a.id=i.attempt_id
     WHERE i.tenant_id=t AND i.attempt_id=attempt AND a.source_id=source
     ORDER BY i.observed_at DESC,i.id DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'EXPORT_OBSERVATION_REQUIRED'; END IF;
    observation:=matches->0;
    IF jsonb_array_length(matches)>1 THEN next_status:='duplicate_import';
    ELSIF jsonb_array_length(matches)=0 THEN next_status:=CASE WHEN o.external_id IS NULL THEN 'confirmed_absent' ELSE 'reference_conflict' END;
    ELSIF observation->>'id' IS NULL OR observation->>'id' !~ '^demo-[a-z0-9-]{1,80}$' THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT';
    ELSIF observation->>'tenantId' IS DISTINCT FROM f.artifact #>> '{scope,tenantId}'
      OR observation->>'reference' IS DISTINCT FROM l.reference
      OR (o.external_id IS NOT NULL AND o.external_id<>observation->>'id') THEN next_status:='reference_conflict';
    ELSIF observation->>'contentHash' IS DISTINCT FROM d.preview_hash OR observation->'payload' IS DISTINCT FROM l.artifact->'target' THEN next_status:='external_edit';
    ELSE next_status:='pushed'; END IF;
    -- External paid is deliberately ignored; no settlement, journal or recovery write exists here.
    UPDATE app.accounting_export_outbox SET status=next_status,
     external_id=CASE WHEN next_status='pushed' THEN observation->>'id' ELSE external_id END
     WHERE tenant_id=t AND source_id=source RETURNING * INTO o;
   END IF;
  END IF;
 END IF;
 result:=jsonb_build_object('version',1,'sourceId',source,'reference',l.reference,'previewHash',app.final_lock_hash(l.artifact),'artifact',l.artifact,
  'status',o.status,'attemptId',o.attempt_id,'attempts',o.attempts,'externalId',o.external_id,'qualifyingRecoveryProof',false);
 IF operation<>'read' THEN
  PERFORM app.accounting_export_audit(t,actor,coalesce(decision,attempt),operation,app.final_lock_hash(v),app.final_lock_hash(result));
 END IF;
 RETURN result;
END $$;
COMMIT;
