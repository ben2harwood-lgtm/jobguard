BEGIN;
-- SV-5 Q2 (Ben, 28 Oct): "Yes, this was extra work" creates only an unpriced jobguard_catch variation.
-- No case, claim, price or money effect here; the recovery case waits for the builder's priced approval.
-- The answer binding gains exactly one value, keeping the five existing ones.
ALTER TABLE app.final_check_disposition_binding DROP CONSTRAINT final_check_disposition_binding_answer_check;
ALTER TABLE app.final_check_disposition_binding ADD CONSTRAINT final_check_disposition_binding_answer_check
 CHECK(answer IN('already_included','in_original_scope','not_completed','not_chargeable','wrong_job_or_evidence','confirmed_extra'));

CREATE FUNCTION app.confirm_final_check_catch(t uuid,j uuid,d text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE actor record;prior app.command_receipt;proof app.final_check_reveal_proof;sig app.shadow_commercial_signal;l app.final_account_lock;cid uuid;
 request_digest text;result jsonb;disposition uuid:=gen_random_uuid();event uuid:=gen_random_uuid();scope uuid:=gen_random_uuid();label text;
BEGIN
 SELECT * INTO actor FROM app.final_check_builder(t,j,d,true);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 -- Authority and its locks precede subject parsing and replay (same order as record_final_check_disposition).
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM 'final-check.catch.v1' OR (SELECT count(*) FROM jsonb_object_keys(p))<>6
 OR NOT p ?& ARRAY['version','commandId','lockId','runId','signalId','expectedSignalRevision']
 OR jsonb_typeof(p->'commandId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'lockId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'runId') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p->'signalId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'expectedSignalRevision') IS DISTINCT FROM 'number' OR (p->>'expectedSignalRevision') !~ '^[0-9]+$'
 THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 cid:=(p->>'commandId')::uuid;
 request_digest:=app.final_lock_hash(jsonb_build_object('job',j,'actor',actor.member_id,'identity',actor.user_id,'payload',p));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||cid::text,145));
 IF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t) a WHERE a.membership_id=actor.member_id AND a.identity_user_id=actor.user_id) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN IF prior.command_type<>'ConfirmJobGuardCatch' OR prior.request_hash<>request_digest OR prior.actor_membership_id<>actor.member_id OR prior.status<>'succeeded' THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;RETURN prior.result; END IF;
 SELECT * INTO proof FROM app.final_check_reveal_proof WHERE tenant_id=t AND job_id=j AND run_id=(p->>'runId')::uuid AND signal_id=(p->>'signalId')::uuid AND lock_id=(p->>'lockId')::uuid;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.shadow_signal_classification WHERE tenant_id=t AND job_id=j AND run_id=proof.run_id AND signal_id=proof.signal_id AND outcome='reveal') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO sig FROM app.shadow_commercial_signal WHERE tenant_id=t AND job_id=j AND id=proof.signal_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t) a WHERE a.membership_id=actor.member_id AND a.identity_user_id=actor.user_id) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF sig.state<>'revealed' OR sig.revision<>(p->>'expectedSignalRevision')::integer OR proof.signal_revision<>sig.revision THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 -- The extra-origin check requires the raising command's receipt in 'processing' with this exact semantic key; the variation id is the command id.
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(t,cid,'ConfirmJobGuardCatch','extra-origin:'||j::text||':'||cid::text,request_digest,'processing',actor.member_id);
 label:=left(proof.description,500);
 INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES(scope,t,j,'reserved');
 INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,existing_scope_item_id,lineage_parent_scope_item_id,capture_kind,capture_text,description,origin)
 VALUES(cid,t,j,scope,NULL,NULL,'text',left(proof.description,5000),label,'jobguard_catch');
 INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,command_id,raising_membership_id,raising_role,provenance,source_signal_id)
 VALUES(t,j,cid,'small_builder','jobguard_catch',cid,actor.member_id,'owner','command',sig.id);
 INSERT INTO app.shadow_signal_disposition(tenant_id,job_id,id,run_id,signal_id,disposition) VALUES(t,j,disposition,proof.run_id,proof.signal_id,'confirmed_extra');
 INSERT INTO app.final_check_disposition_binding(tenant_id,job_id,disposition_id,run_id,signal_id,lock_id,expected_signal_revision,command_id,actor_membership_id,identity_user_id,answer,selected_reference_id,selected_reference_kind,request_hash,audit_event_id)
 VALUES(t,j,disposition,proof.run_id,proof.signal_id,l.id,sig.revision,cid,actor.member_id,actor.user_id,'confirmed_extra',NULL,NULL,request_digest,event);
 UPDATE app.shadow_commercial_signal SET state='confirmed_extra',revision=revision+1 WHERE tenant_id=t AND job_id=j AND id=sig.id;
 result:=jsonb_build_object('dispositionId',disposition,'signalId',sig.id,'runId',proof.run_id,'lockId',l.id,'disposition','confirmed_extra','variationId',cid);
 UPDATE app.command_receipt SET status='succeeded',result=result,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=cid;
 PERFORM app.append_final_check_audit(event,'membership:'||actor.member_id::text,j,'final_check.catch_confirmed',jsonb_build_object('dispositionId',disposition,'signalId',sig.id,'commandId',cid,'runId',proof.run_id,'variationId',cid));
 RETURN result;
END $$;
ALTER FUNCTION app.confirm_final_check_catch(uuid,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.confirm_final_check_catch(uuid,uuid,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.confirm_final_check_catch(uuid,uuid,text,jsonb) TO jobguard_runtime;
COMMIT;
