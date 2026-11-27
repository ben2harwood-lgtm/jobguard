# 2062 · V2 handover link stop, and refusal of a link sent to an earlier customer contact

V2-only, inside the same `DO $v2$` fence as 2058 (database name, practice firm policy),
and it returns early when `app.v2_handover_release` is absent. The checked V2 bootstrap
applies 2062 after 2058. Practice tenant only. Running it twice changes nothing.

New table, append-only (`reject_immutable_authorization_record` on UPDATE and DELETE),
RLS enabled and forced, runtime policy tenant plus job visibility (the job's practice-firm
policy confines the firm). Runtime may select and insert.

- `app.v2_handover_release_stop`: one row per release (PK tenant, job, release), with the
  command id (unique per tenant), the request hash for replay, the acting member, a reason
  of at most 200 characters and the time. Never undone: the builder releases again to send
  the pack again.

`jobguard_migration` read policies, each scoped by `v2_handover_link_scoped` to the one job
the link scope names: the stop table, and own copies of E2's (2029) `job_party_current`
and `job_party_binding` policies, plus `customer_revision` through a scoped binding.

`CREATE OR REPLACE` of two 2058 bodies only; owner, search path and grants are unchanged:

- `v2_handover_link_scope_open(h)` refuses (and logs a capped failure, as for any other
  refusal) when the release is stopped, or when its `recipient_email` is not the job's
  current customer email (`lower(btrim(...))` on both sides, so a cosmetic edit keeps the
  link). A job with no current customer email refuses too.
- `v2_handover_link_view(r)`: `newerAvailable` ignores stopped releases.

Audit: `v2.handover.link_stopped` from the builder's ordinary sealed transaction,
references and the request hash only (no reason text, no email).

The proof file is empty, as 2058's: the V2 fence keeps these objects out of the main
LP-0 catalogue.
