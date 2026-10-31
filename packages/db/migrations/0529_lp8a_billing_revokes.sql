BEGIN;
-- LP-8a: only checked owner routines may create immutable billing facts.
-- The two *_sequence objects are TABLES, not PostgreSQL sequences. There is
-- no nextval() surface; INSERT/UPDATE on those tables and the public number
-- reservation helper are the corresponding number-burning capabilities.
REVOKE INSERT ON app.customer_invoice, app.customer_invoice_evidence,
 app.customer_credit_note, app.customer_payment, app.customer_payment_reversal
 FROM jobguard_runtime, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON app.customer_invoice_sequence,
 app.customer_credit_note_sequence FROM jobguard_runtime, PUBLIC;
REVOKE EXECUTE ON FUNCTION app.reserve_customer_invoice_number(uuid)
 FROM jobguard_runtime, PUBLIC;

-- The existing owner routine needs only the two public binding projections,
-- never direct access to the private binding table.
GRANT EXECUTE ON FUNCTION app.current_actor(), app.current_tenant() TO jobguard_migration;

-- Retain the installed four-argument interface. Actor identity comes from the
-- unforgeable transaction binding, never from a tenant/actor GUC or the draft.
-- This replaces the latest definition (0016); no historical migration changes.
CREATE OR REPLACE FUNCTION app.advance_final_account_draft(
 p_tenant uuid,p_draft uuid,p_revision uuid,p_number integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE head app.final_account_draft; candidate app.final_account_revision; actor_id uuid;
BEGIN
 actor_id:=app.current_actor();
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM app.current_tenant()
  OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM app.membership m WHERE m.tenant_id=p_tenant AND m.id=actor_id
  AND m.role='owner' AND m.revoked_at IS NULL
  AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp());
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_draft IS NULL OR p_revision IS NULL OR p_number IS NULL OR p_number<1 THEN
  RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_REVISION' USING ERRCODE='22023';
 END IF;
 SELECT * INTO head FROM app.final_account_draft
  WHERE tenant_id=p_tenant AND id=p_draft FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job j WHERE j.tenant_id=p_tenant AND j.id=head.job_id AND j.status='live') THEN
  RAISE EXCEPTION 'FROZEN_BASELINE_REQUIRED' USING ERRCODE='42501';
 END IF;
 SELECT r.* INTO candidate FROM app.final_account_revision r
  WHERE r.tenant_id=p_tenant AND r.job_id=head.job_id AND r.final_account_draft_id=head.id
   AND r.id=p_revision AND r.revision=p_number;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_REVISION' USING ERRCODE='22023'; END IF;
 -- An exact retry is harmless. Rewind, skipped numbers and a branch off a
 -- different parent must never move the authoritative current pointer.
 IF head.current_revision_id=p_revision AND head.revision=p_number THEN RETURN; END IF;
 IF p_number<>head.revision+1 OR candidate.previous_revision_id IS DISTINCT FROM head.current_revision_id THEN
  RAISE EXCEPTION 'STALE_FINAL_ACCOUNT_REVISION' USING ERRCODE='40001';
 END IF;
 UPDATE app.final_account_draft SET current_revision_id=p_revision,revision=p_number,
  updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_draft;
END $$;
REVOKE ALL ON FUNCTION app.advance_final_account_draft(uuid,uuid,uuid,integer) FROM PUBLIC;
-- Forward fix only: restoring direct billing INSERT or the unguarded pointer
-- routine would reopen authorization bypasses. Repair callers, never regrant.
COMMIT;
