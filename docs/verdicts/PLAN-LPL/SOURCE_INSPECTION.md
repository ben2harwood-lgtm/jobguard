# PLAN-LPL merged-source inspection

Read-only `git show origin/main:<path>` at `ec6ad4d2a411bf058cb1f107419d68da9fdffc05`. Selected declarations only; not a live catalogue or executed attack. No credential values copied.

## packages/db/migrations/0000_tenancy.sql

- Line 82: `GRANT SELECT, INSERT, UPDATE, DELETE ON app.account, app.membership TO jobguard_runtime;`

## packages/db/migrations/0001_audit.sql

- Line 89: `GRANT EXECUTE ON FUNCTION app.lock_audit_head(), app.advance_audit_head(bigint, char(64)) TO jobguard_runtime;`
- Line 91: `GRANT SELECT, INSERT ON app.audit_event TO jobguard_runtime;`

## packages/db/migrations/0003_job_spine.sql

- Line 121: `GRANT EXECUTE ON FUNCTION app.transition_job(uuid,uuid,integer,varchar,varchar,uuid,bigint,varchar,bigint) TO jobguard_runtime;`

## packages/db/migrations/0005_commands.sql

- Line 79: `GRANT UPDATE (revoked_at) ON app.action_authorization TO jobguard_runtime;`
- Line 80: `GRANT UPDATE (status,result,completed_at) ON app.command_receipt TO jobguard_runtime;`

## packages/db/migrations/0012_job_activation.sql

- Line 67: `DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['job_activation','cap_snapshot','synthetic_obligation','simulated_settlement_event'] LOOP EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);END LOOP;END $$;`

## packages/db/migrations/0020_job_import.sql

- Line 30: `CREATE FUNCTION app.guard_imported_job() RETURNS trigger LANGUAGE plpgsql AS $$`
- Line 32: `IF NEW.provenance='imported' AND current_setting('app.import_command',true)<>'enabled' THEN`
- Line 46: `PERFORM set_config('app.import_command','enabled',true);`

## packages/db/migrations/0027_uiwire10_customer_invoice.sql

- Line 52: `GRANT EXECUTE ON FUNCTION app.issue_practice_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,date) TO jobguard_runtime;`

## packages/db/migrations/0028_uiwire11_credit_notes.sql

- Line 14: `GRANT SELECT,INSERT ON app.customer_credit_note_sequence TO jobguard_runtime;`

## packages/db/migrations/0095_job_parties.sql

- Line 281: `PERFORM set_config('app.import_command','enabled',true);`

## packages/db/migrations/0120_enterprise_identity.sql

- Line 242: `INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)`

## packages/db/migrations/0128_shadow_persistence.sql

- Line 214: `INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)`

## packages/db/migrations/0132_final_account_lock.sql

- Line 74: `EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);`
- Line 142: `INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)`

## packages/db/migrations/0136_recovery_allocation.sql

- Line 111: `EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);`

## packages/db/migrations/0137_scim_deactivation.sql

- Line 78: `UPDATE app.membership SET revoked_at=changed_at WHERE tenant_id=t AND id=ANY(target_ids) AND revoked_at IS NULL;`
- Line 98: `GRANT EXECUTE ON FUNCTION identity.scim_deactivate(uuid,jsonb) TO jobguard_identity;`

## packages/db/migrations/0138_practice_session_hardening.sql

- Line 68: `GRANT EXECUTE ON FUNCTION app.revoke_contractor_practice_session(uuid) TO jobguard_runtime;`


## Additional inspected declaration lines

- `packages/db/migrations/0005_commands.sql:76`: `EXECUTE format('GRANT SELECT, INSERT ON app.%I TO jobguard_runtime',n);`
- `packages/db/migrations/0012_job_activation.sql:71`: `REVOKE ALL ON FUNCTION app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,varchar,varchar,varchar,uuid,timestamptz),app.record_simulated_settlement(uuid,uuid,uuid,varchar,bigint,timestamptz) FROM PUBLIC;`
- `packages/db/migrations/0012_job_activation.sql:72`: `GRANT EXECUTE ON FUNCTION app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,varchar,varchar,varchar,uuid,timestamptz),app.record_simulated_settlement(uuid,uuid,uuid,varchar,bigint,timestamptz) TO jobguard_runtime;`
- `packages/db/migrations/0017_customer_billing.sql:8`: `DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['customer_invoice_sequence','customer_invoice','customer_invoice_evidence','customer_credit_note','customer_payment','customer_payment_reversal'] LOOP EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',t);EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',t);EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',t);END LOOP;END$$;`
- `packages/db/migrations/0134_recovery_case_terms.sql:12`: `approved_at timestamptz NOT NULL DEFAULT transaction_timestamp(),`
- `packages/db/migrations/0134_recovery_case_terms.sql:31`: `BEGIN NEW.approved_at:=transaction_timestamp(); RETURN NEW; END $$;`
- `packages/db/migrations/0134_recovery_case_terms.sql:61`: `AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())`
- `packages/db/migrations/0134_recovery_case_terms.sql:63`: `AND a.policy_version='reference_fee_policy_v3' AND a.expires_at>clock_timestamp() AND a.revoked_at IS NULL AND r.resolution='approved' AND d.subject_type='recovery_case' AND d.subject_ref=p_case::text)`
- `packages/db/migrations/0008_review.sql:46`: `DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['proposal_review','proposal_review_line','proposal_review_line_parent','proposal_review_question'] LOOP`
- `packages/db/migrations/0008_review.sql:50`: `EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON app.%I TO jobguard_runtime',n);`
- `packages/db/migrations/0002_evidence.sql:100`: `GRANT SELECT, INSERT, UPDATE ON app.evidence_upload TO jobguard_runtime;`
- `packages/db/migrations/0003_job_spine.sql:113`: `GRANT UPDATE (state,dismissal_reason) ON app.proposal_line TO jobguard_runtime;`
- `packages/db/migrations/0003_job_spine.sql:114`: `GRANT UPDATE (state) ON app.scope_identity TO jobguard_runtime;`
