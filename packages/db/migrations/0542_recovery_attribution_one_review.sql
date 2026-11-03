BEGIN;
-- Assessment commands and their replays remain unrestricted by this index.
-- Existing duplicate reviews abort installation; never discard immutable receipts.
CREATE UNIQUE INDEX recovery_attribution_one_review_per_assessment
 ON app.recovery_attribution_command (tenant_id, assessment_id)
 WHERE payload->>'action' = 'approve_review';
COMMIT;
