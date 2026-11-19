-- LP-12. Forward fix only: correct ownership and grants in a reviewed later
-- migration. The command and ledger history remains in place.
BEGIN;
DO $$ DECLARE owner_name text; BEGIN
 FOREACH owner_name IN ARRAY ARRAY['jobguard_binding_owner','jobguard_session_lookup',
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
-- LP-5b also owns this immutable command-effect proof table. Keep data custody
-- separate from the writer, including additions since the original inventory.
ALTER TABLE app.repository_operational_record OWNER TO jobguard_migration;
GRANT SELECT,INSERT ON app.repository_operational_record TO jobguard_command_writer;
GRANT SELECT ON app.command_type_registry TO jobguard_command_writer;
GRANT SELECT,INSERT ON app.command_lifecycle_claim TO jobguard_command_writer;
GRANT UPDATE(effect_ref,outcome,authorization_id) ON app.command_lifecycle_claim TO jobguard_command_writer;

-- LP-11 already moved credential lookup to jobguard_session_lookup and
-- restricts its table reads to the credential's protected transaction scope.
-- Remove the legacy table-wide grants. The installed private job-proof reader
-- still resolves the bound, live practice session and rechecks its authority.
REVOKE SELECT ON identity.session,control_plane.practice_session,control_plane.contractor_practice_session FROM jobguard_binding_owner;
GRANT SELECT(token_digest,environment,revoked_at,expires_at) ON control_plane.practice_session TO jobguard_binding_owner;
REVOKE EXECUTE ON FUNCTION identity.sso_session_memberships(uuid,uuid) FROM jobguard_binding_owner;

-- Bounded ledger slice: preserve the latest installed bodies, lock ordering,
-- authorization, duplicate and reversal checks. No schema/table ownership,
-- sequence privilege, arbitrary SQL or migration-role membership is granted.
GRANT USAGE ON SCHEMA app TO jobguard_money_owner;
-- LP-6c added these protected accessor calls to the unchanged ledger bodies.
GRANT EXECUTE ON FUNCTION app.current_actor(),app.current_tenant(),app.lp11_policy_tenant() TO jobguard_money_owner;
GRANT SELECT ON app.membership,app.financial_authorization,app.ledger_account,
 app.journal,app.journal_line TO jobguard_money_owner;
GRANT INSERT ON app.journal,app.journal_line TO jobguard_money_owner;
GRANT UPDATE(id) ON app.membership,app.financial_authorization,app.journal TO jobguard_money_owner;
-- Use LP-11's per-statement protected tenant. The migration owner's
-- additional membership policy branches do not belong to the money owner.
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['membership','financial_authorization','ledger_account','journal','journal_line'] LOOP
  EXECUTE format('CREATE POLICY lp12_money_tenant ON app.%I FOR ALL TO jobguard_money_owner
   USING (tenant_id = (SELECT app.lp11_policy_tenant()))
   WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()))',table_name);
 END LOOP;
END $$;
GRANT CREATE ON SCHEMA app TO jobguard_money_owner;
ALTER FUNCTION app.assert_financial_authorization(uuid,uuid,varchar,bigint,character,character) OWNER TO jobguard_money_owner;
ALTER FUNCTION app.post_plan_obligation(uuid,uuid,uuid,uuid,bigint,character,varchar,varchar,varchar,character,uuid,uuid) OWNER TO jobguard_money_owner;
ALTER FUNCTION app.post_plan_settlement(uuid,uuid,uuid,uuid,uuid,bigint,character,varchar,varchar,character,uuid,uuid) OWNER TO jobguard_money_owner;
ALTER FUNCTION app.reverse_journal(uuid,uuid,uuid,varchar,varchar,character,uuid,uuid) OWNER TO jobguard_money_owner;
REVOKE CREATE ON SCHEMA app FROM jobguard_money_owner;
-- Keep installed bodies and per-routine search paths unchanged. The app schema
-- remains migration-owned and none of the narrow owners retains CREATE.
COMMIT;
