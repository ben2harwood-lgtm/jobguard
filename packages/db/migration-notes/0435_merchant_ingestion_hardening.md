M5-4 dark merchant ingestion: extends the existing synthetic intake channel check with
`fixture_portal` and adds an optional tenant/job-qualified canonical-document link. Intake records retain the observed source schema
version for new merchant arrivals; historical source versions remain NULL.
No backfill: existing records keep NULL links and all prior bytes/columns are preserved.
No new tables, privileges, policies, triggers, financial writes or external destinations.
Existing forced RLS and append-only runtime grants continue to apply.

Forward fix: pause fixture ingestion and ship an additive correction. Preserve all
arrivals and quarantined originals; do not delete documents or rewrite historical
migrations. The old picker/mail paths remain compatible with existing records.

CI: merchant-ingestion.integration.test.ts starts from main's schema, preserves a
pre-existing document, applies this migration, verifies unchanged historical rows,
then attacks cross-channel duplicates/replays, changed content, account/version drift,
malformed amounts, credits, tenant/job links and runtime privileges. PostgreSQL execution
is delegated to CI because this build sandbox cannot start PostgreSQL or bind ports.
