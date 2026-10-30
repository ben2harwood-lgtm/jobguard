# M2-4 synthetic line-level matching

`matchSupplierLines` in `@jobguard/core` is a pure proposal function accepting the
strict `supplier-line-match-input.v1` envelope. Only `synthetic_demo` is accepted.
There is no HTTP route, provider call, migration, persistence, debt, payment or
fee write. This built-ahead piece extends the M2-3 synthetic extraction work;
it does not activate the retained single-line matching workspace.

A trusted caller must supply human-confirmed current line versions from one
tenant, job and merchant. The scope IDs partition deterministic identities; the
function cannot authenticate membership or verify original bytes. Each line
retains a stable line ID, immutable version ID, original document version/hash
and page. One current version per line is permitted. Metadata for an immutable
document must agree across its lines. Extraction proposals require confirmation
before entering this contract; descriptions, confidence scores and SKU-like text
are never converted to confirmed identity here.

Matching uses exact case/whitespace-normalized order references and SKUs, or
explicit merchant-scoped one-hop SKU aliases. Punctuation is significant. Several
aliases may name one SKU; one alias naming different SKUs is unresolved. Multiple
candidate order lines remain unresolved even when their prices are identical.
An explicit human-approved mapping binds a source version to an order version
and retains its approval reference. Conflicting mappings remain unresolved.
Substitutions require such a mapping or an explicit alias. Nothing infers them.

Quantities are nonnegative decimal strings with at most fourteen whole and six
fractional digits; orders, bills and pack sizes must be positive. Receipt quantity
is accepted quantity only: rejected/missing items are excluded. Each line must
state its base unit and units per commercial pack, or null for an unknown pack.
Only equal base units and known conversions are comparable. Quantity × pack size
is exact bigint arithmetic; output quantity strings use a scale of 10^12 base
units. Grouped receipt/bill version IDs express partial and one-to-many matches.
No receipt is assigned to more than one order. Distinct split invoices are additive.
This is order-level aggregation of matched lines, not a guessed allocation of
individual receipt quantities to individual split invoices.

Different document versions with identical source hashes, or invoice/credit
versions with the same normalized document reference and kind, are held as
candidate duplicates. All candidates remain unresolved; none is selected as
canonical or added to quantities. Multiple lines of one document remain distinct.
Any unresolved source makes delivered/billed group totals unknown (null),
conservatively across the supplied snapshot, so a partial sum cannot appear to be
a complete match. Missing invoice/receipt sources are explicit issues. Complete
snapshots report short/over delivery and billing above accepted receipt quantity.

All monetary input magnitudes are GBP pence bounded by `MAX_MONEY_PENCE`. Order
unit prices are explicitly net, per order pack. An agreed discount is integer
basis points. Expected invoice-line net is the exact normalized invoice quantity
multiplied by order pack rate and discount, rounded once half-even per bill line.
The comparison requires explicit net invoice basis; gross/unknown amounts stay
incomparable. No VAT rate or tax rounding policy is inferred. Validity is inclusive
and uses the explicit supply date, not the credit-note issue date or current clock.
An out-of-date rate yields an issue, never a fallback rate. The order remains an
estimate/reference; a match does not establish an invoice obligation.

Credits carry positive magnitudes, subtract quantity only with an explicit link
to an invoice line in the same matched group, and cannot cumulatively exceed its
quantity or net. Unlinked/excessive credits make billed totals unknown and cannot
hide an overbilling behind a negative total. Credit-only monetary adjustments
with no returned quantity need a separately specified contract; zero-quantity or
unallocated document discounts/credits are not silently spread across lines.

IDs are SHA-256 identities bound to tenant/job/merchant, source versions and issue
kind. Input arrays are sorted on parsed copies; the same facts in any array order
produce identical groups, discrepancy identities and snapshot digest. No caller
input is mutated. Invalid envelopes raise `SupplierLineMatchError` with
`INVALID_MATCH_INPUT`; monetary overflow uses the existing typed `MoneyError`.

Mappings are facts supplied to this function, not authorization created by it.
The original pure matcher remains unchanged. The dark synthetic correction seam
is specified below. Inline fixtures are development regression tests, not frozen
human ground truth, a held-out benchmark or G2 release evidence.

## M2-4 stored reviewer corrections (0494)

`SupplierLineCorrectionRepository` stores an immutable, server-owned confirmed
synthetic snapshot using `supplier-line-snapshot.v1`. The caller supplies a verified
tenant context and the authenticated server principal's identity user/membership
IDs. Every create, read, correction and replay checks current active owner
membership, including identity, expiry and revocation. No HTTP route is registered.
The seam requires `JOBGUARD_ENV=synthetic_demo`; it cannot accept real uploads or
activate live matching. Fixture confirmation/source authenticity is the trusted
caller's responsibility, as in the pure input contract above.

A strict `supplier-line-correction.v1` command contains command/snapshot IDs,
expected revision, one source version and an order version (or null to withdraw
the mapping). It cannot carry edited source lines, prices, quantities or a claimed
approval. A correction replaces only that source's mappings; other mappings and
all original document/line identities, quantities, amounts, hashes and citations
survive. Withdrawals restore deterministic automatic matching; ambiguity stays
unresolved. Duplicates and incompatible units remain subject to the original
matcher checks even after a reviewer chooses an order.

Snapshots start at revision zero. Under one transaction, the repository locks
command identity then snapshot identity, checks expected revision, appends an
immutable correction, and appends identifier/hash-only audit data. All domain
locks precede the audit-head lock. Concurrent distinct commands with the same
revision yield one success and one `MATCH_REVISION_CONFLICT`. A command replay
returns its original revision/result, even after later corrections; changing its
payload, actor or job raises `MATCH_IDEMPOTENCY_CONFLICT`. Command IDs are unique
across snapshot/correction commands within this seam. A read can request a prior
revision; replaying stored corrections through the v1 matcher reproduces the
same match and discrepancy IDs. New confirmed source versions require a new
snapshot, never edits to a stored one. No finding, debt, invoice, payment or fee
is created by these proposal corrections.

Migration 0494 adds only `supplier_line_match_snapshot`,
`supplier_line_match_correction` and their trigger guard. Tenant-qualified job,
snapshot, actor and deferred audit foreign keys, FORCE RLS, append-only grants,
immutable triggers, revision uniqueness and audit actor/type/subject/command/hash
binding protect the records. The insert guard rejects absent source/order
versions and nonsequential corrections. RLS still assumes a correctly verified
tenant context and a trusted application principal; it cannot protect against a
compromised privileged connection. Source snapshots remain synthetic proposals,
not evidence of agreed debt or verified original bytes.

Upgrade is additive and backfills no source or financial data. Roll forward with
a new migration to repair defects; keep the existing tables/history and disable
the dark caller if necessary. Never edit 0494 after merge. PostgreSQL integration,
full migration/catalogue CI and one independent RED review remain required before
merge. There is no browser change or new provider route in this piece.
