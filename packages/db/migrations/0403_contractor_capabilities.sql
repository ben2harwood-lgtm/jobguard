BEGIN;
-- MON-8-P-B slice 2. One transaction-bound authority source, shared with the
-- existing session projection. No fixture activation, plan lookup or backfill.
CREATE FUNCTION app.mon8_effective_agreement() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; assignment app.commercial_track_assignment; fact app.contractor_agreement_status_revision;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'MODE_FORBIDDEN'; END IF;
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'FORBIDDEN'; END;
 IF t IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 SELECT * INTO assignment FROM app.commercial_track_assignment WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
 SELECT * INTO fact FROM app.contractor_agreement_status_revision WHERE tenant_id=t AND assignment_id=assignment.id ORDER BY revision DESC LIMIT 1;
 RETURN jsonb_build_object(
  'assignment',CASE WHEN assignment.id IS NULL THEN NULL ELSE jsonb_build_object('id',assignment.id,'revision',assignment.revision,'track',assignment.commercial_track,'agreementReference',assignment.agreement_reference) END,
  'status',CASE WHEN fact.id IS NULL THEN NULL ELSE jsonb_build_object('id',fact.id,'revision',fact.revision,'status',fact.status) END);
END $$;
ALTER FUNCTION app.mon8_effective_agreement() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_effective_agreement() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

-- Private server-side service. Permission, subject, session, immutable document,
-- amount and commercial-approval checks remain with the existing controlled writer.
-- Retained data/export access does not depend on a current agreement or plan.
CREATE FUNCTION app.mon8_require_capability(feature text, refusal text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE facts jsonb;
BEGIN
 IF feature IS NULL OR feature NOT IN('work_orders','approval_chains','sso','accounting_export')
  OR refusal IS NULL OR refusal NOT IN('NOT_FOUND','FORBIDDEN','PERMISSION_DENIED','SSO_FORBIDDEN','BILLING_FORBIDDEN') THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
 facts:=app.mon8_effective_agreement();
 IF (facts->'assignment'->>'track') IS DISTINCT FROM 'contractor' OR (facts->'status'->>'status') IS DISTINCT FROM 'active'
  OR coalesce(facts->'assignment'->>'agreementReference','') !~ '^synthetic-agreement:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION '%',refusal USING ERRCODE='42501';
 END IF;
END $$;
ALTER FUNCTION app.mon8_require_capability(text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_require_capability(text,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.mon8_require_capability(text,text) TO jobguard_runtime;

-- Keep predecessor implementations and their authorization/error contracts.
-- Each exact anchor must occur once; migration drift fails atomically.
DO $migration$
DECLARE patch record; original text; amended text;
BEGIN
 FOR patch IN SELECT * FROM (VALUES
  ('app.mon8_contractor_agreement_context(uuid)',
   ' SELECT * INTO assignment FROM app.commercial_track_assignment WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;',
   ' SELECT * INTO assignment FROM app.commercial_track_assignment WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;'),
  ('app.contractor_admin_command(uuid,jsonb,text)',
   ' permission:=''organisation.manage'';', E' IF k=''contract.revise'' THEN\n  PERFORM app.mon8_require_capability(''approval_chains'',''FORBIDDEN'');\n END IF;\n permission:=''organisation.manage'';'),
  ('app.work_order_begin(uuid,uuid,text)',
   ' IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false)',
   E' PERFORM app.mon8_require_capability(''work_orders'',''NOT_FOUND'');\n IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false)'),
  ('app.work_order_commit(uuid,jsonb)',
   ' IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false)',
   E' PERFORM app.mon8_require_capability(''work_orders'',''NOT_FOUND'');\n IF t IS NULL OR NOT coalesce(app.work_order_import_permitted(actor),false)'),
  ('app.import_sor_version(uuid,jsonb)',
   ' PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));', E' PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));\n PERFORM app.mon8_require_capability(''work_orders'',''NOT_FOUND'');'),
  ('app.import_batch_record(uuid,jsonb)',
   'BEGIN', E'BEGIN\n PERFORM app.mon8_require_capability(''work_orders'',''NOT_FOUND'');'),
  ('app.xa_begin(uuid,uuid,text[],uuid)',
   ' PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text||'':''||p_job::text,417));',
   E' IF NOT(p_types && ARRAY[''WithdrawExtra'',''MarkDuplicate'',''RevokeClientApproval'']) THEN\n  PERFORM app.mon8_require_capability(''approval_chains'',''PERMISSION_DENIED'');\n END IF;\n PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text||'':''||p_job::text,417));'),
  ('app.xa_escalate()',
   ' FOR q IN SELECT', E' PERFORM app.mon8_require_capability(''approval_chains'',''PERMISSION_DENIED'');\n FOR q IN SELECT'),
  ('identity.sso_admin_command(character,jsonb)',
   ' actor:=identity.sso_require_admin(s,t);',
   E' actor:=identity.sso_require_admin(s,t);\n IF (p->>''action'') IS DISTINCT FROM ''mapping.set'' OR (p->>''enabled'') IS DISTINCT FROM ''false'' THEN\n  PERFORM app.mon8_require_capability(''sso'',''SSO_FORBIDDEN'');\n END IF;'),
  ('identity.sso_cache(uuid,text,text,character,uuid,text)',
   ' IF operation=''save'' THEN', E' IF operation=''save'' THEN\n  PERFORM app.mon8_require_capability(''sso'',''SSO_FORBIDDEN'');'),
  ('identity.sso_complete(uuid,jsonb,character,uuid,character,text,timestamp with time zone)',
   ' -- Match email-code serialization order', E' PERFORM app.mon8_require_capability(''sso'',''SSO_FORBIDDEN'');\n -- Match email-code serialization order'),
  ('identity.sso_required_command(character,jsonb)',
   ' IF (p->>''required'')::boolean THEN', E' IF (p->>''required'')::boolean THEN\n  PERFORM app.mon8_require_capability(''sso'',''SSO_FORBIDDEN'');'),
  ('app.cb_delivery_step(uuid,uuid,uuid,text,jsonb)',
   ' a:=app.cb_authority(p_session,p_job,true);', E' IF p_step=''claim'' THEN\n  PERFORM app.mon8_require_capability(''accounting_export'',''BILLING_FORBIDDEN'');\n END IF;\n a:=app.cb_authority(p_session,p_job,true);'),
  ('app.cb_begin(uuid,uuid,uuid,text,jsonb)',
   ' -- Establish the whole invoice', E' IF p_kind IN(''FinaliseExportBatch'',''ApproveBillingDelivery'') THEN\n  PERFORM app.mon8_require_capability(''accounting_export'',''BILLING_FORBIDDEN'');\n END IF;\n -- Establish the whole invoice')
 ) AS patches(signature,anchor,replacement) LOOP
  original:=pg_get_functiondef(patch.signature::regprocedure);
  IF patch.signature='app.mon8_contractor_agreement_context(uuid)' THEN
   -- Session and membership verification remain unchanged; only factor out the
   -- assignment/status selection, so execution and projection cannot drift.
   amended:=replace(original,
    E' SELECT * INTO assignment FROM app.commercial_track_assignment WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;\n SELECT * INTO fact FROM app.contractor_agreement_status_revision WHERE tenant_id=t AND assignment_id=assignment.id ORDER BY revision DESC LIMIT 1;\n RETURN jsonb_build_object',
    E' RETURN app.mon8_effective_agreement() || jsonb_build_object');
   amended:=replace(amended,
    E'''tenantId'',t,''membershipId'',caller.membership_id,''identityUserId'',caller.identity_user_id,\n  ''assignment'',CASE WHEN assignment.id IS NULL THEN NULL ELSE jsonb_build_object(''id'',assignment.id,''revision'',assignment.revision,''track'',assignment.commercial_track,''agreementReference'',assignment.agreement_reference) END,\n  ''status'',CASE WHEN fact.id IS NULL THEN NULL ELSE jsonb_build_object(''id'',fact.id,''revision'',fact.revision,''status'',fact.status) END);',
    '''tenantId'',t,''membershipId'',caller.membership_id,''identityUserId'',caller.identity_user_id);');
  ELSE
   -- required-command has two enabling branches: both must consult the same service.
   IF patch.signature<>'identity.sso_required_command(character,jsonb)' AND
    (length(original)-length(replace(original,patch.anchor,'')))/length(patch.anchor)<>1 THEN
    RAISE EXCEPTION 'MON8_PATCH_ANCHOR_COUNT: %',patch.signature;
   END IF;
   amended:=replace(original,patch.anchor,patch.replacement);
  END IF;
  IF amended=original THEN RAISE EXCEPTION 'MON8_PATCH_TARGET_MISSING: %',patch.signature; END IF;
  IF patch.signature='app.mon8_contractor_agreement_context(uuid)' AND amended LIKE '%INTO assignment%' THEN RAISE EXCEPTION 'MON8_AUTHORITY_FACTORING_FAILED'; END IF;
  EXECUTE amended;
 END LOOP;
END $migration$;
-- BEFORE INSERT also runs on ON CONFLICT replays. Receipt lookup cannot bypass
-- suspension. Cleanup commands intentionally remain usable without eligibility.
CREATE FUNCTION app.mon8_approval_receipt_gate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.command_type IN('SubmitExtra','PriceExtra','ReviseExtra','ApproveExtraStep','RejectExtra','IssueClientApproval','ClientDecideExtra') THEN
  IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
  PERFORM app.mon8_require_capability('approval_chains','PERMISSION_DENIED');
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.mon8_approval_receipt_gate() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_approval_receipt_gate() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER mon8_approval_receipt_gate BEFORE INSERT ON app.command_receipt
FOR EACH ROW EXECUTE FUNCTION app.mon8_approval_receipt_gate();
COMMIT;
