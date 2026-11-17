# Extra synthetic practice facts v1 — PRACTICE-FACTS-1 part A

Issued 11 October 2026 after CH-7 merged as `4a70824`. Header rulings govern this
leaf. The merged seven-row catalogue, command version, routines and assertions
remain unchanged. This separate catalogue uses the same append-only feed tables
and server-issued practice-session boundary. It runs only in `synthetic_demo`.

| Movement | Exact gross pence | Kind | Fixture |
|---|---:|---|---|
| receipt-12000 | 1200000 | customer_receipt | test-m |
| receipt-14640 | 1464000 | customer_receipt | test-m |
| supplier-payment-600 | 60000 | supplier_invoice_payment | later-supplier-invoice |
| supplier-payment-840 | 84000 | supplier_invoice_payment | later-supplier-invoice |
| receipt-interest-120 | 12000 | customer_receipt | F18-outside-vat |
| receipt-compensation-70 | 7000 | customer_receipt | F18-outside-vat |

Supplier cash due is the fixed server catalogue constant 144000p. These are
**INTERIM synthetic fixture amounts (coordinator ruling 11 Oct); not product
figures**. No document, credit or VAT formula derives this amount. F18's two
additional receipts are outside-VAT synthetic fixtures; their VAT treatment is
**HELD for the founder**. The F18 journey opens the case before settling these
receipts. This leaf adds facts; it does not change CH-7's attribution or review,
which continues to cite its original 300000p receipt.

`practice-facts-command.v1` is a strict discriminated Zod union: command UUID,
expected shared account revision, and `advance` with one of these six keys and
one of the six merged generated steps; `reconcile_duplicate` with a key; or
`match_receipt` with a customer-receipt key and a payment UUID. Supplier payment
keys cannot match receipts. `connect` and `disconnect` remain exclusively on the
merged feed route. No client amount, state, account, tenant, environment, source
identity, cash due or allocation is accepted.

GET and POST `/api/jobs/:id/practice-facts` share `PracticeFactsApplication`
across Next and Nest. GET accepts only `practice-facts-query.v1`, cursor and
limit (1–50). The strict `practice-facts-view.v1` reports the catalogue, paged
movement facts, exact-amount builder receipts and assessments, source event IDs
and hashes, and `laterInvoice` (`unpaid`, `part_paid`, `paid_in_full`). Shared
revision includes commands from either catalogue. No new error codes: the
merged error/status vocabulary is reused under `practice-facts-error.v1`.

The internal one-to-one representative mapping reuses the merged pure event,
projection and receipt-assessment algorithms. Representative keys and amounts
are never persisted or returned. Real events retain `practice-feed-event.v1`,
generated event identities and identical source-hash inputs. Replays and page
overlap add no event; alternate representation adds no underlying movement.
Unidentified duplicates hold a movement until reconciled. A supplier payment
counts only if identified, settled and unheld. Exact SH-1 integer/rational
primitives sum the two supplier payments; settlement, reconciliation or matching
never creates an allocation, landing, journal, fee, statement or collection.
`allocatedEligibleNetPence` remains literal zero.

The merged projection filters new movement identities. It excludes a customer
payment only when its payment ID is linked by a stored receipt match to a key
in the new catalogue. Amount alone never excludes a receipt; unmatched ordinary
receipts retain the merged view even when they equal a new fixture amount.
The new section continues to offer exact-amount candidates for explicit matching.
Its movements, event count and merged receipts remain unchanged for the
mixed-catalogue upgrade control; its revision tracks all commands.
The new section is outside `#practice-receipts`, uses
`practice-fact`, and adds no sandbox banner. Unknown transport outcomes pause
writes until a successful saved-state read; no blind write retry occurs.

The application passes PracticeAccess's stamped context whole, minted by the
existing source-pinned practice-session membership bridge. No new context
constructor caller is introduced. The repository independently verifies current
owner membership, creator/session/job binding and server environment, takes
merged command/job locks, inserts commands/effects and appends the merged audit
in one transaction. The unchanged database guards and deferred completeness
triggers enforce that same write contract. Existing FORCE RLS, owner and grants
are retained. As in the merged feed, database environment settings are supplied
by the server; physical separation from pilot/production remains the boundary.

Migration 0131 widens the six existing catalogue checks under their original,
discovered names, validated in the same transaction. The command/event movement
checks add **six movement keys**: `receipt-12000`, `receipt-14640`,
`supplier-payment-600`, `supplier-payment-840`, `receipt-interest-120` and
`receipt-compensation-70`. The receipt-only checks (command match action and
receipt-match keys/amounts) add **four receipt keys**: `receipt-12000`,
`receipt-14640`, `receipt-interest-120` and `receipt-compensation-70`.
It creates no schema object and changes no existing row. Its upgrade tests
compare all six names, validation flags and old allowed literals, populated
row JSON text and full security/routine catalogues before and after. Restore or
forward-fix the application while keeping the widened checks; do not narrow
checks or rewrite append-only rows after new keys have been stored.

Part B is owed to PRACTICE-FACTS-1b after this leaf merges. F14 and F16 saved
positive eligibility paths remain held. M4-8-S saved F5 and live M4-5 are also
outside this leaf. D01 v3, D03 v3, the §5.5 consumed-credit amendment and G4-S
remain gates; these fixtures grant no production or commercial authority.
