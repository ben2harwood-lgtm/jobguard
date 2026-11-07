BEGIN;
ALTER TABLE app.job DROP CONSTRAINT job_baseline_shape;
ALTER TABLE app.job ADD CONSTRAINT job_baseline_shape CHECK (
 (baseline_quote_version_id IS NULL AND accepted_net_value_pence IS NULL AND fee_policy_version IS NULL AND recovery_cap_pence IS NULL)
 OR (provenance='system_generated_quote' AND baseline_quote_version_id IS NOT NULL AND accepted_net_value_pence IS NOT NULL AND fee_policy_version IS NOT NULL AND
 ((fee_policy_version='reference_fee_policy_v3' AND recovery_cap_pence IS NULL) OR (fee_policy_version<>'reference_fee_policy_v3' AND recovery_cap_pence IS NOT NULL)))
 OR (provenance='imported' AND baseline_quote_version_id IS NULL AND accepted_net_value_pence IS NOT NULL AND fee_policy_version IS NOT NULL AND
 (recovery_cap_pence IS NOT NULL OR (fee_policy_version='reference_fee_policy_v3' AND recovery_cap_pence IS NULL AND status IN('draft','live','invoiced','paid'))))
);
COMMIT;
