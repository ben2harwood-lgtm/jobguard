BEGIN;
-- Synthetic, post-lock review surface only. No table privileges or fee authority.
CREATE FUNCTION app.read_recovery_billability(j uuid,c uuid,digest text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a record; revision integer; practice boolean;
BEGIN
 IF NOT pg_has_role(session_user,'jobguard_runtime','USAGE')
 THEN RAISE EXCEPTION 'BILLABILITY_NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM app.authenticate_practice_session(digest,t);
 practice:=FOUND;
 IF NOT practice THEN
  BEGIN
   SELECT m.id membership_id,m.identity_user_id INTO STRICT a FROM identity.session s JOIN app.membership m ON m.identity_user_id=s.user_id
   WHERE s.token_digest=digest AND s.environment='synthetic_demo' AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
   AND m.tenant_id=t AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp());
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
   RAISE EXCEPTION 'BILLABILITY_NOT_FOUND' USING ERRCODE='42501';
  END;
 END IF;
 -- Ownership and lock precede all source/review reads. No pre-lock shadow signal.
 IF current_database()<>'jobguard_synthetic_demo' OR NOT EXISTS(SELECT 1 FROM app.job x JOIN app.final_account_lock k ON(k.tenant_id,k.job_id)=(x.tenant_id,x.id)
  WHERE x.tenant_id=t AND x.id=j AND x.practice_session_digest IS NOT NULL
  AND (NOT practice OR x.practice_session_digest=digest))
 THEN RAISE EXCEPTION 'BILLABILITY_NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT r.revision INTO revision FROM app.recovery_case_current r WHERE r.tenant_id=t AND r.job_id=j AND r.id=c AND r.synthetic;
 IF revision IS NULL THEN RAISE EXCEPTION 'BILLABILITY_NOT_FOUND' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('version','recovery-billability-view.v1','caseId',c,'caseRevision',revision,
  'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('workId',b.work_id,'lineId',b.line_id) ORDER BY b.work_id,b.line_id)
   FROM app.stored_receipt_case_binding b WHERE b.tenant_id=t AND b.job_id=j AND b.case_id=c),'[]'::jsonb),
  'reviews',coalesce((SELECT jsonb_agg(jsonb_build_object('workId',r.payload->'workId','lineId',r.payload->'lineId','review',r.result,
   'approved',EXISTS(SELECT 1 FROM app.recovery_billability_command p WHERE p.tenant_id=t AND p.job_id=j AND p.case_id=c AND p.review_command_id=r.command_id AND p.action='approve')) ORDER BY r.created_at,r.command_id)
   FROM app.recovery_billability_command r WHERE r.tenant_id=t AND r.job_id=j AND r.case_id=c AND r.action='review'),'[]'::jsonb));
END $$;
ALTER FUNCTION app.read_recovery_billability(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.read_recovery_billability(uuid,uuid,text) FROM PUBLIC,jobguard_shadow,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.read_recovery_billability(uuid,uuid,text) TO jobguard_runtime;
COMMIT;
