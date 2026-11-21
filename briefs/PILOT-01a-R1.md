# PILOT-01a repair round 1 (coordinator, 21 Nov 2026)

Same task, same branch codex/sandbox/pilot-01a. Start from your head 5f5715b53279ba5c1030dc45c4e64c087e325433 and push the repair on top (no force-push). The independent Claude check returned FIX; full findings: verdict file content is below.

Fix exactly these four, nothing else:
1. apps/web/app/api/jobs/route.ts:13 imports "../../lib/pilot-workspace-server.js", which does not resolve for Next/webpack (bundle job fails). Import without the .js extension, as sibling imports do. Confirm `pnpm --filter @jobguard/web build` (or the repo's web bundle command) succeeds.
2. pilot-identity.test.ts:3, pilot-effects.test.ts:8 and final-check-task-executor.test.ts:1 import packages/config/dist/policy-gates.pilot-test-fixture.js. CI typechecks before dist exists (TS2307 in core-checks). Import the fixture the way the web test does (from the config source / package export that resolves without a build). Confirm the API typecheck passes from a clean tree with packages/config/dist removed.
3. Coordinator ruling (narrowing clarification of the same contract change as enterprise-real-data.test.ts:26): apps/api/src/effects/policy-gates.test.ts:37-46 may be updated to expect REFUSAL for proposed D02/D04 in pilot_no_charge, keeping every synthetic/practice allowance it covers. No other existing expectation may change.
4. packages/db/test/identity.integration.test.ts:98 expects pilot sign-in to quietly return nothing. Keep that test unchanged and fix the code: when G1 is closed, persisted-auth-provider.ts:120 must refuse with the same generic/empty result the test expects (no distinguishable PILOT_G1_CLOSED leak to the caller). Internal logging of the reason is fine.

Migration 0771_pilot_identity_session is accepted as a named scope note (needed to store pilot sessions); leave it as is.

Run and report exact commands with pass counts: config tests, API tests, API + web typecheck, web build, `node --test tools/*.test.mjs`. Final message: new head SHA.
VERDICT: FIX — PILOT-01a @ 5f5715b53279ba5c1030dc45c4e64c087e325433 (base ee974f0343fee3822f952b0299bc1f4c2ac8ad3d, PR #872)

Checker: independent Claude (Opus 5.5, medium). Did not build. No edits, push or merge.

## Blocking findings

1. **Web app no longer builds (broken main journey / deploy).** `apps/web/app/api/jobs/route.ts:13` does
   `await import("../../lib/pilot-workspace-server.js")`. No `.js` file exists. Next/webpack fails with
   "Module not found: Can't resolve '../../lib/pilot-workspace-server.js'". This is CI job `bundle`
   (run 44885711546) failing in `next build --webpack`. vitest and tsc resolve it, so local checks pass.
   Fix: import `"../../lib/pilot-workspace-server"` with no extension, like the rest of the app.
2. **API typecheck red in CI (`core-checks`, run 44885711578).** Three new or changed tests import
   `../../../../packages/config/dist/policy-gates.pilot-test-fixture.js`: `apps/api/src/auth/pilot-identity.test.ts:3`,
   `apps/api/src/effects/pilot-effects.test.ts:8` and `apps/api/src/final-check-task-executor.test.ts:1`. CI typechecks
   before config `dist` exists, so it reports TS2307 and then cascades into TS2345 errors. It passed locally only because the
   harness had already built dist. Fix: import the fixture from `packages/config/src/...` (as the web test already does), or
   export it properly.
3. **Existing test now fails: `apps/api/src/effects/policy-gates.test.ts:37-46`** ("preserves known mode pilot_no_charge",
   for both D02 and D04). It still expects a proposed D02/D04 to pass in pilot. The contract requires refusal, so this
   expectation cannot hold. The contract names `enterprise-real-data.test.ts:26` as the only allowed expectation change,
   and the builder left this test red rather than changing it. This needs a coordinator clarification that it is the same
   expectation (a narrowing ruling): flip the pilot case to expect refusal, and make the approved case use a G1-open
   fixture. Not changing it is not an option, because required CI goes red.
4. **Existing real-PG test now fails: `packages/db/test/identity.integration.test.ts:98`.** It expects
   `PersistedAuthProvider("pilot_no_charge").authenticate(...)` to return `undefined`. That call now throws
   `PILOT_G1_CLOSED` (`apps/api/src/auth/persisted-auth-provider.ts:120`). The behaviour is still fail-closed, but the
   suite is red. Either `authenticate` returns `undefined` when G1 is closed (sign-in is still refused) or the coordinator
   rules on the expectation. Builder's choice. Simplest: keep the throw in requestCode/verifyCode/invite and let
   authenticate's caller map it.

## Contract checks (substance is otherwise sound)
- requireApprovedDecision (`packages/config/src/policy-gates.ts:36-49`): in pilot it refuses D02/D04/D06/D07/D12/D13 unless
  the exact ID, `approved` status and pinned version are all present. Absent, proposed, wrong-ID, wrong-version, superseded
  and revoked records are refused. Tests cover all six IDs. Both direct effect callers are covered
  (`pilot-effects.test.ts`). OK.
- G1 switch `requirePilotG1` (policy-gates.ts:80-103): closed by default. It needs an exact candidate SHA plus topology and
  migrations hashes, an active and unexpired record, G0 ≤ G1 ≤ activation ordering, and all six decisions at pinned
  versions. D04 alone does not open it (tested). It is read on every call, so revocation works mid-task (Final Check
  executor test). OK.
- Check points: identity requestCode/verifyCode/invite/authenticate/delivery, customer portal, worker start and
  execute_outbox (`executePracticeDispatch` refuses pilot even when G1 is open), tax invoice/dispatch effects, customer
  invoice issue, final-account issueInvoice, every FinalCheckApplication method, the Final Check worker (before
  read/execute/re-read/publish), and job-source intake. OK.
- Workspace: `pilot-workspace-server.ts` → `createPilotWorkspaceApplication` (via the `@jobguard/api/workspace` export) →
  `resolveVerifiedTenantContext` (principal-bridge). It refuses a practice cookie, checks the non-owner runtime role and RLS
  in SQL, and has no synthetic fallback. Real-PG boundary test: foreign-tenant, practice and contractor jobs get 404, a
  wrong tenant or header gets 403, a revoked membership gets 403, and the privileged URL gets 503. synthetic-server.ts and
  workspace-server.ts are unchanged. OK.
- Inventory: present in `docs/contracts/environment-modes-v1.md`, which assigns each apps/web/app reference to supported or
  blocked. OK.
- Migration 0771 (identity.session environment CHECK now allows `pilot_no_charge`): needed, because pilot sessions can't
  persist otherwise and lookup still requires an exact environment match. It is minimal and safe, and 0771 is the next free
  number on main (main ends at 0770). It sits outside the listed allowed paths but is the minimum the contract's persisted
  pilot session needs. Accept it as a named scope note. Migration-proof loader, lp-0 catalog and grant-freeze tests pass.
- Only `enterprise-real-data.test.ts:26` was edited among existing expectations. No guard was weakened. The added
  final-check-task-executor tests are additive.

## Commands (scratch: .../scratchpad/pilot-01a, head = git archive of 5f5715b5)
- pg-check setup.sh: install/hydrate/build/tsc exit 0.
- run.sh db1 (identity, enterprise-identity, enterprise-identity-fixlater-6, lp-0-catalog, lp-0-grant-freeze,
  lp-0-authority-paths, migration-proof-loader, practice-session; real PG, migrations incl. 0771): exit 1. 8 files,
  226 passed, 1 failed (identity.integration.test.ts:98, finding 4).
- packages/config vitest: exit 0, 28 files / 424 passed. config tsc exit 0.
- apps/api vitest (auth, effects, final-check*, workspace, customer-invoice, job-source, final-account, worker): exit 1.
  60 files, 1275 passed, 2 failed (policy-gates.test.ts, finding 3).
- apps/api tsc exit 0 locally (dist prebuilt), but CI typecheck fails (finding 2). apps/web tsc exit 0.
- apps/web vitest (pilot-workspace-server.test.ts with embedded PG, plus app/api/jobs): exit 0, 50 files / 368 passed.
- Integrity guard `node --test tools/*.test.mjs`: exit 0, 448 tests, 445 pass, 0 fail, 3 todo.
- PR #872 CI: bundle FAIL (finding 1), core-checks FAIL (finding 2), core-db/web-shards pending.
- Playwright e2e: not run. The web bundle does not compile (finding 1), so journeys can't be meaningfully run until that is
  fixed. The re-check must run the affected session/jobs journeys headless, with 2 workers.

## LATER notes
- G1 approval is an unsigned JSON env var. That is acceptable as "trusted deploy config" for now. PILOT-21/01b should bind
  it to a signed or hashed record.
- `customer-invoice.application.ts` and `final-account-lock.application.ts` gate on `process.env.JOBGUARD_ENV`, not on an
  injected mode. That is consistent with existing code.
- `FinalCheckExecutionPorts.environment` defaults to synthetic. A pilot executor must opt in explicitly. That is fine but
  should be documented.
