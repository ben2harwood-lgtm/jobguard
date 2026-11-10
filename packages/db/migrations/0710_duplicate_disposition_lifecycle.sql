BEGIN;
-- LATER-SAFETY-51: enforce the existing screen/test reason pairing only.
CREATE OR REPLACE FUNCTION app.extra_duplicate_resolve(p_session uuid,p_job uuid,p_body jsonb) RETURNS jsonb
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
  OR coalesce(p_body->>'reasonCode','') NOT IN('different_work','different_location','review_changed')
  OR (p_body->>'disposition'='not_duplicates' AND p_body->>'reasonCode' NOT IN('different_work','different_location'))
  OR (p_body->>'disposition'='reopen' AND p_body->>'reasonCode'<>'review_changed') THEN
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
COMMIT;
