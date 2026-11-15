BEGIN;
-- LATER-SAFETY-150 (RED): retain the 0723 internal body and all authority boundaries.
-- CREATE OR REPLACE preserves owner and ACLs; the authorized wrapper is unchanged.
CREATE OR REPLACE FUNCTION app.record_builder_attested_acceptance(p_tenant uuid,p_acceptance uuid,p_event uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_total bigint,p_expected integer,p_actor uuid,p_customer varchar,p_method varchar,p_accepted_at timestamptz,p_evidence uuid) RETURNS app.quote_acceptance LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$ DECLARE j app.job;d app.quote_document_version;a app.quote_acceptance;prev_id uuid;prev_seq integer;BEGIN
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

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
 -- A preview alone does not obsolete sent terms. Issuance holds the same job
 -- row FOR SHARE (require_current_job_parties), conflicting with our FOR UPDATE.
 -- Read after that lock so an already committed newer send cannot be ignored.
 IF EXISTS (
   SELECT 1 FROM app.quote_document_version newer
   JOIN app.quote_send sent ON sent.tenant_id=newer.tenant_id
     AND sent.job_id=newer.job_id AND sent.document_id=newer.id
     AND sent.content_hash=newer.content_hash
   WHERE newer.tenant_id=p_tenant AND newer.job_id=p_job
     AND newer.document_version>d.document_version
 ) THEN RAISE EXCEPTION 'stale or unissued exact quote' USING ERRCODE='22023'; END IF;
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
COMMIT;
