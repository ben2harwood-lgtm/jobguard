BEGIN;

CREATE TABLE app.job (
  id uuid NOT NULL, tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), title varchar(200) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','quoting','accepted','live','invoiced','paid','lost')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0), accepted_quote_version_id uuid,
  baseline_quote_version_id uuid, accepted_net_value_pence bigint, fee_policy_version varchar(80), recovery_cap_pence bigint,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,id,status),
  CHECK ((baseline_quote_version_id IS NULL AND accepted_net_value_pence IS NULL AND fee_policy_version IS NULL AND recovery_cap_pence IS NULL)
    OR (baseline_quote_version_id IS NOT NULL AND accepted_net_value_pence IS NOT NULL AND fee_policy_version IS NOT NULL AND recovery_cap_pence IS NOT NULL))
);

CREATE TABLE app.scope_identity (
  id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, state varchar(16) NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved','confirmed','retired')),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,job_id,id), FOREIGN KEY (tenant_id,job_id) REFERENCES app.job(tenant_id,id)
);
CREATE TABLE app.scope_lineage (
  tenant_id uuid NOT NULL, job_id uuid NOT NULL, parent_scope_item_id uuid NOT NULL, child_scope_item_id uuid NOT NULL,
  kind varchar(8) NOT NULL CHECK (kind IN ('split','merge')), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id,parent_scope_item_id,child_scope_item_id),
  FOREIGN KEY (tenant_id,job_id,parent_scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id),
  FOREIGN KEY (tenant_id,job_id,child_scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id),
  CHECK (parent_scope_item_id <> child_scope_item_id)
);
CREATE TABLE app.proposal_line (
  id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, scope_item_id uuid NOT NULL,
  source_hash char(64) NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'), source_reference varchar(300) NOT NULL,
  state varchar(12) NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','accepted','dismissed')),
  dismissal_reason varchar(200), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,scope_item_id),
  FOREIGN KEY (tenant_id,job_id,scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id)
);
CREATE TABLE app.scope_revision (
  id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, scope_item_id uuid NOT NULL, revision integer NOT NULL CHECK (revision > 0),
  description varchar(500) NOT NULL, quantity_decimal varchar(40) NOT NULL, unit varchar(40) NOT NULL,
  unit_price_pence bigint NOT NULL CHECK (unit_price_pence >= 0), total_pence bigint NOT NULL CHECK (total_pence >= 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,scope_item_id,revision), UNIQUE (tenant_id,job_id,id),
  FOREIGN KEY (tenant_id,job_id,scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id)
);
CREATE TABLE app.scope_progress (
  tenant_id uuid NOT NULL, job_id uuid NOT NULL, scope_item_id uuid NOT NULL,
  stage varchar(16) NOT NULL DEFAULT 'not_started' CHECK (stage IN ('not_started','in_progress','complete')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0), updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id,scope_item_id), FOREIGN KEY (tenant_id,job_id,scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id)
);
CREATE TABLE app.quote_version (
  id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, version integer NOT NULL CHECK (version > 0),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'), net_value_pence bigint NOT NULL CHECK (net_value_pence >= 0),
  status varchar(12) NOT NULL CHECK (status IN ('draft','issued','accepted','declined','superseded')),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,job_id,id), UNIQUE (tenant_id,job_id,version),
  FOREIGN KEY (tenant_id,job_id) REFERENCES app.job(tenant_id,id)
);
ALTER TABLE app.job ADD CONSTRAINT job_accepted_quote_fk FOREIGN KEY (tenant_id,id,accepted_quote_version_id) REFERENCES app.quote_version(tenant_id,job_id,id);
ALTER TABLE app.job ADD CONSTRAINT job_baseline_quote_fk FOREIGN KEY (tenant_id,id,baseline_quote_version_id) REFERENCES app.quote_version(tenant_id,job_id,id);

CREATE FUNCTION app.reject_immutable_commercial_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'commercial revisions and snapshots are immutable' USING ERRCODE='55000'; END $$;
CREATE TRIGGER scope_revision_immutable BEFORE UPDATE OR DELETE ON app.scope_revision FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE TRIGGER quote_version_immutable BEFORE UPDATE OR DELETE ON app.quote_version FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE FUNCTION app.guard_fixed_baseline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF OLD.baseline_quote_version_id IS NOT NULL AND ROW(NEW.baseline_quote_version_id,NEW.accepted_net_value_pence,NEW.fee_policy_version,NEW.recovery_cap_pence)
 IS DISTINCT FROM ROW(OLD.baseline_quote_version_id,OLD.accepted_net_value_pence,OLD.fee_policy_version,OLD.recovery_cap_pence)
 THEN RAISE EXCEPTION 'live commercial baseline is immutable' USING ERRCODE='55000'; END IF; RETURN NEW; END $$;
CREATE TRIGGER job_fixed_baseline BEFORE UPDATE ON app.job FOR EACH ROW EXECUTE FUNCTION app.guard_fixed_baseline();

CREATE FUNCTION app.transition_job(p_tenant uuid,p_job uuid,p_expected integer,p_to varchar,p_reason varchar,
 p_quote uuid DEFAULT NULL,p_net bigint DEFAULT NULL,p_policy varchar DEFAULT NULL,p_cap bigint DEFAULT NULL)
RETURNS app.job LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE current_job app.job; BEGIN
 SELECT * INTO current_job FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'job not found' USING ERRCODE='P0002'; END IF;
 IF current_job.revision<>p_expected THEN RAISE EXCEPTION 'expected revision conflict' USING ERRCODE='40001'; END IF;
 IF NOT ((current_job.status='draft' AND p_to='quoting' AND p_reason='start_quote') OR
  (current_job.status='quoting' AND p_to='accepted' AND p_reason='accept_quote' AND p_quote IS NOT NULL) OR
  (current_job.status='quoting' AND p_to='lost' AND p_reason='quote_lost') OR
  (current_job.status='accepted' AND p_to='quoting' AND p_reason='cancel_acceptance') OR
  (current_job.status='accepted' AND p_to='live' AND p_reason='switch_live' AND p_quote IS NOT NULL AND p_net IS NOT NULL AND p_policy IS NOT NULL AND p_cap IS NOT NULL) OR
  (current_job.status='lost' AND p_to='quoting' AND p_reason='reopen_quote') OR
  (current_job.status='live' AND p_to='invoiced' AND p_reason='issue_invoice') OR
  (current_job.status='invoiced' AND p_to='paid' AND p_reason='balance_settled') OR
  (current_job.status='paid' AND p_to='invoiced' AND p_reason IN ('payment_reversal','additional_amount_due')))
 THEN RAISE EXCEPTION 'illegal job transition' USING ERRCODE='22023'; END IF;
 UPDATE app.job SET status=p_to,revision=revision+1,updated_at=transaction_timestamp(),
  accepted_quote_version_id=CASE WHEN p_to='accepted' THEN p_quote WHEN p_reason='cancel_acceptance' THEN NULL ELSE accepted_quote_version_id END,
  baseline_quote_version_id=CASE WHEN p_to='live' THEN p_quote ELSE baseline_quote_version_id END,
  accepted_net_value_pence=CASE WHEN p_to='live' THEN p_net ELSE accepted_net_value_pence END,
  fee_policy_version=CASE WHEN p_to='live' THEN p_policy ELSE fee_policy_version END,
  recovery_cap_pence=CASE WHEN p_to='live' THEN p_cap ELSE recovery_cap_pence END
 WHERE tenant_id=p_tenant AND id=p_job RETURNING * INTO current_job; RETURN current_job;
END $$;
CREATE FUNCTION app.transition_scope_progress(p_tenant uuid,p_job uuid,p_scope uuid,p_expected integer,p_to varchar,p_reason varchar)
RETURNS app.scope_progress LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE current_progress app.scope_progress; BEGIN
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

DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['job','scope_identity','scope_lineage','proposal_line','scope_revision','scope_progress','quote_version'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n); EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('GRANT SELECT, INSERT ON app.%I TO jobguard_runtime',n); EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON app.%I FROM jobguard_runtime',n);
END LOOP; END $$;
GRANT UPDATE (state,dismissal_reason) ON app.proposal_line TO jobguard_runtime;
GRANT UPDATE (state) ON app.scope_identity TO jobguard_runtime;
ALTER FUNCTION app.reject_immutable_commercial_mutation() OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_fixed_baseline() OWNER TO jobguard_migration;
ALTER FUNCTION app.transition_job(uuid,uuid,integer,varchar,varchar,uuid,bigint,varchar,bigint) OWNER TO jobguard_migration;
ALTER FUNCTION app.transition_scope_progress(uuid,uuid,uuid,integer,varchar,varchar) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.transition_job(uuid,uuid,integer,varchar,varchar,uuid,bigint,varchar,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.transition_scope_progress(uuid,uuid,uuid,integer,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.transition_job(uuid,uuid,integer,varchar,varchar,uuid,bigint,varchar,bigint) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.transition_scope_progress(uuid,uuid,uuid,integer,varchar,varchar) TO jobguard_runtime;
COMMIT;
