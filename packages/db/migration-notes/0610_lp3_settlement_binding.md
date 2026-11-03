# LP-3 settlement binding — catch-up, 3 November 2026

READY for router commit; RED (permissions/money), NOPR=1. LP-3 #414 is
already on main. Independent review at the exact head and green current-main
CI remain required before merge. G0–G5 remain closed.

Migration `0610_lp3_settlement_binding` replaces this branch's reserved
`0604_lp3_settlement_binding` stem. Its routine is rebuilt from the latest
checked settlement body on origin/main (bc8993090), in 0519. The sole body
change supplies the independently reconstructed LP-3 payload as the expected
approval content hash instead of reading that hash from the authorization
itself. The CREATE OR REPLACE declaration preserves the existing signature,
owner, grants, locks, synthetic database restriction and source-state checks.
The 0519 migration and legacy-migrations.json are byte-for-byte main's copies.
No other piece's lane file differs from main.

The existing LP-5 command-authority registry already includes
synthetic.settlement. No registration, permission or new behavior was added
in this catch-up. Existing command completion continues through main's
checked command/audit path, including app.lp4_seal_audit; this migration adds
no audit writer and does not replace the underlying legacy overload.

The branch's original mutation guard, canonical hash fixtures and adversarial
tests are retained. The approval binds tenant, actor, obligation, provider
event, amount, GBP, illustrative policy and exact millisecond timestamp using
the existing lp3MutationHash codec. Old arbitrary hashes fail closed and need
a fresh exact approval; no historical approvals or money are rewritten.
Tests cover other obligations/amounts, arbitrary content hashes, changed
payload, expiry/revocation, rollback, receipt replay and competing commands.
The database behavior is source-inspected, not test-executed here.

The proof explicitly declares empty lp0, upgrade and tenancy sections: no
routine identity, owner, ACL, definer, search path, table, policy or historical
row changes. Existing LP-3 upgrade tests discover the forward migration.
Forward fix only: correct defects through another reviewed migration, never
restore the self-comparison. No backfill or new operational alert is needed.

Local checks actually run, using installed Vitest 4.1.12 and TypeScript:

- packages/db: ./node_modules/.bin/vitest run --maxWorkers=2
  src/lp3-operation.test.ts src/lp3-mutations.test.ts
  test/migration-proof-loader.test.ts — PASS, 135 tests across three files.
- packages/db: ./node_modules/.bin/tsc -p tsconfig.json --noEmit — PASS.
- Root TypeScript runner with /tmp/lp3-settlement-binding-typecheck.json,
  extending the repository strict config and including both changed
  integration-test files — PASS.
- node tools/plpgsql-case-in-if-lint.mjs — PASS, 221 migrations.
- Working-tree lane equality against origin/main (including untracked new
  files), using the repository lane-policy loader and migration-order
  validator — PASS, exactly seven non-lane paths; only this piece's lane
  differs from main. Local main is stale, so origin/main is the merged base.
- Exact reconstruction comparison with main's latest 0519 body, protected
  predecessor/legacy registry comparison, and git diff --check — PASS.

PostgreSQL, fresh/upgrade database suites, full CI and browser journeys were
not run: this sandbox cannot start PostgreSQL or bind localhost. The router
must obtain those CI results and the independent RED review after pushing.
No git write, fetch, push, PR, real provider/customer data or paid call occurred.
