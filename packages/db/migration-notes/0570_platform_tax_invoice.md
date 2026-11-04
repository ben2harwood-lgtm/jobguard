# 0570 — M4-10 dark platform invoice storage (RED)

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
renumber issued documents. The renamed migration remains this unmerged branch's own migration;
no migration already on main is edited.

CI must run the real PostgreSQL invoice, upgrade, migration and tenancy suites.
Local syntax/type/unit checks do not prove PostgreSQL behavior. D02/G4 authority,
complete fee adapters and independent RED review remain outstanding.

Catch-up to main (3 November 2026): preserves the dark fixture scope. Keeps main's
LP-3–LP-5 and MON-8 routines unchanged. The existing `ef_audit` helper seals via
`lp4_seal_audit`; invoice metadata now uses its references/hashes payload contract.
The integration assertion checks audit.v2, checked-operation trust and the exact
document hash. The migration proof adds all three tables to main's generated
exact tenancy and ownership lists; their baseline arrays remain unchanged.

Local validation: installed Vitest 4.1.12, maxWorkers=2: core
`src/platform-tax-invoice.test.ts` (9 passed); db
`test/migration-proof-loader.test.ts` and `src/lp4-audit.test.ts` (87 passed).
Core and db `tsc -p tsconfig.json --noEmit` passed. Core/storage dependency builds
passed. Initial db unit imports needed those builds; the unchanged rerun passed.
The pnpm launcher stalled before checks started and was cancelled; checks used
installed package binaries, without downloads. Database, migration/upgrade and
browser suites were not run: this sandbox cannot start PostgreSQL or bind ports.
NOPR handoff; CI and independent RED review remain required.
