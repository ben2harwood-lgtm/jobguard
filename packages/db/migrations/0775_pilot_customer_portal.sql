BEGIN;
-- Reuse the credential-scoped portal routines and their existing ownership and grants.
-- Pilot grants are restricted to the pilot database, exact issued customer quote and pilot capture track.
-- Existing practice grants retain their original rules. Forward-fix by revoking pilot grants.

CREATE OR REPLACE FUNCTION app.lp11_open_customer_scope(t uuid,j uuid,c uuid,d text,operation text,new_session uuid DEFAULT NULL) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE scope control_plane.lp11_customer_scope; g uuid; s uuid; sponsor uuid;
BEGIN
 IF t IS NULL OR j IS NULL OR c IS NULL OR d IS NULL OR d !~ '^[0-9a-f]{64}$'
  OR NOT (current_database()='jobguard_synthetic_demo' OR (current_database() ~ '^jobguard_pilot(_[a-z0-9]+)*$' AND current_database() !~ '^jobguard_pilot_(queue|restore)(_|$)')) OR operation IS NULL OR operation NOT IN('redeem','resolve','signout') THEN
  RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO scope FROM control_plane.lp11_customer_scope x WHERE x.transaction_id=pg_current_xact_id_if_assigned();
 IF FOUND THEN
  IF (scope.tenant_id,scope.job_id,scope.customer_id,scope.lookup_digest,scope.lookup_kind)
     IS DISTINCT FROM (t,j,c,d,'authorized_session'::text) OR operation<>'resolve' THEN
   RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
  END IF;
  RETURN false;
 END IF;
 IF app.lp11_policy_tenant() IS NOT NULL AND t IS DISTINCT FROM app.lp11_policy_tenant() THEN
  RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
 END IF;
 INSERT INTO control_plane.lp11_customer_scope VALUES
  (pg_current_xact_id(),t,j,c,d,CASE WHEN operation='redeem' THEN 'redeem' ELSE 'session' END,NULL,NULL,NULL,NULL);
 IF operation='redeem' THEN
  SELECT rowdata.id,rowdata.issuer_membership_id INTO g,sponsor FROM app.customer_portal_grant rowdata
   WHERE (rowdata.tenant_id,rowdata.job_id,rowdata.customer_id,rowdata.token_digest)=(t,j,c,d)
    AND rowdata.revoked_at IS NULL AND rowdata.consumed_at IS NULL AND rowdata.expires_at>clock_timestamp();
  s:=new_session;
 ELSE
  SELECT rowdata.id,rowdata.grant_id INTO s,g FROM app.customer_portal_session rowdata
   WHERE (rowdata.tenant_id,rowdata.job_id,rowdata.customer_id,rowdata.token_digest)=(t,j,c,d)
    AND rowdata.revoked_at IS NULL AND rowdata.expires_at>clock_timestamp();
 END IF;
 IF g IS NULL OR s IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 UPDATE control_plane.lp11_customer_scope x SET
  grant_id=g,session_id=s,issuer_membership_id=sponsor,
  lookup_kind=CASE WHEN operation='redeem' THEN 'authorized_link' ELSE 'authorized_session' END
 WHERE x.transaction_id=pg_current_xact_id_if_assigned();
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION app.customer_portal_issuer(t uuid,digest text) RETURNS app.membership
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE s identity.session; m app.membership; actor uuid;
 portal_mode constant text := CASE WHEN current_database() ~ '^jobguard_pilot(_[a-z0-9]+)*$' AND current_database() !~ '^jobguard_pilot_(queue|restore)(_|$)' THEN 'pilot_no_charge'
  WHEN current_database()='jobguard_synthetic_demo' THEN 'synthetic_demo' END;
BEGIN
 IF portal_mode IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM identity.session WHERE token_digest=digest AND environment=portal_mode AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF NOT app.lp11_request_binding_present() THEN
  BEGIN
   PERFORM app.bind_request('real',digest,t);
  EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM IS DISTINCT FROM 'REQUEST_BINDING_REFUSED' THEN RAISE; END IF;
   RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
  END;
 END IF;
 SELECT id INTO actor FROM identity.sso_session_memberships(s.user_id,s.id) WHERE tenant_id=t AND role IN('owner','finance');
 IF t IS DISTINCT FROM app.current_tenant() OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT * INTO m FROM app.membership WHERE tenant_id=t AND id=actor AND role IN('owner','finance')
  AND (portal_mode<>'pilot_no_charge' OR role='owner') AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 RETURN m;
END $$;

CREATE OR REPLACE FUNCTION app.customer_portal_current(g app.customer_portal_grant) RETURNS boolean
 LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$
 SELECT g.revoked_at IS NULL AND EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=g.tenant_id AND m.id=g.issuer_membership_id AND m.account_id=g.company_id AND m.role IN('owner','finance') AND (current_database()='jobguard_synthetic_demo' OR m.role='owner') AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=m.tenant_id AND r.membership_id=m.id)) AND EXISTS(
  SELECT 1 FROM app.job_party_current c JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(c.tenant_id,c.job_id,c.binding_id)
  JOIN app.job j ON(j.tenant_id,j.id)=(b.tenant_id,b.job_id)
  LEFT JOIN app.job_commercial_track track ON(track.tenant_id,track.job_id)=(b.tenant_id,b.job_id)
  WHERE c.tenant_id=g.tenant_id AND c.job_id=g.job_id AND c.binding_id=g.party_binding_id
   AND b.customer_id=g.customer_id AND b.customer_revision_id=g.customer_revision_id
   AND (
    (current_database()='jobguard_synthetic_demo' AND (
      (track.job_track='small_builder' AND track.environment='synthetic_demo')
      OR (track.job_id IS NULL AND j.provenance='system_generated_quote' AND j.status IN('draft','quoting','accepted'))))
    OR ((current_database() ~ '^jobguard_pilot(_[a-z0-9]+)*$' AND current_database() !~ '^jobguard_pilot_(queue|restore)(_|$)')
      AND track.job_track='small_builder' AND track.environment='pilot_no_charge' AND track.provenance='pilot_capture'
      AND j.practice_session_digest IS NULL AND g.quote_document_id IS NOT NULL))
   AND NOT EXISTS(SELECT 1 FROM app.contractor_party_binding cp WHERE cp.tenant_id=g.tenant_id AND cp.job_id=g.job_id)
   AND NOT EXISTS(SELECT 1 FROM app.customer_revision r WHERE r.tenant_id=g.tenant_id AND r.customer_id=g.customer_id AND r.revision>(SELECT revision FROM app.customer_revision WHERE tenant_id=g.tenant_id AND id=g.customer_revision_id)))
 AND (g.quote_document_id IS NULL OR EXISTS(
  SELECT 1 FROM app.quote_document_version doc
  JOIN app.quote_draft draft ON(draft.tenant_id,draft.job_id,draft.current_revision_id)=(doc.tenant_id,doc.job_id,doc.quote_revision_id)
  WHERE doc.tenant_id=g.tenant_id AND doc.job_id=g.job_id AND doc.id=g.quote_document_id
   AND (current_database()<>'jobguard_synthetic_demo' OR EXISTS(
    SELECT 1 FROM app.job own_job JOIN control_plane.practice_session session ON session.token_digest=own_job.practice_session_digest
    WHERE own_job.tenant_id=g.tenant_id AND own_job.id=g.job_id AND session.revoked_at IS NULL AND session.expires_at>clock_timestamp()))
   AND doc.snapshot->'jobParties'->>'bindingId'=g.party_binding_id::text
   AND doc.snapshot->'jobParties'->>'customerRevisionId'=g.customer_revision_id::text
   AND EXISTS(SELECT 1 FROM app.quote_send s WHERE s.tenant_id=g.tenant_id AND s.job_id=g.job_id AND s.document_id=doc.id AND s.content_hash=doc.content_hash)
   AND NOT EXISTS(SELECT 1 FROM app.quote_document_version newer WHERE newer.tenant_id=g.tenant_id AND newer.job_id=g.job_id AND newer.document_version>doc.document_version)
   AND NOT EXISTS(SELECT 1 FROM app.acceptance_event e WHERE e.tenant_id=g.tenant_id AND e.job_id=g.job_id AND e.document_id=doc.id AND e.kind='superseded')))
$$;

CREATE OR REPLACE FUNCTION identity.customer_portal_issue(t uuid,builder_digest text,j uuid,c uuid,link_digest text,content text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m app.membership; b app.job_party_binding; recipient text; g uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); ts timestamptz; hash text;
 doc app.quote_document_version;
BEGIN
 m:=app.customer_portal_issuer(t,builder_digest);
 -- Serialize replacement, redemption, revoke and resolution per job; source binding is locked too.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 m:=app.customer_portal_issuer(t,builder_digest);
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 SELECT bnd.* INTO b FROM app.job_party_current pc JOIN app.job_party_binding bnd ON(bnd.tenant_id,bnd.job_id,bnd.id)=(pc.tenant_id,pc.job_id,pc.binding_id)
 WHERE pc.tenant_id=t AND pc.job_id=j AND bnd.customer_id=c FOR SHARE OF pc;
 SELECT lower(payload->>'email') INTO recipient FROM app.customer_revision WHERE tenant_id=t AND id=b.customer_revision_id;
 IF b.id IS NULL OR recipient IS NULL OR recipient !~ '^[^@[:space:]]+@[^@[:space:]]+\.invalid$' OR link_digest IS NULL OR link_digest !~ '^[a-f0-9]{64}$'
  OR content IS NULL OR length(content)>4096 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 -- The issuer supplies a non-credential reference; only the server HMAC key can derive the link.
 IF content !~ ('^customer-signin-reference\.v1:'||t::text||'/'||j::text||'/'||c::text||'/[A-Za-z0-9_-]{43}$') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF current_database()<>'jobguard_synthetic_demo' THEN
  -- A pilot grant pins the exact issued quote and the same recipient as the current binding.
  PERFORM 1 FROM app.quote_draft WHERE tenant_id=t AND job_id=j FOR SHARE;
  SELECT q.* INTO doc FROM app.quote_document_version q
  JOIN app.quote_draft draft ON (draft.tenant_id,draft.job_id,draft.current_revision_id)=(q.tenant_id,q.job_id,q.quote_revision_id)
  WHERE q.tenant_id=t AND q.job_id=j
   AND q.snapshot->'jobParties'->>'bindingId'=b.id::text
   AND q.snapshot->'jobParties'->>'customerRevisionId'=b.customer_revision_id::text
   AND lower(q.snapshot->'customer'->>'email')=recipient
   AND (q.snapshot#>>'{jobParties,customer,type}' IS DISTINCT FROM 'person' OR q.snapshot ? 'cancellationKit')
   AND EXISTS(SELECT 1 FROM app.quote_send s WHERE s.tenant_id=t AND s.job_id=j AND s.document_id=q.id AND s.content_hash=q.content_hash
    AND s.recipients=jsonb_build_array(recipient))
   AND NOT EXISTS(SELECT 1 FROM app.quote_document_version newer WHERE newer.tenant_id=t AND newer.job_id=j AND newer.document_version>q.document_version)
   AND NOT EXISTS(SELECT 1 FROM app.acceptance_event e WHERE e.tenant_id=t AND e.job_id=j AND e.document_id=q.id AND e.kind='superseded');
  IF doc.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 END IF;
 m:=app.customer_portal_issuer(t,builder_digest);
 ts:=clock_timestamp();
 -- Bounded request rate; replacement cannot be used to flood even the fake adapter.
 IF EXISTS(SELECT 1 FROM app.customer_portal_grant WHERE tenant_id=t AND job_id=j AND issued_at>ts-interval '1 minute') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
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
 VALUES(t,g,m.account_id,j,c,b.id,b.customer_revision_id,link_digest,m.id,o,ts,ts+interval '10 minutes',doc.id,doc.document_version,doc.content_hash);
 IF NOT app.customer_portal_current((SELECT x FROM app.customer_portal_grant x WHERE tenant_id=t AND id=g)) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.customer_portal_audit(t,g,'issued');
 RETURN g;
END $$;

CREATE OR REPLACE FUNCTION identity.customer_portal_use(t uuid,j uuid,c uuid,digest text,session_digest text,operation text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g app.customer_portal_grant; s app.customer_portal_session; ts timestamptz; sid uuid:=gen_random_uuid(); opened boolean;
BEGIN
 IF NOT (current_database()='jobguard_synthetic_demo' OR (current_database() ~ '^jobguard_pilot(_[a-z0-9]+)*$' AND current_database() !~ '^jobguard_pilot_(queue|restore)(_|$)')) OR operation NOT IN('redeem','resolve','signout') OR operation IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 opened:=app.lp11_open_customer_scope(t,j,c,digest,operation,sid);
 IF operation='redeem' THEN
  SELECT * INTO g FROM app.customer_portal_grant WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest FOR UPDATE;
 ELSE
  SELECT * INTO s FROM app.customer_portal_session WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest FOR UPDATE;
  SELECT * INTO g FROM app.customer_portal_grant WHERE tenant_id=t AND id=s.grant_id FOR UPDATE;
 END IF;
 IF g.id IS NOT NULL THEN PERFORM app.lp11_customer_sponsor(g.id,g.issuer_membership_id); END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 -- Lock current party before the final authority/clock check; stale authority never survives a wait.
 PERFORM 1 FROM app.job_party_current WHERE tenant_id=t AND job_id=j FOR SHARE;
 PERFORM 1 FROM app.quote_draft WHERE tenant_id=t AND job_id=j FOR SHARE;
 IF g.quote_document_id IS NOT NULL AND current_database()='jobguard_synthetic_demo' THEN
  -- Fence a blank-firm reset through commit; recheck expiry/revocation below.
  PERFORM 1 FROM control_plane.practice_session p JOIN app.job own_job ON own_job.practice_session_digest=p.token_digest
   WHERE own_job.tenant_id=t AND own_job.id=j FOR SHARE OF p;
 END IF;
 ts:=clock_timestamp();
 IF g.id IS NULL OR NOT app.customer_portal_current(g) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF operation='redeem' THEN
  IF g.consumed_at IS NOT NULL OR g.expires_at<=ts OR session_digest IS NULL OR session_digest !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  UPDATE app.customer_portal_grant SET consumed_at=ts WHERE tenant_id=t AND id=g.id;
  INSERT INTO app.customer_portal_session(tenant_id,id,job_id,customer_id,grant_id,token_digest,issued_at,expires_at) VALUES(t,sid,j,c,g.id,session_digest,ts,ts+interval '1 hour');
  PERFORM app.customer_portal_audit(t,sid,'signed_in');
 ELSIF s.id IS NULL OR s.revoked_at IS NOT NULL OR s.expires_at<=ts THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
 ELSIF operation='signout' THEN
  UPDATE app.customer_portal_session SET revoked_at=ts WHERE tenant_id=t AND id=s.id;
  PERFORM app.customer_portal_audit(t,s.id,'signed_out');
 END IF;
 IF opened THEN PERFORM app.lp11_close_customer_scope(); END IF;
 RETURN jsonb_build_object('version','customer-session.v1','jobId',j,'customerId',c,'companyId',g.company_id);
END $$;

CREATE OR REPLACE FUNCTION identity.customer_portal_quote(t uuid,j uuid,c uuid,digest text,cmd jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job app.job; d app.quote_document_version; s app.customer_portal_session; g app.customer_portal_grant;
 prior app.customer_quote_approval; aid uuid:=gen_random_uuid(); eid uuid:=gen_random_uuid(); previous_id uuid; previous_seq integer;
 result jsonb; target jsonb; ts timestamptz;
BEGIN
 IF NOT (current_database()='jobguard_synthetic_demo' OR (current_database() ~ '^jobguard_pilot(_[a-z0-9]+)*$' AND current_database() !~ '^jobguard_pilot_(queue|restore)(_|$)')) OR cmd IS NULL OR jsonb_typeof(cmd)<>'object'
  OR cmd->>'jobId' IS DISTINCT FROM j::text OR cmd->>'version' IS NULL
  OR cmd->>'version' NOT IN('customer-quote-read.v1','customer-quote-acceptance.v1')
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 PERFORM app.lp11_open_customer_scope(t,j,c,digest,'resolve');
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
   PERFORM app.lp11_close_customer_scope();
   RETURN prior.result;
  END IF;
 END IF;
 -- Only the latest issued document, from the current quote revision AND current customer binding.
 SELECT doc.* INTO d FROM app.quote_document_version doc
 JOIN app.quote_revision qr ON(qr.tenant_id,qr.job_id,qr.id)=(doc.tenant_id,doc.job_id,doc.quote_revision_id)
 JOIN app.quote_draft draft ON(draft.tenant_id,draft.job_id,draft.current_revision_id)=(qr.tenant_id,qr.job_id,qr.id)
 WHERE doc.tenant_id=t AND doc.job_id=j AND (g.quote_document_id IS NULL OR doc.id=g.quote_document_id)
 AND doc.snapshot->'jobParties'->>'bindingId'=g.party_binding_id::text
 AND doc.snapshot->'jobParties'->>'customerRevisionId'=g.customer_revision_id::text
 AND EXISTS(SELECT 1 FROM app.quote_send send WHERE send.tenant_id=t AND send.job_id=j AND send.document_id=doc.id AND send.content_hash=doc.content_hash)
 AND NOT EXISTS(SELECT 1 FROM app.quote_document_version newer WHERE newer.tenant_id=t AND newer.job_id=j AND newer.document_version>doc.document_version)
 AND NOT EXISTS(SELECT 1 FROM app.acceptance_event e WHERE e.tenant_id=t AND e.job_id=j AND e.document_id=doc.id AND e.kind='superseded')
 ORDER BY doc.document_version DESC LIMIT 1;
 IF cmd->>'version'='customer-quote-read.v1' THEN
  PERFORM app.lp11_close_customer_scope();
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
 -- Switch-live binds the persisted acceptance at the command contract's millisecond precision.
 ts:=CASE WHEN current_database()='jobguard_synthetic_demo' THEN clock_timestamp()
          ELSE date_trunc('milliseconds',clock_timestamp()) END;
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
 PERFORM app.lp11_close_customer_scope();
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
END $$;

-- Only the verified customer message delegation can write a pilot source.
CREATE OR REPLACE FUNCTION app.job_source_insert_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND job_track='small_builder' AND (
    environment='synthetic_demo' OR (
      environment='pilot_no_charge' AND provenance='pilot_capture'
      AND current_database() ~ '^jobguard_pilot(_[a-z0-9]+)*$'
      AND current_database() !~ '^jobguard_pilot_(queue|restore)(_|$)'
      AND NEW.tenant_id=app.lp11_delegated_job_tenant(NEW.job_id)
      AND (TG_TABLE_NAME='customer_message_source'
        OR (TG_TABLE_NAME='job_source_original' AND to_jsonb(NEW)->>'source_kind'='customer_message'))
    )))
 THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME<>'job_source_original' THEN
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id FOR SHARE;
 IF TG_TABLE_NAME<>'job_source_original' THEN
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 PERFORM app.ch4_require_open(NEW.tenant_id,NEW.job_id);
 IF app.lp6d_maintenance_login() THEN PERFORM app.lp11_watchdog_live_maintenance(NEW.tenant_id,NEW.job_id); ELSE PERFORM app.require_watchdog_live(NEW.job_id); END IF;
 RETURN NEW;
END $$;

-- The shared customer lookup does not extend practice payment reads to the pilot.
CREATE OR REPLACE FUNCTION app.lp11_customer_operation(operation text) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF operation='billing' AND current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
 END IF;
 UPDATE control_plane.lp11_customer_scope x SET purpose=operation
 WHERE x.transaction_id=pg_current_xact_id_if_assigned() AND x.lookup_kind='authorized_session'
  AND x.purpose IS NULL AND operation IN('stage','variation','billing');
END $$;
COMMIT;
