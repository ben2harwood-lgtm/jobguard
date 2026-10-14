-- MIGFIX-4: strengthen exact quote acceptance without rewriting commercial history.
-- CREATE OR REPLACE preserves signatures, owner and ACLs. No GRANT, no data backfill.
-- Forward fix only: never reinstall the obsolete acceptance routines in production.
BEGIN;
CREATE OR REPLACE FUNCTION app.record_builder_attested_acceptance(p_tenant uuid,p_acceptance uuid,p_event uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_total bigint,p_expected integer,p_actor uuid,p_customer varchar,p_method varchar,p_accepted_at timestamptz,p_evidence uuid) RETURNS app.quote_acceptance LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE j app.job;d app.quote_document_version;a app.quote_acceptance;BEGIN
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
 INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES(p_document,p_tenant,p_job,p_version,p_hash,(d.snapshot->>'netPence')::bigint,'accepted');
 INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at,evidence_id) VALUES(p_acceptance,p_tenant,p_job,p_document,p_version,p_hash,p_total,'GBP','builder_attestation',p_actor,p_customer,p_method,p_accepted_at,p_evidence) RETURNING * INTO a;
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
 ELSIF p_kind='acceptance_cancelled' AND j.status='accepted' AND j.accepted_quote_version_id=p_document THEN SELECT id INTO a_id FROM app.quote_acceptance WHERE tenant_id=p_tenant AND job_id=p_job AND document_id=p_document;UPDATE app.job SET status='quoting',revision=revision+1,accepted_quote_version_id=NULL,updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_job;
 ELSE RAISE EXCEPTION 'disposition is not allowed' USING ERRCODE='22023';END IF;
 INSERT INTO app.acceptance_event(id,tenant_id,job_id,document_id,document_version,document_hash,acceptance_id,kind,actor_membership_id,occurred_at) VALUES(p_event,p_tenant,p_job,p_document,p_version,p_hash,a_id,p_kind,p_actor,p_occurred) RETURNING * INTO e;RETURN e;END $$;
COMMIT;
