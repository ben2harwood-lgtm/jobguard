BEGIN;
-- ENT-10-rest DARK: a separate, restricted emergency capability. Never opens the tenant-wide SSO switch.
CREATE TABLE identity.emergency_request (
 tenant_id uuid NOT NULL, id uuid NOT NULL, requester uuid NOT NULL, reason_hash text NOT NULL CHECK(reason_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,requester) REFERENCES app.membership(tenant_id,id),
 CHECK(expires_at=created_at+interval '15 minutes')
);
CREATE TABLE identity.emergency_approval (
 tenant_id uuid NOT NULL, request_id uuid NOT NULL, approver uuid NOT NULL, approver_user uuid NOT NULL,
 PRIMARY KEY(tenant_id,request_id,approver_user), FOREIGN KEY(tenant_id,request_id) REFERENCES identity.emergency_request(tenant_id,id),
 FOREIGN KEY(tenant_id,approver,approver_user) REFERENCES app.membership(tenant_id,id,identity_user_id)
);
CREATE TABLE identity.emergency_session (
 tenant_id uuid NOT NULL, request_id uuid NOT NULL, token_hash text NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 opened_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,request_id), UNIQUE(token_hash),
 FOREIGN KEY(tenant_id,request_id) REFERENCES identity.emergency_request(tenant_id,id), CHECK(expires_at=opened_at+interval '1 hour')
);
CREATE TABLE identity.emergency_action (
 tenant_id uuid NOT NULL, id uuid NOT NULL, request_id uuid NOT NULL, actor uuid NOT NULL, operation text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,request_id) REFERENCES identity.emergency_request(tenant_id,id),
 FOREIGN KEY(tenant_id,actor) REFERENCES app.membership(tenant_id,id),
 CHECK(operation IN('request','approve','open','inspect','revoke_member'))
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['emergency_request','emergency_approval','emergency_session','emergency_action'] LOOP
  EXECUTE format('ALTER TABLE identity.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE identity.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE identity.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON identity.%I TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON identity.%I FROM PUBLIC,jobguard_identity,jobguard_runtime,jobguard_infrastructure',n);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON identity.%I FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation()',n);
 END LOOP;
END $$;
-- Session and CSRF are proved again under the shared tenant lock, including when SSO is unavailable.
CREATE FUNCTION identity.emergency_owner(s text, csrf text, t uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a uuid; BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR t::text IS DISTINCT FROM current_setting('app.tenant_id',true)
 THEN RAISE EXCEPTION 'EMERGENCY_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT m.id INTO a FROM identity.session x JOIN app.membership m ON m.identity_user_id=x.user_id
 WHERE x.token_digest=s AND x.csrf_token=csrf AND x.revoked_at IS NULL AND x.expires_at>clock_timestamp()
 AND EXISTS(SELECT 1 FROM identity.user_email e WHERE e.user_id=x.user_id)
 AND x.environment='synthetic_demo' AND m.tenant_id=t AND m.role='owner' AND m.revoked_at IS NULL
 AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) FOR SHARE OF x,m;
 IF a IS NULL THEN RAISE EXCEPTION 'EMERGENCY_REFUSED' USING ERRCODE='42501'; END IF;
 RETURN a;
END $$;
CREATE FUNCTION identity.dark_emergency(s text, csrf text, t uuid, p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a uuid; u uuid; r identity.emergency_request; op text:=p->>'operation'; rid uuid;
 now_ts timestamptz; notices jsonb; result jsonb; target uuid; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 a:=identity.emergency_owner(s,csrf,t);
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM 'emergency.v1'
 OR (p-ARRAY['version','operation','requestId','reasonHash','tokenHash','targetMembershipId'])<>'{}'::jsonb
 THEN RAISE EXCEPTION 'EMERGENCY_INVALID' USING ERRCODE='22023'; END IF;
 IF op='notices' THEN
  -- All owners see every action, including approvals, opening, and subsequent use. No dismiss/delete path.
  SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('ownerName',n.email) ORDER BY e.created_at,e.id),'[]'::jsonb) INTO notices
   FROM identity.emergency_action e JOIN app.membership m ON(m.tenant_id,m.id)=(e.tenant_id,e.actor)
   JOIN identity.user_email n ON n.user_id=m.identity_user_id WHERE e.tenant_id=t;
  PERFORM app.ef_audit(a,'sso.emergency.notices','membership',a,
   jsonb_build_object('classifications',jsonb_build_object('data','security')));
  RETURN jsonb_build_object('notices',notices);
 END IF;
 rid:=(p->>'requestId')::uuid;
 IF rid IS NULL THEN RAISE EXCEPTION 'EMERGENCY_INVALID' USING ERRCODE='22023'; END IF;
 now_ts:=clock_timestamp();
 SELECT * INTO r FROM identity.emergency_request WHERE tenant_id=t AND id=rid;
 IF op='request' THEN
  IF r.id IS NOT NULL OR coalesce(p->>'reasonHash','') !~ '^[a-f0-9]{64}$'
   THEN RAISE EXCEPTION 'EMERGENCY_REPLAY' USING ERRCODE='23505'; END IF;
  INSERT INTO identity.emergency_request VALUES(t,rid,a,p->>'reasonHash',now_ts,now_ts+interval '15 minutes');
 ELSIF r.id IS NULL THEN RAISE EXCEPTION 'EMERGENCY_REFUSED' USING ERRCODE='42501';
 ELSIF op IN('approve','open') THEN
  IF r.expires_at<=now_ts OR EXISTS(SELECT 1 FROM identity.emergency_session WHERE tenant_id=t AND request_id=rid)
   THEN RAISE EXCEPTION 'EMERGENCY_EXPIRED_OR_USED' USING ERRCODE='42501'; END IF;
  IF op='approve' THEN
   SELECT identity_user_id INTO u FROM app.membership WHERE tenant_id=t AND id=a;
   IF a=r.requester OR EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=r.requester AND identity_user_id=u)
    THEN RAISE EXCEPTION 'EMERGENCY_SELF_APPROVAL' USING ERRCODE='42501'; END IF;
   INSERT INTO identity.emergency_approval VALUES(t,rid,a,u);
  ELSE
   IF a<>r.requester OR coalesce(p->>'tokenHash','') !~ '^[a-f0-9]{64}$'
    OR (SELECT count(DISTINCT ap.approver_user) FROM identity.emergency_approval ap JOIN app.membership m
      ON(m.tenant_id,m.id,m.identity_user_id)=(ap.tenant_id,ap.approver,ap.approver_user)
      WHERE ap.tenant_id=t AND ap.request_id=rid AND m.role='owner' AND m.revoked_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at>now_ts))<>2
    THEN RAISE EXCEPTION 'EMERGENCY_TWO_OWNERS_REQUIRED' USING ERRCODE='42501'; END IF;
   INSERT INTO identity.emergency_session VALUES(t,rid,p->>'tokenHash',now_ts,now_ts+interval '1 hour');
   result:=jsonb_build_object('expiresAt',now_ts+interval '1 hour');
  END IF;
 ELSIF op IN('inspect','revoke_member') THEN
  IF a<>r.requester OR NOT EXISTS(SELECT 1 FROM identity.emergency_session WHERE tenant_id=t AND request_id=rid
    AND token_hash=p->>'tokenHash' AND expires_at>now_ts)
   THEN RAISE EXCEPTION 'EMERGENCY_REFUSED' USING ERRCODE='42501'; END IF;
  IF op='inspect' THEN
   SELECT jsonb_build_object('required',required,'revision',revision) INTO result FROM identity.sso_required_state(t);
  ELSE
   target:=(p->>'targetMembershipId')::uuid;
   -- Restricted recovery only: never change an owner, journals, evidence, Decisions or the SSO-required switch.
   IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=target AND role<>'owner' AND revoked_at IS NULL)
    THEN RAISE EXCEPTION 'EMERGENCY_OWNER_PROTECTED' USING ERRCODE='42501'; END IF;
   UPDATE app.membership SET revoked_at=now_ts WHERE tenant_id=t AND id=target AND role<>'owner';
   INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id)
    SELECT t,gen_random_uuid(),g.id FROM app.role_grant g WHERE g.tenant_id=t AND g.membership_id=target
    AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation v WHERE v.tenant_id=t AND v.grant_id=g.id);
  END IF;
 ELSE RAISE EXCEPTION 'EMERGENCY_INVALID' USING ERRCODE='22023'; END IF;
 INSERT INTO identity.emergency_action(tenant_id,id,request_id,actor,operation) VALUES(t,gen_random_uuid(),rid,a,op);
 -- Final lock: effect, visible notice and chain seal commit atomically. Audit failure rolls everything back.
 PERFORM app.ef_audit(a,'sso.emergency.'||op,'emergency_request',rid,
  jsonb_build_object('references',jsonb_build_object('requestId',rid::text),'hashes',jsonb_build_object('request',app.final_lock_hash(p)),
   'classifications',jsonb_build_object('data','security')));
 RETURN coalesce(result,'{}'::jsonb)||jsonb_build_object('requestId',rid,'operation',op);
END $$;
ALTER FUNCTION identity.emergency_owner(text,text,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION identity.dark_emergency(text,text,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.emergency_owner(text,text,uuid) FROM PUBLIC,jobguard_identity,jobguard_runtime,jobguard_infrastructure;
REVOKE ALL ON FUNCTION identity.dark_emergency(text,text,uuid,jsonb) FROM PUBLIC,jobguard_identity,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION identity.dark_emergency(text,text,uuid,jsonb) TO jobguard_identity;
COMMIT;
