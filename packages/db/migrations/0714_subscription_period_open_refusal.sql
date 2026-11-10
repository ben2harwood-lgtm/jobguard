BEGIN;
-- LATER-SAFETY-85 (RED): refuse an open period for every tenant before freezing its statement.
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
 IF next_day>(clock_timestamp() AT TIME ZONE 'Europe/London')::date THEN
  RAISE EXCEPTION 'SUBSCRIPTION_PERIOD_OPEN' USING ERRCODE='22023';
 END IF;
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
  -- Reuse the immediate MON-1 Decision if capacity already raised it.
  SELECT id INTO decision_id FROM app.decision WHERE tenant_id=t AND subject_type='subscription'
   AND subject_ref=t::text AND action_type='subscription.track_review' ORDER BY created_at,id LIMIT 1;
  IF decision_id IS NULL THEN
   decision_id:=gen_random_uuid();
   INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision_id,t,'subscription',t::text,'subscription.track_review');
  END IF;
  -- End Decision reuse
  INSERT INTO app.subscription_review VALUES(t,review_id,period_id,src.id,'track_review_due',decision_id,card_id,true,immediate,sustained);
  INSERT INTO app.subscription_operations_card VALUES(t,card_id,review_id,'open');
 END IF;
 RETURN jsonb_build_object('periodId',period_id,'statementId',statement_id,'amountPence',amount,'principalPence',amount,'basePrincipalPence',base_amount,'sourceId',src.id,'artifactHash',artifact);
END $$;
COMMIT;
