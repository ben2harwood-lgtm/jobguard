BEGIN;
-- ENT-7b: monthly enterprise fee statements, disputes and exact finance approval. Synthetic database only.
-- A statement revision binds the latest derivation of every agreement version for the month. Approval creates a Decision,
-- its approved resolution and one exact action authorisation bound to the statement's content hash, total and revision.
-- Nothing is posted here (ENT-7c). The runtime role never touches these tables directly.

CREATE TABLE app.enterprise_fee_statement (
 tenant_id uuid NOT NULL, id uuid NOT NULL, command_id uuid NOT NULL,
 request_hash char(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 period text NOT NULL CHECK(period ~ '^[2-9][0-9]{3}-(0[1-9]|1[0-2])$'),
 revision integer NOT NULL CHECK(revision>0), predecessor_id uuid,
 sections_hash char(64) NOT NULL CHECK(sections_hash ~ '^[0-9a-f]{64}$'),
 content_hash char(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 total_delta_pence bigint NOT NULL, actor_membership_id uuid NOT NULL,
 server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,period,revision), UNIQUE(tenant_id,predecessor_id),
 CHECK((revision=1)=(predecessor_id IS NULL)),
 FOREIGN KEY(tenant_id,predecessor_id) REFERENCES app.enterprise_fee_statement(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.enterprise_fee_statement_section (
 tenant_id uuid NOT NULL, statement_id uuid NOT NULL, agreement_version_id uuid NOT NULL, derivation_id uuid NOT NULL,
 input_hash char(64) NOT NULL CHECK(input_hash ~ '^[0-9a-f]{64}$'),
 cumulative_fee_pence bigint NOT NULL CHECK(cumulative_fee_pence>=0), prior_net_posted_pence bigint NOT NULL, delta_pence bigint NOT NULL,
 PRIMARY KEY(tenant_id,statement_id,agreement_version_id), CHECK(delta_pence=cumulative_fee_pence-prior_net_posted_pence),
 FOREIGN KEY(tenant_id,statement_id) REFERENCES app.enterprise_fee_statement(tenant_id,id),
 FOREIGN KEY(tenant_id,agreement_version_id) REFERENCES app.enterprise_agreement_version(tenant_id,id),
 FOREIGN KEY(tenant_id,derivation_id) REFERENCES app.enterprise_fee_derivation(tenant_id,id)
);
CREATE TABLE app.enterprise_fee_statement_dispute (
 tenant_id uuid NOT NULL, id uuid NOT NULL, statement_id uuid NOT NULL, command_id uuid NOT NULL,
 reason_code text NOT NULL CHECK(reason_code ~ '^[a-z][a-z0-9_]{0,39}$'), actor_membership_id uuid NOT NULL,
 server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,statement_id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,statement_id) REFERENCES app.enterprise_fee_statement(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.enterprise_fee_statement_approval (
 tenant_id uuid NOT NULL, statement_id uuid NOT NULL, command_id uuid NOT NULL,
 decision_id uuid NOT NULL, resolution_id uuid NOT NULL, authorization_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,statement_id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,authorization_id),
 FOREIGN KEY(tenant_id,statement_id) REFERENCES app.enterprise_fee_statement(tenant_id,id),
 FOREIGN KEY(tenant_id,decision_id) REFERENCES app.decision(tenant_id,id),
 FOREIGN KEY(tenant_id,resolution_id) REFERENCES app.decision_resolution(tenant_id,id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);

DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['enterprise_fee_statement','enterprise_fee_statement_section','enterprise_fee_statement_dispute','enterprise_fee_statement_approval'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  -- No direct runtime access: finance uses the checked routines below.
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
  EXECUTE format('CREATE TRIGGER ef_immutable BEFORE INSERT OR UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.ef_immutable()',n);
  EXECUTE format('CREATE TRIGGER ef_no_truncate BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.ef_immutable()',n);
 END LOOP;
END $$;

-- Append one audit event in the caller's transaction. Called last; no business lock follows it.
CREATE FUNCTION app.ef_audit(a uuid,p_type text,p_subject_type text,p_subject uuid,payload jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; seq bigint; prev text; ts timestamptz; ph text; eh text;
BEGIN
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp()); ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'membership:'||a::text,p_type,p_subject_type,p_subject::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(gen_random_uuid(),t,seq,'audit.v1','membership:'||a::text,p_type,p_subject_type,p_subject::text,ts,payload,ph,prev,eh);
 PERFORM app.advance_audit_head(seq,eh);
END $$;
ALTER FUNCTION app.ef_audit(uuid,text,text,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_audit(uuid,text,text,uuid,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

-- Finance check, then the billing lock order (0243) and the month's statement lock. Returns the finance member.
CREATE FUNCTION app.ef_statement_begin(p_session uuid,p_period text) RETURNS uuid
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid;
BEGIN
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid; a:=app.ef_actor(p_session);
 IF p_period IS NULL OR p_period !~ '^[2-9][0-9]{3}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,618));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_period,747));
 PERFORM 1 FROM app.membership WHERE tenant_id=t AND id=a FOR SHARE;
 IF NOT coalesce(app.contractor_member_active(a),false) THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN a;
END $$;
ALTER FUNCTION app.ef_statement_begin(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_statement_begin(uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

-- The month's sections: the latest derivation of each agreement version, refused if the stored facts moved since.
-- Prior net posted is zero until ENT-7c adds posting.
CREATE FUNCTION app.ef_statement_sections(t uuid,p_period text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE r record; ag app.enterprise_agreement_version; out jsonb:='[]'::jsonb;
BEGIN
 FOR r IN SELECT DISTINCT ON (d.agreement_version_id) d.* FROM app.enterprise_fee_derivation d
  WHERE d.tenant_id=t AND d.period=p_period ORDER BY d.agreement_version_id,d.server_recorded_at DESC,d.id DESC LOOP
  SELECT * INTO ag FROM app.enterprise_agreement_version WHERE tenant_id=t AND id=r.agreement_version_id;
  IF app.ef_inputs(t,ag,p_period)->>'hash' IS DISTINCT FROM r.input_hash THEN RAISE EXCEPTION 'STALE_FACTS' USING ERRCODE='40001'; END IF;
  out:=out||jsonb_build_array(jsonb_build_object('agreementVersionId',r.agreement_version_id,'derivationId',r.id,'inputHash',r.input_hash,
   'cumulativeFeePence',r.cumulative_fee_pence,'priorNetPostedPence',0,'deltaPence',r.cumulative_fee_pence));
 END LOOP;
 RETURN out;
END $$;
ALTER FUNCTION app.ef_statement_sections(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_statement_sections(uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

CREATE FUNCTION app.ef_prepare_statement(p_session uuid,p_command uuid,p_period text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; req text; existing app.enterprise_fee_statement; latest app.enterprise_fee_statement; sections jsonb; sh text;
 total bigint; s uuid:=gen_random_uuid(); rev integer; content jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 a:=app.ef_statement_begin(p_session,p_period); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF p_command IS NULL THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
 req:=app.final_lock_hash(jsonb_build_object('command','PrepareEnterpriseFeeStatement','period',p_period));
 SELECT * INTO existing FROM app.enterprise_fee_statement WHERE tenant_id=t AND command_id=p_command;
 IF existing.id IS NOT NULL THEN
  IF existing.request_hash<>req THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('statementId',existing.id,'replayed',true);
 END IF;
 sections:=app.ef_statement_sections(t,p_period);
 IF jsonb_array_length(sections)=0 THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 sh:=app.final_lock_hash(sections);
 SELECT * INTO latest FROM app.enterprise_fee_statement WHERE tenant_id=t AND period=p_period ORDER BY revision DESC LIMIT 1;
 IF latest.id IS NOT NULL THEN
  -- An approved month is closed: later changes are compensated on a later statement (ENT-7c), never by revising it.
  IF EXISTS(SELECT 1 FROM app.enterprise_fee_statement_approval WHERE tenant_id=t AND statement_id=latest.id) THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  IF latest.sections_hash=sh AND NOT EXISTS(SELECT 1 FROM app.enterprise_fee_statement_dispute WHERE tenant_id=t AND statement_id=latest.id) THEN
   RETURN jsonb_build_object('statementId',latest.id,'replayed',true);
  END IF;
 END IF;
 rev:=coalesce(latest.revision,0)+1;
 SELECT sum((x->>'deltaPence')::bigint) INTO total FROM jsonb_array_elements(sections) x;
 content:=jsonb_build_object('version','enterprise-fee-statement.v1','period',p_period,'revision',rev,'predecessorId',latest.id,'sections',sections,'totalDeltaPence',total);
 INSERT INTO app.enterprise_fee_statement(tenant_id,id,command_id,request_hash,period,revision,predecessor_id,sections_hash,content_hash,total_delta_pence,actor_membership_id)
 VALUES(t,s,p_command,req,p_period,rev,latest.id,sh,app.final_lock_hash(content),total,a);
 INSERT INTO app.enterprise_fee_statement_section(tenant_id,statement_id,agreement_version_id,derivation_id,input_hash,cumulative_fee_pence,prior_net_posted_pence,delta_pence)
 SELECT t,s,x."agreementVersionId",x."derivationId",x."inputHash",x."cumulativeFeePence",x."priorNetPostedPence",x."deltaPence"
 FROM jsonb_to_recordset(sections) AS x("agreementVersionId" uuid,"derivationId" uuid,"inputHash" text,"cumulativeFeePence" bigint,"priorNetPostedPence" bigint,"deltaPence" bigint);
 PERFORM app.ef_audit(a,'enterprise_fee.statement_prepared','enterprise_fee_statement',s,
  jsonb_build_object('references',jsonb_build_object('statement',s::text,'period',p_period,'revision',rev,'environment','synthetic_demo'),'hashes',jsonb_build_object('content',app.final_lock_hash(content))));
 RETURN jsonb_build_object('statementId',s,'replayed',false);
END $$;

-- A dispute closes the revision to approval; preparing again makes the next revision.
CREATE FUNCTION app.ef_dispute_statement(p_session uuid,p_command uuid,p_statement uuid,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; st app.enterprise_fee_statement; existing app.enterprise_fee_statement_dispute; d uuid:=gen_random_uuid();
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid; PERFORM app.ef_actor(p_session);
 SELECT * INTO st FROM app.enterprise_fee_statement WHERE tenant_id=t AND id=p_statement;
 IF st.id IS NULL THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 a:=app.ef_statement_begin(p_session,st.period);
 IF p_command IS NULL OR p_reason IS NULL OR p_reason !~ '^[a-z][a-z0-9_]{0,39}$' THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO existing FROM app.enterprise_fee_statement_dispute WHERE tenant_id=t AND command_id=p_command;
 IF existing.id IS NOT NULL THEN
  IF existing.statement_id<>p_statement OR existing.reason_code<>p_reason THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('disputeId',existing.id,'replayed',true);
 END IF;
 IF EXISTS(SELECT 1 FROM app.enterprise_fee_statement n WHERE n.tenant_id=t AND n.predecessor_id=st.id)
  OR EXISTS(SELECT 1 FROM app.enterprise_fee_statement_approval WHERE tenant_id=t AND statement_id=st.id)
  OR EXISTS(SELECT 1 FROM app.enterprise_fee_statement_dispute WHERE tenant_id=t AND statement_id=st.id) THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 INSERT INTO app.enterprise_fee_statement_dispute(tenant_id,id,statement_id,command_id,reason_code,actor_membership_id) VALUES(t,d,st.id,p_command,p_reason,a);
 PERFORM app.ef_audit(a,'enterprise_fee.statement_disputed','enterprise_fee_statement',st.id,
  jsonb_build_object('references',jsonb_build_object('statement',st.id::text,'dispute',d::text,'reason',p_reason,'environment','synthetic_demo'),'hashes','{}'::jsonb));
 RETURN jsonb_build_object('disputeId',d,'replayed',false);
END $$;

-- Exact approval of one statement revision. Refused for anything but the latest, undisputed, unapproved revision whose
-- supplied hash and total match and whose stored facts have not moved. Creates the Decision, its approved resolution and
-- one exact, expiring action authorisation; posting (ENT-7c) must present that authorisation.
CREATE FUNCTION app.ef_approve_statement(p_session uuid,p_command uuid,p_statement uuid,p_content_hash text,p_total_pence bigint,p_expires_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; st app.enterprise_fee_statement; existing app.enterprise_fee_statement_approval; sec record; ag app.enterprise_agreement_version;
 dec uuid:=gen_random_uuid(); res uuid:=gen_random_uuid(); auth uuid:=gen_random_uuid();
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid; PERFORM app.ef_actor(p_session);
 SELECT * INTO st FROM app.enterprise_fee_statement WHERE tenant_id=t AND id=p_statement;
 IF st.id IS NULL THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 a:=app.ef_statement_begin(p_session,st.period);
 IF p_command IS NULL THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO existing FROM app.enterprise_fee_statement_approval WHERE tenant_id=t AND command_id=p_command;
 IF existing.statement_id IS NOT NULL THEN
  IF existing.statement_id<>p_statement THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('authorizationId',existing.authorization_id,'replayed',true);
 END IF;
 IF EXISTS(SELECT 1 FROM app.enterprise_fee_statement n WHERE n.tenant_id=t AND n.predecessor_id=st.id)
  OR EXISTS(SELECT 1 FROM app.enterprise_fee_statement_dispute WHERE tenant_id=t AND statement_id=st.id)
  OR EXISTS(SELECT 1 FROM app.enterprise_fee_statement_approval WHERE tenant_id=t AND statement_id=st.id)
  OR p_content_hash IS DISTINCT FROM st.content_hash OR p_total_pence IS DISTINCT FROM st.total_delta_pence THEN
  RAISE EXCEPTION 'STATEMENT_AUTHORITY_INVALID' USING ERRCODE='42501';
 END IF;
 IF p_expires_at IS NULL OR p_expires_at<=clock_timestamp() OR p_expires_at>clock_timestamp()+interval '1 day' THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
 FOR sec IN SELECT * FROM app.enterprise_fee_statement_section WHERE tenant_id=t AND statement_id=st.id LOOP
  SELECT * INTO ag FROM app.enterprise_agreement_version WHERE tenant_id=t AND id=sec.agreement_version_id FOR SHARE;
  IF app.ef_inputs(t,ag,st.period)->>'hash' IS DISTINCT FROM sec.input_hash THEN RAISE EXCEPTION 'STALE_FACTS' USING ERRCODE='40001'; END IF;
 END LOOP;
 INSERT INTO app.decision(tenant_id,id,subject_type,subject_ref,action_type) VALUES(t,dec,'enterprise_fee_statement',st.id::text,'enterprise_fee_statement');
 INSERT INTO app.decision_resolution(tenant_id,id,decision_id,resolution,actor_membership_id) VALUES(t,res,dec,'approved',a);
 INSERT INTO app.action_authorization(tenant_id,id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(t,auth,dec,res,a,'enterprise_fee_statement',NULL,st.content_hash,st.revision,abs(st.total_delta_pence),'GBP','enterprise_site_capture_policy_v1',p_expires_at);
 INSERT INTO app.enterprise_fee_statement_approval(tenant_id,statement_id,command_id,decision_id,resolution_id,authorization_id,actor_membership_id)
 VALUES(t,st.id,p_command,dec,res,auth,a);
 PERFORM app.ef_audit(a,'enterprise_fee.statement_approved','enterprise_fee_statement',st.id,
  jsonb_build_object('references',jsonb_build_object('statement',st.id::text,'authorization',auth::text,'environment','synthetic_demo'),
   'hashes',jsonb_build_object('content',st.content_hash)));
 RETURN jsonb_build_object('authorizationId',auth,'replayed',false);
END $$;

CREATE FUNCTION app.ef_read_statement(p_session uuid,p_statement uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; st app.enterprise_fee_statement;
BEGIN
 PERFORM app.ef_actor(p_session); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 SELECT * INTO st FROM app.enterprise_fee_statement WHERE tenant_id=t AND id=p_statement;
 IF st.id IS NULL THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('id',st.id,'period',st.period,'revision',st.revision,'predecessorId',st.predecessor_id,'contentHash',st.content_hash,
  'totalDeltaPence',st.total_delta_pence,
  'sections',coalesce((SELECT jsonb_agg(jsonb_build_object('agreementVersionId',x.agreement_version_id,'derivationId',x.derivation_id,
   'cumulativeFeePence',x.cumulative_fee_pence,'priorNetPostedPence',x.prior_net_posted_pence,'deltaPence',x.delta_pence) ORDER BY x.agreement_version_id)
   FROM app.enterprise_fee_statement_section x WHERE x.tenant_id=t AND x.statement_id=st.id),'[]'::jsonb),
  'superseded',EXISTS(SELECT 1 FROM app.enterprise_fee_statement n WHERE n.tenant_id=t AND n.predecessor_id=st.id),
  'dispute',(SELECT jsonb_build_object('reason',reason_code) FROM app.enterprise_fee_statement_dispute WHERE tenant_id=t AND statement_id=st.id),
  'approval',(SELECT jsonb_build_object('authorizationId',authorization_id,'expiresAt',to_char(z.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
   FROM app.enterprise_fee_statement_approval p JOIN app.action_authorization z ON(z.tenant_id,z.id)=(p.tenant_id,p.authorization_id) WHERE p.tenant_id=t AND p.statement_id=st.id));
END $$;

DO $$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY['app.ef_prepare_statement(uuid,uuid,text)','app.ef_dispute_statement(uuid,uuid,uuid,text)',
  'app.ef_approve_statement(uuid,uuid,uuid,text,bigint,timestamptz)','app.ef_read_statement(uuid,uuid)'] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO jobguard_migration',f);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,jobguard_infrastructure',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO jobguard_runtime',f);
 END LOOP;
END $$;
COMMIT;
