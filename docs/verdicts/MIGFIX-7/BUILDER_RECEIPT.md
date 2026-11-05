READY — recover-migfix-7, NOPR, RED (SV-2 / SV-3 authority, hidden data and fee eligibility).

Compared current worktree/main `62081c689` with the local branch-audit snapshot
and old `origin/codex/sandbox/migfix-7` (`9ab17353e`). Main still had single-signal
disclosure and no group propagation. Recovered only the group disclosure/no-fee
protection onto main, using reserved migration 1211 and its exact catalogue proof.
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
  own allow list, and reserved 1211 is above all migrations on main. The normal
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

The LP-4 scan includes migration 1211 and recognizes a known LP-4 writer that
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
  of 1211. Running the same installed Vitest runner/config with --maxWorkers=2
  test/lp4-writer-catchup.test.ts -t 'every re-created': EXPECTED FAIL, identifying
  1211_shadow_group_disclosure.sql: app.surface_shadow_signal_early at the new
  sealer-call assertion (1 failed, 17 skipped). No mutation entered this worktree.
- node tools/agent-lane-boundary-lint.mjs: PASS. A separate read-only check also
  compared the lane allow list exactly with every non-lane path changed from
  origin/main: PASS, 17 paths, no self-listing. Migration order validation PASS;
  no main migration edited/deleted, only the intended 1210 and 1211 additions.
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
