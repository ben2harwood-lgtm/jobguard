BEGIN;
-- MON-2A-P: synthetic supplied facts only; no collection, tax or ledger capability.
CREATE TABLE control_plane.subscription_plan_catalogue (
 version text NOT NULL, plan text NOT NULL CHECK(plan IN('Solo','Builder')),
 terms_version text NOT NULL, monthly_pence integer NOT NULL, included integer NOT NULL,
 extras_cap integer NOT NULL, maximum_pence integer NOT NULL, annual_enabled boolean NOT NULL CHECK(NOT annual_enabled),
 PRIMARY KEY(version,plan), CHECK((plan='Solo' AND monthly_pence=2900 AND included=4 AND extras_cap=1 AND maximum_pence=4900)
 OR (plan='Builder' AND monthly_pence=6900 AND included=7 AND extras_cap=5 AND maximum_pence=16900))
);
ALTER TABLE control_plane.subscription_plan_catalogue OWNER TO jobguard_migration;
INSERT INTO control_plane.subscription_plan_catalogue VALUES
 ('subscription_pricing_policy_v4','Solo','subscription_terms_v1',2900,4,1,4900,false),
 ('subscription_pricing_policy_v4','Builder','subscription_terms_v1',6900,7,5,16900,false);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON control_plane.subscription_plan_catalogue FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
GRANT SELECT ON control_plane.subscription_plan_catalogue TO jobguard_runtime;
CREATE TABLE app.subscription_agreement_revision (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 catalogue_version text NOT NULL, terms_version text NOT NULL CHECK(terms_version='subscription_terms_v1'), plan text NOT NULL,
 cadence text NOT NULL CHECK(cadence='monthly'), anchor_day integer NOT NULL CHECK(anchor_day BETWEEN 1 AND 31),
 maximum_pence integer NOT NULL CHECK(maximum_pence IN(4900,16900)), content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 effective_date date NOT NULL, actor_membership_id uuid NOT NULL, authorization_id uuid NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(), environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,revision), FOREIGN KEY(catalogue_version,plan) REFERENCES control_plane.subscription_plan_catalogue(version,plan),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id),
 CHECK((plan='Solo' AND maximum_pence=4900) OR (plan='Builder' AND maximum_pence=16900))
);
CREATE TABLE app.subscription_plan_change (
 tenant_id uuid NOT NULL, id uuid NOT NULL, expected_revision integer NOT NULL, plan text NOT NULL CHECK(plan='Solo'),
 effective_date date NOT NULL, authorization_id uuid NOT NULL, content_hash text NOT NULL, actor_membership_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.subscription_change_outcome (
 tenant_id uuid NOT NULL, change_id uuid NOT NULL, source_id uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN('applied','refused_capacity','refused_stale','refused_authority')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,change_id),
 FOREIGN KEY(tenant_id,change_id) REFERENCES app.subscription_plan_change(tenant_id,id),
 FOREIGN KEY(tenant_id,source_id) REFERENCES app.meter_input_event(tenant_id,id)
);
CREATE TABLE app.subscription_period (
 tenant_id uuid NOT NULL, id uuid NOT NULL, period_start date NOT NULL, period_end date NOT NULL,
 source_id uuid NOT NULL, agreement_revision integer NOT NULL, principal_pence bigint NOT NULL CHECK(principal_pence BETWEEN 0 AND 16900),
 maximum_pence bigint NOT NULL CHECK(maximum_pence IN(4900,16900)), result jsonb NOT NULL, artifact_hash text NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,period_start), UNIQUE(tenant_id,id,source_id),
 FOREIGN KEY(tenant_id,source_id) REFERENCES app.meter_input_event(tenant_id,id),
 FOREIGN KEY(tenant_id,agreement_revision) REFERENCES app.subscription_agreement_revision(tenant_id,revision),
 CHECK(period_end-period_start BETWEEN 28 AND 31), CHECK(principal_pence<=maximum_pence)
);
CREATE TABLE app.subscription_place (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), place_key text NOT NULL, customer_id uuid NOT NULL, site_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,place_key), UNIQUE(tenant_id,customer_id,site_id), CHECK(place_key=tenant_id::text||':'||customer_id::text||':'||site_id::text)
);
CREATE TABLE app.subscription_place_binding (
 tenant_id uuid NOT NULL, period_id uuid NOT NULL, source_id uuid NOT NULL, date date NOT NULL, place_key text NOT NULL,
 representative_job_id uuid NOT NULL, source_revision bigint NOT NULL, attribution text NOT NULL CHECK(attribution IN('small_allowance','included','paid_extra','grace')),
 rule_version text NOT NULL CHECK(rule_version='canonical-place-and-job.v1'),
 PRIMARY KEY(tenant_id,period_id,date,place_key), FOREIGN KEY(tenant_id,period_id,source_id) REFERENCES app.subscription_period(tenant_id,id,source_id),
 FOREIGN KEY(tenant_id,place_key) REFERENCES app.subscription_place(tenant_id,place_key)
);
CREATE TABLE app.subscription_period_line (
 tenant_id uuid NOT NULL, period_id uuid NOT NULL, line_key text NOT NULL, numerator_pence bigint NOT NULL CHECK(numerator_pence>=0),
 denominator_days integer NOT NULL CHECK(denominator_days BETWEEN 28 AND 31), amount_pence bigint NOT NULL CHECK(amount_pence>=0),
 kind text NOT NULL CHECK(kind IN('plan','extra','correction')), PRIMARY KEY(tenant_id,period_id,line_key),
 FOREIGN KEY(tenant_id,period_id) REFERENCES app.subscription_period(tenant_id,id)
);
CREATE TABLE app.subscription_correction_disposition (
 tenant_id uuid NOT NULL, correction_id uuid NOT NULL, period_id uuid NOT NULL,
 full_pence bigint NOT NULL, applied_pence bigint NOT NULL CHECK(applied_pence>=0), excess_pence bigint NOT NULL CHECK(excess_pence>=0),
 PRIMARY KEY(tenant_id,correction_id), FOREIGN KEY(tenant_id,correction_id) REFERENCES app.meter_correction(tenant_id,id),
 FOREIGN KEY(tenant_id,period_id) REFERENCES app.subscription_period(tenant_id,id),
 CHECK((full_pence>=0 AND full_pence=applied_pence+excess_pence) OR(full_pence<0 AND applied_pence=0 AND excess_pence=0))
);
CREATE TABLE app.subscription_alert (
 tenant_id uuid NOT NULL, period_id uuid NOT NULL, correction_id uuid NOT NULL,
 code text NOT NULL CHECK(code IN('CORRECTION_EXCESS_UNCOLLECTED','NEGATIVE_CORRECTION_POLICY_HOLD')),
 PRIMARY KEY(tenant_id,correction_id,code), FOREIGN KEY(tenant_id,correction_id) REFERENCES app.subscription_correction_disposition(tenant_id,correction_id),
 FOREIGN KEY(tenant_id,period_id) REFERENCES app.subscription_period(tenant_id,id)
);
CREATE TABLE app.platform_statement (
 tenant_id uuid NOT NULL, id uuid NOT NULL, period_id uuid NOT NULL, namespace text NOT NULL CHECK(namespace='subscription.synthetic.v1'),
 amount_pence bigint NOT NULL CHECK(amount_pence BETWEEN 0 AND 16900), currency text NOT NULL CHECK(currency='GBP'),
 hypothetical boolean NOT NULL CHECK(hypothetical), artifact_hash text NOT NULL CHECK(artifact_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,period_id), FOREIGN KEY(tenant_id,period_id) REFERENCES app.subscription_period(tenant_id,id)
);
CREATE TABLE app.platform_statement_line (
 tenant_id uuid NOT NULL, statement_id uuid NOT NULL, period_id uuid NOT NULL, line_key text NOT NULL,
 amount_pence bigint NOT NULL CHECK(amount_pence>=0), PRIMARY KEY(tenant_id,statement_id,line_key),
 FOREIGN KEY(tenant_id,statement_id) REFERENCES app.platform_statement(tenant_id,id),
 FOREIGN KEY(tenant_id,period_id,line_key) REFERENCES app.subscription_period_line(tenant_id,period_id,line_key)
);
CREATE TABLE app.subscription_review (
 tenant_id uuid NOT NULL, id uuid NOT NULL, period_id uuid, source_id uuid NOT NULL, code text NOT NULL CHECK(code='track_review_due'),
 decision_id uuid NOT NULL, operations_card_id uuid NOT NULL, mandatory boolean NOT NULL CHECK(mandatory),
 immediate boolean NOT NULL, sustained boolean NOT NULL, PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,code),
 FOREIGN KEY(tenant_id,source_id) REFERENCES app.meter_input_event(tenant_id,id), FOREIGN KEY(tenant_id,period_id) REFERENCES app.subscription_period(tenant_id,id), FOREIGN KEY(tenant_id,decision_id) REFERENCES app.decision(tenant_id,id)
);
CREATE TABLE app.subscription_operations_card (
 tenant_id uuid NOT NULL, id uuid NOT NULL, review_id uuid NOT NULL, status text NOT NULL CHECK(status='open'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,review_id), FOREIGN KEY(tenant_id,review_id) REFERENCES app.subscription_review(tenant_id,id)
);
CREATE TABLE app.subscription_onboarding (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), id uuid NOT NULL, usual_places integer NOT NULL CHECK(usual_places>=0),
 site_staff_log_extras boolean NOT NULL, recommendation text NOT NULL CHECK(recommendation IN('small_builder','contractor')),
 PRIMARY KEY(tenant_id,id)
);
CREATE TABLE app.subscription_simulated_work (
 tenant_id uuid NOT NULL, id uuid NOT NULL, statement_id uuid NOT NULL, authorization_id uuid NOT NULL, agreement_revision integer NOT NULL,
 amount_pence bigint NOT NULL CHECK(amount_pence BETWEEN 0 AND 16900), content_hash text NOT NULL, environment text NOT NULL CHECK(environment='synthetic_demo'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,statement_id), FOREIGN KEY(tenant_id,statement_id) REFERENCES app.platform_statement(tenant_id,id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id), FOREIGN KEY(tenant_id,agreement_revision) REFERENCES app.subscription_agreement_revision(tenant_id,revision)
);
CREATE TABLE app.subscription_simulated_attempt (
 tenant_id uuid NOT NULL, id uuid NOT NULL, work_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,work_id), FOREIGN KEY(tenant_id,work_id) REFERENCES app.subscription_simulated_work(tenant_id,id)
);
CREATE TABLE app.subscription_simulated_result (
 tenant_id uuid NOT NULL, id uuid NOT NULL, work_id uuid NOT NULL, outcome text NOT NULL CHECK(outcome IN('redirect','settled','outcome_unknown','failed')),
 reconciled boolean NOT NULL, environment text NOT NULL CHECK(environment='synthetic_demo'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,work_id,outcome), FOREIGN KEY(tenant_id,work_id) REFERENCES app.subscription_simulated_attempt(tenant_id,work_id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['subscription_agreement_revision','subscription_plan_change','subscription_change_outcome','subscription_period','subscription_place','subscription_place_binding','subscription_period_line','subscription_correction_disposition','subscription_alert','platform_statement','platform_statement_line','subscription_review','subscription_operations_card','subscription_onboarding','subscription_simulated_work','subscription_simulated_attempt','subscription_simulated_result'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;

-- Preserve MON-1B closed receiving-period semantics even when a subscription
-- document, rather than a meter baseline, was the operation that closed it.
CREATE FUNCTION app.mon2_correction_open() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.subscription_period WHERE tenant_id=NEW.tenant_id AND period_start=NEW.apply_start) THEN
  RAISE EXCEPTION 'METER_CORRECTION_PERIOD_CLOSED' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER subscription_receiving_period_open BEFORE INSERT ON app.meter_correction FOR EACH ROW EXECUTE FUNCTION app.mon2_correction_open();
CREATE FUNCTION app.mon2_boundary(month_start date,anchor integer) RETURNS date LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT date_trunc('month',month_start)::date+least(anchor,extract(day FROM date_trunc('month',month_start)+interval '1 month - 1 day')::integer)-1
$$;
CREATE FUNCTION app.mon2_source(t uuid,digest text,source_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE src app.meter_input_event; day jsonb; selected_plan text; days jsonb:='[]';
BEGIN
 PERFORM app.mon1_company_actor(t,digest);
 SELECT * INTO src FROM app.meter_input_event WHERE tenant_id=t AND id=source_id;
 IF src.id IS NULL THEN RAISE EXCEPTION 'SUBSCRIPTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 FOR day IN SELECT value FROM jsonb_array_elements(src.input->'days') ORDER BY value->>'date' LOOP
  SELECT plan INTO selected_plan FROM app.subscription_agreement_revision WHERE tenant_id=t AND effective_date<=(day->>'date')::date ORDER BY effective_date DESC,revision DESC LIMIT 1;
  IF selected_plan IS NULL THEN RAISE EXCEPTION 'SUBSCRIPTION_TERMS_UNAVAILABLE' USING ERRCODE='22023'; END IF;
  days:=days||jsonb_build_array(day||jsonb_build_object('plan',selected_plan,'annualPrepaid',false,'trial',false));
 END LOOP;
 RETURN src.input||jsonb_build_object('days',days);
END $$;
-- Deferred checks cover privileged accidental writes as well as checked commands.
CREATE FUNCTION app.mon2_consistency() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=NEW.tenant_id;
BEGIN
 IF EXISTS(SELECT 1 FROM app.subscription_period p WHERE p.tenant_id=t AND p.principal_pence<>(SELECT coalesce(sum(l.amount_pence),0) FROM app.subscription_period_line l WHERE l.tenant_id=t AND l.period_id=p.id))
 OR EXISTS(SELECT 1 FROM app.platform_statement s WHERE s.tenant_id=t AND (s.amount_pence<>(SELECT coalesce(sum(l.amount_pence),0) FROM app.platform_statement_line l WHERE l.tenant_id=t AND l.statement_id=s.id)
 OR NOT EXISTS(SELECT 1 FROM app.subscription_period p WHERE p.tenant_id=t AND p.id=s.period_id AND p.principal_pence=s.amount_pence AND p.artifact_hash=s.artifact_hash)))
 OR EXISTS(SELECT 1 FROM app.platform_statement_line l JOIN app.platform_statement s ON(s.tenant_id,s.id)=(l.tenant_id,l.statement_id) JOIN app.subscription_period_line p ON(p.tenant_id,p.period_id,p.line_key)=(l.tenant_id,l.period_id,l.line_key) WHERE l.tenant_id=t AND (s.period_id<>l.period_id OR l.amount_pence<>p.amount_pence))
 OR EXISTS(SELECT 1 FROM app.subscription_simulated_work w JOIN app.platform_statement s ON(s.tenant_id,s.id)=(w.tenant_id,w.statement_id) JOIN app.action_authorization a ON(a.tenant_id,a.id)=(w.tenant_id,w.authorization_id) WHERE w.tenant_id=t AND (w.amount_pence<>s.amount_pence OR w.content_hash<>s.artifact_hash OR w.amount_pence<>a.amount_pence OR w.content_hash<>a.content_hash OR a.action_type<>'subscription.simulate' OR a.aggregate_revision<>w.agreement_revision))
 OR EXISTS(SELECT 1 FROM app.subscription_place_binding b JOIN app.meter_input_event e ON(e.tenant_id,e.id)=(b.tenant_id,b.source_id) JOIN app.subscription_place p ON(p.tenant_id,p.place_key)=(b.tenant_id,b.place_key) WHERE b.tenant_id=t AND (b.source_revision<>e.sequence OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e.input->'days') d CROSS JOIN LATERAL jsonb_array_elements(d->'jobs') j WHERE (d->>'date')::date=b.date AND (j->>'jobId')::uuid=b.representative_job_id AND (j->>'customerId')::uuid=p.customer_id AND (j->>'siteId')::uuid=p.site_id)))
 OR EXISTS(SELECT 1 FROM app.subscription_period p JOIN app.meter_input_event e ON(e.tenant_id,e.id)=(p.tenant_id,p.source_id) WHERE p.tenant_id=t AND (p.period_start<>e.period_start OR p.period_end<>e.period_end))
 OR EXISTS(SELECT 1 FROM app.subscription_correction_disposition d JOIN app.meter_correction c ON(c.tenant_id,c.id)=(d.tenant_id,d.correction_id) JOIN app.subscription_period p ON(p.tenant_id,p.id)=(d.tenant_id,d.period_id) WHERE d.tenant_id=t AND c.apply_start<>p.period_start)
 OR EXISTS(SELECT 1 FROM app.subscription_alert a JOIN app.subscription_correction_disposition d ON(d.tenant_id,d.correction_id)=(a.tenant_id,a.correction_id) WHERE a.tenant_id=t AND a.period_id<>d.period_id)
 THEN RAISE EXCEPTION 'SUBSCRIPTION_INTEGRITY_FAILURE' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['subscription_period','subscription_period_line','platform_statement','platform_statement_line','subscription_simulated_work','subscription_place_binding','subscription_correction_disposition','subscription_alert'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER subscription_integrity AFTER INSERT ON app.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.mon2_consistency()',n);
 END LOOP;
END $$;
CREATE FUNCTION app.mon2_issue(t uuid,digest text,start_day date,revision integer) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
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
 IF a.id IS NULL OR a.revision<>revision OR start_day<>app.mon2_boundary(start_day,a.anchor_day) THEN RAISE EXCEPTION 'SUBSCRIPTION_REVISION_OR_ANCHOR' USING ERRCODE='22023'; END IF;
 next_day:=app.mon2_boundary((date_trunc('month',start_day)+interval '1 month')::date,a.anchor_day);
 SELECT * INTO src FROM app.meter_input_event WHERE tenant_id=t AND period_start=start_day ORDER BY sequence DESC LIMIT 1;
 IF src.id IS NULL OR src.period_end<>next_day THEN RAISE EXCEPTION 'SUBSCRIPTION_SOURCE_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 input:=app.mon2_source(t,digest,src.id); projected:=app.mon1_project(t,input);
 denominator:=next_day-start_day; base_amount:=(projected->'principal'->>'pence')::bigint;
 amount:=base_amount; maximum:=(projected->'maximum'->>'pence')::bigint;
 FOR day IN SELECT value FROM jsonb_array_elements(input->'days') ORDER BY value->>'date' LOOP
  included:=CASE WHEN day->>'plan'='Solo' THEN 4 ELSE 7 END; cap:=CASE WHEN included=4 THEN 1 ELSE 5 END;
  line_key:='plan:'||(day->>'plan');
  numerator:=coalesce((lines->line_key->>'numerator')::bigint,0)+CASE WHEN included=4 THEN 2900 ELSE 6900 END;
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
    line_key:='extra:'||place_key; numerator:=coalesce((lines->line_key->>'numerator')::bigint,0)+2000;
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
CREATE FUNCTION app.mon2_review(t uuid,digest text,source_id uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE src app.meter_input_event; projected jsonb; latest_day jsonb; due boolean; sustained boolean; immediate boolean;
 review_id uuid; decision_id uuid; card_id uuid; period_id uuid;
BEGIN
 SELECT * INTO src FROM app.meter_input_event WHERE tenant_id=t AND id=source_id;
 IF src.id IS NULL OR src.sequence<>(SELECT max(sequence) FROM app.meter_input_event WHERE tenant_id=t AND period_start=src.period_start) THEN RAISE EXCEPTION 'SUBSCRIPTION_SOURCE_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 projected:=app.mon1_project(t,app.mon2_source(t,digest,source_id));
 SELECT value INTO latest_day FROM jsonb_array_elements(projected->'days') ORDER BY value->>'date' DESC LIMIT 1;
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(projected->'days') d WHERE d->>'plan'='Builder' AND (d->>'countedPlaces')::integer>13) INTO immediate;
 SELECT count(*)=3 AND count(*) FILTER(WHERE busy_days>=10)>=2 AND bool_and(previous_end IS NULL OR previous_end=period_start)
 INTO sustained FROM (SELECT period_start,lag(period_end) OVER(ORDER BY period_start) previous_end,
  (SELECT count(*) FROM jsonb_array_elements(result->'days') d WHERE (d->>'countedPlaces')::integer>7) busy_days
  FROM (SELECT * FROM app.subscription_period WHERE tenant_id=t AND period_end<=src.period_end ORDER BY period_start DESC LIMIT 3) latest) history;
 due:=immediate OR(latest_day->>'plan'='Builder' AND sustained);
 SELECT id INTO review_id FROM app.subscription_review WHERE tenant_id=t AND code='track_review_due';
 IF due AND review_id IS NULL THEN
  review_id:=gen_random_uuid(); decision_id:=gen_random_uuid(); card_id:=gen_random_uuid();
  SELECT id INTO period_id FROM app.subscription_period WHERE tenant_id=t AND period_start=src.period_start;
  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision_id,t,'subscription',t::text,'subscription.track_review');
  INSERT INTO app.subscription_review VALUES(t,review_id,period_id,src.id,'track_review_due',decision_id,card_id,true,immediate,sustained);
  INSERT INTO app.subscription_operations_card VALUES(t,card_id,review_id,'open');
 END IF;
 RETURN jsonb_build_object('reviewId',review_id,'trackReviewDue',due,'immediate',immediate,'sustained',sustained,'trackChanged',false);
END $$;
CREATE FUNCTION app.mon2_approve(t uuid,actor uuid,kind text,hash text,revision integer,amount bigint,subject uuid,expiry timestamptz) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE d uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); a uuid:=gen_random_uuid();
BEGIN
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(d,t,'subscription',subject::text,kind);
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(r,t,d,'approved',actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(a,t,d,r,actor,kind,NULL,hash,revision,amount,CASE WHEN amount IS NULL THEN NULL ELSE 'GBP' END,'subscription_pricing_policy_v4',expiry);
 RETURN a;
END $$;
CREATE FUNCTION app.mon2_authorized(t uuid,authorization uuid,expected_revision integer) RETURNS boolean LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app.action_authorization a JOIN app.decision_resolution r ON(r.tenant_id,r.id)=(a.tenant_id,a.resolution_id)
 JOIN app.membership m ON(m.tenant_id,m.id)=(a.tenant_id,a.actor_membership_id)
 WHERE a.tenant_id=t AND a.id=authorization AND a.aggregate_revision=expected_revision AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp()
 AND r.resolution='approved' AND r.actor_membership_id=a.actor_membership_id AND r.decision_id=a.decision_id
 AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation revoked WHERE revoked.tenant_id=t AND revoked.membership_id=m.id))
$$;
CREATE FUNCTION app.mon2_audit(t uuid,actor uuid,command uuid,kind text,hash text,result_hash text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE seq bigint; previous text; ts timestamptz; payload jsonb; ph text; eh text;
BEGIN
 SELECT sequence,event_hash INTO seq,previous FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp());
 payload:=jsonb_build_object('references',jsonb_build_object('commandId',command::text),'hashes',jsonb_build_object('request',hash,'result',result_hash)); ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'membership:'||actor::text,'subscription.'||kind,'subscription',t::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(previous,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(gen_random_uuid(),t,seq,'audit.v1','membership:'||actor::text,'subscription.'||kind,'subscription',t::text,ts,payload,ph,previous,eh);
 PERFORM app.advance_audit_head(seq,eh);
END $$;
CREATE FUNCTION app.mon2_command(t uuid,digest text,command_id uuid,v jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE actor uuid; prior app.command_receipt; kind text:=v->>'kind'; allowed text[]; hash text; result jsonb; a app.subscription_agreement_revision;
 current_revision integer; expected integer; today date:=(clock_timestamp() AT TIME ZONE 'Europe/London')::date; next_day date; auth uuid;
 new_id uuid:=gen_random_uuid(); approval_hash text; change app.subscription_plan_change; source app.meter_input_event; projected jsonb;
 capacity integer; outcome text; statement app.platform_statement; work app.subscription_simulated_work; previous_result app.subscription_simulated_result; approval_expiry timestamptz;
BEGIN
 actor:=app.mon1_company_actor(t,digest);
 -- Same lock as immutable meter loaders/rebuilds; no audit head allocated until
 -- all business/receipt writes have finished. Recheck after a contended wait.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 actor:=app.mon1_company_actor(t,digest);
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
  OR v->>'maximumPence' IS DISTINCT FROM CASE WHEN v->>'plan'='Solo' THEN '4900' ELSE '16900' END THEN RAISE EXCEPTION 'INVALID_SUBSCRIPTION_TERMS' USING ERRCODE='22023'; END IF;
  approval_hash:=app.final_lock_hash((v-ARRAY['version','kind','contentHash'])||jsonb_build_object('tenantId',t));
  IF v->>'contentHash' IS DISTINCT FROM approval_hash THEN RAISE EXCEPTION 'SUBSCRIPTION_CONTENT_MISMATCH' USING ERRCODE='22023'; END IF;
  IF (kind='accept' AND current_revision<>0) OR (kind='change' AND current_revision=0) THEN RAISE EXCEPTION 'SUBSCRIPTION_STALE_REVISION' USING ERRCODE='40001'; END IF;
  IF current_revision>0 AND a.anchor_day<>(v->>'anchorDay')::integer THEN RAISE EXCEPTION 'SUBSCRIPTION_REANCHOR_POLICY_HOLD' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM app.subscription_period WHERE tenant_id=t AND period_end>today) THEN RAISE EXCEPTION 'SUBSCRIPTION_PERIOD_ALREADY_ISSUED' USING ERRCODE='22023'; END IF;
  auth:=app.mon2_approve(t,actor,'subscription.'||kind,approval_hash,current_revision,NULL,t,approval_expiry);
  IF kind='change' AND a.plan='Builder' AND v->>'plan'='Solo' THEN
   next_day:=app.mon2_boundary(today,a.anchor_day);
   IF next_day<=today THEN next_day:=app.mon2_boundary((date_trunc('month',today)+interval '1 month')::date,a.anchor_day); END IF;
   INSERT INTO app.subscription_plan_change(tenant_id,id,expected_revision,plan,effective_date,authorization_id,content_hash,actor_membership_id)
   VALUES(t,new_id,current_revision,'Solo',next_day,auth,approval_hash,actor);
   result:=jsonb_build_object('changeId',new_id,'revision',current_revision,'status','pending','effectiveDate',next_day::text);
  ELSE
   INSERT INTO app.subscription_agreement_revision(tenant_id,id,revision,catalogue_version,terms_version,plan,cadence,anchor_day,maximum_pence,content_hash,effective_date,actor_membership_id,authorization_id)
   VALUES(t,new_id,current_revision+1,v->>'catalogueVersion',v->>'termsVersion',v->>'plan','monthly',(v->>'anchorDay')::integer,(v->>'maximumPence')::integer,approval_hash,today,actor,auth);
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
CREATE FUNCTION app.mon2_read(t uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb:=jsonb_build_object('version','subscription-persisted-read.v1','hypothetical',true,'environment','synthetic_demo'); pair text[]; rows jsonb;
BEGIN
 PERFORM app.mon1_company_actor(t,digest);
 FOREACH pair SLICE 1 IN ARRAY ARRAY[
 ['agreements','subscription_agreement_revision'],['changes','subscription_plan_change'],['changeOutcomes','subscription_change_outcome'],
 ['periods','subscription_period'],['periodLines','subscription_period_line'],['places','subscription_place'],['placeBindings','subscription_place_binding'],
 ['statements','platform_statement'],['statementLines','platform_statement_line'],['reviews','subscription_review'],['operationsCards','subscription_operations_card'],
 ['work','subscription_simulated_work'],['attempts','subscription_simulated_attempt'],['results','subscription_simulated_result'],
 ['corrections','subscription_correction_disposition'],['alerts','subscription_alert'],['onboarding','subscription_onboarding']
 ] LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),''[]''::jsonb) FROM app.%I r WHERE tenant_id=$1',pair[2]) INTO rows USING t;
  result:=result||jsonb_build_object(pair[1],rows);
 END LOOP;
 RETURN result;
END $$;
DO $$ DECLARE fn text; BEGIN
 FOREACH fn IN ARRAY ARRAY['mon2_correction_open()','mon2_review(uuid,text,uuid)','mon2_boundary(date,integer)','mon2_source(uuid,text,uuid)','mon2_consistency()','mon2_issue(uuid,text,date,integer)','mon2_approve(uuid,uuid,text,text,integer,bigint,uuid,timestamptz)','mon2_authorized(uuid,uuid,integer)','mon2_audit(uuid,uuid,uuid,text,text,text)','mon2_command(uuid,text,uuid,jsonb)','mon2_read(uuid,text)'] LOOP
  EXECUTE 'ALTER FUNCTION app.'||fn||' OWNER TO jobguard_migration';
  EXECUTE 'REVOKE ALL ON FUNCTION app.'||fn||' FROM PUBLIC';
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION app.mon2_command(uuid,text,uuid,jsonb),app.mon2_read(uuid,text),app.mon2_source(uuid,text,uuid) TO jobguard_runtime;
COMMIT;
