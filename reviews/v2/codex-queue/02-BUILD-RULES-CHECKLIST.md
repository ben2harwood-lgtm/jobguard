# Build rules checklist (paste into every packet and builder prompt)

For JobGuard (jobguard repo, AGENTS.md rev 3.0) and Vibe Control (aac-studio, LEDGER.md). Version 1.1, 24 Nov 2026. Sources: AGENTS.md, SIMPLICITY_RULE rev 2, WORKING_AGREEMENT §4 and §5, ALL_BUILDS_LOOP, and the project workflow. Where this sheet and the repo rules differ, the repo rules win.

## Before you build
1. **Check for duplicates.** Look for an existing branch or PR for this packet. If you find one, stop and report.
2. **One packet = one branch = one PR.** Base the branch on the packet's direct parent only. Do not merge a sibling packet's branch in, unless the packet names the merge (for example a screens packet that shows earlier pieces). Say so in the PR body.
3. **Branch name shows who builds it.** Codex uses `codex/sandbox/<piece>` and Claude uses `claude/<...>`. Never use the other vendor's prefix.
4. **Declare the tier in the title and body** (T0, T1, T2 or RED). A new table, migration, RLS or grant change, money, sign-in, tenant boundary or hidden data is **RED**. A CI change or new API contract is at least **T2**.
5. **Stay inside the packet.** No refactors of unrelated code, no new frameworks or switches, and reuse existing helpers. Adjacent work goes on the LATER list.

## While you build
6. **Audit chain (AGENTS §5.7).** Every command that changes data appends exactly one event (`appendAuditBatch`) in the same transaction. A replay appends nothing. The payload holds no free text, emails or media, and no key named `version`. Test it: a forced failure leaves neither the row nor the event.
7. **Commands.** Each one carries person, time, job, expected version and replay identity. A stale version is refused, and the same id with changed content is refused.
8. **Migrations.** Use only your reserved number. RLS is enabled and forced, runtime gets SELECT/INSERT only, and the migration note and proof file are included. Add a second-firm test (select, insert, update and delete none of the rows).
9. **No secrets or real sends.** No real keys in code or fixtures, and no fixed secret on anything reachable from outside. Outbound goes only to the local catcher. Zero paid AI calls unless the packet says otherwise.
    - **Origin check (V2 addition, 25 Nov):** every new POST route checks `Origin` against the configured `AUTH_ALLOWED_ORIGIN` (signed-in: `resolveVerifiedTenantContext(..., identity.allowedOrigin)`; any route: `isTrustedBrowserOrigin` from `apps/web/app/api/contractor/origin.ts`; customer link: F6's `extraLinkOrigin`). Never compare with `new URL(request.url).origin` and never trust forwarded headers. See 01-RULES rule 21.
10. **Never weaken checks.** Do not delete, skip or loosen a test or guard to get green. A test that skips itself must fail in CI, not pass silently.

## Tests
11. **Test the behaviour, not the syntax.** Call the real application path. Cover the negative cases, persistence (survives reload) and the access boundary.
12. **For a bug fix**, show the test failing before the fix and passing after it.
13. **Run the tests through the repo's own runner** (the V2 seed suite on real PostgreSQL for anything with a table). Run typecheck, lint and lane lint against the real base.
    - New seed or browser proofs must pass inside the full suite, not only alone, and must not trip the sign-in rate limit (reuse the suite's shared sign-in).
    - Browser leak checks (no off-origin requests, no hidden data) look only inside the page's main content, with the Next.js dev indicator turned off.
    - **V2 browser sign-in (V2 addition, 25 Nov):** reuse the one named pattern (`signInOnce` from `tools/v2/test/browser-session.mjs` once Q20 merges; until then copy K5A's `before()` block in `tools/v2/payment-schedule.browser.test.mjs`). Origin from `V2_TEST_ORIGIN`, HTTPS phone origin only (the secure cookie isn't sent over HTTP), sign in once per file and reuse `storageState`. See 01-RULES rule 22.

## Hand-off
14. **PR body, at the exact head SHA:** commands actually run with counts, the invariants touched, migrations, known limits, and "Rework risk: low/medium/high".
15. **"Rules met" list.** One line per rule above that applies, naming the file and test that proves it. A rule claimed without proof is a rejection.
16. **Review by the other vendor at the exact head.** Claude-built work gets a Codex review, and Codex-built work gets a Claude check. Never review your own work. "Source inspected", "test executed" and "independently verified" are different claims. Missing evidence is a hold.
17. **One build plus up to two repairs.** A third round needs Ben's OK, and only for a finding that is **serious** (money, security or tenant boundary, lost data, broken main journey) **and** reachable by a real user today. Everything else goes on LATER.
18. **Only Ben merges T2 and RED.** No approving, merging, deploying or spending by any agent.
