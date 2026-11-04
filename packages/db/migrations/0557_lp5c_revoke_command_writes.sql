-- LP-5c: land only after LP-5a/5b callers and their checked writers.
-- Forward fix: repair the checked route; never restore broad runtime authority.
BEGIN;
REVOKE INSERT ON app.command_receipt, app.decision_resolution, app.action_authorization FROM jobguard_runtime, PUBLIC;
REVOKE UPDATE ON app.command_receipt FROM jobguard_runtime, PUBLIC;
-- Table revocation does not withdraw PostgreSQL column ACLs.
REVOKE UPDATE (status, result, completed_at) ON app.command_receipt FROM jobguard_runtime, PUBLIC;
COMMIT;
