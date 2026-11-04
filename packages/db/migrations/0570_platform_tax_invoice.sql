BEGIN;
-- Dark fixture storage only. These are tenant business tables; no runtime or provider capability.
-- Shared platform statement namespace; the subscription-only platform_statement table stays unchanged.
CREATE TABLE app.platform_invoice_issuer (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), id uuid NOT NULL,
 profile jsonb NOT NULL CHECK((profile->>'environment' = 'synthetic_demo') IS TRUE),
 PRIMARY KEY(tenant_id,id), UNIQUE(id), CHECK((profile->>'tenantId'=tenant_id::text AND profile->>'issuerId'=id::text) IS TRUE)
);
CREATE TABLE app.platform_invoice_document (
 tenant_id uuid NOT NULL, issuer_id uuid NOT NULL, sequence bigint NOT NULL CHECK(sequence>0),
 command_id uuid NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 document_hash text NOT NULL CHECK(document_hash ~ '^[a-f0-9]{64}$'),
 number text NOT NULL, kind text NOT NULL CHECK(kind IN ('invoice','credit_note')),
 original_number text, document jsonb NOT NULL,
 PRIMARY KEY(tenant_id,issuer_id,number), UNIQUE(tenant_id,issuer_id,sequence), UNIQUE(tenant_id,issuer_id,command_id),
 FOREIGN KEY(tenant_id,issuer_id) REFERENCES app.platform_invoice_issuer(tenant_id,id),
 FOREIGN KEY(tenant_id,issuer_id,original_number) REFERENCES app.platform_invoice_document(tenant_id,issuer_id,number),
 CHECK((kind='invoice' AND original_number IS NULL) OR (kind='credit_note' AND original_number IS NOT NULL)),
 CHECK(number='SIM-PLATFORM-'||sequence::text),
 CHECK((jsonb_typeof(document->'request'->'lines')='array' AND jsonb_array_length(document->'request'->'lines') BETWEEN 1 AND 100) IS TRUE),
 CHECK((document->>'version'='platform-invoice-document.v1' AND document->>'namespace'='platform_statement.invoice.synthetic.v1') IS TRUE),
 CHECK((document->'request'->>'environment'='synthetic_demo' AND document->>'collectionStarted'='false') IS TRUE),
 CHECK((document->>'number'=number AND (document->>'sequence')::bigint=sequence) IS TRUE),
 CHECK((document->'request'->>'tenantId'=tenant_id::text AND document->'request'->>'issuerId'=issuer_id::text) IS TRUE),
 CHECK((document->'request'->>'commandId'=command_id::text AND document->'request'->>'kind'=kind) IS TRUE)
);
-- A source is consumed once per tenant, independently of issuer profiles or later credits.
CREATE TABLE app.platform_invoice_source (
 tenant_id uuid NOT NULL, source_kind text NOT NULL CHECK(source_kind IN('subscription','success_fee','contractor_fee')),
 source_id uuid NOT NULL, source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 issuer_id uuid NOT NULL, invoice_number text NOT NULL,
 PRIMARY KEY(tenant_id,source_kind,source_id),
 FOREIGN KEY(tenant_id,issuer_id,invoice_number) REFERENCES app.platform_invoice_document(tenant_id,issuer_id,number)
);
CREATE FUNCTION app.platform_invoice_reserve_sources() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE l jsonb;
BEGIN
 IF NEW.kind='invoice' THEN
  FOR l IN SELECT value FROM jsonb_array_elements(NEW.document->'request'->'lines') LOOP
   INSERT INTO app.platform_invoice_source(tenant_id,source_kind,source_id,source_hash,issuer_id,invoice_number)
   VALUES(NEW.tenant_id,l->'provenance'->>'kind',(l->'provenance'->'statement'->>'id')::uuid,
    l->'provenance'->'statement'->>'hash',NEW.issuer_id,NEW.number);
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.platform_invoice_reserve_sources() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.platform_invoice_reserve_sources() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER platform_invoice_reserve_sources AFTER INSERT ON app.platform_invoice_document
 FOR EACH ROW EXECUTE FUNCTION app.platform_invoice_reserve_sources();
CREATE FUNCTION app.platform_invoice_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'PLATFORM_INVOICE_IMMUTABLE' USING ERRCODE='55000';
END $$;
ALTER FUNCTION app.platform_invoice_immutable() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.platform_invoice_immutable() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['platform_invoice_issuer','platform_invoice_document','platform_invoice_source'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
  EXECUTE format('CREATE TRIGGER platform_invoice_immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.platform_invoice_immutable()',n);
  EXECUTE format('CREATE TRIGGER platform_invoice_no_truncate BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.platform_invoice_immutable()',n);
 END LOOP;
END $$;
COMMIT;
