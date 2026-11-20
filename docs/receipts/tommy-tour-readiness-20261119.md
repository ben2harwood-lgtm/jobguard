# Guided-tour Step 2 saved-workspace readiness

Date: 19 November 2026. Builder receipt; no browser execution or deployment is claimed.

## Source and scope

Task branch: `codex/sandbox/tommy-tour-readiness-20261119`.
The reviewed combined candidate is remote head
`c953c427755fb6b66f6c184fb4caac958cccd33f`, tree
`cec631184ceeacf028be018d98b7dea08a578e8e`.
The isolated local baseline commit is
`c84f135100192069851e401fa274e7a36dcb5799`, with that exact tree. It is a local
equivalent-tree checkpoint, not the remote commit or a deployment.

The first task commit registers the lane. Product scope is only the Step 2
completion predicate in `voice-journey.tsx`; focused coverage lives in its
existing `voice-journey.test.tsx`. The final lane permits those two files and
this receipt. No existing browser test is changed.

## Observed failure and diagnosis

PR850 corrected run `44555458011`, source
`66df91c56c4f51d539deb54361d7a24326dcc2d1`, failed the desktop case
“hand step 3 saves customer and site before sending” while waiting for Step 3
after its single Next click. The trace records a successful quote POST and
revision 1. Next becomes actionable at approximately 640397.895 ms, but its
input snapshot at 640402.108 ms already shows “Loading your job…” and the same
Next button disabled. The click finishes at 640408 ms without advancing; later
saved reads show the same revision and Next becomes enabled again on Step 2.

The source completion check set `ownPriced`, scheduled the replacement
WorkspaceShell, then immediately returned true. That briefly advertised
readiness while the control was about to disappear. The trace does not
instrument whether native disabled-button suppression or the existing
`advance()` visibility guard rejected the click. It proves the readiness
handoff and successful quote persistence, not a failed save. The same browser
case passed in the earlier combined run at both widths; the failure depends
on when the handoff occurs relative to the click.

Exact trace timeline and snapshot references are retained off-branch at
`recovery-failure/pr850-ci/run-44555458011/walkthrough-step2-trace-review.md`
and its JSON companion.

## Behavior after the change

Saving the inline revision still records progress and starts the same
workspace handoff exactly once. Step 2 remains incomplete until the mounted
saved workspace belongs to the expected captured/prepared job, its nested
quote belongs to that same job, the quote read reports ready, and it shows a
positive saved revision. The existing Walkthrough completion gate therefore
keeps Next disabled during loading, and the existing automatic wait remains
pending through the handoff. Cancellation still ends that wait without a
second save.

There is no extra timer, retry, click, command, fallback, navigation change or
timeout increase. The existing visible-target and final advancement checks
remain. No API, database, policy, invoice, acceptance or fixture changes are
included.

## Verification

- Baseline RED: all three new focused cases failed on the exact original
  product source, before its edit. The manual completion gate returned true
  before the workspace existed; both automatic cases settled prematurely.
  Log: `recovery-failure/tour-readiness-baseline-red.log`.
- New focused GREEN: three cases passed after the correction. Coverage includes
  the old inline screen, loading, wrong workspace identity, wrong quote
  identity, unready quote, zero revision, the matching ready revision, one
  progress write, one pricing save, continued waiting and cancellation.
- Full focused verification: **171 tests passed in three files**, comprising
  VoiceJourney and the existing Walkthrough rendering/pacing suites. The
  new three are included in that total. Existing test doubles were updated to
  supply the saved workspace; the two unready-editor cases now assert that
  Step 2 is incomplete. The initial fixture failures and final passing log
  are both retained off-branch.
- Fresh final web typecheck passed.
- Playwright discovery found all **12 existing tour cases**, six in each
  configured project, `mobile-360` and `desktop`. This is discovery only.
- The frozen offline installation downloaded zero packages. Six prerequisite
  package builds restored from cache; those are not fresh build executions.
- Exact blob comparison preserved all **25 prior combined-candidate files**,
  the guided browser spec, the separate LATER browser spec, AGENTS.md and
  BUILD_PLAN.md. Evidence: `recovery-failure/tour-readiness-protected-blobs.json`.
- Lane boundary and `git diff --check` passed before the receipt commit.

## Remaining gates

The first test checks the actual VoiceJourney completion predicate used by
Next; its browser-level button behavior must still pass the unchanged real
tour cases on the final assembled candidate. The automatic tests execute the
real step action with controlled screen states, not a browser or PostgreSQL.
No local browser/DB session, CI rerun, push, merge or deployment was performed.
Independent source review and required final-candidate CI remain separate
gates. This receipt does not establish hosted-demo readiness or identify the
code currently deployed on Cloudflare.

The separate LATER test correction is not included in this worktree. There
are no migrations, new external actions, compatibility changes to contracts
or operational alerts. Existing commercial and tenant boundaries remain.
