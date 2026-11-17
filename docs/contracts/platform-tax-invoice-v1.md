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

Success-fee sources are read from immutable `app.platform_fee_statement` rows. The
adapter verifies the stored document with the existing statement schema and hash
verifier, recomputes its source snapshot hash, and binds a current approved Decision
and exact unrevoked authorization to the statement, hash, GBP document principal
and `reference_fee_policy_v3`. Missing, foreign, unapproved, expired, superseded,
wrong-job or corrupted sources return `PLATFORM_INVOICE_SOURCE_UNAVAILABLE`.
The stored `documentPrincipal` is the statement writer's delta, distinct from
`cumulativeFeePrincipal`; the issuer uses it exactly, without rounding or deriving
a delta. Nonpositive correction statements cannot become positive invoice lines.
They do not authorize a new credit amount: invoice credits still use the existing
full remaining principal rule against an invoice and its revalidated source.

This is **statement-level provenance**: one invoice line per stored statement,
with its statement, approval, policy and whole strict `sourceSnapshot` (including
all assessment/allocation IDs, hashes, derivations and adjustments). No per-proof
split exists. Adding one needs its own approved contract. Existing pure per-proof
representations remain compatible but cannot authorize stored-source issuance.
Subscription and fee sources remain separate invoices; neither offsets the other.

The trace reads only statement-linked M4-12-S attempts and all their ordered
events, preserving collection/refund, pending, unknown, failed and settled states.
An absence is labelled `none_recorded` (none recorded), never paid. The statement's
`settlementHistory.integration_unavailable` marker is never a settlement. No bank
details are included. This trace is frozen at issuance; replay and credits retain
that original trace while revalidating the statement and approval. It is historical
provenance, not a current balance or authority to collect.

This remains an administrative synthetic adapter under existing privileges and
RLS, requiring the existing persisted owner identity session. The separate practice
statement writer's practice sessions are not accepted by that identity boundary;
CI fixtures explicitly seed administrative synthetic stored rows, not a purported
practice-writer-to-issuer journey. No session bridge, HTTP path or grant is added.
Contractor sources remain `PLATFORM_INVOICE_SOURCE_UNAVAILABLE`.

Issuer profiles are immutable fictional identities. An issuer row lock serializes
its numbering, document history and credits. Invoices and credit notes share one
number series. A globally unique fictional issuer belongs to one fixture tenant;
real shared issuer identity/number-series activation remains gated.

Migration `0570_platform_tax_invoice.sql` has an immutable `platform_invoice_source` table keyed by
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

LP-5 lifecycle dispatch remains held for this administrative fixture writer: it
uses its existing issuer lock, request hash, immutable replay history and audit
path, without a lifecycle claim or exact invoice Decision authorization. Source
statement approval is not approval to issue an invoice. Production issuance
remains disabled until those command-authority gates are satisfied.

Remaining gates: contractor fee adapter/proof, practice/identity integration and exact invoice Decision authority,
real issuer identity, approved D02 examples and rounding, production receipt/
allocation/reversal readers, G4-S/G4-C, M4-12 collection/refund execution, complete
CI and independent RED review. The pure kernel alone proves no source authority.

Validation includes principal/provenance input rejection, stored subscription
amount/hash/approval reconstruction, absent/foreign/corrupted source refusal,
unsupported contractor/invalid fee refusal, persisted actor binding, revocation, cross-issuer races
and uniqueness even after credit. Real PostgreSQL checks run in CI; the sandbox
cannot start PostgreSQL or bind localhost.

M4-10 now has a read-only owner route, `GET /api/plans/platform-documents`, and a dark synthetic page at `/plans/platform-documents`. A current company owner session reads only its stored simulation documents and linked credits; account figures use the existing fixture projection with zero linked payments. Issuing still has no route. Approved D02 examples, live issuing and payment linking remain closed.
