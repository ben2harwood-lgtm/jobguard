BEGIN;
-- Forward fix for 0387. Preserve all existing issuer authority and expiry checks.
CREATE OR REPLACE FUNCTION identity.customer_portal_issue(t uuid,builder_digest text,j uuid,c uuid,link_digest text,content text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m app.membership; b app.job_party_binding; recipient text; g uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); ts timestamptz; hash text;
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
 INSERT INTO app.customer_portal_grant(tenant_id,id,company_id,job_id,customer_id,party_binding_id,customer_revision_id,token_digest,issuer_membership_id,outbox_id,issued_at,expires_at)
 VALUES(t,g,m.account_id,j,c,b.id,b.customer_revision_id,link_digest,m.id,o,ts,ts+interval '10 minutes');
 IF NOT app.customer_portal_current((SELECT x FROM app.customer_portal_grant x WHERE tenant_id=t AND id=g)) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.customer_portal_audit(t,g,'issued');
 RETURN g;
END $$;

-- Historical plaintext links must also stop being usable. Keep rows and audit history.
DO $$ DECLARE t uuid; gid uuid; affected uuid[]; redactions jsonb; redaction jsonb;
 seq bigint; previous text; ts timestamptz; payload jsonb; ph text; eh text;
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
  FOR redaction IN SELECT value FROM jsonb_array_elements(redactions) LOOP
   SELECT sequence,event_hash INTO seq,previous FROM app.lock_audit_head();
   seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp());
   payload:=jsonb_build_object('references',jsonb_build_object('outboxId',redaction->>'id'),
    'hashes',jsonb_build_object('originalContentHash',redaction->>'original_hash','redactedContentHash',redaction->>'content_hash'),
    'classifications',jsonb_build_object('action','security'));
   ph:=app.final_lock_hash(payload);
   eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'system:customer-portal','action_outbox.redacted','action_outbox',redaction->>'id',to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(previous,'')),'UTF8')),'hex');
   INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
   VALUES(gen_random_uuid(),t,seq,'audit.v1','system:customer-portal','action_outbox.redacted','action_outbox',redaction->>'id',ts,payload,ph,previous,eh);
   PERFORM app.advance_audit_head(seq,eh);
  END LOOP;
  FOREACH gid IN ARRAY affected LOOP
   PERFORM app.customer_portal_audit(t,gid,'redacted');
  END LOOP;
 END LOOP;
END $$;
COMMIT;
