BEGIN;
-- ENT-5: exact-group, append-only dispositions. No predecessor row shape changes.
CREATE TABLE app.extra_duplicate_disposition (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, command_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, group_id uuid NOT NULL, snapshot jsonb NOT NULL,
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 disposition text NOT NULL CHECK(disposition IN('not_duplicates','reopen')),
 reason_code text NOT NULL CHECK(reason_code IN('different_work','different_location','review_changed')),
 sequence bigint NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,job_id,sequence),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
ALTER TABLE app.extra_duplicate_disposition OWNER TO jobguard_migration;
REVOKE ALL ON app.extra_duplicate_disposition FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
ALTER TABLE app.extra_duplicate_disposition ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.extra_duplicate_disposition FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.extra_duplicate_disposition TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.extra_duplicate_disposition
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
INSERT INTO app.command_type_registry VALUES
 ('ResolveDuplicateCandidates','duplicate-disposition.v1','active_member','route_before_begin','duplicate_disposition','commercial',NULL);

-- Authoritative grouping, shared by the read, writer and export refusal.
CREATE FUNCTION app.extra_duplicate_groups(p_tenant uuid,p_job uuid)
RETURNS TABLE(group_id uuid,snapshot jsonb,extras jsonb)
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 WITH RECURSIVE active AS(SELECT l.duplicate_id,l.canonical_id FROM app.extra_duplicate_link l WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.kind='link'
  AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE(u.tenant_id,u.reverses_link_id)=(l.tenant_id,l.id))),
 members AS(SELECT v.*,o.site_visit_id,o.server_recorded_at,coalesce(l.canonical_id,v.id) canonical FROM app.variation v
  JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(v.tenant_id,v.job_id,v.id) LEFT JOIN active l ON l.duplicate_id=v.id
  WHERE v.tenant_id=p_tenant AND v.job_id=p_job AND app.xa_latest_kind(p_tenant,p_job,v.id) NOT IN('withdrawn','credited','billing_rejected'))
,
 edges AS(SELECT a.canonical AS a,b.canonical AS b FROM members a JOIN members b ON a.id<b.id AND a.canonical<>b.canonical
 WHERE(a.sor_code IS NOT NULL AND a.sor_code=b.sor_code OR a.excess_of_scope_item_id IS NOT NULL AND a.excess_of_scope_item_id=b.excess_of_scope_item_id)
 AND(a.site_visit_id IS NOT NULL AND a.site_visit_id=b.site_visit_id OR(a.server_recorded_at AT TIME ZONE 'UTC')::date=(b.server_recorded_at AT TIME ZONE 'UTC')::date)),
 reach(seed,node) AS(SELECT a,a FROM edges UNION SELECT b,b FROM edges
  UNION SELECT r.seed, (CASE WHEN e.a=r.node THEN e.b ELSE e.a END) FROM reach r JOIN edges e ON(e.a=r.node OR e.b=r.node)),
 components AS(SELECT node,min(seed::text) group_id FROM reach GROUP BY node),
 grouped AS(SELECT c.group_id,
 jsonb_agg(jsonb_build_object('extraId',m.id,'canonicalId',m.canonical,
 'variationRevisions',(SELECT coalesce(jsonb_agg(jsonb_build_array(r.id,r.content_hash) ORDER BY r.revision),'[]'::jsonb) FROM app.variation_revision r WHERE r.tenant_id=p_tenant AND r.job_id=p_job AND r.variation_id=m.id),
 'sorRevisions',(SELECT coalesce(jsonb_agg(jsonb_build_array(r.id,r.content_hash) ORDER BY r.revision),'[]'::jsonb) FROM app.extra_sor_revision r WHERE r.tenant_id=p_tenant AND r.job_id=p_job AND r.variation_id=m.id),
 'bindings',(SELECT coalesce(jsonb_agg(b.id ORDER BY b.logical_revision),'[]'::jsonb) FROM app.extra_approval_revision_binding b WHERE b.tenant_id=p_tenant AND b.job_id=p_job AND b.variation_id=m.id)) ORDER BY m.id) snapshot,
 jsonb_agg(jsonb_build_object('extraId',m.id,'canonicalId',m.canonical,'description',m.description) ORDER BY m.id) extras
  FROM components c JOIN members m ON m.canonical=c.node GROUP BY c.group_id)
 SELECT group_id::uuid,snapshot,extras FROM grouped
$$;
CREATE FUNCTION app.extra_duplicate_unresolved(p_tenant uuid,p_job uuid)
RETURNS TABLE(group_id uuid,snapshot jsonb,extras jsonb)
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT g.* FROM app.extra_duplicate_groups(p_tenant,p_job) g
 WHERE coalesce((SELECT d.disposition FROM app.extra_duplicate_disposition d
  WHERE d.tenant_id=p_tenant AND d.job_id=p_job AND d.group_id=g.group_id AND d.snapshot=g.snapshot
  ORDER BY d.sequence DESC LIMIT 1),'reopen')<>'not_duplicates'
$$;
CREATE OR REPLACE FUNCTION app.cb_unresolved(p_tenant uuid,p_job uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app.extra_duplicate_unresolved(p_tenant,p_job))
$$;
CREATE OR REPLACE FUNCTION app.extra_duplicate_candidates(p_actor uuid,p_job uuid) RETURNS jsonb
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
 SELECT jsonb_build_object('version','extra-duplicate-candidates.v1','jobId',p_job,
  'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',group_id,'fingerprint',app.final_lock_hash(snapshot),'extras',extras) ORDER BY group_id) FROM app.extra_duplicate_unresolved(t,p_job)),'[]'::jsonb),
  'revision',(SELECT count(*)::integer FROM app.extra_duplicate_link WHERE tenant_id=t AND job_id=p_job),
  'activeLinks',coalesce((SELECT jsonb_agg(jsonb_build_object('linkId',l.id,'duplicateId',l.duplicate_id,'canonicalId',l.canonical_id,
   'duplicateLabel',d.description,'canonicalLabel',c.description) ORDER BY l.id)
   FROM app.extra_duplicate_link l JOIN app.variation d ON(d.tenant_id,d.job_id,d.id)=(t,p_job,l.duplicate_id)
   JOIN app.variation c ON(c.tenant_id,c.job_id,c.id)=(t,p_job,l.canonical_id)
   WHERE l.tenant_id=t AND l.job_id=p_job AND l.kind='link'
   AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE(u.tenant_id,u.reverses_link_id)=(l.tenant_id,l.id))),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;

-- Session supplies actor; callers cannot forge membership through JSON or a GUC.
CREATE FUNCTION app.extra_duplicate_resolve(p_session uuid,p_job uuid,p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; cmd uuid; h text;
 r app.command_receipt; g record; fact uuid:=gen_random_uuid(); v_result jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_job::text,417));
 SELECT s.membership_id INTO a FROM app.contractor_session(p_session) s WHERE s.tenant_id=t;
 IF a IS NULL OR app.xa_covers(a,ARRAY['supervisor','surveyor','commercial_manager'],p_job,'job.read') IS NULL THEN
  RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job j JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
  WHERE j.tenant_id=t AND j.id=p_job AND j.provenance='work_order' AND c.job_track='contractor' AND c.environment='synthetic_demo') THEN
  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF p_body IS NULL OR jsonb_typeof(p_body) IS DISTINCT FROM 'object'
  OR (p_body-ARRAY['version','commandId','groupId','fingerprint','disposition','reasonCode'])<>'{}'
  OR NOT(p_body ?& ARRAY['version','commandId','groupId','fingerprint','disposition','reasonCode'])
  OR p_body->>'version' IS DISTINCT FROM 'duplicate-disposition.v1'
  OR coalesce(p_body->>'fingerprint','') !~ '^[a-f0-9]{64}$'
  OR coalesce(p_body->>'disposition','') NOT IN('not_duplicates','reopen')
  OR coalesce(p_body->>'reasonCode','') NOT IN('different_work','different_location','review_changed') THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_body) x WHERE jsonb_typeof(x.value)<>'string') THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 cmd:=(p_body->>'commandId')::uuid;
 IF cmd IS NULL OR (p_body->>'groupId')::uuid IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 PERFORM app.mon8_require_feature(a,'approval_chains');
 h:=app.final_lock_hash(jsonb_build_object('actor',a,'job',p_job,'body',p_body));
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=cmd;
 IF r.command_id IS NOT NULL THEN
  IF r.command_type IS DISTINCT FROM 'ResolveDuplicateCandidates' OR r.request_hash IS DISTINCT FROM h OR r.status<>'succeeded' THEN
   RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN r.result;
 END IF;
 SELECT * INTO g FROM app.extra_duplicate_groups(t,p_job) x
 WHERE x.group_id=(p_body->>'groupId')::uuid AND app.final_lock_hash(x.snapshot)=p_body->>'fingerprint';
 IF g.group_id IS NULL THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(g.snapshot) m
  JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(t,p_job,(m->>'extraId')::uuid)
  WHERE o.raising_membership_id=a)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(g.snapshot) m
  JOIN app.extra_approval_revision_binding b ON(b.tenant_id,b.job_id,b.variation_id)=(t,p_job,(m->>'extraId')::uuid)
  WHERE b.actor_membership_id=a)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(g.snapshot) m
  JOIN app.extra_pricing_basis b ON(b.tenant_id,b.job_id,b.variation_id)=(t,p_job,(m->>'extraId')::uuid)
  WHERE b.actor_membership_id=a) THEN
  RAISE EXCEPTION 'SELF_DISMISSAL' USING ERRCODE='42501'; END IF;
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(t,cmd,'ResolveDuplicateCandidates','duplicate-disposition:'||p_job::text||':'||cmd::text,h,'processing',a) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 INSERT INTO app.extra_duplicate_disposition(tenant_id,id,job_id,command_id,actor_membership_id,group_id,snapshot,fingerprint,disposition,reason_code,sequence)
 VALUES(t,fact,p_job,cmd,a,g.group_id,g.snapshot,p_body->>'fingerprint',p_body->>'disposition',p_body->>'reasonCode',(SELECT coalesce(max(d.sequence),0)+1 FROM app.extra_duplicate_disposition d WHERE d.tenant_id=t AND d.job_id=p_job));
 v_result:=jsonb_build_object('version','duplicate-disposition-result.v1','factId',fact,'groupId',g.group_id,'fingerprint',p_body->>'fingerprint','disposition',p_body->>'disposition');
 UPDATE app.command_receipt SET status='succeeded',result=v_result,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=cmd;
 -- Audit is the final contending lock. Reasons stay in the fact, not the chain.
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',fact,'version','audit.v1',
  'actorRef','membership:'||a::text,'eventType','contractor.extra.duplicate_disposition','subjectType','job','subjectRef',p_job::text,
  'payload',jsonb_build_object('references',jsonb_build_object('job',p_job,'command',cmd,'dispositionFact',fact,'environment','synthetic_demo'),
   'hashes',jsonb_build_object('group',p_body->>'fingerprint'),'classifications',jsonb_build_object('action','commercial')))),'checked_operation');
 RETURN v_result;
END $$;
ALTER FUNCTION app.extra_duplicate_groups(uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.extra_duplicate_unresolved(uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.extra_duplicate_resolve(uuid,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.extra_duplicate_groups(uuid,uuid),app.extra_duplicate_unresolved(uuid,uuid),app.extra_duplicate_resolve(uuid,uuid,jsonb)
 FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.extra_duplicate_resolve(uuid,uuid,jsonb) TO jobguard_runtime;
COMMIT;
