BEGIN;
-- ENT-8a synthetic contractor completion only. No work-order/job status or financial changes.
-- Forward fix only: preserve immutable finish facts and receipts when changing this command later.
CREATE TABLE app.contractor_job_finish (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 command_id uuid NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 agreement_version_id uuid, check_ran boolean NOT NULL, finished_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,job_id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,agreement_version_id) REFERENCES app.enterprise_agreement_version(tenant_id,id),
 CHECK(NOT check_ran OR agreement_version_id IS NOT NULL)
);
ALTER TABLE app.contractor_job_finish OWNER TO jobguard_migration;
ALTER TABLE app.contractor_job_finish ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.contractor_job_finish FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.contractor_job_finish FOR ALL TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.contractor_job_finish FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_identity,jobguard_shadow,jobguard_shadow_emergency_access;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.contractor_job_finish
 FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE CONSTRAINT TRIGGER lp_fact_audit AFTER INSERT ON app.contractor_job_finish
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.lp_require_audit();
CREATE OR REPLACE FUNCTION app.lp_command(p_session uuid,p_input jsonb,p_source_bytes bytea DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; j uuid:=(p_input->>'jobId')::uuid; a uuid; cid uuid:=(p_input->>'commandId')::uuid;
 ver text:=p_input->>'version'; typ text; h text; old app.command_receipt; answer jsonb; evaluation jsonb; fact app.materials_issue_fact; source_hash text; source uuid;
 p app.extra_prompt; chosen uuid; n integer; v uuid:=gen_random_uuid(); scope uuid:=gen_random_uuid(); grant_id uuid; role_name text; origin_hash text; audits jsonb:='[]'; pid uuid; rev uuid; selected_identity text; excess_scope uuid; selected_unit text; settings app.extra_prompt_rule_settings; term text; original_bytes bytea; tags jsonb; source_kind text; expected_keys text[];
 ag app.enterprise_agreement_version; finished app.contractor_job_finish; check_enabled boolean; before_prompts integer;
BEGIN
 typ:=CASE ver WHEN 'materials-issue.v1' THEN 'ImportMaterialsIssue' WHEN 'completion-observation.v1' THEN 'RegisterCompletionObservation' WHEN 'evaluate-live-prompts.v1' THEN 'EvaluateLivePrompts' WHEN 'confirm-prompt.v1' THEN 'ConfirmPrompt' WHEN 'dismiss-prompt.v1' THEN 'DismissPrompt' WHEN 'end-check.v1' THEN 'EndCheck' ELSE NULL END;
 IF typ IS NULL OR cid IS NULL OR j IS NULL THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
 a:=app.lp_authority(p_session,j,CASE WHEN typ='ImportMaterialsIssue' THEN 'materials' WHEN typ='EndCheck' THEN 'endcheck' ELSE 'resolve' END);
 expected_keys:=CASE typ WHEN 'ImportMaterialsIssue' THEN ARRAY['version','commandId','jobId','sourceId','eventId','workIdentity','unit','quantity','occurredAtMicros','kind']
 WHEN 'RegisterCompletionObservation' THEN ARRAY['version','commandId','jobId','evidenceId','sha256','objectVersion','locator','workIdentity','sourceText']
 WHEN 'ConfirmPrompt' THEN ARRAY['version','commandId','jobId','promptId','promptHash','confirmedWorkIdentity','excessScopeItemId','existingExtraId']
 WHEN 'EndCheck' THEN ARRAY['version','commandId','jobId','agreementVersionId']
 WHEN 'DismissPrompt' THEN ARRAY['version','commandId','jobId','promptId','promptHash','reason'] ELSE ARRAY['version','commandId','jobId'] END;
 IF p_input-expected_keys<>'{}'::jsonb OR EXISTS(SELECT 1 FROM unnest(expected_keys) k WHERE k NOT IN('agreementVersionId','confirmedWorkIdentity','excessScopeItemId','existingExtraId','sourceText') AND (NOT p_input ? k OR p_input->k='null'::jsonb))
  OR EXISTS(SELECT 1 FROM jsonb_each(p_input) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM CASE WHEN e.key='locator' THEN 'object' ELSE 'string' END)
 THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
 h:=encode(sha256(convert_to(jsonb_build_array(a,p_input)::text,'UTF8')),'hex');
 -- Shared tenant command namespace; authority/live check occurs BEFORE replay.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||cid::text,8189));
 PERFORM app.lp_authority(p_session,j,CASE WHEN typ='ImportMaterialsIssue' THEN 'materials' WHEN typ='EndCheck' THEN 'endcheck' ELSE 'resolve' END);
 SELECT * INTO old FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF old.command_id IS NOT NULL THEN
  IF old.request_hash<>h OR old.command_type<>typ OR old.status<>'succeeded' THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
  PERFORM app.lp_authority(p_session,j,CASE WHEN typ='ImportMaterialsIssue' THEN 'materials' WHEN typ='EndCheck' THEN 'endcheck' ELSE 'resolve' END);
  RETURN jsonb_build_object('replay',true,'result',old.result,'audits','[]'::jsonb);
 END IF;
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(t,cid,typ,CASE WHEN typ='ConfirmPrompt' THEN 'extra-origin:'||j::text||':'||v::text ELSE 'live-prompt:'||j::text||':'||cid::text END,h,'processing',a);
 IF typ='EndCheck' THEN
  -- The owner/session checks and key 417 precede the receipt. Upgrade the job lock
  -- before checking visits: concurrent starts hold a job SHARE lock through commit.
  PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
  IF EXISTS(SELECT 1 FROM app.contractor_job_finish WHERE tenant_id=t AND job_id=j)
   OR EXISTS(SELECT 1 FROM app.site_visit WHERE tenant_id=t AND job_id=j AND completed_at IS NULL)
  THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
  SELECT * INTO ag FROM app.enterprise_agreement_version
   WHERE tenant_id=t AND environment='synthetic_demo' AND effective_from<=statement_timestamp()
   ORDER BY effective_from DESC LIMIT 1 FOR SHARE;
  IF p_input ? 'agreementVersionId' AND (p_input->>'agreementVersionId')::uuid IS DISTINCT FROM ag.id
  THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
  check_enabled:=coalesce(ag.end_of_job_check,false);
  SELECT count(*) INTO before_prompts FROM app.extra_prompt WHERE tenant_id=t AND job_id=j;
  IF check_enabled THEN evaluation:=app.lp_evaluate(j,cid); END IF;
  INSERT INTO app.contractor_job_finish(tenant_id,job_id,actor_membership_id,command_id,request_hash,agreement_version_id,check_ran)
   VALUES(t,j,a,cid,h,ag.id,check_enabled) RETURNING * INTO finished;
  SELECT jsonb_build_object('jobId',j,'finishedAt',finished.finished_at,'checkRan',check_enabled,
   'promptsRaised',count(*)-before_prompts) INTO answer FROM app.extra_prompt WHERE tenant_id=t AND job_id=j;
 ELSIF typ='ImportMaterialsIssue' THEN
  IF p_input->>'kind' NOT IN('issue','return','correction') OR p_input->>'quantity' !~ '^(0|[1-9][0-9]{0,17})(\.[0-9]{1,6})?$' OR (p_input->>'quantity')::numeric<0 OR (p_input->>'kind'='issue' AND (p_input->>'quantity')::numeric=0) OR p_input->>'occurredAtMicros' !~ '^(0|[1-9][0-9]{0,23})$'
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['sourceId','eventId','workIdentity','unit']) k WHERE length(btrim(p_input->>k)) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
  source_hash:=encode(sha256(convert_to((p_input-ARRAY['commandId','version'])::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(t,p_input->>'sourceId',p_input->>'eventId')::text,8190));
  PERFORM app.lp_authority(p_session,j,'materials');
  SELECT * INTO fact FROM app.materials_issue_fact WHERE tenant_id=t AND source_id=p_input->>'sourceId' AND event_id=p_input->>'eventId';
  IF fact.id IS NOT NULL THEN
   IF fact.source_hash<>source_hash OR fact.job_id<>j THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
   SELECT cr.result INTO answer FROM app.command_receipt cr WHERE cr.tenant_id=t AND cr.command_id=fact.command_id;
  ELSE
   INSERT INTO app.materials_issue_fact(tenant_id,job_id,version,fact_kind,source_id,event_id,work_identity,unit,quantity,occurred_at_micros,source_hash,command_id,actor_membership_id)
   VALUES(t,j,ver,p_input->>'kind',p_input->>'sourceId',p_input->>'eventId',p_input->>'workIdentity',p_input->>'unit',(p_input->>'quantity')::numeric,(p_input->>'occurredAtMicros')::numeric,source_hash,cid,a) RETURNING id INTO source;
   evaluation:=app.lp_evaluate(j,cid);
   -- Import authority does not imply reading the Possible extras lane.
   answer:=jsonb_build_object('sourceId',source,'quarantinedComparisons',evaluation->'quarantinedComparisons','unevaluatedComparisons',evaluation->'unevaluatedComparisons');
  END IF;
 ELSIF typ='RegisterCompletionObservation' THEN
  IF p_input->'locator'->>'kind'='text_span' THEN
   source_kind:='completion_note'; original_bytes:=convert_to(p_input->>'sourceText','UTF8');
   IF original_bytes IS NULL OR octet_length(original_bytes)>100000 OR encode(sha256(original_bytes),'hex') IS DISTINCT FROM p_input->>'sha256'
    OR NOT EXISTS(SELECT 1 FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
     WHERE e.tenant_id=t AND e.job_id=j AND e.id=(p_input->>'evidenceId')::uuid AND e.sha256=p_input->>'sha256' AND e.object_version_id=p_input->>'objectVersion'
     AND e.evidence_type='completion_note' AND e.content_type IN('text/plain','text/plain; charset=utf-8') AND e.byte_length=octet_length(original_bytes) AND e.kind='original' AND e.server_verified_at IS NOT NULL AND u.state='verified' AND u.server_verified_at IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE(i.tenant_id,i.evidence_id)=(e.tenant_id,e.id))) THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
   IF NOT app.lp_span_valid(p_input->>'sourceText',p_input->'locator') THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
   term:=p_input->'locator'->>'quote';
  ELSIF p_input->'locator'->>'kind'='photo_tag' THEN
   source_kind:='completion_photo';
   IF p_input ? 'sourceText' OR (p_input->'locator')-ARRAY['kind','tag']<>'{}'::jsonb OR jsonb_typeof(p_input->'locator'->'tag') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
   -- The ordinary-runtime source adapter reads the immutable original under its existing RLS.
   -- No new original-table grants. This preimage is independently bound to finalized metadata here.
   SELECT p_source_bytes INTO original_bytes FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
    WHERE e.tenant_id=t AND e.job_id=j AND e.id=(p_input->>'evidenceId')::uuid AND e.sha256=p_input->>'sha256' AND e.object_version_id=p_input->>'objectVersion'
    AND e.evidence_type='completion_photo' AND e.content_type='image/png' AND e.kind='original' AND e.server_verified_at IS NOT NULL AND u.state='verified' AND u.server_verified_at IS NOT NULL
    AND octet_length(p_source_bytes)=e.byte_length AND encode(sha256(p_source_bytes),'hex')=e.sha256
    AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE(i.tenant_id,i.evidence_id)=(e.tenant_id,e.id));
   IF original_bytes IS NULL THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
   tags:=app.lp_png_completion_tags(original_bytes); term:=p_input->'locator'->>'tag';
   IF tags IS NULL OR NOT tags ? term THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
  ELSE RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
  SELECT s.* INTO settings FROM app.work_order w JOIN app.extra_prompt_rule_settings s ON(s.tenant_id,s.client_contract_version_id)=(w.tenant_id,w.contract_version_id) WHERE w.tenant_id=t AND w.job_id=j;
  -- Unknown/ambiguous vocabulary is a persisted unevaluated observation, never a fabricated mapping.
  IF settings.id IS NOT NULL AND (SELECT count(DISTINCT e->>'workId') FROM jsonb_array_elements(settings.recognition) e WHERE e->'terms' ? term)=1
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(settings.recognition) e WHERE e->>'workId'=p_input->>'workIdentity' AND e->'terms' ? term) THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
  INSERT INTO app.extra_completion_observation(tenant_id,job_id,evidence_id,object_version_id,sha256,source_kind,source_bytes,source_text,photo_tags,locator,work_identity,command_id,actor_membership_id)
  VALUES(t,j,(p_input->>'evidenceId')::uuid,p_input->>'objectVersion',p_input->>'sha256',source_kind,original_bytes,p_input->>'sourceText',tags,p_input->'locator',p_input->>'workIdentity',cid,a) RETURNING id INTO source;
  evaluation:=app.lp_evaluate(j,cid); answer:=jsonb_build_object('observationId',source,'evaluation',evaluation);
 ELSIF typ='EvaluateLivePrompts' THEN answer:=app.lp_evaluate(j,cid);
 ELSE
  SELECT * INTO p FROM app.extra_prompt WHERE tenant_id=t AND job_id=j AND id=(p_input->>'promptId')::uuid FOR UPDATE;
  SELECT c.revision_id INTO rev FROM app.work_order w JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id) WHERE w.tenant_id=t AND w.job_id=j;
  IF p.id IS NULL OR p.prompt_hash IS DISTINCT FROM p_input->>'promptHash' OR p.revision_id IS DISTINCT FROM rev THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
  IF EXISTS(SELECT 1 FROM app.prompt_resolution WHERE tenant_id=t AND prompt_id=p.id) THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
  IF NOT app.lp_citations_valid(j,p.id) THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
  IF p.rule='b' AND (EXISTS(SELECT 1 FROM app.materials_issue_fact f WHERE f.tenant_id=t AND f.job_id=j AND f.work_identity=p.work_identity AND f.fact_kind<>'issue') OR EXISTS(SELECT 1 FROM app.materials_issue_fact f JOIN app.materials_issue_fact g ON(g.tenant_id,g.job_id,g.source_id,g.work_identity,g.unit,g.occurred_at_micros)=(f.tenant_id,f.job_id,f.source_id,f.work_identity,f.unit,f.occurred_at_micros)
   WHERE f.tenant_id=t AND f.job_id=j AND f.work_identity=p.work_identity AND f.id<>g.id AND f.quantity<>g.quantity)) THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
  IF typ='DismissPrompt' THEN
   IF length(btrim(p_input->>'reason')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
   INSERT INTO app.prompt_resolution(tenant_id,job_id,prompt_id,kind,prompt_hash,reason,actor_membership_id,command_id) VALUES(t,j,p.id,'dismissed',p.prompt_hash,p_input->>'reason',a,cid);
   answer:=jsonb_build_object('kind','dismissed','promptId',p.id);
  ELSE
   selected_identity:=coalesce(p.work_identity,p_input->>'confirmedWorkIdentity');
   IF selected_identity IS NULL OR (p.work_identity IS NOT NULL AND p_input ? 'confirmedWorkIdentity' AND p_input->>'confirmedWorkIdentity'<>p.work_identity)
    OR NOT EXISTS(SELECT 1 FROM app.work_order_revision r JOIN app.sor_item i ON(i.tenant_id,i.version_id)=(r.tenant_id,r.sor_version_id) WHERE r.tenant_id=t AND r.id=rev AND i.code=selected_identity) THEN RAISE EXCEPTION 'PROMPT_AMBIGUOUS'; END IF;
   IF p.rule='b' THEN
    SELECT f.unit INTO selected_unit FROM app.extra_prompt_citation c JOIN app.materials_issue_fact f ON(f.tenant_id,f.job_id,f.id)=(c.tenant_id,c.job_id,c.source_id) WHERE c.tenant_id=t AND c.prompt_id=p.id AND c.source_kind='materials' LIMIT 1;
    SELECT count(*),min(l.scope_item_id::text)::uuid INTO n,excess_scope FROM app.work_order_line l WHERE l.tenant_id=t AND l.job_id=j AND l.revision_id=rev AND l.sor_code=selected_identity AND l.unit=selected_unit
     AND (NOT p_input ? 'excessScopeItemId' OR l.scope_item_id=(p_input->>'excessScopeItemId')::uuid);
    IF n<>1 THEN RAISE EXCEPTION 'PROMPT_AMBIGUOUS'; END IF;
   ELSIF p_input ? 'excessScopeItemId' OR EXISTS(SELECT 1 FROM app.work_order_line WHERE tenant_id=t AND revision_id=rev AND sor_code=selected_identity) THEN
    -- A generic visit/closeout cannot be turned into an on-order quantity excess by guesswork.
    RAISE EXCEPTION 'PROMPT_AMBIGUOUS';
   END IF;
   SELECT count(*),min(x.id::text)::uuid INTO n,chosen FROM app.variation x WHERE x.tenant_id=t AND x.job_id=j AND x.job_track='contractor' AND x.sor_code=selected_identity
    AND (NOT p_input ? 'existingExtraId' OR x.id=(p_input->>'existingExtraId')::uuid)
    AND (p.rule='b' AND x.excess_of_revision_id=rev AND x.excess_of_scope_item_id=excess_scope OR p.rule<>'b' AND x.excess_of_revision_id IS NULL);
   IF n>1 OR (n=0 AND p_input ? 'existingExtraId') THEN RAISE EXCEPTION 'PROMPT_AMBIGUOUS'; END IF;
   IF n=1 THEN
    INSERT INTO app.prompt_resolution(tenant_id,job_id,prompt_id,kind,variation_id,prompt_hash,actor_membership_id,command_id) VALUES(t,j,p.id,'coalesced',chosen,p.prompt_hash,a,cid);
    answer:=jsonb_build_object('kind','coalesced','promptId',p.id,'variationId',chosen);
   ELSE
    SELECT m.role INTO role_name FROM app.membership m WHERE m.tenant_id=t AND m.id=a;
    SELECT g.id INTO grant_id FROM app.role_grant g JOIN app.team tm ON tm.tenant_id=t AND tm.id=app.contractor_job_team(j) JOIN app.org_unit b ON(b.tenant_id,b.id)=(tm.tenant_id,tm.branch_id)
     WHERE g.tenant_id=t AND g.membership_id=a AND g.role=role_name AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
      AND(g.scope_kind='tenant' AND g.scope_id=t OR g.scope_kind='team' AND g.scope_id=tm.id OR g.scope_kind='branch' AND g.scope_id=b.id OR g.scope_kind='region' AND g.scope_id=b.parent_id) ORDER BY g.id LIMIT 1;
    INSERT INTO app.prompt_resolution(tenant_id,job_id,prompt_id,kind,variation_id,prompt_hash,actor_membership_id,command_id) VALUES(t,j,p.id,'created',v,p.prompt_hash,a,cid);
    INSERT INTO app.scope_identity(tenant_id,job_id,id) VALUES(t,j,scope);
    IF excess_scope IS NOT NULL THEN INSERT INTO app.scope_lineage(tenant_id,job_id,parent_scope_item_id,child_scope_item_id,kind) VALUES(t,j,excess_scope,scope,'variation'); END IF;
    INSERT INTO app.variation(tenant_id,job_id,id,scope_item_id,capture_kind,capture_text,description,job_track,origin,sor_version_id,sor_code,excess_of_revision_id,excess_of_scope_item_id,lineage_parent_scope_item_id)
    SELECT t,j,v,scope,'text','Confirmed possible extra: '||selected_identity,'Possible extra: '||selected_identity,'contractor','jobguard_surfaced_confirmed',i.version_id,i.code,CASE WHEN excess_scope IS NOT NULL THEN rev ELSE NULL END,excess_scope,excess_scope
     FROM app.sor_item i JOIN app.work_order_revision r ON r.tenant_id=i.tenant_id AND r.sor_version_id=i.version_id WHERE r.tenant_id=t AND r.id=rev AND i.code=selected_identity;
    IF NOT FOUND THEN RAISE EXCEPTION 'PROMPT_AMBIGUOUS'; END IF;
    INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,command_id,raising_membership_id,raising_role,provenance,source_capture_kind,source_capture_hash,raising_grant_id)
    VALUES(t,j,v,'contractor','jobguard_surfaced_confirmed',cid,a,role_name,'command','text',repeat('0',64),grant_id) RETURNING extra_origin.origin_hash INTO origin_hash;
    INSERT INTO app.extra_event(tenant_id,id,job_id,variation_id,kind,command_id,actor_membership_id) VALUES(t,gen_random_uuid(),j,v,'logged',cid,a);
    audits:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||a,'eventType','contractor.extra.raised','subjectType','extra','subjectRef',v,
     'payload',jsonb_build_object('references',jsonb_build_object('command',cid,'job',j,'extra',v),'hashes',jsonb_build_object('origin',origin_hash))));
    answer:=jsonb_build_object('kind','created','promptId',p.id,'variationId',v);
   END IF;
  END IF;
 END IF;
 UPDATE app.command_receipt SET status='succeeded',result=answer,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=cid;
 -- Deferred audit validation prevents a direct caller committing without the exact receipt audit.
 audits:=audits||jsonb_build_array(jsonb_build_object('id',cid,'version','audit.v1','actorRef','membership:'||a,'eventType','contractor.prompt.command','subjectType','job','subjectRef',j,
  'payload',jsonb_build_object('references',jsonb_build_object('command',cid,'job',j,'commandType',typ),'hashes',jsonb_build_object('input',h,'result',encode(sha256(convert_to(answer::text,'UTF8')),'hex')))));
 RETURN jsonb_build_object('replay',false,'result',answer,'audits',audits);
END $$;

CREATE OR REPLACE FUNCTION app.lp_read(p_session uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; j uuid:=(p_input->>'jobId')::uuid; a uuid; result jsonb; lim integer:=coalesce((p_input->>'limit')::integer,50); x jsonb;
BEGIN
 IF p_input->>'version'='contractor-job-finish-status.v1' THEN
  PERFORM app.lp_authority(p_session,j,'endcheck');
  IF p_input-ARRAY['version','jobId']<>'{}'::jsonb THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
  SELECT cr.result INTO result FROM app.contractor_job_finish f JOIN app.command_receipt cr
   ON(cr.tenant_id,cr.command_id)=(f.tenant_id,f.command_id) WHERE f.tenant_id=t AND f.job_id=j;
  RETURN jsonb_build_object('canFinish',true,'finish',result);
 END IF;
 a:=app.lp_authority(p_session,j,CASE p_input->>'version' WHEN 'live-prompt-list.v1' THEN 'list' ELSE 'detail' END);
 IF p_input->>'version'='live-prompt-list.v1' THEN
  IF p_input-ARRAY['version','jobId','limit','after']<>'{}'::jsonb OR lim NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM jsonb_each(p_input) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM CASE WHEN e.key='limit' THEN 'number' ELSE 'string' END) THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
  SELECT coalesce(jsonb_agg(q.document ORDER BY q.id),'[]') INTO result FROM (
   SELECT p.id,jsonb_build_object('id',p.id,'jobId',p.job_id,'promptHash',p.prompt_hash,'rule',p.rule,'ruleVersion',p.rule_version,'surfacedAt',p.surfaced_at,'resolution',r.kind) document
   FROM app.extra_prompt p LEFT JOIN app.prompt_resolution r ON(r.tenant_id,r.prompt_id)=(p.tenant_id,p.id)
   WHERE p.tenant_id=t AND p.job_id=j AND (p_input->>'after' IS NULL OR p.id>(p_input->>'after')::uuid) ORDER BY p.id LIMIT lim+1) q;
  RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(result)>lim THEN result-(lim) ELSE result END,'nextCursor',CASE WHEN jsonb_array_length(result)>lim THEN result->(lim-1)->>'id' ELSE NULL END);
 ELSIF p_input->>'version'='live-prompt-detail.v1' THEN
  IF p_input-ARRAY['version','jobId','promptId']<>'{}'::jsonb OR EXISTS(SELECT 1 FROM jsonb_each(p_input) e WHERE jsonb_typeof(e.value)<>'string') THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
  SELECT jsonb_build_object('id',p.id,'jobId',p.job_id,'promptHash',p.prompt_hash,'rule',p.rule,'ruleVersion',p.rule_version,'baselineHash',p.baseline_hash,'baselineRevisionId',p.revision_id,'surfacedAt',p.surfaced_at,'resolution',r.kind,'variationId',r.variation_id,'reason',r.reason,
   'citations',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',c.source_kind,'sourceId',c.source_id,'sha256',c.source_hash,'evidenceId',c.evidence_id,'objectVersion',c.object_version_id,'locator',c.locator) ORDER BY c.id) FROM app.extra_prompt_citation c WHERE c.tenant_id=t AND c.prompt_id=p.id),'[]'::jsonb))
  INTO result FROM app.extra_prompt p LEFT JOIN app.prompt_resolution r ON(r.tenant_id,r.prompt_id)=(p.tenant_id,p.id) WHERE p.tenant_id=t AND p.job_id=j AND p.id=(p_input->>'promptId')::uuid;
  IF result IS NULL THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN result;
 END IF;
 RAISE EXCEPTION 'INVALID_PROMPT_COMMAND';
END $$;

CREATE OR REPLACE FUNCTION app.lp_finish(p_session uuid,p_command uuid,p_result jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; r app.command_receipt;
BEGIN
 SELECT s.membership_id INTO a FROM app.contractor_session(p_session) s WHERE s.tenant_id=t;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF a IS NULL OR r.actor_membership_id IS DISTINCT FROM a OR r.status<>'succeeded' OR r.result IS DISTINCT FROM p_result OR r.command_type NOT IN('ImportMaterialsIssue','RegisterCompletionObservation','EvaluateLivePrompts','ConfirmPrompt','DismissPrompt','EndCheck')
 OR NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=t AND e.id=p_command AND e.event_type='contractor.prompt.command' AND e.actor_ref='membership:'||a AND e.payload->'hashes'->>'input'=r.request_hash
 AND e.payload->'hashes'->>'result'=encode(sha256(convert_to(p_result::text,'UTF8')),'hex')) THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
 -- No locks or business writes after the audit head.
END $$;

CREATE OR REPLACE FUNCTION app.lp_require_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r app.command_receipt;
BEGIN
 IF TG_TABLE_NAME='command_receipt' THEN
  IF NEW.command_type NOT IN('ImportMaterialsIssue','RegisterCompletionObservation','EvaluateLivePrompts','ConfirmPrompt','DismissPrompt','EndCheck') THEN RETURN NULL; END IF;
  -- Raw ConfirmPrompt remains held by the origin guard; do not impose this receipt format on unrelated predecessors.
  IF NEW.command_type='ConfirmPrompt' AND NOT EXISTS(SELECT 1 FROM app.prompt_resolution WHERE tenant_id=NEW.tenant_id AND command_id=NEW.command_id) THEN RETURN NULL; END IF;
  SELECT * INTO r FROM app.command_receipt WHERE tenant_id=NEW.tenant_id AND command_id=NEW.command_id;
 ELSE
  SELECT * INTO r FROM app.command_receipt WHERE tenant_id=NEW.tenant_id AND command_id=NEW.command_id;
 END IF;
 IF r.status IS DISTINCT FROM 'succeeded' THEN RAISE EXCEPTION 'PROMPT_AUDIT_REQUIRED'; END IF;
 IF r.command_type='CompleteSiteVisit' THEN
  IF NOT EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=r.tenant_id AND event_type='contractor.visit.completed' AND payload->'references'->>'command'=r.command_id::text) THEN RAISE EXCEPTION 'PROMPT_AUDIT_REQUIRED'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=r.tenant_id AND e.id=r.command_id AND e.event_type='contractor.prompt.command' AND e.actor_ref='membership:'||r.actor_membership_id
   AND e.payload->'hashes'->>'input'=r.request_hash AND e.payload->'hashes'->>'result'=encode(sha256(convert_to(r.result::text,'UTF8')),'hex')) THEN RAISE EXCEPTION 'PROMPT_AUDIT_REQUIRED'; END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION app.lp_receipt_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.command_type NOT IN('ImportMaterialsIssue','RegisterCompletionObservation','EvaluateLivePrompts','ConfirmPrompt','DismissPrompt','EndCheck') THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 -- SH-1's legacy non-work-order ConfirmPrompt is not a persisted live-prompt command.
 -- Match the same work-order provenance boundary as ent4b_origin_provenance; do not
 -- weaken protection for real prompt receipts or grant access to private prompt tables.
 IF OLD.command_type='ConfirmPrompt' AND NOT EXISTS(
  SELECT 1 FROM app.job j WHERE j.tenant_id=OLD.tenant_id AND j.provenance='work_order'
   AND split_part(OLD.semantic_key,':',1)='extra-origin' AND split_part(OLD.semantic_key,':',2)=j.id::text
 ) THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_OP='DELETE' OR current_user<>'jobguard_migration' OR OLD.status<>'processing' OR NEW.status<>'succeeded'
  OR ROW(NEW.tenant_id,NEW.command_id,NEW.command_type,NEW.semantic_key,NEW.request_hash,NEW.actor_membership_id,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.tenant_id,OLD.command_id,OLD.command_type,OLD.semantic_key,OLD.request_hash,OLD.actor_membership_id,OLD.created_at)
 THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
 RETURN NEW;
END $$;
COMMIT;
