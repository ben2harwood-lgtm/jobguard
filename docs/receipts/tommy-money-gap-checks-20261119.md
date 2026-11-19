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

After **Load saved allocations** reconciles the UI, one explicit protocol replay sends the original bytes with the original command ID. The UI itself has no retry control for this already recovered success, so the protocol replay is labelled separately. A separate page-request observer remains active after the fault route is removed and must see only the original browser allocation POST across the saved-state read and reload; the deliberate APIRequestContext replay is distinct. Replay, a refused attempt to reuse exhausted receipt capacity and reload must preserve the same complete saved view and database effects. The saved line rationals must conserve exactly £384 gross and £320 net without rounding.

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
