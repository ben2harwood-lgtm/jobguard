BEGIN;
-- ENT-13a slice 1, RED, DARK. Stages fictional source facts only, never domain commands.
-- No LOGIN, role membership, binding, credential or endpoint is provisioned by migration.
CREATE ROLE jobguard_connector NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE SCHEMA connector AUTHORIZATION jobguard_migration;
REVOKE ALL ON SCHEMA connector FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT USAGE ON SCHEMA connector TO jobguard_connector;

CREATE TABLE connector.binding (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
 id uuid NOT NULL UNIQUE,
 namespace text NOT NULL CHECK(namespace ~ '^fixture:[a-z0-9_-]{1,112}$'),
 environment text NOT NULL CHECK(environment='synthetic_demo'),
 endpoint_kind text NOT NULL CHECK(endpoint_kind='fake'),
 token_sha256 text NOT NULL CHECK(token_sha256 ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,id,namespace)
);
CREATE TABLE connector.input_event (
 tenant_id uuid NOT NULL,
 binding_id uuid NOT NULL,
 namespace text NOT NULL,
 event_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN('work_order','billing_status')),
 subject text NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 payload jsonb NOT NULL,
 semantic_hash text NOT NULL CHECK(semantic_hash ~ '^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,namespace,event_id),
 UNIQUE(tenant_id,namespace,kind,subject,revision),
 FOREIGN KEY(tenant_id,binding_id,namespace) REFERENCES connector.binding(tenant_id,id,namespace)
);
ALTER TABLE connector.binding OWNER TO jobguard_migration;
ALTER TABLE connector.input_event OWNER TO jobguard_migration;
ALTER TABLE connector.binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector.binding FORCE ROW LEVEL SECURITY;
ALTER TABLE connector.input_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector.input_event FORCE ROW LEVEL SECURITY;
-- Binding lookup is a narrowly reviewed identity/control-plane boundary, inaccessible to
-- connector/runtime roles. The definer resolves the tenant only AFTER token verification.
CREATE POLICY binding_lookup ON connector.binding TO jobguard_migration USING(true) WITH CHECK(true);
CREATE POLICY tenant_intake ON connector.input_event TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE FUNCTION connector.binding_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.namespace) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.namespace)
 THEN RAISE EXCEPTION 'CONNECTOR_BINDING_IDENTITY_IMMUTABLE' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION connector.binding_identity_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION connector.binding_identity_guard() FROM PUBLIC,jobguard_connector,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER immutable_binding_identity BEFORE UPDATE ON connector.binding
 FOR EACH ROW EXECUTE FUNCTION connector.binding_identity_guard();
CREATE TRIGGER immutable_connector_event BEFORE UPDATE OR DELETE ON connector.input_event
 FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();
REVOKE ALL ON ALL TABLES IN SCHEMA connector FROM PUBLIC,jobguard_connector,jobguard_runtime,jobguard_infrastructure;

CREATE FUNCTION connector.intake(binding_id uuid, token text, input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b connector.binding; prior connector.input_event; h text; result jsonb;
 seq bigint; prev text; ts timestamptz; payload jsonb; ph text; eh text; actor text; v_kind text;
BEGIN
 -- No caller-supplied tenant, human membership, role, mode, job, bill or target SQL routine.
 SELECT * INTO b FROM connector.binding WHERE id=binding_id FOR SHARE;
 IF NOT FOUND OR token IS NULL OR octet_length(token) NOT BETWEEN 32 AND 256
  OR b.token_sha256 IS DISTINCT FROM encode(sha256(convert_to(token,'UTF8')),'hex')
  OR b.revoked_at IS NOT NULL OR b.expires_at<=clock_timestamp()
  OR b.environment<>'synthetic_demo' OR b.endpoint_kind<>'fake'
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',b.tenant_id::text,true);
 -- Validate again at the database boundary, including direct SQL attacks.
 IF input IS NULL OR jsonb_typeof(input)<>'object' OR octet_length(input::text)>16384
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='22023'; END IF;
 v_kind:=input->>'kind';
 IF v_kind IS NULL OR v_kind NOT IN('work_order','billing_status')
  OR input->>'version' IS DISTINCT FROM 'connector-input.v1'
  OR (SELECT count(*) FROM jsonb_object_keys(input))<>6
  OR NOT(input ?& ARRAY['version','eventId','subject','revision','kind'])
  OR input - ARRAY['version','eventId','subject','revision','kind','document','status']<>'{}'::jsonb
  OR jsonb_typeof(input->'eventId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(input->'subject') IS DISTINCT FROM 'string'
  OR input->>'eventId' !~ '^fixture:[a-z0-9_-]{1,112}$'
  OR input->>'subject' !~ '^fixture:[a-z0-9_-]{1,112}$'
  OR jsonb_typeof(input->'revision') IS DISTINCT FROM 'number'
  OR (input->>'revision') !~ '^[1-9][0-9]{0,9}$'
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='22023'; END IF;
 IF (input->>'revision')::bigint>2147483647
  OR (v_kind='work_order' AND (NOT input ? 'document' OR input ? 'status'
   OR jsonb_typeof(input->'document') IS DISTINCT FROM 'string' OR input->>'document' !~ '^fixture:[a-z0-9_-]{1,112}$'))
  OR (v_kind='billing_status' AND (NOT input ? 'status' OR input ? 'document'
   OR jsonb_typeof(input->'status') IS DISTINCT FROM 'string' OR input->>'status' NOT IN('billed','paid','reversed')))
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='22023'; END IF;
 h:=app.final_lock_hash(input);
 -- Stable namespace survives key/connection/channel rotation. Serialize that whole source;
 -- no domain table is locked or touched. Reordered revisions remain immutable staged facts.
 PERFORM pg_advisory_xact_lock(hashtextextended('connector:'||b.tenant_id::text||':'||b.namespace,0));
 IF b.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM connector.input_event e WHERE e.tenant_id=b.tenant_id AND e.namespace=b.namespace AND e.event_id=input->>'eventId';
 IF FOUND THEN
  IF prior.semantic_hash<>h THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='23505'; END IF;
  RETURN prior.receipt;
 END IF;
 IF EXISTS(SELECT 1 FROM connector.input_event e WHERE e.tenant_id=b.tenant_id AND e.namespace=b.namespace AND e.kind=v_kind AND e.subject=input->>'subject' AND e.revision=(input->>'revision')::integer)
 THEN RAISE EXCEPTION 'CONNECTOR_INPUT_REFUSED' USING ERRCODE='23505'; END IF;
 result:=jsonb_build_object('version','connector-receipt.v1','eventId',input->>'eventId','state','staged','domainEffects',0);
 INSERT INTO connector.input_event(tenant_id,binding_id,namespace,event_id,kind,subject,revision,payload,semantic_hash,receipt)
 VALUES(b.tenant_id,b.id,b.namespace,input->>'eventId',v_kind,input->>'subject',(input->>'revision')::integer,input,h,result);
 -- Append to the existing per-tenant chain, identifiers/hash only. Audit head is the LAST lock.
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();seq:=seq+1;
 ts:=date_trunc('milliseconds',clock_timestamp());actor:='connector:'||b.id::text;
 payload:=jsonb_build_object('references',jsonb_build_object('bindingId',b.id,'sourceEvent',input->>'eventId'),'hashes',jsonb_build_object('input',h));
 ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',b.tenant_id::text,seq::text,actor,'connector.input_staged','connector',b.id::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(gen_random_uuid(),b.tenant_id,seq,'audit.v1',actor,'connector.input_staged','connector',b.id::text,ts,payload,ph,prev,eh);
 PERFORM app.advance_audit_head(seq,eh);
 RETURN result;
END $$;
ALTER FUNCTION connector.intake(uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION connector.intake(uuid,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION connector.intake(uuid,text,jsonb) TO jobguard_connector;
-- No usage on app/identity/control_plane, no table reads/writes, no membership in
-- jobguard_runtime and no dynamic SQL. Approve/price/origin/statement commands fail in SQL.
COMMIT;
