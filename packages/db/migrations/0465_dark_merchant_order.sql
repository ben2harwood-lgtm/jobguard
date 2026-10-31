BEGIN;
-- Forward fix: retain facts and disable the unregistered dark seam; never erase attestations.
ALTER TABLE app.watchdog_command_identity DROP CONSTRAINT watchdog_command_identity_command_type_check;
ALTER TABLE app.watchdog_command_identity ADD CONSTRAINT watchdog_command_identity_command_type_check CHECK(command_type IN(
 'readiness.record','readiness.advance','things_to_check.evaluate','things_to_check.review','things_to_check.supersede',
 'supplier_match.create','supplier_match.correct','inbox.seed','inbox.dismiss','purchase_order.revise','purchase_order.place',
 'supplier_document.intake','supplier_document.receipt','supplier_document.confirm','evidence.begin_upload','evidence.finalize','proof.complete',
 'WorkState.resume','WorkState.finish','WorkState.cancel_finish','WorkState.close','WorkState.reopen','WorkState.link',
 'JobSource.diary','JobSource.customer_message','purchase_order.attest_manual'));
-- Existing orders need no backfill. No old migration is changed.
CREATE UNIQUE INDEX purchase_order_revision_draft_identity
  ON app.purchase_order_revision(tenant_id,job_id,draft_id,id);
CREATE TABLE app.purchase_order_manual_attestation (
  id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, draft_id uuid NOT NULL,
  revision_id uuid NOT NULL, merchant_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
  command_id uuid NOT NULL, supplier_reference_hash char(64) NOT NULL CHECK(supplier_reference_hash ~ '^[a-f0-9]{64}$'),
  environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
  attested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,draft_id), UNIQUE(tenant_id,command_id),
  UNIQUE(tenant_id,merchant_id,supplier_reference_hash),
  FOREIGN KEY(tenant_id,job_id,draft_id,revision_id) REFERENCES app.purchase_order_revision(tenant_id,job_id,draft_id,id),
  FOREIGN KEY(tenant_id,merchant_id) REFERENCES app.merchant(tenant_id,id),
  FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
  FOREIGN KEY(tenant_id,command_id) REFERENCES app.watchdog_command_identity(tenant_id,command_id)
);
ALTER TABLE app.purchase_order_manual_attestation OWNER TO jobguard_migration;
ALTER TABLE app.purchase_order_manual_attestation ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.purchase_order_manual_attestation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.purchase_order_manual_attestation FOR ALL TO jobguard_runtime,jobguard_migration
  USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON app.purchase_order_manual_attestation TO jobguard_runtime;
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.purchase_order_manual_attestation FROM jobguard_runtime;

-- Existing draft writers share this lock with approval and executor claims.
-- Pending work may be superseded (the executor cancels it); an in-flight/unknown
-- or delivered order cannot be edited into a different effect or blindly resent.
CREATE FUNCTION app.guard_dark_order_revision() RETURNS trigger LANGUAGE plpgsql
  SET search_path=pg_catalog,app AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.job_id::text||':watchdog-command',0));
  IF EXISTS(SELECT 1 FROM app.purchase_order_placement p JOIN app.action_outbox o
    ON(o.tenant_id,o.id)=(p.tenant_id,p.outbox_action_id)
    WHERE p.tenant_id=NEW.tenant_id AND p.draft_id=NEW.draft_id AND o.adapter='fake_merchant_order'
      AND o.status IN('executing','outcome_unknown','succeeded')) THEN
    RAISE EXCEPTION 'ORDER_ALREADY_COMMITTED';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app.guard_dark_order_revision() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_dark_order_revision() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER guard_dark_order_revision BEFORE INSERT ON app.purchase_order_revision
  FOR EACH ROW EXECUTE FUNCTION app.guard_dark_order_revision();

CREATE FUNCTION app.guard_manual_order_effect() RETURNS trigger LANGUAGE plpgsql
  SET search_path=pg_catalog,app AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.job_id::text||':watchdog-command',0));
  IF TG_TABLE_NAME='purchase_order_placement' THEN
    IF EXISTS(SELECT 1 FROM app.purchase_order_manual_attestation a WHERE a.tenant_id=NEW.tenant_id AND a.draft_id=NEW.draft_id) THEN
      RAISE EXCEPTION 'ORDER_ALREADY_COMMITTED';
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM app.purchase_order_placement p WHERE p.tenant_id=NEW.tenant_id AND p.draft_id=NEW.draft_id) THEN
      RAISE EXCEPTION 'ORDER_ALREADY_COMMITTED';
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app.guard_manual_order_effect() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_manual_order_effect() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER guard_manual_order_effect BEFORE INSERT ON app.purchase_order_placement
  FOR EACH ROW EXECUTE FUNCTION app.guard_manual_order_effect();
CREATE TRIGGER guard_manual_order_effect BEFORE INSERT ON app.purchase_order_manual_attestation
  FOR EACH ROW EXECUTE FUNCTION app.guard_manual_order_effect();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.purchase_order_manual_attestation
  FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER b_watchdog_command_id_before_insert BEFORE INSERT ON app.purchase_order_manual_attestation
  FOR EACH ROW EXECUTE FUNCTION app.reserve_watchdog_command_id('purchase_order.attest_manual','command_id');
COMMIT;
