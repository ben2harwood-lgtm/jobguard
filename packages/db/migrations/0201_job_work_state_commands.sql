BEGIN;
-- CH-4-C: existing immutable tables; no history rewrite or money authority.
-- Extend only the existing identity kind constraint; no table columns change.
ALTER TABLE app.watchdog_command_identity DROP CONSTRAINT watchdog_command_identity_command_type_check;
ALTER TABLE app.watchdog_command_identity ADD CONSTRAINT watchdog_command_identity_command_type_check CHECK(command_type IN(
 'readiness.record','readiness.advance','things_to_check.evaluate','things_to_check.review','things_to_check.supersede',
 'supplier_match.create','supplier_match.correct','inbox.seed','inbox.dismiss','purchase_order.revise','purchase_order.place',
 'supplier_document.intake','supplier_document.receipt','supplier_document.confirm','evidence.begin_upload','evidence.finalize','proof.complete',
 'WorkState.finish','WorkState.cancel_finish','WorkState.close','WorkState.reopen','WorkState.link'));
-- Lock order: finish/cancel job SHARE, other jobs UPDATE sorted UUID;
-- command identity; graph/event serializers;
-- receipt and facts; deferred audit last; authority recheck uses plain reads.
CREATE OR REPLACE FUNCTION app.guard_watchdog_input() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, app AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
  -- These tables also hold non-watchdog bank evidence from the already
  -- controlled synthetic recovery routine. Only its migration-role execution
  -- may write its exact generated PDF class after live. Runtime cannot assume
  -- this role or gain the exception by forging a content type/key/mode.
  IF current_user='jobguard_migration' AND (to_jsonb(NEW)->>'scope_item_id') IS NULL
    AND (to_jsonb(NEW)->>'object_key') LIKE 'synthetic/recovery/%'
    AND ((TG_TABLE_NAME='evidence_upload' AND to_jsonb(NEW)->>'expected_content_type'='application/pdf' AND to_jsonb(NEW)->>'state'='verified')
      OR (TG_TABLE_NAME='evidence_object' AND to_jsonb(NEW)->>'evidence_type'='synthetic_bank_receipt' AND to_jsonb(NEW)->>'content_type'='application/pdf'))
  THEN RETURN NEW; END IF;
  -- Only migration-owned checked CH-4 administration can claim a pre-live ID.
  -- No GUC, caller-supplied mode or direct runtime write grants this exception.
  IF current_user='jobguard_migration' AND TG_TABLE_SCHEMA='app' AND TG_TABLE_NAME='watchdog_command_identity' THEN
    IF NEW.command_type IN('WorkState.close','WorkState.reopen','WorkState.link') AND EXISTS(
      SELECT 1 FROM app.command_receipt r JOIN app.job_commercial_track c ON c.tenant_id=r.tenant_id AND c.job_id=NEW.job_id
      WHERE r.tenant_id=NEW.tenant_id AND r.command_id=NEW.command_id AND r.command_type=NEW.command_type
        AND r.semantic_key=NEW.command_id::text AND r.request_hash=NEW.request_hash AND r.status='processing'
        AND c.job_track='small_builder' AND c.environment='synthetic_demo'
        AND EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=r.tenant_id AND m.id=r.actor_membership_id
          AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()))
    ) THEN RETURN NEW; END IF;
  END IF;
  PERFORM app.require_watchdog_live(NEW.job_id);
  RETURN NEW;
END $$;

CREATE FUNCTION app.ch4_require_command_owner(t uuid,j uuid,digest text) RETURNS uuid
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Trusted server membership IDs use the same authority boundary as final-lock
 -- commands. Practice digests still authenticate their persisted session.
 IF digest ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN
  actor:=digest::uuid;
 ELSE
  SELECT a.membership_id INTO actor FROM app.authenticate_practice_session(digest,t) a;
  IF NOT EXISTS(WITH RECURSIVE owned(id) AS(
   SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=digest
   UNION SELECT job.id FROM owned source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
    JOIN app.job job ON job.tenant_id=e.tenant_id AND job.id::text=e.subject_ref AND job.provenance='imported' AND job.practice_session_digest IS NULL
  ) SELECT 1 FROM owned WHERE id=j) THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM app.job x JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(x.tenant_id,x.id) WHERE x.tenant_id=t AND x.id=j AND c.job_track='small_builder' AND c.environment='synthetic_demo')
 THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  PERFORM app.final_lock_require_owner(t,actor);
 EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501';
 END;
 RETURN actor;
END $$;
CREATE FUNCTION app.ch4_command_work_facts(t uuid,j uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE events jsonb; links jsonb; lock jsonb;
BEGIN
 PERFORM app.ch4_require_command_owner(t,j,digest);
 SELECT coalesce(jsonb_agg(jsonb_build_object('version',version,'id',id,'jobId',job_id,'sequence',sequence,'kind',kind,'factAt',to_char(fact_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'recordedAt',to_char(recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sourceReceiptId',source_receipt_id,'commandId',command_id,'predecessorId',predecessor_id,'closeReason',close_reason,'closeNote',close_note) ORDER BY fact_at,id),'[]') INTO events FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j;
 SELECT jsonb_build_object('id',id,'lockedAt',to_char(locked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) INTO lock FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'predecessorJobId',l.predecessor_job_id,'successorJobId',l.successor_job_id,'linkedAt',to_char(l.linked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY l.linked_at,l.id),'[]') INTO links FROM app.job_link l JOIN app.job predecessor ON predecessor.tenant_id=t AND predecessor.id=l.predecessor_job_id JOIN app.job successor ON successor.tenant_id=t AND successor.id=l.successor_job_id WHERE l.tenant_id=t AND (l.predecessor_job_id=j OR l.successor_job_id=j)
  AND (digest ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' OR (predecessor.practice_session_digest=digest AND successor.practice_session_digest=digest));
 RETURN jsonb_build_object('version','job-work-state-read.v1','jobId',j,'events',events,'links',links,'lock',lock,'environment','synthetic_demo','realExternalActions',0);
END $$;
CREATE OR REPLACE FUNCTION app.ch4_storage_integrity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE envelope jsonb; authority text; latest app.job_work_state_event; p app.job_party_binding; s app.job_party_binding; old_context text:=current_setting('app.tenant_id',true);
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(old_context,'')::uuid THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='job_link' THEN
  PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id IN(NEW.predecessor_job_id,NEW.successor_job_id) ORDER BY id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text,145));
  -- A GUC alone grants nothing: bind the exact envelope to the checked command's
  -- receipt, identity and DB transaction before using its authority at storage.
  envelope:=nullif(current_setting('app.ch4_link_envelope',true),'')::jsonb;
  authority:=envelope->>'sessionDigest';
  IF envelope IS NULL THEN
   -- Preserve the predecessor storage rule for labelled direct fixtures. Runtime
   -- still has no INSERT grant; only checked commands can use owner authority.
   IF (SELECT practice_session_digest FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.predecessor_job_id)
    IS DISTINCT FROM (SELECT practice_session_digest FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.successor_job_id)
   THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  ELSE
  IF app.final_lock_hash(envelope) IS DISTINCT FROM NEW.request_hash
   OR envelope->>'jobId' IS DISTINCT FROM NEW.predecessor_job_id::text
   OR envelope->>'actor' IS DISTINCT FROM NEW.actor_membership_id::text
   OR envelope->'input'->>'action' IS DISTINCT FROM 'link'
   OR envelope->'input'->>'commandId' IS DISTINCT FROM NEW.command_id::text
   OR envelope->'input'->>'successorJobId' IS DISTINCT FROM NEW.successor_job_id::text
   OR envelope->'input'->>'predecessorBindingId' IS DISTINCT FROM NEW.predecessor_binding_id::text
   OR envelope->'input'->>'successorBindingId' IS DISTINCT FROM NEW.successor_binding_id::text
   OR NOT EXISTS(SELECT 1 FROM app.command_receipt r JOIN app.watchdog_command_identity i
    ON (i.tenant_id,i.command_id,i.request_hash,i.command_type)=(r.tenant_id,r.command_id,r.request_hash,r.command_type)
    WHERE r.tenant_id=NEW.tenant_id AND r.command_id=NEW.command_id AND r.request_hash=NEW.request_hash
     AND r.actor_membership_id=NEW.actor_membership_id AND r.status='processing' AND r.command_type='WorkState.link'
     AND i.job_id=NEW.predecessor_job_id AND i.claimed_xact=pg_current_xact_id())
  THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF app.ch4_require_command_owner(NEW.tenant_id,NEW.predecessor_job_id,authority) IS DISTINCT FROM NEW.actor_membership_id
   OR app.ch4_require_command_owner(NEW.tenant_id,NEW.successor_job_id,authority) IS DISTINCT FROM NEW.actor_membership_id
  THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  END IF;
  IF (SELECT count(*) FROM app.job_commercial_track WHERE tenant_id=NEW.tenant_id AND job_id IN(NEW.predecessor_job_id,NEW.successor_job_id) AND job_track='small_builder' AND environment='synthetic_demo')<>2 THEN RAISE EXCEPTION 'INVALID_JOB_LINK'; END IF;
  SELECT * INTO p FROM app.job_party_binding WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.predecessor_job_id,NEW.predecessor_binding_id);
  SELECT * INTO s FROM app.job_party_binding WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.successor_job_id,NEW.successor_binding_id);
  IF p.id IS NULL OR s.id IS NULL OR (p.customer_id,p.site_id,p.paying_party_id) IS DISTINCT FROM (s.customer_id,s.site_id,s.paying_party_id)
   OR (p.customer_id,p.site_id,p.paying_party_id) IS DISTINCT FROM (NEW.customer_id,NEW.site_id,NEW.paying_party_id)
   OR NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.predecessor_job_id)
  THEN RAISE EXCEPTION 'INVALID_JOB_LINK'; END IF;
  IF EXISTS(WITH RECURSIVE descendants(id) AS(SELECT NEW.successor_job_id UNION SELECT l.successor_job_id FROM app.job_link l JOIN descendants d ON d.id=l.predecessor_job_id WHERE l.tenant_id=NEW.tenant_id) SELECT 1 FROM descendants WHERE id=NEW.predecessor_job_id) THEN RAISE EXCEPTION 'JOB_LINK_CYCLE'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='job_work_state_event' THEN
  IF NEW.source_receipt_id IS NULL THEN
   IF NEW.kind IN('finished_on_site','finished_cancelled') THEN
    PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id FOR SHARE;
   ELSE
    PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id FOR UPDATE;
   END IF;
  END IF;
 END IF;
 -- Command entrypoints recheck bound job authority. Source facts and photo
 -- purposes keep their existing gates.
 IF TG_TABLE_NAME='job_work_state_event' THEN
  IF NEW.source_receipt_id IS NULL THEN
   PERFORM app.final_lock_require_owner(NEW.tenant_id,NEW.actor_membership_id);
   IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND job_track='small_builder' AND environment='synthetic_demo') THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED'; END IF;
  ELSIF NOT app.ch4_source_job(NEW.tenant_id,NEW.job_id) THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED'; END IF;
 ELSIF NOT app.ch4_source_job(NEW.tenant_id,NEW.job_id) THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED'; END IF;
 IF TG_TABLE_NAME='job_photo_purpose' THEN
  IF NOT EXISTS(SELECT 1 FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id)
   WHERE (e.tenant_id,e.job_id,e.id,e.upload_id)=(NEW.tenant_id,NEW.job_id,NEW.evidence_id,NEW.upload_id) AND e.kind='original' AND u.state='verified' AND e.sha256=NEW.sha256 AND e.object_version_id=NEW.object_version_id AND u.object_version_id=NEW.object_version_id)
  THEN RAISE EXCEPTION 'INVALID_PHOTO_PURPOSE'; END IF;
  -- Q-03 held: even a fixture cannot reclassify an existing progress source as snagging.
  IF NEW.purpose='snagging' AND EXISTS(SELECT 1 FROM app.job_site_source_receipt WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND evidence_id=NEW.evidence_id) THEN RAISE EXCEPTION 'INVALID_PHOTO_PURPOSE'; END IF;
 END IF;
 IF TG_TABLE_NAME='job_work_state_event' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.job_id::text,144));
  IF NEW.sequence<>(SELECT coalesce(max(sequence),0)+1 FROM app.job_work_state_event WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN RAISE EXCEPTION 'INVALID_WORK_SEQUENCE'; END IF;
  IF NEW.source_receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.job_site_source_receipt r WHERE (r.tenant_id,r.job_id,r.id,r.received_at,r.source_hash)=(NEW.tenant_id,NEW.job_id,NEW.source_receipt_id,NEW.fact_at,NEW.request_hash)) THEN RAISE EXCEPTION 'INVALID_WORK_SOURCE'; END IF;
  IF NEW.kind IN('finished_cancelled','reopened') THEN
   SELECT * INTO latest FROM app.job_work_state_event WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND kind IN(CASE WHEN NEW.kind='finished_cancelled' THEN 'finished_on_site' ELSE 'closed' END,NEW.kind) ORDER BY sequence DESC LIMIT 1;
   IF (NEW.kind='finished_cancelled' AND latest.fact_at>NEW.fact_at) OR latest.id IS DISTINCT FROM NEW.predecessor_id OR latest.kind IS DISTINCT FROM (CASE WHEN NEW.kind='finished_cancelled' THEN 'finished_on_site' ELSE 'closed' END) THEN RAISE EXCEPTION 'INVALID_WORK_PREDECESSOR'; END IF;
  END IF;
  IF NEW.kind IN('first_site_evidence','site_activity','resumed','finished_on_site') AND EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION app.ch4_require_open(t uuid,j uuid) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (SELECT kind FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j AND kind IN('closed','reopened') ORDER BY sequence DESC LIMIT 1)='closed'
 THEN RAISE EXCEPTION 'JOB_WORK_CLOSED'; END IF;
END $$;
-- Transaction-bound admission seam, deliberately private. MON-1 B replaces its
-- implementation under tenant-capacity-first serialization. No fixture reads.
CREATE FUNCTION app.ch4_admit_place(t uuid,j uuid,action text) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE';
END $$;
-- Plain immutable ownership reads are isolated from the command's job locks.
-- Private, read-only and invoked at the same point under the same identity lock.
CREATE FUNCTION app.ch4_legacy_command_owned(t uuid,cid uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
  SELECT 1 FROM app.planned_work_revision WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT 1 FROM app.readiness_decision WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT 1 FROM app.discrepancy_finding_revision WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT 1 FROM app.discrepancy_review_outcome WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT 1 FROM app.supplier_bill_supersession WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT 1 FROM app.supplier_match_revision WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT 1 FROM app.supplier_fact_revision WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT 1 FROM app.inbox_outcome_event e WHERE e.tenant_id=t AND e.command_id=cid AND e.event_kind='dismissed'
  UNION ALL SELECT 1 FROM app.purchase_order_placement WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT 1 FROM app.stage_completion WHERE tenant_id=t AND command_id=cid
  UNION ALL SELECT 1 FROM app.evidence_upload WHERE tenant_id=t AND id=cid

  UNION ALL SELECT 1 FROM app.job_work_state_event WHERE tenant_id=t AND command_id=cid AND source_receipt_id IS NULL
  UNION ALL SELECT 1 FROM app.job_link WHERE tenant_id=t AND command_id=cid
 );
$$;
CREATE FUNCTION app.ch4_work_state_command(t uuid,j uuid,digest text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; action text; cid uuid; successor uuid; expected bigint; seq bigint; revision bigint;
 request_digest text; prior app.command_receipt; latest app.job_work_state_event; marker app.job_work_state_event;
 p app.job_party_binding; s app.job_party_binding; fact_id uuid:=gen_random_uuid(); audit_id uuid:=gen_random_uuid();
 old_link_envelope text:=current_setting('app.ch4_link_envelope',true);
 at_time timestamptz; event_kind text; predecessor uuid; command_result jsonb; allowed text[];
BEGIN
 -- One checked action per transaction: a second action must not acquire a
 -- business lock after this transaction's CH-4 audit allocation. xid8 is an
 -- immutable DB-generated identity (not a client/GUC token).
 IF EXISTS(SELECT 1 FROM app.watchdog_command_identity WHERE tenant_id=t AND claimed_xact=pg_current_xact_id()
  AND command_type LIKE 'WorkState.%') THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 -- Never accept caller-selected tenant/actor/time/policy or a loose JSON shape.
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 action:=input->>'action';
 -- Ruling 114: resume has no registered SQL action until MON-1-PLACES.
 IF action='resume' THEN RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE'; END IF;
 IF action IS NULL OR action NOT IN('finish','cancel_finish','close','reopen','link')
  OR input->>'version' IS DISTINCT FROM (CASE WHEN action='link' THEN 'job-link-command.v1' ELSE 'job-work-state-command.v1' END)
  OR jsonb_typeof(input->'commandId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(input->'expectedRevision') IS DISTINCT FROM 'number'
  OR (input->>'expectedRevision') !~ '^(0|[1-9][0-9]*)$'
 THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 allowed:=ARRAY['version','action','commandId','expectedRevision'];
 IF action='cancel_finish' THEN allowed:=allowed||ARRAY['markerId']; END IF;
 IF action='close' THEN allowed:=allowed||ARRAY['reason','note']; END IF;
 IF action='reopen' THEN allowed:=allowed||ARRAY['closeEventId']; END IF;
 IF action='link' THEN allowed:=allowed||ARRAY['successorJobId','predecessorBindingId','successorBindingId']; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(input) k WHERE NOT k=ANY(allowed)) OR EXISTS(SELECT 1 FROM unnest(allowed) k WHERE NOT input ? k) THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 BEGIN
  cid:=(input->>'commandId')::uuid; expected:=(input->>'expectedRevision')::bigint;
  IF action='link' THEN successor:=(input->>'successorJobId')::uuid; p.id:=(input->>'predecessorBindingId')::uuid; s.id:=(input->>'successorBindingId')::uuid; END IF;
  IF action='cancel_finish' THEN predecessor:=(input->>'markerId')::uuid; END IF;
  IF action='reopen' THEN predecessor:=(input->>'closeEventId')::uuid; END IF;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END;
 IF cid IS NULL OR expected NOT BETWEEN 0 AND 9007199254740991
  OR (action IN('cancel_finish','reopen') AND predecessor IS NULL)
  OR (action='link' AND (successor IS NULL OR p.id IS NULL OR s.id IS NULL OR successor=j))
  OR (action='close' AND (input->>'reason' IS NULL OR input->>'reason' NOT IN('cancelled_by_customer','abandoned','completed_outside_jobguard','other') OR jsonb_typeof(input->'note') IS DISTINCT FROM 'string' OR length(btrim(input->>'note',E' \t\r\n')) NOT BETWEEN 1 AND 2000))
 THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 actor:=app.ch4_require_command_owner(t,j,digest);
 IF action='link' THEN PERFORM app.ch4_require_command_owner(t,successor,digest); END IF;
 -- Live-only commands retain the repository's first SHARE lock. Taking UPDATE
 -- here would deadlock parallel duplicates upgrading their mutually held SHAREs.
 IF action IN('finish','cancel_finish') THEN
  PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 ELSE
  PERFORM 1 FROM app.job WHERE tenant_id=t AND id IN(j,successor) ORDER BY id FOR UPDATE;
 END IF;
 actor:=app.ch4_require_command_owner(t,j,digest);
 IF action='link' THEN PERFORM app.ch4_require_command_owner(t,successor,digest); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('watchdog-command-id:'||t::text||':'||cid::text,0));
 actor:=app.ch4_require_command_owner(t,j,digest);
 IF action='link' THEN PERFORM app.ch4_require_command_owner(t,successor,digest); END IF;
 request_digest:=app.final_lock_hash(jsonb_build_object('jobId',j,'actor',actor,'sessionDigest',digest,'input',input));
 IF EXISTS(SELECT 1 FROM app.watchdog_command_identity WHERE tenant_id=t AND command_id=cid AND
  (job_id<>j OR command_type<>'WorkState.'||action OR request_hash<>request_digest))
 THEN RAISE EXCEPTION 'WORK_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.command_type IS DISTINCT FROM 'WorkState.'||action OR prior.request_hash IS DISTINCT FROM request_digest OR prior.actor_membership_id IS DISTINCT FROM actor OR prior.status<>'succeeded' THEN RAISE EXCEPTION 'WORK_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result;
 END IF;
 -- Current authority precedes live state; live state precedes revision.
 -- Replays above retain their original snapshot even after lifecycle changes.
 IF action IN('finish','cancel_finish') THEN PERFORM app.require_watchdog_live(j); END IF;
 -- Same serializer as the event trigger, acquired before reading the revision.
 -- Distinct finish/cancel IDs may share the job SHARE lock but cannot race facts.
 IF action IN('finish','cancel_finish') THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,144));
 END IF;
 SELECT coalesce(max(sequence),0) INTO seq FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j;
 revision:=seq+(SELECT count(*) FROM app.job_link WHERE tenant_id=t AND predecessor_job_id=j);
 IF expected<>revision THEN RAISE EXCEPTION 'WORK_STATE_STALE_REVISION' USING ERRCODE='40001'; END IF;
 SELECT * INTO latest FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j AND kind IN('closed','reopened') ORDER BY sequence DESC LIMIT 1;
 SELECT * INTO marker FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j AND kind IN('finished_on_site','finished_cancelled') ORDER BY sequence DESC LIMIT 1;
 IF action IN('finish','cancel_finish') THEN
  -- Stored replay precedes current lifecycle checks, but never current authority.
  PERFORM app.ch4_require_open(t,j);
 END IF;
 IF action='finish' AND EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 IF action='finish' THEN
  IF marker.kind='finished_on_site' THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
  event_kind:='finished_on_site';
 ELSIF action='cancel_finish' THEN
  IF marker.kind IS DISTINCT FROM 'finished_on_site' OR marker.id IS DISTINCT FROM predecessor THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
  event_kind:='finished_cancelled';
 ELSIF action='close' THEN
  IF latest.kind='closed' THEN RAISE EXCEPTION 'JOB_WORK_CLOSED'; END IF;
  event_kind:='closed';
 ELSIF action='reopen' THEN
  IF latest.kind IS DISTINCT FROM 'closed' OR latest.id IS DISTINCT FROM predecessor THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
  -- A locked reopen permits non-site administration only. It changes no job,
  -- baseline, lock, activation or check record.
  IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN PERFORM app.ch4_admit_place(t,j,action); END IF;
  event_kind:='reopened';
 ELSE
  SELECT b.* INTO p FROM app.job_party_binding b JOIN app.job_party_current c ON(c.tenant_id,c.job_id,c.binding_id)=(b.tenant_id,b.job_id,b.id)
   WHERE b.tenant_id=t AND b.job_id=j AND b.id=(input->>'predecessorBindingId')::uuid;
  SELECT b.* INTO s FROM app.job_party_binding b JOIN app.job_party_current c ON(c.tenant_id,c.job_id,c.binding_id)=(b.tenant_id,b.job_id,b.id)
   WHERE b.tenant_id=t AND b.job_id=successor AND b.id=(input->>'successorBindingId')::uuid;
  IF p.id IS NULL OR s.id IS NULL OR (p.customer_id,p.site_id,p.paying_party_id) IS DISTINCT FROM (s.customer_id,s.site_id,s.paying_party_id)
   OR NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j)
   OR NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=successor AND provenance='system_generated_quote')
  THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 END IF;
 -- Legacy watchdog stores share the same identity lock; reserve their IDs even
 -- when no modern watchdog identity row has been written yet.
 IF app.ch4_legacy_command_owned(t,cid) THEN RAISE EXCEPTION 'WORK_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
 -- The checked receipt binds the narrow administrative identity exception.
 -- The per-id lock is already held; no commercial/network action occurs here.
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(t,cid,'WorkState.'||action,cid::text,request_digest,'processing',actor);
 INSERT INTO app.watchdog_command_identity(tenant_id,command_id,job_id,command_type,request_hash)
 VALUES(t,cid,j,'WorkState.'||action,request_digest);
 at_time:=clock_timestamp();
 IF action='link' THEN
  PERFORM set_config('app.ch4_link_envelope',jsonb_build_object('jobId',j,'actor',actor,'sessionDigest',digest,'input',input)::text,true);
  INSERT INTO app.job_link(tenant_id,id,predecessor_job_id,successor_job_id,predecessor_binding_id,successor_binding_id,customer_id,site_id,paying_party_id,command_id,actor_membership_id,linked_at,request_hash,audit_event_id)
  VALUES(t,fact_id,j,successor,p.id,s.id,p.customer_id,p.site_id,p.paying_party_id,cid,actor,at_time,request_digest,audit_id);
  PERFORM set_config('app.ch4_link_envelope',coalesce(old_link_envelope,''),true);
 ELSE
  INSERT INTO app.job_work_state_event(tenant_id,job_id,id,sequence,kind,fact_at,actor_membership_id,command_id,predecessor_id,close_reason,close_note,request_hash,audit_event_id)
  VALUES(t,j,fact_id,seq+1,event_kind,at_time,actor,cid,predecessor,CASE WHEN action='close' THEN input->>'reason' END,CASE WHEN action='close' THEN input->>'note' END,request_digest,audit_id);
 END IF;
 command_result:=app.ch4_command_work_facts(t,j,digest);
 UPDATE app.command_receipt SET status='succeeded',result=command_result,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=cid;
 -- Drain only our audit constraint after the last business write/lock.
 IF action='link' THEN SET CONSTRAINTS app."A0_ch4_link_audit" IMMEDIATE; ELSE SET CONSTRAINTS app."A0_ch4_event_audit" IMMEDIATE; END IF;
 PERFORM app.ch4_require_command_owner(t,j,digest);
 IF action='link' THEN PERFORM app.ch4_require_command_owner(t,successor,digest); END IF;
 RETURN command_result;
END $$;
CREATE FUNCTION app.ch4_record_work_state(t uuid,j uuid,digest text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF input->>'action' IS NULL OR input->>'action'='link' THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 RETURN app.ch4_work_state_command(t,j,digest,input);
END $$;
CREATE FUNCTION app.ch4_link_post_lock_job(t uuid,j uuid,digest text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF input->>'action' IS DISTINCT FROM 'link' THEN RAISE EXCEPTION 'INVALID_WORK_STATE_INPUT'; END IF;
 RETURN app.ch4_work_state_command(t,j,digest,input);
END $$;

CREATE OR REPLACE FUNCTION app.ch4_guard_final_check_admission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE latest text; old_context text:=current_setting('app.tenant_id',true);
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(old_context,'')::uuid AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true);
 -- NEW has different row types on these two tables. A combined AND expression
 -- still resolves the missing status field on final_account_lock.
 -- All new check records, including completion, require open state.
 PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id FOR UPDATE;
 SELECT kind INTO latest FROM app.job_work_state_event WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND kind IN('closed','reopened') ORDER BY sequence DESC LIMIT 1;
 IF latest='closed' THEN RAISE EXCEPTION 'JOB_WORK_CLOSED'; END IF;
 PERFORM set_config('app.tenant_id',coalesce(old_context,''),true); RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.job_source_insert_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND job_track='small_builder' AND environment='synthetic_demo')
 THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME<>'job_source_original' THEN
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id FOR UPDATE;
 IF TG_TABLE_NAME<>'job_source_original' THEN
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 PERFORM app.ch4_require_open(NEW.tenant_id,NEW.job_id);
 PERFORM app.require_watchdog_live(NEW.job_id);
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.reveal_shadow_signals(p_tenant uuid,p_job uuid) RETURNS SETOF app.shadow_commercial_signal
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE locked boolean:=false;
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 -- Same job lock order as disclosure; SV-4 must serialize its lock insertion here too.
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM app.ch4_require_open(p_tenant,p_job);
 IF to_regclass('app.final_account_lock') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2)' INTO locked USING p_tenant,p_job;
 END IF;
 -- Constant audit shape regardless of number/existence of hidden signals.
 PERFORM app.append_shadow_audit(gen_random_uuid(),p_job,'shadow.reveal_requested');
 IF NOT locked THEN RETURN; END IF;
 RETURN QUERY SELECT * FROM app.shadow_commercial_signal WHERE tenant_id=p_tenant AND job_id=p_job AND state='revealed';
END $$;

-- Exact 0187 PDF implementation, adding only the open-state check AFTER replay.
CREATE OR REPLACE FUNCTION app.issue_lock_bound_customer_invoice(p_tenant uuid,p_job uuid,p_revision uuid,p_actor uuid,p_command uuid,p_kind text,p_recipient text,p_issued_on date,p_source_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE lock_row app.final_account_lock; check_row app.final_account_lock_check; final_row app.final_account_revision; prior app.command_receipt;
 request_digest text; party_snapshot jsonb; n bigint; number text; artifact text; digest text; invoice_id uuid:=gen_random_uuid();
 decision_id uuid:=gen_random_uuid(); resolution_id uuid:=gen_random_uuid(); authorization_id uuid:=gen_random_uuid(); audit_id uuid:=gen_random_uuid();
 net bigint; tax bigint; gross bigint; selected_lines jsonb; result jsonb; item jsonb;

 -- ASCII PDF 1.4 objects: offsets and lengths below are byte counts of the stored artifact.
 pdf_rows text[]:=ARRAY[]::text[]; pdf_objects text[]; pdf_offsets bigint[]:=ARRAY[0::bigint];
 pdf_raw text; pdf_line text; pdf_stream text; pdf_kids text:=''; pdf_xref bigint;
 pdf_page integer; pdf_pages integer; pdf_i integer; pdf_j integer; pdf_content integer; pdf_font integer;
BEGIN
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_job::text,130));
 IF p_kind IS NULL OR p_kind NOT IN ('final','supplementary') OR p_command IS NULL OR p_issued_on IS NULL OR p_issued_on NOT BETWEEN '0001-01-01'::date AND '9999-12-31'::date OR p_recipient IS NULL OR p_recipient !~ '^[^@ ]+@example\.invalid$' OR p_source_hash IS NULL OR p_source_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 request_digest:=app.final_lock_hash(jsonb_build_object('command','IssueLockBoundInvoice','job',p_job,'revision',p_revision,'actor',p_actor,'kind',p_kind,'recipient',p_recipient,'issuedOn',p_issued_on,'sourceHash',p_source_hash));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN IF prior.command_type<>'IssueLockBoundInvoice' OR prior.request_hash<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF; RETURN prior.result; END IF;
 PERFORM app.ch4_require_open(p_tenant,p_job);
 SELECT * INTO lock_row FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 SELECT * INTO check_row FROM app.final_account_lock_check WHERE tenant_id=p_tenant AND job_id=p_job AND lock_id=lock_row.id AND evidence_cutoff_at=lock_row.locked_at ORDER BY created_at DESC,id DESC LIMIT 1;
 IF check_row.status='failed' THEN RAISE EXCEPTION 'FINAL_CHECK_FAILED'; END IF;
 IF check_row.status IS DISTINCT FROM 'completed' THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 SELECT * INTO final_row FROM app.final_account_revision WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_revision AND source_hash=p_source_hash AND NOT issue_blocked;
 IF NOT FOUND THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT' USING ERRCODE='40001'; END IF;
 IF final_row.baseline_quote_version_id<>lock_row.baseline_quote_version_id THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
 IF p_kind='final' AND p_revision<>lock_row.final_account_revision_id THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
 IF p_kind='final' AND EXISTS(SELECT 1 FROM app.customer_invoice i LEFT JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id) WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(b.invoice_kind,'final')='final') THEN RAISE EXCEPTION 'FINAL_INVOICE_ALREADY_ISSUED'; END IF;
 IF p_kind='supplementary' THEN
  IF p_revision=lock_row.final_account_revision_id OR NOT EXISTS(SELECT 1 FROM app.customer_invoice i LEFT JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id) WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(b.invoice_kind,'final')='final') THEN RAISE EXCEPTION 'SUPPLEMENTARY_INVOICE_BASE_REQUIRED'; END IF;
  IF NOT EXISTS(WITH RECURSIVE ancestors AS (SELECT id,previous_revision_id FROM app.final_account_revision WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_revision
   UNION ALL SELECT r.id,r.previous_revision_id FROM app.final_account_revision r JOIN ancestors a ON r.id=a.previous_revision_id WHERE r.tenant_id=p_tenant AND r.job_id=p_job) SELECT 1 FROM ancestors WHERE id=lock_row.final_account_revision_id) THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.final_account_draft WHERE tenant_id=p_tenant AND job_id=p_job AND current_revision_id=p_revision) THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT'; END IF;
  -- A replacement/removal is a correction, not a newly added catch line. Fail closed until explicitly corrected.
  IF EXISTS(SELECT 1 FROM app.customer_invoice i JOIN app.final_account_line old ON(old.tenant_id,old.job_id,old.final_account_revision_id)=(i.tenant_id,i.job_id,i.final_account_revision_id)
   LEFT JOIN app.final_account_invoice_binding binding ON(binding.tenant_id,binding.job_id,binding.invoice_id)=(i.tenant_id,i.job_id,i.id)
   WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(binding.invoice_kind,'final') IN ('final','supplementary')
   AND NOT EXISTS(SELECT 1 FROM app.final_account_line current_line WHERE current_line.tenant_id=p_tenant AND current_line.job_id=p_job AND current_line.final_account_revision_id=p_revision
    AND (current_line.line_kind,current_line.source_id,current_line.commercial_revision_id,current_line.scope_item_id,current_line.net_pence)=(old.line_kind,old.source_id,old.commercial_revision_id,old.scope_item_id,old.net_pence))) THEN RAISE EXCEPTION 'INVOICE_SOURCE_CORRECTION_REQUIRED'; END IF;
 END IF;
 -- Account lines retain immutable commercial source identity across account revisions.
 SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'),coalesce(sum(l.net_pence),0) INTO selected_lines,net FROM app.final_account_line l
 WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.final_account_revision_id=p_revision AND (
 p_kind='final' OR (NOT EXISTS(SELECT 1 FROM app.final_account_invoiced_line b WHERE b.tenant_id=p_tenant AND b.job_id=p_job AND b.line_kind=l.line_kind AND b.source_id=l.source_id AND b.commercial_revision_id=l.commercial_revision_id)
 AND NOT EXISTS(SELECT 1 FROM app.customer_invoice i JOIN app.final_account_line old ON(old.tenant_id,old.job_id,old.final_account_revision_id)=(i.tenant_id,i.job_id,i.final_account_revision_id)
 WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND NOT EXISTS(SELECT 1 FROM app.final_account_invoice_binding b WHERE(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id))
 AND old.line_kind=l.line_kind AND old.source_id=l.source_id AND old.commercial_revision_id=l.commercial_revision_id)));
 IF jsonb_array_length(selected_lines)=0 OR net<0 OR net>1000000000000 THEN RAISE EXCEPTION 'INVOICE_AMOUNT_INVALID'; END IF;
 -- Same exact positive standard-rate candidate expression as merged 0028; no float arithmetic.
 tax:=(net+2)/5; gross:=net+tax;
 IF gross>1000000000000 THEN RAISE EXCEPTION 'INVOICE_AMOUNT_INVALID'; END IF;
 IF p_kind='final' AND ROW(net,tax,gross) IS DISTINCT FROM ROW(final_row.net_pence,final_row.tax_pence,final_row.total_pence) THEN RAISE EXCEPTION 'FINAL_ACCOUNT_TOTAL_MISMATCH'; END IF;
 party_snapshot:=app.require_current_job_parties(p_tenant,p_job);
 INSERT INTO app.customer_invoice_sequence(id,tenant_id,next_number) VALUES(gen_random_uuid(),p_tenant,2) ON CONFLICT(tenant_id) DO UPDATE SET next_number=app.customer_invoice_sequence.next_number+1 RETURNING next_number-1 INTO n;
 number:='DEMO-CUST-'||lpad(n::text,6,'0');
 artifact:='Number: '||number||chr(10)||'Issue date: '||p_issued_on::text||chr(10)||
  'Issuer: Fictional Builder Ltd ['||p_tenant::text||']'||chr(10)||'Recipient: '||p_recipient||chr(10)||
  'Reference tax version: '||final_row.tax_policy_version||chr(10)||'Frozen final account: '||final_row.id::text||chr(10)||
  'Source hash: '||final_row.source_hash||chr(10)||
  'Lock: '||lock_row.id::text||chr(10)||'Kind: '||p_kind||chr(10)||
  'Net GBP: '||to_char(net::numeric/100,'FM999999999990.00')||chr(10)||
  'VAT GBP: '||to_char(tax::numeric/100,'FM999999999990.00')||chr(10)||
  'Total GBP: '||to_char(gross::numeric/100,'FM999999999990.00')||chr(10)||
  coalesce((SELECT string_agg((l->>'description')||' | Net GBP: '||to_char((l->>'net_pence')::numeric/100,'FM999999999990.00'),chr(10) ORDER BY (l->>'ordinal')::integer,l->>'id')
   FROM jsonb_array_elements(selected_lines) l),'')||chr(10)||party_snapshot::text;

 -- Convert the exact approved snapshot to printable, wrapped rows (same ASCII fallback as quote PDFs).
 FOREACH pdf_raw IN ARRAY string_to_array(artifact,chr(10)) LOOP
  pdf_raw:=regexp_replace(pdf_raw,'[^ -~]','?','g');
  IF length(pdf_raw)=0 THEN pdf_rows:=array_append(pdf_rows,''); END IF;
  pdf_i:=1;
  WHILE pdf_i<=length(pdf_raw) LOOP
   pdf_rows:=array_append(pdf_rows,substr(pdf_raw,pdf_i,90)); pdf_i:=pdf_i+90;
  END LOOP;
 END LOOP;
 pdf_pages:=greatest(1,(cardinality(pdf_rows)+53)/54); pdf_font:=3+pdf_pages*2;
 pdf_objects:=ARRAY['<< /Type /Catalog /Pages 2 0 R >>',''];
 FOR pdf_page IN 1..pdf_pages LOOP
  pdf_i:=3+(pdf_page-1)*2; pdf_content:=pdf_i+1;
  pdf_kids:=pdf_kids||pdf_i::text||' 0 R ';
  pdf_stream:='BT /F1 8 Tf 40 790 Td 12 TL'||chr(10)||
   '(SYNTHETIC - NOT A REAL INVOICE) Tj'||chr(10)||
   'T* (Practice sandbox - synthetic data; nothing is sent or charged) Tj'||chr(10)||
   'T* (Not a real tax invoice) Tj';
  FOR pdf_j IN ((pdf_page-1)*54+1)..least(pdf_page*54,cardinality(pdf_rows)) LOOP
   pdf_line:=replace(replace(replace(pdf_rows[pdf_j],chr(92),chr(92)||chr(92)),'(',chr(92)||'('),')',chr(92)||')');
   pdf_stream:=pdf_stream||chr(10)||'T* ('||pdf_line||') Tj';
  END LOOP;
  pdf_stream:=pdf_stream||chr(10)||'ET';
  pdf_objects:=array_append(pdf_objects,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '||pdf_font||' 0 R >> >> /Contents '||pdf_content||' 0 R >>');
  pdf_objects:=array_append(pdf_objects,'<< /Length '||octet_length(pdf_stream)||' >>'||chr(10)||'stream'||chr(10)||pdf_stream||chr(10)||'endstream');
 END LOOP;
 pdf_objects[2]:='<< /Type /Pages /Kids ['||pdf_kids||'] /Count '||pdf_pages||' >>';
 pdf_objects:=array_append(pdf_objects,'<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
 artifact:='%PDF-1.4'||chr(10);
 FOR pdf_i IN 1..cardinality(pdf_objects) LOOP
  pdf_offsets:=array_append(pdf_offsets,octet_length(artifact)::bigint);
  artifact:=artifact||pdf_i||' 0 obj'||chr(10)||pdf_objects[pdf_i]||chr(10)||'endobj'||chr(10);
 END LOOP;
 pdf_xref:=octet_length(artifact);
 artifact:=artifact||'xref'||chr(10)||'0 '||(cardinality(pdf_objects)+1)||chr(10)||'0000000000 65535 f '||chr(10);
 FOR pdf_i IN 2..cardinality(pdf_offsets) LOOP
  artifact:=artifact||lpad(pdf_offsets[pdf_i]::text,10,'0')||' 00000 n '||chr(10);
 END LOOP;
 artifact:=artifact||'trailer << /Size '||(cardinality(pdf_objects)+1)||' /Root 1 0 R >>'||chr(10)||'startxref'||chr(10)||pdf_xref||chr(10)||'%%EOF';
 digest:=encode(sha256(convert_to(artifact,'UTF8')),'hex');
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision_id,p_tenant,'job',p_job::text,'final_account.issue');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'final_account.issue',p_recipient,digest,final_row.revision,gross,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
 VALUES(invoice_id,p_tenant,p_job,p_revision,authorization_id,number,p_issued_on,jsonb_build_object('legalName','Fictional Builder Ltd','runIdentity',p_tenant),final_row.tax_policy_version,'GBP',net,tax,gross,final_row.source_hash,digest,convert_to(artifact,'UTF8'),true,'SYNTHETIC - NOT A REAL INVOICE');
 INSERT INTO app.final_account_invoice_binding(tenant_id,job_id,invoice_id,invoice_kind,lock_id,revision_id,check_id) VALUES(p_tenant,p_job,invoice_id,p_kind,lock_row.id,p_revision,check_row.id);
 -- Largest-remainder display allocation of the one group tax; tie-break by line ID, as core allocation.
 -- Display tax follows merged absolute-net weights; invoice totals use the one group calculation.
 FOR item IN WITH weights AS(SELECT value,abs((value->>'net_pence')::numeric) weight FROM jsonb_array_elements(selected_lines)),
 parts AS(SELECT value,CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE floor(tax::numeric*weight/sum(weight) OVER()) END base,
 CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE mod(tax::numeric*weight,sum(weight) OVER()) END remainder FROM weights),
 ranked AS(SELECT *,row_number() OVER(ORDER BY remainder DESC,value->>'id') rank,tax-sum(base) OVER() left_over FROM parts)
 SELECT value||jsonb_build_object('allocated_tax',base+CASE WHEN rank<=left_over THEN 1 ELSE 0 END) FROM ranked LOOP
  INSERT INTO app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id,revision_id,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,tax_pence,gross_pence)
  VALUES(p_tenant,p_job,invoice_id,(item->>'id')::uuid,p_revision,(item->>'scope_item_id')::uuid,(item->>'commercial_revision_id')::uuid,item->>'line_kind',(item->>'source_id')::uuid,(item->>'net_pence')::bigint,(item->>'allocated_tax')::bigint,(item->>'net_pence')::bigint+(item->>'allocated_tax')::bigint);
 END LOOP;
 INSERT INTO app.customer_invoice_evidence(id,tenant_id,job_id,invoice_id,evidence_id,object_version_id,sha256,scope_item_id)
 SELECT gen_random_uuid(),p_tenant,p_job,invoice_id,evidence_id,object_version_id,sha256,scope_item_id FROM app.final_account_proof WHERE tenant_id=p_tenant AND job_id=p_job AND final_account_revision_id=p_revision;
 INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at,status,completed_at)
 VALUES(gen_random_uuid(),p_tenant,authorization_id,'fake_invoice_delivery','lock-invoice:'||invoice_id,'final_account.issue',p_recipient,digest,artifact,final_row.revision,gross,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes','succeeded',transaction_timestamp());
 result:=jsonb_build_object('invoiceId',invoice_id,'invoiceNumber',number,'pdfSha256',digest,'netPence',net,'taxPence',tax,'totalPence',gross,'sourceHash',p_source_hash,'invoiceKind',p_kind,'lockId',lock_row.id);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_tenant,p_command,'IssueLockBoundInvoice',p_revision::text,request_digest,'succeeded',result,p_actor,clock_timestamp());
 PERFORM app.append_final_lock_audit(audit_id,p_actor,p_job,'customer_invoice.lock_bound_issued',jsonb_build_object('invoiceId',invoice_id,'lockId',lock_row.id,'checkId',check_row.id,'commandId',p_command),jsonb_build_object('pdf',digest));
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION app.ch4_guard_new_site_work() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE applies boolean:=true;
BEGIN
 IF TG_TABLE_NAME='supplier_document' THEN applies:=NEW.document_type='invoice'; END IF;
 IF TG_TABLE_NAME='supplier_document_intake' THEN applies:=EXISTS(SELECT 1 FROM app.supplier_document d WHERE (d.tenant_id,d.job_id,d.id)=(NEW.tenant_id,NEW.job_id,NEW.document_id) AND d.document_type='invoice'); END IF;
 IF TG_TABLE_NAME='variation' THEN applies:=NEW.origin='builder_logged' AND NEW.job_track='small_builder'; END IF;
 IF TG_TABLE_NAME='evidence_upload' THEN
  applies:=NEW.expected_content_type IN('image/png','image/jpeg','image/webp');
  -- The existing begin-upload replay still reaches INSERT ... ON CONFLICT. Match only the existing request contract.
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM app.evidence_upload u WHERE (u.tenant_id,u.job_id,u.id)=(NEW.tenant_id,NEW.job_id,NEW.id)
   AND u.scope_item_id IS NOT DISTINCT FROM NEW.scope_item_id AND u.object_key=NEW.object_key AND u.expected_sha256=NEW.expected_sha256 AND u.expected_content_type=NEW.expected_content_type
   AND u.maximum_bytes=NEW.maximum_bytes AND u.retention_class=NEW.retention_class AND u.device_captured_at IS NOT DISTINCT FROM NEW.device_captured_at) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.state NOT IN('quarantined','verified') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.state=OLD.state AND NEW.object_version_id IS NOT DISTINCT FROM OLD.object_version_id THEN RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME='scope_progress' THEN applies:=NEW.stage IN('in_progress','complete') AND NEW.stage IS DISTINCT FROM OLD.stage; END IF;
 -- Proof evidence types: packages/core/src/proof.ts (proofEvidenceTypeSchema).
 IF TG_TABLE_NAME='evidence_object' THEN applies:=NEW.kind='original' AND NEW.evidence_type IN('pre_cover_photo','completion_photo','excavation_photo','electrical_certificate'); END IF;
 IF NOT applies THEN RETURN NEW; END IF;
 IF NOT app.ch4_source_job(NEW.tenant_id,NEW.job_id) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN
  RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' USING ERRCODE='P0001', DETAIL=(SELECT jsonb_build_object('version','job-linked-offer.v1','code','POST_LOCK_WORK_REQUIRES_LINKED_JOB','message','Start a linked job for this customer and site','jobId',NEW.job_id,'customerId',b.customer_id,'siteId',b.site_id)::text FROM app.job_party_current c JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(c.tenant_id,c.job_id,c.binding_id) WHERE c.tenant_id=NEW.tenant_id AND c.job_id=NEW.job_id);
 END IF;
 PERFORM app.ch4_require_open(NEW.tenant_id,NEW.job_id);
 RETURN NEW;
END $$;

DO $$ DECLARE fn regprocedure; BEGIN
 FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='app' AND p.proname IN('ch4_legacy_command_owned','ch4_command_work_facts','ch4_require_command_owner','ch4_require_open','ch4_admit_place','ch4_work_state_command','ch4_record_work_state','ch4_link_post_lock_job') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO jobguard_migration',fn);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access',fn);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION app.ch4_record_work_state(uuid,uuid,text,jsonb) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.ch4_link_post_lock_job(uuid,uuid,text,jsonb) TO jobguard_runtime;
COMMIT;
