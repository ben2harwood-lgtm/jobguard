BEGIN;

ALTER TABLE app.membership ADD COLUMN revoked_at timestamptz;
ALTER TABLE app.membership ADD COLUMN expires_at timestamptz;

CREATE TABLE app.decision (
  id uuid NOT NULL, tenant_id uuid NOT NULL, subject_type varchar(100) NOT NULL,
  subject_ref varchar(200) NOT NULL, action_type varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,id,action_type)
);
CREATE TABLE app.decision_resolution (
  id uuid NOT NULL, tenant_id uuid NOT NULL, decision_id uuid NOT NULL,
  resolution varchar(16) NOT NULL CHECK (resolution IN ('approved','dismissed','rejected')),
  actor_membership_id uuid NOT NULL, resolved_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,decision_id),
  FOREIGN KEY (tenant_id,decision_id) REFERENCES app.decision(tenant_id,id),
  FOREIGN KEY (tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.action_authorization (
  id uuid NOT NULL, tenant_id uuid NOT NULL, decision_id uuid NOT NULL,
  resolution_id uuid NOT NULL, actor_membership_id uuid NOT NULL, action_type varchar(100) NOT NULL,
  recipient varchar(320), content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  aggregate_revision integer NOT NULL CHECK (aggregate_revision >= 0),
  amount_pence bigint CHECK (amount_pence IS NULL OR amount_pence >= 0), currency char(3),
  policy_version varchar(80) NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
  authorization_kind varchar(16) NOT NULL DEFAULT 'exact' CHECK (authorization_kind = 'exact'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,resolution_id),
  FOREIGN KEY (tenant_id,decision_id,action_type) REFERENCES app.decision(tenant_id,id,action_type),
  FOREIGN KEY (tenant_id,resolution_id) REFERENCES app.decision_resolution(tenant_id,id),
  FOREIGN KEY (tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
  CHECK ((amount_pence IS NULL AND currency IS NULL) OR (amount_pence IS NOT NULL AND currency = 'GBP'))
);
CREATE TABLE app.command_receipt (
  command_id uuid NOT NULL, tenant_id uuid NOT NULL, command_type varchar(100) NOT NULL,
  semantic_key varchar(300) NOT NULL, request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status varchar(16) NOT NULL CHECK (status IN ('processing','succeeded')),
  result jsonb, actor_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), completed_at timestamptz,
  PRIMARY KEY (tenant_id,command_id), UNIQUE (tenant_id,command_type,semantic_key),
  FOREIGN KEY (tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
  CHECK ((status='processing' AND result IS NULL AND completed_at IS NULL) OR
         (status='succeeded' AND result IS NOT NULL AND completed_at IS NOT NULL))
);

CREATE FUNCTION app.require_approved_resolution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM app.decision_resolution r WHERE r.tenant_id=NEW.tenant_id
   AND r.id=NEW.resolution_id AND r.decision_id=NEW.decision_id AND r.resolution='approved')
 THEN RAISE EXCEPTION 'an approved resolution is required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER action_authorization_requires_approval BEFORE INSERT ON app.action_authorization
 FOR EACH ROW EXECUTE FUNCTION app.require_approved_resolution();

CREATE FUNCTION app.reject_immutable_authorization_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'decision and authorization records are immutable' USING ERRCODE='55000'; END $$;
CREATE TRIGGER decision_immutable BEFORE UPDATE OR DELETE ON app.decision FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
CREATE TRIGGER decision_resolution_immutable BEFORE UPDATE OR DELETE ON app.decision_resolution FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
CREATE FUNCTION app.guard_authorization_revocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.revoked_at IS NULL OR OLD.revoked_at IS NOT NULL OR
    ROW(NEW.id,NEW.tenant_id,NEW.decision_id,NEW.resolution_id,NEW.actor_membership_id,NEW.action_type,NEW.recipient,NEW.content_hash,NEW.aggregate_revision,NEW.amount_pence,NEW.currency,NEW.policy_version,NEW.expires_at,NEW.authorization_kind,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.decision_id,OLD.resolution_id,OLD.actor_membership_id,OLD.action_type,OLD.recipient,OLD.content_hash,OLD.aggregate_revision,OLD.amount_pence,OLD.currency,OLD.policy_version,OLD.expires_at,OLD.authorization_kind,OLD.created_at)
 THEN RAISE EXCEPTION 'only first authorization revocation is permitted' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER action_authorization_guard BEFORE UPDATE OR DELETE ON app.action_authorization FOR EACH ROW EXECUTE FUNCTION app.guard_authorization_revocation();

DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['decision','decision_resolution','action_authorization','command_receipt'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('GRANT SELECT, INSERT ON app.%I TO jobguard_runtime',n);
 EXECUTE format('REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON app.%I FROM jobguard_runtime',n);
END LOOP; END $$;
GRANT UPDATE (revoked_at) ON app.action_authorization TO jobguard_runtime;
GRANT UPDATE (status,result,completed_at) ON app.command_receipt TO jobguard_runtime;
ALTER FUNCTION app.reject_immutable_authorization_record() OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_authorization_revocation() OWNER TO jobguard_migration;
ALTER FUNCTION app.require_approved_resolution() OWNER TO jobguard_migration;
COMMIT;
