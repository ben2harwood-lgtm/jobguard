BEGIN;
-- MON-8-P-A: explicit fictional fixture facts only. No backfill or runtime writer.
CREATE TABLE app.contractor_agreement_status_revision (
 tenant_id uuid NOT NULL, id uuid NOT NULL, assignment_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), status text NOT NULL CHECK(status IN('active','inactive','suspended')),
 schema_version text NOT NULL CHECK(schema_version='contractor-agreement-status.v1'),
 environment text NOT NULL CHECK(environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 fictional_source text NOT NULL CHECK(fictional_source ~ '^fictional-fixture:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,assignment_id,revision),
 FOREIGN KEY(tenant_id,assignment_id) REFERENCES app.commercial_track_assignment(tenant_id,id)
);
ALTER TABLE app.contractor_agreement_status_revision OWNER TO jobguard_migration;
ALTER TABLE app.contractor_agreement_status_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.contractor_agreement_status_revision FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.contractor_agreement_status_revision FOR ALL TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.contractor_agreement_status_revision FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE FUNCTION app.mon8_agreement_status_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'AGREEMENT_STATUS_IMMUTABLE'; END IF;
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN'; END IF;
 NEW.created_at:=clock_timestamp(); RETURN NEW;
END $$;
ALTER FUNCTION app.mon8_agreement_status_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_agreement_status_guard() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER mon8_status_guard BEFORE INSERT OR UPDATE OR DELETE ON app.contractor_agreement_status_revision FOR EACH ROW EXECUTE FUNCTION app.mon8_agreement_status_guard();
CREATE TRIGGER mon8_status_no_truncate BEFORE TRUNCATE ON app.contractor_agreement_status_revision FOR EACH STATEMENT EXECUTE FUNCTION app.mon8_agreement_status_guard();

-- VOLATILE + READ COMMITTED: each query after the lock wait takes a fresh snapshot.
-- The transaction-level shared lock survives this function and the repository callback.
CREATE FUNCTION app.mon8_contractor_agreement_context(s uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; caller record; assignment app.commercial_track_assignment%ROWTYPE;
 fact app.contractor_agreement_status_revision%ROWTYPE;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'MODE_FORBIDDEN'; END IF;
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'FORBIDDEN'; END;
 IF t IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 -- Authenticate before waiting, then re-read session and membership after waiting.
 SELECT * INTO caller FROM app.contractor_session(s);
 IF caller.tenant_id IS DISTINCT FROM t THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 SELECT * INTO caller FROM app.contractor_session(s);
 IF caller.tenant_id IS DISTINCT FROM t OR caller.membership_id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 -- Membership is checked separately from track/status eligibility. Do not change
 -- contractor_member_active or any scoped permission predicate for historical readers.
 IF NOT EXISTS(SELECT 1 FROM app.membership m JOIN app.contractor_member c ON(c.tenant_id,c.membership_id)=(m.tenant_id,m.id)
  WHERE m.tenant_id=t AND m.id=caller.membership_id AND m.identity_user_id=caller.identity_user_id
  AND m.role=ANY(ARRAY['owner','admin','operative','supervisor','surveyor','commercial_manager','finance','read_only','client_approver'])
  AND (m.role='client_approver')=(c.client_id IS NOT NULL)
  AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=t AND r.membership_id=m.id)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT * INTO assignment FROM app.commercial_track_assignment WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
 SELECT * INTO fact FROM app.contractor_agreement_status_revision WHERE tenant_id=t AND assignment_id=assignment.id ORDER BY revision DESC LIMIT 1;
 RETURN jsonb_build_object('version','contractor-entitlement-authority.v1','environment','synthetic_demo',
  'tenantId',t,'membershipId',caller.membership_id,'identityUserId',caller.identity_user_id,
  'assignment',CASE WHEN assignment.id IS NULL THEN NULL ELSE jsonb_build_object('id',assignment.id,'revision',assignment.revision,'track',assignment.commercial_track,'agreementReference',assignment.agreement_reference) END,
  'status',CASE WHEN fact.id IS NULL THEN NULL ELSE jsonb_build_object('id',fact.id,'revision',fact.revision,'status',fact.status) END);
END $$;
ALTER FUNCTION app.mon8_contractor_agreement_context(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_contractor_agreement_context(uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.mon8_contractor_agreement_context(uuid) TO jobguard_runtime;
COMMIT;
