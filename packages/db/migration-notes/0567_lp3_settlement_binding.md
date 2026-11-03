# LP-3 settlement binding — 3 November 2026

READY for router commit and the next LP PR; RED (permissions/money).
PR title: `fix(db): bind settlement approval to exact payload, finishes LP-3`.
Independent RED review at the exact head and green CI against current main
remain required before merge. Production and commercial gates remain closed.

The launcher completed the merge of origin/main (c829a9394); the working tree
had no unfinished merge. Local main is stale, so comparisons use origin/main.
Migration `0567_lp3_settlement_binding` replaces the branch-only 0610 stem.
0563–0566 are reserved for #545; the router may renumber by stem at landing.
No earlier migration or legacy proof registry is edited.

The checked settlement routine is rebuilt from main's latest definition in
0519. Its sole body change supplies the independently reconstructed LP-3
payload as the expected approval hash, replacing the authorization's own hash.
Signature, owner, ACL, locks, source-state checks and synthetic database gate
are preserved. The existing mutation boundary also checks the canonical hash,
subject type, revision and recipient. Compatibility fixtures use the exact
settlement hash instead of arbitrary content. No new tables or runtime grants.

The plan-entitlement upgrade test permits exactly the nine-argument checked
settlement overload, identified by its full regprocedure/OID, to change its
body. It asserts the exact old-to-new expression substitution and preserves
all predecessor-body comparisons and routine privilege checks. Proof sections
are empty because effective privileges, catalogue attributes, table data and
tenancy do not change. Forward fix only; no backfill. Defects require another
reviewed forward migration, never restoration of the self-comparison.

Adversarial PostgreSQL tests bypass mutation prechecks for forged hashes,
wrong obligations/amounts, changed events/timestamps, another tenant/actor,
expiry/revocation and policy changes. They cover rollback, duplicate commands,
receipt replay, competing commands and reuse of a settled approval for another
obligation. Forged receipt-state writes use the owner dispatcher; runtime
receives no receipt-write grant. All data is fictional.

Local checks actually run (installed TypeScript 5.8.3 / Vitest 4.1.12):

- In packages/db: `./node_modules/.bin/vitest run --maxWorkers=2
  src/lp3-operation.test.ts src/lp3-mutations.test.ts
  test/migration-proof-loader.test.ts`: 59 LP-3 tests passed; proof-loader
  initially failed during import because core/dist lacked a current export.
- Rebuilt the existing core dependency with `./node_modules/.bin/tsc -p
  tsconfig.json` in packages/core. No dependency download or tracked change.
- Retried `./node_modules/.bin/vitest run --maxWorkers=2
  test/migration-proof-loader.test.ts` in packages/db: PASS, 76 tests.
  Total passing targeted tests: 135.
- In packages/db: `./node_modules/.bin/tsc -p tsconfig.json --noEmit`: PASS.
- Root `./node_modules/.bin/tsc -p
  /tmp/lp3-settlement-binding-typecheck.json --noEmit`: PASS. The temporary
  config extends repository strict settings and checks all three affected
  integration files, including the plan-entitlement upgrade test.
- `node tools/plpgsql-case-in-if-lint.mjs`: PASS, 228 migrations.
- Exact latest-main routine reconstruction comparison: PASS; predecessor
  migration and legacy registry unchanged. `git diff --check`: PASS.
- Working-tree lane equality against origin/main, including untracked files,
  using the existing lane loader and migration-order validator: PASS,
  exactly eight non-lane paths. The lane never lists itself.

PostgreSQL and browser suites were not run: this sandbox cannot start the
server or bind localhost. CI must prove real database behavior, fresh/upgrade
migration safety, catalogue/privilege/tenant invariants and existing journeys,
including activation.integration.test.ts, lp3-activation-acceptance.integration.test.ts,
lp3-upgrade.integration.test.ts and
plan-entitlement-lifecycle-upgrade.integration.test.ts. Source inspection and
unit execution are not independent verification. No git writes, fetches,
pushes, PR creation, real providers or real customer data were used.
