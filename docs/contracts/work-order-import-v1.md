# ENT-2 work-order import v1 — core contract, construction held

This working-tree contract covers the pure core prepared for ENT-2. No import application, database migration, HTTP route or screen is enabled by this change. ENT-2 remains incomplete pending resolution of the issued import-role conflict with CH-3b's party-binding authorization. Synthetic data only; no production or pilot capability.

`work-order-import.v1` is one order per CSV record. Header names and order are exact:

```csv
version,clientId,contractId,workOrderReference,issuedOn,dueOn,priority,status,expectedRevision,siteRevisionId,resident,teamId,assignedMembershipIds,lines
```

CSV cells follow quoted-field escaping (double a quote inside a quoted field); LF and CRLF delimit records. A quoted cell can contain a newline. Receipt row numbers count CSV records, including the header, rather than physical lines. The parser bounds input to 16,000,000 JavaScript characters and 10,000 order records. UTF-8 byte/upload limits belong to the later application boundary. Unknown or reordered headers refuse the file. Incorrect cell counts, malformed JSON or non-integer revision cells yield an `INVALID_ROW` for that record. Malformed CSV quoting refuses the file because reliable record boundaries are unavailable.

`resident`, `assignedMembershipIds` and `lines` are JSON cells; other cells are strings, except `expectedRevision`, which becomes a validated nonnegative integer. Blank client, contract, site, resident, due date and team cells mean null. A blank lines/assignments cell is invalid; use `[]`. Missing client, contract, site or resident remains representable so the transaction can call CH-3b and obtain `CONTRACTOR_PARTIES_REQUIRED`. Present malformed parties fail the versioned schema. The core schema alone does not prove that the routine was called.

An input line contains only `clientLineReference` (nonempty string or null), `sorCode` and `quantity` (canonical nonnegative decimal string, up to twelve integer digits and six fractional places). Prices, tenant, provenance, track and origin are server authority and are rejected as input fields. Priority is `routine | urgent | emergency`; order status is `ordered | cancelled`. A cancellation can contain zero lines. Ordered records require at least one line. Duplicate client line references, duplicate assignments and assignments without a team are refused.

All output prices use `{ pence: number; currency: 'GBP' }`, within 1,000,000,000,000 pence. `sor-line-pricing.v1` takes persisted unit rate and signed tendered adjustment, both validated, plus the decimal quantity. It uses the existing bigint rational kernel to compute quantity × rate × (1 + adjustment), rounding half-even once at the line. Invalid negative multipliers fail even at zero quantity. VAT policy is separate. Overflow produces `MONEY_OUT_OF_RANGE`.

`sor-version-import.v1` strictly validates an immutable version candidate (synthetic environment, command ID, schedule ID, reference, effective date, unique item codes). Each item has description, unit, GBP rate and optional integer standard minutes. Persistence and role authorization remain to be built. `selectSorVersion` selects the most recent effective date no later than the issue date from the contract-authorized IDs supplied by the caller. No candidate means `SOR_VERSION_NOT_FOUND`; equal effective dates mean `AMBIGUOUS_SOR_VERSION`. The caller must scope candidates to the same tenant, contract and schedule and pin the selected immutable version in its revision.

Line identities match a client line reference first, otherwise code plus zero-based position. Incoming scope IDs are replaced by an existing matched identity or a server-minted identity. Identity may persist when quantity or price changes: commercial revisions are distinct from scope identity. A removed line is recorded as removed, never repurposed. New output lines carry only `client_instruction`. Revision diffs record changed field names and added/removed/changed scope IDs; they contain no resident values or free text.

The audit allowlist contains command/order/revision IDs, synthetic environment, a document hash and the operational classification only. Strict schemas reject added contact fields. This is core validation evidence; actual audit atomicity and log redaction require integration tests in the completed leaf.

The issued role checks are separate pure predicates: surveyor or commercial_manager for work-order imports; commercial_manager for SoR import. They filter grants then apply ENT-1's existing scoped permissions. They do not grant roles or authorize database effects. Every service still needs membership, current track, revocation, scope, idempotency, expected revision and controlled-routine checks within the transaction. The merged CH-3b routine currently requires different permissions, so implementing that transaction is held pending an integrator amendment.

The §9.4 later formal instruction of a logged extra belongs to ENT-3 and ENT-4b under the issued Q7 ruling. This leaf creates no variation or `extra_origin` row.
