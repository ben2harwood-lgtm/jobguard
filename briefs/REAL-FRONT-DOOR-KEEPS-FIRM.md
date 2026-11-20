REAL-FRONT-DOOR-KEEPS-FIRM (JobGuard, Codex Cloud environment jobguard). Work on new branch codex/sandbox/real-front-door-keeps-firm from current origin/main. Made-up data only.

===BRIEF real-front-door-keeps-firm===
Piece: real-front-door-keeps-firm. Branch: codex/sandbox/real-front-door-keeps-firm. NOPR=1. RED.
Base: current main, inspected at 228aa98740f64d201b90a61574581b686b73fa2e. No prerequisites, stacking or unlanded merges.
Read AGENTS.md, SIMPLE_LOOP.md and docs/workflow/SIMPLICITY_RULE.md before changing code.
Practice sandbox only: made-up data; no real names, email, sending, payment, provider, key or live AI.
Problem: every place that hands the browser its practice session sets no lifetime, so the cookie dies when the browser closes.
A trial builder who closes the browser loses their practice firm and its jobs the next day, though the server keeps the session up to 7 days.
Evidence: apps/web/app/api/practice-company/route.ts:20 and apps/web/app/api/session/route.ts:19 set jg_session with no maxAge.
Evidence: practiceCookieOptions in apps/web/app/lib/linked-practice-entry.ts:13-15 has no maxAge; auth/practice/route.ts:26-27 uses it for jg_session and jg_practice_pair.
Server limit: control_plane.practice_session expires_at defaults to created+7 days (packages/db/migrations/0094_practice_session_ownership.sql:8).
Linked browser credentials are capped at least(identity deadline, 7 days) (0741_identity_linked_practice.sql:293), and still need the live identity check (linked-practice-entry.ts:34-41).
Walk 4 finding W4-3 (coordinator/burn-2026-11-20/jg-walk4.md:102); first seen as walk 3 stop 20.
Smallest change: one exported constant in linked-practice-entry.ts, practiceSessionMaxAgeSeconds = 7 days less 60 seconds (604740).
The 60-second margin keeps the cookie from ever outliving the server row it names.
Add maxAge: practiceSessionMaxAgeSeconds to practiceCookieOptions; this covers the linked jg_session and jg_practice_pair together.
Add the same maxAge to the two plain jg_session sets at practice-company/route.ts:20 and session/route.ts:19.
Keep their existing flags exactly: httpOnly, sameSite "lax", secure-by-protocol, path "/". Do not switch them to practiceCookieOptions or to strict.
Sign-out (auth/signout/route.ts:10-11) and session/route.ts:22 spread practiceCookieOptions then set maxAge:0; keep that order so clearing still clears.
Do not change token values, server expiry, SQL, who may read a session, origin checks, CSRF, pairing receipts or any refusal path.
Allowed existing writes: apps/web/app/lib/linked-practice-entry.ts, apps/web/app/api/practice-company/route.ts, apps/web/app/api/session/route.ts.
Allowed existing test writes: apps/web/app/lib/linked-practice-entry.test.ts, apps/web/app/api/practice-company/route.test.ts.
Allowed existing test writes: apps/web/app/api/session/route.test.ts, apps/web/app/api/auth/practice/route.test.ts, apps/web/app/api/auth/signout/route.test.ts.
Allowed new writes: apps/web/e2e/real-front-door-keeps-firm.spec.ts and config/lanes/real-front-door-keeps-firm.json.
Lane file: version-2 shape as in config/lanes/approval-error-display.json, keyed real-front-door-keeps-firm, branch codex/sandbox/real-front-door-keeps-firm, allow exactly the changed files excluding itself.
No other writes. No backend, packages/, migration, middleware or identity-cookie (jobguard_session) change.
Only permitted expectation change: linked-practice-entry.test.ts:27 toEqual gains maxAge:604740; every other flag stays asserted.
Failing-first unit regressions (write first, show them failing on main, then passing):
- "practice-company sets a jg_session that lasts no longer than the server session" in practice-company/route.test.ts: Max-Age=604740 present, HttpOnly, SameSite=lax kept.
- Same assertion for POST in session/route.test.ts next to line 43, over http and https; the old-job cookie still expires at Date(0).
- auth/practice/route.test.ts next to line 25: both jg_session and jg_practice_pair carry Max-Age=604740, and the refusal test at :43-44 still sets no cookie.
- Sign-out still sends Max-Age=0 for both cookies, asserted in apps/web/app/api/auth/signout/route.test.ts.
Browser regression "blank practice firm survives closing the browser" in the new spec, 390x844 and desktop:
- From the front door start a blank practice firm and type one ordinary fictional job through existing screens.
- Assert context.cookies() jg_session has expires > now and <= now + 7 days (not -1, which means "ends with the browser").
- Close that context, open a new one with only the saved persistent cookies, reload the jobs list, and see the same firm and job.
Done looks like:
- No code path sets jg_session or jg_practice_pair without a lifetime, except the maxAge:0 clears.
- No practice cookie lifetime exceeds 604740 seconds.
- Closing and reopening the browser keeps the firm and its jobs (browser regression passes).
- Every existing cookie flag, refusal, reset, sign-out and linked-pairing test passes unchanged apart from the one named expectation.
Out of scope: changing the 7-day server cap; refreshing/sliding sessions; the jobguard_session identity cookie; making lax routes strict;
any "remember me" choice; capping linked cookies to the exact identity deadline (the server already refuses after it; LATER note only).
Run: from apps/web ./node_modules/.bin/vitest run --maxWorkers=1 app/lib/linked-practice-entry.test.ts app/api/practice-company/route.test.ts app/api/session/route.test.ts app/api/auth/practice/route.test.ts
Run: PLAYWRIGHT_SKIP_BROWSER_GC=1 pnpm --filter @jobguard/web test:e2e real-front-door-keeps-firm.spec.ts --workers=1
Require exact-head pnpm typecheck, pnpm lint, pnpm test, pnpm build and pnpm lint:lanes. Never weaken, skip or delete a test.
Finish authorised work and available checks, then commit and push without a pull request. List every command not run.
No self-review, self-acceptance or self-merge.
RED: touches the sign-in cookie. One independent exact-head check must actually run the four unit files above,
auth/practice/route.integration.test.ts against real PostgreSQL, and the new browser spec plus one existing front-door journey
(e.g. real-fc-typed-recovery.spec.ts). The checker confirms by diff that no SQL, token, origin, CSRF or pairing logic changed.
===END real-front-door-keeps-firm===
JOB: real-front-door-keeps-firm NOPR=1 RED | must be ON MAIN first: none

No-duplicate note (checked 20 Nov 08:25 UK): no remote branch matching front-door/keeps-firm/cookie/maxage on
origin (git branch -r); no open PR on ben2harwood-lgtm/jobguard with cookie/front/firm/session in the title;
cc-work list has no line for it; AGENT_CHOICES.md tail has nothing; no Astra reply orders it. check-demo-s-verdict.md:57
mentions the same loss but leaves it outside that check. Not verified: the browser-close loss in a real browser
(walk 4 read the code only).


Commit and push the branch; no PR, merge or deploy. Report the full 40-character SHA.

# Keep it simple: rule for every Codex build order

Revision: rev 2, 25 Oct 2026 (Ben's card simplicity-check-before-launch; original rules from Keep It Simple plan rev 3, section 2; Ben-approved coding-run audit additions 7–11).
Build dispatchers append this whole file to every Codex build prompt, so an edit here reaches every later build.

**KEEP IT SIMPLE — builder rule.** Build the smallest clear, maintainable solution that fulfils the approved
task and preserves all required behaviour and controls.

1. Reuse suitable existing code before introducing new abstractions.
2. Do not introduce speculative frameworks, versions, configuration switches or layers. Preserve anything
   required by approved contracts, including compatibility and recovery.
3. Prefer one authoritative source for a fact, except where separate sources or independent verification are
   deliberately required.
4. Keep functions and files understandable. Treat 80-line functions, 800-line files and 1,500-line files as
   prompts to investigate, not automatic failures. Data-heavy files are exempt from size-based criticism.
5. Never simplify away child safety, privacy, identity, financial controls, access restrictions, audit evidence,
   data protection or independent acceptance.
6. Never refactor unrelated code during a repair or catch-up. Never change checks, protected fingerprints, stored
   formats or approved interfaces without the required separate authorisation.

7. After reading required instructions, inspect the affected source, callers and tests. Search explicit paths first; exclude generated evidence, logs and dependency trees unless they answer a specific question. If output is truncated, narrow the query. Once the behaviour and affected path are clear, implement.
8. Use an explicit working directory and the repository's existing interpreter, dependency tool and test runner. Establish these from available configuration once; do not guess paths or rediscover them between commands. Before a long or permission-gated run of a new helper, perform its cheap syntax/import check where available.
9. Reuse existing parsers, validators and test helpers before writing alternatives. Keep repair diffs focused; avoid whole-file formatting and unrelated cleanup unless required by the repository. Preserve necessary compatibility, isolation and evidence binding.
10. Test the changed behaviour and the existing rules that depend on it, not just input syntax. When extending a state or format, inspect its consumers and cover affected open/closed, permission or failure boundaries. Confirm that new regression tests run through the actual repository test runner before handing them off.
11. Complete required checks and advance to the required review or handoff. Repeat or broaden checks only when a change, failure, specific unresolved risk or explicit gate requires it. Keep evidence in the existing receipt. A real external hold blocks the affected action; it does not justify speculative code or new reporting machinery.

Explain any substantial new complexity in the existing task receipt. Do not introduce another reporting document.
