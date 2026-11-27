BEGIN;

-- The practice wrappers remain database-restricted. The pilot entry points
-- share their existing internal mutators and require a bound pilot capture.
CREATE FUNCTION app.pilot_authorize_job_command(p_tenant uuid,p_actor uuid,p_command uuid,p_authorization uuid,
 p_command_type text,p_action text,p_subject_type text,p_subject text,p_hash text,p_version integer,
 p_amount bigint,p_currency text,p_recipient text,p_policy text,p_payload text,p_job uuid,p_expected integer) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE c app.command_receipt; a app.action_authorization;
BEGIN
 IF current_database() !~ '^jobguard_pilot(_[a-z0-9]+)*$'
  OR current_database() ~ '^jobguard_pilot_(queue|restore)(_|$)'
  OR p_tenant IS DISTINCT FROM app.current_tenant() OR p_actor IS DISTINCT FROM app.current_actor()
  OR app.pilot_capture_real_binding(p_tenant) IS DISTINCT FROM TRUE
  OR p_action NOT IN ('quote.acceptance.attest','job.switch_live')
  OR p_command_type IS DISTINCT FROM p_action
  OR NOT EXISTS (SELECT 1 FROM app.job j JOIN app.job_commercial_track t
    ON (t.tenant_id,t.job_id)=(j.tenant_id,j.id)
    WHERE (j.tenant_id,j.id)=(p_tenant,p_job) AND t.job_track='small_builder'
     AND t.environment='pilot_no_charge' AND t.provenance='pilot_capture'
     AND j.practice_session_digest IS NULL AND j.practice_scenario IS NULL)
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Match the exact pending command and its explicit owner resolution.
 SELECT * INTO c FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command FOR UPDATE;
 SELECT * INTO a FROM app.action_authorization WHERE tenant_id=p_tenant AND id=p_authorization FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner'
  AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE)
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


ALTER FUNCTION app.pilot_authorize_job_command(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,bigint,text,text,text,text,uuid,integer) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_authorize_job_command(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,bigint,text,text,text,text,uuid,integer) FROM PUBLIC;

CREATE FUNCTION app.pilot_record_quote_acceptance(
 p_tenant uuid,p_acceptance uuid,p_event uuid,p_job uuid,p_document uuid,p_version integer,
 p_hash char(64),p_total bigint,p_expected integer,p_actor uuid,p_customer varchar,
 p_accepted_at timestamptz,p_command uuid,p_authorization uuid
) RETURNS app.quote_acceptance
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE payload text; accepted app.quote_acceptance;
BEGIN
 IF p_version IS NULL OR p_hash IS NULL OR p_expected IS NULL OR p_total IS NULL
  OR p_accepted_at IS NULL OR p_accepted_at IS DISTINCT FROM date_trunc('milliseconds',p_accepted_at)
  OR p_customer IS NULL OR length(btrim(p_customer)) NOT BETWEEN 1 AND 160 OR p_customer IS DISTINCT FROM btrim(p_customer)
 THEN RAISE EXCEPTION 'INVALID_QUOTE' USING ERRCODE='22023'; END IF;
 payload:=app.lp3_input_hash(ARRAY['lp3-input.v1','quote.acceptance.attest',p_tenant::text,p_actor::text,
  p_job::text,p_document::text,p_version::text,p_hash,p_expected::text,p_total::text,'GBP',p_customer,'message',
  to_char(p_accepted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),NULL,'builder-attestation.v1']);
 PERFORM app.pilot_authorize_job_command(p_tenant,p_actor,p_command,p_authorization,
  'quote.acceptance.attest','quote.acceptance.attest','quote_document',p_document::text,p_hash,p_version,
  p_total,'GBP',p_customer,'builder-attestation.v1',payload,p_job,p_expected);
 IF NOT EXISTS (SELECT 1 FROM app.quote_document_version d
  JOIN app.quote_send s ON (s.tenant_id,s.job_id,s.document_id,s.content_hash)=(d.tenant_id,d.job_id,d.id,d.content_hash)
  JOIN app.action_outbox o ON (o.tenant_id,o.id)=(s.tenant_id,s.outbox_action_id)
  WHERE (d.tenant_id,d.job_id,d.id)=(p_tenant,p_job,p_document)
   AND d.snapshot->'customer'->>'name'=p_customer
   AND lower(d.snapshot->'customer'->>'email') LIKE '%.invalid'
   AND o.adapter='fake_quote_delivery')
  OR EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job)
 THEN RAISE EXCEPTION 'STALE_ACCEPTANCE' USING ERRCODE='22023'; END IF;
 SELECT * INTO accepted FROM app.record_builder_attested_acceptance(p_tenant,p_acceptance,p_event,p_job,p_document,
  p_version,p_hash,p_total,p_expected,p_actor,p_customer,'message',p_accepted_at,NULL);
 RETURN accepted;
END $$;

ALTER FUNCTION app.pilot_record_quote_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,varchar,timestamptz,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_record_quote_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,varchar,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pilot_record_quote_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,varchar,timestamptz,uuid,uuid) TO jobguard_runtime;

CREATE FUNCTION app.pilot_switch_job_live(
 p_tenant uuid,p_activation uuid,p_cap_snapshot uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),
 p_expected integer,p_net bigint,p_cap bigint,p_actor uuid,p_accepted_at timestamptz,p_command uuid,p_authorization uuid
) RETURNS app.job_activation
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,pg_temp AS $$
DECLARE payload text; result app.job_activation;
BEGIN
 IF p_expected IS NULL OR p_version IS NULL OR p_hash IS NULL OR p_net IS NULL OR p_cap IS NULL OR p_accepted_at IS NULL
  OR p_net NOT BETWEEN 0 AND 1000000000000 OR p_cap IS DISTINCT FROM app.reference_recovery_cap(p_net)
 THEN RAISE EXCEPTION 'INVALID_QUOTE' USING ERRCODE='22023'; END IF;
 -- Bind the immutable acceptance timestamp so identical retries fingerprint
 -- identically. The activation itself gets the database clock.
 payload:=app.lp3_input_hash(ARRAY['lp3-input.v1','job.switch_live',p_tenant::text,p_actor::text,p_job::text,
  p_document::text,p_version::text,p_hash,p_expected::text,p_net::text,p_cap::text,'pilot_no_charge',
  'pilot_no_charge.v1','reference_fee_policy_v1',NULL,NULL,NULL,
  to_char(p_accepted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')]);
 PERFORM app.pilot_authorize_job_command(p_tenant,p_actor,p_command,p_authorization,'job.switch_live','job.switch_live',
  'job',p_job::text,p_hash,p_version,NULL,NULL,NULL,'pilot_no_charge.v1',payload,p_job,p_expected);
 IF NOT EXISTS(SELECT 1 FROM app.quote_acceptance a WHERE (a.tenant_id,a.job_id,a.document_id)=(p_tenant,p_job,p_document)
   AND a.accepted_at=p_accepted_at AND a.document_hash=p_hash AND a.document_version=p_version)
 THEN RAISE EXCEPTION 'STALE_ACCEPTANCE' USING ERRCODE='22023'; END IF;
 SELECT * INTO result FROM app.switch_job_live(p_tenant,p_activation,p_cap_snapshot,NULL,p_job,p_document,
  p_version,p_hash,p_expected,p_net,p_cap,'pilot_no_charge','pilot_no_charge.v1','reference_fee_policy_v1',
  p_actor,date_trunc('milliseconds',clock_timestamp()));
 RETURN result;
END $$;

ALTER FUNCTION app.pilot_switch_job_live(uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,uuid,timestamptz,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_switch_job_live(uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,uuid,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pilot_switch_job_live(uuid,uuid,uuid,uuid,uuid,integer,character,integer,bigint,bigint,uuid,timestamptz,uuid,uuid) TO jobguard_runtime;

COMMIT;
