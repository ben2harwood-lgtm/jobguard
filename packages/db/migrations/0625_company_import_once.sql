BEGIN;
-- Company source identity survives sign-in; the existing tenant lock serializes competing sessions.
-- Practice sessions intentionally share their tenant and retain session-local adoption.
CREATE UNIQUE INDEX company_import_one_source ON app.job_import_v3(tenant_id,source_job_id)
 WHERE tenant_id<>'11111111-1111-4111-8111-111111111111'::uuid;

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
 -- An owned imported job remains readable but is never another import source.
 IF EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=source_job AND provenance='imported') THEN
  RAISE EXCEPTION 'IMPORT_ALREADY_ADOPTED'; END IF;
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
 IF EXISTS(SELECT 1 FROM app.job_import_v3 WHERE tenant_id=t AND source_job_id=source_job
  AND (t<>'11111111-1111-4111-8111-111111111111'::uuid OR session_digest=d)) THEN
  RAISE EXCEPTION 'IMPORT_ALREADY_ADOPTED'; END IF;
 -- Link only current overlapping jobs visible to this session, by stable customer/site identities.
 SELECT coalesce(jsonb_agg(j.id ORDER BY j.id),'[]'::jsonb) INTO links FROM app.job j
 JOIN app.job_party_current c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
 JOIN app.job_party_binding p ON(p.tenant_id,p.job_id,p.id)=(c.tenant_id,c.job_id,c.binding_id)
 WHERE j.tenant_id=t AND (j.practice_session_digest=d OR (t<>'11111111-1111-4111-8111-111111111111'::uuid AND j.practice_session_digest IS NULL)) AND j.status='live' AND p.customer_id=b.customer_id AND p.site_id=b.site_id;
 -- LP-2's guard consumes this exact, transaction-bound permit. Authorization was checked above.
 INSERT INTO app.lp_job_insert_permit(tenant_id,job_id,backend_pid,transaction_id,operation,insert_shape,actor_membership_id,command_id,authorization_id)
 VALUES(t,target,pg_backend_pid(),pg_current_xact_id(),'adoption',
  app.lp_job_insert_shape(jsonb_populate_record(NULL::app.job,jsonb_build_object('tenant_id',t,'id',target,
   'title','Fictional imported job','status','draft','revision',1,'provenance','imported',
   'accepted_net_value_pence',300000,'fee_policy_version','reference_fee_policy_v3'))),actor,cmd,auth);
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
COMMIT;
