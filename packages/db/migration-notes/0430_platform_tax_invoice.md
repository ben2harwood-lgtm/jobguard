# 0430 — M4-10 dark platform invoice storage (RED)

Adds tenant-owned `platform_invoice_issuer`, `platform_invoice_document` and
`platform_invoice_source` in the platform statement namespace. No earlier
migration or existing table is changed. No backfill is needed. Profiles,
documents and source reservations reject update/delete/truncate; all three use
forced RLS, migration ownership and no runtime/infrastructure/PUBLIC grants.

`platform_invoice_source` has a primary/unique key on
`(tenant_id, source_kind, source_id)` independent of issuer. A mandatory AFTER
INSERT trigger on every invoice reserves each statement source in that table.
The FK ties reservations to issued documents; a duplicate source aborts the whole
transaction, including across concurrent issuers. Credits never release a source.
There is no security-definer issuance or provider capability.

The administrative writer authenticates a persisted synthetic session and binds
its active owner to the expected actor. It locks the issuer, reconstructs stored
subscription source hashes, reads principal and approval links from storage,
checks credits, inserts the document/reservations and appends audit last. Caller
principal and provenance are rejected. Caller tax is permitted only as an
explicit D02-pending simulation example. Unsupported fee source adapters fail
closed; supplied proof manifests cannot replace stored facts.

Fresh installs use migration discovery. Existing databases get additive empty
tables, without rewriting statements or financial history. Forward fix only:
preserve profiles, documents, reservations and audit; stop fixture issuance and
use an additive reviewed migration when correction is needed. Never drop or
renumber issued documents. 0430 remains this unmerged branch's own migration;
no migration already on main is edited.

CI must run the real PostgreSQL invoice, upgrade, migration and tenancy suites.
Local syntax/type/unit checks do not prove PostgreSQL behavior. D02/G4 authority,
complete fee adapters and independent RED review remain outstanding.
