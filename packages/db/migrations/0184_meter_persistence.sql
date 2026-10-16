BEGIN;
-- MON-1B: explicit synthetic facts only. No subscription document, charge,
-- lifecycle endpoint, trial entitlement, admission hook or trip transition.
CREATE ROLE jobguard_meter NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA app TO jobguard_meter;

CREATE TABLE app.meter_input_event (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), id uuid NOT NULL,
 period_start date NOT NULL, period_end date NOT NULL CHECK(period_end-period_start BETWEEN 28 AND 31),
 sequence bigint NOT NULL CHECK(sequence>0), environment text NOT NULL CHECK(environment='synthetic_demo'),
 input jsonb NOT NULL, source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 actor_membership_id uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,period_start,sequence), UNIQUE(tenant_id,period_start,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.meter_computation (
 tenant_id uuid NOT NULL, id uuid NOT NULL, source_id uuid NOT NULL, period_start date NOT NULL,
 period_end date NOT NULL CHECK(period_end-period_start BETWEEN 28 AND 31), baseline boolean NOT NULL,
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL, result_hash text NOT NULL CHECK(result_hash ~ '^[a-f0-9]{64}$'),
 principal_pence bigint NOT NULL CHECK(principal_pence BETWEEN 0 AND 16900),
 actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,source_id), UNIQUE(tenant_id,period_start,id),
 FOREIGN KEY(tenant_id,period_start,source_id) REFERENCES app.meter_input_event(tenant_id,period_start,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE UNIQUE INDEX meter_one_baseline ON app.meter_computation(tenant_id,period_start) WHERE baseline;
CREATE TABLE app.meter_day_ledger (
 tenant_id uuid NOT NULL, computation_id uuid NOT NULL, date date NOT NULL, day jsonb NOT NULL,
 PRIMARY KEY(tenant_id,computation_id,date),
 FOREIGN KEY(tenant_id,computation_id) REFERENCES app.meter_computation(tenant_id,id),
 CHECK(day->>'date'=date::text)
);
CREATE TABLE app.meter_correction (
 tenant_id uuid NOT NULL, id uuid NOT NULL, period_start date NOT NULL, apply_start date NOT NULL,
 baseline_id uuid NOT NULL, computation_id uuid NOT NULL,
 delta_pence bigint NOT NULL CHECK(delta_pence BETWEEN -16900 AND 16900),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,computation_id),
 FOREIGN KEY(tenant_id,period_start,baseline_id) REFERENCES app.meter_computation(tenant_id,period_start,id),
 FOREIGN KEY(tenant_id,period_start,computation_id) REFERENCES app.meter_computation(tenant_id,period_start,id),
 CHECK(apply_start>period_start)
);
CREATE TABLE app.meter_projection_alert (
 tenant_id uuid NOT NULL, computation_id uuid NOT NULL,
 code text NOT NULL CHECK(code='METER_CACHE_MISMATCH'), detected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,computation_id,code),
 FOREIGN KEY(tenant_id,computation_id) REFERENCES app.meter_computation(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['meter_input_event','meter_computation','meter_day_ledger','meter_correction','meter_projection_alert'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  -- Direct runtime SELECT deliberately sees no rows. Only checked company reads
  -- can release data; a shared-practice context cannot read a tenant summary.
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_migration,jobguard_meter USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;
GRANT SELECT ON app.meter_input_event,app.meter_computation,app.meter_day_ledger,app.meter_correction,app.meter_projection_alert TO jobguard_runtime;
GRANT SELECT,INSERT ON app.meter_input_event,app.meter_computation,app.meter_day_ledger,app.meter_correction,app.meter_projection_alert TO jobguard_meter;

-- Tiny authority bridge: meter gets no identity, membership or shadow table
-- grants. All authority comes from the persisted session and merged SSO gate.
CREATE FUNCTION app.mon1_company_actor(t uuid,digest text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; s identity.session;
BEGIN
 IF digest IS NULL OR digest !~ '^[a-f0-9]{64}$' OR t IS NULL OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  OR t='11111111-1111-4111-8111-111111111111'::uuid THEN
  RAISE EXCEPTION 'METER_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT * INTO s FROM identity.session WHERE token_digest=digest AND environment='synthetic_demo'
  AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF s.id IS NULL THEN RAISE EXCEPTION 'METER_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT m.id INTO actor FROM identity.sso_session_memberships(s.user_id,s.id) m
  WHERE m.tenant_id=t AND m.role IN('owner','admin');
 PERFORM set_config('app.tenant_id',t::text,true);
 IF actor IS NULL THEN RAISE EXCEPTION 'METER_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;
ALTER FUNCTION app.mon1_company_actor(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon1_company_actor(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.mon1_company_actor(uuid,text) TO jobguard_meter;

-- Independent SQL boundary projection, compared against the unchanged pure
-- parent model in the repository and PostgreSQL suite. Input dates/facts are
-- explicitly supplied fixtures, never inferred lifecycle or trial policy.
CREATE FUNCTION app.mon1_project(t uuid,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE d jsonb; j jsonb; days jsonb:='[]'; start_day date; end_day date; day_date date;
 i integer:=0; raw_places bigint; small_places bigint; counted bigint; included integer; cap integer;
 monthly bigint; maximum bigint:=0; extra bigint; base bigint; n bigint:=0; principal bigint; rem bigint; denominator integer;
 policy jsonb:='{"version":"subscription_pricing_policy_v4","status":"proposed","extraPlacePence":2000,"Solo":{"included":4,"extrasCap":1,"monthlyPence":2900,"maximumPence":4900},"Builder":{"included":7,"extrasCap":5,"monthlyPence":6900,"maximumPence":16900}}';
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_METER_INPUT'; END IF;
 IF NOT v ?& ARRAY['version','environment','startDate','endDateExclusive','days']
  OR v-ARRAY['version','environment','startDate','endDateExclusive','days']<>'{}'::jsonb
  OR v->>'version' IS DISTINCT FROM 'meter-persisted-fixture.v1' OR v->>'environment' IS DISTINCT FROM 'synthetic_demo'
  OR jsonb_typeof(v->'startDate') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'endDateExclusive') IS DISTINCT FROM 'string'
  OR jsonb_typeof(v->'days') IS DISTINCT FROM 'array'
  OR v->>'startDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v->>'endDateExclusive' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 THEN RAISE EXCEPTION 'INVALID_METER_INPUT'; END IF;
 start_day:=(v->>'startDate')::date; end_day:=(v->>'endDateExclusive')::date;
 denominator:=jsonb_array_length(v->'days');
 IF denominator NOT BETWEEN 28 AND 31 OR end_day-start_day<>denominator OR extract(year FROM start_day) NOT BETWEEN 1 AND 9999 OR extract(year FROM end_day) NOT BETWEEN 1 AND 9999
 THEN RAISE EXCEPTION 'INVALID_METER_INPUT'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(v->'days') ORDER BY value->>'date' LOOP
  IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_METER_INPUT'; END IF;
  IF NOT d ?& ARRAY['date','plan','annualPrepaid','trial','jobs'] OR d-ARRAY['date','plan','annualPrepaid','trial','jobs']<>'{}'::jsonb
   OR d->>'plan' NOT IN('Solo','Builder') OR jsonb_typeof(d->'plan') IS DISTINCT FROM 'string'
   OR jsonb_typeof(d->'annualPrepaid') IS DISTINCT FROM 'boolean' OR jsonb_typeof(d->'trial') IS DISTINCT FROM 'boolean'
   OR jsonb_typeof(d->'date') IS DISTINCT FROM 'string'
   OR jsonb_typeof(d->'jobs') IS DISTINCT FROM 'array' OR d->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  THEN RAISE EXCEPTION 'INVALID_METER_INPUT'; END IF;
  day_date:=(d->>'date')::date;
  IF day_date<>start_day+i THEN RAISE EXCEPTION 'INVALID_METER_INPUT'; END IF;
  FOR j IN SELECT value FROM jsonb_array_elements(d->'jobs') LOOP
   IF jsonb_typeof(j) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_METER_INPUT'; END IF;
   IF NOT j ?& ARRAY['tenantId','jobId','customerId','siteId','small'] OR j-ARRAY['tenantId','jobId','customerId','siteId','small']<>'{}'::jsonb
    OR jsonb_typeof(j->'small') IS DISTINCT FROM 'boolean' OR (j->>'tenantId')::uuid IS DISTINCT FROM t
    OR jsonb_typeof(j->'tenantId') IS DISTINCT FROM 'string' OR jsonb_typeof(j->'jobId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(j->'customerId') IS DISTINCT FROM 'string' OR jsonb_typeof(j->'siteId') IS DISTINCT FROM 'string'
    OR (j->>'jobId')::uuid IS NULL OR (j->>'customerId')::uuid IS NULL OR (j->>'siteId')::uuid IS NULL
   THEN RAISE EXCEPTION 'INVALID_METER_INPUT'; END IF;
  END LOOP;
  IF (SELECT count(*)<>count(DISTINCT (value->>'jobId')::uuid) FROM jsonb_array_elements(d->'jobs')) THEN RAISE EXCEPTION 'INVALID_METER_INPUT'; END IF;
  SELECT count(*),count(*) FILTER(WHERE small) INTO raw_places,small_places FROM (
   SELECT bool_and((value->>'small')::boolean) small FROM jsonb_array_elements(d->'jobs') GROUP BY (value->>'customerId')::uuid,(value->>'siteId')::uuid
  ) grouped;
  included:=CASE WHEN d->>'plan'='Solo' THEN 4 ELSE 7 END; cap:=CASE WHEN d->>'plan'='Solo' THEN 1 ELSE 5 END;
  monthly:=CASE WHEN d->>'plan'='Solo' THEN 2900 ELSE 6900 END; maximum:=greatest(maximum,CASE WHEN d->>'plan'='Solo' THEN 4900 ELSE 16900 END);
  counted:=raw_places-least(small_places,included);
  base:=CASE WHEN (d->>'trial')::boolean OR (d->>'annualPrepaid')::boolean THEN 0 ELSE monthly END;
  extra:=CASE WHEN (d->>'trial')::boolean THEN 0 ELSE least(greatest(0,counted-included),cap) END;
  days:=days||jsonb_build_array(jsonb_build_object('date',day_date::text,'plan',d->>'plan','annualPrepaid',(d->>'annualPrepaid')::boolean,'trial',(d->>'trial')::boolean,
   'countedPlaces',counted,'basePence',base,'paidExtraPlaces',extra,'extraPence',extra*2000,'numeratorPence',(base+extra*2000)::text));
  n:=n+base+extra*2000; i:=i+1;
 END LOOP;
 principal:=n/denominator; rem:=n%denominator;
 IF rem*2>denominator OR (rem*2=denominator AND principal%2=1) THEN principal:=principal+1; END IF;
 IF principal>maximum THEN RAISE EXCEPTION 'METER_MAXIMUM_EXCEEDED'; END IF;
 RETURN jsonb_build_object('version','meter-supplied-period-result.v1','environment','synthetic_demo','hypothetical',true,'realExternalActions',0,'policy',policy,
  'startDate',start_day::text,'endDateExclusive',end_day::text,'principal',jsonb_build_object('pence',principal,'currency','GBP'),'maximum',jsonb_build_object('pence',maximum,'currency','GBP'),
  'numeratorPence',n::text,'denominatorDays',denominator,'days',days);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'INVALID_METER_INPUT' USING ERRCODE='22023';
END $$;

-- Privileged fixture loader only: production callers have no EXECUTE grant.
-- The actor is still checked from a persisted session; no actor argument exists.
CREATE FUNCTION app.mon1_store_fixture(t uuid,digest text,event_id uuid,v jsonb) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; hash text; prior app.meter_input_event; seq bigint;
BEGIN
 actor:=app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 actor:=app.mon1_company_actor(t,digest);
 PERFORM app.mon1_project(t,v);
 hash:=encode(sha256(convert_to(v::text,'UTF8')),'hex');
 SELECT * INTO prior FROM app.meter_input_event WHERE tenant_id=t AND id=event_id;
 IF prior.id IS NOT NULL THEN
  IF prior.source_hash<>hash OR prior.actor_membership_id<>actor THEN RAISE EXCEPTION 'METER_IDEMPOTENCY_CONFLICT' USING ERRCODE='22023'; END IF;
  RETURN prior.id;
 END IF;
 -- Preserve the parent's prospective identity rule. Historical same-job/day
 -- grouping cannot be rewritten by a late supplied snapshot.
 IF EXISTS(SELECT 1 FROM app.meter_computation WHERE tenant_id=t AND period_start=(v->>'startDate')::date) AND EXISTS(
  SELECT 1 FROM app.meter_input_event e
   CROSS JOIN LATERAL jsonb_array_elements(e.input->'days') old_day
   CROSS JOIN LATERAL jsonb_array_elements(old_day->'jobs') old_job
   CROSS JOIN LATERAL jsonb_array_elements(v->'days') new_day
   CROSS JOIN LATERAL jsonb_array_elements(new_day->'jobs') new_job
  WHERE e.tenant_id=t AND e.period_start=(v->>'startDate')::date AND old_day->>'date'=new_day->>'date'
   AND (old_job->>'jobId')::uuid=(new_job->>'jobId')::uuid
   AND ROW((old_job->>'customerId')::uuid,(old_job->>'siteId')::uuid) IS DISTINCT FROM ROW((new_job->>'customerId')::uuid,(new_job->>'siteId')::uuid)
 ) THEN RAISE EXCEPTION 'METER_IDENTITY_CORRECTION_REQUIRES_FUTURE_PERIOD' USING ERRCODE='22023'; END IF;
 SELECT coalesce(max(sequence),0)+1 INTO seq FROM app.meter_input_event WHERE tenant_id=t AND period_start=(v->>'startDate')::date;
 INSERT INTO app.meter_input_event(tenant_id,id,period_start,period_end,sequence,environment,input,source_hash,actor_membership_id)
 VALUES(t,event_id,(v->>'startDate')::date,(v->>'endDateExclusive')::date,seq,'synthetic_demo',v,hash,actor);
 RETURN event_id;
END $$;

CREATE FUNCTION app.mon1_rebuild(t uuid,digest text,start_day date) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; source app.meter_input_event; existing app.meter_computation; baseline app.meter_computation;
 result jsonb; result_hash text; id uuid:=gen_random_uuid(); amount bigint; delta bigint; ledger jsonb; stored_input jsonb; baseline_amount bigint;
BEGIN
 -- Authorization always precedes target lookup and replay, including missing or
 -- foreign periods. One tenant lock serializes loaders, rebuilds and corrections.
 actor:=app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 actor:=app.mon1_company_actor(t,digest);
 -- Detect drift in every earlier projection, including a baseline whose latest
 -- source has since changed. Every comparison rebuilds from immutable facts.
 FOR existing IN SELECT * FROM app.meter_computation WHERE tenant_id=t AND period_start=start_day LOOP
  SELECT input INTO stored_input FROM app.meter_input_event WHERE tenant_id=t AND meter_input_event.id=existing.source_id;
  result:=app.mon1_project(t,stored_input); result_hash:=encode(sha256(convert_to(result::text,'UTF8')),'hex');
  SELECT coalesce(jsonb_agg(day ORDER BY date),'[]') INTO ledger FROM app.meter_day_ledger WHERE tenant_id=t AND computation_id=existing.id;
  IF existing.result_hash<>result_hash OR existing.result<>result OR existing.principal_pence<>(result->'principal'->>'pence')::bigint OR ledger IS DISTINCT FROM result->'days' THEN
   INSERT INTO app.meter_projection_alert(tenant_id,computation_id,code) VALUES(t,existing.id,'METER_CACHE_MISMATCH') ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 SELECT * INTO source FROM app.meter_input_event WHERE tenant_id=t AND period_start=start_day ORDER BY sequence DESC LIMIT 1;
 IF source.id IS NULL THEN RAISE EXCEPTION 'METER_FORBIDDEN' USING ERRCODE='42501'; END IF;
 result:=app.mon1_project(t,source.input); result_hash:=encode(sha256(convert_to(result::text,'UTF8')),'hex');
 amount:=(result->'principal'->>'pence')::bigint;
 SELECT * INTO existing FROM app.meter_computation WHERE tenant_id=t AND source_id=source.id;
 IF existing.id IS NOT NULL THEN RETURN existing.id; END IF;
 SELECT * INTO baseline FROM app.meter_computation WHERE tenant_id=t AND period_start=start_day AND meter_computation.baseline;
 IF baseline.id IS NOT NULL AND baseline.period_end<>source.period_end THEN RAISE EXCEPTION 'INVALID_METER_INPUT'; END IF;
 IF baseline.id IS NOT NULL AND EXISTS(SELECT 1 FROM app.meter_computation WHERE tenant_id=t AND period_start=source.period_end) THEN
  RAISE EXCEPTION 'METER_CORRECTION_PERIOD_CLOSED' USING ERRCODE='22023';
 END IF;
 INSERT INTO app.meter_computation(tenant_id,id,source_id,period_start,period_end,baseline,source_hash,result,result_hash,principal_pence,actor_membership_id)
 VALUES(t,id,source.id,start_day,source.period_end,baseline.id IS NULL,source.source_hash,result,result_hash,amount,actor);
 INSERT INTO app.meter_day_ledger(tenant_id,computation_id,date,day) SELECT t,id,(value->>'date')::date,value FROM jsonb_array_elements(result->'days');
 IF baseline.id IS NOT NULL THEN
  SELECT (app.mon1_project(t,input)->'principal'->>'pence')::bigint INTO baseline_amount FROM app.meter_input_event WHERE tenant_id=t AND meter_input_event.id=baseline.source_id;
  SELECT amount-baseline_amount-coalesce(sum(delta_pence),0) INTO delta FROM app.meter_correction WHERE tenant_id=t AND period_start=start_day;
  INSERT INTO app.meter_correction(tenant_id,id,period_start,apply_start,baseline_id,computation_id,delta_pence) VALUES(t,gen_random_uuid(),start_day,source.period_end,baseline.id,id,delta);
 END IF;
 RETURN id;
END $$;

CREATE FUNCTION app.mon1_read(t uuid,digest text,computation uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c app.meter_computation; actor uuid; corrections jsonb; alerts jsonb; authoritative jsonb; source app.meter_input_event;
BEGIN
 actor:=app.mon1_company_actor(t,digest);
 SELECT * INTO c FROM app.meter_computation WHERE tenant_id=t AND id=computation;
 IF c.id IS NULL THEN RAISE EXCEPTION 'METER_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO source FROM app.meter_input_event WHERE tenant_id=t AND id=c.source_id;
 authoritative:=app.mon1_project(t,source.input);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'sourcePeriod',period_start::text,'applyStart',apply_start::text,'delta',jsonb_build_object('pence',delta_pence,'currency','GBP')) ORDER BY created_at,id),'[]') INTO corrections FROM app.meter_correction WHERE tenant_id=t AND apply_start=c.period_start;
 SELECT coalesce(jsonb_agg(code ORDER BY code),'[]') INTO alerts FROM app.meter_projection_alert WHERE tenant_id=t AND computation_id=c.id;
 -- Cached rows never set the reported principal, including before a mismatch
 -- has been detected by a rebuild. Source snapshots are immutable.
 RETURN jsonb_build_object('version','meter-persisted-read.v1','hypothetical',true,'computationId',c.id,'sourceId',c.source_id,'sourceHash',source.source_hash,
  'resultHash',encode(sha256(convert_to(authoritative::text,'UTF8')),'hex'),'result',authoritative,'corrections',corrections,'alerts',alerts);
END $$;

DO $$ DECLARE fn text; BEGIN
 FOREACH fn IN ARRAY ARRAY['mon1_project(uuid,jsonb)','mon1_store_fixture(uuid,text,uuid,jsonb)','mon1_rebuild(uuid,text,date)','mon1_read(uuid,text,uuid)'] LOOP
  EXECUTE 'ALTER FUNCTION app.'||fn||' OWNER TO jobguard_meter';
  EXECUTE 'REVOKE ALL ON FUNCTION app.'||fn||' FROM PUBLIC';
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION app.mon1_store_fixture(uuid,text,uuid,jsonb) TO jobguard_migration;
GRANT EXECUTE ON FUNCTION app.mon1_rebuild(uuid,text,date),app.mon1_read(uuid,text,uuid) TO jobguard_runtime;
COMMIT;
