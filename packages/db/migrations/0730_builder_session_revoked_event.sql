-- LATER-SAFETY-66 (RED): builder sign-out records one identity.security_event 'session.revoked'.
-- Restates 0111_persisted_identity.sql:53, the only definition of this CHECK on main, and adds one kind.
BEGIN;
ALTER TABLE identity.security_event DROP CONSTRAINT security_event_event_type_check;
ALTER TABLE identity.security_event ADD CONSTRAINT security_event_event_type_check
 CHECK(event_type IN ('challenge.requested','session.issued','identity.verified','invitation.created','session.revoked'));
COMMIT;

