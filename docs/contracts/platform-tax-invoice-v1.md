# M4-10 dark platform invoice slice (RED)

This is an administrative synthetic issuer. Production issuance is refused;
there are no HTTP routes, workers, provider adapters or collection work. Documents
say simulation only and D02 tax examples pending approval.

`platformInvoiceIssueCommandV1` is the writer boundary. It takes source kind, ID,
expected source hash, line identity and a **caller-supplied tax example only while
D02 is pending**. It rejects principal, source principal and provenance fields.
The tenant comes from the verified context and persisted session, not request JSON.
The required actor must equal the session's active owner, including on replay and
after waiting for the issuer lock. A different valid owner is not interchangeable.

The repository loads subscription statements from `app.platform_statement` (0195),
joins their immutable periods, agreement revisions, authorizations and approved
Decision resolutions, and checks the expected hash. It reconstructs the canonical
0195 statement hash from persisted period lines and place bindings. Statement,
period and line principal totals must agree. Amounts, period, policy, statement
reference/hash and approval reference/hash in the document come from these rows.
Missing, foreign, mismatched or corrupted sources fail closed. No random source
ID or supplied proof manifest can authorize invoice issuance.

The base has no accepted persisted v3 small-builder fee statement adapter; its
writer remains dependency-bound. This slice also has no complete contractor
statement/proof reconstruction adapter. Both fee source kinds return
`PLATFORM_INVOICE_SOURCE_UNAVAILABLE`; they cannot use a subscription source or
fall back to supplied amounts, proof, approval or payment references. Their pure
representation schemas remain for formatting/tests, not executable issuance.

Issuer profiles are immutable fictional identities. An issuer row lock serializes
its numbering, document history and credits. Invoices and credit notes share one
number series. A globally unique fictional issuer belongs to one fixture tenant;
real shared issuer identity/number-series activation remains gated.

Migration 0430 has an immutable `platform_invoice_source` table keyed by
`(tenant_id, source_kind, source_id)` across **all** issuers. Every invoice insert
reserves its statement sources through a mandatory database trigger. Conflicting
inserts roll back the document and audit together. Credits never release source
reservations, so even a fully credited source cannot be issued again elsewhere.
All three invoice tables have forced RLS, migration ownership and no runtime,
infrastructure or PUBLIC grants. The source reservation is not optional application
bookkeeping. Audit appends last in the issuance transaction.

The writer derives credit principal from the original stored invoice less prior
linked credits, after revalidating the stored source. It offers a full remaining
principal correction, not a caller-selected partial amount. Tax remains a labelled
D02 example and must preserve the original exact tax ratio. Principal/tax limits,
original identities and provenance are checked by the representation kernel.
`platformInvoiceRequestV1` is a hydrated internal document format, never the writer
request. Rendering/downloads do not issue or collect; the account fixture only
projects fictional net receipts and explicit refund due. Canonical JSON downloads
retain a stable SHA-256.

Remaining gates: stored fee adapters/proof and exact invoice Decision authority,
real issuer identity, approved D02 examples and rounding, production receipt/
allocation/reversal readers, G4-S/G4-C, M4-12 collection/refund execution, complete
CI and independent RED review. The pure kernel alone proves no source authority.

Validation includes principal/provenance input rejection, stored subscription
amount/hash/approval reconstruction, absent/foreign/corrupted source refusal,
unsupported fee refusal, persisted actor binding, revocation, cross-issuer races
and uniqueness even after credit. Real PostgreSQL checks run in CI; the sandbox
cannot start PostgreSQL or bind localhost.
