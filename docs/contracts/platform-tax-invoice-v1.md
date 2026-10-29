# M4-10 dark platform invoice slice (RED)

This implements an administrative **synthetic fixture** issuer, not a production
commercial command. Production issuance is unconditionally refused. There are no
HTTP routes, workers, provider adapters, collection work or new dependencies.
Every artifact says simulation only and D02 tax examples pending approval.

`platformInvoiceProfileV1` is an immutable fictional issuer profile.
`platformInvoiceRequestV1` describes separate subscription, small-builder success
fee and contractor fee documents. Strict schemas allow identifiers and hashes for
provenance, not bank details, hidden signals or arbitrary free text. Invoice lines
are positive; corrections are positive magnitudes on linked credit notes, never
negative subscription/fee offsets. No base-plan credit exists.

`PlatformTaxInvoiceFixtureRepository.issue` is only for an administrative synthetic
fixture connection. Business runtime and infrastructure roles have no grants on
its tables. It requires a genuine tenant context and a same-tenant owner fixture
membership. It serializes on the immutable issuer row, loads durable history and
uses the pure kernel before appending the document and one audit event in the
same transaction. Replays return the original; changed commands and previously
invoiced sources fail. Shared numbering includes credit notes and is transactional.
A globally unique fictional issuer ID belongs to one fixture tenant and defines its
number scope; a printed number is used with that issuer. Real shared JobGuard issuer
identity/number-series activation remains part of the gated production work.
The platform namespace is `platform_statement.invoice.synthetic.v1`; these documents
never become builder/contractor customer invoices. Existing subscription statements
and their restrictive storage contract are preserved.

The source manifest is explicitly **fictional input**, not a production proof
reader. Small-builder lines retain proof, approval, derivation, policy, prior
settlements and final-account lock references. Contractor lines retain site origin,
approval, customer invoice, payment, period, policy and derivation references. All
references must have the document tenant. Disclosed/captured/unverified small-builder
sources and office contractor origins are refused. The simulation kernel does not
certify these supplied facts against authoritative business rows.

Credits preserve the original line identity and exact provenance, cap cumulative
principal and tax independently, and retain the example's tax ratio. This does not
approve a VAT policy or choose VAT rounding. Amounts use bounded integer pence and
bigint totals. `platformInvoiceAccountFixture` projects fictional net receipts,
principal/tax/gross, remaining cash and explicit refund due; it neither writes
settlement facts nor executes refunds. Downloads contain canonical JSON with a
stable SHA-256. Rendering has no persistence/provider port.

Remaining release work is deliberately gated: authoritative source adapters and
exact approved Decision binding; approved issuer identity and D02 examples/rounding;
production receipt/allocation and reversal readers; G4-S/G4-C authority; M4-12
collection/refund execution. No simulation artifact can open those paths.

Validation: focused core tests cover repeats, changed-key duplicates, linked
reversals, cross-tenant provenance/locks/history, source/credit/amount limits,
subscription separation, contractor trace completeness and shadow-field rejection.
Real PostgreSQL tests cover serial numbering, concurrent credits, immutable storage,
runtime denial, tenant boundaries, audit and no collection work. PostgreSQL and
browser checks must run in CI because this sandbox cannot start either service.
