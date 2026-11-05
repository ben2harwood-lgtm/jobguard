BEGIN;
-- Additive read only. The unchanged cb_unresolved predicate is pinned by a source
-- agreement test and exercised against this read on every integration fixture.
CREATE FUNCTION app.extra_duplicate_candidates(p_actor uuid,p_job uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; result jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF NOT coalesce(app.contractor_member_active(p_actor),false) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=p_actor AND role IN('supervisor','surveyor','commercial_manager')) THEN
  RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job j JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
  WHERE j.tenant_id=t AND j.id=p_job AND j.provenance='work_order' AND c.job_track='contractor' AND c.environment='synthetic_demo')
  OR app.xa_covers(p_actor,ARRAY['supervisor','surveyor','commercial_manager'],p_job,'job.read') IS NULL THEN
  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002';
 END IF;
 WITH RECURSIVE active AS(SELECT l.duplicate_id,l.canonical_id FROM app.extra_duplicate_link l WHERE l.tenant_id=t AND l.job_id=p_job AND l.kind='link'
  AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE(u.tenant_id,u.reverses_link_id)=(l.tenant_id,l.id))),
 members AS(SELECT v.*,o.site_visit_id,o.server_recorded_at,coalesce(l.canonical_id,v.id) canonical FROM app.variation v
  JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(v.tenant_id,v.job_id,v.id) LEFT JOIN active l ON l.duplicate_id=v.id
  WHERE v.tenant_id=t AND v.job_id=p_job AND app.xa_latest_kind(t,p_job,v.id) NOT IN('withdrawn','credited','billing_rejected'))
,
 edges AS(SELECT a.canonical AS a,b.canonical AS b FROM members a JOIN members b ON a.id<b.id AND a.canonical<>b.canonical
 WHERE(a.sor_code IS NOT NULL AND a.sor_code=b.sor_code OR a.excess_of_scope_item_id IS NOT NULL AND a.excess_of_scope_item_id=b.excess_of_scope_item_id)
 AND(a.site_visit_id IS NOT NULL AND a.site_visit_id=b.site_visit_id OR(a.server_recorded_at AT TIME ZONE 'UTC')::date=(b.server_recorded_at AT TIME ZONE 'UTC')::date)),
 reach(seed,node) AS(SELECT a,a FROM edges UNION SELECT b,b FROM edges
  UNION SELECT r.seed, (CASE WHEN e.a=r.node THEN e.b ELSE e.a END) FROM reach r JOIN edges e ON(e.a=r.node OR e.b=r.node)),
 components AS(SELECT node,min(seed::text) group_id FROM reach GROUP BY node),
 grouped AS(SELECT c.group_id,jsonb_agg(jsonb_build_object('extraId',m.id,'canonicalId',m.canonical,'description',m.description) ORDER BY m.id) extras
  FROM components c JOIN members m ON m.canonical=c.node GROUP BY c.group_id)
 SELECT jsonb_build_object('version','extra-duplicate-candidates.v1','jobId',p_job,
  'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',group_id,'extras',extras) ORDER BY group_id) FROM grouped),'[]'::jsonb),
  'revision',(SELECT count(*)::integer FROM app.extra_duplicate_link WHERE tenant_id=t AND job_id=p_job),
  'activeLinks',coalesce((SELECT jsonb_agg(jsonb_build_object('linkId',l.id,'duplicateId',l.duplicate_id,'canonicalId',l.canonical_id,
   'duplicateLabel',d.description,'canonicalLabel',c.description) ORDER BY l.id)
   FROM app.extra_duplicate_link l JOIN app.variation d ON(d.tenant_id,d.job_id,d.id)=(t,p_job,l.duplicate_id)
   JOIN app.variation c ON(c.tenant_id,c.job_id,c.id)=(t,p_job,l.canonical_id)
   WHERE l.tenant_id=t AND l.job_id=p_job AND l.kind='link'
   AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE(u.tenant_id,u.reverses_link_id)=(l.tenant_id,l.id))),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
ALTER FUNCTION app.extra_duplicate_candidates(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.extra_duplicate_candidates(uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.extra_duplicate_candidates(uuid,uuid) TO jobguard_runtime;
COMMIT;
