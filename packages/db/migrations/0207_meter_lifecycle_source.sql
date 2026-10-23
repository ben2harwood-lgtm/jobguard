BEGIN;
-- MON1-S: normal-company, synthetic actual-source foundation. No trial or
-- practice authority, billable counts, commercial writes or subscription bridge.
CREATE ROLE jobguard_meter NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA app TO jobguard_meter;
CREATE TABLE app.meter_lifecycle_scope (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), id uuid NOT NULL,
 kind text NOT NULL CHECK(kind='normal_company'), PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,kind),
 CHECK(tenant_id<>'11111111-1111-4111-8111-111111111111'::uuid)
);
CREATE TABLE app.meter_lifecycle_source (
 tenant_id uuid NOT NULL, scope_id uuid NOT NULL, id uuid NOT NULL, command_id uuid NOT NULL,
 period_start date NOT NULL, revision integer NOT NULL CHECK(revision>0), expected_revision integer NOT NULL CHECK(expected_revision=revision-1),
 source jsonb NOT NULL, source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,scope_id,id), UNIQUE(tenant_id,scope_id,command_id), UNIQUE(tenant_id,scope_id,period_start,revision),
 FOREIGN KEY(tenant_id,scope_id) REFERENCES app.meter_lifecycle_scope(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK(source->>'version'='meter-lifecycle-source.v1' AND source->>'provenance'='actual_normal_company.v1'),
 CHECK(source->>'tenantId'=tenant_id::text AND source->>'scopeId'=scope_id::text AND source->>'startDate'=period_start::text)
);
CREATE TABLE app.meter_lifecycle_source_ref (
 tenant_id uuid NOT NULL, scope_id uuid NOT NULL, source_id uuid NOT NULL, job_id uuid NOT NULL,
 activation_id uuid NOT NULL, terms_id uuid NOT NULL, binding_id uuid NOT NULL,
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant_id,scope_id,source_id,job_id),
 FOREIGN KEY(tenant_id,scope_id,source_id) REFERENCES app.meter_lifecycle_source(tenant_id,scope_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,activation_id) REFERENCES app.job_activation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,terms_id) REFERENCES app.job_activation_terms(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job_activation_terms(tenant_id,job_id),
 FOREIGN KEY(tenant_id,job_id,binding_id) REFERENCES app.job_party_binding(tenant_id,job_id,id)
);
CREATE TABLE app.meter_lifecycle_computation (
 tenant_id uuid NOT NULL, scope_id uuid NOT NULL, id uuid NOT NULL, source_id uuid NOT NULL,
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 recipe_version text NOT NULL CHECK(recipe_version='specified-foundation.v1'),
 status text NOT NULL CHECK(status='held'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,scope_id,id), UNIQUE(tenant_id,scope_id,source_id),
 FOREIGN KEY(tenant_id,scope_id,source_id) REFERENCES app.meter_lifecycle_source(tenant_id,scope_id,id)
);
CREATE TABLE app.meter_lifecycle_day_ledger (
 tenant_id uuid NOT NULL, scope_id uuid NOT NULL, computation_id uuid NOT NULL, date date NOT NULL,
 source_hash text NOT NULL, status text NOT NULL CHECK(status='held'),
 PRIMARY KEY(tenant_id,scope_id,computation_id,date),
 FOREIGN KEY(tenant_id,scope_id,computation_id) REFERENCES app.meter_lifecycle_computation(tenant_id,scope_id,id)
);
-- Reserved immutable source/place bindings only. Held candidate groupings are
-- not closed chargeable places and are never inserted into this table.
CREATE TABLE app.meter_lifecycle_place_binding (
 tenant_id uuid NOT NULL, scope_id uuid NOT NULL, source_id uuid NOT NULL, date date NOT NULL,
 place_key text NOT NULL, representative_job_id uuid NOT NULL, rule_version text NOT NULL CHECK(rule_version='canonical-place-and-job.v1'),
 PRIMARY KEY(tenant_id,scope_id,source_id,date,place_key),
 FOREIGN KEY(tenant_id,scope_id,source_id,representative_job_id) REFERENCES app.meter_lifecycle_source_ref(tenant_id,scope_id,source_id,job_id)
);
-- No monetary correction can be written by this foundation. A later accepted
-- clock/price integration must supply exact positive/negative/closed-period rules.
CREATE TABLE app.meter_lifecycle_correction (
 tenant_id uuid NOT NULL, scope_id uuid NOT NULL, source_id uuid NOT NULL, baseline_source_id uuid NOT NULL,
 hold text NOT NULL CHECK(hold='H-METER-CLOCK'),
 PRIMARY KEY(tenant_id,scope_id,source_id),
 FOREIGN KEY(tenant_id,scope_id,source_id) REFERENCES app.meter_lifecycle_source(tenant_id,scope_id,id),
 FOREIGN KEY(tenant_id,scope_id,baseline_source_id) REFERENCES app.meter_lifecycle_source(tenant_id,scope_id,id),
 CHECK(source_id<>baseline_source_id)
);
CREATE TABLE app.meter_lifecycle_alert (
 tenant_id uuid NOT NULL, scope_id uuid NOT NULL, computation_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind='METER_CACHE_MISMATCH'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,scope_id,computation_id,kind),
 FOREIGN KEY(tenant_id,scope_id,computation_id) REFERENCES app.meter_lifecycle_computation(tenant_id,scope_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['meter_lifecycle_scope','meter_lifecycle_source','meter_lifecycle_source_ref','meter_lifecycle_computation','meter_lifecycle_day_ledger','meter_lifecycle_place_binding','meter_lifecycle_correction','meter_lifecycle_alert'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I TO jobguard_migration,jobguard_meter USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime',n);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;
GRANT SELECT,INSERT ON app.meter_lifecycle_scope,app.meter_lifecycle_source,app.meter_lifecycle_source_ref,app.meter_lifecycle_computation,app.meter_lifecycle_day_ledger,app.meter_lifecycle_alert TO jobguard_meter;
GRANT SELECT ON app.meter_lifecycle_place_binding,app.meter_lifecycle_correction TO jobguard_meter;

-- The sole migration-owned bridge returns only current identity. Existing
-- synthetic normal-company SSO checks are retained; no practice fallback.
CREATE FUNCTION app.mon1_lifecycle_actor(t uuid,digest text,mutation boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 actor:=app.mon1_company_actor(t,digest);
 IF mutation AND NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'METER_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 RETURN actor;
END $$;
ALTER FUNCTION app.mon1_lifecycle_actor(uuid,text,boolean) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon1_lifecycle_actor(uuid,text,boolean) FROM PUBLIC,jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.mon1_lifecycle_actor(uuid,text,boolean) TO jobguard_meter;

CREATE FUNCTION app.mon1_lifecycle_read(t uuid,digest text,computation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c app.meter_lifecycle_computation; s app.meter_lifecycle_source; bad boolean;
BEGIN
 PERFORM app.mon1_lifecycle_actor(t,digest,false);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 PERFORM app.mon1_lifecycle_actor(t,digest,false);
 SELECT * INTO c FROM app.meter_lifecycle_computation WHERE tenant_id=t AND id=computation;
 IF c.id IS NULL THEN RAISE EXCEPTION 'METER_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM app.meter_lifecycle_source WHERE (tenant_id,scope_id,id)=(t,c.scope_id,c.source_id);
 IF s.source_hash IS DISTINCT FROM encode(sha256(convert_to(s.source::text,'UTF8')),'hex') OR c.source_hash IS DISTINCT FROM s.source_hash THEN
  RAISE EXCEPTION 'METER_LIFECYCLE_SOURCE_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT count(*)<>((s.source->>'endDateExclusive')::date-(s.source->>'startDate')::date)
  OR coalesce(bool_or(d.source_hash<>s.source_hash OR d.status<>'held' OR d.date<(s.source->>'startDate')::date OR d.date>=(s.source->>'endDateExclusive')::date),false)
 INTO bad FROM app.meter_lifecycle_day_ledger d WHERE (d.tenant_id,d.scope_id,d.computation_id)=(t,c.scope_id,c.id);
 IF bad THEN INSERT INTO app.meter_lifecycle_alert(tenant_id,scope_id,computation_id,kind) VALUES(t,c.scope_id,c.id,'METER_CACHE_MISMATCH') ON CONFLICT DO NOTHING; END IF;
 RETURN jsonb_build_object('version','meter-lifecycle-stored.v1','sourceId',s.id,'computationId',c.id,'sourceHash',s.source_hash,'sourceRevision',s.revision,'source',s.source,
  'alerts',CASE WHEN EXISTS(SELECT 1 FROM app.meter_lifecycle_alert WHERE (tenant_id,scope_id,computation_id)=(t,c.scope_id,c.id)) THEN '["METER_CACHE_MISMATCH"]'::jsonb ELSE '[]'::jsonb END);
END $$;

CREATE FUNCTION app.mon1_lifecycle_rebuild(t uuid,digest text,p_source uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s app.meter_lifecycle_source; c uuid;
BEGIN
 PERFORM app.mon1_lifecycle_actor(t,digest,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 PERFORM app.mon1_lifecycle_actor(t,digest,true);
 SELECT * INTO s FROM app.meter_lifecycle_source WHERE tenant_id=t AND id=p_source;
 IF s.id IS NULL THEN RAISE EXCEPTION 'METER_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT id INTO c FROM app.meter_lifecycle_computation WHERE (tenant_id,scope_id,source_id)=(t,s.scope_id,s.id);
 IF c IS NULL THEN
  c:=gen_random_uuid();
  INSERT INTO app.meter_lifecycle_computation(tenant_id,scope_id,id,source_id,source_hash,recipe_version,status)
   VALUES(t,s.scope_id,c,s.id,s.source_hash,'specified-foundation.v1','held');
  INSERT INTO app.meter_lifecycle_day_ledger(tenant_id,scope_id,computation_id,date,source_hash,status)
   SELECT t,s.scope_id,c,(s.source->>'startDate')::date+n,s.source_hash,'held'
   FROM generate_series(0,(s.source->>'endDateExclusive')::date-(s.source->>'startDate')::date-1) n;
 END IF;
 RETURN app.mon1_lifecycle_read(t,digest,c);
END $$;

CREATE FUNCTION app.mon1_lifecycle_capture(t uuid,digest text,command uuid,start_day date,expected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; scope uuid; old app.meter_lifecycle_source; agreement app.subscription_agreement_revision;
 revision integer; finish date; cutoff timestamptz; src jsonb; jobs jsonb; source_uuid uuid; j jsonb;
BEGIN
 actor:=app.mon1_lifecycle_actor(t,digest,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 actor:=app.mon1_lifecycle_actor(t,digest,true);
 IF command IS NULL OR start_day IS NULL OR expected IS NULL OR expected<0 THEN RAISE EXCEPTION 'INVALID_METER_LIFECYCLE_INPUT' USING ERRCODE='22023'; END IF;
 SELECT id INTO scope FROM app.meter_lifecycle_scope WHERE tenant_id=t AND kind='normal_company';
 IF scope IS NULL THEN
  scope:=gen_random_uuid(); INSERT INTO app.meter_lifecycle_scope(tenant_id,id,kind) VALUES(t,scope,'normal_company');
 END IF;
 SELECT * INTO old FROM app.meter_lifecycle_source WHERE (tenant_id,scope_id,command_id)=(t,scope,command);
 IF old.id IS NOT NULL THEN
  IF old.period_start<>start_day OR old.expected_revision<>expected THEN RAISE EXCEPTION 'METER_LIFECYCLE_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN app.mon1_lifecycle_rebuild(t,digest,old.id);
 END IF;
 SELECT coalesce(max(s.revision),0) INTO revision FROM app.meter_lifecycle_source s WHERE (s.tenant_id,s.scope_id,s.period_start)=(t,scope,start_day);
 IF revision<>expected THEN RAISE EXCEPTION 'METER_LIFECYCLE_CONFLICT' USING ERRCODE='40001'; END IF;
 -- These existing-source SELECT privileges/policies are intentionally NOT
 -- installed here: coordinator owns the shared grants and source wiring.
 SELECT * INTO agreement FROM app.subscription_agreement_revision ar WHERE ar.tenant_id=t AND ar.effective_date<=start_day ORDER BY ar.effective_date DESC,ar.revision DESC LIMIT 1;
 IF agreement.id IS NULL OR agreement.cadence<>'monthly' THEN RAISE EXCEPTION 'METER_LIFECYCLE_TERMS_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 IF extract(day FROM start_day)::integer<>least(agreement.anchor_day,extract(day FROM date_trunc('month',start_day)+interval '1 month - 1 day')::integer) THEN RAISE EXCEPTION 'INVALID_METER_LIFECYCLE_INPUT' USING ERRCODE='22023'; END IF;
 finish:=(date_trunc('month',start_day)+interval '1 month')::date+least(agreement.anchor_day,extract(day FROM date_trunc('month',start_day)+interval '2 months - 1 day')::integer)-1;
 IF EXISTS(SELECT 1 FROM app.subscription_agreement_revision WHERE tenant_id=t AND effective_date>start_day AND effective_date<finish) THEN RAISE EXCEPTION 'METER_LIFECYCLE_PLAN_CHANGE_HELD' USING ERRCODE='22023'; END IF;
 -- Each source selection is statement-consistent. Coordinated upstream writers
 -- must join lock 184 to prevent cross-statement races before integration.
 -- No UPDATE grants are needed.
 actor:=app.mon1_lifecycle_actor(t,digest,true);
 cutoff:=clock_timestamp();
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'version','meter-lifecycle-input.v1','tenantId',t,'jobId',a.job_id,'sourceRevision',revision+1,
  'activation',jsonb_build_object('id',a.id,'at',to_char(a.activated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'termsId',terms.id,'termsRevision',1,'track','small_builder','partyBindingId',b.id,'customerId',b.customer_id,'siteId',b.site_id,'small',terms.small_job),
  'events',coalesce((SELECT jsonb_agg(jsonb_build_object('version',e.version,'id',e.id,'jobId',e.job_id,'sequence',e.sequence,'kind',e.kind,
   'factAt',to_char(e.fact_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'recordedAt',to_char(e.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'sourceReceiptId',e.source_receipt_id,'commandId',e.command_id,'predecessorId',e.predecessor_id,'closeReason',e.close_reason,'closeNote',e.close_note) ORDER BY e.sequence)
   FROM app.job_work_state_event e WHERE (e.tenant_id,e.job_id)=(t,a.job_id) AND e.recorded_at<=cutoff),'[]'::jsonb),
  'lock',(SELECT jsonb_build_object('id',l.id,'at',to_char(l.locked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) FROM app.final_account_lock l WHERE (l.tenant_id,l.job_id)=(t,a.job_id)),
  'trip',(SELECT jsonb_build_object('id',trip.id,'at',to_char(o.effective_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) FROM app.job_small_trip_event trip
    JOIN LATERAL(SELECT * FROM app.job_small_trip_observation x WHERE (x.tenant_id,x.job_id,x.trip_id)=(trip.tenant_id,trip.job_id,trip.id) AND x.recorded_at<=cutoff ORDER BY x.revision DESC LIMIT 1) o ON true WHERE (trip.tenant_id,trip.job_id)=(t,a.job_id)),
  'trial',jsonb_build_object('status','unavailable'),'policy',jsonb_build_object('version','meter-lifecycle-policy.v1','revision','specified-foundation.v1','clockStatus','held'),
  'asOf',to_char(cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'startDate',start_day::text,'endDateExclusive',finish::text) ORDER BY a.job_id),'[]'::jsonb)
 INTO jobs FROM app.job_activation a
 JOIN app.job_activation_terms terms ON(terms.tenant_id,terms.job_id,terms.activation_id)=(a.tenant_id,a.job_id,a.id)
 JOIN app.job job ON(job.tenant_id,job.id)=(a.tenant_id,a.job_id)
 JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(a.tenant_id,a.job_id,a.party_binding_id)
 WHERE a.tenant_id=t AND a.mode='synthetic_demo' AND a.activated_at<=cutoff AND terms.commercial_track='small_builder' AND job.practice_session_digest IS NULL;
 IF jsonb_array_length(jobs)=0 THEN RAISE EXCEPTION 'METER_LIFECYCLE_SOURCE_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 src:=jsonb_build_object('version','meter-lifecycle-source.v1','tenantId',t,'scopeId',scope,'provenance','actual_normal_company.v1','plan',agreement.plan,'agreementId',agreement.id,'agreementRevision',agreement.revision,
  'asOf',to_char(cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'startDate',start_day::text,'endDateExclusive',finish::text,'jobs',jobs,
  'links',coalesce((SELECT jsonb_agg(jsonb_build_object('id',link.id,'predecessorJobId',link.predecessor_job_id,'successorJobId',link.successor_job_id,
    'linkedAt',to_char(link.linked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sourceHash',link.request_hash) ORDER BY link.id)
    FROM app.job_link link WHERE link.tenant_id=t AND link.linked_at<=cutoff
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(jobs) x WHERE x->>'jobId'=link.predecessor_job_id::text)
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(jobs) x WHERE x->>'jobId'=link.successor_job_id::text)),'[]'::jsonb),
  'tripObservations',coalesce((SELECT jsonb_agg(jsonb_build_object('version','meter-small-trip.v1','tripId',e.id,'jobId',e.job_id,'observationId',o.id,
    'revision',o.revision,'previousObservationId',o.previous_observation_id,
    'effectiveAt',to_char(o.effective_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'recordedAt',to_char(o.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'netPence',o.net_pence::text,'sourceKind',o.source_kind,'sourceId',o.source_id,'sourceHash',o.source_hash,'policyVersion',o.policy_version) ORDER BY e.job_id)
   FROM app.job_small_trip_event e JOIN LATERAL(SELECT * FROM app.job_small_trip_observation x WHERE (x.tenant_id,x.job_id,x.trip_id)=(e.tenant_id,e.job_id,e.id) AND x.recorded_at<=cutoff ORDER BY x.revision DESC LIMIT 1) o ON true
   WHERE e.tenant_id=t AND EXISTS(SELECT 1 FROM jsonb_array_elements(jobs) AS element(value) WHERE element.value->>'jobId'=e.job_id::text)),'[]'::jsonb));
 source_uuid:=gen_random_uuid();
 INSERT INTO app.meter_lifecycle_source(tenant_id,scope_id,id,command_id,period_start,revision,expected_revision,source,source_hash,actor_membership_id)
 VALUES(t,scope,source_uuid,command,start_day,revision+1,expected,src,encode(sha256(convert_to(src::text,'UTF8')),'hex'),actor);
 FOR j IN SELECT value FROM jsonb_array_elements(jobs) LOOP
  INSERT INTO app.meter_lifecycle_source_ref(tenant_id,scope_id,source_id,job_id,activation_id,terms_id,binding_id,source_hash)
  VALUES(t,scope,source_uuid,(j->>'jobId')::uuid,(j#>>'{activation,id}')::uuid,(j#>>'{activation,termsId}')::uuid,(j#>>'{activation,partyBindingId}')::uuid,encode(sha256(convert_to(j::text,'UTF8')),'hex'));
 END LOOP;
 RETURN app.mon1_lifecycle_rebuild(t,digest,source_uuid);
END $$;
DO $$ DECLARE signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY['app.mon1_lifecycle_capture(uuid,text,uuid,date,integer)','app.mon1_lifecycle_rebuild(uuid,text,uuid)','app.mon1_lifecycle_read(uuid,text,uuid)'] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO jobguard_meter',signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,jobguard_runtime',signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO jobguard_runtime',signature);
 END LOOP;
END $$;
COMMIT;
