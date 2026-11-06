BEGIN;
-- Synthetic fixture administration is the only connection authority in this dark slice.
CREATE TABLE app.accounting_export_route_change (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), command_id uuid NOT NULL,
 decision_id uuid NOT NULL, actor_id uuid NOT NULL, company_id text NOT NULL, job_id text NOT NULL,
 revision bigint NOT NULL CHECK(revision>0), source_id text NOT NULL,
 artifact jsonb NOT NULL, preview_hash text NOT NULL CHECK(preview_hash ~ '^[a-f0-9]{64}$'),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,command_id), CONSTRAINT accounting_route_decision_unique UNIQUE(tenant_id,decision_id),
 CONSTRAINT accounting_route_revision_unique UNIQUE(tenant_id,company_id,job_id,revision),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,source_id) REFERENCES app.accounting_export_fixture(tenant_id,source_id)
);
ALTER TABLE app.accounting_export_route_change OWNER TO jobguard_migration;
ALTER TABLE app.accounting_export_route_change ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.accounting_export_route_change FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.accounting_export_route_change TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.accounting_export_route_change FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON app.accounting_export_route_change
 FOR EACH ROW EXECUTE FUNCTION app.accounting_export_guard();
CREATE TRIGGER immutable_table BEFORE TRUNCATE ON app.accounting_export_route_change
 FOR EACH STATEMENT EXECUTE FUNCTION app.accounting_export_guard();

-- Called only by the checked dispatcher, under its tenant lock. Never changes a ledger row.
CREATE FUNCTION app.accounting_export_routed_artifact(t uuid, original jsonb) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE change app.accounting_export_route_change; anchor app.accounting_export_fixture; baseline text;
BEGIN
 IF EXISTS(SELECT 1 FROM app.accounting_export_ledger WHERE tenant_id=t AND source_id=original #>> '{scope,sourceId}') THEN
  RETURN original;
 END IF;
 SELECT * INTO change FROM app.accounting_export_route_change WHERE tenant_id=t
  AND company_id=original #>> '{scope,companyId}' AND job_id=original #>> '{scope,jobId}' ORDER BY revision DESC LIMIT 1;
 IF NOT FOUND THEN
  SELECT artifact->>'route' INTO baseline FROM app.accounting_export_ledger WHERE tenant_id=t
   AND company_id=original #>> '{scope,companyId}' AND artifact #>> '{scope,jobId}'=original #>> '{scope,jobId}'
   ORDER BY source_id LIMIT 1;
  IF baseline IS NOT NULL AND baseline IS DISTINCT FROM original->>'route' THEN RAISE EXCEPTION 'EXPORT_APPROVAL_REQUIRED'; END IF;
  RETURN original;
 END IF;
 SELECT * INTO anchor FROM app.accounting_export_fixture WHERE tenant_id=t AND source_id=change.source_id;
 IF anchor.revoked OR anchor.consent_expires_at<=clock_timestamp()
  OR anchor.artifact->'consentRevision' IS DISTINCT FROM change.artifact->'consentRevision'
  OR anchor.artifact->'connectionRevision' IS DISTINCT FROM change.artifact->'connectionRevision'
  OR anchor.artifact->'route' IS DISTINCT FROM change.artifact->'to'
  OR anchor.artifact->'scope' IS DISTINCT FROM change.artifact->'scope'
  OR original->'consentRevision' IS DISTINCT FROM change.artifact->'consentRevision'
  OR original->'connectionRevision' IS DISTINCT FROM change.artifact->'connectionRevision'
  OR original->'route' IS DISTINCT FROM change.artifact->'to'
  OR original #> '{scope,mapping}' IS DISTINCT FROM change.artifact #> '{scope,mapping}'
 THEN RAISE EXCEPTION 'EXPORT_STALE_REVISION'; END IF;
 RETURN original;
END $$;
ALTER FUNCTION app.accounting_export_routed_artifact(uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.accounting_export_routed_artifact(uuid,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

CREATE FUNCTION app.accounting_export_route(t uuid,digest text,operation text,source text,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; f app.accounting_export_fixture; prior app.accounting_export_route_change;
 replay app.accounting_export_route_change; entries jsonb; artifact jsonb; result jsonb; h text; old_route text;
 decision uuid; command uuid; expiry timestamptz; next_revision bigint;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'EXPORT_SYNTHETIC_ONLY'; END IF;
 actor:=app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,484));
 actor:=app.mon1_company_actor(t,digest);
 IF operation IS NULL OR operation NOT IN('routeChangePreview','routeChangeConfirm')
  OR source IS NULL OR source !~ '^demo-[a-z0-9-]{1,80}$'
  OR jsonb_typeof(v) IS DISTINCT FROM 'object'
  OR v->'version' IS DISTINCT FROM '1'::jsonb
  OR v-ARRAY['version','scope','from','to','connectionRevision','consentRevision','commandId','decisionId','previewHash','expiresAt','humanConfirmed','action','status','tenantId']<>'{}'::jsonb
 THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT'; END IF;
 IF operation='routeChangePreview' AND v-ARRAY['version','scope','from','to','connectionRevision','consentRevision']<>'{}'::jsonb
 THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT'; END IF;
 SELECT * INTO f FROM app.accounting_export_fixture WHERE tenant_id=t AND source_id=source;
 IF NOT FOUND THEN RAISE EXCEPTION 'EXPORT_NOT_FOUND'; END IF;
 IF f.revoked OR f.consent_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'EXPORT_CONSENT_EXPIRED'; END IF;
 -- Exact scope comes from the administrator-owned fixture, never a caller's wider scope.
 IF v->'scope' IS DISTINCT FROM f.artifact->'scope'
  OR v #>> '{scope,tenantId}' IS DISTINCT FROM 'demo-'||t::text
  OR v #>> '{scope,sourceId}' IS DISTINCT FROM source
  OR v #>> '{scope,companyId}' IS DISTINCT FROM f.artifact #>> '{target,companyId}'
  OR v #>> '{scope,companyId}' IS DISTINCT FROM v #>> '{scope,mapping,companyId}'
  OR v #>> '{scope,tenantId}' IS DISTINCT FROM v #>> '{scope,mapping,tenantId}'
  OR v #>> '{scope,jobId}' IS DISTINCT FROM f.artifact #>> '{source,jobId}'
  OR v #> '{scope,sourceRevision}' IS DISTINCT FROM f.artifact #> '{source,revision}'
  OR f.artifact #>> '{source,synthetic}' IS DISTINCT FROM 'true'
  OR v->'to' IS DISTINCT FROM f.artifact->'route'
  OR v->>'to' IS NULL OR v->>'to' NOT IN('codat','xero','quickbooks')
  OR v->>'from' IS NULL OR v->>'from' NOT IN('codat','xero','quickbooks')
  OR v->'connectionRevision' IS DISTINCT FROM f.artifact->'connectionRevision'
  OR v->'consentRevision' IS DISTINCT FROM f.artifact->'consentRevision'
  OR coalesce(v->>'connectionRevision','') !~ '^[1-9][0-9]*$'
  OR coalesce(v->>'consentRevision','') !~ '^[1-9][0-9]*$'
 THEN RAISE EXCEPTION 'EXPORT_STALE_REVISION'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('sourceId',l.source_id,'artifact',l.artifact,
  'reference',l.reference,'externalId',o.external_id,'status',o.status,'attemptId',o.attempt_id,'attempts',o.attempts)
  ORDER BY l.source_id),'[]'::jsonb) INTO entries
 FROM app.accounting_export_ledger l JOIN app.accounting_export_outbox o USING(tenant_id,source_id)
 WHERE l.tenant_id=t AND l.company_id=v #>> '{scope,companyId}' AND l.artifact #>> '{scope,jobId}'=v #>> '{scope,jobId}';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(entries) e WHERE e->>'status'<>'pushed' OR e->>'externalId' IS NULL)
 THEN RAISE EXCEPTION 'EXPORT_RECONCILE_REQUIRED'; END IF;
 IF operation='routeChangeConfirm' THEN
  decision:=(v->>'decisionId')::uuid; command:=(v->>'commandId')::uuid; expiry:=(v->>'expiresAt')::timestamptz;
  IF decision IS NULL OR command IS NULL OR expiry IS NULL OR expiry<=clock_timestamp() OR expiry>f.consent_expires_at
   OR v->'humanConfirmed' IS DISTINCT FROM 'true'::jsonb OR v->>'action' IS DISTINCT FROM 'accounting_export.route'
   OR v->>'status' IS DISTINCT FROM 'approved' OR v->>'tenantId' IS DISTINCT FROM 'demo-'||t::text
  THEN RAISE EXCEPTION 'EXPORT_APPROVAL_REQUIRED'; END IF;
  SELECT * INTO replay FROM app.accounting_export_route_change WHERE tenant_id=t AND command_id=command;
  IF FOUND THEN
   IF replay.actor_id<>actor OR replay.source_id<>source OR replay.request_hash<>app.final_lock_hash(v)
   THEN RAISE EXCEPTION 'EXPORT_REPLAY_CONFLICT'; END IF;
   RETURN jsonb_build_object('version',1,'commandId',command,'decisionId',decision,'actorId',actor,
    'artifact',replay.artifact,'previewHash',replay.preview_hash,'revision',replay.revision);
  END IF;
  IF EXISTS(SELECT 1 FROM app.accounting_export_decision WHERE tenant_id=t AND id=decision)
   OR EXISTS(SELECT 1 FROM app.accounting_export_route_change WHERE tenant_id=t AND decision_id=decision)
  THEN RAISE EXCEPTION 'EXPORT_REPLAY_CONFLICT'; END IF;
 END IF;
 SELECT * INTO prior FROM app.accounting_export_route_change WHERE tenant_id=t
  AND company_id=v #>> '{scope,companyId}' AND job_id=v #>> '{scope,jobId}' ORDER BY revision DESC LIMIT 1;
 old_route:=coalesce(prior.artifact->>'to',entries #>> '{0,artifact,route}',f.artifact->>'route');
 next_revision:=coalesce(prior.revision,0)+1;
 IF v->>'from' IS DISTINCT FROM old_route OR v->>'to'=old_route THEN RAISE EXCEPTION 'EXPORT_STALE_REVISION'; END IF;
 -- New mapping cannot move an existing invoice family to a different customer.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(entries) e WHERE
  (e #>> '{artifact,source,invoiceId}'=f.artifact #>> '{source,invoiceId}'
    OR e->>'sourceId'=f.artifact #>> '{source,invoiceId}')
  AND e #> '{artifact,scope,mapping,customerId}' IS DISTINCT FROM v #> '{scope,mapping,customerId}')
 THEN RAISE EXCEPTION 'EXPORT_REFERENCE_CONFLICT'; END IF;
 artifact:=jsonb_build_object('version',1,'scope',v->'scope','from',old_route,'to',v->'to',
  'connectionRevision',v->'connectionRevision','consentRevision',v->'consentRevision','entries',entries);
 h:=app.final_lock_hash(artifact);
 IF operation='routeChangePreview' THEN RETURN jsonb_build_object('version',1,'artifact',artifact,'previewHash',h); END IF;
 IF v->>'previewHash' IS DISTINCT FROM h THEN RAISE EXCEPTION 'EXPORT_APPROVAL_REQUIRED'; END IF;
 INSERT INTO app.accounting_export_route_change(tenant_id,command_id,decision_id,actor_id,company_id,job_id,revision,source_id,artifact,preview_hash,request_hash,expires_at)
 VALUES(t,command,decision,actor,v #>> '{scope,companyId}',v #>> '{scope,jobId}',next_revision,source,artifact,h,app.final_lock_hash(v),expiry);
 result:=jsonb_build_object('version',1,'commandId',command,'decisionId',decision,'actorId',actor,
  'artifact',artifact,'previewHash',h,'revision',next_revision);
 PERFORM app.accounting_export_audit(t,actor,command,'route_change',app.final_lock_hash(v),app.final_lock_hash(result));
 RETURN result;
END $$;
ALTER FUNCTION app.accounting_export_route(uuid,text,text,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.accounting_export_route(uuid,text,text,text,jsonb) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.accounting_export_route(uuid,text,text,text,jsonb) TO jobguard_runtime;

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
