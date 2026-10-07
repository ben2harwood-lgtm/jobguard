BEGIN;
-- M4-7-S: provider-neutral synthetic practice feed of settled movement facts.
-- Everything here is simulated money. Nothing in this migration touches allocation, landing, fee or ledger tables,
-- and a settled movement is a fact only. The runtime role keeps SELECT/INSERT on append-only tables and no routine grant.

-- SBOX-SESSION-1 (0094) binds jobs to their creator at insertion. A feed owner row records that binding only:
-- another session, an unissued/expired session or an old unbound job cannot register or connect this feed.
CREATE TABLE app.practice_feed_job_owner (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, session_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id), UNIQUE(tenant_id,job_id,session_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);

CREATE TABLE app.practice_feed_account (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, session_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment='synthetic_demo'),
 provider text NOT NULL DEFAULT 'none' CHECK(provider='none'),
 consent_version text NOT NULL DEFAULT 'practice-feed-consent.v1' CHECK(consent_version='practice-feed-consent.v1'),
 consent_scope text NOT NULL DEFAULT 'read_generated_movements' CHECK(consent_scope='read_generated_movements'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id), UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,session_id) REFERENCES app.practice_feed_job_owner(tenant_id,job_id,session_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);

CREATE TABLE app.practice_feed_command (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, account_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 action text NOT NULL CHECK(action IN('connect','advance','reconcile_duplicate','match_receipt','disconnect')),
 movement_key text CHECK(movement_key IN('receipt-384','receipt-3000','receipt-41280','receipt-24000','receipt-17280','receipt-960','supplier-refund-540')),
 step text CHECK(step IN('pending','settled','replay','page_overlap','alternate_representation','unknown_duplicate')),
 payment_id uuid,
 actor_membership_id uuid NOT NULL,
 payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 environment text NOT NULL CHECK(environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,account_id,revision), UNIQUE(tenant_id,job_id,account_id,id),
 FOREIGN KEY(tenant_id,job_id,account_id) REFERENCES app.practice_feed_account(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 -- A receipt can only be matched to a payment recorded on this very job.
 FOREIGN KEY(tenant_id,job_id,payment_id) REFERENCES app.customer_payment(tenant_id,job_id,id),
 CHECK(
  (action IN('connect','disconnect') AND movement_key IS NULL AND step IS NULL AND payment_id IS NULL) OR
  (action='advance' AND movement_key IS NOT NULL AND step IS NOT NULL AND payment_id IS NULL) OR
  (action='reconcile_duplicate' AND movement_key IS NOT NULL AND step IS NULL AND payment_id IS NULL) OR
  (action='match_receipt' AND movement_key IN('receipt-384','receipt-3000','receipt-41280','receipt-24000','receipt-17280','receipt-960') AND step IS NULL AND payment_id IS NOT NULL)
 )
);

CREATE TABLE app.practice_feed_event (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, account_id uuid NOT NULL, command_id uuid NOT NULL,
 event_kind text NOT NULL CHECK(event_kind IN('pending','settled','statement','unknown')),
 movement_key text NOT NULL CHECK(movement_key IN('receipt-384','receipt-3000','receipt-41280','receipt-24000','receipt-17280','receipt-960','supplier-refund-540')),
 event_id text NOT NULL,
 identity text NOT NULL CHECK(identity IN('identified','unidentified')),
 representation_id text NOT NULL CHECK(representation_id IN('feed','statement-line','unidentified-line')),
 gross_pence bigint NOT NULL, currency char(3) NOT NULL CHECK(currency='GBP'),
 state text NOT NULL CHECK(state IN('pending','settled','possible_duplicate')),
 environment text NOT NULL CHECK(environment='synthetic_demo'),
 version text NOT NULL CHECK(version='practice-feed-event.v1'),
 source_hash char(64) NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,account_id,event_id),
 FOREIGN KEY(tenant_id,job_id,account_id,command_id) REFERENCES app.practice_feed_command(tenant_id,job_id,account_id,id),
 CHECK(event_id=event_kind||'-'||movement_key),
 -- The fixed catalogue amount, exact pence. A runtime role cannot insert any other amount for a movement.
 CHECK(gross_pence=CASE movement_key
  WHEN 'receipt-384' THEN 38400 WHEN 'receipt-3000' THEN 300000 WHEN 'receipt-41280' THEN 4128000
  WHEN 'receipt-24000' THEN 2400000 WHEN 'receipt-17280' THEN 1728000 WHEN 'receipt-960' THEN 96000
  WHEN 'supplier-refund-540' THEN 54000 END),
 CHECK((event_kind,state,identity,representation_id) IN(
  ('pending','pending','identified','feed'),('settled','settled','identified','feed'),
  ('statement','settled','identified','statement-line'),('unknown','possible_duplicate','unidentified','unidentified-line')))
);

-- A builder-attested receipt qualifies only through one row here: the receipt matched to one settled movement.
CREATE TABLE app.practice_feed_receipt_match (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, account_id uuid NOT NULL, command_id uuid NOT NULL,
 payment_id uuid NOT NULL,
 movement_key text NOT NULL CHECK(movement_key IN('receipt-384','receipt-3000','receipt-41280','receipt-24000','receipt-17280','receipt-960')),
 settled_event_id text NOT NULL,
 matched_pence bigint NOT NULL, currency char(3) NOT NULL CHECK(currency='GBP'),
 environment text NOT NULL CHECK(environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,payment_id), UNIQUE(tenant_id,account_id,movement_key), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,account_id,command_id) REFERENCES app.practice_feed_command(tenant_id,job_id,account_id,id),
 FOREIGN KEY(tenant_id,job_id,payment_id) REFERENCES app.customer_payment(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,account_id,settled_event_id) REFERENCES app.practice_feed_event(tenant_id,account_id,event_id),
 CHECK(matched_pence=CASE movement_key
  WHEN 'receipt-384' THEN 38400 WHEN 'receipt-3000' THEN 300000 WHEN 'receipt-41280' THEN 4128000
  WHEN 'receipt-24000' THEN 2400000 WHEN 'receipt-17280' THEN 1728000 WHEN 'receipt-960' THEN 96000 END)
);

DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['practice_feed_job_owner','practice_feed_account','practice_feed_command','practice_feed_event','practice_feed_receipt_match'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime',n);
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
 END LOOP;
END $$;

-- One SECURITY INVOKER guard for all five tables: it never bypasses FORCE RLS and grants no business write.
-- Every write must come from a live, session-owned account in the synthetic environment whose command carries the exact generated effect.
-- A job's activation mode is deliberately not a discriminator: the practice sandbox itself starts jobs as pilot_no_charge (no-charge scenario),
-- so the deployment environment setting is the authority, as for every other synthetic leaf.
CREATE FUNCTION app.guard_practice_feed() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE
 v_tenant uuid := nullif(current_setting('app.tenant_id',true),'')::uuid;
 v_session uuid := nullif(current_setting('app.practice_feed_session',true),'')::uuid;
 v_actor uuid;
 a app.practice_feed_account;
 c app.practice_feed_command;
 pay app.customer_payment;
 last_revision integer;
BEGIN
 IF v_tenant IS NULL OR v_session IS NULL OR NEW.tenant_id IS DISTINCT FROM v_tenant
    OR current_setting('app.practice_feed_environment',true) IS DISTINCT FROM 'synthetic_demo'
 THEN RAISE EXCEPTION 'PRACTICE_FEED_FORBIDDEN' USING ERRCODE='42501'; END IF;

 -- Before any feed effect, require a live server-issued session and its immutable creator/job binding.
 IF NOT EXISTS(
  SELECT 1 FROM app.job j
  JOIN app.authenticate_practice_session(encode(sha256(convert_to(v_session::text,'UTF8')),'hex')) p ON p.tenant_id=j.tenant_id
  WHERE j.tenant_id=NEW.tenant_id AND j.id=NEW.job_id
   AND j.practice_session_digest=encode(sha256(convert_to(v_session::text,'UTF8')),'hex')
 ) THEN RAISE EXCEPTION 'PRACTICE_FEED_NOT_FOUND' USING ERRCODE='42501'; END IF;

 IF TG_TABLE_NAME='practice_feed_job_owner' THEN
  v_actor := NEW.actor_membership_id;
  PERFORM 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=v_actor FOR SHARE;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.job_id::text));
  IF NEW.session_id IS DISTINCT FROM v_session
     OR NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=NEW.tenant_id AND m.id=v_actor AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()))
  THEN RAISE EXCEPTION 'PRACTICE_FEED_FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;

 IF TG_TABLE_NAME='practice_feed_account' THEN
  v_actor := NEW.actor_membership_id;
  IF NEW.session_id IS DISTINCT FROM v_session
     OR NOT EXISTS(SELECT 1 FROM app.practice_feed_job_owner o WHERE o.tenant_id=NEW.tenant_id AND o.job_id=NEW.job_id AND o.session_id=NEW.session_id)
     OR NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=NEW.tenant_id AND m.id=v_actor AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()))
  THEN RAISE EXCEPTION 'PRACTICE_FEED_FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;

 IF TG_TABLE_NAME='practice_feed_command' THEN
  PERFORM 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id FOR SHARE;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.job_id::text));
 END IF;

 SELECT * INTO a FROM app.practice_feed_account WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.account_id;
 IF NOT FOUND OR a.session_id IS DISTINCT FROM v_session
    OR NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=NEW.tenant_id AND m.id=a.actor_membership_id AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()))
 THEN RAISE EXCEPTION 'PRACTICE_FEED_FORBIDDEN' USING ERRCODE='42501'; END IF;

 IF TG_TABLE_NAME='practice_feed_command' THEN
  IF NEW.actor_membership_id IS DISTINCT FROM a.actor_membership_id THEN RAISE EXCEPTION 'PRACTICE_FEED_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT coalesce(max(revision),0) INTO last_revision FROM app.practice_feed_command WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id;
  IF NEW.revision<>last_revision+1 THEN RAISE EXCEPTION 'PRACTICE_FEED_STALE_REVISION' USING ERRCODE='40001'; END IF;
  IF (NEW.action='connect')<>(last_revision=0) THEN RAISE EXCEPTION 'PRACTICE_FEED_INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM app.practice_feed_command WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id AND action='disconnect')
  THEN RAISE EXCEPTION 'PRACTICE_FEED_DISCONNECTED' USING ERRCODE='23514'; END IF;
  IF NEW.action='advance' AND NEW.step IN('replay','alternate_representation','unknown_duplicate')
     AND NOT EXISTS(SELECT 1 FROM app.practice_feed_event WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id AND movement_key=NEW.movement_key AND state='settled' AND identity='identified')
  THEN RAISE EXCEPTION 'PRACTICE_FEED_SETTLEMENT_REQUIRED' USING ERRCODE='23514'; END IF;
  IF NEW.action='reconcile_duplicate' AND NOT (
      EXISTS(SELECT 1 FROM app.practice_feed_event WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id AND movement_key=NEW.movement_key AND identity='unidentified')
      AND EXISTS(SELECT 1 FROM app.practice_feed_event WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id AND movement_key=NEW.movement_key AND state='settled' AND identity='identified')
      AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id AND action='reconcile_duplicate' AND movement_key=NEW.movement_key))
  THEN RAISE EXCEPTION 'PRACTICE_FEED_DUPLICATE_NOT_FOUND' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;

 -- Event and receipt-match rows must belong to the account's latest command and still be on a live, connected feed.
 SELECT * INTO c FROM app.practice_feed_command WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND account_id=NEW.account_id AND id=NEW.command_id;
 IF NOT FOUND
    OR c.revision<>(SELECT max(revision) FROM app.practice_feed_command WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id)
    OR EXISTS(SELECT 1 FROM app.practice_feed_command WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id AND action='disconnect')
 THEN RAISE EXCEPTION 'PRACTICE_FEED_FORBIDDEN' USING ERRCODE='42501'; END IF;

 IF TG_TABLE_NAME='practice_feed_event' THEN
  IF c.action<>'advance' OR c.movement_key IS DISTINCT FROM NEW.movement_key
     OR NOT ((c.step='pending' AND NEW.event_kind='pending')
          OR (c.step IN('settled','replay') AND NEW.event_kind='settled')
          OR (c.step='page_overlap' AND NEW.event_kind IN('pending','settled'))
          OR (c.step='alternate_representation' AND NEW.event_kind='statement')
          OR (c.step='unknown_duplicate' AND NEW.event_kind='unknown'))
  THEN RAISE EXCEPTION 'PRACTICE_FEED_EVENT_INVALID' USING ERRCODE='42501'; END IF;
  -- Integrity hash, not a signature. Authority is the exact command/step/account/session validation above.
  IF NEW.source_hash<>encode(sha256(convert_to(concat_ws('|',NEW.version,NEW.environment,NEW.tenant_id::text,NEW.job_id::text,NEW.account_id::text,
        NEW.event_id,NEW.event_kind,NEW.movement_key,NEW.identity,NEW.representation_id,NEW.gross_pence::text,NEW.currency,NEW.state),'UTF8')),'hex')
  THEN RAISE EXCEPTION 'PRACTICE_FEED_EVENT_INVALID' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;

 -- practice_feed_receipt_match
 IF c.action<>'match_receipt' OR c.movement_key IS DISTINCT FROM NEW.movement_key OR c.payment_id IS DISTINCT FROM NEW.payment_id
    OR NEW.environment<>'synthetic_demo'
 THEN RAISE EXCEPTION 'PRACTICE_FEED_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO pay FROM app.customer_payment WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.payment_id;
 IF NOT FOUND OR NOT pay.builder_attested OR pay.amount_pence<>NEW.matched_pence OR pay.currency<>NEW.currency
    OR EXISTS(SELECT 1 FROM app.customer_payment_reversal r WHERE r.tenant_id=NEW.tenant_id AND r.payment_id=NEW.payment_id)
 THEN RAISE EXCEPTION 'PRACTICE_FEED_RECEIPT_MISMATCH' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.practice_feed_event e WHERE e.tenant_id=NEW.tenant_id AND e.account_id=NEW.account_id AND e.event_id=NEW.settled_event_id
      AND e.movement_key=NEW.movement_key AND e.state='settled' AND e.identity='identified')
 THEN RAISE EXCEPTION 'PRACTICE_FEED_MOVEMENT_NOT_SETTLED' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM app.practice_feed_event e WHERE e.tenant_id=NEW.tenant_id AND e.account_id=NEW.account_id AND e.movement_key=NEW.movement_key AND e.identity='unidentified')
    AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command k WHERE k.tenant_id=NEW.tenant_id AND k.account_id=NEW.account_id AND k.action='reconcile_duplicate' AND k.movement_key=NEW.movement_key)
 THEN RAISE EXCEPTION 'PRACTICE_FEED_DUPLICATE_HELD' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER practice_feed_job_owner_guard BEFORE INSERT ON app.practice_feed_job_owner FOR EACH ROW EXECUTE FUNCTION app.guard_practice_feed();
CREATE TRIGGER practice_feed_account_guard BEFORE INSERT ON app.practice_feed_account FOR EACH ROW EXECUTE FUNCTION app.guard_practice_feed();
CREATE TRIGGER practice_feed_command_guard BEFORE INSERT ON app.practice_feed_command FOR EACH ROW EXECUTE FUNCTION app.guard_practice_feed();
CREATE TRIGGER practice_feed_event_guard BEFORE INSERT ON app.practice_feed_event FOR EACH ROW EXECUTE FUNCTION app.guard_practice_feed();
CREATE TRIGGER practice_feed_receipt_match_guard BEFORE INSERT ON app.practice_feed_receipt_match FOR EACH ROW EXECUTE FUNCTION app.guard_practice_feed();

-- Deferred completeness: an owner needs its claim audit event, an account needs its connect command, a command needs its transactional
-- audit event, a match command needs its match row and an advance command needs every event it generates. A half-written effect cannot commit.
CREATE FUNCTION app.require_practice_feed_effect() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
BEGIN
 IF TG_TABLE_NAME='practice_feed_job_owner' THEN
  IF NOT EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=NEW.tenant_id AND subject_ref=NEW.job_id::text AND actor_ref='membership:'||NEW.actor_membership_id::text
       AND event_type='practice_feed.claimed' AND payload->'references'->>'ownerId'=NEW.id::text)
  THEN RAISE EXCEPTION 'PRACTICE_FEED_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 IF TG_TABLE_NAME='practice_feed_account' THEN
  IF NOT EXISTS(SELECT 1 FROM app.practice_feed_command WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND account_id=NEW.id AND actor_membership_id=NEW.actor_membership_id AND revision=1 AND action='connect')
  THEN RAISE EXCEPTION 'PRACTICE_FEED_CONNECTION_REQUIRED' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=NEW.tenant_id AND subject_ref=NEW.job_id::text AND actor_ref='membership:'||NEW.actor_membership_id::text
      AND event_type='practice_feed.'||NEW.action AND payload->'references'->>'commandId'=NEW.id::text AND payload->'hashes'->>'command'=NEW.payload_hash::text)
 THEN RAISE EXCEPTION 'PRACTICE_FEED_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
 IF NEW.action='match_receipt' AND NOT EXISTS(SELECT 1 FROM app.practice_feed_receipt_match WHERE tenant_id=NEW.tenant_id AND command_id=NEW.id)
 THEN RAISE EXCEPTION 'PRACTICE_FEED_MATCH_REQUIRED' USING ERRCODE='23514'; END IF;
 -- An advance must leave every event identity its step generates. Each row was already validated against this command on insert;
 -- an identity stored by an earlier command (a replay or an overlapping page) satisfies it, a missing one does not.
 IF NEW.action='advance' AND EXISTS(
     SELECT 1 FROM unnest(CASE NEW.step
        WHEN 'pending' THEN ARRAY['pending'] WHEN 'settled' THEN ARRAY['settled'] WHEN 'replay' THEN ARRAY['settled']
        WHEN 'page_overlap' THEN ARRAY['pending','settled'] WHEN 'alternate_representation' THEN ARRAY['statement'] WHEN 'unknown_duplicate' THEN ARRAY['unknown'] END) AS expected(kind)
      WHERE NOT EXISTS(SELECT 1 FROM app.practice_feed_event e WHERE e.tenant_id=NEW.tenant_id AND e.account_id=NEW.account_id
        AND e.event_id=expected.kind||'-'||NEW.movement_key AND e.event_kind=expected.kind AND e.movement_key=NEW.movement_key))
 THEN RAISE EXCEPTION 'PRACTICE_FEED_EFFECT_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER practice_feed_job_owner_effect AFTER INSERT ON app.practice_feed_job_owner DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_practice_feed_effect();
CREATE CONSTRAINT TRIGGER practice_feed_account_effect AFTER INSERT ON app.practice_feed_account DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_practice_feed_effect();
CREATE CONSTRAINT TRIGGER practice_feed_command_effect AFTER INSERT ON app.practice_feed_command DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_practice_feed_effect();

ALTER FUNCTION app.guard_practice_feed() OWNER TO jobguard_migration;
ALTER FUNCTION app.require_practice_feed_effect() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_practice_feed(),app.require_practice_feed_effect() FROM PUBLIC,jobguard_runtime;
COMMIT;
