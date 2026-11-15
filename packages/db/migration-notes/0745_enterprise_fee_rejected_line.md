# LATER-SAFETY-151 — rejected invoice lines supply no enterprise fee principal

RED money repair of ENT-7's exclusion rule, synthetic fixtures only; NOPR build ahead.
Base inspected: `0a1ea9338f184f2616945fb894c09974d29bb1cd`, branch
`codex/sandbox/later-safety-151`. This slice does not complete ENT-7.

## Source and ownership inspection

The latest effective `app.ef_inputs(uuid,app.enterprise_agreement_version,text)` is
0322_enterprise_duplicate_reconciliation.sql. No later migration replaces it on
this base. Its allocation join did not inspect the corresponding projection
line's rejection flag. `packages/core/src/contractor-billing.ts:382–441` always
initializes that flag to boolean false and sets it to boolean true on a normalized
rejection, retaining billed values and historical paid allocations. Billing import
validates events and derives the persisted projection through that existing core
path; the SQL validator alone is not proof of the rejection flag's type.

Read-only searches of the current local slot queue (including running jobs),
coordinator backlog/parked backlog, finish list and plan3 safety briefs found this
issued job and no other rejection-fee owner. LATER-SAFETY-76 mentions ef_inputs but
repairs period ordering, not invoice-line rejection. No fetch or remote ownership
claim was made; the dispatch brief supplies the prior open-PR/job review.

## Change and compatibility

The forward migration copies the entire latest function and adds only
`AND invoice_line->'rejected'='false'::jsonb` before per-extra caps and contribution
hashing. It uses the allocation's own joined projection line. Another line's
rejection cannot suppress an otherwise valid extra. Exact JSON equality admits
only the actual boolean false; missing, JSON null, string false and other malformed
values are ineligible. Supported populated projections already carry the boolean;
there is no fallback mode for unknown evidence.

No billing projection, cash allocation or denominator changes. The function's
signature, invoker security, stable volatility, search path, owner and ACLs remain
unchanged. There are no data writes, schema/tenancy changes or new dependencies.
The proof file explicitly declares empty lp0/upgrade/tenancy catalogue deltas:
this helper has a null definition fingerprint in the existing LP0 contract, and
its static calls/writes and metadata do not change. The populated-upgrade test
checks unchanged function metadata and populated rows/types, rather than claiming
an unexecuted database result. No protected allowance or contract edit is needed
by source inspection; exact-head CI must verify that conclusion.

Migration 0745 preserves all old facts, contributions, statements and journals.
New preparations exclude rejected principal; stale approvals cannot post changed
facts. Already posted fees correct through the existing later-period linked
compensation flow. No production gate is opened and no live activation occurs.
Undo only with a separately reviewed forward migration; do not rewrite or remove
this migration after landing or mutate prior financial history. At landing the
router must preserve migration ordering/reservations and rerun required checks.

## Authored PostgreSQL evidence — NOT EXECUTED here

`enterprise-fee-rejected-line.integration.test.ts` contains 13 collected cases:

- R151-UPGRADE seeds a real approved/exported extra and paid invoice, posts an
  approved statement, imports rejection through the actual billing command,
  verifies rejected=true with nonzero stored allocation and billed net, and
  witnesses the predecessor's erroneous Q=250000/31 and 806p fee. It snapshots
  populated facts, allocations, origin/export, derivations/contributions,
  statements/approvals, journals, receipts and audit; applies only 0745; checks
  metadata and prior row/type preservation; repeats migration; derives zero and
  posts linked compensation in a later period without changing earlier rows.
- R151-ZERO (two orderings) covers rejection before and after payment, retains
  allocated cash and prepares/approves/posts a zero statement with no journal.
- R151-CONTROL preserves exact ENT-F2 principal and 806p, including an unrelated
  rejected order line on the same invoice.
- R151-REPLAY checks changed input hash, exact command/event replay and one stored
  rejection fact. R151-COMPENSATE checks stale approval refusal and linked later
  compensation with immutable prior statement/journal snapshots.
- R151-ADJUST covers partial credit and partial reversal following rejection,
  retaining nonzero allocated cash. R151-MIXED uses two
  genuinely raised/priced/approved/exported site extras in one fully paid invoice;
  only the unrejected extra contributes 24000p principal and 2400p fee.
- R151-ISOLATION creates a separate rejected paid job in the same tenant and keeps
  the first job eligible, then checks foreign-tenant derivation/read refusal,
  non-finance and actually revoked session refusal, private-helper SQL refusal,
  and the production gate's refusal despite exact statement authority.
- R151-MUTATION removes only the predicate inside a rolled-back transaction;
  exact core arithmetic on the effective function's inputs recovers 250000/31 and
  makes the same zero-principal assertion used by the upgrade regression fail.
  After rollback the real derivation returns zero. No stored histories are edited.
- R151-UNKNOWN checks the SQL predicate's handling of unknown/malformed JSON values.
  R151-IMMUTABLE checks runtime contribution insertion refusal and owner statement/
  journal edit refusal. R151-FRESH installs everything and repeats migration.

These are authored assertions, not a passing PostgreSQL or mutation-test result.
The sandbox forbids starting PostgreSQL/browser services, so the failing-first,
upgrade and compensation claims require actual CI execution.

## Actually executed locally

Runtime: Node 24.17.0 (available Node 24; repository .nvmrc requests 24.15.0),
pinned cached pnpm 10.28.1, Vitest 4.1.12. Verified Vitest help supports
`--maxWorkers`; every Vitest invocation used `--maxWorkers=1` and at most three
named test files. No package download/install or PostgreSQL/browser run was used.

The default PATH pnpm was 11.8.0; its version-switch attempt stalled then failed
registry verification in the restricted environment. Subsequent commands used the
already cached 10.28.1 executable through `/tmp/later-safety-151-bin/pnpm`, including
the PATH inherited by Turbo. No validation/signature settings were disabled.

- `PATH=/tmp/later-safety-151-bin:$PATH pnpm typecheck`: PASS, all seven packages.
- Default DB Vitest unit/collection attempts could not resolve absent built
  `@jobguard/core` entrypoints. A temporary `/tmp/later-safety-151-vitest.config.mts`
  imports the unchanged repository DB config and adds only core/storage source
  aliases (no test selection, assertion or gate changes).
- With that temporary config, DB Vitest `run --maxWorkers=1` on
  `enterprise-fee-reference-fixtures.test.ts`, `enterprise-fee-repository.test.ts`,
  `migration-proof-loader.test.ts`: PASS, 83 tests. This includes proof-schema
  tooling; it is not a PostgreSQL proof.
- Core Vitest `run --maxWorkers=1` on `contractor-billing.test.ts`,
  `contractor-billing-ordering.test.ts`, `enterprise-fee-statement.test.ts`:
  PASS, 43 tests, with the ordinary core configuration.
- DB Vitest `list` with the temporary source aliases collects all 13 new tests;
  no hooks or PostgreSQL assertions execute during collection.
- `tsc -p /tmp/later-safety-151-test-tsconfig.json`: PASS, strict no-emit check of
  the new suite and its imports. Initial temporary config lacked Node type-root
  resolution; pointing to the already installed types fixed it. Repository
  typecheck excludes test files, so this is an additional check.
- Existing lane-policy loader accepts the new lane and all four exact non-lane
  paths; branch binding and absence of self-registration verified.
- Source comparison: removing only the one predicate and its two comment lines
  leaves the copied function/owner/revoke block byte-identical to 0322.
- `git diff --check`: PASS. Five new allowed files only; no Git writes.

## Router handoff and remaining gates

READY for router commit/push as NOPR. No PR, CI launch, commit or push performed.
Required next: execute the new real-PG suite including failing-first/populated
upgrade/mutation witnesses, existing enterprise derivation/statement/posting/
production/command-fixture suites, contractor billing import/ordering regressions,
the whole PostgreSQL suite for this RED migration, and all mandatory repository
checks against current main. Read passing exact-head CI evidence; do not duplicate
it without a specific reason. Exact-head independent RED review is still required
before integration, plus migration-order handling. Release/production gates remain
closed. No independent review or complete acceptance is claimed.

LATER / SIMPLICITY (initial source review only): the new test's agreement and
statement preparation helpers overlap the existing enterprise fee integration
suites. A future common fixture export from those existing helpers would reduce
setup drift across money regressions. That protected fixture extraction is outside
this repair's allowed files and does not block it.

## Repair r1 — upgrade successor lists (15 November 2026)

RED LATER-SAFETY-151 repair on exact starting head
`ecd05623d8f6af9b93b7911f40375eb2ab875dae`. Renumbered the SQL, proof and
this note from 0746 to reserved 0745, updated the proof/test references, and
registered the exact `ef_inputs` successor immediately before the 0704
`ef_prepare_statement` entry in both upgrade suites. The lane retains all old
paths and adds the new paths and both upgrade tests. No fee logic changed.

Actually executed for r1:
- `PATH=/tmp/later-safety-151-bin:$PATH pnpm --filter @jobguard/db typecheck`: PASS.
- Read-only source comparison against HEAD: renamed SQL is byte-identical,
  SHA-256 `8e99ea8b300744ff6eff97a3f810eaf56941133b27392ec183ec2a620c723888`.
- Existing lane-policy loader/path validator: PASS for every changed/untracked
  path; proof migration reference matches 0745.
- `git diff --check`: PASS.

PostgreSQL commands for CI/router (not run in this sandbox):

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/enterprise-fee-rejected-line.integration.test.ts test/migfix-7-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts
pnpm test:db
pnpm test:migrations
```

READY for router commit and NOPR handoff; exact-head RED review and green CI
remain required. Git is read-only here: no fetch, merge, git mv, staging, commit
or push was attempted. Filesystem renames prepare the same rename diff without
writing the Git index. Router must fetch and merge current origin/main, keeping
both sides, and revalidate before integration. No reset or force-push.
The referenced `prechecks/later-safety-151.md` is absent in this worktree; the
issued brief supplied the two named successor-list corrections.
