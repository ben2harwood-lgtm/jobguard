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

---

# Round 2 — repair of the Sol check (REPAIR on e12825c)

**Repair builder:** Claude Sonnet 5.5, same rules as round 1. **Not independently verified, not accepted.** Inputs: GPT-6.1 Sol high check `ch-2-solcheck-20261003T233807.md` (REPAIR, four P2, no P1) and the Claude Opus PASS comment on e12825c with its two non-blocking notes. Every fix was written test-first: the new tests were run red against the unchanged code before the fix.

## Findings

| Finding | Status | Test (red first) | Fix |
|---|---|---|---|
| P2-1 Replay returns current state, not the first result | **Fixed** | 205ed19: plan and advance replays after a later plan exist must equal what they first returned (failed: replay returned revision 2) | ca3924e |
| P2-2 Advance reuses a command id across jobs | **Fixed** | 205ed19: job A's advance id conflicts on live job B and creates nothing there (failed: it succeeded) | ca3924e |
| P2-3 Registry misses non-POST mutations | **Fixed** | 9fc2b79: AST discovery with negative tests (below) | 9fc2b79 (the test file holds the discovery) |
| P2-4 Jobs navigation absent from browser acceptance | **Addressed for every job the Jobs list can show; the captured job under test cannot be reached there. OPEN FOR BEN below** | ee2bd00 | none needed in product code |
| Opus note 1: pre-deploy mislink query | **Done** | a01684e: the owner suite runs the documented text, finds the known mislink before 0050 and none after the forward-fix (it failed first: the text did not exist) | a01684e |
| Opus note 2: drop `id` from `UPDATE(...)` on `evidence_upload` | **Not applied, with a test instead** | — | see below |

**P2-1 and P2-2 (`packages/db/src/readiness-repository.ts`).** A replay of `record` or `advance` now returns the view as of that command. Snapshots and decisions are append-only and a decision only ever attaches to the latest snapshot, so the view is derived exactly from persisted rows: decisions on earlier snapshots, plus its own decision when the command was the advance. Nothing new is stored, so no migration changed for this. `advance` now refuses a prior command that belongs to another job, new request hashes cover the job id, and a decision stored under the earlier input-only hash still replays on its own job (tested by rewriting a stored hash to the earlier form, on its own job and on another). A changed payload still conflicts.

**P2-3 (`apps/api/src/watchdog-registry.test.ts`).** Web route discovery now reads the TypeScript AST and sees function, const/let and destructured exports, `export { x as VERB }`, `export { VERB } from` and `export *` (followed), for POST, PUT, PATCH and DELETE; comments and strings do not count. Nest discovery covers every `@Post/@Put/@Patch/@Delete/@All` on any `@Controller` class in any file (not only `*controller.ts`), accepts string, array and `{path}` forms, and fails closed on a non-literal path. Non-POST verbs are keyed `VERB /path` (POST keeps the existing path-only key), so the registry convention for existing entries is unchanged. Negative tests prove an unclassified PATCH, PUT, DELETE, `@Patch`, `@Put`, `@Delete` and `@All` each fail, and the real tree is classified in both directions (no stale registry entry). The three existing guard tests are unchanged. The old discovery was one regular expression for `export function POST`, which cannot see any of the above.

**P2-4 (`apps/web/e2e/CH-2.spec.ts`).** The Jobs list deliberately shows only the demo's seeded jobs: `readSyntheticDemo` excludes any job that has a capture proposal or a sandbox run, and other suites (`SBOX-1`, `shell`) click the single "Open this job" link. So the captured job cannot be a Jobs link without a product change. Two tests now click the real Jobs link of the seeded live job (Kitchen extension) and the seeded quoting job (Loft conversion) in both projects and assert the persisted status label, job identity, reload and a second browser context; for the quoting job a real readiness write is refused with 409 `JOB_NOT_LIVE` and the job and its readiness record are unchanged. The captured-job journey keeps refresh, deep link and a second context.

**Opus note 2.** I dropped `id` from the grant and 13 PostgreSQL tests failed: `EvidenceService.beginUpload` retries with `ON CONFLICT (tenant_id,id) DO UPDATE SET id=EXCLUDED.id`, a no-op that returns the existing row, and that needs `UPDATE(id)`. Removing it means rewriting that upsert, which is outside CH-2 and not cheap, so I restored the grant, documented why in `MIGRATIONS.md`, and added a test that a real change of `id` by the runtime role is refused by the guard with 42501 and leaves one row.

## Commits

| SHA | Subject |
|---|---|
| 205ed19 | test(db): readiness replay returns the first result and is bound to its job |
| ca3924e | fix(db): readiness replays return the first result; advance ids bind to the job |
| 9fc2b79 | test(api): discover every mutation verb and form in the job-mutation registry |
| ee2bd00 | test(e2e): reopen jobs through their Jobs links and check the persisted lifecycle |
| a01684e | docs(db): pre-deploy mislink check for 0050; prove evidence_upload.id cannot change |
| (this commit) | docs(verdicts): CH-2 round-2 receipt |

Migration 0050 is byte-identical to round 1. No existing assertion, timeout or retry was changed.

## Commands run (same Mac and heavy-slot rules)

| Command | Exit | Result |
|---|---|---|
| `vitest run` readiness, owner and watchdog suites, new tests, unchanged code | 1 | red as intended: 6 failed, 38 passed |
| `pnpm --filter @jobguard/api exec vitest run src/watchdog-registry.test.ts` | 0 | 24 tests |
| first green attempt, with `id` dropped from the grant: `pnpm test:db` | 1 | 13 failed (evidence, practice-scope, restore rehearsal); led to restoring the grant |
| `pnpm typecheck` | 0 | 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7/7 tasks plus custom lints |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `ch-2` passed |
| `pnpm openapi:check` | 0 | matches |
| `git diff --check` | 0 | clean |
| `pnpm build` | 0 | 7/7 tasks |
| `pnpm test` | 0 | node tools 39; config 2; storage 4; ai 72; web 56; core 394; api 99; db 192 in 36 files (CI counts 3 fewer db tests because the local run also executes the compiled `dist` copy of `demo-seed.test`) |
| `pnpm test:db` | 0 | 36 files, 192 tests |
| `pnpm test:migrations` | 0 | 2 files, 11 tests |
| e2e `CH-2` (now 3 tests), `M2-1B-S`…`M2-7-S`, `UIWIRE-7`, `UIWIRE-9`, both projects, same uncommitted local browser config as round 1 | 0 | 28 passed |

A first e2e run was interrupted (SIGINT, clean teardown) because it had started with the `id` grant dropped and so was invalid; ports 3000 and 55432 were free afterwards.

## Not run, and residual

- The other 38 e2e specs were not re-run locally (no product code outside the readiness repository changed); GitHub CI runs all of them.
- **Residual, not in the Sol findings:** an `advance` that finds a decision already on the latest snapshot writes nothing, so that command id is never stored. Replaying it after a newer plan exists would create a decision for the newer snapshot instead of repeating the first no-op. Fixing that needs a stored command record (a schema change); I did not widen the migration.
- Opus's note that 0050 holds nine ACCESS EXCLUSIVE locks (a short write pause) is already documented; run the pre-deploy check in a quiet window.

## OPEN FOR BEN

Should a job created through the capture journey appear in the demo's Jobs list? Today it does not, by design, and that is why the CH-2 browser tests reopen the captured job by deep link and use the seeded jobs for the Jobs-link path. My lean: not as part of CH-2. Changing the list touches `SBOX-1`, `shell` and the demo's story, so it is a product decision, not a repair.

---

# Round 3 — repair of the second Sol check (REPAIR on eed9a04)

**Repair builder:** Claude Sonnet 5.5. **Not independently verified, not accepted.** Input: GPT-6.1 Sol high check `ch-2-solcheck-20261004T033348.md` (REPAIR, four P2). The coordinator allowed extending this task's own unmerged migration 0050 for a command record; 0050 is not renumbered. Each fix was written test-first and the tests were run red on the unchanged code.

## Findings

| Finding | Status | Tests (red first) | Fix |
|---|---|---|---|
| P2-1 Successful no-op advances lose their command identity | **Fixed** | 9f96961: no-op advance replays its first result, conflicts on a changed payload, another job and after a later plan; parallel duplicates store one command; a parallel reuse on another job loses (failed: it accepted a changed payload, worked on another job and created a decision after a newer plan) | 13e849f |
| P2-2 Things-to-check replays return current state | **Fixed** | 9f96961: evaluate, review and bill supersession replay after later reviews and supersessions (failed: replay returned the latest finding, outcome and reduction) | 13e849f |
| P2-3 Aliased Nest decorators evade discovery | **Fixed** | e7dfedf (failed: the aliased `Patch` found no route) | e7dfedf |
| P2-4 C7 Jobs navigation for the captured job | **Left open as instructed: OPEN FOR BEN** | — | none |

**P2-1 and P2-2: stored command results.** Migration 0050 gains `app.watchdog_command_result`, keyed by `(tenant_id, command_id)` with the job, the kind (`readiness.advance`, `things_to_check.evaluate`, `things_to_check.review`, `things_to_check.supersede`), a request hash over the job id and the input, and the exact result first returned (jsonb). It is tenant FORCE RLS with a lenient tenant policy, owned by `jobguard_migration`, runtime SELECT and INSERT only (no UPDATE, DELETE or TRUNCATE; `jobguard_infrastructure` has no access), guarded by the same live-job insert trigger, and has a composite foreign key to the job. Each command writes its row in the same transaction as its effects, for every success including a no-op, so the command id and result are atomic with the effect. Replay returns the stored result; the same id with a changed payload, on another job or as another command kind conflicts. Same-job commands are serialised by a per-job advisory lock taken after the live guard and before any audit append, so a parallel duplicate waits and replays; a parallel reuse on another job loses on the primary key and reports `IDEMPOTENCY_CONFLICT`. Rows from before it existed still replay from their own tables on their own job (`record` keeps its exact derivation from persisted rows, unchanged). `MIGRATIONS.md` documents the table. The two stored-command kinds that return state use the one rule, so evaluate, review and supersession now behave like readiness.

**P2-3.** Every class and method decorator is resolved through its import: renamed and namespace imports and local const re-bindings of `@nestjs/common`'s `Controller`, `Post`, `Put`, `Patch`, `Delete` and `All` are found; decorators from other `@nestjs` packages are ignored; anything that does not resolve to a `@nestjs` package (a local or imported wrapper, a computed decorator) fails closed with "cannot tell whether … declares a route" instead of being skipped. Negative tests show aliased, namespaced and re-bound endpoints fail classification and wrappers are refused. The real tree still classifies both ways.

## Commits

| SHA | Subject |
|---|---|
| 9f96961 | test(db): no-op advances keep their command identity; things-to-check replays return the first result |
| 13e849f | fix(db): store every successful watchdog command's first result; replay returns it |
| e7dfedf | test(api): resolve aliased and namespaced Nest decorators in the mutation registry |
| (this commit) | docs(verdicts): CH-2 round-3 receipt |

The new test file and the existing tenancy catalog test are added to the CH-2 lane by exact path; the tenancy test's exhaustive table lists gain the new table (a necessary consequence of adding a table, not a loosened check).

## Commands run (same Mac and heavy-slot rules)

| Command | Exit | Result |
|---|---|---|
| readiness, things-replay and watchdog suites, new tests, unchanged code | 1 | red as intended: 15 failed |
| registry test, alias tests, unchanged discovery | 1 | red as intended: 1 failed of 25 |
| `pnpm typecheck` | 0 | 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7/7 tasks plus custom lints |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `ch-2` passed |
| `pnpm openapi:check` | 0 | matches |
| `git diff --check` | 0 | clean |
| `pnpm build` | 0 | 7/7 tasks |
| `pnpm test` | 0 | node tools 39; config 2; storage 4; ai 72; web 56; core 394; api 100; db 199 in 37 files |
| `pnpm test:db` | 0 | 37 files, 199 tests |
| `pnpm test:migrations` | 0 | 2 files, 11 tests |
| e2e `CH-2` (3), `M2-1B-S` to `M2-7-S`, `UIWIRE-7`, `UIWIRE-9`, both projects, same uncommitted local browser config | 0 | 28 passed |

A first full run failed only the two exhaustive table-list checks in `tenancy.integration.test.ts` (they list every table, and the new one was missing); after adding the table to those lists the suites above passed. The e2e run preceded that list-only edit and no product code changed after it.

## Not run, and residual

- The other 38 e2e specs were not re-run locally; GitHub CI runs all of them.
- `record` (plan) still derives its replay from persisted rows rather than a stored result; it is correct by construction and covered by the round-2 tests.
- Evaluate, review, supersede and advance now share one stored-result rule. The other live-only commands (orders, supplier documents, matches, inbox) were not part of these findings and are unchanged.

## OPEN FOR BEN

Unchanged from round 2: whether a job created through the capture journey should appear in the demo's Jobs list (P2-4: the checker wants the captured job reopened through Jobs, or a formally approved C7 amendment). My lean: decide it as a product change after CH-2, not inside this repair.
