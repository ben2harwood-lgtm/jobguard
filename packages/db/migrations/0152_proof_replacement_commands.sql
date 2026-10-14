BEGIN;
-- Additive proof history. Original completion rows, receipt results and closed
-- watchdog/application kind checks are retained without reinterpretation.
ALTER TABLE app.stage_completion ADD CONSTRAINT stage_completion_replacement_identity
 UNIQUE(tenant_id,job_id,scope_item_id,stage,id);
CREATE TABLE app.stage_proof_replacement (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, scope_item_id uuid NOT NULL,
 stage varchar(40) NOT NULL, stage_completion_id uuid NOT NULL, evidence_invalidation_id uuid NOT NULL,
 evidence_link_id uuid NOT NULL, command_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 generation integer NOT NULL CHECK(generation>0), previous_replacement_id uuid,
 resolution_id uuid NOT NULL, audit_event_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id),
 UNIQUE(tenant_id,stage_completion_id,generation), UNIQUE(tenant_id,stage_completion_id,evidence_invalidation_id),
 UNIQUE(tenant_id,stage_completion_id,id),
 CHECK((generation=1 AND previous_replacement_id IS NULL) OR (generation>1 AND previous_replacement_id IS NOT NULL)),
 FOREIGN KEY(tenant_id,job_id,scope_item_id,stage,stage_completion_id) REFERENCES app.stage_completion(tenant_id,job_id,scope_item_id,stage,id),
 FOREIGN KEY(tenant_id,stage_completion_id,evidence_invalidation_id) REFERENCES app.stage_review_event(tenant_id,stage_completion_id,evidence_invalidation_id),
 FOREIGN KEY(tenant_id,job_id,scope_item_id,evidence_link_id) REFERENCES app.evidence_link(tenant_id,job_id,scope_item_id,id),
 FOREIGN KEY(tenant_id,stage_completion_id,previous_replacement_id) REFERENCES app.stage_proof_replacement(tenant_id,stage_completion_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,resolution_id) REFERENCES app.decision_resolution(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED);
ALTER TABLE app.evidence_invalidation ADD CONSTRAINT invalidation_evidence_identity UNIQUE(tenant_id,evidence_id,id);
CREATE TABLE app.proof_invalidation_command (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, job_id uuid NOT NULL, evidence_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, reason_code varchar(40) NOT NULL CHECK(reason_code IN('object_revoked','verification_invalid','wrong_subject')),
 request_hash char(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 invalidation_id uuid NOT NULL, result jsonb NOT NULL, audit_event_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,command_id), UNIQUE(tenant_id,command_id,job_id),
 FOREIGN KEY(tenant_id,job_id,evidence_id) REFERENCES app.evidence_object(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,evidence_id,invalidation_id) REFERENCES app.evidence_invalidation(tenant_id,evidence_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED);
CREATE TABLE app.proof_invalidation_response (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, job_id uuid NOT NULL,
 request_hash char(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'), response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,command_id),
 FOREIGN KEY(tenant_id,command_id,job_id) REFERENCES app.proof_invalidation_command(tenant_id,command_id,job_id));
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['stage_proof_replacement','proof_invalidation_command','proof_invalidation_response'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);
  EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);
  EXECUTE format('CREATE TRIGGER proof_history_immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record()',n);
 END LOOP;
END $$;
CREATE VIEW app.current_stage_proof WITH(security_invoker=true) AS
 SELECT s.tenant_id,s.id,s.job_id,s.scope_item_id,s.stage,
 coalesce(r.evidence_link_id,s.evidence_link_id) evidence_link_id,l.evidence_id,
 r.id replacement_id,coalesce(r.generation,0) generation,
 i.id evidence_invalidation_id,(i.id IS NOT NULL) review_required
 FROM app.stage_completion s
 LEFT JOIN LATERAL(SELECT * FROM app.stage_proof_replacement p WHERE p.tenant_id=s.tenant_id AND p.stage_completion_id=s.id ORDER BY p.generation DESC LIMIT 1) r ON true
 JOIN app.evidence_link l ON(l.tenant_id,l.id)=(s.tenant_id,coalesce(r.evidence_link_id,s.evidence_link_id))
 LEFT JOIN app.evidence_invalidation i ON(i.tenant_id,i.evidence_id)=(l.tenant_id,l.evidence_id);
ALTER VIEW app.current_stage_proof OWNER TO jobguard_migration;
GRANT SELECT ON app.current_stage_proof TO jobguard_runtime;

CREATE FUNCTION app.require_proof_writer(t uuid,a uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR a IS NULL
 OR NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=a AND role='owner'
  AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE)
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION app.require_proof_writer(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_proof_writer(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

-- Cross-namespace guard; no command-kind CHECK is extended. It takes no lock of its own (a lock here would be a new contending
-- lock after the audit append in every old command): it fires after 0096's non-waiting per-id reservation (b_ < c_), which already
-- holds the id's lock on every store that has one, and invalidate_proof_command takes the same lock before it checks.
CREATE FUNCTION app.guard_proof_command_namespace() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE cid uuid := (to_jsonb(NEW)->>TG_ARGV[0])::uuid;
BEGIN
 IF cid IS NULL THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM app.proof_invalidation_command WHERE tenant_id=NEW.tenant_id AND command_id=cid)
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_proof_command_namespace() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_proof_command_namespace() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['watchdog_command_identity','command_receipt','planned_work_revision','readiness_decision','discrepancy_finding_revision','discrepancy_review_outcome','supplier_bill_supersession','supplier_match_revision','supplier_fact_revision','inbox_outcome_event','purchase_order_placement','stage_completion'] LOOP
  EXECUTE format('CREATE TRIGGER c_proof_command_namespace BEFORE INSERT ON app.%I FOR EACH ROW EXECUTE FUNCTION app.guard_proof_command_namespace(''command_id'')',n);
 END LOOP;
END $$;
CREATE TRIGGER c_proof_command_namespace BEFORE INSERT ON app.evidence_upload FOR EACH ROW EXECUTE FUNCTION app.guard_proof_command_namespace('id');

-- Reads and writes on older, runtime-policed tables (stage_completion, stage_review_event, evidence_link and the old command stores)
-- are done by these small routines as jobguard_runtime, which those tables' unchanged policies already serve. The checked writers
-- below call them. This adds no policy or grant to any older table: jobguard_migration still cannot see or write those rows.
-- Only jobguard_migration may execute them (the checked writers run as it); the runtime role cannot call them directly.
CREATE FUNCTION app.proof_command_id_taken(t uuid,c uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT EXISTS(SELECT 1 FROM app.watchdog_command_identity WHERE tenant_id=t AND command_id=c)
 OR EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=t AND command_id=c)
 OR EXISTS(SELECT 1 FROM app.proof_application_response WHERE tenant_id=t AND command_id=c)
 OR EXISTS(SELECT 1 FROM app.planned_work_revision WHERE tenant_id=t AND command_id=c)
 OR EXISTS(SELECT 1 FROM app.readiness_decision WHERE tenant_id=t AND command_id=c)
 OR EXISTS(SELECT 1 FROM app.discrepancy_finding_revision WHERE tenant_id=t AND command_id=c)
 OR EXISTS(SELECT 1 FROM app.discrepancy_review_outcome WHERE tenant_id=t AND command_id=c)
 OR EXISTS(SELECT 1 FROM app.supplier_bill_supersession WHERE tenant_id=t AND command_id=c)
 OR EXISTS(SELECT 1 FROM app.supplier_match_revision WHERE tenant_id=t AND command_id=c)
 OR EXISTS(SELECT 1 FROM app.supplier_fact_revision WHERE tenant_id=t AND command_id=c)
 OR EXISTS(SELECT 1 FROM app.inbox_outcome_event WHERE tenant_id=t AND command_id=c)
 OR EXISTS(SELECT 1 FROM app.purchase_order_placement WHERE tenant_id=t AND command_id=c)
 OR EXISTS(SELECT 1 FROM app.stage_completion WHERE tenant_id=t AND command_id=c)
 OR EXISTS(SELECT 1 FROM app.evidence_upload WHERE tenant_id=t AND id=c) $$;
CREATE FUNCTION app.proof_mark_rework(t uuid,eid uuid,iid uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 INSERT INTO app.stage_review_event(id,tenant_id,stage_completion_id,evidence_invalidation_id,event_type)
 SELECT gen_random_uuid(),t,p.id,iid,'proof_rework_required' FROM app.current_stage_proof p WHERE p.tenant_id=t AND p.evidence_id=eid $$;
CREATE FUNCTION app.proof_current(t uuid,sid uuid) RETURNS SETOF app.current_stage_proof
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT * FROM app.current_stage_proof WHERE tenant_id=t AND id=sid $$;
CREATE FUNCTION app.proof_link(t uuid,lid uuid) RETURNS SETOF app.evidence_link
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT * FROM app.evidence_link WHERE tenant_id=t AND id=lid $$;
CREATE FUNCTION app.proof_replacement_eligible(t uuid,c uuid,a uuid,sid uuid,iid uuid,lid uuid,rid uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.current_stage_proof; l app.evidence_link;
BEGIN
 SELECT * INTO p FROM app.current_stage_proof WHERE tenant_id=t AND id=sid;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO l FROM app.evidence_link WHERE tenant_id=t AND id=lid;
 IF NOT FOUND THEN RETURN false; END IF;
 RETURN NOT(p.evidence_invalidation_id IS DISTINCT FROM iid OR iid IS NULL
 OR (l.job_id,l.scope_item_id) IS DISTINCT FROM(p.job_id,p.scope_item_id)
 OR l.required_evidence_type IS DISTINCT FROM(SELECT required_evidence_type FROM app.evidence_link original JOIN app.stage_completion sc ON(sc.tenant_id,sc.evidence_link_id)=(original.tenant_id,original.id) WHERE sc.tenant_id=t AND sc.id=sid)
 OR NOT EXISTS(SELECT 1 FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
   WHERE e.tenant_id=t AND e.id=l.evidence_id AND e.kind='original' AND u.state='verified'
   AND e.evidence_type=l.required_evidence_type AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.id))
 OR NOT EXISTS(SELECT 1 FROM app.command_receipt cr JOIN app.watchdog_command_identity ci ON(ci.tenant_id,ci.command_id)=(cr.tenant_id,cr.command_id)
   WHERE cr.tenant_id=t AND cr.command_id=c AND cr.actor_membership_id=a AND cr.status='processing'
   AND ci.command_type='proof.complete' AND ci.job_id=p.job_id AND ci.claimed_xact=pg_current_xact_id()
   AND cr.semantic_key=p.job_id::text||':'||p.scope_item_id::text||':'||p.stage||':replacement.v1:'||iid::text)
 OR NOT EXISTS(SELECT 1 FROM app.decision_resolution dr JOIN app.job_finding f ON(f.tenant_id,f.decision_id)=(dr.tenant_id,dr.decision_id)
   WHERE dr.tenant_id=t AND dr.id=rid AND dr.resolution='approved' AND dr.actor_membership_id=a AND f.job_id=p.job_id
   AND f.action_type='proof.capture' AND f.subject_ref=p.scope_item_id::text||':'||l.required_evidence_type
   AND f.fingerprint=encode(public.digest('proof-rework:'||iid::text,'sha256'),'hex')));
END $$;
DO $$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY['proof_command_id_taken(uuid,uuid)','proof_mark_rework(uuid,uuid,uuid)','proof_current(uuid,uuid)','proof_link(uuid,uuid)','proof_replacement_eligible(uuid,uuid,uuid,uuid,uuid,uuid,uuid)'] LOOP
  EXECUTE format('ALTER FUNCTION app.%s OWNER TO jobguard_runtime',f);
  EXECUTE format('REVOKE ALL ON FUNCTION app.%s FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION app.%s TO jobguard_migration',f);
 END LOOP;
END $$;

CREATE FUNCTION app.invalidate_proof_command(t uuid,c uuid,a uuid,eid uuid,reason varchar,h char(64)) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prior app.proof_invalidation_command; e app.evidence_object; iid uuid; aid uuid; did uuid; fid uuid; inserted boolean:=false; rev integer; result jsonb;
BEGIN
 PERFORM app.require_proof_writer(t,a);
 PERFORM pg_advisory_xact_lock(hashtextextended('watchdog-command-id:'||t::text||':'||c::text,0));
 SELECT * INTO prior FROM app.proof_invalidation_command WHERE tenant_id=t AND command_id=c;
 IF FOUND THEN
  IF (prior.evidence_id,prior.actor_membership_id,prior.reason_code,prior.request_hash) IS DISTINCT FROM(eid,a,reason,h)
  THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('replay',true,'result',prior.result,'jobId',prior.job_id);
 END IF;
 IF app.proof_command_id_taken(t,c)
 THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 -- Separate statement before the authoritative read: waiting must not reuse a stale snapshot.
 PERFORM 1 FROM app.evidence_upload u JOIN app.evidence_object proof_object ON(proof_object.tenant_id,proof_object.upload_id)=(u.tenant_id,u.id)
 WHERE proof_object.tenant_id=t AND proof_object.id=eid FOR UPDATE OF u;
 SELECT * INTO e FROM app.evidence_object WHERE tenant_id=t AND id=eid;
 IF NOT FOUND THEN RAISE EXCEPTION 'PROOF_NOT_FINAL' USING ERRCODE='23514'; END IF;
 INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code)
 VALUES(gen_random_uuid(),t,eid,a,reason) ON CONFLICT(tenant_id,evidence_id) DO NOTHING RETURNING id INTO iid;
 inserted:=FOUND;
 IF NOT inserted THEN SELECT id INTO iid FROM app.evidence_invalidation WHERE tenant_id=t AND evidence_id=eid; END IF;
 IF inserted THEN
  PERFORM app.proof_mark_rework(t,eid,iid);
  IF e.scope_item_id IS NOT NULL THEN
   did:=gen_random_uuid(); fid:=gen_random_uuid();
   SELECT revision INTO rev FROM app.job WHERE tenant_id=t AND id=e.job_id;
   INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
    VALUES(did,t,'finding',e.scope_item_id::text||':'||e.evidence_type,'proof.capture');
   INSERT INTO app.job_finding(id,tenant_id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,suggestion_confidence,snapshot_revision)
    VALUES(fid,t,e.job_id,did,encode(public.digest('proof-rework:'||iid::text,'sha256'),'hex'),'required_proof','mandatory',
    'Required proof missing','The supporting synthetic file was invalidated and needs replacement.',e.scope_item_id::text||':'||e.evidence_type,'proof.capture',NULL,rev);
  END IF;
  aid:=gen_random_uuid();
 END IF;
 result:=jsonb_build_object('evidenceId',eid,'reviewRequired',true);
 INSERT INTO app.proof_invalidation_command(tenant_id,command_id,job_id,evidence_id,actor_membership_id,reason_code,request_hash,invalidation_id,result,audit_event_id)
 VALUES(t,c,e.job_id,eid,a,reason,h,iid,result,aid);
 RETURN jsonb_build_object('replay',false,'result',result,'jobId',e.job_id,'invalidationId',iid,'auditEventId',aid);
END $$;
ALTER FUNCTION app.invalidate_proof_command(uuid,uuid,uuid,uuid,varchar,char) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.invalidate_proof_command(uuid,uuid,uuid,uuid,varchar,char) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.invalidate_proof_command(uuid,uuid,uuid,uuid,varchar,char) TO jobguard_runtime;

CREATE FUNCTION app.record_invalidation_response(t uuid,c uuid,j uuid,h char(64),r jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE cmd app.proof_invalidation_command; prior app.proof_invalidation_response;
BEGIN
 SELECT * INTO cmd FROM app.proof_invalidation_command WHERE tenant_id=t AND command_id=c;
 PERFORM app.require_proof_writer(t,cmd.actor_membership_id);
 IF cmd.job_id IS DISTINCT FROM j THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 INSERT INTO app.proof_invalidation_response(tenant_id,command_id,job_id,request_hash,response)VALUES(t,c,j,h,r)
 ON CONFLICT(tenant_id,command_id) DO NOTHING;
 SELECT * INTO prior FROM app.proof_invalidation_response WHERE tenant_id=t AND command_id=c;
 IF (prior.job_id,prior.request_hash) IS DISTINCT FROM(j,h) THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 RETURN prior.response;
END $$;
ALTER FUNCTION app.record_invalidation_response(uuid,uuid,uuid,char,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.record_invalidation_response(uuid,uuid,uuid,char,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.record_invalidation_response(uuid,uuid,uuid,char,jsonb) TO jobguard_runtime;

CREATE FUNCTION app.replace_stage_proof(t uuid,c uuid,a uuid,sid uuid,iid uuid,lid uuid,rid uuid,aid uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.current_stage_proof; l app.evidence_link; replacement_id_value uuid:=gen_random_uuid();
BEGIN
 PERFORM app.require_proof_writer(t,a);
 SELECT * INTO p FROM app.proof_current(t,sid);
 IF NOT FOUND THEN RAISE EXCEPTION 'PROOF_NOT_FINAL' USING ERRCODE='23514'; END IF;
 PERFORM app.require_watchdog_live(p.job_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p.job_id::text||':'||p.scope_item_id::text||':'||p.stage,0));
 SELECT * INTO p FROM app.proof_current(t,sid);
 SELECT * INTO l FROM app.proof_link(t,lid);
 -- The checked writer protects its own eligibility read even for direct calls.
 PERFORM 1 FROM app.evidence_upload u JOIN app.evidence_object e ON(e.tenant_id,e.upload_id)=(u.tenant_id,u.id)
  WHERE e.tenant_id=t AND e.id=l.evidence_id FOR UPDATE OF u;
 IF NOT app.proof_replacement_eligible(t,c,a,sid,iid,lid,rid)
 THEN RAISE EXCEPTION 'PROOF_NOT_FINAL' USING ERRCODE='23514'; END IF;
 INSERT INTO app.stage_proof_replacement(tenant_id,id,job_id,scope_item_id,stage,stage_completion_id,evidence_invalidation_id,evidence_link_id,command_id,actor_membership_id,generation,previous_replacement_id,resolution_id,audit_event_id)
 VALUES(t,replacement_id_value,p.job_id,p.scope_item_id,p.stage,p.id,iid,lid,c,a,p.generation+1,p.replacement_id,rid,aid);
 RETURN replacement_id_value;
END $$;
ALTER FUNCTION app.replace_stage_proof(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.replace_stage_proof(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.replace_stage_proof(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO jobguard_runtime;
-- Checked writers cannot commit history under an unrelated or pre-existing audit event.
CREATE FUNCTION app.verify_proof_history_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE event app.audit_event; expected_evidence uuid;
BEGIN
 IF NEW.audit_event_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO event FROM app.audit_event WHERE tenant_id=NEW.tenant_id AND id=NEW.audit_event_id
  AND xmin::text::bigint=(pg_current_xact_id()::text::numeric % 4294967296)::bigint;
 IF TG_TABLE_NAME='proof_invalidation_command' THEN
  IF event.event_type IS DISTINCT FROM 'proof.rework_required'
   OR event.subject_ref IS DISTINCT FROM NEW.evidence_id::text
   OR event.payload->'references'->>'invalidationId' IS DISTINCT FROM NEW.invalidation_id::text
   OR event.payload->'references'->>'evidenceId' IS DISTINCT FROM NEW.evidence_id::text
  THEN RAISE EXCEPTION 'PROOF_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT evidence_id INTO expected_evidence FROM app.proof_link(NEW.tenant_id,NEW.evidence_link_id);
  IF event.event_type IS DISTINCT FROM 'proof.completed'
   OR event.subject_ref IS DISTINCT FROM NEW.scope_item_id::text
   OR event.payload->'references'->>'completionId' IS DISTINCT FROM NEW.stage_completion_id::text
   OR event.payload->'references'->>'evidenceId' IS DISTINCT FROM expected_evidence::text
  THEN RAISE EXCEPTION 'PROOF_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 IF event.actor_ref IS DISTINCT FROM 'membership:'||NEW.actor_membership_id::text
 THEN RAISE EXCEPTION 'PROOF_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.verify_proof_history_audit() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.verify_proof_history_audit() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE CONSTRAINT TRIGGER proof_history_audit AFTER INSERT ON app.stage_proof_replacement DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_proof_history_audit();
CREATE CONSTRAINT TRIGGER proof_history_audit AFTER INSERT ON app.proof_invalidation_command DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.verify_proof_history_audit();
COMMIT;
