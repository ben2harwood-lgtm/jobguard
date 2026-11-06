BEGIN;
-- ENT-13a DARK: additive synthetic control plane, no login, endpoint or real key.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='jobguard_machine') THEN
  CREATE ROLE jobguard_machine NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
END $$;
GRANT USAGE ON SCHEMA connector TO jobguard_machine;
CREATE TABLE connector.machine_connection (
 tenant_id uuid NOT NULL, id uuid NOT NULL UNIQUE, machine_actor uuid NOT NULL UNIQUE,
 client_contract text NOT NULL CHECK(client_contract ~ '^fixture:[a-z0-9_-]{1,112}$'),
 sponsor uuid NOT NULL, revoked_at timestamptz, disconnected_at timestamptz,
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,id) REFERENCES connector.binding(tenant_id,id),
 FOREIGN KEY(tenant_id,sponsor) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE connector.machine_capability (
 tenant_id uuid NOT NULL, connection_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 capabilities text[] NOT NULL CHECK(cardinality(capabilities)>0 AND capabilities <@ ARRAY['work_order','billing_status','materials_issue']::text[]),
 PRIMARY KEY(tenant_id,connection_id,revision),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES connector.machine_connection(tenant_id,id)
);
CREATE TABLE connector.machine_key (
 tenant_id uuid NOT NULL, connection_id uuid NOT NULL, key_ref text NOT NULL CHECK(key_ref ~ '^fixture:[a-z0-9_-]{1,112}$'),
 valid_until timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,connection_id,key_ref),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES connector.machine_connection(tenant_id,id)
);
CREATE TABLE connector.machine_nonce (
 tenant_id uuid NOT NULL, connection_id uuid NOT NULL, nonce text NOT NULL CHECK(nonce ~ '^[a-zA-Z0-9_-]{16,120}$'),
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,connection_id,nonce),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES connector.machine_connection(tenant_id,id)
);
CREATE TABLE connector.machine_command (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, connection_id uuid NOT NULL,
 request_hash text NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(tenant_id,command_id),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES connector.machine_connection(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['machine_connection','machine_capability','machine_key','machine_nonce','machine_command'] LOOP
  EXECUTE format('ALTER TABLE connector.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE connector.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE connector.%I FORCE ROW LEVEL SECURITY',n);
  -- Private machine identity/control-plane exception: only the migration-owned routines.
  EXECUTE format('CREATE POLICY machine_control ON connector.%I TO jobguard_migration USING(true) WITH CHECK(true)',n);
  EXECUTE format('REVOKE ALL ON connector.%I FROM PUBLIC,jobguard_runtime,jobguard_connector,jobguard_machine,jobguard_infrastructure',n);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['machine_capability','machine_command'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON connector.%I FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation()',n);
 END LOOP;
END $$;

CREATE FUNCTION app.connector_machine_command(t uuid,digest text,command_id uuid,c uuid,op text,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; conn connector.machine_connection; b connector.binding; prior connector.machine_command;
 rev integer; caps text[]; old_caps text[]; h text; result jsonb; instant timestamptz:=clock_timestamp();
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
 actor:=app.mon1_company_actor(t,digest);
 -- One tenant command lock, then connection/binding, then audit head last.
 PERFORM pg_advisory_xact_lock(hashtextextended('machine-command:'||t::text,0));
 actor:=app.mon1_company_actor(t,digest);
 IF NOT EXISTS(SELECT FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner' AND revoked_at IS NULL
  AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE)
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
 IF command_id IS NULL OR c IS NULL OR op IS NULL OR op NOT IN('provision','widen','rotate','revoke','disconnect')
  OR v IS NULL OR jsonb_typeof(v)<>'object' OR v->>'version' IS DISTINCT FROM 'connector-machine-command.v1'
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='22023'; END IF;
 h:=app.final_lock_hash(jsonb_build_object('connection',c,'operation',op,'input',v));
 SELECT * INTO prior FROM connector.machine_command m WHERE m.tenant_id=t AND m.command_id=connector_machine_command.command_id;
 IF FOUND THEN
  IF prior.request_hash<>h THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='23505'; END IF;
  RETURN prior.result;
 END IF;
 SELECT * INTO conn FROM connector.machine_connection WHERE tenant_id=t AND id=c FOR UPDATE;
 IF op='provision' THEN
  IF FOUND OR v-ARRAY['version','clientContract','namespace','tokenHash','keyRef','expiresAt','capabilities']<>'{}'::jsonb
   OR NOT v ?& ARRAY['clientContract','namespace','tokenHash','keyRef','expiresAt','capabilities']
   OR v->>'clientContract' !~ '^fixture:[a-z0-9_-]{1,112}$'
   OR v->>'keyRef' !~ '^fixture:[a-z0-9_-]{1,112}$'
   OR v->>'tokenHash' !~ '^[a-f0-9]{64}$'
   OR (v->>'expiresAt')::timestamptz<=instant
  THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='22023'; END IF;
  INSERT INTO connector.binding(tenant_id,id,namespace,environment,endpoint_kind,token_sha256,expires_at)
   VALUES(t,c,v->>'namespace','synthetic_demo','fake',v->>'tokenHash',(v->>'expiresAt')::timestamptz);
  INSERT INTO connector.machine_connection(tenant_id,id,machine_actor,client_contract,sponsor)
   VALUES(t,c,gen_random_uuid(),v->>'clientContract',actor) RETURNING * INTO conn;
  INSERT INTO connector.machine_key VALUES(t,c,v->>'keyRef',(v->>'expiresAt')::timestamptz,instant);
  rev:=1;
 ELSE
  IF conn.id IS NULL OR conn.revoked_at IS NOT NULL OR conn.disconnected_at IS NOT NULL
  THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
  SELECT * INTO b FROM connector.binding WHERE tenant_id=t AND id=c FOR UPDATE;
  IF b.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
  SELECT revision,capabilities INTO rev,old_caps FROM connector.machine_capability WHERE tenant_id=t AND connection_id=c ORDER BY revision DESC LIMIT 1;
 END IF;
 IF op IN('provision','widen') THEN
  IF op='widen' AND (v-ARRAY['version','capabilities']<>'{}'::jsonb OR NOT v ? 'capabilities')
   OR jsonb_typeof(v->'capabilities') IS DISTINCT FROM 'array'
   OR EXISTS(SELECT FROM jsonb_array_elements(v->'capabilities') x WHERE jsonb_typeof(x)<>'string')
  THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='22023'; END IF;
  SELECT array_agg(x ORDER BY x) INTO caps FROM jsonb_array_elements_text(v->'capabilities') x;
  IF caps IS NULL OR NOT caps <@ ARRAY['work_order','billing_status','materials_issue']::text[]
   OR cardinality(caps)<>(SELECT count(DISTINCT x) FROM unnest(caps) x)
   OR (op='widen' AND (NOT old_caps <@ caps OR old_caps @> caps))
  THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='22023'; END IF;
  IF op='widen' THEN rev:=rev+1; END IF;
  INSERT INTO connector.machine_capability VALUES(t,c,rev,caps);
 ELSIF op='rotate' THEN
  IF v-ARRAY['version','keyRef']<>'{}'::jsonb OR NOT v ? 'keyRef' THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='22023'; END IF;
  UPDATE connector.machine_key SET valid_until=least(valid_until,instant+interval '24 hours') WHERE tenant_id=t AND connection_id=c;
  INSERT INTO connector.machine_key VALUES(t,c,v->>'keyRef',b.expires_at,instant);
 ELSE
  IF v<>'{"version":"connector-machine-command.v1"}'::jsonb THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='22023'; END IF;
  UPDATE connector.machine_connection SET revoked_at=instant,disconnected_at=CASE WHEN op='disconnect' THEN instant END WHERE tenant_id=t AND id=c;
  UPDATE connector.binding SET revoked_at=instant WHERE tenant_id=t AND id=c;
 END IF;
 result:=jsonb_build_object('version','connector-machine-result.v1','connectionId',c,'machineActor',conn.machine_actor,'capabilityVersion',rev,'operation',op);
 INSERT INTO connector.machine_command VALUES(t,command_id,c,h,result);
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
  'actorRef',actor::text,'eventType','connector.machine_'||op,'subjectType','connector','subjectRef',c::text,
  'payload',jsonb_build_object('references',jsonb_build_object('commandId',command_id),'hashes',jsonb_build_object('input',h)))),'checked_operation');
 RETURN result;
END $$;
ALTER FUNCTION app.connector_machine_command(uuid,text,uuid,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.connector_machine_command(uuid,text,uuid,uuid,text,jsonb) FROM PUBLIC,jobguard_machine,jobguard_connector,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.connector_machine_command(uuid,text,uuid,uuid,text,jsonb) TO jobguard_runtime;

-- The machine SQL credential is a separate trusted transport identity. It cannot invoke
-- the old unrestricted staging entrypoint or a member routine. No membership is minted.
CREATE FUNCTION connector.machine_authority(c uuid,token text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b connector.binding; conn connector.machine_connection; result jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO conn FROM connector.machine_connection WHERE id=c FOR SHARE;
 SELECT * INTO b FROM connector.binding WHERE id=c FOR SHARE;
 IF conn.id IS NULL OR conn.revoked_at IS NOT NULL OR conn.disconnected_at IS NOT NULL
  OR b.id IS NULL OR b.revoked_at IS NOT NULL OR b.expires_at<=clock_timestamp()
  OR b.environment<>'synthetic_demo' OR b.endpoint_kind<>'fake' OR token IS NULL OR octet_length(token) NOT BETWEEN 32 AND 256
  OR b.token_sha256 IS DISTINCT FROM encode(sha256(convert_to(token,'UTF8')),'hex')
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('tenantId',b.tenant_id,'environment',b.environment,'clientContract',conn.client_contract,
  'machineActor',conn.machine_actor,'capabilityVersion',revision,'capabilities',capabilities,
  'keyRefs',(SELECT coalesce(jsonb_agg(key_ref ORDER BY key_ref),'[]'::jsonb) FROM connector.machine_key WHERE connection_id=c AND valid_until>clock_timestamp()))
 INTO result FROM connector.machine_capability WHERE connection_id=c ORDER BY revision DESC LIMIT 1;
 RETURN result;
END $$;
ALTER FUNCTION connector.machine_authority(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION connector.machine_authority(uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_connector,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION connector.machine_authority(uuid,text) TO jobguard_machine;
CREATE FUNCTION connector.machine_stage(c uuid,token text,expected jsonb,key_ref text,nonce text,stamp bigint,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE authority jsonb; result jsonb;
BEGIN
 authority:=connector.machine_authority(c,token);
 IF expected IS DISTINCT FROM authority OR NOT(authority->'keyRefs' ? key_ref)
  OR NOT(authority->'capabilities' ? (input->>'kind'))
  OR nonce IS NULL OR nonce !~ '^[a-zA-Z0-9_-]{16,120}$' OR stamp IS NULL
  OR abs(floor(extract(epoch FROM clock_timestamp()))-stamp)>300
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
 -- Serialize all accepted nonces on this connection. Recheck expiry after any wait.
 PERFORM pg_advisory_xact_lock(hashtextextended('machine-nonce:'||c::text,0));
 IF authority IS DISTINCT FROM connector.machine_authority(c,token)
  OR abs(floor(extract(epoch FROM clock_timestamp()))-stamp)>300
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM connector.machine_nonce n WHERE n.connection_id=c AND n.nonce=machine_stage.nonce AND expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='23505'; END IF;
 INSERT INTO connector.machine_nonce VALUES((authority->>'tenantId')::uuid,c,nonce,clock_timestamp()+interval '10 minutes')
 ON CONFLICT ON CONSTRAINT machine_nonce_pkey DO UPDATE SET expires_at=excluded.expires_at;
 result:=connector.intake(c,token,input);
 RETURN result;
END $$;
ALTER FUNCTION connector.machine_stage(uuid,text,jsonb,text,text,bigint,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION connector.machine_stage(uuid,text,jsonb,text,text,bigint,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_connector,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION connector.machine_stage(uuid,text,jsonb,text,text,bigint,jsonb) TO jobguard_machine;
COMMIT;
