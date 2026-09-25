BEGIN;
-- Synthetic facts are kept separately from qualifying receipts and accounting.
CREATE TABLE app.practice_feed_account (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, session_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, environment text NOT NULL CHECK(environment='synthetic_demo'),
 scenario text NOT NULL CHECK(scenario='recovery-18800'), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id), UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.practice_feed_command (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, account_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), action text NOT NULL CHECK(action IN('connect','advance','disconnect','reconcile_duplicate')),
 scenario text CHECK(scenario IN('pending_384','settled_384','replay_event','page_overlap','alternate_representation','unknown_duplicate')),
 actor_membership_id uuid NOT NULL, payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 environment text NOT NULL CHECK(environment='synthetic_demo'), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,account_id,revision), UNIQUE(tenant_id,job_id,account_id,id),
 FOREIGN KEY(tenant_id,job_id,account_id) REFERENCES app.practice_feed_account(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK((action='advance')=(scenario IS NOT NULL))
);
CREATE TABLE app.practice_feed_event (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, account_id uuid NOT NULL, command_id uuid NOT NULL,
 event_id text NOT NULL CHECK(event_id IN('pending-384','settled-384','statement-384','unknown-384')),
 underlying_movement_id text NOT NULL CHECK(underlying_movement_id IN('receipt-384','unresolved-384')),
 representation_id text NOT NULL CHECK(representation_id IN('feed-384','statement-line-384','unidentified-line-384')),
 gross_pence bigint NOT NULL CHECK(gross_pence=38400), currency char(3) NOT NULL CHECK(currency='GBP'),
 state text NOT NULL CHECK(state IN('pending','settled','possible_duplicate')),
 environment text NOT NULL CHECK(environment='synthetic_demo'), version text NOT NULL CHECK(version='practice-feed-event.v1'),
 source_hash char(64) NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,account_id,event_id),
 FOREIGN KEY(tenant_id,job_id,account_id,command_id) REFERENCES app.practice_feed_command(tenant_id,job_id,account_id,id)
);
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['practice_feed_account','practice_feed_command','practice_feed_event'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime',n);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
END LOOP; END $$;

-- SECURITY INVOKER throughout: triggers never bypass FORCE RLS or grant business writes.
CREATE FUNCTION app.guard_practice_feed_account() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR
    NEW.session_id IS DISTINCT FROM nullif(current_setting('app.practice_feed_session',true),'')::uuid OR
    current_setting('app.practice_feed_environment',true) IS DISTINCT FROM 'synthetic_demo' OR
    NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.actor_membership_id AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>transaction_timestamp())) OR
    EXISTS(SELECT 1 FROM app.job_activation a WHERE a.tenant_id=NEW.tenant_id AND a.job_id=NEW.job_id AND a.mode<>'synthetic_demo')
 THEN RAISE EXCEPTION 'PRACTICE_FEED_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER practice_feed_account_guard BEFORE INSERT ON app.practice_feed_account FOR EACH ROW EXECUTE FUNCTION app.guard_practice_feed_account();

CREATE FUNCTION app.guard_practice_feed_command() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE a app.practice_feed_account; last_revision integer;
BEGIN
 PERFORM 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.job_id::text));
 SELECT * INTO a FROM app.practice_feed_account WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.account_id;
 IF NOT FOUND OR a.session_id IS DISTINCT FROM nullif(current_setting('app.practice_feed_session',true),'')::uuid OR
    current_setting('app.practice_feed_environment',true) IS DISTINCT FROM 'synthetic_demo' OR NEW.actor_membership_id<>a.actor_membership_id OR
    NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.actor_membership_id AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>transaction_timestamp())) OR
    EXISTS(SELECT 1 FROM app.job_activation j WHERE j.tenant_id=NEW.tenant_id AND j.job_id=NEW.job_id AND j.mode<>'synthetic_demo')
 THEN RAISE EXCEPTION 'PRACTICE_FEED_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(max(revision),0) INTO last_revision FROM app.practice_feed_command WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id;
 IF NEW.revision<>last_revision+1 THEN RAISE EXCEPTION 'PRACTICE_FEED_STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF (NEW.action='connect')<>(last_revision=0) THEN RAISE EXCEPTION 'PRACTICE_FEED_INVALID_TRANSITION'; END IF;
 IF EXISTS(SELECT 1 FROM app.practice_feed_command WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id AND action='disconnect') THEN RAISE EXCEPTION 'PRACTICE_FEED_DISCONNECTED'; END IF;
 IF NEW.action='reconcile_duplicate' AND (NOT EXISTS(SELECT 1 FROM app.practice_feed_event WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id AND event_id='unknown-384') OR NOT EXISTS(SELECT 1 FROM app.practice_feed_event WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id AND underlying_movement_id='receipt-384')) THEN RAISE EXCEPTION 'PRACTICE_FEED_DUPLICATE_NOT_FOUND'; END IF;
 IF NEW.scenario IN('replay_event','alternate_representation','unknown_duplicate') AND NOT EXISTS(SELECT 1 FROM app.practice_feed_event WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id AND event_id='settled-384') THEN RAISE EXCEPTION 'PRACTICE_FEED_SETTLEMENT_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER practice_feed_command_guard BEFORE INSERT ON app.practice_feed_command FOR EACH ROW EXECUTE FUNCTION app.guard_practice_feed_command();

CREATE FUNCTION app.guard_practice_feed_event() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE c app.practice_feed_command; a app.practice_feed_account;
BEGIN
 SELECT * INTO c FROM app.practice_feed_command WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND account_id=NEW.account_id AND id=NEW.command_id;
 IF NOT FOUND OR c.action<>'advance' THEN RAISE EXCEPTION 'PRACTICE_FEED_EVENT_INVALID' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM app.practice_feed_account WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.account_id;
 IF a.session_id IS DISTINCT FROM nullif(current_setting('app.practice_feed_session',true),'')::uuid OR current_setting('app.practice_feed_environment',true) IS DISTINCT FROM 'synthetic_demo' OR
    NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=NEW.tenant_id AND m.id=a.actor_membership_id AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>transaction_timestamp())) OR
    EXISTS(SELECT 1 FROM app.job_activation j WHERE j.tenant_id=NEW.tenant_id AND j.job_id=NEW.job_id AND j.mode<>'synthetic_demo') OR
    c.revision<>(SELECT max(revision) FROM app.practice_feed_command WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id) OR
    EXISTS(SELECT 1 FROM app.practice_feed_command WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id AND action='disconnect')
 THEN RAISE EXCEPTION 'PRACTICE_FEED_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT ((c.scenario IN('pending_384','page_overlap') AND NEW.event_id='pending-384' AND NEW.state='pending' AND NEW.underlying_movement_id='receipt-384' AND NEW.representation_id='feed-384') OR
         (c.scenario IN('settled_384','replay_event','page_overlap') AND NEW.event_id='settled-384' AND NEW.state='settled' AND NEW.underlying_movement_id='receipt-384' AND NEW.representation_id='feed-384') OR
         (c.scenario='alternate_representation' AND NEW.event_id='statement-384' AND NEW.state='settled' AND NEW.underlying_movement_id='receipt-384' AND NEW.representation_id='statement-line-384') OR
         (c.scenario='unknown_duplicate' AND NEW.event_id='unknown-384' AND NEW.state='possible_duplicate' AND NEW.underlying_movement_id='unresolved-384' AND NEW.representation_id='unidentified-line-384'))
 THEN RAISE EXCEPTION 'PRACTICE_FEED_EVENT_INVALID' USING ERRCODE='42501'; END IF;
 -- Integrity hash, not a signature. The adapter envelope authority is its exact
 -- command/scenario/account/session validation above, never an amount from UI.
 IF NEW.source_hash<>encode(sha256(convert_to(concat_ws('|',NEW.version,NEW.environment,NEW.tenant_id::text,NEW.job_id::text,NEW.account_id::text,NEW.event_id,NEW.underlying_movement_id,NEW.representation_id,NEW.gross_pence::text,NEW.currency,NEW.state),'UTF8')),'hex') THEN RAISE EXCEPTION 'PRACTICE_FEED_EVENT_INVALID' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER practice_feed_event_guard BEFORE INSERT ON app.practice_feed_event FOR EACH ROW EXECUTE FUNCTION app.guard_practice_feed_event();

CREATE FUNCTION app.require_practice_feed_audit() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=NEW.tenant_id AND subject_ref=NEW.job_id::text AND actor_ref='synthetic-session:'||current_setting('app.practice_feed_session',true) AND event_type='practice_feed.'||NEW.action AND payload->'references'->>'commandId'=NEW.id::text AND payload->'hashes'->>'command'=NEW.payload_hash::text)
 THEN RAISE EXCEPTION 'PRACTICE_FEED_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER practice_feed_command_audit AFTER INSERT ON app.practice_feed_command DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_practice_feed_audit();
CREATE FUNCTION app.require_practice_feed_connection() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.practice_feed_command WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND account_id=NEW.id AND actor_membership_id=NEW.actor_membership_id AND revision=1 AND action='connect')
 THEN RAISE EXCEPTION 'PRACTICE_FEED_CONNECTION_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER practice_feed_account_connection AFTER INSERT ON app.practice_feed_account DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_practice_feed_connection();
ALTER FUNCTION app.require_practice_feed_connection() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_practice_feed_connection() FROM PUBLIC,jobguard_runtime;
ALTER FUNCTION app.guard_practice_feed_account() OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_practice_feed_command() OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_practice_feed_event() OWNER TO jobguard_migration;
ALTER FUNCTION app.require_practice_feed_audit() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_practice_feed_account(),app.guard_practice_feed_command(),app.guard_practice_feed_event(),app.require_practice_feed_audit() FROM PUBLIC,jobguard_runtime;
COMMIT;
