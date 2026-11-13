BEGIN;
-- LATER-SAFETY-56: keep owner projection access scoped to the atomic finish recheck.
CREATE OR REPLACE FUNCTION app.lp_authority(p_session uuid,p_job uuid,p_action text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; identity_user uuid; member_role text; role_set text[];
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 SELECT s.membership_id,s.identity_user_id INTO a,identity_user FROM app.contractor_session(p_session) s WHERE s.tenant_id=t;
 -- Lock the session row so a revocation cannot pass this command's recheck.
 PERFORM 1 FROM control_plane.contractor_practice_session s WHERE s.session_digest=app.contractor_practice_session_digest(p_session) FOR SHARE;
 SELECT m.role INTO member_role FROM app.membership m JOIN app.contractor_member c ON(c.tenant_id,c.membership_id)=(m.tenant_id,m.id)
 WHERE m.tenant_id=t AND m.id=a AND m.identity_user_id=identity_user AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE(r.tenant_id,r.membership_id)=(m.tenant_id,m.id));
 role_set:=CASE p_action WHEN 'materials' THEN ARRAY['finance','owner'] WHEN 'list' THEN ARRAY['supervisor'] WHEN 'endcheck' THEN ARRAY['owner'] ELSE ARRAY['supervisor','surveyor','commercial_manager'] END;
 -- The owner may use the existing rule (a) projections only inside their unaudited
 -- same-job EndCheck. The deferred audit guard prevents an unaudited receipt from
 -- committing; appending the command audit closes this read window before commit.
 IF p_action='detail' AND member_role='owner' AND EXISTS(
  SELECT 1 FROM app.contractor_job_finish f JOIN app.command_receipt r
   ON(r.tenant_id,r.command_id)=(f.tenant_id,f.command_id)
  WHERE f.tenant_id=t AND f.job_id=p_job AND f.actor_membership_id=a
   AND r.actor_membership_id=a AND r.command_type='EndCheck' AND r.status='succeeded'
   AND NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=t AND e.id=r.command_id)
 ) THEN role_set:=array_append(role_set,'owner'); END IF;
 IF member_role IS NULL OR NOT member_role=ANY(role_set) OR NOT EXISTS(
  SELECT 1 FROM app.job j JOIN app.work_order w ON(w.tenant_id,w.job_id)=(j.tenant_id,j.id)
  JOIN app.job_commercial_track tr ON(tr.tenant_id,tr.job_id)=(j.tenant_id,j.id)
  JOIN app.team tm ON tm.tenant_id=j.tenant_id AND tm.id=app.contractor_job_team(j.id)
  JOIN app.org_unit b ON(b.tenant_id,b.id)=(tm.tenant_id,tm.branch_id)
  JOIN app.role_grant g ON g.tenant_id=j.tenant_id AND g.membership_id=a AND g.role=member_role
  WHERE j.tenant_id=t AND j.id=p_job AND j.provenance='work_order' AND tr.job_track='contractor' AND tr.environment='synthetic_demo'
  AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
  AND (g.scope_kind='tenant' AND g.scope_id=t OR g.scope_kind='team' AND g.scope_id=tm.id OR g.scope_kind='branch' AND g.scope_id=b.id OR g.scope_kind='region' AND g.scope_id=b.parent_id))
 THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) s WHERE s.tenant_id=t AND s.membership_id=a) THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN('list','detail') THEN
  PERFORM app.mon8_require_feature(a,'site_origin_capture');
  IF NOT coalesce(app.contractor_member_active(a),false) THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  -- Serialize before taking the job SHARE lock: confirmation may upgrade it via scope writes.
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_job::text,417));
  PERFORM app.require_watchdog_live(p_job);
  -- Serializes baseline imports; their UPDATE of work_order_current waits for this lock.
  PERFORM 1 FROM app.work_order_current c JOIN app.work_order w ON(w.tenant_id,w.id)=(c.tenant_id,c.work_order_id) WHERE w.tenant_id=t AND w.job_id=p_job FOR SHARE OF c;
  IF EXISTS(SELECT 1 FROM app.work_order w JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id) JOIN app.work_order_revision r ON(r.tenant_id,r.id)=(c.tenant_id,c.revision_id) WHERE w.tenant_id=t AND w.job_id=p_job AND r.status<>'ordered') THEN RAISE EXCEPTION 'JOB_NOT_LIVE'; END IF;
 END IF;
 RETURN a;
END $$;
COMMIT;
