BEGIN;
-- Isolated fixture history; no invoice, ledger, receipt, decision or live tax writes.
CREATE TABLE app.vat_fixture_record (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, document_id uuid NOT NULL,
 command_id uuid NOT NULL, actor_id uuid NOT NULL, previous_document_id uuid,
 document_reference text NOT NULL, ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 1000),
 matrix_version text NOT NULL CHECK(matrix_version='vat.support-matrix.dark.v1'),
 environment text NOT NULL CHECK(environment='synthetic'),
 label text NOT NULL CHECK(label='fixture, awaiting adviser approval'),
 payload jsonb NOT NULL, record_hash text NOT NULL CHECK(record_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant_id,job_id,document_id),
 CONSTRAINT vat_fixture_command UNIQUE(tenant_id,command_id),
 CONSTRAINT vat_fixture_reference UNIQUE(tenant_id,job_id,document_reference),
 CONSTRAINT vat_fixture_ordinal UNIQUE(tenant_id,job_id,ordinal),
 CONSTRAINT vat_fixture_previous UNIQUE(tenant_id,job_id,previous_document_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,previous_document_id) REFERENCES app.vat_fixture_record(tenant_id,job_id,document_id),
 CHECK(record_hash=app.final_lock_hash(jsonb_build_object('input',payload,'actorId',actor_id)))
);
ALTER TABLE app.vat_fixture_record OWNER TO jobguard_migration;
ALTER TABLE app.vat_fixture_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.vat_fixture_record FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.vat_fixture_record TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.vat_fixture_record FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON app.vat_fixture_record
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
CREATE TRIGGER immutable_table BEFORE TRUNCATE ON app.vat_fixture_record
 FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_authorization_record();

-- One runtime entry point; read/lock return private rows, append stores only
-- synthetic inputs validated by core in the repository's locked transaction.
CREATE FUNCTION app.vat_fixture_records(t uuid,actor uuid,j uuid,operation text,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior app.vat_fixture_record; tail app.vat_fixture_record; cid uuid; did uuid; previous uuid;
 fingerprint text; result jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'VAT_FIXTURE_DISABLED'; END IF;
 IF t IS NULL OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  OR NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j)
 THEN RAISE EXCEPTION 'VAT_FIXTURE_NOT_FOUND'; END IF;
 IF operation IS NULL OR operation NOT IN('read','lock','append') OR v IS NULL
  OR jsonb_typeof(v)<>'object' OR (operation IN('read','lock') AND v<>'{}'::jsonb)
 THEN RAISE EXCEPTION 'VAT_FIXTURE_INVALID_INPUT'; END IF;
 IF operation<>'read' THEN
  PERFORM app.final_lock_require_owner(t,actor);
  -- Lock the book even when it has no rows. Every writer uses this same lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,755));
  PERFORM app.final_lock_require_owner(t,actor);
 END IF;
 IF operation='append' THEN
  IF v->>'version' IS DISTINCT FROM 'vat.fixture-append.v1' OR v->>'jobId' IS DISTINCT FROM j::text
   OR v-ARRAY['version','commandId','jobId','book','document']<>'{}'::jsonb
   OR NOT (v ?& ARRAY['version','commandId','jobId','book','document'])
   OR jsonb_typeof(v->'book') IS DISTINCT FROM 'object'
   OR v->'book'->>'version' IS DISTINCT FROM 'vat.fixture-book.v1'
   OR v->'book'->>'matrixVersion' IS DISTINCT FROM 'vat.support-matrix.dark.v1'
   OR v->'book'->>'environment' IS DISTINCT FROM 'synthetic'
   OR v->'book'->>'label' IS DISTINCT FROM 'fixture, awaiting adviser approval'
   OR v->'book'->>'roundingVersion' IS DISTINCT FROM 'fixture_cumulative_group_half_up_v1'
   OR coalesce(v->'book'->>'taxBasis','') NOT IN('full_net','net_after_retention')
   OR coalesce(v->'book'->>'supplierReference','')='' OR coalesce(v->'book'->>'customerReference','')=''
   OR v->'book'-ARRAY['version','matrixVersion','environment','label','roundingVersion','taxBasis','supplierReference','customerReference']<>'{}'::jsonb
   OR jsonb_typeof(v->'document') IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'VAT_FIXTURE_INVALID_INPUT'; END IF;
  cid:=(v->>'commandId')::uuid; did:=(v->'document'->>'id')::uuid;
  previous:=(v->'document'->>'previousDocumentId')::uuid;
  IF cid IS NULL OR did IS NULL OR coalesce(v->'document'->>'documentReference','')=''
  THEN RAISE EXCEPTION 'VAT_FIXTURE_INVALID_INPUT'; END IF;
  fingerprint:=app.final_lock_hash(jsonb_build_object('input',v,'actorId',actor));
  SELECT * INTO prior FROM app.vat_fixture_record WHERE tenant_id=t AND command_id=cid;
  IF FOUND THEN
   IF prior.job_id<>j OR prior.record_hash<>fingerprint THEN RAISE EXCEPTION 'VAT_FIXTURE_CONFLICT'; END IF;
  ELSE
   SELECT * INTO tail FROM app.vat_fixture_record WHERE tenant_id=t AND job_id=j ORDER BY ordinal DESC LIMIT 1;
   IF previous IS DISTINCT FROM tail.document_id OR (tail.document_id IS NOT NULL AND tail.payload->'book' IS DISTINCT FROM v->'book')
   THEN RAISE EXCEPTION 'VAT_FIXTURE_CONFLICT'; END IF;
   INSERT INTO app.vat_fixture_record(tenant_id,job_id,document_id,command_id,actor_id,previous_document_id,
    document_reference,ordinal,matrix_version,environment,label,payload,record_hash)
   VALUES(t,j,did,cid,actor,previous,v->'document'->>'documentReference',coalesce(tail.ordinal,0)+1,
    'vat.support-matrix.dark.v1','synthetic','fixture, awaiting adviser approval',v,fingerprint);
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM app.vat_fixture_record WHERE tenant_id=t AND job_id=j
  AND record_hash<>app.final_lock_hash(jsonb_build_object('input',payload,'actorId',actor_id)))
 THEN RAISE EXCEPTION 'VAT_FIXTURE_CONFLICT'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('input',payload,'actorId',actor_id,'recordHash',record_hash,
  'matrixVersion',matrix_version,'environment',environment,'label',label) ORDER BY ordinal),'[]'::jsonb)
 INTO result FROM app.vat_fixture_record WHERE tenant_id=t AND job_id=j;
 RETURN result;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'VAT_FIXTURE_CONFLICT';
END $$;
ALTER FUNCTION app.vat_fixture_records(uuid,uuid,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.vat_fixture_records(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.vat_fixture_records(uuid,uuid,uuid,text,jsonb) TO jobguard_runtime;
COMMIT;
