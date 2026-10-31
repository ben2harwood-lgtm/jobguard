-- LP-12 RED, built ahead: rebase after LP-11 before landing. No routine body changes.
-- Forward fix only: revoke the new grants and restore the former owners in a
-- separately reviewed migration if rollback is needed. Never rewrite history.
BEGIN;
DO $$ DECLARE owner_name text; BEGIN
 FOREACH owner_name IN ARRAY ARRAY['jobguard_binding_owner','jobguard_binding_lookup_owner',
   'jobguard_command_writer','jobguard_audit_writer','jobguard_money_owner'] LOOP
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=owner_name) THEN
   RAISE EXCEPTION 'LP12_OWNER_MISSING' USING ERRCODE='42704';
  END IF;
  IF EXISTS(SELECT FROM pg_roles WHERE rolname=owner_name AND
    (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
   OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.grantor
    WHERE m.member=owner_name::regrole OR (m.roleid=owner_name::regrole AND NOT (
     (m.member=session_user::regrole AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option AND g.rolsuper)
     OR (m.member='jobguard_migration'::regrole AND current_user='jobguard_migration'
      AND NOT m.admin_option AND m.inherit_option AND m.set_option AND m.grantor=session_user::regrole))))
   OR EXISTS(SELECT FROM pg_roles r WHERE r.rolname ~ '^jobguard_(runtime|identity|infrastructure|worker.*)$'
    AND (pg_has_role(r.oid,owner_name,'USAGE') OR pg_has_role(r.oid,owner_name,'SET'))) THEN
   RAISE EXCEPTION 'LP12_OWNER_UNSAFE' USING ERRCODE='42501';
  END IF;
 END LOOP;
END $$;

-- A command claim is authority data, not an owner-controlled registry. Keep
-- its existing forced-RLS policy and grant only what the lifecycle code uses.
ALTER TABLE app.command_lifecycle_claim OWNER TO jobguard_migration;
ALTER TABLE app.command_type_registry OWNER TO jobguard_migration;
GRANT SELECT ON app.command_type_registry TO jobguard_command_writer;
GRANT SELECT,INSERT ON app.command_lifecycle_claim TO jobguard_command_writer;
GRANT UPDATE(effect_ref,outcome) ON app.command_lifecycle_claim TO jobguard_command_writer;

-- Keep credential-row locking separate from the binding-store owner. PostgreSQL
-- requires UPDATE on at least one column for FOR SHARE; these columns are used
-- only for locking by the unchanged credential-scoped helper. No service role
-- can use/assume this owner or execute its private helper directly.
GRANT USAGE ON SCHEMA app,identity,control_plane TO jobguard_binding_lookup_owner;
GRANT SELECT ON identity.session,control_plane.practice_session,
 control_plane.contractor_practice_session,app.membership,app.contractor_membership_revocation TO jobguard_binding_lookup_owner;
GRANT UPDATE(id) ON identity.session TO jobguard_binding_lookup_owner;
GRANT UPDATE(token_digest) ON control_plane.practice_session TO jobguard_binding_lookup_owner;
GRANT UPDATE(session_id) ON control_plane.contractor_practice_session TO jobguard_binding_lookup_owner;
-- Authentication precedes a binding, so this private identity lookup cannot
-- depend on current_tenant(). Its unchanged helper enforces the credential,
-- requested tenant, exact membership and revocation before establishing context.
CREATE POLICY lp12_binding_lookup_read ON app.membership FOR SELECT TO jobguard_binding_lookup_owner USING(true);
CREATE POLICY lp12_binding_lookup_read ON app.contractor_membership_revocation FOR SELECT TO jobguard_binding_lookup_owner USING(true);
GRANT EXECUTE ON FUNCTION identity.sso_session_memberships(uuid,uuid),
 app.authenticate_practice_session(text,uuid),app.contractor_practice_session_digest(uuid),
 app.contractor_practice_home_deadline(character,timestamptz) TO jobguard_binding_lookup_owner;
GRANT CREATE ON SCHEMA app TO jobguard_binding_lookup_owner;
ALTER FUNCTION app.lp6_session_authority(text,text,uuid) OWNER TO jobguard_binding_lookup_owner;
REVOKE CREATE ON SCHEMA app FROM jobguard_binding_lookup_owner;

-- Binding accessors use only the private store and credential-scoped helper.
REVOKE SELECT ON identity.session,control_plane.practice_session,control_plane.contractor_practice_session FROM jobguard_binding_owner;
REVOKE EXECUTE ON FUNCTION identity.sso_session_memberships(uuid,uuid) FROM jobguard_binding_owner;

-- Bounded ledger slice: preserve the latest installed bodies, lock ordering,
-- authorization, duplicate and reversal checks. No schema/table ownership,
-- sequence privilege, arbitrary SQL or migration-role membership is granted.
GRANT USAGE ON SCHEMA app TO jobguard_money_owner;
GRANT SELECT ON app.membership,app.financial_authorization,app.ledger_account,
 app.journal,app.journal_line TO jobguard_money_owner;
GRANT INSERT ON app.journal,app.journal_line TO jobguard_money_owner;
GRANT UPDATE(id) ON app.membership,app.financial_authorization,app.journal TO jobguard_money_owner;
-- Reuse the installed canonical tenant policy, including LP-11's protected
-- bound-tenant expression after catch-up. Do not reintroduce a GUC policy.
DO $$ DECLARE table_name text; read_rule text; write_rule text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['membership','financial_authorization','ledger_account','journal','journal_line'] LOOP
  SELECT pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)
   INTO read_rule,write_rule FROM pg_policy p
   WHERE p.polrelid=format('app.%I',table_name)::regclass AND p.polname='tenant_isolation' AND p.polcmd='*';
  IF read_rule IS NULL OR write_rule IS NULL THEN
   RAISE EXCEPTION 'LP12_TENANT_POLICY_MISSING' USING ERRCODE='42501';
  END IF;
  EXECUTE format('CREATE POLICY lp12_money_tenant ON app.%I FOR ALL TO jobguard_money_owner USING(%s) WITH CHECK(%s)',table_name,read_rule,write_rule);
 END LOOP;
END $$;
GRANT CREATE ON SCHEMA app TO jobguard_money_owner;
ALTER FUNCTION app.assert_financial_authorization(uuid,uuid,varchar,bigint,character,character) OWNER TO jobguard_money_owner;
ALTER FUNCTION app.post_plan_obligation(uuid,uuid,uuid,uuid,bigint,character,varchar,varchar,varchar,character,uuid,uuid) OWNER TO jobguard_money_owner;
ALTER FUNCTION app.post_plan_settlement(uuid,uuid,uuid,uuid,uuid,bigint,character,varchar,varchar,character,uuid,uuid) OWNER TO jobguard_money_owner;
ALTER FUNCTION app.reverse_journal(uuid,uuid,uuid,varchar,varchar,character,uuid,uuid) OWNER TO jobguard_money_owner;
REVOKE CREATE ON SCHEMA app FROM jobguard_money_owner;
-- Every object reference in these existing bodies is schema-qualified.
ALTER FUNCTION app.assert_financial_authorization(uuid,uuid,varchar,bigint,character,character) SET search_path=pg_catalog,pg_temp;
ALTER FUNCTION app.post_plan_obligation(uuid,uuid,uuid,uuid,bigint,character,varchar,varchar,varchar,character,uuid,uuid) SET search_path=pg_catalog,pg_temp;
ALTER FUNCTION app.post_plan_settlement(uuid,uuid,uuid,uuid,uuid,bigint,character,varchar,varchar,character,uuid,uuid) SET search_path=pg_catalog,pg_temp;
ALTER FUNCTION app.reverse_journal(uuid,uuid,uuid,varchar,varchar,character,uuid,uuid) SET search_path=pg_catalog,pg_temp;
COMMIT;
