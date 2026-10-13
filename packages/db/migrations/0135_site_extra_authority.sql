BEGIN;
-- ENT-3a: the founder's 11 October default, on the governed command path.
CREATE FUNCTION app.ent3a_extra_authority(p_actor uuid, p_command_type text, p_job uuid)
RETURNS TABLE(decision text, reason_code text, raising_grant uuid)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE tenant uuid; member_role text; permission text; named_required boolean; chosen uuid;
BEGIN
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL OR p_actor IS NULL THEN
  RETURN QUERY SELECT 'forbidden'::text,'member_inactive'::text,NULL::uuid; RETURN;
 END IF;
 IF NOT coalesce(app.contractor_member_active(p_actor),false) THEN
  RETURN QUERY SELECT 'forbidden'::text,'member_inactive'::text,NULL::uuid; RETURN;
 END IF;
 IF p_command_type IS NULL OR p_command_type NOT IN('LogSiteExtra','RecordOfficeExtra','RecordClientInstruction') THEN
  RETURN QUERY SELECT 'forbidden'::text,'command_type_not_permitted'::text,NULL::uuid; RETURN;
 END IF;
 SELECT m.role INTO member_role FROM app.membership m WHERE m.tenant_id=tenant AND m.id=p_actor;
 -- Only new authority facts. Permission scope and operative assignment remain ENT-2's decision.
 SELECT rule.permission,rule.named_required INTO permission,named_required FROM (VALUES
  ('LogSiteExtra','operative','extra.log',true),
  ('LogSiteExtra','supervisor','extra.log',false),
  ('LogSiteExtra','surveyor','job.read',false),
  ('RecordOfficeExtra','owner','organisation.manage',false),
  ('RecordOfficeExtra','admin','organisation.manage',false),
  ('RecordOfficeExtra','finance','data.import',false),
  ('RecordClientInstruction','owner','contract.manage',false),
  ('RecordClientInstruction','admin','contract.manage',false),
  ('RecordClientInstruction','commercial_manager','contract.manage',false)
 ) AS rule(command_type,role,permission,named_required)
 WHERE rule.command_type=p_command_type AND rule.role=member_role;
 IF permission IS NULL THEN
  RETURN QUERY SELECT 'forbidden'::text,'role_not_permitted'::text,NULL::uuid; RETURN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job j
  JOIN app.job_commercial_track track ON(track.tenant_id,track.job_id)=(j.tenant_id,j.id)
  JOIN app.work_order w ON(w.tenant_id,w.job_id)=(j.tenant_id,j.id)
  JOIN app.work_order_current current_revision ON(current_revision.tenant_id,current_revision.work_order_id)=(w.tenant_id,w.id)
  JOIN app.work_order_revision revision ON(revision.tenant_id,revision.work_order_id,revision.id)=(w.tenant_id,w.id,current_revision.revision_id)
  WHERE j.tenant_id=tenant AND j.id=p_job AND j.provenance='work_order'
   AND track.job_track='contractor' AND track.environment='synthetic_demo' AND revision.status<>'cancelled') THEN
  RETURN QUERY SELECT 'not_found'::text,'job_out_of_scope'::text,NULL::uuid; RETURN;
 END IF;
 IF NOT coalesce(app.contractor_job_allowed(p_actor,permission,p_job),false)
  OR (named_required AND NOT coalesce(app.contractor_job_assigned(p_actor,p_job),false)) THEN
  RETURN QUERY SELECT 'not_found'::text,'job_out_of_scope'::text,NULL::uuid; RETURN;
 END IF;
 -- Lookup only: ENT-4b's insert trigger remains the structural scope judge.
 SELECT g.id INTO chosen FROM app.role_grant g
 JOIN app.team team ON team.tenant_id=g.tenant_id AND team.id=app.contractor_job_team(p_job)
 JOIN app.org_unit branch ON(branch.tenant_id,branch.id)=(team.tenant_id,team.branch_id)
 WHERE g.tenant_id=tenant AND g.membership_id=p_actor AND g.role=member_role
  AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation revocation WHERE(revocation.tenant_id,revocation.grant_id)=(g.tenant_id,g.id))
  AND (g.scope_kind='tenant' AND g.scope_id=tenant
   OR g.scope_kind='team' AND g.scope_id=team.id
   OR g.scope_kind='branch' AND g.scope_id=branch.id
   OR g.scope_kind='region' AND g.scope_id=branch.parent_id)
 ORDER BY g.id LIMIT 1;
 IF chosen IS NULL THEN
  RETURN QUERY SELECT 'not_found'::text,'job_out_of_scope'::text,NULL::uuid; RETURN;
 END IF;
 RETURN QUERY SELECT 'allowed'::text,'allowed'::text,chosen;
END $$;

CREATE FUNCTION app.ent3a_require_extra_authority(p_job uuid, p_variation uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE tenant uuid; origin_row app.extra_origin; authority record;
BEGIN
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(tenant::text,54));
 SELECT o.* INTO origin_row FROM app.extra_origin o WHERE(o.tenant_id,o.job_id,o.variation_id)=(tenant,p_job,p_variation);
 IF origin_row.variation_id IS NULL OR origin_row.job_track IS DISTINCT FROM 'contractor' OR origin_row.provenance IS DISTINCT FROM 'command' THEN
  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002';
 END IF;
 SELECT * INTO authority FROM app.ent3a_extra_authority(origin_row.raising_membership_id,origin_row.command_type,p_job);
 IF authority.decision IS DISTINCT FROM 'allowed' OR authority.raising_grant IS NULL OR authority.raising_grant IS DISTINCT FROM origin_row.raising_grant_id THEN
  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002';
 END IF;
END $$;
ALTER FUNCTION app.ent3a_extra_authority(uuid,text,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3a_require_extra_authority(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ent3a_extra_authority(uuid,text,uuid),app.ent3a_require_extra_authority(uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ent3a_extra_authority(uuid,text,uuid),app.ent3a_require_extra_authority(uuid,uuid) TO jobguard_runtime;
COMMIT;
