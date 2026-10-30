BEGIN;
-- M4-17-S RED. Snapshot analysis only. No financial adjustment or external executor.
CREATE TABLE app.simulation_money_run (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 request jsonb NOT NULL, snapshot jsonb NOT NULL, source_hash text NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK(source_hash=app.final_lock_hash(snapshot))
);
CREATE TABLE app.simulation_money_review (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, run_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, request jsonb NOT NULL,
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,run_id) REFERENCES app.simulation_money_run(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['simulation_money_run','simulation_money_review'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY success_fee_tenant ON app.%I FOR ALL TO jobguard_migration USING(tenant_id=CASE WHEN pg_input_is_valid(current_setting(''app.tenant_id'',true),''uuid'') THEN nullif(current_setting(''app.tenant_id'',true),)::uuid END) WITH CHECK(tenant_id=CASE WHEN pg_input_is_valid(current_setting(app.tenant_id,true),uuid) THEN nullif(current_setting(app.tenant_id,true),)::uuid END)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access',n);
  EXECUTE format('CREATE TRIGGER success_fee_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;
-- Private: never accepts supplied financial facts. Whole-row snapshots preserve
-- identities and exact rational values; document bytes and free text are excluded.
CREATE FUNCTION app.simulation_money_sources(t uuid,j uuid,actor uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE result jsonb:=jsonb_build_object('version','simulation-money-snapshot.v1','tenantId',t,'jobId',j); live jsonb;
BEGIN
 SELECT result||jsonb_build_object('customer_invoice',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.customer_invoice x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('customer_credit_note',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.customer_credit_note x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('customer_payment',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.customer_payment x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('customer_payment_reversal',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.customer_payment_reversal x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('receipt_allocation_fact_revision',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.receipt_allocation_fact_revision x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('receipt_allocation_fact_source',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.receipt_allocation_fact_source x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('receipt_allocation_fact_line',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.receipt_allocation_fact_line x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('stored_receipt_case_allocation',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.stored_receipt_case_allocation x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('success_fee_derivation',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.success_fee_derivation x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('success_fee_journal',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.success_fee_journal x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('success_fee_journal_line',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.success_fee_journal_line x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('platform_fee_statement',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.platform_fee_statement x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('platform_fee_attempt',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.platform_fee_attempt x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('platform_fee_attempt_event',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.platform_fee_attempt_event x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('subscription_period',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.subscription_period x WHERE x.tenant_id=t) source_rows;
 SELECT result||jsonb_build_object('subscription_period_line',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.subscription_period_line x WHERE x.tenant_id=t) source_rows;
 SELECT result||jsonb_build_object('platform_statement',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.platform_statement x WHERE x.tenant_id=t) source_rows;
 SELECT result||jsonb_build_object('platform_statement_line',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.platform_statement_line x WHERE x.tenant_id=t) source_rows;
 SELECT result||jsonb_build_object('subscription_simulated_work',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.subscription_simulated_work x WHERE x.tenant_id=t) source_rows;
 SELECT result||jsonb_build_object('subscription_simulated_result',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x)-ARRAY['pdf_bytes','reference','reason','pdf_sha256'] source_row FROM app.subscription_simulated_result x WHERE x.tenant_id=t) source_rows;
 SELECT result||jsonb_build_object('practice_feed_event',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x) source_row FROM app.practice_feed_event x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('practice_feed_receipt_match',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x) source_row FROM app.practice_feed_receipt_match x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 SELECT result||jsonb_build_object('practice_feed_command',coalesce(jsonb_agg(source_row ORDER BY app.final_lock_canonical(source_row) COLLATE "C"),'[]'::jsonb)) INTO result FROM (SELECT to_jsonb(x) source_row FROM app.practice_feed_command x WHERE x.tenant_id=t AND x.job_id=j) source_rows;
 IF EXISTS(SELECT 1 FROM app.success_fee_derivation WHERE tenant_id=t AND job_id=j) THEN
  BEGIN
   live:=app.platform_fee_statement_sources(t,j,actor);
  EXCEPTION WHEN SQLSTATE '40001' OR SQLSTATE '0A000' THEN
   live:=jsonb_build_object('unavailable',true);
  END;
 END IF;
 RETURN result||jsonb_build_object('liveFee',live);
END $$;
CREATE FUNCTION app.simulation_money_run(p_job uuid,p_session text,p_command jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; actor record; availability jsonb; action text:=p_command->>'action'; cid uuid;
 r app.simulation_money_run; review app.simulation_money_review; source jsonb; digest text;
BEGIN
 availability:=app.read_success_fee_v3(p_job,p_session);
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 -- This branch precedes all hidden-source reads, even for supplied run IDs.
 IF availability->>'state'<>'catch_review_available' THEN
  RAISE EXCEPTION 'SUCCESS_FEE_DEPENDENCY_BOUND' USING ERRCODE='0A000';
 END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR p_command->>'version' IS DISTINCT FROM 'simulation-money-command.v1'
 OR action IS NULL OR action NOT IN('run','read','review','restore')
 OR NOT coalesce(pg_input_is_valid(p_command->>'commandId','uuid'),false)
 OR (p_command - (CASE WHEN action='run' THEN ARRAY['version','action','commandId'] ELSE ARRAY['version','action','commandId','runId','sourceHash'] END))<>'{}'
 OR (action<>'run' AND (NOT coalesce(pg_input_is_valid(p_command->>'runId','uuid'),false) OR coalesce(p_command->>'sourceHash','') !~ '^[a-f0-9]{64}$'))
 THEN RAISE EXCEPTION 'INVALID_SUCCESS_FEE_COMMAND' USING ERRCODE='23514'; END IF;
 cid:=(p_command->>'commandId')::uuid;
 -- Synthetic coarse fence: all source writers finish before snapshot collection.
 -- All business locks are acquired before the audit head. No provider call.
 LOCK TABLE app.customer_invoice,app.customer_credit_note,app.customer_payment,app.customer_payment_reversal,app.receipt_allocation_fact_revision,app.receipt_allocation_fact_source,app.receipt_allocation_fact_line,app.stored_receipt_case_allocation,app.success_fee_derivation,app.success_fee_journal,app.success_fee_journal_line,app.platform_fee_statement,app.platform_fee_attempt,app.platform_fee_attempt_event,app.subscription_period,app.subscription_period_line,app.platform_statement,app.platform_statement_line,app.subscription_simulated_work,app.subscription_simulated_result,app.action_authorization,app.recovery_attribution_revision,app.recovery_attribution_command,app.evidence_invalidation,app.shadow_signal_evidence,app.shadow_commercial_signal,app.shadow_disclosure_event,app.shadow_signal_ineligibility,app.recovery_case,app.recovery_claim_revision,app.recovery_case_event,app.practice_feed_event,app.practice_feed_command,app.practice_feed_receipt_match IN SHARE MODE;
 PERFORM pg_advisory_xact_lock(hashtextextended('simulation-money:'||t::text,0));
 SELECT * INTO actor FROM app.final_check_builder(t,p_job,p_session,action<>'read');
 PERFORM app.read_success_fee_v3(p_job,p_session);
 IF (action='review' AND EXISTS(SELECT 1 FROM app.simulation_money_run WHERE tenant_id=t AND id=cid))
 OR (action IN('run','restore') AND EXISTS(SELECT 1 FROM app.simulation_money_review WHERE tenant_id=t AND id=cid))
 THEN RAISE EXCEPTION 'SUCCESS_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
 IF action='review' THEN
  SELECT * INTO review FROM app.simulation_money_review WHERE tenant_id=t AND id=cid;
  IF FOUND THEN
   IF review.job_id<>p_job OR review.actor_membership_id<>actor.member_id OR review.request<>p_command
   THEN RAISE EXCEPTION 'SUCCESS_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  SELECT * INTO r FROM app.simulation_money_run WHERE tenant_id=t AND id=cid;
  IF FOUND AND action<>'read' THEN
   IF r.job_id<>p_job OR r.actor_membership_id<>actor.member_id OR r.request<>p_command
   THEN RAISE EXCEPTION 'SUCCESS_FEE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
   RETURN jsonb_build_object('runId',r.id,'jobId',p_job,'sourceHash',r.source_hash,'snapshot',r.snapshot,'paused',true);
  END IF;
 END IF;
 IF action<>'run' THEN
  SELECT * INTO r FROM app.simulation_money_run WHERE tenant_id=t AND job_id=p_job AND id=(p_command->>'runId')::uuid;
  IF r.id IS NULL OR r.source_hash<>p_command->>'sourceHash'
  THEN RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF action='review' AND review.id IS NULL THEN
   source:=app.simulation_money_sources(t,p_job,actor.member_id);
   IF app.final_lock_hash(source)<>r.source_hash THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
   INSERT INTO app.simulation_money_review VALUES(t,p_job,cid,r.id,actor.member_id,p_command);
   PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor.member_id::text,p_job,'simulation_money.review',jsonb_build_object('runId',r.id,'sourceHash',r.source_hash));
  END IF;
  -- Restore verifies the checkpoint, retains its exact rows and starts paused.
  -- It cannot execute queued money work or turn a review into a settlement.
  IF action IN('read','review') THEN
   RETURN jsonb_build_object('runId',r.id,'jobId',p_job,'sourceHash',r.source_hash,'snapshot',r.snapshot,'paused',true);
  END IF;
 END IF;
 source:=app.simulation_money_sources(t,p_job,actor.member_id); digest:=app.final_lock_hash(source);
 IF action='restore' AND digest<>r.source_hash THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED' USING ERRCODE='40001'; END IF;
 INSERT INTO app.simulation_money_run VALUES(t,p_job,cid,actor.member_id,p_command,source,digest);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor.member_id::text,p_job,'simulation_money.'||action,jsonb_build_object('runId',cid,'sourceHash',digest));
 RETURN jsonb_build_object('runId',cid,'jobId',p_job,'sourceHash',digest,'snapshot',source,'paused',true);
END $$;
ALTER FUNCTION app.simulation_money_sources(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.simulation_money_sources(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
ALTER FUNCTION app.simulation_money_run(uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.simulation_money_run(uuid,text,jsonb) FROM PUBLIC,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.simulation_money_run(uuid,text,jsonb) TO jobguard_runtime;
COMMIT;
