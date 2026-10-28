BEGIN;
-- DEMO-I stores lifecycle metadata only. No job, trial, ledger or hidden-source writes.
CREATE TABLE app.small_builder_demo_run (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(), owner_membership_id uuid NOT NULL,
 scenario text NOT NULL CHECK(scenario IN('core-1000','recovery-18800','shadow-30000','meter','trial')),
 reason text NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision IN(1,2)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), archived_at timestamptz,
 predecessor_id uuid,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,predecessor_id),
 FOREIGN KEY(tenant_id,predecessor_id) REFERENCES app.small_builder_demo_run(tenant_id,id),
 FOREIGN KEY(tenant_id,owner_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK((revision=1 AND archived_at IS NULL) OR (revision=2 AND archived_at IS NOT NULL))
);
CREATE TABLE app.small_builder_demo_receipt (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, run_id uuid NOT NULL,
 owner_membership_id uuid NOT NULL,
 request jsonb NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(tenant_id,command_id),
 FOREIGN KEY(tenant_id,run_id) REFERENCES app.small_builder_demo_run(tenant_id,id),
 FOREIGN KEY(tenant_id,owner_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.small_builder_demo_report (
 tenant_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), run_id uuid NOT NULL,
 facts jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,run_id) REFERENCES app.small_builder_demo_run(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['small_builder_demo_run','small_builder_demo_receipt','small_builder_demo_report'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_scope ON app.%I TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
 END LOOP;
END $$;
CREATE FUNCTION app.small_builder_demo_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'DEMO_IMMUTABLE'; END IF;
 IF TG_TABLE_NAME<>'small_builder_demo_run' THEN RAISE EXCEPTION 'DEMO_IMMUTABLE'; END IF;
 IF OLD.archived_at IS NOT NULL OR NEW.archived_at IS NULL
  OR NEW.revision<>2 OR OLD.revision<>1
  OR (to_jsonb(NEW)-ARRAY['revision','archived_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','archived_at'])
 THEN RAISE EXCEPTION 'DEMO_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.small_builder_demo_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.small_builder_demo_guard() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['small_builder_demo_run','small_builder_demo_receipt','small_builder_demo_report'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.small_builder_demo_guard()',n);
  EXECUTE format('CREATE TRIGGER immutable_table BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.small_builder_demo_guard()',n);
 END LOOP;
END $$;

CREATE FUNCTION app.small_builder_demo_audit(t uuid,actor uuid,command uuid,kind text,hash text,result_hash text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE seq bigint; previous text; ts timestamptz; payload jsonb; ph text; eh text;
BEGIN
 SELECT sequence,event_hash INTO seq,previous FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp());
 payload:=jsonb_build_object('references',jsonb_build_object('commandId',command::text),'hashes',jsonb_build_object('request',hash,'result',result_hash)); ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'membership:'||actor::text,'small_builder_demo.'||kind,'small_builder_demo',t::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(previous,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(gen_random_uuid(),t,seq,'audit.v1','membership:'||actor::text,'small_builder_demo.'||kind,'small_builder_demo',t::text,ts,payload,ph,previous,eh);
 PERFORM app.advance_audit_head(seq,eh);
END $$;
ALTER FUNCTION app.small_builder_demo_audit(uuid,uuid,uuid,text,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.small_builder_demo_audit(uuid,uuid,uuid,text,text,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

-- Closed operations, fixed refusal facts, authority before replay, and company/member ownership.
CREATE FUNCTION app.small_builder_demo(t uuid,digest text,operation text,run uuid,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; r app.small_builder_demo_run; prior app.small_builder_demo_receipt;
 command uuid; snapshot uuid; result jsonb; request jsonb; why text;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'DEMO_SYNTHETIC_ONLY'; END IF;
 actor:=app.mon1_company_actor(t,digest);
 -- Serialize metadata operations in this company; recheck authority after waiting.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,313));
 actor:=app.mon1_company_actor(t,digest);
 IF operation IS NULL OR operation NOT IN('create','read','reset','snapshot','report') OR v IS NULL OR jsonb_typeof(v)<>'object' THEN RAISE EXCEPTION 'INVALID_DEMO_INPUT'; END IF;
 IF operation IN('read','report') THEN
  IF (operation='read' AND v<>'{}'::jsonb) OR (operation='report' AND v-ARRAY['snapshotId']<>'{}'::jsonb) THEN RAISE EXCEPTION 'INVALID_DEMO_INPUT'; END IF;
 ELSE
  IF v->>'contractVersion' IS DISTINCT FROM 'small-builder-demo.'||CASE operation WHEN 'snapshot' THEN 'report-snapshot' ELSE operation END||'.v1'
   OR NOT v ? 'commandId' THEN RAISE EXCEPTION 'INVALID_DEMO_INPUT'; END IF;
  command:=(v->>'commandId')::uuid;
  IF command IS NULL THEN RAISE EXCEPTION 'INVALID_DEMO_INPUT'; END IF;
  IF operation='create' THEN
   IF run IS NOT NULL OR v-ARRAY['contractVersion','commandId','scenario']<>'{}'::jsonb
    OR v->>'scenario' IS NULL OR v->>'scenario' NOT IN('core-1000','recovery-18800','shadow-30000','meter','trial') THEN RAISE EXCEPTION 'INVALID_DEMO_INPUT'; END IF;
  ELSE
   IF v-ARRAY['contractVersion','commandId','expectedRunRevision']<>'{}'::jsonb
    OR jsonb_typeof(v->'expectedRunRevision') IS DISTINCT FROM 'number'
    OR v->>'expectedRunRevision' !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'INVALID_DEMO_INPUT'; END IF;
  END IF;
 END IF;
 IF operation<>'create' THEN
  SELECT * INTO r FROM app.small_builder_demo_run WHERE tenant_id=t AND id=run AND owner_membership_id=actor;
  IF r.id IS NULL THEN RAISE EXCEPTION 'DEMO_NOT_FOUND'; END IF;
 END IF;
 request:=jsonb_build_object('operation',operation,'runId',run,'input',v);
 IF command IS NOT NULL THEN
  SELECT * INTO prior FROM app.small_builder_demo_receipt WHERE tenant_id=t AND command_id=command;
  IF prior.command_id IS NOT NULL THEN
   IF prior.owner_membership_id<>actor OR prior.request<>request THEN RAISE EXCEPTION 'DEMO_COMMAND_CONFLICT'; END IF;
   RETURN prior.result;
  END IF;
 END IF;
 IF operation IN('reset','snapshot') AND r.revision::text IS DISTINCT FROM v->>'expectedRunRevision' THEN RAISE EXCEPTION 'DEMO_STALE_REVISION'; END IF;
 IF operation IN('reset','snapshot') AND r.archived_at IS NOT NULL THEN RAISE EXCEPTION 'DEMO_ARCHIVED'; END IF;
 IF operation='create' THEN
  why:=CASE v->>'scenario'
   WHEN 'core-1000' THEN 'Core journey execution and correction bindings are not available yet.'
   WHEN 'recovery-18800' THEN 'Recovery journey execution, collection and refund bindings are not available yet.'
   WHEN 'shadow-30000' THEN 'Final Check journey execution and attribution bindings are not available yet.'
   WHEN 'meter' THEN 'Meter profile journey execution and clock bindings are not available yet.'
   ELSE 'Trial journey execution, identity and clock bindings are not available yet.' END;
  INSERT INTO app.small_builder_demo_run(tenant_id,owner_membership_id,scenario,reason)
   VALUES(t,actor,v->>'scenario',why) RETURNING * INTO r;
 ELSIF operation='reset' THEN
  UPDATE app.small_builder_demo_run SET revision=2,archived_at=clock_timestamp() WHERE tenant_id=t AND id=run RETURNING * INTO r;
  INSERT INTO app.small_builder_demo_run(tenant_id,owner_membership_id,scenario,reason,predecessor_id)
   VALUES(t,actor,r.scenario,r.reason,r.id);
 END IF;
 result:=jsonb_build_object('version','small-builder-demo-run.v1','environment','synthetic_demo','runId',r.id,'scenario',r.scenario,
  'revision',r.revision,'status',CASE WHEN r.archived_at IS NULL THEN 'blocked' ELSE 'archived' END,
  'reason',r.reason,'createdAt',r.created_at,'archivedAt',r.archived_at,'predecessorId',r.predecessor_id,'successorId',
  (SELECT id FROM app.small_builder_demo_run WHERE tenant_id=t AND predecessor_id=r.id AND owner_membership_id=actor));
 IF operation='snapshot' THEN
  -- Only lifecycle facts are known here. No money, hidden signals, success or zero-action assertion.
  INSERT INTO app.small_builder_demo_report(tenant_id,run_id,facts) VALUES(t,r.id,result) RETURNING id INTO snapshot;
  result:=jsonb_build_object('version','small-builder-demo-report.v1','snapshotId',snapshot,'facts',result);
 ELSIF operation='report' THEN
  SELECT jsonb_build_object('version','small-builder-demo-report.v1','snapshotId',id,'facts',facts) INTO result
   FROM app.small_builder_demo_report WHERE tenant_id=t AND run_id=r.id AND (NOT v ? 'snapshotId' OR id=(v->>'snapshotId')::uuid) ORDER BY created_at DESC,id DESC LIMIT 1;
  IF result IS NULL THEN RAISE EXCEPTION 'DEMO_NOT_FOUND'; END IF;
 END IF;
 IF command IS NOT NULL THEN
  INSERT INTO app.small_builder_demo_receipt(tenant_id,command_id,run_id,owner_membership_id,request,result)
   VALUES(t,command,r.id,actor,request,result);
  -- Audit head is the final contending lock, after all lifecycle writes.
  PERFORM app.small_builder_demo_audit(t,actor,command,operation,app.final_lock_hash(request),app.final_lock_hash(result));
 END IF;
 RETURN result;
END $$;
ALTER FUNCTION app.small_builder_demo(uuid,text,text,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.small_builder_demo(uuid,text,text,uuid,jsonb) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.small_builder_demo(uuid,text,text,uuid,jsonb) TO jobguard_runtime;
COMMIT;
