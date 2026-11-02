-- MON-2A first-period safety. Forward fix only; no historical rows are changed.
-- Latest main definitions: 0195 + 0336 consent binding for mon2_command; 0373 for mon2_issue.
-- CREATE OR REPLACE preserves ownership and existing ACLs; no new routines or privileges.
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
 IF kind IN('accept','change','approve_simulation') AND NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'SUBSCRIPTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
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
  IF work.id IS NULL OR work.agreement_revision<>current_revision OR NOT app.mon2_authorized(t,work.authorization_id,current_revision) THEN RAISE EXCEPTION 'SUBSCRIPTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
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


CREATE OR REPLACE FUNCTION app.mon2_issue(t uuid,digest text,start_day date,revision integer) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE src app.meter_input_event; a app.subscription_agreement_revision; existing app.subscription_period;
 input jsonb; projected jsonb; day jsonb; g record; correction record; binding jsonb; line jsonb;
 bindings jsonb:='[]'; lines jsonb:='{}'; dispositions jsonb:='[]'; line_key text; place_key text; attribution text;
 included integer; cap integer; small_n integer; counted_n integer; denominator integer; amount bigint; maximum bigint; base_amount bigint;
 correction_value bigint; applied bigint; excess bigint; prior_source uuid; unallocated bigint; numerator bigint;
 period_id uuid:=gen_random_uuid(); statement_id uuid:=gen_random_uuid(); review_id uuid; decision_id uuid; card_id uuid;
 artifact text; immediate boolean:=false; sustained boolean:=false; busy integer; next_day date; content jsonb;
BEGIN
 SELECT * INTO existing FROM app.subscription_period WHERE tenant_id=t AND period_start=start_day;
 IF existing.id IS NOT NULL THEN
  RETURN jsonb_build_object('periodId',existing.id,'statementId',(SELECT id FROM app.platform_statement WHERE tenant_id=t AND platform_statement.period_id=existing.id),'amountPence',existing.principal_pence,'principalPence',existing.principal_pence,'basePrincipalPence',(existing.result->'principal'->>'pence')::bigint,'sourceId',existing.source_id,'artifactHash',existing.artifact_hash);
 END IF;
 SELECT * INTO a FROM app.subscription_agreement_revision WHERE tenant_id=t ORDER BY subscription_agreement_revision.revision DESC LIMIT 1;
 IF start_day<(SELECT (accepted_at AT TIME ZONE 'Europe/London')::date FROM app.subscription_agreement_revision WHERE tenant_id=t ORDER BY subscription_agreement_revision.revision LIMIT 1) THEN
  RAISE EXCEPTION 'SUBSCRIPTION_PERIOD_BEFORE_ACCEPTANCE' USING ERRCODE='22023';
 END IF;
 IF a.id IS NULL OR a.revision<>revision OR start_day<>app.mon2_boundary(start_day,a.anchor_day) THEN RAISE EXCEPTION 'SUBSCRIPTION_REVISION_OR_ANCHOR' USING ERRCODE='22023'; END IF;
 next_day:=app.mon2_boundary((date_trunc('month',start_day)+interval '1 month')::date,a.anchor_day);
 SELECT * INTO src FROM app.meter_input_event WHERE tenant_id=t AND period_start=start_day ORDER BY sequence DESC LIMIT 1;
 IF src.id IS NULL OR src.period_end<>next_day THEN RAISE EXCEPTION 'SUBSCRIPTION_SOURCE_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 PERFORM app.mon3_pin_source(t,digest,src.id);
 input:=app.mon2_source(t,digest,src.id); projected:=app.mon1_project(t,input);
 denominator:=next_day-start_day; base_amount:=(projected->'principal'->>'pence')::bigint;
 amount:=base_amount; maximum:=(projected->'maximum'->>'pence')::bigint;
 FOR day IN SELECT value FROM jsonb_array_elements(input->'days') ORDER BY value->>'date' LOOP
  included:=CASE WHEN day->>'plan'='Solo' THEN 4 ELSE 7 END; cap:=CASE WHEN included=4 THEN 1 ELSE 5 END;
  line_key:='plan:'||(day->>'plan');
  numerator:=coalesce((lines->line_key->>'numerator')::bigint,0)+CASE WHEN (day->>'trial')::boolean THEN 0 WHEN included=4 THEN 2900 ELSE 6900 END;
  lines:=jsonb_set(lines,ARRAY[line_key],jsonb_build_object('kind','plan','numerator',numerator));
  small_n:=0; counted_n:=0;
  -- Small allowance is assigned first by canonical place identity. All remaining
  -- places (including non-exempt small ones) then use canonical identity order.
  FOR g IN WITH grouped AS (
   SELECT (value->>'customerId')::uuid customer,(value->>'siteId')::uuid site,
    min((value->>'jobId')::uuid::text)::uuid representative,bool_and((value->>'small')::boolean) small
   FROM jsonb_array_elements(day->'jobs') GROUP BY (value->>'customerId')::uuid,(value->>'siteId')::uuid
  ), ranked AS (SELECT *,CASE WHEN small THEN row_number() OVER(PARTITION BY small ORDER BY customer,site) ELSE NULL END small_rank FROM grouped)
  SELECT * FROM ranked ORDER BY CASE WHEN small_rank<=included THEN 0 ELSE 1 END,customer,site LOOP
   place_key:=t::text||':'||g.customer::text||':'||g.site::text;
   IF g.small AND g.small_rank<=included THEN attribution:='small_allowance'; small_n:=small_n+1;
   ELSE
    counted_n:=counted_n+1;
    attribution:=CASE WHEN counted_n<=included THEN 'included' WHEN counted_n<=included+cap THEN 'paid_extra' ELSE 'grace' END;
   END IF;
   IF attribution='paid_extra' THEN
    line_key:='extra:'||place_key; numerator:=coalesce((lines->line_key->>'numerator')::bigint,0)+CASE WHEN (day->>'trial')::boolean THEN 0 ELSE 2000 END;
    lines:=jsonb_set(lines,ARRAY[line_key],jsonb_build_object('kind','extra','numerator',numerator));
   END IF;
   bindings:=bindings||jsonb_build_array(jsonb_build_object('date',day->>'date','placeKey',place_key,'customer',g.customer,'site',g.site,'representative',g.representative,'attribution',attribution));
  END LOOP;
  IF day->>'plan'='Builder' AND counted_n>13 THEN immediate:=true; END IF;
 END LOOP;
 -- Qualified MON-1 correction identities are retained; values are freshly
 -- derived from their immutable source and predecessor under accepted terms.
 FOR correction IN SELECT c.*,mc.source_id FROM app.meter_correction c JOIN app.meter_computation mc ON(mc.tenant_id,mc.id)=(c.tenant_id,c.computation_id)
 WHERE c.tenant_id=t AND c.apply_start=start_day ORDER BY c.id LOOP
  IF EXISTS(SELECT 1 FROM app.subscription_correction_disposition WHERE tenant_id=t AND correction_id=correction.id) THEN RAISE EXCEPTION 'SUBSCRIPTION_CORRECTION_REUSED'; END IF;
  SELECT old.source_id INTO prior_source FROM app.meter_computation old JOIN app.meter_input_event e ON(e.tenant_id,e.id)=(old.tenant_id,old.source_id)
  WHERE old.tenant_id=t AND old.period_start=correction.period_start AND e.sequence<(SELECT sequence FROM app.meter_input_event WHERE tenant_id=t AND id=correction.source_id)
  ORDER BY e.sequence DESC LIMIT 1;
  IF prior_source IS NULL THEN RAISE EXCEPTION 'SUBSCRIPTION_CORRECTION_SOURCE_MISSING'; END IF;
  correction_value:=(app.mon1_project(t,app.mon2_source(t,digest,correction.source_id))->'principal'->>'pence')::bigint-(app.mon1_project(t,app.mon2_source(t,digest,prior_source))->'principal'->>'pence')::bigint;
  applied:=least(greatest(correction_value,0),maximum-amount); excess:=greatest(correction_value,0)-applied; amount:=amount+applied;
  dispositions:=dispositions||jsonb_build_array(jsonb_build_object('id',correction.id,'full',correction_value,'applied',applied,'excess',excess));
 END LOOP;
 -- Largest remainder: exactly one final rounding, deterministic key tie-break.
 SELECT base_amount-coalesce(sum((value->>'numerator')::bigint/denominator),0) INTO unallocated FROM jsonb_each(lines);
 SELECT jsonb_agg(jsonb_build_object('lineKey',key,'kind',value->>'kind','numeratorPence',value->>'numerator','denominatorDays',denominator,
  'amountPence',(value->>'numerator')::bigint/denominator+CASE WHEN rank<=unallocated THEN 1 ELSE 0 END) ORDER BY key)
 INTO content FROM (SELECT key,value,row_number() OVER(ORDER BY (value->>'numerator')::bigint%denominator DESC,key COLLATE "C") rank FROM jsonb_each(lines)) allocation;
 FOR line IN SELECT value FROM jsonb_array_elements(dispositions) LOOP
  content:=content||jsonb_build_array(jsonb_build_object('lineKey','correction:'||(line->>'id'),'kind','correction','numeratorPence',((line->>'applied')::bigint*denominator)::text,'denominatorDays',denominator,'amountPence',(line->>'applied')::bigint));
 END LOOP;
 -- Canonical ordering makes hashes independent of supplied array order. Input
 -- source identity/hash is retained separately, never smuggled into attribution.
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'date',value->>'placeKey'),'[]') INTO bindings FROM jsonb_array_elements(bindings);
 SELECT jsonb_agg(value ORDER BY value->>'lineKey') INTO content FROM jsonb_array_elements(content);
 artifact:=app.final_lock_hash(jsonb_build_object('version','subscription-statement.v1','tenantId',t,'periodStart',start_day::text,'periodEnd',next_day::text,'hypothetical',true,'amountPence',amount,'lines',content,'bindings',bindings));
 INSERT INTO app.subscription_period(tenant_id,id,period_start,period_end,source_id,agreement_revision,principal_pence,maximum_pence,result,artifact_hash)
 VALUES(t,period_id,start_day,next_day,src.id,revision,amount,maximum,projected,artifact);
 FOR binding IN SELECT value FROM jsonb_array_elements(bindings) LOOP
  INSERT INTO app.subscription_place VALUES(t,binding->>'placeKey',(binding->>'customer')::uuid,(binding->>'site')::uuid) ON CONFLICT DO NOTHING;
  INSERT INTO app.subscription_place_binding VALUES(t,period_id,src.id,(binding->>'date')::date,binding->>'placeKey',(binding->>'representative')::uuid,src.sequence,binding->>'attribution','canonical-place-and-job.v1');
 END LOOP;
 FOR line IN SELECT value FROM jsonb_array_elements(content) LOOP
  INSERT INTO app.subscription_period_line VALUES(t,period_id,line->>'lineKey',(line->>'numeratorPence')::bigint,denominator,(line->>'amountPence')::bigint,line->>'kind');
 END LOOP;
 FOR line IN SELECT value FROM jsonb_array_elements(dispositions) LOOP
  INSERT INTO app.subscription_correction_disposition VALUES(t,(line->>'id')::uuid,period_id,(line->>'full')::bigint,(line->>'applied')::bigint,(line->>'excess')::bigint);
  IF (line->>'excess')::bigint>0 THEN INSERT INTO app.subscription_alert VALUES(t,period_id,(line->>'id')::uuid,'CORRECTION_EXCESS_UNCOLLECTED'); END IF;
  IF (line->>'full')::bigint<0 THEN INSERT INTO app.subscription_alert VALUES(t,period_id,(line->>'id')::uuid,'NEGATIVE_CORRECTION_POLICY_HOLD'); END IF;
 END LOOP;
 INSERT INTO app.platform_statement VALUES(t,statement_id,period_id,'subscription.synthetic.v1',amount,'GBP',true,artifact);
 INSERT INTO app.platform_statement_line SELECT t,statement_id,period_id,l.line_key,l.amount_pence FROM app.subscription_period_line l WHERE l.tenant_id=t AND l.period_id=period_id;
 -- Sustained rule needs three consecutive issued periods, two with >=10 busy days.
 SELECT count(*)=3 AND count(*) FILTER(WHERE busy_days>=10)>=2 AND bool_and(previous_end IS NULL OR previous_end=period_start)
 INTO sustained FROM (SELECT period_start,lag(period_end) OVER(ORDER BY period_start) previous_end,
  (SELECT count(*) FROM jsonb_array_elements(result->'days') d WHERE (d->>'countedPlaces')::integer>7) busy_days
  FROM (SELECT * FROM app.subscription_period WHERE tenant_id=t AND period_start<=start_day ORDER BY period_start DESC LIMIT 3) latest) history;
 IF (immediate OR (a.plan='Builder' AND sustained)) AND NOT EXISTS(SELECT 1 FROM app.subscription_review WHERE tenant_id=t AND code='track_review_due') THEN
  review_id:=gen_random_uuid(); decision_id:=gen_random_uuid(); card_id:=gen_random_uuid();
  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision_id,t,'subscription',t::text,'subscription.track_review');
  INSERT INTO app.subscription_review VALUES(t,review_id,period_id,src.id,'track_review_due',decision_id,card_id,true,immediate,sustained);
  INSERT INTO app.subscription_operations_card VALUES(t,card_id,review_id,'open');
 END IF;
 RETURN jsonb_build_object('periodId',period_id,'statementId',statement_id,'amountPence',amount,'principalPence',amount,'basePrincipalPence',base_amount,'sourceId',src.id,'artifactHash',artifact);
END $$;

COMMIT;
