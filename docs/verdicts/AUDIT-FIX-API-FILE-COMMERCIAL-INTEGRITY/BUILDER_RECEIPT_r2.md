# BUILDER_RECEIPT_r2 — M1-16-S restructure (Sonnet builder)

Authority: "Ben, 14 Oct, coordinator chat, decision 20" (restructure into draft-shows-no-cap plus activated-shows-cap-and-findings) and decision 3 (use the real job's figures). Applies only to `apps/web/e2e/M1-16-S.spec.ts`.

## Open findings
`docs/verdicts/AUDIT-FIX-API-FILE-COMMERCIAL-INTEGRITY/` held only `BUILDER_RECEIPT.md`; no Opus/Sol verdict files, so no open reviewer findings.

## Catch-up
`git merge origin/main` (46cdade3). One conflict, `packages/db/src/index.ts` (two adjacent `export *` blocks): kept both sides. Registry merged cleanly. Lane config: added `apps/web/e2e/M1-16-S.spec.ts` and `BUILDER_RECEIPT_r2.md` to this lane's own allow list (separate commit).

## Before / after of the test
Before (one test, `openReview` on the draft v1 sample): expected the fixture's invented figures: cap `£12.00` (`integrity-frozen-accepted-cap`), `£200.00` (`integrity-value-difference`), text "You recorded acceptance, but have not started this practice job", "Check the recorded accepted value", "No activity recorded here", "A payment was reported outside this record — check the evidence", then the dismiss-as-false-positive flow.
After (two tests):
1. Draft (`openReview`): cap reads `£0.00` and "£0.00 accepted (quoted/final signals do not alter it)"; "No checks in this filter."; no `integrity-value-difference`; no `£12.00`/`£200.00`; no "Review or dismiss" button; sandbox banner count 1.
2. Activated (start demo, `openSampleFeeExample`, status "Work under way", reload): cap `£15.00`, "£1,000.00 accepted (quoted/final signals do not alter it)"; "No checks in this filter." (the real job has zero findings); no `£12.00`/`£200.00`; sandbox banner count 1; screenshot kept. Timeout 180s to 240s.
Real figures were read from running the real flow, not invented.

## Commands
| Command | Result |
|---|---|
| playwright M1-16-S.spec.ts old test (desktop) | failed as predicted (draft has no fabricated findings) |
| playwright M1-16-S.spec.ts new, mobile-360 + desktop, 1 worker, via heavy-slot | 4 passed |
| LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs | passed |
| pnpm typecheck | 7/7 tasks ok |
| pnpm lint | 7/7 tasks ok |

Browser note: Playwright 1.55.1 browsers were not installed; I ran with a temporary config (kept outside the repo, not committed) pointing at the cached chromium-1193. No download.

## Needs a ruling
- The dismiss-as-false-positive journey is no longer exercised in the browser: the real activated job yields zero findings, so there is nothing to dismiss. Dismissal remains covered by the db/api tests; a browser check needs seeded integrity facts (a separate decision).
- UI quirk: a draft with no cap renders `£0.00` (null passed to `pounds()` in `commercial-integrity.tsx`, outside this lane). The draft test asserts that `£0.00`.
- The component's first paint still shows the old fixture (cap £12.00, four findings) until the API answers; the tests wait for the real values.

Not run: full e2e, db/migration suites, build, CI. Not independently verified, not accepted.
