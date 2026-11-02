BEGIN;
-- M4-17 queue: persist supplied fake reference snapshots, never authoritative
-- books, settlement, recovery qualification or an executable money adjustment.
CREATE TABLE app.financial_reconciliation_run (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 actor_membership_id uuid NOT NULL, actor_identity_id uuid NOT NULL,
 request jsonb NOT NULL, snapshot jsonb NOT NULL, report jsonb NOT NULL,
 trigger text NOT NULL CHECK(trigger IN('daily','on_demand')), day date NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,job_id,id), CONSTRAINT fr_run_command UNIQUE(tenant_id,id), CONSTRAINT fr_run_revision UNIQUE(tenant_id,job_id,revision),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK((snapshot->>'environment'='synthetic_demo' AND snapshot->>'version'='financial-reconciliation-snapshot.v1') IS TRUE),
 CHECK((snapshot->>'tenantId'=tenant_id::text AND snapshot->>'jobId'=job_id::text) IS TRUE),
 CHECK(report @> '{"version":"financial-reconciliation-report.v1","referenceOnly":true,"authoritativeSourceVerification":false,"productionEnabled":false,"realExternalActions":0}'::jsonb),
 CHECK((jsonb_typeof(report->'queue')='array') IS TRUE)
);
CREATE UNIQUE INDEX fr_daily ON app.financial_reconciliation_run(tenant_id,job_id,day) WHERE trigger='daily';
CREATE TABLE app.financial_reconciliation_difference (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, run_id uuid NOT NULL,
 difference_id text NOT NULL CHECK(difference_id~'^[a-f0-9]{64}$'), detail jsonb NOT NULL,
 PRIMARY KEY(tenant_id,job_id,run_id,difference_id),
 FOREIGN KEY(tenant_id,job_id,run_id) REFERENCES app.financial_reconciliation_run(tenant_id,job_id,id),
 CHECK((detail->>'differenceId'=difference_id) IS TRUE)
);
CREATE TABLE app.financial_reconciliation_adjustment (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, run_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, actor_identity_id uuid NOT NULL, request jsonb NOT NULL,
 content_hash text NOT NULL CHECK(content_hash~'^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,job_id,id), CONSTRAINT fr_adjustment_command UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,run_id) REFERENCES app.financial_reconciliation_run(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.financial_reconciliation_approval (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, adjustment_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, actor_identity_id uuid NOT NULL, request jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,job_id,id), CONSTRAINT fr_approval_command UNIQUE(tenant_id,id), CONSTRAINT fr_approval_adjustment UNIQUE(tenant_id,job_id,adjustment_id),
 FOREIGN KEY(tenant_id,job_id,adjustment_id) REFERENCES app.financial_reconciliation_adjustment(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
-- Retains every command identity, including daily aliases, across restarts.
CREATE TABLE app.financial_reconciliation_command (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, result_id uuid NOT NULL,
 actor_identity_id uuid NOT NULL, request jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['financial_reconciliation_run','financial_reconciliation_difference','financial_reconciliation_adjustment','financial_reconciliation_approval','financial_reconciliation_command'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow',n);
  EXECUTE format('CREATE TRIGGER fr_immutable BEFORE INSERT OR UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.ef_immutable()',n);
  EXECUTE format('CREATE TRIGGER fr_no_truncate BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.ef_immutable()',n);
 END LOOP;
END $$;

CREATE FUNCTION app.financial_reconciliation_queue(p_session uuid,p_job uuid,p_command jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; u uuid; k text; cid uuid; r app.financial_reconciliation_run;
 proposal app.financial_reconciliation_adjustment; item jsonb; next_revision integer; prior app.financial_reconciliation_command; result_id uuid;
BEGIN
 IF p_command->>'version' IS DISTINCT FROM 'financial-reconciliation-storage.v1' THEN
  RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023';
 END IF;
 -- Reuse the existing live session, membership and unrevoked tenant finance
 -- grant contract. Same tenant alone, a supplied actor or a practice flag is not authority.
 a:=app.ef_actor(p_session); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 SELECT identity_user_id INTO u FROM app.membership WHERE tenant_id=t AND id=a;
 k:=p_command->>'action';
 IF (p_command - (CASE k WHEN 'run' THEN ARRAY['version','action','commandId','trigger','day','snapshot','report']
  WHEN 'read' THEN ARRAY['version','action','runId'] WHEN 'propose' THEN ARRAY['version','action','commandId','runId','adjustment','contentHash']
  ELSE ARRAY['version','action','commandId','adjustmentId','contentHash'] END))<>'{}'::jsonb THEN
  RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023';
 END IF;
 IF k='read' THEN
  SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job AND id=(p_command->>'runId')::uuid;
  IF r.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id',r.id,'snapshot',r.snapshot,'report',r.report);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=p_job AND environment='synthetic_demo') THEN
  IF k='read' THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF k IS NULL OR k NOT IN('run','propose','approve') OR pg_input_is_valid(p_command->>'commandId','uuid') IS NOT TRUE THEN
  RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023';
 END IF;
 cid:=(p_command->>'commandId')::uuid;
 -- One scheduling/adjustment owner. Audit head is always acquired last.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,479));
 -- Recheck after the lock wait, including revoked/expired finance sessions.
 a:=app.ef_actor(p_session);
 SELECT * INTO prior FROM app.financial_reconciliation_command WHERE tenant_id=t AND id=cid;
 IF prior.id IS NOT NULL THEN
  IF prior.job_id<>p_job OR prior.request<>p_command OR prior.actor_identity_id<>u THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF k='run' THEN
   SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job AND id=prior.result_id;
   RETURN jsonb_build_object('id',r.id,'snapshot',r.snapshot,'report',r.report);
  END IF;
  RETURN jsonb_build_object('id',prior.result_id);
 END IF;
 result_id:=cid;
 IF k='run' THEN
  SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND id=cid;
  IF r.id IS NULL AND p_command->>'trigger'='daily' THEN
   SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job AND trigger='daily' AND day=(p_command->>'day')::date;
  END IF;
  IF r.id IS NOT NULL THEN
   INSERT INTO app.financial_reconciliation_command(tenant_id,job_id,id,result_id,actor_identity_id,request) VALUES(t,p_job,cid,r.id,u,p_command);
   RETURN jsonb_build_object('id',r.id,'snapshot',r.snapshot,'report',r.report);
  END IF;
  IF p_command->'snapshot'->>'tenantId' IS DISTINCT FROM t::text OR p_command->'snapshot'->>'jobId' IS DISTINCT FROM p_job::text THEN
   RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_command->'report'->>'sourceHash' IS DISTINCT FROM encode(sha256(convert_to('financial-reconciliation.v1'||chr(10)||app.final_lock_canonical(p_command->'snapshot'),'UTF8')),'hex') THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements((p_command->'snapshot'->'invoices')||(p_command->'snapshot'->'provider')||(p_command->'snapshot'->'journals')||(p_command->'snapshot'->'corrections')) LOOP
   IF item->>'tenantId' IS DISTINCT FROM t::text OR item->>'jobId' IS DISTINCT FROM p_job::text THEN
    RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN' USING ERRCODE='42501';
   END IF;
  END LOOP;
  SELECT coalesce(max(revision),0)+1 INTO next_revision FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job;
  INSERT INTO app.financial_reconciliation_run(tenant_id,job_id,id,revision,actor_membership_id,actor_identity_id,request,snapshot,report,trigger,day)
   VALUES(t,p_job,cid,next_revision,a,u,p_command,p_command->'snapshot',p_command->'report',p_command->>'trigger',(p_command->>'day')::date) RETURNING * INTO r;
  FOR item IN SELECT value FROM jsonb_array_elements(r.report->'queue') LOOP
   INSERT INTO app.financial_reconciliation_difference(tenant_id,job_id,run_id,difference_id,detail) VALUES(t,p_job,cid,item->>'differenceId',item);
  END LOOP;
 ELSIF k='propose' THEN
  SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job ORDER BY revision DESC LIMIT 1;
  IF r.id IS DISTINCT FROM (p_command->>'runId')::uuid OR r.report->>'sourceHash' IS DISTINCT FROM p_command->'adjustment'->>'reportHash'
   OR p_command->'adjustment'->>'tenantId' IS DISTINCT FROM t::text OR p_command->'adjustment'->>'jobId' IS DISTINCT FROM p_job::text
   OR p_command->'adjustment'->>'commandId' IS DISTINCT FROM cid::text THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF p_command->>'contentHash' IS DISTINCT FROM encode(sha256(convert_to('financial-reconciliation.v1'||chr(10)||app.final_lock_canonical(p_command->'adjustment'),'UTF8')),'hex')
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.snapshot->'invoices') i
    WHERE i->>'id'=coalesce(p_command->'adjustment'->'fact'->>'invoiceId',p_command->'adjustment'->'correction'->>'invoiceId')
     AND i->>'revision'=p_command->'adjustment'->>'invoiceRevision') THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  item:=coalesce(p_command->'adjustment'->'fact',p_command->'adjustment'->'correction');
  IF (p_command->'adjustment' ? 'fact')=(p_command->'adjustment' ? 'correction')
   OR item->>'tenantId' IS DISTINCT FROM t::text OR item->>'jobId' IS DISTINCT FROM p_job::text THEN
   RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  INSERT INTO app.financial_reconciliation_adjustment(tenant_id,job_id,id,run_id,actor_membership_id,actor_identity_id,request,content_hash)
   VALUES(t,p_job,cid,r.id,a,u,p_command,p_command->>'contentHash');
 ELSE
  SELECT * INTO proposal FROM app.financial_reconciliation_adjustment WHERE tenant_id=t AND job_id=p_job AND id=(p_command->>'adjustmentId')::uuid;
  IF proposal.id IS NULL THEN RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF proposal.actor_identity_id=u THEN RAISE EXCEPTION 'RECONCILIATION_SELF_APPROVAL' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job ORDER BY revision DESC LIMIT 1;
  IF r.id<>proposal.run_id OR proposal.content_hash IS DISTINCT FROM p_command->>'contentHash' THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  INSERT INTO app.financial_reconciliation_approval(tenant_id,job_id,id,adjustment_id,actor_membership_id,actor_identity_id,request)
   VALUES(t,p_job,cid,proposal.id,a,u,p_command);
 END IF;
 INSERT INTO app.financial_reconciliation_command(tenant_id,job_id,id,result_id,actor_identity_id,request) VALUES(t,p_job,cid,result_id,u,p_command);
 PERFORM app.ef_audit(a,'financial_reconciliation.'||k,'job',p_job,
  jsonb_build_object('references',jsonb_build_object('commandId',cid::text,'environment','synthetic_demo')));
 IF k='run' THEN RETURN jsonb_build_object('id',r.id,'snapshot',r.snapshot,'report',r.report); END IF;
 RETURN jsonb_build_object('id',cid);
END $$;
ALTER FUNCTION app.financial_reconciliation_queue(uuid,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.financial_reconciliation_queue(uuid,uuid,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow;
GRANT EXECUTE ON FUNCTION app.financial_reconciliation_queue(uuid,uuid,jsonb) TO jobguard_runtime;
COMMIT;
