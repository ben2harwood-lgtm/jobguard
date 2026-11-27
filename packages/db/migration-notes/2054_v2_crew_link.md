# 2041 V2-F7M crew links ("My brief" by link)

V2-only, inside the same `DO $v2$` fence as 2015 and 2027 (database name, practice
firm policy), and it returns early when `app.v2_brief_progress` or
`app.v2_crew_contact` is absent. Practice tenant only. Running it twice changes nothing.

New tables, all append-only (`reject_immutable_authorization_record` on UPDATE and
DELETE), RLS enabled and forced:

- `app.v2_crew_link`: one link for one crew record (crew id and revision), one trade
  and one job. The token is stored only as `sha256` (`token_hash`). Expiry is at most
  30 days. An AFTER INSERT guard requires the crew record to belong to the job's firm
  (`'practice:' || practice_session_digest`) and to have the link's trade. Runtime
  policy: tenant, firm (`current_firm_profile_key()`) and job visibility.
- `app.v2_crew_link_cancel`: a builder's cancel of one link.
- `app.v2_crew_progress`: a crew member's Done, Blocked or Changed by link. An
  observation only. F2's status does not count it and it moves no money or close-out;
  the builder confirms it with an ordinary F1 press. It has no watchdog trigger,
  because `guard_watchdog_input` needs a bound request actor and a link has none. The
  link function checks the job is live itself, from the same `app.job.status` rule
  `require_watchdog_live` applies. `seen_head` is the F1 task head the page showed.
  Runtime may only read it.

`app.v2_brief_progress` is unchanged: no new column, constraint or trigger.

The link side copies E2's reply link (2029): a private per-transaction scope row in
`control_plane.v2_crew_link_scope`, a failure-times table for a coarse limit (no hash
or token), `jobguard_migration` read policies only for the one job and crew record the
scope names (including one SELECT policy on `app.job` for the live check), and owner
functions `v2_crew_link_open`, `v2_crew_link_receive` and `v2_crew_link_close`, the
only ones runtime may execute. A link opens only when unexpired, not cancelled, the
newest for its crew member and trade on the job, and its crew record is still that
record's newest revision; every other case is one refusal.

Audit: one `v2.crew_progress.recorded` event per new crew press, with
`actorRef: crew_link:<linkId>` and references and hashes only, through
`v2_crew_link_audit_tenant` and `v2_crew_link_audit_take` (copied from E2), which
allow exactly that one event for the scope's press.
