BEGIN;
-- Draft facts only. No invoice, qualifying settlement, fee, outbox or timer writes.
CREATE TABLE app.retention_record (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, command_id uuid NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 10000),
 record_kind text NOT NULL CHECK(record_kind IN('retention.profile.v1','retention.review.v1','retention.resolution.v1','retention.release.v1','retention.receipt.v1','retention.reversal.v1')),
 record jsonb NOT NULL, record_hash text NOT NULL CHECK(record_hash ~ '^[a-f0-9]{64}$'),
 actor_membership_id uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,command_id), UNIQUE(tenant_id,job_id,ordinal),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK(jsonb_typeof(record)='object' AND record ?& ARRAY['tenantId','jobId','id','version']),
 CHECK(record->>'tenantId'=tenant_id::text AND record->>'jobId'=job_id::text AND record->>'id'=command_id::text AND record->>'version'=record_kind),
 CHECK(record_hash=app.final_lock_hash(record))
);
ALTER TABLE app.retention_record OWNER TO jobguard_migration;
ALTER TABLE app.retention_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.retention_record FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.retention_record TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.retention_record FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON app.retention_record
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
CREATE TRIGGER immutable_table BEFORE TRUNCATE ON app.retention_record
 FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_authorization_record();

-- The trusted repository runs core validation between prepare and append under
-- this transaction lock, like the existing dark billability adapter. This is not
-- a SQL implementation of the core rules or authority for commercial execution.
CREATE FUNCTION app.retention_records(t uuid,digest text,j uuid,cid uuid,v jsonb,expected text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; records jsonb; prior app.retention_record; fingerprint text;
 caller_tenant text:=current_setting('app.tenant_id',true); result jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'RETENTION_DARK'; END IF;
 IF t IS NULL OR t IS DISTINCT FROM nullif(caller_tenant,'')::uuid THEN RAISE EXCEPTION 'RETENTION_NOT_FOUND'; END IF;
 -- Before audit, lock the entire job book; prepare and append keep this lock
 -- through the caller's transaction, including core validation and replay.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,753));
 IF digest IS NOT NULL THEN actor:=app.mon1_company_actor(t,digest); END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j) THEN RAISE EXCEPTION 'RETENTION_NOT_FOUND'; END IF;
 SELECT coalesce(jsonb_agg(record ORDER BY ordinal),'[]'::jsonb) INTO records
  FROM app.retention_record WHERE tenant_id=t AND job_id=j;
 IF EXISTS(SELECT 1 FROM app.retention_record WHERE tenant_id=t AND job_id=j AND record_hash<>app.final_lock_hash(record))
 THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
 fingerprint:=app.final_lock_hash(records);
 IF v IS NOT NULL THEN
  IF actor IS NULL OR cid IS NULL OR expected IS DISTINCT FROM fingerprint OR jsonb_typeof(v) IS DISTINCT FROM 'object'
   OR v->>'tenantId' IS DISTINCT FROM t::text OR v->>'jobId' IS DISTINCT FROM j::text OR v->>'id' IS DISTINCT FROM cid::text
   OR coalesce(v->>'version','') NOT IN('retention.profile.v1','retention.review.v1','retention.resolution.v1','retention.release.v1','retention.receipt.v1','retention.reversal.v1')
   OR EXISTS(SELECT 1 FROM jsonb_path_query(v,'$.**.actorId') a(value) WHERE value IS DISTINCT FROM to_jsonb(actor::text))
   OR EXISTS(SELECT 1 FROM jsonb_path_query(v,'$.** ? (@.kind == "human_input")') s(value) WHERE value->>'actorId' IS DISTINCT FROM actor::text)
   OR (v->>'version'='retention.resolution.v1' AND v->'humanSource'->>'actorId' IS DISTINCT FROM actor::text)
  THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
  SELECT * INTO prior FROM app.retention_record WHERE tenant_id=t AND command_id=cid;
  IF FOUND THEN
   IF prior.job_id<>j OR prior.record IS DISTINCT FROM v OR prior.actor_membership_id<>actor THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
  ELSE
   INSERT INTO app.retention_record(tenant_id,job_id,command_id,ordinal,record_kind,record,record_hash,actor_membership_id)
    VALUES(t,j,cid,jsonb_array_length(records)+1,v->>'version',v,app.final_lock_hash(v),actor);
   PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
    'actorRef','membership:'||actor::text,'eventType','retention.record.appended','subjectType','job','subjectRef',j::text,
    'payload',jsonb_build_object('references',jsonb_build_object('commandId',cid::text),
     'hashes',jsonb_build_object('record',app.final_lock_hash(v))))),'checked_operation');
   records:=records||jsonb_build_array(v);
  END IF;
 END IF;
 result:=jsonb_build_object('actorId',actor,'records',records,'bookHash',app.final_lock_hash(records));
 PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true);
 RAISE;
END $$;
ALTER FUNCTION app.retention_records(uuid,text,uuid,uuid,jsonb,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.retention_records(uuid,text,uuid,uuid,jsonb,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.retention_records(uuid,text,uuid,uuid,jsonb,text) TO jobguard_runtime;
COMMIT;
