BEGIN;
-- MON-8 RED. Entitlement is an additional guard, never a grant or commercial approval.
-- No status backfill, provider action, lifecycle inference or runtime status writer.
CREATE OR REPLACE FUNCTION app.mon8_feature_decision(actor uuid, feature text, purpose text DEFAULT 'new_work') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; assignment app.commercial_track_assignment; status app.contractor_agreement_status_revision;
 agreement app.subscription_agreement_revision; entitlement text:='held'; reason text:='agreement_authority_held';
 contractor_feature boolean; today date;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END;
 IF t IS NULL OR actor IS NULL OR feature IS NULL OR purpose IS NULL
 OR feature NOT IN('watchdog','final_check','invoices','recovery_cases','pay_now','accounting_export','operative_roles','site_origin_capture','approval_chains','work_orders','sso')
 OR purpose NOT IN('new_work','retained_read') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Organisation/status before subscription/lifecycle before business locks before audit.
 contractor_feature:=feature IN('operative_roles','site_origin_capture','approval_chains','work_orders','sso');
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 IF NOT contractor_feature AND purpose='new_work' THEN PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,184)); END IF;
 -- Read after both waits. The actor belongs to this transaction's verified tenant.
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor AND m.revoked_at IS NULL
 AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=t AND r.membership_id=m.id)) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF purpose='retained_read' THEN
  -- Availability only: each reader must still enforce its exact role/resource/export permissions.
  entitlement:='included'; reason:='available';
 ELSE
  SELECT * INTO assignment FROM app.commercial_track_assignment WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
  today:=(clock_timestamp() AT TIME ZONE 'Europe/London')::date;
  IF NOT contractor_feature THEN SELECT * INTO agreement FROM app.subscription_agreement_revision WHERE tenant_id=t AND effective_date<=today ORDER BY effective_date DESC,revision DESC LIMIT 1; END IF;
  IF assignment.commercial_track='contractor' THEN
   IF contractor_feature THEN
    SELECT * INTO status FROM app.contractor_agreement_status_revision WHERE tenant_id=t AND assignment_id=assignment.id ORDER BY revision DESC LIMIT 1;
    IF status.status='active' THEN entitlement:='included'; reason:='available'; END IF;
   ELSE entitlement:='excluded'; reason:='track_forbidden'; END IF;
  ELSIF assignment.commercial_track='small_builder' OR (assignment.id IS NULL AND (agreement.id IS NOT NULL OR contractor_feature)) THEN
   IF contractor_feature THEN entitlement:='excluded'; reason:='track_forbidden';
   ELSIF agreement.id IS NOT NULL AND agreement.plan IN('Solo','Builder') THEN
    entitlement:='included';
    -- Live payment/accounting readiness and persisted MON-3 trial authority are not on main.
    reason:=CASE WHEN feature IN('pay_now','accounting_export') THEN 'feature_disabled' ELSE 'available' END;
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('version','plan-entitlement-decision.v1','environment','synthetic_demo','feature',feature,
  'entitlement',entitlement,'executable',reason='available','reason',reason);
END $$;
ALTER FUNCTION app.mon8_feature_decision(uuid,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_feature_decision(uuid,text,text) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.mon8_feature_decision(uuid,text,text) TO jobguard_runtime;
CREATE OR REPLACE FUNCTION app.mon8_require_feature(actor uuid,feature text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT (app.mon8_feature_decision(actor,feature)->>'executable')::boolean THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION app.mon8_require_feature(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_require_feature(uuid,text) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.mon8_require_feature(uuid,text) TO jobguard_runtime;

-- Current membership is separate from eligibility. Historical resource permissions remain unchanged.
CREATE OR REPLACE FUNCTION app.contractor_member_active(m uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app.membership a JOIN app.contractor_member c ON(c.tenant_id,c.membership_id)=(a.tenant_id,a.id)
 WHERE a.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND a.id=m AND a.role=ANY(ARRAY['owner','admin','operative','supervisor','surveyor','commercial_manager','finance','read_only','client_approver']) AND (a.role='client_approver')=(c.client_id IS NOT NULL) AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>statement_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=a.tenant_id AND r.membership_id=a.id))
$$;
CREATE OR REPLACE FUNCTION app.mon8_agreement_status_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'AGREEMENT_STATUS_IMMUTABLE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text,54));
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN'; END IF;
 NEW.created_at:=clock_timestamp(); RETURN NEW;
END $$;

-- Persisted normal-company adapter: identity is checked again after both lock waits.
CREATE FUNCTION app.mon8_company_feature(digest text,feature text,job uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; result jsonb;
BEGIN
 actor:=app.mon1_company_actor(t,digest);
 result:=app.mon8_feature_decision(actor,feature);
 IF app.mon1_company_actor(t,digest) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF job IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.job j WHERE j.tenant_id=t AND j.id=job) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
ALTER FUNCTION app.mon8_company_feature(text,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_company_feature(text,text,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.mon8_company_feature(text,text,uuid) TO jobguard_runtime;
COMMIT;
