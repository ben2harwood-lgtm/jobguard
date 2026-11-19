# Tommy focused diagnostic execution — iteration 2, 19 November 2026

This branch supplies execution infrastructure for the reviewed Tommy integration candidate. It is not a main-branch promotion candidate and does not replace or weaken any full CI release gate. The coordinator requested this second iteration after reviewing the exact product and test corrections.

## Exact candidate binding

- Previous focused remote head: `c60febcc2488974188a4a3367508286004774394`.
- Previous complete diagnostic tree: `a8e4d8a1f62f0749ab541cc1dc1cb1d6d01819f6`.
- **Entire reviewed integration product/test tree for iteration 2: `09e0b8f737d7abaaffae67c5192a213fbedbd169`.** This is the coordinator's staged integration tree, containing 32 changed paths against pinned main `896a701157ef71c81905da93bca4299d105c775a`.
- Local immutable comparison snapshot: `03b3dbabbc07496080ffbd38f5b96ae7377c724e`, whose tree is exactly that product/test tree. This records the imported baseline; it is not a new implementation, acceptance verdict or runtime result.

The complete candidate consists of every blob in that integration tree plus exactly three diagnostic files: `.github/workflows/tommy-focused-checks.yml`, `config/lanes/tommy-focused-checks-20261119.json` and this receipt. No product, test, component receipt, policy, existing workflow, package script, Playwright configuration, global setup or database file is edited by this iteration. The complete delta from the preceding remote head is recorded in the handoff for review.

The workflow verifies its checkout against GitHub's event SHA, prints its complete tree, then removes exactly the three diagnostic files in a temporary Git index. The resulting product/test tree must equal the pinned integration tree above. The final commit and complete diagnostic tree are recorded outside this self-referential receipt in the handoff.

## Execution boundary

Only a push to `codex/sandbox/tommy-focused-checks-20261119` triggers this workflow. There is no pull-request, main, dispatch, reusable-workflow or scheduled trigger. Permissions are `contents: read`; checkout has `persist-credentials: false`.

Two independent Ubuntu 24.04 matrix jobs run `mobile-360` and `desktop`, with fail-fast disabled. Existing pins remain checkout 4.2.2, pnpm setup 4.1.0, pnpm 10.28.1, Node setup 4.0.3, Node 24.15.0 and artifact upload 4.6.2. Each isolated runner performs the frozen install, complete production build and Chromium installation with system dependencies.

The command uses the existing root `pnpm test:e2e` forwarding chain:

```sh
pnpm test:e2e e2e/TOMMY-money-gaps.spec.ts e2e/TOMMY-acceptance-recovery.spec.ts e2e/later-safety-140.spec.ts e2e/real-tour-one-saved-job-now.spec.ts --project="$PLAYWRIGHT_PROJECT" --workers=1 --retries=0
```

Only those four existing spec files are selected. There is one worker per runner, zero retries and the unchanged 45-minute job bound. Original test deadlines and assertions remain as supplied in the reviewed product tree. No skip filter, success mock, fixture substitution, credential, live provider, external database override or deployment is added.

The unchanged real Playwright setup creates and migrates embedded PostgreSQL, bootstraps the synthetic practice environment, starts the real practice Final Check worker under its existing roles, and runs the production Next application. Existing teardown drains and stops the stack. Separate runner jobs preserve port and session isolation.

The existing HTML report and test-results paths are uploaded with `if: always()` and retained for 14 days, including passing JSON attachments. The original retain-on-failure trace policy is unchanged.

## Prior results remain unchanged

Focused run `44567041104` on the previous head completed with four acceptance passes and four money failures, zero retries and no money success receipt. It is preserved separately with its raw logs, verified artifacts, full attachments and exact source binding.

That run exposed two bounded harness issues: the exact variation-label matcher included option text, and the public exhausted-claim guard returned the precise claim refusal before the separate payment-capacity check. The reviewed integration includes correction `176b9bb03ebb6a340abfed38a0d9108cd9e62c09`: an anchored label matcher plus a selected-value assertion, and exact `ALLOCATION_EXCEEDS_CLAIM` with an explicit statement that this does not independently cover the available-payment guard. All money, replay, history, database, reload and fee assertions remain. The integration also includes the independently reviewed Final Check setup and guided-tour readiness corrections; this workflow adds their existing specs to obtain direct runtime evidence.

The previous money allocation cases reached actual commit, lost reply, authoritative reconciliation and exact replay before failing. Their later post-refusal reload and fee assertions did not execute. The paired £50 comparison did not execute. Neither partial observation is promoted to a passed case, and this iteration's assertions still await runtime.

## Lane, validation and remaining gates

The original lane-first commit is `6065b43d18192438ea9522866ab1d4dee1b9aec0`. This iteration narrows the lane's allowed paths to the workflow and receipt, with its own registration implicitly editable. The coordinator-reviewed product baseline is an exact import, not a grant to edit the other components or their lanes. Local lane validation compares only the three diagnostic additions against the immutable product snapshot. The prior focused history is retained as a separate parent.

C1: this infrastructure introduces no product or user workflow and invents no browser assertions. The four reviewed existing specs supply its executable targets. Schema and scope validation, shell syntax, exact forwarded test discovery, lane validation, whitespace checks and the final projection equality are recorded with their actual results in the handoff. Local discovery does not start the application or database and is not a test execution.

Independent coordinator review of the complete final tree is required before publication. Core, DB and full-browser CI requirements remain unchanged; focused results cannot substitute for them. No local browser execution, remote CI dispatch, push, merge or deployment is part of this preparation.
