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
GRANT USAGE ON SCHEMA outbound_control TO jobguard_worker;
GRANT EXECUTE ON FUNCTION outbound_control.claims_enabled() TO jobguard_worker;
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

-- Privilege checks use the authenticated login, including SET-only paths.
CREATE FUNCTION app.lp10_assert_worker() RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=session_user
  AND NOT(r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
  AND pg_has_role(r.oid,'jobguard_worker','USAGE')
  AND NOT pg_has_role(r.oid,'jobguard_runtime','USAGE') AND NOT pg_has_role(r.oid,'jobguard_runtime','SET')
  AND NOT pg_has_role(r.oid,'jobguard_migration','USAGE') AND NOT pg_has_role(r.oid,'jobguard_migration','SET')
  AND NOT pg_has_role(r.oid,'jobguard_binding_owner','USAGE') AND NOT pg_has_role(r.oid,'jobguard_binding_owner','SET')
  AND (SELECT count(*) FROM pg_auth_members WHERE member=r.oid)=1) THEN
  RAISE EXCEPTION 'WORKER_LOGIN_UNSAFE' USING ERRCODE='42501';
 END IF;
END $$;
ALTER FUNCTION app.lp10_assert_worker() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp10_assert_worker() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_worker;

-- Private lookup derives scope only from the committed outbox signal. The
-- tenant lock matches the existing revocation/execution serialization lock.
CREATE FUNCTION app.lp10_lock_action(p_action uuid) RETURNS app.action_outbox
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid; item app.action_outbox;
BEGIN
 PERFORM app.lp10_assert_worker();
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
 AND ((m.role='owner' AND p_item.action_type<>'extra.client_approval_request.send') OR (p_item.action_type='extra.client_approval_request.send' AND p_item.adapter='fake_email') OR (m.role='finance' AND p_item.action_type='customer_portal.signin.send'
  AND p_item.adapter='fake_email' AND p_item.policy_version='customer-signin.synthetic.v1'
  AND p_item.recipient ~ '^[^@[:space:]]+@[^@[:space:]]+\.invalid$' AND p_item.amount_pence IS NULL AND p_item.currency IS NULL))
 AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND NOT EXISTS(SELECT FROM app.contractor_membership_revocation v WHERE (v.tenant_id,v.membership_id)=(m.tenant_id,m.id))
 AND a.revoked_at IS NULL
 AND p_item.action_type=a.action_type AND p_item.recipient IS NOT DISTINCT FROM a.recipient
 AND p_item.content_hash=a.content_hash AND p_item.aggregate_revision=a.aggregate_revision
 AND p_item.amount_pence IS NOT DISTINCT FROM a.amount_pence AND p_item.currency IS NOT DISTINCT FROM a.currency
 AND p_item.policy_version=a.policy_version AND p_item.authorization_expires_at<=a.expires_at
 AND p_item.content_hash=encode(sha256(convert_to(p_item.immutable_content,'UTF8')),'hex')
 AND (p_item.action_type<>'extra.client_approval_request.send' OR EXISTS(
  SELECT 1 FROM app.extra_client_link k WHERE(k.tenant_id,k.outbox_action_id)=(p_item.tenant_id,p_item.id)
  AND app.xc_link_current(k.id) AND app.xc_send_authority(m.id,k.variation_id)))
$$;

CREATE FUNCTION app.bind_worker_action(p_action uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE item app.action_outbox; principal uuid; saved_tenant text:=current_setting('app.tenant_id',true);
BEGIN
 item:=app.lp10_lock_action(p_action); principal:=app.lp10_action_author(item);
 IF principal IS NULL OR item.authorization_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'WORKER_ACTION_REFUSED' USING ERRCODE='42501'; END IF;
 -- Entries are private transaction bookkeeping; expired entries have no authority.
 DELETE FROM control_plane.worker_action_binding WHERE expires_at<=clock_timestamp();
 INSERT INTO control_plane.worker_action_binding(transaction_id,action_id,tenant_id,actor_id,executor) VALUES(pg_current_xact_id(),item.id,item.tenant_id,principal,session_user)
 ON CONFLICT(transaction_id) DO NOTHING;
 IF NOT EXISTS(SELECT FROM control_plane.worker_action_binding b WHERE b.transaction_id=pg_current_xact_id()
  AND (b.action_id,b.tenant_id,b.actor_id,b.executor)=(item.id,item.tenant_id,principal,session_user)) THEN
  RAISE EXCEPTION 'WORKER_ACTION_REFUSED' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
END $$;

-- Protected transaction-scoped context for worker-only internal writes. Caller
-- settings are never consulted; no binding survives into another transaction.
CREATE FUNCTION app.worker_action_context() RETURNS TABLE(action_id uuid,tenant_id uuid,actor_id uuid)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE bound control_plane.worker_action_binding; item app.action_outbox;
 saved_tenant text:=current_setting('app.tenant_id',true);
BEGIN
 SELECT * INTO bound FROM control_plane.worker_action_binding b
 WHERE b.transaction_id=pg_current_xact_id_if_assigned() AND b.executor=session_user AND b.expires_at>clock_timestamp();
 IF NOT FOUND THEN RETURN; END IF;
 item:=app.lp10_lock_action(bound.action_id);
 IF app.lp10_action_author(item) IS DISTINCT FROM bound.actor_id OR item.authorization_expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'WORKER_ACTION_REFUSED' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 RETURN QUERY SELECT bound.action_id,bound.tenant_id,bound.actor_id;
END $$;

CREATE FUNCTION app.lp10_worker_audit(p_item app.action_outbox,p_event text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE principal uuid;
BEGIN
 SELECT a.actor_membership_id INTO principal FROM app.action_authorization a
 WHERE (a.tenant_id,a.id)=(p_item.tenant_id,p_item.authorization_id);
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object(
  'id',gen_random_uuid(),'version','audit.v1','actorRef',
   (CASE WHEN p_event='authorization_revoked' THEN 'system:outbox' ELSE 'worker:'||session_user END),
  'eventType','outbox.'||p_event,'subjectType','outbox_action','subjectRef',p_item.id::text,
  'payload',jsonb_build_object('references',jsonb_build_object('authorizingMembership',principal::text,
   'authorization',p_item.authorization_id::text,'executingWorker',session_user) ||
   (CASE WHEN p_event='authorization_revoked' THEN jsonb_build_object('outcome','cancelled','code','AUTHORIZATION_REVOKED') WHEN p_event='cancelled' THEN jsonb_build_object('reason','order_authority_stale') ELSE '{}'::jsonb END),
   'classifications',jsonb_build_object('outcome','operational')))),'checked_operation');
END $$;

-- The preflight mirrors readMerchantOrder's current authoritative projection.
-- It receives an owner-read action row, never caller-selected tenant/order data.
CREATE FUNCTION app.lp10_order_current(p_item app.action_outbox) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE doc jsonb; j uuid; rev uuid; row_data record; expected jsonb;
BEGIN
 IF p_item.adapter<>'fake_merchant_order' THEN RETURN true; END IF;
 IF current_database()<>'jobguard_synthetic_demo' OR p_item.action_type<>'purchase_order.send.dark'
  OR p_item.policy_version<>'dark-merchant-order.v1' THEN RETURN false; END IF;
 BEGIN
  doc:=p_item.immutable_content::jsonb; j:=(doc->>'jobId')::uuid; rev:=(doc->>'revisionId')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RETURN false;
 END;
 IF doc->>'tenantId' IS DISTINCT FROM p_item.tenant_id::text OR j IS NULL OR rev IS NULL THEN RETURN false; END IF;
 BEGIN PERFORM app.require_watchdog_live(j);
 EXCEPTION WHEN SQLSTATE '42501' OR SQLSTATE 'P0001' THEN RETURN false;
 END;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_item.tenant_id::text||':'||j::text||':watchdog-command',0));
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=p_item.tenant_id AND job_id=j) THEN RETURN false; END IF;
 SELECT projection.* INTO row_data FROM (SELECT r.id,r.draft_id,r.revision,r.authority_hash,r.quantity_decimal,r.unit_price_pence,
    r.recipient,to_char(r.required_date,'YYYY-MM-DD') delivery_date,d.requirement_id,q.sku_id,s.merchant_id,
    rate.id rate_id,rate.version rate_version,rate.price_pence,rate.price_unit,rate.tax_basis,rate.applicable_count,
    CASE WHEN rate.price_unit='each' THEN '1' ELSE pack.each_quantity_decimal END pack_quantity
    FROM app.purchase_order_revision r
    JOIN app.purchase_order_draft d ON(d.tenant_id,d.job_id,d.id)=(r.tenant_id,r.job_id,r.draft_id)
    JOIN app.material_requirement q ON(q.tenant_id,q.job_id,q.id)=(d.tenant_id,d.job_id,d.requirement_id)
    JOIN app.merchant_sku s ON(s.tenant_id,s.id)=(q.tenant_id,q.sku_id)
    JOIN LATERAL(SELECT a.*,count(*) OVER() applicable_count FROM app.material_rate_revision a WHERE a.tenant_id=s.tenant_id
      AND a.merchant_id=s.merchant_id AND a.sku_id=s.id AND a.effective_from<=CURRENT_DATE
      AND (a.effective_to IS NULL OR a.effective_to>=CURRENT_DATE) ORDER BY a.version DESC LIMIT 1)rate ON true
    LEFT JOIN LATERAL(SELECT p.each_quantity_decimal FROM app.material_pack_conversion p
      WHERE p.tenant_id=s.tenant_id AND p.sku_id=s.id AND p.pack_unit=rate.price_unit
      AND p.effective_from<=CURRENT_DATE ORDER BY p.effective_from DESC LIMIT 1)pack ON true
    WHERE r.tenant_id=p_item.tenant_id AND r.job_id=j AND r.id=rev AND q.unit='each'
    AND NOT EXISTS(SELECT 1 FROM app.purchase_order_revision newer WHERE newer.tenant_id=r.tenant_id
      AND newer.draft_id=r.draft_id AND newer.revision>r.revision)) projection;
 IF NOT FOUND OR row_data.applicable_count<>1 OR row_data.tax_basis<>'net' OR row_data.pack_quantity IS NULL THEN RETURN false; END IF;
 expected:=jsonb_build_object('version','merchant-order.v1','environment','synthetic_demo','tenantId',p_item.tenant_id,
  'jobId',j,'draftId',row_data.draft_id,'revisionId',row_data.id,'revision',row_data.revision,
  'revisionAuthorityHash',row_data.authority_hash,'merchantId',row_data.merchant_id,'recipient',row_data.recipient,
  'deliveryDate',row_data.delivery_date,'line',jsonb_build_object('requirementId',row_data.requirement_id,'skuId',row_data.sku_id,
   'quantity',row_data.quantity_decimal,'unit','each','unitPricePence',row_data.unit_price_pence,
   'rateId',row_data.rate_id,'rateVersion',row_data.rate_version,'agreedPricePence',row_data.price_pence,
   'rateUnit',row_data.price_unit,'packQuantity',row_data.pack_quantity,'taxBasis',row_data.tax_basis,'currency','GBP'));
 RETURN doc=expected;
END $$;
ALTER FUNCTION app.lp10_order_current(app.action_outbox) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp10_order_current(app.action_outbox) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_worker;

CREATE FUNCTION app.claim_worker_action(p_action uuid,p_adapters text[]) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE item app.action_outbox; principal uuid; attempt_no integer; token uuid; saved_tenant text:=current_setting('app.tenant_id',true);
BEGIN
 IF NOT outbound_control.claims_enabled() THEN PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true); RETURN NULL; END IF;
 item:=app.lp10_lock_action(p_action);
 IF NOT (item.adapter=ANY(p_adapters)) OR p_adapters IS NULL THEN PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true); RETURN NULL; END IF;
 IF item.status NOT IN('pending','retryable','executing') THEN PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true); RETURN NULL; END IF;
 IF item.status='executing' THEN
  IF item.claimed_at<clock_timestamp()-interval '5 minutes' THEN
   UPDATE app.action_outbox SET status='outcome_unknown',updated_at=clock_timestamp() WHERE (tenant_id,id)=(item.tenant_id,item.id);
   UPDATE app.action_attempt SET outcome='outcome_unknown',finished_at=clock_timestamp(),error_code='lease_expired'
    WHERE tenant_id=item.tenant_id AND action_id=item.id AND outcome='started';
   PERFORM app.lp10_worker_audit(item,'outcome_unknown');
  END IF;
  PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true); RETURN NULL; -- Never blindly deliver a lease-expired action again.
 END IF;
 IF EXISTS(SELECT 1 FROM app.action_authorization a
  JOIN app.contractor_membership_revocation r ON(r.tenant_id,r.membership_id)=(a.tenant_id,a.actor_membership_id)
  WHERE(a.tenant_id,a.id)=(item.tenant_id,item.authorization_id)) THEN
  UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE(tenant_id,id)=(item.tenant_id,item.id);
  PERFORM app.lp10_worker_audit(item,'authorization_revoked');
  PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
  RETURN jsonb_build_object('refused',true,'code','AUTHORIZATION_REVOKED');
 END IF;
 IF item.next_attempt_at>clock_timestamp() THEN PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true); RETURN NULL; END IF;
 principal:=app.lp10_action_author(item);
 IF item.action_type='extra.client_approval_request.send' AND (app.xc_cancel_authority_loss(item.id) OR NOT EXISTS(SELECT 1 FROM app.extra_client_link k WHERE (k.tenant_id,k.outbox_action_id)=(item.tenant_id,item.id) AND app.xc_send_authority(principal,k.variation_id))) THEN principal:=NULL; END IF;
 IF principal IS NULL THEN
  PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true); RETURN NULL;
 END IF;
 IF NOT app.lp10_order_current(item) THEN
  UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE (tenant_id,id)=(item.tenant_id,item.id);
  PERFORM app.lp10_worker_audit(item,'cancelled');
  PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
  RETURN jsonb_build_object('refused',true,'code','AUTHORIZATION_REVOKED');
 END IF;
 IF item.authorization_expires_at<=clock_timestamp() THEN
  UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE (tenant_id,id)=(item.tenant_id,item.id);
  PERFORM app.lp10_worker_audit(item,'authorization_revoked');
  PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 RETURN jsonb_build_object('refused',true,'code','AUTHORIZATION_REVOKED');
 END IF;
 PERFORM app.bind_worker_action(p_action);
 IF item.action_type='extra.client_approval_request.send'
  AND coalesce((app.mon8_feature_decision(principal,'approval_chains','new_work')->>'executable')::boolean,false) IS NOT TRUE THEN
  UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE (tenant_id,id)=(item.tenant_id,item.id);
  PERFORM app.lp10_worker_audit(item,'entitlement_lost');
  PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true); RETURN NULL;
 END IF;
 SELECT coalesce(max(a.attempt_number),0)+1 INTO attempt_no FROM app.action_attempt a
 WHERE a.tenant_id=item.tenant_id AND a.action_id=item.id;
 token:=gen_random_uuid();
 UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE (tenant_id,id)=(item.tenant_id,item.id);
 INSERT INTO app.action_attempt(id,tenant_id,action_id,attempt_number,outcome) VALUES(token,item.tenant_id,item.id,attempt_no,'started');
 PERFORM app.lp10_worker_audit(item,'claimed');
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 RETURN jsonb_build_object('action',to_jsonb(item),'attempt',attempt_no,'token',token);
END $$;

CREATE FUNCTION app.complete_worker_action(p_action uuid,p_token uuid,p_kind text,p_reference text,p_code text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE item app.action_outbox; attempt_row app.action_attempt; next_status text; saved_tenant text:=current_setting('app.tenant_id',true);
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('succeeded','retryable','outcome_unknown')
  OR (p_kind='succeeded' AND (p_reference IS NULL OR length(p_reference) NOT BETWEEN 1 AND 300 OR p_code IS NOT NULL))
  OR (p_kind<>'succeeded' AND (p_reference IS NOT NULL OR p_code IS NULL OR length(p_code) NOT BETWEEN 1 AND 100)) THEN
  RAISE EXCEPTION 'WORKER_RESULT_INVALID' USING ERRCODE='22023';
 END IF;
 item:=app.lp10_lock_action(p_action);
 SELECT * INTO attempt_row FROM app.action_attempt a WHERE (a.tenant_id,a.action_id,a.id)=(item.tenant_id,item.id,p_token) FOR UPDATE;
 IF NOT FOUND OR attempt_row.outcome<>'started' OR item.status<>'executing' THEN PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true); RETURN false; END IF;
 -- Revocation after enqueue/claim refuses the completion. The provider may
 -- already have accepted: retain unknown outcome, never retry automatically.
 IF app.lp10_action_author(item) IS NULL OR item.authorization_expires_at<=clock_timestamp() THEN
  UPDATE app.action_outbox SET status='outcome_unknown',updated_at=clock_timestamp() WHERE (tenant_id,id)=(item.tenant_id,item.id);
  UPDATE app.action_attempt SET outcome='outcome_unknown',error_code='AUTHORIZATION_REVOKED',finished_at=clock_timestamp()
   WHERE (tenant_id,id)=(item.tenant_id,p_token);
  PERFORM app.lp10_worker_audit(item,'authorization_revoked'); PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true); RETURN false;
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
 PERFORM app.lp10_worker_audit(item,next_status);
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true); RETURN true;
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
-- The synthetic provider guard retains every source/approval check, but row
-- locks run as the table owner after runtime UPDATE is withdrawn.
CREATE OR REPLACE FUNCTION app.guard_recovery_message_sink() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE m app.recovery_message; s record; latest_pack integer; pack_sources jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.case_id::text));
 PERFORM app.lock_recovery_message_sources(NEW.tenant_id);
 SELECT * INTO m FROM app.recovery_message WHERE tenant_id=NEW.tenant_id AND id=NEW.message_id AND job_id=NEW.job_id AND case_id=NEW.case_id;
 IF NOT FOUND OR NOT EXISTS (
  SELECT 1 FROM app.recovery_message_approval ap
  JOIN app.action_outbox o ON o.tenant_id=ap.tenant_id AND o.id=ap.outbox_action_id
  JOIN app.action_authorization a ON a.tenant_id=o.tenant_id AND a.id=o.authorization_id
  JOIN app.decision_resolution r ON r.tenant_id=a.tenant_id AND r.id=a.resolution_id AND r.resolution='approved'
  JOIN app.membership mem ON mem.tenant_id=a.tenant_id AND mem.id=a.actor_membership_id AND mem.role='owner' AND mem.revoked_at IS NULL
   AND (mem.expires_at IS NULL OR mem.expires_at>clock_timestamp())
  WHERE ap.tenant_id=m.tenant_id AND ap.message_id=m.id AND ap.outbox_action_id=NEW.outbox_action_id
   AND o.status='executing' AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp()
   AND m.recipient=NEW.recipient AND m.body=NEW.body AND m.content_hash=NEW.content_hash AND m.attachment_hash=NEW.attachment_hash
  FOR SHARE OF a,mem,o)
 THEN RAISE EXCEPTION 'RECOVERY_MESSAGE_SINK_INVALID' USING ERRCODE='23514'; END IF;
 -- M4-6-S: a reminder whose follow-up has stopped (cancelled, or its practice run archived) is never recorded as delivered.
 IF EXISTS (SELECT 1 FROM app.recovery_follow_up_reminder l WHERE l.tenant_id=m.tenant_id AND l.message_id=m.id
   AND app.recovery_follow_up_stop_reason(l.tenant_id,l.follow_up_id) IS NOT NULL) THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
 SELECT * INTO s FROM app.recovery_message_case_snapshot(m.tenant_id,m.job_id,m.case_id);
 IF NOT FOUND OR s.synthetic IS NOT TRUE OR s.environment<>'synthetic_demo' OR s.case_revision<>m.case_revision OR s.outstanding_pence<>m.amount_pence
    OR app.recovery_message_source_refs(m.immutable_content) IS DISTINCT FROM s.source_refs THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
 SELECT max(p.revision) INTO latest_pack FROM app.evidence_pack_revision p WHERE p.tenant_id=m.tenant_id AND p.case_id=m.case_id;
 SELECT p.sources INTO pack_sources FROM app.evidence_pack_revision p
  WHERE p.tenant_id=m.tenant_id AND p.job_id=m.job_id AND p.case_id=m.case_id AND p.pack_id=m.pack_id AND p.revision=m.pack_revision
   AND p.manifest_hash=m.manifest_hash AND p.content_hash=m.attachment_hash
   AND p.source_omissions='[]'::jsonb AND p.format='TEXT' AND p.artifact_text IS NOT NULL
   AND encode(sha256(convert_to(p.artifact_text,'UTF8')),'hex')=p.content_hash
   AND encode(sha256(convert_to(p.canonical_manifest,'UTF8')),'hex')=p.manifest_hash;
 IF latest_pack IS DISTINCT FROM m.pack_revision OR pack_sources IS NULL
    OR NOT EXISTS (SELECT 1 FROM app.evidence_pack_attachment_approval x WHERE x.tenant_id=m.tenant_id AND x.id=m.attachment_approval_id AND x.pack_id=m.pack_id
      AND x.manifest_hash=m.manifest_hash AND x.content_hash=m.attachment_hash)
    OR NOT app.recovery_message_proofs_current(m.tenant_id,m.job_id,pack_sources)
    OR NOT app.recovery_message_sources_current(m.tenant_id,m.job_id,m.case_id,pack_sources) THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_recovery_message_sink() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_worker;

-- A sender can cancel only the exact link closed by their current checked
-- replace/revoke command. This cannot claim work or report a provider result.
CREATE FUNCTION app.cancel_extra_outbox(p_action uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=app.current_tenant(); actor uuid:=app.current_actor();
BEGIN
 IF t IS NULL OR t::text IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'') OR actor IS NULL
 OR NOT EXISTS(SELECT 1 FROM app.extra_client_link k
 JOIN app.extra_client_link_closure c ON(c.tenant_id,c.link_id)=(k.tenant_id,k.id)
 JOIN app.command_receipt r ON(r.tenant_id,r.command_id)=(c.tenant_id,c.command_id)
 WHERE(k.tenant_id,k.outbox_action_id)=(t,p_action) AND c.actor_membership_id=actor
 AND r.actor_membership_id=actor AND r.status='processing'
 AND ((c.kind='replaced' AND r.command_type='IssueClientApproval') OR(c.kind='revoked' AND r.command_type='RevokeClientApproval'))) THEN
  RAISE EXCEPTION 'OUTBOX_CONTROL_REFUSED' USING ERRCODE='42501';
 END IF;
 UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp()
 WHERE(tenant_id,id)=(t,p_action) AND status IN('pending','retryable');
END $$;
ALTER FUNCTION app.cancel_extra_outbox(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.cancel_extra_outbox(uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure,jobguard_worker;
GRANT EXECUTE ON FUNCTION app.cancel_extra_outbox(uuid) TO jobguard_runtime;

-- User controls cannot supply a success result or create an execution attempt.
CREATE FUNCTION app.control_outbox(p_action uuid,p_command text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid; principal uuid; item app.action_outbox; changed integer;
BEGIN
 IF pg_has_role(session_user,'jobguard_outbound_operator','USAGE') THEN
  t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 ELSE
  t:=app.current_tenant(); principal:=app.current_actor();
  IF t::text IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'') OR NOT EXISTS(
   SELECT 1 FROM app.membership m WHERE (m.tenant_id,m.id)=(t,principal) AND m.role='owner'
    AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE(r.tenant_id,r.membership_id)=(t,principal))) THEN
   RAISE EXCEPTION 'OUTBOX_CONTROL_REFUSED' USING ERRCODE='42501';
  END IF;
 END IF;
 IF t IS NULL OR p_command IS NULL OR p_command NOT IN('cancel','retry','expire','blocked','close_attempt') THEN
  RAISE EXCEPTION 'OUTBOX_CONTROL_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO item FROM app.action_outbox WHERE (tenant_id,id)=(t,p_action) FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_command='cancel' AND item.status IN('pending','retryable','dead_letter','outcome_unknown') THEN
  UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE (tenant_id,id)=(t,p_action);
 ELSIF p_command='retry' AND item.status='retryable' THEN
  UPDATE app.action_outbox SET next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE (tenant_id,id)=(t,p_action);
 ELSIF p_command='expire' AND item.status='executing' AND item.claimed_at<clock_timestamp()-interval '5 minutes' THEN
  UPDATE app.action_outbox SET status='outcome_unknown',updated_at=clock_timestamp() WHERE (tenant_id,id)=(t,p_action);
  UPDATE app.action_attempt SET outcome='outcome_unknown',error_code='STALE_CLAIM',finished_at=clock_timestamp()
   WHERE tenant_id=t AND action_id=p_action AND outcome='started';
 ELSIF p_command='blocked' AND (item.status='pending' OR (item.status IN('retryable','dead_letter') AND EXISTS(
  SELECT 1 FROM app.action_attempt a WHERE (a.tenant_id,a.action_id)=(t,p_action) AND a.error_code='FAKE_BLOCKED_CHANGED'
   AND a.attempt_number=(SELECT max(b.attempt_number) FROM app.action_attempt b WHERE(b.tenant_id,b.action_id)=(t,p_action))))) THEN
  UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE (tenant_id,id)=(t,p_action);
 ELSIF p_command='close_attempt' AND item.status='outcome_unknown' THEN
  UPDATE app.action_attempt SET outcome='outcome_unknown',error_code='STALE_CLAIM',finished_at=clock_timestamp()
   WHERE tenant_id=t AND action_id=p_action AND outcome='started';
  GET DIAGNOSTICS changed=ROW_COUNT; RETURN changed>0;
 ELSE RETURN false;
 END IF;
 RETURN true;
END $$;
ALTER FUNCTION app.control_outbox(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.control_outbox(uuid,text) FROM PUBLIC,jobguard_identity,jobguard_infrastructure,jobguard_worker;
GRANT EXECUTE ON FUNCTION app.control_outbox(uuid,text) TO jobguard_runtime,jobguard_outbound_operator;

CREATE FUNCTION app.lock_outbox_for_history(p_action uuid) RETURNS SETOF app.action_outbox
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=app.current_tenant(); principal uuid:=app.current_actor();
BEGIN
 IF t::text IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'') OR NOT EXISTS(
  SELECT 1 FROM app.membership m WHERE(m.tenant_id,m.id)=(t,principal) AND m.role='owner'
  AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE(r.tenant_id,r.membership_id)=(t,principal))) THEN
  RAISE EXCEPTION 'OUTBOX_CONTROL_REFUSED' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT o.* FROM app.action_outbox o WHERE(o.tenant_id,o.id)=(t,p_action) FOR SHARE;
END $$;
ALTER FUNCTION app.lock_outbox_for_history(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lock_outbox_for_history(uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure,jobguard_worker;
GRANT EXECUTE ON FUNCTION app.lock_outbox_for_history(uuid) TO jobguard_runtime;

-- Reconciliation is a worker capability, fenced by the exact pre-network revision.
CREATE FUNCTION app.worker_reconciliation(p_action uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE item app.action_outbox; saved_tenant text:=current_setting('app.tenant_id',true);
BEGIN
 item:=app.lp10_lock_action(p_action);
 IF item.status<>'outcome_unknown' THEN PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true); RETURN NULL; END IF;
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 RETURN jsonb_build_object('adapter',item.adapter,'provider_effect_key',item.provider_effect_key,'revision',item.updated_at::text);
END $$;
CREATE FUNCTION app.reconcile_worker_action(p_action uuid,p_revision text,p_adapter text,p_effect text,p_result text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE item app.action_outbox; next_status text; saved_tenant text:=current_setting('app.tenant_id',true);
BEGIN
 IF p_result IS NULL OR p_result NOT IN('succeeded','not_found') THEN RAISE EXCEPTION 'WORKER_RESULT_INVALID' USING ERRCODE='22023'; END IF;
 item:=app.lp10_lock_action(p_action);
 IF item.status<>'outcome_unknown' OR item.updated_at::text IS DISTINCT FROM p_revision
  OR item.adapter IS DISTINCT FROM p_adapter OR item.provider_effect_key IS DISTINCT FROM p_effect THEN
  PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true); RETURN false;
 END IF;
 -- A positive external fact remains reconcilable after revocation; no new send is authorized.
 next_status:=(CASE WHEN p_result='succeeded' THEN 'succeeded' ELSE 'retryable' END);
 UPDATE app.action_outbox SET status=next_status,next_attempt_at=clock_timestamp(),
  completed_at=(CASE WHEN next_status='succeeded' THEN clock_timestamp() ELSE NULL END),updated_at=clock_timestamp()
 WHERE (tenant_id,id)=(item.tenant_id,item.id);
 PERFORM app.lp10_worker_audit(item,next_status);
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true); RETURN true;
END $$;
ALTER FUNCTION app.worker_reconciliation(uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.reconcile_worker_action(uuid,text,text,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.worker_reconciliation(uuid),app.reconcile_worker_action(uuid,text,text,text,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.worker_reconciliation(uuid),app.reconcile_worker_action(uuid,text,text,text,text) TO jobguard_worker;

COMMIT;
