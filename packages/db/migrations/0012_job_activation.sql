BEGIN;

CREATE TABLE app.job_activation (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, accepted_document_id uuid NOT NULL,
 accepted_document_version integer NOT NULL CHECK(accepted_document_version>0), accepted_document_hash char(64) NOT NULL CHECK(accepted_document_hash~'^[0-9a-f]{64}$'),
 mode varchar(24) NOT NULL CHECK(mode IN('pilot_no_charge','synthetic_demo')), activation_terms_version varchar(80) NOT NULL,
 fee_policy_version varchar(80) NOT NULL, actor_membership_id uuid NOT NULL, activated_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id), UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,accepted_document_id,accepted_document_hash) REFERENCES app.quote_document_version(tenant_id,id,content_hash),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK((mode='pilot_no_charge' AND activation_terms_version='pilot_no_charge.v1') OR (mode='synthetic_demo' AND activation_terms_version='synthetic_demo_illustrative.v1'))
);
CREATE TABLE app.cap_snapshot (
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,activation_id uuid NOT NULL,baseline_quote_version_id uuid NOT NULL,
 accepted_net_value_pence bigint NOT NULL CHECK(accepted_net_value_pence>=0),currency char(3) NOT NULL CHECK(currency='GBP'),
 recovery_cap_pence bigint NOT NULL CHECK(recovery_cap_pence>=0),fee_policy_version varchar(80) NOT NULL,illustrative boolean NOT NULL CHECK(illustrative),created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id),UNIQUE(tenant_id,activation_id),
 FOREIGN KEY(tenant_id,job_id,activation_id) REFERENCES app.job_activation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,baseline_quote_version_id) REFERENCES app.quote_version(tenant_id,job_id,id)
);
CREATE TABLE app.synthetic_obligation (
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,activation_id uuid NOT NULL,principal_pence bigint NOT NULL CHECK(principal_pence=7900),currency char(3) NOT NULL CHECK(currency='GBP'),
 state varchar(16) NOT NULL DEFAULT 'owed_unpaid' CHECK(state='owed_unpaid'),label varchar(32) NOT NULL CHECK(label='illustrative_only'),created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,activation_id),UNIQUE(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id,activation_id) REFERENCES app.job_activation(tenant_id,job_id,id)
);
CREATE TABLE app.simulated_settlement_event (
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,obligation_id uuid NOT NULL,provider_event_id varchar(200) NOT NULL,
 amount_pence bigint NOT NULL CHECK(amount_pence=7900),currency char(3) NOT NULL CHECK(currency='GBP'),label varchar(32) NOT NULL CHECK(label='simulated_not_collected'),simulated_at timestamptz NOT NULL,recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,provider_event_id),UNIQUE(tenant_id,obligation_id),FOREIGN KEY(tenant_id,job_id,obligation_id) REFERENCES app.synthetic_obligation(tenant_id,job_id,id)
);

CREATE FUNCTION app.reference_recovery_cap(p_net bigint) RETURNS bigint LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE numerator bigint; quotient bigint; remainder bigint; BEGIN
 IF p_net<0 OR p_net>1000000000000 THEN RAISE EXCEPTION 'accepted net out of range' USING ERRCODE='22003'; END IF;
 numerator:=p_net*15;quotient:=numerator/1000;remainder:=numerator%1000;
 IF remainder>500 OR (remainder=500 AND quotient%2=1) THEN quotient:=quotient+1;END IF;RETURN quotient;
END $$;

CREATE FUNCTION app.switch_job_live(p_tenant uuid,p_activation uuid,p_cap_snapshot uuid,p_obligation uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_expected integer,p_net bigint,p_cap bigint,p_mode varchar,p_terms varchar,p_policy varchar,p_actor uuid,p_activated timestamptz) RETURNS app.job_activation LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE j app.job;d app.quote_document_version;q app.quote_version;a app.job_activation;BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';END IF;
 SELECT * INTO j FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
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

CREATE FUNCTION app.record_simulated_settlement(p_tenant uuid,p_id uuid,p_obligation uuid,p_provider_event varchar,p_amount bigint,p_simulated_at timestamptz) RETURNS app.simulated_settlement_event LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE o app.synthetic_obligation;e app.simulated_settlement_event;BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM app.synthetic_obligation WHERE tenant_id=p_tenant AND id=p_obligation FOR UPDATE;IF NOT FOUND OR p_amount<>7900 THEN RAISE EXCEPTION 'synthetic obligation required' USING ERRCODE='22023';END IF;
 INSERT INTO app.simulated_settlement_event(id,tenant_id,job_id,obligation_id,provider_event_id,amount_pence,currency,label,simulated_at) VALUES(p_id,p_tenant,o.job_id,p_obligation,p_provider_event,p_amount,'GBP','simulated_not_collected',p_simulated_at) RETURNING * INTO e;RETURN e;END $$;

CREATE TRIGGER job_activation_immutable BEFORE UPDATE OR DELETE ON app.job_activation FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE TRIGGER cap_snapshot_immutable BEFORE UPDATE OR DELETE ON app.cap_snapshot FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE TRIGGER synthetic_obligation_immutable BEFORE UPDATE OR DELETE ON app.synthetic_obligation FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE TRIGGER simulated_settlement_immutable BEFORE UPDATE OR DELETE ON app.simulated_settlement_event FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['job_activation','cap_snapshot','synthetic_obligation','simulated_settlement_event'] LOOP EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);END LOOP;END $$;
ALTER FUNCTION app.reference_recovery_cap(bigint) OWNER TO jobguard_migration;
ALTER FUNCTION app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,varchar,varchar,varchar,uuid,timestamptz) OWNER TO jobguard_migration;
ALTER FUNCTION app.record_simulated_settlement(uuid,uuid,uuid,varchar,bigint,timestamptz) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,varchar,varchar,varchar,uuid,timestamptz),app.record_simulated_settlement(uuid,uuid,uuid,varchar,bigint,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,varchar,varchar,varchar,uuid,timestamptz),app.record_simulated_settlement(uuid,uuid,uuid,varchar,bigint,timestamptz) TO jobguard_runtime;
COMMIT;
