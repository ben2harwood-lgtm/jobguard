-- LP-6d RED. Add binding checks before the latest predecessor body.
-- No policy, authorization, role rule or immutable history is relaxed.
-- LP-6c owns money/activation/acceptance/invoice and begin/complete_command;
-- LP-6e owns audit attribution. See the migration note for the exact split.
BEGIN;
-- Existing narrow owners need only access to the protected accessors, never
-- SELECT/INSERT on the binding store or the ability to select another actor.
GRANT EXECUTE ON FUNCTION app.current_actor(),app.current_tenant()
 TO jobguard_migration,jobguard_command_writer;
-- The identity invitation bridge binds its validated credential itself.
GRANT EXECUTE ON FUNCTION app.bind_request(text,text,uuid) TO jobguard_migration;

-- Latest body: packages/db/migrations/0003_job_spine.sql
CREATE OR REPLACE FUNCTION app.transition_scope_progress(p_tenant uuid,p_job uuid,p_scope uuid,p_expected integer,p_to varchar,p_reason varchar)
RETURNS app.scope_progress LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 DECLARE current_progress app.scope_progress; BEGIN
 SELECT * INTO current_progress FROM app.scope_progress WHERE tenant_id=p_tenant AND job_id=p_job AND scope_item_id=p_scope FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'scope progress not found' USING ERRCODE='P0002'; END IF;
 IF current_progress.revision<>p_expected THEN RAISE EXCEPTION 'expected revision conflict' USING ERRCODE='40001'; END IF;
 IF NOT ((current_progress.stage='not_started' AND p_to='in_progress' AND p_reason='start') OR
  (current_progress.stage='in_progress' AND p_to='complete' AND p_reason='complete') OR
  (current_progress.stage='complete' AND p_to='in_progress' AND p_reason='rework'))
 THEN RAISE EXCEPTION 'illegal progress transition' USING ERRCODE='22023'; END IF;
 UPDATE app.scope_progress SET stage=p_to,revision=revision+1,updated_at=transaction_timestamp()
 WHERE tenant_id=p_tenant AND job_id=p_job AND scope_item_id=p_scope RETURNING * INTO current_progress; RETURN current_progress;
END;
END
$$;

-- Latest body: packages/db/migrations/0095_job_parties.sql
CREATE OR REPLACE FUNCTION app.bind_job_parties(p_tenant uuid,p_job uuid,p_id uuid,p_expected integer,p_customer uuid,p_payer uuid,p_site uuid,p_correct boolean,p_reason text,p_actor uuid,p_command uuid)
RETURNS app.job_party_binding LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor()
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE j app.job; c app.customer_revision; p app.customer_revision; s app.site_revision; b app.job_party_binding;
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
 OR NOT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command AND actor_membership_id=p_actor AND command_type='job.parties' AND semantic_key=p_command::text AND status='processing') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF j.revision<>p_expected THEN RAISE EXCEPTION 'REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF j.status IN('live','invoiced','paid') AND (p_correct IS DISTINCT FROM TRUE OR p_reason IS NULL OR NOT app.valid_party_revision_text(to_jsonb(p_reason),1,500)) THEN RAISE EXCEPTION 'CORRECTION_REASON_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM app.customer_revision WHERE tenant_id=p_tenant AND id=p_customer;
 SELECT * INTO p FROM app.customer_revision WHERE tenant_id=p_tenant AND id=coalesce(p_payer,p_customer);
 SELECT * INTO s FROM app.site_revision WHERE tenant_id=p_tenant AND id=p_site;
 IF c.id IS NULL OR p.id IS NULL OR s.id IS NULL THEN RAISE EXCEPTION 'PARTY_NOT_FOUND' USING ERRCODE='23503'; END IF;
 INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance,correction_reason,command_id)
 VALUES(p_tenant,p_id,p_job,p_expected+1,c.customer_id,c.id,p.customer_id,p.id,s.site_id,s.id,'entered',CASE WHEN p_correct IS TRUE THEN p_reason END,p_command) RETURNING * INTO b;
 INSERT INTO app.job_party_current(tenant_id,job_id,binding_id) VALUES(p_tenant,p_job,p_id)
 ON CONFLICT(tenant_id,job_id) DO UPDATE SET binding_id=excluded.binding_id;
 UPDATE app.job SET revision=revision+1,updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_job;
 RETURN b;
END;
END
$$;

-- Latest body: packages/db/migrations/0095_job_parties.sql
CREATE OR REPLACE FUNCTION app.require_current_job_parties(p_tenant uuid,p_job uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE snapshot jsonb; BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT s.snapshot INTO snapshot FROM app.job_party_snapshot s JOIN app.job_party_current x ON(x.tenant_id,x.binding_id)=(s.tenant_id,s.binding_id) WHERE s.tenant_id=p_tenant AND s.job_id=p_job;
 IF snapshot IS NULL THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 RETURN snapshot;
END;
END
$$;

-- Latest body: packages/db/migrations/0096_watchdog_live.sql
CREATE OR REPLACE FUNCTION app.require_watchdog_live(p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE tenant uuid; lifecycle text;
BEGIN
  tenant := nullif(current_setting('app.tenant_id', true), '')::uuid;
  IF tenant IS NULL THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
  SELECT status INTO lifecycle FROM app.job WHERE tenant_id=tenant AND id=p_job FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF lifecycle <> 'live' THEN RAISE EXCEPTION 'JOB_NOT_LIVE' USING ERRCODE='P0001'; END IF;
END;
END
$$;

-- Latest body: packages/db/migrations/0102_contractor_parties.sql
CREATE OR REPLACE FUNCTION app.link_contractor_customer(actor uuid,client uuid,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.customer_revision; client_kind text; prior app.command_receipt; h text; result jsonb; row_id uuid:=gen_random_uuid();
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF t IS NULL OR client IS NULL OR NOT coalesce(app.contractor_allowed(actor,'organisation.manage',client),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR payload-ARRAY['version','environment','commandId','customerRevisionId']<>'{}'::jsonb
 OR payload->>'version' IS DISTINCT FROM 'contractor-customer-link.v1' OR NOT payload ?& ARRAY['commandId','customerRevisionId']
 OR payload->>'commandId' IS NULL OR payload->>'customerRevisionId' IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 h:=encode(sha256(convert_to(jsonb_build_object('clientId',client,'command',payload)::text,'UTF8')),'hex');
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=(payload->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.command_type<>'contractor_parties.link' OR prior.status<>'succeeded' OR prior.request_hash<>h OR prior.actor_membership_id<>actor
  OR NOT EXISTS(SELECT 1 FROM app.contractor_client_customer b WHERE b.tenant_id=t AND b.client_id=client AND b.command_id=prior.command_id AND b.id::text=prior.result->>'id') THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result;
 END IF;
 -- The parameter is qualified with the function name because customer_revision also has a payload column.
 SELECT r.* INTO c FROM app.customer_revision r WHERE r.tenant_id=t AND r.id=(link_contractor_customer.payload->>'customerRevisionId')::uuid;
 IF c.id IS NULL THEN RAISE EXCEPTION 'PARTY_NOT_FOUND' USING ERRCODE='23503'; END IF;
 -- Integrator decision (CH-3b round 2): a link is made against the customer's LATEST revision only; an older revision fails closed.
 IF c.revision<>(SELECT max(r.revision) FROM app.customer_revision r WHERE r.tenant_id=t AND r.customer_id=c.customer_id) THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 SELECT o.client_type INTO client_kind FROM app.client_organisation o WHERE o.tenant_id=t AND o.id=client;
 IF c.payload->>'type' IS DISTINCT FROM client_kind THEN RAISE EXCEPTION 'CUSTOMER_TYPE_MISMATCH' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM app.contractor_client_customer WHERE tenant_id=t AND client_id=client) THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 result:=jsonb_build_object('version','contractor-party-result.v1','environment','synthetic_demo','commandId',payload->>'commandId','id',row_id,'realExternalActions',0);
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES((payload->>'commandId')::uuid,t,'contractor_parties.link',(payload->>'commandId'),h,'succeeded',result,actor,clock_timestamp());
 INSERT INTO app.contractor_client_customer(tenant_id,id,client_id,customer_id,customer_revision_id,command_id,actor_membership_id)
 VALUES(t,row_id,client,c.customer_id,c.id,(payload->>'commandId')::uuid,actor);
 RETURN result;
END;
END
$$;

-- Latest body: packages/db/migrations/0102_contractor_parties.sql
CREATE OR REPLACE FUNCTION app.bind_contractor_parties(actor uuid,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; j app.job; link app.contractor_client_customer; c app.customer_revision; p app.customer_revision; s app.site_revision;
 cv uuid; prior app.command_receipt; h text; result jsonb; row_id uuid:=gen_random_uuid(); party_id uuid:=gen_random_uuid(); expected integer; client_kind text; res jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF t IS NULL OR NOT coalesce(app.contractor_member_active(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 -- Order: active membership, then completeness, then role authority. Completeness is judged before authority because a missing client
 -- leaves no client scope to check; the refusal reveals only the shape of the caller's own payload.
 -- "Missing" means absent or JSON null: client, contract, site, or a resident that is neither a complete contact (a name plus a phone or an email)
 -- nor a no-resident reason. Present but malformed values (blank text, bad email, unknown reason) are INVALID_COMMAND instead.
 res:=payload->'resident';
 IF payload->>'clientId' IS NULL OR payload->>'contractId' IS NULL OR payload->>'siteRevisionId' IS NULL OR res IS NULL OR res='null'::jsonb
 OR (jsonb_typeof(res)='object' AND (
  (res->>'kind'='none' AND coalesce(jsonb_typeof(res->'reason'),'null')='null')
  OR (res->>'kind'='contact' AND (coalesce(jsonb_typeof(res->'contact'),'null')='null'
   OR (jsonb_typeof(res->'contact')='object' AND (coalesce(jsonb_typeof(res->'contact'->'name'),'null')='null'
    OR (coalesce(jsonb_typeof(res->'contact'->'phone'),'null')='null' AND coalesce(jsonb_typeof(res->'contact'->'email'),'null')='null'))))))
 ) THEN RAISE EXCEPTION 'CONTRACTOR_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 IF NOT (coalesce(app.contractor_allowed(actor,'organisation.manage',(payload->>'clientId')::uuid),false) OR coalesce(app.contractor_allowed(actor,'data.import',t),false)) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF payload-ARRAY['version','environment','commandId','jobId','workOrderId','expectedJobRevision','clientId','contractId','siteRevisionId','payingPartyRevisionId','resident']<>'{}'::jsonb
 OR payload->>'version' IS DISTINCT FROM 'contractor-party-import.v1' OR NOT payload ?& ARRAY['commandId','jobId','workOrderId','expectedJobRevision']
 OR payload->>'commandId' IS NULL OR payload->>'jobId' IS NULL OR payload->>'workOrderId' IS NULL
 OR jsonb_typeof(payload->'expectedJobRevision') IS DISTINCT FROM 'number' OR payload->>'expectedJobRevision' !~ '^(0|[1-9][0-9]*)$'
 OR NOT app.valid_contractor_resident(payload->'resident') THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 expected:=(payload->>'expectedJobRevision')::integer;
 SELECT * INTO j FROM app.job WHERE tenant_id=t AND id=(payload->>'jobId')::uuid FOR UPDATE;
 IF j.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 h:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=(payload->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.command_type<>'contractor_parties.bind' OR prior.status<>'succeeded' OR prior.request_hash<>h OR prior.actor_membership_id<>actor
  OR NOT EXISTS(SELECT 1 FROM app.contractor_party_binding b WHERE b.tenant_id=t AND b.job_id=j.id AND b.work_order_id=(payload->>'workOrderId')::uuid AND b.command_id=prior.command_id AND b.id::text=prior.result->>'id') THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result;
 END IF;
 IF j.revision<>expected OR j.status NOT IN('draft','quoting') OR EXISTS(SELECT 1 FROM app.contractor_party_binding WHERE tenant_id=t AND (job_id=j.id OR work_order_id=(payload->>'workOrderId')::uuid)) THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 SELECT * INTO link FROM app.contractor_client_customer WHERE tenant_id=t AND client_id=(payload->>'clientId')::uuid;
 IF link.id IS NULL THEN RAISE EXCEPTION 'CONTRACTOR_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 -- Integrator decision (CH-3b round 2): every import uses the customer's LATEST revision, never the revision seen at link time,
 -- and re-checks its type against the client kind. A customer revised to another type fails closed; the old revision is never pinned.
 SELECT r.* INTO c FROM app.customer_revision r WHERE r.tenant_id=t AND r.customer_id=link.customer_id ORDER BY r.revision DESC LIMIT 1;
 IF c.id IS NULL THEN RAISE EXCEPTION 'PARTY_NOT_FOUND' USING ERRCODE='23503'; END IF;
 SELECT o.client_type INTO client_kind FROM app.client_organisation o WHERE o.tenant_id=t AND o.id=link.client_id;
 IF c.payload->>'type' IS DISTINCT FROM client_kind THEN RAISE EXCEPTION 'CUSTOMER_TYPE_MISMATCH' USING ERRCODE='22023'; END IF;
 -- The parameter is qualified with the function name because customer_revision and site_revision also have a payload column.
 SELECT r.* INTO p FROM app.customer_revision r WHERE r.tenant_id=t AND r.id=coalesce((bind_contractor_parties.payload->>'payingPartyRevisionId')::uuid,c.id);
 SELECT r.* INTO s FROM app.site_revision r WHERE r.tenant_id=t AND r.id=(bind_contractor_parties.payload->>'siteRevisionId')::uuid;
 IF p.id IS NULL OR s.id IS NULL THEN RAISE EXCEPTION 'PARTY_NOT_FOUND' USING ERRCODE='23503'; END IF;
 -- Select by contract identity, then let the composite FK prove client+tenant binding independently.
 SELECT id INTO cv FROM app.client_contract_version WHERE tenant_id=t AND contract_id=(payload->>'contractId')::uuid ORDER BY revision DESC LIMIT 1;
 result:=jsonb_build_object('version','contractor-party-result.v1','environment','synthetic_demo','commandId',payload->>'commandId','id',row_id,'realExternalActions',0);
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES((payload->>'commandId')::uuid,t,'contractor_parties.bind',payload->>'commandId',h,'succeeded',result,actor,clock_timestamp());
 -- CH-3a's immutable binding is recorded by the new contractor binding/receipt audit guard below; its older job.parties command guard is not changed.
 INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance)
 VALUES(t,party_id,j.id,expected+1,c.customer_id,c.id,p.customer_id,p.id,s.site_id,s.id,'work_order_import');
 INSERT INTO app.contractor_party_binding(tenant_id,id,job_id,work_order_id,client_id,contract_id,contract_version_id,customer_id,party_binding_id,command_id,actor_membership_id)
 VALUES(t,row_id,j.id,(payload->>'workOrderId')::uuid,(payload->>'clientId')::uuid,(payload->>'contractId')::uuid,coalesce(cv,(payload->>'contractId')::uuid),c.customer_id,party_id,(payload->>'commandId')::uuid,actor);
 INSERT INTO app.contractor_resident_contact(tenant_id,id,job_id,binding_id,contact,no_resident_reason)
 VALUES(t,gen_random_uuid(),j.id,row_id,payload->'resident'->'contact',payload->'resident'->>'reason');
 INSERT INTO app.job_party_current(tenant_id,job_id,binding_id) VALUES(t,j.id,party_id) ON CONFLICT(tenant_id,job_id) DO UPDATE SET binding_id=excluded.binding_id;
 UPDATE app.job SET revision=revision+1,updated_at=transaction_timestamp() WHERE tenant_id=t AND id=j.id;
 RETURN result;
END;
END
$$;

-- Latest body: packages/db/migrations/0110_work_orders.sql
CREATE OR REPLACE FUNCTION app.read_contractor_resident(actor uuid,p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; result jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 IF t IS NULL OR NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=p_job)
 OR EXISTS(SELECT 1 FROM app.org_unit WHERE tenant_id=t AND id=p_job UNION ALL SELECT 1 FROM app.team WHERE tenant_id=t AND id=p_job UNION ALL SELECT 1 FROM app.client_organisation WHERE tenant_id=t AND id=p_job)
 OR NOT coalesce(app.contractor_job_allowed(actor,'resident.read',p_job),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT jsonb_build_object('version','contractor-resident-read.v1','environment','synthetic_demo','jobId',p_job,'resident',
 CASE WHEN r.contact IS NULL THEN jsonb_build_object('kind','none','reason',r.no_resident_reason) ELSE jsonb_build_object('kind','contact','contact',r.contact) END)
 INTO result FROM app.contractor_resident_contact r WHERE r.tenant_id=t AND r.job_id=p_job;
 IF result IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN result;
END;
END
$$;

-- Latest body: packages/db/migrations/0356_unchecked_job_doors.sql
CREATE OR REPLACE FUNCTION app.work_order_begin(actor uuid, p_job uuid, p_title text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 INSERT INTO app.lp_job_insert_permit(tenant_id,job_id,backend_pid,transaction_id,operation,insert_shape,actor_membership_id)
 VALUES(t,p_job,pg_backend_pid(),pg_current_xact_id(),'work_order',
  app.lp_job_insert_shape(jsonb_populate_record(NULL::app.job,jsonb_build_object('tenant_id',t,'id',p_job,'title',left(p_title,200),
   'status','draft','revision',0,'provenance','work_order'))),actor);
 INSERT INTO app.job(id,tenant_id,title,status,revision,provenance) VALUES(p_job,t,left(p_title,200),'draft',0,'work_order');
 INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES(t,p_job,'contractor','synthetic_demo','work_order_import');
 RETURN 0;
END;
END
$$;

-- Latest body: packages/db/migrations/0110_work_orders.sql
CREATE OR REPLACE FUNCTION app.work_order_commit(actor uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; k text:=payload->>'kind'; wo app.work_order; cur app.work_order_revision; binding app.contractor_party_binding;
 doc jsonb; revision_no integer; revision_id uuid:=(payload->>'revisionId')::uuid; job_row app.job; first_version uuid; second_version uuid; first_date date; second_date date;
 lines jsonb:=coalesce(payload->'lines','[]'::jsonb); status_value text:=payload->>'status'; issued date:=(payload->>'issuedOn')::date; version_id uuid:=nullif(payload->>'sorVersionId','')::uuid;
 total bigint; team_value uuid:=nullif(payload->'team'->>'teamId','')::uuid; member uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF payload->>'version' IS DISTINCT FROM 'work-order-commit.v1' OR k NOT IN('create','revise') OR status_value NOT IN('ordered','cancelled') OR jsonb_typeof(lines)<>'array' OR jsonb_array_length(lines)>1000
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 IF k='create' THEN
  SELECT * INTO binding FROM app.contractor_party_binding WHERE tenant_id=t AND job_id=(payload->>'jobId')::uuid AND work_order_id=(payload->>'workOrderId')::uuid;
  IF binding.id IS NULL THEN RAISE EXCEPTION 'CONTRACTOR_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
  -- Defence in depth: CH-3b already checked the actor against this client when it bound the parties; the order is committed only for a member who may import for it.
  IF NOT coalesce(app.work_order_client_permitted(actor,binding.client_id),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO job_row FROM app.job WHERE tenant_id=t AND id=binding.job_id FOR UPDATE;
  IF job_row.provenance<>'work_order' OR job_row.status<>'draft' THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  IF (payload->>'expectedRevision')::integer<>0 OR status_value<>'ordered' THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  INSERT INTO app.work_order(tenant_id,id,job_id,client_id,contract_id,contract_version_id,reference)
  VALUES(t,binding.work_order_id,binding.job_id,binding.client_id,binding.contract_id,binding.contract_version_id,payload->>'reference') RETURNING * INTO wo;
  revision_no:=1;
 ELSE
  SELECT * INTO wo FROM app.work_order WHERE tenant_id=t AND id=(payload->>'workOrderId')::uuid FOR UPDATE;
  -- An order of a client outside the actor's scope is, to them, an order that does not exist (ENT-1): no revision, cancellation or line/team change.
  IF wo.id IS NULL OR NOT coalesce(app.work_order_client_permitted(actor,wo.client_id),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT r.* INTO cur FROM app.work_order_current c JOIN app.work_order_revision r ON(r.tenant_id,r.work_order_id,r.id)=(c.tenant_id,c.work_order_id,c.revision_id) WHERE c.tenant_id=t AND c.work_order_id=wo.id;
  IF cur.id IS NULL OR cur.revision<>(payload->>'expectedRevision')::integer THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  revision_no:=cur.revision+1;
 END IF;
 SELECT document INTO doc FROM app.client_contract_version WHERE tenant_id=t AND id=wo.contract_version_id;
 -- The pinned contract version's tendered adjustment is the only adjustment a price can use.
 IF doc->'tenderedAdjustment'->>'numerator' IS DISTINCT FROM payload->'adjustment'->>'numerator' OR doc->'tenderedAdjustment'->>'denominator' IS DISTINCT FROM payload->'adjustment'->>'denominator'
 THEN RAISE EXCEPTION 'INVALID_ADJUSTMENT' USING ERRCODE='22023'; END IF;
 IF status_value='ordered' THEN
  IF jsonb_array_length(lines)=0 OR version_id IS NULL THEN RAISE EXCEPTION 'SOR_VERSION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  -- The version in force on the order's issue date: the latest version listed by the pinned contract version that took effect on or before it.
  SELECT v.id,v.effective_from INTO first_version,first_date FROM app.sor_version v WHERE v.tenant_id=t AND v.effective_from<=issued
   AND v.id IN(SELECT jsonb_array_elements_text(doc->'sorVersionIds')::uuid) ORDER BY v.effective_from DESC LIMIT 1;
  SELECT v.id,v.effective_from INTO second_version,second_date FROM app.sor_version v WHERE v.tenant_id=t AND v.effective_from<=issued
   AND v.id IN(SELECT jsonb_array_elements_text(doc->'sorVersionIds')::uuid) ORDER BY v.effective_from DESC OFFSET 1 LIMIT 1;
  IF first_version IS NULL THEN RAISE EXCEPTION 'SOR_VERSION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF second_date=first_date THEN RAISE EXCEPTION 'AMBIGUOUS_SOR_VERSION' USING ERRCODE='22023'; END IF;
  IF first_version IS DISTINCT FROM version_id THEN RAISE EXCEPTION 'SOR_VERSION_NOT_FOUND' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT coalesce(sum((l->>'netPence')::bigint),0) INTO total FROM jsonb_array_elements(lines) l;
 INSERT INTO app.work_order_revision(tenant_id,id,work_order_id,revision,status,issued_on,due_on,priority,content_hash,diff,batch_id,row_number,sor_version_id,adjustment_numerator,adjustment_denominator,net_total_pence)
 VALUES(t,revision_id,wo.id,revision_no,status_value,issued,nullif(payload->>'dueOn','')::date,payload->>'priority',payload->>'contentHash',payload->'diff',(payload->>'batchId')::uuid,(payload->>'rowNumber')::integer,version_id,
  (payload->'adjustment'->>'numerator')::bigint,(payload->'adjustment'->>'denominator')::bigint,total);
 -- A scope identity per line, minted into the existing registry; an unchanged line keeps the identity the caller matched.
 INSERT INTO app.scope_identity(id,tenant_id,job_id,state)
 SELECT (l->>'scopeItemId')::uuid,t,wo.job_id,'confirmed' FROM jsonb_array_elements(lines) l ON CONFLICT(tenant_id,id) DO NOTHING;
 INSERT INTO app.work_order_line(tenant_id,id,work_order_id,revision_id,job_id,position,scope_item_id,client_line_reference,sor_version_id,sor_code,unit,rate_pence,quantity,net_pence,origin)
 SELECT t,(l->>'id')::uuid,wo.id,revision_id,wo.job_id,(l->>'position')::integer,(l->>'scopeItemId')::uuid,nullif(l->>'clientLineReference',''),(l->>'sorVersionId')::uuid,l->>'sorCode',l->>'unit',(l->>'ratePence')::bigint,l->>'quantity',(l->>'netPence')::bigint,l->>'origin'
 FROM jsonb_array_elements(lines) l;
 IF team_value IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM app.team WHERE tenant_id=t AND id=team_value) THEN RAISE EXCEPTION 'ASSIGNMENT_INVALID' USING ERRCODE='22023'; END IF;
  INSERT INTO app.job_assignment(tenant_id,id,job_id,work_order_id,revision_id,team_id,membership_id) VALUES(t,gen_random_uuid(),wo.job_id,wo.id,revision_id,team_value,NULL);
  FOR member IN SELECT value::uuid FROM jsonb_array_elements_text(coalesce(payload->'team'->'membershipIds','[]'::jsonb)) LOOP
   IF NOT coalesce(app.contractor_member_active(member),false) OR NOT EXISTS(SELECT 1 FROM app.team_membership tm WHERE tm.tenant_id=t AND tm.membership_id=member AND tm.team_id=team_value AND tm.active
     AND tm.revision=(SELECT max(x.revision) FROM app.team_membership x WHERE(x.tenant_id,x.membership_id,x.team_id)=(tm.tenant_id,tm.membership_id,tm.team_id)))
   THEN RAISE EXCEPTION 'ASSIGNMENT_INVALID' USING ERRCODE='22023'; END IF;
   INSERT INTO app.job_assignment(tenant_id,id,job_id,work_order_id,revision_id,team_id,membership_id) VALUES(t,gen_random_uuid(),wo.job_id,wo.id,revision_id,team_value,member);
  END LOOP;
 ELSIF jsonb_array_length(coalesce(payload->'team'->'membershipIds','[]'::jsonb))>0 THEN RAISE EXCEPTION 'ASSIGNMENT_INVALID' USING ERRCODE='22023';
 END IF;
 INSERT INTO app.work_order_current(tenant_id,work_order_id,revision_id) VALUES(t,wo.id,revision_id)
 ON CONFLICT(tenant_id,work_order_id) DO UPDATE SET revision_id=excluded.revision_id;
 IF k='create' THEN
  -- Live from import (CH-2): the job already has the CH-3b binding, so the existing JOB_PARTIES_REQUIRED guard on entering live is satisfied by it.
  UPDATE app.job SET status='live',revision=revision+1,updated_at=transaction_timestamp() WHERE tenant_id=t AND id=wo.job_id AND provenance='work_order' AND status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN jsonb_build_object('workOrderId',wo.id,'jobId',wo.job_id,'revisionId',revision_id,'revision',revision_no);
END;
END
$$;

-- Latest body: packages/db/migrations/0110_work_orders.sql
CREATE OR REPLACE FUNCTION app.import_batch_record(actor uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; rows jsonb:=coalesce(payload->'rows','[]'::jsonb); batch uuid:=(payload->>'batchId')::uuid; n integer;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF payload->>'version' IS DISTINCT FROM 'import-batch-record.v1' OR jsonb_typeof(rows)<>'array' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 n:=jsonb_array_length(rows);
 INSERT INTO app.import_batch(tenant_id,id,command_id,source_sha256,source_name,source_kind,row_count,created_count,revised_count,unchanged_count,rejected_count,actor_membership_id)
 SELECT t,batch,(payload->>'commandId')::uuid,payload->>'sourceSha256',payload->>'sourceName',payload->>'sourceKind',n,
  count(*) FILTER(WHERE r->>'outcome'='created'),count(*) FILTER(WHERE r->>'outcome'='revised'),count(*) FILTER(WHERE r->>'outcome'='unchanged'),count(*) FILTER(WHERE r->>'outcome'='rejected'),actor
 FROM jsonb_array_elements(rows) r;
 INSERT INTO app.import_row_receipt(tenant_id,batch_id,row_number,outcome,error_code,work_order_reference,work_order_id,revision_id)
 SELECT t,batch,(r->>'rowNumber')::integer,r->>'outcome',nullif(r->>'errorCode',''),nullif(r->>'reference',''),nullif(r->>'workOrderId','')::uuid,nullif(r->>'revisionId','')::uuid FROM jsonb_array_elements(rows) r;
 -- A created or revised receipt must point at a revision this very batch wrote.
 IF EXISTS(SELECT 1 FROM app.import_row_receipt x JOIN app.work_order_revision v ON(v.tenant_id,v.id)=(x.tenant_id,x.revision_id)
   WHERE x.tenant_id=t AND x.batch_id=batch AND x.outcome IN('created','revised') AND (v.batch_id<>batch OR v.row_number<>x.row_number))
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('batchId',batch,'rowCount',n);
END;
END
$$;

-- Latest body: packages/db/migrations/0110_work_orders.sql
CREATE OR REPLACE FUNCTION app.import_sor_version(actor uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; items jsonb:=coalesce(payload->'items','[]'::jsonb); prior app.sor_version; version uuid:=(payload->>'versionId')::uuid; schedule uuid:=(payload->>'scheduleId')::uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF t IS NULL OR NOT coalesce(app.sor_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF payload->>'version' IS DISTINCT FROM 'sor-version-record.v1' OR jsonb_typeof(items)<>'array' OR jsonb_array_length(items) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 SELECT * INTO prior FROM app.sor_version WHERE tenant_id=t AND command_id=(payload->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.request_hash<>payload->>'requestHash' OR prior.actor_membership_id<>actor THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('versionId',prior.id,'scheduleId',prior.schedule_id,'itemCount',prior.item_count,'effectiveFrom',prior.effective_from,'replayed',true);
 END IF;
 INSERT INTO app.schedule_of_rates(tenant_id,id,reference,actor_membership_id) VALUES(t,schedule,payload->>'scheduleReference',actor) ON CONFLICT(tenant_id,id) DO NOTHING;
 INSERT INTO app.sor_version(tenant_id,id,schedule_id,reference,effective_from,item_count,content_hash,command_id,request_hash,actor_membership_id)
 VALUES(t,version,schedule,payload->>'reference',(payload->>'effectiveFrom')::date,jsonb_array_length(items),payload->>'contentHash',(payload->>'commandId')::uuid,payload->>'requestHash',actor);
 INSERT INTO app.sor_item(tenant_id,version_id,code,description,unit,rate_pence,standard_minutes)
 SELECT t,version,i->>'code',i->>'description',i->>'unit',(i->>'ratePence')::bigint,nullif(i->>'standardMinutes','')::integer FROM jsonb_array_elements(items) i;
 RETURN jsonb_build_object('versionId',version,'scheduleId',schedule,'itemCount',jsonb_array_length(items),'effectiveFrom',(payload->>'effectiveFrom')::date,'replayed',false);
END;
END
$$;

-- Latest body: packages/db/migrations/0110_work_orders.sql
CREATE OR REPLACE FUNCTION app.work_order_parties_unchanged(actor uuid, p_work_order uuid, p_client uuid, p_contract uuid, p_site_revision uuid, p_resident jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; bound_client uuid;
BEGIN
 IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Authority is judged on the order's own bound client BEFORE anything is compared, so the answer is no yes/no oracle on another branch's parties
 -- or resident contact; an order that does not exist and an order outside the actor's scope are the same not-found.
 SELECT client_id INTO bound_client FROM app.work_order WHERE tenant_id=t AND id=p_work_order;
 IF bound_client IS NULL OR NOT coalesce(app.work_order_client_permitted(actor,bound_client),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN EXISTS(SELECT 1 FROM app.contractor_party_binding b
  JOIN app.job_party_binding jb ON(jb.tenant_id,jb.job_id,jb.id)=(b.tenant_id,b.job_id,b.party_binding_id)
  JOIN app.contractor_resident_contact r ON(r.tenant_id,r.job_id,r.binding_id)=(b.tenant_id,b.job_id,b.id)
  WHERE b.tenant_id=t AND b.work_order_id=p_work_order AND b.client_id=p_client AND b.contract_id=p_contract AND jb.site_revision_id=p_site_revision
  AND ((r.contact IS NOT NULL AND p_resident->>'kind'='contact' AND r.contact=p_resident->'contact')
    OR (r.contact IS NULL AND p_resident->>'kind'='none' AND r.no_resident_reason=p_resident->>'reason')));
END;
END
$$;

-- Latest body: packages/db/migrations/0201_job_work_state_commands.sql
CREATE OR REPLACE FUNCTION app.reveal_shadow_signals(p_tenant uuid,p_job uuid) RETURNS SETOF app.shadow_commercial_signal
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE locked boolean:=false;
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 -- Same job lock order as disclosure; SV-4 must serialize its lock insertion here too.
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM app.ch4_require_open(p_tenant,p_job);
 IF to_regclass('app.final_account_lock') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2)' INTO locked USING p_tenant,p_job;
 END IF;
 -- Constant audit shape regardless of number/existence of hidden signals.
 PERFORM app.append_shadow_audit(gen_random_uuid(),p_job,'shadow.reveal_requested');
 IF NOT locked THEN RETURN; END IF;
 RETURN QUERY SELECT * FROM app.shadow_commercial_signal WHERE tenant_id=p_tenant AND job_id=p_job AND state='revealed';
END;
END
$$;



-- Latest body: packages/db/migrations/0132_final_account_lock.sql
CREATE OR REPLACE FUNCTION app.read_final_account_lock_verification(p_tenant uuid,p_job uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE l app.final_account_lock; sources jsonb; captures jsonb; r app.final_account_revision;
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 sources:=app.read_final_account_lock_sources(p_tenant,p_job,l.final_account_revision_id);
 SELECT coalesce(jsonb_agg(c.value ORDER BY c.value->>'id'),'[]') INTO captures FROM jsonb_array_elements(sources->'captureRegister') c
 WHERE c.value->>'id' IN(SELECT value->>'id' FROM jsonb_array_elements(l.snapshot->'captureRegister'));
 SELECT * INTO r FROM app.final_account_revision WHERE tenant_id=p_tenant AND job_id=p_job AND id=l.final_account_revision_id;
 RETURN jsonb_build_object('snapshot',l.snapshot||sources||jsonb_build_object('captureRegister',captures,'baselineQuoteVersionId',r.baseline_quote_version_id),
  'hashes',jsonb_build_object('digest',l.snapshot_digest,'captureRegisterHash',l.capture_register_hash,'lineSetHash',l.line_set_hash,'scopeDispositionHash',l.scope_disposition_hash));
END;
END
$$;

-- Latest body: packages/db/migrations/0132_final_account_lock.sql
CREATE OR REPLACE FUNCTION app.prepare_final_review_extra(p_tenant uuid,p_job uuid,p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor()
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

BEGIN
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 PERFORM 1 FROM app.job j JOIN app.job_commercial_track t ON(t.tenant_id,t.job_id)=(j.tenant_id,j.id)
 WHERE j.tenant_id=p_tenant AND j.id=p_job AND j.status='live' AND t.job_track='small_builder' AND t.environment='synthetic_demo' FOR UPDATE OF j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job) THEN RAISE EXCEPTION 'FINAL_REVIEW_CLOSED'; END IF;
END;
END
$$;

-- Latest body: packages/db/migrations/0132_final_account_lock.sql
CREATE OR REPLACE FUNCTION app.accept_final_check_terms(p_tenant uuid,p_actor uuid,p_command uuid,p_version text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor()
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE request_digest text; prior app.command_receipt; event_id uuid:=gen_random_uuid(); row_id uuid:=gen_random_uuid(); result jsonb;
BEGIN
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 IF p_command IS NULL OR p_version IS DISTINCT FROM 'synthetic_final_check_terms.v1' THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 -- Tenant acceptance serializes independently, before the audit head; it never reads a signal.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':final-check-terms',130));
 request_digest:=app.final_lock_hash(jsonb_build_object('command','AcceptFinalCheckTerms','actor',p_actor,'version',p_version));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN IF prior.command_type<>'AcceptFinalCheckTerms' OR prior.request_hash<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF; RETURN prior.result; END IF;
 result:=jsonb_build_object('acceptanceId',row_id,'termsVersion',p_version);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_tenant,p_command,'AcceptFinalCheckTerms',p_command::text,request_digest,'succeeded',result,p_actor,clock_timestamp());
 INSERT INTO app.final_check_terms_acceptance(tenant_id,id,terms_version,accepting_membership_id,accepted_at,command_id,audit_event_id)
 VALUES(p_tenant,row_id,p_version,p_actor,clock_timestamp(),p_command,event_id);
 PERFORM app.append_final_lock_audit(event_id,p_actor,p_tenant,'final_check.terms_accepted',jsonb_build_object('acceptanceId',row_id,'commandId',p_command));
 RETURN result;
END;
END
$$;

-- Latest body: packages/db/migrations/0132_final_account_lock.sql
CREATE OR REPLACE FUNCTION app.record_final_account_disposition(p_tenant uuid,p_job uuid,p_actor uuid,p_command uuid,p_scope uuid,p_disposition text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor()
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE request_digest text; prior app.command_receipt; event_id uuid:=gen_random_uuid(); row_id uuid:=gen_random_uuid(); result jsonb; existing_lock uuid;
BEGIN
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND'; END IF;
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 request_digest:=app.final_lock_hash(jsonb_build_object('command','RecordFinalAccountDisposition','job',p_job,'actor',p_actor,'scope',p_scope,'disposition',p_disposition));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN IF prior.command_type<>'RecordFinalAccountDisposition' OR prior.request_hash<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF; RETURN prior.result; END IF;
 SELECT id INTO existing_lock FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF FOUND THEN RAISE EXCEPTION 'FINAL_REVIEW_CLOSED' USING DETAIL=existing_lock::text; END IF;
 IF p_command IS NULL OR p_disposition IS NULL OR p_disposition NOT IN ('done','removed','deferred') THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_account_line l JOIN app.final_account_draft d ON(d.tenant_id,d.job_id,d.current_revision_id)=(l.tenant_id,l.job_id,l.final_account_revision_id)
  WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.scope_item_id=p_scope AND l.line_kind='baseline') THEN RAISE EXCEPTION 'SCOPE_ITEM_NOT_BASELINE'; END IF;
 result:=jsonb_build_object('dispositionId',row_id,'scopeItemId',p_scope,'disposition',p_disposition);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_tenant,p_command,'RecordFinalAccountDisposition',p_command::text,request_digest,'succeeded',result,p_actor,clock_timestamp());
 INSERT INTO app.final_account_scope_disposition(tenant_id,job_id,id,scope_item_id,disposition,actor_membership_id,recorded_at,command_id,audit_event_id)
 VALUES(p_tenant,p_job,row_id,p_scope,p_disposition,p_actor,clock_timestamp(),p_command,event_id);
 PERFORM app.append_final_lock_audit(event_id,p_actor,p_job,'final_account.disposition_recorded',jsonb_build_object('dispositionId',row_id,'commandId',p_command,'scopeItemId',p_scope));
 RETURN result;
END;
END
$$;

-- Latest body: packages/db/migrations/0496_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.ent3b_start_visit(p_actor uuid, p_command uuid, p_job uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

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
 PERFORM app.lp5_bind_effect(p_command,NULL,'site_visit',jsonb_build_object('visitId',new_visit)); RETURN new_visit;
END;
END
$$;

-- Latest body: packages/db/migrations/0496_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.ent3b_complete_visit(p_actor uuid, p_command uuid, p_job uuid, p_visit uuid, p_answer text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

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
 PERFORM app.lp5_bind_effect(p_command,NULL,'site_visit',jsonb_build_object('visitId',p_visit)); RETURN answer_id;
END;
END
$$;

-- Latest body: packages/db/migrations/0140_site_extra_pricing.sql
CREATE OR REPLACE FUNCTION app.ent3c_record_sor_revision(p_job uuid, p_variation uuid, p_claimed_quantity text, p_request_hash text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR (SELECT raising_membership_id FROM app.extra_origin WHERE tenant_id=app.current_tenant() AND job_id=p_job AND variation_id=p_variation) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE tenant uuid; origin_row app.extra_origin; receipt app.command_receipt; variation_row app.variation; baseline app.work_order_revision; item app.sor_item; line app.work_order_line;
 claimed numeric; instructed numeric; extra_quantity text; cover text; price bigint; new_id uuid; new_hash text;
BEGIN
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Standard F: check the stored raising member's current authority, including the tenant lock, before pricing or writing anything.
 PERFORM app.ent3a_require_extra_authority(p_job,p_variation);
 IF p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 IF p_claimed_quantity IS NULL OR p_claimed_quantity !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE='22023'; END IF;
 claimed:=p_claimed_quantity::numeric;
 IF claimed=0 THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE='22023'; END IF;
 -- The stored origin of this very extra, raised by a contractor site command.
 SELECT o.* INTO origin_row FROM app.extra_origin o WHERE o.tenant_id=tenant AND o.job_id=p_job AND o.variation_id=p_variation;
 IF origin_row.variation_id IS NULL OR origin_row.job_track IS DISTINCT FROM 'contractor' OR origin_row.provenance IS DISTINCT FROM 'command'
  OR origin_row.command_type IS DISTINCT FROM 'LogSiteExtra' OR origin_row.kind IS DISTINCT FROM 'site_user' THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 -- Only inside the raising command's own transaction: its receipt is still processing, for the same actor.
 SELECT r.* INTO receipt FROM app.command_receipt r WHERE r.tenant_id=tenant AND r.command_id=origin_row.command_id;
 IF receipt.command_id IS NULL OR receipt.status IS DISTINCT FROM 'processing' OR receipt.command_type IS DISTINCT FROM 'LogSiteExtra'
  OR receipt.actor_membership_id IS DISTINCT FROM origin_row.raising_membership_id THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 SELECT v.* INTO variation_row FROM app.variation v WHERE v.tenant_id=tenant AND v.job_id=p_job AND v.id=p_variation;
 IF variation_row.id IS NULL OR variation_row.sor_version_id IS NULL OR variation_row.sor_code IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 -- The baseline is the revision the merged origin trigger stored; a revision that moved on in between makes this extra stale, never mixed.
 SELECT r.* INTO baseline FROM app.work_order_revision r WHERE r.tenant_id=tenant AND r.work_order_id=origin_row.work_order_id AND r.id=origin_row.work_order_revision_id;
 IF baseline.id IS NULL OR baseline.status IS DISTINCT FROM 'ordered' OR baseline.sor_version_id IS DISTINCT FROM variation_row.sor_version_id
  OR (variation_row.excess_of_revision_id IS NOT NULL AND variation_row.excess_of_revision_id IS DISTINCT FROM baseline.id) THEN
  RAISE EXCEPTION 'ORDER_CHECK_STALE' USING ERRCODE='40001';
 END IF;
 SELECT i.* INTO item FROM app.sor_item i WHERE i.tenant_id=tenant AND i.version_id=variation_row.sor_version_id AND i.code=variation_row.sor_code;
 IF item.code IS NULL THEN RAISE EXCEPTION 'ORDER_CHECK_STALE' USING ERRCODE='40001'; END IF;
 -- The order check, decided again from the baseline's own lines.
 IF variation_row.excess_of_scope_item_id IS NOT NULL THEN
  SELECT l.* INTO line FROM app.work_order_line l WHERE l.tenant_id=tenant AND l.revision_id=baseline.id AND l.scope_item_id=variation_row.excess_of_scope_item_id;
  IF line.id IS NULL OR line.sor_code IS DISTINCT FROM variation_row.sor_code THEN RAISE EXCEPTION 'ORDER_CHECK_STALE' USING ERRCODE='40001'; END IF;
  instructed:=line.quantity::numeric;
  IF claimed<=instructed THEN RAISE EXCEPTION 'ALREADY_ON_ORDER' USING ERRCODE='23514'; END IF;
  cover:='excess'; extra_quantity:=trim_scale(claimed-instructed)::text;
 ELSE
  IF EXISTS(SELECT 1 FROM app.work_order_line l WHERE l.tenant_id=tenant AND l.revision_id=baseline.id AND l.sor_code=variation_row.sor_code) THEN
   RAISE EXCEPTION 'ORDER_CHECK_STALE' USING ERRCODE='40001';
  END IF;
  cover:='new'; extra_quantity:=trim_scale(claimed)::text;
 END IF;
 -- The one money figure: the merged exact half-even price of the extra quantity alone (its own MONEY_OUT_OF_RANGE passes through unchanged).
 price:=app.sor_line_net_pence(extra_quantity,item.rate_pence,baseline.adjustment_numerator,baseline.adjustment_denominator);
 IF price IS NULL OR price<1 THEN RAISE EXCEPTION 'EXTRA_NOT_POSITIVE' USING ERRCODE='23514'; END IF;
 -- content_hash and server_recorded_at are set by the table's guard; nobody can supply them.
 INSERT INTO app.extra_sor_revision(tenant_id,id,job_id,variation_id,revision,work_order_id,work_order_revision_id,sor_version_id,sor_code,unit,rate_pence,adjustment_numerator,adjustment_denominator,
  coverage,excess_of_scope_item_id,instructed_quantity,claimed_quantity,quantity,net_pence,request_hash,command_id,raising_membership_id)
 VALUES(tenant,pg_catalog.gen_random_uuid(),p_job,p_variation,1,origin_row.work_order_id,origin_row.work_order_revision_id,variation_row.sor_version_id,variation_row.sor_code,item.unit,item.rate_pence,
  baseline.adjustment_numerator,baseline.adjustment_denominator,cover,variation_row.excess_of_scope_item_id,CASE WHEN cover='excess' THEN trim_scale(instructed)::text END,
  trim_scale(claimed)::text,extra_quantity,price,p_request_hash,origin_row.command_id,origin_row.raising_membership_id)
 RETURNING id,content_hash INTO new_id,new_hash;
 INSERT INTO app.extra_pricing_basis(tenant_id,id,job_id,variation_id,revision,pricing_basis,revision_content_hash,command_id,actor_membership_id)
 VALUES(tenant,pg_catalog.gen_random_uuid(),p_job,p_variation,1,'server_sor',new_hash,origin_row.command_id,origin_row.raising_membership_id);
 RETURN new_id;
END;
END
$$;

-- Latest body: packages/db/migrations/0496_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.xa_submit(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE lp5_result jsonb; v_tenant uuid; v_origin app.extra_origin; v_sor app.extra_sor_revision; v_bind app.extra_approval_revision_binding; v_role text; v_ok boolean; v_bid uuid; v_net bigint; v_hash text; v_rev uuid;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['SubmitExtra'],p_actor);
 SELECT x.* INTO v_origin FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_variation);
 IF v_origin.variation_id IS NULL OR v_origin.job_track IS DISTINCT FROM 'contractor' OR v_origin.provenance IS DISTINCT FROM 'command' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT m.role INTO v_role FROM app.membership m WHERE m.tenant_id=v_tenant AND m.id=p_actor;
 SELECT s.* INTO v_sor FROM app.extra_sor_revision s WHERE(s.tenant_id,s.job_id,s.variation_id)=(v_tenant,p_job,p_variation);
 v_ok:=app.xa_covers(p_actor,ARRAY['supervisor','surveyor'],p_job,'job.read') IS NOT NULL
  OR(v_role='operative' AND p_actor=v_origin.raising_membership_id AND v_sor.id IS NOT NULL AND coalesce(app.contractor_job_allowed(p_actor,'extra.log',p_job),false));
 IF NOT v_ok THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF app.xa_latest_kind(v_tenant,p_job,p_variation) IS DISTINCT FROM 'logged' OR EXISTS(SELECT 1 FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=p_variation) THEN
  RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514';
 END IF;
 SELECT b.* INTO v_bind FROM app.extra_approval_revision_binding b WHERE(b.tenant_id,b.job_id,b.variation_id)=(v_tenant,p_job,p_variation) ORDER BY b.logical_revision DESC LIMIT 1;
 IF v_sor.id IS NOT NULL THEN
  IF v_bind.id IS NULL THEN
   v_bid:=pg_catalog.gen_random_uuid();
   INSERT INTO app.extra_approval_revision_binding(tenant_id,id,job_id,variation_id,logical_revision,source_kind,source_revision_id,sor_revision_id,source_hash,command_id,actor_membership_id)
   VALUES(v_tenant,v_bid,p_job,p_variation,1,'server_sor',v_sor.id,v_sor.id,v_sor.content_hash,p_command,p_actor);
  ELSE v_bid:=v_bind.id; END IF;
  v_net:=v_sor.net_pence; v_hash:=v_sor.content_hash::text; v_rev:=NULL;
 ELSIF v_bind.id IS NOT NULL THEN
  v_bid:=v_bind.id; v_hash:=v_bind.source_hash::text; v_rev:=v_bind.variation_revision_id;
  SELECT r.signed_delta_pence INTO v_net FROM app.variation_revision r WHERE(r.tenant_id,r.job_id,r.id)=(v_tenant,p_job,v_rev);
 ELSE v_bid:=NULL; v_net:=NULL; v_hash:=v_origin.origin_hash::text; v_rev:=NULL; END IF;
 lp5_result:=app.xa_open_request(v_tenant,p_job,p_variation,p_command,p_actor,v_bid,v_rev,v_hash,v_net); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END;
END
$$;

-- Latest body: packages/db/migrations/0496_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.xa_price(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid, p_net bigint, p_revise boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE lp5_result jsonb; v_tenant uuid; v_origin app.extra_origin; v_var app.variation; v_prev app.extra_approval_revision_binding; v_req app.extra_approval_request; v_outcome text; v_latest text; v_rev_id uuid:=pg_catalog.gen_random_uuid(); v_rev_no integer; v_prev_rev uuid; v_hash text; v_bid uuid:=pg_catalog.gen_random_uuid(); v_ref text; v_late boolean:=false; v_old_n integer;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY[CASE WHEN p_revise THEN 'ReviseExtra' ELSE 'PriceExtra' END],p_actor);
 SELECT x.* INTO v_origin FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_variation);
 IF v_origin.variation_id IS NULL OR v_origin.job_track IS DISTINCT FROM 'contractor' OR v_origin.provenance IS DISTINCT FROM 'command' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Ben, 13 Oct 2026 (answer 12): surveyors price. Revising a price is pricing.
 IF app.xa_covers(p_actor,ARRAY['surveyor'],p_job,'extra.price') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_net IS NULL OR p_net NOT BETWEEN 1 AND 1000000000000 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 v_latest:=app.xa_latest_kind(v_tenant,p_job,p_variation);
 SELECT b.* INTO v_prev FROM app.extra_approval_revision_binding b WHERE(b.tenant_id,b.job_id,b.variation_id)=(v_tenant,p_job,p_variation) ORDER BY b.logical_revision DESC LIMIT 1;
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=p_variation ORDER BY q.request_revision DESC LIMIT 1;
 IF NOT p_revise THEN
  -- Two legal starting points: never submitted (logged, no request), or submitted UNPRICED and not yet decided (the latest request has no net and no outcome). The second supersedes that request.
  v_late:=v_latest='awaiting_approval' AND v_req.id IS NOT NULL AND v_req.net_pence IS NULL AND v_req.binding_id IS NULL AND v_prev.id IS NULL
   AND NOT EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,v_req.id));
  IF NOT v_late AND (v_latest IS DISTINCT FROM 'logged' OR v_req.id IS NOT NULL OR v_prev.id IS NOT NULL) OR EXISTS(SELECT 1 FROM app.extra_sor_revision s WHERE(s.tenant_id,s.variation_id)=(v_tenant,p_variation)) THEN
   RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT o.kind INTO v_outcome FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,v_req.id);
  IF v_req.id IS NULL OR v_outcome NOT IN('approved','rejected') OR v_latest NOT IN('approved','rejected') OR v_req.net_pence IS NOT DISTINCT FROM p_net THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT v.* INTO v_var FROM app.variation v WHERE(v.tenant_id,v.job_id,v.id)=(v_tenant,p_job,p_variation);
 SELECT r.revision,r.id INTO v_rev_no,v_prev_rev FROM app.variation_revision r WHERE(r.tenant_id,r.variation_id)=(v_tenant,p_variation) ORDER BY r.revision DESC LIMIT 1;
 v_rev_no:=coalesce(v_rev_no,0)+1;
 v_ref:='surveyor-quote:'||p_command::text;
 v_hash:=encode(sha256(convert_to(jsonb_build_array('surveyor-quoted-revision.v1',v_tenant,v_rev_id,p_job,p_variation,v_rev_no,v_prev_rev,p_net,p_actor,p_command)::text,'UTF8')),'hex');
 INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,previous_revision_id,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version)
 VALUES(v_rev_id,v_tenant,p_job,p_variation,v_var.scope_item_id,v_rev_no,v_prev_rev,v_var.description,'1','item',p_net,p_net,v_hash,p_actor,'human_entered',v_ref,encode(sha256(convert_to(v_ref,'UTF8')),'hex'),'surveyor-quote.v1');
 INSERT INTO app.extra_approval_revision_binding(tenant_id,id,job_id,variation_id,logical_revision,source_kind,source_revision_id,variation_revision_id,source_hash,predecessor_binding_id,command_id,actor_membership_id)
 VALUES(v_tenant,v_bid,p_job,p_variation,coalesce(v_prev.logical_revision,0)+1,'ordinary',v_rev_id,v_rev_id,v_hash,v_prev.id,p_command,p_actor);
 IF p_revise THEN lp5_result:=app.xa_open_request(v_tenant,p_job,p_variation,p_command,p_actor,v_bid,v_rev_id,v_hash,p_net); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result; END IF;
 IF v_late THEN
  -- The unpriced snapshot is superseded by the new request revision (older revisions are refused as stale); its open Decision is dismissed.
  SELECT count(*) INTO v_old_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,v_req.id);
  PERFORM app.xa_resolve_decision(v_tenant,v_req.id,v_old_n,'dismissed',p_actor);
  lp5_result:=app.xa_open_request(v_tenant,p_job,p_variation,p_command,p_actor,v_bid,v_rev_id,v_hash,p_net)||jsonb_build_object('bindingId',v_bid,'revisionId',v_rev_id,'supersededRequestId',v_req.id); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
 END IF;
 lp5_result:=jsonb_build_object('bindingId',v_bid,'revisionId',v_rev_id,'revisionHash',v_hash,'netPence',p_net); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END;
END
$$;

-- Latest body: packages/db/migrations/0496_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.xa_approve(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_step integer, p_hash text, p_net bigint, p_reject boolean, p_reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE lp5_result jsonb; v_tenant uuid; v_req app.extra_approval_request; v_origin app.extra_origin; v_n integer; v_step jsonb; v_roles text[]; v_grant uuid; v_prior record; v_rev uuid; v_total integer; v_final boolean;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY[CASE WHEN p_reject THEN 'RejectExtra' ELSE 'ApproveExtraStep' END],p_actor);
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE(q.tenant_id,q.job_id,q.id)=(v_tenant,p_job,p_request);
 IF v_req.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT x.* INTO v_origin FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,v_req.variation_id);
 IF v_req.request_revision<>(SELECT max(q.request_revision) FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=v_req.variation_id) THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,p_request)) OR app.xa_latest_kind(v_tenant,p_job,v_req.variation_id) IS DISTINCT FROM 'awaiting_approval' THEN RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE='23514'; END IF;
 IF v_req.revision_hash::text IS DISTINCT FROM p_hash OR v_req.net_pence IS DISTINCT FROM p_net THEN RAISE EXCEPTION 'HASH_MISMATCH' USING ERRCODE='23514'; END IF;
 IF v_req.net_pence IS NULL THEN RAISE EXCEPTION 'UNPRICED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO v_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,p_request);
 IF p_step IS DISTINCT FROM v_n THEN RAISE EXCEPTION 'STEP_OUT_OF_ORDER' USING ERRCODE='23514'; END IF;
 v_total:=jsonb_array_length(v_req.requirement->'steps'); v_step:=v_req.requirement->'steps'->v_n;
 IF v_step IS NULL OR v_step->>'kind'<>'human' THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF v_step->>'role'='client_approver' THEN RAISE EXCEPTION 'CLIENT_STEP_REQUIRES_CLIENT' USING ERRCODE='23514'; END IF;
 v_roles:=ARRAY[v_step->>'role'];
 IF EXISTS(SELECT 1 FROM app.extra_escalation_fact e WHERE(e.tenant_id,e.request_id,e.step_index)=(v_tenant,p_request,v_n)) THEN
  v_roles:=v_roles||(v_step->>'escalationRole')||ARRAY(SELECT jsonb_array_elements_text(v_step->'alternateRoles'));
 END IF;
 v_grant:=app.xa_covers(p_actor,v_roles,p_job,'extra.approve');
 IF v_grant IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_actor=v_origin.raising_membership_id THEN RAISE EXCEPTION 'SELF_APPROVAL' USING ERRCODE='23514'; END IF;
 SELECT f.step_index,f.request_id INTO v_prior FROM app.extra_approval_step_fact f JOIN app.extra_approval_request q ON(q.tenant_id,q.id)=(f.tenant_id,f.request_id)
  WHERE f.tenant_id=v_tenant AND q.variation_id=v_req.variation_id AND f.actor_membership_id=p_actor ORDER BY (f.request_id=p_request) DESC,f.step_index LIMIT 1;
 IF v_prior.request_id IS NOT NULL THEN
  IF v_prior.request_id=p_request OR v_prior.step_index<>v_n THEN RAISE EXCEPTION 'REUSED_APPROVER' USING ERRCODE='23514'; END IF;
  RAISE EXCEPTION 'REPEAT_HELD' USING ERRCODE='23514';
 END IF;
 SELECT b.variation_revision_id INTO v_rev FROM app.extra_approval_revision_binding b WHERE(b.tenant_id,b.id)=(v_tenant,v_req.binding_id);
 IF p_reject THEN
  IF p_reason IS NULL OR p_reason !~ '^[a-z][a-z0-9_]{0,39}$' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,reason_code,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,'rejected',p_reason,'member',p_actor,p_command);
  PERFORM app.xa_event(v_tenant,p_job,v_req.variation_id,'rejected',v_rev,p_reason,p_command,p_actor);
  PERFORM app.xa_resolve_decision(v_tenant,p_request,v_n,'rejected',p_actor);
  lp5_result:=jsonb_build_object('requestId',p_request,'state','rejected','stepIndex',v_n); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
 END IF;
 INSERT INTO app.extra_approval_step_fact(tenant_id,id,job_id,variation_id,request_id,step_index,step_role,actor_kind,actor_membership_id,grant_id,approved_hash,approved_net_pence,command_id)
 VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,v_n,v_step->>'role','member',p_actor,v_grant,v_req.revision_hash,v_req.net_pence,p_command);
 PERFORM app.xa_resolve_decision(v_tenant,p_request,v_n,'approved',p_actor);
 v_final:=v_n+1=v_total;
 IF v_final THEN
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,'approved','member',p_actor,p_command);
  PERFORM app.xa_event(v_tenant,p_job,v_req.variation_id,'approved',v_rev,NULL,p_command,p_actor);
 ELSIF v_req.requirement->'steps'->(v_n+1)->>'role'<>'client_approver' THEN PERFORM app.xa_open_decision(v_tenant,p_request,v_n+1); END IF;
 lp5_result:=jsonb_build_object('requestId',p_request,'state',CASE WHEN v_final THEN 'approved' ELSE 'awaiting_approval' END,'stepIndex',v_n); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END;
END
$$;

-- Latest body: packages/db/migrations/0496_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.xa_withdraw(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid, p_reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE lp5_result jsonb; v_tenant uuid; v_req app.extra_approval_request; v_latest text; v_open boolean; v_n integer;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['WithdrawExtra'],p_actor);
 IF NOT EXISTS(SELECT 1 FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_variation) AND x.job_track='contractor' AND x.provenance='command') THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Ben, 13 Oct 2026 (answer 12): supervisors withdraw. Wider roles are held and therefore refused.
 IF app.xa_covers(p_actor,ARRAY['supervisor'],p_job,'job.read') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR p_reason NOT IN('not_done','raised_in_error','resident_cancelled','already_on_order') THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 v_latest:=app.xa_latest_kind(v_tenant,p_job,p_variation);
 -- Withdrawing is withdrawing the request: once it is approved the extra stays approved (so an approve that wins a race is the one effect).
 IF v_latest IS NULL OR v_latest NOT IN('logged','awaiting_approval') THEN RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE='23514'; END IF;
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=p_variation ORDER BY q.request_revision DESC LIMIT 1;
 v_open:=v_req.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,v_req.id));
 IF v_open THEN
  SELECT count(*) INTO v_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,v_req.id);
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,reason_code,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,p_variation,v_req.id,'withdrawn',p_reason,'member',p_actor,p_command);
  PERFORM app.xa_resolve_decision(v_tenant,v_req.id,v_n,'dismissed',p_actor);
 END IF;
 PERFORM app.xa_event(v_tenant,p_job,p_variation,'withdrawn',NULL,p_reason,p_command,p_actor);
 lp5_result:=jsonb_build_object('variationId',p_variation,'state','withdrawn','requestId',v_req.id); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END;
END
$$;

-- Latest body: packages/db/migrations/0496_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.xa_mark_duplicate(p_job uuid, p_duplicate uuid, p_canonical uuid, p_command uuid, p_actor uuid, p_link uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE lp5_result jsonb; v_tenant uuid; v_req app.extra_approval_request; v_latest text; v_n integer;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['MarkDuplicate'],p_actor);
 IF app.xa_covers(p_actor,ARRAY['supervisor','surveyor','commercial_manager'],p_job,'job.read') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_duplicate=p_canonical OR NOT EXISTS(SELECT 1 FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_duplicate) AND x.job_track='contractor')
  OR NOT EXISTS(SELECT 1 FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_canonical) AND x.job_track='contractor') THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 v_latest:=app.xa_latest_kind(v_tenant,p_job,p_duplicate);
 IF v_latest IS NULL OR v_latest NOT IN('logged','awaiting_approval','approved','rejected') OR app.xa_latest_kind(v_tenant,p_job,p_canonical) IN('withdrawn','duplicate') THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
 INSERT INTO app.extra_duplicate_link(tenant_id,id,job_id,duplicate_id,canonical_id,kind,command_id,actor_membership_id) VALUES(v_tenant,p_link,p_job,p_duplicate,p_canonical,'link',p_command,p_actor);
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=p_duplicate ORDER BY q.request_revision DESC LIMIT 1;
 IF v_req.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,v_req.id)) THEN
  SELECT count(*) INTO v_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,v_req.id);
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,p_duplicate,v_req.id,'duplicate','member',p_actor,p_command);
  PERFORM app.xa_resolve_decision(v_tenant,v_req.id,v_n,'dismissed',p_actor);
 END IF;
 PERFORM app.xa_event(v_tenant,p_job,p_duplicate,'duplicate',NULL,NULL,p_command,p_actor);
 lp5_result:=jsonb_build_object('linkId',p_link,'variationId',p_duplicate); PERFORM app.lp5_bind_effect(p_command,NULL,'contractor_extra',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END;
END
$$;

-- Latest body: packages/db/migrations/0158_extra_approval_chain.sql
CREATE OR REPLACE FUNCTION app.xa_issue_link(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_link uuid, p_approver uuid, p_recipient text, p_token_hash text, p_expires_at timestamptz, p_authorization uuid, p_outbox uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE v_tenant uuid; v_req app.extra_approval_request; v_auth app.action_authorization; v_out app.action_outbox; v_n integer; v_wo app.work_order; v_prev uuid; v_replaced jsonb:='[]'::jsonb; l record;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['IssueClientApproval'],p_actor);
 -- Ben decision 18: only OWNER-approved sends go out. The exact authorization and its outbox row must already exist for this very request, recipient and amount.
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=v_tenant AND m.id=p_actor AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE(q.tenant_id,q.job_id,q.id)=(v_tenant,p_job,p_request);
 IF v_req.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF v_req.request_revision<>(SELECT max(q.request_revision) FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=v_req.variation_id) THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,p_request)) OR v_req.net_pence IS NULL THEN RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO v_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,p_request);
 IF v_req.requirement->'steps'->v_n->>'role' IS DISTINCT FROM 'client_approver' THEN RAISE EXCEPTION 'STEP_OUT_OF_ORDER' USING ERRCODE='23514'; END IF;
 SELECT a.* INTO v_auth FROM app.action_authorization a WHERE(a.tenant_id,a.id)=(v_tenant,p_authorization);
 SELECT o.* INTO v_out FROM app.action_outbox o WHERE(o.tenant_id,o.id)=(v_tenant,p_outbox);
 IF v_auth.id IS NULL OR v_out.id IS NULL OR v_auth.actor_membership_id<>p_actor OR v_auth.action_type<>'extra.client_approval_request.send' OR v_auth.recipient IS DISTINCT FROM p_recipient
  OR v_auth.aggregate_revision<>v_req.request_revision OR v_auth.amount_pence IS DISTINCT FROM v_req.net_pence OR v_auth.revoked_at IS NOT NULL OR v_auth.expires_at<p_expires_at
  OR v_out.authorization_id<>p_authorization OR v_out.recipient IS DISTINCT FROM p_recipient OR v_out.action_type<>v_auth.action_type OR v_out.status<>'pending' THEN
  RAISE EXCEPTION 'SEND_NOT_AUTHORISED' USING ERRCODE='42501';
 END IF;
 IF p_expires_at<=clock_timestamp() OR p_expires_at>clock_timestamp()+interval '31 days' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 SELECT w.* INTO v_wo FROM app.work_order w WHERE w.tenant_id=v_tenant AND w.job_id=p_job;
 IF NOT EXISTS(SELECT 1 FROM app.contractor_member cm JOIN app.membership m ON(m.tenant_id,m.id)=(cm.tenant_id,cm.membership_id) JOIN app.role_grant g ON(g.tenant_id,g.membership_id)=(cm.tenant_id,cm.membership_id)
  WHERE cm.tenant_id=v_tenant AND cm.membership_id=p_approver AND cm.client_id=v_req.client_id AND cm.email=p_recipient AND m.role='client_approver' AND coalesce(app.contractor_member_active(p_approver),false)
   AND g.role='client_approver' AND g.scope_kind='client' AND g.scope_id=v_req.client_id AND(g.contract_id IS NULL OR g.contract_id=v_wo.contract_id)
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))) THEN
  RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501';
 END IF;
 -- A replacement cancels every earlier open link of this request ("cancel replaced requests").
 FOR l IN SELECT k.id,k.outbox_action_id FROM app.extra_client_link k WHERE(k.tenant_id,k.request_id)=(v_tenant,p_request)
   AND NOT EXISTS(SELECT 1 FROM app.extra_client_link_closure c WHERE(c.tenant_id,c.link_id)=(k.tenant_id,k.id)) ORDER BY k.server_recorded_at LOOP
  INSERT INTO app.extra_client_link_closure(tenant_id,id,link_id,kind,actor_membership_id,command_id) VALUES(v_tenant,pg_catalog.gen_random_uuid(),l.id,'replaced',p_actor,p_command);
  v_prev:=l.id; v_replaced:=v_replaced||jsonb_build_array(l.outbox_action_id);
 END LOOP;
 INSERT INTO app.extra_client_link(tenant_id,id,job_id,variation_id,request_id,client_id,approver_membership_id,recipient,token_hash,expires_at,replaces_link_id,issued_by_membership_id,authorization_id,outbox_action_id,command_id)
 VALUES(v_tenant,p_link,p_job,v_req.variation_id,p_request,v_req.client_id,p_approver,p_recipient,p_token_hash,p_expires_at,v_prev,p_actor,p_authorization,p_outbox,p_command);
 RETURN jsonb_build_object('linkId',p_link,'requestId',p_request,'replacedOutboxIds',v_replaced);
END;
END
$$;

-- Latest body: packages/db/migrations/0496_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.xa_revoke_link(p_job uuid, p_link uuid, p_command uuid, p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE lp5_result jsonb; v_tenant uuid; v_link app.extra_client_link;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['RevokeClientApproval'],p_actor);
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=v_tenant AND m.id=p_actor AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT k.* INTO v_link FROM app.extra_client_link k WHERE(k.tenant_id,k.job_id,k.id)=(v_tenant,p_job,p_link);
 IF v_link.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM app.extra_client_link_closure c WHERE(c.tenant_id,c.link_id)=(v_tenant,p_link)) THEN RAISE EXCEPTION 'LINK_REVOKED' USING ERRCODE='23514'; END IF;
 INSERT INTO app.extra_client_link_closure(tenant_id,id,link_id,kind,actor_membership_id,command_id) VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_link,'revoked',p_actor,p_command);
 lp5_result:=jsonb_build_object('linkId',p_link,'outboxActionId',v_link.outbox_action_id); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END;
END
$$;

-- Latest body: packages/db/migrations/0496_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.xa_client_decide(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_token_hash text, p_email text, p_hash text, p_net bigint, p_reject boolean, p_reason text, p_role_name text, p_tester text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE lp5_result jsonb; v_tenant uuid; v_link app.extra_client_link; v_closure text; v_req app.extra_approval_request; v_wo app.work_order; v_n integer; v_total integer; v_rev uuid; v_grant uuid; v_final boolean;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['ClientDecideExtra'],p_actor);
 SELECT k.* INTO v_link FROM app.extra_client_link k WHERE k.tenant_id=v_tenant AND k.token_hash=p_token_hash;
 IF v_link.id IS NULL OR v_link.approver_membership_id<>p_actor THEN RAISE EXCEPTION 'LINK_INVALID' USING ERRCODE='42501'; END IF;
 SELECT c.kind INTO v_closure FROM app.extra_client_link_closure c WHERE(c.tenant_id,c.link_id)=(v_tenant,v_link.id);
 IF v_closure='decided' THEN RAISE EXCEPTION 'LINK_REPLAYED' USING ERRCODE='23514'; END IF;
 IF v_closure IS NOT NULL THEN RAISE EXCEPTION 'LINK_REVOKED' USING ERRCODE='23514'; END IF;
 IF clock_timestamp()>=v_link.expires_at THEN RAISE EXCEPTION 'LINK_EXPIRED' USING ERRCODE='23514'; END IF;
 IF p_email IS NULL OR lower(p_email)<>lower(v_link.recipient) THEN RAISE EXCEPTION 'EMAIL_MISMATCH' USING ERRCODE='23514'; END IF;
 SELECT w.* INTO v_wo FROM app.work_order w WHERE w.tenant_id=v_tenant AND w.job_id=p_job;
 IF v_link.job_id<>p_job OR v_link.request_id<>p_request OR v_wo.client_id IS DISTINCT FROM v_link.client_id THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT q.* INTO v_req FROM app.extra_approval_request q WHERE(q.tenant_id,q.job_id,q.id)=(v_tenant,p_job,p_request);
 IF v_req.client_id<>v_link.client_id THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF v_req.request_revision<>(SELECT max(q.request_revision) FROM app.extra_approval_request q WHERE q.tenant_id=v_tenant AND q.variation_id=v_req.variation_id) THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(v_tenant,p_request)) OR app.xa_latest_kind(v_tenant,p_job,v_req.variation_id) IS DISTINCT FROM 'awaiting_approval' THEN RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE='23514'; END IF;
 SELECT g.id INTO v_grant FROM app.contractor_member cm JOIN app.membership m ON(m.tenant_id,m.id)=(cm.tenant_id,cm.membership_id) JOIN app.role_grant g ON(g.tenant_id,g.membership_id)=(cm.tenant_id,cm.membership_id)
  WHERE cm.tenant_id=v_tenant AND cm.membership_id=p_actor AND cm.client_id=v_req.client_id AND lower(cm.email)=lower(p_email) AND m.role='client_approver' AND coalesce(app.contractor_member_active(p_actor),false)
   AND g.role='client_approver' AND g.scope_kind='client' AND g.scope_id=v_req.client_id AND(g.contract_id IS NULL OR g.contract_id=v_wo.contract_id)
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id)) ORDER BY g.id LIMIT 1;
 IF v_grant IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO v_n FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(v_tenant,p_request);
 IF v_req.requirement->'steps'->v_n->>'role' IS DISTINCT FROM 'client_approver' THEN RAISE EXCEPTION 'STEP_OUT_OF_ORDER' USING ERRCODE='23514'; END IF;
 IF v_req.revision_hash::text IS DISTINCT FROM p_hash OR v_req.net_pence IS DISTINCT FROM p_net OR v_req.net_pence IS NULL THEN RAISE EXCEPTION 'HASH_MISMATCH' USING ERRCODE='23514'; END IF;
 IF p_role_name IS NULL OR p_tester IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 SELECT b.variation_revision_id INTO v_rev FROM app.extra_approval_revision_binding b WHERE(b.tenant_id,b.id)=(v_tenant,v_req.binding_id);
 INSERT INTO app.extra_client_link_closure(tenant_id,id,link_id,kind,actor_membership_id,command_id) VALUES(v_tenant,pg_catalog.gen_random_uuid(),v_link.id,'decided',p_actor,p_command);
 IF p_reject THEN
  IF p_reason IS NULL OR p_reason !~ '^[a-z][a-z0-9_]{0,39}$' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,reason_code,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,'rejected',p_reason,'client_approver',p_actor,p_command);
  PERFORM app.xa_event(v_tenant,p_job,v_req.variation_id,'rejected',v_rev,p_reason,p_command,p_actor);
  lp5_result:=jsonb_build_object('requestId',p_request,'state','rejected','stepIndex',v_n); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
 END IF;
 INSERT INTO app.extra_approval_step_fact(tenant_id,id,job_id,variation_id,request_id,step_index,step_role,actor_kind,actor_membership_id,grant_id,approved_hash,approved_net_pence,fictional_role_name,actual_tester_reference,command_id)
 VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,v_n,'client_approver','client_approver',p_actor,v_grant,v_req.revision_hash,v_req.net_pence,p_role_name,p_tester,p_command);
 v_total:=jsonb_array_length(v_req.requirement->'steps'); v_final:=v_n+1=v_total;
 IF v_final THEN
  INSERT INTO app.extra_approval_outcome(tenant_id,id,job_id,variation_id,request_id,kind,actor_kind,actor_membership_id,command_id)
  VALUES(v_tenant,pg_catalog.gen_random_uuid(),p_job,v_req.variation_id,p_request,'approved','client_approver',p_actor,p_command);
  PERFORM app.xa_event(v_tenant,p_job,v_req.variation_id,'approved',v_rev,NULL,p_command,p_actor);
 END IF;
 lp5_result:=jsonb_build_object('requestId',p_request,'state',CASE WHEN v_final THEN 'approved' ELSE 'awaiting_approval' END,'stepIndex',v_n); PERFORM app.lp5_bind_effect(p_command,NULL,'extra_chain',jsonb_build_object('result',lp5_result)); RETURN lp5_result;
END;
END
$$;

-- Latest body: packages/db/migrations/0158_extra_approval_chain.sql
CREATE OR REPLACE FUNCTION app.xa_client_view_authority(p_job uuid, p_request uuid, p_actor uuid, p_email text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE v_tenant uuid; v_wo app.work_order; v_client uuid; v_grant uuid;
BEGIN
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN v_tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_tenant:=NULL; END;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT w.* INTO v_wo FROM app.work_order w WHERE w.tenant_id=v_tenant AND w.job_id=p_job;
 SELECT q.client_id INTO v_client FROM app.extra_approval_request q WHERE(q.tenant_id,q.job_id,q.id)=(v_tenant,p_job,p_request);
 IF v_wo.id IS NULL OR v_client IS NULL OR v_wo.client_id IS DISTINCT FROM v_client THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT g.id INTO v_grant FROM app.contractor_member cm JOIN app.membership m ON(m.tenant_id,m.id)=(cm.tenant_id,cm.membership_id) JOIN app.role_grant g ON(g.tenant_id,g.membership_id)=(cm.tenant_id,cm.membership_id)
  WHERE cm.tenant_id=v_tenant AND cm.membership_id=p_actor AND cm.client_id=v_client AND lower(cm.email)=lower(p_email) AND m.role='client_approver' AND coalesce(app.contractor_member_active(p_actor),false)
   AND g.role='client_approver' AND g.scope_kind='client' AND g.scope_id=v_client AND(g.contract_id IS NULL OR g.contract_id=v_wo.contract_id)
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id)) ORDER BY g.id LIMIT 1;
 IF v_grant IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
END;
END
$$;

-- Latest body: packages/db/migrations/0164_job_sources.sql
CREATE OR REPLACE FUNCTION app.read_job_sources(t uuid,j uuid,digest text,source text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(digest,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE records jsonb;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(digest,t)) THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(WITH RECURSIVE owned(id) AS(
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=digest
  UNION SELECT job.id FROM owned source_job JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source_job.id::text
   JOIN app.job job ON job.tenant_id=e.tenant_id AND job.id::text=e.subject_ref AND job.provenance='imported' AND job.practice_session_digest IS NULL
 ) SELECT 1 FROM owned JOIN app.job_commercial_track track ON track.tenant_id=t AND track.job_id=owned.id WHERE owned.id=j AND track.job_track='small_builder' AND track.environment='synthetic_demo') THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF source NOT IN('diary','customer_message') OR source IS NULL THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_INPUT' USING ERRCODE='22023'; END IF;
 IF source='diary' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'commandId',s.command_id,'entryMode',s.entry_mode,'onSite',s.on_site,'actualTesterMembershipId',s.actor_membership_id,'text',convert_from(o.bytes,'UTF8'),'evidence',jsonb_build_object('id',s.evidence_id,'objectVersionId',s.object_version_id,'sha256',s.sha256,'serverReceivedAt',to_char(s.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))) ORDER BY s.source_received_at,s.id),'[]') INTO records
   FROM app.job_diary_entry s JOIN app.job_source_original o ON(o.tenant_id,o.job_id,o.source_kind,o.source_id,o.evidence_id,o.object_version_id,o.sha256,o.source_received_at)=(s.tenant_id,s.job_id,s.source_kind,s.id,s.evidence_id,s.object_version_id,s.sha256,s.source_received_at) WHERE s.tenant_id=t AND s.job_id=j;
  RETURN jsonb_build_object('version','job-diary-read.v1','jobId',j,'entries',records,'notice','Notes are for your records. To bill for extra work, use Log an extra. JobGuard checks your records against your final bill after you complete it.','noticeVersion','job-diary-notice.v1','environment','synthetic_demo','realExternalActions',0);
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'commandId',s.command_id,'actualTesterMembershipId',s.actor_membership_id,'fictionalCustomer',jsonb_build_object('kind','named_fictional_customer','name',s.fictional_role_name),'text',convert_from(o.bytes,'UTF8'),'evidence',jsonb_build_object('id',s.evidence_id,'objectVersionId',s.object_version_id,'sha256',s.sha256,'serverReceivedAt',to_char(s.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))) ORDER BY s.source_received_at,s.id),'[]') INTO records
  FROM app.customer_message_source s JOIN app.job_source_original o ON(o.tenant_id,o.job_id,o.source_kind,o.source_id,o.evidence_id,o.object_version_id,o.sha256,o.source_received_at)=(s.tenant_id,s.job_id,s.source_kind,s.id,s.evidence_id,s.object_version_id,s.sha256,s.source_received_at) WHERE s.tenant_id=t AND s.job_id=j;
 RETURN jsonb_build_object('version','customer-message-read.v1','jobId',j,'messages',records,'environment','synthetic_demo','realExternalActions',0);
END;
END
$$;

-- Latest body: packages/db/migrations/0196_enterprise_live_prompts.sql
CREATE OR REPLACE FUNCTION app.lp_authority(p_session uuid,p_job uuid,p_action text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; identity_user uuid; member_role text; role_set text[];
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 SELECT s.membership_id,s.identity_user_id INTO a,identity_user FROM app.contractor_session(p_session) s WHERE s.tenant_id=t;
 -- Lock the session row so a revocation cannot pass this command's recheck.
 PERFORM 1 FROM control_plane.contractor_practice_session s WHERE s.session_digest=app.contractor_practice_session_digest(p_session) FOR SHARE;
 SELECT m.role INTO member_role FROM app.membership m JOIN app.contractor_member c ON(c.tenant_id,c.membership_id)=(m.tenant_id,m.id)
 WHERE m.tenant_id=t AND m.id=a AND m.identity_user_id=identity_user AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE(r.tenant_id,r.membership_id)=(m.tenant_id,m.id));
 role_set:=CASE p_action WHEN 'materials' THEN ARRAY['finance','owner'] WHEN 'list' THEN ARRAY['supervisor'] WHEN 'endcheck' THEN ARRAY['owner'] ELSE ARRAY['supervisor','surveyor','commercial_manager'] END;
 IF member_role IS NULL OR NOT member_role=ANY(role_set) OR NOT EXISTS(
  SELECT 1 FROM app.job j JOIN app.work_order w ON(w.tenant_id,w.job_id)=(j.tenant_id,j.id)
  JOIN app.job_commercial_track tr ON(tr.tenant_id,tr.job_id)=(j.tenant_id,j.id)
  JOIN app.team tm ON tm.tenant_id=j.tenant_id AND tm.id=app.contractor_job_team(j.id)
  JOIN app.org_unit b ON(b.tenant_id,b.id)=(tm.tenant_id,tm.branch_id)
  JOIN app.role_grant g ON g.tenant_id=j.tenant_id AND g.membership_id=a AND g.role=member_role
  WHERE j.tenant_id=t AND j.id=p_job AND j.provenance='work_order' AND tr.job_track='contractor' AND tr.environment='synthetic_demo'
  AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
  AND (g.scope_kind='tenant' AND g.scope_id=t OR g.scope_kind='team' AND g.scope_id=tm.id OR g.scope_kind='branch' AND g.scope_id=b.id OR g.scope_kind='region' AND g.scope_id=b.parent_id))
 THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) s WHERE s.tenant_id=t AND s.membership_id=a) THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN('list','detail') THEN
  IF NOT coalesce(app.contractor_member_active(a),false) THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  -- Serialize before taking the job SHARE lock: confirmation may upgrade it via scope writes.
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_job::text,417));
  PERFORM app.require_watchdog_live(p_job);
  -- Serializes baseline imports; their UPDATE of work_order_current waits for this lock.
  PERFORM 1 FROM app.work_order_current c JOIN app.work_order w ON(w.tenant_id,w.id)=(c.tenant_id,c.work_order_id) WHERE w.tenant_id=t AND w.job_id=p_job FOR SHARE OF c;
  IF EXISTS(SELECT 1 FROM app.work_order w JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id) JOIN app.work_order_revision r ON(r.tenant_id,r.id)=(c.tenant_id,c.revision_id) WHERE w.tenant_id=t AND w.job_id=p_job AND r.status<>'ordered') THEN RAISE EXCEPTION 'JOB_NOT_LIVE'; END IF;
 END IF;
 RETURN a;
END;
END
$$;

-- Latest body: packages/db/migrations/0196_enterprise_live_prompts.sql
CREATE OR REPLACE FUNCTION app.lp_read(p_session uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; j uuid:=(p_input->>'jobId')::uuid; a uuid; result jsonb; lim integer:=coalesce((p_input->>'limit')::integer,50); x jsonb;
BEGIN
 a:=app.lp_authority(p_session,j,CASE p_input->>'version' WHEN 'live-prompt-list.v1' THEN 'list' ELSE 'detail' END);
 IF p_input->>'version'='live-prompt-list.v1' THEN
  IF p_input-ARRAY['version','jobId','limit','after']<>'{}'::jsonb OR lim NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM jsonb_each(p_input) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM CASE WHEN e.key='limit' THEN 'number' ELSE 'string' END) THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
  SELECT coalesce(jsonb_agg(q.document ORDER BY q.id),'[]') INTO result FROM (
   SELECT p.id,jsonb_build_object('id',p.id,'jobId',p.job_id,'promptHash',p.prompt_hash,'rule',p.rule,'ruleVersion',p.rule_version,'surfacedAt',p.surfaced_at,'resolution',r.kind) document
   FROM app.extra_prompt p LEFT JOIN app.prompt_resolution r ON(r.tenant_id,r.prompt_id)=(p.tenant_id,p.id)
   WHERE p.tenant_id=t AND p.job_id=j AND (p_input->>'after' IS NULL OR p.id>(p_input->>'after')::uuid) ORDER BY p.id LIMIT lim+1) q;
  RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(result)>lim THEN result-(lim) ELSE result END,'nextCursor',CASE WHEN jsonb_array_length(result)>lim THEN result->(lim-1)->>'id' ELSE NULL END);
 ELSIF p_input->>'version'='live-prompt-detail.v1' THEN
  IF p_input-ARRAY['version','jobId','promptId']<>'{}'::jsonb OR EXISTS(SELECT 1 FROM jsonb_each(p_input) e WHERE jsonb_typeof(e.value)<>'string') THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
  SELECT jsonb_build_object('id',p.id,'jobId',p.job_id,'promptHash',p.prompt_hash,'rule',p.rule,'ruleVersion',p.rule_version,'baselineHash',p.baseline_hash,'baselineRevisionId',p.revision_id,'surfacedAt',p.surfaced_at,'resolution',r.kind,'variationId',r.variation_id,'reason',r.reason,
   'citations',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',c.source_kind,'sourceId',c.source_id,'sha256',c.source_hash,'evidenceId',c.evidence_id,'objectVersion',c.object_version_id,'locator',c.locator) ORDER BY c.id) FROM app.extra_prompt_citation c WHERE c.tenant_id=t AND c.prompt_id=p.id),'[]'::jsonb))
  INTO result FROM app.extra_prompt p LEFT JOIN app.prompt_resolution r ON(r.tenant_id,r.prompt_id)=(p.tenant_id,p.id) WHERE p.tenant_id=t AND p.job_id=j AND p.id=(p_input->>'promptId')::uuid;
  IF result IS NULL THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN result;
 END IF;
 RAISE EXCEPTION 'INVALID_PROMPT_COMMAND';
END;
END
$$;

-- Latest body: packages/db/migrations/0196_enterprise_live_prompts.sql
CREATE OR REPLACE FUNCTION app.lp_command(p_session uuid,p_input jsonb,p_source_bytes bytea DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; j uuid:=(p_input->>'jobId')::uuid; a uuid; cid uuid:=(p_input->>'commandId')::uuid;
 ver text:=p_input->>'version'; typ text; h text; old app.command_receipt; answer jsonb; evaluation jsonb; fact app.materials_issue_fact; source_hash text; source uuid;
 p app.extra_prompt; chosen uuid; n integer; v uuid:=gen_random_uuid(); scope uuid:=gen_random_uuid(); grant_id uuid; role_name text; origin_hash text; audits jsonb:='[]'; pid uuid; rev uuid; selected_identity text; excess_scope uuid; selected_unit text; settings app.extra_prompt_rule_settings; term text; original_bytes bytea; tags jsonb; source_kind text; expected_keys text[];
BEGIN
 typ:=CASE ver WHEN 'materials-issue.v1' THEN 'ImportMaterialsIssue' WHEN 'completion-observation.v1' THEN 'RegisterCompletionObservation' WHEN 'evaluate-live-prompts.v1' THEN 'EvaluateLivePrompts' WHEN 'confirm-prompt.v1' THEN 'ConfirmPrompt' WHEN 'dismiss-prompt.v1' THEN 'DismissPrompt' WHEN 'end-check.v1' THEN 'EndCheck' ELSE NULL END;
 IF typ IS NULL OR cid IS NULL OR j IS NULL THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
 a:=app.lp_authority(p_session,j,CASE WHEN typ='ImportMaterialsIssue' THEN 'materials' WHEN typ='EndCheck' THEN 'endcheck' ELSE 'resolve' END);
 IF typ='EndCheck' THEN RAISE EXCEPTION 'PROMPT_END_CHECK_HELD'; END IF;
 expected_keys:=CASE typ WHEN 'ImportMaterialsIssue' THEN ARRAY['version','commandId','jobId','sourceId','eventId','workIdentity','unit','quantity','occurredAtMicros','kind']
 WHEN 'RegisterCompletionObservation' THEN ARRAY['version','commandId','jobId','evidenceId','sha256','objectVersion','locator','workIdentity','sourceText']
 WHEN 'ConfirmPrompt' THEN ARRAY['version','commandId','jobId','promptId','promptHash','confirmedWorkIdentity','excessScopeItemId','existingExtraId']
 WHEN 'DismissPrompt' THEN ARRAY['version','commandId','jobId','promptId','promptHash','reason'] ELSE ARRAY['version','commandId','jobId'] END;
 IF p_input-expected_keys<>'{}'::jsonb OR EXISTS(SELECT 1 FROM unnest(expected_keys) k WHERE k NOT IN('confirmedWorkIdentity','excessScopeItemId','existingExtraId','sourceText') AND (NOT p_input ? k OR p_input->k='null'::jsonb))
  OR EXISTS(SELECT 1 FROM jsonb_each(p_input) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM CASE WHEN e.key='locator' THEN 'object' ELSE 'string' END)
 THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
 h:=encode(sha256(convert_to(jsonb_build_array(a,p_input)::text,'UTF8')),'hex');
 -- Shared tenant command namespace; authority/live check occurs BEFORE replay.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||cid::text,8189));
 PERFORM app.lp_authority(p_session,j,CASE WHEN typ='ImportMaterialsIssue' THEN 'materials' ELSE 'resolve' END);
 SELECT * INTO old FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF old.command_id IS NOT NULL THEN
  IF old.request_hash<>h OR old.command_type<>typ OR old.status<>'succeeded' THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
  PERFORM app.lp_authority(p_session,j,CASE WHEN typ='ImportMaterialsIssue' THEN 'materials' WHEN typ='EndCheck' THEN 'endcheck' ELSE 'resolve' END);
  RETURN jsonb_build_object('replay',true,'result',old.result,'audits','[]'::jsonb);
 END IF;
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(t,cid,typ,CASE WHEN typ='ConfirmPrompt' THEN 'extra-origin:'||j::text||':'||v::text ELSE 'live-prompt:'||j::text||':'||cid::text END,h,'processing',a);
 IF typ='ImportMaterialsIssue' THEN
  IF p_input->>'kind' NOT IN('issue','return','correction') OR p_input->>'quantity' !~ '^(0|[1-9][0-9]{0,17})(\.[0-9]{1,6})?$' OR (p_input->>'quantity')::numeric<0 OR (p_input->>'kind'='issue' AND (p_input->>'quantity')::numeric=0) OR p_input->>'occurredAtMicros' !~ '^(0|[1-9][0-9]{0,23})$'
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['sourceId','eventId','workIdentity','unit']) k WHERE length(btrim(p_input->>k)) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
  source_hash:=encode(sha256(convert_to((p_input-ARRAY['commandId','version'])::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(t,p_input->>'sourceId',p_input->>'eventId')::text,8190));
  PERFORM app.lp_authority(p_session,j,'materials');
  SELECT * INTO fact FROM app.materials_issue_fact WHERE tenant_id=t AND source_id=p_input->>'sourceId' AND event_id=p_input->>'eventId';
  IF fact.id IS NOT NULL THEN
   IF fact.source_hash<>source_hash OR fact.job_id<>j THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
   SELECT cr.result INTO answer FROM app.command_receipt cr WHERE cr.tenant_id=t AND cr.command_id=fact.command_id;
  ELSE
   INSERT INTO app.materials_issue_fact(tenant_id,job_id,version,fact_kind,source_id,event_id,work_identity,unit,quantity,occurred_at_micros,source_hash,command_id,actor_membership_id)
   VALUES(t,j,ver,p_input->>'kind',p_input->>'sourceId',p_input->>'eventId',p_input->>'workIdentity',p_input->>'unit',(p_input->>'quantity')::numeric,(p_input->>'occurredAtMicros')::numeric,source_hash,cid,a) RETURNING id INTO source;
   evaluation:=app.lp_evaluate(j,cid);
   -- Import authority does not imply reading the Possible extras lane.
   answer:=jsonb_build_object('sourceId',source,'quarantinedComparisons',evaluation->'quarantinedComparisons','unevaluatedComparisons',evaluation->'unevaluatedComparisons');
  END IF;
 ELSIF typ='RegisterCompletionObservation' THEN
  IF p_input->'locator'->>'kind'='text_span' THEN
   source_kind:='completion_note'; original_bytes:=convert_to(p_input->>'sourceText','UTF8');
   IF original_bytes IS NULL OR octet_length(original_bytes)>100000 OR encode(sha256(original_bytes),'hex') IS DISTINCT FROM p_input->>'sha256'
    OR NOT EXISTS(SELECT 1 FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
     WHERE e.tenant_id=t AND e.job_id=j AND e.id=(p_input->>'evidenceId')::uuid AND e.sha256=p_input->>'sha256' AND e.object_version_id=p_input->>'objectVersion'
     AND e.evidence_type='completion_note' AND e.content_type IN('text/plain','text/plain; charset=utf-8') AND e.byte_length=octet_length(original_bytes) AND e.kind='original' AND e.server_verified_at IS NOT NULL AND u.state='verified' AND u.server_verified_at IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE(i.tenant_id,i.evidence_id)=(e.tenant_id,e.id))) THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
   IF NOT app.lp_span_valid(p_input->>'sourceText',p_input->'locator') THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
   term:=p_input->'locator'->>'quote';
  ELSIF p_input->'locator'->>'kind'='photo_tag' THEN
   source_kind:='completion_photo';
   IF p_input ? 'sourceText' OR (p_input->'locator')-ARRAY['kind','tag']<>'{}'::jsonb OR jsonb_typeof(p_input->'locator'->'tag') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
   -- The ordinary-runtime source adapter reads the immutable original under its existing RLS.
   -- No new original-table grants. This preimage is independently bound to finalized metadata here.
   SELECT p_source_bytes INTO original_bytes FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
    WHERE e.tenant_id=t AND e.job_id=j AND e.id=(p_input->>'evidenceId')::uuid AND e.sha256=p_input->>'sha256' AND e.object_version_id=p_input->>'objectVersion'
    AND e.evidence_type='completion_photo' AND e.content_type='image/png' AND e.kind='original' AND e.server_verified_at IS NOT NULL AND u.state='verified' AND u.server_verified_at IS NOT NULL
    AND octet_length(p_source_bytes)=e.byte_length AND encode(sha256(p_source_bytes),'hex')=e.sha256
    AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE(i.tenant_id,i.evidence_id)=(e.tenant_id,e.id));
   IF original_bytes IS NULL THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
   tags:=app.lp_png_completion_tags(original_bytes); term:=p_input->'locator'->>'tag';
   IF tags IS NULL OR NOT tags ? term THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
  ELSE RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
  SELECT s.* INTO settings FROM app.work_order w JOIN app.extra_prompt_rule_settings s ON(s.tenant_id,s.client_contract_version_id)=(w.tenant_id,w.contract_version_id) WHERE w.tenant_id=t AND w.job_id=j;
  -- Unknown/ambiguous vocabulary is a persisted unevaluated observation, never a fabricated mapping.
  IF settings.id IS NOT NULL AND (SELECT count(DISTINCT e->>'workId') FROM jsonb_array_elements(settings.recognition) e WHERE e->'terms' ? term)=1
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(settings.recognition) e WHERE e->>'workId'=p_input->>'workIdentity' AND e->'terms' ? term) THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
  INSERT INTO app.extra_completion_observation(tenant_id,job_id,evidence_id,object_version_id,sha256,source_kind,source_bytes,source_text,photo_tags,locator,work_identity,command_id,actor_membership_id)
  VALUES(t,j,(p_input->>'evidenceId')::uuid,p_input->>'objectVersion',p_input->>'sha256',source_kind,original_bytes,p_input->>'sourceText',tags,p_input->'locator',p_input->>'workIdentity',cid,a) RETURNING id INTO source;
  evaluation:=app.lp_evaluate(j,cid); answer:=jsonb_build_object('observationId',source,'evaluation',evaluation);
 ELSIF typ='EvaluateLivePrompts' THEN answer:=app.lp_evaluate(j,cid);
 ELSE
  SELECT * INTO p FROM app.extra_prompt WHERE tenant_id=t AND job_id=j AND id=(p_input->>'promptId')::uuid FOR UPDATE;
  SELECT c.revision_id INTO rev FROM app.work_order w JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id) WHERE w.tenant_id=t AND w.job_id=j;
  IF p.id IS NULL OR p.prompt_hash IS DISTINCT FROM p_input->>'promptHash' OR p.revision_id IS DISTINCT FROM rev THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
  IF EXISTS(SELECT 1 FROM app.prompt_resolution WHERE tenant_id=t AND prompt_id=p.id) THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
  IF NOT app.lp_citations_valid(j,p.id) THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
  IF p.rule='b' AND (EXISTS(SELECT 1 FROM app.materials_issue_fact f WHERE f.tenant_id=t AND f.job_id=j AND f.work_identity=p.work_identity AND f.fact_kind<>'issue') OR EXISTS(SELECT 1 FROM app.materials_issue_fact f JOIN app.materials_issue_fact g ON(g.tenant_id,g.job_id,g.source_id,g.work_identity,g.unit,g.occurred_at_micros)=(f.tenant_id,f.job_id,f.source_id,f.work_identity,f.unit,f.occurred_at_micros)
   WHERE f.tenant_id=t AND f.job_id=j AND f.work_identity=p.work_identity AND f.id<>g.id AND f.quantity<>g.quantity)) THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
  IF typ='DismissPrompt' THEN
   IF length(btrim(p_input->>'reason')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
   INSERT INTO app.prompt_resolution(tenant_id,job_id,prompt_id,kind,prompt_hash,reason,actor_membership_id,command_id) VALUES(t,j,p.id,'dismissed',p.prompt_hash,p_input->>'reason',a,cid);
   answer:=jsonb_build_object('kind','dismissed','promptId',p.id);
  ELSE
   selected_identity:=coalesce(p.work_identity,p_input->>'confirmedWorkIdentity');
   IF selected_identity IS NULL OR (p.work_identity IS NOT NULL AND p_input ? 'confirmedWorkIdentity' AND p_input->>'confirmedWorkIdentity'<>p.work_identity)
    OR NOT EXISTS(SELECT 1 FROM app.work_order_revision r JOIN app.sor_item i ON(i.tenant_id,i.version_id)=(r.tenant_id,r.sor_version_id) WHERE r.tenant_id=t AND r.id=rev AND i.code=selected_identity) THEN RAISE EXCEPTION 'PROMPT_AMBIGUOUS'; END IF;
   IF p.rule='b' THEN
    SELECT f.unit INTO selected_unit FROM app.extra_prompt_citation c JOIN app.materials_issue_fact f ON(f.tenant_id,f.job_id,f.id)=(c.tenant_id,c.job_id,c.source_id) WHERE c.tenant_id=t AND c.prompt_id=p.id AND c.source_kind='materials' LIMIT 1;
    SELECT count(*),min(l.scope_item_id::text)::uuid INTO n,excess_scope FROM app.work_order_line l WHERE l.tenant_id=t AND l.job_id=j AND l.revision_id=rev AND l.sor_code=selected_identity AND l.unit=selected_unit
     AND (NOT p_input ? 'excessScopeItemId' OR l.scope_item_id=(p_input->>'excessScopeItemId')::uuid);
    IF n<>1 THEN RAISE EXCEPTION 'PROMPT_AMBIGUOUS'; END IF;
   ELSIF p_input ? 'excessScopeItemId' OR EXISTS(SELECT 1 FROM app.work_order_line WHERE tenant_id=t AND revision_id=rev AND sor_code=selected_identity) THEN
    -- A generic visit/closeout cannot be turned into an on-order quantity excess by guesswork.
    RAISE EXCEPTION 'PROMPT_AMBIGUOUS';
   END IF;
   SELECT count(*),min(x.id::text)::uuid INTO n,chosen FROM app.variation x WHERE x.tenant_id=t AND x.job_id=j AND x.job_track='contractor' AND x.sor_code=selected_identity
    AND (NOT p_input ? 'existingExtraId' OR x.id=(p_input->>'existingExtraId')::uuid)
    AND (p.rule='b' AND x.excess_of_revision_id=rev AND x.excess_of_scope_item_id=excess_scope OR p.rule<>'b' AND x.excess_of_revision_id IS NULL);
   IF n>1 OR (n=0 AND p_input ? 'existingExtraId') THEN RAISE EXCEPTION 'PROMPT_AMBIGUOUS'; END IF;
   IF n=1 THEN
    INSERT INTO app.prompt_resolution(tenant_id,job_id,prompt_id,kind,variation_id,prompt_hash,actor_membership_id,command_id) VALUES(t,j,p.id,'coalesced',chosen,p.prompt_hash,a,cid);
    answer:=jsonb_build_object('kind','coalesced','promptId',p.id,'variationId',chosen);
   ELSE
    SELECT m.role INTO role_name FROM app.membership m WHERE m.tenant_id=t AND m.id=a;
    SELECT g.id INTO grant_id FROM app.role_grant g JOIN app.team tm ON tm.tenant_id=t AND tm.id=app.contractor_job_team(j) JOIN app.org_unit b ON(b.tenant_id,b.id)=(tm.tenant_id,tm.branch_id)
     WHERE g.tenant_id=t AND g.membership_id=a AND g.role=role_name AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
      AND(g.scope_kind='tenant' AND g.scope_id=t OR g.scope_kind='team' AND g.scope_id=tm.id OR g.scope_kind='branch' AND g.scope_id=b.id OR g.scope_kind='region' AND g.scope_id=b.parent_id) ORDER BY g.id LIMIT 1;
    INSERT INTO app.prompt_resolution(tenant_id,job_id,prompt_id,kind,variation_id,prompt_hash,actor_membership_id,command_id) VALUES(t,j,p.id,'created',v,p.prompt_hash,a,cid);
    INSERT INTO app.scope_identity(tenant_id,job_id,id) VALUES(t,j,scope);
    IF excess_scope IS NOT NULL THEN INSERT INTO app.scope_lineage(tenant_id,job_id,parent_scope_item_id,child_scope_item_id,kind) VALUES(t,j,excess_scope,scope,'variation'); END IF;
    INSERT INTO app.variation(tenant_id,job_id,id,scope_item_id,capture_kind,capture_text,description,job_track,origin,sor_version_id,sor_code,excess_of_revision_id,excess_of_scope_item_id,lineage_parent_scope_item_id)
    SELECT t,j,v,scope,'text','Confirmed possible extra: '||selected_identity,'Possible extra: '||selected_identity,'contractor','jobguard_surfaced_confirmed',i.version_id,i.code,CASE WHEN excess_scope IS NOT NULL THEN rev ELSE NULL END,excess_scope,excess_scope
     FROM app.sor_item i JOIN app.work_order_revision r ON r.tenant_id=i.tenant_id AND r.sor_version_id=i.version_id WHERE r.tenant_id=t AND r.id=rev AND i.code=selected_identity;
    IF NOT FOUND THEN RAISE EXCEPTION 'PROMPT_AMBIGUOUS'; END IF;
    INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,command_id,raising_membership_id,raising_role,provenance,source_capture_kind,source_capture_hash,raising_grant_id)
    VALUES(t,j,v,'contractor','jobguard_surfaced_confirmed',cid,a,role_name,'command','text',repeat('0',64),grant_id) RETURNING extra_origin.origin_hash INTO origin_hash;
    INSERT INTO app.extra_event(tenant_id,id,job_id,variation_id,kind,command_id,actor_membership_id) VALUES(t,gen_random_uuid(),j,v,'logged',cid,a);
    audits:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||a,'eventType','contractor.extra.raised','subjectType','extra','subjectRef',v,
     'payload',jsonb_build_object('references',jsonb_build_object('command',cid,'job',j,'extra',v),'hashes',jsonb_build_object('origin',origin_hash))));
    answer:=jsonb_build_object('kind','created','promptId',p.id,'variationId',v);
   END IF;
  END IF;
 END IF;
 UPDATE app.command_receipt SET status='succeeded',result=answer,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=cid;
 -- Deferred audit validation prevents a direct caller committing without the exact receipt audit.
 audits:=audits||jsonb_build_array(jsonb_build_object('id',cid,'version','audit.v1','actorRef','membership:'||a,'eventType','contractor.prompt.command','subjectType','job','subjectRef',j,
  'payload',jsonb_build_object('references',jsonb_build_object('command',cid,'job',j,'commandType',typ),'hashes',jsonb_build_object('input',h,'result',encode(sha256(convert_to(answer::text,'UTF8')),'hex')))));
 RETURN jsonb_build_object('replay',false,'result',answer,'audits',audits);
END;
END
$$;

-- Latest body: packages/db/migrations/0196_enterprise_live_prompts.sql
CREATE OR REPLACE FUNCTION app.lp_finish(p_session uuid,p_command uuid,p_result jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; r app.command_receipt;
BEGIN
 SELECT s.membership_id INTO a FROM app.contractor_session(p_session) s WHERE s.tenant_id=t;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF a IS NULL OR r.actor_membership_id IS DISTINCT FROM a OR r.status<>'succeeded' OR r.result IS DISTINCT FROM p_result OR r.command_type NOT IN('ImportMaterialsIssue','RegisterCompletionObservation','EvaluateLivePrompts','ConfirmPrompt','DismissPrompt')
 OR NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=t AND e.id=p_command AND e.event_type='contractor.prompt.command' AND e.actor_ref='membership:'||a AND e.payload->'hashes'->>'input'=r.request_hash
 AND e.payload->'hashes'->>'result'=encode(sha256(convert_to(p_result::text,'UTF8')),'hex')) THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
 -- No locks or business writes after the audit head.
END;
END
$$;

-- Latest body: packages/db/migrations/0196_enterprise_live_prompts.sql
CREATE OR REPLACE FUNCTION app.lp_visit_evaluate(p_actor uuid,p_job uuid,p_command uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR NOT coalesce(app.contractor_member_active(p_actor),false)
  OR NOT EXISTS(SELECT 1 FROM app.command_receipt r JOIN app.closeout_answer a ON(a.tenant_id,a.command_id)=(r.tenant_id,r.command_id)
   WHERE r.tenant_id=t AND r.command_id=p_command AND r.command_type='CompleteSiteVisit' AND r.status='processing' AND r.actor_membership_id=p_actor AND a.job_id=p_job AND a.membership_id=p_actor)
 THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_job::text,417));
 PERFORM app.require_watchdog_live(p_job);
 PERFORM 1 FROM app.work_order_current c JOIN app.work_order w ON(w.tenant_id,w.id)=(c.tenant_id,c.work_order_id) WHERE w.tenant_id=t AND w.job_id=p_job FOR SHARE OF c;
 RETURN app.lp_evaluate(p_job,p_command);
END;
END
$$;

-- Latest body: packages/db/migrations/0196_enterprise_live_prompts.sql
CREATE OR REPLACE FUNCTION app.lp_sources(p_session uuid,p_job uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; w app.work_order; r app.work_order_revision; cfg app.extra_prompt_rule_settings; entries jsonb; work_ids jsonb; sources jsonb; observations jsonb;
BEGIN
 PERFORM app.lp_authority(p_session,p_job,'detail');
 SELECT * INTO w FROM app.work_order WHERE tenant_id=t AND job_id=p_job;
 SELECT rr.* INTO r FROM app.work_order_revision rr JOIN app.work_order_current c ON(c.tenant_id,c.revision_id)=(rr.tenant_id,rr.id) WHERE c.tenant_id=t AND c.work_order_id=w.id;
 SELECT * INTO cfg FROM app.extra_prompt_rule_settings WHERE tenant_id=t AND client_contract_version_id=w.contract_version_id;
 IF cfg.id IS NULL THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(DISTINCT l.sor_code),'[]') INTO work_ids FROM app.work_order_line l WHERE l.tenant_id=t AND l.revision_id=r.id;
 entries:=cfg.recognition;
 SELECT entries||coalesce(jsonb_agg(jsonb_build_object('workId',code,'terms',jsonb_build_array(code))),'[]') INTO entries FROM jsonb_array_elements_text(work_ids) code
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cfg.recognition) e WHERE e->>'workId'=code);
 SELECT coalesce(jsonb_agg(jsonb_build_object('evidenceId',o.evidence_id,'tenantId',t,'jobId',p_job,'sha256',o.sha256,'objectVersion',o.object_version_id,'status',CASE WHEN e.id IS NULL OR u.id IS NULL THEN 'rejected' WHEN u.state='pending' THEN 'upload_pending' ELSE u.state END,'invalidated',EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE(i.tenant_id,i.evidence_id)=(o.tenant_id,o.evidence_id)),'content',CASE WHEN o.source_kind='completion_photo' THEN jsonb_build_object('kind','completion_photo','tags',o.photo_tags) ELSE jsonb_build_object('kind','completion_note','text',o.source_text) END)),'[]') INTO sources
 FROM (SELECT DISTINCT ON(evidence_id) * FROM app.extra_completion_observation WHERE tenant_id=t AND job_id=p_job ORDER BY evidence_id,id) o
 LEFT JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.id,e.object_version_id,e.sha256)=(o.tenant_id,o.job_id,o.evidence_id,o.object_version_id,o.sha256)
 LEFT JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('observationId',o.id,'evidenceId',o.evidence_id,'sha256',o.sha256,'objectVersion',o.object_version_id,'locator',o.locator) ORDER BY o.id),'[]') INTO observations FROM app.extra_completion_observation o WHERE o.tenant_id=t AND o.job_id=p_job;
 RETURN jsonb_build_object('version','enterprise-completion-input.v1','environment','synthetic_demo','tenantId',t,'jobId',p_job,'baseline',jsonb_build_object('workOrderId',w.id,'revisionId',r.id,'sha256',r.content_hash,'workIds',work_ids),'recognition',jsonb_build_object('version',cfg.version,'entries',entries),'sources',sources,'observations',observations);
END;
END
$$;

-- Latest body: packages/db/migrations/0196_enterprise_live_prompts.sql
CREATE OR REPLACE FUNCTION app.lp_observation_prompt(p_session uuid,p_job uuid,p_observation uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE answer uuid;
BEGIN
 PERFORM app.lp_authority(p_session,p_job,'detail');
 SELECT c.prompt_id INTO answer FROM app.extra_prompt_citation c JOIN app.extra_prompt p ON(p.tenant_id,p.job_id,p.id)=(c.tenant_id,c.job_id,c.prompt_id)
 WHERE c.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND c.job_id=p_job AND c.source_kind='observation' AND c.source_id=p_observation AND p.rule='a';
 IF answer IS NULL THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
 RETURN answer;
END;
END
$$;

-- Latest body: packages/db/migrations/0144_job_work_state.sql
CREATE OR REPLACE FUNCTION app.ch4_read_work_facts(t uuid,j uuid,digest text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(digest,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE events jsonb; links jsonb; lock jsonb;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(digest,t)) THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(WITH RECURSIVE owned(id) AS(
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=digest
  UNION SELECT job.id FROM owned source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
   JOIN app.job job ON job.tenant_id=e.tenant_id AND job.id::text=e.subject_ref AND job.provenance='imported' AND job.practice_session_digest IS NULL
 ) SELECT 1 FROM owned JOIN app.job_commercial_track track ON track.tenant_id=t AND track.job_id=owned.id WHERE owned.id=j AND track.job_track='small_builder' AND track.environment='synthetic_demo') THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('version',version,'id',id,'jobId',job_id,'sequence',sequence,'kind',kind,'factAt',to_char(fact_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'recordedAt',to_char(recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sourceReceiptId',source_receipt_id,'commandId',command_id,'predecessorId',predecessor_id,'closeReason',close_reason,'closeNote',close_note) ORDER BY fact_at,id),'[]') INTO events FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j;
 SELECT jsonb_build_object('id',id,'lockedAt',to_char(locked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) INTO lock FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'predecessorJobId',l.predecessor_job_id,'successorJobId',l.successor_job_id,'linkedAt',to_char(l.linked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY l.linked_at,l.id),'[]') INTO links FROM app.job_link l JOIN app.job predecessor ON predecessor.tenant_id=t AND predecessor.id=l.predecessor_job_id JOIN app.job successor ON successor.tenant_id=t AND successor.id=l.successor_job_id WHERE l.tenant_id=t AND (l.predecessor_job_id=j OR l.successor_job_id=j) AND predecessor.practice_session_digest=digest AND successor.practice_session_digest=digest;
 RETURN jsonb_build_object('version','job-work-state-read.v1','jobId',j,'events',events,'links',links,'lock',lock,'environment','synthetic_demo','realExternalActions',0);
END;
END
$$;

-- Latest body: packages/db/migrations/0201_job_work_state_commands.sql
CREATE OR REPLACE FUNCTION app.ch4_command_work_facts(t uuid,j uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE events jsonb; links jsonb; lock jsonb;
BEGIN
 PERFORM app.ch4_require_command_owner(t,j,digest);
 SELECT coalesce(jsonb_agg(jsonb_build_object('version',version,'id',id,'jobId',job_id,'sequence',sequence,'kind',kind,'factAt',to_char(fact_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'recordedAt',to_char(recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sourceReceiptId',source_receipt_id,'commandId',command_id,'predecessorId',predecessor_id,'closeReason',close_reason,'closeNote',close_note) ORDER BY fact_at,id),'[]') INTO events FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j;
 SELECT jsonb_build_object('id',id,'lockedAt',to_char(locked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) INTO lock FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'predecessorJobId',l.predecessor_job_id,'successorJobId',l.successor_job_id,'linkedAt',to_char(l.linked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY l.linked_at,l.id),'[]') INTO links FROM app.job_link l JOIN app.job predecessor ON predecessor.tenant_id=t AND predecessor.id=l.predecessor_job_id JOIN app.job successor ON successor.tenant_id=t AND successor.id=l.successor_job_id WHERE l.tenant_id=t AND (l.predecessor_job_id=j OR l.successor_job_id=j)
  AND (digest ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' OR (predecessor.practice_session_digest=digest AND successor.practice_session_digest=digest));
 RETURN jsonb_build_object('version','job-work-state-read.v1','jobId',j,'events',events,'links',links,'lock',lock,'environment','synthetic_demo','realExternalActions',0);
END;
END
$$;

-- Latest body: packages/db/migrations/0201_job_work_state_commands.sql
CREATE OR REPLACE FUNCTION app.ch4_work_state_command(t uuid,j uuid,digest text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE actor uuid; action text; cid uuid; successor uuid; expected bigint; seq bigint; revision bigint;
 request_digest text; prior app.command_receipt; latest app.job_work_state_event; marker app.job_work_state_event;
 p app.job_party_binding; s app.job_party_binding; fact_id uuid:=gen_random_uuid(); audit_id uuid:=gen_random_uuid();
 old_link_envelope text:=current_setting('app.ch4_link_envelope',true);
 at_time timestamptz; event_kind text; predecessor uuid; command_result jsonb; allowed text[];
BEGIN
 -- One checked action per transaction: a second action must not acquire a
 -- business lock after this transaction's CH-4 audit allocation. xid8 is an
 -- immutable DB-generated identity (not a client/GUC token).
 IF EXISTS(SELECT 1 FROM app.watchdog_command_identity WHERE tenant_id=t AND claimed_xact=pg_current_xact_id()
  AND command_type LIKE 'WorkState.%') THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 -- Never accept caller-selected tenant/actor/time/policy or a loose JSON shape.
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 action:=input->>'action';
 -- Ruling 114: resume has no registered SQL action until MON-1-PLACES.
 
 IF action IS NULL OR action NOT IN('finish','cancel_finish','close','reopen','link','resume')
  OR input->>'version' IS DISTINCT FROM (CASE WHEN action='link' THEN 'job-link-command.v1' ELSE 'job-work-state-command.v1' END)
  OR jsonb_typeof(input->'commandId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(input->'expectedRevision') IS DISTINCT FROM 'number'
  OR (input->>'expectedRevision') !~ '^(0|[1-9][0-9]*)$'
 THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 allowed:=ARRAY['version','action','commandId','expectedRevision'];
 IF action='cancel_finish' THEN allowed:=allowed||ARRAY['markerId']; END IF;
 IF action='close' THEN allowed:=allowed||ARRAY['reason','note']; END IF;
 IF action='reopen' THEN allowed:=allowed||ARRAY['closeEventId']; END IF;
 IF action='link' THEN allowed:=allowed||ARRAY['successorJobId','predecessorBindingId','successorBindingId']; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(input) k WHERE NOT k=ANY(allowed)) OR EXISTS(SELECT 1 FROM unnest(allowed) k WHERE NOT input ? k) THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 BEGIN
  cid:=(input->>'commandId')::uuid; expected:=(input->>'expectedRevision')::bigint;
  IF action='link' THEN successor:=(input->>'successorJobId')::uuid; p.id:=(input->>'predecessorBindingId')::uuid; s.id:=(input->>'successorBindingId')::uuid; END IF;
  IF action='cancel_finish' THEN predecessor:=(input->>'markerId')::uuid; END IF;
  IF action='reopen' THEN predecessor:=(input->>'closeEventId')::uuid; END IF;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END;
 IF cid IS NULL OR expected NOT BETWEEN 0 AND 9007199254740991
  OR (action IN('cancel_finish','reopen') AND predecessor IS NULL)
  OR (action='link' AND (successor IS NULL OR p.id IS NULL OR s.id IS NULL OR successor=j))
  OR (action='close' AND (input->>'reason' IS NULL OR input->>'reason' NOT IN('cancelled_by_customer','abandoned','completed_outside_jobguard','other') OR jsonb_typeof(input->'note') IS DISTINCT FROM 'string' OR length(btrim(input->>'note',E' \t\r\n')) NOT BETWEEN 1 AND 2000))
 THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 actor:=app.ch4_require_command_owner(t,j,digest);
 IF action='link' THEN PERFORM app.ch4_require_command_owner(t,successor,digest); END IF;
 -- Live-only commands retain the repository's first SHARE lock. Taking UPDATE
 -- here would deadlock parallel duplicates upgrading their mutually held SHAREs.
 IF action IN('finish','cancel_finish') THEN
  PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 ELSE
  PERFORM 1 FROM app.job WHERE tenant_id=t AND id IN(j,successor) ORDER BY id FOR UPDATE;
 END IF;
 actor:=app.ch4_require_command_owner(t,j,digest);
 IF action='link' THEN PERFORM app.ch4_require_command_owner(t,successor,digest); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('watchdog-command-id:'||t::text||':'||cid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 actor:=app.ch4_require_command_owner(t,j,digest);
 IF action='link' THEN PERFORM app.ch4_require_command_owner(t,successor,digest); END IF;
 request_digest:=app.final_lock_hash(jsonb_build_object('jobId',j,'actor',actor,'sessionDigest',digest,'input',input));
 IF EXISTS(SELECT 1 FROM app.watchdog_command_identity WHERE tenant_id=t AND command_id=cid AND
  (job_id<>j OR command_type<>'WorkState.'||action OR request_hash<>request_digest))
 THEN RAISE EXCEPTION 'WORK_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.command_type IS DISTINCT FROM 'WorkState.'||action OR prior.request_hash IS DISTINCT FROM request_digest OR prior.actor_membership_id IS DISTINCT FROM actor OR prior.status<>'succeeded' THEN RAISE EXCEPTION 'WORK_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result;
 END IF;
 -- Current authority precedes live state; live state precedes revision.
 -- Replays above retain their original snapshot even after lifecycle changes.
 IF action IN('finish','cancel_finish') THEN PERFORM app.require_watchdog_live(j); END IF;
 -- Same serializer as the event trigger, acquired before reading the revision.
 -- Distinct finish/cancel IDs may share the job SHARE lock but cannot race facts.
 IF action IN('finish','cancel_finish') THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,144));
 END IF;
 SELECT coalesce(max(sequence),0) INTO seq FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j;
 revision:=seq+(SELECT count(*) FROM app.job_link WHERE tenant_id=t AND predecessor_job_id=j);
 IF expected<>revision THEN RAISE EXCEPTION 'WORK_STATE_STALE_REVISION' USING ERRCODE='40001'; END IF;
 SELECT * INTO latest FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j AND kind IN('closed','reopened') ORDER BY sequence DESC LIMIT 1;
 SELECT * INTO marker FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j AND kind IN('finished_on_site','finished_cancelled') ORDER BY sequence DESC LIMIT 1;
 IF action IN('finish','cancel_finish') THEN
  -- Stored replay precedes current lifecycle checks, but never current authority.
  PERFORM app.ch4_require_open(t,j);
 END IF;
 IF action='finish' AND EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 IF action='resume' THEN
  PERFORM app.ch4_require_open(t,j);
  PERFORM app.ch4_admit_place(t,j,action);
  event_kind:='resumed';
 ELSIF action='finish' THEN
  IF marker.kind='finished_on_site' THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
  event_kind:='finished_on_site';
 ELSIF action='cancel_finish' THEN
  IF marker.kind IS DISTINCT FROM 'finished_on_site' OR marker.id IS DISTINCT FROM predecessor THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
  event_kind:='finished_cancelled';
 ELSIF action='close' THEN
  IF latest.kind='closed' THEN RAISE EXCEPTION 'JOB_WORK_CLOSED'; END IF;
  event_kind:='closed';
 ELSIF action='reopen' THEN
  IF latest.kind IS DISTINCT FROM 'closed' OR latest.id IS DISTINCT FROM predecessor THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
  -- A locked reopen permits non-site administration only. It changes no job,
  -- baseline, lock, activation or check record.
  IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN PERFORM app.ch4_admit_place(t,j,action); END IF;
  event_kind:='reopened';
 ELSE
  SELECT b.* INTO p FROM app.job_party_binding b JOIN app.job_party_current c ON(c.tenant_id,c.job_id,c.binding_id)=(b.tenant_id,b.job_id,b.id)
   WHERE b.tenant_id=t AND b.job_id=j AND b.id=(input->>'predecessorBindingId')::uuid;
  SELECT b.* INTO s FROM app.job_party_binding b JOIN app.job_party_current c ON(c.tenant_id,c.job_id,c.binding_id)=(b.tenant_id,b.job_id,b.id)
   WHERE b.tenant_id=t AND b.job_id=successor AND b.id=(input->>'successorBindingId')::uuid;
  IF p.id IS NULL OR s.id IS NULL OR (p.customer_id,p.site_id,p.paying_party_id) IS DISTINCT FROM (s.customer_id,s.site_id,s.paying_party_id)
   OR NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j)
   OR NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=successor AND provenance='system_generated_quote')
  THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 END IF;
 -- Legacy watchdog stores share the same identity lock; reserve their IDs even
 -- when no modern watchdog identity row has been written yet.
 IF app.ch4_legacy_command_owned(t,cid) THEN RAISE EXCEPTION 'WORK_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
 -- The checked receipt binds the narrow administrative identity exception.
 -- The per-id lock is already held; no commercial/network action occurs here.
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(t,cid,'WorkState.'||action,cid::text,request_digest,'processing',actor);
 INSERT INTO app.watchdog_command_identity(tenant_id,command_id,job_id,command_type,request_hash)
 VALUES(t,cid,j,'WorkState.'||action,request_digest);
 at_time:=clock_timestamp();
 IF action='link' THEN
  PERFORM set_config('app.ch4_link_envelope',jsonb_build_object('jobId',j,'actor',actor,'sessionDigest',digest,'input',input)::text,true);
  INSERT INTO app.job_link(tenant_id,id,predecessor_job_id,successor_job_id,predecessor_binding_id,successor_binding_id,customer_id,site_id,paying_party_id,command_id,actor_membership_id,linked_at,request_hash,audit_event_id)
  VALUES(t,fact_id,j,successor,p.id,s.id,p.customer_id,p.site_id,p.paying_party_id,cid,actor,at_time,request_digest,audit_id);
  PERFORM set_config('app.ch4_link_envelope',coalesce(old_link_envelope,''),true);
 ELSE
  INSERT INTO app.job_work_state_event(tenant_id,job_id,id,sequence,kind,fact_at,actor_membership_id,command_id,predecessor_id,close_reason,close_note,request_hash,audit_event_id)
  VALUES(t,j,fact_id,seq+1,event_kind,at_time,actor,cid,predecessor,CASE WHEN action='close' THEN input->>'reason' END,CASE WHEN action='close' THEN input->>'note' END,request_digest,audit_id);
 END IF;
 command_result:=app.ch4_command_work_facts(t,j,digest);
 UPDATE app.command_receipt SET status='succeeded',result=command_result,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=cid;
 -- Drain only our audit constraint after the last business write/lock.
 IF action='link' THEN SET CONSTRAINTS app."A0_ch4_link_audit" IMMEDIATE; ELSE SET CONSTRAINTS app."A0_ch4_event_audit" IMMEDIATE; END IF;
 PERFORM app.ch4_require_command_owner(t,j,digest);
 IF action='link' THEN PERFORM app.ch4_require_command_owner(t,successor,digest); END IF;
 RETURN command_result;
END;
END
$$;

-- Latest body: packages/db/migrations/0201_job_work_state_commands.sql
CREATE OR REPLACE FUNCTION app.ch4_record_work_state(t uuid,j uuid,digest text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

BEGIN
 IF input->>'action' IS NULL OR input->>'action'='link' THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 RETURN app.ch4_work_state_command(t,j,digest,input);
END;
END
$$;

-- Latest body: packages/db/migrations/0201_job_work_state_commands.sql
CREATE OR REPLACE FUNCTION app.ch4_link_post_lock_job(t uuid,j uuid,digest text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

BEGIN
 IF input->>'action' IS DISTINCT FROM 'link' THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 RETURN app.ch4_work_state_command(t,j,digest,input);
END;
END
$$;


-- Latest body: packages/db/migrations/0262_final_check_reveal_lines.sql
CREATE OR REPLACE FUNCTION app.read_final_check_reveal(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE l app.final_account_lock;b app.final_check_run_binding;items jsonb;post_items jsonb;
BEGIN
 PERFORM app.final_check_builder(t,j,d);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 -- Fixed pre-lock branch never reads a shadow or final_check fact relation.
 IF NOT FOUND THEN RETURN jsonb_build_object('state','unlocked','items','[]'::jsonb); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('signalId',s.id,'description',s.description,'evidenceAfterLock',true,'evidence',
  (SELECT jsonb_agg(jsonb_build_object('id',e.evidence_id,'objectVersionId',e.object_version_id,'sha256',e.sha256,'receivedAt',to_char(e.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'source',o.evidence_type) ORDER BY e.evidence_id)
   FROM app.shadow_signal_evidence e JOIN app.evidence_object o ON(o.tenant_id,o.job_id,o.id,o.object_version_id,o.sha256,o.server_received_at)=(e.tenant_id,e.job_id,e.evidence_id,e.object_version_id,e.sha256,e.source_received_at)
   WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=s.id AND e.source_received_at>l.locked_at AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id))) ORDER BY s.id),'[]') INTO post_items
 FROM app.shadow_commercial_signal s WHERE s.tenant_id=t AND s.job_id=j AND s.coalesced_into_signal_id IS NULL
 AND EXISTS(SELECT 1 FROM app.shadow_signal_evidence e WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=s.id AND e.source_received_at>l.locked_at AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id));
 SELECT * INTO b FROM app.final_check_run_binding WHERE tenant_id=t AND job_id=j AND lock_id=l.id AND evidence_cutoff_at=l.locked_at;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('state',CASE WHEN EXISTS(SELECT 1 FROM app.final_check_source_attempt a JOIN app.final_check_manifest m ON(m.tenant_id,m.job_id,m.id)=(a.tenant_id,a.job_id,a.manifest_id) WHERE a.tenant_id=t AND a.job_id=j AND m.lock_id=l.id AND a.status IN('failed','unsupported') AND a.sequence=(SELECT max(x.sequence) FROM app.final_check_source_attempt x WHERE (x.tenant_id,x.job_id,x.manifest_id,x.source_id)=(a.tenant_id,a.job_id,a.manifest_id,a.source_id))) THEN 'failed' ELSE 'pending' END,'lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
 END IF;
 IF EXISTS(SELECT 1 FROM app.final_check_processing_source s WHERE s.tenant_id=t AND s.job_id=j AND s.manifest_id=b.manifest_id AND EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=s.evidence_id)) THEN
  RETURN jsonb_build_object('state','failed','lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('signalId',p.signal_id,'signalRevision',p.signal_revision,'description',p.description,'evidence',p.evidence,'comparisons',p.comparisons,
  'baselineHash',p.baseline_hash,'captureRegisterHash',p.capture_register_hash,'lineSetHash',p.line_set_hash,'evidenceSetHash',p.evidence_set_hash,'disposition',s.disposition,'answer',db.answer,'dispositionId',db.disposition_id) ORDER BY p.signal_id),'[]') INTO items
 FROM app.final_check_reveal_proof p JOIN app.shadow_signal_classification c ON(c.tenant_id,c.job_id,c.run_id,c.signal_id)=(p.tenant_id,p.job_id,p.run_id,p.signal_id)
 LEFT JOIN app.final_check_disposition_binding db ON(db.tenant_id,db.job_id,db.run_id,db.signal_id)=(p.tenant_id,p.job_id,p.run_id,p.signal_id)
 LEFT JOIN app.shadow_signal_disposition s ON(s.tenant_id,s.id)=(db.tenant_id,db.disposition_id)
 WHERE p.tenant_id=t AND p.job_id=j AND p.run_id=b.run_id AND c.outcome='reveal';
 -- 0247: the builder's own locked lines, so an answer can name the exact line it points at.
 RETURN jsonb_build_object('state','completed','lockId',l.id,'runId',b.run_id,'items',items,'postLockItems',post_items,
  'lockedLines',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',fl.id,'kind',fl.line_kind,'scopeItemId',fl.scope_item_id,'description',fl.description) ORDER BY fl.line_kind,fl.description,fl.id),'[]')
   FROM app.final_account_line fl WHERE fl.tenant_id=t AND fl.job_id=j AND fl.final_account_revision_id=l.final_account_revision_id));
END;
END
$$;

-- Latest body: packages/db/migrations/0238_final_check.sql
CREATE OR REPLACE FUNCTION app.record_final_check_disposition(t uuid,j uuid,d text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(d,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE actor record;prior app.command_receipt;proof app.final_check_reveal_proof;sig app.shadow_commercial_signal;l app.final_account_lock;cid uuid;ref uuid;kind text;
 answer text;resolved text;request_digest text;result jsonb;disposition uuid:=gen_random_uuid();event uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO actor FROM app.final_check_builder(t,j,d,true);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 -- Authority and its locks precede subject parsing and replay.
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 IF p->>'version' IS DISTINCT FROM 'final-check.disposition.v1' OR (SELECT count(*) FROM jsonb_object_keys(p))<>8
 OR NOT p ?& ARRAY['version','commandId','lockId','runId','signalId','expectedSignalRevision','answer','referenceId']
 OR jsonb_typeof(p->'version') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'commandId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'lockId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'runId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'signalId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'expectedSignalRevision') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'answer') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p->'referenceId') NOT IN('string','null')
 OR p->>'answer' IS NULL OR p->>'answer' NOT IN('already_included','in_original_scope','not_completed','not_chargeable','wrong_job_or_evidence')
 OR (p->>'expectedSignalRevision') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 cid:=(p->>'commandId')::uuid;answer:=p->>'answer';ref:=(p->>'referenceId')::uuid;
 IF cid IS NULL OR p->>'lockId' IS NULL OR p->>'runId' IS NULL OR p->>'signalId' IS NULL OR p->>'expectedSignalRevision' IS NULL
 OR (answer NOT IN('already_included','in_original_scope') AND ref IS NOT NULL) THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 request_digest:=app.final_lock_hash(jsonb_build_object('job',j,'actor',actor.member_id,'identity',actor.user_id,'payload',p));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||cid::text,145));
 IF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t) a WHERE a.membership_id=actor.member_id AND a.identity_user_id=actor.user_id) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN IF prior.command_type<>'RecordFinalCheckDisposition' OR prior.request_hash<>request_digest OR prior.actor_membership_id<>actor.member_id THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;RETURN prior.result; END IF;
 SELECT * INTO proof FROM app.final_check_reveal_proof WHERE tenant_id=t AND job_id=j AND run_id=(p->>'runId')::uuid AND signal_id=(p->>'signalId')::uuid AND lock_id=(p->>'lockId')::uuid;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.shadow_signal_classification WHERE tenant_id=t AND job_id=j AND run_id=proof.run_id AND signal_id=proof.signal_id AND outcome='reveal') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO sig FROM app.shadow_commercial_signal WHERE tenant_id=t AND job_id=j AND id=proof.signal_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t) a WHERE a.membership_id=actor.member_id AND a.identity_user_id=actor.user_id) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF sig.state<>'revealed' OR sig.revision<>(p->>'expectedSignalRevision')::integer OR proof.signal_revision<>sig.revision THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j AND id=proof.lock_id;
 IF ref IS NOT NULL THEN
  IF l.snapshot->'baselineScopeItemIds' ? ref::text THEN kind:='baseline';
  ELSIF answer='already_included' AND EXISTS(SELECT 1 FROM jsonb_array_elements(l.snapshot->'lines') line WHERE line.value->>'id'=ref::text) THEN kind:='line';
  ELSE RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 resolved:=CASE WHEN answer IN('already_included','in_original_scope') AND ref IS NULL THEN 'attribution_disputed' ELSE answer END;
 INSERT INTO app.shadow_signal_disposition(tenant_id,job_id,id,run_id,signal_id,disposition) VALUES(t,j,disposition,proof.run_id,proof.signal_id,resolved);
 INSERT INTO app.final_check_disposition_binding(tenant_id,job_id,disposition_id,run_id,signal_id,lock_id,expected_signal_revision,command_id,actor_membership_id,identity_user_id,answer,selected_reference_id,selected_reference_kind,request_hash,audit_event_id)
 VALUES(t,j,disposition,proof.run_id,proof.signal_id,l.id,sig.revision,cid,actor.member_id,actor.user_id,answer,ref,kind,request_digest,event);
 UPDATE app.shadow_commercial_signal SET state=CASE WHEN resolved='attribution_disputed' THEN 'attribution_disputed' ELSE 'dismissed' END,revision=revision+1 WHERE tenant_id=t AND job_id=j AND id=sig.id;
 IF resolved='attribution_disputed' THEN INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref) VALUES(t,j,gen_random_uuid(),sig.id,'attribution_disputed',disposition::text); END IF;
 result:=jsonb_build_object('dispositionId',disposition,'signalId',sig.id,'runId',proof.run_id,'lockId',l.id,'disposition',resolved);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(t,cid,'RecordFinalCheckDisposition',j::text,request_digest,'succeeded',result,actor.member_id,clock_timestamp());
 PERFORM app.append_final_check_audit(event,'membership:'||actor.member_id::text,j,'final_check.disposition_recorded',jsonb_build_object('dispositionId',disposition,'signalId',sig.id,'commandId',cid,'runId',proof.run_id));
 RETURN result;
END;
END
$$;

-- Latest body: packages/db/migrations/0238_final_check.sql
CREATE OR REPLACE FUNCTION app.read_final_check_disputes(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

BEGIN
 PERFORM app.final_check_builder(t,j,d);
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RETURN '[]'::jsonb; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('dispositionId',b.disposition_id,'signalId',b.signal_id,'runId',b.run_id,'lockId',b.lock_id,'answer',b.answer) ORDER BY b.disposition_id),'[]')
 FROM app.final_check_disposition_binding b JOIN app.shadow_signal_disposition s ON(s.tenant_id,s.id)=(b.tenant_id,b.disposition_id) WHERE b.tenant_id=t AND b.job_id=j AND s.disposition='attribution_disputed');
END;
END
$$;

-- Latest body: packages/db/migrations/0281_final_check_catch.sql
CREATE OR REPLACE FUNCTION app.confirm_final_check_catch(t uuid,j uuid,d text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(d,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE actor record;prior app.command_receipt;proof app.final_check_reveal_proof;sig app.shadow_commercial_signal;l app.final_account_lock;cid uuid;
 request_digest text;out_result jsonb;disposition uuid:=gen_random_uuid();event uuid:=gen_random_uuid();scope uuid:=gen_random_uuid();label text;
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
 out_result:=jsonb_build_object('dispositionId',disposition,'signalId',sig.id,'runId',proof.run_id,'lockId',l.id,'disposition','confirmed_extra','variationId',cid);
 UPDATE app.command_receipt SET status='succeeded',result=out_result,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=cid;
 PERFORM app.append_final_check_audit(event,'membership:'||actor.member_id::text,j,'final_check.catch_confirmed',jsonb_build_object('dispositionId',disposition,'signalId',sig.id,'commandId',cid,'runId',proof.run_id,'variationId',cid));
 RETURN out_result;
END;
END
$$;

-- Latest body: packages/db/migrations/0283_final_check_practice_run.sql
CREATE OR REPLACE FUNCTION app.request_final_check_run(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE actor record;l app.final_account_lock;
BEGIN
 -- Same owner, practice-session, synthetic small-builder and accepted-terms authority as the builder reads.
 SELECT * INTO actor FROM app.final_check_builder(t,j,d);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 INSERT INTO infrastructure.final_check_request(lock_id,tenant_id,job_id) VALUES(l.id,t,j) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('version','final-check-run-request.v1','lockId',l.id,'state','requested','environment','synthetic_demo');
END;
END
$$;

-- Latest body: packages/db/migrations/0303_job_source_intake.sql
CREATE OR REPLACE FUNCTION app.sv7a_require_watchdog_live_lock(t uuid,j uuid,digest text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

BEGIN
 BEGIN PERFORM app.ch4_require_command_owner(t,j,digest); EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 BEGIN PERFORM app.ch4_require_command_owner(t,j,digest); EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
END;
END
$$;

-- Latest body: packages/db/migrations/0303_job_source_intake.sql
CREATE OR REPLACE FUNCTION app.sv7a_intake_job_source(t uuid,j uuid,digest text,source text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE actor uuid; cid uuid; request_digest text; prior app.command_receipt; allowed text[]; txt text; raw bytea; h text;
 sid uuid:=gen_random_uuid(); ev uuid:=gen_random_uuid(); ver text:=gen_random_uuid()::text; audit_id uuid:=gen_random_uuid();
 at_time timestamptz; ref text; okey text; ctype text; rec_json jsonb; out_result jsonb;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Strict versioned shape; server selects tenant, actor, time, hashes and fixture reference.
 IF source IS NULL OR source NOT IN('diary','customer_message') OR jsonb_typeof(input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_INPUT'; END IF;
 allowed:=CASE WHEN source='diary' THEN ARRAY['version','commandId','entryMode','onSite','text'] ELSE ARRAY['version','commandId','fictionalCustomer','text'] END;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(input) k WHERE NOT k=ANY(allowed)) OR EXISTS(SELECT 1 FROM unnest(allowed) k WHERE NOT input ? k)
  OR input->>'version' IS DISTINCT FROM (CASE WHEN source='diary' THEN 'job-diary-input.v1' ELSE 'customer-message-input.v1' END)
  OR jsonb_typeof(input->'commandId') IS DISTINCT FROM 'string' OR jsonb_typeof(input->'text') IS DISTINCT FROM 'string'
  OR (source='diary' AND (input->>'entryMode' IS NULL OR input->>'entryMode' NOT IN('typed','dictated_text') OR jsonb_typeof(input->'onSite') IS DISTINCT FROM 'boolean'))
  OR (source='customer_message' AND (jsonb_typeof(input->'fictionalCustomer') IS DISTINCT FROM 'object'
   OR (SELECT count(*) FROM jsonb_object_keys(input->'fictionalCustomer'))<>2 OR input->'fictionalCustomer'->>'kind' IS DISTINCT FROM 'named_fictional_customer'
   OR jsonb_typeof(input->'fictionalCustomer'->'name') IS DISTINCT FROM 'string' OR length(btrim(input->'fictionalCustomer'->>'name')) NOT BETWEEN 1 AND 160 OR char_length(input->'fictionalCustomer'->>'name')>160))
 THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_INPUT'; END IF;
 txt:=input->>'text';
 IF char_length(txt) NOT BETWEEN 1 AND 8000 OR octet_length(convert_to(txt,'UTF8'))>32000 OR length(btrim(txt,E' \t\r\n'))=0 THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_INPUT'; END IF;
 BEGIN cid:=(input->>'commandId')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_INPUT'; END;
 ctype:=CASE WHEN source='diary' THEN 'JobSource.diary' ELSE 'JobSource.customer_message' END;
 -- Authority before any informative read; rechecked after every wait (same seam as CH-4 commands).
 BEGIN actor:=app.ch4_require_command_owner(t,j,digest); EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
 -- Evidence registration holds SHARE on the job, matching the merged watchdog live guard.
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtextextended('watchdog-command-id:'||t::text||':'||cid::text,0));
 BEGIN actor:=app.ch4_require_command_owner(t,j,digest); EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
 request_digest:=app.final_lock_hash(jsonb_build_object('jobId',j,'actor',actor,'sessionDigest',digest,'source',source,'input',input));
 IF EXISTS(SELECT 1 FROM app.watchdog_command_identity WHERE tenant_id=t AND command_id=cid AND (job_id<>j OR command_type<>ctype OR request_hash<>request_digest))
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.command_type IS DISTINCT FROM ctype OR prior.request_hash IS DISTINCT FROM request_digest OR prior.actor_membership_id IS DISTINCT FROM actor OR prior.status<>'succeeded' THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result;
 END IF;
 -- New writes only below. Holds precede every effect.
 IF source='diary' AND (input->>'onSite')::boolean THEN RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 PERFORM app.require_watchdog_live(j);
 IF app.ch4_legacy_command_owned(t,cid) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(t,cid,ctype,cid::text,request_digest,'processing',actor);
 INSERT INTO app.watchdog_command_identity(tenant_id,command_id,job_id,command_type,request_hash) VALUES(t,cid,j,ctype,request_digest);
 at_time:=clock_timestamp(); raw:=convert_to(txt,'UTF8'); h:=encode(pg_catalog.sha256(raw),'hex'); okey:='synthetic/job-sources/'||sid::text;
 -- Only the reviewed fictional originals carry a decoder reference; exact text and kind, chosen by the server.
 ref:=CASE WHEN source='diary' AND txt='Fitted outside tap.' THEN 'job-source:outside-tap.v1' WHEN source='customer_message' AND txt='Please fit an outside tap.' THEN 'job-source:request-tap.v1' END;
 INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_received_at,server_verified_at)
 VALUES(ev,t,j,okey,h,'text/plain; charset=utf-8',32000,'standard_evidence',at_time+interval '1 day','verified',ver,at_time,clock_timestamp());
 INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
 VALUES(ev,t,ev,j,'original',CASE WHEN source='diary' THEN 'job_diary_text' ELSE 'customer_message_text' END,okey,ver,h,octet_length(raw),'text/plain; charset=utf-8','standard_evidence',at_time,clock_timestamp());
 INSERT INTO app.job_source_original(tenant_id,job_id,evidence_id,source_kind,source_id,object_key,object_version_id,bytes,sha256,byte_length,source_received_at,verified_at,synthetic_fixture_ref)
 VALUES(t,j,ev,source,sid,okey,ver,raw,h,octet_length(raw),at_time,clock_timestamp(),ref);
 IF source='diary' THEN
  INSERT INTO app.job_diary_entry(tenant_id,job_id,id,command_id,actor_membership_id,entry_mode,on_site,evidence_id,object_version_id,sha256,source_received_at)
  VALUES(t,j,sid,cid,actor,input->>'entryMode',false,ev,ver,h,at_time);
 ELSE
  INSERT INTO app.customer_message_source(tenant_id,job_id,id,command_id,actor_membership_id,fictional_role_name,evidence_id,object_version_id,sha256,source_received_at)
  VALUES(t,j,sid,cid,actor,input->'fictionalCustomer'->>'name',ev,ver,h,at_time);
 END IF;
 rec_json:=jsonb_build_object('id',sid,'commandId',cid,'text',txt,'actualTesterMembershipId',actor,
  'evidence',jsonb_build_object('id',ev,'objectVersionId',ver,'sha256',h,'serverReceivedAt',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
  ||CASE WHEN source='diary' THEN jsonb_build_object('entryMode',input->>'entryMode','onSite',false)
   ELSE jsonb_build_object('fictionalCustomer',jsonb_build_object('kind','named_fictional_customer','name',input->'fictionalCustomer'->>'name')) END;
 out_result:=jsonb_build_object('version','job-source-intake-receipt.v1','jobId',j,'sourceKind',source,'record',rec_json,'environment','synthetic_demo','realExternalActions',0)
  ||CASE WHEN source='diary' THEN jsonb_build_object('notice','Notes are for your records. To bill for extra work, use Log an extra. JobGuard checks your records against your final bill after you complete it.','noticeVersion','job-diary-notice.v1') ELSE '{}'::jsonb END;
 -- Identifiers and hashes only in the audit chain; never the note text.
 -- Same per-tenant chain as other lock/check events; this helper takes any event type (append_final_lock_audit allows only four).
 PERFORM app.append_final_check_audit(audit_id,'membership:'||actor::text,j,CASE WHEN source='diary' THEN 'job_source.diary_recorded' ELSE 'job_source.customer_message_recorded' END,
  jsonb_build_object('commandId',cid,'sourceId',sid,'evidenceId',ev,'sha256',h));
 UPDATE app.command_receipt SET status='succeeded',result=out_result,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=cid;
 BEGIN PERFORM app.ch4_require_command_owner(t,j,digest); EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
 RETURN out_result;
END;
END
$$;

-- Latest body: packages/db/migrations/0306_evidence_pack_v3.sql
CREATE OR REPLACE FUNCTION app.read_evidence_pack_v3(t uuid,c uuid,d text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE j uuid;
BEGIN
 j:=app.evidence_pack_v3_owner(t,c,d);
 RETURN jsonb_build_object('visibleSourceRevision',app.final_lock_hash(app.evidence_pack_v3_ordinary(t,c)),
 'requests',(SELECT coalesce(jsonb_agg(jsonb_build_object('commandId',r.command_id,'finished',EXISTS(SELECT 1 FROM app.evidence_pack_v3 p WHERE p.tenant_id=t AND p.id=r.command_id) OR EXISTS(SELECT 1 FROM app.evidence_pack_v3_approval a WHERE a.tenant_id=t AND a.command_id=r.command_id)) ORDER BY r.requested_at,r.command_id),'[]') FROM app.evidence_pack_v3_request r WHERE r.tenant_id=t AND r.case_id=c),
 'packs',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'artifactText',p.artifact_text,'manifestHash',p.manifest_hash,'contentHash',p.content_hash,'createdAt',p.created_at,'attachmentApprovalRecorded',EXISTS(SELECT 1 FROM app.evidence_pack_v3_approval a WHERE a.tenant_id=t AND a.pack_id=p.id)) ORDER BY p.created_at,p.id),'[]') FROM app.evidence_pack_v3 p WHERE p.tenant_id=t AND p.case_id=c));
END;
END
$$;

-- Latest body: packages/db/migrations/0375_evidence_pack_v3_activation.sql
CREATE OR REPLACE FUNCTION app.request_evidence_pack_v3(t uuid,c uuid,d text,q jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(d,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE j uuid;cid uuid;prior app.evidence_pack_v3_request; actor uuid;
BEGIN
 j:=app.evidence_pack_v3_owner(t,c,d);cid:=(q->>'commandId')::uuid;
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext('pack-v3-command:'||cid::text));
 PERFORM app.evidence_pack_v3_owner(t,c,d);
 SELECT * INTO prior FROM app.evidence_pack_v3_request WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.case_id<>c OR prior.session_digest<>d OR prior.command<>q THEN RAISE EXCEPTION 'EVIDENCE_PACK_COMMAND_CONFLICT'; END IF;
  RETURN;
 END IF;
 IF q->>'version'='evidence-pack-command.v3' THEN
  IF q-ARRAY['version','commandId','format','expectedVisibleSourceRevision']<>'{}'::jsonb OR q->>'format' IS DISTINCT FROM 'TEXT'
  OR q->>'expectedVisibleSourceRevision' IS DISTINCT FROM app.final_lock_hash(app.evidence_pack_v3_ordinary(t,c)) THEN RAISE EXCEPTION 'EVIDENCE_PACK_V3_SOURCE_CONFLICT'; END IF;
 ELSIF q->>'version'='evidence-pack-attachment-approval.v3' THEN
  IF q-ARRAY['version','commandId','packId','expectedManifestHash','expectedContentHash']<>'{}'::jsonb
  OR NOT EXISTS(SELECT 1 FROM app.evidence_pack_v3 WHERE tenant_id=t AND case_id=c AND id=(q->>'packId')::uuid AND manifest_hash=q->>'expectedManifestHash' AND content_hash=q->>'expectedContentHash') THEN RAISE EXCEPTION 'EVIDENCE_PACK_STALE_APPROVAL'; END IF;
 ELSE RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
 SELECT membership_id INTO actor FROM app.authenticate_practice_session(d,t);
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(cid,t,'evidence_pack.v3',cid::text,app.final_lock_hash(jsonb_build_object('caseId',c,'session',d,'command',q)),'succeeded','{}',actor,clock_timestamp())
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'EVIDENCE_PACK_COMMAND_CONFLICT'; END IF;
 INSERT INTO app.evidence_pack_v3_request VALUES(t,j,c,cid,d,q,NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j),clock_timestamp());
 INSERT INTO infrastructure.evidence_pack_v3_request(tenant_id,command_id) VALUES(t,cid);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'system:evidence-pack',j,'evidence_pack.v3_requested',jsonb_build_object('commandId',cid));
END;
END
$$;




-- Latest body: packages/db/migrations/0356_unchecked_job_doors.sql
CREATE OR REPLACE FUNCTION app.create_practice_sandbox_job(p_tenant uuid,p_job uuid,p_actor uuid,p_digest text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor()
  OR p_tenant IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(p_digest,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo'
 THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  OR NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(p_digest,p_tenant) a WHERE a.membership_id=p_actor)
 THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
 INSERT INTO app.lp_job_insert_permit(tenant_id,job_id,backend_pid,transaction_id,operation,insert_shape,actor_membership_id)
 VALUES(p_tenant,p_job,pg_backend_pid(),pg_current_xact_id(),'practice_sandbox',
  app.lp_job_insert_shape(jsonb_populate_record(NULL::app.job,jsonb_build_object('tenant_id',p_tenant,'id',p_job,'title','Practice kitchen',
   'status','quoting','revision',0,'provenance','system_generated_quote','practice_session_digest',p_digest,'practice_scenario','core-1000'))),p_actor);
 INSERT INTO app.job(id,tenant_id,title,status,revision,practice_session_digest,practice_scenario)
 VALUES(p_job,p_tenant,'Practice kitchen','quoting',0,p_digest,'core-1000');
END;
END
$$;

-- Latest body: packages/db/migrations/0456_lp4_database_audit.sql
CREATE OR REPLACE FUNCTION app.decision_check_command(p_digest text,p_command jsonb,p_phase text,p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR (SELECT membership_id FROM app.authenticate_practice_session(p_digest,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid; j uuid; c uuid; actor uuid; owned boolean; prior app.command_receipt;
 request_digest text; revision_number integer; item jsonb; did uuid; fid uuid; added integer:=0; repeated integer:=0;
 seq bigint; prev text; ts timestamptz; payload jsonb; ph text; eh text; actor_ref text;
BEGIN
 -- Authority is established before job existence, phase handling or replay.
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF t IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM 1 FROM control_plane.practice_session s WHERE s.token_digest=p_digest AND s.environment='synthetic_demo'
   AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT a.membership_id INTO actor FROM app.authenticate_practice_session(p_digest,t) a;
 IF actor IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor AND m.role='owner'
   AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF p_command IS NULL OR jsonb_typeof(p_command)<>'object' OR p_command->>'version' IS DISTINCT FROM 'finding-evaluation-command.v1'
   OR p_command - ARRAY['version','commandId','tenantId','jobId'] <> '{}'::jsonb
   OR (p_command->>'tenantId')::uuid IS DISTINCT FROM t OR p_command->>'commandId' IS NULL OR p_command->>'jobId' IS NULL
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 j:=(p_command->>'jobId')::uuid; c:=(p_command->>'commandId')::uuid;
 WITH RECURSIVE owned_job AS (
   SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=p_digest
   UNION
   SELECT next_job.id FROM owned_job source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job'
     AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
   JOIN app.job next_job ON next_job.tenant_id=e.tenant_id AND next_job.id::text=e.subject_ref
     AND next_job.provenance='imported' AND next_job.practice_session_digest IS NULL
 ) SELECT EXISTS(SELECT 1 FROM owned_job WHERE id=j) INTO owned;
 IF NOT owned THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 -- Same lock order on all phases: authority -> job -> command -> receipt -> finding -> audit.
 -- This synthetic builder endpoint does not accept contractor principals or tenants.
 SELECT revision INTO revision_number FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('decision-check:'||t::text||':'||c::text,0));
 request_digest:=app.final_lock_hash(p_command);
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=c FOR UPDATE;
 IF FOUND AND (prior.command_type<>'finding.evaluate' OR prior.request_hash<>request_digest OR prior.actor_membership_id<>actor)
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 IF p_phase='begin' THEN
   IF prior.command_id IS NOT NULL THEN
     IF prior.status<>'succeeded' THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
     RETURN jsonb_build_object('replay',true,'response',prior.result);
   END IF;
   INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id)
     VALUES(c,t,'finding.evaluate','finding-evaluate:'||j::text||':'||c::text,request_digest,'processing',actor);
   RETURN jsonb_build_object('replay',false);
 END IF;
 IF prior.command_id IS NULL OR prior.status<>'processing' OR prior.created_at<>transaction_timestamp()
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 IF p_phase='persist' THEN
   IF p_data IS NULL OR jsonb_typeof(p_data->'findings') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_data->'suppressed') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'findings')>100
   THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(p_data->'findings') LOOP
     IF item->>'version' IS DISTINCT FROM 'finding.v1' OR (item->>'jobId')::uuid IS DISTINCT FROM j
       OR item - ARRAY['version','fingerprint','kind','classification','title','detail','jobId','subjectRef','actionType','suggestionConfidence'] <> '{}'::jsonb
       OR item->>'fingerprint' IS NULL OR item->>'fingerprint' !~ '^[a-f0-9]{64}$'
       OR (item->>'kind'='required_proof' AND item->>'classification' IS DISTINCT FROM 'mandatory')
     THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
     SELECT decision_id,id INTO did,fid FROM app.job_finding WHERE tenant_id=t AND fingerprint=item->>'fingerprint';
     IF FOUND THEN
       IF NOT EXISTS (SELECT 1 FROM app.job_finding f WHERE f.tenant_id=t AND f.id=fid AND f.job_id=j
         AND (f.kind,f.classification,f.title,f.detail,f.subject_ref,f.action_type)=
           (item->>'kind',item->>'classification',item->>'title',item->>'detail',item->>'subjectRef',item->>'actionType'))
       THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
       repeated:=repeated+1;
     ELSE
       did:=gen_random_uuid(); fid:=gen_random_uuid();
       INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
         VALUES(did,t,'finding',item->>'subjectRef',item->>'actionType');
       INSERT INTO app.job_finding(id,tenant_id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,suggestion_confidence,snapshot_revision)
         VALUES(fid,t,j,did,item->>'fingerprint',item->>'kind',item->>'classification',item->>'title',item->>'detail',item->>'subjectRef',item->>'actionType',(item->>'suggestionConfidence')::numeric,revision_number);
       added:=added+1;
     END IF;
     IF (p_data->'suppressed') ? (item->>'fingerprint') THEN
       INSERT INTO app.finding_suppression(id,tenant_id,finding_id,reason,policy_version)
         VALUES(gen_random_uuid(),t,fid,'daily_advisory_budget','decision-suppression.v1') ON CONFLICT(tenant_id,finding_id) DO NOTHING;
     END IF;
   END LOOP;
   RETURN jsonb_build_object('created',added,'replayed',repeated);
 ELSIF p_phase='finish' THEN
   IF p_data->'response' IS NULL OR p_data->'response'->>'version' IS DISTINCT FROM 'decision-inbox.v1'
   THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
   UPDATE app.command_receipt SET status='succeeded',result=p_data->'response',completed_at=clock_timestamp()
     WHERE tenant_id=t AND command_id=c;
   -- Audit allocation is the final new lock. All command/domain writes precede it.

     actor_ref:='membership:'||actor::text;
   payload:=jsonb_build_object('references',jsonb_build_object('commandId',c,'jobId',j));

   PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef',actor_ref,'eventType','finding.checked','subjectType','job','subjectRef',j::text,'payload',payload)),'checked_operation');

   RETURN '{}'::jsonb;
 END IF;
 RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';
END;
END
$$;

-- Latest body: packages/db/migrations/0138_practice_session_hardening.sql
CREATE OR REPLACE FUNCTION app.contractor_admin_command(actor uuid, payload jsonb, request_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; k text:=payload->>'kind'; target uuid; permission text; rev integer; prior app.command_receipt; result jsonb; member uuid; account uuid; user_id uuid; rule_id uuid; contract_revision integer; g record;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF payload->>'version' IS DISTINCT FROM 'contractor-command.v1' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF NOT coalesce(app.contractor_member_active(actor),false) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 permission:='organisation.manage';
 CASE k
 WHEN 'unit.create' THEN target:=(payload->>'parentId')::uuid;
 WHEN 'team.create' THEN target:=(payload->>'branchId')::uuid;
 WHEN 'client.create' THEN target:=(payload->>'branchId')::uuid;
 WHEN 'member.invite' THEN
  target:=(payload->'scope'->>'id')::uuid;
  IF payload->>'role'='client_approver' THEN permission:='client.invite'; target:=(payload->>'clientId')::uuid; END IF;
 WHEN 'grant.create' THEN target:=(payload->'scope'->>'id')::uuid;
 WHEN 'grant.revoke' THEN SELECT scope_id INTO target FROM app.role_grant WHERE tenant_id=t AND id=(payload->>'grantId')::uuid;
 WHEN 'membership.revoke' THEN target:=t;
 WHEN 'team.move' THEN
  target:=(payload->>'toTeamId')::uuid;
  IF payload->>'fromTeamId' IS NOT NULL AND NOT app.contractor_allowed(actor,permission,(payload->>'fromTeamId')::uuid) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 WHEN 'contract.revise' THEN target:=(payload->>'clientId')::uuid; permission:='contract.manage';
 ELSE RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END CASE;
 IF target IS NULL OR NOT coalesce(app.contractor_allowed(actor,permission,target),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=(payload->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.request_hash<>request_hash OR prior.actor_membership_id<>actor THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result;
 END IF;
 IF k IN('grant.create','team.move','membership.revoke') THEN
  member:=(payload->>'membershipId')::uuid;
  IF NOT coalesce(app.contractor_member_active(member),false) OR NOT (
    app.contractor_allowed(actor,'organisation.manage',t) OR EXISTS(
      SELECT 1 FROM app.role_grant x WHERE x.tenant_id=t AND x.membership_id=member
      AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(x.tenant_id,x.id))
      AND app.contractor_allowed(actor,'organisation.manage',x.scope_id)))
  THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 END IF;
 SELECT count(*)::integer INTO rev FROM app.command_receipt WHERE tenant_id=t AND command_type LIKE 'contractor.%';
 IF rev<>(payload->>'expectedRevision')::integer THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 -- Subject IDs are one namespace: contractor_allowed resolves a bare UUID across units, teams and clients,
 -- so a new subject may never reuse an ID that already names another subject (or the tenant). Serialised by the tenant lock above.
 IF k IN('unit.create','team.create','client.create') AND ((payload->>'id')::uuid=t
   OR EXISTS(SELECT 1 FROM app.org_unit WHERE tenant_id=t AND id=(payload->>'id')::uuid)
   OR EXISTS(SELECT 1 FROM app.team WHERE tenant_id=t AND id=(payload->>'id')::uuid)
   OR EXISTS(SELECT 1 FROM app.client_organisation WHERE tenant_id=t AND id=(payload->>'id')::uuid))
 THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 CASE k
 WHEN 'unit.create' THEN INSERT INTO app.org_unit VALUES(t,(payload->>'id')::uuid,payload->>'unitKind',target,CASE payload->>'unitKind' WHEN 'region' THEN 'tenant' ELSE 'region' END,payload->>'name');
 WHEN 'team.create' THEN INSERT INTO app.team(tenant_id,id,branch_id,name) VALUES(t,(payload->>'id')::uuid,target,payload->>'name');
 WHEN 'client.create' THEN INSERT INTO app.client_organisation(tenant_id,id,branch_id,name,client_type) VALUES(t,(payload->>'id')::uuid,target,payload->>'name',payload->>'clientType');
 WHEN 'member.invite' THEN
  IF payload->>'role'='owner' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF payload->>'role'='client_approver' AND ((payload->'scope'->>'kind')<>'client' OR target IS DISTINCT FROM (payload->'scope'->>'id')::uuid OR payload->>'clientId' IS NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  user_id:=gen_random_uuid(); member:=(payload->>'id')::uuid;
  SELECT account_id INTO account FROM app.membership WHERE tenant_id=t AND id=actor;
  INSERT INTO identity.identity_user(id) VALUES(user_id);
  INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(member,t,account,user_id,payload->>'role');
  INSERT INTO app.contractor_member VALUES(t,member,(payload->>'clientId')::uuid,payload->>'email');
  INSERT INTO app.role_grant VALUES(t,gen_random_uuid(),member,payload->>'role',payload->'scope'->>'kind',(payload->'scope'->>'id')::uuid,(payload->>'contractId')::uuid);
  IF payload->'scope'->>'kind'='team' THEN INSERT INTO app.team_membership VALUES(t,gen_random_uuid(),member,(payload->'scope'->>'id')::uuid,1,true); END IF;
 WHEN 'grant.create' THEN
  IF payload->>'role'='owner' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO app.role_grant VALUES(t,(payload->>'id')::uuid,(payload->>'membershipId')::uuid,payload->>'role',payload->'scope'->>'kind',(payload->'scope'->>'id')::uuid,(payload->>'contractId')::uuid);
 WHEN 'grant.revoke' THEN INSERT INTO app.role_grant_revocation VALUES(t,(payload->>'id')::uuid,(payload->>'grantId')::uuid);
 WHEN 'membership.revoke' THEN INSERT INTO app.contractor_membership_revocation VALUES(t,(payload->>'id')::uuid,(payload->>'membershipId')::uuid);
 WHEN 'team.move' THEN
  member:=(payload->>'membershipId')::uuid;
  IF payload->>'fromTeamId'=payload->>'toTeamId' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
  IF payload->>'fromTeamId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.team_membership tm WHERE tm.tenant_id=t AND tm.membership_id=member AND tm.team_id=(payload->>'fromTeamId')::uuid AND tm.active AND tm.revision=(SELECT max(x.revision) FROM app.team_membership x WHERE(x.tenant_id,x.membership_id,x.team_id)=(tm.tenant_id,tm.membership_id,tm.team_id))) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF payload->>'fromTeamId' IS NOT NULL THEN
   INSERT INTO app.team_membership SELECT t,gen_random_uuid(),member,(payload->>'fromTeamId')::uuid,coalesce(max(revision),0)+1,false FROM app.team_membership WHERE tenant_id=t AND membership_id=member AND team_id=(payload->>'fromTeamId')::uuid;
   FOR g IN SELECT * FROM app.role_grant x WHERE x.tenant_id=t AND x.membership_id=member AND x.scope_kind='team' AND x.scope_id=(payload->>'fromTeamId')::uuid AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(x.tenant_id,x.id)) LOOP
    INSERT INTO app.role_grant_revocation VALUES(t,gen_random_uuid(),g.id);
    INSERT INTO app.role_grant VALUES(t,gen_random_uuid(),member,g.role,'team',target,NULL);
   END LOOP;
  END IF;
  INSERT INTO app.team_membership SELECT t,(payload->>'id')::uuid,member,target,coalesce(max(revision),0)+1,true FROM app.team_membership WHERE tenant_id=t AND membership_id=member AND team_id=target;
 WHEN 'contract.revise' THEN
  -- Structured boundary is validated again in the application; SQL rejects incomplete/wrong-version documents.
  IF NOT app.valid_client_contract(payload->'document') OR NOT app.valid_approval_rules(payload->'rules') OR payload->'rules'->>'version' IS DISTINCT FROM 'approval-rules.v1'
   OR jsonb_typeof(payload->'rules'->'bands') IS DISTINCT FROM 'array'
   OR jsonb_array_length(payload->'rules'->'bands')=0
   OR payload->'rules'->'bands'->-1->'upToPence' IS DISTINCT FROM 'null'::jsonb
   OR payload->'rules'->'proceedLimit'->>'currency' IS DISTINCT FROM 'GBP'
   OR NOT coalesce((payload->'rules'->'proceedLimit'->>'pence') ~ '^[0-9]+$',false)
   OR (payload->'rules'->'proceedLimit'->>'pence')::numeric>1000000000000
   OR payload->'document'->>'version' IS DISTINCT FROM 'client-contract.v1'
   OR payload->'document'->>'vatCode' IS DISTINCT FROM 'synthetic-unreviewed'
   THEN RAISE EXCEPTION 'INVALID_RULE_DOCUMENT' USING ERRCODE='22023'; END IF;
  INSERT INTO app.client_contract VALUES(t,(payload->>'contractId')::uuid,target) ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM app.client_contract WHERE tenant_id=t AND id=(payload->>'contractId')::uuid AND client_id=target) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT coalesce(max(revision),0)+1 INTO contract_revision FROM app.client_contract_version WHERE tenant_id=t AND contract_id=(payload->>'contractId')::uuid;
  rule_id:=gen_random_uuid();
  INSERT INTO app.approval_rule_version VALUES(t,rule_id,target,(payload->>'contractId')::uuid,contract_revision,payload->'rules');
  INSERT INTO app.client_contract_version(tenant_id,id,client_id,contract_id,revision,document,rule_version_id) VALUES(t,(payload->>'id')::uuid,target,(payload->>'contractId')::uuid,contract_revision,payload->'document',rule_id);
 END CASE;
 result:=jsonb_build_object('id',payload->>'id','revision',rev+1,'kind',k,'environment','synthetic_demo','realExternalActions',0);
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES((payload->>'commandId')::uuid,t,'contractor.'||k,payload->>'commandId',request_hash,'succeeded',result,actor,clock_timestamp());
 RETURN result;
END;
END
$$;

-- Latest body: packages/db/migrations/0296_enterprise_baseline.sql
CREATE OR REPLACE FUNCTION app.enterprise_baseline_actor(p_session uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 SELECT s.membership_id INTO a FROM app.contractor_session(p_session) s
 WHERE s.tenant_id=t AND app.contractor_member_active(s.membership_id);
 IF a IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN a;
END;
END
$$;

-- Latest body: packages/db/migrations/0456_lp4_database_audit.sql
CREATE OR REPLACE FUNCTION app.enterprise_baseline_import(p_session uuid,p_history text,p_hash text,p_bindings jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; h jsonb:=p_history::jsonb;
 b app.enterprise_baseline_batch; item jsonb; batch uuid:=gen_random_uuid();
 seq bigint; prev text; ts timestamptz; ph text; eh text; payload jsonb;
BEGIN
 a:=app.enterprise_baseline_actor(p_session);
 -- Reuse the existing tenant data.import permission (finance); importing history grants no read scope.
 IF NOT coalesce(app.contractor_allowed(a,'data.import',t),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF h->>'version' IS DISTINCT FROM 'baseline-history.v1' OR h->>'environment' IS DISTINCT FROM 'synthetic_demo'
  OR p_hash IS DISTINCT FROM encode(sha256(convert_to(p_history,'UTF8')),'hex')
  OR jsonb_typeof(h->'teamIds') IS DISTINCT FROM 'array' OR jsonb_typeof(h->'jobs') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_bindings) IS DISTINCT FROM 'array' OR jsonb_array_length(p_bindings) NOT BETWEEN 1 AND 1000
  OR jsonb_array_length(p_bindings)<>jsonb_array_length(h->'teamIds')
  OR jsonb_array_length(h->'jobs')>10000
  OR (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(h->'teamIds') x)<>jsonb_array_length(h->'teamIds')
  OR (SELECT count(DISTINCT x->>'sourceTeamId') FROM jsonb_array_elements(p_bindings) x)<>jsonb_array_length(p_bindings)
  OR (SELECT count(DISTINCT x->>'teamId') FROM jsonb_array_elements(p_bindings) x)<>jsonb_array_length(p_bindings)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_bindings) x WHERE NOT(h->'teamIds' ? (x->>'sourceTeamId'))
    OR NOT EXISTS(SELECT 1 FROM app.team z WHERE z.tenant_id=t AND z.id=(x->>'teamId')::uuid))
 THEN RAISE EXCEPTION 'BASELINE_INVALID' USING ERRCODE='23514'; END IF;
 -- Defense in depth for the stored observation window; the server's versioned parser validates all job/extra fields.
 IF coalesce(h->>'startMonth','') !~ '^(20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])$'
  OR coalesce(h->>'endMonthExclusive','') !~ '^(20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])$'
 THEN RAISE EXCEPTION 'BASELINE_INVALID' USING ERRCODE='23514'; END IF;
 IF ((left(h->>'endMonthExclusive',4)::int-left(h->>'startMonth',4)::int)*12
  +right(h->>'endMonthExclusive',2)::int-right(h->>'startMonth',2)::int) NOT BETWEEN 6 AND 12
 THEN RAISE EXCEPTION 'BASELINE_INVALID' USING ERRCODE='23514'; END IF;
 -- Serialize source identity before uniqueness/replay inspection; organization fence precedes source, audit last.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||(h->>'sourceNamespace')||':'||(h->>'sourceBatchId'),9275));
 SELECT * INTO b FROM app.enterprise_baseline_batch WHERE tenant_id=t AND source_namespace=h->>'sourceNamespace' AND source_batch_id=h->>'sourceBatchId';
 IF FOUND THEN
  IF b.source_hash<>p_hash OR b.history<>h OR
   (SELECT jsonb_agg(jsonb_build_object('sourceTeamId',source_team_id,'teamId',team_id) ORDER BY source_team_id COLLATE "C") FROM app.enterprise_baseline_team WHERE tenant_id=t AND batch_id=b.id) IS DISTINCT FROM p_bindings
  THEN RAISE EXCEPTION 'BASELINE_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('batchId',b.id,'sourceHash',b.source_hash,'replayed',true);
 END IF;
 INSERT INTO app.enterprise_baseline_batch(tenant_id,id,source_namespace,source_batch_id,source_hash,history,canonical_history,actor_membership_id)
 VALUES(t,batch,h->>'sourceNamespace',h->>'sourceBatchId',p_hash,h,p_history,a);
 FOR item IN SELECT value FROM jsonb_array_elements(p_bindings) LOOP
  INSERT INTO app.enterprise_baseline_team VALUES(t,batch,item->>'sourceTeamId',(item->>'teamId')::uuid);
 END LOOP;
 payload:=jsonb_build_object('references',jsonb_build_object('batch',batch::text,'environment','synthetic_demo'),'hashes',jsonb_build_object('source',p_hash));



 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||a::text,'eventType','enterprise.baseline.imported','subjectType','baseline','subjectRef',batch::text,'payload',payload)),'checked_operation');

 RETURN jsonb_build_object('batchId',batch,'sourceHash',p_hash,'replayed',false);
END;
END
$$;

-- Latest body: packages/db/migrations/0296_enterprise_baseline.sql
CREATE OR REPLACE FUNCTION app.enterprise_baseline_read(p_session uuid,p_batch uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; h jsonb;
BEGIN
 a:=app.enterprise_baseline_actor(p_session);
 SELECT b.history INTO h FROM app.enterprise_baseline_batch b WHERE b.tenant_id=t AND b.id=p_batch
  AND EXISTS(SELECT 1 FROM app.enterprise_baseline_team m WHERE(m.tenant_id,m.batch_id)=(t,b.id))
  AND NOT EXISTS(SELECT 1 FROM app.enterprise_baseline_team m WHERE(m.tenant_id,m.batch_id)=(t,b.id)
    AND NOT coalesce(app.contractor_allowed(a,'dashboard.read',m.team_id),false));
 IF h IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN h;
END;
END
$$;

-- Latest body: packages/db/migrations/0496_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.record_repository_command(p_command uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR (SELECT actor_membership_id FROM app.command_receipt WHERE tenant_id=app.current_tenant() AND command_id=p_command) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim;
 r app.command_receipt; v jsonb; result jsonb; kind text;
BEGIN
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF c.command_id IS NULL OR c.version<>'repository-command.v1' OR c.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR r.status IS DISTINCT FROM 'processing'
  OR NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=c.actor_membership_id AND role='owner'
    AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 v:=(c.significant_input->'input');
 IF r.command_type='commercial_integrity.review' THEN
  IF (v-ARRAY['jobId','version','commandId','findingKey','explanation','outcome'])<>'{}'
   OR NOT(v ?& ARRAY['jobId','version','commandId','findingKey','explanation','outcome'])
   OR (v->>'version') IS DISTINCT FROM 'commercial-integrity-review.v1' OR (v->>'commandId')<>p_command::text
   OR (v->>'jobId') IS DISTINCT FROM (c.resource->>'subjectRef') OR (v->>'outcome')<>'dismissed_false_positive'
   OR jsonb_typeof(v->'findingKey') IS DISTINCT FROM 'string' OR length(v->>'findingKey')<1
   OR jsonb_typeof(v->'explanation') IS DISTINCT FROM 'string' OR length(v->>'explanation') NOT BETWEEN 1 AND 500 THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  kind:='feedback'; result:=v||jsonb_build_object('recordedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 ELSIF r.command_type='synthetic_demo.seed' THEN
  IF (v-ARRAY['version','commandId','semanticKey','tenantId','jobId','scopeItemId','checkpoint','amount'])<>'{}'
   OR (v->>'version') IS DISTINCT FROM 'demo-seed-command.v1' OR (v->>'commandId') IS DISTINCT FROM p_command::text
   OR t<>'11111111-1111-4111-8111-111111111111'::uuid OR (v->>'tenantId') IS DISTINCT FROM t::text
   OR (v->>'jobId') IS DISTINCT FROM (c.resource->>'subjectRef') OR (v->>'jobId')<>'d1500000-0000-4000-8000-000000000150'
   OR (v->>'scopeItemId') IS DISTINCT FROM 'd1500000-0000-4000-8000-000000001500'
   OR (v->>'checkpoint') IS NULL OR (v->>'checkpoint') NOT IN('capture','review_confirm','quote_sent','accepted','live','decision',
     'verified_proof','approved_extra','final_account','issued_invoice','recorded_payment','fee_illustration')
   OR r.semantic_key IS DISTINCT FROM 'm1-15.demo-seed.v1:'||(v->>'checkpoint')
   OR (v->>'semanticKey') IS DISTINCT FROM r.semantic_key
   OR (v->'amount') IS DISTINCT FROM (CASE WHEN (v->>'checkpoint')='recorded_payment'
      THEN '{"pence":150000,"currency":"GBP"}'::jsonb ELSE 'null'::jsonb END) THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  kind:='demo_checkpoint'; result:=jsonb_build_object('checkpoint',(v->>'checkpoint'));
 ELSE RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 INSERT INTO app.repository_operational_record(tenant_id,command_id,job_id,actor_membership_id,record_kind,result)
 VALUES(t,p_command,(c.resource->>'subjectRef')::uuid,c.actor_membership_id,kind,result);
END;
END
$$;

-- Latest body: packages/db/migrations/0496_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.lp5b_prepare_projection(p_command uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR (SELECT actor_membership_id FROM app.command_receipt WHERE tenant_id=app.current_tenant() AND command_id=p_command) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim;
 r app.command_receipt; v jsonb; j uuid; b uuid; refs jsonb; ids jsonb; at_time timestamptz:=clock_timestamp();
 q bigint; watch app.counterparty_check; expected_count integer; actual_count integer; preference_actor text;
BEGIN
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF c.command_id IS NULL OR r.status IS DISTINCT FROM 'processing' OR c.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR c.effect_ref IS NOT NULL OR c.outcome IS NOT NULL THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 j:=(c.resource->>'subjectRef')::uuid; v:=(c.significant_input->'input');
 IF r.command_type='prevention.check' THEN
  IF (v->>'job')::uuid IS DISTINCT FROM j THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  v:=(v->'input'); b:=(v->>'expectedBindingId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM app.job_party_current WHERE tenant_id=t AND job_id=j AND binding_id=b) THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  IF (v->>'action')='property' THEN
   SELECT count(*) INTO actual_count FROM app.property_constraint_fact
    WHERE tenant_id=t AND job_id=j AND command_id=p_command AND binding_id=b AND xmin::text=pg_current_xact_id()::text;
   expected_count:=5;
  ELSE
   expected_count:=(CASE (v->>'action') WHEN 'evaluate_watch' THEN 2 WHEN 'company' THEN 1 WHEN 'start_watch' THEN 1 WHEN 'stop_watch' THEN 1 ELSE -1 END);
   SELECT count(*) INTO actual_count FROM app.counterparty_check
    WHERE tenant_id=t AND job_id=j AND command_id=p_command AND binding_id=b AND xmin::text=pg_current_xact_id()::text
     AND (((v->>'action')='company' AND kind='company')
      OR ((v->>'action')='evaluate_watch' AND kind IN('companies_house_feed','gazette_feed') AND watch_revision=(v->>'expectedWatchRevision')::integer)
      OR ((v->>'action')='start_watch' AND kind='watch_start' AND watch_revision=(v->>'expectedWatchRevision')::integer+1)
      OR ((v->>'action')='stop_watch' AND kind='watch_stop' AND watch_revision=(v->>'expectedWatchRevision')::integer+1));
  END IF;
  IF actual_count IS DISTINCT FROM expected_count THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  refs:=jsonb_build_object('bindingId',b,'retrievedAt',to_char(date_trunc('milliseconds',at_time) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'latestCustomerRevisionId',(SELECT cr.id FROM app.job_party_binding pb JOIN app.customer_revision cr
    ON(cr.tenant_id,cr.customer_id)=(pb.tenant_id,pb.customer_id) WHERE pb.tenant_id=t AND pb.id=b ORDER BY cr.revision DESC LIMIT 1));
  SELECT coalesce(jsonb_agg(x.id ORDER BY x.kind),'[]'::jsonb) INTO ids FROM(
   SELECT DISTINCT ON(kind) id,kind FROM app.property_constraint_fact
    WHERE tenant_id=t AND job_id=j AND binding_id=b ORDER BY kind,created_at DESC,id DESC) x;
  refs:=refs||jsonb_build_object('propertyIds',ids,'companyId',(SELECT id FROM app.counterparty_check
   WHERE tenant_id=t AND job_id=j AND binding_id=b AND kind='company' ORDER BY created_at DESC,id DESC LIMIT 1));
  SELECT * INTO watch FROM app.counterparty_check WHERE tenant_id=t AND job_id=j AND binding_id=b
   AND kind IN('watch_start','watch_stop') ORDER BY watch_revision DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(x.id ORDER BY x.kind),'[]'::jsonb) INTO ids FROM(
   SELECT DISTINCT ON(kind) id,kind FROM app.counterparty_check WHERE tenant_id=t AND job_id=j AND binding_id=b
    AND watch_revision=watch.watch_revision AND kind IN('companies_house_feed','gazette_feed') ORDER BY kind,created_at DESC,id DESC) x;
  refs:=refs||jsonb_build_object('watchId',watch.id,'feedIds',ids);
 ELSIF r.command_type='inbox.seed' THEN
  IF (v-ARRAY['jobId','membershipId','commandType','practiceDigest'])<>'{}' OR (v->>'commandType')<>'inbox.seed'
   OR (v->>'jobId')::uuid IS DISTINCT FROM j OR (v->>'membershipId')::uuid IS DISTINCT FROM c.actor_membership_id
   OR NOT EXISTS(SELECT 1 FROM app.watchdog_command_identity WHERE tenant_id=t AND command_id=p_command AND job_id=j AND command_type='inbox.seed')
   OR NOT EXISTS(SELECT 1 FROM app.inbox_finding_revision WHERE tenant_id=t AND job_id=j) THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  SELECT coalesce(max(sequence),0) INTO q FROM app.audit_event WHERE tenant_id=t;
  preference_actor:=(CASE WHEN (v ? 'practiceDigest') THEN 'practice-session:'||(v->>'practiceDigest') ELSE 'member:synthetic-builder' END);
  SELECT coalesce(jsonb_agg(id ORDER BY lane,created_at,id),'[]'::jsonb) INTO ids
   FROM app.inbox_decision_revision WHERE tenant_id=t AND job_id=j;
  refs:=jsonb_build_object('decisionIds',ids,'asOfSequence',q,'preferenceId',
   (SELECT p.id FROM app.inbox_preference_revision p JOIN app.audit_event e ON(e.tenant_id,e.id)=(p.tenant_id,p.audit_event_id)
    WHERE p.tenant_id=t AND p.membership_id=c.actor_membership_id AND p.actor_ref=preference_actor AND e.sequence<=q ORDER BY p.revision DESC LIMIT 1));
  IF NOT EXISTS(SELECT 1 FROM app.inbox_finding_revision WHERE tenant_id=t AND job_id=j AND xmin::text=pg_current_xact_id()::text) THEN
   refs:=refs||jsonb_build_object('noopReason','inbox_already_seeded'); END IF;
 ELSE RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
 END IF;
 UPDATE app.command_lifecycle_claim SET effect_ref=refs WHERE tenant_id=t AND command_id=p_command;
END;
END
$$;

-- Latest body: packages/db/migrations/0496_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.lp5b_contractor_permission(p_type text,p_actor uuid,p_job uuid,p_input jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 v jsonb:=(CASE WHEN (p_input ? 'content') THEN (p_input->'content') ELSE p_input END);
 role_name text; allowed boolean; roles text[]; step jsonb; req app.extra_approval_request;
BEGIN
 IF NOT coalesce(app.contractor_member_active(p_actor),false) THEN
  RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 SELECT role INTO role_name FROM app.membership WHERE tenant_id=t AND id=p_actor;
 IF (v->>'jobId')::uuid IS DISTINCT FROM p_job
  OR ((p_input ? 'actor') AND (p_input->>'actor')::uuid IS DISTINCT FROM p_actor)
  OR ((p_input ? 'actorMembershipId') AND (p_input->>'actorMembershipId')::uuid IS DISTINCT FROM p_actor)
  OR ((p_input ? 'membershipId') AND (p_input->>'membershipId')::uuid IS DISTINCT FROM p_actor) THEN
  RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 IF p_type IN('StartSiteVisit','CompleteSiteVisit') THEN
  SELECT count(*)=1 AND bool_and(decision='allowed' AND reason_code='allowed') INTO allowed
   FROM app.ent3b_visit_authority(p_actor,p_job);
  IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_type='CompleteSiteVisit' AND NOT EXISTS(SELECT 1 FROM app.site_visit
   WHERE tenant_id=t AND id=(v->>'visitId')::uuid AND job_id=p_job AND membership_id=p_actor) THEN
   RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  RETURN;
 END IF;
 -- The lower-level ExtraRepository retains its original provenance rule. Its
 -- public SiteExtra caller adds ENT-3a role/live/assignment/evidence checks.
 IF NOT(p_input ? 'content') THEN
  IF p_type='ConfirmPrompt' THEN RAISE EXCEPTION 'PROMPT_ORIGIN_HELD' USING ERRCODE='23514'; END IF;
  IF p_type IN('LogSiteExtra','RecordOfficeExtra','RecordClientInstruction') AND (v ? 'grantId') THEN
   SELECT EXISTS(SELECT 1 FROM app.role_grant g
    JOIN app.team team ON team.tenant_id=t AND team.id=app.contractor_job_team(p_job)
    JOIN app.org_unit branch ON(branch.tenant_id,branch.id)=(team.tenant_id,team.branch_id)
    WHERE g.tenant_id=t AND g.id=(v->>'grantId')::uuid AND g.membership_id=p_actor AND g.role=role_name
     AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
     AND ((g.scope_kind='tenant' AND g.scope_id=t) OR (g.scope_kind='team' AND g.scope_id=team.id)
      OR (g.scope_kind='branch' AND g.scope_id=branch.id) OR (g.scope_kind='region' AND g.scope_id=branch.parent_id))) INTO allowed;
   IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
   RETURN;
  ELSIF p_type IN('MarkDuplicate','RecordClientInstruction') THEN
   -- These existing low-level link primitives have tenant/member authority;
   -- their structural graph/order guards remain authoritative at mutation.
   RETURN;
  ELSIF p_type='UnlinkDuplicate' THEN
   IF NOT coalesce(app.contractor_job_allowed(p_actor,'organisation.manage',p_job)
     OR app.contractor_job_allowed(p_actor,'extra.price',p_job),false) THEN
    RAISE EXCEPTION 'UNLINK_FORBIDDEN' USING ERRCODE='42501'; END IF;
   RETURN;
  END IF;
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
 END IF;
 IF (p_input->>'type') IS DISTINCT FROM p_type THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 CASE p_type
 WHEN 'SubmitExtra' THEN
  allowed:=app.xa_covers(p_actor,ARRAY['supervisor','surveyor'],p_job,'job.read') IS NOT NULL
   OR (role_name='operative' AND EXISTS(SELECT 1 FROM app.extra_origin o JOIN app.extra_sor_revision s
    ON(s.tenant_id,s.job_id,s.variation_id)=(o.tenant_id,o.job_id,o.variation_id)
    WHERE o.tenant_id=t AND o.job_id=p_job AND o.variation_id=(v->>'extraId')::uuid AND o.raising_membership_id=p_actor)
    AND coalesce(app.contractor_job_allowed(p_actor,'extra.log',p_job),false));
 WHEN 'PriceExtra','ReviseExtra' THEN allowed:=app.xa_covers(p_actor,ARRAY['surveyor'],p_job,'extra.price') IS NOT NULL;
 WHEN 'WithdrawExtra' THEN allowed:=app.xa_covers(p_actor,ARRAY['supervisor'],p_job,'job.read') IS NOT NULL;
 WHEN 'MarkDuplicate' THEN allowed:=app.xa_covers(p_actor,ARRAY['supervisor','surveyor','commercial_manager'],p_job,'job.read') IS NOT NULL;
 WHEN 'RevokeClientApproval' THEN allowed:=role_name='owner';
 WHEN 'ApproveExtraStep','RejectExtra' THEN
  SELECT * INTO req FROM app.extra_approval_request WHERE tenant_id=t AND job_id=p_job AND id=(v->>'requestId')::uuid;
  IF req.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  step:=(req.requirement->'steps')->(v->>'stepIndex')::integer;
  -- Replay uses the original step, not the current next-step count. Transition
  -- checks (already decided/self/separation) still belong to xa_approve.
  roles:=ARRAY[(step->>'role')];
  IF EXISTS(SELECT 1 FROM app.extra_escalation_fact WHERE tenant_id=t AND request_id=req.id AND step_index=(v->>'stepIndex')::integer) THEN
   roles:=roles||(step->>'escalationRole')||ARRAY(SELECT jsonb_array_elements_text(step->'alternateRoles')); END IF;
  allowed:=(step->>'kind')='human' AND (step->>'role')<>'client_approver'
   AND app.xa_covers(p_actor,roles,p_job,'extra.approve') IS NOT NULL;
 WHEN 'ClientDecideExtra' THEN
  PERFORM app.xa_client_view_authority(p_job,(v->>'requestId')::uuid,p_actor,(v->>'email'));
  IF NOT EXISTS(SELECT 1 FROM app.extra_client_link WHERE tenant_id=t AND job_id=p_job
   AND request_id=(v->>'requestId')::uuid AND approver_membership_id=p_actor AND token_hash=(v->>'token')) THEN
   RAISE EXCEPTION 'LINK_INVALID' USING ERRCODE='42501'; END IF;
  -- A successful exact replay keeps its own decided link identity; expiry and
  -- closure are first-execution transition rules, not current membership rules.
  allowed:=true;
 ELSE RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
 END CASE;
 IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
END;
END
$$;

-- Latest body: packages/db/migrations/0165_practice_worker_switch.sql
CREATE OR REPLACE FUNCTION app.practice_worker_switch_on(p_session uuid,p_command uuid,p_worker uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid; live record; rule record; saved control_plane.practice_worker_switch; marker control_plane.practice_company_marker; reading timestamptz; replay boolean:=false;
BEGIN

 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_session IS NULL OR p_command IS NULL OR p_worker IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END;
 SELECT * INTO live FROM app.contractor_practice_session_live(p_session);
 IF NOT FOUND OR t IS NULL OR t IS DISTINCT FROM live.tenant_id THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;

 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(live.session_ref::text,16501));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command::text,16502));

 SELECT * INTO saved FROM control_plane.practice_worker_switch s WHERE s.command_id=p_command OR s.end_command_id=p_command;
 IF FOUND THEN
  IF saved.command_id=p_command AND saved.session_ref=live.session_ref AND saved.worker_membership_id=p_worker THEN
   replay:=true; SELECT * INTO marker FROM control_plane.practice_company_marker k WHERE k.tenant_id=t;
   RETURN jsonb_build_object('switch',saved.id,'session',saved.session_ref,'owner',saved.owner_membership_id,'worker',saved.worker_membership_id,
 'startedAt',to_char(saved.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'expiresAt',to_char(saved.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'marker',(CASE WHEN saved.started_at=marker.marked_at THEN 'acquired' ELSE 'present' END),'state','acting','replayed',replay);
  END IF;
  RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505';
 END IF;
 BEGIN SELECT * INTO STRICT rule FROM app.practice_worker_switch_decision(live.session_ref,p_worker);
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END;
 IF rule.decision IS NULL OR rule.decision NOT IN('allowed','not_found') THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO marker FROM control_plane.practice_company_marker k WHERE k.tenant_id=t;
 IF FOUND AND (marker.session_ref IS DISTINCT FROM live.session_ref OR marker.owner_membership_id IS DISTINCT FROM live.membership_id OR marker.owner_identity_user_id IS DISTINCT FROM live.identity_user_id)
 THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM control_plane.practice_worker_switch s WHERE s.session_ref=live.session_ref AND s.ended_at IS NULL)
 THEN RAISE EXCEPTION 'SWITCH_OPEN' USING ERRCODE='55000'; END IF;
 IF rule.decision='not_found' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 reading:=clock_timestamp();
 IF marker.tenant_id IS NULL THEN
  INSERT INTO control_plane.practice_company_marker(tenant_id,session_ref,owner_membership_id,owner_identity_user_id,marked_at)
   VALUES(rule.company,live.session_ref,rule.owner_member,rule.owner_user,reading) RETURNING * INTO marker;
 END IF;
 INSERT INTO control_plane.practice_worker_switch(id,session_ref,tenant_id,owner_membership_id,worker_membership_id,worker_identity_user_id,command_id,started_at,expires_at)
 VALUES(gen_random_uuid(),live.session_ref,rule.company,rule.owner_member,p_worker,rule.worker_user,p_command,reading,reading+interval '30 minutes') RETURNING * INTO saved;
 RETURN jsonb_build_object('switch',saved.id,'session',saved.session_ref,'owner',saved.owner_membership_id,'worker',saved.worker_membership_id,
 'startedAt',to_char(saved.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'expiresAt',to_char(saved.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'marker',(CASE WHEN saved.started_at=marker.marked_at THEN 'acquired' ELSE 'present' END),'state','acting','replayed',replay);
END;
END
$$;

-- Latest body: packages/db/migrations/0165_practice_worker_switch.sql
CREATE OR REPLACE FUNCTION app.practice_worker_switch_off(p_session uuid,p_command uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid; live record; saved control_plane.practice_worker_switch; reading timestamptz; replay boolean:=false;
BEGIN

 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_session IS NULL OR p_command IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END;
 SELECT * INTO live FROM app.contractor_practice_session_live(p_session);
 IF NOT FOUND OR t IS NULL OR t IS DISTINCT FROM live.tenant_id THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;

 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(live.session_ref::text,16501));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command::text,16502));

 SELECT * INTO saved FROM control_plane.practice_worker_switch s WHERE s.command_id=p_command OR s.end_command_id=p_command;
 IF FOUND THEN
  IF saved.end_command_id=p_command AND saved.session_ref=live.session_ref THEN replay:=true; RETURN jsonb_build_object('switch',saved.id,'session',saved.session_ref,'owner',saved.owner_membership_id,'worker',saved.worker_membership_id,
 'endedAt',to_char(saved.ended_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'endReason',saved.end_reason,'endEvent',saved.end_event_id,'state','owner','replayed',replay); END IF;
  RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505';
 END IF;
 SELECT * INTO saved FROM control_plane.practice_worker_switch s WHERE s.session_ref=live.session_ref AND s.ended_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ACTING' USING ERRCODE='55000'; END IF;
 reading:=clock_timestamp();
 UPDATE control_plane.practice_worker_switch s SET ended_at=least(reading,s.expires_at),
  end_reason=(CASE WHEN reading<s.expires_at THEN 'switched_back' ELSE 'expired' END),end_command_id=p_command,end_event_id=gen_random_uuid()
 WHERE s.id=saved.id RETURNING * INTO saved;
 RETURN jsonb_build_object('switch',saved.id,'session',saved.session_ref,'owner',saved.owner_membership_id,'worker',saved.worker_membership_id,
 'endedAt',to_char(saved.ended_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'endReason',saved.end_reason,'endEvent',saved.end_event_id,'state','owner','replayed',replay);
END;
END
$$;

-- Latest body: packages/db/migrations/0165_practice_worker_switch.sql
CREATE OR REPLACE FUNCTION app.practice_worker_switch_state(p_session uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid; live record; saved control_plane.practice_worker_switch; answer text:='owner';
BEGIN

 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;

 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END;
 SELECT * INTO live FROM app.contractor_practice_session_live(p_session);
 IF NOT FOUND OR t IS NULL OR t IS DISTINCT FROM live.tenant_id THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;

 SELECT * INTO saved FROM control_plane.practice_worker_switch s WHERE s.session_ref=live.session_ref AND s.ended_at IS NULL;
 IF FOUND THEN
  answer:='unclosed';
  IF EXISTS(SELECT 1 FROM app.contractor_session(p_session) l WHERE l.tenant_id=t AND l.membership_id=saved.worker_membership_id) THEN answer:='acting'; END IF;
 END IF;
 RETURN jsonb_build_object('state',answer,'switch',saved.id,'worker',saved.worker_membership_id,
 'startedAt',to_char(saved.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'expiresAt',to_char(saved.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END;
END
$$;

-- Latest body: packages/db/migrations/0138_practice_session_hardening.sql
CREATE OR REPLACE FUNCTION app.revoke_contractor_practice_session(s uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(s) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE requested uuid; target control_plane.contractor_practice_session; reading timestamptz;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  requested:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN requested:=NULL;
 END;
 SELECT x.* INTO target FROM control_plane.contractor_practice_session x WHERE x.session_digest=app.contractor_practice_session_digest(s) FOR UPDATE;
 reading:=clock_timestamp();
 -- The only repetition of the row's live tests: store the exact reading tested.
 IF s IS NULL OR target.session_id IS NULL OR requested IS NULL OR requested IS DISTINCT FROM target.tenant_id
  OR target.revoked_at IS NOT NULL OR target.expires_at<=reading OR app.contractor_practice_home_deadline(target.session_digest,reading)<=reading
 THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 UPDATE control_plane.contractor_practice_session x SET revoked_at=reading WHERE x.session_id=target.session_id;
 RETURN jsonb_build_object('session',target.session_id,'member',target.membership_id,'revokedAt',to_char(reading AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END;
END
$$;

-- Latest body: packages/db/migrations/0167_northside_run_attribution.sql
CREATE OR REPLACE FUNCTION app.northside_register(p_owner uuid,p_settings jsonb) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_owner IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; own control_plane.contractor_practice_session; rule record; added integer;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO own FROM control_plane.contractor_practice_session WHERE tenant_id=t AND membership_id=p_owner;
 IF NOT FOUND OR own.revoked_at IS NOT NULL OR own.expires_at<=clock_timestamp()
  OR app.contractor_practice_home_deadline(own.session_digest,clock_timestamp())<=clock_timestamp()
 THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(own.session_id::text,16501));
 SELECT * INTO STRICT rule FROM app.practice_company_made_up(own.session_id);
 IF rule.verdict IS DISTINCT FROM 'made_up' OR EXISTS(SELECT 1 FROM control_plane.practice_worker_switch WHERE session_ref=own.session_id AND ended_at IS NULL)
 THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_settings->>'version' IS DISTINCT FROM 'northside-settings.v1' OR p_settings->>'classification' IS DISTINCT FROM 'demo_settings'
 THEN RAISE EXCEPTION 'NORTHSIDE_SETTINGS_INVALID' USING ERRCODE='22023'; END IF;
 INSERT INTO app.northside_run(tenant_id,session_ref,owner_membership_id,owner_identity_user_id,settings_version,settings_hash,settings)
 VALUES(t,own.session_id,own.membership_id,own.identity_user_id,p_settings->>'version',encode(sha256(convert_to(p_settings::text,'UTF8')),'hex'),p_settings)
 ON CONFLICT(tenant_id) DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;
 IF NOT EXISTS(SELECT 1 FROM app.northside_run WHERE tenant_id=t AND settings=p_settings AND session_ref=own.session_id)
 THEN RAISE EXCEPTION 'NORTHSIDE_SETTINGS_CONFLICT' USING ERRCODE='23514'; END IF;
 RETURN added=1;
END;
END
$$;

-- Latest body: packages/db/migrations/0158_extra_approval_chain.sql
CREATE OR REPLACE FUNCTION app.xa_escalate() RETURNS TABLE(request_id uuid, job_id uuid, variation_id uuid, step_index integer, eligible_roles text[])
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
#variable_conflict use_column

BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;


DECLARE v_tenant uuid; q app.extra_approval_request; v_n integer; v_step jsonb; v_started timestamptz; v_roles text[]; v_id uuid;
BEGIN
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN v_tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_tenant:=NULL; END;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 FOR q IN SELECT r.* FROM app.extra_approval_request r WHERE r.tenant_id=v_tenant AND r.net_pence IS NOT NULL
   AND r.request_revision=(SELECT max(x.request_revision) FROM app.extra_approval_request x WHERE x.tenant_id=r.tenant_id AND x.variation_id=r.variation_id)
   AND NOT EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(r.tenant_id,r.id)) ORDER BY r.server_recorded_at,r.id LOOP
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text||':'||q.job_id::text,417));
  IF EXISTS(SELECT 1 FROM app.extra_approval_outcome o WHERE(o.tenant_id,o.request_id)=(q.tenant_id,q.id)) THEN CONTINUE; END IF;
  SELECT count(*),max(f.server_recorded_at) INTO v_n,v_started FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(q.tenant_id,q.id);
  v_started:=coalesce(v_started,q.server_recorded_at); v_step:=q.requirement->'steps'->v_n;
  CONTINUE WHEN v_step IS NULL OR v_step->>'kind'<>'human' OR v_step->>'role'='client_approver';
  CONTINUE WHEN clock_timestamp()<v_started+((v_step->>'timeLimitMinutes')::numeric*interval '1 minute');
  v_roles:=ARRAY[v_step->>'escalationRole']||ARRAY(SELECT jsonb_array_elements_text(v_step->'alternateRoles'));
  INSERT INTO app.extra_escalation_fact(tenant_id,id,job_id,variation_id,request_id,step_index,eligible_roles) VALUES(q.tenant_id,pg_catalog.gen_random_uuid(),q.job_id,q.variation_id,q.id,v_n,v_roles)
  ON CONFLICT(tenant_id,request_id,step_index) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN request_id:=q.id; job_id:=q.job_id; variation_id:=q.variation_id; step_index:=v_n; eligible_roles:=v_roles; RETURN NEXT; END IF;
  v_id:=NULL;
 END LOOP;
END;
END
$$;

-- Latest body: packages/db/migrations/0139_site_visit_closeout.sql
CREATE OR REPLACE FUNCTION app.ent3b_visit_authority(p_actor uuid, p_job uuid)
RETURNS TABLE(decision text, reason_code text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

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
END;
END
$$;

-- Latest body: packages/db/migrations/0135_site_extra_authority.sql
CREATE OR REPLACE FUNCTION app.ent3a_extra_authority(p_actor uuid, p_command_type text, p_job uuid)
RETURNS TABLE(decision text, reason_code text, raising_grant uuid)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE tenant uuid; member_role text; permission text; named_required boolean; chosen uuid;
BEGIN
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL OR p_actor IS NULL THEN
  RETURN QUERY SELECT 'forbidden'::text,'member_inactive'::text,NULL::uuid; RETURN;
 END IF;
 IF NOT coalesce(app.contractor_member_active(p_actor),false) THEN
  RETURN QUERY SELECT 'forbidden'::text,'member_inactive'::text,NULL::uuid; RETURN;
 END IF;
 IF p_command_type IS NULL OR p_command_type NOT IN('LogSiteExtra','RecordOfficeExtra','RecordClientInstruction') THEN
  RETURN QUERY SELECT 'forbidden'::text,'command_type_not_permitted'::text,NULL::uuid; RETURN;
 END IF;
 SELECT m.role INTO member_role FROM app.membership m WHERE m.tenant_id=tenant AND m.id=p_actor;
 -- Only new authority facts. Permission scope and operative assignment remain ENT-2's decision.
 SELECT rule.permission,rule.named_required INTO permission,named_required FROM (VALUES
  ('LogSiteExtra','operative','extra.log',true),
  ('LogSiteExtra','supervisor','extra.log',false),
  ('LogSiteExtra','surveyor','job.read',false),
  ('RecordOfficeExtra','owner','organisation.manage',false),
  ('RecordOfficeExtra','admin','organisation.manage',false),
  ('RecordOfficeExtra','finance','data.import',false),
  ('RecordClientInstruction','owner','contract.manage',false),
  ('RecordClientInstruction','admin','contract.manage',false),
  ('RecordClientInstruction','commercial_manager','contract.manage',false)
 ) AS rule(command_type,role,permission,named_required)
 WHERE rule.command_type=p_command_type AND rule.role=member_role;
 IF permission IS NULL THEN
  RETURN QUERY SELECT 'forbidden'::text,'role_not_permitted'::text,NULL::uuid; RETURN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job j
  JOIN app.job_commercial_track track ON(track.tenant_id,track.job_id)=(j.tenant_id,j.id)
  JOIN app.work_order w ON(w.tenant_id,w.job_id)=(j.tenant_id,j.id)
  JOIN app.work_order_current current_revision ON(current_revision.tenant_id,current_revision.work_order_id)=(w.tenant_id,w.id)
  JOIN app.work_order_revision revision ON(revision.tenant_id,revision.work_order_id,revision.id)=(w.tenant_id,w.id,current_revision.revision_id)
  WHERE j.tenant_id=tenant AND j.id=p_job AND j.provenance='work_order'
   AND track.job_track='contractor' AND track.environment='synthetic_demo' AND revision.status<>'cancelled') THEN
  RETURN QUERY SELECT 'not_found'::text,'job_out_of_scope'::text,NULL::uuid; RETURN;
 END IF;
 IF NOT coalesce(app.contractor_job_allowed(p_actor,permission,p_job),false)
  OR (named_required AND NOT coalesce(app.contractor_job_assigned(p_actor,p_job),false)) THEN
  RETURN QUERY SELECT 'not_found'::text,'job_out_of_scope'::text,NULL::uuid; RETURN;
 END IF;
 -- Lookup only: ENT-4b's insert trigger remains the structural scope judge.
 SELECT g.id INTO chosen FROM app.role_grant g
 JOIN app.team team ON team.tenant_id=g.tenant_id AND team.id=app.contractor_job_team(p_job)
 JOIN app.org_unit branch ON(branch.tenant_id,branch.id)=(team.tenant_id,team.branch_id)
 WHERE g.tenant_id=tenant AND g.membership_id=p_actor AND g.role=member_role
  AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation revocation WHERE(revocation.tenant_id,revocation.grant_id)=(g.tenant_id,g.id))
  AND (g.scope_kind='tenant' AND g.scope_id=tenant
   OR g.scope_kind='team' AND g.scope_id=team.id
   OR g.scope_kind='branch' AND g.scope_id=branch.id
   OR g.scope_kind='region' AND g.scope_id=branch.parent_id)
 ORDER BY g.id LIMIT 1;
 IF chosen IS NULL THEN
  RETURN QUERY SELECT 'not_found'::text,'job_out_of_scope'::text,NULL::uuid; RETURN;
 END IF;
 RETURN QUERY SELECT 'allowed'::text,'allowed'::text,chosen;
END;
END
$$;

-- Latest body: packages/db/migrations/0135_site_extra_authority.sql
CREATE OR REPLACE FUNCTION app.ent3a_require_extra_authority(p_job uuid, p_variation uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE tenant uuid; origin_row app.extra_origin; authority record;
BEGIN
 BEGIN
  tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN tenant:=NULL;
 END;
 IF tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(tenant::text,54));
 SELECT o.* INTO origin_row FROM app.extra_origin o WHERE(o.tenant_id,o.job_id,o.variation_id)=(tenant,p_job,p_variation);
 IF origin_row.variation_id IS NULL OR origin_row.job_track IS DISTINCT FROM 'contractor' OR origin_row.provenance IS DISTINCT FROM 'command' THEN
  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002';
 END IF;
 SELECT * INTO authority FROM app.ent3a_extra_authority(origin_row.raising_membership_id,origin_row.command_type,p_job);
 IF authority.decision IS DISTINCT FROM 'allowed' OR authority.raising_grant IS NULL OR authority.raising_grant IS DISTINCT FROM origin_row.raising_grant_id THEN
  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002';
 END IF;
END;
END
$$;

-- Latest body: packages/db/migrations/0158_extra_approval_chain.sql
CREATE OR REPLACE FUNCTION app.xa_begin(p_job uuid, p_command uuid, p_types text[], p_actor uuid) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE v_tenant uuid; v_receipt app.command_receipt;
BEGIN
 IF pg_catalog.current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN v_tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_tenant:=NULL; END;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT r.* INTO v_receipt FROM app.command_receipt r WHERE r.tenant_id=v_tenant AND r.command_id=p_command;
 IF v_receipt.command_id IS NULL OR v_receipt.status IS DISTINCT FROM 'processing' OR NOT(v_receipt.command_type=ANY(p_types)) OR v_receipt.actor_membership_id IS DISTINCT FROM p_actor THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(v_tenant::text,54));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text||':'||p_job::text,417));
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track t WHERE(t.tenant_id,t.job_id)=(v_tenant,p_job) AND t.job_track='contractor' AND t.environment='synthetic_demo') THEN
  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002';
 END IF;
 RETURN v_tenant;
END;
END
$$;

-- Latest body: packages/db/migrations/0158_extra_approval_chain.sql
CREATE OR REPLACE FUNCTION app.xa_covers(p_actor uuid, p_roles text[], p_job uuid, p_permission text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE v_tenant uuid; v_chosen uuid;
BEGIN
 BEGIN v_tenant:=nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_tenant:=NULL; END;
 IF v_tenant IS NULL OR p_actor IS NULL OR NOT coalesce(app.contractor_member_active(p_actor),false) THEN RETURN NULL; END IF;
 SELECT g.id INTO v_chosen FROM app.role_grant g
  JOIN app.team t ON t.tenant_id=g.tenant_id AND t.id=app.contractor_job_team(p_job)
  JOIN app.org_unit b ON(b.tenant_id,b.id)=(t.tenant_id,t.branch_id)
  JOIN app.membership m ON(m.tenant_id,m.id)=(g.tenant_id,g.membership_id) AND m.role=g.role
  WHERE g.tenant_id=v_tenant AND g.membership_id=p_actor AND g.role=ANY(p_roles) AND app.contractor_role_permits(g.role,p_permission)
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
   AND(g.scope_kind='tenant' AND g.scope_id=v_tenant OR g.scope_kind='team' AND g.scope_id=t.id OR g.scope_kind='branch' AND g.scope_id=b.id OR g.scope_kind='region' AND g.scope_id=b.parent_id)
  ORDER BY g.id LIMIT 1;
 RETURN v_chosen;
END;
END
$$;

-- Latest body: packages/db/migrations/0132_final_account_lock.sql
CREATE OR REPLACE FUNCTION app.final_lock_require_owner(p_tenant uuid,p_actor uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor()
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
END;
END
$$;

-- Latest body: packages/db/migrations/0306_evidence_pack_v3.sql
CREATE OR REPLACE FUNCTION app.evidence_pack_v3_owner(t uuid,c uuid,d text) RETURNS uuid
 LANGUAGE plpgsql SET search_path=pg_catalog,app,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(d,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE j uuid; a record; owned boolean;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO a FROM app.authenticate_practice_session(d,t);
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 SELECT job_id INTO j FROM app.recovery_case WHERE tenant_id=t AND id=c AND synthetic;
 WITH RECURSIVE owned_jobs AS (
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=d
  UNION SELECT child.id FROM owned_jobs source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
  JOIN app.job child ON child.tenant_id=e.tenant_id AND child.id::text=e.subject_ref AND child.provenance='imported' AND child.practice_session_digest IS NULL
 ) SELECT EXISTS(SELECT 1 FROM owned_jobs WHERE id=j) INTO owned;
 IF NOT owned OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND environment='synthetic_demo' AND job_track='small_builder')
 OR NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 RETURN j;
END;
END
$$;

-- Latest body: packages/db/migrations/0201_job_work_state_commands.sql
CREATE OR REPLACE FUNCTION app.ch4_require_command_owner(t uuid,j uuid,digest text) RETURNS uuid
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(digest,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

DECLARE actor uuid;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Trusted server membership IDs use the same authority boundary as final-lock
 -- commands. Practice digests still authenticate their persisted session.
 IF digest ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN
  actor:=digest::uuid;
 ELSE
  SELECT a.membership_id INTO actor FROM app.authenticate_practice_session(digest,t) a;
  IF NOT EXISTS(WITH RECURSIVE owned(id) AS(
   SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=digest
   UNION SELECT job.id FROM owned source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
    JOIN app.job job ON job.tenant_id=e.tenant_id AND job.id::text=e.subject_ref AND job.provenance='imported' AND job.practice_session_digest IS NULL
  ) SELECT 1 FROM owned WHERE id=j) THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM app.job x JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(x.tenant_id,x.id) WHERE x.tenant_id=t AND x.id=j AND c.job_track='small_builder' AND c.environment='synthetic_demo')
 THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  PERFORM app.final_lock_require_owner(t,actor);
 EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501';
 END;
 RETURN actor;
END;
END
$$;

-- Private copy of the latest switched-session projection (0165). Binding
-- resolves the effective practice actor through this one projection; its public
-- bridge cannot be used recursively while constructing the binding.
CREATE FUNCTION app.lp6d_contractor_session_identity(s uuid)
 RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
SELECT l.tenant_id, coalesce(a.worker_membership_id,l.membership_id), coalesce(a.worker_identity_user_id,l.identity_user_id) FROM app.contractor_practice_session_live(s) l LEFT JOIN (control_plane.practice_worker_switch a JOIN control_plane.practice_company_marker k ON k.tenant_id=a.tenant_id AND k.session_ref=a.session_ref AND k.owner_membership_id=a.owner_membership_id AND k.environment='synthetic_demo') ON a.session_ref=l.session_ref AND a.tenant_id=l.tenant_id AND a.owner_membership_id=l.membership_id AND k.owner_identity_user_id=l.identity_user_id AND a.environment='synthetic_demo' AND a.ended_at IS NULL AND a.started_at<=clock_timestamp() AND a.expires_at>clock_timestamp() AND current_database()='jobguard_synthetic_demo' AND current_setting('transaction_isolation')='read committed' AND NOT EXISTS(SELECT 1 FROM identity.membership_locator ml WHERE ml.tenant_id=l.tenant_id) AND NOT EXISTS(SELECT 1 FROM identity.invitation iv WHERE iv.tenant_id=l.tenant_id) AND NOT EXISTS(SELECT 1 FROM identity.user_email ue WHERE ue.user_id IN(l.identity_user_id,a.worker_identity_user_id)) AND NOT EXISTS(SELECT 1 FROM identity.session rs WHERE rs.user_id IN(l.identity_user_id,a.worker_identity_user_id))
$$;
ALTER FUNCTION app.lp6d_contractor_session_identity(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6d_contractor_session_identity(uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

-- Latest body: packages/db/migrations/0520_lp6a_request_binding.sql
CREATE OR REPLACE FUNCTION app.lp6_session_authority(p_kind text,p_credential text,p_tenant uuid)
 RETURNS TABLE(session_ref text,actor_id uuid,expires_at timestamptz)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE real_session identity.session; home control_plane.practice_session;
 practice control_plane.contractor_practice_session; selected_actor uuid;
 selected_ref text; deadline timestamptz; saved_tenant text:=current_setting('app.tenant_id',true);
 saved_sso text:=current_setting('app.sso_session_id',true);
BEGIN
 IF p_tenant IS NULL OR p_kind IS NULL OR p_credential IS NULL THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF p_kind='real' AND p_credential ~ '^[0-9a-f]{64}$' THEN
  SELECT * INTO real_session FROM identity.session s WHERE s.token_digest=p_credential FOR SHARE;
  IF NOT FOUND OR real_session.revoked_at IS NOT NULL OR real_session.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  SELECT m.id INTO selected_actor FROM identity.sso_session_memberships(real_session.user_id,real_session.id) m
   WHERE m.tenant_id=p_tenant;
  selected_ref:=real_session.id::text; deadline:=real_session.expires_at;
 ELSIF p_kind='practice' AND current_database()='jobguard_synthetic_demo' AND p_credential ~ '^[0-9a-f]{64}$' THEN
  SELECT * INTO home FROM control_plane.practice_session s WHERE s.token_digest=p_credential FOR SHARE;
  IF NOT FOUND OR home.environment<>'synthetic_demo' OR home.revoked_at IS NOT NULL OR home.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  -- Existing home principal mapping, never an identity.session lookup.
  SELECT m.membership_id INTO selected_actor FROM app.authenticate_practice_session(p_credential,p_tenant) m;
  selected_ref:=encode(sha256(convert_to('lp6-home:'||p_credential,'UTF8')),'hex'); deadline:=home.expires_at;
 ELSIF p_kind='contractor_practice' AND current_database()='jobguard_synthetic_demo'
  AND p_credential ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
  SELECT * INTO practice FROM control_plane.contractor_practice_session s
   WHERE s.session_digest=app.contractor_practice_session_digest(p_credential::uuid) FOR SHARE;
  IF NOT FOUND OR practice.tenant_id IS DISTINCT FROM p_tenant OR practice.revoked_at IS NOT NULL
   OR practice.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  -- If contractor practice originated at home, revoke/expiry of home also wins.
  -- No home lock: avoid a second, differently ordered credential-row lock.
  deadline:=LEAST(practice.expires_at,app.contractor_practice_home_deadline(practice.session_digest,clock_timestamp()));
  PERFORM set_config('app.tenant_id',p_tenant::text,true);
  SELECT m.id INTO selected_actor FROM app.membership m
   JOIN app.lp6d_contractor_session_identity(p_credential::uuid) effective
    ON (m.tenant_id,m.id,m.identity_user_id)=(effective.tenant_id,effective.membership_id,effective.identity_user_id)
   WHERE m.tenant_id=p_tenant
    AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE (r.tenant_id,r.membership_id)=(m.tenant_id,m.id));
  selected_ref:=practice.session_id::text;
 ELSE
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF selected_actor IS NULL OR deadline IS NULL OR deadline<=clock_timestamp() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 PERFORM set_config('app.sso_session_id',coalesce(saved_sso,''),true);
 RETURN QUERY SELECT selected_ref,selected_actor,deadline;
END $$;

CREATE OR REPLACE FUNCTION app.contractor_session(s uuid)
 RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE selected_tenant uuid;
BEGIN
 -- LP6D_BOUND: this credential bridge binds before returning an actor. The
 -- private projection below is also used by the binding lookup, avoiding a cycle.
 SELECT live.tenant_id INTO selected_tenant FROM app.contractor_practice_session_live(s) live;
 IF selected_tenant IS NULL THEN RETURN; END IF;
 PERFORM app.bind_request('contractor_practice',s::text,selected_tenant);
 RETURN QUERY SELECT effective.* FROM app.lp6d_contractor_session_identity(s) effective
  WHERE effective.tenant_id=app.current_tenant() AND effective.membership_id=app.current_actor();
END $$;

-- Latest body: packages/db/migrations/0150_membership_authority_fix.sql
CREATE OR REPLACE FUNCTION identity.invite_member(session_digest char(64), t uuid, recipient varchar, assigned_role varchar)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity,pg_temp AS $$
DECLARE s identity.session; a uuid; invitation_id uuid:=gen_random_uuid();
BEGIN
 -- LP6D_BOUND: bind before any membership or tenant lock.
 PERFORM app.bind_request('real',session_digest::text,t);
 SELECT * INTO s FROM identity.session WHERE token_digest=session_digest AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
 -- Contractor revocation owns this same tenant key (seed 54). Take it before the authority read.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT m.account_id INTO a FROM app.membership m WHERE m.tenant_id=t AND m.identity_user_id=s.user_id AND m.id=app.current_actor()
  AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r
   WHERE r.tenant_id=m.tenant_id AND r.membership_id=m.id) FOR SHARE OF m;
 IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 INSERT INTO identity.invitation(id,email,tenant_id,account_id,role,expires_at,issuer_user_id)
 VALUES(invitation_id,recipient,t,a,assigned_role,clock_timestamp()+interval '1 day',s.user_id);
 INSERT INTO identity.security_event VALUES(gen_random_uuid(),'invitation.created',invitation_id,clock_timestamp());
 RETURN invitation_id;
END $$;
-- The last direct authorization write is narrowed to the existing recovery
-- message revoke command. Completion/audit/outbox cancellation remain atomic
-- in its caller and the LP-5 deferred completion proof.
CREATE FUNCTION app.revoke_recovery_message_authorization(p_tenant uuid,p_actor uuid,p_command uuid,p_message uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE claim app.command_lifecycle_claim; message app.recovery_message; approved app.recovery_message_approval; input jsonb;
BEGIN
 -- LP6D_BOUND
 IF p_actor IS DISTINCT FROM app.current_actor() OR p_tenant IS DISTINCT FROM app.current_tenant()
  OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO claim FROM app.command_lifecycle_claim WHERE tenant_id=p_tenant AND command_id=p_command;
 SELECT * INTO message FROM app.recovery_message WHERE tenant_id=p_tenant AND id=p_message;
 SELECT * INTO approved FROM app.recovery_message_approval WHERE tenant_id=p_tenant AND message_id=p_message;
 input:=claim.significant_input->'input';
 IF claim.transaction_id IS DISTINCT FROM pg_current_xact_id() OR claim.actor_membership_id IS DISTINCT FROM p_actor
  OR message.id IS NULL OR approved.authorization_id IS NULL
  OR NOT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command
    AND actor_membership_id=p_actor AND command_type='recovery.message.revoke' AND status='processing')
  OR NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner'
    AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
  OR (claim.resource->>'subjectRef') IS DISTINCT FROM message.job_id::text
  OR (input->>'caseId') IS DISTINCT FROM message.case_id::text
  OR (input->>'messageId') IS DISTINCT FROM p_message::text
  OR (input->>'action') IS DISTINCT FROM 'revoke'
  OR (input->>'expectedRevision')::integer IS DISTINCT FROM
    (SELECT coalesce(max(revision),0) FROM app.recovery_message_event WHERE tenant_id=p_tenant AND message_id=p_message)
  OR NOT EXISTS(SELECT 1 FROM app.action_outbox WHERE tenant_id=p_tenant AND id=approved.outbox_action_id AND status IN('pending','retryable')) THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
 END IF;
 UPDATE app.action_authorization SET revoked_at=clock_timestamp()
  WHERE tenant_id=p_tenant AND id=approved.authorization_id AND revoked_at IS NULL;
END $$;
ALTER FUNCTION app.revoke_recovery_message_authorization(uuid,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.revoke_recovery_message_authorization(uuid,uuid,uuid,uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.revoke_recovery_message_authorization(uuid,uuid,uuid,uuid) TO jobguard_runtime;
REVOKE UPDATE(revoked_at) ON app.action_authorization FROM PUBLIC,jobguard_runtime;

-- Worker/support entry points were never runtime entry points. Preserve their
-- separate shadow/support execution contracts (including must-surface safety)
-- and explicitly keep the request login unavailable. LP-10 handles worker
-- authority; no user binding is imposed on a must-surface background action.
REVOKE ALL ON FUNCTION app.record_shadow_disclosure(uuid,uuid,uuid,uuid,text),
 app.read_shadow_emergency(uuid,uuid,text),app.read_final_check_manifest(uuid,uuid,uuid),
 app.prepare_evidence_pack_v3(uuid,uuid),app.complete_evidence_pack_v3_check(uuid,uuid,text),
 app.finish_evidence_pack_v3(uuid,uuid,jsonb,text,text) FROM PUBLIC,jobguard_runtime;

COMMIT;
