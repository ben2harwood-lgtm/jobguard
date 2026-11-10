BEGIN;
-- MON-5 / real-customer-link-own-quote. Optional binding preserves legacy post-lock grants.
-- No backfill, role, ACL or RLS changes. Recovery: forward-fix; revoke affected grants
-- before disabling the new UI. Retain issued documents, acceptances and audit history.
ALTER TABLE app.customer_portal_grant
 ADD COLUMN quote_document_id uuid,
 ADD COLUMN quote_document_version integer,
 ADD COLUMN quote_document_hash char(64),
 ADD CONSTRAINT customer_portal_grant_quote_complete CHECK (
  (quote_document_id IS NULL AND quote_document_version IS NULL AND quote_document_hash IS NULL) OR
  (quote_document_id IS NOT NULL AND quote_document_version IS NOT NULL AND quote_document_hash IS NOT NULL));
ALTER TABLE app.customer_portal_grant ADD CONSTRAINT customer_portal_grant_quote_document_fk
 FOREIGN KEY(tenant_id,job_id,quote_document_id,quote_document_version,quote_document_hash)
 REFERENCES app.quote_document_version(tenant_id,job_id,id,document_version,content_hash);
CREATE OR REPLACE FUNCTION app.customer_portal_current(g app.customer_portal_grant) RETURNS boolean
 LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$
 SELECT g.revoked_at IS NULL AND EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=g.tenant_id AND m.id=g.issuer_membership_id AND m.account_id=g.company_id AND m.role IN('owner','finance') AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=m.tenant_id AND r.membership_id=m.id)) AND EXISTS(
  SELECT 1 FROM app.job_party_current c JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(c.tenant_id,c.job_id,c.binding_id)
  JOIN app.job j ON(j.tenant_id,j.id)=(b.tenant_id,b.job_id)
  LEFT JOIN app.job_commercial_track track ON(track.tenant_id,track.job_id)=(b.tenant_id,b.job_id)
  WHERE c.tenant_id=g.tenant_id AND c.job_id=g.job_id AND c.binding_id=g.party_binding_id
   AND b.customer_id=g.customer_id AND b.customer_revision_id=g.customer_revision_id
   AND ((track.job_track='small_builder' AND track.environment='synthetic_demo') OR (track.job_id IS NULL AND j.provenance='system_generated_quote' AND j.status IN('draft','quoting','accepted')))
   AND NOT EXISTS(SELECT 1 FROM app.contractor_party_binding cp WHERE cp.tenant_id=g.tenant_id AND cp.job_id=g.job_id)
   AND NOT EXISTS(SELECT 1 FROM app.customer_revision r WHERE r.tenant_id=g.tenant_id AND r.customer_id=g.customer_id AND r.revision>(SELECT revision FROM app.customer_revision WHERE tenant_id=g.tenant_id AND id=g.customer_revision_id)))
 AND (g.quote_document_id IS NULL OR EXISTS(
  SELECT 1 FROM app.quote_document_version doc
  JOIN app.quote_draft draft ON(draft.tenant_id,draft.job_id,draft.current_revision_id)=(doc.tenant_id,doc.job_id,doc.quote_revision_id)
  WHERE doc.tenant_id=g.tenant_id AND doc.job_id=g.job_id AND doc.id=g.quote_document_id
   AND EXISTS(SELECT 1 FROM app.job own_job JOIN control_plane.practice_session session ON session.token_digest=own_job.practice_session_digest
    WHERE own_job.tenant_id=g.tenant_id AND own_job.id=g.job_id AND session.revoked_at IS NULL AND session.expires_at>clock_timestamp())
   AND doc.snapshot->'jobParties'->>'bindingId'=g.party_binding_id::text
   AND doc.snapshot->'jobParties'->>'customerRevisionId'=g.customer_revision_id::text
   AND EXISTS(SELECT 1 FROM app.quote_send s WHERE s.tenant_id=g.tenant_id AND s.job_id=g.job_id AND s.document_id=doc.id AND s.content_hash=doc.content_hash)
   AND NOT EXISTS(SELECT 1 FROM app.quote_document_version newer WHERE newer.tenant_id=g.tenant_id AND newer.job_id=g.job_id AND newer.document_version>doc.document_version)
   AND NOT EXISTS(SELECT 1 FROM app.acceptance_event e WHERE e.tenant_id=g.tenant_id AND e.job_id=g.job_id AND e.document_id=doc.id AND e.kind='superseded')))
$$;

CREATE OR REPLACE FUNCTION app.demo_issue_customer_link(t uuid,j uuid,c uuid,session_digest text,link_digest text,content text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor record; m app.membership; b app.job_party_binding; recipient text; g uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); ts timestamptz; hash text; own_quote boolean; document_id uuid; doc app.quote_document_version;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501'; END IF;
 own_quote:=NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j);
 IF own_quote THEN
  SELECT membership_id AS member_id,identity_user_id AS user_id INTO actor FROM app.authenticate_practice_session(session_digest,t);
  IF actor.member_id IS NULL OR app.current_tenant() IS DISTINCT FROM t OR app.current_actor() IS DISTINCT FROM actor.member_id
   THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 ELSE
  SELECT * INTO actor FROM app.final_check_builder(t,j,session_digest);
  -- Preserve the prepared post-lock issuer and its restrictions.
  IF t<>'11111111-1111-4111-8111-111111111111'::uuid OR NOT EXISTS(
   SELECT 1 FROM app.extra_origin WHERE tenant_id=t AND job_id=j AND kind='jobguard_catch')
   THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 SELECT * INTO m FROM app.membership WHERE tenant_id=t AND id=actor.member_id AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 -- Recheck authenticated owner/session and immutable creator after lock waits.
 IF own_quote THEN
  PERFORM 1 FROM app.quote_draft WHERE tenant_id=t AND job_id=j FOR SHARE;
  PERFORM 1 FROM control_plane.practice_session WHERE token_digest=session_digest FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(session_digest,t) s
    WHERE s.membership_id=m.id AND s.identity_user_id=m.identity_user_id)
   OR app.current_actor() IS DISTINCT FROM m.id OR app.current_tenant() IS DISTINCT FROM t
   OR NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j AND practice_session_digest=session_digest
    AND provenance='system_generated_quote' AND status='quoting')
   OR EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j)
   THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT bnd.* INTO b FROM app.job_party_current pc JOIN app.job_party_binding bnd ON(bnd.tenant_id,bnd.job_id,bnd.id)=(pc.tenant_id,pc.job_id,pc.binding_id)
 WHERE pc.tenant_id=t AND pc.job_id=j AND bnd.customer_id=c FOR SHARE OF pc;
 IF own_quote AND (app.current_tenant() IS DISTINCT FROM t OR app.current_actor() IS DISTINCT FROM m.id)
  THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT lower(payload->>'email') INTO recipient FROM app.customer_revision WHERE tenant_id=t AND id=b.customer_revision_id;
 IF b.id IS NULL OR recipient IS NULL OR recipient !~ '^[^@[:space:]]+@[^@[:space:]]+\.invalid$' OR link_digest IS NULL OR link_digest !~ '^[a-f0-9]{64}$'
  OR content IS NULL OR length(content)>4096 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF own_quote THEN
  IF content IS NULL OR content !~ ('^customer-quote-signin-reference\.v1:'||t::text||'/'||j::text||'/'||c::text||'/[a-f0-9-]{36}/[A-Za-z0-9_-]{43}$')
   THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  document_id:=split_part(content,'/',4)::uuid;
  SELECT q.* INTO doc FROM app.quote_document_version q
   JOIN app.quote_draft draft ON(draft.tenant_id,draft.job_id,draft.current_revision_id)=(q.tenant_id,q.job_id,q.quote_revision_id)
   WHERE q.tenant_id=t AND q.job_id=j AND q.id=document_id
    AND q.snapshot->'jobParties'->>'bindingId'=b.id::text
    AND q.snapshot->'jobParties'->>'customerRevisionId'=b.customer_revision_id::text
    AND lower(q.snapshot->'customer'->>'email')=recipient
    AND EXISTS(SELECT 1 FROM app.quote_send s WHERE s.tenant_id=t AND s.job_id=j AND s.document_id=q.id AND s.content_hash=q.content_hash)
    AND NOT EXISTS(SELECT 1 FROM app.quote_document_version newer WHERE newer.tenant_id=t AND newer.job_id=j AND newer.document_version>q.document_version)
    AND NOT EXISTS(SELECT 1 FROM app.acceptance_event e WHERE e.tenant_id=t AND e.job_id=j AND e.document_id=q.id AND e.kind='superseded');
  IF doc.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 ELSE
 -- Preserve exact legacy path validation for existing synthetic callers, but never persist a credential.
 IF content ~ ('^/customer/sign-in#'||t::text||'/'||j::text||'/'||c::text||'/[A-Za-z0-9_-]{43}$') THEN
  content:='customer-signin-redacted.v1:'||encode(sha256(convert_to(content,'UTF8')),'hex');
 ELSE
  -- Same non-credential reference boundary as 0533's identity.customer_portal_issue.
  IF content !~ ('^customer-signin-reference\.v1:'||t::text||'/'||j::text||'/'||c::text||'/[A-Za-z0-9_-]{43}$') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 END IF;
 END IF;
 ts:=clock_timestamp();
 IF EXISTS(SELECT 1 FROM app.customer_portal_grant WHERE tenant_id=t AND job_id=j AND issued_at>ts-interval '1 minute') THEN RAISE EXCEPTION 'CUSTOMER_LINK_RATE_LIMITED' USING ERRCODE='P0001'; END IF;
 UPDATE app.action_outbox SET status='cancelled',updated_at=ts WHERE tenant_id=t AND id IN(SELECT outbox_id FROM app.customer_portal_grant WHERE tenant_id=t AND job_id=j) AND status IN('pending','retryable');
 UPDATE app.customer_portal_grant SET revoked_at=ts WHERE tenant_id=t AND job_id=j AND revoked_at IS NULL;
 hash:=encode(sha256(convert_to(content,'UTF8')),'hex');
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(d,t,'customer_portal',g::text,'customer_portal.signin.send');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(r,t,d,'approved',m.id);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at)
 VALUES(a,t,d,r,m.id,'customer_portal.signin.send',recipient,hash,b.revision,'customer-signin.synthetic.v1',ts+interval '10 minutes');
 INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,policy_version,authorization_expires_at)
 VALUES(o,t,a,'fake_email','customer-signin:'||g::text,'customer_portal.signin.send',recipient,hash,content,b.revision,'customer-signin.synthetic.v1',ts+interval '10 minutes');
 INSERT INTO app.customer_portal_grant(tenant_id,id,company_id,job_id,customer_id,party_binding_id,customer_revision_id,token_digest,issuer_membership_id,outbox_id,issued_at,expires_at,quote_document_id,quote_document_version,quote_document_hash)
 VALUES(t,g,m.account_id,j,c,b.id,b.customer_revision_id,link_digest,m.id,o,ts,ts+interval '10 minutes',document_id,doc.document_version,doc.content_hash);
 IF NOT app.customer_portal_current((SELECT x FROM app.customer_portal_grant x WHERE tenant_id=t AND id=g)) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.customer_portal_audit(t,g,'issued');
 RETURN g;
END $$;


DO $migration$ DECLARE body text; changed text; BEGIN
 SELECT pg_get_functiondef('identity.customer_portal_use(uuid,uuid,uuid,text,text,text)'::regprocedure) INTO body;
 changed:=replace(body,' ts:=clock_timestamp();',
  ' PERFORM 1 FROM app.quote_draft WHERE tenant_id=t AND job_id=j FOR SHARE;
 IF g.quote_document_id IS NOT NULL THEN
  -- Fence a blank-firm reset through commit; recheck expiry/revocation below.
  PERFORM 1 FROM control_plane.practice_session p JOIN app.job own_job ON own_job.practice_session_digest=p.token_digest
   WHERE own_job.tenant_id=t AND own_job.id=j FOR SHARE OF p;
 END IF;
 ts:=clock_timestamp();');
 IF changed=body THEN RAISE EXCEPTION 'customer portal validator patch missing'; END IF;
 EXECUTE changed;
 SELECT pg_get_functiondef('identity.customer_portal_quote(uuid,uuid,uuid,text,jsonb)'::regprocedure) INTO body;
 changed:=replace(body,'WHERE doc.tenant_id=t AND doc.job_id=j',
  'WHERE doc.tenant_id=t AND doc.job_id=j AND (g.quote_document_id IS NULL OR doc.id=g.quote_document_id)');
 IF changed=body THEN RAISE EXCEPTION 'customer quote binding patch missing'; END IF;
 EXECUTE changed;
END $migration$;
COMMIT;
