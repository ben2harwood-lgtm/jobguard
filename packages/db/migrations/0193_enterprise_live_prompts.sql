BEGIN;
-- ENT-8A-P. Synthetic command-owned facts; no backfill or commercial authorization.
CREATE TABLE app.extra_prompt_rule_settings (
 tenant_id uuid NOT NULL, id uuid NOT NULL, client_contract_version_id uuid NOT NULL,
 version text NOT NULL CHECK(version='extra-prompt-rule-settings.v1'),
 factor_numerator numeric(30,0) NOT NULL CHECK(factor_numerator>0), factor_denominator numeric(30,0) NOT NULL CHECK(factor_denominator>0),
 recognition jsonb NOT NULL CHECK(jsonb_typeof(recognition)='array'),
 content_hash char(64) NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,client_contract_version_id),
 FOREIGN KEY(tenant_id,client_contract_version_id) REFERENCES app.client_contract_version(tenant_id,id)
);
CREATE TABLE app.extra_prompt (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 work_order_id uuid NOT NULL, revision_id uuid NOT NULL, baseline_hash char(64) NOT NULL,
 rule text NOT NULL CHECK(rule IN('a','b','c','d')), rule_version text NOT NULL,
 schema_version text NOT NULL DEFAULT 'extra-prompt.v1' CHECK(schema_version='extra-prompt.v1'),
 settings_id uuid, input_hash char(64) NOT NULL, coalescing_key text NOT NULL, work_identity text,
 prompt_hash char(64) NOT NULL, command_id uuid NOT NULL,
 surfaced_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,job_id,coalescing_key),
 CHECK(baseline_hash ~ '^[a-f0-9]{64}$' AND input_hash ~ '^[a-f0-9]{64}$' AND prompt_hash ~ '^[a-f0-9]{64}$'),
 FOREIGN KEY(tenant_id,work_order_id,job_id) REFERENCES app.work_order(tenant_id,id,job_id),
 FOREIGN KEY(tenant_id,work_order_id,revision_id) REFERENCES app.work_order_revision(tenant_id,work_order_id,id),
 FOREIGN KEY(tenant_id,settings_id) REFERENCES app.extra_prompt_rule_settings(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id)
);
CREATE TABLE app.extra_prompt_citation (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), prompt_id uuid NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN('observation','materials','visit','closeout')),
 source_id uuid NOT NULL, source_hash char(64) NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 evidence_id uuid, object_version_id text, locator jsonb,
 command_id uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,prompt_id,source_kind,source_id),
 CHECK((source_kind='observation')=(evidence_id IS NOT NULL AND object_version_id IS NOT NULL AND locator IS NOT NULL)),
 FOREIGN KEY(tenant_id,job_id,prompt_id) REFERENCES app.extra_prompt(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,evidence_id) REFERENCES app.evidence_object(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id)
);
CREATE TABLE app.prompt_resolution (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), prompt_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('created','coalesced','dismissed')), variation_id uuid,
 prompt_hash char(64) NOT NULL, reason text, actor_membership_id uuid NOT NULL, command_id uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,prompt_id), UNIQUE(tenant_id,command_id),
 CHECK((kind='dismissed' AND variation_id IS NULL AND length(btrim(reason)) BETWEEN 1 AND 2000) OR (kind IN('created','coalesced') AND variation_id IS NOT NULL AND reason IS NULL)),
 FOREIGN KEY(tenant_id,job_id,prompt_id) REFERENCES app.extra_prompt(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id)
);
CREATE TABLE app.materials_issue_fact (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 version text NOT NULL CHECK(version='materials-issue.v1'), fact_kind text NOT NULL CHECK(fact_kind IN('issue','return','correction')), source_id text NOT NULL, event_id text NOT NULL,
 work_identity text NOT NULL, unit text NOT NULL, quantity numeric(30,6) NOT NULL CHECK(quantity>=0 AND (fact_kind<>'issue' OR quantity>0)),
 occurred_at_micros numeric(30,0) NOT NULL, source_hash char(64) NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 command_id uuid NOT NULL, actor_membership_id uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,source_id,event_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.extra_completion_observation (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 evidence_id uuid NOT NULL, object_version_id text NOT NULL, sha256 char(64) NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN('completion_note','completion_photo')), source_bytes bytea NOT NULL,
 source_text text, photo_tags jsonb, locator jsonb NOT NULL, work_identity text NOT NULL,
 command_id uuid NOT NULL, actor_membership_id uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,command_id),
 CHECK(octet_length(source_bytes) BETWEEN 1 AND 25000000 AND sha256=encode(pg_catalog.sha256(source_bytes),'hex')),
 CHECK((source_kind='completion_note' AND source_text IS NOT NULL AND octet_length(source_text)<=100000 AND source_bytes=convert_to(source_text,'UTF8') AND photo_tags IS NULL)
 OR (source_kind='completion_photo' AND source_text IS NULL AND photo_tags IS NOT NULL AND jsonb_typeof(photo_tags)='array')),
 FOREIGN KEY(tenant_id,job_id,evidence_id) REFERENCES app.evidence_object(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.extra_office_prompt_signal (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), prompt_id uuid NOT NULL,
 variation_id uuid NOT NULL, origin_hash char(64) NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,prompt_id,variation_id),
 FOREIGN KEY(tenant_id,job_id,prompt_id) REFERENCES app.extra_prompt(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['extra_prompt_rule_settings','extra_prompt','extra_prompt_citation','prompt_resolution','materials_issue_fact','extra_completion_observation','extra_office_prompt_signal'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access',n);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;

-- Active identity and covering grants, deliberately independent of commercial capability for historical reads.
CREATE FUNCTION app.lp_authority(p_session uuid,p_job uuid,p_action text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; identity_user uuid; member_role text; role_set text[];
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 SELECT s.membership_id,s.identity_user_id INTO a,identity_user FROM app.contractor_session(p_session) s WHERE s.tenant_id=t;
 -- Lock the session row so a revocation cannot pass this command's recheck.
 PERFORM 1 FROM control_plane.contractor_practice_session s WHERE s.session_digest=app.contractor_practice_session_digest(p_session) FOR SHARE;
 SELECT m.role INTO member_role FROM app.membership m JOIN app.contractor_member c ON(c.tenant_id,c.membership_id)=(m.tenant_id,m.id)
 WHERE m.tenant_id=t AND m.id=a AND m.identity_user_id=identity_user AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE(r.tenant_id,r.membership_id)=(m.tenant_id,m.id));
 role_set:=CASE p_action WHEN 'materials' THEN ARRAY['finance','owner'] WHEN 'list' THEN ARRAY['supervisor'] WHEN 'endcheck' THEN ARRAY['owner'] ELSE ARRAY['supervisor','surveyor','commercial_manager'] END;
 IF member_role IS NULL OR NOT member_role=ANY(role_set) OR NOT EXISTS(
  SELECT 1 FROM app.job j JOIN app.work_order w ON(w.tenant_id,w.job_id)=(j.tenant_id,j.id)
  JOIN app.job_commercial_track tr ON(tr.tenant_id,tr.job_id)=(j.tenant_id,j.id)
  JOIN app.team tm ON tm.tenant_id=j.tenant_id AND tm.id=app.contractor_job_team(j.id)
  JOIN app.org_unit b ON(b.tenant_id,b.id)=(tm.tenant_id,tm.branch_id)
  JOIN app.role_grant g ON g.tenant_id=j.tenant_id AND g.membership_id=a AND g.role=member_role
  WHERE j.tenant_id=t AND j.id=p_job AND j.provenance='work_order' AND tr.job_track='contractor' AND tr.environment='synthetic_demo'
  AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id))
  AND (g.scope_kind='tenant' AND g.scope_id=t OR g.scope_kind='team' AND g.scope_id=tm.id OR g.scope_kind='branch' AND g.scope_id=b.id OR g.scope_kind='region' AND g.scope_id=b.parent_id))
 THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.contractor_session(p_session) s WHERE s.tenant_id=t AND s.membership_id=a) THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN('list','detail') THEN
  IF NOT coalesce(app.contractor_member_active(a),false) THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
  -- Serialize before taking the job SHARE lock: confirmation may upgrade it via scope writes.
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_job::text,417));
  PERFORM app.require_watchdog_live(p_job);
  -- Serializes baseline imports; their UPDATE of work_order_current waits for this lock.
  PERFORM 1 FROM app.work_order_current c JOIN app.work_order w ON(w.tenant_id,w.id)=(c.tenant_id,c.work_order_id) WHERE w.tenant_id=t AND w.job_id=p_job FOR SHARE OF c;
  IF EXISTS(SELECT 1 FROM app.work_order w JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id) JOIN app.work_order_revision r ON(r.tenant_id,r.id)=(c.tenant_id,c.revision_id) WHERE w.tenant_id=t AND w.job_id=p_job AND r.status<>'ordered') THEN RAISE EXCEPTION 'JOB_NOT_LIVE'; END IF;
 END IF;
 RETURN a;
END $$;

CREATE FUNCTION app.lp_surface(p_job uuid,p_command uuid,p_rule text,p_key text,p_work text,p_sources jsonb,p_settings uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; w uuid; rev uuid; bh text; input_hash text; pid uuid; x jsonb;
BEGIN
 SELECT o.id,c.revision_id,r.content_hash INTO w,rev,bh FROM app.work_order o JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(o.tenant_id,o.id)
 JOIN app.work_order_revision r ON(r.tenant_id,r.id)=(c.tenant_id,c.revision_id) WHERE o.tenant_id=t AND o.job_id=p_job;
 input_hash:=encode(sha256(convert_to(p_sources::text,'UTF8')),'hex');
 SELECT id INTO pid FROM app.extra_prompt WHERE tenant_id=t AND job_id=p_job AND coalescing_key=p_key;
 IF pid IS NULL THEN
  pid:=gen_random_uuid();
  INSERT INTO app.extra_prompt(tenant_id,job_id,id,work_order_id,revision_id,baseline_hash,rule,rule_version,settings_id,input_hash,coalescing_key,work_identity,prompt_hash,command_id)
  VALUES(t,p_job,pid,w,rev,bh,p_rule,CASE p_rule WHEN 'a' THEN 'completion-work-absence.v1' WHEN 'b' THEN 'materials-strict-excess.v1' WHEN 'c' THEN 'visit-exact-factor.v1' ELSE 'closeout-job-wide.v1' END,p_settings,input_hash,p_key,p_work,
   encode(sha256(convert_to(jsonb_build_array('extra-prompt.v1',t,p_job,pid,rev,bh,p_rule,p_settings,input_hash,p_key)::text,'UTF8')),'hex'),p_command);
 END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_sources) LOOP
  INSERT INTO app.extra_prompt_citation(tenant_id,job_id,prompt_id,source_kind,source_id,source_hash,evidence_id,object_version_id,locator,command_id)
  VALUES(t,p_job,pid,x->>'kind',(x->>'id')::uuid,x->>'hash',(x->>'evidenceId')::uuid,x->>'objectVersion',x->'locator',p_command) ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN pid;
END $$;

-- Bounded PNG tEXt parser. This is explicit embedded metadata, never image recognition.
-- Only the documented keyword is interpreted; duplicate tags/chunks, bad CRC, invalid JSON,
-- truncation and non-PNG bytes refuse. Original bytes were finalized and hashed independently.
CREATE FUNCTION app.lp_png_completion_tags(p_bytes bytea) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE pos integer:=8; size integer:=octet_length(p_bytes); len bigint; kind bytea; data bytea; prefix bytea:=convert_to('jobguard:completion-work','UTF8')||decode('00','hex');
 tags jsonb; crc bigint; expected bigint; i integer; bit_index integer; chunks integer:=0; saw_end boolean:=false;
BEGIN
 IF size<20 OR size>25000000 OR substring(p_bytes FROM 1 FOR 8)<>decode('89504e470d0a1a0a','hex') THEN RETURN NULL; END IF;
 WHILE pos<size LOOP
  chunks:=chunks+1; IF chunks>10000 OR pos+12>size THEN RETURN NULL; END IF;
  len:=get_byte(p_bytes,pos)::bigint*16777216+get_byte(p_bytes,pos+1)::bigint*65536+get_byte(p_bytes,pos+2)::bigint*256+get_byte(p_bytes,pos+3);
  IF len>25000000 OR pos+12+len>size THEN RETURN NULL; END IF;
  kind:=substring(p_bytes FROM pos+5 FOR 4);
  IF chunks=1 AND (kind<>convert_to('IHDR','UTF8') OR len<>13) THEN RETURN NULL; END IF;
  IF kind=convert_to('tEXt','UTF8') THEN
   data:=substring(p_bytes FROM pos+9 FOR len::integer);
   IF substring(data FROM 1 FOR octet_length(prefix))=prefix THEN
    IF tags IS NOT NULL OR len>65536 OR len<=octet_length(prefix) THEN RETURN NULL; END IF;
    crc:=4294967295;
    FOR i IN (pos+4)..(pos+7+len::integer) LOOP
     crc:=crc # get_byte(p_bytes,i)::bigint;
     FOR bit_index IN 1..8 LOOP crc:=CASE WHEN (crc & 1)=1 THEN (crc >> 1) # 3988292384 ELSE crc >> 1 END; END LOOP;
    END LOOP;
    crc:=crc # 4294967295;
    expected:=get_byte(p_bytes,pos+8+len::integer)::bigint*16777216+get_byte(p_bytes,pos+9+len::integer)::bigint*65536+get_byte(p_bytes,pos+10+len::integer)::bigint*256+get_byte(p_bytes,pos+11+len::integer);
    IF crc<>expected THEN RETURN NULL; END IF;
    BEGIN tags:=convert_from(substring(data FROM octet_length(prefix)+1),'LATIN1')::jsonb; EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
    IF jsonb_typeof(tags)<>'array' THEN RETURN NULL; END IF;
    IF jsonb_array_length(tags) NOT BETWEEN 1 AND 1000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(tags) x WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}') NOT BETWEEN 1 AND 1000 OR length(btrim(x#>>'{}'))=0)
     OR (SELECT count(*) FROM jsonb_array_elements(tags))<>(SELECT count(DISTINCT x) FROM jsonb_array_elements(tags) x) THEN RETURN NULL; END IF;
   END IF;
  END IF;
  pos:=pos+12+len::integer;
  IF kind=convert_to('IEND','UTF8') THEN saw_end:=len=0 AND pos=size; EXIT; END IF;
 END LOOP;
 RETURN CASE WHEN saw_end THEN tags ELSE NULL END;
END $$;

-- The evaluator consumes only persisted rows. Missing mappings/standards/factor are unevaluated.
CREATE FUNCTION app.lp_evaluate(p_job uuid,p_command uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; rev uuid; contract uuid; cfg app.extra_prompt_rule_settings; x record; sources jsonb; pid uuid; ids jsonb:='[]'; total numeric; count_lines integer; valid_lines integer; quarantines integer:=0; unevaluated integer:=0;
BEGIN
 SELECT c.revision_id,w.contract_version_id INTO rev,contract FROM app.work_order w JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id) WHERE w.tenant_id=t AND w.job_id=p_job;
 SELECT * INTO cfg FROM app.extra_prompt_rule_settings WHERE tenant_id=t AND client_contract_version_id=contract;
 FOR x IN SELECT f.work_identity,f.unit,sum(f.quantity) issued FROM app.materials_issue_fact f WHERE f.tenant_id=t AND f.job_id=p_job GROUP BY f.work_identity,f.unit ORDER BY f.work_identity,f.unit LOOP
  -- A contradictory same-time source pair is quarantined; arrival order is never a winner.
  IF EXISTS(SELECT 1 FROM app.materials_issue_fact f WHERE f.tenant_id=t AND f.job_id=p_job AND f.work_identity=x.work_identity AND f.unit=x.unit AND f.fact_kind<>'issue') OR EXISTS(SELECT 1 FROM app.materials_issue_fact f JOIN app.materials_issue_fact g ON(g.tenant_id,g.job_id,g.source_id,g.work_identity,g.unit,g.occurred_at_micros)=(f.tenant_id,f.job_id,f.source_id,f.work_identity,f.unit,f.occurred_at_micros)
    WHERE f.tenant_id=t AND f.job_id=p_job AND f.work_identity=x.work_identity AND f.unit=x.unit AND f.id<>g.id AND f.quantity<>g.quantity) THEN quarantines:=quarantines+1; CONTINUE; END IF;
  SELECT sum(l.quantity::numeric) INTO total FROM app.work_order_line l WHERE l.tenant_id=t AND l.job_id=p_job AND l.revision_id=rev AND l.sor_code=x.work_identity AND l.unit=x.unit;
  IF total IS NULL THEN unevaluated:=unevaluated+1; CONTINUE; END IF;
  IF x.issued<=total THEN CONTINUE; END IF;
  SELECT jsonb_agg(jsonb_build_object('kind','materials','id',f.id,'hash',f.source_hash) ORDER BY f.id) INTO sources FROM app.materials_issue_fact f WHERE f.tenant_id=t AND f.job_id=p_job AND f.work_identity=x.work_identity AND f.unit=x.unit;
  pid:=app.lp_surface(p_job,p_command,'b',jsonb_build_array('excess.v1',x.work_identity,x.unit)::text,x.work_identity,sources); ids:=ids||jsonb_build_array(pid);
 END LOOP;
 SELECT count(*),count(*) FILTER(WHERE i.standard_minutes>0 AND l.quantity::numeric>0),sum(l.quantity::numeric*i.standard_minutes)
 INTO count_lines,valid_lines,total FROM app.work_order_line l JOIN app.sor_item i ON(i.tenant_id,i.version_id,i.code)=(l.tenant_id,l.sor_version_id,l.sor_code) WHERE l.tenant_id=t AND l.job_id=p_job AND l.revision_id=rev;
 IF cfg.id IS NOT NULL AND count_lines>0 AND count_lines=valid_lines AND total>0 THEN
  FOR x IN SELECT v.id,v.started_at,v.completed_at FROM app.site_visit v WHERE v.tenant_id=t AND v.job_id=p_job AND v.completed_at>v.started_at ORDER BY v.id LOOP
   IF extract(epoch FROM(x.completed_at-x.started_at))*1000000*cfg.factor_denominator>total*60000000*cfg.factor_numerator THEN
    sources:=jsonb_build_array(jsonb_build_object('kind','visit','id',x.id,'hash',encode(sha256(convert_to(jsonb_build_array(x.id,extract(epoch FROM x.started_at)*1000000,extract(epoch FROM x.completed_at)*1000000)::text,'UTF8')),'hex')));
    pid:=app.lp_surface(p_job,p_command,'c','visit.v1:'||x.id,NULL,sources,cfg.id); ids:=ids||jsonb_build_array(pid);
   END IF;
  END LOOP;
  SELECT unevaluated+count(*)::integer INTO unevaluated FROM app.site_visit WHERE tenant_id=t AND job_id=p_job AND (completed_at IS NULL OR completed_at<=started_at);
 ELSE
  SELECT unevaluated+count(*)::integer INTO unevaluated FROM app.site_visit WHERE tenant_id=t AND job_id=p_job;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.extra_origin WHERE tenant_id=t AND job_id=p_job) THEN
  FOR x IN SELECT a.id,a.site_visit_id FROM app.closeout_answer a WHERE a.tenant_id=t AND a.job_id=p_job AND a.answer='yes' ORDER BY a.id LOOP
   sources:=jsonb_build_array(jsonb_build_object('kind','closeout','id',x.id,'hash',encode(sha256(convert_to(jsonb_build_array(x.id,x.site_visit_id,'yes')::text,'UTF8')),'hex')));
   pid:=app.lp_surface(p_job,p_command,'d','closeout.v1:'||x.id,NULL,sources); ids:=ids||jsonb_build_array(pid);
  END LOOP;
 END IF;
 -- A note's UTF-8 preimage was checked at registration; recognition is an immutable explicit contract map.
 FOR x IN SELECT o.* FROM app.extra_completion_observation o JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.id,e.object_version_id,e.sha256)=(o.tenant_id,o.job_id,o.evidence_id,o.object_version_id,o.sha256)
 JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id) WHERE o.tenant_id=t AND o.job_id=p_job AND u.state='verified'
 AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE(i.tenant_id,i.evidence_id)=(e.tenant_id,e.id)) ORDER BY o.id LOOP
  IF cfg.id IS NULL OR EXISTS(SELECT 1 FROM app.work_order_line l WHERE l.tenant_id=t AND l.revision_id=rev AND l.sor_code=x.work_identity) THEN CONTINUE; END IF;
  IF (SELECT count(DISTINCT entry->>'workId') FROM jsonb_array_elements(cfg.recognition) entry CROSS JOIN LATERAL jsonb_array_elements_text(entry->'terms') term WHERE term=CASE WHEN x.source_kind='completion_photo' THEN x.locator->>'tag' ELSE x.locator->>'quote' END)<>1
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cfg.recognition) entry WHERE entry->>'workId'=x.work_identity AND entry->'terms' ? (CASE WHEN x.source_kind='completion_photo' THEN x.locator->>'tag' ELSE x.locator->>'quote' END)) THEN CONTINUE; END IF;
  sources:=jsonb_build_array(jsonb_build_object('kind','observation','id',x.id,'hash',x.sha256,'evidenceId',x.evidence_id,'objectVersion',x.object_version_id,'locator',x.locator));
  pid:=app.lp_surface(p_job,p_command,'a',jsonb_build_array('work.v1',x.work_identity)::text,x.work_identity,sources,cfg.id); ids:=ids||jsonb_build_array(pid);
 END LOOP;
 RETURN jsonb_build_object('promptIds',ids,'quarantinedComparisons',quarantines,'unevaluatedComparisons',unevaluated);
END $$;

-- These two routines return only scoped projections; no direct SELECT grant is needed.
CREATE FUNCTION app.lp_read(p_session uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; j uuid:=(p_input->>'jobId')::uuid; a uuid; result jsonb; lim integer:=coalesce((p_input->>'limit')::integer,50); x jsonb;
BEGIN
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

-- Revalidation at confirmation prevents historical citations becoming authority after invalidation.
CREATE FUNCTION app.lp_citations_valid(p_job uuid,p_prompt uuid) RETURNS boolean LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app.extra_prompt_citation WHERE tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND job_id=p_job AND prompt_id=p_prompt)
 AND NOT EXISTS(SELECT 1 FROM app.extra_prompt_citation c WHERE c.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND c.job_id=p_job AND c.prompt_id=p_prompt AND (
  (c.source_kind='observation' AND NOT EXISTS(SELECT 1 FROM app.extra_completion_observation o JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.id,e.object_version_id,e.sha256)=(o.tenant_id,o.job_id,o.evidence_id,o.object_version_id,o.sha256)
   JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
   WHERE(o.tenant_id,o.job_id,o.id,o.sha256,o.evidence_id,o.object_version_id,o.locator)=(c.tenant_id,c.job_id,c.source_id,c.source_hash,c.evidence_id,c.object_version_id,c.locator) AND u.state='verified' AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE(i.tenant_id,i.evidence_id)=(e.tenant_id,e.id))))
  OR (c.source_kind='materials' AND NOT EXISTS(SELECT 1 FROM app.materials_issue_fact f WHERE(f.tenant_id,f.job_id,f.id,f.source_hash)=(c.tenant_id,c.job_id,c.source_id,c.source_hash)))
  OR (c.source_kind='visit' AND NOT EXISTS(SELECT 1 FROM app.site_visit v WHERE(v.tenant_id,v.job_id,v.id)=(c.tenant_id,c.job_id,c.source_id) AND v.completed_at>v.started_at AND c.source_hash=encode(sha256(convert_to(jsonb_build_array(v.id,extract(epoch FROM v.started_at)*1000000,extract(epoch FROM v.completed_at)*1000000)::text,'UTF8')),'hex')))
  OR (c.source_kind='closeout' AND NOT EXISTS(SELECT 1 FROM app.closeout_answer a WHERE(a.tenant_id,a.job_id,a.id)=(c.tenant_id,c.job_id,c.source_id) AND a.answer='yes' AND c.source_hash=encode(sha256(convert_to(jsonb_build_array(a.id,a.site_visit_id,'yes')::text,'UTF8')),'hex')))))
$$;

CREATE FUNCTION app.lp_command(p_session uuid,p_input jsonb,p_source_bytes bytea DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; j uuid:=(p_input->>'jobId')::uuid; a uuid; cid uuid:=(p_input->>'commandId')::uuid;
 ver text:=p_input->>'version'; typ text; h text; old app.command_receipt; answer jsonb; evaluation jsonb; fact app.materials_issue_fact; source_hash text; source uuid;
 p app.extra_prompt; chosen uuid; n integer; v uuid:=gen_random_uuid(); scope uuid:=gen_random_uuid(); grant_id uuid; role_name text; origin_hash text; audits jsonb:='[]'; pid uuid; rev uuid; selected_identity text; excess_scope uuid; selected_unit text; settings app.extra_prompt_rule_settings; term text; original_bytes bytea; tags jsonb; source_kind text; expected_keys text[];
BEGIN
 typ:=CASE ver WHEN 'materials-issue.v1' THEN 'ImportMaterialsIssue' WHEN 'completion-observation.v1' THEN 'RegisterCompletionObservation' WHEN 'evaluate-live-prompts.v1' THEN 'EvaluateLivePrompts' WHEN 'confirm-prompt.v1' THEN 'ConfirmPrompt' WHEN 'dismiss-prompt.v1' THEN 'DismissPrompt' WHEN 'end-check.v1' THEN 'EndCheck' ELSE NULL END;
 IF typ IS NULL OR cid IS NULL OR j IS NULL THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
 a:=app.lp_authority(p_session,j,CASE WHEN typ='ImportMaterialsIssue' THEN 'materials' WHEN typ='EndCheck' THEN 'endcheck' ELSE 'resolve' END);
 IF typ='EndCheck' THEN RAISE EXCEPTION 'PROMPT_END_CHECK_HELD'; END IF;
 expected_keys:=CASE typ WHEN 'ImportMaterialsIssue' THEN ARRAY['version','commandId','jobId','sourceId','eventId','workIdentity','unit','quantity','occurredAtMicros','kind']
 WHEN 'RegisterCompletionObservation' THEN ARRAY['version','commandId','jobId','evidenceId','sha256','objectVersion','locator','workIdentity','sourceText']
 WHEN 'ConfirmPrompt' THEN ARRAY['version','commandId','jobId','promptId','promptHash','confirmedWorkIdentity','excessScopeItemId','existingExtraId']
 WHEN 'DismissPrompt' THEN ARRAY['version','commandId','jobId','promptId','promptHash','reason'] ELSE ARRAY['version','commandId','jobId'] END;
 IF p_input-expected_keys<>'{}'::jsonb OR EXISTS(SELECT 1 FROM unnest(expected_keys) k WHERE k NOT IN('confirmedWorkIdentity','excessScopeItemId','existingExtraId','sourceText') AND (NOT p_input ? k OR p_input->k='null'::jsonb))
  OR EXISTS(SELECT 1 FROM jsonb_each(p_input) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM CASE WHEN e.key='locator' THEN 'object' ELSE 'string' END)
 THEN RAISE EXCEPTION 'INVALID_PROMPT_COMMAND'; END IF;
 h:=encode(sha256(convert_to(jsonb_build_array(a,p_input)::text,'UTF8')),'hex');
 -- Shared tenant command namespace; authority/live check occurs BEFORE replay.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||cid::text,8189));
 PERFORM app.lp_authority(p_session,j,CASE WHEN typ='ImportMaterialsIssue' THEN 'materials' ELSE 'resolve' END);
 SELECT * INTO old FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF old.command_id IS NOT NULL THEN
  IF old.request_hash<>h OR old.command_type<>typ OR old.status<>'succeeded' THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
  PERFORM app.lp_authority(p_session,j,CASE WHEN typ='ImportMaterialsIssue' THEN 'materials' WHEN typ='EndCheck' THEN 'endcheck' ELSE 'resolve' END);
  RETURN jsonb_build_object('replay',true,'result',old.result,'audits','[]'::jsonb);
 END IF;
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(t,cid,typ,CASE WHEN typ='ConfirmPrompt' THEN 'extra-origin:'||j::text||':'||v::text ELSE 'live-prompt:'||j::text||':'||cid::text END,h,'processing',a);
 IF typ='ImportMaterialsIssue' THEN
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

CREATE FUNCTION app.lp_span_valid(p_text text,p_locator jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE s integer:=0; idx integer; ch text; actual text:=''; first_pos integer; last_pos integer; start_seen boolean:=false; end_seen boolean:=false;
BEGIN
 IF p_locator-ARRAY['kind','start','end','quote']<>'{}'::jsonb OR p_locator->>'kind' IS DISTINCT FROM 'text_span' OR jsonb_typeof(p_locator->'start') IS DISTINCT FROM 'number' OR jsonb_typeof(p_locator->'end') IS DISTINCT FROM 'number' OR jsonb_typeof(p_locator->'quote') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
 first_pos:=(p_locator->>'start')::integer; last_pos:=(p_locator->>'end')::integer;
 IF first_pos IS NULL OR last_pos IS NULL OR first_pos<0 OR last_pos<=first_pos THEN RETURN false; END IF;
 FOR idx IN 1..length(p_text) LOOP
  ch:=substring(p_text FROM idx FOR 1);
  start_seen:=start_seen OR s=first_pos; end_seen:=end_seen OR s=last_pos;
  IF s>=first_pos AND s<last_pos THEN actual:=actual||ch; END IF;
  s:=s+CASE WHEN ascii(ch)>65535 THEN 2 ELSE 1 END;
 END LOOP;
 RETURN start_seen AND (end_seen OR s=last_pos) AND s>=last_pos AND actual=p_locator->>'quote';
END $$;

CREATE FUNCTION app.lp_finish(p_session uuid,p_command uuid,p_result jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; r app.command_receipt;
BEGIN
 SELECT s.membership_id INTO a FROM app.contractor_session(p_session) s WHERE s.tenant_id=t;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF a IS NULL OR r.actor_membership_id IS DISTINCT FROM a OR r.status<>'succeeded' OR r.result IS DISTINCT FROM p_result OR r.command_type NOT IN('ImportMaterialsIssue','RegisterCompletionObservation','EvaluateLivePrompts','ConfirmPrompt','DismissPrompt')
 OR NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=t AND e.id=p_command AND e.event_type='contractor.prompt.command' AND e.actor_ref='membership:'||a AND e.payload->'hashes'->>'input'=r.request_hash
 AND e.payload->'hashes'->>'result'=encode(sha256(convert_to(p_result::text,'UTF8')),'hex')) THEN RAISE EXCEPTION 'PROMPT_CONFLICT'; END IF;
 -- No locks or business writes after the audit head.
END $$;

-- Completion of a visit is an internal source-arrival hook, NEVER job completion.
CREATE FUNCTION app.lp_visit_evaluate(p_actor uuid,p_job uuid,p_command uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR NOT coalesce(app.contractor_member_active(p_actor),false)
  OR NOT EXISTS(SELECT 1 FROM app.command_receipt r JOIN app.closeout_answer a ON(a.tenant_id,a.command_id)=(r.tenant_id,r.command_id)
   WHERE r.tenant_id=t AND r.command_id=p_command AND r.command_type='CompleteSiteVisit' AND r.status='processing' AND r.actor_membership_id=p_actor AND a.job_id=p_job AND a.membership_id=p_actor)
 THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_job::text,417));
 PERFORM app.require_watchdog_live(p_job);
 PERFORM 1 FROM app.work_order_current c JOIN app.work_order w ON(w.tenant_id,w.id)=(c.tenant_id,c.work_order_id) WHERE w.tenant_id=t AND w.job_id=p_job FOR SHARE OF c;
 RETURN app.lp_evaluate(p_job,p_command);
END $$;

CREATE FUNCTION app.lp_require_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r app.command_receipt;
BEGIN
 IF TG_TABLE_NAME='command_receipt' THEN
  IF NEW.command_type NOT IN('ImportMaterialsIssue','RegisterCompletionObservation','EvaluateLivePrompts','ConfirmPrompt','DismissPrompt') THEN RETURN NULL; END IF;
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
CREATE CONSTRAINT TRIGGER lp_command_audit AFTER INSERT ON app.command_receipt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.lp_require_audit();
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['extra_prompt','extra_prompt_citation','prompt_resolution','materials_issue_fact','extra_completion_observation'] LOOP
  EXECUTE format('CREATE CONSTRAINT TRIGGER lp_fact_audit AFTER INSERT ON app.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.lp_require_audit()',n);
 END LOOP;
END $$;

-- This runs on the REAL persisted office-origin write, including dismissed prompts.
CREATE FUNCTION app.lp_office_advisory() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE identity text; excess uuid; revision uuid;
BEGIN
 IF NEW.job_track<>'contractor' OR NEW.kind<>'office_entry' THEN RETURN NULL; END IF;
 SELECT sor_code,excess_of_scope_item_id,excess_of_revision_id INTO identity,excess,revision FROM app.variation WHERE(tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id);
 INSERT INTO app.extra_office_prompt_signal(tenant_id,job_id,prompt_id,variation_id,origin_hash)
 SELECT NEW.tenant_id,NEW.job_id,p.id,NEW.variation_id,NEW.origin_hash FROM app.extra_prompt p
 WHERE p.tenant_id=NEW.tenant_id AND p.job_id=NEW.job_id AND p.work_identity=identity AND p.surfaced_at<NEW.server_recorded_at
 AND (p.rule<>'b' AND excess IS NULL OR p.rule='b' AND revision=p.revision_id AND EXISTS(SELECT 1 FROM app.work_order_line l WHERE l.tenant_id=NEW.tenant_id AND l.job_id=NEW.job_id AND l.revision_id=p.revision_id AND l.scope_item_id=excess AND l.sor_code=identity))
 ON CONFLICT DO NOTHING;
 RETURN NULL;
END $$;
CREATE TRIGGER lp_office_advisory AFTER INSERT ON app.extra_origin FOR EACH ROW EXECUTE FUNCTION app.lp_office_advisory();

-- Only the held prompt branch changes; original hash framing and every other guard are retained.
CREATE OR REPLACE FUNCTION app.ent4b_origin_provenance() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE command app.command_receipt; grant_row app.role_grant; team_row app.team; branch_row app.org_unit;
 v app.variation; values_to_hash text[]; value_text text; encoded text:='extra-origin-hash.v1'||chr(10);
BEGIN
 IF NEW.job_track<>'contractor' THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE (tenant_id,id)=(NEW.tenant_id,NEW.job_id) AND provenance='work_order') THEN
  IF num_nonnulls(NEW.command_type,NEW.raising_grant_id,NEW.raiser_assigned,NEW.work_order_id,NEW.work_order_revision_id,NEW.site_visit_id,NEW.evidence_id,NEW.resident_confirmation_evidence_id,NEW.client_capture_id,NEW.origin_hash)<>0 THEN
   RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.kind='jobguard_surfaced_confirmed' THEN
  IF current_user<>'jobguard_migration' THEN RAISE EXCEPTION 'PROMPT_ORIGIN_HELD' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.prompt_resolution r JOIN app.extra_prompt p ON(p.tenant_id,p.job_id,p.id)=(r.tenant_id,r.job_id,r.prompt_id)
   JOIN app.command_receipt c ON(c.tenant_id,c.command_id)=(r.tenant_id,r.command_id)
   WHERE (r.tenant_id,r.job_id,r.variation_id,r.command_id,r.actor_membership_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id,NEW.command_id,NEW.raising_membership_id)
   AND r.kind='created' AND r.prompt_hash=p.prompt_hash AND p.surfaced_at<NEW.server_recorded_at AND c.command_type='ConfirmPrompt' AND c.status='processing'
   AND NEW.raising_role IN('supervisor','surveyor','commercial_manager') AND app.lp_citations_valid(NEW.job_id,p.id))
  THEN RAISE EXCEPTION 'PROMPT_ORIGIN_HELD' USING ERRCODE='23514'; END IF;
 END IF;
 SELECT * INTO command FROM app.command_receipt WHERE (tenant_id,command_id)=(NEW.tenant_id,NEW.command_id);
 NEW.command_type:=command.command_type;
 SELECT w.id,c.revision_id INTO NEW.work_order_id,NEW.work_order_revision_id FROM app.work_order w
 JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id) WHERE (w.tenant_id,w.job_id)=(NEW.tenant_id,NEW.job_id);
 IF NEW.work_order_id IS NULL OR NEW.work_order_revision_id IS NULL OR NOT app.contractor_member_active(NEW.raising_membership_id) THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
 END IF;
 SELECT * INTO grant_row FROM app.role_grant WHERE (tenant_id,id)=(NEW.tenant_id,NEW.raising_grant_id);
 SELECT * INTO team_row FROM app.team WHERE (tenant_id,id)=(NEW.tenant_id,app.contractor_job_team(NEW.job_id));
 SELECT * INTO branch_row FROM app.org_unit WHERE (tenant_id,id)=(NEW.tenant_id,team_row.branch_id);
 IF grant_row.id IS NULL OR grant_row.membership_id IS DISTINCT FROM NEW.raising_membership_id OR grant_row.role IS DISTINCT FROM NEW.raising_role
  OR EXISTS(SELECT 1 FROM app.role_grant_revocation WHERE (tenant_id,grant_id)=(NEW.tenant_id,grant_row.id))
  OR team_row.id IS NULL OR branch_row.id IS NULL
  OR NOT coalesce((grant_row.scope_kind='tenant' AND grant_row.scope_id=NEW.tenant_id)
    OR (grant_row.scope_kind='team' AND grant_row.scope_id=team_row.id)
    OR (grant_row.scope_kind='branch' AND grant_row.scope_id=branch_row.id)
    OR (grant_row.scope_kind='region' AND grant_row.scope_id=branch_row.parent_id),false) THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514';
 END IF;
 NEW.raiser_assigned:=app.contractor_job_assigned(NEW.raising_membership_id,NEW.job_id);
 IF NEW.site_visit_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.site_visit WHERE (tenant_id,id,job_id,membership_id)=(NEW.tenant_id,NEW.site_visit_id,NEW.job_id,NEW.raising_membership_id)) THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23503';
 END IF;
 SELECT sha256 INTO NEW.evidence_hash FROM app.evidence_object WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.evidence_id);
 IF NEW.resident_confirmation_evidence_id IS NOT NULL AND EXISTS(SELECT 1 FROM app.evidence_object WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.resident_confirmation_evidence_id) AND evidence_type<>'resident_confirmation') THEN RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23514'; END IF;
 SELECT * INTO v FROM app.variation WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id);
 IF v.excess_of_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.work_order_line WHERE (tenant_id,job_id,revision_id,scope_item_id)=(NEW.tenant_id,NEW.job_id,v.excess_of_revision_id,v.excess_of_scope_item_id)) THEN
  RAISE EXCEPTION 'INVALID_ORIGIN' USING ERRCODE='23503';
 END IF;
 -- Boolean spelling and microsecond timestamps are independent of session timezone/DateStyle.
 values_to_hash:=ARRAY[NEW.tenant_id::text,NEW.job_id::text,NEW.variation_id::text,NEW.job_track,NEW.kind,NEW.provenance,NEW.command_id::text,NEW.command_type,
  NEW.raising_membership_id::text,NEW.raising_role,NEW.raising_grant_id::text,CASE WHEN NEW.raiser_assigned THEN 'true' ELSE 'false' END,
  to_char(NEW.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),NEW.device_id,
  to_char(NEW.device_captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),NEW.client_capture_id::text,NEW.work_order_id::text,NEW.work_order_revision_id::text,
  NEW.site_visit_id::text,NEW.evidence_id::text,NEW.evidence_hash,NEW.resident_confirmation_evidence_id::text,NEW.source_capture_kind,NEW.source_capture_hash];
 FOREACH value_text IN ARRAY values_to_hash LOOP
  encoded:=encoded||CASE WHEN value_text IS NULL THEN 'N;' ELSE 'S'||octet_length(convert_to(value_text,'UTF8'))::text||':'||value_text||';' END;
 END LOOP;
 NEW.origin_hash:=encode(sha256(convert_to(encoded,'UTF8')),'hex');
 RETURN NEW;
END $$;

CREATE FUNCTION app.lp_sources(p_session uuid,p_job uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; w app.work_order; r app.work_order_revision; cfg app.extra_prompt_rule_settings; entries jsonb; work_ids jsonb; sources jsonb; observations jsonb;
BEGIN
 PERFORM app.lp_authority(p_session,p_job,'detail');
 SELECT * INTO w FROM app.work_order WHERE tenant_id=t AND job_id=p_job;
 SELECT rr.* INTO r FROM app.work_order_revision rr JOIN app.work_order_current c ON(c.tenant_id,c.revision_id)=(rr.tenant_id,rr.id) WHERE c.tenant_id=t AND c.work_order_id=w.id;
 SELECT * INTO cfg FROM app.extra_prompt_rule_settings WHERE tenant_id=t AND client_contract_version_id=w.contract_version_id;
 IF cfg.id IS NULL THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(DISTINCT l.sor_code),'[]') INTO work_ids FROM app.work_order_line l WHERE l.tenant_id=t AND l.revision_id=r.id;
 entries:=cfg.recognition;
 SELECT entries||coalesce(jsonb_agg(jsonb_build_object('workId',code,'terms',jsonb_build_array(code))),'[]') INTO entries FROM jsonb_array_elements_text(work_ids) code
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cfg.recognition) e WHERE e->>'workId'=code);
 SELECT coalesce(jsonb_agg(jsonb_build_object('evidenceId',o.evidence_id,'tenantId',t,'jobId',p_job,'sha256',o.sha256,'objectVersion',o.object_version_id,'status',CASE WHEN e.id IS NULL OR u.id IS NULL THEN 'rejected' WHEN u.state='pending' THEN 'upload_pending' ELSE u.state END,'invalidated',EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE(i.tenant_id,i.evidence_id)=(o.tenant_id,o.evidence_id)),'content',CASE WHEN o.source_kind='completion_photo' THEN jsonb_build_object('kind','completion_photo','tags',o.photo_tags) ELSE jsonb_build_object('kind','completion_note','text',o.source_text) END)),'[]') INTO sources
 FROM (SELECT DISTINCT ON(evidence_id) * FROM app.extra_completion_observation WHERE tenant_id=t AND job_id=p_job ORDER BY evidence_id,id) o
 LEFT JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.id,e.object_version_id,e.sha256)=(o.tenant_id,o.job_id,o.evidence_id,o.object_version_id,o.sha256)
 LEFT JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('observationId',o.id,'evidenceId',o.evidence_id,'sha256',o.sha256,'objectVersion',o.object_version_id,'locator',o.locator) ORDER BY o.id),'[]') INTO observations FROM app.extra_completion_observation o WHERE o.tenant_id=t AND o.job_id=p_job;
 RETURN jsonb_build_object('version','enterprise-completion-input.v1','environment','synthetic_demo','tenantId',t,'jobId',p_job,'baseline',jsonb_build_object('workOrderId',w.id,'revisionId',r.id,'sha256',r.content_hash,'workIds',work_ids),'recognition',jsonb_build_object('version',cfg.version,'entries',entries),'sources',sources,'observations',observations);
END $$;

CREATE FUNCTION app.lp_observation_prompt(p_session uuid,p_job uuid,p_observation uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE answer uuid;
BEGIN
 PERFORM app.lp_authority(p_session,p_job,'detail');
 SELECT c.prompt_id INTO answer FROM app.extra_prompt_citation c JOIN app.extra_prompt p ON(p.tenant_id,p.job_id,p.id)=(c.tenant_id,c.job_id,c.prompt_id)
 WHERE c.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND c.job_id=p_job AND c.source_kind='observation' AND c.source_id=p_observation AND p.rule='a';
 IF answer IS NULL THEN RAISE EXCEPTION 'PROMPT_SOURCE_INVALID'; END IF;
 RETURN answer;
END $$;

-- Preserve the first result despite legacy runtime column UPDATE grants on the shared receipt table.
CREATE FUNCTION app.lp_receipt_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.command_type NOT IN('ImportMaterialsIssue','RegisterCompletionObservation','EvaluateLivePrompts','ConfirmPrompt','DismissPrompt') THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
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
CREATE TRIGGER lp_receipt_immutable BEFORE UPDATE OR DELETE ON app.command_receipt FOR EACH ROW EXECUTE FUNCTION app.lp_receipt_immutable();

-- Every entrypoint and private helper is explicitly classified. No PUBLIC, worker or shadow entrypoints.
DO $$ DECLARE sig text; BEGIN
 FOREACH sig IN ARRAY ARRAY['lp_authority(uuid,uuid,text)','lp_surface(uuid,uuid,text,text,text,jsonb,uuid)','lp_evaluate(uuid,uuid)','lp_read(uuid,jsonb)','lp_citations_valid(uuid,uuid)','lp_command(uuid,jsonb,bytea)','lp_span_valid(text,jsonb)','lp_finish(uuid,uuid,jsonb)','lp_visit_evaluate(uuid,uuid,uuid)','lp_require_audit()','lp_office_advisory()','lp_sources(uuid,uuid)','lp_observation_prompt(uuid,uuid,uuid)','lp_receipt_immutable()','lp_png_completion_tags(bytea)'] LOOP
  EXECUTE 'ALTER FUNCTION app.'||sig||' OWNER TO jobguard_migration';
  EXECUTE 'REVOKE ALL ON FUNCTION app.'||sig||' FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access';
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION app.lp_read(uuid,jsonb),app.lp_command(uuid,jsonb,bytea),app.lp_finish(uuid,uuid,jsonb),app.lp_visit_evaluate(uuid,uuid,uuid),app.lp_sources(uuid,uuid),app.lp_observation_prompt(uuid,uuid,uuid) TO jobguard_runtime;
COMMIT;
