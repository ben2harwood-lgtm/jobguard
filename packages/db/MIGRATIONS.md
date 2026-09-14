# Database migration strategy

`0000_tenancy.sql` is the M0-4 fresh-install baseline. It is intentionally
idempotent so an existing M0-1 database (which had no application tables) can be
upgraded safely. Tests execute it both fresh and a second time.

The migration creates roles but does not create production login credentials.
Deployment must grant the non-login `jobguard_runtime` role to a separately
managed application login. The migration owner remains separate from runtime.

This foundation migration is forward-fixed rather than rolled back: dropping
RLS, tenant columns, schemas, or roles could expose or destroy tenant data. A
failed transaction leaves the previous state intact; corrections ship as a new,
reviewed migration.

RLS is a defence within a correctly verified tenant context. It does not protect
against a compromised owner/migration connection or an application bridge that
is allowed to manufacture a false verified context.

`0002_evidence.sql` is the forward-only M0-11 evidence-storage migration. It adds
RLS-protected upload, immutable object-registration, and authorized-link tables.
An interrupted migration rolls back transactionally; corrections are forward fixes
because removing evidence identity or object-version references would weaken proof.
Object bytes remain private and versioned outside PostgreSQL. Object Lock/WORM is
intentionally not enabled pending the retention/deletion decision.

`0004_ledger.sql` is the forward-only M0-10 ledger migration. Posted journals
and lines are immutable; corrections are linked reversing journals. Deferred
triggers validate whole-journal balance and matching audit provenance at commit.
Production chart mappings and recovery-fee posting remain disabled pending D02,
the fee decisions, and the qualifying-landing implementation. Corrections are
forward fixes, never destructive rollback.

`0005_commands.sql` is the forward-only M0-8 command/authorization migration.
It adds tenant-protected immutable decisions and resolutions, exact revocable
authorizations, and durable semantic command receipts. It also adds membership
expiry/revocation timestamps. An interrupted application rolls back as one
transaction; corrections are forward fixes because removing receipts or grants
would destroy authorization evidence. Standing and unattended authorization is
deliberately excluded from the database until its later policy gate is approved.

## 0006_outbox.sql

Adds tenant-protected outbox, immutable attempt history, and provider-event inbox tables. A trigger writes only tenant/action routing identifiers to an infrastructure projection in the same transaction; the Graphile connection can read that projection but has no `app` schema access. Forward-fix rollback: stop dispatchers, preserve action/attempt/event records for audit, and deploy a corrective migration; do not drop delivery history after use.

## 0007_capture.sql
Adds immutable, tenant-owned capture sources and cited job-record proposals. The forward fix is a later numbered migration; captured source/proposal records must never be rolled back by mutation. Runtime receives only `SELECT`/`INSERT`, and both new tables use enabled and forced RLS with `WITH CHECK` policies. Proposal lines reserve existing job-spine scope identities but do not create canonical revisions.
