BEGIN;
-- MON1-T private foundation. No source trigger or runtime entrypoint is installed.
CREATE TABLE app.job_small_trip_event (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL,
 activation_id uuid NOT NULL, baseline_quote_version_id uuid NOT NULL,
 source_kind text NOT NULL CHECK(source_kind='variation_approval'), source_id uuid NOT NULL,
 effective_at timestamptz NOT NULL, net_pence bigint NOT NULL CHECK(net_pence BETWEEN 400001 AND 1000000000000),
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 policy_version text NOT NULL CHECK(policy_version='meter-small-trip.v1'), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id), UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,source_id) REFERENCES app.variation_approval(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,activation_id) REFERENCES app.job_activation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,baseline_quote_version_id) REFERENCES app.quote_version(tenant_id,job_id,id)
);
CREATE TABLE app.job_small_trip_observation (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, trip_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), previous_observation_id uuid,
 source_kind text NOT NULL CHECK(source_kind IN ('activation','variation_approval')), source_id uuid NOT NULL,
 approval_id uuid, revision_id uuid, activation_id uuid NOT NULL,
 effective_at timestamptz NOT NULL, net_pence bigint NOT NULL CHECK(net_pence BETWEEN 400001 AND 1000000000000),
 source_set jsonb NOT NULL CHECK(jsonb_typeof(source_set)='array'),
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 policy_version text NOT NULL CHECK(policy_version='meter-small-trip.v1'), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 audit_event_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,trip_id,revision), UNIQUE(tenant_id,trip_id,source_hash),
 FOREIGN KEY(tenant_id,job_id,trip_id) REFERENCES app.job_small_trip_event(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,previous_observation_id) REFERENCES app.job_small_trip_observation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,activation_id) REFERENCES app.job_activation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,approval_id) REFERENCES app.variation_approval(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,revision_id) REFERENCES app.variation_revision(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((revision=1)=(previous_observation_id IS NULL)),
 CHECK((source_kind='variation_approval' AND approval_id=source_id AND approval_id IS NOT NULL AND revision_id IS NOT NULL)
  OR (source_kind='activation' AND source_id=activation_id AND approval_id IS NULL AND revision_id IS NULL))
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['job_small_trip_event','job_small_trip_observation'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access',n);
  EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;

CREATE FUNCTION app.mon1_capture_small_trip(t uuid,j uuid,source_kind text,source_id uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE terms app.job_activation_terms; trip app.job_small_trip_event; previous app.job_small_trip_observation;
 fact record; latest jsonb:='{}'; selected_sources jsonb:='{}'; source_set jsonb; total numeric; cutoff timestamptz;
 crossing_at timestamptz; crossing_net numeric; crossing_source uuid; crossing_revision uuid; crossing_set jsonb;
 source_digest text; observation uuid; event_id uuid; observation_revision integer;
 seq bigint; prev text; ts timestamptz; payload jsonb; ph text; eh text;
BEGIN
 -- The caller is a checked source command, never a browser or runtime SQL call.
 -- It MUST already hold tenant lock 184 before any job/variation/source lock.
 -- Refuse a missing lock; never acquire a tenant lock here after business locks.
 IF current_user<>'jobguard_migration' OR t IS NULL OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'SMALL_TRIP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND mode='ExclusiveLock' AND granted AND objsubid=1
  AND classid::bigint=(hashtextextended(t::text,184)>>32)::bit(32)::bigint
  AND objid::bigint=hashtextextended(t::text,184)::bit(32)::bigint)
 THEN RAISE EXCEPTION 'SMALL_TRIP_LOCK_ORDER_REQUIRED' USING ERRCODE='55000'; END IF;
 IF source_kind IS NULL OR source_kind NOT IN('activation','variation_approval') OR source_id IS NULL
 THEN RAISE EXCEPTION 'INVALID_SMALL_TRIP_SOURCE' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM app.job job JOIN app.job_commercial_track track ON(track.tenant_id,track.job_id)=(job.tenant_id,job.id)
  WHERE job.tenant_id=t AND job.id=j AND track.job_track='small_builder' AND track.environment='synthetic_demo' FOR UPDATE OF job;
 IF NOT FOUND THEN RAISE EXCEPTION 'SMALL_TRIP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO terms FROM app.job_activation_terms WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'SMALL_TRIP_BASELINE_REQUIRED' USING ERRCODE='55000'; END IF;
 SELECT locked_at INTO cutoff FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF source_kind='activation' THEN
  IF source_id IS DISTINCT FROM terms.activation_id THEN RAISE EXCEPTION 'INVALID_SMALL_TRIP_SOURCE' USING ERRCODE='22023'; END IF;
 ELSE
  -- The immutable revision, not a mutable draft or a caller-supplied amount.
  IF NOT EXISTS(SELECT 1 FROM app.variation_approval a
   JOIN app.variation_revision r ON(r.tenant_id,r.job_id,r.variation_id,r.id)=(a.tenant_id,a.job_id,a.variation_id,a.revision_id)
   JOIN app.variation v ON(v.tenant_id,v.job_id,v.id)=(a.tenant_id,a.job_id,a.variation_id)
   WHERE a.tenant_id=t AND a.job_id=j AND a.id=source_id AND v.origin IN('builder_logged','final_review')
    AND a.revision=r.revision AND a.content_hash=r.content_hash AND a.signed_delta_pence=r.signed_delta_pence
    AND a.created_at>=terms.activated_at AND (cutoff IS NULL OR a.created_at<cutoff))
  THEN RAISE EXCEPTION 'INVALID_SMALL_TRIP_SOURCE' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT * INTO trip FROM app.job_small_trip_event WHERE tenant_id=t AND job_id=j;
 -- Only an originally small job can lose its allowance. Never regain it.
 IF NOT terms.small_job THEN RETURN trip.id; END IF;
 total:=terms.accepted_net_pence;
 FOR fact IN SELECT a.id,a.variation_id,a.revision_id,r.revision,r.signed_delta_pence,a.created_at
  FROM app.variation_approval a
  JOIN app.variation_revision r ON(r.tenant_id,r.job_id,r.variation_id,r.id)=(a.tenant_id,a.job_id,a.variation_id,a.revision_id)
  JOIN app.variation v ON(v.tenant_id,v.job_id,v.id)=(a.tenant_id,a.job_id,a.variation_id)
  WHERE a.tenant_id=t AND a.job_id=j AND v.origin IN('builder_logged','final_review')
   AND a.revision=r.revision AND a.content_hash=r.content_hash AND a.signed_delta_pence=r.signed_delta_pence
   AND a.created_at>=terms.activated_at AND (cutoff IS NULL OR a.created_at<cutoff)
  ORDER BY a.created_at,a.id
 LOOP
  IF coalesce((latest->fact.variation_id::text->>'revision')::integer,0)>=fact.revision THEN CONTINUE; END IF;
  total:=total-coalesce((latest->fact.variation_id::text->>'net')::numeric,0)+fact.signed_delta_pence;
  latest:=jsonb_set(latest,ARRAY[fact.variation_id::text],jsonb_build_object('revision',fact.revision,'net',fact.signed_delta_pence));
  selected_sources:=jsonb_set(selected_sources,ARRAY[fact.variation_id::text],to_jsonb(fact.id::text));
  IF abs(total)>1000000000000 THEN RAISE EXCEPTION 'SMALL_TRIP_TOTAL_OUT_OF_RANGE' USING ERRCODE='22003'; END IF;
  IF total>400000 THEN
   crossing_at:=fact.created_at; crossing_net:=total; crossing_source:=fact.id; crossing_revision:=fact.revision_id;
   SELECT coalesce(jsonb_agg(value ORDER BY key),'[]') INTO crossing_set FROM jsonb_each(selected_sources);
   EXIT;
  END IF;
 END LOOP;
 IF crossing_at IS NULL THEN
  IF trip.id IS NOT NULL THEN RAISE EXCEPTION 'SMALL_TRIP_RECONCILIATION_REQUIRED' USING ERRCODE='55000'; END IF;
  RETURN NULL;
 END IF;
 source_set:=crossing_set;
 -- Original source times use six digits; hashes never depend on connection timezone.
 source_digest:=app.final_lock_hash(jsonb_build_object('version','meter-small-trip.v1','tenant',t,'job',j,
  'activation',terms.activation_id,'baseline',terms.baseline_quote_version_id,'baselineHash',terms.baseline_document_hash,
  'baselineNet',terms.accepted_net_pence,'at',to_char(crossing_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'source',crossing_source,'revision',crossing_revision,'sources',source_set,'net',crossing_net));
 IF trip.id IS NULL THEN
  INSERT INTO app.job_small_trip_event(tenant_id,job_id,id,activation_id,baseline_quote_version_id,source_kind,source_id,effective_at,net_pence,source_hash,policy_version)
  VALUES(t,j,gen_random_uuid(),terms.activation_id,terms.baseline_quote_version_id,'variation_approval',crossing_source,crossing_at,crossing_net::bigint,source_digest,'meter-small-trip.v1') RETURNING * INTO trip;
 END IF;
 SELECT * INTO previous FROM app.job_small_trip_observation WHERE tenant_id=t AND trip_id=trip.id ORDER BY revision DESC LIMIT 1;
 IF previous.id IS NOT NULL THEN
  IF previous.source_hash=source_digest THEN RETURN trip.id; END IF;
  -- A late source must never retract or postpone an already latched crossing.
  IF crossing_at>previous.effective_at THEN RAISE EXCEPTION 'SMALL_TRIP_RECONCILIATION_REQUIRED' USING ERRCODE='55000'; END IF;
 END IF;
 observation:=gen_random_uuid(); event_id:=gen_random_uuid(); observation_revision:=coalesce(previous.revision,0)+1;
 INSERT INTO app.job_small_trip_observation(tenant_id,job_id,id,trip_id,revision,previous_observation_id,source_kind,source_id,approval_id,revision_id,activation_id,effective_at,net_pence,source_set,source_hash,policy_version,audit_event_id)
 VALUES(t,j,observation,trip.id,observation_revision,previous.id,'variation_approval',crossing_source,crossing_source,crossing_revision,terms.activation_id,crossing_at,crossing_net::bigint,source_set,source_digest,'meter-small-trip.v1',event_id);
 -- Audit is last. The source owner must finish all business mutations/locks before
 -- calling this seam, and append its own source audit afterwards in this transaction.
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp());
 payload:=jsonb_build_object('references',jsonb_build_object('jobId',j,'tripId',trip.id,'observationId',observation,'sourceId',crossing_source),'hashes',jsonb_build_object('source',source_digest));
 ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'system:meter-small-trip','meter.small_trip_observed','job',j::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(event_id,t,seq,'audit.v1','system:meter-small-trip','meter.small_trip_observed','job',j::text,ts,payload,ph,prev,eh);
 PERFORM app.advance_audit_head(seq,eh);
 RETURN trip.id;
END $$;
ALTER FUNCTION app.mon1_capture_small_trip(uuid,uuid,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon1_capture_small_trip(uuid,uuid,text,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
COMMIT;
