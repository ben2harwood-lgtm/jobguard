BEGIN;
CREATE TABLE app.action_outbox (
 id uuid NOT NULL, tenant_id uuid NOT NULL, authorization_id uuid NOT NULL,
 adapter varchar(60) NOT NULL CHECK (adapter LIKE 'fake_%'), provider_effect_key varchar(300) NOT NULL,
 action_type varchar(100) NOT NULL, recipient varchar(320), content_hash char(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 immutable_content text NOT NULL, aggregate_revision integer NOT NULL CHECK(aggregate_revision>=0),
 amount_pence bigint, currency char(3), policy_version varchar(80) NOT NULL, authorization_expires_at timestamptz NOT NULL,
 status varchar(24) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','executing','succeeded','retryable','outcome_unknown','dead_letter','cancelled')),
 next_attempt_at timestamptz NOT NULL DEFAULT transaction_timestamp(), claimed_at timestamptz, completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,provider_effect_key),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id),
 CHECK ((amount_pence IS NULL AND currency IS NULL) OR (amount_pence IS NOT NULL AND amount_pence>=0 AND currency='GBP'))
);
CREATE TABLE app.action_attempt (
 id uuid NOT NULL, tenant_id uuid NOT NULL, action_id uuid NOT NULL, attempt_number integer NOT NULL CHECK(attempt_number>0),
 outcome varchar(24) NOT NULL CHECK(outcome IN ('started','succeeded','retryable','outcome_unknown','failed','reconciled')),
 provider_reference varchar(300), error_code varchar(100), started_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,action_id,attempt_number),
 FOREIGN KEY(tenant_id,action_id) REFERENCES app.action_outbox(tenant_id,id)
);
CREATE TABLE app.provider_event_inbox (
 id uuid NOT NULL, tenant_id uuid NOT NULL, adapter varchar(60) NOT NULL CHECK(adapter LIKE 'fake_%'), provider_event_id varchar(300) NOT NULL,
 provider_effect_key varchar(300) NOT NULL, event_kind varchar(100) NOT NULL, occurred_at timestamptz NOT NULL,
 payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'), signature_verified boolean NOT NULL,
 processing_status varchar(20) NOT NULL DEFAULT 'pending' CHECK(processing_status IN ('pending','applied','ignored','failed')),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(), processed_at timestamptz,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,adapter,provider_event_id), UNIQUE(tenant_id,adapter,provider_effect_key,event_kind)
);
CREATE SCHEMA IF NOT EXISTS infrastructure AUTHORIZATION jobguard_migration;
CREATE TABLE infrastructure.outbox_signal(action_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), enqueued_at timestamptz);
ALTER TABLE infrastructure.outbox_signal OWNER TO jobguard_migration;
GRANT USAGE ON SCHEMA infrastructure TO jobguard_infrastructure;
GRANT SELECT,UPDATE ON infrastructure.outbox_signal TO jobguard_infrastructure;
CREATE FUNCTION app.signal_outbox() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,infrastructure AS $$ BEGIN INSERT INTO infrastructure.outbox_signal(action_id,tenant_id) VALUES(NEW.id,NEW.tenant_id) ON CONFLICT DO NOTHING; RETURN NEW; END $$;
CREATE TRIGGER action_outbox_signal AFTER INSERT ON app.action_outbox FOR EACH ROW EXECUTE FUNCTION app.signal_outbox();
ALTER FUNCTION app.signal_outbox() OWNER TO jobguard_migration;
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['action_outbox','action_attempt','provider_event_inbox'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n); EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n); EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n); EXECUTE format('REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);
 END LOOP; END $$;
GRANT UPDATE(status,next_attempt_at,claimed_at,completed_at,updated_at) ON app.action_outbox TO jobguard_runtime;
GRANT UPDATE(outcome,provider_reference,error_code,finished_at) ON app.action_attempt TO jobguard_runtime;
GRANT UPDATE(processing_status,processed_at) ON app.provider_event_inbox TO jobguard_runtime;
COMMIT;
