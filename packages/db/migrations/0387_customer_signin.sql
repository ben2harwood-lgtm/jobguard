BEGIN;
-- MON-5 foundation, synthetic only. No runtime table grants and no commercial writer.
CREATE TABLE app.customer_portal_grant (
 tenant_id uuid NOT NULL, id uuid NOT NULL, company_id uuid NOT NULL, job_id uuid NOT NULL,
 customer_id uuid NOT NULL, party_binding_id uuid NOT NULL, customer_revision_id uuid NOT NULL,
 token_digest text NOT NULL CHECK(token_digest ~ '^[a-f0-9]{64}$'),
 issuer_membership_id uuid NOT NULL, outbox_id uuid NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
 consumed_at timestamptz, revoked_at timestamptz,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,token_digest), UNIQUE(tenant_id,job_id,customer_id,id),
 FOREIGN KEY(tenant_id,company_id) REFERENCES app.account(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,party_binding_id) REFERENCES app.job_party_binding(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,customer_id,customer_revision_id) REFERENCES app.customer_revision(tenant_id,customer_id,id),
 FOREIGN KEY(tenant_id,issuer_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,outbox_id) REFERENCES app.action_outbox(tenant_id,id),
 CHECK(expires_at=issued_at+interval '10 minutes')
);
CREATE TABLE app.customer_portal_session (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, customer_id uuid NOT NULL, grant_id uuid NOT NULL,
 token_digest text NOT NULL CHECK(token_digest ~ '^[a-f0-9]{64}$'),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL, revoked_at timestamptz,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,token_digest), UNIQUE(tenant_id,grant_id),
 FOREIGN KEY(tenant_id,job_id,customer_id,grant_id) REFERENCES app.customer_portal_grant(tenant_id,job_id,customer_id,id),
 CHECK(expires_at=issued_at+interval '1 hour')
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['customer_portal_grant','customer_portal_session'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure',n);
 END LOOP;
END $$;

-- Identifier-only audit, using the same canonical payload/hash and final-lock design as mon2_audit.
CREATE FUNCTION app.customer_portal_audit(t uuid,subject uuid,kind text) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE seq bigint; previous text; ts timestamptz; payload jsonb; ph text; eh text;
BEGIN
 SELECT sequence,event_hash INTO seq,previous FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp());
 payload:=jsonb_build_object('references',jsonb_build_object('subjectId',subject::text),'classifications',jsonb_build_object('action','security'));
 ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'system:customer-portal','customer_portal.'||kind,'customer_portal',subject::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(previous,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(gen_random_uuid(),t,seq,'audit.v1','system:customer-portal','customer_portal.'||kind,'customer_portal',subject::text,ts,payload,ph,previous,eh);
 PERFORM app.advance_audit_head(seq,eh);
END $$;

CREATE FUNCTION app.customer_portal_issuer(t uuid,digest text) RETURNS app.membership
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE s identity.session; m app.membership; actor uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM identity.session WHERE token_digest=digest AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT id INTO actor FROM identity.sso_session_memberships(s.user_id,s.id) WHERE tenant_id=t AND role IN('owner','finance');
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT * INTO m FROM app.membership WHERE tenant_id=t AND id=actor AND role IN('owner','finance') AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 RETURN m;
END $$;
CREATE FUNCTION app.customer_portal_current(g app.customer_portal_grant) RETURNS boolean
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
$$;

CREATE FUNCTION identity.customer_portal_issue(t uuid,builder_digest text,j uuid,c uuid,link_digest text,content text) RETURNS uuid
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
 -- The issuer supplies only a token-bearing fragment path; no arbitrary message or destination.
 IF content !~ ('^/customer/sign-in#'||t::text||'/'||j::text||'/'||c::text||'/[A-Za-z0-9_-]{43}$') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
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

CREATE FUNCTION identity.customer_portal_use(t uuid,j uuid,c uuid,digest text,session_digest text,operation text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g app.customer_portal_grant; s app.customer_portal_session; ts timestamptz; sid uuid:=gen_random_uuid();
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR operation NOT IN('redeem','resolve','signout') OR operation IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 IF operation='redeem' THEN
  SELECT * INTO g FROM app.customer_portal_grant WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest FOR UPDATE;
 ELSE
  SELECT * INTO s FROM app.customer_portal_session WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest FOR UPDATE;
  SELECT * INTO g FROM app.customer_portal_grant WHERE tenant_id=t AND id=s.grant_id FOR UPDATE;
 END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 -- Lock current party before the final authority/clock check; stale authority never survives a wait.
 PERFORM 1 FROM app.job_party_current WHERE tenant_id=t AND job_id=j FOR SHARE;
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
 RETURN jsonb_build_object('version','customer-session.v1','jobId',j,'customerId',c,'companyId',g.company_id);
END $$;
CREATE FUNCTION identity.customer_portal_revoke(t uuid,builder_digest text,j uuid,gid uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m app.membership; g app.customer_portal_grant;
BEGIN
 m:=app.customer_portal_issuer(t,builder_digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 m:=app.customer_portal_issuer(t,builder_digest);
 SELECT * INTO g FROM app.customer_portal_grant WHERE tenant_id=t AND job_id=j AND id=gid AND company_id=m.account_id FOR UPDATE;
 IF g.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 UPDATE app.customer_portal_grant SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE tenant_id=t AND id=gid;
 UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE tenant_id=t AND id=g.outbox_id AND status IN('pending','retryable');
 PERFORM app.customer_portal_audit(t,gid,'revoked');
END $$;
DO $$ DECLARE fn text; BEGIN
 FOREACH fn IN ARRAY ARRAY['app.customer_portal_audit(uuid,uuid,text)','app.customer_portal_issuer(uuid,text)','app.customer_portal_current(app.customer_portal_grant)','identity.customer_portal_issue(uuid,text,uuid,uuid,text,text)','identity.customer_portal_use(uuid,uuid,uuid,text,text,text)','identity.customer_portal_revoke(uuid,text,uuid,uuid)'] LOOP
  EXECUTE 'ALTER FUNCTION '||fn||' OWNER TO jobguard_migration';
  EXECUTE 'REVOKE ALL ON FUNCTION '||fn||' FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure';
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION identity.customer_portal_issue(uuid,text,uuid,uuid,text,text),identity.customer_portal_use(uuid,uuid,uuid,text,text,text),identity.customer_portal_revoke(uuid,text,uuid,uuid) TO jobguard_identity;
COMMIT;
