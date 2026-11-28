# 2086 · V2 aftercare check-up offers at 6 and 12 months after handover release

V2-only, inside the same `DO $v2$` fence as 2083 to 2085 (database name, practice firm policy),
and it returns early when `app.v2_handover_release_stop` is absent. The checked V2 bootstrap
applies 2086 after 2085. Both tables carry the same restrictive `v2_practice_firm` lock as every
V2 table. Practice tenant only. Running it twice changes nothing.

New tables, append-only (`reject_immutable_authorization_record` on UPDATE and DELETE), RLS
enabled and forced, runtime policy tenant plus job visibility (the job's practice-firm policy
confines the firm). Runtime may select and insert.

- `app.v2_aftercare_switch`: the builder's on/off for one job. Insert-only; the newest row is
  the setting, and no row means off.
- `app.v2_aftercare_offer`: primary key (tenant, job, `at_months` 6 or 12), so each offer can be
  written once. It names the release it followed and the address it went to.

`app.v2_aftercare_due(t, j, ignoring)` (STABLE, runs as the caller) returns the state the screen
shows and the guard enforces, first match wins: `off`, `no_release` (no release whose link is
not stopped), `recipient_changed` (G4's address rule), `done` (the 12-month offer was sent),
`too_soon` (with the next date), `due` (with the month). Months count from the newest unstopped
release. Once the 12-month point has passed, only the 12-month offer can go: an unsent 6-month
offer is skipped as too late. `ignoring` lets the insert guard leave its own new row out.

`app.v2_aftercare_offer_guard` (AFTER INSERT) refuses with `V2_AFTERCARE_NOT_DUE` (23514) unless
the row is the offer due now, for that release and that address.

Audit: `v2.aftercare.switched` and `v2.aftercare.offered` from the builder's ordinary sealed
transaction, references and hashes only (no email).
