BEGIN;

-- Public material only, provisioned by the restricted assurance/migration credential.
CREATE TABLE app.evidence_export_signer_key (
  tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
  signer_id text NOT NULL, key_version text NOT NULL, fingerprint text NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY(tenant_id,signer_id,key_version),
  CONSTRAINT evidence_export_signer_key_ref UNIQUE(tenant_id,signer_id,key_version,fingerprint),
  CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  CHECK(coalesce(record->>'version' = 'evidence-signer-key.v1' AND record->>'algorithm' = 'Ed25519'
    AND record->>'tenantId' = tenant_id::text AND record->>'signerId' = signer_id
    AND record->>'keyVersion' = key_version AND record->>'fingerprint' = fingerprint,false))
);
CREATE TABLE app.signed_evidence_export (
  tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL, authorization_id uuid NOT NULL,
  recipient text NOT NULL CHECK(recipient ~ '^[^@]+@example[.]invalid$'),
  signer_id text NOT NULL, key_version text NOT NULL, signer_fingerprint text NOT NULL,
  bundle_text text NOT NULL, bundle_hash text NOT NULL,
  audit_event_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,authorization_id),
  FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id),
  FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
  FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id),
  CONSTRAINT signed_evidence_export_audit_event_fk FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY IMMEDIATE,
  FOREIGN KEY(tenant_id,signer_id,key_version,signer_fingerprint)
    REFERENCES app.evidence_export_signer_key(tenant_id,signer_id,key_version,fingerprint),
  CHECK(bundle_hash = encode(sha256(convert_to(bundle_text,'UTF8')),'hex')),
  CHECK(coalesce(bundle_text::jsonb->>'version' = 'signed-evidence-export.v1'
    AND bundle_text::jsonb->'payload'->>'environment' = 'synthetic_demo',false)),
  CHECK(coalesce((bundle_text::jsonb->'payload'->>'tenantId')::uuid = tenant_id
    AND (bundle_text::jsonb->'payload'->>'exportId')::uuid = id
    AND (bundle_text::jsonb->'payload'->>'jobId')::uuid = job_id
    AND (bundle_text::jsonb->'payload'->>'caseId')::uuid = case_id
    AND bundle_text::jsonb->'payload'->>'signerId' = signer_id
    AND bundle_text::jsonb->'payload'->>'keyVersion' = key_version
    AND bundle_text::jsonb->'payload'->>'signerFingerprint' = signer_fingerprint,false))
);

-- Defense in depth for direct INSERT: only a live exact approval of these bytes,
-- scope and recipient can be recorded. Cryptographic verification stays in TS.
CREATE FUNCTION app.guard_signed_evidence_export() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF TG_WHEN='AFTER' THEN
   IF NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.audit_event_id
     AND e.event_type='evidence_export.stored' AND e.subject_type='audit-export' AND e.subject_ref=NEW.id::text
     AND e.actor_ref='membership:'||NEW.actor_membership_id::text
     AND e.payload->'hashes'->>'bundle'=NEW.bundle_hash
     AND e.payload->'hashes'->>'recipient'=encode(sha256(convert_to(NEW.recipient,'UTF8')),'hex')
     AND e.payload->'references'->>'authorizationId'=NEW.authorization_id::text
     AND e.payload->'references'->>'jobId'=NEW.job_id::text
     AND e.payload->'references'->>'caseId'=NEW.case_id::text
     AND e.payload->'references'->>'signerId'=NEW.signer_id
     AND e.payload->'references'->>'keyVersion'=NEW.key_version)
   THEN RAISE EXCEPTION 'SIGNED_EXPORT_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
   RETURN NEW;
 END IF;
 -- Freeze membership and approval before the audit head is acquired.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text,54));
 PERFORM 1 FROM app.membership m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.actor_membership_id FOR SHARE;
 PERFORM 1 FROM app.action_authorization a WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.authorization_id FOR SHARE;
 IF NOT EXISTS (
   SELECT 1 FROM app.action_authorization a
   JOIN app.decision d ON (d.tenant_id,d.id)=(a.tenant_id,a.decision_id)
   JOIN app.decision_resolution r ON (r.tenant_id,r.id,r.decision_id)=(a.tenant_id,a.resolution_id,a.decision_id)
   JOIN app.membership m ON (m.tenant_id,m.id)=(a.tenant_id,a.actor_membership_id)
   JOIN app.evidence_export_signer_key k ON k.tenant_id=a.tenant_id
     AND k.signer_id=NEW.signer_id AND k.key_version=NEW.key_version
   WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.authorization_id
     AND a.actor_membership_id=NEW.actor_membership_id AND r.actor_membership_id=NEW.actor_membership_id
     AND a.action_type='evidence_export.store' AND d.subject_type='recovery_case'
     AND d.subject_ref=NEW.case_id::text AND r.resolution='approved'
     AND a.recipient=NEW.recipient AND a.content_hash=NEW.bundle_hash
     AND a.policy_version='signed-evidence-export-store.v1' AND a.aggregate_revision=0
     AND a.amount_pence IS NULL AND a.currency IS NULL AND a.revoked_at IS NULL
     AND a.expires_at>clock_timestamp() AND m.revoked_at IS NULL
     AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
     AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation v WHERE v.tenant_id=m.tenant_id AND v.membership_id=m.id)
     AND m.role='owner' AND k.record=NEW.bundle_text::jsonb->'signer'
     AND (k.record->>'revoked')::boolean=false
 ) THEN RAISE EXCEPTION 'SIGNED_EXPORT_AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_signed_evidence_export() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_signed_evidence_export() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER signed_evidence_export_authorized BEFORE INSERT ON app.signed_evidence_export
 FOR EACH ROW EXECUTE FUNCTION app.guard_signed_evidence_export();
CREATE CONSTRAINT TRIGGER signed_evidence_export_audited AFTER INSERT ON app.signed_evidence_export
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.guard_signed_evidence_export();
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['evidence_export_signer_key','signed_evidence_export'] LOOP
   EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
   EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
   EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
   EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
   EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
   EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);
   EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation()',n);
 END LOOP;
END $$;
GRANT INSERT ON app.signed_evidence_export TO jobguard_runtime;
COMMIT;
