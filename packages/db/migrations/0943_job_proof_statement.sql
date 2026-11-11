BEGIN;
-- Practice-only proof rule. Runtime has no access to the migration ledger.
-- Private bridge: derive the home credential from the real transaction binding,
-- never from app.* settings. Existing binding owner/credential tables only.
GRANT CREATE ON SCHEMA app TO jobguard_binding_owner;
CREATE FUNCTION app.job_proof_session_digest() RETURNS text
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b control_plane.request_binding; d text; a uuid;
BEGIN
 b:=app.lp6_bound_request();
 IF b.credential_kind<>'practice' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT s.token_digest INTO d FROM control_plane.practice_session s
 WHERE encode(sha256(convert_to('lp6-home:'||s.token_digest,'UTF8')),'hex')=b.session_ref
  AND s.environment='synthetic_demo' AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp();
 IF d IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- The migration-owned authority reader takes the session share lock.
 SELECT x.actor_id INTO a FROM app.lp6_session_authority('practice',d,b.tenant_id) x;
 IF a IS DISTINCT FROM b.actor_id THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN d;
END $$;
ALTER FUNCTION app.job_proof_session_digest() OWNER TO jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.job_proof_session_digest() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.job_proof_session_digest() TO jobguard_migration;
-- Credential kind only; no binding means a legacy/unbound caller, never practice.
CREATE FUNCTION app.job_proof_practice_bound() RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b control_plane.request_binding;
BEGIN
 b:=app.lp6_bound_request();
 RETURN b.credential_kind='practice';
EXCEPTION WHEN insufficient_privilege THEN
 IF SQLERRM='REQUEST_BINDING_REFUSED' THEN RETURN false; END IF;
 RAISE;
END $$;
ALTER FUNCTION app.job_proof_practice_bound() OWNER TO jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.job_proof_practice_bound() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.job_proof_practice_bound() TO jobguard_migration;
REVOKE CREATE ON SCHEMA app FROM jobguard_binding_owner;

-- The synthetic original is FORCE RLS and admits only the runtime role, so the
-- migration-owned proof guards read it through this one exact-match probe. It
-- runs under the existing tenant_isolation policy and repeats its tenant
-- predicate; it returns only a boolean and is executable by the guards' owner.
CREATE FUNCTION app.job_proof_original_intact(t uuid,j uuid,s uuid,u uuid,k text,v text,h text,n bigint) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT t IS NOT DISTINCT FROM nullif(pg_catalog.current_setting('app.tenant_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM app.synthetic_evidence_original o
   WHERE (o.tenant_id,o.job_id,o.scope_item_id,o.upload_id,o.object_key,o.object_version_id)=(t,j,s,u,k,v)
    AND pg_catalog.encode(pg_catalog.sha256(o.bytes),'hex')=h AND pg_catalog.octet_length(o.bytes)=n)
$$;
ALTER FUNCTION app.job_proof_original_intact(uuid,uuid,uuid,uuid,text,text,text,bigint) OWNER TO jobguard_runtime;
REVOKE ALL ON FUNCTION app.job_proof_original_intact(uuid,uuid,uuid,uuid,text,text,text,bigint) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.job_proof_original_intact(uuid,uuid,uuid,uuid,text,text,text,bigint) TO jobguard_migration;

CREATE FUNCTION app.job_proof_authority(j uuid,locking boolean DEFAULT false) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b jsonb:=app.bound_context_reader(); t uuid:=(b->>'tenant_id')::uuid; a uuid:=(b->>'actor_id')::uuid; d text; owned boolean;
BEGIN
 IF b IS NULL OR t IS NULL OR a IS NULL
  OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 d:=app.job_proof_session_digest();
 IF d IS NOT NULL THEN
  WITH RECURSIVE owned_job(id) AS (
   SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=d
   UNION
   SELECT next_job.id FROM owned_job source JOIN app.job next_job ON next_job.tenant_id=t
    AND next_job.provenance='imported' AND next_job.practice_session_digest IS NULL
   WHERE EXISTS(SELECT 1 FROM app.job_import_v3 i WHERE i.tenant_id=t AND i.job_id=next_job.id AND i.source_job_id=source.id)
   OR EXISTS(SELECT 1 FROM app.imported_job_baseline ib
    JOIN app.job_party_binding imported ON(imported.tenant_id,imported.job_id,imported.id)=(ib.tenant_id,ib.job_id,ib.party_binding_id)
    JOIN app.job_party_binding origin ON origin.tenant_id=t AND origin.job_id=source.id
     AND origin.customer_revision_id=imported.customer_revision_id AND origin.site_revision_id=imported.site_revision_id AND origin.paying_party_revision_id=imported.paying_party_revision_id
    WHERE ib.tenant_id=t AND ib.job_id=next_job.id AND NOT EXISTS(SELECT 1 FROM app.job_import_v3 i WHERE i.tenant_id=t AND i.job_id=next_job.id)
     AND EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=t AND r.command_type='job.adopt_in_flight' AND r.status='succeeded'
      AND r.semantic_key='import:'||next_job.id::text AND r.result->>'jobId'=next_job.id::text AND r.result->>'sourceJobId'=source.id::text))
  ) SELECT EXISTS(SELECT 1 FROM owned_job WHERE id=j) INTO owned;
 END IF;
 IF NOT owned THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF locking THEN
  -- Keep the job share lock before proof serialization, matching live writers
  -- and avoiding inversion with Final Check's existing job update lock.
  PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
  PERFORM pg_advisory_xact_lock(hashtextextended('job-proof:'||t::text||':'||j::text,0));
  PERFORM 1 FROM app.membership WHERE tenant_id=t AND id=a FOR SHARE;
 END IF;
 -- Separate statements recheck after waits; every replay follows the same checks.
 IF b IS DISTINCT FROM app.bound_context_reader() OR d IS DISTINCT FROM app.job_proof_session_digest()
  OR NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=a
   AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=t AND r.membership_id=a))
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION app.job_proof_authority(uuid,boolean) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.job_proof_authority(uuid,boolean) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
REVOKE ALL ON FUNCTION app.job_proof_authority(uuid,boolean) FROM jobguard_runtime;

CREATE TABLE app.job_proof_statement (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0),
 includes_electrical_work boolean NOT NULL, membership_id uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,job_id,revision),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.final_account_proof_statement (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, revision_id uuid NOT NULL, statement_id uuid NOT NULL,
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant_id,job_id,revision_id),
 FOREIGN KEY(tenant_id,job_id,revision_id) REFERENCES app.final_account_revision(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,statement_id) REFERENCES app.job_proof_statement(tenant_id,job_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['job_proof_statement','final_account_proof_statement'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure',n);
  EXECUTE format('CREATE POLICY tenant_owner ON app.%I TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;

CREATE FUNCTION app.read_job_proof_statement(j uuid,r uuid DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; s app.job_proof_statement; uploaded boolean; locked boolean;
BEGIN
 PERFORM app.job_proof_authority(j,false);
 IF r IS NULL THEN
  SELECT * INTO s FROM app.job_proof_statement WHERE tenant_id=t AND job_id=j ORDER BY revision DESC LIMIT 1;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM app.final_account_revision WHERE tenant_id=t AND job_id=j AND id=r) THEN
   RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM app.final_account_proof_statement b JOIN app.final_account_revision rev
   ON(rev.tenant_id,rev.job_id,rev.id)=(b.tenant_id,b.job_id,b.revision_id)
   WHERE b.tenant_id=t AND b.job_id=j AND b.revision_id=r AND b.source_hash IS DISTINCT FROM rev.source_hash)
  THEN RAISE EXCEPTION 'PROOF_SCHEMA_INCONSISTENT' USING ERRCODE='23514'; END IF;
  SELECT st.* INTO s FROM app.final_account_proof_statement b JOIN app.job_proof_statement st
   ON(st.tenant_id,st.job_id,st.id)=(b.tenant_id,b.job_id,b.statement_id) WHERE b.tenant_id=t AND b.job_id=j AND b.revision_id=r;
 END IF;
 SELECT EXISTS(SELECT 1 FROM app.evidence_upload WHERE tenant_id=t AND job_id=j AND scope_item_id IS NOT NULL AND expected_content_type<>'audio/wav') INTO uploaded;
 SELECT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) INTO locked;
 RETURN jsonb_build_object('statement',CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id',s.id,'includesElectricalWork',s.includes_electrical_work,'membershipId',s.membership_id,'recordedAt',s.recorded_at) END,
  'requiredEvidenceType',CASE WHEN s.includes_electrical_work=false THEN 'completion_photo' ELSE 'electrical_certificate' END,
  'stage',CASE WHEN s.includes_electrical_work=false THEN 'completion-photo-stage' ELSE 'electrical-stage' END,
  'canChange',NOT uploaded AND NOT locked AND NOT EXISTS(SELECT 1 FROM app.stage_completion WHERE tenant_id=t AND job_id=j),
  'blockage',NULL);
END $$;
ALTER FUNCTION app.read_job_proof_statement(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.read_job_proof_statement(uuid,uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.read_job_proof_statement(uuid,uuid) TO jobguard_runtime;

-- The generic requirement reader preserves existing unanswered real/legacy repositories.
-- It returns no statement identity or practice authority on that path. Explicit data
-- always uses the strict owner/session reader, including revision-bound reads.
CREATE FUNCTION app.job_proof_requirement(j uuid,r uuid DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
BEGIN
 -- NULL is the internal presence probe, after all object signatures were checked.
 IF j IS NULL AND r IS NULL THEN RETURN 'true'::jsonb; END IF;
 -- Firm/job authority comes before any read. A practice credential must own the
 -- job (another blank firm sharing the tenant gets NOT_FOUND); any other caller
 -- never reaches a practice-owned job through the legacy path.
 IF app.job_proof_practice_bound() THEN PERFORM app.job_proof_authority(j,false);
 ELSIF EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j AND practice_session_digest IS NOT NULL)
 THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM app.job_proof_statement WHERE tenant_id=t AND job_id=j)
  OR EXISTS(SELECT 1 FROM app.final_account_proof_statement WHERE tenant_id=t AND job_id=j AND revision_id=r)
 THEN RETURN app.read_job_proof_statement(j,r); END IF;
 RETURN jsonb_build_object('statement',NULL,'requiredEvidenceType','electrical_certificate','stage','electrical-stage',
  'canChange',NOT EXISTS(SELECT 1 FROM app.evidence_upload WHERE tenant_id=t AND job_id=j AND scope_item_id IS NOT NULL AND expected_content_type<>'audio/wav')
   AND NOT EXISTS(SELECT 1 FROM app.stage_completion WHERE tenant_id=t AND job_id=j)
   AND NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j),'blockage',NULL);
END $$;
ALTER FUNCTION app.job_proof_requirement(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.job_proof_requirement(uuid,uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.job_proof_requirement(uuid,uuid) TO jobguard_runtime;

-- Extend the existing command identity namespace without registering a generic
-- adapter or changing any existing command's admitted values.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint
 WHERE conrelid='app.watchdog_command_identity'::regclass AND conname='watchdog_command_identity_command_type_check';
 IF definition IS NULL OR left(definition,7)<>'CHECK (' THEN RAISE EXCEPTION 'unexpected watchdog command identity constraint'; END IF;
 ALTER TABLE app.watchdog_command_identity DROP CONSTRAINT watchdog_command_identity_command_type_check;
 EXECUTE 'ALTER TABLE app.watchdog_command_identity ADD CONSTRAINT watchdog_command_identity_command_type_check CHECK ('||substring(definition FROM 8 FOR length(definition)-8)||' OR command_type=''proof.statement'')';
END $$;

-- Independent of the three-action proof_application_response contract.
-- Dedicated writer; deliberately absent from the generic command registry.
CREATE FUNCTION app.answer_job_proof_statement(j uuid,c jsonb) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; cid uuid; digest text; prior app.command_receipt;
 s app.job_proof_statement; view jsonb; response jsonb; payload jsonb;
BEGIN
 PERFORM app.job_proof_authority(j,true); a:=app.current_actor();
 IF c->>'version' IS DISTINCT FROM 'practice-proof-command.v1' OR c->>'action' IS DISTINCT FROM 'answer_statement'
  OR c-ARRAY['version','action','commandId','includesElectricalWork']<>'{}'::jsonb
  OR c->>'commandId' IS NULL OR c->>'commandId' !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' OR jsonb_typeof(c->'includesElectricalWork') IS DISTINCT FROM 'boolean'
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 cid:=(c->>'commandId')::uuid; c:=jsonb_set(c,'{commandId}',to_jsonb(cid::text)); digest:=app.final_lock_hash(jsonb_build_object('jobId',j,'actorId',a,'command',c));
 PERFORM pg_advisory_xact_lock(hashtextextended('watchdog-command-id:'||t::text||':'||cid::text,0));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.command_type<>'proof.statement' OR prior.status<>'succeeded' OR prior.actor_membership_id<>a OR prior.semantic_key<>'proof-statement:'||j::text||':'||cid::text OR prior.request_hash<>digest OR prior.result->>'jobId' IS DISTINCT FROM j::text THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  PERFORM app.validate_job_proof_receipt(t,cid);
  RETURN prior.result;
 END IF;
 IF EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=t AND command_id=cid)
  OR EXISTS(SELECT 1 FROM app.watchdog_command_identity WHERE tenant_id=t AND command_id=cid)
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 -- Existing legacy stores reserve their IDs even when they predate identity rows.
 IF EXISTS(
  SELECT command_id FROM app.planned_work_revision WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT command_id FROM app.readiness_decision WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT command_id FROM app.discrepancy_finding_revision WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT command_id FROM app.discrepancy_review_outcome WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT command_id FROM app.supplier_bill_supersession WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT command_id FROM app.supplier_match_revision WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT command_id FROM app.supplier_fact_revision WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT command_id FROM app.inbox_outcome_event WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT command_id FROM app.purchase_order_placement WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT command_id FROM app.stage_completion WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT id FROM app.evidence_upload WHERE tenant_id=t AND id=cid
  UNION ALL SELECT command_id FROM app.job_diary_entry WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT command_id FROM app.customer_message_source WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT command_id FROM app.job_work_state_event WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT command_id FROM app.job_link WHERE tenant_id=t AND command_id=cid
 ) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 PERFORM app.require_watchdog_live(j);
 view:=app.read_job_proof_statement(j);
 IF NOT (view->>'canChange')::boolean THEN RAISE EXCEPTION 'PROOF_STATEMENT_FROZEN' USING ERRCODE='55000'; END IF;
 SELECT * INTO s FROM app.job_proof_statement WHERE tenant_id=t AND job_id=j ORDER BY revision DESC LIMIT 1;
 IF s.id IS NULL OR s.includes_electrical_work IS DISTINCT FROM (c->>'includesElectricalWork')::boolean THEN
  INSERT INTO app.job_proof_statement(tenant_id,job_id,id,revision,includes_electrical_work,membership_id)
   VALUES(t,j,gen_random_uuid(),coalesce(s.revision,0)+1,(c->>'includesElectricalWork')::boolean,a) RETURNING * INTO s;
 END IF;
 INSERT INTO app.watchdog_command_identity(tenant_id,command_id,job_id,command_type,request_hash) VALUES(t,cid,j,'proof.statement',digest);
 response:=jsonb_build_object('version','practice-proof-statement-result.v1','jobId',j,'statement',jsonb_build_object('id',s.id,'includesElectricalWork',s.includes_electrical_work,'membershipId',s.membership_id,'recordedAt',s.recorded_at));
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
  VALUES(t,cid,'proof.statement','proof-statement:'||j::text||':'||cid::text,digest,'succeeded',response,a,clock_timestamp());
 -- Existing checked audit writer allocates the audit head last.
 payload:=jsonb_build_object('references',jsonb_build_object('statementId',s.id,'commandId',cid),'hashes',jsonb_build_object('requestHash',digest));
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
  'actorRef','membership:'||a::text,'eventType','proof.statement_recorded','subjectType','job','subjectRef',j::text,'payload',payload)),'checked_operation');
 RETURN response;
END $$;
ALTER FUNCTION app.answer_job_proof_statement(uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.answer_job_proof_statement(uuid,jsonb) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.answer_job_proof_statement(uuid,jsonb) TO jobguard_runtime;

-- Only explicit statements acquire immutable revision bindings. Never backfill history.
CREATE FUNCTION app.bind_final_account_proof_statement() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE sid uuid;
BEGIN
 SELECT id INTO sid FROM app.job_proof_statement WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id ORDER BY revision DESC LIMIT 1;
 IF sid IS NULL THEN RETURN NEW; END IF;
 INSERT INTO app.final_account_proof_statement(tenant_id,job_id,revision_id,statement_id,source_hash)
  VALUES(NEW.tenant_id,NEW.job_id,NEW.id,sid,NEW.source_hash);
 RETURN NEW;
END $$;
ALTER FUNCTION app.bind_final_account_proof_statement() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.bind_final_account_proof_statement() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER bind_proof_statement AFTER INSERT ON app.final_account_revision FOR EACH ROW EXECUTE FUNCTION app.bind_final_account_proof_statement();

CREATE FUNCTION app.guard_job_proof_source() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE j uuid; t uuid:=NEW.tenant_id; requirement jsonb; anchor uuid; e app.evidence_object; prior_read text;
BEGIN
 IF (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='evidence_invalidation' THEN
  SELECT job_id INTO j FROM app.evidence_object WHERE tenant_id=t AND id=NEW.evidence_id;
 ELSE j:=NEW.job_id; END IF;
 IF EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND job_track='contractor') THEN RETURN NEW; END IF;
 -- Voice and general unscoped captures are not the final-account proof upload.
 IF TG_TABLE_NAME='evidence_upload' THEN
  IF NEW.scope_item_id IS NULL OR NEW.expected_content_type='audio/wav' THEN RETURN NEW; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('job-proof:'||t::text||':'||j::text,0));
 IF NOT EXISTS(SELECT 1 FROM app.job_proof_statement WHERE tenant_id=t AND job_id=j) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='evidence_upload' THEN
  IF EXISTS(SELECT 1 FROM app.evidence_upload WHERE tenant_id=t AND id=NEW.id) THEN RETURN NEW; END IF;
  SELECT jsonb_build_object('requiredEvidenceType',CASE WHEN includes_electrical_work THEN 'electrical_certificate' ELSE 'completion_photo' END,'stage',CASE WHEN includes_electrical_work THEN 'electrical-stage' ELSE 'completion-photo-stage' END) INTO requirement FROM app.job_proof_statement WHERE tenant_id=t AND job_id=j ORDER BY revision DESC LIMIT 1;

 ELSIF TG_TABLE_NAME='stage_completion' THEN
  SELECT jsonb_build_object('requiredEvidenceType',CASE WHEN includes_electrical_work THEN 'electrical_certificate' ELSE 'completion_photo' END,'stage',CASE WHEN includes_electrical_work THEN 'electrical-stage' ELSE 'completion-photo-stage' END) INTO requirement FROM app.job_proof_statement WHERE tenant_id=t AND job_id=j ORDER BY revision DESC LIMIT 1;

  SELECT id INTO anchor FROM app.scope_identity WHERE tenant_id=t AND job_id=j AND state='confirmed' ORDER BY created_at,id LIMIT 1;
  IF NEW.scope_item_id IS DISTINCT FROM anchor THEN RETURN NEW; END IF;
  -- evidence_link is runtime-only except for 0546's existing tenant-scoped,
  -- flag-gated owner read policy; open it for this one read, then restore it.
  prior_read:=current_setting('app.customer_stage_read',true);
  PERFORM set_config('app.customer_stage_read','on',true);
  SELECT obj.* INTO e FROM app.evidence_link l JOIN app.evidence_object obj ON(obj.tenant_id,obj.job_id,obj.id)=(l.tenant_id,l.job_id,l.evidence_id)
   JOIN app.evidence_upload u ON(u.tenant_id,u.job_id,u.id,u.scope_item_id)=(obj.tenant_id,obj.job_id,obj.upload_id,obj.scope_item_id)
   WHERE l.tenant_id=t AND l.job_id=j AND l.id=NEW.evidence_link_id AND obj.scope_item_id=anchor
    AND obj.evidence_type=requirement->>'requiredEvidenceType' AND obj.kind='original' AND u.state='verified' AND u.object_version_id=obj.object_version_id
    AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=obj.id);
  PERFORM set_config('app.customer_stage_read',coalesce(prior_read,''),true);
  IF e.id IS NULL OR NEW.scope_item_id IS DISTINCT FROM anchor OR NEW.stage IS DISTINCT FROM requirement->>'stage'
   OR NOT app.job_proof_original_intact(e.tenant_id,e.job_id,e.scope_item_id,e.upload_id,e.object_key,e.object_version_id,e.sha256,e.byte_length)
  THEN RAISE EXCEPTION 'PROOF_NOT_FINAL' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_job_proof_source() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_job_proof_source() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER "A00_job_proof_authority" BEFORE INSERT ON app.evidence_upload FOR EACH ROW EXECUTE FUNCTION app.guard_job_proof_source();
CREATE TRIGGER "A00_job_proof_authority" BEFORE INSERT ON app.stage_completion FOR EACH ROW EXECUTE FUNCTION app.guard_job_proof_source();
CREATE TRIGGER "A00_job_proof_authority" BEFORE INSERT ON app.evidence_invalidation FOR EACH ROW EXECUTE FUNCTION app.guard_job_proof_source();

CREATE FUNCTION app.guard_final_lock_proof_statement() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE s app.job_proof_statement; binding app.final_account_proof_statement; requirement jsonb; anchor uuid; canonical_source text; invalidations text; expected_hash text; prior_read text; current_proof boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('job-proof:'||NEW.tenant_id::text||':'||NEW.job_id::text,0));
 SELECT * INTO s FROM app.job_proof_statement WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id ORDER BY revision DESC LIMIT 1;
 SELECT * INTO binding FROM app.final_account_proof_statement WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND revision_id=NEW.final_account_revision_id;
 IF s.id IS NULL THEN RETURN NEW; END IF;
 IF binding.statement_id IS DISTINCT FROM s.id
  OR NOT EXISTS(SELECT 1 FROM app.final_account_revision r WHERE r.tenant_id=NEW.tenant_id AND r.job_id=NEW.job_id AND r.id=binding.revision_id AND r.source_hash=binding.source_hash)
 THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT' USING ERRCODE='40001'; END IF;
 requirement:=jsonb_build_object('requiredEvidenceType',CASE WHEN s.includes_electrical_work THEN 'electrical_certificate' ELSE 'completion_photo' END,'stage',CASE WHEN s.includes_electrical_work THEN 'electrical-stage' ELSE 'completion-photo-stage' END);
 SELECT id INTO anchor FROM app.scope_identity WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND state='confirmed' ORDER BY created_at,id LIMIT 1;
 -- Links, completions and reviews use 0546's tenant-scoped, flag-gated owner read; restore the flag after.
 prior_read:=current_setting('app.customer_stage_read',true);
 PERFORM set_config('app.customer_stage_read','on',true);
 SELECT EXISTS(
  SELECT 1 FROM app.final_account_proof p
  JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.id,e.scope_item_id,e.evidence_type,e.object_version_id,e.sha256)=(p.tenant_id,p.job_id,p.evidence_id,p.scope_item_id,p.evidence_type,p.object_version_id,p.sha256)
  JOIN app.evidence_upload u ON(u.tenant_id,u.job_id,u.id,u.scope_item_id)=(e.tenant_id,e.job_id,e.upload_id,e.scope_item_id)
  JOIN app.evidence_link l ON(l.tenant_id,l.job_id,l.scope_item_id,l.evidence_id)=(e.tenant_id,e.job_id,e.scope_item_id,e.id)
  JOIN app.stage_completion c ON(c.tenant_id,c.job_id,c.scope_item_id,c.evidence_link_id)=(l.tenant_id,l.job_id,l.scope_item_id,l.id)
  WHERE p.tenant_id=NEW.tenant_id AND p.job_id=NEW.job_id AND p.final_account_revision_id=NEW.final_account_revision_id
   AND p.mandatory AND e.kind='original' AND e.scope_item_id=anchor AND e.evidence_type=requirement->>'requiredEvidenceType'
   AND c.stage=requirement->>'stage' AND u.state='verified' AND u.object_version_id=e.object_version_id
   AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=e.tenant_id AND i.evidence_id=e.id)
   AND app.job_proof_original_intact(e.tenant_id,e.job_id,e.scope_item_id,e.upload_id,e.object_key,e.object_version_id,e.sha256,e.byte_length)
   AND NOT EXISTS(SELECT 1 FROM app.stage_review_event rv WHERE rv.tenant_id=c.tenant_id AND rv.stage_completion_id=c.id)
   AND NOT EXISTS(SELECT 1 FROM app.stage_completion newer WHERE newer.tenant_id=c.tenant_id AND newer.supersedes_completion_id=c.id)
 ) INTO current_proof;
 PERFORM set_config('app.customer_stage_read',coalesce(prior_read,''),true);
 IF NOT current_proof THEN RAISE EXCEPTION 'FINAL_ACCOUNT_SOURCE_CHANGED' USING ERRCODE='23514'; END IF;
 -- Recompute the explicit source from immutable revision rows; a forged binding
 -- or issue_blocked=false flag never substitutes for the original source bytes.
 SELECT app.final_lock_canonical(jsonb_build_object(
  'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',line_kind,'sourceId',source_id,'scopeItemId',scope_item_id,'commercialRevisionId',commercial_revision_id,'description',description,'netPence',net_pence,'approvalId',approval_id) ORDER BY line_kind,source_id) FROM app.final_account_line WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND final_account_revision_id=NEW.final_account_revision_id),'[]'::jsonb),
  'proof',coalesce((SELECT jsonb_agg(jsonb_build_object('evidenceId',evidence_id,'objectVersionId',object_version_id,'scopeItemId',scope_item_id,'evidenceType',evidence_type,'sha256',sha256,'mandatory',mandatory) ORDER BY scope_item_id,evidence_type,evidence_id) FROM app.final_account_proof WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND final_account_revision_id=NEW.final_account_revision_id),'[]'::jsonb),
  'mandatoryProofRequirements',jsonb_build_array(jsonb_build_object('scopeItemId',anchor,'evidenceType',requirement->>'requiredEvidenceType')),
  'taxPolicyVersion','candidate_m1_standard_v1')) INTO canonical_source;
 SELECT '['||coalesce(string_agg('{"id":'||to_json(i.id::text)::text||',"evidence_id":'||to_json(i.evidence_id::text)::text||'}',',' ORDER BY i.id),'')||']' INTO invalidations
 FROM app.evidence_invalidation i JOIN app.evidence_object e ON(e.tenant_id,e.id)=(i.tenant_id,i.evidence_id)
 WHERE i.tenant_id=NEW.tenant_id AND e.job_id=NEW.job_id;
 expected_hash:=encode(sha256(convert_to('{"source":'||to_json(canonical_source)::text||',"proofStatementId":'||to_json(s.id::text)::text||',"proofInvalidations":'||invalidations||'}','UTF8')),'hex');
 IF binding.source_hash IS DISTINCT FROM expected_hash THEN RAISE EXCEPTION 'FINAL_ACCOUNT_SOURCE_CHANGED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_final_lock_proof_statement() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_final_lock_proof_statement() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER "A00_proof_statement" BEFORE INSERT ON app.final_account_lock FOR EACH ROW EXECUTE FUNCTION app.guard_final_lock_proof_statement();

-- No runtime/generic writer may manufacture or mutate statement receipts.
CREATE FUNCTION app.guard_job_proof_receipt() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.command_type='proof.statement') OR
    (TG_OP='UPDATE' AND (OLD.command_type='proof.statement' OR NEW.command_type='proof.statement')) OR
    (TG_OP='DELETE' AND OLD.command_type='proof.statement') THEN
  IF TG_OP<>'INSERT' OR current_user<>'jobguard_migration' OR NEW.status<>'succeeded'
  THEN RAISE EXCEPTION 'PROOF_STATEMENT_RECEIPT_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_job_proof_receipt() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_job_proof_receipt() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER proof_statement_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON app.command_receipt
 FOR EACH ROW EXECUTE FUNCTION app.guard_job_proof_receipt();

-- Both exact replay and the deferred commit guard validate the same immutable link.
CREATE FUNCTION app.validate_job_proof_receipt(t uuid,cid uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $$
DECLARE r app.command_receipt; s app.job_proof_statement; j uuid; expected jsonb; request jsonb;
BEGIN
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 j:=(r.result->>'jobId')::uuid;
 SELECT * INTO s FROM app.job_proof_statement WHERE tenant_id=t AND job_id=j AND id=(r.result->'statement'->>'id')::uuid;
 expected:=jsonb_build_object('version','practice-proof-statement-result.v1','jobId',j,'statement',jsonb_build_object('id',s.id,'includesElectricalWork',s.includes_electrical_work,'membershipId',s.membership_id,'recordedAt',s.recorded_at));
 request:=jsonb_build_object('version','practice-proof-command.v1','action','answer_statement','commandId',cid,'includesElectricalWork',s.includes_electrical_work);
 IF s.id IS NULL OR r.command_type IS DISTINCT FROM 'proof.statement' OR r.status IS DISTINCT FROM 'succeeded'
  OR NOT EXISTS(SELECT 1 FROM app.watchdog_command_identity i WHERE i.tenant_id=t AND i.command_id=cid AND i.job_id=j AND i.command_type='proof.statement' AND i.request_hash=r.request_hash)
  OR r.result IS DISTINCT FROM expected OR r.semantic_key IS DISTINCT FROM 'proof-statement:'||j::text||':'||cid::text
  OR r.request_hash IS DISTINCT FROM app.final_lock_hash(jsonb_build_object('jobId',j,'actorId',r.actor_membership_id,'command',request))
  OR NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=t AND e.event_type='proof.statement_recorded'
   AND e.version='audit.v2' AND e.payload->'references'->>'auditTrust'='checked_operation'
   AND e.actor_ref='membership:'||r.actor_membership_id::text AND e.subject_type='job' AND e.subject_ref=j::text
   AND e.payload->'references'->>'statementId'=s.id::text AND e.payload->'references'->>'commandId'=cid::text
   AND e.payload->'hashes'->>'requestHash'=r.request_hash)
 THEN RAISE EXCEPTION 'PROOF_STATEMENT_RECEIPT_INVALID' USING ERRCODE='23514'; END IF;
END $$;
ALTER FUNCTION app.validate_job_proof_receipt(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.validate_job_proof_receipt(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE FUNCTION app.require_completed_job_proof_statement() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.command_type='proof.statement' THEN PERFORM app.validate_job_proof_receipt(NEW.tenant_id,NEW.command_id); END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.require_completed_job_proof_statement() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_completed_job_proof_statement() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE CONSTRAINT TRIGGER proof_statement_receipt_complete AFTER INSERT OR UPDATE ON app.command_receipt
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_completed_job_proof_statement();
CREATE CONSTRAINT TRIGGER proof_statement_identity_complete AFTER INSERT ON app.watchdog_command_identity
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_completed_job_proof_statement();

-- Replacement is an audited checked evaluation, never an approval or a deletion.
CREATE FUNCTION app.retire_replaced_job_proof_findings(j uuid,c uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; sid uuid; anchor uuid; f record; receipt app.command_receipt;
BEGIN
 PERFORM app.job_proof_authority(j,true); a:=app.current_actor();
 SELECT * INTO receipt FROM app.command_receipt WHERE tenant_id=t AND command_id=c;
 IF receipt.command_type IS DISTINCT FROM 'finding.evaluate' OR receipt.status IS DISTINCT FROM 'processing'
  OR receipt.actor_membership_id IS DISTINCT FROM a OR receipt.created_at IS DISTINCT FROM transaction_timestamp()
  OR receipt.semantic_key IS DISTINCT FROM 'finding-evaluate:'||j::text||':'||c::text
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT id INTO sid FROM app.job_proof_statement WHERE tenant_id=t AND job_id=j ORDER BY revision DESC LIMIT 1;
 IF NOT EXISTS(SELECT 1 FROM app.job_proof_statement WHERE tenant_id=t AND id=sid AND includes_electrical_work=false) THEN RETURN; END IF;
 SELECT id INTO anchor FROM app.scope_identity WHERE tenant_id=t AND job_id=j AND state='confirmed' ORDER BY created_at,id LIMIT 1;
 FOR f IN SELECT id FROM app.job_finding WHERE tenant_id=t AND job_id=j AND kind='required_proof' AND subject_ref=anchor::text||':electrical_certificate' LOOP
  IF NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=t AND e.event_type='proof.requirement_replaced'
   AND e.version='audit.v2' AND e.payload->'references'->>'auditTrust'='checked_operation'
   AND e.payload->'references'->>'statementId'=sid::text AND e.payload->'references'->>'findingId'=f.id::text) THEN
   PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||a::text,
    'eventType','proof.requirement_replaced','subjectType','job','subjectRef',j::text,
    'payload',jsonb_build_object('references',jsonb_build_object('statementId',sid,'findingId',f.id,'commandId',c)))),'checked_operation');
  END IF;
 END LOOP;
END $$;
ALTER FUNCTION app.retire_replaced_job_proof_findings(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.retire_replaced_job_proof_findings(uuid,uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.retire_replaced_job_proof_findings(uuid,uuid) TO jobguard_runtime;
CREATE FUNCTION app.retired_job_proof_findings(j uuid) RETURNS SETOF uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; sid uuid;
BEGIN
 PERFORM app.job_proof_authority(j,false);
 SELECT id INTO sid FROM app.job_proof_statement WHERE tenant_id=t AND job_id=j ORDER BY revision DESC LIMIT 1;
 RETURN QUERY SELECT f.id FROM app.job_finding f WHERE f.tenant_id=t AND f.job_id=j
  AND EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=t AND e.subject_type='job' AND e.subject_ref=j::text
   AND e.event_type='proof.requirement_replaced' AND e.version='audit.v2' AND e.payload->'references'->>'auditTrust'='checked_operation'
   AND e.payload->'references'->>'statementId'=sid::text AND e.payload->'references'->>'findingId'=f.id::text);
END $$;
ALTER FUNCTION app.retired_job_proof_findings(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.retired_job_proof_findings(uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.retired_job_proof_findings(uuid) TO jobguard_runtime;
COMMIT;
