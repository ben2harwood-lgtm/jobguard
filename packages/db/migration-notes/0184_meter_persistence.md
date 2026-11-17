# MON-1B — synthetic meter persistence

Provisional migration 0184, discovered by the existing directory reader. The
landing dispatcher may renumber with `tools/migration-renumber.mjs`; SQL bytes
remain unchanged. No migration-runner or legacy register edit.

Adds immutable `meter_input_event`, `meter_computation`, `meter_day_ledger`,
`meter_correction`, `meter_projection_alert` and a NOLOGIN `jobguard_meter` role.
All tables are tenant keyed and FORCE RLS. Runtime SELECT has no matching policy;
company results are released only by the session-checked reader. Runtime has no
direct writes. Meter owns the computation routines, has no shadow grants and
cannot assume the migration role. Its one migration-owned authority bridge reads
persisted identity/SSO/membership through the merged role model.

Sources are explicitly supplied synthetic daily job facts and plan/trial schedules,
as in the parent's pure model. The migration creates no live event adapter, stop
endpoint, quiet/trial timer, trip hook, admission hook, subscription charge or
commercial document. Production and pilot execution remain disabled. Only the
migration role can execute the checked fixture loader. Normal owner/admin
sessions may recompute and read their own company. Shared-practice summaries are
refused under Q5; fixture fact IDs are synthetic identifiers rather than live job
FKs or evidence claims. No customer information is authorized.

One tenant advisory transaction lock precedes every write; no job/source/audit
locks follow it. Rebuilds derive counts from immutable input snapshots, never the
day ledger. A mismatch adds one alert; existing rows are preserved. Late snapshot
revisions create new computations and unique incremental corrections assigned to
the source period's end date (the next period's start). Nothing issues a bill,
refund, payment, authorization, commercial send or success-fee offset.

Rollback: keep additive storage and disable callers; no down-migration deletes
facts. Forward fix uses a later reviewed migration and compensating synthetic
corrections. New source snapshots must keep an existing period's bounds.

Upgrade proof: `test/meter-persistence-upgrade.integration.test.ts` installs before
0184, seeds non-empty account/membership/job tables, snapshots names/full types
and canonical named-column text by original PKs, applies 0184 alone, compares,
then applies later migrations twice. Rolled-back controls detect a microsecond
change/retype and permit nullable columns, function replacement and later inserts.
PostgreSQL execution is NOT RUN in the builder sandbox.

If the next period already has a closed computation, further late corrections
are refused with `METER_CORRECTION_PERIOD_CLOSED`. Choosing a later open target
period needs a separately settled rule; no issued-period envelope is changed.
