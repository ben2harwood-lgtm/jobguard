BEGIN;
-- MON-5 M5-QUOTE. Preserve the whole-row evidence format and all earlier rows.
-- No backfill; only customer acceptances have no builder actor. Forward-fix only.
ALTER TABLE app.quote_acceptance ALTER COLUMN actor_membership_id DROP NOT NULL;
ALTER TABLE app.quote_acceptance DROP CONSTRAINT quote_acceptance_acceptance_kind_check;
ALTER TABLE app.quote_acceptance DROP CONSTRAINT quote_acceptance_stated_method_check;
ALTER TABLE app.quote_acceptance ADD CONSTRAINT quote_acceptance_authority_check CHECK (
 (acceptance_kind='builder_attestation' AND actor_membership_id IS NOT NULL AND stated_method IN('verbal','email','message','signed-paper')) OR
 (acceptance_kind='customer_authenticated' AND actor_membership_id IS NULL AND stated_method='customer_portal' AND evidence_id IS NULL));
ALTER TABLE app.acceptance_event ALTER COLUMN actor_membership_id DROP NOT NULL;
ALTER TABLE app.acceptance_event ADD CONSTRAINT acceptance_event_actor_check CHECK(actor_membership_id IS NOT NULL OR (kind='accepted' AND acceptance_id IS NOT NULL));
-- A composite reference prevents same-tenant cross-job/session provenance links.
ALTER TABLE app.customer_portal_session ADD CONSTRAINT customer_portal_session_scope_key UNIQUE(tenant_id,job_id,customer_id,id);
CREATE TABLE app.customer_quote_approval (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, job_id uuid NOT NULL, acceptance_id uuid NOT NULL,
 session_id uuid NOT NULL, customer_id uuid NOT NULL, party_binding_id uuid NOT NULL,
 command jsonb NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(tenant_id,command_id), UNIQUE(tenant_id,acceptance_id),
 FOREIGN KEY(tenant_id,job_id,acceptance_id) REFERENCES app.quote_acceptance(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,customer_id,session_id) REFERENCES app.customer_portal_session(tenant_id,job_id,customer_id,id),
 FOREIGN KEY(tenant_id,job_id,party_binding_id) REFERENCES app.job_party_binding(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES app.customer(tenant_id,id)
);
ALTER TABLE app.customer_quote_approval OWNER TO jobguard_migration;
ALTER TABLE app.customer_quote_approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_quote_approval FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.customer_quote_approval FOR ALL TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.customer_quote_approval FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER customer_quote_approval_immutable BEFORE UPDATE OR DELETE ON app.customer_quote_approval
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();

CREATE FUNCTION identity.customer_portal_quote(t uuid,j uuid,c uuid,digest text,cmd jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job app.job; d app.quote_document_version; s app.customer_portal_session; g app.customer_portal_grant;
 prior app.customer_quote_approval; aid uuid:=gen_random_uuid(); eid uuid:=gen_random_uuid(); previous_id uuid; previous_seq integer;
 result jsonb; target jsonb; ts timestamptz;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR cmd IS NULL OR jsonb_typeof(cmd)<>'object'
  OR cmd->>'jobId' IS DISTINCT FROM j::text OR cmd->>'version' IS NULL
  OR cmd->>'version' NOT IN('customer-quote-read.v1','customer-quote-acceptance.v1')
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 -- Authenticate before touching a requested job. Then use 0155's job lock and
 -- the draft lock used by saveDraft, and recheck authority/clock after any wait.
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT * INTO job FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
 PERFORM 1 FROM app.quote_draft WHERE tenant_id=t AND job_id=j FOR SHARE;
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT * INTO s FROM app.customer_portal_session WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest;
 SELECT * INTO g FROM app.customer_portal_grant WHERE tenant_id=t AND id=s.grant_id;
 IF cmd->>'version'='customer-quote-read.v1' THEN
  IF cmd<>jsonb_build_object('version','customer-quote-read.v1','jobId',j::text) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 ELSE
  target:=cmd->'target';
  IF cmd IS DISTINCT FROM jsonb_build_object('version','customer-quote-acceptance.v1','commandId',(cmd->>'commandId')::uuid::text,'jobId',j::text,'expectedJobRevision',(cmd->>'expectedJobRevision')::integer,'target',jsonb_build_object('kind','quote','id',(target->>'id')::uuid::text,'revision',(target->>'revision')::integer,'hash',target->>'hash'))
   OR (cmd->>'commandId') IS NULL OR cmd->>'expectedJobRevision' IS NULL OR (cmd->>'expectedJobRevision')::integer<1
   OR target->>'id' IS NULL OR target->>'revision' IS NULL OR (target->>'revision')::integer<1 OR target->>'hash' IS NULL OR target->>'hash' !~ '^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||(cmd->>'commandId'),388));
  PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
  SELECT * INTO prior FROM app.customer_quote_approval WHERE tenant_id=t AND command_id=(cmd->>'commandId')::uuid;
  IF prior.command_id IS NOT NULL THEN
   IF prior.job_id<>j OR prior.customer_id<>c OR prior.command<>cmd THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
   RETURN prior.result;
  END IF;
 END IF;
 -- Only the latest issued document, from the current quote revision AND current customer binding.
 SELECT doc.* INTO d FROM app.quote_document_version doc
 JOIN app.quote_revision qr ON(qr.tenant_id,qr.job_id,qr.id)=(doc.tenant_id,doc.job_id,doc.quote_revision_id)
 JOIN app.quote_draft draft ON(draft.tenant_id,draft.job_id,draft.current_revision_id)=(qr.tenant_id,qr.job_id,qr.id)
 WHERE doc.tenant_id=t AND doc.job_id=j
 AND doc.snapshot->'jobParties'->>'bindingId'=g.party_binding_id::text
 AND doc.snapshot->'jobParties'->>'customerRevisionId'=g.customer_revision_id::text
 AND EXISTS(SELECT 1 FROM app.quote_send send WHERE send.tenant_id=t AND send.job_id=j AND send.document_id=doc.id AND send.content_hash=doc.content_hash)
 AND NOT EXISTS(SELECT 1 FROM app.quote_document_version newer WHERE newer.tenant_id=t AND newer.job_id=j AND newer.document_version>doc.document_version)
 AND NOT EXISTS(SELECT 1 FROM app.acceptance_event e WHERE e.tenant_id=t AND e.job_id=j AND e.document_id=doc.id AND e.kind='superseded')
 ORDER BY doc.document_version DESC LIMIT 1;
 IF cmd->>'version'='customer-quote-read.v1' THEN
  RETURN jsonb_build_object('version','customer-quote-view.v1','jobId',j,'jobRevision',job.revision,'status',job.status,'quote',
   CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('id',d.id,'revision',d.document_version,'hash',d.content_hash,'document',d.snapshot) END);
 END IF;
 IF d.id IS NULL OR job.status<>'quoting' OR job.revision<>(cmd->>'expectedJobRevision')::integer
  OR d.id<>(target->>'id')::uuid OR d.document_version<>(target->>'revision')::integer OR d.content_hash<>target->>'hash'
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 -- Preserve 0155's cancellation, reacceptance and billing guards, using its latest body.
 SELECT a.id,coalesce(qs.acceptance_sequence,1) INTO previous_id,previous_seq FROM app.quote_acceptance a
 LEFT JOIN app.quote_acceptance_sequence qs ON qs.tenant_id=a.tenant_id AND qs.acceptance_id=a.id
 WHERE a.tenant_id=t AND a.job_id=j AND a.document_id=d.id
 ORDER BY coalesce(qs.acceptance_sequence,1) DESC,a.recorded_at DESC,a.id DESC LIMIT 1;
 IF previous_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM app.acceptance_event e WHERE e.tenant_id=t AND e.job_id=j AND e.document_id=d.id AND e.kind='acceptance_cancelled' AND e.acceptance_id=previous_id)
   OR EXISTS(SELECT 1 FROM app.customer_invoice WHERE tenant_id=t AND job_id=j)
   OR EXISTS(SELECT 1 FROM app.customer_credit_note WHERE tenant_id=t AND job_id=j)
   OR EXISTS(SELECT 1 FROM app.customer_payment WHERE tenant_id=t AND job_id=j)
  THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 END IF;
 ts:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM app.quote_version WHERE tenant_id=t AND id=d.id) THEN
  INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status)
  VALUES(d.id,t,j,d.document_version,d.content_hash,(d.snapshot->>'netPence')::bigint,'accepted');
 END IF;
 INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at,evidence_id)
 VALUES(aid,t,j,d.id,d.document_version,d.content_hash,(d.snapshot->>'totalPence')::bigint,'GBP','customer_authenticated',NULL,d.snapshot->'customer'->>'name','customer_portal',ts,NULL);
 INSERT INTO app.quote_acceptance_sequence(tenant_id,job_id,document_id,acceptance_id,acceptance_sequence,replaces_acceptance_id)
 VALUES(t,j,d.id,aid,coalesce(previous_seq,0)+1,previous_id);
 INSERT INTO app.acceptance_event(id,tenant_id,job_id,document_id,document_version,document_hash,acceptance_id,kind,actor_membership_id,occurred_at)
 VALUES(eid,t,j,d.id,d.document_version,d.content_hash,aid,'accepted',NULL,ts);
 UPDATE app.job SET status='accepted',revision=revision+1,accepted_quote_version_id=d.id,updated_at=ts WHERE tenant_id=t AND id=j;
 result:=jsonb_build_object('version','customer-quote-accepted.v1','acceptanceId',aid,'jobId',j,'target',target,'method','customer_authenticated');
 INSERT INTO app.customer_quote_approval(tenant_id,command_id,job_id,acceptance_id,session_id,customer_id,party_binding_id,command,result)
 VALUES(t,(cmd->>'commandId')::uuid,j,aid,s.id,c,g.party_binding_id,cmd,result);
 -- Customer session is the actor; only immutable identifiers/hash enter the sealed audit payload.
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','customer-session:'||s.id::text,
  'eventType','quote.acceptance.customer_authenticated','subjectType','quote_document','subjectRef',d.id::text,
  'payload',jsonb_build_object('references',jsonb_build_object('acceptanceId',aid::text,'acceptanceEventId',eid::text),'hashes',jsonb_build_object('documentHash',d.content_hash),'classifications',jsonb_build_object('action','commercial')))),'checked_operation');
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
END $$;
ALTER FUNCTION identity.customer_portal_quote(uuid,uuid,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.customer_portal_quote(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION identity.customer_portal_quote(uuid,uuid,uuid,text,jsonb) TO jobguard_identity;
COMMIT;
