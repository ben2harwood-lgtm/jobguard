# ENT-2 builder receipt, attempt 2 (finished leaf on Ben's "Existing roles" answer)

**Builder receipt only — not independently verified, not accepted.** Builder: Claude Sonnet 5.5. A fresh reviewer and the integrator decide acceptance; the builder never reviews, accepts, pushes or merges. Synthetic data only; no live provider, connector, send, spend, production mode, decision approval, deployment or release.

## Identity

| | |
|---|---|
| Branch | `codex/sandbox/ent-2` (local only, nothing pushed) |
| Attempt 1 head (safe core part) | `16dd1e9` on base `b552bdc` (CH-3b #120) |
| Merge 1 | `f961352`: `origin/main` 3a06a02 (CH-3b 0102, MON-7a 0103, TENANT-STAMP-1 #115, M4-7-S 0106) |
| Merge 2 | `c6452a3`: `origin/main` c283d4e (M4-5-S 0107 #106, CI-TIME-1 #124), which landed while this leaf was being built |
| Code head verified | `cf754a0` (c6452a3 plus one test-only fix, below). This receipt is the only change after it. |
| Migration | `packages/db/migrations/0110_work_orders.sql`, registered **last** in `packages/db/src/migrate.ts`, after 0106 and (since merge 2) after 0107. Ent-2 lane line updated from `0105` to `0110`. |

## Authority: Ben's answer replaces Q6

Card `jobguard-ent-2-import-roles-2026-10-08`, answer **"Existing roles"** (9 Oct 2026). Work-order import = members holding `organisation.manage` (owner, admin) or `data.import` (finance), exactly what CH-3b's `app.bind_contractor_parties` (0102:117) accepts. SoR price-list version import = members holding `contract.manage` (owner, admin, commercial_manager), tenant-wide (ENT-1 matrix, 0054:99–109). No new permission, no role-list change, no edit to 0054, 0102 or any merged migration. Out-of-scope is ENT-1's same not-found as a non-existent id; a small-builder-track tenant gets the typed `TRACK_FORBIDDEN`.

### Roles table

| Role | Work-order import | SoR import | Tests (all in `packages/db/test/work-order-import.integration.test.ts` unless noted) |
|---|---|---|---|
| owner | allowed | allowed | `work-order import: owner is allowed`; `SoR price-list import: owner is allowed` |
| admin (tenant scope) | allowed | allowed | `… admin is allowed` (both) |
| finance | allowed (data.import) | refused | `work-order import: finance is allowed`; `SoR price-list import: finance is refused` |
| commercial_manager | refused | allowed | `work-order import: commercial_manager is refused`; `SoR price-list import: commercial_manager is allowed` |
| surveyor | refused | refused | `… surveyor is refused` (both) |
| supervisor, operative, read_only, client_approver | refused | refused | `… <role> is refused` (both); refusal is `NOT_FOUND` and the table counts are unchanged |
| non-member, revoked, expired | refused | refused | `refuses a non-member, a revoked member, an expired member and a scoped admin whose scope holds no client, for both imports` |
| branch-scoped admin | only for clients in that branch | refused (not tenant-wide) | same test |
| small-builder-track tenant | refused `TRACK_FORBIDDEN` | refused `TRACK_FORBIDDEN` | `refuses an import for a small-builder-track tenant …` |

The same roles × scope kinds (tenant, region, branch, team, client) × every new command and query are checked against the pure core rules in `packages/db/test/contractor.integration.test.ts` → `ENT-2 conformance: …` (25 actors: owner, five roles at four scopes, finance, two operatives, client_approver; commands: work-order import, SoR import; queries: register, batch, revisions ×4 positions, assignments, site visits, price list, resident read, unknown job). The SQL copy of ENT-1's matrix (`app.contractor_role_permits`) is proved equal to `app.contractor_allowed` for a real member of every role (`copies ENT-1's role/permission matrix exactly …`). One difference already in ENT-1 is recorded and asserted: core gives `client_approver` `extra.approve` (a decision awaiting them, ENT-5); the SQL function never does.

## The two held CH-3b checks

| Held clause | How proved | Tests |
|---|---|---|
| (a) CH-3b DW1: "ENT-2's import tests call this routine and assert the refusal" | The import transaction calls `ContractorPartyRepository.bindInTransaction` → `app.bind_contractor_parties` for every new order. Test calls it inside the import transaction for each of client, contract, site and resident missing and asserts `CONTRACTOR_PARTIES_REQUIRED` with `assertContractorPartiesRequired`, plus table counts unchanged; then the same four through the real import path (receipt carries the routine's typed refusal, nothing of the order committed), then a complete row binds exactly once. | `work-order-import.integration.test.ts` → `CH-3b DW1 held clause: the import calls app.bind_contractor_parties in its transaction and the routine refuses each missing party, committing nothing` |
| (b) CH-3b DW3 team-scoped positive cases | Against real imported jobs that have a team and an assigned operative. Teams made with ENT-1's existing `team.create`, operatives with `member.invite` (team scope), assignment from the import row; **no new office command was needed or added**. The operative on the job and that team's supervisor read the resident contact through `app.read_contractor_resident`; an operative outside the team, an unassigned operative of the team, another team's supervisor, a job with no team and an unknown job all get the identical `NOT_FOUND`. Also: roles with `resident.read` through the scope covering the job's team, no role without it, access follows the order's current revision, the contact stays out of every ENT-2 list/projection, and SQL job scope equals the pure core rule for every role/scope/permission/position. | `job-scheduling.integration.test.ts` → describe `CH-3b DW3 held cases: team-scoped positive cases against imported work-order jobs with a team and an assigned operative` (6 tests, first is `CH-3b DW3 held cases: the operative on the job and that team's supervisor read the resident contact; …`) |

Failed-first for (b): with 0110's `read_contractor_resident` replacement temporarily removed (0102's version, uncommitted, restored byte-identical afterwards) the first held test fails with `NOT_FOUND` for the assigned operative, the expected reason. Registering no 0110 at all also fails every ENT-2 suite in `beforeAll`. Most other tests were written after the implementation in this attempt; the failures I met while developing them are in the commit history of the test files, not recorded as a separate red run.

## DW1–DW6 and the order's other clauses

| Clause | Evidence (test titles; file) |
|---|---|
| **DW1** 2,000-order import, measured | `imports a generated 2,000-order file (measured), replays the same file with no new rows, and records exactly 3 revisions with diffs for 3 changed orders` (import). 2,000 orders, 1,239,488 bytes, 4,000 lines, 4,000 assignment rows, 2,000 live jobs: **44.1 s, 46.7 s** (quiet machine), **134.9 s** (full suite under other builders' load), **10.1 s** (final run). Fixture: `demoRow(demo, 1..2000)` over 20 generated sites; file hash differs per run (ids are random), the last was `dfc0c6dc…`. |
| DW1 same file again | A new command with identical bytes replays the stored batch: every ENT-2 and spine table count identical before and after; same command + changed file → `COMMAND_CONFLICT`. A file with a refused row is processed again under a new command (so a fixed price list can be retried): `replays the stored batch only when it was clean …`. |
| DW1 3 changed orders | `second.counts = {revised: 3, unchanged: 1997}`, exactly 3 revision-2 rows, each with a stored diff (one changed line, no other change), 1,997 recorded no-op receipts. |
| DW1 concurrent | `work-order-concurrency.integration.test.ts`: three concurrent imports of one file → one set of rows, one verified audit chain; same command racing; two files creating one reference; two files revising one order; import + SoR import + ENT-1 command in one tenant with a 200 ms deadlock timeout (no deadlock); two tenants in parallel. |
| **DW2** | `refuses another tenant's contract, client, site and team …`; `commits no part of a failing order, whichever stage fails …` (job bound, order inserted, assignment refused: every non-batch table count unchanged); `gives each malformed row its own typed error …` (unknown code, negative quantity, more than 6 decimals, money out of range, missing site, `1e2`, bad status, over-long reference); malformed files refused whole (`INVALID_CSV_HEADER`, `INVALID_CSV`); `refuses foreign-tenant contracts, teams, memberships, scope identities and jobs through qualified composite keys`. |
| **DW3** | `denies runtime and owner updates and deletes of revisions and lines, and records a cancellation as a revision` (runtime `42501`, owner `55000`, the pointer moves only forward); `keeps the scope identity of unchanged lines: matched by client line reference, else by SoR code and position`; party changes refused. |
| **DW4** | `makes the job live at import, passing watchdogActive, with no quote, acceptance, obligation, journal, cap or fee-policy row` (job columns null by CHECK; of every table with a `job_id` only nine contractor/party/scope tables have rows; `app.require_watchdog_live` passes); runtime and owner cannot insert a `work_order` job or change its provenance. M1-17 import files unchanged (hashes below). |
| **DW5** | `sor-pricing.integration.test.ts`: £100.00 at −35/1000 × 1 = £96.50 through the import; SQL price equals core price over 7 adjustments × 11 rates × 10 quantities (ties and overflow identical); ties, zero, positive, fractional, overflow `MONEY_OUT_OF_RANGE`, negative multiplier; version in force on the issue date from the contract's list, unlisted newer version never used, ambiguity refused; a later SoR version or contract version never reprices a stored revision (rows compared before and after) while new orders use it; a forged net, rate, version, adjustment or origin is refused by the database (`23514`/`23503`/typed), and a raw commit passes only with its batch and both audit events. |
| **DW6** | `keeps resident name, phone and email out of audit payloads, receipts, projections, the batch results and captured logs`; audit payloads are exactly `references`/`hashes`/`classifications`; `can write no origin but client_instruction …` (CHECK on every other origin; the import's only receipts are `contractor_parties.bind`/`link`, which SH-1's map turns into nothing, so `extra_origin` refuses all four contractor kinds; no variation and no extra_origin row). |
| Q3 | `job_assignment` and `site_visit` tables; `GET /api/contractor/jobs/{id}/assignments` and `/site-visits` only; no office scheduling command, no new role (`has no scheduling command …`; OpenAPI and route sources asserted GET-only in `work-order.application.test.ts`). |
| Q4 | Lines carry `client_instruction` only (DW6); the import creates no variation. |
| Q5 | `TRACK_FORBIDDEN` test above. |
| Q7 | Nothing to prove now: the §9.4 row "Client formally instructs a logged extra later" belongs to ENT-3 and ENT-4b. |
| Q8 | Generated, selectable CSV only; `POST /api/contractor/work-order-imports` takes `source.kind = "generated"`, a CSV body is `UPLOAD_NOT_ALLOWED` (application test and browser spec). Screens are under `/contractor/work-orders`. |
| CH-2 registry | `/api/contractor/work-order-imports` and `nest:/contractor/work-order-imports` classified `pre_live_allowed` in `packages/core/src/watchdog.ts`; attempt 1's additive scanner extension stays; its test now removes the real entry to prove an unclassified import still fails through each transport (the entry now exists, so the old assertion against the full registry could no longer throw). SoR import and tenant administration stay outside classification. |
| Boundary | Missing tenant context, non-member tenant, hand-built context (`INVALID_TENANT_CONTEXT`), another tenant's batch/order/job ids answered exactly as unknown ones, same-tenant wrong-job links, forged tenant/provenance/status/track/origin/price fields refused by strict schemas (`work-order-import.integration.test.ts`, core and API unit tests); replay returns one result and one id, a changed payload conflicts (both imports). |
| Browser | `apps/web/e2e/ENT-2.spec.ts`, `mobile-360` and `desktop`: from Jobs → Account → "Contractor work orders"; import a file with typed-error rows (`UNKNOWN_SOR_CODE`, `QUANTITY_PRECISION`, `CONTRACTOR_PARTIES_REQUIRED`, `NEGATIVE_QUANTITY`, `MONEY_OUT_OF_RANGE`), the starter orders, the same file again ("already imported"), the revised file; open an order's revision view (diff text, identical line identities across revisions); reload and a second browser context show the same persisted state; sandbox banner once; no horizontal page scroll; 44 px targets; owner's scheduling projection is the identical 404 as an unknown id; scheduling routes 405 for POST/PUT/DELETE; upload and cross-site writes refused. |

## TENANT-STAMP-1

Every repository entry uses `withTenant(pool, verifiedTenantContextFromMembership(principal), …)`; tests use the same or `testTenantContext(tenantId)` from `packages/db/test/tenant-context-test-utils.ts`. No context is built by hand (one test deliberately passes a hand-built one to prove it is refused).

## Boundary-test tripwire (M0-6L, #104)

`packages/db/src/practice-session.ts`, `contractor-repository.ts` and `contractor-party-repository.ts` are **byte-identical to `origin/main`** (SHA-256 `9b765f41…`, `56b95b80…`, `e5852288…`). New repository code is in new files only.

## Object check (0110 runs after 0102, 0103, 0106 and 0107)

Objects an earlier migration also defines that 0110 changes, each rebuilt from the current definition:

1. `app.job` constraint `job_provenance_check` (0020): dropped and re-added with the same two values plus `work_order`.
2. `app.read_contractor_resident(uuid,uuid)` (0102): `CREATE OR REPLACE` with the body unchanged except that the last authority test calls `app.contractor_job_allowed` instead of `app.contractor_allowed(…, p_job)`; owner, `SECURITY DEFINER`, pinned `search_path`, grants (runtime yes, infrastructure no) re-stated identically. The unresolved-job refusal CH-3b asserts still holds for a job with no assignment; its whole suite passes.

Nothing else is altered: `app.transition_job`, `bind_small_builder_track`, `bind_contractor_parties`, `contractor_allowed` and every merged migration file are untouched. New objects (all new names): 11 tables, 16 functions (`app.sor_line_net_pence`, `contractor_role_permits`, `contractor_job_team|assigned|allowed`, `work_order_import_permitted`, `sor_import_permitted`, `work_order_begin|commit|parties_unchanged`, `import_batch_record`, `import_sor_version`, four trigger functions), triggers on `app.job` (`a_work_order_job_guard`: a work-order job can only be inserted as a draft by the migration role, provenance is immutable, it enters `live` only through the routine), the new tables (immutability, pointer-forward, exact price, deferred audit requirement) and one CHECK on `app.job` (`work_order_job_has_no_quote_or_fee`). Runtime has `SELECT` only on every new table.

## Changed files (48 against current `origin/main`, 49 with this receipt)

- Migration and db: `0110_work_orders.sql`, `migrate.ts`, `index.ts`, `MIGRATIONS.md`, new `work-order-repository.ts`, `sor-repository.ts`, `job-scheduling-repository.ts`, `work-order-fixtures.ts`.
- Core: `work-order.ts`, `sor-pricing.ts` (+ tests), `job.ts` (provenance list and the `work_order_import` draft→live reason, additive), `watchdog.ts` (registry rows), `index.ts`.
- API: `contractor/work-order.{contracts,application,controller}.ts`, `scheduling.{application,controller}.ts`, `work-order.application.test.ts`, `app.module.ts`, `workspace/application.ts` + `index.ts`, `watchdog-registry.test.ts`, regenerated `openapi.json` (additive only).
- Web: six routes under `app/api/contractor/…`, two pages under `app/contractor/work-orders`, `ui/work-order-imports.tsx`, `work-order-revisions.tsx`, `work-orders.module.css`, one link in `ui/jobguard-app.tsx`, `e2e/ENT-2.spec.ts`.
- Tests edited additively: `contractor.integration.test.ts` (ENT-2 conformance, imports, and `--encoding=UTF8` added to its `initdbFlags` because site records need a UTF8 server; its other tests are untouched), `tenancy.integration.test.ts` (11 catalog rows twice). New: `work-order-import`, `work-order-concurrency`, `sor-pricing`, `job-scheduling` integration tests.
- Config/docs: `config/agent-lane-assignments.json` (the ent-2 line only: `0105` → `0110`), `docs/contracts/work-order-import-v1.md` (rewritten), this receipt. `BUILD_PLAN.md` untouched.

## Merge resolutions

- Merge 1 (`f961352`): `packages/core/src/index.ts` kept both sides (main's `prevention-checks`, `practice-feed`, then ENT-2's two exports). The lane registry merged with no conflict (still one lane per line, sorted, valid JSON); `lane-union.py` was not needed.
- Merge 2 (`c6452a3`): `migrate.ts` main's 0107 then 0110 (0110 stays last); `workspace/application.ts` both import pairs and the composed object keeps `recoveryMessages` with `workOrders` and `scheduling`; `app.module.ts` main's `RecoveryMessageController` plus ENT-2's two controllers. Lane registry, core `index.ts`/`watchdog.ts`, db `index.ts`, `MIGRATIONS.md`, `tenancy.integration.test.ts` (main's `recovery_message*` rows and ENT-2's rows) auto-merged.
- One test changed because of merge 2: `registers 0110_work_orders.sql last, after 0106 …` asserted 0110 directly followed 0106; it now asserts name order (0110 last, after 0106, strictly increasing names), as the brief asked.

## M1-17 import path unchanged (identical to `origin/main`)

| Path | SHA-256 |
|---|---|
| `packages/core/src/job-import.ts` | `0160a0e55db8c7b1e55d019c3364c49f652316430d3168f51967253be7b722db` |
| `packages/core/src/job-import.test.ts` | `14b21e6a7c32e94ab0aa43b8900420ad94853a7c54a3c8458ceece0c814915bd` |
| `packages/db/src/job-import-repository.ts` | `5006393d1d1aab9064a85206f239c3ae2698daa3be9ca1b3398c7f19f9a78a65` |
| `packages/db/test/job-import.integration.test.ts` | `33c8fc4b94bce49bcbc116120cc1872d45a53651a1c976b30ff5effe3a78065b` |

## Commands

Node v24.17.0, pnpm 10.28.1. "Final" = merged head `c6452a3` (code-identical to `cf754a0` except one test). Heavy suites each ran inside `~/.local/bin/heavy-slot ent-2`, one at a time.

| Command | Exit | Counts / notes |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | lockfile unchanged |
| `pnpm typecheck` | 0 | 7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7 tasks; includes the lane check |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `ent-2`, comparison merge-base |
| `pnpm build` | 0 | 7 tasks |
| `pnpm --filter @jobguard/core test` | 0 | 120 files, 3,474 tests |
| `pnpm --filter @jobguard/api exec vitest run src` | 0 | 32 files, 744 tests |
| `pnpm --filter @jobguard/web test` | 0 | 21 files, 448 tests |
| `node --test tools/*.test.mjs` | 0 | tools tests |
| `pnpm openapi:check` | 0 | |
| Heavy: `pnpm --filter @jobguard/db test` (whole suite, embedded PostgreSQL 16) | 1 at `c6452a3` | 68 files, 836 pass, **1 fail**: my own migration-position test (it assumed 0106 directly before 0110; 0107 had merged). Fixed in `cf754a0`; that file re-run: 42/42 pass. The other 67 files pass. An earlier whole-suite run at `9b95a99` (code-identical): 65 files, 727 tests, exit 0. |
| Heavy, named: `work-order-import` (42), `work-order-concurrency` (6), `sor-pricing` (9), `job-scheduling` (9), `contractor.integration` (19 incl. ENT-2 conformance), `contractor-parties` (19), `tenancy` (9), `UIWIRE-12`, `demo-bootstrap`, `job-import`, `shared-money-origin`, `job-parties` | 0 | all inside the whole-suite runs above and a 12-file run (239 tests) before the last merge |
| Heavy: `CI=1 playwright test --project=mobile-360 --project=desktop ENT-2.spec.ts` | 0 | **4 passed (7.9 s)** at `cf754a0`. |

## Environment notes (fixed the environment, never the tests)

- Embedded PostgreSQL would not start: this worktree's `@embedded-postgres/darwin-arm64` lacked its dylib symlinks (pnpm skips the package's postinstall). `pnpm run db:fix-macos` does not exist on this branch, so I ran the package's own `scripts/hydrate-symlinks.js` once (creates symlinks inside `node_modules` only).
- Playwright 1.55.1's pinned `chromium_headless_shell-1193` is not installed. I used an **uncommitted** `apps/web/playwright.local.config.ts` (already excluded by the repo's `.git/info/exclude`) that spreads the real config and only sets `launchOptions.executablePath` to the installed headless shell (`chromium_headless_shell-1234`). Nothing else differs.
- **Incident:** while stopping my own queued e2e run I used two broad `pkill -f` patterns (`playwright test`, `next start`). They can match other builders' processes; another builder's (`ch-1`) Playwright run and its web server on port 3000 appear to have been interrupted and it restarted its run afterwards. I did not touch anything else. The integrator may want that builder to re-run its e2e.

## Not run, and why

- The rest of the Playwright suites (only `ENT-2.spec.ts` was asked); `pnpm test:regression`, `test:restore`, `test:deploy`; root `pnpm test` as one command (its parts ran separately, above).
- No CI, no push, no PR; remote CI is the integrator's.
- Not a claim: the 2,000-order time is a measurement, not a requirement (the plan sets none); educational or research outcomes are untouched.

## Open items for the reviewer and integrator

- Migration number: 0110 is last today; 0108 (M0-6L) and 0109 (CH-1) are still held. Lane registry and `migrate.ts` will conflict again when they merge; keep both sides.
- An order's issue date is not checked against the contract's start and end dates; a cancelled order's job stays `live`; a work order that names no team has no resolvable job scope, so nobody can read its resident contact or scheduling projection (office import roles still see its revisions). All three are recorded in `docs/contracts/work-order-import-v1.md`.
- `closeout_answer` belongs to ENT-3. Remaining gates unchanged: D12 v4, D16, G1, G5 for connectors, ENT-14.
