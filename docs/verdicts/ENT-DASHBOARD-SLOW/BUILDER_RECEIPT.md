# ENT-DASHBOARD-SLOW

Base: `origin/main`, `36acf72daddbaa68f09a84c67a8a22842a72928d`.
Branch: `codex/sandbox/ent-dashboard-slow`. Push only; no PR or merge.
Review lane: **RED for tenant isolation only**. This is builder/test evidence, not an independent review. A reviewer must review the exact final head before any merge.

## Cause and fix

Both activity and billing call `enterpriseDashboardSourceSql`. The old query materializes every authorized work order, including orders with no extra, visit or billing fact. It then constructs every job/operative coverage pair and every order line, although the public signal projector discards order lines for jobs without contributions. On the Northside seed, this means 2,000 job authority checks, 82,000 job/subject pairs and 4,000 order lines for one contributing job. Poor cardinality estimates immediately after loading amplify this into repeated nested scans. `ANALYZE` helps but leaves unnecessary work: the old previous-line lookup examines 16 million tuples after statistics are current.

The fix materializes the union of tenant-qualified jobs referenced by extras, visits and billing facts **before** the existing job authority checks. Candidate membership grants no access. The actor/session, active membership, permission, grant revocation, current job/team, job provenance, commercial track/environment, same-grant/all-current-operative-teams and output allowlists are unchanged. `subject_teams` still includes all current teams, including teams on non-candidate jobs. Each request still obtains its own transaction, current session check and shared authority gate; there is no tenant-data cache.

The previous-line lookup also supplies the already-implied `prior.work_order_id=l.work_order_id` condition. The existing `(tenant_id,work_order_id,revision)` index can then find earlier revisions before fetching their scope line. The tenant/order/revision foreign key already enforces this equality; no possible matching row is removed.

No schema, column, function, `SET app.*`, RLS, privilege, session or hidden-data change. No migration is needed; **1070 remains unused**. No existing test or timeout is changed.

## Reproduction on real PostgreSQL

PostgreSQL **16.10**, supplied by the pinned `embedded-postgres` dependency. Fresh database `jobguard_synthetic_demo`, real non-owner `ent4b_login` inheriting `jobguard_runtime`, without superuser/BYPASSRLS. Fixture setup alone uses its existing test administrator to migrate and run `ANALYZE`.

The reproduction calls the same `seedNorthsideDemo` command seed as the journey: 3 clients, 40 operatives, 2,000 orders and 4,000 lines. It logs one fictional operative extra with a generated photo through `SiteExtraRepository`, then switches the stored practice session to Northside's finance/read-only actor. No customer data or external delivery is used. This isolates the shared read after bulk loading; it does not pretend to replay the entire billed/paid journey in the plan fixture.

Each plan is the complete source query, executed with verified transaction-local tenant context and actual session/tenant parameters:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON) <enterpriseDashboardSourceSql>;
```

The first capture follows the seed with no explicit statistics refresh; the second follows owner `ANALYZE`. Default autovacuum is not disabled and no planner switches, indexes or statistics are fabricated. These are measurements on this machine, not wall-clock acceptance thresholds.

| Shared read, one logged extra | Before ANALYZE | After ANALYZE |
|---|---:|---:|
| Original execution, ms | 21,835.941 | 3,348.997 |
| Fixed execution, ms | 13.277 | 8.826 |
| Original shared buffer hits | 40,742,487 | 554,683 |
| Fixed shared buffer hits | 352 | 923 |
| Original jobs / covered subjects | 2,000 / 82,000 | 2,000 / 82,000 |
| Fixed jobs / covered subjects | 1 / 41 | 1 / 41 |
| Original largest node's examined tuples | 8,000,000 | 16,000,000 |
| Fixed largest node's examined tuples | 4,000 | 4,000 |

The supplied 279/282-second production-shaped CI symptom was **not reproduced at the same duration** locally. The expensive plan and sensitivity to statistics were reproduced. A seed-only control, without the logged extra, measured 23,952.429 ms before and 3,404.641 ms after ANALYZE. This evidence establishes unnecessary work and bad plans, not the complete cause of every second in run `41978382584`.

### Plan excerpts

Original, before ANALYZE:

```text
CTE jobs: Nested Loop, estimated rows=1, actual rows=2000
  team/branch combinations × 2000 work orders
  Join Filter: t.id = app.contractor_job_team(w.job_id)
  unchanged app.contractor_job_allowed check
CTE covered_subjects: Aggregate, actual rows=82000
order lines: Nested Loop, output=4000, rejected=7,996,000
  work_order_line tenant scan: 4000 rows × 2000 loops
```

Original, after ANALYZE:

```text
CTE jobs: Nested Loop, estimated rows=10, actual rows=2000
  Hash Join: app.contractor_job_team(w.job_id) = t.id
CTE covered_subjects: Aggregate, actual rows=82000
previous-line lookup:
  Seq Scan work_order_line: 1 accepted + 3999 rejected × 4000 loops
```

Fixed, before / after ANALYZE:

```text
CTE candidate_jobs: Aggregate, actual rows=1
CTE jobs: Nested Loop, estimated rows=1, actual rows=1
  unchanged current-team and job-authority checks
CTE covered_subjects: Aggregate, actual rows=41
largest executor node: 4000 examined tuples
```

The six full plans (including the repeat against original main), SQL hashes, fixture description and PostgreSQL version are in `plans.json.gz` next to this receipt. View with `gzip -dc docs/verdicts/ENT-DASHBOARD-SLOW/plans.json.gz`.

## Regression and verification

The new PostgreSQL test generates the real seed in fixture setup. The test body captures both plans and always asserts exactly one contributing authorized job and at most 200,000 examined tuples in any node, counting accepted and rejected tuples across loops. It exercises both repository resources and checks the captured extra and empty billing contributions. It does not assert elapsed time, costs, planner estimates or a particular index/node choice. It uses the existing 120-second test budget and 240-second fixture-setup budget.

Verification results and exact reproduction commands follow below.

Commands below were run from `/workspace/jobguard`, unless a worktree directory is specified. Network/socket commands required the execution tool's network permission; the default sandbox could neither contact the proxy nor bind PostgreSQL ports. No network policy or credential files were changed.

```sh
export PATH=/workspace/.jobguard-runtime/node_modules/.bin:$PATH
node --version  # v24.15.0 with this PATH
pnpm --version # 10.28.1
git fetch origin main
git switch -c codex/sandbox/ent-dashboard-slow origin/main
pnpm install --offline --frozen-lockfile --store-dir /workspace/.pnpm-store
pnpm turbo run build --filter=@jobguard/db^...
```

Fetch, pinned offline install and dependency build passed. The initial fetch without tool-level network permission failed; after enabling it, the branch was fast-forwarded to the fetched base above before product edits. No work from the initially supplied `work` branch is included outside that base.

```sh
ENT_DASHBOARD_PLAN_DIRECTORY=/workspace/jobguard/work/ent-dashboard-slow/final-proof \
  pnpm --filter @jobguard/db exec vitest run test/enterprise-dashboard-plan.integration.test.ts --maxWorkers=1
```

**PASS:** 1 file, 1 test, 112.74 s including fixture setup under concurrent verification load. The measured source queries themselves were 13.277 / 8.826 ms. Both row-count assertions passed, and activity/billing repository checks passed.

For the negative control, the exact same final test was copied into a separate checkout of original main. The dependency links below reuse the unchanged installed packages; the worktree's DB source resolves through its own existing Vitest aliases.

```sh
git worktree add --detach work/ent-dashboard-slow/baseline 36acf72da
cp packages/db/test/enterprise-dashboard-plan.integration.test.ts work/ent-dashboard-slow/baseline/packages/db/test/
python3 - <<'PY'
from pathlib import Path
root=Path('/workspace/jobguard'); dest=root/'work/ent-dashboard-slow/baseline'
for p in [root, *list((root/'packages').iterdir()), *list((root/'apps').iterdir())]:
    if (p/'node_modules').is_dir():
        target=dest/p.relative_to(root)/'node_modules'
        if not target.exists(): target.symlink_to(p/'node_modules',target_is_directory=True)
PY
cd /workspace/jobguard/work/ent-dashboard-slow/baseline
ENT_DASHBOARD_PLAN_DIRECTORY=/workspace/jobguard/work/ent-dashboard-slow/baseline-proof \
  pnpm --filter @jobguard/db exec vitest run test/enterprise-dashboard-plan.integration.test.ts --maxWorkers=1
```

**EXPECTED FAILURE:** `CTE jobs` actual rows **2000**, expected **1**; 1 failed test, 124.51 s including setup. The plans were captured before the assertion. No elapsed-time assertion failed. In this slower verification run, autovacuum had already improved the first plan: 3,490.431 / 3,318.263 ms. The plan/row-count regression still catches it, independently of statistics freshness.

```sh
pnpm --filter @jobguard/db exec vitest run \
  test/enterprise-dashboard.integration.test.ts \
  test/enterprise-dashboard-stored.integration.test.ts \
  test/enterprise-dashboard.authority-race.integration.test.ts \
  test/tenancy.integration.test.ts --maxWorkers=1
pnpm test:migrations
pnpm typecheck
pnpm lint
pnpm build
```

- Scoped dashboard, stored billing, authority-race and tenancy: **4 files, 35 tests passed**, 60.09 s.
- Migration/bootstrap checks: **2 files, 23 tests passed**, 12.50 s. No new migration.
- Typecheck: **7/7 tasks passed**, 2m29.204s on final source.
- Lint (including lane and commercial/AI/SQL boundaries): **7/7 tasks passed**, 1m56.984s.
- Build: **7/7 tasks passed**, including the production Next build.

An earlier combined verification ran the expensive seed inside the new test body while several other suites/builds ran concurrently and hit its default 120-second limit. Fixture generation now runs in `beforeAll` under the existing fixture-setup budget; the query test retains the default 120-second budget. No pre-existing test or budget was modified. Before the first task commit, the lane command correctly refused a self-comparison against main; the final lint compares the committed task with its real base.

```sh
CI=1 pnpm --filter @jobguard/web test:e2e ENT-11b.spec.ts --project=desktop
PLAYWRIGHT_BROWSERS_PATH=/workspace/jobguard/work/pw-browsers \
  pnpm --filter @jobguard/web exec playwright install chromium
```

The first journey attempt could not launch either test: the pinned Chromium 140 / Playwright build 1193 executable was absent. Browser installation then failed with HTTP 403 `Domain forbidden` from the configured download hosts. Existing **system Chromium 154.0.8037.57** is used for the local fallback, through a symlink in the scratch browser directory. This is explicitly a different browser build; the pinned browser still needs CI verification. No browser/test configuration was changed.

```sh
mkdir -p work/pw-browsers/chromium_headless_shell-1193/chrome-linux
ln -s /usr/bin/chromium work/pw-browsers/chromium_headless_shell-1193/chrome-linux/headless_shell
PLAYWRIGHT_BROWSERS_PATH=/workspace/jobguard/work/pw-browsers CI=1 \
  pnpm --filter @jobguard/web test:e2e ENT-11b.spec.ts --project=desktop
pnpm test
```

The first `pnpm test` attempt passed core (4,672 tests), web (1,902), config (344), AI (276), storage (108; 2 existing skips) and 4,050 API tests, but API's `shadow-isolation.application.test.ts` tried to build Next while the separate build was running. Next refused its build lock; Turbo then stopped the DB task. This was a verification orchestration collision, not a passing full suite. The full test command was rerun after the separate build finished.

System-Chromium journey result: **2 passed (4.4m)**. The complete 360px journey took **1.7m** and 1280px took **2.6m** under concurrent verification load, including billing, statement and dashboard assertions. Both satisfy the unchanged ten-minute journey assertion. This is an automated test, not the separate human rehearsal. The worker's SIGTERM output is the existing teardown stopping its process after both tests passed.

`pnpm lint:lanes` passed against real base `36acf72da`. An additional exact-set check confirmed that the lane's `allow` equals every changed non-`config/lanes/` path, with no self-entry: **4 files plus the own lane file**. `git diff --check` passed.
