BEGIN;
-- Prevention is terminal and means no cash was received. Stored-receipt cash is
-- deliberately not a manual case landing event; guard its immutable history too.
-- Even a later refund is a recovery/reversal, never a prevention.
-- Write-off also uses manual landed totals, so stored cash forbids it entirely
-- until a separately approved policy defines writing off an unpaid remainder.
CREATE FUNCTION app.guard_prevention_after_stored_receipt() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'RECOVERY_CASE_NOT_FOUND' USING ERRCODE='42501';
 END IF;
 -- Same key/order as RecoveryCaseRepository and allocate_stored_receipt_line.
 -- Both commands read current case/receipt facts only after taking this key.
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.case_id::text));
 IF EXISTS(SELECT 1 FROM app.stored_receipt_case_allocation a
  WHERE a.tenant_id=NEW.tenant_id AND a.job_id=NEW.job_id AND a.case_id=NEW.case_id
   AND a.reverses_id IS NULL AND a.gross_numerator::numeric>0) THEN
  IF NEW.event_type='write_off' THEN
   RAISE EXCEPTION 'RECOVERY_WRITE_OFF_HAS_STORED_CASH' USING ERRCODE='23514';
  END IF;
  RAISE EXCEPTION 'RECOVERY_PREVENTION_HAS_STORED_CASH' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_prevention_after_stored_receipt() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_prevention_after_stored_receipt()
 FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
CREATE TRIGGER recovery_prevention_stored_cash_guard BEFORE INSERT ON app.recovery_case_event
 FOR EACH ROW WHEN (NEW.to_state='prevented' OR NEW.event_type='write_off') EXECUTE FUNCTION app.guard_prevention_after_stored_receipt();
-- No row or history rewrites. Forward-fix the guard if needed; removing it would
-- reintroduce the ability to extinguish a stored-cash fee by relabelling a case.
COMMIT;
