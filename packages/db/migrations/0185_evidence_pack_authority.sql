BEGIN;
-- Reuse the existing, narrow practice-principal capability. No new routine,
-- table privilege, principal, role or permitted tenant is introduced.
-- A caller retaining this transaction now fences revocation through commit.
CREATE OR REPLACE FUNCTION app.authenticate_practice_session(digest text, requested_tenant uuid DEFAULT '11111111-1111-4111-8111-111111111111'::uuid)
 RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_setting('app.evidence_pack_approval_fence',true)='on' THEN
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM requested_tenant::text THEN RETURN; END IF;
 -- Lock order: session, then the fixed practice membership. Lock by identity
 -- first; evaluate mutable permission/deadlines in a fresh statement after ALL
 -- waits so neither a committed revocation nor elapsed expiry is overlooked.
 PERFORM 1 FROM control_plane.practice_session s WHERE s.token_digest=digest FOR SHARE;
 IF NOT FOUND THEN RETURN; END IF;
 -- FOR SHARE uses the tenant's existing UPDATE RLS policy. The approval path
 -- above requires that matching context; no bootstrap RLS policy is expanded.
  PERFORM 1 FROM app.membership m WHERE m.tenant_id=requested_tenant
   AND ((m.tenant_id='11111111-1111-4111-8111-111111111111'::uuid AND m.id='d1500000-0000-4000-8000-000000000003'::uuid) OR (m.tenant_id='33333333-3333-4333-8333-333333333333'::uuid AND m.id='33333333-3333-4333-8333-333333333335'::uuid))
   AND m.identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
 END IF;
 RETURN QUERY
 SELECT m.tenant_id,m.id,m.identity_user_id FROM control_plane.practice_session s
 JOIN app.membership m ON m.tenant_id=requested_tenant
  AND ((m.tenant_id='11111111-1111-4111-8111-111111111111'::uuid AND m.id='d1500000-0000-4000-8000-000000000003'::uuid) OR (m.tenant_id='33333333-3333-4333-8333-333333333333'::uuid AND m.id='33333333-3333-4333-8333-333333333335'::uuid))
  AND m.identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid
 WHERE s.token_digest=digest AND s.environment='synthetic_demo'
  AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
  AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp());
END $$;
-- CREATE OR REPLACE preserves the pre-existing owner and exact EXECUTE ACL.
COMMIT;
