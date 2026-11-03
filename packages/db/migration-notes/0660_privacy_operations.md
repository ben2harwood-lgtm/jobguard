# M0-13c — M0-13c privacy operations (RED)

Adds four isolated synthetic rehearsal tables and two checked runtime routines.
There are no new runtime table grants, commercial/identity writes, live provider
calls or production deletion adapters. RLS is forced with tenant-qualified keys;
requests and instructions are owner/admin/session checked. `privacy_command` is
append-only; request export payloads are deliberately clearable by deletion.
The same transaction stores receipt, disposition and content-free audit chain event
through `app.lp4_seal_audit` with `checked_operation` trust; no direct audit writes.
Runtime receives only EXECUTE on the two listed synthetic routines. These are new
synthetic privacy authority paths, explicitly inventoried in LP-0.

Fresh install uses the normal directory-discovered registry. The CI suite also
applies every predecessor, preserves an existing tenant through upgrade, and checks
migration rerun. PostgreSQL cannot run in the builder sandbox: these are unexecuted
CI assertions, not a PostgreSQL PASS. Full database/migration, catalog/LP-0 and RED
review gates remain pending. No existing migration is edited.

Forward fix: keep the HTTP flag off, preserve request/command/audit history and add
a later migration. Do not drop tables, erase audit, rewrite `0660_privacy_operations.sql` or weaken RLS.
Backups stay retained pending approved expiry. See docs/operations/privacy-operations.md.

Batch-12 union (3 November 2026): keeps both outbound and dark-privacy environment
settings; SQL bytes are unchanged. Existing batch migrations stay at
`0658_deepgram_fixture_transcripts` and `0659_restore_reconciliation`; this migration
and all its proof/note/test references use `0660_privacy_operations`. All four new
empty app tables are registered for predecessor snapshot comparisons.

Local verification uses installed Vitest 4.1.12 with `--maxWorkers=1`: core privacy
(3 tests), API privacy (5 tests, after rebuilding the stale core dependency), and
migration-proof loader (76 tests) passed. Core, database and API TypeScript checks passed,
as did the core/database builds, PL/pgSQL lint and six foundation/ops Node tests.
OpenAPI check passed via `node --import tsx src/generate-openapi.ts --check`
with a temporary source-mapping tsconfig, avoiding the sandbox-blocked tsx CLI socket
and stale generated workspace imports. No PostgreSQL
or browser was started. CI must prove fresh/upgrade migrations, privacy integration,
RLS/privileges, audit/replay, full required suites and affected journeys. The router
must first catch up the existing branch with current main's MON-8 and LP-5c changes;
this catch-up makes no edits to their main migrations. Independent RED review remains
required at the final head.
