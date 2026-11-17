# MON-1B synthetic persistence v1

This implements persistence for the supplied-input part of MON-1. It is not a
live lifecycle replay engine. The unchanged parent supplies `groupSuppliedMeterPlaces`,
`computeSmallPlaceAllowance` and `computeSuppliedMeterPeriod`. SQL grouping,
allowances and integer half-even arithmetic are compared with those functions.
All figures are hypothetical principal in GBP. No money is posted or collected.

`meter-persisted-fixture.v1` contains a complete 28–31-day London-date schedule:
period bounds, daily plan/annual/trial facts, and fixed synthetic job/customer/site
identities with explicitly supplied small flags. It accepts no caller-provided
count, price, policy, actor, finding or signal. It deliberately does not derive
stops, quiet periods, trial conversion or trips. It does not claim those fixture
identities are persisted CH-4 facts. Only the migration credential may load these
fixtures through `mon1_store_fixture`; it must also present an active normal
owner/admin session, and the routine derives the actor from that persisted session.

A `meter_input_event` is an immutable, versioned whole-period supplied-fact
snapshot. Reusing its ID requires the identical JSON and actor. Later snapshots
have a tenant-serialized period sequence. A complete snapshot makes missing days
an error rather than silently assuming zero. Fixture jobs have no production
write path, and their IDs are not links to evidence or commercial facts.

`MeterRepository.rebuild` accepts only `meter-rebuild.v1` and a period start.
The checked routine authenticates before looking up the period or replay,
serializes by tenant, rebuilds from the latest immutable snapshot, and persists
one computation per source. `meter_day_ledger` is a disposable projection, never
a source for principal. Altering it cannot change a read or a correction. A
repeat rebuild compares it with its immutable source and adds one
`METER_CACHE_MISMATCH` alert. Detection preserves the changed row for inspection.

A period's first result is its baseline. Late snapshot revisions leave every
old source, computation, stop supplied in that source and daily row unchanged.
They produce a new result and one correction equal to recomputed principal minus
the baseline minus prior corrections. The correction applies to the next period,
whose start is the original period's end. Even a zero correction records its
source identity. Replaying or concurrently rebuilding that source cannot add a
second correction. There is no refund, payment or success-fee offset.

`MeterRepository.read` accepts `meter-read.v1` and an exact computation ID. It
returns `meter-persisted-read.v1`, with source/result hashes, the recomputed
parent-shaped result, alerts and corrections belonging to that period. It
validates the returned result again using the parent formula. SQL hashes use
canonical PostgreSQL JSONB text, not JavaScript JSON serialization. Old
computation IDs continue reading their original input snapshot. A later
correction does not rewrite an issued snapshot. This package exposes a server
service, with no HTTP route or UI; no HTTP cache behavior is claimed.

Normal synthetic company owner/admin authority follows the merged persisted
identity session, active membership, account and SSO membership gate. The shared
practice tenant is always refused under Q5. Every read/rebuild uses the caller's
current session; no actor argument or saved context is accepted. Missing and
foreign targets have the same `METER_FORBIDDEN` error. No new authorization role
or customer-data scope is inferred. Runtime direct SELECT sees no rows because
its role has no matching RLS policy; checked routines run as the isolated meter
role with transaction-local tenant RLS. The authority bridge has no shadow query.

The meter role cannot log in, inherit or assume another role, and receives no
shadow grants. This isolation is within the existing verified-context and
restricted-credential trust boundary. A privileged owner can rewrite storage;
hashes are integrity checks, not proof of authenticity or independent anchoring.

Held: shared-practice summaries (Q5); stop/quiet/trial endpoints and conversion-day
charging (Q6); trip-latch/source hooks; named small/extra/grace job-line attribution;
place-adding command integration; all production/pilot issuance and charges. UI
and the original browser assertions remain parked. Independent review, separate
acceptance and the parent's merge remain required.

If the next period already has a closed computation, further late corrections
are refused with `METER_CORRECTION_PERIOD_CLOSED`. Choosing a later open target
period needs a separately settled rule; no issued-period envelope is changed.

A later snapshot cannot change a previously closed same-job/day customer or
site binding. The loader refuses that retrospective identity rewrite; future
periods may carry the corrected supplied binding without changing earlier bills.
