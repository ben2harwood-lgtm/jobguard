BEGIN;
-- ENT-11b: only Northside's named fictional finance worker may additionally use finance/read_only grants.
-- Keep the made-up-company proof, owner/session binding, no-sign-in checks and wider-grant refusal.
-- CREATE OR REPLACE preserves the existing private owner/ACL/configuration; no tables or grants are added.
CREATE OR REPLACE FUNCTION app.practice_worker_switch_decision(p_session_ref uuid,p_worker uuid)
 RETURNS TABLE(decision text,reason_code text,company uuid,owner_member uuid,owner_user uuid,worker_user uuid)
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE rule record; member_user uuid;
BEGIN
 BEGIN SELECT * INTO STRICT rule FROM app.practice_company_made_up(p_session_ref);
 EXCEPTION WHEN no_data_found OR too_many_rows THEN
  decision:='forbidden'; reason_code:='unexpected'; RETURN NEXT; RETURN;
 END;
 decision:='forbidden'; reason_code:=rule.reason_code;
 IF rule.verdict IS DISTINCT FROM 'made_up' THEN RETURN NEXT; RETURN; END IF;
 company:=rule.company; owner_member:=rule.owner_member; owner_user:=rule.owner_user;
 decision:='not_found'; reason_code:='worker';
 SELECT m.identity_user_id INTO member_user FROM app.membership m
 WHERE m.tenant_id=rule.company AND m.id=p_worker AND m.id<>rule.owner_member
 AND (m.role IN('operative','supervisor','surveyor','client_approver') OR (
  m.role='finance' AND EXISTS(SELECT 1 FROM app.northside_run n WHERE n.tenant_id=rule.company)
  AND EXISTS(SELECT 1 FROM app.contractor_member c WHERE(c.tenant_id,c.membership_id)=(m.tenant_id,m.id)
   AND c.email='finance@northside-fictional.invalid')))
 AND app.contractor_member_active(m.id)
 AND NOT EXISTS(SELECT 1 FROM app.role_grant g WHERE g.tenant_id=rule.company AND g.membership_id=m.id
  AND g.role NOT IN('operative','supervisor','surveyor','client_approver')
  AND NOT (m.role='finance' AND g.role IN('finance','read_only') AND g.scope_kind='tenant'
   AND g.scope_id=rule.company AND g.contract_id IS NULL)
  AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE r.tenant_id=rule.company AND r.grant_id=g.id))
 AND NOT EXISTS(SELECT 1 FROM identity.user_email e WHERE e.user_id=m.identity_user_id)
 AND NOT EXISTS(SELECT 1 FROM identity.membership_locator l WHERE l.user_id=m.identity_user_id)
 AND NOT EXISTS(SELECT 1 FROM identity.session s WHERE s.user_id=m.identity_user_id);
 IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
 decision:='allowed'; reason_code:='allowed'; worker_user:=member_user; RETURN NEXT;
END $$;

COMMIT;
