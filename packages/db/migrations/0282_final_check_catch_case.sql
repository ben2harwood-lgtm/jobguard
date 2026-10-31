BEGIN;
-- SV-5 Q2 (Ben, 28 Oct): the missed_variation_final_account case is created only when the builder
-- confirms a positive price for a jobguard_catch variation, and it carries no claim until the customer
-- approves that variation. Only these two checked triggers can create such a case or its claim.

-- Restated from 0238 with one exception: the catch-case trigger below marks its own insert.
CREATE OR REPLACE FUNCTION app.final_check_refuse_held_case() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 -- The setting alone is forgeable by any session; only the migration-owned definer trigger below runs as jobguard_migration.
 IF NEW.case_type='missed_variation_final_account' AND (current_user<>'jobguard_migration' OR current_setting('app.final_check_catch_case',true) IS DISTINCT FROM NEW.id::text) THEN RAISE EXCEPTION 'FINAL_CHECK_CONFIRMATION_HELD' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;

-- Builder's priced approval: the first positive priced revision of a catch opens its case, state identified, no claim.
CREATE FUNCTION app.final_check_open_catch_case() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE o app.extra_origin;case_id uuid:=gen_random_uuid();refs jsonb;
BEGIN
 SELECT * INTO o FROM app.extra_origin WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND variation_id=NEW.variation_id;
 IF o.kind IS DISTINCT FROM 'jobguard_catch' OR NEW.signed_delta_pence<=0 THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM app.recovery_case WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_type='missed_variation_final_account' AND source_refs ? ('variation:'||NEW.variation_id::text)) THEN RETURN NULL; END IF;
 refs:=jsonb_build_array('variation:'||NEW.variation_id::text,'revision:'||NEW.id::text,'signal:'||o.source_signal_id::text);
 PERFORM set_config('app.final_check_catch_case',case_id::text,true);
 INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs)
 VALUES(case_id,NEW.tenant_id,NEW.job_id,NEW.signed_delta_pence,'GBP','identified',0,true,'missed_variation_final_account','Synthetic customer','builder_customer','customer_invoice',refs);
 PERFORM set_config('app.final_check_catch_case','',true);
 INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash)
 VALUES(gen_random_uuid(),NEW.tenant_id,NEW.job_id,case_id,1,'opened',NULL,'identified','membership:'||NEW.confirmed_by_membership_id::text,NEW.id,
  app.final_lock_hash(jsonb_build_object('caseId',case_id,'variationRevisionId',NEW.id,'sourceRefs',refs)));
 RETURN NULL;
END $$;
ALTER FUNCTION app.final_check_open_catch_case() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_open_catch_case() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
CREATE TRIGGER final_check_catch_case_open AFTER INSERT ON app.variation_revision FOR EACH ROW EXECUTE FUNCTION app.final_check_open_catch_case();

-- Claims on catch cases: only the customer-approval trigger below (definer, migration-owned) may add one.
CREATE FUNCTION app.final_check_refuse_catch_claim() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF current_user<>'jobguard_migration' AND EXISTS(SELECT 1 FROM app.recovery_case c WHERE c.tenant_id=NEW.tenant_id AND c.id=NEW.case_id AND c.case_type='missed_variation_final_account')
 THEN RAISE EXCEPTION 'FINAL_CHECK_CONFIRMATION_HELD' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.final_check_refuse_catch_claim() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_refuse_catch_claim() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
CREATE TRIGGER final_check_catch_claim_guard BEFORE INSERT ON app.recovery_claim_revision FOR EACH ROW EXECUTE FUNCTION app.final_check_refuse_catch_claim();

-- Customer approval: the approved positive amount becomes the case's first claim revision.
CREATE FUNCTION app.final_check_claim_catch_case() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE o app.extra_origin;c app.recovery_case;
BEGIN
 SELECT * INTO o FROM app.extra_origin WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND variation_id=NEW.variation_id;
 IF o.kind IS DISTINCT FROM 'jobguard_catch' OR NEW.signed_delta_pence<=0 THEN RETURN NULL; END IF;
 SELECT * INTO c FROM app.recovery_case WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_type='missed_variation_final_account' AND source_refs ? ('variation:'||NEW.variation_id::text);
 IF c.id IS NULL OR EXISTS(SELECT 1 FROM app.recovery_claim_revision WHERE tenant_id=NEW.tenant_id AND case_id=c.id) THEN RETURN NULL; END IF;
 INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash)
 VALUES(gen_random_uuid(),NEW.tenant_id,NEW.job_id,c.id,1,NEW.signed_delta_pence,'GBP','membership:'||NEW.actor_membership_id::text,
  app.final_lock_hash(jsonb_build_object('caseId',c.id,'revision',1,'claimedNetPence',NEW.signed_delta_pence,'variationApprovalId',NEW.id)));
 RETURN NULL;
END $$;
ALTER FUNCTION app.final_check_claim_catch_case() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_claim_catch_case() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
CREATE TRIGGER final_check_catch_case_claim AFTER INSERT ON app.variation_approval FOR EACH ROW EXECUTE FUNCTION app.final_check_claim_catch_case();
COMMIT;
