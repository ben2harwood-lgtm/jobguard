BEGIN;
-- ENT-6B. Synthetic-only checked billing writers; runtime SELECT only on all new business tables.
CREATE TABLE app.billing_export_batch (
 tenant_id uuid NOT NULL,id uuid NOT NULL,job_id uuid NOT NULL,client_contract_id uuid NOT NULL,
 command_id uuid NOT NULL,artifact jsonb NOT NULL,json_content text NOT NULL,csv_content text NOT NULL,
 json_hash char(64) NOT NULL,csv_hash char(64) NOT NULL,total_net_pence bigint NOT NULL CHECK(total_net_pence BETWEEN 1 AND 1000000000000),
 server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,client_contract_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,client_contract_id) REFERENCES app.client_contract(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 CHECK(json_hash=encode(sha256(convert_to(json_content,'UTF8')),'hex')),
 CHECK(csv_hash=encode(sha256(convert_to(csv_content,'UTF8')),'hex')),
 CHECK(artifact=json_content::jsonb)
);
CREATE TABLE app.billing_export_line (
 tenant_id uuid NOT NULL,id uuid NOT NULL,job_id uuid NOT NULL,client_contract_id uuid NOT NULL,batch_id uuid NOT NULL,
 extra_id uuid NOT NULL,scope_item_id uuid NOT NULL,revision_id uuid NOT NULL,revision_hash char(64) NOT NULL,
 approval_request_id uuid NOT NULL,approval_binding_id uuid NOT NULL,approved_net_pence bigint NOT NULL CHECK(approved_net_pence>0),line jsonb NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,id),UNIQUE(tenant_id,job_id,client_contract_id,id),UNIQUE(tenant_id,extra_id),UNIQUE(tenant_id,revision_id),
 FOREIGN KEY(tenant_id,job_id,client_contract_id,batch_id) REFERENCES app.billing_export_batch(tenant_id,job_id,client_contract_id,id),
 FOREIGN KEY(tenant_id,job_id,extra_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,extra_id,approval_request_id) REFERENCES app.extra_approval_request(tenant_id,job_id,variation_id,id),
 FOREIGN KEY(tenant_id,job_id,extra_id,approval_binding_id) REFERENCES app.extra_approval_revision_binding(tenant_id,job_id,variation_id,id)
);
CREATE TABLE app.billing_status_import (
 tenant_id uuid NOT NULL,id uuid NOT NULL,job_id uuid NOT NULL,command_id uuid NOT NULL,
 transport text NOT NULL CHECK(transport IN('csv','api')),source_hash char(64) NOT NULL,
 actor_membership_id uuid NOT NULL,server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,id),UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.billing_fact (
 tenant_id uuid NOT NULL,id uuid NOT NULL,job_id uuid NOT NULL,client_contract_id uuid NOT NULL,import_id uuid NOT NULL,
 source text NOT NULL,source_event_id text NOT NULL,invoice_number text NOT NULL,payload jsonb NOT NULL,payload_hash char(64) NOT NULL,
 match_valid boolean NOT NULL,server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,client_contract_id,id),UNIQUE(tenant_id,source,source_event_id),
 FOREIGN KEY(tenant_id,job_id,import_id) REFERENCES app.billing_status_import(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,client_contract_id) REFERENCES app.client_contract(tenant_id,id)
);
CREATE TABLE app.billing_line_match (
 tenant_id uuid NOT NULL,id uuid NOT NULL,job_id uuid NOT NULL,client_contract_id uuid NOT NULL,fact_id uuid NOT NULL,
 external_invoice_line_id text NOT NULL,export_line_id uuid NOT NULL,line_job_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,fact_id,external_invoice_line_id),
 FOREIGN KEY(tenant_id,job_id,client_contract_id,fact_id) REFERENCES app.billing_fact(tenant_id,job_id,client_contract_id,id),
 FOREIGN KEY(tenant_id,line_job_id,client_contract_id,export_line_id) REFERENCES app.billing_export_line(tenant_id,job_id,client_contract_id,id)
);
CREATE TABLE app.billing_quarantine (
 tenant_id uuid NOT NULL,id uuid NOT NULL,job_id uuid NOT NULL,client_contract_id uuid NOT NULL,fact_id uuid NOT NULL,
 reason text NOT NULL,server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,fact_id,reason),
 FOREIGN KEY(tenant_id,job_id,client_contract_id,fact_id) REFERENCES app.billing_fact(tenant_id,job_id,client_contract_id,id)
);
CREATE TABLE app.billing_allocation_run (
 tenant_id uuid NOT NULL,id uuid NOT NULL,job_id uuid NOT NULL,client_contract_id uuid NOT NULL,source text NOT NULL,invoice_number text NOT NULL,
 input_hash char(64) NOT NULL,projection jsonb NOT NULL,predecessor_id uuid,command_id uuid NOT NULL,
 derivation_version text NOT NULL DEFAULT 'billing-derivation.v1' CHECK(derivation_version='billing-derivation.v1'),
 server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,id),UNIQUE(tenant_id,job_id,source,invoice_number,input_hash),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,client_contract_id) REFERENCES app.client_contract(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,predecessor_id) REFERENCES app.billing_allocation_run(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id)
);
CREATE TABLE app.billing_application_event (
 tenant_id uuid NOT NULL,id uuid NOT NULL,job_id uuid NOT NULL,run_id uuid NOT NULL,command_id uuid NOT NULL,
 server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,run_id),
 FOREIGN KEY(tenant_id,job_id,run_id) REFERENCES app.billing_allocation_run(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id)
);
CREATE TABLE app.contractor_receipt_line_allocation (
 tenant_id uuid NOT NULL,id uuid NOT NULL,job_id uuid NOT NULL,run_id uuid NOT NULL,source_ref text NOT NULL,original_source_ref text,
 external_invoice_line_id text NOT NULL,export_line_id uuid,line_job_id uuid NOT NULL,
 rule text NOT NULL CHECK(rule IN('explicit','separate_invoice','pro_rata')),
 gross_numerator numeric(120,0) NOT NULL,gross_denominator numeric(120,0) NOT NULL CHECK(gross_denominator>0),
 net_numerator numeric(120,0) NOT NULL,net_denominator numeric(120,0) NOT NULL CHECK(net_denominator>0),
 matched_extra_numerator numeric(120,0) NOT NULL,matched_extra_denominator numeric(120,0) NOT NULL CHECK(matched_extra_denominator>0),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,run_id,source_ref,external_invoice_line_id),
 CHECK(export_line_id IS NOT NULL OR matched_extra_numerator=0),
 FOREIGN KEY(tenant_id,job_id,run_id) REFERENCES app.billing_allocation_run(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,line_job_id,export_line_id) REFERENCES app.billing_export_line(tenant_id,job_id,id)
);
CREATE TABLE app.billing_export_delivery (
 tenant_id uuid NOT NULL,id uuid NOT NULL,job_id uuid NOT NULL,client_contract_id uuid NOT NULL,batch_id uuid NOT NULL,
 outbox_action_id uuid NOT NULL,command_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,outbox_action_id),
 FOREIGN KEY(tenant_id,job_id,client_contract_id,batch_id) REFERENCES app.billing_export_batch(tenant_id,job_id,client_contract_id,id),
 FOREIGN KEY(tenant_id,outbox_action_id) REFERENCES app.action_outbox(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id)
);
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['billing_export_batch','billing_export_line','billing_status_import','billing_fact','billing_line_match','billing_quarantine','billing_allocation_run','billing_application_event','contractor_receipt_line_allocation','billing_export_delivery'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
 EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);
 EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
END LOOP; END $$;

-- Authority first, even for missing/foreign/closed targets. Session actor is never supplied by the caller.
CREATE FUNCTION app.cb_authority(p_session uuid,p_job uuid,p_write boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; s app.job; v_job uuid; jobs uuid[];
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 SELECT m.id INTO a FROM app.contractor_session(p_session) x JOIN app.membership m ON(m.tenant_id,m.id,m.identity_user_id)=(x.tenant_id,x.membership_id,x.identity_user_id)
 WHERE x.tenant_id=t AND m.role='finance' AND coalesce(app.contractor_member_active(m.id),false)
  AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND EXISTS(SELECT 1 FROM app.role_grant g WHERE(g.tenant_id,g.membership_id)=(t,m.id) AND g.role='finance' AND g.scope_kind='tenant' AND g.scope_id=t
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(t,g.id)));
 IF a IS NULL THEN RAISE EXCEPTION 'BILLING_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_write THEN
  -- Shared organisation fence, job/group, ordered extra members, actor; no business locks after audit.
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text,618));
  jobs:=ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(coalesce(nullif(current_setting('app.cb_job_ids',true),''),'[]')::jsonb) x UNION SELECT p_job ORDER BY 1);
  FOREACH v_job IN ARRAY jobs LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||v_job::text,417));
   PERFORM 1 FROM app.job WHERE tenant_id=t AND id=v_job FOR SHARE;
   PERFORM 1 FROM app.variation WHERE tenant_id=t AND job_id=v_job ORDER BY id FOR UPDATE;
  END LOOP;
  PERFORM 1 FROM app.membership WHERE tenant_id=t AND id=a FOR SHARE;
  IF NOT coalesce(app.contractor_member_active(a),false) OR NOT EXISTS(SELECT 1 FROM app.membership m JOIN app.role_grant g ON(g.tenant_id,g.membership_id)=(m.tenant_id,m.id) WHERE m.tenant_id=t AND m.id=a AND m.role='finance' AND g.role='finance' AND g.scope_kind='tenant' AND g.scope_id=t AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(t,g.id))) THEN RAISE EXCEPTION 'BILLING_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT j.* INTO s FROM app.job j JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
 WHERE j.tenant_id=t AND j.id=p_job AND c.job_track='contractor' AND c.environment='synthetic_demo';
 IF s.id IS NULL THEN RAISE EXCEPTION 'BILLING_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF p_write AND s.status<>'live' THEN RAISE EXCEPTION 'JOB_NOT_LIVE' USING ERRCODE='23514'; END IF;
 IF p_write THEN FOREACH v_job IN ARRAY jobs LOOP
  IF NOT EXISTS(SELECT 1 FROM app.job z JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(z.tenant_id,z.id) WHERE z.tenant_id=t AND z.id=v_job AND c.job_track='contractor' AND c.environment='synthetic_demo') THEN RAISE EXCEPTION 'BILLING_NOT_FOUND'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=v_job AND status='live') THEN RAISE EXCEPTION 'JOB_NOT_LIVE' USING ERRCODE='23514'; END IF;
 END LOOP; END IF;
 RETURN a;
END $$;
CREATE FUNCTION app.cb_begin(p_session uuid,p_job uuid,p_command uuid,p_kind text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; h text; r app.command_receipt;
BEGIN
 a:=app.cb_authority(p_session,p_job,false);
 -- Establish the whole invoice's job lock set before acquiring any member lock.
 PERFORM set_config('app.cb_job_ids',coalesce((SELECT jsonb_agg(DISTINCT job) FROM(
  SELECT x.value->'match'->>'jobId' job FROM jsonb_array_elements(p_payload->'events') e CROSS JOIN LATERAL jsonb_array_elements(e->'composition'->'lines') x
  UNION SELECT x.value->'match'->>'jobId' FROM app.billing_fact f CROSS JOIN LATERAL jsonb_array_elements(f.payload->'composition'->'lines') x WHERE f.tenant_id=t AND f.job_id=p_job
  UNION SELECT p_job::text) j WHERE job IS NOT NULL),'[]'::jsonb)::text,true);
 a:=app.cb_authority(p_session,p_job,true);
 IF p_kind NOT IN('FinaliseExportBatch','ImportBillingStatus','ApproveBillingDelivery') THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 h:=app.final_lock_hash(jsonb_build_object('job',p_job,'kind',p_kind,'actor',a,'payload',p_payload));
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(t,p_command,p_kind,'contractor-billing:'||p_job::text||':'||p_command::text,h,'processing',a) ON CONFLICT DO NOTHING;
 IF FOUND THEN RETURN NULL; END IF;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF r.request_hash IS DISTINCT FROM h OR r.command_type IS DISTINCT FROM p_kind THEN RAISE EXCEPTION 'BILLING_CONFLICT' USING ERRCODE='23505'; END IF;
 -- A caller may stage the checked command and its pure artifact in this transaction.
 -- A concurrent transaction cannot observe this processing row before commit.
 IF r.status='processing' THEN RETURN NULL; END IF;
 RETURN r.result;
END $$;
CREATE FUNCTION app.cb_complete(p_session uuid,p_job uuid,p_command uuid,p_result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; r app.command_receipt; seq bigint; prev text; ts timestamptz; ph text; eh text; payload jsonb; typ text;
BEGIN
 a:=app.cb_authority(p_session,p_job,true);
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command AND actor_membership_id=a AND semantic_key='contractor-billing:'||p_job::text||':'||p_command::text AND status='processing';
 IF r.command_type NOT IN('FinaliseExportBatch','ImportBillingStatus','ApproveBillingDelivery') OR r.command_id IS NULL THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 UPDATE app.command_receipt SET status='succeeded',result=p_result,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=p_command;
 typ:='contractor.billing.'||lower(r.command_type);
 payload:=jsonb_build_object('references',jsonb_build_object('command',p_command::text,'job',p_job::text,'environment','synthetic_demo'),'hashes',jsonb_strip_nulls(jsonb_build_object('request',r.request_hash,'result',app.final_lock_hash(p_result),
  'artifact',(SELECT json_hash FROM app.billing_export_batch WHERE tenant_id=t AND command_id=p_command),
  'csv',(SELECT csv_hash FROM app.billing_export_batch WHERE tenant_id=t AND command_id=p_command),
  'derivation',(SELECT app.final_lock_hash(jsonb_agg(jsonb_build_object('id',id,'input',input_hash,'projection',app.final_lock_hash(projection)) ORDER BY source,invoice_number)) FROM app.billing_allocation_run WHERE tenant_id=t AND command_id=p_command))));
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp()); ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'membership:'||a::text,typ,'job',p_job::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(gen_random_uuid(),t,seq,'audit.v1','membership:'||a::text,typ,'job',p_job::text,ts,payload,ph,prev,eh);
 PERFORM app.advance_audit_head(seq,eh);
 RETURN p_result;
END $$;
-- Pure read of deterministic candidates, including unapproved captures; no empty candidate default.
CREATE FUNCTION app.cb_unresolved(p_tenant uuid,p_job uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 WITH active AS(SELECT l.duplicate_id,l.canonical_id FROM app.extra_duplicate_link l WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.kind='link'
  AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE(u.tenant_id,u.reverses_link_id)=(l.tenant_id,l.id))),
 members AS(SELECT v.*,o.site_visit_id,o.server_recorded_at,coalesce(l.canonical_id,v.id) canonical FROM app.variation v
  JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(v.tenant_id,v.job_id,v.id) LEFT JOIN active l ON l.duplicate_id=v.id
  WHERE v.tenant_id=p_tenant AND v.job_id=p_job AND app.xa_latest_kind(p_tenant,p_job,v.id) NOT IN('withdrawn','credited','billing_rejected'))
 SELECT EXISTS(SELECT 1 FROM members a JOIN members b ON a.id<b.id AND a.canonical<>b.canonical
 WHERE(a.sor_code IS NOT NULL AND a.sor_code=b.sor_code OR a.excess_of_scope_item_id IS NOT NULL AND a.excess_of_scope_item_id=b.excess_of_scope_item_id)
 AND(a.site_visit_id IS NOT NULL AND a.site_visit_id=b.site_visit_id OR(a.server_recorded_at AT TIME ZONE 'UTC')::date=(b.server_recorded_at AT TIME ZONE 'UTC')::date))
$$;
CREATE FUNCTION app.cb_candidates(p_session uuid,p_job uuid,p_contract uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; result jsonb;
BEGIN
 PERFORM app.cb_authority(p_session,p_job,true);
 IF NOT EXISTS(SELECT 1 FROM app.work_order WHERE tenant_id=t AND job_id=p_job AND contract_id=p_contract) THEN RAISE EXCEPTION 'BILLING_NOT_FOUND'; END IF;
 IF app.cb_unresolved(t,p_job) THEN RAISE EXCEPTION 'BILLING_DUPLICATES_UNRESOLVED' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(x.line ORDER BY x.extra),'[]'::jsonb) INTO result FROM(
 SELECT v.id extra,jsonb_build_object('jobId',p_job,'extraId',v.id,'scopeItemId',v.scope_item_id,'revisionId',b.source_revision_id,'revisionHash',q.revision_hash,
 'approvalBindingId',b.id,'approvalSnapshotHash',q.request_hash,'description',coalesce(vr.description,v.description),
 'quantity',coalesce(sr.quantity,vr.quantity_decimal),'unit',coalesce(sr.unit,vr.unit),
 'priceProvenance',CASE WHEN b.source_kind='server_sor' THEN 'server_sor' ELSE 'human_confirmed' END,
 'approvedNet',jsonb_build_object('pence',q.net_pence,'currency','GBP')) line
 FROM app.variation v JOIN app.extra_approval_request q ON(q.tenant_id,q.job_id,q.variation_id)=(v.tenant_id,v.job_id,v.id)
 JOIN app.extra_approval_outcome o ON(o.tenant_id,o.request_id)=(q.tenant_id,q.id) AND o.kind='approved'
 JOIN app.extra_approval_revision_binding b ON(b.tenant_id,b.id)=(q.tenant_id,q.binding_id)
 LEFT JOIN app.extra_sor_revision sr ON(sr.tenant_id,sr.id)=(b.tenant_id,b.sor_revision_id)
 LEFT JOIN app.variation_revision vr ON(vr.tenant_id,vr.id)=(b.tenant_id,b.variation_revision_id)
 WHERE v.tenant_id=t AND v.job_id=p_job AND q.net_pence>0
 AND q.request_revision=(SELECT max(z.request_revision) FROM app.extra_approval_request z WHERE(z.tenant_id,z.variation_id)=(t,v.id))
 AND b.logical_revision=(SELECT max(z.logical_revision) FROM app.extra_approval_revision_binding z WHERE(z.tenant_id,z.variation_id)=(t,v.id))
 AND app.xa_latest_kind(t,p_job,v.id)='approved'
 AND (SELECT count(*) FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(t,q.id) AND f.approved_hash=q.revision_hash AND f.approved_net_pence=q.net_pence)=jsonb_array_length(q.requirement->'steps')
 AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link d WHERE(d.tenant_id,d.job_id,d.duplicate_id)=(t,p_job,v.id) AND d.kind='link' AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE(u.tenant_id,u.reverses_link_id)=(t,d.id)))
 AND NOT EXISTS(SELECT 1 FROM app.billing_export_line l WHERE(l.tenant_id,l.extra_id)=(t,v.id))
 AND NOT EXISTS(SELECT 1 FROM app.extra_order_line_link l WHERE(l.tenant_id,l.variation_id)=(t,v.id))
 ) x;
 RETURN result;
END $$;
CREATE FUNCTION app.cb_line_id(p_contract uuid,p_revision uuid) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT(substr(h,1,8)||'-'||substr(h,9,4)||'-8'||substr(h,14,3)||'-'||substr('89ab',mod(('x'||substr(h,17,1))::bit(4)::int,4)+1,1)||substr(h,18,3)||'-'||substr(h,21,12))::uuid
 FROM(SELECT app.final_lock_hash(jsonb_build_array('billing-export-line.v1',p_contract::text,p_revision::text)) h) x
$$;
CREATE FUNCTION app.cb_csv_cell(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT '"'||replace(CASE WHEN left(v,1)=ANY(ARRAY['=','+','-','@',chr(39)]) THEN chr(39)||v ELSE v END,'"','""')||'"'
$$;
CREATE FUNCTION app.cb_csv(p_artifact jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE result text:='version,client_contract_id,export_line_id,job_id,extra_id,scope_item_id,revision_id,revision_hash,approval_binding_id,approval_snapshot_hash,description,quantity,unit,price_provenance,approved_net_pence,currency,batch_total_net_pence,sandbox_label'||chr(13)||chr(10); l jsonb; cells text[]; row text;
BEGIN
 FOR l IN SELECT value FROM jsonb_array_elements(p_artifact->'lines') ORDER BY value->>'exportLineId' LOOP
  cells:=ARRAY['billing-export.v1',p_artifact->>'clientContractId',l->>'exportLineId',l->>'jobId',l->>'extraId',l->>'scopeItemId',l->>'revisionId',l->>'revisionHash',l->>'approvalBindingId',l->>'approvalSnapshotHash',l->>'description',l->>'quantity',l->>'unit',l->>'priceProvenance',l->'approvedNet'->>'pence','GBP',p_artifact->'totalNet'->>'pence',p_artifact->>'sandboxLabel'];
  SELECT string_agg(app.cb_csv_cell(v),',' ORDER BY ord) INTO row FROM unnest(cells) WITH ORDINALITY x(v,ord);
  result:=result||row||chr(13)||chr(10);
 END LOOP;
 RETURN result;
END $$;

CREATE FUNCTION app.cb_export(p_session uuid,p_job uuid,p_command uuid,p_payload jsonb,p_json text,p_csv text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; replay jsonb; expected jsonb; art jsonb; l jsonb; batch uuid:=gen_random_uuid(); req uuid; result jsonb; total bigint;
BEGIN
 replay:=app.cb_begin(p_session,p_job,p_command,'FinaliseExportBatch',p_payload); IF replay IS NOT NULL THEN RETURN replay; END IF;
 a:=app.cb_authority(p_session,p_job,true); expected:=app.cb_candidates(p_session,p_job,(p_payload->>'clientContractId')::uuid);
 IF jsonb_array_length(expected)=0 THEN RETURN app.cb_complete(p_session,p_job,p_command,jsonb_build_object('batchId',NULL,'lineCount',0)); END IF;
 art:=p_json::jsonb;
 IF p_csv IS DISTINCT FROM app.cb_csv(art) OR art->>'sandboxLabel' IS DISTINCT FROM 'Practice sandbox — synthetic data; nothing is sent or charged' THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 IF art->>'version'<>'billing-export.v1' OR art->>'clientContractId'<>p_payload->>'clientContractId'
 OR(SELECT jsonb_agg(v-'exportLineId' ORDER BY v->>'extraId') FROM jsonb_array_elements(art->'lines') v) IS DISTINCT FROM expected THEN RAISE EXCEPTION 'BILLING_STALE' USING ERRCODE='40001'; END IF;
 SELECT sum((v->'approvedNet'->>'pence')::bigint) INTO total FROM jsonb_array_elements(expected) v;
 IF p_json IS DISTINCT FROM app.final_lock_canonical(art) OR octet_length(p_json)>1000000 OR art->'totalNet' IS DISTINCT FROM jsonb_build_object('pence',total,'currency','GBP') THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 INSERT INTO app.billing_export_batch(tenant_id,id,job_id,client_contract_id,command_id,artifact,json_content,csv_content,json_hash,csv_hash,total_net_pence)
 VALUES(t,batch,p_job,(p_payload->>'clientContractId')::uuid,p_command,art,p_json,p_csv,encode(sha256(convert_to(p_json,'UTF8')),'hex'),encode(sha256(convert_to(p_csv,'UTF8')),'hex'),total);
 FOR l IN SELECT value FROM jsonb_array_elements(art->'lines') LOOP
  IF(l->>'exportLineId')::uuid IS DISTINCT FROM app.cb_line_id((p_payload->>'clientContractId')::uuid,(l->>'revisionId')::uuid) THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
  SELECT id INTO req FROM app.extra_approval_request WHERE tenant_id=t AND binding_id=(l->>'approvalBindingId')::uuid ORDER BY request_revision DESC LIMIT 1;
  INSERT INTO app.billing_export_line(tenant_id,id,job_id,client_contract_id,batch_id,extra_id,scope_item_id,revision_id,revision_hash,approval_request_id,approval_binding_id,approved_net_pence,line)
  VALUES(t,(l->>'exportLineId')::uuid,p_job,(p_payload->>'clientContractId')::uuid,batch,(l->>'extraId')::uuid,(l->>'scopeItemId')::uuid,(l->>'revisionId')::uuid,l->>'revisionHash',req,(l->>'approvalBindingId')::uuid,(l->'approvedNet'->>'pence')::bigint,l);
  INSERT INTO app.extra_event(tenant_id,id,job_id,variation_id,kind,command_id,actor_membership_id) VALUES(t,gen_random_uuid(),p_job,(l->>'extraId')::uuid,'exported',p_command,a);
 END LOOP;
 result:=jsonb_build_object('batchId',batch,'lineCount',jsonb_array_length(expected));
 RETURN app.cb_complete(p_session,p_job,p_command,result);
END $$;

CREATE FUNCTION app.cb_ingest(p_session uuid,p_job uuid,p_command uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; replay jsonb; imp uuid:=gen_random_uuid(); f uuid; e jsonb; l jsonb; valid boolean; prior app.billing_fact; h text; contract uuid;
BEGIN
 replay:=app.cb_begin(p_session,p_job,p_command,'ImportBillingStatus',p_payload); IF replay IS NOT NULL THEN RETURN replay; END IF;
 a:=app.cb_authority(p_session,p_job,true);
 SELECT contract_id INTO contract FROM app.work_order WHERE tenant_id=t AND job_id=p_job;
 IF jsonb_array_length(p_payload->'events') NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 INSERT INTO app.billing_status_import(tenant_id,id,job_id,command_id,transport,source_hash,actor_membership_id)
 VALUES(t,imp,p_job,p_command,p_payload->>'transport',p_payload->>'sourceHash',a);
 FOR e IN SELECT value FROM jsonb_array_elements(p_payload->'events') LOOP
  IF e->>'version' IS DISTINCT FROM 'billing-status.v1' OR(e->>'clientContractId')::uuid IS DISTINCT FROM contract THEN RAISE EXCEPTION 'BILLING_NOT_FOUND'; END IF;
  IF e->>'reconciliationId' IS NOT NULL AND EXISTS(SELECT 1 FROM app.billing_fact b WHERE b.tenant_id=t AND b.job_id<>p_job AND b.payload->>'reconciliationId'=e->>'reconciliationId') THEN RAISE EXCEPTION 'BILLING_CONFLICT' USING ERRCODE='23505'; END IF;
  -- Transport bytes are on the import; facts bind their canonical semantic event instead.
  h:=app.final_lock_hash(e);
  SELECT * INTO prior FROM app.billing_fact WHERE tenant_id=t AND source=e->>'source' AND source_event_id=e->>'sourceEventId';
  IF prior.id IS NOT NULL THEN
   IF prior.payload_hash<>h OR prior.job_id<>p_job THEN RAISE EXCEPTION 'BILLING_CONFLICT' USING ERRCODE='23505'; END IF;
   CONTINUE;
  END IF;
  valid:=true;
  IF jsonb_typeof(e->'composition')='object' THEN
   IF jsonb_array_length(e->'composition'->'lines')=0 OR
    (SELECT sum((x->>'netPence')::numeric) FROM jsonb_array_elements(e->'composition'->'lines') x) IS DISTINCT FROM(e->'composition'->'declared'->>'netPence')::numeric OR
    (SELECT sum((x->>'grossPence')::numeric) FROM jsonb_array_elements(e->'composition'->'lines') x) IS DISTINCT FROM(e->'composition'->'declared'->>'grossPence')::numeric THEN valid:=false; END IF;
   FOR l IN SELECT value FROM jsonb_array_elements(e->'composition'->'lines') LOOP
    IF l->>'kind'='extra' THEN
     IF NOT EXISTS(SELECT 1 FROM app.billing_export_line b WHERE(b.tenant_id,b.job_id,b.client_contract_id,b.id)=(t,(l->'match'->>'jobId')::uuid,contract,(l->'match'->>'exportLineId')::uuid)
      AND b.extra_id=(l->'match'->>'extraId')::uuid AND b.scope_item_id=(l->'match'->>'scopeItemId')::uuid AND b.revision_id=(l->'match'->>'revisionId')::uuid
      AND b.revision_hash=l->'match'->>'revisionHash' AND b.approved_net_pence=(l->>'netPence')::bigint) THEN valid:=false; END IF;
    ELSIF l->'match' IS DISTINCT FROM 'null'::jsonb OR l->>'kind' NOT IN('original_order','other') THEN valid:=false;
    END IF;
   END LOOP;
  END IF;
  f:=gen_random_uuid();
  INSERT INTO app.billing_fact(tenant_id,id,job_id,client_contract_id,import_id,source,source_event_id,invoice_number,payload,payload_hash,match_valid)
  VALUES(t,f,p_job,contract,imp,e->>'source',e->>'sourceEventId',e->>'invoiceNumber',e,h,valid);
  IF NOT valid THEN
   INSERT INTO app.billing_quarantine(tenant_id,id,job_id,client_contract_id,fact_id,reason) VALUES(t,gen_random_uuid(),p_job,contract,f,'INVALID_COMPOSITION_OR_MATCH');
  ELSE
   FOR l IN SELECT value FROM jsonb_array_elements(e->'composition'->'lines') WHERE value->>'kind'='extra' LOOP
    INSERT INTO app.billing_line_match(tenant_id,id,job_id,client_contract_id,fact_id,external_invoice_line_id,export_line_id,line_job_id)
    VALUES(t,gen_random_uuid(),p_job,contract,f,l->>'externalInvoiceLineId',(l->'match'->>'exportLineId')::uuid,(l->'match'->>'jobId')::uuid);
   END LOOP;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('importId',imp);
END $$;

-- Internal server derivation persistence, never an HTTP projection input. It validates input-set identity,
-- matches every extra contribution to the stored export, and keeps ordinary lines at zero.
-- SH-1 arithmetic is computed once by the server's pure parent module, not a second SQL allocator.
CREATE FUNCTION app.cb_inputs(p_session uuid,p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; h text; result jsonb;
BEGIN
 PERFORM app.cb_authority(p_session,p_job,true);
 SELECT app.final_lock_hash(jsonb_agg(payload_hash ORDER BY source,source_event_id)) INTO h FROM app.billing_fact WHERE tenant_id=t AND job_id=p_job;
 SELECT coalesce(jsonb_agg(g ORDER BY g->>'source',g->>'invoiceNumber'),'[]'::jsonb) INTO result FROM(
  SELECT jsonb_build_object('source',f.source,'invoiceNumber',f.invoice_number,'inputHash',h,'facts',jsonb_agg(jsonb_build_object('payload',f.payload,'match_valid',f.match_valid,
   'ambiguous',EXISTS(SELECT 1 FROM app.billing_fact x WHERE x.tenant_id=t AND x.job_id=p_job AND x.id<>f.id AND x.payload->>'reconciliationId'=f.payload->>'reconciliationId'
    AND(x.source<>f.source OR x.invoice_number<>f.invoice_number OR(x.payload-'sourceEventId'-'remittanceReference') IS DISTINCT FROM(f.payload-'sourceEventId'-'remittanceReference')))) ORDER BY f.source_event_id)) g
  FROM app.billing_fact f WHERE f.tenant_id=t AND f.job_id=p_job GROUP BY f.source,f.invoice_number
 ) z;
 RETURN result;
END $$;

-- Exact rational validation of SH-1 output, not a second allocator. All operations use
-- integer numeric intermediates; neither division to decimal nor per-line rounding is used.
CREATE FUNCTION app.cb_add(n numeric,d numeric,x numeric,y numeric) RETURNS numeric[]
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE a numeric; b numeric; r numeric;
BEGIN
 IF d<=0 OR y<=0 OR d<>trunc(d) OR y<>trunc(y) OR n<>trunc(n) OR x<>trunc(x) THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 n:=n*y+x*d; d:=d*y; a:=abs(n);b:=d;
 WHILE b<>0 LOOP r:=mod(a,b);a:=b;b:=r; END LOOP;
 RETURN ARRAY[div(n,a),div(d,a)];
END $$;
CREATE FUNCTION app.cb_validate(p_job uuid,p_source text,p_invoice text,p_projection jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; inv jsonb; inv_count int; m jsonb; l jsonb; il jsonb; e jsonb; old jsonb; olde jsonb; adj jsonb;
 weights jsonb; w numeric[]; total numeric[]; sumgross numeric[]; g numeric[]; n numeric[]; q numeric[]; expected numeric[]; summary numeric[];
 signum int; method text; rate_net numeric; rate_gross numeric; share jsonb; original_ref text; k text; line_id text; summary_line jsonb;
BEGIN
 IF jsonb_typeof(p_projection->'allocations') IS DISTINCT FROM 'array' OR jsonb_typeof(p_projection->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 IF jsonb_array_length(p_projection->'lines')=0 AND jsonb_array_length(p_projection->'allocations')=0 THEN
  FOR k IN SELECT unnest(ARRAY['billedNet','creditedNet','paidGross','paidNet','matchedExtraNet']) LOOP
   IF(p_projection->'totals'->k->>'numerator')::numeric IS DISTINCT FROM 0::numeric OR coalesce((p_projection->'totals'->k->>'denominator')::numeric,0)<=0 THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
  END LOOP;
 END IF;
 SELECT count(*) INTO inv_count FROM app.billing_fact WHERE tenant_id=t AND job_id=p_job AND source=p_source AND invoice_number=p_invoice AND match_valid AND payload->>'factType'='invoiced';
 IF inv_count<>1 THEN
  IF jsonb_array_length(p_projection->'allocations')<>0 OR jsonb_array_length(p_projection->'lines')<>0 THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
  RETURN;
 END IF;
 SELECT payload INTO inv FROM app.billing_fact WHERE tenant_id=t AND job_id=p_job AND source=p_source AND invoice_number=p_invoice AND match_valid AND payload->>'factType'='invoiced';
 IF jsonb_typeof(inv->'composition') IS DISTINCT FROM 'object' THEN
  IF jsonb_array_length(p_projection->'allocations')<>0 OR jsonb_array_length(p_projection->'lines')<>0 THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
  RETURN;
 END IF;
 -- A policy hold may deliberately withhold all lines and amounts, never just selected lines.
 IF jsonb_array_length(p_projection->'lines')=0 AND jsonb_array_length(p_projection->'allocations')=0 AND jsonb_array_length(p_projection->'held')>0 THEN RETURN; END IF;
 IF(SELECT count(DISTINCT x->>'lineId') FROM jsonb_array_elements(p_projection->'lines') x)<>jsonb_array_length(p_projection->'lines') THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 IF jsonb_array_length(p_projection->'lines')<>jsonb_array_length(inv->'composition'->'lines') THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 IF(SELECT count(DISTINCT x->>'sourceRef') FROM jsonb_array_elements(p_projection->'allocations') x)<>jsonb_array_length(p_projection->'allocations') THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 FOR m IN SELECT value FROM jsonb_array_elements(p_projection->'allocations') LOOP
  SELECT payload INTO e FROM app.billing_fact f WHERE f.tenant_id=t AND f.job_id=p_job AND f.source=p_source AND f.invoice_number=p_invoice AND f.match_valid
   AND f.payload->>'reconciliationId'=m->>'sourceRef' AND f.payload->>'factType' IN('paid','payment_reversed')
   AND NOT EXISTS(SELECT 1 FROM app.billing_fact x WHERE x.tenant_id=t AND x.job_id=p_job AND x.id<>f.id AND x.payload->>'reconciliationId'=f.payload->>'reconciliationId'
    AND(x.source<>f.source OR x.invoice_number<>f.invoice_number OR(x.payload-'sourceEventId'-'remittanceReference') IS DISTINCT FROM(f.payload-'sourceEventId'-'remittanceReference'))) LIMIT 1;
  IF e IS NULL OR(e->>'effectiveAt')::timestamptz<=(inv->>'effectiveAt')::timestamptz THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
  signum:=CASE WHEN e->>'factType'='paid' THEN 1 ELSE -1 END;
  method:=CASE WHEN jsonb_typeof(e->'explicit')='array' THEN 'explicit' WHEN(e->>'separateInvoice')::boolean THEN 'separate_invoice' ELSE 'pro_rata' END;
  original_ref:=NULL;
  IF signum=-1 THEN
   SELECT payload->>'reconciliationId' INTO original_ref FROM app.billing_fact WHERE tenant_id=t AND job_id=p_job AND source=p_source AND invoice_number=p_invoice AND payload->>'sourceEventId'=e->>'originalEventId' AND payload->>'factType'='paid';
   IF original_ref IS NULL OR m->>'originalSourceRef' IS DISTINCT FROM original_ref THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
  ELSIF m->>'originalSourceRef' IS NOT NULL THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
  weights:='{}';total:=ARRAY[0::numeric,1::numeric];
  FOR il IN SELECT value FROM jsonb_array_elements(inv->'composition'->'lines') LOOP
   line_id:=il->>'externalInvoiceLineId';
   IF signum=1 THEN w:=ARRAY[(il->>'grossPence')::numeric,1::numeric]; ELSE w:=ARRAY[0::numeric,1::numeric]; END IF;
   IF signum=1 THEN
    FOR adj IN SELECT z.value FROM app.billing_fact f CROSS JOIN LATERAL jsonb_array_elements(f.payload->'lineAdjustments') z
     WHERE f.tenant_id=t AND f.job_id=p_job AND f.source=p_source AND f.invoice_number=p_invoice AND f.match_valid AND f.payload->>'factType'='credited'
      AND f.payload->>'originalEventId'=inv->>'sourceEventId' AND(f.payload->>'effectiveAt')::timestamptz<(e->>'effectiveAt')::timestamptz AND z.value->>'externalInvoiceLineId'=line_id LOOP
     w:=app.cb_add(w[1],w[2],-(adj->>'grossPence')::numeric,1);
    END LOOP;
   END IF;
   FOR old IN SELECT value FROM jsonb_array_elements(p_projection->'allocations') LOOP
    SELECT payload INTO olde FROM app.billing_fact WHERE tenant_id=t AND job_id=p_job AND source=p_source AND invoice_number=p_invoice AND payload->>'reconciliationId'=old->>'sourceRef' LIMIT 1;
    IF olde IS NULL OR(old->>'sourceRef'<>m->>'sourceRef' AND(olde->>'effectiveAt')::timestamptz=(e->>'effectiveAt')::timestamptz) THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
    IF(olde->>'effectiveAt')::timestamptz>=(e->>'effectiveAt')::timestamptz THEN CONTINUE; END IF;
    IF signum=-1 AND old->>'sourceRef' IS DISTINCT FROM original_ref AND old->>'originalSourceRef' IS DISTINCT FROM original_ref THEN CONTINUE; END IF;
    FOR l IN SELECT value FROM jsonb_array_elements(old->'lines') WHERE value->>'lineId'=line_id LOOP
     w:=app.cb_add(w[1],w[2],(CASE WHEN signum=1 THEN -1 ELSE 1 END)*(l->'gross'->>'numerator')::numeric,(l->'gross'->>'denominator')::numeric);
    END LOOP;
   END LOOP;
   IF w[1]<0 THEN w:=ARRAY[0::numeric,1::numeric]; END IF;
   IF(il->>'existedAt')::timestamptz>(e->>'effectiveAt')::timestamptz THEN w:=ARRAY[0::numeric,1::numeric]; END IF;
   weights:=weights||jsonb_build_object(line_id,jsonb_build_array(w[1]::text,w[2]::text));total:=app.cb_add(total[1],total[2],w[1],w[2]);
  END LOOP;
  IF(total[1]<=0 AND(e->'amount'->>'grossPence')::numeric<>0) OR(e->'amount'->>'grossPence')::numeric*total[2]>total[1] THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
  sumgross:=ARRAY[0::numeric,1::numeric];
  IF(SELECT count(DISTINCT x->>'lineId') FROM jsonb_array_elements(m->'lines') x)<>jsonb_array_length(m->'lines') THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
  FOR l IN SELECT value FROM jsonb_array_elements(m->'lines') LOOP
   line_id:=l->>'lineId';
   SELECT value INTO il FROM jsonb_array_elements(inv->'composition'->'lines') WHERE value->>'externalInvoiceLineId'=line_id;
   IF il IS NULL OR l->>'rule' IS DISTINCT FROM method OR l->>'sourceRef' IS DISTINCT FROM m->>'sourceRef' THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
   g:=ARRAY[(l->'gross'->>'numerator')::numeric,(l->'gross'->>'denominator')::numeric];
   n:=ARRAY[(l->'net'->>'numerator')::numeric,(l->'net'->>'denominator')::numeric];
   q:=ARRAY[(l->'matchedExtraNet'->>'numerator')::numeric,(l->'matchedExtraNet'->>'denominator')::numeric];
   w:=ARRAY[(weights->line_id->>0)::numeric,(weights->line_id->>1)::numeric];
   IF g[2]<=0 OR n[2]<=0 OR q[2]<=0 OR signum*g[1]<0 OR signum*g[1]*w[2]>w[1]*g[2] OR w[1]<=0 THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
   IF n[1]*g[2]*(il->>'grossPence')::numeric<>g[1]*n[2]*(il->>'netPence')::numeric THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
   IF il->>'kind'='extra' THEN
    IF q[1]*n[2]<>n[1]*q[2] THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
   ELSIF q[1]<>0 THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
   IF method='explicit' THEN
    SELECT value INTO share FROM jsonb_array_elements(e->'explicit') WHERE value->>'lineId'=line_id;
    IF share IS NULL OR g[1]*(share->'gross'->>'denominator')::numeric<>signum*(share->'gross'->>'numerator')::numeric*g[2] THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
   ELSIF g[1]*w[2]*total[1]<>signum*(e->'amount'->>'grossPence')::numeric*w[1]*total[2]*g[2] THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
   sumgross:=app.cb_add(sumgross[1],sumgross[2],g[1],g[2]);
  END LOOP;
  IF sumgross[1]<>signum*(e->'amount'->>'grossPence')::numeric*sumgross[2] THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 END LOOP;
 -- Invoice and credit summaries also bind the complete immutable source composition.
 FOR k IN SELECT unnest(ARRAY['billedNet','creditedNet']) LOOP
  total:=ARRAY[0::numeric,1::numeric];
  FOR summary_line IN SELECT value FROM jsonb_array_elements(p_projection->'lines') LOOP
   SELECT value INTO il FROM jsonb_array_elements(inv->'composition'->'lines') WHERE value->>'externalInvoiceLineId'=summary_line->>'lineId';
   IF il IS NULL THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
   IF k='billedNet' THEN summary:=ARRAY[(il->>'netPence')::numeric,1::numeric]; ELSE
    SELECT coalesce(sum((z.value->>'netPence')::numeric),0),1::numeric INTO rate_net,rate_gross FROM app.billing_fact f CROSS JOIN LATERAL jsonb_array_elements(f.payload->'lineAdjustments') z
    WHERE f.tenant_id=t AND f.job_id=p_job AND f.source=p_source AND f.invoice_number=p_invoice AND f.match_valid AND f.payload->>'factType'='credited'
     AND f.payload->>'originalEventId'=inv->>'sourceEventId' AND z.value->>'externalInvoiceLineId'=summary_line->>'lineId';
    summary:=ARRAY[rate_net,rate_gross];
   END IF;
   share:=summary_line->k;
   IF coalesce((share->>'denominator')::numeric,0)<=0 OR summary[1]*(share->>'denominator')::numeric IS DISTINCT FROM(share->>'numerator')::numeric*summary[2] THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
   total:=app.cb_add(total[1],total[2],summary[1],summary[2]);
  END LOOP;
  share:=p_projection->'totals'->k;
  IF coalesce((share->>'denominator')::numeric,0)<=0 OR total[1]*(share->>'denominator')::numeric IS DISTINCT FROM(share->>'numerator')::numeric*total[2] THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 END LOOP;
 -- Projection drill-down and totals must exactly equal the stored movement fractions.
 FOR k IN SELECT unnest(ARRAY['paidGross','paidNet','matchedExtraNet']) LOOP
  total:=ARRAY[0::numeric,1::numeric];
  FOR summary_line IN SELECT value FROM jsonb_array_elements(p_projection->'lines') LOOP
   SELECT value INTO il FROM jsonb_array_elements(inv->'composition'->'lines') WHERE value->>'externalInvoiceLineId'=summary_line->>'lineId';
   IF il IS NULL OR(summary_line->'billedNet'->>'numerator')::numeric IS DISTINCT FROM(il->>'netPence')::numeric*(summary_line->'billedNet'->>'denominator')::numeric THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
   summary:=ARRAY[0::numeric,1::numeric];
   FOR m IN SELECT value FROM jsonb_array_elements(p_projection->'allocations') LOOP
    FOR l IN SELECT value FROM jsonb_array_elements(m->'lines') WHERE value->>'lineId'=summary_line->>'lineId' LOOP
     share:=l->(CASE k WHEN 'paidGross' THEN 'gross' WHEN 'paidNet' THEN 'net' ELSE 'matchedExtraNet' END);
     summary:=app.cb_add(summary[1],summary[2],(share->>'numerator')::numeric,(share->>'denominator')::numeric);
    END LOOP;
   END LOOP;
   share:=summary_line->k;
   IF summary[1]*(share->>'denominator')::numeric IS DISTINCT FROM(share->>'numerator')::numeric*summary[2] THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
   total:=app.cb_add(total[1],total[2],summary[1],summary[2]);
  END LOOP;
  share:=p_projection->'totals'->k;
  IF total[1]*(share->>'denominator')::numeric IS DISTINCT FROM(share->>'numerator')::numeric*total[2] THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 END LOOP;
END $$;

CREATE FUNCTION app.cb_derive(p_session uuid,p_job uuid,p_command uuid,p_source text,p_invoice text,p_hash text,p_projection jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; run uuid; prev uuid; h text; contract uuid; movement jsonb; l jsonb; exported uuid; line_job uuid; f record;
BEGIN
 a:=app.cb_authority(p_session,p_job,true);
 IF NOT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command AND actor_membership_id=a AND semantic_key='contractor-billing:'||p_job::text||':'||p_command::text AND command_type='ImportBillingStatus' AND status='processing') THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 SELECT app.final_lock_hash(jsonb_agg(payload_hash ORDER BY source,source_event_id)),min(client_contract_id::text)::uuid INTO h,contract
 FROM app.billing_fact WHERE tenant_id=t AND job_id=p_job;
 IF h IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'BILLING_STALE'; END IF;
 PERFORM app.cb_validate(p_job,p_source,p_invoice,p_projection);
 SELECT id INTO run FROM app.billing_allocation_run WHERE tenant_id=t AND job_id=p_job AND source=p_source AND invoice_number=p_invoice AND input_hash=h;
 IF run IS NOT NULL THEN RETURN run; END IF;
 SELECT id INTO prev FROM app.billing_allocation_run r WHERE r.tenant_id=t AND r.job_id=p_job AND r.source=p_source AND r.invoice_number=p_invoice
 AND NOT EXISTS(SELECT 1 FROM app.billing_allocation_run n WHERE n.tenant_id=t AND n.predecessor_id=r.id);
 run:=gen_random_uuid();
 INSERT INTO app.billing_allocation_run(tenant_id,id,job_id,client_contract_id,source,invoice_number,input_hash,projection,predecessor_id,command_id)
 VALUES(t,run,p_job,contract,p_source,p_invoice,h,p_projection,prev,p_command);
 FOR movement IN SELECT value FROM jsonb_array_elements(p_projection->'allocations') LOOP
  FOR l IN SELECT value FROM jsonb_array_elements(movement->'lines') LOOP
   SELECT m.export_line_id,m.line_job_id INTO exported,line_job FROM app.billing_line_match m JOIN app.billing_fact bf ON(bf.tenant_id,bf.id)=(m.tenant_id,m.fact_id)
   WHERE bf.tenant_id=t AND bf.job_id=p_job AND bf.source=p_source AND bf.invoice_number=p_invoice AND bf.match_valid
   AND bf.payload->>'factType'='invoiced' AND m.external_invoice_line_id=l->>'lineId' LIMIT 1;
   IF exported IS NULL AND(l->'matchedExtraNet'->>'numerator')::numeric<>0 THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
   INSERT INTO app.contractor_receipt_line_allocation(tenant_id,id,job_id,run_id,source_ref,original_source_ref,external_invoice_line_id,export_line_id,line_job_id,rule,gross_numerator,gross_denominator,net_numerator,net_denominator,matched_extra_numerator,matched_extra_denominator)
   VALUES(t,gen_random_uuid(),p_job,run,movement->>'sourceRef',movement->>'originalSourceRef',l->>'lineId',exported,coalesce(line_job,p_job),l->>'rule',(l->'gross'->>'numerator')::numeric,(l->'gross'->>'denominator')::numeric,
    (l->'net'->>'numerator')::numeric,(l->'net'->>'denominator')::numeric,(l->'matchedExtraNet'->>'numerator')::numeric,(l->'matchedExtraNet'->>'denominator')::numeric);
  END LOOP;
 END LOOP;
 FOR f IN SELECT b.id,b.source_event_id FROM app.billing_fact b WHERE b.tenant_id=t AND b.job_id=p_job AND b.source=p_source AND b.invoice_number=p_invoice LOOP
  FOR l IN SELECT value FROM jsonb_array_elements(p_projection->'held') WHERE value->>'sourceEventId'=f.source_event_id LOOP
   INSERT INTO app.billing_quarantine(tenant_id,id,job_id,client_contract_id,fact_id,reason) VALUES(t,gen_random_uuid(),p_job,contract,f.id,l->>'reason') ON CONFLICT DO NOTHING;
  END LOOP;
 END LOOP;
 INSERT INTO app.billing_application_event(tenant_id,id,job_id,run_id,command_id) VALUES(t,gen_random_uuid(),p_job,run,p_command);
 RETURN run;
END $$;

CREATE FUNCTION app.cb_delivery(p_session uuid,p_job uuid,p_command uuid,p_payload jsonb) RETURNS jsonb
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

CREATE FUNCTION app.cb_audit(p_actor uuid,p_job uuid,p_type text,p_outbox uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid:=p_actor; seq bigint; prev text; ts timestamptz; ph text; eh text; typ text:=p_type;
 payload jsonb;
BEGIN
 payload:=jsonb_build_object('references',jsonb_build_object('job',p_job::text,'outbox',p_outbox::text,'environment','synthetic_demo'),
 'hashes',jsonb_build_object('outcome',app.final_lock_hash(jsonb_build_object('status',(SELECT status FROM app.action_outbox WHERE tenant_id=t AND id=p_outbox),
 'attempts',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.attempt_number) FROM app.action_attempt x WHERE x.tenant_id=t AND x.action_id=p_outbox)))));
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp()); ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'membership:'||a::text,typ,'job',p_job::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(gen_random_uuid(),t,seq,'audit.v1','membership:'||a::text,typ,'job',p_job::text,ts,payload,ph,prev,eh);
 PERFORM app.advance_audit_head(seq,eh);
END $$;

-- Claims/results are recorded durably in the existing outbox. A claimed attempt without a known
-- result becomes unknown immediately when revisited; only reconciliation can then release it.
CREATE FUNCTION app.cb_delivery_step(p_session uuid,p_job uuid,p_outbox uuid,p_step text,p_result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; o app.action_outbox; auth app.action_authorization; n integer; result text;
BEGIN
 a:=app.cb_authority(p_session,p_job,true);
 SELECT x.* INTO o FROM app.billing_export_delivery d JOIN app.action_outbox x ON(x.tenant_id,x.id)=(d.tenant_id,d.outbox_action_id) WHERE(d.tenant_id,d.job_id,d.outbox_action_id)=(t,p_job,p_outbox) FOR UPDATE OF x;
 SELECT * INTO auth FROM app.action_authorization WHERE tenant_id=t AND id=o.authorization_id;
 IF o.id IS NULL OR auth.actor_membership_id<>a OR auth.revoked_at IS NOT NULL OR auth.expires_at<=clock_timestamp()
 OR NOT EXISTS(SELECT 1 FROM app.decision_resolution r WHERE(r.tenant_id,r.id,r.decision_id)=(t,auth.resolution_id,auth.decision_id) AND r.resolution='approved')
 OR o.action_type<>auth.action_type OR o.recipient IS DISTINCT FROM auth.recipient OR o.content_hash<>auth.content_hash OR o.aggregate_revision<>auth.aggregate_revision
 OR o.amount_pence IS DISTINCT FROM auth.amount_pence OR o.currency IS DISTINCT FROM auth.currency OR o.policy_version<>auth.policy_version OR o.authorization_expires_at>auth.expires_at
 THEN RAISE EXCEPTION 'BILLING_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_step='claim' THEN
  IF o.status='executing' THEN
   -- No second delivery: preserve an uncertain in-flight request for reconciliation.
   RETURN NULL;
  END IF;
  IF o.status NOT IN('pending','retryable') THEN RETURN NULL; END IF;
  IF o.status='retryable' AND o.next_attempt_at>clock_timestamp() THEN RETURN NULL; END IF;
  SELECT coalesce(max(attempt_number),0)+1 INTO n FROM app.action_attempt WHERE tenant_id=t AND action_id=o.id;
  UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE tenant_id=t AND id=o.id;
  INSERT INTO app.action_attempt(tenant_id,id,action_id,attempt_number,outcome) VALUES(t,gen_random_uuid(),o.id,n,'started');
  PERFORM app.cb_audit(a,p_job,'contractor.billing.delivery_claimed',o.id);
  RETURN to_jsonb(o)||jsonb_build_object('attempt',n);
 ELSIF p_step='finish' THEN
  IF o.status<>'executing' THEN RETURN NULL; END IF;
  result:=p_result->>'kind'; IF result NOT IN('succeeded','retryable','outcome_unknown') THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
  UPDATE app.action_attempt SET outcome=result,provider_reference=p_result->>'providerReference',error_code=p_result->>'code',finished_at=clock_timestamp()
  WHERE tenant_id=t AND action_id=o.id AND attempt_number=(p_result->>'attempt')::int AND outcome='started';
  IF NOT FOUND THEN RAISE EXCEPTION 'BILLING_CONFLICT'; END IF;
  UPDATE app.action_outbox SET status=result,updated_at=clock_timestamp(),completed_at=CASE WHEN result='succeeded' THEN clock_timestamp() END,
   next_attempt_at=CASE WHEN result='retryable' THEN clock_timestamp()+interval '1 minute' ELSE next_attempt_at END WHERE tenant_id=t AND id=o.id;
 ELSIF p_step='inspect' THEN
  IF o.status='executing' THEN
   UPDATE app.action_outbox SET status='outcome_unknown',updated_at=clock_timestamp() WHERE tenant_id=t AND id=o.id;
   UPDATE app.action_attempt SET outcome='outcome_unknown',error_code='INTERRUPTED',finished_at=clock_timestamp() WHERE tenant_id=t AND action_id=o.id AND outcome='started';
  ELSIF o.status<>'outcome_unknown' THEN RETURN NULL; END IF;
  PERFORM app.cb_audit(a,p_job,'contractor.billing.delivery_inspected',o.id);
  RETURN to_jsonb(o);
 ELSIF p_step='reconcile' THEN
  IF o.status<>'outcome_unknown' THEN RAISE EXCEPTION 'BILLING_CONFLICT'; END IF;
  result:=p_result->>'outcome'; IF result NOT IN('succeeded','not_found','unknown') THEN RAISE EXCEPTION 'BILLING_INVALID'; END IF;
  IF result='unknown' THEN RETURN NULL; END IF;
  UPDATE app.action_outbox SET status=CASE WHEN result='succeeded' THEN 'succeeded' ELSE 'retryable' END,updated_at=clock_timestamp(),next_attempt_at=clock_timestamp(),completed_at=CASE WHEN result='succeeded' THEN clock_timestamp() END WHERE tenant_id=t AND id=o.id;
  SELECT coalesce(max(attempt_number),0)+1 INTO n FROM app.action_attempt WHERE tenant_id=t AND action_id=o.id;
  INSERT INTO app.action_attempt(tenant_id,id,action_id,attempt_number,outcome,provider_reference,finished_at) VALUES(t,gen_random_uuid(),o.id,n,'reconciled',result,clock_timestamp());
 ELSE RAISE EXCEPTION 'BILLING_INVALID'; END IF;
 PERFORM app.cb_audit(a,p_job,'contractor.billing.delivery_'||p_step,o.id);
 RETURN NULL;
END $$;
DO $$ DECLARE f text; BEGIN FOREACH f IN ARRAY ARRAY[
 'app.cb_line_id(uuid,uuid)','app.cb_csv_cell(text)','app.cb_csv(jsonb)','app.cb_add(numeric,numeric,numeric,numeric)','app.cb_validate(uuid,text,text,jsonb)','app.cb_audit(uuid,uuid,text,uuid)','app.cb_authority(uuid,uuid,boolean)','app.cb_begin(uuid,uuid,uuid,text,jsonb)','app.cb_complete(uuid,uuid,uuid,jsonb)',
 'app.cb_unresolved(uuid,uuid)','app.cb_candidates(uuid,uuid,uuid)','app.cb_export(uuid,uuid,uuid,jsonb,text,text)',
 'app.cb_inputs(uuid,uuid)','app.cb_ingest(uuid,uuid,uuid,jsonb)','app.cb_derive(uuid,uuid,uuid,text,text,text,jsonb)',
 'app.cb_delivery(uuid,uuid,uuid,jsonb)','app.cb_delivery_step(uuid,uuid,uuid,text,jsonb)'] LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO jobguard_migration',f);
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',f);
 IF f NOT IN('app.cb_line_id(uuid,uuid)','app.cb_csv_cell(text)','app.cb_csv(jsonb)','app.cb_unresolved(uuid,uuid)','app.cb_audit(uuid,uuid,text,uuid)','app.cb_add(numeric,numeric,numeric,numeric)','app.cb_validate(uuid,text,text,jsonb)') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO jobguard_runtime',f); END IF;
END LOOP; END $$;
COMMIT;
