BEGIN;
CREATE TABLE app.stage_completion (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, scope_item_id uuid NOT NULL, stage varchar(40) NOT NULL,
 evidence_link_id uuid NOT NULL, command_id uuid NOT NULL, completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,scope_item_id,stage), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,evidence_link_id) REFERENCES app.evidence_link(tenant_id,id));
CREATE TABLE app.evidence_invalidation (
 id uuid NOT NULL, tenant_id uuid NOT NULL, evidence_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 reason_code varchar(40) NOT NULL CHECK(reason_code IN('object_revoked','verification_invalid','wrong_subject')),
 invalidated_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,evidence_id),
 FOREIGN KEY(tenant_id,evidence_id) REFERENCES app.evidence_object(tenant_id,id), FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id));
CREATE TABLE app.stage_review_event (
 id uuid NOT NULL, tenant_id uuid NOT NULL, stage_completion_id uuid NOT NULL, evidence_invalidation_id uuid NOT NULL,
 event_type varchar(30) NOT NULL CHECK(event_type='proof_rework_required'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,stage_completion_id,evidence_invalidation_id),
 FOREIGN KEY(tenant_id,stage_completion_id) REFERENCES app.stage_completion(tenant_id,id), FOREIGN KEY(tenant_id,evidence_invalidation_id) REFERENCES app.evidence_invalidation(tenant_id,id));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['stage_completion','evidence_invalidation','stage_review_event'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',t); EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',t); EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',t);
END LOOP; END $$;
COMMIT;
