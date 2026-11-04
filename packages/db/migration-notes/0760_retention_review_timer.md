# 0760 — synthetic retention review timer (M4-20 remains open)

Adds two infrastructure-only SECURITY DEFINER routines, with EXECUTE as the only
new grant. No role or table is added. FORCE RLS remains in force; discovery walks
control-plane tenant IDs, installs one tenant context at a time and restores the
caller value on success/error. It returns only tenants with a current due,
unreviewed condition. Its date predicate is a discovery filter; core remains the
execution rule engine under the existing 753 job lock.

`retention_timer` lists tenant book IDs, prepares a locked book and appends only
an exact timer review for a current due condition. It verifies hash, shape,
database date, profile identity and condition uniqueness; there is no actor,
resolution, satisfaction, approval, commercial send or money write parameter.
The existing actor column becomes nullable with a check permitting null only for
timer reviews. No column is added; existing row values and hashes are untouched.
No backfill is needed. Human append/session validation stays unchanged.

One Graphile discovery owner runs only in `synthetic_demo`; other environments
register neither task nor schedule. Queue keys bind tenant and database minute.
Execution rechecks the current book: two workers serialize, crashes before commit
roll back the review and audit together, retries after commit skip existing
profile/condition reviews. Each book commits separately so later failures are safe
to retry. Date revisions need fresh reviews; core refuses releases based on stale
approvals. Reviews remain proposals until explicit human resolution.

Forward fix preferred: disable the synthetic worker schedule, then use a reviewed
follow-up migration. Do not delete immutable reviews or audit. Removing EXECUTE
from the two new routines stops timer writes without changing stored histories.

CI must run real PostgreSQL fresh/upgrade, LP-0 and tenancy proofs plus
`retention-review-timer.integration.test.ts` and the existing retention suite.
Local sandbox cannot start PostgreSQL or bind localhost. Exact-head independent
RED review remains required. D02, D06 v2, demand after pilot and G0–G5 remain closed;
RETENTION_BALANCES_ENABLED stays false. No HTTP/screen, notices, invoices, M4-21,
ledger, receipt, fee or collection composition is enabled.

## Local validation — 4 November 2026

Installed TypeScript 5.8.3: DB compilation and API/config/core/storage/AI/web
`--noEmit` checks passed. DB compilation refreshed the ignored build output so
API unit imports exercised the changed public repository implementation.
`pnpm typecheck` itself could not start: the installed pnpm launcher tried to
resolve the pinned version via the unavailable registry; installed binaries were
used directly, without installing dependencies.

Installed Vitest 4.1.12, `--maxWorkers=2`, package working directories:
- API `retention-review-task.test.ts`, `watchdog-registry.test.ts`,
  `auth/context-boundary.test.ts`: 280 passed.
- API `auth/identity.test.ts`: 7 passed.
- DB `migration-proof-loader.test.ts`, `retention-record-repository.test.ts`:
  84 passed.

`node tools/agent-lane-boundary-lint.mjs` and `git diff --check` passed.
The new real-PostgreSQL timer suite and all database migration/catalogue/tenancy
checks remain CI work, not local passes. No browser or database was started.
No fetch, commit, push, PR, main catch-up or release was performed.
