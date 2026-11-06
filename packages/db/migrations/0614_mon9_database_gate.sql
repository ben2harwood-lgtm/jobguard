BEGIN;
-- LATER-SAFETY-1: explicit election gate; preserve immutable replay receipts.
CREATE OR REPLACE FUNCTION app.mon9_elect(digest text,j uuid,c uuid,actor uuid,command uuid,auth_id uuid,service text,points integer,terms text)
RETURNS app.managed_recovery_election LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF app.mon9_session(digest,actor) IS NULL THEN
  RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 RETURN app.mon9_elect(j,c,actor,command,auth_id,service,points,terms);
END $$;
CREATE OR REPLACE FUNCTION app.mon9_elect(j uuid,c uuid,actor uuid,command uuid,auth_id uuid,service text,points integer,terms text)
RETURNS app.managed_recovery_election LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; prior app.managed_recovery_election; h text;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF t IS NULL THEN RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(c::text));
 IF terms IS DISTINCT FROM 'managed-recovery.synthetic-terms.v1' OR
  ((service='drafted_for_you' AND points=5) OR (service='solicitor_letter' AND points=10)) IS NOT TRUE
 THEN RAISE EXCEPTION 'INVALID_MANAGED_RECOVERY' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.recovery_case r JOIN app.job job ON(job.tenant_id,job.id)=(r.tenant_id,r.job_id)
  JOIN app.job_commercial_track track ON(track.tenant_id,track.job_id)=(r.tenant_id,r.job_id)
  WHERE r.tenant_id=t AND r.job_id=j AND r.id=c AND r.synthetic AND r.environment='synthetic_demo'
   AND r.case_type='withheld_customer_payment' AND job.fee_policy_version='reference_fee_policy_v3'
   AND track.job_track='small_builder' AND track.environment='synthetic_demo')
 THEN RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 h:=encode(sha256(convert_to('managed-recovery-election-command.v1'||chr(10)||j::text||chr(10)||c::text||chr(10)||service||chr(10)||points::text||chr(10)||terms,'UTF8')),'hex');
 IF NOT EXISTS(SELECT 1 FROM app.command_receipt cr
  JOIN app.membership m ON(m.tenant_id,m.id)=(cr.tenant_id,cr.actor_membership_id)
  JOIN app.action_authorization a ON(a.tenant_id,a.actor_membership_id)=(cr.tenant_id,m.id)
  JOIN app.decision_resolution r ON(r.tenant_id,r.id)=(a.tenant_id,a.resolution_id)
  JOIN app.decision d ON(d.tenant_id,d.id)=(a.tenant_id,a.decision_id)
  WHERE cr.tenant_id=t AND cr.command_id=command AND cr.actor_membership_id=actor AND cr.status='processing'
   AND cr.command_type='managed_recovery.elect' AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND a.id=auth_id AND a.action_type='managed_recovery.elect' AND a.content_hash=h AND a.aggregate_revision=1
   AND a.policy_version=terms AND a.recipient IS NULL AND a.amount_pence IS NULL AND a.currency IS NULL
   AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND r.resolution='approved'
   AND r.decision_id=d.id AND r.actor_membership_id=actor AND d.action_type='managed_recovery.elect'
   AND d.subject_type='recovery_case' AND d.subject_ref=c::text)
 THEN RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM app.managed_recovery_election e WHERE e.tenant_id=t AND e.case_id=c;
 IF prior.case_id IS NOT NULL THEN RAISE EXCEPTION 'MANAGED_RECOVERY_CONFLICT' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM app.managed_recovery_pursuit p WHERE p.tenant_id=t AND p.case_id=c)
  -- Owner/legacy writes outside a tenant command do not create a MON-9 marker.
  -- Their immutable pursuit history must still prevent a later election.
  OR EXISTS(SELECT 1 FROM app.recovery_case_event e WHERE e.tenant_id=t AND e.job_id=j AND e.case_id=c AND e.event_type NOT IN('opened','claim_amended','assemble_evidence'))
  OR EXISTS(SELECT 1 FROM app.recovery_message m WHERE m.tenant_id=t AND m.job_id=j AND m.case_id=c)
  OR EXISTS(SELECT 1 FROM app.recovery_message_approval a WHERE a.tenant_id=t AND a.job_id=j AND a.case_id=c)
  OR EXISTS(SELECT 1 FROM app.recovery_message_sink s WHERE s.tenant_id=t AND s.job_id=j AND s.case_id=c)
  OR EXISTS(SELECT 1 FROM app.recovery_case r WHERE r.tenant_id=t AND r.job_id=j AND r.id=c AND r.state<>'identified')
  OR EXISTS(SELECT 1 FROM app.recovery_case_current r WHERE r.tenant_id=t AND r.job_id=j AND r.id=c AND r.state NOT IN('identified','evidence_assembled'))
 THEN RAISE EXCEPTION 'PURSUIT_ALREADY_STARTED' USING ERRCODE='23514'; END IF;
 INSERT INTO app.managed_recovery_election(tenant_id,job_id,case_id,command_id,actor_membership_id,authorization_id,service,points,terms_version)
 VALUES(t,j,c,command,actor,auth_id,service,points,terms) RETURNING * INTO prior;
 -- No further business writes follow the audit seal; completion appends its own
 -- checked event through the existing LP-5 boundary.
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
  'actorRef','membership:'||actor::text,'eventType','managed_recovery.elected',
  'subjectType','recovery_case','subjectRef',c::text,'payload',jsonb_build_object(
   'references',jsonb_build_object('jobId',j::text,'commandId',command::text),
   'hashes',jsonb_build_object('election',encode(sha256(convert_to(replace(jsonb_build_array(
    'managed-recovery-election.v1',t,j,c,command,actor,
    to_char(prior.elected_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    terms,service,points)::text,', ',','),'UTF8')),'hex')),
   'classifications',jsonb_build_object('action','commercial')))),'checked_operation');
 RETURN prior;
END $$;
COMMIT;
