BEGIN;
-- LP-3 RED: dark synthetic construction. No provider, financial posting, or release.
-- Old overloads remain for owner-connected historical fixtures; runtime cutover is atomic.
CREATE TABLE app.activation_acceptance_operation_use (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, authorization_id uuid NOT NULL,
 job_id uuid NOT NULL, expected_job_revision integer,
 actor_membership_id uuid NOT NULL, operation text NOT NULL, semantic_key text NOT NULL, payload_hash char(64) NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,command_id), UNIQUE(tenant_id,authorization_id), UNIQUE(tenant_id,operation,semantic_key),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
ALTER TABLE app.activation_acceptance_operation_use OWNER TO jobguard_migration;
ALTER TABLE app.activation_acceptance_operation_use ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.activation_acceptance_operation_use FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.activation_acceptance_operation_use FOR ALL TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.activation_acceptance_operation_use FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT SELECT ON app.activation_acceptance_operation_use TO jobguard_runtime;
CREATE TRIGGER activation_acceptance_use_immutable BEFORE UPDATE OR DELETE ON app.activation_acceptance_operation_use
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();

-- Byte lengths and timestamp spelling match the reused TypeScript codec exactly.
CREATE FUNCTION app.lp3_input_hash(p_tokens text[]) RETURNS text LANGUAGE sql IMMUTABLE
 SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to(string_agg(CASE WHEN token IS NULL THEN '-1:'
 ELSE octet_length(convert_to(token,'UTF8'))::text||':'||token END,'' ORDER BY ordinal),'UTF8')),'hex')
 FROM unnest(p_tokens) WITH ORDINALITY AS t(token,ordinal)
$$;
ALTER FUNCTION app.lp3_input_hash(text[]) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp3_input_hash(text[]) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

-- Private INVOKER helper: the four checked entry points supply every significant fact.
-- Call after the aggregate lock, before any business writes, and never after audit locks.
CREATE FUNCTION app.lp3_authorize(p_tenant uuid,p_actor uuid,p_command uuid,p_authorization uuid,
 p_command_type text,p_action text,p_subject_type text,p_subject text,p_hash text,p_version integer,
 p_amount bigint,p_currency text,p_recipient text,p_policy text,p_payload text,p_job uuid,p_expected integer) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE c app.command_receipt; a app.action_authorization;
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'LP3_SYNTHETIC_DATABASE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command FOR UPDATE;
 SELECT * INTO a FROM app.action_authorization WHERE tenant_id=p_tenant AND id=p_authorization FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner'
  AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF c.command_id IS NULL OR c.status IS DISTINCT FROM 'processing' OR c.command_type IS DISTINCT FROM p_command_type
  OR c.actor_membership_id IS DISTINCT FROM p_actor OR right(c.semantic_key,69) IS DISTINCT FROM ':lp3='||p_payload
  OR a.id IS NULL OR a.actor_membership_id IS DISTINCT FROM p_actor OR a.action_type IS DISTINCT FROM p_action
  OR a.content_hash IS DISTINCT FROM p_hash OR a.aggregate_revision IS DISTINCT FROM p_version
  OR a.amount_pence IS DISTINCT FROM p_amount OR a.currency IS DISTINCT FROM p_currency
  OR a.recipient IS DISTINCT FROM p_recipient OR a.policy_version IS DISTINCT FROM p_policy
  OR a.revoked_at IS NOT NULL OR a.expires_at<=clock_timestamp()
  OR NOT EXISTS(SELECT 1 FROM app.decision_resolution r JOIN app.decision d
   ON(d.tenant_id,d.id)=(r.tenant_id,r.decision_id)
   WHERE r.tenant_id=p_tenant AND r.id=a.resolution_id AND r.decision_id=a.decision_id
   AND r.actor_membership_id=p_actor AND r.resolution='approved' AND d.action_type=p_action
   AND d.subject_type=p_subject_type AND d.subject_ref=p_subject)
  OR EXISTS(SELECT 1 FROM app.activation_acceptance_operation_use u
   WHERE u.tenant_id=p_tenant AND (u.command_id=p_command OR u.authorization_id=p_authorization))
 THEN RAISE EXCEPTION 'LP3_EXACT_AUTHORIZATION_MISMATCH' USING ERRCODE='42501'; END IF;
 INSERT INTO app.activation_acceptance_operation_use(tenant_id,command_id,authorization_id,actor_membership_id,operation,semantic_key,payload_hash,job_id,expected_job_revision)
 VALUES(p_tenant,p_command,p_authorization,p_actor,p_action,left(c.semantic_key,length(c.semantic_key)-69),p_payload,p_job,p_expected);
END $$;
ALTER FUNCTION app.lp3_authorize(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,bigint,text,text,text,text,uuid,integer) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp3_authorize(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,bigint,text,text,text,text,uuid,integer)
 FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

CREATE FUNCTION app.switch_job_live(p_tenant uuid,p_activation uuid,p_cap_snapshot uuid,p_obligation uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_expected integer,p_net bigint,p_cap bigint,p_mode varchar,p_terms varchar,p_policy varchar,p_actor uuid,p_activated timestamptz,p_command uuid,p_authorization uuid) RETURNS app.job_activation
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE result app.job_activation; payload text;
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'LP3_SYNTHETIC_DATABASE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF p_expected IS NULL OR p_version IS NULL OR p_hash IS NULL THEN RAISE EXCEPTION 'exact source revision required' USING ERRCODE='22023'; END IF;
 IF p_net IS NULL OR p_cap IS NULL OR p_mode IS NULL OR p_terms IS NULL OR p_policy IS NULL OR p_activated IS NULL OR p_activated IS DISTINCT FROM date_trunc('milliseconds',p_activated) OR p_net NOT BETWEEN 0 AND 1000000000000 OR p_cap IS DISTINCT FROM app.reference_recovery_cap(p_net) OR NOT EXISTS(SELECT 1 FROM app.quote_document_version WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_document AND document_version=p_version AND content_hash=p_hash AND (snapshot->>'netPence')::bigint=p_net) THEN RAISE EXCEPTION 'exact accepted terms or cap mismatch' USING ERRCODE='22023'; END IF;
 payload:=app.lp3_input_hash(ARRAY['lp3-input.v1','job.switch_live',p_tenant::text,p_actor::text,p_job::text,p_document::text,p_version::text,p_hash,p_expected::text,p_net::text,p_cap::text,p_mode,p_terms,p_policy,CASE WHEN p_mode='synthetic_demo' THEN '7900' END,CASE WHEN p_mode='synthetic_demo' THEN 'GBP' END,NULL,to_char(p_activated AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')]);
 PERFORM app.lp3_authorize(p_tenant,p_actor,p_command,p_authorization,'job.switch_live','job.switch_live','job',p_job::text,p_hash,p_version,CASE WHEN p_mode='synthetic_demo' THEN 7900::bigint END,CASE WHEN p_mode='synthetic_demo' THEN 'GBP' END,NULL,p_terms,payload,p_job,p_expected);
 SELECT * INTO result FROM app.switch_job_live(p_tenant,p_activation,p_cap_snapshot,p_obligation,p_job,p_document,p_version,p_hash,p_expected,p_net,p_cap,p_mode,p_terms,p_policy,p_actor,p_activated);
 RETURN result;
END $$;
ALTER FUNCTION app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,varchar,varchar,varchar,uuid,timestamptz,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,varchar,varchar,varchar,uuid,timestamptz,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,varchar,varchar,varchar,uuid,timestamptz,uuid,uuid) TO jobguard_runtime;
ALTER FUNCTION app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,varchar,varchar,varchar,uuid,timestamptz) SET search_path=pg_catalog,app,pg_temp;
REVOKE ALL ON FUNCTION app.switch_job_live(uuid,uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,varchar,varchar,varchar,uuid,timestamptz) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

CREATE FUNCTION app.record_simulated_settlement(p_tenant uuid,p_id uuid,p_obligation uuid,p_provider_event varchar,p_amount bigint,p_simulated_at timestamptz,p_actor uuid,p_command uuid,p_authorization uuid) RETURNS app.simulated_settlement_event
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE result app.simulated_settlement_event; payload text;
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'LP3_SYNTHETIC_DATABASE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=(SELECT job_id FROM app.synthetic_obligation WHERE tenant_id=p_tenant AND id=p_obligation) FOR UPDATE;
 IF p_amount IS DISTINCT FROM 7900 OR p_provider_event IS NULL OR length(p_provider_event) NOT BETWEEN 1 AND 200 OR p_simulated_at IS NULL OR p_simulated_at IS DISTINCT FROM date_trunc('milliseconds',p_simulated_at) OR NOT EXISTS(SELECT 1 FROM app.synthetic_obligation WHERE tenant_id=p_tenant AND id=p_obligation AND principal_pence=7900 AND currency='GBP' AND state='owed_unpaid') OR EXISTS(SELECT 1 FROM app.simulated_settlement_event WHERE tenant_id=p_tenant AND obligation_id=p_obligation) THEN RAISE EXCEPTION 'synthetic obligation required' USING ERRCODE='22023'; END IF;
 payload:=app.lp3_input_hash(ARRAY['lp3-input.v1','synthetic.settlement',p_tenant::text,p_actor::text,p_obligation::text,p_obligation::text,p_provider_event,p_amount::text,'GBP','synthetic_demo_illustrative.v1',to_char(p_simulated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')]);
 PERFORM app.lp3_authorize(p_tenant,p_actor,p_command,p_authorization,'synthetic.settlement','synthetic_obligation.simulate_settlement','synthetic_obligation',p_obligation::text,(SELECT content_hash FROM app.action_authorization WHERE tenant_id=p_tenant AND id=p_authorization),1,p_amount,'GBP',NULL,'synthetic_demo_illustrative.v1',payload,(SELECT job_id FROM app.synthetic_obligation WHERE tenant_id=p_tenant AND id=p_obligation),NULL);
 SELECT * INTO result FROM app.record_simulated_settlement(p_tenant,p_id,p_obligation,p_provider_event,p_amount,p_simulated_at);
 RETURN result;
END $$;
ALTER FUNCTION app.record_simulated_settlement(uuid,uuid,uuid,varchar,bigint,timestamptz,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.record_simulated_settlement(uuid,uuid,uuid,varchar,bigint,timestamptz,uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.record_simulated_settlement(uuid,uuid,uuid,varchar,bigint,timestamptz,uuid,uuid,uuid) TO jobguard_runtime;
ALTER FUNCTION app.record_simulated_settlement(uuid,uuid,uuid,varchar,bigint,timestamptz) SET search_path=pg_catalog,app,pg_temp;
REVOKE ALL ON FUNCTION app.record_simulated_settlement(uuid,uuid,uuid,varchar,bigint,timestamptz) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

CREATE FUNCTION app.record_builder_attested_acceptance(p_tenant uuid,p_acceptance uuid,p_event uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_total bigint,p_expected integer,p_actor uuid,p_customer varchar,p_method varchar,p_accepted_at timestamptz,p_evidence uuid,p_command uuid,p_authorization uuid) RETURNS app.quote_acceptance
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE result app.quote_acceptance; payload text;
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'LP3_SYNTHETIC_DATABASE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF p_expected IS NULL OR p_version IS NULL OR p_hash IS NULL THEN RAISE EXCEPTION 'exact source revision required' USING ERRCODE='22023'; END IF;
 IF p_total IS NULL OR p_total NOT BETWEEN 0 AND 1000000000000 OR p_customer IS NULL OR length(btrim(p_customer)) NOT BETWEEN 1 AND 160 OR p_customer IS DISTINCT FROM btrim(p_customer) OR p_method IS NULL OR p_method NOT IN('verbal','email','message','signed-paper') OR p_accepted_at IS NULL OR p_accepted_at IS DISTINCT FROM date_trunc('milliseconds',p_accepted_at) THEN RAISE EXCEPTION 'invalid acceptance facts' USING ERRCODE='22023'; END IF;
 IF p_evidence IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.evidence_object e JOIN app.evidence_upload u
  ON(u.tenant_id,u.id,u.job_id)=(e.tenant_id,e.upload_id,e.job_id)
  WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.id=p_evidence AND e.kind='original'
  AND u.state='verified' AND u.object_version_id=e.object_version_id
  AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=e.tenant_id AND i.evidence_id=e.id))
 THEN RAISE EXCEPTION 'invalid acceptance evidence' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job) THEN RAISE EXCEPTION 'final account locked' USING ERRCODE='22023'; END IF;
 payload:=app.lp3_input_hash(ARRAY['lp3-input.v1','quote.acceptance.attest',p_tenant::text,p_actor::text,p_job::text,p_document::text,p_version::text,p_hash,p_expected::text,p_total::text,'GBP',p_customer,p_method,to_char(p_accepted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),p_evidence::text,'builder-attestation.v1']);
 PERFORM app.lp3_authorize(p_tenant,p_actor,p_command,p_authorization,'quote.acceptance.attest','quote.acceptance.attest','quote_document',p_document::text,p_hash,p_version,p_total,'GBP',p_customer,'builder-attestation.v1',payload,p_job,p_expected);
 SELECT * INTO result FROM app.record_builder_attested_acceptance(p_tenant,p_acceptance,p_event,p_job,p_document,p_version,p_hash,p_total,p_expected,p_actor,p_customer,p_method,p_accepted_at,p_evidence);
 RETURN result;
END $$;
ALTER FUNCTION app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,varchar,varchar,timestamptz,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,varchar,varchar,timestamptz,uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,varchar,varchar,timestamptz,uuid,uuid,uuid) TO jobguard_runtime;
ALTER FUNCTION app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,varchar,varchar,timestamptz,uuid) SET search_path=pg_catalog,app,pg_temp;
REVOKE ALL ON FUNCTION app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,varchar,varchar,timestamptz,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

CREATE FUNCTION app.record_quote_disposition(p_tenant uuid,p_event uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_expected integer,p_actor uuid,p_kind varchar,p_occurred timestamptz,p_command uuid,p_authorization uuid) RETURNS app.acceptance_event
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE result app.acceptance_event; payload text;
BEGIN
 IF current_database() IS DISTINCT FROM 'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'LP3_SYNTHETIC_DATABASE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF p_expected IS NULL OR p_version IS NULL OR p_hash IS NULL THEN RAISE EXCEPTION 'exact source revision required' USING ERRCODE='22023'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN('declined','superseded','acceptance_cancelled') OR p_occurred IS NULL OR p_occurred IS DISTINCT FROM date_trunc('milliseconds',p_occurred) THEN RAISE EXCEPTION 'invalid disposition facts' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job) THEN RAISE EXCEPTION 'final account locked' USING ERRCODE='22023'; END IF;
 payload:=app.lp3_input_hash(ARRAY['lp3-input.v1','quote.'||p_kind,p_tenant::text,p_actor::text,p_job::text,p_document::text,p_version::text,p_hash,p_expected::text,p_kind,to_char(p_occurred AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),NULL,NULL,NULL,'quote-disposition.v1']);
 PERFORM app.lp3_authorize(p_tenant,p_actor,p_command,p_authorization,'quote.'||p_kind,'quote.'||p_kind,'quote_document',p_document::text,p_hash,p_version,NULL,NULL,NULL,'quote-disposition.v1',payload,p_job,p_expected);
 SELECT * INTO result FROM app.record_quote_disposition(p_tenant,p_event,p_job,p_document,p_version,p_hash,p_expected,p_actor,p_kind,p_occurred);
 RETURN result;
END $$;
ALTER FUNCTION app.record_quote_disposition(uuid,uuid,uuid,uuid,integer,character,integer,uuid,varchar,timestamptz,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.record_quote_disposition(uuid,uuid,uuid,uuid,integer,character,integer,uuid,varchar,timestamptz,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.record_quote_disposition(uuid,uuid,uuid,uuid,integer,character,integer,uuid,varchar,timestamptz,uuid,uuid) TO jobguard_runtime;
ALTER FUNCTION app.record_quote_disposition(uuid,uuid,uuid,uuid,integer,character,integer,uuid,varchar,timestamptz) SET search_path=pg_catalog,app,pg_temp;
REVOKE ALL ON FUNCTION app.record_quote_disposition(uuid,uuid,uuid,uuid,integer,character,integer,uuid,varchar,timestamptz) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
COMMIT;
