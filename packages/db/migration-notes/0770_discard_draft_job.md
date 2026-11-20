# 0770 Discard draft job

An owner can discard a practice job that is still a system-generated draft. The checked routine binds the current tenant and actor, verifies the processing command and the exact approved action, and locks the job before checking its state, track and revision. It advances the job to `lost` and increments the revision. The existing command lifecycle stores and audits the result in the same transaction.

The job, source and scope remain available through the owned job link. Jobs and Today omit it based on the succeeded discard receipt. Existing lost jobs remain visible.

Deploy the migration before enabling the discard route. Earlier app versions can still read the schema. If a correction is needed after rollout, fix forward and preserve the job history and command receipts.
