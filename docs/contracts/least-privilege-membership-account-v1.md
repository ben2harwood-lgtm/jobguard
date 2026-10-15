# LP-1 membership/account boundary v1 — preparatory contract

Status: **PARTIAL; implementation HELD, not independently verified or accepted.**
Authority: issued LP-1 header/addendum (13 October, updated 15 October 2026),
`BUILD_PLAN.md` §§2.4, 11.8 and 12.2, and `AGENTS.md` §5.13.
Inspected base: `9865e4b32b71c75b763240bcdf27bd6a75b42f34`.
Reservation: `0162_membership_account_closed.sql`; **that file does not exist**.
During verification `origin/main` advanced to `6671538c8d69936c162368c760dd6ce0f7f10493`
(ENT-5b / 0158). Its membership readers and grants were source-inspected; no
account/membership grant or seed change appeared in that landing. The dispatcher
must integrate and rerun against that newer main before landing this branch.

## Adopted result and current state

The application login must lose direct creation, identity alteration, promotion,
restoration and deletion on `app.account` and `app.membership`. Existing identity
operations and permission-check row locks must continue working. Account and
membership state, linked records, receipts and audit history must survive refused
writes and the upgrade. Synthetic bootstrap preparation must use separate owner
credentials for its existing four rows, explicitly outside service startup.

These are requirements, not implemented guarantees. Main still has the broad
grant in migration 0000, and bootstrap still selects runtime before the four
inserts. Migration 0150 already refuses several membership authority changes;
that narrower guarantee does not implement LP-1's account/grant closure.

The whole LP track, exact-commit independent checks, separate technical acceptance
and all other G1 requirements precede any real customer data or commercial send.
Green preparatory checks cannot open that gate.

## Held design and authorization

**Q1 remains HELD:** choosing a non-owner fixture role and its powers for merged
tenancy assertions needs Ben's ruling and an exact revised lane. This piece does
not create that role, change assertions, or substitute superuser execution for
RLS assertions.

**Q3 access treatment remains HELD:** the addendum identifies standard F but does
not confirm the immutable-column reduction. Migration, runner registration and
four-row seed conversion form one integrated group; none is implemented here.
No alternative narrow lock routine or caller conversion is authorized here.

If released separately, the proposed mechanism is:

- Preserve SELECT. Withdraw table INSERT/UPDATE/DELETE and any other write-column
  ACL on both tables. Retain only `UPDATE(created_at)`, without grant option,
  contingent on the R1 immutability proof and Q3 ruling. This is a syntactic
  locking privilege, not a completely SELECT-only ACL.
- Add `app.lp1_reject_lock_column_update()` as a migration-owned SECURITY INVOKER
  trigger routine with fixed `search_path=pg_catalog`; no business writes, dynamic
  SQL, owner assumption or bypass. Raise stable SQLSTATE `42501` on every selected
  column update, including `created_at=created_at` and multi-row updates.
- Add `lp1_account_lock_column_immutable` and
  `lp1_membership_lock_column_immutable` as BEFORE UPDATE OF created_at triggers.
  Revoke helper EXECUTE from PUBLIC, runtime, identity and infrastructure; grant
  no application entry point.
- Preserve owners, policies, FORCE RLS, row values, tenant-qualified references,
  existing identity routes and all current lock SQL. Add no table, column, index
  or backfill. No direct write power is introduced under standard F.
- Bootstrap's separately authenticated owner client remains migration for the
  two account/member pairs, with the correct transaction-local tenant per pair;
  restore runtime before existing job/receipt seed work. Preserve all values,
  conflict handling, target checks and transaction boundaries.

Q2 has a technical disposition only: an explicit column ACL previously covered
by an equivalent table ACL is a reduction. The coordinator must correct the
merged audit-export comparator generically while retaining its widening controls.
This lane does not edit that comparator. LP-0 also enforces removal of stale
inventory entries; coordinator-owned inventory changes are a future integration
prerequisite. This piece does not update its pinned entries.

## Preparatory coverage

All database tests use generated fixtures and real embedded PostgreSQL 16 with
separately authenticated owner/runtime pools. Runtime SQL is exercised as the
named role and an ordinary inherited login. Owner setup does not change the
runtime's object grants. RLS assertions execute as runtime.

| IDs | New file and coverage | Limit |
|---|---|---|
| AC-01–05 | `lp1-membership-account.integration.test.ts`: direct insert/select/conflict forms; authority-column updates; expired/revoked restoration; delete/truncate; canonical persisted rows; effective grants/role assumption; no-op/multi-row updates and rolled-back side-effect control | Intended refusal assertions fail against preceding grants; Q3 post-change proof pending. Linked receipt/audit snapshots include empty sets in this fixture. |
| AC-06–07 | `lp1-lock-compatibility.integration.test.ts`: all four strengths, both tables, commit/rollback release observed through `pg_blocking_pids`; tenant/context/pool checks; rolled-back restrictive UPDATE policy with SELECT positive control | Database execution pending; Q1 inherited backstop conversion pending. |
| AC-08 | Same file: real member read plus eligibility/message/follow-up entry-point waits behind owner revocation | Full successful commercial/trigger paths and audit ordering still require unchanged regression suites. |
| AC-09 | `lp1-seed.integration.test.ts`: real bootstrap, effective role/session observed before actual SQL, exact four rows, rerun IDs, runtime job continuation, non-superuser owner and FORCE RLS | Conversion HELD; no SQL results are mocked, but local database execution is unavailable. |
| AC-10 | Same file: invalid environment/target refuses before connection; import has no preparation side effect; focused startup source checks | These checks are limited boundary evidence; not a deployed credential proof. |
| AC-11 | `lp1-upgrade.integration.test.ts`: explicit missing-migration assertion; populated account/member/identity, receipt/audit history; named-column/type/identity snapshots; own-step unrelated security; later runner twice | Own migration absent/HELD. Representative commercial-document fingerprints and exact helper/trigger delta proof remain incomplete. |
| AC-12 | Same file: comparator fixtures plus rolled-back PostgreSQL precision/type/add-column/function/later-insert controls using the same comparator | Fixture execution and real PostgreSQL execution are distinct; receipt records each. |
| AC-13–18 | Unchanged named suites, lane/diff evidence, full CI, RED verdicts and separate acceptance | Not completed by new preparatory tests. |

No tests are skipped in source to hide a held requirement. A filtered local run
excludes PostgreSQL tests explicitly and is recorded that way. The future own-step
test requires the real registered migration and does not manufacture a replacement.

## Upgrade rule

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

Snapshots select `row_to_json(t)::text` over exactly the captured pre-existing
column names, with `format_type(atttypid,atttypmod)` captured independently. Match
rows by captured primary keys. Every compared table must have a pre-existing row;
later inserts are ignored, while missing originals fail. Controls change a stored
time by one microsecond and retype an existing column (must fail), then add a
nullable scratch column, replace a scratch function and insert a later row (must
pass). Each real database control rolls back. The scratch table is not a
fingerprinted business table.

## Rollout, forward fix and limits

Implementation and rollout remain pending. The released grant/lock/seed group
must land together with the authorized fixture/comparator/inventory dispositions
and real execution evidence. Preceding service callers must work without owner
credentials. Forward fixes retain withdrawn powers; restoring broad runtime
writes is not a rollback strategy. A different lock design requires an amended
exact lane before implementation.

LP-1 preserves the existing caller-selected tenant setting. It cannot prove that
a holder of runtime credentials cannot select a false tenant. Session/tenant
binding, worker credentials, finance closure and owner policies belong to later
LP cards. No fee, tax, pricing, membership policy, session lifetime, customer-data
approval or deployment authority changes here.
