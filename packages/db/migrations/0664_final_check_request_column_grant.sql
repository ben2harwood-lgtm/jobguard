BEGIN;
REVOKE UPDATE ON infrastructure.final_check_request FROM jobguard_infrastructure;
GRANT UPDATE(enqueued_at) ON infrastructure.final_check_request TO jobguard_infrastructure;
COMMIT;
