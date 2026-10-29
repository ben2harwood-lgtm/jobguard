-- M4-7 DARK: synthetic AIS only. Expand-only; forward fix or stop calling the seam.
-- No token columns, cash allocations, bill references, fee writes or live endpoints.
BEGIN;
CREATE TABLE app.ais_connection (
 tenant_id uuid NOT NULL, id uuid NOT NULL, owner_membership_id uuid NOT NULL,
 state_hash text NOT NULL CHECK(state_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,state_hash),
 FOREIGN KEY(tenant_id,owner_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '90 days')
);
CREATE TABLE app.ais_lifecycle (
 tenant_id uuid NOT NULL, connection_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 kind text NOT NULL CHECK(kind IN('linked','revoked','unlinked','token_revoked')),
 account_ref text CHECK(account_ref ~ '^fake_[a-zA-Z0-9_-]{1,100}$'),
 PRIMARY KEY(tenant_id,connection_id,revision),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES app.ais_connection(tenant_id,id),
 CHECK((kind='linked')=(account_ref IS NOT NULL))
);
CREATE UNIQUE INDEX ais_link_once ON app.ais_lifecycle(tenant_id,connection_id) WHERE kind='linked';
CREATE TABLE app.ais_observation (
 tenant_id uuid NOT NULL, connection_id uuid NOT NULL, account_ref text NOT NULL CHECK(account_ref ~ '^fake_[a-zA-Z0-9_-]{1,100}$'),
 movement_ref text NOT NULL CHECK(movement_ref ~ '^fake_[a-zA-Z0-9_-]{1,100}$'),
 provider_ref text NOT NULL CHECK(provider_ref ~ '^fake_[a-zA-Z0-9_-]{1,100}$'),
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 1000000),
 status text NOT NULL CHECK(status IN('pending','settled','reversed')),
 pence bigint NOT NULL CHECK(pence BETWEEN -1000000000000 AND 1000000000000),
 currency text NOT NULL CHECK(currency='GBP'), booked_on date NOT NULL,
 PRIMARY KEY(tenant_id,account_ref,movement_ref,revision),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES app.ais_connection(tenant_id,id)
);
CREATE TABLE app.ais_page (
 tenant_id uuid NOT NULL, connection_id uuid NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 from_date date NOT NULL, to_date date NOT NULL, cursor text NOT NULL, next_cursor text,
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant_id,connection_id,request_hash),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES app.ais_connection(tenant_id,id),
 CHECK(from_date<=to_date AND to_date-from_date<=366),
 CHECK(cursor='first' OR cursor ~ '^fake_[a-zA-Z0-9_-]{1,100}$'),
 CHECK(next_cursor IS NULL OR next_cursor ~ '^fake_[a-zA-Z0-9_-]{1,100}$')
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['ais_connection','ais_lifecycle','ais_observation','ais_page'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
  EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);
 END LOOP;
END $$;
CREATE FUNCTION app.ais_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'AIS_IMMUTABLE' USING ERRCODE='23514'; END $$;
ALTER FUNCTION app.ais_immutable() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ais_immutable() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['ais_connection','ais_lifecycle','ais_observation','ais_page'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.ais_immutable()',n);
  EXECUTE format('CREATE TRIGGER immutable_table BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.ais_immutable()',n);
 END LOOP;
END $$;

-- Closed command boundary. No arbitrary table name, authority, token or financial side effect.
CREATE FUNCTION app.dark_ais(t uuid,digest text,c uuid,op text,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; conn app.ais_connection; last app.ais_lifecycle; prior app.ais_page;
 o jsonb; old app.ais_observation; current_obs app.ais_observation; linked_account text; req text; ph text; changed boolean:=false;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'AIS_DARK_ONLY' USING ERRCODE='42501'; END IF;
 actor:=app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,427));
 actor:=app.mon1_company_actor(t,digest);
 IF c IS NULL OR op IS NULL OR op NOT IN('start','inspect','link','revoked','unlinked','token_revoked','page')
  OR v IS NULL OR jsonb_typeof(v)<>'object' THEN RAISE EXCEPTION 'AIS_INVALID' USING ERRCODE='23514'; END IF;
 SELECT * INTO conn FROM app.ais_connection WHERE tenant_id=t AND id=c AND owner_membership_id=actor;
 IF op='start' THEN
  IF v-ARRAY['stateHash','expiresAt']<>'{}'::jsonb OR NOT v ?& ARRAY['stateHash','expiresAt'] THEN RAISE EXCEPTION 'AIS_INVALID' USING ERRCODE='23514'; END IF;
  IF conn.id IS NOT NULL THEN RAISE EXCEPTION 'AIS_CONFLICT' USING ERRCODE='23514'; END IF;
  INSERT INTO app.ais_connection(tenant_id,id,owner_membership_id,state_hash,expires_at)
   VALUES(t,c,actor,v->>'stateHash',(v->>'expiresAt')::timestamptz) RETURNING * INTO conn;
  changed:=true;
 ELSE
  IF conn.id IS NULL THEN RAISE EXCEPTION 'AIS_NOT_FOUND' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT * INTO last FROM app.ais_lifecycle WHERE tenant_id=t AND connection_id=c ORDER BY revision DESC LIMIT 1;
 SELECT account_ref INTO linked_account FROM app.ais_lifecycle WHERE tenant_id=t AND connection_id=c AND kind='linked';
 IF op IN('inspect','revoked','unlinked','token_revoked') AND v<>'{}'::jsonb THEN RAISE EXCEPTION 'AIS_INVALID' USING ERRCODE='23514'; END IF;
 IF op='link' THEN
  IF v-ARRAY['stateHash','accountRef']<>'{}'::jsonb OR NOT v ?& ARRAY['stateHash','accountRef']
   OR v->>'stateHash' IS DISTINCT FROM conn.state_hash OR conn.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'AIS_CALLBACK_INVALID' USING ERRCODE='23514'; END IF;
  IF last.kind IS NOT NULL THEN RAISE EXCEPTION 'AIS_CALLBACK_USED' USING ERRCODE='23514'; END IF;
  INSERT INTO app.ais_lifecycle VALUES(t,c,1,'linked',v->>'accountRef');
  changed:=true; linked_account:=v->>'accountRef';
 ELSIF op IN('revoked','unlinked','token_revoked') THEN
  IF last.kind IS DISTINCT FROM op THEN
   INSERT INTO app.ais_lifecycle VALUES(t,c,coalesce(last.revision,0)+1,op,NULL);
   changed:=true;
  END IF;
 ELSIF op='page' THEN
  IF conn.expires_at<=clock_timestamp() OR last.kind IS DISTINCT FROM 'linked' THEN RAISE EXCEPTION 'AIS_INACTIVE' USING ERRCODE='23514'; END IF;
  IF v-ARRAY['window','page']<>'{}'::jsonb OR NOT v ?& ARRAY['window','page']
   OR v->'window'->>'version' IS DISTINCT FROM 'ais-window.v1' OR v->'page'->>'version' IS DISTINCT FROM 'ais-page.v1'
   OR v->'window'-ARRAY['version','from','to','cursor']<>'{}'::jsonb
   OR v->'page'-ARRAY['version','observations','nextCursor']<>'{}'::jsonb
   OR NOT (v->'window') ?& ARRAY['version','from','to','cursor']
   OR NOT (v->'page') ?& ARRAY['version','observations','nextCursor']
   OR jsonb_typeof(v->'page'->'observations') IS DISTINCT FROM 'array'
   OR jsonb_array_length(v->'page'->'observations')>100 THEN RAISE EXCEPTION 'AIS_INVALID' USING ERRCODE='23514'; END IF;
  ph:=app.final_lock_hash(v->'page');
  -- Re-pulling a window may legitimately return newer observations; page journal binds each payload.
  req:=app.final_lock_hash(v);
  SELECT * INTO prior FROM app.ais_page WHERE tenant_id=t AND connection_id=c AND request_hash=req;
  IF prior.request_hash IS NULL THEN
   IF v->'window'->>'cursor' IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM app.ais_page WHERE tenant_id=t AND connection_id=c AND next_cursor=v->'window'->>'cursor'
     AND from_date=(v->'window'->>'from')::date AND to_date=(v->'window'->>'to')::date)
    THEN RAISE EXCEPTION 'AIS_CURSOR_INVALID' USING ERRCODE='23514'; END IF;
   IF v->'page'->>'nextCursor' IS NOT NULL AND v->'window'->>'cursor' IS NOT NULL AND EXISTS(
    WITH RECURSIVE path(cursor) AS (
     SELECT v->'page'->>'nextCursor'
     UNION
     SELECT p.next_cursor FROM app.ais_page p JOIN path r ON p.cursor=r.cursor
      WHERE p.tenant_id=t AND p.connection_id=c AND p.next_cursor IS NOT NULL
       AND p.from_date=(v->'window'->>'from')::date AND p.to_date=(v->'window'->>'to')::date
    ) SELECT 1 FROM path WHERE cursor=v->'window'->>'cursor')
    THEN RAISE EXCEPTION 'AIS_CURSOR_INVALID' USING ERRCODE='23514'; END IF;
   FOR o IN SELECT value FROM jsonb_array_elements(v->'page'->'observations') LOOP
    IF o-ARRAY['version','accountRef','movementRef','providerRef','revision','status','amount','bookedOn']<>'{}'::jsonb
     OR NOT o ?& ARRAY['version','accountRef','movementRef','providerRef','revision','status','amount','bookedOn']
     OR o->>'version' IS DISTINCT FROM 'ais-observation.v1' OR o->>'accountRef' IS DISTINCT FROM linked_account
     OR o->'amount'-ARRAY['pence','currency']<>'{}'::jsonb OR NOT (o->'amount') ?& ARRAY['pence','currency']
     OR jsonb_typeof(o->'revision') IS DISTINCT FROM 'number' OR o->>'revision' !~ '^[1-9][0-9]*$'
     OR jsonb_typeof(o->'amount'->'pence') IS DISTINCT FROM 'number' OR o->'amount'->>'pence' !~ '^-?(0|[1-9][0-9]*)$'
     OR (o->>'bookedOn')::date NOT BETWEEN (v->'window'->>'from')::date AND (v->'window'->>'to')::date
     THEN RAISE EXCEPTION 'AIS_INVALID' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM app.ais_observation WHERE tenant_id=t AND account_ref=linked_account AND provider_ref=o->>'providerRef' AND movement_ref<>o->>'movementRef')
     THEN RAISE EXCEPTION 'AIS_IDENTITY_AMBIGUOUS' USING ERRCODE='23514'; END IF;
    SELECT * INTO old FROM app.ais_observation WHERE tenant_id=t AND account_ref=linked_account AND movement_ref=o->>'movementRef' AND revision=(o->>'revision')::integer;
    IF old.revision IS NOT NULL THEN
     IF old.provider_ref IS DISTINCT FROM o->>'providerRef' OR old.status IS DISTINCT FROM o->>'status'
      OR old.pence IS DISTINCT FROM (o->'amount'->>'pence')::bigint OR old.currency IS DISTINCT FROM o->'amount'->>'currency'
      OR old.booked_on IS DISTINCT FROM (o->>'bookedOn')::date THEN RAISE EXCEPTION 'AIS_CONFLICT' USING ERRCODE='23514'; END IF;
    ELSE
     -- Same lineage, newer provider ID: one cash identity. Stale facts may append but never replace newer state.
     -- Settlement regression or re-credit after reversal needs M4-8 reconciliation, never silent reopening.
     SELECT * INTO current_obs FROM app.ais_observation WHERE tenant_id=t AND account_ref=linked_account AND movement_ref=o->>'movementRef'
      AND revision<(o->>'revision')::integer ORDER BY revision DESC LIMIT 1;
     IF (current_obs.status='settled' AND o->>'status'='pending') OR (current_obs.status='reversed' AND o->>'status'<>'reversed')
      OR EXISTS(SELECT 1 FROM app.ais_observation WHERE tenant_id=t AND account_ref=linked_account AND movement_ref=o->>'movementRef'
        AND revision>(o->>'revision')::integer AND ((o->>'status'='reversed' AND status<>'reversed') OR (o->>'status'='settled' AND status='pending')))
      THEN RAISE EXCEPTION 'AIS_RECONCILIATION_REQUIRED' USING ERRCODE='23514'; END IF;
     INSERT INTO app.ais_observation VALUES(t,c,linked_account,o->>'movementRef',o->>'providerRef',(o->>'revision')::integer,o->>'status',(o->'amount'->>'pence')::bigint,o->'amount'->>'currency',(o->>'bookedOn')::date);
    END IF;
   END LOOP;
   INSERT INTO app.ais_page VALUES(t,c,req,(v->'window'->>'from')::date,(v->'window'->>'to')::date,coalesce(v->'window'->>'cursor','first'),v->'page'->>'nextCursor',ph);
   changed:=true;
  END IF;
 END IF;
 SELECT * INTO last FROM app.ais_lifecycle WHERE tenant_id=t AND connection_id=c ORDER BY revision DESC LIMIT 1;
 -- Reuse the existing generic chain writer; final contending lock after all domain writes.
 IF changed THEN
  PERFORM app.ef_audit(actor,'ais.'||op,'ais_connection',c,
   jsonb_build_object('references',jsonb_build_object('connectionId',c::text),
    'hashes',jsonb_build_object('request',app.final_lock_hash(v)),
    'classifications',jsonb_build_object('data','security')));
 END IF;
 RETURN jsonb_build_object('connectionId',c,'stateHash',conn.state_hash,'accountRef',linked_account,
  'status',CASE WHEN conn.expires_at<=clock_timestamp() THEN 'expired' ELSE coalesce(last.kind,'awaiting_consent') END,
  'changed',changed,'actor',actor);
END $$;
ALTER FUNCTION app.dark_ais(uuid,text,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.dark_ais(uuid,text,uuid,text,jsonb) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.dark_ais(uuid,text,uuid,text,jsonb) TO jobguard_runtime;
COMMIT;
