-- Preserve fee-terms approval evidence even when the table owner truncates.
BEGIN;
CREATE TRIGGER recovery_case_terms_no_truncate
BEFORE TRUNCATE ON app.recovery_case_terms_approval
FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
COMMIT;
