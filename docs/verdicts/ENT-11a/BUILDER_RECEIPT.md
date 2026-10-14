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
