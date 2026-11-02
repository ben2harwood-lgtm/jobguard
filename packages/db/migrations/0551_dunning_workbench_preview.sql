BEGIN;
-- Reinstall the latest lifecycle-safe routine for existing databases, keeping the
-- partial live-snapshot index and every historical snapshot/Decision/receipt.
-- Expired unsent previews retire under the company lock before redrafting.
-- This subsystem has no sent state, delivery authorization or executor.
-- Exact preview Decisions only. No action_authorization, outbox, provider or retry.
CREATE OR REPLACE FUNCTION app.dunning_workbench(t uuid,digest text,j uuid,operation text,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; cid uuid; iid uuid; did uuid; source jsonb; fingerprint text; request_hash text;
 prior app.command_receipt; draft app.dunning_reminder; result jsonb;
 seq bigint; previous text; ts timestamptz; payload jsonb; ph text; eh text;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'DUNNING_DARK'; END IF;
 actor:=app.mon1_company_actor(t,digest);
 -- One company lock before source locks, command receipt and finally the audit head.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,480));
 actor:=app.mon1_company_actor(t,digest);
 IF operation IS NULL OR operation NOT IN('read','request','approve') OR v IS NULL OR jsonb_typeof(v)<>'object'
 THEN RAISE EXCEPTION 'INVALID_DUNNING_INPUT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j) THEN RAISE EXCEPTION 'DUNNING_UNAVAILABLE'; END IF;
 IF operation='read' THEN
  IF v<>'{}'::jsonb THEN RAISE EXCEPTION 'INVALID_DUNNING_INPUT'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('invoiceId',i.invoice_id,'projection',i.projection,
   'snapshotHash',app.final_lock_hash(i.projection),
   'decision',(SELECT jsonb_build_object('decisionId',r.decision_id,'snapshotHash',r.snapshot_hash,
    'expiresAt',r.expires_at,'status',r.status,'executable',false)
    FROM app.dunning_reminder r WHERE r.tenant_id=t AND r.job_id=j AND r.invoice_id=i.invoice_id
     AND r.snapshot_hash=app.final_lock_hash(i.projection) AND r.status IN('pending','approved')
     AND r.expires_at>clock_timestamp()
     AND NOT EXISTS(SELECT 1 FROM app.decision_resolution x WHERE x.tenant_id=t AND x.decision_id=r.decision_id AND x.resolution<>'approved')))
   ORDER BY i.invoice_id),'[]'::jsonb)
   FROM app.dunning_invoice i WHERE i.tenant_id=t AND i.job_id=j);
 END IF;
 IF v->>'version' IS DISTINCT FROM 'dunning-persist-command.v1'
  OR v-ARRAY['version','commandId','invoiceId','snapshotHash','nowTick','decisionId']<>'{}'::jsonb
  OR NOT (v ?& ARRAY['version','commandId','invoiceId','snapshotHash','nowTick'])
  OR jsonb_typeof(v->'nowTick') IS DISTINCT FROM 'number'
  OR (v->>'nowTick') !~ '^[0-9]+$' OR (v->>'nowTick')::numeric>9007199254740991
  OR coalesce(v->>'snapshotHash','') !~ '^[a-f0-9]{64}$'
  OR (operation='request' AND v ? 'decisionId') OR (operation='approve' AND NOT v ? 'decisionId')
 THEN RAISE EXCEPTION 'INVALID_DUNNING_INPUT'; END IF;
 cid:=(v->>'commandId')::uuid; iid:=(v->>'invoiceId')::uuid;
 IF cid IS NULL OR iid IS NULL THEN RAISE EXCEPTION 'INVALID_DUNNING_INPUT'; END IF;
 SELECT projection INTO source FROM app.dunning_invoice WHERE tenant_id=t AND job_id=j AND invoice_id=iid FOR SHARE;
 actor:=app.mon1_company_actor(t,digest); -- source lock may have waited
 fingerprint:=app.final_lock_hash(source);
 -- Recheck current facts even on replay. A balance/source/recipient change invalidates approval.
 IF source IS NULL OR fingerprint IS DISTINCT FROM v->>'snapshotHash'
  OR source->>'version' IS DISTINCT FROM 'dunning-invoice.v1' OR source->>'environment' IS DISTINCT FROM 'synthetic_demo'
  OR source->>'tenantId' IS DISTINCT FROM t::text OR source->>'jobId' IS DISTINCT FROM j::text OR source->>'invoiceId' IS DISTINCT FROM iid::text
  OR source->'pilotNoCharge' IS DISTINCT FROM 'false'::jsonb OR source->'disputed' IS DISTINCT FROM 'false'::jsonb
  OR source->'refundPending' IS DISTINCT FROM 'false'::jsonb OR source->'reversed' IS DISTINCT FROM 'false'::jsonb
  OR source->'cancelled' IS DISTINCT FROM 'false'::jsonb
  OR coalesce(source->>'attemptState','') NOT IN('none','definite_failure')
  OR coalesce(source->>'sourceState','') NOT IN('issued_invoice','locked_final_account')
  OR (source->>'sourceState'='locked_final_account' AND source->>'finalAccountLockId' IS NULL)
  OR coalesce(source->>'outstandingPence','') !~ '^[0-9]+$'
  OR (source->>'outstandingPence')::numeric NOT BETWEEN 1 AND 1000000000000
  OR (source->>'outstandingPence')::numeric>coalesce((source->>'originalPence')::numeric,0)
  -- Persisted dueTick is Unix milliseconds. Client nowTick is compatibility data only.
  OR coalesce((source->>'dueTick')::numeric,9007199254740992)>floor(extract(epoch FROM clock_timestamp())*1000)
 THEN RAISE EXCEPTION 'DUNNING_UNAVAILABLE'; END IF;
 request_hash:=app.final_lock_hash(jsonb_build_object('operation',operation,'jobId',j,'actor',actor,'input',v));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.command_type<>'dunning.'||operation OR prior.request_hash<>request_hash THEN RAISE EXCEPTION 'DUNNING_CONFLICT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.dunning_reminder r WHERE r.tenant_id=t AND r.decision_id=(prior.result->>'decisionId')::uuid
   AND r.status IN('pending','approved') AND r.expires_at>clock_timestamp()
   AND NOT EXISTS(SELECT 1 FROM app.decision_resolution x WHERE x.tenant_id=t AND x.decision_id=r.decision_id AND x.resolution<>'approved'))
  THEN RAISE EXCEPTION 'DUNNING_UNAVAILABLE'; END IF;
  RETURN prior.result;
 END IF;
 IF operation='request' THEN
  -- Retire only the lifecycle projection, preserving old Decisions, resolutions,
  -- snapshots and receipts. The existing company lock serializes redrafts.
  UPDATE app.dunning_reminder r SET status=CASE WHEN r.expires_at<=clock_timestamp() THEN 'expired'
   ELSE (SELECT x.resolution FROM app.decision_resolution x WHERE x.tenant_id=t AND x.decision_id=r.decision_id) END
   WHERE r.tenant_id=t AND r.invoice_id=iid AND r.snapshot_hash=fingerprint AND r.status IN('pending','approved')
   AND (r.expires_at<=clock_timestamp() OR EXISTS(SELECT 1 FROM app.decision_resolution x WHERE x.tenant_id=t AND x.decision_id=r.decision_id AND x.resolution<>'approved'));
  SELECT * INTO draft FROM app.dunning_reminder WHERE tenant_id=t AND invoice_id=iid AND snapshot_hash=fingerprint AND status IN('pending','approved');
  IF NOT FOUND THEN
   did:=gen_random_uuid();
   INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(did,t,'dunning_invoice',iid::text,'dunning.reminder.preview');
   INSERT INTO app.dunning_reminder(tenant_id,job_id,invoice_id,decision_id,snapshot_hash,snapshot) VALUES(t,j,iid,did,fingerprint,source) RETURNING * INTO draft;
  END IF;
 ELSE
  did:=(v->>'decisionId')::uuid;
  SELECT * INTO draft FROM app.dunning_reminder WHERE tenant_id=t AND job_id=j AND invoice_id=iid AND decision_id=did AND snapshot_hash=fingerprint;
  IF NOT FOUND OR draft.status NOT IN('pending','approved') OR draft.expires_at<=clock_timestamp() OR draft.snapshot IS DISTINCT FROM source
   OR NOT EXISTS(SELECT 1 FROM app.decision WHERE tenant_id=t AND id=did AND subject_type='dunning_invoice' AND subject_ref=iid::text AND action_type='dunning.reminder.preview')
   OR EXISTS(SELECT 1 FROM app.decision_resolution WHERE tenant_id=t AND decision_id=did AND resolution<>'approved')
  THEN RAISE EXCEPTION 'DUNNING_UNAVAILABLE'; END IF;
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)
   VALUES(gen_random_uuid(),t,did,'approved',actor) ON CONFLICT(tenant_id,decision_id) DO NOTHING;
  UPDATE app.dunning_reminder SET status='approved' WHERE tenant_id=t AND decision_id=did;
 END IF;
 IF draft.expires_at<=clock_timestamp() OR EXISTS(SELECT 1 FROM app.decision_resolution WHERE tenant_id=t AND decision_id=draft.decision_id AND resolution<>'approved')
 THEN RAISE EXCEPTION 'DUNNING_UNAVAILABLE'; END IF;
 result:=jsonb_build_object('decisionId',draft.decision_id,'snapshotHash',draft.snapshot_hash,'expiresAt',draft.expires_at,
  'status',(CASE WHEN EXISTS(SELECT 1 FROM app.decision_resolution WHERE tenant_id=t AND decision_id=draft.decision_id AND resolution='approved') THEN 'approved' ELSE 'pending' END),'executable',false);
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(cid,t,'dunning.'||operation,cid::text,request_hash,'succeeded',result,actor,clock_timestamp());
 -- Audit takes the final contending lock. Payload contains references and hashes only.
 SELECT sequence,event_hash INTO seq,previous FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp());
 payload:=jsonb_build_object('references',jsonb_build_object('commandId',cid::text,'decisionId',draft.decision_id::text),'hashes',jsonb_build_object('snapshot',fingerprint,'request',request_hash)); ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'membership:'||actor::text,'dunning.'||operation,'dunning_invoice',iid::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(previous,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(gen_random_uuid(),t,seq,'audit.v1','membership:'||actor::text,'dunning.'||operation,'dunning_invoice',iid::text,ts,payload,ph,previous,eh);
 PERFORM app.advance_audit_head(seq,eh);
 RETURN result;
END $$;
ALTER FUNCTION app.dunning_workbench(uuid,text,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.dunning_workbench(uuid,text,uuid,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.dunning_workbench(uuid,text,uuid,text,jsonb) TO jobguard_runtime;
COMMIT;
