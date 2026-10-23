BEGIN;
-- M48-B1 build-ahead quarantine. No accepted neutral-source lock/authority handoff
-- exists on the issued base. Storage is additive; neither routine publishes or
-- accepts money facts. Replacing the hold requires a reviewed forward migration.
CREATE TABLE app.receipt_allocation_fact_command (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, command_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, actor_identity_user_id uuid NOT NULL,
 payload jsonb NOT NULL, payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL, audit_event_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,command_id), UNIQUE(tenant_id,job_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(actor_identity_user_id) REFERENCES identity.identity_user(id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE app.receipt_allocation_fact_review (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, command_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN('receipt','reversal')),
 payment_id uuid NOT NULL, invoice_id uuid NOT NULL, source_revision bigint NOT NULL CHECK(source_revision>0),
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 approval_hash text NOT NULL CHECK(approval_hash ~ '^[a-f0-9]{64}$'), artifact jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL CHECK(expires_at>created_at),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,command_id) REFERENCES app.receipt_allocation_fact_command(tenant_id,job_id,command_id),
 FOREIGN KEY(tenant_id,job_id,payment_id) REFERENCES app.customer_payment(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,invoice_id) REFERENCES app.final_account_invoice_binding(tenant_id,job_id,invoice_id)
);
CREATE TABLE app.receipt_allocation_fact_revision (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, command_id uuid NOT NULL,
 review_id uuid NOT NULL, payment_id uuid NOT NULL, source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 source_revision bigint NOT NULL CHECK(source_revision>0), direction text NOT NULL CHECK(direction IN('receipt','reversal')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,review_id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,command_id) REFERENCES app.receipt_allocation_fact_command(tenant_id,job_id,command_id),
 FOREIGN KEY(tenant_id,job_id,review_id) REFERENCES app.receipt_allocation_fact_review(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,payment_id) REFERENCES app.customer_payment(tenant_id,job_id,id)
);
CREATE UNIQUE INDEX receipt_allocation_one_receipt_interpretation ON app.receipt_allocation_fact_revision(tenant_id,payment_id) WHERE direction='receipt';
CREATE TABLE app.receipt_allocation_fact_source (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, allocation_revision_id uuid NOT NULL,
 payment_id uuid NOT NULL, movement_id uuid NOT NULL, movement_hash text NOT NULL CHECK(movement_hash ~ '^[a-f0-9]{64}$'),
 invoice_id uuid NOT NULL, revision_id uuid NOT NULL, lock_id uuid NOT NULL, check_id uuid NOT NULL,
 invoice_kind text NOT NULL CHECK(invoice_kind IN('final','supplementary')),
 source_manifest jsonb NOT NULL CHECK(jsonb_typeof(source_manifest)='object'),
 receipt_effective_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,allocation_revision_id),
 FOREIGN KEY(tenant_id,job_id,allocation_revision_id) REFERENCES app.receipt_allocation_fact_revision(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,payment_id) REFERENCES app.customer_payment(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,movement_id) REFERENCES app.practice_feed_event(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,invoice_id,revision_id) REFERENCES app.final_account_invoice_binding(tenant_id,job_id,invoice_id,revision_id),
 FOREIGN KEY(tenant_id,job_id,lock_id,check_id) REFERENCES app.final_account_lock_check(tenant_id,job_id,lock_id,id)
);
CREATE TABLE app.receipt_allocation_fact_line (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, source_id uuid NOT NULL,
 invoice_id uuid NOT NULL, line_id uuid NOT NULL, scope_item_id uuid NOT NULL, commercial_revision_id uuid NOT NULL,
 rule text NOT NULL CHECK(rule IN('explicit','separate_invoice','pro_rata')), source_ref text NOT NULL CHECK(length(source_ref) BETWEEN 1 AND 300),
 gross_numerator text NOT NULL CHECK(gross_numerator ~ '^-?[1-9][0-9]*$'),
 gross_denominator text NOT NULL CHECK(gross_denominator ~ '^[1-9][0-9]*$'),
 net_numerator text NOT NULL CHECK(net_numerator ~ '^-?(0|[1-9][0-9]*)$' AND net_numerator<>'-0'),
 net_denominator text NOT NULL CHECK(net_denominator ~ '^[1-9][0-9]*$'),
 original_line_net_pence bigint NOT NULL CHECK(original_line_net_pence>=0),
 original_line_gross_pence bigint NOT NULL CHECK(original_line_gross_pence>0 AND original_line_gross_pence<=1000000000000 AND original_line_net_pence<=original_line_gross_pence),
 line_existed_at timestamptz NOT NULL, reverses_line_allocation_id uuid,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,source_id,line_id),
 FOREIGN KEY(tenant_id,job_id,source_id) REFERENCES app.receipt_allocation_fact_source(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,invoice_id,line_id) REFERENCES app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id),
 FOREIGN KEY(tenant_id,job_id,scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,reverses_line_allocation_id) REFERENCES app.receipt_allocation_fact_line(tenant_id,job_id,id),
 CHECK(reverses_line_allocation_id IS DISTINCT FROM id),
 CHECK((reverses_line_allocation_id IS NULL AND left(gross_numerator,1)<>'-' AND left(net_numerator,1)<>'-')
    OR(reverses_line_allocation_id IS NOT NULL AND left(gross_numerator,1)='-' AND (left(net_numerator,1)='-' OR net_numerator='0')))
);
-- Fractions stay text to preserve the shared kernel's wide output range and
-- original bytes. Cross-row source/ratio/completeness checks remain held, so no
-- ordinary role has INSERT, including via a definer. No incomplete row is usable.
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['receipt_allocation_fact_command','receipt_allocation_fact_review','receipt_allocation_fact_revision','receipt_allocation_fact_source','receipt_allocation_fact_line'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY receipt_fact_tenant ON app.%I FOR SELECT TO jobguard_runtime,jobguard_migration USING(tenant_id=CASE WHEN pg_input_is_valid(current_setting(''app.tenant_id'',true),''uuid'') THEN current_setting(''app.tenant_id'',true)::uuid END)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access',n);
  -- No builder SELECT grant until reviewed source/session policies are installed.
  EXECUTE format('CREATE TRIGGER receipt_fact_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;
-- Narrow owner/session check shared by the held routines. The independent SQL
-- check does not trust a caller-supplied membership, actor, tenant or artifact.
CREATE FUNCTION app.assert_receipt_fact_scope(p_tenant uuid,p_job uuid,p_session_digest text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE actor record;
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM (CASE WHEN pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') THEN current_setting('app.tenant_id',true)::uuid END)
 OR p_session_digest IS NULL OR p_session_digest !~ '^[a-f0-9]{64}$'
 OR current_setting('app.receipt_line_environment',true) IS DISTINCT FROM 'synthetic_demo'
 THEN RAISE EXCEPTION 'RECEIPT_LINE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM app.authenticate_practice_session(p_session_digest,p_tenant);
 IF actor.membership_id IS NULL THEN RAISE EXCEPTION 'RECEIPT_LINE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.membership m JOIN app.job j ON j.tenant_id=m.tenant_id
 WHERE m.tenant_id=p_tenant AND m.id=actor.membership_id AND m.identity_user_id=actor.identity_user_id
 AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND j.id=p_job AND j.practice_session_digest=p_session_digest FOR SHARE OF m;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_LINE_FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION app.read_receipt_allocation_facts(p_tenant uuid,p_job uuid,p_session_digest text,p_selector jsonb,p_expected jsonb DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.assert_receipt_fact_scope(p_tenant,p_job,p_session_digest);
 -- Absence of an authoritative complete manifest must never masquerade as an
 -- empty current distribution, revision 1 or a reusable positive-use watermark.
 RAISE EXCEPTION 'RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED' USING ERRCODE='55000';
END $$;
CREATE FUNCTION app.write_receipt_allocation_facts(p_tenant uuid,p_job uuid,p_session_digest text,p_command jsonb,p_artifact jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.assert_receipt_fact_scope(p_tenant,p_job,p_session_digest);
 -- Never persist caller-supplied ratios, source hashes, expiry or approval.
 -- No business/audit effect occurs on this refusal path. No success is returned.
 RAISE EXCEPTION 'RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED' USING ERRCODE='55000';
END $$;
ALTER FUNCTION app.assert_receipt_fact_scope(uuid,uuid,text) OWNER TO jobguard_migration;
ALTER FUNCTION app.read_receipt_allocation_facts(uuid,uuid,text,jsonb,jsonb) OWNER TO jobguard_migration;
ALTER FUNCTION app.write_receipt_allocation_facts(uuid,uuid,text,jsonb,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.assert_receipt_fact_scope(uuid,uuid,text),app.read_receipt_allocation_facts(uuid,uuid,text,jsonb,jsonb),app.write_receipt_allocation_facts(uuid,uuid,text,jsonb,jsonb)
 FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.read_receipt_allocation_facts(uuid,uuid,text,jsonb,jsonb),app.write_receipt_allocation_facts(uuid,uuid,text,jsonb,jsonb) TO jobguard_runtime;
COMMIT;
