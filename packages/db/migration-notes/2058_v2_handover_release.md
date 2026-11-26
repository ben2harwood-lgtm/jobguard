# 2058 · V2 handover release by link, and acknowledgement of receipt

V2-only, inside the same `DO $v2$` fence as 2043 (database name, practice firm policy),
and it returns early when `app.v2_handover_version` is absent. The checked V2 bootstrap
applies 2058 after 2043. Practice tenant only. Running it twice changes nothing.

New tables, append-only (`reject_immutable_authorization_record` on UPDATE and DELETE),
RLS enabled and forced, runtime policy tenant plus job visibility (the job's practice-firm
policy confines the firm):

- `app.v2_handover_release`: one link for one saved version (FK to `v2_handover_version`)
  and one recipient, the job's current customer email. The token is stored only as
  `sha256` (`token_hash`). Expiry at most 90 days. The firm's name is kept as released.
  An AFTER INSERT guard requires the version's own `content_hash`, and ordinary site
  completion: the job has scope progress and every scope item's `scope_progress.stage`
  is `complete` (`V2_HANDOVER_SITE_NOT_COMPLETE`). Release never reads the final-account
  lock, invoices or payments. Runtime may select and insert.
- `app.v2_handover_acknowledgement`: receipt only, one row per release with a time and
  nothing else. No watchdog trigger, because `guard_watchdog_input` needs a bound request
  actor and a link has none. Runtime may only read it.

The link side copies E2's reply link (2029) and F7M's crew link (2041): a private
per-transaction scope row in `control_plane.v2_handover_link_scope`, a failure-times
table for a coarse limit (no hash or token), `jobguard_migration` policies only for the
one job the scope names, and owner functions `v2_handover_link_open`,
`v2_handover_link_acknowledge` and `v2_handover_link_close`, the only ones runtime may
execute. An unknown or expired link is one refusal (`HANDOVER_LINK_REFUSED`). A link
whose version has a newer release still opens, read-only, with `newerAvailable` and
nothing else about the newer release.

Audit: `v2.handover.released` from the builder's ordinary sealed transaction, and one
`v2.handover.acknowledged` per new receipt with `actorRef: handover_link:<releaseId>`,
through `v2_handover_link_audit_tenant` and `v2_handover_link_audit_take`, which allow
exactly that one event for the scope's release. References and hashes only.
