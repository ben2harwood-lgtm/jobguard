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
-- Private storage guards only. No source-lock order, actor permission or positive
-- writer is introduced. The runtime routines below remain unconditionally held.
-- UUID columns use PostgreSQL's canonical lower-case output and UUID equality.
ALTER TABLE app.receipt_allocation_fact_revision ADD UNIQUE(tenant_id,job_id,id,payment_id);
ALTER TABLE app.receipt_allocation_fact_source ADD UNIQUE(tenant_id,job_id,id,invoice_id);
ALTER TABLE app.receipt_allocation_fact_source ADD FOREIGN KEY(tenant_id,job_id,allocation_revision_id,payment_id)
 REFERENCES app.receipt_allocation_fact_revision(tenant_id,job_id,id,payment_id);
ALTER TABLE app.receipt_allocation_fact_line DROP CONSTRAINT receipt_allocation_fact_line_tenant_id_job_id_source_id_fkey;
ALTER TABLE app.receipt_allocation_fact_line ADD FOREIGN KEY(tenant_id,job_id,source_id,invoice_id)
 REFERENCES app.receipt_allocation_fact_source(tenant_id,job_id,id,invoice_id);

-- No accepted source authority exists to clear pending/unmatched/duplicate or
-- reversed cash. A claimed settled state in JSON is not that authority. Refuse
-- ALL saved-distribution projections until a reviewed forward migration installs
-- the source handoff; held rows remain quarantined and the readers still refuse.
CREATE FUNCTION app.receipt_fact_projection_safe(p jsonb) RETURNS boolean
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT p->>'status' IS DISTINCT FROM 'saved_distribution'
$$;
ALTER TABLE app.receipt_allocation_fact_source ADD CONSTRAINT receipt_fact_saved_projection_safe
 CHECK(app.receipt_fact_projection_safe(source_manifest));
ALTER TABLE app.receipt_allocation_fact_command ADD CONSTRAINT receipt_fact_result_projection_safe
 CHECK(app.receipt_fact_projection_safe(result));
ALTER TABLE app.receipt_allocation_fact_review ADD CONSTRAINT receipt_fact_review_projection_safe
 CHECK(app.receipt_fact_projection_safe(artifact));

-- Exact fraction addition: no division/rounding of money. Reduce only by integer
-- gcd; PostgreSQL numeric overflow refuses the write rather than approximating.
CREATE FUNCTION app.assert_receipt_fact_bound(parts jsonb,limit_n numeric,limit_d numeric)
 RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE part jsonb; n numeric:=0; d numeric:=1; pn numeric; pd numeric; g numeric;
BEGIN
 FOR part IN SELECT value FROM jsonb_array_elements(parts) LOOP
  pn:=abs((part->>'n')::numeric); pd:=(part->>'d')::numeric;
  n:=n*pd+pn*d; d:=d*pd;
  IF n*limit_d>limit_n*d THEN RAISE EXCEPTION 'RECEIPT_LINE_CAPACITY_EXCEEDED' USING ERRCODE='23514'; END IF;
  g:=gcd(n,d); n:=div(n,g); d:=div(d,g);
 END LOOP;
END $$;
CREATE FUNCTION app.guard_receipt_fact_line() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE src record; original record; invoiced record; cap bigint; parts jsonb;
BEGIN
 -- Quarantined storage integrity requires SSI, not a guessed source lock order.
 -- Predicate reads below protect against concurrent write skew. Retry of a
 -- serialization failure remains the future writer's responsibility.
 IF current_setting('transaction_isolation')<>'serializable' THEN
  RAISE EXCEPTION 'RECEIPT_LINE_SERIALIZABLE_REQUIRED' USING ERRCODE='25001';
 END IF;
 SELECT s.*,r.direction INTO src FROM app.receipt_allocation_fact_source s
 JOIN app.receipt_allocation_fact_revision r ON(r.tenant_id,r.job_id,r.id)=(s.tenant_id,s.job_id,s.allocation_revision_id)
 WHERE (s.tenant_id,s.job_id,s.id)=(NEW.tenant_id,NEW.job_id,NEW.source_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_LINE_SOURCE_MISSING' USING ERRCODE='23503'; END IF;
 IF (src.direction='reversal') IS DISTINCT FROM (NEW.reverses_line_allocation_id IS NOT NULL) THEN
  RAISE EXCEPTION 'RECEIPT_LINE_DIRECTION_MISMATCH' USING ERRCODE='23514'; END IF;
 SELECT * INTO invoiced FROM app.final_account_invoiced_line
 WHERE (tenant_id,job_id,invoice_id,final_account_line_id)=(NEW.tenant_id,NEW.job_id,NEW.invoice_id,NEW.line_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_LINE_INVOICE_MISSING' USING ERRCODE='23503'; END IF;
 IF (NEW.scope_item_id,NEW.commercial_revision_id,NEW.original_line_net_pence,NEW.original_line_gross_pence)
 IS DISTINCT FROM (invoiced.scope_item_id,invoiced.commercial_revision_id,invoiced.net_pence,invoiced.gross_pence)
 OR NEW.net_numerator::numeric*NEW.gross_denominator::numeric*invoiced.gross_pence
 <>NEW.gross_numerator::numeric*NEW.net_denominator::numeric*invoiced.net_pence THEN
  RAISE EXCEPTION 'RECEIPT_LINE_RATIO_MISMATCH' USING ERRCODE='23514'; END IF;
 IF NEW.reverses_line_allocation_id IS NULL THEN
  SELECT amount_pence INTO cap FROM app.customer_payment WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,src.payment_id) AND invoice_id=src.invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_LINE_PAYMENT_MISSING' USING ERRCODE='23503'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n',l.gross_numerator,'d',l.gross_denominator)),'[]') INTO parts
  FROM app.receipt_allocation_fact_line l JOIN app.receipt_allocation_fact_source s ON(s.tenant_id,s.job_id,s.id)=(l.tenant_id,l.job_id,l.source_id)
  WHERE l.tenant_id=NEW.tenant_id AND s.payment_id=src.payment_id AND l.reverses_line_allocation_id IS NULL;
  PERFORM app.assert_receipt_fact_bound(parts,cap,1);
  -- Conservative historical positive capacity: reversals do not silently reopen it.
  SELECT coalesce(jsonb_agg(jsonb_build_object('n',gross_numerator,'d',gross_denominator)),'[]') INTO parts
  FROM app.receipt_allocation_fact_line WHERE (tenant_id,job_id,line_id)=(NEW.tenant_id,NEW.job_id,NEW.line_id)
   AND reverses_line_allocation_id IS NULL;
  PERFORM app.assert_receipt_fact_bound(parts,invoiced.gross_pence,1);
 ELSE
  SELECT l.* INTO original FROM app.receipt_allocation_fact_line l JOIN app.receipt_allocation_fact_source s
   ON(s.tenant_id,s.job_id,s.id)=(l.tenant_id,l.job_id,l.source_id)
  WHERE (l.tenant_id,l.job_id,l.id)=(NEW.tenant_id,NEW.job_id,NEW.reverses_line_allocation_id)
   AND (l.invoice_id,l.line_id,s.payment_id)=(NEW.invoice_id,NEW.line_id,src.payment_id) AND l.reverses_line_allocation_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_LINE_ORIGINAL_MISSING' USING ERRCODE='23503'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n',gross_numerator,'d',gross_denominator)),'[]') INTO parts
  FROM app.receipt_allocation_fact_line WHERE (tenant_id,job_id,reverses_line_allocation_id)=(NEW.tenant_id,NEW.job_id,original.id);
  PERFORM app.assert_receipt_fact_bound(parts,original.gross_numerator::numeric,original.gross_denominator::numeric);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER receipt_fact_line_integrity AFTER INSERT ON app.receipt_allocation_fact_line
 FOR EACH ROW EXECUTE FUNCTION app.guard_receipt_fact_line();
ALTER FUNCTION app.receipt_fact_projection_safe(jsonb) OWNER TO jobguard_migration;
ALTER FUNCTION app.assert_receipt_fact_bound(jsonb,numeric,numeric) OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_receipt_fact_line() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.receipt_fact_projection_safe(jsonb),app.assert_receipt_fact_bound(jsonb,numeric,numeric),app.guard_receipt_fact_line()
 FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;

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
