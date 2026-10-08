BEGIN;
-- SV-2 expand-only synthetic persistence. SV-4 owns the lock; SV-5 owns reconciliation writes.
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_shadow') THEN
  CREATE ROLE jobguard_shadow NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_shadow_emergency_access') THEN
  CREATE ROLE jobguard_shadow_emergency_access NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('jobguard_shadow','jobguard_shadow_emergency_access') AND
  (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)) OR
  EXISTS(SELECT 1 FROM pg_auth_members WHERE member IN(SELECT oid FROM pg_roles WHERE rolname IN('jobguard_shadow','jobguard_shadow_emergency_access'))) THEN
  RAISE EXCEPTION 'unsafe shadow role posture' USING ERRCODE='42501';
 END IF;
END $$;
GRANT USAGE ON SCHEMA app TO jobguard_shadow,jobguard_shadow_emergency_access;
-- No membership grants. Emergency holders are a separate G1 approval, not established here.
-- Schema USAGE is new for these two roles. Four older SECURITY DEFINER routines in app were
-- never revoked from PUBLIC, so the new roles would inherit EXECUTE on them. Close that now;
-- jobguard_runtime keeps its own explicit grants on each (granted in 0016, 0017 and 0027) and
-- the owner keeps EXECUTE, so builder behaviour does not change.
REVOKE EXECUTE ON FUNCTION
 app.advance_final_account_draft(uuid,uuid,uuid,integer),
 app.invalidate_stale_final_account_authorizations(uuid,uuid,char(64)),
 app.reserve_customer_invoice_number(uuid),
 app.issue_practice_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,date)
 FROM PUBLIC;

ALTER TABLE app.evidence_object ADD CONSTRAINT evidence_shadow_version_identity
 UNIQUE(tenant_id,job_id,id,object_version_id,sha256,server_received_at);
ALTER TABLE app.final_account_line ADD CONSTRAINT final_account_line_shadow_identity UNIQUE(tenant_id,job_id,id);
CREATE TABLE app.shadow_commercial_signal (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, work_id uuid NOT NULL,
 job_track varchar(16) NOT NULL DEFAULT 'small_builder' CHECK(job_track='small_builder'),
 signal_type varchar(300) NOT NULL CHECK(length(signal_type)>0),
 detector_kind varchar(20) NOT NULL CHECK(detector_kind IN ('deterministic','ai_proposal')),
 detector_version varchar(300) NOT NULL CHECK(length(detector_version)>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), evidence_cutoff_at timestamptz NOT NULL,
 description varchar(4000) NOT NULL CHECK(length(description)>0),
 estimated_value_pence bigint CHECK(estimated_value_pence BETWEEN 0 AND 1000000000000),
 confidence_band varchar(10) NOT NULL CHECK(confidence_band IN ('low','medium','high')),
 must_surface_now boolean NOT NULL DEFAULT false, disclosed_before_lock boolean NOT NULL DEFAULT false,
 first_builder_visible_at timestamptz,
 state varchar(30) NOT NULL DEFAULT 'candidate' CHECK(state IN ('candidate','held_for_final_check','reconciled','revealed','dismissed','confirmed_extra','attribution_disputed','recovery_case_created','surfaced_early')),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 outcome varchar(40) CHECK(outcome IN ('already_in_original_scope','builder_captured','already_on_final_account','duplicate_signal','not_enough_evidence')),
 matched_scope_item_id uuid, matched_variation_id uuid, matched_final_account_line_id uuid, coalesced_into_signal_id uuid,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,job_track) REFERENCES app.job_commercial_track(tenant_id,job_id,job_track),
 FOREIGN KEY(tenant_id,job_id,matched_scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,matched_variation_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,matched_final_account_line_id) REFERENCES app.final_account_line(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,coalesced_into_signal_id) REFERENCES app.shadow_commercial_signal(tenant_id,job_id,id),
 CHECK(coalesced_into_signal_id IS NULL OR coalesced_into_signal_id<>id),
 CHECK(NOT disclosed_before_lock OR first_builder_visible_at IS NOT NULL),
 CHECK(state<>'surfaced_early' OR disclosed_before_lock)
);
CREATE TABLE app.shadow_signal_evidence (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,signal_id uuid NOT NULL,evidence_id uuid NOT NULL,
 object_version_id varchar(1024) NOT NULL,sha256 char(64) NOT NULL,source_received_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,job_id,signal_id,evidence_id,object_version_id),
 FOREIGN KEY(tenant_id,job_id,signal_id) REFERENCES app.shadow_commercial_signal(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,evidence_id,object_version_id,sha256,source_received_at)
 REFERENCES app.evidence_object(tenant_id,job_id,id,object_version_id,sha256,server_received_at)
);
CREATE TABLE app.shadow_signal_ineligibility (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,id uuid NOT NULL,signal_id uuid NOT NULL,
 reason varchar(40) NOT NULL CHECK(reason IN ('disclosed_before_lock','surfaced_early','evidence_after_lock','pre_adoption_evidence','attribution_disputed')),
 source_ref varchar(300) NOT NULL CHECK(length(source_ref)>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,signal_id,reason,source_ref),
 FOREIGN KEY(tenant_id,job_id,signal_id) REFERENCES app.shadow_commercial_signal(tenant_id,job_id,id)
);
CREATE TABLE app.shadow_reconciliation_run (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,id uuid NOT NULL,
 policy_version varchar(80) NOT NULL CHECK(length(policy_version)>0),evidence_cutoff_at timestamptz NOT NULL,
 status varchar(12) NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','failed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id)
);
CREATE TABLE app.shadow_signal_classification (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,id uuid NOT NULL,run_id uuid NOT NULL,signal_id uuid NOT NULL,
 outcome varchar(40) NOT NULL CHECK(outcome IN ('already_in_original_scope','builder_captured','already_on_final_account','duplicate_signal','not_enough_evidence','reveal')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,run_id,signal_id),UNIQUE(tenant_id,job_id,run_id,signal_id),
 FOREIGN KEY(tenant_id,job_id,run_id) REFERENCES app.shadow_reconciliation_run(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,signal_id) REFERENCES app.shadow_commercial_signal(tenant_id,job_id,id)
);
CREATE TABLE app.shadow_signal_disposition (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,id uuid NOT NULL,run_id uuid NOT NULL,signal_id uuid NOT NULL,
 disposition varchar(40) NOT NULL CHECK(disposition IN ('confirmed_extra','already_included','in_original_scope','not_completed','not_chargeable','wrong_job_or_evidence','attribution_disputed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,run_id,signal_id) REFERENCES app.shadow_signal_classification(tenant_id,job_id,run_id,signal_id)
);
CREATE TABLE app.shadow_disclosure_event (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,id uuid NOT NULL,signal_id uuid NOT NULL,
 route varchar(40) NOT NULL CHECK(route IN ('must_surface_override','support_conversation','export','data_subject_access','defect','tell_me_now','trial_job_live','paid_human_review','drawing_review','upgrade_bridge')),
 actor_ref varchar(200) NOT NULL,before_lock boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,job_id,signal_id) REFERENCES app.shadow_commercial_signal(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE app.shadow_break_glass_access (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,id uuid NOT NULL,
 actor_ref varchar(200) NOT NULL,reason varchar(1000) NOT NULL CHECK(length(btrim(reason))>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE app.variation_withdrawal (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,id uuid NOT NULL,variation_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL,reason_code varchar(40) NOT NULL CHECK(reason_code IN ('not_completed','duplicate_capture','entered_in_error','builder_withdrawn')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,variation_id),
 FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['shadow_commercial_signal','shadow_signal_evidence','shadow_signal_ineligibility','shadow_reconciliation_run','shadow_signal_classification','shadow_signal_disposition','shadow_disclosure_event','shadow_break_glass_access','variation_withdrawal'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_shadow,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow_emergency_access',n);
  IF n<>'variation_withdrawal' THEN
   EXECUTE format('GRANT SELECT ON app.%I TO jobguard_shadow',n);
   IF n NOT IN ('shadow_disclosure_event','shadow_break_glass_access') THEN EXECUTE format('GRANT INSERT ON app.%I TO jobguard_shadow',n); END IF;
  END IF;
  -- Statement triggers deny even empty mutations, including owner TRUNCATE.
  EXECUTE format('CREATE TRIGGER shadow_no_delete BEFORE DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
  IF n<>'shadow_commercial_signal' THEN
   EXECUTE format('CREATE TRIGGER shadow_no_update BEFORE UPDATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
  END IF;
 END LOOP;
END $$;
CREATE POLICY withdrawal_runtime ON app.variation_withdrawal FOR ALL TO jobguard_runtime
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON app.variation_withdrawal TO jobguard_runtime;
GRANT UPDATE(state,revision,outcome,matched_scope_item_id,matched_variation_id,matched_final_account_line_id,coalesced_into_signal_id) ON app.shadow_commercial_signal TO jobguard_shadow;

CREATE FUNCTION app.guard_shadow_signal() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.created_at:=clock_timestamp();
  IF NEW.disclosed_before_lock OR NEW.first_builder_visible_at IS NOT NULL THEN
   RAISE EXCEPTION 'disclosure requires the controlled routine' USING ERRCODE='55000';
  END IF;
 ELSE
  IF ROW(NEW.tenant_id,NEW.job_id,NEW.id,NEW.work_id,NEW.job_track,NEW.signal_type,NEW.detector_kind,NEW.detector_version,NEW.created_at,NEW.evidence_cutoff_at,NEW.description,NEW.estimated_value_pence,NEW.confidence_band,NEW.must_surface_now)
   IS DISTINCT FROM ROW(OLD.tenant_id,OLD.job_id,OLD.id,OLD.work_id,OLD.job_track,OLD.signal_type,OLD.detector_kind,OLD.detector_version,OLD.created_at,OLD.evidence_cutoff_at,OLD.description,OLD.estimated_value_pence,OLD.confidence_band,OLD.must_surface_now)
   OR (OLD.disclosed_before_lock AND NOT NEW.disclosed_before_lock)
   OR (OLD.first_builder_visible_at IS NOT NULL AND NEW.first_builder_visible_at IS DISTINCT FROM OLD.first_builder_visible_at)
   OR (OLD.coalesced_into_signal_id IS NOT NULL AND NEW.coalesced_into_signal_id IS DISTINCT FROM OLD.coalesced_into_signal_id)
   OR (OLD.state='surfaced_early' AND NEW.state<>'surfaced_early') THEN
   RAISE EXCEPTION 'immutable shadow provenance or disclosure' USING ERRCODE='55000';
  END IF;
  IF (NEW.disclosed_before_lock IS DISTINCT FROM OLD.disclosed_before_lock OR NEW.first_builder_visible_at IS DISTINCT FROM OLD.first_builder_visible_at)
   AND current_user<>'jobguard_migration' THEN RAISE EXCEPTION 'disclosure requires the controlled routine' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER shadow_signal_guard BEFORE INSERT OR UPDATE ON app.shadow_commercial_signal FOR EACH ROW EXECUTE FUNCTION app.guard_shadow_signal();
ALTER FUNCTION app.guard_shadow_signal() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_shadow_signal() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;

ALTER TABLE app.extra_origin ADD COLUMN source_signal_id uuid;
ALTER TABLE app.extra_origin ADD CONSTRAINT extra_origin_source_signal_kind CHECK((kind='jobguard_catch')=(source_signal_id IS NOT NULL));
ALTER TABLE app.extra_origin ADD CONSTRAINT extra_origin_source_signal_fk FOREIGN KEY(tenant_id,job_id,source_signal_id) REFERENCES app.shadow_commercial_signal(tenant_id,job_id,id);
-- The BEFORE trigger refuses runtime probes before FK checks (FKs ignore RLS).
CREATE OR REPLACE FUNCTION app.validate_extra_origin() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE c app.command_receipt;expected_kind varchar;actual_role varchar;
BEGIN
 IF (NEW.source_signal_id IS NOT NULL OR NEW.kind='jobguard_catch') AND pg_has_role(current_user,'jobguard_runtime','USAGE') AND NOT pg_has_role(current_user,'jobguard_migration','USAGE') THEN
  RAISE EXCEPTION 'shadow origin unavailable through runtime' USING ERRCODE='42501';
 END IF;
 IF (NEW.kind='jobguard_catch') IS DISTINCT FROM (NEW.source_signal_id IS NOT NULL) THEN
  RAISE EXCEPTION 'source signal required only for a catch' USING ERRCODE='23514';
 END IF;
 IF NEW.provenance<>'command' THEN
  IF current_user<>'jobguard_migration' AND NOT pg_has_role(current_user,'jobguard_migration','USAGE') THEN
   RAISE EXCEPTION 'legacy provenance is migration/trigger-only' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO c FROM app.command_receipt WHERE tenant_id=NEW.tenant_id AND command_id=NEW.command_id;
 expected_kind:=CASE c.command_type WHEN 'LogSiteExtra' THEN 'site_user' WHEN 'ConfirmPrompt' THEN 'jobguard_surfaced_confirmed'
  WHEN 'RecordOfficeExtra' THEN 'office_entry' WHEN 'RecordClientInstruction' THEN 'client_instruction'
  WHEN 'LogBuilderExtra' THEN 'builder_logged' WHEN 'AddFinalReviewExtra' THEN 'final_review' WHEN 'ConfirmJobGuardCatch' THEN 'jobguard_catch' END;
 SELECT role INTO actual_role FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.raising_membership_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp());
 IF expected_kind IS NULL OR expected_kind<>NEW.kind OR c.status<>'processing' OR c.actor_membership_id IS DISTINCT FROM NEW.raising_membership_id
  OR actual_role IS DISTINCT FROM NEW.raising_role OR c.semantic_key<>('extra-origin:'||NEW.job_id::text||':'||NEW.variation_id::text) THEN
  RAISE EXCEPTION 'exact raising command and actor required' USING ERRCODE='23514';
 END IF;
 NEW.server_recorded_at:=transaction_timestamp();
 SELECT capture_kind,encode(sha256(convert_to(capture_text,'UTF8')),'hex') INTO NEW.source_capture_kind,NEW.source_capture_hash
 FROM app.variation WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.variation_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.validate_extra_origin() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;

-- Private audit implementation, callable ONLY by migration-owned bounded routines.
-- The existing per-tenant audit head remains the final lock in each routine.
CREATE FUNCTION app.append_shadow_audit(p_event uuid,p_job uuid,p_type text,p_reason_hash text DEFAULT NULL) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;seq bigint;prev text;ts timestamptz;payload_text text;ph text;eh text;actor text:='role:'||session_user;
BEGIN
 IF t IS NULL OR p_type IS NULL OR p_type NOT IN ('shadow.reveal_requested','shadow.disclosed','shadow.emergency_read') OR actor !~ '^[A-Za-z0-9_.:@/-]+$' THEN RAISE EXCEPTION 'invalid shadow audit' USING ERRCODE='22023'; END IF;
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();
 seq:=seq+1;ts:=date_trunc('milliseconds',clock_timestamp());
 payload_text:=CASE WHEN p_reason_hash IS NULL THEN '' ELSE '"hashes":{"reason":"'||p_reason_hash||'"},' END;
 payload_text:='{'||payload_text||'"references":{"eventId":"'||p_event::text||'","jobId":"'||p_job::text||'"}}';
 ph:=encode(sha256(convert_to(payload_text,'UTF8')),'hex');
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,actor,p_type,'job',p_job::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(p_event,t,seq,'audit.v1',actor,p_type,'job',p_job::text,ts,payload_text::jsonb,ph,prev,eh);
 PERFORM app.advance_audit_head(seq,eh);
END $$;
ALTER FUNCTION app.append_shadow_audit(uuid,uuid,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.append_shadow_audit(uuid,uuid,text,text) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;

CREATE FUNCTION app.reveal_shadow_signals(p_tenant uuid,p_job uuid) RETURNS SETOF app.shadow_commercial_signal
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE locked boolean:=false;
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 -- Same job lock order as disclosure; SV-4 must serialize its lock insertion here too.
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF to_regclass('app.final_account_lock') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2)' INTO locked USING p_tenant,p_job;
 END IF;
 -- Constant audit shape regardless of number/existence of hidden signals.
 PERFORM app.append_shadow_audit(gen_random_uuid(),p_job,'shadow.reveal_requested');
 IF NOT locked THEN RETURN; END IF;
 RETURN QUERY SELECT * FROM app.shadow_commercial_signal WHERE tenant_id=p_tenant AND job_id=p_job AND state='revealed';
END $$;

CREATE FUNCTION app.record_shadow_disclosure(p_tenant uuid,p_job uuid,p_signal uuid,p_event uuid,p_route text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE locked boolean:=false;prior app.shadow_disclosure_event;visible_at timestamptz;
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF p_event IS NULL OR p_signal IS NULL OR p_job IS NULL OR p_route IS NULL OR p_route NOT IN ('must_surface_override','support_conversation','export','data_subject_access','defect','tell_me_now','trial_job_live','paid_human_review','drawing_review','upgrade_bridge') THEN RAISE EXCEPTION 'invalid disclosure' USING ERRCODE='22023'; END IF;
 -- USAGE, not MEMBER: PostgreSQL 16 gives a non-superuser role creator an ADMIN-only membership
 -- (no INHERIT, no SET) that must not count as holding the separate support permission.
 IF p_route='support_conversation' AND NOT pg_has_role(session_user,'jobguard_shadow_emergency_access','USAGE') THEN
  RAISE EXCEPTION 'separate support permission required' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow subject mismatch' USING ERRCODE='23503'; END IF;
 SELECT * INTO prior FROM app.shadow_disclosure_event WHERE tenant_id=p_tenant AND id=p_event;
 IF FOUND THEN
  IF ROW(prior.job_id,prior.signal_id,prior.route,prior.actor_ref) IS DISTINCT FROM ROW(p_job,p_signal,p_route,'role:'||session_user) THEN RAISE EXCEPTION 'disclosure replay conflict' USING ERRCODE='23505'; END IF;
  RETURN prior.id;
 END IF;
 PERFORM 1 FROM app.shadow_commercial_signal WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_signal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow subject mismatch' USING ERRCODE='23503'; END IF;
 IF to_regclass('app.final_account_lock') IS NOT NULL THEN EXECUTE 'SELECT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2)' INTO locked USING p_tenant,p_job; END IF;
 INSERT INTO app.shadow_disclosure_event(tenant_id,job_id,id,signal_id,route,actor_ref,before_lock)
 VALUES(p_tenant,p_job,p_event,p_signal,p_route,'role:'||session_user,NOT locked) RETURNING created_at INTO visible_at;
 IF NOT locked THEN
  UPDATE app.shadow_commercial_signal SET disclosed_before_lock=true,first_builder_visible_at=coalesce(first_builder_visible_at,visible_at),state='surfaced_early',revision=revision+1 WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_signal;
  INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref)
  VALUES(p_tenant,p_job,gen_random_uuid(),p_signal,'disclosed_before_lock',p_event::text),(p_tenant,p_job,gen_random_uuid(),p_signal,'surfaced_early',p_event::text);
 ELSE
  UPDATE app.shadow_commercial_signal SET first_builder_visible_at=coalesce(first_builder_visible_at,visible_at) WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_signal;
 END IF;
 PERFORM app.append_shadow_audit(p_event,p_job,'shadow.disclosed');
 RETURN p_event;
END $$;

CREATE FUNCTION app.read_shadow_emergency(p_tenant uuid,p_job uuid,p_reason text) RETURNS SETOF app.shadow_commercial_signal
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE event_id uuid:=gen_random_uuid();
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason))=0 OR length(p_reason)>1000 THEN RAISE EXCEPTION 'emergency access reason required' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow subject mismatch' USING ERRCODE='23503'; END IF;
 INSERT INTO app.shadow_break_glass_access(tenant_id,job_id,id,actor_ref,reason) VALUES(p_tenant,p_job,event_id,'role:'||session_user,btrim(p_reason));
 PERFORM app.append_shadow_audit(event_id,p_job,'shadow.emergency_read',encode(sha256(convert_to(btrim(p_reason),'UTF8')),'hex'));
 RETURN QUERY SELECT * FROM app.shadow_commercial_signal WHERE tenant_id=p_tenant AND job_id=p_job;
END $$;
ALTER FUNCTION app.reveal_shadow_signals(uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.record_shadow_disclosure(uuid,uuid,uuid,uuid,text) OWNER TO jobguard_migration;
ALTER FUNCTION app.read_shadow_emergency(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.reveal_shadow_signals(uuid,uuid),app.record_shadow_disclosure(uuid,uuid,uuid,uuid,text),app.read_shadow_emergency(uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.reveal_shadow_signals(uuid,uuid) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.record_shadow_disclosure(uuid,uuid,uuid,uuid,text) TO jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.read_shadow_emergency(uuid,uuid,text) TO jobguard_shadow_emergency_access;
COMMIT;
