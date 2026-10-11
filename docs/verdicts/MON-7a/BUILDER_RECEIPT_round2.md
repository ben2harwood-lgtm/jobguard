# MON-7a builder receipt — main integration, round 2

Branch/lane: `codex/sandbox/mon-7a` / `mon-7a` (PR #121). Starting head: `191db2c` (integrator merge of main
`df1f9c1` = CH-3a + SEC-DEPS-2026-10-08 #122 + CH-2 #97 + M4-1-S-R #103). `origin/main` was re-fetched and is still
`df1f9c1`. The earlier Opus PASS at `e7c314f` and Ben's ruling are untouched: **B4 / MON-7b stays PARKED**, no exposure
figure, curve or schedule was built. `packages/db/migrations/0103_prevention_checks.sql` is byte-identical (not edited).
Synthetic data only; nothing pushed, merged or deleted; no live provider, send, spend or approval. The builder does not
review or accept this leaf.

**One blocker remains: CH-2's registry test fails on two MON-7a routes, and the fix is in a file outside this lane
(`packages/core/src/watchdog.ts`). I did not edit it. See Item 2(a).**

## Item 1 — re-applied MON-7a's changes on top of main's files

Both files were first diffed token by token (base `0264158` to `e7c314f`) to get MON-7a's exact changes, then re-applied
to main's version. A token diff of main's version against the result shows exactly these insertions and nothing else, so
every CH-2 and CH-3a change in these files is kept.

- `apps/web/app/ui/quote-editor.tsx` — two insertions, the same two MON-7a had:
  1. `import { PreventionChecks } from "./prevention-checks";` as the first import, directly after `"use client";`
     (before `JobVariations`; main's `WatchdogPanel` import is left where it is).
  2. `<PreventionChecks jobId={jobId}/>` between `</fieldset>` and `</section>}`, i.e. after the quote layout, outside
     the existing fieldset.
  Kept from main: the `WatchdogPanel disableControls={false}` wrapper around `ProofStage`, the live-job handling and
  CH-3a's JobParties / parties-ready guard (`PARTIES_CHANGED`, `bindingId` checks).
- `apps/web/app/ui/workspace-shell.tsx` — two insertions, the same two MON-7a had:
  1. `import { PreventionChecks } from "./prevention-checks";` after the `ThingsToCheck` import.
  2. `<PreventionChecks jobId={jobId}/>` between the `Job stages` `</nav>` and `<section id="stage-0">`, in the saved-job
     branch only (as before; the captured-job branch is unchanged).
  Kept from main: `<WatchdogStatusProvider jobId initialStatus>` around both returns and every `WatchdogPanel` wrapper.
- Placement decision: `PreventionChecks` is deliberately **not** wrapped in `WatchdogPanel`. The default wrapper disables
  controls unless the job is live, and prevention checks are quote-time (BUILD_PLAN MON-7: "property constraints at quote
  time"), so wrapping would disable them on the quoting jobs the MON-7 spec uses.
- `packages/db/MIGRATIONS.md` (in lane, doc only): the 0103 note said "upgrade from 0095 ... require CI in the restricted
  builder sandbox". It now says the upgrade test applies every migration before 0103 (including 0096 and 0097), and
  records the 0096 finding below. No other line changed.

## Item 2 — check against CH-2's rules

**(a) Job-mutation registry — FINDING, needs an out-of-lane edit.** MON-7a adds one mutating route per layer:
web `POST /api/jobs/[id]/prevention-checks/[action]` and Nest `POST jobs/:id/prevention-checks/:action`
(the GET view routes are not mutations). Neither is in `jobMutationRegistry`, so `apps/api/src/watchdog-registry.test.ts`
fails two tests exactly as designed:
- `fails when any job mutation route is unclassified` — `Unclassified job mutation: /api/jobs/[id]/prevention-checks/[action]`
- `classifies standalone job mutations and dispatcher command literals too` — `Unclassified job mutation: nest:/jobs/:id/prevention-checks/:action`

Required change, in `packages/core/src/watchdog.ts` (NOT in the `mon-7a` lane allow list; not edited):
```ts
  "/api/jobs/[id]/prevention-checks/[action]": "pre_live_allowed",     // beside "/api/jobs/[id]/parties/import"
  "nest:/jobs/:id/prevention-checks/:action": "pre_live_allowed",       // beside "nest:/jobs/:id/parties/import"
```
Why `pre_live_allowed`: the checks are quote-time, read only synthetic register fixtures, write only to MON-7a's own
tables, and never change job state; they are not site facts, documents, orders, proof or messages, which are what
`watchdog_live_only` is for. `watchdog_live_only` would also be wrong operationally, because the checks run on
`quoting` jobs. `pre_live_allowed` adds no entry to `watchdogCommandGuards` and no case to the live-only replay and
lock-order suites, so no other CH-2 test changes.
Proof the two lines are sufficient, without touching the file: I ran the registry test with `@jobguard/core` aliased to a
scratch module (outside the repo) that re-exports core and adds only those two entries. Result: 120 of 120 pass. The
unmodified tree gives 118 of 120 (the two above). The integrator or the CH-2 owner must either add the two lines (and
widen the lane allow list to include `packages/core/src/watchdog.ts`, or make the edit under the CH-2 lane), then
re-run `apps/api` unit tests.

**(b) PostgreSQL tests and fixtures — no change needed.** MON-7a's tests and `prevention-register-fixtures.ts` write only
`app.property_constraint_fact`, `app.counterparty_check`, `app.command_receipt`, `app.audit_event` and CH-3a party
tables; `grep` for every table 0096 guards (purchase_order_*, supplier_*, goods_receipt, planned_work_revision,
readiness_*, inbox_*, evidence_*, stage_completion, discrepancy_*, synthetic_evidence_original, watchdog_*) in those
files finds nothing. The tests create `quoting` jobs and bind parties through CH-3a's `JobPartiesRepository`, which CH-2
classifies `pre_live_allowed`, so no live-job setup (`app.tenant_id` plus `app.transition_job`) is needed. The command
claim uses `command_type='prevention.check'`, which none of 0096's `WHEN` clauses or command-identity triggers match.
Confirmed by execution: the full `packages/db` suite passes (below), including CH-2's watchdog, lock-order,
replay and legacy-identity suites with 0103 registered.

**(c) 0103 versus 0096 — no conflict in either direction; 0103 unchanged.** 0103 adds two new tables, neither among the 27
tables that get `guard_watchdog_input`, and it adds no trigger to any 0096 table. Its triggers (`prevention_subject`,
`prevention_immutable`) are on its own tables and read only RLS-visible `job_party_binding` and `customer_revision`
rows; the repository uses CH-3a's `app.require_current_job_parties`. 0096's `FORCE ROW LEVEL SECURITY` suspend/restore happens inside 0096's own transaction, before 0103
runs. The migration order (0096, 0097, 0103) is in `migrate.ts`. The upgrade test applies every migration except 0103
(so including 0096 and 0097), seeds a `quoting` job, runs `migrate` twice and checks the job row is byte-for-byte
unchanged; it passes. Tenancy catalog rows for `counterparty_check` and `property_constraint_fact` (RLS, FORCE,
owner) are present and pass.

## Item 3 — commands and exit codes (embedded PostgreSQL 16 ran locally; `df -h /` showed 69-72 GB free throughout)

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile --offline` | 0 | refreshed `node_modules` to `next` 15.5.27 (SEC-DEPS); no lockfile change |
| `pnpm build` | 0 | 7 of 7 tasks, includes both prevention routes |
| `pnpm typecheck` | 0 | 7 of 7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | core purity, lane boundary (lane `mon-7a`, merge-base comparison, not a refused self-comparison), money, commercial, 7 package tsc passes |
| `pnpm openapi:check` | 0 | `apps/api/openapi.json` is current; no regeneration needed |
| `packages/core` `vitest run` | 0 | 110 files, 3246 tests passed |
| `packages/ai` `vitest run` | 0 | 3 files, 72 tests passed |
| `apps/web` `vitest run` | 0 | 19 files, 350 tests passed |
| `node --test tools/*.test.mjs` | 0 | 42 of 42 passed |
| `apps/api` `vitest run src` | **1** | 585 passed, **2 failed**: the two registry tests in Item 2(a); every other API test (including `prevention-check.application.test.ts`) passes |
| `apps/api` registry test with the two entries aliased in (scratch, repo untouched) | 0 | 120 of 120 passed |
| `packages/db` `vitest run --maxWorkers=1` (whole suite) | 0 | 57 files, 571 tests passed, including `prevention-checks`, `tenancy`, `UIWIRE-12`, `demo-bootstrap` and CH-2 watchdog suites |
| `pnpm --filter @jobguard/web exec playwright test --list e2e/MON-7.spec.ts` | 0 | 6 tests discovered (3 specs x `mobile-360` and `desktop`) |

Not run: browser (Playwright) execution of `MON-7.spec.ts`, which runs in CI after the integrator pushes.
`pnpm test` as a single root command was not run; its parts were run separately as above, with the API registry
failure outstanding.

## Status

Prepared and locally tested: files re-applied, migration and tests unchanged, whole DB suite green. Not yet green: two
API registry tests, until `packages/core/src/watchdog.ts` gains the two `pre_live_allowed` lines. Not pushed.
