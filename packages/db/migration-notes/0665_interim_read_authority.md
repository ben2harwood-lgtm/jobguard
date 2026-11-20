# LATER-SAFETY-12 — interim read authority

Forward replacement of `app.interim_draft_records` from its latest body on origin/main 28871adf3 (0595_interim_draft_records.sql). No schema, ownership, grants or static call/write inventory changes, so the catalogue proof has empty deltas.

Reads use the same mon1_company_actor owner/admin rule as writes, with a required persisted session digest. Null, expired, revoked or wrong-role sessions fail closed. METER_FORBIDDEN becomes HTTP 403, without retry advice.

CI must run real PostgreSQL fresh/upgrade, migration proofs, tenant/ACL and existing integration suites. interim-draft-screen.integration.test.ts proves owner/admin reads, wrong-role/revoked-session refusal, raw null-digest refusal and unchanged financial records; interim-draft.integration.test.ts retains the earlier lifecycle checks.

Forward-fix only: replace this exact routine in a new reviewed migration if needed; do not restore the authority bypass. No database/browser execution is possible in this sandbox. RED exact-head independent review and green CI remain required.
