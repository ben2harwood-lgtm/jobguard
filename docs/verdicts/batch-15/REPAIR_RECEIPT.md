# PR #556 — batch-15 repair receipt

Branch: `codex/sandbox/batch-15`; original head: `0fac585a92c88dd39d212726b913e557eb75d257`; repair code: `65372780`.

Main `56b74eaec205e86c9eaf7eee75d85ade2599a364` (#555) was merged without conflict edits in `46f10fb5`. Main's top migration is 0589. Reserved 0590 and 0591 remain numbered and named as reserved; 0590 SQL is unchanged.

## Causes and repairs — one line each

1. 0591's definer was excluded by the original-byte table's FORCE RLS policy, producing empty photo tags; return metadata, read the bytes as runtime, and validate session/job/evidence/version/hash/length in a narrow parser routine with an updated exact catalog proof.
2. The siteExtras method-list assertion omitted the existing `sorRecentItems`; include it in the exact method contract.
3. Chromium proved two disabled BUTTON nodes at 2.0014209747314453:1 at each width; give disabled buttons explicit AA foreground/background/border colours and retain the unchanged contrast assertion.
4. The reachable observation page POST fell through to the GET-only `[promptId]` route and returned 405; add the real POST through the sibling origin/mode/session/application checks and classify it alongside the existing checked contractor commands, keeping the intended screen functional.
5. The real ENT-5 journey omitted Finished, correctly leaving photo attachment disabled; select Finished first and execute reject/revise/withdraw, replay/conflict, stale approval, the race and foreign-tenant refusal on real routes at both widths.
6. The mocked withdrawal fixture left the newly added duplicates panel unmocked, adding a second alert; supply an empty versioned duplicates response while preserving the original alert assertion.

The observations route was added rather than withdrawing the page: the existing checked application and database command already provide the required authority and persistence. No second authorization implementation was introduced. A real browser/PostgreSQL test proves stored PNG tags, refusal checks, save, one persisted observation and exact replay; the separate mocked screen test injects transport failures only.

## Exact validation commands and results

Every `pnpm` command below used pnpm 10.28.1 with `export PATH=/workspace/jobguard/work/bin:$PATH`; Node is 24.19.0. Source checks exercised the tree committed as `65372780`; this receipt changes documentation only.

| Command | Result |
| --- | --- |
| `CI=true PNPM_HOME=/workspace/jobguard/work/pnpm COREPACK_HOME=/workspace/jobguard/work/corepack corepack pnpm install --frozen-lockfile --store-dir /workspace/jobguard/work/pnpm-store` | PASS; lockfile unchanged. |
| `pnpm build` | PASS; all 7 build tasks on merged main. |
| `pnpm typecheck` | PASS; all 7 tasks on merged main. |
| `pnpm lint` | FAIL at the exact lane scope check described below; core purity passes and every other lint script/workspace task passes separately. The guard remains enforced. |
| `node tools/money-arithmetic-lint.mjs && node tools/commercial-boundary-lint.mjs && node tools/ai-provider-boundary-lint.mjs && node tools/plpgsql-case-in-if-lint.mjs && pnpm exec turbo run lint` | PASS; all four remaining root lint scripts and all 7 workspace lint tasks. |
| `pnpm exec turbo run build --filter=@jobguard/ai... && pnpm --filter @jobguard/ai eval:contract` | PASS; fixture gateway, zero provider spend, no live-model claim. |
| `node --test tools/*.test.mjs` | PASS; 423 tests, zero skipped, after merging main. |
| `VITEST_MAX_WORKERS=2 pnpm exec turbo run test --filter='!@jobguard/db' --concurrency=1 --env-mode=loose` | PASS; 12 tasks; core 4665 tests/210 files, API 3987/225 plus OpenAPI check, web 1736/127, AI 276/20, config 344/18, storage 108/8 with 2 existing external-storage skips. |
| `pnpm --filter @jobguard/db test --shard=1/4` | PASS; 190 files, 1713 tests passed, 15 existing TODOs, exit 0. |
| `pnpm --filter @jobguard/db test --shard=2/4` | PASS; 190 files, 1396 tests passed, exit 0. |
| `pnpm --filter @jobguard/db test --shard=3/4` | PASS; 190 files, 1676 tests passed, 4 existing TODOs, exit 0. |
| `pnpm --filter @jobguard/db test --shard=4/4` | PASS; 190 files, 1698 tests passed, exit 0. |
| `CI=true FONTCONFIG_PATH=/tmp/fonts pnpm --filter @jobguard/web exec playwright test --config=../../work/playwright.config.ts ENT-3.spec.ts ENT-5-chain-actions.spec.ts ENT-5-duplicate-candidates.spec.ts ENT-8a-completion-observations.spec.ts ENT-8a-possible-extras.spec.ts` | PASS; 36 tests, mobile-360 and desktop (360px/1280px), 4.2 minutes, zero retries. The full real ENT-5 journey and actual observation save/replay/refusal pass at both widths. |

## Reproduction and environment evidence

- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/enterprise-live-prompt-repository.integration.test.ts` — original head FAIL: 1 failed/2 passed; stored photo tag expected, `photoTags: []` received.
- `pnpm --filter @jobguard/api exec vitest run src/contractor/site-visit.application.test.ts` — original head FAIL: 1 failed/58 passed; actual method list also contained sorRecentItems.
- Actual unauthenticated POST to `/api/contractor/jobs/:id/possible-extras/observations` — original production build returned 405 at both widths; final real-route test requires 401 before sign-in and proves authorized persistence.
- `CI=true FONTCONFIG_PATH=/tmp/fonts pnpm --filter @jobguard/web exec playwright test --config=../../work/playwright.config.ts ENT-5-duplicate-candidates.spec.ts` — original screen FAIL at both widths; each audit identified two BUTTON nodes with `disabled` attributes and ratio 2.0014209747314453 against AA 4.5. Diagnostic node attachments were added; the assertion and audit options are unchanged.
- The Playwright CDN download is forbidden by environment network policy; installed Chromium 154 removed Audits.checkContrast. `npm install --prefix /workspace/jobguard/work/browser140 --cache /workspace/jobguard/work/npm-cache --ignore-scripts --no-audit --no-fund @sparticuz/chromium@140.0.0` supplied Chromium 140.0.7339.0 from the permitted npm registry. The temporary config selects `/tmp/chromium`, preserves both viewport projects and zero retries, sets test/global setup paths and webServer cwd, and uses extracted fonts. No security-disabling package arguments or audit exclusions were used; no application dependency changed.
- Early concurrent builds/checks caused timing failures; the complete final non-DB stage passed against the completed, stable production build with bounded workers. No timeout or assertion changed. `VITEST_MAX_WORKERS=1 pnpm --filter @jobguard/api exec vitest run src/shadow-isolation.application.test.ts -t 'Test Q: successful mutations'` also passed in 31.75s before the full successful API rerun (the other 21 tests were filtered in this focused diagnostic run only).
- DB shard 4 initially exposed `spawn pg_dump ENOENT` in `lp6a-practice-restore.integration.test.ts`: the embedded server was available but command-line clients were absent. Official Debian `postgresql-client-17_17.11-0+deb13u1_amd64.deb` and `libpq5_17.11-0+deb13u1_amd64.deb` were downloaded from `https://deb.debian.org/debian/pool/main/p/postgresql-17/`, extracted with `dpkg-deb -x` under `work/pg-client/root`, and selected through task-local `work/bin/pg_dump` and `work/bin/psql` wrappers with the local libpq path. No system install, source change or test change was required.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lp6a-practice-restore.integration.test.ts` — PASS after adding clients: all 3 tests, including real logical dump/restore and colliding-xid refusal. Full shard 4 was restarted with the prerequisite present; its final result is in the table above. Stopped/overloaded attempts are not reported as passes.

## Lane approval hold

Automatic approval review rejected extending `config/lanes/batch-15.json`, stating that the lane authorization change was not authorized merely by the repair request. The allowlist and lint implementation remain unchanged. Root lint therefore correctly refuses these seven required repair paths plus this receipt path:

- `apps/api/src/contractor/site-visit.application.test.ts`
- `apps/web/app/api/contractor/jobs/[id]/possible-extras/route.test.ts`
- `apps/web/app/api/contractor/jobs/[id]/possible-extras/observations/route.ts`
- `apps/web/app/lib/possible-extras-server.ts`
- `apps/web/app/northside/northside.module.css`
- `apps/web/e2e/ENT-8a-possible-extras.spec.ts`
- `apps/web/e2e/helpers/tagged-completion-photo.ts`
- `docs/verdicts/batch-15/REPAIR_RECEIPT.md`

The pending request is to register only those exact paths for the existing branch, with no wildcard or rule change. This is the remaining core-checks hold; the root core-checks stage must not be described as fully green until `pnpm lint` passes.

This repair adds no columns to fingerprinted tables, storage policies, existing table grants, or SET app.* function clauses. RLS, session checks, money rules, hidden-data rules and all test assertions remain enforced. All fixtures are fictional. This is builder test evidence, not an independent RED verdict or approval to merge.

## ENT-3-RELINK-FIX — 5 November 2026 — RED, NOPR

READY for router handoff, not PostgreSQL-verified or independently reviewed.
Regression tests were written before migration 0966. The populated upgrade test
reproduces same-direction/reverse-direction relink and revision failures on the
predecessor schema before applying the repair. It then checks unchanged stored
rows and security metadata, exactly two replaced routine bodies, migration
replay, both relink directions and separate export through existing commands.
Fresh-schema cases cover deterministic-candidate relink/export in both
directions, old-unlink replay versus a fresh link, command conflict, separate
approved extras and reapproval after revision, forged input and a mismatched
SQL receipt actor, uncovered grants, wrong roles/tenant, a relink/unlink race,
exported-endpoint refusal, and preservation of a duplicate-dismissed pending
approval. No ENT-5 dismissal command exists in this branch.

0966 starts from the latest xa_mark_duplicate body (0522), preserving its LP5
effect handoff and all permission checks. The actual repair is the shared
xa_latest_kind projection: skip only a duplicate event whose exact command's
link was explicitly reversed in the same tenant/job. This avoids separate
restoration logic in marking, pricing and export; it preserves stored events
and outcomes. No columns, grants, app.* SET clauses, new commands or routes.
The proof retains an exact SHA-256 for the replaced private helper, calculated
from PostgreSQL 16 rendering (the same rendering matches its predecessor's
existing protected hash). No baseline fingerprint or existing assertion was
weakened. Recovery is a reviewed forward fix, with no history deletion.

Local validation uses installed Node 24.17.0 and cached pnpm 10.28.1 via
`node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`.
For Turbo, PATH begins with `/tmp/xa-relink-pnpm-bin`, a shim to that same cached
pnpm; the global pnpm tried its version manager and was interrupted. Nothing
was downloaded. At most two workers per test invocation; no database/browser
was started.

- Workspace prerequisite builds (core/config/storage, then db and ai): PASS.
- `pnpm typecheck --concurrency=2`: PASS, all seven packages. Turbo reported
  sandbox cache IO warnings; commands completed successfully.
- DB Vitest `--maxWorkers=2 test/migration-proof-loader.test.ts test/extra-approval-timing.test.ts src/extra-duplicate-candidates.test.ts`: PASS, 94 tests.
- DB Vitest `--maxWorkers=2 test/extra-relink-migration.test.ts test/migration-proof-loader.test.ts src/extra-duplicate-candidates.test.ts`: PASS, 80 tests, including the new exact writer-preservation and helper-digest checks.
- API context-boundary and identity checks: PASS, 152 tests across the two
  files. The companion watchdog collection initially required db/ai builds;
  those prerequisite builds were then completed. See the final result below.
- DB `vitest list --maxWorkers=1 test/extra-duplicate-candidates.integration.test.ts test/extra-relink-upgrade.integration.test.ts test/plan-entitlement-lifecycle-upgrade.integration.test.ts`: PASS, all 12 cases collected, including all seven new regression/upgrade cases. Collection is not database execution.
- `node tools/plpgsql-case-in-if-lint.mjs`: PASS, 257 migrations.
- `git diff --check`: PASS.
- `LANE_BASE_REF=codex/sandbox/batch-15 node tools/agent-lane-boundary-lint.mjs`:
  FAIL only for inherited changes to config/lanes/batch-14.json and
  config/lanes/batch-15.json already present at starting HEAD. They were not
  changed by this repair and cannot be granted by this lane. The repair-only
  paths pass the existing lanePathAllowed validator. The new lane lists every
  non-lane file differing from local batch-15, including inherited work, and
  does not list itself. Router must reconcile the inherited lane changes when
  choosing the landing base; the guard was not changed.

CI must execute the real PostgreSQL regression/upgrade cases above, existing
extra-unlink and approval-chain suites, billing export/race tests, LP0 catalog,
tenancy and migration/fingerprint gates, plus required full CI and affected
mobile/desktop journeys. The upgrade test must prove the old failure and repaired
journey, not just migration parsing. Exact-head independent RED review remains
required before merge. No git writes, commit, push, PR or release performed.

Final watchdog result: `pnpm --filter @jobguard/api exec vitest run
--maxWorkers=2 src/watchdog-registry.test.ts` — PASS, 126 tests after building
its existing workspace prerequisites. All selected local checks now pass except
the explicitly recorded inherited lane-file conflict.


## batch-37 pre-check repair — 5 November 2026

READY for router commit/push as NOPR; not a CI or independent-review verdict.
Applied only the four fixes specified in coordinator/prechecks/batch-37-r.md:
leave sorItem absent for free-text unlink fixtures; rebase 1201 registry proof
on 0609's exact 63 rows and insert ResolveDuplicateCandidates in jsonb text
order (64 after); include the new row in restore-reconciliation's sorted
expectation and the two unit-test registry expectations. Resolved both incoming
main conflicts as unions: retain both empty tables and both registry constants.
Product implementation and migration SQL were not changed in this repair.

Executed with the installed cached pnpm 10.28.1 entrypoint
(`/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`), one
invocation at a time, maxWorkers=2, at most three named Vitest files per run:

- DB `vitest run --maxWorkers=2 test/late-source-import-migration.test.ts test/m2-1-migration-proof.test.ts test/migration-proof-loader.test.ts`: PASS, 83 tests, three files.
- DB `vitest run --maxWorkers=2 test/extra-relink-migration.test.ts test/lp5-command-catalog.test.ts test/lp5b-command-catalog.test.ts`: PASS, 15 tests, three files.
- DB `vitest run --maxWorkers=2 src/extra-duplicate-candidates.test.ts`: PASS, four tests.
- DB `vitest list --maxWorkers=2 test/extra-duplicate-candidates.integration.test.ts test/restore-reconciliation-upgrade.integration.test.ts test/serious-b5-upgrade.integration.test.ts`: PASS, 17 cases collected only; no PostgreSQL execution claimed.
- `git diff --check`: PASS.

Read-only checks against local origin/main 199124c0885ca27558fbaf62a9a74dee7ad2818f:
only migrations 1200/1201 are added; neither repeats a main migration stem and
no main migration is edited. Latest definitions found on main: xa_mark_duplicate
0522, xa_latest_kind 0158, cb_unresolved 0243, extra_duplicate_candidates 0590.
Confirmed the mark writer is exact except its explanatory comment, the state
projection/order is retained, candidate authority and link projection are
unchanged, and the old matching predicates are retained in shared grouping.
Proof before equals 0609 after exactly; before/after both sort in PostgreSQL
jsonb text order. Both conflict files have no remaining markers.

The lane lists exactly all 28 non-lane paths differing from origin/main and
never lists itself. The existing lanePathAllowed validator accepts all 29
working-tree paths (including its own lane file). The standard
`LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` currently
fails on incoming batch-28/main paths because its local mode includes the
uncommitted merge's staged changes from HEAD. The read-only index still marks
the two conflict files unmerged; the router must stage the resolved unions,
complete the merge/commit and rerun the standard lane gate. No widening to main's
paths, alternate-base pass, or gate change was used.

No Git writes, installation, PostgreSQL, localhost or browser process was run.
GitHub CI must run required database, browser and full suites after router push;
independent RED review must bind the resulting exact head. No release/merge or
independent PASS is claimed.
