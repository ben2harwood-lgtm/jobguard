BEGIN;
-- No commercial facts: source snapshots and all nested evidence/approval fields are fixture lineage.
CREATE TABLE app.cis_fixture_record (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, statement_id uuid NOT NULL, command_id uuid NOT NULL,
 previous_statement_id uuid, actor jsonb NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 payload jsonb NOT NULL, record_hash text NOT NULL CHECK(record_hash ~ '^[a-f0-9]{64}$'),
 environment text NOT NULL CHECK(environment='synthetic'),
 label text NOT NULL CHECK(label='fixture, awaiting adviser approval'),
 policy_version text NOT NULL CHECK(policy_version='cis.materials-only.cumulative-half-up.dark.v1'),
 rate_numerator integer NOT NULL CHECK(rate_numerator IN(0,20,30)), rate_denominator integer NOT NULL CHECK(rate_denominator=100),
 PRIMARY KEY(tenant_id,statement_id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,job_id,statement_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,previous_statement_id) REFERENCES app.cis_fixture_record(tenant_id,job_id,statement_id)
);
CREATE UNIQUE INDEX cis_fixture_one_root ON app.cis_fixture_record(tenant_id,job_id) WHERE previous_statement_id IS NULL;
CREATE UNIQUE INDEX cis_fixture_one_successor ON app.cis_fixture_record(tenant_id,job_id,previous_statement_id) WHERE previous_statement_id IS NOT NULL;
CREATE UNIQUE INDEX cis_fixture_document_reference ON app.cis_fixture_record(tenant_id,job_id,(payload->'statement'->>'documentReference'));
ALTER TABLE app.cis_fixture_record OWNER TO jobguard_migration;
ALTER TABLE app.cis_fixture_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.cis_fixture_record FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.cis_fixture_record TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.cis_fixture_record FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER cis_fixture_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.cis_fixture_record
 FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation();

-- Sole storage boundary, not a commercial command executor. NULL input loads and locks the book.
CREATE FUNCTION app.cis_fixture_records(t uuid,j uuid,a jsonb,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old_tenant text:=current_setting('app.tenant_id',true); prior app.cis_fixture_record;
 tail uuid; s jsonb; p jsonb; result jsonb; verification jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR t IS DISTINCT FROM nullif(old_tenant,'')::uuid
 THEN RAISE EXCEPTION 'CIS_FIXTURE_NOT_FOUND'; END IF;
 -- Explicit local context supports FORCE RLS; never a function-level SET app.*.
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,756));
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j)
 THEN RAISE EXCEPTION 'CIS_FIXTURE_NOT_FOUND'; END IF;
 IF v IS NOT NULL THEN
  IF a IS NULL OR jsonb_typeof(a)<>'object' OR a-ARRAY['membershipId','identityUserId']<>'{}'::jsonb
   OR NOT (a ?& ARRAY['membershipId','identityUserId'])
   OR NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=(a->>'membershipId')::uuid
    AND identity_user_id=(a->>'identityUserId')::uuid AND role='owner'
    AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
  THEN RAISE EXCEPTION 'CIS_FIXTURE_NOT_FOUND'; END IF;
  IF jsonb_typeof(v)<>'object' OR v-ARRAY['commandId','requestHash','rateNumerator','fixed','statement','payments','verifications']<>'{}'::jsonb
   OR NOT (v ?& ARRAY['commandId','requestHash','rateNumerator','fixed','statement','payments','verifications'])
   OR coalesce(v->>'requestHash','') !~ '^[a-f0-9]{64}$'
   OR jsonb_typeof(v->'payments') IS DISTINCT FROM 'array' OR jsonb_typeof(v->'verifications') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'CIS_FIXTURE_CONFLICT'; END IF;
  p:=v-ARRAY['commandId','requestHash','rateNumerator']; s:=p->'statement';
  SELECT * INTO prior FROM app.cis_fixture_record WHERE tenant_id=t AND command_id=(v->>'commandId')::uuid;
  IF FOUND THEN
   IF prior.job_id<>j OR prior.actor IS DISTINCT FROM a OR prior.request_hash IS DISTINCT FROM v->>'requestHash'
    OR prior.payload IS DISTINCT FROM p OR prior.rate_numerator IS DISTINCT FROM (v->>'rateNumerator')::integer
   THEN RAISE EXCEPTION 'CIS_FIXTURE_CONFLICT'; END IF;
  ELSE
   SELECT r.statement_id INTO tail FROM app.cis_fixture_record r WHERE r.tenant_id=t AND r.job_id=j
    AND NOT EXISTS(SELECT 1 FROM app.cis_fixture_record n WHERE n.tenant_id=t AND n.job_id=j AND n.previous_statement_id=r.statement_id);
   IF s->>'version' IS DISTINCT FROM 'cis.statement-fixture.v1' OR s->>'tenantId' IS DISTINCT FROM t::text
    OR s->>'jobId' IS DISTINCT FROM j::text OR (s->>'previousStatementId')::uuid IS DISTINCT FROM tail
    OR (CASE WHEN tail IS NULL THEN p->'fixed'->>'tenantId' IS DISTINCT FROM t::text
     OR p->'fixed'->>'jobId' IS DISTINCT FROM j::text
     OR p->'fixed'->>'environment' IS DISTINCT FROM 'synthetic'
     OR p->'fixed'->>'label' IS DISTINCT FROM 'fixture, awaiting adviser approval'
     OR p->'fixed'->>'policyVersion' IS DISTINCT FROM 'cis.materials-only.cumulative-half-up.dark.v1'
     ELSE p->'fixed' IS DISTINCT FROM 'null'::jsonb END)
    OR (CASE WHEN s->>'kind'='correction' THEN tail IS NULL OR (s->>'correctionOfStatementId')::uuid IS DISTINCT FROM tail
     ELSE s->>'kind' IS DISTINCT FROM 'payment' OR s->'correctionOfStatementId' IS DISTINCT FROM 'null'::jsonb END)
   THEN RAISE EXCEPTION 'CIS_FIXTURE_CONFLICT'; END IF;
   -- Supplied additions may not reuse any stored source ID or payment business reference.
   IF EXISTS(SELECT 1 FROM app.cis_fixture_record r,
     LATERAL jsonb_array_elements((r.payload->'payments')||(r.payload->'verifications')) old,
     LATERAL jsonb_array_elements((p->'payments')||(p->'verifications')) fresh
     WHERE r.tenant_id=t AND r.job_id=j AND (old->>'id'=fresh->>'id'
      OR (old ? 'paymentReference' AND old->>'paymentReference'=fresh->>'paymentReference')))
   THEN RAISE EXCEPTION 'CIS_FIXTURE_CONFLICT'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'payments') fresh
    WHERE fresh->>'tenantId' IS DISTINCT FROM t::text OR fresh->>'jobId' IS DISTINCT FROM j::text
     OR fresh->>'id' IS NULL OR NOT (s->'paymentRecordIds' @> jsonb_build_array(fresh->>'id')))
    OR jsonb_array_length(p->'payments')<>jsonb_array_length(s->'paymentRecordIds')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(s->'paymentRecordIds') fresh
     JOIN app.cis_fixture_record r ON r.tenant_id=t AND r.job_id=j
     WHERE r.payload->'statement'->'paymentRecordIds' @> jsonb_build_array(fresh.value))
   THEN RAISE EXCEPTION 'CIS_FIXTURE_CONFLICT'; END IF;
   SELECT x INTO verification FROM (
    SELECT value x FROM jsonb_array_elements(p->'verifications')
    UNION ALL SELECT value FROM app.cis_fixture_record r, LATERAL jsonb_array_elements(r.payload->'verifications')
     WHERE r.tenant_id=t AND r.job_id=j) all_verifications WHERE x->>'id'=s->>'verificationId';
   IF verification IS NULL OR coalesce(verification->>'status','') NOT IN('gross_payment','registered','unregistered')
    OR verification->>'tenantId' IS DISTINCT FROM t::text OR verification->>'jobId' IS DISTINCT FROM j::text
    OR verification->>'evidenceId' IS NULL OR verification->>'recordedBy' IS NULL
    OR (verification->>'validFrom')::date>(s->>'documentDate')::date
    OR (verification->>'validThrough')::date<(s->>'documentDate')::date
    OR (verification->>'validFrom') IS NULL OR (verification->>'validThrough') IS NULL
   THEN RAISE EXCEPTION 'CIS_FIXTURE_CONFLICT'; END IF;
   INSERT INTO app.cis_fixture_record VALUES(t,j,(s->>'id')::uuid,(v->>'commandId')::uuid,tail,a,v->>'requestHash',p,
    app.final_lock_hash(jsonb_build_object('payload',p,'actor',a,'requestHash',v->>'requestHash','rateNumerator',(v->>'rateNumerator')::integer)),
    'synthetic','fixture, awaiting adviser approval','cis.materials-only.cumulative-half-up.dark.v1',(v->>'rateNumerator')::integer,100);
  END IF;
 END IF;
 WITH RECURSIVE history AS (
  SELECT r.*,1 position FROM app.cis_fixture_record r WHERE tenant_id=t AND job_id=j AND previous_statement_id IS NULL
  UNION ALL SELECT r.*,h.position+1 FROM app.cis_fixture_record r JOIN history h
   ON r.tenant_id=h.tenant_id AND r.job_id=h.job_id AND r.previous_statement_id=h.statement_id
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('commandId',command_id,'actor',actor,'requestHash',request_hash,
   'recordHash',record_hash,'payload',payload,'environment',environment,'label',label,'policyVersion',policy_version,
   'rateNumerator',rate_numerator,'rateDenominator',rate_denominator,
   'intact',record_hash=app.final_lock_hash(jsonb_build_object('payload',payload,'actor',actor,'requestHash',request_hash,'rateNumerator',rate_numerator))) ORDER BY position),'[]'::jsonb)
 INTO result FROM history;
 PERFORM set_config('app.tenant_id',coalesce(old_tenant,''),true);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.tenant_id',coalesce(old_tenant,''),true);
 RAISE;
END $$;
ALTER FUNCTION app.cis_fixture_records(uuid,uuid,jsonb,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.cis_fixture_records(uuid,uuid,jsonb,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.cis_fixture_records(uuid,uuid,jsonb,jsonb) TO jobguard_runtime;
COMMIT;
