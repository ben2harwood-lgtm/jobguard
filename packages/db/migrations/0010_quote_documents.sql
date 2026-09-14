BEGIN;
CREATE TABLE app.quote_document_version (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, quote_revision_id uuid NOT NULL,
 document_version integer NOT NULL CHECK(document_version>0), reference varchar(80) NOT NULL,
 content_hash char(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'), object_key varchar(500) NOT NULL,
 object_version_id varchar(300) NOT NULL, pdf_byte_length integer NOT NULL CHECK(pdf_byte_length>0),
 issuer jsonb NOT NULL CHECK(jsonb_typeof(issuer)='object'), customer jsonb NOT NULL CHECK(jsonb_typeof(customer)='object'),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'), issued_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,document_version), UNIQUE(tenant_id,id,content_hash),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id), FOREIGN KEY(tenant_id,quote_revision_id) REFERENCES app.quote_revision(tenant_id,id)
);
CREATE TABLE app.quote_send (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, document_id uuid NOT NULL, content_hash char(64) NOT NULL,
 authorization_id uuid NOT NULL, outbox_action_id uuid NOT NULL, recipients jsonb NOT NULL CHECK(jsonb_typeof(recipients)='array' AND jsonb_array_length(recipients)>0), issued_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,authorization_id), UNIQUE(tenant_id,outbox_action_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id), FOREIGN KEY(tenant_id,document_id,content_hash) REFERENCES app.quote_document_version(tenant_id,id,content_hash),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id), FOREIGN KEY(tenant_id,outbox_action_id) REFERENCES app.action_outbox(tenant_id,id)
);
CREATE TABLE app.quote_delivery_event (
 id uuid NOT NULL, tenant_id uuid NOT NULL, quote_send_id uuid NOT NULL, fact varchar(24) NOT NULL CHECK(fact IN ('provider_accepted','delivered','customer_accepted')),
 provider_event_id varchar(300), occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,quote_send_id,fact,provider_event_id), FOREIGN KEY(tenant_id,quote_send_id) REFERENCES app.quote_send(tenant_id,id)
);
CREATE TRIGGER quote_document_immutable BEFORE UPDATE OR DELETE ON app.quote_document_version FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
CREATE TRIGGER quote_send_immutable BEFORE UPDATE OR DELETE ON app.quote_send FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
CREATE TRIGGER quote_delivery_event_immutable BEFORE UPDATE OR DELETE ON app.quote_delivery_event FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['quote_document_version','quote_send','quote_delivery_event'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n); EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n); EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n); EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);
END LOOP; END $$;
COMMIT;
