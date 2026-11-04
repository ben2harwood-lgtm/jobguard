-- ENT-3 RED: an operative statement, never work timing or authorization.
BEGIN;
CREATE TABLE app.site_extra_work_status (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, variation_id uuid NOT NULL,
 command_id uuid NOT NULL, operative_membership_id uuid NOT NULL,
 work_status text NOT NULL CHECK(work_status IN('not_started','under_way','finished')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,variation_id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,operative_membership_id) REFERENCES app.membership(tenant_id,id)
);
ALTER TABLE app.site_extra_work_status OWNER TO jobguard_migration;
REVOKE ALL ON app.site_extra_work_status FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
ALTER TABLE app.site_extra_work_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.site_extra_work_status FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.site_extra_work_status TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.site_extra_work_status
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();

-- Reads are scoped supervisor reads; writes can only extend the still-processing
-- LogSiteExtra that created this origin, inside that command's transaction.
CREATE FUNCTION app.ent3_work_status(p_job uuid,p_actor uuid,p_extra uuid,p_status text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 o app.extra_origin; result jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_job::text,417));
 IF p_extra IS NULL THEN
  IF p_status IS NOT NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
  IF app.xa_covers(p_actor,ARRAY['supervisor'],p_job,'job.read') IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 ELSE
  PERFORM app.ent3a_require_extra_authority(p_job,p_extra);
  SELECT * INTO o FROM app.extra_origin WHERE tenant_id=t AND job_id=p_job AND variation_id=p_extra;
  IF o.raising_membership_id IS DISTINCT FROM p_actor OR o.raising_role IS DISTINCT FROM 'operative'
   OR o.kind IS DISTINCT FROM 'site_user' OR o.command_type IS DISTINCT FROM 'LogSiteExtra'
   OR NOT EXISTS(SELECT 1 FROM app.command_receipt r JOIN app.command_lifecycle_claim c
    ON(c.tenant_id,c.command_id)=(r.tenant_id,r.command_id)
    WHERE r.tenant_id=t AND r.command_id=o.command_id AND r.status='processing'
     AND r.actor_membership_id=p_actor AND c.actor_membership_id=p_actor AND c.transaction_id=pg_current_xact_id()) THEN
   RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
  IF p_status IS NULL OR p_status NOT IN('not_started','under_way','finished') THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.work_order w JOIN app.work_order_current k ON(k.tenant_id,k.work_order_id)=(w.tenant_id,w.id)
  JOIN app.work_order_revision r ON(r.tenant_id,r.id)=(k.tenant_id,k.revision_id)
  WHERE w.tenant_id=t AND w.job_id=p_job AND r.status<>'cancelled') THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF p_extra IS NOT NULL THEN
  INSERT INTO app.site_extra_work_status(tenant_id,job_id,variation_id,command_id,operative_membership_id,work_status)
   VALUES(t,p_job,p_extra,o.command_id,p_actor,p_status);
  -- Final business write precedes the audit-head lock; the enclosing log only
  -- appends its existing audit and completes its receipt after this seam.
  PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
   'actorRef','membership:'||p_actor::text,'eventType','contractor.extra.work_status_recorded','subjectType','extra','subjectRef',p_extra::text,
   'payload',jsonb_build_object('references',jsonb_build_object('job',p_job,'extra',p_extra,'command',o.command_id),
    'classifications',jsonb_build_object('workStatus',p_status,'source','operative_statement')))),'checked_operation');
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('extraId',x.variation_id,'workStatus',x.work_status,
  'operativeMembershipId',x.operative_membership_id,'recordedAt',to_char(x.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'source','operative_statement') ORDER BY x.recorded_at,x.variation_id),'[]'::jsonb) INTO result
  FROM app.site_extra_work_status x WHERE x.tenant_id=t AND x.job_id=p_job AND (p_extra IS NULL OR x.variation_id=p_extra);
 RETURN result;
END $$;
ALTER FUNCTION app.ent3_work_status(uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ent3_work_status(uuid,uuid,uuid,text) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ent3_work_status(uuid,uuid,uuid,text) TO jobguard_runtime;

-- Uses the same bound contract rules and exact price function as submission.
-- Only a comparison is returned. NULL quantity means unpriced, above all limits.
CREATE FUNCTION app.ent3_proceed_comparison(p_job uuid,p_actor uuid,p_code text,p_quantity text) RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; rules jsonb; net bigint; result boolean;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL OR NOT EXISTS(SELECT 1 FROM app.ent3a_extra_authority(p_actor,'LogSiteExtra',p_job) WHERE decision='allowed') THEN
  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF p_quantity IS NOT NULL AND (p_quantity !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' OR p_quantity::numeric<=0) THEN
  RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE='23514'; END IF;
 SELECT a.document,CASE WHEN p_quantity IS NOT NULL THEN app.sor_line_net_pence(p_quantity,i.rate_pence,r.adjustment_numerator,r.adjustment_denominator) END
 INTO rules,net FROM app.work_order w
 JOIN app.work_order_current k ON(k.tenant_id,k.work_order_id)=(w.tenant_id,w.id)
 JOIN app.work_order_revision r ON(r.tenant_id,r.id)=(k.tenant_id,k.revision_id)
 JOIN app.client_contract_version cv ON(cv.tenant_id,cv.id)=(w.tenant_id,w.contract_version_id)
 JOIN app.approval_rule_version a ON(a.tenant_id,a.id)=(cv.tenant_id,cv.rule_version_id)
 LEFT JOIN app.sor_item i ON(i.tenant_id,i.version_id,i.code)=(r.tenant_id,r.sor_version_id,p_code)
 WHERE w.tenant_id=t AND w.job_id=p_job AND r.status<>'cancelled';
 IF rules IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 result:=(app.xa_requirement(rules,net)->'comparisons'->>'withinProceedLimit')::boolean;
 RETURN CASE WHEN result THEN 'within' ELSE 'above' END;
END $$;
ALTER FUNCTION app.ent3_proceed_comparison(uuid,uuid,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ent3_proceed_comparison(uuid,uuid,text,text) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ent3_proceed_comparison(uuid,uuid,text,text) TO jobguard_runtime;
COMMIT;
