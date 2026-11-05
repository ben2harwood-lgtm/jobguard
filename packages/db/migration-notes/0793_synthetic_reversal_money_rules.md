# LATER-SAFETY-17 — synthetic v1 reversal money rules (RED, NOPR)

Base: `41cfa65b454eefe7c9b9a2bfcdd0172e51defe28`, also the local
`origin/main` observation. Grepping all base migrations finds the latest
`reverse_synthetic_landing` replacement in `0356_unchecked_job_doors.sql`.
The local `main` branch is stale; it was not used as the implementation base.

All three source findings remain: the reversal reads an unfiltered cap, rejects
an existing reversal identity, and subtracts only the current amount rather than
every job reversal. Approval's latest body in 0356 is unchanged. The TypeScript
posting port already returns the stored function result and needs no change.

0793 recreates only that latest reversal body, preserving signature, owner,
search path, grants, database-mode refusal, tenant check, allocation checks,
review insertion and linked compensation behavior. It selects the v1 cap and
subtracts all reversals, including the just-inserted reversal, once. Matching
identity/allocation/amount retries return the original derivation without writes;
conflicts return 23514. A tenant/reversal advisory lock serializes first use and
retries even across different allocations/jobs; the existing allocation/job locks
still serialize fee recomputation. This additional lock is needed to avoid a
concurrent conflicting identity falling through to a raw primary-key error.
No real fee rail, policy decision, provider or release gate changes.

No catalog facts tracked by LP-0, upgrade metadata or tenancy change: the proof
has explicit empty lp0, upgrade and tenancy sections. The recorded function
hash is null, and static app calls/writes remain the same. No inventory or
SERIOUS-B5 allowance change is needed, and no proof was derived from a database.

Regression cases were written before the migration. The real-PostgreSQL cases
cover concurrent first use and replay, original derivation return, unchanged
reversal/derivation/review/journal counts, conflicting amount/allocation/job,
a new ID on an already-reversed allocation, foreign allocation and tenant
mismatch, policy-specific cap selection, populated-history/ACL preservation,
and two partial reversals on separate allocations.
The predecessor control executes the exact 0356 body inside a savepoint:
400000p allocated less 100000p and 150000p reversed should leave 150000p;
the predecessor instead records 250000p. Rolling back the control and applying
the new body must produce 15000p fee, 7100p liability and -13200p compensation.
These are CI assertions, not locally observed database results.

Today's `cap_snapshot` has both tenant/job and tenant/activation uniqueness,
so two policy snapshots are currently unreachable through the supported schema.
The cap test uses a rollback-only hostile fixture: removes those two constraints,
loads another-policy snapshot ahead of v1 using the existing legacy-fixture
replication bypass, restores normal trigger execution, then calls as runtime.
The transaction rolls back the entire fixture and verifies constraint restoration.
No production constraint is removed or migration schema widened.

## Validation

Local commands and final results are recorded in the router commit message.
No PostgreSQL or browser was started: this sandbox cannot bind localhost.
Vitest collection proves discovery of the new cases, not their execution.
CI must execute recovery, recovery-allocation-upgrade, lp-job-doors-upgrade and
lp-practice-doors unchanged, plus normal database/migration/catalog gates and
required CI checks. Exact-head independent RED review remains required.

## Named holds for landing

- `packages/db/test/plan-entitlement-lifecycle-upgrade.integration.test.ts`
  compares predecessor routine bodies across all later migrations. It needs an
  exact named exception binding only this reversal signature to 0793's body,
  retaining owner/ACL and every other body comparison. This pin/guard edit is
  outside the allowed files and has deliberately not been made. The own-step
  regression here checks history and metadata preservation, but does not waive
  that gate. No other scanner or pin edit has been identified.
- Run the full lane CLI after the router commits: before commit HEAD equals
  origin/main, so it refuses self-comparison. The working-tree paths can be
  checked using its existing lane matcher. Renumber only filename stems if the
  router reserves a new landing number, including the test's migration URL.

Forward-only upgrade; no data backfill or columns. Do not roll back financial
history. If a later defect is found, ship a reviewed forward function replacement
and explicit linked compensations where needed. This finishes no plan piece.
