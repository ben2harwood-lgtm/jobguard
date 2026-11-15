BEGIN;
-- LATER-SAFETY-147: preserve recovery history against owner TRUNCATE.
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
  EXECUTE format('CREATE TRIGGER recovery_history_no_truncate BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT WHEN (current_setting(''is_superuser'')<>''on'') EXECUTE FUNCTION app.reject_immutable_authorization_record()',n);
 END LOOP;
END $$;
COMMIT;
