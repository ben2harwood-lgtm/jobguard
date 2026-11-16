-- LATER-SAFETY-158 (RED): reconcile attempted work against its original exact approval.
-- Replaces only mon2_command from 0746; execute/record and owner-before-replay stay intact.
BEGIN;
CREATE OR REPLACE FUNCTION app.mon2_command(t uuid,digest text,command_id uuid,v jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE actor uuid; prior app.command_receipt; kind text:=v->>'kind'; allowed text[]; hash text; result jsonb; a app.subscription_agreement_revision;
 current_revision integer; expected integer; accepted_time timestamptz; today date; next_day date; auth uuid;
 new_id uuid:=gen_random_uuid(); approval_hash text; change app.subscription_plan_change; source app.meter_input_event; projected jsonb;
 capacity integer; outcome text; statement app.platform_statement; work app.subscription_simulated_work; previous_result app.subscription_simulated_result; approval_expiry timestamptz;
BEGIN
 actor:=app.mon1_company_actor(t,digest);
 -- Same lock as immutable meter loaders/rebuilds; no audit head allocated until
 -- all business/receipt writes have finished. Recheck after a contended wait.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 actor:=app.mon1_company_actor(t,digest);
 IF kind IN('accept','change','approve_simulation','issue','apply_change','record_simulation','reconcile_simulation') AND NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'SUBSCRIPTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 accepted_time:=clock_timestamp(); today:=(accepted_time AT TIME ZONE 'Europe/London')::date;
 SELECT expires_at INTO approval_expiry FROM identity.session WHERE token_digest=digest AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp();
 allowed:=CASE kind
 WHEN 'accept' THEN ARRAY['plan','cadence','anchorDay','termsVersion','catalogueVersion','maximumPence','contentHash','expectedRevision']
 WHEN 'change' THEN ARRAY['plan','cadence','anchorDay','termsVersion','catalogueVersion','maximumPence','contentHash','expectedRevision']
 WHEN 'issue' THEN ARRAY['periodStart','expectedRevision']
 WHEN 'review' THEN ARRAY['sourceId','expectedRevision']
 WHEN 'apply_change' THEN ARRAY['changeId','sourceId','expectedRevision']
 WHEN 'approve_simulation' THEN ARRAY['statementId','expectedRevision','contentHash','amountPence']
 WHEN 'execute_simulation' THEN ARRAY['workId','expectedRevision']
 WHEN 'record_simulation' THEN ARRAY['workId','resultId','outcome','expectedRevision']
 WHEN 'reconcile_simulation' THEN ARRAY['workId','resultId','outcome','expectedRevision']
 WHEN 'onboarding' THEN ARRAY['usualPlaces','siteStaffLogExtras'] ELSE NULL END;
 IF allowed IS NULL THEN RAISE EXCEPTION 'INVALID_SUBSCRIPTION_COMMAND' USING ERRCODE='22023'; END IF;
 allowed:=allowed||ARRAY['version','kind'];
 IF command_id IS NULL OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR kind IS NULL OR allowed IS NULL OR v->>'version' IS DISTINCT FROM 'subscription-command.v1'
 OR NOT(v ?& allowed) OR v-allowed<>'{}'::jsonb THEN RAISE EXCEPTION 'INVALID_SUBSCRIPTION_COMMAND' USING ERRCODE='22023'; END IF;
 hash:=app.final_lock_hash(jsonb_build_object('tenantId',t,'actorMembershipId',actor,'command',v));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND app.command_receipt.command_id=mon2_command.command_id;
 IF prior.command_id IS NOT NULL THEN
  IF prior.request_hash<>hash OR prior.actor_membership_id<>actor OR prior.command_type<>'subscription.'||kind OR prior.status<>'succeeded' THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='22023'; END IF;
  RETURN prior.result;
 END IF;
 SELECT * INTO a FROM app.subscription_agreement_revision WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
 current_revision:=coalesce(a.revision,0);
 IF kind<>'onboarding' THEN
  IF jsonb_typeof(v->'expectedRevision') IS DISTINCT FROM 'number' OR (v->>'expectedRevision') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'INVALID_SUBSCRIPTION_COMMAND' USING ERRCODE='22023'; END IF;
  expected:=(v->>'expectedRevision')::integer;
  IF expected<>current_revision THEN RAISE EXCEPTION 'SUBSCRIPTION_STALE_REVISION' USING ERRCODE='40001'; END IF;
 END IF;
 IF kind IN('accept','change') THEN
  IF v->>'cadence' IS DISTINCT FROM 'monthly' OR jsonb_typeof(v->'plan') IS DISTINCT FROM 'string' OR v->>'plan' NOT IN('Solo','Builder') OR v->>'catalogueVersion' IS DISTINCT FROM 'subscription_pricing_policy_v4'
  OR v->>'termsVersion' IS DISTINCT FROM 'subscription_terms_v1' OR jsonb_typeof(v->'anchorDay') IS DISTINCT FROM 'number' OR (v->>'anchorDay') !~ '^[0-9]+$'
  OR (v->>'anchorDay')::integer NOT BETWEEN 1 AND 31 OR jsonb_typeof(v->'maximumPence') IS DISTINCT FROM 'number'
  OR v->>'maximumPence' IS DISTINCT FROM (CASE WHEN v->>'plan'='Solo' THEN '4900' ELSE '16900' END) THEN RAISE EXCEPTION 'INVALID_SUBSCRIPTION_TERMS' USING ERRCODE='22023'; END IF;
  approval_hash:=app.final_lock_hash((v-ARRAY['version','kind','contentHash'])||jsonb_build_object('tenantId',t,'consentText','Made-up company demonstration only. No real payments are taken. Monthly principal excluding VAT: Solo £29.00, including 4 jobs, maximum £49.00; Builder £69.00, including 7 jobs, maximum £169.00. Annual plans are unavailable. The selected plan, billing anchor and monthly maximum apply. Upgrades apply today. Downgrades are requested for the next billing boundary and depend on available capacity. Issued periods cannot be changed.'));
  IF v->>'contentHash' IS DISTINCT FROM approval_hash THEN RAISE EXCEPTION 'SUBSCRIPTION_CONTENT_MISMATCH' USING ERRCODE='22023'; END IF;
  IF (kind='accept' AND current_revision<>0) OR (kind='change' AND current_revision=0) THEN RAISE EXCEPTION 'SUBSCRIPTION_STALE_REVISION' USING ERRCODE='40001'; END IF;
  IF kind='accept' AND (v->>'anchorDay')::integer<>extract(day FROM today)::integer THEN
   RAISE EXCEPTION 'SUBSCRIPTION_ANCHOR_NOT_ACCEPTANCE_DAY' USING ERRCODE='22023';
  END IF;
  IF current_revision>0 AND a.anchor_day<>(v->>'anchorDay')::integer THEN RAISE EXCEPTION 'SUBSCRIPTION_REANCHOR_POLICY_HOLD' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM app.subscription_period WHERE tenant_id=t AND period_end>today) THEN RAISE EXCEPTION 'SUBSCRIPTION_PERIOD_ALREADY_ISSUED' USING ERRCODE='22023'; END IF;
  IF kind='change' AND a.plan='Builder' AND v->>'plan'='Solo' THEN
   next_day:=app.mon2_boundary(today,a.anchor_day);
   IF next_day<=today THEN next_day:=app.mon2_boundary((date_trunc('month',today)+interval '1 month')::date,a.anchor_day); END IF;
   -- Single-use exact downgrade approval survives the login session through its first Solo period.
   approval_expiry:=app.mon2_boundary((date_trunc('month',next_day)+interval '1 month')::date,a.anchor_day)::timestamp AT TIME ZONE 'Europe/London';
  auth:=app.mon2_approve(t,actor,'subscription.'||kind,approval_hash,current_revision,NULL,t,approval_expiry);
   INSERT INTO app.subscription_plan_change(tenant_id,id,expected_revision,plan,effective_date,authorization_id,content_hash,actor_membership_id)
   VALUES(t,new_id,current_revision,'Solo',next_day,auth,approval_hash,actor);
   result:=jsonb_build_object('changeId',new_id,'revision',current_revision,'status','pending','effectiveDate',next_day::text);
  ELSE
  auth:=app.mon2_approve(t,actor,'subscription.'||kind,approval_hash,current_revision,NULL,t,approval_expiry);
   INSERT INTO app.subscription_agreement_revision(tenant_id,id,revision,catalogue_version,terms_version,plan,cadence,anchor_day,maximum_pence,content_hash,effective_date,actor_membership_id,authorization_id,accepted_at)
   VALUES(t,new_id,current_revision+1,v->>'catalogueVersion',v->>'termsVersion',v->>'plan','monthly',(CASE WHEN kind='accept' THEN extract(day FROM today)::integer ELSE a.anchor_day END),(v->>'maximumPence')::integer,approval_hash,today,actor,auth,accepted_time);
   result:=jsonb_build_object('agreementId',new_id,'revision',current_revision+1,'effectiveDate',today::text);
  END IF;
 ELSIF kind='issue' THEN
  IF jsonb_typeof(v->'periodStart') IS DISTINCT FROM 'string' OR v->>'periodStart' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'INVALID_SUBSCRIPTION_COMMAND' USING ERRCODE='22023'; END IF;
  result:=app.mon2_issue(t,digest,(v->>'periodStart')::date,current_revision);
 ELSIF kind='review' THEN
  result:=app.mon2_review(t,digest,(v->>'sourceId')::uuid);
 ELSIF kind='apply_change' THEN
  SELECT * INTO change FROM app.subscription_plan_change WHERE tenant_id=t AND id=(v->>'changeId')::uuid;
  SELECT * INTO source FROM app.meter_input_event WHERE tenant_id=t AND id=(v->>'sourceId')::uuid;
  IF change.id IS NULL OR source.id IS NULL THEN RAISE EXCEPTION 'SUBSCRIPTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM app.subscription_change_outcome WHERE tenant_id=t AND change_id=change.id) THEN RAISE EXCEPTION 'SUBSCRIPTION_CHANGE_ALREADY_APPLIED' USING ERRCODE='22023'; END IF;
  IF today<change.effective_date OR source.period_start<>change.effective_date OR source.sequence<>(SELECT max(sequence) FROM app.meter_input_event WHERE tenant_id=t AND period_start=change.effective_date)
  OR EXISTS(SELECT 1 FROM app.subscription_period WHERE tenant_id=t AND period_end>change.effective_date) THEN RAISE EXCEPTION 'SUBSCRIPTION_CHANGE_NOT_DUE' USING ERRCODE='22023'; END IF;
  -- Supplied-fact capacity only; no claim that CH-4 lifecycle admission is wired.
  SELECT count(*)-least(count(*) FILTER(WHERE small),4) INTO capacity FROM (
   SELECT bool_and((j->>'small')::boolean) small FROM jsonb_array_elements(source.input->'days') d CROSS JOIN LATERAL jsonb_array_elements(d->'jobs') j
   WHERE d->>'date'=change.effective_date::text GROUP BY (j->>'customerId')::uuid,(j->>'siteId')::uuid) places;
  outcome:=CASE WHEN change.expected_revision<>current_revision THEN 'refused_stale'
   WHEN NOT app.mon2_authorized(t,change.authorization_id,change.expected_revision) OR NOT EXISTS(SELECT 1 FROM app.action_authorization au JOIN app.decision d ON(d.tenant_id,d.id)=(au.tenant_id,au.decision_id) WHERE au.tenant_id=t AND au.id=change.authorization_id AND au.action_type='subscription.change' AND au.content_hash=change.content_hash AND d.subject_type='subscription' AND d.subject_ref=t::text) THEN 'refused_authority'
   WHEN capacity>5 THEN 'refused_capacity' ELSE 'applied' END;
  INSERT INTO app.subscription_change_outcome(tenant_id,change_id,source_id,outcome) VALUES(t,change.id,source.id,outcome);
  IF outcome='applied' THEN
   INSERT INTO app.subscription_agreement_revision(tenant_id,id,revision,catalogue_version,terms_version,plan,cadence,anchor_day,maximum_pence,content_hash,effective_date,actor_membership_id,authorization_id)
   VALUES(t,new_id,current_revision+1,a.catalogue_version,a.terms_version,'Solo','monthly',a.anchor_day,4900,change.content_hash,change.effective_date,change.actor_membership_id,change.authorization_id);
  END IF;
  result:=jsonb_build_object('changeId',change.id,'outcome',outcome,'revision',current_revision+CASE WHEN outcome='applied' THEN 1 ELSE 0 END);
 ELSIF kind='approve_simulation' THEN
  SELECT * INTO statement FROM app.platform_statement WHERE tenant_id=t AND id=(v->>'statementId')::uuid;
  IF statement.id IS NULL THEN RAISE EXCEPTION 'SUBSCRIPTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(v->'amountPence') IS DISTINCT FROM 'number' OR v->>'amountPence' IS DISTINCT FROM statement.amount_pence::text OR v->>'contentHash' IS DISTINCT FROM statement.artifact_hash THEN RAISE EXCEPTION 'SUBSCRIPTION_CONTENT_MISMATCH' USING ERRCODE='22023'; END IF;
  auth:=app.mon2_approve(t,actor,'subscription.simulate',statement.artifact_hash,current_revision,statement.amount_pence,statement.id,approval_expiry);
  INSERT INTO app.subscription_simulated_work VALUES(t,new_id,statement.id,auth,current_revision,statement.amount_pence,statement.artifact_hash,'synthetic_demo');
  result:=jsonb_build_object('workId',new_id,'statementId',statement.id,'amountPence',statement.amount_pence,'contentHash',statement.artifact_hash,'currency','GBP','revision',current_revision);
 ELSIF kind IN('execute_simulation','record_simulation','reconcile_simulation') THEN
  SELECT * INTO work FROM app.subscription_simulated_work WHERE tenant_id=t AND id=(v->>'workId')::uuid;
  IF kind='reconcile_simulation' THEN
   -- Recover only a result of already-attempted immutable work. Natural expiry
   -- and later terms do not erase that fact; revocation still closes this path.
   IF work.id IS NULL
   OR NOT EXISTS(SELECT 1 FROM app.subscription_simulated_attempt WHERE tenant_id=t AND work_id=work.id)
   OR NOT app.mon3_validate_billing(t,work.authorization_id)
   OR NOT EXISTS(
    SELECT 1 FROM app.action_authorization au
    JOIN app.decision d ON(d.tenant_id,d.id)=(au.tenant_id,au.decision_id)
    JOIN app.decision_resolution r ON(r.tenant_id,r.id,r.decision_id)=(au.tenant_id,au.resolution_id,au.decision_id)
    JOIN app.membership m ON(m.tenant_id,m.id)=(au.tenant_id,au.actor_membership_id)
    JOIN app.platform_statement st ON(st.tenant_id,st.id)=(au.tenant_id,work.statement_id)
    JOIN app.subscription_agreement_revision ag ON(ag.tenant_id,ag.revision)=(au.tenant_id,work.agreement_revision)
    WHERE au.tenant_id=t AND au.id=work.authorization_id AND au.aggregate_revision=work.agreement_revision
    AND au.revoked_at IS NULL AND au.action_type='subscription.simulate' AND au.recipient IS NULL
    AND au.amount_pence=work.amount_pence AND au.currency=st.currency AND au.currency='GBP'
    AND au.content_hash=work.content_hash AND au.policy_version=ag.catalogue_version
    AND au.policy_version='subscription_pricing_policy_v4'
    AND d.subject_type='subscription' AND d.subject_ref=work.statement_id::text AND d.action_type=au.action_type
    AND r.resolution='approved' AND r.actor_membership_id=au.actor_membership_id
    AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation revoked WHERE revoked.tenant_id=t AND revoked.membership_id=m.id)
    AND st.amount_pence=work.amount_pence AND st.artifact_hash=work.content_hash
    AND st.namespace='subscription.synthetic.v1' AND st.hypothetical AND work.environment=ag.environment
    AND work.environment='synthetic_demo'
   ) THEN RAISE EXCEPTION 'SUBSCRIPTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  ELSE
  IF work.id IS NULL OR work.agreement_revision<>current_revision OR NOT app.mon2_authorized(t,work.authorization_id,current_revision) THEN RAISE EXCEPTION 'SUBSCRIPTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  END IF;
  IF kind='execute_simulation' THEN
   IF EXISTS(SELECT 1 FROM app.subscription_simulated_attempt WHERE tenant_id=t AND work_id=work.id) THEN RAISE EXCEPTION 'SUBSCRIPTION_RECONCILIATION_REQUIRED' USING ERRCODE='22023'; END IF;
   INSERT INTO app.subscription_simulated_attempt(tenant_id,id,work_id) VALUES(t,new_id,work.id);
  ELSE
   IF v->>'outcome' NOT IN('redirect','settled','outcome_unknown','failed') OR jsonb_typeof(v->'outcome') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'INVALID_SUBSCRIPTION_COMMAND' USING ERRCODE='22023'; END IF;
   SELECT * INTO previous_result FROM app.subscription_simulated_result WHERE tenant_id=t AND id=(v->>'resultId')::uuid;
   IF previous_result.id IS NOT NULL THEN
    IF previous_result.work_id<>work.id OR previous_result.outcome<>v->>'outcome' THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='22023'; END IF;
   ELSE
    IF EXISTS(SELECT 1 FROM app.subscription_simulated_result sr WHERE sr.tenant_id=t AND sr.work_id=work.id AND sr.outcome IN('settled','failed')) THEN RAISE EXCEPTION 'SUBSCRIPTION_RESULT_FINAL' USING ERRCODE='22023'; END IF;
    IF kind='reconcile_simulation' AND NOT EXISTS(SELECT 1 FROM app.subscription_simulated_result sr WHERE sr.tenant_id=t AND sr.work_id=work.id AND sr.outcome='outcome_unknown') AND EXISTS(SELECT 1 FROM app.subscription_simulated_result sr WHERE sr.tenant_id=t AND sr.work_id=work.id) THEN RAISE EXCEPTION 'SUBSCRIPTION_RECONCILIATION_NOT_REQUIRED' USING ERRCODE='22023'; END IF;
    IF kind='record_simulation' AND EXISTS(SELECT 1 FROM app.subscription_simulated_result sr WHERE sr.tenant_id=t AND sr.work_id=work.id AND sr.outcome='outcome_unknown') THEN RAISE EXCEPTION 'SUBSCRIPTION_RECONCILIATION_REQUIRED' USING ERRCODE='22023'; END IF;
    INSERT INTO app.subscription_simulated_result(tenant_id,id,work_id,outcome,reconciled,environment) VALUES(t,(v->>'resultId')::uuid,work.id,v->>'outcome',kind='reconcile_simulation','synthetic_demo');
   END IF;
  END IF;
  result:=jsonb_build_object('workId',work.id,'statementId',work.statement_id,'amountPence',work.amount_pence,'contentHash',work.content_hash,'currency','GBP','revision',current_revision);
  IF kind<>'execute_simulation' THEN result:=result||jsonb_build_object('resultId',v->>'resultId','outcome',v->>'outcome','settled',v->>'outcome'='settled'); END IF;
 ELSIF kind='onboarding' THEN
  IF jsonb_typeof(v->'usualPlaces') IS DISTINCT FROM 'number' OR (v->>'usualPlaces') !~ '^[0-9]+$' OR jsonb_typeof(v->'siteStaffLogExtras') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'INVALID_SUBSCRIPTION_COMMAND' USING ERRCODE='22023'; END IF;
  outcome:=CASE WHEN (v->>'usualPlaces')::integer>7 OR(v->>'siteStaffLogExtras')::boolean THEN 'contractor' ELSE 'small_builder' END;
  INSERT INTO app.subscription_onboarding VALUES(t,new_id,(v->>'usualPlaces')::integer,(v->>'siteStaffLogExtras')::boolean,outcome);
  result:=jsonb_build_object('recommendationId',new_id,'recommendedTrack',outcome);
 END IF;
 result:=result||jsonb_build_object('version','subscription-command-result.v1','kind',kind,'hypothetical',true,'environment','synthetic_demo');
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(command_id,t,'subscription.'||kind,command_id::text,hash,'succeeded',result,actor,clock_timestamp());
 -- Final acquired lock: no business locks or writes follow audit allocation.
 PERFORM app.mon2_audit(t,actor,command_id,kind,hash,app.final_lock_hash(result));
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'INVALID_SUBSCRIPTION_COMMAND' USING ERRCODE='22023';
END $$;
COMMIT;
