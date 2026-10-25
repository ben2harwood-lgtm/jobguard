BEGIN;
-- Read-only retained workspace; no positive authorization predicate is exported.
CREATE FUNCTION app.mon8_retained_contractor_workspace(s uuid, q jsonb) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE authority jsonb; tenant uuid; actor uuid; requested uuid; readable uuid[];
 result jsonb; permissions jsonb; administrative boolean; writer boolean;
BEGIN
 -- Revalidate the persisted session after the shared tenant lock wait (seed 54).
 authority:=app.mon8_contractor_agreement_context(s);
 tenant:=(authority->>'tenantId')::uuid; actor:=(authority->>'membershipId')::uuid;
 IF q IS NULL OR jsonb_typeof(q) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
 IF q->>'version' IS DISTINCT FROM 'contractor-query.v1'
 OR q->>'resource' IS NULL OR q->>'resource' NOT IN('organisation','contracts')
 OR jsonb_typeof(q->'tenantId') IS DISTINCT FROM 'string'
 OR q->>'tenantId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(q) k WHERE k NOT IN('version','tenantId','resource','id'))
 OR (q ? 'id' AND (jsonb_typeof(q->'id') IS DISTINCT FROM 'string' OR q->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
 THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
 IF (q->>'tenantId')::uuid<>tenant THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 requested:=(q->>'id')::uuid;
 -- Exact legacy scope/role rules, internal fixed permissions only. Authority has
 -- already checked membership, expiry, client consistency and both revocations.
 WITH targets AS (
 SELECT id target,NULL::uuid contract FROM app.org_unit WHERE tenant_id=tenant
 UNION SELECT id,NULL::uuid FROM app.team WHERE tenant_id=tenant
 UNION SELECT id,NULL::uuid FROM app.client_organisation WHERE tenant_id=tenant
 UNION SELECT tenant,NULL::uuid
 UNION SELECT client_id,contract_id FROM app.client_contract_version WHERE tenant_id=tenant
 ), candidates AS (
 SELECT targets.*,p.permission FROM targets CROSS JOIN
 (VALUES ('organisation.read'),('contract.read'),('organisation.manage'),('contract.manage'),('client.invite')) p(permission)
 )
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO permissions FROM candidates x WHERE (x.target=nullif(current_setting('app.tenant_id',true),'')::uuid
 OR EXISTS(SELECT 1 FROM app.org_unit WHERE id=x.target) OR EXISTS(SELECT 1 FROM app.team WHERE id=x.target) OR EXISTS(SELECT 1 FROM app.client_organisation WHERE id=x.target)) AND EXISTS(
 SELECT 1 FROM app.role_grant g
 LEFT JOIN app.team t ON(t.tenant_id,t.id)=(g.tenant_id,x.target)
 LEFT JOIN app.client_organisation c ON(c.tenant_id,c.id)=(g.tenant_id,x.target)
 LEFT JOIN app.org_unit b ON b.tenant_id=g.tenant_id AND b.id=coalesce(t.branch_id,c.branch_id,x.target)
 WHERE g.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND g.membership_id=actor
 AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
 AND x.permission=ANY(CASE g.role
 WHEN 'owner' THEN ARRAY['organisation.read','organisation.manage','client.invite','contract.read','contract.manage']
 WHEN 'admin' THEN ARRAY['organisation.read','organisation.manage','client.invite','contract.read','contract.manage']
 WHEN 'operative' THEN ARRAY['job.read','extra.log','resident.read']
 WHEN 'supervisor' THEN ARRAY['contract.read','job.read','extra.log','extra.price','extra.approve','dashboard.read','resident.read']
 WHEN 'surveyor' THEN ARRAY['contract.read','job.read','extra.price','extra.approve','dashboard.read','resident.read']
 WHEN 'commercial_manager' THEN ARRAY['client.invite','contract.read','contract.manage','job.read','extra.price','extra.approve','dashboard.read','resident.read']
 WHEN 'finance' THEN ARRAY['contract.read','data.export','data.import','statement.read']
 WHEN 'read_only' THEN ARRAY['contract.read','job.read','dashboard.read']
 WHEN 'client_approver' THEN ARRAY['contract.read'] ELSE ARRAY[]::text[] END)
 AND (g.scope_kind='tenant' AND g.scope_id=g.tenant_id
 OR g.scope_kind='team' AND g.scope_id=t.id
 OR g.scope_kind='branch' AND g.scope_id=b.id
 OR g.scope_kind='region' AND (g.scope_id=b.parent_id OR g.scope_id=b.id AND b.kind='region')
 OR g.scope_kind='client' AND g.scope_id=c.id AND (g.contract_id IS NULL OR g.contract_id=x.contract))
 AND (g.role<>'operative' OR EXISTS(SELECT 1 FROM app.team_membership tm WHERE tm.tenant_id=g.tenant_id AND tm.membership_id=actor AND tm.team_id=t.id AND tm.active AND tm.revision=(SELECT max(x.revision) FROM app.team_membership x WHERE(x.tenant_id,x.membership_id,x.team_id)=(tm.tenant_id,tm.membership_id,tm.team_id))))
 );
 SELECT coalesce(array_agg((v->>'target')::uuid),'{}'::uuid[]) INTO readable
 FROM jsonb_array_elements(permissions) v WHERE v->>'permission'='organisation.read' AND v->>'contract' IS NULL;
 administrative:=EXISTS(SELECT 1 FROM app.org_unit WHERE tenant_id=tenant AND id=ANY(readable))
 OR EXISTS(SELECT 1 FROM app.team WHERE tenant_id=tenant AND id=ANY(readable));
 IF q->>'resource'='organisation' AND NOT administrative THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 writer:=administrative OR EXISTS(SELECT 1 FROM app.role_grant g JOIN jsonb_array_elements(permissions) v
 ON (v->>'target')::uuid=g.scope_id WHERE g.tenant_id=tenant AND g.membership_id=actor
 AND v->>'permission' IN('organisation.manage','contract.manage','client.invite') AND v->>'contract' IS NULL);
 SELECT jsonb_build_object('version','contractor-workspace.v1','environment','synthetic_demo',
 'tenantId',tenant,'membershipId',actor,'realExternalActions',0,
 'revision',CASE WHEN writer THEN (SELECT count(*) FROM app.command_receipt WHERE tenant_id=tenant AND command_type LIKE 'contractor.%') ELSE 0 END,
 'units',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT id,kind,parent_id,name FROM app.org_unit WHERE tenant_id=tenant AND id=ANY(readable) ORDER BY kind,name) r),'[]'::jsonb),
 'teams',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT id,branch_id,name FROM app.team WHERE tenant_id=tenant AND id=ANY(readable) ORDER BY name) r),'[]'::jsonb),
 'members',CASE WHEN administrative THEN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
 SELECT candidate.membership_id,candidate.email,candidate.client_id,NOT EXISTS(SELECT 1 FROM app.membership a JOIN app.contractor_member c ON(c.tenant_id,c.membership_id)=(a.tenant_id,a.id)
 WHERE a.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND a.id=candidate.membership_id AND a.role=ANY(ARRAY['owner','admin','operative','supervisor','surveyor','commercial_manager','finance','read_only','client_approver']) AND (a.role='client_approver')=(c.client_id IS NOT NULL) AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>statement_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=a.tenant_id AND r.membership_id=a.id)) revoked
 FROM app.contractor_member candidate WHERE candidate.tenant_id=tenant AND EXISTS(SELECT 1 FROM app.role_grant g WHERE g.tenant_id=tenant AND g.membership_id=candidate.membership_id AND g.scope_id=ANY(readable)) ORDER BY candidate.email) r),'[]'::jsonb) ELSE '[]'::jsonb END,
 'grants',CASE WHEN administrative THEN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
 SELECT g.id,g.membership_id,g.role,g.scope_kind,g.scope_id,EXISTS(SELECT 1 FROM app.role_grant_revocation v WHERE v.tenant_id=tenant AND v.grant_id=g.id) revoked
 FROM app.role_grant g WHERE g.tenant_id=tenant AND g.scope_id=ANY(readable)) r),'[]'::jsonb) ELSE '[]'::jsonb END,
 'teamMemberships',CASE WHEN administrative THEN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
 SELECT DISTINCT ON(membership_id,team_id) membership_id,team_id,active FROM app.team_membership WHERE tenant_id=tenant AND team_id=ANY(readable) ORDER BY membership_id,team_id,revision DESC) r),'[]'::jsonb) ELSE '[]'::jsonb END,
 'clients',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
 SELECT id,name,branch_id FROM app.client_organisation c WHERE c.tenant_id=tenant AND EXISTS(SELECT 1 FROM jsonb_array_elements(permissions) v WHERE v->>'permission'='contract.read' AND (v->>'target')::uuid=c.id AND v->>'contract' IS NULL) ORDER BY name) r),'[]'::jsonb),
 'contracts',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
 SELECT v.id,v.contract_id,v.client_id,v.revision,v.document,v.rule_version_id,r.document rules
 FROM app.client_contract_version v JOIN app.approval_rule_version r ON(r.tenant_id,r.id)=(v.tenant_id,v.rule_version_id)
 WHERE v.tenant_id=tenant AND EXISTS(SELECT 1 FROM jsonb_array_elements(permissions) p WHERE p->>'permission'='contract.read' AND (p->>'target')::uuid=v.client_id AND (p->>'contract')::uuid=v.contract_id)
 AND (q->>'resource'<>'contracts' OR requested IS NULL OR v.contract_id=requested) ORDER BY v.contract_id,v.revision) r),'[]'::jsonb)
 ) INTO result;
 IF requested IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM jsonb_array_elements(CASE WHEN q->>'resource'='contracts' THEN result->'contracts' ELSE (result->'units')||(result->'teams')||(result->'clients') END) r
 WHERE (r->>CASE WHEN q->>'resource'='contracts' THEN 'contract_id' ELSE 'id' END)::uuid=requested
 ) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 RETURN result;
END $$;
ALTER FUNCTION app.mon8_retained_contractor_workspace(uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_retained_contractor_workspace(uuid,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.mon8_retained_contractor_workspace(uuid,jsonb) TO jobguard_runtime;
COMMIT;
