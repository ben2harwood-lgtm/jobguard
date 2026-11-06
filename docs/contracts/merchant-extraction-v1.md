# M2-3 synthetic multi-page extraction

`extractMerchantDocument` in `@jobguard/ai` accepts the strict
`merchant-extraction-source.v1` text-layer envelope. All entry points require
`JOBGUARD_ENV=synthetic_demo`. This is an in-process adapter contract, with no
HTTP route, PDF decoding, real OCR, model call, storage access or business writes.
Existing single-line supplier fixtures and their confirmation UI stay on their
existing contract. This built-ahead slice does not activate a new confirmation UI.

The server-side caller must obtain the hash, immutable original object version,
expected original page numbers and text regions from verified intake. These are
not assertions a client can authorize. This pure extractor validates the envelope
but cannot verify original bytes or tenant membership; those remain the intake
boundary's responsibility. Expected pages are explicit original page numbers,
so a split document with pages 3 and 4 keeps citations to pages 3 and 4.

Digital text is always used first. An empty digital text layer requires review;
it does not silently trigger OCR. Only a declared image-only page can use the
server-seeded `FakeMerchantOcrAdapter`, keyed by original version and source page.
No live adapter or regional-provider approval is implied. Regions use normalized
bounding boxes; field offsets are UTF-16 offsets within the cited region text.
Each field retains its exact source token, page, region, original hash/version,
parser version, and digital/fake-OCR provenance. Confidence is explicitly
`unassessed`, not a calibrated probability.

The deterministic synthetic grammar uses one row per field:

```text
MERCHANT: Fictional Timber
DOCUMENT: invoice
INVOICE: INV-001
DATE: 2030-01-02
CURRENCY: GBP
LINE: Timber | 2 | pack/10 | 10.25 | 20.50 | 4.10 | 24.60
DISCOUNT: 0.00
CREDIT: 0.00
NET: 20.50
VAT: 4.10
TOTAL: 24.60
```

Line columns are description, quantity, explicit unit/pack label, unit price,
net, VAT and total. Multiple lines and regions can span multiple original pages.
No pack conversion or matching is inferred. Amounts are nonnegative GBP magnitudes
with exactly two decimal places, bounded by `MAX_MONEY_PENCE`; quantities are
positive exact decimals with at most six fractional places. `DOCUMENT: credit`
records credit-note magnitude semantics separately from positive invoice amounts.
Signed/ambiguous amounts, other currencies and unsupported layouts require review.

Reconciliation uses bigint arithmetic: quantity × rate must equal stated line net
exactly, line net + VAT must equal line total, summed line nets minus explicit
document discount and credit must equal stated net, summed line VAT must equal
stated VAT, and stated net + VAT must equal stated total. No VAT rate or rounding
policy is invented. Zero adjustments must be explicitly stated in this grammar;
missing fields are unknown. Discounts affecting tax need explicit consistent
source figures, otherwise the document requires review.

Missing/duplicate/unexpected pages, duplicate lines, invalid decimals/quantities,
missing or ambiguous headers, unknown rows, unreadable pages and arithmetic
mismatches produce review issues. The parser retains duplicate proposals and
stated totals; it never deduplicates debt or manufactures a balancing value.
Every result, including one with no detected issues, has status
`proposal_requires_confirmation`. It cannot establish agreed debt, delivery,
commercial authorization or fee eligibility. No new persistence/confirmation
path is supplied by this slice; a later integration must retain extraction
history and human corrections through the normal authorized command boundary.

The labelled 100-document held-out corpus, human ground truth, live PDF/OCR route,
regional provider evidence and production release remain separate gates. The
inline synthetic development examples are regression tests, not a frozen corpus
or a claim of photographed/rotated/blurred image recognition accuracy.
