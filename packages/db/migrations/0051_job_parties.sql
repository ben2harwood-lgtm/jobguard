BEGIN;

CREATE TABLE app.customer (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), id uuid NOT NULL,
 retention_class text NOT NULL DEFAULT 'job_party_contact_d07_pending' CHECK(retention_class='job_party_contact_d07_pending'),
 PRIMARY KEY(tenant_id,id)
);
CREATE TABLE app.customer_revision (
 tenant_id uuid NOT NULL, id uuid NOT NULL, customer_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 payload jsonb NOT NULL CHECK(payload->>'version'='customer.v1' AND length(payload->>'name') BETWEEN 1 AND 160
 AND payload->>'type' IN('person','business','landlord_or_agent','insurer','main_contractor','housing_association','local_authority')
 AND NOT payload ? 'isIndividual' AND payload ?& ARRAY['version','name','type'] AND jsonb_typeof(payload->'name')='string' AND jsonb_typeof(payload->'type')='string' AND (NOT payload ? 'email' OR jsonb_typeof(payload->'email')='string') AND (NOT payload ? 'phone' OR jsonb_typeof(payload->'phone')='string')), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,customer_id,revision), UNIQUE(tenant_id,customer_id,id),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES app.customer(tenant_id,id)
);
CREATE TABLE app.site (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), id uuid NOT NULL,
 retention_class text NOT NULL DEFAULT 'job_site_address_d07_pending' CHECK(retention_class='job_site_address_d07_pending'),
 PRIMARY KEY(tenant_id,id)
);
CREATE TABLE app.site_revision (
 tenant_id uuid NOT NULL, id uuid NOT NULL, site_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 payload jsonb NOT NULL CHECK(payload->>'version'='site.v1' AND jsonb_array_length(payload->'addressLines') BETWEEN 1 AND 4
 AND length(payload->>'town') BETWEEN 1 AND 160 AND payload->>'postcode' ~ '^(GIR 0AA|[A-PR-UWYZ]([0-9][0-9A-HJKPSTUW]?|[A-HK-Y][0-9][0-9ABEHMNPRVWXY]?) [0-9][ABD-HJLNP-UW-Z]{2})$'
 AND (NOT payload ? 'uprn' OR payload->>'uprn' ~ '^[0-9]{1,12}$') AND payload ?& ARRAY['version','addressLines','town','postcode'] AND jsonb_typeof(payload->'town')='string' AND jsonb_typeof(payload->'postcode')='string' AND (NOT payload ? 'unit' OR jsonb_typeof(payload->'unit')='string') AND (NOT payload ? 'uprn' OR jsonb_typeof(payload->'uprn')='string')),
 match_key jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 -- There are at most four lines. Reject CR/LF in each stored string even for direct runtime inserts.
 CONSTRAINT site_revision_address_lines_no_cr_lf CHECK(concat_ws('',payload->'addressLines'->>0,payload->'addressLines'->>1,payload->'addressLines'->>2,payload->'addressLines'->>3) !~ E'[\\r\\n]'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,site_id,revision), UNIQUE(tenant_id,site_id,id),
 FOREIGN KEY(tenant_id,site_id) REFERENCES app.site(tenant_id,id)
);
CREATE FUNCTION app.compute_site_match_key() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE address jsonb; unit_name text:=trim(regexp_replace(upper(normalize(coalesce(NEW.payload->>'unit',''),NFKC)),'\s+',' ','g')); BEGIN
 SELECT jsonb_agg(trim(regexp_replace(upper(normalize(value,NFKC)),'\s+',' ','g')) ORDER BY ordinal) INTO address FROM jsonb_array_elements_text(NEW.payload->'addressLines') WITH ORDINALITY AS lines(value,ordinal);
 IF NEW.payload ? 'uprn' THEN NEW.match_key:=jsonb_build_array('uprn',regexp_replace(NEW.payload->>'uprn','^0+(?=[0-9])',''),unit_name);
 ELSE NEW.match_key:=jsonb_build_array('address',NEW.payload->>'postcode',address,trim(regexp_replace(upper(normalize(NEW.payload->>'town',NFKC)),'\s+',' ','g')),unit_name); END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.compute_site_match_key() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.compute_site_match_key() FROM PUBLIC;
CREATE TRIGGER site_match_key_server_written BEFORE INSERT ON app.site_revision FOR EACH ROW EXECUTE FUNCTION app.compute_site_match_key();
CREATE INDEX site_match_proposals ON app.site_revision(tenant_id,match_key);
CREATE TABLE app.job_party_binding (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>=0),
 customer_id uuid NOT NULL, customer_revision_id uuid NOT NULL, paying_party_id uuid NOT NULL, paying_party_revision_id uuid NOT NULL,
 site_id uuid NOT NULL, site_revision_id uuid NOT NULL,
 provenance text NOT NULL CHECK(provenance IN('entered','backfilled_from_quote_snapshot','backfilled_synthetic_fixture','work_order_import')),
 correction_reason text CHECK(correction_reason IS NULL OR length(trim(correction_reason)) BETWEEN 1 AND 500), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 command_id uuid, -- the exact job.parties receipt that authorized this change; one receipt, one binding effect
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,revision), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,customer_id,customer_revision_id) REFERENCES app.customer_revision(tenant_id,customer_id,id),
 FOREIGN KEY(tenant_id,paying_party_id,paying_party_revision_id) REFERENCES app.customer_revision(tenant_id,customer_id,id),
 FOREIGN KEY(tenant_id,site_id,site_revision_id) REFERENCES app.site_revision(tenant_id,site_id,id)
);
CREATE TABLE app.job_party_current (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, binding_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,job_id),
 FOREIGN KEY(tenant_id,job_id,binding_id) REFERENCES app.job_party_binding(tenant_id,job_id,id)
);
CREATE VIEW app.job_party_snapshot WITH(security_invoker=true) AS
 SELECT b.tenant_id,b.job_id,b.id AS binding_id,b.customer_id,b.site_id,
 jsonb_build_object('version','job-parties-snapshot.v1','bindingId',b.id,'customerRevisionId',c.id,
 'siteRevisionId',s.id,'payingPartyRevisionId',p.id,'customer',c.payload,'payingParty',p.payload,'site',s.payload) AS snapshot
 FROM app.job_party_binding b
 JOIN app.customer_revision c ON(c.tenant_id,c.customer_id,c.id)=(b.tenant_id,b.customer_id,b.customer_revision_id)
 JOIN app.customer_revision p ON(p.tenant_id,p.customer_id,p.id)=(b.tenant_id,b.paying_party_id,b.paying_party_revision_id)
 JOIN app.site_revision s ON(s.tenant_id,s.site_id,s.id)=(b.tenant_id,b.site_id,b.site_revision_id);
CREATE VIEW app.job_party_recognition WITH(security_invoker=true) AS
 SELECT b.tenant_id,b.customer_id,b.site_id,j.id AS job_id,j.status,
 coalesce(a.recorded_at,i.recorded_at) AS started_at,
 CASE WHEN j.status IN('invoiced','paid') THEN (SELECT min(invoice.created_at) FROM app.customer_invoice invoice WHERE(invoice.tenant_id,invoice.job_id)=(j.tenant_id,j.id)) END AS ended_at
 FROM app.job_party_current x JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(x.tenant_id,x.job_id,x.binding_id)
 JOIN app.job j ON(j.tenant_id,j.id)=(b.tenant_id,b.job_id)
 LEFT JOIN app.job_activation a ON(a.tenant_id,a.job_id)=(j.tenant_id,j.id)
 LEFT JOIN app.imported_job_baseline i ON(i.tenant_id,i.job_id)=(j.tenant_id,j.id);

CREATE FUNCTION app.bind_job_parties(p_tenant uuid,p_job uuid,p_id uuid,p_expected integer,p_customer uuid,p_payer uuid,p_site uuid,p_correct boolean,p_reason text,p_actor uuid,p_command uuid)
RETURNS app.job_party_binding LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE j app.job; c app.customer_revision; p app.customer_revision; s app.site_revision; b app.job_party_binding;
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
 OR NOT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command AND actor_membership_id=p_actor AND command_type='job.parties' AND semantic_key=p_command::text AND status='processing') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF j.revision<>p_expected THEN RAISE EXCEPTION 'REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF j.status IN('live','invoiced','paid') AND (p_correct IS DISTINCT FROM TRUE OR length(trim(coalesce(p_reason,'')))=0) THEN RAISE EXCEPTION 'CORRECTION_REASON_REQUIRED' USING ERRCODE='22023'; END IF;
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
END $$;

ALTER TABLE app.job_activation ADD COLUMN party_binding_id uuid;
ALTER TABLE app.job_activation ADD FOREIGN KEY(tenant_id,job_id,party_binding_id) REFERENCES app.job_party_binding(tenant_id,job_id,id);
ALTER TABLE app.imported_job_baseline ADD COLUMN party_binding_id uuid;
ALTER TABLE app.imported_job_baseline ADD FOREIGN KEY(tenant_id,job_id,party_binding_id) REFERENCES app.job_party_binding(tenant_id,job_id,id);
ALTER TABLE app.quote_document_version ADD COLUMN parties_snapshot jsonb;
ALTER TABLE app.customer_invoice ADD COLUMN parties_snapshot jsonb;
CREATE FUNCTION app.require_current_job_parties(p_tenant uuid,p_job uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE snapshot jsonb; BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT s.snapshot INTO snapshot FROM app.job_party_snapshot s JOIN app.job_party_current x ON(x.tenant_id,x.binding_id)=(s.tenant_id,s.binding_id) WHERE s.tenant_id=p_tenant AND s.job_id=p_job;
 IF snapshot IS NULL THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 RETURN snapshot;
END $$;
ALTER FUNCTION app.require_current_job_parties(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_current_job_parties(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.require_current_job_parties(uuid,uuid) TO jobguard_runtime;

CREATE FUNCTION app.require_job_parties() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF TG_TABLE_NAME='job' THEN
   IF NEW.status='live' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) AND NOT EXISTS(SELECT 1 FROM app.job_party_current WHERE tenant_id=NEW.tenant_id AND job_id=NEW.id) THEN
     RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023';
   END IF;
 ELSIF TG_TABLE_NAME IN('job_activation','imported_job_baseline') THEN
   SELECT binding_id INTO NEW.party_binding_id FROM app.job_party_current WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id;
   IF NEW.party_binding_id IS NULL THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 ELSE
   NEW.parties_snapshot:=app.require_current_job_parties(NEW.tenant_id,NEW.job_id);
   IF TG_TABLE_NAME='quote_document_version' THEN
     IF NEW.snapshot ? 'jobParties' AND NEW.snapshot->'jobParties' IS DISTINCT FROM NEW.parties_snapshot THEN RAISE EXCEPTION 'PARTY_SNAPSHOT_MISMATCH' USING ERRCODE='22023'; END IF;
   END IF;
   IF NEW.parties_snapshot IS NULL THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER job_parties_live_guard BEFORE INSERT OR UPDATE ON app.job FOR EACH ROW EXECUTE FUNCTION app.require_job_parties();
CREATE TRIGGER activation_party_snapshot BEFORE INSERT ON app.job_activation FOR EACH ROW EXECUTE FUNCTION app.require_job_parties();
CREATE TRIGGER imported_party_snapshot BEFORE INSERT ON app.imported_job_baseline FOR EACH ROW EXECUTE FUNCTION app.require_job_parties();
CREATE TRIGGER quote_party_snapshot BEFORE INSERT ON app.quote_document_version FOR EACH ROW EXECUTE FUNCTION app.require_job_parties();
CREATE TRIGGER invoice_party_snapshot BEFORE INSERT ON app.customer_invoice FOR EACH ROW EXECUTE FUNCTION app.require_job_parties();

DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['customer','customer_revision','site','site_revision','job_party_binding','job_party_current'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
 EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE ON app.%I FROM jobguard_runtime',n);
 IF n IN('customer_revision','site_revision','job_party_binding') THEN
 EXECUTE format('CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END IF;
 END LOOP;
END $$;
REVOKE INSERT ON app.job_party_binding,app.job_party_current FROM jobguard_runtime;
ALTER VIEW app.job_party_snapshot OWNER TO jobguard_migration;
ALTER VIEW app.job_party_recognition OWNER TO jobguard_migration;
GRANT SELECT ON app.job_party_snapshot,app.job_party_recognition TO jobguard_runtime;
ALTER FUNCTION app.bind_job_parties(uuid,uuid,uuid,integer,uuid,uuid,uuid,boolean,text,uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.require_job_parties() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.bind_job_parties(uuid,uuid,uuid,integer,uuid,uuid,uuid,boolean,text,uuid,uuid),app.require_job_parties() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.bind_job_parties(uuid,uuid,uuid,integer,uuid,uuid,uuid,boolean,text,uuid,uuid) TO jobguard_runtime;

-- Explicit generated recipe for pre-CH-3a demo jobs. Never inferred from job titles or real data.
DO $$ DECLARE t record; j record; c uuid; cr uuid; s uuid; sr uuid; b uuid; quote_name text; BEGIN
 FOR t IN SELECT id FROM control_plane.tenant LOOP
 PERFORM set_config('app.tenant_id',t.id::text,true);
 FOR j IN SELECT * FROM app.job WHERE tenant_id=t.id LOOP
 IF current_setting('app.deployment_mode',true)='synthetic_demo' THEN
 c:=gen_random_uuid(); cr:=gen_random_uuid(); s:=gen_random_uuid(); sr:=gen_random_uuid(); b:=gen_random_uuid();
 SELECT nullif(trim(customer->>'name'),'') INTO quote_name FROM app.quote_document_version d WHERE d.tenant_id=j.tenant_id AND d.job_id=j.id
 AND (EXISTS(SELECT 1 FROM app.quote_send x WHERE x.tenant_id=d.tenant_id AND x.document_id=d.id) OR EXISTS(SELECT 1 FROM app.quote_version q WHERE q.tenant_id=d.tenant_id AND q.id=d.id AND q.status IN('issued','accepted'))) ORDER BY document_version DESC LIMIT 1;
 INSERT INTO app.customer(tenant_id,id) VALUES(j.tenant_id,c);
 INSERT INTO app.customer_revision(tenant_id,id,customer_id,revision,payload) VALUES(j.tenant_id,cr,c,1,jsonb_build_object('version','customer.v1','name',coalesce(nullif(quote_name,''),'Practice Customer'),'type','person','email','practice-customer@example.invalid'));
 INSERT INTO app.site(tenant_id,id) VALUES(j.tenant_id,s);
 INSERT INTO app.site_revision(tenant_id,id,site_id,revision,payload,match_key) VALUES(j.tenant_id,sr,s,1,
 '{"version":"site.v1","addressLines":["14 Fictional Street"],"town":"London","postcode":"SW1A 1AA"}',
 '["address","SW1A 1AA",["14 FICTIONAL STREET"],"LONDON",""]');
 INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance)
 VALUES(j.tenant_id,b,j.id,j.revision,c,cr,c,cr,s,sr,CASE WHEN nullif(quote_name,'') IS NOT NULL THEN 'backfilled_from_quote_snapshot' ELSE 'backfilled_synthetic_fixture' END);
 INSERT INTO app.job_party_current(tenant_id,job_id,binding_id) VALUES(j.tenant_id,j.id,b);
 ELSE
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(gen_random_uuid(),j.tenant_id,'job',j.id::text,'job.parties.details_needed');
 END IF;
 END LOOP;
 END LOOP;
END $$;

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
   AND d.subject_type='job' AND d.subject_ref=p_job::text AND a.action_type='job.adopt_in_flight' AND a.recipient IS NULL AND a.content_hash=p_hash AND a.aggregate_revision=0
   AND a.amount_pence=p_net AND a.currency='GBP' AND a.policy_version=p_terms AND a.expires_at>clock_timestamp() AND a.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 IF p_lifecycle NOT IN('live','invoiced') OR p_net<0 OR p_cap<>app.reference_recovery_cap(p_net) OR p_policy<>'reference_fee_policy_v1' OR p_terms<>'synthetic_import_terms_candidate.v1' OR p_attested>clock_timestamp() THEN RAISE EXCEPTION 'invalid imported terms' USING ERRCODE='22023';END IF;
 SELECT * INTO c FROM app.customer_revision WHERE tenant_id=p_tenant AND id=p_customer;
 SELECT * INTO s FROM app.site_revision WHERE tenant_id=p_tenant AND id=p_site;
 SELECT * INTO p FROM app.customer_revision WHERE tenant_id=p_tenant AND id=coalesce(p_payer,p_customer);
 IF c.id IS NULL OR s.id IS NULL OR p.id IS NULL THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 PERFORM set_config('app.import_command','enabled',true);
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

ALTER FUNCTION app.adopt_in_flight_job(uuid,uuid,uuid,varchar,varchar,character,varchar,bigint,bigint,varchar,varchar,uuid,timestamptz,uuid,uuid,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.adopt_in_flight_job(uuid,uuid,uuid,varchar,varchar,character,varchar,bigint,bigint,varchar,varchar,uuid,timestamptz,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.adopt_in_flight_job(uuid,uuid,uuid,varchar,varchar,character,varchar,bigint,bigint,varchar,varchar,uuid,timestamptz,uuid,uuid,uuid,uuid,uuid) TO jobguard_runtime;
-- A binding change authorized by a command must leave its record. At commit (deferred, so the repository's receipt completion and audit
-- append come first) the binding needs a succeeded job.parties receipt that is exactly its own command and names it as the result, and an
-- audit event for this job naming that command and this binding (job.parties.correct when a correction reason was given). Otherwise the whole
-- transaction fails. Bindings without a command (generated backfill, adoption) are covered by their own rules.
CREATE FUNCTION app.require_binding_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.command_receipt r JOIN app.audit_event e ON(e.tenant_id=r.tenant_id)
   WHERE r.tenant_id=NEW.tenant_id AND r.command_id=NEW.command_id AND r.command_type='job.parties' AND r.semantic_key=NEW.command_id::text
   AND r.status='succeeded' AND r.result->>'id'=NEW.id::text
   AND e.subject_type='job' AND e.subject_ref=NEW.job_id::text AND e.payload->'references'->>'commandId'=NEW.command_id::text AND e.payload->'references'->>'identityId'=NEW.id::text
   AND e.event_type=CASE WHEN NEW.correction_reason IS NULL THEN e.event_type ELSE 'job.parties.correct' END AND e.event_type IN('job.parties.bind','job.parties.correct'))
 THEN RAISE EXCEPTION 'BINDING_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.require_binding_record() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_binding_record() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER job_party_binding_record_required AFTER INSERT ON app.job_party_binding DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.command_id IS NOT NULL) EXECUTE FUNCTION app.require_binding_record();

-- Every permitted execution must leave its record. At commit (deferred, so the command dispatcher's audit append and receipt completion
-- come first) an adopted baseline needs: a completed adoption receipt for this very job and actor; an audit event naming that receipt and an
-- authorization bound to this job, actor, baseline hash, amount and terms; and the adoption's own audit event. Otherwise the whole transaction fails.
CREATE FUNCTION app.require_adoption_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.audit_event e
   JOIN app.command_receipt r ON(r.tenant_id=e.tenant_id AND r.command_id::text=e.payload->'references'->>'commandId')
   JOIN app.action_authorization a ON(a.tenant_id=e.tenant_id AND a.id::text=e.payload->'references'->>'authorizationId')
   JOIN app.decision d ON(d.tenant_id=a.tenant_id AND d.id=a.decision_id)
   WHERE e.tenant_id=NEW.tenant_id AND e.event_type='command.succeeded' AND e.subject_type='job' AND e.subject_ref=NEW.job_id::text
   AND r.command_type='job.adopt_in_flight' AND r.semantic_key='import:'||NEW.job_id::text AND r.status='succeeded' AND r.actor_membership_id=NEW.attested_by_membership_id
   AND a.actor_membership_id=NEW.attested_by_membership_id AND a.action_type='job.adopt_in_flight' AND a.recipient IS NULL AND a.aggregate_revision=0 AND a.revoked_at IS NULL
   AND d.subject_type='job' AND d.subject_ref=NEW.job_id::text AND a.content_hash=NEW.baseline_hash AND a.amount_pence=NEW.accepted_net_value_pence
   AND a.currency='GBP' AND a.policy_version=NEW.import_terms_version)
 OR NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.event_type='job.imported_baseline_attested' AND e.subject_type='job' AND e.subject_ref=NEW.job_id::text)
 THEN RAISE EXCEPTION 'ADOPTION_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.require_adoption_record() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_adoption_record() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER imported_baseline_record_required AFTER INSERT ON app.imported_job_baseline DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_adoption_record();

CREATE OR REPLACE FUNCTION app.adopt_in_flight_job(p_tenant uuid,p_job uuid,p_baseline uuid,p_title varchar,p_lifecycle varchar,p_hash char(64),p_description varchar,p_net bigint,p_cap bigint,p_policy varchar,p_terms varchar,p_actor uuid,p_attested timestamptz)
RETURNS app.imported_job_baseline LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END $$;

CREATE OR REPLACE FUNCTION app.issue_practice_customer_invoice(
 p_tenant uuid,p_job uuid,p_final_revision uuid,p_actor uuid,p_command uuid,p_recipient text,p_issued_on date
) RETURNS TABLE(invoice_id uuid,invoice_number text,pdf_sha256 text,total_pence bigint,source_hash text,outbox_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE existing app.customer_invoice%ROWTYPE; final_row app.final_account_revision%ROWTYPE;
 n bigint; number text; artifact text; digest text; decision_id uuid:=gen_random_uuid();
 resolution_id uuid:=gen_random_uuid(); authorization_id uuid:=gen_random_uuid(); new_invoice uuid:=gen_random_uuid();
 request_digest text:=encode(public.digest(convert_to(p_job::text||p_final_revision::text||p_recipient||p_issued_on::text,'UTF8'),'sha256'),'hex');
 prior jsonb; party_snapshot jsonb;
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 SELECT result INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
   IF (SELECT request_hash FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command)<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
   RETURN QUERY SELECT (prior->>'invoiceId')::uuid,prior->>'invoiceNumber',prior->>'pdfSha256',(prior->>'totalPence')::bigint,prior->>'sourceHash',prior->>'outboxStatus'; RETURN;
 END IF;
 IF p_recipient !~ '^[^@ ]+@example\.invalid$' THEN RAISE EXCEPTION 'SYNTHETIC_RECIPIENT_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT r.* INTO final_row FROM app.final_account_revision r JOIN app.final_account_draft d ON(d.tenant_id,d.id)=(r.tenant_id,r.final_account_draft_id)
 WHERE r.tenant_id=p_tenant AND r.job_id=p_job AND r.id=p_final_revision AND d.current_revision_id=r.id AND NOT r.issue_blocked;
 IF NOT FOUND THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT'; END IF;
 SELECT * INTO existing FROM app.customer_invoice WHERE tenant_id=p_tenant AND final_account_revision_id=p_final_revision;
 IF FOUND THEN RETURN QUERY SELECT existing.id,existing.invoice_number::text,existing.pdf_sha256::text,existing.total_pence,existing.source_hash::text,'succeeded'::text; RETURN; END IF;
 party_snapshot:=app.require_current_job_parties(p_tenant,p_job);
 INSERT INTO app.customer_invoice_sequence(id,tenant_id,next_number)VALUES(gen_random_uuid(),p_tenant,2)
 ON CONFLICT(tenant_id) DO UPDATE SET next_number=app.customer_invoice_sequence.next_number+1 RETURNING next_number-1 INTO n;
 number:='DEMO-CUST-'||lpad(n::text,6,'0');
 artifact:='%PDF-1.4'||chr(10)||'Practice sandbox — synthetic data; nothing is sent or charged'||chr(10)||
   'Not a real tax invoice'||chr(10)||'Number: '||number||chr(10)||'Issue date: '||p_issued_on::text||chr(10)||
   'Issuer: Fictional Builder Ltd ['||p_tenant::text||']'||chr(10)||'Recipient: '||p_recipient||chr(10)||
   'Reference tax version: '||final_row.tax_policy_version||chr(10)||'Frozen final account: '||final_row.id::text||chr(10)||
   'Source hash: '||final_row.source_hash||chr(10)||'Net pence: '||final_row.net_pence||chr(10)||'VAT pence: '||final_row.tax_pence||chr(10)||'Gross pence: '||final_row.total_pence||chr(10)||'%%EOF';
 artifact:=artifact||chr(10)||party_snapshot::text;
 digest:=encode(public.digest(convert_to(artifact,'UTF8'),'sha256'),'hex');
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)VALUES(decision_id,p_tenant,'job',p_job::text,'final_account.issue');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'final_account.issue',p_recipient,digest,final_row.revision,final_row.total_pence,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
 VALUES(new_invoice,p_tenant,p_job,p_final_revision,authorization_id,number,p_issued_on,jsonb_build_object('legalName','Fictional Builder Ltd','runIdentity',p_tenant),final_row.tax_policy_version,'GBP',final_row.net_pence,final_row.tax_pence,final_row.total_pence,final_row.source_hash,digest,convert_to(artifact,'UTF8'),true,'SYNTHETIC - NOT A REAL INVOICE');
 INSERT INTO app.customer_invoice_evidence(id,tenant_id,job_id,invoice_id,evidence_id,object_version_id,sha256,scope_item_id)
 SELECT gen_random_uuid(),p_tenant,p_job,new_invoice,evidence_id,object_version_id,sha256,scope_item_id FROM app.final_account_proof WHERE tenant_id=p_tenant AND final_account_revision_id=p_final_revision;
 INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at,status,completed_at)
 VALUES(gen_random_uuid(),p_tenant,authorization_id,'fake_invoice_delivery','practice-invoice:'||new_invoice,'final_account.issue',p_recipient,digest,artifact,final_row.revision,final_row.total_pence,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes','succeeded',transaction_timestamp());
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_command,p_tenant,'customer_invoice.issue','invoice:'||p_final_revision,request_digest,'succeeded',jsonb_build_object('invoiceId',new_invoice,'invoiceNumber',number,'pdfSha256',digest,'totalPence',final_row.total_pence,'sourceHash',final_row.source_hash,'outboxStatus','succeeded'),p_actor,transaction_timestamp());
 RETURN QUERY SELECT new_invoice,number,digest,final_row.total_pence,final_row.source_hash::text,'succeeded'::text;
END $$;
CREATE OR REPLACE FUNCTION app.switch_job_live(p_tenant uuid,p_activation uuid,p_cap_snapshot uuid,p_obligation uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_expected integer,p_net bigint,p_cap bigint,p_mode varchar,p_terms varchar,p_policy varchar,p_actor uuid,p_activated timestamptz) RETURNS app.job_activation LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE j app.job;d app.quote_document_version;q app.quote_version;a app.job_activation;BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';END IF;
 SELECT * INTO j FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF j.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.job_party_current WHERE tenant_id=p_tenant AND job_id=p_job) THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 IF NOT FOUND OR j.status<>'accepted' OR j.revision<>p_expected OR j.accepted_quote_version_id<>p_document THEN RAISE EXCEPTION 'accepted job revision required' USING ERRCODE='40001';END IF;
 SELECT * INTO d FROM app.quote_document_version WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_document AND document_version=p_version AND content_hash=p_hash;
 SELECT * INTO q FROM app.quote_version WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_document AND status='accepted';
 IF d.id IS NULL OR q.id IS NULL OR q.net_value_pence<>p_net OR p_cap<>app.reference_recovery_cap(p_net) OR p_policy<>'reference_fee_policy_v1' THEN RAISE EXCEPTION 'exact accepted terms or cap mismatch' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.quote_acceptance x WHERE x.tenant_id=p_tenant AND x.job_id=p_job AND x.document_id=p_document AND x.document_hash=p_hash) THEN RAISE EXCEPTION 'acceptance required' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.quote_revision r WHERE r.tenant_id=p_tenant AND r.job_id=p_job AND r.id=d.quote_revision_id AND r.issuable AND r.tax_policy_version='candidate_m1_standard_v1') THEN RAISE EXCEPTION 'resolved price and tax fields required' USING ERRCODE='22023';END IF;
 IF (p_mode='pilot_no_charge' AND (p_terms<>'pilot_no_charge.v1' OR p_obligation IS NOT NULL)) OR (p_mode='synthetic_demo' AND (p_terms<>'synthetic_demo_illustrative.v1' OR p_obligation IS NULL)) OR p_mode NOT IN('pilot_no_charge','synthetic_demo') THEN RAISE EXCEPTION 'invalid activation mode/terms' USING ERRCODE='22023';END IF;
 INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at) VALUES(p_activation,p_tenant,p_job,p_document,p_version,p_hash,p_mode,p_terms,p_policy,p_actor,p_activated) RETURNING * INTO a;
 INSERT INTO app.cap_snapshot(id,tenant_id,job_id,activation_id,baseline_quote_version_id,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,illustrative) VALUES(p_cap_snapshot,p_tenant,p_job,p_activation,p_document,p_net,'GBP',p_cap,p_policy,true);
 IF p_mode='synthetic_demo' THEN INSERT INTO app.synthetic_obligation(id,tenant_id,job_id,activation_id,principal_pence,currency,state,label) VALUES(p_obligation,p_tenant,p_job,p_activation,7900,'GBP','owed_unpaid','illustrative_only');END IF;
 UPDATE app.job SET status='live',revision=revision+1,baseline_quote_version_id=p_document,accepted_net_value_pence=p_net,fee_policy_version=p_policy,recovery_cap_pence=p_cap,updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_job;
 RETURN a;END $$;

COMMIT;
