# 0430 — M4-10 dark platform invoice fixtures (RED)

Adds tenant-owned `platform_invoice_issuer` and `platform_invoice_document` in the
platform statement namespace. No existing table, migration or stored format is
changed. No backfill is needed. Number, command and issuer/document references
are constrained; issuer profiles and issued artifacts reject update/delete/truncate.
Both tables use forced RLS and migration ownership. Runtime, infrastructure and
PUBLIC have no grants. No security-definer issuance function is introduced.

The administrative fixture adapter locks the issuer before reading history,
validating sources/credits and inserting. The existing append-only audit helper
runs last, in that transaction. This is a deliberately unavailable production
path, not a privileged runtime connection. D02/G4 approvals remain outstanding.
Source IDs/hashes in this slice are fictional manifests, not verified foreign
keys to production proof. Production source adapters/authorization remain gated.

Fresh installation uses normal migration discovery. Existing databases receive
only additive empty tables, with no rewrite of statements or financial history.
Forward fix only: retain profiles, invoices, credit notes and audit history;
stop fixture issuance and use an additive reviewed migration if correction is
needed. Never drop documents or renumber issued artifacts.

CI must execute the new real-PostgreSQL integration suite and the existing
migration/tenancy suites. No database run is claimed from the restricted sandbox.
