BEGIN;
-- The final-account tables are mutated by the SECURITY DEFINER function
-- app.advance_final_account_draft, which runs as jobguard_migration. That role
-- lacks BYPASSRLS, so under FORCE ROW LEVEL SECURITY its UPDATE matched zero
-- rows (the tenant_isolation policy applied only to jobguard_runtime) and
-- current_revision_id was never set. Extend the policy to jobguard_migration as
-- well, exactly as app.job already does. Tenant isolation is unchanged: the
-- USING and WITH CHECK clauses still bind every role to its own tenant.
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['final_account_draft','final_account_revision','final_account_line','final_account_proof'] LOOP
  EXECUTE format('ALTER POLICY tenant_isolation ON app.%I TO jobguard_runtime,jobguard_migration',t);
END LOOP;END $$;
COMMIT;
