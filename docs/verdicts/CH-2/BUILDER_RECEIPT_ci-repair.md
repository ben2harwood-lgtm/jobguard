# CH-2 CI repair — builder receipt

**Task:** CH-2 (PR #97), branch `codex/sandbox/ch-2`
**Repair builder:** Claude Sonnet 5.5 (the first version was built by Codex GPT-6.1 Sol, whose sandbox could not run PostgreSQL or a browser)
**Repaired from:** `ebd93fa` (PR head when CI failed)
**Status:** repaired and locally tested. **Not independently verified, not accepted.** No verdict is claimed. A different model checks these commits, a Claude Opus reviewer checks the Codex code, and acceptance is a separate actor.

## What failed in GitHub CI

Run 37151967016 failed at `pnpm test`, so `pnpm build` and the browser suite never ran. Three database test files failed:

| File | Failure |
|---|---|
| `test/demo-bootstrap.integration.test.ts` | `unrecognized configuration parameter "app.tenant_id"` while applying migration 0050 |
| `test/sandbox.integration.test.ts` | same error (suite setup calls `bootstrapSyntheticDemo`) |
| `test/UIWIRE-12.integration.test.ts` | `expected 43 migrations, got 42` in the suite setup |

The CH-2 suite itself (`watchdog.integration.test.ts`, 36 tests) passed in CI.

## Root causes and fixes

1. **Migration 0050 cannot be applied by the migration owner (real defect).**
   0050 adds job-qualified foreign keys to tables that `FORCE ROW LEVEL SECURITY`. Deployments and the e2e global setup apply migrations as `jobguard_migration` (owner, not superuser, no BYPASSRLS, no tenant context). Validating a foreign key scans both tables as that role, so the tenant policies run with no tenant: the strict `material_requirement` and purchase-order policies raise the error above, and the lenient evidence/job policies would hide every row, so a legacy cross-job link would pass unseen. The CH-2 suite only applied 0050 as a superuser, which bypasses RLS, so it never hit this path. It also meant the e2e global setup would have failed for every spec.
   *Fix (f417e7a):* inside the migration transaction, suspend FORCE on exactly nine tables (`job`, `scope_identity`, `material_requirement`, `purchase_order_draft`, `evidence_upload`, `evidence_object`, `evidence_link`, `stage_completion`, `synthetic_evidence_original`), add and validate the constraints across all tenants, restore FORCE and assert it was restored. The ALTER TABLE locks are ACCESS EXCLUSIVE and held to commit, so no runtime session can read those tables while FORCE is suspended. The migration was not renumbered.
   *New test (f417e7a):* `test/watchdog-migration-owner.integration.test.ts` applies 0050 as `jobguard_migration` to a previous-schema database that holds a legacy cross-job link in another tenant. It checks that the link is found (SQLSTATE 23503), nothing is half-applied, FORCE RLS is intact, and after a forward-fix the same migration applies with every constraint validated. Run against the original 0050 it fails for the expected reason (see the table below).
   *Docs (77e4ef2):* `packages/db/MIGRATIONS.md` records the approach, the lock cost and the forward-fix.
2. **Migration-count assertions (002ca86).** `UIWIRE-12.integration.test.ts` asserted 42 migrations in two places; this branch applies 0050 on top of 0041, so the total is 43 (the `0000..0041` range query stays 42). `demo-bootstrap.integration.test.ts` already said 43. Counts match this branch only; the integrator re-adjusts at merge.
3. **Lane allow list.** `UIWIRE-12.integration.test.ts` and the new test were not in the CH-2 lane in `config/agent-lane-assignments.json`, so CI's committed-range lane check would have failed. The exact two paths were added to the CH-2 lane only.
4. **CH-2 e2e spec written without a browser (1bdf234).** It failed in both projects. (a) The purchase-order form, and so "Preview proposed order", only renders after a material and agreed price are saved, so the spec now saves them first (a quoting input, allowed before live) and then asserts every primary action is disabled with the "Switch this job live" copy. (b) The demo's Jobs list shows only its three seeded jobs, so the captured job was never a link on `/`; the step now reopens it by deep link. No assertion was removed or loosened; refresh, deep link and a second browser context still read the persisted result.
5. **PR conflicted with main (1486acc).** `config/agent-lane-assignments.json` is one JSON line, so this branch's `ch-2` lane edit conflicted with main's `d13-16-ids` lane edit (PR #96 merged while this was open). GitHub does not run `pull_request` CI on a conflicting PR. Merged `origin/main` into the branch (no rebase, no force-push) and resolved the file as a lane-level three-way merge. Result differs from `origin/main` in the `ch-2` lane only.

No product code was changed. No test was weakened, skipped, retry-wrapped or given a longer timeout. No other task's lane was edited.

## Commits

| SHA | Subject |
|---|---|
| f417e7a | fix(db): apply 0050 foreign keys as the non-superuser migration owner |
| 002ca86 | test(db): count migration 0050 in the UIWIRE-12 upgrade assertions |
| 1bdf234 | test(e2e): make the CH-2 spec match the rendered watchdog panels |
| 77e4ef2 | docs(db): record how 0050 validates under FORCE row-level security |
| 1486acc | merge: bring origin/main (D13-16-IDS #96) into codex/sandbox/ch-2 |
| (this commit) | docs(verdicts): CH-2 CI-repair builder receipt |

## Commands run (macOS arm64, Node 24.17.0, pnpm 10.28.1; heavy ones wrapped in `heavy-slot ch-2`)

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | lockfile up to date |
| `pnpm typecheck` | 0 | 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7/7 tasks plus core-purity, lane, money and commercial-boundary lints |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `ch-2` passed (re-run after the merge) |
| `pnpm build` | 0 | 7/7 tasks (Next.js production build) |
| `pnpm openapi:check` | 0 | generated file matches |
| `git diff --check` | 0 | no whitespace errors |
| Red proof, original 0050: `vitest run test/demo-bootstrap test/sandbox` | 1 | demo-bootstrap fails with `unrecognized configuration parameter "app.tenant_id"` (same SQL context as CI); sandbox suite fails to start |
| Green, fixed 0050: demo-bootstrap, sandbox, UIWIRE-12, tenancy, watchdog | 0 | 5 files, 71 tests |
| Red proof for the new test, original 0050: `vitest run test/watchdog-migration-owner` | 1 | 2 failed, 1 passed, same GUC error |
| `pnpm test` | 0 | node tools 39/39; config 2; storage 4; ai 72; web 56; core 394; api 97 (includes the health test); db 189 in 36 files |
| `pnpm test:db` | 0 | 36 files, 189 tests |
| `pnpm test:migrations` | 0 | 2 files, 11 tests |
| e2e, this task and every spec the task changed: `CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop CH-2 M2-1B-S M2-2-S M2-3-S M2-4-S M2-5-S M2-6-S M2-7-S` | 1 | first run: 16 passed, 2 failed (CH-2, both projects; fixed in 1bdf234); all 16 M2-* test runs passed |
| e2e `CH-2.spec.ts`, both projects, after the fix | 0 | 2 passed (mobile-360, desktop) |
| e2e all 40 other specs, both projects (full CI-equivalent coverage) | 1 | 142 passed, 4 failed: UIWIRE-1 (desktop), UIWIRE-2, UIWIRE-7, UIWIRE-9 (mobile-360). The Mac's load average was 75–133 (other agents' suites): `ECONNRESET`, a 30 s timeout and missing-element timeouts |
| e2e re-run of UIWIRE-1, -2, -7, -9, both projects, machine quiet | 1 | 23 of 24 passed; UIWIRE-2/-7/-9 pass in both projects; UIWIRE-1 "split and merge" failed once (mobile-360) |
| e2e `UIWIRE-1.spec.ts` ×6 per project | 1 | 71 of 72 passed; one failure ("a human omitted line", mobile-360, first repetition) |

**UIWIRE-1 is intermittent and I did not fix it.** It failed in 3 of 96 test runs ("split and merge" twice, "a human omitted line" once), each time on a missing "Description …" field in the capture review screen after a click, and passed on every other run. CH-2 changes none of that screen. I did not run it against a clean `main` checkout to prove it pre-dates this branch, so that is an inference. I did not alter, skip or retry-wrap it.

## Not run, and why

- **Playwright's pinned browser.** Chromium 1193 for Playwright 1.55.1 is not installed and downloading it needs Ben's permission. The e2e runs used an uncommitted local config (kept outside the repository, in the session scratch folder) that only sets `executablePath` to the installed `chromium_headless_shell-1234`; projects, viewports, web server (`next start` on the production build, `CI=1`) and global setup are the repository's. GitHub CI is the pinned-browser proof.
- `gitleaks` and `dependency-review` are CI-only jobs (both passed on the original head). `pnpm eval` has no separate wrapper beyond `@jobguard/ai` tests, which ran inside `pnpm test`; no prompt, model, schema or extraction policy changed.
- The e2e suite was not re-run end to end after the final commits: only `CH-2.spec.ts` and test/docs/lane/merge changes came after the full run, and none touch product code.
- Embedded PostgreSQL first failed to start here because pnpm skipped the `@embedded-postgres/darwin-arm64` postinstall (no dylib symlinks). I ran that package's own `hydrate-symlinks.js` inside `node_modules`; nothing tracked changed, no test was altered.

## Remaining gates

GitHub CI on the new head; an independent exact-commit verdict by a different model; Claude Opus review of the Codex code; separate technical acceptance; the integrator re-adjusting the migration counts and the lane file at merge time. Nothing here releases a hold, provider, spend, deploy or decision.
