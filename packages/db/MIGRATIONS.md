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
## 0001 evidence storage

`0001_evidence.sql` adds tenant-owned upload, immutable evidence registration,
deletion-request, and export-request metadata. It is additive and can be applied
after `0000_tenancy.sql`. Rollback is deliberately a reviewed forward fix once
evidence rows exist: dropping these tables could detach private object versions.
Before real-data activation, an empty development database may be reset instead.

Retention periods and destructive retained-object deletion remain disabled while
D07 is proposed. This migration does not enable WORM or Object Lock.
