# MON-1 remainder part 2: day ledger (RED)

Extends the 0239 tables; no new table, role, runtime grant or session API.
Existing held computations and rows remain unchanged. Uniqueness now includes
recipe version, allowing the counted London clock recipe beside the held recipe.
The old held rebuild selects only its own recipe and retains its bootstrap posture.

The internal `persistMeterDayLedger` seam requires a tenant transaction under the
existing narrow meter role. It validates and hashes the immutable captured source,
then applies `london-midnight-stops.v1` with `countMeterDays`. It stores every London
date, including zero counts, with places and small allowances. The source remains
unchanged even when its original policy was the held foundation policy. This is a
new projection recipe, not a change of source facts or production admission.

Retries serialize under existing tenant lock 184. An identical projection returns
the existing computation ID. Changed/missing stored rows refuse with
`METER_PROJECTION_MISMATCH`; nothing is repaired or overwritten silently. Changed
facts require a new source revision and produce a separate computation and rows.
RLS, tenant-qualified foreign keys and immutable triggers from 0239 still apply.
The role remains a trusted internal writer; this is not a claim to protect against
compromise of an authorized meter connection or a forged tenant context.

No data backfill is needed. Roll forward for fixes: do not remove immutable ledger
history. To stop use, leave the writer uncalled (it has no runtime caller here).
Parts 3–5 own session integration, screens/journeys and real admission. Production
charging, corrections and release gates remain outside this piece.

Validation: focused local core/unit tests and DB typecheck; PostgreSQL integration
and full migration checks run in CI because the builder sandbox cannot bind ports.
