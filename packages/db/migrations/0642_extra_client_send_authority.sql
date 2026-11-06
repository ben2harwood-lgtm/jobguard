BEGIN;
CREATE FUNCTION app.xc_send_authority(p_actor uuid,p_extra uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(EXISTS(SELECT 1 FROM app.variation v WHERE v.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND v.id=p_extra
 AND app.xa_covers(p_actor,ARRAY['surveyor','commercial_manager'],v.job_id,'job.read') IS NOT NULL),false)
$$;
ALTER FUNCTION app.xc_send_authority(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.xc_send_authority(uuid,uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.xc_send_authority(uuid,uuid) TO jobguard_runtime,jobguard_command_writer;
-- Q10: retain exact action approval and the existing completion adapter. No new command type.
UPDATE app.command_type_registry SET permission_rule='contractor' WHERE command_type='IssueClientApproval' AND version='command.v1';
DO $$ DECLARE original text; changed text; BEGIN
 original:=pg_get_functiondef('app.xa_issue_link(uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,uuid)'::regprocedure);
 changed:=replace(original,'IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=v_tenant AND m.id=p_actor AND m.role=''owner'' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())) THEN',
 'IF app.xa_covers(p_actor,ARRAY[''surveyor'',''commercial_manager''],p_job,''job.read'') IS NULL THEN');
 IF changed=original THEN RAISE EXCEPTION 'unexpected client sender authority'; END IF;
 changed:=replace(changed,'p_expires_at>clock_timestamp()+interval ''31 days''','p_expires_at>clock_timestamp()+interval ''7 days''');
 EXECUTE changed;
 -- begin_command delegates contractor replay checks here; the same current grant is required on retry.
 original:=pg_get_functiondef('app.lp5b_contractor_permission(text,uuid,uuid,jsonb)'::regprocedure);
 changed:=replace(original,'IF NOT coalesce(app.contractor_member_active(p_actor),false) THEN',
 'IF p_type=''IssueClientApproval'' THEN
 IF app.xc_send_authority(p_actor,p_job) IS NOT TRUE THEN RAISE EXCEPTION ''PERMISSION_DENIED'' USING ERRCODE=''42501''; END IF;
 RETURN;
 END IF;
 IF NOT coalesce(app.contractor_member_active(p_actor),false) THEN');
 IF changed=original THEN RAISE EXCEPTION 'unexpected contractor permission'; END IF;
 EXECUTE changed;
END $$;
COMMIT;
