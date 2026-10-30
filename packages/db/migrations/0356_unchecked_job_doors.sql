BEGIN;
-- LP-2 contract step. Prepared rollout observations are not permission to deploy.
-- No existing business row or column is rewritten. Permits are private and consumed in this transaction.
CREATE TABLE app.lp_job_insert_permit (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), job_id uuid NOT NULL,
 backend_pid integer NOT NULL, transaction_id xid8 NOT NULL,
 operation text NOT NULL CHECK(operation IN('adoption','work_order','practice_home','practice_sandbox')),
 insert_shape jsonb NOT NULL CHECK(jsonb_typeof(insert_shape)='object'),
 actor_membership_id uuid NOT NULL, command_id uuid, authorization_id uuid,
 PRIMARY KEY(backend_pid,transaction_id,tenant_id,job_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id),
 CHECK((operation='adoption')=(command_id IS NOT NULL AND authorization_id IS NOT NULL)),
 CHECK(operation='adoption' OR (command_id IS NULL AND authorization_id IS NULL))
);
ALTER TABLE app.lp_job_insert_permit OWNER TO jobguard_migration;
ALTER TABLE app.lp_job_insert_permit ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.lp_job_insert_permit FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.lp_job_insert_permit FOR ALL TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.lp_job_insert_permit FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

CREATE FUNCTION app.lp_job_insert_shape(p_job app.job) RETURNS jsonb
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(
  'tenant_id',p_job.tenant_id,
  'id',p_job.id,
  'title',p_job.title,
  'status',p_job.status,
  'revision',p_job.revision,
  'provenance',p_job.provenance,
  'accepted_quote_version_id',p_job.accepted_quote_version_id,
  'baseline_quote_version_id',p_job.baseline_quote_version_id,
  'accepted_net_value_pence',p_job.accepted_net_value_pence,
  'fee_policy_version',p_job.fee_policy_version,
  'recovery_cap_pence',p_job.recovery_cap_pence,
  'practice_session_digest',p_job.practice_session_digest,
  'practice_scenario',p_job.practice_scenario)
$$;
ALTER FUNCTION app.lp_job_insert_shape(app.job) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp_job_insert_shape(app.job) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

CREATE FUNCTION app.lp_job_permit_consumed() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.lp_job_insert_permit p WHERE
   (p.backend_pid,p.transaction_id,p.tenant_id,p.job_id)=(NEW.backend_pid,NEW.transaction_id,NEW.tenant_id,NEW.job_id))
 THEN RAISE EXCEPTION 'JOB_INSERT_PERMIT_UNCONSUMED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.lp_job_permit_consumed() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp_job_permit_consumed() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE CONSTRAINT TRIGGER lp_job_permit_consumed AFTER INSERT ON app.lp_job_insert_permit
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.lp_job_permit_consumed();

-- This INVOKER guard preserves explicitly owner-connected ordinary fixtures. Runtime cannot assume that role.
-- Imported/work-order/home/sandbox inserts require the separate permit guard even under shared ownership.
CREATE FUNCTION app.lp_ordinary_job_initial_shape() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.provenance='system_generated_quote'
  AND NOT coalesce(NEW.practice_scenario IN('home','core-1000'),false)
  AND (NEW.status IS DISTINCT FROM 'draft' OR NEW.revision IS DISTINCT FROM 0
   OR NEW.accepted_quote_version_id IS NOT NULL OR NEW.baseline_quote_version_id IS NOT NULL
   OR NEW.accepted_net_value_pence IS NOT NULL OR NEW.fee_policy_version IS NOT NULL OR NEW.recovery_cap_pence IS NOT NULL)
  AND current_user<>'jobguard_migration' AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper)
 THEN RAISE EXCEPTION 'JOB_INITIAL_SHAPE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.lp_ordinary_job_initial_shape() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp_ordinary_job_initial_shape() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER aaa_lp_ordinary_job_initial_shape BEFORE INSERT ON app.job
 FOR EACH ROW EXECUTE FUNCTION app.lp_ordinary_job_initial_shape();

CREATE OR REPLACE FUNCTION app.guard_imported_job() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE expected_operation text;
BEGIN
 expected_operation:=CASE NEW.provenance WHEN 'imported' THEN 'adoption' WHEN 'work_order' THEN 'work_order'
  ELSE CASE NEW.practice_scenario WHEN 'home' THEN 'practice_home' WHEN 'core-1000' THEN 'practice_sandbox' END END;
 IF expected_operation IS NULL THEN RETURN NEW; END IF;
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'JOB_INSERT_PERMIT_REQUIRED' USING ERRCODE='42501'; END IF;
 DELETE FROM app.lp_job_insert_permit p WHERE
  (p.backend_pid,p.transaction_id,p.tenant_id,p.job_id)=(pg_backend_pid(),pg_current_xact_id(),NEW.tenant_id,NEW.id)
  AND p.operation=expected_operation AND p.insert_shape=app.lp_job_insert_shape(NEW);
 IF NOT FOUND THEN RAISE EXCEPTION 'JOB_INSERT_PERMIT_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_imported_job() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_imported_job() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

CREATE OR REPLACE FUNCTION app.adopt_in_flight_job(p_tenant uuid,p_job uuid,p_baseline uuid,p_title varchar,p_lifecycle varchar,p_hash char(64),p_description varchar,p_net bigint,p_cap bigint,p_policy varchar,p_terms varchar,p_actor uuid,p_attested timestamptz,p_customer uuid,p_site uuid,p_payer uuid,p_command uuid,p_authorization uuid)
RETURNS app.imported_job_baseline LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE b app.imported_job_baseline; c app.customer_revision; s app.site_revision; p app.customer_revision; binding uuid:=gen_random_uuid();
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';END IF;
 -- Controlled write: the actor must be a current owner and the exact adoption must carry a processing command and an
 -- unexpired, unrevoked, approved authorization bound to this job, actor, content hash, amount and terms.
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
 OR NOT EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=p_tenant AND r.command_id=p_command AND r.actor_membership_id=p_actor AND r.command_type='job.adopt_in_flight' AND r.semantic_key='import:'||p_job::text AND r.status='processing')
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.action_authorization a JOIN app.decision d ON(d.tenant_id,d.id)=(a.tenant_id,a.decision_id) JOIN app.decision_resolution x ON(x.tenant_id,x.id)=(a.tenant_id,a.resolution_id)
   WHERE a.tenant_id=p_tenant AND a.id=p_authorization AND a.actor_membership_id=p_actor AND x.actor_membership_id=p_actor AND x.resolution='approved'
   AND d.subject_type='job' AND d.subject_ref=p_job::text AND d.action_type='job.adopt_in_flight' AND a.action_type='job.adopt_in_flight' AND a.recipient IS NULL AND a.content_hash=p_hash AND a.aggregate_revision=0
   AND a.amount_pence=p_net AND a.currency='GBP' AND a.policy_version=p_terms AND a.expires_at>clock_timestamp() AND a.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 IF p_lifecycle NOT IN('live','invoiced') OR p_net<0 OR p_cap<>app.reference_recovery_cap(p_net) OR p_policy<>'reference_fee_policy_v1' OR p_terms<>'synthetic_import_terms_candidate.v1' OR p_attested>clock_timestamp() THEN RAISE EXCEPTION 'invalid imported terms' USING ERRCODE='22023';END IF;
 SELECT * INTO c FROM app.customer_revision WHERE tenant_id=p_tenant AND id=p_customer;
 SELECT * INTO s FROM app.site_revision WHERE tenant_id=p_tenant AND id=p_site;
 SELECT * INTO p FROM app.customer_revision WHERE tenant_id=p_tenant AND id=coalesce(p_payer,p_customer);
 IF c.id IS NULL OR s.id IS NULL OR p.id IS NULL THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 INSERT INTO app.lp_job_insert_permit(tenant_id,job_id,backend_pid,transaction_id,operation,insert_shape,actor_membership_id,command_id,authorization_id)
 VALUES(p_tenant,p_job,pg_backend_pid(),pg_current_xact_id(),'adoption',
  app.lp_job_insert_shape(jsonb_populate_record(NULL::app.job,jsonb_build_object('tenant_id',p_tenant,'id',p_job,'title',p_title,
   'status','draft','revision',1,'provenance','imported','accepted_net_value_pence',p_net,'fee_policy_version',p_policy,'recovery_cap_pence',p_cap))),
  p_actor,p_command,p_authorization);
 INSERT INTO app.job(id,tenant_id,title,status,revision,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence)
 VALUES(p_job,p_tenant,p_title,'draft',1,'imported',p_net,p_policy,p_cap);
 INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance)
 VALUES(p_tenant,binding,p_job,1,c.customer_id,c.id,p.customer_id,p.id,s.site_id,s.id,'entered');
 INSERT INTO app.job_party_current(tenant_id,job_id,binding_id) VALUES(p_tenant,p_job,binding);
 UPDATE app.job SET status=p_lifecycle WHERE tenant_id=p_tenant AND id=p_job;
 INSERT INTO app.imported_job_baseline(id,tenant_id,job_id,provenance,lineage_strength,baseline_hash,baseline_description,accepted_value_source,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,import_terms_version,attested_by_membership_id,attested_at)
 VALUES(p_baseline,p_tenant,p_job,'imported','builder_attested_weaker',p_hash,p_description,'builder_attestation',p_net,'GBP',p_cap,p_policy,p_terms,p_actor,p_attested) RETURNING * INTO b;
 RETURN b;
END $$;
REVOKE EXECUTE ON FUNCTION app.adopt_in_flight_job(uuid,uuid,uuid,varchar,varchar,character,varchar,bigint,bigint,varchar,varchar,uuid,timestamptz) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

CREATE OR REPLACE FUNCTION app.work_order_begin(actor uuid, p_job uuid, p_title text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
END $$;

CREATE OR REPLACE FUNCTION app.issue_practice_session(digest text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog AS $$
DECLARE j uuid; item record; t uuid:='11111111-1111-4111-8111-111111111111';
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF digest IS NULL OR digest !~ '^[0-9a-f]{64}$' OR NOT EXISTS(
  SELECT 1 FROM app.membership m WHERE m.tenant_id='11111111-1111-4111-8111-111111111111'::uuid
   AND m.id='d1500000-0000-4000-8000-000000000003'::uuid AND m.identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid
   AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 ) THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
 INSERT INTO control_plane.practice_session(token_digest) VALUES(digest);
 PERFORM set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
 FOR item IN SELECT * FROM (VALUES('Practice kitchen','quoting'),('Kitchen extension','live'),('Loft conversion','quoting')) AS recipe(title,status) LOOP
  j:=gen_random_uuid();
  INSERT INTO app.lp_job_insert_permit(tenant_id,job_id,backend_pid,transaction_id,operation,insert_shape,actor_membership_id)
  VALUES(t,j,pg_backend_pid(),pg_current_xact_id(),'practice_home',
   app.lp_job_insert_shape(jsonb_populate_record(NULL::app.job,jsonb_build_object('tenant_id',t,'id',j,'title',item.title,
    'status',item.status,'revision',0,'provenance','system_generated_quote','practice_session_digest',digest,'practice_scenario','home'))),
   'd1500000-0000-4000-8000-000000000003');
  INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario) VALUES(j,t,item.title,item.status,digest,'home');
 END LOOP;
END $$;

-- Only the existing sandbox recipe is expressible; digest and actor are verified against persisted session/membership.
CREATE FUNCTION app.create_practice_sandbox_job(p_tenant uuid,p_job uuid,p_actor uuid,p_digest text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
END $$;
ALTER FUNCTION app.create_practice_sandbox_job(uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.create_practice_sandbox_job(uuid,uuid,uuid,text) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.create_practice_sandbox_job(uuid,uuid,uuid,text) TO jobguard_runtime;

-- Decision 74/75 build only: temporary actor-less practice routes gain the database restriction.
-- This does not supply actor/receipt binding or close the whole LP track.
CREATE OR REPLACE FUNCTION app.configure_recovery_demo(p_job uuid,p_command uuid,p_scenario varchar) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;c uuid:=gen_random_uuid();r uuid:=gen_random_uuid();e uuid:=gen_random_uuid();u uuid:=gen_random_uuid();ea uuid:=gen_random_uuid();la uuid:=gen_random_uuid();
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL OR p_scenario NOT IN('missing_evidence','pending_money','manual_receipt','unapproved_eligibility','prevented','eligible') THEN RAISE EXCEPTION 'invalid synthetic scenario' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM app.job_activation WHERE tenant_id=t AND job_id=p_job AND mode='synthetic_demo' AND fee_policy_version='reference_fee_policy_v1';IF NOT FOUND THEN RAISE EXCEPTION 'synthetic live job required' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM app.recovery_demo_selection WHERE tenant_id=t AND command_id=p_command) THEN RETURN p_command;END IF;
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
END$$;

CREATE OR REPLACE FUNCTION app.approve_synthetic_landing(p jsonb)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
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
 IF gross<=0 OR eligible<=0 OR (SELECT COALESCE(sum(gross_pence),0) FROM app.landing_allocation WHERE tenant_id=t AND receipt_id=r.id)+gross>r.gross_pence OR c.approved_landed+eligible>c.claim_pence-c.written_off THEN RAISE EXCEPTION 'allocation exceeds available receipt or claim' USING ERRCODE='23514';END IF;
 INSERT INTO app.landing_allocation VALUES(l,t,c.job_id,c.id,r.id,e.id,(p->>'eligibilityApprovalId')::uuid,(p->>'landingApprovalId')::uuid,gross,eligible,'GBP','reference_fee_policy_v1',DEFAULT);
 SELECT COALESCE(sum(x.eligible_net_pence),0),COALESCE((SELECT sum(y.eligible_net_pence)FROM app.landing_reversal y WHERE y.tenant_id=t AND y.job_id=c.job_id),0)INTO landed,reversed FROM app.landing_allocation x WHERE x.tenant_id=t AND x.job_id=c.job_id;
 landed:=landed-reversed;SELECT recovery_cap_pence INTO cap FROM app.cap_snapshot WHERE tenant_id=t AND job_id=c.job_id AND fee_policy_version='reference_fee_policy_v1';
 IF cap IS NULL OR (SELECT mode FROM app.job_activation WHERE tenant_id=t AND job_id=c.job_id)<>'synthetic_demo' THEN RAISE EXCEPTION 'production and pilot fee posting disabled' USING ERRCODE='0A000';END IF;
 fee:=least(app.half_even_ratio(landed,1,10),cap);credit:=least(CASE WHEN EXISTS(SELECT 1 FROM app.simulated_settlement_event s JOIN app.synthetic_obligation o ON(o.tenant_id,o.id)=(s.tenant_id,s.obligation_id)WHERE s.tenant_id=t AND o.job_id=c.job_id)THEN 7900 ELSE 0 END,fee);liability:=fee-credit;
 SELECT COALESCE(sum(CASE kind WHEN'fee_obligation'THEN amount_pence ELSE -amount_pence END),0)INTO prior FROM app.recovery_fee_journal WHERE tenant_id=t AND job_id=c.job_id;delta:=liability-prior;
 INSERT INTO app.recovery_fee_derivation VALUES(d,t,c.job_id,l,NULL,'reference_fee_policy_v1',landed,cap,fee,credit,liability,delta,DEFAULT);
 IF delta>0 THEN INSERT INTO app.recovery_fee_journal VALUES(j,t,c.job_id,d,'fee_obligation',delta,'GBP','recovery_fee_receivable','recovery_fee_deferred',NULL,DEFAULT);END IF;
 RETURN d;
END$$;

CREATE OR REPLACE FUNCTION app.reverse_synthetic_landing(p_tenant uuid,p_reversal uuid,p_derivation uuid,p_journal uuid,p_allocation uuid,p_amount bigint,p_reason varchar)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;x app.landing_allocation;landed bigint;cap bigint;fee bigint;credit bigint;liability bigint;prior bigint;delta bigint;original uuid;
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF; IF t IS DISTINCT FROM p_tenant THEN RAISE EXCEPTION 'tenant mismatch' USING ERRCODE='42501';END IF;SELECT*INTO x FROM app.landing_allocation WHERE tenant_id=t AND id=p_allocation FOR UPDATE;PERFORM 1 FROM app.job WHERE tenant_id=t AND id=x.job_id FOR UPDATE;
 IF x.id IS NULL OR p_amount<=0 OR p_amount>x.eligible_net_pence OR EXISTS(SELECT 1 FROM app.landing_reversal WHERE tenant_id=t AND allocation_id=x.id)THEN RAISE EXCEPTION 'invalid reversal' USING ERRCODE='23514';END IF;
 INSERT INTO app.landing_reversal VALUES(p_reversal,t,x.job_id,x.id,p_amount,p_reason,DEFAULT);SELECT COALESCE(sum(eligible_net_pence),0)INTO landed FROM app.landing_allocation WHERE tenant_id=t AND job_id=x.job_id;landed:=landed-p_amount;SELECT recovery_cap_pence INTO cap FROM app.cap_snapshot WHERE tenant_id=t AND job_id=x.job_id;fee:=least(app.half_even_ratio(landed,1,10),cap);credit:=least(7900,fee);liability:=fee-credit;SELECT COALESCE(sum(CASE kind WHEN'fee_obligation'THEN amount_pence ELSE -amount_pence END),0)INTO prior FROM app.recovery_fee_journal WHERE tenant_id=t AND job_id=x.job_id;delta:=liability-prior;
 INSERT INTO app.recovery_fee_derivation VALUES(p_derivation,t,x.job_id,NULL,p_reversal,'reference_fee_policy_v1',landed,cap,fee,credit,liability,delta,DEFAULT);INSERT INTO app.recovery_review VALUES(gen_random_uuid(),t,x.job_id,p_derivation,'landing_reversed','open',DEFAULT);
 IF delta<0 THEN SELECT id INTO original FROM app.recovery_fee_journal WHERE tenant_id=t AND job_id=x.job_id AND kind='fee_obligation' ORDER BY created_at LIMIT 1;INSERT INTO app.recovery_fee_journal VALUES(p_journal,t,x.job_id,p_derivation,'compensation',-delta,'GBP','recovery_fee_deferred','recovery_fee_receivable',original,DEFAULT);END IF;RETURN p_derivation;END$$;

CREATE OR REPLACE FUNCTION app.create_fee_illustration_source(p_job uuid,p_command uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL OR NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=p_job) THEN RAISE EXCEPTION 'synthetic job required' USING ERRCODE='42501';END IF;
 INSERT INTO app.fee_illustration_source(tenant_id,job_id,command_id,source_version,accepted_net_pence,eligible_net_pence,gross_landed_pence,base_obligation_pence,base_settled_pence,prior_posting_pence,source_ids)
 VALUES(t,p_job,p_command,'recovery-18800.v1',1880000,282000,338400,7900,7900,20300,ARRAY[gen_random_uuid(),gen_random_uuid()]);
END $$;

-- No destination, money or commercial pointer argument. The raw review is hash-bound AND compared to persisted content.
CREATE FUNCTION app.start_quote_from_review(
 p_tenant uuid,p_job uuid,p_expected integer,p_actor uuid,p_command uuid,p_authorization uuid,p_review uuid,p_content text
) RETURNS app.job LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE review app.proposal_review; j app.job; content jsonb; expected_content jsonb; normalized jsonb; digest text;
BEGIN
 -- Authority first, before any resource lookup or state-dependent refusal.
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  OR NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner'
   AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO review FROM app.proposal_review WHERE tenant_id=p_tenant AND id=p_review AND job_id=p_job FOR UPDATE;
 IF review.id IS NULL THEN RAISE EXCEPTION 'REVIEW_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=p_tenant AND r.command_id=p_command
  AND r.actor_membership_id=p_actor AND r.command_type='confirm_proposal_review' AND r.status='processing'
  AND r.semantic_key='job:'||p_job::text||':confirm:'||review.proposal_id::text)
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 content:=p_content::jsonb;
 digest:=encode(sha256(convert_to(p_content,'UTF8')),'hex');
 IF NOT EXISTS(SELECT 1 FROM app.action_authorization a
  JOIN app.decision d ON(d.tenant_id,d.id)=(a.tenant_id,a.decision_id)
  JOIN app.decision_resolution x ON(x.tenant_id,x.id,x.decision_id)=(a.tenant_id,a.resolution_id,a.decision_id)
  WHERE a.tenant_id=p_tenant AND a.id=p_authorization AND a.actor_membership_id=p_actor AND x.actor_membership_id=p_actor
   AND x.resolution='approved' AND d.subject_type='job' AND d.subject_ref=p_job::text AND d.action_type='confirm_scope'
   AND a.action_type='confirm_scope' AND a.recipient IS NULL AND a.content_hash=digest AND a.aggregate_revision=review.revision
   AND a.amount_pence IS NULL AND a.currency IS NULL AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 -- Reconstruct the complete persisted review, including identities, dispositions and prices.
 -- Parent/question ordering is not stored; normalize only those arrays on BOTH sides.
 SELECT jsonb_build_object('version','proposal_review_v1','reviewId',review.id,'proposalId',review.proposal_id,
  'jobId',review.job_id,'revision',review.revision,'lines',coalesce((
   SELECT jsonb_agg(jsonb_build_object('id',l.id,'scopeItemId',l.scope_item_id,'origin',l.origin,'description',l.description,
    'room',l.room,'category',l.category,'quantity',l.quantity_decimal,'unit',l.unit,'unitPricePence',l.unit_price_pence,
    'disposition',l.disposition,'dismissalReason',l.dismissal_reason,'sourceExcerpt',l.source_excerpt,
    'parentScopeItemIds',coalesce((SELECT jsonb_agg(p.parent_scope_item_id ORDER BY p.parent_scope_item_id)
      FROM app.proposal_review_line_parent p WHERE p.tenant_id=l.tenant_id AND p.review_id=l.review_id AND p.line_id=l.id),'[]'::jsonb)) ORDER BY l.ordinal)
   FROM app.proposal_review_line l WHERE l.tenant_id=p_tenant AND l.review_id=p_review),'[]'::jsonb),
  'questions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',q.id,'question',q.question,'blocking',q.blocking,
    'disposition',q.disposition,'answer',q.answer) ORDER BY q.id)
   FROM app.proposal_review_question q WHERE q.tenant_id=p_tenant AND q.review_id=p_review),'[]'::jsonb)) INTO expected_content;
 normalized:=content || jsonb_build_object('lines',coalesce((SELECT jsonb_agg(
   l.value || jsonb_build_object('parentScopeItemIds',coalesce((SELECT jsonb_agg(p.value ORDER BY p.value)
    FROM jsonb_array_elements(l.value->'parentScopeItemIds') p),'[]'::jsonb)) ORDER BY l.ordinality)
   FROM jsonb_array_elements(content->'lines') WITH ORDINALITY l),'[]'::jsonb),
  'questions',coalesce((SELECT jsonb_agg(q.value ORDER BY q.value->>'id') FROM jsonb_array_elements(content->'questions') q),'[]'::jsonb));
 IF normalized IS DISTINCT FROM expected_content
  OR review.state IS DISTINCT FROM 'reviewing'
  OR NOT EXISTS(SELECT 1 FROM app.proposal_review_line WHERE tenant_id=p_tenant AND review_id=p_review AND disposition='accepted')
  OR EXISTS(SELECT 1 FROM app.proposal_review_line WHERE tenant_id=p_tenant AND review_id=p_review
   AND (disposition='proposed' OR (disposition='accepted' AND (quantity_decimal IS NULL OR unit IS NULL))))
  OR EXISTS(SELECT 1 FROM app.proposal_review_line l WHERE l.tenant_id=p_tenant AND l.review_id=p_review AND l.disposition='accepted'
   AND NOT EXISTS(SELECT 1 FROM app.scope_identity i JOIN app.scope_revision s
    ON(s.tenant_id,s.job_id,s.scope_item_id)=(i.tenant_id,i.job_id,i.id)
    WHERE (i.tenant_id,i.job_id,i.id)=(l.tenant_id,l.job_id,l.scope_item_id) AND i.state='confirmed'
     AND s.description=l.description AND s.quantity_decimal=l.quantity_decimal AND s.unit=l.unit
     AND s.unit_price_pence IS NOT DISTINCT FROM l.unit_price_pence))
  OR EXISTS(SELECT 1 FROM app.proposal_review_question WHERE tenant_id=p_tenant AND review_id=p_review
   AND ((blocking AND disposition<>'answered') OR (NOT blocking AND disposition='unresolved')))
 THEN RAISE EXCEPTION 'REVIEW_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 SELECT * INTO j FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF j.id IS NULL OR j.status IS DISTINCT FROM 'draft' OR j.revision IS DISTINCT FROM p_expected OR j.provenance IS DISTINCT FROM 'system_generated_quote'
  OR EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=p_tenant AND job_id=p_job AND job_track='contractor')
 THEN RAISE EXCEPTION 'REVIEW_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 UPDATE app.proposal_review SET state='confirmed',confirmed_at=transaction_timestamp(),updated_at=transaction_timestamp()
  WHERE tenant_id=p_tenant AND id=p_review;
 UPDATE app.job SET status='quoting',revision=revision+1,updated_at=transaction_timestamp()
  WHERE tenant_id=p_tenant AND id=p_job RETURNING * INTO j;
 RETURN j;
END $$;
ALTER FUNCTION app.start_quote_from_review(uuid,uuid,integer,uuid,uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.start_quote_from_review(uuid,uuid,integer,uuid,uuid,uuid,uuid,text) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.start_quote_from_review(uuid,uuid,integer,uuid,uuid,uuid,uuid,text) TO jobguard_runtime;
REVOKE EXECUTE ON FUNCTION app.transition_job(uuid,uuid,integer,varchar,varchar,uuid,bigint,varchar,bigint) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
COMMIT;
