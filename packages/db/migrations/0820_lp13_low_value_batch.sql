-- LP-13 RED: five downstream impact checks on the inherited LP-12 chain.
-- Reserved 0820 retained; no schema, routine, privilege or policy delta.
-- LP-8a (0795) already revokes standalone invoice-number allocation and direct
-- sequence writes. Supported checked invoice routines allocate their own number.
-- LP-6d (0780) already binds progress actor/tenant before operational updates.
-- 0053 keeps legacy raisers unknown; 0520 seals SSO under the connection tenant;
-- 0095/0356 retire the old adoption overload; LP-5/6c check current replay identity.
-- Do not duplicate these routines or weaken their latest bodies/owners/ACLs.
-- Forward-only reserved marker: no data backfill or rollback action is needed.
BEGIN;
COMMIT;
