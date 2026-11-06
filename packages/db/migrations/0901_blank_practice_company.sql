BEGIN;
-- Control-plane session metadata only. Business rows retain the existing,
-- immutable practice-session ownership boundary inside the synthetic tenant.
ALTER TABLE control_plane.practice_session
 ADD COLUMN blank_company boolean NOT NULL DEFAULT false,
 ADD COLUMN replaced_by char(64) REFERENCES control_plane.practice_session(token_digest);

CREATE FUNCTION app.is_blank_practice_company(digest text) RETURNS boolean
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT current_database()='jobguard_synthetic_demo' AND EXISTS(
  SELECT 1 FROM control_plane.practice_session s
  WHERE s.token_digest=digest AND s.blank_company
   AND EXISTS(SELECT 1 FROM app.authenticate_practice_session(digest)))
$$;
ALTER FUNCTION app.is_blank_practice_company(text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.is_blank_practice_company(text) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.is_blank_practice_company(text) TO jobguard_runtime;

CREATE FUNCTION app.start_blank_practice_company(digest text, previous_digest text DEFAULT NULL) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF digest IS NULL OR digest !~ '^[0-9a-f]{64}$' OR digest IS NOT DISTINCT FROM previous_digest THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000';
 END IF;
 IF previous_digest IS NOT NULL THEN
  -- Reset owns only the presented live blank session. Recheck after waiting;
  -- parallel resets cannot both succeed. Retain old jobs, sources and audit.
  PERFORM 1 FROM control_plane.practice_session s WHERE s.token_digest=previous_digest FOR UPDATE;
  IF NOT app.is_blank_practice_company(previous_digest) THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000';
  END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM app.membership m
   WHERE m.tenant_id='11111111-1111-4111-8111-111111111111'::uuid
    AND m.id='d1500000-0000-4000-8000-000000000003'::uuid
    AND m.identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid
    AND m.role='owner' AND m.revoked_at IS NULL
    AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())) THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000';
  END IF;
 END IF;
 INSERT INTO control_plane.practice_session(token_digest,blank_company) VALUES(digest,true);
 IF previous_digest IS NOT NULL THEN
  UPDATE control_plane.practice_session SET revoked_at=clock_timestamp(),replaced_by=digest
   WHERE token_digest=previous_digest;
 END IF;
 -- Deliberately no seeded jobs and no business-data deletes.
END $$;
ALTER FUNCTION app.start_blank_practice_company(text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.start_blank_practice_company(text,text) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.start_blank_practice_company(text,text) TO jobguard_runtime;
COMMIT;
