BEGIN;

-- App-wide infrastructure exception: contains no tenant/customer data. Separate
-- schema exposes only a boolean to business workers, never operator identities.
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_outbound_operator') THEN
  CREATE ROLE jobguard_outbound_operator NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER NOBYPASSRLS;
 END IF;
END $$;
CREATE SCHEMA outbound_control AUTHORIZATION jobguard_migration;
REVOKE ALL ON SCHEMA outbound_control FROM PUBLIC;
GRANT USAGE ON SCHEMA outbound_control TO jobguard_runtime, jobguard_outbound_operator;
SET LOCAL ROLE jobguard_migration;
CREATE TABLE outbound_control.state (
 singleton boolean PRIMARY KEY CHECK (singleton),
 paused boolean NOT NULL,
 revision integer NOT NULL CHECK (revision >= 0),
 paused_by name,
 resume_requested_by name,
 resume_request_id uuid
);
-- Preserve existing fake-only execution on upgrade. Deployment configuration
-- can independently disable claims, and must be paused for a restored database.
INSERT INTO outbound_control.state VALUES (true,false,0,NULL,NULL,NULL);
CREATE TABLE outbound_control.event (
 command_id uuid PRIMARY KEY,
 operation text NOT NULL CHECK (operation IN ('pause','request_resume','approve_resume')),
 expected_revision integer NOT NULL,
 actor name NOT NULL,
 request_id uuid,
 result_revision integer NOT NULL UNIQUE,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON ALL TABLES IN SCHEMA outbound_control FROM PUBLIC, jobguard_runtime, jobguard_outbound_operator;

CREATE FUNCTION outbound_control.claims_enabled() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE enabled boolean;
BEGIN
 -- Shared lock survives until the claim transaction commits. Pause serializes
 -- with claims; already committed/in-flight deliveries require reconciliation.
 SELECT NOT paused INTO enabled FROM outbound_control.state WHERE singleton FOR SHARE;
 RETURN coalesce(enabled,false);
END $$;
REVOKE ALL ON FUNCTION outbound_control.claims_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outbound_control.claims_enabled() TO jobguard_runtime;

CREATE FUNCTION outbound_control.command(p_command uuid,p_operation text,p_revision integer,p_request uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s outbound_control.state%ROWTYPE; old outbound_control.event%ROWTYPE;
BEGIN
 -- session_user cannot be forged by a request field, SET ROLE or a custom GUC.
 IF NOT pg_has_role(session_user,'jobguard_outbound_operator','MEMBER') THEN
  RAISE EXCEPTION 'OUTBOUND_OPERATOR_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_command IS NULL OR p_revision IS NULL OR p_revision<0 OR p_operation IS NULL
    OR p_operation NOT IN ('pause','request_resume','approve_resume')
    OR ((p_operation='approve_resume') <> (p_request IS NOT NULL)) THEN
  RAISE EXCEPTION 'INVALID_OUTBOUND_COMMAND' USING ERRCODE='22023';
 END IF;
 SELECT * INTO STRICT s FROM outbound_control.state WHERE singleton FOR UPDATE;
 SELECT * INTO old FROM outbound_control.event WHERE command_id=p_command;
 IF FOUND THEN
  IF old.operation<>p_operation OR old.expected_revision<>p_revision
     OR old.actor<>session_user OR old.request_id IS DISTINCT FROM p_request THEN
   RAISE EXCEPTION 'OUTBOUND_IDEMPOTENCY_CONFLICT';
  END IF;
  RETURN old.result_revision;
 END IF;
 IF s.revision<>p_revision THEN RAISE EXCEPTION 'OUTBOUND_STALE_REVISION'; END IF;
 IF p_operation='pause' THEN
  UPDATE outbound_control.state SET paused=true,paused_by=session_user,
   resume_requested_by=NULL,resume_request_id=NULL,revision=revision+1 WHERE singleton;
 ELSIF p_operation='request_resume' THEN
  IF NOT s.paused THEN RAISE EXCEPTION 'OUTBOUND_NOT_PAUSED'; END IF;
  UPDATE outbound_control.state SET resume_requested_by=session_user,
   resume_request_id=p_command,revision=revision+1 WHERE singleton;
 ELSE
  IF NOT s.paused OR s.resume_request_id IS DISTINCT FROM p_request
     OR s.resume_requested_by IS NULL OR s.resume_requested_by=session_user
     OR s.paused_by=session_user THEN
   RAISE EXCEPTION 'OUTBOUND_SECOND_PERSON_REQUIRED';
  END IF;
  UPDATE outbound_control.state SET paused=false,paused_by=NULL,
   resume_requested_by=NULL,resume_request_id=NULL,revision=revision+1 WHERE singleton;
 END IF;
 INSERT INTO outbound_control.event(command_id,operation,expected_revision,actor,request_id,result_revision)
 VALUES(p_command,p_operation,p_revision,session_user,p_request,s.revision+1);
 RETURN s.revision+1;
END $$;
REVOKE ALL ON FUNCTION outbound_control.command(uuid,text,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outbound_control.command(uuid,text,integer,uuid) TO jobguard_outbound_operator;
GRANT SELECT ON outbound_control.state, outbound_control.event TO jobguard_outbound_operator;
RESET ROLE;
COMMIT;
