BEGIN;
-- ENT-5 issued foundation only. No pricing, submission, approval, capability, queue or scheduling writer.
-- Standard F: runtime SELECT only; trigger functions are not callable business writers.
-- No predecessor table, routine, grant, policy, hash, price or state is changed. No backfill.
CREATE TABLE app.extra_approval_revision_binding (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, variation_id uuid NOT NULL,
 binding_version text NOT NULL DEFAULT 'extra-approval-binding.v1' CHECK(binding_version='extra-approval-binding.v1'),
 logical_revision integer NOT NULL CHECK(logical_revision>0),
 source_kind text NOT NULL CHECK(source_kind IN('server_sor','ordinary')),
 source_revision_id uuid NOT NULL, sor_revision_id uuid, variation_revision_id uuid,
 source_hash char(64) NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 predecessor_binding_id uuid, command_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 binding_hash char(64) NOT NULL CHECK(binding_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,variation_id,id), UNIQUE(tenant_id,variation_id,logical_revision),
 UNIQUE(tenant_id,variation_id,source_kind,source_revision_id),
 CHECK((logical_revision=1)=(predecessor_binding_id IS NULL)),
 CHECK((source_kind='server_sor' AND sor_revision_id=source_revision_id AND sor_revision_id IS NOT NULL AND variation_revision_id IS NULL)
    OR (source_kind='ordinary' AND variation_revision_id=source_revision_id AND variation_revision_id IS NOT NULL AND sor_revision_id IS NULL)),
 FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,variation_id) REFERENCES app.extra_origin(tenant_id,variation_id),
 FOREIGN KEY(tenant_id,job_id,sor_revision_id) REFERENCES app.extra_sor_revision(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,variation_revision_id) REFERENCES app.variation_revision(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,variation_id,predecessor_binding_id) REFERENCES app.extra_approval_revision_binding(tenant_id,job_id,variation_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.extra_evidence_pack (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, variation_id uuid NOT NULL,
 subject text NOT NULL DEFAULT 'extra' CHECK(subject='extra'),
 pack_version text NOT NULL DEFAULT 'extra-evidence-pack.v1' CHECK(pack_version='extra-evidence-pack.v1'),
 command_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 subject_hash char(64) NOT NULL CHECK(subject_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,variation_id,id),
 FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,variation_id) REFERENCES app.extra_origin(tenant_id,variation_id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
ALTER TABLE app.extra_approval_revision_binding OWNER TO jobguard_migration;
ALTER TABLE app.extra_evidence_pack OWNER TO jobguard_migration;
ALTER TABLE app.extra_approval_revision_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.extra_approval_revision_binding FORCE ROW LEVEL SECURITY;
ALTER TABLE app.extra_evidence_pack ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.extra_evidence_pack FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.extra_approval_revision_binding FOR ALL TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY tenant_isolation ON app.extra_evidence_pack FOR ALL TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.extra_approval_revision_binding,app.extra_evidence_pack FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT SELECT ON app.extra_approval_revision_binding TO jobguard_runtime;
GRANT SELECT ON app.extra_evidence_pack TO jobguard_runtime;

-- Structural validation only, not actor authorization. There is no runtime INSERT privilege or callable writer.
CREATE FUNCTION app.ent5_revision_binding_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE source_extra uuid; source_hash text; source_net bigint; previous_revision integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.extra_origin o WHERE(o.tenant_id,o.job_id,o.variation_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id) AND o.job_track='contractor' AND o.provenance='command') THEN
  RAISE EXCEPTION 'INVALID_EXTRA_BINDING' USING ERRCODE='23514';
 END IF;
 IF NEW.source_kind='server_sor' THEN
  SELECT r.variation_id,r.content_hash::text,r.net_pence INTO source_extra,source_hash,source_net FROM app.extra_sor_revision r
   WHERE(r.tenant_id,r.job_id,r.id)=(NEW.tenant_id,NEW.job_id,NEW.source_revision_id);
  IF NOT EXISTS(SELECT 1 FROM app.extra_pricing_basis p WHERE(p.tenant_id,p.job_id,p.variation_id,p.revision,p.pricing_basis,p.revision_content_hash::text)=(NEW.tenant_id,NEW.job_id,NEW.variation_id,1,'server_sor',source_hash)) THEN
   RAISE EXCEPTION 'INVALID_EXTRA_BINDING' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT r.variation_id,r.content_hash::text,r.signed_delta_pence INTO source_extra,source_hash,source_net FROM app.variation_revision r
   WHERE(r.tenant_id,r.job_id,r.id)=(NEW.tenant_id,NEW.job_id,NEW.source_revision_id);
 END IF;
 IF source_extra IS DISTINCT FROM NEW.variation_id OR source_hash IS DISTINCT FROM NEW.source_hash::text OR source_net IS NULL OR source_net NOT BETWEEN 1 AND 1000000000000 THEN
  RAISE EXCEPTION 'INVALID_EXTRA_BINDING' USING ERRCODE='23514';
 END IF;
 IF NEW.predecessor_binding_id IS NOT NULL THEN
  SELECT b.logical_revision INTO previous_revision FROM app.extra_approval_revision_binding b
   WHERE(b.tenant_id,b.job_id,b.variation_id,b.id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id,NEW.predecessor_binding_id);
  IF previous_revision IS NULL OR previous_revision<>NEW.logical_revision-1 THEN RAISE EXCEPTION 'INVALID_EXTRA_PREDECESSOR' USING ERRCODE='23514'; END IF;
 END IF;
 NEW.server_recorded_at:=clock_timestamp();
 NEW.binding_hash:=encode(sha256(convert_to(jsonb_build_array('extra-approval-binding.v1',NEW.tenant_id,NEW.id,NEW.job_id,NEW.variation_id,NEW.logical_revision,NEW.source_kind,NEW.source_revision_id,NEW.source_hash,NEW.predecessor_binding_id,NEW.command_id,NEW.actor_membership_id,
  to_char(NEW.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text,'UTF8')),'hex');
 RETURN NEW;
END $$;
CREATE FUNCTION app.ent5_pack_subject_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE origin_hash text;
BEGIN
 SELECT o.origin_hash::text INTO origin_hash FROM app.extra_origin o WHERE(o.tenant_id,o.job_id,o.variation_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id) AND o.job_track='contractor' AND o.provenance='command';
 IF origin_hash IS NULL THEN RAISE EXCEPTION 'INVALID_EXTRA_PACK_SUBJECT' USING ERRCODE='23514'; END IF;
 NEW.server_recorded_at:=clock_timestamp();
 NEW.subject_hash:=encode(sha256(convert_to(jsonb_build_array('extra-evidence-pack.v1',NEW.tenant_id,NEW.id,NEW.job_id,NEW.variation_id,'extra',origin_hash,NEW.command_id,NEW.actor_membership_id,
  to_char(NEW.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text,'UTF8')),'hex');
 RETURN NEW;
END $$;
ALTER FUNCTION app.ent5_revision_binding_guard() OWNER TO jobguard_migration;
ALTER FUNCTION app.ent5_pack_subject_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ent5_revision_binding_guard(),app.ent5_pack_subject_guard() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER source_binding BEFORE INSERT ON app.extra_approval_revision_binding FOR EACH ROW EXECUTE FUNCTION app.ent5_revision_binding_guard();
CREATE TRIGGER subject_binding BEFORE INSERT ON app.extra_evidence_pack FOR EACH ROW EXECUTE FUNCTION app.ent5_pack_subject_guard();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.extra_approval_revision_binding FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.extra_evidence_pack FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
COMMIT;
