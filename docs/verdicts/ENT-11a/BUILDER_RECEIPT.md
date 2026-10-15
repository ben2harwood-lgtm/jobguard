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
