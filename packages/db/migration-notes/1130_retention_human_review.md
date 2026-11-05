# LATER-SAFETY-12 — retention human review

Forward replacement of `app.retention_records` from its latest body on origin/main 28871adf3 (0600_retention_records.sql). No schema, ownership, grants or static call/write inventory changes, so the catalogue proof has empty deltas.

Session reviews accept only trigger human; the separate infrastructure timer remains unchanged. SQL also rejects forged timer reviews before replay/append.

CI must run real PostgreSQL fresh/upgrade, migration proofs, tenant/ACL and existing integration suites. retention-records.integration.test.ts proves forged timer refusal at both repository and raw SQL boundaries without history or financial changes; retention-review-timer.integration.test.ts proves the legitimate timer still works.

Forward-fix only: replace this exact routine in a new reviewed migration if needed; do not restore the authority bypass. No database/browser execution is possible in this sandbox. RED exact-head independent review and green CI remain required.
