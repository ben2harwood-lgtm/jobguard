BEGIN;
CREATE TRIGGER no_truncate BEFORE TRUNCATE ON app.extra_duplicate_disposition FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
COMMIT;
