BEGIN;
-- LATER-SAFETY-125: only existing worker, reconciliation and cancellation edges.
CREATE FUNCTION app.outbox_status_forward_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT (
  (OLD.status IN ('pending','retryable') AND NEW.status IN ('executing','cancelled')) OR
  (OLD.status='executing' AND NEW.status IN ('succeeded','retryable','outcome_unknown','dead_letter')) OR
  (OLD.status='outcome_unknown' AND NEW.status IN ('succeeded','retryable','cancelled'))
 ) THEN
  RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.outbox_status_forward_only() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.outbox_status_forward_only() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
-- Reads only OLD/NEW status; independent of authorized-content trigger order.
CREATE TRIGGER action_outbox_status_forward_only BEFORE UPDATE OF status ON app.action_outbox
 FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
 EXECUTE FUNCTION app.outbox_status_forward_only();
-- Forward fix only: changing these edges requires a reviewed follow-up migration.
COMMIT;
