# 0593: synthetic adjustment reads (M4-17 partial)
Adds one SECURITY DEFINER read routine and runtime EXECUTE only. Uses ef_actor for current session, finance grants and entitlement checks, and explicit tenant/job/run filters with existing FORCE RLS policies for jobguard_migration. Missing and foreign runs both return null. No caller settings are changed; no SET app.* clause. No tables, existing routines or money facts change.

Fresh and upgrade paths add the same routine; no backfill. Forward fix by a later migration; rollback may revoke EXECUTE and drop this new routine after the web caller is removed. CI must verify catalogue proof, RLS, finance/session refusal, immutable facts and browser journeys. Gates and real rails remain closed.
