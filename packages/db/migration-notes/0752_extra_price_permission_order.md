# LATER-SAFETY-183 — pricing permission precedes target-origin lookup

RED: database permission / information disclosure. Bounded ENT-5 pricing leaf,
synthetic data only, NOPR. Inspected HEAD and local origin/main both at
`03c85eac36ec7f8b15e72c60b1025d03e3eb0eb6`; no fetch or Git writes.
The issued brief supplies ownership reconciliation; the local running queue
contains this exact leaf. No other owner or intervening xa_price recreation was
found in this checkout. Latest body is 0749_lp6d_remaining_routines.sql.

## Admission inspection and bounded change

ExtraApprovalRepository.priceExtra/reviseExtra parse strict schemas, bind the
caller, check the existing approval_chains entitlement, then call
beginRepositoryCommand before xa_price. This is a repository/SQL boundary issue,
not merely a route issue. The effective begin_command is 0724's body:
`lp5b_contractor_permission` runs inside `IF claimed IS NULL` for replay; a fresh
repository command inserts its processing receipt and lifecycle claim and returns
`claim` without that pricing check. Completion checks it again, after the writer.
0749's lp5b_contractor_permission does check extra.price for both types, but this
is not a fresh-admission pre-gate. xa_begin checks binding, entitlement, mode,
receipt, locks and contractor job, then the old xa_price looks up extra_origin
before rejecting a caller without pricing permission. Source inspection therefore
supports the reported fresh-command distinction; it is not executed PG proof.

0779 copies the complete 0749 xa_price definition and moves only its existing
comment and xa_covers/PERMISSION_DENIED guard immediately after xa_begin. The
LP6D prefix is byte-identical. Job validation, locks, receipt checks, amount limit,
revision/duplicate guards, immutable provenance, completion binding and business
writes are unchanged. CREATE OR REPLACE retains owner and ACLs; signature,
VOLATILE, SECURITY DEFINER and search_path are unchanged. No new permission,
role, grant, policy, framework, audit behavior or feature switch. The separate
issueClientApproval pre-read is untouched.

The explicit proof has empty lp0, upgrade and tenancy deltas: xa_price has a null
LP0 definition fingerprint, and this move changes no catalogue metadata, static
calls/writes, RLS or schema. Both existing upgrade suites register 0779's complete
body as xa_price's exact latest source after their LP6D maps; every assertion is
retained. No protected fingerprint or catalogue edit. All six non-lane paths are
listed exactly in the lane; the lane tool authorizes its own lane file separately.

Single outer BEGIN/COMMIT; no data backfill or destructive action. Existing rows
are unchanged. Reversal requires a separately reviewed forward migration, never
an edit of a landed migration. Router must reconcile the reserved 0779 stem and
landing order; no historical migration or ledger reference was rewritten.

## Authored PostgreSQL evidence — pending execution

The new suite uses the existing real approval fixtures and runtime login:

- Installs the full fresh schema, restores only the exact 0749 xa_price body in
  its isolated test database, and invokes both actual repository methods with
  the same bound supervisor/job. Existing targets must return PERMISSION_DENIED;
  absent targets must demonstrate the predecessor's NOT_FOUND leak. It then
  applies 0779 and requires four PERMISSION_DENIED results. Restoring the old
  body must make that same regression assertion throw; finally restores 0779.
- Explicitly calls the real beginRepositoryCommand with the repository's exact
  legacy payload, observes claim, current_actor and a processing receipt, then
  invokes xa_price as the same runtime caller. Price/revise, existing/absent
  all require PERMISSION_DENIED. No manufactured receipt or elevated business
  caller. Complete tenant business/receipt/lifecycle/audit row snapshots must
  remain unchanged after each rolled-back refusal.
- Exercises surveyor pricing/revision, exact replay, changed-payload conflict,
  existing-price refusal, amount bounds, missing/wrong-job NOT_FOUND, stale
  approval and unchanged origin. Tests unbound/spoofed actors, uncovered grants,
  foreign tenants and a genuinely revoked member. Existing approval-chain/rules
  suites retain the wider duplicate, amount and immutable-origin coverage.
- Reapplies the forward migration to populated state and requires unchanged
  owner, ACL, volatility, security/search_path, definition and persisted rows.

No PostgreSQL or browser service was started. In particular, the predecessor
reproduction, mutation witness, rollback and populated-upgrade assertions above
are authored, not test-executed. The sandbox explicitly prohibits their local
execution. They remain required CI evidence, not an acceptance claim. ENT-5's
aggregate acceptance, G0–G5 and live activation remain open/closed as before.

## Actually checked locally

Node 24.17.0, cached pinned pnpm 10.28.1, installed Vitest 4.1.12. Vitest help
confirms --maxWorkers; all Vitest commands used --maxWorkers=1 and no more than
three named files. No download/install. Repository package typecheck excludes
tests, so the new suite also received a separate strict no-emit TypeScript check.

- `PATH=/tmp/jg-pnpm-10.28.1-bin:$PATH pnpm typecheck`: PASS, all seven packages.
  Turbo reported cache IO permission warnings; all actual checks exited zero.
- DB Vitest run with /tmp/later-safety-183-vitest.config.mts, --maxWorkers=1,
  src/extra-approval-chain-repository.test.ts,
  test/lp5b-contractor-writers.test.ts, test/migration-proof-loader.test.ts:
  PASS, 3 files / 95 tests.
- Temporary config imports the existing DB config and adds only core/storage
  source aliases because built dist entrypoints are absent. No checks changed.
- `tsc -p /tmp/later-safety-183-test-tsconfig.json`: PASS, strict no-emit check
  of the new suite and its imports (also repeated after the final test edit).
- Vitest list with the same temporary config collects all five new integration
  cases; it does not run hooks, start PostgreSQL or establish database success.
- Source comparison: the complete copied definition is identical to 0749 after
  removing the one moved comment/guard block from each. No later source found.
- Existing lane-policy loader accepts all seven changed paths; explicit proof
  JSON parses; both exact successor registrations present; git diff --check PASS.

Required CI/router execution, not launched here:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/extra-price-permission-order.integration.test.ts test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/extra-approval-chain.integration.test.ts test/extra-approval-rules.integration.test.ts test/extra-approval-authority.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6d-routines.integration.test.ts test/lp5b-contractor-writers.integration.test.ts
pnpm test:db
pnpm test:migrations
```

Also run all required repository CI checks against current main. One independent
RED review against the exact head remains required. READY for router commit/push
as NOPR only; no commit, push, PR, CI launch, merge, provider activation or release
was performed. The commit-message file is in /tmp as requested.

LATER / SIMPLICITY (initial source inspection): extra-price-permission-order's
persisted-row snapshot overlaps other approval regression setup. A future shared
approval snapshot fixture could keep the table list in one place and reduce
coverage drift. That fixture extraction is outside the allowed paths and does
not block this repair. No new abstraction was introduced here.
