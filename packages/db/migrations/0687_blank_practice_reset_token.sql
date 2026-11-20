BEGIN;
-- WALK-RESET-TOKEN: possession of a stored digest is not reset authority.
CREATE FUNCTION app.start_blank_practice_company_v2(new_token text, previous_token text DEFAULT NULL) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 digest text;
 previous_digest text;
 token_pattern constant text := '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501';
 END IF;
 -- Match practiceSessionV1 (Zod UUID); do not accept stored SHA-256 digests.
 IF new_token IS NULL OR length(new_token)<>36 OR new_token !~ token_pattern
  OR (previous_token IS NOT NULL AND (length(previous_token)<>36 OR previous_token !~ token_pattern)) THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000';
 END IF;
 digest := encode(sha256(convert_to(new_token,'UTF8')),'hex');
 previous_digest := CASE WHEN previous_token IS NULL THEN NULL
  ELSE encode(sha256(convert_to(previous_token,'UTF8')),'hex') END;
 IF digest IS NOT DISTINCT FROM previous_digest THEN
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
 INSERT INTO control_plane.blank_practice_session(token_digest) VALUES(digest);
 INSERT INTO control_plane.practice_session(token_digest) VALUES(digest);
 IF previous_digest IS NOT NULL THEN
  UPDATE control_plane.practice_session SET revoked_at=clock_timestamp()
   WHERE token_digest=previous_digest;
  UPDATE control_plane.blank_practice_session SET replaced_by=digest WHERE token_digest=previous_digest;
 END IF;
 -- Deliberately no seeded jobs and no business-data deletes.
END $$;
ALTER FUNCTION app.start_blank_practice_company_v2(text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.start_blank_practice_company_v2(text,text) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.start_blank_practice_company_v2(text,text) TO jobguard_runtime;
REVOKE EXECUTE ON FUNCTION app.start_blank_practice_company(text,text) FROM jobguard_runtime;
COMMIT;
