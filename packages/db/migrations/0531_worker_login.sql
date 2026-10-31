BEGIN;
-- Provisioned administratively, never by the NOCREATEROLE migration owner.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='jobguard_worker') THEN
  RAISE EXCEPTION 'jobguard_worker missing; run administrative ensureRoles' USING ERRCODE='42704';
 END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='jobguard_worker'
  AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit OR rolcanlogin))
  OR EXISTS(SELECT FROM pg_auth_members WHERE member='jobguard_worker'::regrole) THEN
  RAISE EXCEPTION 'unsafe worker capability role' USING ERRCODE='42501';
 END IF;
END $$;
GRANT USAGE ON SCHEMA app TO jobguard_worker;
-- No table privileges, no inheritance from the web or infrastructure role.
-- Column grants survive REVOKE UPDATE(table), so withdraw both explicitly.
REVOKE UPDATE ON app.action_outbox,app.action_attempt FROM jobguard_runtime;
REVOKE UPDATE(status,next_attempt_at,claimed_at,completed_at,updated_at) ON app.action_outbox FROM jobguard_runtime;
REVOKE UPDATE(outcome,provider_reference,error_code,finished_at) ON app.action_attempt FROM jobguard_runtime;
REVOKE INSERT ON app.action_attempt FROM jobguard_runtime;

CREATE UNLOGGED TABLE control_plane.worker_action_binding (
 transaction_id xid8 PRIMARY KEY, action_id uuid NOT NULL, tenant_id uuid NOT NULL,
 actor_id uuid NOT NULL, executor name NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes'
);
ALTER TABLE control_plane.worker_action_binding OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.worker_action_binding FROM PUBLIC,jobguard_worker,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

-- Private lookup derives scope only from the committed outbox signal. The
-- tenant lock matches the existing revocation/execution serialization lock.
CREATE FUNCTION app.lp10_lock_action(p_action uuid) RETURNS app.action_outbox
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid; item app.action_outbox;
BEGIN
 SELECT s.tenant_id INTO t FROM infrastructure.outbox_signal s WHERE s.action_id=p_action;
 IF t IS NULL THEN RAISE EXCEPTION 'WORKER_ACTION_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 SELECT * INTO item FROM app.action_outbox o WHERE (o.tenant_id,o.id)=(t,p_action) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKER_ACTION_REFUSED' USING ERRCODE='42501'; END IF;
 RETURN item;
END $$;

-- Same eligibility as the current executor, including the narrow synthetic
-- customer-signin finance exception. No actor or tenant parameter is accepted.
CREATE FUNCTION app.lp10_action_author(p_item app.action_outbox) RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT m.id FROM app.action_authorization a
 JOIN app.decision_resolution r ON r.tenant_id=a.tenant_id AND r.id=a.resolution_id AND r.resolution='approved'
  AND r.decision_id=a.decision_id AND r.actor_membership_id=a.actor_membership_id
 JOIN app.membership m ON m.tenant_id=a.tenant_id AND m.id=a.actor_membership_id
 WHERE (a.tenant_id,a.id)=(p_item.tenant_id,p_item.authorization_id)
 AND (m.role='owner' OR (m.role='finance' AND p_item.action_type='customer_portal.signin.send'
  AND p_item.adapter='fake_email' AND p_item.policy_version='customer-signin.synthetic.v1'
  AND p_item.recipient ~ '^[^@[:space:]]+@[^@[:space:]]+\.invalid$' AND p_item.amount_pence IS NULL AND p_item.currency IS NULL))
 AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND NOT EXISTS(SELECT FROM app.contractor_membership_revocation v WHERE (v.tenant_id,v.membership_id)=(m.tenant_id,m.id))
 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp()
 AND p_item.authorization_expires_at>clock_timestamp()
 AND p_item.action_type=a.action_type AND p_item.recipient IS NOT DISTINCT FROM a.recipient
 AND p_item.content_hash=a.content_hash AND p_item.aggregate_revision=a.aggregate_revision
 AND p_item.amount_pence IS NOT DISTINCT FROM a.amount_pence AND p_item.currency IS NOT DISTINCT FROM a.currency
 AND p_item.policy_version=a.policy_version AND p_item.authorization_expires_at<=a.expires_at
 AND p_item.content_hash=encode(sha256(convert_to(p_item.immutable_content,'UTF8')),'hex')
$$;

CREATE FUNCTION app.bind_worker_action(p_action uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE item app.action_outbox; principal uuid;
BEGIN
 item:=app.lp10_lock_action(p_action); principal:=app.lp10_action_author(item);
 IF principal IS NULL THEN RAISE EXCEPTION 'WORKER_ACTION_REFUSED' USING ERRCODE='42501'; END IF;
 DELETE FROM control_plane.worker_action_binding WHERE expires_at<=clock_timestamp();
 INSERT INTO control_plane.worker_action_binding(transaction_id,action_id,tenant_id,actor_id,executor) VALUES(pg_current_xact_id(),item.id,item.tenant_id,principal,session_user);
END $$;

-- Protected transaction-scoped context for worker-only internal writes. Caller
-- settings are never consulted; no binding survives into another transaction.
CREATE FUNCTION app.worker_action_context() RETURNS TABLE(action_id uuid,tenant_id uuid,actor_id uuid)
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT b.action_id,b.tenant_id,b.actor_id FROM control_plane.worker_action_binding b
 WHERE b.transaction_id=pg_current_xact_id_if_assigned() AND b.executor=session_user AND b.expires_at>clock_timestamp()
$$;

CREATE FUNCTION app.lp10_worker_audit(p_item app.action_outbox,p_event text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE principal uuid;
BEGIN
 SELECT a.actor_membership_id INTO principal FROM app.action_authorization a
 WHERE (a.tenant_id,a.id)=(p_item.tenant_id,p_item.authorization_id);
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object(
  'id',gen_random_uuid(),'version','audit.v1','actorRef','worker:'||session_user,
  'eventType','outbox.'||p_event,'subjectType','outbox_action','subjectRef',p_item.id::text,
  'payload',jsonb_build_object('references',jsonb_build_object('authorizingMembership',principal::text,
   'authorization',p_item.authorization_id::text,'executingWorker',session_user),
   'classifications',jsonb_build_object('outcome','operational')))),'checked_operation');
END $$;

CREATE FUNCTION app.claim_worker_action(p_action uuid,p_adapters text[]) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE item app.action_outbox; principal uuid; attempt_no integer; token uuid;
BEGIN
 item:=app.lp10_lock_action(p_action);
 IF NOT (item.adapter=ANY(p_adapters)) OR p_adapters IS NULL THEN RETURN NULL; END IF;
 IF item.status NOT IN('pending','retryable','executing') THEN RETURN NULL; END IF;
 IF item.status='executing' THEN
  IF item.claimed_at<clock_timestamp()-interval '5 minutes' THEN
   UPDATE app.action_outbox SET status='outcome_unknown',updated_at=clock_timestamp() WHERE (tenant_id,id)=(item.tenant_id,item.id);
   UPDATE app.action_attempt SET outcome='outcome_unknown',finished_at=clock_timestamp(),error_code='lease_expired'
    WHERE tenant_id=item.tenant_id AND action_id=item.id AND outcome='started';
   PERFORM app.lp10_worker_audit(item,'outcome_unknown');
  END IF;
  RETURN NULL; -- Never blindly deliver a lease-expired action again.
 END IF;
 IF item.next_attempt_at>clock_timestamp() THEN RETURN NULL; END IF;
 principal:=app.lp10_action_author(item);
 IF principal IS NULL THEN
  UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE (tenant_id,id)=(item.tenant_id,item.id);
  PERFORM app.lp10_worker_audit(item,'authorization_revoked');
  RETURN jsonb_build_object('refused',true,'code','AUTHORIZATION_REVOKED');
 END IF;
 PERFORM app.bind_worker_action(p_action);
 SELECT coalesce(max(a.attempt_number),0)+1 INTO attempt_no FROM app.action_attempt a
 WHERE a.tenant_id=item.tenant_id AND a.action_id=item.id;
 token:=gen_random_uuid();
 UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE (tenant_id,id)=(item.tenant_id,item.id);
 INSERT INTO app.action_attempt(id,tenant_id,action_id,attempt_number,outcome) VALUES(token,item.tenant_id,item.id,attempt_no,'started');
 PERFORM app.lp10_worker_audit(item,'claimed');
 RETURN jsonb_build_object('action',to_jsonb(item),'attempt',attempt_no,'token',token);
END $$;

CREATE FUNCTION app.complete_worker_action(p_action uuid,p_token uuid,p_kind text,p_reference text,p_code text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE item app.action_outbox; attempt_row app.action_attempt; next_status text;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('succeeded','retryable','outcome_unknown')
  OR (p_kind='succeeded' AND (p_reference IS NULL OR length(p_reference) NOT BETWEEN 1 AND 300 OR p_code IS NOT NULL))
  OR (p_kind<>'succeeded' AND (p_reference IS NOT NULL OR p_code IS NULL OR length(p_code) NOT BETWEEN 1 AND 100)) THEN
  RAISE EXCEPTION 'WORKER_RESULT_INVALID' USING ERRCODE='22023';
 END IF;
 item:=app.lp10_lock_action(p_action);
 SELECT * INTO attempt_row FROM app.action_attempt a WHERE (a.tenant_id,a.action_id,a.id)=(item.tenant_id,item.id,p_token) FOR UPDATE;
 IF NOT FOUND OR attempt_row.outcome<>'started' OR item.status<>'executing' THEN RETURN false; END IF;
 -- Revocation after enqueue/claim refuses the completion. The provider may
 -- already have accepted: retain unknown outcome, never retry automatically.
 IF app.lp10_action_author(item) IS NULL THEN
  UPDATE app.action_outbox SET status='outcome_unknown',updated_at=clock_timestamp() WHERE (tenant_id,id)=(item.tenant_id,item.id);
  UPDATE app.action_attempt SET outcome='outcome_unknown',error_code='AUTHORIZATION_REVOKED',finished_at=clock_timestamp()
   WHERE (tenant_id,id)=(item.tenant_id,p_token);
  PERFORM app.lp10_worker_audit(item,'authorization_revoked'); RETURN false;
 END IF;
 PERFORM app.bind_worker_action(p_action);
 IF item.claimed_at<clock_timestamp()-interval '5 minutes' THEN next_status:='outcome_unknown';
 ELSE next_status:=(CASE WHEN p_kind='retryable' AND attempt_row.attempt_number>=5 THEN 'dead_letter' ELSE p_kind END); END IF;
 UPDATE app.action_outbox SET status=next_status,
  completed_at=(CASE WHEN next_status='succeeded' THEN clock_timestamp() ELSE NULL END),
  next_attempt_at=(CASE WHEN next_status='retryable' THEN clock_timestamp()+interval '1 minute' ELSE next_attempt_at END),updated_at=clock_timestamp()
 WHERE (tenant_id,id)=(item.tenant_id,item.id);
 UPDATE app.action_attempt SET outcome=(CASE WHEN next_status='dead_letter' THEN 'failed' ELSE next_status END),
  provider_reference=p_reference,error_code=p_code,finished_at=clock_timestamp() WHERE (tenant_id,id)=(item.tenant_id,p_token);
 PERFORM app.lp10_worker_audit(item,next_status); RETURN true;
END $$;

DO $$ DECLARE sig text; BEGIN
 FOREACH sig IN ARRAY ARRAY['lp10_lock_action(uuid)','lp10_action_author(app.action_outbox)',
  'bind_worker_action(uuid)','worker_action_context()','lp10_worker_audit(app.action_outbox,text)',
  'claim_worker_action(uuid,text[])','complete_worker_action(uuid,uuid,text,text,text)'] LOOP
  EXECUTE 'ALTER FUNCTION app.'||sig||' OWNER TO jobguard_migration';
  EXECUTE 'REVOKE ALL ON FUNCTION app.'||sig||' FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_worker';
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION app.worker_action_context(),app.bind_worker_action(uuid),app.claim_worker_action(uuid,text[]),app.complete_worker_action(uuid,uuid,text,text,text) TO jobguard_worker;
COMMIT;
