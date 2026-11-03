M5-4 dark merchant ingestion: extends the existing synthetic intake channel check with
`fixture_portal` and adds an optional tenant/job-qualified canonical-document link on `supplier_document_intake`.
The link is valid only for a held arrival and must differ from its document ID.
`app.supplier_document` retains its exact column shape: evidence packs and recovery
messages fingerprint its whole row. FK validation by the non-superuser migration
owner still needs temporary NO FORCE on both intake and referenced document.
Both are restored to FORCE in the same transaction under ALTER locks. A real
restricted-owner bootstrap without these toggles failed during the FK validation
join with SQLSTATE 42704 (missing app.tenant_id); this is why they remain.
Intake records retain the observed source schema version for new merchant arrivals; historical source versions remain NULL.
No backfill: existing records keep NULL links and all prior bytes/columns are preserved.
No new tables, privileges, policies, triggers, financial writes or external destinations.
Existing forced RLS and append-only runtime grants continue to apply.

Forward fix: pause fixture ingestion and ship an additive correction. Preserve all
arrivals and quarantined originals; do not delete documents or rewrite historical
migrations. The old picker/mail paths remain compatible with existing records.

CI: merchant-ingestion.integration.test.ts starts from main's schema, preserves a
pre-existing document, applies this migration, verifies unchanged historical rows,
then attacks cross-channel duplicates/replays, changed content, account/version drift,
malformed amounts, credits, tenant/job links and runtime privileges.
The upgrade proof also compares whole supplier-document JSON and an approved merchant evidence pack before/after 0559, requiring its attachment approval to
remain valid. The JSON proof fragment stays empty: no catalogue ownership, ACL,
policy, routine or historical-row exception is introduced.

Repair validation uses real embedded PostgreSQL 16 and synthetic fixtures.

Repair execution (synthetic data only): real PostgreSQL 16 passed merchant-ingestion,
fingerprinted-row-shape, final-account-lock-upgrade and
recovery-pursuit-terms-upgrade. All three existing fingerprint guard suites were
left unchanged. The restricted non-superuser fresh bootstrap also passed after
retaining the FK validation toggles. The lifecycle-upgrade row snapshot now passes
with laterEmptyTables, but its unchanged subsequent routine-catalogue assertion
fails because later migrations add five routines (585 versus 580); no catalogue
assertion was relaxed.

Browser collection passed: 564 tests across 104 files, with no CommonJS package
loader error. The export-preview spec ran in real system Chromium with the
original assertions at 360 and 1280 widths (a temporary executable-path config
only): both timed out at the first Load current preview button because the page
rendered Sign in to your company. The pinned Playwright Chromium was absent and
its download was denied with HTTP 403. No browser pass is claimed. DB/API/web
TypeScript checks, merchant driver tests, migration-proof-loader, and the core,
money, commercial, AI-provider and PL/pgSQL boundary lints passed. Full repository
unit/integration suites and production builds were not run for this repair.
