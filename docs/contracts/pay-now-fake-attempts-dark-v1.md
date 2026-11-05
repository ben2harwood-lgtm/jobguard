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

## Builder practice preview (4 November 2026; MON-6 remains open)

This addition supersedes the earlier no-route/no-screen description only for the
builder practice preview. A session-only, no-store GET/POST now serves the stored
invoice and attempts at `/jobs/:job/invoices/:invoice/pay-now-preview`.
The application binds the verified company context directly; POST passes the
session digest as actor locator and accepts only `{commandId, rail}`. GET checks
current owner/admin membership via the existing identity provider and obtains
positive-balance options from read-only SQL prepare; zero balance has no
collectable options. No private SQL actor-helper grant was added. POST requires
the trusted browser origin. Page and route are not found outside synthetic_demo.
The client renders server facts, shares the original wording, and retains the
command ID/rail across uncertain responses and reloads. Bank transfer gets equal
list treatment and a 44 px practice action. The customer component stays dark.

Local evidence: all seven package TypeScript checks and 415 focused Vitest tests
passed with installed binaries, at most two workers per run; lane/diff checks
and browser fixture subprocess syntax pass. The pnpm wrapper could not
verify/fetch its pinned executable here; its top-level checks did not execute.
Vitest lists five new DB cases; Playwright lists mobile-360 and desktop cases.
Neither database nor browser execution was possible in this sandbox.
CI must run `pay-now-preview.integration.test.ts`, existing
`pay-now-attempt.integration.test.ts`, and
`MON-6-stored-pay-now-preview.spec.ts` headless at both widths. They cover stored
extreme balances, row immutability, replays/concurrency, roles/sessions, isolation,
credits/receipts/reversals, equal screens for an ordinary stored invoice and a
synthetic approved catch line, lost-response retries after reload, 44 px targets
and no horizontal scroll. The catch line is a source fixture, not live detection.
Normal CI gates and independent RED review at the router's committed head remain
outstanding. No migration, role or grant was introduced. Customer page, live
rails, stages, real tariff/VAT, provider sandbox evidence and G0-G5 stay held.

LATER / SIMPLICITY (initial review): `PayNowAttemptApplication.read` could later
use a repository current-options projection instead of inline prepare SQL plus
a separate balance read, keeping stored projection in one place. That requires
a separately scoped repository-interface change outside this brief.

## Customer practice display (4 November 2026; MON-6 remains open)

`GET /api/customer-portal/practice-pay-now` and
`/customer/practice-pay-now` are synthetic_demo only. They accept no invoice,
tenant, job or customer locator. The existing customer cookie and persisted
session digest bind the scope; supplied query parameters or tenant headers are
refused before application access. Missing, malformed, expired, revoked and
foreign-scope customer credentials share the portal's public refusal. Responses
are no-store and no-referrer. No customer link or message is created or sent.

Migration 0766 adds one bounded identity-only read routine, reusing portal resolve
and its authority locks before invoice access. It selects the bound job's latest
synthetic final invoice by issue date and invoice number, subtracts credits and
unreversed receipts, and returns only invoice number and amount due. No role,
table grant, table, column or earlier routine changes; only EXECUTE on this new
read entrypoint is granted to the existing identity login. Its proof and note
record the expected catalogue change for CI verification.

The application projects only rail and customer total from `payNowOptions`.
Core's required identity fields use session-bound local placeholders for this
arithmetic projection; no stored invoice identity or catch classification is
needed. Builder fees, tariffs, surcharge lines, destinations, attempts and hidden
data never enter the public body. Positive balances offer bank transfer, card
and pay by bank in core's existing order; a zero balance offers none. All options
have identical list markup, spacing and font weight. There are no payment actions,
links, browser storage writes, attempt starts or other effects of visiting.

Local evidence: seven package TypeScript checks passed using installed binaries.
436 focused Vitest tests passed (application and authorization guards, identity,
repository and migration-proof loader, core cap/dark guards, route and rendering).
Runs used at most two workers and at most three named files. Browser listing
finds the new spec in mobile-360 and desktop; the native seed subprocess passes
`node --check`. Listing/syntax checks do not establish database/browser execution.

CI must execute `packages/db/test/customer-practice-pay-now.integration.test.ts`
and `apps/web/e2e/MON-6-customer-practice-pay-now.spec.ts` headless at both widths,
plus the existing required PostgreSQL fresh/upgrade/catalogue/RLS suites and
normal checks. The new database cases cover 1, 12,000 and 1,000,000,000,000 pence,
catch/ordinary byte equality, current balances after credits/receipts/reversals,
identity-only access, uniform session refusals and unchanged stored rows.
The browser spec uses actual stored fictional invoices and customer sessions,
checks equal options, no actions or disclosure, revoked/signed-out refusal and
no new attempts. Neither suite can execute in this sandbox. Exact-head independent
RED review remains required. CustomerInvoicePayNow and PAY_NOW_ENABLED stay dark;
real invoice UI, provider evidence, live rails/links, stages, tariff/VAT and all
G0-G5 release gates remain held. This does not finish MON-6.
