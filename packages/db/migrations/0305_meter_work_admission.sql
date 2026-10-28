BEGIN;
-- Register resume without discarding command kinds admitted by intervening
-- migrations. Preserve the complete previous CHECK expression verbatim.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint
 WHERE conrelid='app.watchdog_command_identity'::regclass AND conname='watchdog_command_identity_command_type_check';
 IF definition IS NULL OR left(definition,7)<>'CHECK (' OR right(definition,1)<>')' THEN RAISE EXCEPTION 'unexpected command kind constraint'; END IF;
 ALTER TABLE app.watchdog_command_identity DROP CONSTRAINT watchdog_command_identity_command_type_check;
 EXECUTE 'ALTER TABLE app.watchdog_command_identity ADD CONSTRAINT watchdog_command_identity_command_type_check CHECK ('||substr(definition,8,length(definition)-8)||' OR command_type=''WorkState.resume'')';
END $$;
-- Current commitment, rebuilt from the immutable work ledger. No cached count,
-- client amount, document count or shadow input participates. Private helper.
CREATE FUNCTION app.mon1_work_committed(t uuid,j uuid,activated timestamptz,cutoff timestamptz)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE e record; state text:='pre'; anchor timestamptz; finished timestamptz;
 day31 timestamptz:=(((activated AT TIME ZONE 'Europe/London')::date+30)::timestamp AT TIME ZONE 'Europe/London');
 due timestamptz; quiet timestamptz; tail timestamptz; last_stop timestamptz;
 day31_done boolean:=false; stop_due boolean;
BEGIN
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RETURN false; END IF;
 -- Include a final sentinel to apply deadlines before returning the current state.
 FOR e IN SELECT kind,fact_at,id FROM app.job_work_state_event
  WHERE tenant_id=t AND job_id=j AND fact_at<=cutoff AND recorded_at<=cutoff
  UNION ALL SELECT '__now',cutoff,'ffffffff-ffff-4fff-bfff-ffffffffffff'::uuid
  ORDER BY fact_at,id LOOP
  LOOP
   quiet:=NULL; tail:=NULL; due:=NULL; stop_due:=true;
   IF state='counting' THEN quiet:=(((anchor AT TIME ZONE 'Europe/London')::date+30)::timestamp AT TIME ZONE 'Europe/London'); END IF;
   IF state IN('pre','counting') AND finished IS NOT NULL THEN tail:=(((finished AT TIME ZONE 'Europe/London')::date+7)::timestamp AT TIME ZONE 'Europe/London'); END IF;
   due:=least(quiet,tail);
   IF state='pre' AND NOT day31_done AND (due IS NULL OR day31<due) THEN due:=day31; stop_due:=false; END IF;
   EXIT WHEN due IS NULL OR due>e.fact_at;
   IF stop_due THEN state:='stopped'; last_stop:=due; finished:=NULL; day31_done:=true;
   ELSE state:='counting'; anchor:=due; finished:=NULL; day31_done:=true; END IF;
  END LOOP;
  IF e.kind IN('first_site_evidence','site_activity','resumed') THEN
   IF (state='pre' AND e.kind='first_site_evidence') OR state IN('counting','stopped','reserved') THEN
    IF last_stop IS NULL OR e.fact_at>last_stop THEN state:='counting'; anchor:=e.fact_at; finished:=NULL; END IF;
   END IF;
  ELSIF e.kind='finished_on_site' AND state IN('pre','counting') THEN finished:=e.fact_at;
  ELSIF e.kind='finished_cancelled' THEN finished:=NULL;
  ELSIF e.kind='closed' THEN state:='closed'; last_stop:=e.fact_at; finished:=NULL; day31_done:=true;
  -- A reopened job reserves its place even before the next site activity.
  ELSIF e.kind='reopened' AND state='closed' THEN state:='reserved';
  END IF;
 END LOOP;
 RETURN state IN('pre','counting','reserved');
END $$;
ALTER FUNCTION app.mon1_work_committed(uuid,uuid,timestamptz,timestamptz) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon1_work_committed(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,jobguard_runtime;

-- Committed capacity differs from the bill's touched-day projection. Append-only
-- snapshots keep commands bound to stored, freshly rebuilt server facts.
CREATE TABLE app.meter_work_ledger (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 london_date date NOT NULL, agreement_id uuid NOT NULL, plan text NOT NULL CHECK(plan IN('Solo','Builder')),
 jobs jsonb NOT NULL CHECK(jsonb_typeof(jobs)='array'), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,source_hash),
 FOREIGN KEY(tenant_id,agreement_id) REFERENCES app.subscription_agreement_revision(tenant_id,id),
 CHECK(tenant_id<>'11111111-1111-4111-8111-111111111111'::uuid)
);
ALTER TABLE app.meter_work_ledger OWNER TO jobguard_migration;
ALTER TABLE app.meter_work_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.meter_work_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.meter_work_ledger TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.meter_work_ledger FROM PUBLIC,jobguard_runtime,jobguard_meter,jobguard_meter_owner,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_infrastructure;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.meter_work_ledger FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation();

CREATE FUNCTION app.mon1_refresh_work_ledger(t uuid) RETURNS app.meter_work_ledger
LANGUAGE plpgsql SET search_path=pg_catalog SET timezone='UTC' AS $$
DECLARE stored app.meter_work_ledger; agreement app.subscription_agreement_revision;
 at_time timestamptz; today date; facts jsonb; projected jsonb; fingerprint text;
BEGIN
 IF current_user<>'jobguard_migration' OR t IS NULL OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- The shared practice tenant never contributes company-wide capacity facts.
 IF t='11111111-1111-4111-8111-111111111111'::uuid THEN RETURN stored; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 at_time:=clock_timestamp(); today:=(at_time AT TIME ZONE 'Europe/London')::date;
 SELECT * INTO agreement FROM app.subscription_agreement_revision ar WHERE ar.tenant_id=t AND ar.effective_date<=today
 ORDER BY ar.effective_date DESC,ar.revision DESC LIMIT 1;
 IF agreement.id IS NULL THEN RETURN stored; END IF;
 -- Legacy imports have no accepted activation/small-trip binding. Never guess
 -- their capacity from an attested amount or silently omit them from a plan.
 IF EXISTS(SELECT 1 FROM app.job j WHERE j.tenant_id=t AND j.provenance='imported' AND j.status='live' AND j.practice_session_digest IS NULL
  AND EXISTS(SELECT 1 FROM app.job_commercial_track ct WHERE ct.tenant_id=t AND ct.job_id=j.id AND ct.job_track='small_builder' AND ct.environment='synthetic_demo')
  AND NOT EXISTS(SELECT 1 FROM app.job_activation_terms terms WHERE terms.tenant_id=t AND terms.job_id=j.id))
 THEN RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE'; END IF;
 WITH base AS (
  SELECT a.job_id,a.activated_at,b.customer_id,b.site_id,terms.small_job initial_small,
   a.id source_id,terms.id terms_id,b.id binding_id
  FROM app.job_activation a JOIN app.job_activation_terms terms ON(terms.tenant_id,terms.job_id,terms.activation_id)=(a.tenant_id,a.job_id,a.id)
  JOIN app.job x ON(x.tenant_id,x.id)=(a.tenant_id,a.job_id)
  JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(a.tenant_id,a.job_id,a.party_binding_id)
  WHERE a.tenant_id=t AND a.mode='synthetic_demo' AND terms.commercial_track='small_builder' AND x.practice_session_digest IS NULL
 ), source AS (
  SELECT base.*,
   coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'at',e.fact_at,'recordedAt',e.recorded_at,'predecessor',e.predecessor_id) ORDER BY e.fact_at,e.id)
    FROM app.job_work_state_event e WHERE e.tenant_id=t AND e.job_id=base.job_id AND e.fact_at<=at_time AND e.recorded_at<=at_time),'[]'::jsonb) events,
   (SELECT jsonb_build_object('id',l.id,'at',l.locked_at) FROM app.final_account_lock l WHERE l.tenant_id=t AND l.job_id=base.job_id) lock_fact,
   (SELECT jsonb_build_object('id',trip.id,'at',trip.effective_at) FROM app.job_small_trip_event trip WHERE trip.tenant_id=t AND trip.job_id=base.job_id) trip
  FROM base
 ) SELECT coalesce(jsonb_agg(to_jsonb(source) ORDER BY job_id),'[]'::jsonb),
  coalesce(jsonb_agg(jsonb_build_object('jobId',job_id,'customerId',customer_id,'siteId',site_id,
   'small',initial_small AND trip IS NULL,'committed',app.mon1_work_committed(t,job_id,activated_at,at_time)) ORDER BY job_id),'[]'::jsonb)
 INTO facts,projected FROM source;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('recipe','committed-work.v1','date',today,'agreement',agreement.id,'plan',agreement.plan,'facts',facts)::text,'UTF8')),'hex');
 SELECT * INTO stored FROM app.meter_work_ledger WHERE tenant_id=t AND source_hash=fingerprint;
 IF stored.source_hash IS NOT NULL THEN
  IF (stored.jobs,stored.plan,stored.agreement_id,stored.london_date) IS DISTINCT FROM (projected,agreement.plan,agreement.id,today)
  THEN RAISE EXCEPTION 'METER_PROJECTION_MISMATCH'; END IF;
  RETURN stored;
 END IF;
 INSERT INTO app.meter_work_ledger(tenant_id,source_hash,london_date,agreement_id,plan,jobs)
 VALUES(t,fingerprint,today,agreement.id,agreement.plan,projected) RETURNING * INTO stored;
 RETURN stored;
END $$;
ALTER FUNCTION app.mon1_refresh_work_ledger(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon1_refresh_work_ledger(uuid) FROM PUBLIC,jobguard_runtime,jobguard_meter,jobguard_meter_owner,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_infrastructure;

CREATE OR REPLACE FUNCTION app.ch4_admit_place(t uuid,j uuid,action text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE plan text; included integer; before_count integer; after_count integer; ledger app.meter_work_ledger;
BEGIN
 IF current_user<>'jobguard_migration' OR t IS NULL OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF action NOT IN('resume','reopen','restart','switch_live') OR action IS NULL THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 -- Never expose a shared practice company's other sessions through capacity.
 IF NOT EXISTS(SELECT 1 FROM app.job_activation a JOIN app.job_activation_terms terms
  ON(terms.tenant_id,terms.job_id,terms.activation_id)=(a.tenant_id,a.job_id,a.id)
  JOIN app.job x ON(x.tenant_id,x.id)=(a.tenant_id,a.job_id)
  WHERE a.tenant_id=t AND a.job_id=j AND a.mode='synthetic_demo'
   AND terms.commercial_track='small_builder' AND x.practice_session_digest IS NULL)
 THEN RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE'; END IF;
 ledger:=app.mon1_refresh_work_ledger(t);
 IF ledger.source_hash IS NULL THEN RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE'; END IF;
 plan:=ledger.plan;
 included:=CASE plan WHEN 'Solo' THEN 4 ELSE 7 END;
 WITH jobs AS (
  SELECT (value->>'jobId')::uuid job_id,(value->>'customerId')::uuid customer_id,
   (value->>'siteId')::uuid site_id,(value->>'small')::boolean small,(value->>'committed')::boolean committed
  FROM jsonb_array_elements(ledger.jobs)
 ), places AS (
  SELECT prospective,customer_id,site_id,bool_and(small) small FROM jobs
  CROSS JOIN (VALUES(false),(true)) v(prospective)
  WHERE (committed AND NOT(action='switch_live' AND job_id=j)) OR (prospective AND job_id=j)
  GROUP BY prospective,customer_id,site_id
 ), totals AS (
  SELECT prospective,count(*)-least(count(*) FILTER(WHERE small),included) counted FROM places GROUP BY prospective
 ) SELECT coalesce(max(counted) FILTER(WHERE NOT prospective),0),coalesce(max(counted) FILTER(WHERE prospective),0)
 INTO before_count,after_count FROM totals;
 IF plan='Solo' AND after_count>6 AND after_count>before_count THEN
  RAISE EXCEPTION 'METER_UPGRADE_REQUIRED' USING ERRCODE='P0001',
   DETAIL='Your Solo plan and grace place are full. Move to Builder before starting this site work.';
 END IF;
 -- Builder additions remain unblocked. This routine creates no obligation or charge.
END $$;

-- Preserve the checked command, exact replay/actor/revision semantics and its ACL.
-- Put the tenant serializer before any command/job/audit locks.
DO $$ DECLARE original text; changed text; BEGIN
 original:=pg_get_functiondef('app.ch4_work_state_command(uuid,uuid,text,jsonb)'::regprocedure);
 changed:=regexp_replace(original,'BEGIN'||chr(10),'BEGIN'||chr(10)||' PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));'||chr(10));
 changed:=replace(changed,'IF action=''resume'' THEN RAISE EXCEPTION ''CAPACITY_ADMISSION_UNAVAILABLE''; END IF;','');
 changed:=replace(changed,'''finish'',''cancel_finish'',''close'',''reopen'',''link''','''finish'',''cancel_finish'',''close'',''reopen'',''link'',''resume''');
 changed:=replace(changed,'IF action=''finish'' THEN'||chr(10)||'  IF marker.kind',
  'IF action=''resume'' THEN'||chr(10)||'  PERFORM app.ch4_require_open(t,j);'||chr(10)||'  PERFORM app.ch4_admit_place(t,j,action);'||chr(10)||'  event_kind:=''resumed'';'||chr(10)||' ELSIF action=''finish'' THEN'||chr(10)||'  IF marker.kind');
 IF changed=original OR position('event_kind:=''resumed''' in changed)=0 THEN RAISE EXCEPTION 'unexpected CH4 command definition'; END IF;
 EXECUTE changed;
END $$;

-- Implicit restarts go through the same check before the ledger event is stored.
-- First site evidence is an automatic event and must never be refused (§10.1.4).
CREATE FUNCTION app.mon1_admit_work_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text,184));
 IF NEW.kind='site_activity' AND NOT EXISTS(SELECT 1 FROM app.job_work_state_event WHERE tenant_id=NEW.tenant_id AND id=NEW.id)
  AND EXISTS(SELECT 1 FROM app.subscription_agreement_revision WHERE tenant_id=NEW.tenant_id)
  AND EXISTS(SELECT 1 FROM app.job x WHERE x.tenant_id=NEW.tenant_id AND x.id=NEW.job_id AND x.practice_session_digest IS NULL)
 THEN PERFORM app.ch4_admit_place(NEW.tenant_id,NEW.job_id,'restart'); END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.mon1_admit_work_event() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon1_admit_work_event() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER "A0_mon1_work_admission" BEFORE INSERT ON app.job_work_state_event FOR EACH ROW EXECUTE FUNCTION app.mon1_admit_work_event();
-- Switch-live and live import reserve capacity before their transaction commits.
CREATE FUNCTION app.mon1_admit_live_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text,184));
 IF EXISTS(SELECT 1 FROM app.subscription_agreement_revision WHERE tenant_id=NEW.tenant_id)
  AND EXISTS(SELECT 1 FROM app.job x WHERE x.tenant_id=NEW.tenant_id AND x.id=NEW.job_id AND x.practice_session_digest IS NULL AND x.status IN('accepted','live'))
 AND EXISTS(SELECT 1 FROM app.job_commercial_track ct WHERE ct.tenant_id=NEW.tenant_id AND ct.job_id=NEW.job_id AND ct.job_track='small_builder' AND ct.environment='synthetic_demo')
 THEN PERFORM app.ch4_admit_place(NEW.tenant_id,NEW.job_id,'switch_live'); END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.mon1_admit_live_source() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon1_admit_live_source() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER mon1_live_admission AFTER INSERT ON app.job_activation_terms FOR EACH ROW EXECUTE FUNCTION app.mon1_admit_live_source();
CREATE TRIGGER mon1_import_admission AFTER INSERT ON app.imported_job_baseline FOR EACH ROW EXECUTE FUNCTION app.mon1_admit_live_source();
-- The command cannot commit without its updated capacity snapshot. The deferred
-- business audit remains last; these routines do no network or financial work.
CREATE FUNCTION app.mon1_refresh_after_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM app.mon1_refresh_work_ledger(NEW.tenant_id);
 RETURN NEW;
END $$;
ALTER FUNCTION app.mon1_refresh_after_source() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon1_refresh_after_source() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER mon1_work_refresh AFTER INSERT ON app.job_work_state_event FOR EACH ROW EXECUTE FUNCTION app.mon1_refresh_after_source();
CREATE TRIGGER mon1_lock_refresh AFTER INSERT ON app.final_account_lock FOR EACH ROW EXECUTE FUNCTION app.mon1_refresh_after_source();
CREATE TRIGGER mon1_trip_refresh AFTER INSERT ON app.job_small_trip_event FOR EACH ROW EXECUTE FUNCTION app.mon1_refresh_after_source();
CREATE TRIGGER mon1_plan_refresh AFTER INSERT ON app.subscription_agreement_revision FOR EACH ROW EXECUTE FUNCTION app.mon1_refresh_after_source();
-- The administrative finalizer assigns the existing narrow owner and retires
-- runtime access to the previous reader atomically, including on upgrades.
CREATE FUNCTION app.mon1_fresh_counted_meter_today(t uuid,digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE s app.meter_lifecycle_source; c app.meter_lifecycle_computation;
 d app.meter_lifecycle_day_ledger; today date := (clock_timestamp() AT TIME ZONE 'Europe/London')::date;
BEGIN
 PERFORM app.mon1_lifecycle_actor(t,digest,false);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 PERFORM app.mon1_lifecycle_actor(t,digest,false);
 SELECT * INTO s FROM app.meter_lifecycle_source
 WHERE tenant_id=t AND period_start<=today AND (source->>'endDateExclusive')::date>today
 ORDER BY period_start DESC,revision DESC LIMIT 1;
 IF s.id IS NULL THEN RAISE EXCEPTION 'METER_UNAVAILABLE'; END IF;
 -- The screen journey is held while its counted source is stale. Capacity uses
 -- the synchronously refreshed committed ledger, never these daily counts.
 IF s.source->>'asOf' IS NULL OR ((s.source->>'asOf')::timestamptz AT TIME ZONE 'Europe/London')::date<>today
 OR EXISTS(SELECT 1 FROM app.job_work_state_event e JOIN app.job j ON(j.tenant_id,j.id)=(e.tenant_id,e.job_id)
  WHERE e.tenant_id=t AND j.practice_session_digest IS NULL AND (e.recorded_at>(s.source->>'asOf')::timestamptz OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.source->'jobs','[]'::jsonb)) job, LATERAL jsonb_array_elements(coalesce(job->'events','[]'::jsonb)) fact WHERE job->>'jobId'=e.job_id::text AND fact->>'id'=e.id::text)))
 OR EXISTS(SELECT 1 FROM app.job_activation a JOIN app.job j ON(j.tenant_id,j.id)=(a.tenant_id,a.job_id)
  WHERE a.tenant_id=t AND j.practice_session_digest IS NULL AND (a.activated_at>(s.source->>'asOf')::timestamptz OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.source->'jobs','[]'::jsonb)) job WHERE job->>'jobId'=a.job_id::text AND job#>>'{activation,id}'=a.id::text)))
 OR EXISTS(SELECT 1 FROM app.final_account_lock l JOIN app.job j ON(j.tenant_id,j.id)=(l.tenant_id,l.job_id)
  WHERE l.tenant_id=t AND j.practice_session_digest IS NULL AND (l.locked_at>(s.source->>'asOf')::timestamptz OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.source->'jobs','[]'::jsonb)) job WHERE job->>'jobId'=l.job_id::text AND job#>>'{lock,id}'=l.id::text)))
 OR EXISTS(SELECT 1 FROM app.job_small_trip_event trip JOIN app.job j ON(j.tenant_id,j.id)=(trip.tenant_id,trip.job_id)
  WHERE trip.tenant_id=t AND j.practice_session_digest IS NULL AND (trip.recorded_at>(s.source->>'asOf')::timestamptz OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.source->'jobs','[]'::jsonb)) job WHERE job->>'jobId'=trip.job_id::text AND job#>>'{trip,id}'=trip.id::text)))
 OR EXISTS(SELECT 1 FROM app.job j WHERE j.tenant_id=t AND j.practice_session_digest IS NULL AND j.provenance='imported' AND j.status='live')
 OR (SELECT ar.id::text FROM app.subscription_agreement_revision ar WHERE ar.tenant_id=t AND ar.effective_date<=today
  ORDER BY ar.effective_date DESC,ar.revision DESC LIMIT 1) IS DISTINCT FROM s.source->>'agreementId'
 THEN RAISE EXCEPTION 'METER_UNAVAILABLE'; END IF;

 SELECT * INTO c FROM app.meter_lifecycle_computation
 WHERE (tenant_id,scope_id,source_id)=(t,s.scope_id,s.id)
 AND recipe_version='london-midnight-stops.v1' AND status='counted';
 SELECT * INTO d FROM app.meter_lifecycle_day_ledger
 WHERE (tenant_id,scope_id,computation_id,date)=(t,s.scope_id,c.id,today) AND status='counted';
 IF d.computation_id IS NULL THEN RAISE EXCEPTION 'METER_UNAVAILABLE'; END IF;
 IF s.source_hash IS DISTINCT FROM encode(sha256(convert_to(s.source::text,'UTF8')),'hex')
 OR c.source_hash IS DISTINCT FROM s.source_hash OR d.source_hash IS DISTINCT FROM s.source_hash
 THEN RAISE EXCEPTION 'METER_PROJECTION_MISMATCH'; END IF;
 RETURN jsonb_build_object('version','meter-today-read.v1','hypothetical',true,
  'date',today::text,'plan',s.source->>'plan','countedPlaces',d.result->'countedPlaces',
  'freeSmallPlaces',d.result->'freeSmallPlaces');
END $$;
ALTER FUNCTION app.mon1_fresh_counted_meter_today(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon1_fresh_counted_meter_today(uuid,text) FROM PUBLIC,jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.mon1_fresh_counted_meter_today(uuid,text) TO jobguard_runtime;
COMMIT;

