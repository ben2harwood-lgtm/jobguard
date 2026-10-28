# CH-5: invoiced v3 imports (0324)

Synthetic only; RED review and CI required. No real data or providers.

The new checked writer stores one immutable aggregate: approved server fixture,
v3 terms, baseline and scope mapping, original generated result, session-scoped
public request hash, and a permanent zero-count exclusion for the invoiced stage.
The result's opaque `meterResultRef` identifies that exclusion, not a MON-1 period
ledger computation. No live place admission is inferred. Live imports still fail
before a command receipt or approval at `METER_PLACE_SOURCE_HANDOFF_HELD`.

The writer authenticates the practice session, checks source ownership and current
party binding, reproduces the one allowed fixture, and verifies the exact approved
action. It reuses `final_lock_canonical` only for this all-ASCII snapshot. No arbitrary
snapshot/history is accepted. Imports link current live jobs owned by the session
with the same stable customer/site identities. Source-job locking serializes same
source imports; the unique source/fixture key rejects a second command rather than
creating another job. Identical replay retains the original IDs. Audit appends and
the completed command share the writer transaction; audit locks come last.

The baseline constraint permits imported v3 jobs with no cap only at `invoiced`.
It preserves the v1 branch and every historical column. The immutable aggregate
has tenant-qualified foreign keys, FORCE RLS and SELECT-only runtime access. The
new routine is migration-owned with pinned search_path and no PUBLIC execution.
The privilege inventory and tenancy/upgrade expectations enumerate only these
new capabilities; these are candidate expectations requiring the RED review.

Historical evidence ingestion, imported final-account baseline consumption/locking,
and the persisted pre-adoption catch journey remain refused. The screen explains
the £0 pre-adoption exclusion; it does not claim a catch was detected. Production,
real fees, providers, releases and migration of historical v1 imports remain off.

Forward fix: keep 0324 and add a reviewed successor. To withdraw the capability,
revoke runtime EXECUTE on `adopt_invoiced_job_v3`; retain the immutable rows and
reads for audit. Do not drop records or rewrite v1 imports. PostgreSQL tests cover
fresh install, upgrade, replay, duplicate races, grants/RLS, tenant/session denial,
missing authorization, invented history and locked-bill reference substitution.
Those suites and the browser test require CI in this sandbox.
