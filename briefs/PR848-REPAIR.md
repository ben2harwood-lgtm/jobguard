===BRIEF tommy-demo-fault-checks-20261119===
test(demo): tommy-demo-fault-checks-20261119 repair 1 (PR #848)
Piece: PR848-REPAIR, a repair of the existing piece tommy-demo-fault-checks-20261119, not a new piece.
Resume that piece's own saved Codex session if it can be found; otherwise record a successor session and why. Same branch
codex/sandbox/tommy-demo-fault-checks-20261119, draft PR #848. Candidate under repair: 3d7f45ec380d0554b60cbd62d423a200e432a222.
Current main inspected: 228aa98740f64d201b90a61574581b686b73fa2e. Read AGENTS.md, SIMPLE_LOOP.md and docs/workflow/SIMPLICITY_RULE.md first. Made-up data only.
Problem: test 2 in apps/web/e2e/TOMMY-demo-faults.spec.ts races "Confirm scope" against "Open £2,500 withheld payment" on purpose, and the
database cancels one of the two at random; the test only allows the opening to lose, so whenever the confirm loses it fails, and CI never retries.
Evidence: spec :195 expects confirm 200 with no other branch; :200-216 handle only an opening 503; :199 and :224 assume the first confirm
command won. apps/web/playwright.config.ts:7 retries: 0. Main run 44197103086 traced confirm 503 / open 200 for the same pair
(coordinator/burn-2026-11-20/jg-flake.md:12). Confirm route maps a database error to 503 {code:"DATABASE_UNAVAILABLE"}
(apps/web/app/api/jobs/[id]/confirm/route.ts:3); the page shows "Scope was not confirmed (DATABASE_UNAVAILABLE)." in a role="alert"
and re-enables the button, and each click sends a new commandId (apps/web/app/ui/review-proposal.tsx:61, :73).
Check notes: coordinator/burn-2026-11-20/check-pr848-flake-risk.md (has the suggested code) and prechecks/tommy-demo-fault-checks-20261119-3d7f45ec.md.
Smallest change, test 2 only:
1. Merge current origin/main into the branch first (git merge-tree shows no conflict; main changed other M4-1-S lines). Keep both sides.
2. Just before release() at :189, read the job's scope_revision count through the existing admin pool into diagnostics.scopeRevisionsBefore.
3. Replace :195 with: at least one side returned 200 (never both lost). Change `const confirmedCommand` at :199 to `let`, moved up before the branch.
4. If confirmation is not 200: expect 503 and body exactly {code:"DATABASE_UNAVAILABLE"}; expect the alert with text
   "Scope was not confirmed (DATABASE_UNAVAILABLE)." visible; expect zero app.command_receipt rows for that lost commandId; expect the
   scope_revision count to equal scopeRevisionsBefore. Then click "Confirm scope" once more, capture that request's body as confirmedCommand,
   record its status in diagnostics.confirmRetry, and expect 200 with JSON.stringify(diagnostics) as the message.
5. Leave :196-197 (status "Quote being prepared", 5 confirmed lines), the whole opening branch :200-216 and :217-228 unchanged. :224 then checks
   the receipt of the confirm that actually succeeded; :225 still demands exactly 5 revisions and 5 identities.
Allowed writes: apps/web/e2e/TOMMY-demo-faults.spec.ts and docs/receipts/tommy-demo-fault-checks-20261119.md (append the repair result),
plus the merge commit from main. config/lanes/tommy-demo-fault-checks-20261119.json already allows both and stays as it is.
Do not edit M4-1-S.spec.ts, test 1 (:52-158), any helper, playwright.config.ts, product code, migration, grant or other test.
No registry, migration catalog, runtime list or wording-matched unit test is touched: this is one e2e file (git grep at 3d7f45ec: only M4-1-S, the lane file and the receipt name it).
Failing-first: the confirm-loses path cannot be forced without faking a response, which this spec forbids (:178). Fail-first evidence is the
traced main run above. After the fix, run test 2 with --repeat-each=10 in the desktop project and record from each diagnostics attachment which
side lost (confirm, opening or neither). If the confirm-loses branch never ran, say so plainly in the receipt; do not fake it.
Run (repository root, local synthetic PostgreSQL as the e2e setup expects; one at a time):
  PLAYWRIGHT_SKIP_BROWSER_GC=1 timeout 1500 pnpm --filter @jobguard/web test:e2e TOMMY-demo-faults.spec.ts --workers=1
  PLAYWRIGHT_SKIP_BROWSER_GC=1 timeout 1500 pnpm --filter @jobguard/web test:e2e TOMMY-demo-faults.spec.ts -g "concurrent confirm-scope" --project=desktop --repeat-each=10 --workers=1
  ./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit, pnpm lint:lanes, git diff --check
Done looks like:
- No line in test 2 requires the confirm to win; a check fails if both commands lost.
- A losing confirm is proven fully rolled back: exact 503 body, visible alert text, zero receipt rows for its commandId, scope count unchanged.
- One fresh "Confirm scope" click after a loss returns 200, and :224 checks that command's receipt is "succeeded".
- Diff against 3d7f45ec touches only test 2 between :165 and :200, plus the receipt and the main merge. Every other assertion, the
  test.setTimeout(180_000), playwright retries: 0 and test 1 are byte-for-byte unchanged.
- Branch contains current main (git merge-base --is-ancestor origin/main HEAD succeeds).
- Both tests pass in mobile-360 and desktop on the merged head; the repeat run result and who-lost tally are in the receipt.
- Full exact-head CI green on the new head (checks, core, core-checks, core-db, web, web-shards, bundle, secrets, dependency-review);
  Vercel previews may fail (blocked account).
Out of scope: fixing the deadlock itself (M4-1-S-FLAKE is building a lock-order fix separately; if it lands, neither side may lose and this
test still passes), the confirmedJob wait in M4-1-S, test 1's product-finding annotation, any new case, timeout, retry or helper change.
Never weaken, skip or delete a test. NOPR is not set: the PR already exists; push to the same branch only. No self-review, no merge.
Finish with: READY, the commands run with results, and every command not run.
===END tommy-demo-fault-checks-20261119===
JOB: tommy-demo-fault-checks-20261119 repair 1 | not RED | must be ON MAIN first: none

RED? No. Test-only, one spec, no product, database or grant change, and the admin observer is unaffected by LP-11. The one independent check
must run TOMMY-demo-faults.spec.ts on real PostgreSQL in both browser projects on the exact new head, diff against 3d7f45ec to confirm only
test 2 :165-200 moved and nothing was loosened, and confirm full CI on that head. Source-only = HOLD.
Limit: tests-only piece not on the work list, so this is its one repair. If still not green after it, set the piece aside (cc-work drop).

No-duplicate note (checked 20 Nov 09:14 UK): PR #848 open, draft, MERGEABLE, head still 3d7f45ec (gh pr view 848). One remote branch for it.
cc-work list: no PR848-REPAIR line; TOMMY-1119-PRS says "#848 held (race)"; M4-1-S-FLAKE is building a separate product lock-order fix
(different file, not this test). AGENT_CHOICES.md 08:19 line holds #848 with no repair dispatched. No brief for #848 in astra-replies/ or
briefs/ (REAL-PLAIN-BUTTON-NAMES only warns that #848 adds button-label uses; this repair adds no new label).
Not verified: I ran no test. I did not confirm that scope_revision has no rows before confirm (hence the before/after count, not a fixed 0),
nor that a confirm retry succeeds once the recovery case is open (M4-1-S traces suggest it does). Both are for the builder's run to show.

## Plan check
(20 Nov 2026 09:20 UK, independent Opus 5.5 medium helper, plancheck-PR848-REPAIR. Read-only; I ran no tests.)

**Verdict: READY.** Two small wording fixes are listed below. Neither blocks.

What I checked against the real code:
- PR #848 is still open, draft and MERGEABLE, head 3d7f45ec380d0554b60cbd62d423a200e432a222 (`gh pr view 848`). origin/main is 228aa98740f64d201b90a61574581b686b73fa2e. `git merge-tree --write-tree origin/main 3d7f45ec` merges with no conflict.
- The spec lines are as the brief says: :160 is the test 2 title, :178 the "no success API fulfilled" comment, :189 `release()`, :195 `toBe(200)` on the confirmation, :196-197 the status and line-count checks, :199 `const confirmedCommand`, :200-216 the opening-503 branch only, :224 the receipt check on the first confirm command, :225 the 5 revisions / 5 identities check. Test 1 starts at :52. playwright.config.ts:7 has `retries: 0`.
- Confirm route (apps/web/app/api/jobs/[id]/confirm/route.ts:3) turns any error that is not a capture error into 503 `{code:"DATABASE_UNAVAILABLE"}`. review-proposal.tsx:61 sets the notice `Scope was not confirmed (${code}).`, and that notice shows as `<p role="alert">` in the review view. Each click sends a new `crypto.randomUUID()` commandId and saves the review first.
- "Zero receipt rows after a lost confirm" holds. packages/db/src/commands.ts:76-100: `begin_command`, the change itself and `complete_command` all run inside one `withTenant` transaction, so a cancelled confirm rolls back its receipt and its scope rows together.
- A retry after the case has been opened is not blocked by the case. Neither `start_quote_from_review` (packages/db/migrations/0521_lp5a_commands.sql) nor apps/api/src/capture/ checks for recovery cases. Whether the retry really returns 200 is still for the builder's run to show, as the brief says.
- The allowed files are complete. `git grep TOMMY-demo-faults 3d7f45ec` finds only the spec, an M4-1-S comment, the lane file and the receipt. The lane file config/lanes/tommy-demo-fault-checks-20261119.json already allows the spec and the receipt. No registry, catalog or wording-matched test needs to change.
- No duplicate work. cc-work has no PR848-REPAIR line. TOMMY-1119-PRS says "#848 held (race)". M4-1-S-FLAKE is a separate product lock-order fix. The AGENT_CHOICES 08:19 line holds #848 with no repair sent.
- Not RED is right: one e2e spec, with no product code, migration or grant change. Fail-first can't be forced honestly, and the traced main run is acceptable evidence. Asking the receipt to say plainly whether the confirm-loses branch ever ran is the right call.

Non-blocking fixes:
1. Placement (wording). Say outright that the new confirm-loss branch goes straight after the new :195 line and before :196. If it went anywhere later, :196 would time out on "Quote being prepared" before the retry happens.
2. Scope the diff and CI checks. (a) After the main merge, a whole-tree diff against 3d7f45ec also shows main's changes. Make that done-check `git diff 3d7f45ec HEAD -- apps/web/e2e/TOMMY-demo-faults.spec.ts docs/receipts/tommy-demo-fault-checks-20261119.md` and `git diff origin/main HEAD --stat` (expect only the 4 PR files). (b) M4-1-S on main still flakes with `retries: 0` until M4-1-S-FLAKE lands. A red web-shards job caused only by an M4-1-S failure therefore doesn't count against this repair and isn't a reason to `cc-work drop` it. Re-run once, or wait for M4-1-S-FLAKE.

Later note: none.


Session note: the original builder session could not be found on the Gmail Cloud route, so this is a recorded successor session. Work on the existing branch of PR #848 and push to it; no new PR.

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
