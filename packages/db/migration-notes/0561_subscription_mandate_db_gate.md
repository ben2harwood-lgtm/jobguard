# M4-13 synthetic database gate (RED, `0561_subscription_mandate_db_gate`)

Re-create the latest `0560_subscription_mandate.sql` bodies of `app.m413_command` and `app.m413_read`, adding
only the first-statement database-name check used by other dark routines.
Both raise `SYNTHETIC_MODE_REQUIRED` (`42501`) unless the database is exactly
`jobguard_synthetic_demo`, before authentication, locking, replay or data access.
CREATE OR REPLACE preserves ownership and grants. No schema, terms, mandate or
collection authority is added. Existing fixtures already use that database name.

The explicit empty lp0, upgrade and tenancy proof sections reflect no changes to
their tracked catalog attributes, table rows or policies. The routine bodies are
compared against `0560_subscription_mandate.sql` by the focused deterministic test. The PostgreSQL regression
copies a valid synthetic approval and sessions into another database and checks
read, fresh approval, replay, lifecycle and invalid-session refusals without writes.
Existing M4-13 integration tests remain unchanged.

Forward fix only: preserve immutable history and add a corrective migration.
Do not restore execution outside the demo database. Production gates remain closed;
PostgreSQL fresh-install/upgrade suites and independent RED review remain required.
