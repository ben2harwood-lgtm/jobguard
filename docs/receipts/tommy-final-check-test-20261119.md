# LATER-SAFETY-140 completed Final Check setup correction

Date: 19 November 2026. Builder receipt; this is not a browser pass or deployment approval.

## Scope and source

Task branch: `codex/sandbox/tommy-final-check-test-20261119`.
Base: `896a701157ef71c81905da93bca4299d105c775a`.
The first commit registers the narrow lane. The only test source change is in
`apps/web/e2e/later-safety-140.spec.ts`.

The observed failure belongs to PR850 run `44555458011`, source head
`66df91c56c4f51d539deb54361d7a24326dcc2d1`, desktop job `135670207283`.
The setup's unconditional “Run the final check (practice)” click at old line 125
failed its 10-second visibility assertion because the real worker had already
completed. The retained trace has three HTTP 200 completed Final Check reads at
15:34:00.086, .087 and .239 UTC, and the screenshot shows the completed empty
result and “Load the saved final check”. Later invoice/payment assertions were
not reached in that failed execution.

Retained source evidence: `existing-final-check-race-diagnosis.json` and
`artifact-5/test-results/later-safety-140-LATER-SAF-984b4-recovery-with-both-sessions-desktop/trace.zip`
under the off-branch `recovery-failure/pr850-ci/run-44555458011/` directory.
The downloaded artifact ZIP SHA-256 is
`27cfec30d0e85d2da45b2c52c88473d60d9b14b450e4dde1e9adb25a7b29d5b7`,
matching the retained GitHub digest.

## Correction and preserved assertions

Remove the redundant Run click and keep observing the real saved completion.
Migration `0381_final_check_lock_request.sql` creates the after-lock enqueue
trigger; its replacement in `0698_final_check_post_invoice_rerun.sql` retains
that behavior. The UI intentionally renders Run only for pending or failed
checks. A completed result therefore does not need that control.

The existing 180-second saved-state poll, five-second polling interval, explicit
Load saved click and exact completed-result UI assertion remain. The overall
300-second test timeout is unchanged. Capture/scope identity, invoice refusal,
source-hash validation, immutable provenance, £1,320 invoice, receipt replay,
reversal and £700 balance assertions all remain byte-for-byte unchanged.
No completed facts are seeded, no response is mocked, and no product, API,
database, policy, worker or fixture file changes.

## Verification performed locally

- Frozen offline dependency installation passed with the committed lockfile;
  zero packages downloaded. Install scripts were disabled.
- Six prerequisite package builds restored successfully from the existing
  Turborepo cache; these are cached builds, not fresh compilation receipts.
- `pnpm --filter @jobguard/web typecheck` passed freshly.
- Playwright `--list` discovered the unchanged test in both `mobile-360` and
  `desktop`: two cases in one file. Discovery does not execute either case.
- Exact source comparison against the pinned base verified that the removed
  setup click and its explanatory comment are the only test-file difference;
  all other bytes, 55 direct expectation calls, one poll and all timeouts remain.
- Lane boundary and `git diff --check` passed before the final receipt commit.

## Remaining gate and limits

No local PostgreSQL/browser execution, CI rerun, push, merge or deployment was
performed for this correction. The affected real-server case must pass at both
configured widths on the final integrated candidate before a runtime pass is
claimed. This correction does not address the separately observed guided-tour
Step 2 workspace-handoff race or establish hosted-demo readiness.

There are no new migrations, operational alerts or external actions. Commercial
and tenant invariants are unchanged; the existing test continues to exercise
the real command and saved-read path.
