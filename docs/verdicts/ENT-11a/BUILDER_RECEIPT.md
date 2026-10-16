# ENT-11a builder receipt (Sonnet 5.5 builder, dispatcher 9, 15 Oct 2026)

Builder run receipt, not a verdict or acceptance. Independent review still owed. Build-ahead two deep: ENT-5b (5a2814a8) on PR #215. Branch `codex/sandbox/ent-11a`. No migration. PR #216 was still OPEN, so the lane is registered in `config/agent-lane-assignments.json` (key `ent-11a`).

## Built
- `packages/db/src/northside-demo.ts`: `seedNorthsideDemo` makes "Northside Property Services" ONLY through merged commands (organisation commands, member invites, contract revise with the Northside rules, work-order import in files of 100): 3 clients, 40 operatives, 2,000 orders issued in 2026-10 (800/700/500), plus a supervisor, surveyor and client approver. Idempotent. `northsideFacts` counts every displayed figure from the rows. `northsideExtras`, `northsideRateCard`, `northsideRole` are read-only queries.
- Thin routes: `/api/northside` (facts, owner seed), `/photo`, `/extras`, `/extras/[extraId]/[action]` (price, submit, approve, send), `/client` (view, decide). They call the ENT-5b repository and the merged site-extra v3 route (unchanged).
- Plain screens: `/northside` (hub, start, reset), `/site/extra` (operative), `/approvals/extras` (surveyor, supervisor, owner), `/extra-approval/[jobId]/[requestId]` (client, link secret in the # part). The global sandbox banner covers every page.
- Tests: `packages/db/test/northside-demo.integration.test.ts`; Playwright `apps/web/e2e/ENT-11a.spec.ts`.

## Beyond ENT-5b (needed by the journey)
1. The card names three actors; the journey also needs a **surveyor** (only surveyors may price, and a grant must match the member's own role, so the supervisor cannot) and the **owner** (only the owner may approve sending the client link, Ben decision 18). Both are real seeded members.
2. A practice photo path: a generated 1x1 PNG held in server memory, stored through the merged evidence service (begin, finalize). No real image, nothing leaves.
3. The Northside approval rules are demo fixture values to be set by Ben: one supervisor step up to 150000p, then supervisor and commercial manager; client approval above 100000p (before work above 50000p); photo and resident confirmation required. The surveyor price is rate-card rate x measured quantity (6 x CLEAR-VOID).
4. Reset = revoke the session, new session, new generated tenant; the old tenant and its audit chain stay untouched.

## Held / not done
- **No in-product role switch.** Non-owner browser sessions are stored by the test with the database superuser (test support only). A product role switch needs a migration (a session-minting routine), held.
- Work reports, escalation scheduling, evidence packs, refusal audit: still held as in ENT-5b.
- The client page asks for the email again after a reload (second proof), then shows "already used".

## Executed checks
- `packages/db`: `vitest run --maxWorkers=2 test/northside-demo.integration.test.ts` via heavy-slot, exit 0, 1 test passed (about 12 s for the full seed; 3 clients, 40 operatives, 2000 orders, every address .invalid, outbox empty, second seed writes nothing).
- `tsc --noEmit` for `packages/db` and `apps/web`: clean.
- Playwright (headless, full Chromium, through heavy-slot) ran once before the coordinator stopped all local browser runs: it passed owner start and seed, the counted facts, the operative step on phone width, the surveyor price, the supervisor submit and approve, the owner send, and the client approval, and failed only at the post-reload "already used" check (the test had not re-entered the email). I corrected that assertion by reading the code. **The full journey has NOT been re-run locally; CI must run it.**
- Failing-first was not followed (code first, then tests).
## Environment
node_modules cloned with `cp -c` from ent-5b; embedded postgres hydrated; `playwright install chromium-headless-shell` was started with PLAYWRIGHT_SKIP_BROWSER_GC=1 and stalled; an uncommitted `apps/web/playwright.local-headless.config.ts` is left unstaged.

## Repair r1

15 October 2026, dispatcher 11; PR #218, starting head `ff1fb557`, branch `codex/sandbox/ent-11a`. Builder repair receipt only, not an independent verdict or acceptance.

- **B3:** the browser spec obtains the tenant from the owner's own `/api/contractor` session response, both at start and after reset. The reset database assertion is restricted to those two tenant IDs. Neither lookup searches globally by owner email; existing assertions are preserved.
- **B4:** before constructing the evidence service or writing bytes, the photo route checks active membership and `app.contractor_job_assigned` under the verified session's `withTenant` context. This merged predicate checks the current work-order revision. An unassigned operative receives `PERMISSION_DENIED` (403). No migration or new grants.
- **L2:** client-approver extras require an unexpired link with no closure (revoked, replaced or decided).
- **L3:** both client-approver ID and email subqueries order by the same membership ID.
- **L4:** the pricing route checks the surveyor's current job grant with `app.xa_covers(...,'extra.price')` before reading the rate card.
- **B1/B2:** approval figures and direct session fixtures remain unchanged pending the founder ruling. Added only the permitted visible comment, `demo placeholder figures, not product rules`, above the approval figures.

Added `apps/web/app/api/northside/routes.test.ts` to the `ent-11a` lane using the available patch edit tool. Five non-browser unit tests cover assignment refusal with no evidence/storage calls, lookup failure, assigned-operative success, pricing refusal before a rate-card read, and authorized pricing success. Database/storage/application doubles make these transport/guard unit tests, not PostgreSQL isolation or live integration evidence. The three negative tests failed against the original routes before the fixes; all five passed afterward. No existing test expectation, pin or fingerprint was edited.

Checks used the existing cached pnpm **10.28.1** through `/private/tmp/jg-ent-11a-bin/pnpm` (a temporary symlink to the cached executable), Node **24.17.0**, and the already installed dependencies. No install was run. For every command in the table, the runner was `PATH=/private/tmp/jg-ent-11a-bin:$PATH ~/.local/bin/heavy-slot <label> <command>`; labels are listed so commands can be reproduced exactly. Both Vitest invocations selected one file and used `--maxWorkers=2`.

| Label | Command | Exit | Result |
| --- | --- | --- | --- |
| `ent-11a-r1-red` | `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 app/api/northside/routes.test.ts` | 1 | Before fixes: 3 failed, 2 passed, reproducing the missing guards. |
| `ent-11a-r1-unit` | `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 app/api/northside/routes.test.ts` | 0 | After fixes: 5 passed. |
| `ent-11a-r1-typecheck` | `pnpm typecheck` | 0 | All 7 package tasks successful (2 cached). |
| `ent-11a-r1-build` | `pnpm build` | 0 | All 7 package tasks successful (2 cached); Next compiled and generated all 39 static pages. Warnings concerned workspace-root inference, existing CSS values, Nest/file-type exports and dynamic dependency loading. |
| `ent-11a-r1-lint` | `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed; lane checker rejected the pre-existing untracked local Playwright config. The environment variable was set before heavy-slot. |
| `ent-11a-r1-lanes` | `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same pre-existing untracked config obstruction; variable set before heavy-slot. |
| `ent-11a-r1-package-lint` | `pnpm turbo run lint` | 0 | All 7 package lint tasks successful (2 cached); does not replace the failed root lane check. |
| `ent-11a-r1-money-lint` | `pnpm exec node tools/money-arithmetic-lint.mjs` | 0 | Passed. |
| `ent-11a-r1-commercial-lint` | `pnpm exec node tools/commercial-boundary-lint.mjs` | 0 | Passed. |
| `ent-11a-r1-openapi` | `pnpm openapi:check` | 1 | Sandbox denied the tsx CLI IPC socket (`listen EPERM`). |
| `ent-11a-r1-openapi-loader` | `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same generator/check through the Node loader, avoiding the CLI socket. |

An initial invocation of the red command through the default global pnpm launcher was interrupted (exit 130, before Vitest output); the recorded red/green runs above used the cached pinned version. Heavy-slot reported unavailable load/process telemetry in this sandbox; checks still acquired slots. Turbo reported cache IO permission warnings.

Final lightweight `git diff --check`: exit 0. Read-only git inspection confirmed the starting head and branch above. The working tree contains only the scoped repair files, this appended receipt, the registered new unit-test file, and the untouched pre-existing local Playwright config.

No database, browser or Playwright suite was run in this repair round, per dispatcher instructions and sandbox restrictions. `apps/web/playwright.local-headless.config.ts` was left untouched; it remains untracked and causes the root lint/lane failures. No git command that writes was run. The intended conventional commit message was written to `/private/tmp/jg-msg-ent-11a.txt` for the dispatcher.

Remaining gates: GitHub CI must execute the database and browser suites, root lane lint must be assessed without the unrelated local config, B1/B2 await the founder ruling, and the resulting dispatcher commit needs an independent recorded verdict and separate acceptance. No migration, production policy, provider action, outbound attempt or new operational alert was introduced. Invariants touched: session/tenant scoping and current job authorization (AGENTS §§5.1, 5.8); commercial policy and authorization records remain with the merged commands.


## r-d13 rework

16 October 2026, dispatcher 13, PR #218; branch `codex/sandbox/ent-11a`. This appended builder receipt supersedes this receipt's earlier held role-switch/settings statements. It is not an independent verdict or acceptance.

### Integrated authority and scope

- Dispatcher supplied committed clean merges: `3063e070` (main `760fe6f5`) and `a395bbed` (#225 at `d1432d26`). Read-only inspection found no conflicts/markers; neither merge was redone. The migration runner retains main/#225's list unchanged; both export blocks remain.
- Authority: Ben 33, decisions 38–39 and ruling 53, triage section B. No ENT-5c artifact was created. The archived stray local Playwright configuration is deleted; there is no executable reference to it. Its lane allowance is deletion-only.
- Consumed #225 start/end/state routes and the existing `jg_session`. The shared practice control explicitly ends any open/unclosed switch before selecting another member. Reset also closes any switch before revoking the old session. Owner-only request approval requires returning to owner. The browser spec contains neither `sessionFor` nor non-owner session inserts.
- Added immutable `northside-settings.v1` beside the seed: exact pence comparisons/bands, journey sequence, evidence requirements, dormant timer/alternate values, link lifetime and photo-upload lifetime. Screens/routes consume the stored definition. Each applicable setting is labelled **“Demo setting, not a real rule”**; the settings view says **“Demo settings, not real rules — Ben sets these before any real customer”**. No X/Y permission or running timer is implied; work timing remains unavailable/not derived.
- Migration `0166_northside_run_attribution.sql` adds forced-RLS, runtime-read-only run/settings and source attribution tables. Source inserts durably record the canonical persisted practice owner's membership/identity/session, fictional actor/role, switch and settings version/hash/classification. References cover command receipts, imports, uploads/evidence, rate versions and contract versions. Source and attribution commit/roll back together; replays preserve their original attribution. Original origin rows and approval requirement snapshots are not rewritten. Start/revoke/switch continue to have their existing persisted-owner audit events; the run references that original session. This is attribution to the authenticated practice owner, not external proof of a named human or protection against a compromised privileged connection.
- Client tester/role text fields are removed. The client command supplies the server's persisted owner reference; strict `northside-command.v1` request schemas reject authority fields. The UI shows “Acting as …; performed by …” and stored action references after reload.
- M-chain's grant-filtered queue controls approval eligibility. Approve/local-request posts bind the displayed request, revision hash, net and step, refusing stale displays. Surveyor-only pricing and distinct-approver checks remain in the existing commands. Reads require current assignment/grants; client projection additionally requires a current scoped grant and unexpired unclosed link for the current request. Tenant totals are owner-only. The client does not gain closed-link historical-read entitlement.
- The exact owner-approved fake `.invalid` outbox artifact supplies the local link, including after reload. There is no executor call, adapter attempt, notification or delivery worker. A pending fake row is not delivery. Command-seeded 3/40/2,000 facts remain counted from stored rows. Reset starts a fresh generated tenant and retains previous facts/attribution/audits.
- The context boundary scan exposed draft Northside context construction/container use. Northside now forwards the existing bridge's whole stamped value and takes it as a helper parameter. No merged constructor allow-list, source fingerprint or test expectation was changed. The updated route-test call assertion and existing seed-test setup belong to this unmerged ENT-11a piece (neither file exists on inspected `origin/main`). No #225 implementation defect was fixed here; initial missing runtime exports disappeared after rebuilding stale `dist` artifacts.

### Migration/lane/backwards compatibility

0166 is above inspected main 0164 and integrated #225 0165. See `packages/db/migration-notes/0166_northside_run_attribution.md` and `docs/ledger/ENT-11A.md`. No predecessor SQL, `packages/db/src/migrate.ts` or `packages/db/MIGRATIONS.md` was changed. The own-step populated upgrade test checks predecessor row bytes/types/functions and switch answers, repeated migrate, grants/RLS and comparator timestamp/type/deletion controls. No predecessor backfill is claimed. Rollback is feature-off/forward-fix with history retained.

The existing `ent-11a` lane entry is retained and its allow list extended only for this piece's files/deletion. The loader forbids duplicating this legacy entry in `config/lanes/ent-11a.json`; a new lane file also cannot grant the legacy-register edit needed to remove it. No other lane was changed. The explicit `origin/main` lane check still sees #225's dependency diff and refuses those paths. This is a real hold until #225 is accepted/merged and the branch caught up; its paths were not added to ENT-11a's allow list.

Draft Northside browser requests now carry `northside-command.v1`; all corresponding screens were updated together. M-chain/#225 public contracts and production capabilities are unchanged. No new provider, secret, runtime environment variable, operational alert, real data route or production policy was introduced. Practice photo bytes remain in the existing process-local generated-photo store; PostgreSQL stores finalized metadata and attribution, not a new durable blob service.

### Executed checks and limits

Used installed dependencies without installing/downloading anything. All pnpm commands below used `PATH=/private/tmp/jg-ent-11a-bin:$PATH`, the cached pinned pnpm **10.28.1**. Actual Node was **24.17.0**; repository/CI pin **24.15.0** was left unchanged. This is not a clean pinned-install receipt; GitHub CI must supply that evidence.

Successful source-unit selections (database/storage doubles where applicable; **not PostgreSQL or browser execution**):

| Command (prefix above) | Result |
| --- | --- |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | 40 files, 861 tests passed; includes 17 Northside route tests (DEMO-SETTINGS, ACTOR-BINDING, AUTHORITY-FIRST and stale-display refusal) and #225's Next switch tests. Final log `/private/tmp/jg-ent-11a-web-unit-complete.log`. |
| `pnpm --filter @jobguard/db exec vitest run src --exclude '**/*.integration.test.ts' --exclude 'dist/**' --maxWorkers=1` | 13 files, 126 tests passed, including SETTINGS-PATH and SETTINGS-LABEL. `/private/tmp/jg-ent-11a-db-unit-complete.log`. |
| `pnpm --filter @jobguard/core exec vitest run src --exclude 'dist/**' --maxWorkers=2` | 94 files, 2,601 tests passed, including unchanged #225 core cases. `/private/tmp/jg-ent-11a-core-unit-only.log`. |
| `pnpm --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai exec vitest run --maxWorkers=2` | 10 files, 91 tests passed across config, storage and AI (85 AI tests). AI results are the existing fixture suite, not a live model evaluation. `/private/tmp/jg-ent-11a-support-unit.log`. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude 'dist/**' --exclude '**/*.http.test.ts' --exclude 'src/health.test.ts' --exclude 'src/auth/sso/action-paths.test.ts' --exclude 'src/final-account-lock.isolation.test.ts' --exclude 'src/shadow-isolation.application.test.ts' --maxWorkers=2` | 77 files, 1,639 tests passed. Exclusions are local listener/PostgreSQL suites; none were made optional in CI. `/private/tmp/jg-ent-11a-api-unit-only.log`. |
| `pnpm --filter @jobguard/api exec vitest run src/auth/context-boundary.test.ts --exclude 'dist/**' --maxWorkers=1` | Unchanged boundary scanner rerun; result recorded below. |
| `pnpm --filter @jobguard/web exec vitest run app/api/northside/routes.test.ts --maxWorkers=2` | Final focused run: 17 tests passed with the versioned request boundary. `/private/tmp/jg-ent-11a-r13-unit-complete.log`. |

`pnpm typecheck` passed all 7 tasks after the context/schema changes (`/private/tmp/jg-ent-11a-typecheck-complete.log`). The added integration test files and imported fixture graph also passed a separate no-emit TypeScript check: `pnpm exec tsc -p /private/tmp/jg-ent-11a-test-types.json` (temporary config extending the repository DB config with these test files; `/private/tmp/jg-ent-11a-test-types-complete.log`). This compiles tests without executing PostgreSQL.

`LANE_BASE_REF=origin/main pnpm lint` and `LANE_BASE_REF=origin/main pnpm lint:lanes` both exit 1 because the integrated #225 paths are outside ENT-11a's lane. The archived local config no longer causes that failure. Supplemental `LANE_BASE_REF=d1432d26 pnpm lint` passed all four root static checks and all 7 package lint tasks; this verifies the own-piece comparison, not the required main comparison. Final rerun status is recorded below.

`pnpm build` passed all 7 tasks, including Next's 41 static pages (`/private/tmp/jg-ent-11a-build-complete.log`). A final build after the last read-scope adjustment is recorded below. Existing warnings concerned Next workspace-root inference, CSS, Nest/file-type exports/dynamic dependencies and sandbox cache IO; no build warning was represented as proof of execution.

`pnpm openapi:check` exited 1 because the tsx CLI tried to create a forbidden IPC listener (`listen EPERM`). The same generator/check through `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` exited 0 (`/private/tmp/jg-ent-11a-openapi-loader.log`); no OpenAPI file was edited.

Earlier diagnostic runs are not hidden: initial typechecks found the cross-version Zod composition depth error and an unsafe price-body cast; both were fixed in this piece. An initial web run used stale dependency `dist` exports and failed 31 tests; after rebuilding, all 861 passed. Unrestricted core/API Vitest selection also discovered generated `dist` test copies (two core source-inspection copies could not find `.ts` beside `dist`) and API suites requiring forbidden listeners/PostgreSQL. Source-only unit selections above passed. An initial DB `src` substring selection accidentally included four `audit-*-dbsrc-*.integration.test.ts` files; their free-port probes failed before PostgreSQL startup. The selection was corrected with explicit integration exclusion. One later concurrent DB-unit run timed out the unchanged C-OPS-1 source scanner at 5 seconds; an isolated run at its unchanged timeout passed all 126. No assertion, fingerprint, timeout or required CI script was weakened.

`pnpm test` as a whole, `pnpm test:db`, `pnpm test:migrations` and `pnpm test:e2e` remain unexecuted here as complete mandatory suites. This environment cannot bind listeners/start PostgreSQL; the browser order explicitly forbids running Playwright locally. No browser/Playwright command was run. The rewritten CI browser spec and new PostgreSQL tests are **written/typechecked**, not passed integration/browser evidence. Existing approval-chain and #225 switch/proof/upgrade suites remain unchanged and required.

### Remaining gates

GitHub CI must run the clean pinned install and unsliced mandatory suites, especially ACTION-ATTRIBUTION, CLIENT-ISOLATION, SETTINGS-SNAPSHOT, RESET-HISTORY, the populated own-step upgrade/comparator and the updated real-PostgreSQL browser journey. Catch up after #225 acceptance/merge and rerun the main lane check. The dispatcher must commit the working tree, then obtain **two fresh independent exact-integrated-commit verdicts (Opus and Sol)** in separate verdict records and separate acceptance. Neither an exact final commit nor an Opus reviewer is available in this builder turn, so no independent review or acceptance is claimed. No release/merge/push was performed.

No git command that writes was run. The intended conventional commit message is overwritten at `/private/tmp/jg-msg-ent-11a.txt`. Final working-tree/static check results are recorded below.

Final settled results (no application edits after these checks):

- `pnpm build`: exit 0, all 7 tasks passed, Next generated 41 static pages. Final log `/private/tmp/jg-ent-11a-build-final.log`.
- `pnpm typecheck`: exit 0, all 7 tasks passed after that build (`/private/tmp/jg-ent-11a-typecheck-last.log`).
- `LANE_BASE_REF=d1432d26 pnpm lint`: exit 0, root static checks and all 7 package tasks passed after build completion (`/private/tmp/jg-ent-11a-lint-settled.log`). A prior overlapping build/lint attempt failed on disappearing generated `.next/types` files; the sequential settled rerun passed without changing configuration or tests.
- `LANE_BASE_REF=d1432d26 pnpm lint:lanes`: exit 0 (`/private/tmp/jg-ent-11a-lanes-settled.log`). The required `origin/main` checks remain failed on #225 dependency paths as described above.
- Unchanged source context boundary: 145/145 passed (`/private/tmp/jg-ent-11a-context-complete.log`). The final source-unit selections total 5,318 passing tests across the package selections in the table; the focused/boundary reruns are subsets, not extra independent evidence.
- The added PostgreSQL test also includes table-owner update/delete/truncate refusal coverage for immutable attribution/settings. It is written, not executed here. Final no-emit test-graph compilation after that test-only addition exited 0 (`pnpm exec tsc -p /private/tmp/jg-ent-11a-test-types.json`, `/private/tmp/jg-ent-11a-test-types-end.log`).
- `git diff --check`: exit 0. Marker search found no `<<<<<<<`/`>>>>>>>` outside verdict history. Read-only diffs confirm no edits to predecessor migrations, `migrate.ts`, `MIGRATIONS.md`, the #225 migration or the merged context-boundary test/pins. No executable reference to the removed local Playwright config remains. No AI prompt/model/extraction behavior changed; no live-model evaluation is claimed.
- Final HEAD remains dispatcher merge `a395bbed8f97c13186adf6a0ac4a3a9cd258ded5`; the rework is uncommitted in the working tree. The dispatcher must create the exact integrated commit for the two fresh verdicts. Commit-message file exists at `/private/tmp/jg-msg-ent-11a.txt`.
