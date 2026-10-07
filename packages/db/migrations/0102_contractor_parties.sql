BEGIN;
-- Expand-only CH-3b. No work-order/team tables, real-data enablement or retention period.
ALTER TABLE app.client_contract_version ADD CONSTRAINT client_contract_version_party_identity UNIQUE(tenant_id,client_id,contract_id,id);
CREATE TABLE app.contractor_client_customer (
 tenant_id uuid NOT NULL, id uuid NOT NULL, client_id uuid NOT NULL, customer_id uuid NOT NULL, customer_revision_id uuid NOT NULL,
 command_id uuid NOT NULL, actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,client_id), UNIQUE(tenant_id,client_id,customer_id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,client_id) REFERENCES app.client_organisation(tenant_id,id),
 FOREIGN KEY(tenant_id,customer_id,customer_revision_id) REFERENCES app.customer_revision(tenant_id,customer_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id)
);
CREATE TABLE app.contractor_party_binding (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, work_order_id uuid NOT NULL,
 client_id uuid NOT NULL, contract_id uuid NOT NULL, contract_version_id uuid NOT NULL, customer_id uuid NOT NULL,
 party_binding_id uuid NOT NULL, command_id uuid NOT NULL, actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id), UNIQUE(tenant_id,work_order_id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,client_id,contract_id) REFERENCES app.client_contract(tenant_id,client_id,id),
 FOREIGN KEY(tenant_id,client_id,contract_id,contract_version_id) REFERENCES app.client_contract_version(tenant_id,client_id,contract_id,id),
 FOREIGN KEY(tenant_id,client_id,customer_id) REFERENCES app.contractor_client_customer(tenant_id,client_id,customer_id),
 FOREIGN KEY(tenant_id,job_id,party_binding_id) REFERENCES app.job_party_binding(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id)
);
CREATE TABLE app.contractor_resident_contact (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, binding_id uuid NOT NULL,
 retention_class text NOT NULL DEFAULT 'contractor_resident_contact_d07_d12_pending' CHECK(retention_class='contractor_resident_contact_d07_d12_pending'),
 contact jsonb, no_resident_reason text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id),
 FOREIGN KEY(tenant_id,job_id,binding_id) REFERENCES app.contractor_party_binding(tenant_id,job_id,id),
 CHECK((contact IS NOT NULL AND no_resident_reason IS NULL) OR (contact IS NULL AND no_resident_reason IS NOT NULL AND no_resident_reason IN('void_property','communal_area','client_withheld')))
);
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['contractor_client_customer','contractor_party_binding','contractor_resident_contact'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
 EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record()',n);
 END LOOP; END $$;
GRANT SELECT ON app.contractor_client_customer,app.contractor_party_binding TO jobguard_runtime;
-- Resident contents cannot be selected through arbitrary runtime SQL, even with a correct tenant context.
GRANT SELECT(tenant_id,id,job_id,binding_id,retention_class,created_at) ON app.contractor_resident_contact TO jobguard_runtime;

CREATE FUNCTION app.valid_contractor_resident(d jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_typeof(d)='object' AND CASE d->>'kind'
 WHEN 'none' THEN d-ARRAY['kind','reason']='{}'::jsonb AND jsonb_typeof(d->'reason')='string' AND d->>'reason' IN('void_property','communal_area','client_withheld')
 WHEN 'contact' THEN d-ARRAY['kind','contact']='{}'::jsonb AND jsonb_typeof(d->'contact')='object'
  AND d->'contact'-ARRAY['version','name','phone','email']='{}'::jsonb AND d->'contact'->>'version'='resident-contact.v1'
  AND app.valid_party_revision_text(d->'contact'->'name',1,160) AND (d->'contact' ? 'phone' OR d->'contact' ? 'email')
  AND (NOT d->'contact' ? 'phone' OR app.valid_party_revision_text(d->'contact'->'phone',3,40))
  AND (NOT d->'contact' ? 'email' OR (app.valid_party_revision_text(d->'contact'->'email',1,320)
   AND d->'contact'->>'email' ~* $email$^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+invalid$$email$))
 ELSE false END,false)
$$;
ALTER FUNCTION app.valid_contractor_resident(jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.valid_contractor_resident(jsonb) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.valid_contractor_resident(jsonb) TO jobguard_runtime;
ALTER TABLE app.contractor_resident_contact ADD CONSTRAINT valid_resident CHECK(contact IS NULL OR app.valid_contractor_resident(jsonb_build_object('kind','contact','contact',contact)));

CREATE FUNCTION app.link_contractor_customer(actor uuid,client uuid,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
 SELECT * INTO c FROM app.customer_revision WHERE tenant_id=t AND id=(payload->>'customerRevisionId')::uuid;
 IF c.id IS NULL THEN RAISE EXCEPTION 'PARTY_NOT_FOUND' USING ERRCODE='23503'; END IF;
 SELECT client_type INTO client_kind FROM app.client_organisation WHERE tenant_id=t AND id=client;
 IF c.payload->>'type' IS DISTINCT FROM client_kind THEN RAISE EXCEPTION 'CUSTOMER_TYPE_MISMATCH' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM app.contractor_client_customer WHERE tenant_id=t AND client_id=client) THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 result:=jsonb_build_object('version','contractor-party-result.v1','environment','synthetic_demo','commandId',payload->>'commandId','id',row_id,'realExternalActions',0);
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES((payload->>'commandId')::uuid,t,'contractor_parties.link',(payload->>'commandId'),h,'succeeded',result,actor,clock_timestamp());
 INSERT INTO app.contractor_client_customer(tenant_id,id,client_id,customer_id,customer_revision_id,command_id,actor_membership_id)
 VALUES(t,row_id,client,c.customer_id,c.id,(payload->>'commandId')::uuid,actor);
 RETURN result;
END $$;

CREATE FUNCTION app.bind_contractor_parties(actor uuid,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; j app.job; link app.contractor_client_customer; c app.customer_revision; p app.customer_revision; s app.site_revision;
 cv uuid; prior app.command_receipt; h text; result jsonb; row_id uuid:=gen_random_uuid(); party_id uuid:=gen_random_uuid(); expected integer;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR payload->>'environment' IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 IF t IS NULL OR NOT coalesce(app.contractor_member_active(actor),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF payload->>'clientId' IS NULL OR payload->>'contractId' IS NULL OR payload->>'siteRevisionId' IS NULL OR payload->'resident' IS NULL OR payload->'resident'='null'::jsonb THEN RAISE EXCEPTION 'CONTRACTOR_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 IF NOT (coalesce(app.contractor_allowed(actor,'organisation.manage',(payload->>'clientId')::uuid),false) OR coalesce(app.contractor_allowed(actor,'data.import',t),false)) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR payload-ARRAY['version','environment','commandId','jobId','workOrderId','expectedJobRevision','clientId','contractId','siteRevisionId','payingPartyRevisionId','resident']<>'{}'::jsonb
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
 SELECT * INTO c FROM app.customer_revision WHERE tenant_id=t AND id=link.customer_revision_id;
 SELECT * INTO p FROM app.customer_revision WHERE tenant_id=t AND id=coalesce((payload->>'payingPartyRevisionId')::uuid,c.id);
 SELECT * INTO s FROM app.site_revision WHERE tenant_id=t AND id=(payload->>'siteRevisionId')::uuid;
 IF c.id IS NULL OR p.id IS NULL OR s.id IS NULL THEN RAISE EXCEPTION 'PARTY_NOT_FOUND' USING ERRCODE='23503'; END IF;
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
END $$;

CREATE FUNCTION app.read_contractor_resident(actor uuid,job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; result jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 -- Never substitute client/branch/team membership for a persisted job assignment.
 -- ENT-1 deliberately cannot resolve job IDs; ENT-2 must provide that resolution and prove its positive cases.
 IF t IS NULL OR NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=job)
 OR EXISTS(SELECT 1 FROM app.org_unit WHERE tenant_id=t AND id=job UNION ALL SELECT 1 FROM app.team WHERE tenant_id=t AND id=job UNION ALL SELECT 1 FROM app.client_organisation WHERE tenant_id=t AND id=job)
 OR NOT coalesce(app.contractor_allowed(actor,'resident.read',job),false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT jsonb_build_object('version','contractor-resident-read.v1','environment','synthetic_demo','jobId',job,'resident',
 CASE WHEN r.contact IS NULL THEN jsonb_build_object('kind','none','reason',r.no_resident_reason) ELSE jsonb_build_object('kind','contact','contact',r.contact) END)
 INTO result FROM app.contractor_resident_contact r WHERE r.tenant_id=t AND r.job_id=job;
 IF result IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN result;
END $$;

-- An ENT-1 target UUID is not currently a job scope. In particular, client/unit UUID collisions cannot confer job access.
-- Require an actual job row before any scoped read can return data (ENT-2 will add authoritative assignment resolution).
CREATE FUNCTION app.require_contractor_party_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE receipt app.command_receipt; action text; subject text; BEGIN
 SELECT * INTO receipt FROM app.command_receipt WHERE tenant_id=NEW.tenant_id AND command_id=NEW.command_id;
 action:=CASE TG_TABLE_NAME WHEN 'contractor_client_customer' THEN 'customer_linked' ELSE 'bound' END;
 subject:=CASE TG_TABLE_NAME WHEN 'contractor_client_customer' THEN NEW.client_id::text ELSE to_jsonb(NEW)->>'job_id' END;
 IF receipt.status IS DISTINCT FROM 'succeeded' OR receipt.actor_membership_id IS DISTINCT FROM NEW.actor_membership_id OR receipt.result->>'id' IS DISTINCT FROM NEW.id::text
 OR receipt.command_type IS DISTINCT FROM CASE TG_TABLE_NAME WHEN 'contractor_client_customer' THEN 'contractor_parties.link' ELSE 'contractor_parties.bind' END
 OR NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.command_id AND e.actor_ref='membership:'||NEW.actor_membership_id
  AND e.event_type='contractor.parties.'||action AND e.subject_ref=subject AND e.payload->'references'->>'commandId'=NEW.command_id::text
  AND e.payload->'references'->>'identityId'=NEW.id::text AND e.payload->'hashes'->>'document'=receipt.request_hash)
 THEN RAISE EXCEPTION 'CONTRACTOR_PARTY_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='contractor_party_binding' AND NOT EXISTS(SELECT 1 FROM app.contractor_resident_contact r WHERE r.tenant_id=NEW.tenant_id AND r.job_id=(to_jsonb(NEW)->>'job_id')::uuid AND r.binding_id=NEW.id) THEN RAISE EXCEPTION 'CONTRACTOR_PARTIES_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.require_contractor_party_record() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_contractor_party_record() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE CONSTRAINT TRIGGER contractor_client_customer_record AFTER INSERT ON app.contractor_client_customer DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_contractor_party_record();
CREATE CONSTRAINT TRIGGER contractor_party_binding_record AFTER INSERT ON app.contractor_party_binding DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_contractor_party_record();
ALTER FUNCTION app.link_contractor_customer(uuid,uuid,jsonb) OWNER TO jobguard_migration;
ALTER FUNCTION app.bind_contractor_parties(uuid,jsonb) OWNER TO jobguard_migration;
ALTER FUNCTION app.read_contractor_resident(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.link_contractor_customer(uuid,uuid,jsonb),app.bind_contractor_parties(uuid,jsonb),app.read_contractor_resident(uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.link_contractor_customer(uuid,uuid,jsonb),app.bind_contractor_parties(uuid,jsonb),app.read_contractor_resident(uuid,uuid) TO jobguard_runtime;
-- A forged receipt without its effect/audit cannot commit either.
CREATE FUNCTION app.require_contractor_party_receipt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.status<>'succeeded' OR NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.command_id
  AND e.actor_ref='membership:'||NEW.actor_membership_id AND e.payload->'hashes'->>'document'=NEW.request_hash)
 OR (NEW.command_type='contractor_parties.link' AND NOT EXISTS(SELECT 1 FROM app.contractor_client_customer b WHERE b.tenant_id=NEW.tenant_id AND b.command_id=NEW.command_id AND b.id::text=NEW.result->>'id'))
 OR (NEW.command_type='contractor_parties.bind' AND NOT EXISTS(SELECT 1 FROM app.contractor_party_binding b WHERE b.tenant_id=NEW.tenant_id AND b.command_id=NEW.command_id AND b.id::text=NEW.result->>'id'))
 THEN RAISE EXCEPTION 'CONTRACTOR_PARTY_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.require_contractor_party_receipt() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_contractor_party_receipt() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE CONSTRAINT TRIGGER contractor_party_receipt_record AFTER INSERT ON app.command_receipt DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW WHEN(NEW.command_type IN('contractor_parties.link','contractor_parties.bind')) EXECUTE FUNCTION app.require_contractor_party_receipt();
COMMIT;
