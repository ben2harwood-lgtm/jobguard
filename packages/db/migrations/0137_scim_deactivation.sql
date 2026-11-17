BEGIN;
-- ENT-10a2: new synthetic-only objects. Existing objects and privileges are unchanged.
CREATE TABLE identity.scim_event (
 tenant_id uuid NOT NULL,
 id uuid NOT NULL,
 connection_id uuid NOT NULL,
 source_event_id uuid NOT NULL,
 subject_hash char(64) NOT NULL CHECK(subject_hash ~ '^[0-9a-f]{64}$'),
 event_hash char(64) NOT NULL CHECK(event_hash ~ '^[0-9a-f]{64}$'),
 outcome text NOT NULL CHECK(outcome IN('deactivated','ignored','refused')),
 cause_code text NOT NULL CHECK(cause_code IN('SCIM_DEACTIVATED','SCIM_SUBJECT_NOT_LINKED','SCIM_ALREADY_INACTIVE','SCIM_OWNER_PROTECTED')),
 user_id uuid REFERENCES identity.identity_user(id),
 memberships_revoked integer NOT NULL CHECK(memberships_revoked>=0),
 sessions_revoked integer NOT NULL CHECK(sessions_revoked>=0),
 grants_revoked integer NOT NULL CHECK(grants_revoked>=0),
 created_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,connection_id,source_event_id),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES identity.sso_connection(tenant_id,id),
 CHECK((outcome,cause_code) IN (('deactivated','SCIM_DEACTIVATED'),('ignored','SCIM_SUBJECT_NOT_LINKED'),('ignored','SCIM_ALREADY_INACTIVE'),('refused','SCIM_OWNER_PROTECTED'))),
 CHECK((cause_code='SCIM_SUBJECT_NOT_LINKED')=(user_id IS NULL)),
 CHECK((outcome='deactivated' AND memberships_revoked>=1) OR (outcome<>'deactivated' AND memberships_revoked=0 AND sessions_revoked=0 AND grants_revoked=0))
);
ALTER TABLE identity.scim_event OWNER TO jobguard_migration;
ALTER TABLE identity.scim_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.scim_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON identity.scim_event TO jobguard_identity,jobguard_migration
 USING(tenant_id=(CASE WHEN current_setting('app.tenant_id',true) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN current_setting('app.tenant_id',true)::uuid ELSE NULL END))
 WITH CHECK(tenant_id=(CASE WHEN current_setting('app.tenant_id',true) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN current_setting('app.tenant_id',true)::uuid ELSE NULL END));
REVOKE ALL ON identity.scim_event FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_identity;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON identity.scim_event FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();

-- The restricted identity credential is the proved synthetic provider trust boundary.
CREATE FUNCTION identity.scim_deactivate(c uuid,p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 t uuid; previous identity.scim_event; source_id uuid; person_id uuid;
 target_ids uuid[]:=ARRAY[]::uuid[]; member record; protected_owner boolean:=false;
 changed_at timestamptz; record_id uuid:=gen_random_uuid();
 result_outcome text:='ignored'; result_cause text;
 membership_count integer:=0; session_count integer:=0; grant_count integer:=0;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SCIM_ROUTE_BLOCKED' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_SCIM_INPUT' USING ERRCODE='22023'; END IF;
 IF (p->>'version') IS DISTINCT FROM 'scim-deactivation.v1'
  OR jsonb_typeof(p->'version') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p->'eventId') IS DISTINCT FROM 'string'
  OR ((p->>'eventId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') IS NOT TRUE
  OR jsonb_typeof(p->'subjectHash') IS DISTINCT FROM 'string'
  OR ((p->>'subjectHash') ~ '^[0-9a-f]{64}$') IS NOT TRUE
  OR jsonb_typeof(p->'eventHash') IS DISTINCT FROM 'string'
  OR ((p->>'eventHash') ~ '^[0-9a-f]{64}$') IS NOT TRUE
  OR (p-ARRAY['version','eventId','subjectHash','eventHash'])<>'{}'::jsonb
 THEN RAISE EXCEPTION 'INVALID_SCIM_INPUT' USING ERRCODE='22023'; END IF;
 source_id:=(p->>'eventId')::uuid;
 PERFORM identity.sso_load_connection(c);
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF t IS NULL THEN RAISE EXCEPTION 'SCIM_ROUTE_BLOCKED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 SELECT * INTO previous FROM identity.scim_event e WHERE e.tenant_id=t AND e.connection_id=c AND e.source_event_id=source_id;
 IF FOUND THEN
  IF previous.subject_hash IS DISTINCT FROM (p->>'subjectHash') OR previous.event_hash IS DISTINCT FROM (p->>'eventHash') THEN
   RAISE EXCEPTION 'SCIM_EVENT_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN jsonb_build_object('outcome',previous.outcome,'cause',previous.cause_code,'recordId',previous.id,'replayed',true);
 END IF;
 changed_at:=clock_timestamp();
 SELECT sub.user_id INTO person_id FROM identity.sso_subject sub WHERE sub.tenant_id=t AND sub.connection_id=c AND sub.subject_hash=(p->>'subjectHash');
 IF person_id IS NULL THEN result_cause:='SCIM_SUBJECT_NOT_LINKED';
 ELSE
  FOR member IN SELECT m.id,m.role FROM app.membership m WHERE m.tenant_id=t AND m.identity_user_id=person_id AND m.revoked_at IS NULL ORDER BY m.id FOR UPDATE LOOP
   target_ids:=array_append(target_ids,member.id);
   IF member.role='owner' THEN protected_owner:=true; END IF;
  END LOOP;
  IF cardinality(target_ids)=0 THEN result_cause:='SCIM_ALREADY_INACTIVE';
  ELSIF protected_owner THEN result_outcome:='refused';result_cause:='SCIM_OWNER_PROTECTED';
  ELSE
   UPDATE app.membership SET revoked_at=changed_at WHERE tenant_id=t AND id=ANY(target_ids) AND revoked_at IS NULL;
   GET DIAGNOSTICS membership_count=ROW_COUNT;
   UPDATE identity.session SET revoked_at=changed_at WHERE revoked_at IS NULL AND user_id=person_id AND id IN(
    SELECT b.session_id FROM identity.sso_session_binding b JOIN identity.sso_subject sub
     ON(sub.tenant_id,sub.connection_id,sub.subject_hash)=(b.tenant_id,b.connection_id,b.subject_hash)
    WHERE b.tenant_id=t AND sub.tenant_id=t AND sub.user_id=person_id);
   GET DIAGNOSTICS session_count=ROW_COUNT;
   INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id)
    SELECT t,gen_random_uuid(),g.id FROM app.role_grant g WHERE g.tenant_id=t AND g.membership_id=ANY(target_ids)
     AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE r.tenant_id=t AND r.grant_id=g.id);
   GET DIAGNOSTICS grant_count=ROW_COUNT;
   result_outcome:='deactivated';result_cause:='SCIM_DEACTIVATED';
  END IF;
 END IF;
 INSERT INTO identity.scim_event(tenant_id,id,connection_id,source_event_id,subject_hash,event_hash,outcome,cause_code,user_id,memberships_revoked,sessions_revoked,grants_revoked,created_at)
 VALUES(t,record_id,c,source_id,p->>'subjectHash',p->>'eventHash',result_outcome,result_cause,person_id,membership_count,session_count,grant_count,changed_at);
 RETURN jsonb_build_object('outcome',result_outcome,'cause',result_cause,'recordId',record_id,'replayed',false);
END $$;
ALTER FUNCTION identity.scim_deactivate(uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.scim_deactivate(uuid,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_identity;
GRANT EXECUTE ON FUNCTION identity.scim_deactivate(uuid,jsonb) TO jobguard_identity;
COMMIT;
