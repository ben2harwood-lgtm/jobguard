# LP-1 membership/account boundary v1

Status: implemented in the working tree; **NOT independently verified or accepted**.
Authority: issued LP-1 header/addendum and 15 October continuation, Ben decisions
40/41, BUILD_PLAN.md §§2.4, 11.8 and 12.2, and AGENTS.md §5.13.
Integrated main: `6671538c8d69936c162368c760dd6ce0f7f10493`.
Migration: `0162_membership_account_closed.sql`, registered after 0158.

## Boundary

The application login loses direct creation, identity alteration, promotion,
restoration and deletion on app.account and app.membership. Existing SELECT,
identity operations and permission-check row locks are preserved. Account and
membership values, linked records, receipts, audit history and commercial source
fingerprints must survive refused writes and upgrade.

The whole LP track, exact-commit independent checks, separate technical acceptance
and all other G1 requirements still precede real customer data and commercial sends.
The builder sandbox cannot execute PostgreSQL or browser proofs.

## Integrated mechanism

- Withdraw table INSERT/UPDATE/DELETE and all write-column ACLs on both tables.
  Preserve SELECT and retain only UPDATE(created_at), without grant option.
  This syntactic locking privilege replaces broad UPDATE under §11.8 R1 and
  decision 41. It authorises no mutable business value.
- app.lp1_reject_lock_column_update() is migration-owned SECURITY INVOKER,
  fixed search_path=pg_catalog. It raises SQLSTATE 42501 unconditionally, without
  queries, business writes, configurable bypasses, dynamic SQL or role elevation.
  PUBLIC/runtime/identity/infrastructure have no EXECUTE grant.
- lp1_account_lock_column_immutable and lp1_membership_lock_column_immutable
  are BEFORE UPDATE OF created_at statement triggers. No-op, multi-row and
  empty-set statements fail before row triggers; SELECT FOR UPDATE/SHARE does
  not execute UPDATE triggers. The statement scope is a reversible engineering
  choice within the authorised immutable-column design.
- No table, column, index, backfill, owner, policy, existing lock query, identity
  routine or authority policy changes.
- The four existing synthetic account/member inserts remain on the separate
  owner connection, as jobguard_migration with the appropriate tenant per pair.
  Restore jobguard_runtime before job/receipt seed work. Values, conflict handling,
  target/environment checks and transaction boundaries stay unchanged.

## Separately enumerated Q1/Q3 change set

Decision 40 permits four tenancy callbacks to select a named TEST-ONLY role,
lp1_tenancy_fixture: NOLOGIN, INHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE,
NOBYPASSRLS; runtime membership supplies the existing tenant RLS policies and
SELECT. Its scoped account/membership INSERT/UPDATE/DELETE grants exist only in
the disposable test database. No fixture power is granted to the application
login. The callbacks use an owner-connected pool solely to SET LOCAL ROLE before
all original SQL and assertions; every assertion stays unchanged.

Decision 41 permits the bootstrap switch above and removal of the six obsolete
LP-0 table-write entries. Two contingent column entries record the actually retained
UPDATE(created_at) ACLs, in the existing LP-1 exception group. No other inventory
key or group changes. The receipt lists these bounded changes line by line, as an
independent commit-sized set; grant/lock/seed deployment stays integrated.

## Coordinator holds

Q2: the merged audit-export comparator treats the narrower explicit column ACL
as a new permission. Only the coordinator may make the generic prior-table-coverage
correction and preserve/add its controls. This file/test stays unchanged.

The merged LP-0 exception and reduction controls explicitly expect table privileges
that LP-1 withdraws, and its authority-path example expects a runtime owner insert
to succeed. Those require coordinator dispositions; neither their assertions nor
their setup is changed here. Exact before/after proposals and lines are in the
receipt. Integration acceptance is held; nothing works around these checks.

## Coverage and execution limits

All database tests use generated fixtures and real embedded PostgreSQL 16 with
separately authenticated owner/runtime pools. Runtime SQL is exercised as the
named role and an ordinary inherited login. Owner setup does not change the
runtime's object grants. RLS assertions execute as runtime.

| IDs | New file and coverage | Limit |
|---|---|---|
| AC-01–05 | `lp1-membership-account.integration.test.ts`: direct insert/select/conflict forms; authority-column updates; expired/revoked restoration; delete/truncate; canonical persisted rows; effective grants/role assumption; no-op/multi-row updates and rolled-back side-effect control | Refusal and canonical persisted-state proofs include nonempty linked receipt/audit/head fixtures; database execution pending. |
| AC-06–07 | `lp1-lock-compatibility.integration.test.ts`: all four strengths, both tables, commit/rollback release observed through `pg_blocking_pids`; tenant/context/pool checks; rolled-back restrictive UPDATE policy with SELECT positive control | Database execution pending; authorised Q1 backstop conversion is included. |
| AC-08 | Same file: real member read plus eligibility/message/follow-up entry-point waits behind owner revocation | Full successful commercial/trigger paths and audit ordering still require unchanged regression suites. |
| AC-09 | `lp1-seed.integration.test.ts`: real bootstrap, effective role/session observed before actual SQL, exact four rows, rerun IDs, runtime job continuation, non-superuser owner and FORCE RLS | Conversion included; no SQL results are mocked. Local database execution is unavailable. |
| AC-10 | Same file: invalid environment/target refuses before connection; import has no preparation side effect; focused startup source checks | These checks are limited boundary evidence; not a deployed credential proof. |
| AC-11 | `lp1-upgrade.integration.test.ts`: registered own migration; populated account/member/identity, receipt/audit and commercial source/pack history; named-column/type/identity snapshots; own-step unrelated security; later runner twice | Representative commercial sources and persisted pack fingerprints included; exact helper/trigger catalogue assertions are in AC-04. Database execution pending. |
| AC-12 | Same file: comparator fixtures plus rolled-back PostgreSQL precision/type/add-column/function/later-insert controls using the same comparator | Fixture execution and real PostgreSQL execution are distinct; receipt records each. |
| AC-13–18 | Unchanged named suites, lane/diff evidence, full CI, RED verdicts and separate acceptance | Not completed by new preparatory tests. |

No tests are skipped in source to hide a requirement. Filtered local runs exclude
PostgreSQL tests explicitly and are recorded that way. The own-step proof requires
the real registered migration and does not manufacture a replacement.

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

The integrated implementation is written; rollout remains pending. The grant/lock/seed
group must land together with the authorised fixture/comparator/inventory dispositions
and real execution evidence. Preceding service callers must work without owner
credentials. Forward fixes retain withdrawn powers; restoring broad runtime
writes is not a rollback strategy. A different lock design requires an amended
exact lane before implementation.

LP-1 preserves the existing caller-selected tenant setting. It cannot prove that
a holder of runtime credentials cannot select a false tenant. Session/tenant
binding, worker credentials, finance closure and owner policies belong to later
LP cards. No fee, tax, pricing, membership policy, session lifetime, customer-data
approval or deployment authority changes here.
