BEGIN;
-- ENT-13a staging coverage only. No new privilege, table, or domain effect.
ALTER TABLE connector.input_event DROP CONSTRAINT input_event_kind_check;
ALTER TABLE connector.input_event ADD CONSTRAINT input_event_kind_check
 CHECK(kind IN('work_order','billing_status','materials_issue'));

CREATE OR REPLACE FUNCTION connector.intake(binding_id uuid, token text, input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b connector.binding; prior connector.input_event; h text; result jsonb;
 payload jsonb; v_kind text;
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
 IF v_kind IS NULL OR v_kind NOT IN('work_order','billing_status','materials_issue')
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
  OR (v_kind IN('work_order','materials_issue') AND (NOT input ? 'document' OR input ? 'status'
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
 payload:=jsonb_build_object('references',jsonb_build_object('bindingId',b.id,'sourceEvent',input->>'eventId'),'hashes',jsonb_build_object('input',h));
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object(
  'id',gen_random_uuid(),'version','audit.v1','actorRef','connector:'||b.id::text,
  'eventType','connector.input_staged','subjectType','connector','subjectRef',b.id::text,
  'payload',payload)),'checked_operation');
 RETURN result;
END $$;
COMMIT;
