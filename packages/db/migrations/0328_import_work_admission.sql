BEGIN;
-- Reuse the established company session/membership verifier. This entrypoint
-- releases only the current owner identity, never business or shadow content.
CREATE FUNCTION app.ch5_import_actor(t uuid,digest text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 actor:=app.mon1_company_actor(t,digest);
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner' AND revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;
ALTER FUNCTION app.ch5_import_actor(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ch5_import_actor(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ch5_import_actor(uuid,text) TO jobguard_runtime;
ALTER TABLE app.job DROP CONSTRAINT job_baseline_shape;
ALTER TABLE app.job ADD CONSTRAINT job_baseline_shape CHECK (
 (baseline_quote_version_id IS NULL AND accepted_net_value_pence IS NULL AND fee_policy_version IS NULL AND recovery_cap_pence IS NULL)
 OR (provenance='system_generated_quote' AND baseline_quote_version_id IS NOT NULL AND accepted_net_value_pence IS NOT NULL AND fee_policy_version IS NOT NULL AND
 ((fee_policy_version='reference_fee_policy_v3' AND recovery_cap_pence IS NULL) OR (fee_policy_version<>'reference_fee_policy_v3' AND recovery_cap_pence IS NOT NULL)))
 OR (provenance='imported' AND baseline_quote_version_id IS NULL AND accepted_net_value_pence IS NOT NULL AND fee_policy_version IS NOT NULL AND
 (recovery_cap_pence IS NOT NULL OR (fee_policy_version='reference_fee_policy_v3' AND recovery_cap_pence IS NULL AND status IN('draft','live','invoiced'))))
);
ALTER TABLE app.job_import_v3 DROP CONSTRAINT job_import_v3_meter_reason_check;
ALTER TABLE app.job_import_v3 DROP CONSTRAINT job_import_v3_counted_places_check;
ALTER TABLE app.job_import_v3 ALTER COLUMN counted_places DROP NOT NULL;
ALTER TABLE app.job_import_v3 ADD CONSTRAINT import_meter_shape CHECK (
 (snapshot->>'lifecyclePoint' IS NOT DISTINCT FROM 'invoiced' AND meter_reason='imported_at_invoiced_stage' AND counted_places IS NOT DISTINCT FROM 0)
 OR (snapshot->>'lifecyclePoint' IS NOT DISTINCT FROM 'live' AND meter_reason='ordinary_start_rule' AND counted_places IS NULL)
);
-- CH-5 part 2: classify verified imported baselines in MON-1 admission.
-- No historical terms, allocations, bills or locked final accounts are rewritten.
CREATE OR REPLACE FUNCTION app.mon1_refresh_work_ledger(t uuid) RETURNS app.meter_work_ledger
LANGUAGE plpgsql SET search_path=pg_catalog SET timezone='UTC' AS $$
DECLARE stored app.meter_work_ledger; agreement app.subscription_agreement_revision;
 at_time timestamptz; today date; facts jsonb; projected jsonb; fingerprint text;
BEGIN
 IF current_user<>'jobguard_migration' OR t IS NULL OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- The shared practice tenant never contributes company-wide capacity facts.
 IF t='11111111-1111-4111-8111-111111111111'::uuid THEN RETURN stored; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 at_time:=clock_timestamp(); today:=(at_time AT TIME ZONE 'Europe/London')::date;
 SELECT * INTO agreement FROM app.subscription_agreement_revision ar WHERE ar.tenant_id=t AND ar.effective_date<=today
 ORDER BY ar.effective_date DESC,ar.revision DESC LIMIT 1;
 IF agreement.id IS NULL THEN RETURN stored; END IF;
 -- Unknown import capacity is an unavailable snapshot, not a failure of the
 -- source write. Only ch4_admit_place may refuse this result; subscriptions,
 -- locks, finish/close and automatic source events must still commit.
 IF EXISTS(SELECT 1 FROM app.job j WHERE j.tenant_id=t AND j.provenance='imported' AND j.status='live' AND j.practice_session_digest IS NULL
  AND EXISTS(SELECT 1 FROM app.job_commercial_track ct WHERE ct.tenant_id=t AND ct.job_id=j.id AND ct.job_track='small_builder' AND ct.environment='synthetic_demo')
  AND NOT EXISTS(SELECT 1 FROM app.job_activation_terms terms WHERE terms.tenant_id=t AND terms.job_id=j.id)
  AND NOT EXISTS(SELECT 1 FROM app.job_import_v3 v WHERE v.tenant_id=t AND v.job_id=j.id AND v.snapshot->>'lifecyclePoint'='live')
  AND NOT EXISTS(SELECT 1 FROM app.imported_job_baseline ib JOIN app.job_party_binding b
   ON(b.tenant_id,b.job_id,b.id)=(ib.tenant_id,ib.job_id,ib.party_binding_id) WHERE ib.tenant_id=t AND ib.job_id=j.id))
 THEN RETURN stored; END IF;
 WITH base AS (
  SELECT a.job_id,a.activated_at,b.customer_id,b.site_id,terms.small_job initial_small,
   a.id source_id,terms.id terms_id,b.id binding_id
  FROM app.job_activation a JOIN app.job_activation_terms terms ON(terms.tenant_id,terms.job_id,terms.activation_id)=(a.tenant_id,a.job_id,a.id)
  JOIN app.job x ON(x.tenant_id,x.id)=(a.tenant_id,a.job_id)
  JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(a.tenant_id,a.job_id,a.party_binding_id)
  WHERE a.tenant_id=t AND a.mode='synthetic_demo' AND terms.commercial_track='small_builder' AND x.practice_session_digest IS NULL
  AND x.provenance<>'imported'
  UNION ALL
  -- Adoption's server receive time is the ordinary start anchor. Attested
  -- historical time cannot backdate a start or create a free import period.
  SELECT ib.job_id,ib.recorded_at,b.customer_id,b.site_id,
   ib.accepted_net_value_pence<200000,ib.id,ib.id,b.id
  FROM app.imported_job_baseline ib
  JOIN app.job x ON(x.tenant_id,x.id)=(ib.tenant_id,ib.job_id)
  JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(ib.tenant_id,ib.job_id,ib.party_binding_id)
  JOIN app.job_commercial_track ct ON(ct.tenant_id,ct.job_id)=(ib.tenant_id,ib.job_id)
  WHERE ib.tenant_id=t AND x.provenance='imported' AND x.status='live' AND x.practice_session_digest IS NULL
   AND ct.job_track='small_builder' AND ct.environment='synthetic_demo'
  UNION ALL
  SELECT v.job_id,v.adopted_at,b.customer_id,b.site_id,
   (v.snapshot#>>'{baseline,acceptedNetPence}')::bigint<200000,v.id,(v.result->>'termsId')::uuid,b.id
  FROM app.job_import_v3 v
  JOIN app.job x ON(x.tenant_id,x.id)=(v.tenant_id,v.job_id)
  JOIN app.job_party_binding b ON(b.tenant_id,b.job_id)=(v.tenant_id,v.job_id) AND b.revision=1
  JOIN app.job_commercial_track ct ON(ct.tenant_id,ct.job_id)=(v.tenant_id,v.job_id)
  WHERE v.tenant_id=t AND v.snapshot->>'lifecyclePoint'='live' AND x.status='live' AND x.practice_session_digest IS NULL
   AND ct.job_track='small_builder' AND ct.environment='synthetic_demo'
 ), source AS (
  SELECT base.*,
   coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'at',e.fact_at,'recordedAt',e.recorded_at,'predecessor',e.predecessor_id) ORDER BY e.fact_at,e.id)
    FROM app.job_work_state_event e WHERE e.tenant_id=t AND e.job_id=base.job_id AND e.fact_at<=at_time AND e.recorded_at<=at_time),'[]'::jsonb) events,
   (SELECT jsonb_build_object('id',l.id,'at',l.locked_at) FROM app.final_account_lock l WHERE l.tenant_id=t AND l.job_id=base.job_id) lock_fact,
   (SELECT jsonb_build_object('id',trip.id,'at',trip.effective_at) FROM app.job_small_trip_event trip WHERE trip.tenant_id=t AND trip.job_id=base.job_id) trip
  FROM base
 ) SELECT coalesce(jsonb_agg(to_jsonb(source) ORDER BY job_id),'[]'::jsonb),
  coalesce(jsonb_agg(jsonb_build_object('jobId',job_id,'customerId',customer_id,'siteId',site_id,
   'small',initial_small AND trip IS NULL,'committed',app.mon1_work_committed(t,job_id,activated_at,at_time)) ORDER BY job_id),'[]'::jsonb)
 INTO facts,projected FROM source;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('recipe','committed-work-imports.v2','date',today,'agreement',agreement.id,'plan',agreement.plan,'facts',facts)::text,'UTF8')),'hex');
 SELECT * INTO stored FROM app.meter_work_ledger WHERE tenant_id=t AND source_hash=fingerprint;
 IF stored.source_hash IS NOT NULL THEN
  IF (stored.jobs,stored.plan,stored.agreement_id,stored.london_date) IS DISTINCT FROM (projected,agreement.plan,agreement.id,today)
  THEN RAISE EXCEPTION 'METER_PROJECTION_MISMATCH'; END IF;
  RETURN stored;
 END IF;
 INSERT INTO app.meter_work_ledger(tenant_id,source_hash,london_date,agreement_id,plan,jobs)
 VALUES(t,fingerprint,today,agreement.id,agreement.plan,projected) RETURNING * INTO stored;
 RETURN stored;
END $$;
ALTER FUNCTION app.mon1_refresh_work_ledger(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon1_refresh_work_ledger(uuid) FROM PUBLIC,jobguard_runtime,jobguard_meter,jobguard_meter_owner,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_infrastructure;

CREATE OR REPLACE FUNCTION app.ch4_admit_place(t uuid,j uuid,action text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE plan text; included integer; before_count integer; after_count integer; ledger app.meter_work_ledger;
BEGIN
 IF current_user<>'jobguard_migration' OR t IS NULL OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF action NOT IN('resume','reopen','restart','switch_live') OR action IS NULL THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 -- Never expose a shared practice company's other sessions through capacity.
 IF NOT EXISTS(SELECT 1 FROM app.job_activation a JOIN app.job_activation_terms terms
  ON(terms.tenant_id,terms.job_id,terms.activation_id)=(a.tenant_id,a.job_id,a.id)
  JOIN app.job x ON(x.tenant_id,x.id)=(a.tenant_id,a.job_id)
  WHERE a.tenant_id=t AND a.job_id=j AND a.mode='synthetic_demo'
   AND terms.commercial_track='small_builder' AND x.practice_session_digest IS NULL)
 AND NOT EXISTS(SELECT 1 FROM app.imported_job_baseline ib
  JOIN app.job x ON(x.tenant_id,x.id)=(ib.tenant_id,ib.job_id)
  JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(ib.tenant_id,ib.job_id,ib.party_binding_id)
  JOIN app.job_commercial_track ct ON(ct.tenant_id,ct.job_id)=(ib.tenant_id,ib.job_id)
  WHERE ib.tenant_id=t AND ib.job_id=j AND x.provenance='imported' AND x.status='live'
   AND x.practice_session_digest IS NULL AND ct.job_track='small_builder' AND ct.environment='synthetic_demo')
 AND NOT EXISTS(SELECT 1 FROM app.job_import_v3 v JOIN app.job x ON(x.tenant_id,x.id)=(v.tenant_id,v.job_id)
  WHERE v.tenant_id=t AND v.job_id=j AND v.snapshot->>'lifecyclePoint'='live' AND x.status='live' AND x.practice_session_digest IS NULL)
 THEN RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE'; END IF;
 ledger:=app.mon1_refresh_work_ledger(t);
 IF ledger.source_hash IS NULL THEN RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE'; END IF;
 plan:=ledger.plan;
 included:=CASE plan WHEN 'Solo' THEN 4 ELSE 7 END;
 WITH jobs AS (
  SELECT (value->>'jobId')::uuid job_id,(value->>'customerId')::uuid customer_id,
   (value->>'siteId')::uuid site_id,(value->>'small')::boolean small,(value->>'committed')::boolean committed
  FROM jsonb_array_elements(ledger.jobs)
 ), places AS (
  SELECT prospective,customer_id,site_id,bool_and(small) small FROM jobs
  CROSS JOIN (VALUES(false),(true)) v(prospective)
  WHERE (committed AND NOT(action='switch_live' AND job_id=j)) OR (prospective AND job_id=j)
  GROUP BY prospective,customer_id,site_id
 ), totals AS (
  SELECT prospective,count(*)-least(count(*) FILTER(WHERE small),included) counted FROM places GROUP BY prospective
 ) SELECT coalesce(max(counted) FILTER(WHERE NOT prospective),0),coalesce(max(counted) FILTER(WHERE prospective),0)
 INTO before_count,after_count FROM totals;
 IF plan='Solo' AND after_count>6 AND after_count>before_count THEN
  RAISE EXCEPTION 'METER_UPGRADE_REQUIRED' USING ERRCODE='P0001',
   DETAIL='Your Solo plan and grace place are full. Move to Builder before starting this site work.';
 END IF;
 -- MON-1 Decisions begin
 -- Capacity is serialized by the freshly rebuilt ledger's tenant lock. These
 -- are unresolved proposals only: no authorization, plan change or charge.
 IF after_count>before_count AND after_count>(CASE plan WHEN 'Solo' THEN 5 ELSE 12 END) THEN
  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
  SELECT (substr(h,1,12)||'4'||substr(h,14,3)||'8'||substr(h,18,15))::uuid,
   t,'subscription',t::text,'subscription.upgrade'
  FROM (SELECT encode(sha256(convert_to('mon1-grace-upgrade.v1:'||t::text||':'||ledger.agreement_id::text,'UTF8')),'hex') h) identity_hash
  ON CONFLICT (tenant_id,id) DO NOTHING;
  IF plan='Builder' AND after_count>13 THEN
   INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
   SELECT (substr(h,1,12)||'4'||substr(h,14,3)||'8'||substr(h,18,15))::uuid,
    t,'subscription',t::text,'subscription.track_review'
   FROM (SELECT encode(sha256(convert_to('mon1-track-review.v1:'||t::text,'UTF8')),'hex') h) identity_hash
   WHERE NOT EXISTS(SELECT 1 FROM app.decision WHERE tenant_id=t AND subject_type='subscription'
    AND subject_ref=t::text AND action_type='subscription.track_review')
   ON CONFLICT (tenant_id,id) DO NOTHING;
  END IF;
 END IF;
 -- MON-1 Decisions end
 -- Builder additions remain unblocked. This routine creates no obligation or charge.
END $$;


-- Continuing activity is automatic; only a restart must compete for a place.
DO $$ DECLARE original text; changed text; BEGIN
 original:=pg_get_functiondef('app.mon1_admit_work_event()'::regprocedure);
 changed:=replace(original,
  'AND EXISTS(SELECT 1 FROM app.job_activation a WHERE a.tenant_id=NEW.tenant_id AND a.job_id=NEW.job_id'||chr(10)||'   AND NOT app.mon1_work_committed(NEW.tenant_id,NEW.job_id,a.activated_at,clock_timestamp()))',
  'AND (EXISTS(SELECT 1 FROM app.job_activation a WHERE a.tenant_id=NEW.tenant_id AND a.job_id=NEW.job_id'||chr(10)||'   AND NOT app.mon1_work_committed(NEW.tenant_id,NEW.job_id,a.activated_at,clock_timestamp()))'||chr(10)||'   OR EXISTS(SELECT 1 FROM app.imported_job_baseline ib WHERE ib.tenant_id=NEW.tenant_id AND ib.job_id=NEW.job_id'||chr(10)||'   AND NOT app.mon1_work_committed(NEW.tenant_id,NEW.job_id,ib.recorded_at,clock_timestamp()))'||chr(10)||'   OR EXISTS(SELECT 1 FROM app.job_import_v3 v WHERE v.tenant_id=NEW.tenant_id AND v.job_id=NEW.job_id AND v.snapshot->>''lifecyclePoint''=''live'''||chr(10)||'   AND NOT app.mon1_work_committed(NEW.tenant_id,NEW.job_id,v.adopted_at,clock_timestamp())))');
 IF changed=original THEN RAISE EXCEPTION 'unexpected work event admission definition'; END IF;
 EXECUTE changed;
END $$;
-- Historical signature retained for existing invoiced callers; both stages
-- share its exact synthetic fixture/Decision checks.
CREATE OR REPLACE FUNCTION app.adopt_invoiced_job_v3(t uuid, source_job uuid, d text, cmd uuid, auth uuid, approved jsonb, request_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE admitted app.meter_work_ledger; places integer; outcome text; stage text:=approved->>'lifecyclePoint'; actor uuid; b app.job_party_binding; expected jsonb; h text; target uuid;
 iid uuid:=gen_random_uuid(); terms uuid:=gen_random_uuid(); baseline uuid:=gen_random_uuid();
 binding uuid:=gen_random_uuid(); scope uuid:=gen_random_uuid(); exclusion uuid:=gen_random_uuid(); links jsonb; receipt jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 IF t IS NULL OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t='11111111-1111-4111-8111-111111111111'::uuid THEN SELECT membership_id INTO actor FROM app.authenticate_practice_session(d,t);
 ELSE actor:=app.ch5_import_actor(t,d); END IF;
 IF stage IS NULL OR stage NOT IN('live','invoiced') THEN RAISE EXCEPTION 'INVALID_IMPORT'; END IF;
 IF stage='live' AND t='11111111-1111-4111-8111-111111111111'::uuid THEN RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE'; END IF;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT (t<>'11111111-1111-4111-8111-111111111111'::uuid AND EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=source_job AND practice_session_digest IS NULL)) AND NOT EXISTS(
 WITH RECURSIVE owned AS (
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=d
  UNION SELECT j.id FROM owned s JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job'
   AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=s.id::text
   JOIN app.job j ON j.tenant_id=t AND j.id::text=e.subject_ref AND j.provenance='imported' AND j.practice_session_digest IS NULL
 ) SELECT 1 FROM owned WHERE id=source_job) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=source_job AND job_track<>'small_builder') THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=source_job FOR UPDATE;
 SELECT x.* INTO b FROM app.job_party_current c JOIN app.job_party_binding x ON(x.tenant_id,x.job_id,x.id)=(c.tenant_id,c.job_id,c.binding_id)
 WHERE c.tenant_id=t AND c.job_id=source_job;
 IF b.id IS NULL THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
 expected:=jsonb_build_object('version','adopt-job.v3','fixtureId','fictional-extension-v3','sourceJobId',source_job,
  'parties',jsonb_build_object('bindingId',b.id,'customerRevisionId',b.customer_revision_id,'siteRevisionId',b.site_revision_id,'payingPartyRevisionId',b.paying_party_revision_id),
  'lifecyclePoint',stage,'baseline',jsonb_build_object('sourceBaselineId','c5500000-0000-4000-8000-000000000001',
   'sourceHash',encode(public.digest(convert_to('fictional-extension-v3:baseline:1','UTF8'),'sha256'),'hex'),
   'description','Fictional agreed extension baseline','acceptedNetPence',300000,'lines',jsonb_build_array(jsonb_build_object(
    'sourceLineId','c5500000-0000-4000-8000-000000000002','description','Fictional agreed extension works','netPence',300000))),
  'terms',jsonb_build_object('version','synthetic_demo_import.v3','policyVersion','reference_fee_policy_v3','commercialTrack','small_builder'),
  'attestation',jsonb_build_object('version','import-attestation.v3','wording','I attest that this fictional baseline describes work already agreed. Its lineage is builder-attested, not customer acceptance.','attest',true),
  'historyManifest','[]'::jsonb);
 IF approved IS DISTINCT FROM expected OR request_hash IS NULL OR request_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'EXACT_IMPORT_AUTHORIZATION_MISMATCH'; END IF;
 -- All snapshot keys and fixture text are ASCII. Reuse the existing canonical JSON encoder.
 h:=encode(public.digest(convert_to(app.final_lock_canonical(expected),'UTF8'),'sha256'),'hex');
 SELECT subject_ref::uuid INTO target FROM app.command_receipt r JOIN app.decision x ON x.tenant_id=r.tenant_id
  JOIN app.action_authorization a ON(a.tenant_id,a.decision_id)=(x.tenant_id,x.id)
  JOIN app.decision_resolution resolution ON(resolution.tenant_id,resolution.id)=(a.tenant_id,a.resolution_id)
 WHERE r.tenant_id=t AND r.command_id=cmd AND r.status='processing' AND r.command_type='job.adopt_in_flight_v3'
  AND r.semantic_key='import-v3:'||cmd::text AND r.actor_membership_id=actor
  AND a.id=auth AND a.actor_membership_id=actor AND resolution.actor_membership_id=actor AND resolution.resolution='approved'
  AND x.subject_type='job' AND x.action_type='job.adopt_in_flight_v3' AND a.action_type='job.adopt_in_flight_v3'
  AND a.content_hash=h AND a.recipient IS NULL AND a.amount_pence=300000 AND a.currency='GBP' AND a.aggregate_revision=0
  AND a.policy_version='synthetic_demo_import.v3' AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp();
 IF target IS NULL THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM app.job_import_v3 WHERE tenant_id=t AND session_digest=d AND source_job_id=source_job AND fixture_id='fictional-extension-v3') THEN
  RAISE EXCEPTION 'IMPORT_ALREADY_ADOPTED'; END IF;
 -- Link only current overlapping jobs visible to this session, by stable customer/site identities.
 SELECT coalesce(jsonb_agg(j.id ORDER BY j.id),'[]'::jsonb) INTO links FROM app.job j
 JOIN app.job_party_current c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
 JOIN app.job_party_binding p ON(p.tenant_id,p.job_id,p.id)=(c.tenant_id,c.job_id,c.binding_id)
 WHERE j.tenant_id=t AND (j.practice_session_digest=d OR (t<>'11111111-1111-4111-8111-111111111111'::uuid AND j.practice_session_digest IS NULL)) AND j.status='live' AND p.customer_id=b.customer_id AND p.site_id=b.site_id;
 PERFORM set_config('app.import_command','enabled',true);
 INSERT INTO app.job(tenant_id,id,title,status,revision,provenance,accepted_net_value_pence,fee_policy_version)
 VALUES(t,target,'Fictional imported job','draft',1,'imported',300000,'reference_fee_policy_v3');
 INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance,source_id)
 VALUES(t,target,'small_builder','synthetic_demo','adoption_import',iid);
 INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance)
 VALUES(t,binding,target,1,b.customer_id,b.customer_revision_id,b.paying_party_id,b.paying_party_revision_id,b.site_id,b.site_revision_id,'entered');
 INSERT INTO app.job_party_current(tenant_id,job_id,binding_id) VALUES(t,target,binding);
 UPDATE app.job SET status=stage WHERE tenant_id=t AND id=target;
 INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES(t,scope,target,'confirmed');
 receipt:=jsonb_build_object('version','job-import-result.v3','importId',iid,'jobId',target,'termsId',terms,'baselineId',baseline,
  'provenance','imported','lineageStrength','builder_attested_weaker','lifecyclePoint',stage,'linkedJobIds',links,
  'meterResultRef',exclusion,'actionHash',h,'environment','synthetic_demo','realExternalActions',0,
  'baseline',jsonb_build_object('acceptedNetPence',300000,'lines',jsonb_build_array(jsonb_build_object(
   'sourceLineId','c5500000-0000-4000-8000-000000000002','scopeItemId',scope,'netPence',300000,'origin','builder_baseline'))));
 INSERT INTO app.job_import_v3(tenant_id,id,job_id,source_job_id,session_digest,command_id,public_request_hash,fixture_id,snapshot,result,meter_exclusion_id,meter_reason,counted_places)
 VALUES(t,iid,target,source_job,d,cmd,request_hash,'fictional-extension-v3',expected,receipt,exclusion,CASE WHEN stage='invoiced' THEN 'imported_at_invoiced_stage' ELSE 'ordinary_start_rule' END,CASE WHEN stage='invoiced' THEN 0 ELSE NULL END);
 IF stage='live' THEN
  PERFORM app.ch4_admit_place(t,target,'switch_live');
  admitted:=app.mon1_refresh_work_ledger(t);
  -- Advisory outcome from the admitted, immutable server ledger. This does
  -- not alter a plan, monthly maximum, obligation or allocation.
  WITH grouped AS (
   SELECT value->>'customerId' customer,value->>'siteId' site,bool_and((value->>'small')::boolean) small
   FROM jsonb_array_elements(admitted.jobs) WHERE (value->>'committed')::boolean GROUP BY 1,2
  ) SELECT count(*)-least(count(*) FILTER(WHERE small),(CASE WHEN admitted.plan='Solo' THEN 4 ELSE 7 END)) INTO places FROM grouped;
  outcome:=CASE WHEN admitted.plan='Builder' AND places>13 THEN 'track_review_due'
   WHEN (admitted.plan='Solo' AND places=6) OR (admitted.plan='Builder' AND places=13) THEN 'grace_place'
   ELSE 'admitted' END;
  -- The command stores the unchanged public result; its existing audit batch
  -- records the admission hash/outcome, so replays never reassess old imports.
  RETURN jsonb_build_object('result',receipt,'admission',jsonb_build_object('sourceHash',admitted.source_hash,'outcome',outcome));
 END IF;
 RETURN receipt;
END $$;
ALTER FUNCTION app.adopt_invoiced_job_v3(uuid,uuid,text,uuid,uuid,jsonb,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.adopt_invoiced_job_v3(uuid,uuid,text,uuid,uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.adopt_invoiced_job_v3(uuid,uuid,text,uuid,uuid,jsonb,text) TO jobguard_runtime;
-- Cap-free imported rows cannot bypass the checked writer by setting a GUC.
CREATE FUNCTION app.ch5_require_import_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.provenance='imported' AND NEW.fee_policy_version='reference_fee_policy_v3' AND NEW.recovery_cap_pence IS NULL
 AND NOT EXISTS(SELECT 1 FROM app.job_import_v3 v
  JOIN app.command_receipt r ON(r.tenant_id,r.command_id)=(v.tenant_id,v.command_id)
  JOIN app.audit_event e ON e.tenant_id=v.tenant_id AND e.subject_type='job' AND e.subject_ref=v.job_id::text
   AND e.event_type='job.imported_baseline_attested' AND e.payload#>>'{references,baselineId}'=v.result->>'baselineId'
   AND e.payload#>>'{hashes,baselineHash}'=v.result->>'actionHash'
  WHERE v.tenant_id=NEW.tenant_id AND v.job_id=NEW.id AND r.command_type='job.adopt_in_flight_v3'
   AND r.status='succeeded' AND r.result=v.result)
 THEN RAISE EXCEPTION 'IMPORT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.ch5_require_import_record() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ch5_require_import_record() FROM PUBLIC,jobguard_runtime;
CREATE CONSTRAINT TRIGGER ch5_import_record_required AFTER INSERT OR UPDATE ON app.job
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.ch5_require_import_record();
COMMIT;
