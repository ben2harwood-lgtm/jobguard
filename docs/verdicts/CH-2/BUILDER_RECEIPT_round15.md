# CH-2 builder receipt — round 15

Test-only repair for `codex/sandbox/ch-2`, this worktree, PR #97, based on HEAD `bb45aad5ff75aedfd2e9041e0354d460b2bde424` (clean tree confirmed before the edit). Addresses the independent Claude Opus REPAIR at that head (PR comment 6047232486), whose only blocker is CI run 37687079569: browser step 194/196, `e2e/SBOX-SESSION-1.spec.ts:5` fails in both projects at `helpers/capture-journey.ts:50` with `locator('.quote-editor')` not found after 10 s. This is builder execution evidence, not an independent verdict or technical acceptance.

## Repair

Cause, from source: round 12 made this spec click "Confirm scope" and then call `startWatchdogJob(page)` at once. That helper's first step is `if (await price.isVisible()) await price.click();`, a single check with no wait. `ReviewProposal.confirm()` saves and confirms over the network before "Price the work" appears, so the check can find no button, pricing is skipped and the quote editor never opens.

Fix, in `apps/web/e2e/SBOX-SESSION-1.spec.ts` only: after clicking "Confirm scope", wait for the confirmed scope exactly as `confirmCapturedScope` does, then click "Price the work" with Playwright's auto-waiting click, as the M2-2-S spec does, before `startWatchdogJob(page)`.

```diff
       await page.getByRole("button", { name: "Confirm scope", exact: true }).click();
+      await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");
+      await page.getByRole("button", { name: "Price the work", exact: true }).click();
       await startWatchdogJob(page);
```

- The wait uses the same text and the default `expect` timeout (10 s from `playwright.config.ts`) that `confirmCapturedScope` uses. No new or longer timeout; no `waitForTimeout`.
- `getByTestId("job-status")` is unambiguous here: the captured-job branch of `WorkspaceShell` renders `PracticeJourney` → `ReviewProposal`, whose confirmed-scope section holds the only `job-status` element at this point. The other `job-status` elements (workspace-shell non-capture branch, quote-editor pre-live acceptance, customer payment status) are not on the page yet.
- If scope confirmation itself were failing, the `job-status` assertion now fails at that point with a clear message instead of a missing quote editor.
- No assertion in the spec was changed, removed or weakened. `apps/web/e2e/helpers/capture-journey.ts` is unchanged, so every other caller keeps its behaviour (SBOX-SESSION-1 was the only one relying on the one-shot `isVisible()` check).
- No product, migration, schema, lane-file or other test change. `0096_watchdog_live.sql` is untouched. Both files in this repair (the spec and this receipt directory) are already in the `ch-2` lane.

## Executed checks

Installed dependencies only; no install or download. Node `v24.17.0`.

| Command/check | Exit | Result |
| --- | ---: | --- |
| `pnpm typecheck` | 0 | Seven package tasks successful (six cached, one run). |
| `pnpm --filter @jobguard/web exec playwright test --list e2e/SBOX-SESSION-1.spec.ts` | 0 | Lists 2 tests in 1 file: `[mobile-360]` and `[desktop]` `SBOX-SESSION-1.spec.ts:5:5`. Listing only. |
| Lane lint with simulated PR metadata (`GITHUB_EVENT_NAME=pull_request`, ref `codex/sandbox/ch-2`, base `3395d343fd50d979c734daf4946ba293ee2ed836`, head `bb45aad…`) | 0 | "Lane boundary passed", lane `ch-2`, `apps/web/e2e/SBOX-SESSION-1.spec.ts` among the allowed files. This pre-commit run compares the committed branch diff; the post-commit run against the new head is recorded in the dispatcher handoff. |
| `git diff --check` | 0 | Clean whitespace. |

## Not run

The browser spec was not executed. The embedded PostgreSQL that `e2e/global-setup.ts` starts needs System V shared memory, and this Mac has all 32 of its `kern.sysv.shmmni` segments in use (`ipcs -m` shows 32), the same exhaustion the reviewer hit. I did not free segments that belong to other processes. PostgreSQL, migration and both browser projects therefore remain mandatory in GitHub CI on the committed head. The timing diagnosis is from source, not a reproduced trace.

Synthetic data only; no live providers, spending, real sends or production business mode. No model, prompt, provider or schema behaviour changed. The repaired commit still needs a fresh independent recorded verdict, separate technical acceptance and founder-owned merge/release. No push, merge or PR operation was performed.
