BEGIN;
-- Synthetic records only, never customer invoices, cash or authority.
CREATE TABLE app.interim_draft_record (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, record_id uuid NOT NULL,
 command_id uuid NOT NULL, actor_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 kind text NOT NULL CHECK(kind IN('interim.schedule.v1','interim.application.v1','interim.certification.v1',
  'interim.invoice-draft.v1','interim.credit-draft.v1','interim.synthetic-receipt.v1')),
 record_hash text NOT NULL CHECK(record_hash ~ '^[a-f0-9]{64}$'), record jsonb NOT NULL,
 watermark text NOT NULL DEFAULT 'SYNTHETIC DRAFT - NOT FOR ISSUE' CHECK(watermark='SYNTHETIC DRAFT - NOT FOR ISSUE'),
 lineage text NOT NULL DEFAULT 'fixture_lineage_not_authority' CHECK(lineage='fixture_lineage_not_authority'),
 PRIMARY KEY(tenant_id,record_id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,job_id,revision),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES app.membership(tenant_id,id),
 CHECK(jsonb_typeof(record)='object' AND record->>'id'=record_id::text AND record->>'tenantId'=tenant_id::text
  AND record->>'jobId'=job_id::text AND record->>'version'=kind)
);
ALTER TABLE app.interim_draft_record OWNER TO jobguard_migration;
ALTER TABLE app.interim_draft_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.interim_draft_record FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.interim_draft_record TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.interim_draft_record FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON app.interim_draft_record
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
CREATE TRIGGER immutable_table BEFORE TRUNCATE ON app.interim_draft_record
 FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_authorization_record();

-- Repository-owned transaction: read locks the job, core validates the complete
-- stored book, append checks the exact sequence. No grants on protected sources.
CREATE FUNCTION app.interim_draft_records(t uuid,digest text,j uuid,operation text,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; prior app.interim_draft_record; r jsonb; line jsonb; n integer; result jsonb;
 saved_tenant text:=current_setting('app.tenant_id',true);
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'INTERIM_DRAFT_DARK'; END IF;
 IF t IS NULL OR t IS DISTINCT FROM nullif(saved_tenant,'')::uuid THEN RAISE EXCEPTION 'INTERIM_DRAFT_NOT_FOUND'; END IF;
 IF operation IS NULL OR operation NOT IN('read','append') OR v IS NULL OR jsonb_typeof(v)<>'object'
 THEN RAISE EXCEPTION 'INTERIM_DRAFT_INVALID_INPUT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,752));
 IF digest IS NOT NULL THEN actor:=app.mon1_company_actor(t,digest); END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j) THEN RAISE EXCEPTION 'INTERIM_DRAFT_NOT_FOUND'; END IF;
 IF operation='append' THEN
  IF actor IS NULL OR v-ARRAY['commandId','expectedRevision','record','recordHash']<>'{}'::jsonb
   OR NOT (v ?& ARRAY['commandId','expectedRevision','record','recordHash'])
   OR jsonb_typeof(v->'record') IS DISTINCT FROM 'object'
   OR coalesce(v->>'recordHash','') !~ '^[a-f0-9]{64}$'
   OR coalesce(v->>'expectedRevision','') !~ '^[0-9]+$'
  THEN RAISE EXCEPTION 'INTERIM_DRAFT_INVALID_INPUT'; END IF;
  r:=v->'record';
  IF r->>'tenantId' IS DISTINCT FROM t::text OR r->>'jobId' IS DISTINCT FROM j::text
   THEN RAISE EXCEPTION 'INTERIM_DRAFT_NOT_FOUND'; END IF;
  SELECT * INTO prior FROM app.interim_draft_record WHERE tenant_id=t AND command_id=(v->>'commandId')::uuid;
  IF FOUND THEN
   IF prior.job_id<>j OR prior.actor_id<>actor OR prior.record IS DISTINCT FROM r OR prior.record_hash<>v->>'recordHash'
    THEN RAISE EXCEPTION 'INTERIM_DRAFT_CONFLICT'; END IF;
  ELSE
   SELECT count(*) INTO n FROM app.interim_draft_record WHERE tenant_id=t AND job_id=j;
   IF n<> (v->>'expectedRevision')::integer OR n>=10000 THEN RAISE EXCEPTION 'INTERIM_DRAFT_CONFLICT'; END IF;
   IF r->>'version'='interim.schedule.v1' THEN
    -- These source types already have authoritative tenant/job storage. Their
    -- presence verifies ownership only, never approval, tax or template authority.
    IF NOT EXISTS(SELECT 1 FROM app.quote_version WHERE tenant_id=t AND job_id=j AND id=(r->>'baselineSnapshotId')::uuid)
     THEN RAISE EXCEPTION 'INTERIM_DRAFT_NOT_FOUND'; END IF;
    FOR line IN SELECT value FROM jsonb_array_elements(r->'lines') LOOP
     IF NOT EXISTS(SELECT 1 FROM app.scope_identity WHERE tenant_id=t AND job_id=j AND id=(line->>'scopeItemId')::uuid)
      THEN RAISE EXCEPTION 'INTERIM_DRAFT_NOT_FOUND'; END IF;
     IF line->>'kind'='baseline' THEN
      IF NOT EXISTS(SELECT 1 FROM app.scope_revision WHERE tenant_id=t AND job_id=j
       AND id=(line->>'commercialRevisionId')::uuid AND scope_item_id=(line->>'scopeItemId')::uuid)
       THEN RAISE EXCEPTION 'INTERIM_DRAFT_NOT_FOUND'; END IF;
     ELSIF line->>'kind'='approved_variation' THEN
      IF NOT EXISTS(SELECT 1 FROM app.variation_revision WHERE tenant_id=t AND job_id=j
       AND id=(line->>'commercialRevisionId')::uuid AND variation_id=(line->>'sourceDocumentId')::uuid
       AND scope_item_id=(line->>'scopeItemId')::uuid)
       THEN RAISE EXCEPTION 'INTERIM_DRAFT_NOT_FOUND'; END IF;
     END IF;
    END LOOP;
   END IF;
   INSERT INTO app.interim_draft_record(tenant_id,job_id,record_id,command_id,actor_id,revision,kind,record_hash,record)
    VALUES(t,j,(r->>'id')::uuid,(v->>'commandId')::uuid,actor,n+1,r->>'version',v->>'recordHash',r);
  END IF;
 ELSIF v<>'{}'::jsonb THEN RAISE EXCEPTION 'INTERIM_DRAFT_INVALID_INPUT'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('commandId',command_id,'actorId',actor_id,'revision',revision,
  'recordHash',record_hash,'record',record,'watermark',watermark,'lineage',lineage) ORDER BY revision),'[]'::jsonb)
  INTO result FROM app.interim_draft_record WHERE tenant_id=t AND job_id=j;
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 RAISE;
END $$;
ALTER FUNCTION app.interim_draft_records(uuid,text,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.interim_draft_records(uuid,text,uuid,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.interim_draft_records(uuid,text,uuid,text,jsonb) TO jobguard_runtime;
COMMIT;
