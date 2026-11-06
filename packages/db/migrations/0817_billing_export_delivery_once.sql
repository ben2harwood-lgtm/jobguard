-- LATER-SAFETY-81: preserve function settings, ownership and ACLs through replacement.
BEGIN;

CREATE OR REPLACE FUNCTION app.cb_delivery(p_session uuid,p_job uuid,p_command uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; replay jsonb; b app.billing_export_batch; d uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); auth uuid:=gen_random_uuid(); box uuid:=gen_random_uuid(); expiry timestamptz;
BEGIN
 replay:=app.cb_begin(p_session,p_job,p_command,'ApproveBillingDelivery',p_payload); IF replay IS NOT NULL THEN RETURN replay; END IF;
 a:=app.cb_authority(p_session,p_job,true);
 SELECT * INTO b FROM app.billing_export_batch WHERE tenant_id=t AND job_id=p_job AND id=(p_payload->>'batchId')::uuid;
 IF b.id IS NULL THEN RAISE EXCEPTION 'BILLING_NOT_FOUND'; END IF;
 expiry:=(p_payload->>'expiresAt')::timestamptz;
 IF p_payload->>'contentHash' IS DISTINCT FROM b.json_hash OR p_payload->>'channel' NOT IN('fake_download','fake_sftp','fake_api') OR p_payload->>'destination' !~ '^[a-z0-9-]+(\.[a-z0-9-]+)*\.invalid$'
 OR expiry IS NULL OR expiry<=clock_timestamp() THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 -- cb_begin already holds the tenant billing fence and job locks, including for racing commands.
 -- Release only actions that cannot be sent; preserve sent or uncertain outcomes even after expiry.
 IF EXISTS(SELECT 1 FROM app.billing_export_delivery delivery
  JOIN app.action_outbox action ON(action.tenant_id,action.id)=(delivery.tenant_id,delivery.outbox_action_id)
  WHERE(delivery.tenant_id,delivery.job_id,delivery.batch_id)=(t,p_job,b.id) AND NOT (action.status IN('dead_letter','cancelled') OR (action.status IN('pending','retryable') AND action.authorization_expires_at<=clock_timestamp())))
 THEN RAISE EXCEPTION 'EXPORT_ALREADY_QUEUED' USING ERRCODE='23505'; END IF;
 -- Exact button approval; expiry is supplied explicitly, never a default or standing permission.
 INSERT INTO app.decision(tenant_id,id,subject_type,subject_ref,action_type) VALUES(t,d,'billing_export',b.id::text,'billing_export');
 INSERT INTO app.decision_resolution(tenant_id,id,decision_id,resolution,actor_membership_id) VALUES(t,r,d,'approved',a);
 INSERT INTO app.action_authorization(tenant_id,id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(t,auth,d,r,a,'billing_export',p_payload->>'destination',b.json_hash,1,b.total_net_pence,'GBP','billing-export.v1',expiry);
 INSERT INTO app.action_outbox(tenant_id,id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at)
 VALUES(t,box,auth,p_payload->>'channel','billing:'||p_command::text,'billing_export',p_payload->>'destination',b.json_hash,b.json_content,1,b.total_net_pence,'GBP','billing-export.v1',expiry);
 INSERT INTO app.billing_export_delivery(tenant_id,id,job_id,client_contract_id,batch_id,outbox_action_id,command_id) VALUES(t,box,p_job,b.client_contract_id,b.id,box,p_command);
 RETURN app.cb_complete(p_session,p_job,p_command,jsonb_build_object('outboxActionId',box));
END $$;

CREATE OR REPLACE FUNCTION app.cb_csv_cell(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT '"'||replace(CASE WHEN left(v,1)=ANY(ARRAY['=','+','-','@',chr(39),chr(9),chr(13)]) THEN chr(39)||v ELSE v END,'"','""')||'"'
$$;

COMMIT;
