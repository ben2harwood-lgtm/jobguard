BEGIN;
-- MON-3-P-A: private synthetic storage only. No runtime trial admission or backfill.
CREATE TABLE app.trial_identity_snapshot (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, activation_id uuid NOT NULL,
 version text NOT NULL CHECK(version='free-first-job-identity.v1'),
 environment text NOT NULL CHECK(environment='synthetic_demo'),
 verification_source text NOT NULL CHECK(verification_source='fictional_verified_fixture.v1'),
 verification_id uuid NOT NULL, verified_at timestamptz NOT NULL,
 company_number text CHECK(company_number COLLATE "C" ~ '^[!-~]{1,200}$'),
 normalized_phone text CHECK(normalized_phone COLLATE "C" ~ '^[!-~]{1,200}$'),
 card_fingerprint text CHECK(card_fingerprint COLLATE "C" ~ '^sim_fp_[!-~]{0,193}$'),
 recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id), UNIQUE(tenant_id,activation_id),
 UNIQUE(tenant_id,job_id,activation_id,id),
 FOREIGN KEY(tenant_id,job_id,activation_id) REFERENCES app.job_activation(tenant_id,job_id,id),
 CHECK(company_number IS NOT NULL OR (normalized_phone IS NOT NULL AND card_fingerprint IS NOT NULL))
);
CREATE TABLE app.trial_identity_key_claim (
 identity_key text COLLATE "C" PRIMARY KEY,
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, activation_id uuid NOT NULL, snapshot_id uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 FOREIGN KEY(tenant_id,job_id,activation_id,snapshot_id) REFERENCES app.trial_identity_snapshot(tenant_id,job_id,activation_id,id)
);
ALTER TABLE app.trial_identity_snapshot OWNER TO jobguard_migration;
ALTER TABLE app.trial_identity_key_claim OWNER TO jobguard_migration;
ALTER TABLE app.trial_identity_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.trial_identity_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE app.trial_identity_key_claim ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.trial_identity_key_claim FORCE ROW LEVEL SECURITY;
-- Only migration-owned infrastructure can see these rows. No new bootstrap exception.
CREATE POLICY tenant_isolation ON app.trial_identity_snapshot FOR ALL TO jobguard_migration
 USING(tenant_id::text=current_setting('app.tenant_id',true))
 WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true));
CREATE POLICY tenant_isolation ON app.trial_identity_key_claim FOR ALL TO jobguard_migration
 USING(tenant_id::text=current_setting('app.tenant_id',true))
 WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true));
-- Remove any inherited default ACLs, including future non-runtime default-grant roles.
DO $$ DECLARE r record; t text; BEGIN
 FOREACH t IN ARRAY ARRAY['trial_identity_snapshot','trial_identity_key_claim'] LOOP
  EXECUTE format('REVOKE ALL ON TABLE app.%I FROM PUBLIC',t);
  FOR r IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE c.oid=format('app.%I',t)::regclass AND a.grantee<>c.relowner AND a.grantee<>0 LOOP
   EXECUTE format('REVOKE ALL ON TABLE app.%I FROM %I',t,pg_get_userbyid(r.grantee));
  END LOOP;
 END LOOP;
END $$;

CREATE FUNCTION app.claim_trial_identity_keys(p_tenant uuid,p_snapshot uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE s app.trial_identity_snapshot; k text; keys text[]:='{}'; existing app.trial_identity_key_claim;
BEGIN
 IF p_tenant IS NULL OR p_tenant::text IS DISTINCT FROM current_setting('app.tenant_id',true) THEN
  RAISE EXCEPTION 'TRIAL_IDENTITY_CONTEXT_REQUIRED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO s FROM app.trial_identity_snapshot WHERE tenant_id=p_tenant AND id=p_snapshot FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_IDENTITY_REQUIRED' USING ERRCODE='22023'; END IF;
 -- array_to_json(text[]) preserves the JS compact tuple encoding, including escaping.
 IF s.company_number IS NOT NULL THEN keys:=array_append(keys,array_to_json(ARRAY['free-first-job.v1','company',s.company_number])::text); END IF;
 IF s.normalized_phone IS NOT NULL AND s.card_fingerprint IS NOT NULL THEN
  keys:=array_append(keys,array_to_json(ARRAY['free-first-job.v1','phone_card',s.normalized_phone,'simulated',s.card_fingerprint])::text);
 END IF;
 FOR k IN SELECT value FROM unnest(keys) value ORDER BY value COLLATE "C" LOOP
  SELECT * INTO existing FROM app.trial_identity_key_claim WHERE identity_key=k;
  IF FOUND THEN
   IF (existing.tenant_id,existing.job_id,existing.activation_id,existing.snapshot_id) IS DISTINCT FROM (s.tenant_id,s.job_id,s.activation_id,s.id) THEN
    RAISE EXCEPTION 'TRIAL_IDENTITY_CONFLICT' USING ERRCODE='23505';
   END IF;
  ELSE
   INSERT INTO app.trial_identity_key_claim(identity_key,tenant_id,job_id,activation_id,snapshot_id)
    VALUES(k,s.tenant_id,s.job_id,s.activation_id,s.id);
  END IF;
 END LOOP;
EXCEPTION WHEN unique_violation THEN
 -- Cross-tenant collisions are decided by the global unique index, not an RLS-visible lookup.
 -- Never surface the index's identity-bearing DETAIL to callers.
 RAISE EXCEPTION 'TRIAL_IDENTITY_CONFLICT' USING ERRCODE='23505';
END $$;
ALTER FUNCTION app.claim_trial_identity_keys(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.claim_trial_identity_keys(uuid,uuid) FROM PUBLIC;

CREATE FUNCTION app.trial_identity_claim_on_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$ BEGIN
 PERFORM app.claim_trial_identity_keys(NEW.tenant_id,NEW.id); RETURN NEW;
END $$;
ALTER FUNCTION app.trial_identity_claim_on_insert() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.trial_identity_claim_on_insert() FROM PUBLIC;
-- A failed claim rolls the inserting statement back too, even if its caller catches the error.
CREATE TRIGGER trial_identity_claim_all AFTER INSERT ON app.trial_identity_snapshot
 FOR EACH ROW EXECUTE FUNCTION app.trial_identity_claim_on_insert();
CREATE TRIGGER trial_identity_snapshot_immutable BEFORE UPDATE OR DELETE ON app.trial_identity_snapshot
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE TRIGGER trial_identity_snapshot_no_truncate BEFORE TRUNCATE ON app.trial_identity_snapshot
 FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE TRIGGER trial_identity_key_claim_immutable BEFORE UPDATE OR DELETE ON app.trial_identity_key_claim
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE TRIGGER trial_identity_key_claim_no_truncate BEFORE TRUNCATE ON app.trial_identity_key_claim
 FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
-- No application/infrastructure/shadow helper grant, even under local default privileges.
DO $$ DECLARE r record; f regprocedure; BEGIN
 FOREACH f IN ARRAY ARRAY['app.claim_trial_identity_keys(uuid,uuid)'::regprocedure,'app.trial_identity_claim_on_insert()'::regprocedure] LOOP
  FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   WHERE p.oid=f AND a.grantee<>p.proowner AND a.grantee<>0 LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f,pg_get_userbyid(r.grantee));
  END LOOP;
 END LOOP;
END $$;
COMMIT;
