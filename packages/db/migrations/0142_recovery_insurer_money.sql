BEGIN;
-- Round 2: insurer exclusion is a separate payer fact with its own reason.
-- F21 keeps its null reason and reasonHeld=true under the coordinator ruling.
CREATE FUNCTION app.recovery_job_payer_type(p_tenant uuid,p_job uuid) RETURNS text
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,app AS $$
 SELECT r.payload->>'type' FROM app.job_party_current c
 JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(c.tenant_id,c.job_id,c.binding_id)
 JOIN app.customer_revision r ON(r.tenant_id,r.customer_id,r.id)=(b.tenant_id,b.paying_party_id,b.paying_party_revision_id)
 WHERE c.tenant_id=p_tenant AND c.job_id=p_job
$$;
ALTER FUNCTION app.recovery_job_payer_type(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.recovery_job_payer_type(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.recovery_job_payer_type(uuid,uuid) TO jobguard_runtime;

CREATE TABLE app.recovery_payment_payer_mark (
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,source_event_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0),state text NOT NULL CHECK(state IN('customer_own','withdrawn')),
 evidence_id uuid,evidence_object_version_id varchar(1024),evidence_sha256 char(64),evidence_received_at timestamptz,
 party_binding_id uuid NOT NULL,actor_membership_id uuid NOT NULL,command_id uuid NOT NULL,
 payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,command_id),UNIQUE(tenant_id,job_id,source_event_id,revision),UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,source_event_id) REFERENCES app.practice_feed_event(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,party_binding_id) REFERENCES app.job_party_binding(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,evidence_id,evidence_object_version_id,evidence_sha256,evidence_received_at)
  REFERENCES app.evidence_object(tenant_id,job_id,id,object_version_id,sha256,server_received_at),
 CHECK((state='customer_own' AND evidence_id IS NOT NULL AND evidence_object_version_id IS NOT NULL AND evidence_sha256 IS NOT NULL AND evidence_received_at IS NOT NULL)
  OR (state='withdrawn' AND evidence_id IS NULL AND evidence_object_version_id IS NULL AND evidence_sha256 IS NULL AND evidence_received_at IS NULL))
);
ALTER TABLE app.recovery_payment_payer_mark OWNER TO jobguard_migration;
ALTER TABLE app.recovery_payment_payer_mark ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.recovery_payment_payer_mark FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.recovery_payment_payer_mark FOR ALL TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.recovery_payment_payer_mark FROM PUBLIC,jobguard_runtime;
-- Standard F: SELECT only. Every write enters the session-bound controlled routine.
GRANT SELECT ON app.recovery_payment_payer_mark TO jobguard_runtime;
CREATE TRIGGER a_recovery_payer_timing_pin BEFORE INSERT ON app.recovery_payment_payer_mark FOR EACH ROW EXECUTE FUNCTION app.pin_recovery_timing_created_at();
CREATE TRIGGER recovery_payment_payer_immutable BEFORE UPDATE OR DELETE ON app.recovery_payment_payer_mark FOR EACH ROW EXECUTE FUNCTION app.prevent_recovery_eligibility_v3_mutation();

-- Mirror origin/main 0095_job_parties.sql:140-151: migration-owner FOR SHARE,
-- checked tenant context, fixed search_path, explicit runtime EXECUTE.
-- Unlike require_current_job_parties this does not require a binding (Q2).
-- Standard F additionally requires this entry point's OWN session/owner predicate.
CREATE FUNCTION app.lock_recovery_payer_job(p_tenant uuid,p_job uuid,p_actor uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE tenant uuid; digest text:=nullif(current_setting('app.practice_material_digest',true),'');
BEGIN
 BEGIN tenant:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'PAYER_MARK_FORBIDDEN' USING ERRCODE='42501'; END;
 IF tenant IS NULL OR p_tenant IS DISTINCT FROM tenant
 OR current_setting('app.recovery_eligibility_environment',true) IS DISTINCT FROM 'synthetic_demo' OR digest IS NULL
 THEN RAISE EXCEPTION 'PAYER_MARK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- FORCE RLS inside SECURITY DEFINER still needs verified transaction-local context.
 PERFORM set_config('app.tenant_id',p_tenant::text,true);
 PERFORM 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM app.membership m JOIN app.authenticate_practice_session(digest) p
  ON p.tenant_id=m.tenant_id AND p.membership_id=m.id AND p.identity_user_id=m.identity_user_id
  WHERE m.tenant_id=p_tenant AND m.id=p_actor AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()))
 THEN RAISE EXCEPTION 'PAYER_MARK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job AND practice_session_digest=digest
  AND NOT EXISTS(SELECT 1 FROM app.job_commercial_track t WHERE t.tenant_id=p_tenant AND t.job_id=p_job AND t.job_track='contractor') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION app.lock_recovery_payer_job(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lock_recovery_payer_job(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_recovery_payer_job(uuid,uuid,uuid) TO jobguard_runtime;

CREATE FUNCTION app.guard_recovery_payment_payer_mark() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE digest text:=nullif(current_setting('app.practice_material_digest',true),''); e app.practice_feed_event; prior app.recovery_payment_payer_mark;
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 OR current_setting('app.recovery_eligibility_environment',true) IS DISTINCT FROM 'synthetic_demo' OR digest IS NULL
 THEN RAISE EXCEPTION 'PAYER_MARK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job j JOIN app.authenticate_practice_session(digest) p ON p.tenant_id=j.tenant_id
  WHERE j.tenant_id=NEW.tenant_id AND j.id=NEW.job_id AND j.practice_session_digest=digest)
 THEN RAISE EXCEPTION 'RECOVERY_JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM app.membership m JOIN app.authenticate_practice_session(digest) p
  ON p.tenant_id=m.tenant_id AND p.membership_id=m.id AND p.identity_user_id=m.identity_user_id
  WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.actor_membership_id AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()))
 THEN RAISE EXCEPTION 'PAYER_MARK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext('payer-mark:'||NEW.source_event_id::text));
 PERFORM app.lock_recovery_payer_job(NEW.tenant_id,NEW.job_id,NEW.actor_membership_id);
 SELECT * INTO e FROM app.practice_feed_event WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.source_event_id;
 IF e.id IS NULL OR e.event_kind<>'settled' OR e.state<>'settled' OR e.identity<>'identified'
 THEN RAISE EXCEPTION 'PAYER_MARK_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF e.movement_key NOT LIKE 'receipt-%' THEN RAISE EXCEPTION 'PAYER_MARK_NOT_CUSTOMER_PAYMENT' USING ERRCODE='23514'; END IF;
 IF app.recovery_job_payer_type(NEW.tenant_id,NEW.job_id) IS DISTINCT FROM 'insurer'
 OR NEW.party_binding_id IS DISTINCT FROM (SELECT binding_id FROM app.job_party_current WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id)
 THEN RAISE EXCEPTION 'PAYER_MARK_NOT_INSURER_JOB' USING ERRCODE='23514'; END IF;
 SELECT * INTO prior FROM app.recovery_payment_payer_mark WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND source_event_id=NEW.source_event_id ORDER BY revision DESC LIMIT 1;
 IF NEW.revision<>coalesce(prior.revision,0)+1 THEN RAISE EXCEPTION 'PAYER_MARK_STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF (NEW.state='withdrawn' AND prior.state IS DISTINCT FROM 'customer_own') OR (NEW.state='customer_own' AND prior.state IS NOT NULL AND prior.state<>'withdrawn')
 THEN RAISE EXCEPTION 'PAYER_MARK_STATE_CONFLICT' USING ERRCODE='23514'; END IF;
 IF NEW.state='customer_own' AND NOT EXISTS(SELECT 1 FROM app.evidence_object x WHERE x.tenant_id=NEW.tenant_id AND x.job_id=NEW.job_id AND x.id=NEW.evidence_id
  AND x.object_version_id=NEW.evidence_object_version_id AND x.sha256=NEW.evidence_sha256 AND x.server_received_at=NEW.evidence_received_at AND x.kind='original')
 THEN RAISE EXCEPTION 'PAYER_MARK_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_recovery_payment_payer_mark() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_recovery_payment_payer_mark() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER recovery_payment_payer_guard BEFORE INSERT ON app.recovery_payment_payer_mark FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_payment_payer_mark();

CREATE FUNCTION app.require_recovery_payment_payer_mark_effect() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=NEW.tenant_id AND actor_ref='membership:'||NEW.actor_membership_id::text
  AND event_type=(CASE WHEN NEW.state='customer_own' THEN 'recovery.payment_payer.marked' ELSE 'recovery.payment_payer.mark_withdrawn' END)
  AND payload->'references'->>'markId'=NEW.id::text AND payload->'references'->>'commandId'=NEW.command_id::text
  AND payload->'hashes'->>'command'=NEW.payload_hash::text)
 THEN RAISE EXCEPTION 'PAYER_MARK_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.require_recovery_payment_payer_mark_effect() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_recovery_payment_payer_mark_effect() FROM PUBLIC,jobguard_runtime;
CREATE CONSTRAINT TRIGGER recovery_payment_payer_complete AFTER INSERT ON app.recovery_payment_payer_mark DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_recovery_payment_payer_mark_effect();

CREATE FUNCTION app.write_recovery_payment_payer_mark(p_tenant uuid,p_job uuid,p_input jsonb) RETURNS app.recovery_payment_payer_mark
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE tenant uuid; digest text:=nullif(current_setting('app.practice_material_digest',true),''); actor uuid;
 command uuid; event uuid; case_id uuid; expected integer; request_hash text; result app.recovery_payment_payer_mark; evidence app.evidence_object; binding uuid;
BEGIN
 BEGIN tenant:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'PAYER_MARK_FORBIDDEN' USING ERRCODE='42501'; END;
 IF tenant IS NULL OR tenant IS DISTINCT FROM p_tenant OR digest IS NULL
 OR current_setting('app.recovery_eligibility_environment',true) IS DISTINCT FROM 'synthetic_demo'
 THEN RAISE EXCEPTION 'PAYER_MARK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',p_tenant::text,true);
 -- This writer carries its OWN predicate and derives the actor from the persisted session.
 SELECT m.id INTO actor FROM app.membership m JOIN app.authenticate_practice_session(digest) p
  ON p.tenant_id=m.tenant_id AND p.membership_id=m.id AND p.identity_user_id=m.identity_user_id
  WHERE m.tenant_id=p_tenant AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()) FOR SHARE OF m;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYER_MARK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job AND practice_session_digest=digest
  AND NOT EXISTS(SELECT 1 FROM app.job_commercial_track t WHERE t.tenant_id=p_tenant AND t.job_id=p_job AND t.job_track='contractor'))
 THEN RAISE EXCEPTION 'RECOVERY_JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR p_input->>'version' IS DISTINCT FROM 'recovery-payment-payer-command.v1'
 OR p_input->>'action' IS NULL OR p_input->>'action' NOT IN('mark_customer_own','withdraw_mark')
 OR NOT (p_input ?& ARRAY['version','action','commandId','caseId','sourceEventId','expectedMarkRevision'])
 OR p_input - ARRAY['version','action','commandId','caseId','sourceEventId','expectedMarkRevision','evidenceId'] <> '{}'::jsonb
 OR jsonb_typeof(p_input->'expectedMarkRevision') IS DISTINCT FROM 'number' OR (p_input->>'expectedMarkRevision') !~ '^[0-9]+$'
 OR ((p_input->>'action'='withdraw_mark') AND p_input ? 'evidenceId')
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 BEGIN
  command:=(p_input->>'commandId')::uuid; event:=(p_input->>'sourceEventId')::uuid;case_id:=(p_input->>'caseId')::uuid;expected:=(p_input->>'expectedMarkRevision')::integer;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END;
 IF command IS NULL OR event IS NULL OR case_id IS NULL OR expected=2147483647 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
 -- Command identity precedes payer-mark and job; caseId only selects the reply.
 PERFORM pg_advisory_xact_lock(hashtext(p_tenant::text),hashtext('payer-mark-command:'||command::text));
 request_hash:=encode(sha256(convert_to(jsonb_build_object('jobId',p_job,'command',p_input)::text,'UTF8')),'hex');
 SELECT * INTO result FROM app.recovery_payment_payer_mark WHERE tenant_id=p_tenant AND command_id=command;
 IF FOUND THEN
  IF result.job_id<>p_job OR result.payload_hash::text<>request_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN result;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.recovery_case_current WHERE tenant_id=p_tenant AND job_id=p_job AND id=case_id AND case_type='withheld_customer_payment')
 THEN RAISE EXCEPTION 'RECOVERY_CASE_NOT_FOUND' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_tenant::text),hashtext('payer-mark:'||event::text));
 PERFORM app.lock_recovery_payer_job(p_tenant,p_job,actor);
 SELECT binding_id INTO binding FROM app.job_party_current WHERE tenant_id=p_tenant AND job_id=p_job;
 IF app.recovery_job_payer_type(p_tenant,p_job) IS DISTINCT FROM 'insurer' THEN RAISE EXCEPTION 'PAYER_MARK_NOT_INSURER_JOB' USING ERRCODE='23514'; END IF;
 IF p_input->>'action'='mark_customer_own' THEN
  BEGIN
   SELECT * INTO evidence FROM app.evidence_object WHERE tenant_id=p_tenant AND job_id=p_job AND id=(p_input->>'evidenceId')::uuid AND kind='original';
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'PAYER_MARK_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END;
  IF evidence.id IS NULL THEN RAISE EXCEPTION 'PAYER_MARK_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 INSERT INTO app.recovery_payment_payer_mark(id,tenant_id,job_id,source_event_id,revision,state,evidence_id,evidence_object_version_id,evidence_sha256,evidence_received_at,party_binding_id,actor_membership_id,command_id,payload_hash)
 VALUES(gen_random_uuid(),p_tenant,p_job,event,expected+1,CASE WHEN p_input->>'action'='mark_customer_own' THEN 'customer_own' ELSE 'withdrawn' END,
  evidence.id,evidence.object_version_id,evidence.sha256,evidence.server_received_at,binding,actor,command,request_hash) RETURNING * INTO result;
 RETURN result;
END $$;
ALTER FUNCTION app.write_recovery_payment_payer_mark(uuid,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.write_recovery_payment_payer_mark(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.write_recovery_payment_payer_mark(uuid,uuid,jsonb) TO jobguard_runtime;

-- From 0130_recovery_eligibility_v3_f17_timing.sql: G1 local insurer flag;
-- G2 payer-mark then controlled job lock and payer expression; G3 insurer branch only.
-- G5 releases F19 reasonHeld only; Round 2 leaves every F21 reason/held value unchanged.
CREATE OR REPLACE FUNCTION app.guard_recovery_eligibility_v3() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE c app.recovery_case_current; e app.practice_feed_event; r app.recovery_eligibility_v3_review;
 digest text:=nullif(current_setting('app.practice_material_digest',true),'');
 expected_q bigint:=0; expected_reason text; expected_category text; expected_kind text;
 expected_net bigint; expected_debtor text; paid_before boolean; settled boolean; insurer_money boolean:=false;
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 OR current_setting('app.recovery_eligibility_environment',true) IS DISTINCT FROM 'synthetic_demo' OR digest IS NULL
 THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job j JOIN app.authenticate_practice_session(digest) p ON p.tenant_id=j.tenant_id
  WHERE j.tenant_id=NEW.tenant_id AND j.id=NEW.job_id AND j.practice_session_digest=digest)
 THEN RAISE EXCEPTION 'RECOVERY_JOB_NOT_FOUND' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='supplier_credit_consumption' THEN
  -- Do not relabel a customer receipt or supplier refund as an invoice payment.
  RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';
 END IF;
 IF TG_TABLE_NAME='recovery_claim_line' THEN
  SELECT * INTO r FROM app.recovery_eligibility_v3_review WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND case_id=NEW.case_id AND id=NEW.review_id;
  IF NOT FOUND OR r.created_at<>transaction_timestamp() THEN RAISE EXCEPTION 'ELIGIBILITY_SOURCE_REQUIRED' USING ERRCODE='23514';END IF;
  expected_debtor:=CASE WHEN r.fixture='F19' THEN 'individual' ELSE 'business' END;
  expected_net:=CASE NEW.kind WHEN 'statutory_interest' THEN 12000 WHEN 'fixed_compensation' THEN 7000 ELSE
   CASE r.fixture WHEN 'F15' THEN 20000 WHEN 'F17' THEN 45000 WHEN 'F20' THEN 32000 WHEN 'F21' THEN 9000 WHEN 'F22' THEN 32000 ELSE 250000 END END;
  IF (NEW.kind<>'principal' AND r.fixture NOT IN('F18','F19')) OR NEW.debtor_type<>expected_debtor OR NEW.net_pence<>expected_net
  THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
  RETURN NEW;
 END IF;
 PERFORM 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM app.membership m JOIN app.authenticate_practice_session(digest) p ON p.tenant_id=m.tenant_id AND p.membership_id=m.id AND p.identity_user_id=m.identity_user_id
  WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.actor_membership_id AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()))
 THEN RAISE EXCEPTION 'ELIGIBILITY_REVIEWER_FORBIDDEN' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.case_id::text));
 SELECT * INTO c FROM app.recovery_case_current WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.case_id;
 IF NOT FOUND OR NOT c.synthetic OR c.claim_revision IS NULL THEN RAISE EXCEPTION 'RECOVERY_CASE_NOT_FOUND' USING ERRCODE='23514';END IF;
 IF c.case_type='withheld_customer_payment' AND NEW.source_event_id IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext('payer-mark:'||NEW.source_event_id::text));
  PERFORM app.lock_recovery_payer_job(NEW.tenant_id,NEW.job_id,NEW.actor_membership_id);
  insurer_money:=coalesce(app.recovery_job_payer_type(NEW.tenant_id,NEW.job_id)='insurer',false)
   AND coalesce((SELECT state FROM app.recovery_payment_payer_mark WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND source_event_id=NEW.source_event_id ORDER BY revision DESC LIMIT 1),'withdrawn')<>'customer_own';
 END IF;
 IF NEW.case_revision<>c.revision OR NEW.revision<>(SELECT coalesce(max(revision),0)+1 FROM app.recovery_eligibility_v3_review WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id)
 THEN RAISE EXCEPTION 'ELIGIBILITY_STALE_REVISION' USING ERRCODE='40001';END IF;
 IF NEW.fixture IN('F14','F16-partial','F16-full') THEN RAISE EXCEPTION 'ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE' USING ERRCODE='0A000';END IF;
 IF EXISTS(SELECT 1 FROM app.recovery_eligibility_v3_review WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id AND fixture<>NEW.fixture)
 THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 expected_category:=CASE NEW.fixture WHEN 'F15' THEN 'merchant_overcharge' WHEN 'F17' THEN 'duplicate_supplier_payment' WHEN 'F21' THEN 'merchant_overcharge' WHEN 'F22' THEN 'prevention' ELSE 'withheld_customer_payment' END;
 IF c.case_type<>expected_category THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 SELECT * INTO e FROM app.practice_feed_event WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.source_event_id;
 expected_kind:=CASE NEW.fixture WHEN 'F17' THEN 'supplier-refund-540' WHEN 'F20' THEN 'receipt-384' ELSE 'receipt-3000' END;
 IF NEW.fixture NOT IN('F15','F21','F22') AND (e.id IS NULL OR e.movement_key<>expected_kind OR e.identity<>'identified' OR e.event_kind NOT IN('pending','settled'))
 THEN RAISE EXCEPTION 'ELIGIBILITY_SOURCE_REQUIRED' USING ERRCODE='23514';END IF;
 IF NEW.fixture IN('F15','F21','F22') AND NEW.source_event_id IS NOT NULL THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 settled:=e.state='settled' AND NOT EXISTS(SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=e.tenant_id AND u.account_id=e.account_id AND u.movement_key=e.movement_key AND u.identity='unidentified'
  AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command k WHERE k.tenant_id=u.tenant_id AND k.account_id=u.account_id AND k.action='reconcile_duplicate' AND k.movement_key=u.movement_key));
 paid_before:=e.state='settled' AND e.created_at<=c.created_at;
 IF NEW.fixture='F20' AND NOT coalesce(paid_before,false) THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 IF NEW.fixture='F15' THEN expected_reason:='Credit note below the £250 minimum';
 ELSIF NEW.fixture='F22' THEN expected_reason:='Prevented spending is not recovered cash';
 ELSIF NEW.fixture='F21' THEN expected_reason:=NULL;
 ELSIF coalesce(paid_before,false) AND c.case_type IN('withheld_customer_payment','duplicate_supplier_payment') THEN expected_reason:='Paid before you opened this case';
 ELSIF insurer_money THEN expected_reason:='Insurer proceeds never qualify';
 ELSIF NOT coalesce(settled,false) THEN expected_reason:='Pending money cannot qualify';
 ELSE expected_q:=CASE NEW.fixture WHEN 'F17' THEN 45000 WHEN 'F18' THEN 262000 WHEN 'F19' THEN 250000 ELSE 0 END;
  expected_reason:=CASE WHEN NEW.fixture IN('F18','F19') THEN 'Fixed statutory compensation is not part of the fee base' ELSE NULL END;
 END IF;
 IF expected_q>c.claim_pence+(CASE WHEN NEW.fixture='F18' THEN 12000 ELSE 0 END) THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 IF NEW.result - ARRAY['version','policyVersion','fixture','outcome','qualifyingPrincipal','reason','reasonHeld','terminal','productionEnabled','lines'] IS DISTINCT FROM '{}'::jsonb
 OR NOT (NEW.result ?& ARRAY['version','policyVersion','fixture','outcome','qualifyingPrincipal','reason','reasonHeld','terminal','productionEnabled','lines'])
 OR coalesce(jsonb_typeof(NEW.result->'version'),'absent')<>'string' OR coalesce(jsonb_typeof(NEW.result->'policyVersion'),'absent')<>'string'
 OR coalesce(jsonb_typeof(NEW.result->'fixture'),'absent')<>'string' OR coalesce(jsonb_typeof(NEW.result->'outcome'),'absent')<>'string'
 OR coalesce(jsonb_typeof(NEW.result->'qualifyingPrincipal'),'absent')<>'object' OR coalesce(jsonb_typeof(NEW.result->'lines'),'absent')<>'array'
 OR coalesce(jsonb_typeof(NEW.result->'reason'),'absent') NOT IN('string','null')
 OR coalesce(jsonb_typeof(NEW.result->'reasonHeld'),'absent')<>'boolean' OR coalesce(jsonb_typeof(NEW.result->'terminal'),'absent')<>'boolean' OR coalesce(jsonb_typeof(NEW.result->'productionEnabled'),'absent')<>'boolean'
 OR NEW.result->>'version' IS DISTINCT FROM 'recovery-eligibility-review.v3' OR NEW.result->>'policyVersion' IS DISTINCT FROM NEW.policy_version
 OR NEW.result->>'fixture' IS DISTINCT FROM NEW.fixture OR NEW.result->'qualifyingPrincipal' IS DISTINCT FROM jsonb_build_object('pence',expected_q,'currency','GBP')
 OR NEW.result->>'reason' IS DISTINCT FROM expected_reason OR NEW.result->>'outcome' IS DISTINCT FROM (CASE WHEN expected_q>0 THEN 'eligible_for_review' ELSE 'excluded' END)
 OR NEW.result->'reasonHeld' IS DISTINCT FROM to_jsonb(NEW.fixture='F21')
 OR NEW.result->'productionEnabled' IS DISTINCT FROM 'false'::jsonb OR NEW.result->'terminal' IS DISTINCT FROM to_jsonb(NEW.fixture='F22')
 THEN RAISE EXCEPTION 'ELIGIBILITY_FIXTURE_MISMATCH' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;

-- From 0119_recovery_eligibility_v3.sql: A5 insurer line-reason arm;
-- B2 individual-interest reason arm and F19 reasonHeld release only.
CREATE OR REPLACE FUNCTION app.require_recovery_eligibility_v3_effect() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE expected_lines jsonb; candidate_q bigint:=(NEW.result->'qualifyingPrincipal'->>'pence')::bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=NEW.tenant_id AND subject_ref=NEW.case_id::text AND actor_ref='membership:'||NEW.actor_membership_id::text AND event_type='recovery.eligibility.v3_reviewed'
  AND payload->'references'->>'reviewId'=NEW.id::text AND payload->'references'->>'commandId'=NEW.command_id::text AND payload->'hashes'->>'command'=NEW.payload_hash::text
  AND payload->'hashes'->>'result'=encode(sha256(convert_to(NEW.result::text,'UTF8')),'hex'))
 THEN RAISE EXCEPTION 'ELIGIBILITY_AUDIT_REQUIRED' USING ERRCODE='23514';END IF;
 IF (SELECT count(*) FROM app.recovery_claim_line WHERE tenant_id=NEW.tenant_id AND review_id=NEW.id)<>(CASE WHEN NEW.fixture IN('F18','F19') THEN 3 ELSE 1 END)
 THEN RAISE EXCEPTION 'ELIGIBILITY_LINES_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT jsonb_agg(jsonb_build_object(
  'kind',l.kind,'debtorType',l.debtor_type,'netPence',l.net_pence,
  'qualifyingPrincipal',jsonb_build_object('pence',CASE WHEN candidate_q=0 OR l.kind='fixed_compensation' OR l.kind='statutory_interest' AND l.debtor_type='individual' THEN 0 ELSE l.net_pence END,'currency','GBP'),
  'reason',CASE WHEN NEW.result->>'reason'='Paid before you opened this case' THEN 'Paid before you opened this case'
    WHEN NEW.result->>'reason'='Insurer proceeds never qualify' THEN 'Insurer proceeds never qualify'
    WHEN NEW.fixture='F15' THEN 'Credit note below the £250 minimum'
    WHEN NEW.fixture='F22' THEN 'Prevented spending is not recovered cash'
    WHEN l.kind='fixed_compensation' THEN 'Fixed statutory compensation is not part of the fee base'
    WHEN l.kind='statutory_interest' AND l.debtor_type='individual' THEN 'Late-payment interest only counts when a business paid it. This customer is a private individual, so this interest isn’t counted as recovered money and there’s no fee on it.'
    WHEN NEW.result->>'reason'='Pending money cannot qualify' THEN 'Pending money cannot qualify' ELSE NULL END,
  'reasonHeld',NEW.fixture='F21')
  ORDER BY CASE l.kind WHEN 'principal' THEN 1 WHEN 'statutory_interest' THEN 2 ELSE 3 END)
 INTO expected_lines FROM app.recovery_claim_line l WHERE l.tenant_id=NEW.tenant_id AND l.review_id=NEW.id;
 IF NEW.result->'lines' IS DISTINCT FROM expected_lines THEN RAISE EXCEPTION 'ELIGIBILITY_LINES_REQUIRED' USING ERRCODE='23514';END IF;
 RETURN NULL;
END $$;
COMMIT;
