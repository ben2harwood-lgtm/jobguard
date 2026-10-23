# 0206 — MON1-T small-job trip foundation

Additive, synthetic-only private source seam and two append-only tenant/job tables.
No existing table/column, fingerprinted row, routine, grant, trigger, historical
migration or runner/list is edited. No source hooks, provider activity, public
runtime EXECUTE, fees, subscriptions, plan changes, trial activation or routes.

New tables: `app.job_small_trip_event`, `app.job_small_trip_observation`, owned by
`jobguard_migration`, ENABLE/FORCE RLS, tenant/job-qualified keys, runtime SELECT
only, and statement UPDATE/DELETE/TRUNCATE rejection. The observation records its
crossing approval/revision/activation, predecessor, exact net, source hash/set,
policy, effective/recorded times and deferred audit-event reference.

New private routine: `app.mon1_capture_small_trip(uuid,uuid,text,uuid)`, SECURITY
INVOKER with pinned `pg_catalog` search path, owner-only execution and explicit
current-user/tenant checks. An already-held tenant lock184 is mandatory before its
job lock; no late tenant lock is acquired. Audit chain append is the last lock.
Current source authorization, session/permission recheck and source write/receipt
composition remain MON1-I's responsibility and STOP pending lock-order confirmation.
See `docs/contracts/meter-small-trip-v1.md` for replay/time choices and holds.

No backfill. Old activations, documents, v1 rows and existing statements stay
byte-identical. A predecessor application simply ignores the new objects. N is
autodiscovered; do not register it in the sealed historical runner list. Number
0206 was reserved by the issued order and must be rechecked by the dispatcher
against eventual main before landing. Any renumber is coordinator-owned.

Validation written: `meter-trip.integration.test.ts` (fresh migration via real
runner), `meter-trip-races.integration.test.ts` (private capture concurrency and
rollback), `meter-trip-upgrade.integration.test.ts` (populated preceding schema,
N alone, old row/type/grant/policy preservation, successors twice, comparator damage
controls). These are private synthetic foundation fixtures, including explicit
replica-mode activation parents; they are not product source-command evidence.
PostgreSQL/browser suites NOT RUN locally by issue/environment restriction. CI
must execute them plus prior mandatory migration/catalog/browser regressions.

Forward-fix strategy: keep the seam uncalled until integration is accepted; disable
new source consumers on defect and add a reviewed corrective migration. Preserve
trip identities, observations and audit history. Never edit an applied migration,
remove a latched event, rewrite issued sources, or drop populated tables to roll
back. Application rollback is additive-compatible but must not re-enable consumer
paths without the accepted trip hook. No automatic rollback SQL is provided.
