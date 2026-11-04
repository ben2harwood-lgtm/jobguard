# MON-6 dark fake attempts v1

Synthetic observations only; MON-6 remains open. `PAY_NOW_ENABLED` is false.
No route, screen, worker or application registration consumes this repository.
CustomerInvoicePayNow remains mounted without an invoice and renders nothing.

`command(context, actor, raw)` accepts a verified context, a trusted actor locator
`{jobId, sessionDigest}`, and the strict versioned command
`{version: 'pay-now-attempt.v1', commandId, invoiceId, rail}`. The session is
rechecked against active company owner/admin membership in SQL, including replay.
Only bank_transfer, card and pay_by_bank are accepted. Every stored customer_invoice
currently represents a final invoice; deposits, stages and the DD stub are excluded.
The invoice's final-account revision and existing issuance/lock controls remain authoritative.

The server derives the balance using stored credits and unreversed receipts, and
derives `fake-builder-<tenant UUID>` itself. Core parsePayNowInvoice/payNowOptions
and the shared payNowFakeResult own all tariff arithmetic. The private SQL store
receives that calculated projection, verifies balance, destination, zero platform
funds and the cap independently, and hashes the complete record. Repository reads
revalidate exact core options and results, refusing corrupted projections. SQL
EXECUTE is an application trust boundary: it does not defend against compromised
application code submitting a false tenant context or bypassing core projection
validation. No additional role or direct table access is granted.

Prepare and store share one transaction and the existing command-then-invoice
advisory lock order. A unique tenant/invoice/source fingerprint refuses a second
fake settlement of identical invoice facts, including concurrent commands.
The fingerprint covers the immutable invoice source/final revision plus credit,
receipt and reversal identities. A changed balance permits a new observation;
even a reversal returning to an earlier balance has a distinct fingerprint.
The commercial invoice revision is unchanged by these observations. Replays
return the original immutable row, even after credits, full payment or reversal;
changed command payload or actor conflicts. A new command cannot collect a zero balance.

`read(context, jobId, invoiceId)` uses verified-context tenant isolation, as the
existing practice invoice reader does; it returns `{synthetic: true, attempts}`.
Each attempt and every option/result has a synthetic label. Missing invoices,
foreign tenants and wrong jobs have the same not-found response. These are fake
outcome records, not payment facts, commercial commands, receipts, ledger postings,
fee obligations, reservations, collections or audit-chain events. None of those
tables is written. Bank transfer is always offered without a fee. Catch provenance
does not affect options or fees; the projection does not inspect shadow tables.

D10 v2 amounts are unapproved fixture values. No live tariff, VAT treatment,
provider sandbox evidence, live rail, link, charge, DD, stage or screen is delivered.
Live use still requires the written payment-regulation opinion, VAT ruling,
D10 v2, G4-S and M4-15. All G0-G5 gates remain closed. Exact-head independent
RED review and PostgreSQL CI (including upgrade/catalogue/RLS/concurrency tests)
remain required before landing this bounded synthetic change.
