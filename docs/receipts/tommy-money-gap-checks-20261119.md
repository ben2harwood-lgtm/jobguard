# Tommy money gap checks — 19 November 2026

Base: `896a701157ef71c81905da93bca4299d105c775a`.

Branch: `codex/sandbox/tommy-money-gap-checks-20261119`.

This candidate adds one browser spec and its own lane/receipt. It is independent of PRs 847–849. It changes no product behavior, financial policy, migration, existing test, helper, timeout in an existing test, or successful application response.

## support-v02: paired £50-present and £50-absent jobs

The two runs use independent browser contexts with the current project's base URL and viewport. Both capture the same explicit six-item fictional text through the actual form. Five items are confirmed; Replace shelves is dismissed with a recorded reason. The same five source identities must survive confirmation, £900 and £1,000 quote revisions, accepted baseline, final account and invoice.

Both runs propose and approve +£125 and −£25. Only the second adds the £50 pending proposal. Real proof commands, the immutable final-account lock, the installed Final Check worker and the customer invoice command produce the final bill. No SQL fixture supplies those states.

Each bill must be £1,100 net / £1,320 gross. The pending proposal and dismissed shelf must have no billable source contribution. The comparison deliberately checks monetary totals and billable descriptions/contributions, rather than demanding equal generated IDs or full source hashes across independent jobs. Within each job, the original five identities and exact source/approval links are checked.

The pending/dismissal history, immutable first quote revision, final account and invoice are read again after reload. Receipt/recovery readers must show no received or allocated recovery principal, and the collection reader must show no fee collection/reservation. This is not evidence of real recovery or willingness to pay.

## support-v04: committed allocation followed by reply loss

A separate fresh source-created job reaches the £18,800 accepted baseline, verified proof, completed Final Check and £22,560 invoice. The test creates exactly one £320 withheld-payment case against that invoice, approves its exact practice terms, assembles eligibility/evidence and advances the existing source-backed practice pursuit.

The delivery POST must finish, the UI must show one simulated delivery and zero real actions, and the authoritative message GET must bind that saved message ID/hash/recipient to its sole practice sink entry before the receipt/feed steps begin. Exactly one £384 customer receipt is recorded with the saved invoice's issue date. Its fixed generated movement is first pending (Q remains zero and matching is refused), then settled. Settlement replay and an overlapping feed page preserve the canonical movement. Matching still allocates no principal. The existing explicit receipt-line review and approval supplies the line split.

The browser reviews £384 = £320 net + £64 tax. On the actual allocation approval, the test records the exact raw command bytes, performs `route.fetch({ maxRetries: 0 })` and requires a genuine HTTP 200. Only then does it abort the browser response. This is an allocation loss after commit, distinct from a pre-server review abort and from a lost customer-receipt reply.

The UI must focus its unknown-outcome alert and disable changes. Before any retry, the test reads the authoritative allocation GET and a read-only runtime/RLS database observer. They must bind the original command to one allocation, one landing event and one customer payment, with exact £320/£64 amounts and unchanged source identities. The public GET exposes saved allocation/source identities; the database observer provides the command-ID binding.

After **Load saved allocations** reconciles the UI, one explicit protocol replay sends the original bytes with the original command ID. The UI itself has no retry control for this already recovered success, so the protocol replay is labelled separately. A separate page-request observer remains active after the fault route is removed and must see only the original browser allocation POST across the saved-state read and reload; the deliberate APIRequestContext replay is distinct. Replay, a refused new-command attempt on the fully recovered case and reload must preserve the same complete saved view and database effects. That refusal exercises the public exhausted-claim guard, which precedes the separate payment-capacity guard. The saved line rationals must conserve exactly £384 gross and £320 net without rounding.

Finally, the existing v3 fee review and exact approval must post £32 from the persisted sources, with its statement bound to that exact recovery allocation and Q = 32000/1 pence. A subsequent review must show the same £32 cumulative fee with zero additional delta. The test does not calculate an authoritative fee or fake settlement/approval responses.

## Evidence and boundaries

Both scenarios attach detailed JSON. They also print a compact `TOMMY_MONEY_GAP_RECEIPT` containing actual job/source identities and observed invariant totals on success, because the existing workflow uploads HTML/attachments only for failed browser shards. This candidate does not change artifact retention or workflow behavior.

The database observer begins a read-only transaction with the runtime role and tenant context and selects only the test job. It does not seed, mutate, delete or repair financial rows. Its evidence is a database integrity check, not proof of the UI displaying an operation ID.

The two new scenarios run in both configured browser projects. This candidate does not implement the separate owner-defined hidden-data timing matrix or claim the complete recovered pack passes. It does not replace nontechnical builder observation or close production release gates.

## Local verification

- `pnpm install --frozen-lockfile`: passed; no lockfile change.
- `pnpm turbo run build --filter=@jobguard/web^...`: passed; all six dependency builds restored from the existing local cache.
- `pnpm --filter @jobguard/web exec playwright test --list TOMMY-money-gaps.spec.ts`: passed; four executions discovered across desktop and mobile-360.
- `pnpm --filter @jobguard/web typecheck`: passed after the final source checks.
- New-spec whitespace check: passed. The final-head lane/whole-diff check is recorded in the handoff after committing.

No PostgreSQL server, Next server or browser was started in this worktree. Test discovery is not execution. Actual browser/DB outcomes and independent review remain required before a passing runtime claim.

## Correction after PR850's first real execution

Original run: `44539501275`, remote head `af9a229b51d21f0f556bb23b0614aff8329b2044`, runner merge `8bcd61cceee09a92f8510da7e6b94c267fa8c049`, tree `9b29543c28b2e516e79a43a60a8564a4bb7ac739`.

All four new executions failed before draft creation. Each trace shows `getByLabel("Work details", { exact: true }).fill(...)` waiting until the 600-second case limit, because the actual label also contains the example guidance. The error snapshots retain the untouched example. The success receipts were absent; support-v02's attachment was `[]` and support-v04's was `{}`. These are harness failures, with no verdict on the intended money invariants. A later context-close error obscured the original operation in the console stack, but the traces preserved it.

The original evidence is retained independently under `recovery-failure/pr850-ci/run-44539501275` in the testing workspace. It includes all logs, terminal metadata, source binding, both downloaded Playwright artifacts with verified SHA256 digests, extracted traces and the exact selector diagnosis. That failed attempt remains part of the record.

This follow-up changes only this spec and receipt:

- Select the existing `#walk-source` control, assert its actual accessible-name prefix, and fill the same six-line source.
- Subscribe to the real `/api/jobs/capture` POST response before clicking **Make my draft**. Require success, validate the existing response schema, derive the top-level `jobId`, and compare the saved proposal with that response. No job identity is taken from a shell-only marker.
- Explicitly open `/jobs/{that captured jobId}#quote` after confirmation. Verify the quote editor's job ID before pricing and after invoice-related reloads; every later reload remains on the same saved job.
- Set 10-second action waits and 30-second navigation waits on every fresh context. The existing 600-second case, 45-second proof and 180-second Final Check bounds are not increased.
- Wait for the actual worker-owned completed Final Check and explicitly load its saved UI result. The trigger introduced in migration `0381` and replaced in `0698_final_check_post_invoice_rerun.sql` already queues this newly captured synthetic small-builder job when its immutable lock commits. The test no longer requires a run button that legitimately disappears when the worker finishes first. It neither restarts failed work nor treats an absent button as completion.
- Add named `test.step` phases and `TOMMY_MONEY_GAP_PHASE` start/pass/failure records, plus the captured operation identities. The final money PASS receipt still appears only after all original monetary assertions complete.
- Attempt context and attachment cleanup while preserving the primary exception. Secondary cleanup failures are recorded in annotations and phase output; a cleanup failure still fails an otherwise successful test.

All original monetary amounts, source-line comparisons, immutable history assertions, real response-loss boundary, original-byte replay, no-extra-browser-write observation, exact-rational conservation, and fee source binding remain. No product, server, migration, shared helper, old test or financial success response is changed.

### Locator and navigation audit

This is source inspection, not a new browser pass. Every locator used directly by this spec was compared with its rendered component; existing imported helpers were read without modification.

| Surface | Checked contract and source |
|---|---|
| Capture | `#walk-source`, Make/Check buttons and proposal count in `jobguard-app.tsx`; real capture response in `apps/api/src/capture/contracts.ts` |
| Scope review | Description/quantity/unit labels, source blockquotes, Accept/Dismiss/reason controls, answer fields, confirmation status and count in `review-proposal.tsx` |
| Customer and site | Save control and saved customer marker in `job-parties.tsx` |
| Saved job and quote | Same-job route, quote editor identity, pricing fields, revisions, delivery, acceptance and activation controls in `workspace-shell.tsx`, `quote-editor.tsx`, and the unchanged capture/invoice helpers |
| Variations and final bill | Form labels, exact-revision approvals, addition/omission totals, final totals and excluded-pending region in `job-variations.tsx` and `job-final-account.tsx` |
| Lock, check and invoice | Dispositions, terms, lock readiness/state, saved Final Check control/status and invoice control/totals in `final-account-lock.tsx`, `final-check-reveal.tsx`, `final-check-reveal-view.ts` and `customer-invoices.tsx` |
| Recovery, allocations and fees | Case/terms, eligibility, evidence pack, pursuit delivery, allocation comboboxes/review/unknown alert/reconciliation, and fee controls were independently source-checked by the recovery-failure agent against their components and unchanged allocation helper; no further selector mismatch was found |

The recovery and allocation panels mount on the saved workspace independently of quote details. Their hash destinations, the recovery-journey route and subsequent reloads retain the same response-derived job identity. Source-known Final Check control timing is handled by authoritative completion rather than an optional control's presence. Fresh CI execution is still required to establish the intended four money outcomes.

### Follow-up local checks

- Web TypeScript check: passed, exit 0.
- Playwright discovery: passed, exit 0; the same four executions across mobile-360 and desktop.
- Compiled ESM capture-contract import: passed, exit 0. The first discovery attempt exposed the API/core packages' ESM-only boundary; the spec now uses the existing allocation helper's native compiled-contract import pattern, rather than Playwright's CommonJS transform.
- Diff whitespace check: passed. The final committed lane check and exact head/tree are recorded in the handoff.

No browser, Next server, PostgreSQL instance, CI rerun, push, merge or deployment was started for this correction. Static checks do not establish a money-test pass.

## Correction after the first capture-bearing execution

Run `44555458011` completed with failure at `2026-11-19T16:15:23Z`, on remote head `66df91c56c4f51d539deb54361d7a24326dcc2d1`, runner merge `7cef53b43cb839acd5cc84b6795ea9b3c2a4f51a`, tree `75cafd1fe1bb1de12d6b5c1c786db121fff41bbd`. Its complete evidence is preserved separately under `recovery-failure/pr850-ci/run-44555458011`, alongside the independent original failed run.

All four new cases now created and validated the actual six-line capture successfully. Their phase logs recorded capture PASS and the real job/capture/proposal IDs. Each then stopped at the new saved-proposal equality check, before confirming the source lines or reaching any financial assertion. All four retained network traces show that the original capture response and the subsequent saved proposal response differ only in `reviewId`; both have `review: null`, with identical job, capture, proposal, source, proposal-line and scope identities. No final `TOMMY_MONEY_GAP_RECEIPT` was emitted. These results establish successful capture only, not support-v02 or support-v04 success.

The whole-response equality assumption was wrong. `CaptureApplication.view()` in `apps/api/src/capture/capture.application.ts` sets `reviewId` to `review?.reviewId ?? randomUUID()`: until a review is saved, each read supplies a legitimate provisional UUID. This correction explicitly requires `review: null` in both responses and compares every other field exactly, excluding only that provisional ID from equality. Both responses still pass the existing complete schema, which validates each `reviewId` as a UUID. The comparison continues to bind the test to the same saved job, capture, proposal, original source text and six source identities. No monetary, source-provenance, retry, fee or deadline assertion changes.

The same run passed every core and database gate, including both suites that had failed in the original attempt. Browser totals were 968 passed, four intentional cross-project skips and six failed: these four new setup assertions, the unchanged LATER-SAFETY-140 completed-Final-Check run-control race, and an unchanged guided walkthrough Step 2-to-3 failure. The latter two have separate retained traces and are not attributed to this new spec. The original run's observed failure remains only the exact Work details label mismatch; deriving identity from the capture reply and explicitly selecting the saved quote route are stronger bindings, not evidence of an additional observed marker/navigation failure.

Bounded local checks after this comparison correction passed: web TypeScript check and discovery of the same four Playwright executions. The final commit's lane and whitespace checks are recorded in the handoff. No local browser, database or server was started. No new CI run, push, merge or deployment was performed for this follow-up; a later actual execution is still needed to reach the intended money boundaries.

## Corrections from the focused execution

Focused run `44567041104` executed remote head `c60febcc2488974188a4a3367508286004774394`, full tree `a8e4d8a1f62f0749ab541cc1dc1cb1d6d01819f6`, product/test projection `21340673da19cb735b1abf34fb329fd017dbe761`. Both independent project jobs printed and verified those exact hashes. The run finished with four acceptance scenarios passed and four money scenarios failed, with no skipped case or retry. Its two raw Playwright ZIPs have verified GitHub SHA256 digests, and the passing JSON attachments, failed-case partial observations and traces are retained under `recovery-failure/focused-ci/run-44567041104`.

Both support-v02 cases now passed capture, five-item confirmation with dismissed shelf, two quote revisions, acceptance and activation. Each then failed selecting Change type with an exact label. The actual retained DOM is a wrapping label containing the select and its Extra work/Omission option text. The installed Playwright label matcher reads the label's recursive text, so exact `Change type` does not match that control. This correction uses an anchored label prefix within the same `.variation-entry` and explicitly asserts the selected addition/omission value. The description, amounts, approval requirements and paired money assertions are unchanged. Neither paired final bill was completed by that failed run.

Both support-v04 cases progressed through the real invoice, approved practice pursuit, settled receipt and line split, actual £384 allocation commit followed by lost browser reply, authoritative read before any retry, one-effect database binding and byte-identical protocol replay. The new positive request against the same fully recovered £320 case then returned the precise HTTP 409 `ALLOCATION_EXCEEDS_CLAIM`, where the test incorrectly expected `ALLOCATION_EXCEEDS_AVAILABLE`.

The public repository command constructs its artifact before calling the SQL writer. `RecoveryAllocationRepository.artifact()` calls `assertRecoveryAllocationSplit()` before its available-payment check; the split rejects £320 eligible net against zero remaining claim. This happens before the SQL writer, whose internal guard order is different. Independent trace/source review confirmed both original/replay responses were HTTP 200, both raw replay bodies were identical, the saved claim had no outstanding principal, and the saved observations had one command, allocation, landing and payment. The exact refusal expectation is corrected to `ALLOCATION_EXCEEDS_CLAIM`, with an explicit comment that this does not independently exercise the separate available-payment guard. No generic error or alternate-code allowance is introduced.

Every amount, source/history comparison, saved-state equality, database one-effect check, rational-conservation assertion, reload check, no-extra-browser-write check and fee assertion remains. The failed execution stopped before the later reload/fee assertions, so support-v04 remains FAILED for that run and emitted no final money success receipt. Local typecheck/discovery and final lane/whitespace results for this bounded follow-up are recorded in the handoff; another coordinated focused execution is still required.

## Exact zero-fee observation after focused iteration 2

Focused run `44571028972` executed remote head `c77b7074784e579ea0c4bf17c4c559a2a08ae70c`, full diagnostic tree `15b22a125a3a7dec56f293d23081e54b196df9d0`, product/test projection `09e0b8f737d7abaaffae67c5192a213fbedbd169`. It completed on 19 November at 17:05:15 UTC with **20 passed and 2 failed**, zero retries or skips. Both support-v04 cases fully passed through exact replay, saved-state/reload checks and the source-bound £32 fee posting, producing their final compact receipts. The four acceptance, two LATER-SAFETY-140 and twelve guided-tour executions also passed. Those results and both SHA-verified raw artifacts are preserved independently under `recovery-failure/focused-ci/run-44571028972`.

The two failures were support-v02's first (£50-absent) job. Each completed its real £1,320 invoice, verified the exact approved additions/omissions and dismissed-source exclusion, then read empty customer receipts and zero recovery allocations. The next test read of `/success-fees/collection` returned HTTP 503 with exact `SUCCESS_FEE_DEPENDENCY_BOUND`; the £50-present second job and final paired comparison were not reached.

The failed expectation used a view outside its valid lifecycle. Migration `0509_simulation_fee_collection.sql` calls `platform_fee_statement_sources` for `catch_review_available`, while its replacement in `0514_withheld_payment_statement_source.sql` requires an existing `success_fee_derivation`. There is no approved fee derivation in this unpaid-job scenario. The source and both retained HTTP traces explain the refusal. A 503 is never accepted as zero, and the test must not create a fee to make that reader available.

The coordinator and independent contract reviewer approved a bounded read-only observation instead. The helper uses the existing isolated PostgreSQL E2E admin connection provisioned in `e2e/global-setup.ts` and already used by `ENT-11a.spec.ts`. It starts `BEGIN READ ONLY`, verifies `transaction_read_only = on`, and requires the exact expected tenant, job and issued invoice to exist together. Only then does one parameterized query require zero rows, scoped to that tenant and job, in all six effect tables: `success_fee_derivation`, `success_fee_journal`, `platform_fee_statement`, `platform_fee_attempt`, `platform_fee_attempt_event` and `platform_fee_collection_command`. It rolls back the read-only transaction and closes the connection while preserving any primary failure.

This observer proves persisted absence of fee postings, statements, attempts, events and collection commands for the specific synthetic job. It does not prove runtime SELECT permission or RLS isolation: the existing collection tables deliberately deny direct runtime reads, and their grants remain unchanged. No new role, grant, setup write, financial posting or product path is introduced. The observer is fixed to the unchanged local isolated E2E host, port and database and accepts no external connection URL.

The public empty-receipt and zero-eligible-principal/allocation assertions stay. After reloading the same saved job, the test additionally confirms that its public receipt list is still empty with zero eligible principal and that the same exact read-only fee-effect observation remains zero. Both observations are included in the final paired attachment. All original bill totals, approved/pending distinctions, source identities, dismissal reason, immutable quotes, saved account/invoice comparisons, fresh-context isolation and deadlines are unchanged. The full support-v04 case is unchanged.

Remaining support-v02 reload and pending-line assertions were checked against the actual saved surfaces and repositories: the excluded-pending region and amount formatting match, final-account reads preserve their saved revision and approved lines, the customer invoice is a persisted projection, and the reload does not issue a new variation, invoice or receipt. This is source inspection, not a runtime pass of the still-unreached paired comparison.

Typecheck, four-execution discovery, lane and whitespace results for this local correction are recorded in the handoff. No local PostgreSQL, Next or browser execution, remote dispatch, push, merge or deployment is performed by this correction. Actual execution of the revised support-v02 remains required.
