BEGIN;
-- Historical snapshots only. No live-job or settlement applicability and no production activation.
CREATE TABLE app.enterprise_baseline_batch (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), id uuid NOT NULL,
 source_namespace text NOT NULL, source_batch_id text NOT NULL,
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 history jsonb NOT NULL, canonical_history text NOT NULL,
 actor_membership_id uuid NOT NULL, server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,source_namespace,source_batch_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK(history=canonical_history::jsonb),
 CHECK(source_hash=encode(sha256(convert_to(canonical_history,'UTF8')),'hex')),
 CHECK(history->>'version'='baseline-history.v1' AND history->>'environment'='synthetic_demo'),
 CHECK(history->>'sourceNamespace'=source_namespace AND history->>'sourceBatchId'=source_batch_id)
);
CREATE TABLE app.enterprise_baseline_team (
 tenant_id uuid NOT NULL, batch_id uuid NOT NULL, source_team_id text NOT NULL, team_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,batch_id,source_team_id), UNIQUE(tenant_id,batch_id,team_id),
 FOREIGN KEY(tenant_id,batch_id) REFERENCES app.enterprise_baseline_batch(tenant_id,id),
 FOREIGN KEY(tenant_id,team_id) REFERENCES app.team(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['enterprise_baseline_batch','enterprise_baseline_team'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  -- Runtime has no raw table access: scoped read and checked import functions only.
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;

CREATE FUNCTION app.enterprise_baseline_actor(p_session uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 SELECT s.membership_id INTO a FROM app.contractor_session(p_session) s
 WHERE s.tenant_id=t AND app.contractor_member_active(s.membership_id);
 IF a IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN a;
END $$;

CREATE FUNCTION app.enterprise_baseline_import(p_session uuid,p_history text,p_hash text,p_bindings jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; h jsonb:=p_history::jsonb;
 b app.enterprise_baseline_batch; item jsonb; batch uuid:=gen_random_uuid();
 seq bigint; prev text; ts timestamptz; ph text; eh text; payload jsonb;
BEGIN
 a:=app.enterprise_baseline_actor(p_session);
 -- Reuse the existing tenant data.import permission (finance); importing history grants no read scope.
 IF NOT coalesce(app.contractor_allowed(a,'data.import',t),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF h->>'version' IS DISTINCT FROM 'baseline-history.v1' OR h->>'environment' IS DISTINCT FROM 'synthetic_demo'
  OR p_hash IS DISTINCT FROM encode(sha256(convert_to(p_history,'UTF8')),'hex')
  OR jsonb_typeof(h->'teamIds') IS DISTINCT FROM 'array' OR jsonb_typeof(h->'jobs') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_bindings) IS DISTINCT FROM 'array' OR jsonb_array_length(p_bindings) NOT BETWEEN 1 AND 1000
  OR jsonb_array_length(p_bindings)<>jsonb_array_length(h->'teamIds')
  OR jsonb_array_length(h->'jobs')>10000
  OR (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(h->'teamIds') x)<>jsonb_array_length(h->'teamIds')
  OR (SELECT count(DISTINCT x->>'sourceTeamId') FROM jsonb_array_elements(p_bindings) x)<>jsonb_array_length(p_bindings)
  OR (SELECT count(DISTINCT x->>'teamId') FROM jsonb_array_elements(p_bindings) x)<>jsonb_array_length(p_bindings)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_bindings) x WHERE NOT(h->'teamIds' ? (x->>'sourceTeamId'))
    OR NOT EXISTS(SELECT 1 FROM app.team z WHERE z.tenant_id=t AND z.id=(x->>'teamId')::uuid))
 THEN RAISE EXCEPTION 'BASELINE_INVALID' USING ERRCODE='23514'; END IF;
 -- Defense in depth for the stored observation window; the server's versioned parser validates all job/extra fields.
 IF coalesce(h->>'startMonth','') !~ '^(20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])$'
  OR coalesce(h->>'endMonthExclusive','') !~ '^(20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])$'
 THEN RAISE EXCEPTION 'BASELINE_INVALID' USING ERRCODE='23514'; END IF;
 IF ((left(h->>'endMonthExclusive',4)::int-left(h->>'startMonth',4)::int)*12
  +right(h->>'endMonthExclusive',2)::int-right(h->>'startMonth',2)::int) NOT BETWEEN 6 AND 12
 THEN RAISE EXCEPTION 'BASELINE_INVALID' USING ERRCODE='23514'; END IF;
 -- Serialize source identity before uniqueness/replay inspection; organization fence precedes source, audit last.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||(h->>'sourceNamespace')||':'||(h->>'sourceBatchId'),9275));
 SELECT * INTO b FROM app.enterprise_baseline_batch WHERE tenant_id=t AND source_namespace=h->>'sourceNamespace' AND source_batch_id=h->>'sourceBatchId';
 IF FOUND THEN
  IF b.source_hash<>p_hash OR b.history<>h OR
   (SELECT jsonb_agg(jsonb_build_object('sourceTeamId',source_team_id,'teamId',team_id) ORDER BY source_team_id COLLATE "C") FROM app.enterprise_baseline_team WHERE tenant_id=t AND batch_id=b.id) IS DISTINCT FROM p_bindings
  THEN RAISE EXCEPTION 'BASELINE_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('batchId',b.id,'sourceHash',b.source_hash,'replayed',true);
 END IF;
 INSERT INTO app.enterprise_baseline_batch(tenant_id,id,source_namespace,source_batch_id,source_hash,history,canonical_history,actor_membership_id)
 VALUES(t,batch,h->>'sourceNamespace',h->>'sourceBatchId',p_hash,h,p_history,a);
 FOR item IN SELECT value FROM jsonb_array_elements(p_bindings) LOOP
  INSERT INTO app.enterprise_baseline_team VALUES(t,batch,item->>'sourceTeamId',(item->>'teamId')::uuid);
 END LOOP;
 payload:=jsonb_build_object('references',jsonb_build_object('batch',batch::text,'environment','synthetic_demo'),'hashes',jsonb_build_object('source',p_hash));
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp()); ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'membership:'||a::text,'enterprise.baseline.imported','baseline',batch::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(gen_random_uuid(),t,seq,'audit.v1','membership:'||a::text,'enterprise.baseline.imported','baseline',batch::text,ts,payload,ph,prev,eh);
 PERFORM app.advance_audit_head(seq,eh);
 RETURN jsonb_build_object('batchId',batch,'sourceHash',p_hash,'replayed',false);
END $$;

CREATE FUNCTION app.enterprise_baseline_read(p_session uuid,p_batch uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; h jsonb;
BEGIN
 a:=app.enterprise_baseline_actor(p_session);
 SELECT b.history INTO h FROM app.enterprise_baseline_batch b WHERE b.tenant_id=t AND b.id=p_batch
  AND EXISTS(SELECT 1 FROM app.enterprise_baseline_team m WHERE(m.tenant_id,m.batch_id)=(t,b.id))
  AND NOT EXISTS(SELECT 1 FROM app.enterprise_baseline_team m WHERE(m.tenant_id,m.batch_id)=(t,b.id)
    AND NOT coalesce(app.contractor_allowed(a,'dashboard.read',m.team_id),false));
 IF h IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN h;
END $$;
DO $$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY['app.enterprise_baseline_actor(uuid)','app.enterprise_baseline_import(uuid,text,text,jsonb)','app.enterprise_baseline_read(uuid,uuid)'] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO jobguard_migration',f);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',f);
  IF f<>'app.enterprise_baseline_actor(uuid)' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO jobguard_runtime',f); END IF;
 END LOOP;
END $$;
COMMIT;
