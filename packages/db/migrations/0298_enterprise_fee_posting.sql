BEGIN;
-- ENT-7c: the platform_enterprise_fee book. Posting happens only from an approved statement revision, through the exact
-- action authorisation its approval created, rechecked under lock. A positive section delta accrues, a negative one posts
-- a linked compensation, zero posts nothing. Journals are balanced and never edited. Synthetic database only: the pilot
-- and production databases refuse (BUILD_PLAN 9.2 ENT-7 gates; no repository decision is approved).
-- Ben 17 Oct: mixed-sign statements need finance and are always recorded (Q-04); corrections on jobs no longer live are
-- refused (Q-02), which governs duplicate repair, not posting from facts already settled.

CREATE TABLE app.platform_enterprise_fee (
 tenant_id uuid NOT NULL, id uuid NOT NULL, kind text NOT NULL CHECK(kind IN('accrual','compensation')),
 statement_id uuid NOT NULL, agreement_version_id uuid NOT NULL, derivation_id uuid NOT NULL, authorization_id uuid NOT NULL,
 amount_pence bigint NOT NULL CHECK(amount_pence>0 AND amount_pence<=9007199254740991),
 compensates_fee_id uuid, environment text NOT NULL CHECK(environment='synthetic_demo'),
 command_id uuid NOT NULL, actor_membership_id uuid NOT NULL, server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,statement_id,agreement_version_id),
 CHECK((kind='compensation')=(compensates_fee_id IS NOT NULL)),
 FOREIGN KEY(tenant_id,statement_id,agreement_version_id) REFERENCES app.enterprise_fee_statement_section(tenant_id,statement_id,agreement_version_id),
 FOREIGN KEY(tenant_id,statement_id) REFERENCES app.enterprise_fee_statement_approval(tenant_id,statement_id),
 FOREIGN KEY(tenant_id,derivation_id) REFERENCES app.enterprise_fee_derivation(tenant_id,id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id),
 FOREIGN KEY(tenant_id,compensates_fee_id) REFERENCES app.platform_enterprise_fee(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
-- Two balanced lines per journal: accrual Dr receivable / Cr revenue; compensation the reverse.
CREATE TABLE app.platform_enterprise_fee_line (
 tenant_id uuid NOT NULL, fee_id uuid NOT NULL, line_no smallint NOT NULL CHECK(line_no IN(1,2)),
 account text NOT NULL CHECK(account IN('contractor_fee_receivable','platform_fee_revenue')),
 debit_pence bigint NOT NULL CHECK(debit_pence>=0), credit_pence bigint NOT NULL CHECK(credit_pence>=0),
 PRIMARY KEY(tenant_id,fee_id,line_no), CHECK((debit_pence=0)<>(credit_pence=0)),
 FOREIGN KEY(tenant_id,fee_id) REFERENCES app.platform_enterprise_fee(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['platform_enterprise_fee','platform_enterprise_fee_line'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
  EXECUTE format('CREATE TRIGGER ef_immutable BEFORE INSERT OR UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.ef_immutable()',n);
  EXECUTE format('CREATE TRIGGER ef_no_truncate BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.ef_immutable()',n);
 END LOOP;
END $$;

-- J_v: net fee posted for an agreement version, accruals less compensations, across all months.
CREATE FUNCTION app.ef_posted_net(t uuid,p_agreement uuid) RETURNS bigint
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(sum(CASE kind WHEN 'accrual' THEN amount_pence ELSE -amount_pence END),0)::bigint
 FROM app.platform_enterprise_fee WHERE tenant_id=t AND agreement_version_id=p_agreement
$$;
ALTER FUNCTION app.ef_posted_net(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_posted_net(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

-- Sections now subtract what is already posted: delta_v = F_v - J_v.
CREATE OR REPLACE FUNCTION app.ef_statement_sections(t uuid,p_period text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE r record; ag app.enterprise_agreement_version; out jsonb:='[]'::jsonb; j bigint;
BEGIN
 FOR r IN SELECT DISTINCT ON (d.agreement_version_id) d.* FROM app.enterprise_fee_derivation d
  WHERE d.tenant_id=t AND d.period=p_period ORDER BY d.agreement_version_id,d.server_recorded_at DESC,d.id DESC LOOP
  SELECT * INTO ag FROM app.enterprise_agreement_version WHERE tenant_id=t AND id=r.agreement_version_id;
  IF app.ef_inputs(t,ag,p_period)->>'hash' IS DISTINCT FROM r.input_hash THEN RAISE EXCEPTION 'STALE_FACTS' USING ERRCODE='40001'; END IF;
  j:=app.ef_posted_net(t,r.agreement_version_id);
  out:=out||jsonb_build_array(jsonb_build_object('agreementVersionId',r.agreement_version_id,'derivationId',r.id,'inputHash',r.input_hash,
   'cumulativeFeePence',r.cumulative_fee_pence,'priorNetPostedPence',j,'deltaPence',r.cumulative_fee_pence-j));
 END LOOP;
 RETURN out;
END $$;

-- Post one approved statement revision. Rechecked under the statement lock: the authorisation is the one this revision's
-- approval created, approved, unrevoked, unexpired and bound to its hash, revision, absolute total and policy; the revision
-- is neither superseded nor disputed; the facts and the prior posted net are unchanged. Posts once per revision.
CREATE FUNCTION app.ef_post_statement(p_session uuid,p_command uuid,p_statement uuid,p_authorization uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; st app.enterprise_fee_statement; ap app.enterprise_fee_statement_approval; z app.action_authorization;
 sec record; ag app.enterprise_agreement_version; f uuid; prior uuid; posted integer:=0;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid; PERFORM app.ef_actor(p_session);
 SELECT * INTO st FROM app.enterprise_fee_statement WHERE tenant_id=t AND id=p_statement;
 IF st.id IS NULL THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 a:=app.ef_statement_begin(p_session,st.period);
 IF p_command IS NULL OR p_authorization IS NULL THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM app.platform_enterprise_fee WHERE tenant_id=t AND statement_id=st.id) THEN
  RETURN jsonb_build_object('statementId',st.id,'replayed',true);
 END IF;
 SELECT * INTO ap FROM app.enterprise_fee_statement_approval WHERE tenant_id=t AND statement_id=st.id;
 SELECT * INTO z FROM app.action_authorization WHERE tenant_id=t AND id=p_authorization FOR SHARE;
 IF ap.statement_id IS NULL OR z.id IS NULL OR ap.authorization_id<>z.id OR z.action_type<>'enterprise_fee_statement'
  OR z.revoked_at IS NOT NULL OR z.expires_at<=clock_timestamp() OR z.content_hash<>st.content_hash OR z.aggregate_revision<>st.revision
  OR z.amount_pence IS DISTINCT FROM abs(st.total_delta_pence) OR z.currency<>'GBP' OR z.policy_version<>'enterprise_site_capture_policy_v1'
  OR NOT EXISTS(SELECT 1 FROM app.decision_resolution r WHERE r.tenant_id=t AND r.id=z.resolution_id AND r.decision_id=z.decision_id AND r.resolution='approved')
  OR EXISTS(SELECT 1 FROM app.enterprise_fee_statement n WHERE n.tenant_id=t AND n.predecessor_id=st.id)
  OR EXISTS(SELECT 1 FROM app.enterprise_fee_statement_dispute WHERE tenant_id=t AND statement_id=st.id) THEN
  RAISE EXCEPTION 'STATEMENT_AUTHORITY_INVALID' USING ERRCODE='42501';
 END IF;
 FOR sec IN SELECT * FROM app.enterprise_fee_statement_section WHERE tenant_id=t AND statement_id=st.id ORDER BY agreement_version_id LOOP
  SELECT * INTO ag FROM app.enterprise_agreement_version WHERE tenant_id=t AND id=sec.agreement_version_id FOR SHARE;
  IF app.ef_inputs(t,ag,st.period)->>'hash' IS DISTINCT FROM sec.input_hash OR app.ef_posted_net(t,sec.agreement_version_id)<>sec.prior_net_posted_pence THEN
   RAISE EXCEPTION 'STALE_FACTS' USING ERRCODE='40001';
  END IF;
 END LOOP;
 FOR sec IN SELECT * FROM app.enterprise_fee_statement_section WHERE tenant_id=t AND statement_id=st.id AND delta_pence<>0 ORDER BY agreement_version_id LOOP
  f:=gen_random_uuid(); prior:=NULL;
  IF sec.delta_pence<0 THEN
   -- A compensation links to the latest accrual it reduces.
   SELECT id INTO prior FROM app.platform_enterprise_fee WHERE tenant_id=t AND agreement_version_id=sec.agreement_version_id AND kind='accrual'
    ORDER BY server_recorded_at DESC,id DESC LIMIT 1;
   IF prior IS NULL THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO app.platform_enterprise_fee(tenant_id,id,kind,statement_id,agreement_version_id,derivation_id,authorization_id,amount_pence,compensates_fee_id,environment,command_id,actor_membership_id)
  VALUES(t,f,CASE WHEN sec.delta_pence>0 THEN 'accrual' ELSE 'compensation' END,st.id,sec.agreement_version_id,sec.derivation_id,z.id,abs(sec.delta_pence),prior,'synthetic_demo',p_command,a);
  INSERT INTO app.platform_enterprise_fee_line(tenant_id,fee_id,line_no,account,debit_pence,credit_pence) VALUES
   (t,f,1,CASE WHEN sec.delta_pence>0 THEN 'contractor_fee_receivable' ELSE 'platform_fee_revenue' END,abs(sec.delta_pence),0),
   (t,f,2,CASE WHEN sec.delta_pence>0 THEN 'platform_fee_revenue' ELSE 'contractor_fee_receivable' END,0,abs(sec.delta_pence));
  posted:=posted+1;
 END LOOP;
 PERFORM app.ef_audit(a,'enterprise_fee.statement_posted','enterprise_fee_statement',st.id,
  jsonb_build_object('references',jsonb_build_object('statement',st.id::text,'authorization',z.id::text,'journals',posted,'environment','synthetic_demo'),
   'hashes',jsonb_build_object('content',st.content_hash)));
 RETURN jsonb_build_object('statementId',st.id,'replayed',false,'journals',posted);
END $$;
ALTER FUNCTION app.ef_post_statement(uuid,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_post_statement(uuid,uuid,uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ef_post_statement(uuid,uuid,uuid,uuid) TO jobguard_runtime;

-- Finance-only read of the journals posted for a statement revision.
CREATE FUNCTION app.ef_read_postings(p_session uuid,p_statement uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid;
BEGIN
 PERFORM app.ef_actor(p_session); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF NOT EXISTS(SELECT 1 FROM app.enterprise_fee_statement WHERE tenant_id=t AND id=p_statement) THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'kind',f.kind,'agreementVersionId',f.agreement_version_id,'amountPence',f.amount_pence,
  'compensatesFeeId',f.compensates_fee_id,'environment',f.environment,
  'lines',(SELECT jsonb_agg(jsonb_build_object('account',l.account,'debitPence',l.debit_pence,'creditPence',l.credit_pence) ORDER BY l.line_no)
   FROM app.platform_enterprise_fee_line l WHERE l.tenant_id=t AND l.fee_id=f.id)) ORDER BY f.agreement_version_id)
  FROM app.platform_enterprise_fee f WHERE f.tenant_id=t AND f.statement_id=p_statement),'[]'::jsonb);
END $$;
ALTER FUNCTION app.ef_read_postings(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_read_postings(uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ef_read_postings(uuid,uuid) TO jobguard_runtime;
COMMIT;
