BEGIN;
-- ENT-3b: visit start and complete as controlled routines, and the immutable close-out answer.
-- Additive only: one table, six functions (four the application login may call, two trigger functions), the triggers named below.
-- Advisory lock keys used here: 3101 (tenant, job, member) and 3102 (tenant, visit); the tenant lock 54 is the merged contractor administration key.

-- 1. The one place the visit rule lives. It calls the merged routines and restates none of their rules.
CREATE FUNCTION app.ent3b_visit_authority(p_actor uuid, p_job uuid)
RETURNS TABLE(decision text, reason_code text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE tenant uuid; member_role text; answers integer; answered text;
BEGIN
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL OR p_actor IS NULL OR NOT coalesce(app.contractor_member_active(p_actor),false) THEN
  RETURN QUERY SELECT 'forbidden'::text,'member_inactive'::text; RETURN;
 END IF;
 SELECT m.role INTO member_role FROM app.membership m WHERE m.tenant_id=tenant AND m.id=p_actor;
 IF member_role IS NULL OR member_role NOT IN('operative','supervisor') THEN
  RETURN QUERY SELECT 'forbidden'::text,'role_not_permitted'::text; RETURN;
 END IF;
 -- Site staff who may log a site extra on the job (active member, work-order job of this tenant, order not cancelled, covering grant of their own role) ...
 SELECT count(*)::integer, min(x.decision) INTO answers, answered FROM app.ent3a_extra_authority(p_actor,'LogSiteExtra',p_job) x;
 IF answers IS DISTINCT FROM 1 OR answered IS DISTINCT FROM 'allowed' THEN
  RETURN QUERY SELECT 'not_found'::text,'job_out_of_scope'::text; RETURN;
 END IF;
 -- ... and who are named on the job's current revision.
 IF NOT coalesce(app.contractor_job_assigned(p_actor,p_job),false) THEN
  RETURN QUERY SELECT 'not_found'::text,'job_out_of_scope'::text; RETURN;
 END IF;
 RETURN QUERY SELECT 'allowed'::text,'allowed'::text;
END $$;

-- 4 (table first, because routine 3 writes it). One row per visit, for ever; written only by routine 3.
CREATE TABLE app.closeout_answer (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, work_order_id uuid NOT NULL, site_visit_id uuid NOT NULL, membership_id uuid NOT NULL,
 question_version text NOT NULL CHECK(question_version='closeout-question.v1'),
 answer text NOT NULL CHECK(answer IN('yes','no')),
 command_id uuid NOT NULL, server_recorded_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,site_visit_id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,site_visit_id) REFERENCES app.site_visit(tenant_id,id),
 FOREIGN KEY(tenant_id,work_order_id,job_id) REFERENCES app.work_order(tenant_id,id,job_id),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES app.contractor_member(tenant_id,membership_id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id)
);
ALTER TABLE app.closeout_answer OWNER TO jobguard_migration;
ALTER TABLE app.closeout_answer ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.closeout_answer FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.closeout_answer FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.closeout_answer FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT SELECT ON app.closeout_answer TO jobguard_runtime;
CREATE TRIGGER closeout_answer_immutable BEFORE UPDATE OR DELETE ON app.closeout_answer FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();

-- Before an answer row exists: the visit is completed by this very command (same moment), the receipt is this command's, and the member is the same.
CREATE FUNCTION app.ent3b_closeout_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.site_visit v WHERE v.tenant_id=NEW.tenant_id AND v.id=NEW.site_visit_id AND v.job_id=NEW.job_id AND v.work_order_id=NEW.work_order_id AND v.membership_id=NEW.membership_id AND v.completed_at=NEW.server_recorded_at)
  OR NOT EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=NEW.tenant_id AND r.command_id=NEW.command_id AND r.status='processing' AND r.command_type='CompleteSiteVisit' AND r.actor_membership_id=NEW.membership_id)
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER closeout_answer_guard BEFORE INSERT ON app.closeout_answer FOR EACH ROW EXECUTE FUNCTION app.ent3b_closeout_guard();

-- At commit. On the answer table: the answer has its own completion audit event (this company's only: the table owner sees every company's events).
-- On the visit table (Q2): a completed visit has exactly one matching answer, and a visit that has an answer is completed. Nothing is locked here.
CREATE FUNCTION app.ent3b_require_closeout_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE visit_row app.site_visit; total integer; matching integer;
BEGIN
 IF TG_TABLE_NAME='closeout_answer' THEN
  IF NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.id AND e.event_type='contractor.visit.completed' AND e.subject_type='site-visit' AND e.subject_ref=NEW.site_visit_id::text) THEN
   RAISE EXCEPTION 'CLOSEOUT_AUDIT_REQUIRED' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT * INTO visit_row FROM app.site_visit v WHERE v.tenant_id=NEW.tenant_id AND v.id=NEW.id;
  IF visit_row.id IS NOT NULL THEN
   SELECT count(*)::integer, count(*) FILTER (WHERE a.job_id=visit_row.job_id AND a.work_order_id=visit_row.work_order_id AND a.membership_id=visit_row.membership_id AND a.server_recorded_at=visit_row.completed_at)::integer
    INTO total, matching FROM app.closeout_answer a WHERE a.tenant_id=visit_row.tenant_id AND a.site_visit_id=visit_row.id;
   IF (visit_row.completed_at IS NOT NULL AND (total<>1 OR matching<>1)) OR (visit_row.completed_at IS NULL AND total<>0) THEN
    RAISE EXCEPTION 'CLOSEOUT_ANSWER_REQUIRED' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER closeout_answer_audit AFTER INSERT ON app.closeout_answer DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.ent3b_require_closeout_audit();
-- The one trigger on a merged table (Q2): no column, grant, policy or row of app.site_visit changes.
CREATE CONSTRAINT TRIGGER site_visit_closeout_answer AFTER UPDATE ON app.site_visit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.ent3b_require_closeout_audit();

-- 2. Start a visit. The application login has SELECT only on the visit table, so this routine (owned by the table owner) is the only writer.
CREATE FUNCTION app.ent3b_start_visit(p_actor uuid, p_command uuid, p_job uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant uuid; answers integer; answered text; order_id uuid; new_visit uuid:=gen_random_uuid();
BEGIN
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- The tenant lock merged contractor administration takes exclusively: a grant, membership or team change cannot land between this check and the commit.
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(tenant::text,54));
 IF p_actor IS NULL OR p_command IS NULL OR p_job IS NULL OR NOT EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=tenant AND r.command_id=p_command AND r.status='processing' AND r.command_type='StartSiteVisit' AND r.actor_membership_id=p_actor) THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 SELECT count(*)::integer, min(a.decision) INTO answers, answered FROM app.ent3b_visit_authority(p_actor,p_job) a;
 IF answers IS DISTINCT FROM 1 OR answered IS DISTINCT FROM 'allowed' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant::text||':'||p_job::text||':'||p_actor::text,3101));
 IF EXISTS(SELECT 1 FROM app.site_visit v WHERE v.tenant_id=tenant AND v.job_id=p_job AND v.membership_id=p_actor AND v.completed_at IS NULL) THEN
  RAISE EXCEPTION 'VISIT_ALREADY_OPEN' USING ERRCODE='55000';
 END IF;
 SELECT w.id INTO order_id FROM app.work_order w WHERE w.tenant_id=tenant AND w.job_id=p_job;
 IF order_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- No time is supplied: started_at is the column default.
 INSERT INTO app.site_visit(tenant_id,id,job_id,work_order_id,membership_id) VALUES(tenant,new_visit,p_job,order_id,p_actor);
 RETURN new_visit;
END $$;

-- 3. Complete a visit. There is no parameter, default or code path that completes a visit without inserting the answer.
CREATE FUNCTION app.ent3b_complete_visit(p_actor uuid, p_command uuid, p_job uuid, p_visit uuid, p_answer text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant uuid; answers integer; answered text; visit_row app.site_visit; answer_id uuid:=gen_random_uuid(); recorded timestamptz;
BEGIN
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(tenant::text,54));
 IF p_actor IS NULL OR p_command IS NULL OR p_job IS NULL OR p_visit IS NULL OR NOT EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=tenant AND r.command_id=p_command AND r.status='processing' AND r.command_type='CompleteSiteVisit' AND r.actor_membership_id=p_actor) THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 IF p_answer IS NULL OR p_answer NOT IN('yes','no') THEN RAISE EXCEPTION 'CLOSEOUT_ANSWER_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*)::integer, min(a.decision) INTO answers, answered FROM app.ent3b_visit_authority(p_actor,p_job) a;
 IF answers IS DISTINCT FROM 1 OR answered IS DISTINCT FROM 'allowed' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tenant::text||':'||p_visit::text,3102));
 SELECT * INTO visit_row FROM app.site_visit v WHERE v.tenant_id=tenant AND v.id=p_visit AND v.job_id=p_job AND v.membership_id=p_actor;
 IF visit_row.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF visit_row.completed_at IS NOT NULL THEN RAISE EXCEPTION 'VISIT_ALREADY_COMPLETED' USING ERRCODE='55000'; END IF;
 -- One server reading is both the completion time and the answer's recorded time.
 recorded:=pg_catalog.clock_timestamp();
 UPDATE app.site_visit SET completed_at=recorded WHERE tenant_id=tenant AND id=p_visit;
 INSERT INTO app.closeout_answer(tenant_id,id,job_id,work_order_id,site_visit_id,membership_id,question_version,answer,command_id,server_recorded_at)
  VALUES(tenant,answer_id,p_job,visit_row.work_order_id,p_visit,p_actor,'closeout-question.v1',p_answer,p_command,recorded);
 RETURN answer_id;
END $$;

-- 5. Called inside the site-extra seam when the extra names a visit. Reads the STORED origin row; an extra can never be attached to a visit that completes first.
CREATE FUNCTION app.ent3b_require_open_visit(p_job uuid, p_variation uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE tenant uuid; origin_row app.extra_origin; visit_row app.site_visit;
BEGIN
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT o.* INTO origin_row FROM app.extra_origin o WHERE(o.tenant_id,o.job_id,o.variation_id)=(tenant,p_job,p_variation);
 IF origin_row.variation_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF origin_row.site_visit_id IS NULL THEN RETURN; END IF;
 -- The shared form of the lock routine 3 takes exclusively: a completion waits for an extra in flight.
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(tenant::text||':'||origin_row.site_visit_id::text,3102));
 SELECT * INTO visit_row FROM app.site_visit v WHERE v.tenant_id=tenant AND v.id=origin_row.site_visit_id;
 IF visit_row.id IS NULL OR visit_row.membership_id IS DISTINCT FROM origin_row.raising_membership_id OR visit_row.job_id IS DISTINCT FROM p_job OR visit_row.completed_at IS NOT NULL THEN
  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002';
 END IF;
END $$;

ALTER FUNCTION app.ent3b_visit_authority(uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3b_start_visit(uuid,uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3b_complete_visit(uuid,uuid,uuid,uuid,text) OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3b_require_open_visit(uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3b_closeout_guard() OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3b_require_closeout_audit() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ent3b_visit_authority(uuid,uuid), app.ent3b_start_visit(uuid,uuid,uuid), app.ent3b_complete_visit(uuid,uuid,uuid,uuid,text), app.ent3b_require_open_visit(uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
REVOKE ALL ON FUNCTION app.ent3b_closeout_guard(), app.ent3b_require_closeout_audit() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ent3b_visit_authority(uuid,uuid), app.ent3b_start_visit(uuid,uuid,uuid), app.ent3b_complete_visit(uuid,uuid,uuid,uuid,text), app.ent3b_require_open_visit(uuid,uuid) TO jobguard_runtime;
COMMIT;
