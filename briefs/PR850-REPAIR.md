===BRIEF tommy-money-gap-checks-20261119===
test(demo): tommy-money-gap-checks-20261119 repair 1 (PR #850)
Piece: PR850-REPAIR, a repair of the existing piece tommy-money-gap-checks-20261119, not a new piece.
Resume that piece's own saved Codex session; same branch codex/sandbox/tommy-money-gap-checks-20261119, draft PR #850.
Candidate under repair: 5642fb6a5fb92ed09adb85190080e32029029edd. Current main inspected: 228aa98740f64d201b90a61574581b686b73fa2e.
Read AGENTS.md, SIMPLE_LOOP.md and docs/workflow/SIMPLICITY_RULE.md first. Made-up data only.
Problem: the support-v04 database check reads its rows by setting a tenant value, which LP-11 (#852) retired.
On current main that connection therefore sees no rows, so support-v04 fails at the "exactly one command" assertion, or would pass for the wrong reason.
Evidence: apps/web/e2e/TOMMY-money-gaps.spec.ts:357-376, BEGIN READ ONLY at :362 and set_config('app.tenant_id') at :363, connecting as jobguard_runtime at :358.
Evidence: LP-11 tenant policies need a bound request (packages/db/migrations/0765_lp11_bound_tenant_rls.sql); main changed its own copy of this
pattern in commit 0af1cace5 to apps/web/e2e/helpers/bind-practice-request.ts, used by recovery-allocation-journey.ts:127-128 and M4-5-S.spec.ts:233.
Check note: coordinator/burn-2026-11-20/jg-check-850.md and prechecks/tommy-money-gap-checks-20261119-5642fb6a.md.
Smallest change, one function in the spec:
1. Merge current origin/main into the branch first (the spec is a new file, so no conflict is expected). Keep both sides; no behaviour change.
2. Import { bindPracticeRequest } from "./helpers/bind-practice-request".
3. Give allocationReceipt a first argument page: Page; open with "BEGIN" (not READ ONLY, because app.bind_request writes the binding row).
4. Replace the set_config line at :363 with await bindPracticeRequest(client, page, tenant). Keep every SELECT, COMMIT and ROLLBACK as now.
5. Pass page at the four callers :527, :554, :568, :593. Update the :356 comment to say it binds the browser's practice session.
Do not touch the support-v02 observer at :253-280; it connects as the database owner and is unaffected.
Allowed writes: apps/web/e2e/TOMMY-money-gaps.spec.ts and docs/receipts/tommy-money-gap-checks-20261119.md (append the repair result).
Plus the merge commit from main. No other file. config/lanes/tommy-money-gap-checks-20261119.json stays as it is (it already allows both files).
Do not edit bind-practice-request.ts, recovery-allocation-journey.ts or any other helper, product file, migration, grant or existing test.
Failing-first: after the merge and before the fix, run the support-v04 test and record that it fails at the commands toHaveLength(1) assertion
(around :529). Then make the fix and show the same test passing. If it does not fail first, record exactly what happened and stop for the checker.
Run (from the repository root, local synthetic PostgreSQL on 127.0.0.1:55432 as the e2e setup expects):
  PLAYWRIGHT_SKIP_BROWSER_GC=1 timeout 1500 pnpm --filter @jobguard/web test:e2e TOMMY-money-gaps.spec.ts --workers=1
From the repository root: ./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit, pnpm lint:lanes and git diff --check.
Done looks like:
- allocationReceipt binds through bindPracticeRequest; no set_config('app.tenant_id') remains anywhere in TOMMY-money-gaps.spec.ts.
- Branch contains current main (git merge-base --is-ancestor origin/main HEAD succeeds).
- support-v02 and support-v04 both pass in both browser projects on the merged head, with a recorded fail-first run of support-v04.
- Every assertion in the spec is unchanged: same counts, amounts (£384 gross, £320 net, £64 tax), ids and toEqual replay checks at :554/:568/:593.
- Diff against the old head touches only the observer function, its import, its four callers, one comment and the receipt.
- Full exact-head CI green on the new head (core, core-db, web, web-shards, secrets, dependency-review); Vercel previews may fail (blocked account).
Out of scope: any new case, extra assertion, helper refactor, timeout change, password handling, or the receipt's noted unexercised payment guard (LATER).
Never weaken, skip or delete a test. NOPR is not set: the PR already exists; push to the same branch only. No self-review, no merge.
Finish with: READY, the commands run with results, and every command not run.
===END tommy-money-gap-checks-20261119===
JOB: tommy-money-gap-checks-20261119 repair 1 | not RED | must be ON MAIN first: none (LP-11 #852 already on main)

RED? No. Test-only, no product, database or grant change. But it reads through tenant row security, so under the 19 Nov rule
(RLS checks must run end to end) the one independent check must actually run TOMMY-money-gaps.spec.ts on real PostgreSQL in both
browser projects on the exact new head, confirm by diff that no assertion moved, and confirm full CI on that head. Source-only = HOLD.

Limit: this is a tests-only piece not on the work list (ALL_BUILDS_LOOP.md:41), so this is its one repair. If it is still not green
after this round, set the piece aside (cc-work drop) rather than repair again.

No-duplicate note (checked 20 Nov 08:30 UK): PR #850 open, draft, head still 5642fb6a (gh pr view 850). Only one remote branch for it
(git branch -r). cc-work list has no own line; TOMMY-1119-PRS line says "#850 needs Codex repair". AGENT_CHOICES.md 08:19 line says the same,
with no repair dispatched. No repair brief in astra-replies/ (only the open-PR list mentions it). No codex-runs entry named tommy-money.
Not verified: I did not run the spec, either failing on main or passing after the fix; the predicted failure is from reading the code and
main's matching helper change. Read copy of the spec: ~/Claude/Projects/review-scratch/burn-1120-pr850-brief-spec.ts (plain file, not a worktree).


Session note: the original builder session for this piece could not be resolved from the Cloud sidebar, so this is a recorded successor session (reason: original session not found on the authorised Gmail Cloud route). Work on the existing branch codex/sandbox/tommy-money-gap-checks-20261119 at 5642fb6a; push to it; no new PR.

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
