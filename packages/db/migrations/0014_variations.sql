BEGIN;
ALTER TABLE app.scope_lineage ALTER COLUMN kind TYPE varchar(16);
ALTER TABLE app.scope_lineage DROP CONSTRAINT scope_lineage_kind_check;
ALTER TABLE app.scope_lineage ADD CONSTRAINT scope_lineage_kind_check CHECK(kind IN('split','merge','variation'));
CREATE TABLE app.variation (
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,scope_item_id uuid NOT NULL,existing_scope_item_id uuid,lineage_parent_scope_item_id uuid,
 capture_kind varchar(32) NOT NULL CHECK(capture_kind IN('text','fixture_audio_transcript')),capture_text varchar(5000) NOT NULL,description varchar(500) NOT NULL,
 ai_rate_pence bigint CHECK(ai_rate_pence>=0),ai_source_ref varchar(300),ai_source_hash char(64),ai_rate_version varchar(80),
 state varchar(12) NOT NULL DEFAULT 'draft' CHECK(state IN('draft','priced','approved','rejected')),current_revision_id uuid,created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id,scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,existing_scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id,lineage_parent_scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id),
 CHECK((existing_scope_item_id IS NOT NULL AND scope_item_id=existing_scope_item_id AND lineage_parent_scope_item_id IS NULL) OR (existing_scope_item_id IS NULL AND (lineage_parent_scope_item_id IS NULL OR scope_item_id<>lineage_parent_scope_item_id))),
 CHECK((ai_rate_pence IS NULL AND ai_source_ref IS NULL AND ai_source_hash IS NULL AND ai_rate_version IS NULL) OR (ai_source_ref IS NOT NULL AND ai_source_hash~'^[0-9a-f]{64}$' AND ai_rate_version IS NOT NULL))
);
CREATE TABLE app.variation_revision (
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,variation_id uuid NOT NULL,scope_item_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),previous_revision_id uuid,
 description varchar(500) NOT NULL,quantity_decimal varchar(40) NOT NULL,unit varchar(40) NOT NULL,unit_rate_pence bigint NOT NULL CHECK(unit_rate_pence>=0),signed_delta_pence bigint NOT NULL,
 content_hash char(64) NOT NULL CHECK(content_hash~'^[0-9a-f]{64}$'),confirmed_by_membership_id uuid NOT NULL,rate_provenance_kind varchar(32) NOT NULL CHECK(rate_provenance_kind IN('human_entered','ai_suggestion_reviewed')),
 rate_source_ref varchar(300) NOT NULL,rate_source_hash char(64) NOT NULL CHECK(rate_source_hash~'^[0-9a-f]{64}$'),rate_version varchar(80) NOT NULL,created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,variation_id,revision),UNIQUE(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id,scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id),FOREIGN KEY(tenant_id,confirmed_by_membership_id) REFERENCES app.membership(tenant_id,id),FOREIGN KEY(tenant_id,job_id,previous_revision_id) REFERENCES app.variation_revision(tenant_id,job_id,id)
);
ALTER TABLE app.variation ADD CONSTRAINT variation_current_revision_fk FOREIGN KEY(tenant_id,job_id,current_revision_id) REFERENCES app.variation_revision(tenant_id,job_id,id);
CREATE TABLE app.variation_approval (
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,variation_id uuid NOT NULL,revision_id uuid NOT NULL,revision integer NOT NULL,content_hash char(64) NOT NULL,signed_delta_pence bigint NOT NULL,
 method varchar(24) NOT NULL CHECK(method IN('customer_evidence','builder_attestation')),actor_membership_id uuid NOT NULL,evidence_id uuid,approved_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,revision_id),FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id,revision_id) REFERENCES app.variation_revision(tenant_id,job_id,id),FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),FOREIGN KEY(tenant_id,evidence_id) REFERENCES app.evidence_object(tenant_id,id),CHECK((method='customer_evidence' AND evidence_id IS NOT NULL) OR (method='builder_attestation' AND evidence_id IS NULL))
);
CREATE TABLE app.variation_rejection (id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,variation_id uuid NOT NULL,revision_id uuid,actor_membership_id uuid NOT NULL,reason_code varchar(40) NOT NULL,rejected_at timestamptz NOT NULL,PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,variation_id,revision_id),FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id,revision_id) REFERENCES app.variation_revision(tenant_id,job_id,id),FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id));
CREATE TABLE app.variation_rate_observation (id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,variation_id uuid NOT NULL,revision_id uuid NOT NULL,unit varchar(40) NOT NULL,unit_rate_pence bigint NOT NULL CHECK(unit_rate_pence>=0),provenance_kind varchar(32) NOT NULL,source_ref varchar(300) NOT NULL,source_hash char(64) NOT NULL CHECK(source_hash~'^[0-9a-f]{64}$'),rate_version varchar(80) NOT NULL,observed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,revision_id),FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id,revision_id) REFERENCES app.variation_revision(tenant_id,job_id,id));
CREATE TRIGGER variation_revision_immutable BEFORE UPDATE OR DELETE ON app.variation_revision FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE TRIGGER variation_approval_immutable BEFORE UPDATE OR DELETE ON app.variation_approval FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
CREATE TRIGGER variation_rejection_immutable BEFORE UPDATE OR DELETE ON app.variation_rejection FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
CREATE TRIGGER variation_rate_observation_immutable BEFORE UPDATE OR DELETE ON app.variation_rate_observation FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['variation','variation_revision','variation_approval','variation_rejection','variation_rate_observation'] LOOP EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);END LOOP;END $$;
GRANT UPDATE(state,current_revision_id) ON app.variation TO jobguard_runtime;
COMMIT;
