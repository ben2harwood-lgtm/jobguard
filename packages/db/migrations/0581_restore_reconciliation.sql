BEGIN;

-- Infrastructure only: a reference to an independently retained reconciliation
-- receipt, never customer content. Each fact binds one exact resume request.
CREATE TABLE outbound_control.reconciliation (
 request_id uuid PRIMARY KEY REFERENCES outbound_control.event(command_id),
 receipt_id uuid NOT NULL UNIQUE,
 actor name NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE outbound_control.reconciliation OWNER TO jobguard_migration;
REVOKE ALL ON outbound_control.reconciliation FROM PUBLIC, jobguard_runtime, jobguard_outbound_operator;
GRANT SELECT ON outbound_control.reconciliation TO jobguard_outbound_operator;

CREATE FUNCTION outbound_control.record_reconciliation(p_request uuid,p_receipt uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s outbound_control.state%ROWTYPE; prior outbound_control.reconciliation%ROWTYPE;
BEGIN
 IF NOT pg_has_role(session_user,'jobguard_outbound_operator','MEMBER') THEN
  RAISE EXCEPTION 'OUTBOUND_OPERATOR_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_request IS NULL OR p_receipt IS NULL THEN
  RAISE EXCEPTION 'INVALID_OUTBOUND_RECONCILIATION' USING ERRCODE='22023';
 END IF;
 SELECT * INTO STRICT s FROM outbound_control.state WHERE singleton FOR UPDATE;
 IF NOT s.paused OR s.resume_request_id IS DISTINCT FROM p_request THEN
  RAISE EXCEPTION 'OUTBOUND_STALE_RECONCILIATION';
 END IF;
 SELECT * INTO prior FROM outbound_control.reconciliation WHERE request_id=p_request;
 IF FOUND THEN
  IF prior.receipt_id<>p_receipt OR prior.actor<>session_user THEN
   RAISE EXCEPTION 'OUTBOUND_RECONCILIATION_CONFLICT';
  END IF;
  RETURN;
 END IF;
 INSERT INTO outbound_control.reconciliation(request_id,receipt_id,actor)
 VALUES(p_request,p_receipt,session_user);
END $$;
REVOKE ALL ON FUNCTION outbound_control.record_reconciliation(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outbound_control.record_reconciliation(uuid,uuid) TO jobguard_outbound_operator;
ALTER FUNCTION outbound_control.record_reconciliation(uuid,uuid) OWNER TO jobguard_migration;

CREATE FUNCTION outbound_control.require_reconciliation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.paused AND NOT NEW.paused AND NOT EXISTS (
  SELECT FROM outbound_control.reconciliation WHERE request_id=OLD.resume_request_id
 ) THEN
  RAISE EXCEPTION 'OUTBOUND_RECONCILIATION_REQUIRED';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION outbound_control.require_reconciliation() FROM PUBLIC;
ALTER FUNCTION outbound_control.require_reconciliation() OWNER TO jobguard_migration;
CREATE TRIGGER require_reconciliation BEFORE UPDATE ON outbound_control.state
 FOR EACH ROW EXECUTE FUNCTION outbound_control.require_reconciliation();
COMMIT;
