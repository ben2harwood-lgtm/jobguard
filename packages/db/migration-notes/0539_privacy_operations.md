# 0539 — M0-13c privacy operations (RED)

Adds four isolated synthetic rehearsal tables and two checked runtime routines.
There are no new runtime table grants, commercial/identity writes, live provider
calls or production deletion adapters. RLS is forced with tenant-qualified keys;
requests and instructions are owner/admin/session checked. `privacy_command` is
append-only; request export payloads are deliberately clearable by deletion.
The same transaction stores receipt, disposition and content-free audit chain event.
Runtime receives only EXECUTE on the two listed synthetic routines. These are new
synthetic privacy authority paths, explicitly inventoried in LP-0.

Fresh install uses the normal directory-discovered registry. The CI suite also
applies every predecessor, preserves an existing tenant through upgrade, and checks
migration rerun. PostgreSQL cannot run in the builder sandbox: these are unexecuted
CI assertions, not a PostgreSQL PASS. Full database/migration, catalog/LP-0 and RED
review gates remain pending. No existing migration is edited.

Forward fix: keep the HTTP flag off, preserve request/command/audit history and add
a later migration. Do not drop tables, erase audit, rewrite 0539 or weaken RLS.
Backups stay retained pending approved expiry. See docs/operations/privacy-operations.md.
