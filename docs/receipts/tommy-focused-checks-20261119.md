# Tommy focused diagnostic execution — iteration 3, 19 November 2026

This branch supplies diagnostic execution infrastructure for the coordinator-reviewed Tommy integration candidate. It is not a main-branch promotion candidate and does not replace or weaken full CI release gates. This iteration selects only the existing money spec for prompt feedback on the bounded, independently reviewed zero-fee observer correction.

## Exact candidate binding

- Previous focused remote head: `c77b7074784e579ea0c4bf17c4c559a2a08ae70c`.
- Previous complete diagnostic tree: `15b22a125a3a7dec56f293d23081e54b196df9d0`.
- Previous product/test projection: `09e0b8f737d7abaaffae67c5192a213fbedbd169`.
- **Entire reviewed integration product/test tree for iteration 3: `465e9f31f70eccc6cf42467d932b78c5ac097369`.** It contains 32 changed paths against pinned main `896a701157ef71c81905da93bca4299d105c775a`.
- Local immutable product comparison snapshot: `898093507737bf63c9c522999195d7e374706d83`, whose tree is exactly the integration tree above.

Only the money spec and its component receipt differ between the two product projections. This lane imports the entire reviewed tree without editing any of its blobs, then adds exactly three diagnostic files: `.github/workflows/tommy-focused-checks.yml`, `config/lanes/tommy-focused-checks-20261119.json` and this receipt. The local snapshot records the imported baseline, not a new implementation or runtime verdict. The prior focused history is retained as a separate parent. The handoff records the final head, complete tree and exact delta from the preceding remote head.

The unchanged source guard verifies the checkout against GitHub's event SHA and prints its full tree. It removes exactly the three diagnostic files in a temporary Git index and requires the remaining product/test tree to equal the pinned iteration-3 tree. No other workflow, product file, policy, package script, Playwright configuration, global setup or database file is modified by this diagnostic iteration.

## Execution boundary

Only a push to `codex/sandbox/tommy-focused-checks-20261119` triggers this workflow. There is no main, pull-request, dispatch, schedule or reusable-workflow trigger. Permissions remain `contents: read`; checkout has `persist-credentials: false`.

Two separate Ubuntu 24.04 matrix runners execute `mobile-360` and `desktop`, with fail-fast disabled. Pins are unchanged: checkout 4.2.2, pnpm setup 4.1.0, pnpm 10.28.1, Node setup 4.0.3, Node 24.15.0 and artifact upload 4.6.2. Each runner performs the frozen install, complete production build and Chromium installation with system dependencies.

The exact existing-script command is:

```sh
pnpm test:e2e e2e/TOMMY-money-gaps.spec.ts --project="$PLAYWRIGHT_PROJECT" --workers=1 --retries=0
```

This selects support-v02 and support-v04 in each project: four executions total, one worker per isolated runner and zero retries. The 45-minute job bound, original test deadlines and all assertions supplied by the reviewed product tree remain unchanged. No skip filter, success mock, setup-data substitution, external connection, live provider or deployment is added.

The existing Playwright global setup creates and migrates real embedded PostgreSQL, bootstraps the synthetic practice environment, starts the real Final Check worker under its existing roles, and runs the production Next application. Existing teardown drains and stops the stack. The reviewed money test's no-fee observer uses only the already-provisioned local E2E admin in a strict read-only transaction, with exact identity binding; it adds no database role, privilege or financial write and makes no runtime-RLS claim.

Existing HTML reports and test-result attachments are uploaded on every outcome with `if: always()` and 14-day retention. Passing JSON observations are retained. The existing retain-on-failure trace policy is unchanged.

## Prior evidence and the bounded correction

Focused iteration 1, run `44567041104`, remains archived with four acceptance passes and four money failures. Focused iteration 2, run `44571028972`, completed with **20 passed and 2 failed**, zero skips or retries, on the previous head and projection above. Both support-v04 executions fully passed, including the actual £384 allocation commit, lost reply, authoritative read before exact replay, one saved £320 net/£64 tax effect, reload and £32 fee assertions. The four acceptance, two LATER-SAFETY-140 and twelve guided-tour executions also passed. All original raw logs, verified artifact ZIPs, compact receipts and full observations remain separate unchanged evidence.

Both iteration-2 v02 failures occurred in the first £50-absent job at a collection-view read that requires a prior fee derivation. The real response was HTTP 503 `SUCCESS_FEE_DEPENDENCY_BOUND`; the second £50-present job and paired comparison were not reached. That refusal is not interpreted as zero.

Reviewed money correction `4a9ca55b661d80a014fe3f0bef41a7b19e2133cd` replaces only that invalid read with parameterized observations of the exact job/invoice and zero fee effects under `BEGIN READ ONLY`. It retains public zero receipts and allocations, repeats receipt and fee-effect checks after reload, preserves all paired-bill/source/history assertions and leaves the complete support-v04 body unchanged. The coordinator and independent recovery reviewer inspected the exact correction. This new iteration's v02 assertions still await runtime; earlier failures are not relabelled as passes.

## Lane and local validation

The original lane-first commit is `6065b43d18192438ea9522866ab1d4dee1b9aec0`. The lane allows only the workflow and this receipt, plus its own implicitly editable registration. Imported component files and their lane registrations remain bound to the coordinator's exact product tree; this is not authority to edit them. Local lane validation compares only the three diagnostic files against the immutable product snapshot.

C1: this metadata introduces no product or user workflow and creates no browser assertion. Only configuration/schema/scope, shell syntax, exact forwarded four-execution discovery, projection, lane, whitespace and clean-worktree checks are required for this preparation; their actual results are recorded in the handoff. Discovery starts neither PostgreSQL nor the application and is not test execution.

Independent coordinator review is required before publication. Full core, database, browser, audit and release gates remain mandatory. No local browser/server/database execution, remote CI dispatch, push, merge or deployment occurs in this preparation.
