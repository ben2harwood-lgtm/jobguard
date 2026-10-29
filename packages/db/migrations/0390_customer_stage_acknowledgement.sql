BEGIN;
-- MON-5 M5-STAGE: synthetic acknowledgement only; no commercial state is changed.
CREATE TABLE app.customer_stage_acknowledgement (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, customer_id uuid NOT NULL,
 session_id uuid NOT NULL, completion_id uuid NOT NULL, command_id uuid NOT NULL,
 snapshot jsonb NOT NULL, snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 acknowledged_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,customer_id,completion_id),
 FOREIGN KEY(tenant_id,completion_id) REFERENCES app.stage_completion(tenant_id,id),
 FOREIGN KEY(tenant_id,session_id) REFERENCES app.customer_portal_session(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES app.customer(tenant_id,id),
 CHECK(snapshot_hash=app.final_lock_hash(snapshot)),
 CHECK(snapshot->>'jobId'=job_id::text AND snapshot->>'completionId'=completion_id::text)
);
ALTER TABLE app.customer_stage_acknowledgement OWNER TO jobguard_migration;
ALTER TABLE app.customer_stage_acknowledgement ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_stage_acknowledgement FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.customer_stage_acknowledgement TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.customer_stage_acknowledgement FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

CREATE TRIGGER customer_stage_acknowledgement_immutable BEFORE UPDATE OR DELETE ON app.customer_stage_acknowledgement
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
-- Source reads only; preserve existing runtime policies and grants.
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['stage_completion','evidence_link','stage_review_event','evidence_invalidation'] LOOP
  EXECUTE format('CREATE POLICY customer_stage_source ON app.%I FOR SELECT TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',tab);
 END LOOP;
END $$;

CREATE FUNCTION app.customer_stage_snapshot(t uuid,j uuid,completion uuid) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('snapshot',x.payload,'hash',app.final_lock_hash(x.payload),'reviewRequired',NOT x.eligible)
 FROM (SELECT jsonb_build_object(
  'version','customer-stage-snapshot.v1','jobId',s.job_id,'completionId',s.id,'scopeItemId',s.scope_item_id,
  'stage',s.stage,'completedAt',to_char(s.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'evidenceLinkId',l.id,'evidenceId',e.id,'evidenceType',e.evidence_type,'evidenceHash',e.sha256,
  'objectVersionId',e.object_version_id,
  'statement','I acknowledge this recorded stage completion and its listed evidence. This is not payment approval, certification or a waiver.') payload,
  u.state='verified' AND e.kind='original' AND e.server_verified_at IS NOT NULL
   AND e.object_version_id=u.object_version_id AND e.sha256=u.expected_sha256
   AND e.evidence_type=l.required_evidence_type
   AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.id)
   AND NOT EXISTS(SELECT 1 FROM app.stage_review_event r WHERE r.tenant_id=t AND r.stage_completion_id=s.id)
   AND NOT EXISTS(SELECT 1 FROM app.stage_completion n WHERE n.tenant_id=t AND n.supersedes_completion_id=s.id) eligible
 FROM app.stage_completion s
 JOIN app.evidence_link l ON(l.tenant_id,l.id,l.job_id,l.scope_item_id)=(s.tenant_id,s.evidence_link_id,s.job_id,s.scope_item_id)
 JOIN app.evidence_object e ON(e.tenant_id,e.id,e.job_id,e.scope_item_id)=(l.tenant_id,l.evidence_id,l.job_id,l.scope_item_id)
 JOIN app.evidence_upload u ON(u.tenant_id,u.id,u.job_id,u.scope_item_id)=(e.tenant_id,e.upload_id,e.job_id,e.scope_item_id)
 WHERE s.tenant_id=t AND s.job_id=j AND s.id=completion) x
$$;

CREATE FUNCTION identity.customer_stages(t uuid,j uuid,c uuid,digest text,completion uuid,command uuid,expected_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s app.stage_completion; prior app.customer_stage_acknowledgement; view jsonb; sid uuid; ack uuid:=gen_random_uuid();
BEGIN
 -- Reuse the existing authority boundary inside this transaction, including its job lock.
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT id INTO sid FROM app.customer_portal_session WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest;
 IF completion IS NULL THEN
  IF command IS NOT NULL OR expected_hash IS NOT NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('version','customer-stages.v1','jobId',j,'stages',coalesce((
   SELECT jsonb_agg(app.customer_stage_snapshot(t,j,x.id)||jsonb_build_object('acknowledgement',
    (SELECT jsonb_build_object('id',a.id,'snapshotHash',a.snapshot_hash,'acknowledgedAt',a.acknowledged_at)
     FROM app.customer_stage_acknowledgement a WHERE a.tenant_id=t AND a.customer_id=c AND a.completion_id=x.id)) ORDER BY x.completed_at,x.id)
   FROM app.stage_completion x WHERE x.tenant_id=t AND x.job_id=j),'[]'::jsonb));
 END IF;
 IF command IS NULL OR expected_hash IS NULL OR expected_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':customer-stage-command:'||command::text,390));
 SELECT * INTO prior FROM app.customer_stage_acknowledgement WHERE tenant_id=t AND command_id=command;
 IF prior.id IS NOT NULL THEN
  IF prior.job_id<>j OR prior.customer_id<>c OR prior.completion_id<>completion OR prior.snapshot_hash<>expected_hash THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('version','customer-stage-acknowledged.v1','id',prior.id,'snapshotHash',prior.snapshot_hash);
 END IF;
 SELECT * INTO s FROM app.stage_completion WHERE tenant_id=t AND job_id=j AND id=completion;
 IF s.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 -- Match proof.complete's lock, then proof.invalidate's upload lock. No audit lock until the end.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text||':'||s.scope_item_id::text||':'||s.stage,0));
 PERFORM 1 FROM app.evidence_upload u JOIN app.evidence_object e ON(e.tenant_id,e.upload_id)=(u.tenant_id,u.id)
 JOIN app.evidence_link l ON(l.tenant_id,l.evidence_id)=(e.tenant_id,e.id)
 WHERE l.tenant_id=t AND l.id=s.evidence_link_id FOR UPDATE OF u;
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 view:=app.customer_stage_snapshot(t,j,completion);
 IF view IS NULL OR (view->>'reviewRequired')::boolean IS DISTINCT FROM false OR view->>'hash'<>expected_hash THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM app.customer_stage_acknowledgement WHERE tenant_id=t AND customer_id=c AND completion_id=completion) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 INSERT INTO app.customer_stage_acknowledgement(tenant_id,id,job_id,customer_id,session_id,completion_id,command_id,snapshot,snapshot_hash)
 VALUES(t,ack,j,c,sid,completion,command,view->'snapshot',expected_hash);
 PERFORM app.customer_portal_audit(t,ack,'stage_acknowledged');
 RETURN jsonb_build_object('version','customer-stage-acknowledged.v1','id',ack,'snapshotHash',expected_hash);
END $$;
DO $$ DECLARE fn text; BEGIN
 FOREACH fn IN ARRAY ARRAY['app.customer_stage_snapshot(uuid,uuid,uuid)','identity.customer_stages(uuid,uuid,uuid,text,uuid,uuid,text)'] LOOP
  EXECUTE 'ALTER FUNCTION '||fn||' OWNER TO jobguard_migration';
  EXECUTE 'REVOKE ALL ON FUNCTION '||fn||' FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure';
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION identity.customer_stages(uuid,uuid,uuid,text,uuid,uuid,text) TO jobguard_identity;
-- Forward fix only: preserve acknowledged snapshots and history; never roll back by dropping rows.
COMMIT;
