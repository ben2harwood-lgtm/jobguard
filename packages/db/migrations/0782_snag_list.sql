-- QW-4: the job's snag list (practice mode only). A snag is written once; a change of
-- details is a new revision. Fixed, checked and reopened are append-only events, and
-- the snag's state is derived from them. Up to six verified photos per snag.
BEGIN;

-- One row per snag command, so an exact retry returns the first answer and a reused
-- command id with another request is refused.
CREATE TABLE app.snag_command (
 tenant_id uuid NOT NULL,
 command_id uuid NOT NULL,
 job_id uuid NOT NULL,
 snag_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('add','revise','fixed','checked','reopened')),
 request_hash char(64) NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL,
 actor_membership_id uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);

CREATE TABLE app.snag (
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 id uuid NOT NULL,
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 200 AND title=btrim(title)),
 location text CHECK(location IS NULL OR (char_length(location) BETWEEN 1 AND 120 AND location=btrim(location))),
 -- Free text ("Dave (sparky)"): subcontractors are not members yet.
 assignee_label text CHECK(assignee_label IS NULL OR (char_length(assignee_label) BETWEEN 1 AND 120 AND assignee_label=btrim(assignee_label))),
 due_on date,
 created_by_membership_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by_membership_id) REFERENCES app.membership(tenant_id,id)
);

-- Revision 1 is the snag row itself; each change of details adds the next revision.
CREATE TABLE app.snag_revision (
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 snag_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>=2),
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 200 AND title=btrim(title)),
 location text CHECK(location IS NULL OR (char_length(location) BETWEEN 1 AND 120 AND location=btrim(location))),
 assignee_label text CHECK(assignee_label IS NULL OR (char_length(assignee_label) BETWEEN 1 AND 120 AND assignee_label=btrim(assignee_label))),
 due_on date,
 actor_membership_id uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,snag_id,revision),
 FOREIGN KEY(tenant_id,job_id,snag_id) REFERENCES app.snag(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);

CREATE TABLE app.snag_event (
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 snag_id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence>=1),
 kind text NOT NULL CHECK(kind IN('fixed','checked','reopened')),
 actor_membership_id uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,snag_id,sequence),
 FOREIGN KEY(tenant_id,job_id,snag_id) REFERENCES app.snag(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);

-- A verified snag photo of the same job, linked once, at most six per snag.
CREATE TABLE app.snag_photo (
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 snag_id uuid NOT NULL,
 evidence_id uuid NOT NULL,
 position smallint NOT NULL CHECK(position BETWEEN 1 AND 6),
 sha256 char(64) NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 received_at timestamptz NOT NULL,
 actor_membership_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,snag_id,evidence_id),
 UNIQUE(tenant_id,snag_id,position),
 UNIQUE(tenant_id,evidence_id),
 FOREIGN KEY(tenant_id,job_id,snag_id) REFERENCES app.snag(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,evidence_id) REFERENCES app.evidence_object(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);

-- Which snag a practice photo upload was begun for, fixed at begin. A begin retry naming another snag,
-- and a finalize naming another snag, conflict (Codex P2 4685550045).
CREATE TABLE app.snag_photo_upload (
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 upload_id uuid NOT NULL,
 snag_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,upload_id),
 FOREIGN KEY(tenant_id,job_id,snag_id) REFERENCES app.snag(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,upload_id) REFERENCES app.evidence_upload(tenant_id,id)
);

DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['snag_command','snag','snag_revision','snag_event','snag_photo','snag_photo_upload'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_migration,jobguard_runtime
   USING (tenant_id=nullif((SELECT app.lp11_policy_tenant())::text,'''')::uuid)
   WITH CHECK (tenant_id=nullif((SELECT app.lp11_policy_tenant())::text,'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure',n);
  -- Reads only; every write goes through the checked routines below.
  EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n||'_immutable',n);
  EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n||'_no_truncate',n);
 END LOOP;
END $$;

-- The bound practice member for a job that this practice session owns. Practice mode only:
-- any other database, a missing or foreign binding, or another session's job is refused.
CREATE FUNCTION app.snag_practice_actor(t uuid,j uuid) RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE d text:=nullif(current_setting('app.practice_material_digest',true),''); actor uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'SNAG_PRACTICE_ONLY' USING ERRCODE='42501'; END IF;
 actor:=app.current_actor();
 IF t IS NULL OR j IS NULL OR actor IS NULL OR t IS DISTINCT FROM app.current_tenant() OR d IS NULL OR d !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- The bound credential is this owner, or one of its linked credentials.
 IF NOT (app.final_check_bound_practice(t,d) OR EXISTS(SELECT 1 FROM control_plane.identity_practice_credential c
   WHERE c.owner_digest=d AND app.final_check_bound_practice(t,c.token_digest)))
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT app.final_check_practice_owns_job(t,j,d) THEN RAISE EXCEPTION 'SNAG_NOT_FOUND' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;
ALTER FUNCTION app.snag_practice_actor(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.snag_practice_actor(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

-- An earlier answer for this command id: the same request replays it; anything else conflicts.
CREATE FUNCTION app.snag_replay(t uuid,j uuid,c uuid,k text,h text,actor uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE earlier app.snag_command;
BEGIN
 IF c IS NULL THEN RAISE EXCEPTION 'SNAG_INVALID' USING ERRCODE='22023'; END IF;
 -- Snag command ids share the tenant-wide command namespace (Codex P1 4685299253): the same per-id lock every
 -- watchdog claim takes, then an id already claimed there (a photo step, any other command) conflicts.
 PERFORM pg_advisory_xact_lock(hashtextextended('watchdog-command-id:'||lower(t::text)||':'||lower(c::text),0));
 SELECT * INTO earlier FROM app.snag_command WHERE tenant_id=t AND command_id=c;
 IF earlier.command_id IS NULL THEN
  IF EXISTS(SELECT 1 FROM app.watchdog_command_identity w WHERE w.tenant_id=t AND w.command_id=c)
  THEN RAISE EXCEPTION 'SNAG_COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN NULL;
 END IF;
 IF earlier.job_id<>j OR earlier.kind<>k OR earlier.request_hash<>h OR earlier.actor_membership_id<>actor
 THEN RAISE EXCEPTION 'SNAG_COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 RETURN earlier.result;
END $$;
ALTER FUNCTION app.snag_replay(uuid,uuid,uuid,text,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.snag_replay(uuid,uuid,uuid,text,text,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

-- The other direction: a watchdog claim (such as a photo begin or finalize) of an id a snag command already used
-- conflicts. The claim holds the same per-id lock first, so a snag command cannot slip in between.
CREATE FUNCTION app.snag_reserved_command_id() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.snag_command s WHERE s.tenant_id=NEW.tenant_id AND s.command_id=NEW.command_id)
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.snag_reserved_command_id() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.snag_reserved_command_id() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER c_snag_command_id_before_insert BEFORE INSERT ON app.watchdog_command_identity FOR EACH ROW EXECUTE FUNCTION app.snag_reserved_command_id();

-- Every fresh snag outcome appends to the tenant audit chain in the same transaction
-- (AGENTS.md 5.7). The payload holds identifiers and hashes only, never the snag's text.
CREATE FUNCTION app.snag_audit(t uuid,j uuid,s uuid,actor uuid,k text,refs jsonb,h text,result jsonb) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||actor::text,
  'eventType','snag.'||k,'subjectType','job','subjectRef',j::text,
  'payload',jsonb_build_object('references',jsonb_build_object('snagId',s::text,'environment','synthetic_demo')||refs,
   'hashes',jsonb_strip_nulls(jsonb_build_object('request',h,'result',app.final_lock_hash(result))),
   'classifications',jsonb_build_object('action','operational')))),'checked_operation');
END $$;
ALTER FUNCTION app.snag_audit(uuid,uuid,uuid,uuid,text,jsonb,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.snag_audit(uuid,uuid,uuid,uuid,text,jsonb,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

CREATE FUNCTION app.snag_add(j uuid,c uuid,s uuid,p_title text,p_location text,p_assignee text,p_due date) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; h text; result jsonb;
BEGIN
 actor:=app.snag_practice_actor(t,j);
 PERFORM app.require_watchdog_live(j);
 h:=encode(sha256(convert_to(jsonb_build_array('snag.add.v1',j,s,p_title,p_location,p_assignee,p_due)::text,'UTF8')),'hex');
 result:=app.snag_replay(t,j,c,'add',h,actor);
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF s IS NULL OR EXISTS(SELECT 1 FROM app.snag WHERE tenant_id=t AND id=s) THEN RAISE EXCEPTION 'SNAG_COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 INSERT INTO app.snag(tenant_id,job_id,id,title,location,assignee_label,due_on,created_by_membership_id)
 VALUES(t,j,s,p_title,p_location,p_assignee,p_due,actor);
 result:=jsonb_build_object('version','snag-command-result.v1','snagId',s,'revision',1);
 INSERT INTO app.snag_command(tenant_id,command_id,job_id,snag_id,kind,request_hash,result,actor_membership_id) VALUES(t,c,j,s,'add',h,result,actor);
 PERFORM app.snag_audit(t,j,s,actor,'add',jsonb_build_object('commandId',c::text),h,result);
 RETURN result;
END $$;

-- The current details, for revision and the read model.
CREATE FUNCTION app.snag_current_revision(t uuid,s uuid) RETURNS integer
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce((SELECT max(r.revision) FROM app.snag_revision r WHERE r.tenant_id=t AND r.snag_id=s),1)
$$;
ALTER FUNCTION app.snag_current_revision(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.snag_current_revision(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

-- The latest event decides the state: none or reopened is open, then fixed, then checked.
CREATE FUNCTION app.snag_last_event(t uuid,s uuid) RETURNS app.snag_event
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT e.* FROM app.snag_event e WHERE e.tenant_id=t AND e.snag_id=s ORDER BY e.sequence DESC LIMIT 1
$$;
ALTER FUNCTION app.snag_last_event(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.snag_last_event(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

CREATE FUNCTION app.snag_revise(j uuid,c uuid,s uuid,p_expected integer,p_title text,p_location text,p_assignee text,p_due date) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; h text; result jsonb; current integer; last app.snag_event;
BEGIN
 actor:=app.snag_practice_actor(t,j);
 PERFORM app.require_watchdog_live(j);
 h:=encode(sha256(convert_to(jsonb_build_array('snag.revise.v1',j,s,p_expected,p_title,p_location,p_assignee,p_due)::text,'UTF8')),'hex');
 result:=app.snag_replay(t,j,c,'revise',h,actor);
 IF result IS NOT NULL THEN RETURN result; END IF;
 PERFORM 1 FROM app.snag WHERE tenant_id=t AND job_id=j AND id=s FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SNAG_NOT_FOUND' USING ERRCODE='42501'; END IF;
 current:=app.snag_current_revision(t,s);
 IF p_expected IS DISTINCT FROM current THEN RAISE EXCEPTION 'SNAG_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 -- A checked snag is closed: reopen it before changing what it says.
 last:=app.snag_last_event(t,s);
 IF last.kind='checked' THEN RAISE EXCEPTION 'SNAG_TRANSITION_REFUSED' USING ERRCODE='22023'; END IF;
 INSERT INTO app.snag_revision(tenant_id,job_id,snag_id,revision,title,location,assignee_label,due_on,actor_membership_id)
 VALUES(t,j,s,current+1,p_title,p_location,p_assignee,p_due,actor);
 result:=jsonb_build_object('version','snag-command-result.v1','snagId',s,'revision',current+1);
 INSERT INTO app.snag_command(tenant_id,command_id,job_id,snag_id,kind,request_hash,result,actor_membership_id) VALUES(t,c,j,s,'revise',h,result,actor);
 PERFORM app.snag_audit(t,j,s,actor,'revise',jsonb_build_object('commandId',c::text),h,result);
 RETURN result;
END $$;

-- open -> fixed -> checked; fixed or checked -> reopened -> open. The check comes from
-- someone other than the fixer whenever another active member has worked on this job's
-- snag list; a lone builder may tick both.
CREATE FUNCTION app.snag_record_event(j uuid,c uuid,s uuid,p_kind text) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; h text; result jsonb; last app.snag_event; next integer;
BEGIN
 actor:=app.snag_practice_actor(t,j);
 PERFORM app.require_watchdog_live(j);
 IF p_kind IS NULL OR p_kind NOT IN('fixed','checked','reopened') THEN RAISE EXCEPTION 'SNAG_INVALID' USING ERRCODE='22023'; END IF;
 h:=encode(sha256(convert_to(jsonb_build_array('snag.event.v1',j,s,p_kind)::text,'UTF8')),'hex');
 result:=app.snag_replay(t,j,c,p_kind,h,actor);
 IF result IS NOT NULL THEN RETURN result; END IF;
 PERFORM 1 FROM app.snag WHERE tenant_id=t AND job_id=j AND id=s FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SNAG_NOT_FOUND' USING ERRCODE='42501'; END IF;
 last:=app.snag_last_event(t,s);
 IF (p_kind='fixed' AND last.kind IS NOT NULL AND last.kind<>'reopened')
  OR (p_kind='checked' AND last.kind IS DISTINCT FROM 'fixed')
  OR (p_kind='reopened' AND last.kind IS DISTINCT FROM 'fixed' AND last.kind IS DISTINCT FROM 'checked')
 THEN RAISE EXCEPTION 'SNAG_TRANSITION_REFUSED' USING ERRCODE='22023'; END IF;
 IF p_kind='checked' AND last.actor_membership_id=actor AND EXISTS(
  SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id<>actor AND m.role<>'read_only'
   AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND (EXISTS(SELECT 1 FROM app.snag x WHERE x.tenant_id=t AND x.job_id=j AND x.created_by_membership_id=m.id)
    OR EXISTS(SELECT 1 FROM app.snag_command x WHERE x.tenant_id=t AND x.job_id=j AND x.actor_membership_id=m.id)))
 THEN RAISE EXCEPTION 'SNAG_CHECKER_MUST_DIFFER' USING ERRCODE='42501'; END IF;
 next:=coalesce(last.sequence,0)+1;
 INSERT INTO app.snag_event(tenant_id,job_id,snag_id,sequence,kind,actor_membership_id) VALUES(t,j,s,next,p_kind,actor);
 result:=jsonb_build_object('version','snag-command-result.v1','snagId',s,'sequence',next,'kind',p_kind);
 INSERT INTO app.snag_command(tenant_id,command_id,job_id,snag_id,kind,request_hash,result,actor_membership_id) VALUES(t,c,j,s,p_kind,h,result,actor);
 PERFORM app.snag_audit(t,j,s,actor,p_kind,jsonb_build_object('commandId',c::text),h,result);
 RETURN result;
END $$;

-- Records, inside the begin transaction, the snag a photo upload is for. The same snag is a no-op (a retry);
-- another snag conflicts.
CREATE FUNCTION app.snag_bind_photo_upload(j uuid,s uuid,u uuid) RETURNS void
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; bound uuid;
BEGIN
 PERFORM app.snag_practice_actor(t,j);
 PERFORM app.require_watchdog_live(j);
 IF NOT EXISTS(SELECT 1 FROM app.evidence_upload x WHERE x.tenant_id=t AND x.job_id=j AND x.id=u AND x.scope_item_id IS NULL)
 THEN RAISE EXCEPTION 'SNAG_PHOTO_REFUSED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.snag x WHERE x.tenant_id=t AND x.job_id=j AND x.id=s)
 THEN RAISE EXCEPTION 'SNAG_NOT_FOUND' USING ERRCODE='42501'; END IF;
 INSERT INTO app.snag_photo_upload(tenant_id,job_id,upload_id,snag_id) VALUES(t,j,u,s) ON CONFLICT DO NOTHING;
 SELECT snag_id INTO bound FROM app.snag_photo_upload WHERE tenant_id=t AND upload_id=u;
 IF bound IS DISTINCT FROM s THEN RAISE EXCEPTION 'SNAG_COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
END $$;

-- Links one freshly verified snag photo of this job, inside the evidence finalize
-- transaction. The same photo on the same snag is a no-op; anything else is refused.
CREATE FUNCTION app.snag_attach_photo(j uuid,s uuid,evidence uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; o app.evidence_object; linked app.snag_photo; n integer;
BEGIN
 actor:=app.snag_practice_actor(t,j);
 PERFORM app.require_watchdog_live(j);
 PERFORM 1 FROM app.snag WHERE tenant_id=t AND job_id=j AND id=s FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SNAG_NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT * INTO linked FROM app.snag_photo WHERE tenant_id=t AND evidence_id=evidence;
 IF linked.evidence_id IS NOT NULL THEN
  IF linked.snag_id<>s OR linked.job_id<>j THEN RAISE EXCEPTION 'SNAG_PHOTO_REFUSED' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('version','snag-photo-result.v1','snagId',s,'evidenceId',evidence,'position',linked.position);
 END IF;
 SELECT e.* INTO o FROM app.evidence_object e JOIN app.evidence_upload u ON (u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id)
 WHERE (e.tenant_id,e.job_id,e.id)=(t,j,evidence) AND e.kind='original' AND e.evidence_type='snag_photo' AND e.scope_item_id IS NULL
  AND u.state='verified' AND u.object_version_id=e.object_version_id
  AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(e.tenant_id,e.id));
 IF o.id IS NULL THEN RAISE EXCEPTION 'SNAG_PHOTO_REFUSED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.snag_photo_upload b WHERE b.tenant_id=t AND b.upload_id=o.upload_id AND b.snag_id=s AND b.job_id=j)
 THEN RAISE EXCEPTION 'SNAG_COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 SELECT count(*) INTO n FROM app.snag_photo WHERE tenant_id=t AND snag_id=s;
 IF n>=6 THEN RAISE EXCEPTION 'PHOTO_LIMIT_REACHED' USING ERRCODE='22023'; END IF;
 INSERT INTO app.snag_photo(tenant_id,job_id,snag_id,evidence_id,position,sha256,received_at,actor_membership_id)
 VALUES(t,j,s,evidence,n+1,btrim(o.sha256),o.server_verified_at,actor);
 PERFORM app.snag_audit(t,j,s,actor,'photo_attached',jsonb_build_object('evidenceId',evidence::text),NULL,
  jsonb_build_object('version','snag-photo-result.v1','snagId',s,'evidenceId',evidence,'position',n+1));
 RETURN jsonb_build_object('version','snag-photo-result.v1','snagId',s,'evidenceId',evidence,'position',n+1);
END $$;

ALTER FUNCTION app.snag_add(uuid,uuid,uuid,text,text,text,date) OWNER TO jobguard_migration;
ALTER FUNCTION app.snag_revise(uuid,uuid,uuid,integer,text,text,text,date) OWNER TO jobguard_migration;
ALTER FUNCTION app.snag_record_event(uuid,uuid,uuid,text) OWNER TO jobguard_migration;
ALTER FUNCTION app.snag_attach_photo(uuid,uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.snag_bind_photo_upload(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.snag_bind_photo_upload(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.snag_bind_photo_upload(uuid,uuid,uuid) TO jobguard_runtime;
REVOKE ALL ON FUNCTION app.snag_add(uuid,uuid,uuid,text,text,text,date),app.snag_revise(uuid,uuid,uuid,integer,text,text,text,date),
 app.snag_record_event(uuid,uuid,uuid,text),app.snag_attach_photo(uuid,uuid,uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.snag_add(uuid,uuid,uuid,text,text,text,date),app.snag_revise(uuid,uuid,uuid,integer,text,text,text,date),
 app.snag_record_event(uuid,uuid,uuid,text),app.snag_attach_photo(uuid,uuid,uuid) TO jobguard_runtime;

COMMIT;
