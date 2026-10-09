BEGIN;
-- ENT-2 work-order jobs and schedules of rates (synthetic_demo only). Expand-only: no existing row, table or merged migration is rewritten.
--
-- Authority (Ben, 9 Oct 2026, card jobguard-ent-2-import-roles-2026-10-08, answer "Existing roles"; no new permission, no role-list change):
--   * a work-order import is run by a member holding organisation.manage (owner, admin) or data.import (finance) - exactly the
--     predicate CH-3b's app.bind_contractor_parties (0102) enforces per order;
--   * a schedule-of-rates (SoR) version import is run by a member holding contract.manage (owner, admin, commercial_manager).
-- Every other role, and every non-member, gets the ENT-1 not-found (P0002).
--
-- Existing objects this migration replaces or extends, each based on its CURRENT definition (see docs/verdicts/ENT-2/BUILDER_RECEIPT_attempt2.md):
--   * app.job constraint job_provenance_check (0020): the two original values are kept and 'work_order' is added.
--   * app.read_contractor_resident (0102): identical body except that job scope is now resolved by app.contractor_job_allowed.
-- Nothing else that an earlier migration defines is altered.

-- 1. Job provenance gains work_order. A work-order job carries no quote baseline, accepted quote, net value, fee policy or cap.
ALTER TABLE app.job DROP CONSTRAINT job_provenance_check;
ALTER TABLE app.job ADD CONSTRAINT job_provenance_check CHECK (provenance IN ('system_generated_quote','imported','work_order'));
ALTER TABLE app.job ADD CONSTRAINT work_order_job_has_no_quote_or_fee CHECK (provenance<>'work_order' OR
  (accepted_quote_version_id IS NULL AND baseline_quote_version_id IS NULL AND accepted_net_value_pence IS NULL AND fee_policy_version IS NULL AND recovery_cap_pence IS NULL));

-- 2. Schedules of rates: immutable versions of immutable items.
CREATE TABLE app.schedule_of_rates (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), id uuid NOT NULL,
 reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 100),
 actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,reference),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.sor_version (
 tenant_id uuid NOT NULL, id uuid NOT NULL, schedule_id uuid NOT NULL, reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 100),
 effective_from date NOT NULL, item_count integer NOT NULL CHECK(item_count BETWEEN 1 AND 10000),
 content_hash char(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'), command_id uuid NOT NULL, request_hash char(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,schedule_id,id), UNIQUE(tenant_id,schedule_id,effective_from), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,schedule_id) REFERENCES app.schedule_of_rates(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.sor_item (
 tenant_id uuid NOT NULL, version_id uuid NOT NULL, code text NOT NULL CHECK(length(code) BETWEEN 1 AND 80),
 description text NOT NULL CHECK(length(description) BETWEEN 1 AND 500), unit text NOT NULL CHECK(length(unit) BETWEEN 1 AND 40),
 rate_pence bigint NOT NULL CHECK(rate_pence BETWEEN 0 AND 1000000000000), standard_minutes integer CHECK(standard_minutes IS NULL OR standard_minutes BETWEEN 0 AND 525600),
 PRIMARY KEY(tenant_id,version_id,code), UNIQUE(tenant_id,version_id,code,unit,rate_pence),
 FOREIGN KEY(tenant_id,version_id) REFERENCES app.sor_version(tenant_id,id)
);

-- 3. Import batches and per-row receipts. A batch row is written once, at the end of the import transaction, with its final counts.
CREATE TABLE app.import_batch (
 tenant_id uuid NOT NULL, id uuid NOT NULL, command_id uuid NOT NULL,
 source_sha256 char(64) NOT NULL CHECK(source_sha256 ~ '^[0-9a-f]{64}$'), source_name text NOT NULL CHECK(length(source_name) BETWEEN 1 AND 120),
 source_kind text NOT NULL CHECK(source_kind IN('generated','csv')),
 row_count integer NOT NULL CHECK(row_count BETWEEN 0 AND 10000), created_count integer NOT NULL CHECK(created_count>=0), revised_count integer NOT NULL CHECK(revised_count>=0),
 unchanged_count integer NOT NULL CHECK(unchanged_count>=0), rejected_count integer NOT NULL CHECK(rejected_count>=0),
 actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id),
 CHECK(created_count+revised_count+unchanged_count+rejected_count=row_count),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE INDEX import_batch_source ON app.import_batch(tenant_id,source_sha256);

-- 4. Orders, revisions, lines and the current-revision pointer.
CREATE TABLE app.work_order (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, client_id uuid NOT NULL, contract_id uuid NOT NULL, contract_version_id uuid NOT NULL,
 reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 100), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,contract_id,reference), UNIQUE(tenant_id,job_id), UNIQUE(tenant_id,id,job_id),
 FOREIGN KEY(tenant_id,client_id,contract_id) REFERENCES app.client_contract(tenant_id,client_id,id),
 FOREIGN KEY(tenant_id,client_id,contract_id,contract_version_id) REFERENCES app.client_contract_version(tenant_id,client_id,contract_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 -- Every order has the CH-3b party binding for its own job and order identity (client, contract, site and resident were bound by that routine).
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.contractor_party_binding(tenant_id,job_id),
 FOREIGN KEY(tenant_id,id) REFERENCES app.contractor_party_binding(tenant_id,work_order_id)
);
CREATE TABLE app.work_order_revision (
 tenant_id uuid NOT NULL, id uuid NOT NULL, work_order_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 status text NOT NULL CHECK(status IN('ordered','cancelled')), issued_on date NOT NULL, due_on date, priority text NOT NULL CHECK(priority IN('routine','urgent','emergency')),
 content_hash char(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'), diff jsonb NOT NULL CHECK(jsonb_typeof(diff)='object'),
 batch_id uuid NOT NULL, row_number integer NOT NULL CHECK(row_number>=2),
 sor_version_id uuid, adjustment_numerator bigint NOT NULL, adjustment_denominator bigint NOT NULL CHECK(adjustment_denominator>0 AND adjustment_denominator<1000000000000),
 net_total_pence bigint NOT NULL CHECK(net_total_pence BETWEEN 0 AND 1000000000000000), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,work_order_id,revision), UNIQUE(tenant_id,work_order_id,id),
 CHECK(due_on IS NULL OR due_on>=issued_on),
 FOREIGN KEY(tenant_id,work_order_id) REFERENCES app.work_order(tenant_id,id),
 FOREIGN KEY(tenant_id,sor_version_id) REFERENCES app.sor_version(tenant_id,id),
 -- The batch row is written last in the import transaction.
 FOREIGN KEY(tenant_id,batch_id) REFERENCES app.import_batch(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE app.work_order_line (
 tenant_id uuid NOT NULL, id uuid NOT NULL, work_order_id uuid NOT NULL, revision_id uuid NOT NULL, job_id uuid NOT NULL,
 position integer NOT NULL CHECK(position>=0), scope_item_id uuid NOT NULL, client_line_reference text CHECK(client_line_reference IS NULL OR length(client_line_reference) BETWEEN 1 AND 80),
 sor_version_id uuid NOT NULL, sor_code text NOT NULL, unit text NOT NULL, rate_pence bigint NOT NULL,
 quantity text NOT NULL CHECK(quantity ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'),
 net_pence bigint NOT NULL CHECK(net_pence BETWEEN 0 AND 1000000000000),
 -- The only origin an import can write is client_instruction (CHECK, not a default that a caller could override).
 origin text NOT NULL CHECK(origin='client_instruction'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,revision_id,position), UNIQUE(tenant_id,revision_id,scope_item_id), UNIQUE(tenant_id,revision_id,client_line_reference),
 FOREIGN KEY(tenant_id,work_order_id,revision_id) REFERENCES app.work_order_revision(tenant_id,work_order_id,id),
 FOREIGN KEY(tenant_id,work_order_id,job_id) REFERENCES app.work_order(tenant_id,id,job_id),
 FOREIGN KEY(tenant_id,job_id,scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id),
 -- Rate and unit are the persisted SoR item's, never the caller's.
 FOREIGN KEY(tenant_id,sor_version_id,sor_code,unit,rate_pence) REFERENCES app.sor_item(tenant_id,version_id,code,unit,rate_pence)
);
CREATE TABLE app.work_order_current (
 tenant_id uuid NOT NULL, work_order_id uuid NOT NULL, revision_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,work_order_id), UNIQUE(tenant_id,revision_id),
 FOREIGN KEY(tenant_id,work_order_id,revision_id) REFERENCES app.work_order_revision(tenant_id,work_order_id,id)
);
CREATE TABLE app.import_row_receipt (
 tenant_id uuid NOT NULL, batch_id uuid NOT NULL, row_number integer NOT NULL CHECK(row_number>=2),
 outcome text NOT NULL CHECK(outcome IN('created','revised','unchanged','rejected')), error_code text CHECK(error_code IS NULL OR error_code ~ '^[A-Z_]{3,60}$'),
 work_order_reference text CHECK(work_order_reference IS NULL OR length(work_order_reference) BETWEEN 1 AND 100), work_order_id uuid, revision_id uuid,
 PRIMARY KEY(tenant_id,batch_id,row_number),
 CHECK((outcome='rejected')=(error_code IS NOT NULL)),
 -- A rejected row wrote no revision (it may still name the existing order it was refused against); every other outcome names its order and current revision.
 CHECK(outcome='rejected' AND revision_id IS NULL OR outcome<>'rejected' AND work_order_id IS NOT NULL AND revision_id IS NOT NULL),
 FOREIGN KEY(tenant_id,batch_id) REFERENCES app.import_batch(tenant_id,id),
 FOREIGN KEY(tenant_id,work_order_id) REFERENCES app.work_order(tenant_id,id),
 FOREIGN KEY(tenant_id,work_order_id,revision_id) REFERENCES app.work_order_revision(tenant_id,work_order_id,id)
);

-- 5. Scheduling facts (B5, Q3): read projection only. Assignment rows come from the import; ENT-3 owns visit start and complete.
CREATE TABLE app.job_assignment (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, work_order_id uuid NOT NULL, revision_id uuid NOT NULL,
 team_id uuid NOT NULL, membership_id uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),
 -- One team row (membership NULL) and one row per operative for each revision.
 UNIQUE NULLS NOT DISTINCT (tenant_id,revision_id,membership_id),
 FOREIGN KEY(tenant_id,work_order_id,revision_id) REFERENCES app.work_order_revision(tenant_id,work_order_id,id),
 FOREIGN KEY(tenant_id,work_order_id,job_id) REFERENCES app.work_order(tenant_id,id,job_id),
 FOREIGN KEY(tenant_id,team_id) REFERENCES app.team(tenant_id,id),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES app.contractor_member(tenant_id,membership_id)
);
CREATE TABLE app.site_visit (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, work_order_id uuid NOT NULL, membership_id uuid NOT NULL,
 started_at timestamptz NOT NULL DEFAULT transaction_timestamp(), completed_at timestamptz,
 PRIMARY KEY(tenant_id,id), CHECK(completed_at IS NULL OR completed_at>=started_at),
 FOREIGN KEY(tenant_id,work_order_id,job_id) REFERENCES app.work_order(tenant_id,id,job_id),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES app.contractor_member(tenant_id,membership_id)
);

DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['schedule_of_rates','sor_version','sor_item','import_batch','work_order','work_order_revision','work_order_line','work_order_current','import_row_receipt','job_assignment','site_visit'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
 EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);
 -- Every ENT-2 record is an immutable fact. work_order_current is the one mutable pointer (guarded below); site_visit is read-only here.
 IF n NOT IN('work_order_current','site_visit') THEN
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END IF;
END LOOP; END $$;
CREATE TRIGGER no_delete BEFORE DELETE ON app.work_order_current FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE TRIGGER no_delete BEFORE DELETE ON app.site_visit FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();

-- The pointer moves only forward, to a later revision of the same order.
CREATE FUNCTION app.guard_work_order_current() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF NEW.work_order_id IS DISTINCT FROM OLD.work_order_id OR NOT EXISTS(
   SELECT 1 FROM app.work_order_revision n JOIN app.work_order_revision o ON(o.tenant_id,o.work_order_id)=(n.tenant_id,n.work_order_id)
   WHERE n.tenant_id=NEW.tenant_id AND n.id=NEW.revision_id AND o.id=OLD.revision_id AND n.revision>o.revision)
 THEN RAISE EXCEPTION 'the current work-order revision pointer moves only to a later revision' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_work_order_current() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_work_order_current() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER pointer_forward_only BEFORE UPDATE ON app.work_order_current FOR EACH ROW EXECUTE FUNCTION app.guard_work_order_current();

-- 6. Job guards: a work-order job exists only through the import routine, starts draft, and never changes provenance.
CREATE FUNCTION app.guard_work_order_job() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.provenance='work_order' AND (current_user<>'jobguard_migration' OR NEW.status<>'draft' OR NEW.revision<>0) THEN
   RAISE EXCEPTION 'work-order jobs are created only by the import routine' USING ERRCODE='42501'; END IF;
 ELSIF NEW.provenance IS DISTINCT FROM OLD.provenance THEN
  RAISE EXCEPTION 'job provenance is immutable' USING ERRCODE='55000';
 ELSIF OLD.provenance='work_order' AND OLD.status='draft' AND NEW.status IS DISTINCT FROM OLD.status AND (NEW.status<>'live' OR current_user<>'jobguard_migration') THEN
  RAISE EXCEPTION 'a work-order job enters live only through the import routine' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_work_order_job() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_work_order_job() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER a_work_order_job_guard BEFORE INSERT OR UPDATE ON app.job FOR EACH ROW EXECUTE FUNCTION app.guard_work_order_job();

-- 7. Exact line pricing in the database: quantity x rate x (1 + signed adjustment), rounded half-even once at the line.
CREATE FUNCTION app.sor_line_net_pence(qty text, rate bigint, adjustment_numerator bigint, adjustment_denominator bigint) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
DECLARE fraction text:=coalesce(nullif(split_part(qty,'.',2),''),''); scaled numeric:=(replace(qty,'.',''))::numeric; scale numeric:=power(10::numeric,length(fraction));
 multiplier numeric:=adjustment_denominator::numeric+adjustment_numerator::numeric; numerator numeric; denominator numeric; quotient numeric; remainder numeric;
BEGIN
 IF qty !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE='22023'; END IF;
 IF adjustment_denominator<=0 OR multiplier<0 THEN RAISE EXCEPTION 'NEGATIVE_MULTIPLIER' USING ERRCODE='22023'; END IF;
 numerator:=rate::numeric*scaled*multiplier; denominator:=scale*adjustment_denominator::numeric;
 quotient:=div(numerator,denominator); remainder:=numerator-quotient*denominator;
 IF remainder*2>denominator OR (remainder*2=denominator AND mod(quotient,2)=1) THEN quotient:=quotient+1; END IF;
 IF quotient>1000000000000 THEN RAISE EXCEPTION 'MONEY_OUT_OF_RANGE' USING ERRCODE='22003'; END IF;
 RETURN quotient::bigint;
END $$;
ALTER FUNCTION app.sor_line_net_pence(text,bigint,bigint,bigint) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.sor_line_net_pence(text,bigint,bigint,bigint) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.sor_line_net_pence(text,bigint,bigint,bigint) TO jobguard_runtime;

CREATE FUNCTION app.guard_work_order_line() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE r app.work_order_revision;
BEGIN
 SELECT * INTO r FROM app.work_order_revision WHERE tenant_id=NEW.tenant_id AND id=NEW.revision_id;
 IF r.id IS NULL OR r.status='ordered' AND r.sor_version_id IS DISTINCT FROM NEW.sor_version_id THEN
  RAISE EXCEPTION 'a line prices against its revision''s SoR version' USING ERRCODE='23514'; END IF;
 IF NEW.net_pence IS DISTINCT FROM app.sor_line_net_pence(NEW.quantity,NEW.rate_pence,r.adjustment_numerator,r.adjustment_denominator)
 THEN RAISE EXCEPTION 'line net is not the exact half-even price' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_work_order_line() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_work_order_line() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER exact_price BEFORE INSERT ON app.work_order_line FOR EACH ROW EXECUTE FUNCTION app.guard_work_order_line();

-- 8. Every revision, batch and SoR version commits with its own audit event (identifiers and hashes only), or the transaction fails.
CREATE FUNCTION app.require_work_order_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE ok boolean;
BEGIN
 IF TG_TABLE_NAME='work_order_revision' THEN
  SELECT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.id AND e.event_type IN('contractor.work_order.created','contractor.work_order.revised')
   AND e.subject_type='work-order' AND e.subject_ref=NEW.work_order_id::text AND e.payload->'hashes'->>'document'=NEW.content_hash AND e.payload->'references'->>'revisionId'=NEW.id::text) INTO ok;
 ELSIF TG_TABLE_NAME='import_batch' THEN
  SELECT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.id AND e.event_type='contractor.work_order_import.recorded'
   AND e.subject_type='work-order-import' AND e.subject_ref=NEW.id::text AND e.payload->'hashes'->>'document'=NEW.source_sha256) INTO ok;
 ELSE
  SELECT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.id AND e.event_type='contractor.sor_version.imported'
   AND e.subject_type='sor-version' AND e.subject_ref=NEW.id::text AND e.payload->'hashes'->>'document'=NEW.content_hash) INTO ok;
 END IF;
 IF NOT ok THEN RAISE EXCEPTION 'WORK_ORDER_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.require_work_order_audit() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_work_order_audit() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE CONSTRAINT TRIGGER work_order_revision_audit AFTER INSERT ON app.work_order_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_work_order_audit();
CREATE CONSTRAINT TRIGGER import_batch_audit AFTER INSERT ON app.import_batch DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_work_order_audit();
CREATE CONSTRAINT TRIGGER sor_version_audit AFTER INSERT ON app.sor_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_work_order_audit();

-- 9. Authority. The role/permission table below is a copy of ENT-1's (0054) and is proved equal to it in the conformance tests.
CREATE FUNCTION app.contractor_role_permits(p_role text, p_permission text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT p_permission=ANY(CASE p_role
 WHEN 'owner' THEN ARRAY['organisation.read','organisation.manage','client.invite','contract.read','contract.manage']
 WHEN 'admin' THEN ARRAY['organisation.read','organisation.manage','client.invite','contract.read','contract.manage']
 WHEN 'operative' THEN ARRAY['job.read','extra.log','resident.read']
 WHEN 'supervisor' THEN ARRAY['contract.read','job.read','extra.log','extra.price','extra.approve','dashboard.read','resident.read']
 WHEN 'surveyor' THEN ARRAY['contract.read','job.read','extra.price','extra.approve','dashboard.read','resident.read']
 WHEN 'commercial_manager' THEN ARRAY['client.invite','contract.read','contract.manage','job.read','extra.price','extra.approve','dashboard.read','resident.read']
 WHEN 'finance' THEN ARRAY['contract.read','data.export','data.import','statement.read']
 WHEN 'read_only' THEN ARRAY['contract.read','job.read','dashboard.read']
 WHEN 'client_approver' THEN ARRAY['contract.read'] ELSE ARRAY[]::text[] END)
$$;
ALTER FUNCTION app.contractor_role_permits(text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.contractor_role_permits(text,text) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.contractor_role_permits(text,text) TO jobguard_runtime;

-- Work-order import: organisation.manage (on a client, or tenant-wide) or data.import (tenant-wide). Same predicate as app.bind_contractor_parties (0102).
CREATE FUNCTION app.work_order_import_permitted(actor uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(app.contractor_member_active(actor) AND (
  app.contractor_allowed(actor,'data.import',nullif(current_setting('app.tenant_id',true),'')::uuid)
  OR app.contractor_allowed(actor,'organisation.manage',nullif(current_setting('app.tenant_id',true),'')::uuid)
  OR EXISTS(SELECT 1 FROM app.client_organisation c WHERE app.contractor_allowed(actor,'organisation.manage',c.id))),false)
$$;
-- SoR version import: contract.manage, tenant-wide (a price list is tenant data, not one client's).
CREATE FUNCTION app.sor_import_permitted(actor uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(app.contractor_member_active(actor) AND app.contractor_allowed(actor,'contract.manage',nullif(current_setting('app.tenant_id',true),'')::uuid),false)
$$;
ALTER FUNCTION app.work_order_import_permitted(uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.sor_import_permitted(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.work_order_import_permitted(uuid),app.sor_import_permitted(uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.work_order_import_permitted(uuid),app.sor_import_permitted(uuid) TO jobguard_runtime;

-- Authoritative job scope (ENT-1 deliberately cannot resolve a job id): the job's team is the team of its CURRENT revision's assignment.
CREATE FUNCTION app.contractor_job_team(p_job uuid) RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT a.team_id FROM app.work_order w
 JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id)
 JOIN app.job_assignment a ON(a.tenant_id,a.revision_id)=(c.tenant_id,c.revision_id) AND a.membership_id IS NULL
 WHERE w.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND w.job_id=p_job
$$;
CREATE FUNCTION app.contractor_job_assigned(actor uuid, p_job uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app.work_order w
 JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id)
 JOIN app.job_assignment a ON(a.tenant_id,a.revision_id)=(c.tenant_id,c.revision_id) AND a.membership_id=actor
 WHERE w.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND w.job_id=p_job)
$$;
CREATE FUNCTION app.contractor_job_allowed(actor uuid, p_permission text, p_job uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(app.contractor_member_active(actor) AND EXISTS(
  SELECT 1 FROM app.job j
  JOIN app.team t ON t.tenant_id=j.tenant_id AND t.id=app.contractor_job_team(j.id)
  JOIN app.org_unit b ON(b.tenant_id,b.id)=(t.tenant_id,t.branch_id)
  JOIN app.role_grant g ON g.tenant_id=t.tenant_id AND g.membership_id=actor
  WHERE j.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND j.id=p_job AND j.provenance='work_order'
  AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
  AND app.contractor_role_permits(g.role,p_permission)
  AND (g.scope_kind='tenant' AND g.scope_id=g.tenant_id OR g.scope_kind='team' AND g.scope_id=t.id OR g.scope_kind='branch' AND g.scope_id=b.id OR g.scope_kind='region' AND g.scope_id=b.parent_id)
  -- An operative acts only on a job they are assigned to, from a team they are an active member of (ENT-1 team rule + the job assignment).
  AND (g.role<>'operative' OR (app.contractor_job_assigned(actor,j.id) AND EXISTS(SELECT 1 FROM app.team_membership tm WHERE tm.tenant_id=g.tenant_id AND tm.membership_id=actor AND tm.team_id=t.id AND tm.active
    AND tm.revision=(SELECT max(x.revision) FROM app.team_membership x WHERE(x.tenant_id,x.membership_id,x.team_id)=(tm.tenant_id,tm.membership_id,tm.team_id)))))),false)
$$;
ALTER FUNCTION app.contractor_job_team(uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.contractor_job_assigned(uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.contractor_job_allowed(uuid,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.contractor_job_team(uuid),app.contractor_job_assigned(uuid,uuid),app.contractor_job_allowed(uuid,text,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.contractor_job_team(uuid),app.contractor_job_assigned(uuid,uuid),app.contractor_job_allowed(uuid,text,uuid) TO jobguard_runtime;

-- 0102's read_contractor_resident, unchanged except the last authority test: a job's scope is now resolved from its persisted assignment
-- (still never from client/branch/team membership alone), so a job with no assignment still reads as not-found for every actor.
CREATE OR REPLACE FUNCTION app.read_contractor_resident(actor uuid,p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
END $$;
ALTER FUNCTION app.read_contractor_resident(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.read_contractor_resident(uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.read_contractor_resident(uuid,uuid) TO jobguard_runtime;

-- 10. Controlled write routines. Runtime has SELECT only on every ENT-2 table; these are the only writers.
-- Step 1 of an order: the draft work-order job and its immutable contractor job-track binding (SH-1). The CH-3b routine binds the parties
-- next (it refuses an incomplete order with CONTRACTOR_PARTIES_REQUIRED), then work_order_commit records the order and enters live.
CREATE FUNCTION app.work_order_begin(actor uuid, p_job uuid, p_title text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 INSERT INTO app.job(id,tenant_id,title,status,revision,provenance) VALUES(p_job,t,left(p_title,200),'draft',0,'work_order');
 INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES(t,p_job,'contractor','synthetic_demo','work_order_import');
 RETURN 0;
END $$;
ALTER FUNCTION app.work_order_begin(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.work_order_begin(uuid,uuid,text) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.work_order_begin(uuid,uuid,text) TO jobguard_runtime;

CREATE FUNCTION app.work_order_commit(actor uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
  SELECT * INTO job_row FROM app.job WHERE tenant_id=t AND id=binding.job_id FOR UPDATE;
  IF job_row.provenance<>'work_order' OR job_row.status<>'draft' THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  IF (payload->>'expectedRevision')::integer<>0 OR status_value<>'ordered' THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  INSERT INTO app.work_order(tenant_id,id,job_id,client_id,contract_id,contract_version_id,reference)
  VALUES(t,binding.work_order_id,binding.job_id,binding.client_id,binding.contract_id,binding.contract_version_id,payload->>'reference') RETURNING * INTO wo;
  revision_no:=1;
 ELSE
  SELECT * INTO wo FROM app.work_order WHERE tenant_id=t AND id=(payload->>'workOrderId')::uuid FOR UPDATE;
  IF wo.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
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
END $$;
ALTER FUNCTION app.work_order_commit(uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.work_order_commit(uuid,jsonb) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.work_order_commit(uuid,jsonb) TO jobguard_runtime;

-- The batch and its row receipts are written once, last in the import transaction, so a batch always matches the rows it describes.
CREATE FUNCTION app.import_batch_record(actor uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
END $$;
ALTER FUNCTION app.import_batch_record(uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.import_batch_record(uuid,jsonb) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.import_batch_record(uuid,jsonb) TO jobguard_runtime;

CREATE FUNCTION app.import_sor_version(actor uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
END $$;
ALTER FUNCTION app.import_sor_version(uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.import_sor_version(uuid,jsonb) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.import_sor_version(uuid,jsonb) TO jobguard_runtime;

-- A revised row must restate the parties its job was bound to (CH-3b binds them once per job); a different site, client, contract or resident is refused,
-- never silently dropped. The resident contact is compared inside this routine and never leaves it.
CREATE FUNCTION app.work_order_parties_unchanged(actor uuid, p_work_order uuid, p_client uuid, p_contract uuid, p_site_revision uuid, p_resident jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
BEGIN
 IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN EXISTS(SELECT 1 FROM app.contractor_party_binding b
  JOIN app.job_party_binding jb ON(jb.tenant_id,jb.job_id,jb.id)=(b.tenant_id,b.job_id,b.party_binding_id)
  JOIN app.contractor_resident_contact r ON(r.tenant_id,r.job_id,r.binding_id)=(b.tenant_id,b.job_id,b.id)
  WHERE b.tenant_id=t AND b.work_order_id=p_work_order AND b.client_id=p_client AND b.contract_id=p_contract AND jb.site_revision_id=p_site_revision
  AND ((r.contact IS NOT NULL AND p_resident->>'kind'='contact' AND r.contact=p_resident->'contact')
    OR (r.contact IS NULL AND p_resident->>'kind'='none' AND r.no_resident_reason=p_resident->>'reason')));
END $$;
ALTER FUNCTION app.work_order_parties_unchanged(uuid,uuid,uuid,uuid,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.work_order_parties_unchanged(uuid,uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.work_order_parties_unchanged(uuid,uuid,uuid,uuid,uuid,jsonb) TO jobguard_runtime;
COMMIT;
