-- LP-6d RED. Add binding checks before the latest predecessor body.
-- No policy, authorization, role rule or immutable history is relaxed.
-- LP-6c owns money/activation/acceptance/invoice and begin/complete_command;
-- LP-6e owns audit attribution. See the migration note for the exact split.
BEGIN;
-- Reuse LP-6c's owner-only binding/accessor grants.

-- Latest body: packages/db/migrations/0003_job_spine.sql
CREATE OR REPLACE FUNCTION app.transition_scope_progress(p_tenant uuid,p_job uuid,p_scope uuid,p_expected integer,p_to varchar,p_reason varchar)
RETURNS app.scope_progress LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
RETURNS app.job_party_binding LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
CREATE OR REPLACE FUNCTION app.require_current_job_parties(p_tenant uuid,p_job uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
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


-- Router ruling (r8, binding): no pg_trigger_depth() skip. require_watchdog_live and
-- require_current_job_parties always refuse an unbound caller, including inside a trigger.
-- Each row trigger that reaches them now routes at its own entry by the ORIGINAL login
-- (session_user, never current_user or trigger depth; the 0720 maintenance convention):
-- the migration/maintenance login uses the private, unguarded inner check below; every
-- other login (runtime, worker, identity) goes through the guarded routine, so its
-- statement must be bound. The inner checks refuse any non-maintenance login themselves.
CREATE FUNCTION app.lp6d_watchdog_live_maintenance(p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
DECLARE tenant uuid; lifecycle text;
BEGIN
  IF NOT pg_has_role(session_user,'jobguard_migration','USAGE') THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END IF;
  tenant := nullif(current_setting('app.tenant_id', true), '')::uuid;
  IF tenant IS NULL THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
  SELECT status INTO lifecycle FROM app.job WHERE tenant_id=tenant AND id=p_job FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF lifecycle <> 'live' THEN RAISE EXCEPTION 'JOB_NOT_LIVE' USING ERRCODE='P0001'; END IF;
END $$;
ALTER FUNCTION app.lp6d_watchdog_live_maintenance(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6d_watchdog_live_maintenance(uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
-- Two of the guards are SECURITY INVOKER (a maintenance fixture may SET LOCAL ROLE jobguard_runtime).
GRANT EXECUTE ON FUNCTION app.lp6d_watchdog_live_maintenance(uuid) TO jobguard_runtime;
CREATE FUNCTION app.lp6d_job_parties_maintenance(p_tenant uuid,p_job uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE snapshot jsonb; BEGIN
 IF NOT pg_has_role(session_user,'jobguard_migration','USAGE') THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END IF;
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT s.snapshot INTO snapshot FROM app.job_party_snapshot s JOIN app.job_party_current x ON(x.tenant_id,x.binding_id)=(s.tenant_id,s.binding_id) WHERE s.tenant_id=p_tenant AND s.job_id=p_job;
 IF snapshot IS NULL THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 RETURN snapshot;
END $$;
ALTER FUNCTION app.lp6d_job_parties_maintenance(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6d_job_parties_maintenance(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

-- Latest body: packages/db/migrations/0095_job_parties.sql (definer trigger); only the parties call routes.
CREATE OR REPLACE FUNCTION app.require_job_parties() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF TG_TABLE_NAME='job' THEN
   IF NEW.status='live' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) AND NOT EXISTS(SELECT 1 FROM app.job_party_current WHERE tenant_id=NEW.tenant_id AND job_id=NEW.id) THEN
     RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023';
   END IF;
 ELSIF TG_TABLE_NAME IN('job_activation','imported_job_baseline') THEN
   SELECT binding_id INTO NEW.party_binding_id FROM app.job_party_current WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id;
   IF NEW.party_binding_id IS NULL THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 ELSE
   NEW.parties_snapshot:=CASE WHEN pg_has_role(session_user,'jobguard_migration','USAGE') THEN app.lp6d_job_parties_maintenance(NEW.tenant_id,NEW.job_id) ELSE app.require_current_job_parties(NEW.tenant_id,NEW.job_id) END;
   IF TG_TABLE_NAME='quote_document_version' THEN
     IF NEW.snapshot ? 'jobParties' AND NEW.snapshot->'jobParties' IS DISTINCT FROM NEW.parties_snapshot THEN RAISE EXCEPTION 'PARTY_SNAPSHOT_MISMATCH' USING ERRCODE='22023'; END IF;
   END IF;
   IF NEW.parties_snapshot IS NULL THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN NEW;
END $$;
-- Latest body: packages/db/migrations/0201_job_work_state_commands.sql; only the live check routes.
CREATE OR REPLACE FUNCTION app.guard_watchdog_input() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, app AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
  -- These tables also hold non-watchdog bank evidence from the already
  -- controlled synthetic recovery routine. Only its migration-role execution
  -- may write its exact generated PDF class after live. Runtime cannot assume
  -- this role or gain the exception by forging a content type/key/mode.
  IF current_user='jobguard_migration' AND (to_jsonb(NEW)->>'scope_item_id') IS NULL
    AND (to_jsonb(NEW)->>'object_key') LIKE 'synthetic/recovery/%'
    AND ((TG_TABLE_NAME='evidence_upload' AND to_jsonb(NEW)->>'expected_content_type'='application/pdf' AND to_jsonb(NEW)->>'state'='verified')
      OR (TG_TABLE_NAME='evidence_object' AND to_jsonb(NEW)->>'evidence_type'='synthetic_bank_receipt' AND to_jsonb(NEW)->>'content_type'='application/pdf'))
  THEN RETURN NEW; END IF;
  -- Only migration-owned checked CH-4 administration can claim a pre-live ID.
  -- No GUC, caller-supplied mode or direct runtime write grants this exception.
  IF current_user='jobguard_migration' AND TG_TABLE_SCHEMA='app' AND TG_TABLE_NAME='watchdog_command_identity' THEN
    IF NEW.command_type IN('WorkState.close','WorkState.reopen','WorkState.link') AND EXISTS(
      SELECT 1 FROM app.command_receipt r JOIN app.job_commercial_track c ON c.tenant_id=r.tenant_id AND c.job_id=NEW.job_id
      WHERE r.tenant_id=NEW.tenant_id AND r.command_id=NEW.command_id AND r.command_type=NEW.command_type
        AND r.semantic_key=NEW.command_id::text AND r.request_hash=NEW.request_hash AND r.status='processing'
        AND c.job_track='small_builder' AND c.environment='synthetic_demo'
        AND EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=r.tenant_id AND m.id=r.actor_membership_id
          AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()))
    ) THEN RETURN NEW; END IF;
  END IF;
  IF pg_has_role(session_user,'jobguard_migration','USAGE') THEN PERFORM app.lp6d_watchdog_live_maintenance(NEW.job_id); ELSE PERFORM app.require_watchdog_live(NEW.job_id); END IF;
  RETURN NEW;
END $$;
-- Latest body: packages/db/migrations/0720_verified_upload_immutable.sql; only the live check routes.
CREATE OR REPLACE FUNCTION app.guard_watchdog_upload_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
BEGIN
  IF (NEW.id,NEW.tenant_id,NEW.job_id,NEW.scope_item_id,NEW.object_key,NEW.expected_sha256,NEW.expected_content_type,NEW.maximum_bytes)
    IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.job_id,OLD.scope_item_id,OLD.object_key,OLD.expected_sha256,OLD.expected_content_type,OLD.maximum_bytes)
  THEN RAISE EXCEPTION 'evidence upload identity is immutable' USING ERRCODE='42501'; END IF;
  -- Check the original login, never current_user: a product caller inside a
  -- migration-owned SECURITY DEFINER routine still has no maintenance authority.
  -- USAGE preserves the existing inherited migration-login fixture convention.
  IF OLD.state='verified' AND NOT pg_has_role(session_user,'jobguard_migration','USAGE')
  THEN RAISE EXCEPTION 'verified evidence upload is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.state IN ('quarantined','verified') AND
    (NEW.state,NEW.object_version_id,NEW.server_verified_at) IS DISTINCT FROM (OLD.state,OLD.object_version_id,OLD.server_verified_at)
  THEN IF pg_has_role(session_user,'jobguard_migration','USAGE') THEN PERFORM app.lp6d_watchdog_live_maintenance(NEW.job_id); ELSE PERFORM app.require_watchdog_live(NEW.job_id); END IF; END IF;
  RETURN NEW;
END $$;
-- Latest body: packages/db/migrations/0303_job_source_intake.sql; only the live check routes.
CREATE OR REPLACE FUNCTION app.job_source_insert_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND job_track='small_builder' AND environment='synthetic_demo')
 THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME<>'job_source_original' THEN
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id FOR SHARE;
 IF TG_TABLE_NAME<>'job_source_original' THEN
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 PERFORM app.ch4_require_open(NEW.tenant_id,NEW.job_id);
 IF pg_has_role(session_user,'jobguard_migration','USAGE') THEN PERFORM app.lp6d_watchdog_live_maintenance(NEW.job_id); ELSE PERFORM app.require_watchdog_live(NEW.job_id); END IF;
 RETURN NEW;
END $$;

-- Latest body: packages/db/migrations/0548_server_plan_entitlements.sql
CREATE OR REPLACE FUNCTION app.link_contractor_customer(actor uuid,client uuid,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.customer_revision; client_kind text; prior app.command_receipt; h text; result jsonb; row_id uuid:=gen_random_uuid();
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 PERFORM app.mon8_require_feature(actor,'work_orders');
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

-- Latest body: packages/db/migrations/0549_contractor_feature_guards.sql
CREATE OR REPLACE FUNCTION app.bind_contractor_parties(actor uuid,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; j app.job; link app.contractor_client_customer; c app.customer_revision; p app.customer_revision; s app.site_revision;
 cv uuid; prior app.command_receipt; h text; result jsonb; row_id uuid:=gen_random_uuid(); party_id uuid:=gen_random_uuid(); expected integer; client_kind text; res jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF t IS NULL OR NOT coalesce(app.contractor_member_active(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM app.mon8_require_feature(actor,'work_orders');
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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

-- Latest body: packages/db/migrations/0549_contractor_feature_guards.sql
CREATE OR REPLACE FUNCTION app.work_order_begin(actor uuid, p_job uuid, p_title text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM app.mon8_require_feature(actor,'work_orders');
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

-- Latest body: packages/db/migrations/0676_work_order_expected_revision.sql
CREATE OR REPLACE FUNCTION app.work_order_commit(actor uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
 PERFORM app.mon8_require_feature(actor,'work_orders');
 IF payload->>'version' IS DISTINCT FROM 'work-order-commit.v1' OR k NOT IN('create','revise') OR status_value NOT IN('ordered','cancelled') OR jsonb_typeof(lines)<>'array' OR jsonb_array_length(lines)>1000
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 IF k='create' THEN
  SELECT * INTO binding FROM app.contractor_party_binding WHERE tenant_id=t AND job_id=(payload->>'jobId')::uuid AND work_order_id=(payload->>'workOrderId')::uuid;
  IF binding.id IS NULL THEN RAISE EXCEPTION 'CONTRACTOR_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
  -- Defence in depth: CH-3b already checked the actor against this client when it bound the parties; the order is committed only for a member who may import for it.
  IF NOT coalesce(app.work_order_client_permitted(actor,binding.client_id),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO job_row FROM app.job WHERE tenant_id=t AND id=binding.job_id FOR UPDATE;
  IF job_row.provenance<>'work_order' OR job_row.status<>'draft' THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  IF (payload->>'expectedRevision')::integer IS DISTINCT FROM 0 OR status_value<>'ordered' THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  INSERT INTO app.work_order(tenant_id,id,job_id,client_id,contract_id,contract_version_id,reference)
  VALUES(t,binding.work_order_id,binding.job_id,binding.client_id,binding.contract_id,binding.contract_version_id,payload->>'reference') RETURNING * INTO wo;
  revision_no:=1;
 ELSE
  SELECT * INTO wo FROM app.work_order WHERE tenant_id=t AND id=(payload->>'workOrderId')::uuid FOR UPDATE;
  -- An order of a client outside the actor's scope is, to them, an order that does not exist (ENT-1): no revision, cancellation or line/team change.
  IF wo.id IS NULL OR NOT coalesce(app.work_order_client_permitted(actor,wo.client_id),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT r.* INTO cur FROM app.work_order_current c JOIN app.work_order_revision r ON(r.tenant_id,r.work_order_id,r.id)=(c.tenant_id,c.work_order_id,c.revision_id) WHERE c.tenant_id=t AND c.work_order_id=wo.id;
  IF cur.id IS NULL OR cur.revision IS DISTINCT FROM (payload->>'expectedRevision')::integer THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
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
  IF NOT coalesce(app.contractor_allowed(actor,'organisation.manage',team_value) OR app.contractor_allowed(actor,'data.import',t),false) THEN RAISE EXCEPTION 'ASSIGNMENT_INVALID' USING ERRCODE='22023'; END IF;
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

-- Latest body: packages/db/migrations/0549_contractor_feature_guards.sql
CREATE OR REPLACE FUNCTION app.import_batch_record(actor uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; rows jsonb:=coalesce(payload->'rows','[]'::jsonb); batch uuid:=(payload->>'batchId')::uuid; n integer;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM app.mon8_require_feature(actor,'work_orders');
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

-- Latest body: packages/db/migrations/0549_contractor_feature_guards.sql
CREATE OR REPLACE FUNCTION app.import_sor_version(actor uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; items jsonb:=coalesce(payload->'items','[]'::jsonb); prior app.sor_version; version uuid:=(payload->>'versionId')::uuid; schedule uuid:=(payload->>'scheduleId')::uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF t IS NULL OR NOT coalesce(app.sor_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM app.mon8_require_feature(actor,'work_orders');
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
CREATE OR REPLACE FUNCTION app.prepare_final_review_extra(p_tenant uuid,p_job uuid,p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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

-- Latest body: packages/db/migrations/0549_contractor_feature_guards.sql
CREATE OR REPLACE FUNCTION app.ent3b_start_visit(p_actor uuid, p_command uuid, p_job uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE tenant uuid; answers integer; answered text; order_id uuid; new_visit uuid:=gen_random_uuid();
BEGIN
 PERFORM app.mon8_require_feature(p_actor,'site_origin_capture');
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

-- Latest body: packages/db/migrations/0549_contractor_feature_guards.sql
CREATE OR REPLACE FUNCTION app.ent3b_complete_visit(p_actor uuid, p_command uuid, p_job uuid, p_visit uuid, p_answer text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE tenant uuid; answers integer; answered text; visit_row app.site_visit; answer_id uuid:=gen_random_uuid(); recorded timestamptz;
BEGIN
 PERFORM app.mon8_require_feature(p_actor,'site_origin_capture');
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
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  -- A genuinely missing row falls through to the routine's own NOT_FOUND; another actor's row is refused here.
  OR EXISTS(SELECT 1 FROM app.extra_origin WHERE tenant_id=app.current_tenant() AND job_id=p_job AND variation_id=p_variation AND raising_membership_id IS DISTINCT FROM app.current_actor()) THEN
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

-- Latest body: packages/db/migrations/0522_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.xa_submit(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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

-- Latest body: packages/db/migrations/0522_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.xa_price(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid, p_net bigint, p_revise boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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

-- Latest body: packages/db/migrations/0728_extra_reject_null_step.sql
CREATE OR REPLACE FUNCTION app.xa_approve(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_step integer, p_hash text, p_net bigint, p_reject boolean, p_reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
 -- Rejection occupies a step too, even though it is an outcome rather than an approval fact.
 SELECT h.step_index,h.request_id INTO v_prior FROM (
  SELECT f.step_index,f.request_id FROM app.extra_approval_step_fact f
   WHERE f.tenant_id=v_tenant AND f.variation_id=v_req.variation_id AND f.actor_membership_id=p_actor
  UNION ALL
  SELECT (r.result->>'stepIndex')::integer,o.request_id FROM app.extra_approval_outcome o
   JOIN app.command_receipt r ON(r.tenant_id,r.command_id)=(o.tenant_id,o.command_id)
   WHERE o.tenant_id=v_tenant AND o.variation_id=v_req.variation_id AND o.actor_membership_id=p_actor
    AND o.kind='rejected' AND r.status='succeeded'
 ) h ORDER BY (h.step_index<>v_n) DESC,h.step_index LIMIT 1;
 IF v_prior.request_id IS NOT NULL THEN
  IF v_prior.step_index IS DISTINCT FROM v_n THEN RAISE EXCEPTION 'REUSED_APPROVER' USING ERRCODE='23514'; END IF;
  -- Same person may approve the same slot of a new request revision.
  -- Same-request repeats are resolved by the durable command receipt before this routine.
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

-- Latest body: packages/db/migrations/0636_extra_withdraw_roles.sql
CREATE OR REPLACE FUNCTION app.xa_withdraw(p_job uuid, p_variation uuid, p_command uuid, p_actor uuid, p_reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE lp5_result jsonb; v_tenant uuid; v_req app.extra_approval_request; v_latest text; v_open boolean; v_n integer;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['WithdrawExtra'],p_actor);
 IF NOT EXISTS(SELECT 1 FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_variation) AND x.job_track='contractor' AND x.provenance='command') THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- ENT-5 Q11, 4 Nov: covered supervisor, surveyor or commercial manager before final outcome.
 IF app.xa_covers(p_actor,ARRAY['supervisor','surveyor','commercial_manager'],p_job,'job.read') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
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

-- Latest body: packages/db/migrations/0622_extra_duplicate_relink.sql
CREATE OR REPLACE FUNCTION app.xa_mark_duplicate(p_job uuid, p_duplicate uuid, p_canonical uuid, p_command uuid, p_actor uuid, p_link uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE lp5_result jsonb; v_tenant uuid; v_req app.extra_approval_request; v_latest text; v_n integer;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['MarkDuplicate'],p_actor);
 IF app.xa_covers(p_actor,ARRAY['supervisor','surveyor','commercial_manager'],p_job,'job.read') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_duplicate=p_canonical OR NOT EXISTS(SELECT 1 FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_duplicate) AND x.job_track='contractor')
  OR NOT EXISTS(SELECT 1 FROM app.extra_origin x WHERE(x.tenant_id,x.job_id,x.variation_id)=(v_tenant,p_job,p_canonical) AND x.job_track='contractor') THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Read the effective state: an explicitly reversed duplicate fact no longer masks the prior state.
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
-- plus 0642_extra_client_send_authority.sql's in-place functiondef patch (send authority, 7-day expiry).
CREATE OR REPLACE FUNCTION app.xa_issue_link(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_link uuid, p_approver uuid, p_recipient text, p_token_hash text, p_expires_at timestamptz, p_authorization uuid, p_outbox uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE v_tenant uuid; v_req app.extra_approval_request; v_auth app.action_authorization; v_out app.action_outbox; v_n integer; v_wo app.work_order; v_prev uuid; v_replaced jsonb:='[]'::jsonb; l record;
BEGIN
 v_tenant:=app.xa_begin(p_job,p_command,ARRAY['IssueClientApproval'],p_actor);
 -- Ben decision 18: only OWNER-approved sends go out. The exact authorization and its outbox row must already exist for this very request, recipient and amount.
 IF app.xa_covers(p_actor,ARRAY['surveyor','commercial_manager'],p_job,'job.read') IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
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
 IF p_expires_at<=clock_timestamp() OR p_expires_at>clock_timestamp()+interval '7 days' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
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

-- Latest body: packages/db/migrations/0522_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.xa_revoke_link(p_job uuid, p_link uuid, p_command uuid, p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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

-- Latest body: packages/db/migrations/0686_extra_client_authority_loss.sql
CREATE OR REPLACE FUNCTION app.xa_client_decide(p_job uuid, p_request uuid, p_command uuid, p_actor uuid, p_token_hash text, p_email text, p_hash text, p_net bigint, p_reject boolean, p_reason text, p_role_name text, p_tester text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
 IF NOT app.xc_link_current(v_link.id) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
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

-- Latest body: packages/db/migrations/0686_extra_client_authority_loss.sql
CREATE OR REPLACE FUNCTION app.xa_client_view_authority(p_job uuid, p_request uuid, p_actor uuid, p_email text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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

 -- Q14: decided links retain history; unused links require both current parties.
 IF EXISTS(SELECT 1 FROM app.extra_client_link k WHERE k.tenant_id=v_tenant
  AND k.job_id=p_job AND k.request_id=p_request AND k.approver_membership_id=p_actor
  AND NOT EXISTS(SELECT 1 FROM app.extra_client_link_closure c WHERE(c.tenant_id,c.link_id)=(k.tenant_id,k.id))
  AND NOT app.xc_link_current(k.id)) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
END;
END
$$;

-- Latest body: packages/db/migrations/0690_import_ancestry_record_anchor.sql
CREATE OR REPLACE FUNCTION app.read_job_sources(t uuid,j uuid,digest text,source text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  -- LP6D_DIGEST: a digest that authenticates must be the bound actor; an unauthenticated one keeps the body's own refusal.
  OR coalesce((CASE WHEN digest ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN (SELECT membership_id FROM app.contractor_session(digest::uuid)) ELSE (SELECT membership_id FROM app.authenticate_practice_session(digest,app.current_tenant())) END),app.current_actor()) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE records jsonb;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(digest,t)) THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(WITH RECURSIVE owned(id) AS(
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=digest
  UNION SELECT job.id FROM owned source_job JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source_job.id::text
   JOIN app.job job ON job.tenant_id=e.tenant_id AND job.id::text=e.subject_ref AND job.provenance='imported' AND job.practice_session_digest IS NULL
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=job.id AND iv.source_job_id=source_job.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||job.id::text AND rv.result->>'jobId'=job.id::text AND rv.result->>'sourceJobId'=source_job.id::text))
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

-- Latest body: packages/db/migrations/0712_end_check_rule_a_rerun.sql
CREATE OR REPLACE FUNCTION app.lp_authority(p_session uuid,p_job uuid,p_action text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
 -- The owner may use the existing rule (a) projections only inside their unaudited
 -- same-job EndCheck. The deferred audit guard prevents an unaudited receipt from
 -- committing; appending the command audit closes this read window before commit.
 IF p_action='detail' AND member_role='owner' AND EXISTS(
  SELECT 1 FROM app.contractor_job_finish f JOIN app.command_receipt r
   ON(r.tenant_id,r.command_id)=(f.tenant_id,f.command_id)
  WHERE f.tenant_id=t AND f.job_id=p_job AND f.actor_membership_id=a
   AND r.actor_membership_id=a AND r.command_type='EndCheck' AND r.status='succeeded'
   AND NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=t AND e.id=r.command_id)
 ) THEN role_set:=array_append(role_set,'owner'); END IF;
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
  PERFORM app.mon8_require_feature(a,'site_origin_capture');
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

-- Latest body: packages/db/migrations/0620_contractor_job_finish.sql
CREATE OR REPLACE FUNCTION app.lp_read(p_session uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; j uuid:=(p_input->>'jobId')::uuid; a uuid; result jsonb; lim integer:=coalesce((p_input->>'limit')::integer,50); x jsonb;
BEGIN
 IF p_input->>'version'='contractor-job-finish-status.v1' THEN
  PERFORM app.lp_authority(p_session,j,'endcheck');
  IF p_input-ARRAY['version','jobId']<>'{}'::jsonb THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
  SELECT cr.result INTO result FROM app.contractor_job_finish f JOIN app.command_receipt cr
   ON(cr.tenant_id,cr.command_id)=(f.tenant_id,f.command_id) WHERE f.tenant_id=t AND f.job_id=j;
  RETURN jsonb_build_object('canFinish',true,'finish',result);
 END IF;
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

-- Latest body: packages/db/migrations/0620_contractor_job_finish.sql
CREATE OR REPLACE FUNCTION app.lp_command(p_session uuid,p_input jsonb,p_source_bytes bytea DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; j uuid:=(p_input->>'jobId')::uuid; a uuid; cid uuid:=(p_input->>'commandId')::uuid;
 ver text:=p_input->>'version'; typ text; h text; old app.command_receipt; answer jsonb; evaluation jsonb; fact app.materials_issue_fact; source_hash text; source uuid;
 p app.extra_prompt; chosen uuid; n integer; v uuid:=gen_random_uuid(); scope uuid:=gen_random_uuid(); grant_id uuid; role_name text; origin_hash text; audits jsonb:='[]'; pid uuid; rev uuid; selected_identity text; excess_scope uuid; selected_unit text; settings app.extra_prompt_rule_settings; term text; original_bytes bytea; tags jsonb; source_kind text; expected_keys text[];
 ag app.enterprise_agreement_version; finished app.contractor_job_finish; check_enabled boolean; before_prompts integer;
BEGIN
 typ:=CASE ver WHEN 'materials-issue.v1' THEN 'ImportMaterialsIssue' WHEN 'completion-observation.v1' THEN 'RegisterCompletionObservation' WHEN 'evaluate-live-prompts.v1' THEN 'EvaluateLivePrompts' WHEN 'confirm-prompt.v1' THEN 'ConfirmPrompt' WHEN 'dismiss-prompt.v1' THEN 'DismissPrompt' WHEN 'end-check.v1' THEN 'EndCheck' ELSE NULL END;
 IF typ IS NULL OR cid IS NULL OR j IS NULL THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
 a:=app.lp_authority(p_session,j,CASE WHEN typ='ImportMaterialsIssue' THEN 'materials' WHEN typ='EndCheck' THEN 'endcheck' ELSE 'resolve' END);
 expected_keys:=CASE typ WHEN 'ImportMaterialsIssue' THEN ARRAY['version','commandId','jobId','sourceId','eventId','workIdentity','unit','quantity','occurredAtMicros','kind']
 WHEN 'RegisterCompletionObservation' THEN ARRAY['version','commandId','jobId','evidenceId','sha256','objectVersion','locator','workIdentity','sourceText']
 WHEN 'ConfirmPrompt' THEN ARRAY['version','commandId','jobId','promptId','promptHash','confirmedWorkIdentity','excessScopeItemId','existingExtraId']
 WHEN 'EndCheck' THEN ARRAY['version','commandId','jobId','agreementVersionId']
 WHEN 'DismissPrompt' THEN ARRAY['version','commandId','jobId','promptId','promptHash','reason'] ELSE ARRAY['version','commandId','jobId'] END;
 IF p_input-expected_keys<>'{}'::jsonb OR EXISTS(SELECT 1 FROM unnest(expected_keys) k WHERE k NOT IN('agreementVersionId','confirmedWorkIdentity','excessScopeItemId','existingExtraId','sourceText') AND (NOT p_input ? k OR p_input->k='null'::jsonb))
  OR EXISTS(SELECT 1 FROM jsonb_each(p_input) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM CASE WHEN e.key='locator' THEN 'object' ELSE 'string' END)
 THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
 h:=encode(sha256(convert_to(jsonb_build_array(a,p_input)::text,'UTF8')),'hex');
 -- Shared tenant command namespace; authority/live check occurs BEFORE replay.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||cid::text,8189));
 PERFORM app.lp_authority(p_session,j,CASE WHEN typ='ImportMaterialsIssue' THEN 'materials' WHEN typ='EndCheck' THEN 'endcheck' ELSE 'resolve' END);
 SELECT * INTO old FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF old.command_id IS NOT NULL THEN
  IF old.request_hash<>h OR old.command_type<>typ OR old.status<>'succeeded' THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
  PERFORM app.lp_authority(p_session,j,CASE WHEN typ='ImportMaterialsIssue' THEN 'materials' WHEN typ='EndCheck' THEN 'endcheck' ELSE 'resolve' END);
  RETURN jsonb_build_object('replay',true,'result',old.result,'audits','[]'::jsonb);
 END IF;
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(t,cid,typ,CASE WHEN typ='ConfirmPrompt' THEN 'extra-origin:'||j::text||':'||v::text ELSE 'live-prompt:'||j::text||':'||cid::text END,h,'processing',a);
 IF typ='EndCheck' THEN
  -- The owner/session checks and key 417 precede the receipt. Upgrade the job lock
  -- before checking visits: concurrent starts hold a job SHARE lock through commit.
  PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
  IF EXISTS(SELECT 1 FROM app.contractor_job_finish WHERE tenant_id=t AND job_id=j)
   OR EXISTS(SELECT 1 FROM app.site_visit WHERE tenant_id=t AND job_id=j AND completed_at IS NULL)
  THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
  SELECT * INTO ag FROM app.enterprise_agreement_version
   WHERE tenant_id=t AND environment='synthetic_demo' AND effective_from<=statement_timestamp()
   ORDER BY effective_from DESC LIMIT 1 FOR SHARE;
  IF p_input ? 'agreementVersionId' AND (p_input->>'agreementVersionId')::uuid IS DISTINCT FROM ag.id
  THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
  check_enabled:=coalesce(ag.end_of_job_check,false);
  SELECT count(*) INTO before_prompts FROM app.extra_prompt WHERE tenant_id=t AND job_id=j;
  IF check_enabled THEN evaluation:=app.lp_evaluate(j,cid); END IF;
  INSERT INTO app.contractor_job_finish(tenant_id,job_id,actor_membership_id,command_id,request_hash,agreement_version_id,check_ran)
   VALUES(t,j,a,cid,h,ag.id,check_enabled) RETURNING * INTO finished;
  SELECT jsonb_build_object('jobId',j,'finishedAt',finished.finished_at,'checkRan',check_enabled,
   'promptsRaised',count(*)-before_prompts) INTO answer FROM app.extra_prompt WHERE tenant_id=t AND job_id=j;
 ELSIF typ='ImportMaterialsIssue' THEN
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

-- Latest body: packages/db/migrations/0620_contractor_job_finish.sql
CREATE OR REPLACE FUNCTION app.lp_finish(p_session uuid,p_command uuid,p_result jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; r app.command_receipt;
BEGIN
 SELECT s.membership_id INTO a FROM app.contractor_session(p_session) s WHERE s.tenant_id=t;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF a IS NULL OR r.actor_membership_id IS DISTINCT FROM a OR r.status<>'succeeded' OR r.result IS DISTINCT FROM p_result OR r.command_type NOT IN('ImportMaterialsIssue','RegisterCompletionObservation','EvaluateLivePrompts','ConfirmPrompt','DismissPrompt','EndCheck')
 OR NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=t AND e.id=p_command AND e.event_type='contractor.prompt.command' AND e.actor_ref='membership:'||a AND e.payload->'hashes'->>'input'=r.request_hash
 AND e.payload->'hashes'->>'result'=encode(sha256(convert_to(p_result::text,'UTF8')),'hex')) THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
 -- No locks or business writes after the audit head.
END;
END
$$;

-- Latest body: packages/db/migrations/0548_server_plan_entitlements.sql
CREATE OR REPLACE FUNCTION app.lp_visit_evaluate(p_actor uuid,p_job uuid,p_command uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
BEGIN
 PERFORM app.mon8_require_feature(p_actor,'site_origin_capture');
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
CREATE OR REPLACE FUNCTION app.lp_sources(p_session uuid,p_job uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
CREATE OR REPLACE FUNCTION app.lp_observation_prompt(p_session uuid,p_job uuid,p_observation uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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

-- Latest body: packages/db/migrations/0690_import_ancestry_record_anchor.sql
CREATE OR REPLACE FUNCTION app.ch4_read_work_facts(t uuid,j uuid,digest text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
 -- LP6D_CH4_MEMBERSHIP: as in the body, a UUID digest is the trusted server membership ID.
  -- LP6D_DIGEST: a digest that authenticates must be the bound actor; an unauthenticated one keeps the body's own refusal.
  OR coalesce((CASE WHEN digest ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN digest::uuid ELSE (SELECT membership_id FROM app.authenticate_practice_session(digest,app.current_tenant())) END),app.current_actor()) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE events jsonb; links jsonb; lock jsonb;
BEGIN
 -- Company membership is derived from the authenticated server session, as on
 -- the existing command path. Reuse its current owner/job/track checks and facts.
 IF digest ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN
  RETURN app.ch4_command_work_facts(t,j,digest);
 END IF;
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(digest,t)) THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(WITH RECURSIVE owned(id) AS(
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=digest
  UNION SELECT job.id FROM owned source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
   JOIN app.job job ON job.tenant_id=e.tenant_id AND job.id::text=e.subject_ref AND job.provenance='imported' AND job.practice_session_digest IS NULL
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=job.id AND iv.source_job_id=source.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||job.id::text AND rv.result->>'jobId'=job.id::text AND rv.result->>'sourceJobId'=source.id::text))
 ) SELECT 1 FROM owned JOIN app.job_commercial_track track ON track.tenant_id=t AND track.job_id=owned.id WHERE owned.id=j AND track.job_track='small_builder' AND track.environment='synthetic_demo') THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('version',version,'id',id,'jobId',job_id,'sequence',sequence,'kind',kind,'factAt',to_char(fact_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'recordedAt',to_char(recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sourceReceiptId',source_receipt_id,'commandId',command_id,'predecessorId',predecessor_id,'closeReason',close_reason,'closeNote',close_note) ORDER BY fact_at,id),'[]') INTO events FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j;
 SELECT jsonb_build_object('id',id,'lockedAt',to_char(locked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) INTO lock FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'predecessorJobId',l.predecessor_job_id,'successorJobId',l.successor_job_id,'linkedAt',to_char(l.linked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY l.linked_at,l.id),'[]') INTO links FROM app.job_link l JOIN app.job predecessor ON predecessor.tenant_id=t AND predecessor.id=l.predecessor_job_id JOIN app.job successor ON successor.tenant_id=t AND successor.id=l.successor_job_id WHERE l.tenant_id=t AND (l.predecessor_job_id=j OR l.successor_job_id=j) AND predecessor.practice_session_digest=digest AND successor.practice_session_digest=digest;
 RETURN jsonb_build_object('version','job-work-state-read.v1','jobId',j,'events',events,'links',links,'lock',lock,'environment','synthetic_demo','realExternalActions',0);
END;
END
$$;

-- Latest body: packages/db/migrations/0201_job_work_state_commands.sql
CREATE OR REPLACE FUNCTION app.ch4_command_work_facts(t uuid,j uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
BEGIN
 IF input->>'action' IS DISTINCT FROM 'link' THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 RETURN app.ch4_work_state_command(t,j,digest,input);
END;
END
$$;

-- Latest body: packages/db/migrations/0698_final_check_post_invoice_rerun.sql
CREATE OR REPLACE FUNCTION app.read_final_check_reveal(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
 SELECT b0.* INTO b FROM app.final_check_run_binding b0 JOIN app.final_check_manifest m0 ON(m0.tenant_id,m0.job_id,m0.id)=(b0.tenant_id,b0.job_id,b0.manifest_id) WHERE b0.tenant_id=t AND b0.job_id=j AND b0.lock_id=l.id AND b0.evidence_cutoff_at=l.locked_at AND EXISTS(SELECT 1 FROM app.shadow_reconciliation_run r0 WHERE (r0.tenant_id,r0.job_id,r0.id,r0.status)=(t,j,b0.run_id,'completed')) ORDER BY m0.attempt DESC LIMIT 1;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('state',CASE WHEN EXISTS(SELECT 1 FROM app.final_check_source_attempt a JOIN app.final_check_manifest m ON(m.tenant_id,m.job_id,m.id)=(a.tenant_id,a.job_id,a.manifest_id) WHERE a.tenant_id=t AND a.job_id=j AND m.lock_id=l.id AND m.attempt=(SELECT max(latest.attempt) FROM app.final_check_manifest latest WHERE latest.tenant_id=t AND latest.job_id=j AND latest.lock_id=l.id) AND a.status IN('failed','unsupported') AND a.sequence=(SELECT max(x.sequence) FROM app.final_check_source_attempt x WHERE (x.tenant_id,x.job_id,x.manifest_id,x.source_id)=(a.tenant_id,a.job_id,a.manifest_id,a.source_id))) THEN 'failed' ELSE 'pending' END,'lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
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
CREATE OR REPLACE FUNCTION app.record_final_check_disposition(t uuid,j uuid,d text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  -- LP6D_DIGEST: a digest that authenticates must be the bound actor; an unauthenticated one keeps the body's own refusal.
  OR coalesce((CASE WHEN d ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN (SELECT membership_id FROM app.contractor_session(d::uuid)) ELSE (SELECT membership_id FROM app.authenticate_practice_session(d,app.current_tenant())) END),app.current_actor()) IS DISTINCT FROM app.current_actor() THEN
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
CREATE OR REPLACE FUNCTION app.read_final_check_disputes(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
CREATE OR REPLACE FUNCTION app.confirm_final_check_catch(t uuid,j uuid,d text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  -- LP6D_DIGEST: a digest that authenticates must be the bound actor; an unauthenticated one keeps the body's own refusal.
  OR coalesce((CASE WHEN d ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN (SELECT membership_id FROM app.contractor_session(d::uuid)) ELSE (SELECT membership_id FROM app.authenticate_practice_session(d,app.current_tenant())) END),app.current_actor()) IS DISTINCT FROM app.current_actor() THEN
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

-- Latest body: packages/db/migrations/0698_final_check_post_invoice_rerun.sql
CREATE OR REPLACE FUNCTION app.request_final_check_run(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE actor record;l app.final_account_lock;m app.final_check_manifest;q infrastructure.final_check_request;next_attempt integer:=1;
BEGIN
 -- Same owner, practice-session, synthetic small-builder and accepted-terms authority as the builder reads.
 SELECT * INTO actor FROM app.final_check_builder(t,j,d,true);
 IF NOT app.final_check_practice_owns_job(t,j,d) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.ch4_require_open(t,j);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 SELECT * INTO m FROM app.final_check_manifest WHERE tenant_id=t AND job_id=j AND lock_id=l.id ORDER BY attempt DESC LIMIT 1;
 IF FOUND THEN
  PERFORM app.require_final_check_rerun(t,j,m.id);
  next_attempt:=m.attempt+1;
 END IF;
 INSERT INTO infrastructure.final_check_request(lock_id,tenant_id,job_id,attempt) VALUES(l.id,t,j,next_attempt) ON CONFLICT DO NOTHING;
 SELECT * INTO q FROM infrastructure.final_check_request WHERE tenant_id=t AND job_id=j AND lock_id=l.id AND attempt=next_attempt;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('version','final-check-run-request.v1','lockId',l.id,'attempt',q.attempt,'manifestId',q.manifest_id,'state','requested','environment','synthetic_demo');
END;
END
$$;

-- Latest body: packages/db/migrations/0303_job_source_intake.sql
CREATE OR REPLACE FUNCTION app.sv7a_require_watchdog_live_lock(t uuid,j uuid,digest text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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

-- Latest body: packages/db/migrations/0522_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.sv7a_intake_job_source(t uuid,j uuid,digest text,source text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE actor uuid; cid uuid; request_digest text; prior app.command_receipt; allowed text[]; txt text; raw bytea; h text;
 sid uuid:=gen_random_uuid(); ev uuid:=gen_random_uuid(); ver text:=gen_random_uuid()::text; audit_id uuid:=gen_random_uuid();
 lp5_claim jsonb; lp5_input jsonb;
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
 BEGIN actor:=app.sv7a_require_source_owner(t,j,digest,source); EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
 -- Evidence registration holds SHARE on the job, matching the merged watchdog live guard.
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtextextended('watchdog-command-id:'||t::text||':'||cid::text,0));
 BEGIN actor:=app.sv7a_require_source_owner(t,j,digest,source); EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
 lp5_input:=jsonb_build_object('jobId',j,'actor',actor,'sessionDigest',digest,'source',source,'input',input);
 request_digest:=app.final_lock_hash(jsonb_build_object('jobId',j,'actor',actor,'sessionDigest',digest,'source',source,'input',input));
 IF EXISTS(SELECT 1 FROM app.watchdog_command_identity WHERE tenant_id=t AND command_id=cid AND (job_id<>j OR command_type<>ctype OR request_hash<>request_digest))
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
 BEGIN
  lp5_claim:=app.begin_command('repository-command.v1',cid,ctype,cid::text,
   jsonb_build_object('tenantId',t,'actorMembershipId',actor,'subjectType','job','subjectRef',j),'{}'::jsonb,
   jsonb_build_object('version','repository-command.v1','actorMembershipId',actor,'input',lp5_input,'legacyJson',app.final_lock_canonical(lp5_input)));
 EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501';
 WHEN unique_violation THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END;
  RETURN (lp5_claim->'result');
 END IF;
 -- New writes only below. Holds precede every effect.
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 PERFORM app.require_watchdog_live(j);
 IF source='diary' AND (input->>'onSite')::boolean THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
  PERFORM app.ch4_require_open(t,j);
  IF EXISTS(SELECT 1 FROM app.job x WHERE x.tenant_id=t AND x.id=j AND x.practice_session_digest IS NULL) THEN PERFORM app.ch4_admit_place(t,j,'restart'); END IF;
 END IF;
 IF app.ch4_legacy_command_owned(t,cid) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 BEGIN
  lp5_claim:=app.begin_command('repository-command.v1',cid,ctype,cid::text,
   jsonb_build_object('tenantId',t,'actorMembershipId',actor,'subjectType','job','subjectRef',j),'{}'::jsonb,
   jsonb_build_object('version','repository-command.v1','actorMembershipId',actor,'input',lp5_input,'legacyJson',app.final_lock_canonical(lp5_input)));
 EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501';
 WHEN unique_violation THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END;
 IF (lp5_claim->>'kind')='replay' THEN RETURN (lp5_claim->'result'); END IF;
 INSERT INTO app.watchdog_command_identity(tenant_id,command_id,job_id,command_type,request_hash) VALUES(t,cid,j,ctype,request_digest);
 at_time:=clock_timestamp(); raw:=convert_to(txt,'UTF8'); h:=encode(pg_catalog.sha256(raw),'hex'); okey:='synthetic/job-sources/'||sid::text;
 -- Only the reviewed fictional originals carry a decoder reference; exact text and kind, chosen by the server.
 ref:=CASE WHEN source='diary' AND txt='Fitted outside tap.' THEN 'job-source:outside-tap.v1' WHEN source='customer_message' AND txt='Please fit an outside tap.' THEN 'job-source:request-tap.v1' WHEN source='customer_message' AND txt='There are exposed live wires beside the new socket.' THEN 'customer-message:exposed-wires.synthetic.v1' END;
 INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_received_at,server_verified_at)
 VALUES(ev,t,j,okey,h,'text/plain; charset=utf-8',32000,'standard_evidence',at_time+interval '1 day','verified',ver,at_time,clock_timestamp());
 INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
 VALUES(ev,t,ev,j,'original',CASE WHEN source='diary' THEN 'job_diary_text' ELSE 'customer_message_text' END,okey,ver,h,octet_length(raw),'text/plain; charset=utf-8','standard_evidence',at_time,clock_timestamp());
 INSERT INTO app.job_source_original(tenant_id,job_id,evidence_id,source_kind,source_id,object_key,object_version_id,bytes,sha256,byte_length,source_received_at,verified_at,synthetic_fixture_ref)
 VALUES(t,j,ev,source,sid,okey,ver,raw,h,octet_length(raw),at_time,clock_timestamp(),ref);
 IF source='diary' THEN
  INSERT INTO app.job_diary_entry(tenant_id,job_id,id,command_id,actor_membership_id,entry_mode,on_site,evidence_id,object_version_id,sha256,source_received_at)
  VALUES(t,j,sid,cid,actor,input->>'entryMode',(input->>'onSite')::boolean,ev,ver,h,at_time);
 ELSE
  INSERT INTO app.customer_message_source(tenant_id,job_id,id,command_id,actor_membership_id,fictional_role_name,evidence_id,object_version_id,sha256,source_received_at)
  VALUES(t,j,sid,cid,actor,input->'fictionalCustomer'->>'name',ev,ver,h,at_time);
 END IF;
 rec_json:=jsonb_build_object('id',sid,'commandId',cid,'text',txt,'actualTesterMembershipId',actor,
  'evidence',jsonb_build_object('id',ev,'objectVersionId',ver,'sha256',h,'serverReceivedAt',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
  ||CASE WHEN source='diary' THEN jsonb_build_object('entryMode',input->>'entryMode','onSite',(input->>'onSite')::boolean)
   ELSE jsonb_build_object('fictionalCustomer',jsonb_build_object('kind','named_fictional_customer','name',input->'fictionalCustomer'->>'name')) END;
 out_result:=jsonb_build_object('version','job-source-intake-receipt.v1','jobId',j,'sourceKind',source,'record',rec_json,'environment','synthetic_demo','realExternalActions',0)
  ||CASE WHEN source='diary' THEN jsonb_build_object('notice','Notes are for your records. To bill for extra work, use Log an extra. JobGuard checks your records against your final bill after you complete it.','noticeVersion','job-diary-notice.v1') ELSE '{}'::jsonb END;
 PERFORM app.lp5_bind_effect(cid,NULL,'source_intake',jsonb_build_object('result',out_result));
 -- Identifiers and hashes only in the audit chain; never the note text.
 -- Same per-tenant chain as other lock/check events; this helper takes any event type (append_final_lock_audit allows only four).
 PERFORM app.append_final_check_audit(audit_id,'membership:'||actor::text,j,CASE WHEN source='diary' THEN 'job_source.diary_recorded' ELSE 'job_source.customer_message_recorded' END,
  jsonb_build_object('commandId',cid,'sourceId',sid,'evidenceId',ev,'sha256',h));
 BEGIN out_result:=app.complete_command(cid,'{}'::jsonb);
 EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
 BEGIN PERFORM app.sv7a_require_source_owner(t,j,digest,source); EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
 RETURN out_result;
END;
END
$$;

-- Latest body: packages/db/migrations/0306_evidence_pack_v3.sql
CREATE OR REPLACE FUNCTION app.read_evidence_pack_v3(t uuid,c uuid,d text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (CASE WHEN d ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN (SELECT membership_id FROM app.contractor_session(d::uuid)) ELSE (SELECT membership_id FROM app.authenticate_practice_session(d,app.current_tenant())) END) IS DISTINCT FROM app.current_actor() THEN
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor()
  OR p_tenant IS DISTINCT FROM app.current_tenant()
  -- LP6D_DIGEST: a digest that authenticates must be the bound actor; an unauthenticated one keeps the body's own refusal.
  OR coalesce((CASE WHEN p_digest ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN (SELECT membership_id FROM app.contractor_session(p_digest::uuid)) ELSE (SELECT membership_id FROM app.authenticate_practice_session(p_digest,app.current_tenant())) END),app.current_actor()) IS DISTINCT FROM app.current_actor() THEN
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

-- Latest body: packages/db/migrations/0660_baseline_ancestry_audit_trust.sql
CREATE OR REPLACE FUNCTION app.decision_check_command(p_digest text,p_command jsonb,p_phase text,p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  -- LP6D_DIGEST: a digest that authenticates must be the bound actor; an unauthenticated one keeps the body's own refusal.
  OR coalesce((CASE WHEN p_digest ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN (SELECT membership_id FROM app.contractor_session(p_digest::uuid)) ELSE (SELECT membership_id FROM app.authenticate_practice_session(p_digest,app.current_tenant())) END),app.current_actor()) IS DISTINCT FROM app.current_actor() THEN
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
     AND next_job.provenance='imported' AND next_job.practice_session_digest IS NULL AND (EXISTS(SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=next_job.id AND iv.source_job_id=source.id) OR EXISTS(SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded' AND rv.semantic_key='import:'||next_job.id::text AND rv.result->>'jobId'=next_job.id::text AND rv.result->>'sourceJobId'=source.id::text))
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

-- Latest body: packages/db/migrations/0696_contractor_admin_expected_revision.sql
CREATE OR REPLACE FUNCTION app.contractor_admin_command(actor uuid, payload jsonb, request_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; k text:=payload->>'kind'; target uuid; permission text; rev integer; prior app.command_receipt; result jsonb; member uuid; account uuid; user_id uuid; rule_id uuid; contract_revision integer; g record; actor_owner boolean;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF payload->>'version' IS DISTINCT FROM 'contractor-command.v1' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF NOT coalesce(app.contractor_member_active(actor),false) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF k NOT IN('grant.revoke','membership.revoke') THEN
  PERFORM app.mon8_require_feature(actor,CASE WHEN k='contract.revise' THEN 'approval_chains' ELSE 'operative_roles' END);
 END IF;
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
 IF (payload->>'expectedRevision') IS NULL OR rev<>(payload->>'expectedRevision')::integer THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 -- Subject IDs are one namespace: contractor_allowed resolves a bare UUID across units, teams and clients,
 -- so a new subject may never reuse an ID that already names another subject (or the tenant). Serialised by the tenant lock above.
 IF k IN('unit.create','team.create','client.create') AND ((payload->>'id')::uuid=t
   OR EXISTS(SELECT 1 FROM app.org_unit WHERE tenant_id=t AND id=(payload->>'id')::uuid)
   OR EXISTS(SELECT 1 FROM app.team WHERE tenant_id=t AND id=(payload->>'id')::uuid)
   OR EXISTS(SELECT 1 FROM app.client_organisation WHERE tenant_id=t AND id=(payload->>'id')::uuid))
 THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 IF k IN('grant.create','grant.revoke','membership.revoke') THEN
  actor_owner:=EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner')
   OR EXISTS(SELECT 1 FROM app.role_grant x WHERE x.tenant_id=t AND x.membership_id=actor AND x.role='owner'
    AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(x.tenant_id,x.id)));
 END IF;
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
  IF member=actor AND NOT actor_owner THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO app.role_grant VALUES(t,(payload->>'id')::uuid,(payload->>'membershipId')::uuid,payload->>'role',payload->'scope'->>'kind',(payload->'scope'->>'id')::uuid,(payload->>'contractId')::uuid);
 WHEN 'grant.revoke' THEN
  IF NOT actor_owner AND EXISTS(
   SELECT 1 FROM app.role_grant x JOIN app.membership m ON(m.tenant_id,m.id)=(x.tenant_id,x.membership_id)
   WHERE x.tenant_id=t AND x.id=(payload->>'grantId')::uuid AND (m.role='owner' OR x.role='owner' OR EXISTS(
    SELECT 1 FROM app.role_grant o WHERE o.tenant_id=t AND o.membership_id=x.membership_id AND o.role='owner'
    AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(o.tenant_id,o.id)))))
  THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO app.role_grant_revocation VALUES(t,(payload->>'id')::uuid,(payload->>'grantId')::uuid);
 WHEN 'membership.revoke' THEN
  IF NOT actor_owner AND (EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=member AND role='owner')
   OR EXISTS(SELECT 1 FROM app.role_grant o WHERE o.tenant_id=t AND o.membership_id=member AND o.role='owner'
    AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(o.tenant_id,o.id))))
  THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO app.contractor_membership_revocation VALUES(t,(payload->>'id')::uuid,(payload->>'membershipId')::uuid);
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

-- Latest body: packages/db/migrations/0548_server_plan_entitlements.sql
CREATE OR REPLACE FUNCTION app.enterprise_baseline_actor(p_session uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE a uuid;
BEGIN
 a:=app.mon8_retained_baseline_actor(p_session);
 PERFORM app.mon8_require_feature(a,'work_orders');
 RETURN a;
END;
END
$$;

-- Latest body: packages/db/migrations/0520_lp4_database_audit.sql
CREATE OR REPLACE FUNCTION app.enterprise_baseline_import(p_session uuid,p_history text,p_hash text,p_bindings jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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

-- Latest body: packages/db/migrations/0548_server_plan_entitlements.sql
CREATE OR REPLACE FUNCTION app.enterprise_baseline_read(p_session uuid,p_batch uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; h jsonb;
BEGIN
 a:=app.mon8_retained_baseline_actor(p_session);
 SELECT b.history INTO h FROM app.enterprise_baseline_batch b WHERE b.tenant_id=t AND b.id=p_batch
  AND EXISTS(SELECT 1 FROM app.enterprise_baseline_team m WHERE(m.tenant_id,m.batch_id)=(t,b.id))
  AND NOT EXISTS(SELECT 1 FROM app.enterprise_baseline_team m WHERE(m.tenant_id,m.batch_id)=(t,b.id)
    AND NOT coalesce(app.contractor_allowed(a,'dashboard.read',m.team_id),false));
 IF h IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN h;
END;
END
$$;

-- Latest body: packages/db/migrations/0522_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.record_repository_command(p_command uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  -- A genuinely missing row falls through to the routine's own NOT_FOUND; another actor's row is refused here.
  OR EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=app.current_tenant() AND command_id=p_command AND actor_membership_id IS DISTINCT FROM app.current_actor()) THEN
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

-- Latest body: packages/db/migrations/0522_lp5b_writers.sql
CREATE OR REPLACE FUNCTION app.lp5b_prepare_projection(p_command uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  -- A genuinely missing row falls through to the routine's own NOT_FOUND; another actor's row is refused here.
  OR EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=app.current_tenant() AND command_id=p_command AND actor_membership_id IS DISTINCT FROM app.current_actor()) THEN
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

-- Latest body: packages/db/migrations/0722_abandoned_visit_authority.sql
CREATE OR REPLACE FUNCTION app.lp5b_contractor_permission(p_type text,p_actor uuid,p_job uuid,p_input jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 v jsonb:=(CASE WHEN (p_input ? 'content') THEN (p_input->'content') ELSE p_input END);
 role_name text; allowed boolean; roles text[]; step jsonb; req app.extra_approval_request;
BEGIN
 IF p_type='CloseAbandonedSiteVisit' THEN
  IF current_database()<>'jobguard_synthetic_demo' OR p_actor IS DISTINCT FROM app.current_actor()
   OR t IS DISTINCT FROM app.current_tenant() OR role_name NOT IN('owner','admin')
   OR NOT coalesce(app.contractor_allowed(p_actor,'organisation.manage',app.contractor_job_team(p_job)),false) THEN
   RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  RETURN;
 END IF;
 IF p_type='IssueClientApproval' THEN
 IF app.xc_send_authority(p_actor,p_job) IS NOT TRUE THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 RETURN;
 END IF;
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
 WHEN 'WithdrawExtra' THEN allowed:=app.xa_covers(p_actor,ARRAY['supervisor','surveyor','commercial_manager'],p_job,'job.read') IS NOT NULL;
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

-- Latest body: packages/db/migrations/0548_server_plan_entitlements.sql
CREATE OR REPLACE FUNCTION app.practice_worker_switch_on(p_session uuid,p_command uuid,p_worker uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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

 PERFORM app.mon8_require_feature(live.membership_id,'operative_roles');
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
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE lp6d_bound boolean;
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 -- Ben's LP-6b ruling (5 Nov) keeps ContractorPracticeSessionRepository.revoke as the named
 -- "contractor-session-revoke" skip: the holder must still be able to end their own session
 -- after membership revocation, which no binding can express (a revoked base never binds).
 -- So a BOUND caller must be this very session's actor; the unbound skip path keeps the body's
 -- own live-credential and tenant authentication below, exactly as before LP-6d.
 BEGIN PERFORM app.current_actor(); lp6d_bound:=true;
 EXCEPTION WHEN insufficient_privilege THEN lp6d_bound:=false; END;
 IF NOT lp6d_bound THEN NULL;
 ELSIF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.lp6d_contractor_session_identity(s) bound_session WHERE bound_session.tenant_id=app.current_tenant() AND bound_session.membership_id=app.current_actor()) THEN
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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

-- Latest body: packages/db/migrations/0637_extra_working_day_wait.sql
CREATE OR REPLACE FUNCTION app.xa_escalate() RETURNS TABLE(request_id uuid, job_id uuid, variation_id uuid, step_index integer, eligible_roles text[])
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_column

BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
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
  IF q.request_revision<>(SELECT max(r.request_revision) FROM app.extra_approval_request r WHERE r.tenant_id=q.tenant_id AND r.variation_id=q.variation_id) THEN CONTINUE; END IF;
  SELECT count(*),max(f.server_recorded_at) INTO v_n,v_started FROM app.extra_approval_step_fact f WHERE(f.tenant_id,f.request_id)=(q.tenant_id,q.id);
  v_started:=coalesce(v_started,q.server_recorded_at); v_step:=q.requirement->'steps'->v_n;
  CONTINUE WHEN v_step IS NULL OR v_step->>'kind'<>'human' OR v_step->>'role'='client_approver';
  CONTINUE WHEN clock_timestamp()<app.xa_wait_deadline(v_started,v_step);
  v_roles:=array_remove(ARRAY[v_step->>'escalationRole']||ARRAY(SELECT jsonb_array_elements_text(v_step->'alternateRoles')),NULL);
  CONTINUE WHEN cardinality(v_roles)=0;
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
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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

-- Latest body: packages/db/migrations/0548_server_plan_entitlements.sql
CREATE OR REPLACE FUNCTION app.ent3a_extra_authority(p_actor uuid, p_command_type text, p_job uuid)
RETURNS TABLE(decision text, reason_code text, raising_grant uuid)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
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
 PERFORM app.mon8_require_feature(p_actor,'site_origin_capture');
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
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
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

-- Latest body: packages/db/migrations/0549_contractor_feature_guards.sql
CREATE OR REPLACE FUNCTION app.xa_begin(p_job uuid, p_command uuid, p_types text[], p_actor uuid) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE v_tenant uuid; v_receipt app.command_receipt;
BEGIN
 IF p_types IS DISTINCT FROM ARRAY['RevokeClientApproval']::text[] THEN PERFORM app.mon8_require_feature(p_actor,'approval_chains'); END IF;
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
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
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

-- Latest body: packages/db/migrations/0690_import_ancestry_record_anchor.sql
CREATE OR REPLACE FUNCTION app.evidence_pack_v3_owner(t uuid,c uuid,d text) RETURNS uuid
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (CASE WHEN d ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN (SELECT membership_id FROM app.contractor_session(d::uuid)) ELSE (SELECT membership_id FROM app.authenticate_practice_session(d,app.current_tenant())) END) IS DISTINCT FROM app.current_actor() THEN
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
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=child.id AND iv.source_job_id=source.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||child.id::text AND rv.result->>'jobId'=child.id::text AND rv.result->>'sourceJobId'=source.id::text))
 ) SELECT EXISTS(SELECT 1 FROM owned_jobs WHERE id=j) INTO owned;
 IF NOT owned OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND environment='synthetic_demo' AND job_track='small_builder')
 OR NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 RETURN j;
END;
END
$$;

-- Latest body: packages/db/migrations/0690_import_ancestry_record_anchor.sql
CREATE OR REPLACE FUNCTION app.ch4_require_command_owner(t uuid,j uuid,digest text) RETURNS uuid
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
 -- LP6D_CH4_MEMBERSHIP: as in the body, a UUID digest is the trusted server membership ID.
  -- LP6D_DIGEST: a digest that authenticates must be the bound actor; an unauthenticated one keeps the body's own refusal.
  OR coalesce((CASE WHEN digest ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN digest::uuid ELSE (SELECT membership_id FROM app.authenticate_practice_session(digest,app.current_tenant())) END),app.current_actor()) IS DISTINCT FROM app.current_actor() THEN
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
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=job.id AND iv.source_job_id=source.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||job.id::text AND rv.result->>'jobId'=job.id::text AND rv.result->>'sourceJobId'=source.id::text))
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

-- Latest body: packages/db/migrations/0518_shadow_demo_guide.sql
CREATE OR REPLACE FUNCTION app.demo_request_source_hold(t uuid,j uuid,d text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(d,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE actor record; request uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM app.final_check_builder(t,j,d);
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RAISE EXCEPTION 'DEMO_SOURCE_HOLD_LOCKED' USING ERRCODE='P0001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'DEMO_SOURCE_HOLD_TERMS_REQUIRED' USING ERRCODE='P0001'; END IF;
 SELECT id INTO request FROM infrastructure.demo_source_hold_request WHERE tenant_id=t AND job_id=j AND finished_at IS NULL;
 IF request IS NULL THEN
  request:=gen_random_uuid();
  INSERT INTO infrastructure.demo_source_hold_request(id,tenant_id,job_id) VALUES(request,t,j);
 END IF;
 RETURN jsonb_build_object('version','demo-source-hold.v1','state','requested','realExternalActions',0);
END;
END
$$;

-- Latest body: packages/db/migrations/0518_shadow_demo_guide.sql
CREATE OR REPLACE FUNCTION app.demo_source_hold_state(t uuid,j uuid,d text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(d,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE actor record; r infrastructure.demo_source_hold_request;
BEGIN
 -- Authority first: a stranger gets the same refusal in every database, so the answer never depends on its name.
 SELECT * INTO actor FROM app.final_check_builder(t,j,d);
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM infrastructure.demo_source_hold_request WHERE tenant_id=t AND job_id=j ORDER BY requested_at DESC LIMIT 1;
 RETURN jsonb_build_object('version','demo-source-hold.v1','realExternalActions',0,
  'state',CASE WHEN r.id IS NULL THEN 'not_requested' WHEN r.finished_at IS NULL THEN 'requested' ELSE 'finished' END);
END;
END
$$;

-- Latest body: packages/db/migrations/0650_demo_customer_link_reference.sql
CREATE OR REPLACE FUNCTION app.demo_issue_customer_link(t uuid,j uuid,c uuid,session_digest text,link_digest text,content text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(session_digest,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE actor record; m app.membership; b app.job_party_binding; recipient text; g uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); ts timestamptz; hash text;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM app.final_check_builder(t,j,session_digest);
 -- Narrow: only the practice tenant, only after lock, only while a found extra exists for the customer to review.
 IF t<>'11111111-1111-4111-8111-111111111111'::uuid THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j)
  OR NOT EXISTS(SELECT 1 FROM app.extra_origin WHERE tenant_id=t AND job_id=j AND kind='jobguard_catch') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,387));
 SELECT * INTO m FROM app.membership WHERE tenant_id=t AND id=actor.member_id AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 SELECT bnd.* INTO b FROM app.job_party_current pc JOIN app.job_party_binding bnd ON(bnd.tenant_id,bnd.job_id,bnd.id)=(pc.tenant_id,pc.job_id,pc.binding_id)
 WHERE pc.tenant_id=t AND pc.job_id=j AND bnd.customer_id=c FOR SHARE OF pc;
 SELECT lower(payload->>'email') INTO recipient FROM app.customer_revision WHERE tenant_id=t AND id=b.customer_revision_id;
 IF b.id IS NULL OR recipient IS NULL OR recipient !~ '^[^@[:space:]]+@[^@[:space:]]+\.invalid$' OR link_digest IS NULL OR link_digest !~ '^[a-f0-9]{64}$'
  OR content IS NULL OR length(content)>4096 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 -- Preserve exact legacy path validation for existing synthetic callers, but never persist a credential.
 IF content ~ ('^/customer/sign-in#'||t::text||'/'||j::text||'/'||c::text||'/[A-Za-z0-9_-]{43}$') THEN
  content:='customer-signin-redacted.v1:'||encode(sha256(convert_to(content,'UTF8')),'hex');
 ELSE
  -- Same non-credential reference boundary as 0533's identity.customer_portal_issue.
  IF content !~ ('^customer-signin-reference\.v1:'||t::text||'/'||j::text||'/'||c::text||'/[A-Za-z0-9_-]{43}$') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 END IF;
 ts:=clock_timestamp();
 IF EXISTS(SELECT 1 FROM app.customer_portal_grant WHERE tenant_id=t AND job_id=j AND issued_at>ts-interval '1 minute') THEN RAISE EXCEPTION 'CUSTOMER_LINK_RATE_LIMITED' USING ERRCODE='P0001'; END IF;
 UPDATE app.action_outbox SET status='cancelled',updated_at=ts WHERE tenant_id=t AND id IN(SELECT outbox_id FROM app.customer_portal_grant WHERE tenant_id=t AND job_id=j) AND status IN('pending','retryable');
 UPDATE app.customer_portal_grant SET revoked_at=ts WHERE tenant_id=t AND job_id=j AND revoked_at IS NULL;
 hash:=encode(sha256(convert_to(content,'UTF8')),'hex');
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(d,t,'customer_portal',g::text,'customer_portal.signin.send');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(r,t,d,'approved',m.id);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at)
 VALUES(a,t,d,r,m.id,'customer_portal.signin.send',recipient,hash,b.revision,'customer-signin.synthetic.v1',ts+interval '10 minutes');
 INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,policy_version,authorization_expires_at)
 VALUES(o,t,a,'fake_email','customer-signin:'||g::text,'customer_portal.signin.send',recipient,hash,content,b.revision,'customer-signin.synthetic.v1',ts+interval '10 minutes');
 INSERT INTO app.customer_portal_grant(tenant_id,id,company_id,job_id,customer_id,party_binding_id,customer_revision_id,token_digest,issuer_membership_id,outbox_id,issued_at,expires_at)
 VALUES(t,g,m.account_id,j,c,b.id,b.customer_revision_id,link_digest,m.id,o,ts,ts+interval '10 minutes');
 IF NOT app.customer_portal_current((SELECT x FROM app.customer_portal_grant x WHERE tenant_id=t AND id=g)) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.customer_portal_audit(t,g,'issued');
 RETURN g;
END;
END
$$;

-- Latest body: packages/db/migrations/0518_shadow_demo_guide.sql
CREATE OR REPLACE FUNCTION app.demo_shadow_review_inputs(t uuid,j uuid,d text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(d,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE actor record; rows jsonb;
BEGIN
 -- Authority first: a stranger gets the same refusal in every database, so the answer never depends on its name.
 SELECT * INTO actor FROM app.final_check_builder(t,j,d);
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED' USING ERRCODE='P0001'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('caseId',c.id,'workId',s.work_id,
   'assessmentId',latest.assessment_id,'reviewArtifactHash',latest.hash) ORDER BY c.id),'[]') INTO rows
 FROM app.recovery_case_current c
 JOIN LATERAL jsonb_array_elements_text(to_jsonb(c.source_refs)) ref(value) ON ref.value LIKE 'signal:%'
 JOIN app.shadow_commercial_signal s ON s.tenant_id=c.tenant_id AND s.job_id=c.job_id AND s.id=substr(ref.value,8)::uuid
 LEFT JOIN LATERAL (SELECT r.document->>'assessmentId' assessment_id,app.final_lock_hash(r.document) hash FROM app.recovery_attribution_revision r
  WHERE r.tenant_id=c.tenant_id AND r.job_id=c.job_id AND r.case_id=c.id ORDER BY r.revision DESC LIMIT 1) latest ON true
 WHERE c.tenant_id=t AND c.job_id=j AND c.case_type='missed_variation_final_account';
 RETURN jsonb_build_object('version','demo-shadow-review-inputs.v1','realExternalActions',0,'cases',rows);
END;
END
$$;


-- Non-raising probe used only where a Ben-ruled LP-6b skip remains open (a read-only GET or the
-- holder ending their own session): a bound request must match; an unbound one is the named skip.
CREATE FUNCTION app.lp6d_request_bound() RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM app.current_actor(); RETURN true;
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
ALTER FUNCTION app.lp6d_request_bound() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6d_request_bound() FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
-- The integrity readers below are SECURITY INVOKER, so the request role runs this boolean probe itself.
GRANT EXECUTE ON FUNCTION app.lp6d_request_bound() TO jobguard_runtime;

-- Latest body: packages/db/migrations/0660_baseline_ancestry_audit_trust.sql
CREATE OR REPLACE FUNCTION app.ch6_integrity_sources(t uuid,j uuid,d text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog STABLE AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 -- Ben's LP-6b ruling (5 Nov) keeps CommercialIntegrityV3Repository.read/readFamily as the named
 -- read-only "commercial-integrity-read" skips: no session-binding write enters that advisory GET.
 -- A BOUND caller (review) must be the digest's own actor; the unbound skip keeps the body's
 -- own practice-session scope authorization, exactly as before LP-6d.
 IF NOT app.lp6d_request_bound() THEN NULL;
 ELSIF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(d,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE ordinary jsonb; quotes jsonb; activations jsonb; activity jsonb; events jsonb; assertions jsonb;
 published jsonb:=NULL; publication jsonb; availability jsonb; start_at text; end_at text; now_at text; has_lock boolean; actor uuid;
BEGIN
 actor:=app.ch6_integrity_authority(t,j,d);
 IF app.ch6_integrity_family(t,j)<>'v3' THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 SELECT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) INTO has_lock;
 -- Only exact, owned, immutable accepted documents and their saved party bindings. No fuzzy identity matching.
 -- Start with this job and exact party-related accepted jobs, then prove each
 -- candidate's ownership by walking its ancestors, never the whole session tree.
 WITH RECURSIVE candidates AS (
  SELECT jb.id FROM app.job jb WHERE jb.tenant_id=t AND (jb.id=j OR EXISTS(
   SELECT 1 FROM app.quote_document_version current_doc
   JOIN app.job current_job ON current_job.tenant_id=t AND current_job.id=j AND current_job.accepted_quote_version_id=current_doc.id
   JOIN app.job_party_binding current_binding ON current_binding.tenant_id=t AND current_binding.job_id=j AND current_binding.id::text=current_doc.snapshot->'jobParties'->>'bindingId'
   JOIN app.quote_document_version related_doc ON related_doc.tenant_id=t AND related_doc.job_id=jb.id AND related_doc.id=jb.accepted_quote_version_id
   JOIN app.job_party_binding related_binding ON related_binding.tenant_id=t AND related_binding.job_id=jb.id AND related_binding.id::text=related_doc.snapshot->'jobParties'->>'bindingId'
   WHERE current_doc.tenant_id=t AND current_doc.job_id=j AND related_binding.customer_id=current_binding.customer_id AND related_binding.site_id=current_binding.site_id
  ))
 ), ancestry AS (
  SELECT id AS candidate_id,id FROM candidates
  UNION SELECT source.candidate_id,parent.id FROM ancestry source
  JOIN app.job child ON child.tenant_id=t AND child.id=source.id AND child.provenance='imported' AND child.practice_session_digest IS NULL
  JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.subject_ref=child.id::text
  JOIN app.job parent ON parent.tenant_id=t AND parent.id::text=e.payload->'references'->>'sourceJobId' AND (EXISTS(SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=child.id AND iv.source_job_id=parent.id) OR EXISTS(SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded' AND rv.semantic_key='import:'||child.id::text AND rv.result->>'jobId'=child.id::text AND rv.result->>'sourceJobId'=parent.id::text))
 ), owned AS (
  SELECT DISTINCT source.candidate_id AS id FROM ancestry source JOIN app.job root ON root.tenant_id=t AND root.id=source.id AND root.practice_session_digest=d
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,a.job_id,d,a.id::text,'quote_acceptance',a.recorded_at,
 jsonb_build_object('document',doc.content_hash,'binding',b.id,'customer',b.customer_id,'site',b.site_id)),
 'status','accepted','customerId',coalesce(b.customer_id::text,'unbound'),'siteId',coalesce(b.site_id::text,'unbound'),'bindingConfirmed',b.id IS NOT NULL,
 'value',jsonb_build_object('pence',(doc.snapshot->>'netPence')::bigint,'currency','GBP','basis','net'),
 'acceptedAt',to_char(a.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY a.id),'[]') INTO quotes
 FROM app.quote_acceptance a JOIN owned o ON o.id=a.job_id JOIN app.job jb ON jb.tenant_id=t AND jb.id=a.job_id AND jb.accepted_quote_version_id=a.document_id
 JOIN app.quote_document_version doc ON(doc.tenant_id,doc.job_id,doc.id,doc.content_hash)=(a.tenant_id,a.job_id,a.document_id,a.document_hash)
 LEFT JOIN LATERAL (SELECT bind.* FROM app.job_party_binding bind WHERE bind.tenant_id=t AND bind.job_id=a.job_id AND bind.id::text=doc.snapshot->'jobParties'->>'bindingId' LIMIT 1) b ON true
 WHERE a.tenant_id=t AND jsonb_typeof(doc.snapshot->'netPence')='number' AND (doc.snapshot->>'netPence')~'^[0-9]+$'
 AND NOT EXISTS(SELECT 1 FROM app.acceptance_event cancelled WHERE cancelled.tenant_id=t AND cancelled.job_id=a.job_id AND (cancelled.acceptance_id=a.id OR (cancelled.kind='superseded' AND cancelled.document_id=a.document_id)) AND cancelled.kind IN('acceptance_cancelled','superseded') AND cancelled.recorded_at>=a.recorded_at);
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,a.id::text,'job_activation',a.recorded_at,jsonb_build_object('id',a.id,'document',a.accepted_document_hash))) ORDER BY a.id),'[]') INTO activations FROM app.job_activation a WHERE a.tenant_id=t AND a.job_id=j;
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,x.id::text,x.kind,x.created_at,x.content,x.provenance),'activityKind',x.activity) ORDER BY x.kind,x.id),'[]') INTO activity
 FROM (SELECT i.id,i.created_at,'customer_invoice'::text kind,'invoice'::text activity,jsonb_build_object('id',i.id,'source',i.source_hash,'pdf',i.pdf_sha256) content,'server_recorded'::text provenance FROM app.customer_invoice i WHERE i.tenant_id=t AND i.job_id=j
 UNION ALL SELECT p.id,p.created_at,'customer_payment','payment',jsonb_build_object('id',p.id,'invoice',p.invoice_id,'pence',p.amount_pence),'builder_attested' FROM app.customer_payment p WHERE p.tenant_id=t AND p.job_id=j) x;
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,e.id::text,'job_work_state_event',e.fact_at,jsonb_build_object('id',e.id,'request',e.request_hash,'kind',e.kind,'predecessor',e.predecessor_id)),
 'kind',CASE e.kind WHEN 'finished_on_site' THEN 'finish' WHEN 'finished_cancelled' THEN 'cancel_finish' WHEN 'resumed' THEN 'resume' WHEN 'closed' THEN 'close' ELSE 'reopen' END,'predecessorId',e.predecessor_id::text) ORDER BY e.sequence),'[]') INTO events
 FROM app.job_work_state_event e WHERE e.tenant_id=t AND e.job_id=j AND e.kind IN('finished_on_site','finished_cancelled','resumed','closed','reopened');
 -- Minimized same-tenant, same-current-user equality only. No cross-tenant registry or raw user/phone/card value is returned.
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,encode(sha256(convert_to(d||':user','UTF8')),'hex'),'account_user_assertion',x.first_at,x.content),
 'identifierKind','user','scopeId',d,'subjectRef',encode(sha256(convert_to(d||':user','UTF8')),'hex'),'authorityRef','current-tenant-membership',
 'purpose','synthetic_integrity','validFrom',to_char(x.first_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'validUntil','9999-12-31T23:59:59.999999Z','sharing','unexplained')),'[]') INTO assertions
 FROM (SELECT min(m.created_at) first_at,jsonb_agg(jsonb_build_object('membership',m.id,'account',m.account_id) ORDER BY m.id) content
 FROM app.membership own JOIN app.membership m ON m.tenant_id=own.tenant_id AND m.identity_user_id=own.identity_user_id
 WHERE own.tenant_id=t AND own.id=actor AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 GROUP BY own.identity_user_id HAVING count(DISTINCT m.account_id)>1) x;
 SELECT assertions||coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,a.id::text,'synthetic_identifier_assertion',a.recorded_at,(to_jsonb(a)-'recorded_at'-'valid_from'-'valid_until')||jsonb_build_object('validFrom',to_char(a.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'validUntil',to_char(a.valid_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))),
 'identifierKind',a.identifier_kind,'scopeId',d,'subjectRef',a.subject_ref,'authorityRef',a.authority_ref,'purpose','synthetic_integrity',
 'validFrom',to_char(a.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'validUntil',to_char(a.valid_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sharing',a.sharing) ORDER BY a.id),'[]') INTO assertions
 FROM app.ch6_identifier_assertion a WHERE a.tenant_id=t AND a.job_id=j AND a.session_digest=d;
 ordinary:=jsonb_build_object('lockState',CASE WHEN has_lock THEN 'present' ELSE 'absent' END,'quotes',quotes,'activations',activations,'activity',activity,'workEvents',events,'assertions',assertions);
 availability:='["identifier_phone_source_unavailable","identifier_card_source_unavailable","writeoff_line_source_unavailable","receipt_line_source_handoff_unavailable"]'::jsonb;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(quotes) q WHERE NOT (q->>'bindingConfirmed')::boolean) THEN availability:=availability||'"quote_party_binding_unavailable"'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM app.job q WHERE q.tenant_id=t AND q.practice_session_digest=d AND q.accepted_quote_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(quotes) fact WHERE fact->'source'->>'jobId'=q.id::text)) THEN availability:=availability||'"quote_value_source_unavailable"'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(assertions) a WHERE a->>'identifierKind'='phone') THEN availability:=availability-'identifier_phone_source_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(assertions) a WHERE a->>'identifierKind'='card') THEN availability:=availability-'identifier_card_source_unavailable'; END IF;
 -- This branch is the only publication entry. An unlocked call never reads or invokes hidden storage.
 IF has_lock THEN publication:=app.ch6_integrity_published(t,j,d);published:=nullif(publication->'published','null'::jsonb);availability:=availability||(publication->'availability');
 IF NOT (publication->'availability') ? 'writeoff_line_source_unavailable' THEN availability:=availability-'writeoff_line_source_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(assertions) a WHERE a->>'identifierKind'='phone') THEN availability:=availability-'identifier_phone_source_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(assertions) a WHERE a->>'identifierKind'='card') THEN availability:=availability-'identifier_card_source_unavailable'; END IF; END IF;
 SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') INTO start_at FROM app.job WHERE tenant_id=t AND id=j;
 WITH facts AS (SELECT f FROM jsonb_each(ordinary) a CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.value)='array' THEN a.value ELSE '[]' END) f
 UNION ALL SELECT f FROM jsonb_each(coalesce(published,'{}')) a CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.value)='array' THEN a.value ELSE '[]' END) f)
 SELECT least(start_at,coalesce(min(f->'source'->>'recordedAt'),start_at)),greatest(start_at,coalesce(max(f->'source'->>'recordedAt'),start_at),coalesce(published->>'cutoff',start_at)) INTO start_at,end_at FROM facts;
 SELECT coalesce(jsonb_agg(code ORDER BY code COLLATE "C"),'[]') INTO availability FROM (SELECT DISTINCT value code FROM jsonb_array_elements_text(availability)) codes;
 now_at:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
 RETURN jsonb_build_object('input',jsonb_build_object('version','commercial-integrity-input.v3','environment','synthetic_demo','tenantId',t,'jobId',j,'scopeId',d,'evaluatedAt',now_at,
 'profile',jsonb_build_object('version','synthetic_fixture.persisted-v3.1','ruleVersion','persisted-v3.1','window',jsonb_build_object('start',start_at,'end',end_at),
 'won',jsonb_build_object('delayMicroseconds','604800000000'),'quote',jsonb_build_object('basis','net','endpoint','inclusive','windowDays',90),'restart',jsonb_build_object('minimumCycles',2),'allocation',jsonb_build_object('minimumPayments',2)),
 'phase',CASE WHEN published IS NULL OR published='null'::jsonb THEN 'pre_lock' ELSE 'post_lock' END,'ordinaryFacts',ordinary)
 ||CASE WHEN published IS NULL OR published='null'::jsonb THEN '{}'::jsonb ELSE jsonb_build_object('published',published) END,'availability',availability);
END;
END
$$;

-- Latest body: packages/db/migrations/0660_baseline_ancestry_audit_trust.sql
CREATE OR REPLACE FUNCTION app.ch6_record_integrity_review(t uuid,j uuid,digest text,review jsonb,source_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(digest,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE actor uuid;user_id uuid;cid uuid;rh text;sh text;answer jsonb;prior app.command_receipt;canonical_review jsonb;owned_jobs uuid[];
BEGIN
 actor:=app.ch6_integrity_authority(t,j,digest);
 IF app.ch6_integrity_family(t,j)<>'v3' THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 -- Hold authority rows against revocation; recheck wall-clock expiry after every wait.
 PERFORM 1 FROM control_plane.practice_session s WHERE s.token_digest=digest FOR SHARE;
 PERFORM 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor FOR SHARE;
 PERFORM app.ch6_integrity_authority(t,j,digest);
 SELECT identity_user_id INTO user_id FROM app.authenticate_practice_session(digest,t);
 -- Decode the ECMAScript trim set at execution, avoiding Unicode escape parsing on SQL_ASCII.
 IF jsonb_typeof(review) IS DISTINCT FROM 'object' OR review->>'version' IS DISTINCT FROM 'commercial-integrity-review.v3'
  OR review->>'outcome' IS DISTINCT FROM 'dismissed_false_positive' OR review->>'commandId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR review->>'findingSnapshotHash' !~ '^[a-f0-9]{64}$' OR coalesce(length(review->>'findingKey'),0)=0
  OR (SELECT coalesce(sum((CASE WHEN ascii(c)>65535 THEN 2 ELSE 1 END)),0) FROM regexp_split_to_table(review->>'explanation','') ch(c)) NOT BETWEEN 1 AND 500 OR btrim(review->>'explanation',convert_from(decode('090a0b0c0d20c2a0e19a80e28080e28081e28082e28083e28084e28085e28086e28087e28088e28089e2808ae280a8e280a9e280afe2819fe38080efbbbf','hex'),'UTF8')) IS DISTINCT FROM review->>'explanation'
 THEN RAISE EXCEPTION 'INVALID_INTEGRITY_REVIEW'; END IF;
 cid:=(review->>'commandId')::uuid;
 canonical_review:=jsonb_build_object('version','commercial-integrity-review.v3','commandId',cid,'findingKey',review->>'findingKey','findingSnapshotHash',review->>'findingSnapshotHash','outcome','dismissed_false_positive','explanation',review->>'explanation');
 IF canonical_review IS DISTINCT FROM review THEN RAISE EXCEPTION 'INVALID_INTEGRITY_REVIEW'; END IF;
 rh:=encode(sha256(convert_to(app.ch6_integrity_canonical(jsonb_build_object('jobId',j,'membershipId',actor,'identityUserId',user_id,'sessionDigest',digest,'review',review)),'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||cid::text,627));
 PERFORM app.ch6_integrity_authority(t,j,digest);
 IF app.ch6_integrity_family(t,j)<>'v3' THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.command_type<>'commercial_integrity.review.v3' OR prior.status<>'succeeded' OR prior.actor_membership_id<>actor OR prior.semantic_key<>j::text||':'||cid::text OR prior.request_hash<>rh THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN prior.result;
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'INTEGRITY_RETRY_REQUIRED' USING ERRCODE='40001'; END IF;
 -- Lock order: session, membership, command advisory, jobs (UUID order), then
 -- source rows in the order below, receipt, audit head. No later business locks.
 -- Related-quote facts also use owned jobs in this session, never another tenant.
 WITH RECURSIVE owned AS (SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=digest
 UNION SELECT x.id FROM owned source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
 JOIN app.job x ON x.tenant_id=t AND x.id::text=e.subject_ref AND x.provenance='imported' AND x.practice_session_digest IS NULL AND (EXISTS(SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=x.id AND iv.source_job_id=source.id) OR EXISTS(SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded' AND rv.semantic_key='import:'||x.id::text AND rv.result->>'jobId'=x.id::text AND rv.result->>'sourceJobId'=source.id::text)))
 SELECT array_agg(id ORDER BY id) INTO owned_jobs FROM owned;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=ANY(owned_jobs) ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.job_activation WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.job_activation_terms WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j ORDER BY job_id FOR SHARE;
 PERFORM 1 FROM app.customer_invoice WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.customer_payment WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.quote_acceptance WHERE tenant_id=t AND job_id=ANY(owned_jobs) ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.acceptance_event WHERE tenant_id=t AND job_id=ANY(owned_jobs) ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.quote_document_version WHERE tenant_id=t AND job_id=ANY(owned_jobs) ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.job_party_binding WHERE tenant_id=t AND job_id=ANY(owned_jobs) ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.final_check_run_binding WHERE tenant_id=t AND job_id=j ORDER BY run_id FOR SHARE;
 PERFORM 1 FROM app.final_check_reveal_proof WHERE tenant_id=t AND job_id=j ORDER BY run_id,signal_id FOR SHARE;
 PERFORM 1 FROM app.final_check_disposition_binding WHERE tenant_id=t AND job_id=j ORDER BY disposition_id FOR SHARE;
 PERFORM 1 FROM app.evidence_object WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.evidence_upload WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=t AND e.job_id=j AND e.id=i.evidence_id) ORDER BY i.id FOR SHARE;
 PERFORM 1 FROM app.extra_origin WHERE tenant_id=t AND job_id=j ORDER BY variation_id FOR SHARE;
 PERFORM 1 FROM app.variation_revision WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.final_account_revision WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.final_account_line WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.final_account_invoiced_line WHERE tenant_id=t AND job_id=j ORDER BY invoice_id,final_account_line_id FOR SHARE;
 PERFORM 1 FROM app.final_account_invoice_binding WHERE tenant_id=t AND job_id=j ORDER BY invoice_id FOR SHARE;
 PERFORM 1 FROM app.customer_payment_reversal WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.customer_credit_note WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.ch6_identifier_assertion WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 PERFORM 1 FROM app.ch6_line_correction_source WHERE tenant_id=t AND job_id=j ORDER BY id FOR SHARE;
 -- STABLE source readers/fingerprint use one fresh statement snapshot after
 -- these waits: absence predicates and all aggregates share that same snapshot.
 -- Row locks protect existing facts; they deliberately do not lock insert gaps.
 PERFORM app.ch6_integrity_authority(t,j,digest);
 IF app.ch6_integrity_family(t,j)<>'v3' THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 sh:=app.ch6_integrity_source_fingerprint(t,j,digest,source_snapshot);
 IF sh IS DISTINCT FROM review->>'findingSnapshotHash' OR source_snapshot->>'findingKey' IS DISTINCT FROM review->>'findingKey' THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
 answer:=review||jsonb_build_object('jobId',j,'membershipId',actor,'identityUserId',user_id,'sessionDigest',digest,'recordedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(cid,t,'commercial_integrity.review.v3',j::text||':'||cid::text,rh,'succeeded',answer,actor,clock_timestamp());
 PERFORM app.ch6_append_integrity_review_audit(t,j,actor,cid,rh,sh);
 -- No later business locks: revalidate expiry/authority with plain reads after the audit-head wait.
 PERFORM app.ch6_integrity_authority(t,j,digest);
 RETURN answer;
END;
END
$$;

-- Latest body: packages/db/migrations/0660_baseline_ancestry_audit_trust.sql
CREATE OR REPLACE FUNCTION app.ch6_integrity_authority(t uuid,j uuid,digest text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 -- Reached by Ben's read-only "commercial-integrity-read" skip (see ch6_integrity_sources): a bound
 -- caller must be the digest's own actor; the unbound skip keeps the original scope authorization.
 IF NOT app.lp6d_request_bound() THEN NULL;
 ELSIF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(digest,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE actor uuid;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR digest !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT a.membership_id INTO actor FROM app.authenticate_practice_session(digest,t) a;
 IF actor IS NULL OR NOT EXISTS(
  WITH RECURSIVE practice_owned_job AS (
   SELECT id FROM app.job WHERE tenant_id=t AND id=j
   UNION SELECT parent.id FROM practice_owned_job source
   JOIN app.job child ON child.tenant_id=t AND child.id=source.id AND child.provenance='imported' AND child.practice_session_digest IS NULL
   JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.subject_ref=child.id::text
   JOIN app.job parent ON parent.tenant_id=t AND parent.id::text=e.payload->'references'->>'sourceJobId' AND (EXISTS(SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=child.id AND iv.source_job_id=parent.id) OR EXISTS(SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded' AND rv.semantic_key='import:'||child.id::text AND rv.result->>'jobId'=child.id::text AND rv.result->>'sourceJobId'=parent.id::text))
  ) SELECT 1 FROM practice_owned_job source JOIN app.job root ON root.tenant_id=t AND root.id=source.id WHERE root.practice_session_digest=digest
 ) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 RETURN actor;
END;
END
$$;

-- Latest body: packages/db/migrations/0526_commercial_integrity_sources.sql
CREATE OR REPLACE FUNCTION app.ch6_integrity_published(t uuid,j uuid,d text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog STABLE AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 -- Reached by Ben's read-only "commercial-integrity-read" skip (see ch6_integrity_sources): a bound
 -- caller must be the digest's own actor; the unbound skip keeps the original scope authorization.
 IF NOT app.lp6d_request_bound() THEN NULL;
 ELSIF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(d,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE l app.final_account_lock; r app.final_account_revision; reveal jsonb; catches jsonb; completions jsonb;
 receipts jsonb; corrections jsonb; allocations jsonb; missing text[]:=ARRAY['identifier_phone_source_unavailable','identifier_card_source_unavailable','writeoff_line_source_unavailable','receipt_line_source_handoff_unavailable'];
BEGIN
 PERFORM app.ch6_integrity_authority(t,j,d);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RETURN jsonb_build_object('published',NULL,'availability',missing); END IF;
 BEGIN
 reveal:=app.read_final_check_reveal(t,j,d);
 EXCEPTION WHEN insufficient_privilege THEN
 RETURN jsonb_build_object('published',NULL,'availability',array_append(missing,'published_final_check_unavailable'));
 END;
 IF reveal->>'state'<>'completed' OR reveal->>'lockId'<>l.id::text THEN
  RETURN jsonb_build_object('published',NULL,'availability',array_append(missing,(CASE WHEN reveal->>'state'='failed' THEN 'published_final_check_failed' ELSE 'published_final_check_pending' END)));
 END IF;
 SELECT * INTO r FROM app.final_account_revision WHERE tenant_id=t AND job_id=j AND id=l.final_account_revision_id;
 IF NOT FOUND OR r.currency<>'GBP' THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_UNAVAILABLE'; END IF;
 -- A catch is bound to this exact published run and this immutable locked bill.
 WITH visible AS (SELECT value item FROM jsonb_array_elements(reveal->'items'))
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'source',app.ch6_source(t,j,d,p.signal_id::text,'published_catch',coalesce(db.created_at,p.first_available_at),
 jsonb_build_object('run',p.run_id,'lock',p.lock_id,'evidence',p.evidence_set_hash,'answer',db.answer,'disposition',db.disposition_id,'line',line.id,'gross',line.gross_pence),'published_final_check'),
 'catchId',p.signal_id::text,'status',CASE db.answer WHEN 'confirmed_extra' THEN 'confirmed' WHEN 'not_completed' THEN 'dismissed_not_completed' ELSE 'dismissed_other' END,
 'includedInLockedAccount',EXISTS(SELECT 1 FROM app.final_account_line fl JOIN app.variation_revision vr ON(vr.tenant_id,vr.job_id,vr.id)=(fl.tenant_id,fl.job_id,fl.source_id) WHERE fl.tenant_id=t AND fl.job_id=j AND fl.final_account_revision_id=l.final_account_revision_id AND vr.variation_id=o.variation_id),
 'value',jsonb_build_object('pence',coalesce(line.gross_pence,0),'currency','GBP','basis',CASE WHEN line.id IS NULL THEN 'unknown' ELSE 'gross' END),
 'invoiceLineId',line.id::text) ORDER BY p.signal_id),'[]') INTO catches
 FROM visible v JOIN app.final_check_reveal_proof p ON p.tenant_id=t AND p.job_id=j AND p.run_id=(reveal->>'runId')::uuid AND p.signal_id=(v.item->>'signalId')::uuid AND p.lock_id=l.id
 LEFT JOIN app.final_check_disposition_binding db ON(db.tenant_id,db.job_id,db.run_id,db.signal_id,db.lock_id)=(p.tenant_id,p.job_id,p.run_id,p.signal_id,l.id)
 LEFT JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.source_signal_id)=(p.tenant_id,p.job_id,p.signal_id) AND o.kind='jobguard_catch'
 LEFT JOIN LATERAL (SELECT b.final_account_line_id id,b.gross_pence FROM app.final_account_invoiced_line b
  JOIN app.variation_revision vr ON(vr.tenant_id,vr.job_id,vr.id)=(b.tenant_id,b.job_id,b.source_id)
  JOIN app.final_account_invoice_binding ib ON(ib.tenant_id,ib.job_id,ib.invoice_id)=(b.tenant_id,b.job_id,b.invoice_id)
  WHERE b.tenant_id=t AND b.job_id=j AND vr.variation_id=o.variation_id AND ib.lock_id=l.id AND b.gross_pence BETWEEN 0 AND 1000000000000
  AND (SELECT count(*) FROM app.final_account_invoiced_line all_lines JOIN app.variation_revision all_revisions ON(all_revisions.tenant_id,all_revisions.job_id,all_revisions.id)=(all_lines.tenant_id,all_lines.job_id,all_lines.source_id) WHERE all_lines.tenant_id=t AND all_lines.job_id=j AND all_revisions.variation_id=o.variation_id)=1) line ON true;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(catches) c WHERE c->>'status'='confirmed' AND c->>'invoiceLineId' IS NULL) THEN missing:=array_append(missing,'catch_line_source_unavailable'); END IF;
 -- Proof must be a published, verified original completion photograph from before this lock.
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,p.signal_id::text||':'||e.id::text,'completion_evidence',e.server_received_at,
 jsonb_build_object('id',e.id,'hash',e.sha256,'version',e.object_version_id,'bytes',e.byte_length,'lock',p.lock_id)),
 'catchId',p.signal_id::text,'state','verified','original',true,'objectVersionId',e.object_version_id,'byteLength',e.byte_length) ORDER BY p.signal_id,e.id),'[]') INTO completions
 FROM app.final_check_reveal_proof p CROSS JOIN LATERAL jsonb_array_elements(p.evidence) ev
 JOIN app.evidence_object e ON e.tenant_id=t AND e.job_id=j AND e.id=(ev->>'id')::uuid AND e.object_version_id=ev->>'objectVersionId' AND e.sha256=ev->>'sha256'
 JOIN app.evidence_upload u ON(u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id) AND u.state='verified'
 WHERE p.tenant_id=t AND p.job_id=j AND p.run_id=(reveal->>'runId')::uuid AND p.lock_id=l.id
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(reveal->'items') v WHERE v->>'signalId'=p.signal_id::text)
 AND e.kind='original' AND e.evidence_type='completion_photo' AND e.byte_length>0 AND length(e.object_version_id)<=300 AND e.object_version_id~'^[ -~]+$' AND e.server_received_at<=l.locked_at
 AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation invalid WHERE invalid.tenant_id=t AND invalid.evidence_id=e.id);
 IF jsonb_array_length(completions)=0 AND EXISTS(SELECT 1 FROM jsonb_array_elements(catches) c WHERE c->>'status'='dismissed_not_completed') THEN missing:=array_append(missing,'completion_evidence_source_unavailable'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('source',app.ch6_source(t,j,d,p.id::text,'published_customer_payment',p.created_at,
 jsonb_build_object('id',p.id,'invoice',p.invoice_id,'pence',p.amount_pence,'reversal',rv.id),'builder_attested'),
 'value',jsonb_build_object('pence',p.amount_pence,'currency','GBP','basis','gross'),'reversed',rv.id IS NOT NULL) ORDER BY p.id),'[]') INTO receipts
 FROM app.customer_payment p LEFT JOIN app.customer_payment_reversal rv ON(rv.tenant_id,rv.job_id,rv.payment_id)=(p.tenant_id,p.job_id,p.id)
 WHERE p.tenant_id=t AND p.job_id=j;
 -- Existing credit notes are whole-invoice facts. They never acquire an invented catch-line link.
 SELECT coalesce(jsonb_agg(f ORDER BY f->'source'->>'sourceId'),'[]') INTO corrections FROM (
 SELECT jsonb_build_object('source',app.ch6_source(t,j,d,c.id::text,'customer_credit_note',c.created_at,to_jsonb(c)-'reason'-'created_at'),
 'correctionKind','credit','invoiceLineId',NULL,'value',jsonb_build_object('pence',c.amount_pence-coalesce((SELECT sum(mapped.amount_pence) FROM app.ch6_line_correction_source mapped WHERE mapped.tenant_id=t AND mapped.job_id=j AND mapped.credit_note_id=c.id AND mapped.session_digest=d),0),'currency','GBP','basis','gross'),'actual',true) f
 FROM app.customer_credit_note c WHERE c.tenant_id=t AND c.job_id=j AND c.amount_pence>coalesce((SELECT sum(mapped.amount_pence) FROM app.ch6_line_correction_source mapped WHERE mapped.tenant_id=t AND mapped.job_id=j AND mapped.credit_note_id=c.id AND mapped.session_digest=d),0)
 UNION ALL SELECT jsonb_build_object('source',app.ch6_source(t,j,d,c.id::text,'line_correction_source',c.recorded_at,to_jsonb(c)-'recorded_at','builder_attested'),
 'correctionKind',c.correction_kind,'invoiceLineId',c.line_id::text,'value',jsonb_build_object('pence',c.amount_pence,'currency','GBP','basis','gross'),'actual',true)
 FROM app.ch6_line_correction_source c WHERE c.tenant_id=t AND c.job_id=j AND c.lock_id=l.id AND c.session_digest=d
 AND (c.correction_kind='credit' OR NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=c.evidence_id))) sources;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(corrections) c WHERE c->>'invoiceLineId' IS NULL) THEN missing:=array_append(missing,'credit_line_source_unavailable'); END IF;
 IF EXISTS(SELECT 1 FROM app.ch6_line_correction_source c WHERE c.tenant_id=t AND c.job_id=j AND c.session_digest=d AND c.correction_kind='writeoff' AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=c.evidence_id)) THEN missing:=array_remove(missing,'writeoff_line_source_unavailable'); END IF;
 -- The installed neutral receipt source adapter explicitly refuses every save with
 -- RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED (0258 / receipt-line-allocation-repository.ts).
 -- Its quarantine tables are NOT evidence of a user-selected allocation. Do not read
 -- or promote their contents. A later accepted source handoff must wire this port.
 allocations:='[]'::jsonb;
 RETURN jsonb_build_object('published',jsonb_build_object('lockId',l.id,'contractVersion','persisted-published-integrity.v1','cutoff',to_char(l.locked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'lockSource',app.ch6_source(t,j,d,l.id::text,'final_account_lock',l.locked_at,jsonb_build_object('lock',l.snapshot_digest,'revision',r.source_hash)),
 'lockedAccount',jsonb_build_object('pence',r.total_pence,'currency','GBP','basis','gross'),
 'catches',catches,'completions',completions,'receipts',receipts,'corrections',corrections,'allocations',allocations),'availability',missing);
END;
END
$$;

-- Latest body: packages/db/migrations/0526_commercial_integrity_sources.sql
CREATE OR REPLACE FUNCTION app.ch6_integrity_source_fingerprint(t uuid,j uuid,digest text,source_snapshot jsonb) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog STABLE AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 -- Reached by Ben's read-only "commercial-integrity-read" skip (see ch6_integrity_sources): a bound
 -- caller must be the digest's own actor; the unbound skip keeps the original scope authorization.
 IF NOT app.lp6d_request_bound() THEN NULL;
 ELSIF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (SELECT membership_id FROM app.authenticate_practice_session(digest,app.current_tenant())) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE inp jsonb; o jsonb; pub jsonb; p jsonb; win jsonb; kind text; facts jsonb; candidates jsonb; compared jsonb;
 a jsonb; b jsonb; c jsonb; proof jsonb; lock_fact jsonb; ids jsonb; expected jsonb; finding_key text; n numeric; total numeric; distance numeric;
BEGIN
 inp:=app.ch6_integrity_sources(t,j,digest)->'input';o:=inp->'ordinaryFacts';pub:=inp->'published';p:=inp->'profile';win:=p->'window';kind:=source_snapshot->>'kind';
 IF jsonb_typeof(source_snapshot->'facts') IS DISTINCT FROM 'array' OR jsonb_array_length(source_snapshot->'facts')=0 THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
 -- Every submitted fact must exactly match a current, authorised fact, including its revisions, amounts and provenance.
 WITH current_facts AS (
 SELECT f FROM jsonb_each(o) x CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(x.value)='array' THEN x.value ELSE '[]' END) f
 UNION ALL SELECT f FROM jsonb_each(coalesce(pub,'{}')) x CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(x.value)='array' THEN x.value ELSE '[]' END) f)
 SELECT coalesce(jsonb_agg(f),'[]') INTO candidates FROM current_facts;
 IF pub IS NOT NULL THEN
 lock_fact:=jsonb_build_object('source',pub->'lockSource','lockedAccount',pub->'lockedAccount','lockId',pub->'lockId','cutoff',pub->'cutoff','contractVersion',pub->'contractVersion');
 candidates:=candidates||jsonb_build_array(lock_fact);
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(source_snapshot->'facts') f WHERE NOT candidates @> jsonb_build_array(f)) THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
 facts:=source_snapshot->'facts';
 IF kind='invoice_or_payment_without_lock' THEN
  a:=facts->0;
  IF o->>'lockState'<>'absent' OR jsonb_array_length(facts)<>1 OR NOT (o->'activity') @> jsonb_build_array(a) THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('lockState','absent','activityKind',a->>'activityKind');
 ELSIF kind='won_never_switched_live' THEN
  a:=facts->0;
  IF jsonb_array_length(facts)<>1 OR NOT (o->'quotes') @> jsonb_build_array(a) OR a->>'status'<>'accepted' OR a->'source'->>'jobId'<>j::text
  OR jsonb_array_length(o->'activations')>0 OR extract(epoch FROM ((inp->>'evaluatedAt')::timestamptz-(a->>'acceptedAt')::timestamptz))*1000000<=(p->'won'->>'delayMicroseconds')::numeric THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('acceptedAt',a->>'acceptedAt','delayMicroseconds',p->'won'->>'delayMicroseconds','activation','absent');
 ELSIF kind='related_sub2000_quotes_90_days' THEN
  SELECT value INTO a FROM jsonb_array_elements(facts) ORDER BY value->'source'->>'jobId',value->'source'->>'sourceId' LIMIT 1;
  SELECT value INTO b FROM jsonb_array_elements(facts) ORDER BY value->'source'->>'jobId' DESC,value->'source'->>'sourceId' DESC LIMIT 1;
  distance:=abs(extract(epoch FROM ((a->>'acceptedAt')::timestamptz-(b->>'acceptedAt')::timestamptz))*1000000);
  IF jsonb_array_length(facts)<>2 OR NOT (o->'quotes') @> facts OR a->>'status'<>'accepted' OR b->>'status'<>'accepted'
  OR NOT (a->>'bindingConfirmed')::boolean OR NOT (b->>'bindingConfirmed')::boolean OR a->>'customerId'<>b->>'customerId' OR a->>'siteId'<>b->>'siteId'
  OR a->'source'->>'jobId'=b->'source'->>'jobId' OR (a->'source'->>'jobId'<>j::text AND b->'source'->>'jobId'<>j::text)
  OR a->'value'->>'basis'<>'net' OR b->'value'->>'basis'<>'net' OR (a->'value'->>'pence')::bigint>=200000 OR (b->'value'->>'pence')::bigint>=200000
  OR distance>7776000000000 THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('firstPence',(a->'value'->>'pence')::bigint,'secondPence',(b->'value'->>'pence')::bigint,'basis','net','maximumPenceExclusive',200000,'distanceMicroseconds',trunc(distance)::text,'endpoint','inclusive');
 ELSIF kind='repeated_finish_restart' THEN
  WITH pairs AS (SELECT DISTINCT ON(f->'source'->>'sourceId') f,rs FROM jsonb_array_elements(o->'workEvents') f CROSS JOIN jsonb_array_elements(o->'workEvents') rs
  WHERE rs->>'predecessorId'=f->'source'->>'sourceId' AND f->'source'->>'recordedAt'<rs->'source'->>'recordedAt'
  AND ((f->>'kind'='finish' AND rs->>'kind' IN('resume','cancel_finish')) OR (f->>'kind'='close' AND rs->>'kind'='reopen'))
  ORDER BY f->'source'->>'sourceId',rs->'source'->>'recordedAt',rs->'source'->>'sourceId')
  SELECT coalesce(jsonb_agg(f)||jsonb_agg(rs),'[]'),count(*) INTO facts,n FROM pairs;
  IF n<2 THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('cycles',n,'minimumCycles',2);
 ELSIF kind='account_identifier_reuse' THEN
  a:=facts->0;
  IF jsonb_array_length(facts)<>1 OR NOT (o->'assertions') @> jsonb_build_array(a) OR a->>'sharing'<>'unexplained'
  OR a->>'validFrom'>inp->>'evaluatedAt' OR a->>'validUntil'<inp->>'evaluatedAt' THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('identifierKind',a->>'identifierKind','subjectRef',a->>'subjectRef','authorityRef',a->>'authorityRef');
 ELSIF pub IS NULL THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_UNAVAILABLE';
 ELSIF kind='dismissed_not_completed_with_completion_evidence' THEN
  SELECT f INTO c FROM jsonb_array_elements(facts) f WHERE f ? 'catchId' AND f->>'status'='dismissed_not_completed';
  SELECT f INTO proof FROM jsonb_array_elements(facts) f WHERE f->>'catchId'=c->>'catchId' AND f->>'state'='verified';
  IF c IS NULL OR proof IS NULL OR jsonb_array_length(facts)<>3 OR NOT facts @> jsonb_build_array(lock_fact) OR proof->'source'->>'provenance'<>'server_recorded'
  OR NOT (proof->>'original')::boolean OR proof->'source'->>'recordedAt'>pub->>'cutoff' THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('catchId',c->>'catchId','disposition',c->>'status','evidenceState','verified','cutoff',pub->>'cutoff','lockId',pub->>'lockId');
 ELSIF kind='receipts_exceed_locked_account_and_confirmed_catches' THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(pub->'corrections') x WHERE (x->>'actual')::boolean) THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  SELECT coalesce(sum((x->'value'->>'pence')::numeric),0) INTO n FROM jsonb_array_elements(pub->'receipts') x WHERE NOT (x->>'reversed')::boolean;
  SELECT (pub->'lockedAccount'->>'pence')::numeric+coalesce(sum((x->'value'->>'pence')::numeric),0) INTO total FROM jsonb_array_elements(pub->'catches') x WHERE x->>'status'='confirmed' AND NOT (x->>'includedInLockedAccount')::boolean;
  SELECT jsonb_build_array(lock_fact)||coalesce(jsonb_agg(x),'[]')||(pub->'receipts') INTO facts FROM jsonb_array_elements(pub->'catches') x WHERE x->>'status'='confirmed' AND NOT (x->>'includedInLockedAccount')::boolean;
  IF n<=total OR EXISTS(SELECT 1 FROM jsonb_array_elements(facts) x WHERE x ? 'value' AND x->'value'->>'basis' IS DISTINCT FROM pub->'lockedAccount'->>'basis') THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('receiptPence',trunc(n)::text,'accountPence',trunc(total)::text,'basis',pub->'lockedAccount'->>'basis','lockId',pub->>'lockId','cutoff',pub->>'cutoff');
 ELSIF kind='catch_line_credit_or_writeoff' THEN
  SELECT f INTO c FROM jsonb_array_elements(facts) f WHERE f->>'status'='confirmed';
  SELECT f INTO a FROM jsonb_array_elements(facts) f WHERE f ? 'correctionKind' AND (f->>'actual')::boolean;
  IF c IS NULL OR a IS NULL OR jsonb_array_length(facts)<>3 OR NOT facts @> jsonb_build_array(lock_fact) OR c->>'invoiceLineId' IS NULL OR c->>'invoiceLineId' IS DISTINCT FROM a->>'invoiceLineId'
  OR a->'value'->>'basis'='unknown' OR a->'value'->>'basis' IS DISTINCT FROM c->'value'->>'basis' OR (a->'value'->>'pence')::bigint<=0 THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
  compared:=jsonb_build_object('correctionKind',a->>'correctionKind','pence',(a->'value'->>'pence')::bigint,'basis',a->'value'->>'basis','lineId',a->>'invoiceLineId','lockId',pub->>'lockId');
 ELSIF kind='explicit_allocations_avoid_catch_lines' THEN
  RAISE EXCEPTION 'INTEGRITY_SOURCE_UNAVAILABLE'; -- source handoff is not installed; never infer it from quarantine rows.
 ELSE RAISE EXCEPTION 'INTEGRITY_SOURCE_UNAVAILABLE'; END IF;
 SELECT coalesce(jsonb_agg(identity ORDER BY identity),'[]') INTO ids FROM (SELECT DISTINCT app.ch6_integrity_canonical(jsonb_build_object('tenantId',f->'source'->'tenantId','jobId',f->'source'->'jobId','scopeId',f->'source'->'scopeId','sourceType',f->'source'->'sourceType','sourceId',f->'source'->'sourceId')) identity FROM jsonb_array_elements(facts) f) x;
 finding_key:=app.ch6_integrity_canonical(jsonb_build_object('kind',kind,'ruleVersion',p->>'ruleVersion','sources',ids,'window',win));
 expected:=jsonb_build_object('version','commercial-integrity-source-snapshot.v3','tenantId',t,'jobId',j,'scopeId',digest,'family','v3','phase',inp->>'phase',
 'kind',kind,'findingKey',finding_key,'profile',p,'window',win,'facts',facts,'compared',compared);
 IF app.ch6_integrity_canonical(expected) IS DISTINCT FROM app.ch6_integrity_canonical(source_snapshot) THEN RAISE EXCEPTION 'INTEGRITY_SOURCE_CHANGED'; END IF;
 RETURN encode(sha256(convert_to(app.ch6_integrity_canonical(expected),'UTF8')),'hex');
END;
END
$$;

-- Latest body: packages/db/migrations/0534_import_work_admission.sql
CREATE OR REPLACE FUNCTION app.ch5_import_actor(t uuid,digest text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE actor uuid;
BEGIN
 actor:=app.mon1_company_actor(t,digest);
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner' AND revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN actor;
END;
END
$$;

-- Latest body: packages/db/migrations/0668_import_company_owner_history.sql
CREATE OR REPLACE FUNCTION app.ch5_history_actor(t uuid,j uuid,d text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE actor uuid;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t='11111111-1111-4111-8111-111111111111'::uuid THEN
  SELECT membership_id INTO actor FROM app.authenticate_practice_session(d,t);
 ELSE actor:=app.ch5_import_actor(t,d); END IF;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM app.job_import_v3 i JOIN app.job_commercial_track c
  ON(c.tenant_id,c.job_id)=(i.tenant_id,i.job_id)
  WHERE i.tenant_id=t AND i.job_id=j AND (t<>'11111111-1111-4111-8111-111111111111'::uuid OR i.session_digest=d) AND c.job_track='small_builder' AND c.environment='synthetic_demo')
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN actor;
END;
END
$$;

-- Latest body: packages/db/migrations/0535_import_pre_adoption.sql
CREATE OR REPLACE FUNCTION app.ch5_write_history(t uuid,j uuid,d text,cmd uuid,eid uuid,aid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE actor uuid; prior app.import_pre_adoption_evidence; e app.evidence_object; adopted timestamptz; rid uuid:=gen_random_uuid();
BEGIN
 actor:=app.ch5_history_actor(t,j,d);
 IF cmd IS NULL OR eid IS NULL OR aid IS NULL THEN RAISE EXCEPTION 'INVALID_IMPORT_HISTORY'; END IF;
 -- One lock before the eventual audit-head lock, for duplicate source/command races.
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
 actor:=app.ch5_history_actor(t,j,d);
 SELECT * INTO prior FROM app.import_pre_adoption_evidence WHERE tenant_id=t AND command_id=cmd;
 IF prior.id IS NOT NULL AND (prior.job_id<>j OR prior.evidence_id<>eid) THEN RAISE EXCEPTION 'COMMAND_CONFLICT'; END IF;
 SELECT * INTO e FROM app.evidence_object WHERE tenant_id=t AND job_id=j AND id=eid AND kind='original';
 SELECT adopted_at INTO adopted FROM app.job_import_v3 WHERE tenant_id=t AND job_id=j;
 IF e.id IS NULL OR e.server_verified_at IS NULL OR e.device_captured_at IS NULL
  OR e.device_captured_at>=adopted OR e.device_captured_at>e.server_received_at
  OR NOT EXISTS(SELECT 1 FROM app.evidence_upload u WHERE u.tenant_id=t AND u.job_id=j AND u.id=e.upload_id
   AND u.state='verified' AND u.server_verified_at IS NOT NULL AND u.object_version_id=e.object_version_id)
  OR EXISTS(SELECT 1 FROM app.evidence_invalidation WHERE tenant_id=t AND evidence_id=eid)
 THEN RAISE EXCEPTION 'PRE_ADOPTION_SOURCE_REQUIRED'; END IF;
 IF prior.id IS NULL AND EXISTS(SELECT 1 FROM app.import_pre_adoption_evidence WHERE tenant_id=t AND job_id=j AND evidence_id=eid)
 THEN RAISE EXCEPTION 'IMPORT_HISTORY_ALREADY_RECORDED'; END IF;
 IF prior.id IS NOT NULL THEN RETURN jsonb_build_object('id',prior.id,'inserted',false,'actorId',actor); END IF;
 INSERT INTO app.import_pre_adoption_evidence(tenant_id,job_id,id,command_id,evidence_id,object_version_id,sha256,source_received_at,source_occurred_at,classification,fee_pence,currency,actor_id,audit_id)
 VALUES(t,j,rid,cmd,eid,e.object_version_id,e.sha256,e.server_received_at,e.device_captured_at,'pre_adoption_evidence',0,'GBP',actor,aid);
 RETURN jsonb_build_object('id',rid,'inserted',true,'actorId',actor);
END;
END
$$;

-- Latest body: packages/db/migrations/0535_import_pre_adoption.sql
CREATE OR REPLACE FUNCTION app.ch5_imported_catch(t uuid,j uuid,d text,b uuid,eid uuid,cmd uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE h app.import_pre_adoption_evidence;
BEGIN
 PERFORM app.ch5_history_actor(t,j,d);
 IF b IS NULL OR b::text IS DISTINCT FROM (SELECT result->>'baselineId' FROM app.job_import_v3 WHERE tenant_id=t AND job_id=j)
 THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM app.import_pre_adoption_evidence WHERE tenant_id=t AND command_id=cmd AND (job_id<>j OR evidence_id<>eid))
 THEN RAISE EXCEPTION 'COMMAND_CONFLICT'; END IF;
 SELECT x.* INTO h FROM app.import_pre_adoption_evidence x JOIN app.evidence_object e
 ON(e.tenant_id,e.job_id,e.id)=(x.tenant_id,x.job_id,x.evidence_id)
 WHERE x.tenant_id=t AND x.job_id=j AND x.evidence_id=eid AND x.command_id=cmd AND e.object_version_id=x.object_version_id AND e.sha256=x.sha256
 AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation WHERE tenant_id=t AND evidence_id=eid);
 IF h.id IS NULL THEN RAISE EXCEPTION 'PRE_ADOPTION_SOURCE_REQUIRED'; END IF;
 RETURN jsonb_build_object('version','import-catch-result.v1','catchId',h.id,'jobId',j,'evidenceId',eid,
  'fee',jsonb_build_object('pence',0,'currency','GBP'),'reason','pre_adoption_evidence',
  'explanation','Evidence from before adoption is permanently excluded','environment','synthetic_demo','realExternalActions',0);
END;
END
$$;

-- Latest body: packages/db/migrations/0541_late_source_import.sql
CREATE OR REPLACE FUNCTION app.import_late_source(t uuid,j uuid,digest text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE actor uuid; cid uuid; claim jsonb; significant jsonb; txt text; raw bytea; h text; received timestamptz;
 sent timestamptz; locked timestamptz; ev uuid:=gen_random_uuid(); ver text:=gen_random_uuid()::text;
 okey text; result jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED'; END IF;
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 actor:=app.ch4_require_command_owner(t,j,digest);
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 actor:=app.ch4_require_command_owner(t,j,digest);
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR input->>'version' IS DISTINCT FROM 'late-source-import.v1'
  OR (SELECT count(*) FROM jsonb_object_keys(input))<>5
  OR NOT input ?& ARRAY['version','commandId','fictionalCustomer','text','statedSentAt']
  OR jsonb_typeof(input->'text') IS DISTINCT FROM 'string'
  OR jsonb_typeof(input->'fictionalCustomer') IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(input->'fictionalCustomer'))<>2
  OR input->'fictionalCustomer'->>'kind' IS DISTINCT FROM 'named_fictional_customer'
  OR jsonb_typeof(input->'fictionalCustomer'->'name') IS DISTINCT FROM 'string'
  OR length(btrim(input->'fictionalCustomer'->>'name')) NOT BETWEEN 1 AND 160
  OR char_length(input->'fictionalCustomer'->>'name')>160
 THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_INPUT'; END IF;
 BEGIN cid:=(input->>'commandId')::uuid; sent:=(input->>'statedSentAt')::timestamptz;
 EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_INPUT'; END;
 txt:=input->>'text'; raw:=convert_to(txt,'UTF8');
 IF cid IS NULL OR sent IS NULL OR NOT isfinite(sent) OR char_length(txt) NOT BETWEEN 1 AND 8000
  OR octet_length(raw)>32000 OR length(btrim(txt,E' \t\r\n'))=0 THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_INPUT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track tr JOIN app.job jb ON(jb.tenant_id,jb.id)=(tr.tenant_id,tr.job_id)
  WHERE tr.tenant_id=t AND tr.job_id=j AND tr.job_track='small_builder' AND tr.environment='synthetic_demo'
   AND jb.practice_session_digest IS NOT NULL AND jb.provenance='system_generated_quote')
 THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT locked_at INTO locked FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF locked IS NULL OR sent>=locked THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_INPUT'; END IF;
 significant:=jsonb_build_object('jobId',j,'sessionDigest',digest,'input',input);
 claim:=app.begin_command('repository-command.v1',cid,'LateSource.import',cid::text,
  jsonb_build_object('tenantId',t,'actorMembershipId',actor,'subjectType','job','subjectRef',j),'{}'::jsonb,
  jsonb_build_object('version','repository-command.v1','actorMembershipId',actor,'input',significant,'legacyJson',app.final_lock_canonical(significant)));
 IF claim->>'kind'='replay' THEN RETURN claim->'result'; END IF;
 received:=clock_timestamp(); h:=encode(sha256(raw),'hex'); okey:='synthetic/late-source/'||ev::text;
 INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_received_at,server_verified_at)
 VALUES(ev,t,j,okey,h,'text/plain; charset=utf-8',32000,'standard_evidence',received+interval '1 day','verified',ver,received,received);
 INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at,device_captured_at)
 VALUES(ev,t,ev,j,'original','customer_message_text',okey,ver,h,octet_length(raw),'text/plain; charset=utf-8','standard_evidence',received,received,sent);
 result:=jsonb_build_object('version','late-source-receipt.v1','jobId',j,'statedSentAt',to_char(sent AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'evidenceAfterLock',true,'environment','synthetic_demo','realExternalActions',0,'record',jsonb_build_object('id',ev,'commandId',cid,'text',txt,
  'actualTesterMembershipId',actor,'fictionalCustomer',input->'fictionalCustomer','evidence',jsonb_build_object('id',ev,'objectVersionId',ver,'sha256',h,
  'serverReceivedAt',to_char(received AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))));
 INSERT INTO app.late_source_import VALUES(t,j,cid,actor,ev,ver,h,received,sent,raw,result);
 INSERT INTO infrastructure.demo_source_hold_request(id,tenant_id,job_id) VALUES(cid,t,j);
 PERFORM app.lp5_bind_effect(cid,NULL,'source_intake',jsonb_build_object('result',result));
 PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||actor::text,j,'job_source.historical_imported',
  jsonb_build_object('commandId',cid,'evidenceId',ev,'sha256',h));
 result:=app.complete_command(cid,'{}'::jsonb);
 PERFORM app.ch4_require_command_owner(t,j,digest);
 RETURN result;
END;
END
$$;

-- Latest body: packages/db/migrations/0693_accounting_export_credit_invoice_route.sql
CREATE OR REPLACE FUNCTION app.accounting_export(t uuid,digest text,operation text,source text,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE actor uuid; f app.accounting_export_fixture; d app.accounting_export_decision;
 l app.accounting_export_ledger; o app.accounting_export_outbox; result jsonb; h text;
 invoice jsonb; allocated bigint;
 decision uuid; attempt uuid; expiry timestamptz; observation jsonb; matches jsonb; next_status text;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'EXPORT_SYNTHETIC_ONLY'; END IF;
 actor:=app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,484));
 actor:=app.mon1_company_actor(t,digest);
 IF operation IS NULL OR operation NOT IN('preview','approve','claim','reconcile','read')
  OR source IS NULL OR source !~ '^demo-[a-z0-9-]{1,80}$'
  OR jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT'; END IF;
 SELECT * INTO f FROM app.accounting_export_fixture WHERE tenant_id=t AND source_id=source;
 IF f.source_id IS NULL THEN RAISE EXCEPTION 'EXPORT_NOT_FOUND'; END IF;
 IF f.revoked OR f.consent_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'EXPORT_CONSENT_EXPIRED'; END IF;
 f.artifact:=app.accounting_export_routed_artifact(t,f.artifact);
 -- Preserve the source and locked-bill invariants even for administrator-seeded fixtures.
 IF f.artifact #>> '{source,kind}' IS NULL
  OR f.artifact #>> '{source,kind}' NOT IN('customer_invoice','credit','receipt')
  OR f.artifact #>> '{source,state}' IS DISTINCT FROM (CASE WHEN f.artifact #>> '{source,kind}'='customer_invoice' THEN 'issued' ELSE 'posted' END)
  OR f.artifact #>> '{source,visibility}' IS DISTINCT FROM 'builder'
  OR f.artifact #>> '{source,tenantId}' IS DISTINCT FROM 'demo-'||t::text
  OR f.artifact #>> '{source,sourceId}' IS DISTINCT FROM source
  OR f.artifact #> '{source,revision}' IS DISTINCT FROM f.artifact #> '{scope,sourceRevision}'
  OR f.artifact #> '{source,amount}' IS DISTINCT FROM f.artifact #> '{target,amount}'
  OR f.artifact #>> '{source,amount,pence}' IS NULL
  OR f.artifact #>> '{source,amount,pence}' !~ '^[1-9][0-9]{0,11}$'
  OR f.artifact #>> '{source,amount,currency}' IS DISTINCT FROM 'GBP'
  OR f.artifact #> '{scope,companyId}' IS DISTINCT FROM f.artifact #> '{scope,mapping,companyId}'
  OR f.artifact #> '{scope,companyId}' IS DISTINCT FROM f.artifact #> '{target,companyId}'
  OR (f.artifact #> '{source,finalAccount}' IS DISTINCT FROM 'null'::jsonb AND
   f.artifact #> '{source,finalAccount,revision}' IS DISTINCT FROM f.artifact #> '{source,finalAccount,lockedRevision}')
 THEN RAISE EXCEPTION 'EXPORT_STALE_REVISION'; END IF;
 IF f.artifact #>> '{source,kind}' IN('credit','receipt') THEN
  SELECT artifact INTO invoice FROM app.accounting_export_fixture WHERE tenant_id=t AND source_id=f.artifact #>> '{source,invoiceId}';
  IF invoice IS NULL OR invoice #>> '{source,kind}' IS DISTINCT FROM 'customer_invoice'
   OR invoice #>> '{source,state}' IS DISTINCT FROM 'issued'
   OR invoice #> '{scope,jobId}' IS DISTINCT FROM f.artifact #> '{scope,jobId}'
   OR invoice #> '{scope,companyId}' IS DISTINCT FROM f.artifact #> '{scope,companyId}'
   OR invoice #> '{scope,mapping,customerId}' IS DISTINCT FROM f.artifact #> '{scope,mapping,customerId}'
   OR EXISTS(SELECT 1 FROM app.accounting_export_ledger WHERE tenant_id=t
    AND source_id=f.artifact #>> '{source,invoiceId}'
    AND artifact->'route' IS DISTINCT FROM f.artifact->'route')
   OR invoice #> '{source,revision}' IS DISTINCT FROM f.artifact #> '{source,invoiceRevision}'
   OR (invoice #> '{source,finalAccount}' IS DISTINCT FROM 'null'::jsonb AND
    invoice #> '{source,finalAccount,revision}' IS DISTINCT FROM invoice #> '{source,finalAccount,lockedRevision}')
  THEN RAISE EXCEPTION 'EXPORT_REFERENCE_CONFLICT'; END IF;
  SELECT coalesce(sum((artifact #>> '{source,amount,pence}')::bigint),0) INTO allocated
   FROM app.accounting_export_ledger WHERE tenant_id=t AND source_id<>source
    AND artifact #>> '{source,invoiceId}'=f.artifact #>> '{source,invoiceId}';
  IF allocated+(f.artifact #>> '{source,amount,pence}')::bigint>(invoice #>> '{source,amount,pence}')::bigint
   THEN RAISE EXCEPTION 'EXPORT_REFERENCE_CONFLICT'; END IF;
 END IF;
 h:=app.final_lock_hash(f.artifact);
 IF operation='preview' THEN
  IF v<>'{}'::jsonb THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT'; END IF;
  RETURN jsonb_build_object('version',1,'artifact',f.artifact,'previewHash',h);
 END IF;
 SELECT * INTO l FROM app.accounting_export_ledger WHERE tenant_id=t AND source_id=source;
 SELECT * INTO o FROM app.accounting_export_outbox WHERE tenant_id=t AND source_id=source;
 IF operation='approve' THEN
  IF v-ARRAY['version','decisionId','previewHash','expiresAt','humanConfirmed']<>'{}'::jsonb
   OR v->>'version' IS DISTINCT FROM '1' OR v->'humanConfirmed' IS DISTINCT FROM 'true'::jsonb
   OR v->>'previewHash' IS DISTINCT FROM h THEN RAISE EXCEPTION 'EXPORT_APPROVAL_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM app.accounting_export_route_change WHERE tenant_id=t AND decision_id=(v->>'decisionId')::uuid)
   THEN RAISE EXCEPTION 'EXPORT_REPLAY_CONFLICT'; END IF;
  decision:=(v->>'decisionId')::uuid; expiry:=(v->>'expiresAt')::timestamptz;
  IF decision IS NULL OR expiry IS NULL OR expiry<=clock_timestamp() OR expiry>f.consent_expires_at THEN RAISE EXCEPTION 'EXPORT_APPROVAL_REQUIRED'; END IF;
  SELECT * INTO d FROM app.accounting_export_decision WHERE tenant_id=t AND id=decision;
  IF d.id IS NOT NULL AND (d.actor_id<>actor OR d.source_id<>source OR d.preview_hash<>h OR d.expires_at<>expiry) THEN RAISE EXCEPTION 'EXPORT_REPLAY_CONFLICT'; END IF;
  IF l.source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.accounting_export_decision WHERE tenant_id=t AND id=l.decision_id AND actor_id=actor) THEN RAISE EXCEPTION 'EXPORT_NOT_FOUND'; END IF;
  IF l.source_id IS NOT NULL AND l.artifact<>f.artifact THEN RAISE EXCEPTION 'EXPORT_REFERENCE_CONFLICT'; END IF;
  IF d.id IS NULL THEN
   INSERT INTO app.accounting_export_decision(tenant_id,id,actor_id,source_id,preview_hash,artifact,expires_at)
    VALUES(t,decision,actor,source,h,f.artifact,expiry);
  END IF;
  IF l.source_id IS NULL THEN
   INSERT INTO app.accounting_export_ledger(tenant_id,source_id,decision_id,company_id,artifact,reference)
    VALUES(t,source,decision,f.artifact #>> '{scope,companyId}',f.artifact,app.final_lock_hash(jsonb_build_array(t,source))) RETURNING * INTO l;
   INSERT INTO app.accounting_export_outbox(tenant_id,source_id) VALUES(t,source) RETURNING * INTO o;
  END IF;
 ELSIF l.source_id IS NULL THEN RAISE EXCEPTION 'EXPORT_NOT_FOUND';
 END IF;
 IF operation<>'approve' THEN
  SELECT * INTO d FROM app.accounting_export_decision WHERE tenant_id=t AND id=l.decision_id;
  IF d.actor_id<>actor THEN RAISE EXCEPTION 'EXPORT_NOT_FOUND'; END IF;
  IF l.artifact<>f.artifact THEN RAISE EXCEPTION 'EXPORT_STALE_REVISION'; END IF;
  IF operation='read' THEN
   IF v<>'{}'::jsonb THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT'; END IF;
  ELSE
   IF d.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'EXPORT_APPROVAL_REQUIRED'; END IF;
   attempt:=(v->>'attemptId')::uuid;
   IF attempt IS NULL OR v->>'version' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT'; END IF;
   IF operation='claim' THEN
    IF v-ARRAY['version','attemptId']<>'{}'::jsonb THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT'; END IF;
    -- Commit the unknown state BEFORE any external call. Never reclaim an in-flight attempt.
    IF o.status<>'pending' THEN RAISE EXCEPTION 'EXPORT_RECONCILE_REQUIRED'; END IF;
    INSERT INTO app.accounting_export_attempt(tenant_id,id,source_id) VALUES(t,attempt,source);
    UPDATE app.accounting_export_outbox SET status='outcome_unknown',attempt_id=attempt,attempts=attempts+1
     WHERE tenant_id=t AND source_id=source RETURNING * INTO o;
   ELSE
    IF v-ARRAY['version','attemptId']<>'{}'::jsonb THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT'; END IF;
    IF o.attempt_id IS DISTINCT FROM attempt THEN RAISE EXCEPTION 'EXPORT_REPLAY_CONFLICT'; END IF;
    SELECT i.matches INTO matches FROM app.accounting_export_inbox i
     JOIN app.accounting_export_attempt a ON a.tenant_id=i.tenant_id AND a.id=i.attempt_id
     WHERE i.tenant_id=t AND i.attempt_id=attempt AND a.source_id=source
     ORDER BY i.observed_at DESC,i.id DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'EXPORT_OBSERVATION_REQUIRED'; END IF;
    observation:=matches->0;
    IF jsonb_array_length(matches)>1 THEN next_status:='duplicate_import';
    ELSIF jsonb_array_length(matches)=0 THEN next_status:=CASE WHEN o.external_id IS NULL THEN 'confirmed_absent' ELSE 'reference_conflict' END;
    ELSIF observation->>'id' IS NULL OR observation->>'id' !~ '^demo-[a-z0-9-]{1,80}$' THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT';
    ELSIF observation->>'tenantId' IS DISTINCT FROM f.artifact #>> '{scope,tenantId}'
      OR observation->>'reference' IS DISTINCT FROM l.reference
      OR (o.external_id IS NOT NULL AND o.external_id<>observation->>'id') THEN next_status:='reference_conflict';
    ELSIF observation->>'contentHash' IS DISTINCT FROM d.preview_hash OR observation->'payload' IS DISTINCT FROM l.artifact->'target' THEN next_status:='external_edit';
    ELSE next_status:='pushed'; END IF;
    -- External paid is deliberately ignored; no settlement, journal or recovery write exists here.
    UPDATE app.accounting_export_outbox SET status=next_status,
     external_id=CASE WHEN next_status='pushed' THEN observation->>'id' ELSE external_id END
     WHERE tenant_id=t AND source_id=source RETURNING * INTO o;
   END IF;
  END IF;
 END IF;
 result:=jsonb_build_object('version',1,'sourceId',source,'reference',l.reference,'previewHash',app.final_lock_hash(l.artifact),'artifact',l.artifact,
  'status',o.status,'attemptId',o.attempt_id,'attempts',o.attempts,'externalId',o.external_id,'qualifyingRecoveryProof',false);
 IF operation<>'read' THEN
  PERFORM app.accounting_export_audit(t,actor,coalesce(decision,attempt),operation,app.final_lock_hash(v),app.final_lock_hash(result));
 END IF;
 RETURN result;
END;
END
$$;

-- Latest body: packages/db/migrations/0548_server_plan_entitlements.sql
CREATE OR REPLACE FUNCTION app.mon8_retained_baseline_actor(p_session uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) checked_session WHERE checked_session.tenant_id=app.current_tenant() AND checked_session.membership_id=app.current_actor()) THEN
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

-- Latest body: packages/db/migrations/0699_sync_checkpoint_bound_reader.sql
CREATE OR REPLACE FUNCTION app.sync_snapshot_generation(u uuid,r bigint,s bigint,h text,e text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR NOT EXISTS(SELECT 1 FROM app.membership bound_member WHERE bound_member.tenant_id=app.current_tenant()
   AND bound_member.id=app.current_actor() AND bound_member.identity_user_id=u) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid := nullif(current_setting('app.tenant_id',true),'')::uuid; g bigint; bound jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'SYNC_CHECKPOINT_INVALID';
 END IF;
 IF t IS NULL OR u IS NULL OR e IS DISTINCT FROM 'synthetic_demo'
  OR r IS NULL OR r NOT BETWEEN 0 AND 9007199254740991
  OR s IS NULL OR s NOT BETWEEN 1 AND 9007199254740991
  OR h IS NULL OR h !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'SYNC_CHECKPOINT_INVALID';
 END IF;
 bound := app.bound_context_reader();
 IF bound IS NOT DISTINCT FROM NULL OR (bound->>'tenant_id')::uuid IS DISTINCT FROM t
  OR NOT EXISTS (SELECT 1 FROM app.membership m
   WHERE NOT (m.tenant_id IS DISTINCT FROM t)
   AND NOT (m.id IS DISTINCT FROM (bound->>'actor_id')::uuid)
   AND NOT (m.identity_user_id IS DISTINCT FROM u)
   AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND NOT EXISTS (SELECT 1 FROM app.contractor_membership_revocation v
    WHERE NOT (v.tenant_id IS DISTINCT FROM m.tenant_id)
    AND NOT (v.membership_id IS DISTINCT FROM m.id))) THEN
  RAISE EXCEPTION 'SYNC_AUTHORITY_REQUIRED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.identity_user_id=u
  AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND NOT EXISTS (SELECT 1 FROM app.contractor_membership_revocation v
   WHERE v.tenant_id=m.tenant_id AND v.membership_id=m.id)) THEN
  RAISE EXCEPTION 'SYNC_CHECKPOINT_INVALID';
 END IF;
 INSERT INTO app.sync_snapshot_checkpoint AS c(tenant_id,user_id,authority_revision,schema_version,scope_hash,generation)
 VALUES(t,u,r,s,h,1)
 ON CONFLICT(tenant_id,user_id) DO UPDATE SET
  authority_revision=excluded.authority_revision,schema_version=excluded.schema_version,scope_hash=excluded.scope_hash,
  generation=c.generation + (CASE WHEN excluded.authority_revision>c.authority_revision
   OR excluded.schema_version>c.schema_version THEN 1 ELSE 0 END)
 WHERE excluded.authority_revision>=c.authority_revision AND excluded.schema_version>=c.schema_version
  AND (excluded.authority_revision>c.authority_revision OR excluded.scope_hash=c.scope_hash)
 RETURNING generation INTO g;
 IF g IS NULL THEN RAISE EXCEPTION 'SYNC_CHECKPOINT_STALE'; END IF;
 RETURN g;
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

-- Latest body: packages/db/migrations/0658_lp6b_effective_session_actor.sql
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
  -- A switch must not revive the base owner's revoked or expired membership.
  IF NOT EXISTS(SELECT 1 FROM app.membership base
   WHERE (base.tenant_id,base.id,base.identity_user_id)=(p_tenant,practice.membership_id,practice.identity_user_id)
    AND base.revoked_at IS NULL AND (base.expires_at IS NULL OR base.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE (r.tenant_id,r.membership_id)=(base.tenant_id,base.id))) THEN
   RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
  END IF;
  SELECT m.id INTO selected_actor FROM app.lp6d_contractor_session_identity(p_credential::uuid) effective
   JOIN app.membership m ON (m.tenant_id,m.id,m.identity_user_id)=(effective.tenant_id,effective.membership_id,effective.identity_user_id)
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
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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

-- Router ruling (r8): contractor_session keeps refusing a revoked base owner. That
-- refusal is still a recorded 403, never an outage. This refusal-only lookup names the
-- live session's base principal ONLY when that principal can no longer be bound, so
-- the caller can write the existing ENT-10b refusal audit before refusing. It grants
-- no binding, no business read and returns nothing for an active or unknown session.
CREATE FUNCTION app.lp6d_refused_contractor_principal(s uuid)
 RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE l record; saved text:=current_setting('app.tenant_id',true); active boolean;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR s IS NULL THEN RETURN; END IF;
 SELECT x.tenant_id,x.membership_id,x.identity_user_id INTO l FROM app.contractor_practice_session_live(s) x LIMIT 1;
 IF l.tenant_id IS NULL THEN RETURN; END IF;
 PERFORM set_config('app.tenant_id',l.tenant_id::text,true);
 active:=EXISTS(SELECT 1 FROM app.membership base
  WHERE (base.tenant_id,base.id,base.identity_user_id)=(l.tenant_id,l.membership_id,l.identity_user_id)
   AND base.revoked_at IS NULL AND (base.expires_at IS NULL OR base.expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE (r.tenant_id,r.membership_id)=(base.tenant_id,base.id)));
 PERFORM set_config('app.tenant_id',coalesce(saved,''),true);
 IF active THEN RETURN; END IF;
 RETURN QUERY SELECT l.tenant_id,l.membership_id,l.identity_user_id;
END $$;
ALTER FUNCTION app.lp6d_refused_contractor_principal(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6d_refused_contractor_principal(uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.lp6d_refused_contractor_principal(uuid) TO jobguard_runtime;

-- Latest body: packages/db/migrations/0549_contractor_feature_guards.sql
CREATE OR REPLACE FUNCTION identity.invite_member(session_digest char(64), t uuid, recipient varchar, assigned_role varchar)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
DECLARE s identity.session; a uuid; actor uuid; invitation_id uuid:=gen_random_uuid();
BEGIN
 -- LP6D_BOUND: bind before any membership or tenant lock.
 PERFORM app.bind_request('real',session_digest::text,t);
 SELECT * INTO s FROM identity.session WHERE token_digest=session_digest AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
 -- Contractor revocation owns this same tenant key (seed 54). Take it before the authority read.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 SELECT * INTO s FROM identity.session WHERE token_digest=session_digest AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT m.account_id,m.id INTO a,actor FROM app.membership m WHERE m.tenant_id=t AND m.identity_user_id=s.user_id AND m.id=app.current_actor()
  AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r
   WHERE r.tenant_id=m.tenant_id AND r.membership_id=m.id) FOR SHARE OF m;
 IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF assigned_role='operative' THEN PERFORM app.mon8_require_feature(actor,'operative_roles'); END IF;
 INSERT INTO identity.invitation(id,email,tenant_id,account_id,role,expires_at,issuer_user_id)
 VALUES(invitation_id,recipient,t,a,assigned_role,clock_timestamp()+interval '1 day',s.user_id);
 INSERT INTO identity.security_event VALUES(gen_random_uuid(),'invitation.created',invitation_id,clock_timestamp());
 RETURN invitation_id;
END $$;
-- The last direct authorization write is narrowed to the existing recovery
-- message revoke command. Completion/audit/outbox cancellation remain atomic
-- in its caller and the LP-5 deferred completion proof.
CREATE FUNCTION app.lp6d_require_revoke_claim(t uuid,actor uuid,cid uuid,j uuid,case_id uuid,message_id uuid,revision integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE claim app.command_lifecycle_claim; input jsonb;
BEGIN
 IF app.current_actor() IS NULL OR t IS DISTINCT FROM app.current_tenant() OR actor IS DISTINCT FROM app.current_actor()
  OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO claim FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=cid;
 input:=claim.significant_input->'input';
 IF claim.command_id IS NULL OR claim.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR claim.actor_membership_id IS DISTINCT FROM actor OR claim.version IS DISTINCT FROM 'repository-command.v1'
  OR (claim.resource->>'subjectRef') IS DISTINCT FROM j::text
  OR (input->>'caseId') IS DISTINCT FROM case_id::text
  OR (input->>'messageId') IS DISTINCT FROM message_id::text
  OR (input->>'action') IS DISTINCT FROM 'revoke'
  OR (input->>'expectedRevision')::integer IS DISTINCT FROM revision THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
 END IF;
END $$;
-- Temporary schema CREATE is required for ALTER OWNER (same as 0521/0522), never retained.
GRANT CREATE ON SCHEMA app TO jobguard_command_writer;
ALTER FUNCTION app.lp6d_require_revoke_claim(uuid,uuid,uuid,uuid,uuid,uuid,integer) OWNER TO jobguard_command_writer;
REVOKE CREATE ON SCHEMA app FROM jobguard_command_writer;
REVOKE ALL ON FUNCTION app.lp6d_require_revoke_claim(uuid,uuid,uuid,uuid,uuid,uuid,integer) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.lp6d_require_revoke_claim(uuid,uuid,uuid,uuid,uuid,uuid,integer) TO jobguard_migration;

CREATE FUNCTION app.revoke_recovery_message_authorization(p_tenant uuid,p_actor uuid,p_command uuid,p_message uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE message app.recovery_message; approved app.recovery_message_approval;
BEGIN
 -- LP6D_BOUND
 IF app.current_actor() IS NULL OR p_actor IS DISTINCT FROM app.current_actor() OR p_tenant IS DISTINCT FROM app.current_tenant()
  OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO message FROM app.recovery_message WHERE tenant_id=p_tenant AND id=p_message;
 SELECT * INTO approved FROM app.recovery_message_approval WHERE tenant_id=p_tenant AND message_id=p_message;
 PERFORM app.lp6d_require_revoke_claim(p_tenant,p_actor,p_command,message.job_id,message.case_id,p_message,
  (SELECT coalesce(max(revision),0)::integer FROM app.recovery_message_event WHERE tenant_id=p_tenant AND message_id=p_message));
 IF message.id IS NULL OR approved.authorization_id IS NULL
  OR NOT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command
    AND actor_membership_id=p_actor AND command_type='recovery.message.revoke' AND status='processing')
  OR NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner'
    AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
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
-- LP-0 grant freeze: runtime keeps no UPDATE on action_authorization at all. The recovery-message
-- sink guard (latest body 0112) took FOR SHARE OF action_authorization as the runtime invoker,
-- which needs a column UPDATE grant. That one row lock now runs inside this migration-owned
-- definer; it locks only the authorization named by the tenant's own outbox action.
CREATE FUNCTION app.lp6d_share_sink_authorization(p_tenant uuid,p_outbox uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_SINK_INVALID' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM app.action_outbox o JOIN app.action_authorization a ON a.tenant_id=o.tenant_id AND a.id=o.authorization_id
  WHERE o.tenant_id=p_tenant AND o.id=p_outbox FOR SHARE OF a;
END $$;
ALTER FUNCTION app.lp6d_share_sink_authorization(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6d_share_sink_authorization(uuid,uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.lp6d_share_sink_authorization(uuid,uuid) TO jobguard_runtime;

-- The same rule for every other runtime row lock on action_authorization (the commercial
-- grant executor, payment-fee collection and the 0555 signed-export guard): a migration-owned
-- definer takes FOR SHARE / FOR UPDATE on one authorization of the transaction's own tenant.
-- It returns nothing and writes nothing; callers re-read the row after the lock.
CREATE FUNCTION app.lp6d_lock_action_authorization(p_tenant uuid,p_authorization uuid,p_exclusive boolean) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 IF p_exclusive THEN
  PERFORM 1 FROM app.action_authorization a WHERE a.tenant_id=p_tenant AND a.id=p_authorization FOR UPDATE;
 ELSE
  PERFORM 1 FROM app.action_authorization a WHERE a.tenant_id=p_tenant AND a.id=p_authorization FOR SHARE;
 END IF;
END $$;
ALTER FUNCTION app.lp6d_lock_action_authorization(uuid,uuid,boolean) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6d_lock_action_authorization(uuid,uuid,boolean) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.lp6d_lock_action_authorization(uuid,uuid,boolean) TO jobguard_runtime;

-- Latest body: packages/db/migrations/0555_signed_evidence_export_store.sql; only the authorization row lock moves.
CREATE OR REPLACE FUNCTION app.guard_signed_evidence_export() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF TG_WHEN='AFTER' THEN
   IF NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.audit_event_id
     AND e.event_type='evidence_export.stored' AND e.subject_type='audit-export' AND e.subject_ref=NEW.id::text
     AND e.actor_ref='membership:'||NEW.actor_membership_id::text
     AND e.payload->'hashes'->>'bundle'=NEW.bundle_hash
     AND e.payload->'hashes'->>'recipient'=encode(sha256(convert_to(NEW.recipient,'UTF8')),'hex')
     AND e.payload->'references'->>'authorizationId'=NEW.authorization_id::text
     AND e.payload->'references'->>'jobId'=NEW.job_id::text
     AND e.payload->'references'->>'caseId'=NEW.case_id::text
     AND e.payload->'references'->>'signerId'=NEW.signer_id
     AND e.payload->'references'->>'keyVersion'=NEW.key_version)
   THEN RAISE EXCEPTION 'SIGNED_EXPORT_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
   RETURN NEW;
 END IF;
 -- Freeze membership and approval before the audit head is acquired.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text,54));
 PERFORM 1 FROM app.membership m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.actor_membership_id FOR SHARE;
 -- LP6D_NO_RUNTIME_AUTHORIZATION_UPDATE: the authorization row lock runs in the migration-owned definer.
 PERFORM app.lp6d_lock_action_authorization(NEW.tenant_id,NEW.authorization_id,false);
 IF NOT EXISTS (
   SELECT 1 FROM app.action_authorization a
   JOIN app.decision d ON (d.tenant_id,d.id)=(a.tenant_id,a.decision_id)
   JOIN app.decision_resolution r ON (r.tenant_id,r.id,r.decision_id)=(a.tenant_id,a.resolution_id,a.decision_id)
   JOIN app.membership m ON (m.tenant_id,m.id)=(a.tenant_id,a.actor_membership_id)
   JOIN app.evidence_export_signer_key k ON k.tenant_id=a.tenant_id
     AND k.signer_id=NEW.signer_id AND k.key_version=NEW.key_version
   WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.authorization_id
     AND a.actor_membership_id=NEW.actor_membership_id AND r.actor_membership_id=NEW.actor_membership_id
     AND a.action_type='evidence_export.store' AND d.subject_type='recovery_case'
     AND d.subject_ref=NEW.case_id::text AND r.resolution='approved'
     AND a.recipient=NEW.recipient AND a.content_hash=NEW.bundle_hash
     AND a.policy_version='signed-evidence-export-store.v1' AND a.aggregate_revision=0
     AND a.amount_pence IS NULL AND a.currency IS NULL AND a.revoked_at IS NULL
     AND a.expires_at>clock_timestamp() AND m.revoked_at IS NULL
     AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
     AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation v WHERE v.tenant_id=m.tenant_id AND v.membership_id=m.id)
     AND m.role='owner' AND k.record=NEW.bundle_text::jsonb->'signer'
     AND (k.record->>'revoked')::boolean=false
 ) THEN RAISE EXCEPTION 'SIGNED_EXPORT_AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_signed_evidence_export() OWNER TO jobguard_migration;

-- Latest body: packages/db/migrations/0112_recovery_follow_up.sql; only the authorization row lock moves.
CREATE OR REPLACE FUNCTION app.guard_recovery_message_sink() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m app.recovery_message; s record; latest_pack integer; pack_sources jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.case_id::text));
 PERFORM app.lock_recovery_message_sources(NEW.tenant_id);
 SELECT * INTO m FROM app.recovery_message WHERE tenant_id=NEW.tenant_id AND id=NEW.message_id AND job_id=NEW.job_id AND case_id=NEW.case_id;
 -- LP6D_NO_RUNTIME_AUTHORIZATION_UPDATE: a migration-owned definer takes the authorization row lock,
 -- so this invoker needs no UPDATE grant on action_authorization. The check below re-reads the row.
 PERFORM app.lp6d_share_sink_authorization(NEW.tenant_id,NEW.outbox_action_id);
 IF NOT FOUND OR NOT EXISTS (
  SELECT 1 FROM app.recovery_message_approval ap
  JOIN app.action_outbox o ON o.tenant_id=ap.tenant_id AND o.id=ap.outbox_action_id
  JOIN app.action_authorization a ON a.tenant_id=o.tenant_id AND a.id=o.authorization_id
  JOIN app.decision_resolution r ON r.tenant_id=a.tenant_id AND r.id=a.resolution_id AND r.resolution='approved'
  JOIN app.membership mem ON mem.tenant_id=a.tenant_id AND mem.id=a.actor_membership_id AND mem.role='owner' AND mem.revoked_at IS NULL
   AND (mem.expires_at IS NULL OR mem.expires_at>clock_timestamp())
  WHERE ap.tenant_id=m.tenant_id AND ap.message_id=m.id AND ap.outbox_action_id=NEW.outbox_action_id
   AND o.status='executing' AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp()
   AND m.recipient=NEW.recipient AND m.body=NEW.body AND m.content_hash=NEW.content_hash AND m.attachment_hash=NEW.attachment_hash
  FOR SHARE OF mem,o)
 THEN RAISE EXCEPTION 'RECOVERY_MESSAGE_SINK_INVALID' USING ERRCODE='23514'; END IF;
 -- M4-6-S: a reminder whose follow-up has stopped (cancelled, or its practice run archived) is never recorded as delivered.
 IF EXISTS (SELECT 1 FROM app.recovery_follow_up_reminder l WHERE l.tenant_id=m.tenant_id AND l.message_id=m.id
   AND app.recovery_follow_up_stop_reason(l.tenant_id,l.follow_up_id) IS NOT NULL) THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
 SELECT * INTO s FROM app.recovery_message_case_snapshot(m.tenant_id,m.job_id,m.case_id);
 IF NOT FOUND OR s.synthetic IS NOT TRUE OR s.environment<>'synthetic_demo' OR s.case_revision<>m.case_revision OR s.outstanding_pence<>m.amount_pence
    OR app.recovery_message_source_refs(m.immutable_content) IS DISTINCT FROM s.source_refs THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
 SELECT max(p.revision) INTO latest_pack FROM app.evidence_pack_revision p WHERE p.tenant_id=m.tenant_id AND p.case_id=m.case_id;
 SELECT p.sources INTO pack_sources FROM app.evidence_pack_revision p
  WHERE p.tenant_id=m.tenant_id AND p.job_id=m.job_id AND p.case_id=m.case_id AND p.pack_id=m.pack_id AND p.revision=m.pack_revision
   AND p.manifest_hash=m.manifest_hash AND p.content_hash=m.attachment_hash
   AND p.source_omissions='[]'::jsonb AND p.format='TEXT' AND p.artifact_text IS NOT NULL
   AND encode(sha256(convert_to(p.artifact_text,'UTF8')),'hex')=p.content_hash
   AND encode(sha256(convert_to(p.canonical_manifest,'UTF8')),'hex')=p.manifest_hash;
 IF latest_pack IS DISTINCT FROM m.pack_revision OR pack_sources IS NULL
    OR NOT EXISTS (SELECT 1 FROM app.evidence_pack_attachment_approval x WHERE x.tenant_id=m.tenant_id AND x.id=m.attachment_approval_id AND x.pack_id=m.pack_id
      AND x.manifest_hash=m.manifest_hash AND x.content_hash=m.attachment_hash)
    OR NOT app.recovery_message_proofs_current(m.tenant_id,m.job_id,pack_sources)
    OR NOT app.recovery_message_sources_current(m.tenant_id,m.job_id,m.case_id,pack_sources) THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_recovery_message_sink() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_recovery_message_sink() FROM PUBLIC;

-- Worker/support entry points were never runtime entry points. Preserve their
-- separate shadow/support execution contracts (including must-surface safety)
-- and explicitly keep the request login unavailable. LP-10 handles worker
-- authority; no user binding is imposed on a must-surface background action.
REVOKE ALL ON FUNCTION app.record_shadow_disclosure(uuid,uuid,uuid,uuid,text),
 app.read_shadow_emergency(uuid,uuid,text),app.read_final_check_manifest(uuid,uuid,uuid),
 app.prepare_evidence_pack_v3(uuid,uuid),app.complete_evidence_pack_v3_check(uuid,uuid,text),
 app.finish_evidence_pack_v3(uuid,uuid,jsonb,text,text) FROM PUBLIC,jobguard_runtime;

-- Latest body: packages/db/migrations/0690_import_ancestry_record_anchor.sql
-- Runtime EXECUTE stays (0506): the real caller is the API RecoveryTimelineStore, which runs
-- inside withTenant on the practice session's own bound context (PracticeAccess). It is a
-- bound request path, not a session-less worker, so it gets the binding check instead.
CREATE OR REPLACE FUNCTION app.apply_recovery_timeline_signal(p_tenant uuid,p_signal jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE
 f app.recovery_follow_up%ROWTYPE;
 incoming_signal_id uuid; event_id uuid; signal_kind text; fingerprint text; previous_hash text; next_state text;
 session_digest text := nullif(current_setting('app.practice_material_digest',true),'');
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR p_tenant IS NULL
    OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- No fingerprint, state or arbitrary extra field is an input to this boundary.
 IF p_signal IS NULL OR jsonb_typeof(p_signal) IS DISTINCT FROM 'object'
    OR NOT (p_signal ?& ARRAY['version','signalId','eventId','kind','ref'])
    OR p_signal - ARRAY['version','signalId','eventId','kind','ref'] <> '{}'::jsonb
    OR EXISTS(SELECT 1 FROM jsonb_each(p_signal - 'ref') e WHERE jsonb_typeof(e.value)<>'string')
    OR p_signal->>'version' NOT IN ('recovery-timeline-signal.v1','recovery-timeline-signal.v2')
    OR p_signal->>'kind' NOT IN ('timer','builder_response','evidence_complete','cancel','close')
    OR jsonb_typeof(p_signal->'ref') IS DISTINCT FROM 'object'
    OR NOT ((p_signal->'ref') ?& ARRAY['tenantId','jobId','caseId','runId','followUpId'])
    OR (p_signal->'ref') - ARRAY['tenantId','jobId','caseId','runId','followUpId'] <> '{}'::jsonb
    OR EXISTS(SELECT 1 FROM jsonb_each(p_signal->'ref') e WHERE jsonb_typeof(e.value)<>'string') THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 incoming_signal_id := (p_signal->>'signalId')::uuid;
 event_id := (p_signal->>'eventId')::uuid;
 signal_kind := p_signal->>'kind';
 IF incoming_signal_id IS NULL OR event_id IS NULL OR signal_kind IS NULL THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('recovery-timeline:'||p_tenant||':signal:'||incoming_signal_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('recovery-timeline:'||p_tenant||':intent:'||(p_signal->'ref'->>'followUpId')::uuid,0));
 SELECT * INTO f FROM app.recovery_follow_up
 WHERE tenant_id=p_tenant AND id=(p_signal->'ref'->>'followUpId')::uuid;
 IF NOT FOUND OR f.environment<>'synthetic_demo'
    OR (p_signal->'ref'->>'tenantId')::uuid IS DISTINCT FROM f.tenant_id
    OR (p_signal->'ref'->>'jobId')::uuid IS DISTINCT FROM f.job_id
    OR (p_signal->'ref'->>'caseId')::uuid IS DISTINCT FROM f.case_id
    OR (p_signal->'ref'->>'runId')::uuid IS DISTINCT FROM f.run_id THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_NOT_FOUND' USING ERRCODE='42501';
 END IF;
 -- Reuse the existing persisted practice-session and immutable ownership checks.
 -- A tenant setting or an invented digest alone cannot authorize a history write.
 IF session_digest IS NULL OR NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(session_digest,p_tenant))
    OR NOT EXISTS(
     WITH RECURSIVE owned_job AS (
      SELECT j.id FROM app.job j WHERE j.tenant_id=p_tenant AND j.practice_session_digest=session_digest
      UNION
      SELECT j.id FROM owned_job source
      JOIN app.audit_event e ON e.tenant_id=p_tenant AND e.subject_type='job'
       AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
      JOIN app.job j ON j.tenant_id=e.tenant_id AND j.id::text=e.subject_ref
       AND j.provenance='imported' AND j.practice_session_digest IS NULL
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=p_tenant AND iv.job_id=j.id AND iv.source_job_id=source.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=p_tenant AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||j.id::text AND rv.result->>'jobId'=j.id::text AND rv.result->>'sourceJobId'=source.id::text))
     ) SELECT 1 FROM owned_job WHERE id=f.job_id
    ) THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- References come from the immutable follow-up, not a caller-supplied run/hash/state.
 fingerprint := encode(sha256(convert_to(jsonb_build_object(
  'version','recovery-timeline-signal.v2','signalId',incoming_signal_id,'eventId',event_id,'kind',signal_kind,
  'ref',jsonb_build_object('tenantId',f.tenant_id,'jobId',f.job_id,'caseId',f.case_id,
    'runId',f.run_id,'followUpId',f.id))::text,'UTF8')),'hex');
 SELECT s.fingerprint INTO previous_hash FROM app.recovery_timeline_signal s
 WHERE s.tenant_id=p_tenant AND s.signal_id=incoming_signal_id;
 IF previous_hash IS NOT NULL AND previous_hash<>fingerprint THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_CONFLICT' USING ERRCODE='23514';
 END IF;
 next_state := CASE
  WHEN app.recovery_follow_up_stop_reason(p_tenant,f.id) IS NOT NULL THEN 'stopped'
  WHEN EXISTS(SELECT 1 FROM app.recovery_follow_up_due d WHERE d.tenant_id=p_tenant AND d.follow_up_id=f.id) THEN 'review'
  ELSE 'waiting' END;
 INSERT INTO app.recovery_timeline_run AS r(tenant_id,follow_up_id,job_id,case_id,run_id,state)
 VALUES(p_tenant,f.id,f.job_id,f.case_id,f.run_id,next_state)
 ON CONFLICT(tenant_id,follow_up_id) DO UPDATE SET state=CASE WHEN r.state='stopped' THEN 'stopped' ELSE excluded.state END
 RETURNING state INTO next_state;
 IF previous_hash IS NULL THEN
  PERFORM app.record_recovery_timeline_signal(p_tenant,incoming_signal_id,f.id,fingerprint);
 END IF;
 RETURN next_state;
END;
END
$$;

-- Latest body: packages/db/migrations/0566_managed_recovery_election.sql
CREATE OR REPLACE FUNCTION app.mon9_session(digest text,actor uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 PERFORM app.bind_request('real',digest,app.current_tenant());
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; s identity.session; u uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR t IS NULL OR digest !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 PERFORM 1 FROM identity.session se WHERE se.token_digest=digest FOR SHARE;
 SELECT * INTO s FROM identity.session se WHERE se.token_digest=digest
  AND se.environment='synthetic_demo' AND se.revoked_at IS NULL AND se.expires_at>clock_timestamp();
 IF s.id IS NULL THEN RETURN NULL; END IF;
 SELECT m.identity_user_id INTO u FROM identity.sso_session_memberships(s.user_id,s.id) m
  WHERE m.tenant_id=t AND m.id=actor AND m.role='owner';
 PERFORM set_config('app.tenant_id',t::text,true);
 RETURN u;
END;
END
$$;

-- Latest body: packages/db/migrations/0614_mon9_database_gate.sql
CREATE OR REPLACE FUNCTION app.mon9_elect(j uuid,c uuid,actor uuid,command uuid,auth_id uuid,service text,points integer,terms text)
RETURNS app.managed_recovery_election LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; prior app.managed_recovery_election; h text;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF t IS NULL THEN RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(c::text));
 IF terms IS DISTINCT FROM 'managed-recovery.synthetic-terms.v1' OR
  ((service='drafted_for_you' AND points=5) OR (service='solicitor_letter' AND points=10)) IS NOT TRUE
 THEN RAISE EXCEPTION 'INVALID_MANAGED_RECOVERY' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.recovery_case r JOIN app.job job ON(job.tenant_id,job.id)=(r.tenant_id,r.job_id)
  JOIN app.job_commercial_track track ON(track.tenant_id,track.job_id)=(r.tenant_id,r.job_id)
  WHERE r.tenant_id=t AND r.job_id=j AND r.id=c AND r.synthetic AND r.environment='synthetic_demo'
   AND r.case_type='withheld_customer_payment' AND job.fee_policy_version='reference_fee_policy_v3'
   AND track.job_track='small_builder' AND track.environment='synthetic_demo')
 THEN RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 h:=encode(sha256(convert_to('managed-recovery-election-command.v1'||chr(10)||j::text||chr(10)||c::text||chr(10)||service||chr(10)||points::text||chr(10)||terms,'UTF8')),'hex');
 IF NOT EXISTS(SELECT 1 FROM app.command_receipt cr
  JOIN app.membership m ON(m.tenant_id,m.id)=(cr.tenant_id,cr.actor_membership_id)
  JOIN app.action_authorization a ON(a.tenant_id,a.actor_membership_id)=(cr.tenant_id,m.id)
  JOIN app.decision_resolution r ON(r.tenant_id,r.id)=(a.tenant_id,a.resolution_id)
  JOIN app.decision d ON(d.tenant_id,d.id)=(a.tenant_id,a.decision_id)
  WHERE cr.tenant_id=t AND cr.command_id=command AND cr.actor_membership_id=actor AND cr.status='processing'
   AND cr.command_type='managed_recovery.elect' AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND a.id=auth_id AND a.action_type='managed_recovery.elect' AND a.content_hash=h AND a.aggregate_revision=1
   AND a.policy_version=terms AND a.recipient IS NULL AND a.amount_pence IS NULL AND a.currency IS NULL
   AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND r.resolution='approved'
   AND r.decision_id=d.id AND r.actor_membership_id=actor AND d.action_type='managed_recovery.elect'
   AND d.subject_type='recovery_case' AND d.subject_ref=c::text)
 THEN RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM app.managed_recovery_election e WHERE e.tenant_id=t AND e.case_id=c;
 IF prior.case_id IS NOT NULL THEN RAISE EXCEPTION 'MANAGED_RECOVERY_CONFLICT' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM app.managed_recovery_pursuit p WHERE p.tenant_id=t AND p.case_id=c)
  -- Owner/legacy writes outside a tenant command do not create a MON-9 marker.
  -- Their immutable pursuit history must still prevent a later election.
  OR EXISTS(SELECT 1 FROM app.recovery_case_event e WHERE e.tenant_id=t AND e.job_id=j AND e.case_id=c AND e.event_type NOT IN('opened','claim_amended','assemble_evidence'))
  OR EXISTS(SELECT 1 FROM app.recovery_message m WHERE m.tenant_id=t AND m.job_id=j AND m.case_id=c)
  OR EXISTS(SELECT 1 FROM app.recovery_message_approval a WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c)
  OR EXISTS(SELECT 1 FROM app.recovery_message_sink s WHERE s.tenant_id=t AND s.job_id=j AND s.case_id=c)
  OR EXISTS(SELECT 1 FROM app.recovery_case r WHERE r.tenant_id=t AND r.job_id=j AND r.id=c AND r.state<>'identified')
  OR EXISTS(SELECT 1 FROM app.recovery_case_current r WHERE r.tenant_id=t AND r.job_id=j AND r.id=c AND r.state NOT IN('identified','evidence_assembled'))
 THEN RAISE EXCEPTION 'PURSUIT_ALREADY_STARTED' USING ERRCODE='23514'; END IF;
 INSERT INTO app.managed_recovery_election(tenant_id,job_id,case_id,command_id,actor_membership_id,authorization_id,service,points,terms_version)
 VALUES(t,j,c,command,actor,auth_id,service,points,terms) RETURNING * INTO prior;
 -- No further business writes follow the audit seal; completion appends its own
 -- checked event through the existing LP-5 boundary.
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
  'actorRef','membership:'||actor::text,'eventType','managed_recovery.elected',
  'subjectType','recovery_case','subjectRef',c::text,'payload',jsonb_build_object(
   'references',jsonb_build_object('jobId',j::text,'commandId',command::text),
   'hashes',jsonb_build_object('election',encode(sha256(convert_to(replace(jsonb_build_array(
    'managed-recovery-election.v1',t,j,c,command,actor,
    to_char(prior.elected_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    terms,service,points)::text,', ',','),'UTF8')),'hex')),
   'classifications',jsonb_build_object('action','commercial')))),'checked_operation');
 RETURN prior;
END;
END
$$;

-- Latest body: packages/db/migrations/0614_mon9_database_gate.sql
CREATE OR REPLACE FUNCTION app.mon9_elect(digest text,j uuid,c uuid,actor uuid,command uuid,auth_id uuid,service text,points integer,terms text)
RETURNS app.managed_recovery_election LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF app.mon9_session(digest,actor) IS NULL THEN
  RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 RETURN app.mon9_elect(j,c,actor,command,auth_id,service,points,terms);
END;
END
$$;

-- Latest body: packages/db/migrations/0573_site_supervisor_query.sql
CREATE OR REPLACE FUNCTION app.ent3_supervisor_query(p_job uuid,p_actor uuid,p_body jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 current_revision uuid; current_status text; member_role text; cmd uuid; claim jsonb; result jsonb;
 line app.work_order_line; content jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Match the existing administration and approval-chain job lock order.
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_job::text,417));
 SELECT role INTO member_role FROM app.membership WHERE tenant_id=t AND id=p_actor;
 IF p_body IS NULL THEN
  IF app.xa_covers(p_actor,ARRAY['supervisor'],p_job,'job.read') IS NULL THEN
   RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 ELSE
  IF member_role IS DISTINCT FROM 'operative' OR NOT EXISTS(
   SELECT 1 FROM app.ent3a_extra_authority(p_actor,'LogSiteExtra',p_job) WHERE decision='allowed') THEN
   RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  PERFORM app.mon8_require_feature(p_actor,'site_origin_capture');
 END IF;
 SELECT r.id,r.status INTO current_revision,current_status FROM app.work_order w
 JOIN app.work_order_current k ON(k.tenant_id,k.work_order_id)=(w.tenant_id,w.id)
 JOIN app.work_order_revision r ON(r.tenant_id,r.work_order_id,r.id)=(k.tenant_id,k.work_order_id,k.revision_id)
 WHERE w.tenant_id=t AND w.job_id=p_job FOR SHARE OF k;
 IF current_revision IS NULL OR current_status='cancelled' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF p_body IS NULL THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('version','site-supervisor-query.v1','environment','synthetic_demo','realExternalActions',0,
   'queryId',x.id,'jobId',x.job_id,'orderLineScopeItemId',x.order_line_scope_item_id,'sorCode',x.sor_code,'quantity',x.quantity,
   'orderRevisionId',x.order_revision_id,'operativeMembershipId',x.operative_membership_id,
   'recordedAt',to_char(x.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY x.recorded_at,x.id),'[]'::jsonb)
   INTO result FROM app.site_supervisor_query x WHERE x.tenant_id=t AND x.job_id=p_job;
  RETURN jsonb_build_object('version','site-supervisor-queries.v1','environment','synthetic_demo','realExternalActions',0,'jobId',p_job,'queries',result);
 END IF;
 IF jsonb_typeof(p_body) IS DISTINCT FROM 'object'
  OR (p_body-ARRAY['version','commandId','orderLineScopeItemId','sorCode','quantity','expectedOrderRevisionId'])<>'{}'
  OR NOT(p_body ?& ARRAY['version','commandId','orderLineScopeItemId','sorCode','quantity','expectedOrderRevisionId'])
  OR (p_body->>'version') IS DISTINCT FROM 'record-site-supervisor-query.v1'
  OR jsonb_typeof(p_body->'quantity') IS DISTINCT FROM 'string'
  OR (p_body->>'quantity') !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'
  OR (p_body->>'quantity')::numeric<=0
  OR jsonb_typeof(p_body->'sorCode') IS DISTINCT FROM 'string'
  OR length(p_body->>'sorCode') NOT BETWEEN 1 AND 80
  THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 cmd:=(p_body->>'commandId')::uuid;
 IF cmd IS NULL OR (p_body->>'expectedOrderRevisionId')::uuid IS NULL OR (p_body->>'orderLineScopeItemId')::uuid IS NULL THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 content:=p_body||jsonb_build_object('jobId',p_job);
 claim:=app.begin_command('repository-command.v1',cmd,'RecordSiteSupervisorQuery','supervisor-query:'||p_job::text||':'||cmd::text,
  jsonb_build_object('tenantId',t,'actorMembershipId',p_actor,'subjectType','job','subjectRef',p_job), '{}'::jsonb,
  jsonb_build_object('version','repository-command.v1','actorMembershipId',p_actor,'input',content,'legacyJson',content::text));
 IF claim->>'kind'='replay' THEN RETURN claim->'result'; END IF;
 IF current_revision IS DISTINCT FROM (p_body->>'expectedOrderRevisionId')::uuid THEN
  RAISE EXCEPTION 'ORDER_LINE_NOT_FOUND' USING ERRCODE='23514'; END IF;
 SELECT * INTO line FROM app.work_order_line WHERE tenant_id=t AND job_id=p_job AND revision_id=current_revision
  AND scope_item_id=(p_body->>'orderLineScopeItemId')::uuid AND sor_code=p_body->>'sorCode';
 IF line.id IS NULL THEN RAISE EXCEPTION 'ORDER_LINE_NOT_FOUND' USING ERRCODE='23514'; END IF;
 IF (p_body->>'quantity')::numeric>line.quantity::numeric THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE='23514'; END IF;
 INSERT INTO app.site_supervisor_query(tenant_id,id,command_id,job_id,order_revision_id,order_line_scope_item_id,sor_code,quantity,operative_membership_id)
 VALUES(t,gen_random_uuid(),cmd,p_job,current_revision,line.scope_item_id,line.sor_code,p_body->>'quantity',p_actor);
 -- complete_command derives the result from the stored query and seals command.succeeded
 -- through lp4_seal_audit as its final contending lock. No raw runtime receipt/audit writes.
 RETURN app.complete_command(cmd,'{}'::jsonb);
END;
END
$$;

-- Latest body: packages/db/migrations/0574_site_extra_work_status.sql
CREATE OR REPLACE FUNCTION app.ent3_work_status(p_job uuid,p_actor uuid,p_extra uuid,p_status text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
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
   OR NOT EXISTS(SELECT 1 FROM app.command_receipt r
    WHERE r.tenant_id=t AND r.command_id=o.command_id AND r.status='processing'
     AND r.actor_membership_id=p_actor) THEN
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
   'payload',jsonb_build_object('references',jsonb_build_object('job',p_job,'extra',p_extra,'command',o.command_id,
    'workStatus',p_status,'source','operative_statement'),
    'classifications',jsonb_build_object('action','operational')))),'checked_operation');
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('extraId',x.variation_id,'workStatus',x.work_status,
  'operativeMembershipId',x.operative_membership_id,'recordedAt',to_char(x.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'source','operative_statement') ORDER BY x.recorded_at,x.variation_id),'[]'::jsonb) INTO result
  FROM app.site_extra_work_status x WHERE x.tenant_id=t AND x.job_id=p_job AND (p_extra IS NULL OR x.variation_id=p_extra);
 RETURN result;
END;
END
$$;

-- Latest body: packages/db/migrations/0574_site_extra_work_status.sql
CREATE OR REPLACE FUNCTION app.ent3_proceed_comparison(p_job uuid,p_actor uuid,p_code text,p_quantity text) RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
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
END;
END
$$;

-- Latest body: packages/db/migrations/0577_worm_durable_commands.sql
CREATE OR REPLACE FUNCTION app.worm_submit(c jsonb) RETURNS app.worm_command
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR (c->>'actorMembershipId')::uuid IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 m app.membership; e app.evidence_object; prior app.worm_command; h app.worm_command; answer app.worm_command;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||'/worm',0));
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR
 c - ARRAY['version','policyVersion','commandId','idempotencyKey','actorMembershipId','jobId','evidenceId','action'] -
 (CASE c->>'action' WHEN 'release_hold' THEN ARRAY['releaseOf'] WHEN 'request_anchor' THEN ARRAY['subject'] ELSE ARRAY[]::text[] END) <> '{}'::jsonb
 THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 IF c->>'version' IS DISTINCT FROM 'worm.command.v1' OR c->>'policyVersion' IS DISTINCT FROM 'synthetic_d07_v1'
 OR c->>'action' IS NULL OR c->>'action' NOT IN ('apply_hold','release_hold','request_anchor') THEN
 RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 SELECT * INTO m FROM app.membership WHERE tenant_id=t AND id=(c->>'actorMembershipId')::uuid
 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM app.contractor_membership_revocation WHERE tenant_id=t AND membership_id=m.id)
 THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 -- The tenant-scoped lock also serializes same-key/different-command races.
 SELECT * INTO prior FROM app.worm_command WHERE tenant_id=t
 AND (id=(c->>'commandId')::uuid OR idempotency_key=(c->>'idempotencyKey')::uuid);
 IF FOUND THEN
 IF prior.payload<>c THEN RAISE EXCEPTION 'WORM_REPLAY_CONFLICT'; END IF;
 RETURN prior;
 END IF;
 SELECT o.* INTO e FROM app.evidence_object o JOIN app.worm_synthetic_version f
 ON (f.tenant_id,f.evidence_id,f.job_id)=(o.tenant_id,o.id,o.job_id)
 WHERE o.tenant_id=t AND o.id=(c->>'evidenceId')::uuid AND o.job_id=(c->>'jobId')::uuid;
 IF NOT FOUND OR e.object_key NOT LIKE 'synthetic/tenants/'||t::text||'/%'
 OR e.object_version_id IN ('','null') OR e.object_key ~ '(^|/)\.\.?(/|$)'
 THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 IF c->>'action'='request_anchor' AND (e.evidence_type NOT IN ('manifest','checkpoint') OR c->>'subject' IS DISTINCT FROM e.evidence_type)
 THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 IF c->>'action'='apply_hold' AND EXISTS(
 SELECT 1 FROM app.worm_command a WHERE a.tenant_id=t AND a.evidence_id=e.id AND a.action='apply_hold'
 AND a.status NOT IN ('cancelled','refused') AND NOT EXISTS(SELECT 1 FROM app.worm_command r
 WHERE r.tenant_id=t AND r.release_of=a.id AND r.status='applied'))
 THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 IF c->>'action'='release_hold' THEN
 SELECT * INTO h FROM app.worm_command WHERE tenant_id=t AND id=(c->>'releaseOf')::uuid
 AND evidence_id=e.id AND job_id=e.job_id AND action='apply_hold' AND status='applied';
 IF NOT FOUND OR h.identity_user_id=m.identity_user_id OR EXISTS(SELECT 1 FROM app.worm_command
 WHERE tenant_id=t AND release_of=h.id AND status NOT IN ('cancelled','refused')) THEN RAISE EXCEPTION 'WORM_REFUSED'; END IF;
 END IF;
 INSERT INTO app.worm_command(tenant_id,id,idempotency_key,actor_id,identity_user_id,evidence_id,job_id,action,payload,release_of,object_key,object_version_id,imprint)
 VALUES(t,(c->>'commandId')::uuid,(c->>'idempotencyKey')::uuid,m.id,m.identity_user_id,e.id,e.job_id,c->>'action',c,
 (c->>'releaseOf')::uuid,e.object_key,e.object_version_id,e.sha256) RETURNING * INTO answer;
 RETURN answer;
END;
END
$$;

-- Latest body: packages/db/migrations/0565_recovery_billability_integration.sql
CREATE OR REPLACE FUNCTION app.billability_snapshot(t uuid,j uuid,c uuid,w uuid,l uuid,actor uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR actor IS DISTINCT FROM app.current_actor()
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE k uuid; d jsonb; rc app.recovery_case_current; subject jsonb; facts jsonb; n numeric; den numeric; available boolean;
BEGIN
 SELECT lock_id INTO k FROM app.stored_receipt_case_binding WHERE tenant_id=t AND job_id=j AND case_id=c AND work_id=w AND line_id=l;
 IF k IS NULL OR NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j AND id=k)
 THEN RAISE EXCEPTION 'BILLABILITY_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO rc FROM app.recovery_case_current WHERE tenant_id=t AND job_id=j AND id=c AND synthetic;
 IF rc.id IS NULL THEN RAISE EXCEPTION 'BILLABILITY_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 d:=app.recovery_attribution_sources(t,j,jsonb_build_object('caseId',c,'workId',w,'lineId',l,'lockId',k),actor);
 -- The source watermark is stable; assessment IDs/timestamps are deliberately not facts.
 d:=jsonb_set(d,'{facts,revisionId}',to_jsonb((substr(d->>'sourceHash',1,8)||'-'||substr(d->>'sourceHash',9,4)||'-4'||substr(d->>'sourceHash',14,3)||'-8'||substr(d->>'sourceHash',18,3)||'-'||substr(d->>'sourceHash',21,12))::uuid));
 n:=(d->'remainingPrincipal'->>'numerator')::numeric; den:=(d->'remainingPrincipal'->>'denominator')::numeric;
 available:=n>0 AND (d->'facts'->'facts'->'customer_payment_settled_and_allocated_to_that_line'->>'holds')::boolean;
 subject:=jsonb_build_object('tenantId',t,'jobId',j,'workId',w,'lineId',l);
 facts:=subject||jsonb_build_object('version','shadow-eligibility.v1','policyVersion','reference_recovery_eligibility_policy_v3','environment','synthetic_reference',
  'caseId',c,'approvedCase',d->>'assessmentOutcome'='eligible_for_review','unresolvedDispute',rc.state='negotiating',
  'category','missed_variation_final_account','principalNet',d->'remainingPrincipal','attribution',d->'facts',
  'proof',subject||jsonb_build_object('version','shadow-settlement-proof.v1','status',CASE WHEN available THEN 'verified_settled' ELSE 'unverified' END,'sourceRef',l),
  'origin',subject||jsonb_build_object('version','shadow-eligibility-origin.v1','kind','shadow_confirmed_extra','sourceRef',l));
 RETURN jsonb_build_object('version','recovery-billability-snapshot.v1','environment','synthetic_demo',
  'binding',jsonb_build_object('tenantId',t,'jobId',j,'caseId',c,'caseRevision',rc.revision,'evidenceRevision',rc.revision,
   'evidenceHash',d->>'sourceHash','policyVersion','reference_recovery_eligibility_policy_v3','policyRevision',1),
  'caseType',rc.case_type,'claimedNetPence',rc.claim_pence,'availableAllocatedNetPence',floor(n/den),
  'allocationState',CASE WHEN available THEN 'available' ELSE 'outcome_unknown' END,
  'evidenceComplete',(d->'facts'->'facts'->'evidence_received_before_lock'->>'holds')::boolean,
  'causationCertain',d->>'assessmentOutcome'='eligible_for_review' AND rc.state<>'negotiating','amountCertain',d->>'assessmentOutcome'='eligible_for_review',
  'taxBasisCertain',d->>'assessmentOutcome'='eligible_for_review',
  'builderCaptured',NOT (d->'facts'->'facts'->'absent_from_builder_captures_at_lock'->>'holds')::boolean,
  'disclosedBeforeLock',NOT (d->'facts'->'facts'->'not_disclosed_before_lock'->>'holds')::boolean,
  'finalAccountLockId',k,'sources',(SELECT jsonb_agg(jsonb_build_object('sourceId',s->>'sourceId','sourceVersion',s->>'sourceVersion','sourceHash',s->>'sourceHash')) FROM jsonb_array_elements(d->'sourceManifest') s),
  'facts',facts);
END;
END
$$;

-- Latest body: packages/db/migrations/0565_recovery_billability_integration.sql
CREATE OR REPLACE FUNCTION app.recovery_billability(j uuid,digest text,p jsonb,document jsonb DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a record; authority jsonb;
 c uuid; w uuid; l uuid; prior app.recovery_billability_command; reviewed app.recovery_billability_command;
 s jsonb; cmd jsonb; expected jsonb; requester uuid; requester_person uuid; principal numeric;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR NOT pg_has_role(session_user,'jobguard_runtime','USAGE')
 THEN RAISE EXCEPTION 'BILLABILITY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'version' IS DISTINCT FROM 'recovery-billability-command.v1'
 OR p->>'action' NOT IN('review','approve') OR p->>'action' IS NULL
 OR p-ARRAY['version','action','commandId','caseId','workId','lineId','expectedCaseRevision','claimedEligiblePrincipalPence','reasons','reviewCommandId']<>'{}'::jsonb
 OR NOT(p ?& ARRAY['version','action','commandId','caseId','workId','lineId','expectedCaseRevision'])
 THEN RAISE EXCEPTION 'INVALID_BILLABILITY_INPUT' USING ERRCODE='23514'; END IF;
 IF p->>'action'='review' THEN
  SELECT * INTO a FROM app.authenticate_practice_session(digest,t);
 ELSE
  -- A session identifies a person, not a membership. Ambiguity fails closed.
  BEGIN
  SELECT m.tenant_id,m.id membership_id,m.identity_user_id INTO STRICT a FROM identity.session x JOIN app.membership m ON m.identity_user_id=x.user_id
  WHERE x.token_digest=digest AND x.environment='synthetic_demo' AND x.revoked_at IS NULL AND x.expires_at>clock_timestamp()
  AND m.tenant_id=t AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp());
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
   RAISE EXCEPTION 'BILLABILITY_FORBIDDEN' USING ERRCODE='42501';
  END;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'BILLABILITY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF a.membership_id IS DISTINCT FROM app.current_actor() OR a.tenant_id IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 -- No hidden source lookup until an authenticated owner has a locked practice job.
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=a.membership_id AND m.identity_user_id=a.identity_user_id AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()))
 OR NOT EXISTS(SELECT 1 FROM app.job x JOIN app.final_account_lock k ON(k.tenant_id,k.job_id)=(x.tenant_id,x.id)
 WHERE x.tenant_id=t AND x.id=j AND x.practice_session_digest IS NOT NULL)
 THEN RAISE EXCEPTION 'BILLABILITY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p->>'action'='review' THEN PERFORM app.final_check_builder(t,j,digest); END IF;
 c:=(p->>'caseId')::uuid; w:=(p->>'workId')::uuid; l:=(p->>'lineId')::uuid;
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(c::text));
 PERFORM pg_advisory_xact_lock(hashtextextended('stored-receipt-lines:'||t::text||':'||j::text,0));
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext('billability:'||(p->>'commandId')));
 IF p->>'action'='review' THEN
  PERFORM 1 FROM control_plane.practice_session WHERE token_digest=digest FOR SHARE;
 ELSE
  PERFORM 1 FROM identity.session WHERE token_digest=digest FOR SHARE;
 END IF;
 PERFORM 1 FROM app.membership WHERE tenant_id=t AND id=a.membership_id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=a.membership_id AND m.identity_user_id=a.identity_user_id AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()))
 OR (p->>'action'='review' AND NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(digest,t)))
 OR (p->>'action'='approve' AND (SELECT count(*) FROM app.membership m WHERE m.tenant_id=t AND m.identity_user_id=a.identity_user_id AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()))<>1)
 OR (p->>'action'='approve' AND NOT EXISTS(SELECT 1 FROM identity.session x WHERE x.token_digest=digest AND x.user_id=a.identity_user_id AND x.environment='synthetic_demo' AND x.revoked_at IS NULL AND x.expires_at>clock_timestamp()))
 THEN RAISE EXCEPTION 'BILLABILITY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM app.recovery_billability_command WHERE tenant_id=t AND command_id=(p->>'commandId')::uuid;
 IF FOUND THEN
  IF prior.job_id<>j OR prior.actor_membership_id<>a.membership_id OR prior.actor_identity_user_id<>a.identity_user_id OR prior.payload<>p
  THEN RAISE EXCEPTION 'BILLABILITY_REPLAY_CONFLICT' USING ERRCODE='23514'; END IF;
  RETURN jsonb_build_object('replay',prior.result);
 END IF;
 s:=app.billability_snapshot(t,j,c,w,l,a.membership_id);
 IF (p->>'expectedCaseRevision')::integer IS DISTINCT FROM (s->'binding'->>'caseRevision')::integer
 THEN RAISE EXCEPTION 'BILLABILITY_STALE' USING ERRCODE='40001'; END IF;
 authority:=jsonb_build_object('environment','synthetic_demo','tenantId',t,'jobId',j,'membershipId',a.membership_id,'identityUserId',a.identity_user_id,'permission','review_recovery_eligibility');
 IF p->>'action'='review' THEN
  IF p ? 'reviewCommandId' OR NOT(p ?& ARRAY['claimedEligiblePrincipalPence','reasons'])
  OR jsonb_typeof(p->'reasons') IS DISTINCT FROM 'string' OR length(trim(p->>'reasons')) NOT BETWEEN 1 AND 2000
  OR coalesce(p->>'claimedEligiblePrincipalPence','') !~ '^(0|[1-9][0-9]*)$'
  THEN RAISE EXCEPTION 'INVALID_BILLABILITY_INPUT' USING ERRCODE='23514'; END IF;
  IF (p->>'claimedEligiblePrincipalPence')::numeric>1000000000000 THEN RAISE EXCEPTION 'INVALID_BILLABILITY_INPUT' USING ERRCODE='23514'; END IF;
  requester:=a.membership_id; requester_person:=a.identity_user_id;
  cmd:=jsonb_build_object('version','recovery-billability-review-command.v1','commandId',p->'commandId','expected',s->'binding','claimedEligiblePrincipalPence',p->'claimedEligiblePrincipalPence','reasons',trim(p->>'reasons'));
 ELSE
  IF p ?| ARRAY['claimedEligiblePrincipalPence','reasons'] OR NOT(p ? 'reviewCommandId')
  THEN RAISE EXCEPTION 'INVALID_BILLABILITY_INPUT' USING ERRCODE='23514'; END IF;
  SELECT * INTO reviewed FROM app.recovery_billability_command WHERE tenant_id=t AND job_id=j AND case_id=c AND command_id=(p->>'reviewCommandId')::uuid AND action='review';
  IF NOT FOUND OR reviewed.payload->>'workId' IS DISTINCT FROM w::text OR reviewed.payload->>'lineId' IS DISTINCT FROM l::text
  THEN RAISE EXCEPTION 'BILLABILITY_STALE' USING ERRCODE='23514'; END IF;
  requester:=reviewed.requester_membership_id; requester_person:=reviewed.requester_identity_user_id;
  IF requester=a.membership_id OR requester_person=a.identity_user_id THEN RAISE EXCEPTION 'BILLABILITY_FORBIDDEN' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=requester AND m.identity_user_id=requester_person AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()))
  THEN RAISE EXCEPTION 'BILLABILITY_STALE' USING ERRCODE='40001'; END IF;
  IF reviewed.result->'snapshot'<>s THEN RAISE EXCEPTION 'BILLABILITY_STALE' USING ERRCODE='40001'; END IF;
  principal:=(reviewed.result->'command'->>'claimedEligiblePrincipalPence')::numeric;
  IF reviewed.result->'assessment'->>'classification' IS DISTINCT FROM 'eligible_for_review'
  OR NOT (s->'causationCertain')::boolean OR (s->'builderCaptured')::boolean OR (s->'disclosedBeforeLock')::boolean
  OR s->>'allocationState'<>'available' OR principal<=0 OR principal>(s->>'claimedNetPence')::numeric
  OR principal>(s->>'availableAllocatedNetPence')::numeric
  THEN RAISE EXCEPTION 'BILLABILITY_NOT_APPROVABLE' USING ERRCODE='23514'; END IF;
  cmd:=jsonb_build_object('version','recovery-billability-approval-command.v1','commandId',p->'commandId','reviewCommandId',p->'reviewCommandId','expected',s->'binding');
 END IF;
 IF document IS NULL THEN RETURN jsonb_build_object('snapshot',s,'authority',authority,'command',cmd,'review',reviewed.result); END IF;
 IF p->>'action'='review' THEN
  expected:=jsonb_build_object('version','recovery-billability-review.v1','command',cmd,'snapshot',s,'reviewer',authority,'assessment',document->'assessment','productionEnabled',false);
  IF document->'assessment'->>'version' IS DISTINCT FROM 'recovery-billability-policy-result.v1'
  OR document->'assessment'->>'policyVersion' IS DISTINCT FROM 'reference_recovery_eligibility_policy_v3'
  OR document->'assessment'->'productionEnabled' IS DISTINCT FROM 'false'::jsonb
  OR document->'assessment'->>'classification' IS DISTINCT FROM (CASE WHEN (s->'causationCertain')::boolean
   AND (s->'facts'->'principalNet'->>'numerator')::numeric <= (s->>'availableAllocatedNetPence')::numeric * (s->'facts'->'principalNet'->>'denominator')::numeric
   THEN 'eligible_for_review' ELSE 'non_billable' END)
  THEN RAISE EXCEPTION 'BILLABILITY_NOT_APPROVABLE' USING ERRCODE='23514'; END IF;
 ELSE
  expected:=jsonb_build_object('version','recovery-billability-approval.v1','command',cmd,'review',reviewed.result,'approvedBy',authority,'productionEnabled',false);
 END IF;
 IF document IS DISTINCT FROM expected THEN RAISE EXCEPTION 'INVALID_BILLABILITY_INPUT' USING ERRCODE='23514'; END IF;
 INSERT INTO app.recovery_billability_command(tenant_id,command_id,job_id,case_id,actor_membership_id,requester_membership_id,actor_identity_user_id,requester_identity_user_id,action,review_command_id,payload,result)
 VALUES(t,(p->>'commandId')::uuid,j,c,a.membership_id,requester,a.identity_user_id,requester_person,p->>'action',(p->>'reviewCommandId')::uuid,p,document);
 -- References only. Reasons and hidden attribution facts never enter audit.
 PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||a.membership_id::text,j,'recovery.billability.'||(p->>'action'),
 jsonb_build_object('commandId',p->>'commandId','caseId',c,'sourceHash',s->'binding'->>'evidenceHash'));
 RETURN jsonb_build_object('replay',document);
END;
END
$$;

-- Latest body: packages/db/migrations/0571_money_trail_reconciliation.sql
CREATE OR REPLACE FUNCTION app.read_money_trail_availability(p_job uuid,p_session text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
BEGIN
 -- Reuse the accepted current-session/owner/owned synthetic small-builder v3
 -- read boundary. This permits dependency metadata only, never a run action.
 PERFORM app.read_success_fee_v3(p_job,p_session);
 RETURN jsonb_build_object('version','money-trail-availability.v1','jobId',p_job,
  'environment','synthetic_demo','state','dependency_bound',
  'dependency','accepted_money_trail_source_and_run_authority',
  'productionEnabled',false,'realExternalActions',0);
END;
END
$$;

-- Latest body: packages/db/migrations/0572_financial_reconciliation_queue.sql
CREATE OR REPLACE FUNCTION app.financial_reconciliation_queue(p_session uuid,p_job uuid,p_command jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid; a uuid; u uuid; k text; cid uuid; r app.financial_reconciliation_run;
 proposal app.financial_reconciliation_adjustment; item jsonb; next_revision integer; prior app.financial_reconciliation_command; result_id uuid;
 stored_invoices jsonb; providers jsonb; valid_provider jsonb; refs jsonb;
 issues jsonb:='[]'::jsonb; queue jsonb:='[]'::jsonb; balances jsonb; blocked text[]:=ARRAY[]::text[];
 sibling_count integer; depth integer; used_amount numeric; paid numeric; refunded numeric; fees numeric; payout numeric; bank numeric;
 clearing numeric; transit numeric; net numeric; tax numeric; gross numeric; balance_key text; balance_value jsonb;
BEGIN
 IF p_command->>'version' IS DISTINCT FROM 'financial-reconciliation-storage.v1' THEN
  RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023';
 END IF;
 -- Reuse the existing live session, membership and unrevoked tenant finance
 -- grant contract. Same tenant alone, a supplied actor or a practice flag is not authority.
 a:=app.ef_actor(p_session); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 SELECT identity_user_id INTO u FROM app.membership WHERE tenant_id=t AND id=a;
 k:=p_command->>'action';
 IF (p_command - (CASE k WHEN 'run' THEN ARRAY['version','action','commandId','trigger','day','snapshot','report']
  WHEN 'read' THEN ARRAY['version','action','runId'] WHEN 'propose' THEN ARRAY['version','action','commandId','runId','adjustment','contentHash']
  ELSE ARRAY['version','action','commandId','adjustmentId','contentHash'] END))<>'{}'::jsonb THEN
  RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023';
 END IF;
 IF k='read' THEN
  SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job AND id=(p_command->>'runId')::uuid;
  IF r.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id',r.id,'snapshot',r.snapshot,'report',r.report);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=p_job AND environment='synthetic_demo') THEN
  IF k='read' THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF k IS NULL OR k NOT IN('run','propose','approve') OR pg_input_is_valid(p_command->>'commandId','uuid') IS NOT TRUE THEN
  RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023';
 END IF;
 cid:=(p_command->>'commandId')::uuid;
 -- One scheduling/adjustment owner. Audit head is always acquired last.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,479));
 -- Recheck after the lock wait, including revoked/expired finance sessions.
 a:=app.ef_actor(p_session);
 SELECT * INTO prior FROM app.financial_reconciliation_command WHERE tenant_id=t AND id=cid;
 IF prior.id IS NOT NULL THEN
  IF prior.job_id<>p_job OR prior.request<>p_command OR prior.actor_identity_id<>u THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF k='run' THEN
   SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job AND id=prior.result_id;
   RETURN jsonb_build_object('id',r.id,'snapshot',r.snapshot,'report',r.report);
  END IF;
  RETURN jsonb_build_object('id',prior.result_id);
 END IF;
 result_id:=cid;
 IF k='run' THEN
  IF p_command->'snapshot'->>'tenantId' IS DISTINCT FROM t::text OR p_command->'snapshot'->>'jobId' IS DISTINCT FROM p_job::text THEN
   RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_command->'report'->>'sourceHash' IS DISTINCT FROM encode(sha256(convert_to('financial-reconciliation.v1'||chr(10)||app.final_lock_canonical(p_command->'snapshot'),'UTF8')),'hex') THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements((p_command->'snapshot'->'invoices')||(p_command->'snapshot'->'provider')||(p_command->'snapshot'->'journals')||(p_command->'snapshot'->'corrections')) LOOP
   IF item->>'tenantId' IS DISTINCT FROM t::text OR item->>'jobId' IS DISTINCT FROM p_job::text THEN
    RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN' USING ERRCODE='42501';
   END IF;
  END LOOP;
  -- Rebuild the complete invoice set in one statement snapshot. Caller hashes
  -- prove encoding only; neither missing invoices nor substituted revisions pass.
  SELECT coalesce(jsonb_agg(jsonb_build_object('tenantId',tenant_id,'jobId',job_id,'id',id,
   'revision',final_account_revision_id,'net',net_pence,'vat',tax_pence,'gross',total_pence)
   ORDER BY id),'[]'::jsonb) INTO stored_invoices
  FROM app.customer_invoice WHERE tenant_id=t AND job_id=p_job AND synthetic;
  IF p_command->'snapshot' IS NULL OR ((p_command->'snapshot') - ARRAY['version','environment','tenantId','jobId','invoices','provider','journals','corrections'])<>'{}'::jsonb
   OR p_command->'snapshot'->>'version' IS DISTINCT FROM 'financial-reconciliation-snapshot.v1'
   OR p_command->'snapshot'->>'environment' IS DISTINCT FROM 'synthetic_demo'
   OR p_command->'snapshot'->'invoices' IS DISTINCT FROM stored_invoices
   OR jsonb_array_length(stored_invoices)>10000
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(stored_invoices) x
    WHERE (x->>'net')::numeric NOT BETWEEN 0 AND 1000000000000
     OR (x->>'vat')::numeric NOT BETWEEN 0 AND 1000000000000
     OR (x->>'gross')::numeric NOT BETWEEN 1 AND 1000000000000)
   OR jsonb_typeof(p_command->'snapshot'->'provider') IS DISTINCT FROM 'array'
   OR jsonb_array_length(p_command->'snapshot'->'provider')>10000
   -- No accepted adapter maps app.journal's platform-book postings to these
   -- invoice-scoped reference kinds. Review proposals are not posted facts.
   -- Refuse rather than legitimise invented journals or duplicate corrections.
   OR p_command->'snapshot'->'journals' IS DISTINCT FROM '[]'::jsonb
   OR p_command->'snapshot'->'corrections' IS DISTINCT FROM '[]'::jsonb THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  providers:=p_command->'snapshot'->'provider';
  IF providers IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'id') COLLATE "C"),'[]'::jsonb) FROM jsonb_array_elements(providers) x) THEN
   RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023';
  END IF;
  -- Provider observations remain explicitly fictional, not authenticated cash.
  FOR item IN SELECT value FROM jsonb_array_elements(providers) LOOP
   IF (item - ARRAY['tenantId','jobId','id','effectId','invoiceId','kind','amount','parentId','late'])<>'{}'::jsonb
    OR NOT (item ?& ARRAY['tenantId','jobId','id','effectId','invoiceId','kind','amount','parentId','late'])
    OR pg_input_is_valid(item->>'id','uuid') IS NOT TRUE
    OR pg_input_is_valid(item->>'effectId','uuid') IS NOT TRUE
    OR pg_input_is_valid(item->>'invoiceId','uuid') IS NOT TRUE
    OR item->>'kind' IS NULL OR item->>'kind' NOT IN('payment','refund','fee','payout','bank')
    OR jsonb_typeof(item->'amount') IS DISTINCT FROM 'number'
    OR (item->>'amount')::numeric NOT BETWEEN 1 AND 1000000000000
    OR trunc((item->>'amount')::numeric)<>(item->>'amount')::numeric
    OR jsonb_typeof(item->'late') IS DISTINCT FROM 'boolean'
    OR (item->>'kind'='payment') IS DISTINCT FROM (item->'parentId'='null'::jsonb)
    OR (item->>'kind'<>'payment' AND pg_input_is_valid(item->>'parentId','uuid') IS NOT TRUE)
    OR (SELECT count(*) FROM jsonb_array_elements(providers) x WHERE x->>'id'=item->>'id')<>1 THEN
    RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023';
   END IF;
  END LOOP;
  -- Independent SQL comparison of the supported source set. Raw issues hold
  -- integer pence; canonical queue encoding is applied once at the end.
  FOR item IN SELECT value FROM jsonb_array_elements(providers) LOOP
   SELECT count(*),jsonb_agg(x->>'id' ORDER BY x->>'id') INTO sibling_count,refs
    FROM jsonb_array_elements(providers) x WHERE x->>'effectId'=item->>'effectId';
   IF sibling_count>1 THEN
    blocked:=array_append(blocked,item->>'id');
    IF item->>'id'=refs->>0 THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','DUPLICATE_PROVIDER_EFFECT','refs',refs)); END IF;
   END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(stored_invoices) x WHERE x->>'id'=item->>'invoiceId') THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','ORPHAN_PROVIDER_PAYMENT','refs',jsonb_build_array(item->>'id')));
    blocked:=array_append(blocked,item->>'id');
   END IF;
   IF (item->>'late')::boolean THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','LATE_PROVIDER_EVENT','refs',jsonb_build_array(item->>'id')));
   END IF;
   IF item->>'kind'<>'payment' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(providers) x
    WHERE x->>'id'=item->>'parentId' AND x->>'invoiceId'=item->>'invoiceId'
     AND x->>'kind'=CASE WHEN item->>'kind'='bank' THEN 'payout' ELSE 'payment' END) THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','MISSING_OR_WRONG_PREDECESSOR','refs',jsonb_build_array(item->>'id',item->>'parentId')));
    blocked:=array_append(blocked,item->>'id');
   END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(providers) WHERE value->>'kind' IN('payment','payout') LOOP
   SELECT coalesce(sum((x->>'amount')::numeric),0),coalesce(jsonb_agg(x->>'id'),'[]'::jsonb) INTO used_amount,refs
    FROM jsonb_array_elements(providers) x WHERE x->>'parentId'=item->>'id' AND NOT (x->>'id'=ANY(blocked))
     AND ((item->>'kind'='payout' AND x->>'kind'='bank') OR (item->>'kind'='payment' AND x->>'kind' IN('refund','fee','payout')));
   IF used_amount>(item->>'amount')::numeric THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','SOURCE_AMOUNT_EXCEEDED','refs',refs||jsonb_build_array(item->>'id'),'expected',(item->>'amount')::numeric,'observed',used_amount));
    SELECT blocked||coalesce(array_agg(x #>> '{}'),ARRAY[]::text[]) INTO blocked FROM jsonb_array_elements(refs) x;
   END IF;
  END LOOP;
  FOR depth IN 1..2 LOOP
   FOR item IN SELECT value FROM jsonb_array_elements(providers) LOOP
    IF item->>'parentId'=ANY(blocked) AND NOT(item->>'id'=ANY(blocked)) THEN
     blocked:=array_append(blocked,item->>'id');
     issues:=issues||jsonb_build_array(jsonb_build_object('code','BLOCKED_PREDECESSOR','refs',jsonb_build_array(item->>'id',item->>'parentId')));
    END IF;
   END LOOP;
  END LOOP;
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO valid_provider FROM jsonb_array_elements(providers) x WHERE NOT(x->>'id'=ANY(blocked));
  FOR item IN SELECT value FROM jsonb_array_elements(valid_provider) WHERE value->>'kind'<>'bank' LOOP
   issues:=issues||jsonb_build_array(jsonb_build_object('code','MISSING_OR_DUPLICATE_JOURNAL','refs',jsonb_build_array(item->>'id'),'expected',(item->>'amount')::numeric,'observed',0));
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(stored_invoices) LOOP
   SELECT coalesce(sum(CASE x->>'kind' WHEN 'payment' THEN (x->>'amount')::numeric WHEN 'refund' THEN -(x->>'amount')::numeric ELSE 0 END),0)
    INTO used_amount FROM jsonb_array_elements(valid_provider) x WHERE x->>'invoiceId'=item->>'id';
   IF used_amount>(item->>'gross')::numeric THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','INVOICE_OVERPAYMENT','refs',jsonb_build_array(item->>'id'),'expected',(item->>'gross')::numeric,'observed',used_amount));
   END IF;
  END LOOP;
  SELECT coalesce(sum((x->>'amount')::numeric) FILTER(WHERE x->>'kind'='payment'),0),
   coalesce(sum((x->>'amount')::numeric) FILTER(WHERE x->>'kind'='refund'),0),
   coalesce(sum((x->>'amount')::numeric) FILTER(WHERE x->>'kind'='fee'),0),
   coalesce(sum((x->>'amount')::numeric) FILTER(WHERE x->>'kind'='payout'),0),
   coalesce(sum((x->>'amount')::numeric) FILTER(WHERE x->>'kind'='bank'),0)
   INTO paid,refunded,fees,payout,bank FROM jsonb_array_elements(valid_provider) x;
  clearing:=paid-refunded-fees-payout; transit:=payout-bank;
  IF clearing<>0 THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','OUTSTANDING_CLEARING','refs','[]'::jsonb,'expected',0,'observed',clearing)); END IF;
  IF transit<>0 THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','PAYOUT_AWAITING_BANK','refs','[]'::jsonb,'expected',payout,'observed',bank)); END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(issues) LOOP
   IF abs(coalesce((item->>'expected')::numeric,0))>1000000000000 OR abs(coalesce((item->>'observed')::numeric,0))>1000000000000 THEN
    RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023';
   END IF;
   SELECT coalesce(jsonb_agg(v ORDER BY v COLLATE "C"),'[]'::jsonb) INTO refs FROM (SELECT DISTINCT x #>> '{}' v FROM jsonb_array_elements(item->'refs') x) rfs;
   item:=jsonb_build_object('code',item->>'code','refs',refs,
    'expected',CASE WHEN item ? 'expected' THEN jsonb_build_object('pence',item->'expected','currency','GBP') ELSE 'null'::jsonb END,
    'observed',CASE WHEN item ? 'observed' THEN jsonb_build_object('pence',item->'observed','currency','GBP') ELSE 'null'::jsonb END);
   queue:=queue||jsonb_build_array(item||jsonb_build_object('differenceId',encode(sha256(convert_to('financial-reconciliation.v1'||chr(10)||app.final_lock_canonical(item),'UTF8')),'hex')));
  END LOOP;
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'differenceId') COLLATE "C"),'[]'::jsonb) INTO queue FROM jsonb_array_elements(queue) x;
  SELECT coalesce(sum((x->>'net')::numeric),0),coalesce(sum((x->>'vat')::numeric),0),coalesce(sum((x->>'gross')::numeric),0)
   INTO net,tax,gross FROM jsonb_array_elements(stored_invoices) x;
  balances:=jsonb_build_object('invoicedGross',gross,'invoiceOutstanding',gross-paid+refunded,
   'journalPayments',0,'journalRefunds',0,'journalFees',0,'journalPayouts',0,'invoicedNet',net,'vat',tax,
   'grossCharged',paid,'refunds',refunded,'providerFees',fees,'netPayout',payout,'bankObserved',bank,
   'outstandingClearing',clearing,'payoutInTransit',transit,'allocated',0,'reserved',0);
  FOR balance_key,balance_value IN SELECT key,value FROM jsonb_each(balances) LOOP
   IF abs((balance_value #>> '{}')::numeric)>1000000000000 THEN RAISE EXCEPTION 'INVALID_RECONCILIATION' USING ERRCODE='22023'; END IF;
   balances:=jsonb_set(balances,ARRAY[balance_key],jsonb_build_object('pence',balance_value,'currency','GBP'));
  END LOOP;
  IF p_command->'report' IS DISTINCT FROM jsonb_build_object('version','financial-reconciliation-report.v1',
   'sourceHash',encode(sha256(convert_to('financial-reconciliation.v1'||chr(10)||app.final_lock_canonical(p_command->'snapshot'),'UTF8')),'hex'),
   'productionEnabled',false,'referenceOnly',true,'authoritativeSourceVerification',false,'realExternalActions',0,'balances',balances,'queue',queue) THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND id=cid;
  IF r.id IS NULL AND p_command->>'trigger'='daily' THEN
   SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job AND trigger='daily' AND day=(p_command->>'day')::date;
  END IF;
  IF r.id IS NOT NULL THEN
   INSERT INTO app.financial_reconciliation_command(tenant_id,job_id,id,result_id,actor_identity_id,request) VALUES(t,p_job,cid,r.id,u,p_command);
   RETURN jsonb_build_object('id',r.id,'snapshot',r.snapshot,'report',r.report);
  END IF;
  SELECT coalesce(max(revision),0)+1 INTO next_revision FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job;
  INSERT INTO app.financial_reconciliation_run(tenant_id,job_id,id,revision,actor_membership_id,actor_identity_id,request,snapshot,report,trigger,day)
   VALUES(t,p_job,cid,next_revision,a,u,p_command,p_command->'snapshot',p_command->'report',p_command->>'trigger',(p_command->>'day')::date) RETURNING * INTO r;
  FOR item IN SELECT value FROM jsonb_array_elements(r.report->'queue') LOOP
   INSERT INTO app.financial_reconciliation_difference(tenant_id,job_id,run_id,difference_id,detail) VALUES(t,p_job,cid,item->>'differenceId',item);
  END LOOP;
 ELSIF k='propose' THEN
  SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job ORDER BY revision DESC LIMIT 1;
  IF r.id IS DISTINCT FROM (p_command->>'runId')::uuid OR r.report->>'sourceHash' IS DISTINCT FROM p_command->'adjustment'->>'reportHash'
   OR p_command->'adjustment'->>'tenantId' IS DISTINCT FROM t::text OR p_command->'adjustment'->>'jobId' IS DISTINCT FROM p_job::text
   OR p_command->'adjustment'->>'commandId' IS DISTINCT FROM cid::text THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF p_command->>'contentHash' IS DISTINCT FROM encode(sha256(convert_to('financial-reconciliation.v1'||chr(10)||app.final_lock_canonical(p_command->'adjustment'),'UTF8')),'hex')
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.snapshot->'invoices') i
    WHERE i->>'id'=coalesce(p_command->'adjustment'->'fact'->>'invoiceId',p_command->'adjustment'->'correction'->>'invoiceId')
     AND i->>'revision'=p_command->'adjustment'->>'invoiceRevision') THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  item:=coalesce(p_command->'adjustment'->'fact',p_command->'adjustment'->'correction');
  IF (p_command->'adjustment' ? 'fact')=(p_command->'adjustment' ? 'correction')
   OR item->>'tenantId' IS DISTINCT FROM t::text OR item->>'jobId' IS DISTINCT FROM p_job::text THEN
   RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  INSERT INTO app.financial_reconciliation_adjustment(tenant_id,job_id,id,run_id,actor_membership_id,actor_identity_id,request,content_hash)
   VALUES(t,p_job,cid,r.id,a,u,p_command,p_command->>'contentHash');
 ELSE
  SELECT * INTO proposal FROM app.financial_reconciliation_adjustment WHERE tenant_id=t AND job_id=p_job AND id=(p_command->>'adjustmentId')::uuid;
  IF proposal.id IS NULL THEN RAISE EXCEPTION 'RECONCILIATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF proposal.actor_identity_id=u THEN RAISE EXCEPTION 'RECONCILIATION_SELF_APPROVAL' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job ORDER BY revision DESC LIMIT 1;
  IF r.id<>proposal.run_id OR proposal.content_hash IS DISTINCT FROM p_command->>'contentHash' THEN
   RAISE EXCEPTION 'RECONCILIATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  INSERT INTO app.financial_reconciliation_approval(tenant_id,job_id,id,adjustment_id,actor_membership_id,actor_identity_id,request)
   VALUES(t,p_job,cid,proposal.id,a,u,p_command);
 END IF;
 INSERT INTO app.financial_reconciliation_command(tenant_id,job_id,id,result_id,actor_identity_id,request) VALUES(t,p_job,cid,result_id,u,p_command);
 PERFORM app.ef_audit(a,'financial_reconciliation.'||k,'job',p_job,
  jsonb_build_object('references',jsonb_build_object('commandId',cid::text,'environment','synthetic_demo')));
 IF k='run' THEN RETURN jsonb_build_object('id',r.id,'snapshot',r.snapshot,'report',r.report); END IF;
 RETURN jsonb_build_object('id',cid);
END;
END
$$;

-- Latest SQL reader: packages/db/migrations/0574_site_extra_work_status.sql
CREATE OR REPLACE FUNCTION app.ent3_extra_work_status(p_job uuid,p_extra uuid) RETURNS text
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 RETURN (SELECT x.work_status FROM app.site_extra_work_status x
 WHERE current_database()='jobguard_synthetic_demo'
  AND x.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND x.job_id=p_job AND x.variation_id=p_extra);
END $$;
-- Latest body: packages/db/migrations/0016_final_accounts.sql
CREATE OR REPLACE FUNCTION app.advance_final_account_draft(p_tenant uuid,p_draft uuid,p_revision uuid,p_number integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
BEGIN IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';END IF;UPDATE app.final_account_draft SET current_revision_id=p_revision,revision=p_number,updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_draft;END;
END
$$;

-- Latest body: packages/db/migrations/0016_final_accounts.sql
CREATE OR REPLACE FUNCTION app.invalidate_stale_final_account_authorizations(p_tenant uuid,p_job uuid,p_current_hash char(64)) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE n integer;BEGIN IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';END IF;UPDATE app.action_authorization a SET revoked_at=transaction_timestamp() FROM app.decision d WHERE (d.tenant_id,d.id)=(a.tenant_id,a.decision_id) AND a.tenant_id=p_tenant AND d.subject_type='job' AND d.subject_ref=p_job::text AND a.action_type IN('final_account.issue','final_account.send') AND a.content_hash<>p_current_hash AND a.revoked_at IS NULL;GET DIAGNOSTICS n=ROW_COUNT;RETURN n;END;
END
$$;

-- Latest body: packages/db/migrations/0631_legacy_recovery_money_integrity.sql
CREATE OR REPLACE FUNCTION app.approve_synthetic_landing(p jsonb)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;c app.recovery_case_current;r app.synthetic_recovery_receipt;e app.evidence_object;a app.recovery_approval;l uuid:=(p->>'allocationId')::uuid;d uuid:=(p->>'derivationId')::uuid;j uuid:=(p->>'journalId')::uuid;gross bigint:=(p->>'grossPence')::bigint;eligible bigint:=(p->>'eligibleNetPence')::bigint;landed bigint;reversed bigint;cap bigint;fee bigint;credit bigint;liability bigint;prior bigint;delta bigint;
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL OR p->>'version'<>'recovery.landing.approve.v1' OR p->>'policyVersion'<>'reference_fee_policy_v1' THEN RAISE EXCEPTION 'synthetic reference command required' USING ERRCODE='42501';END IF;
 -- Lock order (shared with the workbench, which holds only the case advisory key and
 -- cannot lock job rows as a non-owner): case advisory key, then job row, then case row.
 -- Taking the advisory key first means a workbench write to this case (which holds the
 -- key before its foreign-key share locks on job/case rows) can never wait on this
 -- routine while this routine waits on it. Read the projection only after the locks.
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(((p->>'caseId')::uuid)::text));
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=(p->>'jobId')::uuid FOR UPDATE;
 PERFORM 1 FROM app.recovery_case WHERE tenant_id=t AND job_id=(p->>'jobId')::uuid AND id=(p->>'caseId')::uuid FOR UPDATE;
 SELECT * INTO c FROM app.recovery_case_current WHERE tenant_id=t AND job_id=(p->>'jobId')::uuid AND id=(p->>'caseId')::uuid;
 SELECT * INTO r FROM app.synthetic_recovery_receipt WHERE tenant_id=t AND job_id=(p->>'jobId')::uuid AND id=(p->>'receiptId')::uuid FOR UPDATE;
 SELECT * INTO e FROM app.evidence_object WHERE tenant_id=t AND job_id=(p->>'jobId')::uuid AND id=(p->>'evidenceId')::uuid AND kind='original';
 IF c.id IS NULL OR NOT c.synthetic OR c.state='prevented' OR c.revision<>(p->>'expectedCaseRevision')::integer THEN RAISE EXCEPTION 'eligible current synthetic case required' USING ERRCODE='42501';END IF;
 IF r.id IS NULL OR NOT r.synthetic OR r.status<>'settled' THEN RAISE EXCEPTION 'settled synthetic receipt required' USING ERRCODE='42501';END IF;
 IF e.id IS NULL OR EXISTS(SELECT 1 FROM app.evidence_invalidation x WHERE x.tenant_id=t AND x.evidence_id=e.id) THEN RAISE EXCEPTION 'verified current evidence required' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM app.recovery_approval WHERE tenant_id=t AND id=(p->>'eligibilityApprovalId')::uuid AND job_id=c.job_id AND case_id=c.id AND kind='eligibility';
 IF a.id IS NULL OR a.status<>'approved' OR a.policy_version<>'reference_fee_policy_v1' OR a.expected_case_revision<>c.revision OR a.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'current eligibility approval required' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM app.recovery_approval WHERE tenant_id=t AND id=(p->>'landingApprovalId')::uuid AND job_id=c.job_id AND case_id=c.id AND kind='landing';
 IF a.id IS NULL OR a.status<>'approved' OR a.expected_case_revision<>c.revision OR a.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'current landing approval required' USING ERRCODE='42501';END IF;
 IF gross<=0 OR eligible<=0 OR eligible>gross OR (SELECT COALESCE(sum(gross_pence),0) FROM app.landing_allocation WHERE tenant_id=t AND receipt_id=r.id)+gross>r.gross_pence OR c.approved_landed+eligible>c.claim_pence-c.written_off THEN RAISE EXCEPTION 'allocation exceeds available receipt or claim' USING ERRCODE='23514';END IF;
 INSERT INTO app.landing_allocation VALUES(l,t,c.job_id,c.id,r.id,e.id,(p->>'eligibilityApprovalId')::uuid,(p->>'landingApprovalId')::uuid,gross,eligible,'GBP','reference_fee_policy_v1',DEFAULT);
 SELECT COALESCE(sum(x.eligible_net_pence),0),COALESCE((SELECT sum(y.eligible_net_pence)FROM app.landing_reversal y WHERE y.tenant_id=t AND y.job_id=c.job_id),0)INTO landed,reversed FROM app.landing_allocation x WHERE x.tenant_id=t AND x.job_id=c.job_id;
 landed:=landed-reversed;SELECT recovery_cap_pence INTO cap FROM app.cap_snapshot WHERE tenant_id=t AND job_id=c.job_id AND fee_policy_version='reference_fee_policy_v1';
 IF cap IS NULL OR (SELECT mode FROM app.job_activation WHERE tenant_id=t AND job_id=c.job_id)<>'synthetic_demo' THEN RAISE EXCEPTION 'production and pilot fee posting disabled' USING ERRCODE='0A000';END IF;
 fee:=least(app.half_even_ratio(landed,1,10),cap);credit:=least(CASE WHEN EXISTS(SELECT 1 FROM app.simulated_settlement_event s JOIN app.synthetic_obligation o ON(o.tenant_id,o.id)=(s.tenant_id,s.obligation_id)WHERE s.tenant_id=t AND o.job_id=c.job_id)THEN 7900 ELSE 0 END,fee);liability:=fee-credit;
 SELECT COALESCE(sum(CASE kind WHEN'fee_obligation'THEN amount_pence ELSE -amount_pence END),0)INTO prior FROM app.recovery_fee_journal WHERE tenant_id=t AND job_id=c.job_id;delta:=liability-prior;
 INSERT INTO app.recovery_fee_derivation VALUES(d,t,c.job_id,l,NULL,'reference_fee_policy_v1',landed,cap,fee,credit,liability,delta,DEFAULT);
 IF delta>0 THEN INSERT INTO app.recovery_fee_journal VALUES(j,t,c.job_id,d,'fee_obligation',delta,'GBP','recovery_fee_receivable','recovery_fee_deferred',NULL,DEFAULT);END IF;
 RETURN d;
END;
END
$$;

-- Latest body: packages/db/migrations/0682_synthetic_reversal_replay_match.sql
CREATE OR REPLACE FUNCTION app.reverse_synthetic_landing(p_tenant uuid,p_reversal uuid,p_derivation uuid,p_journal uuid,p_allocation uuid,p_amount bigint,p_reason varchar)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;x app.landing_allocation;existing app.landing_reversal;replay uuid;landed bigint;cap bigint;fee bigint;credit bigint;liability bigint;prior bigint;delta bigint;original uuid;
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF; IF t IS DISTINCT FROM p_tenant THEN RAISE EXCEPTION 'tenant mismatch' USING ERRCODE='42501';END IF;
 -- Serialize reuse of the tenant/reversal identity, including different jobs.
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext('synthetic_reversal:'||p_reversal::text));
 SELECT * INTO existing FROM app.landing_reversal WHERE tenant_id=t AND id=p_reversal;
 IF existing.id IS NOT NULL THEN
  IF existing.allocation_id IS DISTINCT FROM p_allocation OR existing.eligible_net_pence IS DISTINCT FROM p_amount OR existing.reason IS DISTINCT FROM p_reason THEN
   RAISE EXCEPTION 'invalid reversal' USING ERRCODE='23514';
  END IF;
  SELECT id INTO replay FROM app.recovery_fee_derivation WHERE tenant_id=t AND source_reversal_id=p_reversal;
  IF replay IS NULL OR replay IS DISTINCT FROM p_derivation OR EXISTS(
   SELECT 1 FROM app.recovery_fee_journal WHERE tenant_id=t AND derivation_id=replay AND kind='compensation' AND id IS DISTINCT FROM p_journal
  ) THEN RAISE EXCEPTION 'invalid reversal' USING ERRCODE='23514';END IF;
  RETURN replay;
 END IF;
 SELECT*INTO x FROM app.landing_allocation WHERE tenant_id=t AND id=p_allocation FOR UPDATE;PERFORM 1 FROM app.job WHERE tenant_id=t AND id=x.job_id FOR UPDATE;
 IF x.id IS NULL OR p_amount<=0 OR p_amount>x.eligible_net_pence OR EXISTS(SELECT 1 FROM app.landing_reversal WHERE tenant_id=t AND allocation_id=x.id)THEN RAISE EXCEPTION 'invalid reversal' USING ERRCODE='23514';END IF;
 INSERT INTO app.landing_reversal VALUES(p_reversal,t,x.job_id,x.id,p_amount,p_reason,DEFAULT);SELECT COALESCE(sum(a.eligible_net_pence),0)-COALESCE((SELECT sum(r.eligible_net_pence) FROM app.landing_reversal r WHERE r.tenant_id=t AND r.job_id=x.job_id),0) INTO landed FROM app.landing_allocation a WHERE a.tenant_id=t AND a.job_id=x.job_id;SELECT recovery_cap_pence INTO cap FROM app.cap_snapshot WHERE tenant_id=t AND job_id=x.job_id AND fee_policy_version='reference_fee_policy_v1';fee:=least(app.half_even_ratio(landed,1,10),cap);credit:=least(CASE WHEN EXISTS(SELECT 1 FROM app.simulated_settlement_event s JOIN app.synthetic_obligation o ON(o.tenant_id,o.id)=(s.tenant_id,s.obligation_id)WHERE s.tenant_id=t AND o.job_id=x.job_id)THEN 7900 ELSE 0 END,fee);liability:=fee-credit;SELECT COALESCE(sum(CASE kind WHEN'fee_obligation'THEN amount_pence ELSE -amount_pence END),0)INTO prior FROM app.recovery_fee_journal WHERE tenant_id=t AND job_id=x.job_id;delta:=liability-prior;
 INSERT INTO app.recovery_fee_derivation VALUES(p_derivation,t,x.job_id,NULL,p_reversal,'reference_fee_policy_v1',landed,cap,fee,credit,liability,delta,DEFAULT);INSERT INTO app.recovery_review VALUES(gen_random_uuid(),t,x.job_id,p_derivation,'landing_reversed','open',DEFAULT);
 IF delta<0 THEN SELECT id INTO original FROM app.recovery_fee_journal WHERE tenant_id=t AND job_id=x.job_id AND kind='fee_obligation' ORDER BY created_at LIMIT 1;INSERT INTO app.recovery_fee_journal VALUES(p_journal,t,x.job_id,p_derivation,'compensation',-delta,'GBP','recovery_fee_deferred','recovery_fee_receivable',original,DEFAULT);END IF;RETURN p_derivation;END;
END
$$;

-- Latest body: packages/db/migrations/0670_recovery_demo_replay_job.sql
CREATE OR REPLACE FUNCTION app.configure_recovery_demo(p_job uuid,p_command uuid,p_scenario varchar) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;c uuid:=gen_random_uuid();r uuid:=gen_random_uuid();e uuid:=gen_random_uuid();u uuid:=gen_random_uuid();ea uuid:=gen_random_uuid();la uuid:=gen_random_uuid();
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL OR p_scenario NOT IN('missing_evidence','pending_money','manual_receipt','unapproved_eligibility','prevented','eligible') THEN RAISE EXCEPTION 'invalid synthetic scenario' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM app.job_activation WHERE tenant_id=t AND job_id=p_job AND mode='synthetic_demo' AND fee_policy_version='reference_fee_policy_v1';IF NOT FOUND THEN RAISE EXCEPTION 'synthetic live job required' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM app.recovery_demo_selection WHERE tenant_id=t AND command_id=p_command) THEN
  IF EXISTS(SELECT 1 FROM app.recovery_demo_selection WHERE tenant_id=t AND command_id=p_command
   AND (job_id IS DISTINCT FROM p_job OR scenario IS DISTINCT FROM p_scenario)) THEN
   RAISE EXCEPTION 'scenario command conflict' USING ERRCODE='23505';
  END IF;
  RETURN p_command;
 END IF;
 IF EXISTS(SELECT 1 FROM app.recovery_demo_selection WHERE tenant_id=t AND job_id=p_job) THEN RAISE EXCEPTION 'scenario already selected' USING ERRCODE='23505';END IF;
 INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic)VALUES(c,t,p_job,15000,'GBP',CASE WHEN p_scenario='prevented'THEN'prevented'ELSE'active'END,0,true);
 IF p_scenario<>'manual_receipt' THEN INSERT INTO app.synthetic_recovery_receipt(id,tenant_id,job_id,source_identity,reconciliation_identity,status,gross_pence,currency,synthetic,settled_at)VALUES(r,t,p_job,'generated-fake-settlement:'||r,'generated-movement:'||r,CASE WHEN p_scenario='pending_money'THEN'pending'ELSE'settled'END,18000,'GBP',true,CASE WHEN p_scenario='pending_money'THEN NULL ELSE clock_timestamp() END) ; END IF;
 IF p_scenario NOT IN('missing_evidence','manual_receipt') THEN
  INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)VALUES(u,t,p_job,'synthetic/recovery/'||e,repeat('c',64),'application/pdf',64,'standard_evidence','verified','generated-v1',clock_timestamp(),clock_timestamp()+interval '1 day');
  INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)VALUES(e,t,u,p_job,'original','synthetic_bank_receipt','synthetic/recovery/'||e,'generated-v1',repeat('c',64),64,'application/pdf','standard_evidence',clock_timestamp(),clock_timestamp());
 END IF;
 IF p_scenario<>'unapproved_eligibility' THEN INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id)VALUES(ea,t,p_job,c,'eligibility',0,'approved','reference_fee_policy_v1',clock_timestamp()+interval '1 hour',gen_random_uuid());END IF;
 INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id)VALUES(la,t,p_job,c,'landing',0,'approved','reference_fee_policy_v1',clock_timestamp()+interval '1 hour',gen_random_uuid());
 INSERT INTO app.recovery_demo_selection VALUES(t,p_job,p_command,p_scenario,c,CASE WHEN p_scenario='manual_receipt'THEN NULL ELSE r END,CASE WHEN p_scenario IN('missing_evidence','manual_receipt')THEN NULL ELSE e END,CASE WHEN p_scenario='unapproved_eligibility'THEN NULL ELSE ea END,la,DEFAULT);
 RETURN p_command;
END;
END
$$;

-- Latest body: packages/db/migrations/0357_job_doors_illustration_compatibility.sql
CREATE OR REPLACE FUNCTION app.create_fee_illustration_source(p_job uuid,p_command uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE
 t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 prior app.fee_illustration_source;
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- This retained synthetic bridge uses the fixed DEMO principal, never a client actor.
 -- The routine carries its own current owner-role check before examining any job.
 IF t IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid THEN
  RAISE EXCEPTION 'FEE_ILLUSTRATION_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM app.membership
  WHERE tenant_id=t AND id='d1500000-0000-4000-8000-000000000003'::uuid
   AND identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid
   AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())
  FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FEE_ILLUSTRATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_job IS NULL OR p_command IS NULL THEN
  RAISE EXCEPTION 'INVALID_ILLUSTRATION_COMMAND' USING ERRCODE='22023';
 END IF;
 -- One command lock, then one job lock: serialize both uniqueness dimensions.
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext('fee-illustration:'||p_command::text));
 PERFORM 1 FROM app.job j JOIN app.job_commercial_track c ON (c.tenant_id,c.job_id)=(j.tenant_id,j.id)
  WHERE j.tenant_id=t AND j.id=p_job AND c.job_track='small_builder' AND c.environment IN ('synthetic_demo','pilot_no_charge')
  FOR UPDATE OF j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FEE_ILLUSTRATION_FORBIDDEN' USING ERRCODE='42501'; END IF;

 SELECT * INTO prior FROM app.fee_illustration_source WHERE tenant_id=t AND command_id=p_command;
 IF FOUND THEN
  IF prior.job_id IS DISTINCT FROM p_job OR prior.source_version<>'recovery-18800.v1' THEN
   RAISE EXCEPTION 'FEE_ILLUSTRATION_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM app.fee_illustration_source WHERE tenant_id=t AND job_id=p_job) THEN
  RAISE EXCEPTION 'FEE_ILLUSTRATION_CONFLICT' USING ERRCODE='23505';
 END IF;
 INSERT INTO app.fee_illustration_source(tenant_id,job_id,command_id,source_version,accepted_net_pence,eligible_net_pence,gross_landed_pence,base_obligation_pence,base_settled_pence,prior_posting_pence,source_ids)
 VALUES(t,p_job,p_command,'recovery-18800.v1',1880000,282000,338400,7900,7900,20300,ARRAY[gen_random_uuid(),gen_random_uuid()]);
END;
END
$$;

-- Latest body: packages/db/migrations/0717_credit_request_digest_fields.sql
CREATE OR REPLACE FUNCTION app.issue_practice_customer_credit_note(
 p_tenant uuid,p_job uuid,p_invoice uuid,p_actor uuid,p_command uuid,p_net_pence bigint,p_reason text,p_preview_hash text
) RETURNS TABLE(credit_note_id uuid,credit_number text,pdf_sha256 text,total_pence bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor()
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE inv app.customer_invoice%ROWTYPE; prior jsonb; credited bigint; credited_net bigint; credited_tax bigint; cumulative_tax bigint; tax bigint; gross bigint; paid bigint;
 request_digest text; expected_preview text; n bigint; number text; artifact text; digest text;
 decision_id uuid:=gen_random_uuid(); resolution_id uuid:=gen_random_uuid(); authorization_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid();
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 -- Authority precedes command replay and invoice lookup, including expired owners.
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_command IS NULL OR p_job IS NULL OR p_invoice IS NULL OR p_net_pence IS NULL OR p_reason IS NULL OR p_preview_hash IS NULL
 OR p_net_pence<=0 OR length(btrim(p_reason))<3 THEN RAISE EXCEPTION 'INVALID_CREDIT_AMOUNT'; END IF;
 -- Serialize command identity before reading its receipt, then the invoice balance.
 -- Both are separate statements so a waiter observes the committed receipt.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':credit-command:'||p_command::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 request_digest:=encode(public.digest(convert_to(jsonb_build_object('job',p_job,'invoice',p_invoice,'net',p_net_pence,'reason',p_reason,'preview',p_preview_hash)::text,'UTF8'),'sha256'),'hex');
 SELECT result INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
  IF NOT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command
   AND (request_hash=request_digest OR (
    -- Legacy receipts retain the raw reason only in their old digest. Also bind every
    -- stored field so ambiguous concatenations cannot authorize a changed payload.
    request_hash=encode(public.digest(convert_to(p_job::text||p_invoice::text||p_net_pence::text||p_reason||p_preview_hash,'UTF8'),'sha256'),'hex')
    AND EXISTS(SELECT 1 FROM app.customer_credit_note c WHERE c.tenant_id=p_tenant AND c.id=(prior->>'creditNoteId')::uuid
     AND c.job_id=p_job AND c.invoice_id=p_invoice AND c.net_pence=-p_net_pence
     AND c.reason=btrim(p_reason) AND c.preview_hash=p_preview_hash))) AND command_type='customer_credit_note.issue' AND actor_membership_id=p_actor AND status='succeeded') THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN QUERY SELECT (prior->>'creditNoteId')::uuid,prior->>'creditNumber',prior->>'pdfSha256',(prior->>'totalPence')::bigint; RETURN;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_invoice::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO inv FROM app.customer_invoice WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_invoice;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
 SELECT COALESCE(sum(amount_pence),0),COALESCE(-sum(net_pence),0),COALESCE(-sum(tax_pence),0) INTO credited,credited_net,credited_tax FROM app.customer_credit_note WHERE tenant_id=p_tenant AND invoice_id=p_invoice;
 expected_preview:=encode(public.digest(convert_to(p_job::text||p_invoice::text||p_net_pence::text||credited::text||btrim(inv.pdf_sha256),'UTF8'),'sha256'),'hex');
 IF p_preview_hash<>expected_preview THEN RAISE EXCEPTION 'STALE_CREDIT_PREVIEW'; END IF;
 -- MIGFIX-5: credits conserve the ORIGINAL invoice. Net can never pass the invoice net, whatever VAT rounding leaves behind.
 IF credited_net+p_net_pence>inv.net_pence THEN RAISE EXCEPTION 'CREDIT_EXCEEDS_AVAILABLE_AMOUNT'; END IF;
 -- Cumulative whole-invoice VAT rounding (Ben decisions 7 and 8a): VAT is half-up 20% of the CUMULATIVE credited net, and the
 -- credit that reaches the full invoice net takes exactly the original invoice VAT, so credits always sum to the invoice. Any
 -- stray penny therefore falls in the customer's favour. The credit's own VAT is the cumulative VAT less what earlier credits took.
 cumulative_tax:=CASE WHEN credited_net+p_net_pence=inv.net_pence THEN inv.tax_pence ELSE least((credited_net+p_net_pence+2)/5,inv.tax_pence) END;
 tax:=greatest(least(cumulative_tax-credited_tax,inv.tax_pence-credited_tax),0);
 gross:=p_net_pence+tax;
 IF gross>inv.total_pence-credited THEN RAISE EXCEPTION 'CREDIT_EXCEEDS_AVAILABLE_AMOUNT'; END IF;
 INSERT INTO app.customer_credit_note_sequence(id,tenant_id,next_number)VALUES(gen_random_uuid(),p_tenant,2)
 ON CONFLICT(tenant_id) DO UPDATE SET next_number=app.customer_credit_note_sequence.next_number+1 RETURNING next_number-1 INTO n;
 number:='DEMO-CN-'||lpad(n::text,6,'0');
 artifact:='%PDF-1.4'||chr(10)||'Practice sandbox — synthetic credit; nothing is sent or paid out'||chr(10)||
  'Credit note: '||number||chr(10)||'Corrects '||inv.invoice_number||chr(10)||'Reason: '||btrim(p_reason)||chr(10)||
  'Net pence: -'||p_net_pence||chr(10)||'VAT pence: -'||tax||chr(10)||'Gross pence: -'||gross||chr(10)||'Original invoice hash: '||inv.pdf_sha256||chr(10)||'%%EOF';
 digest:=encode(public.digest(convert_to(artifact,'UTF8'),'sha256'),'hex');
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)VALUES(decision_id,p_tenant,'job',p_job::text,'customer_credit_note.issue');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'customer_credit_note.issue',NULL,digest,credited,gross,'GBP',inv.tax_policy_version,transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_credit_note(id,tenant_id,job_id,invoice_id,authorization_id,credit_number,amount_pence,currency,reason,net_pence,tax_pence,total_pence,source_invoice_hash,preview_hash,pdf_sha256,pdf_bytes,tax_policy_version,approved_at)
 VALUES(new_id,p_tenant,p_job,p_invoice,authorization_id,number,gross,'GBP',btrim(p_reason),-p_net_pence,-tax,-gross,inv.pdf_sha256,p_preview_hash,digest,convert_to(artifact,'UTF8'),inv.tax_policy_version,transaction_timestamp());
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_command,p_tenant,'customer_credit_note.issue','credit-note:'||p_invoice||':'||number,request_digest,'succeeded',jsonb_build_object('creditNoteId',new_id,'creditNumber',number,'pdfSha256',digest,'totalPence',-gross),p_actor,transaction_timestamp());
 RETURN QUERY SELECT new_id,number,digest,-gross;
END;
END
$$;

-- Latest body: packages/db/migrations/0030_receipt_replay_and_invoice_binding.sql
CREATE OR REPLACE FUNCTION app.record_practice_customer_receipt(
 p_tenant uuid,p_job uuid,p_invoice uuid,p_actor uuid,p_command uuid,
 p_paid_on date,p_amount bigint,p_method text,p_reference text
) RETURNS TABLE(payment_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor()
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE
 prior record; request_digest text; legacy_digest text; active_total numeric;
 decision_id uuid:=gen_random_uuid(); resolution_id uuid:=gen_random_uuid();
 authorization_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid();
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF p_job IS NULL OR p_invoice IS NULL OR p_actor IS NULL OR p_command IS NULL
    OR p_amount IS NULL OR p_amount<1 OR p_amount>1000000000000
    OR p_paid_on IS NULL OR NOT isfinite(p_paid_on)
    OR p_paid_on<date '0001-01-01' OR p_paid_on>date '9999-12-31'
    OR p_method IS NULL OR p_method NOT IN('bank_transfer','cash','card_elsewhere','cheque','other')
    OR p_reference IS NULL OR length(btrim(p_reference)) NOT BETWEEN 1 AND 120 THEN
  RAISE EXCEPTION 'INVALID_RECEIPT' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':practice-command:'||p_command::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':receipt:'||p_invoice::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.customer_invoice WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_invoice AND synthetic) THEN
  RAISE EXCEPTION 'INVOICE_NOT_FOUND';
 END IF;
 request_digest:=encode(public.digest(convert_to(jsonb_build_array(
  'practice-customer-receipt.record.v2',p_tenant,p_job,p_invoice,p_actor,
  to_char(p_paid_on,'YYYY-MM-DD'),p_amount,p_method,btrim(p_reference)
 )::text,'UTF8'),'sha256'),'hex');
 -- Keep legitimate retries of pre-upgrade commands working. Actor, operation,
 -- invoice and a succeeded result are still checked; no historical row changes.
 legacy_digest:=encode(public.digest(convert_to(p_job::text||p_invoice::text||p_paid_on::text||p_amount::text||p_method||btrim(p_reference),'UTF8'),'sha256'),'hex');
 SELECT command_type,actor_membership_id,request_hash,status,result INTO prior
 FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
  IF prior.command_type IS DISTINCT FROM 'customer_payment.record'
     OR prior.actor_membership_id IS DISTINCT FROM p_actor
     OR prior.request_hash NOT IN(request_digest,legacy_digest)
     OR prior.status IS DISTINCT FROM 'succeeded' OR prior.result->>'paymentId' IS NULL THEN
   RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN QUERY SELECT (prior.result->>'paymentId')::uuid; RETURN;
 END IF;
 SELECT coalesce(sum(p.amount_pence),0) INTO active_total FROM app.customer_payment p
 WHERE p.tenant_id=p_tenant AND p.invoice_id=p_invoice AND NOT EXISTS(
  SELECT 1 FROM app.customer_payment_reversal r WHERE(r.tenant_id,r.payment_id)=(p.tenant_id,p.id)
 );
 IF active_total+p_amount>1000000000000 THEN
  RAISE EXCEPTION 'RECEIPT_TOTAL_LIMIT' USING ERRCODE='22003';
 END IF;
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
 VALUES(decision_id,p_tenant,'job',p_job::text,'customer_payment.record');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)
 VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'customer_payment.record',NULL,request_digest,0,p_amount,'GBP','manual_receipt_v1',transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_payment(id,tenant_id,job_id,invoice_id,authorization_id,paid_on,amount_pence,currency,method,reference,builder_attested,provenance,qualifying_recovery_proof,platform_fee_settlement)
 VALUES(new_id,p_tenant,p_job,p_invoice,authorization_id,p_paid_on,p_amount,'GBP',p_method,btrim(p_reference),true,'manual_builder_attestation',false,false);
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_command,p_tenant,'customer_payment.record','manual-receipt:'||new_id,request_digest,'succeeded',jsonb_build_object('paymentId',new_id),p_actor,transaction_timestamp());
 RETURN QUERY SELECT new_id;
END;
END
$$;

-- Latest body: packages/db/migrations/0030_receipt_replay_and_invoice_binding.sql
CREATE OR REPLACE FUNCTION app.reverse_practice_customer_receipt(
 p_tenant uuid,p_job uuid,p_invoice uuid,p_payment uuid,p_actor uuid,p_command uuid,p_reason text
) RETURNS TABLE(reversal_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR p_actor IS DISTINCT FROM app.current_actor()
  OR p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE
 prior record; request_digest text; legacy_digest text;
 authorization_id uuid:=gen_random_uuid(); decision_id uuid:=gen_random_uuid();
 resolution_id uuid:=gen_random_uuid(); new_id uuid:=gen_random_uuid();
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF p_job IS NULL OR p_invoice IS NULL OR p_payment IS NULL OR p_actor IS NULL OR p_command IS NULL
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 240 THEN
  RAISE EXCEPTION 'INVALID_REVERSAL' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':practice-command:'||p_command::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':receipt:'||p_invoice::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.customer_payment p JOIN app.customer_invoice i
  ON(i.tenant_id,i.job_id,i.id)=(p.tenant_id,p.job_id,p.invoice_id)
  WHERE p.tenant_id=p_tenant AND p.job_id=p_job AND p.invoice_id=p_invoice AND p.id=p_payment AND i.synthetic
 ) THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
 request_digest:=encode(public.digest(convert_to(jsonb_build_array(
  'practice-customer-receipt.reverse.v2',p_tenant,p_job,p_invoice,p_payment,p_actor,btrim(p_reason)
 )::text,'UTF8'),'sha256'),'hex');
 legacy_digest:=encode(public.digest(convert_to(p_job::text||p_payment::text||btrim(p_reason),'UTF8'),'sha256'),'hex');
 SELECT command_type,actor_membership_id,request_hash,status,result INTO prior
 FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
  IF prior.command_type IS DISTINCT FROM 'customer_payment.reverse'
     OR prior.actor_membership_id IS DISTINCT FROM p_actor
     OR prior.request_hash NOT IN(request_digest,legacy_digest)
     OR prior.status IS DISTINCT FROM 'succeeded' OR prior.result->>'reversalId' IS NULL THEN
   RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN QUERY SELECT (prior.result->>'reversalId')::uuid; RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM app.customer_payment_reversal WHERE tenant_id=p_tenant AND payment_id=p_payment) THEN
  RAISE EXCEPTION 'PAYMENT_ALREADY_REVERSED' USING ERRCODE='23505';
 END IF;
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
 VALUES(decision_id,p_tenant,'job',p_job::text,'customer_payment.reverse');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)
 VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'customer_payment.reverse',NULL,request_digest,0,NULL,NULL,'manual_receipt_v1',transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_payment_reversal(id,tenant_id,job_id,payment_id,authorization_id,reason)
 VALUES(new_id,p_tenant,p_job,p_payment,authorization_id,btrim(p_reason));
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_command,p_tenant,'customer_payment.reverse','manual-receipt-reversal:'||p_payment,request_digest,'succeeded',jsonb_build_object('reversalId',new_id),p_actor,transaction_timestamp());
 RETURN QUERY SELECT new_id;
END;
END
$$;

-- Latest body: packages/db/migrations/0188_practice_supplier_credit.sql
CREATE OR REPLACE FUNCTION app.pf1b_review_supplier_credit(t uuid,j uuid,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE digest text:=nullif(current_setting('app.practice_material_digest',true),''); principal record; member uuid;
 cmd uuid; cid uuid; fixture text; expected_case integer; expected_review integer; payload_hash text;
 c app.recovery_case_current; prior app.recovery_eligibility_v3_review; latest app.recovery_eligibility_v3_review;
 binding app.practice_supplier_credit_case_binding; sources jsonb; p jsonb; final_event uuid; q bigint;
 result jsonb; line jsonb; reason text; rid uuid:=gen_random_uuid(); revision integer; job_status text;
BEGIN
 -- Authority comes first, including replay and unknown job paths. Settings alone never supply an actor.
 IF current_setting('app.tenant_id',true) IS NULL OR current_setting('app.tenant_id',true) !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 OR current_setting('app.recovery_eligibility_environment',true) IS DISTINCT FROM 'synthetic_demo'
 OR digest IS NULL OR digest !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO principal FROM app.authenticate_practice_session(digest,t);
 -- LP6D_DERIVED_ACTOR: a digest that authenticates must be the bound actor; one that does not
 -- keeps the body's own refusal code just below.
 IF principal.membership_id IS NOT NULL AND principal.membership_id IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF principal.membership_id IS NULL THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT id INTO member FROM app.membership WHERE tenant_id=t AND id=principal.membership_id AND identity_user_id=principal.identity_user_id
 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF member IS NULL THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM control_plane.practice_session WHERE token_digest=digest AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j AND practice_session_digest=digest)
 THEN RAISE EXCEPTION 'RECOVERY_JOB_NOT_FOUND' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';END IF;
 IF input - ARRAY['version','action','commandId','caseId','fixture','expectedCaseRevision','expectedReviewRevision'] <> '{}'::jsonb
 OR NOT(input ?& ARRAY['version','action','commandId','caseId','fixture','expectedCaseRevision','expectedReviewRevision'])
 OR input->>'version' IS DISTINCT FROM 'recovery-eligibility-command.v3' OR input->>'action' IS DISTINCT FROM 'review'
 OR jsonb_typeof(input->'commandId') IS DISTINCT FROM 'string' OR jsonb_typeof(input->'caseId') IS DISTINCT FROM 'string'
 OR input->>'commandId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 OR input->>'caseId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 OR jsonb_typeof(input->'fixture') IS DISTINCT FROM 'string' OR input->>'fixture' NOT IN('F14','F16-partial','F16-full')
 OR jsonb_typeof(input->'expectedCaseRevision') IS DISTINCT FROM 'number' OR jsonb_typeof(input->'expectedReviewRevision') IS DISTINCT FROM 'number'
 OR input->>'expectedCaseRevision' !~ '^[0-9]{1,10}$' OR input->>'expectedReviewRevision' !~ '^[0-9]{1,10}$'
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';END IF;
 IF (input->>'expectedCaseRevision')::bigint NOT BETWEEN 1 AND 2147483646 OR (input->>'expectedReviewRevision')::bigint NOT BETWEEN 0 AND 2147483646
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';END IF;
 cmd:=(input->>'commandId')::uuid;cid:=(input->>'caseId')::uuid;fixture:=input->>'fixture';
 expected_case:=(input->>'expectedCaseRevision')::integer;expected_review:=(input->>'expectedReviewRevision')::integer;
 -- Canonical SQL jsonb array, UUIDs normalized by PostgreSQL; hashes are never caller supplied.
 payload_hash:=encode(sha256(convert_to(jsonb_build_array('pf1b.v1',t::text,j::text,'recovery-eligibility-command.v3','review',cmd::text,cid::text,expected_case,expected_review,fixture)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext('eligibility-v3:'||cmd::text));
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(cid::text));
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(j::text));
 -- Lock the job against lifecycle changes only after the shared feed key, before the audit head.
 SELECT status INTO job_status FROM app.job WHERE tenant_id=t AND id=j AND practice_session_digest=digest FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_JOB_NOT_FOUND' USING ERRCODE='42501';END IF;
 -- Expiry may have passed while waiting for locks; current authority is checked again.
 IF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(digest,t) p WHERE p.membership_id=member)
 THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO prior FROM app.recovery_eligibility_v3_review WHERE tenant_id=t AND command_id=cmd;
 IF FOUND THEN
  IF prior.job_id<>j OR prior.payload_hash<>payload_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('id',prior.id,'revision',prior.revision,'caseRevision',prior.case_revision,'sourceEventId',prior.source_event_id,'result',prior.result,'payloadHash',prior.payload_hash,'resultHash',encode(sha256(convert_to(prior.result::text,'UTF8')),'hex'),'actorMembershipId',member,'commandId',cmd,'replayed',true);
 END IF;
 SELECT * INTO c FROM app.recovery_case_current WHERE tenant_id=t AND job_id=j AND id=cid;
 IF NOT FOUND OR NOT c.synthetic OR c.claim_revision IS NULL THEN RAISE EXCEPTION 'RECOVERY_CASE_NOT_FOUND' USING ERRCODE='23514';END IF;
 SELECT r.* INTO latest FROM app.recovery_eligibility_v3_review r WHERE r.tenant_id=t AND r.case_id=cid ORDER BY r.revision DESC LIMIT 1;
 IF c.revision<>expected_case OR coalesce(latest.revision,0)<>expected_review THEN RAISE EXCEPTION 'ELIGIBILITY_STALE_REVISION' USING ERRCODE='40001';END IF;
 IF job_status<>'live' THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
 sources:=app.pf1b_source_bundle(t,j,cid);
 IF c.case_type<>'merchant_overcharge' OR c.claim_pence<30000
 OR latest.id IS NOT NULL AND latest.fixture<>fixture AND NOT(latest.fixture='F16-partial' AND fixture='F16-full')
 OR fixture='F16-full' AND (latest.id IS NULL OR latest.fixture NOT IN('F16-partial','F16-full'))
 THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 IF fixture='F16-partial' AND jsonb_array_length(sources->'payments')<>1 OR fixture<>'F16-partial' AND jsonb_array_length(sources->'payments')<>2
 THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 SELECT * INTO binding FROM app.practice_supplier_credit_case_binding WHERE tenant_id=t AND case_id=cid;
 IF FOUND THEN
  IF binding.job_id<>j OR binding.credit_note_id<>(sources->>'creditId')::uuid OR binding.credit_note_version_id<>(sources->>'creditVersionId')::uuid
  OR binding.later_invoice_id<>(sources->>'invoiceId')::uuid OR binding.later_invoice_version_id<>(sources->>'invoiceVersionId')::uuid
  OR binding.credit_source_hash<>sources->>'creditHash' OR binding.invoice_source_hash<>sources->>'invoiceHash'
  THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
 ELSE
  INSERT INTO app.practice_supplier_credit_case_binding(id,tenant_id,job_id,case_id,credit_note_id,credit_note_version_id,later_invoice_id,later_invoice_version_id,credit_source_hash,invoice_source_hash,consumed_net_pence,cash_due_pence,actor_membership_id,command_id)
  VALUES(gen_random_uuid(),t,j,cid,(sources->>'creditId')::uuid,(sources->>'creditVersionId')::uuid,(sources->>'invoiceId')::uuid,(sources->>'invoiceVersionId')::uuid,sources->>'creditHash',sources->>'invoiceHash',30000,144000,member,cmd);
 END IF;
 q:=CASE WHEN fixture='F16-partial' THEN 0 ELSE 30000 END;
 reason:=CASE WHEN fixture='F16-partial' THEN 'Credit note used against an invoice not yet paid in full' ELSE NULL END;
 line:=jsonb_build_object('kind','principal','debtorType','business','netPence',30000,'qualifyingPrincipal',jsonb_build_object('pence',q,'currency','GBP'),'reason',reason,'reasonHeld',false);
 result:=jsonb_build_object('version','recovery-eligibility-review.v3','policyVersion','reference_recovery_eligibility_policy_v3','fixture',fixture,'outcome',CASE WHEN q=0 THEN 'excluded' ELSE 'eligible_for_review' END,'qualifyingPrincipal',jsonb_build_object('pence',q,'currency','GBP'),'reason',reason,'reasonHeld',false,'terminal',false,'productionEnabled',false,'lines',jsonb_build_array(line));
 SELECT (pmt->>'id')::uuid INTO final_event FROM jsonb_array_elements(sources->'payments') pmt WHERE pmt->>'movement'=CASE WHEN q=0 THEN 'supplier-payment-600' ELSE 'supplier-payment-840' END;
 revision:=coalesce(latest.revision,0)+1;
 INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)
 VALUES(rid,t,j,cid,revision,c.revision,fixture,final_event,member,cmd,payload_hash,result);
 INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence) VALUES(gen_random_uuid(),t,j,cid,rid,'principal','business',30000);
 FOR p IN SELECT value FROM jsonb_array_elements(sources->'payments') LOOP
  INSERT INTO app.practice_supplier_credit_review_payment(id,tenant_id,job_id,case_id,review_id,payment_event_id,movement_key,gross_pence,source_hash)
  VALUES(gen_random_uuid(),t,j,cid,rid,(p->>'id')::uuid,p->>'movement',(p->>'gross')::bigint,p->>'hash');
 END LOOP;
 IF q>0 THEN
  INSERT INTO app.supplier_credit_consumption(id,tenant_id,job_id,case_id,review_id,credit_note_id,later_invoice_id,settled_payment_event_id,consumed_net_pence)
  VALUES(gen_random_uuid(),t,j,cid,rid,(sources->>'creditId')::uuid,(sources->>'invoiceId')::uuid,final_event,30000);
 END IF;
 RETURN jsonb_build_object('id',rid,'revision',revision,'caseRevision',c.revision,'sourceEventId',final_event,'result',result,'payloadHash',payload_hash,'resultHash',encode(sha256(convert_to(result::text,'UTF8')),'hex'),'actorMembershipId',member,'commandId',cmd,'replayed',false);
END;
END
$$;

-- Latest body: packages/db/migrations/0690_import_ancestry_record_anchor.sql
CREATE OR REPLACE FUNCTION app.final_check_builder(t uuid,j uuid,d text,locking boolean DEFAULT false)
 RETURNS TABLE(member_id uuid,user_id uuid) LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE a record; owned boolean;
BEGIN
 PERFORM app.final_check_context(t);
 IF NOT pg_has_role(session_user,'jobguard_runtime','USAGE') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF locking THEN PERFORM 1 FROM control_plane.practice_session WHERE token_digest=d FOR SHARE; END IF;
 SELECT * INTO a FROM app.authenticate_practice_session(d,t);
 -- LP6D_DERIVED_ACTOR: a digest that authenticates must be the bound actor; one that does not
 -- keeps the body's own refusal code just below.
 IF a.membership_id IS NOT NULL AND a.membership_id IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF locking THEN PERFORM 1 FROM app.membership WHERE tenant_id=t AND id=a.membership_id AND identity_user_id=a.identity_user_id FOR SHARE; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=a.membership_id AND identity_user_id=a.identity_user_id AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 WITH RECURSIVE owned_jobs AS (
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=d
  UNION SELECT child.id FROM owned_jobs source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
  JOIN app.job child ON child.tenant_id=e.tenant_id AND child.id::text=e.subject_ref AND child.provenance='imported' AND child.practice_session_digest IS NULL
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=child.id AND iv.source_job_id=source.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||child.id::text AND rv.result->>'jobId'=child.id::text AND rv.result->>'sourceJobId'=source.id::text))
 ) SELECT EXISTS(SELECT 1 FROM owned_jobs WHERE id=j) INTO owned;
 IF NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT owned OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND job_track='small_builder' AND environment='synthetic_demo') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF locking THEN
  PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
  -- Recheck deadlines after every wait before replay or effects.
  IF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t) s WHERE s.membership_id=a.membership_id AND s.identity_user_id=a.identity_user_id) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN QUERY SELECT a.membership_id::uuid,a.identity_user_id::uuid;
END;
END
$$;


-- Latest body: packages/db/migrations/0406_success_fee_catch_posting.sql
CREATE OR REPLACE FUNCTION app.read_success_fee_v3(p_job uuid,p_session text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid; actor record;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') IS NOT TRUE THEN
  RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 SELECT * INTO actor FROM app.authenticate_practice_session(p_session,t);
 -- LP6D_DERIVED_ACTOR: a digest that authenticates must be the bound actor; one that does not
 -- keeps the body's own refusal code just below.
 IF actor.membership_id IS NOT NULL AND actor.membership_id IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF actor.membership_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor.membership_id
   AND m.identity_user_id=actor.identity_user_id AND m.role='owner'
   AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 ) THEN RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM app.job j JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
  WHERE j.tenant_id=t AND j.id=p_job AND j.practice_session_digest=p_session
   AND j.fee_policy_version='reference_fee_policy_v3'
   AND c.job_track='small_builder' AND c.environment='synthetic_demo'
 ) THEN RAISE EXCEPTION 'SUCCESS_FEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=p_job) THEN
  RETURN jsonb_build_object('version','success-fee-availability.v1','jobId',p_job,
   'environment','synthetic_demo','state','catch_review_available','productionEnabled',false,'realExternalActions',0);
 END IF;
 -- No shadow, attribution, allocation, evidence, review or ledger read occurs.
 RETURN jsonb_build_object('version','success-fee-availability.v1','jobId',p_job,
  'environment','synthetic_demo','state','dependency_bound',
  'dependency','accepted_attribution_source_adapter','productionEnabled',false,'realExternalActions',0);
END;
END
$$;

-- Latest body: packages/db/migrations/0698_final_check_post_invoice_rerun.sql
CREATE OR REPLACE FUNCTION app.read_value_job(j uuid,digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor record;
 locked app.final_account_lock; run app.final_check_run_binding; a record;
 checked jsonb:='[]'; tracked jsonb:='[]'; assessments jsonb:='[]'; current_source jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'VALUE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t<>'11111111-1111-4111-8111-111111111111'::uuid THEN
  SELECT app.mon1_company_actor(t,digest) member_id INTO actor;
 -- LP6D_DERIVED_ACTOR (the company branch has no later NULL refusal, so a NULL actor is refused here)
 IF actor.member_id IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 ELSE
  SELECT * INTO actor FROM app.authenticate_practice_session(digest,t);
 -- LP6D_DERIVED_ACTOR: a digest that authenticates must be the bound actor; one that does not
 -- keeps the body's own refusal code just below.
 IF actor.membership_id IS NOT NULL AND actor.membership_id IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor.membership_id AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
  THEN RAISE EXCEPTION 'VALUE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j AND (t<>'11111111-1111-4111-8111-111111111111'::uuid OR practice_session_digest=digest))
 THEN RAISE EXCEPTION 'VALUE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO locked FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 -- No hidden query, identifier, count or timing path before the immutable lock.
 IF locked.id IS NULL THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND job_track='small_builder' AND environment='synthetic_demo')
 THEN RAISE EXCEPTION 'VALUE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t='11111111-1111-4111-8111-111111111111'::uuid THEN
  SELECT * INTO actor FROM app.final_check_builder(t,j,digest);
 END IF;
 SELECT b0.* INTO run FROM app.final_check_run_binding b0 JOIN app.final_check_manifest m0 ON(m0.tenant_id,m0.job_id,m0.id)=(b0.tenant_id,b0.job_id,b0.manifest_id) WHERE b0.tenant_id=t AND b0.job_id=j AND b0.lock_id=locked.id AND EXISTS(SELECT 1 FROM app.shadow_reconciliation_run r0 WHERE (r0.tenant_id,r0.job_id,r0.id,r0.status)=(t,j,b0.run_id,'completed')) ORDER BY m0.attempt DESC LIMIT 1;
 IF run.run_id IS NOT NULL THEN
  SELECT coalesce(jsonb_agg(s.id ORDER BY s.id),'[]') INTO checked
  FROM app.final_check_processing_source s WHERE s.tenant_id=t AND s.job_id=j AND s.manifest_id=run.manifest_id AND s.processable;
 END IF;
 -- Keep original locked capture IDs in the value contract. Match their immutable
 -- commercial identity to the issued line, including a 0413 combined final.
 -- Never count descendant copies or post-lock catches as builder captures.
 FOR a IN SELECT jsonb_build_object('id',l.id,'revisionId',l.final_account_revision_id,
  'sourceId',l.source_id,'checkId',b.check_id,'netPence',l.net_pence,'invoiceId',i.invoice_id,'at',to_char(ci.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) document,
  i.final_account_line_id invoice_line_id,i.revision_id invoice_revision_id
 FROM app.final_account_line l JOIN app.variation_revision v ON(v.tenant_id,v.job_id,v.id)=(l.tenant_id,l.job_id,l.source_id)
 JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(v.tenant_id,v.job_id,v.variation_id)
 JOIN app.final_account_invoiced_line i ON(i.tenant_id,i.job_id,i.line_kind,i.source_id,i.commercial_revision_id,i.scope_item_id,i.net_pence)=
  (l.tenant_id,l.job_id,l.line_kind,l.source_id,l.commercial_revision_id,l.scope_item_id,l.net_pence)
 JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.invoice_id)
 JOIN app.customer_invoice ci ON(ci.tenant_id,ci.job_id,ci.id)=(i.tenant_id,i.job_id,i.invoice_id)
 WHERE l.tenant_id=t AND l.job_id=j AND l.final_account_revision_id=locked.final_account_revision_id
 AND l.line_kind='variation' AND l.commercial_revision_id=v.id AND o.kind IN('builder_logged','final_review')
 AND b.invoice_kind='final' AND b.lock_id=locked.id AND b.revision_id=i.revision_id
 AND ci.final_account_revision_id=i.revision_id ORDER BY l.id LOOP
  PERFORM app.receipt_fact_invoice_line(t,j,(a.document->>'invoiceId')::uuid,a.invoice_line_id,
   a.invoice_revision_id,locked.id,(a.document->>'checkId')::uuid);
  tracked:=tracked||jsonb_build_array(a.document);
 END LOOP;
 FOR a IN SELECT r.*,row_number() OVER(PARTITION BY case_id,work_id,line_id,lock_id ORDER BY revision DESC) latest
  FROM app.recovery_attribution_revision r WHERE tenant_id=t AND job_id=j ORDER BY case_id,work_id,line_id,revision LOOP
  IF a.latest=1 THEN
   -- Re-resolve current sources without appending: a stale assessment must not
   -- keep showing positive money after a refund, credit or evidence invalidation.
   current_source:=app.recovery_attribution_sources(t,j,a.document,actor.member_id);
  END IF;
  assessments:=assessments||jsonb_build_array(jsonb_build_object('document',a.document,
   'current',a.latest<>1 OR (current_source->>'sourceHash')=(a.document->>'sourceHash')));
 END LOOP;
 RETURN jsonb_build_object('tenantId',t,'jobId',j,'lockId',locked.id,'lockedRevisionId',locked.final_account_revision_id,
  'lockedAt',to_char(locked.locked_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'checked',checked,
  'checkId',run.run_id,'checkedAt',to_char(run.available_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'tracked',tracked,'assessments',assessments,
  'foundComplete',NOT EXISTS(SELECT 1 FROM app.recovery_case_current c WHERE c.tenant_id=t AND c.job_id=j AND c.case_type='missed_variation_final_account'
   AND NOT EXISTS(SELECT 1 FROM app.recovery_attribution_revision r WHERE r.tenant_id=t AND r.job_id=j AND r.case_id=c.id)));
END;
END
$$;

-- Latest body: packages/db/migrations/0358_value_source_read.sql
CREATE OR REPLACE FUNCTION app.read_value_business(digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; billing jsonb; jobs jsonb:='[]'; j record; snapshot jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'VALUE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 billing:=app.mon2_read(t,digest);
 FOR j IN SELECT x.id FROM app.job x JOIN app.job_commercial_track tr ON(tr.tenant_id,tr.job_id)=(x.tenant_id,x.id) WHERE x.tenant_id=t AND tr.job_track='small_builder' AND tr.environment='synthetic_demo' ORDER BY x.id LOOP
  snapshot:=app.read_value_job(j.id,digest);
  IF snapshot IS NOT NULL THEN jobs:=jobs||jsonb_build_array(snapshot); END IF;
 END LOOP;
 RETURN jsonb_build_object('billing',billing,'jobs',jobs);
END;
END
$$;

-- Latest body: packages/db/migrations/0406_success_fee_catch_posting.sql
CREATE OR REPLACE FUNCTION app.lock_success_fee_sources() RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
BEGIN
 LOCK TABLE app.recovery_attribution_revision,app.recovery_attribution_command,
 app.stored_receipt_case_allocation,app.receipt_allocation_fact_source,
 app.receipt_allocation_fact_line,app.receipt_allocation_fact_revision,app.receipt_allocation_fact_command,
 app.customer_payment_reversal,app.customer_credit_note,app.practice_feed_event,app.practice_feed_command,
 app.evidence_invalidation,app.shadow_signal_evidence,app.shadow_commercial_signal,app.shadow_disclosure_event,app.shadow_signal_ineligibility,
 app.recovery_case,app.recovery_claim_revision,app.recovery_case_event IN SHARE MODE;
END;
END
$$;
-- Latest body: packages/db/migrations/0548_server_plan_entitlements.sql
CREATE OR REPLACE FUNCTION app.mon8_feature_decision(actor uuid, feature text, purpose text DEFAULT 'new_work') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid; assignment app.commercial_track_assignment; status app.contractor_agreement_status_revision;
 agreement app.subscription_agreement_revision; entitlement text:='held'; reason text:='agreement_authority_held';
 contractor_feature boolean; today date;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END;
 IF t IS NULL OR actor IS NULL OR feature IS NULL OR purpose IS NULL
 OR feature NOT IN('watchdog','final_check','invoices','recovery_cases','pay_now','accounting_export','operative_roles','site_origin_capture','approval_chains','work_orders','sso')
 OR purpose NOT IN('new_work','retained_read') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Organisation/status before subscription/lifecycle before business locks before audit.
 contractor_feature:=feature IN('operative_roles','site_origin_capture','approval_chains','work_orders','sso');
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 IF NOT contractor_feature AND purpose='new_work' THEN PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,184)); END IF;
 -- Read after both waits. The actor belongs to this transaction's verified tenant.
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor AND m.revoked_at IS NULL
 AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=t AND r.membership_id=m.id)) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF purpose='retained_read' THEN
  -- Availability only: each reader must still enforce its exact role/resource/export permissions.
  entitlement:='included'; reason:='available';
 ELSE
  SELECT * INTO assignment FROM app.commercial_track_assignment WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
  today:=(clock_timestamp() AT TIME ZONE 'Europe/London')::date;
  IF NOT contractor_feature THEN SELECT * INTO agreement FROM app.subscription_agreement_revision WHERE tenant_id=t AND effective_date<=today ORDER BY effective_date DESC,revision DESC LIMIT 1; END IF;
  IF assignment.commercial_track='contractor' THEN
   IF contractor_feature THEN
    SELECT * INTO status FROM app.contractor_agreement_status_revision WHERE tenant_id=t AND assignment_id=assignment.id ORDER BY revision DESC LIMIT 1;
    IF status.status='active' THEN entitlement:='included'; reason:='available'; END IF;
   ELSE entitlement:='excluded'; reason:='track_forbidden'; END IF;
  ELSIF assignment.commercial_track='small_builder' OR (assignment.id IS NULL AND (agreement.id IS NOT NULL OR contractor_feature)) THEN
   IF contractor_feature THEN entitlement:='excluded'; reason:='track_forbidden';
   ELSIF agreement.id IS NOT NULL AND agreement.plan IN('Solo','Builder') THEN
    entitlement:='included';
    -- Live payment/accounting readiness and persisted MON-3 trial authority are not on main.
    reason:=CASE WHEN feature IN('pay_now','accounting_export') THEN 'feature_disabled' ELSE 'available' END;
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('version','plan-entitlement-decision.v1','environment','synthetic_demo','feature',feature,
  'entitlement',entitlement,'executable',reason='available','reason',reason);
END;
END
$$;


-- Private copy of the latest 0548 decision body, owned by the migration role and executable
-- by no login. Like mon8_sso_feature_decision, it serves only callers that are not bound
-- requests by design: email-code invitation provisioning (the identity sign-in itself) and
-- the maintenance-login route in mon8_require_feature. The public decision stays bound.
CREATE FUNCTION app.lp6d_mon8_feature_decision(actor uuid, feature text, purpose text DEFAULT 'new_work') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; assignment app.commercial_track_assignment; status app.contractor_agreement_status_revision;
 agreement app.subscription_agreement_revision; entitlement text:='held'; reason text:='agreement_authority_held';
 contractor_feature boolean; today date;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END;
 IF t IS NULL OR actor IS NULL OR feature IS NULL OR purpose IS NULL
 OR feature NOT IN('watchdog','final_check','invoices','recovery_cases','pay_now','accounting_export','operative_roles','site_origin_capture','approval_chains','work_orders','sso')
 OR purpose NOT IN('new_work','retained_read') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Organisation/status before subscription/lifecycle before business locks before audit.
 contractor_feature:=feature IN('operative_roles','site_origin_capture','approval_chains','work_orders','sso');
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 IF NOT contractor_feature AND purpose='new_work' THEN PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,184)); END IF;
 -- Read after both waits. The actor belongs to this transaction's verified tenant.
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor AND m.revoked_at IS NULL
 AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=t AND r.membership_id=m.id)) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF purpose='retained_read' THEN
  -- Availability only: each reader must still enforce its exact role/resource/export permissions.
  entitlement:='included'; reason:='available';
 ELSE
  SELECT * INTO assignment FROM app.commercial_track_assignment WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
  today:=(clock_timestamp() AT TIME ZONE 'Europe/London')::date;
  IF NOT contractor_feature THEN SELECT * INTO agreement FROM app.subscription_agreement_revision WHERE tenant_id=t AND effective_date<=today ORDER BY effective_date DESC,revision DESC LIMIT 1; END IF;
  IF assignment.commercial_track='contractor' THEN
   IF contractor_feature THEN
    SELECT * INTO status FROM app.contractor_agreement_status_revision WHERE tenant_id=t AND assignment_id=assignment.id ORDER BY revision DESC LIMIT 1;
    IF status.status='active' THEN entitlement:='included'; reason:='available'; END IF;
   ELSE entitlement:='excluded'; reason:='track_forbidden'; END IF;
  ELSIF assignment.commercial_track='small_builder' OR (assignment.id IS NULL AND (agreement.id IS NOT NULL OR contractor_feature)) THEN
   IF contractor_feature THEN entitlement:='excluded'; reason:='track_forbidden';
   ELSIF agreement.id IS NOT NULL AND agreement.plan IN('Solo','Builder') THEN
    entitlement:='included';
    -- Live payment/accounting readiness and persisted MON-3 trial authority are not on main.
    reason:=CASE WHEN feature IN('pay_now','accounting_export') THEN 'feature_disabled' ELSE 'available' END;
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('version','plan-entitlement-decision.v1','environment','synthetic_demo','feature',feature,
  'entitlement',entitlement,'executable',reason='available','reason',reason);
END $$;
ALTER FUNCTION app.lp6d_mon8_feature_decision(uuid,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6d_mon8_feature_decision(uuid,text,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
DO $revoke$ DECLARE r record; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolcanlogin LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION app.lp6d_mon8_feature_decision(uuid,text,text) FROM %I',r.rolname);
 END LOOP;
END $revoke$;

-- Latest body: packages/db/migrations/0548_server_plan_entitlements.sql; only the decision call routes by login.
CREATE OR REPLACE FUNCTION app.mon8_require_feature(actor uuid,feature text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP-6d: a request login always uses the bound decision. Only the original maintenance
 -- login (row-trigger fixtures/administration, the 0720 convention) uses the private copy.
 IF NOT ((CASE WHEN pg_has_role(session_user,'jobguard_migration','USAGE') THEN app.lp6d_mon8_feature_decision(actor,feature)
  ELSE app.mon8_feature_decision(actor,feature) END)->>'executable')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;

-- Latest body: packages/db/migrations/0703_invitation_issuer_recheck.sql; only the issuer's feature
-- decision uses the private copy (the sign-in has no bound request yet).
CREATE OR REPLACE FUNCTION identity.provision_verified_challenge(challenge_id uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
DECLARE c identity.challenge; i identity.invitation; l identity.membership_locator; u uuid; t uuid; a uuid; m uuid; issuer uuid;
BEGIN
 SELECT * INTO c FROM identity.challenge WHERE id=challenge_id FOR UPDATE;
 IF NOT FOUND OR NOT c.verified OR c.consumed_at IS NULL OR c.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'invalid challenge' USING ERRCODE='22023';
 END IF;
 -- Consume the authorization latch on every outcome, including unknown signin/invitation.
 UPDATE identity.challenge SET verified=false WHERE id=c.id;
 SELECT user_id INTO u FROM identity.user_email WHERE email=c.email;
 IF c.purpose='signin' AND u IS NULL THEN RETURN NULL; END IF;
 IF c.purpose='invitation' THEN
  -- Match the contractor command lock before checking membership reuse.
  SELECT tenant_id INTO t FROM identity.invitation WHERE id=c.invitation_id AND email=c.email;
  IF t IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54)); END IF;
  SELECT * INTO i FROM identity.invitation WHERE id=c.invitation_id AND email=c.email
   AND accepted_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM set_config('app.tenant_id',i.tenant_id::text,true);
  SELECT member_row.id INTO issuer FROM app.membership member_row WHERE member_row.tenant_id=i.tenant_id AND member_row.identity_user_id=i.issuer_user_id AND member_row.account_id=i.account_id
   AND member_row.role='owner' AND member_row.revoked_at IS NULL AND(member_row.expires_at IS NULL OR member_row.expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=i.tenant_id AND r.membership_id=member_row.id)
   ORDER BY member_row.id LIMIT 1;
  IF issuer IS NULL THEN RETURN NULL; END IF;
  IF i.role='operative' THEN
   IF NOT (app.lp6d_mon8_feature_decision(issuer,'operative_roles')->>'executable')::boolean OR c.expires_at<=clock_timestamp() THEN RETURN NULL; END IF;
  END IF;
 END IF;
 IF u IS NULL THEN
  u:=gen_random_uuid();
  INSERT INTO identity.identity_user(id) VALUES(u);
  INSERT INTO identity.user_email(email,user_id) VALUES(c.email,u);
  IF c.purpose='signup' THEN
   t:=gen_random_uuid(); a:=gen_random_uuid(); m:=gen_random_uuid();
   INSERT INTO control_plane.tenant(id) VALUES(t);
   PERFORM set_config('app.tenant_id',t::text,true);
   INSERT INTO app.account(id,tenant_id,name) VALUES(a,t,'New business');
   INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,t,a,u,'owner');
   INSERT INTO identity.membership_locator VALUES(u,t,m);
  END IF;
 END IF;
 IF c.purpose='invitation' THEN
  PERFORM set_config('app.tenant_id',i.tenant_id::text,true); m:=gen_random_uuid();
  -- The locator outlives revocation and expiry, so it is not itself a reason to refuse. Lock it, then lock the linked
  -- membership: only a currently ACTIVE membership blocks a fresh invitation (the invitation then stays unused).
  SELECT * INTO l FROM identity.membership_locator WHERE user_id=u AND tenant_id=i.tenant_id FOR UPDATE;
  IF FOUND THEN
   PERFORM 1 FROM app.membership WHERE tenant_id=l.tenant_id AND id=l.membership_id AND identity_user_id=u
    AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r
     WHERE r.tenant_id=l.tenant_id AND r.membership_id=l.membership_id) FOR SHARE;
   IF FOUND THEN RETURN NULL; END IF;
   -- Inactive: add the invitation-bound replacement and repoint the locator atomically. The revoked or expired
   -- membership row is kept untouched as history (audit rows keep referring to it).
   INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,i.tenant_id,i.account_id,u,i.role);
   UPDATE identity.membership_locator SET membership_id=m WHERE user_id=u AND tenant_id=i.tenant_id;
  ELSE
   INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,i.tenant_id,i.account_id,u,i.role);
   INSERT INTO identity.membership_locator VALUES(u,i.tenant_id,m);
  END IF;
  UPDATE identity.invitation SET accepted_at=clock_timestamp() WHERE id=i.id;
 END IF;
 INSERT INTO identity.security_event VALUES(gen_random_uuid(),'identity.verified',c.id,clock_timestamp());
 RETURN u;
END $$;

-- Private SSO bootstrap: the validated sign-in path supplies the member and tenant.
CREATE OR REPLACE FUNCTION app.mon8_sso_feature_decision(actor uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE feature constant text:='sso'; purpose constant text:='new_work'; t uuid; assignment app.commercial_track_assignment; status app.contractor_agreement_status_revision;
 agreement app.subscription_agreement_revision; entitlement text:='held'; reason text:='agreement_authority_held';
 contractor_feature boolean; today date;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END;
 IF t IS NULL OR actor IS NULL OR feature IS NULL OR purpose IS NULL
 OR feature NOT IN('watchdog','final_check','invoices','recovery_cases','pay_now','accounting_export','operative_roles','site_origin_capture','approval_chains','work_orders','sso')
 OR purpose NOT IN('new_work','retained_read') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Organisation/status before subscription/lifecycle before business locks before audit.
 contractor_feature:=feature IN('operative_roles','site_origin_capture','approval_chains','work_orders','sso');
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 IF NOT contractor_feature AND purpose='new_work' THEN PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,184)); END IF;
 -- Read after both waits. The actor belongs to this transaction's verified tenant.
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor AND m.revoked_at IS NULL
 AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=t AND r.membership_id=m.id)) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF purpose='retained_read' THEN
  -- Availability only: each reader must still enforce its exact role/resource/export permissions.
  entitlement:='included'; reason:='available';
 ELSE
  SELECT * INTO assignment FROM app.commercial_track_assignment WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
  today:=(clock_timestamp() AT TIME ZONE 'Europe/London')::date;
  IF NOT contractor_feature THEN SELECT * INTO agreement FROM app.subscription_agreement_revision WHERE tenant_id=t AND effective_date<=today ORDER BY effective_date DESC,revision DESC LIMIT 1; END IF;
  IF assignment.commercial_track='contractor' THEN
   IF contractor_feature THEN
    SELECT * INTO status FROM app.contractor_agreement_status_revision WHERE tenant_id=t AND assignment_id=assignment.id ORDER BY revision DESC LIMIT 1;
    IF status.status='active' THEN entitlement:='included'; reason:='available'; END IF;
   ELSE entitlement:='excluded'; reason:='track_forbidden'; END IF;
  ELSIF assignment.commercial_track='small_builder' OR (assignment.id IS NULL AND (agreement.id IS NOT NULL OR contractor_feature)) THEN
   IF contractor_feature THEN entitlement:='excluded'; reason:='track_forbidden';
   ELSIF agreement.id IS NOT NULL AND agreement.plan IN('Solo','Builder') THEN
    entitlement:='included';
    -- Live payment/accounting readiness and persisted MON-3 trial authority are not on main.
    reason:=CASE WHEN feature IN('pay_now','accounting_export') THEN 'feature_disabled' ELSE 'available' END;
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('version','plan-entitlement-decision.v1','environment','synthetic_demo','feature',feature,
  'entitlement',entitlement,'executable',reason='available','reason',reason);
END $$;
ALTER FUNCTION app.mon8_sso_feature_decision(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_sso_feature_decision(uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
DO $revoke$ DECLARE r record; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolcanlogin LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION app.mon8_sso_feature_decision(uuid) FROM %I',r.rolname);
 END LOOP;
END $revoke$;

-- Latest body: packages/db/migrations/0549_contractor_feature_guards.sql; only the SSO feature call changes.
CREATE OR REPLACE FUNCTION identity.sso_complete(c uuid,claims jsonb,state char(64),new_session uuid,token char(64),csrf text,expires timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; r identity.sso_request; sub identity.sso_subject; u uuid; member uuid; account uuid; address text:=(claims->>'email'); email_domain text; group_row record; grant_id uuid; grants_count integer:=0; allow_new_grants boolean:=false; sh char(64):=(claims->>'subjectHash'); eh char(64):=(claims->>'emailHash'); link identity.session; binding jsonb; BEGIN
 binding:=identity.sso_load_connection(c); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 -- Match email-code serialization order and lock globally shared email before identity creation/linking.
 PERFORM pg_advisory_xact_lock(hashtextextended('identity-email:'||address,0));
 SELECT * INTO r FROM identity.sso_request WHERE tenant_id=t AND connection_id=c AND request_id=(claims->>'requestId') FOR UPDATE;
 IF r.request_id IS NULL OR r.state_digest<>state OR r.expires_at<=clock_timestamp() OR r.consumed_at IS NULL THEN RAISE EXCEPTION 'REQUEST_REFUSED' USING ERRCODE='22023'; END IF;
 IF address IS NULL OR address<>lower(address) OR address NOT LIKE '%.invalid' OR length(address)>320 THEN RAISE EXCEPTION 'DOMAIN_UNVERIFIED' USING ERRCODE='22023'; END IF;
 email_domain:=split_part(address,'@',2);
 IF NOT EXISTS(SELECT 1 FROM identity.verified_domain WHERE tenant_id=t AND connection_id=c AND verified_domain.domain=email_domain) THEN RAISE EXCEPTION 'DOMAIN_UNVERIFIED' USING ERRCODE='22023'; END IF;
 IF binding->>'protocol'='oidc' THEN
  IF EXISTS(SELECT 1 FROM identity.oidc_assertion_use WHERE tenant_id=t AND connection_id=c AND (assertion_id=claims->>'assertionId' OR request_id=r.request_id)) THEN RAISE EXCEPTION 'ASSERTION_REPLAY' USING ERRCODE='23505'; END IF;
 ELSE
 IF EXISTS(SELECT 1 FROM identity.sso_assertion_use WHERE assertion_id=(claims->>'assertionId')) THEN RAISE EXCEPTION 'ASSERTION_REPLAY' USING ERRCODE='23505'; END IF;
 END IF;
 SELECT * INTO sub FROM identity.sso_subject WHERE tenant_id=t AND connection_id=c AND subject_hash=sh;
 IF sub.user_id IS NOT NULL THEN
  IF sub.email_hash<>eh THEN RAISE EXCEPTION 'LINK_FORBIDDEN' USING ERRCODE='42501'; END IF;
  u:=sub.user_id; member:=sub.membership_id;
  IF NOT app.contractor_member_active(member) THEN RAISE EXCEPTION 'MEMBERSHIP_REVOKED' USING ERRCODE='42501'; END IF;
  -- Existing linked SSO identity cannot be replaced by a different account.
  IF r.link_session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM identity.session WHERE id=r.link_session_id AND user_id=u AND revoked_at IS NULL AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'LINK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE
  SELECT user_id INTO u FROM identity.user_email WHERE email=address;
  IF u IS NOT NULL THEN
   IF r.link_session_id IS NULL THEN RAISE EXCEPTION 'LINK_REQUIRED' USING ERRCODE='42501'; END IF;
   SELECT * INTO link FROM identity.session WHERE id=r.link_session_id AND user_id=u AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE;
   IF link.id IS NULL THEN RAISE EXCEPTION 'LINK_FORBIDDEN' USING ERRCODE='42501'; END IF;
   SELECT id INTO member FROM app.membership WHERE tenant_id=t AND identity_user_id=u AND app.contractor_member_active(id) FOR SHARE;
   IF member IS NULL THEN RAISE EXCEPTION 'LINK_FORBIDDEN' USING ERRCODE='42501'; END IF;
  ELSIF r.link_session_id IS NOT NULL THEN RAISE EXCEPTION 'LINK_FORBIDDEN' USING ERRCODE='42501';
  END IF;
 END IF;
 IF member IS NOT NULL THEN allow_new_grants:=(app.mon8_sso_feature_decision(member)->>'executable')::boolean; END IF;
 SELECT count(*) INTO grants_count FROM (SELECT DISTINCT ON(idp_group) * FROM identity.idp_group_role_mapping WHERE tenant_id=t AND connection_id=c ORDER BY idp_group,revision DESC) g
  WHERE enabled AND idp_group IN(SELECT jsonb_array_elements_text(claims->'groups'));
 IF sub.user_id IS NOT NULL THEN
  -- Revocation on a verified next sign-in is a committed fact even if no mapped group remains.
  UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id IN(SELECT session_id FROM identity.sso_session_binding WHERE tenant_id=t AND connection_id=c AND subject_hash=sh) AND revoked_at IS NULL;
  INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id) SELECT t,gen_random_uuid(),g.grant_id FROM identity.sso_grant g
   WHERE tenant_id=t AND connection_id=c AND subject_hash=sh AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation v WHERE v.tenant_id=t AND v.grant_id=g.grant_id)
   AND (allow_new_grants OR NOT EXISTS(
    SELECT 1 FROM app.role_grant old_grant JOIN (
     SELECT DISTINCT ON(idp_group) * FROM identity.idp_group_role_mapping WHERE tenant_id=t AND connection_id=c ORDER BY idp_group,revision DESC
    ) mapping ON mapping.role=old_grant.role AND mapping.scope_kind=old_grant.scope_kind AND mapping.scope_id=old_grant.scope_id
    WHERE old_grant.tenant_id=t AND old_grant.id=g.grant_id AND mapping.enabled
    AND mapping.idp_group IN(SELECT jsonb_array_elements_text(claims->'groups'))));
 END IF;
 IF grants_count=0 THEN
  IF binding->>'protocol'='oidc' THEN
   INSERT INTO identity.oidc_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,(claims->>'assertionId'),r.request_id);
  ELSE
   INSERT INTO identity.sso_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,(claims->>'assertionId'),r.request_id);
  END IF;
  RETURN jsonb_build_object('code','NO_MAPPED_GRANTS');
 END IF;
 IF expires<=clock_timestamp() OR expires>clock_timestamp()+interval '15 minutes' THEN RAISE EXCEPTION 'REQUEST_REFUSED' USING ERRCODE='22023'; END IF;
 -- DB uniqueness is inside the same transaction as identity, membership, grants and session.
 IF binding->>'protocol'='oidc' THEN
   INSERT INTO identity.oidc_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,(claims->>'assertionId'),r.request_id);
  ELSE
   INSERT INTO identity.sso_assertion_use(tenant_id,connection_id,assertion_id,request_id) VALUES(t,c,(claims->>'assertionId'),r.request_id);
  END IF;
 IF member IS NULL THEN
  u:=gen_random_uuid(); member:=gen_random_uuid();
  SELECT id INTO account FROM app.account WHERE tenant_id=t ORDER BY created_at,id LIMIT 1;
  INSERT INTO identity.identity_user(id) VALUES(u);
  INSERT INTO identity.user_email(email,user_id) VALUES(address,u);
  INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(member,t,account,u,'read_only');
  INSERT INTO app.contractor_member VALUES(t,member,NULL,address);
  INSERT INTO identity.membership_locator VALUES(u,t,member);
 END IF;
 IF sub.user_id IS NULL THEN IF NOT (app.mon8_sso_feature_decision(member)->>'executable')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF; allow_new_grants:=true; END IF;
 IF sub.user_id IS NULL THEN
  INSERT INTO identity.sso_subject(tenant_id,connection_id,subject_hash,email_hash,user_id,membership_id) VALUES(t,c,sh,eh,u,member);
 END IF;
 FOR group_row IN SELECT * FROM (SELECT DISTINCT ON(idp_group) * FROM identity.idp_group_role_mapping WHERE tenant_id=t AND connection_id=c ORDER BY idp_group,revision DESC) g
  WHERE enabled AND allow_new_grants AND idp_group IN(SELECT jsonb_array_elements_text(claims->'groups')) LOOP
  grant_id:=gen_random_uuid();
  INSERT INTO app.role_grant VALUES(t,grant_id,member,group_row.role,group_row.scope_kind,group_row.scope_id,NULL);
  INSERT INTO identity.sso_grant(tenant_id,connection_id,subject_hash,grant_id) VALUES(t,c,sh,grant_id);
 END LOOP;
 INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES(new_session,u,'synthetic_demo',token,csrf,expires);
 INSERT INTO identity.sso_session_binding(tenant_id,connection_id,subject_hash,session_id) VALUES(t,c,sh,new_session);
 INSERT INTO identity.security_event(id,event_type,subject_id) VALUES(gen_random_uuid(),'session.issued',new_session);
 RETURN jsonb_build_object('userId',u,'membershipId',member,'tenantId',t);
END $$;


-- Latest body: 0549; only the private SSO entitlement edge changes.
CREATE OR REPLACE FUNCTION identity.sso_admin_command(s char(64),p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c uuid; revision integer; actor uuid; BEGIN
 -- Same tenant lock as ENT-1: admin/revocation/mapping/sign-in serialize before the audit head.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 actor:=identity.sso_require_admin(s,t);
 IF NOT (app.mon8_sso_feature_decision(actor)->>'executable')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF (p->>'version')<>'sso-admin.v1' OR (p->>'requested_tenant_id') IS DISTINCT FROM t::text THEN RAISE EXCEPTION 'INVALID_SSO_INPUT' USING ERRCODE='22023'; END IF;
 IF (p->>'action')='connection.create' THEN
  IF ((p->'metadata')->>'tenantId') IS DISTINCT FROM t::text OR ((p->'metadata')->>'id') IS DISTINCT FROM (p->>'id') THEN RAISE EXCEPTION 'SSO_FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO identity.sso_connection(tenant_id,id,metadata) VALUES(t,(p->>'id')::uuid,(p->'metadata')); RETURN actor;
 END IF;
 c:=(p->>'connectionId')::uuid;
 PERFORM 1 FROM identity.sso_connection WHERE tenant_id=t AND id=c;
 IF NOT FOUND THEN RAISE EXCEPTION 'SSO_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF (p->>'action')='domain.verify' THEN
  IF (p->>'proof') IS DISTINCT FROM ('synthetic-domain:'||c::text||':'||(p->>'domain')) THEN RAISE EXCEPTION 'DOMAIN_UNVERIFIED' USING ERRCODE='22023'; END IF;
  INSERT INTO identity.verified_domain(tenant_id,connection_id,domain) VALUES(t,c,(p->>'domain'));
 ELSIF (p->>'action')='mapping.set' THEN
  SELECT coalesce(max(x.revision),0) INTO revision FROM identity.idp_group_role_mapping x WHERE tenant_id=t AND connection_id=c AND idp_group=(p->>'group');
  IF revision<>(p->>'expectedRevision')::integer THEN RAISE EXCEPTION 'STALE_MAPPING' USING ERRCODE='40001'; END IF;
  IF (((p->'scope')->>'kind')='tenant' AND ((p->'scope')->>'id') IS DISTINCT FROM t::text)
   OR (((p->'scope')->>'kind') IN('region','branch') AND NOT EXISTS(SELECT 1 FROM app.org_unit WHERE tenant_id=t AND id=((p->'scope')->>'id')::uuid AND kind=((p->'scope')->>'kind')))
   OR (((p->'scope')->>'kind')='team' AND NOT EXISTS(SELECT 1 FROM app.team WHERE tenant_id=t AND id=((p->'scope')->>'id')::uuid))
  THEN RAISE EXCEPTION 'SSO_FORBIDDEN' USING ERRCODE='42501'; END IF;
  INSERT INTO identity.idp_group_role_mapping(tenant_id,id,connection_id,idp_group,revision,role,scope_kind,scope_id,enabled)
   VALUES(t,gen_random_uuid(),c,(p->>'group'),revision+1,(p->>'role'),((p->'scope')->>'kind'),((p->'scope')->>'id')::uuid,(p->>'enabled')::boolean);
 ELSE RAISE EXCEPTION 'INVALID_SSO_INPUT' USING ERRCODE='22023'; END IF;
 RETURN actor;
END $$;

-- Latest body: 0549; only the private SSO entitlement edge changes.
CREATE OR REPLACE FUNCTION identity.sso_required_command(s char(64),p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; c uuid; scope jsonb; candidate uuid; BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SSO_ROUTE_BLOCKED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 actor:=identity.sso_require_admin(s,t);
 IF (p->>'required') IS DISTINCT FROM 'false' THEN IF NOT (app.mon8_sso_feature_decision(actor)->>'executable')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF; END IF;
 IF (p->>'version') IS DISTINCT FROM 'sso-required-command.v1' OR (p->>'requested_tenant_id') IS DISTINCT FROM t::text
  OR jsonb_typeof(p->'required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p->'expectedRevision') IS DISTINCT FROM 'number'
  OR (p->>'expectedRevision') !~ '^[0-9]+$' OR length(coalesce(p->>'reason','')) NOT BETWEEN 20 AND 500
  OR (p-ARRAY['version','requested_tenant_id','required','expectedRevision','reason'])<>'{}'::jsonb
 THEN RAISE EXCEPTION 'INVALID_SSO_REQUIRED_INPUT' USING ERRCODE='22023'; END IF;
 IF (p->>'required')::boolean THEN
  SELECT co.id INTO candidate FROM identity.sso_connection co WHERE co.tenant_id=t
   AND EXISTS(SELECT 1 FROM identity.verified_domain d WHERE d.tenant_id=t AND d.connection_id=co.id)
   AND EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(g.idp_group) g.enabled FROM identity.idp_group_role_mapping g WHERE g.tenant_id=t AND g.connection_id=co.id ORDER BY g.idp_group,g.revision DESC) latest WHERE latest.enabled)
   ORDER BY co.created_at,co.id LIMIT 1;
  IF candidate IS NULL THEN RAISE EXCEPTION 'SSO_REQUIRED_NO_CONNECTION' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT identity.sso_session_scope(se.id) INTO scope FROM identity.session se WHERE se.token_digest=s;
 IF scope IS NULL OR (scope->>'revoked')='true' OR (scope->>'tenantId') IS DISTINCT FROM t::text OR (scope->>'membershipId') IS DISTINCT FROM actor::text
 THEN RAISE EXCEPTION 'SSO_REQUIRED_NEEDS_SSO_SESSION' USING ERRCODE='42501'; END IF;
 c:=(scope->>'connectionId')::uuid;
 IF c IS NULL THEN RAISE EXCEPTION 'SSO_REQUIRED_NEEDS_SSO_SESSION' USING ERRCODE='42501'; END IF;
 IF (p->>'required')::boolean THEN
  -- The connection supporting this revision is the administrator's live binding, never caller input.
  IF NOT EXISTS(SELECT 1 FROM identity.verified_domain d WHERE d.tenant_id=t AND d.connection_id=c)
   OR NOT EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(g.idp_group) g.enabled FROM identity.idp_group_role_mapping g WHERE g.tenant_id=t AND g.connection_id=c ORDER BY g.idp_group,g.revision DESC) latest WHERE latest.enabled)
  THEN RAISE EXCEPTION 'SSO_REQUIRED_NO_CONNECTION' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM identity.membership_locator l JOIN app.membership m
    ON(m.tenant_id,m.id,m.identity_user_id)=(l.tenant_id,l.membership_id,l.user_id)
    WHERE l.tenant_id=t AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM identity.sso_subject sub WHERE sub.tenant_id=t AND sub.user_id=l.user_id AND sub.membership_id=l.membership_id))
  THEN RAISE EXCEPTION 'SSO_REQUIRED_UNLINKED_MEMBERS' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN identity.sso_required_append(t,c,actor,'admin',(p->>'required')::boolean,p->>'reason',(p->>'expectedRevision')::integer);
END $$;

-- Latest body: 0549; only the private SSO entitlement edge changes.
CREATE OR REPLACE FUNCTION identity.oidc_create(s char(64),p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c uuid:=(p->'config'->>'connectionId')::uuid; current_session identity.session; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF NOT (app.mon8_sso_feature_decision(identity.sso_require_admin(s,t))->>'executable')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO current_session FROM identity.session WHERE token_digest=s AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF current_session.id IS NULL THEN RAISE EXCEPTION 'SSO_FORBIDDEN'; END IF;
 PERFORM identity.oidc_link(t,current_session.id,current_session.user_id,s,current_session.csrf_token);
 IF p->>'version' IS DISTINCT FROM 'oidc-connection.v1' OR p->>'protocol' IS DISTINCT FROM 'oidc'
 OR p->'config'->>'tenantId' IS DISTINCT FROM t::text THEN RAISE EXCEPTION 'SSO_FORBIDDEN'; END IF;
 INSERT INTO identity.sso_connection(tenant_id,id,metadata) VALUES(t,c,p);RETURN c;
END $$;
CREATE OR REPLACE FUNCTION app.lp6d_client_view_authority(p_job uuid, p_request uuid, p_actor uuid, p_email text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
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

 -- Q14: decided links retain history; unused links require both current parties.
 IF EXISTS(SELECT 1 FROM app.extra_client_link k WHERE k.tenant_id=v_tenant
  AND k.job_id=p_job AND k.request_id=p_request AND k.approver_membership_id=p_actor
  AND NOT EXISTS(SELECT 1 FROM app.extra_client_link_closure c WHERE(c.tenant_id,c.link_id)=(k.tenant_id,k.id))
  AND NOT app.xc_link_current(k.id)) THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION app.lp6d_client_view_authority(uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6d_client_view_authority(uuid,uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

-- Latest body: packages/db/migrations/0686_extra_client_authority_loss.sql. The customer's link
-- use is the identity sign-in itself (no bound request yet), so like extra_customer_approval it
-- uses the private view-authority copy; xa_client_view_authority stays bound for request callers.
CREATE OR REPLACE FUNCTION identity.extra_customer_use(t uuid,j uuid,c uuid,digest text,session_digest text,operation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k app.extra_client_link; s app.extra_client_session; closed text; sid uuid:=gen_random_uuid();
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR operation IS NULL OR operation NOT IN('redeem','resolve','signout') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 -- Same order as approval/withdraw: shared tenant lock, then job lock, then audit.
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,417));
 IF operation='redeem' THEN
  SELECT l.* INTO k FROM app.extra_client_signin b JOIN app.extra_client_link l ON(l.tenant_id,l.id)=(b.tenant_id,b.link_id)
   WHERE b.tenant_id=t AND b.signin_digest=digest;
 ELSE
  SELECT * INTO s FROM app.extra_client_session WHERE tenant_id=t AND token_digest=digest;
  SELECT * INTO k FROM app.extra_client_link WHERE tenant_id=t AND id=s.link_id;
 END IF;
 -- No match delegates to the unchanged customer sign-in implementation.
 IF k.id IS NULL THEN RETURN NULL; END IF;
 IF k.job_id<>j OR k.approver_membership_id<>c THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF NOT app.xc_link_current(k.id) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM app.lp6d_client_view_authority(j,k.request_id,c,k.recipient);
 PERFORM app.mon8_require_feature(c,'approval_chains');
 SELECT kind INTO closed FROM app.extra_client_link_closure WHERE tenant_id=t AND link_id=k.id;
 IF closed IN('revoked','replaced') THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF operation='redeem' THEN
  IF closed IS NOT NULL OR clock_timestamp()>=k.expires_at OR session_digest IS NULL OR session_digest !~ '^[a-f0-9]{64}$'
   OR EXISTS(SELECT 1 FROM app.extra_client_session WHERE tenant_id=t AND link_id=k.id) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  INSERT INTO app.extra_client_session(tenant_id,id,link_id,token_digest,expires_at) VALUES(t,sid,k.id,session_digest,clock_timestamp()+interval '1 hour');
  PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||c::text,j,'contractor.extra.client_signed_in',jsonb_build_object('sessionId',sid,'linkId',k.id));
 ELSE
  IF s.id IS NULL OR s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  IF operation='signout' THEN
   UPDATE app.extra_client_session SET revoked_at=clock_timestamp() WHERE tenant_id=t AND id=s.id;
   PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||c::text,j,'contractor.extra.client_signed_out',jsonb_build_object('sessionId',s.id));
  END IF;
 END IF;
 RETURN jsonb_build_object('version','customer-session.v1','jobId',j,'customerId',c,'extraApprover',true);
END $$;

CREATE OR REPLACE FUNCTION identity.extra_customer_approval(t uuid,j uuid,c uuid,digest text,input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s app.extra_client_session; k app.extra_client_link; q app.extra_approval_request; result jsonb; content jsonb; legacy jsonb; claim jsonb; prior record; items jsonb:='[]';
BEGIN
 IF identity.extra_customer_use(t,j,c,digest,NULL,'resolve') IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM app.extra_client_session WHERE tenant_id=t AND token_digest=digest;
 SELECT * INTO k FROM app.extra_client_link WHERE tenant_id=t AND id=s.link_id;
 IF input->>'version' IS DISTINCT FROM 'extra-customer.v1' OR input->>'jobId' IS DISTINCT FROM j::text
  OR input->>'action' IS NULL OR input->>'action' NOT IN('queue','view','decide','history')
  OR (input-ARRAY['version','jobId','action','requestId','commandId','revisionHash','netPence','decision'])<>'{}'::jsonb THEN
  RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF input->>'action'='history' THEN
  FOR prior IN SELECT f.request_id,f.approved_hash,f.approved_net_pence,f.server_recorded_at FROM app.extra_approval_step_fact f
   WHERE f.tenant_id=t AND f.job_id=j AND f.actor_membership_id=c AND f.actor_kind='client_approver' LOOP
   -- Read authority remains current for each returned request, never the sponsor's.
   PERFORM app.lp6d_client_view_authority(j,prior.request_id,c,k.recipient);
   items:=items||jsonb_build_array(jsonb_build_object('requestId',prior.request_id,'revisionHash',prior.approved_hash,'netPence',prior.approved_net_pence,'decision','approve','recordedAt',prior.server_recorded_at));
  END LOOP;
  FOR prior IN SELECT o.request_id,o.kind,o.server_recorded_at FROM app.extra_approval_outcome o
   WHERE o.tenant_id=t AND o.job_id=j AND o.actor_membership_id=c AND o.actor_kind='client_approver' AND o.kind='rejected' LOOP
   PERFORM app.lp6d_client_view_authority(j,prior.request_id,c,k.recipient);
   items:=items||jsonb_build_array(jsonb_build_object('requestId',prior.request_id,'decision','reject','recordedAt',prior.server_recorded_at));
  END LOOP;
  RETURN jsonb_build_object('items',items);
 END IF;
 IF input->>'action'<>'queue' AND input->>'requestId' IS DISTINCT FROM k.request_id::text THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO q FROM app.extra_approval_request WHERE tenant_id=t AND id=k.request_id AND job_id=j;
 -- Retry uses the same semantic input and current authority even after consumption.
 IF input->>'action'='decide' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(input))<>8 OR input->>'decision' IS NULL OR input->>'decision' NOT IN('approve','reject')
   OR input->>'revisionHash' IS NULL OR input->>'revisionHash' !~ '^[a-f0-9]{64}$' OR (input->>'netPence')::bigint NOT BETWEEN 1 AND 1000000000000 THEN
   RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  PERFORM app.lp6_bind_client_approver(t,j,c,k.token_hash,k.recipient);
  content:=jsonb_build_object('jobId',j,'requestId',q.id,'token',k.token_hash,'email',lower(k.recipient),'hash',input->>'revisionHash','net',(input->>'netPence')::bigint,
   'decision',input->>'decision','reason',CASE WHEN input->>'decision'='reject' THEN 'not_agreed' ELSE NULL END,'role','Named fictional client approver','tester','customer-session:'||s.id::text);
  legacy:=jsonb_build_object('type','ClientDecideExtra','actor',c,'content',content);
  INSERT INTO app.extra_client_command_session VALUES(t,(input->>'commandId')::uuid,s.id) ON CONFLICT DO NOTHING;
  claim:=app.begin_command('repository-command.v1',(input->>'commandId')::uuid,'ClientDecideExtra','extra-client-decide:'||q.id::text||':'||(input->>'commandId'),
   jsonb_build_object('tenantId',t,'actorMembershipId',c,'subjectType','job','subjectRef',j),'{}',
   jsonb_build_object('version','repository-command.v1','actorMembershipId',c,'input',legacy,'legacyJson',app.final_lock_canonical(legacy)));
  IF claim->>'kind'='replay' THEN RETURN claim->'result'; END IF;
  result:=app.xa_client_decide(j,q.id,(input->>'commandId')::uuid,c,k.token_hash,k.recipient,input->>'revisionHash',(input->>'netPence')::bigint,
   input->>'decision'='reject',CASE WHEN input->>'decision'='reject' THEN 'not_agreed' ELSE NULL END,'Named fictional client approver','customer-session:'||s.id::text);
  PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||c::text,j,'contractor.extra.client_decided',jsonb_build_object('commandId',input->>'commandId','requestId',q.id,'sessionId',s.id));
  result:=app.complete_command((input->>'commandId')::uuid,'{}');
  -- Run both invoker checks as this function's owner, before the identity login commits.
  -- Leave unrelated deferred constraints in the caller's transaction unchanged.
  SET CONSTRAINTS app.decision_check_complete, app.extra_event_raised_audit IMMEDIATE;
  RETURN result;
 END IF;
 IF EXISTS(SELECT 1 FROM app.extra_client_link_closure WHERE tenant_id=t AND link_id=k.id) THEN
  IF input->>'action'='queue' THEN RETURN jsonb_build_object('items','[]'::jsonb); END IF;
  RAISE EXCEPTION 'LINK_REPLAYED' USING ERRCODE='23514';
 END IF;
 IF clock_timestamp()>=k.expires_at THEN RAISE EXCEPTION 'LINK_EXPIRED' USING ERRCODE='23514'; END IF;
 IF q.request_revision<>(SELECT max(request_revision) FROM app.extra_approval_request WHERE tenant_id=t AND variation_id=q.variation_id) THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM app.extra_approval_outcome WHERE tenant_id=t AND request_id=q.id) THEN RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE='23514'; END IF;
 result:=jsonb_build_object('requestId',q.id,'revision',q.request_revision,'revisionHash',q.revision_hash,'netPence',q.net_pence,'lane','mandatory',
  'description',(SELECT description FROM app.variation WHERE tenant_id=t AND id=q.variation_id),
  'timingInputs',app.xc_timing(t,j,q.variation_id,q.id));
 RETURN CASE WHEN input->>'action'='queue' THEN jsonb_build_object('items',jsonb_build_array(result)) ELSE result END;
END $$;
-- Preserve LP-6c customer delegation through private, credential-scoped ports.
CREATE FUNCTION app.lp6d_customer_watchdog_live(p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
DECLARE tenant uuid; lifecycle text;
BEGIN
  tenant := nullif(current_setting('app.tenant_id', true), '')::uuid;
  IF tenant IS NULL THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
  SELECT status INTO lifecycle FROM app.job WHERE tenant_id=tenant AND id=p_job FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF lifecycle <> 'live' THEN RAISE EXCEPTION 'JOB_NOT_LIVE' USING ERRCODE='P0001'; END IF;
END;
$$;
CREATE FUNCTION app.lp6d_customer_message_source(t uuid,j uuid,digest text,source text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF source IS DISTINCT FROM 'customer_message' OR digest IS NULL
  OR digest !~ '^customer:[a-f0-9-]{36}:[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 PERFORM app.lp6_bind_customer_portal(t,j,split_part(digest,':',2)::uuid,split_part(digest,':',3));
DECLARE actor uuid; cid uuid; request_digest text; prior app.command_receipt; allowed text[]; txt text; raw bytea; h text;
 sid uuid:=gen_random_uuid(); ev uuid:=gen_random_uuid(); ver text:=gen_random_uuid()::text; audit_id uuid:=gen_random_uuid();
 lp5_claim jsonb; lp5_input jsonb;
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
 BEGIN actor:=app.sv7a_require_source_owner(t,j,digest,source); EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
 -- Evidence registration holds SHARE on the job, matching the merged watchdog live guard.
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtextextended('watchdog-command-id:'||t::text||':'||cid::text,0));
 BEGIN actor:=app.sv7a_require_source_owner(t,j,digest,source); EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
 lp5_input:=jsonb_build_object('jobId',j,'actor',actor,'sessionDigest',digest,'source',source,'input',input);
 request_digest:=app.final_lock_hash(jsonb_build_object('jobId',j,'actor',actor,'sessionDigest',digest,'source',source,'input',input));
 IF EXISTS(SELECT 1 FROM app.watchdog_command_identity WHERE tenant_id=t AND command_id=cid AND (job_id<>j OR command_type<>ctype OR request_hash<>request_digest))
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
 BEGIN
  lp5_claim:=app.begin_command('repository-command.v1',cid,ctype,cid::text,
   jsonb_build_object('tenantId',t,'actorMembershipId',actor,'subjectType','job','subjectRef',j),'{}'::jsonb,
   jsonb_build_object('version','repository-command.v1','actorMembershipId',actor,'input',lp5_input,'legacyJson',app.final_lock_canonical(lp5_input)));
 EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501';
 WHEN unique_violation THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END;
  RETURN (lp5_claim->'result');
 END IF;
 -- New writes only below. Holds precede every effect.
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 PERFORM app.lp6d_customer_watchdog_live(j);
 IF source='diary' AND (input->>'onSite')::boolean THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
  PERFORM app.ch4_require_open(t,j);
  IF EXISTS(SELECT 1 FROM app.job x WHERE x.tenant_id=t AND x.id=j AND x.practice_session_digest IS NULL) THEN PERFORM app.ch4_admit_place(t,j,'restart'); END IF;
 END IF;
 IF app.ch4_legacy_command_owned(t,cid) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 BEGIN
  lp5_claim:=app.begin_command('repository-command.v1',cid,ctype,cid::text,
   jsonb_build_object('tenantId',t,'actorMembershipId',actor,'subjectType','job','subjectRef',j),'{}'::jsonb,
   jsonb_build_object('version','repository-command.v1','actorMembershipId',actor,'input',lp5_input,'legacyJson',app.final_lock_canonical(lp5_input)));
 EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501';
 WHEN unique_violation THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END;
 IF (lp5_claim->>'kind')='replay' THEN RETURN (lp5_claim->'result'); END IF;
 INSERT INTO app.watchdog_command_identity(tenant_id,command_id,job_id,command_type,request_hash) VALUES(t,cid,j,ctype,request_digest);
 at_time:=clock_timestamp(); raw:=convert_to(txt,'UTF8'); h:=encode(pg_catalog.sha256(raw),'hex'); okey:='synthetic/job-sources/'||sid::text;
 -- Only the reviewed fictional originals carry a decoder reference; exact text and kind, chosen by the server.
 ref:=CASE WHEN source='diary' AND txt='Fitted outside tap.' THEN 'job-source:outside-tap.v1' WHEN source='customer_message' AND txt='Please fit an outside tap.' THEN 'job-source:request-tap.v1' WHEN source='customer_message' AND txt='There are exposed live wires beside the new socket.' THEN 'customer-message:exposed-wires.synthetic.v1' END;
 INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_received_at,server_verified_at)
 VALUES(ev,t,j,okey,h,'text/plain; charset=utf-8',32000,'standard_evidence',at_time+interval '1 day','verified',ver,at_time,clock_timestamp());
 INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
 VALUES(ev,t,ev,j,'original',CASE WHEN source='diary' THEN 'job_diary_text' ELSE 'customer_message_text' END,okey,ver,h,octet_length(raw),'text/plain; charset=utf-8','standard_evidence',at_time,clock_timestamp());
 INSERT INTO app.job_source_original(tenant_id,job_id,evidence_id,source_kind,source_id,object_key,object_version_id,bytes,sha256,byte_length,source_received_at,verified_at,synthetic_fixture_ref)
 VALUES(t,j,ev,source,sid,okey,ver,raw,h,octet_length(raw),at_time,clock_timestamp(),ref);
 IF source='diary' THEN
  INSERT INTO app.job_diary_entry(tenant_id,job_id,id,command_id,actor_membership_id,entry_mode,on_site,evidence_id,object_version_id,sha256,source_received_at)
  VALUES(t,j,sid,cid,actor,input->>'entryMode',(input->>'onSite')::boolean,ev,ver,h,at_time);
 ELSE
  INSERT INTO app.customer_message_source(tenant_id,job_id,id,command_id,actor_membership_id,fictional_role_name,evidence_id,object_version_id,sha256,source_received_at)
  VALUES(t,j,sid,cid,actor,input->'fictionalCustomer'->>'name',ev,ver,h,at_time);
 END IF;
 rec_json:=jsonb_build_object('id',sid,'commandId',cid,'text',txt,'actualTesterMembershipId',actor,
  'evidence',jsonb_build_object('id',ev,'objectVersionId',ver,'sha256',h,'serverReceivedAt',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
  ||CASE WHEN source='diary' THEN jsonb_build_object('entryMode',input->>'entryMode','onSite',(input->>'onSite')::boolean)
   ELSE jsonb_build_object('fictionalCustomer',jsonb_build_object('kind','named_fictional_customer','name',input->'fictionalCustomer'->>'name')) END;
 out_result:=jsonb_build_object('version','job-source-intake-receipt.v1','jobId',j,'sourceKind',source,'record',rec_json,'environment','synthetic_demo','realExternalActions',0)
  ||CASE WHEN source='diary' THEN jsonb_build_object('notice','Notes are for your records. To bill for extra work, use Log an extra. JobGuard checks your records against your final bill after you complete it.','noticeVersion','job-diary-notice.v1') ELSE '{}'::jsonb END;
 PERFORM app.lp5_bind_effect(cid,NULL,'source_intake',jsonb_build_object('result',out_result));
 -- Identifiers and hashes only in the audit chain; never the note text.
 -- Same per-tenant chain as other lock/check events; this helper takes any event type (append_final_lock_audit allows only four).
 PERFORM app.append_final_check_audit(audit_id,'membership:'||actor::text,j,CASE WHEN source='diary' THEN 'job_source.diary_recorded' ELSE 'job_source.customer_message_recorded' END,
  jsonb_build_object('commandId',cid,'sourceId',sid,'evidenceId',ev,'sha256',h));
 BEGIN out_result:=app.complete_command(cid,'{}'::jsonb);
 EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
 BEGIN PERFORM app.sv7a_require_source_owner(t,j,digest,source); EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
 RETURN out_result;
END;
END
$$;
CREATE OR REPLACE FUNCTION identity.customer_portal_message(t uuid,j uuid,c uuid,digest text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; sid uuid; existed boolean;
BEGIN
 -- Resolve before looking at command history. Same advisory lock as sign-in/revoke,
 -- retained through the writer, so revoke/rebind cannot race a stale successful write.
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 PERFORM app.lp6_bind_customer_portal(t,j,c,digest);
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR input->>'version' IS DISTINCT FROM 'customer-portal-message.v1'
  OR (SELECT count(*) FROM jsonb_object_keys(input))<>4
  OR NOT input ?& ARRAY['version','jobId','commandId','text'] OR input->>'jobId' IS DISTINCT FROM j::text
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT id INTO sid FROM app.customer_portal_session WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest;
 SELECT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=t AND command_id=(input->>'commandId')::uuid) INTO existed;
 result:=app.lp6d_customer_message_source(t,j,'customer:'||c::text||':'||digest,'customer_message',
  jsonb_build_object('version','customer-message-input.v1','commandId',input->>'commandId','text',input->'text',
   'fictionalCustomer',jsonb_build_object('kind','named_fictional_customer','name','Fictional customer')));
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 IF NOT existed THEN
  PERFORM app.append_final_check_audit(gen_random_uuid(),'customer-session:'||sid::text,j,'customer_portal.message_recorded',
   jsonb_build_object('commandId',input->>'commandId','customerId',c,'sessionId',sid,'sourceId',result->'record'->>'id'));
 END IF;
 -- Builder storage/receipts retain the sponsor; redact only the customer result,
 -- including authorized replays of the original stored receipt.
 -- No signal access, counts, detector scheduling or inferred approval/price in this path.
 SET CONSTRAINTS ALL IMMEDIATE;
 RETURN result #- '{record,actualTesterMembershipId}';
END $$;
ALTER FUNCTION app.lp6d_customer_watchdog_live(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6d_customer_watchdog_live(uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
ALTER FUNCTION app.lp6d_customer_message_source(uuid,uuid,text,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6d_customer_message_source(uuid,uuid,text,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolcanlogin AND NOT rolsuper LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION app.lp6d_customer_watchdog_live(uuid), app.lp6d_customer_message_source(uuid,uuid,text,text,jsonb), app.lp6d_require_revoke_claim(uuid,uuid,uuid,uuid,uuid,uuid,integer) FROM %I',r.rolname);
 END LOOP;
END $$;

COMMIT;
