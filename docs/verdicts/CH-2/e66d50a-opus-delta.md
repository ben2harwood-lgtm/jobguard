VERDICT: PASS — bound to head e66d50adff3b497b268697225891f87404469544
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (7 Oct 2026); did not build, repair or order any commit in this PR.

This is a delta review since the REPAIR at 535e588 (comment 6048537446). One commit is new: e66d50a (round 18, by a Claude Sonnet builder). It adds the missing "Save customer and site" step to one browser test, plus a builder receipt.

In short, the fix is exactly what the last verdict asked for, nothing else changed, and CI is now fully green on this head. That includes all 238 browser cases. SBOX-SESSION-1 now passes at both screen sizes, including its ownership and evidence-pack steps, which had never run on this branch since CH-3a was merged in.

## Findings

**P1:** none.

**P2:** none.

**P3 (notes only, carried over; neither blocks this PR and neither is caused by round 18):**
- `packages/db/MIGRATIONS.md:155-156` still says "six" earlier non-UTF8 suites. There are eight. That wording came from CH-3a on main. A one-word fix is optional.
- `watchdog-legacy-identities.integration.test.ts:281` opens `0096_watchdog_live.sql` by its literal name. If CH-2 is ever renumbered away from 0096, that test fails loudly rather than silently. 0096 is CH-2's allocated number in the 7 Oct renumber plan, so this is safe as it stands.

## Round 18 against the last verdict's required fix (all confirmed)

1. **The change is exactly the two asked-for lines and the receipt.** `git diff 535e588 e66d50a --stat` shows two files: `apps/web/e2e/SBOX-SESSION-1.spec.ts` (+2) and `docs/verdicts/CH-2/BUILDER_RECEIPT_round18.md` (+35, new). It removes 0 lines. No assertion was changed or deleted, no timeout was added and no product code, migration, config, workflow or Playwright config was touched (`git diff 535e588 e66d50a -- apps/web/playwright.config.ts .github` is empty). The commit's only parent is 535e588. The merge base with main is still 0264158, and main has not moved.
2. **The step matches `openReview` exactly and comes before any pricing.**
   - **Probe 1 (my own):** once the leading spaces are stripped, `SBOX-SESSION-1.spec.ts:50-51` and `helpers/capture-journey.ts:30-31` are byte-for-byte the same (`diff` exit 0). Both use the same role locator with `exact:true`, the same `party-customer` test id, the same "Practice Customer" text and the default timeout.
   - **Placement:** the step comes straight after the "Check the work items" heading assertion (`:49`) and before the line-accept loop (`:52`), "Confirm scope" (`:58`), "Price the work" (`:60`) and `startWatchdogJob` (`:61`). The first, unconfirmed job and its 404/401 assertions (`:5-37`) and its final ownership and reload checks (`:99-105`) are untouched.
3. **The step really satisfies the quote screen's gate. It does not just hide it (Probe 2, source check).**
   - `workspace-shell.tsx:69` puts `<JobParties>` on `/jobs/:id` for a captured job. `job-parties.tsx:31` defaults the customer name to "Practice Customer".
   - The save button (`job-parties.tsx:154`) is disabled only when the user has picked an existing site to reuse and has not confirmed it. The default is no reuse. After a save, `job-parties.tsx:116` sends `job-parties-saved`. `party-customer` (`:130`) is drawn only from the saved current binding, so the new assertion proves the server stored the parties.
   - `quote-editor.tsx:14` reads `/api/jobs/:id/parties` when it mounts and again on that event. `partiesReady` therefore comes from real saved state, and the `disabled={!partiesReady||…}` gate itself is unchanged.
4. **Scope.** I ran `tools/agent-lane-boundary-lint.mjs` with a simulated pull_request event (base 0264158, head e66d50a, branch `codex/sandbox/ch-2`). Result: "Lane boundary passed", lane `ch-2`, exit 0. CI's own lint step says the same (log line 343).

## CI on the exact head (relied on)

Run 37699701038 (event `pull_request`, headSha e66d50adff3b497b268697225891f87404469544):

| Check | Result |
| --- | --- |
| `checks` (job 113059946382) | pass, 14m23s |
| `dependency-review` | pass. It is now green after PR #113 merged, so it is no longer the known repo-wide red. |
| `secrets` | pass |
| Vercel api/demo | pass (ignored build step) |

Inside `checks`, every step succeeded:

| Step | Result |
| --- | --- |
| install, typecheck, lint | pass (lint includes the lane lint) |
| `pnpm test`: `@jobguard/db` | 52 files, 495 tests passed (log lines 824-825) |
| `pnpm test`: other suites | 54 files / 1437 tests, 21 / 501, 13 / 115, 3 / 72, 1 / 2, 1 / 1, all passed |
| `pnpm build` | pass |
| Browser step | "Running 238 tests using 1 worker" (line 1327), then "238 passed (9.4m)" (line 1331) |

The browser step reports no failed, flaky or skipped cases. There is no ECONNREFUSED and no SH-1 timeout anywhere in the log.

**How I know SBOX-SESSION-1 passed in both projects.** The CI reporter prints dots, not test names, so this is an inference, and every link in it is checked:
- `playwright.config.ts:7` sets `retries: 0` and has no grep or test filter.
- The spec has no `skip`, `only` or `fixme`.
- Round 18 adds no test and touches no config.
- The test set is therefore the same as in run 37697375872 on 535e588, which also had 238 cases. Two of those failed, and they were `[mobile-360]` and `[desktop]` `SBOX-SESSION-1.spec.ts:5:5`.
- With 238 of 238 passing, no retries and no skips, both cases ran to completion and passed. That includes everything after the old failure point: `startWatchdogJob`, the material, purchase-order and supplier-document bindings, the recovery case, the evidence pack, the stranger 404s on every pack route, and the replay-equality check (`:61-97`).

## Source-inspected, executed, not verified

- **Source-inspected:**
  - the full delta (spec and receipt)
  - `SBOX-SESSION-1.spec.ts` in full at the head, and its diff against main
  - `helpers/capture-journey.ts`
  - `job-parties.tsx` (save, render and event lines)
  - `quote-editor.tsx:14` (the parties gate)
  - `workspace-shell.tsx:69`
  - `playwright.config.ts`
  - the round-18 receipt
- **Executed:** `git diff 535e588 e66d50a` (stat and full); Probe 1 (`diff` exit 0); the removed-line count (0); the lane lint with a simulated PR event (exit 0); `gh pr checks 97`; `gh run view 37699701038 --job 113059946382 --log`, with counts taken from that log.
- **Relied on CI:** every test count above, typecheck, lint, build and the browser suite. I did not run the PostgreSQL or browser suites locally, and I did not run `pnpm install` in my worktree (`/private/tmp/opus-ch-2-e66d50a-0710`).
- **Not re-reviewed:** the code from rounds 12–17 and the CH-3a integration. Earlier delta verdicts confirmed them (comments 6048208725 and 6048537446), and round 18 does not touch them.
- **The builder's own run:** the receipt says the builder could not run the spec locally, because its Chromium install was missing or incomplete. That is honest, and CI on this head now supplies the proof.

