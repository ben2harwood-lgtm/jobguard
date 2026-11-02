BEGIN;
-- SV6-PERSIST-A: storage foundation only. No illustration/policy activation.
CREATE TABLE app.recovery_attribution_revision (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, case_id uuid NOT NULL,
 work_id uuid NOT NULL, line_id uuid NOT NULL, lock_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), previous_id uuid,
 case_revision integer NOT NULL CHECK(case_revision>0), source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), CONSTRAINT ra_revision_subject_revision UNIQUE(tenant_id,job_id,case_id,work_id,line_id,lock_id,revision),
 CONSTRAINT ra_revision_subject_id UNIQUE(tenant_id,job_id,case_id,work_id,line_id,lock_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,line_id) REFERENCES app.final_account_line(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,lock_id) REFERENCES app.final_account_lock(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,case_id,work_id,line_id,lock_id,previous_id)
  REFERENCES app.recovery_attribution_revision(tenant_id,job_id,case_id,work_id,line_id,lock_id,id),
 CHECK((revision=1)=(previous_id IS NULL)), CHECK(previous_id IS DISTINCT FROM id)
);
CREATE TABLE app.recovery_attribution_command (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, job_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 assessment_id uuid NOT NULL, case_id uuid NOT NULL, work_id uuid NOT NULL, line_id uuid NOT NULL, lock_id uuid NOT NULL,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), first_result jsonb NOT NULL CHECK(jsonb_typeof(first_result)='object'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,case_id,work_id,line_id,lock_id,assessment_id)
  REFERENCES app.recovery_attribution_revision(tenant_id,job_id,case_id,work_id,line_id,lock_id,id)
);
CREATE TABLE app.recovery_attribution_reassessment (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, assessment_id uuid NOT NULL, previous_id uuid NOT NULL,
 case_id uuid NOT NULL, work_id uuid NOT NULL, line_id uuid NOT NULL, lock_id uuid NOT NULL,
 cause text NOT NULL CHECK(cause IN('money_changed','evidence_invalidated','source_changed')),
 source_ref text NOT NULL CHECK(length(source_ref) BETWEEN 1 AND 300),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), PRIMARY KEY(tenant_id,assessment_id),
 FOREIGN KEY(tenant_id,job_id,case_id,work_id,line_id,lock_id,assessment_id)
  REFERENCES app.recovery_attribution_revision(tenant_id,job_id,case_id,work_id,line_id,lock_id,id),
 FOREIGN KEY(tenant_id,job_id,case_id,work_id,line_id,lock_id,previous_id)
  REFERENCES app.recovery_attribution_revision(tenant_id,job_id,case_id,work_id,line_id,lock_id,id),
 CHECK(previous_id<>assessment_id)
);
CREATE FUNCTION app.recovery_attribution_immutable() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_IMMUTABLE' USING ERRCODE='23514'; END $$;
ALTER FUNCTION app.recovery_attribution_immutable() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.recovery_attribution_immutable() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['recovery_attribution_revision','recovery_attribution_command','recovery_attribution_reassessment'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  -- Raw SELECT is scoped to an authenticated, current owner and its locked practice job.
  EXECUTE format('CREATE POLICY attribution_read ON app.%I FOR SELECT TO jobguard_runtime USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid AND EXISTS(SELECT 1 FROM app.job j JOIN app.authenticate_practice_session(nullif(current_setting(''app.practice_material_digest'',true),'''')) p ON p.tenant_id=j.tenant_id JOIN app.membership m ON(m.tenant_id,m.id)=(p.tenant_id,p.membership_id) JOIN app.final_account_lock l ON(l.tenant_id,l.job_id)=(j.tenant_id,j.id) WHERE j.tenant_id=%I.tenant_id AND j.id=%I.job_id AND j.practice_session_digest=nullif(current_setting(''app.practice_material_digest'',true),'''') AND m.role=''owner'' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())))',n,n,n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
  EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);
  EXECUTE format('CREATE TRIGGER attribution_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.recovery_attribution_immutable()',n);
 END LOOP;
END $$;
-- Private storage primitive. Migration/test owner only; parsing is never source authority.
-- No runtime grant, environment GUC, JSON brand or caller-supplied hash opens it.
CREATE FUNCTION app.append_recovery_attribution(p_document jsonb,p_actor uuid,p_command jsonb,p_cause text,p_source text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=(p_document->>'tenantId')::uuid; j uuid:=(p_document->>'jobId')::uuid;
 c uuid:=(p_document->>'caseId')::uuid; w uuid:=(p_document->>'workId')::uuid;
 l uuid:=(p_document->>'lineId')::uuid; k uuid:=(p_document->>'lockId')::uuid;
 a uuid:=(p_document->>'assessmentId')::uuid; prev uuid:=(p_document->>'previousAssessmentId')::uuid;
 r integer:=(p_document->>'revision')::integer; latest app.recovery_attribution_revision;
 replay app.recovery_attribution_command; result jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 OR p_document->>'version' IS DISTINCT FROM 'recovery-attribution-revision.v1'
 OR p_document->>'environment' IS DISTINCT FROM 'synthetic_demo'
 OR p_document->'productionEnabled' IS DISTINCT FROM 'false'::jsonb OR p_document->'realExternalActions' IS DISTINCT FROM '0'::jsonb
 OR p_document->>'attributionPolicyVersion' IS DISTINCT FROM 'shadow_attribution_policy_v3'
 OR p_document->>'eligibilityPolicyVersion' IS DISTINCT FROM 'reference_recovery_eligibility_policy_v3'
 THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Case lock matches the allocator. All business/command locks precede any audit caller.
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(c::text));
 IF p_command IS NOT NULL THEN
  IF p_command->>'version' IS DISTINCT FROM 'recovery-attribution-command.v1' OR p_command->>'action' IS DISTINCT FROM 'assess'
   OR p_command - ARRAY['version','action','commandId','caseId','workId','lineId','lockId','expectedCaseRevision','expectedAttributionRevision'] <> '{}'::jsonb
   OR NOT(p_command ?& ARRAY['version','action','commandId','caseId','workId','lineId','lockId','expectedCaseRevision','expectedAttributionRevision'])
   OR (p_command->>'caseId')::uuid IS DISTINCT FROM c OR (p_command->>'workId')::uuid IS DISTINCT FROM w
   OR (p_command->>'lineId')::uuid IS DISTINCT FROM l OR (p_command->>'lockId')::uuid IS DISTINCT FROM k
  THEN RAISE EXCEPTION 'INVALID_RECOVERY_ATTRIBUTION_COMMAND' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext('attribution-command:'||(p_command->>'commandId')));
  SELECT * INTO replay FROM app.recovery_attribution_command WHERE tenant_id=t AND command_id=(p_command->>'commandId')::uuid;
  IF FOUND THEN
   IF replay.job_id<>j OR replay.actor_membership_id IS DISTINCT FROM p_actor OR replay.payload<>p_command
   THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514'; END IF;
   RETURN replay.first_result;
  END IF;
 END IF;
 SELECT * INTO latest FROM app.recovery_attribution_revision WHERE tenant_id=t AND job_id=j AND case_id=c AND work_id=w AND line_id=l AND lock_id=k ORDER BY revision DESC LIMIT 1;
 IF r IS DISTINCT FROM coalesce(latest.revision,0)+1 OR prev IS DISTINCT FROM latest.id
 OR (p_command IS NOT NULL AND ((p_command->>'expectedAttributionRevision')::integer IS DISTINCT FROM coalesce(latest.revision,0)
 OR (p_command->>'expectedCaseRevision')::integer IS DISTINCT FROM (p_document->>'caseRevision')::integer))
 THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_STALE' USING ERRCODE='40001'; END IF;
 IF (r>1 AND (p_cause IS NULL OR p_source IS NULL)) OR (r=1 AND(p_cause IS NOT NULL OR p_source IS NOT NULL))
 THEN RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_CAUSE_REQUIRED' USING ERRCODE='23514'; END IF;
 INSERT INTO app.recovery_attribution_revision(tenant_id,job_id,id,case_id,work_id,line_id,lock_id,revision,previous_id,case_revision,source_hash,document)
 VALUES(t,j,a,c,w,l,k,r,prev,(p_document->>'caseRevision')::integer,p_document->>'sourceHash',p_document);
 IF r>1 THEN
  INSERT INTO app.recovery_attribution_reassessment(tenant_id,job_id,assessment_id,previous_id,case_id,work_id,line_id,lock_id,cause,source_ref)
  VALUES(t,j,a,prev,c,w,l,k,p_cause,p_source);
 END IF;
 result:=p_document;
 IF p_command IS NOT NULL THEN
  INSERT INTO app.recovery_attribution_command(tenant_id,command_id,job_id,actor_membership_id,assessment_id,case_id,work_id,line_id,lock_id,payload,first_result)
  VALUES(t,(p_command->>'commandId')::uuid,j,p_actor,a,c,w,l,k,p_command,result);
 END IF;
 RETURN result;
END $$;
ALTER FUNCTION app.append_recovery_attribution(jsonb,uuid,jsonb,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.append_recovery_attribution(jsonb,uuid,jsonb,text,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
-- Public command shape is intentionally closed until the accepted source adapter
-- can reconstruct and audit the assessment. Never accept an artifact argument.
CREATE FUNCTION app.assess_recovery_attribution(p_job uuid,p_session text,p_command jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND' USING ERRCODE='0A000';
END $$;
ALTER FUNCTION app.assess_recovery_attribution(uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.assess_recovery_attribution(uuid,text,jsonb) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.assess_recovery_attribution(uuid,text,jsonb) TO jobguard_runtime;
COMMIT;
