# LATER-SAFETY-17 — synthetic v1 reversal money rules (RED)

Landing base: `b0ae55c4686861e61af7b6b2b759ecdcb425205e` (`origin/main`),
merged cleanly by the launcher at `da175cc55`. Main's highest migration is
0652; this piece is renumbered by stem from 0793 to 0654 with SQL unchanged.
The local `main` branch is not the comparison base.
Main already contains 0631's cumulative reversal fix and settled-plan credit
check. 0654 remains necessary for reversal replay and policy-specific cap
selection; no migration added by this group is already on main.

0654 recreates only main's latest reversal body from
`0631_legacy_recovery_money_integrity.sql`, preserving signature, owner,
search path, grants, database-mode refusal, tenant check, allocation checks,
review insertion, cumulative reversal calculation, settled-plan credit and
linked compensation behavior. The routine-to-main diff adds only the group's
replay lock/checks and v1 cap selector. Approval's latest body is unchanged.
The TypeScript posting port already returns the stored function result.
Matching identity/allocation/amount retries return the original derivation
without writes; conflicts return 23514. A tenant/reversal advisory lock
serializes first use and retries even across different allocations/jobs; the
existing allocation/job locks still serialize fee recomputation. This additional
lock prevents a concurrent conflicting identity from falling through to a raw
primary-key error. No real fee rail, policy decision, provider or release gate
changes.

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
The historical defect control executes the exact 0356 body inside a savepoint:
400000p allocated less 100000p and 150000p reversed should leave 150000p;
the predecessor instead records 250000p. Rolling back the control and applying
the new body must produce 15000p fee, 7100p liability and -13200p compensation.
The same regression now also covers an unsettled plan: liability stays 15000p
with zero plan credit and the same -13200p compensation. This preserves main's
0631 behavior. These are CI assertions, not locally observed database results.

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

## Landing reconciliation

The exact reversal signature in
`plan-entitlement-lifecycle-upgrade.integration.test.ts` now binds its body to
0654; the approval signature remains bound to 0631. Full body comparisons,
owner/ACL comparisons and every other mainline exception remain intact.
No new table or registry rows are introduced, so no row lists change.
MIGFIX-7 now pins the exact reversal identity and full 0654 body in its
successor replay, preserving all metadata and unrelated-body comparisons.
MIGFIX-6 continues to bind its own 0631 step and then exercises reversals
after replaying all successors. No snapshot check is removed or weakened.
The lane includes every changed path against origin/main except lane files,
and does not list itself. It also permits removal of the three old 0793
paths because local lint inspects these tracked removals before commit. Git metadata is read-only; the router commits and
pushes this handoff, then CI and exact-head RED review gate landing.

Forward-only upgrade; no data backfill or columns. Do not roll back financial
history. If a later defect is found, ship a reviewed forward function replacement
and explicit linked compensations where needed. This finishes no plan piece.
