# 2043 · V2 handover pack versions

The checked V2 bootstrap applies 2043 after 2042. The shared runner leaves
databases without the dedicated V2 database name or the firm policy untouched.

It adds `app.v2_handover_version`: one row per saved handover pack version
(1, 2, …) for a job. Each row is a frozen snapshot: `content` is the exact
sections and lines the customer will see, and `sources` holds the versions they
were built from (accepted quote revision and lines, approved variation
revisions, snags with their last event sequence, photo evidence ids with
sha256, and the firm profile contact). A later change to the job never alters a
saved version; the builder saves a new one. No amounts are stored.

Row security is enabled and forced. The runtime policy is the bound tenant plus a
job `EXISTS`, so `app.job`'s practice-firm policy confines the firm. Runtime has
`SELECT` and `INSERT` only, and `app.reject_immutable_authorization_record()`
refuses `UPDATE` and `DELETE`. There is no `SECURITY DEFINER` function.
Running it twice changes nothing.
