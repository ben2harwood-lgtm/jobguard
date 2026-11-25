# 2015 · V2-F1 brief progress (RED)

V2 database and firm-policy fence copied from 2007. One append-only observation
per command, with exact brief revision, trade, scope identity, task key, per-task
expected revision, verified editor and server time. The existing live-job trigger
and closed/post-lock job-stage guard are reused. Runtime gets SELECT/INSERT only on this operational table; no authority,
money, existing-table grant or hidden-data capability changes. RLS is enabled and
forced with the existing bound-tenant and visible-job predicate.

No backfill. Old briefs without taskKey refuse presses until regenerated. Earlier
observations remain linked to the brief revision originally pressed and are shown
alongside regenerated tasks by trade/scope/task key. Done is a builder observation,
not proof of completion. Changed writes no scope, price, order or diary. Photos
remain null until V2-PX/F1-P; diary writing remains deferred to F1-D.

Every press inserts its observation then appends exactly one tenant-chain event
in that transaction. Replay appends nothing. Audit has identifiers/hashes only,
never note text, trade text, findings or a reference key named version.

Forward fix only: preserve history; an older app may ignore the additive table.
The shared migration runner leaves non-V2 databases untouched. V2 bootstrap
explicitly applies 2015 after the brief schema and before seeding. Catalog,
second-firm, audit, replay, rollback and regeneration tests are appended in the
full V2 seed suite, not executed in the restricted builder sandbox.
