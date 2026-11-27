-- V2 bootstrap only; never installed by the production migration runner.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'jobguard_v2_local' THEN RAISE EXCEPTION 'V2 database required'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS app.v2_chase_setting (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), firm_key text NOT NULL,
 enabled boolean NOT NULL, revision integer NOT NULL CHECK(revision>0),
 actor_membership_id uuid NOT NULL, changed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,firm_key),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS v2_chase_quote_job ON app.quote_document_version(tenant_id,job_id,id);
CREATE TABLE IF NOT EXISTS app.v2_chase_log (
 tenant_id uuid NOT NULL, firm_key text NOT NULL, job_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('quote','invoice')), item_id uuid NOT NULL,
 quote_id uuid, invoice_id uuid, step integer NOT NULL CHECK(step BETWEEN 0 AND 2),
 due_at timestamptz, sent_at timestamptz, stopped_reason text,
 recipient text, message text, command_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,firm_key,kind,item_id,step),
 FOREIGN KEY(tenant_id,firm_key) REFERENCES app.v2_chase_setting(tenant_id,firm_key),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,invoice_id) REFERENCES app.customer_invoice(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,quote_id) REFERENCES app.quote_document_version(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK((kind='quote' AND quote_id IS NOT NULL AND quote_id=item_id AND invoice_id IS NULL) OR
       (kind='invoice' AND invoice_id IS NOT NULL AND invoice_id=item_id AND quote_id IS NULL)),
 CHECK((step=0 AND stopped_reason IS NOT NULL AND sent_at IS NULL AND message IS NULL AND recipient IS NULL)
    OR (step>0 AND stopped_reason IS NULL AND due_at IS NOT NULL AND sent_at IS NOT NULL
        AND message IS NOT NULL AND recipient IS NOT NULL AND recipient='customer@jobguard-v2.invalid'))
);
-- An existing rehearsal has the original anonymous stop/sent constraint.
-- Identify just that constraint by its stopped_reason column, keep all rows,
-- and validate the expanded three-way check inside this same transaction.
DO $$ DECLARE previous_shape name; BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
   WHERE conrelid='app.v2_chase_log'::regclass AND conname='v2_chase_log_outcome') THEN
  SELECT c.conname INTO STRICT previous_shape FROM pg_constraint c
   JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='stopped_reason' AND a.attnum=ANY(c.conkey)
   WHERE c.conrelid='app.v2_chase_log'::regclass AND c.contype='c';
  EXECUTE format('ALTER TABLE app.v2_chase_log DROP CONSTRAINT %I',previous_shape);
  ALTER TABLE app.v2_chase_log ADD CONSTRAINT v2_chase_log_outcome CHECK (
    (step=0 AND stopped_reason IS NOT NULL AND sent_at IS NULL AND message IS NULL AND recipient IS NULL)
    OR (step>0 AND due_at IS NOT NULL AND stopped_reason IS NOT NULL AND stopped_reason='chase_skipped'
        AND sent_at IS NULL AND message IS NULL AND recipient IS NULL)
    OR (step>0 AND due_at IS NOT NULL AND stopped_reason IS NULL AND sent_at IS NOT NULL
        AND message IS NOT NULL AND recipient IS NOT NULL AND recipient='customer@jobguard-v2.invalid')
  );
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS app.v2_chase_command (
 tenant_id uuid NOT NULL, firm_key text NOT NULL, job_id uuid NOT NULL, command_id uuid NOT NULL,
 request_hash char(64) NOT NULL, result jsonb NOT NULL,
 actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,firm_key,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['v2_chase_setting','v2_chase_log','v2_chase_command'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=('app.'||n)::regclass AND polname='v2_chase_firm') THEN
   EXECUTE format('CREATE POLICY v2_chase_firm ON app.%I FOR ALL TO jobguard_runtime
    USING (tenant_id=app.current_tenant() AND firm_key=app.current_firm_profile_key())
    WITH CHECK (tenant_id=app.current_tenant() AND firm_key=app.current_firm_profile_key()
      AND actor_membership_id=app.current_actor())',n);
  END IF;
  IF n<>'v2_chase_setting' AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=('app.'||n)::regclass AND polname='v2_chase_job') THEN
   EXECUTE format('CREATE POLICY v2_chase_job ON app.%I AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS(SELECT 1 FROM app.job j WHERE (j.tenant_id,j.id)=(%I.tenant_id,%I.job_id)))',n,n,n);
  END IF;
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_worker,jobguard_infrastructure',n);
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
 END LOOP;
END $$;
GRANT UPDATE(enabled,revision,actor_membership_id,changed_at) ON app.v2_chase_setting TO jobguard_runtime;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='app.v2_chase_log'::regclass AND tgname='v2_chase_immutable') THEN
  CREATE TRIGGER v2_chase_immutable BEFORE UPDATE OR DELETE ON app.v2_chase_log
   FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
  CREATE TRIGGER v2_chase_immutable BEFORE UPDATE OR DELETE ON app.v2_chase_command
   FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
 END IF;
END $$;
-- Narrow read of the existing synthetic due/dispute projection. Runtime cannot
-- populate or change it; current invoice balances are independently read at run time.
CREATE OR REPLACE FUNCTION app.v2_chase_invoice_metadata(j uuid)
 RETURNS TABLE(invoice_id uuid,projection jsonb)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_database()<>'jobguard_v2_local' OR app.current_actor() IS NULL
  OR app.current_firm_profile_key() NOT LIKE 'practice:%'
  OR NOT EXISTS(SELECT 1 FROM app.job x WHERE x.tenant_id=app.current_tenant() AND x.id=j
   AND 'practice:'||x.practice_session_digest=app.current_firm_profile_key())
 THEN RAISE EXCEPTION 'CHASE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT d.invoice_id,d.projection FROM app.dunning_invoice d
  WHERE d.tenant_id=app.current_tenant() AND d.job_id=j;
END $$;
ALTER FUNCTION app.v2_chase_invoice_metadata(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.v2_chase_invoice_metadata(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.v2_chase_invoice_metadata(uuid) TO jobguard_runtime;
COMMIT;
