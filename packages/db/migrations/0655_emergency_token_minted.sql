BEGIN;
-- LATER-SAFETY-25: preserve the latest 0612 routine checks and its existing grants.
CREATE OR REPLACE FUNCTION identity.dark_emergency(s text, csrf text, t uuid, p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a uuid; u uuid; r identity.emergency_request; op text:=p->>'operation'; rid uuid;
 now_ts timestamptz; notices jsonb; result jsonb; target uuid; raw_token text; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 a:=identity.emergency_owner(s,csrf,t);
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM 'emergency.v1'
 OR (p-ARRAY['version','operation','requestId','reasonHash','token','targetMembershipId'])<>'{}'::jsonb
 THEN RAISE EXCEPTION 'EMERGENCY_INVALID' USING ERRCODE='22023'; END IF;
 IF op='notices' THEN
  -- All owners see every action, including approvals, opening, and subsequent use. No dismiss/delete path.
  SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('ownerName',n.email) ORDER BY e.created_at,e.id),'[]'::jsonb) INTO notices
   FROM identity.emergency_action e JOIN app.membership m ON(m.tenant_id,m.id)=(e.tenant_id,e.actor)
   JOIN identity.user_email n ON n.user_id=m.identity_user_id WHERE e.tenant_id=t;
  PERFORM app.ef_audit(a,'sso.emergency.notices','membership',a,
   jsonb_build_object('references',jsonb_build_object('membershipId',a::text),'classifications',jsonb_build_object('data','security')));
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
   IF a<>r.requester OR p ? 'token'
    OR (SELECT count(DISTINCT ap.approver_user) FROM identity.emergency_approval ap JOIN app.membership m
      ON(m.tenant_id,m.id,m.identity_user_id)=(ap.tenant_id,ap.approver,ap.approver_user)
      WHERE ap.tenant_id=t AND ap.request_id=rid AND m.role='owner' AND m.revoked_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at>now_ts)
      AND m.id<>r.requester AND m.identity_user_id<>(SELECT identity_user_id FROM app.membership WHERE tenant_id=t AND id=r.requester))<2
    THEN RAISE EXCEPTION 'EMERGENCY_TWO_OWNERS_REQUIRED' USING ERRCODE='42501'; END IF;
   -- Two independently generated UUIDv4 values provide 244 random bits without an extension or new grants.
   raw_token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
   INSERT INTO identity.emergency_session VALUES(t,rid,encode(sha256(convert_to(raw_token,'UTF8')),'hex'),now_ts,now_ts+interval '1 hour');
   result:=jsonb_build_object('expiresAt',now_ts+interval '1 hour','token',raw_token);
  END IF;
 ELSIF op IN('inspect','revoke_member') THEN
  IF a<>r.requester OR coalesce(p->>'token','') !~ '^[a-f0-9]{64}$' OR NOT EXISTS(SELECT 1 FROM identity.emergency_session WHERE tenant_id=t AND request_id=rid
    AND token_hash=encode(sha256(convert_to(p->>'token','UTF8')),'hex') AND expires_at>now_ts)
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
COMMIT;
