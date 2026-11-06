READY — recover-migfix-7, NOPR, RED (SV-2 / SV-3 authority, hidden data and fee eligibility).

Compared current worktree/main `62081c689` with the local branch-audit snapshot
and old `origin/codex/sandbox/migfix-7` (`9ab17353e`). Main still had single-signal
disclosure and no group propagation. Recovered only the group disclosure/no-fee
protection onto main, using reserved migration 0632 and its exact catalogue proof.
No Git metadata or remote refs were changed; no fetch, commit, push or PR.

The disclosure routine now locks the detection key, job and complete star-shaped
coalesced group before applying monotonic visibility/exclusions and the existing
audited disclosure. The trigger copies permanent exclusions and their original
audited disclosure references when a later duplicate joins; unlike the old
branch, an already-disclosed duplicate joining a hidden survivor also protects
that survivor's existing siblings. No stored-row shapes or historical records
change. No new public/runtime EXECUTE or table grants. The latest 0520
`surface_shadow_signal_early` body retains its checked `lp4_seal_audit` path and
current validation/search path, with the detection key acquired before its row
locks. Existing repository/worker wiring uses this executor. No new command,
route, environment setting, operational alert or credential is needed.

Post-lock completion stays disabled: the old routine, test-only executor grant
and completion tests were not ported. Regression coverage requires locked jobs
to keep refusing early firing and ordinary late disclosure to record truthful
post-lock timing. Synthetic data only; no deployment or production activation.

Verification (actual results)

- Installed Node v24.17.0 and local TypeScript/Vitest binaries; no package download.
  The system pnpm launcher stalled even on `--version`; stopped those invocations.
  Used the installed repository binaries directly, preserving runner/config.
- `packages/db: ./node_modules/.bin/tsc -p tsconfig.json --noEmit`: PASS.
- Built existing core/storage/config/db/ai packages with their installed `tsc -p
  tsconfig.json` scripts to supply ignored local dist outputs for unit imports.
- `packages/db: ./node_modules/.bin/vitest run --maxWorkers=2
  test/migration-proof-loader.test.ts test/upgrade-proof-utils.test.ts`: 79 PASS.
  Initial collection lacked core dist; the completed run above followed its build.
- `apps/api: ./node_modules/.bin/vitest run --maxWorkers=2
  src/auth/context-boundary.test.ts src/auth/identity.test.ts`: 152 PASS in
  the three-file run; watchdog initially needed built db/ai dist. After those
  dependency builds, `vitest run --maxWorkers=2 src/watchdog-registry.test.ts`:
  126 PASS. No successful guard suite needed further execution.
- `packages/db: vitest list --maxWorkers=2 test/migfix-7.integration.test.ts
  test/migfix-7-upgrade.integration.test.ts` collects all 7 new tests. The updated
  plan-entitlement upgrade test was also collected. Collection does not execute
  hooks/tests or prove PostgreSQL behavior.
- `git diff --check`: PASS.
- `node tools/agent-lane-boundary-lint.mjs`: refuses self-comparison because
  HEAD equals origin/main while this sandbox cannot commit. A read-only local
  invocation of its exported policy/selection/path/migration validators passes:
  exact lane coverage for all 10 changed paths, excluding the lane file from its
  own allow list, and reserved 0632 is above all migrations on main. The normal
  commit-range lane check remains required after the router commits.

Named holds for landing

- GitHub PostgreSQL CI must execute `migfix-7.integration.test.ts`,
  `migfix-7-upgrade.integration.test.ts` and the updated
  `plan-entitlement-lifecycle-upgrade.integration.test.ts`, plus required full
  database/migration, LP-0, tenancy, fingerprint and existing shadow suites.
  The new tests were collected locally, not database-executed. CI must prove
  group exclusions, both racing commit orders, replay/conflict handling,
  cross-tenant/permission refusal, audit rollback, current worker execution,
  post-lock refusal, unchanged rows/types/ACLs and repeat migration behavior.
- Required full typecheck/lint/test/build CI must pass against the landing head.
  No PostgreSQL or browser server can run in this sandbox. Re-run the normal
  lane tool after the router creates the commit.
- Independent RED review must PASS the exact final head before landing.
- Post-lock mandatory-firing completion is intentionally outside this recovery
  and remains disabled; it needs separately reviewed authority/executor work.

Forward fix only: preserve disclosure/exclusion/firing/audit history, disable
execution if needed, and use a reviewed corrective migration. No historical
backfill or new routine grant is implied by READY. READY means prepared for the
router's commit/push/CI/review handoff; it is not a landing or release claim.

Batch-49 pre-check repair — 5 November 2026: READY, RED, NOPR.

The LP-4 scan includes migration 0632 and recognizes a known LP-4 writer that
still calls lp4_seal_audit as sealed. The original 21-writer assertion remains.
A new assertion checks every post-0520 re-creation of an LP-4 routine, requiring
its body to call the sealer and refusing direct audit inserts or old audit-head
locking. The final-definition scan now follows actual migration order, so a
later routine cannot be hidden by overlaying 0520 afterwards. No SQL changed.

Actual local verification (installed binaries, at most two workers):
- Before repair, lp4-writer-catchup.test.ts reproduced the 20-versus-21 failure.
- From packages/db: ./node_modules/.bin/vitest run --maxWorkers=2
  test/lp4-writer-catchup.test.ts test/migration-proof-loader.test.ts
  test/migfix-6.test.ts: PASS, 3 files / 97 tests (including all 18 LP-4 tests).
- Scratch-only mutation at /tmp/batch-49-lp4-mutation-20261105T200215Z:
  removed the complete PERFORM app.lp4_seal_audit(...) statement from the copy
  of 0632. Running the same installed Vitest runner/config with --maxWorkers=2
  test/lp4-writer-catchup.test.ts -t 'every re-created': EXPECTED FAIL, identifying
  0632_shadow_group_disclosure.sql: app.surface_shadow_signal_early at the new
  sealer-call assertion (1 failed, 17 skipped). No mutation entered this worktree.
- node tools/agent-lane-boundary-lint.mjs: PASS. A separate read-only check also
  compared the lane allow list exactly with every non-lane path changed from
  origin/main: PASS, 17 paths, no self-listing. Migration order validation PASS;
  no main migration edited/deleted, only the intended 0631 and 0632 additions.
- git diff --check: PASS.

Main was already merged at 824c2b245 (origin/main 28871adf3); no Git writes were
performed. The router owns commit/push. Database/browser suites and the required
full CI checks remain for GitHub CI; the independent checker must confirm this
repair delta against the final head before landing. This is readiness for that
handoff, not a CI, independent-review, merge or release claim.

## Batch-49 current-main landing catch-up — 5 November 2026, 21:15 dispatch

The launcher already completed the merge at `3d42b8afd`; `origin/main` is
`d16ef1978`. The index and working tree had no unresolved merge entries. No Git
write, commit, fetch, push or PR was performed in this session. No behaviour or
test assertion needed changing for this merge.

Compared all four re-created routines with their latest definitions from the
actual `origin/main` migration tree: legacy approval/reversal from 0356,
disclosure from 0128 and early firing from 0520. Only the existing MIGFIX-6
eligible/gross, cumulative reversal and settled-credit changes, and MIGFIX-7
group-disclosure/locking changes remain. Main's current support USAGE check,
mode restrictions, authorization guards and checked audit sealer are retained.
Neither migration is already on main; no main migration is edited or removed.
The batch-30 migration proofs and their new inventory test are present from
main. No additional exact-list rows are needed beside this group's rows.

Current local verification, using installed runners and no package downloads:

- `packages/db: ./node_modules/.bin/vitest run --maxWorkers=2
  test/lp4-writer-catchup.test.ts test/migration-proof-loader.test.ts
  test/migfix-6.test.ts`: PASS, 3 files / 98 tests.
- `node tools/agent-lane-boundary-lint.mjs`: PASS against current origin/main.
- Separate exact-set lane comparison: PASS, all 17 changed non-lane paths,
  with no duplicate entries or lane self-entry.
- `git diff origin/main --check`: PASS; no unresolved index paths or conflict
  markers in the affected migration, upgrade test or receipt files.

Database/browser execution stays with GitHub CI after router push. Current-head
required CI and independent RED review remain landing gates. READY is readiness
for router commit/push and review, not database verification or permission to
merge or release. Existing initial LATER / SIMPLICITY observation stands; this
catch-up adds no new review observation.
- `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit`:
  PASS (exit 0, no diagnostics).

READY — batch-49, RED, NOPR; router owns commit/push and the CI/review handoff.


## Batch-49 current-main landing catch-up — 6 November 2026, 01:00 dispatch

READY — RED, NOPR. The launcher completed the merge at `4263d0fa9`, including
`origin/main` at `f5415ddb4`. No unresolved index paths or working-tree conflicts
remained. No Git write, fetch, commit, push or PR was performed in this session.
No code or test assertion needed changing; this receipt is the only catch-up edit.

Scanned every migration on the actual origin/main tree in migration order and
diffed all four replacement routines against their latest definitions: approval
and reversal from 0356, disclosure from 0128, early firing from 0520. Only the
intended MIGFIX-6 eligible/gross, cumulative-reversal and settled-credit changes,
and MIGFIX-7 group-disclosure and detection-lock changes remain. Main's USAGE
support check, tenant/mode/authorization guards and checked audit sealer survive.
The two migrations are absent from main; no main migration is edited or removed.
Main's new 0620/0621 migrations and proofs remain present. No new main rows belong
beside this group's rows in an affected exact list, so none were added.

Actual local verification with installed dependencies and no downloads:

- `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit`:
  PASS, exit 0 with no diagnostics.
- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=2
  test/lp4-writer-catchup.test.ts test/migration-proof-loader.test.ts
  test/migfix-6.test.ts`: PASS, 3 files / 98 tests.
- `node tools/agent-lane-boundary-lint.mjs`: PASS against origin/main f5415ddb4.
- Independent exact-set comparison of lane allow paths with changed non-lane
  paths: PASS, 17 paths, no duplicates or self-entry; unresolved index paths: none.
- `git diff origin/main --check`: PASS.

Database and browser execution remain with GitHub CI after router push. Required
current-head CI and one independent RED review remain landing gates. Existing
initial LATER / SIMPLICITY observation stands without a new review observation.
READY means prepared for router commit/push and CI/review; it does not establish
database verification, independent acceptance, merge or release.


## Batch-49 repair round 2 (last) — 6 November 2026, 01:55 dispatch

READY — RED, NOPR. Applied the exact narrow test change from
`~/.local/share/full-steam/coordinator/prechecks/batch-49-catchup3.md`.
The enterprise-access upgrade proof now requires exactly the named validated
`landing_allocation_eligible_within_gross` constraint with definition
`CHECK ((eligible_net_pence <= gross_pence))` on `app.landing_allocation`, then
removes only that constraint from the catalogue comparison. Every remaining
catalogue field, constraint and other relation still goes through the existing
comparison, retaining its pre-existing named-table ACL rules. No SQL, migration
proof, writer test, catch-up merge or other product behavior changed.

Actual local verification with installed dependencies (no downloads):

- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=2
  test/enterprise-access-upgrade.integration.test.ts -t 'ACL comparison'`:
  PASS, 1 passed / 1 deselected. The PostgreSQL upgrade case was not executed.
- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=2
  test/lp4-writer-catchup.test.ts`: PASS, all 18 tests. The unmodified scan reads
  every migration file and still asserts exactly 21 writers; no file excluded.
- `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit`:
  PASS, exit 0 with no diagnostics.
- `node tools/agent-lane-boundary-lint.mjs`: PASS against origin/main 46f0be7ea
  using the existing merge-base comparison. Separate exact-set check: PASS,
  all 18 changed non-lane paths, no duplicates or lane self-entry.
- `git diff --check`: PASS.

The catch-up merge remains at 4263d0fa9 (main f5415ddb4), exactly as instructed;
no Git write, fetch, merge, commit, push or PR was performed. origin/main has
advanced to 46f0be7ea; bringing that head in remains router-owned. The sandbox
cannot start PostgreSQL or bind localhost. Full enterprise-access-upgrade and
plan-entitlement-lifecycle-upgrade execution therefore remain with GitHub CI
after router push, with at most 2 workers. Required current-head green CI and
independent RED review remain landing gates. READY means prepared for router
commit/push and CI/review, not database verification, acceptance or merge.
Existing initial LATER / SIMPLICITY notes stand; no new review was performed.

## Batch-49 merge resolution — 6 November 2026, 03:48 dispatch

READY — RED, NOPR. Incoming main is MERGE_HEAD `919b7f3e60b82ef1ed1e32a6f259ba92246f6541`
(PR #586 / batch-43). Local `main` is stale and was not the comparison base.
Resolved the enterprise-access upgrade conflict by keeping main's exact 0629
readiness-policy comparison and this group's exact 0631 landing-allocation CHECK
assertion/normalization. Main's new pure policy and ACL regression assertions
remain intact. No new behaviour and no weakened tests.

Inspected and diffed all four re-created routines against the latest bodies
in incoming main: approval/reversal in 0356, disclosure in 0128 and early firing
in 0520. Differences remain limited to the existing MIGFIX-6 money corrections
and MIGFIX-7 group disclosure/locking. Current support USAGE, tenant/mode checks,
authorization and checked audit sealing survive. Neither 0631 nor 0632 exists
in incoming main; no migration needs dropping. No additional exact-list rows
are needed beyond retaining main's readiness-policy assertions at the conflict.
The batch lane already lists exactly all 18 non-lane paths against incoming
main, with no self-entry or duplicates, and needed no change.

Actual local checks, installed dependencies only:

- `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit`:
  PASS, exit 0.
- From packages/db, `./node_modules/.bin/vitest run --maxWorkers=2
  test/lp4-writer-catchup.test.ts test/migration-proof-loader.test.ts
  test/migfix-6.test.ts`: PASS, 3 files / 98 tests.
- From packages/db, `./node_modules/.bin/vitest run --maxWorkers=2
  test/enterprise-access-upgrade.integration.test.ts -t 'policy comparison|ACL comparison'`:
  PASS, 2 pure regression tests; the PostgreSQL upgrade test was intentionally
  deselected (1 skipped). No database execution is claimed.
- `git diff MERGE_HEAD --check`: PASS. Conflict markers removed from the resolved file.
- Exported lane policy/schema/path and migration-order validators against the
  resolved working tree and MERGE_HEAD: PASS. Exact non-lane allow set: 18 paths.
- Normal `node tools/agent-lane-boundary-lint.mjs` currently refuses incoming-main
  paths from the unfinished merge index. This is not a lane pass; the router
  must stage the resolution, finish the merge, and rerun the normal command.

No Git writes were performed. The index still marks the resolved file unmerged
because .git is read-only; router staging and merge completion are required.
Database/browser suites remain for GitHub CI after push; full current-head CI
and one independent RED review remain landing gates. READY is the router
commit/push/CI handoff, not evidence of merge, database execution or release.

## Batch-49 PR preparation — 6 November 2026, 03:52 dispatch

READY — RED, prepared for router commit/push/PR. The launcher completed the
main merge at `ebbd979892588e56740d7c02cf9d4f3faf9846a6`; no conflict or
unfinished merge remained. Compared against current `origin/main`
`c219dda6e35830ed616fa6d11337e4a5074b514a` (including #586 and #588), rather
than stale local main.

Final branch migration inventory against that main:

- `0631_legacy_recovery_money_integrity.sql` (renumbered from 1210).
- `0632_shadow_group_disclosure.sql` (renumbered from 1211).

Main ends at `0630_privacy_review_facts.sql`. Neither branch migration repeats
a migration on main; both remain forward differences. SQL bytes are unchanged.
Renamed both proof files and every batch-owned reference, including the exact
named, definition-pinned CHECK allowance in enterprise-access-upgrade. No test
was weakened. The lane lists exactly the final 18 non-lane paths, no self-entry
or duplicates. No provider-register source, API, web route or CI image changed.

Diffed every re-created routine against its latest main body before handoff:
`approve_synthetic_landing` and `reverse_synthetic_landing` against 0356,
`record_shadow_disclosure` against 0128, and `surface_shadow_signal_early`
against 0520. Differences remain only the intended eligible/gross guard,
cumulative reversals and settled-credit predicate, group disclosure propagation,
and detection advisory locking. Main's mode checks, tenant checks, support USAGE,
authorization, terms checks and checked audit sealing remain. The propagation
trigger routine is new, rather than a replacement. No new behavior was added
in this preparation. Existing initial LATER / SIMPLICITY notes stand.

Actual local checks, installed dependencies only, at most two workers:

- `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit`:
  PASS, exit 0.
- From packages/db, `./node_modules/.bin/vitest run --maxWorkers=2
  test/lp4-writer-catchup.test.ts test/migration-proof-loader.test.ts
  test/migfix-6.test.ts`: PASS, 3 files / 98 tests.
- From packages/db, `./node_modules/.bin/vitest run --maxWorkers=2
  test/enterprise-access-upgrade.integration.test.ts -t 'policy comparison|ACL comparison'`:
  PASS, 2 pure regression tests; 1 database test deselected.
- `node tools/agent-lane-boundary-lint.mjs`: PASS before renumbering. After
  renumbering it refuses exactly the four old migration/proof paths still in
  HEAD; the read-only Git index cannot record their renames here. This is not
  a post-renumber standard-lint pass. Router must stage/commit the renames and
  rerun the standard lane lint. The exported lane policy/schema/path and
  migration-order validators PASS against the final existing working-tree
  paths and origin/main, with an exact-set assertion for all 18 allowed paths.
- Exact SQL comparison against pre-rename HEAD: PASS for both migrations.
- Old-stem search over batch-owned files: no remaining references (historical
  rename provenance in this receipt excepted).
- `git diff --check`: PASS.

No Git writes, downloads, database startup, browser execution, push or PR were
performed. GitHub CI must prove real PostgreSQL fresh installs, populated
upgrades and exact catalogue/ACL preservation, money/reversal/replay/isolation
and disclosure/coalescence concurrency, plus all required existing suites.
Database/browser checks cannot run in this sandbox. Green CI on the final head
and the required independent RED check remain merge gates. READY means the
router handoff, not database verification, acceptance, merge or release.
