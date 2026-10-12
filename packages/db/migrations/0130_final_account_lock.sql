BEGIN;
-- SV-4 owns side tables only. Whole-row fingerprinted commercial tables are untouched.
CREATE TABLE app.final_account_lock (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL,
 final_account_revision_id uuid NOT NULL, baseline_quote_version_id uuid NOT NULL,
 capture_register_hash char(64) NOT NULL CHECK(capture_register_hash ~ '^[a-f0-9]{64}$'),
 line_set_hash char(64) NOT NULL CHECK(line_set_hash ~ '^[a-f0-9]{64}$'),
 scope_disposition_hash char(64) NOT NULL CHECK(scope_disposition_hash ~ '^[a-f0-9]{64}$'),
 snapshot_digest char(64) NOT NULL CHECK(snapshot_digest ~ '^[a-f0-9]{64}$'), snapshot jsonb NOT NULL,
 declaration text NOT NULL CHECK(declaration='I''ve reviewed the work and extras on this job and this is my complete final account.'),
 declaration_version text NOT NULL CHECK(declaration_version='final_account_declaration.v1'),
 onboarding_terms_version text NOT NULL CHECK(onboarding_terms_version='synthetic_final_check_terms.v1'),
 locking_membership_id uuid NOT NULL, locked_at timestamptz NOT NULL, command_id uuid NOT NULL, audit_event_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,job_id,id,locked_at),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,final_account_revision_id) REFERENCES app.final_account_revision(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,baseline_quote_version_id) REFERENCES app.quote_version(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,locking_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE app.final_account_scope_disposition (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, scope_item_id uuid NOT NULL,
 disposition text NOT NULL CHECK(disposition IN ('done','removed','deferred')),
 actor_membership_id uuid NOT NULL, recorded_at timestamptz NOT NULL, command_id uuid NOT NULL, audit_event_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE app.final_check_terms_acceptance (
 tenant_id uuid NOT NULL, id uuid NOT NULL, terms_version text NOT NULL CHECK(terms_version='synthetic_final_check_terms.v1'),
 accepting_membership_id uuid NOT NULL, accepted_at timestamptz NOT NULL, command_id uuid NOT NULL, audit_event_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,accepting_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE app.final_account_lock_check (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, lock_id uuid NOT NULL, evidence_cutoff_at timestamptz NOT NULL,
 run_id uuid, status text NOT NULL CHECK(status IN ('pending','failed','completed')), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,job_id,lock_id,id), UNIQUE(tenant_id,job_id,lock_id,created_at),
 FOREIGN KEY(tenant_id,job_id,lock_id,evidence_cutoff_at) REFERENCES app.final_account_lock(tenant_id,job_id,id,locked_at)
);
CREATE TABLE app.final_account_invoice_binding (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, invoice_id uuid NOT NULL, invoice_kind text NOT NULL CHECK(invoice_kind IN ('final','supplementary','interim')),
 lock_id uuid, revision_id uuid NOT NULL, check_id uuid,
 PRIMARY KEY(tenant_id,job_id,invoice_id), UNIQUE(tenant_id,job_id,invoice_id,revision_id),
 FOREIGN KEY(tenant_id,job_id,invoice_id) REFERENCES app.customer_invoice(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,revision_id) REFERENCES app.final_account_revision(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,lock_id) REFERENCES app.final_account_lock(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,lock_id,check_id) REFERENCES app.final_account_lock_check(tenant_id,job_id,lock_id,id),
 CHECK(invoice_kind='interim' OR (lock_id IS NOT NULL AND check_id IS NOT NULL))
);
CREATE TABLE app.final_account_invoiced_line (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, invoice_id uuid NOT NULL, final_account_line_id uuid NOT NULL, revision_id uuid NOT NULL,
 scope_item_id uuid NOT NULL, commercial_revision_id uuid NOT NULL, line_kind text NOT NULL CHECK(line_kind IN ('baseline','variation')), source_id uuid NOT NULL,
 net_pence bigint NOT NULL CHECK(abs(net_pence)<=1000000000000), tax_pence bigint NOT NULL, gross_pence bigint NOT NULL CHECK(gross_pence=net_pence+tax_pence),
 PRIMARY KEY(tenant_id,job_id,invoice_id,final_account_line_id),
 UNIQUE(tenant_id,job_id,line_kind,source_id,commercial_revision_id),
 FOREIGN KEY(tenant_id,job_id,invoice_id,revision_id) REFERENCES app.final_account_invoice_binding(tenant_id,job_id,invoice_id,revision_id),
 FOREIGN KEY(tenant_id,job_id,scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,final_account_line_id) REFERENCES app.final_account_line(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,revision_id) REFERENCES app.final_account_revision(tenant_id,job_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['final_account_lock','final_account_scope_disposition','final_check_terms_acceptance','final_account_lock_check','final_account_invoice_binding','final_account_invoiced_line'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_infrastructure',n);
  EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);
  EXECUTE format('CREATE TRIGGER final_lock_no_mutation BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;
-- Q2: exactly this table gains shadow INSERT. No new callable routine is granted to shadow.
CREATE POLICY check_shadow_insert ON app.final_account_lock_check FOR INSERT TO jobguard_shadow
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT INSERT ON app.final_account_lock_check TO jobguard_shadow;
CREATE FUNCTION app.guard_final_account_lock_check() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 OR NOT pg_has_role(current_user,'jobguard_shadow','USAGE') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- INVOKER cannot read lock/job tables. The exact composite FK checks the binding.
 -- This advisory lock serializes status append with issue; no extra table privilege is required.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.job_id::text,130));
 NEW.created_at:=clock_timestamp(); RETURN NEW;
END $$;
ALTER FUNCTION app.guard_final_account_lock_check() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_final_account_lock_check() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;
CREATE TRIGGER final_lock_check_insert BEFORE INSERT ON app.final_account_lock_check FOR EACH ROW EXECUTE FUNCTION app.guard_final_account_lock_check();
-- Integrity of the side line binding without altering a fingerprinted table.
CREATE FUNCTION app.guard_final_account_invoiced_line() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.final_account_line l WHERE l.tenant_id=NEW.tenant_id AND l.job_id=NEW.job_id
  AND l.id=NEW.final_account_line_id AND l.final_account_revision_id=NEW.revision_id AND l.scope_item_id=NEW.scope_item_id
  AND l.commercial_revision_id=NEW.commercial_revision_id AND l.line_kind=NEW.line_kind AND l.source_id=NEW.source_id AND l.net_pence=NEW.net_pence)
 THEN RAISE EXCEPTION 'INVOICED_LINE_BINDING_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_final_account_invoiced_line() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_final_account_invoiced_line() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;
CREATE TRIGGER final_invoiced_line_insert BEFORE INSERT ON app.final_account_invoiced_line FOR EACH ROW EXECUTE FUNCTION app.guard_final_account_invoiced_line();

-- Persistence encoding of SV-1 canonical bytes, checked against the existing core implementation.
-- Core keeps its one canonicaliser. These helpers are private, with no PUBLIC EXECUTE.
CREATE FUNCTION app.final_lock_canonical(v jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,app AS $$
DECLARE result text;
BEGIN
 CASE jsonb_typeof(v)
 WHEN 'object' THEN SELECT '{'||coalesce(string_agg(to_jsonb(e.key)::text||':'||app.final_lock_canonical(e.value),',' ORDER BY e.key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(v) e;
 WHEN 'array' THEN SELECT '['||coalesce(string_agg(app.final_lock_canonical(e.value),',' ORDER BY e.ordinality),'')||']' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY e;
 ELSE result:=v::text;
 END CASE;
 RETURN result;
END $$;
ALTER FUNCTION app.final_lock_canonical(jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_lock_canonical(jsonb) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;
CREATE FUNCTION app.final_lock_hash(v jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,app AS $$
 SELECT encode(sha256(convert_to(app.final_lock_canonical(v),'UTF8')),'hex')
$$;
ALTER FUNCTION app.final_lock_hash(jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_lock_hash(jsonb) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;
CREATE FUNCTION app.final_lock_require_owner(p_tenant uuid,p_actor uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION app.final_lock_require_owner(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_lock_require_owner(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;
CREATE FUNCTION app.append_final_lock_audit(p_event uuid,p_actor uuid,p_subject uuid,p_type text,p_refs jsonb,p_hashes jsonb DEFAULT '{}'::jsonb) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; seq bigint; prev text; ts timestamptz; payload jsonb; ph text; eh text; actor text:='membership:'||p_actor::text;
BEGIN
 IF p_type NOT IN ('final_account.locked','final_account.disposition_recorded','final_check.terms_accepted','customer_invoice.lock_bound_issued') THEN RAISE EXCEPTION 'invalid final lock audit'; END IF;
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp());
 payload:=jsonb_build_object('references',p_refs,'hashes',p_hashes); ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,actor,p_type,'job',p_subject::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(p_event,t,seq,'audit.v1',actor,p_type,'job',p_subject::text,ts,payload,ph,prev,eh);
 PERFORM app.advance_audit_head(seq,eh);
END $$;
ALTER FUNCTION app.append_final_lock_audit(uuid,uuid,uuid,text,jsonb,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.append_final_lock_audit(uuid,uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;

CREATE FUNCTION app.read_final_account_lock_sources(p_tenant uuid,p_job uuid,p_revision uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE captures jsonb; lines jsonb; dispositions jsonb; baseline jsonb;
BEGIN
 -- All five Log an extra states; withdrawal is a retained capture. No shadow relation is read.
 SELECT coalesce(jsonb_agg(c ORDER BY c->>'id'),'[]') INTO captures FROM (
  SELECT jsonb_build_object('version','shadow-capture.v1','tenantId',p_tenant,'jobId',p_job,'id',v.id,'scopeItemId',v.scope_item_id,
   'revisionId',coalesce(v.current_revision_id,v.id),'serverRecordedAt',to_char(o.server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'valuePence',abs(r.signed_delta_pence),'kind',CASE o.kind WHEN 'final_review' THEN 'final_review' ELSE 'log_extra' END,
   'state',CASE WHEN o.kind='final_review' THEN NULL WHEN w.id IS NOT NULL THEN 'withdrawn' ELSE v.state END,
   'scopeArea','job','description',left(v.capture_text,4000),'recordedPhase','pre_lock','aiStructured',false,'sourceRef',o.variation_id::text||':'||app.final_lock_hash(jsonb_build_object('variation',to_jsonb(v),'origin',to_jsonb(o),'revision',to_jsonb(r),'withdrawal',to_jsonb(w)))) c
  FROM app.variation v JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(v.tenant_id,v.job_id,v.id)
  LEFT JOIN app.variation_revision r ON(r.tenant_id,r.job_id,r.id)=(v.tenant_id,v.job_id,v.current_revision_id)
  LEFT JOIN app.variation_withdrawal w ON(w.tenant_id,w.job_id,w.variation_id)=(v.tenant_id,v.job_id,v.id)
  WHERE v.tenant_id=p_tenant AND v.job_id=p_job AND o.kind IN ('builder_logged','final_review')
  UNION ALL
  SELECT jsonb_build_object('version','shadow-capture.v1','tenantId',p_tenant,'jobId',p_job,'id',l.source_id,'scopeItemId',l.scope_item_id,
   'revisionId',l.commercial_revision_id,'serverRecordedAt',to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'valuePence',l.net_pence,'kind','baseline','state',NULL,'scopeArea','job','description',l.description,'recordedPhase','pre_lock','aiStructured',false,'sourceRef',l.source_id::text||':'||app.final_lock_hash(jsonb_build_object('line',to_jsonb(l),'accountRevision',to_jsonb(r))))
  FROM app.final_account_line l JOIN app.final_account_revision r ON(r.tenant_id,r.job_id,r.id)=(l.tenant_id,l.job_id,l.final_account_revision_id)
  WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.final_account_revision_id=p_revision AND l.line_kind='baseline'
 ) s;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'scopeItemId',scope_item_id,'revisionId',commercial_revision_id,'netPence',abs(net_pence),'sourceRef',source_id::text||':'||app.final_lock_hash(to_jsonb(l))) ORDER BY id),'[]'),
  coalesce(jsonb_agg(DISTINCT scope_item_id ORDER BY scope_item_id) FILTER(WHERE line_kind='baseline'),'[]') INTO lines,baseline
 FROM app.final_account_line l WHERE tenant_id=p_tenant AND job_id=p_job AND final_account_revision_id=p_revision;
 SELECT coalesce(jsonb_agg(jsonb_build_object('scopeItemId',d.scope_item_id,'disposition',d.disposition,'sourceRef',d.id::text||':'||app.final_lock_hash(to_jsonb(d))) ORDER BY d.scope_item_id),'[]') INTO dispositions FROM (
  SELECT DISTINCT ON (s.scope_item_id) s.* FROM app.final_account_scope_disposition s
  WHERE s.tenant_id=p_tenant AND s.job_id=p_job AND s.scope_item_id IN(SELECT value::text::uuid FROM jsonb_array_elements_text(baseline))
  ORDER BY s.scope_item_id,s.recorded_at DESC,s.id DESC
 ) d;
 RETURN jsonb_build_object('captureRegister',captures,'lines',lines,'scopeDispositions',dispositions,'baselineScopeItemIds',baseline);
END $$;
ALTER FUNCTION app.read_final_account_lock_sources(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.read_final_account_lock_sources(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;

CREATE FUNCTION app.read_final_account_lock_verification(p_tenant uuid,p_job uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE l app.final_account_lock; sources jsonb; captures jsonb; r app.final_account_revision;
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 sources:=app.read_final_account_lock_sources(p_tenant,p_job,l.final_account_revision_id);
 SELECT coalesce(jsonb_agg(c.value ORDER BY c.value->>'id'),'[]') INTO captures FROM jsonb_array_elements(sources->'captureRegister') c
 WHERE c.value->>'id' IN(SELECT value->>'id' FROM jsonb_array_elements(l.snapshot->'captureRegister'));
 SELECT * INTO r FROM app.final_account_revision WHERE tenant_id=p_tenant AND job_id=p_job AND id=l.final_account_revision_id;
 RETURN jsonb_build_object('snapshot',l.snapshot||sources||jsonb_build_object('captureRegister',captures,'baselineQuoteVersionId',r.baseline_quote_version_id),
  'hashes',jsonb_build_object('digest',l.snapshot_digest,'captureRegisterHash',l.capture_register_hash,'lineSetHash',l.line_set_hash,'scopeDispositionHash',l.scope_disposition_hash));
END $$;
ALTER FUNCTION app.read_final_account_lock_verification(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.read_final_account_lock_verification(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.read_final_account_lock_verification(uuid,uuid) TO jobguard_runtime;

CREATE FUNCTION app.prepare_final_review_extra(p_tenant uuid,p_job uuid,p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 PERFORM 1 FROM app.job j JOIN app.job_commercial_track t ON(t.tenant_id,t.job_id)=(j.tenant_id,j.id)
 WHERE j.tenant_id=p_tenant AND j.id=p_job AND j.status='live' AND t.job_track='small_builder' AND t.environment IN('synthetic_demo','pilot_no_charge') FOR UPDATE OF j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job) THEN RAISE EXCEPTION 'FINAL_REVIEW_CLOSED'; END IF;
END $$;
ALTER FUNCTION app.prepare_final_review_extra(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.prepare_final_review_extra(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.prepare_final_review_extra(uuid,uuid,uuid) TO jobguard_runtime;

CREATE FUNCTION app.accept_final_check_terms(p_tenant uuid,p_actor uuid,p_command uuid,p_version text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE request_digest text; prior app.command_receipt; event_id uuid:=gen_random_uuid(); row_id uuid:=gen_random_uuid(); result jsonb;
BEGIN
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 IF p_command IS NULL OR p_version IS DISTINCT FROM 'synthetic_final_check_terms.v1' THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 -- Tenant acceptance serializes independently, before the audit head; it never reads a signal.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':final-check-terms',130));
 request_digest:=app.final_lock_hash(jsonb_build_object('command','AcceptFinalCheckTerms','actor',p_actor,'version',p_version));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN IF prior.command_type<>'AcceptFinalCheckTerms' OR prior.request_hash<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF; RETURN prior.result; END IF;
 result:=jsonb_build_object('acceptanceId',row_id,'termsVersion',p_version);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_tenant,p_command,'AcceptFinalCheckTerms',p_command::text,request_digest,'succeeded',result,p_actor,clock_timestamp());
 INSERT INTO app.final_check_terms_acceptance(tenant_id,id,terms_version,accepting_membership_id,accepted_at,command_id,audit_event_id)
 VALUES(p_tenant,row_id,p_version,p_actor,clock_timestamp(),p_command,event_id);
 PERFORM app.append_final_lock_audit(event_id,p_actor,p_tenant,'final_check.terms_accepted',jsonb_build_object('acceptanceId',row_id,'commandId',p_command));
 RETURN result;
END $$;
CREATE FUNCTION app.record_final_account_disposition(p_tenant uuid,p_job uuid,p_actor uuid,p_command uuid,p_scope uuid,p_disposition text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE request_digest text; prior app.command_receipt; event_id uuid:=gen_random_uuid(); row_id uuid:=gen_random_uuid(); result jsonb; existing_lock uuid;
BEGIN
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND'; END IF;
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 request_digest:=app.final_lock_hash(jsonb_build_object('command','RecordFinalAccountDisposition','job',p_job,'actor',p_actor,'scope',p_scope,'disposition',p_disposition));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN IF prior.command_type<>'RecordFinalAccountDisposition' OR prior.request_hash<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF; RETURN prior.result; END IF;
 SELECT id INTO existing_lock FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF FOUND THEN RAISE EXCEPTION 'FINAL_REVIEW_CLOSED' USING DETAIL=existing_lock::text; END IF;
 IF p_command IS NULL OR p_disposition IS NULL OR p_disposition NOT IN ('done','removed','deferred') THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_account_line l JOIN app.final_account_draft d ON(d.tenant_id,d.job_id,d.current_revision_id)=(l.tenant_id,l.job_id,l.final_account_revision_id)
  WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.scope_item_id=p_scope AND l.line_kind='baseline') THEN RAISE EXCEPTION 'SCOPE_ITEM_NOT_BASELINE'; END IF;
 result:=jsonb_build_object('dispositionId',row_id,'scopeItemId',p_scope,'disposition',p_disposition);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_tenant,p_command,'RecordFinalAccountDisposition',p_command::text,request_digest,'succeeded',result,p_actor,clock_timestamp());
 INSERT INTO app.final_account_scope_disposition(tenant_id,job_id,id,scope_item_id,disposition,actor_membership_id,recorded_at,command_id,audit_event_id)
 VALUES(p_tenant,p_job,row_id,p_scope,p_disposition,p_actor,clock_timestamp(),p_command,event_id);
 PERFORM app.append_final_lock_audit(event_id,p_actor,p_job,'final_account.disposition_recorded',jsonb_build_object('dispositionId',row_id,'commandId',p_command,'scopeItemId',p_scope));
 RETURN result;
END $$;
CREATE FUNCTION app.lock_final_account(p_tenant uuid,p_job uuid,p_actor uuid,p_command uuid,p_revision uuid,p_expected integer,p_declaration text) RETURNS app.final_account_lock
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE request_digest text; prior app.command_receipt; existing_lock app.final_account_lock; r app.final_account_revision; sources jsonb; s jsonb;
 row_id uuid:=gen_random_uuid(); event_id uuid:=gen_random_uuid(); server_time timestamptz; result jsonb;
BEGIN
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 -- Always the job first, as in SV-2 reveal/disclosure; audit allocation is last.
 PERFORM 1 FROM app.job j JOIN app.job_commercial_track t ON(t.tenant_id,t.job_id)=(j.tenant_id,j.id)
 WHERE j.tenant_id=p_tenant AND j.id=p_job AND j.status IN ('live','invoiced','paid') AND t.job_track='small_builder'
 AND t.environment IN ('synthetic_demo','pilot_no_charge') FOR UPDATE OF j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 IF p_command IS NULL OR p_revision IS NULL OR p_expected IS NULL OR p_expected<0 OR p_declaration IS DISTINCT FROM 'final_account_declaration.v1' THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 request_digest:=app.final_lock_hash(jsonb_build_object('command','LockFinalAccount','job',p_job,'actor',p_actor,'revision',p_revision,'expected',p_expected,'declaration',p_declaration));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
  IF prior.command_type<>'LockFinalAccount' OR prior.request_hash<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
  SELECT * INTO existing_lock FROM app.final_account_lock WHERE tenant_id=p_tenant AND command_id=p_command; RETURN existing_lock;
 END IF;
 SELECT * INTO existing_lock FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_ALREADY_LOCKED' USING ERRCODE='23505',DETAIL=existing_lock.id::text; END IF;
 SELECT x.* INTO r FROM app.final_account_revision x JOIN app.final_account_draft d ON(d.tenant_id,d.job_id,d.current_revision_id)=(x.tenant_id,x.job_id,x.id)
 WHERE x.tenant_id=p_tenant AND x.job_id=p_job AND x.id=p_revision AND x.revision=p_expected AND NOT x.issue_blocked;
 IF NOT FOUND THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT' USING ERRCODE='40001'; END IF;
 PERFORM 1 FROM app.variation WHERE tenant_id=p_tenant AND job_id=p_job ORDER BY id FOR UPDATE;
 sources:=app.read_final_account_lock_sources(p_tenant,p_job,p_revision);
 IF jsonb_array_length(sources->'captureRegister')<>(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(sources->'captureRegister')) THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(sources->'captureRegister') c WHERE length(c.value->>'description') NOT BETWEEN 1 AND 4000 OR (c.value->>'valuePence')::numeric>1000000000000)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(sources->'lines') l WHERE (l.value->>'netPence')::numeric>1000000000000) THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 IF jsonb_array_length(sources->'baselineScopeItemIds')=0 OR jsonb_array_length(sources->'scopeDispositions')<>jsonb_array_length(sources->'baselineScopeItemIds') THEN RAISE EXCEPTION 'SCOPE_DISPOSITION_MISSING'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=p_tenant AND terms_version='synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED'; END IF;
 server_time:=clock_timestamp();
 s:=sources||jsonb_build_object('version','shadow-lock.v1','tenantId',p_tenant,'jobId',p_job,'finalAccountRevisionId',p_revision,'baselineQuoteVersionId',r.baseline_quote_version_id,
  'declaration','I''ve reviewed the work and extras on this job and this is my complete final account.','declarationVersion',p_declaration,'onboardingTermsVersion','synthetic_final_check_terms.v1',
  'lockingMembershipId',p_actor,'serverTimestamp',to_char(server_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'commandId',p_command,'auditEventId',event_id);
 result:=jsonb_build_object('lockId',row_id);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_tenant,p_command,'LockFinalAccount',p_job::text,request_digest,'succeeded',result,p_actor,server_time);
 INSERT INTO app.final_account_lock(tenant_id,job_id,id,final_account_revision_id,baseline_quote_version_id,capture_register_hash,line_set_hash,scope_disposition_hash,snapshot_digest,snapshot,
 declaration,declaration_version,onboarding_terms_version,locking_membership_id,locked_at,command_id,audit_event_id)
 VALUES(p_tenant,p_job,row_id,p_revision,r.baseline_quote_version_id,app.final_lock_hash(s->'captureRegister'),app.final_lock_hash(s->'lines'),app.final_lock_hash(s->'scopeDispositions'),app.final_lock_hash(s),s,
 s->>'declaration',p_declaration,'synthetic_final_check_terms.v1',p_actor,server_time,p_command,event_id) RETURNING * INTO existing_lock;
 PERFORM app.append_final_lock_audit(event_id,p_actor,p_job,'final_account.locked',jsonb_build_object('lockId',row_id,'commandId',p_command,'finalAccountRevisionId',p_revision),jsonb_build_object('snapshot',existing_lock.snapshot_digest));
 RETURN existing_lock;
END $$;

-- Source-changing commands participate in the same job serialization without granting UPDATE on job.
-- Added triggers do not change any pre-existing routine, grant, policy, role or column.
CREATE FUNCTION app.serialize_final_account_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prior_context text:=current_setting('app.tenant_id',true);
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid AND NOT pg_has_role(session_user,'jobguard_migration','USAGE') AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 -- Superuser fixture inserts may omit context; restore it before returning.
 PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true);
 PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id FOR UPDATE;
 IF TG_TABLE_NAME='variation' THEN
  IF NEW.origin='final_review' AND EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN RAISE EXCEPTION 'FINAL_REVIEW_CLOSED'; END IF;
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(prior_context,''),true);
 RETURN NEW;
END $$;
ALTER FUNCTION app.serialize_final_account_source() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.serialize_final_account_source() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;
-- Capture receipts must lock the same job BEFORE claiming their unique command row.
-- Otherwise a lock command reusing that ID could hold job while waiting for capture's receipt.
CREATE FUNCTION app.serialize_final_review_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE source_job uuid;
BEGIN
 IF NEW.command_type IN ('LogBuilderExtra','AddFinalReviewExtra') AND NEW.status='processing' THEN
  IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
  IF NEW.semantic_key !~ '^extra-origin:[a-f0-9-]{36}:[a-f0-9-]{36}$' THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
  source_job:=split_part(NEW.semantic_key,':',2)::uuid;
  PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=source_job FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.serialize_final_review_receipt() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.serialize_final_review_receipt() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access;
CREATE TRIGGER final_lock_capture_receipt BEFORE INSERT ON app.command_receipt FOR EACH ROW EXECUTE FUNCTION app.serialize_final_review_receipt();
CREATE TRIGGER a_final_lock_source BEFORE INSERT ON app.variation FOR EACH ROW EXECUTE FUNCTION app.serialize_final_account_source();
CREATE TRIGGER a_final_lock_source BEFORE INSERT ON app.final_account_revision FOR EACH ROW EXECUTE FUNCTION app.serialize_final_account_source();
CREATE TRIGGER a_final_lock_source BEFORE INSERT ON app.final_account_line FOR EACH ROW EXECUTE FUNCTION app.serialize_final_account_source();

CREATE FUNCTION app.issue_lock_bound_customer_invoice(p_tenant uuid,p_job uuid,p_revision uuid,p_actor uuid,p_command uuid,p_kind text,p_recipient text,p_issued_on date,p_source_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE lock_row app.final_account_lock; check_row app.final_account_lock_check; final_row app.final_account_revision; prior app.command_receipt;
 request_digest text; party_snapshot jsonb; n bigint; number text; artifact text; digest text; invoice_id uuid:=gen_random_uuid();
 decision_id uuid:=gen_random_uuid(); resolution_id uuid:=gen_random_uuid(); authorization_id uuid:=gen_random_uuid(); audit_id uuid:=gen_random_uuid();
 net bigint; tax bigint; gross bigint; selected_lines jsonb; result jsonb; item jsonb;
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
 artifact:='%PDF-1.4'||chr(10)||'Practice sandbox — synthetic data; nothing is sent or charged'||chr(10)||'Not a real tax invoice'||chr(10)||'Number: '||number||chr(10)||'Issue date: '||p_issued_on::text||chr(10)||'Lock: '||lock_row.id::text||chr(10)||'Kind: '||p_kind||chr(10)||'Net pence: '||net||chr(10)||'VAT pence: '||tax||chr(10)||'Gross pence: '||gross||chr(10)||'Lines: '||selected_lines::text||chr(10)||party_snapshot::text||chr(10)||'%%EOF';
 digest:=encode(sha256(convert_to(artifact,'UTF8')),'hex');
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision_id,p_tenant,'job',p_job::text,'final_account.issue');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'final_account.issue',p_recipient,digest,final_row.revision,gross,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
 VALUES(invoice_id,p_tenant,p_job,p_revision,authorization_id,number,p_issued_on,party_snapshot,final_row.tax_policy_version,'GBP',net,tax,gross,final_row.source_hash,digest,convert_to(artifact,'UTF8'),true,'SYNTHETIC - NOT A REAL INVOICE');
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
DO $$ DECLARE signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY['accept_final_check_terms(uuid,uuid,uuid,text)','record_final_account_disposition(uuid,uuid,uuid,uuid,uuid,text)','lock_final_account(uuid,uuid,uuid,uuid,uuid,integer,text)','issue_lock_bound_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,text,date,text)'] LOOP
  EXECUTE 'ALTER FUNCTION app.'||signature||' OWNER TO jobguard_migration';
  EXECUTE 'REVOKE ALL ON FUNCTION app.'||signature||' FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access';
  EXECUTE 'GRANT EXECUTE ON FUNCTION app.'||signature||' TO jobguard_runtime';
 END LOOP;
END $$;
COMMIT;
