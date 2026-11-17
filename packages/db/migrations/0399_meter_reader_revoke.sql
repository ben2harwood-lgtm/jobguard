BEGIN;
-- 0380 replaces this reader with the freshness-checked entry points. Retire
-- runtime access in the migration path as well as the administrative finalizer.
REVOKE EXECUTE ON FUNCTION app.mon1_counted_meter_today(uuid,text) FROM jobguard_runtime;
COMMIT;
