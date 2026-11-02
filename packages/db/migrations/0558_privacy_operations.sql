BEGIN;
-- Isolated synthetic rehearsal inventory. No real job/evidence/accounting/identity
-- writers are introduced, and no provider or physical backup deletion is possible.
CREATE TABLE app.privacy_subject (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('builder','resident','client')),
 synthetic boolean NOT NULL DEFAULT true CHECK(synthetic), revoked_at timestamptz,
 PRIMARY KEY(tenant_id,id)
);
CREATE TABLE app.privacy_artifact (
 tenant_id uuid NOT NULL, subject_id uuid NOT NULL, id uuid NOT NULL,
 category text NOT NULL CHECK(category IN('source','derived','accounting','legal','log','backup','queued_work','inflight_work','access_grant')),
 payload jsonb, state text NOT NULL DEFAULT 'active' CHECK(state IN('active','redacted','retained','cancelled','outcome_unknown','revoked')),
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,subject_id) REFERENCES app.privacy_subject(tenant_id,id)
);
CREATE TABLE app.privacy_request (
 tenant_id uuid NOT NULL, id uuid NOT NULL, subject_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN('access','export','delete')),
 controller text NOT NULL CHECK(controller IN('jobguard','contractor')),
 state text NOT NULL CHECK(state IN('awaiting_instruction','ready','rehearsed')),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 instruction_ref uuid, instruction_hash text CHECK(instruction_hash ~ '^[a-f0-9]{64}$'), instruction_actor uuid, instruction_at timestamptz,
 opened_by uuid NOT NULL, opened_at timestamptz NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz,
 export_document jsonb, PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,subject_id) REFERENCES app.privacy_subject(tenant_id,id),
 FOREIGN KEY(tenant_id,opened_by) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,instruction_actor) REFERENCES app.membership(tenant_id,id),
 CHECK((instruction_ref IS NULL AND instruction_hash IS NULL AND instruction_actor IS NULL AND instruction_at IS NULL)
 OR (instruction_ref IS NOT NULL AND instruction_hash IS NOT NULL AND instruction_actor IS NOT NULL AND instruction_at IS NOT NULL)),
 CHECK(controller<>'contractor' OR state='awaiting_instruction' OR instruction_ref IS NOT NULL)
);
CREATE TABLE app.privacy_command (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, request_id uuid NOT NULL, actor_id uuid NOT NULL,
 payload jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,command_id), FOREIGN KEY(tenant_id,request_id) REFERENCES app.privacy_request(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES app.membership(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['privacy_subject','privacy_artifact','privacy_request','privacy_command'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_migration USING(tenant_id=CASE WHEN pg_input_is_valid(current_setting(''app.tenant_id'',true),''uuid'') THEN nullif(current_setting(''app.tenant_id'',true),'''')::uuid END) WITH CHECK(tenant_id=CASE WHEN pg_input_is_valid(current_setting(''app.tenant_id'',true),''uuid'') THEN nullif(current_setting(''app.tenant_id'',true),'''')::uuid END)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access',n);
 END LOOP;
END $$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.privacy_command FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE FUNCTION app.privacy_command(t uuid,digest text,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; c uuid; req app.privacy_request; subj app.privacy_subject; previous app.privacy_command;
 seq bigint; previous_hash text; ts timestamptz; audit_payload jsonb; ph text; eh text;
 action text:=v->>'action'; allowed text[]; result jsonb; doc jsonb;
BEGIN
 -- Trusted database boundary, independent of the HTTP flag and environment.
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'PRIVACY_DISABLED' USING ERRCODE='42501'; END IF;
 actor:=app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,539));
 actor:=app.mon1_company_actor(t,digest);
 allowed:=CASE action WHEN 'open' THEN ARRAY['subjectId','operation'] WHEN 'instruct' THEN ARRAY['requestId','expectedRevision','instructionRef','instructionHash'] WHEN 'execute' THEN ARRAY['requestId','expectedRevision'] END;
 IF allowed IS NULL OR jsonb_typeof(v)<>'object' OR v->>'version' IS DISTINCT FROM 'privacy-command.v1'
 OR NOT v ?& (allowed||ARRAY['version','commandId','action']) OR v-(allowed||ARRAY['version','commandId','action'])<>'{}'
 THEN RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023'; END IF;
 c:=(v->>'commandId')::uuid;
 IF c IS NULL THEN RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO previous FROM app.privacy_command WHERE tenant_id=t AND command_id=c;
 IF previous.command_id IS NOT NULL THEN
  IF previous.payload IS DISTINCT FROM v OR previous.actor_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'PRIVACY_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN previous.result;
 END IF;
 IF action='open' THEN
  SELECT * INTO subj FROM app.privacy_subject WHERE tenant_id=t AND id=(v->>'subjectId')::uuid FOR UPDATE;
  IF subj.id IS NULL THEN RAISE EXCEPTION 'PRIVACY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v->>'operation' IS NULL OR v->>'operation' NOT IN('access','export','delete') THEN RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023'; END IF;
  INSERT INTO app.privacy_request(tenant_id,id,subject_id,operation,controller,state,opened_by)
  VALUES(t,gen_random_uuid(),subj.id,v->>'operation',CASE WHEN subj.kind='builder' THEN 'jobguard' ELSE 'contractor' END,
   CASE WHEN subj.kind='builder' THEN 'ready' ELSE 'awaiting_instruction' END,actor) RETURNING * INTO req;
 ELSE
  SELECT * INTO req FROM app.privacy_request WHERE tenant_id=t AND id=(v->>'requestId')::uuid FOR UPDATE;
  IF req.id IS NULL THEN RAISE EXCEPTION 'PRIVACY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF jsonb_typeof(v->'expectedRevision') IS DISTINCT FROM 'number' OR v->>'expectedRevision' !~ '^[0-9]+$'
  THEN RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023'; END IF;
  IF req.revision<>(v->>'expectedRevision')::integer OR req.state='rehearsed' THEN RAISE EXCEPTION 'PRIVACY_CONFLICT' USING ERRCODE='40001'; END IF;
  IF action='instruct' THEN
   IF req.controller<>'contractor' OR req.state<>'awaiting_instruction' OR v->>'instructionHash' IS NULL OR v->>'instructionHash' !~ '^[a-f0-9]{64}$' OR (v->>'instructionRef')::uuid IS NULL
   THEN RAISE EXCEPTION 'PRIVACY_INVALID' USING ERRCODE='22023'; END IF;
   UPDATE app.privacy_request SET state='ready',revision=revision+1,instruction_ref=(v->>'instructionRef')::uuid,
    instruction_hash=v->>'instructionHash',instruction_actor=actor,instruction_at=clock_timestamp() WHERE tenant_id=t AND id=req.id RETURNING * INTO req;
  ELSE
   IF req.state<>'ready' THEN RAISE EXCEPTION 'PRIVACY_INSTRUCTION_REQUIRED' USING ERRCODE='42501'; END IF;
   PERFORM 1 FROM app.privacy_subject WHERE tenant_id=t AND id=req.subject_id FOR UPDATE;
   IF req.operation='delete' THEN
    -- Cancel queued work, fence access, reconcile in-flight outcomes. Never retry
    -- unknown provider results and never mutate retained commercial/audit facts.
    UPDATE app.privacy_subject SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE tenant_id=t AND id=req.subject_id;
    UPDATE app.privacy_artifact SET
     payload=CASE WHEN category IN('source','derived','log','queued_work','access_grant') THEN NULL ELSE payload END,
     state=CASE WHEN category IN('source','derived','log') THEN 'redacted' WHEN category='queued_work' THEN 'cancelled'
      WHEN category='inflight_work' THEN 'outcome_unknown' WHEN category='access_grant' THEN 'revoked' ELSE 'retained' END
     WHERE tenant_id=t AND subject_id=req.subject_id;
    UPDATE app.privacy_request SET export_document=NULL WHERE tenant_id=t AND subject_id=req.subject_id;
   ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'category',category,'state',state,'data',payload) ORDER BY id),'[]') INTO doc
     FROM app.privacy_artifact WHERE tenant_id=t AND subject_id=req.subject_id AND category NOT IN('backup','queued_work','inflight_work','access_grant');
   END IF;
   UPDATE app.privacy_request SET state='rehearsed',revision=revision+1,completed_at=clock_timestamp(),export_document=doc
    WHERE tenant_id=t AND id=req.id RETURNING * INTO req;
  END IF;
 END IF;
 result:=jsonb_build_object('version','privacy-result.v1','requestId',req.id,'revision',req.revision,'state',req.state,'controller',req.controller,
  'operation',req.operation,'policyVersion','privacy_rehearsal_v1','synthetic',true,'realExternalActions',0,'backupsErased',false);
 INSERT INTO app.privacy_command(tenant_id,command_id,request_id,actor_id,payload,result) VALUES(t,c,req.id,actor,v,result);
 -- Reuse the existing append-only chain writer; no content/contact data enters audit.
 SELECT sequence,event_hash INTO seq,previous_hash FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp());
 audit_payload:=jsonb_build_object('references',jsonb_build_object('commandId',c::text),'hashes',jsonb_build_object('request',app.final_lock_hash(v),'result',app.final_lock_hash(result)));
 ph:=app.final_lock_hash(audit_payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'membership:'||actor::text,'privacy.'||action,'privacy_request',req.id::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(previous_hash,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(gen_random_uuid(),t,seq,'audit.v1','membership:'||actor::text,'privacy.'||action,'privacy_request',req.id::text,ts,audit_payload,ph,previous_hash,eh);
 PERFORM app.advance_audit_head(seq,eh);
 RETURN result;
END $$;
CREATE FUNCTION app.privacy_read(t uuid,digest text,r uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE req app.privacy_request;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'PRIVACY_DISABLED' USING ERRCODE='42501'; END IF;
 PERFORM app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,539));
 PERFORM app.mon1_company_actor(t,digest);
 SELECT * INTO req FROM app.privacy_request WHERE tenant_id=t AND id=r;
 IF req.id IS NULL THEN RAISE EXCEPTION 'PRIVACY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('version','privacy-read.v1','requestId',req.id,'state',req.state,'revision',req.revision,'controller',req.controller,
  'operation',req.operation,'instructionRef',req.instruction_ref,'instructionHash',req.instruction_hash,'instructionActor',req.instruction_actor,
  'instructionAt',req.instruction_at,'document',req.export_document,'synthetic',true,'backupsErased',false,'policyVersion','privacy_rehearsal_v1');
END $$;
ALTER FUNCTION app.privacy_command(uuid,text,jsonb) OWNER TO jobguard_migration;
ALTER FUNCTION app.privacy_read(uuid,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.privacy_command(uuid,text,jsonb),app.privacy_read(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.privacy_command(uuid,text,jsonb),app.privacy_read(uuid,text,uuid) TO jobguard_runtime;
COMMIT;
