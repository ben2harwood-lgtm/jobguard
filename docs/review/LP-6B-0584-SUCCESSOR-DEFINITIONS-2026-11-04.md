# Exact 0584 successor-definition values — 4 November 2026

The unchanged guard is `packages/db/test/plan-entitlement-lifecycle-upgrade.integration.test.ts:44`,
inside “0556 preserves all populated tables and routine ACLs, installs only the adapter body, and replays harmlessly”.
It compares `current?.definition` to `prior.definition` for each predecessor routine.
The affected routine is **`app.lp6_session_authority(text,text,uuid)`**.

This is a dynamic, whole PostgreSQL routine-definition preservation assertion, **not a recorded file hash**.
Ben’s S9 authorization does not authorize changing this guard. It remains unchanged by the repair;
the main merge brought its existing `worm_control` catalogue and dispatcher-comment changes.
Ben owns review of a narrowly scoped 0584 successor expectation while preserving the 0556-only
comparison, every other definition, and all ACL/owner checks. No broad exception is proposed here.

The old expected value is the 0562 definition captured before successor migrations. The approved
historical fixture installs that foundation early so today’s session seed can run. The new observed
value is the 0584 definition after the forward repair. The contractor-practice branch must retain
an active, unrevoked base membership, then derive and validate the switched actor from the existing
trusted `app.contractor_session` routine. Selecting the base owner as the bound actor disagreed with
the authenticated context when acting as an operative. All other branches and authority checks remain.

The complete literal old/new `pg_get_functiondef` strings follow. SHA-256 values identify these
captured strings; they are not literals stored in the guard. Both include their final newline.
An isolated real PostgreSQL 16.10 test captured the predecessor, applied 0584 alone, and captured the successor;
no guard or production source was edited. Capture command and result are in the validation journal.

Old string SHA-256: `4c3b0401c8083b41dc76744dc99abf5a812da25794031b424bc29097b407f1fc`.

New string SHA-256: `27cd0f5a1c70f7fa4e1438f444bb47a8a0e5c432d6cdd07854fffb6cc54d9227`.

## Exact old expected value

```sql
CREATE OR REPLACE FUNCTION app.lp6_session_authority(p_kind text, p_credential text, p_tenant uuid)
 RETURNS TABLE(session_ref text, actor_id uuid, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE real_session identity.session; home control_plane.practice_session;
 practice control_plane.contractor_practice_session; selected_actor uuid;
 selected_ref text; deadline timestamptz; saved_tenant text:=current_setting('app.tenant_id',true);
 saved_sso text:=current_setting('app.sso_session_id',true);
BEGIN
 IF p_tenant IS NULL OR p_kind IS NULL OR p_credential IS NULL THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF p_kind='real' AND p_credential ~ '^[0-9a-f]{64}$' THEN
  SELECT * INTO real_session FROM identity.session s WHERE s.token_digest=p_credential FOR SHARE;
  IF NOT FOUND OR real_session.revoked_at IS NOT NULL OR real_session.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  SELECT m.id INTO selected_actor FROM identity.sso_session_memberships(real_session.user_id,real_session.id) m
   WHERE m.tenant_id=p_tenant;
  selected_ref:=real_session.id::text; deadline:=real_session.expires_at;
 ELSIF p_kind='practice' AND current_database()='jobguard_synthetic_demo' AND p_credential ~ '^[0-9a-f]{64}$' THEN
  SELECT * INTO home FROM control_plane.practice_session s WHERE s.token_digest=p_credential FOR SHARE;
  IF NOT FOUND OR home.environment<>'synthetic_demo' OR home.revoked_at IS NOT NULL OR home.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  -- Existing home principal mapping, never an identity.session lookup.
  SELECT m.membership_id INTO selected_actor FROM app.authenticate_practice_session(p_credential,p_tenant) m;
  selected_ref:=encode(sha256(convert_to('lp6-home:'||p_credential,'UTF8')),'hex'); deadline:=home.expires_at;
 ELSIF p_kind='contractor_practice' AND current_database()='jobguard_synthetic_demo'
  AND p_credential ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
  SELECT * INTO practice FROM control_plane.contractor_practice_session s
   WHERE s.session_digest=app.contractor_practice_session_digest(p_credential::uuid) FOR SHARE;
  IF NOT FOUND OR practice.tenant_id IS DISTINCT FROM p_tenant OR practice.revoked_at IS NOT NULL
   OR practice.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  -- If contractor practice originated at home, revoke/expiry of home also wins.
  -- No home lock: avoid a second, differently ordered credential-row lock.
  deadline:=LEAST(practice.expires_at,app.contractor_practice_home_deadline(practice.session_digest,clock_timestamp()));
  PERFORM set_config('app.tenant_id',p_tenant::text,true);
  SELECT m.id INTO selected_actor FROM app.membership m
   WHERE (m.tenant_id,m.id,m.identity_user_id)=(p_tenant,practice.membership_id,practice.identity_user_id)
    AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE (r.tenant_id,r.membership_id)=(m.tenant_id,m.id));
  selected_ref:=practice.session_id::text;
 ELSE
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF selected_actor IS NULL OR deadline IS NULL OR deadline<=clock_timestamp() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 PERFORM set_config('app.sso_session_id',coalesce(saved_sso,''),true);
 RETURN QUERY SELECT selected_ref,selected_actor,deadline;
END $function$
```

## Exact new observed value

```sql
CREATE OR REPLACE FUNCTION app.lp6_session_authority(p_kind text, p_credential text, p_tenant uuid)
 RETURNS TABLE(session_ref text, actor_id uuid, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE real_session identity.session; home control_plane.practice_session;
 practice control_plane.contractor_practice_session; selected_actor uuid;
 selected_ref text; deadline timestamptz; saved_tenant text:=current_setting('app.tenant_id',true);
 saved_sso text:=current_setting('app.sso_session_id',true);
BEGIN
 IF p_tenant IS NULL OR p_kind IS NULL OR p_credential IS NULL THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF p_kind='real' AND p_credential ~ '^[0-9a-f]{64}$' THEN
  SELECT * INTO real_session FROM identity.session s WHERE s.token_digest=p_credential FOR SHARE;
  IF NOT FOUND OR real_session.revoked_at IS NOT NULL OR real_session.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  SELECT m.id INTO selected_actor FROM identity.sso_session_memberships(real_session.user_id,real_session.id) m
   WHERE m.tenant_id=p_tenant;
  selected_ref:=real_session.id::text; deadline:=real_session.expires_at;
 ELSIF p_kind='practice' AND current_database()='jobguard_synthetic_demo' AND p_credential ~ '^[0-9a-f]{64}$' THEN
  SELECT * INTO home FROM control_plane.practice_session s WHERE s.token_digest=p_credential FOR SHARE;
  IF NOT FOUND OR home.environment<>'synthetic_demo' OR home.revoked_at IS NOT NULL OR home.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  -- Existing home principal mapping, never an identity.session lookup.
  SELECT m.membership_id INTO selected_actor FROM app.authenticate_practice_session(p_credential,p_tenant) m;
  selected_ref:=encode(sha256(convert_to('lp6-home:'||p_credential,'UTF8')),'hex'); deadline:=home.expires_at;
 ELSIF p_kind='contractor_practice' AND current_database()='jobguard_synthetic_demo'
  AND p_credential ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
  SELECT * INTO practice FROM control_plane.contractor_practice_session s
   WHERE s.session_digest=app.contractor_practice_session_digest(p_credential::uuid) FOR SHARE;
  IF NOT FOUND OR practice.tenant_id IS DISTINCT FROM p_tenant OR practice.revoked_at IS NOT NULL
   OR practice.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  -- If contractor practice originated at home, revoke/expiry of home also wins.
  -- No home lock: avoid a second, differently ordered credential-row lock.
  deadline:=LEAST(practice.expires_at,app.contractor_practice_home_deadline(practice.session_digest,clock_timestamp()));
  PERFORM set_config('app.tenant_id',p_tenant::text,true);
  -- A switch must not revive the base owner's revoked or expired membership.
  IF NOT EXISTS(SELECT 1 FROM app.membership base
   WHERE (base.tenant_id,base.id,base.identity_user_id)=(p_tenant,practice.membership_id,practice.identity_user_id)
    AND base.revoked_at IS NULL AND (base.expires_at IS NULL OR base.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE (r.tenant_id,r.membership_id)=(base.tenant_id,base.id))) THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  SELECT m.id INTO selected_actor FROM app.contractor_session(p_credential::uuid) effective
   JOIN app.membership m ON (m.tenant_id,m.id,m.identity_user_id)=(effective.tenant_id,effective.membership_id,effective.identity_user_id)
   WHERE m.tenant_id=p_tenant
    AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE (r.tenant_id,r.membership_id)=(m.tenant_id,m.id));
  selected_ref:=practice.session_id::text;
 ELSE
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF selected_actor IS NULL OR deadline IS NULL OR deadline<=clock_timestamp() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 PERFORM set_config('app.sso_session_id',coalesce(saved_sso,''),true);
 RETURN QUERY SELECT selected_ref,selected_actor,deadline;
END $function$
```
