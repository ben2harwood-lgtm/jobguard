# 0666: locked Final Check evidence invalidation

LATER-SAFETY-113 / LATER-SAFETY-113-CATCHUP (RED).
Renumbered from branch-only 0842 by filename stem for the reserved landing slot
in the coordinator migration ledger. Migration SQL is byte-identical.

Adds the private `app.refuse_final_check_locked_invalidation()` trigger function
and `b_final_check_locked_invalidation` BEFORE INSERT trigger. The existing
`a_final_check_invalidation` serializer runs first. Evidence bound to the locked
manifest cannot be invalidated; pre-lock and unrelated evidence retain their
existing behavior. No existing routine is replaced, no historical rows are
rewritten, and main's LP-6b definitions remain unchanged.

The launcher merge already contains current origin/main. This catch-up retains
its exact union and all existing test expectations; only the migration identity
in the regression test changes. Proof metadata moves with the migration. The
migrator discovers it automatically, and upgrade tests load its proof and pin
new routine bodies from that source, with no separate numbered list row.

Installation is transactional. A failed installation rolls back; after success,
use a reviewed forward migration rather than dropping the protection.

Local verification: installed TypeScript compiler and bounded Vitest runs are
recorded in the commit handoff. PostgreSQL integration, migration upgrade and
browser checks remain for GitHub CI because this sandbox cannot start PostgreSQL
or bind localhost. The prior check PASS does not establish review of this head.
