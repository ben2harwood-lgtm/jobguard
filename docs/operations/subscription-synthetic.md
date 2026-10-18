# MON-2A hypothetical subscription operations

This piece exposes pure reference calculations and schemas only. It registers
no HTTP route, scheduler, database migration, business routine, payment adapter
or provider connection. Do not describe its calculated principal as an amount
due. Label any consuming fixture **hypothetical; principal only, VAT not
calculated**. Production and pilot settlement remain disabled; no pilot job is
retrospectively billed.

For local fixtures supply all 28–31 calendar dates and unambiguous day-end plans
to `computeSubscriptionPeriod`. The input uses MON-1's actual supplied-period
schema, not a cached counter or an event stream. It is not evidence of an issued
bill. Changes to source events or company authority require the separately
released executable meter adapter. Annual-prepaid flags are supplied reference
inputs, not payment evidence; annual selection remains unavailable.

The nine exact card fixtures and generated timelines run in
`subscription-period.test.ts`; detector inputs name adjacent explicit periods.
The pure calculator has no access to hidden signals. Its transitive module
isolation assertion currently fails on MON-1's activation-policy import; hold
technical acceptance until the parent owner supplies an isolated seam.

Catalogue SQL 0166 is allocated but stopped before implementation: coordinator
review of the LP-0 capability inventory is required. No grants or data changes
need rollback. Once released, install prior migrations, snapshot populated rows
by captured primary keys and named columns as canonical JSON text, apply N
alone and compare existing rows/permissions/routines. Then apply every later
migration and require repeat migrate success twice. Preserve original column
names and full `format_type` types; ignore later rows/columns/functions outside
the captured identities. Include rolled-back microsecond/retype/deletion
negative controls and nullable-column/function-replacement/later-insert positive
controls. At least one original row is required for each compared table. This
is a requirement for the future real PostgreSQL proof, not a run receipt.

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

Future execution must derive and durably surface meter cache mismatches and
maximum breaches without issuing/settling the invalid amount; agree the alerts
and ownership when that execution is released. No operational alerts are
installed now. Future correction handling must preserve issued history and
await Q5; unknown payment results must reconcile the same approved attempt,
never blindly start a second attempt. Those paths are not implemented here.

Before any later release, resolve Q3–Q9 as applicable, review exact actor/tenant
SQL checks and lock ordering before audit, implement immutable statement and
payment identities, and run the unchanged aggregate CI gates. Do not create a
second platform-statement namespace or use subscription money as recovery proof.
D09/D05/D02 and G4-S still gate production collection and live providers.

The dispatcher owns the commit, push and CI run; a different model supplies the
exact-commit verdict and a separate actor supplies acceptance. The builder's
receipt is partial evidence only. Parent merge and reconciliation precede a PR.
