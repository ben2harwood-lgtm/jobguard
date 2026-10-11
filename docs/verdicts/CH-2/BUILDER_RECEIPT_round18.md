# CH-2 builder receipt — round 18, save practice parties in SBOX-SESSION-1

PR #97; branch `codex/sandbox/ch-2`; working tree based on `535e588afdc6bd9be9b6820da8062380bbea652c` (main `0264158ffa8fbe61f7c896be9a9c5aa210f07af0`). Responds to the independent Claude Opus verdict REPAIR at `535e588` (issue comment 6048537446). That verdict confirmed round 17 (all `@jobguard/db` suites pass in CI: 52 files, 495 tests) and raised one blocker: CI run 37697375872, browser step, 236 passed and 2 failed. Both failures are `e2e/SBOX-SESSION-1.spec.ts:5:5` (`[mobile-360]` and `[desktop]`), stopping at `helpers/capture-journey.ts:55` with the "Preview immutable quote" button still disabled.

This is a builder run receipt, not independent review or technical acceptance. CI must prove both browser projects on the new head.

## Cause and change

CH-2's version of `SBOX-SESSION-1.spec.ts` captures a second job through the API, opens `/jobs/${jobId}`, accepts its lines, confirms the scope, prices it and calls `startWatchdogJob`, without saving a customer and site. CH-3a's quote screen (`apps/web/app/ui/quote-editor.tsx:65`, `disabled={!partiesReady||…}`) will not preview until a current customer and site exist. Every other path saves them through `openReview` (`helpers/capture-journey.ts:30-31`).

Test-only fix: two lines added to `apps/web/e2e/SBOX-SESSION-1.spec.ts` directly after the "Check the work items" heading assertion (line 49) and before the line-accept loop. They are copied from `openReview`, with the same locators, text and default timeout:

```
await page.getByRole("button",{name:"Save customer and site",exact:true}).click();
await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
```

Nothing else changed: not the first unconfirmed job or its ownership, 404 and 401 assertions, not `startWatchdogJob`, no timeout, no product code, no migration.

## Executed checks

Node `v24.17.0`, pnpm `10.28.1`.

| Command | Exit | Actual result |
| --- | ---: | --- |
| `pnpm typecheck` | 0 | 7 successful, 7 total (6 cached, web re-run). |
| `pnpm --filter @jobguard/web exec playwright test --list e2e/SBOX-SESSION-1.spec.ts` | 0 | 2 tests in 1 file: `[mobile-360]` and `[desktop]`. |
| `pnpm --filter @jobguard/web test:e2e e2e/SBOX-SESSION-1.spec.ts` | 1 | Turbo build of `@jobguard/db...` succeeded. Both cases then failed at browser launch: `chromium_headless_shell-1193` is not installed in `~/Library/Caches/ms-playwright` (Playwright 1.55.1 needs it). No test step ran. |
| `pnpm --filter @jobguard/web exec playwright test e2e/SBOX-SESSION-1.spec.ts --headed --workers=1` (one attempt with the full Chromium that is cached) | 1 | Both cases failed at browser launch: the cached `chromium-1193` install is incomplete (`Chromium Framework` is missing; process aborts on `dlopen`). No test step ran. |

The spec was therefore not run to completion on this Mac. No browser was downloaded (not authorised, and disk is low), no config was changed and the run was not repeated. The fix is unproven locally; CI run on the new head must show `SBOX-SESSION-1` passing at both sizes, including its ownership and evidence-pack steps after line 59, which have not run on this head.

## Not done

Nothing pushed, merged, deleted or opened. No other worktree or the main checkout was touched. `pnpm install` was not run. `LANE_BASE_REF=origin/main pnpm lint`, the full unit suites, `pnpm build` and the full browser suite were not run in this round. No independent review is claimed. The lane lint result against the new HEAD is in the final report.
