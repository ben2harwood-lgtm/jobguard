-- QUOTE-REACCEPT (audit finding 5; founder decisions 21-23, 14 Oct 2026): accept the same unchanged quote again after its acceptance was cancelled.
-- Never edits 0011/0153. app.quote_acceptance keeps its exact column list (its whole rows are fingerprinted in evidence packs), so the per-document
-- sequence and the replacement link live in a NEW immutable side table. The one-acceptance-per-document key is dropped; uniqueness becomes
-- (tenant,job,document,sequence) plus one replacement per acceptance. Existing rows have no side row and count as sequence 1 (no backfill).
-- CREATE OR REPLACE keeps both routines' signatures, owner and ACLs. The only new grant is SELECT on the new table, like its siblings.
BEGIN;
DO $$ DECLARE n text;BEGIN
 SELECT c.conname INTO n FROM pg_constraint c WHERE c.conrelid='app.quote_acceptance'::regclass AND c.contype='u'
  AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a WHERE a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey))=ARRAY['document_id','job_id','tenant_id'];
 IF n IS NULL THEN RAISE EXCEPTION 'expected one-acceptance-per-document key not found'; END IF;
 EXECUTE format('ALTER TABLE app.quote_acceptance DROP CONSTRAINT %I',n);
END $$;
CREATE TABLE app.quote_acceptance_sequence (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,document_id uuid NOT NULL,acceptance_id uuid NOT NULL,
 acceptance_sequence integer NOT NULL CHECK(acceptance_sequence>0),replaces_acceptance_id uuid,
 recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,acceptance_id),UNIQUE(tenant_id,job_id,document_id,acceptance_sequence),UNIQUE(tenant_id,replaces_acceptance_id),
 FOREIGN KEY(tenant_id,job_id,acceptance_id) REFERENCES app.quote_acceptance(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,replaces_acceptance_id) REFERENCES app.quote_acceptance(tenant_id,job_id,id),
 CHECK((acceptance_sequence=1 AND replaces_acceptance_id IS NULL) OR (acceptance_sequence>1 AND replaces_acceptance_id IS NOT NULL AND replaces_acceptance_id<>acceptance_id)));
CREATE TRIGGER quote_acceptance_sequence_immutable BEFORE UPDATE OR DELETE ON app.quote_acceptance_sequence FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
ALTER TABLE app.quote_acceptance_sequence OWNER TO jobguard_migration;
ALTER TABLE app.quote_acceptance_sequence ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.quote_acceptance_sequence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.quote_acceptance_sequence FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT ON app.quote_acceptance_sequence TO jobguard_runtime;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.quote_acceptance_sequence FROM jobguard_runtime;
CREATE OR REPLACE FUNCTION app.record_builder_attested_acceptance(p_tenant uuid,p_acceptance uuid,p_event uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_total bigint,p_expected integer,p_actor uuid,p_customer varchar,p_method varchar,p_accepted_at timestamptz,p_evidence uuid) RETURNS app.quote_acceptance LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE j app.job;d app.quote_document_version;a app.quote_acceptance;prev_id uuid;prev_seq integer;BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';END IF;
 -- Match the command dispatcher's current active-owner boundary inside the routine,
 -- before inspecting the job. No new application write privilege is introduced.
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor
   AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND OR j.status<>'quoting' THEN RAISE EXCEPTION 'acceptance is not allowed' USING ERRCODE='22023';END IF;
 IF j.revision<>p_expected THEN RAISE EXCEPTION 'expected revision conflict' USING ERRCODE='40001';END IF;
 SELECT * INTO d FROM app.quote_document_version WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_document;
 IF NOT FOUND OR d.document_version<>p_version OR d.content_hash<>p_hash OR (d.snapshot->>'totalPence')::bigint<>p_total OR NOT EXISTS(SELECT 1 FROM app.quote_send s WHERE s.tenant_id=p_tenant AND s.job_id=p_job AND s.document_id=p_document AND s.content_hash=p_hash) THEN RAISE EXCEPTION 'stale or unissued exact quote' USING ERRCODE='22023';END IF;
 -- Supersession is an immutable fact. The job lock serializes this read with
 -- disposition, including facts recorded before this migration.
 IF EXISTS(SELECT 1 FROM app.acceptance_event WHERE tenant_id=p_tenant AND job_id=p_job
   AND document_id=p_document AND kind='superseded')
 THEN RAISE EXCEPTION 'superseded exact quote' USING ERRCODE='22023'; END IF;
 -- Re-acceptance (founder decisions 21-23, 14 Oct 2026): the same exact document may be accepted again only when its latest acceptance
 -- was explicitly cancelled, and never once customer billing exists. The new acceptance is a NEW immutable row with its own fresh customer facts.
 SELECT a2.id,coalesce(s.acceptance_sequence,1) INTO prev_id,prev_seq FROM app.quote_acceptance a2
  LEFT JOIN app.quote_acceptance_sequence s ON s.tenant_id=a2.tenant_id AND s.acceptance_id=a2.id
  WHERE a2.tenant_id=p_tenant AND a2.job_id=p_job AND a2.document_id=p_document
  ORDER BY coalesce(s.acceptance_sequence,1) DESC,a2.recorded_at DESC,a2.id DESC LIMIT 1;
 IF prev_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM app.acceptance_event e WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.document_id=p_document AND e.kind='acceptance_cancelled' AND e.acceptance_id=prev_id)
  THEN RAISE EXCEPTION 'acceptance is not allowed' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM app.customer_invoice WHERE tenant_id=p_tenant AND job_id=p_job)
   OR EXISTS(SELECT 1 FROM app.customer_credit_note WHERE tenant_id=p_tenant AND job_id=p_job)
   OR EXISTS(SELECT 1 FROM app.customer_payment WHERE tenant_id=p_tenant AND job_id=p_job)
  THEN RAISE EXCEPTION 'reacceptance refused: customer billing exists' USING ERRCODE='22023'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.quote_version WHERE tenant_id=p_tenant AND id=p_document) THEN
  INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES(p_document,p_tenant,p_job,p_version,p_hash,(d.snapshot->>'netPence')::bigint,'accepted');
 END IF;
 INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at,evidence_id) VALUES(p_acceptance,p_tenant,p_job,p_document,p_version,p_hash,p_total,'GBP','builder_attestation',p_actor,p_customer,p_method,p_accepted_at,p_evidence) RETURNING * INTO a;
 INSERT INTO app.quote_acceptance_sequence(tenant_id,job_id,document_id,acceptance_id,acceptance_sequence,replaces_acceptance_id) VALUES(p_tenant,p_job,p_document,p_acceptance,coalesce(prev_seq,0)+1,prev_id);
 INSERT INTO app.acceptance_event(id,tenant_id,job_id,document_id,document_version,document_hash,acceptance_id,kind,actor_membership_id,occurred_at) VALUES(p_event,p_tenant,p_job,p_document,p_version,p_hash,p_acceptance,'accepted',p_actor,p_accepted_at);
 UPDATE app.job SET status='accepted',revision=revision+1,accepted_quote_version_id=p_document,updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_job;RETURN a;END $$;
CREATE OR REPLACE FUNCTION app.record_quote_disposition(p_tenant uuid,p_event uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_expected integer,p_actor uuid,p_kind varchar,p_occurred timestamptz) RETURNS app.acceptance_event LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE j app.job;d app.quote_document_version;a_id uuid;e app.acceptance_event;BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';END IF;
 -- Match the command dispatcher's current active-owner boundary inside the routine,
 -- before inspecting the job. No new application write privilege is introduced.
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor
   AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;IF NOT FOUND OR j.revision<>p_expected THEN RAISE EXCEPTION 'expected revision conflict' USING ERRCODE='40001';END IF;
 SELECT * INTO d FROM app.quote_document_version WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_document AND document_version=p_version AND content_hash=p_hash;IF NOT FOUND THEN RAISE EXCEPTION 'stale exact quote' USING ERRCODE='22023';END IF;
 IF p_kind='declined' AND j.status='quoting' THEN UPDATE app.job SET status='lost',revision=revision+1,updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_job;
 ELSIF p_kind='superseded' AND j.status='quoting' THEN UPDATE app.job SET revision=revision+1,updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_job;
 ELSIF p_kind='acceptance_cancelled' AND j.status='accepted' AND j.accepted_quote_version_id=p_document THEN SELECT a2.id INTO a_id FROM app.quote_acceptance a2 LEFT JOIN app.quote_acceptance_sequence s ON s.tenant_id=a2.tenant_id AND s.acceptance_id=a2.id WHERE a2.tenant_id=p_tenant AND a2.job_id=p_job AND a2.document_id=p_document ORDER BY coalesce(s.acceptance_sequence,1) DESC,a2.recorded_at DESC,a2.id DESC LIMIT 1;UPDATE app.job SET status='quoting',revision=revision+1,accepted_quote_version_id=NULL,updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_job;
 ELSE RAISE EXCEPTION 'disposition is not allowed' USING ERRCODE='22023';END IF;
 INSERT INTO app.acceptance_event(id,tenant_id,job_id,document_id,document_version,document_hash,acceptance_id,kind,actor_membership_id,occurred_at) VALUES(p_event,p_tenant,p_job,p_document,p_version,p_hash,a_id,p_kind,p_actor,p_occurred) RETURNING * INTO e;RETURN e;END $$;
COMMIT;
