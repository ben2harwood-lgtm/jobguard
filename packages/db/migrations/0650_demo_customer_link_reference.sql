BEGIN;
-- LATER-SAFETY-13: forward fix from the latest (0518) demo issuer body.
CREATE OR REPLACE FUNCTION app.demo_issue_customer_link(t uuid,j uuid,c uuid,session_digest text,link_digest text,content text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor record; m app.membership; b app.job_party_binding; recipient text; g uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); ts timestamptz; hash text;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM app.final_check_builder(t,j,session_digest);
 -- Narrow: only the practice tenant, only after lock, only while a found extra exists for the customer to review.
 IF t<>'11111111-1111-4111-8111-111111111111'::uuid THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j)
  OR NOT EXISTS(SELECT 1 FROM app.extra_origin WHERE tenant_id=t AND job_id=j AND kind='jobguard_catch') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 SELECT * INTO m FROM app.membership WHERE tenant_id=t AND id=actor.member_id AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 SELECT bnd.* INTO b FROM app.job_party_current pc JOIN app.job_party_binding bnd ON(bnd.tenant_id,bnd.job_id,bnd.id)=(pc.tenant_id,pc.job_id,pc.binding_id)
 WHERE pc.tenant_id=t AND pc.job_id=j AND bnd.customer_id=c FOR SHARE OF pc;
 SELECT lower(payload->>'email') INTO recipient FROM app.customer_revision WHERE tenant_id=t AND id=b.customer_revision_id;
 IF b.id IS NULL OR recipient IS NULL OR recipient !~ '^[^@[:space:]]+@[^@[:space:]]+\.invalid$' OR link_digest IS NULL OR link_digest !~ '^[a-f0-9]{64}$'
  OR content IS NULL OR length(content)>4096 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 -- Preserve exact legacy path validation for existing synthetic callers, but never persist a credential.
 IF content ~ ('^/customer/sign-in#'||t::text||'/'||j::text||'/'||c::text||'/[A-Za-z0-9_-]{43}$') THEN
  content:='customer-signin-redacted.v1:'||encode(sha256(convert_to(content,'UTF8')),'hex');
 ELSE
  -- Same non-credential reference boundary as 0533's identity.customer_portal_issue.
  IF content !~ ('^customer-signin-reference\.v1:'||t::text||'/'||j::text||'/'||c::text||'/[A-Za-z0-9_-]{43}$') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
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
 INSERT INTO app.customer_portal_grant(tenant_id,id,company_id,job_id,customer_id,party_binding_id,customer_revision_id,token_digest,issuer_membership_id,outbox_id,issued_at,expires_at)
 VALUES(t,g,m.account_id,j,c,b.id,b.customer_revision_id,link_digest,m.id,o,ts,ts+interval '10 minutes');
 IF NOT app.customer_portal_current((SELECT x FROM app.customer_portal_grant x WHERE tenant_id=t AND id=g)) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.customer_portal_audit(t,g,'issued');
 RETURN g;
END $$;

-- Historical plaintext links must also stop being usable. Keep rows and audit history.
DO $$ DECLARE t uuid; gid uuid; affected uuid[]; redactions jsonb; redaction jsonb;
 payload jsonb; events jsonb;
BEGIN
 FOR t IN SELECT id FROM control_plane.tenant LOOP
  PERFORM set_config('app.tenant_id',t::text,true);
  SELECT coalesce(array_agg(g.id),'{}'::uuid[]) INTO affected FROM app.customer_portal_grant g
   JOIN app.action_outbox o ON(o.tenant_id,o.id)=(g.tenant_id,g.outbox_id)
   WHERE g.tenant_id=t AND o.action_type='customer_portal.signin.send' AND o.immutable_content LIKE '/customer/sign-in#%';
  UPDATE app.customer_portal_grant g SET revoked_at=coalesce(g.revoked_at,clock_timestamp())
   WHERE g.tenant_id=t AND EXISTS(SELECT 1 FROM app.action_outbox o WHERE o.tenant_id=t AND o.id=g.outbox_id AND o.action_type='customer_portal.signin.send' AND o.immutable_content LIKE '/customer/sign-in#%');
  -- Both values use the old hash. RETURNING retains it from the digest-only marker.
  -- Finish business writes before taking the tenant's final audit-head lock.
  WITH redacted AS (
   UPDATE app.action_outbox SET immutable_content='customer-signin-redacted.v1:'||content_hash,
    content_hash=encode(sha256(convert_to('customer-signin-redacted.v1:'||content_hash,'UTF8')),'hex'),
    status=CASE WHEN status IN('pending','retryable') THEN 'cancelled' ELSE status END,
    updated_at=clock_timestamp()
    WHERE tenant_id=t AND action_type='customer_portal.signin.send' AND immutable_content LIKE '/customer/sign-in#%'
    RETURNING id,content_hash,split_part(immutable_content,':',2) AS original_hash
  ) SELECT coalesce(jsonb_agg(to_jsonb(redacted) ORDER BY id),'[]'::jsonb) INTO redactions FROM redacted;
  events:='[]'::jsonb;
  FOR redaction IN SELECT value FROM jsonb_array_elements(redactions) LOOP
   payload:=jsonb_build_object('references',jsonb_build_object('outboxId',redaction->>'id'),
    'hashes',jsonb_build_object('originalContentHash',redaction->>'original_hash','redactedContentHash',redaction->>'content_hash'),
    'classifications',jsonb_build_object('action','security'));
   events:=events||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
    'actorRef','system:customer-portal','eventType','action_outbox.redacted','subjectType','action_outbox',
    'subjectRef',redaction->>'id','payload',payload));
  END LOOP;
  PERFORM app.lp4_seal_audit(events,'checked_operation');
  FOREACH gid IN ARRAY affected LOOP
   PERFORM app.customer_portal_audit(t,gid,'redacted');
  END LOOP;
 END LOOP;
END $$;
COMMIT;
