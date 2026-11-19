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
