BEGIN;
-- Existing human rows remain byte-for-byte intact. Only timer reviews lack a human actor.
ALTER TABLE app.retention_record ALTER COLUMN actor_membership_id DROP NOT NULL;
ALTER TABLE app.retention_record ADD CONSTRAINT retention_timer_actor CHECK (
 actor_membership_id IS NOT NULL OR
 (record_kind='retention.review.v1' AND record->>'trigger'='timer'
  AND record->>'owner'='retention-release-review-v1') IS TRUE);

CREATE FUNCTION infrastructure.discover_retention_reviews() RETURNS TABLE(tenant_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; caller_tenant text:=current_setting('app.tenant_id',true);
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RETURN; END IF;
 -- FORCE RLS remains active: each iteration installs exactly one tenant context.
 FOR t IN SELECT id FROM control_plane.tenant ORDER BY id LOOP
  PERFORM set_config('app.tenant_id',t::text,true);
  IF EXISTS(
   SELECT 1 FROM app.retention_record p
   CROSS JOIN LATERAL jsonb_array_elements(p.record->'conditions') c
   WHERE p.tenant_id=t AND p.record_kind='retention.profile.v1'
    AND NOT EXISTS(SELECT 1 FROM app.retention_record newer WHERE newer.tenant_id=t AND newer.job_id=p.job_id
     AND newer.record_kind='retention.profile.v1' AND newer.ordinal>p.ordinal)
    AND c->>'dueDate'<=to_char(CURRENT_DATE,'YYYY-MM-DD')
    AND NOT EXISTS(SELECT 1 FROM app.retention_record r WHERE r.tenant_id=t AND r.job_id=p.job_id
     AND r.record_kind='retention.review.v1' AND r.record->>'profileId'=p.command_id::text
     AND r.record->>'conditionId'=c->>'id')
  ) THEN tenant_id:=t; RETURN NEXT; END IF;
 END LOOP;
 PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true);
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true); RAISE;
END $$;

-- NULL job lists identifiers only; otherwise prepare and append share the existing book lock.
CREATE FUNCTION infrastructure.retention_timer(t uuid,j uuid,v jsonb,expected text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller_tenant text:=current_setting('app.tenant_id',true); stored jsonb; result jsonb; profile jsonb; prior jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'RETENTION_DARK'; END IF;
 IF t IS NULL OR t IS DISTINCT FROM nullif(caller_tenant,'')::uuid THEN RAISE EXCEPTION 'RETENTION_NOT_FOUND'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 IF j IS NULL THEN
  IF v IS NOT NULL OR expected IS NOT NULL THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
  SELECT coalesce(jsonb_agg(job_id ORDER BY job_id),'[]'::jsonb) INTO result
   FROM (SELECT DISTINCT job_id FROM app.retention_record WHERE tenant_id=t AND record_kind='retention.profile.v1') jobs;
 ELSE
  stored:=app.retention_records(t,NULL,j,NULL,NULL,NULL);
  IF v IS NOT NULL THEN
   SELECT record INTO profile FROM app.retention_record WHERE tenant_id=t AND job_id=j
    AND record_kind='retention.profile.v1' ORDER BY ordinal DESC LIMIT 1;
   IF expected IS DISTINCT FROM stored->>'bookHash' OR jsonb_typeof(v) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v) k) IS DISTINCT FROM
     ARRAY['conditionId','id','jobId','owner','profileId','raisedOn','tenantId','trigger','version']::text[]
    OR v->>'version' IS DISTINCT FROM 'retention.review.v1' OR v->>'trigger' IS DISTINCT FROM 'timer'
    OR v->>'owner' IS DISTINCT FROM 'retention-release-review-v1'
    OR v->>'tenantId' IS DISTINCT FROM t::text OR v->>'jobId' IS DISTINCT FROM j::text
    OR v->>'profileId' IS DISTINCT FROM profile->>'id' OR profile IS NULL
    OR v->>'raisedOn' IS DISTINCT FROM to_char(CURRENT_DATE,'YYYY-MM-DD')
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(profile->'conditions') c WHERE c->>'id'=v->>'conditionId'
      AND c->>'dueDate'<=to_char(CURRENT_DATE,'YYYY-MM-DD'))
   THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
   SELECT record INTO prior FROM app.retention_record WHERE tenant_id=t AND job_id=j AND command_id=(v->>'id')::uuid;
   IF FOUND THEN
    IF prior IS DISTINCT FROM v THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
   ELSE
    IF EXISTS(SELECT 1 FROM app.retention_record WHERE tenant_id=t AND job_id=j AND record_kind='retention.review.v1'
      AND record->>'profileId'=v->>'profileId' AND record->>'conditionId'=v->>'conditionId')
    THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
    INSERT INTO app.retention_record(tenant_id,job_id,command_id,ordinal,record_kind,record,record_hash,actor_membership_id)
     VALUES(t,j,(v->>'id')::uuid,jsonb_array_length(stored->'records')+1,'retention.review.v1',v,app.final_lock_hash(v),NULL);
    PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
     'actorRef','system:retention-release-review-v1','eventType','retention.review.raised','subjectType','job','subjectRef',j::text,
     'payload',jsonb_build_object('references',jsonb_build_object('commandId',v->>'id'),
      'hashes',jsonb_build_object('record',app.final_lock_hash(v))))),'checked_operation');
   END IF;
   stored:=app.retention_records(t,NULL,j,NULL,NULL,NULL);
  END IF;
  result:=stored||jsonb_build_object('today',to_char(CURRENT_DATE,'YYYY-MM-DD'));
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true); RAISE;
END $$;
ALTER FUNCTION infrastructure.discover_retention_reviews() OWNER TO jobguard_migration;
ALTER FUNCTION infrastructure.retention_timer(uuid,uuid,jsonb,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION infrastructure.discover_retention_reviews(),infrastructure.retention_timer(uuid,uuid,jsonb,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION infrastructure.discover_retention_reviews(),infrastructure.retention_timer(uuid,uuid,jsonb,text) TO jobguard_infrastructure;
COMMIT;
