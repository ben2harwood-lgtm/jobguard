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
A future stored multi-line correction command must verify the current source
versions, expected revision, permission, idempotency and audit in one transaction.
The existing single-line correction command is unchanged and does not persist
this new envelope. This piece claims no new UI, concurrent correction persistence,
held-out benchmark, live PDF/OCR/provider route or G2 release evidence. Inline
synthetic tests are development regression fixtures, not frozen human ground truth.
