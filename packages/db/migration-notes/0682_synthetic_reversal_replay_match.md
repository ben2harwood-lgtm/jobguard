# LATER-SAFETY-30 — synthetic reversal replay payload binding (RED, NOPR)

Source inspection confirms the fault in 0654: a repeated reversal identity checks
allocation and amount but silently accepts changed reason, derivation and journal
identities. 0654 is the latest routine body on current origin/main (including LP-6b). 0682 copies that body, preserving
its settled-plan credit check and cumulative reversal calculation, and changes only the replay guard:
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
results are recorded in the router commit message. The catch-up adds a source
comparison in migfix-6.test.ts: removing exactly the reason, derivation and
compensation-journal replay guards must reproduce 0654's routine byte for byte.
It failed against the old 0682 monetary calculation before the repair.

## Named holds for landing

- Landing catch-up applies the supplied precheck patch: migfix-6 compares against
  0654; plan-entitlement-lifecycle-upgrade pins the exact reversal body to 0682;
  migfix-7-upgrade adds that same exact body after its 0658 entry. Every other
  routine, ACL and owner assertion is retained. Migration SQL is byte-identical
  to the built branch; only its stem, proof, note and references move to 0682.
- CI must run migfix-6.integration.test.ts (including "partial reversal preserves
  liability without settled plan credit"), migfix-6-upgrade.integration.test.ts,
  recovery.integration.test.ts (including LATER-SAFETY-30's replay cases), the PostgreSQL migration/catalog and
  upgrade suites, and required repository checks; exact-head independent RED
  review is still required before merge. No database pass is claimed locally.
- The lane lists every changed file against current origin/main, excluding
  config/lanes/. No predecessor or unrelated change is included.

Forward-only function replacement; no financial history rollback. Any correction
requires a reviewed forward migration, with linked compensations if applicable.
Renumber only the migration filename stem and its references at landing.
