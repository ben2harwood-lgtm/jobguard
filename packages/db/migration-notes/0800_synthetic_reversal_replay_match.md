# LATER-SAFETY-30 — synthetic reversal replay payload binding (RED, NOPR)

Source inspection confirms the fault in 0793: a repeated reversal identity checks
allocation and amount but silently accepts changed reason, derivation and journal
identities. 0793 is the latest routine body in this worktree (merged at
32a8f30df from cb0e9cd9). 0800 copies that body and changes only the replay guard:
stored reason and derivation identity must match; any compensation journal for
that derivation must have the requested journal identity. Missing derivation or
any mismatch raises the existing `invalid reversal` / 23514 error before writes.
An exact replay returns the stored derivation. When no compensation exists,
there is no stored journal identity to bind.

Signature, owner, EXECUTE grants, SECURITY DEFINER/search_path, synthetic database
and tenant guards, advisory lock, allocation/job locks, v1 cap selection,
cumulative reversal subtraction, fee arithmetic, reviews and compensations are
unchanged. No tables, columns, policies, metadata or recorded catalog facts
change: proof sections lp0, upgrade and tenancy are explicitly empty, authored
from source rather than derived from a database. No backfill or external action.
This affects only existing synthetic v1 data, not production policy or fee rails.

Regression tests were written before the replacement. New cases compare full
rows in landing_reversal, recovery_fee_derivation, recovery_review and
recovery_fee_journal after exact replay and after each separately changed reason,
derivation or compensation journal, and after another tenant retries the ID.
A no-compensation reversal covers the conditional journal rule. The only edit to
the pre-existing LATER-SAFETY-17 case is the router-authorized fresh-identity retry:
23514 with unchanged counts; its exact-identity concurrent replay still succeeds.
PostgreSQL execution, including failing-first evidence, is deferred to CI because
this sandbox cannot start a database or bind localhost. Local checks and their
results are recorded in the router commit message.

## Named holds for landing

- The existing plan-entitlement-lifecycle-upgrade integration test compares the
  predecessor reversal body unchanged across all successors. Its exact named
  exception must bind only `app.reverse_synthetic_landing(uuid,uuid,uuid,uuid,uuid,bigint,varchar)`
  to 0800's full body, retaining ACL/owner and all other routine checks. This
  scanner/pin edit is outside this piece's allowed files and is not made here;
  it supersedes the same named hold in 0793's notes.
- CI must run recovery.integration.test.ts, the PostgreSQL migration/catalog and
  upgrade suites, and required repository checks; exact-head independent RED
  review is still required before merge. No database pass is claimed locally.
- Full lane lint against origin/main currently includes the already merged
  later-safety-17 changes, outside this lane. Router must use the appropriate
  caught-up base at landing; working-tree paths are checked separately. Do not
  widen this lane to absorb predecessor or unrelated changes.

Forward-only function replacement; no financial history rollback. Any correction
requires a reviewed forward migration, with linked compensations if applicable.
Renumber only the migration filename stem and its references at landing.
