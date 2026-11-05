# READY — recover-migfix-6

M4-8-S / CH-7, legacy v1 recovery money integrity. RED. NOPR.
Base: `62081c689` (current checkout/main at dispatch). Read-only comparison with
`origin/codex/sandbox/migfix-6` (`8c88fc6f2`) and the branch audit confirmed the
eligible/gross constraint, cumulative reversal subtraction and settled-credit
reversal predicate were still missing. No fetch, Git mutation, commit or push.

## Focused recovery

Migration `1125_legacy_recovery_money_integrity.sql` adds the validated
`landing_allocation_eligible_within_gross` constraint and starts both replacement
routines from their latest mainline bodies in 0356. Approval adds eligible <= gross;
reversal subtracts every reversal and uses the approval routine's existing settled
plan-credit predicate. Recovered all three legacy regression cases without weakening
their expectations (including both no-credit partial-reversal amounts).

Current synthetic-database mode refusals, locks, owners, grants and signatures are
preserved. No columns, grants, new executable routines, `SET app.*` clauses or
fingerprinted row changes. No v3, issued-line allocation or F18 interest routine
is replaced. Existing bad allocations abort the upgrade; no financial history
is normalized. Forward-fix guidance is in MIGRATIONS.md.

Added fresh-install PostgreSQL regressions and a populated upgrade/replay test using
current fixture helpers. The latter compares all existing rows, policies, relation
ownership/grants/RLS and every routine; only the two exact legacy body replacements
are permitted. The pre-existing 0556 upgrade test now binds these exact signatures
to 1125's replacement bodies rather than exempting a class of routines. Migration
proof records unchanged runtime-reachable routine metadata and identity arguments.

## Local evidence

- `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit`: PASS.
- Installed workspace core/storage/config/db/ai builds via their existing TypeScript
  configurations: PASS; generated output is ignored, no package downloads requested.
- In packages/db: `node node_modules/vitest/vitest.mjs run --maxWorkers=2 test/migfix-6.test.ts test/migration-proof-loader.test.ts`:
  PASS, 2 files / 79 tests. Initial attempt lacked core's built package entry;
  rerun passed after building installed prerequisites.
- API context-boundary and identity: PASS, 2 files / 152 tests. Watchdog initially
  could not resolve unbuilt db/ai entries; after building those installed packages,
  `node ../../packages/db/node_modules/vitest/vitest.mjs run --maxWorkers=2 src/watchdog-registry.test.ts`: PASS, 1 file / 126 tests.
- Four new test modules: TypeScript transpilation syntax diagnostics PASS.
- `git diff --check`: PASS.
- `node tools/agent-lane-boundary-lint.mjs --lane=recover-migfix-6` was invoked and
  refuses the uncommitted self-comparison (HEAD equals origin/main). Its exported
  lane-schema/path validators pass against the exact changed worktree files;
  full range validation remains a CI gate after the router commits.
- The pnpm launcher emitted its settings warning and stalled without running the
  requested checks; checks above use the installed repository runners directly.
- No database, browser, provider, deployment or real customer data exercised.

## Named holds for landing

1. PostgreSQL CI: `migfix-6.integration.test.ts`,
   `migfix-6-upgrade.integration.test.ts` and the amended
   `plan-entitlement-lifecycle-upgrade.integration.test.ts`, in runs of <=3 named
   files and <=2 workers. Prove fresh install; eligible > gross rejects atomically;
   two reversals reduce liability to zero; no-credit partial reversals compensate
   exactly; populated upgrade preserves history, RLS/ACLs and unrelated routines;
   replay is harmless. Source guards are not database proof.
2. Required current-head CI, including database/migration/catalog/fingerprint and
   lane gates, plus existing v3 allocation/issued-line/interest regressions.
3. One independent RED review against the exact committed head before merge.
   This builder has not independently reviewed, accepted or merged the change.

READY means prepared for router commit/push and CI, not cleared to land.
