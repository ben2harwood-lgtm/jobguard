BEGIN;
-- LP-11 staged cutover, after LP-10 and credential-bootstrap compatibility.
-- HELD: do not apply before those predecessors and the exact security proof
-- allowances land. Credential bootstrap must not depend on a not-yet-bound
-- tenant. No compatibility fallback to a caller-set GUC is permitted.
-- Forward fix only: repair a policy while keeping the bound-tenant predicate;
-- never restore caller-selected tenant authority on rollback.
-- Existing policy principals only. No PUBLIC grant or binding-store access.
GRANT EXECUTE ON FUNCTION app.current_tenant() TO jobguard_audit_writer,
 jobguard_identity,jobguard_meter,jobguard_meter_owner,jobguard_shadow;
DO $cutover$
DECLARE
 policy_row record;
 policy_role record;
 expression_using text;
 expression_check text;
 tenant_setting_pattern constant text := $pattern$(?:pg_catalog\.)?current_setting\('app\.tenant_id'(?:::text)?(?:,\s*true)?\)$pattern$;
BEGIN
 -- Inspect every alternative, including policies for privileged routine owners.
 -- ALTER retains command, roles, permissive/restrictive mode and all additional
 -- predicates (including bootstrap predicates unrelated to the tenant setting).
 FOR policy_row IN
  SELECT p.oid, p.polname, n.nspname, c.relname, p.polroles,
   pg_get_expr(p.polqual,p.polrelid) AS predicate_using,
   pg_get_expr(p.polwithcheck,p.polrelid) AS predicate_check
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
   AND n.nspname !~ '^pg_toast' AND n.nspname !~ '^pg_temp_'
  ORDER BY n.nspname,c.relname,p.polname
 LOOP
  expression_using := regexp_replace(policy_row.predicate_using,
   tenant_setting_pattern, '(app.current_tenant())::text', 'g');
  expression_check := regexp_replace(policy_row.predicate_check,
   tenant_setting_pattern, '(app.current_tenant())::text', 'g');
  IF expression_using IS DISTINCT FROM policy_row.predicate_using
   OR expression_check IS DISTINCT FROM policy_row.predicate_check THEN
   -- These roles already participate in tenant policies. Unknown principals
   -- require a reviewed grant/proof, never automatic privilege expansion.
   -- PUBLIC is deliberately refused instead of broadening function access.
   IF 0 = ANY(policy_row.polroles) THEN
    RAISE EXCEPTION 'LP11_PUBLIC_TENANT_POLICY' USING ERRCODE='42501';
   END IF;
   EXECUTE format('ALTER POLICY %I ON %I.%I%s%s',policy_row.polname,
    policy_row.nspname,policy_row.relname,
    CASE WHEN expression_using IS NULL THEN '' ELSE format(' USING (%s)',expression_using) END,
    CASE WHEN expression_check IS NULL THEN '' ELSE format(' WITH CHECK (%s)',expression_check) END);
   FOR policy_role IN SELECT r.rolname FROM pg_roles r WHERE r.oid=ANY(policy_row.polroles)
   LOOP
    IF NOT has_function_privilege(policy_role.rolname,'app.current_tenant()','EXECUTE') THEN
     RAISE EXCEPTION 'LP11_UNREVIEWED_POLICY_ROLE: %',policy_role.rolname USING ERRCODE='42501';
    END IF;
   END LOOP;
  END IF;
 END LOOP;
 IF EXISTS (
  SELECT FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
   AND n.nspname !~ '^pg_toast' AND n.nspname !~ '^pg_temp_' AND
   (coalesce(pg_get_expr(p.polqual,p.polrelid),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))
    LIKE '%app.tenant_id%'
 ) THEN
  RAISE EXCEPTION 'LP11_UNCONVERTED_TENANT_POLICY' USING ERRCODE='42501';
 END IF;
END $cutover$;

-- The ledger view was an owner-rights view. Preserve its security barrier and
-- use caller privileges/RLS, just like the existing parties/recovery views.
ALTER VIEW app.ledger_balance SET (security_invoker=true);
COMMIT;
