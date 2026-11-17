BEGIN;
-- CH-7-TERMS: proposed identifiers only, synthetic approvals; no charging authority.
CREATE TABLE app.recovery_case_terms_approval (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL,
 terms_version text NOT NULL CHECK(terms_version='synthetic_recovery_fee_terms.v1'),
 fee_policy_version text NOT NULL CHECK(fee_policy_version='reference_fee_policy_v3'),
 eligibility_policy_version text NOT NULL CHECK(eligibility_policy_version='reference_recovery_eligibility_policy_v3'),
 policy_status text NOT NULL CHECK(policy_status='proposed'),
 environment text NOT NULL CHECK(environment='synthetic_demo'),
 terms_hash char(64) NOT NULL,
 actor_membership_id uuid NOT NULL, command_id uuid NOT NULL, authorization_id uuid NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,case_id,terms_version), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,authorization_id),
 FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id),
 CONSTRAINT recovery_case_terms_canonical_hash CHECK(terms_hash=encode(sha256(convert_to(
  'recovery-case-terms.v1'||chr(10)||'caseId='||case_id::text||chr(10)||'termsVersion='||terms_version||chr(10)||
  'feePolicyVersion='||fee_policy_version||chr(10)||'eligibilityPolicyVersion='||eligibility_policy_version||chr(10)||'policyStatus='||policy_status,'UTF8')),'hex'))
);
ALTER TABLE app.recovery_case_terms_approval OWNER TO jobguard_migration;
ALTER TABLE app.recovery_case_terms_approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.recovery_case_terms_approval FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.recovery_case_terms_approval FOR ALL TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.recovery_case_terms_approval FROM PUBLIC,jobguard_runtime;
GRANT SELECT ON app.recovery_case_terms_approval TO jobguard_runtime;
CREATE FUNCTION app.pin_recovery_case_terms_approved_at() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN NEW.approved_at:=transaction_timestamp(); RETURN NEW; END $$;
ALTER FUNCTION app.pin_recovery_case_terms_approved_at() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pin_recovery_case_terms_approved_at() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER a_recovery_case_terms_time_pin BEFORE INSERT ON app.recovery_case_terms_approval FOR EACH ROW EXECUTE FUNCTION app.pin_recovery_case_terms_approved_at();
CREATE TRIGGER recovery_case_terms_immutable BEFORE UPDATE OR DELETE ON app.recovery_case_terms_approval FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();

CREATE FUNCTION app.approve_recovery_case_terms(p_tenant uuid,p_id uuid,p_job uuid,p_case uuid,p_actor uuid,p_command uuid,p_authorization uuid)
RETURNS app.recovery_case_terms_approval LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE c app.recovery_case_current; t app.recovery_case_terms_approval; h text;
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'RECOVERY_TERMS_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_tenant::text),hashtext(p_case::text));
 SELECT * INTO c FROM app.recovery_case_current WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_case AND claim_revision IS NOT NULL;
 IF c.id IS NULL OR c.synthetic IS NOT TRUE OR c.environment IS DISTINCT FROM 'synthetic_demo' THEN RAISE EXCEPTION 'RECOVERY_TERMS_CASE_NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF c.case_type IS DISTINCT FROM 'withheld_customer_payment' THEN RAISE EXCEPTION 'RECOVERY_TERMS_NOT_APPLICABLE' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job AND fee_policy_version='reference_fee_policy_v3') THEN RAISE EXCEPTION 'RECOVERY_TERMS_POLICY_MISMATCH' USING ERRCODE='23514'; END IF;
 SELECT * INTO t FROM app.recovery_case_terms_approval WHERE tenant_id=p_tenant AND case_id=p_case AND terms_version='synthetic_recovery_fee_terms.v1';
 IF t.id IS NOT NULL THEN
  IF t.command_id=p_command THEN RETURN t; END IF;
  RAISE EXCEPTION 'RECOVERY_TERMS_ALREADY_APPROVED' USING ERRCODE='40001';
 END IF;
 h:=encode(sha256(convert_to('recovery-case-terms.v1'||chr(10)||'caseId='||p_case::text||chr(10)||'termsVersion=synthetic_recovery_fee_terms.v1'||chr(10)||
  'feePolicyVersion=reference_fee_policy_v3'||chr(10)||'eligibilityPolicyVersion=reference_recovery_eligibility_policy_v3'||chr(10)||'policyStatus=proposed','UTF8')),'hex');
 -- Coordinator's 12 Oct amendment: direct SQL also requires 0109's active-owner predicate.
 IF NOT EXISTS(SELECT 1 FROM app.command_receipt cr
 JOIN app.membership m ON m.tenant_id=cr.tenant_id AND m.id=cr.actor_membership_id
 JOIN app.action_authorization a ON a.tenant_id=cr.tenant_id AND a.actor_membership_id=cr.actor_membership_id
 JOIN app.decision_resolution r ON(r.tenant_id,r.id)=(a.tenant_id,a.resolution_id)
 JOIN app.decision d ON(d.tenant_id,d.id)=(a.tenant_id,a.decision_id)
 WHERE cr.tenant_id=p_tenant AND cr.command_id=p_command AND cr.command_type='recovery.terms.approve' AND cr.status='processing' AND cr.actor_membership_id=p_actor
 AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND a.id=p_authorization AND a.action_type='recovery.terms.approve' AND a.content_hash=h AND a.aggregate_revision=1 AND a.amount_pence IS NULL AND a.currency IS NULL AND a.recipient IS NULL
 AND a.policy_version='reference_fee_policy_v3' AND a.expires_at>clock_timestamp() AND a.revoked_at IS NULL AND r.resolution='approved' AND d.subject_type='recovery_case' AND d.subject_ref=p_case::text)
 THEN RAISE EXCEPTION 'RECOVERY_TERMS_AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 INSERT INTO app.recovery_case_terms_approval(id,tenant_id,job_id,case_id,terms_version,fee_policy_version,eligibility_policy_version,policy_status,environment,terms_hash,actor_membership_id,command_id,authorization_id)
 VALUES(p_id,p_tenant,p_job,p_case,'synthetic_recovery_fee_terms.v1','reference_fee_policy_v3','reference_recovery_eligibility_policy_v3','proposed','synthetic_demo',h,p_actor,p_command,p_authorization) RETURNING * INTO t;
 RETURN t;
END $$;
ALTER FUNCTION app.approve_recovery_case_terms(uuid,uuid,uuid,uuid,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.approve_recovery_case_terms(uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.approve_recovery_case_terms(uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO jobguard_runtime;

CREATE FUNCTION app.recovery_case_terms_approved(p_tenant uuid,p_job uuid,p_case uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,app AS $$
 SELECT EXISTS(SELECT 1 FROM app.recovery_case_current c JOIN app.job j ON(j.tenant_id,j.id)=(c.tenant_id,c.job_id)
 WHERE c.tenant_id=p_tenant AND c.job_id=p_job AND c.id=p_case AND
 (c.case_type<>'withheld_customer_payment' OR j.fee_policy_version IS DISTINCT FROM 'reference_fee_policy_v3' OR
 EXISTS(SELECT 1 FROM app.recovery_case_terms_approval a WHERE a.tenant_id=c.tenant_id AND a.job_id=c.job_id AND a.case_id=c.id AND a.terms_version='synthetic_recovery_fee_terms.v1')))
$$;
ALTER FUNCTION app.recovery_case_terms_approved(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.recovery_case_terms_approved(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.recovery_case_terms_approved(uuid,uuid,uuid) TO jobguard_runtime;
CREATE FUNCTION app.guard_recovery_pursuit_terms() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.case_id::text));
 IF NOT app.recovery_case_terms_approved(NEW.tenant_id,NEW.job_id,NEW.case_id) THEN RAISE EXCEPTION 'RECOVERY_TERMS_NOT_APPROVED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_recovery_pursuit_terms() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_recovery_pursuit_terms() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER recovery_message_terms_guard BEFORE INSERT ON app.recovery_message FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_pursuit_terms();
CREATE TRIGGER recovery_message_approval_terms_guard BEFORE INSERT ON app.recovery_message_approval FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_pursuit_terms();
CREATE TRIGGER recovery_message_sink_terms_guard BEFORE INSERT ON app.recovery_message_sink FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_pursuit_terms();
COMMIT;
