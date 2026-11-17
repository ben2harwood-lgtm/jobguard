VERDICT: PASS — bound to head fdaa725090c9a57ce88c054c77b1443f88e4cdc1
Reviewer: a fresh Claude Opus agent (Opus 5.5) that did not build this change and did not write its order. Nothing in the repository was edited, committed or pushed.
Lane: AMBER (floor amber). I found nothing the floor missed that is really RED: no money or fee maths, sign-in, sessions, roles, permissions, tenant separation, CI, tools or dependency change; the lane file gains one new line and no existing lane line is touched.
Piece: FIXLATER-1, PR #129 (ben2harwood-lgtm/jobguard), base ff072c7, 9 files, +340/-10. PR head on GitHub = fdaa725… (confirmed).

## Question 1 — does it meet the order? (item by item)

1. M4-1-S wait — MET. The only change to apps/web/e2e/M4-1-S.spec.ts is one inserted line, `await expect(button(page,"Open materials-320 overcharge")).toBeEnabled();`, directly before the `.focus()` line (now :18-19). I proved by script that removing that one line gives back the base file byte for byte. No assertion or timeout changed.

2. UIWIRE-9 wait — MET. The only change is one inserted statement, `await expect(page.getByTestId("stage-status")).toHaveText("Complete");`, between clicking "Complete this stage" and "Rebuild from approved sources" (removing it gives back the base file byte for byte). No new or longer timeout, no retry, no waitForTimeout, nothing removed or loosened. The cause is plain from reading: the Rebuild button is never disabled (job-final-account.tsx), so the spec could press it before the "complete" save had come back; the page shows "Complete" only from the server's saved answer (proof-stage.tsx: `complete=Boolean(view?.completion)`, set only after the POST returns). So it waits on a state the page really shows, and that state is the persisted one. CH-2 and UIWIRE-7 already use the same label the same way.

3. MIGRATIONS.md — MET. Checked against packages/db/src/migrate.ts (registered tail: 0097, 0102, 0103, 0106, 0107, 0109, 0110, 0111, 0112) and packages/db/migrations/ (57 files, 57 unique registered names, no 0108 file). The 0107 section now says "Migration 0107", "through 0106 … 0107 applied" (matches recovery-message-upgrade.integration.test.ts:14,36-39) and keeps the history sentence (assigned 0099 on 7 Oct, renumbered to 0107 on 8 Oct). The 0110 section now gives the true order 0106, 0107, 0109, 0110, 0111, 0112 and says 0108 is not registered. CH-1 = 0109 and ENT-2 = 0110 are correct. Only those two sections changed (two hunks).

4. "Earlier preview replaced" count — MET. recovery-messages.tsx:96 counts messages that are superseded AND still at status "previewed"; :222 shows the line only when the count is above zero; the sentence and its singular/plural are unchanged. The view does carry both fields (repository :555). Both scenarios the order names are tested (recovery-messages.test.tsx:33-42). Fails-without-fix PROVEN BY EXECUTION: with the base component swapped in, both new tests fail (2 failed / 87 passed) for the expected reason. My boundary cases at head: delivered + superseded preview + current -> "1 earlier preview…"; two superseded previews -> "2 earlier previews…"; only the current message -> no line; delivered + reminder -> no line. One judgment call is recorded as LATER-1.

5. Picker lookup on job change — MET. recovery-cases.tsx:55 refuses to start a lookup whose world is stale, and :67-68 hands the lookup the world captured at render, so the leftover "ready" from the old job can no longer start a lookup for the new job before its register is read. It uses the file's existing `world` guard. The new test (recovery-cases.behaviour.test.ts:158-190) is in the existing test style. Fails-without-fix PROVEN BY EXECUTION: with the base component swapped in it fails (1 failed / 124 passed) because the new job's lookup starts early. My boundary cases at head, all pass: job changes twice (A -> B -> C before B's register answers: no lookup for B, C's only after C's register, A's late answer ignored); two changes in the same turn; A -> B -> back to A (the first visit's late answer cannot write); first load still fills the picker.

Lane line — MET. One new `"fixlater-1"` line in name order (between ent-4a and harden-signin), with the ordered branch, note and exactly the ten allowed paths; no other line changed. All 9 changed files are inside that list.

## Question 2 — wrong money, security/access hole, lost or corrupted data, broken main journey?

No. The only application code changed is two display paths on the practice recovery screen: a history footnote count, and when the optional delivery picker fetches. Neither sends a command, changes stored data, or touches money, status, sign-in or tenant boundaries (the new behaviour test also asserts zero POSTs). I traced that the picker lookup still fires on first load, after a failed-then-retried read, after one or two job changes, and under React's development double-mount, so the "open a case" journey is not starved of deliveries. The two spec edits only add waits; they cannot hide a failure, they would surface it earlier. The docs edit is records only.

## BLOCKING findings

None.

## LATER findings

- LATER-1 — apps/web/app/ui/recovery-messages.tsx:96: an earlier message whose approval was revoked, or that was blocked, and was then replaced by a new preview is no longer counted (base showed "1 earlier preview replaced by this one."; head shows no line). The order's bracket "(superseded and never delivered)" read literally would count these; the builder took the narrower reading "never got past preview". Display only, and it never over-claims. Integrator to decide which reading was meant; no test pins it either way.
- LATER-2 — apps/web/app/ui/recovery-messages.tsx:222: preview, re-preview, deliver, then reminder preview shows "1 earlier preview replaced by this one", though that preview was replaced by the delivered message, not by the reminder. Follows the order's counting rule; the wording is slightly off.
- LATER-3 — apps/web/app/ui/recovery-cases.tsx:67: reads a ref (`world.current`) while rendering, which React's guidance discourages. It is correct here (traced), but it is a fragile pattern for future edits.
- LATER-4 — docs/verdicts/FIXLATER-1/BUILDER_RECEIPT.md:111-114: the ordered vitest command cannot load on a fresh checkout until core and api are built ("3 suites failed to load"); the same happened on this Mac. Worth one line in future orders.

## What I did

Source-inspected: the order; all 9 file diffs; proof-stage.tsx, job-final-account.tsx, recovery-message-repository.ts (:539-564), core recovery-message.ts status list, migrate.ts, the migrations folder, the upgrade test header, the behaviour-test hook runtime, the builder receipt (its counts match mine; it claims no browser or database pass).

Executed (worktree left clean; `git status --porcelain` empty afterwards):
- `git rev-parse HEAD` -> fdaa725090c9a57ce88c054c77b1443f88e4cdc1; `gh pr view 129` head matches.
- The ordered vitest command as written: exit 1, 0 tests (packages not built in this worktree). I did not build into the worktree.
- Same three test files via an out-of-tree config that reads package sources directly (/private/tmp/claude-501/fixlater1-review/vitest.review.config.mts): exit 0, 3 files, 214 passed.
- Same, with base recovery-messages.tsx served in place: 2 failed / 87 passed. With base recovery-cases.tsx served in place: 1 failed / 124 passed. Only the three new tests fail.
- Reviewer probes (appended out-of-tree, not in the repo): item 4 probe 90/90 pass with outputs above; item 5 probes 127/127 pass.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 0, "Lane boundary passed", base ff072c7…, head fdaa725….
- Scripted byte-for-byte checks that each spec edit is a single pure insertion: both true.

Did NOT verify: any Playwright spec (including M4-1-S and UIWIRE-9, so whether the two waits actually cure the intermittent faults is unproven until CI has run them repeatedly); any database or migration test; typecheck, full lint and build on this Mac. GitHub "checks" on this head was still pending when I looked (secrets and dependency-review passed). This PASS assumes the integrator confirms CI green on the final merge candidate. The item 5 test runs on the project's small stand-in hook runtime, not real React; its effect ordering matches React for this case, but there is no real-browser proof of a job switch without a remount.
