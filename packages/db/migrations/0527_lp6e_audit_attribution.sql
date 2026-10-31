-- LP-6e RED. Forward-only; preserve all existing v1/v2 history and checkpoints.
-- Requires LP-6d caller enforcement before activation. No scanner/source pins changed.
BEGIN;
ALTER TABLE app.audit_event DROP CONSTRAINT audit_event_version_check;
ALTER TABLE app.audit_event ADD CONSTRAINT audit_event_version_check CHECK(version IN ('audit.v1','audit.v2','audit.v3'));
GRANT EXECUTE ON FUNCTION app.current_actor(),app.current_tenant() TO jobguard_audit_writer;
CREATE OR REPLACE FUNCTION app.lp4_seal_audit(p_events jsonb, p_trust text) RETURNS SETOF app.audit_event
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 e jsonb; payload jsonb; section text; entry record; seq bigint; prev text; ts timestamptz;
 ph text; eh text; stored app.audit_event; bound_actor uuid; bound_tenant uuid; actor_ref text; actor_kind text;
BEGIN
 IF t IS NULL THEN RAISE EXCEPTION 'AUDIT_CONTEXT_REQUIRED' USING ERRCODE='42501'; END IF;
 -- The protected lookup adds no business lock. Never catch an expired binding
 -- as a system fallback for an application login (including inherited logins).
 BEGIN
  bound_actor:=app.current_actor(); bound_tenant:=app.current_tenant();
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF pg_has_role(session_user,'jobguard_runtime','USAGE')
   AND NOT (SELECT r.rolsuper FROM pg_catalog.pg_roles r WHERE r.rolname=session_user) THEN RAISE; END IF;
  bound_actor:=NULL; bound_tenant:=NULL;
 END;
 IF bound_actor IS NOT NULL AND bound_tenant IS DISTINCT FROM t THEN
  RAISE EXCEPTION 'AUDIT_CONTEXT_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_trust IS NULL OR p_trust NOT IN ('lower_trust','checked_operation')
  OR jsonb_typeof(p_events) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_events)=0 THEN RETURN; END IF;
 -- Validate the WHOLE batch before the head wait. Errors contain no caller input.
 FOR e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  IF jsonb_typeof(e) IS DISTINCT FROM 'object'
   OR e - ARRAY['id','version','actorRef','eventType','subjectType','subjectRef','payload'] <> '{}'::jsonb
   OR NOT (e ?& ARRAY['id','version','actorRef','eventType','subjectType','subjectRef','payload'])
   OR e->>'version' IS DISTINCT FROM 'audit.v1' THEN
   RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  FOREACH section IN ARRAY ARRAY['id','actorRef','eventType','subjectType','subjectRef'] LOOP
   IF jsonb_typeof(e->section) IS DISTINCT FROM 'string' OR length(e->>section) NOT BETWEEN 1 AND 200
    OR (e->>section) !~ '^[A-Za-z0-9_.:@/-]+$'
    OR (e->>section) ~ '@[^@]*[.]' THEN
    RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF (e->>'id') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
   OR length(e->>'eventType')>100 OR length(e->>'subjectType')>100 THEN
   RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  -- Only checked domain operations may establish authority-bearing event names.
  IF p_trust='lower_trust' AND lower(e->>'eventType') ~
   '(^|[_.:/-])(command|success[a-z]*|succeeded|approv[a-z]*|payment[a-z]*|paid|settle[a-z]*|complet[a-z]*|accept[a-z]*|authoriz[a-z]*|issued|locked)([_.:/-]|$)' THEN
   RAISE EXCEPTION 'AUDIT_CHECKED_OPERATION_REQUIRED' USING ERRCODE='42501'; END IF;
  payload:=e->'payload';
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
   OR payload - ARRAY['references','hashes','classifications'] <> '{}'::jsonb THEN
   RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  FOREACH section IN ARRAY ARRAY['references','hashes','classifications'] LOOP
   IF payload ? section THEN
    IF jsonb_typeof(payload->section) IS DISTINCT FROM 'object' THEN
     RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
    FOR entry IN SELECT key,value FROM jsonb_each(payload->section) LOOP
     IF length(entry.key) NOT BETWEEN 1 AND 200 OR entry.key !~ '^[A-Za-z0-9_.:@/-]+$'
      OR entry.key IN ('actor','tenant','type','auditActorKind','auditTrust','tenantId','id','version','actorRef','eventType','subjectType','subjectRef','sequence','occurredAt','previousHash','eventHash')
      OR jsonb_typeof(entry.value) IS DISTINCT FROM 'string'
      OR length(entry.value #>> '{}') NOT BETWEEN 1 AND 200
      OR (entry.value #>> '{}') !~ '^[A-Za-z0-9_.:@/-]+$'
      OR (entry.value #>> '{}') ~ '@[^@]*[.]' THEN
      RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
     IF section='hashes' AND (entry.value #>> '{}') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
     IF section='classifications' AND (entry.value #>> '{}') NOT IN ('operational','commercial','financial','security') THEN
      RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
    END LOOP;
   END IF;
  END LOOP;
 END LOOP;
 INSERT INTO audit_control.audit_head(tenant_id) VALUES(t) ON CONFLICT DO NOTHING;
 SELECT h.sequence,h.event_hash INTO seq,prev FROM audit_control.audit_head h WHERE h.tenant_id=t FOR UPDATE;
 FOR e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  seq:=seq+1;
  ts:=date_trunc('milliseconds',clock_timestamp());
  -- No owner-side claim of a human: workers, seeds and restore are system work.
  actor_kind:=CASE WHEN bound_actor IS NULL THEN 'system' ELSE 'bound_member' END;
  actor_ref:=CASE WHEN bound_actor IS NOT NULL THEN 'membership:'||bound_actor::text
   ELSE 'system:database:'||session_user END;
  payload:=jsonb_set(e->'payload','{references}',coalesce(e->'payload'->'references','{}'::jsonb)||jsonb_build_object('auditTrust',p_trust,'auditActorKind',actor_kind));
  ph:=encode(sha256(convert_to(app.final_lock_canonical(payload),'UTF8')),'hex');
  eh:=encode(sha256(convert_to(array_to_string(ARRAY['audit.v3',(e->>'id')::uuid::text,t::text,seq::text,actor_ref,e->>'eventType',
    e->>'subjectType',e->>'subjectRef',to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')],chr(31)),'UTF8')),'hex');
  INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
   VALUES((e->>'id')::uuid,t,seq,'audit.v3',actor_ref,e->>'eventType',e->>'subjectType',e->>'subjectRef',ts,payload,ph,prev,eh)
   RETURNING * INTO stored;
  RETURN NEXT stored;
  prev:=eh;
 END LOOP;
 UPDATE audit_control.audit_head SET sequence=seq,event_hash=prev WHERE tenant_id=t;
END $$;
COMMIT;
