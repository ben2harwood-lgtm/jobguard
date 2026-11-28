# 2085 · V2 review request after handover release

V2-only, inside the same `DO $v2$` fence as 2083 and 2084 (database name, practice firm policy),
and it returns early when `app.v2_handover_release_stop` is absent. The checked V2 bootstrap
applies 2085 after 2084. Both tables carry the same restrictive `v2_practice_firm` lock as every
V2 table. Practice tenant only. Running it twice changes nothing.

New tables, append-only (`reject_immutable_authorization_record` on UPDATE and DELETE), RLS
enabled and forced, runtime policy tenant plus job visibility (the job's practice-firm policy
confines the firm). Runtime may select and insert.

- `app.v2_review_request_switch`: the builder's on/off for one job. Insert-only; the newest row
  is the setting, and no row means off. Command id unique per tenant, request hash for replay.
- `app.v2_review_request`: the one request. Primary key (tenant, job), so a second request can
  never be written, even after the switch goes off and on again. It names the release it
  followed and the address it went to.

`app.v2_review_request_due(t, j)` (STABLE, runs as the caller) returns the state the screen
shows and the guard enforces, first match wins: `off`, `no_release` (no release whose link is
not stopped), `recipient_changed` (G4's address rule), `open_dispute` (a recovery case against the
customer, book `builder_customer`, whose current state in `recovery_case_current` is still open:
`identified`, `active`, `evidence_assembled`, `pursuing`, `negotiating` or `partially_landed`; a supplier
overcharge case does not count), `unpaid_invoice` (an issued invoice whose total
less credit notes exceeds its payments less reversals, the `projectInvoiceBalance` rule),
`too_soon` (less than 7 days since the newest unstopped release), `due`.

`app.v2_review_request_guard` (AFTER INSERT) refuses with `V2_REVIEW_REQUEST_NOT_DUE` (23514)
unless the state is `due` for that release and that address.

Audit: `v2.review_request.switched` and `v2.review_request.sent` from the builder's ordinary
sealed transaction, references and hashes only (no email).
