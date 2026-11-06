BEGIN;
-- LATER-SAFETY-104: enforce append-only recovery history even for the table owner.
-- Current message and follow-up paths only append; no routines or grants change.
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY[
  'recovery_message',
  'recovery_message_approval',
  'recovery_message_event',
  'recovery_message_sink',
  'recovery_follow_up',
  'recovery_follow_up_owner',
  'recovery_follow_up_event',
  'recovery_follow_up_due',
  'recovery_follow_up_reminder',
  'recovery_follow_up_advance'
 ] LOOP
  EXECUTE format('CREATE TRIGGER recovery_record_immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record()',n);
 END LOOP;
END $$;
COMMIT;
