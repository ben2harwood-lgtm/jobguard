-- LP6D-WORKER-PRESENCE: presence deliberately includes expired bindings.
-- Shared LP-6e r3 boolean helper; LP-10 queue authority remains a separate hold.
BEGIN;

GRANT CREATE ON SCHEMA app TO jobguard_binding_owner;
CREATE OR REPLACE FUNCTION app.lp6e_request_binding_present() RETURNS boolean
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM control_plane.request_binding b
  WHERE b.environment_id=extract(epoch FROM pg_postmaster_start_time())::text||':'||(SELECT d.oid::text FROM pg_catalog.pg_database d WHERE d.datname=current_database())
   AND b.transaction_id=pg_current_xact_id())
$$;
ALTER FUNCTION app.lp6e_request_binding_present() OWNER TO jobguard_binding_owner;
REVOKE CREATE ON SCHEMA app FROM jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.lp6e_request_binding_present() FROM PUBLIC,jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.lp6e_request_binding_present() TO jobguard_migration;

CREATE OR REPLACE FUNCTION app.lp6d_escalate_overdue_worker() RETURNS TABLE(request_id uuid, job_id uuid, variation_id uuid, step_index integer, eligible_roles text[])
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF app.lp6d_request_bound() OR app.lp6e_request_binding_present() THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT * FROM app.lp6d_xa_escalate();
END $$;
ALTER FUNCTION app.lp6d_escalate_overdue_worker() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6d_escalate_overdue_worker() FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.lp6d_escalate_overdue_worker() TO jobguard_runtime;

CREATE OR REPLACE FUNCTION app.lp6d_recovery_message_sink_worker(p_outbox uuid,p_reference text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; prior_original text; n bigint;
BEGIN
 IF app.lp6d_request_bound() OR app.lp6e_request_binding_present() THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END IF;
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN t:=NULL; END;
 IF t IS NULL OR p_reference IS NULL OR p_reference='' THEN RAISE EXCEPTION 'RECOVERY_MESSAGE_SINK_INVALID' USING ERRCODE='23514'; END IF;
 prior_original:=current_setting('app.job_proof_source_read',true);
 PERFORM set_config('app.job_proof_source_read','on',true);
 INSERT INTO app.recovery_message_sink(id,tenant_id,job_id,case_id,message_id,outbox_action_id,recipient,body,content_hash,attachment_hash,provider_reference,environment,real_external_actions)
 SELECT gen_random_uuid(),m.tenant_id,m.job_id,m.case_id,m.id,ap.outbox_action_id,m.recipient,m.body,m.content_hash,m.attachment_hash,p_reference,'synthetic_demo',0
 FROM app.recovery_message_approval ap JOIN app.recovery_message m ON m.tenant_id=ap.tenant_id AND m.id=ap.message_id
 WHERE ap.tenant_id=t AND ap.outbox_action_id=p_outbox;
 GET DIAGNOSTICS n = ROW_COUNT;
 PERFORM set_config('app.job_proof_source_read',coalesce(prior_original,''),true);
 IF n=0 THEN RAISE EXCEPTION 'RECOVERY_MESSAGE_SINK_INVALID' USING ERRCODE='23514'; END IF;
END $$;
ALTER FUNCTION app.lp6d_recovery_message_sink_worker(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6d_recovery_message_sink_worker(uuid,text) FROM PUBLIC,jobguard_identity,jobguard_infrastructure,jobguard_shadow;
GRANT EXECUTE ON FUNCTION app.lp6d_recovery_message_sink_worker(uuid,text) TO jobguard_runtime;

COMMIT;
