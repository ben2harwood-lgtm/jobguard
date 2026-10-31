BEGIN;
-- LP-7: identity-only administration. No business-runtime grant, owner creation,
-- provider call, session-wide signout or change to immutable invitation policy.
CREATE FUNCTION identity.member_remove(p_session_digest char(64),p_tenant uuid,p_target uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE auth_session identity.session; actor uuid; target_member app.membership;
 audit_id uuid:=gen_random_uuid();
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'MEMBER_ADMIN_REFUSED' USING ERRCODE='42501';
 END IF;
 IF p_tenant IS NULL OR p_target IS NULL THEN
  RAISE EXCEPTION 'MEMBER_ADMIN_REFUSED' USING ERRCODE='42501';
 END IF;
 -- Same key as contractor revocation, invitation acceptance and outbox claim.
 -- Take it before reading any authority, including after a concurrent demotion.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text,54));
 SELECT * INTO auth_session FROM identity.session s WHERE s.token_digest=p_session_digest
  AND s.environment='synthetic_demo' AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_ADMIN_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT m.id INTO actor FROM identity.sso_session_memberships(auth_session.user_id,auth_session.id) m
  WHERE m.tenant_id=p_tenant AND m.role='owner';
 PERFORM set_config('app.tenant_id',p_tenant::text,true);
 IF actor IS NULL THEN RAISE EXCEPTION 'MEMBER_ADMIN_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO target_member FROM app.membership m WHERE m.tenant_id=p_tenant AND m.id=p_target
  AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r
   WHERE (r.tenant_id,r.membership_id)=(m.tenant_id,m.id)) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_ADMIN_REFUSED' USING ERRCODE='42501'; END IF;
 IF target_member.role='owner' AND NOT EXISTS(SELECT 1 FROM app.membership m
  WHERE m.tenant_id=p_tenant AND m.id<>p_target AND m.role='owner' AND m.revoked_at IS NULL
   AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r
    WHERE (r.tenant_id,r.membership_id)=(m.tenant_id,m.id))) THEN
  RAISE EXCEPTION 'MEMBER_ADMIN_REFUSED' USING ERRCODE='42501';
 END IF;
 UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=p_tenant AND id=p_target;
 -- Reuse SCIM's revocation of delegated grants; preserve historical approvals.
 INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id)
  SELECT p_tenant,gen_random_uuid(),g.id FROM app.role_grant g WHERE g.tenant_id=p_tenant AND g.membership_id=p_target
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE r.tenant_id=p_tenant AND r.grant_id=g.id);
 -- Final lock is the audit head. A failed seal rolls back every change above.
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object(
  'id',audit_id,'version','audit.v1','actorRef','membership:'||actor::text,
  'eventType','membership.removed','subjectType','membership','subjectRef',p_target::text,
  'payload',jsonb_build_object('references',jsonb_build_object('previousRole',target_member.role,'disposition','removed'),
   'classifications',jsonb_build_object('action','security')))),'checked_operation');
 RETURN jsonb_build_object('version','member-administration-result.v1','membershipId',p_target,'auditId',audit_id);
END $$;
ALTER FUNCTION identity.member_remove(char(64),uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.member_remove(char(64),uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION identity.member_remove(char(64),uuid,uuid) TO jobguard_identity;

CREATE FUNCTION identity.member_change_role(p_session_digest char(64),p_tenant uuid,p_target uuid,p_role text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE auth_session identity.session; actor uuid; target_member app.membership;
 audit_id uuid:=gen_random_uuid();
BEGIN
 IF p_role IS NULL OR p_role NOT IN ('admin','estimator','foreman','operative','finance','read_only') THEN
  RAISE EXCEPTION 'MEMBER_ADMIN_REFUSED' USING ERRCODE='42501';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'MEMBER_ADMIN_REFUSED' USING ERRCODE='42501';
 END IF;
 IF p_tenant IS NULL OR p_target IS NULL THEN
  RAISE EXCEPTION 'MEMBER_ADMIN_REFUSED' USING ERRCODE='42501';
 END IF;
 -- Same key as contractor revocation, invitation acceptance and outbox claim.
 -- Take it before reading any authority, including after a concurrent demotion.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text,54));
 SELECT * INTO auth_session FROM identity.session s WHERE s.token_digest=p_session_digest
  AND s.environment='synthetic_demo' AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_ADMIN_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT m.id INTO actor FROM identity.sso_session_memberships(auth_session.user_id,auth_session.id) m
  WHERE m.tenant_id=p_tenant AND m.role='owner';
 PERFORM set_config('app.tenant_id',p_tenant::text,true);
 IF actor IS NULL THEN RAISE EXCEPTION 'MEMBER_ADMIN_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO target_member FROM app.membership m WHERE m.tenant_id=p_tenant AND m.id=p_target
  AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r
   WHERE (r.tenant_id,r.membership_id)=(m.tenant_id,m.id)) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_ADMIN_REFUSED' USING ERRCODE='42501'; END IF;
 IF target_member.role='owner' AND NOT EXISTS(SELECT 1 FROM app.membership m
  WHERE m.tenant_id=p_tenant AND m.id<>p_target AND m.role='owner' AND m.revoked_at IS NULL
   AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r
    WHERE (r.tenant_id,r.membership_id)=(m.tenant_id,m.id))) THEN
  RAISE EXCEPTION 'MEMBER_ADMIN_REFUSED' USING ERRCODE='42501';
 END IF;
 UPDATE app.membership SET role=p_role WHERE tenant_id=p_tenant AND id=p_target;
 -- Reuse SCIM's revocation of delegated grants; preserve historical approvals.
 INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id)
  SELECT p_tenant,gen_random_uuid(),g.id FROM app.role_grant g WHERE g.tenant_id=p_tenant AND g.membership_id=p_target
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE r.tenant_id=p_tenant AND r.grant_id=g.id);
 -- Final lock is the audit head. A failed seal rolls back every change above.
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object(
  'id',audit_id,'version','audit.v1','actorRef','membership:'||actor::text,
  'eventType','membership.role_changed','subjectType','membership','subjectRef',p_target::text,
  'payload',jsonb_build_object('references',jsonb_build_object('previousRole',target_member.role,'disposition',p_role),
   'classifications',jsonb_build_object('action','security')))),'checked_operation');
 RETURN jsonb_build_object('version','member-administration-result.v1','membershipId',p_target,'auditId',audit_id);
END $$;
ALTER FUNCTION identity.member_change_role(char(64),uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.member_change_role(char(64),uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION identity.member_change_role(char(64),uuid,uuid,text) TO jobguard_identity;

COMMIT;
