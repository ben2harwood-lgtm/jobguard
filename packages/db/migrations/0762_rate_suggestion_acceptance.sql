BEGIN;
CREATE TABLE app.rate_suggestion_acceptance (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, scope_item_id uuid NOT NULL,
 previous_revision_id uuid NOT NULL, accepted_pence bigint NOT NULL CHECK(accepted_pence BETWEEN 0 AND 1000000000000),
 unit text NOT NULL, tax_basis text NOT NULL, category text NOT NULL, region text NOT NULL,
 policy_version text NOT NULL CHECK(policy_version='rate-baseline.v1'), source_observation_ids uuid[] NOT NULL CHECK(cardinality(source_observation_ids)>=3),
 baseline_hash text NOT NULL CHECK(baseline_hash ~ '^[a-f0-9]{64}$'), actor_id uuid NOT NULL,
 command_id uuid NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 record_hash text NOT NULL CHECK(record_hash ~ '^[a-f0-9]{64}$'),
 provenance text NOT NULL DEFAULT 'suggestion_accepted' CHECK(provenance='suggestion_accepted'),
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 CONSTRAINT rate_suggestion_acceptance_pk PRIMARY KEY(tenant_id,id),
 CONSTRAINT rate_suggestion_acceptance_command_uq UNIQUE(tenant_id,command_id),
 CONSTRAINT rate_suggestion_acceptance_revision_uq UNIQUE(tenant_id,job_id,scope_item_id,previous_revision_id),
 FOREIGN KEY(tenant_id,job_id,scope_item_id,previous_revision_id) REFERENCES app.scope_revision(tenant_id,job_id,scope_item_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES app.membership(tenant_id,id)
);
ALTER TABLE app.rate_suggestion_acceptance OWNER TO jobguard_migration;
ALTER TABLE app.rate_suggestion_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.rate_suggestion_acceptance FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.rate_suggestion_acceptance TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.rate_suggestion_acceptance FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER rate_suggestion_acceptance_immutable BEFORE UPDATE OR DELETE ON app.rate_suggestion_acceptance
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();

CREATE FUNCTION app.accept_rate_suggestion(t uuid,digest text,input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; q jsonb:=input->'query'; observations jsonb; actual_hash text; request_hash text;
 prior app.rate_suggestion_acceptance; record_id uuid:=gen_random_uuid(); record_hash text;
 j uuid; item uuid; revision_id uuid; cmd uuid; accepted bigint; sources uuid[]; rates bigint[];
 centre numeric; suggested numeric; latest uuid; field text; previous_tenant text:=current_setting('app.tenant_id',true); previous_sso text:=current_setting('app.sso_session_id',true);
BEGIN
 IF t IS NULL OR t IS DISTINCT FROM nullif(previous_tenant,'')::uuid
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Existing persisted-session verifier checks current SSO scope and active owner membership.
 actor:=app.ch5_import_actor(t,digest);
 PERFORM set_config('app.tenant_id',coalesce(previous_tenant,''),true);
 PERFORM set_config('app.sso_session_id',coalesce(previous_sso,''),true);
 IF actor IS NULL THEN RAISE EXCEPTION 'HUMAN_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(input) IS DISTINCT FROM 'object'
 OR input - ARRAY['version','commandId','query','jobId','scopeItemId','currentRevisionId','acceptedRatePence','baselineHash'] <> '{}'
 OR NOT (input ?& ARRAY['version','commandId','query','jobId','scopeItemId','currentRevisionId','acceptedRatePence','baselineHash'])
 OR input->>'version' IS DISTINCT FROM 'rate-suggestion-accept.v1'
 OR jsonb_typeof(q) IS DISTINCT FROM 'object'
 OR q - ARRAY['version','tenantId','asOf','unit','taxBasis','category','region'] <> '{}'
 OR NOT (q ?& ARRAY['version','tenantId','asOf','unit','taxBasis','category','region'])
 OR q->>'version' IS DISTINCT FROM 'rate-query.v1' OR q->>'tenantId' IS DISTINCT FROM t::text
 OR (q->>'unit') NOT IN ('each','m','m2','kg','hour')
 OR (q->>'taxBasis') NOT IN ('standard_rate_20','zero_rate','exempt','outside_scope')
 OR length(q->>'category') NOT BETWEEN 1 AND 100 OR length(q->>'region') NOT BETWEEN 1 AND 100
 OR input->>'baselineHash' !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'INVALID_ACCEPTANCE' USING ERRCODE='22023'; END IF;
 FOREACH field IN ARRAY ARRAY['version','commandId','jobId','scopeItemId','currentRevisionId','baselineHash'] LOOP
  IF jsonb_typeof(input->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'INVALID_ACCEPTANCE' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOREACH field IN ARRAY ARRAY['version','tenantId','asOf','unit','taxBasis','category','region'] LOOP
  IF jsonb_typeof(q->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'INVALID_ACCEPTANCE' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF jsonb_typeof(input->'acceptedRatePence') IS DISTINCT FROM 'number' OR input->>'acceptedRatePence' !~ '^(0|[1-9][0-9]*)$'
 THEN RAISE EXCEPTION 'INVALID_ACCEPTANCE' USING ERRCODE='22023'; END IF;
 j:=(input->>'jobId')::uuid; item:=(input->>'scopeItemId')::uuid;
 revision_id:=(input->>'currentRevisionId')::uuid; cmd:=(input->>'commandId')::uuid;
 accepted:=(input->>'acceptedRatePence')::bigint;
 IF j IS NULL OR item IS NULL OR revision_id IS NULL OR cmd IS NULL OR accepted IS NULL OR accepted<0 OR accepted>1000000000000
 THEN RAISE EXCEPTION 'INVALID_ACCEPTANCE' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rate-suggestion:'||t::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND environment='synthetic_demo' AND job_track='small_builder')
 OR NOT EXISTS(SELECT 1 FROM app.scope_revision WHERE tenant_id=t AND job_id=j AND scope_item_id=item AND id=revision_id)
 THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 request_hash:=encode(sha256(convert_to(jsonb_build_object('input',input,'actor',actor)::text,'UTF8')),'hex');
 SELECT * INTO prior FROM app.rate_suggestion_acceptance a WHERE a.tenant_id=t AND a.command_id=cmd;
 IF prior.id IS NOT NULL THEN
  IF prior.request_hash IS DISTINCT FROM request_hash THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('id',prior.id,'actorId',prior.actor_id,'recordHash',prior.record_hash,'provenance',prior.provenance);
 END IF;
 SELECT id INTO latest FROM app.scope_revision WHERE tenant_id=t AND job_id=j AND scope_item_id=item ORDER BY revision DESC LIMIT 1;
 IF latest IS DISTINCT FROM revision_id OR EXISTS(SELECT 1 FROM app.rate_suggestion_acceptance a WHERE a.tenant_id=t AND a.job_id=j AND a.scope_item_id=item AND a.previous_revision_id=revision_id)
 THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'version','rate-observation.v1','id',o.id,'tenantId',o.tenant_id,'jobId',o.job_id,
 'scopeItemId',o.scope_item_id,'sourceScopeRevisionId',o.source_scope_revision_id,
 'effectiveAt',to_char(o.effective_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'unit',o.unit,'ratePrincipalPence',o.rate_principal_pence,'currency',o.currency,
 'taxBasis',o.tax_basis,'category',o.category,'region',o.region,'provenance',o.provenance,'kind','rate',
 'traced',r.id IS NOT NULL AND i.state='confirmed' AND r.unit=o.unit AND r.unit_price_pence=o.rate_principal_pence
 ) ORDER BY o.id),'[]'::jsonb) INTO observations
 FROM app.rate_book_observation o
 LEFT JOIN app.scope_revision r ON (r.tenant_id,r.job_id,r.scope_item_id,r.id)=
 (o.tenant_id,o.job_id,o.scope_item_id,o.source_scope_revision_id)
 LEFT JOIN app.scope_identity i ON (i.tenant_id,i.job_id,i.id)=(o.tenant_id,o.job_id,o.scope_item_id)
 WHERE o.tenant_id=t;
 actual_hash:=encode(sha256(convert_to(jsonb_build_object('policyVersion','rate-baseline.v1','query',q,'observations',observations)::text,'UTF8')),'hex');
 IF actual_hash IS DISTINCT FROM input->>'baselineHash' THEN RAISE EXCEPTION 'STALE_BASELINE' USING ERRCODE='40001'; END IF;
 -- Independent SQL check of the bounded descriptive policy. No accepted rows are training data.
 WITH normalized AS (
 SELECT x, CASE lower(btrim(x->>'unit')) WHEN 'ea' THEN 'each' WHEN 'unit' THEN 'each' WHEN 'metre' THEN 'm'
 WHEN 'm²' THEN 'm2' WHEN 'hr' THEN 'hour' ELSE lower(btrim(x->>'unit')) END unit,
 count(*) OVER(PARTITION BY x->>'sourceScopeRevisionId') source_count
 FROM jsonb_array_elements(observations) x WHERE (x->>'traced')::boolean
 ), comparable AS (
 SELECT x FROM normalized WHERE source_count=1 AND unit=q->>'unit'
 AND lower(btrim(x->>'taxBasis'))=q->>'taxBasis' AND lower(btrim(x->>'category'))=q->>'category'
 AND lower(btrim(x->>'region'))=q->>'region'
 AND (x->>'effectiveAt')::timestamptz BETWEEN (q->>'asOf')::timestamptz-interval '180 days' AND (q->>'asOf')::timestamptz
 ORDER BY (x->>'effectiveAt')::timestamptz DESC,x->>'id' LIMIT 10
 ) SELECT array_agg((x->>'ratePrincipalPence')::bigint ORDER BY (x->>'ratePrincipalPence')::bigint),
 array_agg((x->>'id')::uuid ORDER BY (x->>'ratePrincipalPence')::bigint) INTO rates,sources FROM comparable;
 IF coalesce(cardinality(rates),0)<3 THEN RAISE EXCEPTION 'UNKNOWN_RATE' USING ERRCODE='22023'; END IF;
 centre:=(rates[(cardinality(rates)+1)/2]::numeric+rates[(cardinality(rates)+2)/2]::numeric)/2;
 -- Half-even for the centre used by the core outlier rule.
 centre:=trunc(centre)+(CASE WHEN centre-trunc(centre)>0.5 OR (centre-trunc(centre)=0.5 AND mod(trunc(centre),2)=1) THEN 1 ELSE 0 END);
 SELECT array_agg(rate ORDER BY rate),array_agg(source ORDER BY source) INTO rates,sources
 FROM unnest(rates,sources) AS pair(rate,source) WHERE rate::numeric<=centre*3 AND rate::numeric*3>=centre;
 IF coalesce(cardinality(rates),0)<3 THEN RAISE EXCEPTION 'UNKNOWN_RATE' USING ERRCODE='22023'; END IF;
 suggested:=(rates[(cardinality(rates)+1)/2]::numeric+rates[(cardinality(rates)+2)/2]::numeric)/2;
 suggested:=trunc(suggested)+(CASE WHEN suggested-trunc(suggested)>0.5 OR (suggested-trunc(suggested)=0.5 AND mod(trunc(suggested),2)=1) THEN 1 ELSE 0 END);
 IF suggested<>accepted THEN RAISE EXCEPTION 'INVALID_ACCEPTANCE' USING ERRCODE='22023'; END IF;
 record_hash:=encode(sha256(convert_to(jsonb_build_object('id',record_id,'requestHash',request_hash,'sources',sources,
 'baselineHash',actual_hash,'policyVersion','rate-baseline.v1','provenance','suggestion_accepted','environment','synthetic_demo')::text,'UTF8')),'hex');
 INSERT INTO app.rate_suggestion_acceptance(tenant_id,id,job_id,scope_item_id,previous_revision_id,accepted_pence,
 unit,tax_basis,category,region,policy_version,source_observation_ids,baseline_hash,actor_id,command_id,request_hash,record_hash)
 VALUES(t,record_id,j,item,revision_id,accepted,q->>'unit',q->>'taxBasis',q->>'category',q->>'region','rate-baseline.v1',sources,actual_hash,actor,cmd,request_hash,record_hash);
 -- Last contending lock is the existing per-tenant audit head.
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',record_id,'version','audit.v1',
 'actorRef','membership:'||actor::text,'eventType','rate.suggestion_accepted','subjectType','job','subjectRef',j::text,
 'payload',jsonb_build_object('references',jsonb_build_object('acceptanceId',record_id::text),
 'hashes',jsonb_build_object('record',record_hash)))),'checked_operation');
 RETURN jsonb_build_object('id',record_id,'actorId',actor,'recordHash',record_hash,'provenance','suggestion_accepted');
END $$;
ALTER FUNCTION app.accept_rate_suggestion(uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.accept_rate_suggestion(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.accept_rate_suggestion(uuid,text,jsonb) TO jobguard_runtime;
COMMIT;
