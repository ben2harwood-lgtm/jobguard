-- LP-13 RED: only the five traced low-value paths. Forward fix; no history rewrite.
BEGIN;
-- Reuse the private checked lifecycle claim instead of a second reservation table.
-- A claim cannot commit without the invoice, audit and outbox proof (LP-5).
ALTER TABLE app.command_lifecycle_claim ADD COLUMN reserved_invoice_number bigint
 CHECK (reserved_invoice_number IS NULL OR reserved_invoice_number > 0);
GRANT EXECUTE ON FUNCTION app.current_actor(),app.current_tenant() TO jobguard_command_writer;
GRANT EXECUTE ON FUNCTION app.current_tenant() TO jobguard_migration;
GRANT SELECT,INSERT ON app.customer_invoice_sequence TO jobguard_command_writer;
GRANT UPDATE(next_number) ON app.customer_invoice_sequence TO jobguard_command_writer;
CREATE POLICY lp13_invoice_number ON app.customer_invoice_sequence FOR ALL TO jobguard_command_writer
 USING(tenant_id=app.current_tenant()) WITH CHECK(tenant_id=app.current_tenant());

-- Latest definition: 0017. Keep the public signature; allocate once per checked,
-- same-actor invoice command in this transaction. Standalone burning is refused.
CREATE OR REPLACE FUNCTION app.reserve_customer_invoice_number(p_tenant uuid) RETURNS bigint
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE n bigint; claim app.command_lifecycle_claim; actor uuid;
BEGIN
 IF p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 actor:=app.current_actor();
 BEGIN
  SELECT c.* INTO STRICT claim FROM app.command_lifecycle_claim c
   JOIN app.command_receipt r ON (r.tenant_id,r.command_id)=(c.tenant_id,c.command_id)
   JOIN app.action_authorization a ON (a.tenant_id,a.id)=(c.tenant_id,c.authorization_id)
   JOIN app.decision_resolution d ON (d.tenant_id,d.id)=(a.tenant_id,a.resolution_id)
   JOIN app.membership m ON (m.tenant_id,m.id)=(c.tenant_id,c.actor_membership_id)
   WHERE c.tenant_id=p_tenant AND c.actor_membership_id=actor AND r.actor_membership_id=actor
    AND c.transaction_id=pg_current_xact_id() AND r.command_type='customer_invoice.issue'
    AND r.status='processing' AND c.version='command.v1'
    AND a.actor_membership_id=actor AND d.actor_membership_id=actor AND d.resolution='approved'
    AND a.action_type='final_account.issue' AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp()
    AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   FOR UPDATE OF c;
 EXCEPTION WHEN no_data_found OR too_many_rows THEN
  RAISE EXCEPTION 'INVOICE_COMMAND_REQUIRED' USING ERRCODE='42501';
 END;
 IF claim.reserved_invoice_number IS NOT NULL THEN RETURN claim.reserved_invoice_number; END IF;
 INSERT INTO app.customer_invoice_sequence(id,tenant_id,next_number) VALUES(gen_random_uuid(),p_tenant,2)
  ON CONFLICT(tenant_id) DO UPDATE SET next_number=app.customer_invoice_sequence.next_number+1
  RETURNING next_number-1 INTO n;
 UPDATE app.command_lifecycle_claim SET reserved_invoice_number=n
  WHERE tenant_id=p_tenant AND command_id=claim.command_id;
 RETURN n;
END $$;
GRANT CREATE ON SCHEMA app TO jobguard_command_writer;
ALTER FUNCTION app.reserve_customer_invoice_number(uuid) OWNER TO jobguard_command_writer;
REVOKE CREATE ON SCHEMA app FROM jobguard_command_writer;
REVOKE ALL ON FUNCTION app.reserve_customer_invoice_number(uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
-- Existing runtime EXECUTE is preserved; no new runtime write privilege.

-- Latest definition: 0003. Progress is operational; there is no actor field to
-- turn into attribution and no commercial write in this routine.
CREATE OR REPLACE FUNCTION app.transition_scope_progress(p_tenant uuid,p_job uuid,p_scope uuid,p_expected integer,p_to varchar,p_reason varchar)
RETURNS app.scope_progress LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE current_progress app.scope_progress; BEGIN
 IF p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT * INTO current_progress FROM app.scope_progress WHERE tenant_id=p_tenant AND job_id=p_job AND scope_item_id=p_scope FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope progress not found' USING ERRCODE='P0002'; END IF;
 IF current_progress.revision<>p_expected THEN RAISE EXCEPTION 'expected revision conflict' USING ERRCODE='40001'; END IF;
 IF NOT ((current_progress.stage='not_started' AND p_to='in_progress' AND p_reason='start') OR
  (current_progress.stage='in_progress' AND p_to='complete' AND p_reason='complete') OR
  (current_progress.stage='complete' AND p_to='in_progress' AND p_reason='rework'))
 THEN RAISE EXCEPTION 'illegal progress transition' USING ERRCODE='22023'; END IF;
 UPDATE app.scope_progress SET stage=p_to,revision=revision+1,updated_at=transaction_timestamp()
 WHERE tenant_id=p_tenant AND job_id=p_job AND scope_item_id=p_scope RETURNING * INTO current_progress; RETURN current_progress;
END $$;

-- 0053 already writes NULL raiser / legacy_unrecorded, never a named actor.
-- 0456 already calls sso_load_connection before sso_audit_append seals anything.
-- 0095's 13-argument adoption always refuses; 0356 withdrew runtime EXECUTE.
-- Preserve these closures instead of reintroducing or copying obsolete bodies.
COMMIT;
