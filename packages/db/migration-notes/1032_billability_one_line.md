# LATER-SAFETY-3: one standing billability approval

RED: billability and duplicate fee authority.

0565 permits multiple approve commands for the same case/work/line, including approval of different reviews. The immutable command history has no supersession operation or state. A partial unique expression index permits one approve row for (tenant, job, case, payload workId, payload lineId). It leaves reviews unrestricted. The existing routine validates those identities, authenticates distinct people, serializes the case and returns existing command results before inserting; same-command replay therefore remains valid. No fee writer or new policy is introduced.

Superseded approval replacement is not an existing supported behavior. A future supersession workflow needs its own contract and index amendment; this change creates no such authority and adds no columns to fingerprinted rows.

Forward-only deployment. Existing duplicate approvals stop migration atomically; do not silently prune immutable approvals. Their resolution requires a separate authorized forward fix. Roll forward to fix a defect, never edit this migration after landing.

Validation: source-only guard failed before migration creation. Added a real PostgreSQL race between two reviews/approval commands, duplicate new-command refusal, count and winning replay assertions to recovery-billability.integration.test.ts. Existing tests cover same-person approval, forged payload, wrong job/tenant, stale evidence, reversals and audit rollback. CI must prove database uniqueness, upgrades, tenancy and those adversarial paths; no local database run is claimed. Production fees and commercial gates stay disabled.
