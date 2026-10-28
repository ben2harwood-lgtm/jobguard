BEGIN;
-- ENT-7a: stored enterprise agreement versions and a locked, finance-only fee derivation.
-- Synthetic database only. Derivation records exact qualifying principal and the cumulative fee it implies;
-- it posts nothing (ENT-7b) and approves nothing (ENT-7c). The runtime role never writes these tables directly.

-- Operations writes agreement versions through the migration owner only (as MON-8's 0198); no runtime writer.
CREATE TABLE app.enterprise_agreement_version (
 tenant_id uuid NOT NULL, id uuid NOT NULL, agreement_ref text NOT NULL CHECK(length(agreement_ref) BETWEEN 1 AND 200),
 rate_numerator numeric(100,0) NOT NULL CHECK(rate_numerator>=0), rate_denominator numeric(100,0) NOT NULL CHECK(rate_denominator>0),
 basis text NOT NULL CHECK(basis='on_payment'),
 policy_version text NOT NULL CHECK(policy_version='enterprise_site_capture_policy_v1'),
 effective_from timestamptz NOT NULL, end_of_job_check boolean NOT NULL,
 content_hash char(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 environment text NOT NULL CHECK(environment='synthetic_demo'),
 operations_actor_ref text NOT NULL CHECK(length(operations_actor_ref) BETWEEN 1 AND 200),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,effective_from), CHECK(rate_numerator<=rate_denominator)
);

-- One row per (agreement version, period, exact input). Replays and concurrent runs resolve to the same row.
CREATE TABLE app.enterprise_fee_derivation (
 tenant_id uuid NOT NULL, id uuid NOT NULL, command_id uuid NOT NULL, agreement_version_id uuid NOT NULL,
 period text NOT NULL CHECK(period ~ '^[2-9][0-9]{3}-(0[1-9]|1[0-2])$'),
 recorded_cutoff timestamptz NOT NULL,
 qualifying_numerator numeric(120,0) NOT NULL CHECK(qualifying_numerator>=0),
 qualifying_denominator numeric(120,0) NOT NULL CHECK(qualifying_denominator>0),
 cumulative_fee_pence bigint NOT NULL CHECK(cumulative_fee_pence>=0),
 input_hash char(64) NOT NULL CHECK(input_hash ~ '^[0-9a-f]{64}$'),
 request_hash char(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 actor_membership_id uuid NOT NULL,
 server_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,agreement_version_id,period,input_hash),
 FOREIGN KEY(tenant_id,agreement_version_id) REFERENCES app.enterprise_agreement_version(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);

-- One row per stored payment allocation that contributes; traceable to origin, export line, run and rule.
CREATE TABLE app.enterprise_fee_contribution (
 tenant_id uuid NOT NULL, id uuid NOT NULL, derivation_id uuid NOT NULL,
 job_id uuid NOT NULL, extra_id uuid NOT NULL, origin_kind text NOT NULL CHECK(origin_kind IN('site_user','jobguard_surfaced_confirmed')),
 export_line_id uuid NOT NULL, allocation_id uuid NOT NULL, run_id uuid NOT NULL,
 rule text NOT NULL CHECK(rule IN('explicit','separate_invoice','pro_rata')),
 qualifying_numerator numeric(120,0) NOT NULL, qualifying_denominator numeric(120,0) NOT NULL CHECK(qualifying_denominator>0),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,derivation_id,allocation_id),
 FOREIGN KEY(tenant_id,derivation_id) REFERENCES app.enterprise_fee_derivation(tenant_id,id),
 FOREIGN KEY(tenant_id,extra_id) REFERENCES app.extra_origin(tenant_id,variation_id),
 FOREIGN KEY(tenant_id,job_id,export_line_id) REFERENCES app.billing_export_line(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,allocation_id) REFERENCES app.contractor_receipt_line_allocation(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,run_id) REFERENCES app.billing_allocation_run(tenant_id,job_id,id)
);

DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['enterprise_agreement_version','enterprise_fee_derivation','enterprise_fee_contribution'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  -- No direct runtime access: finance reads through app.ef_read and writes through app.ef_derive only.
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
 END LOOP;
END $$;

-- Append-only: no update, delete or truncate, by anyone, including the owner.
CREATE FUNCTION app.ef_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'ENTERPRISE_FEE_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.ef_immutable() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_immutable() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['enterprise_agreement_version','enterprise_fee_derivation','enterprise_fee_contribution'] LOOP
  EXECUTE format('CREATE TRIGGER ef_immutable BEFORE INSERT OR UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.ef_immutable()',n);
  EXECUTE format('CREATE TRIGGER ef_no_truncate BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.ef_immutable()',n);
 END LOOP;
END $$;

-- Exact n/d (n>=0) to whole pence, half to even. Matches the core cumulative-fee kernel.
CREATE FUNCTION app.ef_round_half_even(n numeric,d numeric) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE q numeric; r numeric;
BEGIN
 IF n<0 OR d<=0 OR n<>trunc(n) OR d<>trunc(d) THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
 q:=div(n,d); r:=n-q*d;
 IF 2*r>d OR (2*r=d AND mod(q,2)=1) THEN q:=q+1; END IF;
 IF q>9007199254740991 THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
 RETURN q::bigint;
END $$;
ALTER FUNCTION app.ef_round_half_even(numeric,numeric) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_round_half_even(numeric,numeric) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

-- The single finance check used by every ENT-7 routine: a live contractor practice session of an active finance member
-- holding an unrevoked tenant finance grant. Not executable by the runtime on its own.
CREATE FUNCTION app.ef_actor(p_session uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 IF pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') IS NOT TRUE THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 SELECT m.id INTO a FROM app.contractor_session(p_session) x JOIN app.membership m ON(m.tenant_id,m.id,m.identity_user_id)=(x.tenant_id,x.membership_id,x.identity_user_id)
 WHERE x.tenant_id=t AND m.role='finance' AND coalesce(app.contractor_member_active(m.id),false)
  AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND EXISTS(SELECT 1 FROM app.role_grant g WHERE(g.tenant_id,g.membership_id)=(t,m.id) AND g.role='finance' AND g.scope_kind='tenant' AND g.scope_id=t
   AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(t,g.id)));
 IF a IS NULL THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN a;
END $$;
ALTER FUNCTION app.ef_actor(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_actor(uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

-- The single source of a derivation's inputs: the qualifying stored facts for one agreement version and month, and
-- their fingerprint. Derivation records from it; statement approval (ENT-7b) re-reads it to refuse changed facts.
-- Private: called only from the checked routines, never by the runtime directly.
CREATE FUNCTION app.ef_inputs(t uuid,ag app.enterprise_agreement_version,p_period text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE cutoff timestamptz; qrows jsonb; inputs jsonb; p_agreement uuid:=ag.id;
BEGIN
 -- Calendar month in Europe/London; cumulative principal is everything recorded before the cut-off.
 cutoff:=((p_period||'-01 00:00:00')::timestamp+interval '1 month') AT TIME ZONE 'Europe/London';
 IF ag.effective_from>=cutoff THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;

 -- Qualifying: contractor site-originated extras (site user, or surfaced and confirmed) recorded before the cut-off,
 -- whose origin time selects this agreement version, that are not linked as a duplicate, on a synthetic contractor job,
 -- exported, and carrying payment-allocated extra principal on the allocation run current at the cut-off.
 -- Office, client-instructed and order-line amounts, duplicates, unexported and unpaid amounts never appear here.
 SELECT coalesce(jsonb_agg(jsonb_build_object('allocation_id',q.allocation_id,'run_id',q.run_id,'rule',q.rule,'n',q.n::text,'dd',q.dd::text,
  'export_line_id',q.export_line_id,'job_id',q.job_id,'extra_id',q.extra_id,'origin_kind',q.origin_kind) ORDER BY q.allocation_id),'[]'::jsonb) INTO qrows FROM(
 SELECT al.id allocation_id, al.run_id, al.rule, al.matched_extra_numerator n, al.matched_extra_denominator dd,
  l.id export_line_id, l.job_id, o.variation_id extra_id, o.kind origin_kind
 FROM app.extra_origin o
 JOIN app.job_commercial_track ct ON(ct.tenant_id,ct.job_id)=(o.tenant_id,o.job_id) AND ct.job_track='contractor' AND ct.environment='synthetic_demo'
 JOIN app.billing_export_line l ON(l.tenant_id,l.job_id,l.extra_id)=(o.tenant_id,o.job_id,o.variation_id)
 JOIN app.billing_export_batch b ON(b.tenant_id,b.id)=(l.tenant_id,l.batch_id) AND b.server_recorded_at<cutoff
 JOIN app.contractor_receipt_line_allocation al ON(al.tenant_id,al.line_job_id,al.export_line_id)=(l.tenant_id,l.job_id,l.id)
 JOIN app.billing_allocation_run r ON(r.tenant_id,r.job_id,r.id)=(al.tenant_id,al.job_id,al.run_id) AND r.server_recorded_at<cutoff
 WHERE o.tenant_id=t AND o.job_track='contractor' AND o.kind IN('site_user','jobguard_surfaced_confirmed') AND o.server_recorded_at<cutoff
  AND (SELECT v.id FROM app.enterprise_agreement_version v WHERE v.tenant_id=t AND v.effective_from<=o.server_recorded_at ORDER BY v.effective_from DESC LIMIT 1)=p_agreement
  AND NOT EXISTS(SELECT 1 FROM app.billing_allocation_run nx WHERE nx.tenant_id=r.tenant_id AND nx.predecessor_id=r.id AND nx.server_recorded_at<cutoff)
  AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link k WHERE k.tenant_id=t AND k.duplicate_id=o.variation_id AND k.kind='link' AND k.server_recorded_at<cutoff
   AND NOT EXISTS(SELECT 1 FROM app.extra_duplicate_link u WHERE u.tenant_id=t AND u.reverses_link_id=k.id AND u.kind='unlink' AND u.server_recorded_at<cutoff))
  AND al.matched_extra_numerator<>0) q;

 inputs:=jsonb_build_object('agreement',ag.id,'agreementHash',ag.content_hash,'period',p_period,
  'cutoff',to_char(cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'rows',(SELECT coalesce(jsonb_agg(jsonb_build_array(x->>'allocation_id',x->>'n',x->>'dd')),'[]'::jsonb) FROM jsonb_array_elements(qrows) x));
 RETURN jsonb_build_object('rows',qrows,'hash',app.final_lock_hash(inputs),'cutoff',to_char(cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;
ALTER FUNCTION app.ef_inputs(uuid,app.enterprise_agreement_version,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_inputs(uuid,app.enterprise_agreement_version,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

-- Finance-only, synthetic-only, authority first. Lock order matches billing writes (0243 cb_authority):
-- organisation fence (shared) -> tenant billing lock -> agreement derivation lock -> agreement row -> actor -> audit head last.
-- Amounts are never supplied by the caller: every figure is recomputed here from stored facts.
CREATE FUNCTION app.ef_derive(p_session uuid,p_command uuid,p_agreement uuid,p_period text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; ag app.enterprise_agreement_version; existing app.enterprise_fee_derivation;
 cutoff timestamptz; req text; qrows jsonb; fx jsonb; ih text; acc numeric[]:=ARRAY[0::numeric,1::numeric];
 c record; d uuid:=gen_random_uuid(); fee bigint; seq bigint; prev text; ts timestamptz; ph text; eh text; payload jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid; a:=app.ef_actor(p_session);
 IF p_command IS NULL OR p_agreement IS NULL OR p_period IS NULL OR p_period !~ '^[2-9][0-9]{3}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;

 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,618));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||p_agreement::text||':'||p_period,746));
 SELECT * INTO ag FROM app.enterprise_agreement_version WHERE tenant_id=t AND id=p_agreement FOR SHARE;
 IF ag.id IS NULL THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM app.membership WHERE tenant_id=t AND id=a FOR SHARE;
 IF NOT coalesce(app.contractor_member_active(a),false) THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;

 req:=app.final_lock_hash(jsonb_build_object('command','DeriveEnterpriseFee','agreement',p_agreement,'period',p_period));
 SELECT * INTO existing FROM app.enterprise_fee_derivation WHERE tenant_id=t AND command_id=p_command;
 IF existing.id IS NOT NULL THEN
  IF existing.request_hash<>req THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('derivationId',existing.id,'replayed',true);
 END IF;

 fx:=app.ef_inputs(t,ag,p_period); qrows:=fx->'rows'; ih:=fx->>'hash'; cutoff:=(fx->>'cutoff')::timestamptz;
 SELECT * INTO existing FROM app.enterprise_fee_derivation WHERE tenant_id=t AND agreement_version_id=p_agreement AND period=p_period AND input_hash=ih;
 IF existing.id IS NOT NULL THEN RETURN jsonb_build_object('derivationId',existing.id,'replayed',true); END IF;

 FOR c IN SELECT (x->>'n')::numeric n,(x->>'dd')::numeric dd FROM jsonb_array_elements(qrows) x LOOP acc:=app.cb_add(acc[1],acc[2],c.n,c.dd); END LOOP;
 IF acc[1]<0 THEN RAISE EXCEPTION 'INVALID_FEE_INPUT' USING ERRCODE='22023'; END IF;
 fee:=app.ef_round_half_even(acc[1]*ag.rate_numerator,acc[2]*ag.rate_denominator);

 INSERT INTO app.enterprise_fee_derivation(tenant_id,id,command_id,agreement_version_id,period,recorded_cutoff,qualifying_numerator,qualifying_denominator,cumulative_fee_pence,input_hash,request_hash,actor_membership_id)
 VALUES(t,d,p_command,p_agreement,p_period,cutoff,acc[1],acc[2],fee,ih,req,a);
 INSERT INTO app.enterprise_fee_contribution(tenant_id,id,derivation_id,job_id,extra_id,origin_kind,export_line_id,allocation_id,run_id,rule,qualifying_numerator,qualifying_denominator)
 SELECT t,gen_random_uuid(),d,x.job_id,x.extra_id,x.origin_kind,x.export_line_id,x.allocation_id,x.run_id,x.rule,x.n,x.dd
 FROM jsonb_to_recordset(qrows) AS x(job_id uuid,extra_id uuid,origin_kind text,export_line_id uuid,allocation_id uuid,run_id uuid,rule text,n numeric,dd numeric);

 -- Audit in the same transaction; no business lock is taken after the audit head.
 payload:=jsonb_build_object('references',jsonb_build_object('derivation',d::text,'agreement',p_agreement::text,'period',p_period,'environment','synthetic_demo'),
  'hashes',jsonb_build_object('input',ih,'request',req));
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp()); ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'membership:'||a::text,'enterprise_fee.derived','enterprise_fee_derivation',d::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(gen_random_uuid(),t,seq,'audit.v1','membership:'||a::text,'enterprise_fee.derived','enterprise_fee_derivation',d::text,ts,payload,ph,prev,eh);
 PERFORM app.advance_audit_head(seq,eh);
 RETURN jsonb_build_object('derivationId',d,'replayed',false);
END $$;
ALTER FUNCTION app.ef_derive(uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_derive(uuid,uuid,uuid,text) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ef_derive(uuid,uuid,uuid,text) TO jobguard_runtime;
-- Finance-only drill-down of one stored derivation.
CREATE FUNCTION app.ef_read(p_session uuid,p_derivation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; h app.enterprise_fee_derivation;
BEGIN
 PERFORM app.ef_actor(p_session); t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 SELECT * INTO h FROM app.enterprise_fee_derivation WHERE tenant_id=t AND id=p_derivation;
 IF h.id IS NULL THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('id',h.id,'agreementVersionId',h.agreement_version_id,'period',h.period,
  'recordedCutoff',to_char(h.recorded_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'inputHash',h.input_hash,
  'qualifyingPrincipal',jsonb_build_object('numerator',h.qualifying_numerator::text,'denominator',h.qualifying_denominator::text),
  'cumulativeFeePence',h.cumulative_fee_pence,
  'contributions',coalesce((SELECT jsonb_agg(jsonb_build_object('extraId',c.extra_id,'originKind',c.origin_kind,'exportLineId',c.export_line_id,
   'allocationId',c.allocation_id,'runId',c.run_id,'rule',c.rule,
   'qualifyingPrincipal',jsonb_build_object('numerator',c.qualifying_numerator::text,'denominator',c.qualifying_denominator::text)) ORDER BY c.allocation_id)
   FROM app.enterprise_fee_contribution c WHERE c.tenant_id=t AND c.derivation_id=h.id),'[]'::jsonb));
END $$;
ALTER FUNCTION app.ef_read(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_read(uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ef_read(uuid,uuid) TO jobguard_runtime;
COMMIT;
