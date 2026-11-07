BEGIN;
-- Bind checkpoint writes to the identity user of the authenticated membership.
-- Forward-fix only; retain the synthetic database, tenant and generation guards.
CREATE OR REPLACE FUNCTION app.sync_snapshot_generation(u uuid,r bigint,s bigint,h text,e text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid := nullif(current_setting('app.tenant_id',true),'')::uuid; g bigint;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'SYNC_CHECKPOINT_INVALID';
 END IF;
 BEGIN
  IF t IS DISTINCT FROM app.current_tenant() OR u IS DISTINCT FROM (
   SELECT m.identity_user_id FROM app.membership m
   WHERE m.tenant_id=app.current_tenant() AND m.id=app.current_actor()
    AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    AND NOT EXISTS (SELECT 1 FROM app.contractor_membership_revocation v
     WHERE v.tenant_id=m.tenant_id AND v.membership_id=m.id)
  ) THEN
   RAISE EXCEPTION 'SYNC_AUTHORITY_REQUIRED';
  END IF;
 EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'SYNC_AUTHORITY_REQUIRED';
 END;
 IF t IS NULL OR u IS NULL OR e IS DISTINCT FROM 'synthetic_demo'
  OR r IS NULL OR r NOT BETWEEN 0 AND 9007199254740991
  OR s IS NULL OR s NOT BETWEEN 1 AND 9007199254740991
  OR h IS NULL OR h !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'SYNC_CHECKPOINT_INVALID';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.identity_user_id=u
  AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND NOT EXISTS (SELECT 1 FROM app.contractor_membership_revocation v
   WHERE v.tenant_id=m.tenant_id AND v.membership_id=m.id)) THEN
  RAISE EXCEPTION 'SYNC_CHECKPOINT_INVALID';
 END IF;
 INSERT INTO app.sync_snapshot_checkpoint AS c(tenant_id,user_id,authority_revision,schema_version,scope_hash,generation)
 VALUES(t,u,r,s,h,1)
 ON CONFLICT(tenant_id,user_id) DO UPDATE SET
  authority_revision=excluded.authority_revision,schema_version=excluded.schema_version,scope_hash=excluded.scope_hash,
  generation=c.generation + (CASE WHEN excluded.authority_revision>c.authority_revision
   OR excluded.schema_version>c.schema_version THEN 1 ELSE 0 END)
 WHERE excluded.authority_revision>=c.authority_revision AND excluded.schema_version>=c.schema_version
  AND (excluded.authority_revision>c.authority_revision OR excluded.scope_hash=c.scope_hash)
 RETURNING generation INTO g;
 IF g IS NULL THEN RAISE EXCEPTION 'SYNC_CHECKPOINT_STALE'; END IF;
 RETURN g;
END $$;
ALTER FUNCTION app.sync_snapshot_generation(uuid,bigint,bigint,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.sync_snapshot_generation(uuid,bigint,bigint,text,text) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.sync_snapshot_generation(uuid,bigint,bigint,text,text) TO jobguard_runtime;
-- Forward-fix only: preserve checkpoint rows and generations.
COMMIT;
