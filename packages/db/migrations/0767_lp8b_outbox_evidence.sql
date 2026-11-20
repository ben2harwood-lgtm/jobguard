-- LP-8b RED. Forward-only; LP-8a and request-binding caller cutover land first.
BEGIN;
-- LP-6c already grants the bound-context readers to these owners.

-- A row's hash is checked against its bytes as well as the exact approval.
-- This trigger also protects owner-side writers; it confers no EXECUTE power.
CREATE FUNCTION app.lp8b_outbox_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE a app.action_authorization; r app.decision_resolution;
BEGIN
 -- Direct cluster administration can restore historical rows. Checked
 -- SECURITY DEFINER product writers execute as their non-superuser owners.
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW.tenant_id,NEW.authorization_id,NEW.adapter,NEW.provider_effect_key,NEW.action_type,NEW.recipient,NEW.content_hash,NEW.immutable_content,NEW.aggregate_revision,NEW.amount_pence,NEW.currency,NEW.policy_version,NEW.authorization_expires_at,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.authorization_id,OLD.adapter,OLD.provider_effect_key,OLD.action_type,OLD.recipient,OLD.content_hash,OLD.immutable_content,OLD.aggregate_revision,OLD.amount_pence,OLD.currency,OLD.policy_version,OLD.authorization_expires_at,OLD.created_at) THEN
   RAISE EXCEPTION 'APPROVED_OUTBOX_IMMUTABLE' USING ERRCODE='55000'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO a FROM app.action_authorization WHERE (tenant_id,id)=(NEW.tenant_id,NEW.authorization_id) FOR SHARE;
 SELECT * INTO r FROM app.decision_resolution WHERE (tenant_id,id)=(a.tenant_id,a.resolution_id);
 IF NEW.tenant_id IS DISTINCT FROM app.current_tenant()
  OR a.id IS NULL OR a.revoked_at IS NOT NULL OR a.expires_at<=clock_timestamp()
  OR r.resolution IS DISTINCT FROM 'approved' OR r.decision_id IS DISTINCT FROM a.decision_id
  OR r.actor_membership_id IS DISTINCT FROM a.actor_membership_id
  OR NOT EXISTS(SELECT 1 FROM app.membership m WHERE (m.tenant_id,m.id)=(a.tenant_id,a.actor_membership_id)
   AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation x WHERE (x.tenant_id,x.membership_id)=(m.tenant_id,m.id)))
  OR ROW(NEW.action_type,NEW.recipient,NEW.content_hash,NEW.aggregate_revision,NEW.amount_pence,NEW.currency,NEW.policy_version)
   IS DISTINCT FROM ROW(a.action_type,a.recipient,a.content_hash,a.aggregate_revision,a.amount_pence,a.currency,a.policy_version)
  OR NEW.content_hash IS DISTINCT FROM encode(sha256(convert_to(NEW.immutable_content,'UTF8')),'hex')
  OR NEW.authorization_expires_at>a.expires_at OR NEW.authorization_expires_at<=clock_timestamp()
  OR NEW.claimed_at IS NOT NULL THEN
  RAISE EXCEPTION 'OUTBOX_AUTHORIZATION_INVALID' USING ERRCODE='42501';
 END IF;
 IF NEW.status='pending' AND NEW.completed_at IS NULL THEN
  RETURN NEW;
 END IF;
 -- 0764 issues and records synthetic invoice delivery in one transaction.
 -- Admit only the completed record for the exact invoice already issued by
 -- that transaction. The runtime entry point always inserts pending work.
 IF current_user='jobguard_migration' AND NEW.adapter='fake_invoice_delivery'
  AND NEW.action_type='final_account.issue' AND NEW.status='succeeded'
  AND NEW.completed_at=transaction_timestamp()
  AND EXISTS(SELECT 1 FROM app.customer_invoice i
   WHERE (i.tenant_id,i.authorization_id)=(NEW.tenant_id,NEW.authorization_id)
    AND i.synthetic AND i.created_at=transaction_timestamp()
    AND i.pdf_sha256=NEW.content_hash AND i.pdf_bytes=convert_to(NEW.immutable_content,'UTF8')
    AND NEW.provider_effect_key IN ('practice-invoice:'||i.id,'lock-invoice:'||i.id)) THEN
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'OUTBOX_AUTHORIZATION_INVALID' USING ERRCODE='42501';
END $$;
ALTER FUNCTION app.lp8b_outbox_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp8b_outbox_guard() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER lp8b_authorized_content BEFORE INSERT OR UPDATE ON app.action_outbox
 FOR EACH ROW EXECUTE FUNCTION app.lp8b_outbox_guard();

CREATE FUNCTION app.insert_authorized_action(p_actor uuid,p_tenant uuid,p_id uuid,p_authorization uuid,
 p_adapter text,p_effect text,p_action text,p_recipient text,p_hash text,p_content text,p_revision integer,
 p_amount bigint,p_currency text,p_policy text,p_expires timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE a app.action_authorization;
BEGIN
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM app.action_authorization WHERE (tenant_id,id)=(p_tenant,p_authorization) FOR SHARE;
 IF a.id IS NULL OR a.actor_membership_id IS DISTINCT FROM p_actor THEN
  RAISE EXCEPTION 'OUTBOX_AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor FOR SHARE;
 INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,
  content_hash,immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at)
 VALUES(p_id,p_tenant,p_authorization,p_adapter,p_effect,p_action,p_recipient,p_hash,p_content,p_revision,p_amount,p_currency,p_policy,p_expires);
END $$;
ALTER FUNCTION app.insert_authorized_action(uuid,uuid,uuid,uuid,text,text,text,text,text,text,integer,bigint,text,text,timestamptz) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.insert_authorized_action(uuid,uuid,uuid,uuid,text,text,text,text,text,text,integer,bigint,text,text,timestamptz) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.insert_authorized_action(uuid,uuid,uuid,uuid,text,text,text,text,text,text,integer,bigint,text,text,timestamptz) TO jobguard_runtime;
REVOKE INSERT ON app.action_outbox FROM jobguard_runtime;
CREATE UNIQUE INDEX lp8b_one_outbox_per_approval ON app.action_outbox(tenant_id,authorization_id);

-- Invalidation is an owner decision, not an ordinary member's proof write.
CREATE FUNCTION app.lp8b_invalidation_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN RETURN NEW; END IF;
 IF NEW.tenant_id IS DISTINCT FROM app.current_tenant() OR NEW.actor_membership_id IS DISTINCT FROM app.current_actor()
  OR NOT EXISTS(SELECT 1 FROM app.membership m WHERE (m.tenant_id,m.id)=(NEW.tenant_id,NEW.actor_membership_id)
   AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation x WHERE (x.tenant_id,x.membership_id)=(m.tenant_id,m.id))) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 NEW.invalidated_at:=clock_timestamp();
 RETURN NEW;
END $$;
ALTER FUNCTION app.lp8b_invalidation_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp8b_invalidation_guard() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER lp8b_owner_invalidation BEFORE INSERT ON app.evidence_invalidation
 FOR EACH ROW EXECUTE FUNCTION app.lp8b_invalidation_guard();

-- Keep 0122's graph/receipt/sequence/audit protections, adding the live actor
-- and scoped grant check to events AND equivalent duplicate/order inputs.
CREATE FUNCTION app.lp8b_check_extra_command(p_tenant uuid,p_actor uuid,p_job uuid,p_command uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c app.command_lifecycle_claim; r app.command_receipt;
BEGIN
 IF p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM app.command_receipt WHERE (tenant_id,command_id)=(p_tenant,p_command);
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE (tenant_id,command_id)=(p_tenant,p_command);
 IF r.status IS DISTINCT FROM 'processing' OR r.actor_membership_id IS DISTINCT FROM p_actor
  OR c.command_id IS NULL OR c.actor_membership_id IS DISTINCT FROM p_actor
  OR c.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR c.resource->>'subjectRef' IS DISTINCT FROM p_job::text THEN
  RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 PERFORM app.lp5b_contractor_permission(r.command_type,p_actor,p_job,c.significant_input->'input');
END $$;
GRANT CREATE ON SCHEMA app TO jobguard_command_writer;
ALTER FUNCTION app.lp8b_check_extra_command(uuid,uuid,uuid,uuid) OWNER TO jobguard_command_writer;
REVOKE CREATE ON SCHEMA app FROM jobguard_command_writer;
REVOKE ALL ON FUNCTION app.lp8b_check_extra_command(uuid,uuid,uuid,uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.lp8b_check_extra_command(uuid,uuid,uuid,uuid) TO jobguard_runtime;
CREATE FUNCTION app.lp8b_extra_fact_actor() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- Owner routines for billing/settlement have their own exact contracts and
 -- no LP-5 repository claim. Runtime cannot assume this owner. 0122 still
 -- runs for every caller, including its command/actor, graph and audit checks.
 IF current_user<>'jobguard_migration' AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
  PERFORM app.lp8b_check_extra_command(NEW.tenant_id,NEW.actor_membership_id,NEW.job_id,NEW.command_id);
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.lp8b_extra_fact_actor() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp8b_extra_fact_actor() FROM PUBLIC,jobguard_runtime;

DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['extra_event','extra_duplicate_link','extra_order_line_link'] LOOP
  EXECUTE format('CREATE TRIGGER a_lp8b_actor BEFORE INSERT ON app.%I FOR EACH ROW EXECUTE FUNCTION app.lp8b_extra_fact_actor()',n);
 END LOOP;
END $$;

-- Historical actors come only from their immutable receipt, never a guessed owner.
ALTER TABLE app.property_constraint_fact ADD COLUMN actor_membership_id uuid;
ALTER TABLE app.counterparty_check ADD COLUMN actor_membership_id uuid;
ALTER TABLE app.property_constraint_fact DISABLE TRIGGER prevention_immutable;
ALTER TABLE app.counterparty_check DISABLE TRIGGER prevention_immutable;
-- The migration runs as the table owner. Keep this backfill in the same
-- transaction as the ALTER locks and restore FORCE before releasing them.
ALTER TABLE app.property_constraint_fact NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.counterparty_check NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.command_receipt NO FORCE ROW LEVEL SECURITY;
UPDATE app.property_constraint_fact f SET actor_membership_id=c.actor_membership_id
 FROM app.command_receipt c WHERE (c.tenant_id,c.command_id)=(f.tenant_id,f.command_id);
UPDATE app.counterparty_check f SET actor_membership_id=c.actor_membership_id
 FROM app.command_receipt c WHERE (c.tenant_id,c.command_id)=(f.tenant_id,f.command_id);
ALTER TABLE app.command_receipt FORCE ROW LEVEL SECURITY;
ALTER TABLE app.counterparty_check FORCE ROW LEVEL SECURITY;
ALTER TABLE app.property_constraint_fact FORCE ROW LEVEL SECURITY;
ALTER TABLE app.property_constraint_fact ENABLE TRIGGER prevention_immutable;
ALTER TABLE app.counterparty_check ENABLE TRIGGER prevention_immutable;
ALTER TABLE app.property_constraint_fact ALTER COLUMN actor_membership_id SET NOT NULL;
ALTER TABLE app.counterparty_check ALTER COLUMN actor_membership_id SET NOT NULL;
ALTER TABLE app.property_constraint_fact ADD CONSTRAINT lp8b_property_actor_fk FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id);
ALTER TABLE app.counterparty_check ADD CONSTRAINT lp8b_counterparty_actor_fk FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id);
CREATE FUNCTION app.lp8b_prevention_actor() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE c app.command_receipt;
BEGIN
 SELECT * INTO c FROM app.command_receipt WHERE (tenant_id,command_id)=(NEW.tenant_id,NEW.command_id);
 IF NEW.tenant_id IS DISTINCT FROM app.current_tenant() OR c.actor_membership_id IS DISTINCT FROM app.current_actor()
  OR c.status IS DISTINCT FROM 'processing' OR c.command_type IS DISTINCT FROM 'prevention.check'
  OR NEW.actor_membership_id IS DISTINCT FROM c.actor_membership_id
  OR NOT EXISTS(SELECT 1 FROM app.membership m WHERE (m.tenant_id,m.id)=(NEW.tenant_id,NEW.actor_membership_id)
   AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation x WHERE (x.tenant_id,x.membership_id)=(m.tenant_id,m.id))) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.lp8b_prevention_actor() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp8b_prevention_actor() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER lp8b_prevention_actor AFTER INSERT ON app.property_constraint_fact FOR EACH ROW EXECUTE FUNCTION app.lp8b_prevention_actor();
CREATE TRIGGER lp8b_prevention_actor AFTER INSERT ON app.counterparty_check FOR EACH ROW EXECUTE FUNCTION app.lp8b_prevention_actor();

ALTER TABLE app.evidence_upload ADD COLUMN verified_byte_length bigint CHECK(verified_byte_length>0);
-- Existing finalized originals are the only historical source for the measured length.
ALTER TABLE app.evidence_upload NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_object NO FORCE ROW LEVEL SECURITY;
UPDATE app.evidence_upload u SET verified_byte_length=e.byte_length FROM app.evidence_object e
 WHERE (e.tenant_id,e.upload_id)=(u.tenant_id,u.id) AND u.state='verified' AND e.kind='original' AND e.byte_length>0;
ALTER TABLE app.evidence_object FORCE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_upload FORCE ROW LEVEL SECURITY;

-- Upload metadata is a proposal until the server has read the exact version.
-- Ordinary SQL cannot mark it verified or retarget its identity/hash/key.
CREATE FUNCTION app.lp8b_upload_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 -- Match the existing administrative upload path without giving a runtime
 -- session executing a definer routine maintenance authority.
 IF pg_has_role(current_user,'jobguard_migration','USAGE')
  AND pg_has_role(session_user,'jobguard_migration','USAGE') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.state='verified' AND NEW IS DISTINCT FROM OLD THEN
   RAISE EXCEPTION 'VERIFIED_UPLOAD_IMMUTABLE' USING ERRCODE='55000'; END IF;
  IF ROW(NEW.tenant_id,NEW.id,NEW.job_id,NEW.scope_item_id,NEW.object_key,NEW.expected_sha256,NEW.expected_content_type,NEW.maximum_bytes,NEW.retention_class,NEW.device_captured_at,NEW.server_received_at,NEW.expires_at)
   IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.job_id,OLD.scope_item_id,OLD.object_key,OLD.expected_sha256,OLD.expected_content_type,OLD.maximum_bytes,OLD.retention_class,OLD.device_captured_at,OLD.server_received_at,OLD.expires_at) THEN
   RAISE EXCEPTION 'UPLOAD_IDENTITY_IMMUTABLE' USING ERRCODE='55000'; END IF;
 END IF;
 IF current_user<>'jobguard_migration' THEN
  IF TG_OP='INSERT' THEN NEW.server_received_at:=clock_timestamp(); NEW.created_at:=transaction_timestamp(); END IF;
  IF NEW.tenant_id IS DISTINCT FROM app.current_tenant()
   OR NEW.object_key IS DISTINCT FROM 'tenants/'||NEW.tenant_id::text||'/uploads/'||NEW.id::text||'/original'
   OR (TG_OP='INSERT' AND (NEW.state<>'pending' OR NEW.object_version_id IS NOT NULL OR NEW.server_verified_at IS NOT NULL))
   OR NEW.state='verified' OR NEW.verified_byte_length IS NOT NULL THEN RAISE EXCEPTION 'EVIDENCE_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.lp8b_upload_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp8b_upload_guard() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER a_lp8b_verified_upload BEFORE UPDATE ON app.evidence_upload
 FOR EACH ROW WHEN (OLD.state='verified' AND OLD.object_version_id IS DISTINCT FROM NEW.object_version_id
  AND current_user<>'jobguard_migration')
 EXECUTE FUNCTION app.lp8b_upload_guard();
CREATE TRIGGER b_lp8b_upload BEFORE INSERT OR UPDATE ON app.evidence_upload
 FOR EACH ROW EXECUTE FUNCTION app.lp8b_upload_guard();

-- Bytes have already been obtained through readExactVersion outside this SQL
-- transaction. SQL independently binds that result to the locked upload. It
-- cannot prove a remote store exists; the storage adapter remains a trust boundary.
CREATE FUNCTION app.verify_evidence_upload(p_tenant uuid,p_upload uuid,p_version text,p_type text,p_bytes bytea)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE u app.evidence_upload; actor uuid; verified timestamptz;
BEGIN
 actor:=app.current_actor();
 IF p_tenant IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'EVIDENCE_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO u FROM app.evidence_upload WHERE (tenant_id,id)=(p_tenant,p_upload) FOR UPDATE;
 verified:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM app.membership m
  JOIN app.job j ON j.tenant_id=m.tenant_id AND j.id=u.job_id
  WHERE (m.tenant_id,m.id)=(p_tenant,actor) AND m.revoked_at IS NULL
   AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation x WHERE (x.tenant_id,x.membership_id)=(m.tenant_id,m.id))) THEN
  RAISE EXCEPTION 'EVIDENCE_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF u.id IS NULL OR u.state<>'quarantined' OR u.expires_at<=verified OR u.object_version_id IS DISTINCT FROM p_version
  OR p_version IS NULL OR p_version='' OR p_type IS DISTINCT FROM u.expected_content_type OR p_bytes IS NULL
  OR octet_length(p_bytes)=0 OR octet_length(p_bytes)>u.maximum_bytes
  OR encode(sha256(p_bytes),'hex') IS DISTINCT FROM u.expected_sha256
  OR u.object_key IS DISTINCT FROM 'tenants/'||p_tenant::text||'/uploads/'||p_upload::text||'/original' THEN
  RAISE EXCEPTION 'EVIDENCE_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 UPDATE app.evidence_upload SET state='verified',server_verified_at=verified,verified_byte_length=octet_length(p_bytes),rejection_code=NULL WHERE (tenant_id,id)=(p_tenant,p_upload);
 RETURN verified;
END $$;
ALTER FUNCTION app.verify_evidence_upload(uuid,uuid,text,text,bytea) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.verify_evidence_upload(uuid,uuid,text,text,bytea) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
-- Only a live bound member of the upload's tenant/job may submit the exact
-- bytes. External storage-read integrity remains the adapter's trust boundary.
GRANT EXECUTE ON FUNCTION app.verify_evidence_upload(uuid,uuid,text,text,bytea) TO jobguard_runtime;

CREATE FUNCTION app.lp8b_evidence_reference_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE u app.evidence_upload; e app.evidence_object;
BEGIN
 -- Checked owner routines also write generated originals. LP-11 guards
 -- those routes with their own binding and source-specific contracts.
 IF pg_has_role(current_user,'jobguard_migration','USAGE')
  AND pg_has_role(session_user,'jobguard_migration','USAGE') THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='evidence_object' AND current_user='jobguard_migration' THEN
  IF NEW.kind='original' AND (
   (NEW.evidence_type IN ('job_diary_text','customer_message_text') AND
    (NEW.object_key ~ '^synthetic/job-sources/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR NEW.object_key='synthetic/late-source/'||NEW.id))
   OR (NEW.evidence_type='synthetic_bank_receipt' AND NEW.object_key='synthetic/recovery/'||NEW.id)
   OR (NEW.evidence_type='resident_confirmation' AND
    NEW.object_key='tenants/'||NEW.tenant_id||'/resident-confirmations/'||NEW.id||'/document')
  ) THEN RETURN NEW; END IF;
 END IF;
 IF NEW.tenant_id IS DISTINCT FROM app.current_tenant() THEN
  RAISE EXCEPTION 'EVIDENCE_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='evidence_object' THEN
  IF NEW.kind='original' THEN
   SELECT * INTO u FROM app.evidence_upload WHERE (tenant_id,id)=(NEW.tenant_id,NEW.upload_id) FOR SHARE;
   IF u.state IS DISTINCT FROM 'verified' OR ROW(NEW.job_id,NEW.scope_item_id,NEW.object_key,NEW.object_version_id,NEW.sha256,NEW.content_type,NEW.device_captured_at,NEW.server_received_at,NEW.server_verified_at)
    IS DISTINCT FROM ROW(u.job_id,u.scope_item_id,u.object_key,u.object_version_id,u.expected_sha256,u.expected_content_type,u.device_captured_at,u.server_received_at,u.server_verified_at)
    OR NEW.byte_length IS DISTINCT FROM u.verified_byte_length OR NEW.byte_length>u.maximum_bytes THEN RAISE EXCEPTION 'EVIDENCE_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
  ELSE
   SELECT * INTO e FROM app.evidence_object WHERE (tenant_id,id)=(NEW.tenant_id,NEW.original_evidence_id) AND kind='original';
   IF e.id IS NULL OR ROW(NEW.job_id,NEW.scope_item_id,NEW.evidence_type) IS DISTINCT FROM ROW(e.job_id,e.scope_item_id,e.evidence_type)
    OR left(NEW.object_key,length(e.object_key)+1) IS DISTINCT FROM e.object_key||'/' THEN
    RAISE EXCEPTION 'EVIDENCE_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
  END IF;
 ELSE
  SELECT * INTO e FROM app.evidence_object WHERE (tenant_id,id)=(NEW.tenant_id,NEW.evidence_id) AND kind='original';
  SELECT * INTO u FROM app.evidence_upload WHERE (tenant_id,id)=(e.tenant_id,e.upload_id);
  IF e.id IS NULL OR u.state IS DISTINCT FROM 'verified'
   OR ROW(NEW.job_id,NEW.scope_item_id,NEW.required_evidence_type) IS DISTINCT FROM ROW(e.job_id,e.scope_item_id,e.evidence_type)
   OR EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(e.tenant_id,e.id)) THEN
   RAISE EXCEPTION 'EVIDENCE_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.lp8b_evidence_reference_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp8b_evidence_reference_guard() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER b_lp8b_reference BEFORE INSERT ON app.evidence_object FOR EACH ROW EXECUTE FUNCTION app.lp8b_evidence_reference_guard();
CREATE TRIGGER b_lp8b_reference BEFORE INSERT ON app.evidence_link FOR EACH ROW EXECUTE FUNCTION app.lp8b_evidence_reference_guard();

-- Initial drafts cannot select an existing revision from another draft. The
-- checked advance routine remains LP-8a's owner; don't replace its later body.
CREATE FUNCTION app.lp8b_final_input_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE e app.evidence_object;
BEGIN
 IF TG_TABLE_NAME='final_account_draft' THEN
  IF NEW.current_revision_id IS NOT NULL OR NEW.revision<>0 THEN
   RAISE EXCEPTION 'FINAL_POINTER_INVALID' USING ERRCODE='42501'; END IF;
 ELSE
  SELECT * INTO e FROM app.evidence_object WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.evidence_id) AND kind='original';
  IF e.id IS NULL OR ROW(NEW.scope_item_id,NEW.object_version_id,NEW.sha256,NEW.evidence_type)
   IS DISTINCT FROM ROW(e.scope_item_id,e.object_version_id,e.sha256,e.evidence_type)
   OR EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(e.tenant_id,e.id)) THEN
   RAISE EXCEPTION 'EVIDENCE_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.lp8b_final_input_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp8b_final_input_guard() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER a_lp8b_initial_pointer BEFORE INSERT ON app.final_account_draft FOR EACH ROW EXECUTE FUNCTION app.lp8b_final_input_guard();
CREATE TRIGGER a_lp8b_final_proof BEFORE INSERT ON app.final_account_proof FOR EACH ROW EXECUTE FUNCTION app.lp8b_final_input_guard();

-- Supplier matches are lower-trust inputs with an allocation effect. Existing
-- composite FKs bind the job; also bind the receipt to the very order being matched.
CREATE FUNCTION app.lp8b_supplier_allocation_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE receipt app.goods_receipt; match_row app.supplier_match_revision; order_row app.purchase_order_revision;
BEGIN
 SELECT * INTO receipt FROM app.goods_receipt WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.receipt_version_id);
 SELECT * INTO match_row FROM app.supplier_match_revision WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.match_revision_id);
 SELECT * INTO order_row FROM app.purchase_order_revision WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,match_row.order_revision_id);
 IF receipt.id IS NULL OR match_row.id IS NULL OR order_row.id IS NULL OR receipt.order_draft_id IS DISTINCT FROM order_row.draft_id
  OR NEW.unit IS DISTINCT FROM receipt.unit OR NEW.quantity_decimal>receipt.accepted_quantity THEN
  RAISE EXCEPTION 'ALLOCATION_REFERENCE_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.lp8b_supplier_allocation_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp8b_supplier_allocation_guard() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER b_lp8b_order_reference BEFORE INSERT ON app.supplier_match_allocation FOR EACH ROW EXECUTE FUNCTION app.lp8b_supplier_allocation_guard();
-- No grant on receipt_line_allocation or any M4-8-S allocation table is added.
-- Stored practice bytes are lower-trust evidence inputs too. Bind them to the
-- upload's scoped identity and expected digest; they never imply site truth.
CREATE FUNCTION app.lp8b_synthetic_original_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE u app.evidence_upload;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN RETURN NEW; END IF;
 SELECT * INTO u FROM app.evidence_upload WHERE (tenant_id,id)=(NEW.tenant_id,NEW.upload_id);
 IF NEW.tenant_id IS DISTINCT FROM app.current_tenant() OR u.id IS NULL
  OR ROW(NEW.job_id,NEW.scope_item_id,NEW.object_key,NEW.content_type)
   IS DISTINCT FROM ROW(u.job_id,u.scope_item_id,u.object_key,u.expected_content_type)
  OR encode(sha256(NEW.bytes),'hex') IS DISTINCT FROM u.expected_sha256
  OR octet_length(NEW.bytes)>u.maximum_bytes
  OR (u.object_version_id IS NOT NULL AND NEW.object_version_id IS DISTINCT FROM u.object_version_id) THEN
  RAISE EXCEPTION 'EVIDENCE_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.lp8b_synthetic_original_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp8b_synthetic_original_guard() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER lp8b_original AFTER INSERT ON app.synthetic_evidence_original FOR EACH ROW EXECUTE FUNCTION app.lp8b_synthetic_original_guard();
-- The existing resident-confirmation routine alone generates its verified
-- document. Give that checked writer the same owner boundary as the other
-- generated originals, retaining the 0141 document and replay contract.
CREATE OR REPLACE FUNCTION app.ent3d_record_resident_confirmation(p_actor uuid, p_job uuid, p_command uuid, p_confirmation uuid, p_description text, p_note text, p_photo uuid, p_shown_content_sha256 text)
RETURNS TABLE(outcome text, reason_code text, content_sha256 text, document_sha256 text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_authority text; v_decision text; v_content text; v_document text; v_document_hash text; v_document_length bigint; v_key text; v_now timestamptz;
 v_upload_count integer; v_object_count integer; v_same_count integer;
BEGIN
 v_tenant:=app.current_tenant();
 IF v_tenant IS NULL OR p_actor IS NULL OR p_actor IS DISTINCT FROM app.current_actor() OR p_job IS NULL OR p_command IS NULL OR p_confirmation IS NULL OR p_description IS NULL OR p_note IS NULL OR p_shown_content_sha256 IS NULL THEN
  RETURN QUERY SELECT 'refused'::text,'not_permitted'::text,NULL::text,NULL::text; RETURN;
 END IF;
 SELECT a.decision INTO v_authority FROM app.ent3a_extra_authority(p_actor,'LogSiteExtra',p_job) a;
 IF v_authority IS DISTINCT FROM 'allowed' THEN
  RETURN QUERY SELECT 'refused'::text,'not_permitted'::text,NULL::text,NULL::text; RETURN;
 END IF;
 SELECT d.decision,d.content_sha256 INTO v_decision,v_content FROM app.ent3d_site_extra_evidence(p_job,p_description,p_note,p_photo,NULL,NULL) d;
 IF v_decision IS DISTINCT FROM 'accepted' OR v_content IS NULL THEN
  RETURN QUERY SELECT 'refused'::text,'photo_not_accepted'::text,NULL::text,NULL::text; RETURN;
 END IF;
 IF p_shown_content_sha256 IS DISTINCT FROM v_content THEN
  RETURN QUERY SELECT 'refused'::text,'confirmation_mismatch'::text,NULL::text,NULL::text; RETURN;
 END IF;
 -- Two identical calls run one after the other.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ent3d-resident-confirmation:'||v_tenant::text||':'||p_confirmation::text,0));
 v_document:=app.ent3d_confirmation_document(v_tenant,p_job,p_confirmation,v_content);
 v_document_hash:=encode(sha256(convert_to(v_document,'UTF8')),'hex');
 v_document_length:=octet_length(convert_to(v_document,'UTF8'));
 v_key:='tenants/'||v_tenant::text||'/resident-confirmations/'||p_confirmation::text||'/document';
 SELECT count(*)::integer INTO v_upload_count FROM app.evidence_upload u WHERE u.tenant_id=v_tenant AND u.id=p_confirmation;
 SELECT count(*)::integer INTO v_object_count FROM app.evidence_object c WHERE c.tenant_id=v_tenant AND c.id=p_confirmation;
 IF v_upload_count>0 OR v_object_count>0 THEN
  SELECT count(*)::integer INTO v_same_count FROM app.evidence_object c
   JOIN app.evidence_upload cu ON(cu.tenant_id,cu.id)=(c.tenant_id,c.upload_id)
   WHERE c.tenant_id=v_tenant AND c.id=p_confirmation AND c.job_id=p_job AND c.upload_id=c.id AND c.scope_item_id IS NULL AND c.original_evidence_id IS NULL
    AND c.kind='original' AND c.evidence_type='resident_confirmation' AND c.content_type='text/plain; charset=utf-8'
    AND c.object_key=v_key AND c.object_version_id='resident-confirmation.v1' AND c.retention_class='standard_evidence' AND c.device_captured_at IS NULL
    AND c.sha256::text=v_document_hash AND c.byte_length=v_document_length
    AND cu.job_id=p_job AND cu.scope_item_id IS NULL AND cu.state='verified' AND cu.rejection_code IS NULL AND cu.object_key=v_key
    AND cu.object_version_id=c.object_version_id AND cu.expected_sha256::text=c.sha256::text AND cu.maximum_bytes=c.byte_length
    AND cu.expected_content_type=c.content_type AND cu.retention_class=c.retention_class AND cu.device_captured_at IS NULL;
  IF v_same_count=1 AND v_upload_count=1 AND v_object_count=1 THEN
   RETURN QUERY SELECT 'existing'::text,'existing'::text,v_content,v_document_hash; RETURN;
  END IF;
  RETURN QUERY SELECT 'conflict'::text,'conflict'::text,NULL::text,NULL::text; RETURN;
 END IF;
 -- That command id has already been used without this confirmation. This only reads whether the id was used; the replay rules stay in the extra's own command.
 IF EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=v_tenant AND r.command_id=p_command) THEN
  RETURN QUERY SELECT 'conflict'::text,'conflict'::text,NULL::text,NULL::text; RETURN;
 END IF;
 v_now:=pg_catalog.clock_timestamp();
 INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,rejection_code,object_version_id,device_captured_at,server_received_at,server_verified_at,expires_at)
  VALUES(p_confirmation,v_tenant,p_job,NULL,v_key,v_document_hash,'text/plain; charset=utf-8',v_document_length,'standard_evidence','verified',NULL,'resident-confirmation.v1',NULL,v_now,v_now,v_now);
 INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,original_evidence_id,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,device_captured_at,server_received_at,server_verified_at)
  VALUES(p_confirmation,v_tenant,p_confirmation,p_job,NULL,'original',NULL,'resident_confirmation',v_key,'resident-confirmation.v1',v_document_hash,v_document_length,'text/plain; charset=utf-8','standard_evidence',NULL,v_now,v_now);
 RETURN QUERY SELECT 'recorded'::text,'recorded'::text,v_content,v_document_hash;
END $$;
COMMIT;
